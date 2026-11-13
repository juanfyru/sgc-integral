/**
 * La matriz del año (spec 14 §12.7, maqueta 5): una fila por indicador visible que se mide en el año, agrupadas por
 * proceso, con una celda por periodo ubicada por sus meses y la columna del acumulado. Los periodos y el acumulado vienen
 * de `lectura.ts`: son los mismos de la página del indicador. El Excel de resultados (spec §13) lee aquí las celdas de los
 * indicadores de la lista (`resultadosDeLaLista`).
 */
import { obtenerSql } from "@/db/cliente";
import { filtroIndicadores, type SujetoVisibilidad } from "@/lib/alcance";
import { mesesDe } from "@/lib/indicadores/periodos";
import { mesesEnPalabras, nombreCorto, repartirMeses } from "@/lib/indicadores/resultados";
import { rutaDeIndicador } from "@/lib/indicadores/rutas";
import { ETIQUETA_SEMAFORO, type EstadoDePunto } from "@/lib/indicadores/tipos";
import {
  anioValido,
  leerPeriodos,
  resumenAcumulado,
  type Base,
  type Opciones,
  type PeriodoLeido,
  type ResumenAcumulado,
} from "./lectura";
import { listarIndicadores, type FiltroDeLista } from "./lista";
import { asegurarMediciones, texto, versionesAprobadasDe, type VersionDeCalculo } from "./mediciones";

/** Una celda de la matriz (spec §12.7): los meses que ocupa, el valor, su estado, el nombre accesible entero y su enlace. */
export type CeldaDeMatriz = {
  desdeMes: number;
  hastaMes: number;
  /** «86 %», «s. d.», «n. a.», «—» (por venir); vacío donde no se mide. */
  texto: string;
  estado: EstadoDePunto | "vacia";
  /** «marzo: 86 %, Bien». */
  nombre: string;
  /** La fila de la medición en la tabla del año, que abre toda persona que ve el indicador; `null` sin medición. */
  enlace: string | null;
};

/** `retirado`: la fila lleva la marca «Retirado» (spec §6.4), en pantalla, en papel y en el Excel. */
export type FilaDeMatriz = { codigo: string; nombre: string; retirado: boolean; celdas: CeldaDeMatriz[]; anio: CeldaDeMatriz };
export type MatrizLeida = { procesos: { id: number; nombre: string; filas: FilaDeMatriz[] }[] };

function celdaDe(l: PeriodoLeido, ruta: string): CeldaDeMatriz {
  const [desdeMes, hastaMes] = mesesDe(l.periodo.clave);
  const n = nombreCorto(l.periodo.clave);
  const f = l.fila;
  const enlace = f.medicionId !== null ? `${ruta}#periodo-${l.periodo.clave}` : null;
  const celda = { desdeMes, hastaMes, enlace };
  if (f.estado === "por_venir") return { ...celda, texto: "—", estado: "futuro", nombre: `${n}: por venir`, enlace: null };
  if (f.noAplica) return { ...celda, texto: "n. a.", estado: "no-aplica", nombre: `${n}: no aplica` };
  if (f.resultado !== null) {
    return { ...celda, texto: f.resultado, estado: f.semaforo ?? "sin-meta", nombre: `${n}: ${f.resultado}, ${f.semaforo ? ETIQUETA_SEMAFORO[f.semaforo] : "sin meta"}` };
  }
  return { ...celda, texto: "s. d.", estado: "sin-dato", nombre: `${n}: sin dato` };
}

function celdaDelAnio(a: ResumenAcumulado, anio: number, ruta: string): CeldaDeMatriz {
  const valor = a.texto ? `${a.texto}, ${a.semaforo ? ETIQUETA_SEMAFORO[a.semaforo] : "sin meta"}` : "sin dato";
  return {
    desdeMes: 1,
    hastaMes: 12,
    // Sin acumulado es un dato que falta («s. d.»), no un periodo por venir («—», en la leyenda).
    texto: a.texto ?? "s. d.",
    estado: a.semaforo ?? (a.texto ? "sin-meta" : "sin-dato"),
    nombre: `Año ${anio}: ${valor}${a.rotulo ? `. ${a.rotulo}` : ""}`,
    enlace: ruta,
  };
}

/**
 * Las celdas de un indicador en el año: cada periodo en sus meses (`mesesDe`), lo que no se mide en una celda vacía y la
 * del acumulado. `null` si no se mide ese año: ni un activo con periodos en él, ni uno con mediciones de ese año. De un
 * retirado solo cuentan los periodos con medición: lo posterior al retiro (y lo vacío que el retiro quitó) no se mide, no
 * está «por venir» (Tarea 19, D-9).
 */
