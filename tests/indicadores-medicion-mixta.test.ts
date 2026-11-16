/**
 * La medición variable por variable (anexo 14C, §3.1 y §3.6; Tarea 9 de la 14C): quien mide reporta lo suyo aunque falte
 * lo ajeno (un dato compartido o el resultado de otro indicador) y la medición queda en «Falta un dato», sin tarea ni
 * vencido; nadie digita ni borra un valor que no es suyo. Un indicador sin variables propias no lo mide nadie, como un
 * automático, pero sus históricos sí se registran, completos.
 *
 * Los valores ajenos se insertan por SQL en `medicion_valores`, sin usuario: la propagación que los copia llega en la Tarea
 * 11. Contra la BD de desarrollo, dentro de una transacción que se revierte.
 *
 * El mixto es mensual desde septiembre de 2026, aprobado el 15 de agosto, con A propia («Valor glosado en el mes») y B un
 * dato compartido mensual («Total facturado…»): forma «porcentaje», meta 90 y umbral 70. Septiembre vence el 10 de octubre.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { CONFIG_DOCUMENTAL_DEFECTO } from "@/db/consultas/config-documental";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { tomarCalculo } from "@/db/consultas/indicadores/calculos";
import { reabrirMedicion } from "@/db/consultas/indicadores/cierre";
import { registrarHistoricos } from "@/db/consultas/indicadores/historicos";
import { medicionParaReportar, proximaPorReportar, tablaDelAnio } from "@/db/consultas/indicadores/lectura";
import { listarIndicadores } from "@/db/consultas/indicadores/lista";
import {
  asegurarMediciones,
  marcarNoAplica,
  NADIE_LO_MIDE,
  noSeDigitaDesdeAqui,
  quitarNoAplica,
  recalcularMedicion,
  reportar,
} from "@/db/consultas/indicadores/mediciones";
import { cambiarOperacion, designar } from "@/db/consultas/indicadores/operacion";
import { autorizarSoporte, bloquearParaSoporte, quitarSoporte } from "@/db/consultas/indicadores/soportes";
import { columnasDePendiente, esPendiente, queFalta, tareasDeIndicadores } from "@/db/consultas/indicadores/tareas";
import { revisarVencimientosDeIndicadores } from "@/db/consultas/indicadores/vencimientos";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { fechaLimiteDeReporte } from "@/lib/indicadores/periodos";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { datoDePrueba, indicadorDePrueba, silenciarIndicadores, versionNueva, type OpcionesIndicadorDePrueba } from "./utiles/indicadores";
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
/** El día en que vence septiembre: entra al aviso previo con cualquier número de días del parámetro. */
const EL_DIA = new Date("2026-10-10T15:00:00Z");
/** Vencido y con los días del escalamiento ya cumplidos. */
const TARDE = new Date("2026-10-20T15:00:00Z");
const APROBADA = new Date("2026-08-15T15:00:00Z");
const GLOSADO = "Valor glosado en el mes";
const NADIE_MIDE = "Este indicador no tiene datos propios: nadie lo digita";
const config = { ...CONFIG_DOCUMENTAL_DEFECTO, escalamientoDias: 3 };

const opc = (tx: TransactionSql, ahora = AHORA) => ({ sql: tx, ahora });

async function rechaza(promesa: Promise<unknown>, mensaje: string) {
  const err = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ErrorIndicador);
  expect((err as Error).message).toBe(mensaje);
}

const reportarCon = (tx: TransactionSql, sesion: SesionFlujo, medicionId: number, valores: Record<string, string>, ahora = AHORA) =>
  reportar(sesion, { medicionId, valores, parcial: false, confirmado: true }, opc(tx, ahora));

const guardarSinReportar = (tx: TransactionSql, sesion: SesionFlujo, medicionId: number, valores: Record<string, string>) =>
  reportar(sesion, { medicionId, valores, parcial: true, confirmado: false }, opc(tx));

const fila = async (tx: TransactionSql, medicionId: number) => (await tx`SELECT * FROM mediciones WHERE id = ${medicionId}`)[0];

const eventos = async (tx: TransactionSql, medicionId: number) =>
  (await tx`SELECT tipo FROM medicion_eventos WHERE medicion_id = ${medicionId} ORDER BY id`).map((e) => e.tipo as string);

const valores = async (tx: TransactionSql, medicionId: number) =>
  Object.fromEntries(
    (
      await tx`SELECT iv.letra, mv.valor FROM medicion_valores mv JOIN indicador_variables iv ON iv.id = mv.variable_id
        WHERE mv.medicion_id = ${medicionId} ORDER BY iv.letra`
    ).map((v) => [v.letra as string, Number(v.valor)]),
  );

const bitacora = (tx: TransactionSql, accion: string, medicionId: number) =>
  tx`SELECT detalle FROM auditoria WHERE accion = ${accion} AND entidad = 'medicion' AND entidad_id = ${medicionId} ORDER BY id`;

/**
 * Lo que le falta a la medición según `queFalta`, con las columnas y el filtro que leen las tareas, la pasada y la lista;
 * `null` si no está pendiente.
 */
async function falta(tx: TransactionSql, medicionId: number) {
  const filas = await tx`SELECT ${columnasDePendiente(tx)} FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id
    WHERE m.id = ${medicionId} AND ${esPendiente(tx)}`;
  return queFalta(filas).get(medicionId)?.falta ?? null;
}

/** El valor de una variable ajena, como lo dejará la propagación (Tarea 11): sin usuario y sin categoría. */
const ponerAjeno = (tx: TransactionSql, medicionId: number, variableId: number, valor: string) =>
  tx`INSERT INTO medicion_valores (medicion_id, variable_id, valor, reportado_por, reportado_en)
    VALUES (${medicionId}, ${variableId}, ${valor}, NULL, ${AHORA})`;

