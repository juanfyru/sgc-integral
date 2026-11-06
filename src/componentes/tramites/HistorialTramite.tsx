import type { EventoTramite } from "@/db/consultas/tramites";
import type { TipoSolicitud } from "@/lib/tramites/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";

const QUE_PIDE: Record<TipoSolicitud, string> = {
  crear: "pidió la creación",
  modificar: "pidió la modificación",
  eliminar: "pidió la eliminación",
};

const FRASES: Record<string, string> = {
  visto_bueno_automatico: "dio el visto bueno al pedir, como líder del proceso",
  visto_bueno_omitido: "visto bueno omitido: el proceso no tiene líder",
  dar_visto_bueno: "dio el visto bueno",
  negar_visto_bueno: "negó el visto bueno",
  retirar: "retiró la solicitud",
  aceptar: "aceptó y designó responsables",
  rechazar: "rechazó la solicitud",
  enviar_a_revision: "envió a revisión, con clave",
  devolver_revision: "devolvió a elaboración",
  concepto_favorable: "dio concepto favorable, con clave",
  aprobar: "aprobó, con clave",
  devolver_aprobacion: "devolvió a elaboración",
  negar_eliminacion: "negó la eliminación",
  publicar: "publicó, con clave",
  aprobar_y_publicar: "aprobó y publicó, con clave",
  cancelar: "canceló el trámite",
  reasignar: "reasignó un responsable",
};

function frase(e: EventoTramite, tipo: TipoSolicitud): string {
  const hecho = e.tipo === "solicitar" ? QUE_PIDE[tipo] : (FRASES[e.tipo] ?? e.tipo.replaceAll("_", " "));
  return e.persona ? `${e.persona} ${hecho}` : hecho.charAt(0).toUpperCase() + hecho.slice(1);
}

export function HistorialTramite({ tipo, eventos }: { tipo: TipoSolicitud; eventos: EventoTramite[] }) {
  const cuando = new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zonaHoraria(),
  });
  return (
    <section aria-labelledby="titulo-historial" className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <h2 id="titulo-historial" className="mb-3 text-sm font-semibold">
        Historial
      </h2>
      <ol className="flex list-none flex-col gap-2.5">
        {eventos.map((e, i) => (
          <li key={i} className="text-sm">
            <span className="block text-xs text-muted-foreground">{cuando.format(e.creadoEn)}</span>
            {frase(e, tipo)}
            {typeof e.detalle.motivo === "string" ? (
              <span className="block whitespace-pre-wrap break-words text-xs text-muted-foreground">
                {`Motivo: ${e.detalle.motivo}`}
              </span>
            ) : null}
            {typeof e.detalle.concepto === "string" ? (
              <span className="block whitespace-pre-wrap break-words text-xs text-muted-foreground">
                {`Concepto: ${e.detalle.concepto}`}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
