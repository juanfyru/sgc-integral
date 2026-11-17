import { z } from "zod";
import { esExterno, fuenteObligatoria, pideReferenciaDelCaso } from "@/lib/mejoramiento/origenes";
import { CLASES, CRITICIDADES, ORIGENES_HALLAZGO } from "@/lib/mejoramiento/tipos";
import { textoAcotado } from "@/lib/validacion";

/** Un entero llega como texto del formulario o como número de la consulta. */
const entero = (nombre: string, minimo: number, maximo: number) =>
  z
    .union([z.number(), z.string().regex(/^\d{1,6}$/)], { error: `${nombre} debe ser un número entero` })
    .transform(Number)
    .pipe(
      z
        .number()
        .int(`${nombre} debe ser un número entero`)
        .min(minimo, `${nombre} debe estar entre ${minimo} y ${maximo}`)
        .max(maximo, `${nombre} debe estar entre ${minimo} y ${maximo}`),
    );

/** Un documento elegido: vacío o ausente es «sin documento». */
const documentoOpcional = (nombre: string) =>
  z
    .union([z.number().nullable(), z.string().regex(/^\d{1,15}$/), z.literal("")], { error: `${nombre} no es un documento válido` })
    .optional()
    .transform((v) => (v === undefined || v === null || v === "" || Number(v) <= 0 ? null : Number(v)));

const plazo = (nombre: string) => entero(`El plazo de ${nombre}`, 1, 60);

/** La configuración tal como la guarda `guardarConfigMejora` (la forma de `ConfigMejora`). */
export const EsquemaConfigMejora = z
  .object({
    plazos: z
      .object({
        clasificar: plazo("clasificar"),
        aceptar: plazo("aceptar"),
        decision: plazo("decidir"),
        correccion: plazo("la corrección"),
        formular: plazo("formular el plan"),
        reenviar: plazo("reenviar el plan"),
        revisar: plazo("revisar el plan"),
        aprobar: plazo("aprobar el plan"),
        verificar: plazo("verificar"),
        evaluar: plazo("evaluar la eficacia"),
      })
      .strict(),
    recordatorioAltaDias: entero("El recordatorio de un hallazgo recién registrado", 1, 365),
    recordatorioDias: entero("El recordatorio", 1, 365),
    formatos: z
      .object({
        registro: documentoOpcional("El formato de registro"),
        porques: documentoOpcional("El formato de los cinco porqués"),
        ishikawa: documentoOpcional("El formato de Ishikawa"),
      })
      .strict(),
  })
  .strict();

/**
 * Los campos planos de los formularios de configuración. Cada formulario manda su `bloque` y solo sus campos:
 * «plazos» (los diez plazos y los dos recordatorios) o «formatos» (un selector por impreso; vacío es «sin documento»,
 * y `parsearFormulario` descarta los vacíos, por eso el bloque dice qué se envió).
 */
export const EsquemaFormularioConfigMejora = z
  .object({
    bloque: z.enum(["plazos", "formatos"], { error: "Falta el bloque de la configuración" }),
    plazo_clasificar: z.string().optional(),
    plazo_aceptar: z.string().optional(),
    plazo_decision: z.string().optional(),
    plazo_correccion: z.string().optional(),
    plazo_formular: z.string().optional(),
    plazo_reenviar: z.string().optional(),
    plazo_revisar: z.string().optional(),
    plazo_aprobar: z.string().optional(),
    plazo_verificar: z.string().optional(),
    plazo_evaluar: z.string().optional(),
    recordatorioAltaDias: z.string().optional(),
    recordatorioDias: z.string().optional(),
    formato_registro: z.string().optional(),
    formato_porques: z.string().optional(),
    formato_ishikawa: z.string().optional(),
  })
  .strict();

export const EsquemaDiaDeCalendario = z
  .object({
    fecha: z
      .string({ error: "Elija la fecha" })
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Elija una fecha válida")
      .refine((f) => {
        const ms = Date.parse(`${f}T00:00:00Z`);
        return !Number.isNaN(ms) && new Date(ms).toISOString().startsWith(f);
      }, "Elija una fecha válida"),
    tipo: z.enum(["no_habil", "habil"], { error: "Elija si el día es no hábil o hábil" }),
    motivo: textoAcotado("El motivo", 1, 200),
  })
  .strict();

