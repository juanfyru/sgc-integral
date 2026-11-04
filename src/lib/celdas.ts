/**
 * Neutraliza la inyección de fórmulas (D54): si un texto empieza por un carácter
 * que Excel/LibreOffice interpretan como fórmula, se antepone un apóstrofo para
 * que se trate como texto. Aplica a toda celda de texto libre que la app exporta
 * (Excel y CSV).
 */
export function neutralizarFormula(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}
