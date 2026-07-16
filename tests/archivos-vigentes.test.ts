/**
 * Regla de negocio 3: el endpoint público JAMÁS sirve archivos de versiones
 * no vigentes (borradores, obsoletos, anulados). Se prueba la consulta real
 * contra la BD dev sembrada (D19), con los casos que el seed trae a propósito:
 *   FT-CAL-003 → solo borrador, IN-GIC-002 → anulado, CA-GTH-001 → v1 obsoleta.
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { obtenerArchivoVigente } from "@/db/consultas/documentos";
import { obtenerSql } from "@/db/cliente";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

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
    const id = await idArchivo("MN-CAL-001", 1);
    const archivo = await obtenerArchivoVigente("mn-cal-001", id);
    expect(archivo).not.toBeNull();
    expect(archivo?.mime).toBe("application/pdf");
    expect(archivo?.ruta).toContain("MN-CAL-001/v1/");
  });

  it("NO devuelve el archivo de un borrador (FT-CAL-003)", async () => {
    const id = await idArchivo("FT-CAL-003", 1);
    expect(await obtenerArchivoVigente("ft-cal-003", id)).toBeNull();
  });

  it("NO devuelve el archivo de un documento anulado (IN-GIC-002)", async () => {
    const id = await idArchivo("IN-GIC-002", 1);
    expect(await obtenerArchivoVigente("in-gic-002", id)).toBeNull();
  });

  it("NO devuelve el archivo de la versión obsoleta (CA-GTH-001 v1)", async () => {
    const id = await idArchivo("CA-GTH-001", 1);
    expect(await obtenerArchivoVigente("ca-gth-001", id)).toBeNull();
  });

  it("sí devuelve la versión vigente del mismo documento (CA-GTH-001 v2)", async () => {
    const id = await idArchivo("CA-GTH-001", 2);
    const archivo = await obtenerArchivoVigente("ca-gth-001", id);
    expect(archivo).not.toBeNull();
    expect(archivo?.ruta).toContain("/v2/");
  });

  it("NO devuelve un archivo si el código del documento no corresponde", async () => {
    // Un id válido bajo el código de OTRO documento no debe filtrarse.
    const id = await idArchivo("MN-CAL-001", 1);
    expect(await obtenerArchivoVigente("ca-cal-001", id)).toBeNull();
  });
});
