"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { comprobarLimite, idNumerico, mutacion, valoresDeFormulario, type EstadoAccion } from "@/app/admin/comun";
import {
  cambiarActivo,
  crearUsuario,
  desbloquearUsuario,
  editarUsuario,
  obtenerUsuario,
  quitarSegundoFactor,
  restablecerClave,
} from "@/db/consultas/usuarios";
import { generarClaveTemporal } from "@/lib/clave-politica";
import { parsearUsuario } from "@/lib/esquemas/usuarios";
import { ipDePeticion } from "@/lib/ip";
import { ErrorPermiso, requerirPermiso } from "@/lib/permisos";
import { requerirSesion } from "@/lib/sesion-actual";

export type EstadoCreacion =
  | EstadoAccion
  | { ok: true; id: number; usuario: string; claveTemporal: string };

export type EstadoRestablecer = EstadoAccion | { ok: true; claveTemporal: string };

const RUTA = "/admin/usuarios";

// La clave temporal viaja solo en el estado devuelto a la pantalla: nunca en la URL ni en el log.
export async function crearUsuarioAccion(_prev: EstadoCreacion, formData: FormData): Promise<EstadoCreacion> {
  const sesion = await requerirSesion();
  try {
    requerirPermiso(sesion, "usuarios.administrar");
  } catch (err) {
    if (err instanceof ErrorPermiso) return { ok: false, error: err.message };
    throw err;
  }
  const limitado = comprobarLimite(sesion, formData);
  if (limitado) return limitado;
  try {
    const datos = parsearUsuario(formData);
    const claveTemporal = generarClaveTemporal();
    const { id } = await crearUsuario(datos, claveTemporal, sesion.usuarioId);
    revalidatePath("/", "layout");
    return { ok: true, id, usuario: datos.usuario, claveTemporal };
  } catch (err) {
    return { ok: false, error: (err as Error).message, valores: valoresDeFormulario(formData) };
  }
}

// `_prev` con el tipo de creación para compartir FormularioUsuario con crearUsuarioAccion.
// El nombre de usuario es inmutable: el formulario lo envía de solo lectura y aquí se verifica que no cambió.
export async function editarUsuarioAccion(_prev: EstadoCreacion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "usuarios.administrar", async (actorId) => {
    const id = idNumerico(formData, "id");
    const { usuario, ...datos } = parsearUsuario(formData);
    const actual = await obtenerUsuario(id);
    if (!actual) throw new Error("El usuario no existe");
    if (actual.usuario !== usuario) throw new Error("El nombre de usuario no se puede cambiar");
    await editarUsuario(id, datos, actorId);
    return `${RUTA}/${id}`;
  });
}

export async function cambiarActivoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "usuarios.administrar", async (actorId) => {
    await cambiarActivo(idNumerico(formData, "id"), formData.get("activo") === "true", actorId);
  });
}

export async function desbloquearAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "usuarios.administrar", async (actorId) => {
    const cabeceras = await headers();
    await desbloquearUsuario(idNumerico(formData, "id"), actorId, {
      ip: ipDePeticion(cabeceras),
      userAgent: cabeceras.get("user-agent"),
    });
  });
}

export async function quitarFactorAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "usuarios.administrar", async (actorId) => {
    await quitarSegundoFactor(idNumerico(formData, "id"), actorId);
  });
}

export async function restablecerClaveAccion(
  _prev: EstadoRestablecer,
  formData: FormData,
): Promise<EstadoRestablecer> {
  const sesion = await requerirSesion();
  try {
    requerirPermiso(sesion, "usuarios.administrar");
  } catch (err) {
    if (err instanceof ErrorPermiso) return { ok: false, error: err.message };
    throw err;
  }
  const limitado = comprobarLimite(sesion);
  if (limitado) return limitado;
  try {
    const cabeceras = await headers();
    const { claveTemporal } = await restablecerClave(idNumerico(formData, "id"), sesion.usuarioId, {
      ip: ipDePeticion(cabeceras),
      userAgent: cabeceras.get("user-agent"),
    });
    revalidatePath("/", "layout");
    return { ok: true, claveTemporal };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
