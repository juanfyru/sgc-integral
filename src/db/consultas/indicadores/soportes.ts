/**
 * Los soportes de una medición (spec 14 §6.4, §8.2 y §8.7; Tarea 11 de la 14A): los archivos que respaldan un dato.
 * Son filas de `archivos` con contexto `medicion` y rol `evidencia`. Los ven solo quienes ven soportes
 * (`puedeVerSoportes`, más estricto que ver el indicador) y los suben y quitan, antes del cierre, quienes pueden medir el
 * indicador activo. Cada subida y cada quitada dejan su evento `soporte` en la medición, en la misma transacción que la
 * fila de `archivos`, y recalculan: con «soporte obligatorio», quitar el último devuelve la medición a `abierta` y
 * subir el primero la deja `reportada`.
 *
 * Candados, como en `mediciones.ts`: el indicador `FOR SHARE` (vuelve a exigirse que esté activo), la medición `FOR UPDATE`
 * y solo después la fila de `archivos` y el evento.
 */
import { unlink } from "node:fs/promises";
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { puedeMedir, puedeVerIndicador, puedeVerSoportes, type SujetoVisibilidad } from "@/lib/alcance";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";
import type { ArchivoServible } from "@/lib/servir-archivo";
import { contarSoportes, contextoDeMedicion, NO_EXISTE, recalcularMedicion } from "./mediciones";

type Opciones = { sql?: Cliente; ahora?: Date };

export type Soporte = { id: number; nombre: string; mime: string; tamano: number };

const SOPORTE_NO_EXISTE = "El soporte no existe";
const CERRADA = "La medición está cerrada: ya no admite cambios en sus soportes";
const NO_ACTIVO = "El indicador ya no está activo: sus mediciones no admiten soportes";

const enSoporte = (f: Record<string, unknown>): Soporte => ({
  id: Number(f.id),
  nombre: f.nombre_original as string,
  mime: f.mime as string,
  tamano: Number(f.tamano_bytes),
});

/**
 * Quién puede subir un soporte a la medición, antes de recibir el cuerpo: 404 si no existe o la persona no ve su
 * indicador, 403 si lo ve y no puede medirlo, 409 si la medición está cerrada o el indicador ya no está activo (la
 * transacción de `registrarArchivo` lo vuelve a exigir con los candados).
 */
export async function autorizarSoporte(
  medicionId: number,
  sesion: SujetoVisibilidad,
  opciones?: Opciones,
): Promise<{ ok: true; indicadorId: number } | { ok: false; estado: 403 | 404 | 409 }> {
  const sql = opciones?.sql ?? obtenerSql();
  if (!Number.isSafeInteger(medicionId) || medicionId <= 0) return { ok: false, estado: 404 };
  const [m] = await sql`SELECT m.estado, m.indicador_id, i.estado AS estado_indicador FROM mediciones m
    JOIN indicadores i ON i.id = m.indicador_id WHERE m.id = ${medicionId}`;
  if (!m) return { ok: false, estado: 404 };
  const indicadorId = Number(m.indicador_id);
  if (!(await puedeVerIndicador(indicadorId, sesion, { sql }))) return { ok: false, estado: 404 };
  if (!(await puedeMedir(indicadorId, sesion, { sql })).puede) return { ok: false, estado: 403 };
  if (m.estado === "cerrada" || m.estado_indicador !== "activo") return { ok: false, estado: 409 };
  return { ok: true, indicadorId };
}

/** Los soportes de la medición, de los más antiguos a los más recientes; `null` si la persona no ve los soportes. */
export async function soportesDe(sesion: SujetoVisibilidad, medicionId: number, opciones?: Opciones): Promise<Soporte[] | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [m] = await sql`SELECT indicador_id FROM mediciones WHERE id = ${medicionId}`;
  if (!m) return null;
  const indicadorId = Number(m.indicador_id);
  if (!(await puedeVerIndicador(indicadorId, sesion, { sql })) || !(await puedeVerSoportes(indicadorId, sesion, { sql }))) return null;
  const filas = await sql`SELECT id, nombre_original, mime, tamano_bytes FROM archivos
    WHERE contexto = 'medicion' AND contexto_id = ${medicionId} AND rol = 'evidencia' ORDER BY creado_en, id`;
  return filas.map(enSoporte);
}

