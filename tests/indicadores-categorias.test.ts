import { describe, expect, it } from "vitest";
import { analizar } from "@/lib/indicadores/formula/analizar";
import { comparar, fraccion, type Fraccion } from "@/lib/indicadores/formula/fraccion";
import type { FichaDeCalculo } from "@/lib/indicadores/calculo";
import type { Regla } from "@/lib/indicadores/semaforo";
import { errorDeDesagregacion, estadoDeFila, listaDelPeriodo, resultadoDeCategoria, totalDeCategorias, type CategoriaDeMedicion } from "@/lib/indicadores/categorias";

const f = (t: string) => fraccion(t)!;
const calculo = (): FichaDeCalculo => {
  const a = analizar("A / B * 100");
  if (!a.ok) throw new Error();
  return { arbol: a.arbol, letras: ["A", "B"], resultadoMin: null, resultadoMax: null };
};
const cat = (id: number, nombre: string, noAplica: string | null = null): CategoriaDeMedicion => ({ id, nombre, orden: id, noAplica });
const vals = (A: string, B: string): Record<string, Fraccion> => ({ A: f(A), B: f(B) });
const regla: Regla = { tendencia: "ascendente", meta: f("85"), metaMax: null, modo: "relativo", umbralPct: 70, limite: null, tolerancia: null };

describe("categorías de una desagregación", () => {
  it("la lista del periodo: creadas antes del fin y activas o desactivadas después del inicio", () => {
    const d = (s: string) => new Date(s);
    const maestro = [
      { id: 1, nombre: "Tardía", orden: 1, activo: true, creadoEn: d("2026-04-20T12:00:00Z"), desactivadaEn: null },
      { id: 2, nombre: "Cerró en febrero", orden: 2, activo: false, creadoEn: d("2025-01-10T12:00:00Z"), desactivadaEn: d("2026-02-15T12:00:00Z") },
      { id: 3, nombre: "Cerró antes", orden: 3, activo: false, creadoEn: d("2024-01-10T12:00:00Z"), desactivadaEn: d("2025-12-20T12:00:00Z") },
      { id: 4, nombre: "Vigente", orden: 0, activo: true, creadoEn: d("2025-01-10T12:00:00Z"), desactivadaEn: null },
    ];
    const lista = listaDelPeriodo(maestro, { desde: d("2026-01-01T05:00:00Z"), hasta: d("2026-04-01T04:59:59Z") });
    expect(lista.map((c) => c.id)).toEqual([4, 2]);
    expect(lista.every((c) => c.noAplica === null)).toBe(true);
  });
  it("estado de una fila", () => {
    expect(estadoDeFila(cat(1, "x"), vals("0", "0"), calculo())).toBe("sin_casos");
    expect(estadoDeFila(cat(1, "x"), vals("5", "10"), calculo())).toBe("completa");
    expect(estadoDeFila(cat(1, "x", "Cerrado por obras"), {}, calculo())).toBe("no_aplica");
    expect(estadoDeFila(cat(1, "x"), { A: f("3") }, calculo())).toBe("incompleta");
  });
  const filas = () => [
    { categoria: cat(1, "Sede principal"), valores: vals("182", "200") },
    { categoria: cat(2, "Puesto 1"), valores: vals("43", "50") },
    { categoria: cat(3, "Puesto 2"), valores: vals("39", "50") },
    { categoria: cat(4, "Puesto 3"), valores: vals("11", "20") },
    { categoria: cat(5, "Puesto 4"), valores: vals("0", "0") },
    { categoria: cat(6, "Puesto 5", "Cerrado por obras"), valores: {} },
  ];
  it("el total suma las que aplican", () => {
    const t = totalDeCategorias(filas(), calculo());
    expect(t.clase).toBe("total");
    if (t.clase === "total") {
      expect(comparar(t.valores.A, f("275"))).toBe(0);
      expect(comparar(t.valores.B, f("320"))).toBe(0);
    }
  });
  it("con una incompleta faltan sus nombres", () => {
    const l = filas();
    l[1] = { categoria: cat(2, "Puesto 1"), valores: { A: f("3") } };
    expect(totalDeCategorias(l, calculo())).toEqual({ clase: "faltan", categorias: ["Puesto 1"] });
  });
  it("con todas en No aplica, ninguna aplica", () => {
    expect(totalDeCategorias([{ categoria: cat(1, "a", "x"), valores: {} }], calculo())).toEqual({ clase: "ninguna_aplica" });
  });
  it("el resultado de una categoría usa calcular", () => {
    const r = resultadoDeCategoria(vals("182", "200"), calculo(), regla);
    expect(r.semaforo).toBe("bien");
    expect(r.cumple).toBe(true);
    expect(resultadoDeCategoria(vals("0", "0"), calculo(), regla)).toEqual({ resultado: null, semaforo: null, cumple: null });
  });
  it("una fórmula con min, max o abs no se desagrega", () => {
    const mensaje = "Una fórmula con min, max o abs no se puede desagregar";
    expect(errorDeDesagregacion({ forma: "libre", formula: "max(A - B; 0)" })).toBe(mensaje);
    expect(errorDeDesagregacion({ forma: "libre", formula: "A / B * 100" })).toBeNull();
    expect(errorDeDesagregacion({ forma: "porcentaje", formula: null })).toBeNull();
  });
});
