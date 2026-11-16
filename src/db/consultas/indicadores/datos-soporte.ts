/**
 * Los soportes de un periodo de un dato compartido (anexo 14C, §4.6): PDF, imagen o `.xlsx` (como los de una medición),
 * opcionales. Son filas de `archivos` con contexto `dato_compartido`, rol `evidencia` y, como dueño, el periodo
 * (`variable_valores`). Los suben y los quitan, mientras el periodo no esté cerrado, quienes pueden reportar el dato
 * (`puedeReportarDato`, con el permiso `indicadores.medir`); los ven quienes ven el dato y quienes ven los soportes de algún
 * indicador con una ficha aprobada que lo cita (`puedeVerSoporteDeDato`). Para los demás no existen: 404. Cada subida y cada
 * quitada dejan su evento `soporte` en el historial del periodo (`variable_eventos`); en la bitácora, la subida queda con el
 * `subir_archivo` de `registrarArchivo`, como la de cualquier evidencia, y la quitada con `dato_soporte_quitado`.
 *
 * Candados, como al reportar (`periodoBloqueado`): el dato `FOR SHARE`, el periodo `FOR UPDATE` y solo después la fila de
 * `archivos` y el evento.
 *
 * Módulo liviano: lo importa `registrarArchivo` (`admin.ts`), así que no importa `lectura`, `fichas`, `aprobacion` ni
 * `operacion`.
 */
import { unlink } from "node:fs/promises";
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { puedeReportarDato, puedeVerDato, puedeVerIndicador, puedeVerSoportes, type SujetoVisibilidad } from "@/lib/alcance";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";
import type { ArchivoServible } from "@/lib/servir-archivo";
import { periodoBloqueado, type PeriodoBloqueado } from "./datos-periodos";
import type { Soporte } from "./soportes";

export const CERRADO_SIN_SOPORTES = "El periodo está cerrado: ya no admite cambios en sus soportes";
export const SOPORTE_NO_EXISTE = "El soporte no existe";

const esId = (n: number) => Number.isSafeInteger(n) && n > 0;

/**
 * Quién ve los soportes del dato: quien ve el dato (`puedeVerDato`) o quien ve los soportes de algún indicador con una
 * versión aprobada que lo cita (`puedeVerIndicador` y `puedeVerSoportes`, como los de una medición). `false` si no existe.
 */
export async function puedeVerSoporteDeDato(sql: Cliente, sujeto: SujetoVisibilidad, datoId: number): Promise<boolean> {
  if (!esId(datoId)) return false;
  if (await puedeVerDato(datoId, sujeto, { sql })) return true;
  const indicadores = await sql`SELECT DISTINCT v.indicador_id FROM indicador_variables iv
    JOIN indicador_versiones v ON v.id = iv.version_id AND v.estado = 'aprobada'
    WHERE iv.variable_compartida_id = ${datoId}
    ORDER BY v.indicador_id`;
  for (const i of indicadores) {
    const id = Number(i.indicador_id);
    if ((await puedeVerIndicador(id, sujeto, { sql })) && (await puedeVerSoportes(id, sujeto, { sql }))) return true;
  }
  return false;
}

/** Los soportes de cada periodo del dato en una lectura, de los más antiguos a los más recientes; `null` si no los ve. */
export async function soportesDeDato(
  sesion: SujetoVisibilidad,
  datoId: number,
  opciones?: { sql?: Cliente },
): Promise<Map<number, Soporte[]> | null> {
  const sql = opciones?.sql ?? obtenerSql();
  if (!(await puedeVerSoporteDeDato(sql, sesion, datoId))) return null;
  const filas = await sql`SELECT a.id, a.contexto_id, a.nombre_original, a.mime, a.tamano_bytes FROM archivos a
    JOIN variable_valores vv ON vv.id = a.contexto_id
    WHERE a.contexto = 'dato_compartido' AND a.rol = 'evidencia' AND vv.variable_id = ${datoId}
    ORDER BY a.creado_en, a.id`;
  const porPeriodo = new Map<number, Soporte[]>();
  for (const f of filas) {
    const id = Number(f.contexto_id);
    const soporte = { id: Number(f.id), nombre: f.nombre_original as string, mime: f.mime as string, tamano: Number(f.tamano_bytes) };
    porPeriodo.set(id, [...(porPeriodo.get(id) ?? []), soporte]);
  }
  return porPeriodo;
}

/**
 * El archivo de un soporte, si es un soporte de un periodo del dato `datoId` y la persona ve los soportes del dato
 * (`puedeVerSoporteDeDato`); `null` en cualquier otro caso: el handler responde 404 y lo sirve siempre como descarga.
 */
export async function soporteDeDatoServible(
  sesion: SujetoVisibilidad,
  d: { datoId: number; archivoId: number },
  opciones?: { sql?: Cliente },
): Promise<ArchivoServible | null> {
  const sql = opciones?.sql ?? obtenerSql();
  if (!esId(d.datoId) || !esId(d.archivoId)) return null;
  const [f] = await sql`SELECT a.ruta, a.mime, a.nombre_original FROM archivos a
    JOIN variable_valores vv ON vv.id = a.contexto_id
    WHERE a.id = ${d.archivoId} AND a.contexto = 'dato_compartido' AND a.rol = 'evidencia' AND vv.variable_id = ${d.datoId}`;
  if (!f || !(await puedeVerSoporteDeDato(sql, sesion, d.datoId))) return null;
  return { ruta: f.ruta as string, mime: f.mime as string, nombreOriginal: f.nombre_original as string };
}

