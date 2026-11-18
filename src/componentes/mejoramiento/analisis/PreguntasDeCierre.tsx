"use client";

import { useActionState, useState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { AVISO_SIN_PACIENTES } from "@/lib/mejoramiento/textos";
import { ErrorDeAnalisis, useGuardado, type AccionDeAnalisis } from "./Partes";

export type RespuestasDeCierre = {
  similares: boolean | null;
  similaresDetalle: string | null;
  cambios: { documentos: boolean; riesgos: boolean; controles: boolean; descripcion: string | null } | null;
};

const hayCambios = (c: RespuestasDeCierre["cambios"]) => c !== null && (c.documentos || c.riesgos || c.controles);

/**
 * Las dos preguntas de cierre del análisis (spec 15 §9.3, ISO 10.2.1 b) 3, e) y f)): ¿hay no conformidades similares en otros
 * procesos?, y ¿se requieren cambios en documentos, riesgos o controles? La segunda la retoma el cierre (§11.5).
 */
export function PreguntasDeCierre({
  hallazgoId,
  respuestas,
  guardar,
}: {
  hallazgoId: number;
  respuestas: RespuestasDeCierre;
  guardar: AccionDeAnalisis;
}) {
  const [similares, setSimilares] = useState<"si" | "no" | "">(respuestas.similares === null ? "" : respuestas.similares ? "si" : "no");
  const [cambios, setCambios] = useState<"si" | "no" | "">(respuestas.cambios === null ? "" : hayCambios(respuestas.cambios) ? "si" : "no");
  const [estado, enviar, pendiente] = useActionState(guardar, null);
  const guardado = useGuardado(estado, pendiente);
  const c = respuestas.cambios;

  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} aria-labelledby="preguntas-titulo" className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <h3 id="preguntas-titulo" className="font-display text-base font-semibold">
        Preguntas de cierre
      </h3>
      <input type="hidden" name="hallazgoId" value={hallazgoId} />
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">¿Hay no conformidades similares en otros procesos?</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="similares" value="si" required checked={similares === "si"} onChange={() => setSimilares("si")} className="size-4" />
          Sí
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="similares" value="no" required checked={similares === "no"} onChange={() => setSimilares("no")} className="size-4" />
          No
        </label>
        {similares === "si" ? (
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="similares-detalle" className="text-sm font-medium">
              ¿Cuáles?
            </label>
            <textarea
              id="similares-detalle"
              name="similaresDetalle"
              rows={2}
              maxLength={1000}
              defaultValue={respuestas.similaresDetalle ?? ""}
              aria-describedby="preguntas-aviso"
              className={claseControl}
            />
          </div>
        ) : null}
      </fieldset>
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">¿Se requieren cambios en documentos, riesgos o controles?</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="hayCambios" value="si" required checked={cambios === "si"} onChange={() => setCambios("si")} className="size-4" />
          Sí
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="hayCambios" value="no" required checked={cambios === "no"} onChange={() => setCambios("no")} className="size-4" />
          No
        </label>
        {cambios === "si" ? (
          <>
            <p className="text-xs text-muted-foreground">Marque cada uno que aplique.</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="cambiosDocumentos" value="si" defaultChecked={c?.documentos ?? false} className="size-4" />
              Documentos
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="cambiosRiesgos" value="si" defaultChecked={c?.riesgos ?? false} className="size-4" />
              Matriz de riesgos
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="cambiosControles" value="si" defaultChecked={c?.controles ?? false} className="size-4" />
              Controles
            </label>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="cambios-descripcion" className="text-sm font-medium">
                Describa los cambios
              </label>
              <textarea
                id="cambios-descripcion"
                name="cambiosDescripcion"
                rows={3}
                maxLength={1000}
                defaultValue={c?.descripcion ?? ""}
                aria-describedby="preguntas-aviso"
                className={claseControl}
              />
            </div>
          </>
        ) : null}
      </fieldset>
      <p id="preguntas-aviso" className="text-xs text-muted-foreground">
        {AVISO_SIN_PACIENTES}
      </p>
      <ErrorDeAnalisis estado={estado} />
      <div className="flex flex-wrap items-center gap-3">
        <Boton type="submit" pendiente={pendiente}>
          {pendiente ? "Guardando…" : "Guardar las respuestas"}
        </Boton>
        <span role="status" className="text-sm text-muted-foreground">
          {guardado ? "Guardado." : ""}
        </span>
      </div>
    </form>
  );
}
