/**
 * El hallazgo de un impacto de norma por el camino de la interfaz (Fase 15B, anexo §8 y §10.3): la acción pone el origen, la norma y el
 * proceso del impacto en el envío antes de leerlo (`fijosDelEnvio`), así lo que se fuerce (un ente de control sin su fecha, otro proceso,
 * sin la norma ni la cláusula) no cuenta; la ocurrencia de un parecido se rechaza; y la edición conserva lo fijo de la fila. Con un
 * `FormData` real, contra la BD dentro de una transacción que se revierte (el cliente de la app se sustituye por ella); solo la sesión es
 * de mentira.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

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
import { editarHallazgoAccion, registrarHallazgoAccion } from "@/app/acciones-mejoramiento";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { registrarHallazgo } from "@/db/consultas/mejoramiento/registro";
import { OCURRENCIA_DESDE_UN_IMPACTO } from "@/lib/mejoramiento/enganches";
import { baseDeMejora, c, datosDeHallazgo, hallazgoEn, impactoDePrueba, otroProcesoConLider } from "./utiles/mejoramiento";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

beforeEach(() => {
  vi.clearAllMocks();
});

function formulario(campos: Record<string, string>) {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries(campos)) datos.append(campo, valor);
  return datos;
}

async function como<T>(tx: TransactionSql, quien: SesionFlujo, fn: () => Promise<T>): Promise<T> {
  enCurso.sql = tx;
  requerirSesion.mockResolvedValue(quien);
  try {
    return await fn();
  } finally {
    enCurso.sql = null;
  }
}

/** Lo que el formulario envía, con lo fijo forzado: un ente de control (pediría su fecha), otro proceso y sin requisito. */
function forzado(procesoId: number, extra: Record<string, string>) {
  const d = datosDeHallazgo(procesoId);
  return {
    clase: "no_conformidad",
    origen: "ente_control",
    criticidad: "media",
    detectadoEn: d.detectadoEn,
    procesoId: String(procesoId),
    fuente: d.fuente ?? "",
    titulo: d.titulo,
    descripcion: d.descripcion,
    requisitoClausula: "",
    requisitoNormaId: "",
    ...extra,
  };
}

describe("registrarHallazgoAccion desde un impacto de norma", () => {
  it("lo forzado en el envío no cuenta: se guarda con el origen, la norma y el proceso del impacto", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const imp = await impactoDePrueba(tx, b.admin, { procesoId: b.procesoId });
      const destino = await como(tx, b.lider, () =>
        registrarHallazgoAccion(null, formulario(forzado(otro.procesoId, { impactoId: String(imp.id), relacion: "distinto" }))),
      ).then(
        (r) => r,
        (err: Error) => err.message,
      );
      const [f] = await tx`SELECT id, origen, requisito_norma_id, proceso_id, fecha_limite_ente, estado FROM mejora_hallazgos WHERE impacto_id = ${imp.id}`;
      expect(destino).toBe(`REDIRECT:/mejoramiento/${f.id}`);
      expect(f).toMatchObject({ origen: "control_documental", fecha_limite_ente: null, estado: "por_corregir" });
      expect(Number(f.requisito_norma_id)).toBe(imp.norma.id);
      expect(Number(f.proceso_id)).toBe(b.procesoId);
    }));

  it("no añade una ocurrencia a un parecido: se rechaza y no se escribe nada", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const imp = await impactoDePrueba(tx, b.admin, { procesoId: b.procesoId });
      const parecido = await hallazgoEn(tx, b, "por_aceptar");
      const campos = forzado(b.procesoId, { impactoId: String(imp.id), relacion: `ocurrencia:${parecido.id}` });
      const rechazo = await como(tx, b.lider, () => registrarHallazgoAccion(null, formulario(campos)));
      expect(rechazo).toMatchObject({ ok: false, error: OCURRENCIA_DESDE_UN_IMPACTO });
      expect(await tx`SELECT 1 FROM mejora_ocurrencias WHERE hallazgo_id = ${parecido.id}`).toHaveLength(0);
      expect(await tx`SELECT 1 FROM mejora_hallazgos WHERE impacto_id = ${imp.id}`).toHaveLength(0);
    }));
});

describe("editarHallazgoAccion del hallazgo de un impacto de norma", () => {
  it("el origen, la norma y el proceso forzados no cuentan ni en la validación: se guardan los de la fila y lo demás que cambió", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const imp = await impactoDePrueba(tx, b.admin, { procesoId: b.procesoId });
      const { id } = await registrarHallazgo(b.admin, { ...datosDeHallazgo(b.procesoId), impactoId: imp.id }, c("2026-11-18T15:00:00Z", tx));
      const campos = forzado(otro.procesoId, { hallazgoId: String(id), titulo: "Formato sin el requisito nuevo" });
      const destino = await como(tx, b.admin, () => editarHallazgoAccion(null, formulario(campos))).then(
        (r) => r,
        (err: Error) => err.message,
      );
      expect(destino).toBe(`REDIRECT:/mejoramiento/${id}`);
      const [f] = await tx`SELECT origen, requisito_norma_id, proceso_id, titulo FROM mejora_hallazgos WHERE id = ${id}`;
      expect(f).toMatchObject({ origen: "control_documental", titulo: "Formato sin el requisito nuevo" });
      expect(Number(f.requisito_norma_id)).toBe(imp.norma.id);
      expect(Number(f.proceso_id)).toBe(b.procesoId);
    }));
});
