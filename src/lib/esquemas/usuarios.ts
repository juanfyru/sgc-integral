import { z } from "zod";
import { ROLES } from "../roles";
import { parsearFormulario, textoAcotado } from "../validacion";

const vacioANulo = (v: unknown) => (v === "" || v === undefined ? null : v);

const idOpcional = z.preprocess(
  vacioANulo,
  z.coerce.number().int().positive().nullable(),
);

const listaDeIds = (v: unknown): unknown => {
  if (v === undefined || v === null || v === "") return [];
  return (Array.isArray(v) ? v : [v]).map((x) => (typeof x === "string" ? Number(x) : x));
};

const REGLA_DEL_USUARIO = "Use 3 a 40 caracteres: minúsculas, números, punto, guion o guion bajo";

export const EsquemaUsuario = z
  .object({
    usuario: z.string({ error: REGLA_DEL_USUARIO }).regex(/^[a-z0-9._-]{3,40}$/, REGLA_DEL_USUARIO),
    nombre: textoAcotado("El nombre", 3, 120),
    correo: z.preprocess(vacioANulo, z.string().trim().email("Escriba un correo válido").nullable()),
    rol: z.enum(ROLES),
    cargoId: idOpcional,
    jefeInmediatoId: idOpcional,
    procesoIds: z.preprocess(listaDeIds, z.array(z.number().int().positive())),
    verHistorial: z.preprocess((v) => v === "on" || v === true, z.boolean()),
  })
  .strict()
  .refine((d) => d.rol !== "lider_proceso" || d.procesoIds.length >= 1, {
    path: ["procesoIds"],
    message: "El líder de proceso debe tener al menos un proceso asignado",
  });

export type DatosUsuarioFormulario = z.output<typeof EsquemaUsuario>;

/** Pura y fuera de "use server": el campo `id` de ruta (edición) se omite antes del esquema estricto. */
export function parsearUsuario(formData: FormData): DatosUsuarioFormulario {
  return parsearFormulario(formData, EsquemaUsuario, { omitir: ["id"] });
}

export const EsquemaFilaLote = z
  .object({
    usuario: z.string(),
    nombre: z.string(),
    correo: z.string(),
    rol: z.string(),
    cargo: z.string(),
    procesos: z.string(),
  })
  .strict();
