/**
 * Un módulo sin `"use client"` (de servidor) no importa un valor que no sea un componente desde un módulo `"use client"`:
 * Next convierte cada export de ese módulo en una referencia de cliente, y llamar una de ellas en el servidor lanza en
 * tiempo de ejecución («Attempted to call … from the server»). Vitest no aplica esa transformación, así que solo un
 * test estático lo ve (lo que rompió la verificación cerrada en la Tarea 13). Los componentes (mayúscula inicial) y los
 * `import type` sí se pueden importar.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const raiz = path.resolve(import.meta.dirname, "..");

const esCliente = (fuente: string) => /^\s*["']use client["']/.test(fuente);

/** Los nombres importados con llaves que no son tipos ni componentes. */
function valoresImportados(fuente: string): { desde: string; nombres: string[] }[] {
  const importaciones: { desde: string; nombres: string[] }[] = [];
  for (const m of fuente.matchAll(/import\s+(?!type\b)\{([^}]*)\}\s+from\s+["']([^"']+)["']/g)) {
    const nombres = m[1]
      .split(",")
      .map((n) => n.trim())
      .filter((n) => n !== "" && !n.startsWith("type "))
      .map((n) => n.split(/\s+as\s+/)[0])
      .filter((n) => !/^[A-Z]/.test(n));
    if (nombres.length > 0) importaciones.push({ desde: m[2], nombres });
  }
  return importaciones;
}

function resolver(archivo: string, desde: string): string | null {
  const base = desde.startsWith("@/") ? path.join(raiz, "src", desde.slice(2)) : desde.startsWith(".") ? path.resolve(path.dirname(archivo), desde) : null;
  if (!base) return null;
  for (const extension of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    if (existsSync(base + extension)) return base + extension;
  }
  return null;
}

const modulos = readdirSync(path.join(raiz, "src"), { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
  .map((e) => path.join(e.parentPath, e.name));

describe("frontera entre servidor y cliente", () => {
  it("el detector ve el caso que rompió la verificación y deja pasar tipos y componentes", () => {
    expect(valoresImportados('import { urlDeFoto } from "./ItemChequeo";')).toEqual([{ desde: "./ItemChequeo", nombres: ["urlDeFoto"] }]);
    expect(valoresImportados('import { ItemChequeo, type ValorItem } from "./ItemChequeo";')).toEqual([]);
    expect(valoresImportados('import type { Hallazgo } from "./hallazgos";')).toEqual([]);
  });

  it("ningún módulo de servidor importa un valor que no sea un componente desde un módulo de cliente", () => {
    const cruces: string[] = [];
    for (const archivo of modulos) {
      const fuente = readFileSync(archivo, "utf8");
      if (esCliente(fuente)) continue;
      for (const { desde, nombres } of valoresImportados(fuente)) {
        const destino = resolver(archivo, desde);
        if (destino && esCliente(readFileSync(destino, "utf8"))) {
          cruces.push(`${path.relative(raiz, archivo)} ← ${desde}: ${nombres.join(", ")}`);
        }
      }
    }
    expect(cruces).toEqual([]);
    expect(modulos.length).toBeGreaterThan(100);
  });
});
