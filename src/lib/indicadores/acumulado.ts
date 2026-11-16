/**
 * Acumulado del año (spec §8.10): cada variable de los periodos medidos se junta con su regla (suma, último valor o
 * promedio) y después se aplica la fórmula. Nunca se promedian resultados. Sin Node ni BD.
 */
import { evaluar, type Motivo } from "./formula/evaluar";
import { dividir, entero, sumar, CERO, type Fraccion } from "./formula/fraccion";
import { cumpleMeta, semaforoDe, type Regla } from "./semaforo";
import type { FichaDeCalculo } from "./calculo";
import type { Consolidacion, Semaforo } from "./tipos";

/** `valores` es `null` cuando el periodo no tiene dato («sin dato»); un periodo «no aplica» no aporta valores. */
export type PeriodoMedido = { clave: string; versionId: number; noAplica: boolean; valores: Record<string, Fraccion> | null };

export function juntar(consolidacion: Consolidacion, valores: Fraccion[]): Fraccion {
  if (consolidacion === "ultimo") return valores[valores.length - 1];
  const suma = valores.reduce(sumar, CERO);
  return consolidacion === "promedio" ? dividir(suma, entero(valores.length))! : suma;
}

/** Junta los valores de un dato entre periodos; `null` si no hay ninguno o falta alguno. */
export function juntadoONada(consolidacion: Consolidacion, valores: readonly (Fraccion | null)[]): Fraccion | null {
  if (valores.length === 0 || valores.some((v) => v === null)) return null;
  return juntar(consolidacion, valores as Fraccion[]);
}

/**
 * Con `fijos` (anexo 14C, §6.4: una variable tomada de otro indicador vale el acumulado propio del componente en el tramo),
 * las letras que trae no se juntan de los periodos ni se les piden: valen lo que se les da, y con una en `null` no hay
 * resultado. Sin `fijos`, todas se juntan de los periodos.
 */
export function acumulado(
  periodos: PeriodoMedido[],
  f: { versionId: number; calculo: FichaDeCalculo; consolidacion: Record<string, Consolidacion>; esperados: string[]; regla: Regla },
  fijos?: Readonly<Record<string, Fraccion | null>>,
): { resultado: Fraccion | null; valores: Record<string, Fraccion>; semaforo: Semaforo | null; cumple: boolean | null; faltan: string[]; desde: string | null; sinResultado: Motivo | null } {
  const esFija = (letra: string) => fijos !== undefined && Object.hasOwn(fijos, letra);
  const juntadas = f.calculo.letras.filter((letra) => !esFija(letra));
  const ordenados = [...periodos].sort((a, b) => (a.clave < b.clave ? -1 : a.clave > b.clave ? 1 : 0));
  const deLaVersion = ordenados.filter((p) => p.versionId === f.versionId);
  const desde = deLaVersion.length > 0 ? deLaVersion[0].clave : null;
  // Un periodo al que le falta alguna letra de la fórmula es «sin dato»: no aporta a las demás.
  const completo = (p: PeriodoMedido) => p.valores !== null && juntadas.every((letra) => Object.hasOwn(p.valores!, letra));
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
    if (esFija(letra)) {
      const fija = fijos![letra];
      if (fija) valores[letra] = fija;
      continue;
    }
    const reunidos = medidos.flatMap((p) => (p.valores !== null && Object.hasOwn(p.valores, letra) ? [p.valores[letra]] : []));
    if (reunidos.length > 0) valores[letra] = juntar(f.consolidacion[letra] ?? "suma", reunidos);
  }
  const sinFija = f.calculo.letras.some((letra) => esFija(letra) && fijos![letra] === null);
  if (medidos.length === 0 || sinFija) return { resultado: null, valores, semaforo: null, cumple: null, faltan, desde, sinResultado: null };

  const evaluacion = evaluar(f.calculo.arbol, valores);
  if (!evaluacion.ok) return { resultado: null, valores, semaforo: null, cumple: null, faltan, desde, sinResultado: evaluacion.motivo };
  const semaforo = semaforoDe(evaluacion.valor, f.regla);
  const cumple = semaforo === null ? null : cumpleMeta(evaluacion.valor, f.regla);
  return { resultado: evaluacion.valor, valores, semaforo, cumple, faltan, desde, sinResultado: null };
}
