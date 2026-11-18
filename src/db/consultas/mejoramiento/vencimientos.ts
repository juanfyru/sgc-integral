/**
 * La pasada de vencimientos de mejoramiento (spec 15 §14.3), que `revisarVencimientos` suma después de la de indicadores. Sus
 * pasos, cada uno con su marca:
 *
 * 1. Los pasos vencidos de un hallazgo (también la evaluación de la eficacia, cuyo plazo `venceLaEvaluacion` se calcula al
 *    leer: `en_espera` no guarda `vence_en`), de un reporte por clasificar y de un ajuste por decidir: `mejora.vencido` a quien
 *    tiene el turno (`quienTieneElTurno`, `quienesVerifican`, los Admin SGC, `quienDecideAjustes`); marca `aviso_vencido_en`.
 * 2. Las actividades vencidas (`venceLaActividad`: la fecha para corregir si se devolvió, si no su fin, antes de hoy en la
 *    zona): `mejora.actividad_vencida` a su responsable o, si está inactivo, a quien actúa por el proceso (`lideresOAdmins`).
 * 3. El escalamiento, pasados los «días para avisar al jefe» de Configuración documental (`estadoPlazo(...).dias >`): a los
 *    jefes (`jefesDe`) de quienes tienen el paso o la actividad, `mejora.escalado`, sin enlace, con la entidad «usuario» (el
 *    subalterno) y sin el código, el título ni la descripción: el jefe no gana acceso al hallazgo. Un ajuste no se escala (R3).
 *    Sin jefe a quien avisar no hay marca: la fila se revisa otra vez.
 * 4. El recordatorio de seguimiento (spec §10.5): la actividad sin terminar y ya iniciada que lleva los días del recordatorio
 *    (`recordatorioAltaDias` en una no conformidad de criticidad alta, `recordatorioDias` en las demás; calendario) desde el
 *    mayor entre su inicio, el día en que se registró su último seguimiento y el del último recordatorio; marca `recordatorio_en`.
 * 5. La eficacia por evaluar: el hallazgo en espera que llegó a su fecha mínima, a quienes pueden verificar; marca
 *    `aviso_evaluar_en`. Vencida su evaluación, es un paso vencido (1).
 *
 * La mecánica de `correrPaso` (la de las pasadas de los indicadores): candidatas por marca nula, lo que puede fallar (a quién,
 * sus jefes) buscado antes del candado, una entidad a la vez (la que falla se registra y se salta), y en una transacción corta
 * por paso el candado, lo releído, los avisos y las marcas. Al marcar una hija (una actividad, un ajuste), su trigger pide el
 * hallazgo `FOR SHARE`: la relectura toma en una sola sentencia el hallazgo `FOR SHARE` y la hija `FOR UPDATE`, los dos `SKIP
 * LOCKED`. Esa sentencia no garantiza en qué orden se toman los dos, pero no espera a nadie (lo que está tomado se salta) y la
 * marca solo pide lo que la transacción ya tiene: la pasada nunca espera un candado, y por eso no se cruza con el orden del
 * módulo (el hallazgo primero, las hijas después) de quien sí espera. Lo resuelto para un hallazgo en otro estado o en otra
 * ronda que el releído, o para una actividad con otro responsable, no se usa: esa fila espera la pasada siguiente. Cada transición, cada
 * reprogramación aprobada y cada devolución borran las marcas del paso anterior (`transicionarHallazgo`, `decidirAjuste`,
 * `verificarImplementacion`). Lo hace el sistema, no una persona: no deja fila en `auditoria`; el rastro son los avisos y las
 * marcas. `avisados` cuenta las entidades avisadas (pasos, reportes, ajustes, actividades, recordatorios y eficacias por
 * evaluar) y `escalados`, las escaladas.
 */
