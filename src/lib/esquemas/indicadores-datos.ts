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
