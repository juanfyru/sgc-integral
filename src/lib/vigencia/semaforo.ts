import { estadoPlazo } from "@/lib/tramites/plazos";
import { ETIQUETA_ETAPA, type Etapa } from "@/lib/tramites/tipos";
import { ETIQUETA_VIGENCIA, type EstadoVigencia } from "./tipos";

/**
 * `dias` es negativo si ya venció (días desde el vencimiento) y positivo si faltan. Un vigente sin próxima
 * revisión es una anomalía: sale en atención para que se vea, nunca como al día. Un impacto normativo pendiente y,
 * en un externo, una edición nueva pendiente de adoptar (spec 13C §8.4) dan al menos atención.
 */
export function estadoVigencia(
  d: { proxima: Date | null; enTramite: boolean; impactoPendiente: boolean; edicionPendiente?: boolean },
  ahora: Date,
  atencionDias: number,
  zona: string,
): { estado: EstadoVigencia; dias: number | null } {
  if (d.enTramite) return { estado: "en_tramite", dias: null };
  if (!d.proxima) return { estado: "atencion", dias: null };
  const plazo = estadoPlazo(d.proxima, ahora, zona);
  if (plazo.estado === "vencido") return { estado: "vencida", dias: -plazo.dias };
  const estado = d.impactoPendiente || d.edicionPendiente || plazo.dias <= atencionDias ? "atencion" : "al_dia";
  return { estado, dias: plazo.dias };
}

const dias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;

export function textoVigencia(
  r: { estado: EstadoVigencia; dias: number | null },
  extra?: { etapa?: string; dia?: number; cambioNormativo?: string; edicionPendiente?: boolean },
): string {
  if (r.estado === "en_tramite") {
    if (!extra?.etapa) return ETIQUETA_VIGENCIA.en_tramite;
    return `${ETIQUETA_VIGENCIA.en_tramite} · ${extra.etapa}${extra.dia !== undefined ? `, día ${extra.dia}` : ""}`;
  }
  if (r.estado === "atencion") {
    // Las marcas dicen por qué está en atención; la del cambio normativo va primero.
    const marcas = [
      extra?.cambioNormativo ? "revisión por cambio normativo" : null,
      extra?.edicionPendiente ? "edición nueva pendiente de adoptar" : null,
    ].filter((m) => m !== null);
    if (marcas.length > 0) return `${ETIQUETA_VIGENCIA.atencion} · ${marcas.join(" · ")}`;
  }
  if (r.estado === "atencion" && r.dias === null) return `${ETIQUETA_VIGENCIA.atencion} · sin fecha de revisión`;
  // Al día no lleva los días (spec 13C §7.2): «Vence en N días» es la atención, y el texto dice el estado.
  if (r.estado === "al_dia" || r.dias === null) return ETIQUETA_VIGENCIA.al_dia;
  if (r.estado === "vencida") return `Vencida hace ${dias(-r.dias)}`;
  return r.dias === 0 ? "Vence hoy" : `Vence en ${dias(r.dias)}`;
}

export type ClaseRevision = "publicacion" | "aprobacion" | "ratificacion" | "verificacion" | "adopcion";

/** Qué fue la última revisión, en palabras: «Ratificado por …», «Aprobación fuera de la plataforma». */
export function textoUltimaRevision(u: { clase: ClaseRevision; quien: string | null }): string {
  switch (u.clase) {
    case "publicacion":
      return "Publicada en la plataforma";
    case "aprobacion":
      return "Aprobación fuera de la plataforma";
    case "ratificacion":
      return u.quien ? `Ratificado por ${u.quien}` : "Ratificado";
    case "verificacion":
      return u.quien ? `Verificado por ${u.quien}` : "Verificado";
    case "adopcion":
      return u.quien ? `Adoptado por ${u.quien}` : "Edición adoptada";
  }
}

/**
 * El texto del chip de una fila: con la etapa y el día si está en trámite (sin día si la etapa no tiene fecha
 * límite), o las marcas del cambio normativo y de la edición nueva pendiente de un externo.
 */
export function textoVigenciaDeFila(f: {
  vigencia: { estado: EstadoVigencia; dias: number | null };
  tramite: { etapa: Etapa; dia: number | null } | null;
  impacto: { norma: string } | null;
  edicionPendiente?: { desde: Date } | null;
}): string {
  return textoVigencia(f.vigencia, {
    etapa: f.tramite ? ETIQUETA_ETAPA[f.tramite.etapa].toLowerCase() : undefined,
    dia: f.tramite?.dia ?? undefined,
    cambioNormativo: f.impacto?.norma,
    edicionPendiente: f.edicionPendiente != null,
  });
}

/** El chip de un externo que aún no tiene una edición adoptada: no hay desde cuándo contar su verificación. */
export const SIN_EDICION_ADOPTADA = `${ETIQUETA_VIGENCIA.atencion} · sin edición adoptada`;

/** El texto del chip de un externo en la matriz y en su página: el del semáforo, o «sin edición adoptada». */
export function textoVigenciaDeExterno(f: {
  adoptado: boolean;
  vigencia: { estado: EstadoVigencia; dias: number | null };
  impacto: { norma: string } | null;
  edicionPendiente: { desde: Date } | null;
}): string {
  if (!f.adoptado) return SIN_EDICION_ADOPTADA;
  return textoVigenciaDeFila({ vigencia: f.vigencia, tramite: null, impacto: f.impacto, edicionPendiente: f.edicionPendiente });
}
