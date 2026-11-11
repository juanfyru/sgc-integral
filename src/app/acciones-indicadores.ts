"use server";

// Acciones del módulo de indicadores (Fase 14). Cada una pasa por `mutacion` con su permiso de la matriz; la condición
// de persona la vuelve a comprobar la consulta. Las de los maestros viven en `src/app/admin/acciones-indicadores.ts`.

import { rutaDeEdicion } from "@/app/(app)/indicadores/_comun";
import { idNumerico, mutacion, type EstadoAccion } from "@/app/admin/comun";
import { abrirCambio, crearIndicador, guardarBorrador } from "@/db/consultas/indicadores/fichas";
import { EsquemaSinDatos } from "@/lib/esquemas/documentos";
import { EsquemaFicha } from "@/lib/esquemas/indicadores";
import { parsearFormulario } from "@/lib/validacion";

/** Crea el indicador en borrador y lleva a su ficha para seguir editándola. */
export async function crearIndicadorAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(formData, EsquemaFicha);
    const { codigo } = await crearIndicador(sesion, d);
    return rutaDeEdicion(codigo);
  });
}

/** `id` es el de la versión en borrador. El formulario siempre manda el código: si cambió, la página es otra. */
export async function guardarBorradorAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(formData, EsquemaFicha, { omitir: ["id"] });
    await guardarBorrador(sesion, idNumerico(formData, "id"), d);
    return d.codigo ? rutaDeEdicion(d.codigo) : "/indicadores";
  });
}

/** `id` es el del indicador. No navega: la página vuelve a pintarse con el borrador abierto. */
export async function abrirCambioAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    parsearFormulario(formData, EsquemaSinDatos, { omitir: ["id"] });
    await abrirCambio(sesion, idNumerico(formData, "id"));
  });
}
