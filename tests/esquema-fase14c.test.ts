/**
 * Esquema de la Fase 14C (migración 0015): los datos compartidos con sus periodos y su historial de solo inserción, las
 * dimensiones y sus categorías sin distinguir mayúsculas, la dimensión y los componentes firmados en la ficha, y lo que
 * la medición guarda de sus categorías. Nada queda confirmado: todo corre dentro de una transacción que se revierte.
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

/** Un sufijo único por corrida: los nombres de la prueba no chocan con los de la demo ni con los de otra corrida. */
const sufijo = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function base(tx: TransactionSql) {
  const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
  const procesos = await tx`SELECT id FROM procesos ORDER BY id LIMIT 2`;
  return { usuarioId: u.id as number, procesoA: procesos[0].id as number, procesoB: procesos[1].id as number };
}

async function indicador(tx: TransactionSql, b: { usuarioId: number; procesoA: number }) {
  const [i] = await tx`INSERT INTO indicadores (codigo, proceso_id, creado_por) VALUES (${`zz-14c-${sufijo()}`}, ${b.procesoA}, ${b.usuarioId}) RETURNING id`;
  return i.id as number;
}

/** Una versión en borrador del indicador. */
async function version(tx: TransactionSql, indicadorId: number, usuarioId: number) {
  const [v] = await tx`INSERT INTO indicador_versiones (indicador_id, numero, tipo_cambio, creado_por)
    VALUES (${indicadorId}, 1, 'inicial', ${usuarioId}) RETURNING id`;
  return v.id as number;
}

async function dimension(tx: TransactionSql, nombre = `zz Dimensión ${sufijo()}`) {
  const [d] = await tx`INSERT INTO dimensiones (nombre, orden) VALUES (${nombre}, 1) RETURNING id`;
  return d.id as number;
}

/** Un dato compartido mensual del proceso. */
async function dato(tx: TransactionSql, procesoId: number, nombre = `zz Dato ${sufijo()}`) {
  const [d] = await tx`INSERT INTO variables_compartidas (proceso_id, nombre, periodicidad, consolidacion, plazo_reporte_dias)
    VALUES (${procesoId}, ${nombre}, 'mensual', 'suma', 10) RETURNING id`;
  return d.id as number;
}

/** Un periodo pendiente del dato. */
async function periodoDeDato(tx: TransactionSql, variableId: number) {
  const [p] = await tx`INSERT INTO variable_valores (variable_id, periodo, desde, hasta, vence_en)
    VALUES (${variableId}, '2026-01', '2026-01-01T05:00:00Z', '2026-02-01T05:00:00Z', '2026-02-11T05:00:00Z') RETURNING id`;
  return p.id as number;
}

