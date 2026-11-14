import type { VarianteInsignia } from "@/componentes/ui/Insignia";
import type { EstadoLote } from "@/db/consultas/indicadores/lote-importacion";

/** Cómo se llama cada estado de un lote y con qué insignia se muestra (el texto va siempre: el color no basta). */
export const ESTADO_DE_LOTE: Record<EstadoLote, { texto: string; variante: VarianteInsignia }> = {
  sin_archivo: { texto: "Sin plantilla", variante: "sin-dato" },
  por_importar: { texto: "Por importar", variante: "atencion" },
  importado: { texto: "Importado", variante: "bien" },
  deshecho: { texto: "Deshecho", variante: "neutra" },
};
