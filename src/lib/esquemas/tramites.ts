import { z } from "zod";
import type { AsociacionEntrada } from "@/db/consultas/admin";
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

/** Un campo marcado varias veces llega como lista; una sola, como texto; ninguna, ausente. */
function lista<T extends z.ZodType>(elemento: T) {
  return z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(elemento));
}

const titulo = z.string().trim().min(3).max(200);
const codigoDeDocumento = z.string().trim().toUpperCase().min(1).max(40);

/** Proceso (`p:<id>`) o subproceso (`s:<id>`), como en el formulario del panel. */
const marcaAsociacion = z.string().regex(/^[ps]:[1-9]\d*$/);

function aAsociaciones(principal: string | undefined, otras: string[]): AsociacionEntrada[] {
  const marcas = new Set(principal ? [principal, ...otras] : otras);
  return [...marcas].map((marca) => {
    const numero = Number(marca.slice(2));
    return { ...(marca[0] === "p" ? { procesoId: numero } : { subprocesoId: numero }), esPrincipal: marca === principal };
  });
}

/** La fecha no se compara aquí con hoy: lo hace el manejador, con la hora de la transición. */
const responsables = {
  elaboradorId: id,
  revisorId: id,
  aprobadorId: id,
  venceElaboracion: z.iso.date(),
};

const OBLIGATORIOS_SI_ES_NUEVO = ["tipoDocumentoId", "principal", "titulo", "nivelAcceso", "codigo"] as const;

/** Si el documento ya existía, la clasificación es la suya: el formulario no la envía. */
export const EsquemaAceptarCreacion = z
  .object({
    decision: z.enum(["nuevo", "modificacion"]),
    documentoExistenteId: id.optional(),
    tipoDocumentoId: id.optional(),
    principal: marcaAsociacion.optional(),
    asociaciones: lista(marcaAsociacion),
    titulo: titulo.optional(),
    descripcion: z.string().trim().max(2000).optional(),
    palabrasClave: z.string().trim().max(500).optional(),
    relacionados: lista(id),
    nivelAcceso: z.enum(["general", "restringido"]).optional(),
    codigo: codigoDeDocumento.optional(),
    /** Lo que propuso el sistema: si `codigo` es igual, no se escribió a mano. */
    codigoSugerido: codigoDeDocumento.optional(),
    ...responsables,
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.decision === "modificacion") {
      if (d.documentoExistenteId === undefined)
        ctx.addIssue({ code: "custom", path: ["documentoExistenteId"], message: "Elija el documento que ya existe" });
      return;
    }
    for (const campo of OBLIGATORIOS_SI_ES_NUEVO) {
      if (d[campo] === undefined) ctx.addIssue({ code: "custom", path: [campo], message: "Es obligatorio" });
    }
  })
  .transform(({ principal, asociaciones, ...resto }) => ({
    ...resto,
    asociaciones: aAsociaciones(principal, asociaciones),
  }));

export const EsquemaAceptarModificacion = z.object({ tituloNuevo: titulo.optional(), ...responsables }).strict();

export const EsquemaAceptarEliminacion = z.object({ aprobadorId: id }).strict();

export type DatosAceptarCreacion = z.output<typeof EsquemaAceptarCreacion>;
export type DatosAceptarModificacion = z.output<typeof EsquemaAceptarModificacion>;
export type DatosAceptarEliminacion = z.output<typeof EsquemaAceptarEliminacion>;
