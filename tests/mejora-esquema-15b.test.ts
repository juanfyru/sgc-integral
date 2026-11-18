/**
 * Esquema de la Fase 15B (migración 0019, anexo 15B §13): los planes de mejoramiento, la clasificación de un hallazgo, las
 * dos tablas de solo inserción nuevas, las marcas de los indicadores, el enlace de una actividad con un trámite, los tres
 * orígenes de un hallazgo y los borrados que ya existían y ahora conocen lo nuevo. Nada queda confirmado: todo corre dentro
 * de una transacción que se revierte.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql, TransactionSql } from "postgres";
import postgres from "postgres";
import { TIPOS_SQL } from "@/db/cliente";
import { deshacerCargaEn } from "@/db/consultas/admin";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { conDatos, citadoEnMejoramiento } from "@/db/consultas/indicadores/mediciones";
import { borrarDeMaestro } from "@/db/consultas/indicadores/maestros";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { zonaHoraria } from "@/lib/zona-horaria";
import { indicadorDePrueba } from "./utiles/indicadores";
import { sesionAdmin, tramiteEn } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { sinRevisionAbierta, vigenteFuera } from "./utiles/vigencia";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const AHORA = new Date("2026-11-17T15:00:00Z");

type ErrorPg = { code?: string; constraint_name?: string; message?: string };

/** El error de la consulta, o `null` si entró. Cada intento va en su punto de guardado. */
async function errorDe(tx: TransactionSql, consulta: () => PromiseLike<unknown>): Promise<ErrorPg | null> {
  await tx`SAVEPOINT intento`;
  try {
    await consulta();
    await tx`RELEASE SAVEPOINT intento`;
    return null;
  } catch (err) {
    await tx`ROLLBACK TO SAVEPOINT intento`;
    return err as ErrorPg;
  }
}

const codigo = async (tx: TransactionSql, consulta: () => PromiseLike<unknown>) => (await errorDe(tx, consulta))?.code ?? null;

type Base = { admin: SesionFlujo; usuarioId: number; procesoId: number };

async function base(tx: TransactionSql): Promise<Base> {
  const admin = await sesionAdmin(tx);
  const [p] = await tx`SELECT id FROM procesos WHERE activo ORDER BY id LIMIT 1`;
  return { admin, usuarioId: admin.usuarioId, procesoId: Number(p.id) };
}

let consecutivo = 0;

type OpcionesHallazgo = { estado?: string; indicadorId?: number; medicionId?: number } & Partial<{
  verificacionHallazgoId: number;
  impactoId: number;
  impactoIndicadorId: number;
}>;

/** Un hallazgo por SQL directo, del año 9999: su código no choca con uno de verdad. */
async function hallazgo(tx: TransactionSql, b: Base, o: OpcionesHallazgo = {}): Promise<number> {
  consecutivo += 1;
  const [h] = await tx`INSERT INTO mejora_hallazgos (codigo, anio, consecutivo, clase, origen, fuente, detectado_en, proceso_id,
      criticidad, titulo, descripcion, indicador_id, medicion_id, estado, registrado_por, registrado_en,
      verificacion_hallazgo_id, impacto_id, impacto_indicador_id)
    VALUES (${`HZ-9999-${String(900 + consecutivo).padStart(3, "0")}`}, 9999, ${900 + consecutivo}, 'no_conformidad',
      'auditoria_interna', 'Auditoría interna de prueba', '2026-11-03', ${b.procesoId}, 'media', 'Hallazgo de prueba',
      'La descripción del hallazgo de prueba, con su evidencia', ${o.indicadorId ?? null}, ${o.medicionId ?? null},
      ${o.estado ?? "en_ejecucion"}, ${b.usuarioId}, ${AHORA}, ${o.verificacionHallazgoId ?? null}, ${o.impactoId ?? null},
      ${o.impactoIndicadorId ?? null})
    RETURNING id`;
  return Number(h.id);
}

async function plan(tx: TransactionSql, b: Base, objetivoId: number | null = null): Promise<number> {
  consecutivo += 1;
  const [p] = await tx`INSERT INTO mejora_planes (codigo, vigencia, consecutivo, nombre, origen, fecha_evento, objetivo_id, creado_por)
    VALUES (${`PM-9999-${consecutivo}`}, 9999, ${consecutivo}, 'Plan de prueba de la 15B', 'auditoria_interna', '2026-11-03',
      ${objetivoId}, ${(await base(tx)).usuarioId})
    RETURNING id`;
  return Number(p.id);
}

