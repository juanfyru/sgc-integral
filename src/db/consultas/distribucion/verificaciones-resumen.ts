import { obtenerSql, type Cliente } from "@/db/cliente";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { filtroPuntos } from "@/lib/alcance";
import { conformidad } from "@/lib/distribucion/verificacion";

type Opciones = { sql?: Cliente; ahora?: Date };

export type EstadoPunto = {
  puntoId: number;
  nombre: string;
  sede: string | null;
  responsable: string;
  ultima: { cerradaEn: Date; conforme: boolean } | null;
  hallazgosAbiertos: number;
  /** La verificación abierta, si la hay. */
  abiertaId: number | null;
  /** Última cerrada + cada cuántos días; `null` si nunca se verificó. */
  proxima: Date | null;
  vencida: boolean;
};

export type ConformidadActual = { porcentaje: number | null; cumple: boolean | null; umbral: number; puntos: number };

/** Una fila por punto activo del alcance, y la conformidad de la última verificación cerrada de cada uno. */
export async function estadoDePuntos(
  sesion: SesionFlujo,
  opciones?: Opciones,
): Promise<{ puntos: EstadoPunto[]; conformidad: ConformidadActual }> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const { distribucion } = await obtenerConfigDocumental({ sql });
  const filas = await sql`
    SELECT pu.id, pu.nombre, pu.sede, ur.nombre AS responsable,
           u.cerrada_en, u.conforme,
           (SELECT count(*)::int FROM hallazgos h WHERE h.punto_uso_id = pu.id AND h.estado = 'abierto') AS abiertos,
           (SELECT va.id FROM verificaciones va WHERE va.punto_uso_id = pu.id AND va.estado = 'abierta') AS abierta_id
    FROM puntos_uso pu
    JOIN usuarios ur ON ur.id = pu.responsable_id
    LEFT JOIN LATERAL (
      SELECT ve.cerrada_en, ve.conforme FROM verificaciones ve
      WHERE ve.punto_uso_id = pu.id AND ve.estado = 'cerrada' ORDER BY ve.cerrada_en DESC, ve.id DESC LIMIT 1
    ) u ON true
    WHERE pu.activo AND ${filtroPuntos(sql, sesion)}
    ORDER BY pu.orden, pu.nombre, pu.id`;
  const cada = distribucion.verificacionCadaDias * 86_400_000;
  const puntos: EstadoPunto[] = filas.map((f) => {
    const cerradaEn = (f.cerrada_en as Date | null) ?? null;
    const proxima = cerradaEn ? new Date(cerradaEn.getTime() + cada) : null;
    return {
      puntoId: Number(f.id),
      nombre: f.nombre as string,
      sede: (f.sede as string | null) ?? null,
      responsable: f.responsable as string,
      ultima: cerradaEn ? { cerradaEn, conforme: f.conforme as boolean } : null,
      hallazgosAbiertos: Number(f.abiertos),
      abiertaId: f.abierta_id === null ? null : Number(f.abierta_id),
      proxima,
      vencida: proxima === null || proxima <= ahora,
    };
  });
  const verificados = puntos.filter((p) => p.ultima).map((p) => ({ conforme: p.ultima!.conforme }));
  return {
    puntos,
    conformidad: {
      ...conformidad(verificados, distribucion.umbralConformidadPct),
      umbral: distribucion.umbralConformidadPct,
      puntos: verificados.length,
    },
  };
}

export type FiltroHistorial = { puntoId?: number; desde?: Date; hasta?: Date; resultado?: "conforme" | "no_conforme" };

export type FilaHistorial = {
  id: number;
  puntoId: number;
  punto: string;
  sede: string | null;
  cerradaEn: Date;
  verificoNombre: string;
  conforme: boolean;
  itemsConformes: number;
  itemsTotal: number;
  hallazgosAbiertos: number;
  propioPunto: boolean;
};

function condicion(sql: Cliente, sesion: SesionFlujo, f: FiltroHistorial) {
  return sql`ve.estado = 'cerrada' AND ${filtroPuntos(sql, sesion)}
    AND ${f.puntoId === undefined ? sql`true` : sql`ve.punto_uso_id = ${f.puntoId}`}
    AND ${f.desde === undefined ? sql`true` : sql`ve.cerrada_en >= ${f.desde}`}
    AND ${f.hasta === undefined ? sql`true` : sql`ve.cerrada_en < ${f.hasta}`}
    AND ${f.resultado === undefined ? sql`true` : sql`ve.conforme = ${f.resultado === "conforme"}`}`;
}

/** Las verificaciones cerradas del periodo en el alcance de la persona, la más reciente primero. */
export async function historialVerificaciones(
  sesion: SesionFlujo,
  filtro: FiltroHistorial,
  opciones?: Opciones,
): Promise<{ filas: FilaHistorial[]; conformidad: ConformidadActual }> {
  const sql = opciones?.sql ?? obtenerSql();
  const { distribucion } = await obtenerConfigDocumental({ sql });
  const filas = await sql`
    SELECT ve.id, ve.punto_uso_id, ve.punto_nombre, pu.sede, ve.cerrada_en, uc.nombre AS verifico, ve.conforme, ve.propio_punto,
           (SELECT count(*)::int FROM verificacion_items i WHERE i.verificacion_id = ve.id AND i.respuesta = 'conforme') AS conformes,
           (SELECT count(*)::int FROM verificacion_items i WHERE i.verificacion_id = ve.id AND i.respuesta IN ('conforme', 'no_conforme')) AS total,
           (SELECT count(*)::int FROM hallazgos h WHERE h.verificacion_id = ve.id AND h.estado = 'abierto') AS abiertos
    FROM verificaciones ve
    JOIN puntos_uso pu ON pu.id = ve.punto_uso_id
    LEFT JOIN usuarios uc ON uc.id = ve.cerrada_por
    WHERE ${condicion(sql, sesion, filtro)}
    ORDER BY ve.cerrada_en DESC, ve.id DESC`;
  const resultado: FilaHistorial[] = filas.map((f) => ({
    id: Number(f.id),
    puntoId: Number(f.punto_uso_id),
    punto: f.punto_nombre as string,
    sede: (f.sede as string | null) ?? null,
    cerradaEn: f.cerrada_en as Date,
    verificoNombre: (f.verifico as string | null) ?? "—",
    conforme: f.conforme as boolean,
    itemsConformes: Number(f.conformes),
    itemsTotal: Number(f.total),
    hallazgosAbiertos: Number(f.abiertos),
    propioPunto: f.propio_punto as boolean,
  }));
  return {
    filas: resultado,
    conformidad: {
      ...conformidad(resultado, distribucion.umbralConformidadPct),
      umbral: distribucion.umbralConformidadPct,
      puntos: resultado.length,
    },
  };
}

/** Qué ítems fallan más en el periodo: conteo de «no conforme» por texto. */
export async function fallosPorItem(
  sesion: SesionFlujo,
  filtro: FiltroHistorial,
  opciones?: Opciones,
): Promise<{ texto: string; veces: number }[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`
    SELECT i.texto, count(*)::int AS veces
    FROM verificacion_items i
    JOIN verificaciones ve ON ve.id = i.verificacion_id
    JOIN puntos_uso pu ON pu.id = ve.punto_uso_id
    WHERE i.respuesta = 'no_conforme' AND ${condicion(sql, sesion, filtro)}
    GROUP BY i.texto ORDER BY veces DESC, i.texto LIMIT 10`;
  return filas.map((f) => ({ texto: f.texto as string, veces: Number(f.veces) }));
}
