import { z } from "zod";
import { esExterno, fuenteObligatoria, pideReferenciaDelCaso } from "@/lib/mejoramiento/origenes";
import { inicioDespuesDelFin } from "@/lib/mejoramiento/textos";
import { CLASES, CRITERIOS_EFICACIA, CRITICIDADES, METODOS_ANALISIS, ORIGENES_HALLAZGO, TIPOS_ACCION } from "@/lib/mejoramiento/tipos";
import { textoAcotado } from "@/lib/validacion";

/** Toda fecha de día que una persona escribe en el módulo va del año 2000 al 2100. */
export const FECHA_FUERA_DE_RANGO = "La fecha debe estar entre el año 2000 y el 2100";

/** `AAAA-MM-DD` de un día que existe en el calendario. */
const esDiaReal = (f: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const ms = Date.parse(`${f}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().startsWith(f);
};

/** Del 2000 al 2100; un día mal escrito lo dice su propio mensaje, no este. */
const enRango = (f: string) => !esDiaReal(f) || (f >= "2000-01-01" && f <= "2100-12-31");

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
      .refine(esDiaReal, "Elija una fecha válida")
      .refine(enRango, FECHA_FUERA_DE_RANGO),
    tipo: z.enum(["no_habil", "habil"], { error: "Elija si el día es no hábil o hábil" }),
    motivo: textoAcotado("El motivo", 1, 200),
  })
  .strict();

// ─────────────────────────────────────────────────────────────────────────────
// El hallazgo (spec 15 §7.1)
// ─────────────────────────────────────────────────────────────────────────────

const esFechaReal = esDiaReal;

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
    .refine((v) => v === null || esFechaReal(v), mensaje)
    .refine((v) => v === null || enRango(v), FECHA_FUERA_DE_RANGO);

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
      .refine(esFechaReal, "Escriba una fecha válida en que se detectó")
      .refine(enRango, FECHA_FUERA_DE_RANGO),
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
  .union([z.number().int("El hallazgo no es válido").positive("El hallazgo no es válido"), z.string().regex(/^\d{1,15}$/)], { error: "El hallazgo no es válido" })
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
      .refine(esFechaReal, "Escriba una fecha válida de la ocurrencia")
      .refine(enRango, FECHA_FUERA_DE_RANGO),
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

const fechaDelDia = (mensaje: string, fueraDeRango = FECHA_FUERA_DE_RANGO) =>
  z.string({ error: mensaje }).regex(/^\d{4}-\d{2}-\d{2}$/, mensaje).refine(esFechaReal, mensaje).refine(enRango, fueraDeRango);

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

/** Lo que el dominio vuelve a validar de un análisis (el contenido lo lee `leerContenido`, según su método). */
export const EsquemaGuardarAnalisis = z
  .object({
    hallazgoId: idDeHallazgo,
    analisisId: idOpcional("El análisis no es válido"),
    metodo: z.enum(METODOS_ANALISIS, { error: "Elija el método del análisis" }),
    equipo: textoOpcional("El equipo", 500),
    observaciones: textoOpcional("Las observaciones", 2000),
    contenido: z.unknown(),
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
    causas: z.array(causaDeLaRonda, { error: "Las causas no son válidas" }).max(20, "Son veinte causas como máximo"),
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

// ─────────────────────────────────────────────────────────────────────────────
// El plan de acción y el criterio de eficacia (spec 15 §10 y §11.2)
// ─────────────────────────────────────────────────────────────────────────────

/** Un id obligatorio: llega como número o como texto del formulario. */
const idRequerido = (mensaje: string) =>
  z
    .union([z.number().int(mensaje).positive(mensaje), z.string().regex(/^\d{1,15}$/, mensaje)], { error: mensaje })
    .transform(Number)
    .refine((n) => Number.isSafeInteger(n) && n > 0, mensaje);

/** Las casillas con el mismo nombre: ninguna, un texto o varios; o una lista que manda el dominio. */
const variosValores = (mensaje: string) =>
  z
    .union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))], { error: mensaje })
    .optional()
    .transform((v): Array<string | number> => (v === undefined ? [] : Array.isArray(v) ? v : [v]));

const camposDeLaAccion = {
  hallazgoId: idDeHallazgo,
  accionId: idOpcional("La acción no es válida"),
  tipo: z.enum(TIPOS_ACCION, { error: "Elija el tipo de acción" }),
  descripcion: textoAcotado("La descripción de la acción", 3, 2000),
  recursos: textoOpcional("Los recursos necesarios", 1000),
  indicadorCumplimiento: textoOpcional("El indicador de cumplimiento", 500),
  meta: textoOpcional("La meta", 500),
};

const causasQueAtaca = z
  .array(idRequerido("La causa elegida no es válida"), { error: "Las causas elegidas no son válidas" })
  .max(20, "Una acción ataca veinte causas como máximo")
  .transform((ids) => [...new Set(ids)]);

/**
 * La marca que el dominio cambia por la etiqueta de la actividad («A1.2») en los mensajes de una fila: la etiqueta depende del
 * orden de la acción en la ronda, que solo se sabe dentro de la transacción (`guardarAccion`).
 */
export const LA_ACTIVIDAD = "‹actividad›";

const actividadDelPlan = z
  .object({
    id: idOpcional(`La actividad ${LA_ACTIVIDAD} no es válida`),
    descripcion: textoAcotado(`La descripción de la actividad ${LA_ACTIVIDAD}`, 3, 1000),
    responsableId: idRequerido(`Elija el responsable de la actividad ${LA_ACTIVIDAD}`),
    inicio: fechaDelDia(
      `Escriba una fecha válida de inicio de la actividad ${LA_ACTIVIDAD}`,
      `La fecha de inicio de la actividad ${LA_ACTIVIDAD} debe estar entre el año 2000 y el 2100`,
    ),
    fin: fechaDelDia(
      `Escriba una fecha válida de fin de la actividad ${LA_ACTIVIDAD}`,
      `La fecha de fin de la actividad ${LA_ACTIVIDAD} debe estar entre el año 2000 y el 2100`,
    ),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (a.inicio > a.fin) ctx.addIssue({ code: "custom", path: ["inicio"], message: inicioDespuesDelFin(LA_ACTIVIDAD) });
  });

/** Dónde va una acción (el hallazgo y, si ya existe, la acción), para leerlo aunque el resto no pase. */
export const EsquemaLugarDeLaAccion = z.object({ hallazgoId: idDeHallazgo, accionId: idOpcional("La acción no es válida") });

/**
 * Una acción del plan con sus actividades, tal como la guarda `guardarAccion`: al menos una actividad, cada una con su
 * responsable y un inicio no posterior a su fin. Lo que depende de la base (la ronda, las causas, que el responsable esté
 * activo) lo mira el dominio; que el fin no sea pasado es una falta del plan (`examinarPlan`), no un error de guardado.
 */
export const EsquemaAccion = z
  .object({
    ...camposDeLaAccion,
    causaIds: causasQueAtaca.optional().transform((v) => v ?? []),
    actividades: z
      .array(actividadDelPlan, { error: "Las actividades no son válidas" })
      .min(1, "Toda acción lleva al menos una actividad")
      .max(30, "Una acción lleva treinta actividades como máximo"),
  })
  .strict()
  .superRefine((d, ctx) => {
    const ids = d.actividades.flatMap((a) => (a.id ? [a.id] : []));
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["actividades"], message: "Una actividad aparece dos veces" });
  });
export type AccionValidada = z.output<typeof EsquemaAccion>;

/** El formulario de una acción: las causas, en casillas; las actividades, como JSON que vuelve a leer `EsquemaAccion`. */
export const EsquemaFormularioAccion = z
  .object({
    ...camposDeLaAccion,
    causaIds: variosValores("Las causas elegidas no son válidas").pipe(causasQueAtaca),
    actividades: jsonEnTexto("Las actividades no son válidas"),
  })
  .strict();

export const EsquemaQuitarAccion = z.object({ hallazgoId: idDeHallazgo, accionId: idRequerido("La acción no es válida") }).strict();

/**
 * El criterio de eficacia de la ronda (spec §11.2), del formulario o del dominio. Lo que no aplica se descarta: la
 * descripción sin «otro» y el indicador sin «mejora del indicador». La fecha de evaluación la descarta el dominio en la no
 * conformidad (depende de la clase).
 */
export const EsquemaCriterio = z
  .object({
    hallazgoId: idDeHallazgo,
    criterios: variosValores("Elija un criterio de eficacia válido").pipe(
      z.array(z.enum(CRITERIOS_EFICACIA, { error: "Elija un criterio de eficacia válido" })),
    ),
    criterioOtro: textoOpcional("La descripción del otro criterio", 500),
    indicadorEficaciaId: idOpcional("El indicador elegido no es válido"),
    fechaEvaluacion: fechaOpcional("Escriba una fecha de evaluación válida"),
  })
  .strict()
  .transform((d) => {
    const criterios = CRITERIOS_EFICACIA.filter((x) => d.criterios.includes(x));
    return {
      hallazgoId: d.hallazgoId,
      criterios,
      criterioOtro: criterios.includes("otro") ? d.criterioOtro : null,
      indicadorEficaciaId: criterios.includes("mejora_indicador") ? d.indicadorEficaciaId : null,
      fechaEvaluacion: d.fechaEvaluacion,
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Las firmas del plan: enviar, devolver, revisar y aprobar (spec 15 §8.6 y §12.1)
// ─────────────────────────────────────────────────────────────────────────────

/** La clave y el código del segundo factor de una firma, como en los indicadores: la clave no se recorta. */
const firma = {
  clave: z.string({ error: "Escriba su clave" }).min(1, "Escriba su clave").max(128, "La clave no puede pasar de 128 caracteres"),
  codigo: textoAcotado("El código", 6, 20).optional(),
};

/** Enviar o aprobar el plan: el hallazgo y la firma. */
export const EsquemaFormularioFirmaDelPlan = z.object({ hallazgoId: idDeHallazgo, ...firma }).strict();

/** Devolver el plan con observaciones (desde «En revisión» o «En aprobación»): al menos diez caracteres. */
export const EsquemaDevolverPlan = z
  .object({ hallazgoId: idDeHallazgo, observaciones: textoAcotado("Las observaciones", 10, 2000) })
  .strict();

export const NOTA_DE_RECURSOS = "Escriba la nota de los recursos o del impacto institucional";

/**
 * Lo que decide la revisión (spec §8.6): si requiere recursos adicionales o tiene impacto institucional, con su nota (que solo
 * vale con la marca).
 */
export const EsquemaRevisarPlan = z
  .object({
    hallazgoId: idDeHallazgo,
    requiereRecursos: siONo("Diga si requiere recursos adicionales o tiene impacto institucional"),
    notaRecursos: textoOpcional("La nota de los recursos", 1000),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.requiereRecursos && d.notaRecursos === null) ctx.addIssue({ code: "custom", path: ["notaRecursos"], message: NOTA_DE_RECURSOS });
  })
  .transform((d) => ({ ...d, notaRecursos: d.requiereRecursos ? d.notaRecursos : null }));

/** El formulario de la revisión: la casilla (`si` o nada), su nota y la firma. */
export const EsquemaFormularioRevisarPlan = z
  .object({ hallazgoId: idDeHallazgo, requiereRecursos: marca, notaRecursos: textoOpcional("La nota de los recursos", 1000), ...firma })
  .strict()
  .transform((d) => ({ ...d, requiereRecursos: d.requiereRecursos === "si" }));

// ─────────────────────────────────────────────────────────────────────────────
// Las actividades del plan aprobado: seguimientos, terminar y reasignar (spec 15 §10.2 a §10.4)
// ─────────────────────────────────────────────────────────────────────────────

const idDeActividad = idRequerido("La actividad no es válida");

/**
 * Un seguimiento de la actividad (spec §10.3): la fecha, lo que se hizo, el avance (un entero de 0 a 100) y las barreras.
 * Que la fecha no sea futura y que el avance no baje los mira el dominio (dependen de la hora y de lo ya registrado).
 */
export const EsquemaSeguimiento = z
  .object({
    actividadId: idDeActividad,
    fecha: fechaDelDia("Escriba una fecha válida del seguimiento"),
    realizado: textoAcotado("Lo que se hizo", 10, 4000),
    avance: entero("El avance", 0, 100),
    barreras: textoOpcional("Las barreras", 2000),
  })
  .strict();

/** Un acto sobre la actividad que no lleva más datos: terminarla. */
export const EsquemaActividad = z.object({ actividadId: idDeActividad }).strict();

/** Reasignar la actividad (spec §10.2): el responsable nuevo y el motivo, de al menos diez caracteres. */
export const EsquemaReasignar = z
  .object({
    actividadId: idDeActividad,
    responsableId: idRequerido("Elija el responsable nuevo"),
    motivo: textoAcotado("El motivo", 10, 1000),
  })
  .strict();
