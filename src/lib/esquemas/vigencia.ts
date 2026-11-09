import { z } from "zod";
import { lista } from "@/lib/esquemas/tramites";
import { textoAcotado } from "@/lib/validacion";

const id = z.coerce.number().int().positive();

/** La clave y el código del segundo factor, como en `EsquemaFirma`: la clave no se recorta. */
export const EsquemaRatificar = z
  .object({
    documentoId: id,
    nota: textoAcotado("La nota", 0, 1000).optional(),
    clave: z.string({ error: "Escriba su clave" }).min(1, "Escriba su clave").max(128, "La clave no puede pasar de 128 caracteres"),
    codigo: textoAcotado("El código", 6, 20).optional(),
  })
  .strict();

export const EsquemaFijarFecha = z
  .object({
    documentoIds: lista(id).pipe(z.array(z.number()).min(1, "Elija al menos un documento")),
    fecha: z.string({ error: "Elija la fecha" }).regex(/^\d{4}-\d{2}-\d{2}$/, "Elija una fecha válida"),
    nota: textoAcotado("La nota", 5, 500),
  })
  .strict();

/** Vacío (no llega en el formulario): rige el plazo del tipo de documento. */
export const EsquemaAjustarPlazo = z
  .object({
    documentoId: id,
    mesesRevision: z.string().regex(/^\d{0,3}$/, "Escriba el plazo en meses").optional(),
  })
  .strict();

export const EsquemaQuitarFecha = z.object({ documentoId: id }).strict();
