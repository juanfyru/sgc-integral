import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion } from "@/db/consultas/flujo/contrato";
import { traducirUnico } from "@/db/consultas/mapa-admin";
import { condicionVista, filtroPuntos, puedeAccederDocumento, type SujetoVisibilidad } from "@/lib/alcance";
import { ErrorDistribucion } from "@/lib/distribucion/tipos";
import type { Rol } from "@/lib/roles";

export type PuntoUso = {
  id: number;
  nombre: string;
  sede: string | null;
  ubicacion: string | null;
  responsable: { id: number; nombre: string; cargo: string | null; activo: boolean };
  procesos: { id: number; sigla: string; nombre: string }[];
  activo: boolean;
  orden: number;
  copiasVivas: number;
};

export type DatosPuntoUso = {
  nombre: string;
  sede: string | null;
  ubicacion: string | null;
  responsableId: number;
  procesoIds: number[];
};

const ESTADOS_VIVOS = ["emitida", "recibida", "por_recoger"];
const NOMBRE_REPETIDO = "Ya existe un punto de uso con ese nombre en esa sede";

type Opciones = { sql?: Cliente };

async function leerPuntos(
  sql: Cliente,
  sesion: SujetoVisibilidad,
  condicion: ReturnType<Cliente>,
): Promise<PuntoUso[]> {
  const filas = await sql`
    SELECT pu.id, pu.nombre, pu.sede, pu.ubicacion, pu.activo, pu.orden,
           u.id AS responsable_id, u.nombre AS responsable_nombre, u.activo AS responsable_activo,
           c.nombre AS responsable_cargo,
           COALESCE((
             SELECT json_agg(json_build_object('id', p.id, 'sigla', p.sigla, 'nombre', p.nombre) ORDER BY p.nombre)
             FROM punto_uso_procesos pp JOIN procesos p ON p.id = pp.proceso_id
             WHERE pp.punto_uso_id = pu.id), '[]'::json) AS procesos,
           (SELECT count(*) FROM copias_controladas cc
             JOIN documento_versiones v ON v.id = cc.version_id
             JOIN documentos d ON d.id = v.documento_id
             WHERE cc.punto_uso_id = pu.id AND cc.estado IN ${sql(ESTADOS_VIVOS)}
               -- La misma regla de la tabla de copias: al líder no se le cuenta el restringido ajeno que no ve.
               AND ${condicionVista(sql, sesion)}) AS copias_vivas
    FROM puntos_uso pu
    JOIN usuarios u ON u.id = pu.responsable_id
    LEFT JOIN cargos c ON c.id = u.cargo_id
    WHERE ${filtroPuntos(sql, sesion)} AND ${condicion}
    ORDER BY pu.orden, lower(coalesce(pu.sede, '')), lower(pu.nombre), pu.id`;
  return filas.map((f) => ({
    id: Number(f.id),
    nombre: f.nombre as string,
    sede: (f.sede as string | null) ?? null,
    ubicacion: (f.ubicacion as string | null) ?? null,
    responsable: {
      id: Number(f.responsable_id),
      nombre: f.responsable_nombre as string,
      cargo: (f.responsable_cargo as string | null) ?? null,
      activo: f.responsable_activo as boolean,
    },
    procesos: (f.procesos as { id: number; sigla: string; nombre: string }[]).map((p) => ({
      id: Number(p.id),
      sigla: p.sigla,
      nombre: p.nombre,
    })),
    activo: f.activo as boolean,
    orden: Number(f.orden),
    copiasVivas: Number(f.copias_vivas),
  }));
}

export async function listarPuntosUso(
  sesion: SujetoVisibilidad,
  opciones?: Opciones & { soloActivos?: boolean },
): Promise<PuntoUso[]> {
  const sql = opciones?.sql ?? obtenerSql();
  return leerPuntos(sql, sesion, opciones?.soloActivos ? sql`pu.activo` : sql`true`);
}

/** `null` si no existe o si la sesión no lo ve. */
export async function obtenerPuntoUso(id: number, sesion: SujetoVisibilidad, opciones?: Opciones): Promise<PuntoUso | null> {
  const sql = opciones?.sql ?? obtenerSql();
  return (await leerPuntos(sql, sesion, sql`pu.id = ${id}`))[0] ?? null;
}

export type CopiaVivaDePunto = {
  id: number;
  codigo: string;
  documentoId: number;
  version: number;
  numero: number;
  estado: "emitida" | "recibida" | "por_recoger";
};

