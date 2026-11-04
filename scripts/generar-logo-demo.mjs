// Genera src/db/semillas/recursos/logo-demo.png: PNG RGBA de 256 x 256, fondo
// #1b4e8e con esquinas redondeadas y una cruz #2e9b47 centrada. Sin dependencias.
// Uso: node scripts/generar-logo-demo.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

const N = 256;
const RADIO = 48;
const FONDO = [0x1b, 0x4e, 0x8e];
const CRUZ = [0x2e, 0x9b, 0x47];
const BRAZO = 40; // grosor de la cruz
const LARGO = 144; // largo de cada brazo
const ini = (N - BRAZO) / 2;
const finLargo = (N + LARGO) / 2;
const iniLargo = (N - LARGO) / 2;

function dentroRedondeado(x, y) {
  const cx = x < RADIO ? RADIO : x >= N - RADIO ? N - 1 - RADIO : x;
  const cy = y < RADIO ? RADIO : y >= N - RADIO ? N - 1 - RADIO : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= RADIO ** 2;
}

function enCruz(x, y) {
  const vertical = x >= ini && x < ini + BRAZO && y >= iniLargo && y < finLargo;
  const horizontal = y >= ini && y < ini + BRAZO && x >= iniLargo && x < finLargo;
  return vertical || horizontal;
}

const crudo = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) {
  const fila = y * (N * 4 + 1);
  crudo[fila] = 0; // filtro: ninguno
  for (let x = 0; x < N; x++) {
    const o = fila + 1 + x * 4;
    if (!dentroRedondeado(x, y)) continue; // transparente
    const [r, g, b] = enCruz(x, y) ? CRUZ : FONDO;
    crudo[o] = r;
    crudo[o + 1] = g;
    crudo[o + 2] = b;
    crudo[o + 3] = 255;
  }
}

const TABLA = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = TABLA[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function trozo(tipo, datos) {
  const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0);
ihdr.writeUInt32BE(N, 4);
ihdr[8] = 8; // profundidad de bits
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  trozo("IHDR", ihdr),
  trozo("IDAT", deflateSync(crudo, { level: 9 })),
  trozo("IEND", Buffer.alloc(0)),
]);

const destino = path.join("src", "db", "semillas", "recursos", "logo-demo.png");
mkdirSync(path.dirname(destino), { recursive: true });
writeFileSync(destino, png);
console.log(`${destino}: ${png.length} bytes`);
