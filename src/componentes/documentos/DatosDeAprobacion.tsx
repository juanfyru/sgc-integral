import { EnlaceActa } from "@/componentes/tramites/EnlaceActa";
import { APROBACION_DE_VERSION, type OrigenAprobacion } from "@/lib/tramites/tipos";

/** Filas del control del documento: cómo se aprobó la versión y, si fue en la plataforma, su acta. */
export function DatosDeAprobacion({ origen, tramiteId }: { origen: OrigenAprobacion; tramiteId: number | null }) {
  return (
    <>
      <div>
        <dt className="text-xs text-muted-foreground">Aprobación</dt>
        <dd className="text-sm text-foreground">{APROBACION_DE_VERSION[origen]}</dd>
      </div>
      {tramiteId !== null && (
        <div>
          <dt className="text-xs text-muted-foreground">Acta de aprobación</dt>
          <dd className="text-sm text-foreground">
            <EnlaceActa tramiteId={tramiteId} clase="aprobacion" />
          </dd>
        </div>
      )}
    </>
  );
}
