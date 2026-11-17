/**
 * El registro de un hallazgo (spec 15 §7.1 a §7.4) y su código `HZ-AAAA-NNN`. El estado en que nace lo decide la tabla
 * de §7.4; el nacimiento, `nacerHallazgo`.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { enTransaccion, type OpcionesFlujo, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { lideresDeProceso } from "@/db/consultas/tramites";
import { alcanceProcesos, enAlcance } from "@/lib/alcance";
import { EsquemaHallazgo, type HallazgoValidado } from "@/lib/esquemas/mejoramiento";
import { esExterno } from "@/lib/mejoramiento/origenes";
import { ErrorMejora, type Clase, type Criticidad, type HallazgoBase, type Origen } from "@/lib/mejoramiento/tipos";
import { ErrorPermiso, requerirPermiso } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { activosDeRol, avisarDeMejora } from "./avisos";
import { contextoDeMejora, type ContextoMejora } from "./config";
import { legible, nacerHallazgo, type FilaNueva } from "./flujo";

/** Los campos de la identificación (spec §7.1). Los ids y las fechas también llegan como texto del formulario. */
export type DatosDeHallazgo = {
  clase: Clase;
  origen: Origen;
  fuente?: string | null;
  referenciaCaso?: string | null;
  /** `yyyy-mm-dd`, de hoy hacia atrás en la zona de la instalación. */
  detectadoEn: string;
  procesoId: number;
  subprocesoId?: number | null;
  criticidad?: Criticidad | null;
  titulo: string;
  descripcion: string;
  requisitoClausula?: string | null;
  requisitoNormaId?: number | null;
  requisitoDocumentoId?: number | null;
  documentoId?: number | null;
  indicadorId?: number | null;
  medicionId?: number | null;
  riesgo?: string | null;
  /** Solo en los orígenes externos: obligatoria en «Ente de control» (spec §13.4). */
  fechaLimiteEnte?: string | null;
  /** La reincidencia la valida y la guarda la Tarea 8 (spec §7.5); hasta entonces no se guarda. */
  reincidenteDe?: number | null;
  /** El reporte que se convierte lo deja `convertido` la Tarea 18 (spec §7.3); hasta entonces no se usa. */
  reporteId?: number | null;
};

/**
 * El consecutivo del año, dentro de la transacción del registro: sin huecos (una transacción revertida no lo quema,
 * como sí lo haría una secuencia) y sin repetirse (el `ON CONFLICT` serializa a dos registros del mismo año).
 */
export async function tomarCodigo(tx: TransactionSql, anio: number): Promise<{ consecutivo: number; codigo: string }> {
  const [f] = await tx`INSERT INTO mejora_consecutivos (anio, ultimo) VALUES (${anio}, 1)
    ON CONFLICT (anio) DO UPDATE SET ultimo = mejora_consecutivos.ultimo + 1
    RETURNING ultimo`;
  const consecutivo = Number(f.ultimo);
  return { consecutivo, codigo: "HZ-" + anio + "-" + String(consecutivo).padStart(3, "0") };
}

/** Lo que el esquema no puede saber: la fecha de hoy, el proceso y lo enlazado. Solo lecturas. */
async function revisarIdentificacion(tx: TransactionSql, v: HallazgoValidado, c: ContextoMejora): Promise<void> {
  if (v.detectadoEn > fechaEnZona(c.ahora, c.zona)) throw new ErrorMejora("La fecha en que se detectó no puede ser futura");
  const [proceso] = await tx`SELECT activo FROM procesos WHERE id = ${v.procesoId}`;
  if (!proceso?.activo) throw new ErrorMejora("Elija un proceso activo");
  if (v.subprocesoId !== null) {
    const [s] = await tx`SELECT 1 FROM subprocesos WHERE id = ${v.subprocesoId} AND proceso_id = ${v.procesoId}`;
    if (!s) throw new ErrorMejora("El subproceso elegido no es de ese proceso");
  }
  if (v.indicadorId !== null) {
    const [i] = await tx`SELECT 1 FROM indicadores WHERE id = ${v.indicadorId} AND estado IN ('activo', 'retirado')`;
    if (!i) throw new ErrorMejora("Solo se puede enlazar un indicador activo o retirado");
  }
  if (v.medicionId !== null) {
    const [m] = await tx`SELECT indicador_id FROM mediciones WHERE id = ${v.medicionId} AND resultado IS NOT NULL`;
    if (!m) throw new ErrorMejora("Solo se puede enlazar una medición que ya tiene resultado");
    if (v.indicadorId !== null && Number(m.indicador_id) !== v.indicadorId) {
      throw new ErrorMejora("La medición elegida no es de ese indicador");
    }
  }
}

