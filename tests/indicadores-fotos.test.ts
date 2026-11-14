/**
 * La foto de cada periodo de un indicador automático y «Volver a calcular» (Fase 14B, Tarea 7; anexo 14B, §5.4). Contra la
 * BD de desarrollo, dentro de una transacción que se revierte.
 *
 * La foto recorre todo el sistema: los casos viven en 2003, antes de todo inicio de medición de la base. Los indicadores de
 * prueba son mensuales, de forma «porcentaje» (meta 90, umbral 70: crítico por debajo de 63), con inicio en marzo de 2003,
 * aprobados el 15 de diciembre de 2002 y con el plazo de 10 días: marzo vence el 10 de abril. Cada uno en su proceso nuevo,
 * para que el índice de «una ficha activa por cálculo y alcance» no choque. Los cálculos reales los prueba la Tarea 6
 * (`indicadores-calculos-bd.test.ts`): aquí `tomarCalculo` se simula por caso (`simulado.de`); sin simulación, es el real.
 */
import { existsSync } from "node:fs";
import ExcelJS from "exceljs";
import type { TransactionSql } from "postgres";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const simulado = vi.hoisted(() => ({
  de: null as null | ((p: { clave: string; indicadorId: number; periodo: { clave: string } }) => { A: string; B?: string } | undefined),
}));
vi.mock("@/db/consultas/indicadores/calculos", async (original) => {
  const real = await original<typeof import("@/db/consultas/indicadores/calculos")>();
  return {
    ...real,
    tomarCalculo: vi.fn(async (...args: Parameters<typeof real.tomarCalculo>) => simulado.de?.(args[1]) ?? real.tomarCalculo(...args)),
  };
});

import { obtenerSql } from "@/db/cliente";
import { tomarCalculo } from "@/db/consultas/indicadores/calculos";
import { cerrarMes, reabrirMedicion, resumenDeCierre } from "@/db/consultas/indicadores/cierre";
import { tomarFotos, volverACalcular } from "@/db/consultas/indicadores/fotos";
import { impresionDelAnio } from "@/db/consultas/indicadores/impresion";
import { medicionParaReportar, tablaDelAnio } from "@/db/consultas/indicadores/lectura";
import { matrizDelAnio } from "@/db/consultas/indicadores/matriz";
import { asegurarMediciones, reportar } from "@/db/consultas/indicadores/mediciones";
import { cambiarOperacion } from "@/db/consultas/indicadores/operacion";
import { tareasDeIndicadores } from "@/db/consultas/indicadores/tareas";
import { describirEvento } from "@/lib/bitacora-detalle";
import type { AlcanceDeCalculo, ClaveDeCalculo } from "@/lib/indicadores/calculos/registro";
import { construirExcelDeIndicador } from "@/lib/indicadores/excel";
import { cuandoSeCalcula, esElUltimoTerminado, textoDeEspera, textoDeFoto } from "@/lib/indicadores/fotos";
import { historialDeCorreccion, type EventoDeMedicion } from "@/lib/indicadores/historial";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { ErrorPermiso } from "@/lib/permisos";
import { fechaLimite } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { indicadorDePrueba, versionAutomatica, type OpcionesIndicadorDePrueba } from "./utiles/indicadores";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
const ZONA = zonaHoraria();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

beforeEach(() => {
  simulado.de = null;
  vi.mocked(tomarCalculo).mockClear();
});

let consecutivo = 0;
const unico = () => `${Date.now() % 100_000_000}${(consecutivo += 1)}`;

const APROBADA = new Date("2002-12-15T15:00:00Z");
const MARZO = "2003-03";
/** Las 10 de la mañana del día dado de abril de 2003, en Bogotá. */
const abril = (d: number) => new Date(`2003-04-${String(d).padStart(2, "0")}T15:00:00Z`);
/** El plazo de marzo: fin del 10 de abril de 2003 en la zona. */
const VENCE_MARZO = fechaLimite(new Date("2003-03-31T17:00:00Z"), 10, ZONA);

async function procesoNuevo(tx: TransactionSql): Promise<{ id: number; nombre: string }> {
  const sigla = `Z${unico()}`;
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${`Proceso ${sigla}`}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id, nombre`;
  return { id: Number(p.id), nombre: p.nombre as string };
}

/**
 * Un automático de `clave` con alcance «proceso», en un proceso nuevo, con sus periodos abiertos a `abrirA`. `medicion`
 * devuelve el id de la medición del periodo (marzo, por omisión).
 */
async function automatico(
  tx: TransactionSql,
  clave: ClaveDeCalculo,
  o: OpcionesIndicadorDePrueba & { alcance?: AlcanceDeCalculo; abrirA?: Date } = {},
) {
  const { alcance, abrirA, ...resto } = o;
  const proceso = o.procesoId !== undefined ? { id: o.procesoId } : await procesoNuevo(tx);
  const ind = await indicadorDePrueba(tx, {
    procesoId: proceso.id,
    inicioMedicion: MARZO,
    aprobadaEn: APROBADA,
    ...resto,
    calculo: { clave, alcance: alcance ?? "proceso" },
  });
  await asegurarMediciones({ sql: tx, ahora: abrirA ?? abril(2), indicadorId: ind.id });
  const medicion = async (periodo = MARZO) => Number((await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = ${periodo}`)[0].id);
  return { ind, procesoId: proceso.id, medicion };
}

