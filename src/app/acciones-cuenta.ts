"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { EstadoAccion } from "@/app/admin/comun";
import {
  buscarParaIngreso,
  consumirCodigoRecuperacion,
  guardarEstadoBloqueo,
  registrarAcceso,
  type ResultadoAcceso,
} from "@/db/consultas/autenticacion";
import { SIN_BLOQUEO, estaBloqueado, estadoTrasFallo } from "@/lib/bloqueo";
import { descifrar } from "@/lib/cifrado";
import { hashearClave, verificarClave } from "@/lib/clave";
import { EsquemaCodigoFactor, EsquemaIngreso } from "@/lib/esquemas/cuenta";
import { ipDePeticion } from "@/lib/ip";
import { crearLimitador } from "@/lib/limite";
import { rutaInterna } from "@/lib/rutas";
import {
  cerrarSesion,
  confirmarSegundoFactor,
  crearSesion,
  COOKIE_SESION,
} from "@/lib/sesion";
import { sesionActual } from "@/lib/sesion-actual";
import { hashCodigoRecuperacion, verificarTotp } from "@/lib/totp";
import { ErrorValidacion, parsearFormulario } from "@/lib/validacion";

export type { EstadoAccion } from "@/app/admin/comun";

// Instancia única en el NAS: los límites viven en memoria (sin Redis).
const permitirIngresoPorIp = crearLimitador({ limite: 30, ventanaMs: 60_000 });
const permitirIntentoFactor = crearLimitador({ limite: 5, ventanaMs: 10 * 60_000 });

const ERROR_CREDENCIALES: EstadoAccion = {
  ok: false,
  error: "Usuario o clave incorrectos",
};

function horaDeDesbloqueo(hasta: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: process.env.ZONA_HORARIA ?? "America/Bogota",
  }).format(hasta);
}

async function contextoDePeticion() {
  const cabeceras = await headers();
  return { ip: ipDePeticion(cabeceras), userAgent: cabeceras.get("user-agent") };
}

function errorDeFormulario(err: unknown): EstadoAccion {
  if (err instanceof ErrorValidacion) return { ok: false, error: err.message };
  throw err;
}

export async function ingresar(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  let datos;
  try {
    datos = parsearFormulario(formData, EsquemaIngreso);
  } catch (err) {
    return errorDeFormulario(err);
  }
  const { usuario: usuarioTexto, clave, volver } = datos;
  const { ip, userAgent } = await contextoDePeticion();
  const registrar = (usuarioId: number | null, resultado: ResultadoAcceso) =>
    registrarAcceso({ usuarioId, usuarioTexto, resultado, ip, userAgent });

  if (ip && !permitirIngresoPorIp(ip)) {
    return { ok: false, error: "Demasiados intentos desde esta red. Espere un minuto." };
  }

  const u = await buscarParaIngreso(usuarioTexto);
  if (!u || !u.activo) {
    // Mismo costo que verificar: no se distingue por tiempo si el usuario existe.
    await hashearClave(clave);
    await registrar(u?.id ?? null, "fallo");
    return ERROR_CREDENCIALES;
  }

  const ahora = new Date();
  if (!(await verificarClave(u.hashClave, clave))) {
    // Con la cuenta ya bloqueada el fallo se registra pero no cambia el estado (R16).
    const nuevo = estadoTrasFallo(u, ahora);
    if (nuevo !== u) await guardarEstadoBloqueo(u.id, nuevo);
    const recienBloqueada = !estaBloqueado(u, ahora) && estaBloqueado(nuevo, ahora);
    await registrar(u.id, recienBloqueada ? "bloqueo" : "fallo");
    return ERROR_CREDENCIALES;
  }

  if (estaBloqueado(u, ahora)) {
    await registrar(u.id, "fallo");
    return {
      ok: false,
      error: `Cuenta bloqueada hasta las ${horaDeDesbloqueo(u.bloqueadoHasta!)} por intentos fallidos. Si no fue usted, avise al administrador.`,
    };
  }

  await guardarEstadoBloqueo(u.id, SIN_BLOQUEO);
  const { token } = await crearSesion(u.id, { ip, userAgent, factorPendiente: u.totpActivo });
  (await cookies()).set(COOKIE_SESION, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // La cookie dura más que la sesión a propósito: la BD es la fuente de
    // verdad (12 h deslizantes); un token vencido simplemente no valida.
    maxAge: 60 * 60 * 24 * 7,
  });

  const destino = rutaInterna(volver);
  if (u.totpActivo) {
    redirect(`/ingreso/verificar?volver=${encodeURIComponent(destino)}`);
  }
  await registrar(u.id, "ingreso");
  redirect(destino);
}

export async function verificarFactor(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const sesion = await sesionActual();
  if (!sesion || !sesion.factorPendiente) redirect("/ingreso");

  let datos;
  try {
    datos = parsearFormulario(formData, EsquemaCodigoFactor);
  } catch (err) {
    return errorDeFormulario(err);
  }
  const { ip, userAgent } = await contextoDePeticion();
  const registrar = (resultado: ResultadoAcceso) =>
    registrarAcceso({
      usuarioId: sesion.usuarioId,
      usuarioTexto: sesion.usuario,
      resultado,
      ip,
      userAgent,
    });

  // Cinco intentos por sesión pendiente; el sexto cierra la sesión.
  if (!permitirIntentoFactor(sesion.sesionId)) {
    const almacen = await cookies();
    const token = almacen.get(COOKIE_SESION)?.value;
    if (token) await cerrarSesion(token);
    almacen.delete(COOKIE_SESION);
    await registrar("factor_fallo");
    redirect("/ingreso?motivo=factor");
  }

  const codigo = datos.codigo.replace(/[\s-]/g, "");
  let correcto = false;
  if (/^\d{6}$/.test(codigo)) {
    const u = await buscarParaIngreso(sesion.usuario);
    correcto =
      !!u?.totpSecretoCifrado &&
      verificarTotp(descifrar(u.totpSecretoCifrado), codigo);
  } else {
    correcto = await consumirCodigoRecuperacion(
      sesion.usuarioId,
      hashCodigoRecuperacion(codigo),
    );
  }
  if (!correcto) {
    await registrar("factor_fallo");
    return { ok: false, error: "Código incorrecto" };
  }

  await confirmarSegundoFactor(sesion.sesionId);
  await registrar("ingreso");
  redirect(rutaInterna(datos.volver));
}

/** Sirve para cualquier sesión existente, también con factor o pasos de cuenta pendientes. */
export async function salir(): Promise<void> {
  const sesion = await sesionActual();
  const almacen = await cookies();
  const token = almacen.get(COOKIE_SESION)?.value;
  if (token) await cerrarSesion(token);
  almacen.delete(COOKIE_SESION);
  if (sesion) {
    const { ip, userAgent } = await contextoDePeticion();
    await registrarAcceso({
      usuarioId: sesion.usuarioId,
      usuarioTexto: sesion.usuario,
      resultado: "salida",
      ip,
      userAgent,
    });
  }
  redirect("/ingreso");
}
