/**
 * Los reportes de funcionarios (spec 15 §7.3, F15-DC8): una entidad aparte del hallazgo, sin código `HZ`. Cualquier persona con
 * sesión reporta lo que vio; el Admin SGC lo clasifica dentro de su plazo: lo convierte en un hallazgo (`registrarHallazgo` con
 * `reporteId`), lo suma como ocurrencia de uno abierto (`sumarReporte`) o lo descarta con su motivo (`descartarReporte`). Nada
 * se borra; cada paso deja su evento en `mejora_reporte_eventos` y su fila de bitácora, sin lo que se escribió.
 *
 * Quien reportó ve su reporte y una etiqueta («Recibido», «En trámite», «Cerrado» o «Descartado», `etiquetaDeReporte`), con el
 * motivo si se descartó: nunca el código, el título ni el enlace del hallazgo (F15-DC5). Los reportes recibidos, con el nombre
 * de quien reportó, solo los roles de control (`mejora.ver_todo`).
 */
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { avisarA } from "@/db/consultas/avisos-vencimiento";
import { enTransaccion, type OpcionesFlujo, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { filtroHallazgos, puedeVerHallazgo } from "@/lib/alcance";
import { EsquemaDescarte, EsquemaReporte, EsquemaSumarReporte } from "@/lib/esquemas/mejoramiento";
import { fechaDeDia } from "@/lib/mejoramiento/formato";
import { venceEn } from "@/lib/mejoramiento/plazos";
import {
  CODIGO_NO_VALIDO,
  DIAS_DE_CLASIFICADOS,
  ENTIDAD_REPORTE,
  etiquetaDeReporte,
  MAXIMO_POR_REPORTE,
  PATRON_DE_CODIGO,
  RUTA_REPORTES_RECIBIDOS,
  SOLO_ABIERTO,
  type EstadoReporte,
  type EtiquetaDeReporte,
} from "@/lib/mejoramiento/reportes";
import { ErrorMejora, TERMINALES } from "@/lib/mejoramiento/tipos";
import { puede, requerirPermiso } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { activosDeRol } from "./avisos";
import { contextoDeMejora } from "./config";
import { bloquearHallazgo, legible, NO_EXISTE } from "./flujo";
import { registrarOcurrencia } from "./registro";
import { bloquearReporteRecibido, dejarClasificado, dejarEventoDeReporte } from "./reportes-base";

export {
  AVISO_CERRADO,
  AVISO_DESCARTADO,
  AVISO_EN_TRAMITE,
  REPORTE_NO_EXISTE,
  SOLO_ABIERTO,
  YA_CLASIFICADO,
} from "@/lib/mejoramiento/reportes";

type Opciones = { sql?: Cliente };

const esId = (n: number) => Number.isSafeInteger(n) && n > 0;

// ─────────────────────────────────────────────────────────────────────────────
// Reportar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cualquier persona con sesión reporta una posible no conformidad (spec §7.3): qué vio, cuándo (no después de hoy en la zona de
 * la instalación), en qué proceso (opcional: «no sé») y la referencia del caso, si aplica. Queda «Recibido», con el plazo de
 * clasificar contado desde ahora, y avisa a cada Admin SGC activo con quién reportó y cuándo lo vio, sin lo que escribió (los
 * avisos pueden salir por correo). Los archivos, hasta tres, se suben después (`api/mejoramiento/reportes/[id]/archivos`).
 * Enviado, no se edita.
 */
