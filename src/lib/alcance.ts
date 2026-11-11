/**
 * Alcance por procesos: único punto que decide qué procesos puede ver un usuario.
 *
 * REGLA: toda consulta de los módulos nuevos (Fases 13 a 15) debe filtrar por
 * `alcanceProcesos`; no se reimplementa el filtro por rol en cada módulo.
 *
 * `filtroAcceso` responde otra pregunta: qué documentos puede ver una persona
 * según su nivel de acceso (spec 13A §12). `alcanceProcesos` da «todo» a los
 * roles que no lideran; `filtroAcceso` mira los procesos asignados de cualquier
 * rol que no esté en `ROLES_VEN_RESTRINGIDO`.
 *
 * - `lider_proceso` alcanza solo sus `usuario_procesos`, y únicamente los procesos
 *   ACTIVOS (un proceso inactivo queda fuera del alcance). Puede ser vacío.
 * - Los demás roles alcanzan todo (`{ todos: true }`).
 * - `procesoIds` sale ordenado ascendente; `procesosAsignados` devuelve procesos
 *   activos ordenados por nombre.
 *
 * Indicadores (spec 14 §6.4) tienen dos excepciones nombradas a esta regla: la lectura de los
 * indicadores generales es de toda sesión, y la designación (`indicador_designados`) da alcance
 * a un indicador sin liderar su proceso. Sus reglas están al final de este archivo.
 */
import { obtenerSql, type Cliente } from "@/db/cliente";
import { FUNCIONES_DESIGNADO, type FuncionDesignado } from "@/lib/indicadores/tipos";
import { puede } from "@/lib/permisos";
import type { Rol } from "@/lib/roles";
import type { SesionValida } from "@/lib/sesion";
import type { Autoridad, Etapa } from "@/lib/tramites/tipos";

export type Alcance = { todos: true } | { todos: false; procesoIds: number[] };

export type ProcesoAsignado = { id: number; nombre: string; sigla: string; slug: string };

export type SujetoVisibilidad = Pick<SesionValida, "usuarioId" | "rol" | "verHistorial">;

/** Ven todo documento restringido. La marca `ver_historial` no da este acceso (F13A-DC14). */
export const ROLES_VEN_RESTRINGIDO: readonly Rol[] = ["admin_sgc", "gerencia", "control_interno"];

export async function alcanceProcesos(
  sesion: Pick<SesionValida, "usuarioId" | "rol">,
  opciones?: { sql?: Cliente },
): Promise<Alcance> {
  if (sesion.rol !== "lider_proceso") return { todos: true };
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`
    SELECT up.proceso_id AS id
    FROM usuario_procesos up
    JOIN procesos p ON p.id = up.proceso_id
    WHERE up.usuario_id = ${sesion.usuarioId} AND p.activo
    ORDER BY up.proceso_id`;
  return { todos: false, procesoIds: filas.map((f) => f.id as number) };
}

export function enAlcance(alcance: Alcance, procesoId: number): boolean {
  return alcance.todos || alcance.procesoIds.includes(procesoId);
}

/**
 * Regla de nivel de acceso, para un `WHERE` o un `JOIN … ON`; la consulta llama
 * `d` a `documentos`. Un restringido exige estar asignado a un proceso activo del
 * documento: el suyo o, si la asociación es a un subproceso, el de ese subproceso.
 */
export function filtroAcceso(sql: Cliente, sujeto: SujetoVisibilidad) {
  if (ROLES_VEN_RESTRINGIDO.includes(sujeto.rol)) return sql`true`;
  return sql`(d.nivel_acceso = 'general' OR EXISTS (
    SELECT 1
    FROM documento_proceso acceso_dp
    LEFT JOIN subprocesos acceso_s ON acceso_s.id = acceso_dp.subproceso_id
    JOIN procesos acceso_p
      ON acceso_p.id = COALESCE(acceso_dp.proceso_id, acceso_s.proceso_id) AND acceso_p.activo
    JOIN usuario_procesos acceso_up
      ON acceso_up.proceso_id = acceso_p.id AND acceso_up.usuario_id = ${sujeto.usuarioId}
    WHERE acceso_dp.documento_id = d.id
  ))`;
}

