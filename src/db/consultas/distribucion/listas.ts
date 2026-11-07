import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion } from "@/db/consultas/flujo/contrato";
import { traducirUnico } from "@/db/consultas/mapa-admin";
import { ErrorDistribucion } from "@/lib/distribucion/tipos";

export type TipoMiembro = "area" | "cargo" | "proceso" | "usuario";
export type Miembro = { tipo: TipoMiembro; referenciaId: number; nombre: string };
/** `personas` es cuántas resuelve hoy. */
export type Lista = {
  id: number;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
  miembros: Miembro[];
  personas: number;
};
export type DatosLista = { nombre: string; descripcion: string | null; miembros: Omit<Miembro, "nombre">[] };

type Opciones = { sql?: Cliente };

const NOMBRE_REPETIDO = "Ya existe una lista con ese nombre";
const ORDEN_TIPO: Record<TipoMiembro, number> = { area: 0, cargo: 1, proceso: 2, usuario: 3 };

const ROTULOS: Record<TipoMiembro, [string, string]> = {
  area: ["área", "áreas"],
  cargo: ["cargo", "cargos"],
  proceso: ["proceso", "procesos"],
  usuario: ["persona", "personas"],
};

/** «2 áreas, 1 cargo, 3 personas». */
export function resumenMiembros(miembros: Array<Pick<Miembro, "tipo"> & Partial<Miembro>>): string {
  const partes = (Object.keys(ORDEN_TIPO) as TipoMiembro[]).flatMap((tipo) => {
    const n = miembros.filter((m) => m.tipo === tipo).length;
    return n === 0 ? [] : [`${n} ${ROTULOS[tipo][n === 1 ? 0 : 1]}`];
  });
  return partes.length > 0 ? partes.join(", ") : "Sin miembros";
}

/**
 * Las personas activas a las que llegan las listas que cumplen `condicion` (sobre `lista_miembros m`), como
 * un `SELECT` de ids. La comparten `resolverLista` y la audiencia del documento.
 */
export function usuariosDeListas(sql: Cliente, condicion: ReturnType<Cliente>) {
  return sql`
    SELECT m.lista_id, u.id
    FROM lista_miembros m
    JOIN usuarios u ON u.activo AND (
      (m.tipo = 'usuario' AND u.id = m.referencia_id)
      OR (m.tipo = 'cargo' AND u.cargo_id = m.referencia_id)
      OR (m.tipo = 'area' AND u.cargo_id IN (SELECT c.id FROM cargos c WHERE c.area_id = m.referencia_id))
      OR (m.tipo = 'proceso' AND EXISTS (
        SELECT 1 FROM usuario_procesos up WHERE up.usuario_id = u.id AND up.proceso_id = m.referencia_id))
    )
    WHERE ${condicion}`;
}

/** Ids de las personas activas que alcanza la lista, sin repetir y ascendentes. */
export async function resolverLista(sql: Cliente, listaId: number): Promise<number[]> {
  const filas = await sql`
    SELECT DISTINCT r.id FROM (${usuariosDeListas(sql, sql`m.lista_id = ${listaId}`)}) r ORDER BY r.id`;
  return filas.map((f) => Number(f.id));
}

async function leerListas(sql: Cliente, condicion: ReturnType<Cliente>): Promise<Lista[]> {
  const filas = await sql`
    SELECT l.id, l.nombre, l.descripcion, l.activa FROM listas_distribucion l
    WHERE ${condicion} ORDER BY l.activa DESC, lower(l.nombre), l.id`;
  if (filas.length === 0) return [];
  const ids = filas.map((f) => Number(f.id));
  const miembros = await sql`
    SELECT m.lista_id, m.tipo, m.referencia_id,
      CASE m.tipo
        WHEN 'area' THEN (SELECT a.nombre FROM areas a WHERE a.id = m.referencia_id)
        WHEN 'cargo' THEN (SELECT c.nombre FROM cargos c WHERE c.id = m.referencia_id)
        WHEN 'proceso' THEN (SELECT p.nombre FROM procesos p WHERE p.id = m.referencia_id)
        WHEN 'usuario' THEN (SELECT u.nombre FROM usuarios u WHERE u.id = m.referencia_id)
      END AS nombre
    FROM lista_miembros m WHERE m.lista_id IN ${sql(ids)}`;
  const personas = await sql`
    SELECT r.lista_id, count(DISTINCT r.id) AS n
    FROM (${usuariosDeListas(sql, sql`m.lista_id IN ${sql(ids)}`)}) r GROUP BY r.lista_id`;
  const cuentas = new Map(personas.map((f) => [Number(f.lista_id), Number(f.n)]));
  return filas.map((f) => {
    const id = Number(f.id);
    return {
      id,
      nombre: f.nombre as string,
      descripcion: (f.descripcion as string | null) ?? null,
      activa: f.activa as boolean,
      miembros: miembros
        .filter((m) => Number(m.lista_id) === id)
        .map((m) => ({ tipo: m.tipo as TipoMiembro, referenciaId: Number(m.referencia_id), nombre: (m.nombre as string | null) ?? "(eliminado)" }))
        .sort((a, b) => ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo] || a.nombre.localeCompare(b.nombre, "es") || a.referenciaId - b.referenciaId),
      personas: cuentas.get(id) ?? 0,
    };
  });
}