export async function enviarReporte(
  sesion: SesionFlujo,
  d: { descripcion: string; vistoEn: string; procesoId?: number | null; referenciaCaso?: string | null },
  opciones?: OpcionesFlujo,
): Promise<{ id: number }> {
  requerirPermiso(sesion, "mejora.reportar");
  const leido = EsquemaReporte.safeParse(d);
  if (!leido.success) throw new ErrorMejora(leido.error.issues[0].message);
  const v = leido.data;
  const ahora = opciones?.ahora ?? new Date();
  return legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      const c = await contextoDeMejora(tx, ahora);
      if (v.vistoEn > fechaEnZona(c.ahora, c.zona)) throw new ErrorMejora("La fecha en que lo vio no puede ser futura");
      let proceso: string | null = null;
      if (v.procesoId !== null) {
        const [p] = await tx`SELECT nombre, activo FROM procesos WHERE id = ${v.procesoId}`;
        if (!p?.activo) throw new ErrorMejora("Elija un proceso activo");
        proceso = p.nombre as string;
      }
      const [r] = await tx`INSERT INTO mejora_reportes
          (reportado_por, reportado_en, descripcion, visto_en, proceso_id, referencia_caso, estado, vence_en)
        VALUES (${sesion.usuarioId}, ${c.ahora}, ${v.descripcion}, ${v.vistoEn}, ${v.procesoId}, ${v.referenciaCaso}, 'recibido',
          ${venceEn("clasificar", c.ahora, c)})
        RETURNING id`;
      const id = Number(r.id);
      await dejarEventoDeReporte(tx, { reporteId: id, tipo: "enviado", usuarioId: sesion.usuarioId, creadoEn: c.ahora });
      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: "mejora_reporte_enviado",
        entidad: ENTIDAD_REPORTE,
        entidadId: id,
        detalle: { reporteId: id, procesoId: v.procesoId, estado: { antes: null, despues: "recibido" } },
      });
      const admins = (await activosDeRol(tx, ["admin_sgc"])).filter((u) => u !== sesion.usuarioId);
      if (admins.length > 0) {
        const cuerpo = `Lo vio el ${fechaDeDia(v.vistoEn)} · ${proceso ?? "sin proceso"}`;
        await avisarA(
          tx,
          {
            tipo: "mejora.reporte_recibido",
            titulo: `Nuevo reporte de ${sesion.nombre}: clasifíquelo`,
            enlace: RUTA_REPORTES_RECIBIDOS,
            entidad: ENTIDAD_REPORTE,
            entidadId: id,
          },
          admins.map((usuarioId) => ({ usuarioId, cuerpo })),
        );
      }
      return { id };
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lo que se lee
// ─────────────────────────────────────────────────────────────────────────────

/** Un reporte como lo ve quien lo envió: sin nada del hallazgo, ni su id. */
export type MiReporte = {
  id: number;
  cuando: Date;
  vistoEn: string;
  descripcion: string;
  etiqueta: EtiquetaDeReporte;
  /** El motivo del descarte; nulo si no se descartó. */
  motivo: string | null;
  archivos: number;
  /** Si todavía puede adjuntarle archivos: sigue «Recibido» y tiene menos de tres. */
  puedeAdjuntar: boolean;
};

/** Lo que el hallazgo de un reporte aporta a su lectura: solo su estado (la etiqueta), nunca su código ni su título. */
const COLUMNAS = (sql: Cliente) => sql`r.id, r.reportado_por, r.reportado_en, to_char(r.visto_en, 'YYYY-MM-DD') AS visto, r.descripcion,
  r.estado, r.motivo_descarte, h.estado AS estado_hallazgo,
  (SELECT count(*) FROM archivos a WHERE a.contexto = 'mejora_reporte' AND a.contexto_id = r.id AND a.version_id IS NULL) AS archivos`;

function aMiReporte(f: Record<string, unknown>, suyo: boolean): MiReporte {
  const archivos = Number(f.archivos);
  return {
    id: Number(f.id),
    cuando: f.reportado_en as Date,
    vistoEn: f.visto as string,
    descripcion: f.descripcion as string,
    etiqueta: etiquetaDeReporte(f.estado as string, (f.estado_hallazgo as string | null) ?? null),
    motivo: f.estado === "descartado" ? ((f.motivo_descarte as string | null) ?? null) : null,
    archivos,
    puedeAdjuntar: suyo && f.estado === "recibido" && archivos < MAXIMO_POR_REPORTE,
  };
}

