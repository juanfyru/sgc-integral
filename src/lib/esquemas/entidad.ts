import { z } from "zod";
import { TEMAS } from "@/lib/tema";

export const EsquemaTema = z.object({ tema: z.enum(TEMAS) }).strict();

export const EsquemaIdNotificacion = z.object({ id: z.coerce.number().int().positive() }).strict();
