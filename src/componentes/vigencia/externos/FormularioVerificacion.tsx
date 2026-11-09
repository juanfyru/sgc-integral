"use client";

import { useActionState, useState } from "react";
import { verificarExternoAccion } from "@/app/acciones-vigencia";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { cuenta } from "@/lib/plural";
import { ETIQUETA_RESULTADO, RESULTADOS_VERIFICACION, type ResultadoVerificacion } from "@/lib/vigencia/tipos";

const control = `${claseControl} w-full min-w-0 max-w-full`;

const EFECTO: Record<ResultadoVerificacion, (meses: number) => string> = {
  vigente: (meses) => `La próxima verificación pasa a ${cuenta(meses, "mes", "meses")} después de hoy.`,
  edicion_nueva: () => "Lleva a «Adoptar edición nueva»: el documento queda en atención hasta adoptarla.",
  retirado: () => "Retira el documento: deja de aplicar y sus copias controladas quedan por recoger.",
};

/**
 * La verificación de vigencia (spec 13C §8.4, maqueta 7), sin clave: la fuente consultada, el resultado y una nota. La
 * hace el responsable técnico, también desde el celular: los tres resultados se ven siempre, cada uno con su efecto. Desde
 * la revisión anual llega con un resultado elegido (`resultadoInicial`, de `?verificar=`) o fijo (`resultadoFijo`:
 * «Ratificar» un externo es verificar que sigue vigente, en un paso) y, con `volver`, regresa a la tabla de decisiones.
 */
export function FormularioVerificacion({
  documentoId,
  fuenteOficial,
  verificacionMeses,
  impacto,
  resultadoInicial = "vigente",
  resultadoFijo,
  volver,
}: {
  documentoId: number;
  /** La fuente oficial del externo, como punto de partida. */
  fuenteOficial: string | null;
  verificacionMeses: number;
  /** El impacto normativo pendiente que esta verificación resuelve (llegó desde su página de impactos). */
  impacto?: { id: number; norma: string; proceso: string } | null;
  resultadoInicial?: ResultadoVerificacion;
  /** El único resultado que este formulario registra: no se elige. */
  resultadoFijo?: ResultadoVerificacion;
  /** La página a la que vuelve al registrar; sin ella, la del externo. */
  volver?: string;
}) {
  const [estado, enviar, pendiente] = useActionState(verificarExternoAccion, null);
  const [elegido, setResultado] = useState<ResultadoVerificacion>(resultadoInicial);
  const resultado = resultadoFijo ?? elegido;
  const retira = resultado === "retirado";

  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex min-w-0 flex-col gap-4">
      <input type="hidden" name="documentoId" value={documentoId} />
      {volver ? <input type="hidden" name="volver" value={volver} /> : null}
      {impacto ? (
        <>
          <input type="hidden" name="impactoId" value={impacto.id} />
          <p role="note" className="rounded-md bg-estado-atencion-fondo px-3 py-2 text-sm text-estado-atencion-texto">
            {`Revisión por cambio normativo · ${impacto.norma}. Al registrar la verificación, con cualquiera de sus tres resultados, queda resuelto el impacto en ${impacto.proceso}.`}
          </p>
        </>
      ) : null}
      <Campo etiqueta="Fuente consultada" nombre="fuente" ayuda="Dónde verificó: la dirección o el nombre del portal oficial.">
        <input required minLength={3} maxLength={300} defaultValue={fuenteOficial ?? ""} className={control} />
      </Campo>
      {resultadoFijo ? (
        <div className="min-w-0 text-sm">
          <input type="hidden" name="resultado" value={resultadoFijo} />
          <p>
            <span className="font-medium">{"Resultado: "}</span>
            {ETIQUETA_RESULTADO[resultadoFijo]}
          </p>
          <p className="text-xs text-muted-foreground">{EFECTO[resultadoFijo](verificacionMeses)}</p>
        </div>
      ) : (
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Resultado</legend>
          {RESULTADOS_VERIFICACION.map((r) => (
            <label
              key={r}
              className={`flex items-start gap-2 rounded-md border p-2 text-sm ${resultado === r ? "border-marca bg-muted" : "border-border"}`}
            >
              <input
                type="radio"
                name="resultado"
                value={r}
                checked={resultado === r}
                onChange={() => setResultado(r)}
                className="mt-0.5 size-4 shrink-0"
              />
              <span className="min-w-0">
                {ETIQUETA_RESULTADO[r]}
                <span className="block text-xs text-muted-foreground">{EFECTO[r](verificacionMeses)}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <Campo etiqueta="Nota (opcional)" nombre="nota" ayuda="Hasta 1000 caracteres. Por ejemplo, la edición que encontró.">
        <textarea rows={3} maxLength={1000} className={control} />
      </Campo>
      {retira ? (
        <p className="rounded-md bg-estado-critico-fondo px-3 py-2 text-sm text-estado-critico-texto">
          Al registrar, el documento externo queda retirado y se avisa a quienes lo aplican. No se deshace.
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">Queda en un registro inmutable: la fecha, quién, la fuente y el resultado.</p>
      <div className="flex flex-col items-stretch gap-2 sm:items-end">
        <ErrorAccion estado={estado} />
        <Boton type="submit" variante={retira ? "peligro" : "primario"} pendiente={pendiente}>
          {pendiente ? "Registrando…" : retira ? "Registrar verificación y retirar" : "Registrar verificación"}
        </Boton>
      </div>
    </form>
  );
}
