"use server";

import { idNumerico, mutacion, type EstadoAccion } from "@/app/admin/comun";
import {
  agregarDiaDeCalendario,
  guardarConfigMejora,
  obtenerConfigMejora,
  quitarDiaDeCalendario,
  type ConfigMejora,
} from "@/db/consultas/mejoramiento/config";
import { EsquemaDiaDeCalendario, EsquemaFormularioConfigMejora } from "@/lib/esquemas/mejoramiento";
import { parsearFormulario } from "@/lib/validacion";

const PASOS = ["clasificar", "aceptar", "decision", "correccion", "formular", "reenviar", "revisar", "aprobar", "verificar", "evaluar"] as const;
const IMPRESOS = ["registro", "porques", "ishikawa"] as const;

/** Un bloque a la vez: lo que el formulario no manda se conserva como está guardado. */
export async function guardarConfigMejoraAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.gestionar", async (_usuarioId, _formData, sesion) => {
    const f = parsearFormulario(formData, EsquemaFormularioConfigMejora);
    const actual = await obtenerConfigMejora();
    const nueva: ConfigMejora = { ...actual, plazos: { ...actual.plazos }, formatos: { ...actual.formatos } };
    if (f.bloque === "plazos") {
      for (const paso of PASOS) nueva.plazos[paso] = Number(f[`plazo_${paso}`]);
      nueva.recordatorioAltaDias = Number(f.recordatorioAltaDias);
      nueva.recordatorioDias = Number(f.recordatorioDias);
    } else {
      for (const impreso of IMPRESOS) {
        const id = f[`formato_${impreso}`];
        nueva.formatos[impreso] = id ? Number(id) : null;
      }
    }
    await guardarConfigMejora(sesion, nueva);
  });
}

export async function agregarDiaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.gestionar", async (_usuarioId, _formData, sesion) => {
    const dia = parsearFormulario(formData, EsquemaDiaDeCalendario);
    await agregarDiaDeCalendario(sesion, dia);
  });
}

/** `id` es el del día de la lista. */
export async function quitarDiaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.gestionar", async (_usuarioId, _formData, sesion) => {
    await quitarDiaDeCalendario(sesion, idNumerico(formData, "id"));
  });
}
