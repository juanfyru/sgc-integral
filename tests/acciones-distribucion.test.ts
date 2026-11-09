/**
 * Frontera de las acciones de la distribución: qué le llega al dominio y a dónde vuelve la persona. El dominio se
 * prueba contra la BD en copias.test.ts y hallazgos-dos-pasos.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const copias = vi.hoisted(() => ({
  anularCopia: vi.fn(),
  confirmarRecibido: vi.fn(),
  confirmarRecogida: vi.fn(),
  confirmarReemplazo: vi.fn(),
  emitirCopia: vi.fn(),
  reemplazarCopias: vi.fn(),
}));
const hallazgos = vi.hoisted(() => ({
  cerrarHallazgo: vi.fn(),
  corregirHallazgo: vi.fn(),
  reabrirHallazgo: vi.fn(),
  validarHallazgo: vi.fn(),
}));
const { redirect, requerirSesion } = vi.hoisted(() => ({
  redirect: vi.fn((destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  }),
  requerirSesion: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/sesion-actual", () => ({ requerirSesion }));
vi.mock("@/db/consultas/distribucion/copias", () => copias);
vi.mock("@/db/consultas/distribucion/hallazgos", () => hallazgos);

import {
  cerrarHallazgoAccion,
  corregirHallazgoAccion,
  reabrirHallazgoAccion,
  reemplazarCopiasAccion,
  validarHallazgoAccion,
} from "@/app/acciones-distribucion";

function formulario(campos: Record<string, string>) {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries(campos)) datos.append(campo, valor);
  return datos;
}

beforeEach(() => {
  vi.clearAllMocks();
  requerirSesion.mockResolvedValue({ usuarioId: 7, rol: "admin_sgc", verHistorial: false });
});

describe("reemplazarCopiasAccion", () => {
  it("vuelve a la ficha con el número de copias emitidas en la URL", async () => {
    copias.reemplazarCopias.mockResolvedValue({ emitidas: 2 });
    await expect(reemplazarCopiasAccion(null, formulario({ versionId: "21", volver: "/admin/documentos/GTH-PR-02" }))).rejects.toThrow(
      "REDIRECT:/admin/documentos/GTH-PR-02?aviso=reemplazadas&n=2",
    );
    expect(copias.reemplazarCopias).toHaveBeenCalledWith(expect.objectContaining({ usuarioId: 7 }), 21);
  });

  it("una dirección de vuelta que no es interna cae al inicio; una con consulta suma el aviso a ella", async () => {
    copias.reemplazarCopias.mockResolvedValue({ emitidas: 1 });
    await expect(reemplazarCopiasAccion(null, formulario({ versionId: "21", volver: "//malo.com/x" }))).rejects.toThrow(
      "REDIRECT:/?aviso=reemplazadas&n=1",
    );
    await expect(reemplazarCopiasAccion(null, formulario({ versionId: "21", volver: "/documentos/X?v=3" }))).rejects.toThrow(
      "REDIRECT:/documentos/X?v=3&aviso=reemplazadas&n=1",
    );
  });

  it("sin copias por reemplazar no navega y lo dice junto al botón", async () => {
    copias.reemplazarCopias.mockResolvedValue({ emitidas: 0 });
    expect(await reemplazarCopiasAccion(null, formulario({ versionId: "21", volver: "/documentos/X" }))).toEqual({
      ok: true,
      aviso: "No había copias por reemplazar",
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("rechaza un campo que no es del formulario", async () => {
    expect(await reemplazarCopiasAccion(null, formulario({ versionId: "21", otro: "x" }))).toMatchObject({ ok: false });
    expect(copias.reemplazarCopias).not.toHaveBeenCalled();
  });
});

describe("las acciones de un hallazgo", () => {
  const sesionDe = (rol: string) => requerirSesion.mockResolvedValue({ usuarioId: 7, rol, verHistorial: false });

  it("«Corregido» la marca quien responde por el punto con su nota, y vuelve a la verificación", async () => {
    sesionDe("consulta");
    await expect(corregirHallazgoAccion(null, formulario({ id: "5", verificacion: "9", nota: "Retiré la copia" }))).rejects.toThrow(
      "REDIRECT:/distribucion/verificaciones/9",
    );
    expect(hallazgos.corregirHallazgo).toHaveBeenCalledWith(5, expect.objectContaining({ usuarioId: 7 }), "Retiré la copia");
  });

  it("«Validar» y «Reabrir» exigen verificaciones.realizar; «Reabrir», la nota", async () => {
    sesionDe("consulta");
    expect(await validarHallazgoAccion(null, formulario({ id: "5" }))).toMatchObject({ ok: false });
    expect(await reabrirHallazgoAccion(null, formulario({ id: "5", nota: "Sigue la copia" }))).toMatchObject({ ok: false });
    expect(hallazgos.validarHallazgo).not.toHaveBeenCalled();
    expect(hallazgos.reabrirHallazgo).not.toHaveBeenCalled();

    sesionDe("admin_sgc");
    await expect(validarHallazgoAccion(null, formulario({ id: "5", verificacion: "9" }))).rejects.toThrow("REDIRECT:/distribucion/verificaciones/9");
    expect(hallazgos.validarHallazgo).toHaveBeenCalledWith(5, expect.objectContaining({ usuarioId: 7 }));
    expect(await validarHallazgoAccion(null, formulario({ id: "5", nota: "x" }))).toMatchObject({ ok: false });
    expect(await reabrirHallazgoAccion(null, formulario({ id: "5", nota: "no" }))).toMatchObject({ ok: false });
    await expect(reabrirHallazgoAccion(null, formulario({ id: "5", nota: "Sigue la copia" }))).rejects.toThrow("REDIRECT:/distribucion/verificaciones");
    expect(hallazgos.reabrirHallazgo).toHaveBeenCalledWith(5, expect.objectContaining({ usuarioId: 7 }), "Sigue la copia");
  });

  it("cerrar directamente exige distribucion.gestionar", async () => {
    sesionDe("consulta");
    expect(await cerrarHallazgoAccion(null, formulario({ id: "5", nota: "Ya se corrigió" }))).toMatchObject({ ok: false });
    expect(hallazgos.cerrarHallazgo).not.toHaveBeenCalled();
    sesionDe("admin_sgc");
    await expect(cerrarHallazgoAccion(null, formulario({ id: "5", verificacion: "9", nota: "Ya se corrigió" }))).rejects.toThrow(
      "REDIRECT:/distribucion/verificaciones/9",
    );
  });
});
