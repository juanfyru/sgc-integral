/**
 * Esquema de la Fase 14 (migración 0011): indicadores, mediciones, maestros y sus triggers.
 * Requiere la BD de desarrollo migrada (npm run db:preparar); no exige la demo recién sembrada.
 * Nada queda confirmado: todo corre dentro de una transacción que se revierte.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql, TransactionSql } from "postgres";
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

/** La sentencia de la migración que empieza por `inicio`, tal como la corre el migrador. */
function sentenciaDeMigracion(archivo: string, inicio: string): string {
  const texto = readFileSync(path.resolve(import.meta.dirname, "../drizzle", archivo), "utf8");
  const sentencia = texto
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .find((s) => s.startsWith(inicio));
  if (!sentencia) throw new Error(`${archivo} no tiene una sentencia que empiece por ${inicio}`);
  return sentencia;
}

const MIGRACION_0011 = "0011_fase14-indicadores.sql";

const TABLAS_14A = ["tipos_indicador", "clasificaciones_indicador", "unidades_indicador", "objetivos", "indicadores",
  "indicador_versiones", "indicador_variables", "indicador_responsables", "indicador_normas", "indicador_designados",
  "indicador_metas", "mediciones", "medicion_valores", "medicion_eventos", "medicion_observaciones", "cierres_indicadores"];
const TABLAS_14B = ["variables_compartidas", "variable_responsables", "variable_valores", "calculo_fotos", "dimensiones",
  "dimension_categorias", "reportes_externos", "impactos_indicadores"];

const TRIGGERS = [
  "medicion_eventos_inmutable", "medicion_observaciones_inmutable", "cierres_indicadores_inmutable",
  "mediciones_cerrada_inmutable", "medicion_valores_cerrada_inmutable",
  "indicador_versiones_aprobada_inmutable", "indicador_variables_aprobada_inmutable",
  "indicador_responsables_aprobada_inmutable", "indicador_normas_aprobada_inmutable",
];

