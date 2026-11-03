import { z } from "zod";

const clave = z.string().min(1).max(128);
const volver = z.string().optional();

export const EsquemaIngreso = z
  .object({ usuario: z.string().trim().min(1).max(40), clave, volver })
  .strict();

export const EsquemaCodigoFactor = z
  .object({
    codigo: z
      .string()
      .trim()
      .regex(/^(\d{6}|[A-Z2-9]{5}-?[A-Z2-9]{5})$/i, "Código no válido"),
    volver,
  })
  .strict();

export const EsquemaClaveInicial = z
  .object({ claveNueva: clave, confirmacion: clave })
  .strict()
  .refine((d) => d.claveNueva === d.confirmacion, {
    path: ["confirmacion"],
    message: "La confirmación no coincide con la clave nueva",
  });

export const EsquemaCambioClave = z
  .object({ claveActual: clave, claveNueva: clave, confirmacion: clave })
  .strict()
  .refine((d) => d.claveNueva === d.confirmacion, {
    path: ["confirmacion"],
    message: "La confirmación no coincide con la clave nueva",
  });

export const EsquemaClaveSola = z.object({ clave }).strict();
