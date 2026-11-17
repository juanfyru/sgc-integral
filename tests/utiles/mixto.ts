/**
 * El mixto de las pruebas de la propagación (`indicadores-propagacion.test.ts`) y del soporte obligatorio
 * (`indicadores-soporte-desde.test.ts`), con sus ayudantes. Corre dentro de una transacción que se revierte (`revertida`).
 *
 * Mensual desde septiembre de 2026, aprobado el 15 de agosto, con A propia («Valor glosado en el mes») y B el dato compartido
 * mensual «Total facturado…»: forma «porcentaje», meta 90 y umbral 70. Se abre el 5 de octubre (`AHORA`) y septiembre vence
 * el 10. 38.529.000 de 1.284.300.000 es el 3 % (crítico); de 40.000.000, el 96 %.
 */
import type { TransactionSql } from "postgres";
import { expect } from "vitest";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { asegurarPeriodosDeDatos, reportarDato } from "@/db/consultas/indicadores/datos-periodos";
import { asegurarMediciones, reportar } from "@/db/consultas/indicadores/mediciones";
import { cambiarOperacion } from "@/db/consultas/indicadores/operacion";
import { propagar } from "@/db/consultas/indicadores/propagacion";
import { columnasDePendiente, esPendiente, queFalta } from "@/db/consultas/indicadores/tareas";
import { datoDePrueba, indicadorDePrueba, type OpcionesIndicadorDePrueba } from "./indicadores";
import { sesionAdmin, usuarioDePrueba } from "./tramites";

let consecutivo = 0;
export const unico = () => `${Date.now() % 100_000_000}${(consecutivo += 1)}`;

export const AHORA = new Date("2026-10-05T15:00:00Z");
export const APROBADA = new Date("2026-08-15T15:00:00Z");
export const GLOSADO = "Valor glosado en el mes";

export const propagarA = (tx: TransactionSql, ahora: Date, indicadorIds?: number[]) =>
  propagar({ sql: tx, ahora, ...(indicadorIds ? { indicadorIds } : {}) });

export const fila = async (tx: TransactionSql, medicionId: number) => (await tx`SELECT * FROM mediciones WHERE id = ${medicionId}`)[0];

/** Lo que le falta a la medición según `queFalta`, como la leen las tareas y la pasada; `null` si no está pendiente. */
export async function falta(tx: TransactionSql, medicionId: number) {
  const filas = await tx`SELECT ${columnasDePendiente(tx)} FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id
    WHERE m.id = ${medicionId} AND ${esPendiente(tx)}`;
  return queFalta(filas).get(medicionId)?.falta ?? null;
}

export async function procesoNuevo(tx: TransactionSql): Promise<number> {
  const sigla = `Z${unico()}`;
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${`Proceso ${sigla}`}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id`;
  return Number(p.id);
}

export const medicionDe = async (tx: TransactionSql, indicadorId: number, periodo: string) =>
  Number((await tx`SELECT id FROM mediciones WHERE indicador_id = ${indicadorId} AND periodo = ${periodo}`)[0].id);

/**
 * Reporta (o corrige) el periodo del dato como su responsable, a `ahora`, abriéndolo antes si hace falta
 * (`asegurarPeriodosDeDatos`). Devuelve el id del periodo.
 */
export async function reportarElDato(tx: TransactionSql, responsable: SesionFlujo, datoId: number, periodo: string, valor: string, ahora = AHORA) {
  await asegurarPeriodosDeDatos({ sql: tx, ahora, datoIds: [datoId] });
  const [p] = await tx`SELECT id FROM variable_valores WHERE variable_id = ${datoId} AND periodo = ${periodo}`;
  expect(p, `el periodo ${periodo} del dato debía estar abierto`).toBeDefined();
  expect(await reportarDato(responsable, { periodoId: Number(p.id), valor, confirmado: true }, { sql: tx, ahora })).toMatchObject({ ok: true });
  return Number(p.id);
}

export const reportarLoMio = (tx: TransactionSql, sesion: SesionFlujo, medicionId: number, v: Record<string, string>, ahora = AHORA) =>
  reportar(sesion, { medicionId, valores: v, parcial: false, confirmado: true }, { sql: tx, ahora });

/** El mixto de la cabecera, con quien mide, quien analiza y el responsable del dato; `o` cambia lo que haga falta. */
export async function mixto(tx: TransactionSql, o: OpcionesIndicadorDePrueba = {}) {
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

/** Cambia «soporte obligatorio» del mixto a `ahora`, como lo hace quien administra en «Datos de operación» (plazo de 10 días). */
const conSoporte = async (tx: TransactionSql, indicadorId: number, ahora: Date, soporteObligatorio: boolean) =>
  cambiarOperacion(
    await sesionAdmin(tx),
    { indicadorId, plazoReporteDias: 10, inicioMedicion: "2026-09", soporteObligatorio, nivelAcceso: "general" },
    { sql: tx, ahora },
  );

export const activarSoporte = (tx: TransactionSql, indicadorId: number, ahora: Date) => conSoporte(tx, indicadorId, ahora, true);
export const desactivarSoporte = (tx: TransactionSql, indicadorId: number, ahora: Date) => conSoporte(tx, indicadorId, ahora, false);
