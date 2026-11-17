import { describe, expect, it } from "vitest";
import {
  SIN_AJUSTES,
  diasHabilesEntre,
  esHabil,
  festivosDeColombia,
  restarDiasHabiles,
  sumarDiasHabiles,
} from "@/lib/dias-habiles";
import { fechaEnZona } from "@/lib/tramites/plazos";

const zona = "America/Bogota";
const dia = (t: string) => new Date(`${t}T15:00:00Z`);

const F2025 = ["2025-01-01","2025-01-06","2025-03-24","2025-04-17","2025-04-18","2025-05-01","2025-06-02","2025-06-23","2025-06-30","2025-07-20","2025-08-07","2025-08-18","2025-10-13","2025-11-03","2025-11-17","2025-12-08","2025-12-25"];
const F2026 = ["2026-01-01","2026-01-12","2026-03-23","2026-04-02","2026-04-03","2026-05-01","2026-05-18","2026-06-08","2026-06-15","2026-06-29","2026-07-13","2026-07-20","2026-08-07","2026-08-17","2026-10-12","2026-11-02","2026-11-16","2026-12-08","2026-12-25"];
const F2027 = ["2027-01-01","2027-01-11","2027-03-22","2027-03-25","2027-03-26","2027-05-01","2027-05-10","2027-05-31","2027-06-07","2027-07-05","2027-07-12","2027-07-20","2027-08-07","2027-08-16","2027-10-18","2027-11-01","2027-11-15","2027-12-08","2027-12-25"];

describe("festivosDeColombia", () => {
  it("coincide con el calendario publicado", () => {
    expect(festivosDeColombia(2025)).toEqual(F2025);
    expect(festivosDeColombia(2026)).toEqual(F2026);
    expect(festivosDeColombia(2027)).toEqual(F2027);
  });
  it("antes de 2026 no existe el festivo del 9 de julio", () => {
    expect(festivosDeColombia(2025)).not.toContain("2025-07-14");
  });
});

describe("esHabil", () => {
  it("fines de semana y festivos no son hábiles", () => {
    expect(esHabil("2026-11-14", SIN_AJUSTES)).toBe(false);
    expect(esHabil("2026-11-15", SIN_AJUSTES)).toBe(false);
    expect(esHabil("2026-11-16", SIN_AJUSTES)).toBe(false);
    expect(esHabil("2026-11-17", SIN_AJUSTES)).toBe(true);
  });
  it("los ajustes mueven festivos y días hábiles, no los fines de semana", () => {
    expect(esHabil("2026-11-17", { noHabiles: new Set(["2026-11-17"]), habiles: new Set() })).toBe(false);
    expect(esHabil("2026-11-16", { noHabiles: new Set(), habiles: new Set(["2026-11-16"]) })).toBe(true);
    expect(esHabil("2026-11-14", { noHabiles: new Set(), habiles: new Set(["2026-11-14"]) })).toBe(false);
  });
});

describe("sumarDiasHabiles", () => {
  it("salta el festivo y cae al fin del día en la zona", () => {
    const r = sumarDiasHabiles(dia("2026-11-04"), 10, SIN_AJUSTES, zona);
    expect(fechaEnZona(r, zona)).toBe("2026-11-19");
    expect(fechaEnZona(new Date(r.getTime() + 1), zona)).toBe("2026-11-20");
  });
  it("un hecho de viernes y uno de sábado vencen el mismo miércoles", () => {
    expect(fechaEnZona(sumarDiasHabiles(dia("2026-11-06"), 3, SIN_AJUSTES, zona), zona)).toBe("2026-11-11");
    expect(fechaEnZona(sumarDiasHabiles(dia("2026-11-07"), 3, SIN_AJUSTES, zona), zona)).toBe("2026-11-11");
  });
  it("Semana Santa y fin de año", () => {
    expect(fechaEnZona(sumarDiasHabiles(dia("2026-03-27"), 10, SIN_AJUSTES, zona), zona)).toBe("2026-04-14");
    expect(fechaEnZona(sumarDiasHabiles(dia("2026-12-23"), 5, SIN_AJUSTES, zona), zona)).toBe("2026-12-31");
  });
  it("cuenta por el día en la zona: 23:30 de Bogotá es 04:30Z del día siguiente", () => {
    const tarde = new Date("2026-11-05T04:30:00Z"); // miércoles 4, 23:30 en Bogotá
    expect(fechaEnZona(sumarDiasHabiles(tarde, 1, SIN_AJUSTES, zona), zona)).toBe("2026-11-05");
  });
});

describe("restarDiasHabiles y diasHabilesEntre", () => {
  it("restar", () => {
    expect(restarDiasHabiles("2026-11-19", 10, SIN_AJUSTES)).toBe("2026-11-04");
  });
  it("entre", () => {
    expect(diasHabilesEntre(dia("2026-11-04"), dia("2026-11-19"), SIN_AJUSTES, zona)).toBe(10);
    expect(diasHabilesEntre(dia("2026-11-19"), dia("2026-11-04"), SIN_AJUSTES, zona)).toBe(-10);
    expect(diasHabilesEntre(dia("2026-11-04"), dia("2026-11-04"), SIN_AJUSTES, zona)).toBe(0);
  });
});
