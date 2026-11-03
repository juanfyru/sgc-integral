import { z } from "zod";

z.config(z.locales.es());

export class ErrorValidacion extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorValidacion";
  }
}

/** FormData → objeto: getAll (un valor → string, varios → string[]); "" → undefined. */
function formDataAObjeto(formData: FormData): Record<string, string | string[]> {
  const objeto: Record<string, string | string[]> = {};
  for (const clave of new Set(formData.keys())) {
    const valores = formData
      .getAll(clave)
      .filter((v): v is string => typeof v === "string" && v !== "");
    if (valores.length === 0) continue;
    objeto[clave] = valores.length === 1 ? valores[0] : valores;
  }
  return objeto;
}

export function parsearFormulario<T>(formData: FormData, esquema: z.ZodType<T>): T {
  const resultado = esquema.safeParse(formDataAObjeto(formData));
  if (resultado.success) return resultado.data;
  const problema = resultado.error.issues[0];
  const campo = problema.path.join(".");
  throw new ErrorValidacion(campo ? `${campo}: ${problema.message}` : problema.message);
}
