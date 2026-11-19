/**
 * El Excel de la lista de hallazgos (Fase 15A, Tarea 21; spec 15 §16.3 y Apéndice A.6): la matriz consolidada del SGC-FO-28 con
 * una fila por actividad, más el código y la ronda; lo que la lista muestra con sus filtros (`filtroHallazgos`), sus fórmulas
 * neutralizadas y su bitácora. El libro se prueba con filas armadas a mano (sin base); lo que se lee y el handler, contra la BD de
 * desarrollo, dentro de una transacción que se revierte (el cliente de la app se sustituye por ella).
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

import { GET as excelDeHallazgos } from "@/app/(app)/mejoramiento/excel/route";
import { obtenerSql } from "@/db/cliente";
import { reasignarActividad, registrarSeguimiento } from "@/db/consultas/mejoramiento/actividades";
import { cargarHallazgo } from "@/db/consultas/mejoramiento/carga";
import { filasParaExcel } from "@/db/consultas/mejoramiento/lectura";
import { enviarReporte } from "@/db/consultas/mejoramiento/reportes";
import { registrarHallazgo } from "@/db/consultas/mejoramiento/registro";
import type { MetaHoja } from "@/lib/distribucion/hoja-excel";
import { construirExcelDeHallazgos, type ActividadDeExcel, type FilaDeExcel } from "@/lib/mejoramiento/excel";
import { estadoDeActividadEnTexto } from "@/lib/mejoramiento/textos";
import { crearSesion } from "@/lib/sesion";
import {
  baseDeMejora,
  c,
  datosDeCarga,
  datosDeHallazgo,
  escaneoDeLaCarga,
  hallazgoEn,
  HORA_DE_ESCENA,
  objetivoDePrueba,
  otroProcesoConLider,
  planDeMejoraDePrueba,
} from "./utiles/mejoramiento";
import { procesoNuevo } from "./utiles/mixto";
import { revertida } from "./utiles/transaccion";
import { documentoLibre, tipoLibre, TIPO_LIBRE, usuarioDePrueba } from "./utiles/tramites";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const META: MetaHoja = { hospital: "Entidad Zeta de Prueba", generadoEn: "2026-11-18 10:00", detalle: "Todos los hallazgos" };
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Las columnas del libro, en orden: el código y la ronda, y las diecisiete de la matriz con «Fin original» junto a «Fecha límite»; al
 * final, «Plan» y «Objetivo» (Fase 15B).
 */
const COLUMNAS = [
  "Código",
  "Ronda",
  "N°",
  "Proceso",
  "Fuente u origen",
  "Tipo de acción",
  "Código del hallazgo",
  "Descripción del hallazgo",
  "Causa raíz identificada",
  "Acción formulada",
  "Responsable",
  "Fecha de inicio",
  "Fecha límite",
  "Fin original",
  "Avance",
  "Estado",
  "Evidencia de implementación",
  "Evaluación de eficacia y criterio",
  "Observaciones o causa del retraso",
  "Decisión de la Alta Dirección",
  // Fase 15B (anexo §10.6): la clasificación, al final.
  "Plan",
  "Objetivo",
];

/** La hoja «Hallazgos» como filas de texto: la cabecera y las de datos debajo. */
async function leerHoja(datos: Buffer | ArrayBuffer): Promise<{ cabecera: string[]; filas: string[][]; todo: string }> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(datos as ArrayBuffer);
  const hoja = libro.getWorksheet("Hallazgos")!;
  const filas: string[][] = [];
  hoja.eachRow({ includeEmpty: true }, (fila, n) => {
    const valores: string[] = [];
    for (let col = 1; col <= hoja.columnCount; col++) {
      const v = fila.getCell(col).value;
      valores.push(v === null || v === undefined ? "" : String(v));
    }
    filas[n - 1] = valores;
  });
  const todas = Array.from(filas, (f) => f ?? []);
  const i = todas.findIndex((f) => f[0] === "Código" && f[1] === "Ronda");
  return { cabecera: todas[i], filas: todas.slice(i + 1), todo: todas.map((f) => f.join(" | ")).join("\n") };
}

