/**
 * Las alertas de resultado (Fase 14A, Tarea 13; spec §10.3, F14-DC20 y F14-DC30): salen en la transacción del cálculo
 * (`alRecalcular`), cuando el resultado queda calculado, y deciden por el último estado alertado (`alerta_estado`). Contra
 * la BD de desarrollo, dentro de una transacción que se revierte.
 *
 * Los indicadores de prueba son de forma «porcentaje», meta 90 y umbral 70 (límite de crítico 63), de un proceso que solo
 * existe en la transacción, con un líder propio. Los Admin SGC de la base también reciben las críticas: se comparan con
 * `adminsActivos`.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { analizar } from "@/db/consultas/indicadores/analisis";
import { reabrirMedicion } from "@/db/consultas/indicadores/cierre";
import { registrarHistoricos } from "@/db/consultas/indicadores/historicos";
import { asegurarMediciones, marcarNoAplica, reportar } from "@/db/consultas/indicadores/mediciones";
import { adminsActivos } from "@/db/consultas/tramites";
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

/** El segundo trimestre de 2026 terminó el 30 de junio; su plazo vence el 10 de julio. */
const AHORA = new Date("2026-07-05T15:00:00Z");
const APROBADA = new Date("2026-03-15T15:00:00Z");
const T2 = "2026-T2";
const CAUSA = "El personal de turno no registró los casos";
const ACCION = "Capacitar al personal de turno en el registro";

const opc = (tx: TransactionSql, ahora = AHORA) => ({ sql: tx, ahora });

const reportarCon = (tx: TransactionSql, sesion: SesionFlujo, medicionId: number, valores: Record<string, string>, ahora = AHORA) =>
  reportar(sesion, { medicionId, valores, parcial: false, confirmado: true }, opc(tx, ahora));

type Aviso = { usuario_id: number; tipo: string; titulo: string; cuerpo: string; enlace: string };

/** Los avisos de alerta y de corrección de la medición, en orden de llegada. */
async function alertas(tx: TransactionSql, medicionId: number): Promise<Aviso[]> {
  const filas = await tx`SELECT usuario_id, tipo, titulo, cuerpo, enlace FROM notificaciones
    WHERE entidad = 'medicion' AND entidad_id = ${medicionId} AND tipo IN ('indicadores.alerta', 'indicadores.correccion')
    ORDER BY id`;
  return filas.map((f) => ({ ...(f as unknown as Aviso), usuario_id: Number(f.usuario_id) }));
}

const quienes = (avisos: Aviso[]) => [...new Set(avisos.map((a) => a.usuario_id))].sort((a, b) => a - b);
const ordenados = (ids: number[]) => [...new Set(ids)].sort((a, b) => a - b);

const alertaGuardada = async (tx: TransactionSql, medicionId: number) =>
  ((await tx`SELECT alerta_estado FROM mediciones WHERE id = ${medicionId}`)[0].alerta_estado as string | null) ?? null;

/** Un proceso que solo existe en la transacción: sus líderes son los que el test le asigne. */
async function procesoNuevo(tx: TransactionSql): Promise<{ id: number; nombre: string }> {
  const sigla = `Z${unico()}`;
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${`Proceso ${sigla}`}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id, nombre`;
  return { id: Number(p.id), nombre: p.nombre as string };
}

/**
 * Quien mide, quien analiza, quien hace seguimiento, el líder del proceso y un Admin SGC; `nuevo` crea un indicador
 * trimestral desde el segundo trimestre de 2026 con esas designaciones y devuelve la medición del periodo pedido.
 */
async function entorno(tx: TransactionSql) {
  await tx`UPDATE configuracion SET valor = '3' WHERE clave = 'ind_incumplimiento_periodos'`;
  const proceso = await procesoNuevo(tx);
  const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [proceso.id] });
  const mide = await usuarioDePrueba(tx, { rol: "consulta" });
  const analiza = await usuarioDePrueba(tx, { rol: "consulta" });
  const sigue = await usuarioDePrueba(tx, { rol: "gerencia" });
  const admin = await sesionAdmin(tx);
  const nuevo = async (o: OpcionesIndicadorDePrueba = {}, periodo = T2, ahora = AHORA) => {
    const ind = await indicadorDePrueba(tx, {
      procesoId: proceso.id,
      periodicidad: "trimestral",
      inicioMedicion: T2,
      aprobadaEn: APROBADA,
      mide: [mide.usuarioId],
      analiza: [analiza.usuarioId],
      seguimiento: [sigue.usuarioId],
      ...o,
    });
    await asegurarMediciones({ sql: tx, ahora, indicadorId: ind.id });
    const medicion = async (clave: string) => Number((await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = ${clave}`)[0].id);
    return { ind, nombre: `Indicador de prueba ${ind.codigo}`, medicionId: await medicion(periodo), medicion };
  };
  const criticos = async (sin: number[]) => ordenados([analiza.usuarioId, sigue.usuarioId, lider.usuarioId, ...(await adminsActivos({ sql: tx }))]).filter((u) => !sin.includes(u));
  return { proceso, lider, mide, analiza, sigue, admin, nuevo, criticos };
}

