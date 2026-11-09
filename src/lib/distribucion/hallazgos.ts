/** Dónde se atiende un hallazgo: la verificación que lo abrió o la copia que no se encontró. Función pura. */
export function enlaceDeHallazgo(h: { origen: string; verificacionId: number | null; copiaId: number | null }): string {
  if (h.origen === "verificacion" && h.verificacionId !== null) return `/distribucion/verificaciones/${h.verificacionId}`;
  return h.copiaId !== null ? `/distribucion/copias/${h.copiaId}` : "/distribucion/verificaciones";
}