export async function listarListas(opciones?: Opciones & { soloActivas?: boolean }): Promise<Lista[]> {
  const sql = opciones?.sql ?? obtenerSql();
  return leerListas(sql, opciones?.soloActivas ? sql`l.activa` : sql`true`);
}

export async function obtenerLista(
  id: number,
  opciones?: Opciones,
): Promise<(Lista & { resueltas: { id: number; nombre: string }[] }) | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [lista] = await leerListas(sql, sql`l.id = ${id}`);
  if (!lista) return null;
  const resueltas = await resolverLista(sql, id);
  const filas =
    resueltas.length === 0
      ? []
      : await sql`SELECT u.id, u.nombre FROM usuarios u WHERE u.id IN ${sql(resueltas)} ORDER BY lower(u.nombre), u.id`;
  return { ...lista, resueltas: filas.map((u) => ({ id: Number(u.id), nombre: u.nombre as string })) };
}

const TABLA_DE: Record<TipoMiembro, string> = { area: "areas", cargo: "cargos", proceso: "procesos", usuario: "usuarios" };

async function existeActivo(sql: Cliente, tipo: TipoMiembro, id: number): Promise<boolean> {
  const filas = await sql`SELECT 1 FROM ${sql(TABLA_DE[tipo])} WHERE id = ${id} AND activo`;
  return filas.length > 0;
}

/** Cada referencia debe existir y estar activa; al editar, solo se exigen las que entran. */
async function exigirReferencias(sql: Cliente, miembros: DatosLista["miembros"], yaEstaban: Set<string> = new Set()) {
  for (const m of miembros) {
    if (yaEstaban.has(`${m.tipo}:${m.referenciaId}`)) continue;
    if (!(await existeActivo(sql, m.tipo, m.referenciaId))) {
      throw new ErrorDistribucion(`La referencia ${m.tipo} ${m.referenciaId} no existe o está inactiva`);
    }
  }
}

const clave = (m: Pick<Miembro, "tipo" | "referenciaId">) => `${m.tipo}:${m.referenciaId}`;

function unicos(miembros: DatosLista["miembros"]): DatosLista["miembros"] {
  return [...new Map(miembros.map((m) => [clave(m), { tipo: m.tipo, referenciaId: m.referenciaId }])).values()];
}

async function guardarMiembros(sql: Cliente, listaId: number, miembros: DatosLista["miembros"]): Promise<void> {
  await sql`DELETE FROM lista_miembros WHERE lista_id = ${listaId}`;
  for (const m of miembros) {
    await sql`INSERT INTO lista_miembros (lista_id, tipo, referencia_id) VALUES (${listaId}, ${m.tipo}, ${m.referenciaId})`;
  }
}

export async function crearLista(datos: DatosLista, actorId: number, opciones?: Opciones): Promise<{ id: number }> {
  const sql = opciones?.sql ?? obtenerSql();
  const miembros = unicos(datos.miembros);
  try {
    return await enTransaccion(sql, async (tx) => {
      await exigirReferencias(tx, miembros);
      const [l] = await tx`INSERT INTO listas_distribucion (nombre, descripcion)
        VALUES (${datos.nombre}, ${datos.descripcion}) RETURNING id`;
      const id = Number(l.id);
      await guardarMiembros(tx, id, miembros);
      await registrarAuditoria(tx, {
        usuarioId: actorId, accion: "crear_lista", entidad: "listas_distribucion", entidadId: id,
        detalle: { nombre: datos.nombre, descripcion: datos.descripcion, miembros: miembros.map(clave).sort() },
      });
      return { id };
    });
  } catch (err) {
    throw traducirUnico(err, NOMBRE_REPETIDO);
  }
}

