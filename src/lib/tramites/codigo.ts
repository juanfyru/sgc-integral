/**
 * Formato del código de los documentos (convención del hospital:
 * PROCESO-TIPO-NN). Funciones puras, sin BD: el formato vive en la
 * configuración (`formato_codigo`) y de él se derivan el patrón de validación
 * y el consecutivo.
 */
export const FORMATO_CODIGO_DEFECTO = "{PROCESO}-{TIPO}-{NN}";

const MARCADORES = /\{(PROCESO|TIPO|NNN|NN)\}/g;

function contar(formato: string, marcador: string): number {
  return formato.split(`{${marcador}}`).length - 1;
}

/** `null` si el formato es válido; si no, el motivo en español. */
export function validarFormato(formato: string): string | null {
  if (contar(formato, "PROCESO") !== 1) {
    return "El formato debe llevar exactamente un {PROCESO}";
  }
  if (contar(formato, "TIPO") !== 1) {
    return "El formato debe llevar exactamente un {TIPO}";
  }
  if (contar(formato, "NN") + contar(formato, "NNN") !== 1) {
    return "El formato debe llevar exactamente un consecutivo ({NN} o {NNN})";
  }
  if (/[^A-Z0-9-]/.test(formato.replace(MARCADORES, ""))) {
    return "Fuera de los marcadores solo se admiten letras mayúsculas, dígitos y guiones";
  }
  return null;
}

function aRegExp(
  formato: string,
  proceso: string,
  tipo: string,
  consecutivo: string,
): RegExp {
  const cuerpo = formato.replace(MARCADORES, (_m, nombre: string) =>
    nombre === "PROCESO" ? proceso : nombre === "TIPO" ? tipo : consecutivo,
  );
  return new RegExp(`^${cuerpo}$`);
}

function anchoMinimo(formato: string): number {
  return formato.includes("{NNN}") ? 3 : 2;
}

/** Patrón anclado que deben cumplir todos los códigos de documento. */
export function patronDesdeFormato(formato: string): RegExp {
  return aRegExp(
    formato,
    "[A-Z]{2,4}",
    "[A-Z]{2,4}",
    `\\d{${anchoMinimo(formato)},}`,
  );
}

export function generarCodigo(
  formato: string,
  p: { proceso: string; tipo: string; consecutivo: number },
): string {
  const numero = String(p.consecutivo).padStart(anchoMinimo(formato), "0");
  return formato.replace(MARCADORES, (_m, nombre: string) =>
    nombre === "PROCESO" ? p.proceso : nombre === "TIPO" ? p.tipo : numero,
  );
}

/** El consecutivo de `codigo` si corresponde a ese proceso y tipo; si no, `null`. */
export function consecutivoDe(
  formato: string,
  codigo: string,
  p: { proceso: string; tipo: string },
): number | null {
  // Los valores van escapados: no son expresiones regulares.
  const literal = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const coincidencia = aRegExp(
    formato,
    literal(p.proceso),
    literal(p.tipo),
    `(\\d{${anchoMinimo(formato)},})`,
  ).exec(codigo);
  return coincidencia ? Number(coincidencia[1]) : null;
}

/** El mayor consecutivo existente de ese proceso y tipo, más uno (1 si no hay). */
export function siguienteConsecutivo(
  formato: string,
  codigos: readonly string[],
  p: { proceso: string; tipo: string },
): number {
  let mayor = 0;
  for (const codigo of codigos) {
    const n = consecutivoDe(formato, codigo, p);
    if (n !== null && n > mayor) mayor = n;
  }
  return mayor + 1;
}
