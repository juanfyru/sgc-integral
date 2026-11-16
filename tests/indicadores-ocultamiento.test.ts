/**
 * Lo que se ve de un compuesto y lo que se oculta (anexo 14C, §6.5; Tarea 17 de la 14C): a quien ve el compuesto pero no uno
 * de sus componentes, la variable tomada de ese componente le aparece como «Indicador restringido» y su valor como «No
 * disponible» en toda lectura (la tabla del año, las gráficas por variable, los valores del acumulado, la pantalla de
 * reportar, el Excel, el impreso, la ficha y el historial de «Corregida»), y ningún texto le nombra el componente; el
 * resultado del compuesto, su color y sus demás variables sí. La regla única es `componentesVisibles`.
 *
 * El caso: el compuesto C, restringido, del proceso P1, toma el valor de R (restringido, del proceso P2) en A y el de G
 * (general, de P1) en B, con la fórmula «(A + B) / 2». Ana está asignada a P1 y analiza C: ve C y G, no R. La gerente ve
 * todo. La prueba de cada lectura busca en lo que sale (`JSON.stringify`, las celdas del Excel, el HTML del impreso) el
 * código de R, su nombre (que lleva el código) y su cifra en cada escritura (37,5, 37.5 y 75/2); para la gerente, las
 * mismas búsquedas encuentran algo.
 *
 * Contra la BD de desarrollo, dentro de una transacción que se revierte, en 2003 y con `ahora` inyectado: los tres se miden
 * desde marzo, aprobados en diciembre de 2002; el 20 de abril (`AHORA`) ya venció el plazo de marzo.
 */
import { existsSync } from "node:fs";
import ExcelJS from "exceljs";
import type { TransactionSql } from "postgres";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { FichaImpresa } from "@/componentes/indicadores/ficha/FichaImpresa";
import { FichaTecnica } from "@/componentes/indicadores/ficha/FichaTecnica";
import { avisoDeFalta, DatosDelSistema } from "@/componentes/indicadores/medicion/DatosDelSistema";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { fichaDeVersion, restringidosQueToma } from "@/db/consultas/indicadores/aprobacion";
import { cerrarMes, historialDeCorregidas, reabrirMedicion } from "@/db/consultas/indicadores/cierre";
import { loToman } from "@/db/consultas/indicadores/componentes";
import { registrarHistoricos } from "@/db/consultas/indicadores/historicos";
import { impresionDelAnio } from "@/db/consultas/indicadores/impresion";
import { medicionParaReportar, obtenerIndicador, resultadosDelAnio, tablaDelAnio } from "@/db/consultas/indicadores/lectura";
import { asegurarMediciones, marcarNoAplica, reportar } from "@/db/consultas/indicadores/mediciones";
import { propagar } from "@/db/consultas/indicadores/propagacion";
import { componentesVisibles, type SujetoVisibilidad } from "@/lib/alcance";
import type { MetaHoja } from "@/lib/distribucion/hoja-excel";
import { construirExcelDeIndicador } from "@/lib/indicadores/excel";
import { camposDeFicha } from "@/lib/indicadores/ficha-en-texto";
import { COMPONENTE_OCULTO, ErrorIndicador, MOTIVO_COMPONENTE_NO_APLICA, RESULTADO_OCULTO, VALOR_OCULTO } from "@/lib/indicadores/tipos";
import { indicadorDePrueba, type IndicadorDePrueba } from "./utiles/indicadores";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

let consecutivo = 0;
const unico = () => `${Date.now() % 100_000_000}${(consecutivo += 1)}`;

const AHORA = new Date("2003-04-20T15:00:00Z");
const APROBADA = new Date("2002-12-15T15:00:00Z");
const MARZO = "2003-03";
/** Días de mayo de 2003: el análisis que pide C le movió el plazo de marzo al 30 de abril (anexo 14C, §3.4). */
const mayo = (d: number) => new Date(`2003-05-${String(d).padStart(2, "0")}T15:00:00Z`);
const JUSTIFICACION = "El servicio corrigió el conteo de casos de marzo";
const HISTORICOS_DE_OTRO = "Este indicador toma el resultado de un indicador que usted no puede ver: sus históricos los registra el Administrador del SGC";
const META: MetaHoja = { hospital: "Entidad Zeta de Prueba", generadoEn: "2003-04-20 10:00", detalle: "Año: 2003" };

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

