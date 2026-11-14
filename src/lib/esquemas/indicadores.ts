import { z } from "zod";
import { JUSTIFICACION_MAXIMA, JUSTIFICACION_MINIMA, PATRON_MES } from "@/lib/indicadores/cierre";
import { FACTORES_TASA } from "@/lib/indicadores/formula/formas";
import { fraccion } from "@/lib/indicadores/formula/fraccion";
import { claveDeCorrespondencia } from "@/lib/indicadores/importacion/formulario";
import { periodicidadDe } from "@/lib/indicadores/periodos";
import { SIGNOS } from "@/lib/indicadores/rangos";
import {
  CONSOLIDACIONES,
  FORMAS,
  FUNCIONES_DESIGNADO,
  MAXIMO_EN_BLOQUE,
  MAXIMO_HISTORICOS,
  MAXIMO_TEXTO_MEDICION,
  MODOS_SEMAFORO,
  NIVELES_ACCESO,
  PERIODICIDADES,
  TENDENCIAS,
} from "@/lib/indicadores/tipos";
import { parsearFormulario, textoAcotado } from "@/lib/validacion";

/**
 * El formulario de la ficha de indicador (spec 14 §7.2, §7.3 y §12.4). Llega como texto: los números se validan con
 * `fraccion` y viajan como texto con punto decimal; las listas y las variables, como JSON en un campo oculto. Lo que
 * el esquema devuelve vale otra vez como entrada (las consultas lo vuelven a validar).
 */

/** El código de un indicador (`SGC-IND-01`): también es un segmento de la URL. */
export const PATRON_CODIGO_INDICADOR = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
export const LARGO_CODIGO_INDICADOR = 30;
/** Los segmentos de `/indicadores/…` que son páginas de la aplicación, no indicadores (sin distinguir mayúsculas). */
export const CODIGOS_RESERVADOS: readonly string[] = ["nuevo", "matriz", "por-aprobar", "cierre", "excel"];
const RESERVADO = "«nuevo», «matriz», «por-aprobar», «cierre» y «excel» son nombres reservados: elija otro código";

/** Un entero: texto del formulario o número de la consulta. */
const entero = (nombre: string, minimo: number, maximo: number) =>
  z
    .union([z.number(), z.string().regex(/^\d{1,15}$/)], { error: `${nombre} debe ser un número entero` })
    .transform(Number)
    .pipe(
      z
        .number()
        .int(`${nombre} debe ser un número entero`)
        .min(minimo, `${nombre} debe estar entre ${minimo} y ${maximo}`)
        .max(maximo, `${nombre} debe estar entre ${minimo} y ${maximo}`),
    );

const id = (mensaje: string) =>
  z
    .union([z.number(), z.string().regex(/^\d{1,15}$/)], { error: mensaje })
    .transform(Number)
    .pipe(z.number().int(mensaje).positive(mensaje));

/** Un número escrito con coma o punto; se guarda con punto («80,5» → «80.5»). */
const numero = (mensaje: string) =>
  z
    .string({ error: mensaje })
    .trim()
    .refine((v) => fraccion(v) !== null, mensaje)
    .transform((v) => v.replace(",", "."));

/** Texto opcional recortado; vacío es «no vino». */
const opcional = (nombre: string, maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo, `${nombre} no puede pasar de ${maximo} caracteres`)
    .transform((v) => v || undefined)
    .optional();

/** Una casilla del formulario llega como «on» (o no llega); la consulta la recibe como booleano. */
const casilla = z
  .union([z.boolean(), z.literal("on")])
  .optional()
  .transform((v) => v === true || v === "on");

/** Un campo oculto con JSON; la consulta lo recibe ya leído. El JSON roto es un error de validación, no una excepción. */
function enJson<T extends z.ZodType>(esquema: T, formatoInvalido: string) {
  return z.preprocess((valor, ctx) => {
    if (typeof valor !== "string") return valor;
    try {
      return JSON.parse(valor) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: formatoInvalido });
      return z.NEVER;
    }
  }, esquema);
}

/** Una lista de ids sin repetidos, de hasta 20 elementos. */
const listaDeIds = (formatoInvalido: string, tope: string, alMenosUno?: string) => {
  const lista = z.array(id(formatoInvalido), { error: alMenosUno ?? formatoInvalido }).max(20, tope);
  return enJson((alMenosUno ? lista.min(1, alMenosUno) : lista).transform((xs) => [...new Set(xs)]), formatoInvalido);
};

