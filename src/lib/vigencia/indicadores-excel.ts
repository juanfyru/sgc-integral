import ExcelJS from "exceljs";
import { agregarHoja, type Columna } from "@/lib/distribucion/hoja-excel";
import type { IndicadorMedido, ResultadoIndicadores, VencidoIndicador } from "@/lib/indicadores-documentales/metas";
import { mayuscula, textoCumple, textoMeta, textoPorcentaje, textoValor } from "@/lib/indicadores-documentales/textos";
import { fechaEnZona } from "@/lib/tramites/plazos";

/** `proceso`: el nombre del proceso elegido, o «todos». */
export type MetaIndicadores = { hospital: string; generadoEn: string; proceso: string; zona: string };

type FilaProceso = ResultadoIndicadores["dentroPorProceso"][number];

const INDICADORES: Array<Columna<IndicadorMedido>> = [
  { cab: "Indicador", ancho: 42, valor: (i) => i.nombre },
  { cab: "Valor", ancho: 14, valor: (i) => textoValor(i) },
  { cab: "Meta", ancho: 12, valor: (i) => textoMeta(i) },
  { cab: "Cumple", ancho: 12, valor: (i) => mayuscula(textoCumple(i.cumple)) },
  { cab: "Numerador", ancho: 12, valor: (i) => i.numerador },
  { cab: "Denominador", ancho: 13, valor: (i) => i.denominador },
  { cab: "Detalle", ancho: 56, valor: (i) => i.detalle },
];

/** `meta`: la de documentos dentro del plazo, para que la cifra no contradiga el veredicto. */
const porProceso = (meta: number): Array<Columna<FilaProceso>> => [
  { cab: "Sigla", ancho: 8, valor: (p) => p.sigla },
  { cab: "Proceso", ancho: 36, valor: (p) => p.proceso },
  { cab: "Vigentes", ancho: 10, valor: (p) => p.vigentes },
  { cab: "Dentro del plazo", ancho: 16, valor: (p) => p.alDia },
  { cab: "Sin fecha de revisión", ancho: 20, valor: (p) => p.sinFecha },
  { cab: "Vencidos", ancho: 10, valor: (p) => p.vigentes - p.sinFecha - p.alDia },
  {
    cab: "Porcentaje",
    ancho: 12,
    valor: (p) =>
      p.valor === null
        ? null
        : textoPorcentaje("dentro_plazo", { valor: p.valor, numerador: p.alDia, denominador: p.vigentes - p.sinFecha, cumple: p.cumple }, meta),
  },
  { cab: "Cumple", ancho: 12, valor: (p) => mayuscula(textoCumple(p.cumple)) },
];

function vencidos(zona: string): Array<Columna<VencidoIndicador>> {
  return [
    { cab: "Código", ancho: 16, valor: (v) => v.codigo },
    { cab: "Título", ancho: 42, valor: (v) => v.titulo },
    { cab: "Origen", ancho: 10, valor: (v) => (v.origen === "externo" ? "Externo" : "Interno") },
    { cab: "Proceso", ancho: 36, valor: (v) => `${v.sigla} · ${v.proceso}` },
    { cab: "Próxima revisión", ancho: 16, valor: (v) => (v.proximaRevision ? fechaEnZona(v.proximaRevision, zona) : null) },
    { cab: "Días vencido", ancho: 13, valor: (v) => v.dias },
    { cab: "Trámite abierto", ancho: 16, valor: (v) => v.tramite },
  ];
}

/**
 * Los indicadores del proceso documental (spec 13C §11.4): las cifras, el detalle por proceso y la lista de vencidos,
 * cada hoja con el encabezado institucional y las celdas neutralizadas (`agregarHoja`). Función pura: el resultado y
 * los metadatos ya formateados, sin BD ni reloj.
 */
export async function construirExcelIndicadores(r: ResultadoIndicadores, meta: MetaIndicadores): Promise<Buffer> {
  const filtro = `Periodo: ${r.periodo.etiqueta} · Proceso: ${meta.proceso}`;
  const base = { hospital: meta.hospital, generadoEn: meta.generadoEn };
  const wb = new ExcelJS.Workbook();
  agregarHoja(wb, "Indicadores", "Indicadores del proceso documental", INDICADORES, r.indicadores, {
    ...base,
    detalle: `${filtro} — Trámites publicados en el periodo: ${r.tramites.publicados} · en curso: ${r.tramites.enCurso} — Los de estado, a la fecha de generación`,
  });
  const metaDentro = r.indicadores.find((i) => i.clave === "dentro_plazo")?.meta ?? 0;
  agregarHoja(wb, "Por proceso", "Documentos dentro del plazo y vencidos, por proceso", porProceso(metaDentro), r.dentroPorProceso, {
    ...base,
    detalle: `${filtro} — A la fecha de generación`,
  });
  agregarHoja(wb, "Vencidos", "Documentos con revisión vencida", vencidos(meta.zona), r.vencidos, {
    ...base,
    detalle: `${filtro} — Total: ${r.vencidos.length}`,
  });
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
