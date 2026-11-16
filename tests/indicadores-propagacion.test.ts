/**
 * La propagación de los datos compartidos (anexo 14C, §3.2 a §3.4; Tarea 11 de la 14C): cuando el responsable de un dato lo
 * reporta o lo corrige, su valor, juntado a la periodicidad de cada indicador que lo usa y con su fracción exacta, llega a
 * cada medición abierta que lo espera, que entonces se calcula sola. Una transacción por medición: la que falla se registra
 * y se salta. Contra la BD de desarrollo, dentro de una transacción que se revierte y con `ahora` inyectado.
 *
 * El mixto es el de `indicadores-medicion-mixta.test.ts`: mensual desde septiembre de 2026, aprobado el 15 de agosto, con A
 * propia («Valor glosado en el mes») y B el dato compartido mensual «Total facturado…»: forma «porcentaje», meta 90 y
 * umbral 70. Septiembre vence el 10 de octubre. 38.529.000 de 1.284.300.000 es el 3 % (crítico); de 40.000.000, el 96 %.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql, type Cliente } from "@/db/cliente";
import { CONFIG_DOCUMENTAL_DEFECTO } from "@/db/consultas/config-documental";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { tomarCalculo } from "@/db/consultas/indicadores/calculos";
import { asegurarPeriodosDeDatos, reportarDato } from "@/db/consultas/indicadores/datos-periodos";
import { basesDe, leerPeriodos } from "@/db/consultas/indicadores/lectura";
import {
  asegurarMediciones,
  marcarNoAplica,
  MOTIVO_RESERVADO,
  NO_APLICA_DEL_SISTEMA,
  quitarNoAplica,
  reportar,
} from "@/db/consultas/indicadores/mediciones";
import { cambiarOperacion } from "@/db/consultas/indicadores/operacion";
import { listarIndicadores } from "@/db/consultas/indicadores/lista";
import { asegurarMedicionesConFuentes, propagar, propagarSinFallar, valorDeDato } from "@/db/consultas/indicadores/propagacion";
import { columnasDePendiente, esPendiente, queFalta, tareasDeIndicadores } from "@/db/consultas/indicadores/tareas";
import { revisarVencimientosDeIndicadores } from "@/db/consultas/indicadores/vencimientos";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { aTexto } from "@/lib/indicadores/formula/fraccion";
import { historialDeCorreccion } from "@/lib/indicadores/historial";
import { fechaLimiteDeReporte } from "@/lib/indicadores/periodos";
import { ErrorIndicador, MOTIVO_NADA_QUE_MEDIR, MOTIVOS_DEL_SISTEMA } from "@/lib/indicadores/tipos";
import { fechaLimite } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import {
  datoDePrueba,
  indicadorDePrueba,
  periodoDeDatoDePrueba,
  silenciarIndicadores,
  versionNueva,
  type OpcionesIndicadorDePrueba,
} from "./utiles/indicadores";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
const ZONA = zonaHoraria();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
});

let consecutivo = 0;
const unico = () => `${Date.now() % 100_000_000}${(consecutivo += 1)}`;

const AHORA = new Date("2026-10-05T15:00:00Z");
/** Pasada la fecha límite de septiembre (el 10 de octubre). */
const TARDE = new Date("2026-10-20T15:00:00Z");
const APROBADA = new Date("2026-08-15T15:00:00Z");
const GLOSADO = "Valor glosado en el mes";
const config = { ...CONFIG_DOCUMENTAL_DEFECTO, escalamientoDias: 3 };
/** La fecha límite de septiembre con el plazo de 10 días. */
const VENCE_SEPTIEMBRE = fechaLimiteDeReporte(periodoDe("2026-09", ZONA)!, 10, ZONA);

const sinCambios = { escritas: 0, noAplica: 0, fallidas: 0 };

const propagarA = (tx: TransactionSql, ahora: Date, indicadorIds?: number[]) =>
  propagar({ sql: tx, ahora, ...(indicadorIds ? { indicadorIds } : {}) });

const fila = async (tx: TransactionSql, medicionId: number) => (await tx`SELECT * FROM mediciones WHERE id = ${medicionId}`)[0];

const eventos = async (tx: TransactionSql, medicionId: number) =>
  (await tx`SELECT tipo, usuario_id, detalle FROM medicion_eventos WHERE medicion_id = ${medicionId} ORDER BY id`).map((e) => ({
    tipo: e.tipo as string,
    usuarioId: e.usuario_id === null ? null : Number(e.usuario_id),
    detalle: e.detalle as Record<string, unknown>,
  }));

/** Las filas de valores de la medición, por letra: el valor, su fracción exacta y quién lo puso. */
const valores = async (tx: TransactionSql, medicionId: number) =>
  Object.fromEntries(
    (
      await tx`SELECT iv.letra, mv.variable_id, mv.valor::text AS valor, mv.valor_exacto, mv.reportado_por
        FROM medicion_valores mv JOIN indicador_variables iv ON iv.id = mv.variable_id
        WHERE mv.medicion_id = ${medicionId} AND mv.categoria_id IS NULL ORDER BY iv.letra`
    ).map((v) => [
      v.letra as string,
      {
        variableId: Number(v.variable_id),
        valor: v.valor as string,
        exacto: (v.valor_exacto as string | null) ?? null,
        por: v.reportado_por === null ? null : Number(v.reportado_por),
      },
    ]),
  );

/** Lo que le falta a la medición según `queFalta`, como la leen las tareas y la pasada; `null` si no está pendiente. */
async function falta(tx: TransactionSql, medicionId: number) {
  const filas = await tx`SELECT ${columnasDePendiente(tx)} FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id
    WHERE m.id = ${medicionId} AND ${esPendiente(tx)}`;
  return queFalta(filas).get(medicionId)?.falta ?? null;
}

const avisos = async (tx: TransactionSql, medicionId: number) =>
  (await tx`SELECT tipo, titulo, usuario_id FROM notificaciones WHERE entidad = 'medicion' AND entidad_id = ${medicionId} ORDER BY id`).map(
    (n) => ({ tipo: n.tipo as string, titulo: n.titulo as string, usuarioId: Number(n.usuario_id) }),
  );

