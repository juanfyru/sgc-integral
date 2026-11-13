/**
 * Los Excel de indicadores (spec §13): el de un indicador (hojas «Ficha» y «Resultados <año>») y el de resultados de la
 * lista (una fila por indicador, los doce meses y el año). Con el encabezado institucional y toda celda de texto pasada
 * por `neutralizarFormula` (`agregarHoja`). Ni soportes ni observaciones. Funciones puras: los datos y los metadatos ya
 * leídos, sin BD ni reloj.
 */
import ExcelJS from "exceljs";
import type { ImpresionDelAnio } from "@/db/consultas/indicadores/impresion";
import type { FiltroDeLista, OpcionesDeLista } from "@/db/consultas/indicadores/lista";
import type { FilaDeResultados } from "@/db/consultas/indicadores/matriz";
import { neutralizarFormula } from "@/lib/celdas";
import { agregarHoja, type Celda, type Columna, type MetaHoja } from "@/lib/distribucion/hoja-excel";
import { MESES } from "@/lib/indicadores-documentales/periodo";
import { textoFecha } from "@/lib/vigencia/plazo";
import { zonaHoraria } from "@/lib/zona-horaria";
import {
  analisisEnTexto,
  camposDeFicha,
  camposDeOperacion,
  columnasDeVariables,
  cumpleEnTexto,
  estadoEnTexto,
  fechaDeFirma,
  firmasDeFicha,
  marcasDeFila,
  rigeDesdeEnTexto,
  semaforoDeResultado,
  semaforoEnTexto,
  type CampoDeTexto,
} from "./ficha-en-texto";
import { ETIQUETA_REPORTE_DE_LISTA, ETIQUETA_SEMAFORO_DE_LISTA } from "./filtros";

const MES_CORTO = MESES.map((m) => m.charAt(0).toUpperCase() + m.slice(1, 3));

// ─────────────────────────────────────────────────────────────────────────────
// El de un indicador
// ─────────────────────────────────────────────────────────────────────────────

type FilaDeFicha = { seccion: string; termino: string; valor: string };

const FICHA: Array<Columna<FilaDeFicha>> = [
  { cab: "Sección", ancho: 24, valor: (f) => f.seccion },
  { cab: "Campo", ancho: 30, valor: (f) => f.termino },
  { cab: "Valor", ancho: 90, valor: (f) => f.valor },
];

const enSeccion = (seccion: string, campos: CampoDeTexto[]): FilaDeFicha[] =>
  campos.map((c) => ({ seccion, termino: c.termino, valor: c.detalle ? `${c.valor} — ${c.detalle}` : c.valor }));

/** Una fila de la hoja de resultados: un periodo o el acumulado del año, ya en texto salvo las variables (números). */
type FilaDeResultado = {
  periodo: string;
  version: number | null;
  valores: Record<string, number | null>;
  resultado: string | null;
  meta: string | null;
  cumple: string;
  semaforo: string;
  estado: string;
  analisis: string;
  marcas: string;
};

function columnasDeResultados(variables: { letra: string; nombre: string }[]): Array<Columna<FilaDeResultado>> {
  return [
    { cab: "Periodo", ancho: 28, valor: (f) => f.periodo },
    { cab: "Versión de la ficha", ancho: 10, valor: (f) => f.version },
    // El encabezado de una variable es texto del usuario: `agregarHoja` solo sanea las filas de datos.
    ...variables.map((v): Columna<FilaDeResultado> => ({ cab: neutralizarFormula(v.nombre), ancho: 16, valor: (f) => f.valores[v.letra] ?? null })),
    { cab: "Resultado", ancho: 12, valor: (f) => f.resultado },
    { cab: "Meta", ancho: 14, valor: (f) => f.meta },
    { cab: "Cumple", ancho: 9, valor: (f) => f.cumple || null },
    { cab: "Semáforo", ancho: 11, valor: (f) => f.semaforo || null },
    { cab: "Estado", ancho: 24, valor: (f) => f.estado || null },
    { cab: "Análisis", ancho: 60, valor: (f) => f.analisis || null },
    { cab: "Marcas", ancho: 36, valor: (f) => f.marcas || null },
  ];
}

