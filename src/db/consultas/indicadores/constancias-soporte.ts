/**
 * Quién registra una constancia de envío al ente y lo que la subida de su soporte necesita (anexo 14B, §8), aparte de
 * `constancias.ts` para que `registrarArchivo` (`admin.ts`) lo use sin cargar la lectura de los periodos: `constancias.ts`
 * importa `lectura.ts`, que llega a `aprobacion.ts` y de ahí a los avisos y a `estructura.ts`, que importa `admin.ts`. Este
 * módulo solo depende de `alcance`, `permisos` y los tipos de indicadores, y `constancias.ts` reexporta lo suyo.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { puedeMedir, puedeVerIndicador, type SujetoVisibilidad } from "@/lib/alcance";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";

export const CONSTANCIA_NO_EXISTE = "La constancia no existe";
/** Lo que el retiro sí impide: subir soportes nuevos (registrar y corregir lo conservado, no). */
export const RETIRADO_SIN_SOPORTES_NUEVOS = "El indicador está retirado: ya no admite soportes nuevos";

/** La constancia `r` (`reportes_externos r`) no tiene ningún soporte adjunto, para un `WHERE`. */
export const constanciaSinSoporte = (sql: Cliente) =>
  sql`NOT EXISTS (SELECT 1 FROM archivos a WHERE a.contexto = 'reporte_externo' AND a.contexto_id = r.id)`;

/**
 * La constancia `r` se sigue pidiendo (anexo 14B, §8), para un `WHERE` sobre `reportes_externos r` y su indicador
 * `indicadores i`: pendiente, de un indicador activo y, si la ficha ya no se reporta a un ente (`ente_desde` nulo), solo si
 * ya tiene un soporte (se puede terminar de registrar). La pendiente sin soporte que quedó porque tiene historial (no se
 * borra: `quitarConstanciasSinSoporte`) sigue existiendo, pero ya no se pide. La usan las tareas, los avisos de vencido y
 * de escalamiento y la marca y el filtro de la lista.
 */
export const constanciaQueSePide = (sql: Cliente) =>
  sql`(r.estado = 'pendiente' AND i.estado = 'activo' AND (i.ente_desde IS NOT NULL OR NOT ${constanciaSinSoporte(sql)}))`;

/** Quien ve el indicador y puede medirlo (`puedeMedir`) o administra indicadores. */
export async function puedeRegistrarConstancia(indicadorId: number, sujeto: SujetoVisibilidad, opciones?: { sql?: Cliente }): Promise<boolean> {
  const sql = opciones?.sql ?? obtenerSql();
  if (!(await puedeVerIndicador(indicadorId, sujeto, { sql }))) return false;
  if (puede(sujeto, "indicadores.administrar")) return true;
  return (await puedeMedir(indicadorId, sujeto, { sql })).puede;
}

/**
 * Quién puede subir un soporte a la constancia, antes de recibir el cuerpo: 404 si no existe o la persona no ve su
 * indicador, 403 si lo ve y no puede registrarla, 409 si el indicador ya no está activo (la transacción de
 * `registrarArchivo` lo vuelve a exigir con los candados). Una constancia registrada también admite soportes: no se quitan,
 * pero una corrección puede necesitar el documento correcto.
 */
export async function autorizarSoporteDeConstancia(
  reporteId: number,
  sesion: SujetoVisibilidad,
  opciones?: { sql?: Cliente },
): Promise<{ ok: true } | { ok: false; estado: 403 | 404 | 409 }> {
  const sql = opciones?.sql ?? obtenerSql();
  if (!Number.isSafeInteger(reporteId) || reporteId <= 0) return { ok: false, estado: 404 };
  const [r] = await sql`SELECT r.indicador_id, i.estado FROM reportes_externos r JOIN indicadores i ON i.id = r.indicador_id WHERE r.id = ${reporteId}`;
  if (!r) return { ok: false, estado: 404 };
  const indicadorId = Number(r.indicador_id);
  if (!(await puedeVerIndicador(indicadorId, sesion, { sql }))) return { ok: false, estado: 404 };
  if (!(await puedeRegistrarConstancia(indicadorId, sesion, { sql }))) return { ok: false, estado: 403 };
  if (r.estado !== "activo") return { ok: false, estado: 409 };
  return { ok: true };
}

