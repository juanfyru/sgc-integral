/** El alta de un externo, sus datos de control y la edición en borrador (spec 13C §8.2 y §8.3). */
import type { TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { crearDocumentoEn, registrarAuditoria, type AsociacionEntrada } from "@/db/consultas/admin";
import { exigirFormatoDeCodigo, sugerirCodigo } from "@/db/consultas/codigos";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { alcanceProcesos, enAlcance } from "@/lib/alcance";
import { requerirPermiso } from "@/lib/permisos";
import { ErrorVigencia } from "@/lib/vigencia/tipos";
import {
  EDICION_PENDIENTE,
  NO_BORRADOR,
  RETIRADO,
  SIN_TIPO,
  acotado,
  bloquear,
  documentoDeVersion,
  exigirResponsable,
  gestionable,
  nombreDeNorma,
  normaEnlazada,
  recortado,
  validarControl,
  validarEdicion,
  validarResumen,
  type DatosControlExterno,
  type DatosEdicion,
  type DatosExterno,
  type Opciones,
  type Situacion,
} from "./comun";
import { NO_EXISTE } from "../comun";

const FUERA_DE_ALCANCE = "Solo puede registrar externos de los procesos que lidera";

/** El principal y el «también aplica», sin repetir: el propietario es el subproceso si se eligió uno. */
function asociacionesDe(d: Pick<DatosExterno, "procesoId" | "subprocesoId" | "otrosProcesos">): AsociacionEntrada[] {
  const principal: AsociacionEntrada =
    d.subprocesoId !== null ? { subprocesoId: d.subprocesoId, esPrincipal: true } : { procesoId: d.procesoId, esPrincipal: true };
  const clave = (a: AsociacionEntrada) => (a.procesoId !== undefined ? `p:${a.procesoId}` : `s:${a.subprocesoId}`);
  const vistas = new Set([clave(principal)]);
  const otras: AsociacionEntrada[] = [];
  for (const a of d.otrosProcesos) {
    const otra: AsociacionEntrada = a.procesoId !== undefined ? { procesoId: a.procesoId, esPrincipal: false } : { subprocesoId: a.subprocesoId, esPrincipal: false };
    if (vistas.has(clave(otra))) continue;
    vistas.add(clave(otra));
    otras.push(otra);
  }
  return [principal, ...otras];
}

// ── Alta y datos de control ──

/**
 * Registra un externo (spec 13C §8.3): el documento de tipo «Documento externo» con el código siguiente de su
 * proceso, su fila de control y la primera edición en borrador. No depende de «Publicación directa»: el alta de
 * externos no se cierra con la carga inicial.
 */
export async function registrarExterno(
  sesion: SesionFlujo,
  d: DatosExterno,
  opciones?: Opciones,
): Promise<{ documentoId: number; versionId: number; codigo: string }> {
  requerirPermiso(sesion, "externos.gestionar");
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const titulo = acotado(d.titulo, "El título", 3, 200);
  const control = validarControl(d);
  const edicion = validarEdicion(d);

  return enTransaccion(sql, async (tx) => {
    if (!enAlcance(await alcanceProcesos(sesion, { sql: tx }), d.procesoId)) throw new ErrorVigencia(FUERA_DE_ALCANCE);
    const [tipo] = await tx`SELECT id FROM tipos_documento WHERE sigla = 'DE' AND activo`;
    if (!tipo) throw new ErrorVigencia(SIN_TIPO);
    const [proceso] = await tx`SELECT 1 FROM procesos WHERE id = ${d.procesoId} AND activo`;
    if (!proceso) throw new ErrorVigencia("El proceso no existe o está inactivo");
    if (d.subprocesoId !== null) {
      const [sub] = await tx`SELECT 1 FROM subprocesos WHERE id = ${d.subprocesoId} AND proceso_id = ${d.procesoId}`;
      if (!sub) throw new ErrorVigencia("El subproceso no es del proceso propietario");
    }
    const destino = { procesoId: d.procesoId, tipoDocumentoId: Number(tipo.id) };
    const codigo = await sugerirCodigo(destino, { sql: tx });
    if (!codigo) throw new ErrorVigencia("Configure el formato del código antes de registrar documentos externos");
    await exigirFormatoDeCodigo(tx, codigo, destino);

    let creado: { documentoId: number; versionId: number };
    try {
      // En un savepoint: tras un 23505 la transacción no admite más consultas.
      creado = (await tx.savepoint((s) =>
        crearDocumentoEn(
          s,
          {
            codigo,
            titulo,
            tipoId: Number(tipo.id),
            descripcion: recortado(d.descripcion),
            palabrasClave: recortado(d.palabrasClave),
            asociaciones: asociacionesDe(d),
            nivelAcceso: d.nivelAcceso,
          },
          sesion.usuarioId,
        ),
      )) as { documentoId: number; versionId: number };
    } catch (err) {
      if ((err as { constraint_name?: string }).constraint_name !== "documentos_codigo_unique") throw err;
      throw new ErrorVigencia(`Otro documento acaba de tomar el código ${codigo}: vuelva a intentarlo`);
    }
    const { documentoId, versionId } = creado;
    await tx`UPDATE documentos SET origen = 'externo' WHERE id = ${documentoId}`;
    await tx`INSERT INTO externos (documento_id, entidad_emisora, titulo_original, fuente_oficial, responsable_id, verificacion_meses, actualizado_en)
      VALUES (${documentoId}, ${control.entidadEmisora}, ${control.tituloOriginal}, ${control.fuenteOficial}, ${control.responsableId},
              ${control.verificacionMeses}, ${ahora})`;
    await tx`UPDATE documento_versiones SET edicion_externa = ${edicion.edicion}, fecha_edicion_externa = ${edicion.fechaEdicion}
      WHERE id = ${versionId}`;
    // Después de las asociaciones: un restringido lo ve quien está en sus procesos.
    const responsable = await exigirResponsable(tx, control.responsableId, documentoId);
    let norma: string | null = null;
    if (control.normaId !== null) {
      norma = await nombreDeNorma(tx, control.normaId);
      await tx`INSERT INTO norma_documentos (norma_id, documento_id, creado_por) VALUES (${control.normaId}, ${documentoId}, ${sesion.usuarioId})`;
    }
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "externo_registrado",
      entidad: "documento",
      entidadId: documentoId,
      detalle: { codigo, titulo, entidadEmisora: control.entidadEmisora, edicion: edicion.edicion, responsable, norma },
    });
    return { documentoId, versionId, codigo };
  });
}