describe("alertas de resultado", () => {
  it("«Atención» avisa a quien analiza y a quien hace seguimiento, no a quien reportó", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const { ind, nombre, medicionId } = await e.nuevo();
      await reportarCon(tx, e.mide, medicionId, { A: "5", B: "6" });

      const avisos = await alertas(tx, medicionId);
      expect(quienes(avisos)).toEqual(ordenados([e.analiza.usuarioId, e.sigue.usuarioId]));
      expect(avisos[0]).toMatchObject({
        tipo: "indicadores.alerta",
        titulo: `${nombre}: 83,3 % frente a una meta de 90 %, Atención. Segundo trimestre de 2026`,
        cuerpo: `${ind.codigo} · ${e.proceso.nombre}`,
        enlace: `/indicadores/${ind.codigo}`,
      });
      expect(new Set(avisos.map((a) => a.titulo)).size).toBe(1);

      // Quien reporta y además analiza no se avisa a sí mismo.
      const otro = await e.nuevo({ analiza: [e.mide.usuarioId] });
      await reportarCon(tx, e.mide, otro.medicionId, { A: "5", B: "6" });
      expect(quienes(await alertas(tx, otro.medicionId))).toEqual([e.sigue.usuarioId]);
    }));

  it("«Crítico» avisa además a los líderes del proceso y a los Admin SGC", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const { nombre, medicionId } = await e.nuevo();
      await reportarCon(tx, e.mide, medicionId, { A: "1", B: "2" });

      const avisos = await alertas(tx, medicionId);
      expect(quienes(avisos)).toEqual(await e.criticos([e.mide.usuarioId]));
      expect(quienes(avisos)).toContain(e.admin.usuarioId);
      expect(avisos.every((a) => a.tipo === "indicadores.alerta" && a.titulo === `${nombre}: 50 % frente a una meta de 90 %, Crítico. Segundo trimestre de 2026`)).toBe(true);

      // Si reporta el líder (que mide lo de su proceso), el aviso no le llega a él.
      const otro = await e.nuevo();
      await reportarCon(tx, e.lider, otro.medicionId, { A: "1", B: "2" });
      expect(quienes(await alertas(tx, otro.medicionId))).toEqual(await e.criticos([e.lider.usuarioId]));
    }));

  it("«Bien», «sin meta», «no aplica» y los históricos no avisan", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const bien = await e.nuevo();
      await reportarCon(tx, e.mide, bien.medicionId, { A: "19", B: "20" });
      const sinMeta = await e.nuevo({ meta: null });
      await reportarCon(tx, e.mide, sinMeta.medicionId, { A: "1", B: "2" });
      const noAplica = await e.nuevo();
      await marcarNoAplica(e.mide, { medicionId: noAplica.medicionId, motivo: "No hubo casos en el trimestre" }, opc(tx));
      // Aprobado después de terminar el trimestre: el segundo trimestre es histórico.
      const historico = await e.nuevo({ aprobadaEn: new Date("2026-07-02T15:00:00Z") });
      await registrarHistoricos(e.mide, { indicadorId: historico.ind.id, filas: [{ periodo: T2, valores: { A: "1", B: "2" } }] }, opc(tx));
      const [h] = await tx`SELECT historica, semaforo FROM mediciones WHERE id = ${historico.medicionId}`;
      expect(h).toMatchObject({ historica: true, semaforo: "critico" });

      for (const x of [bien, sinMeta, noAplica, historico]) {
        expect(await alertas(tx, x.medicionId)).toEqual([]);
        expect(await alertaGuardada(tx, x.medicionId)).toBeNull();
      }
    }));

  it("una corrección que cambia el color avisa a los de antes y a los de ahora", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const { ind, nombre, medicionId } = await e.nuevo();
      await reportarCon(tx, e.mide, medicionId, { A: "1", B: "2" });
      const alerta = (await alertas(tx, medicionId)).length;

      // Sin cambio de color, nada.
      await reportarCon(tx, e.mide, medicionId, { A: "2", B: "5" });
      expect(await alertas(tx, medicionId)).toHaveLength(alerta);

      await reportarCon(tx, e.mide, medicionId, { A: "19", B: "20" });
      const correccion = (await alertas(tx, medicionId)).slice(alerta);
      expect(quienes(correccion)).toEqual(await e.criticos([e.mide.usuarioId]));
      expect(correccion[0]).toMatchObject({
        tipo: "indicadores.correccion",
        titulo: `Corrección: ${nombre} pasó de Crítico a Bien. Segundo trimestre de 2026`,
        cuerpo: `${ind.codigo} · Cumple: 95 % frente a una meta de 90 %.`,
        enlace: `/indicadores/${ind.codigo}`,
      });

      // De «Atención» a «Crítico»: los de «Atención» y los de «Crítico».
      const otro = await e.nuevo();
      await reportarCon(tx, e.mide, otro.medicionId, { A: "5", B: "6" });
      const antes = (await alertas(tx, otro.medicionId)).length;
      await reportarCon(tx, e.mide, otro.medicionId, { A: "1", B: "2" });
      const deOtro = (await alertas(tx, otro.medicionId)).slice(antes);
      expect(quienes(deOtro)).toEqual(await e.criticos([e.mide.usuarioId]));
      expect(deOtro[0].titulo).toBe(`Corrección: ${otro.nombre} pasó de Atención a Crítico. Segundo trimestre de 2026`);
    }));

  it("sin nada alertado antes, una corrección de Bien a Crítico es una alerta con la cifra; de Crítico a Bien, una corrección", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const { ind, nombre, medicionId } = await e.nuevo();
      await reportarCon(tx, e.mide, medicionId, { A: "19", B: "20" });
      expect(await alertas(tx, medicionId)).toEqual([]);

      await reportarCon(tx, e.mide, medicionId, { A: "1", B: "2" });
      const alerta = await alertas(tx, medicionId);
      expect(quienes(alerta)).toEqual(await e.criticos([e.mide.usuarioId]));
      expect(alerta.every((a) => a.tipo === "indicadores.alerta")).toBe(true);
      expect(alerta[0]).toMatchObject({
        titulo: `${nombre}: 50 % frente a una meta de 90 %, Crítico. Segundo trimestre de 2026`,
        cuerpo: `${ind.codigo} · ${e.proceso.nombre}`,
      });

      await reportarCon(tx, e.mide, medicionId, { A: "19", B: "20" });
      const correccion = (await alertas(tx, medicionId)).slice(alerta.length);
      expect(quienes(correccion)).toEqual(await e.criticos([e.mide.usuarioId]));
      const titulo = `Corrección: ${nombre} pasó de Crítico a Bien. Segundo trimestre de 2026`;
      expect(correccion.every((a) => a.tipo === "indicadores.correccion" && a.titulo === titulo)).toBe(true);
    }));

  it("«Guardar sin reportar» no alerta, aunque los datos estén completos", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const { medicionId } = await e.nuevo();
      const r = await reportar(e.mide, { medicionId, valores: { A: "1", B: "2" }, parcial: true, confirmado: true }, opc(tx));
      expect(r).toMatchObject({ ok: true });
      const [m] = await tx`SELECT reportada_en, semaforo, alerta_estado FROM mediciones WHERE id = ${medicionId}`;
      expect(m).toEqual({ reportada_en: null, semaforo: null, alerta_estado: null });
      expect(await alertas(tx, medicionId)).toEqual([]);
    }));

  it("«No aplica» después de una alerta es una corrección a los de antes", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const { nombre, medicionId } = await e.nuevo();
      await reportarCon(tx, e.mide, medicionId, { A: "5", B: "6" });
      const antes = (await alertas(tx, medicionId)).length;
      await marcarNoAplica(e.mide, { medicionId, motivo: "No hubo casos en el trimestre" }, opc(tx));
      const correccion = (await alertas(tx, medicionId)).slice(antes);
      expect(quienes(correccion)).toEqual(ordenados([e.analiza.usuarioId, e.sigue.usuarioId]));
      expect(correccion[0].titulo).toBe(`Corrección: ${nombre} pasó de Atención a No aplica. Segundo trimestre de 2026`);
      expect(await alertaGuardada(tx, medicionId)).toBeNull();
    }));

  it("el incumplimiento repetido se alerta como crítico aunque el color sea «Atención»", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const abril = new Date("2026-04-05T15:00:00Z");
      const { ind, medicion } = await e.nuevo(
        { periodicidad: "mensual", inicioMedicion: "2026-01", aprobadaEn: new Date("2025-12-15T15:00:00Z") },
        "2026-01",
        abril,
      );
      for (const mes of ["2026-01", "2026-02"]) {
        const id = await medicion(mes);
        await reportarCon(tx, e.mide, id, { A: "5", B: "6" }, abril);
        expect(quienes(await alertas(tx, id)), mes).toEqual(ordenados([e.analiza.usuarioId, e.sigue.usuarioId]));
      }
      const marzo = await medicion("2026-03");
      await reportarCon(tx, e.mide, marzo, { A: "5", B: "6" }, abril);

      const [m] = await tx`SELECT semaforo, incumplimiento_repetido FROM mediciones WHERE id = ${marzo}`;
      expect(m).toEqual({ semaforo: "atencion", incumplimiento_repetido: true });
      const avisos = await alertas(tx, marzo);
      expect(quienes(avisos)).toEqual(await e.criticos([e.mide.usuarioId]));
      expect(avisos[0].titulo).toBe(
        `Indicador de prueba ${ind.codigo}: 83,3 % frente a una meta de 90 %, Atención con 3 periodos sin cumplir. Marzo de 2026`,
      );
      expect(await alertaGuardada(tx, marzo)).toBe("critico");
    }));

  it("alerta_estado guarda el último estado alertado", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const { medicionId } = await e.nuevo();
      expect(await alertaGuardada(tx, medicionId)).toBeNull();
      await reportarCon(tx, e.mide, medicionId, { A: "5", B: "6" });
      expect(await alertaGuardada(tx, medicionId)).toBe("atencion");
      await reportarCon(tx, e.mide, medicionId, { A: "1", B: "2" });
      expect(await alertaGuardada(tx, medicionId)).toBe("critico");
      await reportarCon(tx, e.mide, medicionId, { A: "19", B: "20" });
      expect(await alertaGuardada(tx, medicionId)).toBeNull();
    }));

  it("reabrir una medición crítica ya alertada no vuelve a alertar", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const { medicionId } = await e.nuevo();
      await reportarCon(tx, e.mide, medicionId, { A: "1", B: "2" });
      await analizar(e.analiza, { medicionId, causa: CAUSA, accionPropuesta: ACCION }, opc(tx));
      const antes = await alertas(tx, medicionId);
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id = ${medicionId}`;

      await reabrirMedicion(e.admin, { medicionId, justificacion: "El dato de casos evaluados venía mal" }, opc(tx, new Date("2026-07-20T15:00:00Z")));
      const [m] = await tx`SELECT estado, semaforo FROM mediciones WHERE id = ${medicionId}`;
      expect(m).toEqual({ estado: "reportada", semaforo: "critico" });
      expect(await alertas(tx, medicionId)).toEqual(antes);
      expect(await alertaGuardada(tx, medicionId)).toBe("critico");
    }));
});

describe("alertas de un Bien que no cumple (spec 14A §3.1)", () => {
  const RANGOS = {
    bien: [{ signo: ">=" as const, valor: "91" }],
    atencion: [{ signo: "entre" as const, valor: "41", hasta: "90" }],
    critico: [{ signo: "<=" as const, valor: "40" }],
  };

  it("avisa a quien analiza y a quien hace seguimiento como un Atención, y no a los líderes", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const { ind, nombre, medicionId } = await e.nuevo({ rangos: RANGOS, meta: "100" });
      await reportarCon(tx, e.mide, medicionId, { A: "95", B: "100" });

      const [m] = await tx`SELECT semaforo, cumple, estado FROM mediciones WHERE id = ${medicionId}`;
      expect(m).toMatchObject({ semaforo: "bien", cumple: false, estado: "abierta" });
      const avisos = await alertas(tx, medicionId);
      expect(quienes(avisos)).toEqual(ordenados([e.analiza.usuarioId, e.sigue.usuarioId]));
      expect(avisos[0]).toMatchObject({
        tipo: "indicadores.alerta",
        titulo: `${nombre}: 95 % frente a una meta de 100 %, Bien, sin alcanzar la meta. Segundo trimestre de 2026`,
        cuerpo: `${ind.codigo} · ${e.proceso.nombre}`,
      });
      expect(await alertaGuardada(tx, medicionId)).toBe("atencion");

      // Corregido a un resultado que cumple: corrección a los mismos, y la medición queda reportada.
      await reportarCon(tx, e.mide, medicionId, { A: "105", B: "100" });
      const [c] = await tx`SELECT cumple, estado FROM mediciones WHERE id = ${medicionId}`;
      expect(c).toMatchObject({ cumple: true, estado: "reportada" });
      const despues = (await alertas(tx, medicionId)).slice(avisos.length);
      expect(despues[0].tipo).toBe("indicadores.correccion");
      expect(await alertaGuardada(tx, medicionId)).toBeNull();
    }));

  it("un Bien que cumple no avisa", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const { medicionId } = await e.nuevo({ rangos: RANGOS, meta: "100" });
      await reportarCon(tx, e.mide, medicionId, { A: "105", B: "100" });
      const [m] = await tx`SELECT semaforo, cumple, estado FROM mediciones WHERE id = ${medicionId}`;
      expect(m).toMatchObject({ semaforo: "bien", cumple: true, estado: "reportada" });
      expect(await alertas(tx, medicionId)).toEqual([]);
      expect(await alertaGuardada(tx, medicionId)).toBeNull();
    }));
});
