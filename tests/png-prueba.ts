import { deflateSync } from "node:zlib";

const TABLA = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = TABLA[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function trozo(tipo: string, datos: Buffer): Buffer {
  const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

/** PNG real, RGBA 8 bits, de un solo color (`relleno` cambia los bytes y, con ellos, la versión). */
export function pngDePrueba(ancho: number, alto: number, relleno = 0x7f): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const fila = Buffer.alloc(1 + ancho * 4, relleno);
  fila[0] = 0;
  const crudo = Buffer.concat(Array.from({ length: alto }, () => fila));
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      trozo("IHDR", ihdr),
      trozo("IDAT", deflateSync(crudo)),
      trozo("IEND", Buffer.alloc(0)),
    ]),
  );
}
