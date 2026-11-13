/**
 * Las metas por periodo y los históricos de un indicador (Fase 14A, Tarea 10; spec §8.8, §8.9 y F14-DC41). Contra la BD
 * de desarrollo, dentro de una transacción que se revierte.
 *
 * `ind` es trimestral, de forma «porcentaje», meta 90 y umbral 70 (límite de crítico 63), aprobado el 15 de enero de
 * 2026. Con inicio en el primer trimestre de 2025, sus cuatro trimestres de 2025 son históricos y los de 2026,
 * ordinarios. Hoy es el 5 de octubre de 2026: el tercer trimestre terminó y el cuarto no.
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
import { proximaPorReportar, tablaDelAnio } from "@/db/consultas/indicadores/lectura";
import { asegurarMediciones, marcarNoAplica, quitarNoAplica, reportar } from "@/db/consultas/indicadores/mediciones";
import { metasDelAnio, programarMeta } from "@/db/consultas/indicadores/metas";
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

const AHORA = new Date("2026-10-05T15:00:00Z");
const APROBADA = new Date("2026-01-15T15:00:00Z");
const JUSTIFICACION = "La Secretaría de Salud ajustó la meta del trimestre";
const TARDIA = "Ese periodo ya terminó: escriba la justificación del cambio de meta";
const NO_HISTORICO = "Ese periodo no es histórico: repórtelo por «Reportar»";

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

const opc = (tx: TransactionSql, ahora = AHORA) => ({ sql: tx, ahora });

/** El indicador de la cabecera, con quien lo mide; `o` cambia lo que haga falta. Sin `abrir: false`, abre sus periodos. */
async function preparar(tx: TransactionSql, o: OpcionesIndicadorDePrueba & { abrir?: boolean } = {}) {
  const { abrir, ...opciones } = o;
  const mide = await usuarioDePrueba(tx, { rol: "consulta" });
  const admin = await sesionAdmin(tx);
  const ind = await indicadorDePrueba(tx, {
    periodicidad: "trimestral",
    inicioMedicion: "2025-T1",
    aprobadaEn: APROBADA,
    mide: [mide.usuarioId],
    ...opciones,
  });
  if (abrir !== false) await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: ind.id });
  const medicion = async (periodo: string) => {
    const [m] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = ${periodo}`;
    return m ? Number(m.id) : null;
  };
  const id = async (periodo: string) => (await medicion(periodo))!;
  return { ind, mide, admin, medicion, id };
}

const reportarCon = (tx: TransactionSql, sesion: SesionFlujo, medicionId: number, valores: Record<string, string>) =>
  reportar(sesion, { medicionId, valores, parcial: false, confirmado: true }, opc(tx));

const fila = async (tx: TransactionSql, medicionId: number) => (await tx`SELECT * FROM mediciones WHERE id = ${medicionId}`)[0];

const meta = async (tx: TransactionSql, indicadorId: number, periodo: string) =>
  (await tx`SELECT * FROM indicador_metas WHERE indicador_id = ${indicadorId} AND periodo = ${periodo}`)[0];

const eventos = (tx: TransactionSql, medicionId: number) =>
  tx`SELECT tipo, usuario_id, detalle FROM medicion_eventos WHERE medicion_id = ${medicionId} ORDER BY id`;

const bitacora = (tx: TransactionSql, accion: string, entidad: string, entidadId: number) =>
  tx`SELECT usuario_id, detalle FROM auditoria WHERE accion = ${accion} AND entidad = ${entidad} AND entidad_id = ${entidadId} ORDER BY id`;

describe("programarMeta", () => {
  it("la meta de un periodo que no ha terminado se programa libremente", () =>
    revertida(sql, async (tx) => {
      const { ind, mide, admin } = await preparar(tx);
      await programarMeta(admin, { indicadorId: ind.id, periodo: "2026-T4", meta: "95" }, opc(tx));
      let m = await meta(tx, ind.id, "2026-T4");
      expect([Number(m.meta), m.meta_max, m.tardia, m.justificacion, Number(m.programada_por)]).toEqual([95, null, false, null, admin.usuarioId]);
      await programarMeta(admin, { indicadorId: ind.id, periodo: "2026-T4", meta: "96,5" }, opc(tx));
      m = await meta(tx, ind.id, "2026-T4");
      expect(Number(m.meta)).toBe(96.5);
      const filas = await bitacora(tx, "indicador_meta_programada", "indicador", ind.id);
      expect(filas).toHaveLength(2);
      expect(filas[0].detalle).toMatchObject({ codigo: ind.codigo, periodo: "2026-T4", antes: { meta: "90", metaMax: null }, despues: { meta: "95", metaMax: null }, tardia: false });
      expect(filas[1].detalle).toMatchObject({ antes: { meta: "95" }, despues: { meta: "96.5" } });
      // Lo mismo otra vez no deja nada.
      await programarMeta(admin, { indicadorId: ind.id, periodo: "2026-T4", meta: "96.5" }, opc(tx));
      expect(await bitacora(tx, "indicador_meta_programada", "indicador", ind.id)).toHaveLength(2);

      // Solo el Admin SGC, en un periodo que se mide, con una meta que sea número.
      await sinPermiso(programarMeta(mide, { indicadorId: ind.id, periodo: "2026-T4", meta: "80" }, opc(tx)));
      await rechaza(programarMeta(admin, { indicadorId: ind.id, periodo: "2026-11", meta: "80" }, opc(tx)), "Ese periodo no se mide en este indicador");
      await rechaza(programarMeta(admin, { indicadorId: ind.id, periodo: "2024-T4", meta: "80" }, opc(tx)), "Ese periodo no se mide en este indicador");
      await rechaza(programarMeta(admin, { indicadorId: ind.id, periodo: "2026-T4", meta: "mucho" }, opc(tx)), "La meta debe ser un número");
      await rechaza(
        programarMeta(admin, { indicadorId: ind.id, periodo: "2026-T4", meta: "80", metaMax: "90" }, opc(tx)),
        "El máximo del rango solo aplica a un indicador de tendencia constante",
      );
    }));

  it("después de terminado exige justificación, deja la marca y recalcula", () =>
    revertida(sql, async (tx) => {
      const { ind, mide, admin, id } = await preparar(tx);
      const t3 = await id("2026-T3");
      expect(await reportarCon(tx, mide, t3, { A: "4", B: "5" })).toEqual({ ok: true, estado: "abierta", semaforo: "atencion" });
      await rechaza(programarMeta(admin, { indicadorId: ind.id, periodo: "2026-T3", meta: "80" }, opc(tx)), TARDIA);
      await rechaza(programarMeta(admin, { indicadorId: ind.id, periodo: "2026-T3", meta: "80", justificacion: "Corta" }, opc(tx)), TARDIA);
      await rechaza(
        programarMeta(admin, { indicadorId: ind.id, periodo: "2026-T3", meta: "80", justificacion: "x".repeat(501) }, opc(tx)),
        "La justificación no puede pasar de 500 caracteres",
      );
      expect(await meta(tx, ind.id, "2026-T3")).toBeUndefined();

      await programarMeta(admin, { indicadorId: ind.id, periodo: "2026-T3", meta: "80", justificacion: JUSTIFICACION }, opc(tx));
      const p = await meta(tx, ind.id, "2026-T3");
      expect([Number(p.meta), p.tardia, p.justificacion]).toEqual([80, true, JUSTIFICACION]);
      const m = await fila(tx, t3);
      expect([m.meta_tardia, m.semaforo, Number(m.meta_aplicada), m.estado]).toEqual([true, "bien", 80, "reportada"]);
      const ultimo = (await eventos(tx, t3)).at(-1)!;
      expect(ultimo.tipo).toBe("meta");
      expect(Number(ultimo.usuario_id)).toBe(admin.usuarioId);
      expect(ultimo.detalle).toMatchObject({
        justificacion: JUSTIFICACION,
        antes: { meta: "90", semaforo: "atencion", estado: "abierta" },
        despues: { meta: "80", semaforo: "bien", estado: "reportada" },
      });
      const [b] = await bitacora(tx, "indicador_meta_programada", "indicador", ind.id);
      expect(b.detalle).toMatchObject({ periodo: "2026-T3", tardia: true, justificacion: JUSTIFICACION });
      // La tabla del año lo marca.
      const t3Fila = (await tablaDelAnio(mide, ind.id, 2026, opc(tx)))[2];
      expect([t3Fila.metaTardia, t3Fila.meta, t3Fila.semaforo]).toEqual([true, "≥ 80 %", "bien"]);
    }));

  it("un periodo terminado cuya medición aún no se abrió también pide la justificación", () =>
    revertida(sql, async (tx) => {
      const { ind, admin, medicion } = await preparar(tx, { abrir: false });
      expect(await medicion("2026-T2")).toBeNull();
      await rechaza(programarMeta(admin, { indicadorId: ind.id, periodo: "2026-T2", meta: "80" }, opc(tx)), TARDIA);
      expect(await medicion("2026-T2")).not.toBeNull();
      await programarMeta(admin, { indicadorId: ind.id, periodo: "2026-T2", meta: "80", justificacion: JUSTIFICACION }, opc(tx));
      expect((await fila(tx, (await medicion("2026-T2"))!)).meta_tardia).toBe(true);
    }));

  it("con rangos fijos, una meta que deja el límite del lado equivocado se rechaza", () =>
    revertida(sql, async (tx) => {
      const { ind, admin } = await preparar(tx, { modo: "fijo", limite: "60" });
      await rechaza(
        programarMeta(admin, { indicadorId: ind.id, periodo: "2026-T4", meta: "50" }, opc(tx)),
        "Con esa meta el límite de crítico queda del lado equivocado: hace falta una versión nueva de la ficha",
      );
      await rechaza(
        programarMeta(admin, { indicadorId: ind.id, periodo: "2026-T4", meta: "60" }, opc(tx)),
        "Con esa meta el límite de crítico queda del lado equivocado: hace falta una versión nueva de la ficha",
      );
      await programarMeta(admin, { indicadorId: ind.id, periodo: "2026-T4", meta: "70" }, opc(tx));
      expect(Number((await meta(tx, ind.id, "2026-T4")).meta)).toBe(70);
      // En modo relativo el límite sigue a la meta: 50 sirve.
      const relativo = await preparar(tx);
      await programarMeta(relativo.admin, { indicadorId: relativo.ind.id, periodo: "2026-T4", meta: "50" }, opc(tx));
    }));

  it("no se programa la meta de una medición cerrada", () =>
    revertida(sql, async (tx) => {
      const { ind, admin, id } = await preparar(tx);
      const t2 = await id("2026-T2");
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id = ${t2}`;
      await rechaza(
        programarMeta(admin, { indicadorId: ind.id, periodo: "2026-T2", meta: "80", justificacion: JUSTIFICACION }, opc(tx)),
        "La medición de ese periodo está cerrada: reábrala para cambiar su meta",
      );
      expect(await meta(tx, ind.id, "2026-T2")).toBeUndefined();
      // Un indicador retirado ya no admite cambios de meta.
      await tx`UPDATE indicadores SET estado = 'retirado', baja_por = ${admin.usuarioId}, baja_en = now(), baja_motivo = 'Ya no se mide'
        WHERE id = ${ind.id}`;
      await rechaza(
        programarMeta(admin, { indicadorId: ind.id, periodo: "2026-T4", meta: "80" }, opc(tx)),
        "El indicador está retirado: ya no admite cambios de meta",
      );
    }));

  it("un histórico programa su meta sin justificación ni marca", () =>
    revertida(sql, async (tx) => {
      const { ind, mide, admin, id } = await preparar(tx);
      const t4h = await id("2025-T4");
      await registrarHistoricos(mide, { indicadorId: ind.id, filas: [{ periodo: "2025-T4", valores: { A: "4", B: "5" } }] }, opc(tx));
      expect((await fila(tx, t4h)).semaforo).toBe("atencion");
      await programarMeta(admin, { indicadorId: ind.id, periodo: "2025-T4", meta: "80" }, opc(tx));
      const p = await meta(tx, ind.id, "2025-T4");
      expect([p.tardia, p.justificacion]).toEqual([false, null]);
      const m = await fila(tx, t4h);
      expect([m.meta_tardia, m.semaforo, Number(m.meta_aplicada)]).toEqual([false, "bien", 80]);
      expect((await eventos(tx, t4h)).map((e) => e.tipo)).toEqual(["historico", "meta"]);
    }));

  it("metasDelAnio: cada periodo con la meta que hereda, la programada y sus marcas", () =>
    revertida(sql, async (tx) => {
      const { ind, admin, id } = await preparar(tx);
      await programarMeta(admin, { indicadorId: ind.id, periodo: "2026-T3", meta: "80", justificacion: JUSTIFICACION }, opc(tx));
      await programarMeta(admin, { indicadorId: ind.id, periodo: "2026-T4", meta: "95" }, opc(tx));
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id = ${await id("2026-T1")}`;
      const filas = await metasDelAnio(ind.id, 2026, opc(tx));
      expect(filas.map((f) => [f.periodo, f.heredada, f.programada, f.tardia, f.cerrada, f.pideJustificacion])).toEqual([
        ["2026-T1", "90", null, false, true, false],
        ["2026-T2", "90", null, false, false, true],
        ["2026-T3", "90", "80", true, false, true],
        ["2026-T4", "90", "95", false, false, false],
      ]);
      expect(filas[0]).toMatchObject({ etiqueta: "Primer trimestre de 2026", textoHeredada: "≥ 90 %", constante: false, sufijo: " %" });
      // Los históricos no piden justificación.
      expect((await metasDelAnio(ind.id, 2025, opc(tx))).map((f) => f.pideJustificacion)).toEqual([false, false, false, false]);
      expect(await metasDelAnio(ind.id, 2024, opc(tx))).toEqual([]);
    }));
});

describe("programarMeta con rangos (spec 14A §3.4)", () => {
  const RANGOS = {
    bien: [{ signo: ">=" as const, valor: "91" }],
    atencion: [{ signo: "entre" as const, valor: "41", hasta: "90" }],
    critico: [{ signo: "<=" as const, valor: "40" }],
  };

  it("la meta de un periodo tiene que quedar dentro del rango de Bien", () =>
    revertida(sql, async (tx) => {
      const { ind, admin } = await preparar(tx, { rangos: RANGOS, meta: "100" });
      await rechaza(programarMeta(admin, { indicadorId: ind.id, periodo: "2026-T4", meta: "85" }, opc(tx)), "La meta debe quedar dentro del rango de Bien");
      expect(await meta(tx, ind.id, "2026-T4")).toBeUndefined();
      // Bien empieza antes de la meta: una meta de 95 cae dentro de Bien y se acepta.
      await programarMeta(admin, { indicadorId: ind.id, periodo: "2026-T4", meta: "95" }, opc(tx));
      expect(Number((await meta(tx, ind.id, "2026-T4")).meta)).toBe(95);
    }));
});

describe("registrarHistoricos", () => {
  it("los históricos se registran por lote, en la tabla del año", () =>
    revertida(sql, async (tx) => {
      const { ind, mide, id } = await preparar(tx);
      const filas = [
        { periodo: "2025-T1", valores: { A: "", B: " " } },
        { periodo: "2025-T2", valores: { A: "5", B: "5" } },
        { periodo: "2025-T3", valores: { A: "4", B: "5" } },
        { periodo: "2025-T4", valores: { A: "3", B: "5" } },
      ];
      expect(await registrarHistoricos(mide, { indicadorId: ind.id, filas }, opc(tx))).toEqual({ registrados: 3 });
      const esperado: [string, string | null, string][] = [
        ["2025-T1", null, "abierta"],
        ["2025-T2", "bien", "reportada"],
        ["2025-T3", "atencion", "reportada"],
        ["2025-T4", "critico", "reportada"],
      ];
      for (const [periodo, semaforo, estado] of esperado) {
        const m = await fila(tx, await id(periodo));
        expect([m.semaforo, m.estado, m.historica]).toEqual([semaforo, estado, true]);
        const lista = await eventos(tx, await id(periodo));
        if (semaforo === null) {
          expect(lista).toHaveLength(0);
          continue;
        }
        expect([Number(m.reportada_por), m.reportada_en]).toEqual([mide.usuarioId, AHORA]);
        expect(lista.map((e) => [e.tipo, Number(e.usuario_id)])).toEqual([["historico", mide.usuarioId]]);
        const [b] = await bitacora(tx, "medicion_historica_registrada", "medicion", await id(periodo));
        expect(b.detalle).toMatchObject({ codigo: ind.codigo, periodo, correccion: false });
      }
      const tabla = await tablaDelAnio(mide, ind.id, 2025, opc(tx));
      expect(tabla.map((f) => [f.periodo, f.historica, f.resultado])).toEqual([
        ["2025-T1", true, null],
        ["2025-T2", true, "100 %"],
        ["2025-T3", true, "80 %"],
        ["2025-T4", true, "60 %"],
      ]);

      // Lo mismo otra vez no deja nada; una corrección, sí.
      expect(await registrarHistoricos(mide, { indicadorId: ind.id, filas }, opc(tx))).toEqual({ registrados: 0 });
      const corregidas = filas.map((f) => (f.periodo === "2025-T4" ? { ...f, valores: { A: "5", B: "5" } } : f));
      expect(await registrarHistoricos(mide, { indicadorId: ind.id, filas: corregidas }, opc(tx))).toEqual({ registrados: 1 });
      const t4 = await id("2025-T4");
      const lista = await eventos(tx, t4);
      expect(lista.map((e) => e.tipo)).toEqual(["historico", "correccion"]);
      expect(lista[1].detalle).toMatchObject({ antes: { A: "3", B: "5", semaforo: "critico" }, despues: { A: "5", B: "5", semaforo: "bien" } });
      const registros = await bitacora(tx, "medicion_historica_registrada", "medicion", t4);
      expect(registros.map((b) => b.detalle.correccion)).toEqual([false, true]);
    }));

  it("un histórico sin casos se registra «No aplica» en su fila, con su motivo", () =>
    revertida(sql, async (tx) => {
      const { ind, mide, id } = await preparar(tx);
      const t3 = await id("2025-T3");
      const una = (fila: Record<string, unknown>) => registrarHistoricos(mide, { indicadorId: ind.id, filas: [{ periodo: "2025-T3", valores: {}, ...fila }] }, opc(tx));
      // Con 0 y 0, el mensaje dice cómo salir desde la tabla del año.
      await rechaza(
        una({ valores: { A: "0", B: "0" } }),
        "Tercer trimestre de 2025: No se puede calcular: división por cero. Si no hubo casos, marque «No aplica» en esa fila.",
      );
      await rechaza(una({ noAplica: true, motivo: "Poco" }), "Tercer trimestre de 2025: El motivo debe tener al menos 5 caracteres");
      await rechaza(una({ noAplica: true }), "Tercer trimestre de 2025: El motivo debe tener al menos 5 caracteres");
      // Con «No aplica», los valores de la fila no se registran.
      expect(await una({ valores: { A: "0", B: "0" }, noAplica: true, motivo: "No hubo auditorías programadas" })).toEqual({ registrados: 1 });
      let m = await fila(tx, t3);
      expect([m.no_aplica, m.no_aplica_motivo, m.estado, m.semaforo, m.resultado_exacto, Number(m.reportada_por)]).toEqual([
        true,
        "No hubo auditorías programadas",
        "reportada",
        null,
        null,
        mide.usuarioId,
      ]);
      expect(await tx`SELECT id FROM medicion_valores WHERE medicion_id = ${t3}`).toHaveLength(0);
      let lista = await eventos(tx, t3);
      expect(lista.map((e) => e.tipo)).toEqual(["historico"]);
      expect(lista[0].detalle).toMatchObject({ antes: { noAplica: false }, despues: { noAplica: true, motivo: "No hubo auditorías programadas" } });
      const [b] = await bitacora(tx, "medicion_historica_registrada", "medicion", t3);
      expect(b.detalle).toMatchObject({ periodo: "2025-T3", noAplica: true, motivo: "No hubo auditorías programadas", correccion: false });
      // Lo mismo otra vez no deja nada.
      expect(await una({ noAplica: true, motivo: "No hubo auditorías programadas" })).toEqual({ registrados: 0 });

      // Con valores, deja de ser «No aplica»: es una corrección con el antes y el después.
      expect(await una({ valores: { A: "4", B: "5" } })).toEqual({ registrados: 1 });
      m = await fila(tx, t3);
      expect([m.no_aplica, m.no_aplica_motivo, m.semaforo, m.estado]).toEqual([false, null, "atencion", "reportada"]);
      lista = await eventos(tx, t3);
      expect(lista.map((e) => e.tipo)).toEqual(["historico", "correccion"]);
      expect(lista[1].detalle).toMatchObject({
        antes: { noAplica: true, motivo: "No hubo auditorías programadas" },
        despues: { noAplica: false, motivo: null, A: "4", B: "5" },
      });
    }));

  it("«No aplica» y quitarlo tampoco entran a un histórico por fuera de la tabla del año", () =>
    revertida(sql, async (tx) => {
      const { ind, mide, id } = await preparar(tx);
      const t4h = await id("2025-T4");
      const historico = "Ese periodo es histórico: regístrelo en la tabla del año";
      await rechaza(marcarNoAplica(mide, { medicionId: t4h, motivo: "No hubo auditorías programadas" }, opc(tx)), historico);
      await registrarHistoricos(
        mide,
        { indicadorId: ind.id, filas: [{ periodo: "2025-T4", valores: {}, noAplica: true, motivo: "No hubo auditorías programadas" }] },
        opc(tx),
      );
      await rechaza(quitarNoAplica(mide, t4h, opc(tx)), historico);
      expect((await fila(tx, t4h)).no_aplica).toBe(true);
    }));

  it("una fila que no sirve dice su periodo y no deja nada escrito", () =>
    revertida(sql, async (tx) => {
      const { ind, mide, id } = await preparar(tx);
      await rechaza(
        registrarHistoricos(
          mide,
          {
            indicadorId: ind.id,
            filas: [
              { periodo: "2025-T2", valores: { A: "5", B: "5" } },
              { periodo: "2025-T3", valores: { A: "abc", B: "5" } },
            ],
          },
          opc(tx),
        ),
        "Tercer trimestre de 2025: «Casos que cumplen» debe ser un número",
      );
      await rechaza(
        registrarHistoricos(mide, { indicadorId: ind.id, filas: [{ periodo: "2025-T3", valores: { A: "4" } }] }, opc(tx)),
        "Tercer trimestre de 2025: Falta el valor de «Casos evaluados»",
      );
      await rechaza(
        registrarHistoricos(
          mide,
          {
            indicadorId: ind.id,
            filas: [
              { periodo: "2025-T2", valores: { A: "5", B: "5" } },
              { periodo: "2025-T2", valores: { A: "4", B: "5" } },
            ],
          },
          opc(tx),
        ),
        "Segundo trimestre de 2025 está dos veces",
      );
      expect(await eventos(tx, await id("2025-T2"))).toHaveLength(0);
      expect((await fila(tx, await id("2025-T2"))).reportada_en).toBeNull();
    }));

  it("un histórico crítico no lleva «Requiere acción», no pide análisis ni soporte y no cuenta para la racha", () =>
    revertida(sql, async (tx) => {
      const conSoporte = await preparar(tx, { soporteObligatorio: true });
      const filas = [{ periodo: "2025-T4", valores: { A: "1", B: "5" } }];
      expect(await registrarHistoricos(conSoporte.mide, { indicadorId: conSoporte.ind.id, filas }, opc(tx))).toEqual({ registrados: 1 });
      const h = await fila(tx, await conSoporte.id("2025-T4"));
      expect([h.semaforo, h.requiere_accion, h.incumplimiento_repetido, h.estado, h.analisis]).toEqual(["critico", false, false, "reportada", null]);

      // Con los cuatro históricos de 2025 en crítico, el segundo trimestre ordinario en atención no completa la racha de tres.
      const { ind, mide, id } = await preparar(tx);
      const criticos = ["2025-T1", "2025-T2", "2025-T3", "2025-T4"].map((periodo) => ({ periodo, valores: { A: "1", B: "5" } }));
      await registrarHistoricos(mide, { indicadorId: ind.id, filas: criticos }, opc(tx));
      for (const periodo of ["2026-T1", "2026-T2"]) await reportarCon(tx, mide, await id(periodo), { A: "4", B: "5" });
      const t2 = await fila(tx, await id("2026-T2"));
      expect([t2.semaforo, t2.incumplimiento_repetido, t2.requiere_accion]).toEqual(["atencion", false, false]);
      await reportarCon(tx, mide, await id("2026-T3"), { A: "4", B: "5" });
      expect((await fila(tx, await id("2026-T3"))).incumplimiento_repetido).toBe(true);
    }));

  it("solo se registran así los periodos históricos, y solo el Admin SGC o quien mide", () =>
    revertida(sql, async (tx) => {
      const { ind, mide, admin, id } = await preparar(tx);
      const fila2026 = [{ periodo: "2026-T1", valores: { A: "5", B: "5" } }];
      await rechaza(registrarHistoricos(mide, { indicadorId: ind.id, filas: fila2026 }, opc(tx)), NO_HISTORICO);
      // Y un histórico no se reporta por «Reportar», ni se guarda sin reportar: el botón lo salta.
      const t4h = await id("2025-T4");
      await rechaza(reportarCon(tx, mide, t4h, { A: "5", B: "5" }), "Ese periodo es histórico: regístrelo en la tabla del año");
      await rechaza(
        reportar(mide, { medicionId: t4h, valores: { A: "5" }, parcial: true, confirmado: false }, opc(tx)),
        "Ese periodo es histórico: regístrelo en la tabla del año",
      );
      expect(await proximaPorReportar(mide, ind.id, { sql: tx })).toEqual({ periodo: "2026-T1", etiqueta: "primer trimestre de 2026" });

      const filas = [{ periodo: "2025-T4", valores: { A: "5", B: "5" } }];
      await sinPermiso(registrarHistoricos(await usuarioDePrueba(tx, { rol: "consulta" }), { indicadorId: ind.id, filas }, opc(tx)));
      await sinPermiso(registrarHistoricos(await usuarioDePrueba(tx, { rol: "gerencia" }), { indicadorId: ind.id, filas }, opc(tx)));
      // El Admin SGC registra aunque haya quien mida, y sin la marca de «sin medidor».
      expect(await registrarHistoricos(admin, { indicadorId: ind.id, filas }, opc(tx))).toEqual({ registrados: 1 });
      const [e] = await eventos(tx, t4h);
      expect([e.tipo, Number(e.usuario_id), e.detalle.sinMedidor]).toEqual(["historico", admin.usuarioId, undefined]);
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [ind.procesoId] });
      expect(await registrarHistoricos(lider, { indicadorId: ind.id, filas: [{ periodo: "2025-T3", valores: { A: "4", B: "5" } }] }, opc(tx))).toEqual({
        registrados: 1,
      });

      // Cerrado, ya no; un restringido no existe para quien no lo ve.
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id = ${await id("2025-T2")}`;
      await rechaza(
        registrarHistoricos(mide, { indicadorId: ind.id, filas: [{ periodo: "2025-T2", valores: { A: "5", B: "5" } }] }, opc(tx)),
        "La medición está cerrada: pida al Administrador del SGC que la reabra",
      );
      const restringido = await preparar(tx, { nivelAcceso: "restringido" });
      await rechaza(registrarHistoricos(mide, { indicadorId: restringido.ind.id, filas }, opc(tx)), "La medición no existe");
    }));
});
