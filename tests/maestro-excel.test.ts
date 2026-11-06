/**
 * Constructor puro del Excel del Listado Maestro (Fase 8): función determinista
 * que recibe filas + metadatos y devuelve el Buffer del xlsx. Se verifica
 * parseándolo de vuelta con exceljs.
 */
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { construirExcelMaestro } from "@/lib/maestro-excel";
import type { FilaMaestro } from "@/db/consultas/maestro";

const FILA: FilaMaestro = {
  codigo: "GTH-PR-01",
  titulo: "Procedimiento de Ingreso",
  tipo: "Procedimiento",
  version: 3,
  estado: "vigente",
  fechaElaboracion: "2025-01-01",
  fechaRevision: "2025-02-01",
  fechaAprobacion: "2025-03-01",
  elaboro: "Ana",
  reviso: "Beto",
  aprobo: "Carla",
  origenAprobacion: "fuera",
  propietario: "Gestión del Talento Humano",
};

async function abrir(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb.worksheets[0];
}

describe("construirExcelMaestro", () => {
  it("incluye encabezado institucional y una fila por documento", async () => {
    const buf = await construirExcelMaestro([FILA], {
      hospital: "ESE Hospital Nuestra Señora de Fátima de Suaza",
      generadoEn: "2026-07-18 10:30",
      alcance: "Documentos vigentes",
      total: 1,
    });
    const hoja = await abrir(buf);
    const textoTodo = JSON.stringify(hoja.getSheetValues());
    expect(textoTodo).toContain("ESE Hospital Nuestra Señora de Fátima de Suaza");
    expect(textoTodo).toContain("Listado Maestro de Documentos");
    expect(textoTodo).toContain("2026-07-18 10:30");
    expect(textoTodo).toContain("GTH-PR-01");
    expect(textoTodo).toContain("Gestión del Talento Humano");
  });

  it("neutraliza la inyección de fórmulas en celdas de texto", async () => {
    const malicioso: FilaMaestro = {
      ...FILA,
      titulo: "=HYPERLINK(\"http://malo\")",
      elaboro: "+cmd",
      propietario: "-2+3",
    };
    const buf = await construirExcelMaestro([malicioso], {
      hospital: "H",
      generadoEn: "x",
      alcance: "Documentos vigentes",
      total: 1,
    });
    const hoja = await abrir(buf);
    const valores = JSON.stringify(hoja.getSheetValues());
    expect(valores).toContain("'=HYPERLINK");
    expect(valores).toContain("'+cmd");
    expect(valores).toContain("'-2+3");
  });

  it("la fila de encabezados de columna trae todas las columnas", async () => {
    const buf = await construirExcelMaestro([FILA], {
      hospital: "H",
      generadoEn: "x",
      alcance: "Todos los documentos",
      total: 1,
    });
    const hoja = await abrir(buf);
    const encabezados = JSON.stringify(hoja.getSheetValues());
    for (const c of ["Código", "Título", "Tipo", "Versión", "Estado", "Elaboró", "Revisó", "Aprobó", "Proceso propietario"])
      expect(encabezados).toContain(c);
  });
});

describe("construirExcelMaestro — origen de la aprobación", () => {
  const META = { hospital: "H", generadoEn: "x", alcance: "Documentos vigentes", total: 3 };

  it("son trece columnas, con «Aprobación» justo después de «Aprobó»", async () => {
    const hoja = await abrir(await construirExcelMaestro([FILA], META));
    const encabezados = (hoja.getRow(6).values as unknown[]).slice(1);
    expect(encabezados).toHaveLength(13);
    expect(encabezados.filter((c) => c === "Aprobación")).toHaveLength(1);
    expect(encabezados.indexOf("Aprobación")).toBe(encabezados.indexOf("Aprobó") + 1);
  });

  it("dice dónde se aprobó cada versión", async () => {
    const filas: FilaMaestro[] = [
      { ...FILA, codigo: "A-FUERA", origenAprobacion: "fuera" },
      { ...FILA, codigo: "B-PLATAFORMA", origenAprobacion: "plataforma" },
      { ...FILA, codigo: "C-SIN", origenAprobacion: null },
    ];
    const hoja = await abrir(await construirExcelMaestro(filas, META));
    expect(hoja.getCell(7, 5).value).toBe("Vigente");                            // como en pantalla
    expect(hoja.getCell(7, 12).value).toBe("Fuera de la plataforma");
    expect(hoja.getCell(8, 12).value).toBe("En la plataforma");
    expect(hoja.getCell(9, 12).value).toBeNull();
  });
});

describe("construirExcelMaestro — encabezado institucional", () => {
  it("neutraliza el nombre de la entidad (viene de la BD) en la primera fila", async () => {
    const buf = await construirExcelMaestro([FILA], {
      hospital: "=HYPERLINK(\"x\")",
      generadoEn: "2026-11-04 10:00",
      alcance: "Documentos vigentes",
      total: 1,
    });
    const hoja = await abrir(buf);
    const a1 = String(hoja.getCell("A1").value);
    expect(a1).not.toMatch(/^=/);
    expect(a1).toBe("'=HYPERLINK(\"x\")");
  });
});
