import { describe, expect, it } from "vitest";
import { estadoPlazo, fechaEnZona, fechaLimite, finDeFecha } from "@/lib/tramites/plazos";

const Z = "America/Bogota";

describe("plazos", () => {
  it("la fecha límite es el fin del día en la zona", () => {
    expect(fechaLimite(new Date("2026-11-05T15:00:00Z"), 3, Z).toISOString()).toBe("2026-11-09T04:59:59.999Z");
    // 03:30 UTC del día 6 son las 22:30 del día 5 en Bogotá: el día de partida es el 5
    expect(fechaLimite(new Date("2026-11-06T03:30:00Z"), 0, Z).toISOString()).toBe("2026-11-06T04:59:59.999Z");
  });

  it("la fecha límite respeta el cambio de hora de otras zonas", () => {
    const NY = "America/New_York";
    // El 1 de noviembre de 2026 se retrasa la hora: el día 1 termina a las 05:00 UTC del 2 (EST)
    expect(fechaLimite(new Date("2026-10-31T12:00:00Z"), 1, NY).toISOString()).toBe("2026-11-02T04:59:59.999Z");
    expect(fechaLimite(new Date("2026-10-31T12:00:00Z"), 2, NY).toISOString()).toBe("2026-11-03T04:59:59.999Z");
    // El 8 de marzo de 2026 se adelanta la hora: el día 8 termina a las 04:00 UTC del 9 (EDT)
    expect(fechaLimite(new Date("2026-03-07T15:00:00Z"), 1, NY).toISOString()).toBe("2026-03-09T03:59:59.999Z");
  });

  it("finDeFecha es el último instante de ese día en la zona, sea cual sea su desfase", () => {
    expect(finDeFecha("2026-11-20", Z).toISOString()).toBe("2026-11-21T04:59:59.999Z");
    expect(finDeFecha("2026-11-20", "UTC").toISOString()).toBe("2026-11-20T23:59:59.999Z");
    // UTC+14 y UTC-11: el mediodía UTC del día pedido ya es otro día en la primera.
    expect(finDeFecha("2026-11-20", "Pacific/Kiritimati").toISOString()).toBe("2026-11-20T09:59:59.999Z");
    expect(finDeFecha("2026-11-20", "Pacific/Pago_Pago").toISOString()).toBe("2026-11-21T10:59:59.999Z");
    // Un día de cambio de hora dura 25 horas en Nueva York.
    expect(finDeFecha("2026-11-01", "America/New_York").toISOString()).toBe("2026-11-02T04:59:59.999Z");
  });

  it("fechaEnZona da el día calendario de la zona", () => {
    expect(fechaEnZona(new Date("2026-11-06T03:00:00Z"), Z)).toBe("2026-11-05");
    expect(fechaEnZona(new Date("2026-11-06T05:00:00Z"), Z)).toBe("2026-11-06");
    expect(fechaEnZona(new Date("2027-01-01T04:59:59Z"), Z)).toBe("2026-12-31");
  });

  it("estadoPlazo distingue a tiempo, hoy y vencido", () => {
    const vence = new Date("2026-11-09T04:59:59.999Z");                       // fin del 8 en Bogotá
    expect(estadoPlazo(vence, new Date("2026-11-07T15:00:00Z"), Z)).toEqual({ estado: "a_tiempo", dias: 1 });
    expect(estadoPlazo(vence, new Date("2026-11-08T20:00:00Z"), Z)).toEqual({ estado: "vence_hoy", dias: 0 });
    expect(estadoPlazo(vence, new Date("2026-11-11T12:00:00Z"), Z)).toEqual({ estado: "vencido", dias: 3 });
    expect(estadoPlazo(null, new Date(), Z).estado).toBe("sin_plazo");
  });
});