/**
 * El Excel de un indicador (spec §13): la hoja «Ficha», con el contenido firmado de la versión que regía el año (§7.2),
 * sus firmas y los datos de operación, y la hoja «Resultados <año>», con una fila por periodo (periodo, versión con que se
 * calculó, cada variable, resultado, meta, «Cumple», semáforo, estado, análisis y marcas) y la del «Acumulado del año».
 */
export async function construirExcelDeIndicador(d: ImpresionDelAnio, meta: MetaHoja): Promise<Buffer> {
  const zona = zonaHoraria();
  const { ficha, resultados: r } = d;
  const { identificacion, estructura } = camposDeFicha(ficha);
  const aprobada = d.versiones.find((v) => v.id === ficha.versionId)?.aprobadaEn ?? ficha.firmas.aprobo?.fecha ?? null;
  const firmas = firmasDeFicha(ficha).map((f) => ({
    seccion: "Firmas",
    termino: f.rol,
    valor: f.nombre ? [f.nombre, f.cargo, f.fecha ? fechaDeFirma(f.fecha) : null].filter(Boolean).join(" · ") : (f.nota ?? ""),
  }));
  const filasDeFicha: FilaDeFicha[] = [
    { seccion: "Encabezado", termino: "Código", valor: d.codigo },
    { seccion: "Encabezado", termino: "Versión", valor: String(ficha.numero) },
    { seccion: "Encabezado", termino: "Vigente desde", valor: aprobada ? textoFecha(aprobada, zona) : "—" },
    { seccion: "Encabezado", termino: "Rige desde", valor: rigeDesdeEnTexto(ficha) },
    ...enSeccion("Identificación", identificacion),
    ...enSeccion("Estructura de medición", estructura),
    ...firmas,
    ...enSeccion("Datos de operación", camposDeOperacion(d.operacion)),
  ];
  const wb = new ExcelJS.Workbook();
  agregarHoja(wb, "Ficha", "Ficha técnica de indicador", FICHA, filasDeFicha, meta);

  const variables = columnasDeVariables(r.filas);
  const filas: FilaDeResultado[] = r.filas.map((f) => ({
    periodo: f.etiqueta,
    version: f.version,
    // Las variables, como número de celda (se pueden sumar en la hoja); el resultado y la meta, con su texto.
    valores: Object.fromEntries(f.valores.map((v) => [v.letra, v.numero])),
    resultado: f.resultado,
    meta: f.meta,
    cumple: cumpleEnTexto(f.cumple),
    semaforo: semaforoEnTexto(f),
    estado: estadoEnTexto(f),
    analisis: analisisEnTexto(f),
    marcas: marcasDeFila(f, d.periodosSinCumplir).join(" · "),
  }));
  const a = r.acumulado;
  filas.push({
    periodo: "Acumulado del año",
    version: null,
    valores: a.numeros,
    resultado: a.texto,
    meta: a.metaEnTexto,
    cumple: a.texto ? cumpleEnTexto(a.cumple) : "",
    semaforo: semaforoDeResultado(a.semaforo, false, a.texto !== null, a.cumple),
    estado: "",
    analisis: "",
    marcas: a.rotulo ?? "",
  });
  agregarHoja(wb, `Resultados ${d.anio}`, `Seguimiento y medición · ${d.anio}`, columnasDeResultados(variables), filas, meta);
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

// ─────────────────────────────────────────────────────────────────────────────
// El de resultados de la lista
// ─────────────────────────────────────────────────────────────────────────────

/** La celda de un mes: el texto de la celda de la matriz que empieza en él; en los demás meses de un periodo, vacía. */
function mesDe(f: FilaDeResultados, mes: number): Celda {
  const c = f.celdas?.find((x) => x.desdeMes === mes);
  return c && c.estado !== "vacia" ? c.texto : null;
}

const RESULTADOS: Array<Columna<FilaDeResultados>> = [
  { cab: "Código", ancho: 16, valor: (f) => f.codigo },
  // Un retirado lleva la marca junto al nombre, como en la matriz (spec §6.4; Tarea 19, D-9).
  { cab: "Nombre", ancho: 42, valor: (f) => (f.retirado ? `${f.nombre} (Retirado)` : f.nombre) },
  { cab: "Proceso", ancho: 30, valor: (f) => f.proceso },
  { cab: "Subproceso", ancho: 24, valor: (f) => f.subproceso },
  { cab: "Clasificación", ancho: 14, valor: (f) => f.clasificacion },
  { cab: "Tipo", ancho: 12, valor: (f) => f.tipo },
  { cab: "Unidad", ancho: 14, valor: (f) => f.unidad },
  { cab: "Meta", ancho: 14, valor: (f) => f.meta },
  ...MES_CORTO.map((m, i): Columna<FilaDeResultados> => ({ cab: m, ancho: 9, valor: (f) => mesDe(f, i + 1) })),
  { cab: "Año", ancho: 10, valor: (f) => f.anio?.texto ?? null },
  { cab: "Nota del año", ancho: 36, valor: (f) => f.nota },
];
/** La columna del primer mes (Ene), contando desde 1. */
const PRIMER_MES = RESULTADOS.findIndex((c) => c.cab === MES_CORTO[0]) + 1;

/**
 * Lo que dice la línea de filtros del Excel de resultados: el año y cada filtro de la lista con su nombre
 * («Proceso: Gestión del Talento Humano · Semáforo: Crítico»). Un id que ya no está en los catálogos se dice «no
 * disponible».
 */
export function detalleDeFiltros(anio: number, f: FiltroDeLista, o: Pick<OpcionesDeLista, "procesos" | "subprocesos" | "clasificaciones" | "tipos">): string {
  const nombre = (lista: { id: number; nombre: string }[], id: number) => lista.find((x) => x.id === id)?.nombre ?? "no disponible";
  return [
    `Año: ${anio}`,
    f.procesoId !== undefined ? `Proceso: ${nombre(o.procesos, f.procesoId)}` : null,
    f.subprocesoId !== undefined ? `Subproceso: ${nombre(o.subprocesos, f.subprocesoId)}` : null,
    f.clasificacionId !== undefined ? `Clasificación: ${nombre(o.clasificaciones, f.clasificacionId)}` : null,
    f.tipoId !== undefined ? `Tipo: ${nombre(o.tipos, f.tipoId)}` : null,
    f.semaforo ? `Semáforo: ${ETIQUETA_SEMAFORO_DE_LISTA[f.semaforo]}` : null,
    f.reporte ? `Reporte: ${ETIQUETA_REPORTE_DE_LISTA[f.reporte]}` : null,
    f.participo ? "Donde participo" : null,
    f.texto ? `Texto: «${f.texto}»` : null,
    f.retirados ? "Incluye retirados" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * El Excel de resultados (spec §13): la hoja «Resultados <año>», una fila por indicador de la lista con su código, nombre,
 * proceso, subproceso, clasificación, tipo, unidad y meta, los doce meses y el año con las celdas de la matriz (los mismos
 * textos: «s. d.», «n. a.», «—»; un periodo de varios meses ocupa sus celdas unidas) y la nota del acumulado. Un indicador
 * que no se mide ese año sale con sus meses vacíos.
 */
export async function construirExcelDeResultados(filas: FilaDeResultados[], anio: number, meta: MetaHoja): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const nombre = `Resultados ${anio}`;
  const cabecera = agregarHoja(wb, nombre, `Resultados de los indicadores · ${anio}`, RESULTADOS, filas, meta);
  const hoja = wb.getWorksheet(nombre)!;
  // Las filas de datos van debajo de la cabecera: un periodo de varios meses une sus celdas, como en la matriz.
  const primera = cabecera + 1;
  filas.forEach((f, i) => {
    for (const c of f.celdas ?? []) {
      if (c.hastaMes > c.desdeMes && c.estado !== "vacia") hoja.mergeCells(primera + i, PRIMER_MES + c.desdeMes - 1, primera + i, PRIMER_MES + c.hastaMes - 1);
    }
  });
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
