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
 * servidor. `adjuntos` son los de la ronda (rol «análisis»): se pintan siempre, fuera de los formularios.
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
  const [conocidos, setConocidos] = useState<number[]>(() => analisis.map((a) => a.id));

  const guardadas: Pestana[] = analisis
    .filter((a) => METODOS.some((m) => m.clave === a.metodo))
    .map((a) => ({ clave: `a-${a.id}`, metodo: a.metodo as Metodo, analisis: a }));
  const pestanas: Pestana[] = [...guardadas, ...borradores.map((b) => ({ ...b, analisis: null }))];
  const activa = pestanas.find((p) => p.clave === elegida) ?? pestanas[pestanas.length - 1] ?? null;

  // Al guardar un análisis nuevo, su pestaña pasa a ser la activa (se ajusta al leer lo nuevo, no en un efecto).
  const nuevos = analisis.filter((a) => !conocidos.includes(a.id));
  if (nuevos.length > 0) {
    setConocidos([...conocidos, ...nuevos.map((a) => a.id)]);
    if (activa && activa.analisis === null) setElegida(`a-${nuevos[nuevos.length - 1].id}`);
  }

  const anadir = (metodo: Metodo) => {
    const clave = `n-${siguiente}`;
    setSiguiente(siguiente + 1);
    setBorradores((bs) => [...bs, { clave, metodo }]);
    setElegida(clave);
  };
  const descartar = (clave: string) => {
    setBorradores((bs) => bs.filter((b) => b.clave !== clave));
    setElegida((e) => (e === clave ? null : e));
  };

  const etiquetas = pestanas.map((p, i) => {
    const antes = pestanas.slice(0, i).filter((x) => x.metodo === p.metodo).length;
    const total = pestanas.filter((x) => x.metodo === p.metodo).length;
    return `${etiquetaDe(p.metodo)}${total > 1 ? ` (${antes + 1})` : ""}${p.analisis ? "" : " · sin guardar"}`;
  });

  /** Flechas, Inicio y Fin mueven entre pestañas (patrón de pestañas de WAI-ARIA); el foco sigue a la elegida. */
  const alTeclear = (e: React.KeyboardEvent, i: number) => {
    const ultimo = pestanas.length - 1;
    const destino =
      e.key === "ArrowRight" ? (i === ultimo ? 0 : i + 1) : e.key === "ArrowLeft" ? (i === 0 ? ultimo : i - 1) : e.key === "Home" ? 0 : e.key === "End" ? ultimo : null;
    if (destino === null) return;
    e.preventDefault();
    setElegida(pestanas[destino].clave);
    document.getElementById(`pestana-${pestanas[destino].clave}`)?.focus();
  };

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
              tabIndex={esActiva ? 0 : -1}
              onClick={() => setElegida(p.clave)}
              onKeyDown={(e) => alTeclear(e, i)}
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
            {m.clave === "otro" ? "Añadir un análisis con otro método" : `Añadir un análisis de ${m.etiqueta}`}
          </Boton>
        ))}
      </div>
      {/* Todos los paneles quedan montados: cambiar de pestaña no borra lo escrito sin guardar. */}
      {pestanas.map((p) => {
        const alGuardar = p.analisis ? undefined : () => descartar(p.clave);
        const comunes = { idBase: `ap-${p.clave}`, hallazgoId, analisis: p.analisis, guardar, quitar, alGuardar };
        return (
          <div key={p.clave} role="tabpanel" id={`panel-${p.clave}`} aria-labelledby={`pestana-${p.clave}`} hidden={p.clave !== activa?.clave} className="flex flex-col gap-3">
            {p.analisis === null && analisis.length + borradores.length > 1 ? (
              <Boton variante="fantasma" tamano="sm" className="self-start" onClick={() => descartar(p.clave)}>
                Descartar este borrador
              </Boton>
            ) : null}
            {p.metodo === "cinco_porques" ? (
              <FormularioCincoPorques {...comunes} />
            ) : p.metodo === "ishikawa" ? (
              <FormularioIshikawa {...comunes} />
            ) : (
              <FormularioOtroMetodo {...comunes} />
            )}
          </div>
        );
      })}
      {adjuntos}
    </div>
  );
}
