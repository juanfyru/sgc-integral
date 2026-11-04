"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { comprobarLimite, idNumerico, mutacion, valoresDeFormulario, type EstadoAccion } from "@/app/admin/comun";
import {
  cambiarActivo,
  crearUsuario,
  crearUsuariosEnLote,
  type ResultadoLote,
  desbloquearUsuario,
  editarUsuario,
  obtenerUsuario,
  quitarSegundoFactor,
  restablecerClave,
} from "@/db/consultas/usuarios";
import { obtenerSql } from "@/db/cliente";
import { listarCargos } from "@/db/consultas/estructura";
import { normalizar, parsearLoteCsv, type Catalogo } from "@/lib/lote-usuarios";
import { registrarAcceso } from "@/db/consultas/autenticacion";
import { registrarAuditoria } from "@/db/consultas/admin";
import { cerrarSesionPorId } from "@/lib/sesion";
import { z } from "zod";
import { generarClaveTemporal } from "@/lib/clave-politica";
import { parsearUsuario } from "@/lib/esquemas/usuarios";
import { ipDePeticion } from "@/lib/ip";
import { ErrorPermiso, requerirPermiso } from "@/lib/permisos";
import { requerirSesion } from "@/lib/sesion-actual";

export type EstadoCreacion =
  | EstadoAccion
  | { ok: true; id: number; usuario: string; claveTemporal: string };

export type EstadoRestablecer = EstadoAccion | { ok: true; claveTemporal: string };

const RUTA = "/admin/usuarios";

// La clave temporal viaja solo en el estado devuelto a la pantalla: nunca en la URL ni en el log.
export async function crearUsuarioAccion(_prev: EstadoCreacion, formData: FormData): Promise<EstadoCreacion> {
  const sesion = await requerirSesion();
  try {
    requerirPermiso(sesion, "usuarios.administrar");
  } catch (err) {
    if (err instanceof ErrorPermiso) return { ok: false, error: err.message };
    throw err;
  }
  const limitado = comprobarLimite(sesion, formData);
  if (limitado) return limitado;
  try {
    const datos = parsearUsuario(formData);
    const claveTemporal = generarClaveTemporal();
    const { id } = await crearUsuario(datos, claveTemporal, sesion.usuarioId);
    revalidatePath("/", "layout");
    return { ok: true, id, usuario: datos.usuario, claveTemporal };
  } catch (err) {
    return { ok: false, error: (err as Error).message, valores: valoresDeFormulario(formData) };
  }
}

// `_prev` con el tipo de creación para compartir FormularioUsuario con crearUsuarioAccion.
// El nombre de usuario es inmutable: el formulario lo envía de solo lectura y aquí se verifica que no cambió.
export async function editarUsuarioAccion(_prev: EstadoCreacion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "usuarios.administrar", async (actorId) => {
    const id = idNumerico(formData, "id");
    const { usuario, ...datos } = parsearUsuario(formData);
    const actual = await obtenerUsuario(id);
    if (!actual) throw new Error("El usuario no existe");
    if (actual.usuario !== usuario) throw new Error("El nombre de usuario no se puede cambiar");
    await editarUsuario(id, datos, actorId);
    return `${RUTA}/${id}`;
  });
}

export async function cambiarActivoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "usuarios.administrar", async (actorId) => {
    await cambiarActivo(idNumerico(formData, "id"), formData.get("activo") === "true", actorId);
  });
}

export async function desbloquearAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "usuarios.administrar", async (actorId) => {
    const cabeceras = await headers();
    await desbloquearUsuario(idNumerico(formData, "id"), actorId, {
      ip: ipDePeticion(cabeceras),
      userAgent: cabeceras.get("user-agent"),
    });
  });
}

export async function quitarFactorAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "usuarios.administrar", async (actorId) => {
    await quitarSegundoFactor(idNumerico(formData, "id"), actorId);
  });
}

