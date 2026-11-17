import { z } from "zod";
import { esExterno, fuenteObligatoria, pideReferenciaDelCaso } from "@/lib/mejoramiento/origenes";
import { CLASES, CRITICIDADES, METODOS_ANALISIS, ORIGENES_HALLAZGO } from "@/lib/mejoramiento/tipos";
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

// ─────────────────────────────────────────────────────────────────────────────
// El recorrido hasta el plan (spec 15 §8.3 a §8.5)
// ─────────────────────────────────────────────────────────────────────────────

/** Un «sí» o un «no»: llega como booleano del dominio o como `si`/`no` de un formulario. */
const siONo = (mensaje: string) =>
  z.union([z.boolean(), z.enum(["si", "no"])], { error: mensaje }).transform((v) => v === true || v === "si");

const fechaDelDia = (mensaje: string) =>
  z.string({ error: mensaje }).regex(/^\d{4}-\d{2}-\d{2}$/, mensaje).refine(esFechaReal, mensaje);

/** El acta del Comité que cita un acto (spec §8.5 y §19.1): número y fecha, o nada. Que no sea futura lo mira el dominio. */
const acta = z
  .object({
    numero: z
      .string({ error: "Escriba el número del acta" })
      .trim()
      .min(1, "Escriba el número del acta")
      .max(50, "El número del acta no puede pasar de 50 caracteres"),
    fecha: fechaDelDia("Escriba una fecha válida del acta"),
  })
  .strict()
  .nullable()
  .optional()
  .transform((v) => v ?? null);

/** Un acto sobre el hallazgo que no lleva más datos: aceptar, retirar y validar. */
export const EsquemaPasoDelHallazgo = z.object({ hallazgoId: idDeHallazgo }).strict();

export const EsquemaRechazo = z.object({ hallazgoId: idDeHallazgo, justificacion }).strict();

export const EsquemaSostener = z.object({ hallazgoId: idDeHallazgo, replica: textoAcotado("La réplica", 10, 1000) }).strict();

const camposDelArbitraje = {
  hallazgoId: idDeHallazgo,
  confirma: z.enum(["hallazgo", "rechazo"], { error: "Elija qué confirma el arbitraje: el hallazgo o el rechazo" }),
  nota: textoAcotado("La nota del arbitraje", 10, 1000),
};
export const EsquemaArbitraje = z.object({ ...camposDelArbitraje, acta }).strict();

const camposDeLaDecision = { hallazgoId: idDeHallazgo, requiere: siONo("Diga si requiere acción correctiva"), justificacion };
export const EsquemaDecision = z.object({ ...camposDeLaDecision, acta }).strict();

export const EsquemaDevolucion = z.object({ hallazgoId: idDeHallazgo, nota: textoAcotado("La nota", 10, 1000) }).strict();

/**
 * La corrección (spec §8.4). «Sí requirió corrección»: qué se hizo, el responsable (un usuario o, si no tiene cuenta, su
 * nombre; uno de los dos) y la fecha en que se implementó. «No requiere corrección inmediata»: la justificación va en
 * `descripcion`, y el responsable y la fecha se descartan. La evidencia y que la fecha no sea futura los mira el dominio.
 */
export const EsquemaCorreccion = z
  .object({
    hallazgoId: idDeHallazgo,
    requerida: siONo("Diga si requirió corrección"),
    descripcion: z
      .string({ error: "La descripción no es un texto válido" })
      .trim()
      .max(4000, "La descripción no puede pasar de 4000 caracteres")
      .optional()
      .transform((v) => v ?? ""),
    responsableId: idOpcional("El responsable elegido no es válido"),
    responsableNombre: textoOpcional("El nombre del responsable", 150),
    implementadaEn: fechaOpcional("Escriba una fecha válida en que se implementó la corrección"),
  })
  .strict()
  .superRefine((d, ctx) => {
    const falta = (campo: string, message: string) => ctx.addIssue({ code: "custom", path: [campo], message });
    if (!d.requerida) {
      if (d.descripcion.length < 10) falta("descripcion", "La justificación debe tener al menos 10 caracteres");
      return;
    }
    if (d.descripcion.length < 10) falta("descripcion", "Describa la corrección que se hizo: al menos 10 caracteres");
    if (d.responsableId === null && d.responsableNombre === null) {
      falta("responsableId", "Elija el responsable de la corrección o escriba su nombre");
    }
    if (d.responsableId !== null && d.responsableNombre !== null) {
      falta("responsableNombre", "Elija un responsable o escriba su nombre, no los dos");
    }
    if (d.implementadaEn === null) falta("implementadaEn", "Escriba la fecha en que se implementó la corrección");
  })
  .transform((d) =>
    d.requerida ? d : { ...d, responsableId: null, responsableNombre: null, implementadaEn: null },
  );
