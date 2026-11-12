/**
 * Acumulado del año (spec §8.10): cada variable de los periodos medidos se junta con su regla (suma, último valor o
 * promedio) y después se aplica la fórmula. Nunca se promedian resultados. Sin Node ni BD.
 */
import { evaluar, type Motivo } from "./formula/evaluar";
import { dividir, entero, sumar, CERO, type Fraccion } from "./formula/fraccion";
import { semaforoDe, type Regla } from "./semaforo";
import type { FichaDeCalculo } from "./calculo";
import type { Consolidacion, Semaforo } from "./tipos";

/** `valores` es `null` cuando el periodo no tiene dato («sin dato»); un periodo «no aplica» no aporta valores. */
export type PeriodoMedido = { clave: string; versionId: number; noAplica: boolean; valores: Record<string, Fraccion> | null };

function juntar(consolidacion: Consolidacion, valores: Fraccion[]): Fraccion {
  if (consolidacion === "ultimo") return valores[valores.length - 1];
  const suma = valores.reduce(sumar, CERO);
  return consolidacion === "promedio" ? dividir(suma, entero(valores.length))! : suma;
}

export function acumulado(
  periodos: PeriodoMedido[],
  f: { versionId: number; calculo: FichaDeCalculo; consolidacion: Record<string, Consolidacion>; esperados: string[]; regla: Regla },
): { resultado: Fraccion | null; valores: Record<string, Fraccion>; semaforo: Semaforo | null; faltan: string[]; desde: string | null; sinResultado: Motivo | null } {
  const ordenados = [...periodos].sort((a, b) => (a.clave < b.clave ? -1 : a.clave > b.clave ? 1 : 0));
  const deLaVersion = ordenados.filter((p) => p.versionId === f.versionId);
  const desde = deLaVersion.length > 0 ? deLaVersion[0].clave : null;
  // Un periodo al que le falta alguna letra de la fórmula es «sin dato»: no aporta a las demás.
  const completo = (p: PeriodoMedido) => p.valores !== null && f.calculo.letras.every((letra) => Object.hasOwn(p.valores!, letra));
  const medidos = deLaVersion.filter((p) => !p.noAplica && completo(p));

  // Lo que falta: un periodo esperado que no existe o está «sin dato». Lo anterior a `desde` es de otra versión.
  const porClave = new Map(ordenados.map((p) => [p.clave, p]));
  const faltan = f.esperados.filter((clave) => {
    const p = porClave.get(clave);
    if (p === undefined) return desde === null || clave >= desde;
    return p.versionId === f.versionId && !p.noAplica && !completo(p);
  });

  const valores: Record<string, Fraccion> = {};
  for (const letra of f.calculo.letras) {
    const reunidos = medidos.flatMap((p) => (p.valores !== null && Object.hasOwn(p.valores, letra) ? [p.valores[letra]] : []));
    if (reunidos.length > 0) valores[letra] = juntar(f.consolidacion[letra] ?? "suma", reunidos);
  }
  if (medidos.length === 0) return { resultado: null, valores, semaforo: null, faltan, desde, sinResultado: null };

  const evaluacion = evaluar(f.calculo.arbol, valores);
  if (!evaluacion.ok) return { resultado: null, valores, semaforo: null, faltan, desde, sinResultado: evaluacion.motivo };
  return { resultado: evaluacion.valor, valores, semaforo: semaforoDe(evaluacion.valor, f.regla), faltan, desde, sinResultado: null };
}
