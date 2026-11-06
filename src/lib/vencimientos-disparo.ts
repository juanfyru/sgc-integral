import { revisarVencimientos } from "@/db/consultas/vencimientos";

const INTERVALO_MS = 10 * 60_000;

/** Estado en memoria de la única instancia de la app (piso 9). */
let ultima: number | null = null;

/**
 * Lo llama el cascarón con `after()`, ya enviada la respuesta: no compite con el render por las
 * conexiones del pool. No espera la revisión y un fallo solo va al registro. La marca se pone antes
 * de lanzarla: dos respuestas simultáneas no deben lanzar dos.
 */
export function dispararRevisionDeVencimientos(ahoraMs = Date.now()): void {
  if (ultima !== null && ahoraMs - ultima < INTERVALO_MS) return;
  ultima = ahoraMs;
  Promise.resolve()
    .then(() => revisarVencimientos())
    .catch((err) => console.error("No se pudieron revisar los vencimientos:", err));
}
