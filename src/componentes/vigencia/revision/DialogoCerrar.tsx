"use client";

import { cerrarRevisionAccion } from "@/app/acciones-vigencia";
import { DialogoFirma } from "@/componentes/tramites/DialogoFirma";
import { cuenta } from "@/lib/plural";

type Props = {
  revisionId: number;
  anio: number;
  documentos: number;
  /** Los que aún no tienen decisión: al cerrar quedan «sin revisar» (los de un trámite que murió cierran con su trámite). */
  pendientes: number;
  pideCodigo: boolean;
};

/** Lo que el diálogo de firma muestra antes de la clave: qué se cierra y qué pasa al cerrarla. */
export function CuerpoCerrar({ anio, documentos, pendientes }: Omit<Props, "revisionId" | "pideCodigo">) {
  return (
    <>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Revisión</dt>
        <dd>{`Revisión anual ${anio}`}</dd>
        <dt className="text-muted-foreground">Documentos</dt>
        <dd>{documentos}</dd>
        <dt className="text-muted-foreground">Quedarán sin revisar</dt>
        <dd>{pendientes === 0 ? "Ninguno" : cuenta(pendientes, "documento", "documentos")}</dd>
      </dl>
      <p className="text-sm text-muted-foreground">
        Al cerrar, lo que no tiene decisión queda «sin revisar», se congela el informe con el formato elegido y se avisa a
        Gerencia, a Control Interno y a los líderes. No se deshace: el informe en PDF se genera al abrirlo por primera vez.
      </p>
    </>
  );
}

/** «Cerrar y generar informe» (spec 13C §9.5): el cierre se firma con la clave, en el diálogo de firma de la 13A. */
export function DialogoCerrar({ revisionId, pideCodigo, ...cuerpo }: Props) {
  return (
    <DialogoFirma
      titulo={`Cerrar la revisión anual ${cuerpo.anio}`}
      etiquetaBoton="Cerrar y generar informe"
      accion={cerrarRevisionAccion}
      ocultos={{ revisionId: String(revisionId) }}
      pideCodigo={pideCodigo}
    >
      <CuerpoCerrar {...cuerpo} />
    </DialogoFirma>
  );
}
