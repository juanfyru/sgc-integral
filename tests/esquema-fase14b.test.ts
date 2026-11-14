/**
 * Esquema de la Fase 14B (migraciones 0013 y 0014): la foto en la medición, las constancias de envío y su historial de
 * solo inserción, los impactos de indicadores, el cálculo de la ficha vigente y los índices que la 14A dejó como deuda.
 * Nada queda confirmado: todo corre dentro de una transacción que se revierte.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql, TransactionSql } from "postgres";
import postgres from "postgres";
import { TIPOS_SQL } from "@/db/cliente";
import { revertida } from "./utiles/transaccion";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

type Fallo = { codigo: string; restriccion: string | null } | null;

/** El código y la restricción del error, o `null` si la consulta entró. */
const fallaCon = (p: PromiseLike<unknown>): Promise<Fallo> =>
  Promise.resolve(p).then(
    () => null,
    (e: { code?: string; constraint_name?: string }) => ({ codigo: e.code ?? "sin-codigo", restriccion: e.constraint_name ?? null }),
  );

const rechazo = (restriccion: string, codigo = "23514") => ({ codigo, restriccion });

/** La primera sentencia de la migración `NNNN_*.sql`, tal como la corre el migrador. */
function primeraSentencia(numero: string): string {
  const carpeta = path.resolve(import.meta.dirname, "../drizzle");
  const archivo = readdirSync(carpeta).find((f) => f.startsWith(`${numero}_`) && f.endsWith(".sql"));
  if (!archivo) throw new Error(`No hay una migración ${numero}`);
  return readFileSync(path.join(carpeta, archivo), "utf8").split("--> statement-breakpoint")[0].trim();
}