/**
 * La misma regla de `filtroAcceso` evaluada por fila: `columnaUsuario` es la columna que trae el id de la
 * persona (por ejemplo, un fragmento `u.id`) y la consulta llama `d` a `documentos`. El rol sale de `usuarios`.
 */
export function filtroAccesoDe(sql: Cliente, columnaUsuario: ReturnType<Cliente>) {
  return sql`(d.nivel_acceso = 'general'
    OR EXISTS (SELECT 1 FROM usuarios acceso_u
      WHERE acceso_u.id = ${columnaUsuario} AND acceso_u.rol IN ${sql([...ROLES_VEN_RESTRINGIDO])})
    OR EXISTS (
      SELECT 1
      FROM documento_proceso acceso_dp
      LEFT JOIN subprocesos acceso_s ON acceso_s.id = acceso_dp.subproceso_id
      JOIN procesos acceso_p
        ON acceso_p.id = COALESCE(acceso_dp.proceso_id, acceso_s.proceso_id) AND acceso_p.activo
      JOIN usuario_procesos acceso_up
        ON acceso_up.proceso_id = acceso_p.id AND acceso_up.usuario_id = ${columnaUsuario}
      WHERE acceso_dp.documento_id = d.id
    ))`;
}

/** La misma regla para un documento suelto; `false` si el documento no existe. */
export async function puedeAccederDocumento(
  documentoId: number,
  sujeto: SujetoVisibilidad,
  opciones?: { sql?: Cliente },
): Promise<boolean> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`
    SELECT 1 FROM documentos d
    WHERE d.id = ${documentoId} AND ${filtroAcceso(sql, sujeto)}`;
  return filas.length > 0;
}

/**
 * Quién ve una versión ya publicada (spec 13A §12): la vigente, todo el que pasa el nivel de acceso del
 * documento; la obsoleta y la anulada, además, quien tiene `documentos.ver_historial`. Un borrador o una
 * versión descartada no se sirve por aquí. El acta de la versión se rige por la misma regla.
 */
export async function puedeVerVersion(
  versionId: number,
  sujeto: SujetoVisibilidad,
  opciones?: { sql?: Cliente },
): Promise<boolean> {
  const sql = opciones?.sql ?? obtenerSql();
  const [v] = await sql`
    SELECT v.estado FROM documento_versiones v
    JOIN documentos d ON d.id = v.documento_id
    WHERE v.id = ${versionId} AND ${filtroAcceso(sql, sujeto)}`;
  if (!v) return false;
  if (v.estado === "vigente") return true;
  if (v.estado === "obsoleto" || v.estado === "anulado") return puede(sujeto, "documentos.ver_historial");
  return false;
}

/**
 * Quién ve un trámite (spec 13A §6.5): la participación es la única excepción a
 * `alcanceProcesos`. Un trámite publicado o eliminado es la evidencia de cómo se aprobó, y lo
 * ven además quien tiene historial y pasa el nivel de acceso. Para los demás no existe.
 */
export function puedeVerTramite(v: {
  etapa: Etapa;
  esParticipante: boolean;
  rol: Rol;
  lideraAlgunProceso: boolean;
  verHistorial: boolean;
  pasaNivelAcceso: boolean;
}): boolean {
  if (v.esParticipante || v.rol === "admin_sgc") return true;
  if (v.rol === "lider_proceso" && v.lideraAlgunProceso) return true;
  const esEvidencia = v.etapa === "publicado" || v.etapa === "eliminado";
  return esEvidencia && v.pasaNivelAcceso && puede({ rol: v.rol, verHistorial: v.verHistorial }, "documentos.ver_historial");
}

