"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  idNumerico,
  mutacion,
  texto,
  textoONulo,
  type EstadoAccion,
} from "@/app/admin/comun";
import { obtenerSql } from "@/db/cliente";
import {
  anularVigente,
  crearDocumento,
  crearVersionBorrador,
  editarMetadatos,
  editarVersionBorrador,
  obtenerPatronCodigo,
  publicarVersion,
  registrarAuditoria,
  type AsociacionEntrada,
  type DatosDocumento,
  type DatosVersion,
} from "@/db/consultas/admin";
import { ipDePeticion } from "@/db/consultas/eventos";
import { hashearClave, verificarClave } from "@/lib/clave";
import { crearLimitador } from "@/lib/limite";
import { cerrarSesion, crearSesion, COOKIE_SESION } from "@/lib/sesion";
import { requerirSesion } from "@/lib/sesion-actual";

export type { EstadoAccion } from "@/app/admin/comun";

// 5 intentos de login por minuto por IP: frena fuerza bruta sin castigar
// un dedazo. Instancia única en el NAS — el Map en memoria basta (D36).
const permitirIngreso = crearLimitador({ limite: 5, ventanaMs: 60_000 });

const ERROR_CREDENCIALES: EstadoAccion = {
  ok: false,
  error: "Usuario o clave incorrectos",
};

export async function ingresar(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const usuario = String(formData.get("usuario") ?? "").trim();
  const clave = String(formData.get("clave") ?? "");
  if (!usuario || !clave) return ERROR_CREDENCIALES;

  const ip = ipDePeticion(await headers());
  if (!permitirIngreso(ip)) {
    return { ok: false, error: "Demasiados intentos. Espere un minuto." };
  }

  const sql = obtenerSql();
  const [fila] = await sql`SELECT id, nombre, hash_clave FROM usuarios
    WHERE usuario = ${usuario} AND activo`;
  if (!fila) {
    // Mismo costo que verificar: no se puede distinguir por tiempo si el
    // usuario existe (enumeración).
    await hashearClave(clave);
    return ERROR_CREDENCIALES;
  }
  if (!(await verificarClave(fila.hash_clave, clave))) return ERROR_CREDENCIALES;

  const { token } = await crearSesion(fila.id, {
    ip,
    userAgent: (await headers()).get("user-agent"),
  });
  (await cookies()).set(COOKIE_SESION, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // La cookie dura más que la sesión a propósito: la BD es la fuente de
    // verdad (12 h deslizantes); un token vencido simplemente no valida.
    maxAge: 60 * 60 * 24 * 7,
  });
  await registrarAuditoria(sql, {
    usuarioId: fila.id, accion: "ingreso", entidad: "sesion",
    detalle: { ip },
  });
  redirect("/admin");
}

export async function salir(): Promise<void> {
  const sesion = await requerirSesion();
  const almacen = await cookies();
  const token = almacen.get(COOKIE_SESION)?.value;
  if (token) await cerrarSesion(token);
  almacen.delete(COOKIE_SESION);
  await registrarAuditoria(obtenerSql(), {
    usuarioId: sesion.usuarioId, accion: "salida", entidad: "sesion",
  });
  redirect("/admin/ingreso");
}

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
  return mutacion(formData, async (usuarioId) => {
    const datos = await parsearDocumento(formData);
    await crearDocumento(datos, usuarioId);
    return `/admin/documentos/${datos.codigo}`;
  });
}

export async function editarDocumentoAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    const datos = await parsearDocumento(formData);
    await editarMetadatos(idNumerico(formData, "documentoId"), datos, usuarioId);
    return `/admin/documentos/${datos.codigo}`;
  });
}

export async function crearVersionAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    await crearVersionBorrador(idNumerico(formData, "documentoId"), usuarioId);
  });
}

export async function editarVersionAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
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
  return mutacion(formData, async (usuarioId) => {
    await publicarVersion(idNumerico(formData, "versionId"), usuarioId);
  });
}

export async function anularAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    await anularVigente(idNumerico(formData, "documentoId"), usuarioId);
  });
}
