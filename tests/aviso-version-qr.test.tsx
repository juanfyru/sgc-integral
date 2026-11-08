import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AvisoVersionQr, versionDeQr } from "@/componentes/documentos/AvisoVersionQr";

describe("versionDeQr", () => {
  it.each([
    ["2", 2],
    ["0042", 42],
    ["9999", 9999],
    ["12345", null],
    ["2a", null],
    ["-1", null],
    ["", null],
    [undefined, null],
    [["2", "3"], null],
  ])("%j", (valor, esperado) => {
    expect(versionDeQr(valor)).toBe(esperado);
  });
});

describe("AvisoVersionQr", () => {
  it("sin versión en el QR no pinta nada", () => {
    expect(renderToStaticMarkup(<AvisoVersionQr solicitada={null} vigente={3} />)).toBe("");
  });
  it("con la misma versión dice que corresponde a la vigente", () => {
    const h = renderToStaticMarkup(<AvisoVersionQr solicitada={3} vigente={3} />);
    expect(h).toContain("Esta copia corresponde a la versión vigente");
    expect(h).toContain('role="status"');
    expect(h).toContain("bg-estado-bien-fondo");
  });
  it("con otra versión dice cuál es la vigente", () => {
    const h = renderToStaticMarkup(<AvisoVersionQr solicitada={2} vigente={3} />);
    expect(h).toContain("Esta copia es de la versión 2; la vigente es la 3");
    expect(h).toContain("bg-estado-atencion-fondo");
  });
});
