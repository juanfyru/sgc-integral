import { existsSync } from "node:fs";
import type { Sql, TransactionSql } from "postgres";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comprobarDuplicadosUsuario, mensajeDuplicados } from "@/db/duplicados-usuario";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

describe("mensaje de duplicados de usuario", () => {
  it("el mensaje nombra los duplicados y pide renombrar", () => {
    const m = mensajeDuplicados([["admin", "Admin"]]);
    expect(m).toBe("Hay cuentas duplicadas sin distinguir mayúsculas: admin, Admin. Renombre una antes de actualizar.");
  });
  it("separa varios grupos con «; »", () => {
    expect(mensajeDuplicados([["a", "A"], ["b", "B"]])).toContain("a, A; b, B.");
  });
});

const REVERTIR = new Error("revertir");

/** Corre `prueba` dentro de una transacción que siempre se revierte: el test nunca deja filas ni quita el índice. */
async function enTransaccionRevertida(sql: Sql, prueba: (tx: TransactionSql) => Promise<void>): Promise<void> {
  try {
    await sql.begin(async (tx) => {
      await prueba(tx);
      throw REVERTIR;
    });
  } catch (e) {
    if (e !== REVERTIR) throw e;
  }
}

describe("comprobarDuplicadosUsuario contra la BD de desarrollo", () => {
  let app: Sql;
  beforeAll(() => {
    app = postgres(process.env.DATABASE_URL!, { max: 1 });
  });
  afterAll(async () => {
    await app.end();
  });

  it("sin la tabla usuarios (base nueva) no hace nada", async () => {
    let comprobado = false;
    await enTransaccionRevertida(app, async (tx) => {
      // Con un search_path vacío, to_regclass('usuarios') es NULL, como en una base sin migrar.
      await tx`SET LOCAL search_path TO zz_esquema_inexistente`;
      await expect(comprobarDuplicadosUsuario(tx)).resolves.toBeUndefined();
      comprobado = true;
    });
    expect(comprobado).toBe(true);
  });

  it("sin duplicados (la base de desarrollo tiene el índice) no lanza", async () => {
    await expect(comprobarDuplicadosUsuario(app)).resolves.toBeUndefined();
  });
});

describe.skipIf(!process.env.DATABASE_URL_MIGRADOR)("comprobarDuplicadosUsuario con duplicados (dueño del esquema)", () => {
  let dueno: Sql;
  beforeAll(() => {
    dueno = postgres(process.env.DATABASE_URL_MIGRADOR!, { max: 1, onnotice: () => {} });
  });
  afterAll(async () => {
    await dueno.end();
  });

  /** ¿El índice único por lower(usuario) se podría crear con las filas actuales? Es la verdad que la comprobación anticipa. */
  async function indiceCabe(tx: TransactionSql): Promise<boolean> {
    try {
      await tx.savepoint((sp) => sp`CREATE UNIQUE INDEX zz_prueba_lower ON usuarios (lower(usuario))`);
      return true;
    } catch (e) {
      if ((e as { code?: string }).code === "23505") return false;
      throw e;
    }
  }

  it("lanza con los grupos en orden de aparición y el mismo mensaje", async () => {
    let comprobado = false;
    await enTransaccionRevertida(dueno, async (tx) => {
      // Una base anterior a la 0003: sin el índice, las mayúsculas pasan.
      await tx`DROP INDEX usuarios_usuario_lower_unico`;
      // Uno a uno: el id sigue el orden de inserción.
      for (const nombre of ["zz_dup_b", "zz_dup_a", "ZZ_DUP_B", "Zz_Dup_A", "ZZ_DUP_A"]) {
        await tx`INSERT INTO usuarios (usuario, nombre, hash_clave) VALUES (${nombre}, 'x', 'h')`;
      }
      await expect(comprobarDuplicadosUsuario(tx)).rejects.toThrow(
        "Hay cuentas duplicadas sin distinguir mayúsculas: zz_dup_b, ZZ_DUP_B; zz_dup_a, Zz_Dup_A, ZZ_DUP_A. Renombre una antes de actualizar.",
      );
      comprobado = true;
    });
    expect(comprobado).toBe(true);
    // El índice sigue ahí: la transacción se revirtió.
    const [i] = await dueno`SELECT to_regclass('usuarios_usuario_lower_unico') AS existe`;
    expect(i.existe).not.toBeNull();
  });

  it("agrupa con el lower() de Postgres, el mismo del índice (sigma final: JS «ς», Postgres «σ»)", async () => {
    let comprobado = false;
    await enTransaccionRevertida(dueno, async (tx) => {
      await tx`DROP INDEX usuarios_usuario_lower_unico`;
      await tx`INSERT INTO usuarios (usuario, nombre, hash_clave) VALUES ('zz_ΑΣ', 'x', 'h'), ('zz_ασ', 'x', 'h')`;
      const cabe = await indiceCabe(tx);
      const lanzo = await comprobarDuplicadosUsuario(tx).then(() => false, () => true);
      // La comprobación debe rechazar exactamente cuando el índice no se podría crear.
      expect(lanzo).toBe(!cabe);
      comprobado = true;
    });
    expect(comprobado).toBe(true);
  });
});
