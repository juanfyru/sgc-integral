/**
 * Las tareas de mejoramiento (spec 15 §14.1): «Mis tareas» las calcula del estado, nunca las guarda. Un grupo de tareas por
 * consulta, cada una con la condición de persona en SQL: la de los pasos del líder (`actuaPorElProceso`: un líder activo del
 * proceso o, si no tiene ninguno, el Admin SGC), la de quien registró, la del rol y la de la revisión (`revisoresDe`). Las
 * reglas que no caben en una condición (quién arbitra, quién valida la corrección, quién verifica y evalúa, quién decide un
 * ajuste) las decide, en la fila que el SQL ya acotó por rol, la misma función que decide el turno y el acto (`arbitrosDe`,
 * `validadoresDeCorreccion`, `quienesVerifican`, `quienDecideAjustes`): una sola regla para el aviso, la tarea y el acto. A
 * quien solo consulta le cuesta una consulta, la de sus actividades.
 *
 * El título de una tarea lleva el código del hallazgo, nunca su contenido; el detalle, su título (quien tiene la tarea lo ve),
 * salvo en la de una actividad, que lleva la descripción como título y el código como detalle. La actividad de un responsable
 * inactivo es de quien actúa por el proceso, «Reasignar: …», con el enlace al hallazgo, donde se reasigna.
 */
import { obtenerSql, type Cliente } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { quienesVerifican, validadoresDeCorreccion } from "@/lib/alcance";
import { yaSePuedeEvaluar } from "@/lib/mejoramiento/eficacia";
import { RUTA_REPORTES_RECIBIDOS } from "@/lib/mejoramiento/reportes";
import { rutaDeActividad, rutaDeFormular, rutaDeHallazgo } from "@/lib/mejoramiento/rutas";
import { PREFIJO_REASIGNAR } from "@/lib/mejoramiento/textos";
import { TERMINALES, type EstadoHallazgo, type HallazgoBase } from "@/lib/mejoramiento/tipos";
import { puede } from "@/lib/permisos";
import type { Tarea } from "@/lib/tareas";
import { finDeFecha } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { quienDecideAjustes } from "./ajustes";
import { arbitrosDe, queLeToca } from "./avisos";
import { contextoDeMejora } from "./config";
import { fechasMinimasDe, venceLaEvaluacionDe } from "./espera";
import { aBase } from "./flujo";
import { venceLaActividad } from "./vence-actividad";

type Opciones = { sql?: Cliente; ahora?: Date };

/** Una tarea con el hallazgo del que es (nulo en la de un reporte): «Esperan su decisión» los cuenta (R2). */
export type TareaDeMejora = { tarea: Tarea; hallazgoId: number | null };

/** Cada estado del hallazgo con turno, el paso de su identificador (`mej-<paso>:<id>`). */
const PASO_DEL_ESTADO: Partial<Record<EstadoHallazgo, string>> = {
  por_aceptar: "aceptar",
  rechazo: "rechazo",
  arbitraje: "arbitrar",
  por_corregir: "corregir",
  por_decidir: "decidir",
  por_validar: "validar",
  por_formular: "formular",
  en_revision: "revisar",
  en_aprobacion: "aprobar",
  por_verificar: "verificar",
  en_espera: "evaluar",
  por_cerrar: "cerrar",
};

const verdad = (sql: Cliente, si: boolean) => (si ? sql`true` : sql`false`);

/** Los líderes activos del proceso del hallazgo `h`, para un `EXISTS`; el que se busca se añade con `AND`. */
const lideresDelProceso = (sql: Cliente) => sql`SELECT 1 FROM usuario_procesos tl_up
  JOIN usuarios tl_u ON tl_u.id = tl_up.usuario_id AND tl_u.activo AND tl_u.rol = 'lider_proceso'
  JOIN procesos tl_p ON tl_p.id = tl_up.proceso_id AND tl_p.activo
  WHERE tl_up.proceso_id = h.proceso_id`;

/** `actuaPorElProceso` sobre el hallazgo `h`: la persona es líder activo de su proceso o, si no tiene ninguno, Admin SGC. */
function actuaPorElProceso(sql: Cliente, s: SesionFlujo) {
  if (s.rol === "lider_proceso") return sql`EXISTS (${lideresDelProceso(sql)} AND tl_u.id = ${s.usuarioId})`;
  if (s.rol === "admin_sgc") return sql`NOT EXISTS (${lideresDelProceso(sql)})`;
  return sql`false`;
}