/**
 * Quién puede subir o quitar un soporte del periodo, antes de recibir el cuerpo o de abrir la transacción: 404 si no existe
 * o la persona no ve el dato, 403 si lo ve y no puede reportarlo, 409 si el periodo está cerrado. La transacción lo vuelve a
 * exigir con los candados (`bloquearParaSoporteDeDato`, `quitarSoporteDeDato`).
 */
export async function autorizarSoporteDeDato(
  periodoId: number,
  sesion: SujetoVisibilidad,
  opciones?: { sql?: Cliente },
): Promise<{ ok: true } | { ok: false; estado: 403 | 404 | 409 }> {
  const sql = opciones?.sql ?? obtenerSql();
  if (!esId(periodoId)) return { ok: false, estado: 404 };
  const [p] = await sql`SELECT variable_id, estado FROM variable_valores WHERE id = ${periodoId}`;
  if (!p) return { ok: false, estado: 404 };
  const datoId = Number(p.variable_id);
  if (!(await puedeVerDato(datoId, sesion, { sql }))) return { ok: false, estado: 404 };
  if (!(await puedeReportarDato(datoId, sesion, { sql })).puede) return { ok: false, estado: 403 };
  if (p.estado === "cerrado") return { ok: false, estado: 409 };
  return { ok: true };
}

/** La persona que sube, leída otra vez dentro de la transacción: su rol pudo cambiar tras autorizar. */
async function sujetoDe(tx: TransactionSql, usuarioId: number): Promise<SujetoVisibilidad> {
  const [u] = await tx`SELECT rol, ver_historial FROM usuarios WHERE id = ${usuarioId}`;
  if (!u) throw new ErrorPermiso();
  return { usuarioId, rol: u.rol, verHistorial: u.ver_historial === true };
}

/**
 * Los candados de quien sube un soporte (`registrarArchivo`), antes de escribir nada: el dato `FOR SHARE` y el periodo
 * `FOR UPDATE` sin cerrar, con la persona comprobada otra vez (ve el dato y puede reportarlo: su responsabilidad pudo
 * cambiar tras `autorizarSoporteDeDato`). Devuelve el periodo para `dejarSoporteDeDatoSubido`.
 */
export async function bloquearParaSoporteDeDato(tx: TransactionSql, periodoId: number, usuarioId: number): Promise<PeriodoBloqueado> {
  const p = await periodoBloqueado(tx, await sujetoDe(tx, usuarioId), periodoId);
  if (p.estado === "cerrado") throw new ErrorIndicador(CERRADO_SIN_SOPORTES);
  return p;
}

/** La marca de que el Admin SGC actuó porque nadie más podía reportar el dato. */
const marcaDe = (p: PeriodoBloqueado) => (p.sinMedidor ? { sinResponsable: true as const } : {});

/** El evento `soporte` del periodo, con la marca del respaldo. */
async function dejarEvento(tx: TransactionSql, p: PeriodoBloqueado, c: { usuarioId: number; archivo: string; accion: string; ahora: Date }) {
  await tx`INSERT INTO variable_eventos (valor_id, tipo, usuario_id, detalle, creado_en)
    VALUES (${p.id}, 'soporte', ${c.usuarioId}, ${tx.json({ accion: c.accion, nombre: c.archivo, ...marcaDe(p) })}, ${c.ahora})`;
}

/**
 * El evento de una subida, con la fila de `archivos` ya escrita (y su `subir_archivo` en la bitácora) y los candados de
 * `bloquearParaSoporteDeDato`.
 */
export function dejarSoporteDeDatoSubido(
  tx: TransactionSql,
  p: PeriodoBloqueado,
  c: { usuarioId: number; archivo: string; ahora: Date },
): Promise<void> {
  return dejarEvento(tx, p, { ...c, accion: "subido" });
}

/**
 * Quita un soporte del periodo antes del cierre (anexo 14C, §4.6): el permiso `indicadores.medir` más `puedeReportarDato`,
 * con los candados del reporte; quien no ve el dato recibe «no existe», y un archivo que no es soporte de ese periodo,
 * también. Borra la fila y deja el evento y la bitácora; el archivo del almacén se borra después de confirmar, y uno ya
 * ausente no es un error. Con el periodo cerrado, no.
 */
export async function quitarSoporteDeDato(
  sesion: SesionFlujo,
  d: { periodoId: number; archivoId: number },
  opciones?: { sql?: Cliente; ahora?: Date },
): Promise<void> {
  if (!puede(sesion, "indicadores.medir")) throw new ErrorPermiso();
  if (!esId(d.archivoId)) throw new ErrorIndicador(SOPORTE_NO_EXISTE);
  const ahora = opciones?.ahora ?? new Date();
  const ruta = await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const p = await periodoBloqueado(tx, sesion, d.periodoId);
    if (p.estado === "cerrado") throw new ErrorIndicador(CERRADO_SIN_SOPORTES);
    const [archivo] = await tx`SELECT ruta, nombre_original FROM archivos
      WHERE id = ${d.archivoId} AND contexto = 'dato_compartido' AND contexto_id = ${p.id} AND rol = 'evidencia' FOR UPDATE`;
    if (!archivo) throw new ErrorIndicador(SOPORTE_NO_EXISTE);
    await tx`DELETE FROM archivos WHERE id = ${d.archivoId}`;
    const nombre = archivo.nombre_original as string;
    await dejarEvento(tx, p, { usuarioId: sesion.usuarioId, archivo: nombre, accion: "quitado", ahora });
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "dato_soporte_quitado",
      entidad: "dato_compartido",
      entidadId: p.datoId,
      detalle: { nombre: p.nombre, periodo: p.periodo, periodoId: p.id, archivo: nombre, ...marcaDe(p) },
    });
    return archivo.ruta as string;
  });
  const absoluta = resolverRutaAlmacen(ruta);
  if (absoluta) await unlink(absoluta).catch(() => {});
}
