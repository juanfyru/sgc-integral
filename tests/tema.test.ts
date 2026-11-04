import { describe, expect, it } from "vitest";
import { temaEfectivo } from "@/lib/tema";

describe("temaEfectivo", () => {
  it("con sesión manda el perfil", () => expect(temaEfectivo({ tema: "oscuro" }, "claro")).toBe("oscuro"));
  it("sin sesión usa la cookie válida", () => expect(temaEfectivo(null, "sistema")).toBe("sistema"));
  it("cookie inválida o ausente → claro", () => {
    expect(temaEfectivo(null, "azul")).toBe("claro");
    expect(temaEfectivo(null, undefined)).toBe("claro");
  });
});
