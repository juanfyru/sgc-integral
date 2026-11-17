/**
 * Lecturas de los hallazgos de mejoramiento (spec 15 §6.3, §8.1 y §16.2): la lista con sus cifras y el detalle. Toda
 * lectura pasa por `filtroHallazgos` (`src/lib/alcance.ts`): quien no ve un hallazgo no lo recibe, no lo cuenta, y un
 * identificador que no existe y uno que no se ve responden igual (nulo). El turno y lo vencido se calculan al leer.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { lideresDeProceso } from "@/db/consultas/tramites";
import { filtroHallazgos, participacionEnHallazgo } from "@/lib/alcance";
import { etiquetaDeEstado, turnoDe } from "@/lib/mejoramiento/estados";
import { esExterno } from "@/lib/mejoramiento/origenes";
import {
  TERMINALES,
  type Clase,
  type Criticidad,
  type EstadoHallazgo,
  type HallazgoBase,
  type Origen,
  type ResultadoCierre,
} from "@/lib/mejoramiento/tipos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { activosDeRol, quienTieneElTurno } from "./avisos";

type Opciones = { sql?: Cliente; ahora?: Date };

export type FiltroDeLista = {
  q?: string;
  procesoId?: number;
  origen?: Origen;
  clase?: Clase;
  criticidad?: Criticidad;
  estado?: EstadoHallazgo | "abiertos" | "reabiertos" | "sin_accion";
  soloVencidos?: boolean;
};

export type FilaDeHallazgo = {
  id: number;
  codigo: string;
  titulo: string;
  clase: Clase;
  criticidad: Criticidad | null;
  origen: Origen;
  proceso: string;
  estado: EstadoHallazgo;
  etiqueta: string;
  marcas: string[];
  turno: string;
  avance: number | null;
  vence: Date | null;
  prioridadAlta: boolean;
};

export type CifrasDeLista = {
  abiertos: number;
  conAlgoVencido: number;
  esperanSuDecision: number;
  enEspera: number;
  reabiertos: number;
};

const idONulo = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const esTerminal = (e: EstadoHallazgo) => TERMINALES.includes(e);

function aBase(f: Record<string, unknown>): HallazgoBase {
  return {
    id: Number(f.id),
    codigo: f.codigo as string,
    clase: f.clase as Clase,
    criticidad: (f.criticidad as Criticidad | null) ?? null,
    origen: f.origen as Origen,
    estado: f.estado as EstadoHallazgo,
    ronda: Number(f.ronda),
    procesoId: Number(f.proceso_id),
    reincidenteDe: idONulo(f.reincidente_de),
    correccionRequerida: (f.correccion_requerida as boolean | null) ?? null,
    accionRequerida: (f.accion_requerida as boolean | null) ?? null,
    resultadoCierre: (f.resultado_cierre as ResultadoCierre | null) ?? null,
    registradoPor: Number(f.registrado_por),
  };
}

const ADMIN = "Administrador del SGC";

/**
 * Con quién está el hallazgo, en palabras, según los usuarios activos de hoy (nunca se guarda): si el turno es del líder y
 * el proceso ya no tiene ninguno activo, es del Administrador del SGC.
 */
export async function turnoEnTexto(tx: Cliente, h: HallazgoBase): Promise<string> {
  const turno = turnoDe(h.estado);
  if (!turno) return esTerminal(h.estado) ? "Sin pendientes" : "Nadie por ahora";
  switch (turno) {
    case "lideres":
      return (await lideresDeProceso(h.procesoId, { sql: tx })).length > 0 ? "La líder del proceso" : ADMIN;
    case "registrador": {
      const quienes = await quienTieneElTurno(tx as unknown as TransactionSql, h);
      return quienes.includes(h.registradoPor) ? "Quien lo registró" : ADMIN;
    }
    case "arbitro": {
      const gerencia = await activosDeRol(tx, ["gerencia"]);
      const quienes = await quienTieneElTurno(tx as unknown as TransactionSql, h);
      return quienes.length > 0 && quienes.every((id) => gerencia.includes(id)) ? "Gerencia" : ADMIN;
    }
    case "admin":
      return ADMIN;
    case "gerencia":
      return "Gerencia";
    case "responsables":
      return "Los responsables de las actividades";
    case "verificadores":
    case "validadores":
      return "Quien puede verificar";
  }
}

