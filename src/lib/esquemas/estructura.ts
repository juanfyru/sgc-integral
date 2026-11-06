import { z } from "zod";
import { parsearFormulario, textoAcotado } from "@/lib/validacion";

const entero = z.coerce.number().int();
const nombre = textoAcotado("El nombre", 2, 80);

export const EsquemaArea = z.object({ nombre }).strict();

export const EsquemaCargo = z
  .object({
    nombre,
    areaId: entero,
    superiorId: entero.optional(),
  })
  .strict();

// Puras y fuera de "use server": el campo `id` de edición se omite antes del esquema estricto.
export function parsearArea(formData: FormData): { nombre: string } {
  return parsearFormulario(formData, EsquemaArea, { omitir: ["id"] });
}

export function parsearCargo(formData: FormData): {
  nombre: string;
  areaId: number;
  superiorId: number | null;
} {
  const d = parsearFormulario(formData, EsquemaCargo, { omitir: ["id"] });
  return { nombre: d.nombre, areaId: d.areaId, superiorId: d.superiorId ?? null };
}
