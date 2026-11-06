/**
 * Regla de negocio 3: el endpoint público JAMÁS sirve archivos de versiones
 * no vigentes (borradores, obsoletos, anulados). Se prueba la consulta real
 * contra la BD dev sembrada (D19), con los casos que el seed trae a propósito:
 *   SGC-FO-03 → solo borrador, GIC-IN-02 → anulado, GTH-CA-01 → v1 obsoleta.
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { obtenerArchivoVigente } from "@/db/consultas/documentos";
import { obtenerSql } from "@/db/cliente";
import type { SujetoVisibilidad } from "@/lib/alcance";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

// Estos tests prueban otra cosa que la visibilidad: quien pregunta lo ve todo.
const ADMIN: SujetoVisibilidad = { usuarioId: 0, rol: "admin_sgc", verHistorial: false };

async function idArchivo(codigo: string, numeroVersion: number) {
  const sql = obtenerSql();
  const [fila] = await sql`
    SELECT a.id
    FROM archivos a
    JOIN documento_versiones v ON v.id = a.version_id
    JOIN documentos d ON d.id = v.documento_id
    WHERE d.codigo = ${codigo} AND v.numero = ${numeroVersion}
      AND a.rol = 'principal'`;
  expect(fila, `archivo principal de ${codigo} v${numeroVersion}`).toBeDefined();
  return fila.id as number;
}

afterAll(async () => {
  await obtenerSql().end();
});

describe("obtenerArchivoVigente — solo versiones vigentes al público", () => {
  it("devuelve el archivo principal de un documento vigente", async () => {
    const id = await idArchivo("SGC-MN-01", 1);
    const archivo = await obtenerArchivoVigente("sgc-mn-01", id, ADMIN);
    expect(archivo).not.toBeNull();
    expect(archivo?.mime).toBe("application/pdf");
    expect(archivo?.ruta).toContain("SGC-MN-01/v1/");
  });

  it("NO devuelve el archivo de un borrador (SGC-FO-03)", async () => {
    const id = await idArchivo("SGC-FO-03", 1);
    expect(await obtenerArchivoVigente("sgc-fo-03", id, ADMIN)).toBeNull();
  });

  it("NO devuelve el archivo de un documento anulado (GIC-IN-02)", async () => {
    const id = await idArchivo("GIC-IN-02", 1);
    expect(await obtenerArchivoVigente("gic-in-02", id, ADMIN)).toBeNull();
  });

  it("NO devuelve el archivo de la versión obsoleta (GTH-CA-01 v1)", async () => {
    const id = await idArchivo("GTH-CA-01", 1);
    expect(await obtenerArchivoVigente("gth-ca-01", id, ADMIN)).toBeNull();
  });

  it("sí devuelve la versión vigente del mismo documento (GTH-CA-01 v3)", async () => {
    const id = await idArchivo("GTH-CA-01", 3);
    const archivo = await obtenerArchivoVigente("gth-ca-01", id, ADMIN);
    expect(archivo).not.toBeNull();
    expect(archivo?.ruta).toContain("/v3/");
  });

  it("NO devuelve un archivo si el código del documento no corresponde", async () => {
    // Un id válido bajo el código de OTRO documento no debe filtrarse.
    const id = await idArchivo("SGC-MN-01", 1);
    expect(await obtenerArchivoVigente("sgc-ca-01", id, ADMIN)).toBeNull();
  });
});