const idONulo = (v: unknown) => (v === null || v === undefined ? null : Number(v));

const deHallazgo = (h: HallazgoBase, titulo: string, detalle: string, vence: Date | null, enlace = rutaDeHallazgo(h.id)): TareaDeMejora => ({
  tarea: { id: `mej-${PASO_DEL_ESTADO[h.estado]}:${h.id}`, modulo: "planes", titulo, detalle, vence, enlace },
  hallazgoId: h.id,
});

/**
 * Los pasos de los hallazgos abiertos que le tocan a la persona. El `WHERE` es la condición de cada estado; en el arbitraje, la
 * validación, la verificación y la espera solo acota por rol, y la fila la decide la función de su turno.
 */
async function deLosPasos(sql: Cliente, s: SesionFlujo, ahora: Date): Promise<TareaDeMejora[]> {
  const formula = puede(s, "mejora.formular");
  const registra = puede(s, "mejora.registrar");
  const gestiona = puede(s, "mejora.gestionar");
  const aprueba = puede(s, "mejora.aprobar");
  const verifica = puede(s, "mejora.verificar");
  if (!formula && !registra && !gestiona && !aprueba && !verifica) return [];
  const yo = s.usuarioId;
  const actua = actuaPorElProceso(sql, s);
  const esAdmin = verdad(sql, s.rol === "admin_sgc");
  const filas = await sql`
    SELECT h.id, h.codigo, h.titulo, h.estado, h.ronda, h.clase, h.criticidad, h.origen, h.proceso_id, h.registrado_por,
      h.reincidente_de, h.correccion_requerida, h.accion_requerida, h.resultado_cierre, h.vence_en, r.elaborado_por
    FROM mejora_hallazgos h
    LEFT JOIN mejora_rondas r ON r.hallazgo_id = h.id AND r.numero = h.ronda
    WHERE h.estado NOT IN ${sql([...TERMINALES])} AND (
      (h.estado IN ('por_corregir', 'por_formular') AND ${verdad(sql, formula)} AND ${actua})
      -- Quien lo registró no lo acepta (spec §6.1).
      OR (h.estado = 'por_aceptar' AND ${verdad(sql, formula)} AND ${actua} AND h.registrado_por <> ${yo})
      -- Quien lo registró o, si ya no está activo, el Admin SGC (QUIENES.registrador).
      OR (h.estado = 'rechazo' AND ${verdad(sql, registra)} AND (h.registrado_por = ${yo}
        OR (${esAdmin} AND NOT EXISTS (SELECT 1 FROM usuarios tr_u WHERE tr_u.id = h.registrado_por AND tr_u.activo))))
      OR (h.estado = 'arbitraje' AND ${verdad(sql, gestiona || aprueba)})
      OR (h.estado IN ('por_decidir', 'por_cerrar') AND ${verdad(sql, gestiona)})
      OR (h.estado IN ('por_validar', 'por_verificar', 'en_espera') AND ${verdad(sql, verifica)})
      -- Revisa un Admin SGC que no lo elaboró; sin ninguno, quien lo elaboró lo devuelve (revisoresDe, F15-DC15).
      OR (h.estado = 'en_revision' AND ${verdad(sql, gestiona)} AND (r.elaborado_por IS DISTINCT FROM ${yo}
        OR NOT EXISTS (SELECT 1 FROM usuarios ta_u WHERE ta_u.rol = 'admin_sgc' AND ta_u.activo AND ta_u.id <> ${yo})))
      OR (h.estado = 'en_aprobacion' AND ${verdad(sql, aprueba)})
    )
    ORDER BY h.id`;
  if (filas.length === 0) return [];

  // La espera: desde la fecha mínima (R4), en una pasada para todos; vence con el plazo de evaluar (spec §13.3).
  const enEspera = filas.filter((f) => f.estado === "en_espera").map((f) => Number(f.id));
  const zona = zonaHoraria();
  const fechas = await fechasMinimasDe(sql, enEspera, zona);
  const contexto = enEspera.length > 0 ? await contextoDeMejora(sql, ahora) : null;

  const tareas: TareaDeMejora[] = [];
  for (const f of filas) {
    const h = aBase(f);
    const titulo = f.titulo as string;
    const vence = (f.vence_en as Date | null) ?? null;
    switch (h.estado) {
      case "arbitraje":
        if (!(await arbitrosDe(sql, h)).includes(yo)) continue;
        break;
      case "por_validar":
        if (!(await validadoresDeCorreccion(h.id, { sql })).includes(yo)) continue;
        break;
      case "por_verificar":
        if (!(await quienesVerifican(sql, h.id)).includes(yo)) continue;
        break;
      case "en_espera": {
        const fm = fechas.get(h.id);
        if (!fm || !contexto || !yaSePuedeEvaluar(fm.minima, ahora, zona)) continue;
        if (!(await quienesVerifican(sql, h.id)).includes(yo)) continue;
        tareas.push(deHallazgo(h, `Evaluar la eficacia de ${h.codigo}`, titulo, venceLaEvaluacionDe(fm, contexto)));
        continue;
      }
      case "en_revision":
        if (idONulo(f.elaborado_por) === yo) {
          tareas.push(deHallazgo(h, `Devolver el plan de ${h.codigo}`, titulo, vence));
          continue;
        }
        break;
    }
    const texto = await queLeToca(sql, h);
    if (!texto) continue;
    tareas.push(deHallazgo(h, texto, titulo, vence, h.estado === "por_formular" ? rutaDeFormular(h.id) : rutaDeHallazgo(h.id)));
  }
  return tareas;
}

