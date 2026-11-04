/**
 * Núcleo de la activación y desactivación del segundo factor, sin contexto de
 * petición (las Server Actions solo resuelven la sesión y delegan aquí).
 */
import type { EstadoAccion } from "@/app/admin/comun";
import {
  activarTotp,
  buscarParaIngresoPorId,
  desactivarTotp,
  obtenerSecretoTotp,
} from "@/db/consultas/autenticacion";
import { claveCandadoUsuario, conCandado } from "@/lib/candado";
import { verificarClave } from "@/lib/clave";
import { descifrar } from "@/lib/cifrado";
import { puedeDesactivarTotp } from "@/lib/cuenta-estado";
import { crearLimitador } from "@/lib/limite";
import type { Rol } from "@/lib/roles";
import { generarCodigosRecuperacion, hashCodigoRecuperacion, verificarTotp } from "@/lib/totp";

export type EstadoFactor = EstadoAccion | { ok: true; codigos: string[] };

// Quien tiene una sesión robada no debe poder adivinar la clave actual desde aquí.
export const permitirVerificacionDeClave = crearLimitador({ limite: 10, ventanaMs: 15 * 60_000 });

export const MENSAJE_SECRETO_ILEGIBLE =
  "No se pudo leer el segundo factor; pida al administrador que lo restablezca.";

/** Verifica la clave actual de la cuenta aplicando el límite; devuelve el error o null. */
export async function comprobarClaveActual(
  usuarioId: number,
  clave: string,
  mensajeIncorrecta: string,
): Promise<string | null> {
  if (!permitirVerificacionDeClave(String(usuarioId))) {
    return "Demasiados intentos. Espere unos minutos.";
  }
  const usuario = await buscarParaIngresoPorId(usuarioId);
  if (!usuario || !(await verificarClave(usuario.hashClave, clave))) return mensajeIncorrecta;
  return null;
}

/** Confirma el secreto pendiente con clave actual + código; entrega los códigos de recuperación. */
export async function confirmarSegundoFactor(datos: {
  usuarioId: number;
  clave: string;
  codigo: string;
}): Promise<EstadoFactor> {
  const errorClave = await comprobarClaveActual(datos.usuarioId, datos.clave, "Clave incorrecta");
  if (errorClave) return { ok: false, error: errorClave };

  return conCandado(claveCandadoUsuario(datos.usuarioId), async (): Promise<EstadoFactor> => {
    const { secretoCifrado, activo } = await obtenerSecretoTotp(datos.usuarioId);
    if (activo) return { ok: false, error: "El segundo factor ya está activo." };
    if (!secretoCifrado) {
      return { ok: false, error: "Primero inicie la activación del segundo factor." };
    }
    let secreto: string;
    try {
      secreto = descifrar(secretoCifrado);
    } catch {
      console.error("No se pudo descifrar el secreto TOTP del usuario", datos.usuarioId);
      return { ok: false, error: MENSAJE_SECRETO_ILEGIBLE };
    }
    if (!verificarTotp(secreto, datos.codigo)) return { ok: false, error: "Código incorrecto" };

    const codigos = generarCodigosRecuperacion(8);
    await activarTotp(datos.usuarioId, codigos.map(hashCodigoRecuperacion));
    return { ok: true, codigos };
  });
}

/** Quita el segundo factor activo tras confirmar la clave; no audita si no había nada que quitar. */
export async function quitarSegundoFactor(datos: {
  usuarioId: number;
  rol: Rol;
  clave: string;
}): Promise<EstadoAccion> {
  if (!puedeDesactivarTotp(datos.rol)) {
    return { ok: false, error: "Su rol exige segundo factor; no puede desactivarlo." };
  }
  const errorClave = await comprobarClaveActual(datos.usuarioId, datos.clave, "La clave no es correcta");
  if (errorClave) return { ok: false, error: errorClave };

  return conCandado(claveCandadoUsuario(datos.usuarioId), async (): Promise<EstadoAccion> => {
    const { activo } = await obtenerSecretoTotp(datos.usuarioId);
    if (!activo) return { ok: false, error: "El segundo factor no está activo." };
    await desactivarTotp(datos.usuarioId, datos.usuarioId);
    return null;
  });
}
