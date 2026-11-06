/**
 * Frontera de las acciones del panel sobre documentos: qué le llega al dominio y qué recibe el
 * formulario. El dominio se prueba contra la BD en camino-directo.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const dominio = vi.hoisted(() => ({
  crearDocumento: vi.fn(),
  crearVersionBorrador: vi.fn(),
  deshacerCarga: vi.fn(),
  descartarBorrador: vi.fn(),
  editarCatalogo: vi.fn(),
  editarControl: vi.fn(),
  editarVersionBorrador: vi.fn(),
  publicarVersion: vi.fn(),
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
vi.mock("@/db/consultas/admin", () => dominio);

import {
  crearVersionAccion,
  descartarBorradorAccion,
  deshacerCargaAccion,
  editarCatalogoAccion,
  publicarAccion,
} from "@/app/admin/acciones";

function formulario(campos: Record<string, string>) {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries(campos)) datos.append(campo, valor);
  return datos;
}

beforeEach(() => {
  vi.clearAllMocks();
  requerirSesion.mockResolvedValue({ usuarioId: 7, rol: "admin_sgc" });
});

describe("las acciones que solo llevan el id de la versión", () => {
  it.each([
    ["publicarAccion", publicarAccion, dominio.publicarVersion],
    ["descartarBorradorAccion", descartarBorradorAccion, dominio.descartarBorrador],
  ])("%s lee el id y rechaza cualquier otro campo", async (_nombre, accion, consulta) => {
    expect(await accion(null, formulario({ versionId: "21" }))).toBeNull();
    expect(consulta).toHaveBeenCalledWith(21, 7);
    consulta.mockClear();
    expect(await accion(null, formulario({ versionId: "21", estado: "vigente" }))).toMatchObject({ ok: false });
    expect(await accion(null, formulario({ versionId: "cero" }))).toEqual(expect.objectContaining({ error: "Falta versionId" }));
    expect(consulta).not.toHaveBeenCalled();
  });
});

describe("las acciones con datos y el id del documento", () => {
  it("crearVersionAccion pasa el número con el que entra", async () => {
    await crearVersionAccion(null, formulario({ documentoId: "5", numero: "3" }));
    expect(dominio.crearVersionBorrador).toHaveBeenCalledWith(5, 7, 3);
  });

  it("deshacerCargaAccion pasa el motivo limpio y exige que lo haya", async () => {
    await deshacerCargaAccion(null, formulario({ documentoId: "5", motivo: "  Archivo equivocado.  " }));
    expect(dominio.deshacerCarga).toHaveBeenCalledWith(5, "Archivo equivocado.", 7);
    dominio.deshacerCarga.mockClear();
    expect(await deshacerCargaAccion(null, formulario({ documentoId: "5" }))).toMatchObject({ ok: false });
    expect(dominio.deshacerCarga).not.toHaveBeenCalled();
  });

  it("editarCatalogoAccion vuelve al detalle del documento", async () => {
    const datos = formulario({ documentoId: "5", codigo: "GTH-PR-01", nivelAcceso: "general", principal: "p:7" });
    await expect(editarCatalogoAccion(null, datos)).rejects.toThrow("REDIRECT:/admin/documentos/GTH-PR-01");
    expect(dominio.editarCatalogo).toHaveBeenCalledWith(
      5,
      { descripcion: null, palabrasClave: null, nivelAcceso: "general", relacionados: [], asociaciones: [{ procesoId: 7, esPrincipal: true }] },
      7,
    );
  });
});
