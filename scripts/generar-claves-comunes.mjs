// Genera src/lib/datos/claves-comunes.json a partir de SecLists (licencia MIT):
//   https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/10-million-password-list-top-1000000.txt
// Respaldo si falla (el archivo primario fue renombrado upstream y hoy da 404): Passwords/Common-Credentials/xato-net-10-million-passwords-1000000.txt (misma carpeta de SecLists).
// Criterios: solo entradas de 12 a 128 caracteres (las únicas que la política permite),
// en minúsculas, sin duplicados, en el orden del archivo (por frecuencia), máximo 50 000.
// Se ejecuta a mano y el resultado se versiona: el runtime no tiene internet.
import { writeFileSync } from "node:fs";
import path from "node:path";

const BASE = "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/";
const FUENTES = [
  BASE + "Common-Credentials/10-million-password-list-top-1000000.txt",
  BASE + "Common-Credentials/xato-net-10-million-passwords-1000000.txt",
];
const MIN = 12;
const MAX = 128;
const TOPE = 50_000;
const destino = path.resolve(import.meta.dirname, "../src/lib/datos/claves-comunes.json");

async function descargar(url) {
  for (let intento = 1; intento <= 2; intento++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.text();
      console.error(`HTTP ${r.status} en ${url} (intento ${intento})`);
    } catch (e) {
      console.error(`Error en ${url} (intento ${intento}): ${e}`);
    }
  }
  return null;
}

let texto = null;
for (const url of FUENTES) {
  texto = await descargar(url);
  if (texto) {
    console.log(`Fuente: ${url}`);
    break;
  }
}
if (!texto) throw new Error("No se pudo descargar ninguna fuente");

const vistas = new Set();
for (const linea of texto.split(/\r?\n/)) {
  const c = linea.toLowerCase();
  if (c.length < MIN || c.length > MAX || vistas.has(c)) continue;
  vistas.add(c);
  if (vistas.size >= TOPE) break;
}
writeFileSync(destino, JSON.stringify([...vistas]) + "\n");
console.log(`${vistas.size} claves escritas en ${destino}`);
