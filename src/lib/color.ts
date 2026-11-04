import { contrasteWCAG } from "./contraste";

export const PATRON_HEX = /^#[0-9a-f]{6}$/i;

export function hexValido(v: unknown): v is string {
  return typeof v === "string" && PATRON_HEX.test(v);
}

export function normalizarHex(hex: string): string {
  return hex.toLowerCase();
}

export type Oklch = { l: number; c: number; h: number };

// OKLab según Björn Ottosson: sRGB → lineal → LMS → OKLab → OKLCH, y la vuelta.
function aLineal(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function deLineal(v: number): number {
  const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.abs(v) ** (1 / 2.4) - 0.055;
  return s * 255;
}

export function hexAOklch(hex: string): Oklch {
  const n = normalizarHex(hex);
  const r = aLineal(parseInt(n.slice(1, 3), 16));
  const g = aLineal(parseInt(n.slice(3, 5), 16));
  const b = aLineal(parseInt(n.slice(5, 7), 16));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(A, B);
  const h = c < 1e-8 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

function oklchALineal({ l, c, h }: Oklch): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const A = c * Math.cos(rad);
  const B = c * Math.sin(rad);
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

export function oklchAHex(color: Oklch): string {
  const canal = (v: number) => {
    const x = Math.min(255, Math.max(0, Math.round(deLineal(v))));
    return x.toString(16).padStart(2, "0");
  };
  const [r, g, b] = oklchALineal(color);
  return `#${canal(r)}${canal(g)}${canal(b)}`;
}

const EPS_GAMUT = 1e-4;

function enGamut(o: Oklch): boolean {
  return oklchALineal(o).every((v) => v >= -EPS_GAMUT && v <= 1 + EPS_GAMUT);
}

// Conserva L y h y baja C lo mínimo para entrar en sRGB; el recorte por canal
// de oklchAHex desplazaría el tono en colores saturados.
function mapearAGamut(o: Oklch): Oklch {
  if (enGamut(o)) return o;
  let bajo = 0;
  let alto = o.c;
  for (let i = 0; i < 30; i++) {
    const medio = (bajo + alto) / 2;
    if (enGamut({ ...o, c: medio })) bajo = medio;
    else alto = medio;
  }
  return { ...o, c: bajo };
}

export function ajustarLuminosidad(hex: string, delta: number): string {
  const o = hexAOklch(hex);
  return oklchAHex(mapearAGamut({ ...o, l: Math.min(1, Math.max(0, o.l + delta)) }));
}

const PASO_L = 0.02;

export function aclararHasta(hex: string, fondo: string, minimo: number, topeL = 0.85): string {
  const o = hexAOklch(hex);
  let actual = normalizarHex(hex);
  let l = o.l;
  while (contrasteWCAG(actual, fondo) < minimo && l < topeL) {
    l = Math.min(topeL, l + PASO_L);
    actual = oklchAHex(mapearAGamut({ ...o, l }));
  }
  return actual;
}

export function oscurecerHasta(hex: string, fondo: string, minimo: number, pisoL = 0.1): string {
  const o = hexAOklch(hex);
  let actual = normalizarHex(hex);
  let l = o.l;
  while (contrasteWCAG(actual, fondo) < minimo && l > pisoL) {
    l = Math.max(pisoL, l - PASO_L);
    actual = oklchAHex(mapearAGamut({ ...o, l }));
  }
  return actual;
}
