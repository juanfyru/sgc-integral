import { z } from "zod";
import type { AsociacionEntrada } from "@/db/consultas/admin";
import { PAPELES } from "@/lib/tramites/separacion";
import { MAX_OBSERVACIONES_APROBACION, MOTIVOS, TIPOS_SOLICITUD } from "@/lib/tramites/tipos";

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

const motivo = z.string().trim().min(5).max(1000);

export const EsquemaMotivoCierre = z.object({ motivo }).strict();

/** `papel` falta cuando solo cambia la fecha; lo que debe venir junto lo decide el manejador. */
export const EsquemaReasignar = z
  .object({ papel: z.enum(PAPELES).optional(), usuarioId: id.optional(), venceEn: z.iso.date().optional(), motivo })
  .strict();

export const EsquemaControlCambios = z.object({ resumenCambios: z.string().trim().min(5).max(2000) }).strict();

const textoDeRevision = z.string().trim().min(5).max(2000);

export const EsquemaObservacion = z.object({ texto: textoDeRevision }).strict();
export const EsquemaRespuestaObservacion = z.object({ respuesta: textoDeRevision }).strict();
export const EsquemaReaperturaObservacion = z.object({ nota: textoDeRevision }).strict();
export const EsquemaConcepto = z.object({ concepto: textoDeRevision }).strict();

export const EsquemaVerificacion = z
  .array(
    z
      .object({
        itemId: id,
        resultado: z.enum(["cumple", "no_cumple", "no_aplica"]),
        nota: z.string().trim().max(2000).optional(),
      })
      .strict(),
  )
  .min(1, "Marque al menos un ítem");

/**
 * La lista viaja como `resultado_<id>` (un radio por ítem) y `nota_<id>`: los campos dependen de
 * los ítems, así que no caben en un esquema estricto de claves fijas. Un ítem sin marcar no se envía.
 */
export function leerVerificacion(formData: FormData, omitir: readonly string[]): z.output<typeof EsquemaVerificacion> {
  const respuestas: { itemId: string; resultado: string; nota?: string }[] = [];
  for (const clave of new Set(formData.keys())) {
    if (clave.startsWith("$ACTION_") || omitir.includes(clave)) continue;
    const m = /^(resultado|nota)_(\d+)$/.exec(clave);
    if (!m) throw new Error("Formulario inválido. Recargue la página.");
    if (m[1] === "nota") {
      if (typeof formData.get(clave) === "string" && String(formData.get(clave)).trim() && !formData.get(`resultado_${m[2]}`))
        throw new Error("Elija un resultado para guardar la nota");
      continue;
    }
    const nota = formData.get(`nota_${m[2]}`);
    respuestas.push({ itemId: m[2], resultado: String(formData.get(clave)), ...(typeof nota === "string" && nota.trim() ? { nota } : {}) });
  }
  const resultado = EsquemaVerificacion.safeParse(respuestas);
  if (!resultado.success) throw new Error(resultado.error.issues[0].message);
  return resultado.data;
}

/** La clave no se recorta: un espacio al final es parte de ella. */
export const EsquemaFirma = z
  .object({
    clave: z.string().min(1).max(128),
    codigo: z.string().trim().min(6).max(20).optional(),
  })
  .strict();

/** Un campo marcado varias veces llega como lista; una sola, como texto; ninguna, ausente. */
function aLista(v: unknown): unknown[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

function lista<T extends z.ZodType>(elemento: T) {
  return z.preprocess(aLista, z.array(elemento));
}

export const EsquemaDevolucionAprobacion = z
  .object({ observaciones: z.preprocess(aLista, z.array(textoDeRevision).min(1).max(MAX_OBSERVACIONES_APROBACION)) })
  .strict();

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

export const EsquemaCorreccionDatos = z
  .object({ titulo: titulo.optional(), codigo: codigoDeDocumento.optional(), tipoDocumentoId: id.optional() })
  .strict();

export type DatosAceptarCreacion = z.output<typeof EsquemaAceptarCreacion>;
export type DatosAceptarModificacion = z.output<typeof EsquemaAceptarModificacion>;
export type DatosAceptarEliminacion = z.output<typeof EsquemaAceptarEliminacion>;
export type DatosReasignar = z.output<typeof EsquemaReasignar>;
export type DatosCorreccion = z.output<typeof EsquemaCorreccionDatos>;
