/**
 * Las filas de un plan de acción (anexo 15B §4.2 y §5.3): una por actividad de un plan aprobado, de todas las rondas, y una sin
 * actividad por cada ronda en curso sin plan aprobado. Es la lectura común del Excel para el ente y del SGC-FO-14. No recibe
 * sesión ni filtra visibilidad: quien la llama le pasa hallazgos que ya decidió que se ven. Cuatro consultas por lote, no por
 * hallazgo.
 */
import type { Cliente } from "@/db/cliente";
import { cargaResuelta } from "@/lib/alcance";
import { etiquetaDeEstado } from "@/lib/mejoramiento/estados";
import { fechaLargaDeDia } from "@/lib/mejoramiento/formato";
import { ETIQUETA_METODO_ANALISIS, esReprogramada } from "@/lib/mejoramiento/textos";
import { estaAbierta, type Clase, type EstadoHallazgo, type MetodoAnalisis, type Origen, type ResultadoCierre, type TipoAccion } from "@/lib/mejoramiento/tipos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { venceLaActividad } from "./vence-actividad";

export type FilaDePlanDeAccion = {
  hallazgo: { id: number; codigo: string; titulo: string; descripcion: string; clase: Clase; origen: Origen; procesoId: number; proceso: string; planCodigo: string | null };
  ronda: number;
  /** Cuántas rondas tiene el hallazgo: con más de una, el impreso dice la ronda. */
  rondas: number;
  accion: { numero: string; tipo: TipoAccion; descripcion: string; recursos: string | null; indicadorCumplimiento: string | null; meta: string | null; causas: string; metodo: string | null } | null;
  actividad: {
    id: number; descripcion: string; responsable: string; cargo: string | null;
    inicio: string; fin: string; reprogramada: boolean; avance: number;
    estado: "abierta" | "en_proceso" | "terminada" | "cancelada"; vencida: boolean;
    ultimoSeguimiento: { fecha: string; realizado: string } | null; archivos: number;
  } | null;
  /** Solo cuando `actividad` es nula: en qué va el hallazgo o la ronda (anexo §5.3). */
  enQueVa: string | null;
};

const texto = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

function agrupar<T>(filas: readonly T[], clave: (f: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const f of filas) {
    const k = clave(f);
    const l = m.get(k);
    if (l) l.push(f);
    else m.set(k, [f]);
  }
  return m;
}

/** En qué va un hallazgo cuya ronda en curso no tiene plan aprobado (anexo §5.3). */
function enQueVa(h: Record<string, unknown>): string {
  const estado = h.estado as EstadoHallazgo;
  const cerrado = texto(h.cerrado);
  if (estado === "cerrado" && h.resultado_cierre === "con_correccion") {
    return `Cerrado con corrección${cerrado ? ` el ${fechaLargaDeDia(cerrado)}` : ""}${texto(h.correccion_descripcion) ? `: ${h.correccion_descripcion}` : ""}`;
  }
  if (estado === "cerrado" && h.resultado_cierre === "sin_accion") return `Cerrado sin acción${cerrado ? ` el ${fechaLargaDeDia(cerrado)}` : ""}`;
  if (estado === "por_formular") return "Por formular: plan de acción en formulación";
  return etiquetaDeEstado({
    estado,
    resultadoCierre: (h.resultado_cierre as ResultadoCierre | null) ?? null,
    correccionRequerida: (h.correccion_requerida as boolean | null) ?? null,
  });
}

