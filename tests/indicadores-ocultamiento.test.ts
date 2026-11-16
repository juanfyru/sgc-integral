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
import { afterAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

// La página lee con `obtenerSql()`: dentro de un caso, la transacción; cuántas veces se pide el valor de un componente
// para el «desde cuándo» (anexo 14C, §6.3), para fijar que un compuesto mensual no lo pide.
const contexto = vi.hoisted(() => ({ sql: null as unknown, valorDeComponente: 0 }));
vi.mock("@/db/cliente", async (original) => {
  const real = await original<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => (contexto.sql ?? real.obtenerSql()) as ReturnType<typeof real.obtenerSql> };
});
vi.mock("@/db/consultas/indicadores/propagacion", async (original) => {
  const real = await original<typeof import("@/db/consultas/indicadores/propagacion")>();
  return {
    ...real,
    valorDeComponente: (...args: Parameters<typeof real.valorDeComponente>) => {
      contexto.valorDeComponente += 1;
      return real.valorDeComponente(...args);
    },
  };
});
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NO_ENCONTRADA");
  },
}));

import { FichaImpresa } from "@/componentes/indicadores/ficha/FichaImpresa";
import { FichaTecnica } from "@/componentes/indicadores/ficha/FichaTecnica";
import { avisoDeFalta, DatosDelSistema } from "@/componentes/indicadores/medicion/DatosDelSistema";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { datosDeFicha } from "@/app/(app)/indicadores/[codigo]/_vistas";
import { fichaDeVersion, restringidosQueToma, versionesVisibles } from "@/db/consultas/indicadores/aprobacion";
import { cerrarMes, historialDeCorregidas, reabrirMedicion } from "@/db/consultas/indicadores/cierre";
import { loToman } from "@/db/consultas/indicadores/componentes";
import { registrarHistoricos } from "@/db/consultas/indicadores/historicos";
import { impresionDelAnio } from "@/db/consultas/indicadores/impresion";
import { medicionParaReportar, obtenerIndicador, resultadosDelAnio, tablaDelAnio } from "@/db/consultas/indicadores/lectura";
import { asegurarMediciones, marcarNoAplica, quitarNoAplica, reportar } from "@/db/consultas/indicadores/mediciones";
import { propagar } from "@/db/consultas/indicadores/propagacion";
import { componentesVisibles, type SujetoVisibilidad } from "@/lib/alcance";
import type { MetaHoja } from "@/lib/distribucion/hoja-excel";
import { construirExcelDeIndicador } from "@/lib/indicadores/excel";
import { camposDeFicha } from "@/lib/indicadores/ficha-en-texto";
import { historialDeCorreccion, type ComponentesDelHistorial, type EventoDeMedicion } from "@/lib/indicadores/historial";
import { COMPONENTE_OCULTO, ErrorIndicador, MOTIVO_COMPONENTE_NO_APLICA, RESULTADO_OCULTO, VALOR_OCULTO } from "@/lib/indicadores/tipos";
import type { SesionValida } from "@/lib/sesion";
import { indicadorDePrueba, versionNueva, type IndicadorDePrueba } from "./utiles/indicadores";
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
  // `text`, no `value`: una celda de texto enriquecido o con hipervínculo da su texto, no «[object Object]».
  wb.eachSheet((hoja) => hoja.eachRow({ includeEmpty: false }, (fila) => fila.eachCell((c) => salida.push(c.text))));
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
      // Sin id: la variable oculta no dice de qué indicador sale.
      expect(ficha.contenido.variables[0]).toMatchObject({ nombre: COMPONENTE_OCULTO, indicadorOrigenId: null, origenCodigo: null, origenNombre: null });
      expect(ficha.componentesVisibles).toEqual([e.g.id]);
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

// ─────────────────────────────────────────────────────────────────────────────
// Ronda 1: el «desde cuándo» (I2), el motivo vigente del contagio (M1), lo que se oculta en el acumulado (M2) y «Lo
// toman» por la lectura de la página (M6)
// ─────────────────────────────────────────────────────────────────────────────

