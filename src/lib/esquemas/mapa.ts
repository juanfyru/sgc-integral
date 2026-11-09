import type { AutoridadTipo, DatosTipo } from "@/db/consultas/mapa-admin";
import { validarSigla } from "@/lib/validaciones-mapa";

const texto = (formData: FormData, campo: string) => String(formData.get(campo) ?? "").trim();

function validarAutoridad(v: string): AutoridadTipo {
  if (v !== "estrategico" && v !== "operativo") throw new Error("Elija quién aprueba los documentos de este tipo");
  return v;
}

function plantillaDe(v: string): number | null {
  if (v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error("La plantilla elegida no es válida");
  return n;
}

export function mesesDe(v: string): number {
  const n = /^\d{1,3}$/.test(v) ? Number(v) : NaN;
  if (!(n >= 1 && n <= 120)) throw new Error("El plazo de revisión debe ser un número entero de meses entre 1 y 120");
  return n;
}

export function parsearTipo(formData: FormData): DatosTipo {
  const nombre = texto(formData, "nombre");
  if (!nombre) throw new Error("El nombre es obligatorio");
  return {
    nombre,
    sigla: validarSigla(texto(formData, "sigla")),
    esDiligenciable: formData.get("esDiligenciable") === "on",
    autoridad: validarAutoridad(texto(formData, "autoridad")),
    plantillaDocumentoId: plantillaDe(texto(formData, "plantillaDocumentoId")),
    mesesRevision: mesesDe(texto(formData, "mesesRevision")),
  };
}
