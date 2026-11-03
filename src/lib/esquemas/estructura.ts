import { z } from "zod";

const entero = z.coerce.number().int();

export const EsquemaArea = z.object({ nombre: z.string().trim().min(2).max(80) }).strict();

export const EsquemaCargo = z
  .object({
    nombre: z.string().trim().min(2).max(80),
    areaId: entero,
    superiorId: entero.optional(),
  })
  .strict();
