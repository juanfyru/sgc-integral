import Link from "next/link";
import { textoDeVence } from "@/componentes/mejoramiento/ListaDeHallazgos";
import type { ContextoMejora } from "@/db/consultas/mejoramiento/config";
import type { RespuestaDelPlan } from "@/db/consultas/mejoramiento/respuesta-plan";
import { fechaDeDia, fechaLargaDeDia } from "@/lib/mejoramiento/formato";
import { LISTOS_CAMBIARON } from "@/lib/mejoramiento/planes";
import { ANCLA_ARCHIVOS_DEL_PLAN, ANCLA_RESPUESTA_AL_ENTE, rutaDeHallazgo } from "@/lib/mejoramiento/rutas";
import { finDeFecha } from "@/lib/tramites/plazos";
import type { AccionDelPaso } from "../pasos/Partes";
import { FormularioRespuestaDelPlan } from "./FormularioRespuestaDelPlan";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/** «a, b y c» de una lista de nodos. */
function enLista(partes: React.ReactNode[]): React.ReactNode[] {
  return partes.flatMap((p, i) => (i === 0 ? [p] : [i === partes.length - 1 ? " y " : ", ", p]));
}

function Codigo({ id, codigo }: { id: number; codigo: string }) {
  return (
    <Link href={rutaDeHallazgo(id)} className={`rounded-sm font-mono text-marca underline-offset-2 hover:underline ${FOCO}`}>
      {codigo}
    </Link>
  );
}

/**
 * «Respuesta al ente» de la página del plan (anexo §3.8, maqueta 2). Llega solo a quien ve todo y si el plan tiene algún hallazgo
 * de origen externo (`respuestaDelPlan`): cuándo vence (la fecha del ente más próxima de los listos), cuáles están listos y a
 * cuáles les falta aprobar su plan de acción, con su estado, y las respuestas ya registradas, cada una con su oficio y sus
 * hallazgos. Al Admin SGC, en un plan que no está anulado y con algún listo (`responder`), el formulario; con `cambio`, el aviso de
 * que la lista que vio cambió y no se registró nada (Review Focus 4).
 */
export function RespuestaAlEnte({
  planId,
  respuesta,
  responder,
  hoy,
  contexto,
  cambio,
  accion,
}: {
  planId: number;
  respuesta: RespuestaDelPlan;
  responder: boolean;
  hoy: string;
  contexto: Pick<ContextoMejora, "ahora" | "calendario" | "zona">;
  cambio: boolean;
  accion: AccionDelPaso;
}) {
  const vence = respuesta.vence ? textoDeVence(finDeFecha(respuesta.vence, contexto.zona), contexto) : null;
  const clave = `${respuesta.listos.map((l) => l.id).join("-")}:${respuesta.oficios.map((o) => o.id).join("-")}:${cambio}`;
  return (
    <section
      id={ANCLA_RESPUESTA_AL_ENTE}
      aria-labelledby="respuesta-al-ente-titulo"
      className="flex min-w-0 scroll-mt-4 flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <h2 id="respuesta-al-ente-titulo" className="font-display text-base font-semibold">
        Respuesta al ente
      </h2>
      {cambio ? (
        <p role="alert" className="rounded-md border border-estado-atencion bg-estado-atencion-fondo px-3 py-2 text-sm text-estado-atencion-texto">
          {LISTOS_CAMBIARON}
        </p>
      ) : null}
      {respuesta.vence && vence ? (
        <p className="text-sm">
          Vence el <b>{fechaLargaDeDia(respuesta.vence)}</b>
          {" · "}
          <span className={vence.vencida ? "font-semibold text-estado-critico-texto" : undefined}>{vence.plazo}</span>.
        </p>
      ) : null}
      {respuesta.listos.length > 0 ? (
        <p className="text-sm">
          <b>{`Listos para responder (${respuesta.listos.length}):`}</b>{" "}
          {enLista(respuesta.listos.map((l) => <Codigo key={l.id} id={l.id} codigo={l.codigo} />))}.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Ningún hallazgo del plan espera respuesta.</p>
      )}
      {respuesta.faltan.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          <b>{`Les falta aprobar su plan de acción (${respuesta.faltan.length}):`}</b>{" "}
          {enLista(
            respuesta.faltan.map((f) => (
              <span key={f.id}>
                <Codigo id={f.id} codigo={f.codigo} /> ({f.estado})
              </span>
            )),
          )}
          .
        </p>
      ) : null}
      {responder && respuesta.listos.length > 0 ? (
        <FormularioRespuestaDelPlan
          key={clave}
          planId={planId}
          vistos={respuesta.listos.map((l) => l.id)}
          oficios={respuesta.oficios}
          desde={respuesta.desde}
          hoy={hoy}
          anclaDeArchivos={ANCLA_ARCHIVOS_DEL_PLAN}
          conAviso={cambio}
          accion={accion}
        />
      ) : null}
      {respuesta.respuestas.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="text-sm font-semibold">Respuestas registradas</h3>
          <ul className="flex list-none flex-col gap-2">
            {respuesta.respuestas.map((r) => (
              <li key={r.id} className="break-words border-b border-linea-suave pb-2 text-sm last:border-b-0 last:pb-0">
                <span className="block">{`Enviada el ${fechaDeDia(r.enviadaEn)} · la registró ${r.por}.`}</span>
                <span className="block text-muted-foreground">
                  {"Incluyó "}
                  {enLista(r.hallazgos.map((c) => <span key={c} className="font-mono">{c}</span>))}.
                </span>
                <span className="block">
                  {"Oficio: "}
                  <a
                    href={`/mejoramiento/archivos/${r.oficio.id}/${encodeURIComponent(r.oficio.nombre)}`}
                    className={`rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`}
                  >
                    {r.oficio.nombre}
                  </a>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Se registra una vez y vale para los hallazgos listos. Los que faltan se responden con otro registro cuando estén aprobados.
      </p>
    </section>
  );
}