/** Cuántas actividades sin terminar de este hallazgo tienen la fecha de fin antes de hoy (en la zona). */
const ALGO_VENCIDO = (sql: Cliente, hoy: string) => sql`EXISTS (
  SELECT 1 FROM mejora_actividades va
  WHERE va.hallazgo_id = h.id AND va.estado NOT IN ('terminada', 'cancelada') AND va.fin < ${hoy}::date)`;

/** El avance de la ronda en curso: el promedio de sus actividades que siguen vivas; nulo si no hay. */
const AVANCE = (sql: Cliente) => sql`(
  SELECT round(avg(aa.avance))::int
  FROM mejora_actividades aa
  JOIN mejora_acciones ac ON ac.id = aa.accion_id
  JOIN mejora_rondas ar ON ar.id = ac.ronda_id
  WHERE aa.hallazgo_id = h.id AND ar.numero = h.ronda AND aa.estado <> 'cancelada')`;

/** `%` y `_` de la búsqueda se toman como texto, no como comodines. */
const comoPatron = (q: string) => "%" + q.trim().replace(/[\\%_]/g, (m) => "\\" + m) + "%";

/**
 * La lista de hallazgos que la persona ve, con las cifras de lo que ve (no de lo filtrado). Orden por omisión: los
 * externos primero, luego los que tienen algo vencido, luego por vencimiento ascendente con los nulos al final.
 */
export async function listarHallazgos(
  sesion: SesionFlujo,
  filtro: FiltroDeLista,
  opciones?: Opciones,
): Promise<{ filas: FilaDeHallazgo[]; cifras: CifrasDeLista }> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const hoy = fechaEnZona(ahora, zonaHoraria());
  const q = filtro.q?.trim();
  const coincide = q
    ? sql`(unaccent(lower(h.codigo)) LIKE unaccent(lower(${comoPatron(q)})) OR unaccent(lower(h.titulo)) LIKE unaccent(lower(${comoPatron(q)})))`
    : sql`true`;
  const filas = await sql`
    SELECT h.id, h.codigo, h.titulo, h.clase, h.criticidad, h.origen, h.estado, h.ronda, h.proceso_id, h.reincidente_de,
      h.correccion_requerida, h.accion_requerida, h.resultado_cierre, h.registrado_por, h.vence_en, h.cargado,
      p.nombre AS proceso, ${coincide} AS coincide, ${ALGO_VENCIDO(sql, hoy)} AS algo_vencido, ${AVANCE(sql)} AS avance
    FROM mejora_hallazgos h
    JOIN procesos p ON p.id = h.proceso_id
    WHERE ${filtroHallazgos(sql, sesion)}`;

  const cifras: CifrasDeLista = { abiertos: 0, conAlgoVencido: 0, esperanSuDecision: 0, enEspera: 0, reabiertos: 0 };
  const resultado: Array<FilaDeHallazgo & { vencido: boolean }> = [];
  for (const f of filas) {
    const h = aBase(f);
    const abierto = !esTerminal(h.estado);
    const vence = (f.vence_en as Date | null) ?? null;
    const pasoVencido = abierto && vence !== null && vence.getTime() < ahora.getTime();
    const vencido = abierto && (f.algo_vencido === true || pasoVencido);
    const reabierto = abierto && h.ronda > 1;
    const turnoMio = abierto && turnoDe(h.estado) !== null && (await quienTieneElTurno(sql as unknown as TransactionSql, h)).includes(sesion.usuarioId);
    if (abierto) cifras.abiertos++;
    if (vencido) cifras.conAlgoVencido++;
    if (h.estado === "en_espera") cifras.enEspera++;
    if (reabierto) cifras.reabiertos++;
    if (turnoMio) cifras.esperanSuDecision++;

    if (f.coincide !== true) continue;
    if (filtro.procesoId !== undefined && h.procesoId !== filtro.procesoId) continue;
    if (filtro.origen && h.origen !== filtro.origen) continue;
    if (filtro.clase && h.clase !== filtro.clase) continue;
    if (filtro.criticidad && h.criticidad !== filtro.criticidad) continue;
    if (filtro.soloVencidos && !vencido) continue;
    const e = filtro.estado;
    if (e === "abiertos" && !abierto) continue;
    if (e === "reabiertos" && !reabierto) continue;
    if (e === "sin_accion" && !(h.resultadoCierre === "sin_accion" || h.accionRequerida === false)) continue;
    if (e && e !== "abiertos" && e !== "reabiertos" && e !== "sin_accion" && h.estado !== e) continue;

    const marcas: string[] = [];
    if (esExterno(h.origen)) marcas.push("Externo");
    if (reabierto) marcas.push("Reabierto");
    if (h.reincidenteDe !== null) marcas.push("Reincidente");
    if (f.cargado === true) marcas.push("Cargado");
    if (vencido) marcas.push("Con algo vencido");
    resultado.push({
      id: h.id,
      codigo: h.codigo,
      titulo: f.titulo as string,
      clase: h.clase,
      criticidad: h.criticidad,
      origen: h.origen,
      proceso: f.proceso as string,
      estado: h.estado,
      etiqueta: etiquetaDeEstado(h),
      marcas,
      turno: await turnoEnTexto(sql, h),
      avance: idONulo(f.avance),
      vence: abierto ? vence : null,
      prioridadAlta: abierto && esExterno(h.origen),
      vencido,
    });
  }
  resultado.sort((a, b) => {
    if (a.prioridadAlta !== b.prioridadAlta) return a.prioridadAlta ? -1 : 1;
    if (a.vencido !== b.vencido) return a.vencido ? -1 : 1;
    if (a.vence && b.vence) return a.vence.getTime() - b.vence.getTime() || a.id - b.id;
    if (a.vence || b.vence) return a.vence ? -1 : 1;
    return a.id - b.id;
  });
  return { filas: resultado.map((fila) => ({ ...fila, vencido: undefined }) as FilaDeHallazgo), cifras };
}

