import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const raiz = path.resolve(import.meta.dirname, "..");

// Los layouts no se re-renderizan en la navegación del cliente: cada página
// vuelve a comprobar la sesión por sí misma.
function paginas(dir: string): string[] {
  return readdirSync(path.join(raiz, dir), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name === "page.tsx")
    .map((e) => path.join(e.parentPath, e.name));
}

// El portal y el panel cuelgan del mismo grupo (app); el panel vive en admin/(panel).
const esDelPanel = (ruta: string) =>
  ruta.split(path.sep).join("/").includes("/(app)/admin/(panel)/");
const portal = paginas("src/app/(app)").filter((r) => !esDelPanel(r));
const panel = paginas("src/app/(app)/admin/(panel)");

describe("cada página comprueba la sesión", () => {
  it.each(portal)("portal: %s", (ruta) => {
    expect(readFileSync(ruta, "utf8")).toMatch(/exigir(Sesion|Permiso)\(/);
  });
  it.each(paginas("src/app/(cuenta)"))("cuenta: %s", (ruta) => {
    expect(readFileSync(ruta, "utf8")).toContain("exigirSesionConPendientes(");
  });
  it.each(panel)("panel: %s", (ruta) => {
    expect(readFileSync(ruta, "utf8")).toMatch(/(exigirPermiso|exigirEntradaPanel)\(/);
  });
  it("hay páginas en ambos grupos", () => {
    expect(portal.length).toBeGreaterThan(3);
    expect(paginas("src/app/(cuenta)").length).toBeGreaterThan(0);
    expect(panel.length).toBeGreaterThan(15);
  });
});
