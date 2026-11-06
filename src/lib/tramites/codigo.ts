/**
 * Formato del código de los documentos (convención del hospital:
 * PROCESO-TIPO-NN). Funciones puras, sin BD: el formato vive en la
 * configuración (`formato_codigo`) y de él se derivan el patrón de validación
 * y el consecutivo.
 */
export const FORMATO_CODIGO_DEFECTO = "{PROCESO}-{TIPO}-{NN}";

/** El tope de `codigoDeDocumento` (src/lib/esquemas/tramites.ts). */
export const LARGO_MAX_CODIGO = 40;

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
  if (formato.includes("}{")) {
    return "Separe con un guion los marcadores contiguos: {PROCESO}{TIPO} no se puede leer de vuelta";
  }
  const iProceso = formato.indexOf("{PROCESO}");
  const iTipo = formato.indexOf("{TIPO}");
  const entre = formato.slice(Math.min(iProceso + 9, iTipo + 6), Math.max(iProceso, iTipo));
  if (!/[^A-Za-z]/.test(entre)) {
    return "Entre {PROCESO} y {TIPO} ponga al menos un guion o un dígito: dos letras seguidas no se pueden separar";
  }
  if (/[^A-Z0-9-]/.test(formato.replace(MARCADORES, ""))) {
    return "Fuera de los marcadores solo se admiten letras mayúsculas, dígitos y guiones";
  }
  if (generarCodigo(formato, { proceso: "SGC", tipo: "FO", consecutivo: 2 }).length > LARGO_MAX_CODIGO) {
    return `El código resultante supera los ${LARGO_MAX_CODIGO} caracteres que admite un documento`;
  }
  return null;
}

function aRegExp(
  formato: string,
  proceso: string,
  tipo: string,
  consecutivo: string,
): RegExp {
  // Lo que está fuera de los marcadores se escapa: el resultado no depende de
  // que el llamador haya validado el formato.
  const cuerpo = formato
    .split(/(\{(?:PROCESO|TIPO|NNN|NN)\})/)
    .map((parte, i) => {
      if (i % 2 === 0) return parte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return parte === "{PROCESO}" ? proceso : parte === "{TIPO}" ? tipo : consecutivo;
    })
    .join("");
  return new RegExp(`^${cuerpo}$`);
}

export const PATRON_CODIGO_DEFECTO = "^[A-Z]{2,4}-[A-Z]{2,4}-\\d{2,}$";

/**
 * Patrón de validación de los códigos según la configuración: el formato si es
 * válido; si no, el patrón heredado si compila; si no, el defecto. Nunca lanza.
 */
export function patronDeConfiguracion(
  formato: string | null | undefined,
  patron: string | null | undefined,
): RegExp {
  if (formato != null && validarFormato(formato) === null) {
    return patronDesdeFormato(formato);
  }
  if (patron != null) {
    try {
      return new RegExp(patron);
    } catch {
      // cae al defecto
    }
  }
  return new RegExp(PATRON_CODIGO_DEFECTO);
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
  /** Para contar (no para validar un código nuevo): dos o más dígitos, también con `{NNN}`. */
  contando = false,
): number | null {
  // Los valores van escapados: no son expresiones regulares.
  const literal = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const coincidencia = aRegExp(
    formato,
    literal(p.proceso),
    literal(p.tipo),
    `(\\d{${contando ? 2 : anchoMinimo(formato)},})`,
  ).exec(codigo);
  return coincidencia ? Number(coincidencia[1]) : null;
}

/**
 * Qué le falta a un código que no lleva las siglas de su proceso y su tipo. Si el consecutivo va
 * antes que alguna de las dos, no hay un inicio que nombrar y se muestra un ejemplo.
 */
export function motivoDeSiglas(formato: string, p: { proceso: string; tipo: string }): string {
  const inicio = formato.slice(0, formato.search(/\{NNN?\}/));
  if (!inicio.includes("{PROCESO}") || !inicio.includes("{TIPO}")) {
    return `El código debe tener la forma ${generarCodigo(formato, { ...p, consecutivo: 1 })}`;
  }
  return `El código debe empezar por ${inicio.replace("{PROCESO}", p.proceso).replace("{TIPO}", p.tipo)}`;
}

/** El código que sigue para ese proceso y tipo; null sin formato válido. */
export function codigoSiguiente(
  formato: string | null,
  codigos: readonly string[],
  p: { proceso: string; tipo: string },
): string | null {
  if (!formato || validarFormato(formato) !== null) return null;
  return generarCodigo(formato, { ...p, consecutivo: siguienteConsecutivo(formato, codigos, p) });
}

/** El mayor consecutivo existente de ese proceso y tipo, más uno (1 si no hay). */
export function siguienteConsecutivo(
  formato: string,
  codigos: readonly string[],
  p: { proceso: string; tipo: string },
): number {
  let mayor = 0;
  for (const codigo of codigos) {
    const n = consecutivoDe(formato, codigo, p, true);
    if (n !== null && n > mayor) mayor = n;
  }
  return mayor + 1;
}
