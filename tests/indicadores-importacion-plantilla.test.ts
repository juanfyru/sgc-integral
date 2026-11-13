import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { COLUMNAS, MAXIMO_FILAS_IMPORTACION, type ClaveColumna } from "@/lib/indicadores/importacion/columnas";
import { leerPlantilla } from "@/lib/indicadores/importacion/leer";
import { plantillaDeImportacion } from "@/lib/indicadores/importacion/plantilla";
import { revisarLote, type Catalogos, type Correspondencias } from "@/lib/indicadores/importacion/revisar";

const ENCABEZADOS = [
  "Código", "Nombre", "Proceso (sigla)", "Subproceso", "Tipo", "Clasificación", "Nivel", "Objetivo del indicador", "Forma",
  "Variable A", "Variable B", "Factor", "Fórmula libre", "Cómo se junta A", "Cómo se junta B", "Unidad", "Meta", "Meta hasta",
  "Sentido", "Periodicidad", "Fuente", "Cargo responsable de medir", "Riesgo asociado", "Referente normativo",
  "Inicio de medición", "Estado",
];

const LISTAS = {
  procesos: ["CNT", "LAB"],
  subprocesos: ["Laboratorio", "Gestión Contable"],
  tipos: ["Eficacia", "Eficiencia"],
  clasificaciones: ["Estratégico", "Regulatorio"],
  unidades: ["Porcentaje", "Número"],
};

async function libro(bytes: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  return wb;
}

const catalogos = (usados: string[] = []): Catalogos => ({
  procesos: [
    { id: 1, sigla: "CNT", nombre: "Gestión Contable y Financiera" },
    { id: 2, sigla: "LAB", nombre: "Laboratorio Clínico" },
  ],
  subprocesos: [
    { id: 10, procesoId: 2, nombre: "Laboratorio Clínico", sigla: null },
    { id: 11, procesoId: 1, nombre: "Gestión Contable", sigla: "CNT" },
  ],
  tipos: [{ id: 1, nombre: "Eficacia" }],
  clasificaciones: [{ id: 1, nombre: "Estratégico" }],
  unidades: [
    { id: 1, nombre: "Porcentaje", sufijo: " %", decimales: 1 },
    { id: 2, nombre: "Número", sufijo: "", decimales: 0 },
  ],
  cargos: [{ id: 5, nombre: "Coordinador de calidad" }],
  codigosUsados: new Set(usados),
});

const SIN_CORR: Correspondencias = { subprocesos: {}, cargos: {}, tipos: {}, unidades: {} };
const REGLA = { pctAscendente: 90, pctDescendente: 110 };

function fila(numero: number, extra: Partial<Record<ClaveColumna, string>> = {}) {
  return {
    numero,
    celdas: {
      codigo: "CNT-ID-001",
      nombre: "Oportunidad de la factura",
      proceso: "CNT",
      subproceso: "Gestión Contable",
      tipo: "Eficacia",
      clasificacion: "Estratégico",
      forma: "Porcentaje",
      variableA: "Facturas a tiempo",
      variableB: "Facturas emitidas",
      unidad: "Porcentaje",
      meta: "95",
      sentido: "Ascendente",
      periodicidad: "Trimestral",
      estado: "Aprobado",
      ...extra,
    } as Partial<Record<ClaveColumna, string>>,
  };
}