const valida = (s: SesionFlujo): SesionValida => ({
  ...s,
  sesionId: "prueba",
  usuario: `zz_${s.usuarioId}`,
  totpActivo: false,
  factorPendiente: false,
  debeCambiarClave: false,
  aceptoDatos: true,
  tema: "sistema",
});

describe("el «desde cuándo» junto a la variable (anexo 14C, §6.3)", () => {
  /** Rh mensual desde enero, aprobado el 1 de marzo (enero y febrero son históricos), y K, trimestral, su espejo. */
  async function trimestral(tx: TransactionSql) {
    const e = await escenario(tx, { reportados: false });
    const rh = await indicadorDePrueba(tx, {
      periodicidad: "mensual",
      inicioMedicion: "2003-01",
      aprobadaEn: new Date("2003-03-01T15:00:00Z"),
      procesoId: e.p2,
      nivelAcceso: "restringido",
      mide: [e.mideR.usuarioId],
    });
    const k = await indicadorDePrueba(tx, {
      periodicidad: "trimestral",
      inicioMedicion: "2003-T1",
      aprobadaEn: APROBADA,
      procesoId: e.p1,
      nivelAcceso: "restringido",
      analiza: [e.ana.usuarioId, e.gerente.usuarioId],
      formula: "A",
      variables: { A: { indicadorOrigenId: rh.id, toma: "valor" }, B: { indicadorOrigenId: rh.id, toma: "cumplimiento" } },
    });
    for (const i of [rh, k]) await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: i.id });
    await e.reportarAB(e.mideR, await medicionDe(tx, rh.id, MARZO), "6", "8");
    await propagar(opc(tx));
    return { ...e, rh, k };
  }

  it("la gerente lee «acumulado solo de marzo» en la fila y en la pantalla de reportar; Ana, que no ve el componente, no recibe nada", () =>
    revertida(sql, async (tx) => {
      const e = await trimestral(tx);
      const T1 = "2003-T1";
      contexto.valorDeComponente = 0;
      const fila = (await tablaDelAnio(e.gerente, e.k.id, 2003, opc(tx))).find((f) => f.periodo === T1)!;
      // La cuenta del caso mensual ve las llamadas de la lectura: aquí, una por variable tomada.
      expect(contexto.valorDeComponente).toBe(2);
      expect(fila.valores.map((v) => v.acumulaDesde)).toEqual(["2003-03", "2003-03"]);
      const reporte = (await medicionParaReportar(e.gerente, e.k.codigo, T1, opc(tx)))!;
      expect(reporte.variables[0].ajena).toMatchObject({ acumulaDesde: "2003-03" });
      expect(renderToStaticMarkup(createElement(DatosDelSistema, { datos: reporte }))).toContain("(acumulado solo de marzo)");
      const impreso = (await impresionDelAnio(e.gerente, e.k.codigo, 2003, opc(tx)))!;
      expect(renderToStaticMarkup(createElement(FichaImpresa, { entidad: "Entidad Zeta de Prueba", logo: null, ...impreso }))).toContain(
        "acumulado solo de marzo",
      );

      // Ana: el campo no viaja, ni la frase.
      const suPantalla = await medicionParaReportar(e.ana, e.k.codigo, T1, opc(tx));
      expect(suPantalla).not.toBeNull();
      const suyas = [await tablaDelAnio(e.ana, e.k.id, 2003, opc(tx)), await resultadosDelAnio(e.ana, e.k.id, 2003, opc(tx)), suPantalla];
      for (const s of suyas) {
        expect(JSON.stringify(s)).not.toContain("acumulaDesde");
        expect(rastros(s, e.rh, [])).toEqual([]);
      }
    }));

  it("en un mixto que aún espera su dato propio, la fila ya pinta la cifra copiada y su «desde»", () =>
    revertida(sql, async (tx) => {
      const e = await trimestral(tx);
      const mixto = await indicadorDePrueba(tx, {
        periodicidad: "trimestral",
        inicioMedicion: "2003-T1",
        aprobadaEn: APROBADA,
        procesoId: e.p1,
        nivelAcceso: "restringido",
        mide: [e.ana.usuarioId],
        formula: "A + B",
        variables: { A: { indicadorOrigenId: e.rh.id, toma: "valor" }, B: { nombre: "Casos propios" } },
      });
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: mixto.id });
      await propagar(opc(tx));
      const fila = (await tablaDelAnio(e.gerente, mixto.id, 2003, opc(tx))).find((f) => f.periodo === "2003-T1")!;
      expect(fila.resultado).toBeNull();
      expect(fila.valores[0]).toMatchObject({ letra: "A", valor: "75", acumulaDesde: "2003-03" });
      expect(fila.valores[1]).not.toHaveProperty("acumulaDesde");
    }));

  it("con enero registrado, el componente cubre el trimestre desde su inicio: nada que decir", () =>
    revertida(sql, async (tx) => {
      const e = await trimestral(tx);
      await registrarHistoricos(e.admin, { indicadorId: e.rh.id, filas: [{ periodo: "2003-01", valores: { A: "5", B: "8" } }] }, opc(tx));
      await propagar(opc(tx));
      const fila = (await tablaDelAnio(e.gerente, e.k.id, 2003, opc(tx))).find((f) => f.periodo === "2003-T1")!;
      expect(fila.resultado).toBe("68,8 %");
      expect(JSON.stringify(fila)).not.toContain("acumulaDesde");
    }));

  it("si la fuente cambió y la propagación aún no pasó, la frase no acompaña a la cifra copiada", () =>
    revertida(sql, async (tx) => {
      const e = await trimestral(tx);
      // R corrige marzo: la cifra de K sigue siendo la de antes hasta la propagación.
      await e.reportarAB(e.mideR, await medicionDe(tx, e.rh.id, MARZO), "7", "8");
      const fila = (await tablaDelAnio(e.gerente, e.k.id, 2003, opc(tx))).find((f) => f.periodo === "2003-T1")!;
      expect(fila.valores[0].valor).toBe("75");
      expect(JSON.stringify(fila)).not.toContain("acumulaDesde");
    }));

  it("un compuesto mensual no pide el valor de su componente para leer su tabla ni su pantalla de reportar", () =>
    revertida(sql, async (tx) => {
      const e = await escenario(tx);
      contexto.valorDeComponente = 0;
      await tablaDelAnio(e.gerente, e.c.id, 2003, opc(tx));
      await resultadosDelAnio(e.gerente, e.c.id, 2003, opc(tx));
      await medicionParaReportar(e.gerente, e.c.codigo, MARZO, opc(tx));
      expect(contexto.valorDeComponente).toBe(0);
    }));
});