export async function procesosAsignados(usuarioId: number): Promise<ProcesoAsignado[]> {
  const filas = await obtenerSql()`
    SELECT p.id, p.nombre, p.sigla, p.slug
    FROM usuario_procesos up
    JOIN procesos p ON p.id = up.proceso_id
    WHERE up.usuario_id = ${usuarioId} AND p.activo
    ORDER BY p.nombre`;
  return filas.map((f) => ({ id: f.id as number, nombre: f.nombre as string, sigla: f.sigla as string, slug: f.slug as string }));
}

/** Quién ve el módulo de distribución: quien tiene `distribucion.ver` o responde por algún punto activo. */
export function puedeVerDistribucion(sesion: SujetoVisibilidad & { responsableDePuntos?: boolean }): boolean {
  return puede(sesion, "distribucion.ver") || sesion.responsableDePuntos === true;
}

/**
 * Quién abre los catálogos de la distribución (Puntos de uso y Listas, spec 13C §12.3): quien tiene `distribucion.ver`;
 * sin `distribucion.gestionar`, en solo lectura. Qué puntos ve lo dice `filtroPuntos`; las listas son de la entidad.
 */
export function puedeVerCatalogos(sesion: SujetoVisibilidad): boolean {
  return puede(sesion, "distribucion.ver");
}

/**
 * Qué puntos de uso ve una persona, para un `WHERE` sobre `puntos_uso pu`: los roles que ven todo, todos;
 * el líder, los de sus procesos activos y los suyos; el resto, solo aquellos de los que es responsable.
 */
export function filtroPuntos(sql: Cliente, sujeto: SujetoVisibilidad) {
  if (sujeto.rol === "admin_sgc" || sujeto.rol === "gerencia" || sujeto.rol === "control_interno") return sql`true`;
  if (sujeto.rol === "lider_proceso") {
    return sql`(pu.responsable_id = ${sujeto.usuarioId} OR EXISTS (
      SELECT 1
      FROM punto_uso_procesos puntos_pp
      JOIN procesos puntos_p ON puntos_p.id = puntos_pp.proceso_id AND puntos_p.activo
      JOIN usuario_procesos puntos_up ON puntos_up.proceso_id = puntos_p.id AND puntos_up.usuario_id = ${sujeto.usuarioId}
      WHERE puntos_pp.punto_uso_id = pu.id
    ))`;
  }
  return sql`pu.responsable_id = ${sujeto.usuarioId}`;
}

/**
 * Si el documento `d` está en el alcance del líder (cualquier otro rol: siempre). Vive aquí, y no en `copias.ts`, para
 * que los puntos de uso y las jornadas no importen el módulo de las copias (y su PDF) solo por esta regla.
 */
export function documentoEnAlcance(sql: Cliente, sujeto: Pick<SujetoVisibilidad, "usuarioId" | "rol">) {
  if (sujeto.rol !== "lider_proceso") return sql`true`;
  return sql`EXISTS (
    SELECT 1
    FROM documento_proceso alc_dp
    LEFT JOIN subprocesos alc_s ON alc_s.id = alc_dp.subproceso_id
    JOIN procesos alc_p ON alc_p.id = COALESCE(alc_dp.proceso_id, alc_s.proceso_id) AND alc_p.activo
    JOIN usuario_procesos alc_up ON alc_up.proceso_id = alc_p.id AND alc_up.usuario_id = ${sujeto.usuarioId}
    WHERE alc_dp.documento_id = d.id
  )`;
}

/**
 * Quién ve una copia controlada (spec 13B §6.4), para un `WHERE` sobre `copias_controladas cc`, `puntos_uso pu` y
 * `documentos d`: `distribucion.ver` con alcance, el responsable del punto o quien la emitió.
 */
