// Registro de los diez cálculos automáticos (anexo 14B, §5.1). Módulo puro: lo importan el servidor
// y el formulario del cliente, así que no toca Node ni la BD.
import { fraccion } from "../formula/fraccion";
import type { Indicador } from "../../indicadores-documentales/metas";
import type { Consolidacion } from "../tipos";

export const CLAVES_DE_CALCULO = [
  "dentro_plazo",
  "vencidos",
  "aprobacion",
  "acuses",
  "conformidad_fecha",
  "conformidad_periodo",
  "externos",
  "etapas",
  "reportes_a_tiempo",
  "objetivos_cumplidos",
] as const;
export type ClaveDeCalculo = (typeof CLAVES_DE_CALCULO)[number];

export const ALCANCES_DE_CALCULO = ["entidad", "proceso", "calidad", "institucional", "todos"] as const;
export type AlcanceDeCalculo = (typeof ALCANCES_DE_CALCULO)[number];

export const ETIQUETA_ALCANCE: Record<AlcanceDeCalculo, string> = {
  entidad: "Toda la entidad",
  proceso: "El proceso de la ficha",
  calidad: "Objetivos de calidad",
  institucional: "Objetivos institucionales",
  todos: "Todos los objetivos",
};

export type VariableDeCalculo = {
  letra: "A" | "B";
  nombre: string;
  descripcion: string;
  consolidacion: Consolidacion;
};

export type DefinicionDeCalculo = {
  clave: ClaveDeCalculo;
  nombre: string;
  clase: "estado" | "flujo";
  forma: "porcentaje" | "razon" | "conteo";
  variables: VariableDeCalculo[];
  alcances: readonly AlcanceDeCalculo[];
  tendencia: "ascendente" | "descendente";
  reconstruible: boolean;
  sinDatos: string | null;
  unidadSugerida: "Porcentaje" | "Días" | "Número";
  documental: Indicador | null;
  exigeMeta: boolean;
};

function variables(
  consolidacion: Consolidacion,
  a: [string, string],
  b?: [string, string],
): VariableDeCalculo[] {
  const lista: VariableDeCalculo[] = [{ letra: "A", nombre: a[0], descripcion: a[1], consolidacion }];
  if (b) lista.push({ letra: "B", nombre: b[0], descripcion: b[1], consolidacion });
  return lista;
}

const POR_PROCESO = ["entidad", "proceso"] as const;