/** Las marcas de la pasada de vencimientos. */
const marcas = async (tx: TransactionSql, medicionId: number) => {
  const m = await fila(tx, medicionId);
  return [m.aviso_previo_en, m.aviso_vencido_en, m.escalado_en].map((x) => x !== null);
};

/** Un proceso que solo existe en la transacción: sin líderes, salvo los que el test le asigne. */
async function procesoNuevo(tx: TransactionSql): Promise<{ id: number; nombre: string }> {
  const sigla = `Z${unico()}`;
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${`Proceso ${sigla}`}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id, nombre`;
  return { id: Number(p.id), nombre: p.nombre as string };
}

const medicionDe = async (tx: TransactionSql, indicadorId: number, periodo: string) =>
  Number((await tx`SELECT id FROM mediciones WHERE indicador_id = ${indicadorId} AND periodo = ${periodo}`)[0].id);

/**
 * El mixto de la cabecera, con quien mide (y su jefe, para que la pasada pueda escalar), quien analiza, el dato y quien lo
 * reporta; `o` cambia lo que haga falta.
 */
async function mixto(tx: TransactionSql, o: OpcionesIndicadorDePrueba = {}) {
  const proceso = await procesoNuevo(tx);
  const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
  const mide = await usuarioDePrueba(tx, { rol: "consulta", jefeId: jefe.usuarioId });
  const analiza = await usuarioDePrueba(tx, { rol: "consulta" });
  const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
  const nombreDato = `Total facturado ${unico()}`;
  const datoId = await datoDePrueba(tx, { procesoId: proceso.id, nombre: nombreDato, responsables: [responsable.usuarioId] });
  const ind = await indicadorDePrueba(tx, {
    procesoId: proceso.id,
    periodicidad: "mensual",
    inicioMedicion: "2026-09",
    aprobadaEn: APROBADA,
    mide: [mide.usuarioId],
    analiza: [analiza.usuarioId],
    variables: { A: { nombre: GLOSADO }, B: { datoId } },
    ...o,
  });
  await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: ind.id });
  return { proceso, mide, analiza, responsable, datoId, nombreDato, ind, medicion: await medicionDe(tx, ind.id, "2026-09") };
}

/**
 * Un indicador mensual con sus dos variables de datos compartidos, desde junio de 2026 y aprobado el 15 de agosto: junio y
 * julio son históricos; agosto y septiembre, ordinarios. Lo analiza una persona; nadie está designado para medirlo.
 */
async function sinVariablesPropias(tx: TransactionSql, o: OpcionesIndicadorDePrueba = {}) {
  const proceso = await procesoNuevo(tx);
  const analiza = await usuarioDePrueba(tx, { rol: "consulta" });
  const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [proceso.id] });
  const datoA = await datoDePrueba(tx, { procesoId: proceso.id, nombre: `Glosas ${unico()}` });
  const datoB = await datoDePrueba(tx, { procesoId: proceso.id, nombre: `Facturado ${unico()}` });
  const ind = await indicadorDePrueba(tx, {
    procesoId: proceso.id,
    periodicidad: "mensual",
    inicioMedicion: "2026-06",
    aprobadaEn: APROBADA,
    analiza: [analiza.usuarioId],
    variables: { A: { datoId: datoA }, B: { datoId: datoB } },
    ...o,
  });
  await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: ind.id });
  return { proceso, analiza, lider, ind, medicion: await medicionDe(tx, ind.id, "2026-09") };
}

describe("un mixto: reportar lo mío", () => {
  it("sin el dato queda reportada, sin resultado y en «Falta un dato»: ni tarea, ni aviso, ni vencido, ni escalamiento", () =>
    revertida(sql, async (tx) => {
      await silenciarIndicadores(tx);
      const { proceso, mide, ind, medicion } = await mixto(tx);
      // Uno corriente del mismo proceso y de la misma persona: la pasada sí lo avisa.
      const corriente = await indicadorDePrueba(tx, {
        procesoId: proceso.id,
        periodicidad: "mensual",
        inicioMedicion: "2026-09",
        aprobadaEn: APROBADA,
        mide: [mide.usuarioId],
      });
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: corriente.id });
      const control = await medicionDe(tx, corriente.id, "2026-09");

      expect(await reportarCon(tx, mide, medicion, { A: "38529000" })).toEqual({
        ok: true,
        estado: "abierta",
        semaforo: null,
        cumple: null,
        faltaDato: true,
      });
      const m = await fila(tx, medicion);
      expect(m.reportada_en).not.toBeNull();
      expect(m.reportada_por).toBe(mide.usuarioId);
      expect([m.resultado_exacto, m.semaforo, m.estado]).toEqual([null, null, "abierta"]);
      expect(await valores(tx, medicion)).toEqual({ A: 38529000 });
      // Es un reporte: queda su evento y su bitácora.
      expect(await eventos(tx, medicion)).toEqual(["reporte"]);
      expect(await bitacora(tx, "medicion_reportada", medicion)).toHaveLength(1);
      expect(await falta(tx, medicion)).toBe("dato");

      const tareas = (await tareasDeIndicadores(mide, opc(tx, TARDE))).tareas.map((t) => t.id);
      expect(tareas).not.toContain(`medir:${medicion}`);
      expect(tareas).toContain(`medir:${control}`);
      expect(await proximaPorReportar(mide, ind.id, { sql: tx })).toBeNull();

      await revisarVencimientosDeIndicadores({ sql: tx, ahora: EL_DIA, config });
      await revisarVencimientosDeIndicadores({ sql: tx, ahora: TARDE, config });
      expect(await marcas(tx, medicion)).toEqual([false, false, false]);
      expect(await marcas(tx, control)).toEqual([true, true, true]);

      // La tabla del año y la pantalla de reportar lo dicen, sin vencido.
      const [septiembre] = (await tablaDelAnio(mide, ind.id, 2026, opc(tx, TARDE))).filter((f) => f.periodo === "2026-09");
      expect([septiembre.estado, septiembre.vencida]).toEqual(["falta_dato", false]);
      expect((await medicionParaReportar(mide, ind.codigo, "2026-09", opc(tx, TARDE)))?.vencida).toBe(false);
    }));

  it("no admite el valor del dato, ni para guardar sin reportar; sin lo propio dice qué falta, como hoy", () =>
    revertida(sql, async (tx) => {
      const { mide, medicion, nombreDato } = await mixto(tx);
      const NO_SE_DIGITA = `«${nombreDato}» no se digita desde aquí: llega de otra fuente`;
      expect(noSeDigitaDesdeAqui(nombreDato)).toBe(NO_SE_DIGITA);
      await rechaza(reportarCon(tx, mide, medicion, { A: "38529000", B: "1284300000" }), NO_SE_DIGITA);
      await rechaza(guardarSinReportar(tx, mide, medicion, { A: "38529000", B: "1284300000" }), NO_SE_DIGITA);
      await rechaza(reportarCon(tx, mide, medicion, { B: "1284300000" }), NO_SE_DIGITA);
      await rechaza(reportarCon(tx, mide, medicion, {}), `Falta el valor de «${GLOSADO}»`);
      await rechaza(reportarCon(tx, mide, medicion, { A: "" }), `Falta el valor de «${GLOSADO}»`);
      expect(await valores(tx, medicion)).toEqual({});
      // Un campo vacío de la variable ajena no es un valor.
      expect(await reportarCon(tx, mide, medicion, { A: "38529000", B: "" })).toMatchObject({ ok: true, faltaDato: true });
    }));

  it("el escritor de la persona no toca el valor del dato: «Guardar sin reportar» con lo propio vacío lo deja intacto", () =>
    revertida(sql, async (tx) => {
      const { mide, ind, medicion } = await mixto(tx);
      await ponerAjeno(tx, medicion, ind.variables.B, "1284300000");
      const filaDeB = () =>
        tx`SELECT id, valor, reportado_por, reportado_en FROM medicion_valores WHERE medicion_id = ${medicion} AND variable_id = ${ind.variables.B}`;
      const [antes] = await filaDeB();

      await guardarSinReportar(tx, mide, medicion, { A: "38529000" });
      expect(await valores(tx, medicion)).toEqual({ A: 38529000, B: 1284300000 });
      await guardarSinReportar(tx, mide, medicion, { A: "" });
      expect(await valores(tx, medicion)).toEqual({ B: 1284300000 });
      expect((await filaDeB())[0]).toEqual(antes);
      // La bitácora dice lo que cambió la persona; el dato queda igual a los dos lados.
      expect((await bitacora(tx, "medicion_guardada", medicion)).map((b) => [b.detalle.antes, b.detalle.despues])).toEqual([
        [
          { A: null, B: "1284300000" },
          { A: "38529000", B: "1284300000" },
        ],
        [
          { A: "38529000", B: "1284300000" },
          { A: null, B: "1284300000" },
        ],
      ]);
      expect((await fila(tx, medicion)).reportada_en).toBeNull();
    }));

  it("«Guardar sin reportar» y después «Reportar lo mío» con lo mismo deja el reporte; otra vez lo mismo no deja nada", () =>
    revertida(sql, async (tx) => {
      const { mide, medicion } = await mixto(tx);
      await guardarSinReportar(tx, mide, medicion, { A: "38529000" });
      expect(await reportarCon(tx, mide, medicion, { A: "38529000" })).toMatchObject({ ok: true, faltaDato: true });
      expect(await eventos(tx, medicion)).toEqual(["reporte"]);
      expect(await bitacora(tx, "medicion_reportada", medicion)).toHaveLength(1);
      expect((await fila(tx, medicion)).reportada_en).not.toBeNull();
      await reportarCon(tx, mide, medicion, { A: "38529000" });
      expect(await eventos(tx, medicion)).toEqual(["reporte"]);
      expect(await bitacora(tx, "medicion_corregida", medicion)).toHaveLength(0);
    }));

  it("con el dato ya puesto, reportar lo mío calcula el resultado, saca la alerta y, si no cumple, pide el análisis", () =>
    revertida(sql, async (tx) => {
      const { mide, ind, medicion } = await mixto(tx);
      await ponerAjeno(tx, medicion, ind.variables.B, "1284300000");
      // 38.529.000 de 1.284.300.000 es el 3 %: crítico frente a una meta de 90.
      expect(await reportarCon(tx, mide, medicion, { A: "38529000" })).toEqual({
        ok: true,
        estado: "abierta",
        semaforo: "critico",
        cumple: false,
        faltaDato: false,
      });
      const m = await fila(tx, medicion);
      expect(m.resultado_exacto).toBe("3/1");
      expect(m.alerta_estado).toBe("critico");
      expect(await valores(tx, medicion)).toEqual({ A: 38529000, B: 1284300000 });
      expect(await falta(tx, medicion)).toBe("analisis");
    }));

  it("queFalta: sin nada, el reporte; con lo propio, el dato; con todo y sin análisis, el análisis", () =>
    revertida(sql, async (tx) => {
      const { mide, ind, medicion } = await mixto(tx);
      expect(await falta(tx, medicion)).toBe("reporte");
      await reportarCon(tx, mide, medicion, { A: "38529000" });
      expect(await falta(tx, medicion)).toBe("dato");
      // Llega el dato (lo copiará la propagación) y la medición se recalcula sola.
      await ponerAjeno(tx, medicion, ind.variables.B, "1284300000");
      await recalcularMedicion(tx, medicion, { ahora: AHORA, actorId: null, evento: "propagacion" });
      expect(await falta(tx, medicion)).toBe("analisis");
    }));

  it("lleva soporte obligatorio como cualquier indicador que alguien mide", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const { mide, ind, medicion } = await mixto(tx);
      await cambiarOperacion(admin, { indicadorId: ind.id, plazoReporteDias: 10, inicioMedicion: "2026-09", soporteObligatorio: true, nivelAcceso: "general" }, opc(tx));
      await rechaza(reportarCon(tx, mide, medicion, { A: "38529000" }), "Este indicador exige un soporte: adjúntelo antes de reportar");
    }));
});

describe("un indicador sin variables propias: no lo mide nadie", () => {
  it("reportar, guardar sin reportar, «no aplica», quitarlo y subir o quitar un soporte lo rechazan; «Reportar» no se ofrece", () =>
    revertida(sql, async (tx) => {
      const { lider, ind, medicion } = await sinVariablesPropias(tx);
      expect(NADIE_LO_MIDE).toBe(NADIE_MIDE);
      // El líder del proceso podría medir cualquier indicador de su proceso, y aun así no digita este.
      await rechaza(reportarCon(tx, lider, medicion, { A: "5", B: "10" }), NADIE_MIDE);
      await rechaza(guardarSinReportar(tx, lider, medicion, { A: "5" }), NADIE_MIDE);
      await rechaza(marcarNoAplica(lider, { medicionId: medicion, motivo: "Sin casos en el mes" }, opc(tx)), NADIE_MIDE);
      // Ni el Administrador del SGC de respaldo, en un proceso sin líder.
      const admin = await sesionAdmin(tx);
      const huerfano = await sinVariablesPropias(tx, { procesoId: (await procesoNuevo(tx)).id });
      await rechaza(reportarCon(tx, admin, huerfano.medicion, { A: "5", B: "10" }), NADIE_MIDE);
      await tx`UPDATE mediciones SET no_aplica = true, no_aplica_motivo = 'No hubo nada que medir en el periodo', reportada_en = ${AHORA}
        WHERE id = ${medicion}`;
      await rechaza(quitarNoAplica(lider, medicion, opc(tx)), NADIE_MIDE);

      expect(await autorizarSoporte(medicion, lider, { sql: tx })).toEqual({ ok: false, estado: 409 });
      await expect(tx.savepoint((sp) => bloquearParaSoporte(sp, medicion))).rejects.toThrow(NADIE_MIDE);
      const [archivo] = await tx`INSERT INTO archivos (contexto, contexto_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
        VALUES ('medicion', ${medicion}, 'evidencia', ${`mediciones/${medicion}/zz-${unico()}.pdf`}, 'soporte.pdf', 'pdf', 'application/pdf', 10, ${"0".repeat(64)})
        RETURNING id`;
      await rechaza(quitarSoporte(lider, { archivoId: Number(archivo.id) }, opc(tx)), NADIE_MIDE);
      expect(await proximaPorReportar(lider, ind.id, { sql: tx })).toBeNull();
    }));

  it("queFalta: sin nada, «Falta un dato» (no el reporte); con todo y sin análisis, el análisis; nadie tiene «Reportar»", () =>
    revertida(sql, async (tx) => {
      const { lider, analiza, ind, medicion } = await sinVariablesPropias(tx);
      expect(await falta(tx, medicion)).toBe("dato");
      const deLider = (await tareasDeIndicadores(lider, opc(tx, TARDE))).tareas.map((t) => t.id);
      expect(deLider).not.toContain(`medir:${medicion}`);
      // Llegan los dos datos y, como lo hará la propagación, la medición queda reportada por el sistema.
      await ponerAjeno(tx, medicion, ind.variables.A, "5");
      await ponerAjeno(tx, medicion, ind.variables.B, "10");
      await tx`UPDATE mediciones SET reportada_en = ${AHORA} WHERE id = ${medicion}`;
      await recalcularMedicion(tx, medicion, { ahora: AHORA, actorId: null, evento: "propagacion" });
      expect((await fila(tx, medicion)).semaforo).toBe("critico");
      expect(await falta(tx, medicion)).toBe("analisis");
      expect((await tareasDeIndicadores(analiza, opc(tx))).tareas.map((t) => t.id)).toContain(`analizar:${medicion}`);
      expect((await tareasDeIndicadores(lider, opc(tx))).tareas.map((t) => t.id)).not.toContain(`medir:${medicion}`);
    }));

  it("el soporte obligatorio no la deja abierta", () =>
    revertida(sql, async (tx) => {
      const { ind, medicion } = await sinVariablesPropias(tx, { soporteObligatorio: true });
      await ponerAjeno(tx, medicion, ind.variables.A, "19");
      await ponerAjeno(tx, medicion, ind.variables.B, "20");
      await tx`UPDATE mediciones SET reportada_en = ${AHORA} WHERE id = ${medicion}`;
      await recalcularMedicion(tx, medicion, { ahora: AHORA, actorId: null, evento: "propagacion" });
      const m = await fila(tx, medicion);
      expect([m.semaforo, m.cumple, m.estado]).toEqual(["bien", true, "reportada"]);
      expect(await falta(tx, medicion)).toBeNull();
    }));

  it("sus históricos sí se registran, con todas sus letras, como quien administra y como líder del proceso", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const { lider, ind } = await sinVariablesPropias(tx);
      const junio = await medicionDe(tx, ind.id, "2026-06");
      const julio = await medicionDe(tx, ind.id, "2026-07");
      expect(await registrarHistoricos(admin, { indicadorId: ind.id, filas: [{ periodo: "2026-06", valores: { A: "9", B: "10" } }] }, opc(tx))).toEqual({
        registrados: 1,
      });
      expect(await registrarHistoricos(lider, { indicadorId: ind.id, filas: [{ periodo: "2026-07", valores: { A: "8", B: "10" } }] }, opc(tx))).toEqual({
        registrados: 1,
      });
      expect(await valores(tx, junio)).toEqual({ A: 9, B: 10 });
      expect(await valores(tx, julio)).toEqual({ A: 8, B: 10 });
      expect((await fila(tx, junio)).resultado_exacto).toBe("90/1");
      // Completos: un histórico no espera el dato.
      await rechaza(
        registrarHistoricos(admin, { indicadorId: ind.id, filas: [{ periodo: "2026-06", valores: { A: "9" } }] }, opc(tx)),
        "Junio de 2026: Falta el valor de «" + (await nombreDe(tx, ind.variables.B)) + "»",
      );
    }));

  it("no se le designa quien mida ni se le activa el soporte obligatorio; quitar a quien medía sí se puede", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const alguien = await usuarioDePrueba(tx, { rol: "consulta" });
      const { ind } = await sinVariablesPropias(tx);
      await rechaza(designar(admin, { indicadorId: ind.id, funcion: "mide", usuarioIds: [alguien.usuarioId] }, opc(tx)), NADIE_MIDE);
      await rechaza(
        cambiarOperacion(admin, { indicadorId: ind.id, plazoReporteDias: 10, inicioMedicion: "2026-06", soporteObligatorio: true, nivelAcceso: "general" }, opc(tx)),
        NADIE_MIDE,
      );
      // Lo demás de la operación sigue: el plazo cambia.
      await cambiarOperacion(admin, { indicadorId: ind.id, plazoReporteDias: 15, inicioMedicion: "2026-06", soporteObligatorio: false, nivelAcceso: "general" }, opc(tx));
      expect(Number((await tx`SELECT plazo_reporte_dias FROM indicadores WHERE id = ${ind.id}`)[0].plazo_reporte_dias)).toBe(15);
      // Quien quedara designado de antes se puede quitar.
      await tx`INSERT INTO indicador_designados (indicador_id, usuario_id, funcion, creado_por) VALUES (${ind.id}, ${alguien.usuarioId}, 'mide', ${admin.usuarioId})`;
      await designar(admin, { indicadorId: ind.id, funcion: "mide", usuarioIds: [] }, opc(tx));
      expect(await tx`SELECT 1 FROM indicador_designados WHERE indicador_id = ${ind.id} AND funcion = 'mide'`).toHaveLength(0);
      // Analizar sí se designa.
      await designar(admin, { indicadorId: ind.id, funcion: "analiza", usuarioIds: [alguien.usuarioId] }, opc(tx));
    }));

  it("la pantalla de reportar la abre quien analiza, no quien solo podría medir", () =>
    revertida(sql, async (tx) => {
      const { analiza, ind } = await sinVariablesPropias(tx);
      const otro = await usuarioDePrueba(tx, { rol: "consulta" });
      const datos = await medicionParaReportar(analiza, ind.codigo, "2026-09", opc(tx));
      expect(datos).toMatchObject({ automatica: false, mide: false, sinMedidor: false, soporteObligatorio: false });
      expect(await medicionParaReportar(otro, ind.codigo, "2026-09", opc(tx))).toBeNull();
      // En un mixto, la abre quien mide: quien solo analiza no.
      const m = await mixto(tx);
      expect(await medicionParaReportar(m.analiza, m.ind.codigo, "2026-09", opc(tx))).toBeNull();
      expect(await medicionParaReportar(m.mide, m.ind.codigo, "2026-09", opc(tx))).toMatchObject({ mide: true });
    }));

  it("reabrir una medición cerrada avisa a quien analiza, no a quien podría medir, y no marca a quien reabre como medidor", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const { lider, analiza, medicion } = await sinVariablesPropias(tx);
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id = ${medicion}`;
      await reabrirMedicion(admin, { medicionId: medicion, justificacion: "Se corrige el periodo de prueba" }, opc(tx));
      const avisados = (await tx`SELECT usuario_id FROM notificaciones WHERE tipo = 'indicadores.reabierta' AND entidad = 'medicion' AND entidad_id = ${medicion}`).map(
        (n) => Number(n.usuario_id),
      );
      expect(avisados).toEqual([analiza.usuarioId]);
      expect(avisados).not.toContain(lider.usuarioId);
      const [evento] = await tx`SELECT detalle FROM medicion_eventos WHERE medicion_id = ${medicion} AND tipo = 'reapertura'`;
      expect(evento.detalle).not.toHaveProperty("sinMedidor");
      expect(evento.detalle).not.toHaveProperty("propioMedidor");
    }));
});

