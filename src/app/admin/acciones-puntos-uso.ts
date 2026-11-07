"use server";

import { idNumerico, mutacion, type EstadoAccion } from "@/app/admin/comun";
import { alternarPuntoUso, crearPuntoUso, editarPuntoUso } from "@/db/consultas/distribucion/puntos-uso";
import { EsquemaAlternar, parsearPuntoUso } from "@/lib/esquemas/distribucion";
import { parsearFormulario } from "@/lib/validacion";

const RUTA = "/admin/puntos-uso";

export async function crearPuntoUsoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "distribucion.gestionar", async (usuarioId) => {
    await crearPuntoUso(parsearPuntoUso(formData), usuarioId);
    return RUTA;
  });
}

export async function editarPuntoUsoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "distribucion.gestionar", async (usuarioId) => {
    await editarPuntoUso(idNumerico(formData, "id"), parsearPuntoUso(formData), usuarioId);
    return RUTA;
  });
}

// Con useActionState (FormAccion) para que el error de negocio llegue a la página.
export async function alternarPuntoUsoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "distribucion.gestionar", async (usuarioId) => {
    const { activo } = parsearFormulario(formData, EsquemaAlternar, { omitir: ["id"] });
    await alternarPuntoUso(idNumerico(formData, "id"), activo === "true", usuarioId);
    return RUTA;
  });
}
