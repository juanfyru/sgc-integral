/**
 * El Excel para el ente (Fase 15B, Tarea 6; anexo §4): las trece columnas (puro) y la ruta `/mejoramiento/planes/[id]/excel`
 * contra la BD de trabajo, dentro de una transacción que se revierte (el cliente de la app se sustituye por ella).
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

import { GET as excelDelEnte } from "@/app/(app)/mejoramiento/planes/[id]/excel/route";
import { obtenerSql } from "@/db/cliente";
import { ponerEnPlan } from "@/db/consultas/mejoramiento/clasificacion";
import type { FilaDePlanDeAccion } from "@/db/consultas/mejoramiento/filas-de-plan";
import { anularHallazgo } from "@/db/consultas/mejoramiento/registro";
import { COLUMNAS_DEL_ENTE, construirExcelDelEnte, estadoDeActividadEnTexto, filasDelEnte } from "@/lib/mejoramiento/excel-ente";
import { crearSesion } from "@/lib/sesion";
import { baseDeMejora, c, hallazgoEn, HORA_DE_ESCENA, planDeMejoraDePrueba } from "./utiles/mejoramiento";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PLAN = { nombre: "Auditoría interna de calidad de noviembre", vigencia: 2026 };

const filaDe = (extra: Partial<FilaDePlanDeAccion> = {}): FilaDePlanDeAccion => ({
  hallazgo: {
    id: 1,
    codigo: "HZ-2026-004",
    titulo: "Formatos sin diligenciar",
    descripcion: "Se hallaron sin diligenciar",
    clase: "no_conformidad",
    origen: "auditoria_interna",
    procesoId: 1,
    proceso: "Hospitalización",
    planCodigo: null,
  },
  ronda: 1,
  rondas: 1,
  accion: {
    numero: "A1",
    tipo: "correctiva",
    descripcion: "Actualizar el procedimiento",
    recursos: null,
    indicadorCumplimiento: null,
    meta: null,
    causas: "No hay registro por turno",
    metodo: "5 porqués",
  },
  actividad: {
    id: 9,
    descripcion: "Redactar la versión nueva",
    responsable: "Laura Rojas",
    cargo: "Jefe de enfermería",
    inicio: "2026-11-02",
    fin: "2026-12-31",
    reprogramada: false,
    avance: 40,
    estado: "en_proceso",
    vencida: false,
    ultimoSeguimiento: { fecha: "2026-11-25", realizado: "Se redactó el borrador" },
    archivos: 2,
  },
  enQueVa: null,
  ...extra,
});

describe("filasDelEnte", () => {
  it("la columnas son las trece, en su orden", () => {
    expect(COLUMNAS_DEL_ENTE).toEqual([
      "Auditoría o evento",
      "Vigencia",
      "Hallazgo",
      "Acción de mejora",
      "Plazo",
      "Fecha de inicio",
      "Fecha de terminación",
      "Avance (%)",
      "Observaciones",
      "Responsable",
      "Código",
      "Causa raíz",
      "Estado",
    ]);
  });

  it("la fila de una actividad trae las trece celdas", () => {
    const [f] = filasDelEnte(PLAN, [filaDe()]);
    expect(f).toHaveLength(13);
    expect(f).toEqual([
      PLAN.nombre,
      2026,
      "Formatos sin diligenciar — Se hallaron sin diligenciar",
      "Actualizar el procedimiento · Actividad: Redactar la versión nueva",
      "60 días",
      "2026/11/02",
      "2026/12/31",
      40,
      "Se redactó el borrador",
      "Jefe de enfermería",
      "HZ-2026-004",
      "No hay registro por turno · Método: 5 porqués",
      "En proceso",
    ]);
  });

  it("sin cargo, el responsable sale por su nombre; sin seguimiento, observaciones vacías", () => {
    const base = filaDe();
    const [f] = filasDelEnte(PLAN, [{ ...base, actividad: { ...base.actividad!, cargo: null, ultimoSeguimiento: null } }]);
    expect(f[9]).toBe("Laura Rojas");
    expect(f[8]).toBe("");
  });

  it("la fila sin actividad trae las columnas 1 a 3 y la 11, y en Observaciones en qué va", () => {
    const [f] = filasDelEnte(PLAN, [filaDe({ accion: null, actividad: null, enQueVa: "En revisión" })]);
    expect(f.map((v, i) => (v === "" ? null : i + 1)).filter((n) => n !== null)).toEqual([1, 2, 3, 9, 11]);
    expect(f[8]).toBe("En revisión");
    expect(f[10]).toBe("HZ-2026-004");
  });

  it("neutraliza toda celda de texto, en el libro: también el estado, la fecha y el código", async () => {
    const base = filaDe();
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(
      (await construirExcelDelEnte({ nombre: "=PLAN()", vigencia: 2026 }, [
        {
          ...base,
          hallazgo: { ...base.hallazgo, titulo: "=1+1", codigo: "-HZ" },
          actividad: { ...base.actividad!, estado: "=cmd" as "abierta", inicio: "+2026-11-02", responsable: "@x", cargo: null },
        },
      ])) as unknown as ArrayBuffer,
    );
    const fila = libro.worksheets[0].getRow(2);
    const celdas = Array.from({ length: 13 }, (_, i) => fila.getCell(i + 1).value);
    expect(celdas[0]).toBe("'=PLAN()");
    expect(String(celdas[2]).startsWith("'=1+1")).toBe(true);
    expect(celdas[5]).toBe("'+2026/11/02");
    expect(celdas[9]).toBe("'@x");
    expect(celdas[10]).toBe("'-HZ");
    expect(celdas[12]).toBe("'=cmd");
    for (const v of celdas) if (typeof v === "string") expect(v).not.toMatch(/^[=+\-@]/);
  });

  it("una actividad cancelada con el fin pasado sale «Cancelada», no «Vencida»", () => {
    const base = filaDe();
    const [f] = filasDelEnte(PLAN, [{ ...base, actividad: { ...base.actividad!, estado: "cancelada", fin: "2026-11-05", vencida: false } }]);
    expect(f[12]).toBe("Cancelada");
  });

  it("el estado: el de la actividad o «Vencida»", () => {
    expect(estadoDeActividadEnTexto({ estado: "abierta", vencida: false })).toBe("Abierta");
    expect(estadoDeActividadEnTexto({ estado: "en_proceso", vencida: false })).toBe("En proceso");
    expect(estadoDeActividadEnTexto({ estado: "terminada", vencida: false })).toBe("Terminada");
    expect(estadoDeActividadEnTexto({ estado: "cancelada", vencida: false })).toBe("Cancelada");
    expect(estadoDeActividadEnTexto({ estado: "en_proceso", vencida: true })).toBe("Vencida");
  });
});

describe("GET /mejoramiento/planes/[id]/excel", () => {
  const pedir = (id: string | number, token?: string) =>
    excelDelEnte(
      new NextRequest(`http://localhost:3002/mejoramiento/planes/${id}/excel`, token ? { headers: { cookie: `sgc_sesion=${token}` } } : undefined),
      { params: Promise.resolve({ id: String(id) }) },
    );

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

  async function leer(res: Response): Promise<{ hojas: number; filas: string[][] }> {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await res.arrayBuffer());
    const hoja = libro.worksheets[0];
    const filas: string[][] = [];
    hoja.eachRow({ includeEmpty: true }, (fila, n) => {
      filas[n - 1] = Array.from({ length: hoja.columnCount }, (_, i) => {
        const v = fila.getCell(i + 1).value;
        return v === null || v === undefined ? "" : String(v);
      });
    });
    return { hojas: libro.worksheets.length, filas };
  }

  it("Gerencia recibe el libro, con la bitácora; el líder y un plan que no existe, el mismo 404; sin sesión, 401", () =>
    enTransaccion(async (tx) => {
      const b = await baseDeMejora(tx);
      const plan = await planDeMejoraDePrueba(tx, b.control);
      const h = await hallazgoEn(tx, b, "en_ejecucion");
      await ponerEnPlan(b.control, { planId: plan.id, hallazgoIds: [h.id] }, c(HORA_DE_ESCENA, tx));

      expect((await pedir(plan.id)).status).toBe(401);

      const res = await pedir(plan.id, await conToken(tx, b.gerencia.usuarioId));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe(XLSX);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(res.headers.get("Content-Disposition")).toMatch(new RegExp(`^attachment; filename="${plan.codigo}-seguimiento-\\d{8}\\.xlsx"$`));
      const { hojas, filas } = await leer(res);
      expect(hojas).toBe(1);
      expect(filas[0]).toEqual([...COLUMNAS_DEL_ENTE]);
      expect(filas).toHaveLength(2);
      expect(filas[1][10]).toBe(h.codigo);
      expect(filas[1][0]).toBe("Auditoría interna de calidad de noviembre");

      const [bitacora] = await tx`SELECT entidad, entidad_id, detalle FROM auditoria WHERE accion = 'mejora_exporto_plan_ente' AND usuario_id = ${b.gerencia.usuarioId}`;
      expect(bitacora).toMatchObject({ entidad: "mejora_plan", detalle: { codigo: plan.codigo, hallazgos: 1 } });
      expect(Number(bitacora.entidad_id)).toBe(plan.id);

      const token = await conToken(tx, b.lider.usuarioId);
      const delLider = await pedir(plan.id, token);
      const inexistente = await pedir(999999999, token);
      expect(delLider.status).toBe(404);
      expect(inexistente.status).toBe(404);
      expect(await delLider.text()).toBe(await inexistente.text());
    }));

  it("un hallazgo anulado del plan no sale", () =>
    enTransaccion(async (tx) => {
      const b = await baseDeMejora(tx);
      const plan = await planDeMejoraDePrueba(tx, b.control);
      const vivo = await hallazgoEn(tx, b, "en_ejecucion");
      const muerto = await hallazgoEn(tx, b, "por_aceptar");
      await ponerEnPlan(b.control, { planId: plan.id, hallazgoIds: [vivo.id, muerto.id] }, c(HORA_DE_ESCENA, tx));
      await anularHallazgo(b.admin, { hallazgoId: muerto.id, justificacion: "Se registró dos veces por error" }, c(HORA_DE_ESCENA, tx));
      const { filas } = await leer(await pedir(plan.id, await conToken(tx, b.gerencia.usuarioId)));
      expect(filas.slice(1).map((f) => f[10])).toEqual([vivo.codigo]);
    }));
});
