/**
 * Esquema de la Fase 13B (migración 0006): distribución, puntos de uso, acuses,
 * jornadas y verificaciones. Requiere la BD de desarrollo migrada
 * (npm run db:preparar).
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

describe("esquema de la Fase 13B", () => {
  let sql: Sql;

  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, types: TIPOS_SQL });
  });
  afterAll(async () => {
    await sql.end();
  });

  it("archivos: las filas heredadas son de versión y un contexto nuevo exige contexto_id", () =>
    revertida(sql, async (tx) => {
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM archivos WHERE contexto <> 'version' OR version_id IS NULL`;
      expect(n).toBe(0);
      const insertar = (contexto: string, versionId: number | null, contextoId: number | null, ruta: string) =>
        tx.savepoint(
          (s) => s`INSERT INTO archivos (version_id, contexto, contexto_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
            VALUES (${versionId}, ${contexto}, ${contextoId}, 'evidencia', ${ruta}, 'acta.pdf', 'pdf', 'application/pdf', 10, 'x')`,
        );
      await insertar("jornada", null, 1, "zz/j1.pdf");
      expect(await fallaCon(insertar("jornada", 1, 1, "zz/j2.pdf"))).toBe("23514");
      expect(await fallaCon(insertar("version", null, null, "zz/j3.pdf"))).toBe("23514");
      expect(await fallaCon(insertar("otro", null, 1, "zz/j4.pdf"))).toBe("23514");
    }));

  it("un solo acuse vivo por versión y persona; los cerrados no cuentan", () =>
    revertida(sql, async (tx) => {
      const [v] = await tx`SELECT id FROM documento_versiones LIMIT 1`;
      const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
      const crear = (estado: string) =>
        tx.savepoint(
          (s) => s`INSERT INTO acuses (version_id, usuario_id, origen, estado, vence_en) VALUES (${v.id}, ${u.id}, 'publicacion', ${estado}, now())`,
        );
      await crear("retirado");
      await crear("pendiente");
      expect(await fallaCon(crear("confirmado"))).toBe("23505");
    }));

  it("una verificación cerrada y sus ítems no se modifican, ni para el dueño", () =>
    revertida(sql, async (tx) => {
      const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
      const [p] = await tx`INSERT INTO puntos_uso (nombre, responsable_id) VALUES ('zz_punto', ${u.id}) RETURNING id`;
      const [v] = await tx`INSERT INTO verificaciones (punto_uso_id, abierta_por, abierta_en, punto_nombre, responsable_id, responsable_nombre)
        VALUES (${p.id}, ${u.id}, now(), 'zz_punto', ${u.id}, 'Alguien') RETURNING id`;
      const [i] = await tx`INSERT INTO verificacion_items (verificacion_id, orden, origen, texto) VALUES (${v.id}, 1, 'fijo', 'Sin obsoletos') RETURNING id`;
      await tx`UPDATE verificacion_items SET respuesta = 'conforme' WHERE id = ${i.id}`; // abierta: se puede
      await tx`UPDATE verificaciones SET estado = 'cerrada', cerrada_en = now(), conforme = true WHERE id = ${v.id}`;
      expect(await fallaCon(tx.savepoint((s) => s`UPDATE verificacion_items SET nota = 'x' WHERE id = ${i.id}`))).toBe("42501");
      expect(await fallaCon(tx.savepoint((s) => s`DELETE FROM verificacion_items WHERE id = ${i.id}`))).toBe("42501");
      expect(await fallaCon(tx.savepoint((s) => s`UPDATE verificaciones SET conforme = false WHERE id = ${v.id}`))).toBe("42501");
    }));

  it("una sola verificación abierta por punto; una copia por número y versión", () =>
    revertida(sql, async (tx) => {
      const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
      const [ver] = await tx`SELECT id FROM documento_versiones ORDER BY id LIMIT 1`;
      const [p] = await tx`INSERT INTO puntos_uso (nombre, responsable_id) VALUES ('zz_punto_u', ${u.id}) RETURNING id`;
      const abrir = (estado: string) =>
        tx.savepoint(
          (s) => s`INSERT INTO verificaciones (punto_uso_id, estado, abierta_por, abierta_en, punto_nombre, responsable_id, responsable_nombre)
            VALUES (${p.id}, ${estado}, ${u.id}, now(), 'zz_punto_u', ${u.id}, 'Alguien')`,
        );
      await abrir("abierta");
      expect(await fallaCon(abrir("abierta"))).toBe("23505");
      await abrir("descartada"); // las cerradas o descartadas no cuentan
      const copiar = (numero: number) =>
        tx.savepoint(
          (s) => s`INSERT INTO copias_controladas (version_id, numero, punto_uso_id, responsable_id, responsable_nombre, emitida_por, hash_principal, emitida_en)
            VALUES (${ver.id}, ${numero}, ${p.id}, ${u.id}, 'Alguien', ${u.id}, 'x', now())`,
        );
      await copiar(1);
      expect(await fallaCon(copiar(1))).toBe("23505");
      await copiar(2);
    }));
});
