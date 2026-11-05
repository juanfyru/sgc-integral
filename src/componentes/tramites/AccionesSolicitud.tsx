"use client";

import { useActionState, useState } from "react";
import { darVistoBuenoAccion, negarVistoBuenoAccion, retirarSolicitudAccion } from "@/app/acciones-tramites";
import type { EstadoAccion } from "@/app/admin/comun";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import type { Accion } from "@/lib/tramites/transiciones";
import type { Etapa } from "@/lib/tramites/tipos";

type Referencia = { id: number; etapa: Etapa; ronda: number };
type AccionServidor = (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;

function Ocultos({ tramite }: { tramite: Referencia }) {
  return (
    <>
      <input type="hidden" name="id" value={tramite.id} />
      <input type="hidden" name="etapa" value={tramite.etapa} />
      <input type="hidden" name="ronda" value={tramite.ronda} />
    </>
  );
}

function ErrorAccion({ estado }: { estado: EstadoAccion }) {
  return estado ? (
    <p role="alert" className="text-sm text-estado-critico-texto">
      {estado.error}
    </p>
  ) : null;
}

function DarVistoBueno({ tramite }: { tramite: Referencia }) {
  const [estado, enviar, pendiente] = useActionState(darVistoBuenoAccion, null);
  return (
    <form action={enviar} className="flex flex-col items-end gap-2">
      <Ocultos tramite={tramite} />
      <Boton type="submit" pendiente={pendiente}>
        {pendiente ? "Procesando…" : "Dar visto bueno"}
      </Boton>
      <ErrorAccion estado={estado} />
    </form>
  );
}

/** Dos gestos para lo que cierra el trámite: abrir el diálogo y confirmar. */
function AccionEnDialogo({
  tramite,
  accion,
  etiqueta,
  texto,
  confirmar,
  pideMotivo,
}: {
  tramite: Referencia;
  accion: AccionServidor;
  etiqueta: string;
  texto: string;
  confirmar: string;
  pideMotivo?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const motivo = estado?.valores?.motivo;

  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)} aria-haspopup="dialog">
        {etiqueta}
      </Boton>
      <Dialogo
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo={etiqueta}
        className="m-auto w-full max-w-md rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        {/* El relleno va en este hijo: un clic sobre el propio <dialog> es un clic en el fondo y lo cierra. */}
        <form action={enviar} className="flex flex-col gap-4 p-5">
          <Ocultos tramite={tramite} />
          <p className="text-sm text-muted-foreground">{texto}</p>
          {pideMotivo ? (
            <Campo etiqueta="Motivo" nombre="motivo" ayuda="Entre 5 y 1000 caracteres. Lo verá quien pidió.">
              <textarea
                required
                minLength={5}
                maxLength={1000}
                rows={4}
                defaultValue={typeof motivo === "string" ? motivo : ""}
                className={claseControl}
              />
            </Campo>
          ) : null}
          <ErrorAccion estado={estado} />
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={() => setAbierto(false)}>
              Volver
            </Boton>
            <Boton type="submit" variante="peligro" pendiente={pendiente}>
              {pendiente ? "Procesando…" : confirmar}
            </Boton>
          </div>
        </form>
      </Dialogo>
    </>
  );
}

/** Solo las acciones de la solicitud que `acciones` le permite a quien mira. */
export function AccionesSolicitud({ tramite, acciones }: { tramite: Referencia; acciones: Accion[] }) {
  const dar = acciones.includes("dar_visto_bueno");
  const negar = acciones.includes("negar_visto_bueno");
  const retirar = acciones.includes("retirar");
  if (!dar && !negar && !retirar) return null;

  return (
    <section aria-label="Acciones de la solicitud" className="flex flex-wrap items-start justify-end gap-2">
      {retirar ? (
        <AccionEnDialogo
          tramite={tramite}
          accion={retirarSolicitudAccion}
          etiqueta="Retirar la solicitud"
          texto="La solicitud se cancela y deja de contar como trámite abierto. Queda en el historial."
          confirmar="Retirar"
        />
      ) : null}
      {negar ? (
        <AccionEnDialogo
          tramite={tramite}
          accion={negarVistoBuenoAccion}
          etiqueta="Negar con motivo"
          texto="La solicitud se cierra como rechazada."
          confirmar="Negar el visto bueno"
          pideMotivo
        />
      ) : null}
      {dar ? <DarVistoBueno tramite={tramite} /> : null}
    </section>
  );
}
