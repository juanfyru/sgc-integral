/**
 * Los Excel de indicadores (Fase 14A, Tarea 16; spec §13): el de un indicador (hojas «Ficha» y «Resultados <año>») y el
 * de resultados de la lista (una fila por indicador visible, los doce meses y el año), sus handlers y su bitácora. Contra
 * la BD de desarrollo, dentro de una transacción que se revierte (el cliente de la app se sustituye por ella): cada caso
 * crea su proceso y sus indicadores. El contenido se prueba con los lectores y los constructores con la hora inyectada;
 * los handlers, que leen el reloj, con el estado, las cabeceras, lo que la persona ve y la bitácora.
 */
import { existsSync } from "node:fs";
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const enCurso = vi.hoisted(() => ({ sql: null as unknown }));

vi.mock("@/db/cliente", async (original) => {
  const real = await original<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => (enCurso.sql ?? real.obtenerSql()) as ReturnType<typeof real.obtenerSql> };
});

import { GET as excelDeIndicador } from "@/app/(app)/indicadores/[codigo]/excel/route";
import { GET as excelDeResultados } from "@/app/(app)/indicadores/excel/route";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { analizar } from "@/db/consultas/indicadores/analisis";
import { impresionDelAnio } from "@/db/consultas/indicadores/impresion";
import { consultaDeFiltro, filtroDeConsulta, type FiltroDeLista } from "@/db/consultas/indicadores/lista";
import { resultadosDeLaLista } from "@/db/consultas/indicadores/matriz";
import { asegurarMediciones, marcarNoAplica, reportar } from "@/db/consultas/indicadores/mediciones";
import { observar } from "@/db/consultas/indicadores/observaciones";
import { retirar } from "@/db/consultas/indicadores/operacion";
import type { MetaHoja } from "@/lib/distribucion/hoja-excel";
import { construirExcelDeIndicador, construirExcelDeResultados } from "@/lib/indicadores/excel";
import { crearSesion } from "@/lib/sesion";
import { indicadorDePrueba, versionTrimestral, type IndicadorDePrueba, type OpcionesIndicadorDePrueba } from "./utiles/indicadores";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

/** Mediados de octubre de 2026: el tercer trimestre terminó; el cuarto empezó y no ha terminado. */
const AHORA = new Date("2026-10-20T15:00:00Z");
/** Aprobado antes de 2026: ningún periodo de 2026 es histórico. */
const APROBADA = new Date("2025-12-15T15:00:00Z");
const opc = (tx: TransactionSql, ahora = AHORA) => ({ sql: tx, ahora });
const META: MetaHoja = { hospital: "Entidad Zeta de Prueba", generadoEn: "2026-10-20 10:00", detalle: "Año: 2026" };
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

let consecutivo = 0;

/** Un proceso que solo existe en la transacción. */
async function proceso(tx: TransactionSql): Promise<{ id: number; nombre: string }> {
  consecutivo += 1;
  const sigla = `X${Date.now() % 100_000_000}${consecutivo}`;
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const nombre = `Proceso de Excel ${sigla}`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${nombre}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id`;
  return { id: Number(p.id), nombre };
}

/** Abre los periodos del indicador y reporta los de `valores` a nombre de `quien`. */
async function medir(tx: TransactionSql, quien: SesionFlujo, ind: { id: number }, valores: Record<string, Record<string, string>>, ahora = AHORA) {
  await asegurarMediciones({ sql: tx, ahora, indicadorId: ind.id });
  const ids: Record<string, number> = {};
  for (const [periodo, v] of Object.entries(valores)) {
    const [m] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = ${periodo}`;
    await reportar(quien, { medicionId: Number(m.id), valores: v, parcial: false, confirmado: true }, opc(tx, ahora));
    ids[periodo] = Number(m.id);
  }
  return ids;
}