describe("la columna «Reporte» de la lista", () => {
  it("sin pendientes (un retirado), el periodo abierto que espera el dato dice «Falta un dato»; un histórico sin propias, «Por registrar»", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const { mide, ind, medicion } = await mixto(tx);
      await reportarCon(tx, mide, medicion, { A: "38529000" });
      // De cada uno sin propias queda un solo periodo, el último que la lista lee: septiembre (ordinario) o junio (histórico).
      const nadie = await sinVariablesPropias(tx);
      await tx`DELETE FROM mediciones WHERE indicador_id = ${nadie.ind.id} AND periodo <> '2026-09'`;
      const historico = await sinVariablesPropias(tx);
      await tx`DELETE FROM mediciones WHERE indicador_id = ${historico.ind.id} AND periodo <> '2026-06'`;
      for (const id of [ind.id, nadie.ind.id, historico.ind.id]) {
        await tx`UPDATE indicadores SET estado = 'retirado', baja_por = ${admin.usuarioId}, baja_en = ${AHORA}, baja_motivo = 'Ya no se mide' WHERE id = ${id}`;
      }
      const reporte = async (codigo: string) =>
        (await listarIndicadores(admin, { retirados: true, texto: codigo }, opc(tx))).filas.find((f) => f.codigo === codigo)?.reporte;
      expect(await reporte(ind.codigo)).toEqual({ texto: "Falta un dato", vencida: false });
      expect(await reporte(nadie.ind.codigo)).toEqual({ texto: "Falta un dato", vencida: false });
      expect(await reporte(historico.ind.codigo)).toEqual({ texto: "Por registrar", vencida: false });
    }));
});

