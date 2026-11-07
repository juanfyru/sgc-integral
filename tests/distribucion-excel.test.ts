import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { Copia } from "@/db/consultas/distribucion/copias";
import { construirExcelCopias } from "@/lib/distribucion/copias-excel";
import { construirExcelVerificaciones } from "@/lib/distribucion/verificaciones-excel";

async function leer(buffer: Buffer, hoja: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb.getWorksheet(hoja)!;
}

const copia = (o: Partial<Copia>): Copia => ({
  id: 7,
  versionId: 1,
  documentoId: 1,
  codigo: "GTH-PR-02",
  titulo: "Inducción",
  version: 2,
  numero: 2,
  punto: { id: 1, nombre: "Urgencias", sede: "Sede principal" },
  responsable: { id: 3, nombre: "Ana Pérez", cargo: null },
  responsableActual: { id: 3, nombre: "Ana Pérez" },
  emitidaPor: { id: 2, nombre: "Admin SGC" },
  emitidaEn: new Date("2026-11-02T15:00:00Z"),
  estado: "por_recoger",
  nota: null,
  hashPrincipal: "h",
  reemplazaCopiaId: 4,
  versionVigente: false,
  venceEn: null,
  fechas: { recibidaEn: new Date("2026-11-03T15:00:00Z"), porRecogerEn: new Date("2026-11-05T15:00:00Z"), recogidaEn: null, anuladaEn: null },
  motivoPorRecoger: "nueva_version",
  destinoRecogida: null,
  motivoAnulacion: null,
  ...o,
});

const META = { hospital: "ESE Hospital de Prueba", generadoEn: "2026-11-21 08:00" };

describe("construirExcelCopias", () => {
  it("lleva las columnas del brief y una fila por copia", async () => {
    const hoja = await leer(
      await construirExcelCopias([copia({}), copia({ id: 8, numero: 3, estado: "recogida", destinoRecogida: "devuelta", reemplazaCopiaId: null })], {
        ...META,
        filtro: "Estado: todas",
        total: 2,
        reemplazos: new Map([[4, "N.º 01 de GTH-PR-02 v1"]]),
      }),
      "Copias controladas",
    );
    expect(hoja.getCell("A1").value).toBe("ESE Hospital de Prueba");
    expect(hoja.getCell("A4").value).toBe("Estado: todas — Total: 2");
    expect(hoja.getRow(6).values).toEqual([
      undefined, "Número", "Documento", "Versión", "Punto", "Sede", "Entregada a", "Emitida por", "Emitida el", "Estado",
      "Recibida el", "Por recoger desde", "Recogida el", "Destino", "Reemplaza a",
    ]);
    const f1 = hoja.getRow(7);
    expect(f1.getCell(1).value).toBe("02");
    expect(f1.getCell(2).value).toBe("GTH-PR-02 Inducción");
    expect(f1.getCell(3).value).toBe(2);
    expect(f1.getCell(4).value).toBe("Urgencias");
    expect(f1.getCell(9).value).toBe("Por recoger");
    expect(f1.getCell(12).value).toBeNull();
    expect(f1.getCell(14).value).toBe("N.º 01 de GTH-PR-02 v1");
    const f2 = hoja.getRow(8);
    expect(f2.getCell(9).value).toBe("Recogida");
    expect(f2.getCell(13).value).toBe("Devuelta al SGC");
    expect(f2.getCell(14).value).toBeNull();
  });

  it("neutraliza las celdas de texto que empiezan por una fórmula", async () => {
    const hoja = await leer(
      await construirExcelCopias([copia({ punto: { id: 1, nombre: "=SUMA(1;2)", sede: "+cmd" }, emitidaPor: { id: 2, nombre: "@x" } })], {
        ...META,
        hospital: "=SUMA(1)",
        filtro: "f",
        total: 1,
      }),
      "Copias controladas",
    );
    expect(hoja.getCell("A1").value).toBe("'=SUMA(1)");
    expect(hoja.getRow(7).getCell(4).value).toBe("'=SUMA(1;2)");
    expect(hoja.getRow(7).getCell(5).value).toBe("'+cmd");
    expect(hoja.getRow(7).getCell(7).value).toBe("'@x");
  });
});

describe("construirExcelVerificaciones", () => {
  const fila = (o: Partial<Parameters<typeof construirExcelVerificaciones>[0][number]>) => ({
    punto: "Farmacia",
    sede: "Sede principal",
    cerradaEn: new Date("2026-11-10T15:00:00Z"),
    verificoNombre: "Admin SGC",
    conforme: false,
    itemsConformes: 5,
    itemsTotal: 6,
    hallazgosAbiertos: 1,
    propioPunto: false,
    ...o,
  });

  it("lleva las columnas y una fila por verificación", async () => {
    const hoja = await leer(
      await construirExcelVerificaciones([fila({}), fila({ conforme: true, propioPunto: true, itemsConformes: 6, hallazgosAbiertos: 0 })], {
        ...META,
        periodo: "2026-01-01 a 2026-12-31",
        total: 2,
      }),
      "Verificaciones",
    );
    expect(hoja.getCell("A4").value).toBe("Periodo: 2026-01-01 a 2026-12-31 — Total: 2");
    expect(hoja.getRow(6).values).toEqual([
      undefined, "Punto", "Sede", "Cerrada el", "Verificó", "Resultado", "Ítems conformes", "Ítems verificados", "Hallazgos abiertos", "Propio punto",
    ]);
    expect(hoja.getRow(7).getCell(5).value).toBe("No conforme");
    expect(hoja.getRow(7).getCell(6).value).toBe(5);
    expect(hoja.getRow(7).getCell(9).value).toBe("No");
    expect(hoja.getRow(8).getCell(5).value).toBe("Conforme");
    expect(hoja.getRow(8).getCell(9).value).toBe("Sí");
  });

  it("neutraliza las celdas de texto que empiezan por una fórmula", async () => {
    const hoja = await leer(
      await construirExcelVerificaciones([fila({ punto: "=SUMA(1;2)", verificoNombre: "-1+1" })], { ...META, periodo: "p", total: 1 }),
      "Verificaciones",
    );
    expect(hoja.getRow(7).getCell(1).value).toBe("'=SUMA(1;2)");
    expect(hoja.getRow(7).getCell(4).value).toBe("'-1+1");
  });
});