/**
 * Los candados de quien sube un soporte a una constancia (`registrarArchivo`), antes de escribir nada: el indicador
 * `FOR SHARE` y activo, después la constancia `FOR UPDATE`. Quien llama ya comprobó a la persona
 * (`autorizarSoporteDeConstancia`); `dejarSoporteDeConstanciaSubido` la vuelve a comprobar con los candados tomados.
 */
export async function bloquearParaSoporteDeConstancia(tx: TransactionSql, reporteId: number): Promise<void> {
  const [i] = await tx`SELECT estado FROM indicadores
    WHERE id = (SELECT indicador_id FROM reportes_externos WHERE id = ${reporteId}) FOR SHARE`;
  const [r] = await tx`SELECT id FROM reportes_externos WHERE id = ${reporteId} FOR UPDATE`;
  if (!i || !r) throw new ErrorIndicador(CONSTANCIA_NO_EXISTE);
  if (i.estado !== "activo") throw new ErrorIndicador(RETIRADO_SIN_SOPORTES_NUEVOS);
}

/**
 * El evento `soporte` de una subida (`{ nombre, accion: "subido" }`), con la fila de `archivos` ya escrita y los candados de
 * `bloquearParaSoporteDeConstancia`. La persona se vuelve a comprobar: su designación pudo cambiar tras autorizar.
 */
export async function dejarSoporteDeConstanciaSubido(
  tx: TransactionSql,
  c: { reporteId: number; usuarioId: number; nombre: string; ahora: Date },
): Promise<void> {
  const [u] = await tx`SELECT rol, ver_historial FROM usuarios WHERE id = ${c.usuarioId}`;
  const [r] = await tx`SELECT indicador_id FROM reportes_externos WHERE id = ${c.reporteId}`;
  const sujeto = u ? { usuarioId: c.usuarioId, rol: u.rol, verHistorial: u.ver_historial === true } : null;
  if (!sujeto || !r || !(await puedeRegistrarConstancia(Number(r.indicador_id), sujeto, { sql: tx }))) throw new ErrorPermiso();
  await tx`INSERT INTO reporte_externo_eventos (reporte_id, tipo, usuario_id, detalle, creado_en)
    VALUES (${c.reporteId}, 'soporte', ${c.usuarioId}, ${tx.json({ nombre: c.nombre, accion: "subido" })}, ${c.ahora})`;
}


/**
 * Las constancias de envío que dejan de pedirse (anexo 14B, §8): la ficha ya no se reporta a un ente o el indicador se
 * retira. Se quitan las pendientes sin ningún soporte ni evento; las registradas y las que ya tienen un soporte o un evento
 * se conservan (un evento no se puede borrar: la llave foránea y el trigger de `reporte_externo_eventos` lo impiden), y la
 * pendiente sin soporte que se conserva ya no se pide (`constanciaQueSePide`). Vive
 * aquí y no en `constancias.ts`, que importa las lecturas: `alPublicarVersion` y `retirar` la llaman sin cerrar otro ciclo
 * de importaciones. Quien llama tiene el indicador `FOR UPDATE`. Devuelve cuántas quitó.
 */
export async function quitarConstanciasSinSoporte(tx: TransactionSql, indicadorId: number): Promise<number> {
  const quitadas = await tx`DELETE FROM reportes_externos r
    WHERE r.indicador_id = ${indicadorId} AND r.estado = 'pendiente' AND ${constanciaSinSoporte(tx)}
      AND NOT EXISTS (SELECT 1 FROM reporte_externo_eventos e WHERE e.reporte_id = r.id)
    RETURNING r.id`;
  return quitadas.length;
}
