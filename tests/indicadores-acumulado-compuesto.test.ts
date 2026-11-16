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
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { FichaImpresa } from "@/componentes/indicadores/ficha/FichaImpresa";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { asegurarConstancias, registrarConstancia, resultadoDelPeriodoExterno } from "@/db/consultas/indicadores/constancias";
import { registrarHistoricos } from "@/db/consultas/indicadores/historicos";
import { impresionDelAnio } from "@/db/consultas/indicadores/impresion";
import { resultadosDelAnio } from "@/db/consultas/indicadores/lectura";
import { matrizDelAnio } from "@/db/consultas/indicadores/matriz";
import { asegurarMediciones, reportar } from "@/db/consultas/indicadores/mediciones";
import { programarMeta } from "@/db/consultas/indicadores/metas";
import { propagar, valorDeComponente, valorDeComponenteSobre } from "@/db/consultas/indicadores/propagacion";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { avisoDeParcial } from "@/lib/indicadores/constancias";
import { aTexto } from "@/lib/indicadores/formula/fraccion";
import { COMPONENTE_PARCIAL, SIN_ACUMULADO_POR_COMPONENTE } from "@/lib/indicadores/resultados";
import { zonaHoraria } from "@/lib/zona-horaria";
import { indicadorDePrueba, versionNueva, type OpcionesIndicadorDePrueba } from "./utiles/indicadores";
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
        rotulo: "Acumulado parcial: un componente no cubre todos los periodos",
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

// ─────────────────────────────────────────────────────────────────────────────
// Ronda 1: el componente sin resultado en el tramo (I1), la racha por el origen de una letra (I3) y la constancia (M6)
// ─────────────────────────────────────────────────────────────────────────────

/** En 2004: el compuesto y el componente se aprueban el 5 de julio; el 15 de julio, julio aún no termina. */
const APROBADOS_EN_JULIO = new Date("2004-07-05T15:00:00Z");
const JULIO = new Date("2004-07-15T15:00:00Z");
const AGOSTO = new Date("2004-08-15T15:00:00Z");
const MESES_DEL_SEMESTRE = ["2004-01", "2004-02", "2004-03", "2004-04", "2004-05", "2004-06"];

/** El espejo de `origen` (A su valor, B su cumplimiento, fórmula «A»), mensual desde `inicio` y aprobado el 5 de julio de 2004. */
const espejoDe = (e: Awaited<ReturnType<typeof entorno>>, origen: number, inicio: string) =>
  e.nuevo({
    inicioMedicion: inicio,
    aprobadaEn: APROBADOS_EN_JULIO,
    formula: "A",
    variables: { A: { indicadorOrigenId: origen, toma: "valor" }, B: { indicadorOrigenId: origen, toma: "cumplimiento" } },
  });

/** Los históricos del compuesto, digitando también lo que toma de su componente (anexo 14C, §3.6). */
const historicosDe = (tx: TransactionSql, admin: SesionFlujo, indicadorId: number, periodos: readonly string[], ahora: Date) =>
  registrarHistoricos(admin, { indicadorId, filas: periodos.map((periodo) => ({ periodo, valores: { A: "80", B: "88.8889" } })) }, opc(tx, ahora));

const reportarEn = async (tx: TransactionSql, quien: SesionFlujo, indicadorId: number, periodo: string, A: string, B: string, ahora: Date) =>
  reportar(quien, { medicionId: await medicionDe(tx, indicadorId, periodo), valores: { A, B }, parcial: false, confirmado: true }, opc(tx, ahora));

const SIN_ACUMULADO = SIN_ACUMULADO_POR_COMPONENTE;
const PARCIAL = `Acumulado parcial: ${COMPONENTE_PARCIAL}`;