/** Lo que de R no debe salir para Ana: su código (también en su nombre) y su cifra de marzo, 37,5, en cada escritura. */
const rastrosDe = (r: IndicadorDePrueba, cifras: readonly string[] = ["37,5", "37.5", "75/2"]) => [r.codigo, ...cifras];

/** Los rastros de R que aparecen en `salida`. */
function rastros(salida: unknown, r: IndicadorDePrueba, cifras?: readonly string[]): string[] {
  const texto = typeof salida === "string" ? salida : JSON.stringify(salida);
  return rastrosDe(r, cifras).filter((x) => texto.includes(x));
}

/** El texto de todas las celdas del Excel (los números, con punto decimal), hoja por hoja. */
async function celdasDelExcel(libro: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(libro as unknown as ArrayBuffer);
  const salida: string[] = [];
  wb.eachSheet((hoja) => hoja.eachRow({ includeEmpty: false }, (fila) => fila.eachCell((c) => salida.push(String(c.value)))));
  return salida.join("\n");
}

/** La descripción y la fuente de una variable tomada de `r`, que lo nombran: para Ana no deben salir. */
const delaVariableDe = (r: IndicadorDePrueba) => ({ descripcion: `El cumplimiento de ${r.codigo}`, fuente: `Tablero de ${r.codigo}` });

/** P1, P2, R, G y C, con quienes los miden; Ana, la gerente y alguien de P2. Con `reportados`, los datos de marzo de R y G. */
async function escenario(tx: TransactionSql, o: { reportados?: boolean } = {}) {
  const p1 = await procesoNuevo(tx);
  const p2 = await procesoNuevo(tx);
  const admin = await sesionAdmin(tx);
  const ana = await usuarioDePrueba(tx, { rol: "consulta", procesos: [p1] });
  const gerente = await usuarioDePrueba(tx, { rol: "gerencia" });
  const deP2 = await usuarioDePrueba(tx, { rol: "consulta", procesos: [p2] });
  const mideR = await usuarioDePrueba(tx, { rol: "consulta" });
  const mideG = await usuarioDePrueba(tx, { rol: "consulta" });
  const base = { periodicidad: "mensual" as const, inicioMedicion: MARZO, aprobadaEn: APROBADA };
  const r = await indicadorDePrueba(tx, { ...base, procesoId: p2, nivelAcceso: "restringido", mide: [mideR.usuarioId] });
  const g = await indicadorDePrueba(tx, { ...base, procesoId: p1, mide: [mideG.usuarioId] });
  const nombreDeR = `Indicador de prueba ${r.codigo}`;
  const c = await indicadorDePrueba(tx, {
    ...base,
    procesoId: p1,
    nivelAcceso: "restringido",
    analiza: [ana.usuarioId, gerente.usuarioId],
    formula: "(A + B) / 2",
    // La variable tomada lleva el nombre, la descripción y la fuente que la nombran, como las escribiría quien elabora la ficha.
    variables: {
      A: { indicadorOrigenId: r.id, toma: "valor", nombre: nombreDeR, ...delaVariableDe(r) },
      B: { indicadorOrigenId: g.id, toma: "valor", nombre: "Casos atendidos" },
    },
  });
  for (const i of [r, g, c]) await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: i.id });
  const m = { r: await medicionDe(tx, r.id, MARZO), g: await medicionDe(tx, g.id, MARZO), c: await medicionDe(tx, c.id, MARZO) };
  const reportarAB = (quien: SesionFlujo, medicionId: number, A: string, B: string, ahora = AHORA) =>
    reportar(quien, { medicionId, valores: { A, B }, parcial: false, confirmado: true }, opc(tx, ahora));
  if (o.reportados !== false) {
    // R: 3 de 8, 37,5 %; G: 9 de 10, 90 %; C: (37,5 + 90) / 2 = 63,75.
    await reportarAB(mideR, m.r, "3", "8");
    await reportarAB(mideG, m.g, "9", "10");
    await propagar(opc(tx));
  }
  return { p1, p2, admin, ana, gerente, deP2, mideR, mideG, r, g, c, m, nombreDeR, reportarAB };
}

