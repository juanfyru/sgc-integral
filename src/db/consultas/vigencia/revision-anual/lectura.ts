/**
 * La revisión anual tal como la ve cada persona (spec 13C §9.2 y §9.7): el avance por proceso y la lista de documentos
 * con su decisión y sus insumos. La foto es institucional, pero lo que se muestra se recorta: el líder ve sus procesos,
 * sus documentos y las cifras de ellos (`alcanceProcesos`), y un documento que la persona no ve (`filtroAcceso`) no sale
 * en la lista. Los insumos de la abierta se calculan al mostrar, de tablas que ya existen, sobre el año de la revisión;
 * los de la cerrada son los que se congelaron al cerrarla.
 */
import { obtenerSql, type Cliente } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { nombreSql } from "@/db/consultas/normograma/busqueda";
import { alcanceProcesos, filtroAcceso, puedeDecidirEn, puedeVerRevisionAnual } from "@/lib/alcance";
import { porcentaje } from "@/lib/distribucion/acuses";
import { finDeFecha } from "@/lib/tramites/plazos";
import type { Etapa } from "@/lib/tramites/tipos";
import { DECISIONES, type Decision } from "@/lib/vigencia/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { columnasDeVigencia, type FilaSemaforo } from "../fragmentos";
import { PENDIENTE, cerosPorDecision, estaPendiente, leerRevisiones, type Opciones, type Revision } from "./comun";

export type DecisionDeDocumento = {
  decision: Decision;
  por: string | null;
  en: Date;
  tramite: { id: number; numero: string; etapa: Etapa } | null;
  ratificacionId: number | null;
  verificacionId: number | null;
};

export type InsumosDeDocumento = {
  /** Los acuses de la versión vigente; nulo si no pidió ninguno (o ya no tiene vigente). */
  acuses: { confirmados: number; total: number; porcentaje: number | null } | null;
  /** Hallazgos abiertos o cerrados en el año que mencionan el documento o una copia suya. */
  hallazgos: number;
  /** Las normas enlazadas al documento que cambiaron de estado en el año. */
  normasCambiadas: string[];
  /** Consultas y descargas del año. */
  consultas: number;
  /** Trámites sobre el documento creados o cerrados en el año. */
  tramites: number;
};

export type ProcesoDeRevision = {
  id: number;
  nombre: string;
  sigla: string;
  /** Sus líderes activos, por nombre; nulo si no tiene. */
  lider: string | null;
  documentos: number;
  /** Los que tienen una decisión efectiva: no cuenta lo que está por decidir (`estaPendiente`). */
  decididos: number;
  porDecision: Record<Decision, number>;
  normograma: { resultado: "sin_novedad" | "cambios"; nota: string | null; por: string; en: Date } | null;
  puedeDecidir: boolean;
};

export type DocumentoDeRevision = FilaSemaforo & {
  /** Nula mientras la revisión está abierta y el documento no tiene decisión. */
  decision: DecisionDeDocumento | null;
  /**
   * Verdadero, con la revisión abierta, si el documento está por decidir: sin decisión, o con la de un trámite que murió
   * (que conserva su `decision` con el trámite, para decidir de nuevo).
   */
  porDecidir: boolean;
  insumos: InsumosDeDocumento;
};

export type DetalleRevision = Revision & {
  procesos: ProcesoDeRevision[];
  /** Los de la foto que siguen vigentes y la persona ve. */
  documentos: DocumentoDeRevision[];
};

const SIN_INSUMOS: InsumosDeDocumento = { acuses: null, hallazgos: 0, normasCambiadas: [], consultas: 0, tramites: 0 };

/** Del 1 de enero del año al 1 de enero del siguiente, en la zona de la instalación. */
function limitesDelAnio(anio: number, zona: string): { inicio: Date; fin: Date; primerDia: string; ultimoDia: string } {
  return {
    inicio: new Date(finDeFecha(`${anio - 1}-12-31`, zona).getTime() + 1),
    fin: new Date(finDeFecha(`${anio}-12-31`, zona).getTime() + 1),
    primerDia: `${anio}-01-01`,
    ultimoDia: `${anio}-12-31`,
  };
}

/**
 * Los insumos de cada documento de `ids` en el año `anio`, con una consulta agrupada por fuente; sin filtro de acceso
 * (quien llama ya recortó `ids`). Un documento sin versión vigente queda con los acuses nulos.
 */
