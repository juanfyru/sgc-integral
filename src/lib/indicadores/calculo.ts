/**
 * El cálculo de una medición: la única entrada al intérprete de fórmulas. La usan el servidor (`recalcularMedicion`) y
 * el formulario del cliente, que muestra el resultado mientras se digita. Sin Node ni BD.
 */
import type { Nodo } from "./formula/analizar";
import { comparar, CERO, entero, fraccion, multiplicar, restar, esNegativa, type Fraccion } from "./formula/fraccion";
import { evaluar, type Motivo } from "./formula/evaluar";
import { semaforoDe, type Regla } from "./semaforo";
import type { Semaforo } from "./tipos";

export type FichaDeCalculo = {
  arbol: Nodo;
  letras: string[];
  resultadoMin: Fraccion | null;
  resultadoMax: Fraccion | null;
};

export function calcular(
  f: FichaDeCalculo,
  valores: Record<string, Fraccion | undefined>,
  regla: Regla,
): { completo: boolean; resultado: Fraccion | null; sinResultado: Motivo | null; semaforo: Semaforo | null; fueraDeLimites: boolean } {
  const completo = f.letras.every((letra) => Object.hasOwn(valores, letra) && valores[letra] !== undefined);
  if (!completo) return { completo: false, resultado: null, sinResultado: null, semaforo: null, fueraDeLimites: false };
  const evaluacion = evaluar(f.arbol, valores);
  if (!evaluacion.ok) return { completo: true, resultado: null, sinResultado: evaluacion.motivo, semaforo: null, fueraDeLimites: false };
  const resultado = evaluacion.valor;
  const fueraDeLimites =
    (f.resultadoMin !== null && comparar(resultado, f.resultadoMin) < 0) || (f.resultadoMax !== null && comparar(resultado, f.resultadoMax) > 0);
  return { completo: true, resultado, sinResultado: null, semaforo: semaforoDe(resultado, regla), fueraDeLimites };
}

/** ¿El resultado se movió más de `pct` % frente al anterior? Pide confirmación antes de reportar. Si el anterior fue 0, cualquier cambio cuenta. */
export function variacionExcesiva(actual: Fraccion, previo: Fraccion | null, pct: number): boolean {
  if (previo === null) return false;
  const diferencia = restar(actual, previo);
  const abs = (a: Fraccion): Fraccion => (esNegativa(a) ? restar(CERO, a) : a);
  if (comparar(previo, CERO) === 0) return comparar(diferencia, CERO) !== 0;
  const limite = fraccion(String(pct)) ?? entero(Math.round(pct));
  return comparar(multiplicar(abs(diferencia), entero(100)), multiplicar(limite, abs(previo))) > 0;
}