describe("el componente sin resultado en el tramo del acumulado (anexo 14C, §6.4)", () => {
  it("con sus históricos sin registrar bajo los del compuesto: sin acumulado y lo dice, también en el impreso y en la constancia", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const r = await e.nuevo({ mide: [e.mide.usuarioId], inicioMedicion: "2004-01", aprobadaEn: APROBADOS_EN_JULIO });
      const c = await espejoDe(e, r.id, "2004-01");
      expect(await historicosDe(tx, e.admin, c.id, MESES_DEL_SEMESTRE, JULIO)).toEqual({ registrados: 6 });

      const deC = await resultadosDelAnio(e.admin, c.id, 2004, opc(tx, JULIO));
      expect(deC.filas.slice(0, 6).map((f) => f.resultado)).toEqual(Array(6).fill("80 %"));
      expect(deC.acumulado).toMatchObject({ texto: null, sinComponente: true, rotulo: SIN_ACUMULADO });

      const impreso = (await impresionDelAnio(e.admin, c.codigo, 2004, opc(tx, JULIO)))!;
      const html = renderToStaticMarkup(createElement(FichaImpresa, { entidad: "Entidad Zeta de Prueba", logo: null, ...impreso }));
      expect(html).toContain(SIN_ACUMULADO);
      expect(html).not.toContain("Aún no hay periodos medidos");

      const externo = await resultadoDelPeriodoExterno(tx, c.id, "2004-S1", JULIO);
      expect(externo).toMatchObject({ texto: null, exacto: null, parcial: true, componenteParcial: true });
      expect(avisoDeParcial(externo)).toContain(COMPONENTE_PARCIAL);
    }));

  it("con un periodo ordinario sin dato bajo un histórico del compuesto: el acumulado sale con los demás y es parcial; el valor del periodo no se salta nada", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      // R se aprueba antes: marzo a junio son ordinarios; mayo queda sin dato.
      const r = await e.nuevo({ mide: [e.mide.usuarioId], inicioMedicion: "2004-03", aprobadaEn: new Date("2004-02-20T15:00:00Z") });
      await asegurarMediciones({ sql: tx, ahora: JULIO, indicadorId: r.id });
      await reportarEn(tx, e.mide, r.id, "2004-03", "9", "10", JULIO);
      await reportarEn(tx, e.mide, r.id, "2004-04", "8", "10", JULIO);
      await reportarEn(tx, e.mide, r.id, "2004-06", "10", "10", JULIO);
      const c = await espejoDe(e, r.id, "2004-03");
      await historicosDe(tx, e.admin, c.id, ["2004-03", "2004-04", "2004-05", "2004-06"], JULIO);

      // 27 de 30, sin mayo.
      const deC = await resultadosDelAnio(e.admin, c.id, 2004, opc(tx, JULIO));
      expect(deC.acumulado).toMatchObject({ exacto: "90/1", texto: "90 %", componenteParcial: true, rotulo: PARCIAL });
      expect(deC.acumulado).not.toHaveProperty("sinComponente");

      // El valor de un periodo (la propagación, el cierre) espera a mayo: sin la opción del acumulado, falta.
      const sobre = ["2004-03", "2004-04", "2004-05", "2004-06"].map((clave) => {
        const p = periodoDe(clave, zonaHoraria())!;
        return { clave, desde: p.desde, hasta: p.hasta };
      });
      expect(await valorDeComponenteSobre(tx, { indicadorId: r.id, toma: "valor", sobre })).toEqual({ estado: "falta" });
      const T2 = periodoDe("2004-T2", zonaHoraria())!;
      expect(await valorDeComponente(tx, { indicadorId: r.id, toma: "valor", periodo: "2004-T2", desde: T2.desde, hasta: T2.hasta })).toEqual({ estado: "falta" });
      const delAcumulado = await valorDeComponenteSobre(tx, { indicadorId: r.id, toma: "valor", sobre, acumulado: true });
      expect(delAcumulado).toMatchObject({ estado: "listo", incompleto: true });
      expect(delAcumulado.estado === "listo" && aTexto(delAcumulado.valor)).toBe("90/1");
    }));

  it("lo que ya funcionaba: julio medido en los dos, con los históricos del componente sin registrar, es parcial", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const r = await e.nuevo({ mide: [e.mide.usuarioId], inicioMedicion: "2004-01", aprobadaEn: APROBADOS_EN_JULIO });
      const c = await espejoDe(e, r.id, "2004-01");
      await historicosDe(tx, e.admin, c.id, MESES_DEL_SEMESTRE, AGOSTO);
      await asegurarMediciones({ sql: tx, ahora: AGOSTO, indicadorId: r.id });
      await reportarEn(tx, e.mide, r.id, "2004-07", "7", "10", AGOSTO);
      await asegurarMediciones({ sql: tx, ahora: AGOSTO, indicadorId: c.id });
      await propagar(opc(tx, AGOSTO));
      const deC = await resultadosDelAnio(e.admin, c.id, 2004, opc(tx, AGOSTO));
      expect(deC.acumulado).toMatchObject({ exacto: "70/1", componenteParcial: true, rotulo: PARCIAL });
    }));
});

