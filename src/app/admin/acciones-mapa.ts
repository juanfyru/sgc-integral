"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  idNumerico,
  mutacion,
  texto,
  type EstadoAccion,
} from "@/app/admin/comun";
import { NOMBRES_ICONO } from "@/componentes/iconos";
import {
  alternarActivo,
  borrar,
  CLAVES_TEXTO,
  crearPeriferico,
  crearTipo,
  editarPeriferico,
  editarTipo,
  guardarTextos,
  mover,
  TABLAS_MAPA,
  type Tabla,
} from "@/db/consultas/mapa-admin";
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