async function procesoNuevo(tx: TransactionSql): Promise<number> {
  const sigla = `Z${unico()}`;
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${`Proceso ${sigla}`}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id`;
  return Number(p.id);
}

const medicionDe = async (tx: TransactionSql, indicadorId: number, periodo: string) =>
  Number((await tx`SELECT id FROM mediciones WHERE indicador_id = ${indicadorId} AND periodo = ${periodo}`)[0].id);

/**
 * Reporta (o corrige) el periodo del dato como su responsable, a `ahora`, abriéndolo antes si hace falta
 * (`asegurarPeriodosDeDatos`). Devuelve el id del periodo.
 */
async function reportarElDato(tx: TransactionSql, responsable: SesionFlujo, datoId: number, periodo: string, valor: string, ahora = AHORA) {
  await asegurarPeriodosDeDatos({ sql: tx, ahora, datoIds: [datoId] });
  const [p] = await tx`SELECT id FROM variable_valores WHERE variable_id = ${datoId} AND periodo = ${periodo}`;
  expect(p, `el periodo ${periodo} del dato debía estar abierto`).toBeDefined();
  expect(await reportarDato(responsable, { periodoId: Number(p.id), valor, confirmado: true }, { sql: tx, ahora })).toMatchObject({ ok: true });
  return Number(p.id);
}

const reportarLoMio = (tx: TransactionSql, sesion: SesionFlujo, medicionId: number, v: Record<string, string>, ahora = AHORA) =>
  reportar(sesion, { medicionId, valores: v, parcial: false, confirmado: true }, { sql: tx, ahora });

/** El mixto de la cabecera, con quien mide, quien analiza y el responsable del dato; `o` cambia lo que haga falta. */
async function mixto(tx: TransactionSql, o: OpcionesIndicadorDePrueba = {}) {
  const procesoId = await procesoNuevo(tx);
  const mide = await usuarioDePrueba(tx, { rol: "consulta" });
  const analiza = await usuarioDePrueba(tx, { rol: "consulta" });
  const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
  const datoId = await datoDePrueba(tx, { procesoId, nombre: `Total facturado ${unico()}`, responsables: [responsable.usuarioId] });
  const ind = await indicadorDePrueba(tx, {
    procesoId,
    periodicidad: "mensual",
    inicioMedicion: "2026-09",
    aprobadaEn: APROBADA,
    mide: [mide.usuarioId],
    analiza: [analiza.usuarioId],
    variables: { A: { nombre: GLOSADO }, B: { datoId } },
    ...o,
  });
  await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: ind.id });
  return { procesoId, mide, analiza, responsable, datoId, ind, medicion: await medicionDe(tx, ind.id, "2026-09") };
}

/** Un indicador mensual desde septiembre con sus dos variables de datos compartidos, del mismo responsable: nadie lo mide. */
async function sinPropias(tx: TransactionSql, o: OpcionesIndicadorDePrueba & { inicioMedicion?: string } = {}) {
  const procesoId = o.procesoId ?? (await procesoNuevo(tx));
  const analiza = await usuarioDePrueba(tx, { rol: "consulta" });
  const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
  const datoA = await datoDePrueba(tx, { procesoId, nombre: `Glosas ${unico()}`, responsables: [responsable.usuarioId] });
  const datoB = await datoDePrueba(tx, { procesoId, nombre: `Facturado ${unico()}`, responsables: [responsable.usuarioId] });
  const ind = await indicadorDePrueba(tx, {
    procesoId,
    periodicidad: "mensual",
    inicioMedicion: "2026-09",
    aprobadaEn: APROBADA,
    analiza: [analiza.usuarioId],
    variables: { A: { datoId: datoA }, B: { datoId: datoB } },
    ...o,
  });
  await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: ind.id });
  return { procesoId, analiza, responsable, datoA, datoB, ind, medicion: await medicionDe(tx, ind.id, o.inicioMedicion ?? "2026-09") };
}

describe("el dato llega", () => {
  it("copia el valor sin usuario, calcula, deja el evento del sistema y la alerta; otra vez no escribe nada", () =>
    revertida(sql, async (tx) => {
      // La última pasada recorre todo: lo que traiga la base no le da trabajo.
      await silenciarIndicadores(tx);
      const { mide, analiza, responsable, datoId, ind, medicion } = await mixto(tx);
      expect(await reportarLoMio(tx, mide, medicion, { A: "38529000" })).toMatchObject({ ok: true, faltaDato: true });
      await reportarElDato(tx, responsable, datoId, "2026-09", "1284300000");

      expect(await propagarA(tx, AHORA, [ind.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 0 });
      const v = await valores(tx, medicion);
      expect(v.B).toEqual({ variableId: ind.variables.B, valor: "1284300000", exacto: null, por: null });
      // No borra lo digitado: A sigue con quien la reportó.
      expect(v.A).toMatchObject({ valor: "38529000", por: mide.usuarioId });
      const m = await fila(tx, medicion);
      expect([m.resultado_exacto, m.semaforo, m.estado]).toEqual(["3/1", "critico", "abierta"]);
      // En un mixto, «reportada» es de quien mide: el sistema no la toca.
      expect(m.reportada_por).toBe(mide.usuarioId);
      const [reporte, propagacion] = await eventos(tx, medicion);
      expect(reporte.tipo).toBe("reporte");
      expect(propagacion).toMatchObject({
        tipo: "propagacion",
        usuarioId: null,
        detalle: { fuentes: [{ letra: "B", clase: "dato", id: datoId, antes: null, despues: "1284300000" }] },
      });
      expect(propagacion.detalle.antes).toMatchObject({ A: "38529000", B: null, resultado: null });
      expect(propagacion.detalle.despues).toMatchObject({ A: "38529000", B: "1284300000", semaforo: "critico" });
      expect(propagacion.detalle).not.toHaveProperty("venceEn");
      expect((await avisos(tx, medicion)).filter((a) => a.tipo === "indicadores.alerta").map((a) => a.usuarioId)).toContain(analiza.usuarioId);
      expect(await falta(tx, medicion)).toBe("analisis");

      // Idempotente: nada difiere de lo copiado.
      expect(await propagarA(tx, AHORA, [ind.id])).toEqual(sinCambios);
      expect(await propagarA(tx, AHORA)).toEqual(sinCambios);
      expect(await eventos(tx, medicion)).toHaveLength(2);
    }));

  it("en un mixto que aún no reporta lo suyo, copia el dato y no lo da por reportado: la tarea de quien mide sigue", () =>
    revertida(sql, async (tx) => {
      const { mide, responsable, datoId, ind, medicion } = await mixto(tx);
      await reportarElDato(tx, responsable, datoId, "2026-09", "1284300000");
      expect(await propagarA(tx, AHORA, [ind.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 0 });
      expect((await valores(tx, medicion)).B).toMatchObject({ valor: "1284300000", por: null });
      const m = await fila(tx, medicion);
      expect([m.reportada_en, m.reportada_por, m.resultado_exacto]).toEqual([null, null, null]);
      expect(await falta(tx, medicion)).toBe("reporte");
      expect((await tareasDeIndicadores(mide, { sql: tx, ahora: AHORA })).tareas.map((t) => t.id)).toContain(`medir:${medicion}`);
      // El evento deja constancia del valor que llegó.
      expect((await eventos(tx, medicion)).map((e) => e.tipo)).toEqual(["propagacion"]);
      // Lo mío llega después y el resultado sale al reportarlo.
      expect(await reportarLoMio(tx, mide, medicion, { A: "38529000" })).toMatchObject({ ok: true, semaforo: "critico", faltaDato: false });
    }));

  it("con la fracción exacta: un promedio que no cabe en cuatro decimales decide «cumple» con su razón exacta", () =>
    revertida(sql, async (tx) => {
      const procesoId = await procesoNuevo(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const datoId = await datoDePrueba(tx, { procesoId, consolidacion: "promedio", responsables: [responsable.usuarioId] });
      const ind = await indicadorDePrueba(tx, {
        procesoId,
        periodicidad: "trimestral",
        inicioMedicion: "2026-T3",
        aprobadaEn: new Date("2026-06-15T15:00:00Z"),
        formula: "A / B * 100000",
        meta: "33333",
        mide: [mide.usuarioId],
        variables: { A: { datoId }, B: { nombre: "Días del trimestre" } },
      });
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: ind.id });
      const medicion = await medicionDe(tx, ind.id, "2026-T3");
      expect(await reportarLoMio(tx, mide, medicion, { B: "7" })).toMatchObject({ ok: true, faltaDato: true });
      for (const [mes, valor] of [["2026-07", "2"], ["2026-08", "2"], ["2026-09", "3"]] as const) {
        await reportarElDato(tx, responsable, datoId, mes, valor);
      }
      const juntado = await valorDeDato(tx, { datoId, consolidacion: "promedio", datoPeriodicidad: "mensual", periodo: "2026-T3" });
      expect(juntado.estado === "listo" ? [aTexto(juntado.valor), juntado.periodos.length] : juntado).toEqual(["7/3", 3]);

      expect(await propagarA(tx, AHORA, [ind.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 0 });
      expect((await valores(tx, medicion)).A).toMatchObject({ valor: "2.3333", exacto: "7/3", por: null });
      // 7/3 ÷ 7 × 100000 = 33333,33…: cumple. Con 2,3333 sería 33332,86 y no cumpliría.
      const m = await fila(tx, medicion);
      expect([m.resultado_exacto, m.semaforo, m.cumple, m.estado]).toEqual(["100000/3", "bien", true, "reportada"]);
      // Las lecturas también la prefieren.
      const [leido] = (await leerPeriodos(tx, await basesDe(tx, [ind.id]), { desde: 2026, hasta: 2026 }, AHORA)).get(ind.id)!.filter(
        (p) => p.periodo.clave === "2026-T3",
      );
      expect(aTexto(leido.valores.A)).toBe("7/3");
    }));

  it("con dos de los tres meses del dato no copia nada: la medición sigue en «Falta un dato»", () =>
    revertida(sql, async (tx) => {
      const procesoId = await procesoNuevo(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const datoId = await datoDePrueba(tx, { procesoId, responsables: [responsable.usuarioId] });
      const ind = await indicadorDePrueba(tx, {
        procesoId,
        periodicidad: "trimestral",
        inicioMedicion: "2026-T3",
        aprobadaEn: new Date("2026-06-15T15:00:00Z"),
        mide: [mide.usuarioId],
        variables: { B: { datoId } },
      });
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: ind.id });
      const medicion = await medicionDe(tx, ind.id, "2026-T3");
      await reportarLoMio(tx, mide, medicion, { A: "5" });
      await reportarElDato(tx, responsable, datoId, "2026-07", "10");
      await reportarElDato(tx, responsable, datoId, "2026-09", "10");
      expect(await valorDeDato(tx, { datoId, consolidacion: "suma", datoPeriodicidad: "mensual", periodo: "2026-T3" })).toEqual({ estado: "falta" });
      expect(await propagarA(tx, AHORA, [ind.id])).toEqual(sinCambios);
      expect(await valores(tx, medicion)).not.toHaveProperty("B");
      expect(await falta(tx, medicion)).toBe("dato");

      // Con el tercero, la suma de los tres.
      await reportarElDato(tx, responsable, datoId, "2026-08", "10");
      expect(await propagarA(tx, AHORA, [ind.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 0 });
      expect((await valores(tx, medicion)).B).toMatchObject({ valor: "30", exacto: null });
    }));
});

describe("la corrección del dato", () => {
  it("recalcula con el valor nuevo y, si cambia el color, sale el aviso de «Corrección»", () =>
    revertida(sql, async (tx) => {
      const { mide, analiza, responsable, datoId, ind, medicion } = await mixto(tx);
      await reportarLoMio(tx, mide, medicion, { A: "38529000" });
      await reportarElDato(tx, responsable, datoId, "2026-09", "1284300000");
      await propagarA(tx, AHORA, [ind.id]);
      expect((await fila(tx, medicion)).semaforo).toBe("critico");

      await reportarElDato(tx, responsable, datoId, "2026-09", "40000000", TARDE);
      expect(await propagarA(tx, TARDE, [ind.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 0 });
      expect((await valores(tx, medicion)).B).toMatchObject({ valor: "40000000", por: null });
      const m = await fila(tx, medicion);
      expect([m.semaforo, m.cumple, m.estado]).toEqual(["bien", true, "reportada"]);
      const ultimo = (await eventos(tx, medicion)).at(-1)!;
      expect(ultimo.detalle.fuentes).toEqual([{ letra: "B", clase: "dato", id: datoId, antes: "1284300000", despues: "40000000" }]);
      const correccion = (await avisos(tx, medicion)).filter((a) => a.tipo === "indicadores.correccion");
      expect(correccion.map((a) => a.usuarioId)).toContain(analiza.usuarioId);
      expect(correccion[0].titulo).toMatch(/^Corrección: .* pasó de Crítico a Bien\./);
    }));

  it("tras un cambio menor, escribe donde calcula la medición: el valor corregido llega al resultado y no se reescribe", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const { mide, responsable, datoId, ind, medicion } = await mixto(tx);
      await reportarLoMio(tx, mide, medicion, { A: "38529000" });
      await reportarElDato(tx, responsable, datoId, "2026-09", "1284300000");
      await propagarA(tx, AHORA, [ind.id]);
      const v2 = await versionNueva(tx, {
        indicadorId: ind.id,
        usuarioId: admin.usuarioId,
        tipoCambio: "menor",
        rigeDesde: "2026-09",
        aprobadaEn: AHORA,
        variables: { A: { nombre: GLOSADO }, B: { datoId } },
      });

      await reportarElDato(tx, responsable, datoId, "2026-09", "40000000", TARDE);
      expect(await propagarA(tx, TARDE, [ind.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 0 });
      expect((await fila(tx, medicion)).semaforo).toBe("bien");
      // Una sola fila de B: la de la versión con que se calculó la medición.
      const filasDeB = await tx`SELECT variable_id, valor::text AS valor FROM medicion_valores WHERE medicion_id = ${medicion}
        AND variable_id IN ${tx([ind.variables.B, v2.variables.B])}`;
      expect(filasDeB.map((f) => [Number(f.variable_id), f.valor])).toEqual([[ind.variables.B, "40000000"]]);
      expect(await propagarA(tx, TARDE, [ind.id])).toEqual(sinCambios);
    }));
});

describe("la fuente pierde su valor", () => {
  /** Deja el periodo del dato como pendiente y sin valor (como podría dejarlo una reapertura del dato). */
  const sinValor = (tx: TransactionSql, periodoId: number) =>
    tx`UPDATE variable_valores SET estado = 'pendiente', valor = NULL, reportado_por = NULL, reportado_en = NULL WHERE id = ${periodoId}`;

  it("quita la fila copiada y la medición vuelve a esperar el dato; otra vez no escribe nada", () =>
    revertida(sql, async (tx) => {
      const { mide, responsable, datoId, ind, medicion } = await mixto(tx);
      await reportarLoMio(tx, mide, medicion, { A: "38529000" });
      const periodoId = await reportarElDato(tx, responsable, datoId, "2026-09", "1284300000");
      await propagarA(tx, AHORA, [ind.id]);
      expect((await fila(tx, medicion)).resultado_exacto).toBe("3/1");

      await sinValor(tx, periodoId);
      expect(await propagarA(tx, TARDE, [ind.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 0 });
      expect(await valores(tx, medicion)).not.toHaveProperty("B");
      expect((await valores(tx, medicion)).A).toMatchObject({ valor: "38529000", por: mide.usuarioId });
      const m = await fila(tx, medicion);
      expect([m.resultado_exacto, m.semaforo, m.estado]).toEqual([null, null, "abierta"]);
      expect(await falta(tx, medicion)).toBe("dato");
      expect((await eventos(tx, medicion)).at(-1)!.detalle.fuentes).toEqual([
        { letra: "B", clase: "dato", id: datoId, antes: "1284300000", despues: null },
      ]);
      expect(await propagarA(tx, TARDE, [ind.id])).toEqual(sinCambios);
    }));

  it("en lo que nadie mide, quita también el «No aplica» del sistema", () =>
    revertida(sql, async (tx) => {
      const { responsable, datoA, datoB, ind, medicion } = await sinPropias(tx);
      await reportarElDato(tx, responsable, datoA, "2026-09", "5");
      const periodoB = await reportarElDato(tx, responsable, datoB, "2026-09", "0");
      expect(await propagarA(tx, AHORA, [ind.id])).toEqual({ escritas: 0, noAplica: 1, fallidas: 0 });

      await sinValor(tx, periodoB);
      expect(await propagarA(tx, TARDE, [ind.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 0 });
      const m = await fila(tx, medicion);
      expect([m.no_aplica, m.no_aplica_motivo, m.resultado_exacto, m.estado]).toEqual([false, null, null, "abierta"]);
      expect(Object.keys(await valores(tx, medicion))).toEqual(["A"]);
      expect(await falta(tx, medicion)).toBe("dato");
      expect(await propagarA(tx, TARDE, [ind.id])).toEqual(sinCambios);
    }));
});

describe("un indicador sin variables propias: nadie lo mide", () => {
  it("al llegar el último dato queda reportada por el sistema; con B en cero, «No aplica»; al corregir B, se calcula", () =>
    revertida(sql, async (tx) => {
      const { responsable, datoA, datoB, ind, medicion } = await sinPropias(tx);
      const T2 = new Date("2026-10-06T15:00:00Z");
      const T3 = new Date("2026-10-07T15:00:00Z");
      await reportarElDato(tx, responsable, datoA, "2026-09", "5");
      expect(await propagarA(tx, AHORA, [ind.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 0 });
      expect((await fila(tx, medicion)).reportada_en).toBeNull();
      expect(await falta(tx, medicion)).toBe("dato");

      await reportarElDato(tx, responsable, datoB, "2026-09", "0", T2);
      expect(await propagarA(tx, T2, [ind.id])).toEqual({ escritas: 0, noAplica: 1, fallidas: 0 });
      let m = await fila(tx, medicion);
      expect([m.reportada_en, m.reportada_por]).toEqual([T2, null]);
      expect([m.no_aplica, m.no_aplica_motivo, m.estado, m.resultado_exacto]).toEqual([true, MOTIVO_NADA_QUE_MEDIR, "reportada", null]);
      const marcado = (await eventos(tx, medicion)).at(-1)!;
      expect(marcado.detalle.antes).toMatchObject({ noAplica: false, motivo: null });
      expect(marcado.detalle.despues).toMatchObject({ noAplica: true, motivo: MOTIVO_NADA_QUE_MEDIR });
      expect(await propagarA(tx, T2, [ind.id])).toEqual(sinCambios);

      await reportarElDato(tx, responsable, datoB, "2026-09", "20", T3);
      expect(await propagarA(tx, T3, [ind.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 0 });
      m = await fila(tx, medicion);
      expect([m.no_aplica, m.no_aplica_motivo, m.resultado_exacto, m.semaforo]).toEqual([false, null, "25/1", "critico"]);
      // «Reportada» es la primera vez que estuvieron todos.
      expect([m.reportada_en, m.reportada_por]).toEqual([T2, null]);
      expect(await falta(tx, medicion)).toBe("analisis");
    }));

});

describe("el «No aplica» en un mixto", () => {
  const RESERVADO = "Ese motivo lo usa el sistema: escriba el suyo con otras palabras";

  it("cuando el dato que llega en cero completa la medición, la marca el sistema; al corregirlo, se quita y se calcula", () =>
    revertida(sql, async (tx) => {
      const { mide, responsable, datoId, ind, medicion } = await mixto(tx);
      await reportarLoMio(tx, mide, medicion, { A: "38529000" });
      await reportarElDato(tx, responsable, datoId, "2026-09", "0");
      expect(await propagarA(tx, AHORA, [ind.id])).toEqual({ escritas: 0, noAplica: 1, fallidas: 0 });
      let m = await fila(tx, medicion);
      expect([m.no_aplica, m.no_aplica_motivo, m.estado, m.resultado_exacto]).toEqual([true, MOTIVO_NADA_QUE_MEDIR, "reportada", null]);
      // «Reportada» sigue siendo de quien mide.
      expect(m.reportada_por).toBe(mide.usuarioId);
      // Y quien mide no lo quita: se va solo cuando cambie el dato.
      await expect(quitarNoAplica(mide, medicion, { sql: tx, ahora: AHORA })).rejects.toThrow(NO_APLICA_DEL_SISTEMA);

      await reportarElDato(tx, responsable, datoId, "2026-09", "1284300000", TARDE);
      expect(await propagarA(tx, TARDE, [ind.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 0 });
      m = await fila(tx, medicion);
      expect([m.no_aplica, m.no_aplica_motivo, m.resultado_exacto, m.semaforo]).toEqual([false, null, "3/1", "critico"]);
    }));

  it("una persona no puede marcarlo con un motivo que usa el sistema, con otras mayúsculas ni con espacios alrededor", () =>
    revertida(sql, async (tx) => {
      const { mide, medicion } = await mixto(tx);
      await reportarLoMio(tx, mide, medicion, { A: "38529000" });
      expect(MOTIVOS_DEL_SISTEMA).toHaveLength(4);
      for (const reservado of MOTIVOS_DEL_SISTEMA) {
        for (const escrito of [reservado, `  ${reservado.toUpperCase()}  `, reservado.toLowerCase()]) {
          const err = await marcarNoAplica(mide, { medicionId: medicion, motivo: escrito }, { sql: tx, ahora: AHORA }).then(
            () => null,
            (e: unknown) => e,
          );
          expect(err, escrito).toBeInstanceOf(ErrorIndicador);
          expect((err as Error).message).toBe(RESERVADO);
        }
      }
      expect((await fila(tx, medicion)).no_aplica).toBe(false);
      expect(MOTIVO_RESERVADO).toBe(RESERVADO);
    }));

  it("el que puso quien mide con su motivo no lo toca la propagación: con el dato pendiente, en cero o distinto de cero", () =>
    revertida(sql, async (tx) => {
      const { mide, responsable, datoId, ind, medicion } = await mixto(tx);
      const MOTIVO = "Sin glosas en el mes";
      await reportarLoMio(tx, mide, medicion, { A: "38529000" });
      await marcarNoAplica(mide, { medicionId: medicion, motivo: MOTIVO }, { sql: tx, ahora: AHORA });
      const marca = async () => {
        const m = await fila(tx, medicion);
        return [m.no_aplica, m.no_aplica_motivo, m.reportada_por];
      };
      const sigue = [true, MOTIVO, mide.usuarioId];

      // El dato pendiente (abierto, sin reportar).
      await asegurarPeriodosDeDatos({ sql: tx, ahora: AHORA, datoIds: [datoId] });
      expect(await propagarA(tx, AHORA, [ind.id])).toEqual(sinCambios);
      expect(await marca()).toEqual(sigue);
      // En cero: completa la medición y la fórmula divide por cero.
      await reportarElDato(tx, responsable, datoId, "2026-09", "0");
      expect(await propagarA(tx, AHORA, [ind.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 0 });
      expect(await marca()).toEqual(sigue);
      // Distinto de cero.
      await reportarElDato(tx, responsable, datoId, "2026-09", "1284300000", TARDE);
      expect(await propagarA(tx, TARDE, [ind.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 0 });
      expect(await marca()).toEqual(sigue);
      expect((await valores(tx, medicion)).B).toMatchObject({ valor: "1284300000", por: null });
    }));
});

describe("lo que no se toca", () => {
  it("ni una medición histórica, ni una cerrada, ni la de un indicador retirado", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      // Julio terminó antes de aprobarse la ficha: es histórico.
      const historico = await sinPropias(tx, { inicioMedicion: "2026-07" });
      for (const datoId of [historico.datoA, historico.datoB]) await periodoDeDatoDePrueba(tx, { datoId, periodo: "2026-07", valor: "5", ahora: AHORA });
      expect((await fila(tx, historico.medicion)).historica).toBe(true);

      const cerrado = await mixto(tx);
      await reportarLoMio(tx, cerrado.mide, cerrado.medicion, { A: "38529000" });
      await reportarElDato(tx, cerrado.responsable, cerrado.datoId, "2026-09", "1284300000");
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id = ${cerrado.medicion}`;

      const retirado = await mixto(tx);
      await reportarLoMio(tx, retirado.mide, retirado.medicion, { A: "38529000" });
      await reportarElDato(tx, retirado.responsable, retirado.datoId, "2026-09", "1284300000");
      await tx`UPDATE indicadores SET estado = 'retirado', baja_por = ${admin.usuarioId}, baja_en = ${AHORA}, baja_motivo = 'Ya no se mide'
        WHERE id = ${retirado.ind.id}`;

      expect(await propagarA(tx, AHORA, [historico.ind.id, cerrado.ind.id, retirado.ind.id])).toEqual(sinCambios);
      expect(await valores(tx, historico.medicion)).toEqual({});
      expect(await valores(tx, cerrado.medicion)).not.toHaveProperty("B");
      expect(await valores(tx, retirado.medicion)).not.toHaveProperty("B");
    }));
});

