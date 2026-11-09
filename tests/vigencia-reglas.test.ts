import { describe, expect, it } from "vitest";
import { estadoVigencia, textoVigencia } from "@/lib/vigencia/semaforo";
import { fechaBase, limitesDeFechaFijada, proximaRevision, sumarMeses } from "@/lib/vigencia/plazo";
import { ErrorVigencia } from "@/lib/vigencia/tipos";
import { ErrorTramite } from "@/db/consultas/flujo/contrato";
import { fechaEnZona, finDeFecha } from "@/lib/tramites/plazos";

const ZONA = "America/Bogota";
const vacia = { publicadoEn: null, fechaAprobacion: null, ultimaRatificacion: null, ultimaVerificacion: null };

describe("fecha base y próxima revisión", () => {
  it("la fecha base de lo aprobado fuera es la fecha de aprobación, no la publicación", () => {
    const base = fechaBase(
      { origen: "fuera", publicadoEn: new Date("2026-11-05T15:00:00Z"), fechaAprobacion: "2025-08-14", ultimaRatificacion: null, ultimaVerificacion: null },
      ZONA,
    );
    expect(fechaEnZona(base!, ZONA)).toBe("2025-08-14");
  });

  it("la ratificación posterior reemplaza a la publicación; la anterior no", () => {
    const publicadoEn = new Date("2026-01-30T15:00:00Z");
    const posterior = fechaBase({ ...vacia, origen: "plataforma", publicadoEn, ultimaRatificacion: new Date("2026-06-01T15:00:00Z") }, ZONA);
    expect(fechaEnZona(posterior!, ZONA)).toBe("2026-06-01");
    const anterior = fechaBase({ ...vacia, origen: "plataforma", publicadoEn, ultimaRatificacion: new Date("2025-12-01T15:00:00Z") }, ZONA);
    expect(fechaEnZona(anterior!, ZONA)).toBe("2026-01-30");
  });

  it("una ratificación posterior también reemplaza la fecha de aprobación de lo aprobado fuera", () => {
    const base = fechaBase({ ...vacia, origen: "fuera", fechaAprobacion: "2025-08-14", ultimaRatificacion: new Date("2026-03-02T15:00:00Z") }, ZONA);
    expect(fechaEnZona(base!, ZONA)).toBe("2026-03-02");
  });

  it("sin fecha de aprobación ni ratificación, lo aprobado fuera no tiene base (nunca la publicación)", () => {
    expect(fechaBase({ ...vacia, origen: "fuera", publicadoEn: new Date("2026-11-05T15:00:00Z") }, ZONA)).toBeNull();
  });

  it("un externo cuenta desde la última verificación o la adopción", () => {
    const publicadoEn = new Date("2026-02-10T15:00:00Z");
    const sinVerificar = fechaBase({ ...vacia, origen: "externo", publicadoEn }, ZONA);
    expect(fechaEnZona(sinVerificar!, ZONA)).toBe("2026-02-10");
    const verificado = fechaBase({ ...vacia, origen: "externo", publicadoEn, ultimaVerificacion: new Date("2026-09-15T15:00:00Z") }, ZONA);
    expect(fechaEnZona(verificado!, ZONA)).toBe("2026-09-15");
  });

  it("sumarMeses respeta el calendario y la zona", () => {
    expect(fechaEnZona(sumarMeses(finDeFecha("2026-01-31", ZONA), 1, ZONA), ZONA)).toBe("2026-02-28");
    expect(fechaEnZona(sumarMeses(finDeFecha("2025-08-14", ZONA), 12, ZONA), ZONA)).toBe("2026-08-14");
    expect(fechaEnZona(sumarMeses(finDeFecha("2027-12-31", ZONA), 2, ZONA), ZONA)).toBe("2028-02-29");
    expect(fechaEnZona(sumarMeses(finDeFecha("2026-11-15", ZONA), 3, ZONA), ZONA)).toBe("2027-02-15");
    // 21:00 en Bogotá del 31 de enero ya es el 1 de febrero en UTC: cuenta el día local.
    expect(fechaEnZona(sumarMeses(new Date("2026-02-01T02:00:00Z"), 1, ZONA), ZONA)).toBe("2026-02-28");
    // el resultado es el último instante del día
    expect(sumarMeses(finDeFecha("2026-01-31", ZONA), 1, ZONA).getTime()).toBe(finDeFecha("2026-02-28", ZONA).getTime());
  });

  it("la fecha fijada manda sobre base + meses", () => {
    const base = finDeFecha("2025-08-14", ZONA);
    expect(fechaEnZona(proximaRevision({ base, meses: 12, fijada: "2027-01-30" }, ZONA)!, ZONA)).toBe("2027-01-30");
    expect(fechaEnZona(proximaRevision({ base, meses: 12, fijada: null }, ZONA)!, ZONA)).toBe("2026-08-14");
    expect(proximaRevision({ base: null, meses: 12, fijada: null }, ZONA)).toBeNull();
    expect(fechaEnZona(proximaRevision({ base: null, meses: 12, fijada: "2027-01-30" }, ZONA)!, ZONA)).toBe("2027-01-30");
  });

  it("limitesDeFechaFijada va de mañana al plazo del documento", () => {
    expect(limitesDeFechaFijada({ meses: 12 }, finDeFecha("2026-11-08", ZONA), ZONA)).toEqual({ minima: "2026-11-09", maxima: "2027-11-08" });
    expect(limitesDeFechaFijada({ meses: 6 }, finDeFecha("2026-12-31", ZONA), ZONA)).toEqual({ minima: "2027-01-01", maxima: "2027-06-30" });
  });
});