describe("componentesVisibles: la única regla de quién ve un componente", () => {
  it("Ana ve G y no R; la gerente, los dos", () =>
    revertida(sql, async (tx) => {
      const e = await escenario(tx, { reportados: false });
      expect([...(await componentesVisibles(tx, e.ana, [e.r.id, e.g.id]))]).toEqual([e.g.id]);
      expect([...(await componentesVisibles(tx, e.gerente, [e.r.id, e.g.id, e.r.id]))].sort((a, b) => a - b)).toEqual([e.r.id, e.g.id].sort((a, b) => a - b));
      expect((await componentesVisibles(tx, e.ana, [])).size).toBe(0);
    }));
});

describe("las lecturas de un periodo", () => {
  it("la tabla del año, las series, el acumulado y la pantalla de reportar traen la variable de R oculta; la de G y el resultado, completos", () =>
    revertida(sql, async (tx) => {
      const e = await escenario(tx);
      const oculta = { letra: "A", nombre: COMPONENTE_OCULTO, valor: VALOR_OCULTO, numero: null, oculta: true };

      const tabla = await tablaDelAnio(e.ana, e.c.id, 2003, opc(tx));
      const marzo = tabla.find((f) => f.periodo === MARZO)!;
      expect(marzo.valores).toEqual([oculta, { letra: "B", nombre: "Casos atendidos", valor: "90", numero: 90 }]);
      expect(marzo.resultado).toBe("63,8 %");
      expect(rastros(tabla, e.r)).toEqual([]);

      const r = await resultadosDelAnio(e.ana, e.c.id, 2003, opc(tx));
      expect(r.filas.find((f) => f.periodo === MARZO)!.valores[0]).toEqual(oculta);
      const [serieA, serieB] = r.variables;
      expect(serieA).toMatchObject({ letra: "A", nombre: COMPONENTE_OCULTO, oculta: true });
      expect(serieA.serie.find((p) => p.clave === MARZO)).toMatchObject({ valor: null, texto: VALOR_OCULTO });
      expect(serieB).toMatchObject({ letra: "B", nombre: "Casos atendidos" });
      expect(serieB.serie.find((p) => p.clave === MARZO)).toMatchObject({ valor: 90, texto: "90" });
      expect(r.acumulado).toMatchObject({ texto: "63,8 %", valores: { A: VALOR_OCULTO, B: "90" }, numeros: { A: null, B: 90 } });
      expect(rastros(r, e.r)).toEqual([]);

      const reporte = (await medicionParaReportar(e.ana, e.c.codigo, MARZO, opc(tx)))!;
      expect(reporte.resultado).toBe("255/4");
      expect(reporte.variables[0]).toMatchObject({ letra: "A", nombre: COMPONENTE_OCULTO, valor: null, oculta: true, descripcion: null, fuente: null });
      expect(reporte.variables[0].ajena).toMatchObject({ clase: "indicador", fuenteId: null, codigo: null, nombre: COMPONENTE_OCULTO, valor: null, oculta: true, llego: true });
      expect(reporte.variables[1]).toMatchObject({ letra: "B", nombre: "Casos atendidos", valor: "90" });
      expect(reporte.variables[1].ajena).toMatchObject({ fuenteId: e.g.id, codigo: e.g.codigo, valor: "90" });
      expect(reporte.formulaEnPalabras).toContain(COMPONENTE_OCULTO);
      expect(rastros(reporte, e.r)).toEqual([]);
      // La pantalla: el componente, sin cifra ni aviso de que falte.
      const html = renderToStaticMarkup(createElement(DatosDelSistema, { datos: reporte }));
      expect(html).toContain(COMPONENTE_OCULTO);
      expect(html).toContain(VALOR_OCULTO);
      expect(rastros(html, e.r)).toEqual([]);
      expect(avisoDeFalta(reporte.variables[0], false)).toBeNull();

      // La gerente lo ve todo: las mismas búsquedas encuentran el código y la cifra de R.
      const suya = [
        await tablaDelAnio(e.gerente, e.c.id, 2003, opc(tx)),
        await resultadosDelAnio(e.gerente, e.c.id, 2003, opc(tx)),
        await medicionParaReportar(e.gerente, e.c.codigo, MARZO, opc(tx)),
      ];
      for (const s of suya) {
        const hallados = rastros(s, e.r);
        expect(hallados).toContain(e.r.codigo);
        // Su cifra, con coma en la tabla y las series, con punto en lo que viaja al formulario de reportar.
        expect(hallados.some((x) => x !== e.r.codigo)).toBe(true);
      }
      expect((suya[0] as Awaited<ReturnType<typeof tablaDelAnio>>).find((f) => f.periodo === MARZO)!.valores[0]).toEqual({
        letra: "A",
        nombre: e.nombreDeR,
        valor: "37,5",
        numero: 37.5,
      });
    }));

  it("mientras R no tiene resultado, la pantalla de Ana dice «Falta un dato de un componente.», sin nombrarlo", () =>
    revertida(sql, async (tx) => {
      const e = await escenario(tx, { reportados: false });
      const reporte = (await medicionParaReportar(e.ana, e.c.codigo, MARZO, opc(tx)))!;
      expect(reporte.variables[0].ajena).toMatchObject({ oculta: true, llego: false, valor: null });
      expect(avisoDeFalta(reporte.variables[0], false)).toBe("Falta un dato de un componente.");
      expect(avisoDeFalta(reporte.variables[1], false)).toBe(`Falta un dato. Sale de ${e.g.codigo} Indicador de prueba ${e.g.codigo}, que aún no tiene resultado.`);
      const html = renderToStaticMarkup(createElement(DatosDelSistema, { datos: reporte }));
      expect(html).toContain("Falta un dato de un componente.");
      expect(rastros(html, e.r)).toEqual([]);
    }));

  it("un mixto que mide Ana (A de R, B propia): su pantalla no trae nada de R; reporta lo suyo, el resultado sale, y un valor para A se rechaza sin nombrarla", () =>
    revertida(sql, async (tx) => {
      const e = await escenario(tx);
      const mixto = await indicadorDePrueba(tx, {
        periodicidad: "mensual",
        inicioMedicion: MARZO,
        aprobadaEn: APROBADA,
        procesoId: e.p1,
        nivelAcceso: "restringido",
        mide: [e.ana.usuarioId],
        formula: "A + B",
        variables: { A: { indicadorOrigenId: e.r.id, toma: "valor", nombre: e.nombreDeR, ...delaVariableDe(e.r) }, B: { nombre: "Casos propios" } },
      });
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: mixto.id });
      await propagar(opc(tx));
      const deMixto = await medicionDe(tx, mixto.id, MARZO);

      const reporte = (await medicionParaReportar(e.ana, mixto.codigo, MARZO, opc(tx)))!;
      expect(reporte.mide).toBe(true);
      expect(reporte.variables[0]).toMatchObject({ nombre: COMPONENTE_OCULTO, oculta: true, valor: null, descripcion: null, fuente: null });
      expect(reporte.variables[0].ajena).toMatchObject({ oculta: true, llego: true, valor: null, codigo: null, fuenteId: null });
      expect(reporte.variables[1]).toMatchObject({ nombre: "Casos propios", valor: null, ajena: null });
      expect(rastros(reporte, e.r)).toEqual([]);

      // Un valor para A, que el formulario no manda, se rechaza por su letra: el nombre de la variable puede nombrar a R.
      const err = await reportar(e.ana, { medicionId: deMixto, valores: { A: "50", B: "10" }, parcial: false, confirmado: true }, opc(tx)).then(
        () => null,
        (x: unknown) => x,
      );
      expect((err as Error).message).toBe("La variable A no se digita desde aquí: llega de otro indicador");
      await reportar(e.ana, { medicionId: deMixto, valores: { B: "10" }, parcial: false, confirmado: true }, opc(tx));

      // 37,5 de R más 10 propios.
      const fila = (await tablaDelAnio(e.ana, mixto.id, 2003, opc(tx))).find((f) => f.periodo === MARZO)!;
      expect(fila.resultado).toBe("47,5 %");
      expect(fila.valores).toEqual([
        { letra: "A", nombre: COMPONENTE_OCULTO, valor: VALOR_OCULTO, numero: null, oculta: true },
        { letra: "B", nombre: "Casos propios", valor: "10", numero: 10 },
      ]);
      expect(rastros(fila, e.r)).toEqual([]);
      expect(rastros(await medicionParaReportar(e.ana, mixto.codigo, MARZO, opc(tx)), e.r)).toEqual([]);
    }));
});

