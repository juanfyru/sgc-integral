import type { DocumentoListado } from "@/db/consultas/procesos";
import { TarjetaDocumento } from "./TarjetaDocumento";

// "Caracterización" → "Caracterizaciones", "Manual" → "Manuales", "Guía" → "Guías".
function pluralizarTipo(nombre: string): string {
  if (/ón$/.test(nombre)) return nombre.replace(/ón$/, "ones");
  if (/[aeiouáéíóú]$/i.test(nombre)) return `${nombre}s`;
  return `${nombre}es`;
}

/**
 * Documentos agrupados por tipo (Caracterización, Manual, Procedimiento…),
 * en el orden de la tabla maestra tipos_documento. `contextoDe` permite a la
 * vista anotar la procedencia de cada documento.
 */
export function GruposPorTipo({
  documentos,
  contextoDe,
}: {
  documentos: DocumentoListado[];
  contextoDe?: (doc: DocumentoListado) => string | undefined;
}) {
  const grupos = new Map<string, DocumentoListado[]>();
  for (const doc of [...documentos].sort((a, b) => a.tipo.orden - b.tipo.orden)) {
    const nombre = doc.tipo.nombre;
    grupos.set(nombre, [...(grupos.get(nombre) ?? []), doc]);
  }

  return (
    <div className="flex flex-col gap-5">
      {[...grupos.entries()].map(([tipo, docs]) => (
        <div key={tipo}>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {pluralizarTipo(tipo)}
          </h3>
          <ul className="grid list-none grid-cols-1 gap-2 sm:grid-cols-2">
            {docs.map((doc) => (
              <TarjetaDocumento
                key={doc.codigo}
                documento={doc}
                contexto={contextoDe?.(doc)}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
