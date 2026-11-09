"use server";

import { idNumerico, mutacion, type EstadoAccion, type EstadoConAviso } from "@/app/admin/comun";
import { confirmarLectura, pedirAcuses } from "@/db/consultas/distribucion/acuses";
import { cerrarHallazgo, corregirHallazgo, reabrirHallazgo, validarHallazgo } from "@/db/consultas/distribucion/hallazgos";
import { anularJornada, registrarJornada } from "@/db/consultas/distribucion/jornadas";
import {
  abrirVerificacion,
  agregarItemLibre,
  cerrarVerificacion,
  descartarVerificacion,
  guardarAvance,
} from "@/db/consultas/distribucion/verificaciones";
import {
  anularCopia,
  confirmarRecibido,
  confirmarRecogida,
  confirmarReemplazo,
  emitirCopia,
  reemplazarCopias,
} from "@/db/consultas/distribucion/copias";
import {
  EsquemaAnulacion,
  EsquemaConfirmarLectura,
  EsquemaAbrirVerificacion,
  EsquemaEmitirCopia,
  EsquemaItemLibre,
  EsquemaNotaHallazgo,
  EsquemaPedirAcuses,
  EsquemaRecogida,
  EsquemaReemplazarCopias,
  EsquemaReemplazo,
  EsquemaValidarHallazgo,
  CAMPO_DE_CHEQUEO,
  leerChequeo,
  parsearJornada,
} from "@/lib/esquemas/distribucion";
import { EsquemaMotivoCierre } from "@/lib/esquemas/tramites";
import { rutaInterna } from "@/lib/rutas";
import { parsearFormulario } from "@/lib/validacion";

const rutaDeCopia = (id: number) => `/distribucion/copias/${id}`;

/** Una Server Action no abre pestañas: aterriza en la copia, que ofrece el enlace al PDF (`?imprimir=1`). */
export async function emitirCopiaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "copias.emitir", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(formData, EsquemaEmitirCopia);
    const { copiaId } = await emitirCopia(sesion, {
      documentoId: d.documentoId,
      puntoUsoId: d.puntoUsoId,
      nota: d.nota || null,
      reemplazaCopiaId: d.reemplazaCopiaId,
    });
    return `${rutaDeCopia(copiaId)}?imprimir=1`;
  });
}

export async function confirmarRecibidoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "distribucion.responder", async (_usuarioId, _formData, sesion) => {
    const id = idNumerico(formData, "id");
    await confirmarRecibido(id, sesion);
    return rutaDeCopia(id);
  });
}

export async function confirmarRecogidaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "distribucion.responder", async (_usuarioId, _formData, sesion) => {
    const { destino } = parsearFormulario(formData, EsquemaRecogida, { omitir: ["id"] });
    const id = idNumerico(formData, "id");
    await confirmarRecogida(id, sesion, destino);
    return rutaDeCopia(id);
  });
}

export async function confirmarReemplazoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "distribucion.responder", async (_usuarioId, _formData, sesion) => {
    const { destino } = parsearFormulario(formData, EsquemaReemplazo, { omitir: ["id"] });
    const id = idNumerico(formData, "id");
    await confirmarReemplazo(id, sesion, destino);
    return rutaDeCopia(id);
  });
}

export async function anularCopiaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "copias.emitir", async (_usuarioId, _formData, sesion) => {
    const { motivo, texto } = parsearFormulario(formData, EsquemaAnulacion, { omitir: ["id"] });
    const id = idNumerico(formData, "id");
    await anularCopia(id, sesion, motivo, texto || null);
    return rutaDeCopia(id);
  });
}

/**
 * Tras emitir, la ficha se vuelve a pintar sin el botón (ya no hay copias por reemplazar): el resultado viaja en la URL
 * (`?aviso=reemplazadas&n=<k>`) y la ficha lo dice. Si no había ninguna, no navega y lo dice junto al botón.
 */
export async function reemplazarCopiasAccion(_prev: EstadoConAviso, formData: FormData): Promise<EstadoConAviso> {
  const estado = await mutacion(formData, "copias.emitir", async (_usuarioId, _formData, sesion) => {
    const { versionId, volver } = parsearFormulario(formData, EsquemaReemplazarCopias);
    const { emitidas } = await reemplazarCopias(sesion, versionId);
    if (emitidas === 0) return;
    const ficha = rutaInterna(volver, "/");
    return `${ficha}${ficha.includes("?") ? "&" : "?"}aviso=reemplazadas&n=${emitidas}`;
  });
  return estado ?? { ok: true, aviso: "No había copias por reemplazar" };
}

export async function confirmarLecturaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "acuses.confirmar", async (_usuarioId, _formData, sesion) => {
    parsearFormulario(formData, EsquemaConfirmarLectura, { omitir: ["id"] });
    await confirmarLectura(idNumerico(formData, "id"), sesion);
    return "/";
  });
}

export async function pedirAcusesAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "distribucion.gestionar", async (_usuarioId, _formData, sesion) => {
    const { documentoId } = parsearFormulario(formData, EsquemaPedirAcuses);
    await pedirAcuses(sesion, documentoId);
  });
}