/**
 * Los soportes de varias mediciones de un mismo indicador en una sola lectura, por medición (la tabla del año); `null`
 * si la persona no ve los soportes del indicador.
 */
export async function soportesDeVarias(
  sesion: SujetoVisibilidad,
  indicadorId: number,
  medicionIds: number[],
  opciones?: Opciones,
): Promise<Map<number, Soporte[]> | null> {
  const sql = opciones?.sql ?? obtenerSql();
  if (!(await puedeVerIndicador(indicadorId, sesion, { sql })) || !(await puedeVerSoportes(indicadorId, sesion, { sql }))) return null;
  const porMedicion = new Map<number, Soporte[]>();
  if (medicionIds.length === 0) return porMedicion;
  const filas = await sql`SELECT a.id, a.contexto_id, a.nombre_original, a.mime, a.tamano_bytes FROM archivos a
    JOIN mediciones m ON m.id = a.contexto_id
    WHERE a.contexto = 'medicion' AND a.rol = 'evidencia' AND m.indicador_id = ${indicadorId} AND a.contexto_id IN ${sql(medicionIds)}
    ORDER BY a.creado_en, a.id`;
  for (const f of filas) {
    const id = Number(f.contexto_id);
    porMedicion.set(id, [...(porMedicion.get(id) ?? []), enSoporte(f)]);
  }
  return porMedicion;
}

/**
 * El archivo de un soporte, si la persona ve los soportes del indicador `codigo` (sin distinguir mayúsculas) y el archivo
 * es un soporte de una de sus mediciones; `null` en cualquier otro caso (el handler responde 404, aunque la persona vea
 * el indicador).
 */
export async function soporteServible(
  sesion: SujetoVisibilidad,
  codigo: string,
  archivoId: number,
  opciones?: Opciones,
): Promise<ArchivoServible | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [f] = await sql`SELECT a.ruta, a.mime, a.nombre_original, m.indicador_id FROM archivos a
    JOIN mediciones m ON m.id = a.contexto_id JOIN indicadores i ON i.id = m.indicador_id
    WHERE a.id = ${archivoId} AND a.contexto = 'medicion' AND a.rol = 'evidencia' AND lower(i.codigo) = lower(${codigo})`;
  if (!f) return null;
  const indicadorId = Number(f.indicador_id);
  if (!(await puedeVerIndicador(indicadorId, sesion, { sql })) || !(await puedeVerSoportes(indicadorId, sesion, { sql }))) return null;
  return { ruta: f.ruta as string, mime: f.mime as string, nombreOriginal: f.nombre_original as string };
}

/**
 * Los candados de quien sube un soporte (`registrarArchivo`), antes de escribir nada: el indicador `FOR SHARE` y activo,
 * después la medición `FOR UPDATE` y sin cerrar. Quien llama ya comprobó a la persona (`autorizarSoporte`).
 */
export async function bloquearParaSoporte(tx: TransactionSql, medicionId: number): Promise<void> {
  const [i] = await tx`SELECT estado FROM indicadores
    WHERE id = (SELECT indicador_id FROM mediciones WHERE id = ${medicionId}) FOR SHARE`;
  const [m] = await tx`SELECT estado FROM mediciones WHERE id = ${medicionId} FOR UPDATE`;
  if (!i || !m) throw new ErrorIndicador(NO_EXISTE);
  if (i.estado !== "activo") throw new ErrorIndicador(NO_ACTIVO);
  if (m.estado === "cerrada") throw new ErrorIndicador(CERRADA);
}

