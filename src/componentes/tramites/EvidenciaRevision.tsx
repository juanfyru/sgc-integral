import { ListaSoloLectura } from "@/componentes/tramites/ListaVerificacion";
import { Observaciones } from "@/componentes/tramites/Observaciones";
import type { Observacion, RondaVerificacion } from "@/db/consultas/revision";
import { esEtapaDeTrabajo, type Etapa } from "@/lib/tramites/tipos";

function RondasVerificacion({ rondas, rondaEnCurso }: { rondas: RondaVerificacion[]; rondaEnCurso: number | null }) {
  const [reciente, ...anteriores] = rondas;
  const enCursoSinRespuestas = rondaEnCurso !== null && reciente?.ronda !== rondaEnCurso;
  return (
    <div className="flex flex-col gap-3">
      {enCursoSinRespuestas ? (
        <p className="text-sm text-muted-foreground">{`Ronda ${rondaEnCurso}, en curso: todavía sin respuestas guardadas.`}</p>
      ) : null}
      {reciente ? (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-medium">{`Ronda ${reciente.ronda}${reciente.ronda === rondaEnCurso ? ", en curso" : ""}`}</h4>
          <ListaSoloLectura respuestas={reciente.respuestas} etiqueta={`Respuestas de la ronda ${reciente.ronda}`} />
        </div>
      ) : null}
      {anteriores.map(({ ronda, respuestas }) => (
        <details key={ronda} className="text-sm">
          <summary className="cursor-pointer font-medium">{`Ronda ${ronda}`}</summary>
          <div className="mt-2">
            <ListaSoloLectura respuestas={respuestas} etiqueta={`Respuestas de la ronda ${ronda}`} />
          </div>
        </details>
      ))}
    </div>
  );
}

/**
 * Lo que se respondió en cada ronda y lo que se observó, en solo lectura, para toda persona que ve
 * el trámite. Sigue en la página cuando el trámite se cierra: es la evidencia del PC-05 y del PC-06
 * (spec 13A §6.5 y §9.3). `rondaEnCurso` es la que el revisor está respondiendo. Un trámite que no
 * llegó a la revisión no pinta nada.
 */
export function EvidenciaRevision({
  tramite,
  rondas,
  observaciones,
  rondaEnCurso = null,
}: {
  tramite: { id: number; etapa: Etapa; ronda: number };
  rondas: RondaVerificacion[];
  observaciones: Observacion[];
  rondaEnCurso?: number | null;
}) {
  if (rondas.length === 0 && observaciones.length === 0 && rondaEnCurso === null) return null;
  return (
    <section
      aria-labelledby="titulo-revision"
      className="flex min-w-0 flex-col gap-5 rounded-xl border border-border bg-card p-4 shadow-xs"
    >
      <h2 id="titulo-revision" className="text-sm font-semibold">
        Revisión
      </h2>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Lista de verificación</h3>
        {rondas.length > 0 || rondaEnCurso !== null ? (
          <RondasVerificacion rondas={rondas} rondaEnCurso={rondaEnCurso} />
        ) : (
          <p className="text-sm text-muted-foreground">No se guardaron respuestas.</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Observaciones</h3>
        {observaciones.length > 0 ? (
          <Observaciones tramite={tramite} observaciones={observaciones} puedeRevisar={false} puedeResponder={false} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {esEtapaDeTrabajo(tramite.etapa) ? "Todavía no hay observaciones." : "No hubo observaciones."}
          </p>
        )}
      </div>
    </section>
  );
}
