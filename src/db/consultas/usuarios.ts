import { obtenerSql } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { desactivarTotp, obtenerSecretoTotp } from "@/db/consultas/autenticacion";
import { supervisoresDe } from "@/db/consultas/estructura";
import { SIN_BLOQUEO } from "@/lib/bloqueo";
import { claveCandadoUsuario, conCandado } from "@/lib/candado";
import { hashearClave } from "@/lib/clave";
import { generarClaveTemporal } from "@/lib/clave-politica";
import type { Rol } from "@/lib/roles";

export type DatosUsuario = {
  usuario: string;
  nombre: string;
  correo: string | null;
  rol: Rol;
  cargoId: number | null;
  jefeInmediatoId: number | null;
  procesoIds: number[];
  verHistorial: boolean;
};

export type FilaUsuario = {
  id: number;
  usuario: string;
  nombre: string;
  rol: Rol;
  cargo: string | null;
  area: string | null;
  activo: boolean;
  bloqueadoHasta: string | null;
  totpActivo: boolean;
  debeCambiarClave: boolean;
  ultimoIngreso: string | null;
};

export type UsuarioDetalle = DatosUsuario & {
  id: number;
  activo: boolean;
  bloqueadoHasta: string | null;
  totpActivo: boolean;
  debeCambiarClave: boolean;
  aceptoDatosEn: string | null;
  creadoEn: string;
  cargoNombre: string | null;
  areaNombre: string | null;
  procesos: Array<{ id: number; nombre: string; sigla: string }>;
  supervisores: Array<{ id: number; nombre: string; cargo: string | null }>;
  sesionesActivas: number;
};

export type ContextoAcceso = { ip: string | null; userAgent: string | null };

const iso = (v: unknown): string | null => (v ? new Date(v as string | Date).toISOString() : null);
const idONulo = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
/** Sin repetidos y ordenado: la PK compuesta de usuario_procesos no admite duplicados. */
const sinRepetidos = (ids: number[]): number[] => [...new Set(ids)].sort((a, b) => a - b);

function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listarUsuarios(
  filtros: { texto?: string; rol?: Rol; activo?: boolean } = {},
): Promise<FilaUsuario[]> {
  const sql = obtenerSql();
  const texto = filtros.texto?.trim();
  const patron = texto ? `%${escaparLike(texto)}%` : null;
  const filas = await sql`
    SELECT u.id, u.usuario, u.nombre, u.rol, c.nombre AS cargo, a.nombre AS area, u.activo,
           CASE WHEN u.bloqueado_hasta > now() THEN u.bloqueado_hasta END AS bloqueado_hasta,
           u.totp_activo, u.debe_cambiar_clave,
           (SELECT max(ac.creado_en) FROM accesos ac
             WHERE ac.usuario_id = u.id AND ac.resultado = 'ingreso') AS ultimo_ingreso
    FROM usuarios u
    LEFT JOIN cargos c ON c.id = u.cargo_id
    LEFT JOIN areas a ON a.id = c.area_id
    WHERE true
      ${patron ? sql`AND (u.usuario ILIKE ${patron} OR u.nombre ILIKE ${patron} OR u.correo ILIKE ${patron})` : sql``}
      ${filtros.rol ? sql`AND u.rol = ${filtros.rol}` : sql``}
      ${filtros.activo === undefined ? sql`` : sql`AND u.activo = ${filtros.activo}`}
    ORDER BY u.activo DESC, lower(u.nombre), u.id`;
  return filas.map((f) => ({
    id: Number(f.id), usuario: f.usuario, nombre: f.nombre, rol: f.rol as Rol,
    cargo: f.cargo, area: f.area, activo: f.activo, bloqueadoHasta: iso(f.bloqueado_hasta),
    totpActivo: f.totp_activo, debeCambiarClave: f.debe_cambiar_clave,
    ultimoIngreso: iso(f.ultimo_ingreso),
  }));
}

