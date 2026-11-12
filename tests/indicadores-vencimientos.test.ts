/**
 * Los recordatorios de los indicadores (Fase 14A, Tarea 13; spec §10.2, F14-DC34): la pasada abre los periodos que
 * terminaron, manda el aviso previo, el de vencido y el escalamiento al jefe, cada uno una sola vez (marcas en la medición)
 * y sin fila en `auditoria`. Contra la BD de desarrollo, dentro de una transacción que se revierte.
 *
 * La pasada recorre todo el sistema. Para no alcanzar nada de la base, los casos viven en 2003, antes de todo inicio de
 * medición de la base, con `ahora` en ese año. Los indicadores de prueba son mensuales, de forma «porcentaje», con inicio en
 * marzo de 2003, aprobados el 15 de diciembre de 2002 y con plazo de 10 días: marzo vence el 10 de abril de 2003.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { CONFIG_DOCUMENTAL_DEFECTO } from "@/db/consultas/config-documental";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { asegurarMediciones, marcarNoAplica, reportar } from "@/db/consultas/indicadores/mediciones";
import { revisarVencimientosDeIndicadores } from "@/db/consultas/indicadores/vencimientos";
import { revisarVencimientos } from "@/db/consultas/vencimientos";
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

const APROBADA = new Date("2002-12-15T15:00:00Z");
const MARZO = "2003-03";
/** Las 10 de la mañana del día dado de abril de 2003, en Bogotá. */
const abril = (d: number) => new Date(`2003-04-${String(d).padStart(2, "0")}T15:00:00Z`);
const config = { ...CONFIG_DOCUMENTAL_DEFECTO, escalamientoDias: 3 };

const pasada = (tx: TransactionSql, ahora: Date) => revisarVencimientosDeIndicadores({ sql: tx, ahora, config });

type Aviso = { tipo: string; titulo: string; cuerpo: string; enlace: string | null; entidad: string; entidad_id: number };

/** Los avisos de recordatorio de la persona, en orden de llegada. */
async function avisosDe(tx: TransactionSql, usuarioId: number): Promise<Aviso[]> {
  const filas = await tx`SELECT tipo, titulo, cuerpo, enlace, entidad, entidad_id FROM notificaciones
    WHERE usuario_id = ${usuarioId} AND tipo IN ('indicadores.por_vencer', 'indicadores.vencido', 'indicadores.escalado')
    ORDER BY id`;
  return filas.map((f) => ({ ...(f as unknown as Aviso), entidad_id: Number(f.entidad_id) }));
}

const marcas = async (tx: TransactionSql, medicionId: number) =>
  (await tx`SELECT aviso_previo_en, aviso_vencido_en, escalado_en FROM mediciones WHERE id = ${medicionId}`)[0];

/** Un proceso que solo existe en la transacción: sus líderes son los que el test le asigne. */
async function procesoNuevo(tx: TransactionSql): Promise<{ id: number; nombre: string }> {
  const sigla = `Z${unico()}`;
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${`Proceso ${sigla}`}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id, nombre`;
  return { id: Number(p.id), nombre: p.nombre as string };
}

/** Un indicador mensual del proceso desde marzo de 2003; con `abrir`, su marzo ya abierto al 5 de abril. */
async function indicador(tx: TransactionSql, procesoId: number, o: OpcionesIndicadorDePrueba = {}, abrir = true) {
  const ind = await indicadorDePrueba(tx, { procesoId, inicioMedicion: MARZO, aprobadaEn: APROBADA, ...o });
  if (abrir) await asegurarMediciones({ sql: tx, ahora: abril(5), indicadorId: ind.id });
  const medicion = async () => Number((await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = ${MARZO}`)[0].id);
  return { ind, medicion };
}

/** Los parámetros de la prueba: aviso previo a 3 días. */
async function entorno(tx: TransactionSql) {
  await tx`UPDATE configuracion SET valor = '3' WHERE clave = 'ind_aviso_previo_dias'`;
  await tx`UPDATE configuracion SET valor = '3' WHERE clave = 'ind_incumplimiento_periodos'`;
  return { proceso: await procesoNuevo(tx), admin: await sesionAdmin(tx) };
}

const reportarCon = (tx: TransactionSql, sesion: SesionFlujo, medicionId: number, valores: Record<string, string>, ahora: Date) =>
  reportar(sesion, { medicionId, valores, parcial: false, confirmado: true }, { sql: tx, ahora });

