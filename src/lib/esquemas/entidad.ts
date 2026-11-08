import { z } from "zod";
import { TEMAS } from "@/lib/tema";
import { textoAcotado } from "@/lib/validacion";

export const EsquemaTema = z.object({ tema: z.enum(TEMAS) }).strict();

export const EsquemaIdNotificacion = z.object({ id: z.coerce.number().int().positive() }).strict();

const ColorHex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido")
  .transform((v) => v.toLowerCase());

// parsearFormulario omite los campos vacíos: el lema llega como undefined.
export const EsquemaEntidad = z
  .object({
    nombre_entidad: textoAcotado("El nombre de la entidad", 3, 120),
    sigla_entidad: textoAcotado("La sigla", 2, 12),
    lema: textoAcotado("El lema", 0, 200).default(""),
    // Regulación: Ley 1581 de 2012, art. 12; Decreto 1377 de 2013. Vaciarlo borraría el texto que se acepta al ingresar.
    aviso_datos_personales: z
      .string()
      .trim()
      .min(1, "El aviso de datos personales es obligatorio (Ley 1581 de 2012)")
      .max(5000, "El aviso de datos personales no puede pasar de 5000 caracteres"),
    color_primario: ColorHex,
    color_secundario: ColorHex,
    url_publica: z.string().trim().max(200).default(""),
  })
  .strict();
