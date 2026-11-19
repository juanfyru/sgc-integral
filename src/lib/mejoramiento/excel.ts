/**
 * El Excel de la lista de hallazgos (spec 15 §16.3 y Apéndice A.6): la matriz consolidada del SGC-FO-28, una fila por actividad
 * (un hallazgo sin actividades, una fila), con el código y la ronda delante de sus diecisiete columnas y «Fin original» junto a
 * «Fecha límite»; al final, «Plan» y «Objetivo» (Fase 15B). Toda celda de texto pasa por `neutralizarFormula` (`agregarHoja`).
 * Puro: las filas llegan ya leídas y con lo que la persona no ve en nulo (`filasParaExcel`).
 */
import ExcelJS from "exceljs";
import { agregarHoja, type Celda, type Columna, type MetaHoja } from "@/lib/distribucion/hoja-excel";
import { cuenta } from "@/lib/plural";
import { fechaDeDia } from "./formato";
import { ETIQUETA_ORIGEN } from "./origenes";
import { estadoDeActividadEnTexto, ETIQUETA_CRITERIO, ETIQUETA_METODO_ANALISIS, ETIQUETA_TIPO_ACCION } from "./textos";
import type { CriterioEficacia, EstadoActividad, EstadoAjuste, MetodoAnalisis, Origen, TipoAccion, TipoAjuste } from "./tipos";

/** Una actividad de un plan aprobado, con lo que la persona ve de ella; nulo lo que no ve. */
export type ActividadDeExcel = {
  /** «A1.2»: el orden de su acción en la ronda y el suyo. */
  etiqueta: string;
  tipo: TipoAccion;
  accion: string;
  descripcion: string;
  /** Las causas raíz que ataca su acción, en su orden. */
  causas: string[];
  /** Los métodos de los análisis de su ronda. */
  metodos: MetodoAnalisis[];
  responsable: string;
  cargo: string | null;
  inicio: string;
  /** El fin vigente: la fecha límite. */
  fin: string;
  finOriginal: string;
  avance: number;
  estado: EstadoActividad;
  verificacion: "conforme" | "devuelta" | null;
  /** Sin terminar ni cancelar y con su fecha ya pasada (`venceLaActividad`): ese día y el de hoy, en la zona. */
  vencida: { vence: string; hoy: string } | null;
  /** Tiene al menos una reprogramación aprobada (spec §10.2). */
  reprogramada: boolean;
  /** Cuántos archivos de evidencia tiene; nulo para quien no abre la actividad. */
  evidencias: number | null;
  /** El último seguimiento; nulo si no hay o si la persona no abre la actividad. */
  ultimoSeguimiento: { fecha: string; realizado: string; barreras: string | null } | null;
  /** El último ajuste pedido para la actividad; nulo si no hay o si la persona no abre la actividad. */
  ajuste: { tipo: TipoAjuste; estado: EstadoAjuste; causa: string; decididoPor: string | null; decididoEn: string | null } | null;
  /** Lo que respondió Gerencia a la escalada (spec §10.7); solo a quien ve el hallazgo completo. */
  escalada: { nota: string; acta: { numero: string; fecha: string } | null } | null;
};

/** Una fila de la matriz: un hallazgo y una de sus actividades, o el hallazgo solo si no tiene ninguna. */
export type FilaDeExcel = {
  codigo: string;
  ronda: number;
  proceso: string;
  origen: Origen;
  fuente: string | null;
  titulo: string;
  descripcion: string;
  actividad: ActividadDeExcel | null;
  /** El resultado de la evaluación de la ronda y su criterio de eficacia (sin nombrar el indicador). */
  eficacia: { resultado: "eficaz" | "no_eficaz" | null; criterios: CriterioEficacia[]; criterioOtro: string | null } | null;
  /** La decisión del cierre (un hallazgo terminado), en la fila de su ronda en curso. */
  cierre: { etiqueta: string; en: string | null } | null;
  /** Fase 15B (anexo §10.6): el plan de mejoramiento («PM-2026-01 Nombre») y el enunciado del objetivo; nulos si no tiene. */
  plan: string | null;
  objetivo: string | null;
};

type FilaNumerada = FilaDeExcel & { n: number };

const DEL_AJUSTE: Record<TipoAjuste, string> = { reprogramar: "Reprogramación", agregar: "Actividad añadida", cancelar: "Cancelación" };

const dia = (d: string | null) => (d ? fechaDeDia(d) : null);
/** Las partes que hay, unidas; vacía si no hay ninguna. */
const unir = (partes: ReadonlyArray<string | null>, separador = " · "): string | null => {
  const hay = partes.filter((p): p is string => p !== null && p !== "");
  return hay.length > 0 ? hay.join(separador) : null;
};
const deLaActividad = (f: FilaNumerada, valor: (a: ActividadDeExcel) => Celda): Celda => (f.actividad ? valor(f.actividad) : null);

function causaRaiz(a: ActividadDeExcel): Celda {
  const metodos = [...new Set(a.metodos)].map((m) => ETIQUETA_METODO_ANALISIS[m]);
  return unir([a.causas.join("; "), metodos.length > 0 ? `Método: ${metodos.join(", ")}` : null]);
}

function evidencia(a: ActividadDeExcel): Celda {
  const s = a.ultimoSeguimiento;
  return unir([
    a.evidencias === null ? null : cuenta(a.evidencias, "archivo", "archivos"),
    s ? `Último seguimiento (${fechaDeDia(s.fecha)}): ${s.realizado}` : a.evidencias === null ? null : "Sin seguimientos",
  ]);
}

