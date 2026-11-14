/**
 * Contenido de una ficha de indicador: lo que se versiona y se firma (spec §7.2), cómo se decide si un cambio es mayor o
 * menor (§7.6) y su huella. Solo servidor: usa `node:crypto`.
 *
 * Es contenido: los campos de `ContenidoFicha`, con los textos de los catálogos tal como se firmaron (tipo,
 * clasificación, objetivo, proceso, subproceso, unidad y su sufijo, cargos y normas), las variables con todos sus
 * campos y los responsables (cargo y función). NO lo es: los datos de operación del spec §7.3 (designados, plazo de
 * reporte, inicio de medición, soporte, nivel de acceso), los ids propios de la versión, su estado, número, tipo y
 * motivo del cambio, desde cuándo rige, la prueba, la nota de devolución, la huella, quién y cuándo, ni las marcas de
 * tiempo. Los ids de los catálogos tampoco: la firma es sobre los nombres.
 */
import { createHash } from "node:crypto";
import { aTexto, fraccion } from "./formula/fraccion";
import type { RangosEnTexto } from "./rangos";

export type VariableDeFicha = {
  letra: string;
  nombre: string | null;
  descripcion: string | null;
  fuente: string | null;
  unidad: string | null;
  consolidacion: string;
  origen: string;
  variableCompartidaId: number | null;
  indicadorOrigenId: number | null;
  toma: string | null;
  capturaMin: string | null;
  capturaMax: string | null;
  admiteNegativos: boolean;
};

export type ContenidoFicha = {
  nombre: string | null;
  proposito: string | null;
  requisito: string | null;
  tipoNombre: string | null;
  clasificacionId: number | null;
  clasificacionNombre: string | null;
  objetivoNombre: string | null;
  procesoNombre: string | null;
  subprocesoNombre: string | null;
  procedimientoDocumentoId: number | null;
  puntoControl: string | null;
  origenDato: string;
  calculo: string | null;
  calculoAlcance: string | null;
  forma: string | null;
  factor: number | null;
  formula: string | null;
  unidadId: number | null;
  unidadNombre: string | null;
  unidadSufijo: string | null;
  decimales: number | null;
  periodicidad: string | null;
  tendencia: string | null;
  meta: string | null;
  metaMax: string | null;
  semaforoModo: string | null;
  umbralAtencionPct: number | null;
  limiteCritico: string | null;
  tolerancia: string | null;
  resultadoMin: string | null;
  resultadoMax: string | null;
  lineaBaseValor: string | null;
  lineaBasePeriodo: string | null;
  lineaBaseNota: string | null;
  sustentoMeta: string | null;
  ente: string | null;
  periodicidadExterna: string | null;
  plazoExternoDias: number | null;
  dimensionId: number | null;
  /** Los rangos del semáforo escritos por estado; solo con `semaforoModo` «rangos». */
  rangos: RangosEnTexto | null;
  nivel: string | null;
  riesgoAsociado: string | null;
  variables: VariableDeFicha[];
  responsables: { cargoNombre: string; funcion: string }[];
  normas: { normaNombre: string }[];
};

type Campo = keyof Omit<ContenidoFicha, "variables" | "responsables" | "normas">;

/**
 * Los campos escalares cuyo cambio es mayor (spec §7.2). Las variables tienen su propia regla (`ESTRUCTURA_DE_VARIABLE`).
 * La clasificación y la unidad se comparan por id: otro id es mayor; el mismo id con otro nombre o sufijo firmado (el
 * catálogo se renombró) es menor.
 */
export const CAMPOS_MAYORES: readonly Campo[] = [
  "clasificacionId",
  "origenDato",
  "calculo",
  "calculoAlcance",
  "forma",
  "factor",
  "formula",
  "unidadId",
  "periodicidad",
  "tendencia",
  "meta",
  "metaMax",
  "semaforoModo",
  "umbralAtencionPct",
  "limiteCritico",
  "tolerancia",
  "dimensionId",
  "rangos",
];

const ETIQUETAS: Record<Campo, string> = {
  nombre: "Nombre",
  proposito: "Propósito",
  requisito: "Requisito",
  tipoNombre: "Tipo",
  clasificacionId: "Clasificación",
  clasificacionNombre: "Clasificación (nombre)",
  objetivoNombre: "Objetivo que mide",
  procesoNombre: "Proceso",
  subprocesoNombre: "Subproceso",
  procedimientoDocumentoId: "Procedimiento",
  puntoControl: "Punto de control",
  origenDato: "Origen del dato",
  calculo: "Cálculo automático",
  calculoAlcance: "Alcance del cálculo automático",
  forma: "Forma",
  factor: "Factor de la tasa",
  formula: "Fórmula",
  unidadId: "Unidad",
  unidadNombre: "Unidad (nombre)",
  unidadSufijo: "Unidad (sufijo)",
  decimales: "Decimales",
  periodicidad: "Periodicidad",
  tendencia: "Tendencia",
  meta: "Meta",
  metaMax: "Meta máxima",
  semaforoModo: "Modo del semáforo",
  umbralAtencionPct: "Umbral de atención",
  limiteCritico: "Límite de crítico",
  tolerancia: "Tolerancia",
  resultadoMin: "Límite mínimo del resultado",
  resultadoMax: "Límite máximo del resultado",
  lineaBaseValor: "Línea base",
  lineaBasePeriodo: "Periodo de la línea base",
  lineaBaseNota: "Nota de la línea base",
  sustentoMeta: "Sustento de la meta",
  ente: "Ente al que se reporta",
  periodicidadExterna: "Periodicidad externa",
  plazoExternoDias: "Plazo externo",
  dimensionId: "Dimensión",
  rangos: "Rangos del semáforo",
  nivel: "Nivel",
  riesgoAsociado: "Riesgo asociado",
};

