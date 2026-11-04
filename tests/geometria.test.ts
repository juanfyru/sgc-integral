/**
 * Geometría pura de las barras del mini-gráfico (Fase 8): mapea la serie a
 * rectángulos SVG sin inventar datos ni salirse del lienzo.
 */
import { describe, expect, it } from "vitest";
import { calcularBarras } from "@/componentes/ui/geometria";

describe("calcularBarras", () => {
  it("la barra de mayor conteo ocupa todo el alto y ninguna se sale", () => {
    const serie = [
      { fecha: "2026-07-01", conteo: 2 },
      { fecha: "2026-07-02", conteo: 10 },
      { fecha: "2026-07-03", conteo: 0 },
    ];
    const barras = calcularBarras(serie, { ancho: 300, alto: 100, separacion: 4 });
    expect(barras).toHaveLength(3);
    const alta = barras[1];
    expect(alta.alto).toBeCloseTo(100);
    expect(alta.y).toBeCloseTo(0);
    for (const b of barras) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.ancho).toBeLessThanOrEqual(300 + 0.001);
      expect(b.y + b.alto).toBeLessThanOrEqual(100 + 0.001);
    }
  });

  it("serie vacía devuelve arreglo vacío", () => {
    expect(calcularBarras([], { ancho: 300, alto: 100, separacion: 4 })).toEqual([]);
  });
});
