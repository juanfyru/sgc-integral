"use server";

import { idNumerico, mutacion, texto, type EstadoAccion } from "@/app/admin/comun";
import {
  ErrorFirma,
  crearSolicitud,
  transicionar,
  type EntradaTransicion,
  type SesionFlujo,
} from "@/db/consultas/tramites-flujo";
import { EsquemaMotivoCierre, EsquemaSolicitud } from "@/lib/esquemas/tramites";
import { ETAPAS_FINALES, ETAPAS_TRABAJO, type Etapa } from "@/lib/tramites/tipos";
import { parsearFormulario } from "@/lib/validacion";

/** Campos ocultos que dicen qué trámite y en qué estado lo vio la persona. */
const OCULTOS = ["id", "etapa", "ronda"];

function referencia(formData: FormData): Pick<EntradaTransicion, "tramiteId" | "etapaEsperada" | "rondaEsperada"> {
  const etapa = texto(formData, "etapa");
  const ronda = texto(formData, "ronda");
  const conocida = ([...ETAPAS_TRABAJO, ...ETAPAS_FINALES] as string[]).includes(etapa);
  if (!conocida || !/^\d+$/.test(ronda)) throw new Error("Formulario inválido. Recargue la página.");
  return { tramiteId: idNumerico(formData, "id"), etapaEsperada: etapa as Etapa, rondaEsperada: Number(ronda) };
}

/**
 * Corre la transición que pide el formulario. `mutacion` vuelve mensaje todo lo que se lance:
 * una firma que cerró la sesión no es un error del formulario, sino el fin de esa sesión.
 */
async function ejecutar(
  formData: FormData,
  sesion: SesionFlujo,
  accion: EntradaTransicion["accion"],
  extra?: Pick<EntradaTransicion, "datos" | "credenciales">,
): Promise<string | void> {
  try {
    await transicionar(sesion, { ...referencia(formData), accion, ...extra });
  } catch (err) {
    if (err instanceof ErrorFirma && err.sesionCerrada) return "/ingreso";
    throw err;
  }
}

export async function crearSolicitudAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "tramites.solicitar", async (_usuarioId, _formData, sesion) => {
    const { tramiteId } = await crearSolicitud(sesion, parsearFormulario(formData, EsquemaSolicitud));
    return `/tramites/${tramiteId}`;
  });
}

export async function darVistoBuenoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "tramites.visto_bueno", (_usuarioId, _formData, sesion) =>
    ejecutar(formData, sesion, "dar_visto_bueno"),
  );
}

export async function negarVistoBuenoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "tramites.visto_bueno", (_usuarioId, _formData, sesion) =>
    ejecutar(formData, sesion, "negar_visto_bueno", {
      datos: parsearFormulario(formData, EsquemaMotivoCierre, { omitir: OCULTOS }),
    }),
  );
}

export async function retirarSolicitudAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "tramites.solicitar", (_usuarioId, _formData, sesion) =>
    ejecutar(formData, sesion, "retirar"),
  );
}