const actividadDe = (extra: Partial<ActividadDeExcel>): ActividadDeExcel => ({
  etiqueta: "A1.1",
  tipo: "correctiva",
  accion: "Actualizar el procedimiento de entrega de turno",
  descripcion: "Redactar la versión nueva",
  causas: ["El procedimiento no asigna el registro al turno de noche"],
  metodos: ["cinco_porques"],
  responsable: "Laura Rojas",
  cargo: "Jefe de enfermería",
  inicio: "2026-11-17",
  fin: "2026-12-20",
  finOriginal: "2026-12-15",
  avance: 40,
  estado: "en_proceso",
  verificacion: null,
  vencida: null,
  reprogramada: true,
  evidencias: 2,
  ultimoSeguimiento: { fecha: "2026-11-25", realizado: "Se redactó el borrador", barreras: "Falta la firma del jefe" },
  ajuste: { tipo: "reprogramar", estado: "aprobado", causa: "La imprenta entregó tarde", decididoPor: "Gloria Gerente", decididoEn: "2026-11-26" },
  escalada: null,
  ...extra,
});

const filaDe = (extra: Partial<FilaDeExcel>): FilaDeExcel => ({
  codigo: "HZ-2026-004",
  ronda: 1,
  proceso: "Hospitalización",
  origen: "auditoria_interna",
  fuente: "Auditoría interna del 10 de noviembre",
  titulo: "Formatos de entrega de turno sin diligenciar",
  descripcion: "En la revisión de tres turnos se encontraron los formatos sin diligenciar.",
  actividad: actividadDe({}),
  eficacia: { resultado: null, criterios: ["no_recurrencia"], criterioOtro: null },
  cierre: null,
  plan: null,
  objetivo: null,
  ...extra,
});

