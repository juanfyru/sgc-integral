import { obtenerSql } from "@/db/cliente";
import type { Rol } from "@/lib/roles";

export type Perfil = {
  id: number;
  usuario: string;
  nombre: string;
  correo: string | null;
  rol: Rol;
  cargo: string | null;
  area: string | null;
  totpActivo: boolean;
  procesos: Array<{ id: number; nombre: string; slug: string }>;
  // Queda vacío hasta la Tarea 11, que lo conecta con supervisoresDe.
  supervisores: Array<{ nombre: string; cargo: string | null }>;
};

export async function obtenerPerfil(usuarioId: number): Promise<Perfil | null> {
  const sql = obtenerSql();
  const [f] = await sql`
    SELECT u.id, u.usuario, u.nombre, u.correo, u.rol, u.totp_activo,
           c.nombre AS cargo, a.nombre AS area
    FROM usuarios u
    LEFT JOIN cargos c ON c.id = u.cargo_id
    LEFT JOIN areas a ON a.id = c.area_id
    WHERE u.id = ${usuarioId}`;
  if (!f) return null;
  const procesos = await sql`
    SELECT p.id, p.nombre, p.slug
    FROM usuario_procesos up JOIN procesos p ON p.id = up.proceso_id
    WHERE up.usuario_id = ${usuarioId} ORDER BY p.orden, p.id`;
  return {
    id: Number(f.id),
    usuario: f.usuario,
    nombre: f.nombre,
    correo: f.correo,
    rol: f.rol,
    cargo: f.cargo,
    area: f.area,
    totpActivo: f.totp_activo,
    procesos: procesos.map((p) => ({ id: Number(p.id), nombre: p.nombre, slug: p.slug })),
    supervisores: [],
  };
}
