"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { EstadoAccion } from "@/app/admin/comun";
import {
  aceptarAvisoDatos,
  cambiarClaveDeUsuario,
  guardarSecretoTotpPendiente,
  obtenerSecretoTotp,
  registrarAcceso,
} from "@/db/consultas/autenticacion";
import { claveCandadoUsuario, conCandado } from "@/lib/candado";
import { hashearClave } from "@/lib/clave";
import { validarClave } from "@/lib/clave-politica";
import { cifrar } from "@/lib/cifrado";
import { inscripcionBloqueada, pendienteDeCuenta } from "@/lib/cuenta-estado";
import {
  EsquemaAviso,
  EsquemaCambioClave,
  EsquemaClaveInicial,
  EsquemaClaveSola,
  EsquemaCodigoFactor,
  EsquemaConfirmarTotp,
  EsquemaIngreso,
} from "@/lib/esquemas/cuenta";
import { comprobarClaveActual, confirmarSegundoFactor, quitarSegundoFactor, type EstadoFactor } from "@/lib/segundo-factor";
import { generarSecretoTotp } from "@/lib/totp";
import { intentarFactor, intentarIngreso } from "@/lib/ingreso";
import { ipDePeticion } from "@/lib/ip";
import { crearLimitador } from "@/lib/limite";
import { rutaInterna } from "@/lib/rutas";
import { cerrarSesion, COOKIE_SESION } from "@/lib/sesion";
import { requerirSesion, sesionActual } from "@/lib/sesion-actual";
import { ErrorValidacion, parsearFormulario } from "@/lib/validacion";

export type { EstadoAccion } from "@/app/admin/comun";
export type { EstadoFactor } from "@/lib/segundo-factor";

// Instancia única en el NAS: los límites viven en memoria (sin Redis).
const permitirIngresoPorIp = crearLimitador({ limite: 30, ventanaMs: 60_000 });
const permitirIngresoIpDesconocida = crearLimitador({ limite: 120, ventanaMs: 60_000 });

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
  const { ip, userAgent } = await contextoDePeticion();

  // IP conocida: 30/min por IP. Desconocida (sin proxy): balde compartido de 120/min.
  const permitido = ip ? permitirIngresoPorIp(ip) : permitirIngresoIpDesconocida("ip-desconocida");
  if (!permitido) {
    return { ok: false, error: "Demasiados intentos desde esta red. Espere un minuto." };
  }

  const r = await intentarIngreso({ usuario: datos.usuario, clave: datos.clave, ip, userAgent });
  if (r.tipo === "error") return { ok: false, error: r.mensaje };

  (await cookies()).set(COOKIE_SESION, r.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // La cookie dura más que la sesión a propósito: la BD es la fuente de
    // verdad (12 h deslizantes); un token vencido simplemente no valida.
    maxAge: 60 * 60 * 24 * 7,
  });
  const destino = rutaInterna(datos.volver);
  if (r.factorPendiente) {
    redirect(`/ingreso/verificar?volver=${encodeURIComponent(destino)}`);
  }
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
  const r = await intentarFactor({ sesion, codigo: datos.codigo, ip, userAgent });
  if (r.tipo === "error") return { ok: false, error: r.mensaje };
  if (r.tipo === "cerrada") {
    (await cookies()).delete(COOKIE_SESION);
    redirect("/ingreso?motivo=factor");
  }
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

/** Primer paso obligatorio: reemplaza la clave temporal y conserva solo la sesión actual. */
export async function claveInicialAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const sesion = await requerirSesion({ permitirPendientes: true });
  if (!sesion.debeCambiarClave) redirect("/");

  let datos;
  try {
    datos = parsearFormulario(formData, EsquemaClaveInicial);
  } catch (err) {
    return errorDeFormulario(err);
  }
  const motivo = validarClave(datos.claveNueva, { usuario: sesion.usuario });
  if (motivo) return { ok: false, error: motivo };

  await cambiarClaveDeUsuario(sesion.usuarioId, await hashearClave(datos.claveNueva), sesion.sesionId);
  redirect("/");
}

