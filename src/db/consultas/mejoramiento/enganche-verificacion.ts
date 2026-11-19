/**
 * El enganche de un hallazgo de verificación de Distribución (13B) con mejoramiento (Fase 15B, anexo §7): el Admin SGC abre desde su
 * fila una no conformidad, que nace enlazada a él. Aquí, lo que leen los dos lados: las filas de Distribución (`engancheDeVerificacion`:
 * la no conformidad que cuenta, si se puede abrir y la sugerencia), la sección «Corrección» del hallazgo (`correccionEnlazada`) y lo
 * que el registro y el prellenado necesitan del hallazgo de verificación (`hallazgoParaAbrir`).
 *
 * Liviano: lo importan las páginas de Distribución, la lectura del hallazgo y el registro. No importa la lectura, el registro ni el
 * motor; del hallazgo de verificación lee las columnas que necesita, sin pasar por las consultas de Distribución. Solo lecturas.
 * Fuera de Distribución se le llama «hallazgo de verificación»; en la 13B no cambia ningún texto ni ninguna regla.
 */
import { obtenerSql, type Cliente } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { filtroHallazgos, filtroPuntos } from "@/lib/alcance";
import { enlaceDeHallazgo } from "@/lib/distribucion/hallazgos";
import { ETIQUETA_ESTADO_DE_VERIFICACION, type SugerenciaDeVerificacion } from "@/lib/mejoramiento/enganches";
import { etiquetaDeEstado } from "@/lib/mejoramiento/estados";
import type { EstadoHallazgo, ResultadoCierre } from "@/lib/mejoramiento/tipos";
import { puede } from "@/lib/permisos";
import { obtenerConfigMejora } from "./config";

type Opciones = { sql?: Cliente; ahora?: Date };

/**
 * Lo que pinta la fila de un hallazgo de verificación (anexo §7.1 y §7.4): la no conformidad que cuenta (ni rechazada ni anulada) con
 * su código y en qué va, y si quien mira la ve (el enlace); si quien mira puede abrir una (el Admin SGC, mientras no haya una que
 * cuente); y, solo entonces, por qué se sugiere abrirla.
 */
export type EngancheDeVerificacion = {
  noConformidad: { id: number; codigo: string; estado: string; visible: boolean } | null;
  puedeAbrir: boolean;
  sugerir: SugerenciaDeVerificacion | null;
};

/**
 * La corrección del hallazgo de verificación, como la pinta la sección «Corrección» de la no conformidad (anexo §7.2): en qué va (la
 * etiqueta de Distribución), qué se corrigió, quién y cuándo (la corrección del responsable o, sin ella, el cierre directo con su
 * nota), dónde se atiende y el nombre del punto.
 */
export type CorreccionEnlazada = { estado: string; nota: string | null; por: string | null; en: Date | null; enlace: string; punto: string };

/** Lo que `engancheDeVerificacion` necesita de cada hallazgo que lista una página de Distribución (su `Hallazgo`). */
export function filasDeVerificacion(
  hallazgos: ReadonlyArray<{ id: number; punto: { id: number }; reaperturas: number }>,
): Array<{ id: number; puntoUsoId: number; reaperturas: number }> {
  return hallazgos.map((h) => ({ id: h.id, puntoUsoId: h.punto.id, reaperturas: h.reaperturas }));
}

/** Una no conformidad cuenta si no terminó rechazada ni anulada: la regla del índice único parcial de la `0019`. */
const CUENTA = (sql: Cliente, alias: string) => sql`${sql(alias)}.estado NOT IN ('rechazado', 'anulado')`;

/**
 * La fila de Distribución de cada hallazgo (los que la página ya lista, que quien mira ve por `filtroPuntos`), en una consulta para la
 * no conformidad que cuenta y, si quien mira puede abrir alguna, otra para la configuración y otra para lo que acumula cada punto: no
 * crecen con las filas. La sugerencia (anexo §7.4), al Admin SGC y en la fila que todavía no tiene una no conformidad que cuente: el
 * hallazgo se reabrió alguna vez o su punto acumula `mej_sugerir_hallazgos` hallazgos en los últimos `mej_sugerir_meses` meses
 * (contados hasta `ahora`; todos los del punto, también el de la fila). Un aviso en pantalla: no es una tarea ni va a la campana.
 */