import type { PendingQuery, Row, TransactionSql } from "postgres";
import type { Cliente } from "@/db/cliente";
import { avisarA, jefesDe } from "@/db/consultas/avisos-vencimiento";
import type { ConfigDocumental } from "@/db/consultas/config-documental";
import { enTransaccion } from "@/db/consultas/flujo/contrato";
import { correrPaso, diaYMes, type PasoDeVencimiento } from "@/db/consultas/indicadores/pasada";
import { adminsActivos } from "@/db/consultas/tramites";
import { quienesVerifican } from "@/lib/alcance";
import { yaSePuedeEvaluar } from "@/lib/mejoramiento/eficacia";
import { ENTIDAD_REPORTE, RUTA_REPORTES_RECIBIDOS } from "@/lib/mejoramiento/reportes";
import { rutaDeActividad, rutaDeHallazgo } from "@/lib/mejoramiento/rutas";
import { TERMINALES, type HallazgoBase } from "@/lib/mejoramiento/tipos";
import { cuenta } from "@/lib/plural";
import { estadoPlazo, finDeFecha, fechaEnZona } from "@/lib/tramites/plazos";
import { textoResponsables } from "@/lib/tramites/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { quienDecideAjustes } from "./ajustes";
import { ENTIDAD_ACTIVIDAD, ENTIDAD_HALLAZGO, lideresOAdmins, queLeToca, quienTieneElTurno, revisoresDe } from "./avisos";
import { contextoDeMejora, type ContextoMejora } from "./config";
import { fechasMinimasDe, venceLaEvaluacionDe } from "./espera";
import { aBase, hallazgoBase } from "./flujo";
import { etiquetaDeActividad } from "./plan";
import { venceLaActividad } from "./vence-actividad";

type Contexto = { sql: Cliente; ahora: Date; zona: string; hoy: string; escalamientoDias: number; mejora: ContextoMejora };
type Resultado = { avisados: number; escalados: number };

/** A quién le toca, por usuario, y sus jefes con los subalternos de cada uno (solo si el paso escala). */
type Resuelto = {
  /** El estado y la ronda con que se resolvió: si el releído bajo el candado es otro, no se usa. */
  estado: string | null;
  ronda: number | null;
  destinos: number[];
  /** Lo que le toca a quien tiene el turno, con el código («Registrar la corrección de HZ-…»). */
  texto: string;
  jefes: Map<number, Array<{ id: number; nombre: string }>>;
  /** En una actividad, el responsable y si estaba activo al resolverla: si el releído no coincide, no se usa. */
  para?: string;
};

const dias = (n: number) => cuenta(n, "día", "días");
const minuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
/** La descripción sin el punto final: el cuerpo de un aviso le añade la suya. */
const sinPunto = (t: string) => t.trim().replace(/[.\s]+$/, "");

/**
 * Cada jefe, sin repetir, con los subalternos suyos de `responsables` (por nombre); vacío si nadie tiene jefe. Es `jefesDe`, una
 * vez por responsable: su resultado junto da los nombres de cada jefe pero no los ids, y el aviso escalado lleva el del subalterno
 * (`entidad: "usuario"`).
 */
async function jefesConSubalternos(tx: TransactionSql, responsables: number[]): Promise<Resuelto["jefes"]> {
  const filas = await tx`SELECT id, nombre FROM usuarios WHERE id = ANY(${responsables}) ORDER BY nombre, id`;
  const salida: Resuelto["jefes"] = new Map();
  for (const f of filas) {
    for (const jefe of (await jefesDe(tx, [Number(f.id)])).keys()) {
      salida.set(jefe, [...(salida.get(jefe) ?? []), { id: Number(f.id), nombre: f.nombre as string }]);
    }
  }
  return salida;
}

/** Lo que el paso necesita de cada entidad, una a la vez y en su transacción de solo lectura: la que falla se registra y se salta. */
async function resolverCada<T extends { grupo: number }>(
  c: Contexto,
  candidatas: T[],
  nombre: string,
  fn: (tx: TransactionSql, fila: T) => Promise<Resuelto | null>,
): Promise<Map<number, Resuelto>> {
  const salida = new Map<number, Resuelto>();
  const vistas = new Set<number>();
  for (const fila of candidatas) {
    if (vistas.has(fila.grupo)) continue;
    vistas.add(fila.grupo);
    try {
      const r = await enTransaccion(c.sql, (tx) => fn(tx, fila));
      if (r) salida.set(fila.grupo, r);
    } catch (err) {
      console.error(`No se pudo preparar ${nombre} de mejoramiento ${fila.grupo}:`, err);
    }
  }
  return salida;
}

