"use server";

import { revalidatePath } from "next/cache";
import { idNumerico, mutacion, type EstadoAccion } from "@/app/admin/comun";
import {
  alternarArea,
  alternarCargo,
  crearArea,
  crearCargo,
  editarArea,
  editarCargo,
  moverArea,
} from "@/db/consultas/estructura";
import { requerirPermiso } from "@/lib/permisos";
import { requerirSesion } from "@/lib/sesion-actual";
import { EsquemaArea, EsquemaCargo } from "@/lib/esquemas/estructura";
import { parsearFormulario } from "@/lib/validacion";

const RUTA = "/admin/estructura";

function parsearCargo(formData: FormData) {
  const d = parsearFormulario(formData, EsquemaCargo);
  return { nombre: d.nombre, areaId: d.areaId, superiorId: d.superiorId ?? null };
}

export async function crearAreaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "estructura.administrar", async (usuarioId) => {
    await crearArea(parsearFormulario(formData, EsquemaArea), usuarioId);
    return RUTA;
  });
}

export async function editarAreaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "estructura.administrar", async (usuarioId) => {
    await editarArea(idNumerico(formData, "id"), parsearFormulario(formData, EsquemaArea), usuarioId);
    return RUTA;
  });
}

export async function moverAreaAccion(formData: FormData): Promise<void> {
  const sesion = await requerirSesion();
  requerirPermiso(sesion, "estructura.administrar");
  const dir = String(formData.get("direccion"));
  if (dir !== "arriba" && dir !== "abajo") throw new Error("Dirección inválida");
  await moverArea(idNumerico(formData, "id"), dir, sesion.usuarioId);
  revalidatePath("/", "layout");
}

// Con useActionState (FormAccion) para que el error de negocio llegue a la página.
export async function alternarAreaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "estructura.administrar", async (usuarioId) => {
    await alternarArea(idNumerico(formData, "id"), formData.get("activo") === "true", usuarioId);
  });
}

export async function crearCargoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "estructura.administrar", async (usuarioId) => {
    await crearCargo(parsearCargo(formData), usuarioId);
    return RUTA;
  });
}

export async function editarCargoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "estructura.administrar", async (usuarioId) => {
    await editarCargo(idNumerico(formData, "id"), parsearCargo(formData), usuarioId);
    return RUTA;
  });
}

// Con useActionState (FormAccion) para que el error de negocio llegue al formulario.
export async function alternarCargoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "estructura.administrar", async (usuarioId) => {
    await alternarCargo(idNumerico(formData, "id"), formData.get("activo") === "true", usuarioId);
  });
}
