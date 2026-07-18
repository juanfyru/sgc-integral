"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  idNumerico,
  mutacion,
  texto,
  textoONulo,
  type EstadoAccion,
} from "@/app/admin/comun";
import { NOMBRES_ICONO } from "@/componentes/iconos";
import {
  alternarActivo,
  borrar,
  CLAVES_TEXTO,
  crearMacroproceso,
  crearPeriferico,
  crearProceso,
  crearSubproceso,
  crearTipo,
  editarMacroproceso,
  editarPeriferico,
  editarProceso,
  editarSubproceso,
  editarTipo,
  guardarTextos,
  mover,
  TABLAS_MAPA,
  type Tabla,
} from "@/db/consultas/mapa-admin";
import { generarSlug } from "@/lib/slug";
import { requerirSesion } from "@/lib/sesion-actual";
import { validarIcono, validarSigla } from "@/lib/validaciones-mapa";

// ── Acciones genéricas de fila (la tabla llega del formulario y se valida) ──

function tablaValida(v: FormDataEntryValue | null): Tabla {
  const t = String(v);
  if (!(TABLAS_MAPA as readonly string[]).includes(t)) {
    throw new Error("Tabla no permitida");
  }
  return t as Tabla;
}

export async function moverAccion(formData: FormData): Promise<void> {
  const sesion = await requerirSesion();
  const dir = String(formData.get("direccion"));
  if (dir !== "arriba" && dir !== "abajo") throw new Error("Dirección inválida");
  await mover(tablaValida(formData.get("tabla")), idNumerico(formData, "id"), dir, sesion.usuarioId);
  revalidatePath("/", "layout");
}

export async function alternarAccion(formData: FormData): Promise<void> {
  const sesion = await requerirSesion();
  await alternarActivo(
    tablaValida(formData.get("tabla")),
    idNumerico(formData, "id"),
    formData.get("activo") === "true",
    sesion.usuarioId,
  );
  revalidatePath("/", "layout");
}

export async function borrarAccion(formData: FormData): Promise<void> {
  const sesion = await requerirSesion();
  await borrar(tablaValida(formData.get("tabla")), idNumerico(formData, "id"), sesion.usuarioId);
  revalidatePath("/", "layout");
  redirect(String(formData.get("volverA") || "/admin/mapa"));
}

// ── Tipos de documento ──

function parsearTipo(formData: FormData) {
  const nombre = texto(formData, "nombre");
  if (!nombre) throw new Error("El nombre es obligatorio");
  return {
    nombre,
    sigla: validarSigla(texto(formData, "sigla")),
    esDiligenciable: formData.get("esDiligenciable") === "on",
  };
}

export async function crearTipoAccion(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    await crearTipo(parsearTipo(formData), usuarioId);
    return "/admin/tipos";
  });
}

export async function editarTipoAccion(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    await editarTipo(idNumerico(formData, "id"), parsearTipo(formData), usuarioId);
    return "/admin/tipos";
  });
}

// ── Textos institucionales ──

export async function guardarTextosAccion(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    const valores: Record<string, string> = {};
    for (const { clave } of CLAVES_TEXTO) valores[clave] = texto(formData, clave);
    await guardarTextos(valores, usuarioId);
    return "/admin/mapa/textos";
  });
}

// ── Elementos periféricos ──

function parsearPeriferico(formData: FormData) {
  const iconoBruto = texto(formData, "icono");
  return {
    tipo: texto(formData, "tipo"),
    texto: texto(formData, "texto"),
    icono: iconoBruto ? validarIcono(iconoBruto, NOMBRES_ICONO) : null,
  };
}

export async function crearPerifericoAccion(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    await crearPeriferico(parsearPeriferico(formData), usuarioId);
    return "/admin/mapa/perifericos";
  });
}

export async function editarPerifericoAccion(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    await editarPeriferico(idNumerico(formData, "id"), parsearPeriferico(formData), usuarioId);
    return "/admin/mapa/perifericos";
  });
}

// ── Macroprocesos ──

function parsearMacroproceso(formData: FormData) {
  const nombre = texto(formData, "nombre");
  const slugManual = texto(formData, "slug");
  return {
    letra: texto(formData, "letra"),
    nombre,
    banda: texto(formData, "banda"),
    color: texto(formData, "color"),
    icono: validarIcono(texto(formData, "icono"), NOMBRES_ICONO),
    slug: slugManual || generarSlug(nombre),
  };
}

export async function crearMacroprocesoAccion(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    await crearMacroproceso(parsearMacroproceso(formData), usuarioId);
    return "/admin/mapa";
  });
}

export async function editarMacroprocesoAccion(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    await editarMacroproceso(idNumerico(formData, "id"), parsearMacroproceso(formData), usuarioId);
    return "/admin/mapa";
  });
}

// ── Procesos ──

function parsearProceso(formData: FormData) {
  const nombre = texto(formData, "nombre");
  const slugManual = texto(formData, "slug");
  return {
    macroprocesoId: idNumerico(formData, "macroprocesoId"),
    nombre,
    sigla: texto(formData, "sigla"),
    icono: validarIcono(texto(formData, "icono"), NOMBRES_ICONO),
    descripcion: textoONulo(formData, "descripcion"),
    slug: slugManual || generarSlug(nombre),
  };
}

export async function crearProcesoAccion(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    await crearProceso(parsearProceso(formData), usuarioId);
    return `/admin/mapa/macroprocesos/${idNumerico(formData, "macroprocesoId")}`;
  });
}

export async function editarProcesoAccion(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    await editarProceso(idNumerico(formData, "id"), parsearProceso(formData), usuarioId);
    return `/admin/mapa/macroprocesos/${idNumerico(formData, "macroprocesoId")}`;
  });
}

// ── Subprocesos ──

function parsearSubproceso(formData: FormData) {
  const nombre = texto(formData, "nombre");
  const slugManual = texto(formData, "slug");
  return {
    procesoId: idNumerico(formData, "procesoId"),
    nombre,
    slug: slugManual || generarSlug(nombre),
  };
}

export async function crearSubprocesoAccion(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    await crearSubproceso(parsearSubproceso(formData), usuarioId);
    return `/admin/mapa/procesos/${idNumerico(formData, "procesoId")}`;
  });
}

export async function editarSubprocesoAccion(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    await editarSubproceso(idNumerico(formData, "id"), parsearSubproceso(formData), usuarioId);
    return `/admin/mapa/procesos/${idNumerico(formData, "procesoId")}`;
  });
}
