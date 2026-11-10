import { z } from "zod";
import { MODALIDADES_JORNADA, MOTIVOS_ANULACION, RESPUESTAS_ITEM, type RespuestaItem } from "@/lib/distribucion/tipos";
import type { DatosLista, TipoMiembro } from "@/db/consultas/distribucion/listas";
import type { DatosJornada } from "@/db/consultas/distribucion/jornadas";
import type { DatosPuntoUso } from "@/db/consultas/distribucion/puntos-uso";
import { lista } from "@/lib/esquemas/tramites";
import { parsearFormulario, textoAcotado } from "@/lib/validacion";

const id = z.coerce.number().int().positive();

export const EsquemaPuntoUso = z
  .object({
    nombre: textoAcotado("El nombre", 2, 80),
    sede: textoAcotado("La sede", 0, 80).optional(),
    ubicacion: textoAcotado("La ubicación", 0, 200).optional(),
    responsableId: id,
    procesoIds: lista(id),
  })
  .strict();

export const EsquemaAlternar = z.object({ activo: z.enum(["true", "false"]) }).strict();

/** Pura y fuera de "use server": el `id` de edición viaja en el formulario pero no es del esquema estricto. */
export function parsearPuntoUso(formData: FormData): DatosPuntoUso {
  const d = parsearFormulario(formData, EsquemaPuntoUso, { omitir: ["id"] });
  return {
    nombre: d.nombre,
    sede: d.sede || null,
    ubicacion: d.ubicacion || null,
    responsableId: d.responsableId,
    procesoIds: d.procesoIds,
  };
}

export const EsquemaEmitirCopia = z
  .object({
    documentoId: id,
    puntoUsoId: id,
    nota: textoAcotado("La nota", 0, 200).optional(),
    reemplazaCopiaId: id.optional(),
  })
  .strict();

export const EsquemaRecogida = z.object({ destino: z.enum(["devuelta", "destruida", "no_encontrada"]) }).strict();

export const EsquemaReemplazo = z.object({ destino: z.enum(["devuelta", "destruida"]) }).strict();

export const EsquemaAnulacion = z
  .object({
    motivo: z.enum(MOTIVOS_ANULACION, { error: "Elija el motivo de la anulación" }),
    texto: textoAcotado("La explicación", 0, 300).optional(),
  })
  .strict();

/** `volver` es la ficha desde donde se reemplaza (la del buscador o la del panel): ahí se dice cuántas se emitieron. */
export const EsquemaReemplazarCopias = z.object({ versionId: id, volver: z.string().max(300).optional() }).strict();

export const EsquemaLista = z
  .object({
    nombre: textoAcotado("El nombre", 2, 80),
    descripcion: textoAcotado("La descripción", 0, 300).optional(),
    miembros: lista(z.string().regex(/^(?:(?:area|cargo|proceso|usuario):[1-9]\d*|todos)$/, "Miembro inválido")).pipe(
      z.array(z.string()).min(1, "Elija al menos un miembro"),
    ),
  })
  .strict();

/** Pura y fuera de "use server": el `id` de edición viaja en el formulario pero no es del esquema estricto. */
export function parsearLista(formData: FormData): DatosLista {
  const d = parsearFormulario(formData, EsquemaLista, { omitir: ["id"] });
  return {
    nombre: d.nombre,
    descripcion: d.descripcion || null,
    miembros: d.miembros.map((m) => {
      if (m === "todos") return { tipo: "todos" as const, referenciaId: null };
      const [tipo, referencia] = m.split(":");
      return { tipo: tipo as TipoMiembro, referenciaId: Number(referencia) };
    }),
  };
}

export const EsquemaPedirAcuses = z.object({ documentoId: id }).strict();

export const EsquemaConfirmarLectura = z
  .object({ confirmo: z.literal("on", { error: "Marque la casilla para confirmar" }) })
  .strict();

