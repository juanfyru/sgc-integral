import { DialogoFirma } from "@/componentes/tramites/DialogoFirma";
import { huellaAbreviada } from "@/lib/tramites/tipos";
import { Cita, type AccionDelPaso } from "../pasos/Partes";

/**
 * Enviar la causa raíz y el plan con la firma «Elaboró» (spec 15 §8.6, maqueta 5): con lo que falta (`examinarPlan`), solo
 * lo dice; sin faltas, el diálogo de la firma con la huella de lo que se firma. Si el plan se devolvió, las observaciones de
 * quien lo devolvió. Sin otro Administrador del SGC que revise, el envío va directo a Gerencia.
 */
export function PasoEnviar({
  hallazgoId,
  faltas,
  saltaRevision,
  huella,
  pideCodigo,
  devuelto,
  accion,
}: {
  hallazgoId: number;
  /** Cuántas faltas tiene el plan: con alguna no se envía. */
  faltas: number;
  saltaRevision: boolean;
  /** La huella de lo que se firmaría (`examinarPlan`). */
  huella: string;
  pideCodigo: boolean;
  /** Las observaciones de la última devolución, si el plan volvió a borrador por ella. */
  devuelto: string | null;
  accion: AccionDelPaso;
}) {
  const etiqueta = saltaRevision ? "Enviar a aprobación" : "Enviar a revisión";
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Cita rotulo="Observaciones de la devolución" texto={devuelto} />
      {faltas > 0 ? (
        <p className="text-sm text-muted-foreground">Complete lo que falta para enviar el análisis y el plan.</p>
      ) : (
        <div>
          <DialogoFirma titulo={etiqueta} etiquetaBoton={etiqueta} accion={accion} ocultos={{ hallazgoId: String(hallazgoId) }} pideCodigo={pideCodigo}>
            <p className="text-sm">
              Firma «Elaboró» sobre la causa raíz y el plan tal como están guardados. Mientras se revisan y se aprueban no se pueden
              cambiar; si los devuelven, se corrigen y se firma otra vez.
            </p>
            {saltaRevision ? (
              <p className="text-sm">No hay otro Administrador del SGC activo que lo revise: pasa directo a Gerencia.</p>
            ) : null}
            <p className="text-sm">
              Huella: <span className="font-mono">{huellaAbreviada(huella)}</span>
            </p>
          </DialogoFirma>
        </div>
      )}
    </div>
  );
}
