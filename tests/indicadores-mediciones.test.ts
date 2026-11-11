/**
 * Las mediciones de un indicador (Fase 14A, Tarea 9; spec §8.1 a §8.8): abrir los periodos, el cálculo único
 * (`recalcularMedicion`), reportar, guardar sin reportar, «no aplica» y corregir antes del cierre. Contra la BD de
 * desarrollo, dentro de una transacción que se revierte.
 *
 * `ind` es trimestral, de forma «porcentaje», meta 90 y umbral 70, con inicio en el tercer trimestre de 2025 y aprobado
 * el 15 de enero de 2026: sus dos trimestres de 2025 son históricos y los de 2026, ordinarios. Lo mide una persona de
 * rol Consulta.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { registrarHistoricos } from "@/db/consultas/indicadores/historicos";
import {
  asegurarMediciones,
  contarSoportes,
  marcarNoAplica,
  medicionParaReportar,
  proximaPorReportar,
  quitarNoAplica,
  recalcularMedicion,
  reportar,
  tablaDelAnio,
} from "@/db/consultas/indicadores/mediciones";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { ErrorPermiso } from "@/lib/permisos";
import { indicadorDePrueba, type OpcionesIndicadorDePrueba } from "./utiles/indicadores";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

let consecutivo = 0;
const unico = () => `${Date.now() % 100_000_000}${(consecutivo += 1)}`;

const AHORA = new Date("2026-10-05T15:00:00Z");
const APROBADA = new Date("2026-01-15T15:00:00Z");
const AUDITORIAS = {
  A: { nombre: "Auditorías ejecutadas", descripcion: "Auditorías internas hechas en el periodo", fuente: "Informes de auditoría" },
  B: { nombre: "Auditorías programadas", descripcion: "Auditorías del programa para el periodo", fuente: "Programa de Auditorías Internas" },
};

async function rechaza(promesa: Promise<unknown>, mensaje: string) {
  const err = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ErrorIndicador);
  expect((err as Error).message).toBe(mensaje);
}

async function sinPermiso(promesa: Promise<unknown>) {
  const err = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ErrorPermiso);
}

/** El indicador de la cabecera, con quien lo mide; `o` cambia lo que haga falta. */
async function preparar(tx: TransactionSql, o: OpcionesIndicadorDePrueba = {}) {
  const mide = await usuarioDePrueba(tx, { rol: "consulta" });
  const ind = await indicadorDePrueba(tx, {
    periodicidad: "trimestral",
    inicioMedicion: "2025-T3",
    aprobadaEn: APROBADA,
    variables: AUDITORIAS,
    mide: [mide.usuarioId],
    ...o,
  });
  await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: ind.id });
  const medicion = async (periodo: string) => {
    const [m] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = ${periodo}`;
    return Number(m.id);
  };
  return { ind, mide, medicion };
}

const opc = (tx: TransactionSql, ahora = AHORA) => ({ sql: tx, ahora });

/** Reporta (no parcial) y da por confirmada la variación: los tests de la confirmación la piden aparte. */
const reportarCon = (tx: TransactionSql, sesion: SesionFlujo, medicionId: number, valores: Record<string, string>, ahora = AHORA) =>
  reportar(sesion, { medicionId, valores, parcial: false, confirmado: true }, opc(tx, ahora));

const fila = async (tx: TransactionSql, medicionId: number) => {
  const [m] = await tx`SELECT * FROM mediciones WHERE id = ${medicionId}`;
  return m;
};

const eventos = (tx: TransactionSql, medicionId: number) =>
  tx`SELECT tipo, usuario_id, detalle FROM medicion_eventos WHERE medicion_id = ${medicionId} ORDER BY id`;

const valores = async (tx: TransactionSql, medicionId: number) =>
  Object.fromEntries(
    (
      await tx`SELECT iv.letra, mv.valor FROM medicion_valores mv JOIN indicador_variables iv ON iv.id = mv.variable_id
        WHERE mv.medicion_id = ${medicionId} ORDER BY iv.letra`
    ).map((v) => [v.letra as string, Number(v.valor)]),
  );

const bitacora = (tx: TransactionSql, accion: string, medicionId: number) =>
  tx`SELECT usuario_id, detalle FROM auditoria WHERE accion = ${accion} AND entidad = 'medicion' AND entidad_id = ${medicionId} ORDER BY id`;

/** Un proceso que solo existe en la transacción, sin líderes: nadie más que el Admin SGC puede medir sus indicadores. */
async function procesoSinLider(tx: TransactionSql): Promise<number> {
  const sigla = `Z${unico()}`;
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${`Proceso ${sigla}`}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id`;
  return Number(p.id);
}

/** Una versión 2 trimestral, aprobada, que rige desde el tercer trimestre de 2026; devuelve su id. */
async function versionTrimestral(tx: TransactionSql, indicadorId: number): Promise<number> {
  const admin = await sesionAdmin(tx);
  const [v2] = await tx`INSERT INTO indicador_versiones (indicador_id, numero, estado, tipo_cambio, nombre, forma, formula, periodicidad,
      tendencia, meta, semaforo_modo, umbral_atencion_pct, unidad_sufijo, decimales, creado_por)
    VALUES (${indicadorId}, 2, 'borrador', 'mayor', 'Trimestral', 'porcentaje', 'A / B * 100', 'trimestral', 'ascendente', 90, 'relativo', 70,
      ' %', 1, ${admin.usuarioId}) RETURNING id`;
  await tx`SELECT id FROM indicador_versiones WHERE id = ${v2.id} FOR UPDATE`;
  for (const [orden, letra] of [[1, "A"], [2, "B"]] as const) {
    await tx`INSERT INTO indicador_variables (version_id, letra, nombre, orden) VALUES (${v2.id}, ${letra}, ${letra}, ${orden})`;
  }
  await tx`UPDATE indicador_versiones SET estado = 'aprobada', elaborada_por = ${admin.usuarioId}, huella = ${"1".repeat(64)},
      rige_desde = '2026-T3', aprobada_por = ${admin.usuarioId}, aprobada_en = '2026-06-15T15:00:00Z'
    WHERE id = ${v2.id}`;
  return Number(v2.id);
}

