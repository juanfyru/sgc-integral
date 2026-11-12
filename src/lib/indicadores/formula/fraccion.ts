// Fracciones exactas con bigint: siempre reducidas y con denominador positivo.
// Módulo puro: lo importan componentes de cliente, no debe tocar Node ni la BD.

export type Fraccion = { n: bigint; d: bigint };

export const LIMITE_DIGITOS = 200;

// El tsconfig apunta a ES2017: sin literales `0n`, se construyen con BigInt().
const N0 = BigInt(0);
const N1 = BigInt(1);
const N2 = BigInt(2);
const N10 = BigInt(10);
const N100 = BigInt(100);

function mcd(a: bigint, b: bigint): bigint {
  let x = a < N0 ? -a : a;
  let y = b < N0 ? -b : b;
  while (y !== N0) {
    [x, y] = [y, x % y];
  }
  return x;
}

// Denominador cero es un error de programación: `dividir` lo evita devolviendo null.
function crear(n: bigint, d: bigint): Fraccion {
  if (d === N0) throw new RangeError("Denominador cero");
  const g = mcd(n, d);
  const signo = d < N0 ? -N1 : N1;
  if (g === N0) return { n: N0, d: N1 };
  return { n: (signo * n) / g, d: (signo * d) / g };
}

export const CERO: Fraccion = { n: N0, d: N1 };
export const UNO: Fraccion = { n: N1, d: N1 };
export const CIEN: Fraccion = { n: N100, d: N1 };

const NUMERO = /^-?\d{1,15}([.,]\d{1,10})?$/;

export function fraccion(texto: string): Fraccion | null {
  if (typeof texto !== "string" || !NUMERO.test(texto)) return null;
  const negativo = texto.startsWith("-");
  const limpio = (negativo ? texto.slice(1) : texto).replace(",", ".");
  const [enteros, decimales = ""] = limpio.split(".");
  const n = BigInt(enteros + decimales);
  return crear(negativo ? -n : n, N10 ** BigInt(decimales.length));
}

export function entero(n: number | bigint): Fraccion {
  if (typeof n === "number" && !Number.isSafeInteger(n)) throw new RangeError("Entero no seguro");
  return { n: BigInt(n), d: N1 };
}

export function sumar(a: Fraccion, b: Fraccion): Fraccion {
  return crear(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function restar(a: Fraccion, b: Fraccion): Fraccion {
  return crear(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function multiplicar(a: Fraccion, b: Fraccion): Fraccion {
  return crear(a.n * b.n, a.d * b.d);
}

export function dividir(a: Fraccion, b: Fraccion): Fraccion | null {
  if (b.n === N0) return null;
  return crear(a.n * b.d, a.d * b.n);
}

export function comparar(a: Fraccion, b: Fraccion): -1 | 0 | 1 {
  const izquierda = a.n * b.d;
  const derecha = b.n * a.d;
  return izquierda < derecha ? -1 : izquierda > derecha ? 1 : 0;
}

export function esNegativa(a: Fraccion): boolean {
  return a.n < N0;
}

function cifras(x: bigint): number {
  return (x < N0 ? -x : x).toString().length;
}

export function fueraDeRango(a: Fraccion): boolean {
  return cifras(a.n) > LIMITE_DIGITOS || cifras(a.d) > LIMITE_DIGITOS;
}

export function aTexto(a: Fraccion): string {
  return `${a.n}/${a.d}`;
}

// Lee solo lo que escribió `aTexto`; ante otra cosa lanza un Error simple.
export function deTexto(t: string): Fraccion {
  const m = /^(-?\d+)\/(\d+)$/.exec(t);
  if (!m) throw new Error("Fracción mal formada");
  const d = BigInt(m[2]);
  if (d === N0) throw new Error("Fracción mal formada");
  return crear(BigInt(m[1]), d);
}

// Decimales fijos (conserva los ceros), punto como separador, nunca exponente.
// «redondear» es mitad lejos de cero; «truncar», hacia cero. Sin «-0».
export function aDecimal(a: Fraccion, decimales: number, modo: "redondear" | "truncar"): string {
  if (!Number.isInteger(decimales) || decimales < 0 || decimales > 100) throw new RangeError("Decimales inválidos");
  const escala = N10 ** BigInt(decimales);
  const negativo = a.n < N0;
  const abs = negativo ? -a.n : a.n;
  const q = modo === "truncar" ? (abs * escala) / a.d : (N2 * abs * escala + a.d) / (N2 * a.d);
  const entera = q / escala;
  const texto = decimales === 0 ? `${entera}` : `${entera}.${(q % escala).toString().padStart(decimales, "0")}`;
  return negativo && q !== N0 ? `-${texto}` : texto;
}
