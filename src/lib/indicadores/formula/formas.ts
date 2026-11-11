import type { Forma } from "../tipos";
import { aDecimal } from "./fraccion";
import { analizar, type Nodo } from "./analizar";

export const FACTORES_TASA = [100, 1000, 10000, 100000];

type FormaConFormula = Exclude<Forma, "libre">;

// Una tasa sin factor usa 1000 (spec: el factor más común).
export function formulaDeForma(forma: FormaConFormula, factor?: number): string {
  switch (forma) {
    case "porcentaje":
      return "A / B * 100";
    case "tasa": {
      const f = factor ?? 1000;
      if (!FACTORES_TASA.includes(f)) throw new RangeError("Factor de tasa no admitido");
      return `A / B * ${f}`;
    }
    case "razon":
      return "A / B";
    case "conteo":
      return "A";
  }
}

export function letrasDeForma(forma: FormaConFormula): string[] {
  return forma === "conteo" ? ["A"] : ["A", "B"];
}

const PRIORIDAD = { "+": 1, "-": 1, "*": 2, "/": 2 } as const;
const SIGNO = { "+": "+", "-": "−", "*": "×", "/": "÷" } as const;

function numero(n: Extract<Nodo, { t: "num" }>["v"]): string {
  const texto = aDecimal(n, 10, "truncar");
  return texto.replace(/\.?0+$/, "").replace(".", ",") || "0";
}

// Reconstruye la fórmula desde el árbol con los nombres de las variables.
export function enPalabras(formula: string, nombres: Record<string, string>): string {
  const a = analizar(formula);
  if (!a.ok) return formula;
  const nombre = (letra: string) => (Object.hasOwn(nombres, letra) ? nombres[letra] : letra);

  const ir = (nodo: Nodo): string => {
    switch (nodo.t) {
      case "num":
        return numero(nodo.v);
      case "var":
        return nombre(nodo.letra);
      case "neg":
        return nodo.a.t === "op" ? `−(${ir(nodo.a)})` : `−${ir(nodo.a)}`;
      case "fn":
        return `${nodo.fn}(${nodo.args.map(ir).join("; ")})`;
      case "op": {
        const p = PRIORIDAD[nodo.op];
        const izq = nodo.a;
        const der = nodo.b;
        const parentesisIzq =
          izq.t === "op" && (PRIORIDAD[izq.op] < p || (nodo.op === "*" && izq.op === "/"));
        const parentesisDer = der.t === "op" && (PRIORIDAD[der.op] < p || (PRIORIDAD[der.op] === p && (nodo.op === "-" || nodo.op === "/")));
        const l = parentesisIzq ? `(${ir(izq)})` : ir(izq);
        const r = parentesisDer ? `(${ir(der)})` : ir(der);
        return `${l} ${SIGNO[nodo.op]} ${r}`;
      }
    }
  };
  return ir(a.arbol);
}