/** El evento `soporte` de una subida, con la fila de `archivos` ya escrita y los candados de `bloquearParaSoporte`. */
export async function dejarSoporteSubido(tx: TransactionSql, c: { medicionId: number; usuarioId: number; nombre: string; ahora: Date }): Promise<void> {
  const hay = await contarSoportes(tx, c.medicionId);
  // Como en reportar y quitar: la marca de que el Admin SGC subió porque nadie más podía medir.
  const [u] = await tx`SELECT rol, ver_historial FROM usuarios WHERE id = ${c.usuarioId}`;
  const [m] = await tx`SELECT indicador_id FROM mediciones WHERE id = ${c.medicionId}`;
  const capacidad = u
    ? await puedeMedir(Number(m.indicador_id), { usuarioId: c.usuarioId, rol: u.rol, verHistorial: u.ver_historial === true }, { sql: tx })
    : null;
  await recalcularMedicion(tx, c.medicionId, {
    ahora: c.ahora,
    actorId: c.usuarioId,
    evento: "soporte",
    detalle: { accion: "subido", nombre: c.nombre, ...(capacidad?.sinMedidor ? { sinMedidor: true } : {}), antes: { soportes: hay - 1 }, despues: { soportes: hay } },
  });
}

/**
 * Quita un soporte antes del cierre (spec §8.7): borra la fila, deja el evento y la bitácora y recalcula (si el indicador
 * exige soporte y era el último, la medición vuelve a `abierta`). El archivo del almacén se borra después de confirmar;
 * uno ya ausente no es un error. Después del cierre, o con el indicador retirado, no.
 */
export async function quitarSoporte(sesion: SesionFlujo, d: { archivoId: number }, opciones?: Opciones): Promise<void> {
  if (!puede(sesion, "indicadores.medir")) throw new ErrorPermiso();
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const [destino] = await sql`SELECT contexto_id FROM archivos WHERE id = ${d.archivoId} AND contexto = 'medicion' AND rol = 'evidencia'`;
  if (!destino) throw new ErrorIndicador(SOPORTE_NO_EXISTE);
  const medicionId = Number(destino.contexto_id);
  const ruta = await enTransaccion(sql, async (tx) => {
    // El indicador y la medición, bloqueados en ese orden, antes de tocar la fila hija.
    // Quien no ve el indicador recibe el mismo mensaje que si el soporte no existiera.
    const ctx = await contextoDeMedicion(tx, sesion, medicionId, true).catch((err: unknown) => {
      throw err instanceof ErrorIndicador && err.message === NO_EXISTE ? new ErrorIndicador(SOPORTE_NO_EXISTE) : err;
    });
    const [archivo] = await tx`SELECT ruta, nombre_original FROM archivos
      WHERE id = ${d.archivoId} AND contexto = 'medicion' AND contexto_id = ${medicionId} AND rol = 'evidencia' FOR UPDATE`;
    if (!archivo) throw new ErrorIndicador(SOPORTE_NO_EXISTE);
    await tx`DELETE FROM archivos WHERE id = ${d.archivoId}`;
    const quedan = await contarSoportes(tx, medicionId);
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "medicion_soporte_quitado",
      entidad: "medicion",
      entidadId: medicionId,
      detalle: { codigo: ctx.indicador.codigo, indicadorId: ctx.indicador.id, periodo: ctx.medicion.periodo, nombre: archivo.nombre_original },
    });
    await recalcularMedicion(tx, medicionId, {
      ahora,
      actorId: sesion.usuarioId,
      evento: "soporte",
      detalle: {
        accion: "quitado",
        nombre: archivo.nombre_original,
        ...(ctx.capacidad.sinMedidor ? { sinMedidor: true } : {}),
        antes: { soportes: quedan + 1 },
        despues: { soportes: quedan },
      },
    });
    return archivo.ruta as string;
  });
  const absoluta = resolverRutaAlmacen(ruta);
  if (absoluta) await unlink(absoluta).catch(() => {});
}
