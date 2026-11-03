// Genera src/lib/datos/claves-comunes.json a partir de SecLists
// (Passwords/Common-Credentials/10k-most-common.txt, licencia MIT).
// Se ejecuta a mano y el resultado se versiona: el runtime no tiene internet.
import { writeFileSync } from "node:fs";
import path from "node:path";

const URL_FUENTE =
  "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/10k-most-common.txt";
const destino = path.resolve(import.meta.dirname, "../src/lib/datos/claves-comunes.json");

const respuesta = await fetch(URL_FUENTE);
if (!respuesta.ok) throw new Error(`Descarga fallida: HTTP ${respuesta.status}`);
const texto = await respuesta.text();

const claves = [
  ...new Set(
    texto
      .split(/\r?\n/)
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l.length > 0),
  ),
];
writeFileSync(destino, JSON.stringify(claves) + "\n");
console.log(`${claves.length} claves escritas en ${destino}`);