function filaDe(v: HallazgoValidado): Omit<FilaNueva, "codigo" | "anio" | "consecutivo"> {
  return {
    clase: v.clase,
    origen: v.origen,
    fuente: v.fuente,
    referenciaCaso: v.referenciaCaso,
    detectadoEn: v.detectadoEn,
    procesoId: v.procesoId,
    subprocesoId: v.subprocesoId,
    criticidad: v.criticidad,
    titulo: v.titulo,
    descripcion: v.descripcion,
    requisitoClausula: v.requisitoClausula,
    requisitoNormaId: v.requisitoNormaId,
    requisitoDocumentoId: v.requisitoDocumentoId,
    documentoId: v.documentoId,
    indicadorId: v.indicadorId,
    medicionId: v.medicionId,
    riesgo: v.riesgo,
    fechaLimiteEnte: v.fechaLimiteEnte,
    reincidenteDe: null,
  };
}

/**
 * Un hallazgo externo avisa también a cada usuario activo de Gerencia y a cada Admin SGC activo (spec §14.2), salvo a quien
 * lo registró. Es otro aviso que el del turno (en la Fase 16 sale además de inmediato por correo): quien tiene el turno
 * recibe los dos.
 */
async function avisarDelExterno(tx: TransactionSql, h: HallazgoBase, titulo: string, actorId: number): Promise<void> {
  const destinos = (await activosDeRol(tx, ["gerencia", "admin_sgc"])).filter((u) => u !== actorId);
  await avisarDeMejora(
    tx,
    { tipo: "mejora.externo", titulo: `Hallazgo externo ${h.codigo}: prioridad alta`, hallazgoId: h.id },
    destinos.map((usuarioId) => ({ usuarioId, cuerpo: titulo })),
  );
}

/**
 * Registra un hallazgo (spec §7.4). Nace aceptado si el origen es externo, si quien registra lidera ese proceso o si el
 * proceso no tiene ningún líder activo (F15-DC3: también cuando registra Control Interno); si no, «Por aceptar».
 */
export async function registrarHallazgo(
  sesion: SesionFlujo,
  d: DatosDeHallazgo,
  opciones?: OpcionesFlujo,
): Promise<{ id: number; codigo: string }> {
  requerirPermiso(sesion, "mejora.registrar");
  const leido = EsquemaHallazgo.safeParse(d);
  if (!leido.success) throw new ErrorMejora(leido.error.issues[0].message);
  const v = leido.data;
  const ahora = opciones?.ahora ?? new Date();
  return legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      if (sesion.rol === "lider_proceso" && !enAlcance(await alcanceProcesos(sesion, { sql: tx }), v.procesoId)) {
        throw new ErrorPermiso();
      }
      const c = await contextoDeMejora(tx, ahora);
      await revisarIdentificacion(tx, v, c);
      const lideres = await lideresDeProceso(v.procesoId, { sql: tx });
      const nacioAceptado = esExterno(v.origen) || lideres.length === 0 || lideres.includes(sesion.usuarioId);
      const anio = Number(fechaEnZona(c.ahora, c.zona).slice(0, 4));
      const { consecutivo, codigo } = await tomarCodigo(tx, anio);
      const h = await nacerHallazgo(tx, sesion, { ...filaDe(v), codigo, anio, consecutivo }, "registrar", { rumbo: { nacioAceptado } }, c);
      if (esExterno(v.origen)) await avisarDelExterno(tx, h, v.titulo, sesion.usuarioId);
      return { id: h.id, codigo: h.codigo };
    }),
  );
}
