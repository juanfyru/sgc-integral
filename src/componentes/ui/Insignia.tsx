import type { LucideIcon } from "lucide-react";

export type VarianteInsignia =
  | "bien"
  | "atencion"
  | "grave"
  | "critico"
  | "sin-dato"
  | "neutra"
  | "modulo";

type Modulo = "documentos" | "indicadores" | "planes";

// Clases literales: Tailwind solo genera las que ve escritas completas.
const CLASES: Record<Exclude<VarianteInsignia, "modulo">, string> = {
  bien: "bg-estado-bien-fondo text-estado-bien-texto",
  atencion: "bg-estado-atencion-fondo text-estado-atencion-texto",
  grave: "bg-estado-grave-fondo text-estado-grave-texto",
  critico: "bg-estado-critico-fondo text-estado-critico-texto",
  "sin-dato": "bg-estado-sin-dato-fondo text-estado-sin-dato-texto",
  neutra: "bg-muted text-muted-foreground",
};

const PUNTO_MODULO: Record<Modulo, string> = {
  documentos: "bg-mod-documentos",
  indicadores: "bg-mod-indicadores",
  planes: "bg-mod-planes",
};

export function Insignia({
  variante,
  children,
  icono: Icono,
  modulo,
}: {
  variante: VarianteInsignia;
  children: React.ReactNode;
  icono?: LucideIcon;
  modulo?: Modulo;
}) {
  const color =
    variante === "modulo" ? "bg-muted text-foreground" : CLASES[variante];
  return (
    <span
      data-variante={variante}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}
    >
      {variante === "modulo" && modulo ? (
        <span
          aria-hidden="true"
          className={`size-2 rounded-full ${PUNTO_MODULO[modulo]}`}
        />
      ) : null}
      {Icono ? <Icono aria-hidden="true" className="size-3.5" /> : null}
      {children}
    </span>
  );
}

export const ESTADO_DOCUMENTO: Record<
  string,
  { variante: VarianteInsignia; etiqueta: string }
> = {
  vigente: { variante: "bien", etiqueta: "Vigente" },
  borrador: { variante: "atencion", etiqueta: "Borrador" },
  obsoleto: { variante: "sin-dato", etiqueta: "Obsoleto" },
  anulado: { variante: "critico", etiqueta: "Anulado" },
};

export function InsigniaEstadoDocumento({ estado }: { estado: string }) {
  const e = ESTADO_DOCUMENTO[estado] ?? { variante: "sin-dato", etiqueta: estado };
  return <Insignia variante={e.variante}>{e.etiqueta}</Insignia>;
}
