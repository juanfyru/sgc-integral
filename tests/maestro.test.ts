/**
 * Listado Maestro (Fase 8) contra la BD dev sembrada: una fila por documento
 * por su asociación principal (D6), vigentes por defecto, propietario resuelto
 * desde proceso o subproceso, e `incluir:'todos'` que agrega los sin vigente.
 */
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");
import { obtenerSql } from "@/db/cliente";
import { obtenerListadoMaestro } from "@/db/consultas/maestro";

const sql = () => obtenerSql();
let tipoId: number, procesoId: number, subprocesoId: number, procesoDelSub: string;

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
});
afterAll(async () => {
  await limpiar();
  await sql().end();
});

describe("obtenerListadoMaestro", () => {
  it("solo vigentes por defecto, una fila por documento", async () => {
    const filas = await obtenerListadoMaestro({ incluir: "vigentes" });
    const mios = filas.filter((f) => f.codigo.startsWith("ZZ-MST-"));
    expect(mios.map((f) => f.codigo).sort()).toEqual(["ZZ-MST-001", "ZZ-MST-002"]);
    expect(mios.filter((f) => f.codigo === "ZZ-MST-001")).toHaveLength(1);
  });

  it("resuelve el propietario desde subproceso", async () => {
    const filas = await obtenerListadoMaestro({ incluir: "vigentes" });
    const sub = filas.find((f) => f.codigo === "ZZ-MST-002")!;
    expect(sub.propietario).toContain(procesoDelSub);
    expect(sub.version).toBe(1);
    expect(sub.aprobo).toBe("Dir. Calidad");
  });

  it("incluir:'todos' agrega los que no tienen vigente", async () => {
    const filas = await obtenerListadoMaestro({ incluir: "todos" });
    const codigos = filas.map((f) => f.codigo);
    expect(codigos).toContain("ZZ-MST-003");
    const borr = filas.find((f) => f.codigo === "ZZ-MST-003")!;
    expect(borr.estado).toBe("borrador");
  });
});