describe("el Excel, el impreso y la ficha", () => {
  it("para Ana no llevan el código, el nombre ni la cifra de R; la ficha dice «Resultado de un indicador restringido»; para la gerente, sí los llevan", () =>
    revertida(sql, async (tx) => {
      const e = await escenario(tx);
      const deAna = (await impresionDelAnio(e.ana, e.c.codigo, 2003, opc(tx)))!;
      const deGerente = (await impresionDelAnio(e.gerente, e.c.codigo, 2003, opc(tx)))!;

      const excelDeAna = await celdasDelExcel(await construirExcelDeIndicador(deAna, META));
      expect(rastros(excelDeAna, e.r)).toEqual([]);
      expect(excelDeAna).toContain(RESULTADO_OCULTO);
      expect(excelDeAna).toContain(COMPONENTE_OCULTO);
      expect(excelDeAna).toContain(VALOR_OCULTO);
      const excelDeGerente = await celdasDelExcel(await construirExcelDeIndicador(deGerente, META));
      expect(rastros(excelDeGerente, e.r, ["37.5"])).toEqual([e.r.codigo, "37.5"]);

      const impreso = (d: typeof deAna) => renderToStaticMarkup(createElement(FichaImpresa, { entidad: "Entidad Zeta de Prueba", logo: null, ...d }));
      const impresoDeAna = impreso(deAna);
      expect(rastros(impresoDeAna, e.r)).toEqual([]);
      expect(impresoDeAna).toContain(RESULTADO_OCULTO);
      expect(impresoDeAna).toContain(VALOR_OCULTO);
      expect(rastros(impreso(deGerente), e.r, ["37,5"])).toEqual([e.r.codigo, "37,5"]);

      // La ficha en texto, la vista (la misma de «Versiones anteriores») y lo que viaja de ella.
      const ficha = (await fichaDeVersion(e.ana, e.c.versionId, { sql: tx }))!;
      expect(rastros(ficha, e.r)).toEqual([]);
      const variableA = camposDeFicha(ficha).estructura.find((x) => x.termino === "Variable A")!;
      expect(variableA).toMatchObject({ valor: COMPONENTE_OCULTO });
      expect(variableA.detalle).toContain(RESULTADO_OCULTO);
      const variableB = camposDeFicha(ficha).estructura.find((x) => x.termino === "Variable B")!;
      expect(variableB.detalle).toContain(`Resultado de ${e.g.codigo}`);
      const vista = renderToStaticMarkup(createElement(FichaTecnica, { ficha, operacion: null }));
      expect(vista).toContain(RESULTADO_OCULTO);
      expect(rastros(vista, e.r)).toEqual([]);
      const suya = (await fichaDeVersion(e.gerente, e.c.versionId, { sql: tx }))!;
      expect(camposDeFicha(suya).estructura.find((x) => x.termino === "Variable A")!.detalle).toContain(`Resultado de ${e.r.codigo}`);
      expect(renderToStaticMarkup(createElement(FichaTecnica, { ficha: suya, operacion: null }))).toContain(e.r.codigo);

      // El aviso de deducción nombra al componente solo a quien lo ve.
      expect(await restringidosQueToma(tx, e.c.versionId, e.ana)).toEqual([COMPONENTE_OCULTO]);
      expect(await restringidosQueToma(tx, e.c.versionId, e.gerente)).toEqual([e.nombreDeR]);
    }));
});

