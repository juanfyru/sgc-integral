"use client";

import { useState } from "react";
import { Boton } from "@/componentes/ui/Boton";
import { FormularioCincoPorques } from "./FormularioCincoPorques";
import { FormularioIshikawa } from "./FormularioIshikawa";
import { FormularioOtroMetodo } from "./FormularioOtroMetodo";
import type { AccionDeAnalisis, AnalisisGuardado } from "./Partes";

const METODOS = [
  { clave: "cinco_porques", etiqueta: "5 porqués" },
  { clave: "ishikawa", etiqueta: "Ishikawa (6M)" },
  { clave: "otro", etiqueta: "Otro método" },
] as const;
type Metodo = (typeof METODOS)[number]["clave"];

type Pestana = { clave: string; metodo: Metodo; analisis: AnalisisGuardado | null };

const etiquetaDe = (m: string) => METODOS.find((x) => x.clave === m)?.etiqueta ?? m;

/**
 * El análisis de la ronda (spec 15 §9.1, maqueta 4): una pestaña por análisis, con el formulario de su método. «Añadir otro
 * análisis» abre una pestaña nueva de cualquiera de los tres métodos; un borrador sin guardar se descarta sin tocar el
 * servidor. `adjuntos` son los de la ronda (rol «análisis») y solo se pintan en «Otro método», fuera del formulario.
 */
export function PestanasDeMetodo({
  hallazgoId,
  analisis,
  guardar,
  quitar,
  adjuntos,
}: {
  hallazgoId: number;
  analisis: AnalisisGuardado[];
  guardar: AccionDeAnalisis;
  quitar: AccionDeAnalisis;
  adjuntos?: React.ReactNode;
}) {
  const [borradores, setBorradores] = useState<Array<{ clave: string; metodo: Metodo }>>(() =>
    analisis.length === 0 ? [{ clave: "n-0", metodo: "cinco_porques" }] : [],
  );
  const [siguiente, setSiguiente] = useState(1);
  const [elegida, setElegida] = useState<string | null>(null);

  const guardadas: Pestana[] = analisis
    .filter((a): a is AnalisisGuardado & { metodo: Metodo } => METODOS.some((m) => m.clave === a.metodo))
    .map((a) => ({ clave: `a-${a.id}`, metodo: a.metodo as Metodo, analisis: a }));
  const pestanas: Pestana[] = [...guardadas, ...borradores.map((b) => ({ ...b, analisis: null }))];
  const activa = pestanas.find((p) => p.clave === elegida) ?? pestanas[pestanas.length - 1] ?? null;

  const anadir = (metodo: Metodo) => {
    const clave = `n-${siguiente}`;
    setSiguiente(siguiente + 1);
    setBorradores((bs) => [...bs, { clave, metodo }]);
    setElegida(clave);
  };
  const descartar = (clave: string) => {
    setBorradores((bs) => bs.filter((b) => b.clave !== clave));
    setElegida(null);
  };

  const etiquetas = pestanas.map((p, i) => {
    const antes = pestanas.slice(0, i).filter((x) => x.metodo === p.metodo).length;
    const total = pestanas.filter((x) => x.metodo === p.metodo).length;
    return `${etiquetaDe(p.metodo)}${total > 1 ? ` (${antes + 1})` : ""}${p.analisis ? "" : " · sin guardar"}`;
  });

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Análisis de la causa raíz" className="flex flex-wrap gap-1 border-b border-border">
        {pestanas.map((p, i) => {
          const esActiva = p.clave === activa?.clave;
          return (
            <button
              key={p.clave}
              type="button"
              role="tab"
              id={`pestana-${p.clave}`}
              aria-selected={esActiva}
              aria-controls={`panel-${p.clave}`}
              onClick={() => setElegida(p.clave)}
              className={`-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca ${
                esActiva ? "border-mod-planes font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {etiquetas[i]}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Añadir otro análisis:</span>
        {METODOS.map((m) => (
          <Boton key={m.clave} variante="secundario" tamano="sm" onClick={() => anadir(m.clave)}>
            {m.etiqueta}
          </Boton>
        ))}
      </div>
      {activa ? (
        <div role="tabpanel" id={`panel-${activa.clave}`} aria-labelledby={`pestana-${activa.clave}`} className="flex flex-col gap-3">
          {activa.analisis === null && analisis.length + borradores.length > 1 ? (
            <Boton variante="fantasma" tamano="sm" className="self-start" onClick={() => descartar(activa.clave)}>
              Descartar este borrador
            </Boton>
          ) : null}
          {activa.metodo === "cinco_porques" ? (
            <FormularioCincoPorques
              key={activa.clave}
              idBase={`ap-${activa.clave}`}
              hallazgoId={hallazgoId}
              analisis={activa.analisis}
              guardar={guardar}
              quitar={quitar}
              alGuardar={activa.analisis ? undefined : () => descartar(activa.clave)}
            />
          ) : activa.metodo === "ishikawa" ? (
            <FormularioIshikawa
              key={activa.clave}
              idBase={`ap-${activa.clave}`}
              hallazgoId={hallazgoId}
              analisis={activa.analisis}
              guardar={guardar}
              quitar={quitar}
              alGuardar={activa.analisis ? undefined : () => descartar(activa.clave)}
            />
          ) : (
            <>
              <FormularioOtroMetodo
                key={activa.clave}
                idBase={`ap-${activa.clave}`}
                hallazgoId={hallazgoId}
                analisis={activa.analisis}
                guardar={guardar}
                quitar={quitar}
                alGuardar={activa.analisis ? undefined : () => descartar(activa.clave)}
              />
              {adjuntos}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
