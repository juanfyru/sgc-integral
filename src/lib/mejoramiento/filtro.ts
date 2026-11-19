/** El filtro de la lista de hallazgos, leído de la URL: un valor que no se entiende se ignora. Sin Node ni BD. */
import type { FiltroDeLista } from "@/db/consultas/mejoramiento/lectura";
import { etiquetaDeEstado } from "./estados";
import { ETIQUETA_ORIGEN } from "./origenes";
import { ETIQUETA_CLASE, ETIQUETA_CRITICIDAD } from "./textos";
import { ORIGENES_HALLAZGO, CLASES, CRITICIDADES, ESTADOS_HALLAZGO, type EstadoHallazgo } from "./tipos";

type Parametros = Record<string, string | string[] | undefined>;

const primero = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const dentro = <T extends string>(lista: readonly T[], v: string | undefined): T | undefined =>
  v !== undefined && (lista as readonly string[]).includes(v) ? (v as T) : undefined;

export const ESTADOS_ESPECIALES = ["abiertos", "reabiertos", "sin_accion", "por_evaluar"] as const;

/** Cuántos hallazgos trae cada página de la lista (Fase 15B, anexo §11.1). El Excel no pagina. */
export const TAMANO_DE_PAGINA = 50;

/** El filtro de estado que quita todos los demás: los terminados también (anexo §11.1: sin estado, la lista muestra los abiertos). */
export const TODOS_LOS_ESTADOS = "todos";

/** El estado que vale cuando la dirección no trae ninguno (anexo §11.1). */
export const ESTADO_POR_OMISION = "abiertos";

/** Los estados del filtro que no son un estado guardado, con su nombre en el selector (y en el Excel y la bitácora). */
export const ETIQUETA_ESTADO_ESPECIAL: Record<(typeof ESTADOS_ESPECIALES)[number], string> = {
  abiertos: "Abiertos",
  reabiertos: "Reabiertos",
  sin_accion: "Cerrados sin acción",
  por_evaluar: "Por evaluar la eficacia",
};

/** El nombre del filtro de estado, como lo dice el selector de la lista. */
export function etiquetaDelFiltroDeEstado(estado: NonNullable<FiltroDeLista["estado"]>): string {
  if (estado === TODOS_LOS_ESTADOS) return "Todos";
  return Object.hasOwn(ETIQUETA_ESTADO_ESPECIAL, estado)
    ? ETIQUETA_ESTADO_ESPECIAL[estado as keyof typeof ETIQUETA_ESTADO_ESPECIAL]
    : etiquetaDeEstado({ estado: estado as EstadoHallazgo, resultadoCierre: null, correccionRequerida: null });
}

/** Los filtros de la Fase 15B que se nombran (anexo §10.6): el plan y el objetivo, a la vista, y los que llegan por «Ver todos». */
export const FILTROS_CON_NOMBRE = ["plan", "objetivo", "documento", "indicador", "norma", "subproceso"] as const;
export type FiltroConNombre = (typeof FILTROS_CON_NOMBRE)[number];

/** Los que solo llegan por el enlace «Ver todos» de otra página (anexo §10.1): el formulario los conserva ocultos. */
export const FILTROS_POR_ENLACE = ["documento", "indicador", "norma", "subproceso"] as const satisfies ReadonlyArray<FiltroConNombre>;

/**
 * El nombre de lo filtrado, ya resuelto con la regla de visibilidad de cada cosa (`nombresDelFiltro`): lo que la persona no ve no
 * llega y se dice «no disponible».
 */
export type NombresDelFiltro = Partial<Record<FiltroConNombre, string>>;

const ROTULO_DEL_FILTRO: Record<FiltroConNombre, string> = {
  plan: "Plan",
  objetivo: "Objetivo",
  documento: "Documento",
  indicador: "Indicador",
  norma: "Norma",
  subproceso: "Subproceso",
};