/** Un soporte de la medición, como lo dejaría la subida (contexto `medicion`). */
const soporte = (tx: TransactionSql, medicionId: number) =>
  tx`INSERT INTO archivos (rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256, contexto, contexto_id)
    VALUES ('evidencia', ${`zz/${unico()}.pdf`}, 'soporte.pdf', 'pdf', 'application/pdf', 10, ${"a".repeat(64)}, 'medicion', ${medicionId})`;

describe("asegurarMediciones", () => {
  it("abre los periodos terminados, marca los históricos y es idempotente", () =>
    revertida(sql, async (tx) => {
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const ind = await indicadorDePrueba(tx, {
        periodicidad: "trimestral",
        inicioMedicion: "2025-T3",
        aprobadaEn: APROBADA,
        mide: [mide.usuarioId],
      });
      expect(await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: ind.id })).toBe(5);
      const filas = await tx`SELECT periodo, historica, version_id, estado, vence_en FROM mediciones WHERE indicador_id = ${ind.id} ORDER BY desde`;
      expect(filas.map((f) => [f.periodo, f.historica, Number(f.version_id), f.estado])).toEqual([
        ["2025-T3", true, ind.versionId, "abierta"],
        ["2025-T4", true, ind.versionId, "abierta"],
        ["2026-T1", false, ind.versionId, "abierta"],
        ["2026-T2", false, ind.versionId, "abierta"],
        ["2026-T3", false, ind.versionId, "abierta"],
      ]);
      // Fin del día (zona de la instalación) del último día del periodo más el plazo de reporte (10 días).
      expect(filas[4].vence_en).toEqual(new Date("2026-10-11T04:59:59.999Z"));
      expect(await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: ind.id })).toBe(0);
    }));

  it("el cambio de año no abre un periodo de más ni de menos", () =>
    revertida(sql, async (tx) => {
      const ind = await indicadorDePrueba(tx, { periodicidad: "trimestral", inicioMedicion: "2025-T3", aprobadaEn: APROBADA });
      // 23:30 del 31 de diciembre en Bogotá: el cuarto trimestre aún no termina.
      expect(await asegurarMediciones({ sql: tx, ahora: new Date("2027-01-01T04:30:00Z"), indicadorId: ind.id })).toBe(5);
      const antes = await tx`SELECT periodo FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = '2026-T4'`;
      expect(antes).toHaveLength(0);
      // 00:30 del 1 de enero: ya terminó.
      expect(await asegurarMediciones({ sql: tx, ahora: new Date("2027-01-01T05:30:00Z"), indicadorId: ind.id })).toBe(1);
      const [t4] = await tx`SELECT periodo, historica FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = '2026-T4'`;
      expect(t4).toEqual({ periodo: "2026-T4", historica: false });
    }));

  it("un borrador, un descartado o un retirado no abren periodos", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const borrador = await indicadorDePrueba(tx, { estado: "borrador", periodicidad: "trimestral", inicioMedicion: "2025-T3" });
      const descartado = await indicadorDePrueba(tx, { estado: "borrador", periodicidad: "trimestral", inicioMedicion: "2025-T3" });
      await tx`UPDATE indicadores SET estado = 'descartado', baja_por = ${admin.usuarioId}, baja_en = now(), baja_motivo = 'Se abandonó'
        WHERE id = ${descartado.id}`;
      const retirado = await indicadorDePrueba(tx, { periodicidad: "trimestral", inicioMedicion: "2025-T3", aprobadaEn: APROBADA });
      await tx`UPDATE indicadores SET estado = 'retirado', baja_por = ${admin.usuarioId}, baja_en = now(), baja_motivo = 'Ya no se mide'
        WHERE id = ${retirado.id}`;
      for (const i of [borrador, descartado, retirado]) {
        expect(await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: i.id })).toBe(0);
        expect(await tx`SELECT id FROM mediciones WHERE indicador_id = ${i.id}`).toHaveLength(0);
      }
    }));

  it("tras un cambio mayor de periodicidad, los periodos desde su «rige desde» son de la nueva", () =>
    revertida(sql, async (tx) => {
      const ind = await indicadorDePrueba(tx, { periodicidad: "mensual", inicioMedicion: "2026-01", aprobadaEn: APROBADA });
      const v2 = await versionTrimestral(tx, ind.id);
      expect(await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: ind.id })).toBe(7);
      const filas = await tx`SELECT periodo, version_id FROM mediciones WHERE indicador_id = ${ind.id} ORDER BY desde`;
      expect(filas.map((f) => f.periodo)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-T3"]);
      expect(Number(filas[5].version_id)).toBe(ind.versionId);
      expect(Number(filas[6].version_id)).toBe(v2);
    }));

  it("un mes que quedó abierto dentro del trimestre de un cambio mayor de periodicidad no se mide", () =>
    revertida(sql, async (tx) => {
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const ind = await indicadorDePrueba(tx, { periodicidad: "mensual", inicioMedicion: "2026-01", aprobadaEn: APROBADA, mide: [mide.usuarioId] });
      // Los meses hasta septiembre se abren con la ficha mensual; después llega la trimestral que rige desde el tercer trimestre.
      expect(await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: ind.id })).toBe(9);
      await versionTrimestral(tx, ind.id);
      expect(await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: ind.id })).toBe(1);
      const id = async (periodo: string) => Number((await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = ${periodo}`)[0].id);
      const julio = await id("2026-07");
      const ajena = "Ese periodo ya no se mide: la ficha que lo rige es de otra periodicidad";
      await rechaza(reportarCon(tx, mide, julio, { A: "5", B: "5" }), ajena);
      await rechaza(marcarNoAplica(mide, { medicionId: julio, motivo: "Sin casos en el mes" }, opc(tx)), ajena);
      await rechaza(recalcularMedicion(tx, julio, { ahora: AHORA, actorId: mide.usuarioId, evento: "recalculo" }), ajena);
      expect(await medicionParaReportar(mide, ind.codigo, "2026-07", opc(tx))).toBeNull();
      // «Reportar» ofrece la primera que sí se mide: con enero a junio resueltos, el tercer trimestre y no julio.
      for (const mes of ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]) {
        await marcarNoAplica(mide, { medicionId: await id(mes), motivo: "Sin casos en el mes" }, opc(tx));
      }
      expect(await proximaPorReportar(mide, ind.id, { sql: tx })).toEqual({ periodo: "2026-T3", etiqueta: "tercer trimestre de 2026" });
      expect((await reportarCon(tx, mide, await id("2026-T3"), { A: "5", B: "5" })).ok).toBe(true);
    }));
});

describe("reportar", () => {
  it("reportar calcula, congela la versión y la meta, y deja el evento", () =>
    revertida(sql, async (tx) => {
      const { ind, mide, medicion } = await preparar(tx);
      const t3 = await medicion("2026-T3");
      expect(await reportarCon(tx, mide, t3, { A: "3", B: "5" })).toEqual({ ok: true, estado: "abierta", semaforo: "critico" });
      const m = await fila(tx, t3);
      expect({
        resultado_exacto: m.resultado_exacto,
        resultado: Number(m.resultado),
        semaforo: m.semaforo,
        meta_aplicada: Number(m.meta_aplicada),
        limite_aplicado: Number(m.limite_aplicado),
        version_id: Number(m.version_id),
        requiere_accion: m.requiere_accion,
        estado: m.estado,
        reportada_por: Number(m.reportada_por),
      }).toEqual({
        resultado_exacto: "60/1",
        resultado: 60,
        semaforo: "critico",
        meta_aplicada: 90,
        limite_aplicado: 63,
        version_id: ind.versionId,
        requiere_accion: true,
        estado: "abierta",
        reportada_por: mide.usuarioId,
      });
      expect(await valores(tx, t3)).toEqual({ A: 3, B: 5 });
      const lista = await eventos(tx, t3);
      expect(lista).toHaveLength(1);
      expect(lista[0].tipo).toBe("reporte");
      expect(Number(lista[0].usuario_id)).toBe(mide.usuarioId);
      expect(lista[0].detalle).toMatchObject({
        antes: { A: null, B: null, resultado: null, semaforo: null, estado: "abierta" },
        despues: { A: "3", B: "5", resultado: "60", semaforo: "critico", estado: "abierta" },
      });
      const [b] = await bitacora(tx, "medicion_reportada", t3);
      expect(b.detalle).toMatchObject({ codigo: ind.codigo, periodo: "2026-T3", resultado: "60 %", semaforo: "critico" });
    }));

  it("un resultado que cumple queda reportado de una vez", () =>
    revertida(sql, async (tx) => {
      const { mide, medicion } = await preparar(tx);
      const t3 = await medicion("2026-T3");
      expect(await reportarCon(tx, mide, t3, { A: "5", B: "5" })).toEqual({ ok: true, estado: "reportada", semaforo: "bien" });
      const m = await fila(tx, t3);
      expect([m.estado, m.semaforo, m.requiere_accion]).toEqual(["reportada", "bien", false]);
    }));

  it("guardar sin reportar conserva lo digitado y no calcula", () =>
    revertida(sql, async (tx) => {
      const { mide, medicion } = await preparar(tx);
      const t3 = await medicion("2026-T3");
      const guardar = (v: Record<string, string>) => reportar(mide, { medicionId: t3, valores: v, parcial: true, confirmado: false }, opc(tx));
      const guardadas = () => bitacora(tx, "medicion_guardada", t3);
      expect(await guardar({ A: "3" })).toEqual({ ok: true, estado: "abierta", semaforo: null });
      expect(await valores(tx, t3)).toEqual({ A: 3 });
      let m = await fila(tx, t3);
      expect([m.resultado_exacto, m.semaforo, m.estado, m.reportada_en]).toEqual([null, null, "abierta", null]);
      // Completo pero sin reportar: tampoco se calcula ni da color.
      expect(await guardar({ A: "3", B: "5" })).toEqual({ ok: true, estado: "abierta", semaforo: null });
      m = await fila(tx, t3);
      expect([m.resultado_exacto, m.semaforo, m.estado]).toEqual([null, null, "abierta"]);
      // Un borrador no deja evento en el historial de la medición ni pasa por «Reportó»: tiene su propia acción.
      expect(await eventos(tx, t3)).toHaveLength(0);
      expect(await bitacora(tx, "medicion_reportada", t3)).toHaveLength(0);
      const filas = await guardadas();
      expect(filas).toHaveLength(2);
      expect(filas[0].detalle).toMatchObject({ periodo: "2026-T3", antes: { A: null, B: null }, despues: { A: "3", B: null } });
      expect(filas[1].detalle).toMatchObject({ antes: { A: "3", B: null }, despues: { A: "3", B: "5" } });
      // Lo mismo otra vez no deja nada.
      await guardar({ A: "3", B: "5" });
      expect(await guardadas()).toHaveLength(2);
      // Un campo vaciado se quita.
      await guardar({ A: "", B: "5" });
      expect(await valores(tx, t3)).toEqual({ B: 5 });
      expect(await guardadas()).toHaveLength(3);

      // Reportado después, cuenta y calcula, y es el primer reporte; ya reportado, no vuelve a «guardar sin reportar».
      await reportarCon(tx, mide, t3, { A: "3", B: "5" });
      m = await fila(tx, t3);
      expect(m.semaforo).toBe("critico");
      expect((await eventos(tx, t3)).map((e) => e.tipo)).toEqual(["reporte"]);
      expect(await bitacora(tx, "medicion_reportada", t3)).toHaveLength(1);
      await rechaza(guardar({ A: "4", B: "5" }), "La medición ya se reportó: corrija los datos y pulse «Reportar»");
    }));

  it("un borrador no congela la versión, la meta ni el límite", () =>
    revertida(sql, async (tx) => {
      const { ind, mide, medicion } = await preparar(tx);
      const t3 = await medicion("2026-T3");
      await reportar(mide, { medicionId: t3, valores: { A: "3", B: "5" }, parcial: true, confirmado: false }, opc(tx));
      let m = await fila(tx, t3);
      expect([m.meta_aplicada, m.meta_max_aplicada, m.limite_aplicado, Number(m.version_id)]).toEqual([null, null, null, ind.versionId]);
      // Reportado, se congela; con «no aplica», también; quitado el «no aplica», vuelve a no tener meta aplicada.
      await reportarCon(tx, mide, t3, { A: "3", B: "5" });
      m = await fila(tx, t3);
      expect([Number(m.meta_aplicada), Number(m.limite_aplicado)]).toEqual([90, 63]);
      await marcarNoAplica(mide, { medicionId: t3, motivo: "No hubo auditorías programadas" }, opc(tx));
      expect(Number((await fila(tx, t3)).meta_aplicada)).toBe(90);
      await quitarNoAplica(mide, t3, opc(tx));
      m = await fila(tx, t3);
      expect([m.meta_aplicada, m.limite_aplicado, m.estado]).toEqual([null, null, "abierta"]);
      // Sin meta congelada, la tabla del año muestra la que aplica hoy (aquí, la programada después).
      const admin = await sesionAdmin(tx);
      await tx`INSERT INTO indicador_metas (indicador_id, periodo, meta, programada_por) VALUES (${ind.id}, '2026-T3', 50, ${admin.usuarioId})`;
      const t3Fila = (await tablaDelAnio(mide, ind.id, 2026, opc(tx)))[2];
      expect(t3Fila.meta).toBe("≥ 50 %");
    }));

  it("lo que ya se reportó una vez se corrige: quitar «no aplica» y volver a reportar no es un primer reporte", () =>
    revertida(sql, async (tx) => {
      const { mide, medicion } = await preparar(tx);
      const [t2, t3] = [await medicion("2026-T2"), await medicion("2026-T3")];
      await reportarCon(tx, mide, t3, { A: "5", B: "5" });
      await marcarNoAplica(mide, { medicionId: t3, motivo: "No hubo auditorías programadas" }, opc(tx));
      await quitarNoAplica(mide, t3, opc(tx));
      await reportarCon(tx, mide, t3, { A: "4", B: "5" });
      expect((await eventos(tx, t3)).map((e) => e.tipo)).toEqual(["reporte", "no_aplica", "correccion", "correccion"]);
      expect(await bitacora(tx, "medicion_reportada", t3)).toHaveLength(1);
      expect(await bitacora(tx, "medicion_corregida", t3)).toHaveLength(2);
      // Marcada «no aplica» sin haberse reportado nunca, quitarla y reportar también es una corrección.
      await marcarNoAplica(mide, { medicionId: t2, motivo: "No hubo auditorías programadas" }, opc(tx));
      await quitarNoAplica(mide, t2, opc(tx));
      await reportarCon(tx, mide, t2, { A: "5", B: "5" });
      expect((await eventos(tx, t2)).map((e) => e.tipo)).toEqual(["no_aplica", "correccion", "correccion"]);
      expect(await bitacora(tx, "medicion_reportada", t2)).toHaveLength(0);
    }));

  it("validaciones al digitar", () =>
    revertida(sql, async (tx) => {
      const { mide, medicion } = await preparar(tx);
      const t3 = await medicion("2026-T3");
      await rechaza(reportarCon(tx, mide, t3, { A: "abc", B: "5" }), "«Auditorías ejecutadas» debe ser un número");
      await rechaza(reportarCon(tx, mide, t3, { A: "-1", B: "5" }), "«Auditorías ejecutadas» no puede ser negativo");
      await rechaza(reportarCon(tx, mide, t3, { A: "3,12345", B: "5" }), "«Auditorías ejecutadas» admite hasta 15 cifras enteras y 4 decimales");
      await rechaza(reportarCon(tx, mide, t3, { A: "3" }), "Falta el valor de «Auditorías programadas»");
      await rechaza(reportarCon(tx, mide, t3, { A: "3", B: "5", C: "1" }), "La ficha del indicador cambió: recargue la página");

      const otro = await preparar(tx, { variables: { ...AUDITORIAS, A: { ...AUDITORIAS.A, capturaMax: "10" } }, resultadoMax: "100" });
      const o3 = await otro.medicion("2026-T3");
      await rechaza(reportarCon(tx, otro.mide, o3, { A: "11", B: "20" }), "«Auditorías ejecutadas» no puede pasar de 10");
      await rechaza(reportarCon(tx, otro.mide, o3, { A: "6", B: "5" }), "El resultado (120 %) queda fuera de los límites del indicador");
      expect(await valores(tx, t3)).toEqual({});
      expect(await valores(tx, o3)).toEqual({});
      expect(await eventos(tx, o3)).toHaveLength(0);
      // Con coma decimal, se guarda con punto.
      await reportarCon(tx, otro.mide, o3, { A: "4,5", B: "5" });
      expect(await valores(tx, o3)).toEqual({ A: 4.5, B: 5 });
    }));

  it("un salto grande pide confirmación antes de escribir", () =>
    revertida(sql, async (tx) => {
      const { mide, medicion } = await preparar(tx);
      const [t2, t3] = [await medicion("2026-T2"), await medicion("2026-T3")];
      await reportarCon(tx, mide, t2, { A: "5", B: "6" });
      expect((await fila(tx, t2)).semaforo).toBe("atencion");
      const pedir = (confirmado: boolean) => reportar(mide, { medicionId: t3, valores: { A: "2", B: "5" }, parcial: false, confirmado }, opc(tx));
      expect(await pedir(false)).toEqual({
        ok: false,
        confirmar: "El resultado baja 43,3 puntos frente al segundo trimestre de 2026. ¿Los datos son correctos?",
      });
      expect(await valores(tx, t3)).toEqual({});
      expect(await eventos(tx, t3)).toHaveLength(0);
      expect(await pedir(true)).toEqual({ ok: true, estado: "abierta", semaforo: "critico" });
      expect(await valores(tx, t3)).toEqual({ A: 2, B: 5 });
    }));

  it("la confirmación compara con la medición anterior con resultado, aunque sea histórica", () =>
    revertida(sql, async (tx) => {
      const { ind, mide, medicion } = await preparar(tx);
      const t1 = await medicion("2026-T1");
      await registrarHistoricos(mide, { indicadorId: ind.id, filas: [{ periodo: "2025-T4", valores: { A: "5", B: "5" } }] }, opc(tx));
      expect(await reportar(mide, { medicionId: t1, valores: { A: "1", B: "5" }, parcial: false, confirmado: false }, opc(tx))).toEqual({
        ok: false,
        confirmar: "El resultado baja 80 puntos frente al cuarto trimestre de 2025. ¿Los datos son correctos?",
      });
      // Un cambio pequeño no la pide; guardar sin reportar tampoco.
      expect((await reportar(mide, { medicionId: t1, valores: { A: "4,5", B: "5" }, parcial: false, confirmado: false }, opc(tx))).ok).toBe(true);
    }));

  it("denominador 0: no hay cero ni error, se ofrece «No aplica»", () =>
    revertida(sql, async (tx) => {
      const { mide, medicion } = await preparar(tx);
      const t3 = await medicion("2026-T3");
      await rechaza(
        reportarCon(tx, mide, t3, { A: "0", B: "0" }),
        "No se puede calcular: división por cero. Si no hubo casos, marque «No aplica en este periodo».",
      );
      expect(await valores(tx, t3)).toEqual({});
      // Guardado sin reportar no se calcula: no hay error.
      expect((await reportar(mide, { medicionId: t3, valores: { A: "0", B: "0" }, parcial: true, confirmado: false }, opc(tx))).ok).toBe(true);
    }));

  it("«No aplica» exige motivo, cuenta como reportado y se puede quitar", () =>
    revertida(sql, async (tx) => {
      const { ind, mide, medicion } = await preparar(tx);
      const t3 = await medicion("2026-T3");
      await rechaza(marcarNoAplica(mide, { medicionId: t3, motivo: "x" }, opc(tx)), "El motivo debe tener al menos 5 caracteres");
      await rechaza(marcarNoAplica(mide, { medicionId: t3, motivo: "x".repeat(501) }, opc(tx)), "El motivo no puede pasar de 500 caracteres");
      await rechaza(quitarNoAplica(mide, t3, opc(tx)), "La medición no está marcada «No aplica»");

      await marcarNoAplica(mide, { medicionId: t3, motivo: "No hubo auditorías programadas" }, opc(tx));
      let m = await fila(tx, t3);
      expect([m.no_aplica, m.no_aplica_motivo, m.estado, m.semaforo, m.resultado_exacto, m.requiere_accion]).toEqual([
        true,
        "No hubo auditorías programadas",
        "reportada",
        null,
        null,
        false,
      ]);
      expect((await eventos(tx, t3)).map((e) => e.tipo)).toEqual(["no_aplica"]);
      const [b] = await bitacora(tx, "medicion_no_aplica", t3);
      expect(b.detalle).toMatchObject({ codigo: ind.codigo, periodo: "2026-T3", motivo: "No hubo auditorías programadas" });
      // Marcar otra vez lo mismo no deja otro evento.
      await marcarNoAplica(mide, { medicionId: t3, motivo: "No hubo auditorías programadas" }, opc(tx));
      expect(await eventos(tx, t3)).toHaveLength(1);

      await quitarNoAplica(mide, t3, opc(tx));
      m = await fila(tx, t3);
      expect([m.no_aplica, m.no_aplica_motivo, m.estado, m.reportada_en]).toEqual([false, null, "abierta", null]);
      const lista = await eventos(tx, t3);
      expect(lista.map((e) => e.tipo)).toEqual(["no_aplica", "correccion"]);
      expect(lista[1].detalle).toMatchObject({ antes: { noAplica: true }, despues: { noAplica: false } });
      const [c] = await bitacora(tx, "medicion_corregida", t3);
      expect(c.detalle).toMatchObject({ codigo: ind.codigo, periodo: "2026-T3", antes: { noAplica: true }, despues: { noAplica: false } });
    }));

  it("soporte obligatorio: no se reporta sin él, salvo parcial o «no aplica»", () =>
    revertida(sql, async (tx) => {
      const { ind, mide, medicion } = await preparar(tx, { soporteObligatorio: true });
      const [t2, t3] = [await medicion("2026-T2"), await medicion("2026-T3")];
      expect(await contarSoportes(tx, t3)).toBe(0);
      await rechaza(reportarCon(tx, mide, t3, { A: "5", B: "5" }), "Este indicador exige un soporte: adjúntelo antes de reportar");
      expect((await reportar(mide, { medicionId: t3, valores: { A: "5", B: "5" }, parcial: true, confirmado: false }, opc(tx))).ok).toBe(true);
      await marcarNoAplica(mide, { medicionId: t2, motivo: "No hubo auditorías programadas" }, opc(tx));
      expect((await fila(tx, t2)).estado).toBe("reportada");
      await soporte(tx, t3);
      expect(await contarSoportes(tx, t3)).toBe(1);
      expect(await reportarCon(tx, mide, t3, { A: "5", B: "5" })).toEqual({ ok: true, estado: "reportada", semaforo: "bien" });
      // Un histórico no lo exige.
      const filas = [{ periodo: "2025-T4", valores: { A: "5", B: "5" } }];
      expect(await registrarHistoricos(mide, { indicadorId: ind.id, filas }, opc(tx))).toEqual({ registrados: 1 });
    }));

  it("mide el designado y el líder; los demás no", () =>
    revertida(sql, async (tx) => {
      const { ind, medicion } = await preparar(tx);
      const t3 = await medicion("2026-T3");
      const ajeno = await usuarioDePrueba(tx, { rol: "consulta" });
      await sinPermiso(reportarCon(tx, ajeno, t3, { A: "5", B: "5" }));
      await sinPermiso(marcarNoAplica(ajeno, { medicionId: t3, motivo: "No hubo auditorías" }, opc(tx)));
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [ind.procesoId] });
      expect((await reportarCon(tx, lider, t3, { A: "5", B: "5" })).ok).toBe(true);
      // Gerencia y Control Interno ven todo, pero no miden sin designación.
      await sinPermiso(reportarCon(tx, await usuarioDePrueba(tx, { rol: "gerencia" }), t3, { A: "4", B: "5" }));

      const restringido = await preparar(tx, { nivelAcceso: "restringido" });
      const r3 = await restringido.medicion("2026-T3");
      await rechaza(reportarCon(tx, ajeno, r3, { A: "5", B: "5" }), "La medición no existe");
      await rechaza(reportarCon(tx, ajeno, 999_999_999, { A: "5", B: "5" }), "La medición no existe");
      expect((await reportarCon(tx, restringido.mide, r3, { A: "5", B: "5" })).ok).toBe(true);
    }));

  it("el Admin SGC reporta solo si nadie más puede, y queda marcado", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const procesoId = await procesoSinLider(tx);
      const ind = await indicadorDePrueba(tx, { procesoId, periodicidad: "trimestral", inicioMedicion: "2025-T3", aprobadaEn: APROBADA });
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: ind.id });
      const [m] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = '2026-T3'`;
      const t3 = Number(m.id);
      await reportarCon(tx, admin, t3, { A: "5", B: "5" });
      const [e] = await eventos(tx, t3);
      expect(e.detalle).toMatchObject({ sinMedidor: true });
      const [b] = await bitacora(tx, "medicion_reportada", t3);
      expect(b.detalle).toMatchObject({ sinMedidor: true });

      // Con alguien que mida, el Admin SGC deja de poder.
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      await tx`INSERT INTO indicador_designados (indicador_id, usuario_id, funcion, creado_por) VALUES (${ind.id}, ${mide.usuarioId}, 'mide', ${admin.usuarioId})`;
      await sinPermiso(reportarCon(tx, admin, t3, { A: "4", B: "5" }));
      // Si quien mide se desactiva, el Admin SGC vuelve a poder, con la marca.
      await tx`UPDATE usuarios SET activo = false WHERE id = ${mide.usuarioId}`;
      await reportarCon(tx, admin, t3, { A: "3", B: "5" });
      expect((await eventos(tx, t3))[1].detalle).toMatchObject({ sinMedidor: true });
      // Designado, sí, y sin marca.
      await tx`INSERT INTO indicador_designados (indicador_id, usuario_id, funcion, creado_por) VALUES (${ind.id}, ${admin.usuarioId}, 'mide', ${admin.usuarioId})`;
      await reportarCon(tx, admin, t3, { A: "4", B: "5" });
      const lista = await eventos(tx, t3);
      expect(lista).toHaveLength(3);
      expect(lista[2].detalle.sinMedidor).toBeUndefined();
    }));

  it("corregir antes del cierre deja el antes y el después, y puede volver a pedir el análisis", () =>
    revertida(sql, async (tx) => {
      const { ind, mide, medicion } = await preparar(tx);
      const t3 = await medicion("2026-T3");
      await reportarCon(tx, mide, t3, { A: "5", B: "5" });
      expect((await fila(tx, t3)).estado).toBe("reportada");
      expect(await reportarCon(tx, mide, t3, { A: "4", B: "5" })).toEqual({ ok: true, estado: "abierta", semaforo: "atencion" });
      const lista = await eventos(tx, t3);
      expect(lista.map((e) => e.tipo)).toEqual(["reporte", "correccion"]);
      expect(lista[1].detalle).toMatchObject({
        antes: { A: "5", B: "5", resultado: "100", semaforo: "bien", estado: "reportada" },
        despues: { A: "4", B: "5", resultado: "80", semaforo: "atencion", estado: "abierta" },
      });
      const [b] = await bitacora(tx, "medicion_corregida", t3);
      expect(b.detalle).toMatchObject({ codigo: ind.codigo, periodo: "2026-T3", resultadoAntes: "100 %", resultado: "80 %" });
      // El mismo resultado con otros datos también es una corrección.
      await reportarCon(tx, mide, t3, { A: "8", B: "10" });
      expect((await eventos(tx, t3)).map((e) => e.tipo)).toEqual(["reporte", "correccion", "correccion"]);
    }));

  it("reportar dos veces lo mismo no duplica el evento", () =>
    revertida(sql, async (tx) => {
      const { mide, medicion } = await preparar(tx);
      const t3 = await medicion("2026-T3");
      await reportarCon(tx, mide, t3, { A: "5", B: "5" });
      expect(await reportarCon(tx, mide, t3, { A: "5,0", B: "5" })).toEqual({ ok: true, estado: "reportada", semaforo: "bien" });
      expect(await eventos(tx, t3)).toHaveLength(1);
      expect(await bitacora(tx, "medicion_reportada", t3)).toHaveLength(1);
      expect(await bitacora(tx, "medicion_corregida", t3)).toHaveLength(0);
    }));

  it("una medición cerrada no se reporta", () =>
    revertida(sql, async (tx) => {
      const { mide, medicion } = await preparar(tx);
      const t3 = await medicion("2026-T3");
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id = ${t3}`;
      const cerrada = "La medición está cerrada: pida al Administrador del SGC que la reabra";
      await rechaza(reportarCon(tx, mide, t3, { A: "5", B: "5" }), cerrada);
      await rechaza(marcarNoAplica(mide, { medicionId: t3, motivo: "No hubo auditorías" }, opc(tx)), cerrada);
      await rechaza(recalcularMedicion(tx, t3, { ahora: AHORA, actorId: mide.usuarioId, evento: "recalculo" }), cerrada);
    }));

  it("un indicador retirado ya no admite reportes", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const { ind, mide, medicion } = await preparar(tx);
      const t3 = await medicion("2026-T3");
      await tx`UPDATE indicadores SET estado = 'retirado', baja_por = ${admin.usuarioId}, baja_en = now(), baja_motivo = 'Ya no se mide'
        WHERE id = ${ind.id}`;
      await rechaza(reportarCon(tx, mide, t3, { A: "5", B: "5" }), "El indicador está retirado: ya no admite reportes");
      await rechaza(marcarNoAplica(mide, { medicionId: t3, motivo: "No hubo auditorías" }, opc(tx)), "El indicador está retirado: ya no admite reportes");
    }));

  it("la meta programada del periodo manda sobre la de la ficha", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const { ind, mide, medicion } = await preparar(tx);
      const t3 = await medicion("2026-T3");
      await tx`INSERT INTO indicador_metas (indicador_id, periodo, meta, programada_por) VALUES (${ind.id}, '2026-T3', 50, ${admin.usuarioId})`;
      expect(await reportarCon(tx, mide, t3, { A: "3", B: "5" })).toEqual({ ok: true, estado: "reportada", semaforo: "bien" });
      const m = await fila(tx, t3);
      expect([Number(m.meta_aplicada), Number(m.limite_aplicado)]).toEqual([50, 35]);
    }));

  it("tres periodos seguidos sin cumplir: incumplimiento repetido", () =>
    revertida(sql, async (tx) => {
      const { mide, medicion } = await preparar(tx);
      for (const periodo of ["2026-T1", "2026-T2"]) {
        await reportarCon(tx, mide, await medicion(periodo), { A: "4", B: "5" });
        const m = await fila(tx, await medicion(periodo));
        expect([m.semaforo, m.incumplimiento_repetido, m.requiere_accion]).toEqual(["atencion", false, false]);
      }
      const t3 = await medicion("2026-T3");
      await reportarCon(tx, mide, t3, { A: "4", B: "5" });
      const m = await fila(tx, t3);
      expect([m.semaforo, m.incumplimiento_repetido, m.requiere_accion, m.estado]).toEqual(["atencion", true, true, "abierta"]);

      // Con solo el segundo y el tercero en atención y los dos históricos de 2025 en crítico, no hay racha: los históricos no
      // cuentan y el primer trimestre sin dato no la rompe ni la completa.
      const otro = await preparar(tx);
      for (const periodo of ["2025-T3", "2025-T4"]) {
        const id = await otro.medicion(periodo);
        for (const [variable, valor] of [[otro.ind.variables.A, 1], [otro.ind.variables.B, 5]] as const) {
          await tx`INSERT INTO medicion_valores (medicion_id, variable_id, valor, reportado_por, reportado_en)
            VALUES (${id}, ${variable}, ${valor}, ${otro.mide.usuarioId}, ${AHORA})`;
        }
        await tx`UPDATE mediciones SET reportada_por = ${otro.mide.usuarioId}, reportada_en = ${AHORA} WHERE id = ${id}`;
        const r = await recalcularMedicion(tx, id, { ahora: AHORA, actorId: otro.mide.usuarioId, evento: "historico" });
        expect([r.despues, r.historica, r.repetido]).toEqual(["critico", true, false]);
        const h = await fila(tx, id);
        // Un histórico crítico se ve en rojo, sin «Requiere acción de mejora».
        expect([h.semaforo, h.requiere_accion, h.estado]).toEqual(["critico", false, "reportada"]);
      }
      for (const periodo of ["2026-T2", "2026-T3"]) await reportarCon(tx, otro.mide, await otro.medicion(periodo), { A: "4", B: "5" });
      const o3 = await fila(tx, await otro.medicion("2026-T3"));
      expect([o3.semaforo, o3.incumplimiento_repetido, o3.requiere_accion]).toEqual(["atencion", false, false]);
    }));
});

describe("lecturas", () => {
  it("la tabla del año trae un renglón por periodo de la periodicidad", () =>
    revertida(sql, async (tx) => {
      const { ind, mide, medicion } = await preparar(tx);
      await reportarCon(tx, mide, await medicion("2026-T1"), { A: "5", B: "5" });
      await reportarCon(tx, mide, await medicion("2026-T3"), { A: "3", B: "5" });
      await marcarNoAplica(mide, { medicionId: await medicion("2026-T2"), motivo: "No hubo auditorías programadas" }, opc(tx));
      const lector = await usuarioDePrueba(tx, { rol: "consulta" });
      const filas = await tablaDelAnio(lector, ind.id, 2026, opc(tx));
      expect(filas.map((f) => [f.periodo, f.estado])).toEqual([
        ["2026-T1", "reportada"],
        ["2026-T2", "reportada"],
        ["2026-T3", "falta_analisis"],
        ["2026-T4", "por_venir"],
      ]);
      expect(filas[0]).toMatchObject({ resultado: "100 %", semaforo: "bien", cumple: true, meta: "≥ 90 %" });
      expect(filas[0].valores).toEqual([
        { letra: "A", nombre: "Auditorías ejecutadas", valor: "5" },
        { letra: "B", nombre: "Auditorías programadas", valor: "5" },
      ]);
      expect(filas[1]).toMatchObject({ noAplica: true, motivo: "No hubo auditorías programadas", resultado: null, semaforo: null, cumple: null });
      expect(filas[2]).toMatchObject({ resultado: "60 %", semaforo: "critico", cumple: false, requiereAccion: true, vencida: false });
      expect(filas[2].frase).toBe("No cumple: 60 % frente a una meta de 90 %.");
      expect(filas[3]).toMatchObject({ medicionId: null, resultado: null });
      // 2025 empieza en el tercer trimestre: los dos de antes no se midieron.
      const de2025 = await tablaDelAnio(lector, ind.id, 2025, opc(tx));
      expect(de2025.map((f) => [f.periodo, f.historica, f.estado])).toEqual([
        ["2025-T3", true, "por_reportar"],
        ["2025-T4", true, "por_reportar"],
      ]);
      // Un vencido lo dice: el segundo trimestre de otro indicador sin reportar.
      const otro = await preparar(tx);
      const t2 = (await tablaDelAnio(lector, otro.ind.id, 2026, opc(tx)))[1];
      expect([t2.estado, t2.vencida]).toEqual(["por_reportar", true]);
      // Quien no ve el indicador no recibe filas.
      const restringido = await preparar(tx, { nivelAcceso: "restringido" });
      expect(await tablaDelAnio(lector, restringido.ind.id, 2026, opc(tx))).toEqual([]);
    }));

  it("medicionParaReportar: lo que la pantalla necesita, solo a quien puede medir", () =>
    revertida(sql, async (tx) => {
      const { ind, mide, medicion } = await preparar(tx);
      await reportarCon(tx, mide, await medicion("2026-T2"), { A: "5", B: "6" });
      const datos = await medicionParaReportar(mide, ind.codigo.toLowerCase(), "2026-T3", opc(tx));
      expect(datos).toMatchObject({
        codigo: ind.codigo,
        periodo: "2026-T3",
        etiqueta: "Tercer trimestre de 2026",
        estado: "abierta",
        historica: false,
        noAplica: false,
        reportada: false,
        sinMedidor: false,
        anterior: { clave: "2026-T2", etiqueta: "segundo trimestre de 2026", resultado: "250/3" },
        variacionPct: 30,
        calculo: { formula: "A / B * 100", letras: ["A", "B"] },
        regla: { tendencia: "ascendente", meta: "90", modo: "relativo", umbralPct: 70 },
        unidad: { sufijo: " %", decimales: 1 },
        rangos: "Bien desde 90 % · Atención de 63 a 89,9 % · Crítico por debajo de 63 %",
      });
      expect(datos?.variables.map((v) => [v.letra, v.nombre, v.descripcion, v.fuente, v.valor])).toEqual([
        ["A", "Auditorías ejecutadas", "Auditorías internas hechas en el periodo", "Informes de auditoría", null],
        ["B", "Auditorías programadas", "Auditorías del programa para el periodo", "Programa de Auditorías Internas", null],
      ]);
      expect((await medicionParaReportar(mide, ind.codigo, "2026-T2", opc(tx)))?.variables.map((v) => v.valor)).toEqual(["5", "6"]);
      // Sin medición, sin poder medir o sin ver el indicador: nada.
      expect(await medicionParaReportar(mide, ind.codigo, "2026-T4", opc(tx))).toBeNull();
      expect(await medicionParaReportar(mide, ind.codigo, "2026-13", opc(tx))).toBeNull();
      expect(await medicionParaReportar(await usuarioDePrueba(tx, { rol: "consulta" }), ind.codigo, "2026-T3", opc(tx))).toBeNull();
      expect(await medicionParaReportar(mide, "ZZ-NO-EXISTE-1", "2026-T3", opc(tx))).toBeNull();
    }));
});
