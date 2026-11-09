import { z } from "zod";
import type { AsociacionEntrada } from "@/db/consultas/admin";
import { PAPELES } from "@/lib/tramites/separacion";
import { MAX_OBSERVACIONES_APROBACION, MOTIVOS, TIPOS_SOLICITUD } from "@/lib/tramites/tipos";
import { textoAcotado } from "@/lib/validacion";

const id = z.coerce.number().int().positive();

export const EsquemaSolicitud = z
  .object({
    tipo: z.enum(TIPOS_SOLICITUD),
    motivo: z.enum(MOTIVOS),
    justificacion: textoAcotado("La justificación", 10, 2000),
    procesoId: id.optional(),
    subprocesoId: id.optional(),
    tipoDocumentoId: id.optional(),
    tituloPropuesto: textoAcotado("El título propuesto", 3, 200).optional(),
    documentoId: id.optional(),
    // La revisión anual abierta y el impacto normativo de los que nace (spec 13C §9.3 y §10.5); `crearSolicitud` los valida.
    revisionAnualId: id.optional(),
    impactoId: id.optional(),
  })
  .strict();

const motivo = textoAcotado("El motivo", 5, 1000);

export const EsquemaMotivoCierre = z.object({ motivo }).strict();

/** `papel` falta cuando solo cambia la fecha; lo que debe venir junto lo decide el manejador. */
export const EsquemaReasignar = z
  .object({
    papel: z.enum(PAPELES).optional(),
    usuarioId: id.optional(),
    aprobadorId: id.optional(),
    venceEn: z.iso.date().optional(),
    motivo,
  })
  .strict();

export const EsquemaControlCambios = z.object({ resumenCambios: textoAcotado("El control de cambios", 5, 2000) }).strict();

const textoDeRevision = (nombre: string) => textoAcotado(nombre, 5, 2000);
const observacion = textoDeRevision("La observación");

export const EsquemaObservacion = z.object({ texto: observacion }).strict();
export const EsquemaRespuestaObservacion = z.object({ respuesta: textoDeRevision("La respuesta") }).strict();
export const EsquemaReaperturaObservacion = z.object({ nota: textoDeRevision("La nota de reapertura") }).strict();
/** `confirmaNoCumple` es la huella de los criterios que la persona vio al confirmar. */
export const EsquemaConcepto = z
  .object({
    concepto: textoDeRevision("El concepto"),
    confirmaNoCumple: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
  })
  .strict();

export const EsquemaVerificacion = z
  .array(
    z
      .object({
        itemId: id,
        resultado: z.enum(["cumple", "no_cumple", "no_aplica"]),
        nota: textoAcotado("La nota", 0, 2000).optional(),
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
    clave: z.string({ error: "Escriba su clave" }).min(1, "Escriba su clave").max(128, "La clave no puede pasar de 128 caracteres"),
    codigo: textoAcotado("El código", 6, 20).optional(),
  })
  .strict();

/** Un campo marcado varias veces llega como lista; una sola, como texto; ninguna, ausente. */
function aLista(v: unknown): unknown[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

export function lista<T extends z.ZodType>(elemento: T) {
  return z.preprocess(aLista, z.array(elemento));
}

export const EsquemaDevolucionAprobacion = z
  .object({
    observaciones: z.preprocess(
      aLista,
      z
        .array(observacion)
        .min(1, "Escriba al menos una observación")
        .max(MAX_OBSERVACIONES_APROBACION, `No se pueden enviar más de ${MAX_OBSERVACIONES_APROBACION} observaciones`),
    ),
  })
  .strict();

export const titulo = textoAcotado("El título", 3, 200);
export const codigoDeDocumento = textoAcotado("El código", 1, 40).toUpperCase();

/** Proceso (`p:<id>`) o subproceso (`s:<id>`), como en el formulario del panel. */
export const marcaAsociacion = z.string().regex(/^[ps]:[1-9]\d*$/);

export function aAsociaciones(principal: string | undefined, otras: string[]): AsociacionEntrada[] {
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

const OBLIGATORIOS_SI_ES_NUEVO = {
  tipoDocumentoId: "Elija el tipo de documento",
  principal: "Elija el proceso propietario",
  titulo: "Escriba el título",
  nivelAcceso: "Elija el nivel de acceso",
  codigo: "Escriba el código",
} as const;

/** Si el documento ya existía, la clasificación es la suya: el formulario no la envía. */
export const EsquemaAceptarCreacion = z
  .object({
    decision: z.enum(["nuevo", "modificacion"]),
    documentoExistenteId: id.optional(),
    tipoDocumentoId: id.optional(),
    principal: marcaAsociacion.optional(),
    asociaciones: lista(marcaAsociacion),
    titulo: titulo.optional(),
    descripcion: textoAcotado("La descripción", 0, 2000).optional(),
    palabrasClave: z.string().trim().max(500, "Las palabras clave no pueden pasar de 500 caracteres").optional(),
    relacionados: lista(id),
    nivelAcceso: z.enum(["general", "restringido"]).optional(),
    codigo: codigoDeDocumento.optional(),
    /** Lo que propuso el sistema: si `codigo` es igual, no se escribió a mano. */
    codigoSugerido: codigoDeDocumento.optional(),
    requiereSocializacion: z.literal("on").optional(),
    ...responsables,
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.decision === "modificacion") {
      if (d.documentoExistenteId === undefined)
        ctx.addIssue({ code: "custom", path: ["documentoExistenteId"], message: "Elija el documento que ya existe" });
      return;
    }
    for (const [campo, message] of Object.entries(OBLIGATORIOS_SI_ES_NUEVO)) {
      if (d[campo as keyof typeof OBLIGATORIOS_SI_ES_NUEVO] === undefined) ctx.addIssue({ code: "custom", path: [campo], message });
    }
  })
  .transform(({ principal, asociaciones, ...resto }) => ({
    ...resto,
    asociaciones: aAsociaciones(principal, asociaciones),
  }));

export const EsquemaAceptarModificacion = z
  .object({ tituloNuevo: titulo.optional(), requiereSocializacion: z.literal("on").optional(), ...responsables })
  .strict();

export const EsquemaAceptarEliminacion = z.object({ aprobadorId: id }).strict();

/** El propietario viaja como en la aceptación, en un solo campo; el dominio lo recibe separado. */
export const EsquemaCorreccionDatos = z
  .object({
    titulo: titulo.optional(),
    codigo: codigoDeDocumento.optional(),
    tipoDocumentoId: id.optional(),
    principal: marcaAsociacion.optional(),
    aprobadorId: id.optional(),
    /** La marca de socialización viaja como «si»/«no»: una casilla sin marcar no se envía y no distinguiría «no tocar». */
    requiereSocializacion: z.enum(["si", "no"]).optional(),
  })
  .strict()
  .transform(({ principal, requiereSocializacion, ...resto }) => {
    const [propietario] = aAsociaciones(principal, []);
    return {
      ...resto,
      procesoId: propietario?.procesoId,
      subprocesoId: propietario?.subprocesoId,
      requiereSocializacion: requiereSocializacion === undefined ? undefined : requiereSocializacion === "si",
    };
  });

export type DatosAceptarCreacion = z.output<typeof EsquemaAceptarCreacion>;
export type DatosAceptarModificacion = z.output<typeof EsquemaAceptarModificacion>;
export type DatosAceptarEliminacion = z.output<typeof EsquemaAceptarEliminacion>;
export type DatosReasignar = z.output<typeof EsquemaReasignar>;
export type DatosCorreccion = Partial<z.output<typeof EsquemaCorreccionDatos>>;
