import { describe, expect, it } from "vitest";
import { periodoActual, periodoDe } from "@/lib/indicadores-documentales/periodo";
import { dentroDelPlazo, etapasEnPlazo, porcentaje, tiempoDeAprobacion, vencidosPorProceso } from "@/lib/indicadores-documentales/definiciones";
import { INDICADORES, NOMBRE_INDICADOR, SENTIDO, UNIDAD, cumple, metaDe } from "@/lib/indicadores-documentales/metas";
import { CONFIG_DOCUMENTAL_DEFECTO } from "@/db/consultas/config-documental";
import { fechaEnZona } from "@/lib/tramites/plazos";

const ZONA = "America/Bogota";
const MS_DIA = 86_400_000;
const dia = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * MS_DIA);

describe("periodos", () => {
  it("periodoDe entiende año, mes, trimestre y semestre y rechaza lo demás", () => {
    expect(periodoDe("2026-T3", ZONA)).toMatchObject({ clave: "2026-T3", etiqueta: "tercer trimestre de 2026" });
    expect(fechaEnZona(periodoDe("2026-T3", ZONA)!.desde, ZONA)).toBe("2026-07-01");
    expect(fechaEnZona(periodoDe("2026-T3", ZONA)!.hasta, ZONA)).toBe("2026-09-30");
    expect(periodoDe("2026-13", ZONA)).toBeNull();
  });

  it("año, mes y semestre con sus límites en la zona", () => {
    const anio = periodoDe("2026", ZONA)!;
    expect(anio.etiqueta).toBe("2026");
    expect(fechaEnZona(anio.desde, ZONA)).toBe("2026-01-01");
    expect(fechaEnZona(anio.hasta, ZONA)).toBe("2026-12-31");
    // la medianoche local del 1 de enero es 05:00 UTC; el fin del año es 04:59:59.999 UTC del 1 de enero siguiente
    expect(anio.desde.toISOString()).toBe("2026-01-01T05:00:00.000Z");
    expect(anio.hasta.toISOString()).toBe("2027-01-01T04:59:59.999Z");
    const mes = periodoDe("2026-11", ZONA)!;
    expect(mes.etiqueta).toBe("noviembre de 2026");
    expect(fechaEnZona(mes.hasta, ZONA)).toBe("2026-11-30");
    expect(fechaEnZona(periodoDe("2028-02", ZONA)!.hasta, ZONA)).toBe("2028-02-29");
    expect(fechaEnZona(periodoDe("2026-02", ZONA)!.hasta, ZONA)).toBe("2026-02-28");
    expect(periodoDe("2026-12", ZONA)!.etiqueta).toBe("diciembre de 2026");
    const sem = periodoDe("2026-S1", ZONA)!;
    expect(sem.etiqueta).toBe("primer semestre de 2026");
    expect(fechaEnZona(sem.hasta, ZONA)).toBe("2026-06-30");
    expect(fechaEnZona(periodoDe("2026-S2", ZONA)!.desde, ZONA)).toBe("2026-07-01");
    expect(periodoDe("2026-T1", ZONA)!.etiqueta).toBe("primer trimestre de 2026");
    expect(periodoDe("2026-T4", ZONA)!.etiqueta).toBe("cuarto trimestre de 2026");
  });

  it("rechaza claves mal formadas", () => {
    for (const clave of ["", "26", "2026-00", "2026-T5", "2026-T0", "2026-S3", "2026-1", "2026-t3", "2026-11-01", "abcd", " 2026"]) {
      expect(periodoDe(clave, ZONA), clave).toBeNull();
    }
  });

  it("periodoActual es el año en curso en la zona", () => {
    // 2027-01-01 03:00 UTC aún es 31 de diciembre de 2026 en Bogotá
    expect(periodoActual(new Date("2027-01-01T03:00:00Z"), ZONA).clave).toBe("2026");
    expect(periodoActual(new Date("2027-01-01T06:00:00Z"), ZONA)).toMatchObject({ clave: "2027", etiqueta: "2027" });
  });
});

