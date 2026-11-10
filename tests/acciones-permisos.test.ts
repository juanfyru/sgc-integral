import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ARCHIVOS_PANEL = [
  ...readdirSync("src/app/admin")
    .filter((n) => /^acciones.*.ts$/.test(n))
    .map((n) => `src/app/admin/${n}`),
  "src/app/acciones-tramites.ts",
  "src/app/acciones-distribucion.ts",
  "src/app/acciones-vigencia.ts",
  "src/app/acciones-normograma.ts",
];

function exportadas(src: string) {
  const m = [...src.matchAll(/export async function (\w+)\(/g)];
  return m.map((x, i) => ({ nombre: x[1], cuerpo: src.slice(x.index!, m[i + 1]?.index ?? src.length) }));
}

describe("toda acción del panel declara su permiso", () => {
  it("hay archivos de acciones", () => {
    expect(ARCHIVOS_PANEL.length).toBeGreaterThanOrEqual(3);
  });
  for (const archivo of ARCHIVOS_PANEL) {
    const src = readFileSync(archivo, "utf8");
    for (const { nombre, cuerpo } of exportadas(src)) {
      it(`${archivo} › ${nombre}`, () => {
        expect(cuerpo).toMatch(/mutacion\(\s*formData,\s*"[a-z_.]+"|requerirPermiso\(/);
      });
    }
  }
});

describe("toda acción de cuenta exige sesión salvo ingresar", () => {
  const src = readFileSync("src/app/acciones-cuenta.ts", "utf8");
  for (const { nombre, cuerpo } of exportadas(src)) {
    if (nombre === "ingresar") continue;
    it(nombre, () => expect(cuerpo).toMatch(/requerirSesion\(|sesionActual\(|sesionParaInscribir\(/));
  }
});