const EsquemaVariable = z
  .object({
    letra: z.string({ error: "Cada variable lleva una letra de la A a la Z" }).regex(/^[A-Z]$/, "Cada variable lleva una letra de la A a la Z"),
    nombre: textoAcotado("El nombre de cada variable", 1, 150),
    descripcion: opcional("La descripción de una variable", 500),
    fuente: opcional("La fuente de una variable", 300),
    unidad: opcional("La unidad de una variable", 40),
    consolidacion: z.enum(CONSOLIDACIONES, { error: "Elija cómo se junta cada variable" }),
    capturaMin: numero("El mínimo de captura debe ser un número").optional(),
    capturaMax: numero("El máximo de captura debe ser un número").optional(),
    admiteNegativos: z.boolean({ error: "Diga si cada variable admite negativos" }),
  })
  .strict();

const EsquemaPrueba = z
  .object({
    valores: z
      .record(
        z.string().regex(/^[A-Z]$/, "La prueba lleva un valor por variable"),
        z.string({ error: "Los valores de la prueba deben ser números" }).trim().refine((v) => fraccion(v) !== null, "Los valores de la prueba deben ser números"),
      )
      .refine((v) => Object.keys(v).length <= 26, "La prueba lleva un valor por variable"),
  })
  .strict();

const FORMATO_RANGOS = "Los rangos del semáforo no tienen un formato válido";
const NUMERO_RANGOS = "Los valores de los rangos deben ser números";

/** Un renglón de los rangos: el signo y uno o dos números (el segundo solo con «entre»). */
const EsquemaFilaDeRango = z
  .object({
    signo: z.enum(SIGNOS, { error: FORMATO_RANGOS }),
    valor: numero(NUMERO_RANGOS),
    hasta: numero(NUMERO_RANGOS).optional(),
  })
  .strict()
  .refine((f) => (f.signo === "entre") === (f.hasta !== undefined), "Solo «entre» lleva dos valores, y los lleva");

const filasDeRango = z.array(EsquemaFilaDeRango, { error: FORMATO_RANGOS }).max(4, "Un estado admite hasta cuatro renglones");

/** Los rangos por estado (spec 14A §3.2); la regla entre ellos la revisa `errorDeRangos`. */
export const EsquemaRangos = z.object({ bien: filasDeRango, atencion: filasDeRango, critico: filasDeRango }).strict();

/** Los rangos viajan como el JSON de `RangosEnTexto` en un solo campo; vacío es «no vino». Devuelve el JSON normalizado. */
const rangosEnJson = z
  .string({ error: FORMATO_RANGOS })
  .transform((v, ctx) => {
    if (v.trim() === "") return undefined;
    let leido: unknown;
    try {
      leido = JSON.parse(v);
    } catch {
      ctx.addIssue({ code: "custom", message: FORMATO_RANGOS });
      return z.NEVER;
    }
    const r = EsquemaRangos.safeParse(leido);
    if (!r.success) {
      ctx.addIssue({ code: "custom", message: r.error.issues[0].message });
      return z.NEVER;
    }
    return JSON.stringify(r.data);
  })
  .optional();

