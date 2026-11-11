"use server";

import { idNumerico, mutacion, texto, type EstadoAccion } from "@/app/admin/comun";
import {
  activarEnMaestro,
  borrarDeMaestro,
  guardarEnMaestro,
  guardarParametros,
  type DatosMaestro,
} from "@/db/consultas/indicadores/maestros";
import {
  EsquemaActivarMaestro,
  EsquemaMaestro,
  EsquemaParametrosIndicadores,
  ESQUEMAS_MAESTRO,
} from "@/lib/esquemas/indicadores-maestros";
import { parsearFormulario } from "@/lib/validacion";

/** `maestro` es el maestro; `id`, si viene, el del elemento que se edita (sin él, se crea). */
export async function guardarEnMaestroAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    const soloMaestro = new FormData();
    soloMaestro.set("maestro", texto(formData, "maestro"));
    const { maestro } = parsearFormulario(soloMaestro, EsquemaMaestro);
    const datos = parsearFormulario<Record<string, unknown>>(formData, ESQUEMAS_MAESTRO[maestro], {
      omitir: ["id", "maestro"],
    });
    const id = texto(formData, "id") ? idNumerico(formData, "id") : undefined;
    await guardarEnMaestro(sesion, maestro, { ...datos, ...(id ? { id } : {}) } as DatosMaestro);
  });
}

/** `id` es el del elemento. */
export async function activarEnMaestroAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    const { maestro, activo } = parsearFormulario(formData, EsquemaActivarMaestro, { omitir: ["id"] });
    await activarEnMaestro(sesion, maestro, idNumerico(formData, "id"), activo === "true");
  });
}

/** `id` es el del elemento. */
export async function borrarDeMaestroAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    const { maestro } = parsearFormulario(formData, EsquemaMaestro, { omitir: ["id"] });
    await borrarDeMaestro(sesion, maestro, idNumerico(formData, "id"));
  });
}

export async function guardarParametrosAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    const parametros = parsearFormulario(formData, EsquemaParametrosIndicadores);
    await guardarParametros(sesion, parametros);
  });
}
