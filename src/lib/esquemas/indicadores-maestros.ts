import { z } from "zod";
import { textoAcotado } from "@/lib/validacion";

/** `parsearFormulario` descarta los campos vacíos; un entero llega como texto del formulario o como número de la consulta. */
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

/** Una casilla del formulario llega como «on» (o no llega); la consulta la recibe como booleano. */
const casilla = z
  .union([z.boolean(), z.literal("on")])
  .optional()
  .transform((v) => v === true || v === "on");

const nombre = (que: string) => textoAcotado(que, 2, 80);

export const EsquemaTipoIndicador = z.object({ nombre: nombre("El nombre del tipo") }).strict();

export const EsquemaClasificacionIndicador = z
  .object({
    nombre: nombre("El nombre de la clasificación"),
    aprueba: z.enum(["gerencia", "lider"], { error: "Elija quién aprueba: Gerencia o el líder del proceso" }),
    exigeNorma: casilla,
  })
  .strict();

export const EsquemaUnidadIndicador = z
  .object({
    nombre: nombre("El nombre de la unidad"),
    sufijo: z.string().max(12, "El sufijo no puede pasar de 12 caracteres").optional().transform((v) => v ?? ""),
    decimales: entero("Los decimales", 0, 4),
  })
  .strict();

export const EsquemaObjetivoIndicador = z
  .object({
    clase: z.enum(["calidad", "institucional"], { error: "Elija la clase del objetivo: de calidad o institucional" }),
    enunciado: textoAcotado("El enunciado", 1, 500),
  })
  .strict();

export const ESQUEMAS_MAESTRO = {
  tipos: EsquemaTipoIndicador,
  clasificaciones: EsquemaClasificacionIndicador,
  unidades: EsquemaUnidadIndicador,
  objetivos: EsquemaObjetivoIndicador,
} as const;

export const EsquemaParametrosIndicadores = z
  .object({
    umbralAtencionPct: entero("El umbral de atención", 1, 99),
    avisoPrevioDias: entero("Los días de aviso previo", 0, 30),
    plazoReporteDias: entero("El plazo para reportar", 0, 90),
    incumplimientoPeriodos: entero("Los periodos de incumplimiento", 2, 12),
    variacionConfirmarPct: entero("La variación a confirmar", 5, 500),
  })
  .strict();

const MAESTROS = ["tipos", "clasificaciones", "unidades", "objetivos"] as const;

export const EsquemaMaestro = z.object({ maestro: z.enum(MAESTROS) }).strict();
export const EsquemaActivarMaestro = z.object({ maestro: z.enum(MAESTROS), activo: z.enum(["true", "false"]) }).strict();
