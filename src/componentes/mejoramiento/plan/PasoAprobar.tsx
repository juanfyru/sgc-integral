import { DialogoFirma } from "@/componentes/tramites/DialogoFirma";
import { huellaAbreviada } from "@/lib/tramites/tipos";
import type { AccionDelPaso } from "../pasos/Partes";
import { DevolverPlan } from "./PasoRevisar";

/**
 * «En aprobación», para Gerencia (spec 15 §8.6): por qué le toca aprobarlo, la nota del revisor si marcó recursos o impacto
 * institucional, la firma «Aprobó» (el plan pasa a ejecución y cada actividad llega a su responsable) o devolverlo con
 * observaciones.
 */
export function PasoAprobar({
  hallazgoId,
  gerencia,
  notaRecursos,
  huella,
  pideCodigo,
  aprobar,
  devolver,
}: {
  hallazgoId: number;
  /** Por qué aprueba Gerencia (`razonDeGerencia`). */
  gerencia: string | null;
  notaRecursos: string | null;
  huella: string;
  pideCodigo: boolean;
  aprobar: AccionDelPaso;
  devolver: AccionDelPaso;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {gerencia ? <p className="text-sm">{`Le toca a Gerencia porque ${gerencia}.`}</p> : null}
      {notaRecursos ? (
        <p className="whitespace-pre-line break-words border-l-2 border-mod-planes pl-3 text-sm">
          <span className="font-medium">Nota del revisor:</span> {notaRecursos}
        </p>
      ) : null}
      <div>
        <DialogoFirma
          titulo="Aprobar el plan"
          etiquetaBoton="Aprobar el plan"
          accion={aprobar}
          ocultos={{ hallazgoId: String(hallazgoId) }}
          pideCodigo={pideCodigo}
        >
          <p className="text-sm">Con su firma, el plan pasa a ejecución y cada actividad llega a su responsable, con su aviso.</p>
          <p className="text-sm">
            Huella del plan enviado: <span className="font-mono">{huellaAbreviada(huella)}</span>
          </p>
        </DialogoFirma>
      </div>
      <DevolverPlan hallazgoId={hallazgoId} accion={devolver} />
    </div>
  );
}