describe("el plazo del análisis", () => {
  it("el dato que llega tarde y no cumple cuenta el plazo desde hoy; si cumple, no lo mueve", () =>
    revertida(sql, async (tx) => {
      const noCumple = await mixto(tx);
      await reportarLoMio(tx, noCumple.mide, noCumple.medicion, { A: "38529000" });
      await tx`UPDATE mediciones SET aviso_previo_en = ${AHORA}, aviso_vencido_en = ${AHORA} WHERE id = ${noCumple.medicion}`;
      await reportarElDato(tx, noCumple.responsable, noCumple.datoId, "2026-09", "1284300000", TARDE);
      await propagarA(tx, TARDE, [noCumple.ind.id]);
      const movida = fechaLimite(TARDE, 10, ZONA);
      let m = await fila(tx, noCumple.medicion);
      expect(m.vence_en).toEqual(movida);
      expect(m.vence_en.getTime()).toBeGreaterThan(TARDE.getTime());
      expect([m.aviso_previo_en, m.aviso_vencido_en, m.escalado_en]).toEqual([null, null, null]);
      expect((await eventos(tx, noCumple.medicion)).at(-1)!.detalle.venceEn).toBe(movida.toISOString());

      const cumple = await mixto(tx);
      await reportarLoMio(tx, cumple.mide, cumple.medicion, { A: "38529000" });
      await reportarElDato(tx, cumple.responsable, cumple.datoId, "2026-09", "40000000", TARDE);
      await propagarA(tx, TARDE, [cumple.ind.id]);
      m = await fila(tx, cumple.medicion);
      expect([m.estado, m.vence_en]).toEqual(["reportada", VENCE_SEPTIEMBRE]);
      expect((await eventos(tx, cumple.medicion)).at(-1)!.detalle).not.toHaveProperty("venceEn");
    }));

  it("una corrección que la deja pidiendo el análisis con la fecha ya pasada la mueve otra vez; si ya lo pedía, no; el plazo nuevo cuenta desde la última", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const { mide, responsable, datoId, ind, medicion } = await mixto(tx);
      const plazo = (dias: number, ahora: Date) =>
        cambiarOperacion(
          admin,
          { indicadorId: ind.id, plazoReporteDias: dias, inicioMedicion: "2026-09", soporteObligatorio: false, nivelAcceso: "general" },
          { sql: tx, ahora },
        );
      const corregir = async (valor: string, ahora: Date) => {
        await reportarElDato(tx, responsable, datoId, "2026-09", valor, ahora);
        await propagarA(tx, ahora, [ind.id]);
        return fila(tx, medicion);
      };
      await reportarLoMio(tx, mide, medicion, { A: "38529000" });

      // Llega tarde y no cumple: se mueve desde el 20 de octubre; el plazo de 5 días cuenta desde ahí.
      expect((await corregir("1284300000", TARDE)).vence_en).toEqual(fechaLimite(TARDE, 10, ZONA));
      await plazo(5, new Date("2026-10-21T15:00:00Z"));
      expect((await fila(tx, medicion)).vence_en).toEqual(fechaLimite(TARDE, 5, ZONA));

      // Cumple: queda reportada y conserva su fecha.
      const nov10 = new Date("2026-11-10T15:00:00Z");
      expect(await corregir("40000000", nov10)).toMatchObject({ estado: "reportada", vence_en: fechaLimite(TARDE, 5, ZONA) });

      // Deja de cumplir con la fecha ya pasada: se mueve otra vez, desde la corrección.
      const nov20 = new Date("2026-11-20T15:00:00Z");
      expect((await corregir("1284300000", nov20)).vence_en).toEqual(fechaLimite(nov20, 5, ZONA));
      expect((await eventos(tx, medicion)).at(-1)!.detalle.venceEn).toBe(fechaLimite(nov20, 5, ZONA).toISOString());

      // Ya lo pedía: otra cifra que no cumple no la mueve.
      const dic10 = new Date("2026-12-10T15:00:00Z");
      expect((await corregir("1000000000", dic10)).vence_en).toEqual(fechaLimite(nov20, 5, ZONA));
      expect((await eventos(tx, medicion)).at(-1)!.detalle).not.toHaveProperty("venceEn");

      // Otro plazo cuenta desde la última vez que la fuente la movió.
      await plazo(7, dic10);
      expect((await fila(tx, medicion)).vence_en).toEqual(fechaLimite(nov20, 7, ZONA));
    }));
});

