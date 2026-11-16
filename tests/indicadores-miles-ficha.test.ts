import { describe, expect, it } from "vitest";
import { EsquemaDato, EsquemaDatoDeLaPersona } from "@/lib/esquemas/indicadores-datos";
import { EsquemaFicha, EsquemaFichaDeLaPersona, EsquemaFichaImportada, EsquemaMeta } from "@/lib/esquemas/indicadores";
import { SIN_PUNTOS_DE_MILES } from "@/lib/indicadores/miles";
import { parsearFormulario } from "@/lib/validacion";

/** El punto de miles en lo que se escribe en la ficha, las metas programadas y los límites de un dato (anexo 14C-complemento). */
const formulario = (campos: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
};
const rechazo = (campo: string) => `${campo}: ${SIN_PUNTOS_DE_MILES}`;
const variables = (extra: Record<string, string> = {}) =>
  JSON.stringify([
    { letra: "A", nombre: "Ejecutadas", consolidacion: "suma", admiteNegativos: false, ...extra },
    { letra: "B", nombre: "Programadas", consolidacion: "suma", admiteNegativos: false },
  ]);
const MINIMO = {
  procesoId: "2",
  nombre: "Cumplimiento",
  proposito: "Saber si se cumple",
  tipoId: "1",
  clasificacionId: "2",
  forma: "porcentaje",
  variables: variables(),
  unidadId: "1",
  decimales: "1",
  periodicidad: "trimestral",
  tendencia: "ascendente",
  meta: "80,5",
  cargosMedir: "[4]",
  cargosAnalizar: "[4]",
  normaIds: "[]",
  plazoReporteDias: "10",
  inicioMedicion: "2026-T1",
  nivelAcceso: "general",
  mide: "[7]",
  analiza: "[7]",
};
const ficha = (campos: Record<string, string>) => parsearFormulario(formulario({ ...MINIMO, ...campos }), EsquemaFichaDeLaPersona);
const RANGOS = (valor: string, hasta?: string) =>
  JSON.stringify({ bien: [{ signo: ">=", valor }], atencion: hasta ? [{ signo: "entre", valor: "70", hasta }] : [], critico: [{ signo: "<", valor: "70" }] });

describe("EsquemaFicha: sin puntos de miles", () => {
  it("la meta con punto de miles se rechaza con el nombre del campo; la coma y el entero pasan", () => {
    expect(() => ficha({ meta: "1.500" })).toThrow(rechazo("La meta"));
    expect(ficha({ meta: "1,5" }).meta).toBe("1.5");
    expect(ficha({ meta: "1500" }).meta).toBe("1500");
    expect(ficha({ meta: "1600.5" }).meta).toBe("1600.5");
  });

  it("cada campo numérico de la ficha nombra el suyo", () => {
    const casos: [string, string][] = [
      ["metaMax", "El máximo del rango"],
      ["limiteCritico", "El límite de crítico"],
      ["tolerancia", "La tolerancia"],
      ["resultadoMin", "El mínimo del resultado"],
      ["resultadoMax", "El máximo del resultado"],
      ["lineaBaseValor", "La línea base"],
    ];
    for (const [clave, nombre] of casos) {
      expect(() => ficha({ [clave]: "1.500" }), clave).toThrow(rechazo(nombre));
      expect(ficha({ [clave]: "1,5" })[clave as "metaMax"], clave).toBe("1.5");
    }
  });

  it("un valor de los rangos con punto de miles se rechaza; con coma se guarda con punto", () => {
    expect(() => ficha({ semaforoModo: "rangos", rangos: RANGOS("1.500") })).toThrow(rechazo("Los rangos del semáforo"));
    expect(() => ficha({ semaforoModo: "rangos", rangos: RANGOS("90", "1.500") })).toThrow(rechazo("Los rangos del semáforo"));
    expect(JSON.parse(ficha({ semaforoModo: "rangos", rangos: RANGOS("2,375") }).rangos!).bien[0].valor).toBe("2.375");
  });

  it("un límite de captura de la ficha con punto de miles se rechaza; con coma se guarda con punto", () => {
    expect(() => ficha({ variables: variables({ capturaMin: "1.500" }) })).toThrow(rechazo("El mínimo de captura"));
    expect(() => ficha({ variables: variables({ capturaMax: "1.500" }) })).toThrow(rechazo("El máximo de captura"));
    const v = ficha({ variables: variables({ capturaMin: "2,375", capturaMax: "1500" }) }).variables;
    expect([v[0].capturaMin, v[0].capturaMax]).toEqual(["2.375", "1500"]);
  });

  it("un valor de la prueba con punto de miles se rechaza; con coma pasa", () => {
    expect(() => ficha({ prueba: JSON.stringify({ valores: { A: "1.500", B: "2" } }) })).toThrow(rechazo("Los valores de la prueba"));
    expect(ficha({ prueba: JSON.stringify({ valores: { A: "1,5", B: "2" } }) }).prueba?.valores.A).toBe("1,5");
  });
});

