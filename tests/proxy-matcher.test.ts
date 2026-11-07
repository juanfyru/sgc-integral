import { AsyncLocalStorage } from "node:async_hooks";
import { describe, expect, it } from "vitest";

// Fuera de Next, el helper de pruebas necesita AsyncLocalStorage global.
(globalThis as Record<string, unknown>).AsyncLocalStorage ??= AsyncLocalStorage;

const { unstable_doesMiddlewareMatch: coincide } = await import("next/experimental/testing/server");
const { config } = await import("@/proxy");

const pasa = (url: string) => coincide({ config, nextConfig: {}, url });

describe("matcher del proxy (comportamiento real de Next)", () => {
  it.each([
    "/",
    "/admin",
    "/documentos/sgc-pr-01",
    "/procesos/apoyo-diagnostico",
    "/procesos/apoyo-terapeutico",
    "/procesos/atencion-inmediata/transporte-asistencial-basico",
    "/procesos/internacion/hospitalizacion-adulto-y-pediatrico",
    "/procesos/gestion-de-bienes-y-servicios/apoyo-logistico",
  ])("%s pasa por el proxy", (url) => expect(pasa(url)).toBe(true));

  it.each(["/_next/static/a.js", "/favicon.ico", "/logo.svg", "/fuente.woff2"])(
    "%s queda fuera del proxy",
    (url) => expect(pasa(url)).toBe(false),
  );
});

describe("rutas que reciben el cuerpo de una subida", () => {
  // Con proxy, Next copia el cuerpo y pasados 10 MB entrega solo esa parte, sin error.
  it.each([
    "/admin/api/archivos",
    "/admin/api/archivos?version=4&rol=principal",
    "/api/tramites/5/archivos",
    "/api/tramites/5/archivos?rol=principal",
  ])("%s queda fuera del proxy", (url) => expect(pasa(url)).toBe(false));

  it.each([
    "/admin/api/archivos/5",
    "/admin/api/acta-ejemplo",
    "/api/tramites/5/archivos/7",
    "/api/tramites/5",
    "/api/tramites/abc/archivos",
    "/tramites/5",
    "/tramites/5/archivos/7/borrador.pdf",
    "/api/buscar",
    "/distribucion/copias/5/pdf",
    "/distribucion/copias/5/reimprimir",
  ])("%s sigue pasando por el proxy", (url) => expect(pasa(url)).toBe(true));
});

describe("logo público", () => {
  it("/marca/logo pasa por el proxy y es ruta pública", async () => {
    const { RUTAS_PUBLICAS, proxy } = await import("@/proxy");
    const { NextRequest } = await import("next/server");
    expect(RUTAS_PUBLICAS).toContain("/marca/logo");
    expect(pasa("/marca/logo")).toBe(true);
    const r = proxy(new NextRequest("http://localhost:3002/marca/logo"));
    expect(r.headers.get("location")).toBeNull();
    expect(r.status).toBe(200);
  });
});
