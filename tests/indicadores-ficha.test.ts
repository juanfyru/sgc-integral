import { describe, expect, it } from "vitest";
import { analisisCompleto, analisisExigido, esRepetido, estadoVisible, ETIQUETA_ESTADO } from "@/lib/indicadores/estados";
import { camposCambiados, CAMPOS_MAYORES, huellaDeFicha, tipoDeCambio, type ContenidoFicha } from "@/lib/indicadores/ficha";

const base = (): ContenidoFicha => ({
  nombre: "Oportunidad en la atención",
  proposito: "Saber si se atiende a tiempo",
  requisito: "NTC ISO 9001:2015, numeral 9.1",
  tipoNombre: "Eficacia",
  clasificacionId: 1,
  clasificacionNombre: "Operativo",
  objetivoNombre: "Mejorar la oportunidad",
  procesoNombre: "Urgencias",
  subprocesoNombre: null,
  procedimientoDocumentoId: null,
  puntoControl: null,
  origenDato: "manual",
  calculo: null,
  calculoAlcance: null,
  forma: "porcentaje",
  factor: null,
  formula: "A / B * 100",
  unidadId: 1,
  unidadNombre: "Porcentaje",
  unidadSufijo: " %",
  decimales: 1,
  periodicidad: "mensual",
  tendencia: "ascendente",
  meta: "90",
  metaMax: null,
  semaforoModo: "relativo",
  umbralAtencionPct: 70,
  limiteCritico: null,
  tolerancia: null,
  resultadoMin: "0",
  resultadoMax: "100",
  lineaBaseValor: "85",
  lineaBasePeriodo: "2025",
  lineaBaseNota: null,
  sustentoMeta: "Meta institucional",
  ente: null,
  periodicidadExterna: null,
  plazoExternoDias: null,
  dimensionId: null,
  variables: [
    {
      letra: "A",
      nombre: "Atendidos a tiempo",
      descripcion: "Los que esperaron menos de 30 minutos",
      fuente: "Registro de triage",
      unidad: "personas",
      consolidacion: "suma",
      origen: "propia",
      variableCompartidaId: null,
      indicadorOrigenId: null,
      toma: null,
      capturaMin: "0",
      capturaMax: null,
      admiteNegativos: false,
    },
    {
      letra: "B",
      nombre: "Atendidos",
      descripcion: "Todos los que consultaron",
      fuente: "Registro de triage",
      unidad: "personas",
      consolidacion: "suma",
      origen: "propia",
      variableCompartidaId: null,
      indicadorOrigenId: null,
      toma: null,
      capturaMin: "0",
      capturaMax: null,
      admiteNegativos: false,
    },
  ],
  responsables: [
    { cargoNombre: "Líder de Calidad", funcion: "analizar" },
    { cargoNombre: "Enfermera jefe", funcion: "medir" },
  ],
  normas: [{ normaNombre: "Resolución 256 de 2016" }],
});