describe("construirExcelDeHallazgos", () => {
  it("las columnas son, en orden, código, ronda y las diecisiete de la matriz del SGC-FO-28, con «Fin original» junto a «Fecha límite»", async () => {
    const { cabecera } = await leerHoja(await construirExcelDeHallazgos([filaDe({})], META));
    expect(cabecera).toEqual(COLUMNAS);
    expect(cabecera.indexOf("Fin original")).toBe(cabecera.indexOf("Fecha límite") + 1);
  });

  it("una fila por actividad, numeradas, y una por hallazgo sin actividades", async () => {
    const filas = [
      filaDe({}),
      filaDe({ actividad: actividadDe({ etiqueta: "A1.2", descripcion: "Capacitar a los turnos", estado: "terminada", verificacion: "conforme", reprogramada: false }) }),
      filaDe({ codigo: "HZ-2026-005", titulo: "Neveras sin registro", actividad: null }),
    ];
    const { filas: datos } = await leerHoja(await construirExcelDeHallazgos(filas, META));
    expect(datos).toHaveLength(3);
    const col = (n: string) => COLUMNAS.indexOf(n);
    expect(datos.map((f) => f[col("N°")])).toEqual(["1", "2", "3"]);
    // «Código» es el de la actividad; el del hallazgo, solo en «Código del hallazgo» (ruling de la ronda 1).
    expect(datos.map((f) => f[col("Código")])).toEqual(["A1.1", "A1.2", ""]);
    expect(datos[0][col("Acción formulada")]).toBe("Actualizar el procedimiento de entrega de turno · Actividad: Redactar la versión nueva");
    expect(datos.map((f) => f[col("Código del hallazgo")])).toEqual(["HZ-2026-004", "HZ-2026-004", "HZ-2026-005"]);
    const [a, b, sin] = datos;
    expect(a[col("Fecha límite")]).not.toBe(a[col("Fin original")]);
    expect(a[col("Estado")]).toContain("En proceso");
    expect(a[col("Estado")]).toContain("Reprogramada");
    expect(b[col("Estado")]).toContain("Conforme");
    expect(a[col("Responsable")]).toBe("Laura Rojas · Jefe de enfermería");
    expect(a[col("Avance")]).toBe("40 %");
    expect(a[col("Causa raíz identificada")]).toContain("El procedimiento no asigna el registro al turno de noche");
    expect(a[col("Causa raíz identificada")]).toContain("5 porqués");
    expect(a[col("Evidencia de implementación")]).toContain("2 archivos");
    expect(a[col("Evidencia de implementación")]).toContain("Se redactó el borrador");
    expect(a[col("Observaciones o causa del retraso")]).toContain("Falta la firma del jefe");
    expect(a[col("Observaciones o causa del retraso")]).toContain("La imprenta entregó tarde");
    expect(a[col("Decisión de la Alta Dirección")]).toContain("Gloria Gerente");
    expect(a[col("Evaluación de eficacia y criterio")]).toContain("No recurrencia");
    // Sin actividades: el hallazgo, sin nada de la actividad.
    expect(sin[col("Acción formulada")]).toBe("");
    expect(sin[col("Responsable")]).toBe("");
    expect(sin[col("Descripción del hallazgo")]).toContain("Neveras sin registro");
  });

  it("«Plan» y «Objetivo» son las dos últimas columnas, con lo que trae cada fila (vacías sin clasificación)", async () => {
    const { cabecera, filas: datos } = await leerHoja(
      await construirExcelDeHallazgos(
        [filaDe({ plan: "PM-2026-01 Auditoría interna de calidad", objetivo: "Mejorar la oportunidad de la atención" }), filaDe({})],
        META,
      ),
    );
    expect(cabecera.slice(-2)).toEqual(["Plan", "Objetivo"]);
    expect(datos[0].slice(-2)).toEqual(["PM-2026-01 Auditoría interna de calidad", "Mejorar la oportunidad de la atención"]);
    expect(datos[1].slice(-2)).toEqual(["", ""]);
  });

  it("un título =1+1 sale neutralizado", async () => {
    const { filas: datos, todo } = await leerHoja(
      await construirExcelDeHallazgos([filaDe({ titulo: "=1+1", actividad: actividadDe({ accion: "+SUMA(A1)", descripcion: "@hoy" }) })], META),
    );
    const col = (n: string) => COLUMNAS.indexOf(n);
    expect(datos[0][col("Descripción del hallazgo")].startsWith("'=1+1")).toBe(true);
    expect(datos[0][col("Acción formulada")].startsWith("'+SUMA(A1)")).toBe(true);
    expect(todo).not.toMatch(/\| =/);
  });
});

describe("el estado de una actividad en texto", () => {
  it("una sola regla para el impreso y el Excel: vencida, guardado, verificación y «Reprogramada»", () => {
    expect(estadoDeActividadEnTexto({ estado: "en_proceso", verificacion: null, reprogramada: true, vencida: null })).toBe("En proceso · Reprogramada");
    expect(estadoDeActividadEnTexto({ estado: "terminada", verificacion: "devuelta", reprogramada: false, vencida: null })).toBe("Terminada · Devuelta");
    expect(estadoDeActividadEnTexto({ estado: "abierta", verificacion: null, reprogramada: false, vencida: { vence: "2026-11-15", hoy: "2026-11-18" } })).toBe(
      "Vencida hace 3 días",
    );
  });
});

