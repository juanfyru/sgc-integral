/**
 * El acumulado de un compuesto (anexo 14C, §6.4; Tarea 17 de la 14C): cada variable tomada de otro indicador vale el
 * acumulado propio del componente en el mismo tramo (sus variables juntadas y su fórmula, nunca sus resultados sumados ni
 * promediados), o su cumplimiento contra la meta del último periodo medido del componente. Si ese acumulado es parcial, el del
 * compuesto lo es y lo dice. Es el mismo en la página, la matriz, el impreso y el resultado del periodo externo de una
 * constancia.
 *
 * Contra la BD de desarrollo, dentro de una transacción que se revierte, en 2003 y con `ahora` inyectado. El componente R es
 * mensual desde enero y de forma «porcentaje» (`A / B * 100`), meta 90: enero 1 de 2 (50 %), febrero 10 de 10 y marzo 10 de 10
 * (100 %): su acumulado del trimestre es 21 de 22, 1050/11 (95,45 %). Sumar sus resultados daría 250; promediarlos, 83,3; el
 * último, 100.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { resultadoDelPeriodoExterno } from "@/db/consultas/indicadores/constancias";
import { impresionDelAnio } from "@/db/consultas/indicadores/impresion";
import { resultadosDelAnio } from "@/db/consultas/indicadores/lectura";
import { matrizDelAnio } from "@/db/consultas/indicadores/matriz";
import { asegurarMediciones, reportar } from "@/db/consultas/indicadores/mediciones";
import { programarMeta } from "@/db/consultas/indicadores/metas";
import { propagar } from "@/db/consultas/indicadores/propagacion";
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

/** Terminó el primer trimestre de 2003; el plazo de marzo (el 10 de abril) ya pasó. */
const AHORA = new Date("2003-04-20T15:00:00Z");
const FEBRERO = new Date("2003-02-15T15:00:00Z");
const APROBADA = new Date("2002-12-15T15:00:00Z");
/** 21 de 22: el acumulado del trimestre del componente. */
const ACUMULADO_DE_R = "1050/11";

const opc = (tx: TransactionSql, ahora = AHORA) => ({ sql: tx, ahora });
const medicionDe = async (tx: TransactionSql, indicadorId: number, periodo: string) =>
  Number((await tx`SELECT id FROM mediciones WHERE indicador_id = ${indicadorId} AND periodo = ${periodo}`)[0].id);