describe("tipo de cambio de una ficha", () => {
  const menores: [string, (c: ContenidoFicha) => void][] = [
    ["nombre", (c) => (c.nombre = "Otro nombre")],
    ["propósito", (c) => (c.proposito = "Otro propósito")],
    ["requisito", (c) => (c.requisito = "Otro requisito")],
    ["tipo", (c) => (c.tipoNombre = "Eficiencia")],
    ["objetivo", (c) => (c.objetivoNombre = "Otro objetivo")],
    ["subproceso", (c) => (c.subprocesoNombre = "Triage")],
    ["decimales", (c) => (c.decimales = 2)],
    ["un cargo", (c) => (c.responsables[0].cargoNombre = "Coordinador de Calidad")],
    ["descripción de una variable", (c) => (c.variables[0].descripcion = "Otra descripción")],
    ["fuente de una variable", (c) => (c.variables[1].fuente = "Otra fuente")],
    ["límites de captura", (c) => (c.variables[0].capturaMax = "1000")],
    ["admite negativos", (c) => (c.variables[0].admiteNegativos = true)],
    ["límites del resultado", (c) => (c.resultadoMax = "120")],
    ["línea base", (c) => (c.lineaBaseValor = "80")],
    ["una norma", (c) => (c.normas = [{ normaNombre: "Otra norma" }])],
    ["el nombre de la clasificación (mismo id)", (c) => (c.clasificacionNombre = "Operacional")],
    ["el nombre de la unidad (mismo id)", (c) => (c.unidadNombre = "Porcentaje (%)")],
    ["el sufijo de la unidad (mismo id)", (c) => (c.unidadSufijo = "%")],
    ["el ente", (c) => (c.ente = "Secretaría")],
  ];
  const mayores: [string, (c: ContenidoFicha) => void][] = [
    ["clasificación (otro id)", (c) => ((c.clasificacionId = 2), (c.clasificacionNombre = "Estratégico"))],
    ["forma", (c) => (c.forma = "tasa")],
    ["fórmula", (c) => (c.formula = "A / B")],
    ["cuántas variables", (c) => c.variables.pop()],
    ["origen de una variable", (c) => (c.variables[0].origen = "compartida")],
    ["consolidación de una variable", (c) => (c.variables[0].consolidacion = "promedio")],
    ["unidad (otro id)", (c) => ((c.unidadId = 2), (c.unidadNombre = "Minutos"), (c.unidadSufijo = " min"))],
    ["periodicidad", (c) => (c.periodicidad = "trimestral")],
    ["tendencia", (c) => (c.tendencia = "descendente")],
    ["meta", (c) => (c.meta = "95")],
    ["modo del semáforo", (c) => (c.semaforoModo = "fijo")],
    ["umbral", (c) => (c.umbralAtencionPct = 60)],
    ["límite", (c) => (c.limiteCritico = "50")],
    ["tolerancia", (c) => (c.tolerancia = "3")],
    ["origen del dato", (c) => (c.origenDato = "automatico")],
  ];
  it.each(menores)("cambiar %s es menor", (_, cambiar) => {
    const nuevo = base();
    cambiar(nuevo);
    expect(tipoDeCambio(base(), nuevo)).toBe("menor");
  });
  it.each(mayores)("cambiar %s es mayor", (_, cambiar) => {
    const nuevo = base();
    cambiar(nuevo);
    expect(tipoDeCambio(base(), nuevo)).toBe("mayor");
  });
  it("sin cambios es «ninguno»; uno mayor entre varios menores lo hace mayor", () => {
    expect(tipoDeCambio(base(), base())).toBe("ninguno");
    const nuevo = base();
    nuevo.nombre = "Otro";
    nuevo.meta = "95";
    expect(tipoDeCambio(base(), nuevo)).toBe("mayor");
  });
  it("el orden de las listas sin orden y los ceros de los números no cuentan", () => {
    const nuevo = base();
    nuevo.responsables.reverse();
    nuevo.meta = "90.0000";
    nuevo.variables.reverse();
    expect(tipoDeCambio(base(), nuevo)).toBe("ninguno");
  });
  it("camposCambiados da etiquetas legibles ordenadas", () => {
    const nuevo = base();
    nuevo.nombre = "Otro";
    nuevo.meta = "95";
    expect(camposCambiados(base(), nuevo)).toEqual(["Meta", "Nombre"]);
    expect(camposCambiados(base(), base())).toEqual([]);
  });
  it("renombrar el catálogo no vuelve mayor la ficha; cambiar de unidad sí, y se dice una sola vez", () => {
    const renombrada = base();
    renombrada.unidadNombre = "Porcentaje (%)";
    expect(camposCambiados(base(), renombrada)).toEqual(["Unidad (nombre)"]);
    const otra = base();
    otra.unidadId = 2;
    otra.unidadNombre = "Minutos";
    otra.unidadSufijo = " min";
    expect(camposCambiados(base(), otra)).toEqual(["Unidad"]);
  });
  it("los campos mayores nombrados existen en la ficha", () => {
    for (const campo of CAMPOS_MAYORES) expect(Object.keys(base())).toContain(campo);
  });
});

