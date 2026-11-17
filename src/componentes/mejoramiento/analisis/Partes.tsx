"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { AVISO_SIN_PACIENTES } from "@/lib/mejoramiento/textos";

/** Una acción del análisis: la Server Action que recibe el formulario. */
export type AccionDeAnalisis = (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;

/** Un análisis ya guardado de la ronda. */
export type AnalisisGuardado = {
  id: number;
  metodo: string;
  equipo: string | null;
  observaciones: string | null;
  contenido: unknown;
};

/**
 * Cuándo terminó de guardarse algo: `pendiente` pasó a falso sin error. La acción no devuelve un mensaje de éxito (la página
 * se vuelve a leer), así que el formulario lo dice por su cuenta; `alGuardar` avisa a quien lo contiene.
 */
export function useGuardado(estado: EstadoAccion, pendiente: boolean, alGuardar?: () => void): boolean {
  const [guardado, setGuardado] = useState(false);
  const [iba, setIba] = useState(false);
  // Se ajusta durante el render (el patrón de React para derivar estado de un cambio de `pendiente`), no en un efecto.
  if (pendiente !== iba) {
    setIba(pendiente);
    setGuardado(!pendiente && estado?.ok !== false);
  }
  const aviso = useRef(alGuardar);
  useEffect(() => {
    aviso.current = alGuardar;
  });
  useEffect(() => {
    if (guardado) aviso.current?.();
  }, [guardado]);
  return guardado;
}

/** Quitar un análisis ya guardado: su propia acción, aparte de la del formulario. `quitar` es nulo en un borrador sin guardar. */
export function useQuitar(accion: AccionDeAnalisis, hallazgoId: number, analisisId: number | null) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const quitar =
    analisisId === null
      ? undefined
      : () => {
          const datos = new FormData();
          datos.set("hallazgoId", String(hallazgoId));
          datos.set("analisisId", String(analisisId));
          startTransition(() => enviar(datos));
        };
  return { estado, pendiente, quitar };
}

export function ErrorDeAnalisis({ estado }: { estado: EstadoAccion }) {
  if (estado?.ok !== false) return null;
  return (
    <p role="alert" className="rounded-md border border-estado-critico/40 bg-estado-critico-fondo px-3 py-2 text-sm text-estado-critico-texto">
      {estado.error}
    </p>
  );
}

/** El equipo y las observaciones, comunes a todo método (spec §9.1). */
export function CamposComunes({ idBase, equipo, observaciones }: { idBase: string; equipo: string | null; observaciones: string | null }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Campo etiqueta="Equipo que hizo el análisis" nombre="equipo" id={`${idBase}-equipo`}>
        <input type="text" maxLength={500} defaultValue={equipo ?? ""} className={claseControl} />
      </Campo>
      <Campo etiqueta="Observaciones" nombre="observaciones" id={`${idBase}-observaciones`} ayuda={AVISO_SIN_PACIENTES}>
        <textarea maxLength={2000} rows={2} defaultValue={observaciones ?? ""} className={claseControl} />
      </Campo>
    </div>
  );
}

/** El pie de un formulario de análisis: guardar (con su confirmación) y, si ya está guardado, quitarlo. */
export function PieDelAnalisis({
  pendiente,
  guardado,
  alQuitar,
  quitando,
}: {
  pendiente: boolean;
  guardado: boolean;
  alQuitar?: () => void;
  quitando?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Boton type="submit" pendiente={pendiente}>
        {pendiente ? "Guardando…" : "Guardar el análisis"}
      </Boton>
      {alQuitar ? (
        <Boton variante="peligro" pendiente={quitando} onClick={alQuitar}>
          {quitando ? "Quitando…" : "Quitar este análisis"}
        </Boton>
      ) : null}
      <span role="status" className="text-sm text-muted-foreground">
        {guardado ? "Guardado." : ""}
      </span>
    </div>
  );
}