/** Simula `tomarCalculo` para una ficha: los valores de cada periodo, o `undefined` para el cálculo real. */
function simular(indicadorId: number, valores: { A: string; B?: string } | ((periodo: string) => { A: string; B?: string } | undefined)) {
  const anterior = simulado.de;
  simulado.de = (p) =>
    p.indicadorId === indicadorId ? (typeof valores === "function" ? valores(p.periodo.clave) : valores) : anterior?.(p);
}

const fila = async (tx: TransactionSql, medicionId: number) => (await tx`SELECT * FROM mediciones WHERE id = ${medicionId}`)[0];

const valores = async (tx: TransactionSql, medicionId: number) =>
  tx`SELECT iv.letra, mv.valor::text AS valor, mv.reportado_por, mv.reportado_en
    FROM medicion_valores mv JOIN indicador_variables iv ON iv.id = mv.variable_id
    WHERE mv.medicion_id = ${medicionId} ORDER BY iv.letra`;

const eventos = (tx: TransactionSql, medicionId: number) =>
  tx`SELECT tipo, usuario_id, detalle, creado_en FROM medicion_eventos WHERE medicion_id = ${medicionId} ORDER BY id`;

const bitacora = (tx: TransactionSql, medicionId: number) =>
  tx`SELECT usuario_id, detalle FROM auditoria WHERE accion = 'medicion_foto_recalculada' AND entidad = 'medicion' AND entidad_id = ${medicionId} ORDER BY id`;

const fotos = (tx: TransactionSql, ahora: Date, indicadorId?: number) => tomarFotos({ sql: tx, ahora, indicadorId });

async function rechaza(promesa: Promise<unknown>, mensaje: string) {
  const err = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ErrorIndicador);
  expect((err as Error).message).toBe(mensaje);
}

describe("las reglas de la foto", () => {
  const hasta = new Date("2026-03-31T12:00:00Z");
  const venceEn = new Date("2026-04-10T12:00:00Z");

  it("cuándo se calcula: flujo al vencer el plazo; estado, o una histórica, al terminar el periodo", () => {
    expect(cuandoSeCalcula({ clase: "flujo", hasta, venceEn, historica: false })).toBe(venceEn);
    expect(cuandoSeCalcula({ clase: "flujo", hasta, venceEn, historica: true })).toBe(hasta);
    expect(cuandoSeCalcula({ clase: "estado", hasta, venceEn, historica: false })).toBe(hasta);
  });

  it("el periodo más reciente que terminó: el siguiente aún no termina", () => {
    const marzo = { hasta: new Date("2026-04-01T04:59:59.999Z") };
    expect(esElUltimoTerminado(marzo, "mensual", new Date("2026-04-02T15:00:00Z"), "America/Bogota")).toBe(true);
    expect(esElUltimoTerminado(marzo, "mensual", new Date("2026-05-02T15:00:00Z"), "America/Bogota")).toBe(false);
    // Aún no termina.
    expect(esElUltimoTerminado(marzo, "mensual", new Date("2026-03-20T15:00:00Z"), "America/Bogota")).toBe(false);
  });

  it("los textos: «foto del 1 de abril, 7:12 a. m.» y «Se calcula el 10 de abril», en la zona", () => {
    expect(textoDeFoto(new Date("2026-04-01T12:12:00Z"), "America/Bogota")).toBe("foto del 1 de abril, 7:12 a. m.");
    expect(textoDeFoto(new Date("2026-04-01T18:05:00Z"), "America/Bogota")).toBe("foto del 1 de abril, 1:05 p. m.");
    expect(textoDeFoto(new Date("2026-04-01T17:00:00Z"), "America/Bogota")).toBe("foto del 1 de abril, 12:00 p. m.");
    expect(textoDeFoto(new Date("2026-04-02T05:30:00Z"), "America/Bogota")).toBe("foto del 2 de abril, 12:30 a. m.");
    expect(textoDeEspera(fechaLimite(new Date("2026-03-31T17:00:00Z"), 10, "America/Bogota"), "America/Bogota")).toBe("Se calcula el 10 de abril");
  });
});