// ─────────────────────────────────────────────────────────────────────────────
// El detalle

export type ActividadDeDetalle = {
  id: number;
  orden: number;
  descripcion: string;
  responsableId: number;
  responsable: string;
  inicio: string;
  finOriginal: string | null;
  fin: string;
  avance: number;
  estado: string;
  reprogramaciones: number;
};

export type AccionDeDetalle = {
  id: number;
  orden: number;
  tipo: string;
  descripcion: string;
  recursos: string | null;
  indicadorCumplimiento: string | null;
  meta: string | null;
  causaIds: number[];
  actividades: ActividadDeDetalle[];
};

export type RondaDeDetalle = {
  id: number;
  numero: number;
  estadoPlan: string;
  formularAntesDe: Date | null;
  enviadoEn: Date | null;
  aprobadoEn: Date | null;
  aprobadoRol: string | null;
  fechaEvaluacion: string | null;
  cierrePrevisto: Date | null;
  resultado: string | null;
  analisis: Array<{ id: number; orden: number; metodo: string; equipo: string | null; observaciones: string | null; contenido: unknown }>;
  causas: Array<{ id: number; orden: number; texto: string; sinAccionPorque: string | null }>;
  acciones: AccionDeDetalle[];
  ajustes: Array<{
    id: number;
    tipo: string;
    estado: string;
    actividadId: number | null;
    causa: string;
    datos: unknown;
    pedidoEn: Date;
    decididoEn: Date | null;
    nota: string | null;
  }>;
};

