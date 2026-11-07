import { anularJornadaAccion } from "@/app/acciones-distribucion";
import { FormAccion } from "@/componentes/admin/FormAccion";
import { ZonaCarga } from "@/componentes/admin/ZonaCarga";
import { claseControl } from "@/componentes/ui/Campo";
import { Insignia } from "@/componentes/ui/Insignia";
import type { Jornada } from "@/db/consultas/distribucion/jornadas";
import { ETIQUETA_MODALIDAD } from "@/lib/distribucion/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { BotonQuitarEvidencia } from "./BotonQuitarEvidencia";
import { fechaDeJornada, textoEvidencia } from "./TablaJornadas";

function Fila({ etiqueta, ancha, children }: { etiqueta: string; ancha?: boolean; children: React.ReactNode }) {
  return (
    <div className={ancha ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="whitespace-pre-wrap break-words text-sm">{children}</dd>
    </div>
  );
}

const tamano = (bytes: number) => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function DetalleJornada({
  jornada: j,
  puedeAdjuntar,
  hasta,
  puedeAnular,
}: {
  jornada: Jornada;
  /** Quien la registró, dentro de las 24 horas y sin anular. */
  puedeAdjuntar: boolean;
  hasta: Date | null;
  puedeAnular: boolean;
}) {
  const cuando = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: zonaHoraria() });
  return (
    <div className="flex flex-col gap-6">
      {j.anulada ? (
        <p role="status" className="rounded-lg border border-estado-critico/40 bg-estado-critico-fondo p-3 text-sm text-estado-critico-texto">
          {`Jornada anulada el ${cuando.format(j.anulada.en)} por ${j.anulada.por}: ${j.anulada.motivo}. Los acuses que confirmó volvieron a pendientes.`}
        </p>
      ) : null}

      <section aria-labelledby="titulo-jornada" className="rounded-xl border border-border bg-card p-4 shadow-xs">
        <h2 id="titulo-jornada" className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold">
          La jornada
          {j.anulada ? <Insignia variante="critico">Anulada</Insignia> : <Insignia variante="bien">Registrada</Insignia>}
        </h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Fila etiqueta="Fecha">{fechaDeJornada(j.fecha)}</Fila>
          <Fila etiqueta="Modalidad">{ETIQUETA_MODALIDAD[j.modalidad]}</Fila>
          <Fila etiqueta="Facilitador">{j.facilitador.nombre}</Fila>
          <Fila etiqueta="Registrada por">{`${j.registradaPor.nombre}, el ${cuando.format(j.creadoEn)}`}</Fila>
          <Fila etiqueta="Documentos socializados" ancha>
            <ul className="list-none">
              {j.versiones.map((v) => (
                <li key={v.versionId}>
                  <span className="font-mono text-xs">{`${v.codigo} v${v.version}`}</span> {v.titulo}
                </li>
              ))}
            </ul>
          </Fila>
          {j.observaciones ? (
            <Fila etiqueta="Observaciones" ancha>
              {j.observaciones}
            </Fila>
          ) : null}
        </dl>
      </section>

      <section aria-labelledby="titulo-asistentes" className="rounded-xl border border-border bg-card p-4 shadow-xs">
        <h2 id="titulo-asistentes" className="mb-3 text-sm font-semibold">
          {`Asistentes (${j.asistentesCantidad})`}
        </h2>
        {j.puedeVerEvidencia ? (
          <>
            {j.asistentes.length > 0 ? (
              <ul className="list-none columns-1 gap-6 text-sm sm:columns-2">
                {j.asistentes.map((a) => (
                  <li key={a.id}>{a.cargo ? `${a.nombre} — ${a.cargo}` : a.nombre}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No se marcó ningún asistente de la plataforma.</p>
            )}
            {j.asistentesExternos ? (
              <p className="mt-3 whitespace-pre-wrap text-sm">
                <span className="text-xs text-muted-foreground">Externos: </span>
                {j.asistentesExternos}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">La lista de asistentes la ven quienes administran el SGC y el líder del proceso.</p>
        )}
      </section>

      <section aria-labelledby="titulo-evidencia" className="rounded-xl border border-border bg-card p-4 shadow-xs">
        <h2 id="titulo-evidencia" className="mb-3 text-sm font-semibold">
          Evidencia
        </h2>
        {j.puedeVerEvidencia ? (
          j.evidencias.length > 0 ? (
            <ul className="mb-3 flex list-none flex-col gap-2">
              {j.evidencias.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <a
                    href={`/distribucion/socializaciones/${j.id}/archivos/${e.id}/${encodeURIComponent(e.nombreOriginal)}`}
                    className="min-w-0 break-words rounded underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
                  >
                    {e.nombreOriginal}
                  </a>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{`${e.mime} · ${tamano(e.tamanoBytes)}`}</span>
                    {puedeAdjuntar ? <BotonQuitarEvidencia jornadaId={j.id} archivoId={e.id} nombre={e.nombreOriginal} /> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-sm text-muted-foreground">Sin acta adjunta.</p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">
            {j.evidenciasCantidad === 0
              ? "Sin acta adjunta."
              : `${textoEvidencia(j.evidenciasCantidad)}. Los archivos los ven quienes administran el SGC y el líder del proceso.`}
          </p>
        )}
        {puedeAdjuntar && hasta ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{`Puede adjuntar o quitar evidencia hasta el ${cuando.format(hasta)}. Después la jornada queda como está.`}</p>
            <ZonaCarga direccion={`/api/socializaciones/${j.id}/archivos`} evidencia />
          </div>
        ) : null}
      </section>

      {puedeAnular && !j.anulada ? (
        <section aria-labelledby="titulo-anular" className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <h2 id="titulo-anular" className="mb-3 text-sm font-semibold">
            Anular la jornada
          </h2>
          <FormAccion
            accion={anularJornadaAccion}
            etiqueta="Anular"
            tono="peligro"
            confirmacion="Una jornada no se edita. Al anularla, los acuses que confirmó por asistencia vuelven a pendientes y la socialización requerida se reabre. Queda en la bitácora."
            campos={{ id: j.id }}
          >
            <label className="flex flex-col gap-1 text-sm font-medium">
              Motivo
              <textarea name="motivo" required minLength={5} maxLength={1000} rows={3} className={claseControl} />
            </label>
          </FormAccion>
        </section>
      ) : null}
    </div>
  );
}
