"use server";

// Acciones del módulo de mejoramiento (Fase 15). Cada una pasa por `mutacion` con su permiso de la matriz; la condición
// de persona (el alcance de proceso, quien tiene el turno) la vuelve a comprobar la consulta dentro de su transacción.
// Las de la configuración viven en `src/app/admin/acciones-mejoramiento.ts`.

import { mutacion, type EstadoAccion } from "@/app/admin/comun";
import { registrarHallazgo } from "@/db/consultas/mejoramiento/registro";
import { EsquemaHallazgo } from "@/lib/esquemas/mejoramiento";
import { rutaDeHallazgo } from "@/lib/mejoramiento/rutas";
import { parsearFormulario } from "@/lib/validacion";

/** Registra un hallazgo y lleva a su página. Los parecidos y las evidencias llegan en las tareas 8 y 9. */
export async function registrarHallazgoAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.registrar", async (_usuarioId, datos, sesion) => {
    const hallazgo = await registrarHallazgo(sesion, parsearFormulario(datos, EsquemaHallazgo));
    return rutaDeHallazgo(hallazgo.id);
  });
}
