/** El filtro de la lista de hallazgos, leído de la URL: un valor que no se entiende se ignora. Sin Node ni BD. */
import type { FiltroDeLista } from "@/db/consultas/mejoramiento/lectura";
import { ORIGENES_HALLAZGO, CLASES, CRITICIDADES, ESTADOS_HALLAZGO } from "./tipos";

type Parametros = Record<string, string | string[] | undefined>;

const primero = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const dentro = <T extends string>(lista: readonly T[], v: string | undefined): T | undefined =>
  v !== undefined && (lista as readonly string[]).includes(v) ? (v as T) : undefined;

export const ESTADOS_ESPECIALES = ["abiertos", "reabiertos", "sin_accion", "por_evaluar"] as const;

export function filtroDeConsulta(p: Parametros): FiltroDeLista {
  const filtro: FiltroDeLista = {};
  const q = primero(p.q)?.trim().slice(0, 100);
  if (q) filtro.q = q;
  const proceso = primero(p.proceso);
  if (proceso !== undefined && /^\d{1,15}$/.test(proceso)) filtro.procesoId = Number(proceso);
  const origen = dentro(ORIGENES_HALLAZGO, primero(p.origen));
  if (origen) filtro.origen = origen;
  const clase = dentro(CLASES, primero(p.clase));
  if (clase) filtro.clase = clase;
  const criticidad = dentro(CRITICIDADES, primero(p.criticidad));
  if (criticidad) filtro.criticidad = criticidad;
  const estado = dentro([...ESTADOS_HALLAZGO, ...ESTADOS_ESPECIALES], primero(p.estado));
  if (estado) filtro.estado = estado;
  if (primero(p.vencidos) === "1") filtro.soloVencidos = true;
  if (primero(p.decision) === "1") filtro.esperanSuDecision = true;
  return filtro;
}

/** Los nombres de la URL de cada filtro: para armar los enlaces de las cifras. */
export function consultaDeFiltro(f: FiltroDeLista): string {
  const u = new URLSearchParams();
  if (f.q) u.set("q", f.q);
  if (f.procesoId !== undefined) u.set("proceso", String(f.procesoId));
  if (f.origen) u.set("origen", f.origen);
  if (f.clase) u.set("clase", f.clase);
  if (f.criticidad) u.set("criticidad", f.criticidad);
  if (f.estado) u.set("estado", f.estado);
  if (f.soloVencidos) u.set("vencidos", "1");
  if (f.esperanSuDecision) u.set("decision", "1");
  return u.toString();
}
