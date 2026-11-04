/**
 * Núcleo del cambio de clave inicial, sin contexto de petición (la Server
 * Action solo resuelve la sesión y redirige).
 */
import { buscarParaIngresoPorId, cambiarClaveDeUsuario } from "@/db/consultas/autenticacion";
import { hashearClave, verificarClave } from "@/lib/clave";
import { validarClave } from "@/lib/clave-politica";

export const MENSAJE_CLAVE_TEMPORAL = "La clave nueva debe ser distinta de la clave temporal.";

/** Valida y guarda la clave inicial; devuelve el motivo del rechazo, o null si quedó guardada. */
export async function fijarClaveInicial(datos: {
  usuarioId: number;
  usuario: string;
  sesionId: string;
  claveNueva: string;
}): Promise<string | null> {
  const motivo = validarClave(datos.claveNueva, { usuario: datos.usuario });
  if (motivo) return motivo;
  // La temporal también la conoce el administrador que la generó: la definitiva debe ser otra.
  const cuenta = await buscarParaIngresoPorId(datos.usuarioId);
  if (!cuenta) throw new Error("La cuenta no existe");
  if (await verificarClave(cuenta.hashClave, datos.claveNueva)) return MENSAJE_CLAVE_TEMPORAL;

  await cambiarClaveDeUsuario(datos.usuarioId, await hashearClave(datos.claveNueva), datos.sesionId);
  return null;
}
