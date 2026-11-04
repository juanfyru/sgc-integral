import { aclararHasta, ajustarLuminosidad, hexValido, normalizarHex, oscurecerHasta } from "./color";
import { contrasteWCAG } from "./contraste";

export const SUPERFICIES = {
  claro: { fondo: "#f4f6f9", panel: "#ffffff", tinta: "#16181d" },
  oscuro: { fondo: "#0f1216", panel: "#161a20", tinta: "#e7eaef" },
} as const;

export type ColoresMarca = { primario: string; secundario: string };

export type Marca = {
  nombre: string;
  sigla: string;
  lema: string;
  primario: string;
  secundario: string;
  logo: { version: string; mime: string } | null;
};

export const MARCA_DEFECTO: Marca = {
  nombre: "Entidad sin configurar",
  sigla: "SGC",
  lema: "",
  primario: "#1b4e8e",
  secundario: "#2e9b47",
  logo: null,
};

export const TOKENS_MARCA = [
  "marca",
  "marca-relleno",
  "marca-oscurecida",
  "marca-2",
  "marca-2-relleno",
  "marca-2-contraste",
  "marca-2-texto",
] as const;
export type TokenMarca = (typeof TOKENS_MARCA)[number];
export type TokensMarca = { claro: Record<TokenMarca, string>; oscuro: Record<TokenMarca, string> };

const BLANCO = "#ffffff";
const TINTA = "#16181d";
const FONDO_CLARO = SUPERFICIES.claro.fondo;
/** La superficie oscura más clara donde puede ir texto de marca (--muted, tintes, barra lateral). */
export const SUPERFICIE_TEXTO_OSCURA = "#1f242c";

export function derivarMarca(colores: ColoresMarca): TokensMarca {
  // Estos valores terminan en el style de <html>: un hex inválido nunca pasa.
  const primario = hexValido(colores.primario) ? normalizarHex(colores.primario) : MARCA_DEFECTO.primario;
  const secundario = hexValido(colores.secundario) ? normalizarHex(colores.secundario) : MARCA_DEFECTO.secundario;
  const oscurecida = ajustarLuminosidad(primario, -0.08);
  const sobreBlanco = contrasteWCAG(secundario, BLANCO) >= 4.5;
  const sobreTinta = contrasteWCAG(secundario, TINTA) >= 4.5;
  const relleno2 = sobreBlanco || sobreTinta ? secundario : oscurecerHasta(secundario, BLANCO, 4.5);
  const contraste2 = contrasteWCAG(relleno2, BLANCO) >= 4.5 ? BLANCO : TINTA;
  const comunes = {
    "marca-relleno": primario,
    "marca-oscurecida": oscurecida,
    "marca-2": secundario,
    "marca-2-relleno": relleno2,
    "marca-2-contraste": contraste2,
  };
  return {
    claro: { ...comunes, marca: primario, "marca-2-texto": oscurecerHasta(secundario, FONDO_CLARO, 4.5) },
    oscuro: {
      ...comunes,
      marca: aclararHasta(primario, SUPERFICIE_TEXTO_OSCURA, 4.5),
      "marca-2-texto": aclararHasta(secundario, SUPERFICIE_TEXTO_OSCURA, 4.5),
    },
  };
}

export function estiloMarca(tokens: TokensMarca): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const t of TOKENS_MARCA) {
    salida[`--${t}-c`] = tokens.claro[t];
    salida[`--${t}-o`] = tokens.oscuro[t];
  }
  return salida;
}

export type ErrorMarca = {
  campo: "color_primario" | "color_secundario";
  mensaje: string;
  sugerencia: string;
};

export function formatearRazon(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

// Si el redondeo a un decimal alcanza el mínimo, el mensaje no puede decir
// «4,5:1; mínimo 4,5:1»: se muestra con dos decimales (truncados, sin subir).
function razonDeRechazo(n: number, minimo: number): string {
  if (Math.round(n * 10) / 10 >= minimo) return (Math.floor(n * 100) / 100).toFixed(2).replace(".", ",");
  return formatearRazon(n);
}

export function sugerirPrimario(hex: string): string {
  return oscurecerHasta(hex, BLANCO, 4.5);
}

export function sugerirSecundario(hex: string): string {
  return oscurecerHasta(hex, FONDO_CLARO, 3.0);
}

export function validarMarca({ primario, secundario }: ColoresMarca): ErrorMarca[] {
  const errores: ErrorMarca[] = [];
  const r1 = contrasteWCAG(primario, BLANCO);
  if (r1 < 4.5) {
    const sugerencia = sugerirPrimario(primario);
    errores.push({
      campo: "color_primario",
      mensaje: `El color primario ${primario} no tiene contraste suficiente con el texto blanco (${razonDeRechazo(r1, 4.5)}:1; mínimo 4,5:1). Pruebe ${sugerencia}.`,
      sugerencia,
    });
  }
  const r2 = contrasteWCAG(secundario, FONDO_CLARO);
  if (r2 < 3.0) {
    const sugerencia = sugerirSecundario(secundario);
    errores.push({
      campo: "color_secundario",
      mensaje: `El color secundario ${secundario} no se distingue del fondo (${razonDeRechazo(r2, 3)}:1; mínimo 3:1). Pruebe ${sugerencia}.`,
      sugerencia,
    });
  }
  return errores;
}