export type DetalleDeHallazgo = {
  /** `completo`, o `actividad` si solo es responsable de una actividad: lo ve en texto, sin historial y sin archivos de otros. */
  ve: "completo" | "actividad";
  id: number;
  codigo: string;
  titulo: string;
  descripcion: string;
  clase: Clase;
  criticidad: Criticidad | null;
  origen: Origen;
  fuente: string | null;
  referenciaCaso: string | null;
  detectadoEn: string;
  procesoId: number;
  proceso: string;
  requisitoClausula: string | null;
  riesgo: string | null;
  estado: EstadoHallazgo;
  etiqueta: string;
  ronda: number;
  registradoPor: string;
  registradoEn: Date;
  cargado: boolean;
  reincidenteDe: number | null;
  fechaLimiteEnte: string | null;
  vence: Date | null;
  correccion: {
    requerida: boolean | null;
    descripcion: string | null;
    responsable: string | null;
    implementadaEn: string | null;
    registradaEn: Date | null;
  };
  decision: { accionRequerida: boolean | null; justificacion: string | null; decididaEn: Date | null };
  cierre: { resultado: ResultadoCierre | null; cerradoEn: Date | null; lecciones: string | null; anuladoMotivo: string | null };
  rondas: RondaDeDetalle[];
  ocurrencias: Array<{ id: number; fecha: string; descripcion: string; origen: string }>;
  eventos: Array<{ id: number; tipo: string; ronda: number; detalle: unknown; quien: string | null; cuando: Date; fuera: boolean }>;
  turno: string;
  loQueSigue: string;
};

/** Lo que le toca a quien tiene el turno, por estado. */
const LE_TOCA: Partial<Record<EstadoHallazgo, string>> = {
  por_aceptar: "aceptar el hallazgo o rechazarlo",
  rechazo: "decidir si retira el rechazo o lo sostiene",
  arbitraje: "arbitrar el rechazo",
  por_corregir: "registrar la corrección",
  por_decidir: "decidir si lleva acción correctiva",
  por_validar: "validar la corrección",
  por_formular: "formular el análisis y el plan",
  en_revision: "revisar el plan",
  en_aprobacion: "aprobar el plan",
  en_ejecucion: "ejecutar sus actividades",
  por_verificar: "verificar la implementación",
  por_cerrar: "cerrar el hallazgo",
};

async function loQueSigue(tx: Cliente, h: HallazgoBase, usuarioId: number, turno: string): Promise<string> {
  if (esTerminal(h.estado)) return "El hallazgo está " + etiquetaDeEstado(h).toLowerCase() + ": no tiene pasos pendientes.";
  if (h.estado === "en_espera") return "Espera el momento de evaluar la eficacia de las acciones.";
  const toca = LE_TOCA[h.estado];
  if (!toca) return "Tiene el turno: " + turno + ".";
  const mio = (await quienTieneElTurno(tx as unknown as TransactionSql, h)).includes(usuarioId);
  return mio ? "A usted le toca " + toca + "." : "Tiene el turno: " + turno + ", para " + toca + ".";
}

/**
 * El hallazgo completo para quien lo ve; nulo si no existe **o** si no lo ve (la misma respuesta). Quien lo ve solo por
 * ser responsable de una actividad lo recibe en texto, sin eventos ni ocurrencias, y sin listas de archivos (los
 * archivos llegan en la Tarea 9, con su propia regla: solo los de sus actividades).
 */
