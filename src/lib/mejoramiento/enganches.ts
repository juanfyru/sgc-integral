/**
 * Los textos de los enganches de otros módulos con mejoramiento (Fase 15B, anexo §7 y §8): los mensajes del dominio y las
 * frases que pintan las pantallas. Sin importaciones: lo usan el dominio, las pantallas de Distribución y las pruebas.
 */

/** Un hallazgo de verificación tiene a lo sumo una no conformidad que cuente (anexo §7.1). */
export const YA_TIENE_NO_CONFORMIDAD = "Este hallazgo de verificación ya tiene una no conformidad";

/** La justificación de la acción correctiva de esa no conformidad (anexo §7.2): al menos 10 caracteres. */
export const SIN_JUSTIFICAR_LA_ACCION = "Escriba por qué esta falla necesita acción correctiva (al menos 10 caracteres)";

/** El proceso de esa no conformidad se elige entre los del punto de uso, si el punto tiene alguno (anexo §7.2). */
export const PROCESO_DEL_PUNTO = "Elija un proceso del punto de uso";

/**
 * Desde un hallazgo de verificación no se añade una ocurrencia a un parecido abierto (como desde el panel de la marca, anexo §6.2): así
 * se perderían el enlace y la justificación de la acción. La nota de los parecidos y el rechazo de la acción.
 */
export const OCURRENCIA_DESDE_UNA_VERIFICACION =
  "Desde un hallazgo de verificación se registra una no conformidad nueva, enlazada a él: no se añade como ocurrencia";

/** Para quien no ve el hallazgo de verificación, uno que no existe y uno que no ve se dicen igual. */
export const VERIFICACION_NO_EXISTE = "El hallazgo de verificación no existe";

/** Lo que dice la sección «Corrección» a quien no ve el hallazgo de verificación enlazado (anexo §7.2). */
export const CORRECCION_EN_DISTRIBUCION = "La corrección está en un hallazgo de verificación de Distribución";

/** El índice que garantiza una sola no conformidad que cuente por hallazgo de verificación (migración 0019). */
export const INDICE_NO_CONFORMIDAD_DE_VERIFICACION = "mejora_hallazgos_verificacion_hallazgo_unico";

/**
 * Lo que queda fijo en la no conformidad de un hallazgo de verificación (anexo §7.2 y §10.3): la clase y el origen. Se ponen antes de
 * leer el envío, así lo que se fuerce no cuenta ni en lo que el esquema exige.
 */
export const FIJOS_DE_VERIFICACION = { clase: "no_conformidad", origen: "control_documental" } as const;

/** La fuente que se propone a la no conformidad de un hallazgo de verificación (anexo §7.2), editable. */
export const fuenteDeVerificacion = (punto: string) => `Verificación del punto ${punto}`;

/** Por qué se sugiere abrir la no conformidad (anexo §7.4): se reabrió, o su punto acumula hallazgos. */
export type SugerenciaDeVerificacion = { por: "reabierto"; veces: number } | { por: "acumula"; hallazgos: number; meses: number };

/** La frase de la sugerencia, con los textos fijos de la entrega. */
export function textoDeSugerencia(s: SugerenciaDeVerificacion): string {
  const cola = "Puede abrir una no conformidad para tratar la causa.";
  if (s.por === "reabierto") return `Este hallazgo se reabrió ${s.veces === 1 ? "una vez" : `${s.veces} veces`}. ${cola}`;
  return `Este punto acumula ${s.hallazgos} hallazgos en ${s.meses} meses. ${cola}`;
}

/** El estado de un hallazgo de verificación en palabras, como lo dice Distribución (`InsigniaHallazgo`). */
export const ETIQUETA_ESTADO_DE_VERIFICACION: Record<string, string> = {
  abierto: "Abierto",
  por_validar: "Por validar",
  cerrado: "Cerrado",
};
