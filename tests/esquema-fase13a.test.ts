/**
 * Esquema de la Fase 13A (migración 0004): trámites, firmas y restricciones del
 * flujo. Requiere la BD de desarrollo migrada (npm run db:preparar).
 */
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import postgres from "postgres";
import { TIPOS_SQL } from "@/db/cliente";
import { revertida } from "./utiles/transaccion";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const fallaCon = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { code?: string }) => e.code ?? "sin-codigo",
  );

describe("esquema de la Fase 13A", () => {
  let sql: Sql;

  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, types: TIPOS_SQL });
  });
  afterAll(async () => {
    await sql.end();
  });

  it("los valores por defecto describen lo heredado", async () => {
    const filas = await sql`SELECT table_name || '.' || column_name AS columna, column_default FROM information_schema.columns
      WHERE (table_name, column_name) IN (('tipos_documento', 'autoridad'), ('documentos', 'nivel_acceso'), ('documento_versiones', 'origen_aprobacion'))
      ORDER BY 1`;
    expect(filas.map((f) => `${f.columna}=${String(f.column_default).split("::")[0]}`)).toEqual([
      "documento_versiones.origen_aprobacion='fuera'",
      "documentos.nivel_acceso='general'",
      "tipos_documento.autoridad='operativo'",
    ]);
  });

  it("una versión descartada libera su número", () =>
    revertida(sql, async (tx) => {
      const [d] = await tx`SELECT documento_id AS id, max(numero) + 1 AS n FROM documento_versiones GROUP BY documento_id LIMIT 1`;
      const insertar = (estado: string) =>
        tx.savepoint(
          (s) => s`INSERT INTO documento_versiones (documento_id, numero, estado) VALUES (${d.id}, ${d.n}, ${estado})`,
        );
      await insertar("descartado");
      await insertar("borrador");
      expect(await fallaCon(insertar("borrador"))).toBe("23505");
    }));

  it("un solo trámite abierto por documento", () =>
    revertida(sql, async (tx) => {
      const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
      const [d] = await tx`SELECT d.id, COALESCE(dp.proceso_id, s.proceso_id) AS proceso_id FROM documentos d
        JOIN documento_proceso dp ON dp.documento_id = d.id AND dp.es_principal
        LEFT JOIN subprocesos s ON s.id = dp.subproceso_id LIMIT 1`;
      const crear = (consecutivo: number, etapa: string) =>
        tx.savepoint(
          (s) => s`INSERT INTO tramites (numero, anio, consecutivo, tipo, motivo, justificacion, solicitante_id, proceso_id, documento_id, etapa)
            VALUES (${`SOL-9999-${consecutivo}`}, 9999, ${consecutivo}, 'modificar', 'mejora', 'prueba', ${u.id}, ${d.proceso_id}, ${d.id}, ${etapa})`,
        );
      await crear(1, "publicado");
      await crear(2, "elaboracion");
      expect(await fallaCon(crear(3, "revision"))).toBe("23505");
    }));

  it("los CHECK nuevos aceptan y rechazan lo debido", () =>
    revertida(sql, async (tx) => {
      const [v] = await tx`SELECT id FROM documento_versiones LIMIT 1`;
      const acta = (rol: string, ruta: string) =>
        tx.savepoint(
          (s) => s`INSERT INTO archivos (version_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
            VALUES (${v.id}, ${rol}, ${ruta}, 'acta.pdf', 'pdf', 'application/pdf', 10, 'x')`,
        );
      await acta("acta_aprobacion", "zz/acta-1.pdf");
      expect(await fallaCon(acta("acta_aprobacion", "zz/acta-2.pdf"))).toBe("23505");
      expect(await fallaCon(acta("acta", "zz/acta-3.pdf"))).toBe("23514");
      expect(await fallaCon(tx.savepoint((s) => s`UPDATE tipos_documento SET autoridad = 'otra'`))).toBe("23514");
      await tx`INSERT INTO accesos (usuario_texto, resultado) VALUES ('zz_esquema13a', 'firma_fallo')`;
    }));
});
