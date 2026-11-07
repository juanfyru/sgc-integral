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
