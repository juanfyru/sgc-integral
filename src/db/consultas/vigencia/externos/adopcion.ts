/** La adopción firmada de una edición (spec 13C §8.3): el cuarto camino que publica. */
import { createHash } from "node:crypto";
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { aplicarPublicacion, registrarAuditoria } from "@/db/consultas/admin";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { crearAcusesAlPublicar } from "@/db/consultas/distribucion/acuses";
import { pedirSocializacion } from "@/db/consultas/distribucion/jornadas";
import { registrarFirma } from "@/db/consultas/firmas";
import { ErrorFirma, enTransaccion, type OpcionesFlujo, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { verificarParaFirmar, type CredencialesFirma } from "@/lib/firma";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { ErrorVigencia } from "@/lib/vigencia/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import {
  NO_BORRADOR,
  PRINCIPAL_CAMBIO,
  RETIRADO,
  SIN_RESUMEN,
  bloquear,
  documentoDeVersion,
  exigirVerificacion,
  gestionable,
  recortado,
  type AdopcionValidada,
} from "./comun";
import { NO_EXISTE, conRechazoPorHuella, exigirHuellaRegistrada } from "../comun";
import { registrarDecision, revisionAbiertaBloqueada, type RevisionBloqueada } from "../revision-anual/registro";

/**
 * Lo que debe cumplirse para adoptar una edición, sin escribir nada (F13A-R4): un borrador de un externo que la
 * persona gestiona, no retirado, con su edición escrita y, si ya hay una vigente, con «qué cambió».
 */
export async function validarAdopcion(sql: Cliente, sesion: SesionFlujo, versionId: number): Promise<AdopcionValidada> {
  const documentoId = await documentoDeVersion(sql, versionId);
  if (documentoId === null) throw new ErrorVigencia(NO_EXISTE);
  const s = await gestionable(sql, sesion, documentoId);
  const [v] = await sql`SELECT v.numero, v.estado, v.edicion_externa, v.resumen_cambios, ex.entidad_emisora, a.ruta, a.hash_sha256
    FROM documento_versiones v
    JOIN externos ex ON ex.documento_id = v.documento_id
    LEFT JOIN archivos a ON a.version_id = v.id AND a.rol = 'principal'
    WHERE v.id = ${versionId}`;
  if (v.estado !== "borrador") throw new ErrorVigencia(NO_BORRADOR);
  if (s.retirado) throw new ErrorVigencia(RETIRADO);
  const edicion = recortado(v.edicion_externa as string | null);
  if (!edicion) throw new ErrorVigencia("Escriba la edición que se adopta");
  const esPrimera = s.vigente === null;
  if (!esPrimera && !recortado(v.resumen_cambios as string | null)) throw new ErrorVigencia(SIN_RESUMEN);
  return {
    documentoId,
    codigo: s.codigo,
    numero: v.numero as number,
    procesoId: s.procesoId,
    esPrimera,
    hashPrincipal: (v.hash_sha256 as string | null) ?? null,
    ruta: (v.ruta as string | null) ?? null,
    edicion,
    entidadEmisora: v.entidad_emisora as string,
  };
}

/**
 * Lo que la revisión anual hace con una adopción hecha durante su campaña (spec 13C §9.3): «actualizar» con la
 * verificación «hay una edición nueva» que la pidió, o «revisado recientemente» si no venía de una, y la fila pasa a la
 * versión adoptada. La llama `adoptarEdicion` dentro de su transacción, después de publicar, con la revisión abierta que
 * ya leyó (`revision`): un externo que entró a la foto con esa publicación ya tiene su «revisado recientemente»
 * (`alPublicarDuranteRevision`) y aquí no cambia. Sin revisión abierta no hace nada.
 */
export async function alAdoptar(
  tx: TransactionSql,
  d: { documentoId: number; versionId: number; usuarioId: number; verificacionId: number | null; ahora: Date; revision?: RevisionBloqueada | null },
): Promise<void> {
  await registrarDecision(
    tx,
    {
      documentoId: d.documentoId,
      versionId: d.versionId,
      decision: d.verificacionId === null ? "reciente" : "actualizar",
      usuarioId: d.usuarioId,
      verificacionId: d.verificacionId ?? undefined,
      moverVersion: true,
      ahora: d.ahora,
    },
    d.revision,
  );
}

/**
 * La huella que vio quien firma (la que mostró el diálogo; null si no había principal) es la del principal de ahora:
 * si lo cambiaron después, o si apareció o desapareció, no se firma. `undefined`: quien llama no mostró un diálogo.
 */
function exigirPrincipalVisto(v: AdopcionValidada, huellaMostrada: string | null | undefined): void {
  if (huellaMostrada !== undefined && huellaMostrada !== v.hashPrincipal) throw new ErrorVigencia(PRINCIPAL_CAMBIO);
}

/** Sin archivo principal, la firma guarda la huella de los datos de control de la edición (spec 13C §8.3). */
function huellaDeDatos(codigo: string, edicion: string, emisor: string): string {
  return createHash("sha256").update(`${codigo}|${edicion}|${emisor}`).digest("hex");
}