// ─────────────────────────────────────────────────────────────────────────────
// El hallazgo (spec 15 §7.1)
// ─────────────────────────────────────────────────────────────────────────────

const esFechaReal = (f: string) => {
  const ms = Date.parse(`${f}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().startsWith(f);
};

/** Un id elegido: llega como número o como texto del formulario; vacío o ausente es «ninguno». */
const idOpcional = (mensaje: string) =>
  z
    .union([z.number().int().positive().nullable(), z.string().regex(/^\d{1,15}$/), z.literal("")], { error: mensaje })
    .optional()
    .transform((v) => (v === undefined || v === null || v === "" ? null : Number(v)));

/** Texto opcional recortado: vacío o solo espacios es «nada». */
const textoOpcional = (nombre: string, maximo: number) =>
  z
    .string({ error: `${nombre} no es un texto válido` })
    .trim()
    .max(maximo, `${nombre} no puede pasar de ${maximo} caracteres`)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

const fechaOpcional = (mensaje: string) =>
  z
    .string({ error: mensaje })
    .nullable()
    .optional()
    .transform((v) => v?.trim() || null)
    .refine((v) => v === null || (/^\d{4}-\d{2}-\d{2}$/.test(v) && esFechaReal(v)), mensaje);

/**
 * La identificación de un hallazgo tal como la recibe `registrarHallazgo` (objeto del dominio o campos del formulario).
 * Lo que depende de la base o de la hora (la fecha futura, los enlaces) lo comprueba el dominio.
 */
export const EsquemaHallazgo = z
  .object({
    clase: z.enum(CLASES, { error: "Elija la clase del hallazgo" }),
    origen: z.enum(ORIGENES_HALLAZGO, { error: "Elija el origen del hallazgo" }),
    fuente: textoOpcional("La fuente", 200),
    referenciaCaso: textoOpcional("La referencia del caso", 100),
    detectadoEn: z
      .string({ error: "Escriba la fecha en que se detectó" })
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Escriba una fecha válida en que se detectó")
      .refine(esFechaReal, "Escriba una fecha válida en que se detectó"),
    procesoId: z
      .union([z.number().int().positive(), z.string().regex(/^\d{1,15}$/)], { error: "Elija el proceso" })
      .transform(Number),
    subprocesoId: idOpcional("El subproceso elegido no es válido"),
    criticidad: z
      .enum(CRITICIDADES, { error: "Elija una criticidad válida" })
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    titulo: z
      .string({ error: "Escriba el título" })
      .trim()
      .min(1, "Escriba el título")
      .max(150, "El título no puede pasar de 150 caracteres"),
    descripcion: textoAcotado("La descripción", 10, 4000),
    requisitoClausula: textoOpcional("La cláusula incumplida", 200),
    requisitoNormaId: idOpcional("La norma elegida no es válida"),
    requisitoDocumentoId: idOpcional("El documento del requisito no es válido"),
    documentoId: idOpcional("El documento elegido no es válido"),
    indicadorId: idOpcional("El indicador elegido no es válido"),
    medicionId: idOpcional("La medición elegida no es válida"),
    riesgo: textoOpcional("El riesgo asociado", 200),
    fechaLimiteEnte: fechaOpcional("Escriba una fecha límite de respuesta al ente válida"),
    reincidenteDe: idOpcional("El hallazgo anterior no es válido"),
    reporteId: idOpcional("El reporte no es válido"),
  })
  .strict()
  .superRefine((d, ctx) => {
    const falta = (campo: string, message: string) => ctx.addIssue({ code: "custom", path: [campo], message });
    const esNc = d.clase === "no_conformidad";
    if (esNc && d.criticidad === null) falta("criticidad", "Elija la criticidad");
    if (esNc && !d.requisitoClausula && d.requisitoNormaId === null && d.requisitoDocumentoId === null) {
      falta("requisitoClausula", "Indique al menos un requisito incumplido");
    }
    if (fuenteObligatoria(d.origen, d.medicionId !== null) && !d.fuente) falta("fuente", "Escriba la fuente");
    if (pideReferenciaDelCaso(d.origen) && !d.referenciaCaso) falta("referenciaCaso", "Escriba la referencia del caso");
    if (d.origen === "ente_control" && !d.fechaLimiteEnte) {
      falta("fechaLimiteEnte", "Escriba la fecha límite de respuesta al ente");
    }
  })
  // La criticidad solo existe en la no conformidad y la fecha del ente solo en los orígenes externos: lo demás se ignora.
  .transform((d) => ({
    ...d,
    criticidad: d.clase === "no_conformidad" ? d.criticidad : null,
    fechaLimiteEnte: esExterno(d.origen) ? d.fechaLimiteEnte : null,
  }));

export type HallazgoValidado = z.output<typeof EsquemaHallazgo>;

// ─────────────────────────────────────────────────────────────────────────────
// Ocurrencias, reclasificación, anulación y cambio de proceso (spec 15 §7.5 y §7.6)
// ─────────────────────────────────────────────────────────────────────────────

/** El id de un hallazgo: llega como número o como texto del formulario. */
const idDeHallazgo = z
  .union([z.number().int().positive(), z.string().regex(/^\d{1,15}$/)], { error: "El hallazgo no es válido" })
  .transform(Number)
  .refine((n) => Number.isSafeInteger(n) && n > 0, "El hallazgo no es válido");

/** La justificación de un acto que cambia lo registrado: al menos diez caracteres. */
export const justificacion = textoAcotado("La justificación", 10, 1000);

export const EsquemaOcurrencia = z
  .object({
    hallazgoId: idDeHallazgo,
    fecha: z
      .string({ error: "Escriba la fecha de la ocurrencia" })
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Escriba una fecha válida de la ocurrencia")
      .refine(esFechaReal, "Escriba una fecha válida de la ocurrencia"),
    descripcion: textoAcotado("La descripción de la ocurrencia", 10, 4000),
    origen: z.enum(["registro", "reporte", "medicion"], { error: "El origen de la ocurrencia no es válido" }).optional(),
    reporteId: idOpcional("El reporte no es válido"),
  })
  .strict()
  .transform((d) => ({ ...d, origen: d.origen ?? ("registro" as const) }));
export type OcurrenciaValidada = z.output<typeof EsquemaOcurrencia>;

export const EsquemaReclasificacion = z
  .object({
    hallazgoId: idDeHallazgo,
    clase: z.enum(CLASES, { error: "Elija la clase del hallazgo" }),
    criticidad: z
      .enum(CRITICIDADES, { error: "Elija una criticidad válida" })
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    origen: z.enum(ORIGENES_HALLAZGO, { error: "Elija el origen del hallazgo" }),
    fuente: textoOpcional("La fuente", 200),
    referenciaCaso: textoOpcional("La referencia del caso", 100),
    titulo: z
      .string({ error: "Escriba el título" })
      .trim()
      .min(1, "Escriba el título")
      .max(150, "El título no puede pasar de 150 caracteres"),
    requisitoClausula: textoOpcional("La cláusula incumplida", 200),
    requisitoNormaId: idOpcional("La norma elegida no es válida"),
    requisitoDocumentoId: idOpcional("El documento del requisito no es válido"),
    reincidenteDe: idOpcional("El hallazgo anterior no es válido"),
    fechaLimiteEnte: fechaOpcional("Escriba una fecha límite de respuesta al ente válida"),
    nota: textoOpcional("La nota", 1000),
    justificacion,
  })
  .strict();
export type ReclasificacionValidada = z.output<typeof EsquemaReclasificacion>;

export const EsquemaAnulacion = z.object({ hallazgoId: idDeHallazgo, justificacion }).strict();

export const EsquemaCambioDeProceso = z
  .object({
    hallazgoId: idDeHallazgo,
    procesoId: z
      .union([z.number().int().positive(), z.string().regex(/^\d{1,15}$/)], { error: "Elija el proceso" })
      .transform(Number),
    justificacion,
  })
  .strict();

/** La salida que quien registra eligió ante los parecidos: `ocurrencia:<id>`, `reincidencia:<id>` o `distinto`. */
export const RELACION_DE_REGISTRO = /^(?:(ocurrencia|reincidencia):(\d{1,15})|distinto)$/;