export async function obtenerUsuario(id: number): Promise<UsuarioDetalle | null> {
  const sql = obtenerSql();
  const [f] = await sql`
    SELECT u.id, u.usuario, u.nombre, u.correo, u.rol, u.cargo_id, u.jefe_inmediato_id, u.ver_historial,
           u.activo, u.bloqueado_hasta, u.totp_activo, u.debe_cambiar_clave, u.acepto_datos_en,
           u.creado_en, c.nombre AS cargo_nombre, a.nombre AS area_nombre
    FROM usuarios u
    LEFT JOIN cargos c ON c.id = u.cargo_id
    LEFT JOIN areas a ON a.id = c.area_id
    WHERE u.id = ${id}`;
  if (!f) return null;
  const [procesos, supervisores, [{ n }]] = await Promise.all([
    sql`SELECT p.id, p.nombre, p.sigla FROM usuario_procesos up
        JOIN procesos p ON p.id = up.proceso_id
        WHERE up.usuario_id = ${id} ORDER BY p.orden, p.id`,
    supervisoresDe(id),
    sql`SELECT count(*) AS n FROM sesiones WHERE usuario_id = ${id} AND expira_en > now()`,
  ]);
  const bloqueado = f.bloqueado_hasta && new Date(f.bloqueado_hasta) > new Date();
  return {
    id: Number(f.id), usuario: f.usuario, nombre: f.nombre, correo: f.correo, rol: f.rol as Rol,
    cargoId: idONulo(f.cargo_id), jefeInmediatoId: idONulo(f.jefe_inmediato_id),
    procesoIds: procesos.map((p) => Number(p.id)), verHistorial: f.ver_historial,
    activo: f.activo, bloqueadoHasta: bloqueado ? iso(f.bloqueado_hasta) : null,
    totpActivo: f.totp_activo, debeCambiarClave: f.debe_cambiar_clave,
    aceptoDatosEn: iso(f.acepto_datos_en), creadoEn: iso(f.creado_en) as string,
    cargoNombre: f.cargo_nombre, areaNombre: f.area_nombre,
    procesos: procesos.map((p) => ({ id: Number(p.id), nombre: p.nombre, sigla: p.sigla })),
    supervisores, sesionesActivas: Number(n),
  };
}

export async function contarAdminsActivos(): Promise<number> {
  const [{ n }] = await obtenerSql()`SELECT count(*) AS n FROM usuarios WHERE rol = 'admin_sgc' AND activo`;
  return Number(n);
}

function traducirErrorUsuario(err: unknown): Error {
  const e = err as { code?: string; constraint_name?: string };
  if (e.code === "23505") {
    return new Error(
      e.constraint_name?.includes("correo")
        ? "Ya existe un usuario con ese correo"
        : "Ya existe un usuario con ese nombre",
    );
  }
  if (e.code === "23503") return new Error("El cargo, el jefe inmediato o un proceso no existe");
  return err as Error;
}

function exigirProcesosDeLider(rol: Rol, procesoIds: number[]): void {
  if (rol === "lider_proceso" && procesoIds.length === 0) {
    throw new Error("El líder de proceso debe tener al menos un proceso asignado");
  }
}

export async function crearUsuario(
  datos: DatosUsuario,
  claveTemporal: string,
  actorId: number,
): Promise<{ id: number }> {
  const procesoIds = sinRepetidos(datos.procesoIds);
  exigirProcesosDeLider(datos.rol, procesoIds);
  const hash = await hashearClave(claveTemporal);
  try {
    return await obtenerSql().begin(async (tx) => {
      const [u] = await tx`INSERT INTO usuarios
          (usuario, nombre, correo, hash_clave, rol, cargo_id, jefe_inmediato_id, ver_historial, debe_cambiar_clave)
        VALUES (${datos.usuario}, ${datos.nombre}, ${datos.correo}, ${hash}, ${datos.rol},
                ${datos.cargoId}, ${datos.jefeInmediatoId}, ${datos.verHistorial}, true)
        RETURNING id`;
      const id = Number(u.id);
      for (const procesoId of procesoIds) {
        await tx`INSERT INTO usuario_procesos (usuario_id, proceso_id) VALUES (${id}, ${procesoId})`;
      }
      await registrarAuditoria(tx, {
        usuarioId: actorId, accion: "crear_usuario", entidad: "usuario", entidadId: id,
        detalle: { usuario: datos.usuario, rol: datos.rol },
      });
      return { id };
    });
  } catch (err) {
    throw traducirErrorUsuario(err);
  }
}

type Editable = Omit<DatosUsuario, "usuario">;
const CAMPOS_EDITABLES = [
  "nombre", "correo", "rol", "cargoId", "jefeInmediatoId", "procesoIds", "verHistorial",
] as const satisfies ReadonlyArray<keyof Editable>;

