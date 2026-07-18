import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requerirSesion } from "@/lib/sesion-actual";

export type EstadoAccion =
  | { ok: false; error: string; valores?: Record<string, string | string[]> }
  | null;

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
export function valoresDeFormulario(
  formData: FormData,
): Record<string, string | string[]> {
  const valores: Record<string, string | string[]> = {};
  for (const clave of new Set(formData.keys())) {
    const todos = formData
      .getAll(clave)
      .filter((v): v is string => typeof v === "string");
    valores[clave] = todos.length > 1 ? todos : (todos[0] ?? "");
  }
  return valores;
}

// Envuelve la mutación: requerirSesion SIEMPRE primero; los errores de
// negocio vuelven al formulario como { ok: false } sin perder lo escrito.
// redirect lanza NEXT_REDIRECT a propósito — va FUERA del try.
export async function mutacion(
  formData: FormData,
  fn: (usuarioId: number, formData: FormData) => Promise<string | void>,
): Promise<EstadoAccion> {
  const sesion = await requerirSesion();
  let destino: string | void;
  try {
    destino = await fn(sesion.usuarioId, formData);
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
