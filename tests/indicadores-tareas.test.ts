/**
 * «Mis tareas» de los indicadores (Fase 14A, Tarea 13; spec §10.1, F14-DC21 y F14-DC32): reportar, analizar, responder
 * una observación, aprobar una ficha y la ficha devuelta, con la insignia de las mediciones vencidas. Solo lee: no abre
 * periodos (los abre la pasada de vencimientos y las páginas del módulo). Contra la BD de desarrollo, dentro de una
 * transacción que se revierte.
 *
 * Cada caso usa personas y procesos nuevos: sus tareas son solo las de sus indicadores, aunque la base traiga otros. Los
 * indicadores de prueba son de forma «porcentaje», meta 90 y umbral 70 (límite de crítico 63).
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
import { devolverFicha, enviarAAprobacion } from "@/db/consultas/indicadores/aprobacion";
import { crearIndicador } from "@/db/consultas/indicadores/fichas";
import { asegurarMediciones, marcarNoAplica, reportar } from "@/db/consultas/indicadores/mediciones";
import { observar, responder } from "@/db/consultas/indicadores/observaciones";
import { retirar } from "@/db/consultas/indicadores/operacion";
import { tareasDeIndicadores } from "@/db/consultas/indicadores/tareas";
import { aprobadoresDeFicha, responsablesDeMedir } from "@/lib/alcance";
import type { DatosFicha } from "@/lib/esquemas/indicadores";
import { agruparTareas, misTareas, type Tarea } from "@/lib/tareas";
import { indicadorDePrueba, versionTrimestral, type OpcionesIndicadorDePrueba } from "./utiles/indicadores";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { firmaDePrueba } from "./utiles/vigencia";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

let consecutivo = 0;
const unico = () => `${Date.now() % 100_000_000}${(consecutivo += 1)}`;

/** El tercer trimestre de 2026 terminó el 30 de septiembre; su plazo vence el 10 de octubre. */
const AHORA = new Date("2026-10-05T15:00:00Z");
const APROBADA = new Date("2026-06-15T15:00:00Z");
const T3 = "2026-T3";
const VENCE_T3 = new Date("2026-10-11T04:59:59.999Z");
const CAUSA = "El personal de turno no registró los casos";
const ACCION = "Capacitar al personal de turno en el registro";

const opc = (tx: TransactionSql, ahora = AHORA) => ({ sql: tx, ahora });

const reportarCon = (tx: TransactionSql, sesion: SesionFlujo, medicionId: number, valores: Record<string, string>, ahora = AHORA) =>
  reportar(sesion, { medicionId, valores, parcial: false, confirmado: true }, opc(tx, ahora));

const ids = (tareas: Tarea[]) => tareas.map((t) => t.id);
const deIndicadores = async (tx: TransactionSql, sesion: SesionFlujo, ahora = AHORA) => tareasDeIndicadores(sesion, opc(tx, ahora));

/** Un proceso que solo existe en la transacción: sus líderes son los que el test le asigne. */
async function procesoNuevo(tx: TransactionSql): Promise<{ id: number; nombre: string }> {
  const sigla = `Z${unico()}`;
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${`Proceso ${sigla}`}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id, nombre`;
  return { id: Number(p.id), nombre: p.nombre as string };
}

/** Un indicador trimestral desde el tercer trimestre de 2026 del proceso, con sus periodos abiertos al 5 de octubre. */
async function indicador(tx: TransactionSql, procesoId: number, o: OpcionesIndicadorDePrueba = {}, ahora = AHORA) {
  const ind = await indicadorDePrueba(tx, { procesoId, periodicidad: "trimestral", inicioMedicion: T3, aprobadaEn: APROBADA, ...o });
  await asegurarMediciones({ sql: tx, ahora, indicadorId: ind.id });
  const medicion = async (periodo: string) =>
    Number((await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = ${periodo}`)[0].id);
  return { ind, nombre: `Indicador de prueba ${ind.codigo}`, medicion };
}