describe("la racha distingue de qué componente sale una letra (anexo 14C, §6.4; spec §8.10)", () => {
  it("A propia «último» en la versión 1 y tomada de R en la 2, con la misma fórmula: el acumulado parte en la 2", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const r = await e.componenteR();
      const c = await e.nuevo({ mide: [e.mide.usuarioId], variables: { A: { consolidacion: "ultimo" } } });
      await versionNueva(tx, {
        indicadorId: c.id,
        usuarioId: e.admin.usuarioId,
        tipoCambio: "mayor",
        rigeDesde: "2003-03",
        aprobadaEn: FEBRERO,
        variables: { A: { indicadorOrigenId: r.id, toma: "valor" } },
      });
      await e.abrir(c.id);
      await e.reportarAB(e.mide, c.id, "2003-01", "5", "10");
      await e.reportarAB(e.mide, c.id, "2003-02", "6", "10");
      await reportar(e.mide, { medicionId: await medicionDe(tx, c.id, "2003-03"), valores: { B: "200" }, parcial: false, confirmado: true }, opc(tx));
      await propagar(opc(tx));
      // Marzo: R dio 100 (10 de 10): 100 / 200 * 100 = 50.
      const deC = await resultadosDelAnio(e.admin, c.id, 2003, opc(tx));
      expect(deC.filas.slice(0, 3).map((f) => f.resultado)).toEqual(["50 %", "60 %", "50 %"]);
      expect(deC.acumulado).toMatchObject({ exacto: "50/1", rotulo: "Acumulado desde marzo, versión 2" });
    }));

  it("R1 por R2 con la misma fórmula: el acumulado parte donde rige R2", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const r1 = await e.componenteR();
      const r2 = await e.nuevo({ mide: [e.mide.usuarioId] });
      await e.abrir(r2.id);
      for (const periodo of ["2003-01", "2003-02", "2003-03"]) await e.reportarAB(e.mide, r2.id, periodo, "3", "10");
      const c = await e.nuevo({ formula: "A", variables: { A: { indicadorOrigenId: r1.id, toma: "valor" }, B: { indicadorOrigenId: r1.id, toma: "cumplimiento" } } });
      await versionNueva(tx, {
        indicadorId: c.id,
        usuarioId: e.admin.usuarioId,
        tipoCambio: "mayor",
        rigeDesde: "2003-03",
        aprobadaEn: FEBRERO,
        formula: "A",
        variables: { A: { indicadorOrigenId: r2.id, toma: "valor" }, B: { indicadorOrigenId: r2.id, toma: "cumplimiento" } },
      });
      await e.abrir(c.id);
      await propagar(opc(tx));
      const deC = await resultadosDelAnio(e.admin, c.id, 2003, opc(tx));
      expect(deC.filas.slice(0, 3).map((f) => f.resultado)).toEqual(["50 %", "100 %", "30 %"]);
      // Solo marzo, con R2: 30. Con R2 sobre todo el trimestre también daría 30: lo que lo distingue es el rótulo.
      expect(deC.acumulado).toMatchObject({ exacto: "30/1", rotulo: "Acumulado desde marzo, versión 2" });
    }));

  it("por la propagación: un componente trimestral que cambia R1 por R2 en julio, bajo uno anual, entrega el acumulado de julio a diciembre", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const ENERO_2004 = new Date("2004-01-20T15:00:00Z");
      const r1 = await e.nuevo({ mide: [e.mide.usuarioId] });
      const r2 = await e.nuevo({ mide: [e.mide.usuarioId] });
      await asegurarMediciones({ sql: tx, ahora: ENERO_2004, indicadorId: r1.id });
      await asegurarMediciones({ sql: tx, ahora: ENERO_2004, indicadorId: r2.id });
      for (let mes = 1; mes <= 12; mes++) {
        const periodo = `2003-${String(mes).padStart(2, "0")}`;
        await reportarEn(tx, e.mide, r1.id, periodo, "10", "10", ENERO_2004);
        // R2: 20 % el primer semestre y 60 % el segundo.
        await reportarEn(tx, e.mide, r2.id, periodo, mes <= 6 ? "2" : "6", "10", ENERO_2004);
      }
      const deR = (origen: number) => ({ A: { indicadorOrigenId: origen, toma: "valor" as const }, B: { indicadorOrigenId: origen, toma: "cumplimiento" as const } });
      const x = await e.nuevo({ periodicidad: "trimestral", inicioMedicion: "2003-T1", formula: "A", variables: deR(r1.id) });
      await versionNueva(tx, {
        indicadorId: x.id,
        usuarioId: e.admin.usuarioId,
        tipoCambio: "mayor",
        rigeDesde: "2003-T3",
        aprobadaEn: FEBRERO,
        periodicidad: "trimestral",
        formula: "A",
        variables: deR(r2.id),
      });
      const y = await e.nuevo({ periodicidad: "anual", inicioMedicion: "2003", formula: "A", variables: deR(x.id) });
      for (const i of [x, y]) await asegurarMediciones({ sql: tx, ahora: ENERO_2004, indicadorId: i.id });
      await propagar(opc(tx, ENERO_2004));
      const anio = periodoDe("2003", zonaHoraria())!;
      const v = await valorDeComponente(tx, { indicadorId: x.id, toma: "valor", periodo: "2003", desde: anio.desde, hasta: anio.hasta });
      // R2 de julio a diciembre: 36 de 60. Con R2 sobre todo el año sería 48 de 120 (40).
      expect(v.estado === "listo" ? { valor: aTexto(v.valor), desde: v.desde } : v).toEqual({ valor: "60/1", desde: "2003-T3" });
      const deY = (await tx`SELECT resultado_exacto FROM mediciones WHERE indicador_id = ${y.id} AND periodo = '2003'`)[0];
      expect(deY.resultado_exacto).toBe("60/1");
    }));
});

