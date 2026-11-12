/**
 * Los filtros de estado de la lista de indicadores (spec §12.2): sus valores en la URL y sus nombres, una sola definición
 * para el formulario de la lista, la línea de filtros del Excel de resultados y la frase de la bitácora. Sin Node ni BD.
 */

export const SEMAFOROS_DE_LISTA = ["bien", "atencion", "critico", "sin-dato"] as const;
export const REPORTES_DE_LISTA = ["por-reportar", "falta-analisis", "vencida", "requiere-accion"] as const;

export type SemaforoDeLista = (typeof SEMAFOROS_DE_LISTA)[number];
export type ReporteDeLista = (typeof REPORTES_DE_LISTA)[number];

export const ETIQUETA_SEMAFORO_DE_LISTA: Record<SemaforoDeLista, string> = {
  bien: "Bien",
  atencion: "Atención",
  critico: "Crítico",
  "sin-dato": "Sin dato",
};

export const ETIQUETA_REPORTE_DE_LISTA: Record<ReporteDeLista, string> = {
  "por-reportar": "Por reportar",
  "falta-analisis": "Falta el análisis",
  vencida: "Vencido",
  "requiere-accion": "Requiere acción de mejora",
};
