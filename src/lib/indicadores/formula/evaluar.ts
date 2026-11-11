import { comparar, dividir, esNegativa, fueraDeRango, multiplicar, restar, sumar, type Fraccion } from "./fraccion";
import type { Nodo } from "./analizar";

export type Motivo = "division_por_cero" | "falta_variable" | "fuera_de_rango";

export type ResultadoEvaluacion =
  | { ok: true; valor: Fraccion }
  | { ok: false; motivo: Motivo; variable?: string };

export const TEXTO_MOTIVO: Record<Motivo, string> = {
  division_por_cero: "división por cero",
  falta_variable: "falta una variable",
  fuera_de_rango: "cifra fuera de rango",
};

export function evaluar(arbol: Nodo, valores: Record<string, Fraccion | undefined>): ResultadoEvaluacion {
  const ir = (nodo: Nodo): ResultadoEvaluacion => {
    switch (nodo.t) {
      case "num":
        return { ok: true, valor: nodo.v };
      case "var": {
        const v = Object.hasOwn(valores, nodo.letra) ? valores[nodo.letra] : undefined;
        return v === undefined ? { ok: false, motivo: "falta_variable", variable: nodo.letra } : { ok: true, valor: v };
      }
      case "neg": {
        const a = ir(nodo.a);
        if (!a.ok) return a;
        return acotar({ n: -a.valor.n, d: a.valor.d });
      }
      case "op": {
        const a = ir(nodo.a);
        if (!a.ok) return a;
        const b = ir(nodo.b);
        if (!b.ok) return b;
        if (nodo.op === "/") {
          const r = dividir(a.valor, b.valor);
          return r === null ? { ok: false, motivo: "division_por_cero" } : acotar(r);
        }
        const r =
          nodo.op === "+" ? sumar(a.valor, b.valor) : nodo.op === "-" ? restar(a.valor, b.valor) : multiplicar(a.valor, b.valor);
        return acotar(r);
      }
      case "fn": {
        const valoresArgs: Fraccion[] = [];
        for (const arg of nodo.args) {
          const r = ir(arg);
          if (!r.ok) return r;
          valoresArgs.push(r.valor);
        }
        const [x, y] = valoresArgs;
        if (nodo.fn === "abs") return acotar(esNegativa(x) ? { n: -x.n, d: x.d } : x);
        const gana = nodo.fn === "min" ? comparar(x, y) <= 0 : comparar(x, y) >= 0;
        return { ok: true, valor: gana ? x : y };
      }
    }
  };
  return ir(arbol);
}

function acotar(valor: Fraccion): ResultadoEvaluacion {
  return fueraDeRango(valor) ? { ok: false, motivo: "fuera_de_rango" } : { ok: true, valor };
}
