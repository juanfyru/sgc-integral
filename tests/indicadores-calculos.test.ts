import { describe, expect, it } from "vitest";
import {
  ALCANCES_DE_CALCULO,
  CALCULOS,
  CLAVES_DE_CALCULO,
  ETIQUETA_ALCANCE,
  alcanceAdmitido,
  calculoDe,
  fotoDe,
} from "@/lib/indicadores/calculos/registro";
import { reportesATiempo } from "@/lib/indicadores/calculos/reportes-a-tiempo";
import {
  ETIQUETA_ESTADO_OBJETIVO,
  estadoDeObjetivo,
  objetivosCumplidos,
} from "@/lib/indicadores/objetivos";

describe("registro de cálculos", () => {
  it("el registro tiene los diez cálculos del anexo", () => {
    expect(Object.keys(CALCULOS)).toEqual([...CLAVES_DE_CALCULO]);
    for (const c of Object.values(CALCULOS)) {
      expect(c.variables.map((v) => v.letra)).toEqual(c.forma === "conteo" ? ["A"] : ["A", "B"]);
      expect(c.sinDatos === null).toBe(c.forma === "conteo");
      expect(
        c.variables.every(
          (v) => v.consolidacion === (c.clase === "estado" || c.clave === "objetivos_cumplidos" ? "ultimo" : "suma"),
        ),
      ).toBe(true);
    }
  });

  it("alcances, tendencia y lo que se llena hacia atrás", () => {
    expect(CALCULOS.conformidad_fecha.alcances).toEqual(["entidad"]);
    expect(CALCULOS.conformidad_periodo.alcances).toEqual(["entidad"]);
    expect(CALCULOS.objetivos_cumplidos.alcances).toEqual(["calidad", "institucional", "todos"]);
    expect(CALCULOS.acuses.alcances).toEqual(["entidad", "proceso"]);
    expect(CLAVES_DE_CALCULO.filter((k) => CALCULOS[k].tendencia === "descendente")).toEqual(["vencidos", "aprobacion"]);
    expect(CLAVES_DE_CALCULO.filter((k) => CALCULOS[k].reconstruible)).toEqual([
      "aprobacion",
      "conformidad_periodo",
      "etapas",
      "reportes_a_tiempo",
      "objetivos_cumplidos",
    ]);
    expect(CLAVES_DE_CALCULO.filter((k) => CALCULOS[k].clase === "estado")).toEqual([
      "dentro_plazo",
      "vencidos",
      "conformidad_fecha",
      "externos",
    ]);
  });

  it("documental, unidad sugerida y meta exigida", () => {
    expect(CLAVES_DE_CALCULO.map((k) => CALCULOS[k].documental)).toEqual([
      "dentro_plazo",
      "vencidos",
      "aprobacion",
      "acuses",
      "conformidad",
      null,
      "externos",
      "etapas",
      null,
      null,
    ]);
    expect(CLAVES_DE_CALCULO.filter((k) => CALCULOS[k].exigeMeta)).toEqual(["conformidad_fecha"]);
    expect(CALCULOS.aprobacion.unidadSugerida).toBe("Días");
    expect(CALCULOS.vencidos.unidadSugerida).toBe("Número");
    expect(CALCULOS.etapas.unidadSugerida).toBe("Porcentaje");
  });

  it("nombres, motivos y etiquetas exactos", () => {
    expect(CALCULOS.aprobacion.variables[0].nombre).toBe("Días entre la aceptación y la publicación, sumados");
    expect(CALCULOS.objetivos_cumplidos.variables[1].nombre).toBe("Objetivos con medición en el periodo");
    expect(CALCULOS.vencidos.sinDatos).toBeNull();
    expect(CALCULOS.reportes_a_tiempo.sinDatos).toBe("Ninguna medición tenía su fecha límite en el periodo");
    expect(ALCANCES_DE_CALCULO.map((a) => ETIQUETA_ALCANCE[a])).toEqual([
      "Toda la entidad",
      "El proceso de la ficha",
      "Objetivos de calidad",
      "Objetivos institucionales",
      "Todos los objetivos",
    ]);
  });

  it("cada variable de los diez cálculos tiene nombre y descripción; las de «Reportes a tiempo» dicen lo que cuentan, también «no aplica»", () => {
    for (const c of Object.values(CALCULOS)) {
      for (const v of c.variables) {
        expect(v.nombre.trim(), `${c.clave} ${v.letra}`).not.toBe("");
        expect(v.descripcion.trim(), `${c.clave} ${v.letra}`).not.toBe("");
        // Lo que admite la descripción de una variable en la ficha.
        expect(v.descripcion.length, `${c.clave} ${v.letra}`).toBeLessThanOrEqual(500);
      }
    }
    const [a, b] = CALCULOS.reportes_a_tiempo.variables;
    for (const v of [a, b]) expect(v.descripcion, v.letra).toContain("«no aplica»");
    // Las firma la ficha que los usa (en la demo, SGC-ID-001): un cambio de texto es un cambio de lo firmado.
    expect(a.descripcion).toBe(
      "Cuenta, de las mediciones de B, las que se reportaron o se marcaron «no aplica» por primera vez en su fecha límite o antes; la que nunca se reportó no cuenta como a tiempo",
    );
    expect(b.descripcion).toBe(
      "Cuenta las mediciones con fecha límite en el periodo que digita una persona (no las históricas ni las que calcula el sistema), también las marcadas «no aplica»; no cuenta las de otra periodicidad que dejó un cambio mayor ni las que seguían sin reportar cuando el indicador se retiró antes de su fecha límite",
    );
  });

  it("una clave o un alcance que no es del registro", () => {
    expect(calculoDe("constructor")).toBeNull();
    expect(calculoDe("__proto__")).toBeNull();
    expect(calculoDe(3)).toBeNull();
    expect(calculoDe("etapas")).toBe(CALCULOS.etapas);
    expect(alcanceAdmitido(CALCULOS.acuses, "calidad")).toBe(false);
    expect(alcanceAdmitido(CALCULOS.acuses, "proceso")).toBe(true);
  });

  it("sin nada que medir es «no aplica»; un conteo en cero es un valor", () => {
    expect(fotoDe(CALCULOS.aprobacion, { A: "0", B: "0" })).toEqual({ noAplica: "No se publicó ningún trámite en el periodo" });
    expect(fotoDe(CALCULOS.aprobacion, { A: "5", B: "0.0" })).toEqual({ noAplica: "No se publicó ningún trámite en el periodo" });
    expect(fotoDe(CALCULOS.aprobacion, { A: "5", B: "0,0" })).toEqual({ noAplica: "No se publicó ningún trámite en el periodo" });
    expect(fotoDe(CALCULOS.aprobacion, { A: "63.5", B: "3" })).toEqual({ valores: { A: "63.5", B: "3" } });
    expect(fotoDe(CALCULOS.vencidos, { A: "0" })).toEqual({ valores: { A: "0" } });
  });
});

