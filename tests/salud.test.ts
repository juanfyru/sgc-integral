/**
 * /api/salud es pública: solo dice si la app llega a la BD. El detalle va al log (M3).
 */
import { existsSync } from "node:fs";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { GET } from "@/app/api/salud/route";
import { obtenerSql } from "@/db/cliente";

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await obtenerSql().end();
  globalThis.__sql = undefined;
});

describe("/api/salud", () => {
  it("con la BD disponible responde 200 y solo { estado: 'ok' }", async () => {
    const r = await GET();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ estado: "ok" });
  });

  it("sin BD responde 503 y solo { estado: 'error' }; el mensaje del driver va al log", async () => {
    const real = obtenerSql();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    globalThis.__sql = (() => {
      throw new Error("connect ECONNREFUSED bd-secreta:5432");
    }) as unknown as typeof real;
    try {
      const r = await GET();
      expect(r.status).toBe(503);
      expect(await r.json()).toEqual({ estado: "error" });
      expect(log).toHaveBeenCalled();
      expect(log.mock.calls.flat().join(" ")).toContain("ECONNREFUSED bd-secreta:5432");
    } finally {
      globalThis.__sql = real;
    }
  });
});