export const CALCULOS: Record<ClaveDeCalculo, DefinicionDeCalculo> = {
  dentro_plazo: {
    clave: "dentro_plazo",
    nombre: "Documentos dentro de su plazo de revisión",
    clase: "estado",
    forma: "porcentaje",
    variables: variables(
      "ultimo",
      ["Documentos vigentes dentro de su plazo", "Cuenta los documentos vigentes cuya revisión no ha vencido al cierre del periodo"],
      ["Documentos vigentes con fecha de revisión", "Cuenta los documentos vigentes que tienen fecha de próxima revisión al cierre del periodo"],
    ),
    alcances: POR_PROCESO,
    tendencia: "ascendente",
    reconstruible: false,
    sinDatos: "No había documentos vigentes con fecha de revisión",
    unidadSugerida: "Porcentaje",
    documental: "dentro_plazo",
    exigeMeta: false,
  },
  vencidos: {
    clave: "vencidos",
    nombre: "Documentos con revisión vencida",
    clase: "estado",
    forma: "conteo",
    variables: variables("ultimo", [
      "Documentos vigentes con la revisión vencida",
      "Cuenta los documentos vigentes cuya fecha de revisión ya pasó al cierre del periodo",
    ]),
    alcances: POR_PROCESO,
    tendencia: "descendente",
    reconstruible: false,
    sinDatos: null,
    unidadSugerida: "Número",
    documental: "vencidos",
    exigeMeta: false,
  },
  aprobacion: {
    clave: "aprobacion",
    nombre: "Tiempo de aprobación",
    clase: "flujo",
    forma: "razon",
    variables: variables(
      "suma",
      ["Días entre la aceptación y la publicación, sumados", "Suma de los días entre la aceptación de la solicitud y la publicación, de los trámites publicados en el periodo"],
      ["Trámites publicados", "Cuenta los trámites publicados en el periodo"],
    ),
    alcances: POR_PROCESO,
    tendencia: "descendente",
    reconstruible: true,
    sinDatos: "No se publicó ningún trámite en el periodo",
    unidadSugerida: "Días",
    documental: "aprobacion",
    exigeMeta: false,
  },
  acuses: {
    clave: "acuses",
    nombre: "Acuses de lectura confirmados",
    clase: "flujo",
    forma: "porcentaje",
    variables: variables(
      "suma",
      ["Acuses confirmados", "Cuenta los acuses de lectura pedidos en el periodo que la persona ya confirmó"],
      ["Acuses confirmados y pendientes", "Cuenta los acuses de lectura pedidos en el periodo, confirmados o todavía pendientes"],
    ),
    alcances: POR_PROCESO,
    tendencia: "ascendente",
    reconstruible: false,
    sinDatos: "No se pidieron acuses de lectura en el periodo",
    unidadSugerida: "Porcentaje",
    documental: "acuses",
    exigeMeta: false,
  },
  conformidad_fecha: {
    clave: "conformidad_fecha",
    nombre: "Conformidad en puntos de uso, a la fecha",
    clase: "estado",
    forma: "porcentaje",
    variables: variables(
      "ultimo",
      ["Puntos conformes en su última verificación", "Cuenta los puntos de uso cuya última verificación cerrada resultó conforme"],
      ["Puntos verificados", "Cuenta los puntos de uso que tienen una verificación cerrada"],
    ),
    alcances: ["entidad"],
    tendencia: "ascendente",
    reconstruible: false,
    sinDatos: "Ningún punto de uso tenía una verificación cerrada",
    unidadSugerida: "Porcentaje",
    documental: "conformidad",
    exigeMeta: true,
  },
  conformidad_periodo: {
    clave: "conformidad_periodo",
    nombre: "Conformidad en puntos de uso, del periodo",
    clase: "flujo",
    forma: "porcentaje",
    variables: variables(
      "suma",
      ["Verificaciones conformes cerradas", "Cuenta las verificaciones cerradas en el periodo cuyo resultado fue conforme"],
      ["Verificaciones cerradas", "Cuenta las verificaciones cerradas en el periodo"],
    ),
    alcances: ["entidad"],
    tendencia: "ascendente",
    reconstruible: true,
    sinDatos: "No se cerró ninguna verificación en el periodo",
    unidadSugerida: "Porcentaje",
    documental: null,
    exigeMeta: false,
  },
  externos: {
    clave: "externos",
    nombre: "Externos verificados al día",
    clase: "estado",
    forma: "porcentaje",
    variables: variables(
      "ultimo",
      ["Externos vigentes al día", "Cuenta los documentos externos vigentes cuya verificación no ha vencido al cierre del periodo"],
      ["Externos vigentes con fecha de verificación", "Cuenta los documentos externos vigentes que tienen fecha de verificación al cierre del periodo"],
    ),
    alcances: POR_PROCESO,
    tendencia: "ascendente",
    reconstruible: false,
    sinDatos: "No había documentos externos vigentes con fecha de verificación",
    unidadSugerida: "Porcentaje",
    documental: "externos",
    exigeMeta: false,
  },
  etapas: {
    clave: "etapas",
    nombre: "Etapas del trámite cerradas en plazo",
    clase: "flujo",
    forma: "porcentaje",
    variables: variables(
      "suma",
      ["Etapas cerradas en plazo", "Cuenta las etapas de trámite cerradas en el periodo dentro de su fecha límite"],
      ["Etapas cerradas con fecha límite", "Cuenta las etapas de trámite cerradas en el periodo que tenían fecha límite"],
    ),
    alcances: POR_PROCESO,
    tendencia: "ascendente",
    reconstruible: true,
    sinDatos: "No se cerró ninguna etapa con fecha límite en el periodo",
    unidadSugerida: "Porcentaje",
    documental: "etapas",
    exigeMeta: false,
  },
  reportes_a_tiempo: {
    clave: "reportes_a_tiempo",
    nombre: "Reportes de indicadores a tiempo",
    clase: "flujo",
    forma: "porcentaje",
    variables: variables(
      "suma",
      ["Mediciones reportadas dentro de su plazo", "Cuenta las mediciones con fecha límite en el periodo cuyo primer reporte fue en esa fecha o antes"],
      ["Mediciones con fecha límite en el periodo", "Cuenta las mediciones ordinarias de indicadores digitados cuya fecha límite cae en el periodo"],
    ),
    alcances: POR_PROCESO,
    tendencia: "ascendente",
    reconstruible: true,
    sinDatos: "Ninguna medición tenía su fecha límite en el periodo",
    unidadSugerida: "Porcentaje",
    documental: null,
    exigeMeta: false,
  },
  objetivos_cumplidos: {
    clave: "objetivos_cumplidos",
    nombre: "Objetivos cumplidos",
    clase: "flujo",
    forma: "porcentaje",
    variables: variables(
      "ultimo",
      ["Objetivos cumplidos", "Cuenta los objetivos cuyas últimas mediciones del periodo alcanzaron todas la meta"],
      ["Objetivos con medición en el periodo", "Cuenta los objetivos que tuvieron al menos una medición con meta en el periodo"],
    ),
    alcances: ["calidad", "institucional", "todos"],
    tendencia: "ascendente",
    reconstruible: true,
    sinDatos: "Ningún objetivo tuvo medición en el periodo",
    unidadSugerida: "Porcentaje",
    documental: null,
    exigeMeta: false,
  },
};

export function calculoDe(clave: unknown): DefinicionDeCalculo | null {
  if (typeof clave !== "string") return null;
  return (CLAVES_DE_CALCULO as readonly string[]).includes(clave) ? CALCULOS[clave as ClaveDeCalculo] : null;
}

export const META_ENTERA = "La meta de este cálculo debe ser un número entero: es la que muestran Vigencia y Distribución";

/**
 * Un cálculo con tarjeta de Vigencia (`documental`): la meta de su ficha rige también la tarjeta, Distribución y
 * Configuración documental (anexo 14B, §6), que deciden en enteros (AGENTS.md), así que la exige entera, también la que
 * se programa para un periodo.
 */
export function metaNoEntera(def: DefinicionDeCalculo, meta: string | null | undefined): boolean {
  if (def.documental === null || meta === null || meta === undefined) return false;
  const f = fraccion(meta);
  return f !== null && f.d !== BigInt(1);
}

export function alcanceAdmitido(def: DefinicionDeCalculo, alcance: unknown): alcance is AlcanceDeCalculo {
  return typeof alcance === "string" && (def.alcances as readonly string[]).includes(alcance);
}

// Sin nada que medir (B en cero) la foto es «no aplica» con el motivo del cálculo; un conteo nunca lo es.
export function fotoDe(
  def: DefinicionDeCalculo,
  v: { A: string; B?: string },
): { noAplica: string } | { valores: Record<string, string> } {
  if (def.forma === "conteo" || def.sinDatos === null) return { valores: { A: v.A } };
  const b = v.B === undefined ? null : fraccion(v.B);
  if (b !== null && b.n === BigInt(0)) return { noAplica: def.sinDatos };
  return { valores: { A: v.A, B: v.B ?? "" } };
}
