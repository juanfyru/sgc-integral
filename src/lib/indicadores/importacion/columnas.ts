/**
 * Las columnas de la plantilla de importación de indicadores (spec fase 14A §5.2): el orden y los encabezados son
 * exactos. Puro: sin Node ni exceljs.
 */
export type ClaveColumna =
  | "codigo" | "nombre" | "proceso" | "subproceso" | "tipo" | "clasificacion" | "nivel" | "objetivo" | "forma"
  | "variableA" | "variableB" | "factor" | "formulaLibre" | "comoSeJuntaA" | "comoSeJuntaB" | "unidad" | "meta"
  | "metaHasta" | "sentido" | "periodicidad" | "fuente" | "cargo" | "riesgo" | "referenteNormativo" | "inicioMedicion"
  | "estado";

export type ListaDeColumna =
  | "procesos" | "subprocesos" | "tipos" | "clasificaciones" | "unidades" | "formas" | "factores" | "juntas" | "sentidos"
  | "periodicidades" | "estados";

export type Columna = {
  clave: ClaveColumna;
  encabezado: string;
  obligatoria: boolean;
  lista: ListaDeColumna | null;
  ayuda: string;
};

export const MAXIMO_FILAS_IMPORTACION = 500;

export const VALORES_FORMA = ["Porcentaje", "Tasa", "Promedio o razón", "Conteo", "Fórmula libre"] as const;
export const VALORES_FACTOR = ["100", "1000", "10000", "100000"] as const;
export const VALORES_JUNTA = ["Se suma", "Último valor", "Promedio"] as const;
export const VALORES_SENTIDO = ["Ascendente", "Descendente", "Constante"] as const;
export const VALORES_PERIODICIDAD = ["Mensual", "Bimestral", "Trimestral", "Semestral", "Anual"] as const;
export const VALORES_ESTADO = ["Aprobado", "Propuesto"] as const;

const AYUDA_JUNTA =
  "Cómo se junta el valor de la variable en el acumulado del año. Por omisión, «Se suma». Una población, un inventario o un total del Listado Maestro (algo que se cuenta en un momento) va como «Último valor»; el promedio de los periodos, como «Promedio». Solo cambia con un cambio mayor.";

