/**
 * Los reportes por el camino de la interfaz (Fase 15A, Tarea 18): las acciones con un `FormData` real, contra la BD dentro de
 * una transacción que se revierte (el cliente de la app se sustituye por ella); solo la sesión es de mentira. Lo que importa
 * aquí es que, desde un reporte, el registro nunca lo deje sin clasificar: elegir una ocurrencia entre los parecidos lo suma.
 */
import { existsSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const { enCurso, redirect, requerirSesion } = vi.hoisted(() => ({
  enCurso: { sql: null as unknown },
  redirect: vi.fn((destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  }),
  requerirSesion: vi.fn(),
}));

vi.mock("@/db/cliente", async (original) => {
  const real = await original<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => (enCurso.sql ?? real.obtenerSql()) as ReturnType<typeof real.obtenerSql> };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/sesion-actual", () => ({ requerirSesion }));
vi.mock("@/lib/contexto-peticion", () => ({ contextoDePeticion: async () => ({ ip: "10.0.0.1", userAgent: "prueba" }) }));

import type { TransactionSql } from "postgres";
import { descartarReporteAccion, enviarReporteAccion, registrarHallazgoAccion, sumarReporteAccion } from "@/app/acciones-mejoramiento";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { enviarReporte } from "@/db/consultas/mejoramiento/reportes";
import { baseDeMejora, c, datosDeHallazgo, hallazgoEn, HORA_DE_ESCENA } from "./utiles/mejoramiento";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

beforeEach(() => {
  vi.clearAllMocks();
});

const LO_QUE_VIO = "Los formatos de entrega de turno quedaron sin diligenciar en la noche";

function formulario(campos: Record<string, string>) {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries(campos)) datos.append(campo, valor);
  return datos;
}

/** Corre `fn` con la acción en `tx` como `quien`, y la deja como estaba. */
async function como<T>(tx: TransactionSql, quien: SesionFlujo, fn: () => Promise<T>): Promise<T> {
  enCurso.sql = tx;
  requerirSesion.mockResolvedValue(quien);
  try {
    return await fn();
  } finally {
    enCurso.sql = null;
  }
}

const destino = (p: Promise<unknown>) => p.then(() => "sin redirección", (err: Error) => err.message);

/** Los campos del registro tal como los manda `FormularioHallazgo` (sus nombres son los de `EsquemaHallazgo`). */
function camposDelRegistro(procesoId: number, reporteId: number, relacion: string): Record<string, string> {
  const d = datosDeHallazgo(procesoId);
  return {
    clase: d.clase,
    origen: d.origen,
    fuente: d.fuente ?? "",
    detectadoEn: d.detectadoEn,
    procesoId: String(procesoId),
    criticidad: d.criticidad ?? "",
    titulo: d.titulo,
    descripcion: d.descripcion,
    requisitoClausula: d.requisitoClausula ?? "",
    reporteId: String(reporteId),
    relacion,
  };
}

describe("las acciones de los reportes", () => {
  it("enviar lleva al paso de los archivos del reporte", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const r = await como(tx, b.consulta, () =>
        destino(enviarReporteAccion(null, formulario({ descripcion: LO_QUE_VIO, vistoEn: "2026-11-09", procesoId: "" }))),
      );
      const [fila] = await tx`SELECT id, proceso_id, estado FROM mejora_reportes WHERE reportado_por = ${b.consulta.usuarioId}`;
      expect(r).toBe(`REDIRECT:/mejoramiento/reportar?reporte=${fila.id}`);
      expect(fila).toMatchObject({ proceso_id: null, estado: "recibido" });
    }));

  it("desde un reporte, registrar lo convierte y elegir una ocurrencia lo suma: nunca queda recibido", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const abierto = await hallazgoEn(tx, b, "por_aceptar");
      const reportar = async () => (await enviarReporte(b.consulta, { descripcion: LO_QUE_VIO, vistoEn: "2026-11-09", procesoId: b.procesoId }, c(HORA_DE_ESCENA, tx))).id;

      const sumado = await reportar();
      expect(await como(tx, b.admin, () => destino(registrarHallazgoAccion(null, formulario(camposDelRegistro(b.procesoId, sumado, `ocurrencia:${abierto.id}`)))))).toBe(
        `REDIRECT:/mejoramiento/${abierto.id}`,
      );
      const [s] = await tx`SELECT estado, hallazgo_id FROM mejora_reportes WHERE id = ${sumado}`;
      expect({ estado: s.estado, hallazgo: Number(s.hallazgo_id) }).toEqual({ estado: "sumado", hallazgo: abierto.id });
      const [o] = await tx`SELECT origen, reporte_id, descripcion FROM mejora_ocurrencias WHERE hallazgo_id = ${abierto.id}`;
      expect({ origen: o.origen, reporte: Number(o.reporte_id), descripcion: o.descripcion }).toEqual({ origen: "reporte", reporte: sumado, descripcion: LO_QUE_VIO });

      const convertido = await reportar();
      const r = await como(tx, b.admin, () => destino(registrarHallazgoAccion(null, formulario(camposDelRegistro(b.procesoId, convertido, "distinto")))));
      const [k] = await tx`SELECT estado, hallazgo_id FROM mejora_reportes WHERE id = ${convertido}`;
      expect(k.estado).toBe("convertido");
      expect(r).toBe(`REDIRECT:/mejoramiento/${k.hallazgo_id}`);

      // Quien registra sin clasificar (Control Interno) no convierte: el reporte sigue recibido.
      const ajeno = await reportar();
      const rechazo = await como(tx, b.control, () => registrarHallazgoAccion(null, formulario(camposDelRegistro(b.procesoId, ajeno, "distinto"))));
      expect(rechazo).toMatchObject({ ok: false });
      expect((await tx`SELECT estado FROM mejora_reportes WHERE id = ${ajeno}`)[0].estado).toBe("recibido");
    }));

  it("sumar por el código de un hallazgo abierto que no es parecido, o por uno de los parecidos (ruling 2 de la ronda 1)", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const distinto = await hallazgoEn(tx, b, "por_aceptar", {
        titulo: "Planillas de horas extra sin firma",
        descripcion: "Las planillas de horas extra del mes no tienen la firma del jefe inmediato.",
      });
      const parecido = await hallazgoEn(tx, b, "por_aceptar");
      const reportar = async () => (await enviarReporte(b.consulta, { descripcion: LO_QUE_VIO, vistoEn: "2026-11-09", procesoId: b.procesoId }, c(HORA_DE_ESCENA, tx))).id;
      const sumar = (campos: Record<string, string>) => como(tx, b.admin, () => destino(sumarReporteAccion(null, formulario(campos))));

      const porCodigo = await reportar();
      expect(await sumar({ reporteId: String(porCodigo), codigo: distinto.codigo.toLowerCase() })).toBe("REDIRECT:/mejoramiento/reportes?vista=recibidos");
      expect((await tx`SELECT estado, hallazgo_id FROM mejora_reportes WHERE id = ${porCodigo}`).map((f) => [f.estado, Number(f.hallazgo_id)])).toEqual([
        ["sumado", distinto.id],
      ]);

      const porParecido = await reportar();
      expect(await sumar({ reporteId: String(porParecido), hallazgoId: String(parecido.id) })).toBe("REDIRECT:/mejoramiento/reportes?vista=recibidos");
      expect(Number((await tx`SELECT hallazgo_id FROM mejora_reportes WHERE id = ${porParecido}`)[0].hallazgo_id)).toBe(parecido.id);

      // Sin elegir nada, o con un código que no existe, nada cambia.
      const sinElegir = await reportar();
      expect(await como(tx, b.admin, () => sumarReporteAccion(null, formulario({ reporteId: String(sinElegir) })))).toMatchObject({
        ok: false,
        error: "Elija el hallazgo abierto al que lo añade",
      });
      expect(await como(tx, b.admin, () => sumarReporteAccion(null, formulario({ reporteId: String(sinElegir), codigo: "HZ-1999-999" })))).toMatchObject({
        ok: false,
        error: "El hallazgo no existe",
      });
      expect((await tx`SELECT estado FROM mejora_reportes WHERE id = ${sinElegir}`)[0].estado).toBe("recibido");
    }));

  it("descartar vuelve a «Reportes recibidos»", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const { id } = await enviarReporte(b.consulta, { descripcion: LO_QUE_VIO, vistoEn: "2026-11-09" }, c(HORA_DE_ESCENA, tx));
      const r = await como(tx, b.admin, () =>
        destino(descartarReporteAccion(null, formulario({ reporteId: String(id), motivo: "Ya está registrado en otro hallazgo" }))),
      );
      expect(r).toBe("REDIRECT:/mejoramiento/reportes?vista=recibidos");
      expect((await tx`SELECT estado FROM mejora_reportes WHERE id = ${id}`)[0].estado).toBe("descartado");
    }));
});
