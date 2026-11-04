/**
 * CLI de semillas.
 *   npm run db:seed          → demo (mapa real, documentos, estructura y usuarios de ejemplo)
 *   npm run db:seed:minima   → mínima (instalación nueva: tipos y configuración)
 * Ambas BORRAN todo antes de sembrar.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { sql: dsql } = await import("drizzle-orm");
  const postgres = (await import("postgres")).default;
  const { TIPOS_SQL } = await import("./cliente");
  const { sembrarMinima } = await import("./semillas/minima");
  const { sembrarDemo } = await import("./semillas/demo");

  const cliente = postgres(
    (process.env.DATABASE_URL_MIGRADOR ?? process.env.DATABASE_URL)!,
    { max: 1, types: TIPOS_SQL },
  );
  const db = drizzle(cliente);

  try {
    if (process.argv.includes("--minima")) await sembrarMinima(db);
    else await sembrarDemo(db);

    const resumen = await db.execute(dsql`
      SELECT
        (SELECT count(*) FROM macroprocesos) AS macroprocesos,
        (SELECT count(*) FROM procesos) AS procesos,
        (SELECT count(*) FROM subprocesos) AS subprocesos,
        (SELECT count(*) FROM elementos_perifericos) AS elementos,
        (SELECT count(*) FROM tipos_documento) AS tipos,
        (SELECT count(*) FROM documentos) AS documentos,
        (SELECT count(*) FROM documento_versiones) AS versiones,
        (SELECT count(*) FROM archivos) AS archivos,
        (SELECT count(*) FROM documento_proceso) AS asociaciones,
        (SELECT count(*) FROM documento_relaciones) AS relaciones,
        (SELECT count(*) FROM areas) AS areas,
        (SELECT count(*) FROM cargos) AS cargos,
        (SELECT count(*) FROM usuarios) AS usuarios,
        (SELECT count(*) FROM configuracion) AS configuracion
    `);
    console.log("Semilla completada:", resumen[0]);
  } finally {
    await cliente.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
