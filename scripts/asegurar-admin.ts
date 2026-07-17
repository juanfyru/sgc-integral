/**
 * Bootstrap/reseteo del usuario admin.
 * Uso: npm run admin:asegurar [-- --forzar-clave]
 * Lee ADMIN_USUARIO, ADMIN_NOMBRE y ADMIN_CLAVE del entorno.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function principal() {
  const { asegurarAdmin } = await import("@/db/consultas/admin");
  const { obtenerSql } = await import("@/db/cliente");

  const usuario = process.env.ADMIN_USUARIO;
  const nombre = process.env.ADMIN_NOMBRE ?? "Administrador";
  const clave = process.env.ADMIN_CLAVE;
  if (!usuario || !clave) {
    console.error("Faltan ADMIN_USUARIO y/o ADMIN_CLAVE en el entorno.");
    process.exit(1);
  }
  const forzar = process.argv.includes("--forzar-clave");
  const resultado = await asegurarAdmin(usuario, nombre, clave, forzar);
  console.log(`Admin '${usuario}': ${resultado}`);
  await obtenerSql().end();
}

principal().catch((err) => {
  console.error(err);
  process.exit(1);
});