export const EsquemaFicha = z
  .object({
    procesoId: id("Elija el proceso"),
    subprocesoId: id("El subproceso no es válido").optional(),
    codigo: z
      .string()
      .trim()
      .max(LARGO_CODIGO_INDICADOR, `El código no puede pasar de ${LARGO_CODIGO_INDICADOR} caracteres`)
      .regex(PATRON_CODIGO_INDICADOR, "El código solo admite letras, números y guiones")
      .refine((c) => !CODIGOS_RESERVADOS.includes(c.toLowerCase()), RESERVADO)
      .optional(),
    nombre: textoAcotado("El nombre", 1, 200),
    proposito: textoAcotado("El objetivo del indicador", 1, 1000),
    requisito: opcional("El requisito", 120),
    tipoId: id("Elija el tipo"),
    clasificacionId: id("Elija la clasificación"),
    objetivoId: id("El objetivo que mide no es válido").optional(),
    procedimientoDocumentoId: id("El procedimiento no es válido").optional(),
    puntoControl: opcional("El punto de control", 60),
    forma: z.enum(FORMAS, { error: "Elija cómo se calcula" }),
    factor: entero("El factor de la tasa", 1, 100_000)
      .refine((f) => FACTORES_TASA.includes(f), "El factor de la tasa debe ser 100, 1.000, 10.000 o 100.000")
      .optional(),
    formula: opcional("La fórmula", 300),
    variables: enJson(
      z
        .array(EsquemaVariable, { error: "Declare al menos una variable" })
        .min(1, "Declare al menos una variable")
        .max(26, "Una ficha admite hasta 26 variables"),
      "Las variables no tienen un formato válido",
    ),
    unidadId: id("Elija la unidad del resultado"),
    decimales: entero("Los decimales", 0, 4),
    periodicidad: z.enum(PERIODICIDADES, { error: "Elija la periodicidad" }),
    tendencia: z.enum(TENDENCIAS, { error: "Elija la tendencia" }),
    meta: numero("La meta debe ser un número").optional(),
    metaMax: numero("El máximo del rango debe ser un número").optional(),
    semaforoModo: z.enum(MODOS_SEMAFORO, { error: "Elija el modo del semáforo" }).optional(),
    rangos: rangosEnJson,
    umbralAtencionPct: entero("El umbral de atención", 1, 99).optional(),
    limiteCritico: numero("El límite de crítico debe ser un número").optional(),
    tolerancia: numero("La tolerancia debe ser un número").optional(),
    resultadoMin: numero("El mínimo del resultado debe ser un número").optional(),
    resultadoMax: numero("El máximo del resultado debe ser un número").optional(),
    lineaBaseValor: numero("La línea base debe ser un número").optional(),
    lineaBasePeriodo: z
      .string()
      .trim()
      .refine((v) => periodicidadDe(v) !== null, "El periodo de la línea base no es válido: escriba 2025, 2025-T4 o 2025-11")
      .optional(),
    lineaBaseNota: opcional("La nota de la línea base", 500),
    sustentoMeta: opcional("El sustento de la meta", 500),
    nivel: opcional("El nivel", 60),
    riesgoAsociado: opcional("El riesgo asociado", 300),
    cargosMedir: listaDeIds("Los cargos responsables de medir no son válidos", "Elija hasta 20 cargos", "Elija al menos un cargo responsable de medir"),
    cargosAnalizar: listaDeIds("Los cargos responsables de analizar no son válidos", "Elija hasta 20 cargos", "Elija al menos un cargo responsable de analizar"),
    normaIds: listaDeIds("Las normas no son válidas", "Elija hasta 20 normas").optional().transform((v) => v ?? []),
    ente: opcional("El ente al que se reporta", 150),
    periodicidadExterna: z.enum(PERIODICIDADES, { error: "Elija con qué periodicidad se reporta al ente" }).optional(),
    plazoExternoDias: entero("El plazo del ente", 0, 365).optional(),
    motivoCambio: opcional("El motivo del cambio", 500),
    prueba: enJson(EsquemaPrueba, "La prueba no tiene un formato válido").optional(),
    plazoReporteDias: entero("El plazo de reporte", 0, 90),
    inicioMedicion: z
      .string({ error: "Elija el inicio de medición" })
      .trim()
      .refine((v) => periodicidadDe(v) !== null, "El inicio de medición no es un periodo válido"),
    soporteObligatorio: casilla,
    nivelAcceso: z.enum(NIVELES_ACCESO, { error: "Elija el nivel de acceso" }),
    mide: listaDeIds("Las personas que miden no son válidas", "Elija hasta 20 personas").optional().transform((v) => v ?? []),
    analiza: listaDeIds("Las personas que analizan no son válidas", "Elija hasta 20 personas").optional().transform((v) => v ?? []),
  })
  .strict();

export type DatosFicha = z.infer<typeof EsquemaFicha>;

/** La clave y el código del segundo factor de una firma, como en `EsquemaRatificar`: la clave no se recorta. */
const firma = {
  clave: z.string({ error: "Escriba su clave" }).min(1, "Escriba su clave").max(128, "La clave no puede pasar de 128 caracteres"),
  codigo: textoAcotado("El código", 6, 20).optional(),
};

/** Enviar la ficha a aprobación o publicar un cambio menor (spec §7.6); el `id` de la versión viaja aparte. */
export const EsquemaEnviarFicha = z
  .object({
    rigeDesde: z
      .string()
      .trim()
      .refine((v) => periodicidadDe(v) !== null, "«Rige desde» no es un periodo válido")
      .optional(),
    motivo: opcional("El motivo del cambio", 500),
    ...firma,
  })
  .strict();

