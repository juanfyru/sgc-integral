import { createHash, randomBytes } from "node:crypto";
import { obtenerSql } from "@/db/cliente";
import type { Rol } from "@/lib/roles";
import type { Tema } from "@/lib/tema";

export { COOKIE_SESION } from "@/lib/sesion-constantes";

export const VIGENCIA_SESION_MS = 12 * 60 * 60 * 1000;
const UMBRAL_RENOVACION_MS = 6 * 60 * 60 * 1000;
const UMBRAL_ULTIMO_USO_MS = 60 * 1000;

export type SesionValida = {
  sesionId: string; // SHA-256 del token (PK de sesiones)
  usuarioId: number;
  usuario: string;
  nombre: string;
  rol: Rol;
  verHistorial: boolean;
  totpActivo: boolean;
  factorPendiente: boolean;
  debeCambiarClave: boolean;
  aceptoDatos: boolean;
  tema: Tema;
};

export type ContextoSesion = {
  ip: string | null;
  userAgent: string | null;
  factorPendiente?: boolean;
};

export type SesionActiva = {
  sesionId: string;
  usuarioId: number;
  usuario: string;
  nombre: string;
  rol: Rol;
  ip: string | null;
  userAgent: string | null;
  creadaEn: string;
  ultimoUsoEn: string;
  expiraEn: string;
  factorPendiente: boolean;
};

/** Inactividad máxima (SESION_INACTIVIDAD_MIN, por defecto 60 min) en ms. */
export function inactividadMs(env: NodeJS.ProcessEnv = process.env): number {
  const minutos = Number(env.SESION_INACTIVIDAD_MIN);
  return (Number.isFinite(minutos) && minutos > 0 ? minutos : 60) * 60_000;
}

// En BD solo vive el SHA-256 del token: si la BD se filtra, los tokens no sirven.
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function crearSesion(
  usuarioId: number,
  contexto: ContextoSesion,
): Promise<{ token: string; expiraEn: Date }> {
  const sql = obtenerSql();
  const token = randomBytes(32).toString("base64url");
  const expiraEn = new Date(Date.now() + VIGENCIA_SESION_MS);
  await sql`INSERT INTO sesiones (id, usuario_id, expira_en, ip, user_agent, factor_pendiente)
    VALUES (${hashToken(token)}, ${usuarioId}, ${expiraEn}, ${contexto.ip},
      ${contexto.userAgent}, ${contexto.factorPendiente ?? false})`;
  return { token, expiraEn };
}

export async function validarSesion(
  token: string | null | undefined,
  opciones: { ahora?: Date; inactividadMs?: number } = {},
): Promise<SesionValida | null> {
  if (!token) return null;
  const sql = obtenerSql();
  const ahora = opciones.ahora ?? new Date();
  const limiteInactividad = new Date(
    ahora.getTime() - (opciones.inactividadMs ?? inactividadMs()),
  );

  // Limpieza oportunista: la tabla es pequeña — el DELETE es barato.
  await sql`DELETE FROM sesiones WHERE expira_en < ${ahora}`;

  const [fila] = await sql`
    SELECT s.id, s.expira_en, s.ultimo_uso_en, s.factor_pendiente,
      u.id AS usuario_id, u.usuario, u.nombre, u.rol, u.ver_historial,
      u.totp_activo, u.debe_cambiar_clave, (u.acepto_datos_en IS NOT NULL) AS acepto_datos,
      u.tema
    FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.id = ${hashToken(token)} AND s.expira_en > ${ahora}
      AND s.ultimo_uso_en >= ${limiteInactividad} AND u.activo`;
  if (!fila) return null;

  const restanteMs = new Date(fila.expira_en).getTime() - ahora.getTime();
  const sinUsoMs = ahora.getTime() - new Date(fila.ultimo_uso_en).getTime();
  const renovar = restanteMs < UMBRAL_RENOVACION_MS;
  if (renovar || sinUsoMs > UMBRAL_ULTIMO_USO_MS) {
    const nueva = renovar ? new Date(ahora.getTime() + VIGENCIA_SESION_MS) : fila.expira_en;
    await sql`UPDATE sesiones SET expira_en = ${nueva}, ultimo_uso_en = ${ahora}
      WHERE id = ${fila.id}`;
  }

  return {
    sesionId: fila.id,
    usuarioId: Number(fila.usuario_id),
    usuario: fila.usuario,
    nombre: fila.nombre,
    rol: fila.rol,
    verHistorial: fila.ver_historial,
    totpActivo: fila.totp_activo,
    factorPendiente: fila.factor_pendiente,
    debeCambiarClave: fila.debe_cambiar_clave,
    aceptoDatos: fila.acepto_datos,
    tema: fila.tema,
  };
}

export async function confirmarSegundoFactor(sesionId: string): Promise<void> {
  await obtenerSql()`UPDATE sesiones SET factor_pendiente = false WHERE id = ${sesionId}`;
}

export async function cerrarSesion(token: string): Promise<void> {
  const sql = obtenerSql();
  await sql`DELETE FROM sesiones WHERE id = ${hashToken(token)}`;
}

export async function cerrarSesionPorId(
  sesionId: string,
): Promise<{ usuarioId: number } | null> {
  const [fila] = await obtenerSql()`DELETE FROM sesiones WHERE id = ${sesionId}
    RETURNING usuario_id`;
  return fila ? { usuarioId: Number(fila.usuario_id) } : null;
}

/** Cierra todas las sesiones del usuario salvo `conservarSesionId`; devuelve cuántas. */
export async function cerrarSesionesDeUsuario(
  usuarioId: number,
  conservarSesionId?: string,
): Promise<number> {
  const sql = obtenerSql();
  const filas = conservarSesionId
    ? await sql`DELETE FROM sesiones WHERE usuario_id = ${usuarioId}
        AND id <> ${conservarSesionId} RETURNING id`
    : await sql`DELETE FROM sesiones WHERE usuario_id = ${usuarioId} RETURNING id`;
  return filas.length;
}

export async function listarSesionesActivas(): Promise<SesionActiva[]> {
  const ahora = new Date();
  const limite = new Date(ahora.getTime() - inactividadMs());
  const filas = await obtenerSql()`
    SELECT s.id, host(s.ip) AS ip, s.user_agent, s.creado_en, s.ultimo_uso_en,
      s.expira_en, s.factor_pendiente, u.id AS usuario_id, u.usuario, u.nombre, u.rol
    FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.expira_en > ${ahora} AND s.ultimo_uso_en >= ${limite} AND u.activo
    ORDER BY s.ultimo_uso_en DESC`;
  return filas.map((f) => ({
    sesionId: f.id,
    usuarioId: Number(f.usuario_id),
    usuario: f.usuario,
    nombre: f.nombre,
    rol: f.rol,
    ip: f.ip,
    userAgent: f.user_agent,
    creadaEn: new Date(f.creado_en).toISOString(),
    ultimoUsoEn: new Date(f.ultimo_uso_en).toISOString(),
    expiraEn: new Date(f.expira_en).toISOString(),
    factorPendiente: f.factor_pendiente,
  }));
}
