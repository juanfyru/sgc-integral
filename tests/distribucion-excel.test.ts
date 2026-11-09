import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { FilaAcuses } from "@/db/consultas/distribucion/acuses";
import type { Copia } from "@/db/consultas/distribucion/copias";
import type { Jornada } from "@/db/consultas/distribucion/jornadas";
import { construirExcelAcuses } from "@/lib/distribucion/acuses-excel";
import { construirExcelCopias } from "@/lib/distribucion/copias-excel";
import { construirExcelSocializaciones } from "@/lib/distribucion/socializaciones-excel";
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

describe("construirExcelSocializaciones", () => {
  const jornada = (o: Partial<Jornada>): Jornada => ({
    id: 3,
    fecha: "2026-11-04",
    modalidad: "presencial",
    facilitador: { id: 2, nombre: "Ana Pérez" },
    observaciones: "Se explicó el cambio",
    asistentesExternos: "Juan Ruiz\nMaría Gómez",
    registradaPor: { id: 2, nombre: "Ana Pérez" },
    creadoEn: new Date("2026-11-04T20:00:00Z"),
    anulada: null,
    versiones: [
      { versionId: 10, codigo: "GTH-PR-02", titulo: "Inducción", version: 2, vigente: true },
      { versionId: 11, codigo: "GTH-FO-01", titulo: "Asistencia", version: 1, vigente: false },
    ],
    versionesOcultas: 0,
    asistentes: [
      { id: 5, nombre: "Carlos Rojas", cargo: "Auxiliar" },
      { id: 6, nombre: "Diana Mora", cargo: null },
    ],
    asistentesCantidad: 2,
    evidencias: [],
    evidenciasCantidad: 1,
    puedeVerEvidencia: true,
    ...o,
  });

  it("lleva las columnas del spec; los nombres de los asistentes solo donde la persona ve la lista", async () => {
    const hoja = await leer(
      await construirExcelSocializaciones(
        [
          jornada({}),
          jornada({
            id: 4,
            modalidad: "reunion_servicio",
            asistentes: [],
            asistentesCantidad: 7,
            asistentesExternos: null,
            evidenciasCantidad: 0,
            observaciones: null,
            puedeVerEvidencia: false,
            versiones: [{ versionId: 10, codigo: "GTH-PR-02", titulo: "Inducción", version: 2, vigente: true }],
            versionesOcultas: 1,
            anulada: { en: new Date("2026-11-05T15:00:00Z"), por: "Admin SGC", motivo: "Se registró dos veces" },
          }),
        ],
        { ...META, periodo: "2026-01-01 a 2026-12-31", total: 2 },
      ),
      "Socializaciones",
    );
    expect(hoja.getCell("A1").value).toBe("ESE Hospital de Prueba");
    expect(hoja.getCell("A2").value).toBe("Jornadas de socialización de documentos");
    expect(hoja.getCell("A4").value).toBe("Periodo: 2026-01-01 a 2026-12-31 — Total: 2");
    expect(hoja.getRow(6).values).toEqual([
      undefined, "Fecha", "Modalidad", "Facilitador", "Documentos", "Asistentes con cuenta", "Nombres de los asistentes",
      "Asistentes sin cuenta", "Evidencia adjunta", "Observaciones", "Estado",
    ]);
    expect(hoja.rowCount).toBe(8);
    expect(hoja.getRow(7).values).toEqual([
      undefined, "2026-11-04", "Presencial", "Ana Pérez", "GTH-PR-02 v2; GTH-FO-01 v1", 2, "Carlos Rojas; Diana Mora", 2, "Sí",
      "Se explicó el cambio", "Vigente",
    ]);
    const sinLista = hoja.getRow(8);
    expect(sinLista.getCell(2).value).toBe("Reunión de servicio");
    expect(sinLista.getCell(4).value).toBe("GTH-PR-02 v2; y 1 documento más");
    expect(sinLista.getCell(5).value).toBe(7);
    // Quien no ve la lista sabe cuántos fueron, nunca quiénes.
    expect(sinLista.getCell(6).value).toBe("Reservada");
    expect(sinLista.getCell(7).value).toBe(0);
    expect(sinLista.getCell(8).value).toBe("No");
    expect(sinLista.getCell(9).value).toBeNull();
    expect(sinLista.getCell(10).value).toBe("Anulada: Se registró dos veces");
  });

  it("cuenta los asistentes sin cuenta por renglón, coma o punto y coma, sin contar los vacíos", async () => {
    const hoja = await leer(
      await construirExcelSocializaciones([jornada({ asistentesExternos: " Juan Ruiz, María Gómez;\n\n  Pedro Díaz  \n" })], {
        ...META,
        periodo: "p",
        total: 1,
      }),
      "Socializaciones",
    );
    expect(hoja.getRow(7).getCell(7).value).toBe(3);
  });

  it("neutraliza las celdas de texto que empiezan por una fórmula", async () => {
    const hoja = await leer(
      await construirExcelSocializaciones(
        [jornada({ facilitador: { id: 2, nombre: "=SUMA(1;2)" }, observaciones: "+cmd", asistentes: [{ id: 5, nombre: "@x", cargo: null }] })],
        { ...META, periodo: "p", total: 1 },
      ),
      "Socializaciones",
    );
    expect(hoja.getRow(7).getCell(3).value).toBe("'=SUMA(1;2)");
    expect(hoja.getRow(7).getCell(6).value).toBe("'@x");
    expect(hoja.getRow(7).getCell(9).value).toBe("'+cmd");
  });
});

