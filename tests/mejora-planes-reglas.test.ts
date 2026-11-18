/**
 * Las reglas puras del plan de mejoramiento (Fase 15B, Tarea 2; anexo §3.1, §3.5 y §4.3): su código, su estado, su avance,
 * el plazo del Excel del ente y lo que el esquema del plan admite. Sin base.
 */
import { describe, expect, it } from "vitest";
import { EsquemaEdicionDePlan, EsquemaPlan } from "@/lib/esquemas/mejoramiento";
import {
  avanceDePlan,
  codigoDePlan,
  ETIQUETA_ESTADO_PLAN,
  estadoDePlan,
  FALTA_LA_FECHA_DEL_ENTE,
  MOTIVO_CORTO,
  PATRON_DE_PLAN,
  plazoEnTexto,
} from "@/lib/mejoramiento/planes";

describe("el código del plan", () => {
  it("PM-AAAA-NN, con dos cifras como mínimo", () => {
    expect(codigoDePlan(2026, 2)).toBe("PM-2026-02");
    expect(codigoDePlan(2026, 100)).toBe("PM-2026-100");
    expect(PATRON_DE_PLAN.test(codigoDePlan(2026, 2))).toBe(true);
    expect(PATRON_DE_PLAN.test(codigoDePlan(2026, 100))).toBe(true);
    expect(PATRON_DE_PLAN.test("PM-2026-2")).toBe(false);
    expect(PATRON_DE_PLAN.test("HZ-2026-002")).toBe(false);
  });
});

describe("el estado del plan", () => {
  it("anulado manda; sin hallazgos que cuenten; abierto; cerrado", () => {
    expect(estadoDePlan({ anulado: true, cuentan: 3, abiertos: 1 })).toBe("anulado");
    expect(estadoDePlan({ anulado: false, cuentan: 0, abiertos: 0 })).toBe("sin_hallazgos");
    expect(estadoDePlan({ anulado: false, cuentan: 2, abiertos: 1 })).toBe("abierto");
    expect(estadoDePlan({ anulado: false, cuentan: 3, abiertos: 0 })).toBe("cerrado");
  });

  it("cada estado tiene su etiqueta", () => {
    expect(ETIQUETA_ESTADO_PLAN).toEqual({ sin_hallazgos: "Sin hallazgos", abierto: "Abierto", cerrado: "Cerrado", anulado: "Anulado" });
  });
});

describe("el avance del plan", () => {
  it("el promedio simple, redondeado, de los que tienen avance", () => {
    expect(avanceDePlan([75, 30, null])).toBe(53);
    expect(avanceDePlan([100])).toBe(100);
    expect(avanceDePlan([0, 0])).toBe(0);
  });

  it("sin ninguno, nulo", () => {
    expect(avanceDePlan([null])).toBeNull();
    expect(avanceDePlan([])).toBeNull();
  });
});

describe("el plazo de una actividad (anexo §4.3)", () => {
  it.each([
    ["2023-08-01", "2023-10-31", "3 meses"],
    ["2026-10-15", "2026-11-14", "1 mes"],
    ["2026-11-02", "2026-12-31", "60 días"],
    ["2026-12-01", "2026-12-01", "1 día"],
    // 28 días: del 31 de enero al 28 de febrero no hay un mes exacto (no se recorta al último día del mes).
    ["2026-01-31", "2026-02-27", "28 días"],
    ["2026-02-01", "2026-02-28", "1 mes"],
    ["2026-03-31", "2026-05-30", "2 meses"],
    ["2026-01-01", "2026-12-31", "12 meses"],
    ["2026-01-01", "2026-01-02", "2 días"],
  ])("de %s a %s: %s", (inicio, fin, texto) => {
    expect(plazoEnTexto(inicio, fin)).toBe(texto);
  });
});

describe("el esquema del plan", () => {
  const base = { nombre: "Auditoría de cumplimiento vigencia 2025", origen: "auditoria_interna", fechaEvento: "2026-03-10" };
  const error = (r: { success: boolean; error?: { issues: Array<{ message: string }> } }) => (r.success ? null : r.error!.issues[0].message);

  it("la vigencia, por omisión, es el año de la fecha del evento", () => {
    expect(EsquemaPlan.parse(base).vigencia).toBe(2026);
    expect(EsquemaPlan.parse({ ...base, vigencia: "2025" }).vigencia).toBe(2025);
  });

  it("el nombre va de 5 a 200 caracteres; el objetivo del plan, hasta 1000", () => {
    expect(error(EsquemaPlan.safeParse({ ...base, nombre: "Abcd" }))).toMatch(/al menos 5/);
    expect(error(EsquemaPlan.safeParse({ ...base, nombre: "x".repeat(201) }))).toMatch(/200/);
    expect(error(EsquemaPlan.safeParse({ ...base, objetivoTexto: "x".repeat(1001) }))).toMatch(/1000/);
    expect(EsquemaPlan.parse({ ...base, objetivoTexto: "  " }).objetivoTexto).toBeNull();
  });

  it("fechas y vigencia del 2000 al 2100", () => {
    expect(error(EsquemaPlan.safeParse({ ...base, fechaEvento: "1999-12-31" }))).toMatch(/2000/);
    expect(error(EsquemaPlan.safeParse({ ...base, vigencia: 2101 }))).toMatch(/2000/);
    expect(error(EsquemaPlan.safeParse({ ...base, origen: "auditoria_externa", fechaLimiteEnte: "2101-01-01" }))).toMatch(/2000/);
  });

  it("la fecha del ente: obligatoria en «Ente de control», opcional en «Auditoría externa», nula con un origen interno", () => {
    expect(error(EsquemaPlan.safeParse({ ...base, origen: "ente_control" }))).toBe(FALTA_LA_FECHA_DEL_ENTE);
    expect(FALTA_LA_FECHA_DEL_ENTE).toBe("Escriba la fecha límite del ente");
    expect(EsquemaPlan.parse({ ...base, origen: "auditoria_externa" }).fechaLimiteEnte).toBeNull();
    expect(EsquemaPlan.parse({ ...base, origen: "auditoria_externa", fechaLimiteEnte: "2026-12-01" }).fechaLimiteEnte).toBe("2026-12-01");
    expect(EsquemaPlan.parse({ ...base, fechaLimiteEnte: "2026-12-01" }).fechaLimiteEnte).toBeNull();
  });

  it("es estricto, y la edición no admite la vigencia", () => {
    expect(EsquemaPlan.safeParse({ ...base, otro: 1 }).success).toBe(false);
    expect(EsquemaEdicionDePlan.safeParse({ ...base, vigencia: 2026 }).success).toBe(false);
    expect(EsquemaEdicionDePlan.parse(base).nombre).toBe(base.nombre);
  });

  it("el motivo corto tiene su frase", () => {
    expect(MOTIVO_CORTO).toBe("Escriba el motivo (al menos 10 caracteres)");
  });
});