export async function engancheDeVerificacion(
  sesion: SesionFlujo,
  hallazgos: ReadonlyArray<{ id: number; puntoUsoId: number; reaperturas: number }>,
  opciones?: Opciones,
): Promise<Map<number, EngancheDeVerificacion>> {
  const resultado = new Map<number, EngancheDeVerificacion>();
  if (hallazgos.length === 0) return resultado;
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const ids = [...new Set(hallazgos.map((h) => h.id))];
  const filas = await sql`SELECT h.id, h.codigo, h.estado, h.resultado_cierre, h.correccion_requerida, h.verificacion_hallazgo_id,
      ${filtroHallazgos(sql, sesion)} AS visible
    FROM mejora_hallazgos h
    WHERE h.verificacion_hallazgo_id = ANY(${sql.array(ids)}::bigint[]) AND ${CUENTA(sql, "h")}`;
  const cuentan = new Map(filas.map((f) => [Number(f.verificacion_hallazgo_id), f]));

  const abre = puede(sesion, "mejora.gestionar");
  // Lo que acumula cada punto solo hace falta para las filas sin una que cuente y que no se reabrieron.
  const porPunto = hallazgos.filter((h) => abre && !cuentan.has(h.id) && h.reaperturas === 0).map((h) => h.puntoUsoId);
  const config = porPunto.length > 0 ? await obtenerConfigMejora({ sql }) : null;
  const acumulan = config ? await conteosPorPunto(sql, porPunto, config.sugerirMeses, ahora) : new Map<number, number>();

  for (const h of hallazgos) {
    const f = cuentan.get(h.id);
    const noConformidad = f
      ? {
          id: Number(f.id),
          codigo: f.codigo as string,
          estado: etiquetaDeEstado({
            estado: f.estado as EstadoHallazgo,
            resultadoCierre: (f.resultado_cierre as ResultadoCierre | null) ?? null,
            correccionRequerida: (f.correccion_requerida as boolean | null) ?? null,
          }),
          visible: f.visible === true,
        }
      : null;
    const puedeAbrir = abre && noConformidad === null;
    const cuantos = acumulan.get(h.puntoUsoId) ?? 0;
    const sugerir: SugerenciaDeVerificacion | null = !puedeAbrir
      ? null
      : h.reaperturas > 0
        ? { por: "reabierto", veces: h.reaperturas }
        : config && cuantos >= config.sugerirHallazgos
          ? { por: "acumula", hallazgos: cuantos, meses: config.sugerirMeses }
          : null;
    resultado.set(h.id, { noConformidad, puedeAbrir, sugerir });
  }
  return resultado;
}

/**
 * Cuántos hallazgos tiene cada punto en los últimos `meses` meses, contados hasta `ahora` (todos los del punto, de verificación o de
 * recogida): una consulta para todos.
 */
async function conteosPorPunto(sql: Cliente, puntos: readonly number[], meses: number, ahora: Date): Promise<Map<number, number>> {
  const conteos = await sql`SELECT punto_uso_id, count(*)::int AS cuantos FROM hallazgos
    WHERE punto_uso_id = ANY(${sql.array([...new Set(puntos)])}::bigint[])
      AND creado_en >= ${ahora}::timestamptz - make_interval(months => ${meses})
    GROUP BY punto_uso_id`;
  return new Map(conteos.map((f) => [Number(f.punto_uso_id), Number(f.cuantos)]));
}

/**
 * Lo que dice encima de la lista de hallazgos filtrada por un punto (anexo §7.4): al Admin SGC, si el punto acumula
 * `mej_sugerir_hallazgos` hallazgos en los últimos `mej_sugerir_meses` meses. Se decide con la cuenta del punto, aparte de la regla de
 * cada fila (donde un hallazgo reabierto dice «se reabrió»). Quien llama decide si alguna fila todavía puede abrir una no conformidad.
 */
export async function acumulaElPunto(
  sesion: SesionFlujo,
  puntoUsoId: number,
  opciones?: Opciones,
): Promise<Extract<SugerenciaDeVerificacion, { por: "acumula" }> | null> {
  if (!puede(sesion, "mejora.gestionar") || !Number.isSafeInteger(puntoUsoId) || puntoUsoId <= 0) return null;
  const sql = opciones?.sql ?? obtenerSql();
  const config = await obtenerConfigMejora({ sql });
  const cuantos = (await conteosPorPunto(sql, [puntoUsoId], config.sugerirMeses, opciones?.ahora ?? new Date())).get(puntoUsoId) ?? 0;
  return cuantos >= config.sugerirHallazgos ? { por: "acumula", hallazgos: cuantos, meses: config.sugerirMeses } : null;
}

/**
 * Los procesos activos del punto del hallazgo de verificación, de menor a mayor id (vacío: el punto no tiene ninguno, o el hallazgo no
 * existe). Sin la regla de quién ve el punto: los procesos de un punto no son secretos, y así la regla de la edición (el proceso de la
 * no conformidad, entre los del punto) nunca se salta en silencio.
 */