export async function restablecerClaveAccion(
  _prev: EstadoRestablecer,
  formData: FormData,
): Promise<EstadoRestablecer> {
  const sesion = await requerirSesion();
  try {
    requerirPermiso(sesion, "usuarios.administrar");
  } catch (err) {
    if (err instanceof ErrorPermiso) return { ok: false, error: err.message };
    throw err;
  }
  const limitado = comprobarLimite(sesion);
  if (limitado) return limitado;
  try {
    const cabeceras = await headers();
    const { claveTemporal } = await restablecerClave(idNumerico(formData, "id"), sesion.usuarioId, {
      ip: ipDePeticion(cabeceras),
      userAgent: cabeceras.get("user-agent"),
    });
    revalidatePath("/", "layout");
    return { ok: true, claveTemporal };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export type EstadoLote = EstadoAccion | { ok: true; resultado: ResultadoLote };

const TOPE_ARCHIVO_LOTE = 1024 * 1024;

// El archivo no se guarda en ningún sitio. Las claves temporales viajan solo en el estado devuelto.
export async function crearLoteAccion(_prev: EstadoLote, formData: FormData): Promise<EstadoLote> {
  const sesion = await requerirSesion();
  try {
    requerirPermiso(sesion, "usuarios.administrar");
  } catch (err) {
    if (err instanceof ErrorPermiso) return { ok: false, error: err.message };
    throw err;
  }
  const limitado = comprobarLimite(sesion);
  if (limitado) return limitado;
  try {
    const archivo = formData.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) throw new Error("Seleccione un archivo CSV");
    if (archivo.size > TOPE_ARCHIVO_LOTE) throw new Error("El archivo supera 1 MB");
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    if (bytes.includes(0)) throw new Error("El archivo debe ser un CSV de texto");
    let texto: string;
    try {
      texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error('El archivo debe estar codificado en UTF-8 (en Excel: "CSV UTF-8")');
    }
    const [cargos, procesos] = await Promise.all([
      listarCargos(),
      obtenerSql()`SELECT id, sigla FROM procesos WHERE activo`,
    ]);
    const catalogo: Catalogo = {
      cargos: new Map(cargos.filter((c) => c.activo).map((c) => [normalizar(c.nombre), c.id])),
      procesos: new Map(procesos.map((p) => [String(p.sigla).toUpperCase(), Number(p.id)])),
    };
    const { validas, invalidas } = parsearLoteCsv(texto, catalogo);
    const creacion = await crearUsuariosEnLote(validas, sesion.usuarioId, invalidas);
    revalidatePath("/", "layout");
    return { ok: true, resultado: creacion };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

const esquemaSesionId = z.object({ sesionId: z.string().regex(/^[0-9a-f]{64}$/) }).strict();

// Cierre forzado de la sesión de otra persona. No cierra la propia (para eso está "Cerrar sesión").
export async function cerrarSesionAccion(formData: FormData): Promise<void> {
  const sesion = await requerirSesion();
  requerirPermiso(sesion, "sesiones.administrar");
  const parsed = esquemaSesionId.safeParse({ sesionId: formData.get("sesionId") });
  if (!parsed.success) throw new Error("Sesión no válida");
  const { sesionId } = parsed.data;
  if (sesionId === sesion.sesionId) throw new Error("No puede cerrar su propia sesión desde aquí");
  if (comprobarLimite(sesion)) throw new Error("Demasiadas operaciones seguidas. Espere un minuto.");

  const cerrado = await cerrarSesionPorId(sesionId);
  if (!cerrado) {
    revalidatePath("/admin/sesiones");
    return;
  }
  const sql = obtenerSql();
  const [persona] = await sql`SELECT usuario FROM usuarios WHERE id = ${cerrado.usuarioId}`;
  const usuario = (persona?.usuario as string | undefined) ?? `#${cerrado.usuarioId}`;
  const cabeceras = await headers();
  await registrarAcceso({
    usuarioId: cerrado.usuarioId,
    usuarioTexto: usuario,
    resultado: "cierre_forzado",
    ip: ipDePeticion(cabeceras),
    userAgent: cabeceras.get("user-agent"),
  });
  await registrarAuditoria(sql, {
    usuarioId: sesion.usuarioId,
    accion: "cerrar_sesion_forzado",
    entidad: "usuario",
    entidadId: cerrado.usuarioId,
    detalle: { usuario },
  });
  revalidatePath("/admin/sesiones");
}
