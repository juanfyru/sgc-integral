import { z } from "zod";
import { aAsociaciones, lista, marcaAsociacion, titulo } from "@/lib/esquemas/tramites";
import { textoAcotado } from "@/lib/validacion";
import { RESULTADOS_VERIFICACION } from "@/lib/vigencia/tipos";

const id = z.coerce.number().int().positive();

/** `parsearFormulario` omite los campos vacíos y uno de solo espacios queda vacío al recortarlo. */
const opcional = (nombre: string, maximo: number) =>
  textoAcotado(nombre, 0, maximo).optional().transform((v) => v || null);

const fecha = z.iso.date("Elija una fecha válida").optional().transform((v) => v ?? null);

/** La clave y el código del segundo factor de una firma: la clave no se recorta. */
const firma = {
  clave: z.string({ error: "Escriba su clave" }).min(1, "Escriba su clave").max(128, "La clave no puede pasar de 128 caracteres"),
  codigo: textoAcotado("El código", 6, 20).optional(),
};

/** La clave y el código del segundo factor, como en `EsquemaFirma`: la clave no se recorta. */
export const EsquemaRatificar = z
  .object({
    documentoId: id,
    nota: textoAcotado("La nota", 0, 1000).optional(),
    ...firma,
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

// ── Documentos externos (spec 13C §8) ──

const verificacionMeses = z.coerce
  .number({ error: "Escriba la periodicidad de verificación en meses" })
  .int("La periodicidad de verificación es un número entero de meses")
  .min(1, "La periodicidad de verificación debe estar entre 1 y 60 meses")
  .max(60, "La periodicidad de verificación debe estar entre 1 y 60 meses");

const control = {
  entidadEmisora: textoAcotado("La entidad emisora", 2, 200),
  tituloOriginal: opcional("El título original", 300),
  fuenteOficial: opcional("La fuente oficial", 500),
  responsableId: id,
  verificacionMeses,
  normaId: id.optional(),
};

const edicion = {
  edicion: textoAcotado("La edición", 1, 60),
  fechaEdicion: fecha,
};

/** El alta: el proceso propietario (y su subproceso, si se elige uno), los demás procesos donde aplica y la primera edición. */
export const EsquemaExterno = z
  .object({
    titulo,
    procesoId: id,
    subprocesoId: id.optional(),
    otrosProcesos: lista(marcaAsociacion),
    nivelAcceso: z.enum(["general", "restringido"], { error: "Elija el nivel de acceso" }),
    descripcion: opcional("La descripción", 2000),
    palabrasClave: opcional("Las palabras clave", 500),
    ...control,
    ...edicion,
  })
  .strict()
  .transform(({ subprocesoId, normaId, otrosProcesos, ...resto }) => ({
    ...resto,
    subprocesoId: subprocesoId ?? null,
    normaId: normaId ?? null,
    otrosProcesos: aAsociaciones(undefined, otrosProcesos),
  }));

/** El `id` de la ruta es el del documento: se lee aparte con `idNumerico`. */
export const EsquemaControlExterno = z
  .object(control)
  .strict()
  .transform(({ normaId, ...resto }) => ({ ...resto, normaId: normaId ?? null }));

/**
 * Abrir o corregir una edición; el `id` de la ruta (documento o versión) se lee aparte con `idNumerico`. «Qué cambió»
 * puede faltar, y uno de solo espacios es vacío: el dominio lo exige cuando ya hay una edición vigente.
 */
export const EsquemaEdicion = z
  .object({
    ...edicion,
    resumenCambios: opcional("Qué cambió", 2000).refine(
      (v) => v === null || v.length >= 5,
      "Qué cambió debe tener al menos 5 caracteres",
    ),
  })
  .strict();

/** `huella`: la que mostró el diálogo; no llega si no había archivo principal. */
export const EsquemaAdoptar = z
  .object({
    versionId: id,
    huella: z.string().regex(/^[0-9a-f]{64}$/, "La huella del archivo no es válida").optional(),
    pedirAcuses: z.literal("on").optional(),
    requiereSocializacion: z.literal("on").optional(),
    ...firma,
  })
  .strict();

/** `impactoId`: la verificación pedida desde un impacto normativo lo resuelve (spec 13C §10.5). */
export const EsquemaVerificacion = z
  .object({
    documentoId: id,
    resultado: z.enum(RESULTADOS_VERIFICACION, { error: "Elija el resultado de la verificación" }),
    fuente: textoAcotado("La fuente consultada", 3, 300),
    nota: opcional("La nota", 1000),
    impactoId: id.optional(),
  })
  .strict();

export const EsquemaRetirar = z.object({ documentoId: id, motivo: textoAcotado("El motivo", 5, 500) }).strict();
