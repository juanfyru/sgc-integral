/**
 * Privilegios del rol sgc_app contra la BD de desarrollo (preparada con
 * `npm run db:preparar`). Se omite si no hay conexión del migrador.
 */
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import postgres from "postgres";
import { TIPOS_SQL } from "@/db/cliente";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

async function codigoDeError(promesa: PromiseLike<unknown>): Promise<string> {
  try {
    await promesa;
    return "sin-error";
  } catch (err) {
    return (err as { code?: string }).code ?? "desconocido";
  }
}

describe.skipIf(!process.env.DATABASE_URL_MIGRADOR)("rol sgc_app", () => {
  let app: Sql;
  let dueno: Sql;

  beforeAll(() => {
    app = postgres(process.env.DATABASE_URL!, { max: 1, types: TIPOS_SQL });
    dueno = postgres(process.env.DATABASE_URL_MIGRADOR!, { max: 1, types: TIPOS_SQL });
  });
  afterAll(async () => {
    await app.end();
    await dueno.end();
  });

  it("la conexión de la app corre como sgc_app", async () => {
    const [r] = await app`SELECT current_user`;
    expect(r.current_user).toBe("sgc_app");
  });
  it("no puede crear tablas", async () => {
    expect(await codigoDeError(app`CREATE TABLE zz_prohibida (id int)`)).toBe("42501");
  });
  it("no puede modificar ni borrar auditoria ni accesos", async () => {
    const [a] = await app`INSERT INTO accesos (usuario_texto, resultado) VALUES ('zz_priv', 'fallo') RETURNING id`;
    expect(await codigoDeError(app`UPDATE accesos SET resultado = 'ingreso' WHERE id = ${a.id}`)).toBe("42501");
    expect(await codigoDeError(app`DELETE FROM accesos WHERE id = ${a.id}`)).toBe("42501");
    expect(await codigoDeError(app`DELETE FROM auditoria WHERE id = -1`)).toBe("42501");
  });
  it("sí puede insertar, leer y borrar en tablas operativas", async () => {
    const [u] = await app`INSERT INTO usuarios (usuario, nombre, hash_clave) VALUES (${'zz_priv_u_' + Date.now()}, 'x', 'h') RETURNING id`;
    expect(u.id).toBeGreaterThan(0);
    await app`DELETE FROM usuarios WHERE id = ${u.id}`;
  });
  it("el trigger frena también al dueño del esquema", async () => {
    expect(await codigoDeError(dueno`DELETE FROM accesos WHERE usuario_texto = 'zz_priv'`)).toBe("42501");
  });
});