describe("la constancia de un compuesto congela su acumulado (anexo 14C, §6.7)", () => {
  it("registrarla guarda el acumulado del componente en el tramo, el mismo de la página", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const r = await e.componenteR();
      const c = await e.nuevo({
        formula: "A",
        ente: { nombre: "Ente de prueba", periodicidad: "trimestral", plazoDias: 30 },
        variables: { A: { indicadorOrigenId: r.id, toma: "valor" }, B: { indicadorOrigenId: r.id, toma: "cumplimiento" } },
      });
      await e.abrir(c.id);
      await propagar(opc(tx));
      await asegurarConstancias({ sql: tx, ahora: AHORA, indicadorId: c.id });
      const [k] = await tx`SELECT id FROM reportes_externos WHERE indicador_id = ${c.id} AND periodo = '2003-T1'`;
      await tx`INSERT INTO archivos (contexto, contexto_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
        VALUES ('reporte_externo', ${k.id}, 'evidencia', ${`reportes-externos/${k.id}/${unico()}.pdf`}, 'radicado.pdf', 'pdf',
          'application/pdf', 1024, ${"a".repeat(64)})`;
      await registrarConstancia(e.admin, { reporteId: Number(k.id), fechaEnvio: "2003-04-15", radicado: "ENTE-2003-0001" }, opc(tx));
      const [registrada] = await tx`SELECT resultado_enviado, resultado_detalle FROM reportes_externos WHERE id = ${k.id}`;
      expect(registrada.resultado_enviado).toBe("95,5 %");
      expect(registrada.resultado_detalle).toMatchObject({ exacto: ACUMULADO_DE_R, parcial: true });
      expect(registrada.resultado_detalle).not.toHaveProperty("componenteParcial");
    }));
});
