import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  anularAccion,
  crearDocumentoAccion,
  crearVersionAccion,
  editarDocumentoAccion,
  editarVersionAccion,
  publicarAccion,
  salir,
} from "@/app/admin/acciones";
import {
  alternarAccion,
  borrarAccion,
  crearTipoAccion,
  editarTipoAccion,
  guardarTextosAccion,
  moverAccion,
} from "@/app/admin/acciones-mapa";
import { DELETE as eliminarArchivo, GET as verArchivo } from "@/app/admin/api/archivos/[archivoId]/route";
import { POST as subirArchivo } from "@/app/admin/api/archivos/route";
import { proxy } from "@/proxy";

describe("proxy (guard optimista)", () => {
  it("sin cookie redirige /admin a /admin/ingreso", () => {
    const res = proxy(new NextRequest("http://localhost:3000/admin"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/admin/ingreso");
  });

  it("sin cookie /admin/api responde 401, no redirect", () => {
    const res = proxy(
      new NextRequest("http://localhost:3000/admin/api/archivos", { method: "POST" }),
    );
    expect(res.status).toBe(401);
  });

  it("deja pasar /admin/ingreso sin cookie", () => {
    const res = proxy(new NextRequest("http://localhost:3000/admin/ingreso"));
    expect(res.status).toBe(200);
  });

  it("con cookie deja pasar (la validación real es del layout/actions)", () => {
    const req = new NextRequest("http://localhost:3000/admin", {
      headers: { cookie: "sgc_sesion=lo-que-sea" },
    });
    expect(proxy(req).status).toBe(200);
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
    ["salir", () => salir()],
  ];
  for (const [nombre, invocar] of casos) {
    it(`${nombre} rechaza sin sesión`, async () => {
      await expect(invocar()).rejects.toThrow();
    });
  }
});