export async function filasDePlanDeAccion(sql: Cliente, hallazgoIds: number[], ahora: Date): Promise<FilaDePlanDeAccion[]> {
  if (hallazgoIds.length === 0) return [];
  const ids = sql.array(hallazgoIds);
  const hoy = fechaEnZona(ahora, zonaHoraria());
  const [hallazgos, actividades, causas, analisis] = await Promise.all([
    sql`SELECT h.id, h.codigo, h.titulo, h.descripcion, h.clase, h.origen, h.proceso_id, p.nombre AS proceso, pl.codigo AS plan_codigo,
        h.estado, h.ronda, h.resultado_cierre, h.correccion_requerida, h.correccion_descripcion, to_char(h.cerrado_en, 'YYYY-MM-DD') AS cerrado
      FROM mejora_hallazgos h
      JOIN procesos p ON p.id = h.proceso_id
      LEFT JOIN mejora_clasificacion cl ON cl.hallazgo_id = h.id
      LEFT JOIN mejora_planes pl ON pl.id = cl.plan_id
      WHERE h.id = ANY(${ids}::bigint[])
      ORDER BY h.codigo`,
    sql`SELECT a.id, a.hallazgo_id, a.accion_id, a.orden, a.descripcion, u.nombre AS responsable, cg.nombre AS cargo,
        a.avance, a.estado, a.reprogramaciones, to_char(a.inicio, 'YYYY-MM-DD') AS inicio, to_char(a.fin, 'YYYY-MM-DD') AS fin,
        to_char(${venceLaActividad(sql)}, 'YYYY-MM-DD') AS vence, ${cargaResuelta(sql)} AS entregada,
        ac.orden AS accion_orden, ac.tipo, ac.descripcion AS accion, ac.recursos, ac.indicador_cumplimiento, ac.meta, r.numero AS ronda,
        (SELECT count(*) FROM archivos f WHERE f.contexto = 'mejora_actividad' AND f.contexto_id = a.id AND f.version_id IS NULL) AS archivos,
        seg.fecha AS seg_fecha, seg.realizado AS seg_realizado
      FROM mejora_actividades a
      JOIN mejora_hallazgos h ON h.id = a.hallazgo_id
      JOIN mejora_acciones ac ON ac.id = a.accion_id
      JOIN mejora_rondas r ON r.id = ac.ronda_id
      JOIN usuarios u ON u.id = a.responsable_id
      LEFT JOIN cargos cg ON cg.id = u.cargo_id
      LEFT JOIN LATERAL (SELECT to_char(s.fecha, 'YYYY-MM-DD') AS fecha, s.realizado FROM mejora_seguimientos s
        WHERE s.actividad_id = a.id ORDER BY s.fecha DESC, s.id DESC LIMIT 1) seg ON true
      WHERE a.hallazgo_id = ANY(${ids}::bigint[]) AND a.fin_original IS NOT NULL
      ORDER BY r.numero, ac.orden, ac.id, a.orden, a.id`,
    sql`SELECT v.accion_id, c.texto FROM mejora_accion_causas v JOIN mejora_causas c ON c.id = v.causa_id
      WHERE v.hallazgo_id = ANY(${ids}::bigint[]) ORDER BY c.orden, c.id`,
    sql`SELECT x.hallazgo_id, r.numero AS ronda, x.metodo FROM mejora_analisis x JOIN mejora_rondas r ON r.id = x.ronda_id
      WHERE x.hallazgo_id = ANY(${ids}::bigint[]) ORDER BY x.orden, x.id`,
  ]);

  const causasDe = agrupar(causas, (x) => String(x.accion_id));
  const metodosDe = agrupar(analisis, (x) => `${x.hallazgo_id}:${x.ronda}`);
  const actividadesDe = agrupar(actividades, (x) => `${x.hallazgo_id}:${x.ronda}`);

  const filas: FilaDePlanDeAccion[] = [];
  for (const h of hallazgos) {
    const id = Number(h.id);
    const rondas = Number(h.ronda);
    const hallazgo: FilaDePlanDeAccion["hallazgo"] = {
      id,
      codigo: h.codigo as string,
      titulo: h.titulo as string,
      descripcion: h.descripcion as string,
      clase: h.clase as Clase,
      origen: h.origen as Origen,
      procesoId: Number(h.proceso_id),
      proceso: h.proceso as string,
      planCodigo: texto(h.plan_codigo),
    };
    for (let ronda = 1; ronda <= rondas; ronda++) {
      const suyas = actividadesDe.get(`${id}:${ronda}`) ?? [];
      if (suyas.length === 0) {
        // Una ronda anterior siempre tuvo plan aprobado; solo la ronda en curso puede ir sin él.
        if (ronda === rondas) filas.push({ hallazgo, ronda, rondas, accion: null, actividad: null, enQueVa: enQueVa(h) });
        continue;
      }
      const metodos = [...new Set((metodosDe.get(`${id}:${ronda}`) ?? []).map((x) => x.metodo as MetodoAnalisis))].map((m) => ETIQUETA_METODO_ANALISIS[m]);
      for (const a of suyas) {
        const estado = a.estado as NonNullable<FilaDePlanDeAccion["actividad"]>["estado"];
        const vence = a.vence as string;
        filas.push({
          hallazgo,
          ronda,
          rondas,
          accion: {
            numero: `A${Number(a.accion_orden)}`,
            tipo: a.tipo as TipoAccion,
            descripcion: a.accion as string,
            recursos: texto(a.recursos),
            indicadorCumplimiento: texto(a.indicador_cumplimiento),
            meta: texto(a.meta),
            causas: (causasDe.get(String(a.accion_id)) ?? []).map((x) => x.texto as string).join("; "),
            metodo: metodos.length > 0 ? metodos.join(", ") : null,
          },
          actividad: {
            id: Number(a.id),
            descripcion: a.descripcion as string,
            responsable: a.responsable as string,
            cargo: texto(a.cargo),
            inicio: a.inicio as string,
            fin: a.fin as string,
            reprogramada: esReprogramada({ reprogramaciones: Number(a.reprogramaciones) }),
            avance: Number(a.avance),
            estado,
            vencida: a.entregada === true && estaAbierta(estado) && vence < hoy,
            ultimoSeguimiento: a.seg_fecha ? { fecha: a.seg_fecha as string, realizado: a.seg_realizado as string } : null,
            archivos: Number(a.archivos),
          },
          enQueVa: null,
        });
      }
    }
  }
  return filas;
}
