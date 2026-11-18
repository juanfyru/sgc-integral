"use client";

import { useState } from "react";
import { guardarConfigMejoraAccion } from "@/app/admin/acciones-mejoramiento";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { useAccionDeDialogo } from "@/componentes/indicadores/admin/useAccionDeDialogo";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import type { ConfigMejora } from "@/db/consultas/mejoramiento/config";

const CONTROL = `${claseControl} w-full min-w-0 max-w-full`;

const PLAZOS: ReadonlyArray<{ paso: keyof ConfigMejora["plazos"]; etiqueta: string; ayuda: string }> = [
  { paso: "clasificar", etiqueta: "Clasificar un reporte", ayuda: "Corre desde el reporte." },
  { paso: "aceptar", etiqueta: "Aceptar o rechazar", ayuda: "Corre desde el registro." },
  { paso: "decision", etiqueta: "Pasos de una sola decisión", ayuda: "Retirar o sostener, arbitrar, decidir la acción correctiva, validar la corrección, decidir un ajuste y cerrar." },
  { paso: "correccion", etiqueta: "Registrar la corrección", ayuda: "Corre desde la aceptación." },
  { paso: "formular", etiqueta: "Formular la causa raíz y el plan", ayuda: "Corre desde el registro del hallazgo." },
  { paso: "reenviar", etiqueta: "Reenviar un plan devuelto", ayuda: "Corre desde la devolución." },
  { paso: "revisar", etiqueta: "Revisar el plan", ayuda: "Corre desde el envío." },
  { paso: "aprobar", etiqueta: "Aprobar el plan", ayuda: "Corre desde la revisión." },
  { paso: "verificar", etiqueta: "Verificar la implementación", ayuda: "Corre desde que el hallazgo pasa a «Por verificar»." },
  { paso: "evaluar", etiqueta: "Evaluar la eficacia", ayuda: "Corre desde la fecha mínima de eficacia." },
];

/** Los plazos de cada paso (en días hábiles) y los dos recordatorios (en días calendario), spec 15 §13.1. */
export function FormularioPlazos({ config }: { config: ConfigMejora }) {
  const [guardado, setGuardado] = useState(false);
  const [estado, enviar, pendiente] = useAccionDeDialogo(guardarConfigMejoraAccion, () => setGuardado(true));
  const v = estado?.valores;
  const valor = (nombre: string, guardadoEnBd: number) => (typeof v?.[nombre] === "string" ? (v[nombre] as string) : guardadoEnBd);
  return (
    <section aria-labelledby="titulo-plazos" className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 id="titulo-plazos" className="text-base font-semibold">
          Plazos y recordatorios
        </h2>
        <p className="text-sm text-muted-foreground">
          En días hábiles: de lunes a viernes, sin los festivos de Colombia ni los días no hábiles del calendario de la entidad. El día del hecho no
          cuenta.
        </p>
      </div>
      <form
        action={enviar}
        onSubmit={(e) => {
          setGuardado(false);
          enviarSinReiniciar(enviar)(e);
        }}
        className="flex flex-col gap-4"
      >
        <input type="hidden" name="bloque" value="plazos" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PLAZOS.map((p) => (
            <Campo key={p.paso} etiqueta={`${p.etiqueta} (días hábiles)`} nombre={`plazo_${p.paso}`} id={`mej-plazo-${p.paso}`} ayuda={`${p.ayuda} De 1 a 60.`}>
              <input type="number" required min={1} max={60} step={1} defaultValue={valor(`plazo_${p.paso}`, config.plazos[p.paso])} className={CONTROL} />
            </Campo>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo
            etiqueta="Seguimiento de una no conformidad de criticidad alta (días calendario)"
            nombre="recordatorioAltaDias"
            id="mej-recordatorio-alta"
            ayuda="Una actividad iniciada sin seguimiento en estos días se le recuerda a su responsable. De 1 a 365."
          >
            <input type="number" required min={1} max={365} step={1} defaultValue={valor("recordatorioAltaDias", config.recordatorioAltaDias)} className={CONTROL} />
          </Campo>
          <Campo etiqueta="Seguimiento de los demás hallazgos (días calendario)" nombre="recordatorioDias" id="mej-recordatorio" ayuda="Igual que el anterior, para las demás clases y criticidades. De 1 a 365.">
            <input type="number" required min={1} max={365} step={1} defaultValue={valor("recordatorioDias", config.recordatorioDias)} className={CONTROL} />
          </Campo>
        </div>
        {estado ? (
          <p role="alert" className="text-sm text-estado-critico-texto">
            {estado.error}
          </p>
        ) : null}
        {guardado && !estado ? (
          <p role="status" className="text-sm text-estado-bien-texto">
            Plazos guardados.
          </p>
        ) : null}
        <Boton type="submit" pendiente={pendiente} className="self-start">
          {pendiente ? "Guardando…" : "Guardar los plazos"}
        </Boton>
      </form>
    </section>
  );
}
