import { obtenerSql } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import type { EstadoBloqueo } from "@/lib/bloqueo";
import type { Rol } from "@/lib/roles";

export type UsuarioParaIngreso = {
  id: number;
  usuario: string;
  nombre: string;
  hashClave: string;
  activo: boolean;
  rol: Rol;
  totpActivo: boolean;
  totpSecretoCifrado: string | null;
} & EstadoBloqueo;

import type { Row } from "postgres";

function aUsuarioParaIngreso(f: Row): UsuarioParaIngreso {
  return {
    id: Number(f.id),
    usuario: f.usuario,
    nombre: f.nombre,
    hashClave: f.hash_clave,
    activo: f.activo,
    rol: f.rol,
    totpActivo: f.totp_activo,
    totpSecretoCifrado: f.totp_secreto_cifrado,
    intentosFallidos: f.intentos_fallidos,
    bloqueosConsecutivos: f.bloqueos_consecutivos,
    bloqueadoHasta: f.bloqueado_hasta ? new Date(f.bloqueado_hasta) : null,
  };
}

/** Busca por usuario sin distinguir mayúsculas, esté activo o no (el llamador decide). */
export async function buscarParaIngreso(
  usuario: string,
): Promise<UsuarioParaIngreso | null> {
  const [f] = await obtenerSql()`
    SELECT id, usuario, nombre, hash_clave, activo, rol, totp_activo,
           totp_secreto_cifrado, intentos_fallidos, bloqueos_consecutivos, bloqueado_hasta
    FROM usuarios WHERE lower(usuario) = lower(${usuario})`;
  return f ? aUsuarioParaIngreso(f) : null;
}

/** Relee el estado de la cuenta por id (dentro del candado, antes de decidir). */
export async function buscarParaIngresoPorId(
  id: number,
): Promise<UsuarioParaIngreso | null> {
  const [f] = await obtenerSql()`
    SELECT id, usuario, nombre, hash_clave, activo, rol, totp_activo,
           totp_secreto_cifrado, intentos_fallidos, bloqueos_consecutivos, bloqueado_hasta
    FROM usuarios WHERE id = ${id}`;
  return f ? aUsuarioParaIngreso(f) : null;
}

export async function guardarEstadoBloqueo(
  usuarioId: number,
  estado: EstadoBloqueo,
): Promise<void> {
  await obtenerSql()`UPDATE usuarios SET intentos_fallidos = ${estado.intentosFallidos},
    bloqueos_consecutivos = ${estado.bloqueosConsecutivos},
    bloqueado_hasta = ${estado.bloqueadoHasta}
    WHERE id = ${usuarioId}`;
}

export type ResultadoAcceso =
  | "ingreso" | "salida" | "fallo" | "bloqueo"
  | "desbloqueo" | "restablecimiento" | "factor_fallo" | "cierre_forzado";

export type Acceso = {
  usuarioId: number | null;
  usuarioTexto: string;
  resultado: ResultadoAcceso;
  ip: string | null;
  userAgent: string | null;
};

export async function registrarAcceso(a: Acceso): Promise<void> {
  await obtenerSql()`INSERT INTO accesos (usuario_id, usuario_texto, resultado, ip, user_agent)
    VALUES (${a.usuarioId}, ${a.usuarioTexto}, ${a.resultado}, ${a.ip}, ${a.userAgent})`;
}

/** Nueva clave: limpia el cambio obligatorio y cierra las demás sesiones del usuario. */
export async function cambiarClaveDeUsuario(
  usuarioId: number,
  hashNuevo: string,
  conservarSesionId: string | null,
): Promise<void> {
  await obtenerSql().begin(async (tx) => {
    await tx`UPDATE usuarios SET hash_clave = ${hashNuevo}, debe_cambiar_clave = false,
      actualizado_en = now() WHERE id = ${usuarioId}`;
    if (conservarSesionId) {
      await tx`DELETE FROM sesiones WHERE usuario_id = ${usuarioId} AND id <> ${conservarSesionId}`;
    } else {
      await tx`DELETE FROM sesiones WHERE usuario_id = ${usuarioId}`;
    }
    await registrarAuditoria(tx, {
      usuarioId, accion: "cambiar_clave", entidad: "usuario", entidadId: usuarioId,
    });
  });
}

