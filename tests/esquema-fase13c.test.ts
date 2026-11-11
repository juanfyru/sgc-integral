/**
 * Esquema de la Fase 13C (migraciones 0008, 0009 y 0010): vigencia, externos, revisión anual,
 * normograma y lo heredado de la 13B. Requiere la BD de desarrollo migrada
 * (npm run db:preparar); no exige la demo recién sembrada.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql, TransactionSql } from "postgres";
import postgres from "postgres";
import { TIPOS_SQL } from "@/db/cliente";
import { TIPOS_NORMA } from "@/db/semillas/minima";
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

const MIGRACION_0008 = "0008_fase13c-vigencia-externos-normograma.sql";
const MIGRACION_0009 = "0009_fase13c-tipos-norma-y-endurecimiento.sql";
const MIGRACION_0010 = "0010_fase13c-baja-de-relaciones.sql";

/** Un tipo de norma y una norma propios de la prueba: la base no trae tipos de norma hasta resembrar. */
async function normaDePrueba(tx: TransactionSql, usuarioId: number, numero = "3100") {
  const [t] = await tx`INSERT INTO tipos_norma (nombre, orden) VALUES (${"zz_Resolucion_13c_" + numero}, 99) RETURNING id`;
  const [n] = await tx`INSERT INTO normas (tipo_norma_id, numero, anio, entidad_emisora, titulo, creado_por)
    VALUES (${t.id}, ${numero}, 2019, 'Ministerio de Salud y Protección Social',
      'Por la cual se definen los procedimientos y condiciones de inscripción y habilitación de los servicios de salud', ${usuarioId})
    RETURNING id`;
  return { tipoId: t.id as number, normaId: n.id as number };
}

