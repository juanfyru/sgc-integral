/**
 * Listado Maestro (Fase 8) contra la BD dev sembrada: una fila por documento
 * por su asociación principal (D6), vigentes por defecto, propietario resuelto
 * desde proceso o subproceso, e `incluir:'todos'` que agrega los sin vigente
 * que tienen historial (un borrador o una versión descartada no lo son).
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");
import { obtenerSql } from "@/db/cliente";
import { obtenerListadoMaestro } from "@/db/consultas/maestro";
import { revertida } from "./utiles/transaccion";
import { sinFechaDeRevision, vigenteFuera } from "./utiles/vigencia";

const sql = () => obtenerSql();
let tipoId: number, procesoId: number, subprocesoId: number, procesoDelSub: string;
let almacen: string;
const previoAlmacen = process.env.ALMACEN_RUTA;
const ahora = new Date("2026-11-08T15:00:00Z");

async function limpiar() {
  await sql()`DELETE FROM documento_proceso WHERE documento_id IN
    (SELECT id FROM documentos WHERE codigo LIKE 'ZZ-MST-%')`;
  await sql()`DELETE FROM documento_versiones WHERE documento_id IN
    (SELECT id FROM documentos WHERE codigo LIKE 'ZZ-MST-%')`;
  await sql()`DELETE FROM documentos WHERE codigo LIKE 'ZZ-MST-%'`;
}

async function crearDoc(codigo: string, estado: string, asoc: "proceso" | "subproceso") {
  const [d] = await sql()`INSERT INTO documentos (codigo, titulo, tipo_id)
    VALUES (${codigo}, ${"Título " + codigo}, ${tipoId}) RETURNING id`;
  await sql()`INSERT INTO documento_versiones
      (documento_id, numero, estado, fecha_elaboracion, aprobo, fecha_aprobacion)
    VALUES (${d.id}, 1, ${estado}, '2026-01-01'
      ${estado === "vigente" ? sql()`, 'Dir. Calidad', '2026-01-10'` : sql()`, NULL, NULL`})`;
  if (asoc === "proceso")
    await sql()`INSERT INTO documento_proceso (documento_id, proceso_id, es_principal)
      VALUES (${d.id}, ${procesoId}, true)`;
  else
    await sql()`INSERT INTO documento_proceso (documento_id, subproceso_id, es_principal)
      VALUES (${d.id}, ${subprocesoId}, true)`;
  return d.id as number;
}

beforeAll(async () => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-maestro-"));
  process.env.ALMACEN_RUTA = almacen;
  await limpiar();
  [{ id: tipoId }] = await sql()`SELECT id FROM tipos_documento WHERE activo LIMIT 1`;
  [{ id: procesoId }] = await sql()`SELECT id FROM procesos WHERE activo LIMIT 1`;
  const [s] = await sql()`SELECT s.id, p.nombre AS proceso FROM subprocesos s
    JOIN procesos p ON p.id = s.proceso_id WHERE s.activo LIMIT 1`;
  subprocesoId = s.id;
  procesoDelSub = s.proceso;
  await crearDoc("ZZ-MST-001", "vigente", "proceso");
  await crearDoc("ZZ-MST-002", "vigente", "subproceso");
  await crearDoc("ZZ-MST-003", "borrador", "proceso");
  await crearDoc("ZZ-MST-004", "anulado", "proceso");
  await crearDoc("ZZ-MST-005", "descartado", "proceso");
  await crearDoc("ZZ-MST-006", "obsoleto", "subproceso");
});
afterAll(async () => {
  if (previoAlmacen === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previoAlmacen;
  rmSync(almacen, { recursive: true, force: true });
  await limpiar();
  await sql().end();
  globalThis.__sql = undefined;
});

describe("obtenerListadoMaestro", () => {
  it("solo vigentes por defecto, una fila por documento", async () => {
    const filas = await obtenerListadoMaestro({ incluir: "vigentes" });
    const mios = filas.filter((f) => f.codigo.startsWith("ZZ-MST-"));
    expect(mios.map((f) => f.codigo).sort()).toEqual(["ZZ-MST-001", "ZZ-MST-002"]);
    expect(mios.filter((f) => f.codigo === "ZZ-MST-001")).toHaveLength(1);
  });

  it("trae el origen de la aprobación de la versión que representa al documento", async () => {
    await sql()`UPDATE documento_versiones SET origen_aprobacion = 'plataforma'
      WHERE documento_id = (SELECT id FROM documentos WHERE codigo = 'ZZ-MST-002')`;
    const filas = await obtenerListadoMaestro({ incluir: "todos" });
    const origen = (codigo: string) => filas.find((f) => f.codigo === codigo)?.origenAprobacion;
    expect(origen("ZZ-MST-001")).toBe("fuera");
    expect(origen("ZZ-MST-002")).toBe("plataforma");
    expect(origen("ZZ-MST-004")).toBe("fuera");
  });

  it("resuelve el propietario desde subproceso", async () => {
    const filas = await obtenerListadoMaestro({ incluir: "vigentes" });
    const sub = filas.find((f) => f.codigo === "ZZ-MST-002")!;
    expect(sub.propietario).toContain(procesoDelSub);
    expect(sub.version).toBe(1);
    expect(sub.aprobo).toBe("Dir. Calidad");
  });

  it("incluir:'todos' agrega los que no tienen vigente pero sí historial", async () => {
    const filas = await obtenerListadoMaestro({ incluir: "todos" });
    expect(filas.find((f) => f.codigo === "ZZ-MST-004")?.estado).toBe("anulado");
    expect(filas.find((f) => f.codigo === "ZZ-MST-006")?.estado).toBe("obsoleto");
  });

  it("incluir:'todos' no lista el documento que solo tiene borrador o versión descartada", async () => {
    const codigos = (await obtenerListadoMaestro({ incluir: "todos" })).map((f) => f.codigo);
    expect(codigos).not.toContain("ZZ-MST-003");
    expect(codigos).not.toContain("ZZ-MST-005");
  });

  it("un borrador nunca representa al documento, aunque sea la versión de mayor número", async () => {
    const [{ id }] = await sql()`SELECT id FROM documentos WHERE codigo = 'ZZ-MST-004'`;
    await sql()`INSERT INTO documento_versiones (documento_id, numero, estado, fecha_elaboracion)
      VALUES (${id}, 2, 'borrador', '2026-02-01')`;
    const fila = (await obtenerListadoMaestro({ incluir: "todos" })).find((f) => f.codigo === "ZZ-MST-004")!;
    expect(fila.estado).toBe("anulado");
    expect(fila.version).toBe(1);
  });
});

describe("obtenerListadoMaestro — vigencia (Fase 13C)", () => {
  it("trae el origen, la edición, la última y la próxima revisión y el estado de vigencia", () =>
    revertida(sql(), async (tx) => {
      const d = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14" });
      const fila = (await obtenerListadoMaestro({ incluir: "vigentes", sql: tx, ahora })).find((f) => f.codigo === d.codigo)!;
      expect(fila).toMatchObject({
        origen: "interno",
        edicion: null,
        ultimaRevision: "2025-08-14",
        proximaRevision: "2026-08-14",
        vigencia: "vencida",
      });
    }));

  it("un vigente sin fecha de revisión sale en atención, nunca al día", () =>
    revertida(sql(), async (tx) => {
      const d = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14" });
      await sinFechaDeRevision(tx, d);
      const fila = (await obtenerListadoMaestro({ incluir: "vigentes", sql: tx, ahora })).find((f) => f.codigo === d.codigo)!;
      expect(fila).toMatchObject({ ultimaRevision: null, proximaRevision: null, vigencia: "atencion" });
    }));

  it("en «todos», lo que no tiene versión vigente no tiene semáforo", async () => {
    const fila = (await obtenerListadoMaestro({ incluir: "todos", ahora })).find((f) => f.codigo === "ZZ-MST-004")!;
    expect(fila).toMatchObject({ estado: "anulado", origen: "interno", ultimaRevision: null, proximaRevision: null, vigencia: null });
    const vigente = (await obtenerListadoMaestro({ incluir: "todos", ahora })).find((f) => f.codigo === "ZZ-MST-001")!;
    expect(vigente.vigencia).not.toBeNull();
  });
});
