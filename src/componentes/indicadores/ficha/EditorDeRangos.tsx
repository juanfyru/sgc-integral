"use client";

import { useState } from "react";
import { claseControl } from "@/componentes/ui/Campo";
import type { FilaEnTexto, RangosEnTexto, Signo } from "@/lib/indicadores/rangos";
import type { Tendencia } from "@/lib/indicadores/tipos";

const CONTROL = `${claseControl} w-full min-w-0 max-w-full`;
const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

const ETIQUETA_SIGNO: Record<Signo, string> = { ">=": "≥", ">": ">", "<=": "≤", "<": "<", entre: "entre" };

/** Una fila tal como se escribe: números en texto, con coma o punto; `hasta` solo cuenta con «entre». */
export type FilaDelEditor = { signo: Signo; valor: string; hasta: string };
/**
 * Lo que se ve en el editor. En «mantenerse en un rango», `atencion` y `critico` llevan dos filas: la primera es la de
 * por debajo de Bien y la segunda, la de por encima.
 */
export type EstadoEditor = { bien: FilaDelEditor[]; atencion: FilaDelEditor[]; critico: FilaDelEditor[]; sinAtencion: boolean };

type Estado = "bien" | "atencion" | "critico";
const NOMBRE: Record<Estado, string> = { bien: "Bien", atencion: "Atención", critico: "Crítico" };

const fila = (signo: Signo): FilaDelEditor => ({ signo, valor: "", hasta: "" });

function porOmision(tendencia: Tendencia): EstadoEditor {
  if (tendencia === "constante") {
    return { bien: [fila("entre")], atencion: [fila("entre"), fila("entre")], critico: [fila("<"), fila(">")], sinAtencion: false };
  }
  return tendencia === "ascendente"
    ? { bien: [fila(">=")], atencion: [fila("entre")], critico: [fila("<=")], sinAtencion: false }
    : { bien: [fila("<=")], atencion: [fila("entre")], critico: [fila(">=")], sinAtencion: false };
}

const aEditor = (f: FilaEnTexto): FilaDelEditor => ({ signo: f.signo, valor: f.valor.replace(".", ","), hasta: (f.hasta ?? "").replace(".", ",") });

/** El estado del editor para unos rangos escritos (o, sin ellos, para filas vacías con los signos más usados). */
export function estadoDeRangos(tendencia: Tendencia, inicial: RangosEnTexto | null): EstadoEditor {
  const base = porOmision(tendencia);
  if (inicial === null) return base;
  const bien = inicial.bien.length > 0 ? inicial.bien.slice(0, 1).map(aEditor) : base.bien;
  if (tendencia !== "constante") {
    return {
      bien,
      atencion: inicial.atencion.length > 0 ? [aEditor(inicial.atencion[0])] : base.atencion,
      critico: inicial.critico.length > 0 ? [aEditor(inicial.critico[0])] : base.critico,
      sinAtencion: inicial.atencion.length === 0,
    };
  }
  const centro = Number(inicial.bien[0]?.valor);
  const estaAbajo = (f: FilaEnTexto) =>
    f.signo === "<" || f.signo === "<=" ? true : f.signo === ">" || f.signo === ">=" ? false : Number(f.valor) < centro;
  const ordenar = (filas: FilaEnTexto[], vacias: FilaDelEditor[]): FilaDelEditor[] => {
    const salida = [...vacias];
    for (const f of filas) salida[estaAbajo(f) ? 0 : 1] = aEditor(f);
    return salida;
  };
  return {
    bien,
    atencion: ordenar(inicial.atencion, base.atencion),
    critico: ordenar(inicial.critico, base.critico),
    sinAtencion: inicial.atencion.length === 0,
  };
}

const numero = (t: string) => t.trim().replace(",", ".");

/** Lo que se guarda: un `RangosEnTexto`. Sin Atención, esa lista queda vacía; una Atención sin escribir no deja filas. */
export function rangosDelEditor(e: EstadoEditor): RangosEnTexto {
  const aTexto = (f: FilaDelEditor): FilaEnTexto =>
    f.signo === "entre" ? { signo: f.signo, valor: numero(f.valor), hasta: numero(f.hasta) } : { signo: f.signo, valor: numero(f.valor) };
  const vacia = (f: FilaDelEditor) => numero(f.valor) === "" && (f.signo !== "entre" || numero(f.hasta) === "");
  return {
    bien: e.bien.map(aTexto),
    atencion: e.sinAtencion ? [] : e.atencion.length > 1 ? e.atencion.filter((f) => !vacia(f)).map(aTexto) : e.atencion.map(aTexto),
    critico: e.critico.map(aTexto),
  };
}

const TODOS: readonly Signo[] = [">=", ">", "<=", "<", "entre"];
const DE_SUBIDA: readonly Signo[] = [">=", ">", "entre"];
const DE_BAJADA: readonly Signo[] = ["<=", "<", "entre"];

/** Los signos que tienen sentido en cada fila; el que ya está escrito se conserva siempre. */
function signosDe(tendencia: Tendencia, estado: Estado, indice: number, actual: Signo): readonly Signo[] {
  let lista: readonly Signo[] = TODOS;
  if (estado !== "atencion") {
    if (tendencia === "constante") lista = estado === "bien" ? ["entre"] : indice === 0 ? DE_BAJADA : DE_SUBIDA;
    else if (estado === "bien") lista = tendencia === "ascendente" ? DE_SUBIDA : DE_BAJADA;
    else lista = tendencia === "ascendente" ? DE_BAJADA : DE_SUBIDA;
  }
  return lista.includes(actual) ? lista : [...lista, actual];
}

