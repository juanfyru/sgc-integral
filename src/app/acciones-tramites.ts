"use server";

import { idNumerico, mutacion, texto, type EstadoAccion } from "@/app/admin/comun";
import {
  cerrarObservacion,
  crearObservacion,
  guardarVerificacion,
  reabrirObservacion,
  responderObservacion,
} from "@/db/consultas/revision";
import { obtenerTramite } from "@/db/consultas/tramites";
import { guardarControlCambios } from "@/db/consultas/tramites-archivos";
import {
  CAMBIO_MIENTRAS,
  ErrorFirma,
  ErrorTramite,
  crearSolicitud,
  transicionar,
  type EntradaTransicion,
  type SesionFlujo,
} from "@/db/consultas/tramites-flujo";
import { contextoDePeticion } from "@/lib/contexto-peticion";
import {
  EsquemaAceptarCreacion,
  EsquemaAceptarEliminacion,
  EsquemaAceptarModificacion,
  EsquemaConcepto,
  EsquemaControlCambios,
  EsquemaDevolucionAprobacion,
  EsquemaFirma,
  EsquemaMotivoCierre,
  EsquemaObservacion,
  EsquemaReaperturaObservacion,
  EsquemaRespuestaObservacion,
  EsquemaSolicitud,
  leerVerificacion,
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
 * Saca la clave y el código del formulario y los deja en una copia: `mutacion` le devuelve al
 * navegador lo enviado cuando algo falla, y una clave no vuelve por ahí.
 */
function separarFirma(formData: FormData): FormData {
  const firma = new FormData();
  for (const [campo, valor] of formData) firma.append(campo, valor);
  formData.delete("clave");
  formData.delete("codigo");
  return firma;
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
    const opciones = extra?.credenciales ? { contexto: await contextoDePeticion() } : undefined;
    await transicionar(sesion, { ...referencia(formData), accion, ...extra }, opciones);
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

/**
 * El esquema sale del tipo guardado: un formulario no decide qué clase de trámite es. Si el
 * trámite cambió (otro administrador pudo convertirlo), este formulario ya no es su esquema.
 */
export async function aceptarSolicitudAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "tramites.gestionar", async (_usuarioId, _formData, sesion) => {
    const { tramiteId, etapaEsperada, rondaEsperada } = referencia(formData);
    const tramite = await obtenerTramite(tramiteId, sesion);
    if (!tramite) throw new ErrorTramite("El trámite no existe");
    if (tramite.etapa !== etapaEsperada || tramite.ronda !== rondaEsperada) throw new ErrorTramite(CAMBIO_MIENTRAS);
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

export async function guardarControlCambiosAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "tramites.participar", async (_usuarioId, _formData, sesion) => {
    const { resumenCambios } = parsearFormulario(formData, EsquemaControlCambios, { omitir: OCULTOS });
    await guardarControlCambios(idNumerico(formData, "id"), sesion, resumenCambios);
  });
}

export async function enviarARevisionAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const firma = separarFirma(formData);
  return mutacion(formData, "tramites.participar", (_usuarioId, _formData, sesion) =>
    ejecutar(formData, sesion, "enviar_a_revision", {
      credenciales: parsearFormulario(firma, EsquemaFirma, { omitir: OCULTOS }),
    }),
  );
}

export async function guardarVerificacionAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "tramites.revisar", async (_usuarioId, _formData, sesion) => {
    const { tramiteId, etapaEsperada: etapa, rondaEsperada: ronda } = referencia(formData);
    await guardarVerificacion(tramiteId, sesion, leerVerificacion(formData, OCULTOS), { etapa, ronda });
  });
}

export async function crearObservacionAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "tramites.revisar", async (_usuarioId, _formData, sesion) => {
    const { texto } = parsearFormulario(formData, EsquemaObservacion, { omitir: OCULTOS });
    const { tramiteId, etapaEsperada: etapa, rondaEsperada: ronda } = referencia(formData);
    await crearObservacion(tramiteId, sesion, texto, { etapa, ronda });
  });
}

