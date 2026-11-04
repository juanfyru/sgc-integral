import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function exportadas(src: string) {
  const m = [...src.matchAll(/export async function (\w+)\(/g)];
  return m.map((x, i) => ({ nombre: x[1], cuerpo: src.slice(x.index!, m[i + 1]?.index ?? src.length) }));
}

describe("acciones de cuenta invalidan la caché del enrutador antes de redirigir", () => {
  const src = readFileSync("src/app/acciones-cuenta.ts", "utf8");
  const acciones = exportadas(src);
  it("hay acciones", () => expect(acciones.length).toBeGreaterThanOrEqual(8));
  for (const { nombre, cuerpo } of acciones) {
    if (!cuerpo.includes("redirect(")) continue;
    it(nombre, () => expect(cuerpo).toContain("revalidatePath("));
  }
});
