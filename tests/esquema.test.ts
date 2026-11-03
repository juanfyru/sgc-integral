/**
 * Verifica que las reglas de negocio ISO 7.5 estén reforzadas EN LA BASE DE
 * DATOS (no solo en código): los intentos de violarlas deben fallar.
 * Requiere la BD de desarrollo migrada y sembrada (npm run db:migrate && db:seed).
 */
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import postgres from "postgres";
import { ROLES } from "@/lib/roles";

// vitest pone NODE_ENV=test y en ese modo @next/env ignora .env.local;
// se carga con el mecanismo nativo de Node (>=20.12).
if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

let sql: Sql;

async function codigoDeError(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
    return "sin-error";
  } catch (err) {
    return (err as { code?: string }).code ?? "desconocido";
  }
}

beforeAll(() => {
  sql = postgres(process.env.DATABASE_URL!, { max: 1 });
});

afterAll(async () => {
  await sql.end();
});

describe("regla central: una sola versión vigente por documento", () => {
  it("rechaza una segunda versión vigente del mismo documento", async () => {
    const [doc] = await sql`SELECT id FROM documentos WHERE codigo = 'MN-CAL-001'`;
    const codigo = await codigoDeError(
      sql`INSERT INTO documento_versiones
            (documento_id, numero, estado, aprobo, fecha_aprobacion)
          VALUES (${doc.id}, 99, 'vigente', 'Prueba', '2026-07-15')`,
    );
    expect(codigo).toBe(UNIQUE_VIOLATION);
  });

  it("rechaza una versión vigente sin evidencia de aprobación", async () => {
    const [doc] = await sql`SELECT id FROM documentos WHERE codigo = 'FT-CAL-003'`;
    const codigo = await codigoDeError(
      sql`INSERT INTO documento_versiones (documento_id, numero, estado)
          VALUES (${doc.id}, 99, 'vigente')`,
    );
    expect(codigo).toBe(CHECK_VIOLATION);
  });

  it("rechaza un estado inexistente", async () => {
    const [doc] = await sql`SELECT id FROM documentos WHERE codigo = 'MN-CAL-001'`;
    const codigo = await codigoDeError(
      sql`INSERT INTO documento_versiones (documento_id, numero, estado)
          VALUES (${doc.id}, 99, 'archivado')`,
    );
    expect(codigo).toBe(CHECK_VIOLATION);
  });
});

describe("asociaciones documento ↔ mapa (M:N con principal única)", () => {
  it("rechaza una segunda asociación principal para el mismo documento", async () => {
    const [doc] = await sql`SELECT id FROM documentos WHERE codigo = 'FT-CAL-001'`;
    const [proceso] = await sql`SELECT id FROM procesos WHERE sigla = 'GJU'`;
    const codigo = await codigoDeError(
      sql`INSERT INTO documento_proceso (documento_id, proceso_id, es_principal)
          VALUES (${doc.id}, ${proceso.id}, true)`,
    );
    expect(codigo).toBe(UNIQUE_VIOLATION);
  });

  it("rechaza asociar a proceso y subproceso a la vez", async () => {
    const [doc] = await sql`SELECT id FROM documentos WHERE codigo = 'FT-CAL-001'`;
    const [proceso] = await sql`SELECT id FROM procesos WHERE sigla = 'GJU'`;
    const [sub] = await sql`SELECT id FROM subprocesos LIMIT 1`;
    const codigo = await codigoDeError(
      sql`INSERT INTO documento_proceso (documento_id, proceso_id, subproceso_id)
          VALUES (${doc.id}, ${proceso.id}, ${sub.id})`,
    );
    expect(codigo).toBe(CHECK_VIOLATION);
  });

  it("rechaza duplicar la misma asociación (NULLS NOT DISTINCT)", async () => {
    const [doc] = await sql`SELECT id FROM documentos WHERE codigo = 'FT-CAL-001'`;
    const [proceso] = await sql`SELECT id FROM procesos WHERE sigla = 'GES'`;
    const codigo = await codigoDeError(
      sql`INSERT INTO documento_proceso (documento_id, proceso_id, es_principal)
          VALUES (${doc.id}, ${proceso.id}, false)`,
    );
    expect(codigo).toBe(UNIQUE_VIOLATION);
  });

  it("rechaza que un documento se relacione consigo mismo", async () => {
    const [doc] = await sql`SELECT id FROM documentos WHERE codigo = 'PR-CAL-001'`;
    const codigo = await codigoDeError(
      sql`INSERT INTO documento_relaciones (documento_id, relacionado_id)
          VALUES (${doc.id}, ${doc.id})`,
    );
    expect(codigo).toBe(CHECK_VIOLATION);
  });
});

describe("archivos", () => {
  it("rechaza un segundo archivo principal en la misma versión", async () => {
    const [archivo] = await sql`
      SELECT version_id FROM archivos WHERE rol = 'principal' LIMIT 1`;
    const codigo = await codigoDeError(
      sql`INSERT INTO archivos
            (version_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
          VALUES (${archivo.version_id}, 'principal', 'x/duplicado.pdf', 'dup.pdf',
                  'pdf', 'application/pdf', 1000, 'abc')`,
    );
    expect(codigo).toBe(UNIQUE_VIOLATION);
  });
});