/**
 * Los datos de control (spec 13C §8.3): edición de catálogo, auditada con lo que cambió antes y después. Cambiar el
 * responsable o la periodicidad cambia a quién y cuándo se avisa: las marcas del aviso vuelven a empezar.
 */
export async function editarControlExterno(
  sesion: SesionFlujo,
  documentoId: number,
  d: DatosControlExterno,
  opciones?: Opciones,
): Promise<void> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const control = validarControl(d);

  await enTransaccion(sql, async (tx) => {
    await bloquear(tx, documentoId);
    const s = await gestionable(tx, sesion, documentoId);
    if (s.retirado) throw new ErrorVigencia(RETIRADO);
    const [actual] = await tx`SELECT ex.entidad_emisora, ex.titulo_original, ex.fuente_oficial, ex.responsable_id, u.nombre AS responsable,
        ex.verificacion_meses
      FROM externos ex JOIN usuarios u ON u.id = ex.responsable_id WHERE ex.documento_id = ${documentoId}`;
    const normaActual = await normaEnlazada(tx, documentoId);
    const responsable = await exigirResponsable(tx, control.responsableId, documentoId);
    const norma = control.normaId === null ? null : await nombreDeNorma(tx, control.normaId);

    const cambio = {
      entidadEmisora: actual.entidad_emisora !== control.entidadEmisora,
      tituloOriginal: actual.titulo_original !== control.tituloOriginal,
      fuenteOficial: actual.fuente_oficial !== control.fuenteOficial,
      responsable: Number(actual.responsable_id) !== control.responsableId,
      verificacionMeses: Number(actual.verificacion_meses) !== control.verificacionMeses,
      norma: (normaActual?.id ?? null) !== control.normaId,
    };
    const cambiaron = (Object.keys(cambio) as (keyof typeof cambio)[]).filter((dato) => cambio[dato]);
    if (cambiaron.length === 0) return;

    const reiniciarAvisos = cambio.responsable || cambio.verificacionMeses;
    await tx`UPDATE externos SET entidad_emisora = ${control.entidadEmisora}, titulo_original = ${control.tituloOriginal},
        fuente_oficial = ${control.fuenteOficial}, responsable_id = ${control.responsableId},
        verificacion_meses = ${control.verificacionMeses}, actualizado_en = ${ahora}
        ${reiniciarAvisos ? tx`, aviso_vencido_en = NULL, escalado_en = NULL` : tx``}
      WHERE documento_id = ${documentoId}`;
    if (cambio.norma) {
      if (normaActual) await tx`DELETE FROM norma_documentos WHERE documento_id = ${documentoId} AND norma_id = ${normaActual.id}`;
      if (control.normaId !== null) {
        await tx`INSERT INTO norma_documentos (norma_id, documento_id, creado_por) VALUES (${control.normaId}, ${documentoId}, ${sesion.usuarioId})
          ON CONFLICT (norma_id, documento_id) DO NOTHING`;
      }
    }

    const antes = {
      entidadEmisora: actual.entidad_emisora as string,
      tituloOriginal: actual.titulo_original as string | null,
      fuenteOficial: actual.fuente_oficial as string | null,
      responsable: actual.responsable as string,
      verificacionMeses: Number(actual.verificacion_meses),
      norma: normaActual?.nombre ?? null,
    };
    const despues = { ...control, responsable, norma };
    const solo = (datos: Record<string, unknown>) => Object.fromEntries(cambiaron.map((dato) => [dato, datos[dato]]));
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "externo_editado",
      entidad: "documento",
      entidadId: documentoId,
      detalle: { codigo: s.codigo, antes: solo(antes), despues: solo(despues) },
    });
  });
}

