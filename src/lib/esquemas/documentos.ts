import { z } from "zod";
import { NUMERO_MAXIMO_DE_VERSION } from "@/lib/tramites/tipos";
import { aAsociaciones, codigoDeDocumento, lista, marcaAsociacion, titulo } from "./tramites";

const id = z.coerce.number().int().positive();

/** `parsearFormulario` omite los campos vacíos y uno de solo espacios queda vacío al recortarlo. */
const opcional = (maximo: number) =>
  z.string().trim().max(maximo).optional().transform((v) => v || null);

const fecha = z.iso.date().optional().transform((v) => v ?? null);

const numeroDeVersion = z.coerce
  .number()
  .int("La versión debe ser un entero")
  .min(1, `La versión debe estar entre 1 y ${NUMERO_MAXIMO_DE_VERSION}`)
  .max(NUMERO_MAXIMO_DE_VERSION, `La versión debe estar entre 1 y ${NUMERO_MAXIMO_DE_VERSION}`);

const control = { codigo: codigoDeDocumento, titulo, tipoId: id };

const catalogo = {
  descripcion: opcional(2000),
  palabrasClave: opcional(500),
  nivelAcceso: z.enum(["general", "restringido"]),
  /** Sin él, la asociación principal falta y lo dice el dominio. */
  principal: marcaAsociacion.optional(),
  asociaciones: lista(marcaAsociacion),
  relacionados: lista(id),
};

export const EsquemaControl = z.object(control).strict();

export const EsquemaCatalogo = z
  .object(catalogo)
  .strict()
  .transform(({ principal, asociaciones, ...resto }) => ({
    ...resto,
    asociaciones: aAsociaciones(principal, asociaciones),
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
    elaboro: opcional(200),
    reviso: opcional(200),
    aprobo: opcional(200),
    resumenCambios: opcional(2000),
  })
  .strict();

export const EsquemaDeshacerCarga = z.object({ motivo: z.string().trim().min(5).max(1000) }).strict();

/** Las acciones que solo llevan el id de su ruta: cualquier otro campo se rechaza. */
export const EsquemaSinDatos = z.object({}).strict();