describe("«Reportes a tiempo» ante el plazo que mueve la fuente", () => {
  /** «Reportes a tiempo» del proceso para las mediciones cuyo reporte vencía en el mes `clave`. */
  const reportesDe = (tx: TransactionSql, procesoId: number, clave: string) => {
    const mes = periodoDe(clave, ZONA)!;
    return tomarCalculo(tx, {
      clave: "reportes_a_tiempo",
      alcance: "proceso",
      procesoId,
      indicadorId: 0,
      periodo: { clave: mes.clave, desde: mes.desde, hasta: mes.hasta },
      ahora: new Date("2026-12-12T15:00:00Z"),
    });
  };

  it("un reporte tardío no pasa a «a tiempo» porque el dato llegue después", () =>
    revertida(sql, async (tx) => {
      const x = await mixto(tx);
      // Septiembre vencía el 10 de octubre: quien mide reporta lo suyo el 12, tarde.
      await reportarLoMio(tx, x.mide, x.medicion, { A: "38529000" }, new Date("2026-10-12T15:00:00Z"));
      expect(await reportesDe(tx, x.procesoId, "2026-10")).toEqual({ A: "0", B: "1" });

      // El dato llega el 20 y el resultado no cumple (3 %): el plazo del análisis se cuenta desde ese día.
      await reportarElDato(tx, x.responsable, x.datoId, "2026-09", "1284300000", TARDE);
      await propagarA(tx, TARDE, [x.ind.id]);
      const m = await fila(tx, x.medicion);
      expect(m.vence_en).toEqual(fechaLimite(TARDE, 10, ZONA));

      expect(await reportesDe(tx, x.procesoId, "2026-10")).toEqual({ A: "0", B: "1" });
      // El evento guarda la fecha contra la que se juzga el reporte.
      expect((await eventos(tx, x.medicion)).at(-1)!.detalle.venceAntes).toBe(VENCE_SEPTIEMBRE.toISOString());
    }));

  it("el reporte puntual cuyo dato llega al mes siguiente no cambia de ventana ni cuenta dos veces", () =>
    revertida(sql, async (tx) => {
      const x = await mixto(tx);
      await reportarLoMio(tx, x.mide, x.medicion, { A: "38529000" });
      expect(await reportesDe(tx, x.procesoId, "2026-10")).toEqual({ A: "1", B: "1" });
      expect(await reportesDe(tx, x.procesoId, "2026-11")).toEqual({ A: "0", B: "0" });

      // El dato llega el 5 de noviembre, con la foto de octubre ya tomada: el plazo del análisis pasa a noviembre.
      const NOVIEMBRE = new Date("2026-11-05T15:00:00Z");
      await reportarElDato(tx, x.responsable, x.datoId, "2026-09", "1284300000", NOVIEMBRE);
      await propagarA(tx, NOVIEMBRE, [x.ind.id]);
      expect((await fila(tx, x.medicion)).vence_en).toEqual(fechaLimite(NOVIEMBRE, 10, ZONA));

      expect(await reportesDe(tx, x.procesoId, "2026-10")).toEqual({ A: "1", B: "1" });
      expect(await reportesDe(tx, x.procesoId, "2026-11")).toEqual({ A: "0", B: "0" });
    }));

  it("cuenta la primera fecha: una segunda corrección que vuelve a mover el plazo no cambia contra qué se juzga", () =>
    revertida(sql, async (tx) => {
      const x = await mixto(tx);
      await reportarLoMio(tx, x.mide, x.medicion, { A: "38529000" }, new Date("2026-10-12T15:00:00Z"));
      const corregir = async (valor: string, ahora: Date) => {
        await reportarElDato(tx, x.responsable, x.datoId, "2026-09", valor, ahora);
        await propagarA(tx, ahora, [x.ind.id]);
      };
      await corregir("1284300000", TARDE);
      await corregir("40000000", new Date("2026-11-10T15:00:00Z"));
      // Deja de cumplir con la fecha (30 de octubre) ya pasada: se mueve otra vez, y ese evento guarda el 30 de octubre.
      const nov20 = new Date("2026-11-20T15:00:00Z");
      await corregir("1284300000", nov20);
      expect((await fila(tx, x.medicion)).vence_en).toEqual(fechaLimite(nov20, 10, ZONA));

      expect(await reportesDe(tx, x.procesoId, "2026-10")).toEqual({ A: "0", B: "1" });
      expect(await reportesDe(tx, x.procesoId, "2026-11")).toEqual({ A: "0", B: "0" });
      expect((await eventos(tx, x.medicion)).at(-1)!.detalle.venceAntes).toBe(fechaLimite(TARDE, 10, ZONA).toISOString());
    }));
});

