import { obtenerSql } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { traducirUnico } from "@/db/consultas/mapa-admin";

export type Area = { id: number; nombre: string; orden: number; activo: boolean; numCargos: number };
export type Cargo = {
  id: number;
  nombre: string;
  areaId: number;
  areaNombre: string;
  superiorId: number | null;
  superiorNombre: string | null;
  activo: boolean;
  numUsuarios: number;
};

const MENSAJE_CICLO = "El cargo superior crea un ciclo en el organigrama";

/** Pura: ¿asignar `nuevoSuperiorId` como superior de `id` cierra un ciclo? */
export function detectarCiclo(
  cargos: ReadonlyArray<{ id: number; superiorId: number | null }>,
  id: number,
  nuevoSuperiorId: number | null,
): boolean {
  const superiorDe = new Map(cargos.map((c) => [c.id, c.superiorId]));
  const visitados = new Set<number>();
  let actual: number | null = nuevoSuperiorId;
  while (actual !== null) {
    if (actual === id) return true;
    if (visitados.has(actual)) return true; // ciclo previo: no se agrava
    visitados.add(actual);
    actual = superiorDe.get(actual) ?? null;
  }
  return false;
}

// ── Áreas ──

export async function listarAreas(): Promise<Area[]> {
  const filas = await obtenerSql()`
    SELECT a.id, a.nombre, a.orden, a.activo,
           (SELECT count(*) FROM cargos c WHERE c.area_id = a.id) AS num_cargos
    FROM areas a ORDER BY a.orden, a.id`;
  return filas.map((f) => ({
    id: Number(f.id), nombre: f.nombre, orden: Number(f.orden),
    activo: f.activo, numCargos: Number(f.num_cargos),
  }));
}

export async function obtenerArea(id: number): Promise<Area | null> {
  return (await listarAreas()).find((a) => a.id === id) ?? null;
}

export async function crearArea(datos: { nombre: string }, actorId: number): Promise<{ id: number }> {
  try {
    return await obtenerSql().begin(async (tx) => {
      const [a] = await tx`INSERT INTO areas (nombre, orden)
        VALUES (${datos.nombre}, COALESCE((SELECT max(orden) FROM areas), 0) + 1) RETURNING id`;
      await registrarAuditoria(tx, {
        usuarioId: actorId, accion: "crear_area", entidad: "areas",
        entidadId: Number(a.id), detalle: { nombre: datos.nombre },
      });
      return { id: Number(a.id) };
    });
  } catch (err) {
    throw traducirUnico(err, "Ya existe un área con ese nombre");
  }
}

export async function editarArea(id: number, datos: { nombre: string }, actorId: number): Promise<void> {
  try {
    await obtenerSql().begin(async (tx) => {
      const [a] = await tx`UPDATE areas SET nombre = ${datos.nombre} WHERE id = ${id} RETURNING id`;
      if (!a) throw new Error("El área no existe");
      await registrarAuditoria(tx, {
        usuarioId: actorId, accion: "editar_area", entidad: "areas",
        entidadId: id, detalle: { nombre: datos.nombre },
      });
    });
  } catch (err) {
    throw traducirUnico(err, "Ya existe un área con ese nombre");
  }
}

/** Intercambia `orden` con la vecina (orden global entre todas las áreas). */
export async function moverArea(id: number, direccion: "arriba" | "abajo", actorId: number): Promise<void> {
  await obtenerSql().begin(async (tx) => {
    const [fila] = await tx`SELECT id, orden FROM areas WHERE id = ${id} FOR UPDATE`;
    if (!fila) throw new Error("El área no existe");
    const [vecina] =
      direccion === "arriba"
        ? await tx`SELECT id, orden FROM areas WHERE orden < ${fila.orden}
            ORDER BY orden DESC LIMIT 1 FOR UPDATE`
        : await tx`SELECT id, orden FROM areas WHERE orden > ${fila.orden}
            ORDER BY orden ASC LIMIT 1 FOR UPDATE`;
    if (!vecina) return;
    await tx`UPDATE areas SET orden = ${vecina.orden} WHERE id = ${fila.id}`;
    await tx`UPDATE areas SET orden = ${fila.orden} WHERE id = ${vecina.id}`;
    await registrarAuditoria(tx, {
      usuarioId: actorId, accion: "reordenar_area", entidad: "areas",
      entidadId: id, detalle: { direccion },
    });
  });
}

export async function alternarArea(id: number, activo: boolean, actorId: number): Promise<void> {
  await obtenerSql().begin(async (tx) => {
    const [a] = await tx`SELECT id FROM areas WHERE id = ${id} FOR UPDATE`;
    if (!a) throw new Error("El área no existe");
    if (!activo) {
      const [{ n }] = await tx`SELECT count(*) AS n FROM cargos WHERE area_id = ${id} AND activo`;
      if (Number(n) > 0) throw new Error("El área tiene cargos activos; desactívelos primero");
    }
    await tx`UPDATE areas SET activo = ${activo} WHERE id = ${id}`;
    await registrarAuditoria(tx, {
      usuarioId: actorId, accion: `${activo ? "activar" : "desactivar"}_area`,
      entidad: "areas", entidadId: id, detalle: {},
    });
  });
}

// ── Cargos ──

