import type { CambioDeAjuste } from "@/lib/esquemas/mejoramiento";
import { esExterno } from "./origenes";
import type { Clase, HallazgoBase, TipoAccion } from "./tipos";

/** Al aprobar un ajuste cuya fecha quedó atrás (spec §10.6): no se aprueba; se niega y se pide otro. */
export const FECHA_DEL_AJUSTE_PASADA = "La fecha nueva ya pasó: niegue el ajuste para que se pida otro";

/** La fecha de fin que da un ajuste al aprobarse: la nueva de una reprogramación o el fin de la actividad que se añade. */
export function finQueDaElAjuste(c: CambioDeAjuste | null): string | null {
  if (c?.tipo === "reprogramar") return c.finNuevo;
  if (c?.tipo === "agregar") return c.fin;
  return null;
}

/**
 * Si esa fecha ya pasó el día `hoy` (el de la zona de la instalación): el ajuste ya no se aprueba. Una sola regla para el acto
 * y para el aviso de «Lo que sigue».
 */
export function fechaDelAjustePasada(c: CambioDeAjuste | null, hoy: string): boolean {
  const fin = finQueDaElAjuste(c);
  return fin !== null && fin < hoy;
}

/** Acción correctiva obligada (spec §8.5): no conformidad reincidente, de criticidad alta o de origen externo. */
export function accionObligada(h: Pick<HallazgoBase, "clase" | "criticidad" | "origen" | "reincidenteDe">): boolean {
  return h.clase === "no_conformidad" && (h.reincidenteDe !== null || h.criticidad === "alta" || esExterno(h.origen));
}

/** Lleva plan de acción sin decisión previa: externo, observación u oportunidad (spec §7.2, F15-DC7). */
export function llevaPlanSiempre(h: Pick<HallazgoBase, "clase" | "origen">): boolean {
  return esExterno(h.origen) || h.clase === "observacion" || h.clase === "oportunidad";
}

export function aceptadoVaA(clase: Clase): "por_corregir" | "por_formular" {
  return clase === "no_conformidad" ? "por_corregir" : "por_formular";
}

/** Las cuatro condiciones del spec §8.6: criticidad alta, origen externo, recursos adicionales, elaboró un Admin SGC. */
export function apruebaGerencia(
  h: Pick<HallazgoBase, "clase" | "criticidad" | "origen">,
  x: { requiereRecursos: boolean; elaboroAdmin: boolean },
): boolean {
  return (
    (h.clase === "no_conformidad" && h.criticidad === "alta") || esExterno(h.origen) || x.requiereRecursos || x.elaboroAdmin
  );
}

/**
 * El rol que aprobó el plan de un hallazgo ya en curso (spec §15): el que se declaró, salvo en una no conformidad de criticidad
 * alta o en un hallazgo de origen externo, que aprueba Gerencia en todo caso. Es el que decide sus ajustes (`quienDecideAjustes`).
 */
export function rolQueAproboEnPapel(
  h: Pick<HallazgoBase, "clase" | "criticidad" | "origen">,
  declarado: "admin_sgc" | "gerencia",
): "admin_sgc" | "gerencia" {
  return (h.clase === "no_conformidad" && h.criticidad === "alta") || esExterno(h.origen) ? "gerencia" : declarado;
}

/**
 * Por qué aprueba Gerencia, en palabras: la primera que se cumple de las cuatro condiciones de `apruebaGerencia`, en el orden
 * del spec §8.6 (criticidad alta, origen externo, recursos adicionales o impacto institucional, elaboró un Admin SGC), o
 * `null` si no se cumple ninguna (la revisión vale como aprobación). Cada una es una oración que se lee tras «porque» («Le toca
 * a Gerencia porque la criticidad es alta»), tras «aplica:» y entre paréntesis. La usan las pantallas de las firmas.
 */
export function razonDeGerencia(
  h: Pick<HallazgoBase, "clase" | "criticidad" | "origen">,
  x: { requiereRecursos: boolean; elaboroAdmin: boolean },
): string | null {
  if (h.clase === "no_conformidad" && h.criticidad === "alta") return "la criticidad es alta";
  if (esExterno(h.origen)) return "el origen es externo";
  if (x.requiereRecursos) return "requiere recursos adicionales o tiene impacto institucional";
  if (x.elaboroAdmin) return "lo elaboró el Administrador del SGC";
  return null;
}

export function tipoPropuesto(clase: Clase): TipoAccion {
  return clase === "no_conformidad" ? "correctiva" : clase === "observacion" ? "preventiva" : "mejora";
}