export async function editarLista(id: number, datos: DatosLista, actorId: number, opciones?: Opciones): Promise<void> {
  const sql = opciones?.sql ?? obtenerSql();
  const miembros = unicos(datos.miembros);
  try {
    await enTransaccion(sql, async (tx) => {
      const [antes] = await tx`SELECT nombre, descripcion FROM listas_distribucion WHERE id = ${id} FOR UPDATE`;
      if (!antes) throw new ErrorDistribucion("La lista no existe");
      const previos = (await tx`SELECT tipo, referencia_id FROM lista_miembros WHERE lista_id = ${id}`).map((m) =>
        clave({ tipo: m.tipo as TipoMiembro, referenciaId: Number(m.referencia_id) }),
      );
      await exigirReferencias(tx, miembros, new Set(previos));
      await tx`UPDATE listas_distribucion SET nombre = ${datos.nombre}, descripcion = ${datos.descripcion} WHERE id = ${id}`;
      await guardarMiembros(tx, id, miembros);
      const previo = {
        nombre: antes.nombre as string,
        descripcion: (antes.descripcion as string | null) ?? null,
        miembros: previos.sort(),
      };
      const despues = { nombre: datos.nombre, descripcion: datos.descripcion, miembros: miembros.map(clave).sort() };
      const cambios = (Object.keys(despues) as (keyof typeof despues)[]).filter(
        (k) => JSON.stringify(despues[k]) !== JSON.stringify(previo[k]),
      );
      if (cambios.length === 0) return;
      await registrarAuditoria(tx, {
        usuarioId: actorId, accion: "editar_lista", entidad: "listas_distribucion", entidadId: id,
        detalle: {
          antes: Object.fromEntries(cambios.map((k) => [k, previo[k]])),
          despues: Object.fromEntries(cambios.map((k) => [k, despues[k]])),
        },
      });
    });
  } catch (err) {
    throw traducirUnico(err, NOMBRE_REPETIDO);
  }
}

export async function alternarLista(id: number, activa: boolean, actorId: number, opciones?: Opciones): Promise<void> {
  const sql = opciones?.sql ?? obtenerSql();
  await enTransaccion(sql, async (tx) => {
    const [l] = await tx`SELECT activa FROM listas_distribucion WHERE id = ${id} FOR UPDATE`;
    if (!l) throw new ErrorDistribucion("La lista no existe");
    if (l.activa === activa) return;
    await tx`UPDATE listas_distribucion SET activa = ${activa} WHERE id = ${id}`;
    await registrarAuditoria(tx, {
      usuarioId: actorId, accion: `${activa ? "activar" : "desactivar"}_lista`,
      entidad: "listas_distribucion", entidadId: id, detalle: {},
    });
  });
}

export type OpcionesFormularioLista = {
  areas: { id: number; nombre: string }[];
  cargos: { id: number; nombre: string; areaId: number; areaNombre: string }[];
  procesos: { id: number; sigla: string; nombre: string }[];
  usuarios: { id: number; nombre: string; usuario: string }[];
};

/** Lo activo que se puede elegir como miembro. */
export async function opcionesFormularioLista(opciones?: Opciones): Promise<OpcionesFormularioLista> {
  const sql = opciones?.sql ?? obtenerSql();
  const [areas, cargos, procesos, usuarios] = await Promise.all([
    sql`SELECT id, nombre FROM areas WHERE activo ORDER BY orden, id`,
    sql`SELECT c.id, c.nombre, c.area_id, a.nombre AS area_nombre FROM cargos c JOIN areas a ON a.id = c.area_id
        WHERE c.activo AND a.activo ORDER BY a.orden, a.id, c.nombre`,
    sql`SELECT id, sigla, nombre FROM procesos WHERE activo ORDER BY nombre`,
    sql`SELECT id, nombre, usuario FROM usuarios WHERE activo ORDER BY lower(nombre), id`,
  ]);
  return {
    areas: areas.map((a) => ({ id: Number(a.id), nombre: a.nombre as string })),
    cargos: cargos.map((c) => ({ id: Number(c.id), nombre: c.nombre as string, areaId: Number(c.area_id), areaNombre: c.area_nombre as string })),
    procesos: procesos.map((p) => ({ id: Number(p.id), sigla: p.sigla as string, nombre: p.nombre as string })),
    usuarios: usuarios.map((u) => ({ id: Number(u.id), nombre: u.nombre as string, usuario: u.usuario as string })),
  };
}
