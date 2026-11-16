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
// Los catálogos de la distribución salen del panel (spec 13C §12.3): el líder y Gerencia no entran a él. Siguen la
// regla del portal, más su propia regla de alcance.
const catalogos = paginas("src/app/(app)/admin/(catalogos)");

// Las guardas de página que llaman ellas mismas `exigirSesion()` antes de su regla de alcance (anexo 14C, §4.7: la página
// de un dato compartido). Una página que llama una de ellas cumple la regla del portal; la guarda lo prueba abajo.
const GUARDAS_CON_SESION: Record<string, string> = { exigirDato: "src/app/(app)/indicadores/datos/_comun.ts" };
const llamaSuGuarda = new RegExp(`exigir(Sesion|Permiso)\\(|(${Object.keys(GUARDAS_CON_SESION).join("|")})\\(`);

describe("cada página comprueba la sesión", () => {
  it.each(portal)("portal: %s", (ruta) => {
    expect(readFileSync(ruta, "utf8")).toMatch(llamaSuGuarda);
  });
  it.each(Object.entries(GUARDAS_CON_SESION))("la guarda %s llama exigirSesion() y responde «no encontrado»", (guarda, archivo) => {
    const fuente = readFileSync(path.join(raiz, archivo), "utf8");
    expect(fuente).toMatch(new RegExp(`export async function ${guarda}\\(`));
    expect(fuente).toContain("exigirSesion(");
    expect(fuente).toContain("notFound(");
  });
  it("las páginas de «Datos compartidos» llaman su guarda", () => {
    const lista = readFileSync(path.join(raiz, "src/app/(app)/indicadores/datos/page.tsx"), "utf8");
    expect(lista).toContain("exigirSesion(");
    expect(lista).toContain("notFound(");
    const dato = readFileSync(path.join(raiz, "src/app/(app)/indicadores/datos/[id]/page.tsx"), "utf8");
    expect(dato).toContain("exigirDato(");
    expect(dato).not.toContain("exigirPermiso(");
  });
  it.each(paginas("src/app/(cuenta)"))("cuenta: %s", (ruta) => {
    expect(readFileSync(ruta, "utf8")).toContain("exigirSesionConPendientes(");
  });
  it.each(panel)("panel: %s", (ruta) => {
    expect(readFileSync(ruta, "utf8")).toMatch(/(exigirPermiso|exigirEntradaPanel)\(/);
  });
  it.each(catalogos)("catálogos: %s", (ruta) => {
    const fuente = readFileSync(ruta, "utf8");
    expect(fuente).toContain("exigirSesion(");
    expect(fuente).toContain("exigirCatalogo(");
    expect(fuente).not.toContain("exigirEntradaPanel(");
  });
  it("hay páginas en ambos grupos", () => {
    expect(portal.length).toBeGreaterThan(3);
    expect(paginas("src/app/(cuenta)").length).toBeGreaterThan(0);
    // Los catálogos salieron del panel: ninguna página del panel queda bajo sus carpetas.
    expect(panel.filter((r) => /[\\/](puntos-uso|listas-distribucion)[\\/]/.test(r))).toEqual([]);
    expect(catalogos.length).toBe(6);
    // El grupo de los catálogos cuenta como portal: la regla de sesión del portal le aplica.
    expect(catalogos.every((r) => portal.includes(r))).toBe(true);
  });
  it("el layout de los catálogos no exige la entrada al panel y nunca se prerenderiza", () => {
    const layout = readFileSync(path.join(raiz, "src/app/(app)/admin/(catalogos)/layout.tsx"), "utf8");
    expect(layout).toContain('export const dynamic = "force-dynamic"');
    expect(layout).not.toContain("exigirEntradaPanel(");
    expect(layout).not.toContain("@/lib/paginas");
  });
});
