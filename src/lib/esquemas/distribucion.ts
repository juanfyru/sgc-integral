import { z } from "zod";
import { MODALIDADES_JORNADA, MOTIVOS_ANULACION } from "@/lib/distribucion/tipos";
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

export const EsquemaReemplazarCopias = z.object({ versionId: id }).strict();

export const EsquemaLista = z
  .object({
    nombre: textoAcotado("El nombre", 2, 80),
    descripcion: textoAcotado("La descripción", 0, 300).optional(),
    miembros: lista(z.string().regex(/^(area|cargo|proceso|usuario):[1-9]\d*$/, "Miembro inválido")).pipe(
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