/** Un indicador aprobado con el nombre dado: nace en borrador (la versión aprobada no se modifica) y se aprueba. */
async function conNombre(tx: TransactionSql, nombre: string, o: OpcionesIndicadorDePrueba): Promise<IndicadorDePrueba> {
  const ind = await indicadorDePrueba(tx, { ...o, estado: "borrador" });
  await tx`UPDATE indicador_versiones SET nombre = ${nombre} WHERE id = ${ind.versionId}`;
  await tx`UPDATE indicador_versiones SET estado = 'aprobada', elaborada_por = creado_por, elaborada_en = ${APROBADA},
      huella = ${"0".repeat(64)}, rige_desde = ${o.inicioMedicion ?? "2026-01"}, aprobada_por = creado_por, aprobada_en = ${APROBADA}
    WHERE id = ${ind.versionId}`;
  await tx`UPDATE indicadores SET estado = 'activo' WHERE id = ${ind.id}`;
  return ind;
}

/** Un trimestral del proceso medido de enero a septiembre de 2026, con un análisis. */
async function trimestralMedido(tx: TransactionSql, procesoId: number, o: OpcionesIndicadorDePrueba = {}) {
  const quien = await usuarioDePrueba(tx, { rol: "consulta" });
  const ind = await indicadorDePrueba(tx, {
    procesoId,
    periodicidad: "trimestral",
    inicioMedicion: "2026-T1",
    aprobadaEn: APROBADA,
    mide: [quien.usuarioId],
    analiza: [quien.usuarioId],
    variables: { A: { nombre: "Auditorías ejecutadas" }, B: { nombre: "Auditorías programadas" } },
    ...o,
  });
  const ids = await medir(tx, quien, ind, { "2026-T1": { A: "5", B: "5" }, "2026-T2": { A: "5", B: "6" }, "2026-T3": { A: "3", B: "5" } });
  await analizar(quien, { medicionId: ids["2026-T2"], analisis: "La auditoría de Farmacia se aplazó a julio" }, opc(tx));
  return { quien, ind, ids };
}

type Hoja = { filas: string[][]; merges: string[] };

/** Cada hoja del libro como filas de texto (las celdas vacías, «»), con sus celdas unidas. */
async function leerLibro(datos: Buffer | ArrayBuffer): Promise<Record<string, Hoja>> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(datos as ArrayBuffer);
  const hojas: Record<string, Hoja> = {};
  for (const h of libro.worksheets) {
    const filas: string[][] = [];
    h.eachRow({ includeEmpty: true }, (fila, n) => {
      const valores: string[] = [];
      for (let c = 1; c <= h.columnCount; c++) {
        const celda = fila.getCell(c);
        valores.push(celda.isMerged && celda.master !== celda ? "" : celda.value === null || celda.value === undefined ? "" : String(celda.value));
      }
      filas[n - 1] = valores;
    });
    hojas[h.name] = { filas: Array.from(filas, (f) => f ?? []), merges: (h.model as { merges?: string[] }).merges ?? [] };
  }
  return hojas;
}

/** Los valores tal como quedaron en las celdas de una hoja (números como números), por fila. */
async function celdasCrudas(datos: Buffer, nombre: string): Promise<unknown[][]> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(datos as unknown as ArrayBuffer);
  const filas: unknown[][] = [];
  libro.getWorksheet(nombre)!.eachRow((f) => filas.push((f.values as unknown[]).slice(1)));
  return filas;
}

const texto = (h: Hoja) => h.filas.map((f) => f.join(" | ")).join("\n");
/** La fila cuya primera celda es `primera`. */
const fila = (h: Hoja, primera: string) => h.filas.find((f) => f[0] === primera);
/** La fila del encabezado de la tabla: la que empieza con `primera` como título de columna. */
const cabecera = (h: Hoja, primera: string) => h.filas.find((f) => f[0] === primera)!;