export async function aceptarAvisoDatos(usuarioId: number): Promise<void> {
  await obtenerSql().begin(async (tx) => {
    await tx`UPDATE usuarios SET acepto_datos_en = now(), actualizado_en = now()
      WHERE id = ${usuarioId}`;
    await registrarAuditoria(tx, {
      usuarioId, accion: "aceptar_aviso_datos", entidad: "usuario", entidadId: usuarioId,
    });
  });
}

/** Guarda el secreto aún sin confirmar: el segundo factor no se exige hasta activarlo. */
export async function guardarSecretoTotpPendiente(
  usuarioId: number,
  secretoCifrado: string,
): Promise<void> {
  await obtenerSql()`UPDATE usuarios SET totp_secreto_cifrado = ${secretoCifrado},
    totp_activo = false, actualizado_en = now() WHERE id = ${usuarioId}`;
}

export async function obtenerSecretoTotp(
  usuarioId: number,
): Promise<{ secretoCifrado: string | null; activo: boolean }> {
  const [f] = await obtenerSql()`SELECT totp_secreto_cifrado, totp_activo
    FROM usuarios WHERE id = ${usuarioId}`;
  return { secretoCifrado: f?.totp_secreto_cifrado ?? null, activo: f?.totp_activo ?? false };
}

export async function activarTotp(
  usuarioId: number,
  hashesRecuperacion: string[],
): Promise<void> {
  await obtenerSql().begin(async (tx) => {
    await tx`UPDATE usuarios SET totp_activo = true, actualizado_en = now()
      WHERE id = ${usuarioId}`;
    await tx`DELETE FROM codigos_recuperacion WHERE usuario_id = ${usuarioId}`;
    for (const hash of hashesRecuperacion) {
      await tx`INSERT INTO codigos_recuperacion (usuario_id, hash) VALUES (${usuarioId}, ${hash})`;
    }
    await registrarAuditoria(tx, {
      usuarioId, accion: "activar_segundo_factor", entidad: "usuario", entidadId: usuarioId,
    });
  });
}

/**
 * `actorId` quien lo hace (el propio usuario o un admin); la auditoría lo registra a él.
 * Si lo quita un administrador, se cierran todas las sesiones de la persona: el caso
 * típico es un teléfono perdido o robado, quizá con una sesión abierta.
 */
export async function desactivarTotp(usuarioId: number, actorId: number): Promise<void> {
  await obtenerSql().begin(async (tx) => {
    const [afectado] = await tx`UPDATE usuarios SET totp_activo = false, totp_secreto_cifrado = NULL,
      actualizado_en = now() WHERE id = ${usuarioId} RETURNING usuario`;
    await tx`DELETE FROM codigos_recuperacion WHERE usuario_id = ${usuarioId}`;
    if (actorId !== usuarioId) await tx`DELETE FROM sesiones WHERE usuario_id = ${usuarioId}`;
    await registrarAuditoria(tx, {
      usuarioId: actorId, accion: "quitar_segundo_factor", entidad: "usuario",
      entidadId: usuarioId,
      // Si lo quita un administrador, la bitácora nombra a la persona afectada.
      ...(actorId !== usuarioId && afectado ? { detalle: { usuario: afectado.usuario as string } } : {}),
    });
  });
}

/** Marca el código como usado solo si existe y no se había usado (atómico). */
export async function consumirCodigoRecuperacion(
  usuarioId: number,
  hash: string,
): Promise<boolean> {
  const filas = await obtenerSql()`UPDATE codigos_recuperacion SET usado_en = now()
    WHERE usuario_id = ${usuarioId} AND hash = ${hash} AND usado_en IS NULL
    RETURNING id`;
  return filas.length > 0;
}