describe("construirExcelAcuses sobre construirHoja", () => {
  const fila = (o: Partial<FilaAcuses>): FilaAcuses => ({
    versionId: 1, codigo: "GTH-PR-01", titulo: "Inducción", version: 2, proceso: "Gestión del Talento Humano",
    publicadoEn: new Date("2026-11-20T15:00:00Z"), confirmados: 23, pendientes: 11, porAsistencia: 4, porFirma: 1,
    porcentaje: 68, venceEn: null, ...o,
  });

  /** Lo que se ve de la hoja: anchos, celdas, combinadas, filtro y formato del encabezado, en texto compacto. */
  function huella(hoja: ExcelJS.Worksheet) {
    const filas: string[] = [];
    hoja.eachRow({ includeEmpty: true }, (f, n) => {
      const formato = (f.values as unknown[])
        .slice(1)
        .map((_, i) => {
          const c = f.getCell(i + 1);
          const relleno = c.fill && "fgColor" in c.fill ? (c.fill.fgColor?.argb ?? "") : "";
          return `${relleno}/${c.font?.bold ? "negrita" : ""}/${c.font?.size ?? ""}/${c.font?.color?.argb ?? ""}`;
        })
        .join(" ");
      filas.push(`${n}: ${JSON.stringify((f.values as unknown[]).slice(1))} | ${formato}`);
    });
    return { anchos: hoja.columns.map((c) => c.width ?? null), combinadas: hoja.model.merges, filtro: hoja.autoFilter, filas };
  }

  it("la hoja queda idéntica a la que armaba a mano", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(
      (await construirExcelAcuses([fila({}), fila({ versionId: 2, codigo: "CEX-GU-02", porcentaje: null, publicadoEn: null })], {
        hospital: "ESE Hospital de Prueba", generadoEn: "2026-11-21 08:00", periodo: "2026-01-01 a 2026-12-31", total: 2,
      })) as unknown as ArrayBuffer,
    );
    expect(huella(wb.getWorksheet("Acuses de lectura")!)).toMatchInlineSnapshot(`
      {
        "anchos": [
          16,
          42,
          null,
          32,
          18,
          13,
          12,
          15,
          11,
          12,
        ],
        "combinadas": [
          "A1:J1",
          "A2:J2",
          "A3:J3",
          "A4:J4",
        ],
        "filas": [
          "1: ["ESE Hospital de Prueba","ESE Hospital de Prueba","ESE Hospital de Prueba","ESE Hospital de Prueba","ESE Hospital de Prueba","ESE Hospital de Prueba","ESE Hospital de Prueba","ESE Hospital de Prueba","ESE Hospital de Prueba","ESE Hospital de Prueba"] | /negrita/14/ /negrita/14/ /negrita/14/ /negrita/14/ /negrita/14/ /negrita/14/ /negrita/14/ /negrita/14/ /negrita/14/ /negrita/14/",
          "2: ["Acuses de lectura de documentos","Acuses de lectura de documentos","Acuses de lectura de documentos","Acuses de lectura de documentos","Acuses de lectura de documentos","Acuses de lectura de documentos","Acuses de lectura de documentos","Acuses de lectura de documentos","Acuses de lectura de documentos","Acuses de lectura de documentos"] | /negrita/12/ /negrita/12/ /negrita/12/ /negrita/12/ /negrita/12/ /negrita/12/ /negrita/12/ /negrita/12/ /negrita/12/ /negrita/12/",
          "3: ["Generado: 2026-11-21 08:00","Generado: 2026-11-21 08:00","Generado: 2026-11-21 08:00","Generado: 2026-11-21 08:00","Generado: 2026-11-21 08:00","Generado: 2026-11-21 08:00","Generado: 2026-11-21 08:00","Generado: 2026-11-21 08:00","Generado: 2026-11-21 08:00","Generado: 2026-11-21 08:00"] | /// /// /// /// /// /// /// /// /// ///",
          "4: ["Periodo: 2026-01-01 a 2026-12-31 — Total: 2","Periodo: 2026-01-01 a 2026-12-31 — Total: 2","Periodo: 2026-01-01 a 2026-12-31 — Total: 2","Periodo: 2026-01-01 a 2026-12-31 — Total: 2","Periodo: 2026-01-01 a 2026-12-31 — Total: 2","Periodo: 2026-01-01 a 2026-12-31 — Total: 2","Periodo: 2026-01-01 a 2026-12-31 — Total: 2","Periodo: 2026-01-01 a 2026-12-31 — Total: 2","Periodo: 2026-01-01 a 2026-12-31 — Total: 2","Periodo: 2026-01-01 a 2026-12-31 — Total: 2"] | /// /// /// /// /// /// /// /// /// ///",
          "5: [] | ",
          "6: ["Código","Título","Versión","Proceso","Publicada","Confirmados","Pendientes","Por asistencia","Por firma","Porcentaje"] | FF1B4E8E/negrita//FFFFFFFF FF1B4E8E/negrita//FFFFFFFF FF1B4E8E/negrita//FFFFFFFF FF1B4E8E/negrita//FFFFFFFF FF1B4E8E/negrita//FFFFFFFF FF1B4E8E/negrita//FFFFFFFF FF1B4E8E/negrita//FFFFFFFF FF1B4E8E/negrita//FFFFFFFF FF1B4E8E/negrita//FFFFFFFF FF1B4E8E/negrita//FFFFFFFF",
          "7: ["GTH-PR-01","Inducción",2,"Gestión del Talento Humano","2026-11-20 10:00",23,11,4,1,"68 %"] | /// /// /// /// /// /// /// /// /// ///",
          "8: ["CEX-GU-02","Inducción",2,"Gestión del Talento Humano",null,23,11,4,1] | /// /// /// ///  /// /// /// ///",
        ],
        "filtro": "A6:J6",
      }
    `);
  });
});
