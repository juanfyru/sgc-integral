"use client";

import { useActionState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";

/**
 * Una acción de servidor que no navega: cuando sale bien devuelve `null` (como el estado inicial) y el diálogo no se
 * entera. Esto avisa con `alExito` para cerrarlo; si falla, el error vuelve en el estado y el diálogo sigue abierto.
 */
export function useAccionDeDialogo(
  accion: (previo: EstadoAccion, formData: FormData) => Promise<EstadoAccion>,
  alExito: () => void,
) {
  return useActionState(async (previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> => {
    const resultado = await accion(previo, formData);
    if (resultado === null) alExito();
    return resultado;
  }, null as EstadoAccion);
}
