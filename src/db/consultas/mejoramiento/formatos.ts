/**
 * Lo que leen los impresos de un hallazgo (spec 15 §16.4): el encabezado de cada formato, del documento que el Admin SGC eligió en
 * la configuración del módulo, y lo que los impresos pintan y `leerHallazgo` no trae (los líderes del proceso y, en el registro
 * completo, los seguimientos de cada actividad). Sin regla de alcance: la pone la página, que solo imprime para quien ve el hallazgo completo.
 */
import type { Cliente } from "@/db/cliente";
import type { SeguimientoDeActividad } from "./actividades";
import { obtenerConfigMejora, type ConfigMejora } from "./config";

/** El código, la versión y la fecha de emisión vigentes del documento de un formato. */
export type EncabezadoDelFormato = { codigo: string; version: number; emitidoEn: Date };

/**
 * El encabezado del formato de un impreso (`registro`: SGC-FO-AC-01; `porques`: SGC-FO-AC-02; `ishikawa`: SGC-FO-AC-03): el código
 * del documento elegido en la configuración, el número de su versión vigente y, como fecha de emisión, el día en que se aprobó
 * (`fecha_aprobacion`, que toda vigente tiene: la de una carga fuera de la plataforma no es su `publicado_en`), al empezar ese día
 * en la zona de la instalación. `null` si no se eligió ninguno o si el elegido ya no tiene versión vigente: el impreso sale sin
 * esos tres datos.
 */
export async function encabezadoDeFormato(sql: Cliente, cual: keyof ConfigMejora["formatos"]): Promise<EncabezadoDelFormato | null> {
  const documentoId = (await obtenerConfigMejora({ sql })).formatos[cual];
  if (documentoId === null) return null;
  // La conexión abre en la zona de la instalación: el `timestamptz` de una fecha es el comienzo de ese día en ella.
  const [f] = await sql`SELECT d.codigo, v.numero, v.fecha_aprobacion::timestamptz AS emitido_en
    FROM documentos d JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'
    WHERE d.id = ${documentoId}`;
  if (!f) return null;
  return { codigo: f.codigo as string, version: Number(f.numero), emitidoEn: f.emitido_en as Date };
}

/** Los líderes activos del proceso: el «responsable del proceso» de los impresos (spec Apéndice A.2 y A.3). */
export async function lideresDelProceso(sql: Cliente, procesoId: number): Promise<string[]> {
  const filas = await sql`SELECT u.nombre FROM usuario_procesos up
    JOIN usuarios u ON u.id = up.usuario_id AND u.activo AND u.rol = 'lider_proceso'
    JOIN procesos p ON p.id = up.proceso_id AND p.activo
    WHERE up.proceso_id = ${procesoId} ORDER BY u.nombre, u.id`;
  return filas.map((f) => f.nombre as string);
}

/** Los seguimientos del hallazgo, por actividad, del más antiguo al más reciente: la sección 5 del SGC-FO-AC-01. */
export async function seguimientosDelHallazgo(sql: Cliente, hallazgoId: number): Promise<Record<number, SeguimientoDeActividad[]>> {
  const filas = await sql`SELECT s.id, s.actividad_id, to_char(s.fecha, 'YYYY-MM-DD') AS fecha, s.realizado, s.avance, s.barreras,
      s.creado_en, u.nombre AS quien
    FROM mejora_seguimientos s JOIN usuarios u ON u.id = s.registrado_por
    WHERE s.hallazgo_id = ${hallazgoId} ORDER BY s.fecha, s.id`;
  const porActividad: Record<number, SeguimientoDeActividad[]> = {};
  for (const s of filas) {
    (porActividad[Number(s.actividad_id)] ??= []).push({
      id: Number(s.id),
      fecha: s.fecha as string,
      realizado: s.realizado as string,
      avance: Number(s.avance),
      barreras: (s.barreras as string | null) ?? null,
      quien: s.quien as string,
      creadoEn: s.creado_en as Date,
    });
  }
  return porActividad;
}
