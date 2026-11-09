import type { Hallazgo } from "@/db/consultas/distribucion/hallazgos";

/** Dónde se atiende un hallazgo: la verificación que lo abrió o la copia que no se encontró. Función pura. */
export function enlaceDeHallazgo(h: { origen: string; verificacionId: number | null; copiaId: number | null }): string {
  if (h.origen === "verificacion" && h.verificacionId !== null) return `/distribucion/verificaciones/${h.verificacionId}`;
  return h.copiaId !== null ? `/distribucion/copias/${h.copiaId}` : "/distribucion/verificaciones";
}

/**
 * Cómo se cerró un hallazgo, para decirlo sin repetir la nota de la corrección como si fuera de quien valida: la
 * siguiente verificación del punto lo validó; el Admin SGC validó la corrección (su cierre lleva la nota de la
 * corrección); quien lo corrigió lo cerró por ser el único Admin SGC activo; o se cerró directamente con su propia nota.
 */
export type CierreDeHallazgo = "verificacion" | "validado" | "propio_corrector" | "directo";

export function comoSeCerro(h: Pick<Hallazgo, "estado" | "validacion" | "correccion" | "cierre">): CierreDeHallazgo | null {
  if (h.estado !== "cerrado" || !h.cierre) return null;
  if (h.validacion === "verificacion") return "verificacion";
  if (h.validacion === "admin" && h.correccion) {
    // `validarHallazgo` rechaza a quien corrigió: el mismo autor solo cierra por `cerrarHallazgo` sin otro Admin activo.
    if (h.cierre.porId === h.correccion.porId) return "propio_corrector";
    if (h.cierre.nota === h.correccion.nota) return "validado";
  }
  return "directo";
}
