/** Consulta del registro de accesos contra la BD de desarrollo. Las filas de accesos no se borran. */
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerAccesos } from "@/db/consultas/accesos";
import { registrarAcceso } from "@/db/consultas/autenticacion";

const MARCA = `zz_acc_${Date.now()}`;

describe("obtenerAccesos", () => {
  it("filtra por resultado y usuario, pagina de a 50 y ordena más reciente primero", async () => {
    for (let i = 0; i < 3; i++) await registrarAcceso({ usuarioId: null, usuarioTexto: MARCA, resultado: "fallo", ip: "10.9.9.9", userAgent: "t" });
    await registrarAcceso({ usuarioId: null, usuarioTexto: MARCA, resultado: "bloqueo", ip: null, userAgent: null });
    const r = await obtenerAccesos({ usuario: MARCA });
    expect(r.total).toBe(4);
    expect(r.filas[0].resultado).toBe("bloqueo");
    expect(r.filas[0].ip).toBeNull();
    expect(r.filas[1].ip).toBe("10.9.9.9");
    expect((await obtenerAccesos({ usuario: MARCA, resultado: "fallo" })).total).toBe(3);
    expect((await obtenerAccesos({ usuario: MARCA, pagina: 2 })).filas).toHaveLength(0);
  });

  it("trata % y _ del texto como literales y filtra por fechas", async () => {
    expect((await obtenerAccesos({ usuario: "zz_acc_%" })).total).toBe(0);
    const hoy = new Date().toISOString().slice(0, 10);
    expect((await obtenerAccesos({ usuario: MARCA, desde: "2999-01-01" })).total).toBe(0);
    expect((await obtenerAccesos({ usuario: MARCA, desde: "2000-01-01", hasta: "2999-01-01" })).total).toBe(4);
    expect(hoy).toMatch(/^\d{4}-/);
  });
});