describe("tomarFotos", () => {
  it("flujo: no se toma antes de vencer el plazo; después, una vez", () =>
    revertida(sql, async (tx) => {
      const { ind, procesoId, medicion } = await automatico(tx, "etapas");
      simular(ind.id, { A: "3", B: "4" });
      const marzo = await medicion();

      expect(await fotos(tx, abril(5), ind.id)).toEqual({ tomadas: 0, noAplica: 0 });
      expect(await fotos(tx, abril(10), ind.id)).toEqual({ tomadas: 0, noAplica: 0 });
      expect(await valores(tx, marzo)).toHaveLength(0);
      expect((await fila(tx, marzo)).foto_en).toBeNull();
      // Mientras espera, la tabla del año dice cuándo se calcula y no está vencida.
      const [antes] = (await tablaDelAnio(await sesionAdmin(tx), ind.id, 2003, { sql: tx, ahora: abril(5) })).filter((f) => f.periodo === MARZO);
      expect(antes).toMatchObject({ estado: "falta_dato", vencida: false, fotoEn: null, seCalcula: VENCE_MARZO, recalculable: false });

      expect(await fotos(tx, abril(11), ind.id)).toEqual({ tomadas: 1, noAplica: 0 });
      // El cálculo del periodo, con el alcance de la ficha y a la hora de la foto.
      expect(vi.mocked(tomarCalculo).mock.calls.at(-1)?.[1]).toMatchObject({
        clave: "etapas",
        alcance: "proceso",
        procesoId,
        indicadorId: ind.id,
        periodo: { clave: MARZO },
        ahora: abril(11),
      });
      expect((await valores(tx, marzo)).map((v) => ({ ...v }))).toEqual([
        { letra: "A", valor: "3", reportado_por: null, reportado_en: abril(11) },
        { letra: "B", valor: "4", reportado_por: null, reportado_en: abril(11) },
      ]);
      const m = await fila(tx, marzo);
      expect([m.reportada_en, m.reportada_por, m.foto_en, m.no_aplica]).toEqual([abril(11), null, abril(11), false]);
      expect([m.resultado_exacto, m.semaforo, m.cumple, m.estado]).toEqual(["75/1", "atencion", false, "abierta"]);
      const [e, ...otros] = await eventos(tx, marzo);
      expect(otros).toHaveLength(0);
      expect(e.tipo).toBe("foto");
      expect(e.usuario_id).toBeNull();
      expect(e.creado_en).toEqual(abril(11));
      expect(e.detalle).toMatchObject({
        calculo: "etapas",
        alcance: "proceso",
        valores: { A: "3", B: "4" },
        antes: { A: null, B: null, noAplica: false, resultado: null, estado: "abierta" },
        despues: { A: "3", B: "4", noAplica: false, resultado: "75", semaforo: "atencion" },
      });
      // Lo hace el sistema: sin fila en la bitácora.
      expect(await tx`SELECT 1 FROM auditoria WHERE entidad = 'medicion' AND entidad_id = ${marzo}`).toHaveLength(0);

      expect(await fotos(tx, abril(12), ind.id)).toEqual({ tomadas: 0, noAplica: 0 });
      expect(await eventos(tx, marzo)).toHaveLength(1);
    }));

  it("flujo: la foto da otro plazo al análisis, contado desde ella; estado: el plazo no cambia", () =>
    revertida(sql, async (tx) => {
      const flujo = await automatico(tx, "etapas");
      simular(flujo.ind.id, { A: "3", B: "4" });
      const marzo = await flujo.medicion();
      await tx`UPDATE mediciones SET aviso_previo_en = ${abril(8)} WHERE id = ${marzo}`;
      await fotos(tx, abril(11), flujo.ind.id);
      const m = await fila(tx, marzo);
      expect(m.vence_en).toEqual(fechaLimite(abril(11), 10, ZONA));
      expect([m.aviso_previo_en, m.aviso_vencido_en, m.escalado_en]).toEqual([null, null, null]);
      expect((await eventos(tx, marzo))[0].detalle.venceEn).toBe(fechaLimite(abril(11), 10, ZONA).toISOString());

      const estado = await automatico(tx, "dentro_plazo");
      simular(estado.ind.id, { A: "9", B: "10" });
      await fotos(tx, abril(11), estado.ind.id);
      const e = await fila(tx, await estado.medicion());
      expect(e.foto_en).toEqual(abril(11));
      expect(e.vence_en).toEqual(VENCE_MARZO);
      expect((await eventos(tx, await estado.medicion()))[0].detalle).not.toHaveProperty("venceEn");
    }));

  it("estado: en la primera revisión después del fin del periodo", () =>
    revertida(sql, async (tx) => {
      const { ind, medicion } = await automatico(tx, "dentro_plazo", { abrirA: abril(1) });
      simular(ind.id, { A: "9", B: "10" });
      const marzo = await medicion();
      const [antes] = (await tablaDelAnio(await sesionAdmin(tx), ind.id, 2003, { sql: tx, ahora: abril(1) })).filter((f) => f.periodo === MARZO);
      expect(antes).toMatchObject({ estado: "falta_dato", seCalcula: (await fila(tx, marzo)).hasta, fotoEn: null });

      expect(await fotos(tx, abril(1), ind.id)).toEqual({ tomadas: 1, noAplica: 0 });
      expect(vi.mocked(tomarCalculo).mock.calls.at(-1)?.[1]).toMatchObject({ clave: "dentro_plazo", periodo: { clave: MARZO }, ahora: abril(1) });
      const m = await fila(tx, marzo);
      expect([m.foto_en, m.resultado_exacto, m.semaforo, m.estado]).toEqual([abril(1), "90/1", "bien", "reportada"]);
      // La foto de estado se toma una sola vez.
      simular(ind.id, { A: "1", B: "10" });
      expect(await fotos(tx, abril(11), ind.id)).toEqual({ tomadas: 0, noAplica: 0 });
      expect((await fila(tx, marzo)).resultado_exacto).toBe("90/1");
    }));

  it("estado: si pasaron dos periodos, la foto es solo del más reciente", () =>
    revertida(sql, async (tx) => {
      const { ind, medicion } = await automatico(tx, "dentro_plazo", { inicioMedicion: "2003-02", abrirA: abril(2) });
      simular(ind.id, { A: "9", B: "10" });
      const [febrero, marzo] = [await medicion("2003-02"), await medicion(MARZO)];
      const admin = await sesionAdmin(tx);
      const tabla = async () => (await tablaDelAnio(admin, ind.id, 2003, { sql: tx, ahora: abril(2) })).filter((f) => f.medicionId !== null);
      // Febrero ya no es el más reciente: nunca se calculará.
      expect((await tabla()).map((f) => [f.periodo, f.seCalcula === null])).toEqual([
        ["2003-02", true],
        [MARZO, false],
      ]);

      expect(await fotos(tx, abril(2), ind.id)).toEqual({ tomadas: 1, noAplica: 0 });
      expect((await fila(tx, marzo)).foto_en).toEqual(abril(2));
      // Una segunda pasada no le atribuye a febrero una foto que no es suya.
      expect(await fotos(tx, abril(3), ind.id)).toEqual({ tomadas: 0, noAplica: 0 });
      const f = await fila(tx, febrero);
      expect([f.foto_en, f.reportada_en, f.no_aplica, f.estado]).toEqual([null, null, false, "abierta"]);
      expect(await valores(tx, febrero)).toHaveLength(0);
      expect(await eventos(tx, febrero)).toHaveLength(0);
      expect(vi.mocked(tomarCalculo).mock.calls.map((c) => c[1].periodo.clave)).toEqual([MARZO]);
    }));

  it("una histórica se calcula sola si el cálculo se llena hacia atrás", () =>
    revertida(sql, async (tx) => {
      // Aprobadas el 15 de marzo: enero y febrero terminaron antes, son históricos.
      const o = { inicioMedicion: "2003-01", aprobadaEn: new Date("2003-03-15T15:00:00Z"), abrirA: abril(2) };
      const etapas = await automatico(tx, "etapas", o);
      simular(etapas.ind.id, (periodo) => ({ A: periodo === "2003-01" ? "1" : "2", B: "2" }));
      const acuses = await automatico(tx, "acuses", o);
      simular(acuses.ind.id, { A: "1", B: "2" });
      const enero = await etapas.medicion("2003-01");
      expect((await fila(tx, enero)).historica).toBe(true);

      // Las históricas sin esperar el plazo; marzo, ordinario, espera al 10 de abril.
      expect(await fotos(tx, abril(2), etapas.ind.id)).toEqual({ tomadas: 2, noAplica: 0 });
      const e = await fila(tx, enero);
      expect([e.foto_en, e.resultado_exacto, e.vence_en]).toEqual([abril(2), "50/1", fechaLimite(new Date("2003-01-31T17:00:00Z"), 10, ZONA)]);
      expect((await fila(tx, await etapas.medicion("2003-02"))).resultado_exacto).toBe("100/1");
      expect((await fila(tx, await etapas.medicion(MARZO))).foto_en).toBeNull();
      // Un histórico no alerta.
      expect(await tx`SELECT 1 FROM notificaciones WHERE tipo = 'indicadores.alerta' AND entidad = 'medicion' AND entidad_id = ${enero}`).toHaveLength(0);

      // «Acuses» no se llena hacia atrás: sus históricos no se calculan, ni siquiera después.
      expect(await fotos(tx, abril(11), acuses.ind.id)).toEqual({ tomadas: 1, noAplica: 0 });
      for (const periodo of ["2003-01", "2003-02"]) expect((await fila(tx, await acuses.medicion(periodo))).foto_en).toBeNull();
      expect((await fila(tx, await acuses.medicion(MARZO))).foto_en).toEqual(abril(11));
    }));

  it("sin nada que medir queda «No aplica» con el motivo del cálculo; un conteo en cero es un resultado 0", () =>
    revertida(sql, async (tx) => {
      const aprobacion = await automatico(tx, "aprobacion");
      simular(aprobacion.ind.id, { A: "0", B: "0" });
      const marzo = await aprobacion.medicion();
      expect(await fotos(tx, abril(11), aprobacion.ind.id)).toEqual({ tomadas: 0, noAplica: 1 });
      const m = await fila(tx, marzo);
      expect([m.no_aplica, m.no_aplica_motivo, m.reportada_en, m.foto_en, m.estado]).toEqual([
        true,
        "No se publicó ningún trámite en el periodo",
        abril(11),
        abril(11),
        "reportada",
      ]);
      expect(await valores(tx, marzo)).toHaveLength(0);
      expect((await eventos(tx, marzo))[0].detalle).toMatchObject({
        calculo: "aprobacion",
        noAplica: "No se publicó ningún trámite en el periodo",
        despues: { noAplica: true, motivo: "No se publicó ningún trámite en el periodo" },
      });
      expect(await tareasDeIndicadores(await sesionAdmin(tx), { sql: tx, ahora: abril(11) })).toMatchObject({ vencidas: 0 });

      const vencidos = await automatico(tx, "vencidos");
      simular(vencidos.ind.id, { A: "0" });
      expect(await fotos(tx, abril(2), vencidos.ind.id)).toEqual({ tomadas: 1, noAplica: 0 });
      const v = await fila(tx, await vencidos.medicion());
      expect([v.no_aplica, v.resultado_exacto]).toEqual([false, "0/1"]);
      expect((await valores(tx, await vencidos.medicion())).map((x) => [x.letra, x.valor])).toEqual([["A", "0"]]);
    }));

  it("si el resultado no cumple la meta salen las alertas y la tarea de analizar", () =>
    revertida(sql, async (tx) => {
      const analiza = await usuarioDePrueba(tx, { rol: "consulta" });
      const { ind, medicion } = await automatico(tx, "etapas", { analiza: [analiza.usuarioId] });
      simular(ind.id, { A: "1", B: "4" });
      const marzo = await medicion();
      // Antes de la foto, «Falta un dato»: no es tarea de nadie.
      expect(await tareasDeIndicadores(analiza, { sql: tx, ahora: abril(10) })).toEqual({ tareas: [], vencidas: 0 });

      await fotos(tx, abril(11), ind.id);
      const m = await fila(tx, marzo);
      expect([m.semaforo, m.requiere_accion, m.estado, m.alerta_estado]).toEqual(["critico", true, "abierta", "critico"]);
      const alertas = await tx`SELECT usuario_id, titulo FROM notificaciones
        WHERE tipo = 'indicadores.alerta' AND entidad = 'medicion' AND entidad_id = ${marzo}`;
      expect(alertas.map((a) => Number(a.usuario_id))).toContain(analiza.usuarioId);
      expect(alertas[0].titulo).toContain("Crítico");
      // La tarea de analizar vence contando desde la foto: no nace vencida.
      const nuevaFecha = fechaLimite(abril(11), 10, ZONA);
      expect(await tareasDeIndicadores(analiza, { sql: tx, ahora: abril(11) })).toMatchObject({
        tareas: [{ id: `analizar:${marzo}`, vence: nuevaFecha }],
        vencidas: 0,
      });
    }));

  it("no toca una medición cerrada ni la de un indicador retirado", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const cerrada = await automatico(tx, "etapas");
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id = ${await cerrada.medicion()}`;
      const retirado = await automatico(tx, "etapas");
      await tx`UPDATE indicadores SET estado = 'retirado', baja_por = ${admin.usuarioId}, baja_en = ${abril(3)}, baja_motivo = 'Ya no se mide'
        WHERE id = ${retirado.ind.id}`;
      simulado.de = () => ({ A: "1", B: "1" });

      expect(await fotos(tx, abril(11))).toEqual({ tomadas: 0, noAplica: 0 });
      expect(vi.mocked(tomarCalculo)).not.toHaveBeenCalled();
      for (const x of [cerrada, retirado]) {
        expect((await fila(tx, await x.medicion())).foto_en).toBeNull();
        expect(await valores(tx, await x.medicion())).toHaveLength(0);
      }
    }));

  it("una medición anterior al cambio de manual a automático no recibe foto", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const proceso = await procesoNuevo(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: proceso.id, inicioMedicion: "2003-02", aprobadaEn: APROBADA });
      await versionAutomatica(tx, {
        indicadorId: ind.id,
        usuarioId: admin.usuarioId,
        rigeDesde: MARZO,
        aprobadaEn: new Date("2003-02-20T15:00:00Z"),
        periodicidad: "mensual",
        calculo: { clave: "etapas", alcance: "proceso" },
      });
      await asegurarMediciones({ sql: tx, ahora: abril(2), indicadorId: ind.id });
      simular(ind.id, { A: "1", B: "1" });
      const id = async (periodo: string) => Number((await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = ${periodo}`)[0].id);

      expect(await fotos(tx, abril(11), ind.id)).toEqual({ tomadas: 1, noAplica: 0 });
      expect((await fila(tx, await id("2003-02"))).foto_en).toBeNull();
      expect(await valores(tx, await id("2003-02"))).toHaveLength(0);
      expect((await fila(tx, await id(MARZO))).foto_en).toEqual(abril(11));
    }));

  it("«Objetivos cumplidos» se toma después de los demás automáticos de la misma pasada", () =>
    revertida(sql, async (tx) => {
      const objetivo = async () =>
        Number((await tx`INSERT INTO objetivos (clase, enunciado, orden, activo) VALUES ('calidad', ${`Objetivo de prueba ${unico()}`}, 900, true) RETURNING id`)[0].id);
      const [primero, segundo] = [await objetivo(), await objetivo()];
      // Creada primero: en el orden natural de la pasada, iría antes que los que cuenta.
      const objetivos = await automatico(tx, "objetivos_cumplidos", { alcance: "calidad" });
      // Una manual del proceso de «Reportes a tiempo», con febrero reportado a tiempo: su marzo da 1 de 1.
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const proceso = await procesoNuevo(tx);
      const manual = await indicadorDePrueba(tx, { procesoId: proceso.id, inicioMedicion: "2003-02", aprobadaEn: APROBADA, mide: [mide.usuarioId] });
      await asegurarMediciones({ sql: tx, ahora: new Date("2003-03-05T15:00:00Z"), indicadorId: manual.id });
      const [feb] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${manual.id} AND periodo = '2003-02'`;
      await reportar(mide, { medicionId: Number(feb.id), valores: { A: "9", B: "10" }, parcial: false, confirmado: true }, { sql: tx, ahora: new Date("2003-03-05T15:00:00Z") });
      const reportes = await automatico(tx, "reportes_a_tiempo", { procesoId: proceso.id, objetivoId: segundo });
      const etapas = await automatico(tx, "etapas", { objetivoId: primero });
      simular(etapas.ind.id, { A: "1", B: "1" });

      expect(await fotos(tx, abril(11))).toEqual({ tomadas: 3, noAplica: 0 });
      expect(vi.mocked(tomarCalculo).mock.calls.map((c) => c[1].clave)).toEqual(["etapas", "reportes_a_tiempo", "objetivos_cumplidos"]);
      expect((await fila(tx, await reportes.medicion())).resultado_exacto).toBe("100/1");
      // Cuenta los dos objetivos: sus mediciones de marzo se fotografiaron antes en la misma pasada.
      expect((await valores(tx, await objetivos.medicion())).map((v) => [v.letra, v.valor])).toEqual([
        ["A", "2"],
        ["B", "2"],
      ]);
    }));

  it("una que falla se registra y las demás siguen", () =>
    revertida(sql, async (tx) => {
      const mala = await automatico(tx, "etapas");
      const buena = await automatico(tx, "etapas");
      simular(buena.ind.id, { A: "1", B: "1" });
      simular(mala.ind.id, () => {
        throw new Error("La Vigencia no dio el periodo «2003-03»");
      });
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        expect(await fotos(tx, abril(11))).toEqual({ tomadas: 1, noAplica: 0 });
        expect(error).toHaveBeenCalledWith(`No se pudo tomar la foto de la medición ${await mala.medicion()}:`, expect.any(Error));
      } finally {
        error.mockRestore();
      }
      expect((await fila(tx, await mala.medicion())).foto_en).toBeNull();
      expect((await fila(tx, await buena.medicion())).foto_en).toEqual(abril(11));
    }));

  it("con el tope por indicador, el resto queda para la siguiente pasada", () =>
    revertida(sql, async (tx) => {
      const o = { inicioMedicion: "2003-01", aprobadaEn: new Date("2003-03-15T15:00:00Z"), abrirA: abril(2) };
      const { ind, medicion } = await automatico(tx, "etapas", o);
      simular(ind.id, { A: "1", B: "2" });
      expect(await tomarFotos({ sql: tx, ahora: abril(2), indicadorId: ind.id, maximoPorIndicador: 1 })).toEqual({ tomadas: 1, noAplica: 0 });
      expect((await fila(tx, await medicion("2003-01"))).foto_en).toEqual(abril(2));
      expect((await fila(tx, await medicion("2003-02"))).foto_en).toBeNull();
      expect(await tomarFotos({ sql: tx, ahora: abril(3), indicadorId: ind.id, maximoPorIndicador: 1 })).toEqual({ tomadas: 1, noAplica: 0 });
      expect((await fila(tx, await medicion("2003-02"))).foto_en).toEqual(abril(3));
    }));
});

describe("volver a calcular", () => {
  it("volver a calcular: cambia los valores y deja el antes y el después", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const { ind, medicion } = await automatico(tx, "etapas");
      simular(ind.id, { A: "3", B: "4" });
      const marzo = await medicion();
      await fotos(tx, abril(11), ind.id);
      const vence = (await fila(tx, marzo)).vence_en;

      // Lo mismo otra vez: nada cambia, ni evento ni bitácora.
      expect(await volverACalcular(admin, marzo, { sql: tx, ahora: abril(12) })).toEqual({ cambio: false });
      expect(await eventos(tx, marzo)).toHaveLength(1);
      expect(await bitacora(tx, marzo)).toHaveLength(0);
      expect((await fila(tx, marzo)).foto_en).toEqual(abril(11));

      simular(ind.id, { A: "2", B: "4" });
      expect(await volverACalcular(admin, marzo, { sql: tx, ahora: abril(13) })).toEqual({ cambio: true });
      expect((await valores(tx, marzo)).map((v) => [v.letra, v.valor, v.reportado_por])).toEqual([
        ["A", "2", null],
        ["B", "4", null],
      ]);
      const m = await fila(tx, marzo);
      expect([m.resultado_exacto, m.semaforo, m.foto_en, m.reportada_en]).toEqual(["50/1", "critico", abril(13), abril(11)]);
      // El plazo del análisis no se mueve otra vez.
      expect(m.vence_en).toEqual(vence);
      const e = (await eventos(tx, marzo)).at(-1)!;
      expect([e.tipo, e.usuario_id]).toEqual(["foto", admin.usuarioId]);
      expect(e.detalle).toMatchObject({
        recalculo: true,
        antes: { A: "3", B: "4", noAplica: false, resultado: "75", semaforo: "atencion" },
        despues: { A: "2", B: "4", noAplica: false, resultado: "50", semaforo: "critico" },
      });
      // Una corrección del color: el aviso de corrección a quienes reciben el nivel.
      expect(await tx`SELECT 1 FROM notificaciones WHERE tipo = 'indicadores.correccion' AND entidad = 'medicion' AND entidad_id = ${marzo}`).not.toHaveLength(0);
      const [b] = await bitacora(tx, marzo);
      expect(Number(b.usuario_id)).toBe(admin.usuarioId);
      expect(b.detalle).toMatchObject({ codigo: ind.codigo, periodo: MARZO, antes: "75 %", despues: "50 %" });
      expect(describirEvento({ accion: "medicion_foto_recalculada", entidad: "medicion", entidadId: marzo, detalle: b.detalle })).toBe(
        `Volvió a calcular ${ind.codigo}, marzo de 2003: de 75 % a 50 %`,
      );

      // Sin nada que medir: «No aplica», sin los valores de antes; y de vuelta.
      simular(ind.id, { A: "0", B: "0" });
      expect(await volverACalcular(admin, marzo, { sql: tx, ahora: abril(14) })).toEqual({ cambio: true });
      const n = await fila(tx, marzo);
      expect([n.no_aplica, n.no_aplica_motivo, n.estado]).toEqual([true, "No se cerró ninguna etapa con fecha límite en el periodo", "reportada"]);
      expect(await valores(tx, marzo)).toHaveLength(0);
      expect((await bitacora(tx, marzo)).at(-1)!.detalle).toMatchObject({ antes: "50 %", despues: "No aplica" });
      simular(ind.id, { A: "4", B: "4" });
      expect(await volverACalcular(admin, marzo, { sql: tx, ahora: abril(15) })).toEqual({ cambio: true });
      const s = await fila(tx, marzo);
      expect([s.no_aplica, s.no_aplica_motivo, s.resultado_exacto]).toEqual([false, null, "100/1"]);

      // El historial lo dice: «El sistema tomó la foto» y «Se volvió a calcular».
      const historial = historialDeCorreccion(
        [
          { id: 1, tipo: "reapertura", quien: "Admin", creadoEn: abril(16), detalle: {} },
          ...(await eventos(tx, marzo)).map(
            (x, k): EventoDeMedicion => ({ id: k + 2, tipo: x.tipo, quien: x.usuario_id === null ? null : "Admin", creadoEn: x.creado_en as Date, detalle: x.detalle }),
          ),
        ],
        { unidad: { sufijo: " %", decimales: 1 }, nombres: { A: "Etapas en plazo", B: "Etapas" }, conSoportes: true },
      );
      expect(historial.map((h) => [h.que, h.quien])).toEqual([
        ["Reabrió", "Admin"],
        ["El sistema tomó la foto", "El sistema"],
        ["Se volvió a calcular", "Admin"],
        ["Se volvió a calcular", "Admin"],
        ["Se volvió a calcular", "Admin"],
      ]);
      expect(historial[2].cambios).toContain("Etapas en plazo: 3 → 2");
    }));

  it("volver a calcular: rechaza la cerrada, la reabierta, la de estado y a quien no administra", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso" });
      const fotografiada = async (clave: ClaveDeCalculo) => {
        const x = await automatico(tx, clave);
        simular(x.ind.id, { A: "9", B: "10" });
        await fotos(tx, abril(11), x.ind.id);
        return x.medicion();
      };

      const otra = await fotografiada("etapas");
      const err = await volverACalcular(lider, otra, { sql: tx, ahora: abril(12) }).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(ErrorPermiso);

      const cerrada = await fotografiada("etapas");
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id = ${cerrada}`;
      await rechaza(volverACalcular(admin, cerrada, { sql: tx, ahora: abril(12) }), "La medición está cerrada: pida al Administrador del SGC que la reabra");

      await reabrirMedicion(admin, { medicionId: cerrada, justificacion: "El periodo se revisa con los datos completos" }, { sql: tx, ahora: abril(13) });
      await rechaza(
        volverACalcular(admin, cerrada, { sql: tx, ahora: abril(14) }),
        "La foto quedó congelada con el cierre: reabrirla solo deja cambiar el análisis",
      );

      await rechaza(volverACalcular(admin, await fotografiada("dentro_plazo"), { sql: tx, ahora: abril(12) }), "La foto de este cálculo se toma una sola vez");

      const sinFoto = await automatico(tx, "etapas");
      await rechaza(volverACalcular(admin, await sinFoto.medicion(), { sql: tx, ahora: abril(5) }), "El sistema todavía no ha calculado este periodo");
      const manual = await indicadorDePrueba(tx, { procesoId: (await procesoNuevo(tx)).id, inicioMedicion: MARZO, aprobadaEn: APROBADA });
      await asegurarMediciones({ sql: tx, ahora: abril(2), indicadorId: manual.id });
      const [mm] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${manual.id} AND periodo = ${MARZO}`;
      await rechaza(volverACalcular(admin, Number(mm.id), { sql: tx, ahora: abril(12) }), "Este periodo no lo calcula el sistema");
      expect(await tx`SELECT 1 FROM auditoria WHERE accion = 'medicion_foto_recalculada' AND entidad_id IN ${tx([otra, cerrada])}`).toHaveLength(0);
    }));

  it("cambiar el plazo de reporte después de la foto lo cuenta desde la foto", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const { ind, medicion } = await automatico(tx, "etapas");
      simular(ind.id, { A: "1", B: "4" });
      await fotos(tx, abril(11), ind.id);
      await cambiarOperacion(
        admin,
        { indicadorId: ind.id, plazoReporteDias: 5, inicioMedicion: MARZO, soporteObligatorio: false, nivelAcceso: "general" },
        { sql: tx, ahora: abril(12) },
      );
      expect((await fila(tx, await medicion())).vence_en).toEqual(fechaLimite(abril(11), 5, ZONA));
    }));
});

describe("el cierre y las lecturas", () => {
  it("el cierre del mes toma antes las fotos pendientes", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const base = await resumenDeCierre(admin, MARZO, { sql: tx, ahora: abril(20) });
      expect(base, "el año de las pruebas no debe alcanzar mediciones de la base").toMatchObject({ aCerrar: 0, enPlazo: 0 });
      const estado = await automatico(tx, "dentro_plazo");
      simular(estado.ind.id, { A: "9", B: "10" });
      const flujo = await automatico(tx, "etapas");
      simular(flujo.ind.id, { A: "9", B: "10" });

      // El resumen toma las dos: la de estado se cerrará reportada; la de flujo recibe el plazo de su análisis.
      const r = await resumenDeCierre(admin, MARZO, { sql: tx, ahora: abril(20) });
      expect(r).toMatchObject({ aCerrar: 1, reportadas: 1, sinDato: [], enPlazo: 1 });
      expect((await fila(tx, await estado.medicion())).foto_en).toEqual(abril(20));
      expect((await fila(tx, await flujo.medicion())).vence_en).toEqual(fechaLimite(abril(20), 10, ZONA));

      // El cierre también las toma antes de clasificar: una que aparece después del resumen.
      const tardia = await automatico(tx, "dentro_plazo", { abrirA: abril(20) });
      simular(tardia.ind.id, { A: "10", B: "10" });
      expect(await cerrarMes(admin, MARZO, { sql: tx, ahora: abril(20) })).toMatchObject({ cerradas: 2 });
      const t = await fila(tx, await tardia.medicion());
      expect([t.foto_en, t.estado, t.resultado_exacto]).toEqual([abril(20), "cerrada", "100/1"]);
      expect((await fila(tx, await flujo.medicion())).estado).toBe("reportada");
    }));

  it("una medición fotografiada, sin usuario, sale en la tabla del año, la matriz, el Excel del indicador y el impreso", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const { ind, procesoId, medicion } = await automatico(tx, "etapas");
      simular(ind.id, { A: "3", B: "4" });
      await fotos(tx, abril(11), ind.id);
      const opciones = { sql: tx, ahora: abril(12) };

      const [marzo] = (await tablaDelAnio(admin, ind.id, 2003, opciones)).filter((f) => f.periodo === MARZO);
      expect(marzo).toMatchObject({
        medicionId: await medicion(),
        automatica: true,
        fotoEn: abril(11),
        seCalcula: null,
        recalculable: true,
        resultado: "75 %",
        valores: [
          { letra: "A", valor: "3" },
          { letra: "B", valor: "4" },
        ],
      });

      const matriz = await matrizDelAnio(admin, { anio: 2003, procesoId }, opciones);
      const celda = matriz.procesos[0]?.filas.find((f) => f.codigo === ind.codigo)?.celdas.find((c) => c.desdeMes === 3);
      expect(celda).toMatchObject({ texto: "75 %", estado: "atencion" });

      const impreso = await impresionDelAnio(admin, ind.codigo, 2003, opciones);
      expect(impreso?.resultados.filas.find((f) => f.periodo === MARZO)).toMatchObject({ resultado: "75 %", valores: [{ valor: "3" }, { valor: "4" }] });

      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load((await construirExcelDeIndicador(impreso!, { hospital: "Entidad Zeta", generadoEn: "2003-04-12 10:00", detalle: "2003" })) as unknown as ArrayBuffer);
      const filas: unknown[][] = [];
      libro.getWorksheet("Resultados 2003")!.eachRow((f) => filas.push((f.values as unknown[]).slice(1)));
      expect(filas.find((f) => f[0] === "Marzo de 2003")?.slice(2, 5)).toEqual([3, 4, "75 %"]);

      // La pantalla de reportar, para quien la abre: cuándo se tomó y que se puede volver a calcular.
      const analiza = await usuarioDePrueba(tx, { rol: "consulta" });
      await tx`INSERT INTO indicador_designados (indicador_id, usuario_id, funcion, creado_por) VALUES (${ind.id}, ${analiza.usuarioId}, 'analiza', ${admin.usuarioId})`;
      expect(await medicionParaReportar(analiza, ind.codigo, MARZO, opciones)).toMatchObject({
        automatica: true,
        foto: "foto del 11 de abril, 10:00 a. m.",
        seCalcula: null,
        recalculable: true,
      });
    }));
});