describe("una falla no corta la pasada", () => {
  it("la medición que no se puede calcular se registra y se salta; las demás se propagan", () =>
    revertida(sql, async (tx) => {
      const errores = vi.spyOn(console, "error").mockImplementation(() => {});
      const bueno = await sinPropias(tx);
      // La misma ficha, con una fórmula que no se puede calcular, y los mismos datos.
      const roto = await indicadorDePrueba(tx, {
        procesoId: bueno.procesoId,
        periodicidad: "mensual",
        inicioMedicion: "2026-09",
        aprobadaEn: APROBADA,
        formula: "A / ",
        variables: { A: { datoId: bueno.datoA }, B: { datoId: bueno.datoB } },
      });
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: roto.id });
      const deRoto = await medicionDe(tx, roto.id, "2026-09");
      await reportarElDato(tx, bueno.responsable, bueno.datoA, "2026-09", "5");
      await reportarElDato(tx, bueno.responsable, bueno.datoB, "2026-09", "10");

      expect(await propagarA(tx, AHORA, [roto.id, bueno.ind.id])).toEqual({ escritas: 1, noAplica: 0, fallidas: 1 });
      expect((await fila(tx, bueno.medicion)).resultado_exacto).toBe("50/1");
      expect(await valores(tx, deRoto)).toEqual({});
      expect(errores).toHaveBeenCalledWith(expect.stringContaining(`medición ${deRoto}`), expect.anything());
    }));

  it("propagarSinFallar registra el error y no lo relanza", async () => {
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});
    const roto = (() => {
      throw new Error("sin conexión");
    }) as unknown as Cliente;
    await expect(propagarSinFallar({ sql: roto })).resolves.toBeUndefined();
    expect(errores).toHaveBeenCalled();
  });
});

