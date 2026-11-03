/**
 * Crea/sincroniza el rol sgc_app con la conexión del migrador (tras migrar).
 * Uso: npm run db:roles
 */
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { decidirConexiones } from "../src/lib/arranque";
import { TIPOS_SQL } from "../src/db/cliente";
import { asegurarRolApp } from "../src/db/roles-bd";

loadEnvConfig(process.cwd());

async function principal() {
  const cx = decidirConexiones({
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_MIGRADOR: process.env.DATABASE_URL_MIGRADOR,
    BD_APP_CLAVE: process.env.BD_APP_CLAVE,
  });
  if (!cx.claveApp) {
    console.error("Falta BD_APP_CLAVE: no se puede asegurar el rol sgc_app");
    process.exit(1);
  }
  const sql = postgres(cx.migrador, { max: 1, types: TIPOS_SQL });
  try {
    console.log(`Rol sgc_app: ${await asegurarRolApp(sql, cx.claveApp)}`);
  } catch (error) {
    // Solo message y code: no volcar el objeto del error (cuidado con la clave).
    const e = error as { message?: string; code?: string };
    console.error(`FALLO al asegurar el rol sgc_app: ${e.message} (${e.code ?? "sin código"})`);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

principal().catch((error) => {
  console.error("FALLO:", error);
  process.exit(1);
});