function celdasDelAnio(
  codigo: string,
  estado: string,
  todos: readonly PeriodoLeido[],
  versiones: readonly VersionDeCalculo[],
  anio: number,
  ahora: Date,
): { celdas: CeldaDeMatriz[]; anio: CeldaDeMatriz; acumulado: ResumenAcumulado; rigen: PeriodoLeido[] } | null {
  const propios = estado === "retirado" ? todos.filter((l) => l.fila.medicionId !== null) : todos;
  const rigen = propios.filter((l) => l.fila.deOtraPeriodicidad !== true);
  if (!propios.some((l) => l.fila.medicionId !== null) && !(estado === "activo" && rigen.length > 0)) return null;
  const ruta = `${rutaDeIndicador(codigo)}?vista=resultados&anio=${anio}`;
  const celdas = repartirMeses(
    // La periodicidad que rige pisa a la que quedó de otra; entre las que rigen, la versión más nueva.
    propios.map((l) => ({ celda: celdaDe(l, ruta), prioridad: (l.fila.deOtraPeriodicidad ? 0 : 10_000) + l.version.numero })),
    (desdeMes, hastaMes): CeldaDeMatriz => ({ desdeMes, hastaMes, texto: "", estado: "vacia", nombre: `${mesesEnPalabras(desdeMes, hastaMes)}: no se mide`, enlace: null }),
  );
  const acumulado = resumenAcumulado(rigen, versiones, ahora);
  return { celdas, anio: celdaDelAnio(acumulado, anio, ruta), acumulado, rigen };
}

/**
 * La matriz del año (spec §12.7, maqueta 5): una fila por indicador visible que se mide ese año (uno activo con periodos
 * en él, o cualquiera con mediciones de ese año), agrupadas por proceso (filtros: año, proceso, subproceso y clasificación de la versión aprobada vigente, como la lista); cada periodo ocupa sus meses (`mesesDe`), lo que
 * no se mide queda en una celda vacía y la columna «Año» es el acumulado, el mismo de la página. Antes de leer sus
 * mediciones abre los periodos terminados de los indicadores activos que lee, uno por uno (`indicadorIds`: el que falla se
 * registra y la matriz se pinta). Seis lecturas además de abrir periodos, sin importar cuántos indicadores haya.
 */
export async function matrizDelAnio(
  sesion: SujetoVisibilidad,
  f: { anio: number; procesoId?: number; subprocesoId?: number; clasificacionId?: number },
  opciones?: Opciones,
): Promise<MatrizLeida> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  if (!anioValido(f.anio)) return { procesos: [] };
  const filas = await sql`
    SELECT i.id, i.codigo, i.estado, i.inicio_medicion, i.soporte_obligatorio, i.proceso_id, p.nombre AS proceso, va.nombre
    FROM indicadores i
    JOIN procesos p ON p.id = i.proceso_id
    JOIN LATERAL (
      SELECT nombre, subproceso_id, clasificacion_id FROM indicador_versiones WHERE indicador_id = i.id AND estado = 'aprobada' ORDER BY numero DESC LIMIT 1
    ) va ON true
    WHERE ${filtroIndicadores(sql, sesion)} AND i.estado IN ('activo', 'retirado')
      ${f.procesoId ? sql`AND i.proceso_id = ${f.procesoId}` : sql``}
      ${f.subprocesoId ? sql`AND va.subproceso_id = ${f.subprocesoId}` : sql``}
      ${f.clasificacionId ? sql`AND va.clasificacion_id = ${f.clasificacionId}` : sql``}
    ORDER BY p.orden, p.nombre, p.id, i.codigo`;
  if (filas.length === 0) return { procesos: [] };
  await asegurarMediciones({ sql, ahora, indicadorIds: filas.filter((x) => x.estado === "activo").map((x) => Number(x.id)) });
  const versiones = await versionesAprobadasDe(
    sql,
    filas.map((x) => Number(x.id)),
  );
  const bases: Base[] = filas.map((x) => ({
    id: Number(x.id),
    inicio: texto(x.inicio_medicion),
    soporteObligatorio: x.soporte_obligatorio === true,
    versiones: versiones.get(Number(x.id)) ?? [],
  }));
  const leidos = await leerPeriodos(sql, bases, { desde: f.anio, hasta: f.anio }, ahora);
  const procesos: MatrizLeida["procesos"] = [];
  for (const x of filas) {
    const id = Number(x.id);
    const codigo = x.codigo as string;
    const medido = celdasDelAnio(codigo, x.estado as string, leidos.get(id) ?? [], versiones.get(id) ?? [], f.anio, ahora);
    if (!medido) continue;
    const fila: FilaDeMatriz = {
      codigo,
      nombre: (x.nombre as string | null) ?? codigo,
      retirado: x.estado === "retirado",
      celdas: medido.celdas,
      anio: medido.anio,
    };
    const procesoId = Number(x.proceso_id);
    const grupo = procesos.at(-1);
    if (grupo && grupo.id === procesoId) grupo.filas.push(fila);
    else procesos.push({ id: procesoId, nombre: x.proceso as string, filas: [fila] });
  }
  return { procesos };
}

