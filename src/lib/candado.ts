/**
 * Candado en memoria por clave: las llamadas con la misma clave se ejecutan en
 * serie (cola de promesas); con claves distintas corren en paralelo. Vale
 * porque la app es de instancia única (sin Redis).
 */
const colas = new Map<string, Promise<unknown>>();

export async function conCandado<T>(clave: string, fn: () => Promise<T>): Promise<T> {
  const previa = colas.get(clave) ?? Promise.resolve();
  const actual = previa.then(fn, fn);
  const cola = actual.then(
    () => undefined,
    () => undefined,
  );
  colas.set(clave, cola);
  try {
    return await actual;
  } finally {
    if (colas.get(clave) === cola) colas.delete(clave);
  }
}