export type CorreccionValidada = z.output<typeof EsquemaCorreccion>;

/** Los dos campos del acta en un formulario: los dos, o ninguno. */
const camposDelActa = {
  actaNumero: textoOpcional("El número del acta", 50),
  actaFecha: fechaOpcional("Escriba una fecha válida del acta"),
};

function conActa<T extends { actaNumero: string | null; actaFecha: string | null }>(d: T) {
  const { actaNumero, actaFecha, ...resto } = d;
  return { ...resto, acta: actaNumero && actaFecha ? { numero: actaNumero, fecha: actaFecha } : null };
}

const actaCompleta = (d: { actaNumero: string | null; actaFecha: string | null }, ctx: z.RefinementCtx) => {
  if ((d.actaNumero === null) !== (d.actaFecha === null)) {
    ctx.addIssue({ code: "custom", path: ["actaNumero"], message: "Escriba el número y la fecha del acta, o ninguno de los dos" });
  }
};

/** El formulario del arbitraje: los campos de `EsquemaArbitraje`, con el acta en dos campos planos. */
export const EsquemaFormularioArbitraje = z
  .object({ ...camposDelArbitraje, ...camposDelActa })
  .strict()
  .superRefine(actaCompleta)
  .transform(conActa);

/** El formulario de la decisión (y de «exigir la acción correctiva»): los de `EsquemaDecision`, con el acta en dos campos. */
export const EsquemaFormularioDecision = z
  .object({ ...camposDeLaDecision, ...camposDelActa })
  .strict()
  .superRefine(actaCompleta)
  .transform(conActa);

// ─────────────────────────────────────────────────────────────────────────────
// El análisis de causa raíz (spec 15 §9)
// ─────────────────────────────────────────────────────────────────────────────

/** Un campo que el formulario manda como JSON en un solo texto: la forma la valida el esquema del método, nunca se da por buena. */
const jsonEnTexto = (mensaje: string) =>
  z
    .union([z.string({ error: mensaje }), z.record(z.string(), z.unknown()), z.array(z.unknown())], { error: mensaje })
    .transform((v, ctx) => {
      if (typeof v !== "string") return v;
      try {
        return JSON.parse(v) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: mensaje });
        return z.NEVER;
      }
    });

const idDeAnalisis = z
  .union([z.number().int().positive(), z.string().regex(/^\d{1,15}$/)], { error: "El análisis no es válido" })
  .transform(Number)
  .refine((n) => Number.isSafeInteger(n) && n > 0, "El análisis no es válido");

/** El formulario de un análisis: el método, el equipo, las observaciones y el contenido del método (JSON que valida `leerContenido`). */
export const EsquemaFormularioAnalisis = z
  .object({
    hallazgoId: idDeHallazgo,
    analisisId: idOpcional("El análisis no es válido"),
    metodo: z.enum(METODOS_ANALISIS, { error: "Elija el método del análisis" }),
    equipo: textoOpcional("El equipo", 500),
    observaciones: textoOpcional("Las observaciones", 2000),
    contenido: jsonEnTexto("El contenido del análisis no es válido"),
  })
  .strict();

export const EsquemaQuitarAnalisis = z.object({ hallazgoId: idDeHallazgo, analisisId: idDeAnalisis }).strict();