describe("definiciones de los indicadores", () => {
  it("porcentaje con denominador cero es sin dato", () => expect(porcentaje(0, 0)).toEqual({ valor: null, numerador: 0, denominador: 0 }));

  it("porcentaje redondea a entero", () => {
    expect(porcentaje(1, 3)).toEqual({ valor: 33, numerador: 1, denominador: 3 });
    expect(porcentaje(5, 5).valor).toBe(100);
    expect(porcentaje(0, 4).valor).toBe(0);
  });

  it("dentroDelPlazo cuenta vencidos sobre vigentes", () => {
    const m = dentroDelPlazo([{ vencida: true }, { vencida: false }, { vencida: false }]);
    expect(m.valor).toBe(67);
    expect(m).toEqual({ valor: 67, numerador: 2, denominador: 3, sinDato: 0 });
    expect(dentroDelPlazo([]).valor).toBeNull();
  });

  it("dentroDelPlazo no cuenta como cumplido lo que no tiene fecha: va aparte, en sinDato", () => {
    expect(dentroDelPlazo([{ vencida: true }, { vencida: false }, { vencida: null }])).toEqual({ valor: 50, numerador: 1, denominador: 2, sinDato: 1 });
    expect(dentroDelPlazo([{ vencida: null }])).toEqual({ valor: null, numerador: 0, denominador: 0, sinDato: 1 });
  });

  it("vencidosPorProceso calcula «dentro» solo con los de estado conocido y cuenta el resto en sinDato", () => {
    const r = vencidosPorProceso([
      { procesoId: 1, proceso: "Calidad", sigla: "CAL", vencida: false },
      { procesoId: 1, proceso: "Calidad", sigla: "CAL", vencida: null },
      { procesoId: 1, proceso: "Calidad", sigla: "CAL", vencida: true },
      { procesoId: 2, proceso: "Urgencias", sigla: "URG", vencida: null },
    ]);
    expect(r).toEqual([
      { procesoId: 1, proceso: "Calidad", sigla: "CAL", vencidos: 1, vigentes: 3, sinDato: 1, dentro: { valor: 50, numerador: 1, denominador: 2 } },
      { procesoId: 2, proceso: "Urgencias", sigla: "URG", vencidos: 0, vigentes: 1, sinDato: 1, dentro: { valor: null, numerador: 0, denominador: 0 } },
    ]);
  });

  it("tiempoDeAprobacion: promedio y mediana en días, nulos sin trámites", () => {
    const aceptado = dia(10);
    const tramites = [21, 27, 30].map((d) => ({ solicitadoEn: dia(0), aceptadoEn: aceptado, publicadoEn: new Date(aceptado.getTime() + d * MS_DIA) }));
    expect(tiempoDeAprobacion(tramites)).toEqual({ promedio: 26, mediana: 27, desdeSolicitud: 36, n: 3 });
    expect(tiempoDeAprobacion([])).toEqual({ promedio: null, mediana: null, desdeSolicitud: null, n: 0 });
  });

  it("tiempoDeAprobacion: mediana par y un decimal", () => {
    const aceptado = dia(10);
    const tramites = [10, 11, 20, 30].map((d) => ({ solicitadoEn: aceptado, aceptadoEn: aceptado, publicadoEn: new Date(aceptado.getTime() + d * MS_DIA) }));
    const r = tiempoDeAprobacion(tramites);
    expect(r.mediana).toBe(15.5);
    expect(r.promedio).toBe(17.8);
    expect(r.desdeSolicitud).toBe(17.8);
    const medio = tiempoDeAprobacion([{ solicitadoEn: aceptado, aceptadoEn: aceptado, publicadoEn: new Date(aceptado.getTime() + MS_DIA / 2) }]);
    expect(medio.promedio).toBe(0.5);
  });

  it("etapasEnPlazo ignora las etapas sin fecha límite y las cuenta como sin dato", () => {
    const r = etapasEnPlazo([
      { cerradaEn: dia(5), venceEn: dia(6) },
      { cerradaEn: dia(6), venceEn: dia(6) },
      { cerradaEn: dia(8), venceEn: dia(6) },
      { cerradaEn: dia(8), venceEn: null },
    ]);
    expect(r).toEqual({ valor: 67, numerador: 2, denominador: 3, sinDato: 1 });
    expect(etapasEnPlazo([{ cerradaEn: dia(1), venceEn: null }])).toEqual({ valor: null, numerador: 0, denominador: 0, sinDato: 1 });
    expect(etapasEnPlazo([])).toEqual({ valor: null, numerador: 0, denominador: 0, sinDato: 0 });
  });

  it("vencidosPorProceso agrupa por proceso, con la peor situación primero", () => {
    const docs = [
      { procesoId: 1, proceso: "Calidad", sigla: "CAL", vencida: false },
      { procesoId: 2, proceso: "Urgencias", sigla: "URG", vencida: true },
      { procesoId: 2, proceso: "Urgencias", sigla: "URG", vencida: true },
      { procesoId: 2, proceso: "Urgencias", sigla: "URG", vencida: false },
      { procesoId: 1, proceso: "Calidad", sigla: "CAL", vencida: false },
    ];
    expect(vencidosPorProceso(docs)).toEqual([
      { procesoId: 2, proceso: "Urgencias", sigla: "URG", vencidos: 2, vigentes: 3, sinDato: 0, dentro: { valor: 33, numerador: 1, denominador: 3 } },
      { procesoId: 1, proceso: "Calidad", sigla: "CAL", vencidos: 0, vigentes: 2, sinDato: 0, dentro: { valor: 100, numerador: 2, denominador: 2 } },
    ]);
    expect(vencidosPorProceso([])).toEqual([]);
  });
});

describe("metas", () => {
  it("cumple respeta el sentido de cada indicador y es nulo sin valor", () => {
    expect(cumple("dentro_plazo", 94, 95)).toBe(false);
    expect(cumple("dentro_plazo", 95, 95)).toBe(true);
    expect(cumple("aprobacion", 24, 30)).toBe(true);
    expect(cumple("aprobacion", 31, 30)).toBe(false);
    expect(cumple("vencidos", 7, 0)).toBe(false);
    expect(cumple("vencidos", 0, 0)).toBe(true);
    expect(cumple("acuses", null, 90)).toBeNull();
  });

  it("metaDe lee la configuración y la de conformidad sale del umbral de distribución", () => {
    const c = { metas: CONFIG_DOCUMENTAL_DEFECTO.metas, umbralConformidadPct: 97 };
    expect(INDICADORES.map((i) => metaDe(i, c))).toEqual([95, 30, 0, 90, 97, 95, 90]);
  });

  it("cada indicador tiene nombre, unidad y sentido", () => {
    expect(INDICADORES).toHaveLength(7);
    for (const i of INDICADORES) {
      expect(NOMBRE_INDICADOR[i]).toBeTruthy();
      expect(["pct", "dias", "conteo"]).toContain(UNIDAD[i]);
    }
    expect(INDICADORES.filter((i) => SENTIDO[i] === "max")).toEqual(["aprobacion", "vencidos"]);
    expect(UNIDAD.aprobacion).toBe("dias");
    expect(UNIDAD.vencidos).toBe("conteo");
  });
});
