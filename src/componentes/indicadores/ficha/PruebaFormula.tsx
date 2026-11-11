"use client";

import { Insignia } from "@/componentes/ui/Insignia";
import { calcular } from "@/lib/indicadores/calculo";
import { analizar } from "@/lib/indicadores/formula/analizar";
import { TEXTO_MOTIVO } from "@/lib/indicadores/formula/evaluar";
import { fraccion, type Fraccion } from "@/lib/indicadores/formula/fraccion";
import type { Regla } from "@/lib/indicadores/semaforo";
import { fraseDeResultado, type Unidad } from "@/lib/indicadores/textos";
import { ETIQUETA_SEMAFORO } from "@/lib/indicadores/tipos";

const CONTROL =
  "w-full min-w-0 rounded-md border border-border bg-card px-3 py-2 text-foreground outline-none focus:border-marca focus:ring-2 focus:ring-marca/20";

/**
 * «Prueba» (spec §7.4 y §12.4): valores de ejemplo para cada variable, con el resultado, el color y la frase, calculados
 * con el mismo `calcular` del servidor. Con todos los valores, los guarda en el campo `prueba`: enviar a aprobación la
 * exige.
 */
export function PruebaFormula({
  formula,
  variables,
  regla,
  unidad,
  resultadoMin,
  resultadoMax,
  valores,
  alCambiar,
}: {
  formula: string;
  variables: { letra: string; etiqueta: string }[];
  regla: Regla;
  unidad: Unidad;
  resultadoMin: string;
  resultadoMax: string;
  valores: Record<string, string>;
  alCambiar: (letra: string, valor: string) => void;
}) {
  const analisis = analizar(formula);
  const leidos: Record<string, Fraccion | undefined> = {};
  for (const v of variables) {
    const f = fraccion((valores[v.letra] ?? "").trim());
    if (f) leidos[v.letra] = f;
  }
  const completo = variables.length > 0 && variables.every((v) => leidos[v.letra] !== undefined);
  const resultado =
    analisis.ok && completo
      ? calcular(
          { arbol: analisis.arbol, letras: variables.map((v) => v.letra), resultadoMin: fraccion(resultadoMin.trim()), resultadoMax: fraccion(resultadoMax.trim()) },
          leidos,
          regla,
        )
      : null;
  const guardar = completo ? JSON.stringify({ valores: Object.fromEntries(variables.map((v) => [v.letra, valores[v.letra].trim()])) }) : null;

  return (
    <fieldset className="min-w-0 rounded-md border border-l-4 border-border border-l-mod-indicadores px-3 py-2 text-sm">
      <legend className="px-1 font-medium">Prueba</legend>
      <p className="text-xs text-muted-foreground">Escriba valores de ejemplo: el resultado sale con la fórmula de la ficha.</p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {variables.map((v) => (
          <div key={v.letra} className="flex min-w-0 flex-col gap-1">
            <label htmlFor={`ficha-prueba-${v.letra}`} className="text-xs font-medium">
              {`Ejemplo de ${v.etiqueta}`}
            </label>
            <input
              id={`ficha-prueba-${v.letra}`}
              inputMode="decimal"
              value={valores[v.letra] ?? ""}
              onChange={(e) => alCambiar(v.letra, e.target.value)}
              className={CONTROL}
            />
          </div>
        ))}
      </div>
      <div aria-live="polite" className="mt-2 flex flex-wrap items-center gap-2">
        {resultado === null ? (
          <span className="text-muted-foreground">{analisis.ok ? "Con todos los valores, aquí sale el resultado." : "Corrija la fórmula para probarla."}</span>
        ) : (
          <>
            <span>
              {fraseDeResultado(
                {
                  resultado: resultado.resultado,
                  semaforo: resultado.semaforo,
                  noAplica: false,
                  motivo: resultado.sinResultado ? TEXTO_MOTIVO[resultado.sinResultado] : null,
                },
                regla,
                unidad,
              )}
            </span>
            {resultado.semaforo ? (
              <Insignia variante={resultado.semaforo}>{ETIQUETA_SEMAFORO[resultado.semaforo]}</Insignia>
            ) : resultado.resultado !== null ? (
              <Insignia variante="sin-dato">Sin meta</Insignia>
            ) : null}
            {resultado.fueraDeLimites ? <span className="text-estado-atencion-texto">Queda fuera de los límites del resultado.</span> : null}
          </>
        )}
      </div>
      {guardar ? <input type="hidden" name="prueba" value={guardar} /> : null}
    </fieldset>
  );
}
