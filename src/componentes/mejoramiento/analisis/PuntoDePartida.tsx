/**
 * «Lo que dijo el análisis del indicador» (anexo 15B §6.5): la causa y la acción propuesta que quien mide dejó en la medición que
 * este hallazgo cita, en solo lectura, para quien formula. El texto es el que escribió una persona: se pinta como texto.
 */
export function PuntoDePartida({ periodo, causa, accionPropuesta }: { periodo: string; causa: string | null; accionPropuesta: string | null }) {
  return (
    <section aria-labelledby="punto-partida-titulo" className="rounded-lg border border-border bg-card p-4">
      <h3 id="punto-partida-titulo" className="font-display text-base font-semibold">
        Lo que dijo el análisis del indicador
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">{`Medición de ${periodo.toLowerCase()}. Es el punto de partida: no se edita aquí.`}</p>
      <dl className="mt-3 flex flex-col gap-2 text-sm">
        <div>
          <dt className="font-medium">Causa</dt>
          <dd className="break-words">{causa ?? "No la escribieron."}</dd>
        </div>
        <div>
          <dt className="font-medium">Acción propuesta</dt>
          <dd className="break-words">{accionPropuesta ?? "No la escribieron."}</dd>
        </div>
      </dl>
    </section>
  );
}