describe("la plantilla de importación", () => {
  it("tiene las tres hojas y los 26 encabezados en orden", async () => {
    const wb = await libro(await plantillaDeImportacion(LISTAS));
    expect(wb.worksheets.map((h) => h.name)).toEqual(["Indicadores", "Instrucciones", "Listas"]);
    expect(wb.getWorksheet("Listas")?.state).toBe("hidden");
    const hoja = wb.getWorksheet("Indicadores")!;
    expect((hoja.getRow(1).values as unknown[]).slice(1)).toEqual(ENCABEZADOS);
    expect(COLUMNAS.map((c) => c.encabezado)).toEqual(ENCABEZADOS);
    expect(COLUMNAS.filter((c) => c.obligatoria).map((c) => c.clave)).toEqual([
      "codigo", "nombre", "proceso", "tipo", "clasificacion", "forma", "unidad", "sentido", "periodicidad", "estado",
    ]);
    expect(MAXIMO_FILAS_IMPORTACION).toBe(500);
  });

  it("valida con lista las columnas que la tienen, hasta la fila 501", async () => {
    const hoja = (await libro(await plantillaDeImportacion(LISTAS))).getWorksheet("Indicadores")!;
    const columnaForma = COLUMNAS.findIndex((c) => c.clave === "forma") + 1;
    const v = hoja.getCell(501, columnaForma).dataValidation;
    expect(v.type).toBe("list");
    expect(hoja.getCell(502, columnaForma).dataValidation).toBeUndefined();
    const columnaMeta = COLUMNAS.findIndex((c) => c.clave === "meta") + 1;
    expect(hoja.getCell(2, columnaMeta).dataValidation?.type).toBeUndefined();
  });

  it("la instrucción de «Cómo se junta» explica el último valor y la hoja trae una fila por columna", async () => {
    const hoja = (await libro(await plantillaDeImportacion(LISTAS))).getWorksheet("Instrucciones")!;
    const textos: string[] = [];
    hoja.eachRow((r) => textos.push(r.values instanceof Array ? r.values.join(" | ") : ""));
    expect(textos.filter((t) => ENCABEZADOS.some((e) => t.includes(e))).length).toBeGreaterThanOrEqual(26);
    expect(textos.some((t) => t.includes("Cómo se junta A") && t.includes("Último valor") && t.includes("Listado Maestro"))).toBe(true);
  });

  it("neutraliza una celda que empieza como fórmula", async () => {
    const wb = await libro(await plantillaDeImportacion({ ...LISTAS, tipos: ["=1+1"] }));
    const celdas = wb.getWorksheet("Listas")!.getSheetValues().flat().filter((x) => typeof x === "string") as string[];
    expect(celdas).toContain("'=1+1");
  });
});

describe("leerPlantilla", () => {
  async function conFilas(filas: Partial<Record<ClaveColumna, string>>[]): Promise<Buffer> {
    const wb = await libro(await plantillaDeImportacion(LISTAS));
    const hoja = wb.getWorksheet("Indicadores")!;
    filas.forEach((f, i) => {
      COLUMNAS.forEach((c, j) => {
        const v = f[c.clave];
        if (v !== undefined) hoja.getCell(i + 2, j + 1).value = v;
      });
    });
    return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  }

  it("devuelve las celdas recortadas de las filas escritas y salta las vacías", async () => {
    const r = await leerPlantilla(await conFilas([{ codigo: " CNT-ID-001 ", nombre: "Uno", meta: "95" }, {}, { codigo: "CNT-ID-002", nombre: "Dos" }]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.filas.map((f) => f.numero)).toEqual([2, 4]);
    expect(r.filas[0].celdas).toMatchObject({ codigo: "CNT-ID-001", nombre: "Uno", meta: "95" });
    expect(r.filas[1].celdas.codigo).toBe("CNT-ID-002");
    expect(r.filas[1].celdas.meta).toBeUndefined();
  });

  it("lee números de Excel como texto", async () => {
    const wb = await libro(await plantillaDeImportacion(LISTAS));
    const hoja = wb.getWorksheet("Indicadores")!;
    hoja.getCell(2, 1).value = "X-ID-001";
    hoja.getCell(2, COLUMNAS.findIndex((c) => c.clave === "meta") + 1).value = 95.5;
    const r = await leerPlantilla(Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer));
    expect(r.ok && r.filas[0].celdas.meta).toBe("95.5");
  });

  it("rechaza un libro sin la hoja «Indicadores»", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Otra").getCell(1, 1).value = "x";
    const r = await leerPlantilla(Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer));
    expect(r).toEqual({ ok: false, error: "El archivo no tiene la hoja «Indicadores»" });
  });

  it("rechaza una hoja sin una columna, sin filas o con más de 500", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Indicadores").getCell(1, 1).value = "Código";
    expect(await leerPlantilla(Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer))).toEqual({
      ok: false,
      error: "La hoja «Indicadores» no tiene la columna «Nombre»",
    });
    expect(await leerPlantilla(await conFilas([]))).toEqual({ ok: false, error: "La plantilla no tiene filas" });
    const muchas = Array.from({ length: 501 }, (_, i) => ({ codigo: `A-ID-${i}` }));
    expect(await leerPlantilla(await conFilas(muchas))).toEqual({ ok: false, error: "La plantilla tiene más de 500 filas" });
  });
});

