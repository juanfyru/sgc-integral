/**
 * Los indicadores del proceso documental (spec 13C §11) contra la BD de desarrollo, dentro de una transacción que se
 * revierte. Cada caso crea sus documentos, trámites y externos y afirma sobre ellos (antes y después, o por proceso),
 * nunca sobre los totales de la demo; las personas son de prueba. Los PDF van a un almacén temporal.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { resumenAcuses } from "@/db/consultas/distribucion/acuses";
import { estadoDePuntos } from "@/db/consultas/distribucion/verificaciones-resumen";
import { transicionar } from "@/db/consultas/tramites-flujo";
import { indicadoresDocumentales } from "@/db/consultas/vigencia/indicadores";
import { INDICADORES, type Indicador, type IndicadorMedido, type ResultadoIndicadores } from "@/lib/indicadores-documentales/metas";
import { periodoActual } from "@/lib/indicadores-documentales/periodo";
import { fechaEnZona, finDeFecha } from "@/lib/tramites/plazos";
import { construirExcelIndicadores } from "@/lib/vigencia/indicadores-excel";
import { zonaHoraria } from "@/lib/zona-horaria";
import { textoValor } from "@/lib/indicadores-documentales/textos";
import { puntoDePrueba, verificarPunto } from "./utiles/distribucion";
import { opc, sesionAdmin, tramiteEn, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { externoDePrueba, sinFechaDeRevision, vigenteFuera } from "./utiles/vigencia";

const sql = obtenerSql();
const ZONA = zonaHoraria();
const ahora = new Date("2026-11-08T15:00:00Z");
const MS_DIA = 86_400_000;

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-indicadores-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

const procesoId = async (tx: TransactionSql, sigla: string) => Number((await tx`SELECT id FROM procesos WHERE sigla = ${sigla}`)[0].id);
const de = (r: ResultadoIndicadores, clave: Indicador): IndicadorMedido => r.indicadores.find((i) => i.clave === clave)!;
const fijarMeta = (tx: TransactionSql, clave: string, valor: string) =>
  tx`INSERT INTO configuracion (clave, valor) VALUES (${clave}, ${valor}) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`;
/** El número de «N … sin …» del detalle (0 si no lo dice). */
const sinDato = (i: IndicadorMedido, patron: RegExp) => Number(patron.exec(i.detalle ?? "")?.[1] ?? 0);

/** Un interno aprobado fuera de la plataforma con plazo propio de un año: su próxima revisión no depende del tipo en la demo. */
async function interno(tx: TransactionSql, proceso: string, fechaAprobacion: string) {
  const d = await vigenteFuera(tx, { fechaAprobacion, proceso });
  await tx`UPDATE documentos SET meses_revision = 12 WHERE id = ${d.id}`;
  return d;
}

