import { z } from "zod";
import { FACTORES_TASA } from "@/lib/indicadores/formula/formas";
import { fraccion } from "@/lib/indicadores/formula/fraccion";
import { periodicidadDe } from "@/lib/indicadores/periodos";
import { CONSOLIDACIONES, FORMAS, FUNCIONES_DESIGNADO, MAXIMO_EN_BLOQUE, MODOS_SEMAFORO, NIVELES_ACCESO, PERIODICIDADES, TENDENCIAS } from "@/lib/indicadores/tipos";
import { textoAcotado } from "@/lib/validacion";

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
