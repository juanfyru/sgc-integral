/**
 * Lo que el dominio dice de cada error crudo de PostgreSQL que puede escaparse de una escritura del módulo de mejoramiento:
 * `mutacion` le muestra a la persona el mensaje de cualquier error. Módulo hoja (solo importa `ErrorMejora`): lo usan el motor
 * (`flujo.ts`, que lo reexporta) y los módulos livianos que no pueden importarlo (`archivos.ts`, que importa `admin.ts`, y
 * `config.ts`; `tests/mejora-ciclos.test.ts`).
 */
import { ErrorMejora } from "@/lib/mejoramiento/tipos";

const LEGIBLES: Record<string, string> = {
  "23503": "Uno de los datos elegidos ya no existe: vuelva a cargar la página",
  "23505": "Otra persona guardó lo mismo a la vez: vuelva a cargar la página",
  "42501": "El hallazgo ya terminó y no admite cambios",
  "40P01": "Otra persona cambió el hallazgo a la vez: vuelva a intentarlo",
};

/**
 * Traduce `23503`, `23505`, `42501` y `40P01` a `ErrorMejora` antes de que salgan del dominio. Los demás errores (los del
 * dominio, entre ellos) pasan tal cual.
 */
export async function legible<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (err) {
    const codigo = (err as { code?: unknown } | null)?.code;
    // Sin `cause`: el error traducido es igual a cualquier otro `ErrorMejora` con esa frase.
    if (typeof codigo === "string" && Object.hasOwn(LEGIBLES, codigo)) throw new ErrorMejora(LEGIBLES[codigo]);
    throw err;
  }
}
