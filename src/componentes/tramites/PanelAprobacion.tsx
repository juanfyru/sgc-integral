"use client";

import { startTransition, useActionState, useRef, useState, type FormEvent } from "react";
import {
  aprobarAccion,
  aprobarYPublicarAccion,
  devolverAprobacionAccion,
  negarEliminacionAccion,
} from "@/app/acciones-tramites";
import { AccionEnDialogo, ErrorAccion, Ocultos } from "@/componentes/tramites/AccionesSolicitud";
import { DialogoFirma } from "@/componentes/tramites/DialogoFirma";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import type { Accion } from "@/lib/tramites/transiciones";
import { MAX_OBSERVACIONES_APROBACION, type Etapa, type TipoSolicitud } from "@/lib/tramites/tipos";

export type TramiteParaAprobar = {
  id: number;
  etapa: Etapa;
  ronda: number;
  tipo: TipoSolicitud;
  codigo: string | null;
  titulo: string;
  versionNumero: number | null;
};

export type ConceptoRevisado = { persona: string | null; concepto: string };

function CampoConcepto() {
  return (
    <Campo etiqueta="Concepto" nombre="concepto" ayuda="Su concepto sobre el documento. Entre 5 y 2000 caracteres.">
      <textarea required minLength={5} maxLength={2000} rows={3} className={claseControl} />
    </Campo>
  );
}

/** Cada observación es un campo `observaciones`. Enviar desde una transición conserva lo escrito tras un rechazo. */
function DevolverConObservaciones({ tramite }: { tramite: TramiteParaAprobar }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, enviar, pendiente] = useActionState(devolverAprobacionAccion, null);
  const [filas, setFilas] = useState([0]);
  const siguiente = useRef(1);

  const alEnviar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    startTransition(() => enviar(datos));
  };
  const anadir = () => {
    setFilas((actuales) => [...actuales, siguiente.current]);
    siguiente.current += 1;
  };

  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)} aria-haspopup="dialog">
        Devolver con observaciones
      </Boton>
      <Dialogo
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo="Devolver con observaciones"
        className="m-auto w-full max-w-md rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
      >
        <form action={enviar} onSubmit={alEnviar} className="flex flex-col gap-4 p-5">
          <Ocultos tramite={tramite} />
          <p className="text-sm text-muted-foreground">
            El documento vuelve a elaboración, en una ronda nueva, y pasa otra vez por revisión.
          </p>
          {filas.map((fila, i) => (
            <div key={fila} className="flex flex-col gap-1">
              <label htmlFor={`observacion-${fila}`} className="text-sm font-medium">
                {`Observación ${i + 1}`}
              </label>
              <textarea
                id={`observacion-${fila}`}
                name="observaciones"
                required
                minLength={5}
                maxLength={2000}
                rows={3}
                className={claseControl}
              />
              {filas.length > 1 ? (
                <div>
                  <Boton
                    variante="fantasma"
                    tamano="sm"
                    aria-label={`Quitar la observación ${i + 1}`}
                    onClick={() => setFilas((actuales) => actuales.filter((f) => f !== fila))}
                  >
                    Quitar
                  </Boton>
                </div>
              ) : null}
            </div>
          ))}
          {filas.length < MAX_OBSERVACIONES_APROBACION ? (
            <div>
              <Boton variante="secundario" tamano="sm" onClick={anadir}>
                Añadir otra observación
              </Boton>
            </div>
          ) : null}
          <ErrorAccion estado={estado} />
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={() => setAbierto(false)}>
              Volver
            </Boton>
            <Boton type="submit" variante="peligro" pendiente={pendiente}>
              {pendiente ? "Procesando…" : "Devolver"}
            </Boton>
          </div>
        </form>
      </Dialogo>
    </>
  );
}

/**
 * La decisión de quien aprueba (spec 13A §10.4). Lo revisado queda arriba en solo lectura: la
 * lista y las observaciones las pinta el panel de revisión; aquí va el concepto que se apoya en
 * ellas. `acciones` dice qué puede hacer esta persona.
 */
export function PanelAprobacion({
  tramite,
  acciones,
  revisado,
  huella,
  pideCodigo,
}: {
  tramite: TramiteParaAprobar;
  acciones: Accion[];
  revisado: ConceptoRevisado | null;
  huella: string | null;
  pideCodigo: boolean;
}) {
  const eliminacion = tramite.tipo === "eliminar";
  const firma = {
    resumen: {
      documento: [tramite.codigo, tramite.titulo].filter(Boolean).join(" "),
      version: tramite.versionNumero,
      huella,
    },
    ocultos: { id: String(tramite.id), etapa: tramite.etapa, ronda: String(tramite.ronda) },
    pideCodigo,
  };

  return (
    <section
      aria-labelledby="titulo-aprobacion"
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs"
    >
      <h2 id="titulo-aprobacion" className="text-sm font-semibold">
        {eliminacion ? "Aprobar la eliminación" : "Aprobación"}
      </h2>
      {revisado ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">{`Concepto de ${revisado.persona ?? "quien revisó"}`}</h3>
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{revisado.concepto}</p>
        </div>
      ) : null}
      {eliminacion ? (
        <p className="text-sm text-muted-foreground">
          Si aprueba, un Administrador del SGC ejecuta la eliminación. La versión vigente sigue en circulación hasta entonces.
        </p>
      ) : null}
      <div className="flex flex-wrap items-start justify-end gap-2">
        {acciones.includes("negar_eliminacion") ? (
          <AccionEnDialogo
            tramite={tramite}
            accion={negarEliminacionAccion}
            etiqueta="Negar la eliminación"
            texto="La solicitud se cierra como rechazada y el documento sigue vigente."
            confirmar="Negar"
            pideMotivo
          />
        ) : null}
        {acciones.includes("devolver_aprobacion") ? <DevolverConObservaciones tramite={tramite} /> : null}
        {acciones.includes("aprobar") ? (
          <DialogoFirma titulo="Firmar como «Aprobó»" etiquetaBoton="Aprobar" accion={aprobarAccion} {...firma}>
            <CampoConcepto />
          </DialogoFirma>
        ) : null}
        {acciones.includes("aprobar_y_publicar") ? (
          <DialogoFirma
            titulo="Firmar como «Aprobó» y «Publicó»"
            etiquetaBoton={eliminacion ? "Aprobar y eliminar" : "Aprobar y publicar"}
            accion={aprobarYPublicarAccion}
            {...firma}
          >
            {eliminacion ? <p className="text-sm text-estado-critico-texto">Esta acción retira el documento de circulación</p> : null}
            <CampoConcepto />
          </DialogoFirma>
        ) : null}
      </div>
    </section>
  );
}
