/**
 * La ficha de un indicador y las filas de su año en texto plano (spec §7.8 y §13): lo que escriben la ficha impresa y el
 * Excel de un indicador, y lo que comparten con la pantalla (los nombres de la forma, la tendencia y la consolidación, las
 * marcas de una fila, las columnas de las variables). Funciones puras: sin Node ni BD.
 */
import type { FichaLeida, FirmaDeFicha, OperacionLeida } from "@/db/consultas/indicadores/aprobacion";
import type { FilaDelAnio } from "@/db/consultas/indicadores/lectura";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { cuenta } from "@/lib/plural";
import { textoFecha } from "@/lib/vigencia/plazo";
import { horaLocal, zonaHoraria } from "@/lib/zona-horaria";
import { ETIQUETA_ESTADO } from "./estados";
import type { ContenidoFicha } from "./ficha";
import { enPalabras } from "./formula/formas";
import { fraccion } from "./formula/fraccion";
import { rangosDeTexto } from "./rangos";
import { numeroExacto, rangosEnPalabras, type Regla } from "./semaforo";
import { textoMeta, type Unidad } from "./textos";
import { ETIQUETA_PERIODICIDAD, ETIQUETA_SEMAFORO, type ModoSemaforo, type Periodicidad, type Semaforo, type Tendencia } from "./tipos";

export const FORMA: Record<string, string> = {
  porcentaje: "Porcentaje",
  tasa: "Tasa",
  razon: "Promedio o razón",
  conteo: "Conteo",
  libre: "Fórmula libre",
};
export const TENDENCIA: Record<string, string> = {
  ascendente: "Ascendente (mayor es mejor)",
  descendente: "Descendente (menor es mejor)",
  constante: "Constante (mantenerse en un rango)",
};
export const CONSOLIDACION: Record<string, string> = { suma: "Se suma", ultimo: "Último valor", promedio: "Promedio" };
export const ORIGEN: Record<string, string> = { manual: "Lo digita una persona", automatico: "Lo calcula el sistema" };

const fr = (v: string | null) => (v === null ? null : fraccion(v));

/** La regla del semáforo con lo que la versión firmó. */
export function reglaDeFicha(c: ContenidoFicha): Regla {
  return {
    tendencia: (c.tendencia ?? "ascendente") as Tendencia,
    meta: fr(c.meta),
    metaMax: fr(c.metaMax),
    modo: (c.semaforoModo as ModoSemaforo | null) ?? null,
    umbralPct: c.umbralAtencionPct,
    limite: fr(c.limiteCritico),
    tolerancia: fr(c.tolerancia),
    rangos: c.rangos ? rangosDeTexto(c.rangos) : null,
  };
}

export const unidadDeFicha = (c: ContenidoFicha): Unidad => ({ sufijo: c.unidadSufijo ?? "", decimales: c.decimales ?? 0 });

/** Un número firmado, con coma y los decimales que hagan falta. */
export function cifraDeFicha(v: string | null, u: Unidad): string | null {
  const f = fr(v);
  return f === null ? null : `${numeroExacto(f, u.decimales)}${u.sufijo}`;
}

/** «Primer trimestre de 2026»; una clave que no es periodo sale tal cual. */
export function periodoEnPalabras(clave: string): string {
  const etiqueta = periodoDe(clave, zonaHoraria())?.etiqueta ?? clave;
  return etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1);
}

/** Un campo de la ficha: su nombre, su valor y, si hace falta, una línea de detalle debajo. */
export type CampoDeTexto = { termino: string; valor: string; detalle?: string };

const NINGUNO = "(ninguno)";