describe("huella de la ficha", () => {
  it("son 64 caracteres hexadecimales y no dependen del orden de las claves", () => {
    const a = base();
    const b = Object.fromEntries(Object.entries(base()).reverse()) as unknown as ContenidoFicha;
    expect(huellaDeFicha(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(huellaDeFicha(a)).toBe(huellaDeFicha(b));
  });
  it("cambia si cambia un nombre firmado", () => {
    const nuevo = base();
    nuevo.responsables[0].cargoNombre = "Coordinador de Calidad";
    expect(huellaDeFicha(nuevo)).not.toBe(huellaDeFicha(base()));
  });
  it("no depende del orden de responsables ni de variables, ni del formato de un número", () => {
    const nuevo = base();
    nuevo.responsables.reverse();
    nuevo.variables.reverse();
    nuevo.meta = "90.00";
    expect(huellaDeFicha(nuevo)).toBe(huellaDeFicha(base()));
  });
  it("cambia si cambia el nombre firmado de la unidad", () => {
    const nuevo = base();
    nuevo.unidadNombre = "Porcentaje (%)";
    expect(huellaDeFicha(nuevo)).not.toBe(huellaDeFicha(base()));
  });
});

describe("estados de una medición", () => {
  it("qué análisis se exige", () => {
    const m = { repetido: false, historica: false, noAplica: false };
    expect(analisisExigido({ ...m, semaforo: "bien" })).toBe("ninguno");
    expect(analisisExigido({ ...m, semaforo: null })).toBe("ninguno");
    expect(analisisExigido({ ...m, semaforo: "atencion" })).toBe("simple");
    expect(analisisExigido({ ...m, semaforo: "critico" })).toBe("dos_partes");
    expect(analisisExigido({ ...m, semaforo: "atencion", repetido: true })).toBe("dos_partes");
    expect(analisisExigido({ ...m, semaforo: "critico", historica: true })).toBe("ninguno");
    expect(analisisExigido({ ...m, semaforo: "critico", noAplica: true })).toBe("ninguno");
  });
  it("si tiene el análisis que se le exige", () => {
    const vacio = { analisis: null, causa: null, accionPropuesta: null };
    const simple = { ...vacio, analisis: "Faltó personal en agosto" };
    const dos = { ...vacio, causa: "Faltó personal", accionPropuesta: "Formar suplentes" };
    expect(analisisCompleto("ninguno", vacio)).toBe(true);
    expect(analisisCompleto("simple", vacio)).toBe(false);
    expect(analisisCompleto("simple", { ...vacio, analisis: "   " })).toBe(false);
    expect(analisisCompleto("simple", simple)).toBe(true);
    // Las dos partes también satisfacen el simple; el simple no basta para las dos partes.
    expect(analisisCompleto("simple", dos)).toBe(true);
    expect(analisisCompleto("dos_partes", simple)).toBe(false);
    expect(analisisCompleto("dos_partes", { ...dos, accionPropuesta: "" })).toBe(false);
    expect(analisisCompleto("dos_partes", dos)).toBe(true);
  });
  it("incumplimiento repetido: N periodos seguidos sin «Bien»", () => {
    expect(esRepetido(["atencion", "critico"], "atencion", 3)).toBe(true);
    expect(esRepetido(["bien", "atencion"], "atencion", 3)).toBe(false);
    expect(esRepetido(["atencion"], "atencion", 3)).toBe(false);
    expect(esRepetido(["atencion", "atencion"], "bien", 3)).toBe(false);
  });
  it("el estado que se muestra", () => {
    const m = { estado: "abierta" as const, vence: new Date("2026-04-10T23:59:59Z"), historica: false, datosCompletos: false, faltaDatoAjeno: false, faltaAnalisis: false };
    const antes = new Date("2026-04-05T12:00:00Z"),
      despues = new Date("2026-04-12T12:00:00Z");
    expect(estadoVisible(m, antes)).toEqual({ estado: "por_reportar", vencida: false });
    expect(estadoVisible(m, despues)).toEqual({ estado: "por_reportar", vencida: true });
    expect(estadoVisible({ ...m, faltaDatoAjeno: true }, antes).estado).toBe("falta_dato");
    expect(estadoVisible({ ...m, datosCompletos: true, faltaAnalisis: true }, despues)).toEqual({ estado: "falta_analisis", vencida: true });
    expect(estadoVisible({ ...m, historica: true }, despues).vencida).toBe(false);
    expect(estadoVisible({ ...m, estado: "reportada" }, despues)).toEqual({ estado: "reportada", vencida: false });
    expect(estadoVisible({ ...m, estado: "cerrada" }, despues)).toEqual({ estado: "cerrada", vencida: false });
  });
  it("las etiquetas de cada estado", () => {
    expect(ETIQUETA_ESTADO.falta_dato).toBe("Falta un dato");
    expect(Object.keys(ETIQUETA_ESTADO)).toHaveLength(5);
  });
});
