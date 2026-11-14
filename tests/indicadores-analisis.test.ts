/**
 * El análisis y las observaciones de una medición (Fase 14A, Tarea 10; spec §6.4, §8.4, §8.5 y §8.6). Contra la BD de
 * desarrollo, dentro de una transacción que se revierte.
 *
 * `ind` es trimestral, de forma «porcentaje», meta 90 y umbral 70 (límite de crítico 63), con inicio en el tercer
 * trimestre de 2025 y aprobado el 15 de enero de 2026. Lo mide una persona de rol Consulta, lo analiza otra y lo sigue
 * una tercera.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { analizar, datosDeAnalisis } from "@/db/consultas/indicadores/analisis";
import { asegurarMediciones, marcarNoAplica, reportar } from "@/db/consultas/indicadores/mediciones";
import { observacionesDe, observar, responder, resumenDeObservaciones, sinRespuesta } from "@/db/consultas/indicadores/observaciones";
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
const CERRADA = "La medición está cerrada: pida al Administrador del SGC que la reabra";
const SIMPLE = "Escriba el análisis (al menos 10 caracteres)";
const DOS_PARTES = "En un resultado crítico escriba la causa de la desviación y la acción propuesta";

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

/** El indicador de la cabecera, con quien lo mide, quien lo analiza y quien lo sigue; `o` cambia lo que haga falta. */
async function preparar(tx: TransactionSql, o: OpcionesIndicadorDePrueba = {}) {
  const mide = await usuarioDePrueba(tx, { rol: "consulta" });
  const analiza = await usuarioDePrueba(tx, { rol: "consulta" });
  const sigue = await usuarioDePrueba(tx, { rol: "consulta" });
  const ind = await indicadorDePrueba(tx, {
    periodicidad: "trimestral",
    inicioMedicion: "2025-T3",
    aprobadaEn: APROBADA,
    mide: [mide.usuarioId],
    analiza: [analiza.usuarioId],
    seguimiento: [sigue.usuarioId],
    ...o,
  });
  await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: ind.id });
  const medicion = async (periodo: string) => {
    const [m] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = ${periodo}`;
    return Number(m.id);
  };
  return { ind, mide, analiza, sigue, medicion };
}

/** Reporta (no parcial) y da por confirmada la variación. */
const reportarCon = (tx: TransactionSql, sesion: SesionFlujo, medicionId: number, valores: Record<string, string>) =>
  reportar(sesion, { medicionId, valores, parcial: false, confirmado: true }, opc(tx));

const fila = async (tx: TransactionSql, medicionId: number) => (await tx`SELECT * FROM mediciones WHERE id = ${medicionId}`)[0];

const eventos = (tx: TransactionSql, medicionId: number) =>
  tx`SELECT tipo, usuario_id, detalle FROM medicion_eventos WHERE medicion_id = ${medicionId} ORDER BY id`;

const bitacora = (tx: TransactionSql, accion: string, medicionId: number) =>
  tx`SELECT usuario_id, detalle FROM auditoria WHERE accion = ${accion} AND entidad = 'medicion' AND entidad_id = ${medicionId} ORDER BY id`;

const avisos = (tx: TransactionSql, tipo: string, medicionId: number) =>
  tx`SELECT usuario_id, titulo, cuerpo, enlace FROM notificaciones WHERE tipo = ${tipo} AND entidad = 'medicion' AND entidad_id = ${medicionId} ORDER BY id`;

describe("analizar", () => {
  it("en «Atención» el análisis es obligatorio y deja la medición reportada", () =>
    revertida(sql, async (tx) => {
      const { ind, mide, analiza, medicion } = await preparar(tx);
      const t3 = await medicion("2026-T3");
      expect(await reportarCon(tx, mide, t3, { A: "4", B: "5" })).toEqual({ ok: true, estado: "abierta", semaforo: "atencion", cumple: false });
      await rechaza(analizar(analiza, { medicionId: t3, analisis: "123456789" }, opc(tx)), SIMPLE);
      await rechaza(analizar(analiza, { medicionId: t3, analisis: "   " }, opc(tx)), SIMPLE);
      await rechaza(analizar(analiza, { medicionId: t3 }, opc(tx)), SIMPLE);
      expect((await eventos(tx, t3)).map((e) => e.tipo)).toEqual(["reporte"]);

      await analizar(analiza, { medicionId: t3, analisis: "  Faltó una auditoría por la visita de la Secretaría  " }, opc(tx));
      const m = await fila(tx, t3);
      expect([m.estado, m.analisis, Number(m.analizada_por), m.analizada_en]).toEqual([
        "reportada",
        "Faltó una auditoría por la visita de la Secretaría",
        analiza.usuarioId,
        AHORA,
      ]);
      const lista = await eventos(tx, t3);
      expect(lista.map((e) => e.tipo)).toEqual(["reporte", "analisis"]);
      expect(Number(lista[1].usuario_id)).toBe(analiza.usuarioId);
      expect(lista[1].detalle).toMatchObject({
        antes: { analisis: null, causa: null, accionPropuesta: null, estado: "abierta" },
        despues: { analisis: "Faltó una auditoría por la visita de la Secretaría", causa: null, accionPropuesta: null, estado: "reportada" },
      });
      const [b] = await bitacora(tx, "medicion_analizada", t3);
      expect(Number(b.usuario_id)).toBe(analiza.usuarioId);
      expect(b.detalle).toMatchObject({ codigo: ind.codigo, periodo: "2026-T3", primera: true, despues: { analisis: "Faltó una auditoría por la visita de la Secretaría" } });
    }));

  it("en «Crítico» pide causa y acción propuesta", () =>
    revertida(sql, async (tx) => {
      const { mide, analiza, medicion } = await preparar(tx);
      const t3 = await medicion("2026-T3");
      expect(await reportarCon(tx, mide, t3, { A: "3", B: "5" })).toEqual({ ok: true, estado: "abierta", semaforo: "critico", cumple: false });
      await rechaza(analizar(analiza, { medicionId: t3, causa: "Dos auditores internos en incapacidad" }, opc(tx)), DOS_PARTES);
      // El análisis simple no basta, ni una parte de menos de 10 caracteres.
      await rechaza(analizar(analiza, { medicionId: t3, analisis: "Dos auditores internos en incapacidad" }, opc(tx)), DOS_PARTES);
      await rechaza(
        analizar(analiza, { medicionId: t3, causa: "Dos auditores internos en incapacidad", accionPropuesta: "Suplentes" }, opc(tx)),
        DOS_PARTES,
      );
      await analizar(
        analiza,
        { medicionId: t3, causa: "Dos auditores internos en incapacidad", accionPropuesta: "Formar dos auditores suplentes y reprogramar" },
        opc(tx),
      );
      const m = await fila(tx, t3);
      expect([m.estado, m.requiere_accion, m.semaforo, m.causa, m.accion_propuesta]).toEqual([
        "reportada",
        true,
        "critico",
        "Dos auditores internos en incapacidad",
        "Formar dos auditores suplentes y reprogramar",
      ]);
    }));

  it("con un incumplimiento repetido también pide las dos partes", () =>
    revertida(sql, async (tx) => {
      const { mide, analiza, medicion } = await preparar(tx);
      for (const periodo of ["2026-T1", "2026-T2", "2026-T3"]) await reportarCon(tx, mide, await medicion(periodo), { A: "4", B: "5" });
      const t3 = await medicion("2026-T3");
      expect([(await fila(tx, t3)).semaforo, (await fila(tx, t3)).incumplimiento_repetido]).toEqual(["atencion", true]);
      await rechaza(
        analizar(analiza, { medicionId: t3, analisis: "Faltó una auditoría por la visita de la Secretaría" }, opc(tx)),
        "Con un incumplimiento repetido escriba la causa de la desviación y la acción propuesta",
      );
    }));

  it("si cumple, el análisis es opcional y no cambia el estado", () =>
    revertida(sql, async (tx) => {
      const { mide, analiza, medicion } = await preparar(tx);
      const t3 = await medicion("2026-T3");
      expect(await reportarCon(tx, mide, t3, { A: "5", B: "5" })).toEqual({ ok: true, estado: "reportada", semaforo: "bien", cumple: true });
      // Opcional: sin mínimo de caracteres.
      await analizar(analiza, { medicionId: t3, analisis: "Cumplido" }, opc(tx));
      let m = await fila(tx, t3);
      expect([m.estado, m.analisis]).toEqual(["reportada", "Cumplido"]);
      expect((await eventos(tx, t3)).map((e) => e.tipo)).toEqual(["reporte", "analisis"]);
      // Vaciarlo también es una edición; un campo que no llega queda como estaba.
      await analizar(analiza, { medicionId: t3, analisis: "" }, opc(tx));
      m = await fila(tx, t3);
      expect([m.estado, m.analisis]).toEqual(["reportada", null]);
      expect((await eventos(tx, t3)).map((e) => e.tipo)).toEqual(["reporte", "analisis", "analisis"]);
      await analizar(analiza, { medicionId: t3, causa: "Se completó el programa a tiempo" }, opc(tx));
      await analizar(analiza, { medicionId: t3, accionPropuesta: "Mantener el calendario" }, opc(tx));
      m = await fila(tx, t3);
      expect([m.analisis, m.causa, m.accion_propuesta]).toEqual([null, "Se completó el programa a tiempo", "Mantener el calendario"]);
    }));

  it("sin datos o con «No aplica» no hay análisis que escribir", () =>
    revertida(sql, async (tx) => {
      const { mide, analiza, medicion } = await preparar(tx);
      const [t2, t3] = [await medicion("2026-T2"), await medicion("2026-T3")];
      await rechaza(analizar(analiza, { medicionId: t3, analisis: "Un análisis adelantado" }, opc(tx)), "Reporte los datos antes de escribir el análisis");
      // Guardado sin reportar tampoco tiene resultado.
      await reportar(mide, { medicionId: t3, valores: { A: "4", B: "5" }, parcial: true, confirmado: false }, opc(tx));
      await rechaza(analizar(analiza, { medicionId: t3, analisis: "Un análisis adelantado" }, opc(tx)), "Reporte los datos antes de escribir el análisis");
      await marcarNoAplica(mide, { medicionId: t2, motivo: "No hubo auditorías programadas" }, opc(tx));
      await rechaza(
        analizar(analiza, { medicionId: t2, analisis: "Un análisis que no hace falta" }, opc(tx)),
        "Una medición «No aplica» no lleva análisis: basta el motivo",
      );
    }));

  it("analiza el designado para analizar y el líder; quien solo mide, no", () =>
    revertida(sql, async (tx) => {
      const { ind, mide, analiza, sigue, medicion } = await preparar(tx);
      const t3 = await medicion("2026-T3");
      await reportarCon(tx, mide, t3, { A: "4", B: "5" });
      const texto = { medicionId: t3, analisis: "Faltó una auditoría por la visita de la Secretaría" };
      await sinPermiso(analizar(mide, texto, opc(tx)));
      await sinPermiso(analizar(sigue, texto, opc(tx)));
      await sinPermiso(analizar(await usuarioDePrueba(tx, { rol: "gerencia" }), texto, opc(tx)));
      // Con un designado para analizar, el Admin SGC no analiza.
      await sinPermiso(analizar(await sesionAdmin(tx), texto, opc(tx)));
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [ind.procesoId] });
      await analizar(lider, texto, opc(tx));
      await analizar(analiza, { ...texto, analisis: "Faltó una auditoría por la visita de la Secretaría de Salud" }, opc(tx));
      expect(Number((await fila(tx, t3)).analizada_por)).toBe(analiza.usuarioId);

      // Un restringido no existe para quien no lo ve.
      const restringido = await preparar(tx, { nivelAcceso: "restringido" });
      const r3 = await restringido.medicion("2026-T3");
      await rechaza(analizar(mide, { ...texto, medicionId: r3 }, opc(tx)), "La medición no existe");
      await rechaza(analizar(analiza, { ...texto, medicionId: 999_999_999 }, opc(tx)), "La medición no existe");
    }));

  it("editar el análisis antes del cierre deja antes y después", () =>
    revertida(sql, async (tx) => {
      const { ind, mide, analiza, medicion } = await preparar(tx);
      const t3 = await medicion("2026-T3");
      await reportarCon(tx, mide, t3, { A: "4", B: "5" });
      await analizar(analiza, { medicionId: t3, analisis: "Primera versión del análisis" }, opc(tx));
      const despues = new Date("2026-10-06T15:00:00Z");
      await analizar(analiza, { medicionId: t3, analisis: "Segunda versión del análisis" }, opc(tx, despues));
      const lista = await eventos(tx, t3);
      expect(lista.map((e) => e.tipo)).toEqual(["reporte", "analisis", "analisis"]);
      expect(lista[2].detalle).toMatchObject({
        antes: { analisis: "Primera versión del análisis", estado: "reportada" },
        despues: { analisis: "Segunda versión del análisis", estado: "reportada" },
      });
      expect((await fila(tx, t3)).analizada_en).toEqual(despues);
      const filas = await bitacora(tx, "medicion_analizada", t3);
      expect(filas).toHaveLength(2);
      expect(filas[1].detalle).toMatchObject({
        codigo: ind.codigo,
        primera: false,
        antes: { analisis: "Primera versión del análisis" },
        despues: { analisis: "Segunda versión del análisis" },
      });
      // Lo mismo otra vez no deja nada.
      await analizar(analiza, { medicionId: t3, analisis: "Segunda versión del análisis" }, opc(tx));
      expect(await eventos(tx, t3)).toHaveLength(3);
      expect(await bitacora(tx, "medicion_analizada", t3)).toHaveLength(2);
      // Cerrada, ya no.
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id = ${t3}`;
      await rechaza(analizar(analiza, { medicionId: t3, analisis: "Tercera versión del análisis" }, opc(tx)), CERRADA);
    }));

  it("datosDeAnalisis: lo que el formulario necesita, solo a quien puede analizar", () =>
    revertida(sql, async (tx) => {
      const { mide, analiza, medicion } = await preparar(tx);
      const [t2, t3] = [await medicion("2026-T2"), await medicion("2026-T3")];
      await reportarCon(tx, mide, t3, { A: "3", B: "5" });
      expect(await datosDeAnalisis(analiza, t3, opc(tx))).toEqual({
        medicionId: t3,
        periodo: "2026-T3",
        etiqueta: "Tercer trimestre de 2026",
        exigido: "dos_partes",
        semaforo: "critico",
        repetido: false,
        analisis: null,
        causa: null,
        accionPropuesta: null,
      });
      expect(await datosDeAnalisis(mide, t3, opc(tx))).toBeNull();
      // Sin datos no hay formulario.
      expect(await datosDeAnalisis(analiza, t2, opc(tx))).toBeNull();
    }));
});