export const EsquemaJornada = z
  .object({
    fecha: z.iso.date({ error: "Escriba la fecha de la jornada" }),
    modalidad: z.enum(MODALIDADES_JORNADA, { error: "Elija la modalidad" }),
    facilitadorId: id,
    versionIds: lista(id).pipe(z.array(z.number()).min(1, "Elija al menos un documento")),
    asistenteIds: lista(id).optional(),
    asistentesExternos: textoAcotado("Los asistentes externos", 0, 1000).optional(),
    observaciones: textoAcotado("Las observaciones", 0, 2000).optional(),
  })
  .strict();

/** Pura y fuera de "use server": lo que valida el formulario, con la forma que recibe `registrarJornada`. */
export function parsearJornada(formData: FormData): DatosJornada {
  const d = parsearFormulario(formData, EsquemaJornada);
  return {
    fecha: d.fecha,
    modalidad: d.modalidad,
    facilitadorId: d.facilitadorId,
    versionIds: d.versionIds,
    asistenteIds: d.asistenteIds ?? [],
    asistentesExternos: d.asistentesExternos || null,
    observaciones: d.observaciones || null,
  };
}

export const EsquemaAbrirVerificacion = z.object({ puntoId: id }).strict();

export const EsquemaItemLibre = z.object({ texto: textoAcotado("El ítem", 5, 200) }).strict();

export const EsquemaNotaHallazgo = z.object({ nota: textoAcotado("La nota", 5, 1000) }).strict();

/** «Validar» solo lleva el hallazgo (y la verificación a la que volver): ningún otro campo. */
export const EsquemaValidarHallazgo = z.object({}).strict();

export type RespuestaChequeo = {
  itemId: number;
  respuesta: RespuestaItem | null;
  nota: string | null;
  retirado: boolean;
  /** `AAAA-MM-DD`: la fecha de corrección del hallazgo que abre un no conforme, si el verificador la cambió. */
  fechaCorreccion?: string;
};

/** Los campos de un ítem de la lista de chequeo: `<campo>_<itemId>`. */
export const CAMPO_DE_CHEQUEO = /^(respuesta|nota|retirado|fecha)_(\d{1,15})$/;

const EsquemaFilaChequeo = z
  .object({
    itemId: id,
    respuesta: z.enum(RESPUESTAS_ITEM, { error: "Respuesta inválida" }).nullable(),
    nota: z.string().trim().max(1000, "La nota no puede pasar de 1000 caracteres").nullable(),
    retirado: z.boolean(),
    fechaCorreccion: z.iso.date({ error: "Elija una fecha de corrección válida" }).optional(),
  })
  .strict();

/**
 * Las respuestas de la lista de chequeo viajan como `respuesta_<id>` (un radio por ítem), `nota_<id>`,
 * `retirado_<id>` (casilla) y `fecha_<id>` (la fecha de corrección de un no conforme): los campos dependen de los
 * ítems, así que no caben en un esquema de claves fijas. Un ítem sin marcar no envía su respuesta.
 */
export function leerChequeo(formData: FormData, omitir: readonly string[]): RespuestaChequeo[] {
  const ids = new Set<string>();
  for (const clave of new Set(formData.keys())) {
    if (clave.startsWith("$ACTION_") || omitir.includes(clave)) continue;
    const m = CAMPO_DE_CHEQUEO.exec(clave);
    if (!m) throw new Error("Formulario inválido. Recargue la página.");
    ids.add(m[2]);
  }
  const filas = [...ids].map((itemId) => {
    const respuesta = formData.get(`respuesta_${itemId}`);
    const nota = formData.get(`nota_${itemId}`);
    const fecha = formData.get(`fecha_${itemId}`);
    return {
      itemId,
      respuesta: typeof respuesta === "string" && respuesta ? respuesta : null,
      nota: typeof nota === "string" && nota.trim() ? nota : null,
      retirado: formData.get(`retirado_${itemId}`) === "on",
      ...(typeof fecha === "string" && fecha.trim() ? { fechaCorreccion: fecha.trim() } : {}),
    };
  });
  const resultado = z.array(EsquemaFilaChequeo).safeParse(filas);
  if (!resultado.success) throw new Error(resultado.error.issues[0].message);
  return resultado.data;
}
