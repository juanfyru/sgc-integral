/**
 * La regla común del punto de miles: lo que se digita al reportar un periodo (valor único, categorías, históricos) y lo
 * que trae una plantilla de importación no admite «1.600» porque es ambiguo (¿mil seiscientos o uno con seis?). Sin Node ni BD.
 */
export const SIN_PUNTOS_DE_MILES = "Escriba el valor sin puntos de miles (1731); para decimales use la coma (1,731)";
export const AYUDA_SIN_MILES = "Sin puntos de miles; use la coma para los decimales.";

const CON_PUNTO_DE_MILES = /^-?[1-9]\d{0,2}(\.\d{3})+$/;

/** Si el texto, sin los espacios de los extremos, se lee como un número con puntos de miles («1.600», «1.284.300»). */
export function tienePuntoDeMiles(texto: string): boolean {
  return CON_PUNTO_DE_MILES.test(texto.trim());
}
