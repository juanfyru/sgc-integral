"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton, claseBoton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { AVISO_SIN_PACIENTES } from "@/lib/mejoramiento/textos";
import { ErrorDelPaso, type AccionDelPaso } from "../pasos/Partes";

/**
 * «Registrar seguimiento» de una actividad (spec 15 §10.3, maqueta 6): qué se hizo, el avance (un entero de 0 a 100 que no
 * baja del seguimiento anterior, salvo con la actividad devuelta), la fecha (de hoy hacia atrás) y las barreras. La evidencia
 * se adjunta aparte, en la zona de carga. El servidor vuelve a comprobar cada regla. La página lo vuelve a montar tras guardar.
 */
export function FormularioSeguimiento({
  actividadId,
  hoy,
  avanceActual,
  avanceMinimo,
  accion,
}: {
  actividadId: number;
  hoy: string;
  avanceActual: number;
  avanceMinimo: number;
  accion: AccionDelPaso;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const id = (c: string) => `seguimiento-${actividadId}-${c}`;
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex min-w-0 flex-col gap-3">
      <input type="hidden" name="actividadId" value={actividadId} />
      <p id={id("aviso")} className="text-xs text-muted-foreground">
        {AVISO_SIN_PACIENTES}
      </p>
      <Campo etiqueta="Qué se hizo (al menos 10 caracteres)" nombre="realizado" id={id("realizado")} tambienDescritoPor={id("aviso")}>
        <textarea required minLength={10} maxLength={4000} rows={3} className={claseControl} />
      </Campo>
      {/* Dos columnas que pueden encogerse (390 px): el ancho propio de un campo de fecha o de número no las desborda. */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <Campo
          etiqueta="Avance (%)"
          nombre="avance"
          id={id("avance")}
          ayuda={avanceMinimo > 0 ? `No puede ser menor que ${avanceMinimo} %, el del seguimiento anterior.` : undefined}
        >
          <input
            type="number"
            required
            min={avanceMinimo}
            max={100}
            step={1}
            inputMode="numeric"
            defaultValue={avanceActual}
            className={`${claseControl} w-full min-w-0`}
          />
        </Campo>
        <Campo etiqueta="Fecha" nombre="fecha" id={id("fecha")}>
          <input type="date" required min="2000-01-01" max={hoy} defaultValue={hoy} className={`${claseControl} w-full min-w-0`} />
        </Campo>
      </div>
      <Campo etiqueta="Barreras (opcional)" nombre="barreras" id={id("barreras")} tambienDescritoPor={id("aviso")}>
        <textarea maxLength={2000} rows={2} className={claseControl} />
      </Campo>
      <ErrorDelPaso estado={estado} />
      <Boton type="submit" pendiente={pendiente} className="self-start">
        {pendiente ? "Guardando…" : "Guardar seguimiento"}
      </Boton>
    </form>
  );
}

/**
 * A dónde va el foco cuando cambia la confirmación de «Terminar»: al abrirla, a «Sí, terminarla»; al cancelarla, de vuelta a
 * «Terminar» (el control que la abrió). Al montar, a ninguno: la página no roba el foco.
 */
export function focoDeLaConfirmacion(confirmando: boolean, seAbrio: boolean): "confirmar" | "terminar" | null {
  if (confirmando) return "confirmar";
  return seAbrio ? "terminar" : null;
}

/**
 * «Terminar» la actividad (spec §10.4): dice lo que falta (el avance en 100 y al menos un archivo de evidencia) y pide
 * confirmarlo, porque una actividad terminada ya no admite seguimientos ni archivos. El foco sigue a la confirmación
 * (`focoDeLaConfirmacion`). El servidor vuelve a comprobarlo.
 */
export function TerminarActividad({ actividadId, faltan, accion }: { actividadId: number; faltan: readonly string[]; accion: AccionDelPaso }) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const [confirmando, setConfirmando] = useState(false);
  const seAbrio = useRef(false);
  const terminar = useRef<HTMLButtonElement>(null);
  const confirmar = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const foco = focoDeLaConfirmacion(confirmando, seAbrio.current);
    if (confirmando) seAbrio.current = true;
    if (foco === "confirmar") confirmar.current?.focus();
    if (foco === "terminar") terminar.current?.focus();
  }, [confirmando]);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {faltan.length > 0 ? (
        <p className="rounded-md border border-estado-atencion bg-estado-atencion-fondo px-3 py-2 text-sm text-estado-atencion-texto">
          {`Para terminar hace falta ${faltan.join(" y ")}.`}
        </p>
      ) : null}
      {confirmando ? (
        <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col gap-2">
          <input type="hidden" name="actividadId" value={actividadId} />
          <p className="text-sm">Una actividad terminada ya no admite seguimientos ni archivos. ¿La termina?</p>
          <div className="flex flex-wrap gap-2">
            <button ref={confirmar} type="submit" disabled={pendiente} aria-busy={pendiente ? true : undefined} className={claseBoton("primario")}>
              {pendiente ? "Terminando…" : "Sí, terminarla"}
            </button>
            <Boton variante="secundario" onClick={() => setConfirmando(false)}>
              Cancelar
            </Boton>
          </div>
        </form>
      ) : (
        <button ref={terminar} type="button" onClick={() => setConfirmando(true)} className={`${claseBoton("secundario")} self-start`}>
          Terminar
        </button>
      )}
      <ErrorDelPaso estado={estado} />
    </div>
  );
}