const causaDeLaRonda = z
  .object({
    id: idOpcional("La causa no es válida"),
    texto: textoAcotado("La causa", 3, 500),
    sinAccionPorque: z
      .string({ error: "La justificación no es un texto válido" })
      .trim()
      .max(1000, "La justificación no puede pasar de 1000 caracteres")
      .nullish()
      .transform((v) => v || null),
  })
  .strict();

/** La lista de causas de la ronda: de 1 a 20, cada una en una frase. */
export const EsquemaCausas = z
  .object({
    hallazgoId: idDeHallazgo,
    causas: z.array(causaDeLaRonda, { error: "Escriba las causas raíz" }).min(1, "Escriba al menos una causa raíz").max(20, "Son veinte causas como máximo"),
  })
  .strict()
  .superRefine((d, ctx) => {
    const ids = d.causas.flatMap((x) => (x.id ? [x.id] : []));
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["causas"], message: "Una causa aparece dos veces" });
  });

export const EsquemaFormularioCausas = z
  .object({ hallazgoId: idDeHallazgo, causas: jsonEnTexto("Las causas no son válidas") })
  .strict();

const bandera = z.boolean({ error: "Marque los cambios que se requieren" });

/** Las dos preguntas de cierre de la ronda, ya en su forma de dominio. */
export const EsquemaPreguntasDeCierre = z
  .object({
    hallazgoId: idDeHallazgo,
    similares: siONo("Diga si hay no conformidades similares en otros procesos"),
    similaresDetalle: textoOpcional("Las no conformidades similares", 1000),
    cambios: z
      .object({ documentos: bandera, riesgos: bandera, controles: bandera, descripcion: textoOpcional("La descripción de los cambios", 1000) })
      .strict(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.similares && d.similaresDetalle === null) ctx.addIssue({ code: "custom", path: ["similaresDetalle"], message: "Diga cuáles" });
    const hay = d.cambios.documentos || d.cambios.riesgos || d.cambios.controles;
    if (hay && d.cambios.descripcion === null) {
      ctx.addIssue({ code: "custom", path: ["cambios"], message: "Describa los cambios que se requieren" });
    }
  })
  .transform((d) => {
    const hay = d.cambios.documentos || d.cambios.riesgos || d.cambios.controles;
    return {
      hallazgoId: d.hallazgoId,
      similares: d.similares,
      similaresDetalle: d.similares ? d.similaresDetalle : null,
      cambios: { ...d.cambios, descripcion: hay ? d.cambios.descripcion : null },
    };
  });

const marca = z.enum(["si"]).optional();

/** El formulario plano de las preguntas: un «sí/no» por pregunta y una casilla por cambio. */
export const EsquemaFormularioPreguntas = z
  .object({
    hallazgoId: idDeHallazgo,
    similares: siONo("Diga si hay no conformidades similares en otros procesos"),
    similaresDetalle: textoOpcional("Las no conformidades similares", 1000),
    hayCambios: siONo("Diga si se requieren cambios en documentos, riesgos o controles"),
    cambiosDocumentos: marca,
    cambiosRiesgos: marca,
    cambiosControles: marca,
    cambiosDescripcion: textoOpcional("La descripción de los cambios", 1000),
  })
  .strict()
  .superRefine((d, ctx) => {
    const marcados = [d.cambiosDocumentos, d.cambiosRiesgos, d.cambiosControles].some((x) => x === "si");
    if (d.hayCambios && !marcados) ctx.addIssue({ code: "custom", path: ["cambiosDocumentos"], message: "Marque qué cambios se requieren" });
  })
  .transform((d) => ({
    hallazgoId: d.hallazgoId,
    similares: d.similares,
    similaresDetalle: d.similaresDetalle,
    cambios: {
      documentos: d.hayCambios && d.cambiosDocumentos === "si",
      riesgos: d.hayCambios && d.cambiosRiesgos === "si",
      controles: d.hayCambios && d.cambiosControles === "si",
      descripcion: d.hayCambios ? d.cambiosDescripcion : null,
    },
  }));