async function procesoNuevo(tx: TransactionSql): Promise<number> {
  const sigla = `Z${unico()}`;
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${`Proceso ${sigla}`}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id`;
  return Number(p.id);
}

/** El proceso, quien administra y quien mide el componente; los ayudantes de armar. */
async function entorno(tx: TransactionSql) {
  const procesoId = await procesoNuevo(tx);
  const admin = await sesionAdmin(tx);
  const mide = await usuarioDePrueba(tx, { rol: "consulta" });
  const nuevo = (o: OpcionesIndicadorDePrueba = {}) =>
    indicadorDePrueba(tx, { procesoId, periodicidad: "mensual", inicioMedicion: "2003-01", aprobadaEn: APROBADA, ...o });
  const abrir = async (...ids: number[]) => {
    for (const indicadorId of ids) await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId });
  };
  const reportarAB = async (quien: SesionFlujo, indicadorId: number, periodo: string, A: string, B: string) =>
    reportar(quien, { medicionId: await medicionDe(tx, indicadorId, periodo), valores: { A, B }, parcial: false, confirmado: true }, opc(tx));
  /** El componente R: 50 %, 100 % y 100 % en el trimestre. */
  const componenteR = async (o: OpcionesIndicadorDePrueba = {}) => {
    const r = await nuevo({ mide: [mide.usuarioId], ...o });
    await abrir(r.id);
    await reportarAB(mide, r.id, "2003-01", "1", "2");
    await reportarAB(mide, r.id, "2003-02", "10", "10");
    await reportarAB(mide, r.id, "2003-03", "10", "10");
    return r;
  };
  return { procesoId, admin, mide, nuevo, abrir, reportarAB, componenteR };
}

describe("el acumulado de un compuesto", () => {
  it("cada variable tomada vale el acumulado del componente en el tramo (21 de 22), no la suma, el promedio ni el último de sus resultados", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const r = await e.componenteR();
      // El espejo de R: A toma su valor, B su cumplimiento; la fórmula es «A».
      const c = await e.nuevo({
        formula: "A",
        variables: { A: { indicadorOrigenId: r.id, toma: "valor" }, B: { indicadorOrigenId: r.id, toma: "cumplimiento" } },
      });
      await e.abrir(c.id);
      await propagar(opc(tx));

      const deR = await resultadosDelAnio(e.admin, r.id, 2003, opc(tx));
      expect(deR.acumulado.exacto).toBe(ACUMULADO_DE_R);
      const deC = await resultadosDelAnio(e.admin, c.id, 2003, opc(tx));
      // Cada mes, el compuesto copió el resultado de R: 50, 100 y 100.
      expect(deC.filas.map((f) => f.resultado)).toEqual(["50 %", "100 %", "100 %", ...Array(9).fill(null)]);
      expect(deC.acumulado).toMatchObject({ exacto: ACUMULADO_DE_R, texto: "95,5 %", valores: { A: "95,4545" }, rotulo: null });
      expect(deC.acumulado.componenteParcial).toBeUndefined();

      // El mismo en la matriz, el impreso y el periodo externo de una constancia (el trimestre).
      const matriz = await matrizDelAnio(e.admin, { anio: 2003, procesoId: e.procesoId }, opc(tx));
      const fila = matriz.procesos.flatMap((p) => p.filas).find((f) => f.codigo === c.codigo);
      expect(fila?.anio.texto).toBe("95,5 %");
      const impreso = await impresionDelAnio(e.admin, c.codigo, 2003, opc(tx));
      expect(impreso?.resultados.acumulado.exacto).toBe(ACUMULADO_DE_R);
      expect(await resultadoDelPeriodoExterno(tx, c.id, "2003-T1", AHORA)).toMatchObject({ exacto: ACUMULADO_DE_R, texto: "95,5 %" });
    }));

  it("con «toma cumplimiento», el acumulado del componente se juzga contra la meta de su último periodo medido", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      // La meta de marzo de R, 98, programada antes de que termine: su acumulado (95,45) no la alcanza.
      const r = await e.nuevo({ mide: [e.mide.usuarioId] });
      await programarMeta(e.admin, { indicadorId: r.id, periodo: "2003-03", meta: "98" }, opc(tx, FEBRERO));
      await e.abrir(r.id);
      await e.reportarAB(e.mide, r.id, "2003-01", "1", "2");
      await e.reportarAB(e.mide, r.id, "2003-02", "10", "10");
      await e.reportarAB(e.mide, r.id, "2003-03", "10", "10");
      const c = await e.nuevo({
        formula: "B",
        variables: { A: { indicadorOrigenId: r.id, toma: "valor" }, B: { indicadorOrigenId: r.id, toma: "cumplimiento" } },
      });
      await e.abrir(c.id);
      await propagar(opc(tx));

      const deC = await resultadosDelAnio(e.admin, c.id, 2003, opc(tx));
      // Cada mes: 55,6 (50 frente a 90), 100 y 100 (100 frente a 98).
      expect(deC.filas.slice(0, 3).map((f) => f.resultado)).toEqual(["55,6 %", "100 %", "100 %"]);
      // 95,45 frente a 98 es 75/77 de la meta: 7500/77 (97,4 %). Contra la meta de enero (90) cumpliría: 100.
      expect(deC.acumulado).toMatchObject({ exacto: "7500/77", texto: "97,4 %" });
      expect(await resultadoDelPeriodoExterno(tx, c.id, "2003-T1", AHORA)).toMatchObject({ exacto: "7500/77" });
    }));

  it("si el acumulado del componente es parcial (empezó a medirse después), el del compuesto lo es y lo dice, también en la constancia", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      // R se mide desde febrero; el compuesto, trimestral desde el primer trimestre.
      const r = await e.nuevo({ mide: [e.mide.usuarioId], inicioMedicion: "2003-02" });
      await e.abrir(r.id);
      await e.reportarAB(e.mide, r.id, "2003-02", "10", "10");
      await e.reportarAB(e.mide, r.id, "2003-03", "9", "10");
      const c = await e.nuevo({
        periodicidad: "trimestral",
        inicioMedicion: "2003-T1",
        formula: "A",
        variables: { A: { indicadorOrigenId: r.id, toma: "valor" }, B: { indicadorOrigenId: r.id, toma: "cumplimiento" } },
      });
      await e.abrir(c.id);
      await propagar(opc(tx));

      const deC = await resultadosDelAnio(e.admin, c.id, 2003, opc(tx));
      expect(deC.filas[0]).toMatchObject({ periodo: "2003-T1", resultado: "95 %" });
      expect(deC.acumulado).toMatchObject({
        exacto: "95/1",
        componenteParcial: true,
        rotulo: "Acumulado parcial: un componente se acumula desde un periodo posterior",
      });
      expect(await resultadoDelPeriodoExterno(tx, c.id, "2003", AHORA)).toMatchObject({ exacto: "95/1", parcial: true, componenteParcial: true });

      // El componente mismo no es parcial: cubre todos sus periodos.
      expect((await resultadosDelAnio(e.admin, r.id, 2003, opc(tx))).acumulado).toMatchObject({ exacto: "95/1", rotulo: null });
    }));

  it("una ficha sin componentes no cambia: su acumulado sigue juntando sus variables", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const r = await e.componenteR();
      const deR = await resultadosDelAnio(e.admin, r.id, 2003, opc(tx));
      expect(deR.acumulado).toMatchObject({ exacto: ACUMULADO_DE_R, valores: { A: "21", B: "22" }, numeros: { A: 21, B: 22 }, rotulo: null });
      expect(deR.acumulado).not.toHaveProperty("componenteParcial");
    }));
});