/**
 * Las actividades sin terminar de un plan aprobado (`fin_original`), de la ronda en curso de un hallazgo en ejecución: las
 * suyas y, de un responsable inactivo, las de los procesos por los que actúa («Reasignar: …»).
 */
async function deLasActividades(sql: Cliente, s: SesionFlujo): Promise<TareaDeMejora[]> {
  const reasigna = puede(s, "mejora.formular") ? actuaPorElProceso(sql, s) : sql`false`;
  const filas = await sql`
    SELECT a.id, a.descripcion, a.responsable_id, u.activo AS activo, h.id AS hallazgo_id, h.codigo,
      to_char(${venceLaActividad(sql)}, 'YYYY-MM-DD') AS vence
    FROM mejora_actividades a
    JOIN mejora_acciones ac ON ac.id = a.accion_id
    JOIN mejora_rondas r ON r.id = ac.ronda_id
    JOIN mejora_hallazgos h ON h.id = a.hallazgo_id AND h.ronda = r.numero
    JOIN usuarios u ON u.id = a.responsable_id
    WHERE a.fin_original IS NOT NULL AND a.estado IN ('abierta', 'en_proceso') AND h.estado = 'en_ejecucion'
      AND ((a.responsable_id = ${s.usuarioId} AND u.activo) OR (NOT u.activo AND ${reasigna}))
    ORDER BY a.id`;
  const zona = zonaHoraria();
  return filas.map((f) => {
    const suya = f.activo === true;
    const id = Number(f.id);
    const hallazgoId = Number(f.hallazgo_id);
    return {
      tarea: {
        id: `mej-actividad:${id}`,
        modulo: "planes" as const,
        titulo: suya ? (f.descripcion as string) : `${PREFIJO_REASIGNAR}${f.descripcion as string}`,
        detalle: f.codigo as string,
        vence: finDeFecha(f.vence as string, zona),
        enlace: suya ? rutaDeActividad(id) : rutaDeHallazgo(hallazgoId),
      },
      hallazgoId,
    };
  });
}

/** Los ajustes por decidir de la ronda en curso de un hallazgo abierto que decide la persona (`quienDecideAjustes`). */
async function deLosAjustes(sql: Cliente, s: SesionFlujo): Promise<TareaDeMejora[]> {
  if (!puede(s, "mejora.gestionar") && !puede(s, "mejora.aprobar")) return [];
  const filas = await sql`
    SELECT aj.id, aj.hallazgo_id, aj.pedido_por, aj.vence_en, h.codigo, h.titulo
    FROM mejora_ajustes aj
    JOIN mejora_hallazgos h ON h.id = aj.hallazgo_id
    JOIN mejora_rondas r ON r.id = aj.ronda_id AND r.numero = h.ronda
    WHERE aj.estado = 'pendiente' AND h.estado NOT IN ${sql([...TERMINALES])}
    ORDER BY aj.id`;
  const deciden = new Map<string, Promise<number[]>>();
  const tareas: TareaDeMejora[] = [];
  for (const f of filas) {
    const hallazgoId = Number(f.hallazgo_id);
    const clave = `${hallazgoId}:${f.pedido_por}`;
    if (!deciden.has(clave)) deciden.set(clave, quienDecideAjustes(sql, hallazgoId, Number(f.pedido_por)).then((r) => r.usuarios));
    if (!(await deciden.get(clave))!.includes(s.usuarioId)) continue;
    tareas.push({
      tarea: {
        id: `mej-ajuste:${f.id}`,
        modulo: "planes",
        titulo: `Decidir un ajuste de ${f.codigo as string}`,
        detalle: f.titulo as string,
        vence: (f.vence_en as Date | null) ?? null,
        enlace: rutaDeHallazgo(hallazgoId),
      },
      hallazgoId,
    });
  }
  return tareas;
}

