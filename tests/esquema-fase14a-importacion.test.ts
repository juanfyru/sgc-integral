/**
 * Esquema de la entrega 14A de rangos e importación (migración 0012): rangos del semáforo, `cumple`,
 * sigla de subprocesos, lotes de importación y la excepción estrecha del trigger para deshacer un lote.
 * Nada queda confirmado: todo corre dentro de una transacción que se revierte.
 */
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql, TransactionSql } from "postgres";
import postgres from "postgres";
import { TIPOS_SQL } from "@/db/cliente";
import { revertida } from "./utiles/transaccion";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const fallaCon = (p: PromiseLike<unknown>) =>
  Promise.resolve(p).then(
    () => null,
    (e: { code?: string }) => e.code ?? "sin-codigo",
  );

/** Corre la consulta en un savepoint para que su fallo no aborte la transacción de la prueba. */
async function intentar(tx: TransactionSql, consulta: () => PromiseLike<unknown>) {
  await tx`SAVEPOINT intento`;
  const codigo = await fallaCon(consulta());
  if (codigo) await tx`ROLLBACK TO SAVEPOINT intento`;
  else await tx`RELEASE SAVEPOINT intento`;
  return codigo;
}

async function base(tx: TransactionSql) {
  const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
  const [p] = await tx`SELECT id FROM procesos ORDER BY id LIMIT 1`;
  const codigo = `zz-imp-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const [i] = await tx`INSERT INTO indicadores (codigo, proceso_id, creado_por) VALUES (${codigo}, ${p.id}, ${u.id}) RETURNING id`;
  return { usuarioId: u.id as number, indicadorId: i.id as number };
}

/** Una versión aprobada, con o sin lote de importación, y una variable. */
async function versionAprobada(tx: TransactionSql, importada: boolean) {
  const { usuarioId, indicadorId } = await base(tx);
  let importacionId: number | null = null;
  if (importada) {
    const [l] = await tx`INSERT INTO importaciones_indicadores (cargado_por) VALUES (${usuarioId}) RETURNING id`;
    importacionId = l.id as number;
  }
  const [v] = await tx`INSERT INTO indicador_versiones (indicador_id, numero, tipo_cambio, creado_por, importacion_id)
    VALUES (${indicadorId}, 1, 'inicial', ${usuarioId}, ${importacionId}) RETURNING id`;
  await tx`INSERT INTO indicador_variables (version_id, letra, nombre) VALUES (${v.id}, 'A', 'Variable')`;
  await tx`UPDATE indicador_versiones SET estado = 'aprobada', elaborada_por = ${usuarioId}, aprobada_por = ${usuarioId},
    huella = 'abc', rige_desde = '2026-01', aprobacion_previa_documento = 'Acta 1', aprobacion_previa_por = 'Comité',
    aprobacion_previa_fecha = '2026-01-15' WHERE id = ${v.id}`;
  return { usuarioId, versionId: v.id as number, importacionId };
}

describe("esquema de la migración 0012", () => {
  let sql: Sql;

  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, types: TIPOS_SQL });
  });
  afterAll(async () => {
    await sql.end();
  });

  it("las columnas y tablas nuevas existen", async () => {
    const cols = await sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`;
    const tiene = (t: string, c: string) => cols.some((f) => f.table_name === t && f.column_name === c);
    for (const c of ["rangos", "nivel", "riesgo_asociado", "importacion_id", "aprobacion_previa_documento", "aprobacion_previa_por", "aprobacion_previa_fecha"]) {
      expect(tiene("indicador_versiones", c), c).toBe(true);
    }
    expect(tiene("mediciones", "cumple")).toBe(true);
    expect(tiene("subprocesos", "sigla")).toBe(true);
    for (const c of ["id", "cargado_por", "cargado_en"]) expect(tiene("importaciones_indicadores", c), c).toBe(true);
    for (const c of ["id", "importacion_id", "tipo", "usuario_id", "metodo", "detalle", "creado_en"]) {
      expect(tiene("importacion_eventos", c), c).toBe(true);
    }
  });

  it("el modo «rangos» exige rangos y viceversa", () =>
    revertida(sql, async (tx) => {
      const { usuarioId, indicadorId } = await base(tx);
      const crear = (numero: number, modo: string, rangos: unknown) =>
        intentar(
          tx,
          () => tx`INSERT INTO indicador_versiones (indicador_id, numero, tipo_cambio, creado_por, semaforo_modo, rangos, estado)
            VALUES (${indicadorId}, ${numero}, 'inicial', ${usuarioId}, ${modo}, ${rangos === null ? null : tx.json(rangos as never)}, 'descartada')`,
        );
      expect(await crear(1, "rangos", null)).toBe("23514");
      expect(await crear(2, "relativo", [{ a: 1 }])).toBe("23514");
      expect(await crear(3, "rangos", [{ a: 1 }])).toBeNull();
      expect(await crear(4, "relativo", null)).toBeNull();
    }));

  it("una versión importada y aprobada exige los datos de la aprobación previa", () =>
    revertida(sql, async (tx) => {
      const { usuarioId, indicadorId } = await base(tx);
      const [l] = await tx`INSERT INTO importaciones_indicadores (cargado_por) VALUES (${usuarioId}) RETURNING id`;
      const crear = (numero: number, documento: string | null) =>
        intentar(
          tx,
          () => tx`INSERT INTO indicador_versiones (indicador_id, numero, tipo_cambio, creado_por, importacion_id, estado, elaborada_por, aprobada_por,
              huella, rige_desde, aprobacion_previa_documento, aprobacion_previa_por, aprobacion_previa_fecha)
            VALUES (${indicadorId}, ${numero}, 'inicial', ${usuarioId}, ${l.id}, 'aprobada', ${usuarioId}, ${usuarioId}, 'h', '2026-01',
              ${documento}, 'Comité', '2026-01-15')`,
        );
      expect(await crear(1, null)).toBe("23514");
      expect(await crear(2, "Acta 1")).toBeNull();
    }));

  it("la sigla de un subproceso es única sin distinguir mayúsculas y admite nulos repetidos", () =>
    revertida(sql, async (tx) => {
      const [p] = await tx`SELECT id FROM procesos ORDER BY id LIMIT 1`;
      const sufijo = `${Date.now()}`.slice(-6);
      const crear = (slug: string, sigla: string | null) =>
        intentar(tx, () => tx`INSERT INTO subprocesos (proceso_id, nombre, slug, orden, sigla) VALUES (${p.id}, 'x', ${slug}, 99, ${sigla})`);
      expect(await crear(`zz-a-${sufijo}`, `ZZ${sufijo}`)).toBeNull();
      expect(await crear(`zz-b-${sufijo}`, `zz${sufijo}`)).toBe("23505");
      expect(await crear(`zz-c-${sufijo}`, null)).toBeNull();
      expect(await crear(`zz-d-${sufijo}`, null)).toBeNull();
    }));

  it("archivos admite el contexto importacion_indicadores", () =>
    revertida(sql, async (tx) => {
      const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
      const [l] = await tx`INSERT INTO importaciones_indicadores (cargado_por) VALUES (${u.id}) RETURNING id`;
      const codigo = await intentar(
        tx,
        () => tx`INSERT INTO archivos (contexto, contexto_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
          VALUES ('importacion_indicadores', ${l.id}, 'evidencia', ${'zz-imp-' + Date.now()}, 'a.xlsx', 'xlsx', 'application/zip', 10, 'h')`,
      );
      expect(codigo).toBeNull();
    }));

  describe("deshacer un lote: la excepción del trigger de versiones aprobadas", () => {
    it("sin la marca, o con la de otro lote, el DELETE sigue rechazado", () =>
      revertida(sql, async (tx) => {
        const { versionId, importacionId } = await versionAprobada(tx, true);
        expect(await intentar(tx, () => tx`DELETE FROM indicador_variables WHERE version_id = ${versionId}`)).toBe("42501");
        expect(await intentar(tx, () => tx`DELETE FROM indicador_versiones WHERE id = ${versionId}`)).toBe("42501");
        await tx`SELECT set_config('sgc.deshacer_importacion', ${String((importacionId as number) + 1)}, true)`;
        expect(await intentar(tx, () => tx`DELETE FROM indicador_variables WHERE version_id = ${versionId}`)).toBe("42501");
        expect(await intentar(tx, () => tx`DELETE FROM indicador_versiones WHERE id = ${versionId}`)).toBe("42501");
      }));

    it("con la marca de su lote se borran sus hijas y después la versión", () =>
      revertida(sql, async (tx) => {
        const { versionId, importacionId } = await versionAprobada(tx, true);
        await tx`SELECT set_config('sgc.deshacer_importacion', ${String(importacionId)}, true)`;
        await tx`DELETE FROM indicador_variables WHERE version_id = ${versionId}`;
        await tx`DELETE FROM indicador_versiones WHERE id = ${versionId}`;
        const filas = await tx`SELECT id FROM indicador_versiones WHERE id = ${versionId}`;
        expect(filas.length).toBe(0);
      }));

    it("con la marca de su lote, INSERT y UPDATE siguen rechazados", () =>
      revertida(sql, async (tx) => {
        const { versionId, importacionId } = await versionAprobada(tx, true);
        await tx`SELECT set_config('sgc.deshacer_importacion', ${String(importacionId)}, true)`;
        expect(await intentar(tx, () => tx`UPDATE indicador_versiones SET nombre = 'x' WHERE id = ${versionId}`)).toBe("42501");
        expect(await intentar(tx, () => tx`UPDATE indicador_variables SET nombre = 'x' WHERE version_id = ${versionId}`)).toBe("42501");
        expect(await intentar(tx, () => tx`INSERT INTO indicador_variables (version_id, letra) VALUES (${versionId}, 'B')`)).toBe("42501");
      }));

    it("una versión aprobada sin lote no se borra ni con la marca puesta", () =>
      revertida(sql, async (tx) => {
        const { versionId } = await versionAprobada(tx, false);
        const [l] = await tx`SELECT id FROM importaciones_indicadores ORDER BY id DESC LIMIT 1`;
        await tx`SELECT set_config('sgc.deshacer_importacion', ${String(l?.id ?? 1)}, true)`;
        expect(await intentar(tx, () => tx`DELETE FROM indicador_variables WHERE version_id = ${versionId}`)).toBe("42501");
        expect(await intentar(tx, () => tx`DELETE FROM indicador_versiones WHERE id = ${versionId}`)).toBe("42501");
      }));
  });

  it("el registro del lote y sus eventos son de solo inserción (también para el dueño)", () =>
    revertida(sql, async (tx) => {
      const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
      const [l] = await tx`INSERT INTO importaciones_indicadores (cargado_por) VALUES (${u.id}) RETURNING id`;
      const [e] = await tx`INSERT INTO importacion_eventos (importacion_id, tipo, usuario_id, metodo) VALUES (${l.id}, 'importado', ${u.id}, 'clave') RETURNING id`;
      expect(await intentar(tx, () => tx`UPDATE importaciones_indicadores SET cargado_en = now() WHERE id = ${l.id}`)).toBe("42501");
      expect(await intentar(tx, () => tx`DELETE FROM importaciones_indicadores WHERE id = ${l.id}`)).toBe("42501");
      expect(await intentar(tx, () => tx`UPDATE importacion_eventos SET metodo = 'x' WHERE id = ${e.id}`)).toBe("42501");
      expect(await intentar(tx, () => tx`DELETE FROM importacion_eventos WHERE id = ${e.id}`)).toBe("42501");
      expect(await intentar(tx, () => tx`INSERT INTO importacion_eventos (importacion_id, tipo, usuario_id) VALUES (${l.id}, 'otro', ${u.id})`)).toBe("23514");
      expect(await intentar(tx, () => tx`INSERT INTO importacion_eventos (importacion_id, tipo, usuario_id) VALUES (${l.id}, 'importado', ${u.id})`)).toBe("23505");
      expect(await intentar(tx, () => tx`INSERT INTO importacion_eventos (importacion_id, tipo, usuario_id) VALUES (${l.id}, 'deshecho', ${u.id})`)).toBeNull();
    }));
});