describe("la acción de «Datos de operación»", () => {
  it("convierte en un mensaje legible el interbloqueo con una aprobación, como crear, guardar, enviar y aprobar", () => {
    const fuente = readFileSync(path.join(process.cwd(), "src/app/acciones-indicadores.ts"), "utf8");
    const accion = fuente.slice(fuente.indexOf("export async function cambiarOperacionAccion"), fuente.indexOf("export async function duplicarAccion"));
    expect(accion).toMatch(/await cambiarOperacion\([^;]*\)\.catch\(sinInterbloqueoCrudo\);/);
  });
});

const nombreDe = async (tx: TransactionSql, variableId: number) =>
  (await tx`SELECT nombre FROM indicador_variables WHERE id = ${variableId}`)[0].nombre as string;

describe("los históricos de un mixto", () => {
  it("se digitan completos, también el dato; un automático los sigue rechazando", () =>
    revertida(sql, async (tx) => {
      const { mide, ind } = await mixto(tx, { inicioMedicion: "2026-07" });
      const julio = await medicionDe(tx, ind.id, "2026-07");
      expect(await registrarHistoricos(mide, { indicadorId: ind.id, filas: [{ periodo: "2026-07", valores: { A: "9", B: "10" } }] }, opc(tx))).toEqual({
        registrados: 1,
      });
      expect(await valores(tx, julio)).toEqual({ A: 9, B: 10 });
      await rechaza(
        registrarHistoricos(mide, { indicadorId: ind.id, filas: [{ periodo: "2026-07", valores: { A: "9", B: "" } }] }, opc(tx)),
        `Julio de 2026: Falta el valor de «${await nombreDe(tx, ind.variables.B)}»`,
      );

      const automatico = await indicadorDePrueba(tx, {
        periodicidad: "mensual",
        inicioMedicion: "2026-07",
        aprobadaEn: APROBADA,
        mide: [mide.usuarioId],
        calculo: { clave: "dentro_plazo", alcance: "entidad" },
      });
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: automatico.id });
      await rechaza(
        registrarHistoricos(mide, { indicadorId: automatico.id, filas: [{ periodo: "2026-07", valores: { A: "1", B: "2" } }] }, opc(tx)),
        "Este indicador lo calcula el sistema: sus datos no se digitan",
      );
    }));
});

