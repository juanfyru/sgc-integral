import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { FilaAcuses } from "@/db/consultas/distribucion/acuses";
import { construirExcelAcuses } from "@/lib/distribucion/acuses-excel";
import { periodoDeAcuses } from "@/lib/distribucion/periodo-acuses";

const fila = (o: Partial<FilaAcuses>): FilaAcuses => ({
  versionId: 1, codigo: "GTH-PR-01", titulo: "Inducción", version: 2, proceso: "Gestión del Talento Humano",
  publicadoEn: new Date("2026-11-20T15:00:00Z"), confirmados: 23, pendientes: 11, porAsistencia: 4, porFirma: 1,
  porcentaje: 68, venceEn: null, ...o,
});

async function leer(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb.getWorksheet("Acuses de lectura")!;
}

describe("construirExcelAcuses", () => {
  it("lleva el encabezado institucional, las columnas y una fila por versión", async () => {
    const hoja = await leer(
      await construirExcelAcuses([fila({}), fila({ versionId: 2, codigo: "CEX-GU-02", porcentaje: null, publicadoEn: null })], {
        hospital: "ESE Hospital de Prueba", generadoEn: "2026-11-21 08:00", periodo: "2026-01-01 a 2026-12-31", total: 2,
      }),
    );
    expect(hoja.getCell("A1").value).toBe("ESE Hospital de Prueba");
    expect(hoja.getCell("A2").value).toBe("Acuses de lectura de documentos");
    expect(hoja.getCell("A3").value).toBe("Generado: 2026-11-21 08:00");
    expect(hoja.getCell("A4").value).toBe("Periodo: 2026-01-01 a 2026-12-31 — Total: 2");
    expect(hoja.getRow(6).values).toEqual([
      undefined, "Código", "Título", "Versión", "Proceso", "Publicada", "Confirmados", "Pendientes", "Por asistencia", "Por firma", "Porcentaje",
    ]);
    expect(hoja.rowCount).toBe(8);
    expect(hoja.getRow(7).getCell(1).value).toBe("GTH-PR-01");
    expect(hoja.getRow(7).getCell(6).value).toBe(23);
    expect(hoja.getRow(7).getCell(10).value).toBe("68 %");
    expect(hoja.getRow(8).getCell(10).value).toBeNull();
    expect(hoja.getRow(8).getCell(5).value).toBeNull();
  });

  it("neutraliza las celdas de texto que empiezan por una fórmula", async () => {
    const hoja = await leer(
      await construirExcelAcuses([fila({ titulo: "=HYPERLINK(\"http://x\")", proceso: "+cmd" })], {
        hospital: "=SUMA(1)", generadoEn: "ahora", periodo: "p", total: 1,
      }),
    );
    expect(hoja.getCell("A1").value).toBe("'=SUMA(1)");
    expect(hoja.getRow(7).getCell(2).value).toBe("'=HYPERLINK(\"http://x\")");
    expect(hoja.getRow(7).getCell(4).value).toBe("'+cmd");
  });
});

describe("periodoDeAcuses", () => {
  it("por defecto es el año en curso y hasta incluye su día", () => {
    const p = periodoDeAcuses({}, new Date("2026-11-07T15:00:00Z"));
    expect([p.desdeTexto, p.hastaTexto]).toEqual(["2026-01-01", "2026-12-31"]);
    expect(p.desde.toISOString()).toBe("2026-01-01T05:00:00.000Z");
    expect(p.hasta.toISOString()).toBe("2027-01-01T05:00:00.000Z");
    expect(p.procesoId).toBeUndefined();
  });

  it("ignora fechas inválidas y un proceso que no es número", () => {
    const p = periodoDeAcuses({ desde: "2026-13-45", hasta: "x", proceso: "abc" }, new Date("2026-11-07T15:00:00Z"));
    expect(p.desdeTexto).toBe("2026-01-01");
    expect(p.procesoId).toBeUndefined();
    expect(periodoDeAcuses({ proceso: "7" }).procesoId).toBe(7);
  });
});