/** Aprobar en bloque (spec §7.6.4): los ids de las versiones elegidas, en JSON. */
export const EsquemaAprobarFichas = z
  .object({
    versionIds: enJson(
      z
        .array(id("Las fichas elegidas no son válidas"), { error: "Elija al menos una ficha" })
        .min(1, "Elija al menos una ficha")
        .max(MAXIMO_EN_BLOQUE, `Elija hasta ${MAXIMO_EN_BLOQUE} fichas`),
      "Las fichas elegidas no son válidas",
    ),
    ...firma,
  })
  .strict();

/** Devolver con nota, sin clave (spec §7.6.3); el `id` de la versión viaja aparte. */
export const EsquemaDevolverFicha = z.object({ nota: textoAcotado("La nota", 5, 1000) }).strict();

/** Designar personas (spec §7.3): la función y la lista completa de quienes la tienen; el `id` del indicador viaja aparte. */
export const EsquemaDesignar = z
  .object({
    funcion: z.enum(FUNCIONES_DESIGNADO, { error: "Elija la función" }),
    usuarioIds: listaDeIds("Las personas elegidas no son válidas", "Elija hasta 20 personas"),
  })
  .strict();

/** Los datos de operación (spec §7.3); el `id` del indicador viaja aparte. */
export const EsquemaOperacion = z
  .object({
    plazoReporteDias: entero("El plazo de reporte", 0, 90),
    inicioMedicion: z
      .string({ error: "Elija el inicio de medición" })
      .trim()
      .refine((v) => periodicidadDe(v) !== null, "El inicio de medición no es un periodo válido"),
    soporteObligatorio: casilla,
    nivelAcceso: z.enum(NIVELES_ACCESO, { error: "Elija el nivel de acceso" }),
  })
  .strict();

/** «Crear a partir de este» (spec §7.7): el proceso del indicador nuevo; el `id` del original viaja aparte. */
export const EsquemaDuplicar = z.object({ procesoId: id("Elija el proceso") }).strict();

/** Retirar o descartar un indicador (spec §7.7): motivo obligatorio y sin clave; el `id` viaja aparte. */
export const EsquemaMotivoDeBaja = z.object({ motivo: textoAcotado("El motivo", 5, 500) }).strict();

/**
 * Reportar, guardar sin reportar o corregir una medición (spec §8.2): los valores por letra, en JSON, tal como se
 * digitaron (la consulta los valida con los límites de la ficha); `intencion` dice qué botón se pulsó. El `id` de la
 * medición y `volver` viajan aparte.
 */
export const EsquemaReporte = z
  .object({
    valores: enJson(
      z
        .record(z.string(), z.string({ error: "Los valores no tienen un formato válido" }).max(40, "Un valor no puede pasar de 40 caracteres"))
        .refine((v) => Object.keys(v).length <= 26 && Object.keys(v).every((l) => /^[A-Z]$/.test(l)), "Los valores no tienen un formato válido"),
      "Los valores no tienen un formato válido",
    ),
    // Obligatorio: si el botón pulsado no llega, no se reporta un borrador por error.
    intencion: z.enum(["reportar", "parcial"], { error: "Elija si reporta o guarda sin reportar" }),
    confirmado: casilla,
  })
  .strict();

/** «No aplica en este periodo» (spec §8.2): motivo de 5 a 500 caracteres. El `id` de la medición y `volver`, aparte. */
export const EsquemaNoAplica = z.object({ motivo: textoAcotado("El motivo", 5, 500) }).strict();

/**
 * El formulario de reporte manda cada variable en su propio campo (`valor_A` … `valor_Z`), para que funcione igual antes
 * de hidratar; aquí se juntan en `valores` (JSON), como los lee `EsquemaReporte`. Lo demás pasa igual.
 */
export function juntarValoresDeReporte(formData: FormData): FormData {
  const salida = new FormData();
  const valores: Record<string, string> = {};
  for (const [campo, valor] of formData) {
    const letra = /^valor_(.+)$/.exec(campo)?.[1];
    if (letra !== undefined && typeof valor === "string") valores[letra] = valor;
    else salida.append(campo, valor);
  }
  if (Object.keys(valores).length > 0) salida.set("valores", JSON.stringify(valores));
  return salida;
}

