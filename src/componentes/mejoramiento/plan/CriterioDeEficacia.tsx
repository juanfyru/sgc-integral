"use client";

import { useActionState, useState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { ETIQUETA_PERIODICIDAD, type Periodicidad } from "@/lib/indicadores/tipos";
import { fechaLargaDeDia } from "@/lib/mejoramiento/formato";
import { AVISO_SIN_PACIENTES, ETIQUETA_CRITERIO, INDICADOR_YA_NO_SE_ENLAZA } from "@/lib/mejoramiento/textos";
import { CRITERIOS_EFICACIA, type Clase, type CriterioEficacia as Criterio } from "@/lib/mejoramiento/tipos";
import { ErrorDeAnalisis, useGuardado, type AccionDeAnalisis } from "../analisis/Partes";

export type IndicadorElegible = { id: number; codigo: string; nombre: string; periodicidad: Periodicidad };

/** Cómo sale la fecha del aviso, según la clase (spec §11.3). */
const COMO_SE_CUENTA: Record<"no_conformidad" | "otra", string> = {
  no_conformidad:
    "Son dos meses después del fin de la última actividad o, con el indicador enlazado, el día siguiente a su segundo periodo completo después de ese fin: rige la fecha mayor.",
  otra: "Es la fecha de evaluación, o el fin de la última actividad si es posterior.",
};

/**
 * El criterio de eficacia de la ronda (spec 15 §11.2, maqueta 5): uno o más criterios; con «mejora del indicador», el
 * indicador enlazado (de los activos con ficha vigente que quien formula ve); con «otro», su descripción; en la observación y
 * la oportunidad, la fecha de evaluación. El aviso dice desde cuándo se podrá evaluar con las fechas guardadas del plan: lo
 * calcula el servidor (`examinarPlan`) y cambia al guardar.
 */
export function CriterioDeEficacia({
  hallazgoId,
  clase,
  criterios,
  criterioOtro,
  indicadorId,
  fechaEvaluacion,
  indicadores,
  evaluableDesde,
  guardar,
}: {
  hallazgoId: number;
  clase: Clase;
  criterios: readonly Criterio[];
  criterioOtro: string | null;
  indicadorId: number | null;
  fechaEvaluacion: string | null;
  indicadores: readonly IndicadorElegible[];
  evaluableDesde: string | null;
  guardar: AccionDeAnalisis;
}) {
  const [marcados, setMarcados] = useState<Criterio[]>(() => [...criterios]);
  const [estado, enviar, pendiente] = useActionState(guardar, null);
  const guardado = useGuardado(estado, pendiente);
  const alternar = (c: Criterio, si: boolean) => setMarcados((l) => (si ? [...l.filter((x) => x !== c), c] : l.filter((x) => x !== c)));
  const elegido = indicadorId !== null && indicadores.some((i) => i.id === indicadorId) ? indicadorId : null;
  const esNc = clase === "no_conformidad";

  return (
    <form
      action={enviar}
      onSubmit={enviarSinReiniciar(enviar)}
      aria-labelledby="criterio-titulo"
      className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-card p-4"
    >
      <h3 id="criterio-titulo" className="font-display text-base font-semibold">
        Criterio de eficacia
      </h3>
      <input type="hidden" name="hallazgoId" value={hallazgoId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Cómo se sabrá que las acciones fueron eficaces (uno o más)</legend>
        {CRITERIOS_EFICACIA.map((c) => (
          <label key={c} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="criterios"
              value={c}
              checked={marcados.includes(c)}
              onChange={(e) => alternar(c, e.target.checked)}
              className="size-4"
            />
            {ETIQUETA_CRITERIO[c]}
          </label>
        ))}
      </fieldset>
      {marcados.includes("mejora_indicador") ? (
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="criterio-indicador" className="text-sm font-medium">
            Indicador
          </label>
          <select id="criterio-indicador" name="indicadorEficaciaId" defaultValue={elegido ?? ""} className={`${claseControl} min-w-0`}>
            <option value="">Elija el indicador</option>
            {indicadores.map((i) => (
              <option key={i.id} value={i.id}>
                {`${i.codigo} ${i.nombre} · ${ETIQUETA_PERIODICIDAD[i.periodicidad].toLowerCase()}`}
              </option>
            ))}
          </select>
          {indicadorId !== null && elegido === null ? (
            <p className="text-xs text-estado-atencion-texto">{`${INDICADOR_YA_NO_SE_ENLAZA}.`}</p>
          ) : null}
          {indicadores.length === 0 ? <p className="text-xs text-muted-foreground">No hay indicadores activos que usted pueda enlazar.</p> : null}
        </div>
      ) : null}
      {marcados.includes("otro") ? (
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="criterio-otro" className="text-sm font-medium">
            Describa el otro criterio
          </label>
          <textarea
            id="criterio-otro"
            name="criterioOtro"
            rows={2}
            maxLength={500}
            defaultValue={criterioOtro ?? ""}
            aria-describedby="criterio-aviso"
            className={claseControl}
          />
        </div>
      ) : null}
      {!esNc ? (
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="criterio-fecha" className="text-sm font-medium">
            Fecha de evaluación
          </label>
          <input
            id="criterio-fecha"
            type="date"
            name="fechaEvaluacion"
            defaultValue={fechaEvaluacion ?? ""}
            aria-describedby="criterio-fecha-ayuda"
            className={`${claseControl} sm:max-w-xs`}
          />
          <p id="criterio-fecha-ayuda" className="text-xs text-muted-foreground">
            No anterior al fin de la última actividad.
          </p>
        </div>
      ) : null}
      <div className="rounded-md border border-linea-suave bg-muted px-3 py-2 text-sm">
        {evaluableDesde ? (
          <>
            <p>
              Con este plan la eficacia se podrá evaluar desde el <strong>{fechaLargaDeDia(evaluableDesde)}</strong>.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{COMO_SE_CUENTA[esNc ? "no_conformidad" : "otra"]}</p>
          </>
        ) : (
          <p>La fecha desde la que se podrá evaluar la eficacia aparece cuando el plan tenga actividades guardadas.</p>
        )}
      </div>
      <p id="criterio-aviso" className="text-xs text-muted-foreground">
        {AVISO_SIN_PACIENTES}
      </p>
      <ErrorDeAnalisis estado={estado} />
      <div className="flex flex-wrap items-center gap-3">
        <Boton type="submit" pendiente={pendiente}>
          {pendiente ? "Guardando…" : "Guardar el criterio"}
        </Boton>
        <span role="status" className="text-sm text-muted-foreground">
          {guardado ? "Guardado." : ""}
        </span>
      </div>
    </form>
  );
}
