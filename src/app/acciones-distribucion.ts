"use server";

import { idNumerico, mutacion, type EstadoAccion } from "@/app/admin/comun";
import { confirmarLectura, pedirAcuses } from "@/db/consultas/distribucion/acuses";
import { cerrarHallazgo } from "@/db/consultas/distribucion/hallazgos";
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
  leerChequeo,
  parsearJornada,
} from "@/lib/esquemas/distribucion";
import { EsquemaMotivoCierre } from "@/lib/esquemas/tramites";
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

export async function reemplazarCopiasAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "copias.emitir", async (_usuarioId, _formData, sesion) => {
    const { versionId } = parsearFormulario(formData, EsquemaReemplazarCopias);
    await reemplazarCopias(sesion, versionId);
  });
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
    filas.map(({ itemId, respuesta, nota }) => ({ itemId, respuesta, nota })),
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
      { omitir: ["id", ...[...formData.keys()].filter((k) => /^(respuesta|nota|retirado)_\d+$/.test(k))] },
    );
    const id = idNumerico(formData, "id");
    await guardarLoEscrito(id, formData, sesion);
    await agregarItemLibre(id, sesion, texto);
    return rutaDeVerificacion(id);
  });
}

export async function cerrarVerificacionAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "verificaciones.realizar", async (_usuarioId, _formData, sesion) => {
    const id = idNumerico(formData, "id");
    const filas = await guardarLoEscrito(id, formData, sesion);
    const retirados = filas.filter((f) => f.retirado && f.respuesta === "no_conforme").map((f) => f.itemId);
    await cerrarVerificacion(id, sesion, { retirados });
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

export async function cerrarHallazgoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "distribucion.responder", async (_usuarioId, _formData, sesion) => {
    const { nota } = parsearFormulario(formData, EsquemaNotaHallazgo, { omitir: ["id", "verificacion"] });
    await cerrarHallazgo(idNumerico(formData, "id"), sesion, nota);
    const verificacion = Number(formData.get("verificacion"));
    return Number.isInteger(verificacion) && verificacion > 0 ? rutaDeVerificacion(verificacion) : "/distribucion/verificaciones";
  });
}