function eficacia(f: FilaNumerada): Celda {
  const e = f.eficacia;
  if (!e) return null;
  const resultado = e.resultado === "eficaz" ? "Eficaz" : e.resultado === "no_eficaz" ? "No eficaz" : "Sin evaluar";
  const criterios = e.criterios.map((c) => (c === "otro" && e.criterioOtro ? `${ETIQUETA_CRITERIO.otro}: ${e.criterioOtro}` : ETIQUETA_CRITERIO[c]));
  return unir([resultado, criterios.length > 0 ? `Criterio: ${criterios.join(", ")}` : null]);
}

function observaciones(a: ActividadDeExcel): Celda {
  return unir([
    a.ultimoSeguimiento?.barreras ? `Barreras: ${a.ultimoSeguimiento.barreras}` : null,
    a.ajuste ? `Causa del ajuste: ${a.ajuste.causa}` : null,
  ]);
}

function decision(f: FilaNumerada): Celda {
  const a = f.actividad;
  const x = a?.ajuste ?? null;
  const delAjuste = !x
    ? null
    : x.estado === "pendiente"
      ? `${DEL_AJUSTE[x.tipo]}: por decidir`
      : unir([`${DEL_AJUSTE[x.tipo]}: ${x.estado === "aprobado" ? "aprobada" : "negada"}`, x.decididoPor ? `por ${x.decididoPor}` : null, x.decididoEn ? `el ${fechaDeDia(x.decididoEn)}` : null], " ");
  const escalada = a?.escalada
    ? `Respuesta de Gerencia a la escalada: ${a.escalada.nota}${a.escalada.acta ? ` (acta ${a.escalada.acta.numero}, del ${fechaDeDia(a.escalada.acta.fecha)})` : ""}`
    : null;
  const cierre = f.cierre ? `Cierre: ${f.cierre.etiqueta}${f.cierre.en ? `, el ${fechaDeDia(f.cierre.en)}` : ""}` : null;
  return unir([delAjuste, escalada, cierre]);
}

const COLUMNAS: Array<Columna<FilaNumerada>> = [
  // El código de la actividad («A1.2»; vacío en un hallazgo sin actividades): el del hallazgo va en «Código del hallazgo».
  { cab: "Código", ancho: 9, valor: (f) => f.actividad?.etiqueta ?? null },
  { cab: "Ronda", ancho: 7, valor: (f) => f.ronda },
  { cab: "N°", ancho: 6, valor: (f) => f.n },
  { cab: "Proceso", ancho: 28, valor: (f) => f.proceso },
  { cab: "Fuente u origen", ancho: 32, valor: (f) => unir([ETIQUETA_ORIGEN[f.origen] ?? f.origen, f.fuente]) },
  { cab: "Tipo de acción", ancho: 14, valor: (f) => deLaActividad(f, (a) => ETIQUETA_TIPO_ACCION[a.tipo]) },
  { cab: "Código del hallazgo", ancho: 16, valor: (f) => f.codigo },
  { cab: "Descripción del hallazgo", ancho: 60, valor: (f) => `${f.titulo} — ${f.descripcion}` },
  { cab: "Causa raíz identificada", ancho: 50, valor: (f) => deLaActividad(f, causaRaiz) },
  { cab: "Acción formulada", ancho: 50, valor: (f) => deLaActividad(f, (a) => `${a.accion} · Actividad: ${a.descripcion}`) },
  { cab: "Responsable", ancho: 30, valor: (f) => deLaActividad(f, (a) => unir([a.responsable, a.cargo])) },
  { cab: "Fecha de inicio", ancho: 13, valor: (f) => deLaActividad(f, (a) => dia(a.inicio)) },
  { cab: "Fecha límite", ancho: 13, valor: (f) => deLaActividad(f, (a) => dia(a.fin)) },
  { cab: "Fin original", ancho: 13, valor: (f) => deLaActividad(f, (a) => dia(a.finOriginal)) },
  { cab: "Avance", ancho: 9, valor: (f) => deLaActividad(f, (a) => `${a.avance} %`) },
  { cab: "Estado", ancho: 28, valor: (f) => deLaActividad(f, estadoDeActividadEnTexto) },
  { cab: "Evidencia de implementación", ancho: 50, valor: (f) => deLaActividad(f, evidencia) },
  { cab: "Evaluación de eficacia y criterio", ancho: 40, valor: eficacia },
  { cab: "Observaciones o causa del retraso", ancho: 50, valor: (f) => deLaActividad(f, observaciones) },
  { cab: "Decisión de la Alta Dirección", ancho: 50, valor: decision },
  // La clasificación (Fase 15B, anexo §10.6), al final: las columnas de la matriz no se mueven.
  { cab: "Plan", ancho: 36, valor: (f) => f.plan },
  { cab: "Objetivo", ancho: 40, valor: (f) => f.objetivo },
];

/**
 * El libro de la lista (spec §16.3): la hoja «Hallazgos», con el encabezado institucional y la línea de filtros de `meta`, y una
 * fila por cada una de `filas`, numeradas en su orden («N°»).
 */
export async function construirExcelDeHallazgos(filas: FilaDeExcel[], meta: MetaHoja): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  agregarHoja(
    wb,
    "Hallazgos",
    "Matriz consolidada de hallazgos y planes de acción",
    COLUMNAS,
    filas.map((f, i) => ({ ...f, n: i + 1 })),
    meta,
  );
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