describe("el motivo vigente del contagio (anexo 14C, §6.3)", () => {
  it("con G y R «No aplica» y después G aplica: el motivo nombra a R a quien lo ve, el genérico a Ana, y nadie lee G", () =>
    revertida(sql, async (tx) => {
      const e = await escenario(tx, { reportados: false });
      // A sale de G (general) y B de R (restringido): el evento del contagio guarda G, el primero.
      const c2 = await indicadorDePrueba(tx, {
        periodicidad: "mensual",
        inicioMedicion: MARZO,
        aprobadaEn: APROBADA,
        procesoId: e.p1,
        nivelAcceso: "restringido",
        analiza: [e.ana.usuarioId, e.gerente.usuarioId],
        formula: "(A + B) / 2",
        variables: { A: { indicadorOrigenId: e.g.id, toma: "valor" }, B: { indicadorOrigenId: e.r.id, toma: "valor" } },
      });
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: c2.id });
      const deC2 = await medicionDe(tx, c2.id, MARZO);
      await marcarNoAplica(e.mideG, { medicionId: e.m.g, motivo: "Sin casos en el mes" }, opc(tx));
      await marcarNoAplica(e.mideR, { medicionId: e.m.r, motivo: "Sin casos en el mes" }, opc(tx));
      await propagar(opc(tx));
      const contagio = await tx`SELECT detalle FROM medicion_eventos WHERE medicion_id = ${deC2} AND tipo = 'propagacion' AND detalle ? 'componente'`;
      expect(contagio.map((x) => (x.detalle as { componente: number }).componente)).toEqual([e.g.id]);
      // G vuelve a aplicar; R sigue «No aplica»: C2 también, ahora por R.
      await quitarNoAplica(e.mideG, e.m.g, opc(tx));
      await e.reportarAB(e.mideG, e.m.g, "9", "10");
      await propagar(opc(tx));
      expect((await tx`SELECT no_aplica_motivo FROM mediciones WHERE id = ${deC2}`)[0].no_aplica_motivo).toBe(MOTIVO_COMPONENTE_NO_APLICA);

      const porR = `${e.r.codigo} ${e.nombreDeR} no aplicó en el periodo`;
      const fila = async (quien: SesionFlujo) => (await tablaDelAnio(quien, c2.id, 2003, opc(tx))).find((f) => f.periodo === MARZO)!;
      expect((await fila(e.gerente)).motivo).toBe(porR);
      expect((await fila(e.ana)).motivo).toBe(MOTIVO_COMPONENTE_NO_APLICA);
      expect((await obtenerIndicador(e.gerente, c2.codigo, opc(tx)))!.ultimo?.frase).toBe(`No aplica: ${porR}.`);
      expect((await obtenerIndicador(e.ana, c2.codigo, opc(tx)))!.ultimo?.frase).toBe(`No aplica: ${MOTIVO_COMPONENTE_NO_APLICA}.`);
      expect((await medicionParaReportar(e.gerente, c2.codigo, MARZO, opc(tx)))!.motivo).toBe(porR);
      expect((await medicionParaReportar(e.ana, c2.codigo, MARZO, opc(tx)))!.motivo).toBe(MOTIVO_COMPONENTE_NO_APLICA);
      for (const quien of [e.gerente, e.ana]) {
        expect(JSON.stringify(await fila(quien))).not.toContain(e.g.codigo);
      }
    }));
});