export async function leerHallazgo(sesion: SesionFlujo, id: number, opciones?: Opciones): Promise<DetalleDeHallazgo | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const sql = opciones?.sql ?? obtenerSql();
  const ve = await participacionEnHallazgo(id, sesion, { sql });
  if (ve === null) return null;
  const [f] = await sql`
    SELECT h.*, p.nombre AS proceso, ur.nombre AS registrador, uc.nombre AS correccion_responsable,
      to_char(h.detectado_en, 'YYYY-MM-DD') AS detectado, to_char(h.fecha_limite_ente, 'YYYY-MM-DD') AS limite_ente,
      to_char(h.correccion_implementada_en, 'YYYY-MM-DD') AS implementada
    FROM mejora_hallazgos h
    JOIN procesos p ON p.id = h.proceso_id
    JOIN usuarios ur ON ur.id = h.registrado_por
    LEFT JOIN usuarios uc ON uc.id = h.correccion_responsable_id
    WHERE h.id = ${id}`;
  if (!f) return null;
  const h = aBase(f);
  const turno = await turnoEnTexto(sql, h);

  const [rondas, analisis, causas, acciones, vinculos, actividades, ajustes] = await Promise.all([
    sql`SELECT id, numero, estado_plan, formular_antes_de, enviado_en, aprobado_en, aprobado_rol, resultado, cierre_previsto,
        to_char(fecha_evaluacion, 'YYYY-MM-DD') AS fecha_evaluacion
      FROM mejora_rondas WHERE hallazgo_id = ${id} ORDER BY numero`,
    sql`SELECT id, ronda_id, orden, metodo, equipo, observaciones, contenido FROM mejora_analisis WHERE hallazgo_id = ${id} ORDER BY orden, id`,
    sql`SELECT id, ronda_id, orden, texto, sin_accion_porque FROM mejora_causas WHERE hallazgo_id = ${id} ORDER BY orden, id`,
    sql`SELECT id, ronda_id, orden, tipo, descripcion, recursos, indicador_cumplimiento, meta
      FROM mejora_acciones WHERE hallazgo_id = ${id} ORDER BY orden, id`,
    sql`SELECT accion_id, causa_id FROM mejora_accion_causas WHERE hallazgo_id = ${id}`,
    sql`SELECT a.id, a.accion_id, a.orden, a.descripcion, a.responsable_id, u.nombre AS responsable, a.avance, a.estado,
        a.reprogramaciones, to_char(a.inicio, 'YYYY-MM-DD') AS inicio, to_char(a.fin_original, 'YYYY-MM-DD') AS fin_original,
        to_char(a.fin, 'YYYY-MM-DD') AS fin
      FROM mejora_actividades a JOIN usuarios u ON u.id = a.responsable_id
      WHERE a.hallazgo_id = ${id} ORDER BY a.orden, a.id`,
    sql`SELECT id, ronda_id, tipo, estado, actividad_id, causa, datos, pedido_en, decidido_en, nota
      FROM mejora_ajustes WHERE hallazgo_id = ${id} ORDER BY pedido_en, id`,
  ]);

  const rondasDeDetalle: RondaDeDetalle[] = rondas.map((r) => ({
    id: Number(r.id),
    numero: Number(r.numero),
    estadoPlan: r.estado_plan as string,
    formularAntesDe: (r.formular_antes_de as Date | null) ?? null,
    enviadoEn: (r.enviado_en as Date | null) ?? null,
    aprobadoEn: (r.aprobado_en as Date | null) ?? null,
    aprobadoRol: (r.aprobado_rol as string | null) ?? null,
    fechaEvaluacion: (r.fecha_evaluacion as string | null) ?? null,
    cierrePrevisto: (r.cierre_previsto as Date | null) ?? null,
    resultado: (r.resultado as string | null) ?? null,
    analisis: analisis
      .filter((x) => Number(x.ronda_id) === Number(r.id))
      .map((x) => ({
        id: Number(x.id),
        orden: Number(x.orden),
        metodo: x.metodo as string,
        equipo: (x.equipo as string | null) ?? null,
        observaciones: (x.observaciones as string | null) ?? null,
        contenido: x.contenido,
      })),
    causas: causas
      .filter((x) => Number(x.ronda_id) === Number(r.id))
      .map((x) => ({
        id: Number(x.id),
        orden: Number(x.orden),
        texto: x.texto as string,
        sinAccionPorque: (x.sin_accion_porque as string | null) ?? null,
      })),
    acciones: acciones
      .filter((x) => Number(x.ronda_id) === Number(r.id))
      .map((x) => ({
        id: Number(x.id),
        orden: Number(x.orden),
        tipo: x.tipo as string,
        descripcion: x.descripcion as string,
        recursos: (x.recursos as string | null) ?? null,
        indicadorCumplimiento: (x.indicador_cumplimiento as string | null) ?? null,
        meta: (x.meta as string | null) ?? null,
        causaIds: vinculos.filter((v) => Number(v.accion_id) === Number(x.id)).map((v) => Number(v.causa_id)),
        actividades: actividades
          .filter((a) => Number(a.accion_id) === Number(x.id))
          .map((a) => ({
            id: Number(a.id),
            orden: Number(a.orden),
            descripcion: a.descripcion as string,
            responsableId: Number(a.responsable_id),
            responsable: a.responsable as string,
            inicio: a.inicio as string,
            finOriginal: (a.fin_original as string | null) ?? null,
            fin: a.fin as string,
            avance: Number(a.avance),
            estado: a.estado as string,
            reprogramaciones: Number(a.reprogramaciones),
          })),
      })),
    ajustes: ajustes
      .filter((x) => Number(x.ronda_id) === Number(r.id))
      .map((x) => ({
        id: Number(x.id),
        tipo: x.tipo as string,
        estado: x.estado as string,
        actividadId: idONulo(x.actividad_id),
        causa: x.causa as string,
        datos: x.datos,
        pedidoEn: x.pedido_en as Date,
        decididoEn: (x.decidido_en as Date | null) ?? null,
        nota: (x.nota as string | null) ?? null,
      })),
  }));

  const completo = ve === "completo";
  const ocurrencias = completo
    ? await sql`SELECT id, descripcion, origen, to_char(fecha, 'YYYY-MM-DD') AS fecha
        FROM mejora_ocurrencias WHERE hallazgo_id = ${id} ORDER BY mejora_ocurrencias.fecha, id`
    : [];
  const eventos = completo
    ? await sql`SELECT e.id, e.tipo, e.ronda, e.detalle, e.fuera, e.ocurrio_en, u.nombre AS quien
        FROM mejora_eventos e LEFT JOIN usuarios u ON u.id = e.usuario_id
        WHERE e.hallazgo_id = ${id} ORDER BY e.ocurrio_en, e.id`
    : [];

  return {
    ve,
    id: h.id,
    codigo: h.codigo,
    titulo: f.titulo as string,
    descripcion: f.descripcion as string,
    clase: h.clase,
    criticidad: h.criticidad,
    origen: h.origen,
    fuente: (f.fuente as string | null) ?? null,
    referenciaCaso: (f.referencia_caso as string | null) ?? null,
    detectadoEn: f.detectado as string,
    procesoId: h.procesoId,
    proceso: f.proceso as string,
    requisitoClausula: (f.requisito_clausula as string | null) ?? null,
    riesgo: (f.riesgo as string | null) ?? null,
    estado: h.estado,
    etiqueta: etiquetaDeEstado(h),
    ronda: h.ronda,
    registradoPor: f.registrador as string,
    registradoEn: f.registrado_en as Date,
    cargado: f.cargado === true,
    reincidenteDe: h.reincidenteDe,
    fechaLimiteEnte: (f.limite_ente as string | null) ?? null,
    vence: esTerminal(h.estado) ? null : ((f.vence_en as Date | null) ?? null),
    correccion: {
      requerida: h.correccionRequerida,
      descripcion: (f.correccion_descripcion as string | null) ?? null,
      responsable: (f.correccion_responsable as string | null) ?? (f.correccion_responsable_nombre as string | null) ?? null,
      implementadaEn: (f.implementada as string | null) ?? null,
      registradaEn: (f.correccion_registrada_en as Date | null) ?? null,
    },
    decision: {
      accionRequerida: h.accionRequerida,
      justificacion: (f.accion_justificacion as string | null) ?? null,
      decididaEn: (f.accion_decidida_en as Date | null) ?? null,
    },
    cierre: {
      resultado: h.resultadoCierre,
      cerradoEn: (f.cerrado_en as Date | null) ?? null,
      lecciones: (f.lecciones as string | null) ?? null,
      anuladoMotivo: (f.anulado_motivo as string | null) ?? null,
    },
    rondas: rondasDeDetalle,
    ocurrencias: ocurrencias.map((o) => ({
      id: Number(o.id),
      fecha: o.fecha as string,
      descripcion: o.descripcion as string,
      origen: o.origen as string,
    })),
    eventos: eventos.map((e) => ({
      id: Number(e.id),
      tipo: e.tipo as string,
      ronda: Number(e.ronda),
      detalle: e.detalle,
      quien: (e.quien as string | null) ?? null,
      cuando: e.ocurrio_en as Date,
      fuera: e.fuera === true,
    })),
    turno,
    loQueSigue: await loQueSigue(sql, h, sesion.usuarioId, turno),
  };
}
