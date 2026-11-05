import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const raiz = path.resolve(import.meta.dirname, "..");
const leer = (ruta: string) => readFileSync(path.join(raiz, ruta), "utf8");
const panel = "src/app/(app)/admin/(panel)";

// La opacidad sobre un contenedor baja de AA todo lo que lleva dentro (texto, botones y la banda).
// Solo cuenta la opacidad fija: la de un estado (disabled:opacity-30) es legítima.
const ATENUA = /(?<![\w:-])opacity-\d/;
describe("contraste AA en el panel", () => {
  it("la versión fuera de circulación no se atenúa: la banda OBSOLETO/ANULADO conserva su contraste", () => {
    const t = leer(`${panel}/documentos/[codigo]/page.tsx`);
    const conMarca = t.split("\n").filter((l) => l.includes("marca-estado"));
    expect(conMarca.length).toBeGreaterThan(0);
    for (const l of conMarca) expect(l).not.toMatch(ATENUA);
  });

  it.each([
    `${panel}/estructura/page.tsx`,
    `${panel}/mapa/page.tsx`,
    `${panel}/mapa/perifericos/page.tsx`,
    `${panel}/tipos/page.tsx`,
    "src/componentes/admin/mapa/ListaProcesos.tsx",
    "src/componentes/admin/mapa/ListaSubprocesos.tsx",
  ])("%s: la fila inactiva conserva el contraste y dice «Inactivo» con texto", (ruta) => {
    const t = leer(ruta);
    expect(t).not.toMatch(ATENUA);
    expect(t).toContain('"border-dashed"');
    expect(t).toMatch(/<Insignia variante="sin-dato">Inactiv[oa]<\/Insignia>/);
  });

  it("la lista de usuarios no atenúa las filas inactivas (la insignia ya dice «Inactivo»)", () => {
    const t = leer(`${panel}/usuarios/page.tsx`);
    expect(t).not.toMatch(ATENUA);
    expect(t).toContain('<Insignia variante="sin-dato">Inactivo</Insignia>');
  });
});
