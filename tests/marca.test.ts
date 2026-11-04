import { describe, expect, it } from "vitest";
import { contrasteWCAG } from "../src/lib/contraste";
import { oklchAHex } from "../src/lib/color";
import {
  MARCA_DEFECTO,
  TOKENS_MARCA,
  derivarMarca,
  estiloMarca,
  formatearRazon,
  sugerirPrimario,
  sugerirSecundario,
  validarMarca,
} from "../src/lib/marca";

it("los valores por defecto pasan la validación", () =>
  expect(validarMarca({ primario: "#1b4e8e", secundario: "#2e9b47" })).toEqual([]));

it("P1 rechaza un primario claro con la razón y una sugerencia que pasa", () => {
  const [e] = validarMarca({ primario: "#9ecbff", secundario: "#2e9b47" });
  expect(e.campo).toBe("color_primario");
  expect(e.mensaje).toMatch(
    /^El color primario #9ecbff no tiene contraste suficiente con el texto blanco \(1,7:1; mínimo 4,5:1\)\. Pruebe #[0-9a-f]{6}\.$/,
  );
  expect(contrasteWCAG(e.sugerencia, "#ffffff")).toBeGreaterThanOrEqual(4.5);
});

it("P2 rechaza un secundario que no se distingue del fondo", () => {
  const [e] = validarMarca({ primario: "#1b4e8e", secundario: "#e8edf3" });
  expect(e.campo).toBe("color_secundario");
  expect(e.mensaje).toContain("no se distingue del fondo");
  expect(contrasteWCAG(e.sugerencia, "#f4f6f9")).toBeGreaterThanOrEqual(3);
});

it("formatearRazon usa un decimal y coma", () => {
  expect(formatearRazon(1.688)).toBe("1,7");
  expect(formatearRazon(8.31)).toBe("8,3");
});

it("caso borde: si el redondeo alcanza el mínimo, el mensaje muestra dos decimales", () => {
  // Busca un primario cuya razón con blanco quede en [4,45; 4,5)
  let hex = "";
  for (let g = 0; g < 256 && !hex; g++) {
    const h = `#${g.toString(16).padStart(2, "0")}${(g + 2).toString(16).padStart(2, "0")}${Math.min(255, g + 40).toString(16).padStart(2, "0")}`;
    const r = contrasteWCAG(h, "#ffffff");
    if (r >= 4.45 && r < 4.5) hex = h;
  }
  expect(hex).not.toBe("");
  const [e] = validarMarca({ primario: hex, secundario: "#2e9b47" });
  expect(e.mensaje).not.toContain("4,5:1;");
  expect(e.mensaje).toMatch(/\(4,4\d:1; mínimo 4,5:1\)/);
});

it("las sugerencias pasan sus umbrales", () => {
  expect(contrasteWCAG(sugerirPrimario("#9ecbff"), "#ffffff")).toBeGreaterThanOrEqual(4.5);
  expect(contrasteWCAG(sugerirSecundario("#e8edf3"), "#f4f6f9")).toBeGreaterThanOrEqual(3);
});

it("el monograma usa tinta sobre el verde por defecto y blanco sobre el azul", () => {
  const t = derivarMarca({ primario: "#1b4e8e", secundario: "#2e9b47" });
  expect(t.claro["marca-2-contraste"]).toBe("#16181d");
  expect(derivarMarca({ primario: "#1b4e8e", secundario: "#1b4e8e" }).claro["marca-2-contraste"]).toBe("#ffffff");
});

describe("derivados sobre una malla de 12 tonos × 5 luminosidades × 3 cromas", () => {
  const casos: string[] = [];
  for (let h = 0; h < 360; h += 30)
    for (const l of [0.25, 0.35, 0.45, 0.55, 0.65])
      for (const c of [0.05, 0.1, 0.15]) casos.push(oklchAHex({ l, c, h }));
  it.each(casos)("%s", (hex) => {
    const t = derivarMarca({ primario: hex, secundario: hex });
    expect(contrasteWCAG(t.oscuro.marca, "#161a20")).toBeGreaterThanOrEqual(4.5);
    expect(contrasteWCAG(t.oscuro["marca-2-texto"], "#161a20")).toBeGreaterThanOrEqual(4.5);
    expect(contrasteWCAG(t.claro["marca-2-texto"], "#f4f6f9")).toBeGreaterThanOrEqual(4.5);
    expect(contrasteWCAG(t.claro["marca-2-contraste"], t.claro["marca-2-relleno"])).toBeGreaterThanOrEqual(4.5);
    if (validarMarca({ primario: hex, secundario: hex }).length === 0) {
      expect(contrasteWCAG(t.claro["marca-relleno"], "#ffffff")).toBeGreaterThanOrEqual(4.5);
      expect(contrasteWCAG(t.oscuro["marca-relleno"], "#ffffff")).toBeGreaterThanOrEqual(4.5);
    }
  });
});

it("estiloMarca emite las catorce variables con sufijo", () => {
  const e = estiloMarca(derivarMarca(MARCA_DEFECTO));
  expect(Object.keys(e).sort()).toEqual(TOKENS_MARCA.flatMap((t) => [`--${t}-c`, `--${t}-o`]).sort());
  expect(e["--marca-relleno-c"]).toBe("#1b4e8e");
});
