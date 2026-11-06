"use server";

import { idNumerico, mutacion, texto, type EstadoAccion } from "@/app/admin/comun";
import {
  crearDocumento,
  crearVersionBorrador,
  deshacerCarga,
  descartarBorrador,
  editarCatalogo,
  editarControl,
  editarVersionBorrador,
  publicarVersion,
} from "@/db/consultas/admin";
import {
  EsquemaCatalogo,
  EsquemaControl,
  EsquemaDatosVersion,
  EsquemaDeshacerCarga,
  EsquemaDocumentoNuevo,
  EsquemaNuevaVersion,
  EsquemaSinDatos,
} from "@/lib/esquemas/documentos";
import { parsearFormulario } from "@/lib/validacion";

export type { EstadoAccion } from "@/app/admin/comun";

const rutaDe = (codigo: string) => `/admin/documentos/${encodeURIComponent(codigo)}`;

export async function crearDocumentoAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, "documentos.administrar", async (usuarioId) => {
    const datos = parsearFormulario(formData, EsquemaDocumentoNuevo);
    await crearDocumento(datos, usuarioId);
    return rutaDe(datos.codigo);
  });
}

export async function editarControlAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, "documentos.administrar", async (usuarioId) => {
    const datos = parsearFormulario(formData, EsquemaControl, { omitir: ["documentoId"] });
    await editarControl(idNumerico(formData, "documentoId"), datos, usuarioId);
    return rutaDe(datos.codigo);
  });
}

export async function editarCatalogoAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, "documentos.administrar", async (usuarioId) => {
    const datos = parsearFormulario(formData, EsquemaCatalogo, { omitir: ["documentoId", "codigo"] });
    await editarCatalogo(idNumerico(formData, "documentoId"), datos, usuarioId);
    return rutaDe(texto(formData, "codigo"));
  });
}

export async function crearVersionAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, "documentos.administrar", async (usuarioId) => {
    const { numero } = parsearFormulario(formData, EsquemaNuevaVersion, { omitir: ["documentoId"] });
    await crearVersionBorrador(idNumerico(formData, "documentoId"), usuarioId, numero);
  });
}

export async function editarVersionAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, "documentos.administrar", async (usuarioId) => {
    const datos = parsearFormulario(formData, EsquemaDatosVersion, { omitir: ["versionId"] });
    await editarVersionBorrador(idNumerico(formData, "versionId"), datos, usuarioId);
  });
}

export async function publicarAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, "documentos.administrar", async (usuarioId) => {
    parsearFormulario(formData, EsquemaSinDatos, { omitir: ["versionId"] });
    await publicarVersion(idNumerico(formData, "versionId"), usuarioId);
  });
}

export async function deshacerCargaAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, "documentos.administrar", async (usuarioId) => {
    const { motivo } = parsearFormulario(formData, EsquemaDeshacerCarga, { omitir: ["documentoId"] });
    await deshacerCarga(idNumerico(formData, "documentoId"), motivo, usuarioId);
  });
}

export async function descartarBorradorAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, "documentos.administrar", async (usuarioId) => {
    parsearFormulario(formData, EsquemaSinDatos, { omitir: ["versionId"] });
    await descartarBorrador(idNumerico(formData, "versionId"), usuarioId);
  });
}