async function medicionAbierta(tx: TransactionSql, indicador: { id: number; versionId: number }, clave = "2026-01"): Promise<number> {
  const p = periodoDe(clave, zonaHoraria())!;
  const [m] = await tx`INSERT INTO mediciones (indicador_id, version_id, periodo, desde, hasta, vence_en)
    VALUES (${indicador.id}, ${indicador.versionId}, ${clave}, ${p.desde}, ${p.hasta}, ${p.hasta}) RETURNING id`;
  return Number(m.id);
}

async function actividadDe(tx: TransactionSql, b: Base, h: number): Promise<number> {
  const [r] = await tx`INSERT INTO mejora_rondas (hallazgo_id, numero, formular_antes_de, estado_plan)
    VALUES (${h}, 1, ${AHORA}, 'aprobado') RETURNING id`;
  const [ac] = await tx`INSERT INTO mejora_acciones (hallazgo_id, ronda_id, orden, tipo, descripcion)
    VALUES (${h}, ${r.id}, 1, 'correctiva', 'Acción de prueba') RETURNING id`;
  const [act] = await tx`INSERT INTO mejora_actividades (hallazgo_id, accion_id, orden, descripcion, responsable_id, inicio,
      fin_original, fin, estado)
    VALUES (${h}, ${ac.id}, 1, 'Actividad de prueba', ${b.usuarioId}, '2026-11-04', '2026-11-30', '2026-11-30', 'en_proceso')
    RETURNING id`;
  return Number(act.id);
}

async function otraActividad(tx: TransactionSql, b: Base, h: number): Promise<number> {
  const [ac] = await tx`SELECT id FROM mejora_acciones WHERE hallazgo_id = ${h} LIMIT 1`;
  const [act] = await tx`INSERT INTO mejora_actividades (hallazgo_id, accion_id, orden, descripcion, responsable_id, inicio,
      fin_original, fin, estado)
    VALUES (${h}, ${ac.id}, 2, 'Otra actividad', ${b.usuarioId}, '2026-11-04', '2026-11-30', '2026-11-30', 'en_proceso')
    RETURNING id`;
  return Number(act.id);
}

async function normaYCambio(tx: TransactionSql, b: Base): Promise<{ normaId: number; cambioId: number }> {
  consecutivo += 1;
  const [n] = await tx`INSERT INTO normas (tipo_norma_id, numero, anio, entidad_emisora, titulo, creado_por)
    SELECT id, ${`zz-15b-${Date.now()}-${consecutivo}`}, 2026, 'Ministerio de Salud', 'Norma de prueba', ${b.usuarioId}
    FROM tipos_norma ORDER BY id LIMIT 1 RETURNING id`;
  const [c] = await tx`INSERT INTO norma_cambios (norma_id, estado_anterior, estado_nuevo, fecha, usuario_id)
    VALUES (${n.id}, 'vigente', 'modificada', '2026-11-03', ${b.usuarioId}) RETURNING id`;
  return { normaId: Number(n.id), cambioId: Number(c.id) };
}

async function verificacionDeDistribucion(tx: TransactionSql, b: Base): Promise<number> {
  const [pu] = await tx`SELECT id FROM puntos_uso ORDER BY id LIMIT 1`;
  const [h] = await tx`INSERT INTO hallazgos (punto_uso_id, origen, descripcion, responsable_id, vence_en)
    VALUES (${pu.id}, 'recogida', 'Hallazgo de verificación de prueba', ${b.usuarioId}, ${AHORA}) RETURNING id`;
  return Number(h.id);
}

async function impactoNormativo(tx: TransactionSql, b: Base): Promise<number> {
  const { normaId, cambioId } = await normaYCambio(tx, b);
  const [i] = await tx`INSERT INTO impactos_normativos (cambio_id, norma_id, proceso_id, vence_en)
    VALUES (${cambioId}, ${normaId}, ${b.procesoId}, ${AHORA}) RETURNING id`;
  return Number(i.id);
}

async function impactoDeIndicador(tx: TransactionSql, b: Base): Promise<number> {
  const { normaId, cambioId } = await normaYCambio(tx, b);
  const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId });
  const [i] = await tx`INSERT INTO impactos_indicadores (norma_cambio_id, norma_id, indicador_id, vence_en)
    VALUES (${cambioId}, ${normaId}, ${ind.id}, ${AHORA}) RETURNING id`;
  return Number(i.id);
}

