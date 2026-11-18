/**
 * La lectura de los ajustes al plan (spec 15 §10.6), sin regla de alcance: la ponen quienes la llaman. `leerHallazgo` entrega los
 * de cada ronda solo a quien ve el hallazgo completo; `leerActividad`, los de esa actividad a quien abre su página (§6.3). Sin
 * dependencias del resto del módulo, para que la usen las dos lecturas sin ciclos.
 */
import type { Cliente } from "@/db/cliente";
import { cambioDeAjuste, type CambioDeAjuste } from "@/lib/esquemas/mejoramiento";
import type { EstadoAjuste, TipoAjuste } from "@/lib/mejoramiento/tipos";

/** Un ajuste al plan (spec §10.6): lo que se pidió, por qué, quién y cuándo, y cómo se decidió. */
export type AjusteDeDetalle = {
  id: number;
  tipo: TipoAjuste;
  estado: EstadoAjuste;
  /** La actividad que reprograma o cancela; en uno que añade, la que creó al aprobarse (nula mientras tanto). */
  actividadId: number | null;
  causa: string;
  /** Lo que guarda `datos`, leído con el esquema estricto de su tipo (`cambioDeAjuste`); nulo si no se puede leer. */
  cambio: CambioDeAjuste | null;
  /** En uno que añade, el nombre del responsable de la actividad nueva. */
  responsableNuevo: string | null;
  pedidoPor: string;
  pedidoEn: Date;
  venceEn: Date | null;
  decididoPor: string | null;
  decididoEn: Date | null;
  nota: string | null;
  acta: { numero: string; fecha: string } | null;
  /** Quien mira lo decide ahora (`quienDecideAjustes`): lo calcula `leerHallazgo`; en las demás lecturas, falso. */
  puedeDecidir: boolean;
};

/** Un ajuste con su ronda y el id de quien lo pidió, para agruparlo y para saber quién lo decide. */
export type FilaDeAjuste = AjusteDeDetalle & { rondaId: number; pedidoPorId: number };

/** Los ajustes de un hallazgo o de una actividad, en el orden en que se pidieron. */
export async function leerAjustes(sql: Cliente, de: { hallazgoId: number } | { actividadId: number }): Promise<FilaDeAjuste[]> {
  const donde = "hallazgoId" in de ? sql`x.hallazgo_id = ${de.hallazgoId}` : sql`x.actividad_id = ${de.actividadId}`;
  // El responsable de una actividad que se añade va en `datos` (un id): el CASE guarda el cast.
  const filas = await sql`SELECT x.id, x.ronda_id, x.tipo, x.estado, x.actividad_id, x.causa, x.datos, x.pedido_por, x.pedido_en, x.vence_en,
      x.decidido_en, x.nota, x.acta_numero, to_char(x.acta_fecha, 'YYYY-MM-DD') AS acta_fecha,
      up.nombre AS pedido_por_nombre, ud.nombre AS decidido_por_nombre, un.nombre AS responsable_nuevo
    FROM mejora_ajustes x
    JOIN usuarios up ON up.id = x.pedido_por
    LEFT JOIN usuarios ud ON ud.id = x.decidido_por
    LEFT JOIN usuarios un ON un.id = (CASE WHEN x.tipo = 'agregar' AND jsonb_typeof(x.datos->'responsableId') = 'number'
      THEN (x.datos->>'responsableId')::bigint END)
    WHERE ${donde} ORDER BY x.pedido_en, x.id`;
  return filas.map((x) => ({
    id: Number(x.id),
    rondaId: Number(x.ronda_id),
    pedidoPorId: Number(x.pedido_por),
    tipo: x.tipo as TipoAjuste,
    estado: x.estado as EstadoAjuste,
    actividadId: x.actividad_id === null ? null : Number(x.actividad_id),
    causa: x.causa as string,
    cambio: cambioDeAjuste(x.tipo as string, x.datos),
    responsableNuevo: (x.responsable_nuevo as string | null) ?? null,
    pedidoPor: x.pedido_por_nombre as string,
    pedidoEn: x.pedido_en as Date,
    venceEn: (x.vence_en as Date | null) ?? null,
    decididoPor: (x.decidido_por_nombre as string | null) ?? null,
    decididoEn: (x.decidido_en as Date | null) ?? null,
    nota: (x.nota as string | null) ?? null,
    acta: x.acta_numero && x.acta_fecha ? { numero: x.acta_numero as string, fecha: x.acta_fecha as string } : null,
    puedeDecidir: false,
  }));
}

/** Sin la ronda ni el id de quien lo pidió: lo que viaja a la página. */
export function sinLaFila(f: FilaDeAjuste): AjusteDeDetalle {
  return {
    id: f.id,
    tipo: f.tipo,
    estado: f.estado,
    actividadId: f.actividadId,
    causa: f.causa,
    cambio: f.cambio,
    responsableNuevo: f.responsableNuevo,
    pedidoPor: f.pedidoPor,
    pedidoEn: f.pedidoEn,
    venceEn: f.venceEn,
    decididoPor: f.decididoPor,
    decididoEn: f.decididoEn,
    nota: f.nota,
    acta: f.acta,
    puedeDecidir: f.puedeDecidir,
  };
}
