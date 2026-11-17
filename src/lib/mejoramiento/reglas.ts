import { esExterno } from "./origenes";
import type { Clase, HallazgoBase, TipoAccion } from "./tipos";

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

export function tipoPropuesto(clase: Clase): TipoAccion {
  return clase === "no_conformidad" ? "correctiva" : clase === "observacion" ? "preventiva" : "mejora";
}