describe("observaciones", () => {
  it("observan los tres roles y quien hace seguimiento; responde quien analiza", () =>
    revertida(sql, async (tx) => {
      const { ind, mide, analiza, sigue, medicion } = await preparar(tx);
      const t3 = await medicion("2026-T3");
      const admin = await sesionAdmin(tx);
      const gerencia = await usuarioDePrueba(tx, { rol: "gerencia" });
      const control = await usuarioDePrueba(tx, { rol: "control_interno" });
      const ids: number[] = [];
      for (const quien of [admin, gerencia, control, sigue]) ids.push((await observar(quien, { medicionId: t3, texto: "¿Por qué bajó el resultado?" }, opc(tx))).id);
      expect(ids.every((id) => id > 0)).toBe(true);
      await sinPermiso(observar(await usuarioDePrueba(tx, { rol: "consulta" }), { medicionId: t3, texto: "Una observación" }, opc(tx)));
      await sinPermiso(observar(mide, { medicionId: t3, texto: "Una observación" }, opc(tx)));
      await rechaza(observar(control, { medicionId: t3, texto: "   " }, opc(tx)), "Escriba la observación");
      await rechaza(observar(control, { medicionId: t3, texto: "x".repeat(2001) }, opc(tx)), "La observación no puede pasar de 2000 caracteres");
      expect((await observar(control, { medicionId: t3, texto: "x".repeat(2000) }, opc(tx))).id).toBeGreaterThan(0);

      // Cada observación avisa a quienes analizan; quien la escribió no recibe su propio aviso.
      const deAnalista = (await avisos(tx, "indicadores.observacion", t3)).filter((a) => Number(a.usuario_id) === analiza.usuarioId);
      expect(deAnalista).toHaveLength(5);
      expect(deAnalista[0]).toMatchObject({
        titulo: `Observación en ${ind.codigo}`,
        enlace: `/indicadores/${ind.codigo}?vista=observaciones&periodo=2026-T3`,
      });
      expect(deAnalista[0].cuerpo).toBe(`${admin.nombre} dejó una observación en ${ind.codigo}, tercer trimestre de 2026`);
      const [b] = await bitacora(tx, "medicion_observada", t3);
      expect(b.detalle).toMatchObject({ codigo: ind.codigo, periodo: "2026-T3", texto: "¿Por qué bajó el resultado?" });

      // Responde quien analiza; quien solo mide o hace seguimiento, no. La respuesta avisa a quien observó.
      const { id: observacionId } = await observar(control, { medicionId: t3, texto: "Falta el soporte de la auditoría de Farmacia" }, opc(tx));
      await sinPermiso(responder(mide, { observacionId, texto: "Ya lo adjunto" }, opc(tx)));
      await sinPermiso(responder(sigue, { observacionId, texto: "Ya lo adjunto" }, opc(tx)));
      await rechaza(responder(analiza, { observacionId, texto: "" }, opc(tx)), "Escriba la respuesta");
      const { id: respuestaId } = await responder(analiza, { observacionId, texto: "Se adjuntó el informe de Farmacia" }, opc(tx));
      const [r] = await tx`SELECT responde_a, usuario_id FROM medicion_observaciones WHERE id = ${respuestaId}`;
      expect([Number(r.responde_a), Number(r.usuario_id)]).toEqual([observacionId, analiza.usuarioId]);
      const respuestas = await avisos(tx, "indicadores.respuesta", t3);
      expect(respuestas.map((a) => Number(a.usuario_id))).toEqual([control.usuarioId]);
      expect(respuestas[0]).toMatchObject({ titulo: `Respuesta a su observación en ${ind.codigo}` });
      const [br] = await bitacora(tx, "medicion_observacion_respondida", t3);
      expect(br.detalle).toMatchObject({ codigo: ind.codigo, observacionId, texto: "Se adjuntó el informe de Farmacia" });
      // También el líder y el Admin SGC; una respuesta no se responde.
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [ind.procesoId] });
      await responder(lider, { observacionId, texto: "Revisado con el equipo" }, opc(tx));
      await responder(admin, { observacionId, texto: "Gracias" }, opc(tx));
      await rechaza(responder(analiza, { observacionId: respuestaId, texto: "Otra respuesta" }, opc(tx)), "La observación no existe");
      expect((await avisos(tx, "indicadores.respuesta", t3)).map((a) => Number(a.usuario_id))).toEqual([control.usuarioId, control.usuarioId, control.usuarioId]);
      // Quien observó y responde a lo suyo no se avisa a sí mismo.
      await responder(admin, { observacionId: ids[0], texto: "Lo reviso yo mismo" }, opc(tx));
      expect(await avisos(tx, "indicadores.respuesta", t3)).toHaveLength(3);
    }));

  it("quien observa y además analiza no recibe su propio aviso", () =>
    revertida(sql, async (tx) => {
      const gerencia = await usuarioDePrueba(tx, { rol: "gerencia" });
      const { analiza, medicion } = await preparar(tx);
      const t3 = await medicion("2026-T3");
      const [i] = await tx`SELECT indicador_id FROM mediciones WHERE id = ${t3}`;
      await tx`INSERT INTO indicador_designados (indicador_id, usuario_id, funcion, creado_por)
        VALUES (${i.indicador_id}, ${gerencia.usuarioId}, 'analiza', ${gerencia.usuarioId})`;
      await observar(gerencia, { medicionId: t3, texto: "¿Por qué bajó el resultado?" }, opc(tx));
      expect((await avisos(tx, "indicadores.observacion", t3)).map((a) => Number(a.usuario_id))).toEqual([analiza.usuarioId]);
    }));

  it("la respuesta no avisa a quien observó si ya no está activo o ya no ve las observaciones", () =>
    revertida(sql, async (tx) => {
      const { analiza, sigue, medicion } = await preparar(tx);
      const t3 = await medicion("2026-T3");
      const control = await usuarioDePrueba(tx, { rol: "control_interno" });
      const deControl = await observar(control, { medicionId: t3, texto: "Revise el denominador" }, opc(tx));
      const deSigue = await observar(sigue, { medicionId: t3, texto: "Falta el soporte" }, opc(tx));
      // Control Interno se desactiva; a quien seguía le quitan la designación (ya no ve las observaciones).
      await tx`UPDATE usuarios SET activo = false WHERE id = ${control.usuarioId}`;
      await tx`DELETE FROM indicador_designados WHERE usuario_id = ${sigue.usuarioId}`;
      await responder(analiza, { observacionId: deControl.id, texto: "Revisado: estaba bien" }, opc(tx));
      await responder(analiza, { observacionId: deSigue.id, texto: "Ya se adjuntó" }, opc(tx));
      expect(await avisos(tx, "indicadores.respuesta", t3)).toHaveLength(0);
    }));

  it("responder en un indicador restringido que la persona no ve: la observación no existe", () =>
    revertida(sql, async (tx) => {
      const restringido = await preparar(tx, { nivelAcceso: "restringido" });
      const r3 = await restringido.medicion("2026-T3");
      const { id } = await observar(await usuarioDePrueba(tx, { rol: "control_interno" }), { medicionId: r3, texto: "Revise el denominador" }, opc(tx));
      // Analiza otro indicador, pero este no lo ve.
      const otro = await preparar(tx);
      await rechaza(responder(otro.analiza, { observacionId: id, texto: "Una respuesta" }, opc(tx)), "La observación no existe");
      expect(await tx`SELECT id FROM medicion_observaciones WHERE responde_a = ${id}`).toHaveLength(0);
    }));

  it("una observación no se edita ni se borra, y se puede añadir a una medición cerrada", () =>
    revertida(sql, async (tx) => {
      const { analiza, sigue, medicion } = await preparar(tx);
      const t3 = await medicion("2026-T3");
      const { id } = await observar(sigue, { medicionId: t3, texto: "Una observación que queda" }, opc(tx));
      const codigo = async (consulta: (s: TransactionSql) => Promise<unknown>) =>
        tx.savepoint(consulta).then(
          () => null,
          (e: { code?: string }) => e.code,
        );
      expect(await codigo((s) => s`UPDATE medicion_observaciones SET texto = 'otra' WHERE id = ${id}`)).toBe("42501");
      expect(await codigo((s) => s`DELETE FROM medicion_observaciones WHERE id = ${id}`)).toBe("42501");
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id = ${t3}`;
      const despues = await observar(sigue, { medicionId: t3, texto: "Después del cierre" }, opc(tx));
      expect(despues.id).toBeGreaterThan(id);
      expect((await responder(analiza, { observacionId: despues.id, texto: "Respondida después del cierre" }, opc(tx))).id).toBeGreaterThan(0);
      expect((await fila(tx, t3)).estado).toBe("cerrada");
    }));

  it("las observaciones solo las ve quien ve soportes", () =>
    revertida(sql, async (tx) => {
      const { ind, analiza, sigue, mide, medicion } = await preparar(tx);
      const t3 = await medicion("2026-T3");
      const control = await usuarioDePrueba(tx, { rol: "control_interno" });
      const { id: observacionId } = await observar(control, { medicionId: t3, texto: "Revise el denominador" }, opc(tx));
      await responder(analiza, { observacionId, texto: "Revisado: estaba bien" }, opc(tx, new Date("2026-10-06T15:00:00Z")));
      await observar(sigue, { medicionId: t3, texto: "Sin respuesta todavía" }, opc(tx, new Date("2026-10-07T15:00:00Z")));

      const consulta = await usuarioDePrueba(tx, { rol: "consulta" });
      expect(await observacionesDe(consulta, t3, opc(tx))).toBeNull();
      expect(await resumenDeObservaciones(consulta, ind.id, opc(tx))).toBeNull();
      for (const quien of [mide, analiza, sigue, control, await sesionAdmin(tx), await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [ind.procesoId] })]) {
        expect(await observacionesDe(quien, t3, opc(tx))).not.toBeNull();
      }
      const lista = (await observacionesDe(mide, t3, opc(tx)))!;
      expect(lista.map((o) => [o.texto, o.autor, o.respuestas.map((r) => [r.texto, r.autor])])).toEqual([
        ["Revise el denominador", control.nombre, [["Revisado: estaba bien", analiza.nombre]]],
        ["Sin respuesta todavía", sigue.nombre, []],
      ]);
      expect(lista[0].creadoEn).toEqual(AHORA);
      expect(await resumenDeObservaciones(mide, ind.id, opc(tx))).toMatchObject({
        total: 2,
        sinRespuesta: 1,
        mediciones: expect.arrayContaining([{ medicionId: t3, periodo: "2026-T3", etiqueta: "Tercer trimestre de 2026", total: 2, sinRespuesta: 1 }]),
      });

      // Un restringido no existe para quien no lo ve: tampoco sus observaciones.
      const restringido = await preparar(tx, { nivelAcceso: "restringido" });
      const r3 = await restringido.medicion("2026-T3");
      await rechaza(observar(sigue, { medicionId: r3, texto: "Una observación" }, opc(tx)), "La medición no existe");
      expect(await observacionesDe(sigue, r3, opc(tx))).toBeNull();
      expect(await observacionesDe(mide, 999_999_999, opc(tx))).toBeNull();
    }));

  it("sinRespuesta cuenta las observaciones que nadie ha respondido", () =>
    revertida(sql, async (tx) => {
      const { analiza, sigue, medicion } = await preparar(tx);
      const [t2, t3] = [await medicion("2026-T2"), await medicion("2026-T3")];
      const antes = await sinRespuesta(tx, {});
      const hastaJunio = new Date("2026-07-01T04:59:59.999Z");
      const antesJunio = await sinRespuesta(tx, { hasta: hastaJunio });
      const uno = await observar(sigue, { medicionId: t2, texto: "Observación del segundo trimestre" }, opc(tx));
      await observar(sigue, { medicionId: t3, texto: "Observación del tercer trimestre" }, opc(tx));
      expect(await sinRespuesta(tx, {})).toBe(antes + 2);
      // Con `hasta`, solo las de mediciones cuyo periodo terminó entonces o antes.
      expect(await sinRespuesta(tx, { hasta: hastaJunio })).toBe(antesJunio + 1);
      await responder(analiza, { observacionId: uno.id, texto: "Respondida" }, opc(tx));
      expect(await sinRespuesta(tx, {})).toBe(antes + 1);
      expect(await sinRespuesta(tx, { hasta: hastaJunio })).toBe(antesJunio);
    }));
});