describe("el motivo vigente nombra al primero que no aplica entre los que quien lee ve (anexo 14C, §6.5)", () => {
  /** Dos compuestos con R (oculto a Ana) y G (que ve) en los dos órdenes de variables. */
  async function dosOrdenes(tx: TransactionSql) {
    const e = await escenario(tx, { reportados: false });
    const con = (A: number, B: number) =>
      indicadorDePrueba(tx, {
        periodicidad: "mensual",
        inicioMedicion: MARZO,
        aprobadaEn: APROBADA,
        procesoId: e.p1,
        nivelAcceso: "restringido",
        analiza: [e.ana.usuarioId, e.gerente.usuarioId],
        formula: "(A + B) / 2",
        variables: { A: { indicadorOrigenId: A, toma: "valor" }, B: { indicadorOrigenId: B, toma: "valor" } },
      });
    const rg = await con(e.r.id, e.g.id);
    const gr = await con(e.g.id, e.r.id);
    for (const i of [rg, gr]) await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: i.id });
    const motivoDe = async (quien: SesionFlujo, c: IndicadorDePrueba) => (await tablaDelAnio(quien, c.id, 2003, opc(tx))).find((f) => f.periodo === MARZO)!.motivo;
    return { ...e, rg, gr, motivoDe, porG: `${e.g.codigo} Indicador de prueba ${e.g.codigo} no aplicó en el periodo`, porR: `${e.r.codigo} ${e.nombreDeR} no aplicó en el periodo` };
  }

  it("G no aplica: Ana lee G en los dos órdenes, aplique R o no; cuando solo R no aplica, el genérico", () =>
    revertida(sql, async (tx) => {
      const e = await dosOrdenes(tx);
      await marcarNoAplica(e.mideG, { medicionId: e.m.g, motivo: "Sin casos en el mes" }, opc(tx));
      await marcarNoAplica(e.mideR, { medicionId: e.m.r, motivo: "Sin casos en el mes" }, opc(tx));
      await propagar(opc(tx));
      // Los dos no aplican: Ana lee G (no puede saber nada de R); la gerente, el primero.
      expect([await e.motivoDe(e.ana, e.rg), await e.motivoDe(e.ana, e.gr)]).toEqual([e.porG, e.porG]);
      expect([await e.motivoDe(e.gerente, e.rg), await e.motivoDe(e.gerente, e.gr)]).toEqual([e.porR, e.porG]);

      // G vuelve a aplicar: solo R causa el «No aplica».
      await quitarNoAplica(e.mideG, e.m.g, opc(tx));
      await e.reportarAB(e.mideG, e.m.g, "9", "10");
      await propagar(opc(tx));
      expect([await e.motivoDe(e.ana, e.rg), await e.motivoDe(e.ana, e.gr)]).toEqual([MOTIVO_COMPONENTE_NO_APLICA, MOTIVO_COMPONENTE_NO_APLICA]);
      expect([await e.motivoDe(e.gerente, e.rg), await e.motivoDe(e.gerente, e.gr)]).toEqual([e.porR, e.porR]);
    }));

  it("G no aplica y R sí: Ana lee G en los dos órdenes", () =>
    revertida(sql, async (tx) => {
      const e = await dosOrdenes(tx);
      await marcarNoAplica(e.mideG, { medicionId: e.m.g, motivo: "Sin casos en el mes" }, opc(tx));
      await e.reportarAB(e.mideR, e.m.r, "3", "8");
      await propagar(opc(tx));
      expect([await e.motivoDe(e.ana, e.rg), await e.motivoDe(e.ana, e.gr)]).toEqual([e.porG, e.porG]);
      expect([await e.motivoDe(e.gerente, e.rg), await e.motivoDe(e.gerente, e.gr)]).toEqual([e.porG, e.porG]);
    }));
});

