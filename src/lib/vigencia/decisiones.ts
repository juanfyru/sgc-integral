/**
 * Qué puede hacer cada persona sobre un documento de la revisión anual (spec 13C §9.3): una regla pura que usan la
 * página de la campaña (`_datos.ts`) y la tabla de decisiones.
 */
import type { ExternoVerificable } from "@/db/consultas/vigencia/externos";
import type { DocumentoDeRevision } from "@/db/consultas/vigencia/revision-anual";
import { accionesDeFila } from "@/db/consultas/vigencia/semaforo";
import { enAlcance, type Alcance, type SujetoVisibilidad } from "@/lib/alcance";

/** Lo que la persona puede hacer sobre un documento de la revisión; todo falso si no decide. */
export type AccionesDecision = {
  /** El proceso es suyo, la revisión está abierta y el documento está por decidir. */
  decidir: boolean;
  /** Interno: «Ratificar» abre el diálogo de la ratificación. */
  ratificar: boolean;
  /** Interno: «Actualizar» y «Eliminar» abren la solicitud prellenada. */
  solicitar: boolean;
  /** Interno con un trámite en curso que no es su decisión: se enlaza en vez de abrir otro. */
  enlazar: { id: number; numero: string } | null;
  /** Externo que la persona puede verificar: «Ratificar» es la verificación «sigue vigente». */
  verificar: ExternoVerificable | null;
  /** El número del trámite se enlaza a su página (Admin SGC y líder del proceso); a los demás se les dice. */
  verTramite: boolean;
};

export type FilaDecision = DocumentoDeRevision & { acciones: AccionesDecision };

const SIN_ACCIONES: AccionesDecision = { decidir: false, ratificar: false, solicitar: false, enlazar: null, verificar: null, verTramite: false };

/**
 * Las acciones de una fila (resoluciones 2, 5 y 6 de la Tarea 11): los botones salen con `puedeDecidir` del proceso y
 * `porDecidir` del documento. En un interno, si tiene un trámite en curso que no es su decisión, solo se ofrece
 * enlazarlo (ratificar o pedir otra solicitud no procederían); en un externo, solo a quien puede verificarlo.
 */
export function accionesDeDecision(
  sujeto: SujetoVisibilidad,
  fila: DocumentoDeRevision,
  d: { puedeDecidir: boolean; alcance: Alcance; verificable: ExternoVerificable | null },
): AccionesDecision {
  const semaforo = accionesDeFila(sujeto, fila, d.alcance);
  const verTramite = sujeto.rol === "admin_sgc" || (sujeto.rol === "lider_proceso" && enAlcance(d.alcance, fila.proceso.id));
  if (!d.puedeDecidir || !fila.porDecidir) return { ...SIN_ACCIONES, verTramite };
  if (fila.origen === "externo") return { ...SIN_ACCIONES, decidir: true, verificar: d.verificable, verTramite };
  const enCurso = fila.tramite && fila.tramite.id !== fila.decision?.tramite?.id ? { id: fila.tramite.id, numero: fila.tramite.numero } : null;
  return {
    decidir: true,
    ratificar: enCurso === null && semaforo.ratificar,
    solicitar: enCurso === null && semaforo.solicitar,
    enlazar: enCurso,
    verificar: null,
    verTramite,
  };
}