/** Una parte del análisis; la consulta decide qué alcanza. Lo vaciado lo dice `analisisDelFormulario`. */
const parteDeAnalisis = (nombre: string) =>
  z
    .string({ error: `${nombre} no tiene un formato válido` })
    .max(MAXIMO_TEXTO_MEDICION, `${nombre} no puede pasar de ${MAXIMO_TEXTO_MEDICION} caracteres`)
    .optional();

/** El análisis de una medición (spec §8.4). El `id` de la medición y `volver` viajan aparte. */
export const EsquemaAnalisis = z
  .object({
    analisis: parteDeAnalisis("El análisis"),
    causa: parteDeAnalisis("La causa de la desviación"),
    accionPropuesta: parteDeAnalisis("La acción propuesta"),
  })
  .strict();

type TextosDelFormulario = { analisis?: string; causa?: string; accionPropuesta?: string };

/**
 * Lo que `analizar` recibe del formulario del análisis. Un campo vacío no llega a lo que devuelve el esquema
 * (`parsearFormulario` lo quita): si el formulario lo trae, la persona lo vació y se borra; si no lo trae, queda como
 * estaba.
 */
export function analisisDelFormulario(formData: FormData): TextosDelFormulario {
  const d = parsearFormulario(formData, EsquemaAnalisis, { omitir: ["id", "volver"] });
  const salida: TextosDelFormulario = {};
  for (const campo of ["analisis", "causa", "accionPropuesta"] as const) {
    const valor = d[campo] ?? (formData.has(campo) ? "" : undefined);
    if (valor !== undefined) salida[campo] = valor;
  }
  return salida;
}

const textoDeObservacion = (que: "observación" | "respuesta") =>
  z
    .string({ error: `Escriba la ${que}` })
    .trim()
    .min(1, `Escriba la ${que}`)
    .max(MAXIMO_TEXTO_MEDICION, `La ${que} no puede pasar de ${MAXIMO_TEXTO_MEDICION} caracteres`);

/** Una observación (spec §8.6), de 1 a `MAXIMO_TEXTO_MEDICION` caracteres; el `id` de la medición viaja aparte. */
export const EsquemaObservacion = z.object({ texto: textoDeObservacion("observación") }).strict();

/** La respuesta a una observación; el `id` de la observación viaja aparte. */
export const EsquemaRespuesta = z.object({ texto: textoDeObservacion("respuesta") }).strict();

/** El mes que se cierra (spec §9), `AAAA-MM`; la consulta exige que haya terminado y que no esté cerrado. */
export const EsquemaCierreMes = z
  .object({
    mes: z
      .string({ error: "Elija el mes" })
      .trim()
      .regex(PATRON_MES, "Elija el mes"),
  })
  .strict();

/** La justificación de una reapertura (spec §8.7): de 10 a 1000 caracteres; el `id` de la medición viaja aparte. */
export const EsquemaReapertura = z
  .object({ justificacion: textoAcotado("La justificación", JUSTIFICACION_MINIMA, JUSTIFICACION_MAXIMA) })
  .strict();

/** Programar la meta de un periodo (spec §8.9); el `id` del indicador viaja aparte. Un máximo vacío es «sin máximo». */
export const EsquemaMeta = z
  .object({
    periodo: z
      .string({ error: "Elija el periodo" })
      .trim()
      .refine((v) => periodicidadDe(v) !== null, "El periodo no es válido"),
    meta: numero("La meta debe ser un número"),
    metaMax: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      numero("El máximo del rango debe ser un número").optional(),
    ),
    justificacion: opcional("La justificación", 500),
  })
  .strict();

/**
 * Los históricos de la tabla del año (spec §8.8): una fila por periodo con sus valores por letra o «no aplica» con su
 * motivo (la consulta lo valida, como `marcarNoAplica`), en JSON.
 */
export const EsquemaHistoricos = z
  .object({
    filas: enJson(
      z
        .array(
          z
            .object({
              periodo: z.string().refine((v) => periodicidadDe(v) !== null, "Las filas no tienen un formato válido"),
              valores: z
                .record(z.string(), z.string().max(40, "Un valor no puede pasar de 40 caracteres"))
                .refine((v) => Object.keys(v).length <= 26 && Object.keys(v).every((l) => /^[A-Z]$/.test(l)), "Las filas no tienen un formato válido"),
              noAplica: z.literal(true).optional(),
              motivo: z.string().max(500, "El motivo no puede pasar de 500 caracteres").optional(),
            })
            .strict(),
          { error: "Las filas no tienen un formato válido" },
        )
        .max(MAXIMO_HISTORICOS, `Registre hasta ${MAXIMO_HISTORICOS} periodos a la vez`),
      "Las filas no tienen un formato válido",
    ),
  })
  .strict();