describe("los eventos y los avisos", () => {
  it("tras reabrir R en cascada y corregirlo: el historial de Ana no pinta el antes ni el después de A y dice «El sistema actualizó un componente»; el aviso no nombra a R", () =>
    revertida(sql, async (tx) => {
      const e = await escenario(tx);
      await cerrarMes(e.admin, MARZO, opc(tx, mayo(5)));
      expect((await tx`SELECT estado FROM mediciones WHERE id = ${e.m.c}`)[0].estado).toBe("cerrada");
      await reabrirMedicion(e.admin, { medicionId: e.m.r, justificacion: JUSTIFICACION }, opc(tx, mayo(6)));
      // R corrige: 5 de 8, 62,5 %; C queda en (62,5 + 90) / 2 = 76,25.
      await e.reportarAB(e.mideR, e.m.r, "5", "8", mayo(7));
      await propagar(opc(tx, mayo(7)));
      expect((await tx`SELECT resultado_exacto FROM mediciones WHERE id = ${e.m.c}`)[0].resultado_exacto).toBe("305/4");

      const cifras = ["37,5", "37.5", "75/2", "62,5", "62.5", "125/2"];
      const deAna = (await historialDeCorregidas(e.ana, e.c.id, [e.m.c], { sql: tx })).get(e.m.c)!;
      expect(rastros(deAna, e.r, cifras)).toEqual([]);
      expect(deAna.find((x) => x.que === "Reabrió")?.fuente).toBe("Por un cambio en un componente");
      const propagacion = deAna.find((x) => x.que.startsWith("El sistema actualizó"))!;
      expect(propagacion.que).toBe("El sistema actualizó un componente");
      expect(propagacion.cambios.some((c) => c.startsWith(COMPONENTE_OCULTO) || c.startsWith("A:"))).toBe(false);
      // El resultado del compuesto sí cambia a la vista de Ana.
      expect(propagacion.cambios).toContain("Resultado: 63,8 % → 76,3 %");

      const deGerente = (await historialDeCorregidas(e.gerente, e.c.id, [e.m.c], { sql: tx })).get(e.m.c)!;
      expect(deGerente.find((x) => x.que === "Reabrió")?.fuente).toBe(`Por un cambio en ${e.r.codigo} ${e.nombreDeR}, marzo de 2003`);
      const suya = deGerente.find((x) => x.que.startsWith("El sistema actualizó"))!;
      expect(suya.que).toBe(`El sistema actualizó «${e.nombreDeR}» (sale de ${e.r.codigo} ${e.nombreDeR}): de 37,5 a 62,5`);
      expect(suya.cambios).toContain(`${e.nombreDeR}: 37,5 → 62,5`);

      // El aviso de la reapertura en cascada, por destinatario.
      const avisos = await tx`SELECT usuario_id, cuerpo FROM notificaciones
        WHERE tipo = 'indicadores.reabierta' AND entidad = 'medicion' AND entidad_id = ${e.m.c} ORDER BY usuario_id`;
      const cuerpoDe = (u: SujetoVisibilidad) => avisos.find((a) => Number(a.usuario_id) === u.usuarioId)?.cuerpo as string;
      expect(cuerpoDe(e.ana)).toContain("por un cambio en un componente");
      expect(rastros(cuerpoDe(e.ana), e.r, cifras)).toEqual([]);
      expect(cuerpoDe(e.gerente)).toContain(e.r.codigo);
    }));

  it("con R «No aplica», C queda «No aplica»: Ana lee «Un componente no aplicó en el periodo» y la gerente, el código y el nombre de R", () =>
    revertida(sql, async (tx) => {
      const e = await escenario(tx, { reportados: false });
      await marcarNoAplica(e.mideR, { medicionId: e.m.r, motivo: "Sin casos en el mes" }, opc(tx));
      await e.reportarAB(e.mideG, e.m.g, "9", "10");
      await propagar(opc(tx));
      const m = (await tx`SELECT no_aplica, no_aplica_motivo FROM mediciones WHERE id = ${e.m.c}`)[0];
      expect([m.no_aplica, m.no_aplica_motivo]).toEqual([true, MOTIVO_COMPONENTE_NO_APLICA]);

      const paraGerente = `${e.r.codigo} ${e.nombreDeR} no aplicó en el periodo`;
      const deAna = (await tablaDelAnio(e.ana, e.c.id, 2003, opc(tx))).find((f) => f.periodo === MARZO)!;
      expect([deAna.motivo, deAna.frase]).toEqual([MOTIVO_COMPONENTE_NO_APLICA, `No aplica: ${MOTIVO_COMPONENTE_NO_APLICA}.`]);
      const deGerente = (await tablaDelAnio(e.gerente, e.c.id, 2003, opc(tx))).find((f) => f.periodo === MARZO)!;
      expect([deGerente.motivo, deGerente.frase]).toEqual([paraGerente, `No aplica: ${paraGerente}.`]);

      expect((await obtenerIndicador(e.ana, e.c.codigo, opc(tx)))!.ultimo?.frase).toBe(`No aplica: ${MOTIVO_COMPONENTE_NO_APLICA}.`);
      expect((await obtenerIndicador(e.gerente, e.c.codigo, opc(tx)))!.ultimo?.frase).toBe(`No aplica: ${paraGerente}.`);
      expect((await medicionParaReportar(e.ana, e.c.codigo, MARZO, opc(tx)))!.motivo).toBe(MOTIVO_COMPONENTE_NO_APLICA);
      expect((await medicionParaReportar(e.gerente, e.c.codigo, MARZO, opc(tx)))!.motivo).toBe(paraGerente);
    }));
});