/**
 * Una fila del Excel de resultados (spec §13): el indicador con los nombres de hoy de su clasificación, su tipo y su
 * unidad (como la lista), la meta del último periodo empezado del año y las celdas de la matriz de ese año.
 */
export type FilaDeResultados = {
  codigo: string;
  nombre: string;
  /** Lleva la marca «Retirado» junto al nombre (spec §6.4). */
  retirado: boolean;
  proceso: string;
  subproceso: string | null;
  clasificacion: string | null;
  tipo: string | null;
  unidad: string | null;
  meta: string | null;
  /** Las celdas de los doce meses, como en la matriz; `null` si el indicador no se mide ese año (sus meses van vacíos). */
  celdas: CeldaDeMatriz[] | null;
  /** La columna «Año»: el acumulado, el mismo de la matriz; `null` si no se mide ese año. */
  anio: CeldaDeMatriz | null;
  /** El rótulo del acumulado: «Acumulado parcial: falta julio», «Acumulado desde julio, versión 2». */
  nota: string | null;
};

/**
 * El Excel de resultados de la lista (spec §13): una fila por indicador que la lista deja con esos filtros
 * (`listarIndicadores`, que ya aplica lo que la persona ve), solo los que tienen ficha aprobada, con las celdas de la
 * matriz de `anio`. Tres lecturas además de las de la lista y las de los periodos, sin importar cuántos indicadores haya.
 */
export async function resultadosDeLaLista(
  sesion: SujetoVisibilidad,
  filtro: FiltroDeLista,
  anio: number,
  opciones?: Opciones,
): Promise<FilaDeResultados[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  if (!anioValido(anio)) return [];
  const lista = (await listarIndicadores(sesion, filtro, { sql, ahora })).filas.filter((f) => f.estado === "activo" || f.estado === "retirado");
  if (lista.length === 0) return [];
  const ids = lista.map((f) => f.id);
  const [datos, versiones] = await Promise.all([
    sql`SELECT i.id, i.inicio_medicion, i.soporte_obligatorio, coalesce(c.nombre, va.clasificacion_nombre) AS clasificacion,
        coalesce(t.nombre, va.tipo_nombre) AS tipo, coalesce(u.nombre, va.unidad_nombre) AS unidad
      FROM indicadores i
      JOIN LATERAL (
        SELECT clasificacion_id, clasificacion_nombre, tipo_id, tipo_nombre, unidad_id, unidad_nombre FROM indicador_versiones
        WHERE indicador_id = i.id AND estado = 'aprobada' ORDER BY numero DESC LIMIT 1
      ) va ON true
      LEFT JOIN clasificaciones_indicador c ON c.id = va.clasificacion_id
      LEFT JOIN tipos_indicador t ON t.id = va.tipo_id
      LEFT JOIN unidades_indicador u ON u.id = va.unidad_id
      WHERE i.id IN ${sql(ids)}`,
    versionesAprobadasDe(sql, ids),
  ]);
  const porId = new Map(datos.map((d) => [Number(d.id), d]));
  const bases: Base[] = datos.map((d) => ({
    id: Number(d.id),
    inicio: texto(d.inicio_medicion),
    soporteObligatorio: d.soporte_obligatorio === true,
    versiones: versiones.get(Number(d.id)) ?? [],
  }));
  const leidos = await leerPeriodos(sql, bases, { desde: anio, hasta: anio }, ahora);
  return lista.map((f) => {
    const d = porId.get(f.id);
    const medido = celdasDelAnio(f.codigo, f.estado, leidos.get(f.id) ?? [], versiones.get(f.id) ?? [], anio, ahora);
    // La meta del año: la del último periodo que ya empezó (la congelada o la programada); si ninguno, la de la lista.
    const empezado = medido?.rigen.filter((l) => l.periodo.desde.getTime() <= ahora.getTime()).at(-1);
    return {
      codigo: f.codigo,
      nombre: f.nombre,
      retirado: f.estado === "retirado",
      proceso: f.proceso,
      subproceso: f.subproceso,
      clasificacion: texto(d?.clasificacion),
      tipo: texto(d?.tipo),
      unidad: texto(d?.unidad),
      meta: empezado?.fila.meta ?? f.meta,
      celdas: medido?.celdas ?? null,
      anio: medido?.anio ?? null,
      nota: medido?.acumulado.rotulo ?? null,
    };
  });
}
