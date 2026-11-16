/**
 * Los soportes de los datos de una medición se juntan de todas sus letras, cada archivo una vez (fase 14C, residuo R6): dos
 * letras que toman el mismo dato traen la misma lista y la tabla del año usa el id como clave. Sin BD.
 */
import { describe, expect, it } from "vitest";
import { soportesDeDatosDeLaMedicion } from "@/lib/indicadores/soportes";

const soporte = (id: number, periodo = "2026-10") => ({ id, datoId: 9, nombre: `Soporte ${id}.pdf`, mime: "application/pdf", tamano: 1024, periodo });

describe("soportesDeDatosDeLaMedicion", () => {
  it("deja un archivo una sola vez aunque dos letras citen el mismo dato", () => {
    const lista = [soporte(71), soporte(72, "2026-09")];
    const r = soportesDeDatosDeLaMedicion([{ soportes: lista }, { soportes: lista }], "2026-10", "America/Bogota");
    expect(r.map((s) => s.id)).toEqual([71, 72]);
    expect(new Set(r.map((s) => s.id)).size).toBe(r.length);
  });

  it("conserva el orden de las letras y dice de qué periodo es el del dato si es otro", () => {
    const r = soportesDeDatosDeLaMedicion([{ soportes: [soporte(72, "2026-09")] }, { soportes: [soporte(71), soporte(72, "2026-09")] }], "2026-10", "America/Bogota");
    expect(r.map((s) => [s.id, s.deQue])).toEqual([
      [72, "septiembre de 2026"],
      [71, null],
    ]);
  });

  it("sin letras o sin soportes, una lista vacía", () => {
    expect(soportesDeDatosDeLaMedicion([], "2026-10", "America/Bogota")).toEqual([]);
    expect(soportesDeDatosDeLaMedicion([{ soportes: [] }], "2026-10", "America/Bogota")).toEqual([]);
  });
});