describe("la línea del historial de un contagio (anexo 14C, §6.5)", () => {
  // Las variables en el orden [R, G]: R oculto a Ana, G no. El evento guarda el primer componente que no aplicó de todos.
  const R = 701;
  const G = 702;
  const evento = (id: number, tipo: EventoDeMedicion["tipo"], detalle: Record<string, unknown>): EventoDeMedicion => ({
    id,
    tipo,
    quien: null,
    creadoEn: new Date("2003-04-20T15:00:00Z"),
    detalle,
  });
  /** El historial de una medición reabierta que después queda «No aplica» por el contagio de `componente`. */
  const linea = (componente: number, componentes: ComponentesDelHistorial) => {
    const [, contagio] = historialDeCorreccion(
      [
        evento(1, "reapertura", { justificacion: "Se corrige el periodo" }),
        evento(2, "propagacion", {
          fuentes: [],
          componente,
          antes: { A: null, B: null, noAplica: false, motivo: null },
          despues: { A: null, B: null, noAplica: true, motivo: MOTIVO_COMPONENTE_NO_APLICA },
        }),
      ],
      { unidad: { sufijo: " %", decimales: 1 }, nombres: { A: COMPONENTE_OCULTO, B: "Casos de G" }, conSoportes: false, componentes },
    );
    return contagio.cambios.find((c) => c.startsWith("Motivo:"));
  };
  // Como los arma `historialDeCorregidas`: los ocultos de Ana y los nombres de los que ve.
  const deAna: ComponentesDelHistorial = { ocultos: new Set([R]), letras: new Set(["A"]), nombres: new Map([[G, "G-1 Indicador G"]]) };
  const deGerente: ComponentesDelHistorial = {
    ocultos: new Set(),
    letras: new Set(),
    nombres: new Map([
      [R, "R-1 Indicador R"],
      [G, "G-1 Indicador G"],
    ]),
  };

  it("quien tiene un componente oculto lee siempre el genérico, no aplique R o sí; quien ve todos, el del evento", () => {
    const generico = `Motivo: — → ${MOTIVO_COMPONENTE_NO_APLICA}`;
    // G y R no aplican (el evento guardó R) y solo G no aplica (guardó G): Ana lee lo mismo.
    expect([linea(R, deAna), linea(G, deAna)]).toEqual([generico, generico]);
    expect([linea(R, deGerente), linea(G, deGerente)]).toEqual([
      "Motivo: — → R-1 Indicador R no aplicó en el periodo",
      "Motivo: — → G-1 Indicador G no aplicó en el periodo",
    ]);
  });
});

