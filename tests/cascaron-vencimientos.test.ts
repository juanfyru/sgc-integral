/**
 * La revisión de vencimientos corre después de enviar la respuesta: no compite con el render por el pool. Y lo que el
 * cascarón calcula de la vigencia es decorativo: si falla, se registra y la página sigue.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { after, disparar, esResponsableTecnico, misTareas } = vi.hoisted(() => ({
  after: vi.fn(),
  disparar: vi.fn(),
  esResponsableTecnico: vi.fn(async () => false),
  misTareas: vi.fn(async () => ({ tareas: [], total: 0, vencidos: 0 })),
}));

vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock("@/lib/vencimientos-disparo", () => ({ dispararRevisionDeVencimientos: disparar }));
vi.mock("@/db/consultas/entidad", () => ({ obtenerMarcaSegura: async () => ({ nombre: "Entidad", sigla: "E", logo: null }) }));
vi.mock("@/db/consultas/notificaciones", () => ({ contarNoLeidas: async () => 0, listarRecientes: async () => [] }));
vi.mock("@/db/consultas/tramites", () => ({ participaEnTramites: async () => false }));
vi.mock("@/db/consultas/distribucion/puntos-uso", () => ({ esResponsableDePuntos: async () => false }));
vi.mock("@/lib/tareas", () => ({ misTareas }));
// El cascarón pregunta por `tareasDePeticion` (`@/lib/tareas-peticion`, real), que usa la pregunta por petición.
vi.mock("@/db/consultas/vigencia/externos", () => ({ esResponsableTecnicoDePeticion: esResponsableTecnico }));

import { Cascaron } from "@/componentes/cascaron/Cascaron";
import type { SesionValida } from "@/lib/sesion";

const sesion = { usuarioId: 1, nombre: "Prueba", rol: "consulta", tema: "sistema", verHistorial: false } as unknown as SesionValida;

describe("el cascarón y los vencimientos", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deja la revisión para después de la respuesta: durante el render no la lanza", async () => {
    await Cascaron({ sesion, children: null });
    expect(after).toHaveBeenCalledOnce();
    expect(disparar).not.toHaveBeenCalled();

    after.mock.calls[0][0]();
    expect(disparar).toHaveBeenCalledOnce();
  });

  it("si no se puede saber si es responsable técnico, lo registra y sigue: sin la entrada «Vigencia» ni su insignia", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      esResponsableTecnico.mockRejectedValueOnce(new Error("sin conexión"));
      const html = renderToStaticMarkup(await Cascaron({ sesion, children: null }));
      expect(error).toHaveBeenCalledWith(expect.stringContaining("responsable técnico"), expect.any(Error));
      expect(html).not.toContain('href="/vigencia"');
      expect(misTareas).toHaveBeenCalledWith(sesion, { responsableTecnico: false });
    } finally {
      error.mockRestore();
    }
  });

  it("la insignia de «Vigencia» sale del conteo de misTareas", async () => {
    esResponsableTecnico.mockResolvedValueOnce(true);
    misTareas.mockResolvedValueOnce({ tareas: [], total: 0, vencidos: 3 });
    const html = renderToStaticMarkup(await Cascaron({ sesion, children: null }));
    expect(html).toMatch(/href="\/vigencia"[^]*data-vencidos="3"/);
  });
});