// ── La edición en borrador ──

/**
 * Abre la edición siguiente en borrador (spec 13C §8.3), con sus datos y el «qué cambió». Una sola a la vez; la
 * marca «edición nueva pendiente» que dejó una verificación sigue hasta que se adopte.
 */
export async function abrirEdicion(
  sesion: SesionFlujo,
  documentoId: number,
  d: DatosEdicion,
  opciones?: Opciones,
): Promise<{ versionId: number }> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const edicion = validarEdicion(d);
  const resumen = validarResumen(d.resumenCambios, true);

  return enTransaccion(sql, async (tx) => {
    await bloquear(tx, documentoId);
    const s = await gestionable(tx, sesion, documentoId);
    if (s.retirado) throw new ErrorVigencia(RETIRADO);
    if (s.borrador) throw new ErrorVigencia(EDICION_PENDIENTE);
    // Una versión descartada libera su número.
    const [{ siguiente }] = await tx`SELECT coalesce(max(numero), 0) + 1 AS siguiente
      FROM documento_versiones WHERE documento_id = ${documentoId} AND estado <> 'descartado'`;
    const [v] = await tx`INSERT INTO documento_versiones
        (documento_id, numero, estado, edicion_externa, fecha_edicion_externa, resumen_cambios, creado_en)
      VALUES (${documentoId}, ${siguiente}, 'borrador', ${edicion.edicion}, ${edicion.fechaEdicion}, ${resumen}, ${ahora})
      RETURNING id, numero`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "externo_edicion_abierta",
      entidad: "documento",
      entidadId: documentoId,
      detalle: { codigo: s.codigo, numero: v.numero, edicion: edicion.edicion },
    });
    return { versionId: Number(v.id) };
  });
}

/** La edición en borrador de un externo que la persona gestiona, con el documento y la versión bloqueados. */
async function edicionEnBorrador(tx: TransactionSql, sesion: SesionFlujo, versionId: number): Promise<{ s: Situacion; numero: number }> {
  const documentoId = await documentoDeVersion(tx, versionId);
  if (documentoId === null) throw new ErrorVigencia(NO_EXISTE);
  await bloquear(tx, documentoId);
  const s = await gestionable(tx, sesion, documentoId);
  const [v] = await tx`SELECT numero, estado FROM documento_versiones WHERE id = ${versionId} FOR UPDATE`;
  if (v.estado !== "borrador") throw new ErrorVigencia(NO_BORRADOR);
  return { s, numero: v.numero as number };
}

/** Corrige los datos de la edición en borrador; «qué cambió» es obligatorio si ya hay una edición vigente. */
export async function editarEdicion(
  sesion: SesionFlujo,
  versionId: number,
  d: Omit<DatosEdicion, "resumenCambios"> & { resumenCambios: string | null },
  opciones?: Opciones,
): Promise<{ documentoId: number }> {
  const sql = opciones?.sql ?? obtenerSql();
  const edicion = validarEdicion(d);

  return enTransaccion(sql, async (tx) => {
    const { s, numero } = await edicionEnBorrador(tx, sesion, versionId);
    const resumen = validarResumen(d.resumenCambios, s.vigente !== null);
    await tx`UPDATE documento_versiones SET edicion_externa = ${edicion.edicion}, fecha_edicion_externa = ${edicion.fechaEdicion},
        resumen_cambios = ${resumen}
      WHERE id = ${versionId}`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "externo_edicion_editada",
      entidad: "documento",
      entidadId: s.documentoId,
      detalle: { codigo: s.codigo, numero, ...edicion, resumenCambios: resumen },
    });
    return { documentoId: s.documentoId };
  });
}

/** Descarta la edición en borrador (F13A-DC16): conserva sus archivos, libera su número y queda en la bitácora. */
export async function descartarEdicion(sesion: SesionFlujo, versionId: number, opciones?: Opciones): Promise<{ documentoId: number }> {
  const sql = opciones?.sql ?? obtenerSql();
  return enTransaccion(sql, async (tx) => {
    const { s, numero } = await edicionEnBorrador(tx, sesion, versionId);
    const [v] = await tx`UPDATE documento_versiones SET estado = 'descartado' WHERE id = ${versionId} RETURNING edicion_externa`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "externo_edicion_descartada",
      entidad: "documento",
      entidadId: s.documentoId,
      detalle: { codigo: s.codigo, numero, edicion: v.edicion_externa },
    });
    return { documentoId: s.documentoId };
  });
}
