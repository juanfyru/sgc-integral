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
    "/documentos/pr-cal-001",
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
