import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const raiz = path.resolve(import.meta.dirname, "..");
const leer = (ruta: string) => readFileSync(path.join(raiz, ruta), "utf8");

function archivos(dir: string, nombre: string): string[] {
  return readdirSync(path.join(raiz, dir), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name === nombre)
    .map((e) => path.relative(raiz, path.join(e.parentPath, e.name)));
}

const paginas = [
  ...archivos("src/app/(app)", "page.tsx"),
  ...archivos("src/app/(cuenta)", "page.tsx"),
  ...archivos("src/app/ingreso", "page.tsx"),
];
const cargas = archivos("src/app/(app)", "loading.tsx");

// El <main id="contenido"> lo ponen Cascaron (app) y PantallaCentrada (cuenta, ingreso).
describe("ninguna página define su propio <main>", () => {
  it("hay páginas en los tres grupos", () => {
    expect(paginas.length).toBeGreaterThan(40);
    expect(cargas.length).toBeGreaterThan(5);
  });
  it.each(paginas)("%s", (ruta) => {
    expect(leer(ruta)).not.toContain("<main");
  });
  it.each(cargas)("%s", (ruta) => {
    expect(leer(ruta)).not.toContain("<main");
  });
});

// §9.1: el cascarón manda el espacio exterior; una página acota su ancho, no se centra ni repite el relleno.
describe("ninguna página de (app) se centra contra el cascarón", () => {
  it.each([...archivos("src/app/(app)", "page.tsx"), ...cargas])("%s", (ruta) => {
    const raices = leer(ruta).match(/className="[^"]*\bmx-auto\b[^"]*\bmax-w-[^"]*"/g) ?? [];
    expect(raices.filter((c) => /\bpx-\d/.test(c))).toEqual([]);
  });
});

describe("impresión y 404 del cascarón", () => {
  const cascaron = leer("src/componentes/cascaron/Cascaron.tsx");

  it("al imprimir la rejilla del cascarón desaparece y el contenido ocupa todo el ancho", () => {
    const rejilla = cascaron.match(/className="[^"]*\blg:grid\b[^"]*"/)?.[0] ?? "";
    expect(rejilla).toMatch(/\bprint:block!(?=[\s"])/);
    const main = cascaron.match(/<main[^>]*>/)?.[0] ?? "";
    expect(main).toContain("print:max-w-none");
    expect(main).toMatch(/\bprint:px-0!(?=[\s"])/);
    expect(main).toMatch(/\bprint:py-0!(?=[\s"])/);
  });

  it("TablaDatos no recorta ni enmarca la tabla al imprimir", () => {
    const t = leer("src/componentes/ui/TablaDatos.tsx");
    const contenedor = t.match(/className="[^"]*\boverflow-x-auto\b[^"]*"/)?.[0] ?? "";
    expect(contenedor).toContain("print:overflow-visible");
    expect(contenedor).toContain("print:border-0");
    const thead = t.match(/<thead[^>]*>/)?.[0] ?? "";
    expect(thead).toContain("print:static");
    expect(thead).toContain("print:bg-transparent");
    expect(t.match(/<table[^>]*>/)?.[0] ?? "").toContain("print:text-xs");
  });

  it("el 404 lleva la marca de la entidad y un destino para «Saltar al contenido»", () => {
    const ruta = "src/app/not-found.tsx";
    expect(existsSync(path.join(raiz, ruta))).toBe(true);
    const t = leer(ruta);
    expect(t).toContain("<PantallaCentrada");
    expect(t).toContain("Página no encontrada");
    expect(t).toContain("Volver al inicio");
    expect(t).toMatch(/href="\/"/);
  });
});
