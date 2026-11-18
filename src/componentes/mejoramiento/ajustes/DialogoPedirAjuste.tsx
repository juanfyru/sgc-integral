"use client";

import { useActionState, useState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { fechaDeDia } from "@/lib/mejoramiento/formato";
import { AVISO_SIN_PACIENTES, ETIQUETA_TIPO_ACCION, MIENTRAS_SE_DECIDE, textoDeUsuario, type UsuarioDeSelector } from "@/lib/mejoramiento/textos";
import { TIPOS_ACCION, type TipoAccion } from "@/lib/mejoramiento/tipos";
import { ErrorDelPaso, type AccionDelPaso } from "../pasos/Partes";

const CLASE_DIALOGO = "m-auto w-full max-w-lg rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40";

/**
 * «Pedir ajuste de fecha» de una actividad (spec 15 §10.6, maqueta 6): la fecha original, que se conserva siempre; la nueva, de
 * hoy en adelante; y la causa del retraso. Lo decide quien aprobó el plan y, mientras tanto, la actividad sigue contando como
 * vencida. El servidor vuelve a comprobar quién lo pide y cada fecha.
 */
export function DialogoPedirAjuste({
  hallazgoId,
  actividadId,
  etiqueta,
  fin,
  finOriginal,
  hoy,
  accion,
}: {
  hallazgoId: number;
  actividadId: number;
  etiqueta: string;
  fin: string;
  finOriginal: string | null;
  hoy: string;
  accion: AccionDelPaso;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const id = (c: string) => `ajuste-fecha-${actividadId}-${c}`;
  const titulo = `Pedir un ajuste de fecha de la actividad ${etiqueta}`;
  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)} aria-haspopup="dialog" aria-label={titulo}>
        Pedir ajuste de fecha
      </Boton>
      <Dialogo abierto={abierto} alCerrar={() => setAbierto(false)} titulo={titulo} className={CLASE_DIALOGO}>
        <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex max-h-[90vh] flex-col gap-4 overflow-y-auto p-5">
          <p aria-hidden="true" className="font-semibold">
            {titulo}
          </p>
          <input type="hidden" name="hallazgoId" value={hallazgoId} />
          <input type="hidden" name="tipo" value="reprogramar" />
          <input type="hidden" name="actividadId" value={actividadId} />
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Fecha original</dt>
            <dd>{`${fechaDeDia(finOriginal ?? fin)} (se conserva siempre)`}</dd>
            {finOriginal && finOriginal !== fin ? (
              <>
                <dt className="text-muted-foreground">Fin vigente</dt>
                <dd>{fechaDeDia(fin)}</dd>
              </>
            ) : null}
          </dl>
          <Campo etiqueta="Fecha nueva" nombre="finNuevo" id={id("fin")}>
            <input type="date" required min={hoy} max="2100-12-31" className={`${claseControl} w-full min-w-0`} />
          </Campo>
          <Campo etiqueta="Causa del retraso (al menos 10 caracteres)" nombre="causa" id={id("causa")} ayuda={AVISO_SIN_PACIENTES}>
            <textarea required minLength={10} maxLength={2000} rows={3} className={claseControl} />
          </Campo>
          <p className="text-sm text-muted-foreground">{MIENTRAS_SE_DECIDE}</p>
          <ErrorDelPaso estado={estado} />
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" pendiente={pendiente}>
              {pendiente ? "Pidiendo…" : "Pedir el ajuste"}
            </Boton>
          </div>
        </form>
      </Dialogo>
    </>
  );
}

type Opcion = { id: number; etiqueta: string; descripcion: string };

/**
 * «Pedir un ajuste» del plan aprobado desde la página del hallazgo (spec 15 §10.6), para un líder del proceso o el Admin SGC:
 * añadir una actividad (en una acción del plan o en una acción nueva, con su tipo, su descripción y las causas que ataca) o
 * cancelar una actividad sin terminar. Lo que no se eligió queda en un `fieldset` deshabilitado: no se envía. Se pide en un
 * diálogo, con la causa; cancelar se confirma con su propio botón. El servidor vuelve a comprobar quién lo pide y cada regla.
 */