describe("filasParaExcel", () => {
  it("una fila por actividad de un plan aprobado y una por hallazgo sin actividades; respeta los filtros de la lista", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const enEjecucion = await hallazgoEn(tx, b, "en_ejecucion", undefined, { actividades: 2 });
      const porAceptar = await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId, { titulo: "Neveras sin registro de temperatura" }), c(HORA_DE_ESCENA, tx));
      const o = { sql: tx, ahora: new Date(HORA_DE_ESCENA) };

      const todas = await filasParaExcel(b.admin, { procesoId: b.procesoId }, o);
      expect(todas.map((f) => [f.codigo, f.actividad?.etiqueta ?? null]).sort()).toEqual(
        [[enEjecucion.codigo, "A1.1"], [enEjecucion.codigo, "A1.2"], [porAceptar.codigo, null]].sort(),
      );
      const a = todas.find((f) => f.actividad?.etiqueta === "A1.1")!;
      expect(a).toMatchObject({ ronda: 1, origen: "auditoria_interna" });
      expect(a.actividad).toMatchObject({ tipo: "correctiva", finOriginal: "2026-12-15", fin: "2026-12-15", estado: "abierta", evidencias: 0 });
      expect(a.actividad!.causas).toEqual(["El procedimiento no asigna el registro al turno de noche"]);

      const filtradas = await filasParaExcel(b.admin, { procesoId: b.procesoId, estado: "por_aceptar" }, o);
      expect(filtradas.map((f) => f.codigo)).toEqual([porAceptar.codigo]);
      const porTexto = await filasParaExcel(b.admin, { procesoId: b.procesoId, q: "neveras" }, o);
      expect(porTexto.map((f) => f.codigo)).toEqual([porAceptar.codigo]);
    }));

  it("cada fila lleva el plan («código nombre») y el enunciado del objetivo del hallazgo (Fase 15B)", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const plan = await planDeMejoraDePrueba(tx, b.control);
      const objetivo = await objetivoDePrueba(tx);
      const enPlan = await registrarHallazgo(
        b.control,
        datosDeHallazgo(b.procesoId, { planId: plan.id, objetivoId: objetivo.id }),
        c(HORA_DE_ESCENA, tx),
      );
      const suelto = await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId), c(HORA_DE_ESCENA, tx));
      const filas = await filasParaExcel(b.admin, { procesoId: b.procesoId }, { sql: tx, ahora: new Date(HORA_DE_ESCENA) });
      expect(filas.find((f) => f.codigo === enPlan.codigo)).toMatchObject({
        plan: `${plan.codigo} Auditoría interna de calidad de noviembre`,
        objetivo: objetivo.enunciado,
      });
      expect(filas.find((f) => f.codigo === suelto.codigo)).toMatchObject({ plan: null, objetivo: null });
      // El filtro por plan y por objetivo de la lista llega al Excel.
      expect((await filasParaExcel(b.admin, { plan: plan.id }, { sql: tx, ahora: new Date(HORA_DE_ESCENA) })).map((f) => f.codigo)).toEqual([
        enPlan.codigo,
      ]);
      expect(
        (await filasParaExcel(b.admin, { objetivo: objetivo.id }, { sql: tx, ahora: new Date(HORA_DE_ESCENA) })).map((f) => f.codigo),
      ).toEqual([enPlan.codigo]);
    }));

  it("respeta filtroHallazgos: el líder de otro proceso no recibe nada", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      await hallazgoEn(tx, b, "en_ejecucion");
      const ajeno = (await otroProcesoConLider(tx)).lider;
      expect(await filasParaExcel(ajeno, {}, { sql: tx, ahora: new Date(HORA_DE_ESCENA) })).toEqual([]);
    }));

  it("quien reportó el reporte convertido en el hallazgo no lo recibe", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const quien = await usuarioDePrueba(tx, { rol: "consulta" });
      const o = c(HORA_DE_ESCENA, tx);
      const { id: reporteId } = await enviarReporte(
        quien,
        { descripcion: "La nevera de urgencias marcaba 12 grados y nadie la registró", vistoEn: "2026-11-09", procesoId: b.procesoId, referenciaCaso: null },
        o,
      );
      const h = await registrarHallazgo(b.admin, datosDeHallazgo(b.procesoId, { reporteId }), o);
      const lee = { sql: tx, ahora: new Date(HORA_DE_ESCENA) };
      expect(await filasParaExcel(quien, {}, lee)).toEqual([]);
      // Control positivo: quien lo registró sí.
      expect((await filasParaExcel(b.admin, { procesoId: b.procesoId }, lee)).map((f) => f.codigo)).toEqual([h.codigo]);
    }));

  it("una carga sin su formato firmado no le llega a quien solo es su responsable declarado; con el escaneo, sí", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const { id, codigo } = await cargarHallazgo(b.admin, datosDeCarga(b.procesoId, responsable.usuarioId), c("2026-11-18T15:00:00Z", tx));
      const lee = { sql: tx, ahora: new Date("2026-11-18T17:00:00Z") };
      expect(await filasParaExcel(responsable, {}, lee)).toEqual([]);
      await escaneoDeLaCarga(tx, id, b.admin.usuarioId, "2026-11-18T16:00:00Z");
      const filas = await filasParaExcel(responsable, {}, lee);
      expect(filas.map((f) => [f.codigo, f.actividad?.etiqueta])).toEqual([
        [codigo, "A1.1"],
        [codigo, "A1.2"],
      ]);
    }));

  it("quien ve el hallazgo solo por su actividad no recibe los seguimientos ni la evidencia de las de otros", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const h = await hallazgoEn(tx, b, "en_ejecucion", undefined, { actividades: 2 });
      const o = c(HORA_DE_ESCENA, tx);
      const [suya, ajena] = (await tx`SELECT id FROM mejora_actividades WHERE hallazgo_id = ${h.id} ORDER BY orden, id`).map((f) => Number(f.id));
      await reasignarActividad(b.lider, { actividadId: suya, responsableId: responsable.usuarioId, motivo: "Ella lleva el turno de noche" }, o);
      await registrarSeguimiento(responsable, { actividadId: suya, fecha: "2026-11-17", realizado: "Se redactó lo propio", avance: 20, barreras: "Barrera propia" }, o);
      await registrarSeguimiento(b.lider, { actividadId: ajena, fecha: "2026-11-17", realizado: "Se avanzó en lo ajeno", avance: 30, barreras: "Barrera ajena" }, o);
      const lee = { sql: tx, ahora: new Date(HORA_DE_ESCENA) };

      const suyas = await filasParaExcel(responsable, {}, lee);
      expect(suyas.map((f) => f.actividad?.etiqueta).sort()).toEqual(["A1.1", "A1.2"]);
      // La A1.1 es la suya (la primera, reasignada); la A1.2 sigue siendo de la líder.
      const propia = suyas.find((f) => f.actividad?.etiqueta === "A1.1")!;
      expect(propia.actividad!.ultimoSeguimiento?.barreras).toBe("Barrera propia");
      expect(propia.actividad!.evidencias).toBe(0);
      const deOtro = suyas.find((f) => f.actividad?.etiqueta === "A1.2")!;
      expect(deOtro.actividad!.ultimoSeguimiento).toBeNull();
      expect(deOtro.actividad!.evidencias).toBeNull();
      expect(deOtro.actividad!.ajuste).toBeNull();
      const libro = await leerHoja(await construirExcelDeHallazgos(suyas, META));
      expect(libro.todo).not.toContain("Barrera ajena");
      expect(libro.todo).not.toContain("Se avanzó en lo ajeno");
      expect(libro.todo).toContain("Barrera propia");

      // Control positivo: quien ve el hallazgo completo sí los recibe.
      const completas = await filasParaExcel(b.admin, { procesoId: b.procesoId }, lee);
      expect(completas.find((f) => f.actividad?.etiqueta === "A1.2")!.actividad!.ultimoSeguimiento?.barreras).toBe("Barrera ajena");
    }));
});

