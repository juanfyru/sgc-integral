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

const paginasApp = archivos("src/app/(app)", "page.tsx");
const paginasCuenta = archivos("src/app/(cuenta)", "page.tsx");
const paginasIngreso = archivos("src/app/ingreso", "page.tsx");
const paginas = [...paginasApp, ...paginasCuenta, ...paginasIngreso];
const cargas = archivos("src/app/(app)", "loading.tsx");

// El <main id="contenido"> lo ponen Cascaron (app) y PantallaCentrada (cuenta, ingreso).
describe("ninguna página define su propio <main>", () => {
  it("hay páginas en cada grupo y cargas en (app)", () => {
    expect(paginasApp.length).toBeGreaterThan(35);
    expect(paginasCuenta.length).toBeGreaterThanOrEqual(4);
    expect(paginasIngreso.length).toBeGreaterThanOrEqual(2);
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
// Las clases se comprueban una por una, en cualquier orden.
const clases = (atributo: string) => atributo.split(/\s+/).filter(Boolean);
const centra = (c: string[]) => c.includes("mx-auto") && c.some((x) => x.startsWith("max-w-"));
const rellena = (c: string[]) => c.some((x) => /^(?:[a-z0-9]+:)*p[xy]?-\d/.test(x));
const ATRIBUTO = /className=(?:"([^"]*)"|\{`([^`]*)`\})/;
const atributos = (fuente: string) =>
  [...fuente.matchAll(new RegExp(ATRIBUTO, "g"))].map((m) => clases(m[1] ?? m[2]));

/** Clases del elemento raíz que devuelve el componente por defecto (null si no se reconoce). */
function clasesRaiz(fuente: string): string[] | null {
  const cuerpo = fuente.slice(fuente.indexOf("export default"));
  const apertura = cuerpo.match(/return\s*\(?\s*<([A-Za-z][\w.]*)?((?:[^>"{]|"[^"]*"|\{[^}]*\})*)>/);
  if (!apertura) return null;
  const atributo = apertura[2].match(ATRIBUTO);
  return atributo ? clases(atributo[1] ?? atributo[2]) : [];
}

const conAncho = [...paginasApp, ...cargas];

describe("ninguna página de (app) se centra contra el cascarón", () => {
  it("se reconoce el elemento raíz de casi todas", () => {
    expect(conAncho.filter((r) => clasesRaiz(leer(r)) !== null).length).toBeGreaterThan(conAncho.length - 3);
  });
  it.each(conAncho)("%s", (ruta) => {
    const fuente = leer(ruta);
    const deLaRaiz = clasesRaiz(fuente) ?? [];
    // La raíz no se centra ni repite el relleno exterior del cascarón (puede acotar su ancho).
    expect(deLaRaiz.filter((x) => x === "mx-auto" || rellena([x]))).toEqual([]);
    // Ningún otro elemento reproduce el envoltorio de página: centrado + ancho + relleno.
    expect(atributos(fuente).filter((c) => centra(c) && rellena(c)).map((c) => c.join(" "))).toEqual([]);
  });
});

// §8 y §9.2: un solo patrón de cabecera en (app).
const CABECERAS = [
  "src/app/(app)/procesos/[slug]/page.tsx",
  "src/app/(app)/procesos/[slug]/[sub]/page.tsx",
  "src/app/(app)/documentos/[codigo]/page.tsx",
  "src/app/(app)/admin/(panel)/documentos/[codigo]/page.tsx",
];

describe("las páginas de (app) usan EncabezadoPagina y ningún <h1> propio", () => {
  it.each(paginasApp)("%s", (ruta) => {
    expect(leer(ruta)).not.toContain("<h1");
  });
  it.each(CABECERAS)("%s usa EncabezadoPagina", (ruta) => {
    expect(leer(ruta)).toContain("<EncabezadoPagina");
  });
  it("la ficha del panel muestra el código en mono (codigo=, no superior=)", () => {
    const t = leer("src/app/(app)/admin/(panel)/documentos/[codigo]/page.tsx");
    expect(t).toContain("codigo={documento.codigo}");
    expect(t).not.toContain("superior={documento.codigo}");
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

  it("un notFound() dentro de (app) se pinta en el cascarón, sin <main> propio", () => {
    const ruta = "src/app/(app)/not-found.tsx";
    expect(existsSync(path.join(raiz, ruta))).toBe(true);
    const t = leer(ruta);
    expect(t).toContain("<EncabezadoPagina");
    expect(t).toContain("Página no encontrada");
    expect(t).toMatch(/href="\/"/);
    expect(t).not.toContain("<main");
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
