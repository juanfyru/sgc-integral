"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton, claseBoton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import type { ObjetivoElegible } from "@/db/consultas/mejoramiento/opciones";
import { ORIGENES, esExterno } from "@/lib/mejoramiento/origenes";
import { AVISO_SIN_PACIENTES } from "@/lib/mejoramiento/textos";
import type { Origen } from "@/lib/mejoramiento/tipos";
import { ErrorDelPaso, type AccionDelPaso } from "../pasos/Partes";

/** El plan que se edita, tal como lo lee su página. Las fechas, `AAAA-MM-DD`. */
export type PlanEnFormulario = {
  id: number;
  codigo: string;
  vigencia: number;
  nombre: string;
  origen: Origen;
  fechaEvento: string;
  objetivoTexto: string | null;
  objetivoId: number | null;
  /** El objetivo que tiene, con su clase («Institucional · …»), para no perderlo si ya no está activo. */
  objetivo: string | null;
  fechaLimiteEnte: string | null;
};

const valorDe = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/**
 * El formulario de un plan de mejoramiento (anexo §3.1 y §3.2): el nombre del evento, el origen, la fecha del evento, la vigencia
 * (solo al crearlo: está en el código), la fecha límite del ente (solo con un origen externo; obligatoria con «Ente de control»),
 * el objetivo escrito y un objetivo del maestro (los activos; el que ya tiene se conserva aunque se haya desactivado). Editar no
 * cambia ningún hallazgo del plan. El servidor lo vuelve a validar todo.
 */
export function FormularioPlan({
  accion,
  objetivos,
  plan,
  cancelar,
}: {
  accion: AccionDelPaso;
  objetivos: readonly ObjetivoElegible[];
  plan?: PlanEnFormulario;
  /** Adónde vuelve «Cancelar». */
  cancelar: string;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const v = estado?.ok === false ? estado.valores : undefined;
  const [origen, setOrigen] = useState<string>(valorDe(v?.origen) ?? plan?.origen ?? "");
  const externo = ORIGENES.some((o) => o.clave === origen) && esExterno(origen as Origen);
  // El objetivo que el plan ya tiene y ya no está activo: se ofrece tal cual para no quitárselo sin querer.
  const inactivo = plan?.objetivoId != null && !objetivos.some((o) => o.id === plan.objetivoId) ? plan : null;
  const valor = (campo: keyof PlanEnFormulario) => {
    const enviado = valorDe(v?.[campo]);
    if (enviado !== undefined) return enviado;
    const guardado = plan?.[campo];
    return guardado === null || guardado === undefined ? "" : String(guardado);
  };

  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex max-w-3xl flex-col gap-4 rounded-lg border border-border bg-card p-5">
      {plan ? <input type="hidden" name="id" value={plan.id} /> : null}
      <Campo
        etiqueta="Nombre del evento"
        nombre="nombre"
        id="plan-nombre"
        ayuda="La auditoría o el evento que origina el plan. Es la columna «Auditoría o evento» del Excel para el ente."
      >
        <input required minLength={5} maxLength={200} defaultValue={valor("nombre")} className={claseControl} />
      </Campo>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo etiqueta="Origen" nombre="origen" id="plan-origen" ayuda="Es el que el plan propone a los hallazgos que se registran en él.">
          <select required value={origen} onChange={(e) => setOrigen(e.target.value)} className={claseControl}>
            <option value="" disabled>
              Elija el origen
            </option>
            {ORIGENES.map((o) => (
              <option key={o.clave} value={o.clave}>
                {o.etiqueta}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Fecha del evento" nombre="fechaEvento" id="plan-fecha-evento">
          <input type="date" required min="2000-01-01" max="2100-12-31" defaultValue={valor("fechaEvento")} className={claseControl} />
        </Campo>
        {plan ? (
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-medium">Vigencia</span>
            <span className="py-2 text-sm">{`${plan.vigencia} · está en el código ${plan.codigo} y no cambia`}</span>
          </div>
        ) : (
          <Campo etiqueta="Vigencia (opcional)" nombre="vigencia" id="plan-vigencia" ayuda="Si la deja vacía, es el año de la fecha del evento.">
            <input type="number" inputMode="numeric" min={2000} max={2100} step={1} defaultValue={valorDe(v?.vigencia) ?? ""} className={claseControl} />
          </Campo>
        )}
        {externo ? (
          <Campo
            etiqueta={origen === "ente_control" ? "Fecha límite del ente" : "Fecha límite del ente (opcional)"}
            nombre="fechaLimiteEnte"
            id="plan-fecha-ente"
            ayuda="Se propone a los hallazgos que se registran en el plan."
          >
            <input
              type="date"
              required={origen === "ente_control"}
              min="2000-01-01"
              max="2100-12-31"
              defaultValue={valor("fechaLimiteEnte")}
              className={claseControl}
            />
          </Campo>
        ) : null}
      </div>
      <Campo etiqueta="Objetivo del plan (opcional)" nombre="objetivoTexto" id="plan-objetivo-texto" ayuda={AVISO_SIN_PACIENTES}>
        <textarea maxLength={1000} rows={3} defaultValue={valor("objetivoTexto")} className={claseControl} />
      </Campo>
      <Campo
        etiqueta="Objetivo de calidad o institucional (opcional)"
        nombre="objetivoId"
        id="plan-objetivo"
        ayuda="Se propone a los hallazgos que entran al plan y no tienen uno."
      >
        <select defaultValue={valor("objetivoId")} className={claseControl}>
          <option value="">Sin objetivo</option>
          {inactivo ? <option value={inactivo.objetivoId ?? ""}>{`${inactivo.objetivo ?? "El objetivo de hoy"} (ya no está activo)`}</option> : null}
          {objetivos.map((o) => (
            <option key={o.id} value={o.id}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      </Campo>
      <ErrorDelPaso estado={estado} />
      <div className="flex flex-wrap justify-end gap-2">
        <Link href={cancelar} className={`${claseBoton("secundario")} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca`}>
          Cancelar
        </Link>
        <Boton type="submit" pendiente={pendiente}>
          {plan ? (pendiente ? "Guardando…" : "Guardar los cambios") : pendiente ? "Creando…" : "Crear el plan"}
        </Boton>
      </div>
    </form>
  );
}
