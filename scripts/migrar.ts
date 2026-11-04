/**
 * Aplica las migraciones con la conexión del migrador, tras comprobar que no
 * hay usuarios duplicados sin distinguir mayúsculas (índice único de la 0003).
 * Uso: npm run db:migrate
 */
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { TIPOS_SQL } from "../src/db/cliente";
import { comprobarDuplicadosUsuario } from "../src/db/duplicados-usuario";

loadEnvConfig(process.cwd());

async function principal() {
  const url = process.env.DATABASE_URL_MIGRADOR ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("[migrar] Falta DATABASE_URL_MIGRADOR o DATABASE_URL");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1, types: TIPOS_SQL });
  try {
    try {
      await comprobarDuplicadosUsuario(sql);
    } catch (error) {
      console.error(`[migrar] ${(error as Error).message}`);
      process.exit(1);
    }
    await migrate(drizzle(sql), { migrationsFolder: path.join(process.cwd(), "drizzle") });
    console.log("[migrar] Migraciones al día");
  } finally {
    await sql.end();
  }
}

principal().catch((error) => {
  console.error("[migrar] FALLO:", error);
  process.exit(1);
});
