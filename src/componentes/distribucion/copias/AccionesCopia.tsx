"use client";

import { useActionState, useState } from "react";
import {
  anularCopiaAccion,
  confirmarRecibidoAccion,
  confirmarRecogidaAccion,
  confirmarReemplazoAccion,
} from "@/app/acciones-distribucion";
import type { EstadoAccion } from "@/app/admin/comun";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton, claseBoton, type VarianteBoton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import type { AccionCopia } from "@/db/consultas/distribucion/copias";
import {
  ETIQUETA_DESTINO,
  ETIQUETA_MOTIVO_ANULACION,
  ETIQUETA_MOTIVO_REIMPRESION,
  MOTIVOS_ANULACION,
  MOTIVOS_REIMPRESION,
} from "@/lib/distribucion/tipos";

type Accion = (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;

const CLASE_DIALOGO =
  "m-auto w-full max-w-md rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40";

function Formulario({
  accion,
  copiaId,
  titulo,
  etiquetaEnvio,
  tono,
  alCancelar,
  children,
}: {
  accion: Accion;
  copiaId: number;
  titulo: string;
  etiquetaEnvio: string;
  tono: VarianteBoton;
  alCancelar: () => void;
  children: React.ReactNode;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col gap-4 p-5">
      <input type="hidden" name="id" value={copiaId} />
      {/* El título para lectores de pantalla ya lo pone Dialogo. */}
      <p aria-hidden="true" className="font-semibold">
        {titulo}
      </p>
      {children}
      <ErrorAccion estado={estado} />
      <div className="flex flex-wrap justify-end gap-2">
        <Boton variante="secundario" onClick={alCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" variante={tono} pendiente={pendiente}>
          {pendiente ? "Procesando…" : etiquetaEnvio}
        </Boton>
      </div>
    </form>
  );
}

function BotonConDialogo({
  etiqueta,
  titulo,
  variante = "secundario",
  tonoEnvio = "primario",
  etiquetaEnvio,
  accion,
  copiaId,
  children,
}: {
  etiqueta: string;
  titulo: string;
  variante?: VarianteBoton;
  tonoEnvio?: VarianteBoton;
  etiquetaEnvio: string;
  accion: Accion;
  copiaId: number;
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton variante={variante} onClick={() => setAbierto(true)} aria-haspopup="dialog">
        {etiqueta}
      </Boton>
      <Dialogo abierto={abierto} alCerrar={() => setAbierto(false)} titulo={titulo} className={CLASE_DIALOGO}>
        {abierto ? (
          <Formulario
            accion={accion}
            copiaId={copiaId}
            titulo={titulo}
            etiquetaEnvio={etiquetaEnvio}
            tono={tonoEnvio}
            alCancelar={() => setAbierto(false)}
          >
            {children}
          </Formulario>
        ) : null}
      </Dialogo>
    </>
  );
}

function Destinos({ destinos, porDefecto }: { destinos: readonly ("devuelta" | "destruida" | "no_encontrada")[]; porDefecto?: "devuelta" }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">¿Qué se hizo con la copia?</legend>
      {destinos.map((d) => (
        <label key={d} className="flex items-center gap-2 text-sm">
          <input type="radio" name="destino" value={d} required defaultChecked={porDefecto === d} className="size-4" />
          {ETIQUETA_DESTINO[d]}
        </label>
      ))}
    </fieldset>
  );
}

function Recibir({ copiaId }: { copiaId: number }) {
  const [estado, enviar, pendiente] = useActionState(confirmarRecibidoAccion, null);
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col items-start gap-2">
      <input type="hidden" name="id" value={copiaId} />
      <Boton type="submit" pendiente={pendiente}>
        {pendiente ? "Procesando…" : "Confirmar el recibido"}
      </Boton>
      <ErrorAccion estado={estado} />
    </form>
  );
}