export async function editarUsuario(
  id: number,
  datos: Editable,
  actorId: number,
): Promise<void> {
  if (actorId === id && datos.rol !== "admin_sgc") {
    throw new Error("No puede quitarse a sí mismo el rol de administrador");
  }
  if (datos.jefeInmediatoId === id) throw new Error("El jefe inmediato no puede ser el propio usuario");
  const procesoIds = sinRepetidos(datos.procesoIds);
  exigirProcesosDeLider(datos.rol, procesoIds);
  const despuesCompleto: Editable = { ...datos, procesoIds };
  try {
    await obtenerSql().begin(async (tx) => {
      const [f] = await tx`SELECT usuario, nombre, correo, rol, cargo_id, jefe_inmediato_id, ver_historial
        FROM usuarios WHERE id = ${id} FOR UPDATE`;
      if (!f) throw new Error("El usuario no existe");
      const actuales = await tx`SELECT proceso_id FROM usuario_procesos WHERE usuario_id = ${id}`;
      const antesCompleto: Editable = {
        nombre: f.nombre, correo: f.correo, rol: f.rol as Rol, cargoId: idONulo(f.cargo_id),
        jefeInmediatoId: idONulo(f.jefe_inmediato_id), verHistorial: f.ver_historial,
        procesoIds: sinRepetidos(actuales.map((p) => Number(p.proceso_id))),
      };
      const antes: Record<string, unknown> = {};
      const despues: Record<string, unknown> = {};
      for (const campo of CAMPOS_EDITABLES) {
        if (JSON.stringify(antesCompleto[campo]) !== JSON.stringify(despuesCompleto[campo])) {
          antes[campo] = antesCompleto[campo];
          despues[campo] = despuesCompleto[campo];
        }
      }
      if (Object.keys(despues).length === 0) return;
      await tx`UPDATE usuarios SET nombre = ${datos.nombre}, correo = ${datos.correo}, rol = ${datos.rol},
        cargo_id = ${datos.cargoId}, jefe_inmediato_id = ${datos.jefeInmediatoId},
        ver_historial = ${datos.verHistorial}, actualizado_en = now() WHERE id = ${id}`;
      await tx`DELETE FROM usuario_procesos WHERE usuario_id = ${id}`;
      for (const procesoId of procesoIds) {
        await tx`INSERT INTO usuario_procesos (usuario_id, proceso_id) VALUES (${id}, ${procesoId})`;
      }
      await registrarAuditoria(tx, {
        usuarioId: actorId, accion: "editar_usuario", entidad: "usuario", entidadId: id,
        detalle: { usuario: f.usuario, antes, despues },
      });
    });
  } catch (err) {
    throw traducirErrorUsuario(err);
  }
}

export async function cambiarActivo(id: number, activo: boolean, actorId: number): Promise<void> {
  if (!activo && actorId === id) throw new Error("No puede desactivar su propia cuenta");
  await conCandado(claveCandadoUsuario(id), () =>
    obtenerSql().begin(async (tx) => {
      const [f] = await tx`SELECT usuario, activo FROM usuarios WHERE id = ${id} FOR UPDATE`;
      if (!f) throw new Error("El usuario no existe");
      if (f.activo === activo) return;
      await tx`UPDATE usuarios SET activo = ${activo}, actualizado_en = now() WHERE id = ${id}`;
      if (!activo) await tx`DELETE FROM sesiones WHERE usuario_id = ${id}`;
      await registrarAuditoria(tx, {
        usuarioId: actorId, accion: activo ? "reactivar_usuario" : "desactivar_usuario",
        entidad: "usuario", entidadId: id, detalle: { usuario: f.usuario },
      });
    }),
  );
}

