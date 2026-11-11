import { describe, expect, it } from "vitest";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import {
  anterior,
  clavesDelAnio,
  contiene,
  fechaLimiteDeReporte,
  mesesDe,
  mismoDelAnioAnterior,
  periodicidadDe,
  periodoQueContiene,
  periodosTerminados,
} from "@/lib/indicadores/periodos";
import type { Periodicidad } from "@/lib/indicadores/tipos";

const zona = "America/Bogota";

describe("periodos de indicadores", () => {
  it("periodoDe conoce el bimestre", () => {
    const b = periodoDe("2026-B1", zona)!;
    expect(b.etiqueta).toBe("primer bimestre de 2026");
    expect(b.hasta.toISOString()).toBe("2026-03-01T04:59:59.999Z");
    expect(periodoDe("2026-B7", zona)).toBeNull();
    expect(periodoDe("2026-B0", zona)).toBeNull();
    expect(periodoDe("2026-B6", zona)!.etiqueta).toBe("sexto bimestre de 2026");
    expect(periodoDe("2026-B5", zona)!.etiqueta).toBe("quinto bimestre de 2026");
  });
  it("periodicidadDe lee la clave", () => {
    expect(["2026-03", "2026-B2", "2026-T1", "2026-S2", "2026"].map(periodicidadDe)).toEqual([
      "mensual",
      "bimestral",
      "trimestral",
      "semestral",
      "anual",
    ]);
    expect(["2026-13", "2026-B7", "2026-T5", "x", ""].map(periodicidadDe)).toEqual([null, null, null, null, null]);
  });
  it("el periodo que contiene un instante", () => {
    expect(periodoQueContiene("trimestral", new Date("2026-05-15T12:00:00Z"), zona).clave).toBe("2026-T2");
    expect(periodoQueContiene("bimestral", new Date("2026-05-15T12:00:00Z"), zona).clave).toBe("2026-B3");
    expect(periodoQueContiene("mensual", new Date("2026-05-15T12:00:00Z"), zona).clave).toBe("2026-05");
    expect(periodoQueContiene("semestral", new Date("2026-07-01T05:00:00Z"), zona).clave).toBe("2026-S2");
    expect(periodoQueContiene("anual", new Date("2026-05-15T12:00:00Z"), zona).clave).toBe("2026");
  });
  it("el cambio de año, en la zona de la instalación", () => {
    const yaEsEnero = new Date("2027-01-01T05:30:00Z");
    const aunDiciembre = new Date("2027-01-01T04:30:00Z");
    const claves = (p: Periodicidad, desde: string, ahora: Date) => periodosTerminados(p, desde, ahora, zona).map((x) => x.clave);
    expect(claves("mensual", "2026-11", yaEsEnero)).toEqual(["2026-11", "2026-12"]);
    expect(claves("mensual", "2026-11", aunDiciembre)).toEqual(["2026-11"]);
    for (const [p, clave] of [
      ["bimestral", "2026-B6"],
      ["trimestral", "2026-T4"],
      ["semestral", "2026-S2"],
      ["anual", "2026"],
    ] as const) {
      expect(claves(p, clave, yaEsEnero)).toEqual([clave]);
      expect(claves(p, clave, aunDiciembre)).toEqual([]);
    }
  });
  it("los periodos terminados cruzan el año y no incluyen el que sigue en curso", () => {
    const ahora = new Date("2027-02-10T12:00:00Z");
    expect(periodosTerminados("trimestral", "2026-T3", ahora, zona).map((x) => x.clave)).toEqual(["2026-T3", "2026-T4"]);
    expect(periodosTerminados("mensual", "2027-02", ahora, zona)).toEqual([]);
    expect(periodosTerminados("mensual", "2026-12", ahora, zona).map((x) => x.clave)).toEqual(["2026-12", "2027-01"]);
  });
  it("una clave de otra periodicidad es un error, no una lista vacía", () => {
    expect(() => periodosTerminados("mensual", "2026-T1", new Date("2027-01-01T12:00:00Z"), zona)).toThrow(/2026-T1.*trimestral.*mensual/);
    expect(() => periodosTerminados("mensual", "basura", new Date(), zona)).toThrow(/inválida/);
  });
  it("anterior, mismo periodo del año anterior, claves y meses", () => {
    expect([anterior("2026-01"), anterior("2026-B1"), anterior("2026-T1"), anterior("2026-S1"), anterior("2026")]).toEqual([
      "2025-12",
      "2025-B6",
      "2025-T4",
      "2025-S2",
      "2025",
    ]);
    expect(anterior("2026-03")).toBe("2026-02");
    expect(mismoDelAnioAnterior("2026-S2")).toBe("2025-S2");
    expect(mismoDelAnioAnterior("2026-03")).toBe("2025-03");
    expect(mismoDelAnioAnterior("2026")).toBe("2025");
    expect(clavesDelAnio("bimestral", 2026)).toEqual(["2026-B1", "2026-B2", "2026-B3", "2026-B4", "2026-B5", "2026-B6"]);
    expect(clavesDelAnio("mensual", 2026)).toHaveLength(12);
    expect(clavesDelAnio("anual", 2026)).toEqual(["2026"]);
    expect([mesesDe("2026-03"), mesesDe("2026-B2"), mesesDe("2026-T2"), mesesDe("2026-S2"), mesesDe("2026")]).toEqual([
      [3, 3],
      [3, 4],
      [4, 6],
      [7, 12],
      [1, 12],
    ]);
  });
  it("la fecha límite es el fin del día, diez días después del fin del periodo", () => {
    expect(fechaLimiteDeReporte(periodoDe("2026-03", zona)!, 10, zona).toISOString()).toBe("2026-04-11T04:59:59.999Z");
    expect(fechaLimiteDeReporte(periodoDe("2026-12", zona)!, 10, zona).toISOString()).toBe("2027-01-11T04:59:59.999Z");
  });
  it("qué periodicidad contiene a cuál", () => {
    expect(contiene("trimestral", "mensual")).toBe(true);
    expect(contiene("semestral", "bimestral")).toBe(true);
    expect(contiene("trimestral", "bimestral")).toBe(false);
    expect(contiene("mensual", "anual")).toBe(false);
    expect(contiene("anual", "anual")).toBe(true);
  });
});
