import {
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  type LucideIcon,
} from "lucide-react";

// El formato se deriva SIEMPRE del MIME detectado por magic bytes y guardado
// en BD (regla 6), nunca de la extensión del nombre. Colores convencionales
// (Word azul, Excel verde, PDF rojo) con tokens --formato-* de claro y oscuro.
type Formato = {
  etiqueta: string;
  Icono: LucideIcon;
  clases: string;
};

const FORMATOS: [RegExp, Formato][] = [
  [
    /^application\/pdf$/,
    { etiqueta: "PDF", Icono: FileText, clases: "bg-formato-pdf-fondo text-formato-pdf-texto" },
  ],
  [
    /wordprocessingml|msword/,
    { etiqueta: "Word", Icono: FileText, clases: "bg-formato-word-fondo text-formato-word-texto" },
  ],
  [
    /spreadsheetml|ms-excel/,
    {
      etiqueta: "Excel",
      Icono: FileSpreadsheet,
      clases: "bg-formato-excel-fondo text-formato-excel-texto",
    },
  ],
  [
    /^image\//,
    {
      etiqueta: "Imagen",
      Icono: FileImage,
      clases: "bg-formato-imagen-fondo text-formato-imagen-texto",
    },
  ],
  [
    /zip|x-rar|x-7z|compressed/,
    {
      etiqueta: "Comprimido",
      Icono: FileArchive,
      clases: "bg-formato-comprimido-fondo text-formato-comprimido-texto",
    },
  ],
];

export function formatoDesdeMime(mime: string): Formato {
  for (const [patron, formato] of FORMATOS) {
    if (patron.test(mime)) return formato;
  }
  return {
    etiqueta: "Archivo",
    Icono: File,
    clases: "bg-muted text-muted-foreground",
  };
}

export function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("es-CO", { maximumFractionDigits: 1 })} MB`;
}

/**
 * Insignia de formato de archivo. Accesibilidad (regla del proyecto): el
 * ícono nunca es la única señal — siempre etiqueta textual + tamaño, y un
 * aria-label completo.
 */
export function IconoFormato({
  mime,
  tamanoBytes,
}: {
  mime: string;
  tamanoBytes: number;
}) {
  const { etiqueta, Icono, clases } = formatoDesdeMime(mime);
  const tamano = formatearTamano(tamanoBytes);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${clases}`}
      aria-label={`${etiqueta}, ${tamano}`}
    >
      <Icono className="size-3" aria-hidden="true" />
      {etiqueta}
      <span className="font-normal">{tamano}</span>
    </span>
  );
}
