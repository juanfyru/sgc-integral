/**
 * Cuando una acción se lleva el control que tenía el foco, este pasa al título de la página, y quitar
 * un archivo sale bien también sin red. Sin DOM en Vitest: lo visual se comprueba en navegador.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { pedirQuitar } from "@/componentes/admin/EliminarArchivo";
import { enfocarTitulo } from "@/componentes/ui/foco";

afterEach(() => vi.unstubAllGlobals());

describe("enfocarTitulo", () => {
  const conFoco = (activo: "body" | "control" | null) => {
    const focus = vi.fn();
    const body = {};
    const querySelector = vi.fn(() => ({ focus }));
    vi.stubGlobal("document", { body, activeElement: activo === "body" ? body : activo === "control" ? {} : null, querySelector });
    return { focus, querySelector };
  };

  it.each(["body", null] as const)("con el foco en %s, lo recibe el título enfocable", (activo) => {
    const { focus, querySelector } = conFoco(activo);
    enfocarTitulo();
    expect(querySelector).toHaveBeenCalledWith('h1[tabindex="-1"]');
    expect(focus).toHaveBeenCalledOnce();
  });

  it("si el foco ya está en otro control, no se lo quita", () => {
    const { focus } = conFoco("control");
    enfocarTitulo();
    expect(focus).not.toHaveBeenCalled();
  });
});

describe("los controles que desaparecen", () => {
  it.each([
    ["src/componentes/tramites/DialogoFirma.tsx", "useTituloAlDesaparecer(abierto)"],
    ["src/componentes/tramites/AccionesSolicitud.tsx", "useTituloAlDesaparecer(abierto)"],
    ["src/componentes/admin/EliminarArchivo.tsx", "useTituloAlDesaparecer(quitado)"],
  ])("%s entrega el foco", (ruta, llamada) => {
    expect(readFileSync(ruta, "utf8")).toContain(llamada);
  });

  it("la página del panel que usa «Quitar» tiene un título que puede recibirlo", () => {
    expect(readFileSync("src/app/(app)/admin/(panel)/documentos/[codigo]/page.tsx", "utf8")).toContain("tituloEnfocable");
  });
});

describe("pedirQuitar", () => {
  const con = (respuesta: () => Promise<Response>) => vi.stubGlobal("fetch", vi.fn(respuesta));
  const NO_SE_PUDO = "No se pudo quitar el archivo. Intente de nuevo.";

  it("borrado: null, con DELETE a la dirección", async () => {
    con(async () => new Response(null, { status: 204 }));
    expect(await pedirQuitar("/api/x")).toBeNull();
    expect(fetch).toHaveBeenCalledWith("/api/x", { method: "DELETE" });
  });

  it("el mensaje del servidor llega a la persona", async () => {
    con(async () => Response.json({ error: "Este trámite cambió" }, { status: 409 }));
    expect(await pedirQuitar("/api/x")).toBe("Este trámite cambió");
  });

  it("sin mensaje en la respuesta, uno propio", async () => {
    con(async () => Response.json({}, { status: 500 }));
    expect(await pedirQuitar("/api/x")).toBe(NO_SE_PUDO);
  });

  it("sin red no lanza: el botón no se queda cargando", async () => {
    con(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await pedirQuitar("/api/x")).toBe(NO_SE_PUDO);
  });

  it("una respuesta que no es JSON tampoco lanza", async () => {
    con(async () => new Response("<html>Bad Gateway</html>", { status: 502 }));
    expect(await pedirQuitar("/api/x")).toBe(NO_SE_PUDO);
  });
});
