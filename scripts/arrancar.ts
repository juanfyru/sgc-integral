/**
 * Arranque del contenedor (Fase 10, F10-D2): espera la BD, aplica las
 * migraciones y asegura el admin; solo entonces el CMD sigue con el server.
 * Si algo falla, sale ≠0: el server NO arranca y la restart policy reintenta.
 * En dev se puede correr con: npx tsx scripts/arrancar.ts
 */
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { configurarAdminDesdeEnv, esperarConReintentos } from "@/lib/arranque";

async function principal() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[arranque] Falta DATABASE_URL en el entorno");
    process.exit(1);
  }

  // max: 1 — recomendación de Drizzle para la conexión de migraciones.
  const sql = postgres(url, { max: 1, connect_timeout: 5 });

  console.log("[arranque] Esperando la base de datos…");
  const intento = await esperarConReintentos(
    async () => {
      await sql`SELECT 1`;
    },
    { intentos: 30, esperaMs: 2000 },
  );
  console.log(`[arranque] Base de datos lista (intento ${intento})`);

  console.log("[arranque] Aplicando migraciones…");
  await migrate(drizzle(sql), {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });
  console.log("[arranque] Migraciones al día");

  const decision = configurarAdminDesdeEnv({
    ADMIN_USUARIO: process.env.ADMIN_USUARIO,
    ADMIN_NOMBRE: process.env.ADMIN_NOMBRE,
    ADMIN_CLAVE: process.env.ADMIN_CLAVE,
    ADMIN_FORZAR_CLAVE: process.env.ADMIN_FORZAR_CLAVE,
  });
  if (decision.accion === "asegurar") {
    // Import dinámico: arrastra el cliente global y @node-rs/argon2 solo
    // cuando de verdad hay bootstrap que hacer.
    const { asegurarAdmin } = await import("@/db/consultas/admin");
    const { obtenerSql } = await import("@/db/cliente");
    const { usuario, nombre, clave, forzarClave } = decision.config;
    const resultado = await asegurarAdmin(usuario, nombre, clave, forzarClave);
    console.log(`[arranque] Admin '${usuario}': ${resultado}`);
    await obtenerSql().end();
  } else {
    console.warn(`[arranque] Bootstrap del admin omitido: ${decision.motivo}`);
  }

  await sql.end();
  console.log("[arranque] Listo: el servidor puede arrancar");
}

principal().catch((error) => {
  console.error("[arranque] FALLO:", error);
  process.exit(1);
});
