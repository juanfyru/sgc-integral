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

/**
 * Texto recortado, de largo acotado, con mensajes para la persona. `nombre` lleva su artículo: «La
 * justificación». Un campo vacío ni siquiera llega (`formDataAObjeto`): también es demasiado corto.
 */
export function textoAcotado(nombre: string, minimo: number, maximo: number) {
  const corto = `${nombre} debe tener al menos ${minimo} ${minimo === 1 ? "carácter" : "caracteres"}`;
  return z.string({ error: corto }).trim().min(minimo, corto).max(maximo, `${nombre} no puede pasar de ${maximo} caracteres`);
}

/**
 * Para lo que el esquema no dice con sus palabras: el texto de `zod` con el campo delante, para
 * saber de cuál habla. Un mensaje escrito en el esquema ya es una frase y no pasa por aquí.
 */
const conElCampo: z.core.$ZodErrorMap = (problema) => {
  const mensaje = z.config().localeError?.(problema);
  const texto = typeof mensaje === "string" ? mensaje : mensaje?.message;
  const campo = problema.path?.join(".");
  return campo && texto ? `${campo}: ${texto}` : texto;
};

/** `omitir`: claves de ruta (p. ej. "id") que viajan en el formulario pero no son del esquema estricto. */
export function parsearFormulario<T>(
  formData: FormData,
  esquema: z.ZodType<T>,
  opciones?: { omitir?: string[] },
): T {
  const resultado = esquema.safeParse(formDataAObjeto(formData, new Set(opciones?.omitir ?? [])), { error: conElCampo });
  if (resultado.success) return resultado.data;
  throw new ErrorValidacion(resultado.error.issues[0].message);
}