/** Un indicador propio de la prueba (código único por corrida). */
async function indicadorDePrueba(tx: TransactionSql, extra: { codigo?: string } = {}) {
  const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
  const [p] = await tx`SELECT id FROM procesos ORDER BY id LIMIT 1`;
  const codigo = extra.codigo ?? `zz-ind-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const [i] = await tx`INSERT INTO indicadores (codigo, proceso_id, creado_por) VALUES (${codigo}, ${p.id}, ${u.id}) RETURNING id`;
  return { usuarioId: u.id as number, procesoId: p.id as number, indicadorId: i.id as number };
}

/** Una versión en borrador del indicador. */
async function versionDePrueba(tx: TransactionSql, indicadorId: number, usuarioId: number, numero = 1) {
  const [v] = await tx`INSERT INTO indicador_versiones (indicador_id, numero, tipo_cambio, creado_por)
    VALUES (${indicadorId}, ${numero}, 'inicial', ${usuarioId}) RETURNING id`;
  return v.id as number;
}

/** Aprueba una versión: los datos que exige `indicador_versiones_aprobada_coherente`. */
const aprobar = (tx: TransactionSql, versionId: number, usuarioId: number) =>
  tx`UPDATE indicador_versiones SET estado = 'aprobada', elaborada_por = ${usuarioId}, aprobada_por = ${usuarioId},
    huella = 'abc', rige_desde = '2026-01' WHERE id = ${versionId}`;

/** Una medición abierta del indicador, con su versión. */
async function medicionDePrueba(tx: TransactionSql, indicadorId: number, versionId: number, periodo = "2026-01") {
  const [m] = await tx`INSERT INTO mediciones (indicador_id, version_id, periodo, desde, hasta, vence_en)
    VALUES (${indicadorId}, ${versionId}, ${periodo}, '2026-01-01', '2026-01-31', '2026-02-10') RETURNING id`;
  return m.id as number;
}

describe("esquema de la Fase 14", () => {
  let sql: Sql;
  let dueno: Sql | undefined;

  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, types: TIPOS_SQL });
    if (process.env.DATABASE_URL_MIGRADOR) {
      dueno = postgres(process.env.DATABASE_URL_MIGRADOR, { max: 1, types: TIPOS_SQL });
    }
  });
  afterAll(async () => {
    await sql.end();
    await dueno?.end();
  });

  it("existen las 24 tablas de la fase", async () => {
    const filas = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
    const nombres = new Set(filas.map((f) => f.table_name as string));
    for (const t of [...TABLAS_14A, ...TABLAS_14B]) expect(nombres.has(t), t).toBe(true);
    expect(TABLAS_14A.length + TABLAS_14B.length).toBe(24);
  });

  it("indicadores: estado, nivel de acceso, plazo y baja coherente", () =>
    revertida(sql, async (tx) => {
      const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
      const [p] = await tx`SELECT id FROM procesos ORDER BY id LIMIT 1`;
      const crear = (campos: Record<string, unknown>) =>
        tx.savepoint(
          (s) => s`INSERT INTO indicadores ${s({ codigo: `zz-${Date.now()}-${Math.random()}`, proceso_id: p.id, creado_por: u.id, ...campos } as never)} RETURNING id`,
        );
      const [base] = await crear({});
      expect(base.id).toBeGreaterThan(0);
      const [def] = await tx`SELECT estado, nivel_acceso, plazo_reporte_dias FROM indicadores WHERE id = ${base.id}`;
      expect(def).toEqual({ estado: "borrador", nivel_acceso: "general", plazo_reporte_dias: 10 });
      expect(await fallaCon(crear({ estado: "otro" }))).toBe("23514");
      expect(await fallaCon(crear({ nivel_acceso: "otro" }))).toBe("23514");
      expect(await fallaCon(crear({ plazo_reporte_dias: 91 }))).toBe("23514");
      // Retirado exige quién, cuándo y por qué; y quien tiene baja no puede seguir activo.
      expect(await fallaCon(crear({ estado: "retirado" }))).toBe("23514");
      expect(await fallaCon(crear({ estado: "retirado", baja_por: u.id, baja_en: new Date() }))).toBe("23514");
      expect(await fallaCon(crear({ estado: "activo", baja_por: u.id, baja_en: new Date(), baja_motivo: "x" }))).toBe("23514");
      await crear({ estado: "retirado", baja_por: u.id, baja_en: new Date(), baja_motivo: "Ya no se mide" });
      await crear({ codigo: "SGC-IND-01" });
      expect(await fallaCon(crear({ codigo: "sgc-ind-01" }))).toBe("23505");
    }));

  it("una versión: listas cerradas y un solo borrador o por aprobar por indicador", () =>
    revertida(sql, async (tx) => {
      const { usuarioId, indicadorId } = await indicadorDePrueba(tx);
      const crear = (numero: number, campos: Record<string, unknown> = {}) =>
        tx.savepoint(
          (s) => s`INSERT INTO indicador_versiones ${s({ indicador_id: indicadorId, numero, tipo_cambio: "inicial", creado_por: usuarioId, estado: "descartada", ...campos } as never)} RETURNING id`,
        );
      let n = 10;
      for (const campos of [
        { forma: "otra" }, { periodicidad: "semanal" }, { tendencia: "lateral" }, { decimales: 5 },
        { umbral_atencion_pct: 100 }, { umbral_atencion_pct: 0 }, { semaforo_modo: "otro" },
        { origen_dato: "otro" }, { tipo_cambio: "otro" }, { estado: "otro" },
      ]) {
        expect(await fallaCon(crear(n++, campos)), JSON.stringify(campos)).toBe("23514");
      }
      await crear(n++, { forma: "porcentaje", periodicidad: "bimestral", tendencia: "ascendente", decimales: 4, umbral_atencion_pct: 99, semaforo_modo: "fijo" });
      // Un solo borrador o por aprobar.
      await crear(1, { estado: "borrador" });
      expect(await fallaCon(crear(2, { estado: "borrador" }))).toBe("23505");
      expect(await fallaCon(crear(3, { estado: "por_aprobar" }))).toBe("23505");
      // El número es único por indicador.
      expect(await fallaCon(crear(1, { estado: "descartada" }))).toBe("23505");
      // Aprobada exige elaboradora, huella y desde cuándo rige; la menor no exige aprobadora.
      expect(await fallaCon(crear(20, { estado: "aprobada", elaborada_por: usuarioId, aprobada_por: usuarioId, rige_desde: "2026-01" }))).toBe("23514");
      expect(await fallaCon(crear(21, { estado: "aprobada", huella: "h", aprobada_por: usuarioId, rige_desde: "2026-01" }))).toBe("23514");
      expect(await fallaCon(crear(22, { estado: "aprobada", elaborada_por: usuarioId, huella: "h", aprobada_por: usuarioId }))).toBe("23514");
      expect(await fallaCon(crear(23, { estado: "aprobada", tipo_cambio: "mayor", elaborada_por: usuarioId, huella: "h", rige_desde: "2026-01" }))).toBe("23514");
      await crear(24, { estado: "aprobada", tipo_cambio: "menor", elaborada_por: usuarioId, huella: "h", rige_desde: "2026-01" });
      await crear(25, { estado: "aprobada", tipo_cambio: "mayor", elaborada_por: usuarioId, huella: "h", rige_desde: "2026-01", aprobada_por: usuarioId });
    }));

  it("variables: letra de la A a la Z, única por versión", () =>
    revertida(sql, async (tx) => {
      const { usuarioId, indicadorId } = await indicadorDePrueba(tx);
      const versionId = await versionDePrueba(tx, indicadorId, usuarioId);
      const crear = (letra: string, campos: Record<string, unknown> = {}) =>
        tx.savepoint((s) => s`INSERT INTO indicador_variables ${s({ version_id: versionId, letra, ...campos } as never)} RETURNING id`);
      await crear("A");
      await crear("Z");
      expect(await fallaCon(crear("a"))).toBe("23514");
      expect(await fallaCon(crear("AB"))).toBe("23514");
      expect(await fallaCon(crear("1"))).toBe("23514");
      expect(await fallaCon(crear("A"))).toBe("23505");
      expect(await fallaCon(crear("B", { consolidacion: "maximo" }))).toBe("23514");
      expect(await fallaCon(crear("B", { origen: "otro" }))).toBe("23514");
      expect(await fallaCon(crear("B", { toma: "otro" }))).toBe("23514");
      await crear("B", { origen: "indicador", toma: "cumplimiento", consolidacion: "promedio" });
      const [a] = await tx`SELECT consolidacion, origen FROM indicador_variables WHERE version_id = ${versionId} AND letra = 'A'`;
      expect(a).toEqual({ consolidacion: "suma", origen: "propia" });
    }));

  it("responsables, normas y designados: funciones cerradas y únicos", () =>
    revertida(sql, async (tx) => {
      const { usuarioId, indicadorId } = await indicadorDePrueba(tx);
      const versionId = await versionDePrueba(tx, indicadorId, usuarioId);
      const [c] = await tx`SELECT id FROM cargos ORDER BY id LIMIT 1`;
      const responsable = (funcion: string) =>
        tx.savepoint((s) => s`INSERT INTO indicador_responsables (version_id, cargo_id, cargo_nombre, funcion) VALUES (${versionId}, ${c.id}, 'Cargo', ${funcion})`);
      await responsable("medir");
      await responsable("analizar");
      expect(await fallaCon(responsable("medir"))).toBe("23505");
      expect(await fallaCon(responsable("otra"))).toBe("23514");
      const designar = (funcion: string) =>
        tx.savepoint((s) => s`INSERT INTO indicador_designados (indicador_id, usuario_id, funcion, creado_por) VALUES (${indicadorId}, ${usuarioId}, ${funcion}, ${usuarioId})`);
      await designar("mide");
      await designar("seguimiento");
      expect(await fallaCon(designar("mide"))).toBe("23505");
      expect(await fallaCon(designar("otra"))).toBe("23514");
      const meta = (periodo: string) =>
        tx.savepoint((s) => s`INSERT INTO indicador_metas (indicador_id, periodo, meta, programada_por) VALUES (${indicadorId}, ${periodo}, 95.5, ${usuarioId})`);
      await meta("2026-01");
      expect(await fallaCon(meta("2026-01"))).toBe("23505");
    }));

  it("una medición por indicador y periodo; un valor por variable y categoría, también sin categoría", () =>
    revertida(sql, async (tx) => {
      const { usuarioId, indicadorId } = await indicadorDePrueba(tx);
      const versionId = await versionDePrueba(tx, indicadorId, usuarioId);
      const medicionId = await medicionDePrueba(tx, indicadorId, versionId);
      expect(
        await fallaCon(
          tx.savepoint((s) => s`INSERT INTO mediciones (indicador_id, version_id, periodo, desde, hasta, vence_en)
            VALUES (${indicadorId}, ${versionId}, '2026-01', '2026-01-01', '2026-01-31', '2026-02-10')`),
        ),
      ).toBe("23505");
      const [v] = await tx`INSERT INTO indicador_variables (version_id, letra) VALUES (${versionId}, 'A') RETURNING id`;
      const [d] = await tx`INSERT INTO dimensiones (nombre) VALUES (${"zz_dim_" + Date.now()}) RETURNING id`;
      const [cat] = await tx`INSERT INTO dimension_categorias (dimension_id, nombre, orden) VALUES (${d.id}, 'Urgencias', 1) RETURNING id`;
      const valor = (categoria: number | null) =>
        tx.savepoint((s) => s`INSERT INTO medicion_valores (medicion_id, variable_id, categoria_id, valor) VALUES (${medicionId}, ${v.id}, ${categoria}, 5)`);
      await valor(null);
      expect(await fallaCon(valor(null))).toBe("23505");
      await valor(cat.id);
      expect(await fallaCon(valor(cat.id))).toBe("23505");
      const [def] = await tx`SELECT estado, historica, no_aplica FROM mediciones WHERE id = ${medicionId}`;
      expect(def).toEqual({ estado: "abierta", historica: false, no_aplica: false });
      expect(
        await fallaCon(tx.savepoint((s) => s`UPDATE mediciones SET estado = 'otra' WHERE id = ${medicionId}`)),
      ).toBe("23514");
      expect(
        await fallaCon(tx.savepoint((s) => s`UPDATE mediciones SET semaforo = 'rojo' WHERE id = ${medicionId}`)),
      ).toBe("23514");
    }));

  it("firmas admite una firma de ficha sin trámite y sigue exigiendo dueño", () =>
    revertida(sql, async (tx) => {
      const { usuarioId, indicadorId } = await indicadorDePrueba(tx);
      const versionId = await versionDePrueba(tx, indicadorId, usuarioId);
      const firmar = (firma: string, indicadorVersionId: number | null) =>
        tx.savepoint(
          (s) => s`INSERT INTO firmas (tramite_id, version_id, indicador_version_id, usuario_id, firma, ronda, hash_sha256, nombre_firmante, metodo)
            VALUES (NULL, NULL, ${indicadorVersionId}, ${usuarioId}, ${firma}, 0, 'x', 'Alguien', 'clave')`,
        );
      await firmar("elaboro", versionId);
      await firmar("aprobo", versionId);
      expect(await fallaCon(firmar("elaboro", null))).toBe("23514");
      expect(await fallaCon(firmar("aprobo", null))).toBe("23514");
      // Las firmas que ya existían siguen valiendo.
      await firmar("ratifico", null);
    }));

  it("archivos admite los contextos medicion y reporte_externo", () =>
    revertida(sql, async (tx) => {
      const archivo = (contexto: string) =>
        tx.savepoint(
          (s) => s`INSERT INTO archivos (contexto, contexto_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
            VALUES (${contexto}, 1, 'evidencia', ${"zz/" + Date.now() + contexto}, 'x.pdf', 'pdf', 'application/pdf', 10, 'h')`,
        );
      await archivo("medicion");
      await archivo("reporte_externo");
      await archivo("hallazgo");
      expect(await fallaCon(archivo("otro"))).toBe("23514");
    }));

  it("los triggers existen", async () => {
    const filas = await sql`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname = ANY(${TRIGGERS})`;
    expect(filas.map((f) => f.tgname as string).sort()).toEqual([...TRIGGERS].sort());
  });

  it("medicion_eventos, medicion_observaciones y cierres_indicadores no admiten UPDATE ni DELETE", () =>
    revertida(sql, async (tx) => {
      const { usuarioId, indicadorId } = await indicadorDePrueba(tx);
      const versionId = await versionDePrueba(tx, indicadorId, usuarioId);
      const medicionId = await medicionDePrueba(tx, indicadorId, versionId);
      const [e] = await tx`INSERT INTO medicion_eventos (medicion_id, tipo, usuario_id) VALUES (${medicionId}, 'reporte', ${usuarioId}) RETURNING id`;
      await tx`INSERT INTO medicion_eventos (medicion_id, tipo) VALUES (${medicionId}, 'recalculo')`;
      const [o] = await tx`INSERT INTO medicion_observaciones (medicion_id, usuario_id, texto) VALUES (${medicionId}, ${usuarioId}, 'Hola') RETURNING id`;
      await tx`INSERT INTO medicion_observaciones (medicion_id, usuario_id, texto, responde_a) VALUES (${medicionId}, ${usuarioId}, 'Respuesta', ${o.id})`;
      const [c] = await tx`INSERT INTO cierres_indicadores (mes, cerrado_por) VALUES ('2090-01-31', ${usuarioId}) RETURNING id`;
      expect(await fallaCon(tx.savepoint((s) => s`INSERT INTO medicion_eventos (medicion_id, tipo) VALUES (${medicionId}, 'otro')`))).toBe("23514");
      expect(await fallaCon(tx.savepoint((s) => s`INSERT INTO cierres_indicadores (mes, cerrado_por) VALUES ('2090-01-31', ${usuarioId})`))).toBe("23505");
      for (const [tabla, id, columna] of [["medicion_eventos", e.id, "creado_en"], ["medicion_observaciones", o.id, "creado_en"], ["cierres_indicadores", c.id, "cerrado_en"]] as const) {
        const t = tx(tabla);
        expect(await fallaCon(tx.savepoint((s) => s`UPDATE ${t} SET ${tx(columna)} = ${tx(columna)} WHERE id = ${id}`)), `UPDATE ${tabla}`).toBe("42501");
        expect(await fallaCon(tx.savepoint((s) => s`DELETE FROM ${t} WHERE id = ${id}`)), `DELETE ${tabla}`).toBe("42501");
      }
    }));

  it("una medición cerrada no cambia, salvo la reapertura", () =>
    revertida(sql, async (tx) => {
      const { usuarioId, indicadorId } = await indicadorDePrueba(tx);
      const versionId = await versionDePrueba(tx, indicadorId, usuarioId);
      const medicionId = await medicionDePrueba(tx, indicadorId, versionId);
      const [v] = await tx`INSERT INTO indicador_variables (version_id, letra) VALUES (${versionId}, 'A') RETURNING id`;
      const [w] = await tx`INSERT INTO indicador_variables (version_id, letra) VALUES (${versionId}, 'B') RETURNING id`;
      const [val] = await tx`INSERT INTO medicion_valores (medicion_id, variable_id, valor) VALUES (${medicionId}, ${v.id}, 5) RETURNING id`;
      // Abierta: todo se puede cambiar.
      await tx`UPDATE mediciones SET resultado = 50, estado = 'reportada' WHERE id = ${medicionId}`;
      await tx`UPDATE medicion_valores SET valor = 6 WHERE id = ${val.id}`;
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id = ${medicionId}`;
      // Cerrada: ni resultado, ni borrado, ni valores.
      expect(await fallaCon(tx.savepoint((s) => s`UPDATE mediciones SET resultado = 60 WHERE id = ${medicionId}`))).toBe("42501");
      expect(await fallaCon(tx.savepoint((s) => s`DELETE FROM mediciones WHERE id = ${medicionId}`))).toBe("42501");
      expect(await fallaCon(tx.savepoint((s) => s`INSERT INTO medicion_valores (medicion_id, variable_id, valor) VALUES (${medicionId}, ${w.id}, 1)`))).toBe("42501");
      expect(await fallaCon(tx.savepoint((s) => s`UPDATE medicion_valores SET valor = 7 WHERE id = ${val.id}`))).toBe("42501");
      expect(await fallaCon(tx.savepoint((s) => s`DELETE FROM medicion_valores WHERE id = ${val.id}`))).toBe("42501");
      // Reabrir sin quién, sin motivo o sin fecha nueva no vale.
      expect(await fallaCon(tx.savepoint((s) => s`UPDATE mediciones SET estado = 'reportada' WHERE id = ${medicionId}`))).toBe("42501");
      expect(await fallaCon(tx.savepoint((s) => s`UPDATE mediciones SET estado = 'reportada', reabierta_por = ${usuarioId}, reabierta_en = now() WHERE id = ${medicionId}`))).toBe("42501");
      expect(await fallaCon(tx.savepoint((s) => s`UPDATE mediciones SET estado = 'cerrada', reabierta_por = ${usuarioId}, reabierta_en = now(), reabierta_motivo = 'x' WHERE id = ${medicionId}`))).toBe("42501");
      await tx`UPDATE mediciones SET estado = 'reportada', reabierta_por = ${usuarioId}, reabierta_en = now(), reabierta_motivo = 'Error de captura' WHERE id = ${medicionId}`;
      // Reabierta: vuelve a admitir cambios.
      await tx`UPDATE mediciones SET resultado = 60 WHERE id = ${medicionId}`;
      await tx`UPDATE medicion_valores SET valor = 7 WHERE id = ${val.id}`;
      await tx`INSERT INTO medicion_valores (medicion_id, variable_id, valor) VALUES (${medicionId}, ${w.id}, 1)`;
      const [m] = await tx`SELECT resultado::text AS resultado, estado, reabierta_motivo FROM mediciones WHERE id = ${medicionId}`;
      expect(m).toEqual({ resultado: "60", estado: "reportada", reabierta_motivo: "Error de captura" });
      // Cerrada otra vez, con la marca de la primera reapertura todavía puesta.
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id = ${medicionId}`;
      expect(
        await fallaCon(
          tx.savepoint((s) => s`UPDATE mediciones SET estado = 'reportada', reabierta_en = NULL WHERE id = ${medicionId}`),
        ),
      ).toBe("42501");
      await tx`UPDATE mediciones SET estado = 'reportada', reabierta_por = ${usuarioId}, reabierta_en = now() + interval '1 minute',
        reabierta_motivo = 'Segunda corrección' WHERE id = ${medicionId}`;
      const [m2] = await tx`SELECT estado, reabierta_motivo FROM mediciones WHERE id = ${medicionId}`;
      expect(m2).toEqual({ estado: "reportada", reabierta_motivo: "Segunda corrección" });
    }));

  it("una versión aprobada no cambia, ni sus variables, responsables y normas", () =>
    revertida(sql, async (tx) => {
      const { usuarioId, indicadorId } = await indicadorDePrueba(tx);
      const versionId = await versionDePrueba(tx, indicadorId, usuarioId);
      const [c] = await tx`SELECT id FROM cargos ORDER BY id LIMIT 1`;
      const [t] = await tx`INSERT INTO tipos_norma (nombre, orden) VALUES (${"zz_tipo_f14_" + Date.now()}, 99) RETURNING id`;
      const [n] = await tx`INSERT INTO normas (tipo_norma_id, numero, anio, entidad_emisora, titulo, creado_por)
        VALUES (${t.id}, '1', 2020, 'Ministerio', 'Norma de prueba', ${usuarioId}) RETURNING id`;
      // Borrador: sus hijos se escriben libremente.
      const [v] = await tx`INSERT INTO indicador_variables (version_id, letra) VALUES (${versionId}, 'A') RETURNING id`;
      const [r] = await tx`INSERT INTO indicador_responsables (version_id, cargo_id, cargo_nombre, funcion) VALUES (${versionId}, ${c.id}, 'Cargo', 'medir') RETURNING id`;
      const [nm] = await tx`INSERT INTO indicador_normas (version_id, norma_id, norma_nombre) VALUES (${versionId}, ${n.id}, 'Norma') RETURNING id`;
      await tx`UPDATE indicador_variables SET nombre = 'Casos' WHERE id = ${v.id}`;
      await tx`UPDATE indicador_versiones SET nombre = 'Oportunidad' WHERE id = ${versionId}`;
      await aprobar(tx, versionId, usuarioId);
      const [aprobada] = await tx`SELECT estado, nombre FROM indicador_versiones WHERE id = ${versionId}`;
      expect(aprobada).toEqual({ estado: "aprobada", nombre: "Oportunidad" });
      const casos: Array<[string, () => Promise<unknown>]> = [
        ["UPDATE versión", () => tx.savepoint((s) => s`UPDATE indicador_versiones SET nombre = 'Otro' WHERE id = ${versionId}`)],
        ["DELETE versión", () => tx.savepoint((s) => s`DELETE FROM indicador_versiones WHERE id = ${versionId}`)],
        ["INSERT variable", () => tx.savepoint((s) => s`INSERT INTO indicador_variables (version_id, letra) VALUES (${versionId}, 'B')`)],
        ["UPDATE variable", () => tx.savepoint((s) => s`UPDATE indicador_variables SET nombre = 'x' WHERE id = ${v.id}`)],
        ["DELETE variable", () => tx.savepoint((s) => s`DELETE FROM indicador_variables WHERE id = ${v.id}`)],
        ["INSERT responsable", () => tx.savepoint((s) => s`INSERT INTO indicador_responsables (version_id, cargo_id, cargo_nombre, funcion) VALUES (${versionId}, ${c.id}, 'Cargo', 'analizar')`)],
        ["UPDATE responsable", () => tx.savepoint((s) => s`UPDATE indicador_responsables SET cargo_nombre = 'x' WHERE id = ${r.id}`)],
        ["DELETE responsable", () => tx.savepoint((s) => s`DELETE FROM indicador_responsables WHERE id = ${r.id}`)],
        ["UPDATE norma", () => tx.savepoint((s) => s`UPDATE indicador_normas SET norma_nombre = 'x' WHERE id = ${nm.id}`)],
        ["DELETE norma", () => tx.savepoint((s) => s`DELETE FROM indicador_normas WHERE id = ${nm.id}`)],
      ];
      for (const [nombre, p] of casos) expect(await fallaCon(p()), nombre).toBe("42501");
      // Una segunda versión del mismo indicador sí admite cambios.
      const otra = await versionDePrueba(tx, indicadorId, usuarioId, 2);
      await tx`INSERT INTO indicador_variables (version_id, letra) VALUES (${otra}, 'A')`;
      await tx`UPDATE indicador_versiones SET nombre = 'Siguiente' WHERE id = ${otra}`;
    }));

  it("la migración siembra los tres maestros y los cinco parámetros solo si faltan", () =>
    revertida(sql, async (tx) => {
      const maestros: Array<[string, string, string]> = [
        ["tipos_indicador", `INSERT INTO "tipos_indicador"`, "nombre"],
        ["clasificaciones_indicador", `INSERT INTO "clasificaciones_indicador"`, "nombre"],
        ["unidades_indicador", `INSERT INTO "unidades_indicador"`, "nombre"],
      ];
      for (const [tabla, inicio] of maestros) {
        const alta = sentenciaDeMigracion(MIGRACION_0011, inicio);
        // Con filas (la base ya migrada): no inserta nada.
        const [{ antes }] = await tx.unsafe(`SELECT count(*)::int AS antes FROM ${tabla}`);
        expect(antes, tabla).toBeGreaterThan(0);
        await tx.unsafe(alta);
        const [{ despues }] = await tx.unsafe(`SELECT count(*)::int AS despues FROM ${tabla}`);
        expect(despues, tabla).toBe(antes);
        // Vacía: una copia temporal tapa a la real y la sentencia escribe en ella.
        await tx.unsafe(`CREATE TEMP TABLE ${tabla} (LIKE public.${tabla} INCLUDING ALL) ON COMMIT DROP`);
        await tx.unsafe(alta);
      }
      const tipos = await tx.unsafe(`SELECT nombre, orden, activo FROM pg_temp.tipos_indicador ORDER BY orden`);
      expect(tipos.map((f) => f.nombre)).toEqual(["Eficacia", "Eficiencia", "Efectividad"]);
      expect(tipos.every((f) => f.activo)).toBe(true);
      const clases = await tx.unsafe(`SELECT nombre, aprueba, exige_norma FROM pg_temp.clasificaciones_indicador ORDER BY orden`);
      expect([...clases]).toEqual([
        { nombre: "Estratégico", aprueba: "gerencia", exige_norma: false },
        { nombre: "Operativo", aprueba: "lider", exige_norma: false },
        { nombre: "Regulatorio", aprueba: "gerencia", exige_norma: true },
      ]);
      const unidades = await tx.unsafe(`SELECT nombre, sufijo, decimales FROM pg_temp.unidades_indicador ORDER BY orden`);
      expect([...unidades]).toEqual([
        { nombre: "Porcentaje", sufijo: " %", decimales: 1 },
        { nombre: "Número", sufijo: "", decimales: 0 },
        { nombre: "Días", sufijo: " días", decimales: 1 },
        { nombre: "Horas", sufijo: " h", decimales: 1 },
        { nombre: "Minutos", sufijo: " min", decimales: 0 },
        { nombre: "Tasa por mil", sufijo: " por mil", decimales: 1 },
        { nombre: "Pesos", sufijo: " pesos", decimales: 0 },
      ]);
      // Con un solo valor propio de la entidad: tampoco lo toca.
      await tx.unsafe(`DELETE FROM pg_temp.tipos_indicador`);
      await tx.unsafe(`INSERT INTO pg_temp.tipos_indicador (nombre, orden, activo) VALUES ('Propio', 1, false)`);
      await tx.unsafe(sentenciaDeMigracion(MIGRACION_0011, `INSERT INTO "tipos_indicador"`));
      expect([...(await tx.unsafe(`SELECT nombre, activo FROM pg_temp.tipos_indicador`))]).toEqual([{ nombre: "Propio", activo: false }]);

      // Los cinco parámetros: existen y un valor que la entidad ya cambió no se pisa.
      const alta = sentenciaDeMigracion(MIGRACION_0011, `INSERT INTO "configuracion"`);
      const claves = ["ind_umbral_atencion_pct", "ind_aviso_previo_dias", "ind_plazo_reporte_dias", "ind_incumplimiento_periodos", "ind_variacion_confirmar_pct"];
      const leer = async () => Object.fromEntries((await tx`SELECT clave, valor FROM configuracion WHERE clave = ANY(${claves})`).map((f) => [f.clave, f.valor]));
      await tx`UPDATE configuracion SET valor = '99' WHERE clave = 'ind_umbral_atencion_pct'`;
      await tx`DELETE FROM configuracion WHERE clave = 'ind_aviso_previo_dias'`;
      await tx.unsafe(alta);
      expect(await leer()).toMatchObject({ ind_umbral_atencion_pct: "99", ind_aviso_previo_dias: "3" });
      expect(Object.keys(await leer()).sort()).toEqual([...claves].sort());
    }));

  it.skipIf(!process.env.DATABASE_URL_MIGRADOR)("el trigger frena también al dueño del esquema", () =>
    revertida(dueno!, async (tx) => {
      const { usuarioId, indicadorId } = await indicadorDePrueba(tx);
      const versionId = await versionDePrueba(tx, indicadorId, usuarioId);
      const medicionId = await medicionDePrueba(tx, indicadorId, versionId);
      const [e] = await tx`INSERT INTO medicion_eventos (medicion_id, tipo) VALUES (${medicionId}, 'reporte') RETURNING id`;
      expect(await fallaCon(tx.savepoint((s) => s`DELETE FROM medicion_eventos WHERE id = ${e.id}`))).toBe("42501");
      await aprobar(tx, versionId, usuarioId);
      expect(await fallaCon(tx.savepoint((s) => s`UPDATE indicador_versiones SET nombre = 'x' WHERE id = ${versionId}`))).toBe("42501");
    }));
});
