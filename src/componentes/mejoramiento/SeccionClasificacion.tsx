"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import type { DetalleDeHallazgo } from "@/db/consultas/mejoramiento/lectura";
import type { ObjetivoElegible } from "@/db/consultas/mejoramiento/opciones";
import type { PlanElegible } from "@/db/consultas/mejoramiento/planes-lectura";
import { rutaDePlan } from "@/lib/mejoramiento/rutas";
import { AVISO_SIN_PACIENTES } from "@/lib/mejoramiento/textos";
import { DialogoSacarDelPlan } from "./planes/DialogoSacarDelPlan";
import { ErrorDelPaso, type AccionDelPaso } from "./pasos/Partes";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const CLASE_DIALOGO = "m-auto w-full max-w-lg rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40";

type Acciones = { poner: AccionDelPaso; cambiar: AccionDelPaso; sacar: AccionDelPaso; objetivo: AccionDelPaso };

/** Un diálogo de la sección: su botón, su título y el formulario con su error y sus dos botones. */
function DialogoDeClasificacion({
  boton,
  titulo,
  confirmar,
  accion,
  children,
}: {
  boton: string;
  titulo: string;
  confirmar: string;
  accion: AccionDelPaso;
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, enviar, pendiente] = useActionState(accion, null);
  return (
    <>
      <Boton variante="secundario" tamano="sm" onClick={() => setAbierto(true)} aria-haspopup="dialog">
        {boton}
      </Boton>
      <Dialogo abierto={abierto} alCerrar={() => setAbierto(false)} titulo={titulo} className={CLASE_DIALOGO}>
        <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex max-h-[90vh] flex-col gap-4 overflow-y-auto p-5">
          <p aria-hidden="true" className="font-semibold">
            {titulo}
          </p>
          {children}
          <ErrorDelPaso estado={estado} />
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" pendiente={pendiente}>
              {confirmar}
            </Boton>
          </div>
        </form>
      </Dialogo>
    </>
  );
}

/**
 * El plan al que se lleva el hallazgo y, si ese plan propone su objetivo y el hallazgo no tiene uno, la casilla para recibirlo
 * (marcada por omisión; desmarcada, la acción manda «no»). Sin objetivo que proponer no aparece: se ignoraría.
 */
function ElegirPlan({ id, planes, sinObjetivo }: { id: string; planes: readonly PlanElegible[]; sinObjetivo: boolean }) {
  const [elegido, setElegido] = useState("");
  const propone = sinObjetivo && planes.some((p) => String(p.id) === elegido && p.proponeObjetivo);
  return (
    <>
      <Campo etiqueta="Plan" nombre="planId" id={`${id}-plan`}>
        <select required value={elegido} onChange={(e) => setElegido(e.target.value)} className={claseControl}>
          <option value="" disabled>
            Elija el plan
          </option>
          {planes.map((p) => (
            <option key={p.id} value={p.id}>{`${p.codigo} · ${p.nombre}`}</option>
          ))}
        </select>
      </Campo>
      {propone ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="conObjetivo" value="si" defaultChecked className="mt-0.5 size-4 shrink-0 accent-marca" />
          <span>Poner al hallazgo el objetivo del plan</span>
        </label>
      ) : null}
    </>
  );
}

/**
 * «Clasificación» en la página de un hallazgo (anexo §3.4 y §10.4): su plan y su objetivo. El plan se nombra con enlace solo a
 * quien lo ve; quien ve el hallazgo solo por su actividad lee su código y su nombre, sin enlace (F15B-DC9). Quien tiene
 * `mejora.planes` (`puedeClasificar`) pone el hallazgo en un plan, lo cambia de plan o lo saca, y pone, cambia o quita su objetivo,
 * en cualquier estado; uno anulado o rechazado no entra a un plan (`cuenta`), pero sí sale. Es clasificación: no avisa a nadie.
 */