export const COLUMNAS: readonly Columna[] = [
  { clave: "codigo", encabezado: "Código", obligatoria: true, lista: null, ayuda: "Código del indicador, SIGLA-ID-NNN (por ejemplo CNT-ID-001). Hasta 30 caracteres: letras, números y guiones. No puede repetirse ni existir ya en la app." },
  { clave: "nombre", encabezado: "Nombre", obligatoria: true, lista: null, ayuda: "Nombre del indicador (hasta 200 caracteres)." },
  { clave: "proceso", encabezado: "Proceso (sigla)", obligatoria: true, lista: "procesos", ayuda: "Sigla del proceso en el mapa de la app." },
  { clave: "subproceso", encabezado: "Subproceso", obligatoria: false, lista: "subprocesos", ayuda: "Nombre del subproceso como en el mapa. Si no coincide, la vista previa pide elegir a cuál corresponde." },
  { clave: "tipo", encabezado: "Tipo", obligatoria: true, lista: "tipos", ayuda: "Tipo de indicador (lista)." },
  { clave: "clasificacion", encabezado: "Clasificación", obligatoria: true, lista: "clasificaciones", ayuda: "Clasificación del indicador (lista)." },
  { clave: "nivel", encabezado: "Nivel", obligatoria: false, lista: null, ayuda: "Estructura, Proceso o Resultado (hasta 60 caracteres)." },
  { clave: "objetivo", encabezado: "Objetivo del indicador", obligatoria: false, lista: null, ayuda: "Qué busca medir el indicador (hasta 1.000 caracteres)." },
  { clave: "forma", encabezado: "Forma", obligatoria: true, lista: "formas", ayuda: "Porcentaje (A ÷ B × 100), Tasa (A ÷ B × factor), Promedio o razón (A ÷ B), Conteo (A) o Fórmula libre." },
  { clave: "variableA", encabezado: "Variable A", obligatoria: false, lista: null, ayuda: "Nombre de la variable A (el numerador). Obligatoria en todas las formas." },
  { clave: "variableB", encabezado: "Variable B", obligatoria: false, lista: null, ayuda: "Nombre de la variable B (el denominador). Obligatoria salvo en Conteo." },
  { clave: "factor", encabezado: "Factor", obligatoria: false, lista: "factores", ayuda: "Solo en Tasa: 100, 1000, 10000 o 100000 (sin separadores)." },
  { clave: "formulaLibre", encabezado: "Fórmula libre", obligatoria: false, lista: null, ayuda: "Solo en Fórmula libre: la fórmula con las letras A y B, por ejemplo A / (A + B). Se valida con el intérprete de la app." },
  { clave: "comoSeJuntaA", encabezado: "Cómo se junta A", obligatoria: false, lista: "juntas", ayuda: AYUDA_JUNTA },
  { clave: "comoSeJuntaB", encabezado: "Cómo se junta B", obligatoria: false, lista: "juntas", ayuda: AYUDA_JUNTA },
  { clave: "unidad", encabezado: "Unidad", obligatoria: true, lista: "unidades", ayuda: "Unidad del resultado (lista)." },
  { clave: "meta", encabezado: "Meta", obligatoria: false, lista: null, ayuda: "Número en la unidad del indicador: 95, no 0,95, si la unidad es porcentaje; sin separador de miles (1000, no 1.000). Vacía: el indicador queda sin meta y solo se vigila, sin colores ni alertas." },
  { clave: "metaHasta", encabezado: "Meta hasta", obligatoria: false, lista: null, ayuda: "Solo se usa con «Constante», que no se importa: déjela vacía." },
  { clave: "sentido", encabezado: "Sentido", obligatoria: true, lista: "sentidos", ayuda: "Ascendente (más es mejor) o Descendente (menos es mejor). «Constante» no se importa." },
  { clave: "periodicidad", encabezado: "Periodicidad", obligatoria: true, lista: "periodicidades", ayuda: "Mensual, Bimestral, Trimestral, Semestral o Anual." },
  { clave: "fuente", encabezado: "Fuente", obligatoria: false, lista: null, ayuda: "De dónde sale el dato (hasta 300 caracteres). Va a cada variable." },
  { clave: "cargo", encabezado: "Cargo responsable de medir", obligatoria: false, lista: null, ayuda: "Cargo de la estructura. Entra como responsable de medir y de analizar; si no coincide, la vista previa pide elegirlo." },
  { clave: "riesgo", encabezado: "Riesgo asociado", obligatoria: false, lista: null, ayuda: "Riesgo que el indicador vigila (hasta 300 caracteres)." },
  { clave: "referenteNormativo", encabezado: "Referente normativo", obligatoria: false, lista: null, ayuda: "Norma o requisito que sustenta el indicador (hasta 120 caracteres)." },
  { clave: "inicioMedicion", encabezado: "Inicio de medición", obligatoria: false, lista: null, ayuda: "Mes en que empieza a medirse, AAAA-MM (por ejemplo 2026-09). Vacío: enero del año de la importación." },
  { clave: "estado", encabezado: "Estado", obligatoria: true, lista: "estados", ayuda: "Aprobado (ya aprobado antes de la app) o Propuesto (queda en borrador y sigue el camino de aprobación)." },
];

export const ENCABEZADO_DE: Record<ClaveColumna, string> = Object.fromEntries(COLUMNAS.map((c) => [c.clave, c.encabezado])) as Record<
  ClaveColumna,
  string
>;

/** Una fila de la plantilla leída: el número es el de la hoja y las celdas son texto recortado. */
export type FilaLeida = { numero: number; celdas: Partial<Record<ClaveColumna, string>> };

/** Las columnas cuya obligatoriedad depende de la forma se muestran así en la hoja de instrucciones. */
export const SEGUN_LA_FORMA: readonly ClaveColumna[] = ["variableA", "variableB"];