/** Una marca por SQL: la salida «hallazgo» con su hallazgo, o «no requiere» con su justificación. */
async function marca(tx: TransactionSql, b: Base, medicionId: number, indicadorId: number, salida: "hallazgo" | "no_requiere", hallazgoId?: number) {
  return tx`INSERT INTO mejora_marcas (medicion_id, indicador_id, salida, hallazgo_id, justificacion, decidido_por, decidido_en)
    VALUES (${medicionId}, ${indicadorId}, ${salida}, ${hallazgoId ?? null},
      ${salida === "no_requiere" ? "La variación fue un efecto del cierre del mes" : null}, ${b.usuarioId}, ${AHORA})
    RETURNING id`;
}

describe.skipIf(!process.env.DATABASE_URL_MIGRADOR)("esquema de la migración 0019", () => {
  let dueno: Sql;
  let sql: Sql;

  beforeAll(() => {
    dueno = postgres(process.env.DATABASE_URL_MIGRADOR!, { max: 1, types: TIPOS_SQL });
    sql = postgres(process.env.DATABASE_URL!, { max: 1, types: TIPOS_SQL });
  });
  afterAll(async () => {
    await dueno.end();
    await sql.end();
  });

  it("las dos tablas de solo inserción rechazan UPDATE y DELETE también al dueño", () =>
    revertida(dueno, async (tx) => {
      const b = await base(tx);
      const p = await plan(tx, b);
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const m = await medicionAbierta(tx, ind);
      const h = await hallazgo(tx, b);
      const [e] = await tx`INSERT INTO mejora_plan_eventos (plan_id, tipo, usuario_id) VALUES (${p}, 'creado', ${b.usuarioId}) RETURNING id`;
      const [mk] = await marca(tx, b, m, ind.id, "hallazgo", h);
      for (const [tabla, columna, fila] of [["mejora_plan_eventos", "creado_en", e.id], ["mejora_marcas", "decidido_en", mk.id]] as const) {
        expect(await codigo(tx, () => tx.unsafe(`UPDATE ${tabla} SET ${columna} = ${columna} WHERE id = ${fila}`))).toBe("42501");
        expect(await codigo(tx, () => tx.unsafe(`DELETE FROM ${tabla} WHERE id = ${fila}`))).toBe("42501");
      }
    }));

  it("un hallazgo cerrado se clasifica y se reclasifica", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const h = await hallazgo(tx, b, { estado: "cerrado" });
      const p1 = await plan(tx, b);
      const p2 = await plan(tx, b);
      await tx`INSERT INTO mejora_clasificacion (hallazgo_id, plan_id, actualizado_por, actualizado_en)
        VALUES (${h}, ${p1}, ${b.usuarioId}, ${AHORA})`;
      await tx`UPDATE mejora_clasificacion SET plan_id = ${p2} WHERE hallazgo_id = ${h}`;
      await tx`INSERT INTO mejora_plan_eventos (plan_id, hallazgo_id, tipo, usuario_id) VALUES (${p2}, ${h}, 'entra', ${b.usuarioId})`;
      await tx`DELETE FROM mejora_clasificacion WHERE hallazgo_id = ${h}`;
      expect(await tx`SELECT 1 FROM mejora_clasificacion WHERE hallazgo_id = ${h}`).toHaveLength(0);
    }));

  it("a lo sumo un plan por hallazgo", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const h = await hallazgo(tx, b);
      const p = await plan(tx, b);
      await tx`INSERT INTO mejora_clasificacion (hallazgo_id, plan_id, actualizado_por, actualizado_en) VALUES (${h}, ${p}, ${b.usuarioId}, ${AHORA})`;
      expect(
        await codigo(tx, () => tx`INSERT INTO mejora_clasificacion (hallazgo_id, plan_id, actualizado_por, actualizado_en)
          VALUES (${h}, ${p}, ${b.usuarioId}, ${AHORA})`),
      ).toBe("23505");
    }));

  it("la clasificación no queda vacía", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const h = await hallazgo(tx, b);
      expect(
        await codigo(tx, () => tx`INSERT INTO mejora_clasificacion (hallazgo_id, actualizado_por, actualizado_en)
          VALUES (${h}, ${b.usuarioId}, ${AHORA})`),
      ).toBe("23514");
    }));

  it("el enlace con un trámite es de un hallazgo en curso", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const h = await hallazgo(tx, b);
      const a1 = await actividadDe(tx, b, h);
      const a2 = await otraActividad(tx, b, h);
      const { tramiteId } = await tramiteEn(tx, "visto_bueno");
      const enlazar = (actividad: number, hallazgoId: number) => () => tx`INSERT INTO mejora_actividad_tramites
        (hallazgo_id, actividad_id, tramite_id, origen, enlazado_por, enlazado_en)
        VALUES (${hallazgoId}, ${actividad}, ${tramiteId}, 'enlazado', ${b.usuarioId}, ${AHORA})`;
      expect(await codigo(tx, enlazar(a1, h))).toBeNull();
      expect(await codigo(tx, enlazar(a2, h))).toBe("23505");

      const cerrado = await hallazgo(tx, b);
      const a3 = await actividadDe(tx, b, cerrado);
      await tx`UPDATE mejora_hallazgos SET estado = 'cerrado' WHERE id = ${cerrado}`;
      const { tramiteId: otro } = await tramiteEn(tx, "visto_bueno");
      expect(
        await codigo(tx, () => tx`INSERT INTO mejora_actividad_tramites (hallazgo_id, actividad_id, tramite_id, origen, enlazado_por, enlazado_en)
          VALUES (${cerrado}, ${a3}, ${otro}, 'pedido', ${b.usuarioId}, ${AHORA})`),
      ).toBe("42501");
    }));

  describe("un origen, a lo sumo un hallazgo que cuente", () => {
    const casos: Array<[string, "verificacionHallazgoId" | "impactoId" | "impactoIndicadorId", (tx: TransactionSql, b: Base) => Promise<number>]> = [
      ["verificacion_hallazgo_id", "verificacionHallazgoId", verificacionDeDistribucion],
      ["impacto_id", "impactoId", impactoNormativo],
      ["impacto_indicador_id", "impactoIndicadorId", impactoDeIndicador],
    ];
    for (const [columna, campo, crear] of casos) {
      it(columna, () =>
        revertida(sql, async (tx) => {
          const b = await base(tx);
          const origen = await crear(tx, b);
          const primero = await hallazgo(tx, b, { estado: "por_aceptar", [campo]: origen });
          expect(await codigo(tx, () => hallazgo(tx, b, { estado: "por_aceptar", [campo]: origen }))).toBe("23505");
          // El que se anula o se rechaza deja de contar: entra otro con el mismo origen.
          await tx`UPDATE mejora_hallazgos SET estado = 'anulado' WHERE id = ${primero}`;
          const segundo = await hallazgo(tx, b, { estado: "por_aceptar", [campo]: origen });
          expect(await codigo(tx, () => hallazgo(tx, b, { estado: "por_aceptar", [campo]: origen }))).toBe("23505");
          await tx`UPDATE mejora_hallazgos SET estado = 'rechazado' WHERE id = ${segundo}`;
          await hallazgo(tx, b, { estado: "por_aceptar", [campo]: origen });
        }));
    }
  });

  it("la marca es coherente", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const m = await medicionAbierta(tx, ind);
      const h = await hallazgo(tx, b);
      const insertar = (salida: string, hallazgoId: number | null, justificacion: string | null) => () =>
        tx`INSERT INTO mejora_marcas (medicion_id, indicador_id, salida, hallazgo_id, justificacion, decidido_por, decidido_en)
          VALUES (${m}, ${ind.id}, ${salida}, ${hallazgoId}, ${justificacion}, ${b.usuarioId}, ${AHORA})`;
      expect(await codigo(tx, insertar("no_requiere", h, "Porque sí, con motivo largo"))).toBe("23514");
      expect(await codigo(tx, insertar("hallazgo", null, null))).toBe("23514");
      expect(await codigo(tx, insertar("no_requiere", null, null))).toBe("23514");
      expect(await codigo(tx, insertar("hallazgo", h, null))).toBeNull();
      expect(await codigo(tx, insertar("no_requiere", null, "La variación fue un efecto del cierre"))).toBeNull();
      expect(await tx`SELECT 1 FROM mejora_marcas WHERE medicion_id = ${m}`).toHaveLength(2);
    }));

  describe("los borrados que ya existen conocen lo nuevo", () => {
    it("una medición con una marca cuenta como medición con datos", () =>
      revertida(sql, async (tx) => {
        const b = await base(tx);
        const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId });
        const m = await medicionAbierta(tx, ind);
        const tieneDatos = async () => (await tx`SELECT ${conDatos(tx)} AS con FROM mediciones m WHERE m.id = ${m}`)[0].con;
        expect(await tieneDatos()).toBe(false);
        await marca(tx, b, m, ind.id, "no_requiere");
        expect(await tieneDatos()).toBe(true);
      }));

    it("un indicador con una marca, o citado por un reporte, está citado en mejoramiento", () =>
      revertida(sql, async (tx) => {
        const b = await base(tx);
        const citado = async (id: number) => (await tx`SELECT ${citadoEnMejoramiento(tx)} AS c FROM indicadores i WHERE i.id = ${id}`)[0].c;
        const conMarca = await indicadorDePrueba(tx, { procesoId: b.procesoId });
        const porReporte = await indicadorDePrueba(tx, { procesoId: b.procesoId });
        expect(await citado(conMarca.id)).toBe(false);
        expect(await citado(porReporte.id)).toBe(false);
        await marca(tx, b, await medicionAbierta(tx, conMarca), conMarca.id, "no_requiere");
        expect(await citado(conMarca.id)).toBe(true);
        await tx`INSERT INTO mejora_reportes (reportado_por, reportado_en, descripcion, visto_en, vence_en, indicador_id)
          VALUES (${b.usuarioId}, ${AHORA}, 'Un reporte sobre el indicador', '2026-11-10', ${AHORA}, ${porReporte.id})`;
        expect(await citado(porReporte.id)).toBe(true);
      }));

    it("un objetivo con un plan o una clasificación no se borra: responde con su mensaje y no con el 23503", () =>
      revertida(sql, async (tx) => {
        const b = await base(tx);
        const nuevo = async () =>
          Number((await tx`INSERT INTO objetivos (clase, enunciado, orden) VALUES ('calidad', 'Objetivo de prueba', 9999) RETURNING id`)[0].id);
        const mensaje = "El objetivo está en uso en Mejoramiento";
        const rechaza = async (id: number) => {
          const err = await borrarDeMaestro(b.admin, "objetivos", id, { sql: tx }).then(() => null, (e: unknown) => e);
          expect(err).toBeInstanceOf(ErrorIndicador);
          expect((err as Error).message).toBe(mensaje);
        };
        const conPlan = await nuevo();
        await plan(tx, b, conPlan);
        await rechaza(conPlan);
        const conClasificacion = await nuevo();
        await tx`INSERT INTO mejora_clasificacion (hallazgo_id, objetivo_id, actualizado_por, actualizado_en)
          VALUES (${await hallazgo(tx, b)}, ${conClasificacion}, ${b.usuarioId}, ${AHORA})`;
        await rechaza(conClasificacion);
        const libre = await nuevo();
        await borrarDeMaestro(b.admin, "objetivos", libre, { sql: tx });
        expect(await tx`SELECT 1 FROM objetivos WHERE id = ${libre}`).toHaveLength(0);
      }));

    it("deshacer la carga de un documento que cita un reporte se puede: el reporte conserva su documento", async () => {
      const previo = process.env.ALMACEN_RUTA;
      const almacen = mkdtempSync(path.join(tmpdir(), "sgc-esquema-15b-"));
      process.env.ALMACEN_RUTA = almacen;
      try {
        await revertida(sql, async (tx) => {
          await sinRevisionAbierta(tx);
          await tx`INSERT INTO configuracion (clave, valor) VALUES ('publicacion_directa', '1') ON CONFLICT (clave) DO UPDATE SET valor = '1'`;
          const b = await base(tx);
          const doc = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: "GTH" });
          const [r] = await tx`INSERT INTO mejora_reportes (reportado_por, reportado_en, descripcion, visto_en, vence_en, documento_id)
            VALUES (${b.usuarioId}, ${AHORA}, 'Un reporte sobre el documento', '2026-11-10', ${AHORA}, ${doc.id}) RETURNING id`;
          await deshacerCargaEn(tx, doc.id, "Carga equivocada", b.usuarioId, AHORA);
          expect(await tx`SELECT 1 FROM documento_versiones WHERE documento_id = ${doc.id} AND estado = 'vigente'`).toHaveLength(0);
          const [despues] = await tx`SELECT documento_id FROM mejora_reportes WHERE id = ${r.id}`;
          expect(Number(despues.documento_id)).toBe(doc.id);
        });
      } finally {
        if (previo === undefined) delete process.env.ALMACEN_RUTA;
        else process.env.ALMACEN_RUTA = previo;
        rmSync(almacen, { recursive: true, force: true });
      }
    });
  });
});
