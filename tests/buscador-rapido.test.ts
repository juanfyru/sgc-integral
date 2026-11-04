import { describe, expect, it } from "vitest";
import { normalizarConsulta } from "@/lib/busqueda-rapida";

describe("normalizarConsulta", () => {
  it("quita las marcas de resaltado y recorta a 120 caracteres", () => {
    const q = normalizarConsulta("⟦acta⟧ " + "x".repeat(300));
    expect(q).toHaveLength(120);
    expect(q).not.toContain("⟦");
    expect(q).not.toContain("⟧");
  });
});
