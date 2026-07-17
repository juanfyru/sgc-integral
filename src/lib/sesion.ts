import { createHash, randomBytes } from "node:crypto";
import { obtenerSql } from "@/db/cliente";

export { COOKIE_SESION } from "@/lib/sesion-constantes";

export const VIGENCIA_SESION_MS = 12 * 60 * 60 * 1000;
const UMBRAL_RENOVACION_MS = 6 * 60 * 60 * 1000;

export type SesionValida = {
  usuarioId: number;
  usuario: string;
  nombre: string;
};

// En BD solo vive el SHA-256 del token: si la BD se filtra, los tokens no sirven.
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function crearSesion(
  usuarioId: number,
): Promise<{ token: string; expiraEn: Date }> {
  const sql = obtenerSql();
  const token = randomBytes(32).toString("base64url");
  const expiraEn = new Date(Date.now() + VIGENCIA_SESION_MS);
  await sql`INSERT INTO sesiones (id, usuario_id, expira_en)
    VALUES (${hashToken(token)}, ${usuarioId}, ${expiraEn})`;
  return { token, expiraEn };
}

export async function validarSesion(
  token: string | null | undefined,
): Promise<SesionValida | null> {
  if (!token) return null;
  const sql = obtenerSql();

  // Limpieza oportunista: un admin, tabla diminuta — el DELETE es gratis.
  await sql`DELETE FROM sesiones WHERE expira_en < now()`;

  const [fila] = await sql`
    SELECT s.id, s.expira_en, u.id AS usuario_id, u.usuario, u.nombre
    FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.id = ${hashToken(token)} AND s.expira_en > now() AND u.activo`;
  if (!fila) return null;

  const restanteMs = new Date(fila.expira_en).getTime() - Date.now();
  if (restanteMs < UMBRAL_RENOVACION_MS) {
    const nueva = new Date(Date.now() + VIGENCIA_SESION_MS);
    await sql`UPDATE sesiones SET expira_en = ${nueva} WHERE id = ${fila.id}`;
  }

  return {
    usuarioId: fila.usuario_id,
    usuario: fila.usuario,
    nombre: fila.nombre,
  };
}

export async function cerrarSesion(token: string): Promise<void> {
  const sql = obtenerSql();
  await sql`DELETE FROM sesiones WHERE id = ${hashToken(token)}`;
}