describe("indicadoresDocumentales", () => {
  it("dentro del plazo y vencidos salen del semáforo a la fecha; el líder solo ve sus procesos", () => revertida(sql, async (tx) => {
    const gth = await procesoId(tx, "GTH");
    const cex = await procesoId(tx, "CEX");
    await fijarMeta(tx, "meta_vencidos", "0");
    const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [gth] });
    const antes = (await indicadoresDocumentales(lider, { periodo: "2026" }, { sql: tx, ahora }))!;

    const vencido = await interno(tx, "GTH", "2025-01-10");
    await interno(tx, "GTH", "2026-06-01");
    const ajeno = await interno(tx, "CEX", "2025-01-10");
    const r = (await indicadoresDocumentales(lider, { periodo: "2026" }, { sql: tx, ahora }))!;

    expect(de(r, "vencidos")).toMatchObject({ valor: de(antes, "vencidos").valor! + 1, cumple: false, unidad: "conteo", meta: 0 });
    expect(de(r, "dentro_plazo")).toMatchObject({
      numerador: de(antes, "dentro_plazo").numerador + 1,
      denominador: de(antes, "dentro_plazo").denominador + 2,
      unidad: "pct",
    });
    expect(r.vencidos.find((v) => v.documentoId === vencido.id)).toMatchObject({
      codigo: vencido.codigo,
      titulo: vencido.titulo,
      origen: "interno",
      procesoId: gth,
      sigla: "GTH",
      dias: Math.round((Date.UTC(2026, 10, 8) - Date.UTC(2026, 0, 10)) / MS_DIA),
    });
    expect(fechaEnZona(r.vencidos.find((v) => v.documentoId === vencido.id)!.proximaRevision!, ZONA)).toBe("2026-01-10");
    expect(r.vencidos.map((v) => v.documentoId)).not.toContain(ajeno.id);
    expect(r.vencidos.every((v) => v.sigla === "GTH")).toBe(true);
    expect(r.vencidosPorProceso.every((p) => p.sigla === "GTH")).toBe(true);
    expect(r.vencidosPorProceso.find((p) => p.procesoId === gth)!.vencidos).toBe(r.vencidos.length);
    expect(r.dentroPorProceso.map((p) => p.procesoId)).toEqual([gth]);
    expect(await indicadoresDocumentales(lider, { periodo: "2026", procesoId: cex }, { sql: tx, ahora })).toBeNull();

    const admin = await sesionAdmin(tx);
    const todo = (await indicadoresDocumentales(admin, { periodo: "2026" }, { sql: tx, ahora }))!;
    expect(todo.vencidos.map((v) => v.documentoId)).toEqual(expect.arrayContaining([vencido.id, ajeno.id]));
    const soloCex = (await indicadoresDocumentales(admin, { periodo: "2026", procesoId: cex }, { sql: tx, ahora }))!;
    expect(soloCex.procesoId).toBe(cex);
    expect(soloCex.vencidos.map((v) => v.documentoId)).toContain(ajeno.id);
    expect(soloCex.vencidos.every((v) => v.procesoId === cex)).toBe(true);
    expect(soloCex.dentroPorProceso.map((p) => p.procesoId)).toEqual([cex]);
  }));

  it("un documento sin fecha de revisión no cuenta como cumplido: queda fuera del denominador y el detalle lo dice", () => revertida(sql, async (tx) => {
    const gth = await procesoId(tx, "GTH");
    const admin = await sesionAdmin(tx);
    const patron = /^(\d+) documentos? sin fecha de revisión$/;
    const antes = (await indicadoresDocumentales(admin, { periodo: "2026", procesoId: gth }, { sql: tx, ahora }))!;
    const d = await interno(tx, "GTH", "2026-06-01");
    await sinFechaDeRevision(tx, { versionId: d.versionId });
    const r = (await indicadoresDocumentales(admin, { periodo: "2026", procesoId: gth }, { sql: tx, ahora }))!;

    expect(de(r, "dentro_plazo").denominador).toBe(de(antes, "dentro_plazo").denominador);
    expect(sinDato(de(r, "dentro_plazo"), patron)).toBe(sinDato(de(antes, "dentro_plazo"), patron) + 1);
    expect(de(r, "vencidos").valor).toBe(de(antes, "vencidos").valor);
    const fila = r.dentroPorProceso.find((p) => p.procesoId === gth)!;
    const filaAntes = antes.dentroPorProceso.find((p) => p.procesoId === gth);
    expect(fila).toMatchObject({ vigentes: (filaAntes?.vigentes ?? 0) + 1, sinFecha: (filaAntes?.sinFecha ?? 0) + 1, alDia: filaAntes?.alDia ?? 0 });
    expect(r.vencidos.map((v) => v.documentoId)).not.toContain(d.id);
  }));

  it("los externos al día se cuentan a la fecha por su próxima verificación, y uno vencido también es un documento vencido", () => revertida(sql, async (tx) => {
    const gth = await procesoId(tx, "GTH");
    const admin = await sesionAdmin(tx);
    const antes = (await indicadoresDocumentales(admin, { periodo: "2026", procesoId: gth }, { sql: tx, ahora }))!;
    await externoDePrueba(tx, admin, { proceso: "GTH", edicion: "2017", ahora });
    const viejo = await externoDePrueba(tx, admin, { proceso: "GTH", edicion: "2019", ahora: new Date("2024-06-01T15:00:00Z") });
    const r = (await indicadoresDocumentales(admin, { periodo: "2026", procesoId: gth }, { sql: tx, ahora }))!;

    expect(de(r, "externos")).toMatchObject({
      numerador: de(antes, "externos").numerador + 1,
      denominador: de(antes, "externos").denominador + 2,
    });
    expect(de(r, "vencidos").valor).toBe(de(antes, "vencidos").valor! + 1);
    expect(r.vencidos.find((v) => v.documentoId === viejo.documentoId)).toMatchObject({ origen: "externo", codigo: viejo.codigo });
  }));

  it("el tiempo de aprobación usa los trámites publicados en el periodo y es sin dato sin trámites", () => revertida(sql, async (tx) => {
    const admin = await sesionAdmin(tx);
    const vacio = (await indicadoresDocumentales(admin, { periodo: "2000" }, { sql: tx, ahora }))!;
    expect(vacio.periodo.clave).toBe("2000");
    expect(de(vacio, "aprobacion")).toMatchObject({ valor: null, cumple: null, numerador: 0, denominador: 0, detalle: null, unidad: "dias" });
    expect(de(vacio, "etapas")).toMatchObject({ valor: null, cumple: null, denominador: 0 });
    expect(vacio.tramites.publicados).toBe(0);

    // Publicado en un año sin datos de la demo: el periodo solo tiene este trámite.
    const t = await tramiteEn(tx, "publicacion");
    const publicadoEn = new Date("2090-01-20T15:00:00Z");
    await transicionar(
      t.admin,
      { tramiteId: t.tramiteId, accion: "publicar", etapaEsperada: "publicacion", rondaEsperada: t.ronda, credenciales: { clave: "x" } },
      opc(tx, publicadoEn.toISOString()),
    );
    const [fechas] = await tx`SELECT t.creado_en AS solicitado,
        (SELECT e.creado_en FROM tramite_eventos e WHERE e.tramite_id = t.id AND e.tipo = 'aceptar') AS aceptado
      FROM tramites t WHERE t.id = ${t.tramiteId}`;
    const dias = (desde: Date) => Math.round(((publicadoEn.getTime() - desde.getTime()) / MS_DIA) * 10) / 10;
    const r = (await indicadoresDocumentales(admin, { periodo: "2090" }, { sql: tx, ahora: new Date("2090-02-01T15:00:00Z") }))!;

    expect(r.tramites.publicados).toBe(1);
    expect(de(r, "aprobacion")).toMatchObject({ valor: dias(fechas.aceptado), numerador: dias(fechas.aceptado), denominador: 1, cumple: false });
    expect(de(r, "aprobacion").detalle).toMatch(/^mediana [\d.,]+ días · desde la solicitud: [\d.,]+ días$/);
    // La publicación cerró su etapa décadas después de su fecha límite.
    expect(de(r, "etapas")).toMatchObject({ numerador: 0, denominador: 1, valor: 0, cumple: false });
    expect(dias(fechas.solicitado)).toBeGreaterThanOrEqual(dias(fechas.aceptado));
  }));

  it("las etapas en plazo cuentan solo los eventos con venceEn: los de antes del cambio son «sin dato» y reasignar no cierra etapa", () => revertida(sql, async (tx) => {
    const admin = await sesionAdmin(tx);
    const periodo = periodoActual(ahora, ZONA).clave;
    const patron = /^(\d+) etapas? sin dato$/;
    const antes = (await indicadoresDocumentales(admin, { periodo }, { sql: tx, ahora }))!;

    const t = await tramiteEn(tx, "elaboracion");
    const [e] = await tx`SELECT detalle->>'venceEn' AS vence FROM tramite_eventos WHERE tramite_id = ${t.tramiteId} AND tipo = 'aceptar'`;
    expect(e.vence).not.toBeNull();
    await transicionar(t.admin, { tramiteId: t.tramiteId, accion: "reasignar", etapaEsperada: "elaboracion", rondaEsperada: t.ronda,
      datos: { venceEn: "2026-12-01", motivo: "Se reorganiza el equipo." } }, opc(tx));
    // Un paso registrado antes de que el evento guardara la fecha límite de su etapa.
    await tx`INSERT INTO tramite_eventos (tramite_id, tipo, usuario_id, ronda, detalle, creado_en)
      VALUES (${t.tramiteId}, 'enviar_a_revision', ${t.admin.usuarioId}, 1, ${tx.json({})}, ${new Date("2026-11-06T15:00:00Z")})`;
    const r = (await indicadoresDocumentales(admin, { periodo }, { sql: tx, ahora }))!;

    expect(de(r, "etapas").denominador).toBe(de(antes, "etapas").denominador + 1);
    expect(de(r, "etapas").numerador).toBe(de(antes, "etapas").numerador + 1);
    expect(sinDato(de(r, "etapas"), patron)).toBe(sinDato(de(antes, "etapas"), patron) + 1);
  }));

  it("el líder solo cuenta los trámites de sus procesos", () => revertida(sql, async (tx) => {
    const gth = await procesoId(tx, "GTH");
    const admin = await sesionAdmin(tx);
    const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [gth] });
    const enCurso = async (quien: typeof admin) => (await indicadoresDocumentales(quien, { periodo: "2026" }, { sql: tx, ahora }))!.tramites.enCurso;
    const [liderAntes, adminAntes] = [await enCurso(lider), await enCurso(admin)];
    await tramiteEn(tx, "aceptacion", { tipo: "crear" });   // en CEX
    expect([await enCurso(lider), await enCurso(admin)]).toEqual([liderAntes, adminAntes + 1]);
    await tramiteEn(tx, "aceptacion");   // en GTH
    expect([await enCurso(lider), await enCurso(admin)]).toEqual([liderAntes + 1, adminAntes + 2]);
  }));

  it("un trámite sobre un documento restringido que la persona no ve no se cuenta", () => revertida(sql, async (tx) => {
    const gth = await procesoId(tx, "GTH");
    const cex = await procesoId(tx, "CEX");
    const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [gth] });
    const enCurso = async () => (await indicadoresDocumentales(lider, { periodo: "2026" }, { sql: tx, ahora }))!.tramites.enCurso;
    const antes = await enCurso();
    const t = await tramiteEn(tx, "aceptacion");   // en GTH, sobre un documento general
    expect(await enCurso()).toBe(antes + 1);
    // El documento queda restringido y solo en CEX: el trámite sigue siendo de GTH, pero el líder ya no ve su documento.
    const [{ documento_id: documentoId }] = await tx`SELECT documento_id FROM tramites WHERE id = ${t.tramiteId}`;
    await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${documentoId}`;
    await tx`UPDATE documento_proceso SET proceso_id = ${cex} WHERE documento_id = ${documentoId}`;
    expect(await enCurso()).toBe(antes);
  }));

  it("una meta cambiada en configuración cambia el cumplimiento", () => revertida(sql, async (tx) => {
    const gth = await procesoId(tx, "GTH");
    const admin = await sesionAdmin(tx);
    await interno(tx, "GTH", "2025-01-10");
    await fijarMeta(tx, "meta_vencidos", "0");
    const exigente = (await indicadoresDocumentales(admin, { periodo: "2026", procesoId: gth }, { sql: tx, ahora }))!;
    expect(de(exigente, "vencidos")).toMatchObject({ meta: 0, cumple: false });
    await fijarMeta(tx, "meta_vencidos", "999");
    const holgada = (await indicadoresDocumentales(admin, { periodo: "2026", procesoId: gth }, { sql: tx, ahora }))!;
    expect(de(holgada, "vencidos")).toMatchObject({ meta: 999, cumple: true });

    await fijarMeta(tx, "meta_dentro_plazo_pct", "50");
    const media = (await indicadoresDocumentales(admin, { periodo: "2026", procesoId: gth }, { sql: tx, ahora }))!;
    expect(de(media, "dentro_plazo").meta).toBe(50);
    const fila = media.dentroPorProceso.find((p) => p.procesoId === gth)!;
    // Con la razón exacta, no con el entero redondeado.
    const conFecha = fila.vigentes - fila.sinFecha;
    expect(fila.cumple).toBe(conFecha === 0 ? null : fila.alDia * 100 >= 50 * conFecha);
    const dentro = de(media, "dentro_plazo");
    expect(dentro.cumple).toBe(dentro.denominador === 0 ? null : dentro.numerador * 100 >= 50 * dentro.denominador);
  }));

  it("la conformidad toma la cifra y el veredicto de la 13B: 2 de 3 frente a un umbral de 67 no cumple y se lee «66,6 %»", () => revertida(sql, async (tx) => {
    // Sin procesos, el líder ve solo los puntos de los que es responsable: los del test.
    const lider = await usuarioDePrueba(tx, { rol: "lider_proceso" });
    const admin = await sesionAdmin(tx);
    await fijarMeta(tx, "umbral_conformidad_pct", "67");
    for (const respuesta of ["conforme", "conforme", "no_conforme"] as const) {
      const punto = await puntoDePrueba(tx, { responsable: lider });
      await verificarPunto(tx, { verificador: admin, punto, ahora, respuesta });
    }
    const actual = (await estadoDePuntos(lider, { sql: tx, ahora })).conformidad;
    expect(actual).toMatchObject({ porcentaje: 67, cumple: false, puntos: 3 });
    const r = (await indicadoresDocumentales(lider, { periodo: "2026" }, { sql: tx, ahora }))!;
    expect(de(r, "conformidad")).toMatchObject({ valor: actual.porcentaje, cumple: actual.cumple, numerador: 2, denominador: 3, meta: 67 });
    expect(textoValor(de(r, "conformidad"))).toBe("66,6 %");
  }));

  it("con un proceso elegido, la aprobación y las etapas en plazo cuentan solo los trámites de ese proceso", () => revertida(sql, async (tx) => {
    const gth = await procesoId(tx, "GTH");
    const cex = await procesoId(tx, "CEX");
    const admin = await sesionAdmin(tx);
    // Dos trámites publicados en un año sin datos de la demo: una modificación en GTH y una creación en CEX.
    for (const t of [await tramiteEn(tx, "publicacion"), await tramiteEn(tx, "publicacion", { tipo: "crear" })]) {
      await transicionar(
        t.admin,
        { tramiteId: t.tramiteId, accion: "publicar", etapaEsperada: "publicacion", rondaEsperada: t.ronda, credenciales: { clave: "x" } },
        opc(tx, "2090-01-20T15:00:00Z"),
      );
    }
    const en = async (procesoId?: number) =>
      (await indicadoresDocumentales(admin, { periodo: "2090", procesoId }, { sql: tx, ahora: new Date("2090-02-01T15:00:00Z") }))!;
    for (const [r, esperado] of [[await en(), 2], [await en(gth), 1], [await en(cex), 1]] as const) {
      expect(r.tramites.publicados).toBe(esperado);
      expect(de(r, "aprobacion").denominador).toBe(esperado);
      expect(de(r, "etapas").denominador).toBe(esperado);
    }
  }));

  it("acuses y conformidad salen de las consultas de la 13B con la sesión; los puntos de uso no se desglosan por proceso", () => revertida(sql, async (tx) => {
    const gth = await procesoId(tx, "GTH");
    const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [gth] });
    const r = (await indicadoresDocumentales(lider, { periodo: "2026" }, { sql: tx, ahora }))!;
    const acuses = await resumenAcuses(lider, { desde: r.periodo.desde, hasta: new Date(r.periodo.hasta.getTime() + 1) }, { sql: tx });
    expect(de(r, "acuses")).toMatchObject({
      numerador: acuses.entidad.confirmados,
      denominador: acuses.entidad.confirmados + acuses.entidad.pendientes,
      valor: acuses.entidad.porcentaje,
    });
    const puntos = await estadoDePuntos(lider, { sql: tx, ahora });
    expect(de(r, "conformidad").valor).toBe(puntos.conformidad.porcentaje);
    expect(de(r, "conformidad").detalle).toMatch(/^en el periodo: /);
    expect(de(r, "conformidad").detalle).not.toContain("no se desglosa por proceso");

    const admin = await sesionAdmin(tx);
    const conProceso = (await indicadoresDocumentales(admin, { periodo: "2026", procesoId: gth }, { sql: tx, ahora }))!;
    const todos = await estadoDePuntos(admin, { sql: tx, ahora });
    expect(de(conProceso, "conformidad").valor).toBe(todos.conformidad.porcentaje);
    expect(de(conProceso, "conformidad").detalle).toContain("no se desglosa por proceso");
  }));

  it("Consulta no los tiene; un periodo que no se entiende es el actual, y salen los siete en su orden", () => revertida(sql, async (tx) => {
    const consulta = await usuarioDePrueba(tx, { rol: "consulta" });
    expect(await indicadoresDocumentales(consulta, { periodo: "2026" }, { sql: tx, ahora })).toBeNull();
    const admin = await sesionAdmin(tx);
    const r = (await indicadoresDocumentales(admin, { periodo: "no-es-un-periodo" }, { sql: tx, ahora }))!;
    expect(r.periodo.clave).toBe(periodoActual(ahora, ZONA).clave);
    expect(r.procesoId).toBeNull();
    expect(r.indicadores.map((i) => i.clave)).toEqual([...INDICADORES]);
  }));
});

describe("construirExcelIndicadores", () => {
  it("tres hojas con encabezado institucional, celdas de texto neutralizadas y fechas yyyy-mm-dd", async () => {
    const r: ResultadoIndicadores = {
      periodo: { clave: "2026", desde: finDeFecha("2025-12-31", ZONA), hasta: finDeFecha("2026-12-31", ZONA), etiqueta: "2026" },
      procesoId: null,
      indicadores: [
        { clave: "dentro_plazo", nombre: "Documentos dentro de su plazo de revisión", unidad: "pct", valor: 94, numerador: 94, denominador: 100, meta: 95, cumple: false, detalle: "2 documentos sin fecha de revisión" },
        { clave: "acuses", nombre: "Acuses de lectura confirmados", unidad: "pct", valor: null, numerador: 0, denominador: 0, meta: 90, cumple: null, detalle: null },
      ],
      vencidosPorProceso: [{ procesoId: 1, sigla: "GTH", proceso: "Gestión del Talento Humano", vencidos: 1 }],
      dentroPorProceso: [
        { procesoId: 1, sigla: "GTH", proceso: "Gestión del Talento Humano", vigentes: 14, alDia: 11, valor: 85, cumple: false, sinFecha: 1 },
        { procesoId: 2, sigla: "SGC", proceso: "Sistema de Gestión de Calidad", vigentes: 19, alDia: 18, valor: 95, cumple: false, sinFecha: 0 },
      ],
      vencidos: [{
        documentoId: 9, codigo: "GTH-PR-09", titulo: "=HYPERLINK(\"http://x\")", origen: "interno", procesoId: 1, sigla: "GTH",
        proceso: "Gestión del Talento Humano", proximaRevision: finDeFecha("2026-01-10", ZONA), dias: 302, tramite: "SOL-2026-004",
      }],
      tramites: { publicados: 18, enCurso: 4 },
    };
    const libro = new ExcelJS.Workbook();
    const buffer = await construirExcelIndicadores(r, { hospital: "+Hospital de prueba", generadoEn: "9 nov 2026", proceso: "todos", zona: ZONA });
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);
    const filas = (nombre: string) => {
      const salida: unknown[][] = [];
      libro.getWorksheet(nombre)!.eachRow((f) => salida.push((f.values as unknown[]).slice(1)));
      return salida;
    };
    expect(libro.worksheets.map((h) => h.name)).toEqual(["Indicadores", "Por proceso", "Vencidos"]);
    for (const hoja of ["Indicadores", "Por proceso", "Vencidos"]) expect(filas(hoja)[0][0]).toBe("'+Hospital de prueba");
    expect(filas("Indicadores")[3][0]).toBe("Periodo: 2026 · Proceso: todos — Trámites publicados en el periodo: 18 · en curso: 4 — Los de estado, a la fecha de generación");
    expect(filas("Indicadores")[4]).toEqual(["Indicador", "Valor", "Meta", "Cumple", "Numerador", "Denominador", "Detalle"]);
    expect(filas("Indicadores")[5]).toEqual(["Documentos dentro de su plazo de revisión", "94 %", "≥ 95 %", "No cumple", 94, 100, "2 documentos sin fecha de revisión"]);
    expect(filas("Indicadores")[6].slice(0, 4)).toEqual(["Acuses de lectura confirmados", "Sin dato", "≥ 90 %", "Sin dato"]);
    expect(filas("Por proceso")[5]).toEqual(["GTH", "Gestión del Talento Humano", 14, 11, 1, 2, "85 %", "No cumple"]);
    // 18 de 19 no alcanza la meta de 95: la cifra no se redondea a ella.
    expect(filas("Por proceso")[6]).toEqual(["SGC", "Sistema de Gestión de Calidad", 19, 18, 0, 1, "94,7 %", "No cumple"]);
    expect(filas("Vencidos")[5]).toEqual(["GTH-PR-09", "'=HYPERLINK(\"http://x\")", "Interno", "GTH · Gestión del Talento Humano", "2026-01-10", 302, "SOL-2026-004"]);
  });
});
