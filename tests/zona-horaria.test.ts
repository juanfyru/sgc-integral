import { existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { fechaCompactaLocal, fechaHoraLarga, fechaHoraLocal, ZONA_HORARIA_DEFECTO, zonaHoraria } from "@/lib/zona-horaria";

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

describe("fechas que ve el usuario, en la zona de la instalación (M1)", () => {
  const instante = new Date("2026-11-04T02:30:00Z"); // 21:30 del día 3 en Bogotá

  it("fechaHoraLocal y fechaCompactaLocal usan zonaHoraria(), no UTC", () => {
    delete process.env.ZONA_HORARIA;
    expect(fechaHoraLocal(instante)).toBe("2026-11-03 21:30");
    expect(fechaCompactaLocal(instante)).toBe("20261103");
    process.env.ZONA_HORARIA = "Asia/Tokyo";
    expect(fechaHoraLocal(instante)).toBe("2026-11-04 11:30");
    expect(fechaCompactaLocal(instante)).toBe("20261104");
  });

  it("la medianoche sale como 00, no 24", () => {
    process.env.ZONA_HORARIA = "UTC";
    expect(fechaHoraLocal(new Date("2026-01-05T00:05:00Z"))).toBe("2026-01-05 00:05");
    expect(fechaHoraLarga(new Date("2026-01-05T00:05:00Z"))).toBe("5 de enero de 2026, 00:05");
  });

  it("fechaHoraLarga escribe el día en palabras, con la hora", () => {
    delete process.env.ZONA_HORARIA;
    expect(fechaHoraLarga(instante)).toBe("3 de noviembre de 2026, 21:30");
    process.env.ZONA_HORARIA = "Asia/Tokyo";
    expect(fechaHoraLarga(instante)).toBe("4 de noviembre de 2026, 11:30");
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