/** Las copias que aún están en poder del punto o por devolverse (las que impiden desactivarlo). */
export async function copiasVivasDePunto(sql: Cliente, puntoId: number): Promise<CopiaVivaDePunto[]> {
  const filas = await sql`
    SELECT cc.id, cc.numero, cc.estado, d.codigo, d.id AS documento_id, v.numero AS version
    FROM copias_controladas cc
    JOIN documento_versiones v ON v.id = cc.version_id
    JOIN documentos d ON d.id = v.documento_id
    WHERE cc.punto_uso_id = ${puntoId} AND cc.estado IN ${sql(ESTADOS_VIVOS)}
    ORDER BY d.codigo, v.numero, cc.numero, cc.id`;
  return filas.map((f) => ({
    id: Number(f.id),
    codigo: f.codigo as string,
    documentoId: Number(f.documento_id),
    version: Number(f.version),
    numero: Number(f.numero),
    estado: f.estado as CopiaVivaDePunto["estado"],
  }));
}

async function exigirResponsableActivo(sql: Cliente, responsableId: number): Promise<{ rol: Rol; verHistorial: boolean }> {
  const [u] = await sql`SELECT rol, ver_historial, activo FROM usuarios WHERE id = ${responsableId}`;
  if (!u || !u.activo) throw new ErrorDistribucion("El responsable debe ser una persona activa");
  return { rol: u.rol as Rol, verHistorial: u.ver_historial as boolean };
}

async function exigirProcesosActivos(sql: Cliente, procesoIds: number[]): Promise<void> {
  if (procesoIds.length === 0) return;
  const filas = await sql`SELECT id FROM procesos WHERE id IN ${sql(procesoIds)} AND activo`;
  if (filas.length !== new Set(procesoIds).size) throw new ErrorDistribucion("Algún proceso elegido no existe o está inactivo");
}

async function guardarProcesos(sql: Cliente, puntoId: number, procesoIds: number[]): Promise<void> {
  await sql`DELETE FROM punto_uso_procesos WHERE punto_uso_id = ${puntoId}`;
  for (const procesoId of new Set(procesoIds)) {
    await sql`INSERT INTO punto_uso_procesos (punto_uso_id, proceso_id) VALUES (${puntoId}, ${procesoId})`;
  }
}

export async function crearPuntoUso(datos: DatosPuntoUso, actorId: number, opciones?: Opciones): Promise<{ id: number }> {
  const sql = opciones?.sql ?? obtenerSql();
  try {
    return await enTransaccion(sql, async (tx) => {
      await exigirResponsableActivo(tx, datos.responsableId);
      await exigirProcesosActivos(tx, datos.procesoIds);
      const [p] = await tx`INSERT INTO puntos_uso (nombre, sede, ubicacion, responsable_id, orden)
        VALUES (${datos.nombre}, ${datos.sede}, ${datos.ubicacion}, ${datos.responsableId},
                COALESCE((SELECT max(orden) FROM puntos_uso), 0) + 1)
        RETURNING id`;
      const id = Number(p.id);
      await guardarProcesos(tx, id, datos.procesoIds);
      await registrarAuditoria(tx, {
        usuarioId: actorId, accion: "crear_punto_uso", entidad: "puntos_uso", entidadId: id,
        detalle: { ...datos },
      });
      return { id };
    });
  } catch (err) {
    throw traducirUnico(err, NOMBRE_REPETIDO);
  }
}