export function SeccionClasificacion({
  hallazgoId,
  codigo,
  clasificacion: c,
  cuenta,
  planes = [],
  objetivos = [],
  acciones,
}: {
  hallazgoId: number;
  codigo: string;
  clasificacion: DetalleDeHallazgo["clasificacion"];
  /** Si el hallazgo cuenta para un plan (ni anulado ni rechazado): solo así se pone en uno o se cambia de plan. */
  cuenta: boolean;
  /** Los planes no anulados, para poner o cambiar; llegan solo a quien clasifica. */
  planes?: readonly PlanElegible[];
  /** Los objetivos activos del maestro. */
  objetivos?: readonly ObjetivoElegible[];
  acciones?: Acciones;
}) {
  const id = `clasificacion-${hallazgoId}`;
  const clasifica = c.puedeClasificar && acciones !== undefined;
  const otros = planes.filter((p) => p.id !== c.plan?.id);
  const sinObjetivo = c.objetivoId === null;
  const objetivoInactivo = c.objetivoId !== null && !objetivos.some((o) => o.id === c.objetivoId);
  return (
    <section aria-labelledby={`${id}-titulo`} className="rounded-lg border border-border bg-card p-4">
      <h2 id={`${id}-titulo`} className="font-display text-base font-semibold">
        Clasificación
      </h2>
      <dl className="mt-2 flex flex-col gap-2">
        <div className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground">Plan de mejoramiento</dt>
          <dd className="break-words text-sm">
            {c.plan === null ? (
              "Sin plan"
            ) : c.plan.enlace ? (
              <>
                <Link href={rutaDePlan(c.plan.id)} className={`rounded-sm font-mono text-xs font-medium text-marca underline-offset-2 hover:underline ${FOCO}`}>
                  {c.plan.codigo}
                </Link>{" "}
                {c.plan.nombre}
              </>
            ) : (
              <>
                <span className="font-mono text-xs">{c.plan.codigo}</span> {c.plan.nombre}
              </>
            )}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground">Objetivo</dt>
          <dd className="break-words text-sm">{c.objetivo ?? "Sin objetivo"}</dd>
        </div>
      </dl>
      {clasifica && acciones ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {c.plan === null && cuenta && planes.length > 0 ? (
            <DialogoDeClasificacion boton="Poner en un plan" titulo={`Poner ${codigo} en un plan`} confirmar="Poner en el plan" accion={acciones.poner}>
              <input type="hidden" name="hallazgoIds" value={hallazgoId} />
              <p className="text-sm">El hallazgo conserva su origen, su fuente y su fecha del ente. No se avisa a nadie.</p>
              <ElegirPlan id={`${id}-poner`} planes={planes} sinObjetivo={sinObjetivo} />
            </DialogoDeClasificacion>
          ) : null}
          {c.plan !== null && cuenta && otros.length > 0 ? (
            <DialogoDeClasificacion boton="Cambiar de plan" titulo={`Cambiar ${codigo} de plan`} confirmar="Cambiar de plan" accion={acciones.cambiar}>
              <input type="hidden" name="hallazgoId" value={hallazgoId} />
              <p className="text-sm">{`Sale del plan ${c.plan.codigo} y entra al que elija, con el mismo motivo en el historial de los dos.`}</p>
              <ElegirPlan id={`${id}-cambiar`} planes={otros} sinObjetivo={sinObjetivo} />
              <Campo etiqueta="Motivo (al menos 10 caracteres)" nombre="motivo" id={`${id}-cambiar-motivo`} ayuda={AVISO_SIN_PACIENTES}>
                <textarea required minLength={10} maxLength={1000} rows={3} className={claseControl} />
              </Campo>
            </DialogoDeClasificacion>
          ) : null}
          {c.plan !== null ? (
            <DialogoSacarDelPlan hallazgoId={hallazgoId} codigo={codigo} plan={c.plan.codigo} accion={acciones.sacar} lugar="hallazgo" />
          ) : null}
          <DialogoDeClasificacion
            boton={c.objetivoId === null ? "Poner un objetivo" : "Cambiar el objetivo"}
            titulo={`El objetivo de ${codigo}`}
            confirmar="Guardar el objetivo"
            accion={acciones.objetivo}
          >
            <input type="hidden" name="hallazgoId" value={hallazgoId} />
            <Campo etiqueta="Objetivo de calidad o institucional" nombre="objetivoId" id={`${id}-objetivo`}>
              <select defaultValue={c.objetivoId === null ? "" : String(c.objetivoId)} className={claseControl}>
                <option value="">Sin objetivo</option>
                {objetivoInactivo ? <option value={c.objetivoId ?? ""}>{`${c.objetivo ?? "El objetivo de hoy"} (ya no está activo)`}</option> : null}
                {objetivos.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
          </DialogoDeClasificacion>
        </div>
      ) : null}
    </section>
  );
}