describe("al abrir una medición en un camino de lectura", () => {
  /**
   * Un espejo (sus dos variables, datos) y un mixto (A propia, B un dato) mensuales desde septiembre, aprobados antes de
   * que termine, sin abrir todavía sus mediciones.
   */
  async function sinAbrir(tx: TransactionSql) {
    const procesoId = await procesoNuevo(tx);
    const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
    const datoA = await datoDePrueba(tx, { procesoId, nombre: `Glosas ${unico()}`, responsables: [responsable.usuarioId] });
    const datoB = await datoDePrueba(tx, { procesoId, nombre: `Facturado ${unico()}`, responsables: [responsable.usuarioId] });
    const comun = { procesoId, periodicidad: "mensual" as const, inicioMedicion: "2026-09", aprobadaEn: APROBADA };
    const espejo = await indicadorDePrueba(tx, { ...comun, variables: { A: { datoId: datoA }, B: { datoId: datoB } } });
    const mixtoSinAbrir = await indicadorDePrueba(tx, { ...comun, variables: { A: { nombre: GLOSADO }, B: { datoId: datoB } } });
    return { procesoId, responsable, datoA, datoB, espejo, mixto: mixtoSinAbrir };
  }
  const medicionesDe = async (tx: TransactionSql, indicadorId: number) =>
    (await tx`SELECT id FROM mediciones WHERE indicador_id = ${indicadorId}`).map((f) => Number(f.id));

  it("toma lo que el dato ya tiene: el dato se reportó cuando la medición aún no existía", () =>
    revertida(sql, async (tx) => {
      const { responsable, datoA, datoB, espejo, mixto: m } = await sinAbrir(tx);
      // El responsable reporta septiembre antes de que nadie abra las mediciones: la propagación no tiene dónde escribir.
      await reportarElDato(tx, responsable, datoA, "2026-09", "10");
      await reportarElDato(tx, responsable, datoB, "2026-09", "40");
      await propagarSinFallar({ sql: tx, ahora: AHORA, indicadorIds: [espejo.id, m.id] });
      expect(await medicionesDe(tx, espejo.id)).toEqual([]);

      // La página del indicador (y la lista, la matriz o el impreso) abre la medición con lo que su fuente ya tiene.
      expect(await asegurarMedicionesConFuentes({ sql: tx, ahora: AHORA, indicadorId: espejo.id })).toBe(1);
      const deEspejo = await medicionDe(tx, espejo.id, "2026-09");
      expect(await valores(tx, deEspejo)).toMatchObject({ A: { valor: "10", por: null }, B: { valor: "40", por: null } });
      const e = await fila(tx, deEspejo);
      expect([e.reportada_en, e.reportada_por, e.resultado_exacto]).toEqual([AHORA, null, "25/1"]);

      // Por la lista, con varios a la vez: el mixto trae el dato y sigue esperando lo de quien mide.
      await listarIndicadores(await sesionAdmin(tx), { procesoId: m.procesoId }, { sql: tx, ahora: AHORA });
      const deMixto = await medicionDe(tx, m.id, "2026-09");
      expect((await valores(tx, deMixto)).B).toMatchObject({ valor: "40", por: null });
      expect([(await fila(tx, deMixto)).reportada_en, await falta(tx, deMixto)]).toEqual([null, "reporte"]);
    }));

  it("si no abre nada, no propaga", () =>
    revertida(sql, async (tx) => {
      const { responsable, datoA, datoB, espejo } = await sinAbrir(tx);
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: espejo.id });
      await reportarElDato(tx, responsable, datoA, "2026-09", "10");
      await reportarElDato(tx, responsable, datoB, "2026-09", "40");
      // La medición ya existía: abrir no tiene nada que hacer, y lo que el dato trae lo lleva la acción o la pasada.
      expect(await asegurarMedicionesConFuentes({ sql: tx, ahora: AHORA, indicadorId: espejo.id })).toBe(0);
      expect(await valores(tx, await medicionDe(tx, espejo.id, "2026-09"))).toEqual({});
    }));
});