describe("revisarLote", () => {
  it("arma la ficha de un porcentaje con la regla de rangos", () => {
    const [r] = revisarLote([fila(2)], catalogos(), SIN_CORR, REGLA, 2026);
    expect(r.problemas).toEqual([]);
    expect(r.pendientes).toEqual([]);
    expect(r.ficha).toMatchObject({
      codigo: "CNT-ID-001",
      procesoId: 1,
      subprocesoId: 11,
      forma: "porcentaje",
      formula: "A / B * 100",
      meta: "95",
      tendencia: "ascendente",
      periodicidad: "trimestral",
      inicioMedicion: "2026-T1",
      estado: "aprobado",
      unidadId: 1,
    });
    expect(r.ficha!.variables.map((v) => [v.letra, v.nombre, v.consolidacion])).toEqual([
      ["A", "Facturas a tiempo", "suma"],
      ["B", "Facturas emitidas", "suma"],
    ]);
    expect(r.ficha!.rangos).toEqual({
      bien: [{ signo: ">=", valor: "95" }],
      atencion: [{ signo: ">=", valor: "85.5" }],
      critico: [{ signo: "<", valor: "85.5" }],
    });
  });

  it("empareja «Laboratorio Clínico (LAB)» con el subproceso «Laboratorio Clínico» (sin el sufijo)", () => {
    const [r] = revisarLote([fila(2, { proceso: "LAB", subproceso: "Laboratorio Clínico (LAB)" })], catalogos(), SIN_CORR, REGLA, 2026);
    expect(r.ficha?.subprocesoId).toBe(10);
    expect(r.pendientes).toEqual([]);
  });

  it("un subproceso desconocido queda pendiente y sin ficha; la correspondencia lo resuelve", () => {
    const f = fila(2, { subproceso: "Cartera" });
    const [r] = revisarLote([f], catalogos(), SIN_CORR, REGLA, 2026);
    expect(r.ficha).toBeNull();
    expect(r.pendientes).toEqual([{ tipo: "subproceso", texto: "Cartera" }]);
    const [ok] = revisarLote([f], catalogos(), { ...SIN_CORR, subprocesos: { cartera: 11 } }, REGLA, 2026);
    expect(ok.ficha?.subprocesoId).toBe(11);
    expect(ok.pendientes).toEqual([]);
  });

  it("tipo, unidad y cargo desconocidos quedan pendientes", () => {
    const [r] = revisarLote([fila(2, { tipo: "Otro", unidad: "Veces", cargo: "Jefe de cartera" })], catalogos(), SIN_CORR, REGLA, 2026);
    expect(r.pendientes).toEqual([
      { tipo: "tipo", texto: "Otro" },
      { tipo: "unidad", texto: "Veces" },
      { tipo: "cargo", texto: "Jefe de cartera" },
    ]);
  });

  it("un código repetido en el archivo o ya usado es un problema", () => {
    const filas = [fila(2), fila(3, { codigo: "CNT-ID-002" }), fila(5)];
    const r = revisarLote(filas, catalogos(["cnt-id-002"]), SIN_CORR, REGLA, 2026);
    expect(r[0].problemas).toContain("El código CNT-ID-001 se repite en las filas 2 y 5");
    expect(r[2].problemas).toContain("El código CNT-ID-001 se repite en las filas 2 y 5");
    expect(r[1].problemas).toContain("El código CNT-ID-002 ya existe en la app");
    expect(r[0].ficha).toBeNull();
  });

  it("una meta de porcentaje escrita como fracción avisa pero no bloquea", () => {
    const [r] = revisarLote([fila(2, { meta: "0,95" })], catalogos(), SIN_CORR, REGLA, 2026);
    expect(r.avisos).toContain("La meta 0,95 de un porcentaje parece una fracción: ¿quiso escribir 95?");
    expect(r.ficha).not.toBeNull();
    const [sin] = revisarLote([fila(2, { meta: "95" })], catalogos(), SIN_CORR, REGLA, 2026);
    expect(sin.avisos).toEqual([]);
  });

  it("«Constante» no se importa", () => {
    const [r] = revisarLote([fila(2, { sentido: "Constante" })], catalogos(), SIN_CORR, REGLA, 2026);
    expect(r.problemas).toContain("«Mantenerse en un rango» no se importa: cree esa ficha en la app");
    expect(r.ficha).toBeNull();
  });

  it("«Propuesto» y el inicio vacío o escrito", () => {
    const [p] = revisarLote([fila(2, { estado: "Propuesto" })], catalogos(), SIN_CORR, REGLA, 2026);
    expect(p.ficha?.estado).toBe("propuesto");
    expect(p.ficha?.inicioMedicion).toBe("2026-T1");
    const [i] = revisarLote([fila(2, { inicioMedicion: "2026-09" })], catalogos(), SIN_CORR, REGLA, 2026);
    expect(i.ficha?.inicioMedicion).toBe("2026-T3");
    const [mal] = revisarLote([fila(2, { inicioMedicion: "septiembre" })], catalogos(), SIN_CORR, REGLA, 2026);
    expect(mal.problemas).toContain("El inicio de medición «septiembre» no es AAAA-MM");
  });

  it("lo que falta o no es válido se dice con sus mensajes exactos", () => {
    const [r] = revisarLote(
      [fila(2, { nombre: "", forma: "Cuadrada", meta: "abc", sentido: "Subir", periodicidad: "Siempre", estado: "Quizá" })],
      catalogos(),
      SIN_CORR,
      REGLA,
      2026,
    );
    expect(r.problemas).toEqual(
      expect.arrayContaining([
        "Falta «Nombre»",
        "«Cuadrada» no es una forma: use Porcentaje, Tasa, Promedio o razón, Conteo o Fórmula libre",
        "La meta «abc» no es un número",
        "«Subir» no es un sentido: use Ascendente, Descendente o Constante",
        "«Siempre» no es una periodicidad: use Mensual, Bimestral, Trimestral, Semestral o Anual",
        "«Quizá» no es un estado: use Aprobado o Propuesto",
      ]),
    );
  });

  it("un texto que pasa del largo del esquema es un problema (no se recorta)", () => {
    const [r] = revisarLote([fila(2, { nombre: "x".repeat(201), referenteNormativo: "y".repeat(121) })], catalogos(), SIN_CORR, REGLA, 2026);
    expect(r.problemas).toContain("«Nombre» pasa de 200 caracteres");
    expect(r.problemas).toContain("«Referente normativo» pasa de 120 caracteres");
  });

  it("tasa con factor, fórmula libre y conteo", () => {
    const [t] = revisarLote([fila(2, { forma: "Tasa", factor: "1.000" })], catalogos(), SIN_CORR, REGLA, 2026);
    expect(t.ficha?.formula).toBe("A / B * 1000");
    expect(t.ficha?.factor).toBe(1000);
    const [sinFactor] = revisarLote([fila(2, { forma: "Tasa" })], catalogos(), SIN_CORR, REGLA, 2026);
    expect(sinFactor.problemas).toContain("Falta «Factor»");
    const [l] = revisarLote([fila(2, { forma: "Fórmula libre", formulaLibre: "A / (A + B)" })], catalogos(), SIN_CORR, REGLA, 2026);
    expect(l.ficha?.formula).toBe("A / (A + B)");
    const [mala] = revisarLote([fila(2, { forma: "Fórmula libre", formulaLibre: "A / / B" })], catalogos(), SIN_CORR, REGLA, 2026);
    expect(mala.ficha).toBeNull();
    expect(mala.problemas.length).toBeGreaterThan(0);
    const [c] = revisarLote([fila(2, { forma: "Conteo", variableB: "" })], catalogos(), SIN_CORR, REGLA, 2026);
    expect(c.ficha?.formula).toBe("A");
    expect(c.ficha?.variables).toHaveLength(1);
  });

  it("«Cómo se junta» y la fuente van a cada variable", () => {
    const [r] = revisarLote([fila(2, { comoSeJuntaA: "Último valor", comoSeJuntaB: "Promedio", fuente: "Listado Maestro" })], catalogos(), SIN_CORR, REGLA, 2026);
    expect(r.ficha?.variables.map((v) => [v.consolidacion, v.fuente])).toEqual([
      ["ultimo", "Listado Maestro"],
      ["promedio", "Listado Maestro"],
    ]);
  });

  it("ofrece la sigla del código al subproceso que no la tiene", () => {
    const [r] = revisarLote([fila(2, { codigo: "CNT-ID-003", proceso: "LAB", subproceso: "Laboratorio Clínico" })], catalogos(), SIN_CORR, REGLA, 2026);
    expect(r.ficha?.siglaParaSubproceso).toBe("CNT");
    const [sin] = revisarLote([fila(2)], catalogos(), SIN_CORR, REGLA, 2026);
    expect(sin.ficha?.siglaParaSubproceso).toBeNull();
  });
});

