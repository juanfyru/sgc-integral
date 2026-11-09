import { z } from "zod";
import { ESTADOS_NORMA, TIPOS_RELACION } from "@/lib/normograma/tipos";
import { textoAcotado } from "@/lib/validacion";

const id = z.coerce.number().int().positive();

/** `parsearFormulario` omite los campos vacíos y uno de solo espacios queda vacío al recortarlo. */
const opcional = (nombre: string, maximo: number) =>
  textoAcotado(nombre, 0, maximo).optional().transform((v) => v || null);

const fecha = (mensaje: string) => z.iso.date(mensaje);

/**
 * Los datos de una norma; el `id` de la ruta (al editar) se lee aparte con `idNumerico`. El enlace oficial es texto, no
 * una URL que se valide o se abra (F13C-DC19).
 */
export const EsquemaNorma = z
  .object({
    tipoNormaId: id,
    numero: textoAcotado("El número", 1, 40),
    anio: z.coerce
      .number({ error: "Escriba el año de la norma" })
      .int("El año es un número entero")
      .min(1800, "El año debe estar entre 1800 y 2100")
      .max(2100, "El año debe estar entre 1800 y 2100"),
    fechaExpedicion: fecha("Elija una fecha de expedición válida").optional().transform((v) => v ?? null),
    entidadEmisora: textoAcotado("La entidad emisora", 2, 200),
    titulo: textoAcotado("El título", 3, 500),
    tema: opcional("El tema", 2000),
    enlaceOficial: opcional("El enlace oficial", 500),
    notas: opcional("Las notas", 2000),
  })
  .strict();

export const EsquemaEstadoNorma = z
  .object({
    normaId: id,
    estado: z.enum(ESTADOS_NORMA, { error: "Elija el estado de la norma" }),
    fecha: fecha("Elija una fecha válida"),
    nota: opcional("La nota", 1000),
  })
  .strict();

/** Sin fecha, la del cambio de estado es la de expedición de la norma nueva (o la de hoy). */
export const EsquemaRelacion = z
  .object({
    normaId: id,
    afectadaId: id,
    tipo: z.enum(TIPOS_RELACION, { error: "Elija el tipo de relación" }),
    detalle: opcional("El detalle", 500),
    fecha: fecha("Elija una fecha válida").optional(),
  })
  .strict();

/** Retirar una norma o eliminar una relación; el `id` de la ruta se lee aparte. */
export const EsquemaMotivo = z.object({ motivo: textoAcotado("El motivo", 5, 500) }).strict();

/** También para quitar la asociación (sin requisito). */
export const EsquemaAsociarProceso = z
  .object({
    normaId: id,
    procesoId: id,
    requisito: opcional("El requisito", 2000),
  })
  .strict();

/** También para quitar el enlace. */
export const EsquemaEnlazarDocumento = z.object({ normaId: id, documentoId: id }).strict();

export const EsquemaResolverImpacto = z.discriminatedUnion(
  "resolucion",
  [
    z.object({ impactoId: id, resolucion: z.literal("no_afecta"), nota: textoAcotado("La nota", 5, 1000) }).strict(),
    z.object({ impactoId: id, resolucion: z.literal("solicitud"), tramiteId: id }).strict(),
    z.object({ impactoId: id, resolucion: z.literal("verificacion"), verificacionId: id }).strict(),
  ],
  { error: "Elija cómo se resuelve el impacto" },
);

export const EsquemaTipoNorma = z.object({ nombre: textoAcotado("El nombre del tipo de norma", 2, 60) }).strict();

export const EsquemaMoverTipoNorma = z.object({ direccion: z.enum(["arriba", "abajo"]) }).strict();