describe("esquema de la migración 0015", () => {
  let sql: Sql;

  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, types: TIPOS_SQL });
  });
  afterAll(async () => {
    await sql.end();
  });

  it("variable_eventos existe y las columnas nuevas existen con su tipo", async () => {
    const tablas = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'variable_eventos'`;
    expect(tablas.map((t) => t.table_name)).toEqual(["variable_eventos"]);

    const filas = await sql`SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN ('variables_compartidas', 'variable_responsables', 'variable_valores',
        'variable_eventos', 'dimensiones', 'dimension_categorias', 'indicador_versiones', 'indicador_variables',
        'medicion_valores', 'mediciones')`;
    const tipos = Object.fromEntries(
      filas.map((f) => [`${f.table_name}.${f.column_name}`, `${f.data_type}${f.is_nullable === "NO" ? " NOT NULL" : ""}`]),
    );
    const TZ = "timestamp with time zone";
    const esperado: Record<string, string> = {
      "variables_compartidas.periodicidad": "text NOT NULL",
      "variables_compartidas.consolidacion": "text NOT NULL",
      "variables_compartidas.plazo_reporte_dias": "integer NOT NULL",
      "variables_compartidas.creado_por": "bigint",
      "variables_compartidas.creado_en": `${TZ} NOT NULL`,
      "variable_responsables.designado_por": "bigint",
      "variable_responsables.designado_en": `${TZ} NOT NULL`,
      "variable_valores.desde": `${TZ} NOT NULL`,
      "variable_valores.hasta": `${TZ} NOT NULL`,
      "variable_valores.vence_en": `${TZ} NOT NULL`,
      "variable_valores.categoria_id": "bigint",
      "variable_valores.por_categoria": "jsonb",
      "variable_valores.categorias": "jsonb",
      "variable_valores.corregido": "boolean NOT NULL",
      "variable_valores.reabierto_por": "bigint",
      "variable_valores.reabierto_en": TZ,
      "variable_valores.reapertura_justificacion": "text",
      "variable_valores.escalado_en": TZ,
      "variable_valores.creado_en": `${TZ} NOT NULL`,
      "variable_eventos.id": "bigint NOT NULL",
      "variable_eventos.valor_id": "bigint NOT NULL",
      "variable_eventos.tipo": "text NOT NULL",
      "variable_eventos.usuario_id": "bigint",
      "variable_eventos.detalle": "jsonb NOT NULL",
      "variable_eventos.creado_en": `${TZ} NOT NULL`,
      "dimensiones.orden": "integer NOT NULL",
      "dimensiones.activo": "boolean NOT NULL",
      "dimension_categorias.creado_en": `${TZ} NOT NULL`,
      "dimension_categorias.desactivada_en": TZ,
      "indicador_versiones.dimension_nombre": "text",
      "indicador_variables.dato_periodicidad": "text",
      "indicador_variables.origen_codigo": "text",
      "indicador_variables.origen_nombre": "text",
      "medicion_valores.valor_exacto": "text",
      "mediciones.categorias": "jsonb",
      "mediciones.categorias_en_critico": "integer",
    };
    for (const [columna, tipo] of Object.entries(esperado)) expect(tipos[columna], columna).toBe(tipo);
  });

  it("los índices nuevos existen y las dos unicidades con NULLS NOT DISTINCT se conservan", async () => {
    const nombres = [
      "variables_compartidas_nombre_idx", "variable_responsables_usuario_idx", "variable_valores_estado_vence_idx",
      "variable_eventos_valor_idx", "dimensiones_nombre_idx", "dimension_categorias_nombre_idx",
      "indicador_variables_dato_idx", "indicador_variables_origen_idx", "medicion_valores_categoria_idx",
    ];
    const filas = await sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY(${nombres})`;
    expect(filas.map((f) => f.indexname as string).sort()).toEqual([...nombres].sort());

    const unicos = await sql`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'
      AND indexname IN ('medicion_valores_unico_idx', 'variable_valores_unico_idx') ORDER BY indexname`;
    expect(unicos.map((f) => f.indexname)).toEqual(["medicion_valores_unico_idx", "variable_valores_unico_idx"]);
    for (const f of unicos) expect(f.indexdef, f.indexname as string).toMatch(/NULLS NOT DISTINCT/);

    // Las unicidades viejas, sensibles a mayúsculas, ya no están.
    const viejas = await sql`SELECT conname FROM pg_constraint WHERE conname IN ('variables_compartidas_unica', 'dimensiones_nombre_unique')`;
    expect(viejas).toHaveLength(0);
  });

  it("una variable de la ficha lleva la referencia de su origen, y solo la que toma de un indicador dice qué toma", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const indicadorId = await indicador(tx, b);
      const versionId = await version(tx, indicadorId, b.usuarioId);
      const otroIndicador = await indicador(tx, b);
      const datoId = await dato(tx, b.procesoA);
      let letra = 0;
      const crear = (campos: Record<string, unknown>) =>
        fallaCon(
          tx.savepoint(
            (s) => s`INSERT INTO indicador_variables ${s({ version_id: versionId, letra: String.fromCharCode(65 + letra++), ...campos } as never)}`,
          ),
        );
      const coherente = rechazo("indicador_variables_origen_coherente");

      expect(await crear({ origen: "compartida" })).toEqual(coherente);
      expect(await crear({ origen: "indicador", indicador_origen_id: otroIndicador })).toEqual(coherente);
      expect(await crear({ origen: "indicador", toma: "valor" })).toEqual(coherente);
      expect(await crear({ origen: "propia", indicador_origen_id: otroIndicador })).toEqual(coherente);
      expect(await crear({ origen: "propia", variable_compartida_id: datoId })).toEqual(coherente);
      expect(await crear({ origen: "propia", toma: "valor" })).toEqual(coherente);
      expect(await crear({ origen: "compartida", variable_compartida_id: datoId, toma: "valor" })).toEqual(coherente);

      expect(await crear({ origen: "propia" })).toBeNull();
      expect(await crear({ origen: "automatica" })).toBeNull();
      expect(await crear({ origen: "compartida", variable_compartida_id: datoId, dato_periodicidad: "mensual" })).toBeNull();
      expect(
        await crear({ origen: "indicador", indicador_origen_id: otroIndicador, toma: "cumplimiento", origen_codigo: "SGC-ID-001", origen_nombre: "Otro" }),
      ).toBeNull();
    }));

  it("una versión automática no lleva dimensión, y la dimensión se firma con su nombre", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const indicadorId = await indicador(tx, b);
      const dimensionId = await dimension(tx);
      let numero = 1;
      const crear = (campos: Record<string, unknown>) =>
        fallaCon(
          tx.savepoint(
            (s) => s`INSERT INTO indicador_versiones ${s({ indicador_id: indicadorId, numero: numero++, tipo_cambio: "inicial", creado_por: b.usuarioId, estado: "descartada", ...campos } as never)}`,
          ),
        );
      const automatica = { origen_dato: "automatico", calculo: "acuses", calculo_alcance: "entidad" };

      expect(await crear({ ...automatica, dimension_id: dimensionId, dimension_nombre: "Sede" })).toEqual(
        rechazo("indicador_versiones_dimension_manual"),
      );
      const coherente = rechazo("indicador_versiones_dimension_coherente");
      expect(await crear({ dimension_id: dimensionId })).toEqual(coherente);
      expect(await crear({ dimension_nombre: "Sede" })).toEqual(coherente);

      expect(await crear({ dimension_id: dimensionId, dimension_nombre: "Sede" })).toBeNull();
      expect(await crear(automatica)).toBeNull();
    }));

  it("dimensiones y categorías no distinguen mayúsculas; una categoría es única dentro de su dimensión", () =>
    revertida(sql, async (tx) => {
      const nombre = `zz Sede ${sufijo()}`;
      const crearDimension = (n: string) =>
        fallaCon(tx.savepoint((s) => s`INSERT INTO dimensiones (nombre, orden) VALUES (${n}, 1)`));
      expect(await crearDimension(nombre)).toBeNull();
      expect(await crearDimension(nombre.toLowerCase())).toEqual(rechazo("dimensiones_nombre_idx", "23505"));
      expect((await fallaCon(tx.savepoint((s) => s`INSERT INTO dimensiones (nombre) VALUES (${`zz Sin orden ${sufijo()}`})`)))?.codigo).toBe("23502");
      const [d] = await tx`SELECT activo FROM dimensiones WHERE nombre = ${nombre}`;
      expect(d.activo).toBe(true);

      const una = await dimension(tx);
      const otra = await dimension(tx);
      const crearCategoria = (dimensionId: number, n: string) =>
        fallaCon(tx.savepoint((s) => s`INSERT INTO dimension_categorias (dimension_id, nombre, orden) VALUES (${dimensionId}, ${n}, 1)`));
      expect(await crearCategoria(una, "Norte")).toBeNull();
      expect(await crearCategoria(una, "NORTE")).toEqual(rechazo("dimension_categorias_nombre_idx", "23505"));
      expect(await crearCategoria(otra, "NORTE")).toBeNull();
      const [c] = await tx`SELECT creado_en, desactivada_en FROM dimension_categorias WHERE dimension_id = ${una}`;
      expect(c.creado_en).toBeInstanceOf(Date);
      expect(c.desactivada_en).toBeNull();
    }));

  it("un dato compartido: nombre único por proceso sin distinguir mayúsculas, periodicidad, cómo se junta y plazo de su lista", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const nombre = `zz Total facturado ${sufijo()}`;
      const crear = (campos: Record<string, unknown>) =>
        fallaCon(
          tx.savepoint(
            (s) => s`INSERT INTO variables_compartidas ${s({ proceso_id: b.procesoA, nombre: `zz Dato ${sufijo()}`, periodicidad: "mensual", consolidacion: "suma", plazo_reporte_dias: 10, ...campos } as never)}`,
          ),
        );
      expect(await crear({ nombre, creado_por: b.usuarioId })).toBeNull();
      expect(await crear({ nombre: nombre.toLowerCase() })).toEqual(rechazo("variables_compartidas_nombre_idx", "23505"));
      expect(await crear({ nombre: nombre.toLowerCase(), proceso_id: b.procesoB })).toBeNull();

      expect(await crear({ periodicidad: "semanal" })).toEqual(rechazo("variables_compartidas_periodicidad_valida"));
      expect(await crear({ consolidacion: "maximo" })).toEqual(rechazo("variables_compartidas_consolidacion_valida"));
      expect(await crear({ plazo_reporte_dias: 91 })).toEqual(rechazo("variables_compartidas_plazo_valido"));
      expect(await crear({ plazo_reporte_dias: -1 })).toEqual(rechazo("variables_compartidas_plazo_valido"));
      for (const campo of ["periodicidad", "consolidacion", "plazo_reporte_dias"]) {
        expect((await crear({ [campo]: null }))?.codigo, campo).toBe("23502");
      }
      for (const periodicidad of ["mensual", "bimestral", "trimestral", "semestral", "anual"]) {
        expect(await crear({ periodicidad }), periodicidad).toBeNull();
      }
      for (const consolidacion of ["suma", "ultimo", "promedio"]) {
        expect(await crear({ consolidacion }), consolidacion).toBeNull();
      }
      expect(await crear({ plazo_reporte_dias: 0 })).toBeNull();
      expect(await crear({ plazo_reporte_dias: 90 })).toBeNull();
      const [f] = await tx`SELECT creado_por, creado_en FROM variables_compartidas WHERE nombre = ${nombre}`;
      expect(f.creado_por).toBe(b.usuarioId);
      expect(f.creado_en).toBeInstanceOf(Date);
    }));

  it("un periodo del dato: estado de su lista, y reportado exige valor y cuándo", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const datoId = await dato(tx, b.procesoA);
      let mes = 1;
      const crear = (campos: Record<string, unknown>) =>
        fallaCon(
          tx.savepoint(
            (s) => s`INSERT INTO variable_valores ${s({ variable_id: datoId, periodo: `2026-${String(mes++).padStart(2, "0")}`, desde: new Date("2026-01-01T05:00:00Z"), hasta: new Date("2026-02-01T05:00:00Z"), vence_en: new Date("2026-02-11T05:00:00Z"), ...campos } as never)}`,
          ),
        );
      const reportado = { estado: "reportado", valor: 12.5, reportado_por: b.usuarioId, reportado_en: new Date() };
      const coherente = rechazo("variable_valores_reportado_coherente");

      expect(await crear({ ...reportado, valor: null })).toEqual(coherente);
      expect(await crear({ ...reportado, reportado_en: null })).toEqual(coherente);
      expect(await crear({ estado: "otro" })).toEqual(rechazo("variable_valores_estado_valido"));
      for (const campo of ["desde", "hasta", "vence_en"]) {
        expect((await crear({ [campo]: null }))?.codigo, campo).toBe("23502");
      }
      expect(await crear(reportado)).toBeNull();
      expect(await crear({ ...reportado, estado: "cerrado" })).toBeNull();
      expect(await crear({ por_categoria: tx.json({ "1": "4", "2": "8.5" }), categorias: tx.json([{ id: 1, nombre: "Norte" }]) })).toBeNull();
      expect(await crear({})).toBeNull();
      const [f] = await tx`SELECT estado, corregido, creado_en, categoria_id FROM variable_valores WHERE variable_id = ${datoId} ORDER BY id DESC LIMIT 1`;
      expect(f).toEqual({ estado: "pendiente", corregido: false, creado_en: expect.any(Date), categoria_id: null });
    }));

  it("el historial de un periodo del dato admite solo sus tipos, con o sin persona", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const valorId = await periodoDeDato(tx, await dato(tx, b.procesoA));
      const crear = (tipo: string, usuarioId: number | null = b.usuarioId) =>
        fallaCon(tx.savepoint((s) => s`INSERT INTO variable_eventos (valor_id, tipo, usuario_id) VALUES (${valorId}, ${tipo}, ${usuarioId})`));
      for (const tipo of ["reporte", "correccion", "soporte", "cierre", "reapertura"]) expect(await crear(tipo), tipo).toBeNull();
      expect(await crear("cierre", null)).toBeNull();
      expect(await crear("otro")).toEqual(rechazo("variable_eventos_tipo_valido"));
      const [e] = await tx`SELECT detalle, creado_en FROM variable_eventos WHERE valor_id = ${valorId} AND tipo = 'reporte'`;
      expect(e.detalle).toEqual({});
      expect(e.creado_en).toBeInstanceOf(Date);
    }));

  it("archivos admite el contexto del dato compartido y medicion_eventos los tipos «propagacion» y «categorias»", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const archivo = (contexto: string) =>
        fallaCon(
          tx.savepoint(
            (s) => s`INSERT INTO archivos (contexto, contexto_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
              VALUES (${contexto}, 1, 'evidencia', ${`zz/${sufijo()}-${contexto}`}, 'x.pdf', 'pdf', 'application/pdf', 10, 'h')`,
          ),
        );
      expect(await archivo("dato_compartido")).toBeNull();
      expect(await archivo("otro")).toEqual(rechazo("archivos_contexto_valido"));

      const indicadorId = await indicador(tx, b);
      const versionId = await version(tx, indicadorId, b.usuarioId);
      const [m] = await tx`INSERT INTO mediciones (indicador_id, version_id, periodo, desde, hasta, vence_en, categorias, categorias_en_critico)
        VALUES (${indicadorId}, ${versionId}, '2026-01', '2026-01-01', '2026-01-31', '2026-02-10', ${tx.json([{ id: 1, nombre: "Norte" }])}, 1) RETURNING id`;
      const evento = (tipo: string) =>
        fallaCon(tx.savepoint((s) => s`INSERT INTO medicion_eventos (medicion_id, tipo) VALUES (${m.id}, ${tipo})`));
      expect(await evento("propagacion")).toBeNull();
      expect(await evento("categorias")).toBeNull();
      expect(await evento("foto")).toBeNull();
      expect(await evento("otro")).toEqual(rechazo("medicion_eventos_tipo_valido"));
    }));

  it("medicion_valores conserva su unicidad también sin categoría, y guarda la fracción exacta", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const indicadorId = await indicador(tx, b);
      const versionId = await version(tx, indicadorId, b.usuarioId);
      const [m] = await tx`INSERT INTO mediciones (indicador_id, version_id, periodo, desde, hasta, vence_en)
        VALUES (${indicadorId}, ${versionId}, '2026-01', '2026-01-01', '2026-01-31', '2026-02-10') RETURNING id`;
      const [v] = await tx`INSERT INTO indicador_variables (version_id, letra) VALUES (${versionId}, 'A') RETURNING id`;
      const valor = () =>
        fallaCon(
          tx.savepoint((s) => s`INSERT INTO medicion_valores (medicion_id, variable_id, categoria_id, valor, valor_exacto) VALUES (${m.id}, ${v.id}, NULL, 0.3333, '1/3')`),
        );
      expect(await valor()).toBeNull();
      expect(await valor()).toEqual(rechazo("medicion_valores_unico_idx", "23505"));
      const [f] = await tx`SELECT valor_exacto FROM medicion_valores WHERE medicion_id = ${m.id}`;
      expect(f.valor_exacto).toBe("1/3");
    }));

  describe("el bloque de seguridad del principio de la migración", () => {
    const MENSAJE = "Las tablas de la 14C tienen filas: la migración no las rehace";
    const TABLAS = ["variables_compartidas", "variable_responsables", "variable_valores", "dimensiones", "dimension_categorias"];

    const mensajeDe = (tx: TransactionSql, bloque: string) =>
      tx.savepoint((s) => s.unsafe(bloque)).then(
        () => null,
        (e: { code?: string; message: string }) => ({ codigo: e.code, mensaje: e.message }),
      );

    it("la 0015 se detiene si alguna de las cinco tablas de la 14C tiene filas", () =>
      revertida(sql, async (tx) => {
        const bloque = primeraSentencia("0015");
        expect(bloque.startsWith("DO $$")).toBe(true);
        // Tablas temporales del mismo nombre, que en la sesión ocultan a las reales.
        for (const tabla of TABLAS) await tx.unsafe(`CREATE TEMP TABLE ${tabla} (id int)`);
        expect(await mensajeDe(tx, bloque)).toBeNull();
        for (const tabla of TABLAS) {
          await tx.unsafe(`INSERT INTO pg_temp.${tabla} VALUES (1)`);
          expect(await mensajeDe(tx, bloque), tabla).toEqual({ codigo: "P0001", mensaje: MENSAJE });
          await tx.unsafe(`DELETE FROM pg_temp.${tabla}`);
        }
      }));
  });

  // Con la conexión del dueño: el REVOKE de sgc_app no interviene, así que el error es el del trigger.
  it.skipIf(!process.env.DATABASE_URL_MIGRADOR)("el trigger frena también al dueño en el historial de un periodo del dato", async () => {
    const dueno = postgres(process.env.DATABASE_URL_MIGRADOR!, { max: 1, types: TIPOS_SQL });
    try {
      await revertida(dueno, async (tx) => {
        const b = await base(tx);
        const valorId = await periodoDeDato(tx, await dato(tx, b.procesoA));
        const [e] = await tx`INSERT INTO variable_eventos (valor_id, tipo, usuario_id) VALUES (${valorId}, 'reporte', ${b.usuarioId}) RETURNING id`;
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
          () => tx`UPDATE variable_eventos SET tipo = 'correccion' WHERE id = ${e.id}`,
          () => tx`DELETE FROM variable_eventos WHERE id = ${e.id}`,
        ];
        for (const caso of casos) {
          const err = await mensaje(caso);
          expect(err?.code).toBe("42501");
          expect(err?.message).not.toMatch(/permission denied|permiso denegado/i);
        }
        // Sin el trigger, el dueño sí podría: la prueba mide el trigger y no un permiso.
        await tx`DROP TRIGGER variable_eventos_inmutable ON variable_eventos`;
        expect(await mensaje(casos[0])).toBeNull();
      });
    } finally {
      await dueno.end();
    }
  });
});
