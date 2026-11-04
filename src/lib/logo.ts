import { createHash } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";

import { LOGO_MAX_BYTES, LOGO_MAX_LADO, LOGO_MIMES, LOGO_MIN_LADO, type MimeLogo } from "./logo-limites";

export { LOGO_MAX_BYTES, LOGO_MAX_LADO, LOGO_MIMES, LOGO_MIN_LADO, type MimeLogo };

type Dimensiones = { ancho: number; alto: number };

const leer16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const leer24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

function dimensionesPng(b: Uint8Array): Dimensiones | null {
  if (b.length < 24 || ascii(b, 12, 4) !== "IHDR") return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { ancho: v.getUint32(16), alto: v.getUint32(20) };
}

function dimensionesJpeg(b: Uint8Array): Dimensiones | null {
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marcador = b[i + 1];
    if (marcador === 0xff) {
      i++; // byte de relleno
      continue;
    }
    const esSof = marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc;
    if (esSof) {
      if (i + 9 > b.length) return null;
      return { alto: leer16be(b, i + 5), ancho: leer16be(b, i + 7) };
    }
    i += 2 + leer16be(b, i + 2);
  }
  return null;
}

function dimensionesWebp(b: Uint8Array): Dimensiones | null {
  if (b.length < 30 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
  const trozo = ascii(b, 12, 4);
  if (trozo === "VP8 ") return { ancho: (b[26] | (b[27] << 8)) & 0x3fff, alto: (b[28] | (b[29] << 8)) & 0x3fff };
  if (trozo === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
    return { ancho: (bits & 0x3fff) + 1, alto: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (trozo === "VP8X") return { ancho: leer24le(b, 24) + 1, alto: leer24le(b, 27) + 1 };
  return null;
}

/** Lee ancho y alto de la cabecera, sin decodificar la imagen. `null` si está truncada o no se reconoce. */
export function dimensionesImagen(bytes: Uint8Array, mime: MimeLogo): Dimensiones | null {
  const d =
    mime === "image/png" ? dimensionesPng(bytes) : mime === "image/jpeg" ? dimensionesJpeg(bytes) : dimensionesWebp(bytes);
  return d && d.ancho > 0 && d.alto > 0 ? d : null;
}

export type ResultadoLogo =
  | { ok: true; mime: MimeLogo; extension: string; ancho: number; alto: number; version: string }
  | { ok: false; error: string };

export async function validarLogo(bytes: Uint8Array): Promise<ResultadoLogo> {
  if (bytes.byteLength > LOGO_MAX_BYTES) return { ok: false, error: "El logo supera 1 MB" };
  const tipo = await fileTypeFromBuffer(bytes);
  if (!tipo || !Object.hasOwn(LOGO_MIMES, tipo.mime)) return { ok: false, error: "El logo debe ser PNG, JPG o WebP" };
  const mime = tipo.mime as MimeLogo;
  const medidas = dimensionesImagen(bytes, mime);
  if (!medidas) return { ok: false, error: "No se pudo leer el tamaño de la imagen" };
  const { ancho, alto } = medidas;
  if (ancho < LOGO_MIN_LADO || alto < LOGO_MIN_LADO || ancho > LOGO_MAX_LADO || alto > LOGO_MAX_LADO) {
    return {
      ok: false,
      error: `El logo debe medir entre ${LOGO_MIN_LADO} y ${LOGO_MAX_LADO} píxeles por lado (recibido ${ancho} × ${alto})`,
    };
  }
  const version = createHash("sha256").update(bytes).digest("hex").slice(0, 8);
  return { ok: true, mime, extension: LOGO_MIMES[mime], ancho, alto, version };
}

/** Única forma que puede tener `logo_ruta`: el borrado y el servicio público nunca salen de aquí. */
export const RUTA_LOGO = /^marca\/logo-[0-9a-f]{8}\.(png|jpg|webp)$/;

export function rutaLogoValida(ruta: unknown): ruta is string {
  return typeof ruta === "string" && RUTA_LOGO.test(ruta);
}
