import type { FiltroNormas } from "@/db/consultas/normograma/lectura";
import { ESTADOS_A_MANO, ETIQUETA_ESTADO_NORMA, type EstadoNorma } from "./tipos";

/**
 * Los filtros de `/normograma` y de su Excel (spec 13C §10.6): tipo, año, emisor, estado, proceso (por su slug, el
 * normograma del proceso), texto e «incluir retiradas». Las retiradas salen de las listas (§10.7): solo quien administra
 * el normograma puede pedirlas, con la casilla o con el estado «Retirada».
 */
export type FiltroNormasLeido = {
  tipoNormaId?: number;
  anio?: number;
  emisor?: string;
  estado: EstadoNorma | "todas";
  /** El slug del proceso: la página y el Excel lo traducen a su id. */
  proceso?: string;
  q?: string;
  incluirRetiradas: boolean;
};

type Valor = string | string[] | null | undefined;
const primero = (v: Valor): string | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const id = (v: Valor): number | undefined => {
  const texto = primero(v);
  return texto && /^\d{1,15}$/.test(texto) && Number(texto) > 0 ? Number(texto) : undefined;
};
const texto = (v: Valor, maximo: number): string | undefined => primero(v)?.trim().slice(0, maximo) || undefined;

/** Los estados que ofrece el filtro: «Retirada» solo a quien administra. */
export function estadosDelFiltro(administra: boolean): readonly EstadoNorma[] {
  return administra ? [...ESTADOS_A_MANO, "retirada"] : ESTADOS_A_MANO;
}

/** Lee la consulta; lo que no se entiende se ignora. `administra`: quien tiene `normograma.administrar`. */
export function filtroDeNormas(
  q: { tipo?: Valor; anio?: Valor; emisor?: Valor; estado?: Valor; proceso?: Valor; q?: Valor; retiradas?: Valor },
  administra: boolean,
): FiltroNormasLeido {
  const anio = id(q.anio);
  const estado = primero(q.estado);
  const proceso = primero(q.proceso)?.trim();
  return {
    tipoNormaId: id(q.tipo),
    anio: anio !== undefined && anio >= 1800 && anio <= 2100 ? anio : undefined,
    emisor: texto(q.emisor, 200),
    estado: (estadosDelFiltro(administra) as readonly string[]).includes(estado ?? "") ? (estado as EstadoNorma) : "todas",
    proceso: proceso && /^[a-z0-9-]{1,120}$/.test(proceso) ? proceso : undefined,
    q: texto(q.q, 100),
    incluirRetiradas: administra && primero(q.retiradas) === "1",
  };
}

/** El filtro de la consulta de datos, con el proceso ya traducido a su id. */
export function filtroDeConsulta(f: FiltroNormasLeido, procesoId: number | undefined): FiltroNormas {
  return {
    tipoNormaId: f.tipoNormaId,
    anio: f.anio,
    emisor: f.emisor,
    estado: f.estado,
    procesoId,
    q: f.q,
    incluirRetiradas: f.incluirRetiradas,
  };
}

/** La consulta de la lista con `cambio` aplicado: «?proceso=consulta-externa&estado=derogada», o vacía. */
export function consultaDeNormas(f: FiltroNormasLeido, cambio: Partial<FiltroNormasLeido> = {}): string {
  const final = { ...f, ...cambio };
  const q = new URLSearchParams();
  if (final.tipoNormaId !== undefined) q.set("tipo", String(final.tipoNormaId));
  if (final.anio !== undefined) q.set("anio", String(final.anio));
  if (final.emisor) q.set("emisor", final.emisor);
  if (final.estado !== "todas") q.set("estado", final.estado);
  if (final.proceso) q.set("proceso", final.proceso);
  if (final.q) q.set("q", final.q);
  if (final.incluirRetiradas) q.set("retiradas", "1");
  const consulta = q.toString();
  return consulta ? `?${consulta}` : "";
}

/** Hay algún filtro además del proceso (que no es un filtro: es el normograma de ese proceso). */
export function hayFiltros(f: FiltroNormasLeido): boolean {
  return f.tipoNormaId !== undefined || f.anio !== undefined || Boolean(f.emisor) || f.estado !== "todas" || Boolean(f.q) || f.incluirRetiradas;
}

/**
 * «Institucional · Estado: Derogada · Texto: «3100»» o «Proceso: Consulta Externa · …», para el encabezado del Excel y
 * la bitácora. Un tipo que no existe no se nombra.
 */
export function textoDelAlcance(f: FiltroNormasLeido, nombres: { proceso?: string; tipo?: string }): string {
  const partes = [nombres.proceso ? `Proceso: ${nombres.proceso}` : "Institucional"];
  if (f.tipoNormaId !== undefined) partes.push(`Tipo: ${nombres.tipo ?? "no disponible"}`);
  if (f.anio !== undefined) partes.push(`Año: ${f.anio}`);
  if (f.emisor) partes.push(`Emisor: ${f.emisor}`);
  if (f.estado !== "todas") partes.push(`Estado: ${ETIQUETA_ESTADO_NORMA[f.estado]}`);
  if (f.q) partes.push(`Texto: «${f.q}»`);
  if (f.incluirRetiradas) partes.push("Incluye retiradas");
  return partes.join(" · ");
}
