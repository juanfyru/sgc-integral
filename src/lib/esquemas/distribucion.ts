import { z } from "zod";
import { MOTIVOS_ANULACION } from "@/lib/distribucion/tipos";
import type { DatosPuntoUso } from "@/db/consultas/distribucion/puntos-uso";
import { lista } from "@/lib/esquemas/tramites";
import { parsearFormulario, textoAcotado } from "@/lib/validacion";

const id = z.coerce.number().int().positive();

export const EsquemaPuntoUso = z
  .object({
    nombre: textoAcotado("El nombre", 2, 80),
    sede: textoAcotado("La sede", 0, 80).optional(),
    ubicacion: textoAcotado("La ubicación", 0, 200).optional(),
    responsableId: id,
    procesoIds: lista(id),
  })
  .strict();

export const EsquemaAlternar = z.object({ activo: z.enum(["true", "false"]) }).strict();

/** Pura y fuera de "use server": el `id` de edición viaja en el formulario pero no es del esquema estricto. */
export function parsearPuntoUso(formData: FormData): DatosPuntoUso {
  const d = parsearFormulario(formData, EsquemaPuntoUso, { omitir: ["id"] });
  return {
    nombre: d.nombre,
    sede: d.sede || null,
    ubicacion: d.ubicacion || null,
    responsableId: d.responsableId,
    procesoIds: d.procesoIds,
  };
}

export const EsquemaEmitirCopia = z
  .object({
    documentoId: id,
    puntoUsoId: id,
    nota: textoAcotado("La nota", 0, 200).optional(),
    reemplazaCopiaId: id.optional(),
  })
  .strict();

export const EsquemaRecogida = z.object({ destino: z.enum(["devuelta", "destruida", "no_encontrada"]) }).strict();

export const EsquemaReemplazo = z.object({ destino: z.enum(["devuelta", "destruida"]) }).strict();

export const EsquemaAnulacion = z
  .object({
    motivo: z.enum(MOTIVOS_ANULACION, { error: "Elija el motivo de la anulación" }),
    texto: textoAcotado("La explicación", 0, 300).optional(),
  })
  .strict();

export const EsquemaReemplazarCopias = z.object({ versionId: id }).strict();