/**
 * El modo edición de la tabla del año manda cada celda en su propio campo (`h_2025-T3_A`), y «No aplica» y su motivo en
 * los suyos (`na_2025-T3`, `motivo_2025-T3`), para que funcione igual antes de hidratar; aquí se juntan en `filas`
 * (JSON), como las lee `EsquemaHistoricos`. Sin la casilla, el motivo no cuenta. Lo demás pasa igual.
 */
export function juntarHistoricos(formData: FormData): FormData {
  const salida = new FormData();
  const filas = new Map<string, { valores: Record<string, string>; noAplica?: true; motivo?: string }>();
  const fila = (periodo: string) => filas.get(periodo) ?? filas.set(periodo, { valores: {} }).get(periodo)!;
  const motivos = new Map<string, string>();
  for (const [campo, valor] of formData) {
    const celda = /^h_(.+)_([^_]+)$/.exec(campo);
    const noAplica = /^na_(.+)$/.exec(campo);
    const motivo = /^motivo_(.+)$/.exec(campo);
    if (typeof valor === "string" && celda) fila(celda[1]).valores[celda[2]] = valor;
    else if (typeof valor === "string" && noAplica) fila(noAplica[1]).noAplica = true;
    else if (typeof valor === "string" && motivo) motivos.set(motivo[1], valor);
    else salida.append(campo, valor);
  }
  for (const [periodo, f] of filas) {
    const motivo = motivos.get(periodo);
    if (f.noAplica && motivo) f.motivo = motivo;
  }
  if (filas.size > 0) salida.set("filas", JSON.stringify([...filas].map(([periodo, f]) => ({ periodo, ...f }))));
  return salida;
}

// ─────────────────────────────────────────────────────────────────────────────
// La importación de fichas (spec 14A §5.3 a §5.6)
// ─────────────────────────────────────────────────────────────────────────────

/** Una lista de ids sin repetidos que puede ir vacía, ya leída (la importación no la manda como JSON). */
const idsQuePuedenFaltar = (mensaje: string) =>
  z.array(id(mensaje), { error: mensaje }).max(20, "Elija hasta 20 cargos").transform((xs) => [...new Set(xs)]);

/**
 * La ficha de una fila importada (spec 14A §5.6): como `EsquemaFicha`, pero el objetivo del indicador y los cargos
 * responsables pueden faltar, porque la plantilla no los exige. Solo la usa la importación: el formulario sigue con
 * `EsquemaFicha`, y la ficha propuesta los pide al editarse.
 */
export const EsquemaFichaImportada = EsquemaFicha.extend({
  proposito: z
    .string({ error: "El objetivo del indicador no es válido" })
    .trim()
    .max(1000, "El objetivo del indicador no puede pasar de 1000 caracteres")
    .nullable()
    .transform((v) => v || null),
  cargosMedir: idsQuePuedenFaltar("Los cargos responsables de medir no son válidos"),
  cargosAnalizar: idsQuePuedenFaltar("Los cargos responsables de analizar no son válidos"),
});

const FORMATO_CORRESPONDENCIAS = "Las correspondencias no tienen un formato válido";
const FORMATO_SIGLAS = "Las siglas elegidas no tienen un formato válido";

const idElegido = z.union(
  [
    z.number().int(FORMATO_CORRESPONDENCIAS).positive(FORMATO_CORRESPONDENCIAS),
    z.string().regex(/^[1-9]\d{0,14}$/, FORMATO_CORRESPONDENCIAS).transform(Number),
  ],
  { error: FORMATO_CORRESPONDENCIAS },
);

/** Un texto del archivo (normalizado) → el id elegido en el catálogo; tantas como filas puede traer una plantilla. */
const correspondenciasDe = z
  .record(z.string().max(300, FORMATO_CORRESPONDENCIAS), idElegido, { error: FORMATO_CORRESPONDENCIAS })
  .refine((v) => Object.keys(v).length <= 500, FORMATO_CORRESPONDENCIAS)
  .optional()
  .transform((v) => v ?? {});

