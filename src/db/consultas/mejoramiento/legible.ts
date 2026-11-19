/**
 * Lo que el dominio dice de cada error crudo de PostgreSQL que puede escaparse de una escritura del módulo de mejoramiento:
 * `mutacion` le muestra a la persona el mensaje de cualquier error. Módulo hoja (solo importa `ErrorMejora` y textos sin
 * importaciones): lo usan el motor (`flujo.ts`, que lo reexporta) y los módulos livianos que no pueden importarlo (`archivos.ts`, que
 * importa `admin.ts`, y `config.ts`; `tests/mejora-ciclos.test.ts`).
 */
import {
  IMPACTO_YA_TIENE_HALLAZGO,
  INDICE_HALLAZGO_DE_IMPACTO,
  INDICE_HALLAZGO_DE_REVISION,
  INDICE_NO_CONFORMIDAD_DE_VERIFICACION,
  YA_TIENE_NO_CONFORMIDAD,
} from "@/lib/mejoramiento/enganches";
import { ErrorMejora } from "@/lib/mejoramiento/tipos";

/**
 * Un dato elegido que ya no existe (la llave foránea, `23503`). Es también lo que el registro le dice a quien enlaza un documento
 * que no ve (`revisarIdentificacion`): para quien no lo ve, no existe.
 */
export const DATO_YA_NO_EXISTE = "Uno de los datos elegidos ya no existe: vuelva a cargar la página";

/**
 * Un hallazgo terminado (el trigger `sgc_impedir_si_hallazgo_terminado`, `42501`). Es también lo que dice el retiro de un archivo
 * por datos personales de un hallazgo terminado (anexo 15B §11.2), que lo comprueba antes de escribir.
 */
export const HALLAZGO_TERMINADO = "El hallazgo ya terminó y no admite cambios";

const LEGIBLES: Record<string, string> = {
  "23503": DATO_YA_NO_EXISTE,
  "23505": "Otra persona guardó lo mismo a la vez: vuelva a cargar la página",
  "42501": HALLAZGO_TERMINADO,
  "40P01": "Otra persona cambió el hallazgo a la vez: vuelva a intentarlo",
};

/**
 * Los `23505` de un índice único que dicen algo más que «otra persona guardó lo mismo»: la unicidad que garantiza la base, con la
 * frase del dominio que la comprueba antes (Fase 15B: los índices únicos parciales de la no conformidad de un hallazgo de verificación,
 * anexo §7.1, y del hallazgo de un impacto de norma o de la revisión de un indicador, §8).
 */
const POR_INDICE: Record<string, string> = {
  [INDICE_NO_CONFORMIDAD_DE_VERIFICACION]: YA_TIENE_NO_CONFORMIDAD,
  [INDICE_HALLAZGO_DE_IMPACTO]: IMPACTO_YA_TIENE_HALLAZGO,
  [INDICE_HALLAZGO_DE_REVISION]: IMPACTO_YA_TIENE_HALLAZGO,
};

/**
 * Traduce `23503`, `23505`, `42501` y `40P01` a `ErrorMejora` antes de que salgan del dominio; un `23505` de un índice de
 * `POR_INDICE`, con su propia frase. Los demás errores (los del dominio, entre ellos) pasan tal cual.
 */
export async function legible<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (err) {
    const e = err as { code?: unknown; constraint_name?: unknown } | null;
    const codigo = e?.code;
    const indice = e?.constraint_name;
    // Sin `cause`: el error traducido es igual a cualquier otro `ErrorMejora` con esa frase.
    if (codigo === "23505" && typeof indice === "string" && Object.hasOwn(POR_INDICE, indice)) throw new ErrorMejora(POR_INDICE[indice]);
    if (typeof codigo === "string" && Object.hasOwn(LEGIBLES, codigo)) throw new ErrorMejora(LEGIBLES[codigo]);
    throw err;
  }
}