export async function insumosDe(sql: Cliente, ids: number[], anio: number): Promise<Map<number, InsumosDeDocumento>> {
  const insumos = new Map<number, InsumosDeDocumento>(ids.map((id) => [id, { ...SIN_INSUMOS, normasCambiadas: [] }]));
  if (ids.length === 0) return insumos;
  const a = limitesDelAnio(anio, zonaHoraria());
  const enElAnio = (columna: ReturnType<Cliente>) => sql`(${columna} >= ${a.inicio} AND ${columna} < ${a.fin})`;
  const [acuses, hallazgos, normas, consultas, tramites] = await Promise.all([
    sql`SELECT v.documento_id, count(*) FILTER (WHERE ac.estado = 'confirmado')::int AS confirmados,
        count(*) FILTER (WHERE ac.estado = 'pendiente')::int AS pendientes
      FROM acuses ac JOIN documento_versiones v ON v.id = ac.version_id AND v.estado = 'vigente'
      WHERE v.documento_id = ANY(${ids})
      GROUP BY v.documento_id`,
    sql`SELECT COALESCE(h.documento_id, cv.documento_id) AS documento_id, count(*)::int AS n
      FROM hallazgos h
      LEFT JOIN copias_controladas c ON c.id = h.copia_id
      LEFT JOIN documento_versiones cv ON cv.id = c.version_id
      WHERE COALESCE(h.documento_id, cv.documento_id) = ANY(${ids}) AND (${enElAnio(sql`h.creado_en`)} OR ${enElAnio(sql`h.cerrado_en`)})
      GROUP BY 1`,
    sql`SELECT nd.documento_id, array_agg(DISTINCT ${nombreSql(sql)}) AS normas
      FROM norma_documentos nd
      JOIN normas n ON n.id = nd.norma_id
      JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
      WHERE nd.documento_id = ANY(${ids})
        AND EXISTS (SELECT 1 FROM norma_cambios c WHERE c.norma_id = n.id AND c.fecha BETWEEN ${a.primerDia} AND ${a.ultimoDia})
      GROUP BY nd.documento_id`,
    sql`SELECT documento_id, count(*)::int AS n FROM eventos_consulta
      WHERE documento_id = ANY(${ids}) AND ${enElAnio(sql`creado_en`)}
      GROUP BY documento_id`,
    sql`SELECT documento_id, count(*)::int AS n FROM tramites
      WHERE documento_id = ANY(${ids}) AND (${enElAnio(sql`creado_en`)} OR ${enElAnio(sql`cerrado_en`)})
      GROUP BY documento_id`,
  ]);
  for (const f of acuses) {
    const confirmados = Number(f.confirmados);
    const pendientes = Number(f.pendientes);
    if (confirmados + pendientes > 0) {
      insumos.get(Number(f.documento_id))!.acuses = { confirmados, total: confirmados + pendientes, porcentaje: porcentaje(confirmados, pendientes) };
    }
  }
  for (const f of hallazgos) insumos.get(Number(f.documento_id))!.hallazgos = Number(f.n);
  for (const f of normas) insumos.get(Number(f.documento_id))!.normasCambiadas = [...(f.normas as string[])].sort((x, y) => x.localeCompare(y, "es"));
  for (const f of consultas) insumos.get(Number(f.documento_id))!.consultas = Number(f.n);
  for (const f of tramites) insumos.get(Number(f.documento_id))!.tramites = Number(f.n);
  return insumos;
}

/** Los insumos congelados en la fila de una revisión cerrada; una fila que no los tiene (`{}`) da los de cero. */
function insumosCongelados(valor: unknown): InsumosDeDocumento {
  const v = (valor ?? {}) as Partial<InsumosDeDocumento>;
  return {
    acuses: v.acuses ?? null,
    hallazgos: v.hallazgos ?? 0,
    normasCambiadas: v.normasCambiadas ?? [],
    consultas: v.consultas ?? 0,
    tramites: v.tramites ?? 0,
  };
}

/**
 * Una revisión con sus procesos y sus documentos para quien tiene `vigencia.ver` (`puedeVerRevisionAnual`); `null` si
 * no la ve o no existe. El líder recibe solo sus procesos, los documentos de ellos y sus cifras (`totales` es la suma de
 * sus procesos); las cifras de cada proceso cuentan toda su foto, y la lista, los documentos que siguen vigentes y la
 * persona ve.
 */
