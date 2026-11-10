import type { FiltroSemaforo } from "@/db/consultas/vigencia/semaforo";
import { ESTADOS_VIGENCIA, ETIQUETA_VIGENCIA, type EstadoVigencia } from "./tipos";

export type FiltroLeido = Required<Pick<FiltroSemaforo, "estado" | "origen">> & Pick<FiltroSemaforo, "procesoId">;

type Valor = string | string[] | null | undefined;
const primero = (v: Valor): string | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** Los filtros de la pantalla y del Excel (`?estado=`, `?proceso=`, `?origen=`); lo que no se entiende es «todos». */
export function filtroDeConsulta(q: { estado?: Valor; proceso?: Valor; origen?: Valor }): FiltroLeido {
  const estado = primero(q.estado);
  const proceso = primero(q.proceso);
  const origen = primero(q.origen);
  return {
    estado: (ESTADOS_VIGENCIA as readonly string[]).includes(estado ?? "") ? (estado as EstadoVigencia) : "todos",
    procesoId: proceso && /^\d{1,15}$/.test(proceso) && Number(proceso) > 0 ? Number(proceso) : undefined,
    origen: origen === "interno" || origen === "externo" ? origen : "todos",
  };
}

/**
 * «Estado: Vencida · Proceso: Gestión del Talento Humano · Origen: internos», para el encabezado del Excel. Un
 * proceso que no está entre los de la persona no se nombra (ni se imprime su id).
 */
export function textoDelFiltro(f: FiltroLeido, nombreProceso?: string): string {
  const partes = [`Estado: ${f.estado === "todos" ? "todos" : ETIQUETA_VIGENCIA[f.estado]}`];
  if (f.procesoId !== undefined) partes.push(`Proceso: ${nombreProceso ?? "no disponible"}`);
  partes.push(`Origen: ${f.origen === "todos" ? "internos y externos" : f.origen === "interno" ? "internos" : "externos"}`);
  return partes.join(" · ");
}