describe("el Excel de un indicador", () => {
  it("el Excel de un indicador trae la hoja «Ficha» y la hoja «Resultados 2026», con el acumulado", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const { ind, quien } = await trimestralMedido(tx, p.id);
      const d = await impresionDelAnio(quien, ind.codigo, 2026, opc(tx));
      const libro = await leerLibro(await construirExcelDeIndicador(d!, META));
      expect(Object.keys(libro)).toEqual(["Ficha", "Resultados 2026"]);

      const ficha = libro.Ficha;
      expect(ficha.filas[0][0]).toBe("Entidad Zeta de Prueba");
      expect(fila(ficha, "Identificación")?.slice(0, 3)).toEqual(["Identificación", "Nombre", `Indicador de prueba ${ind.codigo}`]);
      expect(texto(ficha)).toContain("Estructura de medición | Fórmula | (Auditorías ejecutadas ÷ Auditorías programadas) × 100");
      expect(texto(ficha)).toContain("Bien desde 90 %");
      expect(texto(ficha)).toContain(`Datos de operación | Quién mide | ${quien.nombre}`);
      expect(texto(ficha)).toContain("Encabezado | Versión | 1");
      // La fecha de un día, con el formato de la app (no ISO).
      expect(texto(ficha)).toContain("Encabezado | Vigente desde | 15 dic 2025");
      expect(texto(ficha)).toContain("Firmas | Elaboró | ");

      const r = libro["Resultados 2026"];
      expect(cabecera(r, "Periodo")).toEqual([
        "Periodo",
        "Versión de la ficha",
        "Auditorías ejecutadas",
        "Auditorías programadas",
        "Resultado",
        "Meta",
        "Cumple",
        "Semáforo",
        "Estado",
        "Análisis",
        "Marcas",
      ]);
      expect(fila(r, "Primer trimestre de 2026")).toEqual(["Primer trimestre de 2026", "1", "5", "5", "100 %", "≥ 90 %", "Sí", "Bien", "Reportada", "", ""]);
      expect(fila(r, "Segundo trimestre de 2026")?.slice(4, 10)).toEqual(["83,3 %", "≥ 90 %", "No", "Atención", "Reportada", "La auditoría de Farmacia se aplazó a julio"]);
      expect(fila(r, "Tercer trimestre de 2026")?.slice(4, 9)).toEqual(["60 %", "≥ 90 %", "No", "Crítico", "Falta el análisis · vencida"]);
      expect(fila(r, "Tercer trimestre de 2026")?.[10]).toBe("Requiere acción de mejora");
      expect(fila(r, "Cuarto trimestre de 2026")?.slice(4, 9)).toEqual(["", "≥ 90 %", "", "", "Por venir"]);
      // El acumulado junta las variables (13 de 16), nunca promedia los resultados.
      expect(fila(r, "Acumulado del año")?.slice(0, 8)).toEqual(["Acumulado del año", "", "13", "16", "81,3 %", "≥ 90 %", "No", "Atención"]);
      expect(r.filas.findIndex((f) => f[0] === "Acumulado del año")).toBe(r.filas.length - 1);

      // Las variables son celdas numéricas (el número guardado); el resultado y la meta siguen como texto.
      const crudas = await celdasCrudas(await construirExcelDeIndicador(d!, META), "Resultados 2026");
      const t2 = crudas.find((c) => c[0] === "Segundo trimestre de 2026")!;
      expect(t2.slice(2, 6)).toEqual([5, 6, "83,3 %", "≥ 90 %"]);
      expect(crudas.find((c) => c[0] === "Acumulado del año")!.slice(2, 4)).toEqual([13, 16]);
    }));

  it("la firma de la hoja «Ficha» lleva su día con el formato de la app y su hora, en la zona de la instalación", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const { ind, quien } = await trimestralMedido(tx, p.id);
      // La firma «Elaboró» sobre la huella de la versión, como la deja el envío (nombre y cargo congelados).
      await tx`INSERT INTO firmas (tramite_id, version_id, indicador_version_id, usuario_id, firma, ronda, hash_sha256,
          nombre_firmante, cargo_firmante, metodo, creado_en)
        SELECT NULL, NULL, v.id, ${quien.usuarioId}, 'elaboro', 0, v.huella, 'Ana Elaboradora', 'Líder de Calidad', 'clave',
          ${new Date("2025-12-10T14:05:00Z")}
        FROM indicador_versiones v WHERE v.id = ${ind.versionId}`;
      const libro = await leerLibro(await construirExcelDeIndicador((await impresionDelAnio(quien, ind.codigo, 2026, opc(tx)))!, META));
      expect(texto(libro.Ficha)).toContain("Firmas | Elaboró | Ana Elaboradora · Líder de Calidad · 10 dic 2025, 09:05");
      expect(texto(libro.Ficha)).not.toContain("2025-12-10");
    }));

  it("un retirado, uno anual, «no aplica» y lo de otra periodicidad (marcado) en el Excel de un indicador", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const admin = await sesionAdmin(tx);

      // Retirado: se exporta con lo que se midió.
      const { ind: retirado, quien } = await trimestralMedido(tx, p.id);
      await retirar(admin, { indicadorId: retirado.id, motivo: "Se reemplaza por otro indicador" }, opc(tx));
      const deRetirado = await leerLibro(await construirExcelDeIndicador((await impresionDelAnio(quien, retirado.codigo, 2026, opc(tx)))!, META));
      expect(fila(deRetirado["Resultados 2026"], "Primer trimestre de 2026")?.[4]).toBe("100 %");

      // «No aplica»: sin resultado ni «Cumple», con su motivo en el análisis.
      const conNoAplica = await indicadorDePrueba(tx, { procesoId: p.id, periodicidad: "trimestral", inicioMedicion: "2026-T1", aprobadaEn: APROBADA, mide: [quien.usuarioId] });
      await medir(tx, quien, conNoAplica, { "2026-T1": { A: "9", B: "10" } });
      const [t2] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${conNoAplica.id} AND periodo = '2026-T2'`;
      await marcarNoAplica(quien, { medicionId: Number(t2.id), motivo: "No hubo auditorías programadas" }, opc(tx));
      const deNoAplica = await leerLibro(await construirExcelDeIndicador((await impresionDelAnio(quien, conNoAplica.codigo, 2026, opc(tx)))!, META));
      expect(fila(deNoAplica["Resultados 2026"], "Segundo trimestre de 2026")?.slice(2, 10)).toEqual(["", "", "", "≥ 90 %", "", "No aplica", "Reportada", "No aplica: No hubo auditorías programadas"]);

      // Otra periodicidad: julio mensual queda marcado, con su versión, tras un cambio a trimestral.
      const mensual = await indicadorDePrueba(tx, { procesoId: p.id, inicioMedicion: "2026-01", aprobadaEn: APROBADA, mide: [quien.usuarioId] });
      await medir(tx, quien, mensual, { "2026-06": { A: "9", B: "10" }, "2026-07": { A: "1", B: "10" } }, new Date("2026-08-15T15:00:00Z"));
      await versionTrimestral(tx, { indicadorId: mensual.id, usuarioId: admin.usuarioId, rigeDesde: "2026-T3", aprobadaEn: new Date("2026-07-20T15:00:00Z") });
      const deMensual = await leerLibro(await construirExcelDeIndicador((await impresionDelAnio(quien, mensual.codigo, 2026, opc(tx)))!, META));
      const julio = fila(deMensual["Resultados 2026"], "Julio de 2026")!;
      expect(julio[1]).toBe("1");
      expect(julio.at(-1)).toBe("Periodicidad anterior · Requiere acción de mejora");
      expect(fila(deMensual["Resultados 2026"], "Tercer trimestre de 2026")?.[1]).toBe("2");

      // Anual: una fila por año.
      const anual = await indicadorDePrueba(tx, { procesoId: p.id, periodicidad: "anual", inicioMedicion: "2025", aprobadaEn: new Date("2024-12-15T15:00:00Z"), mide: [quien.usuarioId] });
      await medir(tx, quien, anual, { "2025": { A: "7", B: "10" } }, new Date("2026-01-20T15:00:00Z"));
      const deAnual = (await leerLibro(await construirExcelDeIndicador((await impresionDelAnio(quien, anual.codigo, 2025, opc(tx)))!, META)))["Resultados 2025"];
      const datos = deAnual.filas.slice(deAnual.filas.indexOf(cabecera(deAnual, "Periodo")) + 1);
      expect(datos.map((x) => x[0])).toEqual(["2025", "Acumulado del año"]);
      expect(datos[0][4]).toBe("70 %");
    }));

  it("neutraliza las fórmulas", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const quien = await usuarioDePrueba(tx, { rol: "consulta" });
      const ind = await conNombre(tx, "=SUMA(A1)", {
        procesoId: p.id,
        periodicidad: "trimestral",
        inicioMedicion: "2026-T1",
        mide: [quien.usuarioId],
        variables: { A: { nombre: "+HIPERVINCULO(B1)" } },
      });
      await medir(tx, quien, ind, { "2026-T1": { A: "9", B: "10" } });

      const deIndicador = await leerLibro(await construirExcelDeIndicador((await impresionDelAnio(quien, ind.codigo, 2026, opc(tx)))!, META));
      expect(fila(deIndicador.Ficha, "Identificación")?.[2]).toBe("'=SUMA(A1)");
      expect(texto(deIndicador.Ficha)).toContain("Variable A | '+HIPERVINCULO(B1)");
      // El encabezado de la columna de una variable también es texto del usuario.
      expect(cabecera(deIndicador["Resultados 2026"], "Periodo")[2]).toBe("'+HIPERVINCULO(B1)");
      const deLista = await leerLibro(await construirExcelDeResultados(await resultadosDeLaLista(quien, { procesoId: p.id }, 2026, opc(tx)), 2026, META));
      expect(fila(deLista["Resultados 2026"], ind.codigo)?.[1]).toBe("'=SUMA(A1)");
    }));

  it("no trae soportes ni observaciones", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const { ind, ids } = await trimestralMedido(tx, p.id);
      const control = await usuarioDePrueba(tx, { rol: "control_interno" });
      await observar(control, { medicionId: ids["2026-T3"], texto: "Observación secreta zz-1735" }, opc(tx));
      await tx`INSERT INTO archivos (version_id, contexto, contexto_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
        VALUES (NULL, 'medicion', ${ids["2026-T3"]}, 'evidencia', 'mediciones/x/soporte.pdf', 'Soporte secreto zz-1735.pdf', 'pdf',
          'application/pdf', 4, ${"a".repeat(64)})`;
      const admin = await sesionAdmin(tx);
      const deIndicador = await leerLibro(await construirExcelDeIndicador((await impresionDelAnio(admin, ind.codigo, 2026, opc(tx)))!, META));
      const deLista = await leerLibro(await construirExcelDeResultados(await resultadosDeLaLista(admin, { procesoId: p.id }, 2026, opc(tx)), 2026, META));
      for (const libro of [deIndicador, deLista]) {
        const todo = Object.values(libro).map(texto).join("\n");
        expect(todo).not.toContain("zz-1735");
        // «Soporte obligatorio» es un dato de operación; la lista de soportes y las observaciones no salen.
        expect(todo).not.toMatch(/Soportes|Observaci/);
      }
    }));
});

describe("el Excel de resultados", () => {
  it("el Excel de resultados trae una fila por indicador visible, doce meses y el año", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const { ind: trimestral, quien } = await trimestralMedido(tx, p.id);
      const mensual = await indicadorDePrueba(tx, { procesoId: p.id, inicioMedicion: "2026-01", aprobadaEn: APROBADA, mide: [quien.usuarioId] });
      const ids = await medir(tx, quien, mensual, { "2026-01": { A: "9", B: "10" }, "2026-03": { A: "8", B: "10" } });
      const [febrero] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${mensual.id} AND periodo = '2026-02'`;
      await marcarNoAplica(quien, { medicionId: Number(febrero.id), motivo: "No hubo casos en febrero" }, opc(tx));
      expect(ids["2026-01"]).toBeGreaterThan(0);
      // Restringido de otro proceso: quien no participa no lo ve.
      const restringido = await indicadorDePrueba(tx, { procesoId: p.id, periodicidad: "trimestral", inicioMedicion: "2026-T1", aprobadaEn: APROBADA, nivelAcceso: "restringido" });

      const consulta = await usuarioDePrueba(tx, { rol: "consulta" });
      const filas = await resultadosDeLaLista(consulta, { procesoId: p.id }, 2026, opc(tx));
      expect(filas.map((f) => f.codigo).sort()).toEqual([mensual.codigo, trimestral.codigo].sort());
      const libro = await leerLibro(await construirExcelDeResultados(filas, 2026, { ...META, detalle: `Año: 2026 · Proceso: ${p.nombre}` }));
      expect(Object.keys(libro)).toEqual(["Resultados 2026"]);
      const h = libro["Resultados 2026"];
      expect(texto(h)).toContain(`Año: 2026 · Proceso: ${p.nombre}`);
      expect(cabecera(h, "Código")).toEqual([
        "Código", "Nombre", "Proceso", "Subproceso", "Clasificación", "Tipo", "Unidad", "Meta",
        "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic", "Año", "Nota del año",
      ]);
      expect(texto(h)).not.toContain(restringido.codigo);

      const t = fila(h, trimestral.codigo)!;
      expect(t.slice(0, 8)).toEqual([trimestral.codigo, `Indicador de prueba ${trimestral.codigo}`, p.nombre, "", "Operativo", "Eficacia", "Porcentaje", "≥ 90 %"]);
      // Un trimestre ocupa sus tres meses, unidos; el cuarto aún no llega.
      expect(t.slice(8, 22)).toEqual(["100 %", "", "", "83,3 %", "", "", "60 %", "", "", "—", "", "", "81,3 %", ""]);
      const n = h.filas.indexOf(t) + 1;
      expect(h.merges).toEqual(expect.arrayContaining([`I${n}:K${n}`, `L${n}:N${n}`, `O${n}:Q${n}`, `R${n}:T${n}`]));

      // Un mensual: «n. a.» y «s. d.» como texto; lo que no ha terminado, «—».
      const m = fila(h, mensual.codigo)!;
      expect(m.slice(8, 20)).toEqual(["90 %", "n. a.", "80 %", "s. d.", "s. d.", "s. d.", "s. d.", "s. d.", "s. d.", "—", "—", "—"]);
      expect(m[21]).toMatch(/^Acumulado parcial: faltan/);
    }));

  it("un indicador de la lista sin mediciones ese año sale con sus meses vacíos", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const { ind } = await trimestralMedido(tx, p.id);
      const libro = await leerLibro(await construirExcelDeResultados(await resultadosDeLaLista(await sesionAdmin(tx), { procesoId: p.id }, 2025, opc(tx)), 2025, META));
      const f = fila(libro["Resultados 2025"], ind.codigo)!;
      expect(f.slice(8, 22)).toEqual(Array(14).fill(""));
    }));

  it("los filtros de la lista van y vuelven por la URL", () => {
    const f: FiltroDeLista = { procesoId: 3, subprocesoId: 4, clasificacionId: 5, tipoId: 6, semaforo: "sin-dato", reporte: "vencida", participo: true, texto: "auditorías & más", retirados: true };
    const q = consultaDeFiltro(f);
    expect(filtroDeConsulta(Object.fromEntries(new URLSearchParams(q)))).toEqual(f);
    expect(consultaDeFiltro({})).toBe("");
    expect(consultaDeFiltro({ procesoId: 3 })).toBe("proceso=3");
  });
});

