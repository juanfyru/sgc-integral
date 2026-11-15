import { z } from "zod";
import { fraccion } from "@/lib/indicadores/formula/fraccion";
import { CONSOLIDACIONES, PERIODICIDADES } from "@/lib/indicadores/tipos";
import { textoAcotado } from "@/lib/validacion";

/**
 * El catálogo de datos compartidos (anexo 14C, §4.1). Llega como texto del formulario; lo que el esquema devuelve vale otra
 * vez como entrada (`guardarDato` lo vuelve a validar). Los ayudantes son los de `indicadores.ts`, como hace
 * `indicadores-maestros.ts`.
 */

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

/** Un dato del catálogo; el `id` del que se edita viaja aparte. */
export const EsquemaDato = z
  .object({
    procesoId: id("Elija el proceso"),
    nombre: textoAcotado("El nombre del dato", 1, 150),
    descripcion: opcional("La descripción", 500),
    fuente: opcional("La fuente", 300),
    unidad: opcional("La unidad", 40),
    periodicidad: z.enum(PERIODICIDADES, { error: "Elija la periodicidad" }),
    consolidacion: z.enum(CONSOLIDACIONES, { error: "Elija cómo se junta" }),
    capturaMin: numero("El mínimo de captura debe ser un número").optional(),
    capturaMax: numero("El máximo de captura debe ser un número").optional(),
    admiteNegativos: casilla,
    plazoReporteDias: entero("El plazo de reporte", 0, 90),
    dimensionId: id("La dimensión no es válida").optional(),
  })
  .strict();

/** Los responsables del dato: la lista completa, en JSON, sin repetidos y de hasta 20; el `id` del dato viaja aparte. */
export const EsquemaResponsablesDeDato = z
  .object({
    usuarioIds: enJson(
      z
        .array(id("Las personas elegidas no son válidas"), { error: "Las personas elegidas no son válidas" })
        .max(20, "Elija hasta 20 personas")
        .transform((xs) => [...new Set(xs)]),
      "Las personas elegidas no son válidas",
    ),
  })
  .strict();

/** Activar o desactivar un dato; el `id` del dato viaja aparte. */
export const EsquemaEstadoDeDato = z.object({ activa: z.enum(["true", "false"]) }).strict();