export function condicionVista(sql: Cliente, sujeto: SujetoVisibilidad) {
  const propias = sql`(cc.emitida_por = ${sujeto.usuarioId} OR cc.responsable_id = ${sujeto.usuarioId} OR pu.responsable_id = ${sujeto.usuarioId})`;
  if (!puede(sujeto, "distribucion.ver")) return propias;
  if (sujeto.rol === "lider_proceso") {
    // Las copias de sus puntos, pero nunca de un restringido que no ve (regla 3): un documento de otro proceso
    // entregado en un punto suyo solo aparece si su nivel de acceso lo permite.
    return sql`(${propias} OR (${filtroPuntos(sql, sujeto)} AND ${filtroAcceso(sql, sujeto)}) OR ${documentoEnAlcance(sql, sujeto)})`;
  }
  return sql`true`;
}

/**
 * Quién ve una jornada de socialización (spec 13B §6.4): el resumen, quien ve alguno de los documentos
 * socializados; la evidencia (lista de asistentes y actas), Admin SGC, Gerencia, Control Interno y el
 * líder de alguno de los procesos de esos documentos. `procesoIds` son todos los procesos de los documentos.
 */
export async function puedeVerJornada(
  sesion: SujetoVisibilidad,
  jornada: { procesoIds: number[]; documentoIds?: number[] },
  opciones?: { sql?: Cliente },
): Promise<{ ve: boolean; evidencia: boolean }> {
  let evidencia = sesion.rol === "admin_sgc" || sesion.rol === "gerencia" || sesion.rol === "control_interno";
  if (!evidencia && sesion.rol === "lider_proceso") {
    const alcance = await alcanceProcesos(sesion, opciones);
    evidencia = jornada.procesoIds.some((p) => enAlcance(alcance, p));
  }
  if (evidencia) return { ve: true, evidencia };
  for (const documentoId of jornada.documentoIds ?? []) {
    if (await puedeAccederDocumento(documentoId, sesion, opciones)) return { ve: true, evidencia: false };
  }
  return { ve: false, evidencia: false };
}

/**
 * Quién ve una verificación de un punto de uso (spec 13B §6.3): Admin SGC, Gerencia y Control Interno; el líder
 * de alguno de los procesos del punto; y quien es hoy el responsable del punto. `procesoIds` son los del punto.
 */
export async function puedeVerVerificacion(
  sesion: SujetoVisibilidad,
  v: { puntoId: number; responsableId: number; procesoIds: number[] },
  opciones?: { sql?: Cliente },
): Promise<boolean> {
  if (sesion.rol === "admin_sgc" || sesion.rol === "gerencia" || sesion.rol === "control_interno") return true;
  if (v.responsableId === sesion.usuarioId) return true;
  if (sesion.rol !== "lider_proceso") return false;
  const alcance = await alcanceProcesos(sesion, opciones);
  return v.procesoIds.some((p) => enAlcance(alcance, p));
}

/** Quién entra a «Vigencia»: quien ve el semáforo o los indicadores, o el responsable técnico de algún externo. */
export function puedeVerVigencia(sesion: SujetoVisibilidad & { responsableTecnico?: boolean }): boolean {
  return puede(sesion, "vigencia.ver") || puede(sesion, "documentos.indicadores") || sesion.responsableTecnico === true;
}

/**
 * Quién ratifica un documento (spec 13C §6.3): solo un interno vigente sin trámite abierto (el trámite ya es su
 * revisión); el Admin SGC siempre, el líder en los procesos de su alcance y Gerencia los de tipo estratégico.
 */
export function puedeRatificar(
  sujeto: SujetoVisibilidad,
  d: { procesoId: number; autoridad: Autoridad; origen: "interno" | "externo"; enTramite: boolean; vigente: boolean },
  alcance: Alcance,
): boolean {
  if (!puede(sujeto, "documentos.ratificar") || !d.vigente || d.enTramite || d.origen !== "interno") return false;
  if (sujeto.rol === "admin_sgc") return true;
  if (sujeto.rol === "lider_proceso") return enAlcance(alcance, d.procesoId);
  if (sujeto.rol === "gerencia") return d.autoridad === "estrategico";
  return false;
}