export async function cerrarObservacionAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "tramites.revisar", async (_usuarioId, _formData, sesion) => {
    const { etapaEsperada: etapa, rondaEsperada: ronda } = referencia(formData);
    await cerrarObservacion(idNumerico(formData, "observacionId"), sesion, { etapa, ronda });
  });
}

export async function reabrirObservacionAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "tramites.revisar", async (_usuarioId, _formData, sesion) => {
    const { nota } = parsearFormulario(formData, EsquemaReaperturaObservacion, { omitir: [...OCULTOS, "observacionId"] });
    const { etapaEsperada: etapa, rondaEsperada: ronda } = referencia(formData);
    await reabrirObservacion(idNumerico(formData, "observacionId"), sesion, nota, { etapa, ronda });
  });
}

export async function responderObservacionAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "tramites.participar", async (_usuarioId, _formData, sesion) => {
    const { respuesta } = parsearFormulario(formData, EsquemaRespuestaObservacion, { omitir: [...OCULTOS, "observacionId"] });
    const { etapaEsperada: etapa, rondaEsperada: ronda } = referencia(formData);
    await responderObservacion(idNumerico(formData, "observacionId"), sesion, respuesta, { etapa, ronda });
  });
}

export async function devolverRevisionAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "tramites.revisar", (_usuarioId, _formData, sesion) =>
    ejecutar(formData, sesion, "devolver_revision"),
  );
}

export async function conceptoFavorableAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const firma = separarFirma(formData);
  return mutacion(formData, "tramites.revisar", (_usuarioId, _formData, sesion) =>
    ejecutar(formData, sesion, "concepto_favorable", {
      datos: parsearFormulario(formData, EsquemaConcepto, { omitir: OCULTOS }),
      credenciales: parsearFormulario(firma, EsquemaFirma, { omitir: [...OCULTOS, "concepto"] }),
    }),
  );
}

export async function aprobarAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const firma = separarFirma(formData);
  return mutacion(formData, "tramites.aprobar", (_usuarioId, _formData, sesion) =>
    ejecutar(formData, sesion, "aprobar", {
      datos: parsearFormulario(formData, EsquemaConcepto, { omitir: OCULTOS }),
      credenciales: parsearFormulario(firma, EsquemaFirma, { omitir: [...OCULTOS, "concepto"] }),
    }),
  );
}

export async function devolverAprobacionAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "tramites.aprobar", (_usuarioId, _formData, sesion) =>
    ejecutar(formData, sesion, "devolver_aprobacion", {
      datos: parsearFormulario(formData, EsquemaDevolucionAprobacion, { omitir: OCULTOS }),
    }),
  );
}

export async function negarEliminacionAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "tramites.aprobar", (_usuarioId, _formData, sesion) =>
    ejecutar(formData, sesion, "negar_eliminacion", {
      datos: parsearFormulario(formData, EsquemaMotivoCierre, { omitir: OCULTOS }),
    }),
  );
}

export async function publicarTramiteAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const firma = separarFirma(formData);
  return mutacion(formData, "tramites.gestionar", (_usuarioId, _formData, sesion) =>
    ejecutar(formData, sesion, "publicar", {
      credenciales: parsearFormulario(firma, EsquemaFirma, { omitir: OCULTOS }),
    }),
  );
}

export async function aprobarYPublicarAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const firma = separarFirma(formData);
  return mutacion(formData, "tramites.gestionar", (_usuarioId, _formData, sesion) =>
    ejecutar(formData, sesion, "aprobar_y_publicar", {
      datos: parsearFormulario(formData, EsquemaConcepto, { omitir: OCULTOS }),
      credenciales: parsearFormulario(firma, EsquemaFirma, { omitir: [...OCULTOS, "concepto"] }),
    }),
  );
}
