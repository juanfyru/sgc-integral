import type { EstadoAccion } from "@/app/admin/comun";

/**
 * Un desplegable (<details>) con un formulario se cierra cuando el envío termina sin error: «enviaba» y ya no está
 * pendiente, y la acción no devolvió error. Con error sigue abierto, con lo escrito. Sin DOM ni React: el componente lo
 * llama desde un efecto y el test lo prueba con un objeto simple, como `logica-desplegable` de la barra superior.
 * Devuelve si lo cerró.
 */
export function cerrarTrasGuardar(p: { open: boolean }, envio: { enviaba: boolean; pendiente: boolean; estado: EstadoAccion }): boolean {
  if (!p.open || !envio.enviaba || envio.pendiente || envio.estado !== null) return false;
  p.open = false;
  return true;
}
