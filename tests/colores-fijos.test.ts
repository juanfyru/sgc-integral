import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const raiz = path.resolve(import.meta.dirname, "..");
const PROHIBIDAS = /\b(bg|border)-white\b|\b(bg|text|border)-(gray|red|amber|green)-\d+\b/;

const archivos = readdirSync(path.join(raiz, "src"), { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith(".tsx"))
  .map((e) => path.join(e.parentPath, e.name));

// Los colores de estado van por tokens (bg-estado-<x>-fondo, text-estado-<x>-texto, border-estado-<x>),
// que tienen valor en claro y en oscuro; text-white sobre rellenos de marca sí se permite.
describe("sin colores fijos de Tailwind", () => {
  it("recorre los componentes", () => {
    expect(archivos.length).toBeGreaterThan(50);
  });
  it.each(archivos.map((f) => [path.relative(raiz, f), f]))("%s", (_rel, f) => {
    const lineas = readFileSync(f, "utf8").split("\n");
    const malas = lineas.flatMap((l, i) => (PROHIBIDAS.test(l) ? [`${i + 1}: ${l.trim()}`] : []));
    expect(malas).toEqual([]);
  });
});

// El color de marca sale de los tokens (--marca-relleno, bg-marca-relleno…), que siguen a la
// pantalla Entidad y marca; un hex de la demo en un componente se quedaría con el color viejo.
// Se permiten los ejemplos de los textos de ayuda y el color inicial de un macroproceso nuevo
// (es un dato del mapa y el <input type="color"> no admite var()).
const HEX_MARCA_DEMO = /#(1b4e8e|2e9b47)\b/i;
const HEX_PERMITIDOS: Array<[string, RegExp]> = [
  ["FormularioEntidad.tsx", /Escriba un color como #1b4e8e|por ejemplo #1b4e8e/],
  ["FormularioMacroproceso.tsx", /defaultValue=\{val\("color"\) \?\? valores\?\.color \?\? "#1B4E8E"\}/],
];
const enAppYComponentes = archivos.filter((f) => {
  const rel = path.relative(path.join(raiz, "src"), f).split(path.sep)[0];
  return rel === "app" || rel === "componentes";
});

describe("sin el hex de la marca demo en los componentes", () => {
  it.each(enAppYComponentes.map((f) => [path.relative(raiz, f), f]))("%s", (_rel, f) => {
    const permitido = HEX_PERMITIDOS.find(([nombre]) => path.basename(f) === nombre)?.[1];
    const malas = readFileSync(f, "utf8")
      .split("\n")
      .flatMap((l, i) => (HEX_MARCA_DEMO.test(l) && !(permitido && permitido.test(l)) ? [`${i + 1}: ${l.trim()}`] : []));
    expect(malas).toEqual([]);
  });
});