/**
 * Adopta la edición en borrador (spec 13C §8.3): la firma «Adoptó» sin trámite y la publicación por
 * `aplicarPublicacion(…, "externo", …)`, que deja obsoleta la anterior y recoge sus copias. Una edición nueva pide
 * acuse a la audiencia; la primera, solo si se marca. La clave se verifica fuera de la transacción y todo lo que
 * puede fallar se valida antes y otra vez dentro, con el documento y la versión bloqueados (F13A-R4). `huellaMostrada`
 * es la del principal que vio quien firma (null si no había): si cambió, se rechaza antes de pedir la clave y otra vez
 * bajo el candado, sin escribir la firma.
 */
export async function adoptarEdicion(
  sesion: SesionFlujo,
  d: {
    versionId: number;
    pedirAcuses: boolean;
    requiereSocializacion: boolean;
    credenciales: CredencialesFirma;
    verificacionId?: number;
    huellaMostrada?: string | null;
  },
  opciones: OpcionesFlujo = {},
): Promise<{ documentoId: number; numero: number; obsoletas: number[]; acuses: number }> {
  const sql = opciones.sql ?? obtenerSql();
  const ahora = opciones.ahora ?? new Date();
  const contexto = opciones.contexto ?? { ip: null, userAgent: null };
  const zona = zonaHoraria();
  const verificacionId = d.verificacionId ?? null;

  const previa = await validarAdopcion(sql, sesion, d.versionId);
  exigirPrincipalVisto(previa, d.huellaMostrada);
  if (verificacionId !== null) await exigirVerificacion(sql, previa.documentoId, verificacionId, "edicion_nueva");
  const verificar = opciones.verificar ?? verificarParaFirmar;
  const r = await verificar(sesion, d.credenciales, contexto, ahora);
  if (!r.ok) throw new ErrorFirma(r.mensaje, r.sesionCerrada, r.bloqueada);

  const rechazo = { usuarioId: sesion.usuarioId, accion: "adopcion_rechazada", documentoId: previa.documentoId };
  return conRechazoPorHuella(sql, rechazo, () =>
    enTransaccion(sql, async (tx) => {
      await bloquear(tx, previa.documentoId);
      await tx`SELECT id FROM documento_versiones WHERE id = ${d.versionId} FOR UPDATE`;
      const v = await validarAdopcion(tx, sesion, d.versionId);
      exigirPrincipalVisto(v, d.huellaMostrada);
      if (verificacionId !== null) await exigirVerificacion(tx, v.documentoId, verificacionId, "edicion_nueva");
      const huella = v.ruta
        ? await exigirHuellaRegistrada(v.ruta, v.hashPrincipal, { codigo: v.codigo, numero: v.numero })
        : huellaDeDatos(v.codigo, v.edicion, v.entidadEmisora);

      // Lo que leen el CHECK de la vigente, la ficha y el Maestro: aprobó quien adopta, hoy; elaboró y revisó, nadie.
      const [quien] = await tx`SELECT u.nombre, c.nombre AS cargo FROM usuarios u LEFT JOIN cargos c ON c.id = u.cargo_id
        WHERE u.id = ${sesion.usuarioId}`;
      const aprobo = quien.cargo ? `${quien.nombre} — ${quien.cargo}` : (quien.nombre as string);
      await tx`UPDATE documento_versiones SET aprobo = ${aprobo}, fecha_aprobacion = ${fechaEnZona(ahora, zona)},
          elaboro = NULL, reviso = NULL, fecha_elaboracion = NULL, fecha_revision = NULL
        WHERE id = ${d.versionId}`;
      await registrarFirma(tx, {
        tramiteId: null,
        versionId: d.versionId,
        usuarioId: sesion.usuarioId,
        firma: "adopto",
        ronda: 0,
        hashSha256: huella,
        metodo: r.metodo,
        contexto,
        ahora,
      });
      // La revisión abierta se lee una vez y sirve a la publicación y a la decisión de la adopción.
      const abierta = await revisionAbiertaBloqueada(tx);
      const { documentoId, numero, obsoletas } = await aplicarPublicacion(tx, d.versionId, "externo", sesion.usuarioId, ahora, abierta);
      // Quien adopta ya leyó la edición: su acuse nace confirmado por la firma.
      const acuses = !v.esPrimera || d.pedirAcuses ? (await crearAcusesAlPublicar(tx, d.versionId, ahora, [sesion.usuarioId])).creados : 0;
      if (d.requiereSocializacion) {
        const config = await obtenerConfigDocumental({ sql: tx });
        await pedirSocializacion(tx, { versionId: d.versionId, procesoId: v.procesoId, plazoDias: config.distribucion.plazoSocializacionDias, ahora });
      }
      await tx`UPDATE externos SET edicion_nueva_pendiente_desde = NULL, aviso_vencido_en = NULL, escalado_en = NULL
        WHERE documento_id = ${documentoId}`;
      await alAdoptar(tx, { documentoId, versionId: d.versionId, usuarioId: sesion.usuarioId, verificacionId, ahora, revision: abierta });
      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: "externo_adoptado",
        entidad: "documento",
        entidadId: documentoId,
        detalle: { codigo: v.codigo, numero, edicion: v.edicion, obsoletas, acuses, verificacionId },
      });
      return { documentoId, numero, obsoletas, acuses };
    }),
  );
}
