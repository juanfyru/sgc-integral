"use server";

import {
  idNumerico,
  mutacion,
  texto,
  textoONulo,
  type EstadoAccion,
} from "@/app/admin/comun";
import {
  anularVigente,
  crearDocumento,
  crearVersionBorrador,
  editarMetadatos,
  editarVersionBorrador,
  obtenerPatronCodigo,
  publicarVersion,
  type AsociacionEntrada,
  type DatosDocumento,
  type DatosVersion,
} from "@/db/consultas/admin";

export type { EstadoAccion } from "@/app/admin/comun";

// ── Parseo de formularios ──

// Checkboxes "asociaciones" (p:<id> | s:<id>) + radio "principal".
function parsearAsociaciones(formData: FormData): AsociacionEntrada[] {
  const principal = String(formData.get("principal") ?? "");
  const marcadas = new Set(formData.getAll("asociaciones").map(String));
  if (principal) marcadas.add(principal);
  const asociaciones: AsociacionEntrada[] = [];
  for (const marca of marcadas) {
    const [tipo, id] = marca.split(":");
    const numero = Number(id);
    if (!Number.isInteger(numero) || numero <= 0) continue;
    asociaciones.push({
      ...(tipo === "p" ? { procesoId: numero } : { subprocesoId: numero }),
      esPrincipal: marca === principal,
    });
  }
  return asociaciones;
}

async function parsearDocumento(formData: FormData): Promise<DatosDocumento> {
  const codigo = texto(formData, "codigo").toUpperCase();
  const patron = await obtenerPatronCodigo();
  if (!patron.test(codigo)) {
    throw new Error(
      "El código no cumple el formato TIPO-PROCESO-CONSECUTIVO (ej. PR-GTH-001)",
    );
  }
  const titulo = texto(formData, "titulo");
  if (!titulo) throw new Error("El título es obligatorio");
  return {
    codigo,
    titulo,
    tipoId: idNumerico(formData, "tipoId"),
    descripcion: textoONulo(formData, "descripcion"),
    palabrasClave: textoONulo(formData, "palabrasClave"),
    asociaciones: parsearAsociaciones(formData),
  };
}

function parsearVersion(formData: FormData): DatosVersion {
  return {
    fechaElaboracion: textoONulo(formData, "fechaElaboracion"),
    fechaRevision: textoONulo(formData, "fechaRevision"),
    fechaAprobacion: textoONulo(formData, "fechaAprobacion"),
    elaboro: textoONulo(formData, "elaboro"),
    reviso: textoONulo(formData, "reviso"),
    aprobo: textoONulo(formData, "aprobo"),
    resumenCambios: textoONulo(formData, "resumenCambios"),
  };
}

export async function crearDocumentoAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, "documentos.administrar", async (usuarioId) => {
    const datos = await parsearDocumento(formData);
    await crearDocumento(datos, usuarioId);
    return `/admin/documentos/${datos.codigo}`;
  });
}

export async function editarDocumentoAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, "documentos.administrar", async (usuarioId) => {
    const datos = await parsearDocumento(formData);
    await editarMetadatos(idNumerico(formData, "documentoId"), datos, usuarioId);
    return `/admin/documentos/${datos.codigo}`;
  });
}

export async function crearVersionAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, "documentos.administrar", async (usuarioId) => {
    await crearVersionBorrador(idNumerico(formData, "documentoId"), usuarioId);
  });
}

export async function editarVersionAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, "documentos.administrar", async (usuarioId) => {
    await editarVersionBorrador(
      idNumerico(formData, "versionId"),
      parsearVersion(formData),
      usuarioId,
    );
  });
}

export async function publicarAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, "documentos.administrar", async (usuarioId) => {
    await publicarVersion(idNumerico(formData, "versionId"), usuarioId);
  });
}

export async function anularAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, "documentos.administrar", async (usuarioId) => {
    await anularVigente(idNumerico(formData, "documentoId"), usuarioId);
  });
}
