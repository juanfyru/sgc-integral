"use client";

import { startTransition, useActionState, useRef, type FormEvent } from "react";
import {
  cerrarObservacionAccion,
  crearObservacionAccion,
  reabrirObservacionAccion,
  responderObservacionAccion,
} from "@/app/acciones-tramites";
import type { EstadoAccion } from "@/app/admin/comun";
import { ErrorAccion, Ocultos } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { Insignia, type VarianteInsignia } from "@/componentes/ui/Insignia";
import type { Observacion } from "@/db/consultas/revision";
import type { Etapa } from "@/lib/tramites/tipos";

type Referencia = { id: number; etapa: Etapa; ronda: number };
type AccionServidor = (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;

const ESTADO: Record<Observacion["estado"], { texto: string; variante: VarianteInsignia }> = {
  abierta: { texto: "Abierta", variante: "atencion" },
  atendida: { texto: "Atendida", variante: "neutra" },
  cerrada: { texto: "Cerrada", variante: "bien" },
};

/** Un formulario de una línea: enviar desde una transición conserva lo escrito si el servidor rechaza. */
function FormularioDeObservacion({
  accion,
  tramite,
  observacionId,
  campo,
  etiqueta,
  boton,
  pendienteTexto,
  inicial,
  variante = "secundario",
}: {
  accion: AccionServidor;
  tramite: Referencia;
  observacionId?: number;
  /** Sin `campo` el formulario es solo un botón (cerrar). */
  campo?: "texto" | "respuesta" | "nota";
  etiqueta?: string;
  boton: string;
  pendienteTexto: string;
  inicial?: string;
  variante?: "primario" | "secundario";
}) {
  const formulario = useRef<HTMLFormElement>(null);
  // La observación nueva se vacía al guardarse: con el texto aún ahí, otro clic crearía un duplicado.
  const [estado, enviar, pendiente] = useActionState(async (previo: EstadoAccion, datos: FormData) => {
    const resultado = await accion(previo, datos);
    if (!resultado && campo === "texto") formulario.current?.reset();
    return resultado;
  }, null);
  const idCampo = `${campo}-${observacionId ?? "nueva"}`;
  const alEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    startTransition(() => enviar(datos));
  };
  const escrito = campo ? estado?.valores?.[campo] : undefined;
  return (
    <form ref={formulario} action={enviar} onSubmit={alEnviar} className="flex flex-col gap-2">
      <Ocultos tramite={tramite} />
      {observacionId !== undefined ? <input type="hidden" name="observacionId" value={observacionId} /> : null}
      {campo ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={idCampo} className="text-sm font-medium">
            {etiqueta}
          </label>
          <textarea
            id={idCampo}
            name={campo}
            required
            minLength={5}
            maxLength={2000}
            rows={3}
            defaultValue={typeof escrito === "string" ? escrito : (inicial ?? "")}
            className={claseControl}
          />
        </div>
      ) : null}
      <ErrorAccion estado={estado} />
      <div className="flex justify-end">
        <Boton type="submit" variante={variante} pendiente={pendiente}>
          {pendiente ? pendienteTexto : boton}
        </Boton>
      </div>
    </form>
  );
}

function Reabrir({ tramite, observacion }: { tramite: Referencia; observacion: Observacion }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">Reabrir con una nota</summary>
      <div className="mt-2">
        <FormularioDeObservacion
          accion={reabrirObservacionAccion}
          tramite={tramite}
          observacionId={observacion.id}
          campo="nota"
          etiqueta="Nota de reapertura"
          boton="Reabrir la observación"
          pendienteTexto="Reabriendo…"
        />
      </div>
    </details>
  );
}

function Fila({
  tramite,
  o,
  puedeResponder,
  puedeRevisar,
}: {
  tramite: Referencia;
  o: Observacion;
  puedeResponder: boolean;
  puedeRevisar: boolean;
}) {
  const estado = ESTADO[o.estado];
  return (
    <li className="flex flex-col gap-2 border-b border-border pb-3 text-sm last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{`Observación ${o.numero}`}</span>
        <Insignia variante={estado.variante}>{estado.texto}</Insignia>
        <span className="text-xs text-muted-foreground">
          {`${o.autor} · ${o.origen === "aprobacion" ? "aprobación" : "revisión"}, ronda ${o.ronda}`}
        </span>
      </div>
      <p className="whitespace-pre-wrap break-words">{o.texto}</p>
      {o.notaReapertura ? (
        <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{`Nota de reapertura: ${o.notaReapertura}`}</p>
      ) : null}
      {o.respuesta ? (
        <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{`Respuesta: ${o.respuesta}`}</p>
      ) : null}
      {puedeResponder && o.estado !== "cerrada" ? (
        <FormularioDeObservacion
          accion={responderObservacionAccion}
          tramite={tramite}
          observacionId={o.id}
          campo="respuesta"
          etiqueta="Respuesta"
          boton={o.estado === "atendida" ? "Cambiar la respuesta" : "Responder"}
          pendienteTexto="Guardando…"
          inicial={o.respuesta ?? ""}
        />
      ) : null}
      {puedeRevisar && o.estado === "atendida" ? (
        <FormularioDeObservacion
          accion={cerrarObservacionAccion}
          tramite={tramite}
          observacionId={o.id}
          boton="Cerrar la observación"
          pendienteTexto="Cerrando…"
        />
      ) : null}
      {puedeRevisar && o.estado !== "abierta" ? <Reabrir tramite={tramite} observacion={o} /> : null}
    </li>
  );
}

/**
 * Las observaciones numeradas del trámite (spec 13A §9.3). Cada formulario aparece solo a quien
 * le corresponde: `puedeRevisar` es el revisor en revisión; `puedeResponder`, el elaborador en
 * elaboración.
 */
export function Observaciones({
  tramite,
  observaciones,
  puedeRevisar,
  puedeResponder,
}: {
  tramite: Referencia;
  observaciones: Observacion[];
  puedeRevisar: boolean;
  puedeResponder: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {observaciones.length > 0 ? (
        <ol className="flex list-none flex-col gap-3" aria-label="Observaciones">
          {observaciones.map((o) => (
            <Fila key={o.id} tramite={tramite} o={o} puedeResponder={puedeResponder} puedeRevisar={puedeRevisar} />
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no hay observaciones.</p>
      )}
      {puedeRevisar ? (
        <FormularioDeObservacion
          accion={crearObservacionAccion}
          tramite={tramite}
          campo="texto"
          etiqueta="Nueva observación"
          boton="Añadir la observación"
          pendienteTexto="Guardando…"
        />
      ) : null}
    </div>
  );
}