export const EsquemaCorrespondencias = z
  .object({ subprocesos: correspondenciasDe, cargos: correspondenciasDe, tipos: correspondenciasDe, unidades: correspondenciasDe })
  .strict();

/**
 * La vista previa de un lote (spec 14A §5.3, pasos 3 a 5): las correspondencias elegidas y los dos porcentajes de la regla,
 * como texto (la consulta dice si son válidos). El `id` del lote viaja aparte.
 */
export const EsquemaVistaPreviaImportacion = z
  .object({
    correspondencias: enJson(EsquemaCorrespondencias, FORMATO_CORRESPONDENCIAS).optional(),
    pctAscendente: z.string().trim().max(20, "El porcentaje de la regla no es válido").optional(),
    pctDescendente: z.string().trim().max(20, "El porcentaje de la regla no es válido").optional(),
  })
  .strict();

/**
 * Importar el lote (spec 14A §5.3, paso 6): lo de la vista previa, los datos de la aprobación previa (la consulta los
 * exige con sus mensajes), las siglas elegidas por subproceso y la clave. El `id` del lote viaja aparte.
 */
export const EsquemaImportarLote = EsquemaVistaPreviaImportacion.extend({
  documento: z.string().max(1000, "El documento de la aprobación previa no es válido").optional(),
  aprobadoPor: z.string().max(1000, "Quién aprobó no es válido").optional(),
  fecha: z.string().max(40, "La fecha de la aprobación previa no es válida").optional(),
  /** Los códigos de las filas que la vista previa mostró como importables (Ruling 38): la consulta los compara. */
  codigos: z.string().max(200_000, "La vista previa no es válida").optional(),
  siglas: enJson(
    z
      .record(z.string().regex(/^\d{1,15}$/, FORMATO_SIGLAS), z.string().max(10, FORMATO_SIGLAS), { error: FORMATO_SIGLAS })
      .refine((v) => Object.keys(v).length <= 500, FORMATO_SIGLAS),
    FORMATO_SIGLAS,
  ).optional(),
  ...firma,
}).strict();

/** Deshacer el lote (spec 14A §5.9): el motivo, de 10 a 500 caracteres, y la clave. El `id` del lote viaja aparte. */
export const EsquemaDeshacerImportacion = z.object({ motivo: textoAcotado("El motivo", 10, 500), ...firma }).strict();

const CORRESPONDENCIA_DE: Record<string, "subprocesos" | "cargos" | "tipos" | "unidades"> = {
  subproceso: "subprocesos",
  cargo: "cargos",
  tipo: "tipos",
  unidad: "unidades",
};

/**
 * El formulario de la importación manda un `<select>` por correspondencia pendiente (`corr:<tipo>:<texto>`, el texto
 * normalizado como en la vista previa) y un campo por sigla elegida (`sigla:<id del subproceso>`), para que funcione
 * igual antes de hidratar; aquí se juntan en `correspondencias` y `siglas` (JSON), como los leen los esquemas de la
 * importación. Un valor vacío es «sin elegir». Lo demás pasa igual.
 */
export function juntarImportacion(formData: FormData): FormData {
  const salida = new FormData();
  const correspondencias: Record<string, Record<string, string>> = { subprocesos: {}, cargos: {}, tipos: {}, unidades: {} };
  const siglas: Record<string, string> = {};
  let conCorrespondencias = false;
  let conSiglas = false;
  for (const [campo, valor] of formData) {
    const corr = /^corr:([a-z]+):([\s\S]+)$/.exec(campo);
    const sigla = /^sigla:(.+)$/.exec(campo);
    if (corr && typeof valor === "string") {
      const destino = Object.hasOwn(CORRESPONDENCIA_DE, corr[1]) ? CORRESPONDENCIA_DE[corr[1]] : null;
      if (destino === null) throw new Error(FORMATO_CORRESPONDENCIAS);
      conCorrespondencias = true;
      if (valor.trim() !== "") correspondencias[destino][claveDeCorrespondencia(corr[2])] = valor.trim();
    } else if (sigla && typeof valor === "string") {
      conSiglas = true;
      if (valor.trim() !== "") siglas[sigla[1]] = valor.trim();
    } else salida.append(campo, valor);
  }
  if (conCorrespondencias) salida.set("correspondencias", JSON.stringify(correspondencias));
  if (conSiglas) salida.set("siglas", JSON.stringify(siglas));
  return salida;
}
