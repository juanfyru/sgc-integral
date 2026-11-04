import { z } from "zod";

z.config(z.locales.es());

export class ErrorValidacion extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorValidacion";
  }
}

/** FormData → objeto: getAll (un valor → string, varios → string[]); "" → undefined. */
function formDataAObjeto(
  formData: FormData,
  omitir: ReadonlySet<string>,
): Record<string, string | string[]> {
  const objeto: Record<string, string | string[]> = {};
  for (const clave of new Set(formData.keys())) {
    if (clave.startsWith("$ACTION_") || omitir.has(clave)) continue; // campos internos de React (useActionState, bind)
    const valores = formData
      .getAll(clave)
      .filter((v): v is string => typeof v === "string" && v !== "");
    if (valores.length === 0) continue;
    objeto[clave] = valores.length === 1 ? valores[0] : valores;
  }
  return objeto;
}

/** `omitir`: claves de ruta (p. ej. "id") que viajan en el formulario pero no son del esquema estricto. */
export function parsearFormulario<T>(
  formData: FormData,
  esquema: z.ZodType<T>,
  opciones?: { omitir?: string[] },
): T {
  const resultado = esquema.safeParse(formDataAObjeto(formData, new Set(opciones?.omitir ?? [])));
  if (resultado.success) return resultado.data;
  const problema = resultado.error.issues[0];
  const campo = problema.path.join(".");
  throw new ErrorValidacion(campo ? `${campo}: ${problema.message}` : problema.message);
}
