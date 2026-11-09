import type { FiltroExternos } from "@/db/consultas/vigencia/externos";
import { ETIQUETA_VIGENCIA, type EstadoVigencia } from "./tipos";

/** Un externo no tiene trámite: su matriz se filtra por estos tres estados (spec 13C §8.6). */
export const ESTADOS_DE_EXTERNO = ["vencida", "atencion", "al_dia"] as const satisfies readonly EstadoVigencia[];

export type FiltroExternosLeido = Required<Pick<FiltroExternos, "estado">> & Omit<FiltroExternos, "estado">;

type Valor = string | string[] | null | undefined;
const primero = (v: Valor): string | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const id = (v: Valor): number | undefined => {
  const texto = primero(v);
  return texto && /^\d{1,15}$/.test(texto) && Number(texto) > 0 ? Number(texto) : undefined;
};

/**
 * Los filtros de la matriz y de su Excel (`?estado=`, `?proceso=`, `?responsable=`, `?q=`); lo que no se entiende
 * es «todos», y el texto se recorta a 100 caracteres.
 */
export function filtroDeExternos(q: { estado?: Valor; proceso?: Valor; responsable?: Valor; q?: Valor }): FiltroExternosLeido {
  const estado = primero(q.estado);
  const texto = primero(q.q)?.trim().slice(0, 100);
  return {
    estado: (ESTADOS_DE_EXTERNO as readonly string[]).includes(estado ?? "") ? (estado as EstadoVigencia) : "todos",
    procesoId: id(q.proceso),
    responsableId: id(q.responsable),
    q: texto || undefined,
  };
}

/** La consulta de la matriz con `cambio` aplicado: «?estado=vencida&proceso=4», o vacía. */
export function consultaDeExternos(f: FiltroExternosLeido, cambio: Partial<FiltroExternosLeido> = {}): string {
  const final = { ...f, ...cambio };
  const q = new URLSearchParams();
  if (final.estado !== "todos") q.set("estado", final.estado);
  if (final.procesoId !== undefined) q.set("proceso", String(final.procesoId));
  if (final.responsableId !== undefined) q.set("responsable", String(final.responsableId));
  if (final.q) q.set("q", final.q);
  const texto = q.toString();
  return texto ? `?${texto}` : "";
}

/**
 * «Estado: Vencida · Proceso: Apoyo Terapéutico · Responsable: Carlos A. Rojas · Texto: «bomba»», para el encabezado
 * del Excel. Un proceso o un responsable que no está entre las filas de la persona no se nombra (ni su id).
 */
export function textoDelFiltroExternos(f: FiltroExternosLeido, nombres: { proceso?: string; responsable?: string }): string {
  const partes = [`Estado: ${f.estado === "todos" ? "todos" : ETIQUETA_VIGENCIA[f.estado]}`];
  if (f.procesoId !== undefined) partes.push(`Proceso: ${nombres.proceso ?? "no disponible"}`);
  if (f.responsableId !== undefined) partes.push(`Responsable: ${nombres.responsable ?? "no disponible"}`);
  if (f.q) partes.push(`Texto: «${f.q}»`);
  return partes.join(" · ");
}