describe("«Reportes de indicadores a tiempo»", () => {
  it("deja fuera a un indicador sin variables propias y cuenta a tiempo el mixto que reportó lo suyo aunque el dato llegara tarde", () =>
    revertida(sql, async (tx) => {
      const zona = zonaHoraria();
      const febrero = periodoDe("2093-02", zona)!;
      const marzo = periodoDe("2093-03", zona)!;
      const aTiempo = new Date("2093-03-05T15:00:00Z");
      const tarde = new Date("2093-03-20T15:00:00Z");
      const enFebrero = (o: OpcionesIndicadorDePrueba) =>
        indicadorDePrueba(tx, { periodicidad: "mensual", inicioMedicion: "2093-02", aprobadaEn: new Date("2093-01-15T15:00:00Z"), ...o });
      const proceso = await procesoNuevo(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const datoId = await datoDePrueba(tx, { procesoId: proceso.id });
      const otroDato = await datoDePrueba(tx, { procesoId: proceso.id });
      const mezcla = await enFebrero({ procesoId: proceso.id, mide: [mide.usuarioId], variables: { B: { datoId } } });
      const ajeno = await enFebrero({ procesoId: proceso.id, variables: { A: { datoId: otroDato }, B: { datoId } } });
      for (const i of [mezcla, ajeno]) await asegurarMediciones({ sql: tx, ahora: aTiempo, indicadorId: i.id });
      const deMezcla = await medicionDe(tx, mezcla.id, "2093-02");
      expect((await fila(tx, deMezcla)).vence_en).toEqual(fechaLimiteDeReporte(febrero, 10, zona));

      await reportarCon(tx, mide, deMezcla, { A: "9" }, aTiempo);
      // El dato llega después de la fecha límite.
      await tx`INSERT INTO medicion_valores (medicion_id, variable_id, valor, reportado_por, reportado_en)
        VALUES (${deMezcla}, ${mezcla.variables.B}, 10, NULL, ${tarde})`;
      await recalcularMedicion(tx, deMezcla, { ahora: tarde, actorId: null, evento: "propagacion" });

      const r = await tomarCalculo(tx, {
        clave: "reportes_a_tiempo",
        alcance: "proceso",
        procesoId: proceso.id,
        indicadorId: 0,
        periodo: { clave: marzo.clave, desde: marzo.desde, hasta: marzo.hasta },
        ahora: tarde,
      });
      expect(r).toEqual({ A: "1", B: "1" });
    }));
});

describe("la pantalla de reportar de un mixto (datosDeReporte)", () => {
  it("trae en B el dato con quién lo reportó y cuándo, y cuándo vence el que falta; en A, nada", () =>
    revertida(sql, async (tx) => {
      const { proceso, mide, responsable, datoId, nombreDato, ind, medicion } = await mixto(tx);
      const zona = zonaHoraria();
      const septiembre = periodoDe("2026-09", zona)!;
      const vence = new Date("2026-10-11T04:59:59.999Z");
      const [periodo] = await tx`INSERT INTO variable_valores (variable_id, periodo, desde, hasta, estado, vence_en)
        VALUES (${datoId}, '2026-09', ${septiembre.desde}, ${septiembre.hasta}, 'pendiente', ${vence}) RETURNING id`;

      const pendiente = (await medicionParaReportar(mide, ind.codigo, "2026-09", opc(tx)))!;
      expect(pendiente.mide).toBe(true);
      expect(pendiente.variables.map((v) => [v.letra, v.ajena])).toEqual([
        ["A", null],
        [
          "B",
          {
            clase: "dato",
            fuenteId: datoId,
            nombre: nombreDato,
            proceso: proceso.nombre,
            codigo: null,
            valor: null,
            reporto: null,
            reportadoEn: null,
            reportadoEl: null,
            venceEn: vence,
            venceEl: "10 de octubre de 2026",
          },
        ],
      ]);

      const reportadoEn = new Date("2026-10-04T15:00:00Z");
      await tx`UPDATE variable_valores SET estado = 'reportado', valor = 1284300000, reportado_por = ${responsable.usuarioId}, reportado_en = ${reportadoEn}
        WHERE id = ${periodo.id}`;
      await ponerAjeno(tx, medicion, ind.variables.B, "1284300000");
      const puesto = (await medicionParaReportar(mide, ind.codigo, "2026-09", opc(tx)))!;
      expect(puesto.variables[1].ajena).toEqual({
        clase: "dato",
        fuenteId: datoId,
        nombre: nombreDato,
        proceso: proceso.nombre,
        codigo: null,
        valor: "1284300000",
        reporto: responsable.nombre,
        reportadoEn,
        reportadoEl: "4 de octubre de 2026",
        venceEn: null,
        venceEl: null,
      });
      expect(puesto.variables[0].ajena).toBeNull();
    }));

  it("trae la variable tomada de otro indicador con su código y su nombre", () =>
    revertida(sql, async (tx) => {
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const componente = await indicadorDePrueba(tx, { periodicidad: "mensual", inicioMedicion: "2026-09", aprobadaEn: APROBADA });
      const compuesto = await indicadorDePrueba(tx, {
        periodicidad: "mensual",
        inicioMedicion: "2026-09",
        aprobadaEn: APROBADA,
        mide: [mide.usuarioId],
        variables: { B: { indicadorOrigenId: componente.id } },
      });
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: compuesto.id });
      const datos = (await medicionParaReportar(mide, compuesto.codigo, "2026-09", opc(tx)))!;
      expect(datos.variables[1].ajena).toEqual({
        clase: "indicador",
        fuenteId: componente.id,
        nombre: `Indicador de prueba ${componente.codigo}`,
        proceso: null,
        codigo: componente.codigo,
        valor: null,
        reporto: null,
        reportadoEn: null,
        reportadoEl: null,
        venceEn: null,
        venceEl: null,
      });
    }));
});

