const ESTILOS: Record<string, string> = {
  borrador: "bg-amber-100 text-amber-900 border-amber-300",
  vigente: "bg-green-100 text-green-900 border-green-300",
  obsoleto: "bg-gray-200 text-gray-700 border-gray-400",
  anulado: "bg-red-100 text-red-900 border-red-300",
};

const ETIQUETAS: Record<string, string> = {
  borrador: "Borrador",
  vigente: "Vigente",
  obsoleto: "Obsoleto",
  anulado: "Anulado",
};

// La etiqueta textual siempre acompaña al color (accesibilidad: el color
// nunca es la única señal).
export function EstadoBadge({ estado }: { estado: string }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${ESTILOS[estado] ?? ESTILOS.obsoleto}`}
    >
      {ETIQUETAS[estado] ?? estado}
    </span>
  );
}
