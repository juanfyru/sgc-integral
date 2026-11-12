/**
 * La matriz del año (spec 14 §12.7, maqueta 5): una fila por indicador visible que se mide en el año, agrupadas por
 * proceso, con una celda por periodo ubicada por sus meses y la columna del acumulado. Los periodos y el acumulado vienen
 * de `lectura.ts`: son los mismos de la página del indicador.
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
import { asegurarMediciones, texto, versionesAprobadasDe } from "./mediciones";

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

export type FilaDeMatriz = { codigo: string; nombre: string; celdas: CeldaDeMatriz[]; anio: CeldaDeMatriz };
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
 * La matriz del año (spec §12.7, maqueta 5): una fila por indicador visible que se mide ese año (uno activo con periodos
 * en él, o cualquiera con mediciones de ese año), agrupadas por proceso; cada periodo ocupa sus meses (`mesesDe`), lo que
 * no se mide queda en una celda vacía y la columna «Año» es el acumulado, el mismo de la página. Antes de leer abre los
 * periodos terminados. Seis lecturas además de abrir periodos, sin importar cuántos indicadores haya.
 */
export async function matrizDelAnio(
  sesion: SujetoVisibilidad,
  f: { anio: number; procesoId?: number; clasificacionId?: number },
  opciones?: Opciones,
): Promise<MatrizLeida> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  if (!anioValido(f.anio)) return { procesos: [] };
  await asegurarMediciones({ sql, ahora });
  const filas = await sql`
    SELECT i.id, i.codigo, i.estado, i.inicio_medicion, i.soporte_obligatorio, i.proceso_id, p.nombre AS proceso, va.nombre
    FROM indicadores i
    JOIN procesos p ON p.id = i.proceso_id
    JOIN LATERAL (
      SELECT nombre, clasificacion_id FROM indicador_versiones WHERE indicador_id = i.id AND estado = 'aprobada' ORDER BY numero DESC LIMIT 1
    ) va ON true
    WHERE ${filtroIndicadores(sql, sesion)} AND i.estado IN ('activo', 'retirado')
      ${f.procesoId ? sql`AND i.proceso_id = ${f.procesoId}` : sql``}
      ${f.clasificacionId ? sql`AND va.clasificacion_id = ${f.clasificacionId}` : sql``}
    ORDER BY p.orden, p.nombre, p.id, i.codigo`;
  if (filas.length === 0) return { procesos: [] };
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
    const propios = leidos.get(id) ?? [];
    const rigen = propios.filter((l) => l.fila.deOtraPeriodicidad !== true);
    if (!propios.some((l) => l.fila.medicionId !== null) && !(x.estado === "activo" && rigen.length > 0)) continue;
    const codigo = x.codigo as string;
    const ruta = `${rutaDeIndicador(codigo)}?vista=resultados&anio=${f.anio}`;
    const celdas = repartirMeses(
      // La periodicidad que rige pisa a la que quedó de otra; entre las que rigen, la versión más nueva.
      propios.map((l) => ({ celda: celdaDe(l, ruta), prioridad: (l.fila.deOtraPeriodicidad ? 0 : 10_000) + l.version.numero })),
      (desdeMes, hastaMes): CeldaDeMatriz => ({ desdeMes, hastaMes, texto: "", estado: "vacia", nombre: `${mesesEnPalabras(desdeMes, hastaMes)}: no se mide`, enlace: null }),
    );
    const fila: FilaDeMatriz = {
      codigo,
      nombre: (x.nombre as string | null) ?? codigo,
      celdas,
      anio: celdaDelAnio(resumenAcumulado(rigen, versiones.get(id) ?? [], ahora), f.anio, ruta),
    };
    const procesoId = Number(x.proceso_id);
    const grupo = procesos.at(-1);
    if (grupo && grupo.id === procesoId) grupo.filas.push(fila);
    else procesos.push({ id: procesoId, nombre: x.proceso as string, filas: [fila] });
  }
  return { procesos };
}