describe("reportes a tiempo", () => {
  const vence = new Date("2026-03-10T12:00:00.000Z");
  it("la fecha límite exacta cuenta; un milisegundo después, no; sin reporte, tarde", () => {
    expect(
      reportesATiempo([
        { venceEn: vence, primerReporteEn: new Date(vence.getTime()) },
        { venceEn: vence, primerReporteEn: new Date(vence.getTime() + 1) },
        { venceEn: vence, primerReporteEn: null },
        { venceEn: vence, primerReporteEn: new Date(vence.getTime() - 5000) },
      ]),
    ).toEqual({ aTiempo: 2, total: 4 });
  });
  it("lista vacía", () => {
    expect(reportesATiempo([])).toEqual({ aTiempo: 0, total: 0 });
  });
});

describe("objetivos", () => {
  it("estado de un objetivo", () => {
    expect(estadoDeObjetivo([])).toBe("sin_medicion");
    expect(estadoDeObjetivo([null])).toBe("sin_medicion");
    expect(estadoDeObjetivo([true, true])).toBe("cumplido");
    expect(estadoDeObjetivo([true, false])).toBe("no_cumplido");
    expect(estadoDeObjetivo([true, null])).toBe("cumplido");
    expect(ETIQUETA_ESTADO_OBJETIVO).toEqual({
      cumplido: "Cumplido",
      no_cumplido: "No cumplido",
      sin_medicion: "Sin medición",
    });
  });
  it("objetivos cumplidos", () => {
    expect(objetivosCumplidos([[true], [true, false], [], [null]])).toEqual({ cumplidos: 1, conMedicion: 2 });
  });
});
