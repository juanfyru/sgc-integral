/**
 * El plazo que se mueve cuando un indicador pasa a pedir datos que antes no pedía (anexo 14C). Réplica, para la fuente de
 * un dato, de `laFotoMueveElPlazo`. Sin Node ni BD.
 */
import { fechaLimite } from "@/lib/tramites/plazos";

/**
 * La fecha límite nueva (desde `ahora`, con el mismo plazo) si la medición no pedía y ahora pide, y su fecha ya venció o
 * el plazo es 0; si no, `null`.
 */
export function laFuenteMueveElPlazo(d: { pedia: boolean; pide: boolean; venceEn: Date; ahora: Date; plazoDias: number; zona: string }): Date | null {
  if (d.pedia || !d.pide) return null;
  if (d.venceEn.getTime() > d.ahora.getTime() && d.plazoDias !== 0) return null;
  return fechaLimite(d.ahora, d.plazoDias, d.zona);
}
