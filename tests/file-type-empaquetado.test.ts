/**
 * De `file-type` solo se usan las funciones que analizan un búfer (Tarea 19, ronda 1, defecto D-1). `fileTypeFromFile`
 * (y el método `fromFile` del analizador, que usan también las funciones de flujo y de tokenizador de archivo) cargan
 * `node:fs/promises` y `strtok3` con un `import()` de especificador no literal (`importAtRuntime`): el empaquetador de
 * Next lo reemplaza por un módulo que siempre lanza «Cannot find module as expression is too dynamic», y la subida de un
 * soporte `.xlsx` respondía 500 en `next dev` y en la imagen. Vitest no empaqueta, así que solo una prueba de texto lo ve:
 * esta lee las importaciones de `file-type` en `src/` y exige que sean de la lista permitida.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const raiz = path.resolve(import.meta.dirname, "..");

/** Lo que se puede importar de `file-type` sin que el empaquetador lo rompa (no carga módulos en tiempo de ejecución). */
const PERMITIDAS = new Set(["fileTypeFromBuffer"]);

const fuentes = readdirSync(path.join(raiz, "src"), { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name))
  .map((e) => path.join(e.parentPath, e.name));

/** El código sin sus comentarios: un comentario puede nombrar la función prohibida para explicar por qué. */
const sinComentarios = (fuente: string) => fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

/** Los nombres que cada archivo importa de `file-type` (sin los `import type`), y si lo importa entero o con `import()`. */
function importacionesDeFileType(fuente: string): { nombres: string[]; entero: boolean } {
  const nombres: string[] = [];
  let entero = false;
  for (const m of fuente.matchAll(/import\s+(type\s+)?([^;]*?)\s+from\s+["']file-type["']/g)) {
    if (m[1]) continue;
    const clausula = m[2].trim();
    const llaves = /\{([^}]*)\}/.exec(clausula);
    if (llaves) {
      for (const n of llaves[1].split(",")) {
        const nombre = n.trim();
        if (nombre && !nombre.startsWith("type ")) nombres.push(nombre.split(/\s+as\s+/)[0]);
      }
    }
    if (clausula.replace(/\{[^}]*\}/, "").replace(/,/g, "").trim() !== "") entero = true;
  }
  if (/import\(\s*["']file-type["']\s*\)|require\(\s*["']file-type["']\s*\)/.test(fuente)) entero = true;
  return { nombres, entero };
}

describe("file-type en el código de la app", () => {
  it("la lista de archivos no está vacía y alguno usa file-type", () => {
    expect(fuentes.length).toBeGreaterThan(100);
    expect(fuentes.some((f) => importacionesDeFileType(readFileSync(f, "utf8")).nombres.length > 0)).toBe(true);
  });

  it("solo se importan las funciones de búfer, nunca fileTypeFromFile ni el módulo entero", () => {
    const malas: string[] = [];
    for (const archivo of fuentes) {
      const fuente = sinComentarios(readFileSync(archivo, "utf8"));
      const { nombres, entero } = importacionesDeFileType(fuente);
      const relativo = path.relative(raiz, archivo);
      for (const n of nombres) if (!PERMITIDAS.has(n)) malas.push(`${relativo}: ${n}`);
      if (entero) malas.push(`${relativo}: importa file-type entero`);
      if (/\bfileTypeFromFile\b|\.fromFile\(/.test(fuente)) malas.push(`${relativo}: usa fromFile`);
    }
    expect(malas).toEqual([]);
  });

  it("en file-type solo `fromFile` carga módulos en tiempo de ejecución", () => {
    // Si una versión nueva de file-type lo hiciera también al analizar un búfer, esta prueba lo diría antes que la subida.
    const codigo = readFileSync(path.join(raiz, "node_modules", "file-type", "source", "index.js"), "utf8");
    const desde = codigo.indexOf("async fromFile(");
    const hasta = codigo.indexOf("\n\tasync ", desde + 1);
    expect(desde).toBeGreaterThan(-1);
    // La definición de `importAtRuntime` (y su `import()`) no es una llamada.
    const definicion = codigo.indexOf("function importAtRuntime");
    const finDefinicion = codigo.indexOf("}", definicion);
    const llamadas = [...codigo.matchAll(/importAtRuntime\(|[^\w]import\(/g)]
      .map((m) => m.index)
      .filter((i) => i < definicion || i > finDefinicion);
    expect(llamadas.length).toBeGreaterThan(0);
    for (const i of llamadas) expect(i > desde && (hasta === -1 || i < hasta)).toBe(true);
  });
});