/**
 * Qué documentos lista la pestaña «Semáforo», para un `WHERE` sobre `documentos d`: el nivel de acceso y, para
 * el líder, los de sus procesos por la asociación principal (también si es a un subproceso). Quien no ve la
 * pestaña no recibe filas.
 */
export function filtroVigencia(sql: Cliente, sujeto: SujetoVisibilidad, alcance: Alcance) {
  if (!puede(sujeto, "vigencia.ver") && !puede(sujeto, "documentos.indicadores")) return sql`false`;
  if (alcance.todos) return filtroAcceso(sql, sujeto);
  if (alcance.procesoIds.length === 0) return sql`false`;
  return sql`(${filtroAcceso(sql, sujeto)} AND EXISTS (
    SELECT 1
    FROM documento_proceso vigencia_dp
    LEFT JOIN subprocesos vigencia_s ON vigencia_s.id = vigencia_dp.subproceso_id
    WHERE vigencia_dp.documento_id = d.id AND vigencia_dp.es_principal
      AND COALESCE(vigencia_dp.proceso_id, vigencia_s.proceso_id) = ANY(${alcance.procesoIds})
  ))`;
}

/** Quién gestiona un externo (spec 13C §6.2): `externos.gestionar` sobre su proceso propietario, del alcance. */
export function puedeGestionarExterno(sujeto: SujetoVisibilidad, procesoId: number, alcance: Alcance): boolean {
  return puede(sujeto, "externos.gestionar") && enAlcance(alcance, procesoId);
}

/**
 * Quién ve la página de control de un externo (spec 13C §8.8): quien lo gestiona, su responsable técnico (aunque sea
 * de rol Consulta, sin que por eso vea otros) y quien tiene `vigencia.ver` sobre su proceso propietario. Siempre
 * además la regla de nivel de acceso: un restringido no existe para quien no lo ve. `false` si no es un externo.
 */
export async function puedeVerExterno(
  documentoId: number,
  sujeto: SujetoVisibilidad & { usuarioId: number },
  opciones?: { sql?: Cliente },
): Promise<boolean> {
  const sql = opciones?.sql ?? obtenerSql();
  const [d] = await sql`
    SELECT COALESCE(dp.proceso_id, s.proceso_id) AS proceso_id, ex.responsable_id
    FROM documentos d
    JOIN externos ex ON ex.documento_id = d.id
    JOIN documento_proceso dp ON dp.documento_id = d.id AND dp.es_principal
    LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
    WHERE d.id = ${documentoId} AND d.origen = 'externo' AND ${filtroAcceso(sql, sujeto)}`;
  if (!d) return false;
  if (Number(d.responsable_id) === sujeto.usuarioId) return true;
  if (!puede(sujeto, "externos.gestionar") && !puede(sujeto, "vigencia.ver")) return false;
  return enAlcance(await alcanceProcesos(sujeto, { sql }), Number(d.proceso_id));
}

/**
 * Quién asocia una norma a un proceso, escribe su requisito y enlaza los documentos del proceso (spec 13C §10.3):
 * `normograma.procesos` sobre un proceso de su alcance (el Admin SGC todos, el líder los suyos).
 */
export function puedeAsociarNorma(sujeto: SujetoVisibilidad, procesoId: number, alcance: Alcance): boolean {
  return puede(sujeto, "normograma.procesos") && enAlcance(alcance, procesoId);
}

/** Quién ve y resuelve los impactos de un cambio normativo en un proceso (spec 13C §10.5): lo mismo, y el Admin SGC siempre. */
export function puedeVerImpacto(sujeto: SujetoVisibilidad, procesoId: number, alcance: Alcance): boolean {
  return sujeto.rol === "admin_sgc" || puedeAsociarNorma(sujeto, procesoId, alcance);
}

/**
 * Quién ve la revisión anual (spec 13C §9.7): quien tiene `vigencia.ver`. El líder ve solo sus procesos (lo recorta
 * `alcanceProcesos`); el Admin SGC, Gerencia y Control Interno, toda la campaña.
 */
