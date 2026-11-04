"use server";

import { mutacion, type EstadoAccion } from "@/app/admin/comun";
import { guardarEntidad } from "@/db/consultas/entidad";
import { EsquemaEntidad } from "@/lib/esquemas/entidad";
import { parsearFormulario } from "@/lib/validacion";

export async function guardarEntidadAccion(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, "entidad.administrar", async (usuarioId) => {
    const d = parsearFormulario(formData, EsquemaEntidad);
    await guardarEntidad(
      {
        nombre: d.nombre_entidad,
        sigla: d.sigla_entidad,
        lema: d.lema,
        avisoDatosPersonales: d.aviso_datos_personales,
        primario: d.color_primario,
        secundario: d.color_secundario,
      },
      usuarioId,
    );
    return "/admin/entidad?guardado=1";
  });
}
