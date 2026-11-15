import { describe, expect, it } from "vitest";
import { comparar, deTexto, entero, type Fraccion } from "@/lib/indicadores/formula/fraccion";
import { porcentajeDeCumplimiento } from "@/lib/indicadores/cumplimiento";
import type { Tendencia } from "@/lib/indicadores/tipos";

const n = (x: number) => entero(x);
const pct = (resultado: number, meta: number | null, tendencia: Tendencia, cumple: boolean | null): Fraccion | null =>
  porcentajeDeCumplimiento({ resultado: n(resultado), meta: meta === null ? null : n(meta), tendencia, cumple });
const igual = (a: Fraccion | null, esperado: string) => expect(a !== null && comparar(a, deTexto(esperado))).toBe(0);

describe("porcentaje de cumplimiento", () => {
  it("cumplir es 100", () => igual(pct(95, 90, "ascendente", true), "100/1"));
  it("ascendente: resultado sobre meta, exacto", () => igual(pct(60, 90, "ascendente", false), "200/3"));
  it("descendente: meta sobre resultado", () => igual(pct(8, 5, "descendente", false), "125/2"));
  it("descendente con meta 0 es 0", () => igual(pct(2, 0, "descendente", false), "0/1"));
  it("ascendente con meta 0 es 0", () => igual(pct(2, 0, "ascendente", false), "0/1"));
  it("ascendente con resultado negativo es 0", () => igual(pct(-4, 90, "ascendente", false), "0/1"));
  it("una constante que no cumple es 0", () => igual(pct(50, 90, "constante", false), "0/1"));
  it("Bien que no alcanza la meta nunca es 100", () => igual(pct(88, 90, "ascendente", false), "880/9"));
  it("sin veredicto es null", () => expect(pct(88, 90, "ascendente", null)).toBeNull());
});
