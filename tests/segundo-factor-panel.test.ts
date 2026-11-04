import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("página del segundo factor mantiene el panel montado en todas las ramas", () => {
  const src = readFileSync("src/app/(cuenta)/cuenta/segundo-factor/page.tsx", "utf8");
  const asignaciones = [...src.matchAll(/contenido = \(\s*(<\S+)/g)].map((m) => m[1]);
  it("hay cuatro ramas", () => expect(asignaciones.length).toBe(4));
  it("cada una abre con <PanelSegundoFactor", () => {
    for (const a of asignaciones) expect(a).toBe("<PanelSegundoFactor");
  });
});
