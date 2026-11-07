"use server";

import { idNumerico, mutacion, type EstadoAccion } from "@/app/admin/comun";
import { alternarLista, crearLista, editarLista } from "@/db/consultas/distribucion/listas";
import { EsquemaAlternar, parsearLista } from "@/lib/esquemas/distribucion";
import { parsearFormulario } from "@/lib/validacion";

const RUTA = "/admin/listas-distribucion";

export async function crearListaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "distribucion.gestionar", async (usuarioId) => {
    await crearLista(parsearLista(formData), usuarioId);
    return RUTA;
  });
}

export async function editarListaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "distribucion.gestionar", async (usuarioId) => {
    await editarLista(idNumerico(formData, "id"), parsearLista(formData), usuarioId);
    return RUTA;
  });
}

export async function alternarListaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "distribucion.gestionar", async (usuarioId) => {
    const { activo } = parsearFormulario(formData, EsquemaAlternar, { omitir: ["id"] });
    await alternarLista(idNumerico(formData, "id"), activo === "true", usuarioId);
    return RUTA;
  });
}
