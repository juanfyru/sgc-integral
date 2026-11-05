import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lineas = (archivo: string) =>
  readFileSync(archivo, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

// Datos de desarrollo y artefactos de trabajo que no deben entrar en la imagen: el almacén y los
// respaldos locales llevarían documentos y el logo de la demo; los demás, notas y reportes.
const EXCLUIDOS = ["almacen", "respaldos", ".superpowers", ".playwright-mcp", "coverage"];

describe(".dockerignore", () => {
  it.each(EXCLUIDOS)("excluye %s", (ruta) => {
    expect(lineas(".dockerignore")).toContain(ruta);
  });
  it("el Dockerfile no copia ninguno de ellos", () => {
    const copias = lineas("Dockerfile").filter((l) => /^COPY\b/.test(l));
    for (const ruta of EXCLUIDOS) expect(copias.join("\n")).not.toContain(ruta);
  });
});

describe("Dockerfile", () => {
  it("crea el almacén vacío y del usuario de la app (ya no llega con el contexto)", () => {
    expect(lineas("Dockerfile")).toContain("RUN mkdir -p /app/almacen && chown nextjs:nodejs /app/almacen");
  });
});
