/**
 * La marca «Requiere acción de mejora» de una medición de indicador (Fase 15B, anexo §6): qué es un pendiente, los textos que
 * propone el registro y los mensajes del dominio. Puro: sin base, lo importan las consultas y los componentes.
 *
 * Que la medición «ya no pide análisis» se decide con las reglas de los indicadores (`analisisExigido`, `analisisCompleto`), las
 * mismas de `pideAnalisis`: no hay una condición de SQL que las iguale (`analizada_en` queda puesta cuando un Bien con análisis
 * opcional se corrige a Crítico, el estado guardado espera también el soporte, y la longitud de JavaScript cuenta unidades
 * UTF-16), así que la consulta trae las marcadas sin salida y esta función decide.
 */
import { analisisCompleto, analisisExigido, cumpleDeFila } from "@/lib/indicadores/estados";
import { ETIQUETA_SEMAFORO, type Semaforo } from "@/lib/indicadores/tipos";

export const MARCA_YA_DECIDIDA = "La acción de mejora de esta medición ya se decidió";
export const MARCA_SIN_PENDIENTE = "Esta medición todavía no pide decidir su acción de mejora";
/**
 * El registro que llegó desde el panel de la marca no añade una ocurrencia a un parecido: el panel ya ofrece la ocurrencia de los
 * hallazgos que citan el indicador, y por ese camino queda la salida de la marca (`resolverConOcurrencia`).
 */
export const OCURRENCIA_DESDE_EL_PANEL = "Para añadirla como ocurrencia, vuelva a la página del indicador";
/** La justificación de «No requiere acción de mejora» (anexo §6.2): al menos diez caracteres. Va a la fila de la marca, no a la bitácora. */
export const JUSTIFICACION_CORTA = "Escriba la justificación (al menos 10 caracteres)";

/** Lo que dice la salida en vigor junto a su medición (anexo §6.5). */
export const NO_REQUIERE_ACCION = "No requiere acción de mejora";
export const textoDeSalida = (salida: "hallazgo" | "ocurrencia", codigo: string) =>
  salida === "hallazgo" ? `Hallazgo ${codigo}` : `Ocurrencia de ${codigo}`;

/** La medición marcada, tal como la decide `estadoDeLaMarca`: sus columnas de `mediciones`, sin transformar. */
export type MarcaSinDecidir = {
  semaforo: Semaforo | null;
  /** Nulo en una fila anterior a la 0012: se lee con `cumpleDeFila`. */
  cumple: boolean | null;
  repetido: boolean;
  analisis: string | null;
  causa: string | null;
  accionPropuesta: string | null;
  venceEn: Date;
  cerrada: boolean;
};

/**
 * Una medición marcada sin salida en vigor (anexo §6.1) es un pendiente cuando ya se puede decidir: quedó cerrada en el cierre del
 * mes, su fecha límite ya pasó (la misma comparación de `estadoVisible`: vencida después de su fecha) o ya no pide análisis (lo
 * tiene completo, o su resultado no lo exige). Si no, espera su análisis.
 */
export function estadoDeLaMarca(m: MarcaSinDecidir, ahora: Date): "pendiente" | "espera_analisis" {
  if (m.cerrada || ahora.getTime() > m.venceEn.getTime()) return "pendiente";
  const exigido = analisisExigido({
    semaforo: m.semaforo,
    cumple: cumpleDeFila({ cumple: m.cumple, semaforo: m.semaforo }),
    repetido: m.repetido,
    historica: false,
    noAplica: false,
  });
  return analisisCompleto(exigido, { analisis: m.analisis, causa: m.causa, accionPropuesta: m.accionPropuesta }) ? "pendiente" : "espera_analisis";
}

const MAXIMO_TITULO = 150;

/**
 * El título que propone el registro desde la marca (anexo §6.2): el nombre del indicador y el periodo, «Oportunidad de citas,
 * octubre de 2026». Cabe en los 150 caracteres del título: si no, se acorta el nombre, nunca el periodo.
 */
export function tituloDeLaMarca(indicador: string, periodo: string): string {
  const sufijo = `, ${periodo}`;
  const nombre = indicador.trim();
  const cabe = MAXIMO_TITULO - sufijo.length;
  return `${nombre.length > cabe ? `${nombre.slice(0, cabe - 1).trimEnd()}…` : nombre}${sufijo}`;
}

const conMayuscula = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/**
 * La frase del resultado (anexo §6.2): la descripción que propone el registro y la de la ocurrencia. El valor, la meta, el color y,
 * si es el caso, que repite el incumplimiento: «Octubre de 2026: «Oportunidad de citas» quedó en Crítico con 4,6 días (meta: ≤ 3
 * días). Repite el incumplimiento de la meta.» `resultado` y `meta` llegan ya en texto (`textoValor`, `textoMeta`).
 */
export function fraseDelResultado(m: {
  indicador: string;
  periodo: string;
  resultado: string;
  meta: string | null;
  semaforo: string | null;
  repetido: boolean;
}): string {
  const color = m.semaforo !== null && Object.hasOwn(ETIQUETA_SEMAFORO, m.semaforo) ? ETIQUETA_SEMAFORO[m.semaforo as Semaforo] : null;
  const quedo = color ? `quedó en ${color} con` : "dio";
  const meta = m.meta ? ` (meta: ${m.meta})` : "";
  const repite = m.repetido ? " Repite el incumplimiento de la meta." : "";
  return `${conMayuscula(m.periodo)}: «${m.indicador}» ${quedo} ${m.resultado}${meta}.${repite}`;
}

/** La tarea de un pendiente (anexo §6.5): «Decidir la acción de mejora de CEX-ID-001 Oportunidad de citas, octubre de 2026». */
export const tituloDeLaTarea = (codigo: string, nombre: string | null, periodo: string) =>
  `Decidir la acción de mejora de ${nombre ? `${codigo} ${nombre}` : codigo}, ${periodo}`;
