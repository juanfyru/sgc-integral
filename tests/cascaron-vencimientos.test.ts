/** La revisión de vencimientos corre después de enviar la respuesta: no compite con el render por el pool. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { after, disparar } = vi.hoisted(() => ({ after: vi.fn(), disparar: vi.fn() }));

vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after }));
vi.mock("@/lib/vencimientos-disparo", () => ({ dispararRevisionDeVencimientos: disparar }));
vi.mock("@/db/consultas/entidad", () => ({ obtenerMarcaSegura: async () => ({ nombre: "Entidad", sigla: "E", logo: null }) }));
vi.mock("@/db/consultas/notificaciones", () => ({ contarNoLeidas: async () => 0, listarRecientes: async () => [] }));
vi.mock("@/db/consultas/tramites", () => ({ participaEnTramites: async () => false }));
vi.mock("@/db/consultas/distribucion/puntos-uso", () => ({ esResponsableDePuntos: async () => false }));
vi.mock("@/lib/tareas", () => ({ misTareas: async () => ({ tareas: [], total: 0 }) }));
vi.mock("@/db/consultas/vigencia/externos", () => ({ esResponsableTecnico: async () => false }));
vi.mock("@/db/consultas/vigencia/semaforo", () => ({ vencidosDeVigencia: async () => 0 }));

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
});