export function puedeVerRevisionAnual(sujeto: SujetoVisibilidad): boolean {
  return puede(sujeto, "vigencia.ver");
}

/** Quién decide en la revisión anual sobre los documentos de un proceso y confirma su normograma (spec 13C §9.3 y §9.4). */
export function puedeDecidirEn(sujeto: SujetoVisibilidad, procesoId: number, alcance: Alcance): boolean {
  return puede(sujeto, "revision_anual.decidir") && enAlcance(alcance, procesoId);
}

/** El informe institucional de la revisión anual nombra documentos restringidos: lo ven los roles que los ven. */
export function puedeVerInformeAnual(sujeto: SujetoVisibilidad): boolean {
  return ROLES_VEN_RESTRINGIDO.includes(sujeto.rol);
}

// ─────────────────────────────────────────────────────────────────────────────
// Indicadores (Fase 14, spec §6). «Líder del proceso» es un usuario activo de rol `lider_proceso`
// con el proceso activo en `usuario_procesos`, como `lideresDeProceso`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Qué indicadores ve una persona, para un `WHERE` sobre `indicadores i`: los generales; los restringidos, los roles que
 * ven todo, quien está asignado al proceso activo del indicador y quien está designado en él, en cualquier función.
 */
export function filtroIndicadores(sql: Cliente, sujeto: SujetoVisibilidad) {
  if (ROLES_VEN_RESTRINGIDO.includes(sujeto.rol)) return sql`true`;
  return sql`(i.nivel_acceso = 'general'
    OR EXISTS (
      SELECT 1
      FROM usuario_procesos ind_up
      JOIN procesos ind_p ON ind_p.id = ind_up.proceso_id AND ind_p.activo
      WHERE ind_up.usuario_id = ${sujeto.usuarioId} AND ind_up.proceso_id = i.proceso_id
    )
    OR EXISTS (
      SELECT 1 FROM indicador_designados ind_d
      WHERE ind_d.indicador_id = i.id AND ind_d.usuario_id = ${sujeto.usuarioId}
    ))`;
}

/** La persona es líder activo del proceso `procesoId`: lo mismo que `lideresDeProceso`, para una sola persona. */
async function esLiderDelProceso(sql: Cliente, sujeto: SujetoVisibilidad, procesoId: number): Promise<boolean> {
  if (sujeto.rol !== "lider_proceso") return false;
  const filas = await sql`
    SELECT 1
    FROM usuario_procesos up
    JOIN usuarios u ON u.id = up.usuario_id AND u.activo AND u.rol = 'lider_proceso'
    JOIN procesos p ON p.id = up.proceso_id AND p.activo
    WHERE up.usuario_id = ${sujeto.usuarioId} AND up.proceso_id = ${procesoId}`;
  return filas.length > 0;
}

/** La persona es un usuario activo designado en el indicador en alguna de las funciones dadas. */
async function estaDesignado(
  sql: Cliente,
  sujeto: SujetoVisibilidad,
  indicadorId: number,
  funciones: readonly FuncionDesignado[],
): Promise<boolean> {
  const filas = await sql`
    SELECT 1
    FROM indicador_designados d
    JOIN usuarios u ON u.id = d.usuario_id AND u.activo
    WHERE d.indicador_id = ${indicadorId} AND d.usuario_id = ${sujeto.usuarioId}
      AND d.funcion IN ${sql([...funciones])}`;
  return filas.length > 0;
}

async function procesoDelIndicador(sql: Cliente, indicadorId: number): Promise<number | null> {
  const [i] = await sql`SELECT proceso_id FROM indicadores WHERE id = ${indicadorId}`;
  return i ? Number(i.proceso_id) : null;
}

/**
 * Quién ve un indicador (spec 14 §6.4): activo o retirado, quien pasa `filtroIndicadores`; un borrador o un
 * descartado, solo quien tiene `indicadores.administrar`. `false` si no existe.
 */