/**
 * Lo del Admin SGC que no es un paso del hallazgo: clasificar cada reporte recibido y registrar la respuesta al ente de cada
 * hallazgo externo con fecha del ente, con el plan de la ronda en vigor aprobado y sin respuesta (spec §13.4: vence al final de
 * la fecha del ente; la misma condición que `registrarRespuestaAlEnte`).
 */
async function delAdmin(sql: Cliente, s: SesionFlujo): Promise<TareaDeMejora[]> {
  if (!puede(s, "mejora.gestionar")) return [];
  const reportes = await sql`SELECT id, vence_en FROM mejora_reportes WHERE estado = 'recibido' ORDER BY id`;
  const externos = await sql`
    SELECT h.id, h.codigo, h.titulo, to_char(h.fecha_limite_ente, 'YYYY-MM-DD') AS limite
    FROM mejora_hallazgos h
    WHERE h.estado NOT IN ${sql([...TERMINALES])} AND h.origen IN ('auditoria_externa', 'ente_control')
      AND h.fecha_limite_ente IS NOT NULL AND h.respuesta_ente_en IS NULL
      AND EXISTS (SELECT 1 FROM mejora_rondas r WHERE r.hallazgo_id = h.id AND r.numero = h.ronda AND r.estado_plan = 'aprobado')
    ORDER BY h.id`;
  const zona = zonaHoraria();
  return [
    ...reportes.map((f) => ({
      tarea: {
        id: `mej-clasificar:${f.id}`,
        modulo: "planes" as const,
        titulo: "Clasificar un reporte de mejoramiento",
        detalle: `Reporte n.º ${f.id}`,
        vence: f.vence_en as Date,
        enlace: RUTA_REPORTES_RECIBIDOS,
      },
      hallazgoId: null,
    })),
    ...externos.map((f) => ({
      tarea: {
        id: `mej-ente:${f.id}`,
        modulo: "planes" as const,
        titulo: `Registrar la respuesta al ente de ${f.codigo as string}`,
        detalle: f.titulo as string,
        vence: finDeFecha(f.limite as string, zona),
        enlace: rutaDeHallazgo(Number(f.id)),
      },
      hallazgoId: Number(f.id),
    })),
  ];
}

/** Por vencimiento ascendente, las que no vencen al final; a igual fecha, por identificador. */
function enOrden(a: TareaDeMejora, b: TareaDeMejora): number {
  const va = a.tarea.vence?.getTime() ?? Infinity;
  const vb = b.tarea.vence?.getTime() ?? Infinity;
  if (va !== vb) return va < vb ? -1 : 1;
  return a.tarea.id < b.tarea.id ? -1 : a.tarea.id > b.tarea.id ? 1 : 0;
}

/** Cada tarea de mejoramiento de la persona con su hallazgo: lo que «Mis tareas» muestra y «Esperan su decisión» cuenta (R2). */
export async function tareasConSuHallazgo(sesion: SesionFlujo, opciones?: Opciones): Promise<TareaDeMejora[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const grupos = await Promise.all([deLosPasos(sql, sesion, ahora), deLasActividades(sql, sesion), deLosAjustes(sql, sesion), delAdmin(sql, sesion)]);
  return grupos.flat().sort(enOrden);
}

/** Las tareas de mejoramiento de la persona (spec §14.1), que `misTareas` suma a las de los demás módulos. */
export async function tareasDeMejoramiento(sesion: SesionFlujo, opciones?: Opciones): Promise<{ tareas: Tarea[] }> {
  return { tareas: (await tareasConSuHallazgo(sesion, opciones)).map((t) => t.tarea) };
}