/** El escalamiento de una entidad: un aviso por jefe, sin contenido (spec §6.3 y §14.3). Sin jefes, nada y sin marca. */
async function escalarA(tx: TransactionSql, r: Resuelto, titulo: string, vence: Date, c: Contexto): Promise<boolean> {
  if (r.jefes.size === 0) return false;
  const hace = `Venció hace ${dias(estadoPlazo(vence, c.ahora, c.zona).dias)}.`;
  for (const [jefe, subalternos] of r.jefes) {
    await avisarA(
      tx,
      { tipo: "mejora.escalado", titulo, enlace: null, entidad: "usuario", entidadId: subalternos[0].id },
      [{ usuarioId: jefe, cuerpo: `A cargo de ${textoResponsables(subalternos.map((s) => s.nombre))}. ${hace}` }],
    );
  }
  return true;
}

const pasaElUmbral = (vence: Date, c: Contexto) => estadoPlazo(vence, c.ahora, c.zona).dias > c.escalamientoDias;

// ─────────────────────────────────────────────────────────────────────────────
// Los hallazgos: el paso vencido, su escalamiento y la eficacia por evaluar
// ─────────────────────────────────────────────────────────────────────────────

type DeHallazgo = { id: number; grupo: number; h: HallazgoBase; titulo: string; vence: Date | null; minima: string | null };

const COLUMNAS = (sql: Cliente) => sql`h.id, h.codigo, h.clase, h.criticidad, h.origen, h.estado, h.ronda, h.proceso_id,
  h.reincidente_de, h.correccion_requerida, h.accion_requerida, h.resultado_cierre, h.registrado_por, h.titulo, h.vence_en`;

/**
 * Los hallazgos abiertos con la marca nula (`sinMarca`) y la condición del paso (`donde`); con `ids`, solo esos y bloqueados.
 * En la espera, el plazo es el de evaluar desde la fecha mínima (`venceLaEvaluacion`), con la fecha mínima; sin R, sin ninguno.
 */
async function leerHallazgos(
  sql: Cliente,
  c: Contexto,
  x: { sinMarca: PendingQuery<Row[]>; donde: PendingQuery<Row[]> },
  ids?: number[],
): Promise<DeHallazgo[]> {
  const filas = await sql`SELECT ${COLUMNAS(sql)} FROM mejora_hallazgos h
    WHERE h.estado NOT IN ${sql([...TERMINALES])} AND ${x.sinMarca} AND ${x.donde}
      ${ids ? sql`AND h.id = ANY(${ids})` : sql``}
    ORDER BY h.id
    ${ids ? sql`FOR UPDATE OF h SKIP LOCKED` : sql``}`;
  const enEspera = filas.filter((f) => f.estado === "en_espera").map((f) => Number(f.id));
  const fechas = await fechasMinimasDe(sql, enEspera, c.zona);
  return filas.map((f) => {
    const base = aBase(f);
    const fm = base.estado === "en_espera" ? (fechas.get(base.id) ?? null) : null;
    const vence = fm ? venceLaEvaluacionDe(fm, c.mejora) : ((f.vence_en as Date | null) ?? null);
    return { id: base.id, grupo: base.id, h: base, titulo: f.titulo as string, vence, minima: fm?.minima ?? null };
  });
}

/** El paso de cada hallazgo, releído: a quién le toca y qué; en la espera, a quienes pueden verificar. */
async function resolverHallazgos(c: Contexto, candidatas: DeHallazgo[], conJefes: boolean): Promise<Map<number, Resuelto>> {
  return resolverCada(c, candidatas, "el paso del hallazgo", async (tx, fila) => {
    const h = await hallazgoBase(tx, fila.id);
    if (!h) return null;
    let destinos: number[];
    let texto: string | null;
    if (h.estado === "en_espera") {
      destinos = await quienesVerifican(tx, h.id);
      texto = `Evaluar la eficacia de ${h.codigo}`;
    } else {
      destinos = await quienTieneElTurno(tx, h);
      // Sin nadie que revise lo enviado, el turno es de quien lo elaboró, para devolverlo (F15-DC15).
      texto = h.estado === "en_revision" && (await revisoresDe(tx, h)).length === 0 ? `Devolver el plan de ${h.codigo}` : await queLeToca(tx, h);
    }
    if (!texto) return null;
    return { estado: h.estado, ronda: h.ronda, destinos, texto, jefes: conJefes ? await jefesConSubalternos(tx, destinos) : new Map() };
  });
}

const mismoPaso = (r: Resuelto | undefined, f: DeHallazgo): r is Resuelto => r !== undefined && r.estado === f.h.estado && r.ronda === f.h.ronda;

