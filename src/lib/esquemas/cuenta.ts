import { z } from "zod";

/** Vacía no llega como texto (`formDataAObjeto`): `pedido` vale para los dos casos. */
const claveCon = (pedido: string) =>
  z.string({ error: pedido }).min(1, pedido).max(128, "La clave no puede pasar de 128 caracteres");

const clave = claveCon("Escriba su clave");
const claveNueva = claveCon("Escriba la clave nueva");
const confirmacion = claveCon("Confirme la clave nueva");
const volver = z.string().optional();
const CODIGO_NO_VALIDO = "Código no válido";

export const EsquemaIngreso = z
  .object({
    usuario: z
      .string({ error: "Escriba su usuario" })
      .trim()
      .min(1, "Escriba su usuario")
      .max(40, "El usuario no puede pasar de 40 caracteres"),
    clave,
    volver,
  })
  .strict();

export const EsquemaCodigoFactor = z
  .object({
    codigo: z
      .string({ error: CODIGO_NO_VALIDO })
      .trim()
      .regex(/^(\d{6}|[A-Z2-9]{5}-?[A-Z2-9]{5})$/i, CODIGO_NO_VALIDO),
    volver,
  })
  .strict();

export const EsquemaAviso = z
  .object({ acepto: z.literal("si", { message: "Debe aceptar el aviso para continuar" }), volver })
  .strict();

export const EsquemaClaveInicial = z
  .object({ claveNueva, confirmacion })
  .strict()
  .refine((d) => d.claveNueva === d.confirmacion, {
    path: ["confirmacion"],
    message: "La confirmación no coincide con la clave nueva",
  });

export const EsquemaCambioClave = z
  .object({ claveActual: claveCon("Escriba su clave actual"), claveNueva, confirmacion })
  .strict()
  .refine((d) => d.claveNueva === d.confirmacion, {
    path: ["confirmacion"],
    message: "La confirmación no coincide con la clave nueva",
  });

export const EsquemaClaveSola = z.object({ clave }).strict();

export const EsquemaConfirmarTotp = z
  .object({ codigo: z.string({ error: CODIGO_NO_VALIDO }).trim().regex(/^\d{6}$/, CODIGO_NO_VALIDO), clave })
  .strict();