export async function obtenerRevision(id: number, sesion: SesionFlujo, opciones?: Opciones): Promise<DetalleRevision | null> {
  if (!puedeVerRevisionAnual(sesion)) return null;
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const [revision] = await leerRevisiones(sql, sql`ra.id = ${id}`);
  if (!revision) return null;
  const alcance = await alcanceProcesos(sesion, { sql });
  const deSuAlcance = (columna: ReturnType<Cliente>) => (alcance.todos ? sql`true` : sql`${columna} = ANY(${alcance.procesoIds})`);
  const abierta = revision.estado === "abierta";

  const [procesos, decisiones] = await Promise.all([
    sql`SELECT p.id, p.nombre, p.sigla, rap.normograma_resultado, rap.normograma_nota, rap.normograma_en, un.nombre AS normograma_por,
        (SELECT string_agg(lu.nombre, ', ' ORDER BY lu.nombre) FROM usuario_procesos lup
          JOIN usuarios lu ON lu.id = lup.usuario_id AND lu.activo AND lu.rol = 'lider_proceso'
          WHERE lup.proceso_id = p.id) AS lider
      FROM revision_anual_procesos rap
      JOIN procesos p ON p.id = rap.proceso_id
      LEFT JOIN usuarios un ON un.id = rap.normograma_por
      WHERE rap.revision_id = ${id} AND ${deSuAlcance(sql`rap.proceso_id`)}
      ORDER BY p.nombre, p.id`,
    sql`SELECT rad.documento_id, rad.decision, u.nombre AS por, rad.actualizado_en, rad.ratificacion_id, rad.verificacion_id, rad.insumos,
        t.id AS tramite_id, t.numero AS tramite_numero, t.etapa AS tramite_etapa, COALESCE(dp.proceso_id, s.proceso_id) AS proceso_id
      FROM revision_anual_decisiones rad
      JOIN documento_proceso dp ON dp.documento_id = rad.documento_id AND dp.es_principal
      LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
      LEFT JOIN usuarios u ON u.id = rad.usuario_id
      LEFT JOIN tramites t ON t.id = rad.tramite_id
      WHERE rad.revision_id = ${id} AND ${deSuAlcance(sql`COALESCE(dp.proceso_id, s.proceso_id)`)}`,
  ]);

  const decisionDe = new Map<number, { decision: DecisionDeDocumento | null; pendiente: boolean; congelados: InsumosDeDocumento }>();
  const conteos = new Map<number, { porDecision: Record<Decision, number>; pendientes: number }>();
  for (const f of decisiones) {
    const decision = f.decision as Decision;
    const tramite = f.tramite_id === null ? null : { id: Number(f.tramite_id), numero: f.tramite_numero as string, etapa: f.tramite_etapa as Etapa };
    const ratificacionId = f.ratificacion_id === null ? null : Number(f.ratificacion_id);
    const verificacionId = f.verificacion_id === null ? null : Number(f.verificacion_id);
    const pendiente = estaPendiente({ decision, ratificacionId, verificacionId, tramiteEtapa: tramite?.etapa ?? null });
    const conteo = conteos.get(Number(f.proceso_id)) ?? { porDecision: cerosPorDecision(), pendientes: 0 };
    conteo.porDecision[decision] += 1;
    if (pendiente) conteo.pendientes += 1;
    conteos.set(Number(f.proceso_id), conteo);
    decisionDe.set(Number(f.documento_id), {
      decision:
        abierta && decision === PENDIENTE
          ? null
          : { decision, por: (f.por as string | null) ?? null, en: new Date(f.actualizado_en as string), tramite, ratificacionId, verificacionId },
      pendiente,
      congelados: insumosCongelados(f.insumos),
    });
  }

  const ids = [...decisionDe.keys()];
  const filas = ids.length === 0 ? [] : await columnasDeVigencia(sql, sql`d.id = ANY(${ids}) AND ${filtroAcceso(sql, sesion)}`, ahora);
  const calculados = abierta ? await insumosDe(sql, filas.map((f) => f.documentoId), revision.anio) : null;

  const procesosDeLaRevision: ProcesoDeRevision[] = procesos.map((p) => {
    const conteo = conteos.get(Number(p.id)) ?? { porDecision: cerosPorDecision(), pendientes: 0 };
    const documentos = Object.values(conteo.porDecision).reduce((a, b) => a + b, 0);
    return {
      id: Number(p.id),
      nombre: p.nombre as string,
      sigla: p.sigla as string,
      lider: (p.lider as string | null) ?? null,
      documentos,
      decididos: documentos - conteo.pendientes,
      porDecision: conteo.porDecision,
      normograma:
        p.normograma_resultado === null
          ? null
          : {
              resultado: p.normograma_resultado as "sin_novedad" | "cambios",
              nota: (p.normograma_nota as string | null) ?? null,
              por: p.normograma_por as string,
              en: new Date(p.normograma_en as string),
            },
      puedeDecidir: abierta && puedeDecidirEn(sesion, Number(p.id), alcance),
    };
  });

  // Quien no alcanza todos los procesos ve las cifras de los suyos, no las de la entidad.
  let totales = revision.totales;
  if (!alcance.todos) {
    const suma = cerosPorDecision();
    for (const p of procesosDeLaRevision) for (const d of DECISIONES) suma[d] += p.porDecision[d];
    totales = { ...suma, documentos: procesosDeLaRevision.reduce((s, p) => s + p.documentos, 0) };
  }

  return {
    ...revision,
    totales,
    procesos: procesosDeLaRevision,
    documentos: filas.map((f) => {
      const d = decisionDe.get(f.documentoId)!;
      return {
        ...f,
        decision: d.decision,
        porDecidir: abierta && d.pendiente,
        insumos: calculados ? calculados.get(f.documentoId)! : d.congelados,
      };
    }),
  };
}