describe("cuándo corre", () => {
  it("la pasada de vencimientos propaga lo que nadie propagó", () =>
    revertida(sql, async (tx) => {
      await silenciarIndicadores(tx);
      const { mide, responsable, datoId, medicion } = await mixto(tx);
      await reportarLoMio(tx, mide, medicion, { A: "38529000" });
      await reportarElDato(tx, responsable, datoId, "2026-09", "1284300000");
      expect((await fila(tx, medicion)).resultado_exacto).toBeNull();
      await revisarVencimientosDeIndicadores({ sql: tx, ahora: AHORA, config });
      expect((await valores(tx, medicion)).B).toMatchObject({ valor: "1284300000", por: null });
      expect((await fila(tx, medicion)).resultado_exacto).toBe("3/1");
    }));

  it("lo que llama la acción del dato deja al día a los indicadores que lo esperaban, sin esperar a la pasada", () =>
    revertida(sql, async (tx) => {
      await silenciarIndicadores(tx);
      const { mide, responsable, datoId, medicion } = await mixto(tx);
      await reportarLoMio(tx, mide, medicion, { A: "38529000" });
      await reportarElDato(tx, responsable, datoId, "2026-09", "1284300000");
      await propagarSinFallar({ sql: tx, ahora: AHORA });
      expect((await fila(tx, medicion)).semaforo).toBe("critico");
    }));

  it("silenciarIndicadores deja sin trabajo a la propagación sobre lo que ya había", () =>
    revertida(sql, async (tx) => {
      const { mide, responsable, datoId, medicion } = await mixto(tx);
      await reportarLoMio(tx, mide, medicion, { A: "38529000" });
      await reportarElDato(tx, responsable, datoId, "2026-09", "1284300000");
      await silenciarIndicadores(tx);
      expect(await propagarA(tx, AHORA)).toEqual(sinCambios);
      expect(await valores(tx, medicion)).not.toHaveProperty("B");
    }));
});

