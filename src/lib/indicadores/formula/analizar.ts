// Analizador de fórmulas por descenso recursivo sobre una gramática cerrada.
// El árbol es datos puros: no guarda funciones ni se indexa con texto del usuario.
import { fraccion, type Fraccion } from "./fraccion";

export const MAX_CARACTERES = 300;
export const MAX_PROFUNDIDAD = 20;
export const MAX_CIFRAS = 15;

export type Nodo =
  | { t: "num"; v: Fraccion }
  | { t: "var"; letra: string }
  | { t: "neg"; a: Nodo }
  | { t: "op"; op: "+" | "-" | "*" | "/"; a: Nodo; b: Nodo }
  | { t: "fn"; fn: "min" | "max" | "abs"; args: Nodo[] };

export type ResultadoAnalisis =
  | { ok: true; arbol: Nodo; variables: string[] }
  | { ok: false; error: string };

type Ficha =
  | { k: "num"; v: Fraccion }
  | { k: "var"; letra: string }
  | { k: "fn"; fn: "min" | "max" | "abs" }
  | { k: "sim"; s: "+" | "-" | "*" | "/" | "(" | ")" | ";" | "," };

class ErrorDeFormula extends Error {}

function falla(mensaje: string): never {
  throw new ErrorDeFormula(mensaje);
}

// Nunca se repite un carácter crudo que pueda ser de control o direccional.
function describir(c: string): string {
  if (/^[\x21-\x7e]$/.test(c)) return `«${c}»`;
  return `U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`;
}

const NORMALIZAR: Record<string, string> = { "−": "-", "×": "*", "÷": "/" };

function fichas(texto: string): Ficha[] {
  const t = Array.from(texto, (c) => (Object.hasOwn(NORMALIZAR, c) ? NORMALIZAR[c] : c)).join("");
  const salida: Ficha[] = [];
  let i = 0;
  while (i < t.length) {
    const c = t[i];
    if (c === " ") {
      i++;
    } else if (c >= "0" && c <= "9") {
      let j = i;
      while (j < t.length && t[j] >= "0" && t[j] <= "9") j++;
      if (j + 1 < t.length && (t[j] === "," || t[j] === ".") && t[j + 1] >= "0" && t[j + 1] <= "9") {
        j++;
        while (j < t.length && t[j] >= "0" && t[j] <= "9") j++;
      }
      const v = fraccion(t.slice(i, j));
      if (!v) falla(`Número demasiado largo: admite ${MAX_CIFRAS} cifras enteras y 10 decimales`);
      salida.push({ k: "num", v });
      i = j;
    } else if (c >= "A" && c <= "Z") {
      const siguiente = t[i + 1];
      if (siguiente !== undefined && /[A-Za-z]/.test(siguiente)) {
        falla("Cada variable es una sola letra mayúscula (A a Z)");
      }
      salida.push({ k: "var", letra: c });
      i++;
    } else if (c >= "a" && c <= "z") {
      let j = i;
      while (j < t.length && t[j] >= "a" && t[j] <= "z") j++;
      const palabra = t.slice(i, j);
      if (palabra !== "min" && palabra !== "max" && palabra !== "abs") {
        falla(`Nombre no reconocido: ${palabra}. Solo se admiten min, max y abs`);
      }
      salida.push({ k: "fn", fn: palabra });
      i = j;
    } else if ("+-*/(),;".includes(c)) {
      salida.push({ k: "sim", s: c as "+" | "-" | "*" | "/" | "(" | ")" | ";" | "," });
      i++;
    } else {
      falla(`Carácter no admitido: ${describir(c)}`);
    }
  }
  return salida;
}

export function analizar(formula: string): ResultadoAnalisis {
  try {
    if (typeof formula !== "string") falla("La fórmula está vacía");
    if (formula.length > MAX_CARACTERES) falla(`La fórmula no puede pasar de ${MAX_CARACTERES} caracteres`);
    const lista = fichas(formula);
    if (lista.length === 0) falla("La fórmula está vacía");

    let pos = 0;
    let profundidad = 0;
    const letras = new Set<string>();

    const simbolo = (s: string): boolean => {
      const f = lista[pos];
      return f !== undefined && f.k === "sim" && f.s === s;
    };
    const entrar = () => {
      profundidad++;
      if (profundidad > MAX_PROFUNDIDAD) falla("La fórmula tiene demasiados niveles de paréntesis");
    };
    const cerrar = () => {
      if (!simbolo(")")) {
        falla(simbolo(",") ? "Separe los argumentos con punto y coma" : "Falta cerrar un paréntesis");
      }
      pos++;
    };

    const expresion = (): Nodo => {
      let a = termino();
      for (;;) {
        const f = lista[pos];
        if (f && f.k === "sim" && (f.s === "+" || f.s === "-")) {
          pos++;
          a = { t: "op", op: f.s, a, b: termino() };
        } else return a;
      }
    };
    const termino = (): Nodo => {
      let a = factor();
      for (;;) {
        const f = lista[pos];
        if (f && f.k === "sim" && (f.s === "*" || f.s === "/")) {
          pos++;
          a = { t: "op", op: f.s, a, b: factor() };
        } else return a;
      }
    };
    const factor = (): Nodo => {
      const f = lista[pos];
      if (f === undefined) falla("La fórmula está incompleta");
      pos++;
      if (f.k === "num") return { t: "num", v: f.v };
      if (f.k === "var") {
        letras.add(f.letra);
        return { t: "var", letra: f.letra };
      }
      if (f.k === "fn") {
        if (!simbolo("(")) falla(`Falta el paréntesis después de ${f.fn}`);
        pos++;
        entrar();
        const args: Nodo[] = [expresion()];
        while (simbolo(";")) {
          pos++;
          args.push(expresion());
        }
        cerrar();
        profundidad--;
        const esperados = f.fn === "abs" ? 1 : 2;
        if (args.length !== esperados) {
          falla(f.fn === "abs" ? "abs lleva un argumento" : `${f.fn} lleva dos argumentos`);
        }
        return { t: "fn", fn: f.fn, args };
      }
      if (f.s === "-") {
        entrar();
        const a = factor();
        profundidad--;
        return { t: "neg", a };
      }
      if (f.s === "(") {
        entrar();
        const a = expresion();
        cerrar();
        profundidad--;
        return a;
      }
      if (f.s === ",") falla("Separe los argumentos con punto y coma");
      return falla(f.s === ")" ? "Hay un paréntesis de cierre sin abrir o una expresión vacía" : `Falta un valor antes de «${f.s}»`);
    };

    const arbol = expresion();
    if (pos < lista.length) {
      const f = lista[pos];
      if (f.k === "sim" && f.s === ",") falla("Separe los argumentos con punto y coma");
      if (f.k === "sim" && f.s === ")") falla("Hay un paréntesis de cierre sin abrir");
      falla("Falta un operador (+, -, ×, ÷) entre dos valores");
    }
    return { ok: true, arbol, variables: [...letras].sort() };
  } catch (e) {
    if (e instanceof ErrorDeFormula) return { ok: false, error: e.message };
    return { ok: false, error: "La fórmula no se pudo leer" };
  }
}