/** El paso vencido: el plazo ya pasó (en la espera, el de evaluar). */
const vencidos = (fs: DeHallazgo[], c: Contexto) => fs.filter((f) => f.vence !== null && f.vence.getTime() < c.ahora.getTime());

const enCursoOEspera = (sql: Cliente, ahora: Date) => sql`(h.vence_en < ${ahora} OR h.estado = 'en_espera')`;

const PASO_VENCIDO: PasoDeVencimiento<DeHallazgo, Resuelto, Contexto> = {
  leer: async (sql, c, ids) =>
    vencidos(await leerHallazgos(sql, c, { sinMarca: sql`h.aviso_vencido_en IS NULL`, donde: enCursoOEspera(sql, c.ahora) }, ids), c),
  resolver: (c, candidatas) => resolverHallazgos(c, candidatas, false),
  avisar: async (tx, filas, resueltos) => {
    const avisados: number[] = [];
    for (const f of filas) {
      const r = resueltos.get(f.grupo);
      if (!mismoPaso(r, f) || r.destinos.length === 0) continue;
      await avisarA(
        tx,
        { tipo: "mejora.vencido", titulo: `Venció el plazo para ${minuscula(r.texto)}`, enlace: rutaDeHallazgo(f.id), entidad: ENTIDAD_HALLAZGO, entidadId: f.id },
        r.destinos.map((usuarioId) => ({ usuarioId, cuerpo: f.titulo })),
      );
      avisados.push(f.id);
    }
    return avisados;
  },
  marcar: (tx, ids, ahora) => tx`UPDATE mejora_hallazgos SET aviso_vencido_en = ${ahora} WHERE id = ANY(${ids})`,
};

const PASO_ESCALADO: PasoDeVencimiento<DeHallazgo, Resuelto, Contexto> = {
  leer: async (sql, c, ids) =>
    vencidos(await leerHallazgos(sql, c, { sinMarca: sql`h.escalado_en IS NULL`, donde: enCursoOEspera(sql, c.ahora) }, ids), c).filter((f) =>
      pasaElUmbral(f.vence!, c),
    ),
  resolver: (c, candidatas) => resolverHallazgos(c, candidatas, true),
  avisar: async (tx, filas, resueltos, c) => {
    const escalados: number[] = [];
    for (const f of filas) {
      const r = resueltos.get(f.grupo);
      if (mismoPaso(r, f) && (await escalarA(tx, r, "Un paso de mejoramiento sigue vencido", f.vence!, c))) escalados.push(f.id);
    }
    return escalados;
  },
  marcar: (tx, ids, ahora) => tx`UPDATE mejora_hallazgos SET escalado_en = ${ahora} WHERE id = ANY(${ids})`,
};