describe("esquema de la Fase 13C", () => {
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

  it("firmas: sin trámite solo para ratifico y adopto", () =>
    revertida(sql, async (tx) => {
      const [v] = await tx`SELECT v.id FROM documento_versiones v WHERE v.estado = 'vigente' LIMIT 1`;
      const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
      const firmar = (firma: string, tramiteId: number | null) =>
        tx.savepoint(
          (s) => s`INSERT INTO firmas (tramite_id, version_id, usuario_id, firma, ronda, hash_sha256, nombre_firmante, metodo)
            VALUES (${tramiteId}, ${v.id}, ${u.id}, ${firma}, 0, 'x', 'Alguien', 'clave')`,
        );
      await firmar("ratifico", null);
      await firmar("adopto", null);
      expect(await fallaCon(firmar("aprobo", null))).toBe("23514");
      expect(await fallaCon(firmar("otra", null))).toBe("23514");
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM firmas WHERE tramite_id IS NULL AND firma NOT IN ('ratifico', 'adopto')`;
      expect(n).toBe(0);
    }));

  it("documentos: origen, plazo y fecha fijada coherente", () =>
    revertida(sql, async (tx) => {
      const [d] = await tx`SELECT id FROM documentos WHERE proxima_revision_fijada IS NULL AND fijada_por IS NULL ORDER BY id LIMIT 1`;
      const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
      expect(await fallaCon(tx.savepoint((s) => s`UPDATE documentos SET origen = 'otro' WHERE id = ${d.id}`))).toBe("23514");
      expect(await fallaCon(tx.savepoint((s) => s`UPDATE documentos SET meses_revision = 0 WHERE id = ${d.id}`))).toBe("23514");
      expect(await fallaCon(tx.savepoint((s) => s`UPDATE documentos SET meses_revision = 121 WHERE id = ${d.id}`))).toBe("23514");
      expect(await fallaCon(tx.savepoint((s) => s`UPDATE documentos SET proxima_revision_fijada = '2027-01-01' WHERE id = ${d.id}`))).toBe("23514");
      await tx`UPDATE documentos SET origen = 'externo', meses_revision = 24, proxima_revision_fijada = '2027-01-01',
        fijada_por = ${u.id}, fijada_en = now(), fijada_nota = 'prueba' WHERE id = ${d.id}`;
      expect(await fallaCon(tx.savepoint((s) => s`UPDATE tipos_documento SET meses_revision = 0 WHERE id = (SELECT min(id) FROM tipos_documento)`))).toBe("23514");
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM tipos_documento WHERE meses_revision <> 12`;
      expect(n).toBe(0);
      const [de] = await tx`SELECT nombre, autoridad, es_diligenciable FROM tipos_documento WHERE sigla = 'DE'`;
      expect(de).toMatchObject({ nombre: "Documento externo", autoridad: "operativo", es_diligenciable: false });
    }));

  it("el alta del tipo DE de la migración es idempotente y no choca con un «Documento externo» de otra sigla", () =>
    revertida(sql, async (tx) => {
      const alta = sentenciaDeMigracion(MIGRACION_0008, `INSERT INTO "tipos_documento"`);
      const contar = async () =>
        (await tx`SELECT count(*)::int AS n FROM tipos_documento WHERE sigla = 'DE'`)[0].n as number;
      // Ya existe DE: no inserta ni falla.
      await tx.unsafe(alta);
      expect(await contar()).toBe(1);
      // Sin DE: lo crea al final.
      await tx`UPDATE tipos_documento SET sigla = 'ZQ', nombre = 'zz Externo renombrado' WHERE sigla = 'DE'`;
      await tx.unsafe(alta);
      const [de] = await tx`SELECT orden, orden = (SELECT max(orden) FROM tipos_documento) AS al_final FROM tipos_documento WHERE sigla = 'DE'`;
      expect(de.al_final).toBe(true);
      // Un «Documento externo» con otra sigla: no se crea DE y la migración no falla.
      await tx`DELETE FROM tipos_documento WHERE sigla = 'DE'`;
      await tx`UPDATE tipos_documento SET nombre = 'Documento externo' WHERE sigla = 'ZQ'`;
      await tx.unsafe(alta);
      expect(await contar()).toBe(0);
    }));

  it("versiones admiten la aprobación externa con su edición y copias el motivo retirado", () =>
    revertida(sql, async (tx) => {
      const [v] = await tx`SELECT id FROM documento_versiones ORDER BY id LIMIT 1`;
      const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
      await tx`UPDATE documento_versiones SET origen_aprobacion = 'externo', edicion_externa = 'rev. 4.2',
        fecha_edicion_externa = '2020-03-01' WHERE id = ${v.id}`;
      expect(await fallaCon(tx.savepoint((s) => s`UPDATE documento_versiones SET origen_aprobacion = 'otro' WHERE id = ${v.id}`))).toBe("23514");
      const [p] = await tx`INSERT INTO puntos_uso (nombre, responsable_id) VALUES ('zz_punto_13c', ${u.id}) RETURNING id`;
      const [c] = await tx`INSERT INTO copias_controladas (version_id, numero, punto_uso_id, responsable_id, responsable_nombre, emitida_por, hash_principal, emitida_en)
        VALUES (${v.id}, 99998, ${p.id}, ${u.id}, 'Alguien', ${u.id}, 'x', now()) RETURNING id`;
      await tx`UPDATE copias_controladas SET estado = 'por_recoger', motivo_por_recoger = 'retirado', por_recoger_en = now() WHERE id = ${c.id}`;
      expect(await fallaCon(tx.savepoint((s) => s`UPDATE copias_controladas SET motivo_por_recoger = 'otro' WHERE id = ${c.id}`))).toBe("23514");
    }));

  it("lista_miembros: 'todos' sin referencia, los demás con ella, y sin duplicados", () =>
    revertida(sql, async (tx) => {
      const [l] = await tx`INSERT INTO listas_distribucion (nombre) VALUES ('zz_lista_13c') RETURNING id`;
      const miembro = (tipo: string, ref: number | null) =>
        tx.savepoint((s) => s`INSERT INTO lista_miembros (lista_id, tipo, referencia_id) VALUES (${l.id}, ${tipo}, ${ref})`);
      await miembro("todos", null);
      expect(await fallaCon(miembro("todos", null))).toBe("23505");
      expect(await fallaCon(miembro("todos", 1))).toBe("23514");
      expect(await fallaCon(miembro("usuario", null))).toBe("23514");
      await miembro("usuario", 1);
      expect(await fallaCon(miembro("usuario", 1))).toBe("23505");
      expect(await fallaCon(miembro("otro", 1))).toBe("23514");
    }));

  it("una sola revisión anual abierta; cerrada, no se modifica ni ella ni sus procesos ni sus decisiones", () =>
    revertida(sql, async (tx) => {
      const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
      // La demo puede traer una revisión abierta: se cierra dentro de esta transacción revertida.
      await tx`UPDATE revisiones_anuales SET estado = 'cerrada', cerrada_en = now(), cerrada_por = ${u.id}, metodo_cierre = 'clave'
        WHERE estado = 'abierta'`;
      const abrir = (anio: number) =>
        tx.savepoint(
          (s) => s`INSERT INTO revisiones_anuales (anio, plazo_dias, ventana_meses, abierta_por, abierta_en, vence_en)
            VALUES (${anio}, 60, 6, ${u.id}, now(), now() + interval '60 days') RETURNING id, estado, prorrogas`,
        );
      const [r] = await abrir(2090);
      expect(r).toMatchObject({ estado: "abierta", prorrogas: [] });
      expect(await fallaCon(abrir(2091))).toBe("23505");
      const [d] = await tx`SELECT v.documento_id, v.id FROM documento_versiones v WHERE v.estado = 'vigente' LIMIT 1`;
      const [p] = await tx`SELECT id FROM procesos ORDER BY id LIMIT 1`;
      const [dec] = await tx`INSERT INTO revision_anual_decisiones (revision_id, documento_id, version_id, decision)
        VALUES (${r.id}, ${d.documento_id}, ${d.id}, 'reciente') RETURNING id, insumos`;
      expect(dec.insumos).toEqual({});
      expect(
        await fallaCon(
          tx.savepoint(
            (s) => s`INSERT INTO revision_anual_decisiones (revision_id, documento_id, version_id, decision)
              VALUES (${r.id}, ${d.documento_id}, ${d.id}, 'sin_revisar')`,
          ),
        ),
      ).toBe("23505");
      const [rp] = await tx`INSERT INTO revision_anual_procesos (revision_id, proceso_id, documentos)
        VALUES (${r.id}, ${p.id}, 3) RETURNING id`;
      // Abierta: se puede cambiar.
      await tx`UPDATE revision_anual_decisiones SET decision = 'sin_revisar' WHERE id = ${dec.id}`;
      await tx`UPDATE revision_anual_procesos SET normograma_resultado = 'sin_novedad', normograma_por = ${u.id}, normograma_en = now() WHERE id = ${rp.id}`;
      expect(await fallaCon(tx.savepoint((s) => s`UPDATE revision_anual_decisiones SET decision = 'otra' WHERE id = ${dec.id}`))).toBe("23514");
      expect(await fallaCon(tx.savepoint((s) => s`UPDATE revision_anual_procesos SET normograma_resultado = 'otro' WHERE id = ${rp.id}`))).toBe("23514");
      await tx`UPDATE revisiones_anuales SET estado = 'cerrada', cerrada_en = now(), cerrada_por = ${u.id}, metodo_cierre = 'clave' WHERE id = ${r.id}`;
      expect(await fallaCon(tx.savepoint((s) => s`UPDATE revisiones_anuales SET plazo_dias = 90 WHERE id = ${r.id}`))).toBe("42501");
      expect(await fallaCon(tx.savepoint((s) => s`DELETE FROM revisiones_anuales WHERE id = ${r.id}`))).toBe("42501");
      expect(await fallaCon(tx.savepoint((s) => s`UPDATE revision_anual_decisiones SET decision = 'ratificar' WHERE id = ${dec.id}`))).toBe("42501");
      expect(await fallaCon(tx.savepoint((s) => s`DELETE FROM revision_anual_decisiones WHERE id = ${dec.id}`))).toBe("42501");
      expect(await fallaCon(tx.savepoint((s) => s`UPDATE revision_anual_procesos SET normograma_nota = 'x' WHERE id = ${rp.id}`))).toBe("42501");
      expect(await fallaCon(tx.savepoint((s) => s`DELETE FROM revision_anual_procesos WHERE id = ${rp.id}`))).toBe("42501");
      // Cerrada la anterior, se puede abrir la del año siguiente.
      await abrir(2091);
    }));

  it("una revisión cerrada no recibe decisiones ni procesos nuevos, ni movidos desde una abierta", () =>
    revertida(sql, async (tx) => {
      const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
      await tx`UPDATE revisiones_anuales SET estado = 'cerrada', cerrada_en = now(), cerrada_por = ${u.id}, metodo_cierre = 'clave'
        WHERE estado = 'abierta'`;
      const [cerrada] = await tx`INSERT INTO revisiones_anuales (anio, estado, plazo_dias, ventana_meses, abierta_por, abierta_en, vence_en,
          cerrada_por, cerrada_en, metodo_cierre)
        VALUES (2092, 'cerrada', 60, 6, ${u.id}, now(), now(), ${u.id}, now(), 'clave_totp') RETURNING id`;
      const [abierta] = await tx`INSERT INTO revisiones_anuales (anio, plazo_dias, ventana_meses, abierta_por, abierta_en, vence_en)
        VALUES (2093, 60, 6, ${u.id}, now(), now() + interval '60 days') RETURNING id`;
      const [d] = await tx`SELECT v.documento_id, v.id FROM documento_versiones v WHERE v.estado = 'vigente' LIMIT 1`;
      const [p] = await tx`SELECT id FROM procesos ORDER BY id LIMIT 1`;
      const decidir = (revisionId: number) =>
        tx.savepoint(
          (s) => s`INSERT INTO revision_anual_decisiones (revision_id, documento_id, version_id, decision)
            VALUES (${revisionId}, ${d.documento_id}, ${d.id}, 'sin_revisar') RETURNING id`,
        );
      const sumarProceso = (revisionId: number) =>
        tx.savepoint(
          (s) => s`INSERT INTO revision_anual_procesos (revision_id, proceso_id, documentos) VALUES (${revisionId}, ${p.id}, 1) RETURNING id`,
        );
      expect(await fallaCon(decidir(cerrada.id))).toBe("42501");
      expect(await fallaCon(sumarProceso(cerrada.id))).toBe("42501");
      const [dec] = await decidir(abierta.id);
      const [rp] = await sumarProceso(abierta.id);
      expect(
        await fallaCon(tx.savepoint((s) => s`UPDATE revision_anual_decisiones SET revision_id = ${cerrada.id} WHERE id = ${dec.id}`)),
      ).toBe("42501");
      expect(
        await fallaCon(tx.savepoint((s) => s`UPDATE revision_anual_procesos SET revision_id = ${cerrada.id} WHERE id = ${rp.id}`)),
      ).toBe("42501");
      // En la abierta siguen pudiendo cambiar.
      await tx`UPDATE revision_anual_decisiones SET decision = 'ratificar', usuario_id = ${u.id} WHERE id = ${dec.id}`;
      // Las dos lecturas de la revisión bloquean su fila contra un cierre concurrente, y los triggers miran también el INSERT.
      const [{ definicion }] = await tx`SELECT pg_get_functiondef('sgc_impedir_si_revision_cerrada'::regproc) AS definicion`;
      expect((definicion as string).match(/ FOR SHARE;/g)).toHaveLength(2);
      const disparadores = await tx`SELECT tgname, pg_get_triggerdef(oid) AS def FROM pg_trigger
        WHERE tgname IN ('revision_anual_procesos_inmutables', 'revision_anual_decisiones_inmutables') ORDER BY tgname`;
      expect(disparadores).toHaveLength(2);
      for (const t of disparadores) expect(t.def, t.tgname).toContain("BEFORE INSERT OR DELETE OR UPDATE");
    }));

  it("cerrar una revisión exige quién, cuándo y con qué método; una abierta no lleva los tres", () =>
    revertida(sql, async (tx) => {
      const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
      await tx`UPDATE revisiones_anuales SET estado = 'cerrada', cerrada_en = now(), cerrada_por = ${u.id}, metodo_cierre = 'clave'
        WHERE estado = 'abierta'`;
      const [r] = await tx`INSERT INTO revisiones_anuales (anio, plazo_dias, ventana_meses, abierta_por, abierta_en, vence_en)
        VALUES (2094, 60, 6, ${u.id}, now(), now() + interval '60 days') RETURNING id`;
      const actualizar = (cambio: Record<string, unknown>) =>
        tx.savepoint((s) => s`UPDATE revisiones_anuales SET ${s(cambio)} WHERE id = ${r.id}`);
      const ahora = new Date();
      expect(await fallaCon(actualizar({ estado: "cerrada", cerrada_en: ahora, cerrada_por: u.id }))).toBe("23514");
      expect(await fallaCon(actualizar({ estado: "cerrada", cerrada_en: ahora, metodo_cierre: "clave" }))).toBe("23514");
      expect(await fallaCon(actualizar({ estado: "cerrada", cerrada_por: u.id, metodo_cierre: "clave" }))).toBe("23514");
      expect(await fallaCon(actualizar({ cerrada_en: ahora, cerrada_por: u.id, metodo_cierre: "clave" }))).toBe("23514");
      expect(
        await fallaCon(
          tx.savepoint(
            (s) => s`INSERT INTO revisiones_anuales (anio, estado, plazo_dias, ventana_meses, abierta_por, abierta_en, vence_en)
              VALUES (2095, 'cerrada', 60, 6, ${u.id}, now(), now())`,
          ),
        ),
      ).toBe("23514");
      await actualizar({ estado: "cerrada", cerrada_en: ahora, cerrada_por: u.id, metodo_cierre: "clave" });
    }));

  it("la migración 0009 siembra los nueve tipos de norma solo si la tabla está vacía", () =>
    revertida(sql, async (tx) => {
      const alta = sentenciaDeMigracion(MIGRACION_0009, `INSERT INTO "tipos_norma"`);
      // Con filas (la base ya migrada): no inserta nada.
      const [{ antes }] = await tx`SELECT count(*)::int AS antes FROM tipos_norma`;
      expect(antes).toBeGreaterThan(0);
      await tx.unsafe(alta);
      const [{ despues }] = await tx`SELECT count(*)::int AS despues FROM tipos_norma`;
      expect(despues).toBe(antes);
      // Vacía: una copia temporal tapa a la real (`pg_temp` va primero en la ruta de búsqueda) y la sentencia
      // escribe en ella; así el caso no depende de que la base tenga normas que impidan vaciar la tabla.
      await tx`CREATE TEMP TABLE tipos_norma (LIKE public.tipos_norma INCLUDING ALL) ON COMMIT DROP`;
      await tx.unsafe(alta);
      const sembrados = await tx.unsafe(`SELECT nombre, orden, activo FROM tipos_norma ORDER BY orden`);
      expect(sembrados.map((f) => f.nombre)).toEqual(TIPOS_NORMA);
      expect(sembrados.map((f) => f.orden)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(sembrados.every((f) => f.activo)).toBe(true);
      // Con un solo tipo propio de la entidad: tampoco la toca.
      await tx.unsafe(`DELETE FROM pg_temp.tipos_norma`);
      await tx.unsafe(`INSERT INTO pg_temp.tipos_norma (nombre, orden, activo) VALUES ('Propio de la entidad', 1, false)`);
      await tx.unsafe(alta);
      const propios = await tx.unsafe(`SELECT nombre, activo FROM pg_temp.tipos_norma`);
      expect([...propios]).toEqual([{ nombre: "Propio de la entidad", activo: false }]);
    }));

  it("norma_cambios solo admite los estados de una norma", () =>
    revertida(sql, async (tx) => {
      const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
      const { normaId } = await normaDePrueba(tx, u.id, "9014");
      const cambiar = (anterior: string, nuevo: string) =>
        tx.savepoint(
          (s) => s`INSERT INTO norma_cambios (norma_id, estado_anterior, estado_nuevo, fecha, usuario_id)
            VALUES (${normaId}, ${anterior}, ${nuevo}, '2026-11-08', ${u.id})`,
        );
      await cambiar("vigente", "modificada");
      await cambiar("modificada", "derogada");
      await cambiar("derogada", "retirada");
      expect(await fallaCon(cambiar("otro", "derogada"))).toBe("23514");
      expect(await fallaCon(cambiar("vigente", "abolida"))).toBe("23514");
    }));

  it("normas: única por tipo, número y año; relación consigo misma rechazada; tsv generada", () =>
    revertida(sql, async (tx) => {
      const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
      const { tipoId, normaId } = await normaDePrueba(tx, u.id);
      const repetir = (numero: string, anio: number) =>
        tx.savepoint(
          (s) => s`INSERT INTO normas (tipo_norma_id, numero, anio, entidad_emisora, titulo, creado_por)
            VALUES (${tipoId}, ${numero}, ${anio}, 'MinSalud', 'Otra', ${u.id}) RETURNING id`,
        );
      expect(await fallaCon(repetir("3100", 2019))).toBe("23505");
      const [otra] = await repetir("3100", 2020); // mismo número, otro año
      expect(await fallaCon(tx.savepoint((s) => s`INSERT INTO tipos_norma (nombre, orden) VALUES (${"ZZ_RESOLUCION_13C_3100"}, 1)`))).toBe("23505");
      expect(await fallaCon(tx.savepoint((s) => s`UPDATE normas SET estado = 'otro' WHERE id = ${normaId}`))).toBe("23514");
      const relacionar = (normaA: number, afectada: number, tipo: string) =>
        tx.savepoint(
          (s) => s`INSERT INTO norma_relaciones (norma_id, afectada_id, tipo, creado_por) VALUES (${normaA}, ${afectada}, ${tipo}, ${u.id})`,
        );
      expect(await fallaCon(relacionar(normaId, normaId, "deroga"))).toBe("23514");
      await relacionar(otra.id, normaId, "deroga");
      expect(await fallaCon(relacionar(otra.id, normaId, "deroga"))).toBe("23505");
      expect(await fallaCon(relacionar(otra.id, normaId, "otra"))).toBe("23514");
      const [n] = await tx`SELECT tsv IS NOT NULL AS hay,
          tsv @@ plainto_tsquery('espanol_unaccent', 'habilitacion') AS por_titulo,
          tsv @@ plainto_tsquery('espanol_unaccent', '3100 2019') AS por_numero,
          tsv @@ plainto_tsquery('espanol_unaccent', 'proteccion social') AS por_emisor
        FROM normas WHERE id = ${normaId}`;
      expect(n).toEqual({ hay: true, por_titulo: true, por_numero: true, por_emisor: true });
    }));

  it("norma_relaciones (0010): la baja lleva quién, cuándo y motivo, y la unicidad es solo entre las no eliminadas", () =>
    revertida(sql, async (tx) => {
      const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
      const { tipoId, normaId } = await normaDePrueba(tx, u.id, "9015");
      const [otra] = await tx`INSERT INTO normas (tipo_norma_id, numero, anio, entidad_emisora, titulo, creado_por)
        VALUES (${tipoId}, '9016', 2020, 'MinSalud', 'La que deroga', ${u.id}) RETURNING id`;
      const relacionar = () =>
        tx.savepoint(
          (s) => s`INSERT INTO norma_relaciones (norma_id, afectada_id, tipo, creado_por) VALUES (${otra.id}, ${normaId}, 'deroga', ${u.id}) RETURNING id`,
        );
      const [r] = await relacionar();
      expect(await fallaCon(relacionar())).toBe("23505");
      const baja = (en: string | null, por: number | null, motivo: string | null) =>
        tx.savepoint(
          (s) => s`UPDATE norma_relaciones SET eliminada_en = ${en}, eliminada_por = ${por}, eliminada_motivo = ${motivo} WHERE id = ${r.id}`,
        );
      expect(await fallaCon(baja("2026-11-09T10:00:00Z", null, null))).toBe("23514");
      expect(await fallaCon(baja(null, u.id, "Por error"))).toBe("23514");
      expect(await fallaCon(baja("2026-11-09T10:00:00Z", u.id, null))).toBe("23514");
      await baja("2026-11-09T10:00:00Z", u.id, "Registrada por error");
      // Eliminada, la misma relación se puede volver a registrar, pero no dos veces.
      await relacionar();
      expect(await fallaCon(relacionar())).toBe("23505");
      const [indice] = await tx`SELECT indexdef FROM pg_indexes WHERE tablename = 'norma_relaciones' AND indexname = 'norma_relaciones_unica_sin_baja'`;
      expect(indice.indexdef).toMatch(/UNIQUE INDEX .* WHERE \(eliminada_en IS NULL\)/);
    }));

  it("la migración 0010 se puede volver a correr", () => {
    const texto = readFileSync(path.resolve(import.meta.dirname, "../drizzle", MIGRACION_0010), "utf8");
    const sentencias = texto.split("--> statement-breakpoint").map((x) => x.trim()).filter(Boolean);
    for (const sentencia of sentencias) {
      expect(sentencia).toMatch(/IF NOT EXISTS|IF EXISTS|^DO \$\$/);
    }
  });

  it("hallazgos admite por_validar y archivos admite norma, revision_anual y hallazgo", () =>
    revertida(sql, async (tx) => {
      const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
      const [p] = await tx`INSERT INTO puntos_uso (nombre, responsable_id) VALUES ('zz_punto_h13c', ${u.id}) RETURNING id`;
      const [h] = await tx`INSERT INTO hallazgos (punto_uso_id, origen, descripcion, responsable_id, vence_en)
        VALUES (${p.id}, 'recogida', 'Copia sin devolver', ${u.id}, now()) RETURNING id, reaperturas`;
      expect(h.reaperturas).toBe(0);
      await tx`UPDATE hallazgos SET estado = 'por_validar', corregido_en = now(), corregido_por = ${u.id},
        nota_correccion = 'Se recogió', validacion = 'admin' WHERE id = ${h.id}`;
      expect(await fallaCon(tx.savepoint((s) => s`UPDATE hallazgos SET estado = 'otro' WHERE id = ${h.id}`))).toBe("23514");
      expect(await fallaCon(tx.savepoint((s) => s`UPDATE hallazgos SET validacion = 'otra' WHERE id = ${h.id}`))).toBe("23514");
      const adjuntar = (contexto: string, ruta: string) =>
        tx.savepoint(
          (s) => s`INSERT INTO archivos (version_id, contexto, contexto_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
            VALUES (NULL, ${contexto}, 1, 'evidencia', ${ruta}, 'norma.pdf', 'pdf', 'application/pdf', 10, 'x')`,
        );
      await adjuntar("norma", "zz/13c-n.pdf");
      await adjuntar("revision_anual", "zz/13c-r.pdf");
      await adjuntar("hallazgo", "zz/13c-h.pdf");
      expect(await fallaCon(adjuntar("otro", "zz/13c-o.pdf"))).toBe("23514");
    }));

  it("los triggers nuevos existen sobre sus tablas", () =>
    revertida(sql, async (tx) => {
      const filas = await tx`SELECT c.relname || '.' || t.tgname AS trigger FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE NOT t.tgisinternal AND c.relname IN ('ratificaciones', 'externo_verificaciones', 'norma_cambios',
          'revisiones_anuales', 'revision_anual_procesos', 'revision_anual_decisiones')
        ORDER BY 1`;
      expect(filas.map((f) => f.trigger)).toEqual([
        "externo_verificaciones.externo_verificaciones_inmutable",
        "norma_cambios.norma_cambios_inmutable",
        "ratificaciones.ratificaciones_inmutable",
        "revision_anual_decisiones.revision_anual_decisiones_inmutables",
        "revision_anual_procesos.revision_anual_procesos_inmutables",
        "revisiones_anuales.revisiones_anuales_cerrada_inmutable",
      ]);
    }));

  it.skipIf(!process.env.DATABASE_URL_MIGRADOR)("las tablas inmutables nuevas rechazan UPDATE y DELETE también al dueño", () =>
    revertida(dueno!, async (tx) => {
      const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
      const [v] = await tx`SELECT id, documento_id FROM documento_versiones WHERE estado = 'vigente' ORDER BY id LIMIT 1`;
      const [f] = await tx`INSERT INTO firmas (tramite_id, version_id, usuario_id, firma, ronda, hash_sha256, nombre_firmante, metodo)
        VALUES (NULL, ${v.id}, ${u.id}, 'ratifico', 0, 'x', 'Alguien', 'clave') RETURNING id`;
      const [rat] = await tx`INSERT INTO ratificaciones (version_id, firma_id, proxima_revision)
        VALUES (${v.id}, ${f.id}, '2027-11-08') RETURNING id`;
      expect(
        await fallaCon(tx.savepoint((s) => s`INSERT INTO ratificaciones (version_id, firma_id, proxima_revision) VALUES (${v.id}, ${f.id}, '2028-11-08')`)),
      ).toBe("23505");
      const [ver] = await tx`INSERT INTO externo_verificaciones (documento_id, version_id, usuario_id, resultado, fuente_consultada)
        VALUES (${v.documento_id}, ${v.id}, ${u.id}, 'vigente', 'Sitio oficial') RETURNING id`;
      expect(
        await fallaCon(
          tx.savepoint(
            (s) => s`INSERT INTO externo_verificaciones (documento_id, version_id, usuario_id, resultado, fuente_consultada)
              VALUES (${v.documento_id}, ${v.id}, ${u.id}, 'otro', 'Sitio oficial')`,
          ),
        ),
      ).toBe("23514");
      const { normaId } = await normaDePrueba(tx, u.id, "9013");
      const [cam] = await tx`INSERT INTO norma_cambios (norma_id, estado_anterior, estado_nuevo, fecha, usuario_id)
        VALUES (${normaId}, 'vigente', 'derogada', '2026-11-08', ${u.id}) RETURNING id`;
      const casos: Array<[string, number]> = [
        ["ratificaciones", rat.id],
        ["externo_verificaciones", ver.id],
        ["norma_cambios", cam.id],
      ];
      for (const [tabla, filaId] of casos) {
        expect(await fallaCon(tx.savepoint((s) => s`UPDATE ${s(tabla)} SET creado_en = creado_en WHERE id = ${filaId}`)), tabla).toBe("42501");
        expect(await fallaCon(tx.savepoint((s) => s`DELETE FROM ${s(tabla)} WHERE id = ${filaId}`)), tabla).toBe("42501");
      }
    }));
});
