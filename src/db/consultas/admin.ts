import { obtenerSql } from "@/db/cliente";
import { hashearClave } from "@/lib/clave";

/**
 * Crea el usuario admin si no existe (idempotente: arranque del contenedor y
 * dev). Con forzarClave restablece la clave — el camino de "la olvidé",
 * ejecutando el script en el NAS.
 */
export async function asegurarAdmin(
  usuario: string,
  nombre: string,
  clave: string,
  forzarClave = false,
): Promise<"creado" | "existente" | "clave_actualizada"> {
  const sql = obtenerSql();
  const [existente] = await sql`SELECT id FROM usuarios WHERE usuario = ${usuario}`;

  if (!existente) {
    await sql`INSERT INTO usuarios (usuario, nombre, hash_clave)
      VALUES (${usuario}, ${nombre}, ${await hashearClave(clave)})`;
    return "creado";
  }
  if (forzarClave) {
    await sql`UPDATE usuarios SET hash_clave = ${await hashearClave(clave)}, activo = true
      WHERE id = ${existente.id}`;
    return "clave_actualizada";
  }
  return "existente";
}
