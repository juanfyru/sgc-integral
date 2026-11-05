import { z } from "zod";
import { MOTIVOS, TIPOS_SOLICITUD } from "@/lib/tramites/tipos";

const id = z.coerce.number().int().positive();

export const EsquemaSolicitud = z
  .object({
    tipo: z.enum(TIPOS_SOLICITUD),
    motivo: z.enum(MOTIVOS),
    justificacion: z.string().trim().min(10).max(2000),
    procesoId: id.optional(),
    subprocesoId: id.optional(),
    tipoDocumentoId: id.optional(),
    tituloPropuesto: z.string().trim().min(3).max(200).optional(),
    documentoId: id.optional(),
  })
  .strict();

export const EsquemaMotivoCierre = z.object({ motivo: z.string().trim().min(5).max(1000) }).strict();

/** La clave no se recorta: un espacio al final es parte de ella. */
export const EsquemaFirma = z
  .object({
    clave: z.string().min(1).max(128),
    codigo: z.string().trim().min(6).max(20).optional(),
  })
  .strict();
