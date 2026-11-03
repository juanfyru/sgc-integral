import postgres from "postgres";

// Cliente único de postgres.js (el mismo driver que usará Drizzle en Fase 2).
// Inicialización perezosa: Next evalúa los módulos durante `next build`,
// donde no existe DATABASE_URL — la conexión se crea en el primer uso real.
// max: 5 — el NAS tiene 4 GB de RAM y ~20 usuarios concurrentes; no hace falta más.
// postgres.js devuelve int8 (bigint, p. ej. ids identity y count(*)) como
// string; se leen como number. Los ids están muy por debajo de 2^53.
export const TIPOS_SQL = {
  entero64: {
    to: 20,
    from: [20],
    serialize: (x: number | bigint | string) => String(x),
    parse: (x: string) => Number(x),
  },
};

declare global {
  var __sql: ReturnType<typeof postgres> | undefined;
}

export function obtenerSql() {
  if (globalThis.__sql) return globalThis.__sql;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL no está definida");
  }

  const sql = postgres(url, { max: 5, connect_timeout: 5, types: TIPOS_SQL });
  // Reutilizar la conexión entre recargas de HMR en desarrollo y entre
  // invocaciones en producción.
  globalThis.__sql = sql;
  return sql;
}
