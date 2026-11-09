import { estadoPlazo } from "@/lib/tramites/plazos";
import { ETIQUETA_VIGENCIA, type EstadoVigencia } from "./tipos";

/** `dias` es negativo si ya venció (días desde el vencimiento) y positivo si faltan. */
export function estadoVigencia(
  d: { proxima: Date | null; enTramite: boolean; impactoPendiente: boolean },
  ahora: Date,
  atencionDias: number,
  zona: string,
): { estado: EstadoVigencia; dias: number | null } {
  if (d.enTramite) return { estado: "en_tramite", dias: null };
  if (!d.proxima) return { estado: "al_dia", dias: null };
  const plazo = estadoPlazo(d.proxima, ahora, zona);
  if (plazo.estado === "vencido") return { estado: "vencida", dias: -plazo.dias };
  const estado = d.impactoPendiente || plazo.dias <= atencionDias ? "atencion" : "al_dia";
  return { estado, dias: plazo.dias };
}

const dias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;

export function textoVigencia(
  r: { estado: EstadoVigencia; dias: number | null },
  extra?: { etapa?: string; dia?: number; cambioNormativo?: string },
): string {
  if (r.estado === "en_tramite") {
    if (!extra?.etapa) return ETIQUETA_VIGENCIA.en_tramite;
    return `${ETIQUETA_VIGENCIA.en_tramite} · ${extra.etapa}${extra.dia !== undefined ? `, día ${extra.dia}` : ""}`;
  }
  if (r.estado === "atencion" && extra?.cambioNormativo) return `${ETIQUETA_VIGENCIA.atencion} · revisión por cambio normativo`;
  if (r.dias === null) return ETIQUETA_VIGENCIA.al_dia;
  if (r.estado === "vencida") return `Vencida hace ${dias(-r.dias)}`;
  return r.dias === 0 ? "Vence hoy" : `Vence en ${dias(r.dias)}`;
}