export async function aceptarAvisoAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const sesion = await requerirSesion({ permitirPendientes: true });
  // El orden de los pasos lo fija pendienteDeCuenta: primero la clave.
  if (sesion.debeCambiarClave) redirect("/cuenta/clave-inicial");

  let datos;
  try {
    datos = parsearFormulario(formData, EsquemaAviso);
  } catch (err) {
    return errorDeFormulario(err);
  }
  if (!sesion.aceptoDatos) await aceptarAvisoDatos(sesion.usuarioId);
  redirect(rutaInterna(datos.volver));
}
/** Cambio voluntario de clave: exige la actual y conserva solo esta sesión. */
export async function cambiarClaveAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const sesion = await requerirSesion();
  let datos;
  try {
    datos = parsearFormulario(formData, EsquemaCambioClave);
  } catch (err) {
    return errorDeFormulario(err);
  }
  const errorClave = await comprobarClaveActual(sesion.usuarioId, datos.claveActual, "La clave actual no es correcta");
  if (errorClave) return { ok: false, error: errorClave };
  if (datos.claveNueva === datos.claveActual) {
    return { ok: false, error: "La clave nueva debe ser distinta de la actual" };
  }
  const motivo = validarClave(datos.claveNueva, { usuario: sesion.usuario });
  if (motivo) return { ok: false, error: motivo };

  await cambiarClaveDeUsuario(sesion.usuarioId, await hashearClave(datos.claveNueva), sesion.sesionId);
  redirect("/cuenta?aviso=clave");
}

/** Solo se inscribe el segundo factor con la cuenta al día: clave inicial y aviso van antes. */
async function sesionParaInscribir() {
  // Un rol con TOTP obligatorio debe poder inscribirse con ese paso pendiente.
  const sesion = await requerirSesion({ permitirPendientes: true });
  if (inscripcionBloqueada(pendienteDeCuenta(sesion))) throw new Error("Cuenta pendiente de completar");
  return sesion;
}

/** Genera un secreto pendiente (aún no exigido al ingresar) y lleva a mostrar el QR. */
export async function iniciarTotpAccion(): Promise<void> {
  const sesion = await sesionParaInscribir();
  await conCandado(claveCandadoUsuario(sesion.usuarioId), async () => {
    const actual = await obtenerSecretoTotp(sesion.usuarioId);
    // Con el factor activo no se pisa el secreto: primero hay que desactivarlo.
    if (!actual.activo) await guardarSecretoTotpPendiente(sesion.usuarioId, cifrar(generarSecretoTotp()));
  });
  redirect("/cuenta/segundo-factor");
}

/** Confirma el secreto pendiente con la clave y un código; entrega los códigos de recuperación (una sola vez). */
export async function confirmarTotpAccion(
  _estadoPrevio: EstadoFactor,
  formData: FormData,
): Promise<EstadoFactor> {
  const sesion = await sesionParaInscribir();
  let datos;
  try {
    datos = parsearFormulario(formData, EsquemaConfirmarTotp);
  } catch (err) {
    return errorDeFormulario(err);
  }
  return confirmarSegundoFactor({ usuarioId: sesion.usuarioId, clave: datos.clave, codigo: datos.codigo });
}

/** Quita el segundo factor tras confirmar la clave; los roles que lo exigen no pueden. */
export async function desactivarTotpAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const sesion = await requerirSesion();
  let datos;
  try {
    datos = parsearFormulario(formData, EsquemaClaveSola);
  } catch (err) {
    return errorDeFormulario(err);
  }
  const r = await quitarSegundoFactor({ usuarioId: sesion.usuarioId, rol: sesion.rol, clave: datos.clave });
  if (r) return r;
  redirect("/cuenta?aviso=factor-desactivado");
}