describe("EsquemaMeta y EsquemaDato: sin puntos de miles", () => {
  const meta = (campos: Record<string, string>) => parsearFormulario(formulario({ periodo: "2026-T3", ...campos }), EsquemaMeta);
  it("la meta programada rechaza el punto de miles en la meta y en el máximo", () => {
    expect(() => meta({ meta: "1.500" })).toThrow(rechazo("La meta"));
    expect(() => meta({ meta: "80", metaMax: "1.500" })).toThrow(rechazo("El máximo del rango"));
    expect(meta({ meta: "80,5", metaMax: "" })).toMatchObject({ meta: "80.5" });
    expect(meta({ meta: "1500", metaMax: "1,5" })).toMatchObject({ meta: "1500", metaMax: "1.5" });
  });

  const dato = (campos: Record<string, string>) =>
    parsearFormulario(
      formulario({ procesoId: "2", nombre: "Atenciones", periodicidad: "mensual", consolidacion: "suma", plazoReporteDias: "10", ...campos }),
      EsquemaDatoDeLaPersona,
    );
  it("los límites de captura de un dato rechazan el punto de miles", () => {
    expect(() => dato({ capturaMin: "1.500" })).toThrow(rechazo("El mínimo de captura"));
    expect(() => dato({ capturaMax: "1.500" })).toThrow(rechazo("El máximo de captura"));
    expect(dato({ capturaMin: "2,375", capturaMax: "1500" })).toMatchObject({ capturaMin: "2.375", capturaMax: "1500" });
  });
});

describe("lo que el dominio vuelve a validar no rechaza una cifra canónica", () => {
  it("la salida de la instancia de la persona vale otra vez como entrada de la canónica (meta, rango y límite en «2,375»)", () => {
    const d = ficha({ meta: "2,375", semaforoModo: "rangos", rangos: RANGOS("2,375"), variables: variables({ capturaMin: "2,375" }) });
    expect(d.meta).toBe("2.375");
    const otra = EsquemaFicha.parse(d);
    expect(otra).toEqual(d);
    expect(() => EsquemaFichaDeLaPersona.parse(d)).toThrow(rechazo("La meta"));
  });

  it("la ficha de una fila importada acepta la meta canónica «1.125»", () => {
    expect(EsquemaFichaImportada.shape.meta.parse("1.125")).toBe("1.125");
    expect(EsquemaFichaImportada.shape.limiteCritico.unwrap().parse("1.125")).toBe("1.125");
  });

  it("el dato: la salida de la instancia de la persona vale otra vez como entrada de la canónica", () => {
    const d = parsearFormulario(
      formulario({ procesoId: "2", nombre: "Atenciones", periodicidad: "mensual", consolidacion: "suma", plazoReporteDias: "10", capturaMin: "2,375" }),
      EsquemaDatoDeLaPersona,
    );
    expect(EsquemaDato.parse(d)).toEqual(d);
  });

  it("la instancia de la persona rechaza «1.500» con «La meta: …»", () => {
    expect(() => ficha({ meta: "1.500" })).toThrow(`La meta: ${SIN_PUNTOS_DE_MILES}`);
  });
});