describe("GET /mejoramiento/excel", () => {
  const pedir = (token?: string, consulta = "") =>
    excelDeHallazgos(new NextRequest(`http://localhost:3002/mejoramiento/excel${consulta}`, token ? { headers: { cookie: `sgc_sesion=${token}` } } : undefined));

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

  it("401 sin sesión; 200 con el tipo de Excel y no-store; el líder de otro proceso recibe un libro sin filas", () =>
    enTransaccion(async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "en_ejecucion");
      expect((await pedir()).status).toBe(401);

      const res = await pedir(await conToken(tx, b.lider.usuarioId), `?proceso=${b.procesoId}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe(XLSX);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="hallazgos-\d{8}\.xlsx"$/);
      const propio = await leerHoja(await res.arrayBuffer());
      expect(propio.filas.map((f) => f[COLUMNAS.indexOf("Código del hallazgo")])).toEqual([h.codigo]);

      const ajeno = (await otroProcesoConLider(tx)).lider;
      const suyo = await leerHoja(await (await pedir(await conToken(tx, ajeno.usuarioId))).arrayBuffer());
      expect(suyo.cabecera).toEqual(COLUMNAS);
      expect(suyo.filas).toEqual([]);
      expect(suyo.todo).not.toContain(h.codigo);
    }));

  it("limita a diez descargas por minuto por persona", () =>
    enTransaccion(async (tx) => {
      const token = await conToken(tx, (await usuarioDePrueba(tx, { rol: "consulta" })).usuarioId);
      for (let i = 0; i < 10; i++) expect((await pedir(token)).status).toBe(200);
      const res = await pedir(token);
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("60");
    }));

  it("aplica los filtros y deja mejora_exporto_hallazgos en la bitácora con los filtros", () =>
    enTransaccion(async (tx) => {
      const b = await baseDeMejora(tx);
      await hallazgoEn(tx, b, "en_ejecucion");
      const porAceptar = await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId, { titulo: "Neveras sin registro" }), c(HORA_DE_ESCENA, tx));
      const res = await pedir(await conToken(tx, b.admin.usuarioId), `?proceso=${b.procesoId}&estado=por_aceptar&clase=no_conformidad`);
      expect(res.status).toBe(200);
      const hoja = await leerHoja(await res.arrayBuffer());
      expect(hoja.filas.map((f) => f[COLUMNAS.indexOf("Código del hallazgo")])).toEqual([porAceptar.codigo]);
      expect(hoja.todo).toContain("Estado: Por aceptar");

      const filas = await tx`SELECT accion, entidad, entidad_id, detalle FROM auditoria WHERE usuario_id = ${b.admin.usuarioId} AND accion = 'mejora_exporto_hallazgos'`;
      expect(filas.map((f) => ({ accion: f.accion, entidad: f.entidad, entidadId: f.entidad_id, detalle: f.detalle }))).toEqual([
        {
          accion: "mejora_exporto_hallazgos",
          entidad: "mejora_hallazgo",
          entidadId: null,
          detalle: { filtros: { procesoId: b.procesoId, clase: "no_conformidad", estado: "por_aceptar" } },
        },
      ]);
    }));

  it("la línea de filtros nombra el documento que la persona ve y no el que no ve, aunque el id llegue en la dirección (Fase 15B)", () =>
    enTransaccion(async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await procesoNuevo(tx);
      await tipoLibre(tx);
      const [{ sigla }] = await tx`SELECT sigla FROM procesos WHERE id = ${otro}`;
      const restringido = await documentoLibre(tx, { proceso: sigla as string, tipo: TIPO_LIBRE, titulo: "Protocolo reservado de prueba" });
      await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${restringido.id}`;
      await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId, { documentoId: restringido.id }), c(HORA_DE_ESCENA, tx));

      const delLider = await leerHoja(await (await pedir(await conToken(tx, b.lider.usuarioId), `?documento=${restringido.id}`)).arrayBuffer());
      expect(delLider.todo).toContain("Documento: no disponible");
      expect(delLider.todo).not.toContain("Protocolo reservado de prueba");
      expect(delLider.todo).not.toContain(restringido.codigo);
      // Control Interno ve los restringidos: la línea lo nombra, y la fila sale.
      const delControl = await leerHoja(await (await pedir(await conToken(tx, b.control.usuarioId), `?documento=${restringido.id}`)).arrayBuffer());
      expect(delControl.todo).toContain(`Documento: ${restringido.codigo} Protocolo reservado de prueba`);
      expect(delControl.filas).toHaveLength(1);
      const [rastro] = await tx`SELECT detalle FROM auditoria WHERE usuario_id = ${b.control.usuarioId} AND accion = 'mejora_exporto_hallazgos'`;
      expect(rastro.detalle).toEqual({ filtros: { documento: restringido.id } });
    }));
});