export async function editarPuntoUso(id: number, datos: DatosPuntoUso, actorId: number, opciones?: Opciones): Promise<void> {
  const sql = opciones?.sql ?? obtenerSql();
  try {
    await enTransaccion(sql, async (tx) => {
      const [antes] = await tx`SELECT nombre, sede, ubicacion, responsable_id FROM puntos_uso WHERE id = ${id} FOR UPDATE`;
      if (!antes) throw new ErrorDistribucion("El punto de uso no existe");
      await exigirProcesosActivos(tx, datos.procesoIds);
      if (Number(antes.responsable_id) !== datos.responsableId) {
        const nuevo = await exigirResponsableActivo(tx, datos.responsableId);
        for (const copia of await copiasVivasDePunto(tx, id)) {
          const ve = await puedeAccederDocumento(copia.documentoId, { usuarioId: datos.responsableId, ...nuevo }, { sql: tx });
          if (!ve) {
            throw new ErrorDistribucion(
              `El responsable nuevo no tiene acceso a ${copia.codigo}: recoja o anule esas copias antes`,
            );
          }
        }
      }
      const procesosAntes = (await tx`SELECT proceso_id FROM punto_uso_procesos WHERE punto_uso_id = ${id} ORDER BY proceso_id`).map(
        (f) => Number(f.proceso_id),
      );
      await tx`UPDATE puntos_uso SET nombre = ${datos.nombre}, sede = ${datos.sede}, ubicacion = ${datos.ubicacion},
        responsable_id = ${datos.responsableId}, actualizado_en = now() WHERE id = ${id}`;
      await guardarProcesos(tx, id, datos.procesoIds);
      const despues = { ...datos, procesoIds: [...new Set(datos.procesoIds)].sort((a, b) => a - b) };
      const previo = {
        nombre: antes.nombre as string,
        sede: (antes.sede as string | null) ?? null,
        ubicacion: (antes.ubicacion as string | null) ?? null,
        responsableId: Number(antes.responsable_id),
        procesoIds: procesosAntes,
      };
      const cambios = (Object.keys(despues) as (keyof typeof despues)[]).filter(
        (k) => JSON.stringify(despues[k]) !== JSON.stringify(previo[k]),
      );
      await registrarAuditoria(tx, {
        usuarioId: actorId, accion: "editar_punto_uso", entidad: "puntos_uso", entidadId: id,
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

export async function alternarPuntoUso(id: number, activo: boolean, actorId: number, opciones?: Opciones): Promise<void> {
  const sql = opciones?.sql ?? obtenerSql();
  await enTransaccion(sql, async (tx) => {
    const [p] = await tx`SELECT activo, responsable_id FROM puntos_uso WHERE id = ${id} FOR UPDATE`;
    if (!p) throw new ErrorDistribucion("El punto de uso no existe");
    if (p.activo === activo) return;
    if (activo) {
      await exigirResponsableActivo(tx, Number(p.responsable_id));
    } else {
      const vivas = await copiasVivasDePunto(tx, id);
      if (vivas.length > 0) {
        throw new ErrorDistribucion(
          vivas.length === 1
            ? "El punto tiene 1 copia por recibir o por recoger: recójala o anúlela antes"
            : `El punto tiene ${vivas.length} copias por recibir o por recoger: recójalas o anúlelas antes`,
        );
      }
    }
    await tx`UPDATE puntos_uso SET activo = ${activo}, actualizado_en = now() WHERE id = ${id}`;
    await registrarAuditoria(tx, {
      usuarioId: actorId, accion: `${activo ? "activar" : "desactivar"}_punto_uso`,
      entidad: "puntos_uso", entidadId: id, detalle: {},
    });
  });
}

/** Los puntos activos de los que la persona responde. */
export async function puntosDeResponsable(usuarioId: number, opciones?: Opciones): Promise<{ id: number; nombre: string }[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT id, nombre FROM puntos_uso WHERE responsable_id = ${usuarioId} AND activo
    ORDER BY orden, lower(nombre), id`;
  return filas.map((f) => ({ id: Number(f.id), nombre: f.nombre as string }));
}

export async function esResponsableDePuntos(usuarioId: number, opciones?: Opciones): Promise<boolean> {
  return (await puntosDeResponsable(usuarioId, opciones)).length > 0;
}

export type OpcionesFormularioPunto = {
  usuarios: { id: number; nombre: string; usuario: string }[];
  procesos: { id: number; sigla: string; nombre: string }[];
};

/** Personas activas y procesos activos que se pueden elegir en el formulario de un punto. */
export async function opcionesFormularioPunto(opciones?: Opciones): Promise<OpcionesFormularioPunto> {
  const sql = opciones?.sql ?? obtenerSql();
  const [usuarios, procesos] = await Promise.all([
    sql`SELECT id, nombre, usuario FROM usuarios WHERE activo ORDER BY lower(nombre), id`,
    sql`SELECT id, sigla, nombre FROM procesos WHERE activo ORDER BY nombre`,
  ]);
  return {
    usuarios: usuarios.map((u) => ({ id: Number(u.id), nombre: u.nombre as string, usuario: u.usuario as string })),
    procesos: procesos.map((p) => ({ id: Number(p.id), sigla: p.sigla as string, nombre: p.nombre as string })),
  };
}

/** El atajo «Crear desde un subproceso»: solo prellena el formulario, no deja vínculo. */
export async function subprocesoParaPunto(
  id: number,
  opciones?: Opciones,
): Promise<{ nombre: string; procesoId: number } | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [s] = await sql`SELECT nombre, proceso_id FROM subprocesos WHERE id = ${id} AND activo`;
  return s ? { nombre: s.nombre as string, procesoId: Number(s.proceso_id) } : null;
}
