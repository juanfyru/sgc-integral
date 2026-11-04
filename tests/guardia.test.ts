import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  anularAccion,
  crearDocumentoAccion,
  crearVersionAccion,
  editarDocumentoAccion,
  editarVersionAccion,
  publicarAccion,
} from "@/app/admin/acciones";
import { aceptarAvisoAccion, claveInicialAccion, salir, verificarFactor } from "@/app/acciones-cuenta";
import {
  alternarAccion,
  borrarAccion,
  crearMacroprocesoAccion,
  crearPerifericoAccion,
  crearProcesoAccion,
  crearSubprocesoAccion,
  crearTipoAccion,
  editarMacroprocesoAccion,
  editarPerifericoAccion,
  editarProcesoAccion,
  editarSubprocesoAccion,
  editarTipoAccion,
  guardarTextosAccion,
  moverAccion,
} from "@/app/admin/acciones-mapa";
import { DELETE as eliminarArchivo, GET as verArchivo } from "@/app/admin/api/archivos/[archivoId]/route";
import { POST as subirArchivo } from "@/app/admin/api/archivos/route";
import { GET as excelMaestro } from "@/app/admin/(panel)/maestro/excel/route";
import { GET as archivoPortal } from "@/app/(portal)/documentos/[codigo]/archivos/[archivoId]/[[...nombre]]/route";
import { RUTAS_PUBLICAS, config, proxy } from "@/proxy";

describe("proxy (guard optimista global)", () => {
  it.each(["/", "/procesos/calidad", "/documentos/pr-cal-001", "/buscar?q=acta", "/admin", "/cuenta"])(
    "sin cookie %s redirige a /ingreso", (ruta) => {
      const res = proxy(new NextRequest("http://localhost:3002" + ruta));
      expect(res.status).toBe(307);
      const destino = new URL(res.headers.get("location")!);
      expect(destino.pathname).toBe("/ingreso");
      expect(destino.searchParams.get("volver")).toBe(ruta === "/" ? null : ruta);
    });
  it.each(["/api/lo-que-sea", "/admin/api/archivos"])("sin cookie %s responde 401 JSON", (ruta) => {
    expect(proxy(new NextRequest("http://localhost:3002" + ruta, { method: "POST" })).status).toBe(401);
  });
  it.each(RUTAS_PUBLICAS)("deja pasar %s sin cookie", (ruta) => {
    expect(proxy(new NextRequest("http://localhost:3002" + ruta)).status).toBe(200);
  });
  it("/admin/ingreso redirige a /ingreso", () => {
    expect(proxy(new NextRequest("http://localhost:3002/admin/ingreso")).headers.get("location")).toContain("/ingreso");
  });
  it("con cookie deja pasar (la validación real es de layouts y acciones)", () => {
    const req = new NextRequest("http://localhost:3002/procesos/x", { headers: { cookie: "sgc_sesion=algo" } });
    expect(proxy(req).status).toBe(200);
  });
  it("el matcher es constante y excluye estáticos", () => {
    expect(config.matcher).toHaveLength(1);
    expect(config.matcher[0]).toContain("_next/static");
  });
});

describe("handlers de archivos sin sesión", () => {
  const params = { params: Promise.resolve({ archivoId: "1" }) };

  it("POST sin cookie responde 401", async () => {
    const res = await subirArchivo(
      new NextRequest("http://localhost:3000/admin/api/archivos?version=1&rol=principal", {
        method: "POST",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("GET sin cookie responde 401", async () => {
    const res = await verArchivo(
      new NextRequest("http://localhost:3000/admin/api/archivos/1"), params,
    );
    expect(res.status).toBe(401);
  });

  it("DELETE sin cookie responde 401", async () => {
    const res = await eliminarArchivo(
      new NextRequest("http://localhost:3000/admin/api/archivos/1", { method: "DELETE" }),
      params,
    );
    expect(res.status).toBe(401);
  });
});

describe("archivos del portal sin sesión", () => {
  it("el GET de archivos del portal sin cookie responde 401", async () => {
    const res = await archivoPortal(
      new NextRequest("http://localhost:3002/documentos/mn-cal-001/archivos/1"),
      { params: Promise.resolve({ codigo: "mn-cal-001", archivoId: "1" }) },
    );
    expect(res.status).toBe(401);
  });
});

describe("export del maestro sin sesión", () => {
  it("GET /admin/maestro/excel sin cookie responde 401", async () => {
    const res = await excelMaestro(
      new NextRequest("http://localhost:3000/admin/maestro/excel"),
    );
    expect(res.status).toBe(401);
  });
});

describe("actions de mutación sin sesión", () => {
  // Fuera de un request de Next, cookies() lanza y requerirSesion propaga:
  // ninguna mutación es alcanzable sin sesión (regla ISO 4).
  const fd = new FormData();
  const casos: Array<[string, () => Promise<unknown>]> = [
    ["crearDocumentoAccion", () => crearDocumentoAccion(null, fd)],
    ["editarDocumentoAccion", () => editarDocumentoAccion(null, fd)],
    ["crearVersionAccion", () => crearVersionAccion(null, fd)],
    ["editarVersionAccion", () => editarVersionAccion(null, fd)],
    ["publicarAccion", () => publicarAccion(null, fd)],
    ["anularAccion", () => anularAccion(null, fd)],
    ["crearTipoAccion", () => crearTipoAccion(null, fd)],
    ["editarTipoAccion", () => editarTipoAccion(null, fd)],
    ["moverAccion", () => moverAccion(fd)],
    ["alternarAccion", () => alternarAccion(fd)],
    ["borrarAccion", () => borrarAccion(fd)],
    ["guardarTextosAccion", () => guardarTextosAccion(null, fd)],
    ["crearPerifericoAccion", () => crearPerifericoAccion(null, fd)],
    ["editarPerifericoAccion", () => editarPerifericoAccion(null, fd)],
    ["crearMacroprocesoAccion", () => crearMacroprocesoAccion(null, fd)],
    ["editarMacroprocesoAccion", () => editarMacroprocesoAccion(null, fd)],
    ["crearProcesoAccion", () => crearProcesoAccion(null, fd)],
    ["editarProcesoAccion", () => editarProcesoAccion(null, fd)],
    ["crearSubprocesoAccion", () => crearSubprocesoAccion(null, fd)],
    ["editarSubprocesoAccion", () => editarSubprocesoAccion(null, fd)],
    ["salir", () => salir()],
    ["claveInicialAccion", () => claveInicialAccion(null, fd)],
    ["aceptarAvisoAccion", () => aceptarAvisoAccion(null, fd)],
    ["verificarFactor", () => verificarFactor(null, fd)],
  ];
  for (const [nombre, invocar] of casos) {
    it(`${nombre} rechaza sin sesión`, async () => {
      await expect(invocar()).rejects.toThrow();
    });
  }
});
