/**
 * Búsqueda con filtros facetados (Fase 5), contra la BD dev sembrada (D19).
 * Casos de diseño del seed:
 *  - "GTH" como parcial de código debe traer todo talento humano.
 *  - PYM-PR-01 / PYM-FO-01 contienen "Vacunación" (acentos y tipeo).
 *  - SGC-FO-03 (borrador, "Listado Maestro") e GIC-IN-02 (anulado, "Fax")
 *    jamás aparecen en resultados públicos.
 *  - GTH-CA-01 es el único vigente aprobado antes de 2026-03 (filtro fechas).
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import {
  buscarDocumentos,
  registrarBusqueda,
} from "@/db/consultas/busqueda";
import { obtenerSql } from "@/db/cliente";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

afterAll(async () => {
  await obtenerSql().end();
});

const codigosDe = (r: Awaited<ReturnType<typeof buscarDocumentos>>) =>
  r.resultados.map((d) => d.codigo);

describe("buscarDocumentos — texto libre", () => {
  it("con código parcial 'GTH' trae todos los documentos de talento humano", async () => {
    const r = await buscarDocumentos({ q: "GTH" });
    expect(codigosDe(r)).toEqual(
      expect.arrayContaining([
        "GTH-CA-01",
        "GTH-FO-01",
        "GTH-PR-01",
        "GTH-PR-02",
      ]),
    );
    expect(r.total).toBe(r.resultados.length);
  });

  it("es insensible a acentos: 'vacunación' y 'vacunacion' devuelven lo mismo", async () => {
    const conAcento = await buscarDocumentos({ q: "vacunación" });
    const sinAcento = await buscarDocumentos({ q: "vacunacion" });
    expect(codigosDe(conAcento).sort()).toEqual(codigosDe(sinAcento).sort());
    expect(codigosDe(conAcento)).toEqual(
      expect.arrayContaining(["PYM-PR-01", "PYM-FO-01"]),
    );
  });

  it("tolera errores de tipeo: 'vacunasion' encuentra los de vacunación", async () => {
    const r = await buscarDocumentos({ q: "vacunasion" });
    expect(codigosDe(r)).toContain("PYM-PR-01");
  });

  it("jamás devuelve documentos sin versión vigente (regla 3)", async () => {
    // SGC-FO-03 (borrador) es el único "Listado Maestro" del seed.
    const borrador = await buscarDocumentos({ q: "listado maestro" });
    expect(codigosDe(borrador)).not.toContain("SGC-FO-03");
    // GIC-IN-02 (anulado) es el único "fax".
    const anulado = await buscarDocumentos({ q: "fax" });
    expect(codigosDe(anulado)).not.toContain("GIC-IN-02");
  });

  it("resalta las coincidencias del término en el título", async () => {
    const r = await buscarDocumentos({ q: "vacunacion" });
    const pr = r.resultados.find((d) => d.codigo === "PYM-PR-01");
    expect(pr?.tituloResaltado).toContain("⟦");
    expect(pr?.tituloResaltado).toContain("⟧");
  });

  it("sin ningún criterio devuelve vacío sin consultar", async () => {
    const r = await buscarDocumentos({});
    expect(r.resultados).toEqual([]);
    expect(r.total).toBe(0);
  });
});

describe("buscarDocumentos — filtros combinables", () => {
  it("filtra por tipo: 'GTH' + tipo FO deja solo el formato", async () => {
    const r = await buscarDocumentos({ q: "GTH", tipo: "FO" });
    expect(codigosDe(r)).toEqual(["GTH-FO-01"]);
  });

  it("filtra por proceso: incluye propios, de subprocesos y secundarios", async () => {
    const r = await buscarDocumentos({ proceso: "gestion-del-talento-humano" });
    const codigos = codigosDe(r);
    // Propio directo, propios de subprocesos y secundario (SGC-FO-01).
    expect(codigos).toEqual(
      expect.arrayContaining([
        "GTH-CA-01",
        "GTH-PR-01",
        "GTH-PR-02",
        "GTH-FO-01",
        "SGC-FO-01",
      ]),
    );
  });

  it("filtra por subproceso dentro del proceso", async () => {
    const r = await buscarDocumentos({
      proceso: "gestion-del-talento-humano",
      subproceso: "ingreso",
    });
    expect(codigosDe(r).sort()).toEqual(["GTH-FO-01", "GTH-PR-01"]);
  });

  it("filtra por rango de fecha de aprobación", async () => {
    const antiguos = await buscarDocumentos({ hasta: "2026-02-28" });
    expect(codigosDe(antiguos)).toEqual(["GTH-CA-01"]);
    const recientes = await buscarDocumentos({ desde: "2026-03-01" });
    expect(codigosDe(recientes)).not.toContain("GTH-CA-01");
    expect(recientes.total).toBeGreaterThan(0);
  });

  it("combina texto + proceso + tipo", async () => {
    const r = await buscarDocumentos({
      q: "formato",
      proceso: "sistema-de-gestion-de-calidad",
      tipo: "FO",
    });
    expect(codigosDe(r).sort()).toEqual(["SGC-FO-01", "SGC-FO-02"]);
  });
});

describe("buscarDocumentos — facetas", () => {
  it("cuenta por tipo sobre los resultados del término", async () => {
    const r = await buscarDocumentos({ q: "GTH" });
    const porSigla = Object.fromEntries(
      r.facetas.tipos.map((f) => [f.clave, f.cantidad]),
    );
    expect(porSigla).toMatchObject({ CA: 1, FO: 1, PR: 2 });
  });

  it("cuenta por proceso sobre los resultados del término", async () => {
    const r = await buscarDocumentos({ q: "GTH" });
    const gth = r.facetas.procesos.find(
      (f) => f.clave === "gestion-del-talento-humano",
    );
    expect(gth?.cantidad).toBe(4);
  });

  it("la faceta de tipo no se filtra a sí misma (permite cambiar de tipo)", async () => {
    const r = await buscarDocumentos({ q: "GTH", tipo: "FO" });
    const porSigla = Object.fromEntries(
      r.facetas.tipos.map((f) => [f.clave, f.cantidad]),
    );
    // Aunque el listado está filtrado a FO, la faceta sigue mostrando CA y PR.
    expect(porSigla).toMatchObject({ CA: 1, FO: 1, PR: 2 });
  });
});

describe("registrarBusqueda", () => {
  it("guarda término y cantidad de resultados en la tabla busquedas", async () => {
    const termino = "prueba-fase5-registro";
    await registrarBusqueda(termino, 7);
    const sql = obtenerSql();
    const [fila] = await sql`
      SELECT termino, cantidad_resultados FROM busquedas
      WHERE termino = ${termino} ORDER BY id DESC LIMIT 1`;
    expect(fila).toMatchObject({ termino, cantidad_resultados: 7 });
    await sql`DELETE FROM busquedas WHERE termino = ${termino}`;
  });
});
