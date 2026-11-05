import type { DetalleTramite } from "@/db/consultas/tramites";
import { ETIQUETA_MOTIVO, ETIQUETA_TIPO_SOLICITUD } from "@/lib/tramites/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";

function textoVistoBueno(t: DetalleTramite): string {
  for (const e of t.eventos) {
    if (e.tipo === "visto_bueno_automatico") return "Dado: quien pide es el líder del proceso";
    if (e.tipo === "visto_bueno_omitido") return "Omitido: el proceso no tiene líder";
    if (e.tipo === "dar_visto_bueno") return `Dado por ${e.persona ?? "el líder del proceso"}`;
    if (e.tipo === "negar_visto_bueno") return `Negado por ${e.persona ?? "el líder del proceso"}`;
  }
  return t.etapa === "visto_bueno" ? "Pendiente" : "No se dio";
}

function Fila({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="whitespace-pre-wrap break-words text-sm">{children}</dd>
    </div>
  );
}

export function BloqueSolicitud({ tramite: t }: { tramite: DetalleTramite }) {
  const fecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: zonaHoraria() });
  return (
    <section aria-labelledby="titulo-solicitud" className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <h2 id="titulo-solicitud" className="mb-3 text-sm font-semibold">
        La solicitud
      </h2>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Fila etiqueta="Pide">{t.solicitante}</Fila>
        <Fila etiqueta="Pedida el">{fecha.format(t.creadoEn)}</Fila>
        <Fila etiqueta="Qué pide">{ETIQUETA_TIPO_SOLICITUD[t.tipo]}</Fila>
        <Fila etiqueta="Proceso">{t.procesoNombre}</Fila>
        <Fila etiqueta="Motivo">{ETIQUETA_MOTIVO[t.motivo]}</Fila>
        <Fila etiqueta="Visto bueno">{textoVistoBueno(t)}</Fila>
        {t.tituloPropuesto ? <Fila etiqueta="Título propuesto">{t.tituloPropuesto}</Fila> : null}
        <div className="sm:col-span-2">
          <Fila etiqueta="Justificación">{t.justificacion}</Fila>
        </div>
        {t.motivoCierre ? (
          <div className="sm:col-span-2">
            <Fila etiqueta="Motivo de cierre">{t.motivoCierre}</Fila>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