function Reimprimir({ copiaId }: { copiaId: number }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)} aria-haspopup="dialog">
        Reimprimir
      </Boton>
      <Dialogo abierto={abierto} alCerrar={() => setAbierto(false)} titulo="Reimprimir la copia" className={CLASE_DIALOGO}>
        {abierto ? (
          // Un formulario HTML corriente: la respuesta es el PDF y se abre en otra pestaña.
          <form
            method="post"
            action={`/distribucion/copias/${copiaId}/reimprimir`}
            target="_blank"
            onSubmit={() => setTimeout(() => setAbierto(false), 0)}
            className="flex flex-col gap-4 p-5"
          >
            <p aria-hidden="true" className="font-semibold">
              Reimprimir la copia
            </p>
            <p className="text-sm text-muted-foreground">
              Abre una ventana nueva de 15 minutos para imprimir el PDF. Queda registrado quién y por qué.
            </p>
            <Campo etiqueta="Motivo" nombre="motivo">
              <select required defaultValue="" className={claseControl}>
                <option value="" disabled>
                  Elija el motivo
                </option>
                {MOTIVOS_REIMPRESION.map((m) => (
                  <option key={m} value={m}>
                    {ETIQUETA_MOTIVO_REIMPRESION[m]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Explicación" nombre="texto" ayuda="Obligatoria si el motivo es «Otro motivo»">
              <textarea maxLength={300} rows={2} className={`${claseControl} w-full`} />
            </Campo>
            <div className="flex flex-wrap justify-end gap-2">
              <Boton variante="secundario" onClick={() => setAbierto(false)}>
                Cancelar
              </Boton>
              <Boton type="submit">Reimprimir y abrir el PDF</Boton>
            </div>
          </form>
        ) : null}
      </Dialogo>
    </>
  );
}

/**
 * Las acciones que la persona puede hacer sobre una copia, según lo que dice la consulta (`acciones`).
 * `reemplazo` es la copia por recoger que esta reemplaza: recibir una y retirar la otra es un solo gesto.
 */
export function AccionesCopia({
  copiaId,
  acciones,
  nuncaRecibida,
  reemplazo,
}: {
  copiaId: number;
  acciones: AccionCopia[];
  nuncaRecibida: boolean;
  reemplazo: { numero: string; version: number } | null;
}) {
  if (acciones.length === 0) return null;
  const tiene = (a: AccionCopia) => acciones.includes(a);
  return (
    <div className="flex flex-wrap items-start gap-2">
      {tiene("recibir") && reemplazo ? (
        <BotonConDialogo
          etiqueta={`Recibí esta y retiré la v${reemplazo.version}`}
          titulo={`Recibir esta copia y retirar la N.º ${reemplazo.numero} de la v${reemplazo.version}`}
          variante="primario"
          etiquetaEnvio="Confirmar"
          accion={confirmarReemplazoAccion}
          copiaId={copiaId}
        >
          <p className="text-sm text-muted-foreground">
            {`Confirma el recibido de esta copia y la recogida de la N.º ${reemplazo.numero} de la v${reemplazo.version}.`}
          </p>
          <Destinos destinos={["devuelta", "destruida"]} />
        </BotonConDialogo>
      ) : tiene("recibir") ? (
        <Recibir copiaId={copiaId} />
      ) : null}
      {tiene("recoger") ? (
        <BotonConDialogo
          etiqueta="Confirmar la recogida"
          titulo="Confirmar la recogida de la copia"
          variante="primario"
          etiquetaEnvio="Confirmar la recogida"
          accion={confirmarRecogidaAccion}
          copiaId={copiaId}
        >
          {nuncaRecibida ? (
            <p className="text-sm text-muted-foreground">
              Esta copia nunca se confirmó como recibida. Si no llegó a entregarse, elija «Devuelta al SGC»: «No se
              encontró» abre un hallazgo.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">«No se encontró» abre un hallazgo que debe corregirse.</p>
          )}
          <Destinos
            destinos={["devuelta", "destruida", "no_encontrada"]}
            porDefecto={nuncaRecibida ? "devuelta" : undefined}
          />
        </BotonConDialogo>
      ) : null}
      {tiene("pdf") ? (
        <a href={`/distribucion/copias/${copiaId}/pdf`} target="_blank" rel="noopener" className={claseBoton("secundario")}>
          Abrir el PDF
        </a>
      ) : null}
      {tiene("reimprimir") ? <Reimprimir copiaId={copiaId} /> : null}
      {tiene("anular") ? (
        <BotonConDialogo
          etiqueta="Anular"
          titulo="Anular la copia"
          variante="peligro"
          tonoEnvio="peligro"
          etiquetaEnvio="Anular la copia"
          accion={anularCopiaAccion}
          copiaId={copiaId}
        >
          <p className="text-sm text-muted-foreground">La copia deja de contar como entregada. No se puede deshacer.</p>
          <Campo etiqueta="Motivo" nombre="motivo">
            <select required defaultValue="" className={claseControl}>
              <option value="" disabled>
                Elija el motivo
              </option>
              {MOTIVOS_ANULACION.map((m) => (
                <option key={m} value={m}>
                  {ETIQUETA_MOTIVO_ANULACION[m]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Explicación (opcional)" nombre="texto">
            <textarea maxLength={300} rows={2} className={`${claseControl} w-full`} />
          </Campo>
        </BotonConDialogo>
      ) : null}
    </div>
  );
}