describe("revisarVencimientosDeIndicadores", () => {
  it("la pasada abre los periodos que terminaron", () =>
    revertida(sql, async (tx) => {
      const { proceso } = await entorno(tx);
      const { ind } = await indicador(tx, proceso.id, {}, false);
      expect(await tx`SELECT periodo FROM mediciones WHERE indicador_id = ${ind.id}`).toHaveLength(0);
      await pasada(tx, abril(20));
      expect((await tx`SELECT periodo FROM mediciones WHERE indicador_id = ${ind.id}`).map((f) => f.periodo)).toEqual([MARZO]);
    }));

  it("aviso previo: una vez, agrupado por persona, cuando faltan los días del parámetro", () =>
    revertida(sql, async (tx) => {
      const { proceso } = await entorno(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const a = await indicador(tx, proceso.id, { mide: [mide.usuarioId] });
      const b = await indicador(tx, proceso.id, { mide: [mide.usuarioId] });

      // A cuatro días del plazo todavía no.
      expect(await pasada(tx, abril(6))).toEqual({ avisados: 0, escalados: 0 });
      expect(await avisosDe(tx, mide.usuarioId)).toEqual([]);

      expect(await pasada(tx, abril(8))).toEqual({ avisados: 2, escalados: 0 });
      expect(await avisosDe(tx, mide.usuarioId)).toEqual([
        {
          tipo: "indicadores.por_vencer",
          titulo: "Tiene 2 indicadores por reportar antes del 10 de abril",
          cuerpo: "Los encuentra en «Mis tareas».",
          enlace: "/indicadores?reporte=por-reportar&participo=1",
          entidad: "usuario",
          entidad_id: mide.usuarioId,
        },
      ]);
      for (const x of [a, b]) expect((await marcas(tx, await x.medicion())).aviso_previo_en).toEqual(abril(8));
      expect(await pasada(tx, abril(9))).toEqual({ avisados: 0, escalados: 0 });
      expect(await avisosDe(tx, mide.usuarioId)).toHaveLength(1);
    }));

  it("vencido: un aviso por persona a quienes miden y otro por proceso a sus líderes", () =>
    revertida(sql, async (tx) => {
      const { proceso } = await entorno(tx);
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [proceso.id] });
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const a = await indicador(tx, proceso.id, { mide: [mide.usuarioId] });
      const b = await indicador(tx, proceso.id, { mide: [mide.usuarioId] });

      expect(await pasada(tx, abril(12))).toEqual({ avisados: 2, escalados: 0 });
      expect(await avisosDe(tx, mide.usuarioId)).toEqual([
        {
          tipo: "indicadores.vencido",
          titulo: "Tiene 2 indicadores por reportar con el plazo vencido",
          cuerpo: "El plazo venció el 10 de abril.",
          enlace: "/indicadores?reporte=vencida&participo=1",
          entidad: "usuario",
          entidad_id: mide.usuarioId,
        },
      ]);
      expect(await avisosDe(tx, lider.usuarioId)).toEqual([
        {
          tipo: "indicadores.vencido",
          titulo: `2 indicadores de ${proceso.nombre} con el plazo vencido`,
          cuerpo: "2 por reportar.",
          enlace: `/indicadores?reporte=vencida&proceso=${proceso.id}`,
          entidad: "proceso",
          entidad_id: proceso.id,
        },
      ]);
      for (const x of [a, b]) {
        const m = await marcas(tx, await x.medicion());
        expect(m.aviso_vencido_en).toEqual(abril(12));
        // Ya vencida, el aviso previo no sale.
        expect(m.aviso_previo_en).toBeNull();
      }
      expect(await pasada(tx, abril(13))).toEqual({ avisados: 0, escalados: 0 });
    }));

  it("si lo que falta es el análisis, el aviso de vencido va a quien analiza", () =>
    revertida(sql, async (tx) => {
      const { proceso } = await entorno(tx);
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [proceso.id] });
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const analiza = await usuarioDePrueba(tx, { rol: "consulta" });
      const a = await indicador(tx, proceso.id, { mide: [mide.usuarioId], analiza: [analiza.usuarioId] });
      await reportarCon(tx, mide, await a.medicion(), { A: "1", B: "2" }, abril(5));

      expect(await pasada(tx, abril(12))).toEqual({ avisados: 1, escalados: 0 });
      expect(await avisosDe(tx, mide.usuarioId)).toEqual([]);
      expect(await avisosDe(tx, analiza.usuarioId)).toMatchObject([
        { tipo: "indicadores.vencido", titulo: "Tiene 1 indicador por analizar con el plazo vencido", enlace: "/indicadores?reporte=vencida&participo=1" },
      ]);
      expect(await avisosDe(tx, lider.usuarioId)).toMatchObject([
        { tipo: "indicadores.vencido", titulo: `1 indicador de ${proceso.nombre} con el plazo vencido`, cuerpo: "1 por analizar." },
      ]);
    }));

  it("el líder que es quien mide recibe solo su aviso personal", () =>
    revertida(sql, async (tx) => {
      const { proceso } = await entorno(tx);
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [proceso.id] });
      // Sin nadie designado para medir, mide el líder.
      await indicador(tx, proceso.id);
      await pasada(tx, abril(12));
      expect((await avisosDe(tx, lider.usuarioId)).map((x) => x.titulo)).toEqual(["Tiene 1 indicador por reportar con el plazo vencido"]);
    }));

  it("escalamiento: pasados los días de Configuración documental, al jefe y sin nombrar el indicador", () =>
    revertida(sql, async (tx) => {
      const { proceso, admin } = await entorno(tx);
      const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
      const mide = await usuarioDePrueba(tx, { rol: "consulta", jefeId: jefe.usuarioId });
      const a = await indicador(tx, proceso.id, { mide: [mide.usuarioId] });
      const b = await indicador(tx, proceso.id, { mide: [mide.usuarioId] });

      // A los dos días del vencimiento no se escala.
      expect(await pasada(tx, abril(12))).toEqual({ avisados: 2, escalados: 0 });
      expect(await avisosDe(tx, jefe.usuarioId)).toEqual([]);

      expect(await pasada(tx, abril(15))).toEqual({ avisados: 0, escalados: 2 });
      expect(await avisosDe(tx, jefe.usuarioId)).toEqual([
        {
          tipo: "indicadores.escalado",
          titulo: "Reportes de indicadores vencidos",
          cuerpo: `2 reportes de indicadores a cargo de ${mide.nombre} siguen vencidos. Vencieron hace 5 días.`,
          enlace: null,
          entidad: "usuario",
          entidad_id: mide.usuarioId,
        },
      ]);
      for (const x of [a, b]) expect((await marcas(tx, await x.medicion())).escalado_en).toEqual(abril(15));
      expect(await avisosDe(tx, admin.usuarioId)).toEqual([]);
      expect(await pasada(tx, abril(20))).toEqual({ avisados: 0, escalados: 0 });
      expect(await avisosDe(tx, jefe.usuarioId)).toHaveLength(1);
    }));

  it("sin jefe no se escala y la marca queda para cuando lo haya", () =>
    revertida(sql, async (tx) => {
      const { proceso } = await entorno(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const a = await indicador(tx, proceso.id, { mide: [mide.usuarioId] });
      expect(await pasada(tx, abril(15))).toEqual({ avisados: 1, escalados: 0 });
      expect((await marcas(tx, await a.medicion())).escalado_en).toBeNull();
      const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
      await tx`UPDATE usuarios SET jefe_inmediato_id = ${jefe.usuarioId} WHERE id = ${mide.usuarioId}`;
      expect(await pasada(tx, abril(16))).toEqual({ avisados: 0, escalados: 1 });
      expect((await avisosDe(tx, jefe.usuarioId)).map((x) => x.cuerpo)).toEqual([
        `1 reporte de indicadores a cargo de ${mide.nombre} sigue vencido. Venció hace 6 días.`,
      ]);
    }));

  it("nada para históricos, «no aplica» ni cerradas; cada aviso sale una sola vez", () =>
    revertida(sql, async (tx) => {
      const { proceso } = await entorno(tx);
      const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
      const mide = await usuarioDePrueba(tx, { rol: "consulta", jefeId: jefe.usuarioId });
      const con = { mide: [mide.usuarioId] };
      // Aprobado después de terminar marzo: marzo es histórico.
      const historico = await indicador(tx, proceso.id, { ...con, aprobadaEn: new Date("2003-04-02T15:00:00Z") });
      const noAplica = await indicador(tx, proceso.id, con);
      await marcarNoAplica(mide, { medicionId: await noAplica.medicion(), motivo: "No hubo casos en marzo" }, { sql: tx, ahora: abril(5) });
      const cerrada = await indicador(tx, proceso.id, con);
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id = ${await cerrada.medicion()}`;

      for (const d of [8, 12, 20]) expect(await pasada(tx, abril(d)), `${d} de abril`).toEqual({ avisados: 0, escalados: 0 });
      expect(await avisosDe(tx, mide.usuarioId)).toEqual([]);
      expect(await avisosDe(tx, jefe.usuarioId)).toEqual([]);
      for (const x of [historico, noAplica, cerrada]) {
        expect(await marcas(tx, await x.medicion())).toEqual({ aviso_previo_en: null, aviso_vencido_en: null, escalado_en: null });
      }

      // Una ordinaria: cada aviso, una sola vez, aunque la pasada corra varias veces el mismo día.
      const ordinaria = await (await indicador(tx, proceso.id, con)).medicion();
      for (const d of [8, 8, 12, 12, 20, 20]) await pasada(tx, abril(d));
      expect((await avisosDe(tx, mide.usuarioId)).map((x) => x.tipo)).toEqual(["indicadores.por_vencer", "indicadores.vencido"]);
      expect((await avisosDe(tx, jefe.usuarioId)).map((x) => x.tipo)).toEqual(["indicadores.escalado"]);
      // Lo hace el sistema: sin fila en `auditoria`.
      expect(await tx`SELECT 1 FROM auditoria WHERE entidad = 'medicion' AND entidad_id = ${ordinaria}`).toHaveLength(0);
    }));

  it("revisarVencimientos la corre después de las demás y suma lo suyo", () =>
    revertida(sql, async (tx) => {
      const { proceso } = await entorno(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      await indicador(tx, proceso.id, { mide: [mide.usuarioId] });
      expect(await revisarVencimientos({ sql: tx, ahora: abril(12) })).toEqual({ avisados: 1, escalados: 0 });
      expect((await avisosDe(tx, mide.usuarioId)).map((x) => x.tipo)).toEqual(["indicadores.vencido"]);
    }));
});
