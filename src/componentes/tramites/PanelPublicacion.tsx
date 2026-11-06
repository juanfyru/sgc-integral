import { publicarTramiteAccion } from "@/app/acciones-tramites";
import { DialogoFirma } from "@/componentes/tramites/DialogoFirma";
import type { Etapa, TipoSolicitud } from "@/lib/tramites/tipos";

export type TramiteParaPublicar = {
  id: number;
  etapa: Etapa;
  ronda: number;
  tipo: TipoSolicitud;
  codigo: string | null;
  titulo: string;
  versionNumero: number | null;
};

/** El último paso (spec 13A §11.1 y §11.3): publicar lo aprobado o ejecutar la eliminación. */
export function PanelPublicacion({
  tramite,
  huella,
  pideCodigo,
}: {
  tramite: TramiteParaPublicar;
  huella: string | null;
  pideCodigo: boolean;
}) {
  const eliminacion = tramite.tipo === "eliminar";
  return (
    <section
      aria-labelledby="titulo-publicacion"
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs"
    >
      <h2 id="titulo-publicacion" className="text-sm font-semibold">
        {eliminacion ? "Eliminación aprobada" : "Publicación"}
      </h2>
      <p className="text-sm text-muted-foreground">
        {eliminacion
          ? "La versión vigente pasa a anulada y deja de verse en el portal. Se conserva en el historial."
          : "Esta versión queda vigente y la anterior pasa a obsoleta en el mismo acto."}
      </p>
      <div className="flex flex-wrap items-start justify-end gap-2">
        <DialogoFirma
          titulo="Firmar como «Publicó»"
          etiquetaBoton={eliminacion ? "Eliminar el documento" : "Publicar"}
          resumen={{
            documento: [tramite.codigo, tramite.titulo].filter(Boolean).join(" "),
            version: tramite.versionNumero,
            huella,
          }}
          accion={publicarTramiteAccion}
          ocultos={{ id: String(tramite.id), etapa: tramite.etapa, ronda: String(tramite.ronda) }}
          pideCodigo={pideCodigo}
        >
          {eliminacion ? <p className="text-sm text-estado-critico-texto">Esta acción retira el documento de circulación</p> : null}
        </DialogoFirma>
      </div>
    </section>
  );
}