const POR_EVALUAR: PasoDeVencimiento<DeHallazgo, Resuelto, Contexto> = {
  leer: async (sql, c, ids) =>
    (await leerHallazgos(sql, c, { sinMarca: sql`h.aviso_evaluar_en IS NULL`, donde: sql`h.estado = 'en_espera'` }, ids)).filter(
      (f) => f.minima !== null && yaSePuedeEvaluar(f.minima, c.ahora, c.zona),
    ),
  resolver: (c, candidatas) => resolverHallazgos(c, candidatas, false),
  avisar: async (tx, filas, resueltos) => {
    const avisados: number[] = [];
    for (const f of filas) {
      const r = resueltos.get(f.grupo);
      if (!mismoPaso(r, f) || r.destinos.length === 0) continue;
      await avisarA(
        tx,
        { tipo: "mejora.por_evaluar", titulo: `Ya se puede evaluar la eficacia de ${f.h.codigo}`, enlace: rutaDeHallazgo(f.id), entidad: ENTIDAD_HALLAZGO, entidadId: f.id },
        r.destinos.map((usuarioId) => ({ usuarioId, cuerpo: f.titulo })),
      );
      avisados.push(f.id);
    }
    return avisados;
  },
  marcar: (tx, ids, ahora) => tx`UPDATE mejora_hallazgos SET aviso_evaluar_en = ${ahora} WHERE id = ANY(${ids})`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Los reportes por clasificar y los ajustes por decidir
// ─────────────────────────────────────────────────────────────────────────────

type DeReporte = { id: number; grupo: number; vence: Date; reportadoEn: Date };

async function leerReportes(sql: Cliente, c: Contexto, sinMarca: PendingQuery<Row[]>, ids?: number[]): Promise<DeReporte[]> {
  const filas = await sql`SELECT r.id, r.vence_en, r.reportado_en FROM mejora_reportes r
    WHERE r.estado = 'recibido' AND r.vence_en < ${c.ahora} AND ${sinMarca}
      ${ids ? sql`AND r.id = ANY(${ids})` : sql``}
    ORDER BY r.id
    ${ids ? sql`FOR UPDATE OF r SKIP LOCKED` : sql``}`;
  return filas.map((f) => ({ id: Number(f.id), grupo: Number(f.id), vence: f.vence_en as Date, reportadoEn: f.reportado_en as Date }));
}

/** Clasificar es de los Admin SGC activos (spec §6.1). */
const resolverReportes = (c: Contexto, candidatas: DeReporte[], conJefes: boolean) =>
  resolverCada(c, candidatas, "el reporte", async (tx, fila) => {
    const destinos = await adminsActivos({ sql: tx });
    return { estado: null, ronda: null, destinos, texto: `Clasificar el reporte n.º ${fila.id}`, jefes: conJefes ? await jefesConSubalternos(tx, destinos) : new Map() };
  });

const REPORTE_VENCIDO: PasoDeVencimiento<DeReporte, Resuelto, Contexto> = {
  leer: (sql, c, ids) => leerReportes(sql, c, sql`r.aviso_vencido_en IS NULL`, ids),
  resolver: (c, candidatas) => resolverReportes(c, candidatas, false),
  avisar: async (tx, filas, resueltos, c) => {
    const avisados: number[] = [];
    for (const f of filas) {
      const r = resueltos.get(f.grupo);
      if (!r || r.destinos.length === 0) continue;
      // Sin lo que se vio ni quién lo vio: el aviso saldrá por correo en la Fase 16.
      await avisarA(
        tx,
        { tipo: "mejora.vencido", titulo: `Venció el plazo para ${minuscula(r.texto)}`, enlace: RUTA_REPORTES_RECIBIDOS, entidad: ENTIDAD_REPORTE, entidadId: f.id },
        r.destinos.map((usuarioId) => ({ usuarioId, cuerpo: `Se recibió el ${diaYMes(f.reportadoEn, c.zona)}.` })),
      );
      avisados.push(f.id);
    }
    return avisados;
  },
  marcar: (tx, ids, ahora) => tx`UPDATE mejora_reportes SET aviso_vencido_en = ${ahora} WHERE id = ANY(${ids})`,
};

const REPORTE_ESCALADO: PasoDeVencimiento<DeReporte, Resuelto, Contexto> = {
  leer: async (sql, c, ids) => (await leerReportes(sql, c, sql`r.escalado_en IS NULL`, ids)).filter((f) => pasaElUmbral(f.vence, c)),
  resolver: (c, candidatas) => resolverReportes(c, candidatas, true),
  avisar: async (tx, filas, resueltos, c) => {
    const escalados: number[] = [];
    for (const f of filas) {
      const r = resueltos.get(f.grupo);
      if (r && (await escalarA(tx, r, "Un paso de mejoramiento sigue vencido", f.vence, c))) escalados.push(f.id);
    }
    return escalados;
  },
  marcar: (tx, ids, ahora) => tx`UPDATE mejora_reportes SET escalado_en = ${ahora} WHERE id = ANY(${ids})`,
};

type DeAjuste = { id: number; grupo: number; hallazgoId: number; codigo: string; titulo: string; pedidoPor: number };

/** Un ajuste vencido avisa a quien lo decide y nunca se escala (R3: la tabla no tiene `escalado_en`). */
const AJUSTE_VENCIDO: PasoDeVencimiento<DeAjuste, Resuelto, Contexto> = {
  leer: async (sql, c, ids) => {
    const filas = await sql`SELECT aj.id, aj.hallazgo_id, aj.pedido_por, h.codigo, h.titulo FROM mejora_ajustes aj
      JOIN mejora_hallazgos h ON h.id = aj.hallazgo_id
      WHERE aj.estado = 'pendiente' AND aj.vence_en < ${c.ahora} AND aj.aviso_vencido_en IS NULL
        AND h.estado NOT IN ${sql([...TERMINALES])}
        ${ids ? sql`AND aj.id = ANY(${ids})` : sql``}
      ORDER BY aj.id
      ${ids ? sql`FOR SHARE OF h SKIP LOCKED FOR UPDATE OF aj SKIP LOCKED` : sql``}`;
    return filas.map((f) => ({
      id: Number(f.id),
      grupo: Number(f.id),
      hallazgoId: Number(f.hallazgo_id),
      codigo: f.codigo as string,
      titulo: f.titulo as string,
      pedidoPor: Number(f.pedido_por),
    }));
  },
  resolver: (c, candidatas) =>
    resolverCada(c, candidatas, "el ajuste", async (tx, fila) => ({
      estado: null,
      ronda: null,
      destinos: (await quienDecideAjustes(tx, fila.hallazgoId, fila.pedidoPor)).usuarios,
      texto: `Decidir un ajuste de ${fila.codigo}`,
      jefes: new Map(),
    })),
  avisar: async (tx, filas, resueltos) => {
    const avisados: number[] = [];
    for (const f of filas) {
      const r = resueltos.get(f.grupo);
      if (!r || r.destinos.length === 0) continue;
      await avisarA(
        tx,
        { tipo: "mejora.vencido", titulo: `Venció el plazo para ${minuscula(r.texto)}`, enlace: rutaDeHallazgo(f.hallazgoId), entidad: ENTIDAD_HALLAZGO, entidadId: f.hallazgoId },
        r.destinos.map((usuarioId) => ({ usuarioId, cuerpo: f.titulo })),
      );
      avisados.push(f.id);
    }
    return avisados;
  },
  marcar: (tx, ids, ahora) => tx`UPDATE mejora_ajustes SET aviso_vencido_en = ${ahora} WHERE id = ANY(${ids})`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Las actividades: vencidas, su escalamiento y el recordatorio de seguimiento
// ─────────────────────────────────────────────────────────────────────────────

type DeActividad = {
  id: number;
  grupo: number;
  hallazgoId: number;
  codigo: string;
  procesoId: number;
  etiqueta: string;
  descripcion: string;
  responsableId: number;
  activo: boolean;
  devuelta: boolean;
  /** No conformidad de criticidad alta: su recordatorio es el corto (spec §10.5). */
  alta: boolean;
  /** El día en que venció (`venceLaActividad`). */
  dia: string;
};

/**
 * Las actividades sin terminar de un plan aprobado, de la ronda en curso de un hallazgo en ejecución, con la condición del paso;
 * con `ids`, solo esas y bloqueadas (el hallazgo `FOR SHARE`, la actividad `FOR UPDATE`).
 */
async function leerActividades(sql: Cliente, condicion: PendingQuery<Row[]>, ids?: number[]): Promise<DeActividad[]> {
  const filas = await sql`SELECT a.id, a.descripcion, a.orden, a.responsable_id, u.activo, a.verificacion,
      to_char(${venceLaActividad(sql)}, 'YYYY-MM-DD') AS dia, ac.orden AS accion_orden, h.id AS hallazgo_id, h.codigo, h.proceso_id,
      (h.clase = 'no_conformidad' AND h.criticidad = 'alta') AS alta
    FROM mejora_actividades a
    JOIN mejora_acciones ac ON ac.id = a.accion_id
    JOIN mejora_rondas r ON r.id = ac.ronda_id
    JOIN mejora_hallazgos h ON h.id = a.hallazgo_id AND h.ronda = r.numero
    JOIN usuarios u ON u.id = a.responsable_id
    WHERE a.fin_original IS NOT NULL AND a.estado IN ('abierta', 'en_proceso') AND h.estado = 'en_ejecucion' AND ${condicion}
      ${ids ? sql`AND a.id = ANY(${ids})` : sql``}
    ORDER BY a.id
    ${ids ? sql`FOR SHARE OF h SKIP LOCKED FOR UPDATE OF a SKIP LOCKED` : sql``}`;
  return filas.map((f) => ({
    id: Number(f.id),
    grupo: Number(f.id),
    hallazgoId: Number(f.hallazgo_id),
    codigo: f.codigo as string,
    procesoId: Number(f.proceso_id),
    etiqueta: etiquetaDeActividad(Number(f.accion_orden), Number(f.orden)),
    descripcion: sinPunto(f.descripcion as string),
    responsableId: Number(f.responsable_id),
    activo: f.activo === true,
    devuelta: f.verificacion === "devuelta",
    alta: f.alta === true,
    dia: f.dia as string,
  }));
}

/** Para quién se resolvió una actividad: su responsable y si estaba activo. */
const paraDe = (f: Pick<DeActividad, "responsableId" | "activo">) => `${f.responsableId}:${f.activo}`;

/**
 * Su responsable o, si está inactivo, quien actúa por el proceso (los líderes activos o, sin ninguno, los Admin SGC), con
 * `para`: si bajo el candado la actividad tiene otro responsable (una reasignación entre la lista y el candado) o cambió si está
 * activo, lo resuelto no se usa y la fila espera la pasada siguiente, que avisa a quien la tiene entonces.
 */
const resolverActividades = (c: Contexto, candidatas: DeActividad[], conJefes: boolean) =>
  resolverCada(c, candidatas, "la actividad", async (tx, fila) => {
    const destinos = fila.activo ? [fila.responsableId] : await lideresOAdmins(tx, fila.procesoId);
    return { estado: null, ronda: null, destinos, texto: "", jefes: conJefes ? await jefesConSubalternos(tx, destinos) : new Map(), para: paraDe(fila) };
  });

const paraLaMisma = (r: Resuelto | undefined, f: DeActividad): r is Resuelto => r !== undefined && r.para === paraDe(f);

const vencidaHoy = (sql: Cliente, c: Contexto) => sql`${venceLaActividad(sql)} < ${c.hoy}::date`;

const ACTIVIDAD_VENCIDA: PasoDeVencimiento<DeActividad, Resuelto, Contexto> = {
  leer: (sql, c, ids) => leerActividades(sql, sql`${vencidaHoy(sql, c)} AND a.aviso_vencido_en IS NULL`, ids),
  resolver: (c, candidatas) => resolverActividades(c, candidatas, false),
  avisar: async (tx, filas, resueltos, c) => {
    const avisadas: number[] = [];
    for (const f of filas) {
      const r = resueltos.get(f.grupo);
      if (!paraLaMisma(r, f) || r.destinos.length === 0) continue;
      const cual = `la actividad ${f.etiqueta} de ${f.codigo}`;
      const cuando = `Venció el ${diaYMes(finDeFecha(f.dia, c.zona), c.zona)}.`;
      const aviso = f.activo
        ? { titulo: f.devuelta ? `Venció el plazo para corregir ${cual}` : `Venció ${cual}`, enlace: rutaDeActividad(f.id), cuerpo: `${f.descripcion}. ${cuando}` }
        : { titulo: `Venció ${cual} y su responsable ya no está activo`, enlace: rutaDeHallazgo(f.hallazgoId), cuerpo: `${f.descripcion}. ${cuando} Reasígnela.` };
      await avisarA(
        tx,
        { tipo: "mejora.actividad_vencida", titulo: aviso.titulo, enlace: aviso.enlace, entidad: ENTIDAD_ACTIVIDAD, entidadId: f.id },
        r.destinos.map((usuarioId) => ({ usuarioId, cuerpo: aviso.cuerpo })),
      );
      avisadas.push(f.id);
    }
    return avisadas;
  },
  marcar: (tx, ids, ahora) => tx`UPDATE mejora_actividades SET aviso_vencido_en = ${ahora} WHERE id = ANY(${ids})`,
};

const ACTIVIDAD_ESCALADA: PasoDeVencimiento<DeActividad, Resuelto, Contexto> = {
  leer: async (sql, c, ids) =>
    (await leerActividades(sql, sql`${vencidaHoy(sql, c)} AND a.escalado_en IS NULL`, ids)).filter((f) => pasaElUmbral(finDeFecha(f.dia, c.zona), c)),
  resolver: (c, candidatas) => resolverActividades(c, candidatas, true),
  avisar: async (tx, filas, resueltos, c) => {
    const escaladas: number[] = [];
    for (const f of filas) {
      const r = resueltos.get(f.grupo);
      if (paraLaMisma(r, f) && (await escalarA(tx, r, "Una actividad de mejoramiento sigue vencida", finDeFecha(f.dia, c.zona), c))) escaladas.push(f.id);
    }
    return escaladas;
  },
  marcar: (tx, ids, ahora) => tx`UPDATE mejora_actividades SET escalado_en = ${ahora} WHERE id = ANY(${ids})`,
};

/**
 * Los días del recordatorio de la actividad (spec §10.5): calendario, desde el mayor entre su inicio, el día en que se registró
 * su último seguimiento (no el que dice el seguimiento: uno con fecha atrás también lo reinicia) y el del último recordatorio,
 * todos en la zona; los de criticidad alta en una no conformidad, y los demás.
 */
function tocaRecordar(sql: Cliente, c: Contexto) {
  const { recordatorioAltaDias: alta, recordatorioDias: otros } = c.mejora.config;
  return sql`a.inicio <= ${c.hoy}::date AND u.activo
    AND greatest(
      a.inicio,
      (SELECT max((s.creado_en AT TIME ZONE ${c.zona})::date) FROM mejora_seguimientos s WHERE s.actividad_id = a.id),
      (a.recordatorio_en AT TIME ZONE ${c.zona})::date
    ) + (CASE WHEN h.clase = 'no_conformidad' AND h.criticidad = 'alta' THEN ${alta}::int ELSE ${otros}::int END) <= ${c.hoy}::date`;
}

const RECORDATORIO: PasoDeVencimiento<DeActividad, null, Contexto> = {
  leer: (sql, c, ids) => leerActividades(sql, tocaRecordar(sql, c), ids),
  // El destinatario es el responsable, que la fila ya trae activo: nada que buscar antes del candado.
  resolver: async (_c, candidatas) => new Map(candidatas.map((f) => [f.grupo, null])),
  avisar: async (tx, filas, _r, c) => {
    for (const f of filas) {
      const sinSeguimiento = f.alta ? c.mejora.config.recordatorioAltaDias : c.mejora.config.recordatorioDias;
      await avisarA(
        tx,
        {
          tipo: "mejora.recordatorio",
          titulo: `Registre el seguimiento de la actividad ${f.etiqueta} de ${f.codigo}`,
          enlace: rutaDeActividad(f.id),
          entidad: ENTIDAD_ACTIVIDAD,
          entidadId: f.id,
        },
        [{ usuarioId: f.responsableId, cuerpo: `${f.descripcion}. Lleva ${dias(sinSeguimiento)} o más sin un seguimiento.` }],
      );
    }
    return filas.map((f) => f.id);
  },
  marcar: (tx, ids, ahora) => tx`UPDATE mejora_actividades SET recordatorio_en = ${ahora} WHERE id = ANY(${ids})`,
};

/**
 * La pasada de mejoramiento (spec §14.3): los pasos, los reportes y los ajustes vencidos, las actividades vencidas, los
 * escalamientos, los recordatorios y las eficacias por evaluar. Un paso que falla se registra y los demás siguen.
 */
export async function revisarVencimientosDeMejoramiento(opciones: { sql: Cliente; ahora: Date; config: ConfigDocumental }): Promise<Resultado> {
  const { sql, ahora } = opciones;
  const zona = zonaHoraria();
  const total: Resultado = { avisados: 0, escalados: 0 };
  let mejora: ContextoMejora;
  try {
    mejora = await contextoDeMejora(sql, ahora);
  } catch (err) {
    console.error("No se pudo leer la configuración de mejoramiento para la pasada de vencimientos:", err);
    return total;
  }
  const c: Contexto = { sql, ahora, zona, hoy: fechaEnZona(ahora, zona), escalamientoDias: opciones.config.escalamientoDias, mejora };
  const pasos: Array<[string, keyof Resultado, () => Promise<number>]> = [
    ["los pasos vencidos de los hallazgos", "avisados", () => correrPaso(c, PASO_VENCIDO)],
    ["los reportes vencidos", "avisados", () => correrPaso(c, REPORTE_VENCIDO)],
    ["los ajustes vencidos", "avisados", () => correrPaso(c, AJUSTE_VENCIDO)],
    ["las actividades vencidas", "avisados", () => correrPaso(c, ACTIVIDAD_VENCIDA)],
    ["el escalamiento de los pasos", "escalados", () => correrPaso(c, PASO_ESCALADO)],
    ["el escalamiento de los reportes", "escalados", () => correrPaso(c, REPORTE_ESCALADO)],
    ["el escalamiento de las actividades", "escalados", () => correrPaso(c, ACTIVIDAD_ESCALADA)],
    ["los recordatorios de seguimiento", "avisados", () => correrPaso(c, RECORDATORIO)],
    ["las eficacias por evaluar", "avisados", () => correrPaso(c, POR_EVALUAR)],
  ];
  for (const [nombre, clave, correr] of pasos) {
    try {
      total[clave] += await correr();
    } catch (err) {
      console.error(`No se pudo revisar ${nombre} de mejoramiento:`, err);
    }
  }
  return total;
}
