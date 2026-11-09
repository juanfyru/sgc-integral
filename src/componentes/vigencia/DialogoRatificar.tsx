"use client";

import { ratificarAccion } from "@/app/acciones-vigencia";
import { DialogoFirma } from "@/componentes/tramites/DialogoFirma";
import { Campo, claseControl } from "@/componentes/ui/Campo";

/**
 * «Ratificar sin cambios» (spec 13C §7.3): el diálogo de firma de la 13A con la nota opcional y la fecha a la
 * que pasará la próxima revisión. La clave se pide en el mismo envío.
 */
export function DialogoRatificar({
  documento,
  proximaRevision,
  pideCodigo,
}: {
  documento: { id: number; codigo: string; titulo: string; version: number; huella: string | null };
  /** «8 nov 2027»: hoy más el plazo del documento. */
  proximaRevision: string;
  pideCodigo: boolean;
}) {
  return (
    <DialogoFirma
      titulo={`Ratificar ${documento.codigo}, versión ${documento.version}`}
      etiquetaBoton="Ratificar sin cambios"
      resumen={{ documento: `${documento.codigo} · ${documento.titulo}`, version: documento.version, huella: documento.huella }}
      accion={ratificarAccion}
      ocultos={{ documentoId: String(documento.id) }}
      pideCodigo={pideCodigo}
    >
      <CuerpoRatificar proximaRevision={proximaRevision} />
    </DialogoFirma>
  );
}

/** Lo que el diálogo agrega al de firma: qué se confirma, a qué fecha pasa la revisión y la nota. */
export function CuerpoRatificar({ proximaRevision }: { proximaRevision: string }) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {"Confirma que el documento sigue siendo adecuado tal como está. La próxima revisión pasará al "}
        <strong className="font-semibold text-foreground">{proximaRevision}</strong>
        {". Queda como firma «Ratificó», con la huella del archivo vigente."}
      </p>
      <Campo etiqueta="Nota (opcional)" nombre="nota" ayuda="Hasta 1000 caracteres; queda con la ratificación.">
        <textarea maxLength={1000} rows={3} className={`${claseControl} w-full`} />
      </Campo>
    </>
  );
}
