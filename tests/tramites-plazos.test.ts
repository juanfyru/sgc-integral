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

describe("el formateador de cada zona", () => {
  it("se crea una vez por zona y no en cada paso de la búsqueda del fin del día (ronda 1 de la Tarea 12)", () => {
    // Una zona que ningún otro caso de este archivo usa: su formateador aún no existe.
    const zona = "America/Lima";
    const Original = Intl.DateTimeFormat;
    let creados = 0;
    class Contado extends Original {
      constructor(locales?: string | string[], opciones?: Intl.DateTimeFormatOptions) {
        super(locales, opciones);
        if (opciones?.timeZone === zona) creados += 1;
      }
    }
    Intl.DateTimeFormat = Contado as typeof Intl.DateTimeFormat;
    try {
      for (let dia = 1; dia <= 20; dia++) finDeFecha(`2026-11-${String(dia).padStart(2, "0")}`, zona);
      expect(fechaEnZona(new Date("2026-11-20T12:00:00Z"), zona)).toBe("2026-11-20");
      expect(finDeFecha("2026-11-20", zona).toISOString()).toBe("2026-11-21T04:59:59.999Z");
      expect(creados).toBe(1);
    } finally {
      Intl.DateTimeFormat = Original;
    }
  });
});
