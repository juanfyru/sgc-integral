import type { Sql } from "postgres";

/** Nombre fijo del rol de la app; jamás viene de entrada de usuario. */
export const NOMBRE_ROL_APP = "sgc_app";

/**
 * Crea o sincroniza el rol sgc_app y le aplica los privilegios de mínimo
 * privilegio (F11 §3). Idempotente; se ejecuta con la conexión del migrador
 * DESPUÉS de las migraciones (las tablas deben existir). Los privilegios por
 * defecto quedan ligados al migrador, que es quien crea las tablas futuras.
 * La clave viaja por set_config: el DDL no admite parámetros y no se
 * concatena en el texto SQL.
 */
export async function asegurarRolApp(
  sql: Sql,
  clave: string,
): Promise<"creado" | "actualizado"> {
  return sql.begin(async (tx) => {
    const [{ existe }] = await tx<{ existe: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${NOMBRE_ROL_APP}) AS existe`;
    await tx`SELECT set_config('sgc.clave_app', ${clave}, true)`;
    await tx.unsafe(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${NOMBRE_ROL_APP}') THEN
          EXECUTE format('ALTER ROLE ${NOMBRE_ROL_APP} WITH LOGIN PASSWORD %L', current_setting('sgc.clave_app'));
        ELSE
          EXECUTE format('CREATE ROLE ${NOMBRE_ROL_APP} LOGIN PASSWORD %L', current_setting('sgc.clave_app'));
        END IF;
      END
      $$`);
    const r = NOMBRE_ROL_APP;
    await tx.unsafe(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
    await tx.unsafe(`GRANT USAGE ON SCHEMA public TO ${r}`);
    await tx.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${r}`);
    await tx.unsafe(`REVOKE UPDATE, DELETE ON auditoria, accesos FROM ${r}`);
    await tx.unsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${r}`);
    await tx.unsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${r}`);
    await tx.unsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${r}`);
    return existe ? "actualizado" : "creado";
  });
}
