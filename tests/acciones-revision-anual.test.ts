/**
 * La frontera de la revisión anual (spec 13C §9): los esquemas de cada formulario y las acciones, que pasan por
 * `mutacion` con su permiso y le entregan al dominio lo leído. Lo que el dominio hace se prueba contra la BD en
 * revision-anual.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const dominio = vi.hoisted(() => ({
  abrirRevision: vi.fn(async () => ({ revisionId: 4 })),
  prorrogarRevision: vi.fn(async () => {}),
  cerrarRevision: vi.fn(async () => ({ sinRevisar: 0 })),
  enlazarTramiteExistente: vi.fn(async () => {}),
  confirmarNormograma: vi.fn(async () => {}),
}));
const actos = vi.hoisted(() => ({
  registrarVerificacion: vi.fn(async () => ({})),
  ratificar: vi.fn(async () => ({ codigo: "GTH-PR-01" })),
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
vi.mock("@/lib/contexto-peticion", () => ({ contextoDePeticion: async () => ({ ip: "10.0.0.1", userAgent: "prueba" }) }));
vi.mock("@/db/consultas/vigencia/externos", async (original) => ({
  ...(await original<typeof import("@/db/consultas/vigencia/externos")>()),
  registrarVerificacion: actos.registrarVerificacion,
}));
vi.mock("@/db/consultas/vigencia/ratificaciones", async (original) => ({
  ...(await original<typeof import("@/db/consultas/vigencia/ratificaciones")>()),
  ratificar: actos.ratificar,
}));
vi.mock("@/db/consultas/vigencia/revision-anual", async (original) => ({
  ...(await original<typeof import("@/db/consultas/vigencia/revision-anual")>()),
  ...dominio,
}));

import {
  abrirRevisionAccion,
  cerrarRevisionAccion,
  confirmarNormogramaAccion,
  enlazarTramiteAccion,
  prorrogarRevisionAccion,
  ratificarAccion,
  verificarExternoAccion,
} from "@/app/acciones-vigencia";
import {
  EsquemaAbrirRevision,
  EsquemaCerrarRevision,
  EsquemaConfirmarNormograma,
  EsquemaEnlazarTramite,
  EsquemaProrrogar,
} from "@/lib/esquemas/vigencia";
import { parsearFormulario } from "@/lib/validacion";

function formulario(campos: Record<string, string>) {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries(campos)) datos.append(campo, valor);
  return datos;
}

const admin = { usuarioId: 7, rol: "admin_sgc", verHistorial: false };
const lider = { usuarioId: 8, rol: "lider_proceso", verHistorial: false };

beforeEach(() => {
  vi.clearAllMocks();
  requerirSesion.mockResolvedValue(admin);
});

describe("los esquemas", () => {
  it("abrir: año, plazo y ventana enteros", () => {
    expect(parsearFormulario(formulario({ anio: "2026", plazoDias: "60", ventanaMeses: "6" }), EsquemaAbrirRevision)).toEqual({
      anio: 2026,
      plazoDias: 60,
      ventanaMeses: 6,
    });
    expect(() => parsearFormulario(formulario({ anio: "2026", plazoDias: "3", ventanaMeses: "6" }), EsquemaAbrirRevision)).toThrow(
      "El plazo debe estar entre 7 y 365 días",
    );
    expect(() => parsearFormulario(formulario({ anio: "2026", plazoDias: "60", ventanaMeses: "6", otro: "x" }), EsquemaAbrirRevision)).toThrow();
  });

  it("prorrogar exige días de 1 a 365 y un motivo de al menos 5 caracteres", () => {
    expect(parsearFormulario(formulario({ revisionId: "4", dias: "15", motivo: "Auditoría externa" }), EsquemaProrrogar)).toEqual({
      revisionId: 4,
      dias: 15,
      motivo: "Auditoría externa",
    });
    expect(() => parsearFormulario(formulario({ revisionId: "4", dias: "0", motivo: "Auditoría externa" }), EsquemaProrrogar)).toThrow(
      "La prórroga debe ser de 1 a 365 días",
    );
    expect(() => parsearFormulario(formulario({ revisionId: "4", dias: "15", motivo: "No" }), EsquemaProrrogar)).toThrow(
      "El motivo debe tener al menos 5 caracteres",
    );
  });

  it("enlazar, normograma y cierre", () => {
    expect(parsearFormulario(formulario({ revisionId: "4", documentoId: "9", tramiteId: "12" }), EsquemaEnlazarTramite)).toEqual({
      revisionId: 4,
      documentoId: 9,
      tramiteId: 12,
    });
    expect(parsearFormulario(formulario({ revisionId: "4", procesoId: "3", resultado: "sin_novedad" }), EsquemaConfirmarNormograma)).toEqual({
      revisionId: 4,
      procesoId: 3,
      resultado: "sin_novedad",
      nota: null,
    });
    expect(() => parsearFormulario(formulario({ revisionId: "4", procesoId: "3", resultado: "otro" }), EsquemaConfirmarNormograma)).toThrow();
    expect(parsearFormulario(formulario({ revisionId: "4", clave: " con espacios " }), EsquemaCerrarRevision)).toEqual({
      revisionId: 4,
      clave: " con espacios ",
    });
  });
});

describe("las acciones", () => {
  it("abrir, prorrogar y cerrar vuelven a la campaña; cerrar firma con el contexto de la petición y no devuelve la clave", async () => {
    await expect(abrirRevisionAccion(null, formulario({ anio: "2026", plazoDias: "60", ventanaMeses: "6" }))).rejects.toThrow(
      "REDIRECT:/vigencia/revision-anual",
    );
    expect(dominio.abrirRevision).toHaveBeenCalledWith(expect.objectContaining({ usuarioId: 7 }), { anio: 2026, plazoDias: 60, ventanaMeses: 6 });

    await expect(prorrogarRevisionAccion(null, formulario({ revisionId: "4", dias: "15", motivo: "Auditoría externa" }))).rejects.toThrow(
      "REDIRECT:/vigencia/revision-anual",
    );
    expect(dominio.prorrogarRevision).toHaveBeenCalledWith(expect.objectContaining({ usuarioId: 7 }), { revisionId: 4, dias: 15, motivo: "Auditoría externa" });

    await expect(cerrarRevisionAccion(null, formulario({ revisionId: "4", clave: "secreta", codigo: "123456" }))).rejects.toThrow(
      "REDIRECT:/vigencia/revision-anual/4",
    );
    expect(dominio.cerrarRevision).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: 7 }),
      { revisionId: 4, credenciales: { clave: "secreta", codigo: "123456" } },
      { contexto: { ip: "10.0.0.1", userAgent: "prueba" } },
    );
    dominio.cerrarRevision.mockRejectedValueOnce(new Error("Clave o código incorrectos"));
    const fallo = await cerrarRevisionAccion(null, formulario({ revisionId: "4", clave: "secreta" }));
    expect(fallo).toMatchObject({ ok: false, error: "Clave o código incorrectos" });
    expect(JSON.stringify(fallo)).not.toContain("secreta");
  });

  it("enlazar y confirmar el normograma son de quien decide; abrir no", async () => {
    requerirSesion.mockResolvedValue(lider);
    await expect(enlazarTramiteAccion(null, formulario({ revisionId: "4", documentoId: "9", tramiteId: "12" }))).rejects.toThrow(
      "REDIRECT:/vigencia/revision-anual",
    );
    expect(dominio.enlazarTramiteExistente).toHaveBeenCalledWith(expect.objectContaining({ usuarioId: 8 }), { revisionId: 4, documentoId: 9, tramiteId: 12 });
    await expect(
      confirmarNormogramaAccion(null, formulario({ revisionId: "4", procesoId: "3", resultado: "cambios", nota: "Falta la Resolución 3100" })),
    ).rejects.toThrow("REDIRECT:/vigencia/revision-anual?proceso=3");
    expect(dominio.confirmarNormograma).toHaveBeenCalledWith(expect.objectContaining({ usuarioId: 8 }), {
      revisionId: 4,
      procesoId: 3,
      resultado: "cambios",
      nota: "Falta la Resolución 3100",
    });
    expect(await abrirRevisionAccion(null, formulario({ anio: "2026", plazoDias: "60", ventanaMeses: "6" }))).toEqual({
      ok: false,
      error: "Sin permiso para esta acción",
    });
    expect(dominio.abrirRevision).not.toHaveBeenCalled();
  });
});

describe("decidir desde la tabla de la revisión anual vuelve a ella", () => {
  const verificacion = { documentoId: "8", resultado: "vigente", fuente: "https://www.minsalud.gov.co/guias" };

  it("verificar un externo con `volver` regresa a la tabla; sin él, o con una ruta que no es interna, a la página del externo", async () => {
    requerirSesion.mockResolvedValue(lider);
    await expect(verificarExternoAccion(null, formulario({ ...verificacion, volver: "/vigencia/revision-anual?proceso=3" }))).rejects.toThrow(
      "REDIRECT:/vigencia/revision-anual?proceso=3",
    );
    expect(actos.registrarVerificacion).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: 8 }),
      { documentoId: 8, resultado: "vigente", fuente: "https://www.minsalud.gov.co/guias", nota: null },
    );
    await expect(verificarExternoAccion(null, formulario(verificacion))).rejects.toThrow("REDIRECT:/vigencia/externos/8");
    await expect(verificarExternoAccion(null, formulario({ ...verificacion, volver: "//otro.sitio/x" }))).rejects.toThrow("REDIRECT:/vigencia/externos/8");
  });

  it("ratificar con `volver` regresa a la tabla; sin él, a la ficha del documento", async () => {
    requerirSesion.mockResolvedValue(lider);
    const firma = { documentoId: "5", clave: "secreta" };
    await expect(ratificarAccion(null, formulario({ ...firma, volver: "/vigencia/revision-anual" }))).rejects.toThrow("REDIRECT:/vigencia/revision-anual");
    expect(actos.ratificar).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: 8 }),
      { documentoId: 5, nota: null, credenciales: { clave: "secreta", codigo: undefined } },
      expect.anything(),
    );
    await expect(ratificarAccion(null, formulario(firma))).rejects.toThrow("REDIRECT:/documentos/gth-pr-01");
  });
});