const codigoUnico = () => `zz-14b-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function base(tx: TransactionSql) {
  const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
  const procesos = await tx`SELECT id FROM procesos ORDER BY id LIMIT 2`;
  return { usuarioId: u.id as number, procesoA: procesos[0].id as number, procesoB: procesos[1].id as number };
}

async function indicador(tx: TransactionSql, b: { usuarioId: number; procesoA: number }) {
  const [i] = await tx`INSERT INTO indicadores (codigo, proceso_id, creado_por) VALUES (${codigoUnico()}, ${b.procesoA}, ${b.usuarioId}) RETURNING id`;
  return i.id as number;
}

/** Una constancia pendiente del indicador, con su ente. */
async function constancia(tx: TransactionSql, indicadorId: number, periodo = "2026-T1") {
  const [r] = await tx`INSERT INTO reportes_externos (indicador_id, periodo, desde, hasta, vence_en, ente)
    VALUES (${indicadorId}, ${periodo}, '2026-01-01T05:00:00Z', '2026-04-01T05:00:00Z', '2026-04-16T05:00:00Z', 'Superintendencia') RETURNING id`;
  return r.id as number;
}

describe("esquema de las migraciones 0013 y 0014", () => {
  let sql: Sql;

  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, types: TIPOS_SQL });
  });
  afterAll(async () => {
    await sql.end();
  });

  it("calculo_fotos ya no existe y las columnas nuevas existen con su tipo", async () => {
    const tablas = await sql`SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('calculo_fotos', 'reporte_externo_eventos')`;
    expect(tablas.map((t) => t.table_name)).toEqual(["reporte_externo_eventos"]);

    const filas = await sql`SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN ('indicadores', 'mediciones', 'reportes_externos', 'reporte_externo_eventos', 'impactos_indicadores')`;
    const tipos = Object.fromEntries(
      filas.map((f) => [`${f.table_name}.${f.column_name}`, `${f.data_type}${f.is_nullable === "NO" ? " NOT NULL" : ""}`]),
    );
    const TZ = "timestamp with time zone";
    const esperado: Record<string, string> = {
      "indicadores.calculo": "text",
      "indicadores.calculo_alcance": "text",
      "indicadores.ente_desde": TZ,
      "mediciones.foto_en": TZ,
      "reportes_externos.indicador_id": "bigint NOT NULL",
      "reportes_externos.periodo": "text NOT NULL",
      "reportes_externos.desde": `${TZ} NOT NULL`,
      "reportes_externos.hasta": `${TZ} NOT NULL`,
      "reportes_externos.vence_en": `${TZ} NOT NULL`,
      "reportes_externos.ente": "text NOT NULL",
      "reportes_externos.estado": "text NOT NULL",
      "reportes_externos.fecha_envio": "date",
      "reportes_externos.radicado": "text",
      "reportes_externos.resultado_enviado": "text",
      "reportes_externos.resultado_detalle": "jsonb",
      "reportes_externos.nota": "text",
      "reportes_externos.registrada_por": "bigint",
      "reportes_externos.registrada_en": TZ,
      "reportes_externos.corregida": "boolean NOT NULL",
      "reportes_externos.aviso_previo_en": TZ,
      "reportes_externos.aviso_vencido_en": TZ,
      "reportes_externos.escalado_en": TZ,
      "reportes_externos.creado_en": `${TZ} NOT NULL`,
      "reporte_externo_eventos.id": "bigint NOT NULL",
      "reporte_externo_eventos.reporte_id": "bigint NOT NULL",
      "reporte_externo_eventos.tipo": "text NOT NULL",
      "reporte_externo_eventos.usuario_id": "bigint NOT NULL",
      "reporte_externo_eventos.detalle": "jsonb NOT NULL",
      "reporte_externo_eventos.creado_en": `${TZ} NOT NULL`,
      "impactos_indicadores.estado": "text NOT NULL",
      "impactos_indicadores.vence_en": `${TZ} NOT NULL`,
      "impactos_indicadores.resolucion": "text",
      "impactos_indicadores.resuelto_por": "bigint",
      "impactos_indicadores.resuelto_en": TZ,
      "impactos_indicadores.creado_en": `${TZ} NOT NULL`,
    };
    for (const [columna, tipo] of Object.entries(esperado)) expect(tipos[columna], columna).toBe(tipo);
  });

  it("los índices nuevos existen", async () => {
    const nombres = [
      "indicadores_calculo_unico", "reportes_externos_estado_vence_idx", "reporte_externo_eventos_reporte_idx",
      "impactos_indicadores_indicador_idx", "firmas_indicador_version_idx", "medicion_observaciones_responde_idx",
      "mediciones_cierre_idx",
    ];
    const filas = await sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY(${nombres})`;
    expect(filas.map((f) => f.indexname as string).sort()).toEqual([...nombres].sort());
  });

  it("una versión automática exige cálculo y alcance, y el alcance es de su lista", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const indicadorId = await indicador(tx, b);
      let numero = 1;
      const crear = (campos: Record<string, unknown>) =>
        fallaCon(
          tx.savepoint(
            (s) => s`INSERT INTO indicador_versiones ${s({ indicador_id: indicadorId, numero: numero++, tipo_cambio: "inicial", creado_por: b.usuarioId, estado: "descartada", ...campos } as never)}`,
          ),
        );
      const coherente = rechazo("indicador_versiones_automatica_coherente");
      expect(await crear({ origen_dato: "automatico" })).toEqual(coherente);
      expect(await crear({ origen_dato: "automatico", calculo: "acuses" })).toEqual(coherente);
      expect(await crear({ origen_dato: "automatico", calculo_alcance: "entidad" })).toEqual(coherente);
      // Con alcance: el CHECK compara «automática» con «cálculo y alcance»; sin alcance, una manual con cálculo entra.
      expect(await crear({ origen_dato: "manual", calculo: "acuses", calculo_alcance: "entidad" })).toEqual(coherente);
      expect(await crear({ origen_dato: "manual", calculo_alcance: "otro" })).toEqual(rechazo("indicador_versiones_alcance_valido"));
      expect(await crear({ origen_dato: "automatico", calculo: "acuses", calculo_alcance: "otro" })).toEqual(
        rechazo("indicador_versiones_alcance_valido"),
      );
      expect(await crear({})).toBeNull();
      for (const alcance of ["entidad", "proceso", "calidad", "institucional", "todos"]) {
        expect(await crear({ origen_dato: "automatico", calculo: "acuses", calculo_alcance: alcance }), alcance).toBeNull();
      }
    }));

  it("a lo sumo un indicador activo por cálculo y alcance; con alcance «proceso», por proceso", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      // Una ficha de este cálculo ya confirmada (la demo) chocaría con las de la prueba: se aparta dentro de la transacción.
      await tx`UPDATE indicadores SET calculo = NULL, calculo_alcance = NULL WHERE calculo = 'acuses'`;
      const crear = (campos: Record<string, unknown>) =>
        fallaCon(
          tx.savepoint(
            (s) => s`INSERT INTO indicadores ${s({ codigo: codigoUnico(), proceso_id: b.procesoA, creado_por: b.usuarioId, estado: "activo", calculo: "acuses", ...campos } as never)}`,
          ),
        );
      const unico = rechazo("indicadores_calculo_unico", "23505");
      const baja = { estado: "retirado", baja_por: b.usuarioId, baja_en: new Date(), baja_motivo: "Ya no se mide" };

      expect(await crear({ calculo_alcance: "entidad" })).toBeNull();
      expect(await crear({ calculo_alcance: "entidad" })).toEqual(unico);
      expect(await crear({ calculo_alcance: "entidad", proceso_id: b.procesoB })).toEqual(unico);
      expect(await crear({ calculo_alcance: "entidad", ...baja })).toBeNull();
      expect(await crear({ calculo_alcance: "entidad", estado: "borrador" })).toBeNull();

      expect(await crear({ calculo_alcance: "proceso" })).toBeNull();
      expect(await crear({ calculo_alcance: "proceso", proceso_id: b.procesoB })).toBeNull();
      expect(await crear({ calculo_alcance: "proceso" })).toEqual(unico);

      const coherente = rechazo("indicadores_calculo_coherente");
      expect(await crear({ calculo_alcance: null })).toEqual(coherente);
      expect(await crear({ calculo: null, calculo_alcance: "entidad" })).toEqual(coherente);
    }));

  it("una constancia registrada exige fecha de envío, radicado, quién y cuándo; el estado es de su lista", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const indicadorId = await indicador(tx, b);
      const crear = (periodo: string, campos: Record<string, unknown>) =>
        fallaCon(
          tx.savepoint(
            (s) => s`INSERT INTO reportes_externos ${s({ indicador_id: indicadorId, periodo, desde: new Date("2026-01-01T05:00:00Z"), hasta: new Date("2026-04-01T05:00:00Z"), vence_en: new Date("2026-04-16T05:00:00Z"), ente: "Superintendencia", ...campos } as never)}`,
          ),
        );
      const registro = { estado: "registrada", fecha_envio: "2026-04-10", radicado: "R-2026-001", registrada_por: b.usuarioId, registrada_en: new Date() };
      const coherente = rechazo("reportes_externos_registrada_coherente");

      expect(await crear("2026-T1", { ...registro, radicado: null })).toEqual(coherente);
      expect(await crear("2026-T1", { ...registro, fecha_envio: null })).toEqual(coherente);
      expect(await crear("2026-T1", { ...registro, registrada_por: null })).toEqual(coherente);
      expect(await crear("2026-T1", { ...registro, estado: "pendiente" })).toEqual(coherente);
      expect(await crear("2026-T1", { estado: "enviada" })).toEqual(rechazo("reportes_externos_estado_valido"));
      expect((await crear("2026-T1", { ente: null }))?.codigo).toBe("23502");
      expect(await crear("2026-T1", registro)).toBeNull();
      expect(await crear("2026-T1", {})).toEqual(rechazo("reportes_externos_unico", "23505"));

      expect(await crear("2026-T2", {})).toBeNull();
      const [f] = await tx`SELECT estado, corregida, creado_en FROM reportes_externos WHERE indicador_id = ${indicadorId} AND periodo = '2026-T2'`;
      expect(f.estado).toBe("pendiente");
      expect(f.corregida).toBe(false);
      expect(f.creado_en).toBeInstanceOf(Date);
    }));

  it("el historial de una constancia admite solo sus tipos", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const reporteId = await constancia(tx, await indicador(tx, b));
      const crear = (tipo: string) =>
        fallaCon(tx.savepoint((s) => s`INSERT INTO reporte_externo_eventos (reporte_id, tipo, usuario_id) VALUES (${reporteId}, ${tipo}, ${b.usuarioId})`));
      for (const tipo of ["registro", "correccion", "soporte"]) expect(await crear(tipo), tipo).toBeNull();
      expect(await crear("otro")).toEqual(rechazo("reporte_externo_eventos_tipo_valido"));
      const [e] = await tx`SELECT detalle FROM reporte_externo_eventos WHERE reporte_id = ${reporteId} AND tipo = 'registro'`;
      expect(e.detalle).toEqual({});
    }));

  it("un impacto resuelto exige resolución, quién y cuándo; estado y resolución son de su lista", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const [tn] = await tx`SELECT id FROM tipos_norma ORDER BY id LIMIT 1`;
      const [n] = await tx`INSERT INTO normas (tipo_norma_id, numero, anio, entidad_emisora, titulo, creado_por)
        VALUES (${tn.id}, ${codigoUnico()}, 2026, 'Ministerio', 'Norma de prueba', ${b.usuarioId}) RETURNING id`;
      const [c] = await tx`INSERT INTO norma_cambios (norma_id, estado_anterior, estado_nuevo, fecha, usuario_id)
        VALUES (${n.id}, 'vigente', 'modificada', '2026-03-01', ${b.usuarioId}) RETURNING id`;
      const crear = async (campos: Record<string, unknown>) => {
        const indicadorId = await indicador(tx, b);
        return fallaCon(
          tx.savepoint(
            (s) => s`INSERT INTO impactos_indicadores ${s({ norma_cambio_id: c.id, norma_id: n.id, indicador_id: indicadorId, vence_en: new Date("2026-03-31T05:00:00Z"), ...campos } as never)} RETURNING id`,
          ),
        );
      };
      const resuelto = { estado: "resuelto", resolucion: "no_afecta", resuelto_por: b.usuarioId, resuelto_en: new Date() };
      const coherente = rechazo("impactos_indicadores_resuelto_coherente");

      expect(await crear({ ...resuelto, resolucion: null })).toEqual(coherente);
      expect(await crear({ ...resuelto, resuelto_por: null })).toEqual(coherente);
      expect(await crear({ ...resuelto, estado: "pendiente" })).toEqual(coherente);
      expect(await crear({ estado: "cerrado" })).toEqual(rechazo("impactos_indicadores_estado_valido"));
      expect(await crear({ ...resuelto, resolucion: "otra" })).toEqual(rechazo("impactos_indicadores_resolucion_valida"));
      for (const resolucion of ["no_afecta", "nueva_version", "retiro"]) {
        expect(await crear({ ...resuelto, resolucion }), resolucion).toBeNull();
      }
      expect(await crear({})).toBeNull();
      const [f] = await tx`SELECT estado, creado_en FROM impactos_indicadores WHERE norma_cambio_id = ${c.id} AND resolucion IS NULL`;
      expect(f.estado).toBe("pendiente");
      expect(f.creado_en).toBeInstanceOf(Date);
    }));

  it("medicion_eventos admite el tipo «foto»", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const indicadorId = await indicador(tx, b);
      const [v] = await tx`INSERT INTO indicador_versiones (indicador_id, numero, tipo_cambio, creado_por)
        VALUES (${indicadorId}, 1, 'inicial', ${b.usuarioId}) RETURNING id`;
      const [m] = await tx`INSERT INTO mediciones (indicador_id, version_id, periodo, desde, hasta, vence_en)
        VALUES (${indicadorId}, ${v.id}, '2026-01', '2026-01-01', '2026-01-31', '2026-02-10') RETURNING id`;
      const crear = (tipo: string) =>
        fallaCon(tx.savepoint((s) => s`INSERT INTO medicion_eventos (medicion_id, tipo) VALUES (${m.id}, ${tipo})`));
      expect(await crear("foto")).toBeNull();
      expect(await crear("otro")).toEqual(rechazo("medicion_eventos_tipo_valido"));
    }));

  describe("el bloque de seguridad del principio de cada migración", () => {
    const MENSAJE = "Las tablas de la 14B tienen filas: la migración no las rehace";

    /** Corre el bloque contra tablas temporales del mismo nombre, que en la sesión ocultan a las reales. */
    const correr = (tx: TransactionSql, bloque: string) => fallaCon(tx.savepoint((s) => s.unsafe(bloque)));
    const mensajeDe = (tx: TransactionSql, bloque: string) =>
      tx.savepoint((s) => s.unsafe(bloque)).then(
        () => null,
        (e: { code?: string; message: string }) => ({ codigo: e.code, mensaje: e.message }),
      );

    it("la 0013 se detiene si reportes_externos o impactos_indicadores tienen filas", () =>
      revertida(sql, async (tx) => {
        const bloque = primeraSentencia("0013");
        expect(bloque.startsWith("DO $$")).toBe(true);
        await tx`CREATE TEMP TABLE reportes_externos (id int)`;
        await tx`CREATE TEMP TABLE impactos_indicadores (id int)`;
        expect(await correr(tx, bloque)).toBeNull();
        await tx`INSERT INTO pg_temp.impactos_indicadores VALUES (1)`;
        expect(await mensajeDe(tx, bloque)).toEqual({ codigo: "P0001", mensaje: MENSAJE });
        await tx`DELETE FROM pg_temp.impactos_indicadores`;
        await tx`INSERT INTO pg_temp.reportes_externos VALUES (1)`;
        expect(await mensajeDe(tx, bloque)).toEqual({ codigo: "P0001", mensaje: MENSAJE });
      }));

    it("la 0014 se detiene si calculo_fotos tiene filas", () =>
      revertida(sql, async (tx) => {
        const bloque = primeraSentencia("0014");
        expect(bloque.startsWith("DO $$")).toBe(true);
        await tx`CREATE TEMP TABLE calculo_fotos (id int)`;
        expect(await correr(tx, bloque)).toBeNull();
        await tx`INSERT INTO pg_temp.calculo_fotos VALUES (1)`;
        expect(await mensajeDe(tx, bloque)).toEqual({ codigo: "P0001", mensaje: MENSAJE });
      }));
  });

  // Con la conexión del dueño: el REVOKE de sgc_app no interviene, así que el error es el del trigger.
  it.skipIf(!process.env.DATABASE_URL_MIGRADOR)("el trigger frena también al dueño en el historial de una constancia", async () => {
    const dueno = postgres(process.env.DATABASE_URL_MIGRADOR!, { max: 1, types: TIPOS_SQL });
    try {
      await revertida(dueno, async (tx) => {
        const b = await base(tx);
        const reporteId = await constancia(tx, await indicador(tx, b));
        const [e] = await tx`INSERT INTO reporte_externo_eventos (reporte_id, tipo, usuario_id) VALUES (${reporteId}, 'registro', ${b.usuarioId}) RETURNING id`;
        const mensaje = async (consulta: () => PromiseLike<unknown>) => {
          await tx`SAVEPOINT m`;
          try {
            await consulta();
            await tx`RELEASE SAVEPOINT m`;
            return null;
          } catch (err) {
            await tx`ROLLBACK TO SAVEPOINT m`;
            return err as { code?: string; message: string };
          }
        };
        const casos = [
          () => tx`UPDATE reporte_externo_eventos SET tipo = 'correccion' WHERE id = ${e.id}`,
          () => tx`DELETE FROM reporte_externo_eventos WHERE id = ${e.id}`,
        ];
        for (const caso of casos) {
          const err = await mensaje(caso);
          expect(err?.code).toBe("42501");
          expect(err?.message).not.toMatch(/permission denied|permiso denegado/i);
        }
        // Sin el trigger, el dueño sí podría: la prueba mide el trigger y no un permiso.
        await tx`DROP TRIGGER reporte_externo_eventos_inmutable ON reporte_externo_eventos`;
        expect(await mensaje(casos[0])).toBeNull();
      });
    } finally {
      await dueno.end();
    }
  });
});
