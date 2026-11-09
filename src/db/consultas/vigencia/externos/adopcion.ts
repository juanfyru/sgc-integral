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
import { huellaDeArchivo } from "@/lib/huella";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { ErrorVigencia } from "@/lib/vigencia/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import {
  NO_BORRADOR,
  RETIRADO,
  SIN_RESUMEN,
  bloquear,
  documentoDeVersion,
  exigirVerificacion,
  gestionable,
  recortado,
  type AdopcionValidada,
} from "./comun";
import { NO_COINCIDE, NO_EXISTE } from "../ratificaciones";

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
 * Lo que la revisión anual hace con una adopción hecha durante su campaña. La llama `adoptarEdicion` dentro de su
 * transacción, después de publicar; la Tarea 10 la llena con la decisión de la campaña.
 */
export async function alAdoptar(
  tx: TransactionSql,
  d: { documentoId: number; versionId: number; usuarioId: number; verificacionId: number | null; ahora: Date },
): Promise<void> {
  // Sin campaña que registrar todavía: la decisión automática llega con la revisión anual.
  void tx;
  void d;
}

/** Sin archivo principal, la firma guarda la huella de los datos de control de la edición (spec 13C §8.3). */
function huellaDeDatos(codigo: string, edicion: string, emisor: string): string {
  return createHash("sha256").update(`${codigo}|${edicion}|${emisor}`).digest("hex");
}

/** Un archivo que no se puede leer tampoco es el registrado: la huella en disco queda nula. */
async function huellaEnDisco(ruta: string): Promise<string | null> {
  try {
    return await huellaDeArchivo(ruta);
  } catch (err) {
    console.error("No se pudo leer el archivo principal al adoptar:", err);
    return null;
  }
}

/** El rechazo por la huella sale de la transacción con lo que la bitácora debe guardar. */
class HuellaDistinta extends Error {
  constructor(readonly detalle: { codigo: string; numero: number; huellaRegistrada: string | null; huellaEnDisco: string | null }) {
    super(NO_COINCIDE);
  }
}

/**
 * Adopta la edición en borrador (spec 13C §8.3): la firma «Adoptó» sin trámite y la publicación por
 * `aplicarPublicacion(…, "externo", …)`, que deja obsoleta la anterior y recoge sus copias. Una edición nueva pide
 * acuse a la audiencia; la primera, solo si se marca. La clave se verifica fuera de la transacción y todo lo que
 * puede fallar se valida antes y otra vez dentro, con el documento y la versión bloqueados (F13A-R4).
 */
export async function adoptarEdicion(
  sesion: SesionFlujo,
  d: { versionId: number; pedirAcuses: boolean; requiereSocializacion: boolean; credenciales: CredencialesFirma; verificacionId?: number },
  opciones: OpcionesFlujo = {},
): Promise<{ documentoId: number; numero: number; obsoletas: number[]; acuses: number }> {
  const sql = opciones.sql ?? obtenerSql();
  const ahora = opciones.ahora ?? new Date();
  const contexto = opciones.contexto ?? { ip: null, userAgent: null };
  const zona = zonaHoraria();
  const verificacionId = d.verificacionId ?? null;

  const previa = await validarAdopcion(sql, sesion, d.versionId);
  if (verificacionId !== null) await exigirVerificacion(sql, previa.documentoId, verificacionId, "edicion_nueva");
  const verificar = opciones.verificar ?? verificarParaFirmar;
  const r = await verificar(sesion, d.credenciales, contexto, ahora);
  if (!r.ok) throw new ErrorFirma(r.mensaje, r.sesionCerrada, r.bloqueada);

  try {
    return await enTransaccion(sql, async (tx) => {
      await bloquear(tx, previa.documentoId);
      await tx`SELECT id FROM documento_versiones WHERE id = ${d.versionId} FOR UPDATE`;
      const v = await validarAdopcion(tx, sesion, d.versionId);
      if (verificacionId !== null) await exigirVerificacion(tx, v.documentoId, verificacionId, "edicion_nueva");
      let huella: string;
      if (v.ruta) {
        const enDisco = await huellaEnDisco(v.ruta);
        if (enDisco === null || enDisco !== v.hashPrincipal) {
          throw new HuellaDistinta({ codigo: v.codigo, numero: v.numero, huellaRegistrada: v.hashPrincipal, huellaEnDisco: enDisco });
        }
        huella = enDisco;
      } else {
        huella = huellaDeDatos(v.codigo, v.edicion, v.entidadEmisora);
      }

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
      const { documentoId, numero, obsoletas } = await aplicarPublicacion(tx, d.versionId, "externo", sesion.usuarioId, ahora);
      // Quien adopta ya leyó la edición: su acuse nace confirmado por la firma.
      const acuses = !v.esPrimera || d.pedirAcuses ? (await crearAcusesAlPublicar(tx, d.versionId, ahora, [sesion.usuarioId])).creados : 0;
      if (d.requiereSocializacion) {
        const config = await obtenerConfigDocumental({ sql: tx });
        await pedirSocializacion(tx, { versionId: d.versionId, procesoId: v.procesoId, plazoDias: config.distribucion.plazoSocializacionDias, ahora });
      }
      await tx`UPDATE externos SET edicion_nueva_pendiente_desde = NULL, aviso_vencido_en = NULL, escalado_en = NULL
        WHERE documento_id = ${documentoId}`;
      await alAdoptar(tx, { documentoId, versionId: d.versionId, usuarioId: sesion.usuarioId, verificacionId, ahora });
      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: "externo_adoptado",
        entidad: "documento",
        entidadId: documentoId,
        detalle: { codigo: v.codigo, numero, edicion: v.edicion, obsoletas, acuses, verificacionId },
      });
      return { documentoId, numero, obsoletas, acuses };
    });
  } catch (err) {
    if (!(err instanceof HuellaDistinta)) throw err;
    // Fuera de la transacción revertida: el rechazo queda en la bitácora.
    await registrarAuditoria(sql, {
      usuarioId: sesion.usuarioId,
      accion: "adopcion_rechazada",
      entidad: "documento",
      entidadId: previa.documentoId,
      detalle: err.detalle,
    });
    throw new ErrorVigencia(NO_COINCIDE);
  }
}