/** El nombre firmado que depende de un id de catálogo: si el id cambió, el cambio ya se dijo con el id. */
const DEPENDE_DE: Partial<Record<Campo, Campo>> = {
  clasificacionNombre: "clasificacionId",
  unidadNombre: "unidadId",
  unidadSufijo: "unidadId",
};

const NUMEROS: ReadonlySet<string> = new Set([
  "meta",
  "metaMax",
  "limiteCritico",
  "tolerancia",
  "resultadoMin",
  "resultadoMax",
  "lineaBaseValor",
  "capturaMin",
  "capturaMax",
  // Los números de los rangos («90» y «90.0» son el mismo).
  "valor",
  "hasta",
]);

/** Lo que las variables dicen de su estructura (cuántas, de dónde sale cada una y cómo se junta): cambio mayor. */
const ESTRUCTURA_DE_VARIABLE = ["letra", "origen", "consolidacion", "variableCompartidaId", "indicadorOrigenId", "toma"] as const;
/** El resto de una variable: cambio menor. */
const DETALLE_DE_VARIABLE = ["nombre", "descripcion", "fuente", "unidad", "capturaMin", "capturaMax", "admiteNegativos"] as const;

/** «90.0000» de la BD y «90» del formulario son el mismo número. */
function normalizado(clave: string, valor: unknown): unknown {
  if (valor === undefined) return null;
  if (NUMEROS.has(clave) && typeof valor === "string") {
    const f = fraccion(valor);
    return f === null ? valor : aTexto(f);
  }
  return valor;
}

function canonico(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonico);
  if (valor !== null && typeof valor === "object") {
    const salida: Record<string, unknown> = {};
    for (const clave of Object.keys(valor).sort()) salida[clave] = canonico(normalizado(clave, (valor as Record<string, unknown>)[clave]));
    return salida;
  }
  return valor === undefined ? null : valor;
}

const json = (valor: unknown): string => JSON.stringify(canonico(valor));

const porClave = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function conOrden(c: ContenidoFicha) {
  return {
    ...c,
    variables: [...c.variables].sort((a, b) => porClave(a.letra, b.letra)),
    responsables: [...c.responsables].sort((a, b) => porClave(json(a), json(b))),
    normas: [...c.normas].sort((a, b) => porClave(json(a), json(b))),
  };
}

type Cambio = { etiqueta: string; mayor: boolean };

function cambios(vigente: ContenidoFicha, nuevo: ContenidoFicha): Cambio[] {
  const a = conOrden(vigente);
  const b = conOrden(nuevo);
  const salida: Cambio[] = [];
  for (const campo of Object.keys(ETIQUETAS) as Campo[]) {
    const id = DEPENDE_DE[campo];
    if (id !== undefined && json({ [id]: a[id] }) !== json({ [id]: b[id] })) continue;
    if (json({ [campo]: a[campo] }) !== json({ [campo]: b[campo] })) salida.push({ etiqueta: ETIQUETAS[campo], mayor: CAMPOS_MAYORES.includes(campo) });
  }
  const mismasLetras = a.variables.map((v) => v.letra).join() === b.variables.map((v) => v.letra).join();
  const parcial = (claves: readonly (keyof VariableDeFicha)[]) => (v: VariableDeFicha) => Object.fromEntries(claves.map((k) => [k, v[k]]));
  if (!mismasLetras || json(a.variables.map(parcial(ESTRUCTURA_DE_VARIABLE))) !== json(b.variables.map(parcial(ESTRUCTURA_DE_VARIABLE)))) {
    salida.push({ etiqueta: "Variables: cuántas son, origen o consolidación", mayor: true });
  }
  if (mismasLetras && json(a.variables.map(parcial(DETALLE_DE_VARIABLE))) !== json(b.variables.map(parcial(DETALLE_DE_VARIABLE)))) {
    salida.push({ etiqueta: "Variables: nombre, descripción, fuente o límites", mayor: false });
  }
  if (json(a.responsables) !== json(b.responsables)) salida.push({ etiqueta: "Responsables", mayor: false });
  if (json(a.normas) !== json(b.normas)) salida.push({ etiqueta: "Normas", mayor: false });
  return salida;
}

/** Lo decide el sistema comparando contra la versión vigente: «mayor» si cambió algo mayor, «menor» si solo menores. */
export function tipoDeCambio(vigente: ContenidoFicha, nuevo: ContenidoFicha): "mayor" | "menor" | "ninguno" {
  const lista = cambios(vigente, nuevo);
  if (lista.length === 0) return "ninguno";
  return lista.some((c) => c.mayor) ? "mayor" : "menor";
}

/** Las etiquetas legibles de lo que cambió, en orden alfabético. */
export function camposCambiados(vigente: ContenidoFicha, nuevo: ContenidoFicha): string[] {
  return cambios(vigente, nuevo)
    .map((c) => c.etiqueta)
    .sort((x, y) => x.localeCompare(y, "es"));
}

/** SHA-256 en hexadecimal del contenido en JSON canónico (claves ordenadas, listas sin orden propio ordenadas). */
export function huellaDeFicha(c: ContenidoFicha): string {
  // Los ids de catálogo no se firman: la huella es sobre los textos.
  const firmado: Record<string, unknown> = { ...conOrden(c) };
  delete firmado.clasificacionId;
  delete firmado.unidadId;
  // Una versión anterior a la 14A no los tiene: su huella no puede cambiar.
  for (const nuevo of ["rangos", "nivel", "riesgoAsociado"] as const) if (firmado[nuevo] == null) delete firmado[nuevo];
  return createHash("sha256").update(json(firmado)).digest("hex");
}