describe("GET /indicadores/[codigo]/excel y GET /indicadores/excel", () => {
  const pedirIndicador = (codigo: string, token?: string, consulta = "") =>
    excelDeIndicador(
      new NextRequest(`http://localhost:3002/indicadores/${codigo}/excel${consulta}`, token ? { headers: { cookie: `sgc_sesion=${token}` } } : undefined),
      { params: Promise.resolve({ codigo }) },
    );
  const pedirResultados = (token?: string, consulta = "") =>
    excelDeResultados(new NextRequest(`http://localhost:3002/indicadores/excel${consulta}`, token ? { headers: { cookie: `sgc_sesion=${token}` } } : undefined));

  async function conToken(tx: TransactionSql, usuarioId: number): Promise<string> {
    const { token } = await crearSesion(usuarioId, { ip: null, userAgent: null });
    await tx`UPDATE usuarios SET acepto_datos_en = now(), totp_activo = true WHERE id = ${usuarioId}`;
    return token;
  }

  const enTransaccion = (prueba: (tx: TransactionSql) => Promise<void>) =>
    revertida(sql, async (tx) => {
      enCurso.sql = tx;
      try {
        await prueba(tx);
      } finally {
        enCurso.sql = null;
      }
    });

  it("GET: 401 sin sesión, 404 si la persona no ve el indicador, 200 con el tipo de Excel y no-store", () =>
    enTransaccion(async (tx) => {
      const p = await proceso(tx);
      const { ind } = await trimestralMedido(tx, p.id);
      const restringido = await indicadorDePrueba(tx, { procesoId: p.id, periodicidad: "trimestral", inicioMedicion: "2026-T1", aprobadaEn: APROBADA, nivelAcceso: "restringido" });
      const consulta = await usuarioDePrueba(tx, { rol: "consulta" });
      const token = await conToken(tx, consulta.usuarioId);

      expect((await pedirIndicador(ind.codigo)).status).toBe(401);
      expect((await pedirResultados()).status).toBe(401);
      expect((await pedirIndicador(restringido.codigo, token, "?anio=2026")).status).toBe(404);
      expect((await pedirIndicador("ZZ-NO-EXISTE-1", token)).status).toBe(404);
      expect((await pedirIndicador("a b", token)).status).toBe(404);
      for (const anio of ["abc", "2025", "2999"]) expect((await pedirIndicador(ind.codigo, token, `?anio=${anio}`)).status).toBe(404);
      for (const anio of ["abc", "1899", "2999"]) expect((await pedirResultados(token, `?anio=${anio}`)).status).toBe(404);

      const res = await pedirIndicador(ind.codigo.toLowerCase(), token, "?anio=2026");
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe(XLSX);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(res.headers.get("Content-Disposition")).toBe(`attachment; filename="${ind.codigo}-2026.xlsx"`);
      expect(Object.keys(await leerLibro(await res.arrayBuffer()))).toEqual(["Ficha", "Resultados 2026"]);

      const lista = await pedirResultados(token, `?anio=2026&proceso=${p.id}`);
      expect(lista.status).toBe(200);
      expect(lista.headers.get("Content-Type")).toBe(XLSX);
      expect(lista.headers.get("Cache-Control")).toBe("no-store");
      expect(lista.headers.get("Content-Disposition")).toBe('attachment; filename="resultados-indicadores-2026.xlsx"');
      const hoja = (await leerLibro(await lista.arrayBuffer()))["Resultados 2026"];
      expect(fila(hoja, ind.codigo)).toBeTruthy();
      expect(texto(hoja)).not.toContain(restringido.codigo);
      expect(texto(hoja)).toContain(`Proceso: ${p.nombre}`);
    }));

  it("limita a diez descargas por minuto por persona", () =>
    enTransaccion(async (tx) => {
      const p = await proceso(tx);
      const { ind } = await trimestralMedido(tx, p.id);
      const token = await conToken(tx, (await usuarioDePrueba(tx, { rol: "consulta" })).usuarioId);
      for (let i = 0; i < 10; i++) expect((await pedirIndicador(ind.codigo, token)).status).toBe(200);
      const res = await pedirIndicador(ind.codigo, token);
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("60");
      const otro = await conToken(tx, (await usuarioDePrueba(tx, { rol: "consulta" })).usuarioId);
      for (let i = 0; i < 10; i++) expect((await pedirResultados(otro, `?proceso=${p.id}`)).status).toBe(200);
      expect((await pedirResultados(otro, `?proceso=${p.id}`)).status).toBe(429);
    }));

  it("cada descarga queda en la bitácora", () =>
    enTransaccion(async (tx) => {
      const p = await proceso(tx);
      const { ind } = await trimestralMedido(tx, p.id);
      const consulta = await usuarioDePrueba(tx, { rol: "consulta" });
      const token = await conToken(tx, consulta.usuarioId);
      expect((await pedirIndicador(ind.codigo, token, "?anio=2026")).status).toBe(200);
      expect((await pedirResultados(token, `?anio=2026&proceso=${p.id}&semaforo=critico`)).status).toBe(200);
      const filas = await tx`SELECT accion, entidad, entidad_id, detalle FROM auditoria WHERE usuario_id = ${consulta.usuarioId} ORDER BY id`;
      expect(filas.map((f) => ({ accion: f.accion, entidad: f.entidad, entidadId: f.entidad_id === null ? null : Number(f.entidad_id), detalle: f.detalle }))).toEqual([
        { accion: "exporto_ficha_indicador", entidad: "indicador", entidadId: ind.id, detalle: { codigo: ind.codigo, anio: 2026 } },
        { accion: "exporto_resultados_indicadores", entidad: "indicador", entidadId: null, detalle: { anio: 2026, filtros: { procesoId: p.id, semaforo: "critico" } } },
      ]);
    }));
});
