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
  it.each(["firmas", "tramite_eventos", "copia_eventos", "acuse_eventos", "ratificaciones", "externo_verificaciones", "norma_cambios", "medicion_eventos", "medicion_observaciones"])("no puede modificar ni borrar %s", async (tabla) => {
    expect(await codigoDeError(app`UPDATE ${app(tabla)} SET creado_en = creado_en WHERE id = -1`)).toBe("42501");
    expect(await codigoDeError(app`DELETE FROM ${app(tabla)} WHERE id = -1`)).toBe("42501");
  });
  // Un cierre del mes tampoco (ola final, M1): su columna de tiempo es `cerrado_en`. Sin filas, el 42501 es del privilegio.
  it("no puede modificar ni borrar cierres_indicadores", async () => {
    expect(await codigoDeError(app`UPDATE cierres_indicadores SET cerrado_en = cerrado_en WHERE id = -1`)).toBe("42501");
    expect(await codigoDeError(app`DELETE FROM cierres_indicadores WHERE id = -1`)).toBe("42501");
  });
  it("sí puede insertar, leer y borrar en tablas operativas", async () => {
    const [u] = await app`INSERT INTO usuarios (usuario, nombre, hash_clave) VALUES (${'zz_priv_u_' + Date.now()}, 'x', 'h') RETURNING id`;
    expect(u.id).toBeGreaterThan(0);
    await app`DELETE FROM usuarios WHERE id = ${u.id}`;
  });
  it("el trigger frena también al dueño del esquema", async () => {
    expect(await codigoDeError(dueno`DELETE FROM accesos WHERE usuario_texto = 'zz_priv'`)).toBe("42501");
    // Las filas no existen: el trigger de fila no se dispara, así que se prueba con una real.
    await dueno.begin(async (tx) => {
      const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
      const [p] = await tx`SELECT id FROM procesos ORDER BY id LIMIT 1`;
      const [t] = await tx`INSERT INTO tramites (numero, anio, consecutivo, tipo, motivo, justificacion, solicitante_id, proceso_id, etapa)
        VALUES ('SOL-9998-1', 9998, 1, 'crear', 'mejora', 'prueba', ${u.id}, ${p.id}, 'cancelado') RETURNING id`;
      await tx`INSERT INTO tramite_eventos (tramite_id, tipo, ronda) VALUES (${t.id}, 'prueba', 0)`;
      await tx`SAVEPOINT a`;
      expect(await codigoDeError(tx`UPDATE tramite_eventos SET tipo = 'x'`)).toBe("42501");
      await tx`ROLLBACK TO SAVEPOINT a`;
      expect(await codigoDeError(tx`DELETE FROM tramite_eventos`)).toBe("42501");
      await tx`ROLLBACK TO SAVEPOINT a`;
      await tx`INSERT INTO firmas (tramite_id, usuario_id, firma, ronda, hash_sha256, nombre_firmante, metodo)
        VALUES (${t.id}, ${u.id}, 'elaboro', 0, 'x', 'n', 'clave')`;
      await tx`SAVEPOINT b`;
      expect(await codigoDeError(tx`UPDATE firmas SET ronda = 1`)).toBe("42501");
      await tx`ROLLBACK TO SAVEPOINT b`;
      expect(await codigoDeError(tx`DELETE FROM firmas`)).toBe("42501");
      await tx`ROLLBACK TO SAVEPOINT b`;
      const [pu] = await tx`INSERT INTO puntos_uso (nombre, responsable_id) VALUES (${"zz_priv_pu_" + Date.now()}, ${u.id}) RETURNING id`;
      const [v] = await tx`SELECT id FROM documento_versiones ORDER BY id LIMIT 1`;
      const [c] = await tx`INSERT INTO copias_controladas (version_id, numero, punto_uso_id, responsable_id, responsable_nombre, emitida_por, hash_principal, emitida_en)
        VALUES (${v.id}, 99999, ${pu.id}, ${u.id}, 'n', ${u.id}, 'x', now()) RETURNING id`;
      await tx`INSERT INTO copia_eventos (copia_id, tipo) VALUES (${c.id}, 'emitida')`;
      await tx`SAVEPOINT c`;
      expect(await codigoDeError(tx`UPDATE copia_eventos SET tipo = 'x'`)).toBe("42501");
      await tx`ROLLBACK TO SAVEPOINT c`;
      expect(await codigoDeError(tx`DELETE FROM copia_eventos`)).toBe("42501");
      await tx`ROLLBACK TO SAVEPOINT c`;
      throw new Error("revertir");
    }).catch((e: Error) => {
      if (e.message !== "revertir") throw e;
    });
  });
});