/** «Mis reportes» (spec §7.3): los que envió la persona, del más reciente al más antiguo. */
export async function misReportes(sesion: Pick<SesionFlujo, "usuarioId">, opciones?: Opciones): Promise<MiReporte[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT ${COLUMNAS(sql)}
    FROM mejora_reportes r LEFT JOIN mejora_hallazgos h ON h.id = r.hallazgo_id
    WHERE r.reportado_por = ${sesion.usuarioId}
    ORDER BY r.reportado_en DESC, r.id DESC`;
  return filas.map((f) => aMiReporte(f, true));
}

/** El hallazgo de un reporte clasificado, para los roles de control (que ven todos los hallazgos). */
export type HallazgoDelReporte = { id: number; codigo: string; titulo: string };

/** Un reporte en «Reportes recibidos» (`mejora.ver_todo`), con quién reportó. */
export type ReporteDeLaLista = {
  id: number;
  cuando: Date;
  reportadoPor: string;
  descripcion: string;
  vistoEn: string;
  procesoId: number | null;
  proceso: string | null;
  referenciaCaso: string | null;
  estado: EstadoReporte;
  vence: Date;
  motivo: string | null;
  hallazgo: HallazgoDelReporte | null;
  archivos: number;
};

const hallazgoDe = (f: Record<string, unknown>): HallazgoDelReporte | null =>
  f.hallazgo_id === null || f.hallazgo_id === undefined
    ? null
    : { id: Number(f.hallazgo_id), codigo: f.hallazgo_codigo as string, titulo: f.hallazgo_titulo as string };

/**
 * «Reportes recibidos» (spec §7.3 y §16.1), solo para `mejora.ver_todo`; a los demás, vacío. Todos los que esperan su
 * clasificación, del que vence antes al que vence después; luego los clasificados en los últimos `DIAS_DE_CLASIFICADOS` días
 * (contados desde `ahora`), del más reciente al más antiguo: la lista no crece sin límite.
 */
export async function reportesRecibidos(sesion: SesionFlujo, opciones?: Opciones & { ahora?: Date }): Promise<ReporteDeLaLista[]> {
  if (!puede(sesion, "mejora.ver_todo")) return [];
  const sql = opciones?.sql ?? obtenerSql();
  const desde = new Date((opciones?.ahora ?? new Date()).getTime() - DIAS_DE_CLASIFICADOS * 86_400_000);
  const filas = await sql`SELECT ${COLUMNAS(sql)}, u.nombre AS reportador, r.proceso_id, p.nombre AS proceso, r.referencia_caso,
      r.vence_en, h.id AS hallazgo_id, h.codigo AS hallazgo_codigo, h.titulo AS hallazgo_titulo
    FROM mejora_reportes r
    JOIN usuarios u ON u.id = r.reportado_por
    LEFT JOIN procesos p ON p.id = r.proceso_id
    LEFT JOIN mejora_hallazgos h ON h.id = r.hallazgo_id
    WHERE r.estado = 'recibido' OR r.clasificado_en >= ${desde}
    ORDER BY (r.estado = 'recibido') DESC, CASE WHEN r.estado = 'recibido' THEN r.vence_en END ASC,
      coalesce(r.clasificado_en, r.reportado_en) DESC, r.id DESC`;
  return filas.map((f) => ({
    id: Number(f.id),
    cuando: f.reportado_en as Date,
    reportadoPor: f.reportador as string,
    descripcion: f.descripcion as string,
    vistoEn: f.visto as string,
    procesoId: f.proceso_id === null ? null : Number(f.proceso_id),
    proceso: (f.proceso as string | null) ?? null,
    referenciaCaso: (f.referencia_caso as string | null) ?? null,
    estado: f.estado as EstadoReporte,
    vence: f.vence_en as Date,
    motivo: (f.motivo_descarte as string | null) ?? null,
    hallazgo: hallazgoDe(f),
    archivos: Number(f.archivos),
  }));
}

/** Cuántos reportes esperan su clasificación (el número de la pestaña); cero para quien no tiene `mejora.ver_todo`. */
export async function contarReportesPorClasificar(sesion: SesionFlujo, opciones?: Opciones): Promise<number> {
  if (!puede(sesion, "mejora.ver_todo")) return 0;
  const [f] = await (opciones?.sql ?? obtenerSql())`SELECT count(*)::int AS n FROM mejora_reportes WHERE estado = 'recibido'`;
  return Number(f.n);
}

/** Un reporte leído por quien lo envió o por un rol de control. */
export type ReporteLeido = MiReporte & {
  proceso: string | null;
  procesoId: number | null;
  referenciaCaso: string | null;
  /** Si lo envió quien lee. */
  suyo: boolean;
  /** Lo que solo ven los roles de control (`mejora.ver_todo`): quién reportó, el estado, el plazo y el hallazgo. */
  control: { reportadoPor: string; estado: EstadoReporte; vence: Date; hallazgo: HallazgoDelReporte | null } | null;
};

/**
 * Un reporte, para quien lo envió o para `mejora.ver_todo`; nulo para cualquier otro, y si no existe (la misma respuesta). A
 * quien lo envió le llega sin nada del hallazgo (F15-DC5).
 */
export async function leerReporte(sesion: SesionFlujo, id: number, opciones?: Opciones): Promise<ReporteLeido | null> {
  if (!esId(id)) return null;
  const sql = opciones?.sql ?? obtenerSql();
  const [f] = await sql`SELECT ${COLUMNAS(sql)}, u.nombre AS reportador, r.proceso_id, p.nombre AS proceso, r.referencia_caso,
      r.vence_en, h.id AS hallazgo_id, h.codigo AS hallazgo_codigo, h.titulo AS hallazgo_titulo
    FROM mejora_reportes r
    JOIN usuarios u ON u.id = r.reportado_por
    LEFT JOIN procesos p ON p.id = r.proceso_id
    LEFT JOIN mejora_hallazgos h ON h.id = r.hallazgo_id
    WHERE r.id = ${id}`;
  if (!f) return null;
  const suyo = Number(f.reportado_por) === sesion.usuarioId;
  const deControl = puede(sesion, "mejora.ver_todo");
  if (!suyo && !deControl) return null;
  return {
    ...aMiReporte(f, suyo),
    proceso: (f.proceso as string | null) ?? null,
    procesoId: f.proceso_id === null ? null : Number(f.proceso_id),
    referenciaCaso: (f.referencia_caso as string | null) ?? null,
    suyo,
    control: deControl
      ? { reportadoPor: f.reportador as string, estado: f.estado as EstadoReporte, vence: f.vence_en as Date, hallazgo: hallazgoDe(f) }
      : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Clasificar (spec §7.3): convertir va por `registrarHallazgo`; sumar y descartar, aquí
// ─────────────────────────────────────────────────────────────────────────────

/**
 * El hallazgo de un código escrito (`HZ-AAAA-NNN`, sin importar mayúsculas ni espacios), entre los que la persona ve
 * (`filtroHallazgos`): para sumar un reporte a uno abierto que los parecidos no sugirieron. Quien no lo ve y un código que no
 * existe reciben lo mismo, «El hallazgo no existe». Si está abierto lo decide `sumarReporte`.
 */
export async function hallazgoPorCodigo(sesion: SesionFlujo, codigo: string, opciones?: Opciones): Promise<number> {
  const limpio = codigo.trim().toUpperCase();
  if (!PATRON_DE_CODIGO.test(limpio)) throw new ErrorMejora(CODIGO_NO_VALIDO);
  const sql = opciones?.sql ?? obtenerSql();
  const [f] = await sql`SELECT h.id FROM mejora_hallazgos h WHERE h.codigo = ${limpio} AND ${filtroHallazgos(sql, sesion)}`;
  if (!f) throw new ErrorMejora(NO_EXISTE);
  return Number(f.id);
}

/**
 * El Admin SGC añade el reporte como ocurrencia de cualquier hallazgo abierto que ve (spec §7.3 y §7.5; los parecidos son solo
 * sugerencias): la ocurrencia lleva lo que se vio, el día en que se vio, `origen = 'reporte'` y el reporte, y el reporte queda
 * `sumado`; su evidencia la abre desde entonces quien ve el hallazgo completo. El hallazgo se bloquea primero y
 * el reporte después; el reporte debe seguir «Recibido» (`YA_CLASIFICADO`).
 */
export async function sumarReporte(sesion: SesionFlujo, d: { reporteId: number; hallazgoId: number }, opciones?: OpcionesFlujo): Promise<void> {
  requerirPermiso(sesion, "mejora.gestionar");
  const leido = EsquemaSumarReporte.safeParse(d);
  if (!leido.success) throw new ErrorMejora(leido.error.issues[0].message);
  const v = leido.data;
  const ahora = opciones?.ahora ?? new Date();
  return legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      // Para quien no puede ver el hallazgo, no existe (spec §6.3).
      if (!(await puedeVerHallazgo(v.hallazgoId, sesion, { sql: tx }))) throw new ErrorMejora(NO_EXISTE);
      const h = await bloquearHallazgo(tx, v.hallazgoId);
      if (TERMINALES.includes(h.estado)) throw new ErrorMejora(SOLO_ABIERTO);
      const r = await bloquearReporteRecibido(tx, v.reporteId);
      await registrarOcurrencia(
        sesion,
        { hallazgoId: h.id, fecha: r.vistoEn, descripcion: r.descripcion, origen: "reporte", reporteId: r.id },
        { sql: tx, ahora },
      );
      await dejarClasificado(tx, sesion, r, { estado: "sumado", hallazgo: h }, ahora);
    }),
  );
}

/** El Admin SGC descarta el reporte con su motivo (al menos diez caracteres), que quien reportó lee (spec §7.3). */
export async function descartarReporte(sesion: SesionFlujo, d: { reporteId: number; motivo: string }, opciones?: OpcionesFlujo): Promise<void> {
  requerirPermiso(sesion, "mejora.gestionar");
  const leido = EsquemaDescarte.safeParse(d);
  if (!leido.success) throw new ErrorMejora(leido.error.issues[0].message);
  const v = leido.data;
  const ahora = opciones?.ahora ?? new Date();
  return legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      const r = await bloquearReporteRecibido(tx, v.reporteId);
      await dejarClasificado(tx, sesion, r, { estado: "descartado", motivo: v.motivo }, ahora);
    }),
  );
}