describe("en sentido contrario y los históricos", () => {
  it("«Lo toman» de R: la gerente ve C; alguien de P2, que no ve C, no ve ninguno; Ana, en G, ve C", () =>
    revertida(sql, async (tx) => {
      const e = await escenario(tx, { reportados: false });
      expect(await loToman(tx, e.gerente, e.r.id)).toEqual([{ codigo: e.c.codigo, nombre: `Indicador de prueba ${e.c.codigo}` }]);
      expect(await loToman(tx, e.deP2, e.r.id)).toEqual([]);
      expect(await loToman(tx, e.ana, e.g.id)).toEqual([{ codigo: e.c.codigo, nombre: `Indicador de prueba ${e.c.codigo}` }]);
      expect(await loToman(tx, e.gerente, e.c.id)).toEqual([]);
    }));

  it("los históricos de un compuesto los rechaza a quien no ve uno de sus componentes; quien administra, sí los registra", () =>
    revertida(sql, async (tx) => {
      const e = await escenario(tx, { reportados: false });
      // Aprobado el 5 de abril: marzo es histórico. Ana lo mide.
      const c2 = await indicadorDePrueba(tx, {
        periodicidad: "mensual",
        inicioMedicion: MARZO,
        aprobadaEn: new Date("2003-04-05T15:00:00Z"),
        procesoId: e.p1,
        nivelAcceso: "restringido",
        mide: [e.ana.usuarioId],
        formula: "(A + B) / 2",
        variables: { A: { indicadorOrigenId: e.r.id, toma: "valor" }, B: { indicadorOrigenId: e.g.id, toma: "valor" } },
      });
      const filas = [{ periodo: MARZO, valores: { A: "40", B: "90" } }];
      const err = await registrarHistoricos(e.ana, { indicadorId: c2.id, filas }, opc(tx)).then(
        () => null,
        (x: unknown) => x,
      );
      expect(err).toBeInstanceOf(ErrorIndicador);
      expect((err as Error).message).toBe(HISTORICOS_DE_OTRO);
      expect(await registrarHistoricos(e.admin, { indicadorId: c2.id, filas }, opc(tx))).toEqual({ registrados: 1 });
    }));
});
