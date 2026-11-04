import { existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { ZONA_HORARIA_DEFECTO, zonaHoraria } from "@/lib/zona-horaria";

const original = process.env.ZONA_HORARIA;
afterEach(() => {
  if (original === undefined) delete process.env.ZONA_HORARIA;
  else process.env.ZONA_HORARIA = original;
});

describe("zonaHoraria", () => {
  it("ausente o vacía usa el defecto", () => {
    delete process.env.ZONA_HORARIA;
    expect(zonaHoraria()).toBe(ZONA_HORARIA_DEFECTO);
    process.env.ZONA_HORARIA = "  ";
    expect(zonaHoraria()).toBe("America/Bogota");
  });
  it("acepta una zona válida", () => {
    process.env.ZONA_HORARIA = "America/Lima";
    expect(zonaHoraria()).toBe("America/Lima");
  });
  it("una zona inválida lanza un error que nombra la variable y el valor", () => {
    process.env.ZONA_HORARIA = "Marte/Olimpo";
    expect(() => zonaHoraria()).toThrow(/ZONA_HORARIA.*Marte\/Olimpo/);
  });
});

describe("zona horaria de la sesión de BD", () => {
  it("la conexión de la app abre con TimeZone igual a zonaHoraria()", async () => {
    delete process.env.ZONA_HORARIA;
    const sql = obtenerSql();
    const [fila] = await sql`SELECT current_setting('TimeZone') AS zona`;
    expect(fila.zona).toBe(zonaHoraria());
    await sql.end();
    globalThis.__sql = undefined;
  });
});
