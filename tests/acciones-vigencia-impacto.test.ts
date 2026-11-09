/**
 * La frontera de «Verificar el externo» pedida desde un impacto normativo (resolución 3 de la Tarea 9): el formulario
 * envía `impactoId` y la acción se lo pasa a `registrarVerificacion`, que resuelve el impacto en su transacción (la
 * resolución misma se prueba contra la BD en normas-impactos.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const registrarVerificacion = vi.hoisted(() => vi.fn());
const { redirect, requerirSesion } = vi.hoisted(() => ({
  redirect: vi.fn((destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  }),
  requerirSesion: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/sesion-actual", () => ({ requerirSesion }));
vi.mock("@/db/consultas/vigencia/externos", async (original) => ({
  ...(await original<typeof import("@/db/consultas/vigencia/externos")>()),
  registrarVerificacion,
}));

import { verificarExternoAccion } from "@/app/acciones-vigencia";
import { EsquemaVerificacion } from "@/lib/esquemas/vigencia";
import { parsearFormulario } from "@/lib/validacion";

function formulario(campos: Record<string, string>) {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries(campos)) datos.append(campo, valor);
  return datos;
}

const base = { documentoId: "8", resultado: "vigente", fuente: "https://www.minsalud.gov.co/normatividad" };

beforeEach(() => {
  vi.clearAllMocks();
  requerirSesion.mockResolvedValue({ usuarioId: 7, rol: "consulta" });
});

describe("EsquemaVerificacion", () => {
  it("admite el impacto que la verificación resuelve, opcional, y rechaza uno que no es un id", () => {
    expect(parsearFormulario(formulario({ ...base, impactoId: "15" }), EsquemaVerificacion)).toMatchObject({ documentoId: 8, impactoId: 15 });
    expect(parsearFormulario(formulario(base), EsquemaVerificacion).impactoId).toBeUndefined();
    expect(() => parsearFormulario(formulario({ ...base, impactoId: "quince" }), EsquemaVerificacion)).toThrow();
  });
});

describe("verificarExternoAccion", () => {
  it("pasa el impacto a registrarVerificacion y vuelve a la página del externo", async () => {
    await expect(verificarExternoAccion(null, formulario({ ...base, impactoId: "15" }))).rejects.toThrow("REDIRECT:/vigencia/externos/8");
    expect(registrarVerificacion).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: 7 }),
      { documentoId: 8, resultado: "vigente", fuente: "https://www.minsalud.gov.co/normatividad", nota: null, impactoId: 15 },
    );
  });

  it("sin impacto, la verificación de siempre", async () => {
    await expect(verificarExternoAccion(null, formulario(base))).rejects.toThrow("REDIRECT:/vigencia/externos/8");
    expect(registrarVerificacion.mock.calls[0][1]).not.toHaveProperty("impactoId", expect.anything());
  });
});
