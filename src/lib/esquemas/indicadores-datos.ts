import { z } from "zod";
import { casilla, entero, id, listaDeIds, numero, opcional } from "@/lib/esquemas/indicadores";
import { CONSOLIDACIONES, PERIODICIDADES } from "@/lib/indicadores/tipos";
import { textoAcotado } from "@/lib/validacion";

/**
 * El catálogo de datos compartidos (anexo 14C, §4.1). Llega como texto del formulario; lo que el esquema devuelve vale otra
 * vez como entrada (`guardarDato` lo vuelve a validar). Los ayudantes son los del formulario de la ficha (`indicadores.ts`).
 */

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

/** Los responsables del dato: la lista completa, en JSON, como `EsquemaDesignar`; el `id` del dato viaja aparte. */
export const EsquemaResponsablesDeDato = z
  .object({ usuarioIds: listaDeIds("Las personas elegidas no son válidas", "Elija hasta 20 personas") })
  .strict();

/** Activar o desactivar un dato; el `id` del dato viaja aparte. */
export const EsquemaEstadoDeDato = z.object({ activa: z.enum(["true", "false"]) }).strict();

const VALOR_INVALIDO = "El valor no tiene un formato válido";
const valorDigitado = z.string({ error: VALOR_INVALIDO }).max(40, "Un valor no puede pasar de 40 caracteres");

/**
 * Reportar o corregir un periodo de un dato compartido (anexo 14C, §4.4): el valor tal como se digitó o, si el periodo se
 * reporta por categoría, uno por categoría en JSON (`porCategoria`, que arma `juntarValoresDeDato`); la consulta los valida
 * con los límites del dato. El `id` del periodo viaja aparte.
 */
export const EsquemaReporteDeDato = z
  .object({
    valor: valorDigitado.optional(),
    porCategoria: z
      .preprocess(
        (v, ctx) => {
          if (typeof v !== "string") return v;
          try {
            return JSON.parse(v) as unknown;
          } catch {
            ctx.addIssue({ code: "custom", message: VALOR_INVALIDO });
            return z.NEVER;
          }
        },
        z
          .record(z.string(), valorDigitado)
          .refine((r) => Object.keys(r).length <= 500 && Object.keys(r).every((id) => /^\d{1,15}$/.test(id)), VALOR_INVALIDO),
      )
      .optional(),
    confirmado: casilla,
  })
  .strict();

/**
 * El formulario del dato manda el valor de cada categoría en su propio campo (`categoria_<id>`), para que funcione igual
 * antes de hidratar; aquí se juntan en `porCategoria` (JSON), como lo lee `EsquemaReporteDeDato`. Lo demás pasa igual.
 */
export function juntarValoresDeDato(formData: FormData): FormData {
  const salida = new FormData();
  const porCategoria: Record<string, string> = {};
  for (const [campo, valor] of formData) {
    const categoria = /^categoria_(.+)$/.exec(campo)?.[1];
    if (categoria !== undefined && typeof valor === "string") porCategoria[categoria] = valor;
    else salida.append(campo, valor);
  }
  if (Object.keys(porCategoria).length > 0) salida.set("porCategoria", JSON.stringify(porCategoria));
  return salida;
}