/** La línea de una variable: qué incluye, de dónde sale, su unidad, cómo se junta en el año y sus límites de captura. */
function detalleDeVariable(v: ContenidoFicha["variables"][number]): string {
  const captura =
    v.capturaMin !== null || v.capturaMax !== null
      ? `Se captura ${[v.capturaMin !== null ? `desde ${v.capturaMin.replace(".", ",")}` : null, v.capturaMax !== null ? `hasta ${v.capturaMax.replace(".", ",")}` : null].filter(Boolean).join(" ")}`
      : null;
  return [
    v.descripcion,
    v.fuente ? `Fuente: ${v.fuente}` : null,
    v.unidad ? `Unidad: ${v.unidad}` : null,
    CONSOLIDACION[v.consolidacion] ?? v.consolidacion,
    captura,
    v.admiteNegativos ? "Admite negativos" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * La identificación y la estructura de medición de una versión firmada (spec §7.2), en texto: la fórmula en palabras
 * (con la de letras como detalle) y los rangos del semáforo en palabras. El procedimiento solo se nombra si la persona ve
 * ese documento (`ficha.procedimiento`, F13C-R11).
 */
export function camposDeFicha(ficha: FichaLeida): { identificacion: CampoDeTexto[]; estructura: CampoDeTexto[] } {
  const c = ficha.contenido;
  const u = unidadDeFicha(c);
  const regla = reglaDeFicha(c);
  const nombres = Object.fromEntries(c.variables.map((v) => [v.letra, v.nombre?.trim() || v.letra]));
  const medir = c.responsables.filter((r) => r.funcion === "medir").map((r) => r.cargoNombre);
  const analizar = c.responsables.filter((r) => r.funcion === "analizar").map((r) => r.cargoNombre);
  const lineaBase = c.lineaBaseValor !== null ? `${cifraDeFicha(c.lineaBaseValor, u)}${c.lineaBasePeriodo ? ` (${c.lineaBasePeriodo})` : ""}` : null;
  const limites = [c.resultadoMin !== null ? `desde ${cifraDeFicha(c.resultadoMin, u)}` : null, c.resultadoMax !== null ? `hasta ${cifraDeFicha(c.resultadoMax, u)}` : null]
    .filter(Boolean)
    .join(" ");
  const periodicidad = c.periodicidad ? (ETIQUETA_PERIODICIDAD[c.periodicidad as Periodicidad] ?? c.periodicidad) : NINGUNO;
  const campo = (termino: string, valor: string | null | undefined, detalle?: string | null): CampoDeTexto[] =>
    valor === null || valor === undefined || valor === "" ? [] : [{ termino, valor, ...(detalle ? { detalle } : {}) }];

  const identificacion: CampoDeTexto[] = [
    ...campo("Nombre", c.nombre ?? ""),
    ...campo("Proceso", c.subprocesoNombre ? `${c.procesoNombre ?? ""} › ${c.subprocesoNombre}` : (c.procesoNombre ?? "")),
    ...campo("Objetivo del indicador", c.proposito ?? NINGUNO),
    ...campo("Requisito", c.requisito ?? NINGUNO),
    ...campo("Tipo", c.tipoNombre ?? NINGUNO),
    ...campo("Clasificación", c.clasificacionNombre ?? NINGUNO),
    ...campo("Nivel", c.nivel),
    ...campo("Riesgo asociado", c.riesgoAsociado),
    ...campo("Objetivo que mide", c.objetivoNombre ?? NINGUNO),
    ...campo("Procedimiento", ficha.procedimiento ? `${ficha.procedimiento.codigo} · ${ficha.procedimiento.titulo}` : null),
    ...campo("Punto de control", c.puntoControl),
    ...campo("Normas que lo exigen", c.normas.length > 0 ? c.normas.map((n) => n.normaNombre).join("; ") : NINGUNO),
    ...campo(
      "Se reporta a",
      c.ente
        ? [
            c.ente,
            c.periodicidadExterna ? ETIQUETA_PERIODICIDAD[c.periodicidadExterna as Periodicidad]?.toLowerCase() : null,
            c.plazoExternoDias !== null ? `plazo de ${c.plazoExternoDias} días` : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : null,
    ),
  ];

  const estructura: CampoDeTexto[] = [
    ...campo("Cómo se obtiene el dato", ORIGEN[c.origenDato] ?? c.origenDato),
    ...campo("Cómo se calcula", c.forma ? (FORMA[c.forma] ?? c.forma) : NINGUNO),
    ...campo("Fórmula", c.formula ? enPalabras(c.formula, nombres) : null, c.formula),
    ...c.variables.flatMap((v) => campo(`Variable ${v.letra}`, v.nombre ?? v.letra, detalleDeVariable(v))),
    ...campo("Unidad del resultado", `${c.unidadNombre ?? ""}${u.sufijo.trim() ? ` (${u.sufijo.trim()})` : ""} · ${cuenta(c.decimales ?? 0, "decimal", "decimales")}`),
    ...campo("Periodicidad", periodicidad),
    ...campo("Tendencia", c.tendencia ? (TENDENCIA[c.tendencia] ?? c.tendencia) : NINGUNO),
    ...campo("Meta", regla.meta === null ? "Sin meta: cada medición queda «Sin meta», sin color ni alertas" : textoMeta(regla, u)),
    ...campo("Semáforo", regla.meta === null ? null : (rangosEnPalabras(regla, u) ?? NINGUNO)),
    ...campo("Límites del resultado", limites),
    ...campo("Línea base", lineaBase ?? c.lineaBaseNota ?? NINGUNO),
    ...campo("Nota de la línea base", lineaBase ? c.lineaBaseNota : null),
    ...campo("Sustento de la meta", c.sustentoMeta),
    ...campo("Responsables de medir", medir.length > 0 ? medir.join(", ") : NINGUNO),
    ...campo("Responsables de analizar", analizar.length > 0 ? analizar.join(", ") : NINGUNO),
  ];
  return { identificacion, estructura };
}

/** Los datos de operación (spec §7.3), que no se versionan ni se firman. */
export function camposDeOperacion(o: OperacionLeida): CampoDeTexto[] {
  return [
    { termino: "Quién mide", valor: o.mide.length > 0 ? o.mide.join(", ") : "El líder del proceso" },
    { termino: "Quién analiza", valor: o.analiza.length > 0 ? o.analiza.join(", ") : "El líder del proceso" },
    { termino: "Quién hace seguimiento", valor: o.seguimiento.length > 0 ? o.seguimiento.join(", ") : NINGUNO },
    { termino: "Plazo de reporte", valor: `${o.plazoReporteDias} días después del cierre del periodo` },
    { termino: "Inicio de medición", valor: o.inicioMedicion ? periodoEnPalabras(o.inicioMedicion) : NINGUNO },
    { termino: "Soporte obligatorio", valor: o.soporteObligatorio ? "Sí: cada reporte lleva su soporte" : "No" },
    { termino: "Nivel de acceso", valor: o.nivelAcceso === "restringido" ? "Restringido" : "General" },
  ];
}

/** Una firma de la ficha: quién, con su cargo y la fecha, tomados de `firmas`; o por qué no la hay. */
export type FirmaEnTexto = { rol: "Elaboró" | "Revisó y aprobó"; nombre: string | null; cargo: string | null; fecha: Date | null; nota: string | null };

const firma = (rol: FirmaEnTexto["rol"], f: FirmaDeFicha | null, nota: string): FirmaEnTexto =>
  f ? { rol, nombre: f.nombre, cargo: f.cargo, fecha: f.fecha, nota: null } : { rol, nombre: null, cargo: null, fecha: null, nota };

/**
 * «8 jul 2026, 09:05»: un día con el formato de las fechas de la app y su hora, en la zona de la instalación. Es la fecha
 * de toda pantalla del módulo (firmas, guardado, envío, retiro, control de cambios; Tarea 19, D-5), del impreso y del Excel.
 */
export const fechaYHora = (fecha: Date): string => `${textoFecha(fecha, zonaHoraria())}, ${horaLocal(fecha)}`;

/** La fecha de una firma: `fechaYHora`. */
export const fechaDeFirma = fechaYHora;

/** «Elaboró» y «Revisó y aprobó» de una versión aprobada (spec §7.8.3); un cambio menor no requiere aprobación. */
export function firmasDeFicha(ficha: FichaLeida): [FirmaEnTexto, FirmaEnTexto] {
  return [
    firma("Elaboró", ficha.firmas.elaboro, "Sin firma"),
    firma("Revisó y aprobó", ficha.firmas.aprobo, ficha.tipoCambio === "menor" ? "No requiere: es un cambio menor" : "Sin firma"),
  ];
}

/** La versión de la ficha con su «rige desde» en palabras: «Primer trimestre de 2026». */
export const rigeDesdeEnTexto = (ficha: FichaLeida) => (ficha.rigeDesde ? periodoEnPalabras(ficha.rigeDesde) : NINGUNO);

// ─────────────────────────────────────────────────────────────────────────────
// Las filas del año
// ─────────────────────────────────────────────────────────────────────────────

type ConMarcas = Pick<FilaDelAnio, "historica" | "requiereAccion" | "repetido" | "corregida" | "metaTardia" | "sinAnalisis" | "deOtraPeriodicidad">;

/**
 * Las marcas que acompañan al estado (spec §8.5): «Periodicidad anterior», «Histórico», «Requiere acción de mejora»,
 * «N periodos sin cumplir», «Corregida», «Meta ajustada después del periodo» y «Cerrada sin análisis».
 */
export function marcasDeFila(f: ConMarcas, periodosSinCumplir: number): string[] {
  return [
    f.deOtraPeriodicidad ? "Periodicidad anterior" : null,
    f.historica ? "Histórico" : null,
    f.requiereAccion ? "Requiere acción de mejora" : null,
    f.repetido ? `${periodosSinCumplir} periodos sin cumplir` : null,
    f.corregida ? "Corregida" : null,
    f.metaTardia ? "Meta ajustada después del periodo" : null,
    f.sinAnalisis ? "Cerrada sin análisis" : null,
  ].filter((m): m is string => m !== null);
}

/** El estado escrito de un resultado, nunca solo el color; vacío en lo que no ha llegado. */
export function semaforoEnTexto(f: Pick<FilaDelAnio, "estado" | "semaforo" | "noAplica" | "resultado">): string {
  if (f.estado === "por_venir") return "";
  return semaforoDeResultado(f.semaforo, f.noAplica, f.resultado !== null);
}

/** «Bien», «Atención», «Crítico»; sin semáforo, «No aplica», «Sin meta» (hay resultado) o «Sin dato». */
export function semaforoDeResultado(semaforo: Semaforo | null, noAplica: boolean, conResultado: boolean): string {
  if (semaforo) return ETIQUETA_SEMAFORO[semaforo];
  return noAplica ? "No aplica" : conResultado ? "Sin meta" : "Sin dato";
}

/** El estado de la medición: «Reportada», «Falta el análisis · vencida», «Por registrar», «Por venir», «Sin dato». */
export function estadoEnTexto(f: Pick<FilaDelAnio, "estado" | "vencida" | "historica">): string {
  if (f.estado === "por_venir") return "Por venir";
  if (f.estado === "sin_dato") return "Sin dato";
  const etiqueta = f.historica && f.estado === "por_reportar" ? "Por registrar" : ETIQUETA_ESTADO[f.estado];
  return `${etiqueta}${f.vencida ? " · vencida" : ""}`;
}

/** La columna «Cumple»: «Sí», «No» o vacía (sin resultado o sin meta). */
export const cumpleEnTexto = (c: boolean | null) => (c === null ? "" : c ? "Sí" : "No");

type ConAnalisis = Pick<FilaDelAnio, "noAplica" | "motivo" | "causa" | "accionPropuesta" | "analisis">;

/**
 * El análisis de un periodo (spec §8.4), una sola regla para la tabla del año y para la impresa y el Excel: «no aplica» con
 * su motivo; si no, la causa y la acción propuesta (un incumplimiento); si no, el análisis; `null` si no hay ninguno.
 */
export function analisisDeFila(
  f: ConAnalisis,
): { tipo: "no_aplica"; texto: string } | { tipo: "causa"; causa: string | null; accionPropuesta: string | null } | { tipo: "analisis"; texto: string } | null {
  if (f.noAplica) return { tipo: "no_aplica", texto: f.motivo ? `No aplica: ${f.motivo}` : "No aplica" };
  if (f.causa || f.accionPropuesta) return { tipo: "causa", causa: f.causa, accionPropuesta: f.accionPropuesta };
  return f.analisis ? { tipo: "analisis", texto: f.analisis } : null;
}

/** El análisis de un periodo en una línea: «No aplica: …», «Causa: … Acción propuesta: …» o el análisis; vacío si no hay. */
export function analisisEnTexto(f: ConAnalisis): string {
  const a = analisisDeFila(f);
  if (a === null) return "";
  if (a.tipo !== "causa") return a.texto;
  return [a.causa ? `Causa: ${a.causa}` : null, a.accionPropuesta ? `Acción propuesta: ${a.accionPropuesta}` : null].filter(Boolean).join(" ");
}

/**
 * Las columnas de las variables de la tabla del año: la unión de las letras de sus periodos (cada uno con su ficha), en el
 * orden en que aparecen, con el nombre que tiene en la versión más reciente que la usa.
 */
export function columnasDeVariables(filas: readonly Pick<FilaDelAnio, "valores">[]): { letra: string; nombre: string }[] {
  const nombres = new Map<string, string>();
  for (const f of filas) for (const v of f.valores) nombres.set(v.letra, v.nombre);
  return [...nombres].map(([letra, nombre]) => ({ letra, nombre }));
}

/**
 * Las filas del año, en el orden del calendario, en tramos por la versión de la ficha con que se calcularon (spec §7.8.6,
 * «cada bloque dice con qué versión»): un tramo nuevo empieza solo cuando una fila con resultado trae otra versión que la
 * del tramo en curso, y el rótulo se repite cada vez que la versión cambia. Una fila sin resultado (sin dato, por
 * registrar, por venir, «no aplica») no abre tramo: queda en el que cae; las primeras del año sin resultado van en el
 * primero, con la versión de la primera fila que tiene resultado (o la suya, si ninguna lo tiene).
 */
export function tramosPorVersion<F extends Pick<FilaDelAnio, "version" | "resultado">>(filas: readonly F[]): { version: number; filas: F[] }[] {
  const tramos: { version: number; filas: F[]; conResultado: boolean }[] = [];
  for (const f of filas) {
    const actual = tramos.at(-1);
    const conResultado = f.resultado !== null;
    if (!actual) tramos.push({ version: f.version, filas: [f], conResultado });
    else if (!conResultado) actual.filas.push(f);
    else if (!actual.conResultado) {
      actual.version = f.version;
      actual.conResultado = true;
      actual.filas.push(f);
    } else if (actual.version !== f.version) tramos.push({ version: f.version, filas: [f], conResultado });
    else actual.filas.push(f);
  }
  return tramos.map(({ version, filas: propias }) => ({ version, filas: propias }));
}
