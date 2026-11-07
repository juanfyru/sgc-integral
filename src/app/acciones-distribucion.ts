"use server";

import { idNumerico, mutacion, type EstadoAccion } from "@/app/admin/comun";
import { confirmarLectura } from "@/db/consultas/distribucion/acuses";
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
  EsquemaEmitirCopia,
  EsquemaRecogida,
  EsquemaReemplazarCopias,
  EsquemaReemplazo,
} from "@/lib/esquemas/distribucion";
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
