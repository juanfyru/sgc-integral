"use client";

import { useActionState, useState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { fechaDeDia } from "@/lib/mejoramiento/formato";
import { AVISO_SIN_PACIENTES, ETIQUETA_METODO_VERIFICACION } from "@/lib/mejoramiento/textos";
import { METODOS_DE_VERIFICACION } from "@/lib/mejoramiento/tipos";
import { ErrorDelPaso, type AccionDelPaso } from "./Partes";

/** Una actividad terminada de la ronda en curso, como la verifica quien no ejecutó. */
export type ActividadPorVerificar = {
  id: number;
  /** «A1.2». */
  etiqueta: string;
  descripcion: string;
  /** El día en que se terminó (`yyyy-mm-dd`). */
  terminadaEn: string | null;
  /** Cuántos archivos de evidencia tiene; nulo si quien mira no los ve. */
  evidencias: number | null;
};

type Decision = "conforme" | "devuelta";

const CASILLA = "mt-0.5 size-4 shrink-0 accent-marca focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/**
 * «Por verificar» (spec 15 §11.4, maqueta 7, PC-08): en un solo acto, quien no ejecutó marca cada actividad terminada como
 * conforme o la devuelve, con su nota (al menos diez caracteres, con el aviso de pacientes) y la fecha para corregirla (de hoy
 * en adelante), y dice cómo verificó (al menos una casilla). Cada fila manda `actividad` (su id) y su `decision_<id>`; la nota y
 * la fecha de una devuelta, `nota_<id>` y `corregir_<id>`. Los archivos de la verificación llegan como hijos.
 */
export function PasoVerificar({
  hallazgoId,
  actividades,
  hoy,
  accion,
  inicial = {},
  children,
}: {
  hallazgoId: number;
  actividades: readonly ActividadPorVerificar[];
  /** Hoy en la zona (`yyyy-mm-dd`): la fecha para corregir no puede ser anterior. */
  hoy: string;
  accion: AccionDelPaso;
  /** Lo que ya se eligió de cada actividad (p. ej. al volver de un rechazo); por omisión, nada. */
  inicial?: Readonly<Record<number, Decision>>;
  children?: React.ReactNode;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const [decisiones, setDecisiones] = useState<Readonly<Record<number, Decision>>>(inicial);
  const id = (c: string) => `verificar-${hallazgoId}-${c}`;
  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex min-w-0 flex-col gap-4">
      <input type="hidden" name="hallazgoId" value={hallazgoId} />
      <p className="text-sm">
        Revise cada actividad terminada: márquela conforme o devuélvala con una nota y una fecha para corregirla. Si devuelve alguna,
        vuelve a «En proceso» y el hallazgo a «En ejecución»; con todas conformes, pasa a la espera de la eficacia.
      </p>
      <ul className="flex list-none flex-col gap-3">
        {actividades.map((a) => {
          const decision = decisiones[a.id];
          return (
            <li key={a.id} className="min-w-0 rounded-md border border-linea-suave p-3">
              <input type="hidden" name="actividad" value={a.id} />
              <fieldset className="flex min-w-0 flex-col gap-2">
                <legend className="break-words text-sm">
                  <span className="font-semibold">{a.etiqueta}</span> {a.descripcion}
                </legend>
                <p className="text-xs text-muted-foreground">
                  {[
                    a.terminadaEn ? `Terminada el ${fechaDeDia(a.terminadaEn)}` : null,
                    a.evidencias === null ? null : `${a.evidencias} ${a.evidencias === 1 ? "archivo" : "archivos"} de evidencia`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {(
                    [
                      ["conforme", "Conforme"],
                      ["devuelta", "Devolver"],
                    ] as const
                  ).map(([valor, texto]) => (
                    <label key={valor} className="flex items-start gap-2 text-sm">
                      <input
                        type="radio"
                        name={`decision_${a.id}`}
                        value={valor}
                        required
                        checked={decision === valor}
                        onChange={() => setDecisiones((d) => ({ ...d, [a.id]: valor }))}
                        className={CASILLA}
                      />
                      {texto}
                    </label>
                  ))}
                </div>
                {decision === "devuelta" ? (
                  <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    <Campo
                      etiqueta={`Nota para quien la ejecutó (al menos 10 caracteres)`}
                      nombre={`nota_${a.id}`}
                      id={id(`nota-${a.id}`)}
                      ayuda={AVISO_SIN_PACIENTES}
                    >
                      <textarea required minLength={10} maxLength={1000} rows={2} className={claseControl} />
                    </Campo>
                    <Campo etiqueta="Corregir a más tardar el" nombre={`corregir_${a.id}`} id={id(`corregir-${a.id}`)}>
                      <input type="date" required min={hoy} className={`${claseControl} min-w-0`} />
                    </Campo>
                  </div>
                ) : null}
              </fieldset>
            </li>
          );
        })}
      </ul>
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Cómo se verificó (al menos uno)</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {METODOS_DE_VERIFICACION.map((m) => (
            <label key={m} className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="metodos" value={m} className={CASILLA} />
              {ETIQUETA_METODO_VERIFICACION[m]}
            </label>
          ))}
        </div>
      </fieldset>
      <Campo etiqueta="Nota de la verificación (opcional)" nombre="nota" id={id("nota")} ayuda={AVISO_SIN_PACIENTES}>
        <textarea maxLength={2000} rows={2} className={claseControl} />
      </Campo>
      {children}
      <ErrorDelPaso estado={estado} />
      <Boton type="submit" pendiente={pendiente} className="self-start">
        {pendiente ? "Guardando…" : "Guardar la verificación"}
      </Boton>
      <p className="text-xs text-muted-foreground">
        Verifica el Administrador del SGC o Control Interno que no ejecutó ninguna actividad de este hallazgo.
      </p>
    </form>
  );
}