/** La jornada se registra primero; la evidencia se adjunta en su detalle durante las 24 horas siguientes. */
export async function registrarJornadaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "socializaciones.registrar", async (_usuarioId, _formData, sesion) => {
    const { jornadaId } = await registrarJornada(sesion, parsearJornada(formData));
    return `/distribucion/socializaciones/${jornadaId}`;
  });
}

export async function anularJornadaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "socializaciones.registrar", async (_usuarioId, _formData, sesion) => {
    const { motivo } = parsearFormulario(formData, EsquemaMotivoCierre, { omitir: ["id"] });
    const id = idNumerico(formData, "id");
    await anularJornada(id, sesion, motivo);
    return `/distribucion/socializaciones/${id}`;
  });
}

const rutaDeVerificacion = (id: number) => `/distribucion/verificaciones/${id}`;

export async function abrirVerificacionAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "verificaciones.realizar", async (_usuarioId, _formData, sesion) => {
    const { puntoId } = parsearFormulario(formData, EsquemaAbrirVerificacion);
    const { verificacionId } = await abrirVerificacion(sesion, puntoId);
    return rutaDeVerificacion(verificacionId);
  });
}

/** Lo que la pantalla tiene sin guardar viaja con cada envío, para que ninguna acción lo pierda. */
async function guardarLoEscrito(id: number, formData: FormData, sesion: Parameters<typeof guardarAvance>[1]) {
  const filas = leerChequeo(formData, ["id", "texto"]);
  await guardarAvance(
    id,
    sesion,
    filas.map(({ itemId, respuesta, nota, retirado }) => ({ itemId, respuesta, nota, retirado })),
  );
  return filas;
}

export async function guardarAvanceAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "verificaciones.realizar", async (_usuarioId, _formData, sesion) => {
    const id = idNumerico(formData, "id");
    await guardarLoEscrito(id, formData, sesion);
    return rutaDeVerificacion(id);
  });
}

export async function agregarItemLibreAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "verificaciones.realizar", async (_usuarioId, _formData, sesion) => {
    const { texto } = parsearFormulario(
      formData,
      EsquemaItemLibre,
      { omitir: ["id", ...[...formData.keys()].filter((k) => CAMPO_DE_CHEQUEO.test(k))] },
    );
    const id = idNumerico(formData, "id");
    await guardarLoEscrito(id, formData, sesion);
    await agregarItemLibre(id, sesion, texto);
    return rutaDeVerificacion(id);
  });
}

/** La fecha de corrección de cada no conforme no se guarda en el avance: viaja con el cierre. */
export async function cerrarVerificacionAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "verificaciones.realizar", async (_usuarioId, _formData, sesion) => {
    const id = idNumerico(formData, "id");
    const filas = await guardarLoEscrito(id, formData, sesion);
    await cerrarVerificacion(id, sesion, { fechasCorreccion: filas });
    return rutaDeVerificacion(id);
  });
}

export async function descartarVerificacionAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "verificaciones.realizar", async (_usuarioId, _formData, sesion) => {
    const { motivo } = parsearFormulario(formData, EsquemaMotivoCierre, { omitir: ["id"] });
    await descartarVerificacion(idNumerico(formData, "id"), sesion, motivo);
    return "/distribucion/verificaciones";
  });
}

/** Las acciones sobre un hallazgo vuelven a la verificación desde la que se hicieron. */
function volverDeHallazgo(formData: FormData): string {
  const verificacion = Number(formData.get("verificacion"));
  return Number.isInteger(verificacion) && verificacion > 0 ? rutaDeVerificacion(verificacion) : "/distribucion/verificaciones";
}

/** «Corregido» (spec 13C §12.5): el responsable del punto; la función exige además ser su responsable actual o gestionar. */
export async function corregirHallazgoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "distribucion.responder", async (_usuarioId, _formData, sesion) => {
    const { nota } = parsearFormulario(formData, EsquemaNotaHallazgo, { omitir: ["id", "verificacion"] });
    await corregirHallazgo(idNumerico(formData, "id"), sesion, nota);
    return volverDeHallazgo(formData);
  });
}

export async function validarHallazgoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "verificaciones.realizar", async (_usuarioId, _formData, sesion) => {
    parsearFormulario(formData, EsquemaValidarHallazgo, { omitir: ["id", "verificacion"] });
    await validarHallazgo(idNumerico(formData, "id"), sesion);
    return volverDeHallazgo(formData);
  });
}

export async function reabrirHallazgoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "verificaciones.realizar", async (_usuarioId, _formData, sesion) => {
    const { nota } = parsearFormulario(formData, EsquemaNotaHallazgo, { omitir: ["id", "verificacion"] });
    await reabrirHallazgo(idNumerico(formData, "id"), sesion, nota);
    return volverDeHallazgo(formData);
  });
}

/** Cerrar directamente queda para quien gestiona la distribución (cuenta como validado por el Admin SGC). */
export async function cerrarHallazgoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "distribucion.gestionar", async (_usuarioId, _formData, sesion) => {
    const { nota } = parsearFormulario(formData, EsquemaNotaHallazgo, { omitir: ["id", "verificacion"] });
    await cerrarHallazgo(idNumerico(formData, "id"), sesion, nota);
    return volverDeHallazgo(formData);
  });
}
