/**
 * Búsqueda con filtros facetados (Fase 5), contra la BD dev sembrada (D19).
 * Casos de diseño del seed:
 *  - "GTH" como parcial de código debe traer todo talento humano.
 *  - PYM-PR-01 / PYM-FO-01 contienen "Vacunación" (acentos y tipeo).
 *  - SGC-FO-03 (borrador, "Listado Maestro") e GIC-IN-02 (anulado, "Fax")
 *    jamás aparecen en resultados públicos.
 *  - Las versiones heredadas se aprobaron hasta el 2026-03-12; lo publicado por trámite, después
 *    (filtro fechas).
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import {
  buscarDocumentos,
  registrarBusqueda,
} from "@/db/consultas/busqueda";
import { obtenerSql } from "@/db/cliente";
import type { SujetoVisibilidad } from "@/lib/alcance";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

afterAll(async () => {
  await obtenerSql().end();
});

// Estos tests prueban otra cosa que la visibilidad: quien pregunta lo ve todo.
const ADMIN: SujetoVisibilidad = { usuarioId: 0, rol: "admin_sgc", verHistorial: false };

const codigosDe = (r: Awaited<ReturnType<typeof buscarDocumentos>>) =>
  r.resultados.map((d) => d.codigo);

describe("buscarDocumentos — texto libre", () => {
  it("con código parcial 'GTH' trae todos los documentos de talento humano", async () => {
    const r = await buscarDocumentos({ q: "GTH" }, ADMIN);
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
    const conAcento = await buscarDocumentos({ q: "vacunación" }, ADMIN);
    const sinAcento = await buscarDocumentos({ q: "vacunacion" }, ADMIN);
    expect(codigosDe(conAcento).sort()).toEqual(codigosDe(sinAcento).sort());
    expect(codigosDe(conAcento)).toEqual(
      expect.arrayContaining(["PYM-PR-01", "PYM-FO-01"]),
    );
  });

  it("tolera errores de tipeo: 'vacunasion' encuentra los de vacunación", async () => {
    const r = await buscarDocumentos({ q: "vacunasion" }, ADMIN);
    expect(codigosDe(r)).toContain("PYM-PR-01");
  });

  it("jamás devuelve documentos sin versión vigente (regla 3)", async () => {
    // SGC-FO-03 (borrador) es el único "Listado Maestro" del seed.
    const borrador = await buscarDocumentos({ q: "listado maestro" }, ADMIN);
    expect(codigosDe(borrador)).not.toContain("SGC-FO-03");
    // GIC-IN-02 (anulado) es el único "fax".
    const anulado = await buscarDocumentos({ q: "fax" }, ADMIN);
    expect(codigosDe(anulado)).not.toContain("GIC-IN-02");
  });

  it("resalta las coincidencias del término en el título", async () => {
    const r = await buscarDocumentos({ q: "vacunacion" }, ADMIN);
    const pr = r.resultados.find((d) => d.codigo === "PYM-PR-01");
    expect(pr?.tituloResaltado).toContain("⟦");
    expect(pr?.tituloResaltado).toContain("⟧");
  });

  it("sin ningún criterio devuelve vacío sin consultar", async () => {
    const r = await buscarDocumentos({}, ADMIN);
    expect(r.resultados).toEqual([]);
    expect(r.total).toBe(0);
  });
});

describe("buscarDocumentos — filtros combinables", () => {
  it("filtra por tipo: 'GTH' + tipo FO deja solo el formato", async () => {
    const r = await buscarDocumentos({ q: "GTH", tipo: "FO" }, ADMIN);
    expect(codigosDe(r)).toEqual(["GTH-FO-01"]);
  });

  it("filtra por proceso: incluye propios, de subprocesos y secundarios", async () => {
    const r = await buscarDocumentos({ proceso: "gestion-del-talento-humano" }, ADMIN);
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
    }, ADMIN);
    expect(codigosDe(r).sort()).toEqual(["GTH-FO-01", "GTH-PR-01"]);
  });

  it("filtra por rango de fecha de aprobación", async () => {
    const vigentes = await obtenerSql()`SELECT d.codigo, v.fecha_aprobacion::text AS fecha
      FROM documentos d JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'`;
    const deFechas = (cumple: (fecha: string) => boolean) =>
      vigentes.filter((v) => cumple(v.fecha)).map((v) => v.codigo as string).sort();
    const recientes = await buscarDocumentos({ desde: "2026-03-13" }, ADMIN);
    expect(recientes.total).toBeGreaterThan(0);
    expect(codigosDe(recientes).sort()).toEqual(deFechas((f) => f >= "2026-03-13"));
    const antiguos = await buscarDocumentos({ hasta: "2026-03-12" }, ADMIN);
    expect(antiguos.total).toBeGreaterThan(0);
    expect(codigosDe(antiguos).sort()).toEqual(deFechas((f) => f <= "2026-03-12"));
  });

  it("combina texto + proceso + tipo", async () => {
    const r = await buscarDocumentos({
      q: "formato",
      proceso: "sistema-de-gestion-de-calidad",
      tipo: "FO",
    }, ADMIN);
    expect(codigosDe(r).sort()).toEqual(["SGC-FO-01", "SGC-FO-02", "SGC-FO-05", "SGC-FO-06"]);
  });
});

describe("buscarDocumentos — facetas", () => {
  it("cuenta por tipo sobre los resultados del término", async () => {
    const r = await buscarDocumentos({ q: "GTH" }, ADMIN);
    const porSigla = Object.fromEntries(
      r.facetas.tipos.map((f) => [f.clave, f.cantidad]),
    );
    expect(porSigla).toMatchObject({ CA: 1, FO: 1, PR: 2 });
  });

  it("cuenta por proceso sobre los resultados del término", async () => {
    const r = await buscarDocumentos({ q: "GTH" }, ADMIN);
    const gth = r.facetas.procesos.find(
      (f) => f.clave === "gestion-del-talento-humano",
    );
    expect(gth?.cantidad).toBe(4);
  });

  it("la faceta de tipo no se filtra a sí misma (permite cambiar de tipo)", async () => {
    const r = await buscarDocumentos({ q: "GTH", tipo: "FO" }, ADMIN);
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
