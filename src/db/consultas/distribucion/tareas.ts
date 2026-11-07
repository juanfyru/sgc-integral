import { obtenerSql, type Cliente } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { numeroDeCopia } from "@/lib/distribucion/copias";
import type { Tarea } from "@/lib/tareas";

/**
 * Lo que le toca al responsable actual de cada punto: recibir lo que le entregaron y recoger lo que dejó
 * de ser vigente. Una copia nueva que reemplaza a una por recoger es una sola tarea doble (spec 13B §8.3).
 */
export async function tareasDeCopias(sesion: SesionFlujo, opciones?: { sql?: Cliente }): Promise<Tarea[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`
    SELECT cc.id, cc.numero, cc.estado, cc.vence_en, cc.reemplaza_copia_id,
           v.numero AS version, d.codigo, d.titulo, pu.nombre AS punto,
           rc.numero AS vieja_numero, rc.estado AS vieja_estado, rc.vence_en AS vieja_vence, rv.numero AS vieja_version
    FROM copias_controladas cc
    JOIN puntos_uso pu ON pu.id = cc.punto_uso_id AND pu.responsable_id = ${sesion.usuarioId}
    JOIN documento_versiones v ON v.id = cc.version_id
    JOIN documentos d ON d.id = v.documento_id
    LEFT JOIN copias_controladas rc ON rc.id = cc.reemplaza_copia_id
    LEFT JOIN documento_versiones rv ON rv.id = rc.version_id
    WHERE cc.estado IN ('emitida', 'por_recoger')
    ORDER BY cc.vence_en NULLS LAST, cc.id`;

  // Las por recoger que una copia nueva todavía por recibir ya absorbe en su tarea doble.
  const absorbidas = new Set<number>(
    filas.filter((f) => f.estado === "emitida" && f.vieja_estado === "por_recoger").map((f) => Number(f.reemplaza_copia_id)),
  );
  const tareas: Tarea[] = [];
  for (const f of filas) {
    const id = Number(f.id);
    const n = numeroDeCopia(Number(f.numero));
    let titulo: string;
    let vence = (f.vence_en as Date | null) ?? null;
    if (f.estado === "emitida" && f.vieja_estado === "por_recoger") {
      titulo = `Recibir la copia N.º ${n} de la v${f.version} y retirar la N.º ${numeroDeCopia(Number(f.vieja_numero))} de la v${f.vieja_version} en ${f.punto}`;
      const vieja = (f.vieja_vence as Date | null) ?? null;
      if (vieja && (!vence || vieja < vence)) vence = vieja;
    } else if (f.estado === "emitida") {
      titulo = `Recibir la copia N.º ${n} de ${f.codigo} v${f.version} en ${f.punto}`;
    } else if (absorbidas.has(id)) {
      continue;
    } else {
      titulo = `Recoger la copia N.º ${n} de ${f.codigo} v${f.version} en ${f.punto}`;
    }
    tareas.push({
      id: `copia:${id}`,
      modulo: "documentos",
      titulo,
      detalle: f.titulo as string,
      vence,
      enlace: `/distribucion/copias/${id}`,
    });
  }
  return tareas;
}

/** Cada lectura pendiente es una tarea de la persona; vence con el plazo del acuse. */
export async function tareasDeAcuses(sesion: SesionFlujo, opciones?: { sql?: Cliente }): Promise<Tarea[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`
    SELECT a.id, a.vence_en, v.numero AS version, d.codigo, d.titulo
    FROM acuses a
    JOIN documento_versiones v ON v.id = a.version_id
    JOIN documentos d ON d.id = v.documento_id
    WHERE a.usuario_id = ${sesion.usuarioId} AND a.estado = 'pendiente'
    ORDER BY a.vence_en, a.id`;
  return filas.map((f) => ({
    id: `acuse:${f.id}`,
    modulo: "documentos" as const,
    titulo: `Confirmar lectura de ${f.codigo} v${f.version}`,
    detalle: f.titulo as string,
    vence: f.vence_en as Date,
    enlace: `/acuses/${f.id}`,
  }));
}

/**
 * Cada socialización requerida y sin registrar es una tarea de los líderes del proceso propietario del documento o,
 * si no tiene líder activo, de los Admin SGC; vence con el plazo de la socialización.
 */
export async function tareasDeSocializacion(sesion: SesionFlujo, opciones?: { sql?: Cliente }): Promise<Tarea[]> {
  if (sesion.rol !== "lider_proceso" && sesion.rol !== "admin_sgc") return [];
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`
    SELECT r.version_id, r.vence_en, v.numero AS version, d.codigo, d.titulo,
      EXISTS (
        SELECT 1 FROM documento_proceso dp
        LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
        JOIN usuario_procesos up ON up.proceso_id = COALESCE(dp.proceso_id, s.proceso_id) AND up.usuario_id = ${sesion.usuarioId}
        JOIN procesos p ON p.id = up.proceso_id AND p.activo
        WHERE dp.documento_id = d.id AND dp.es_principal
      ) AS es_lider_propietario,
      EXISTS (
        SELECT 1 FROM documento_proceso dp
        LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
        JOIN usuario_procesos up ON up.proceso_id = COALESCE(dp.proceso_id, s.proceso_id)
        JOIN usuarios ul ON ul.id = up.usuario_id AND ul.activo AND ul.rol = 'lider_proceso'
        JOIN procesos p ON p.id = up.proceso_id AND p.activo
        WHERE dp.documento_id = d.id AND dp.es_principal
      ) AS hay_lider
    FROM socializaciones_requeridas r
    JOIN documento_versiones v ON v.id = r.version_id
    JOIN documentos d ON d.id = v.documento_id
    WHERE r.cumplida_en IS NULL AND r.superada_en IS NULL
    ORDER BY r.vence_en, r.id`;
  return filas
    .filter((f) => (sesion.rol === "lider_proceso" ? f.es_lider_propietario : !f.hay_lider))
    .map((f) => ({
      id: `socializacion:${f.version_id}`,
      modulo: "documentos" as const,
      titulo: `Registrar la socialización de ${f.codigo} v${f.version}`,
      detalle: f.titulo as string,
      vence: f.vence_en as Date,
      enlace: `/distribucion/socializaciones/nueva?version=${f.version_id}`,
    }));
}