describe("lo que se oculta en el acumulado sigue a la versión que manda (M2)", () => {
  it("una letra tomada de R en 2003 y propia desde 2004: el acumulado de 2004 de Ana muestra su valor", () =>
    revertida(sql, async (tx) => {
      const e = await escenario(tx, { reportados: false });
      const FEBRERO_2004 = new Date("2004-02-20T15:00:00Z");
      const c3 = await indicadorDePrueba(tx, {
        periodicidad: "mensual",
        inicioMedicion: "2003-11",
        aprobadaEn: new Date("2003-10-15T15:00:00Z"),
        procesoId: e.p1,
        nivelAcceso: "restringido",
        mide: [e.ana.usuarioId],
        variables: { A: { indicadorOrigenId: e.r.id, toma: "valor" }, B: { nombre: "Casos evaluados" } },
      });
      await versionNueva(tx, { indicadorId: c3.id, usuarioId: e.admin.usuarioId, tipoCambio: "mayor", rigeDesde: "2004-01", aprobadaEn: new Date("2003-12-10T15:00:00Z") });
      await asegurarMediciones({ sql: tx, ahora: FEBRERO_2004, indicadorId: c3.id });
      await reportar(e.ana, { medicionId: await medicionDe(tx, c3.id, "2004-01"), valores: { A: "4", B: "10" }, parcial: false, confirmado: true }, opc(tx, FEBRERO_2004));
      const r = await resultadosDelAnio(e.ana, c3.id, 2004, opc(tx, FEBRERO_2004));
      expect(r.filas[0].valores[0]).toMatchObject({ letra: "A", valor: "4" });
      expect(r.acumulado).toMatchObject({ texto: "40 %", valores: { A: "4", B: "10" }, numeros: { A: 4, B: 10 } });
      expect(r.acumulado).not.toHaveProperty("ocultas");
    }));
});

describe("«Lo toman» por la lectura de la página (M6)", () => {
  it("datosDeFicha de R: la gerente recibe C; alguien de P2, que ve R y no C, no recibe la sección", () =>
    revertida(sql, async (tx) => {
      const e = await escenario(tx, { reportados: false });
      contexto.sql = tx;
      try {
        const de = async (quien: SesionFlujo) => {
          const sesion = valida(quien);
          const { ve, versiones } = await versionesVisibles(sesion, e.r.id, { sql: tx });
          const ficha = (await fichaDeVersion(sesion, e.r.versionId, { sql: tx }))!;
          const vigente = versiones.find((v) => v.estado === "aprobada") ?? null;
          return datosDeFicha({ sesion, indicador: { id: e.r.id, codigo: e.r.codigo, estado: "activo" }, ve, versiones, vigente, ficha, administra: false, ahora: AHORA });
        };
        expect((await de(e.gerente)).loToman).toEqual([{ codigo: e.c.codigo, nombre: `Indicador de prueba ${e.c.codigo}` }]);
        expect((await de(e.deP2)).loToman).toEqual([]);
      } finally {
        contexto.sql = null;
      }
    }));
});