/** «Plan: PM-2026-01 Auditoría…», en el orden de `claves`, para los que el filtro trae. */
export function filtrosConNombreEnPalabras(
  f: FiltroDeLista,
  nombres: NombresDelFiltro,
  claves: ReadonlyArray<FiltroConNombre> = FILTROS_CON_NOMBRE,
): string[] {
  return claves.flatMap((k) => (f[k] === undefined ? [] : [`${ROTULO_DEL_FILTRO[k]}: ${nombres[k] ?? "no disponible"}`]));
}

/**
 * Los filtros de la lista en palabras, uno por parte («Proceso: Urgencias», «Estado: Por aceptar», «Solo vencidos»), en el orden
 * del formulario: la línea de filtros del Excel. El estado va siempre: sin él, «Abiertos» (anexo §11.1). El proceso por su nombre en `procesos` (los del alcance de quien exporta); uno que
 * ya no está, «no disponible». El plan, el objetivo y lo que llega por «Ver todos», por su nombre en `nombres`.
 */
export function filtrosEnPalabras(
  f: FiltroDeLista,
  procesos: ReadonlyArray<{ id: number; nombre: string }>,
  nombres: NombresDelFiltro = {},
): string[] {
  return [
    f.q ? `Texto: «${f.q}»` : null,
    f.procesoId !== undefined ? `Proceso: ${procesos.find((p) => p.id === f.procesoId)?.nombre ?? "no disponible"}` : null,
    f.origen ? `Origen: ${ETIQUETA_ORIGEN[f.origen] ?? f.origen}` : null,
    f.clase ? `Clase: ${ETIQUETA_CLASE[f.clase]}` : null,
    f.criticidad ? `Criticidad: ${ETIQUETA_CRITICIDAD[f.criticidad]}` : null,
    // Sin estado, los abiertos (anexo §11.1): la línea lo dice, para que el libro no parezca traerlo todo.
    `Estado: ${etiquetaDelFiltroDeEstado(f.estado ?? ESTADO_POR_OMISION)}`,
    f.soloVencidos ? "Solo vencidos" : null,
    f.esperanSuDecision ? "Esperan su decisión" : null,
    ...filtrosConNombreEnPalabras(f, nombres),
  ].filter((x): x is string => x !== null);
}

const ID_DE_LA_URL = /^\d{1,15}$/;

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
  const estado = dentro([...ESTADOS_HALLAZGO, ...ESTADOS_ESPECIALES, TODOS_LOS_ESTADOS], primero(p.estado));
  if (estado) filtro.estado = estado;
  if (primero(p.vencidos) === "1") filtro.soloVencidos = true;
  if (primero(p.decision) === "1") filtro.esperanSuDecision = true;
  for (const k of FILTROS_CON_NOMBRE) {
    const v = primero(p[k]);
    if (v !== undefined && ID_DE_LA_URL.test(v)) filtro[k] = Number(v);
  }
  const pagina = primero(p.pagina);
  if (pagina !== undefined && /^\d{1,6}$/.test(pagina) && Number(pagina) > 1) filtro.pagina = Number(pagina);
  return filtro;
}

/**
 * Los nombres de la URL de cada filtro: para armar los enlaces de las cifras, el del Excel y el de otra página. Sin la página: el
 * Excel no pagina, y un filtro nuevo empieza en la primera (`rutaDePagina`).
 */
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
  for (const k of FILTROS_CON_NOMBRE) if (f[k] !== undefined) u.set(k, String(f[k]));
  return u.toString();
}

/** La lista de Mejoramiento con ese filtro puesto: adonde lleva «Ver todos» de la sección de otra página (anexo §10.1). */
export function rutaDeListaFiltrada(f: FiltroDeLista): string {
  const q = consultaDeFiltro(f);
  return q ? `/mejoramiento?${q}` : "/mejoramiento";
}

/** La página `pagina` de la lista con el mismo filtro: los enlaces «Anterior» y «Siguiente» (la primera, sin `pagina`). */
export function rutaDePagina(f: FiltroDeLista, pagina: number): string {
  const q = consultaDeFiltro(f);
  const p = pagina > 1 ? `pagina=${pagina}` : "";
  const todo = [q, p].filter(Boolean).join("&");
  return todo ? `/mejoramiento?${todo}` : "/mejoramiento";
}