describe("cada escritor toca lo suyo (anexo 14C, §3.1)", () => {
  it("una letra que un cambio mayor volvió ajena no toma el valor que la persona guardó cuando era propia", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const proceso = await procesoNuevo(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const datoId = await datoDePrueba(tx, { procesoId: proceso.id });
      const ind = await indicadorDePrueba(tx, {
        procesoId: proceso.id,
        periodicidad: "mensual",
        inicioMedicion: "2026-09",
        aprobadaEn: APROBADA,
        mide: [mide.usuarioId],
        variables: { A: { nombre: GLOSADO } },
      });
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: ind.id });
      const medicion = await medicionDe(tx, ind.id, "2026-09");
      await guardarSinReportar(tx, mide, medicion, { A: "38529000", B: "1284300000" });
      // Un cambio mayor que rige desde septiembre vuelve B un dato compartido.
      await versionNueva(tx, {
        indicadorId: ind.id,
        usuarioId: admin.usuarioId,
        tipoCambio: "mayor",
        rigeDesde: "2026-09",
        aprobadaEn: AHORA,
        variables: { A: { nombre: GLOSADO }, B: { datoId } },
      });

      expect(await reportarCon(tx, mide, medicion, { A: "38529000" })).toEqual({
        ok: true,
        estado: "abierta",
        semaforo: null,
        cumple: null,
        faltaDato: true,
      });
      const [reporte] = await tx`SELECT detalle FROM medicion_eventos WHERE medicion_id = ${medicion} AND tipo = 'reporte'`;
      expect([reporte.detalle.antes.B, reporte.detalle.despues.B]).toEqual([null, null]);
      // El valor viejo de B era de la persona: lo quita su propio escritor.
      expect(await valores(tx, medicion)).toEqual({ A: 38529000 });
    }));

  it("tras un cambio menor, reportar lo mío no borra el valor ajeno que quedó en la versión anterior", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const { mide, datoId, ind, medicion } = await mixto(tx);
      await ponerAjeno(tx, medicion, ind.variables.B, "1284300000");
      await versionNueva(tx, {
        indicadorId: ind.id,
        usuarioId: admin.usuarioId,
        tipoCambio: "menor",
        rigeDesde: "2026-09",
        aprobadaEn: AHORA,
        variables: { A: { nombre: GLOSADO }, B: { datoId } },
      });
      expect(await reportarCon(tx, mide, medicion, { A: "38529000" })).toMatchObject({ ok: true, semaforo: "critico", faltaDato: false });
      const filasDeB = await tx`SELECT valor, reportado_por FROM medicion_valores WHERE medicion_id = ${medicion} AND variable_id = ${ind.variables.B}`;
      expect(filasDeB.map((f) => [Number(f.valor), f.reportado_por])).toEqual([[1284300000, null]]);
    }));

  it("corregir, «No aplica» y quitarlo, con el valor ajeno puesto, no lo tocan", () =>
    revertida(sql, async (tx) => {
      const { mide, ind, medicion } = await mixto(tx);
      await ponerAjeno(tx, medicion, ind.variables.B, "1284300000");
      const filaDeB = async () =>
        (await tx`SELECT id, valor, reportado_por, reportado_en FROM medicion_valores WHERE medicion_id = ${medicion} AND variable_id = ${ind.variables.B}`)[0];
      const antes = await filaDeB();
      await reportarCon(tx, mide, medicion, { A: "38529000" });
      await reportarCon(tx, mide, medicion, { A: "1000000000" });
      expect(await eventos(tx, medicion)).toEqual(["reporte", "correccion"]);
      expect(await filaDeB()).toEqual(antes);
      await marcarNoAplica(mide, { medicionId: medicion, motivo: "Sin glosas en el mes" }, opc(tx));
      expect(await filaDeB()).toEqual(antes);
      await quitarNoAplica(mide, medicion, opc(tx));
      expect(await filaDeB()).toEqual(antes);
      expect(await valores(tx, medicion)).toEqual({ A: 1000000000, B: 1284300000 });
    }));

  it("la marca «reportada» va en el primer reporte de un mixto, no en el evento de un histórico", () =>
    revertida(sql, async (tx) => {
      const { mide, ind } = await mixto(tx, { inicioMedicion: "2026-07" });
      const julio = await medicionDe(tx, ind.id, "2026-07");
      await registrarHistoricos(mide, { indicadorId: ind.id, filas: [{ periodo: "2026-07", valores: { A: "9", B: "10" } }] }, opc(tx));
      const [historico] = await tx`SELECT detalle FROM medicion_eventos WHERE medicion_id = ${julio} AND tipo = 'historico'`;
      expect(historico.detalle.antes).not.toHaveProperty("reportada");
      expect(historico.detalle.despues).not.toHaveProperty("reportada");

      const septiembre = await medicionDe(tx, ind.id, "2026-09");
      await reportarCon(tx, mide, septiembre, { A: "38529000" });
      const [reporte] = await tx`SELECT detalle FROM medicion_eventos WHERE medicion_id = ${septiembre} AND tipo = 'reporte'`;
      expect([reporte.detalle.antes.reportada, reporte.detalle.despues.reportada]).toEqual([false, true]);
    }));

  it("sin variables propias, con todos sus valores y sin resultado, no le da «Reportar» a nadie", () =>
    revertida(sql, async (tx) => {
      const { lider, analiza, ind, medicion } = await sinVariablesPropias(tx);
      await ponerAjeno(tx, medicion, ind.variables.A, "5");
      await ponerAjeno(tx, medicion, ind.variables.B, "10");
      await tx`UPDATE mediciones SET reportada_en = ${AHORA} WHERE id = ${medicion}`;
      expect((await fila(tx, medicion)).resultado_exacto).toBeNull();
      expect(await falta(tx, medicion)).toBe("dato");
      for (const s of [lider, analiza]) {
        expect((await tareasDeIndicadores(s, opc(tx, TARDE))).tareas.map((t) => t.id)).not.toContain(`medir:${medicion}`);
      }
    }));
});