export async function puedeVerIndicador(
  indicadorId: number,
  sujeto: SujetoVisibilidad,
  opciones?: { sql?: Cliente },
): Promise<boolean> {
  const sql = opciones?.sql ?? obtenerSql();
  const [i] = await sql`
    SELECT i.estado FROM indicadores i
    WHERE i.id = ${indicadorId} AND ${filtroIndicadores(sql, sujeto)}`;
  if (!i) return false;
  if (i.estado === "borrador" || i.estado === "descartado") return puede(sujeto, "indicadores.administrar");
  return true;
}

/**
 * Quién ve los soportes de las mediciones (spec 14 §6.4), más estricto que ver el indicador: Admin SGC, Gerencia y
 * Control Interno, el líder del proceso y los designados en cualquier función.
 */
export async function puedeVerSoportes(
  indicadorId: number,
  sujeto: SujetoVisibilidad,
  opciones?: { sql?: Cliente },
): Promise<boolean> {
  const sql = opciones?.sql ?? obtenerSql();
  const procesoId = await procesoDelIndicador(sql, indicadorId);
  if (procesoId === null) return false;
  if (ROLES_VEN_RESTRINGIDO.includes(sujeto.rol)) return true;
  if (await esLiderDelProceso(sql, sujeto, procesoId)) return true;
  return estaDesignado(sql, sujeto, indicadorId, FUNCIONES_DESIGNADO);
}

export type Capacidad = { puede: boolean; sinMedidor: boolean };

/**
 * Quién cumple una función de la medición: el designado activo y el líder del proceso. El Admin SGC solo si está
 * designado o si no hay designado activo en la función ni líder activo (entonces `sinMedidor`).
 */
async function capacidad(
  indicadorId: number,
  sujeto: SujetoVisibilidad,
  funcion: "mide" | "analiza",
  opciones?: { sql?: Cliente },
): Promise<Capacidad> {
  const sql = opciones?.sql ?? obtenerSql();
  const no: Capacidad = { puede: false, sinMedidor: false };
  const procesoId = await procesoDelIndicador(sql, indicadorId);
  if (procesoId === null) return no;
  if (await estaDesignado(sql, sujeto, indicadorId, [funcion])) return { puede: true, sinMedidor: false };
  if (await esLiderDelProceso(sql, sujeto, procesoId)) return { puede: true, sinMedidor: false };
  if (sujeto.rol !== "admin_sgc") return no;
  const [hay] = await sql`
    SELECT
      EXISTS (
        SELECT 1 FROM indicador_designados d JOIN usuarios u ON u.id = d.usuario_id AND u.activo
        WHERE d.indicador_id = ${indicadorId} AND d.funcion = ${funcion}
      ) OR EXISTS (
        SELECT 1
        FROM usuario_procesos up
        JOIN usuarios u ON u.id = up.usuario_id AND u.activo AND u.rol = 'lider_proceso'
        JOIN procesos p ON p.id = up.proceso_id AND p.activo
        WHERE up.proceso_id = ${procesoId}
      ) AS alguien`;
  return hay.alguien ? no : { puede: true, sinMedidor: true };
}

export function puedeMedir(indicadorId: number, sujeto: SujetoVisibilidad, opciones?: { sql?: Cliente }): Promise<Capacidad> {
  return capacidad(indicadorId, sujeto, "mide", opciones);
}

export function puedeAnalizar(indicadorId: number, sujeto: SujetoVisibilidad, opciones?: { sql?: Cliente }): Promise<Capacidad> {
  return capacidad(indicadorId, sujeto, "analiza", opciones);
}

/** Quién deja observaciones en una medición: quien ve el indicador y es Admin SGC, Gerencia, Control Interno o designado en seguimiento. */
export async function puedeObservar(
  indicadorId: number,
  sujeto: SujetoVisibilidad,
  opciones?: { sql?: Cliente },
): Promise<boolean> {
  const sql = opciones?.sql ?? obtenerSql();
  if (!(await puedeVerIndicador(indicadorId, sujeto, { sql }))) return false;
  if (ROLES_VEN_RESTRINGIDO.includes(sujeto.rol)) return true;
  return estaDesignado(sql, sujeto, indicadorId, ["seguimiento"]);
}

