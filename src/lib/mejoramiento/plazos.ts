/** Plazos del módulo de mejoramiento, en días hábiles (spec 15 §13.1). Puro: el contexto lo arma `contextoDeMejora`. */
import type { ConfigMejora, ContextoMejora } from "@/db/consultas/mejoramiento/config";
import { diasHabilesEntre, restarDiasHabiles, sumarDiasHabiles } from "@/lib/dias-habiles";
import { fechaEnZona, finDeFecha } from "@/lib/tramites/plazos";

export type Paso = keyof ConfigMejora["plazos"];

/** Fin del día del plazo del paso, contado desde `desde` con el calendario de la entidad. */
export function venceEn(paso: Paso, desde: Date, c: Pick<ContextoMejora, "config" | "calendario" | "zona">): Date {
  return sumarDiasHabiles(desde, c.config.plazos[paso], c.calendario, c.zona);
}

/**
 * Hasta cuándo formular el plan: sin fecha del ente, el plazo de formular; con ella, el fin del día que
 * deja `revisar + aprobar` días hábiles antes de esa fecha, y nunca antes del día del registro.
 */
export function formularAntesDe(
  x: { registradoEn: Date; fechaLimiteEnte: string | null },
  c: Pick<ContextoMejora, "config" | "calendario" | "zona">,
): Date {
  if (!x.fechaLimiteEnte) return venceEn("formular", x.registradoEn, c);
  const atras = restarDiasHabiles(x.fechaLimiteEnte, c.config.plazos.revisar + c.config.plazos.aprobar, c.calendario);
  const delRegistro = fechaEnZona(x.registradoEn, c.zona);
  return finDeFecha(atras < delRegistro ? delRegistro : atras, c.zona);
}

/** Días hábiles que faltan hasta `vence`; negativo si ya pasó. */
export function quedanDiasHabiles(vence: Date, c: Pick<ContextoMejora, "ahora" | "calendario" | "zona">): number {
  return diasHabilesEntre(c.ahora, vence, c.calendario, c.zona);
}