describe("libros hostiles", () => {
  async function conCeldas(poner: (hoja: ExcelJS.Worksheet, col: (c: ClaveColumna) => number) => void): Promise<Buffer> {
    const wb = await libro(await plantillaDeImportacion(LISTAS));
    const hoja = wb.getWorksheet("Indicadores")!;
    poner(hoja, (c) => COLUMNAS.findIndex((x) => x.clave === c) + 1);
    return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  }

  it("una celda combinada solo vale en su maestra: sin filas fantasma ni datos copiados", async () => {
    const r = await leerPlantilla(
      await conCeldas((h, col) => {
        h.getCell(4, col("codigo")).value = "A-ID-1";
        h.getCell(5, col("codigo")).value = "A-ID-2";
        h.getCell(4, col("proceso")).value = "CNT";
        h.mergeCells(4, col("proceso"), 6, col("proceso"));
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.filas.map((f) => f.numero)).toEqual([4, 5]);
    expect(r.filas[0].celdas.proceso).toBe("CNT");
    expect(r.filas[1].celdas.proceso).toBeUndefined();
  });

  it("dos columnas combinadas en horizontal no copian el valor a la vecina", async () => {
    const r = await leerPlantilla(
      await conCeldas((h, col) => {
        h.getCell(2, col("nombre")).value = "Nombre combinado";
        h.mergeCells(2, col("nombre"), 2, col("proceso"));
      }),
    );
    expect(r.ok && r.filas[0].celdas).toEqual({ nombre: "Nombre combinado" });
  });

  it("una fecha que no se puede leer no tumba la lectura", async () => {
    const r = await leerPlantilla(
      await conCeldas((h, col) => {
        h.getCell(2, col("codigo")).value = "A-ID-1";
        h.getCell(2, col("inicioMedicion")).value = new Date(8.64e15);
        h.getCell(2, col("inicioMedicion")).value = { formula: "1", result: new Date(Number.NaN) } as unknown as ExcelJS.CellValue;
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^La celda Y2 tiene una fecha que no se puede leer$/);
  });

  it("lee el texto de un hipervínculo, también con texto enriquecido", async () => {
    const r = await leerPlantilla(
      await conCeldas((h, col) => {
        h.getCell(2, col("nombre")).value = { text: "Con enlace", hyperlink: "https://example.org" };
        h.getCell(2, col("riesgo")).value = {
          text: { richText: [{ text: "Riesgo " }, { text: "enriquecido" }] },
          hyperlink: "https://example.org",
        } as unknown as ExcelJS.CellValue;
      }),
    );
    expect(r.ok && r.filas[0].celdas).toMatchObject({ nombre: "Con enlace", riesgo: "Riesgo enriquecido" });
  });

  it("la plantilla pone una sola validación por columna y la columna Factor en texto", async () => {
    const wb = await libro(await plantillaDeImportacion(LISTAS));
    const hoja = wb.getWorksheet("Indicadores")!;
    const factor = COLUMNAS.findIndex((c) => c.clave === "factor") + 1;
    expect(hoja.getColumn(factor).numFmt).toBe("@");
    const listas = await wb.getWorksheet("Listas")!.getSheetValues().flat();
    expect(listas).toContain("1000");
    expect(listas).not.toContain("1.000");
    const zip = await JSZip.loadAsync(await plantillaDeImportacion(LISTAS));
    const xml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    const rangos = [...xml.matchAll(/<dataValidation [^>]*sqref="([^"]+)"/g)].map((m) => m[1]);
    expect(rangos).toHaveLength(COLUMNAS.filter((c) => c.lista !== null).length);
    expect(rangos.every((r) => /^[A-Z]+2:[A-Z]+501$/.test(r))).toBe(true);
  });

  it("«Obligatoria» de las variables dice «Según la forma»", async () => {
    const hoja = (await libro(await plantillaDeImportacion(LISTAS))).getWorksheet("Instrucciones")!;
    expect(hoja.getCell(COLUMNAS.findIndex((c) => c.clave === "variableA") + 2, 2).value).toBe("Según la forma");
  });
});

describe("revisarLote: rigor de la ronda 1", () => {
  const una = (extra: Partial<Record<ClaveColumna, string>>) => revisarLote([fila(2, extra)], catalogos(), SIN_CORR, REGLA, 2026)[0];

  it("la correspondencia de un subproceso de otro proceso es un problema", () => {
    const r = revisarLote(
      [fila(2, { proceso: "LAB", subproceso: "Cartera externa" })],
      catalogos(),
      { ...SIN_CORR, subprocesos: { "cartera externa": 11 } },
      REGLA,
      2026,
    )[0];
    expect(r.problemas).toContain("El subproceso «Cartera externa» no es del proceso LAB");
    expect(r.ficha).toBeNull();
  });

  it("lo que sobra de una forma bloquea la fila", () => {
    expect(una({ forma: "Conteo", variableB: "Algo" }).problemas).toContain("«Variable B» no se usa con la forma «Conteo»: déjela vacía");
    expect(una({ forma: "Conteo", variableB: "" , comoSeJuntaB: "Promedio" }).problemas).toContain("«Cómo se junta B» no se usa con la forma «Conteo»: déjela vacía");
    expect(una({ formulaLibre: "A / B" }).problemas).toContain("«Fórmula libre» no se usa con la forma «Porcentaje»: déjela vacía");
    expect(una({ factor: "1000" }).problemas).toContain("«Factor» no se usa con la forma «Porcentaje»: déjela vacía");
    const libre = una({ forma: "Fórmula libre", formulaLibre: "A * 2" });
    expect(libre.problemas).toContain("«Variable B» no se usa con la forma «Fórmula libre»: déjela vacía");
    expect(libre.ficha).toBeNull();
  });

  it("«Meta hasta» fuera de «Constante» bloquea y nunca llega a la ficha", () => {
    const r = una({ metaHasta: "100" });
    expect(r.problemas).toContain("«Meta hasta» solo se usa con «Constante»: déjela vacía");
    expect(r.ficha).toBeNull();
    expect(una({}).ficha?.metaMax).toBeNull();
  });

  it("una meta con punto de miles es ambigua; la coma decimal y el punto decimal valen", () => {
    expect(una({ meta: "1.000" }).problemas).toContain("La meta «1.000» es ambigua: escríbala sin separador de miles (1000) o con coma decimal");
    expect(una({ meta: "1,5" }).ficha?.meta).toBe("1.5");
    expect(una({ meta: "95.5" }).ficha?.meta).toBe("95.5");
    expect(una({ meta: "95,50" }).ficha?.meta).toBe("95.5");
  });

  it("sin meta: ficha sin meta ni rangos y un aviso", () => {
    const r = una({ meta: "" });
    expect(r.problemas).toEqual([]);
    expect(r.avisos).toContain("Sin meta: el indicador solo se vigilará, sin colores ni alertas");
    expect(r.ficha).toMatchObject({ meta: null, metaMax: null, rangos: null });
  });

  it("el eco de un texto largo se corta a 80 caracteres", () => {
    const r = una({ proceso: "z".repeat(200) });
    expect(r.problemas).toContain(`El proceso «${"z".repeat(80)}…» no existe en el mapa`);
  });
});

describe("ronda 2: celdas con error y residuos", () => {
  async function leer(poner: (hoja: ExcelJS.Worksheet, col: (c: ClaveColumna) => number) => void) {
    const wb = await libro(await plantillaDeImportacion(LISTAS));
    const hoja = wb.getWorksheet("Indicadores")!;
    poner(hoja, (c) => COLUMNAS.findIndex((x) => x.clave === c) + 1);
    return leerPlantilla(Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer));
  }
  const una = (extra: Partial<Record<ClaveColumna, string>>) => revisarLote([fila(2, extra)], catalogos(), SIN_CORR, REGLA, 2026)[0];

  it("una celda con error de Excel o una fórmula sin resultado bloquea su fila", async () => {
    const r = await leer((h, col) => {
      h.getCell(2, col("codigo")).value = "CNT-ID-001";
      h.getCell(2, col("meta")).value = { error: "#DIV/0!" } as ExcelJS.CellErrorValue;
      h.getCell(2, col("objetivo")).value = { error: "#REF!" } as ExcelJS.CellErrorValue;
      h.getCell(2, col("riesgo")).value = { formula: "Otra!A1" } as ExcelJS.CellFormulaValue;
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.filas[0].errores).toEqual({ meta: "#DIV/0!", objetivo: "#REF!", riesgo: "fórmula sin resultado" });
    const rev = revisarLote([{ ...fila(2), celdas: { ...fila(2).celdas, ...r.filas[0].celdas }, errores: r.filas[0].errores }], catalogos(), SIN_CORR, REGLA, 2026)[0];
    expect(rev.ficha).toBeNull();
    expect(rev.problemas).toEqual(
      expect.arrayContaining([
        "«Meta» tiene un error de Excel (#DIV/0!): corríjalo en la plantilla",
        "«Objetivo del indicador» tiene un error de Excel (#REF!): corríjalo en la plantilla",
        "«Riesgo asociado» tiene un error de Excel (fórmula sin resultado): corríjalo en la plantilla",
      ]),
    );
    expect(rev.avisos).not.toContain("Sin meta: el indicador solo se vigilará, sin colores ni alertas");
  });

  it("un número enorme con formato de fecha no tumba la lectura", async () => {
    const r = await leer((h, col) => {
      h.getCell(2, col("codigo")).value = "A-ID-1";
      const c = h.getCell(2, col("inicioMedicion"));
      c.value = 1e15;
      c.numFmt = "yyyy-mm-dd";
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("La celda Y2 tiene una fecha que no se puede leer");
  });

  it("el código largo se repite en el mensaje recortado a 80 caracteres", () => {
    const largo = "A".repeat(100);
    const r = revisarLote([fila(2, { codigo: largo })], catalogos([largo.toLowerCase()]), SIN_CORR, REGLA, 2026)[0];
    expect(r.problemas).toContain(`El código ${"A".repeat(80)}… ya existe en la app`);
  });

  it("«Factor» se lee estricto", () => {
    for (const mal of ["1000.0", "100,0", "10 00"]) {
      expect(una({ forma: "Tasa", factor: mal }).problemas.some((p) => p.includes("no es un factor"))).toBe(true);
    }
    for (const bien of ["1000", "1.000", "10 000", "100000"]) expect(una({ forma: "Tasa", factor: bien }).problemas).toEqual([]);
  });

  it("en «Fórmula libre», «Cómo se junta» de una letra que no se usa es un problema", () => {
    const r = una({ forma: "Fórmula libre", formulaLibre: "A * 2", variableB: "", comoSeJuntaB: "Promedio" });
    expect(r.problemas).toContain("«Cómo se junta B» no se usa con la forma «Fórmula libre»: déjela vacía");
  });

  it("los sobrantes nombran la forma de la lista y «Constante» no recibe el mensaje de «Meta hasta»", () => {
    expect(una({ forma: "conteo", variableB: "x" }).problemas).toContain("«Variable B» no se usa con la forma «Conteo»: déjela vacía");
    const c = una({ sentido: "Constante", metaHasta: "100" });
    expect(c.problemas).not.toContain("«Meta hasta» solo se usa con «Constante»: déjela vacía");
    expect(c.problemas).toContain("«Mantenerse en un rango» no se importa: cree esa ficha en la app");
  });
});