/**
 * Quiénes aprueban una ficha (spec 14 §6.3), según la clasificación de la versión: usuarios activos de Gerencia o
 * líderes activos del proceso; nunca quien la elaboró. Si con `lider` no queda nadie, Gerencia (F14-DC19). Sin
 * clasificación no hay aprobadores.
 */
export async function aprobadoresDeFicha(versionId: number, opciones?: { sql?: Cliente }): Promise<number[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const [v] = await sql`
    SELECT i.proceso_id, v.elaborada_por, c.aprueba
    FROM indicador_versiones v
    JOIN indicadores i ON i.id = v.indicador_id
    LEFT JOIN clasificaciones_indicador c ON c.id = v.clasificacion_id
    WHERE v.id = ${versionId}`;
  if (!v || v.aprueba === null) return [];
  const elaboro = v.elaborada_por === null ? null : Number(v.elaborada_por);
  if (v.aprueba === "lider") {
    const lideres = await sql`
      SELECT DISTINCT u.id
      FROM usuario_procesos up
      JOIN usuarios u ON u.id = up.usuario_id AND u.activo AND u.rol = 'lider_proceso'
      JOIN procesos p ON p.id = up.proceso_id AND p.activo
      WHERE up.proceso_id = ${v.proceso_id} AND u.id IS DISTINCT FROM ${elaboro}
      ORDER BY u.id`;
    if (lideres.length > 0) return lideres.map((f) => Number(f.id));
  }
  const gerencia = await sql`
    SELECT id FROM usuarios WHERE rol = 'gerencia' AND activo AND id IS DISTINCT FROM ${elaboro} ORDER BY id`;
  return gerencia.map((f) => Number(f.id));
}

export async function puedeAprobarFicha(
  versionId: number,
  sujeto: SujetoVisibilidad,
  opciones?: { sql?: Cliente },
): Promise<boolean> {
  return (await aprobadoresDeFicha(versionId, opciones)).includes(sujeto.usuarioId);
}

/** Los destinatarios de las tareas y avisos de una función: los designados activos; si no, los líderes; si no, los Admin SGC. */
async function responsables(indicadorId: number, funcion: "mide" | "analiza", opciones?: { sql?: Cliente }): Promise<number[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const designados = await sql`
    SELECT DISTINCT d.usuario_id AS id
    FROM indicador_designados d JOIN usuarios u ON u.id = d.usuario_id AND u.activo
    WHERE d.indicador_id = ${indicadorId} AND d.funcion = ${funcion}
    ORDER BY d.usuario_id`;
  if (designados.length > 0) return designados.map((f) => Number(f.id));
  const lideres = await sql`
    SELECT DISTINCT u.id
    FROM indicadores i
    JOIN usuario_procesos up ON up.proceso_id = i.proceso_id
    JOIN usuarios u ON u.id = up.usuario_id AND u.activo AND u.rol = 'lider_proceso'
    JOIN procesos p ON p.id = up.proceso_id AND p.activo
    WHERE i.id = ${indicadorId}
    ORDER BY u.id`;
  if (lideres.length > 0) return lideres.map((f) => Number(f.id));
  const admins = await sql`SELECT id FROM usuarios WHERE rol = 'admin_sgc' AND activo ORDER BY id`;
  return admins.map((f) => Number(f.id));
}

export function responsablesDeMedir(indicadorId: number, opciones?: { sql?: Cliente }): Promise<number[]> {
  return responsables(indicadorId, "mide", opciones);
}

export function responsablesDeAnalizar(indicadorId: number, opciones?: { sql?: Cliente }): Promise<number[]> {
  return responsables(indicadorId, "analiza", opciones);
}