describe("tareas de medir y analizar", () => {
  it("quien mide tiene la tarea de reportar, con su fecha límite y su enlace", () =>
    revertida(sql, async (tx) => {
      const proceso = await procesoNuevo(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const analiza = await usuarioDePrueba(tx, { rol: "consulta" });
      const ajeno = await usuarioDePrueba(tx, { rol: "consulta" });
      const { ind, nombre, medicion } = await indicador(tx, proceso.id, { mide: [mide.usuarioId], analiza: [analiza.usuarioId] });
      const t3 = await medicion(T3);

      const r = await deIndicadores(tx, mide);
      expect(r).toEqual({
        tareas: [
          {
            id: `medir:${t3}`,
            modulo: "indicadores",
            titulo: `Reportar ${ind.codigo} ${nombre}, tercer trimestre de 2026`,
            detalle: proceso.nombre,
            vence: VENCE_T3,
            enlace: `/indicadores/${ind.codigo}/reportar/2026-T3`,
          },
        ],
        vencidas: 0,
      });
      // Sin datos, quien analiza no tiene nada que analizar; quien no participa, nada.
      expect(await deIndicadores(tx, analiza)).toEqual({ tareas: [], vencidas: 0 });
      expect(await deIndicadores(tx, ajeno)).toEqual({ tareas: [], vencidas: 0 });
      // Solo lee: un periodo que nadie abrió todavía no es tarea, y leer las tareas no lo abre.
      const sinAbrir = await indicadorDePrueba(tx, { procesoId: proceso.id, periodicidad: "trimestral", inicioMedicion: T3, aprobadaEn: APROBADA, mide: [mide.usuarioId] });
      expect(ids((await deIndicadores(tx, mide)).tareas)).toEqual([`medir:${t3}`]);
      expect(await tx`SELECT id FROM mediciones WHERE indicador_id = ${sinAbrir.id}`).toHaveLength(0);
      // Pasado el plazo, la tarea sigue y cuenta como vencida.
      expect((await deIndicadores(tx, mide, new Date("2026-10-12T15:00:00Z"))).vencidas).toBe(1);
    }));

  it("si el designado se desactiva, la tarea pasa al líder; sin líder, al Admin SGC con «Sin responsable: designe a alguien»", () =>
    revertida(sql, async (tx) => {
      const proceso = await procesoNuevo(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [proceso.id] });
      const admin = await sesionAdmin(tx);
      const { ind, medicion } = await indicador(tx, proceso.id, { mide: [mide.usuarioId] });
      const id = `medir:${await medicion(T3)}`;
      const tiene = async (s: SesionFlujo) => (await deIndicadores(tx, s)).tareas.find((t) => t.id === id) ?? null;
      const responsables = () => responsablesDeMedir(ind.id, { sql: tx });

      expect(await tiene(mide)).not.toBeNull();
      expect(await tiene(lider)).toBeNull();
      expect(await tiene(admin)).toBeNull();
      expect(await responsables()).toEqual([mide.usuarioId]);

      await tx`UPDATE usuarios SET activo = false WHERE id = ${mide.usuarioId}`;
      expect(await tiene(lider)).toMatchObject({ detalle: proceso.nombre });
      expect(await tiene(admin)).toBeNull();
      expect(await responsables()).toEqual([lider.usuarioId]);

      await tx`UPDATE usuarios SET activo = false WHERE id = ${lider.usuarioId}`;
      expect(await tiene(admin)).toMatchObject({ detalle: "Sin responsable: designe a alguien" });
      expect(await responsables()).toContain(admin.usuarioId);

      // Al designar a alguien, el Admin SGC deja de tenerla.
      const nueva = await usuarioDePrueba(tx, { rol: "consulta" });
      await tx`INSERT INTO indicador_designados (indicador_id, usuario_id, funcion, creado_por)
        VALUES (${ind.id}, ${nueva.usuarioId}, 'mide', ${admin.usuarioId})`;
      expect(await tiene(admin)).toBeNull();
      expect(await tiene(nueva)).toMatchObject({ detalle: proceso.nombre });
    }));

  it("quien analiza tiene la tarea cuando el resultado no cumple y falta el análisis", () =>
    revertida(sql, async (tx) => {
      const proceso = await procesoNuevo(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const analiza = await usuarioDePrueba(tx, { rol: "consulta" });
      const { ind, nombre, medicion } = await indicador(tx, proceso.id, { mide: [mide.usuarioId], analiza: [analiza.usuarioId] });
      const t3 = await medicion(T3);
      await reportarCon(tx, mide, t3, { A: "1", B: "2" });

      expect(await deIndicadores(tx, mide)).toEqual({ tareas: [], vencidas: 0 });
      expect((await deIndicadores(tx, analiza)).tareas).toEqual([
        {
          id: `analizar:${t3}`,
          modulo: "indicadores",
          titulo: `Analizar ${ind.codigo} ${nombre}, tercer trimestre de 2026`,
          detalle: proceso.nombre,
          vence: VENCE_T3,
          enlace: `/indicadores/${ind.codigo}/reportar/2026-T3`,
        },
      ]);
      await analizar(analiza, { medicionId: t3, causa: CAUSA, accionPropuesta: ACCION }, opc(tx));
      expect(await deIndicadores(tx, analiza)).toEqual({ tareas: [], vencidas: 0 });

      // Un resultado que cumple no pide análisis.
      const otro = await indicador(tx, proceso.id, { mide: [mide.usuarioId], analiza: [analiza.usuarioId] });
      await reportarCon(tx, mide, await otro.medicion(T3), { A: "19", B: "20" });
      expect(await deIndicadores(tx, analiza)).toEqual({ tareas: [], vencidas: 0 });
    }));

  it("no generan tarea los históricos, los «no aplica», las mediciones cerradas ni los indicadores retirados", () =>
    revertida(sql, async (tx) => {
      const proceso = await procesoNuevo(tx);
      const admin = await sesionAdmin(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const con = { mide: [mide.usuarioId] };
      // Aprobado después de terminar el trimestre: el tercer trimestre es histórico.
      await indicador(tx, proceso.id, { ...con, aprobadaEn: new Date("2026-10-02T15:00:00Z") });
      const noAplica = await indicador(tx, proceso.id, con);
      await marcarNoAplica(mide, { medicionId: await noAplica.medicion(T3), motivo: "No hubo casos en el trimestre" }, opc(tx));
      const cerrada = await indicador(tx, proceso.id, con);
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id = ${await cerrada.medicion(T3)}`;
      const retirado = await indicador(tx, proceso.id, con);
      await retirar(admin, { indicadorId: retirado.ind.id, motivo: "Ya no se mide" }, opc(tx));
      // Un mes que quedó abierto dentro del trimestre de un cambio mayor de periodicidad no se mide (Ruling de la T9).
      const mensual = await indicadorDePrueba(tx, { procesoId: proceso.id, periodicidad: "mensual", inicioMedicion: "2026-09", aprobadaEn: APROBADA, ...con });
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: mensual.id });
      await versionTrimestral(tx, { indicadorId: mensual.id, usuarioId: admin.usuarioId, rigeDesde: "2026-T3", aprobadaEn: new Date("2026-06-20T15:00:00Z") });
      expect(await tx`SELECT periodo FROM mediciones WHERE indicador_id = ${mensual.id}`).toHaveLength(1);

      expect(await deIndicadores(tx, mide)).toEqual({ tareas: [], vencidas: 0 });
      expect(await deIndicadores(tx, mide, new Date("2026-12-01T15:00:00Z"))).toEqual({ tareas: [], vencidas: 0 });
    }));

  it("una reabierta sin datos y vencida es «Reportar», vencida; una reabierta que queda reportada no es tarea", () =>
    revertida(sql, async (tx) => {
      const proceso = await procesoNuevo(tx);
      const admin = await sesionAdmin(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const analiza = await usuarioDePrueba(tx, { rol: "consulta" });
      const con = { mide: [mide.usuarioId], analiza: [analiza.usuarioId] };
      const tarde = new Date("2026-10-20T15:00:00Z");
      const justificacion = "Llegó el informe que faltaba del trimestre";
      // Cerrada sin dato y reabierta después del plazo (spec §8.7): vuelve abierta y vencida.
      const sinDato = await indicador(tx, proceso.id, con);
      const a = await sinDato.medicion(T3);
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id = ${a}`;
      await reabrirMedicion(admin, { medicionId: a, justificacion }, opc(tx, tarde));
      // Cerrada con su resultado: reabierta, vuelve reportada (ya avisó a quien mide con `indicadores.reabierta`).
      const conDato = await indicador(tx, proceso.id, con);
      const b = await conDato.medicion(T3);
      await reportarCon(tx, mide, b, { A: "19", B: "20" });
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id = ${b}`;
      await reabrirMedicion(admin, { medicionId: b, justificacion }, opc(tx, tarde));
      expect((await tx`SELECT estado FROM mediciones WHERE id = ${b}`)[0].estado).toBe("reportada");

      const r = await deIndicadores(tx, mide, tarde);
      expect(r.tareas).toMatchObject([{ id: `medir:${a}`, vence: VENCE_T3 }]);
      expect(r.vencidas).toBe(1);
      expect(await deIndicadores(tx, analiza, tarde)).toEqual({ tareas: [], vencidas: 0 });
    }));

  it("con el análisis y el soporte obligatorio pendientes, quien analiza tiene «Analizar» y quien mide «Reportar»", () =>
    revertida(sql, async (tx) => {
      const proceso = await procesoNuevo(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const analiza = await usuarioDePrueba(tx, { rol: "consulta" });
      const { ind, medicion } = await indicador(tx, proceso.id, { mide: [mide.usuarioId], analiza: [analiza.usuarioId] });
      const t3 = await medicion(T3);
      await reportarCon(tx, mide, t3, { A: "1", B: "2" });
      // El soporte se volvió obligatorio después del reporte (dato de operación): falta además del análisis.
      await tx`UPDATE indicadores SET soporte_obligatorio = true WHERE id = ${ind.id}`;
      expect(ids((await deIndicadores(tx, analiza)).tareas)).toEqual([`analizar:${t3}`]);
      expect((await deIndicadores(tx, mide)).tareas).toMatchObject([{ id: `medir:${t3}`, detalle: "Falta el soporte obligatorio" }]);

      // Quien mide y analiza tiene las dos tareas, y la insignia cuenta la medición una vez.
      const persona = await usuarioDePrueba(tx, { rol: "consulta" });
      const ambas = await indicador(tx, proceso.id, { mide: [persona.usuarioId], analiza: [persona.usuarioId] });
      const otra = await ambas.medicion(T3);
      await reportarCon(tx, persona, otra, { A: "1", B: "2" });
      await tx`UPDATE indicadores SET soporte_obligatorio = true WHERE id = ${ambas.ind.id}`;
      const r = await deIndicadores(tx, persona, new Date("2026-10-12T15:00:00Z"));
      expect(ids(r.tareas).sort()).toEqual([`analizar:${otra}`, `medir:${otra}`]);
      expect(r.vencidas).toBe(1);
    }));

  it("vencidasIndicadores cuenta las mediciones vencidas a cargo de la persona", () =>
    revertida(sql, async (tx) => {
      const proceso = await procesoNuevo(tx);
      const persona = await usuarioDePrueba(tx, { rol: "consulta" });
      const otra = await usuarioDePrueba(tx, { rol: "consulta" });
      // Por reportar, vencida.
      await indicador(tx, proceso.id, { mide: [persona.usuarioId] });
      // Por analizar, vencida: la reportó otra persona.
      const porAnalizar = await indicador(tx, proceso.id, { mide: [otra.usuarioId], analiza: [persona.usuarioId] });
      await reportarCon(tx, otra, await porAnalizar.medicion(T3), { A: "1", B: "2" });
      // Por reportar, todavía en plazo.
      const enPlazo = await indicadorDePrueba(tx, { procesoId: proceso.id, periodicidad: "trimestral", inicioMedicion: T3, aprobadaEn: APROBADA, mide: [persona.usuarioId] });
      await tx`UPDATE indicadores SET plazo_reporte_dias = 30 WHERE id = ${enPlazo.id}`;
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: enPlazo.id });
      // Vencida, pero de otra persona.
      await indicador(tx, proceso.id, { mide: [otra.usuarioId] });

      const despues = new Date("2026-10-12T15:00:00Z");
      const r = await deIndicadores(tx, persona, despues);
      expect(r.tareas).toHaveLength(3);
      expect(r.vencidas).toBe(2);
      expect((await misTareas(persona, opc(tx, despues))).vencidasIndicadores).toBe(2);
      expect((await misTareas(persona, opc(tx, AHORA))).vencidasIndicadores).toBe(0);
    }));
});

describe("tareas de observaciones y de fichas", () => {
  it("una observación sin respuesta es tarea de quien analiza; una ficha por aprobar, de quien puede aprobarla; una devuelta, de quien la elaboró", () =>
    revertida(sql, async (tx) => {
      const proceso = await procesoNuevo(tx);
      const admin = await sesionAdmin(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const analiza = await usuarioDePrueba(tx, { rol: "consulta" });
      const { ind, medicion } = await indicador(tx, proceso.id, {
        mide: [mide.usuarioId],
        analiza: [analiza.usuarioId],
        seguimiento: [analiza.usuarioId],
      });
      const t3 = await medicion(T3);
      await reportarCon(tx, mide, t3, { A: "19", B: "20" });

      const { id: observacionId } = await observar(admin, { medicionId: t3, texto: "¿De qué informe salen los casos evaluados?" }, opc(tx));
      expect((await deIndicadores(tx, analiza)).tareas).toEqual([
        {
          id: `observacion:${observacionId}`,
          modulo: "indicadores",
          titulo: `Responder la observación de ${admin.nombre} en ${ind.codigo}`,
          detalle: "Tercer trimestre de 2026",
          vence: null,
          enlace: `/indicadores/${ind.codigo}?vista=observaciones&periodo=2026-T3`,
        },
      ]);
      await responder(analiza, { observacionId, texto: "Del informe mensual de urgencias" }, opc(tx));
      expect(await deIndicadores(tx, analiza)).toEqual({ tareas: [], vencidas: 0 });
      // Quien analiza y también hace seguimiento no tiene por tarea responder su propia observación.
      await observar(analiza, { medicionId: t3, texto: "Queda pendiente revisar el informe de octubre" }, opc(tx));
      expect(await deIndicadores(tx, analiza)).toEqual({ tareas: [], vencidas: 0 });

      // Una ficha operativa por aprobar: la aprueba el líder del proceso, no Gerencia.
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [proceso.id] });
      const gerente = await usuarioDePrueba(tx, { rol: "gerencia" });
      const otroAdmin = await sesionAdmin(tx);
      const nueva = await crearIndicador(admin, await datosFicha(tx, proceso.id), { sql: tx });
      await enviarAAprobacion(admin, { versionId: nueva.versionId, credenciales: { clave: "ok" } }, { ...opc(tx), verificar: firmaDePrueba });
      expect(await aprobadoresDeFicha(nueva.versionId, { sql: tx })).toEqual([lider.usuarioId]);
      expect((await deIndicadores(tx, lider)).tareas).toEqual([
        {
          id: `ficha:${nueva.versionId}`,
          modulo: "indicadores",
          titulo: `Aprobar la ficha de ${nueva.codigo}`,
          detalle: "Cumplimiento del plan de capacitación",
          vence: null,
          enlace: `/indicadores/${nueva.codigo}?vista=ficha&version=1`,
        },
      ]);
      expect(ids((await deIndicadores(tx, gerente)).tareas)).not.toContain(`ficha:${nueva.versionId}`);

      // Sin líder disponible, la aprueba Gerencia (F14-DC19).
      await tx`UPDATE usuarios SET activo = false WHERE id = ${lider.usuarioId}`;
      expect(ids((await deIndicadores(tx, gerente)).tareas)).toContain(`ficha:${nueva.versionId}`);
      await tx`UPDATE usuarios SET activo = true WHERE id = ${lider.usuarioId}`;

      await devolverFicha(lider, { versionId: nueva.versionId, nota: "Falta la fuente de los datos" }, opc(tx));
      expect(await deIndicadores(tx, lider)).toEqual({ tareas: [], vencidas: 0 });
      expect((await deIndicadores(tx, admin)).tareas).toEqual([
        {
          id: `ficha-devuelta:${nueva.versionId}`,
          modulo: "indicadores",
          titulo: `Ficha devuelta: ${nueva.codigo}`,
          detalle: "Cumplimiento del plan de capacitación",
          vence: null,
          enlace: `/indicadores/${nueva.codigo}/editar`,
        },
      ]);
      expect(ids((await deIndicadores(tx, otroAdmin)).tareas)).not.toContain(`ficha-devuelta:${nueva.versionId}`);

      // Enviada otra vez, deja de estar devuelta.
      await enviarAAprobacion(admin, { versionId: nueva.versionId, credenciales: { clave: "ok" } }, { ...opc(tx), verificar: firmaDePrueba });
      expect(ids((await deIndicadores(tx, admin)).tareas)).not.toContain(`ficha-devuelta:${nueva.versionId}`);
      expect(ids((await deIndicadores(tx, lider)).tareas)).toContain(`ficha:${nueva.versionId}`);
    }));
});

describe("agrupación", () => {
  it("más de cinco se agrupan, contando solo las de la persona", () =>
    revertida(sql, async (tx) => {
      const proceso = await procesoNuevo(tx);
      const persona = await usuarioDePrueba(tx, { rol: "consulta" });
      const ahora = new Date("2026-10-12T15:00:00Z");
      // Seis mensuales con septiembre por reportar: dos vencieron el 10 de octubre y cuatro vencen el 30.
      for (let n = 0; n < 6; n++) {
        const ind = await indicadorDePrueba(tx, { procesoId: proceso.id, inicioMedicion: "2026-09", aprobadaEn: APROBADA, mide: [persona.usuarioId] });
        if (n >= 2) await tx`UPDATE indicadores SET plazo_reporte_dias = 30 WHERE id = ${ind.id}`;
        await asegurarMediciones({ sql: tx, ahora, indicadorId: ind.id });
      }
      // Las de un restringido ajeno no se cuentan ni se nombran.
      const ajeno = await procesoNuevo(tx);
      const otra = await usuarioDePrueba(tx, { rol: "consulta" });
      for (let n = 0; n < 3; n++) {
        const ind = await indicadorDePrueba(tx, { procesoId: ajeno.id, nivelAcceso: "restringido", inicioMedicion: "2026-09", aprobadaEn: APROBADA, mide: [otra.usuarioId] });
        await asegurarMediciones({ sql: tx, ahora, indicadorId: ind.id });
      }

      const r = await misTareas(persona, opc(tx, ahora));
      expect(r.tareas).toEqual([
        {
          id: "indicadores-por-reportar",
          modulo: "indicadores",
          titulo: "6 indicadores por reportar, 2 vencidos",
          detalle: "El más atrasado venció el 10 de octubre de 2026",
          vence: new Date("2026-10-11T04:59:59.999Z"),
          enlace: "/indicadores?reporte=por-reportar&participo=1",
        },
      ]);
      expect(r.total).toBe(6);
      expect(r.vencidasIndicadores).toBe(2);
    }));

  const base = { modulo: "indicadores" as const, detalle: null, enlace: "/x" };
  const varias = (prefijo: string, cuantas: number, vence: Date | null = null) =>
    Array.from({ length: cuantas }, (_, i) => ({ ...base, id: `${prefijo}:${i + 1}`, titulo: `${prefijo} ${i + 1}`, vence }));
  const AHORA_G = new Date("2026-10-05T15:00:00Z");

  it("los indicadores por analizar y las fichas por aprobar también se agrupan; cinco no", () => {
    const vencida = new Date("2026-10-01T04:59:59.999Z");
    expect(agruparTareas(varias("analizar", 7, vencida), 5, AHORA_G)).toEqual([
      {
        id: "indicadores-por-analizar",
        modulo: "indicadores",
        titulo: "7 indicadores por analizar, 7 vencidos",
        detalle: "El más atrasado venció el 30 de septiembre de 2026",
        vence: vencida,
        enlace: "/indicadores?reporte=falta-analisis&participo=1",
      },
    ]);
    expect(agruparTareas(varias("ficha", 6), 5, AHORA_G)).toEqual([
      { id: "fichas-por-aprobar", modulo: "indicadores", titulo: "6 fichas por aprobar", detalle: null, vence: null, enlace: "/indicadores/por-aprobar" },
    ]);
    // «ficha-devuelta:» no es «ficha:».
    expect(agruparTareas(varias("ficha-devuelta", 6), 5, AHORA_G)).toHaveLength(6);
    expect(agruparTareas(varias("medir", 5), 5, AHORA_G)).toHaveLength(5);
    const unaVencida = [...varias("medir", 5, new Date("2026-10-20T04:59:59.999Z")), { ...varias("medir", 1, vencida)[0], id: "medir:9" }];
    expect(agruparTareas(unaVencida, 5, AHORA_G)[0].titulo).toBe("6 indicadores por reportar, 1 vencido");
    expect(agruparTareas(varias("medir", 6, new Date("2026-10-20T04:59:59.999Z")), 5, AHORA_G)[0]).toMatchObject({
      titulo: "6 indicadores por reportar",
      detalle: "El más próximo vence el 19 de octubre de 2026",
    });
  });
});

/** Una ficha operativa del proceso, trimestral desde 2026-T4, ya probada con valores de ejemplo. */
/** Los rangos de la ficha de prueba (meta 90, ascendente): lo que antes era «relativo» con umbral 70 %. */
const RANGOS_90 = JSON.stringify({ bien: [{ signo: ">=", valor: "90" }], atencion: [{ signo: ">=", valor: "63" }], critico: [{ signo: "<", valor: "63" }] });

async function datosFicha(tx: TransactionSql, procesoId: number): Promise<DatosFicha> {
  const [t] = await tx`SELECT id FROM tipos_indicador WHERE nombre = 'Eficacia'`;
  const [op] = await tx`SELECT id FROM clasificaciones_indicador WHERE nombre = 'Operativo'`;
  const [u] = await tx`SELECT id FROM unidades_indicador WHERE nombre = 'Porcentaje'`;
  const [area] = await tx`SELECT id FROM areas ORDER BY id LIMIT 1`;
  const [c] = await tx`INSERT INTO cargos (nombre, area_id) VALUES (${`ZZ Cargo ${unico()}`}, ${area.id}) RETURNING id`;
  return {
    procesoId,
    nombre: "Cumplimiento del plan de capacitación",
    proposito: "Saber si se ejecutan las capacitaciones programadas",
    tipoId: Number(t.id),
    clasificacionId: Number(op.id),
    forma: "porcentaje",
    variables: [
      { letra: "A", nombre: "Capacitaciones ejecutadas", consolidacion: "suma", admiteNegativos: false },
      { letra: "B", nombre: "Capacitaciones programadas", consolidacion: "suma", admiteNegativos: false },
    ],
    unidadId: Number(u.id),
    decimales: 1,
    periodicidad: "trimestral",
    tendencia: "ascendente",
    meta: "90",
    semaforoModo: "rangos",
    rangos: RANGOS_90,
    cargosMedir: [Number(c.id)],
    cargosAnalizar: [Number(c.id)],
    normaIds: [],
    plazoReporteDias: 10,
    inicioMedicion: "2026-T4",
    soporteObligatorio: false,
    nivelAcceso: "general",
    mide: [],
    analiza: [],
    prueba: { valores: { A: "9", B: "10" } },
  };
}