describe("los límites del resultado en un mixto", () => {
  const FUERA = "El resultado (200 %) queda fuera de los límites del indicador";

  it("con el valor ajeno puesto, un resultado fuera de los límites se pide como confirmación, sin escribir nada", () =>
    revertida(sql, async (tx) => {
      const { mide, ind, medicion } = await mixto(tx, { resultadoMax: "100" });
      await ponerAjeno(tx, medicion, ind.variables.B, "10");
      expect(await reportar(mide, { medicionId: medicion, valores: { A: "20" }, parcial: false, confirmado: false }, opc(tx))).toEqual({
        ok: false,
        confirmar: `${FUERA}. ¿Los datos son correctos?`,
      });
      expect(await valores(tx, medicion)).toEqual({ B: 10 });
      expect(await eventos(tx, medicion)).toEqual([]);
      expect(await reportarCon(tx, mide, medicion, { A: "20" })).toMatchObject({ ok: true, faltaDato: false });
      expect((await fila(tx, medicion)).resultado_exacto).toBe("200/1");
    }));

  it("la división por cero sigue rechazando; sin variables ajenas y en un histórico, el límite sigue bloqueando", () =>
    revertida(sql, async (tx) => {
      const cero = await mixto(tx);
      await ponerAjeno(tx, cero.medicion, cero.ind.variables.B, "0");
      await rechaza(
        reportarCon(tx, cero.mide, cero.medicion, { A: "5" }),
        "No se puede calcular: división por cero. Si no hubo casos, marque «No aplica en este periodo».",
      );

      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const propio = await indicadorDePrueba(tx, {
        periodicidad: "mensual",
        inicioMedicion: "2026-09",
        aprobadaEn: APROBADA,
        mide: [mide.usuarioId],
        resultadoMax: "100",
      });
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: propio.id });
      await rechaza(reportarCon(tx, mide, await medicionDe(tx, propio.id, "2026-09"), { A: "20", B: "10" }), FUERA);

      const historico = await mixto(tx, { inicioMedicion: "2026-07", resultadoMax: "100" });
      await rechaza(
        registrarHistoricos(historico.mide, { indicadorId: historico.ind.id, filas: [{ periodo: "2026-07", valores: { A: "20", B: "10" } }] }, opc(tx)),
        `Julio de 2026: ${FUERA}`,
      );
    }));
});
