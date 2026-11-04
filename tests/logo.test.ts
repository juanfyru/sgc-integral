import { describe, expect, it } from "vitest";
import { LOGO_MAX_BYTES, dimensionesImagen, validarLogo } from "@/lib/logo";
import { pngDePrueba } from "./png-prueba";

function jpegCabecera(ancho: number, alto: number): Uint8Array {
  const sof = Buffer.alloc(19);
  sof.set([0xff, 0xc0, 0x00, 0x11, 0x08]);
  sof.writeUInt16BE(alto, 5);
  sof.writeUInt16BE(ancho, 7);
  sof.set([0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1], 9);
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]);
  return new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]));
}
function webpVp8xCabecera(ancho: number, alto: number): Uint8Array {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(22, 4);
  b.write("WEBP", 8, "ascii");
  b.write("VP8X", 12, "ascii");
  b.writeUInt32LE(10, 16);
  b.writeUIntLE(ancho - 1, 24, 3);
  b.writeUIntLE(alto - 1, 27, 3);
  return new Uint8Array(b);
}

describe("validación del logo", () => {
  it("acepta un PNG de 64×64 y devuelve versión de 8 hex", async () => {
    const r = await validarLogo(pngDePrueba(64, 64));
    expect(r).toMatchObject({ ok: true, mime: "image/png", extension: "png", ancho: 64, alto: 64 });
    expect((r as { version: string }).version).toMatch(/^[0-9a-f]{8}$/);
  });
  it("rechaza SVG, PDF y bytes sin tipo", async () => {
    const msg = { ok: false, error: "El logo debe ser PNG, JPG o WebP" };
    expect(await validarLogo(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toEqual(msg);
    expect(await validarLogo(new TextEncoder().encode("%PDF-1.4 …"))).toEqual(msg);
    expect(await validarLogo(new Uint8Array(0))).toEqual(msg);
  });
  it("rechaza más de 1 MB y dimensiones fuera de rango", async () => {
    expect(await validarLogo(new Uint8Array(LOGO_MAX_BYTES + 1))).toEqual({ ok: false, error: "El logo supera 1 MB" });
    expect(await validarLogo(pngDePrueba(32, 32))).toEqual({
      ok: false,
      error: "El logo debe medir entre 64 y 2048 píxeles por lado (recibido 32 × 32)",
    });
    expect((await validarLogo(pngDePrueba(4096, 64))).ok).toBe(false);
  });
  it("lee dimensiones de cabeceras JPEG (SOF0) y WebP (VP8X)", () => {
    expect(dimensionesImagen(jpegCabecera(300, 200), "image/jpeg")).toEqual({ ancho: 300, alto: 200 });
    expect(dimensionesImagen(webpVp8xCabecera(128, 96), "image/webp")).toEqual({ ancho: 128, alto: 96 });
  });
  it("devuelve null ante cabeceras truncadas", () => {
    expect(dimensionesImagen(new Uint8Array(10), "image/png")).toBeNull();
    expect(dimensionesImagen(new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg")).toBeNull();
    expect(dimensionesImagen(new Uint8Array(20), "image/webp")).toBeNull();
  });
});