describe("búsqueda en español (FTS + trigramas + unaccent)", () => {
  it("encuentra 'Vacunación' buscando 'vacunacion' (sin tilde)", async () => {
    const filas = await sql`
      SELECT codigo FROM documentos
      WHERE tsv @@ websearch_to_tsquery('espanol_unaccent', 'vacunacion')
      ORDER BY codigo`;
    const codigos = filas.map((f) => f.codigo);
    expect(codigos).toContain("PR-PYM-001");
    expect(codigos).toContain("FT-PYM-001");
  });

  it("encuentra por raíz en español: 'documentos' encuentra 'documento'", async () => {
    const filas = await sql`
      SELECT codigo FROM documentos
      WHERE tsv @@ websearch_to_tsquery('espanol_unaccent', 'control de documentos')`;
    expect(filas.map((f) => f.codigo)).toContain("PR-CAL-001");
  });

  it("código parcial 'GTH' trae todo talento humano", async () => {
    const filas = await sql`
      SELECT codigo FROM documentos WHERE codigo ILIKE '%GTH%' ORDER BY codigo`;
    expect(filas.map((f) => f.codigo)).toEqual([
      "CA-GTH-001",
      "FT-GTH-001",
      "PR-GTH-001",
      "PR-GTH-002",
    ]);
  });

  it("tolera errores de tipeo: 'consulta esterna' encuentra Consulta Externa", async () => {
    const filas = await sql`
      SELECT nombre FROM procesos
      WHERE unaccent(lower(nombre)) % unaccent(lower('consulta esterna'))`;
    expect(filas.map((f) => f.nombre)).toContain("Consulta Externa");
  });
});

describe("estados del seed (datos de demostración)", () => {
  it("cubre los cuatro estados", async () => {
    const filas = await sql`
      SELECT estado, count(*)::int AS cantidad
      FROM documento_versiones GROUP BY estado ORDER BY estado`;
    const porEstado = Object.fromEntries(filas.map((f) => [f.estado, f.cantidad]));
    expect(porEstado["vigente"]).toBe(26);
    expect(porEstado["obsoleto"]).toBe(1);
    expect(porEstado["borrador"]).toBe(1);
    expect(porEstado["anulado"]).toBe(1);
  });

  it("CA-GTH-001 retiene su versión obsoleta junto a la vigente", async () => {
    const filas = await sql`
      SELECT v.numero, v.estado
      FROM documento_versiones v
      JOIN documentos d ON d.id = v.documento_id
      WHERE d.codigo = 'CA-GTH-001' ORDER BY v.numero`;
    expect(filas).toEqual([
      { numero: 1, estado: "obsoleto" },
      { numero: 2, estado: "vigente" },
    ]);
  });
});

describe("Fase 11: roles, estructura y accesos en BD", () => {
  it("rechaza un rol fuera de la lista", async () => {
    const codigo = await codigoDeError(
      sql`INSERT INTO usuarios (usuario, nombre, hash_clave, rol) VALUES ('zz_rol', 'x', 'h', 'root')`,
    );
    expect(codigo).toBe(CHECK_VIOLATION);
  });
  it("el rol por defecto es consulta y cargo_id admite nulo", async () => {
    const [u] = await sql`INSERT INTO usuarios (usuario, nombre, hash_clave) VALUES ('zz_defecto', 'x', 'h') RETURNING rol, cargo_id, debe_cambiar_clave, ver_historial`;
    expect(u).toMatchObject({ rol: "consulta", cargo_id: null, debe_cambiar_clave: false, ver_historial: false });
    await sql`DELETE FROM usuarios WHERE usuario = 'zz_defecto'`;
  });
  it("correo es único sin distinguir mayúsculas", async () => {
    await sql`INSERT INTO usuarios (usuario, nombre, hash_clave, correo) VALUES ('zz_c1', 'x', 'h', 'Persona@Hospital.gov.co')`;
    const codigo = await codigoDeError(
      sql`INSERT INTO usuarios (usuario, nombre, hash_clave, correo) VALUES ('zz_c2', 'x', 'h', 'persona@hospital.gov.co')`,
    );
    expect(codigo).toBe(UNIQUE_VIOLATION);
    await sql`DELETE FROM usuarios WHERE usuario IN ('zz_c1', 'zz_c2')`;
  });
  it("el CHECK de roles en BD coincide con ROLES (como conjunto)", async () => {
    const [{ def }] = await sql`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'usuarios_rol_valido'`;
    const enBd = [...String(def).matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect(enBd).toEqual([...ROLES].sort());
  });
  it("accesos rechaza un resultado desconocido", async () => {
    const codigo = await codigoDeError(
      sql`INSERT INTO accesos (usuario_texto, resultado) VALUES ('x', 'otro')`,
    );
    expect(codigo).toBe(CHECK_VIOLATION);
  });
  it("auditoria y accesos son de solo inserción incluso para el dueño", async () => {
    const [a] = await sql`INSERT INTO accesos (usuario_texto, resultado) VALUES ('zz_inmutable', 'fallo') RETURNING id`;
    expect(await codigoDeError(sql`UPDATE accesos SET resultado = 'ingreso' WHERE id = ${a.id}`)).toBe("42501");
    expect(await codigoDeError(sql`DELETE FROM accesos WHERE id = ${a.id}`)).toBe("42501");
    const [b] = await sql`INSERT INTO auditoria (usuario_id, accion, entidad) VALUES (NULL, 'zz_inmutable', 'prueba') RETURNING id`;
    expect(await codigoDeError(sql`DELETE FROM auditoria WHERE id = ${b.id}`)).toBe("42501");
  });
  it("un usuario con historial no se puede borrar (RESTRICT)", async () => {
    const nombre = `zz_hist_${Date.now()}`;
    const [u] = await sql`INSERT INTO usuarios (usuario, nombre, hash_clave) VALUES (${nombre}, 'x', 'h') RETURNING id`;
    await sql`INSERT INTO accesos (usuario_id, usuario_texto, resultado) VALUES (${u.id}, ${nombre}, 'ingreso')`;
    expect(await codigoDeError(sql`DELETE FROM usuarios WHERE id = ${u.id}`)).toBe("23503");
  });
});
