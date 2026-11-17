import { esExterno } from "./origenes";
import { accionObligada, aceptadoVaA } from "./reglas";
import type { Clase, Criticidad, EstadoHallazgo, Origen } from "./tipos";

/** Lo de la identificación que decide a dónde va un hallazgo al reclasificarlo. */
export type Perfil = { clase: Clase; criticidad: Criticidad | null; origen: Origen; reincidenteDe: number | null };

const DECISION = new Set<EstadoHallazgo>(["por_decidir", "por_validar"]);
const ACEPTACION = new Set<EstadoHallazgo>(["por_aceptar", "rechazo", "arbitraje"]);

function destinoPorClase(antes: Perfil, despues: Perfil, estado: EstadoHallazgo, correccionRegistrada: boolean): EstadoHallazgo {
  // De no conformidad a observación u oportunidad: la corrección registrada queda como historia.
  if (antes.clase === "no_conformidad" && despues.clase !== "no_conformidad") {
    return estado === "por_corregir" || DECISION.has(estado) ? "por_formular" : estado;
  }
  // De observación u oportunidad a no conformidad: solo desde «Por formular».
  if (antes.clase !== "no_conformidad" && despues.clase === "no_conformidad" && estado === "por_formular") {
    if (!correccionRegistrada) return "por_corregir";
    return accionObligada(despues) ? "por_formular" : "por_decidir";
  }
  return estado;
}

/**
 * En qué estado queda un hallazgo al reclasificarlo (spec 15 §7.6): la tabla de «Qué arrastra reclasificar». Lo que no
 * está en ella deja el estado como está; bajar la criticidad, quitar la reincidencia o dejar de ser externo nunca devuelve
 * el hallazgo a un paso anterior.
 */
export function destinoDeReclasificacion(
  antes: Perfil,
  despues: Perfil,
  estado: EstadoHallazgo,
  x: { correccionRegistrada: boolean },
): EstadoHallazgo {
  const porClase = destinoPorClase(antes, despues, estado, x.correccionRegistrada);
  if (porClase !== estado) return porClase;
  // El origen pasa a externo: se acepta si aún no se aceptó; si ya se decidía la acción, se formula el plan.
  if (!esExterno(antes.origen) && esExterno(despues.origen)) {
    if (ACEPTACION.has(estado)) return aceptadoVaA(despues.clase);
    if (DECISION.has(estado)) return "por_formular";
    return estado;
  }
  // La criticidad sube a alta o se marca reincidente: la acción correctiva pasa a ser obligada.
  if (!accionObligada(antes) && accionObligada(despues) && DECISION.has(estado)) return "por_formular";
  return estado;
}