/**
 * Los rangos del semáforo, una fila por estado (spec 14A §3.2, opción B): un signo y uno o dos números. En «mantenerse
 * en un rango», Atención y Crítico van «por debajo» y «por encima» de Bien. Escribe los campos ocultos `rangos` (JSON) y
 * `semaforoModo`; `alCambiar` avisa a la ficha para que la vista del semáforo y la prueba usen lo escrito. El error va
 * junto al editor, descrito por `aria-describedby`, y el foco llega al conjunto (`idError`).
 */
export function EditorDeRangos({
  tendencia,
  inicial,
  error,
  idError,
  alCambiar,
  enviar = true,
}: {
  tendencia: Tendencia;
  inicial: RangosEnTexto | null;
  error: string | null;
  idError: string;
  alCambiar?: (rangos: RangosEnTexto) => void;
  /** Con `false` no viaja nada: sin meta, el indicador queda «Sin meta» y no lleva rangos. */
  enviar?: boolean;
}) {
  const [estado, setEstado] = useState<EstadoEditor>(() => estadoDeRangos(tendencia, inicial));
  const constante = tendencia === "constante";

  function poner(nuevo: EstadoEditor) {
    setEstado(nuevo);
    alCambiar?.(rangosDelEditor(nuevo));
  }
  function cambiarFila(e: Estado, indice: number, cambio: Partial<FilaDelEditor>) {
    poner({ ...estado, [e]: estado[e].map((f, i) => (i === indice ? { ...f, ...cambio } : f)) });
  }

  // Una función y no un componente: un componente definido aquí se volvería a montar en cada tecla y perdería el foco.
  function fila(e: Estado, indice: number) {
    const f = estado[e][indice];
    const lado = constante && e !== "bien" ? (indice === 0 ? "debajo" : "encima") : null;
    const id = `rango-${e}${lado ? `-${lado}` : ""}`;
    const nombre = lado ? `${NOMBRE[e]} por ${lado}` : NOMBRE[e];
    const etiqueta = lado ? `${nombre} de Bien` : nombre;
    return (
      <div key={`${e}-${indice}`} className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[9rem_7rem_1fr] sm:items-center">
        <span className="text-sm font-medium">{nombre}</span>
        <div className="min-w-0">
          <label htmlFor={`${id}-signo`} className="sr-only">{`Signo de ${etiqueta}`}</label>
          <select
            id={`${id}-signo`}
            value={f.signo}
            onChange={(ev) => cambiarFila(e, indice, { signo: ev.target.value as Signo })}
            className={CONTROL}
          >
            {signosDe(tendencia, e, indice, f.signo).map((s) => (
              <option key={s} value={s}>
                {ETIQUETA_SIGNO[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <label htmlFor={`${id}-valor`} className="sr-only">
              {f.signo === "entre" ? `${etiqueta}, desde` : `${etiqueta}, valor`}
            </label>
            <input id={`${id}-valor`} inputMode="decimal" value={f.valor} onChange={(ev) => cambiarFila(e, indice, { valor: ev.target.value })} className={CONTROL} />
          </div>
          {f.signo === "entre" ? (
            <>
              <span aria-hidden="true" className="text-sm text-muted-foreground">
                y
              </span>
              <div className="min-w-0 flex-1">
                <label htmlFor={`${id}-hasta`} className="sr-only">{`${etiqueta}, hasta`}</label>
                <input id={`${id}-hasta`} inputMode="decimal" value={f.hasta} onChange={(ev) => cambiarFila(e, indice, { hasta: ev.target.value })} className={CONTROL} />
              </div>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <fieldset
      id={idError}
      tabIndex={-1}
      aria-describedby={error ? `${idError}-error` : undefined}
      className={`min-w-0 rounded-md border border-border px-3 py-2 ${FOCO}`}
    >
      <legend className="px-1 text-sm font-medium">Rangos del semáforo</legend>
      <p className="text-xs text-muted-foreground">
        «Entre» incluye los dos números. Una fila con un solo signo llega hasta donde empieza el rango mejor.
      </p>
      <div className="mt-2 flex min-w-0 flex-col gap-3">
        {fila("bien", 0)}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="rango-sin-atencion"
            checked={estado.sinAtencion}
            onChange={(ev) => poner({ ...estado, sinAtencion: ev.target.checked })}
          />
          <label htmlFor="rango-sin-atencion" className="text-sm">
            Este indicador no usa Atención
          </label>
        </div>
        {estado.sinAtencion ? null : estado.atencion.map((_, i) => fila("atencion", i))}
        {estado.critico.map((_, i) => fila("critico", i))}
      </div>
      {error ? (
        <p id={`${idError}-error`} role="alert" className="text-xs text-estado-critico-texto">
          {error}
        </p>
      ) : null}
      {enviar ? (
        <>
          <input type="hidden" name="semaforoModo" value="rangos" />
          <input type="hidden" name="rangos" value={JSON.stringify(rangosDelEditor(estado))} />
        </>
      ) : null}
    </fieldset>
  );
}
