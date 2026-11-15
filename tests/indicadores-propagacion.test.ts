import { describe, expect, it } from "vitest";
import { laFuenteMueveElPlazo } from "@/lib/indicadores/propagacion";

const zona = "America/Bogota";
const ahora = new Date("2026-05-10T15:00:00Z");
const ayer = new Date("2026-05-09T15:00:00Z");
const manana = new Date("2026-05-11T15:00:00Z");

describe("el plazo que mueve la fuente", () => {
  it("pasa de no pedir a pedir con la fecha vencida: fecha nueva", () => {
    const r = laFuenteMueveElPlazo({ pedia: false, pide: true, venceEn: ayer, ahora, plazoDias: 10, zona });
    expect(r).not.toBeNull();
    expect(r!.getTime()).toBeGreaterThan(ahora.getTime());
  });
  it("si ya pedía, no la mueve", () => {
    expect(laFuenteMueveElPlazo({ pedia: true, pide: true, venceEn: ayer, ahora, plazoDias: 10, zona })).toBeNull();
  });
  it("con la fecha en el futuro y plazo 10, no la mueve; con plazo 0, sí", () => {
    expect(laFuenteMueveElPlazo({ pedia: false, pide: true, venceEn: manana, ahora, plazoDias: 10, zona })).toBeNull();
    expect(laFuenteMueveElPlazo({ pedia: false, pide: true, venceEn: manana, ahora, plazoDias: 0, zona })).not.toBeNull();
  });
  it("si no pide, no la mueve", () => {
    expect(laFuenteMueveElPlazo({ pedia: false, pide: false, venceEn: ayer, ahora, plazoDias: 0, zona })).toBeNull();
  });
});
