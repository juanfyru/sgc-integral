import { z } from "zod";
import { esExterno, fuenteObligatoria, pideReferenciaDelCaso } from "@/lib/mejoramiento/origenes";
import { FALTA_LA_FECHA_DEL_ENTE, MOTIVO_CORTO } from "@/lib/mejoramiento/planes";
import { inicioDespuesDelFin } from "@/lib/mejoramiento/textos";
import {
  CLASES,
  CRITERIOS_EFICACIA,
  CRITICIDADES,
  ESTADOS_ACTIVIDAD,
  MAXIMO_DE_ACCIONES,
  MAXIMO_DE_ACTIVIDADES,
  METODOS_ANALISIS,
  METODOS_DE_VERIFICACION,
  ORIGENES_HALLAZGO,
  TIPOS_ACCION,
  TIPOS_AJUSTE,
  type EstadoActividad,
  type Origen,
} from "@/lib/mejoramiento/tipos";
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
    sugerirHallazgos: entero("El número de hallazgos de la sugerencia", 2, 20),
    sugerirMeses: entero("El número de meses de la sugerencia", 1, 60),
    formatos: z
      .object({
        registro: documentoOpcional("El formato de registro"),
        porques: documentoOpcional("El formato de los cinco porqués"),
        ishikawa: documentoOpcional("El formato de Ishikawa"),
        plan: documentoOpcional("El formato del plan de mejoramiento"),
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

/** Un hallazgo de origen que quien registra no ve y uno que no existe se dicen igual (spec §6.3). */
export const HALLAZGO_DE_ORIGEN = "El hallazgo de origen no existe";

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
    /** El hallazgo distinto que encontró quien verificaba otro (spec §11.4): solo al registrar; editar y reclasificar no lo tocan. */
    derivadoDe: idOpcional(HALLAZGO_DE_ORIGEN),
    reporteId: idOpcional("El reporte no es válido"),
    /**
     * El plan en que nace (Fase 15B, anexo §3.4, camino 1): llega oculto desde `?plan=` y lo vuelve a validar el registro (o la
     * carga) dentro de su transacción; si no pasa, nace sin plan y nadie dice por qué. Solo al registrar.
     */
    planId: idOpcional("El plan no es válido"),
    /** El objetivo del maestro al que apunta (anexo §10.4): activo al elegirlo. Solo al registrar; después, «Clasificación». */
    objetivoId: idOpcional("El objetivo elegido no es válido"),
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

/** El oficio de una respuesta al ente, elegido entre los archivos que pueden serlo (los mira el dominio). */
const oficioDeLaRespuesta = z
  .union([z.number().int().positive(), z.string().regex(/^\d{1,15}$/)], { error: "Elija el oficio de respuesta" })
  .transform(Number);

/**
 * La respuesta al ente de un hallazgo externo (spec §13.4): la fecha en que se envió y el oficio. Sus bordes (hoy y la aprobación
 * del plan) y que el oficio sea de los que se pueden elegir los mira el dominio.
 */
export const EsquemaRespuestaAlEnte = z
  .object({
    hallazgoId: idDeHallazgo,
    enviadaEn: fechaDelDia("Escriba la fecha en que se envió la respuesta al ente"),
    // El oficio: uno de los archivos del hallazgo subidos después de aprobar el plan (lo comprueba el dominio).
    oficioId: oficioDeLaRespuesta,
  })
  .strict();

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

/** Una sola frase para el tope de actividades de una acción: al guardar el plan y al añadir una por un ajuste. */
export const DEMASIADAS_ACTIVIDADES = "Una acción lleva treinta actividades como máximo";

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
      .max(MAXIMO_DE_ACTIVIDADES, DEMASIADAS_ACTIVIDADES),
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
// Un hallazgo ya en curso (spec 15 §15)
// ─────────────────────────────────────────────────────────────────────────────

/** La marca que el dominio cambia por la etiqueta de la acción («A1») en los mensajes de una acción de la carga. */
export const LA_ACCION = "‹acción›";

/** La que cambia por el número de la causa («2») en los mensajes de una causa de la carga. */
export const LA_CAUSA = "‹causa›";

/**
 * Una actividad de un plan aprobado en papel: la de `actividadDelPlan` más su avance de hoy y, si ya terminó, el día en que
 * terminó. Una al 100 % es una terminada y pide ese día; una con ese día queda terminada, al 100 %.
 */
const actividadDeLaCarga = z
  .object({
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
    avance: entero(`El avance de la actividad ${LA_ACTIVIDAD}`, 0, 100),
    terminadaEn: fechaOpcional(`Escriba una fecha válida en que terminó la actividad ${LA_ACTIVIDAD}`),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (a.inicio > a.fin) ctx.addIssue({ code: "custom", path: ["inicio"], message: inicioDespuesDelFin(LA_ACTIVIDAD) });
    if (a.avance === 100 && a.terminadaEn === null) {
      ctx.addIssue({ code: "custom", path: ["terminadaEn"], message: `Escriba la fecha en que terminó la actividad ${LA_ACTIVIDAD}` });
    }
    if (a.terminadaEn !== null && a.terminadaEn < a.inicio) {
      ctx.addIssue({ code: "custom", path: ["terminadaEn"], message: `La actividad ${LA_ACTIVIDAD} no puede terminar antes de su inicio` });
    }
  })
  .transform((a) => ({ ...a, avance: a.terminadaEn === null ? a.avance : 100 }));

/** Las causas que ataca una acción de la carga, por su número en la lista del análisis (de 1 en adelante). */
const causasDeLaCarga = z
  .array(entero(`El número de una causa de la acción ${LA_ACCION}`, 1, 20), { error: "Las causas elegidas no son válidas" })
  .max(20, "Una acción ataca veinte causas como máximo")
  .transform((n) => [...new Set(n)].sort((x, y) => x - y));

const accionDeLaCarga = z
  .object({
    tipo: z.enum(TIPOS_ACCION, { error: `Elija el tipo de la acción ${LA_ACCION}` }),
    descripcion: textoAcotado(`La descripción de la acción ${LA_ACCION}`, 3, 2000),
    causas: causasDeLaCarga.optional().transform((v) => v ?? []),
    recursos: textoOpcional("Los recursos necesarios", 1000),
    indicadorCumplimiento: textoOpcional("El indicador de cumplimiento", 500),
    meta: textoOpcional("La meta", 500),
    actividades: z
      .array(actividadDeLaCarga, { error: "Las actividades no son válidas" })
      .min(1, `La acción ${LA_ACCION} no tiene actividades`)
      .max(MAXIMO_DE_ACTIVIDADES, DEMASIADAS_ACTIVIDADES),
  })
  .strict();

/**
 * Lo que trae un hallazgo ya en curso además de su identificación (que lee `EsquemaHallazgo`), con la clase y el día de detección
 * ya validados: las reglas de §8.4, §9 y §10 que el papel tuvo que cumplir, y las fechas entre sí (que una no sea futura lo mira el
 * dominio, con su `ahora`). La corrección es solo de la no conformidad (§8.4): en las demás clases no se guarda. Los mensajes de
 * una acción o una actividad llevan `LA_ACCION` y `LA_ACTIVIDAD`, que el dominio cambia por su etiqueta.
 */
export const EsquemaCarga = z
  .object({
    clase: z.enum(CLASES, { error: "Elija la clase del hallazgo" }),
    detectadoEn: z.string(),
    registradoEnPapel: fechaDelDia("Escriba una fecha válida en que se registró en papel"),
    correccion: z
      .object({
        requerida: z.boolean({ error: "Diga si requirió corrección" }),
        descripcion: z
          .string({ error: "La descripción no es un texto válido" })
          .trim()
          .max(4000, "La descripción no puede pasar de 4000 caracteres")
          .optional()
          .transform((v) => v ?? ""),
        implementadaEn: fechaOpcional("Escriba una fecha válida en que se implementó la corrección"),
      })
      .strict(),
    analisis: z
      .object({
        metodo: z
          .enum(METODOS_ANALISIS, { error: "Elija el método del análisis" })
          .nullish()
          .transform((v) => v ?? null),
        causas: z
          .array(textoAcotado(`La causa ${LA_CAUSA}`, 3, 500), { error: "Las causas no son válidas" })
          .max(20, "Son veinte causas como máximo"),
        contenido: z.unknown().optional(),
      })
      .strict(),
    acciones: z
      .array(accionDeLaCarga, { error: "Las acciones no son válidas" })
      .min(1, "El plan lleva al menos una acción")
      .max(MAXIMO_DE_ACCIONES, `Un plan lleva hasta ${MAXIMO_DE_ACCIONES} acciones`),
    criterios: z.array(z.enum(CRITERIOS_EFICACIA, { error: "Elija un criterio de eficacia válido" }), { error: "Elija un criterio de eficacia válido" }),
    criterioOtro: textoOpcional("La descripción del otro criterio", 500),
    indicadorEficaciaId: idOpcional("El indicador elegido no es válido"),
    fechaEvaluacion: fechaOpcional("Escriba una fecha de evaluación válida"),
    aprobacion: z
      .object({
        nombre: textoAcotado("El nombre de quien aprobó el plan", 3, 150),
        cargo: textoAcotado("El cargo de quien aprobó el plan", 3, 150),
        fecha: fechaDelDia("Escriba una fecha válida en que se aprobó el plan"),
        rol: z.enum(["gerencia", "admin_sgc"], { error: "Diga si lo aprobó Gerencia o el Coordinador del SGC" }),
      })
      .strict(),
  })
  .strict()
  .superRefine((d, ctx) => {
    const falta = (path: Array<string | number>, message: string) => ctx.addIssue({ code: "custom", path, message });
    const esNc = d.clase === "no_conformidad";
    if (d.registradoEnPapel < d.detectadoEn) falta(["registradoEnPapel"], "La fecha de registro en papel no puede ser anterior a la de detección");
    if (d.aprobacion.fecha < d.registradoEnPapel) {
      falta(["aprobacion", "fecha"], "La fecha de aprobación del plan no puede ser anterior a su registro en papel");
    }
    if (esNc) {
      const k = d.correccion;
      if (!k.requerida && k.descripcion.length < 10) {
        falta(["correccion", "descripcion"], "La justificación de no requerir corrección debe tener al menos 10 caracteres");
      }
      if (k.requerida && k.descripcion.length < 10) falta(["correccion", "descripcion"], "Describa la corrección que se hizo: al menos 10 caracteres");
      if (k.requerida && k.implementadaEn === null) falta(["correccion", "implementadaEn"], "Escriba la fecha en que se implementó la corrección");
      if (k.requerida && k.implementadaEn !== null && k.implementadaEn < d.detectadoEn) {
        falta(["correccion", "implementadaEn"], "La fecha de la corrección no puede ser anterior a la de detección");
      }
      if (d.analisis.causas.length === 0) falta(["analisis", "causas"], "Escriba al menos una causa raíz");
      if (d.analisis.metodo === null) falta(["analisis", "metodo"], "Elija el método del análisis");
      if (!d.acciones.some((a) => a.tipo === "correctiva")) falta(["acciones"], "El plan de una no conformidad lleva al menos una acción correctiva");
    }
    if (d.analisis.metodo === "pareto") falta(["analisis", "metodo"], "El análisis de Pareto todavía no está disponible");
    // Fuera de la no conformidad el análisis es opcional (§9.5); con su contenido, lleva su método.
    if (!esNc && d.analisis.metodo === null && d.analisis.contenido != null) falta(["analisis", "metodo"], "Elija el método del análisis");
    d.acciones.forEach((a, i) => {
      a.actividades.forEach((x, j) => {
        if (x.inicio < d.detectadoEn) {
          falta(["acciones", i, "actividades", j, "inicio"], `La actividad ${LA_ACTIVIDAD} no puede iniciar antes de la detección del hallazgo`);
        }
      });
      if (a.tipo === "correctiva" && a.causas.length === 0) falta(["acciones", i, "causas"], `La acción ${LA_ACCION} no dice qué causa ataca`);
      if (a.causas.some((n) => n > d.analisis.causas.length)) {
        falta(["acciones", i, "causas"], `La acción ${LA_ACCION} ataca una causa que no está en el análisis`);
      }
    });
    d.analisis.causas.forEach((_, i) => {
      if (!d.acciones.some((a) => a.causas.includes(i + 1))) falta(["analisis", "causas", i], `La causa ${i + 1} no tiene acción`);
    });
    if (d.criterios.length === 0) falta(["criterios"], "Defina el criterio de eficacia");
    if (d.criterios.includes("otro") && d.criterioOtro === null) falta(["criterioOtro"], "Describa el otro criterio de eficacia");
    if (d.criterios.includes("mejora_indicador") && d.indicadorEficaciaId === null) falta(["indicadorEficaciaId"], "Elija el indicador");
    const ultimoFin = d.acciones.flatMap((a) => a.actividades.map((x) => x.fin)).reduce((m, f) => (f > m ? f : m), "");
    if (!esNc && d.fechaEvaluacion === null) falta(["fechaEvaluacion"], "Escriba la fecha de evaluación");
    if (!esNc && d.fechaEvaluacion !== null && d.fechaEvaluacion < ultimoFin) {
      falta(["fechaEvaluacion"], "La evaluación no puede ser anterior al fin de la última actividad");
    }
  })
  .transform((d) => ({
    registradoEnPapel: d.registradoEnPapel,
    // La corrección es solo de la no conformidad; sin requerirla, no tiene fecha de implementación.
    correccion:
      d.clase === "no_conformidad"
        ? { ...d.correccion, implementadaEn: d.correccion.requerida ? d.correccion.implementadaEn : null }
        : null,
    analisis: { metodo: d.analisis.metodo, causas: d.analisis.causas, contenido: d.analisis.contenido ?? null },
    acciones: d.acciones,
    criterios: CRITERIOS_EFICACIA.filter((x) => d.criterios.includes(x)),
    criterioOtro: d.criterios.includes("otro") ? d.criterioOtro : null,
    indicadorEficaciaId: d.criterios.includes("mejora_indicador") ? d.indicadorEficaciaId : null,
    fechaEvaluacion: d.clase === "no_conformidad" ? null : d.fechaEvaluacion,
    aprobacion: d.aprobacion,
  }));
export type CargaValidada = z.output<typeof EsquemaCarga>;

/**
 * Los campos del formulario de la carga que no son de la identificación (esos los lee `EsquemaHallazgo`): la acción los separa con
 * `omitir`. Las causas y las acciones llegan como JSON en un solo texto; los criterios, en casillas.
 */
export const CAMPOS_DE_LA_CARGA = [
  "registradoEnPapel",
  "correccionRequerida",
  "correccionDescripcion",
  "correccionImplementadaEn",
  "analisisMetodo",
  "causas",
  "acciones",
  "criterios",
  "criterioOtro",
  "indicadorEficaciaId",
  "fechaEvaluacion",
  "aprobacionNombre",
  "aprobacionCargo",
  "aprobacionFecha",
  "aprobacionRol",
];

const textoDelFormulario = z.string().optional();

/**
 * El formulario de la carga (sin la identificación), en la forma que recibe `cargarHallazgo`, que lo valida con `EsquemaCarga`:
 * aquí solo se lee cada campo. Un campo vacío no llega (`parsearFormulario`).
 */
export const EsquemaFormularioCarga = z
  .object({
    registradoEnPapel: textoDelFormulario,
    correccionRequerida: z.enum(["si", "no"], { error: "Diga si requirió corrección" }).optional(),
    correccionDescripcion: textoDelFormulario,
    correccionImplementadaEn: textoDelFormulario,
    analisisMetodo: textoDelFormulario,
    causas: jsonEnTexto("Las causas no son válidas").optional(),
    acciones: jsonEnTexto("Las acciones no son válidas").optional(),
    criterios: variosValores("Elija un criterio de eficacia válido"),
    criterioOtro: textoDelFormulario,
    indicadorEficaciaId: idOpcional("El indicador elegido no es válido"),
    fechaEvaluacion: textoDelFormulario,
    aprobacionNombre: textoDelFormulario,
    aprobacionCargo: textoDelFormulario,
    aprobacionFecha: textoDelFormulario,
    aprobacionRol: textoDelFormulario,
  })
  .strict()
  .transform((d) => ({
    registradoEnPapel: d.registradoEnPapel ?? "",
    correccion: { requerida: d.correccionRequerida === "si", descripcion: d.correccionDescripcion ?? "", implementadaEn: d.correccionImplementadaEn ?? null },
    analisis: { metodo: d.analisisMetodo as never, causas: (d.causas ?? []) as never },
    acciones: (d.acciones ?? []) as never,
    criterios: d.criterios.map(String) as never,
    criterioOtro: d.criterioOtro ?? null,
    indicadorEficaciaId: d.indicadorEficaciaId,
    fechaEvaluacion: d.fechaEvaluacion ?? null,
    aprobacion: { nombre: d.aprobacionNombre ?? "", cargo: d.aprobacionCargo ?? "", fecha: d.aprobacionFecha ?? "", rol: d.aprobacionRol as never },
  }));

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

// ─────────────────────────────────────────────────────────────────────────────
// Los ajustes al plan aprobado y la escalada a Gerencia (spec 15 §10.6 y §10.7)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La actividad que añade un ajuste (spec §10.6): en una acción del plan (`accionId`) o en una acción nueva (`accion`), una de
 * las dos, con su responsable y un inicio no posterior a su fin. Es también la forma en que se guarda en `mejora_ajustes.datos`
 * y con la que se vuelve a leer. Lo que depende de la base (la ronda, las causas, el responsable activo, el fin de hoy en
 * adelante) lo mira el dominio.
 */
export const EsquemaActividadQueSeAnade = z
  .object({
    accionId: idOpcional("La acción no es válida"),
    accion: z
      .object({
        // Un texto que debe ser uno de los tipos: así el formulario (texto) y el dominio entran por la misma forma.
        tipo: z.string({ error: "Elija el tipo de la acción nueva" }).pipe(z.enum(TIPOS_ACCION, { error: "Elija el tipo de la acción nueva" })),
        descripcion: textoAcotado("La descripción de la acción nueva", 3, 2000),
        causaIds: causasQueAtaca.optional().transform((v) => v ?? []),
      })
      .strict()
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    descripcion: textoAcotado("La descripción de la actividad nueva", 3, 1000),
    responsableId: idRequerido("Elija el responsable de la actividad nueva"),
    inicio: fechaDelDia("Escriba una fecha válida de inicio de la actividad nueva"),
    fin: fechaDelDia("Escriba una fecha válida de fin de la actividad nueva"),
  })
  .strict()
  .superRefine((a, ctx) => {
    if ((a.accionId === null) === (a.accion === null)) {
      ctx.addIssue({ code: "custom", path: ["accionId"], message: "Elija la acción de la actividad nueva o describa una acción nueva" });
    }
    if (a.inicio > a.fin) ctx.addIssue({ code: "custom", path: ["inicio"], message: inicioDespuesDelFin("nueva") });
  });
export type ActividadQueSeAnade = z.output<typeof EsquemaActividadQueSeAnade>;

/**
 * Lo que se pide (spec §10.6): la actividad y su fecha nueva (reprogramar), la actividad (cancelar) o la actividad nueva
 * (agregar), siempre con la causa. Lo que no aplica al tipo se descarta. Quién pide, que la fecha sea de hoy en adelante y que
 * la actividad siga abierta los mira el dominio.
 */
export const EsquemaPedirAjuste = z
  .object({
    hallazgoId: idDeHallazgo,
    tipo: z.enum(TIPOS_AJUSTE, { error: "Elija el ajuste que pide" }),
    actividadId: idOpcional("La actividad no es válida"),
    finNuevo: fechaOpcional("Escriba una fecha nueva válida"),
    nueva: EsquemaActividadQueSeAnade.nullable()
      .optional()
      .transform((v) => v ?? null),
    causa: textoAcotado("La causa", 10, 2000),
  })
  .strict()
  .superRefine((d, ctx) => {
    const falta = (campo: string, message: string) => ctx.addIssue({ code: "custom", path: [campo], message });
    if (d.tipo !== "agregar" && d.actividadId === null) falta("actividadId", "Elija la actividad");
    if (d.tipo === "reprogramar" && d.finNuevo === null) falta("finNuevo", "Escriba la fecha nueva");
    if (d.tipo === "agregar" && d.nueva === null) falta("nueva", "Describa la actividad que se añade");
  })
  .transform((d) => ({
    hallazgoId: d.hallazgoId,
    tipo: d.tipo,
    actividadId: d.tipo === "agregar" ? null : d.actividadId,
    finNuevo: d.tipo === "reprogramar" ? d.finNuevo : null,
    nueva: d.tipo === "agregar" ? d.nueva : null,
    causa: d.causa,
  }));

/**
 * El formulario de un ajuste, en campos planos: la actividad y la fecha nueva, o la actividad nueva con su acción (`accionId`
 * es el id de una acción del plan o `nueva`, con `accionTipo`, `accionDescripcion` y las casillas `causaIds`). Lo deja en la
 * forma de `pedirAjuste`, que lo vuelve a validar todo con `EsquemaPedirAjuste`.
 */
export const EsquemaFormularioAjuste = z
  .object({
    hallazgoId: idDeHallazgo,
    tipo: z.enum(TIPOS_AJUSTE, { error: "Elija el ajuste que pide" }),
    actividadId: z.string().optional(),
    finNuevo: z.string().optional(),
    accionId: z.string().optional(),
    accionTipo: z.string().optional(),
    accionDescripcion: z.string().optional(),
    causaIds: variosValores("Las causas elegidas no son válidas"),
    descripcion: z.string().optional(),
    responsableId: z.string().optional(),
    inicio: z.string().optional(),
    fin: z.string().optional(),
    causa: z.string().optional(),
  })
  .strict()
  // Un campo que falta llega vacío: el dominio lo rechaza con la misma frase que si no llegara.
  .transform((d): z.input<typeof EsquemaPedirAjuste> => {
    const accionNueva = d.accionId === "nueva";
    return {
      hallazgoId: d.hallazgoId,
      tipo: d.tipo,
      actividadId: d.actividadId,
      finNuevo: d.finNuevo,
      nueva:
        d.tipo === "agregar"
          ? {
              accionId: accionNueva ? undefined : d.accionId,
              accion: accionNueva ? { tipo: d.accionTipo ?? "", descripcion: d.accionDescripcion ?? "", causaIds: d.causaIds } : undefined,
              descripcion: d.descripcion ?? "",
              responsableId: d.responsableId ?? "",
              inicio: d.inicio ?? "",
              fin: d.fin ?? "",
            }
          : undefined,
      causa: d.causa ?? "",
    };
  });

/** La nota de una decisión de ajuste: obligatoria al negar; si se escribe al aprobar, también de al menos diez caracteres. */
export const NOTA_CORTA = "La nota debe tener al menos 10 caracteres";

const notaDeLaDecision = (d: { aprueba: boolean; nota: string | null }, ctx: z.RefinementCtx) => {
  if ((!d.aprueba && d.nota === null) || (d.nota !== null && d.nota.length < 10)) {
    ctx.addIssue({ code: "custom", path: ["nota"], message: NOTA_CORTA });
  }
};

const camposDeDecidirAjuste = {
  ajusteId: idRequerido("El ajuste no es válido"),
  aprueba: siONo("Diga si aprueba o niega el ajuste"),
  nota: textoOpcional("La nota", 1000),
};

/** Aprobar o negar un ajuste (spec §10.6), con la nota (obligatoria al negar) y, si se quiere, el acta del Comité. */
export const EsquemaDecidirAjuste = z.object({ ...camposDeDecidirAjuste, acta }).strict().superRefine(notaDeLaDecision);

/** El formulario de la decisión: los de `EsquemaDecidirAjuste`, con el acta en dos campos planos. */
export const EsquemaFormularioDecidirAjuste = z
  .object({ ...camposDeDecidirAjuste, ...camposDelActa })
  .strict()
  .superRefine(actaCompleta)
  .transform(conActa);

const notaDeLaEscalada = textoAcotado("La nota", 10, 1000);

/** Escalar a Gerencia una actividad vencida (spec §10.7), con una nota. */
export const EsquemaEscalar = z.object({ actividadId: idDeActividad, nota: notaDeLaEscalada }).strict();

/** La respuesta de Gerencia a una escalada, con su nota y, si se quiere, el acta del Comité. */
export const EsquemaResponderEscalada = z.object({ actividadId: idDeActividad, nota: notaDeLaEscalada, acta }).strict();

export const EsquemaFormularioResponderEscalada = z
  .object({ actividadId: idDeActividad, nota: notaDeLaEscalada, ...camposDelActa })
  .strict()
  .superRefine(actaCompleta)
  .transform(conActa);

const diaGuardado = z.string().refine(esDiaReal);

/** Lo que guarda cada tipo de ajuste en `mejora_ajustes.datos`: su antes y su después (spec §10.6). */
const DATOS_DE_AJUSTE = {
  reprogramar: z.object({ finAntes: diaGuardado, finNuevo: diaGuardado }).strict(),
  agregar: EsquemaActividadQueSeAnade,
  cancelar: z.object({ estadoAntes: z.enum(ESTADOS_ACTIVIDAD) }).strict(),
} as const;

export type CambioDeAjuste =
  | { tipo: "reprogramar"; finAntes: string; finNuevo: string }
  | ({ tipo: "agregar" } & ActividadQueSeAnade)
  | { tipo: "cancelar"; estadoAntes: EstadoActividad };

/**
 * Los `datos` de un ajuste tal como se guardaron, leídos con el esquema estricto de su tipo: lo que no pasa (un tipo
 * desconocido, una forma vieja) es `null` y quien lo pinta lo dice sin confiar en él.
 */
export function cambioDeAjuste(tipo: string, datos: unknown): CambioDeAjuste | null {
  if (tipo === "reprogramar") {
    const r = DATOS_DE_AJUSTE.reprogramar.safeParse(datos);
    return r.success ? { tipo, ...r.data } : null;
  }
  if (tipo === "agregar") {
    const r = DATOS_DE_AJUSTE.agregar.safeParse(datos);
    return r.success ? { tipo, ...r.data } : null;
  }
  if (tipo === "cancelar") {
    const r = DATOS_DE_AJUSTE.cancelar.safeParse(datos);
    return r.success ? { tipo, ...r.data } : null;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Verificar la implementación, evaluar la eficacia y cerrar (spec 15 §11.4 y §11.5)
// ─────────────────────────────────────────────────────────────────────────────

export const SIN_METODO = "Indique cómo verificó";
export const SIN_DECIDIR = "Marque cada actividad como conforme o devuélvala";
export const SIN_LECCIONES = "Escriba las lecciones aprendidas";
export const SIN_LO_VISTO = "Vuelva a cargar la página: falta lo que se mostró para evaluar";

/** Lo elegido en un conjunto de casillas, sin repetir y en el orden de la lista de valores. */
const enSuOrden = <T extends string>(valores: readonly T[]) => (elegidos: T[]) => valores.filter((x) => elegidos.includes(x));

/**
 * Lo que decide quien verifica de una actividad terminada: conforme, o devuelta con su nota y su fecha para corregir. Que la
 * nota tenga diez caracteres y la fecha sea de hoy en adelante lo mira el dominio, que sabe la etiqueta de la actividad («A1.2»).
 */
const decisionDeActividad = z
  .object({
    id: idDeActividad,
    conforme: z.boolean({ error: SIN_DECIDIR }),
    nota: textoOpcional("La nota de la actividad devuelta", 1000),
    corregirAntesDe: fechaOpcional("Escriba una fecha válida para corregir la actividad devuelta"),
  })
  .strict();

/**
 * Verificar la implementación (spec §11.4): una decisión por actividad terminada de la ronda (las mira el dominio), al menos un
 * método y, si se quiere, una nota.
 */
export const EsquemaVerificacion = z
  .object({
    hallazgoId: idDeHallazgo,
    actividades: z.array(decisionDeActividad, { error: SIN_DECIDIR }).max(MAXIMO_DE_ACCIONES * MAXIMO_DE_ACTIVIDADES, SIN_DECIDIR),
    metodos: variosValores(SIN_METODO)
      .pipe(z.array(z.enum(METODOS_DE_VERIFICACION, { error: "Elija un método de verificación válido" })))
      .transform(enSuOrden(METODOS_DE_VERIFICACION))
      .refine((m) => m.length > 0, SIN_METODO),
    nota: textoOpcional("La nota de la verificación", 2000),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (new Set(d.actividades.map((a) => a.id)).size !== d.actividades.length) {
      ctx.addIssue({ code: "custom", path: ["actividades"], message: "Marque cada actividad una sola vez" });
    }
  });

/** Las lecciones aprendidas del cierre (spec §11.5): al menos diez caracteres. */
const lecciones = z
  .string({ error: SIN_LECCIONES })
  .trim()
  .min(1, SIN_LECCIONES)
  .min(10, "Las lecciones aprendidas deben tener al menos 10 caracteres")
  .max(4000, "Las lecciones aprendidas no pueden pasar de 4000 caracteres");

/** Lo opcional del cierre: vacío es «nada»; escrito, al menos diez caracteres. */
const textoDelCierre = (nombre: string, corto: string) =>
  textoOpcional(nombre, 4000).refine((v) => v === null || v.length >= 10, corto);

const cambiosAtendidos = textoDelCierre("Cómo se atendieron los cambios", "Diga cómo se atendieron los cambios en al menos 10 caracteres");

/**
 * Evaluar la eficacia (spec §11.4): el resultado, los criterios evaluados, el periodo evaluado, la justificación (al menos 20
 * caracteres), la confirmación de las ocurrencias posteriores y la huella de lo que la pantalla mostró (`vistoHuella`, de
 * `huellaDeLoVisto`): se firma lo que se vio. Las lecciones y los cambios atendidos valen solo cuando evalúa y cierra el Admin
 * SGC (lo decide el dominio). Lo que depende de la base y de la hora (la fecha mínima, el indicador, las ocurrencias, que el
 * periodo no termine después de hoy) lo mira el dominio.
 */
export const EsquemaEvaluacion = z
  .object({
    hallazgoId: idDeHallazgo,
    resultado: z.enum(["eficaz", "no_eficaz"], { error: "Elija el resultado de la evaluación" }),
    criterios: variosValores("Marque los criterios que evaluó")
      .pipe(z.array(z.enum(CRITERIOS_EFICACIA, { error: "Elija un criterio de eficacia válido" })))
      .transform(enSuOrden(CRITERIOS_EFICACIA))
      .refine((c) => c.length > 0, "Marque los criterios que evaluó"),
    desde: fechaDelDia("Escriba el inicio del periodo evaluado"),
    hasta: fechaDelDia("Escriba el fin del periodo evaluado"),
    justificacion: textoAcotado("La justificación", 20, 4000),
    confirmaOcurrencias: z.boolean({ error: "La confirmación de las ocurrencias no es válida" }).optional().transform((v) => v === true),
    lecciones: textoDelCierre("Las lecciones aprendidas", "Las lecciones aprendidas deben tener al menos 10 caracteres"),
    cambiosAtendidos,
    vistoHuella: z.string({ error: SIN_LO_VISTO }).regex(/^[0-9a-f]{64}$/, SIN_LO_VISTO),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.desde > d.hasta) {
      ctx.addIssue({ code: "custom", path: ["desde"], message: "El inicio del periodo evaluado no puede ser posterior a su fin" });
    }
  });
export type EvaluacionValidada = z.output<typeof EsquemaEvaluacion>;

/** Cerrar un hallazgo eficaz (spec §11.5): las lecciones aprendidas y, si el análisis pidió cambios, cómo se atendieron. */
export const EsquemaCierre = z.object({ hallazgoId: idDeHallazgo, lecciones, cambiosAtendidos }).strict();
export type CierreValidado = z.output<typeof EsquemaCierre>;

// ─────────────────────────────────────────────────────────────────────────────
// Los formularios de verificar, evaluar y cerrar (Tarea 17): campos planos que las acciones dejan en la forma del dominio, que
// los vuelve a validar todos con `EsquemaVerificacion`, `EsquemaEvaluacion` y `EsquemaCierre`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La verificación: una casilla `actividad` por fila (su id) y los métodos marcados. Lo que se decide de cada actividad viaja en
 * `decision_<id>`, `nota_<id>` y `corregir_<id>`: la acción los lee aparte (`camposDeLaVerificada`) y los omite aquí.
 */
export const EsquemaFormularioVerificacion = z
  .object({
    hallazgoId: idDeHallazgo,
    actividad: variosValores(SIN_DECIDIR).pipe(z.array(z.string().regex(/^\d{1,15}$/, SIN_DECIDIR), { error: SIN_DECIDIR })),
    metodos: variosValores(SIN_METODO).pipe(z.array(z.string(), { error: SIN_METODO })),
    nota: z.string().optional(),
  })
  .strict();

/** Los campos que la verificación lee de cada actividad (`actividad` lleva su id). */
export const camposDeLaVerificada = (id: string) => [`decision_${id}`, `nota_${id}`, `corregir_${id}`] as const;

/** Los ids de las filas del formulario de verificar (`actividad`), solo los que tienen forma de id. */
export function idsDeLaVerificacion(datos: FormData): string[] {
  return datos.getAll("actividad").filter((v): v is string => typeof v === "string" && /^\d{1,15}$/.test(v));
}

/** Los campos propios de esas filas: los que `parsearFormulario` omite al leer `EsquemaFormularioVerificacion`. */
export const camposDeLaVerificacion = (ids: readonly string[]): string[] => ids.flatMap((id) => [...camposDeLaVerificada(id)]);

/**
 * Lo que se decidió de cada fila, en la forma de `verificarImplementacion`: `conforme` (o devuelta) con su nota y su fecha para
 * corregir tal como llegaron. Una fila sin una decisión válida no trae `conforme`, y el dominio responde `SIN_DECIDIR`.
 */
export function decisionesDeLaVerificacion(
  datos: FormData,
  ids: readonly string[],
): Array<{ id: number; conforme: boolean | undefined; nota: string | null; corregirAntesDe: string | null }> {
  const texto = (campo: string) => {
    const v = datos.get(campo);
    return typeof v === "string" && v.trim() !== "" ? v : null;
  };
  return ids.map((id) => {
    const [decision, nota, corregir] = camposDeLaVerificada(id);
    const elegida = datos.get(decision);
    return {
      id: Number(id),
      conforme: elegida === "conforme" ? true : elegida === "devuelta" ? false : undefined,
      nota: texto(nota),
      corregirAntesDe: texto(corregir),
    };
  });
}

/**
 * La evaluación con su firma: los campos de `EsquemaEvaluacion` como texto (los criterios, en casillas con el mismo nombre; la
 * confirmación de las ocurrencias, `si` o nada) más la clave y el código.
 */
export const EsquemaFormularioEvaluacion = z
  .object({
    hallazgoId: idDeHallazgo,
    resultado: z.string().optional(),
    criterios: variosValores("Marque los criterios que evaluó").pipe(z.array(z.string(), { error: "Marque los criterios que evaluó" })),
    desde: z.string().optional(),
    hasta: z.string().optional(),
    justificacion: z.string().optional(),
    confirmaOcurrencias: marca,
    lecciones: z.string().optional(),
    cambiosAtendidos: z.string().optional(),
    vistoHuella: z.string().optional(),
    ...firma,
  })
  .strict()
  .transform((d) => ({ ...d, confirmaOcurrencias: d.confirmaOcurrencias === "si" }));

/** El cierre con su firma: las lecciones, cómo se atendieron los cambios, la clave y el código. */
export const EsquemaFormularioCierre = z
  .object({ hallazgoId: idDeHallazgo, lecciones: z.string().optional(), cambiosAtendidos: z.string().optional(), ...firma })
  .strict();

// ─────────────────────────────────────────────────────────────────────────────
// Los reportes de funcionarios (spec 15 §7.3)
// ─────────────────────────────────────────────────────────────────────────────

export const QUE_VIO_CORTO = "Cuente qué vio, en al menos 10 caracteres";
export const MOTIVO_DEL_DESCARTE = "Escriba el motivo del descarte en al menos 10 caracteres";

/**
 * El reporte de un funcionario, del formulario o del dominio: qué vio (de 10 a 2.000 caracteres), cuándo, en qué proceso
 * (vacío es «no sé») y, si aplica, la referencia del caso. Que el día no sea futuro y que el proceso esté activo los mira el
 * dominio.
 */
export const EsquemaReporte = z
  .object({
    descripcion: z
      .string({ error: QUE_VIO_CORTO })
      .trim()
      .min(10, QUE_VIO_CORTO)
      .max(2000, "Lo que vio no puede pasar de 2000 caracteres"),
    vistoEn: fechaDelDia("Escriba una fecha válida en que lo vio"),
    procesoId: idOpcional("El proceso elegido no es válido"),
    referenciaCaso: textoOpcional("La referencia del caso", 100),
  })
  .strict();
export type ReporteValidado = z.output<typeof EsquemaReporte>;

const idDeReporte = idRequerido("El reporte no es válido");

/** Añadir el reporte como ocurrencia de un hallazgo abierto (spec §7.3 y §7.5). */
export const EsquemaSumarReporte = z
  .object({ reporteId: idDeReporte, hallazgoId: idRequerido("Elija el hallazgo abierto al que lo añade") })
  .strict();

/**
 * El formulario de «Añadir a un hallazgo abierto»: uno de los parecidos (`hallazgoId`) o, si no es ninguno, el código de otro
 * abierto (`codigo`); la acción resuelve el código entre los que la persona ve y deja la forma de `EsquemaSumarReporte`.
 */
export const EsquemaFormularioSumarReporte = z
  .object({
    reporteId: idDeReporte,
    hallazgoId: idOpcional("Elija el hallazgo abierto al que lo añade"),
    codigo: textoOpcional("El código del hallazgo", 20),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.hallazgoId === null && d.codigo === null) {
      ctx.addIssue({ code: "custom", path: ["hallazgoId"], message: "Elija el hallazgo abierto al que lo añade" });
    }
  });

/** Descartar el reporte, con su motivo (al menos diez caracteres): quien reportó lo lee. */
export const EsquemaDescarte = z
  .object({
    reporteId: idDeReporte,
    motivo: z
      .string({ error: MOTIVO_DEL_DESCARTE })
      .trim()
      .min(10, MOTIVO_DEL_DESCARTE)
      .max(1000, "El motivo no puede pasar de 1000 caracteres"),
  })
  .strict();

// ─────────────────────────────────────────────────────────────────────────────
// El plan de mejoramiento y la clasificación de un hallazgo (Fase 15B, anexo §3.1 a §3.4 y §10.4)
// ─────────────────────────────────────────────────────────────────────────────

/** Los campos del plan que se escriben al crearlo y al editarlo (la vigencia solo al crearlo: está en su código). */
const camposDelPlan = {
  nombre: textoAcotado("El nombre del plan", 5, 200),
  origen: z.enum(ORIGENES_HALLAZGO, { error: "Elija el origen del plan" }),
  fechaEvento: z
    .string({ error: "Escriba la fecha del evento" })
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Escriba una fecha válida del evento")
    .refine(esFechaReal, "Escriba una fecha válida del evento")
    .refine(enRango, FECHA_FUERA_DE_RANGO),
  objetivoTexto: textoOpcional("El objetivo del plan", 1000),
  objetivoId: idOpcional("El objetivo elegido no es válido"),
  fechaLimiteEnte: fechaOpcional("Escriba una fecha límite del ente válida"),
};

/** La fecha del ente es obligatoria en «Ente de control» (spec 15 §13.4); en «Auditoría externa», opcional. */
const fechaDelEnteDelPlan = (d: { origen: Origen; fechaLimiteEnte: string | null }, ctx: z.RefinementCtx) => {
  if (d.origen === "ente_control" && !d.fechaLimiteEnte) {
    ctx.addIssue({ code: "custom", path: ["fechaLimiteEnte"], message: FALTA_LA_FECHA_DEL_ENTE });
  }
};

/** Con un origen interno la fecha del ente no existe: la que llegue se ignora. */
const soloConOrigenExterno = <T extends { origen: Origen; fechaLimiteEnte: string | null }>(d: T): T => ({
  ...d,
  fechaLimiteEnte: esExterno(d.origen) ? d.fechaLimiteEnte : null,
});

/** El plan que recibe `crearPlan`: la vigencia, del 2000 al 2100 y, por omisión, el año de la fecha del evento. */
export const EsquemaPlan = z
  .object({ ...camposDelPlan, vigencia: entero("La vigencia", 2000, 2100).optional() })
  .strict()
  .superRefine(fechaDelEnteDelPlan)
  .transform((d) => ({ ...soloConOrigenExterno(d), vigencia: d.vigencia ?? Number(d.fechaEvento.slice(0, 4)) }));
export type PlanValidado = z.output<typeof EsquemaPlan>;

/** El plan que recibe `editarPlan`: todo menos el código y la vigencia (anexo §3.2). */
export const EsquemaEdicionDePlan = z.object(camposDelPlan).strict().superRefine(fechaDelEnteDelPlan).transform(soloConOrigenExterno);
export type EdicionDePlanValidada = z.output<typeof EsquemaEdicionDePlan>;

const idDePlan = idRequerido("El plan no es válido");

/** El motivo de anular un plan o de sacar o mover un hallazgo: al menos diez caracteres. Va al historial del plan, no a la bitácora. */
const motivoDelPlan = z
  .string({ error: MOTIVO_CORTO })
  .trim()
  .min(10, MOTIVO_CORTO)
  .max(1000, "El motivo no puede pasar de 1000 caracteres");

/** Si el que entra sin objetivo recibe el del plan (spec 15 §17.7): por omisión, sí. */
const conElObjetivoDelPlan = z
  .boolean({ error: "Diga si el hallazgo recibe el objetivo del plan" })
  .optional()
  .transform((v) => v ?? true);

export const EsquemaAnulacionDePlan = z.object({ planId: idDePlan, motivo: motivoDelPlan }).strict();

export const EsquemaPonerEnPlan = z
  .object({
    planId: idDePlan,
    hallazgoIds: z
      .array(idDeHallazgo, { error: "Elija al menos un hallazgo" })
      .min(1, "Elija al menos un hallazgo")
      .max(200, "Se añaden doscientos hallazgos a la vez como máximo")
      .transform((ids) => [...new Set(ids)].sort((a, b) => a - b)),
    conObjetivo: conElObjetivoDelPlan,
  })
  .strict();

export const EsquemaSacarDelPlan = z.object({ hallazgoId: idDeHallazgo, motivo: motivoDelPlan }).strict();

/**
 * El formulario de «Añadir hallazgos» y de «Poner en un plan» (anexo §3.4): las casillas `hallazgoIds` (una o varias) y la del
 * objetivo del plan (`si`). Una casilla desmarcada no viaja: sin ella el formulario dice «no», y la acción lo manda así, porque el
 * dominio, por omisión, entiende «sí». `volverAlPlan` (`si`), desde el selector: la acción lleva de vuelta a la página del plan.
 */
export const EsquemaFormularioPonerEnPlan = z
  .object({
    planId: idDePlan,
    hallazgoIds: variosValores("Elija al menos un hallazgo").pipe(z.array(idDeHallazgo).min(1, "Elija al menos un hallazgo")),
    conObjetivo: marca,
    volverAlPlan: marca,
  })
  .strict()
  .transform((d) => ({ planId: d.planId, hallazgoIds: d.hallazgoIds, conObjetivo: d.conObjetivo === "si", volverAlPlan: d.volverAlPlan === "si" }));

export const EsquemaCambiarDePlan = z
  .object({ hallazgoId: idDeHallazgo, planId: idDePlan, motivo: motivoDelPlan, conObjetivo: conElObjetivoDelPlan })
  .strict();

/** El formulario de «Cambiar de plan»: la casilla del objetivo (`si`); desmarcada no viaja y vale «no», como al poner en un plan. */
export const EsquemaFormularioCambiarDePlan = z
  .object({ hallazgoId: idDeHallazgo, planId: idDePlan, motivo: motivoDelPlan, conObjetivo: marca })
  .strict()
  .transform((d) => ({ ...d, conObjetivo: d.conObjetivo === "si" }));

/** Los hallazgos que el formulario de la respuesta mostró como listos (anexo §3.8): sin repetir y de menor a mayor. */
const hallazgosVistos = z
  .array(idDeHallazgo, { error: "La lista de hallazgos no es válida" })
  .max(500, "La lista de hallazgos no es válida")
  .transform((ids) => [...new Set(ids)].sort((a, b) => a - b));

const camposDeLaRespuestaDelPlan = {
  planId: idDePlan,
  enviadaEn: fechaDelDia("Escriba la fecha en que se envió la respuesta al ente"),
  // El oficio: un archivo del plan que no es ya el de otra respuesta (lo comprueba el dominio).
  oficioId: oficioDeLaRespuesta,
};

/** La respuesta al ente desde el plan (anexo §3.8): la fecha, el oficio y la lista que se vio. Sus reglas las mira el dominio. */
export const EsquemaRespuestaDelPlan = z.object({ ...camposDeLaRespuestaDelPlan, vistos: hallazgosVistos }).strict();

/** El formulario de la respuesta desde el plan: un `vistos` por hallazgo que mostró como listo (ninguno, si no mostró ninguno). */
export const EsquemaFormularioRespuestaDelPlan = z
  .object({ ...camposDeLaRespuestaDelPlan, vistos: variosValores("La lista de hallazgos no es válida").pipe(hallazgosVistos) })
  .strict();

/** El objetivo de un hallazgo: uno del maestro, o ninguno (lo quita). */
export const EsquemaObjetivoDelHallazgo = z
  .object({ hallazgoId: idDeHallazgo, objetivoId: idOpcional("El objetivo elegido no es válido") })
  .strict();
