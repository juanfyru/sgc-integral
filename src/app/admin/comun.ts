import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { crearLimitador } from "@/lib/limite";
import { ErrorPermiso, requerirPermiso, type Permiso } from "@/lib/permisos";
import type { SesionValida } from "@/lib/sesion";
import { requerirSesion } from "@/lib/sesion-actual";

export type EstadoAccion =
  | { ok: false; error: string; valores?: Record<string, string | string[]> }
  | null;

/** Una acción que no navega y dice lo que hizo (`FormAccion` lo pinta como estado). */
export type EstadoConAviso = EstadoAccion | { ok: true; aviso: string };

export function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim();
}

export function textoONulo(formData: FormData, campo: string): string | null {
  return texto(formData, campo) || null;
}

export function idNumerico(formData: FormData, campo: string): number {
  const n = Number(formData.get(campo));
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Falta ${campo}`);
  return n;
}

// React 19 resetea los campos no controlados al completar la action: los
// valores enviados vuelven en el estado para repoblarlos como defaultValue.
// Una clave no vuelve nunca, y el código del segundo factor tampoco. Junto a una clave, `codigo` es
// ese código; sin ella es el de un documento, y su formulario lo repuebla como cualquier otro campo.
export function valoresDeFormulario(
  formData: FormData,
): Record<string, string | string[]> {
  const secretos = formData.has("clave") ? ["clave", "codigo"] : [];
  const valores: Record<string, string | string[]> = {};
  for (const clave of new Set(formData.keys())) {
    if (secretos.includes(clave)) continue;
    const todos = formData
      .getAll(clave)
      .filter((v): v is string => typeof v === "string");
    valores[clave] = todos.length > 1 ? todos : (todos[0] ?? "");
  }
  return valores;
}

// Tope por usuario para todas las mutaciones del panel (instancia única, en memoria).
const permitirMutacion = crearLimitador({ limite: 60, ventanaMs: 60_000 });

/** Mismo tope por usuario que `mutacion`, para acciones que no pasan por ella. null = permitido. */
export function comprobarLimite(
  sesion: { usuarioId: number },
  formData?: FormData,
): EstadoAccion {
  if (permitirMutacion(String(sesion.usuarioId))) return null;
  return {
    ok: false,
    error: "Demasiadas operaciones seguidas. Espere un minuto.",
    ...(formData ? { valores: valoresDeFormulario(formData) } : {}),
  };
}

// Envuelve la mutación: requerirSesion SIEMPRE primero, luego el permiso y el
// límite por usuario; los errores de negocio vuelven al formulario como
// { ok: false } sin perder lo escrito.
// redirect lanza NEXT_REDIRECT a propósito — va FUERA del try.
export async function mutacion(
  formData: FormData,
  permiso: Permiso,
  fn: (usuarioId: number, formData: FormData, sesion: SesionValida) => Promise<string | void>,
): Promise<EstadoAccion> {
  const sesion = await requerirSesion();
  try {
    requerirPermiso(sesion, permiso);
  } catch (err) {
    if (err instanceof ErrorPermiso) return { ok: false, error: err.message };
    throw err;
  }
  const limitado = comprobarLimite(sesion, formData);
  if (limitado) return limitado;
  let destino: string | void;
  try {
    destino = await fn(sesion.usuarioId, formData, sesion);
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message,
      valores: valoresDeFormulario(formData),
    };
  }
  revalidatePath("/", "layout");
  if (destino) redirect(destino);
  return null;
}
