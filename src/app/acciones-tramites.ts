"use server";

import { idNumerico, mutacion, texto, type EstadoAccion } from "@/app/admin/comun";
import { obtenerTramite } from "@/db/consultas/tramites";
import {
  ErrorFirma,
  ErrorTramite,
  crearSolicitud,
  transicionar,
  type EntradaTransicion,
  type SesionFlujo,
} from "@/db/consultas/tramites-flujo";
import {
  EsquemaAceptarCreacion,
  EsquemaAceptarEliminacion,
  EsquemaAceptarModificacion,
  EsquemaMotivoCierre,
  EsquemaSolicitud,
} from "@/lib/esquemas/tramites";
import { ETAPAS_FINALES, ETAPAS_TRABAJO, type Etapa } from "@/lib/tramites/tipos";
import { parsearFormulario } from "@/lib/validacion";

/** Campos ocultos que dicen qué trámite y en qué estado lo vio la persona. */
const OCULTOS = ["id", "etapa", "ronda"];

const ESQUEMA_DE_ACEPTAR = {
  crear: EsquemaAceptarCreacion,
  modificar: EsquemaAceptarModificacion,
  eliminar: EsquemaAceptarEliminacion,
};

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

/** El esquema sale del tipo guardado: un formulario no decide qué clase de trámite es. */
export async function aceptarSolicitudAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "tramites.gestionar", async (_usuarioId, _formData, sesion) => {
    const tramite = await obtenerTramite(idNumerico(formData, "id"), sesion);
    if (!tramite) throw new ErrorTramite("El trámite no existe");
    return ejecutar(formData, sesion, "aceptar", {
      datos: parsearFormulario<Record<string, unknown>>(formData, ESQUEMA_DE_ACEPTAR[tramite.tipo], { omitir: OCULTOS }),
    });
  });
}

export async function rechazarSolicitudAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "tramites.gestionar", (_usuarioId, _formData, sesion) =>
    ejecutar(formData, sesion, "rechazar", {
      datos: parsearFormulario(formData, EsquemaMotivoCierre, { omitir: OCULTOS }),
    }),
  );
}