export function DialogoAjusteDelPlan({
  hallazgoId,
  actividades,
  acciones,
  causas,
  tipoPropuesto,
  usuarios,
  hoy,
  accion,
}: {
  hallazgoId: number;
  /** Las actividades sin terminar de la ronda en curso que no tienen otro ajuste por decidir. */
  actividades: readonly Opcion[];
  /** Las acciones de la ronda en curso. */
  acciones: readonly Opcion[];
  causas: ReadonlyArray<{ id: number; orden: number; texto: string }>;
  /** El tipo que propone la clase del hallazgo para una acción nueva. */
  tipoPropuesto: TipoAccion;
  usuarios: ReadonlyArray<UsuarioDeSelector & { etiqueta?: string }>;
  hoy: string;
  accion: AccionDelPaso;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const [tipo, setTipo] = useState<"agregar" | "cancelar">("agregar");
  const [enAccion, setEnAccion] = useState<string>(acciones[0] ? String(acciones[0].id) : "nueva");
  const id = (c: string) => `ajuste-plan-${hallazgoId}-${c}`;
  const aviso = id("aviso");
  const nuevaAccion = enAccion === "nueva";
  return (
    <>
      <Boton variante="secundario" tamano="sm" onClick={() => setAbierto(true)} aria-haspopup="dialog">
        Pedir un ajuste
      </Boton>
      <Dialogo abierto={abierto} alCerrar={() => setAbierto(false)} titulo="Pedir un ajuste del plan" className={CLASE_DIALOGO}>
        <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex max-h-[90vh] flex-col gap-4 overflow-y-auto p-5">
          <p aria-hidden="true" className="font-semibold">
            Pedir un ajuste del plan
          </p>
          <input type="hidden" name="hallazgoId" value={hallazgoId} />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Qué ajuste pide</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="tipo" value="agregar" checked={tipo === "agregar"} onChange={() => setTipo("agregar")} className="size-4" />
              Añadir una actividad
            </label>
            {actividades.length > 0 ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="tipo" value="cancelar" checked={tipo === "cancelar"} onChange={() => setTipo("cancelar")} className="size-4" />
                Cancelar una actividad
              </label>
            ) : null}
          </fieldset>
          <p id={aviso} className="text-xs text-muted-foreground">
            {AVISO_SIN_PACIENTES}
          </p>

          <fieldset disabled={tipo !== "agregar"} hidden={tipo !== "agregar"} className="flex min-w-0 flex-col gap-3">
            <legend className="sr-only">La actividad que se añade</legend>
            <Campo etiqueta="En qué acción" nombre="accionId" id={id("accion")}>
              <select value={enAccion} onChange={(e) => setEnAccion(e.target.value)} className={claseControl}>
                {acciones.map((a) => (
                  <option key={a.id} value={a.id}>
                    {`${a.etiqueta} · ${a.descripcion}`}
                  </option>
                ))}
                <option value="nueva">Una acción nueva</option>
              </select>
            </Campo>
            <fieldset disabled={!nuevaAccion} hidden={!nuevaAccion} className="flex min-w-0 flex-col gap-3 rounded-md border border-linea-suave p-3">
              <legend className="px-1 text-sm font-medium">La acción nueva</legend>
              <Campo etiqueta="Tipo de acción" nombre="accionTipo" id={id("accion-tipo")}>
                <select defaultValue={tipoPropuesto} className={claseControl}>
                  {TIPOS_ACCION.map((t) => (
                    <option key={t} value={t}>
                      {ETIQUETA_TIPO_ACCION[t]}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta="Qué se va a hacer" nombre="accionDescripcion" id={id("accion-descripcion")} tambienDescritoPor={aviso}>
                <textarea required minLength={3} maxLength={2000} rows={2} className={claseControl} />
              </Campo>
              {causas.length > 0 ? (
                <fieldset className="flex min-w-0 flex-col gap-1">
                  <legend className="mb-1 text-sm font-medium">Causas que ataca (obligatoria en la correctiva)</legend>
                  {causas.map((c) => (
                    <label key={c.id} className="flex items-start gap-2 text-sm">
                      <input type="checkbox" name="causaIds" value={c.id} className="mt-0.5 size-4 shrink-0" />
                      <span className="break-words">{`La causa ${c.orden}: ${c.texto}`}</span>
                    </label>
                  ))}
                </fieldset>
              ) : null}
            </fieldset>
            <Campo etiqueta="La actividad nueva" nombre="descripcion" id={id("descripcion")} tambienDescritoPor={aviso}>
              <textarea required minLength={3} maxLength={1000} rows={2} className={claseControl} />
            </Campo>
            <Campo etiqueta="Responsable" nombre="responsableId" id={id("responsable")}>
              <select required defaultValue="" className={claseControl}>
                <option value="" disabled>
                  Elija a quién
                </option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {textoDeUsuario(u)}
                  </option>
                ))}
              </select>
            </Campo>
            {/* Dos columnas que pueden encogerse (390 px): el ancho propio de un campo de fecha no las desborda. */}
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
              <Campo etiqueta="Inicio" nombre="inicio" id={id("inicio")}>
                <input type="date" required min="2000-01-01" max="2100-12-31" defaultValue={hoy} className={`${claseControl} w-full min-w-0`} />
              </Campo>
              <Campo etiqueta="Fin" nombre="fin" id={id("fin")}>
                <input type="date" required min={hoy} max="2100-12-31" className={`${claseControl} w-full min-w-0`} />
              </Campo>
            </div>
          </fieldset>

          <fieldset disabled={tipo !== "cancelar"} hidden={tipo !== "cancelar"} className="flex min-w-0 flex-col gap-3">
            <legend className="sr-only">La actividad que se cancela</legend>
            <Campo etiqueta="Actividad" nombre="actividadId" id={id("actividad")}>
              <select required defaultValue="" className={claseControl}>
                <option value="" disabled>
                  Elija cuál
                </option>
                {actividades.map((a) => (
                  <option key={a.id} value={a.id}>
                    {`${a.etiqueta} · ${a.descripcion}`}
                  </option>
                ))}
              </select>
            </Campo>
            <p className="text-sm">Aprobada, la actividad queda «Cancelada» y no se puede deshacer. La última sin cancelar no se cancela.</p>
          </fieldset>

          <Campo etiqueta="Causa del ajuste (al menos 10 caracteres)" nombre="causa" id={id("causa")} tambienDescritoPor={aviso}>
            <textarea required minLength={10} maxLength={2000} rows={3} className={claseControl} />
          </Campo>
          <p className="text-sm text-muted-foreground">Lo decide quien aprobó el plan. Mientras se decide, el plan sigue como está.</p>
          <ErrorDelPaso estado={estado} />
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={() => setAbierto(false)}>
              Cerrar
            </Boton>
            <Boton type="submit" variante={tipo === "cancelar" ? "peligro" : "primario"} pendiente={pendiente}>
              {pendiente ? "Pidiendo…" : tipo === "cancelar" ? "Pedir que se cancele" : "Pedir que se añada"}
            </Boton>
          </div>
        </form>
      </Dialogo>
    </>
  );
}