describe("semáforo de vigencia", () => {
  const ahora = finDeFecha("2026-11-08", ZONA);
  const sinMarcas = { enTramite: false, impactoPendiente: false };

  it("estadoVigencia: en trámite, vencida con días negativos, atención a 90 días, al día, marca normativa", () => {
    expect(estadoVigencia({ proxima: finDeFecha("2026-08-14", ZONA), ...sinMarcas }, ahora, 90, ZONA)).toEqual({ estado: "vencida", dias: -86 });
    expect(estadoVigencia({ proxima: finDeFecha("2027-01-30", ZONA), ...sinMarcas }, ahora, 90, ZONA)).toEqual({ estado: "atencion", dias: 83 });
    expect(estadoVigencia({ proxima: finDeFecha("2027-11-06", ZONA), enTramite: false, impactoPendiente: true }, ahora, 90, ZONA).estado).toBe("atencion");
    expect(estadoVigencia({ proxima: finDeFecha("2027-11-06", ZONA), enTramite: true, impactoPendiente: false }, ahora, 90, ZONA).estado).toBe("en_tramite");
  });

  it("estadoVigencia: al día, sin fecha y los bordes de la ventana", () => {
    expect(estadoVigencia({ proxima: finDeFecha("2027-11-06", ZONA), ...sinMarcas }, ahora, 90, ZONA)).toEqual({ estado: "al_dia", dias: 363 });
    expect(estadoVigencia({ proxima: null, ...sinMarcas }, ahora, 90, ZONA)).toEqual({ estado: "al_dia", dias: null });
    expect(estadoVigencia({ proxima: null, enTramite: false, impactoPendiente: true }, ahora, 90, ZONA)).toEqual({ estado: "al_dia", dias: null });
    expect(estadoVigencia({ proxima: finDeFecha("2026-11-08", ZONA), ...sinMarcas }, ahora, 90, ZONA)).toEqual({ estado: "atencion", dias: 0 });
    expect(estadoVigencia({ proxima: finDeFecha("2026-11-07", ZONA), ...sinMarcas }, ahora, 90, ZONA)).toEqual({ estado: "vencida", dias: -1 });
    expect(estadoVigencia({ proxima: finDeFecha("2027-02-06", ZONA), ...sinMarcas }, ahora, 90, ZONA)).toEqual({ estado: "atencion", dias: 90 });
    expect(estadoVigencia({ proxima: finDeFecha("2027-02-07", ZONA), ...sinMarcas }, ahora, 90, ZONA)).toEqual({ estado: "al_dia", dias: 91 });
    // en trámite manda aunque la fecha esté vencida
    expect(estadoVigencia({ proxima: finDeFecha("2026-08-14", ZONA), enTramite: true, impactoPendiente: false }, ahora, 90, ZONA).estado).toBe("en_tramite");
  });

  it("textoVigencia dice el estado con sus días", () => {
    expect(textoVigencia({ estado: "vencida", dias: -86 })).toBe("Vencida hace 86 días");
    expect(textoVigencia({ estado: "vencida", dias: -1 })).toBe("Vencida hace 1 día");
    expect(textoVigencia({ estado: "atencion", dias: 83 })).toBe("Vence en 83 días");
    expect(textoVigencia({ estado: "atencion", dias: 1 })).toBe("Vence en 1 día");
    expect(textoVigencia({ estado: "atencion", dias: 0 })).toBe("Vence hoy");
    expect(textoVigencia({ estado: "al_dia", dias: null })).toBe("Al día");
    expect(textoVigencia({ estado: "en_tramite", dias: null }, { etapa: "revisión", dia: 3 })).toBe("En trámite · revisión, día 3");
    expect(textoVigencia({ estado: "en_tramite", dias: null })).toBe("En trámite");
    expect(textoVigencia({ estado: "atencion", dias: 300 }, { cambioNormativo: "Resolución 100 de 2026" })).toBe("Atención · revisión por cambio normativo");
  });

  it("ErrorVigencia es un ErrorTramite con el mensaje visible", () => {
    const e = new ErrorVigencia("No se puede");
    expect(e).toBeInstanceOf(ErrorTramite);
    expect(e.message).toBe("No se puede");
  });
});