/** Serializa con los intentos de ingreso en vuelo de la misma cuenta (candado por usuario). */
export async function restablecerClave(
  id: number,
  actorId: number,
  contexto: ContextoAcceso = { ip: null, userAgent: null },
): Promise<{ claveTemporal: string }> {
  const claveTemporal = generarClaveTemporal();
  const hash = await hashearClave(claveTemporal);
  await conCandado(claveCandadoUsuario(id), () =>
    obtenerSql().begin(async (tx) => {
      const [f] = await tx`SELECT usuario FROM usuarios WHERE id = ${id} FOR UPDATE`;
      if (!f) throw new Error("El usuario no existe");
      await tx`UPDATE usuarios SET hash_clave = ${hash}, debe_cambiar_clave = true,
        intentos_fallidos = ${SIN_BLOQUEO.intentosFallidos},
        bloqueos_consecutivos = ${SIN_BLOQUEO.bloqueosConsecutivos},
        bloqueado_hasta = ${SIN_BLOQUEO.bloqueadoHasta}, actualizado_en = now()
        WHERE id = ${id}`;
      await tx`DELETE FROM sesiones WHERE usuario_id = ${id}`;
      await tx`INSERT INTO accesos (usuario_id, usuario_texto, resultado, ip, user_agent)
        VALUES (${id}, ${f.usuario}, 'restablecimiento', ${contexto.ip}, ${contexto.userAgent})`;
      await registrarAuditoria(tx, {
        usuarioId: actorId, accion: "restablecer_clave", entidad: "usuario", entidadId: id,
        detalle: { usuario: f.usuario },
      });
    }),
  );
  return { claveTemporal };
}

export async function desbloquearUsuario(
  id: number,
  actorId: number,
  contexto: ContextoAcceso = { ip: null, userAgent: null },
): Promise<void> {
  await conCandado(claveCandadoUsuario(id), () =>
    obtenerSql().begin(async (tx) => {
      const [f] = await tx`SELECT usuario FROM usuarios WHERE id = ${id} FOR UPDATE`;
      if (!f) throw new Error("El usuario no existe");
      await tx`UPDATE usuarios SET intentos_fallidos = ${SIN_BLOQUEO.intentosFallidos},
        bloqueos_consecutivos = ${SIN_BLOQUEO.bloqueosConsecutivos},
        bloqueado_hasta = ${SIN_BLOQUEO.bloqueadoHasta}, actualizado_en = now()
        WHERE id = ${id}`;
      await tx`INSERT INTO accesos (usuario_id, usuario_texto, resultado, ip, user_agent)
        VALUES (${id}, ${f.usuario}, 'desbloqueo', ${contexto.ip}, ${contexto.userAgent})`;
      await registrarAuditoria(tx, {
        usuarioId: actorId, accion: "desbloquear_usuario", entidad: "usuario", entidadId: id,
        detalle: { usuario: f.usuario },
      });
    }),
  );
}

export async function quitarSegundoFactor(id: number, actorId: number): Promise<void> {
  await conCandado(claveCandadoUsuario(id), async () => {
    if (!(await obtenerSecretoTotp(id)).activo) {
      throw new Error("El usuario no tiene segundo factor activo.");
    }
    await desactivarTotp(id, actorId);
  });
}

export type OpcionesFormularioUsuario = {
  cargos: Array<{ id: number; nombre: string; areaNombre: string }>;
  jefes: Array<{ id: number; nombre: string; usuario: string }>;
  procesos: Array<{ id: number; nombre: string; sigla: string }>;
};

/**
 * Listas de los selectores: cargos y procesos activos (más los que el usuario
 * ya tiene asignados, aunque se hayan desactivado) y usuarios activos como jefe.
 */
export async function opcionesFormularioUsuario(
  actual?: { id: number; cargoId: number | null; jefeInmediatoId: number | null; procesoIds: number[] },
): Promise<OpcionesFormularioUsuario> {
  const sql = obtenerSql();
  const [cargos, jefes, procesos] = await Promise.all([
    sql`SELECT c.id, c.nombre, a.nombre AS area_nombre FROM cargos c JOIN areas a ON a.id = c.area_id
        WHERE c.activo OR c.id = ${actual?.cargoId ?? null} ORDER BY a.orden, a.id, c.nombre`,
    sql`SELECT id, nombre, usuario FROM usuarios
        WHERE (activo OR id = ${actual?.jefeInmediatoId ?? null}) AND id <> ${actual?.id ?? 0}
        ORDER BY lower(nombre), id`,
    sql`SELECT id, nombre, sigla FROM procesos
        WHERE activo OR id = ANY(${actual?.procesoIds ?? []}) ORDER BY orden, id`,
  ]);
  return {
    cargos: cargos.map((c) => ({ id: Number(c.id), nombre: c.nombre, areaNombre: c.area_nombre })),
    jefes: jefes.map((j) => ({ id: Number(j.id), nombre: j.nombre, usuario: j.usuario })),
    procesos: procesos.map((p) => ({ id: Number(p.id), nombre: p.nombre, sigla: p.sigla })),
  };
}