export async function procesosDelPunto(sql: Cliente, verificacionHallazgoId: number): Promise<number[]> {
  if (!Number.isSafeInteger(verificacionHallazgoId) || verificacionHallazgoId <= 0) return [];
  const filas = await sql`SELECT pp.proceso_id FROM hallazgos vh
    JOIN punto_uso_procesos pp ON pp.punto_uso_id = vh.punto_uso_id
    JOIN procesos p ON p.id = pp.proceso_id AND p.activo
    WHERE vh.id = ${verificacionHallazgoId}
    ORDER BY pp.proceso_id`;
  return filas.map((f) => Number(f.proceso_id));
}

/**
 * La corrección del hallazgo de verificación `verificacionHallazgoId` (anexo §7.2), para quien lo ve (`filtroPuntos`, la regla de
 * Distribución); nula para quien no lo ve y para un identificador que no existe (la misma respuesta).
 */
export async function correccionEnlazada(
  sesion: SesionFlujo,
  verificacionHallazgoId: number,
  opciones?: Opciones,
): Promise<CorreccionEnlazada | null> {
  if (!Number.isSafeInteger(verificacionHallazgoId) || verificacionHallazgoId <= 0) return null;
  const sql = opciones?.sql ?? obtenerSql();
  const [f] = await sql`SELECT vh.estado, vh.origen, vh.verificacion_id, vh.copia_id, pu.nombre AS punto,
      vh.corregido_en, uco.nombre AS corrigio, vh.nota_correccion, vh.cerrado_en, uce.nombre AS cerro, vh.nota_cierre
    FROM hallazgos vh
    JOIN puntos_uso pu ON pu.id = vh.punto_uso_id
    LEFT JOIN usuarios uco ON uco.id = vh.corregido_por
    LEFT JOIN usuarios uce ON uce.id = vh.cerrado_por
    WHERE vh.id = ${verificacionHallazgoId} AND ${filtroPuntos(sql, sesion)}`;
  if (!f) return null;
  const corregida = f.corregido_en !== null;
  const cerrada = !corregida && f.cerrado_en !== null;
  return {
    estado: ETIQUETA_ESTADO_DE_VERIFICACION[f.estado as string] ?? (f.estado as string),
    nota: corregida ? (f.nota_correccion as string | null) : cerrada ? (f.nota_cierre as string | null) : null,
    por: corregida ? (f.corrigio as string | null) : cerrada ? (f.cerro as string | null) : null,
    en: corregida ? (f.corregido_en as Date) : cerrada ? (f.cerrado_en as Date) : null,
    enlace: enlaceDeHallazgo({
      origen: f.origen as string,
      verificacionId: f.verificacion_id === null ? null : Number(f.verificacion_id),
      copiaId: f.copia_id === null ? null : Number(f.copia_id),
    }),
    punto: f.punto as string,
  };
}

/**
 * Lo que el registro (y su prellenado) necesita del hallazgo de verificación del que nace una no conformidad (anexo §7.2), si quien
 * registra lo ve (`filtroPuntos`); si no, o si no existe, nulo. `procesos`: los procesos activos del punto, de menor a mayor id
 * (vacío: el punto no tiene ninguno y se elige entre todos). `yaTiene`: ya hay una no conformidad que cuenta. `detectadoEn`: el día en
 * que se abrió, en la zona de la instalación (la conexión abre con ella).
 */
export type HallazgoParaAbrir = {
  id: number;
  punto: string;
  procesos: number[];
  documentoId: number | null;
  descripcion: string;
  detectadoEn: string;
  yaTiene: boolean;
};

export async function hallazgoParaAbrir(sql: Cliente, sesion: SesionFlujo, id: number): Promise<HallazgoParaAbrir | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const [f] = await sql`SELECT vh.id, pu.nombre AS punto, vh.documento_id, vh.descripcion, to_char(vh.creado_en, 'YYYY-MM-DD') AS detectado,
      coalesce((SELECT array_agg(pp.proceso_id ORDER BY pp.proceso_id) FROM punto_uso_procesos pp
        JOIN procesos p ON p.id = pp.proceso_id AND p.activo WHERE pp.punto_uso_id = pu.id), '{}') AS procesos,
      EXISTS (SELECT 1 FROM mejora_hallazgos nc WHERE nc.verificacion_hallazgo_id = vh.id AND ${CUENTA(sql, "nc")}) AS ya_tiene
    FROM hallazgos vh
    JOIN puntos_uso pu ON pu.id = vh.punto_uso_id
    WHERE vh.id = ${id} AND ${filtroPuntos(sql, sesion)}`;
  if (!f) return null;
  return {
    id: Number(f.id),
    punto: f.punto as string,
    procesos: (f.procesos as Array<string | number>).map(Number),
    documentoId: f.documento_id === null ? null : Number(f.documento_id),
    descripcion: f.descripcion as string,
    detectadoEn: f.detectado as string,
    yaTiene: f.ya_tiene === true,
  };
}