export async function listarCargos(): Promise<Cargo[]> {
  const filas = await obtenerSql()`
    SELECT c.id, c.nombre, c.area_id, a.nombre AS area_nombre, c.superior_id,
           s.nombre AS superior_nombre, c.activo,
           (SELECT count(*) FROM usuarios u WHERE u.cargo_id = c.id) AS num_usuarios
    FROM cargos c
    JOIN areas a ON a.id = c.area_id
    LEFT JOIN cargos s ON s.id = c.superior_id
    ORDER BY a.orden, a.id, c.nombre`;
  return filas.map((f) => ({
    id: Number(f.id), nombre: f.nombre, areaId: Number(f.area_id), areaNombre: f.area_nombre,
    superiorId: f.superior_id === null ? null : Number(f.superior_id),
    superiorNombre: f.superior_nombre, activo: f.activo, numUsuarios: Number(f.num_usuarios),
  }));
}

export async function obtenerCargo(id: number): Promise<Cargo | null> {
  return (await listarCargos()).find((c) => c.id === id) ?? null;
}

type DatosCargo = { nombre: string; areaId: number; superiorId: number | null };

function traducirCargo(err: unknown): Error {
  const codigo = (err as { code?: string }).code;
  if (codigo === "23503") return new Error("El área o el cargo superior no existe");
  return traducirUnico(err, "Ya existe un cargo con ese nombre en el área");
}

export async function crearCargo(datos: DatosCargo, actorId: number): Promise<{ id: number }> {
  try {
    return await obtenerSql().begin(async (tx) => {
      const [c] = await tx`INSERT INTO cargos (nombre, area_id, superior_id)
        VALUES (${datos.nombre}, ${datos.areaId}, ${datos.superiorId}) RETURNING id`;
      await registrarAuditoria(tx, {
        usuarioId: actorId, accion: "crear_cargo", entidad: "cargos",
        entidadId: Number(c.id), detalle: { ...datos },
      });
      return { id: Number(c.id) };
    });
  } catch (err) {
    throw traducirCargo(err);
  }
}

export async function editarCargo(id: number, datos: DatosCargo, actorId: number): Promise<void> {
  try {
    await obtenerSql().begin(async (tx) => {
      // Bloquea el organigrama completo: dos ediciones concurrentes no pueden
      // cerrar un ciclo entre ambas.
      await tx`LOCK TABLE cargos IN SHARE ROW EXCLUSIVE MODE`;
      const todos = await tx`SELECT id, superior_id FROM cargos`;
      if (!todos.some((c) => Number(c.id) === id)) throw new Error("El cargo no existe");
      const cargos = todos.map((c) => ({
        id: Number(c.id), superiorId: c.superior_id === null ? null : Number(c.superior_id),
      }));
      if (datos.superiorId !== null && !cargos.some((c) => c.id === datos.superiorId)) {
        throw new Error("El cargo superior no existe");
      }
      if (detectarCiclo(cargos, id, datos.superiorId)) throw new Error(MENSAJE_CICLO);
      await tx`UPDATE cargos SET nombre = ${datos.nombre}, area_id = ${datos.areaId},
        superior_id = ${datos.superiorId} WHERE id = ${id}`;
      await registrarAuditoria(tx, {
        usuarioId: actorId, accion: "editar_cargo", entidad: "cargos",
        entidadId: id, detalle: { ...datos },
      });
    });
  } catch (err) {
    throw traducirCargo(err);
  }
}

export async function alternarCargo(id: number, activo: boolean, actorId: number): Promise<void> {
  await obtenerSql().begin(async (tx) => {
    const [c] = await tx`SELECT id FROM cargos WHERE id = ${id} FOR UPDATE`;
    if (!c) throw new Error("El cargo no existe");
    if (!activo) {
      const [{ n }] = await tx`SELECT count(*) AS n FROM usuarios WHERE cargo_id = ${id} AND activo`;
      if (Number(n) > 0) throw new Error("El cargo tiene usuarios activos; reasígnelos primero");
    }
    await tx`UPDATE cargos SET activo = ${activo} WHERE id = ${id}`;
    await registrarAuditoria(tx, {
      usuarioId: actorId, accion: `${activo ? "activar" : "desactivar"}_cargo`,
      entidad: "cargos", entidadId: id, detalle: {},
    });
  });
}

// ── Supervisores ──

/** Jefe inmediato activo si existe; si no, usuarios activos con el cargo superior. */
export async function supervisoresDe(
  usuarioId: number,
): Promise<Array<{ id: number; nombre: string; cargo: string | null }>> {
  const sql = obtenerSql();
  const [u] = await sql`SELECT jefe_inmediato_id, cargo_id FROM usuarios WHERE id = ${usuarioId}`;
  if (!u) return [];
  if (u.jefe_inmediato_id !== null) {
    const filas = await sql`SELECT u.id, u.nombre, c.nombre AS cargo
      FROM usuarios u LEFT JOIN cargos c ON c.id = u.cargo_id
      WHERE u.id = ${u.jefe_inmediato_id} AND u.activo`;
    // Un jefe inmediato inactivo se ignora y se cae al organigrama.
    if (filas.length > 0) return filas.map((f) => ({ id: Number(f.id), nombre: f.nombre, cargo: f.cargo }));
  }
  if (u.cargo_id === null) return [];
  const filas = await sql`SELECT s.id, s.nombre, sc.nombre AS cargo
    FROM cargos c
    JOIN usuarios s ON s.cargo_id = c.superior_id AND s.activo
    JOIN cargos sc ON sc.id = s.cargo_id
    WHERE c.id = ${u.cargo_id} AND s.id <> ${usuarioId}
    ORDER BY s.nombre, s.id`;
  return filas.map((f) => ({ id: Number(f.id), nombre: f.nombre, cargo: f.cargo }));
}
