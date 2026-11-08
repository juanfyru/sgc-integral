import { z } from "zod";
import { NUMERO_MAXIMO_DE_VERSION } from "@/lib/tramites/tipos";
import { textoAcotado } from "@/lib/validacion";
import { aAsociaciones, codigoDeDocumento, lista, marcaAsociacion, titulo } from "./tramites";

const id = z.coerce.number().int().positive();

/** `parsearFormulario` omite los campos vacíos y uno de solo espacios queda vacío al recortarlo. */
const opcional = (nombre: string, maximo: number) =>
  textoAcotado(nombre, 0, maximo).optional().transform((v) => v || null);

const fecha = z.iso.date().optional().transform((v) => v ?? null);

const numeroDeVersion = z.coerce
  .number()
  .int("La versión debe ser un entero")
  .min(1, `La versión debe estar entre 1 y ${NUMERO_MAXIMO_DE_VERSION}`)
  .max(NUMERO_MAXIMO_DE_VERSION, `La versión debe estar entre 1 y ${NUMERO_MAXIMO_DE_VERSION}`);

const control = { codigo: codigoDeDocumento, titulo, tipoId: id };

const catalogo = {
  descripcion: opcional("La descripción", 2000),
  palabrasClave: z.string().trim().max(500, "Las palabras clave no pueden pasar de 500 caracteres").optional().transform((v) => v || null),
  nivelAcceso: z.enum(["general", "restringido"]),
  /** Sin él, la asociación principal falta y lo dice el dominio. */
  principal: marcaAsociacion.optional(),
  asociaciones: lista(marcaAsociacion),
  relacionados: lista(id),
};

export const EsquemaControl = z.object(control).strict();

/**
 * La distribución viaja con un marcador `distribucion=1`: una casilla sin marcar no se envía, y sin el
 * marcador no se sabría si el formulario la trae. Sin él, la audiencia del documento no se toca.
 */
export const EsquemaCatalogo = z
  .object({
    ...catalogo,
    distribucion: z.literal("1").optional(),
    listaIds: lista(id),
    lecturaObligatoriaIngreso: z.literal("on").optional(),
  })
  .strict()
  .transform(({ principal, asociaciones, distribucion, listaIds, lecturaObligatoriaIngreso, ...resto }) => ({
    ...resto,
    asociaciones: aAsociaciones(principal, asociaciones),
    ...(distribucion ? { audiencia: { listaIds, lecturaObligatoriaIngreso: lecturaObligatoriaIngreso === "on" } } : {}),
  }));

export const EsquemaDocumentoNuevo = z
  .object({ ...control, ...catalogo, numeroInicial: numeroDeVersion.default(1) })
  .strict()
  .transform(({ principal, asociaciones, ...resto }) => ({
    ...resto,
    asociaciones: aAsociaciones(principal, asociaciones),
  }));

export const EsquemaNuevaVersion = z.object({ numero: numeroDeVersion.optional() }).strict();

export const EsquemaDatosVersion = z
  .object({
    fechaElaboracion: fecha,
    fechaRevision: fecha,
    fechaAprobacion: fecha,
    elaboro: opcional("El campo «Elaboró»", 200),
    reviso: opcional("El campo «Revisó»", 200),
    aprobo: opcional("El campo «Aprobó»", 200),
    resumenCambios: opcional("El resumen de cambios", 2000),
  })
  .strict();

export const EsquemaDeshacerCarga = z.object({ motivo: textoAcotado("El motivo", 5, 1000) }).strict();

/** Las acciones que solo llevan el id de su ruta: cualquier otro campo se rechaza. */
export const EsquemaSinDatos = z.object({}).strict();