describe("el historial", () => {
  it("el evento de la propagación se lee «El sistema actualizó «{variable}»: de {antes} a {despues}»", () => {
    const evento = (id: number, tipo: "reapertura" | "propagacion", detalle: Record<string, unknown>) => ({
      id,
      tipo,
      quien: null,
      creadoEn: new Date("2026-10-20T15:00:00Z"),
      detalle,
    });
    const [, entrada] = historialDeCorreccion(
      [
        evento(1, "reapertura", { justificacion: "Se corrige el dato" }),
        evento(2, "propagacion", {
          fuentes: [{ letra: "B", clase: "dato", id: 9, antes: "1284300000", despues: "40000000" }],
          antes: { A: "38529000", B: "1284300000" },
          despues: { A: "38529000", B: "40000000" },
        }),
      ],
      { unidad: { sufijo: " %", decimales: 1 }, nombres: { A: GLOSADO, B: "Total facturado" }, conSoportes: false },
    );
    // Las cifras, como las de las variables en «qué había y qué quedó».
    expect(entrada.que).toBe("El sistema actualizó «Total facturado»: de 1284300000 a 40000000");
    expect(entrada.cambios).toContain("Total facturado: 1284300000 → 40000000");
    expect(entrada.quien).toBe("El sistema");
  });
});
