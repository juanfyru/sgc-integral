import Link from "next/link";
import { PencilLine } from "lucide-react";
import type { ResultadoBusqueda } from "@/db/consultas/busqueda";
import { IconoFormato } from "@/componentes/documentos/IconoFormato";
import { TextoResaltado } from "./TextoResaltado";

const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" });

/** Resultado de búsqueda: enlaza a la ficha y resalta las coincidencias. */
export function TarjetaResultado({
  resultado,
}: {
  resultado: ResultadoBusqueda;
}) {
  const color = resultado.propietario?.color ?? "var(--color-azul)";

  return (
    <li className="list-none">
      <Link
        href={`/documentos/${resultado.codigo.toLowerCase()}`}
        style={{ "--color-banda": color } as React.CSSProperties}
        className="group flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4 shadow-xs transition-all duration-200 hover:-translate-y-px hover:border-[var(--color-banda)] hover:shadow-md focus-visible:border-[var(--color-banda)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-banda)]"
      >
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="font-mono text-xs tracking-wide text-muted-foreground">
            {resultado.codigo}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            v{resultado.version}
          </span>
          <span className="text-xs text-muted-foreground">
            {resultado.tipo.nombre}
          </span>
          {resultado.fechaAprobacion && (
            <span className="text-xs text-muted-foreground">
              Aprobado el{" "}
              {formatoFecha.format(
                new Date(`${resultado.fechaAprobacion}T00:00:00`),
              )}
            </span>
          )}
        </div>

        <p className="text-sm/snug font-semibold text-foreground group-hover:text-[color-mix(in_srgb,var(--color-banda)_80%,black)]">
          <TextoResaltado
            texto={resultado.tituloResaltado ?? resultado.titulo}
          />
        </p>

        {(resultado.descripcionResaltada ?? resultado.descripcion) && (
          <p className="line-clamp-2 text-xs/relaxed text-muted-foreground">
            <TextoResaltado
              texto={
                resultado.descripcionResaltada ?? resultado.descripcion ?? ""
              }
            />
          </p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {resultado.propietario && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-[color-mix(in_srgb,var(--color-banda)_12%,white)] px-1.5 py-0.5 text-[11px] font-medium text-[color-mix(in_srgb,var(--color-banda)_80%,black)]">
              {resultado.propietario.nombre}
            </span>
          )}
          {resultado.archivos.map((archivo) => (
            <IconoFormato
              key={archivo.id}
              mime={archivo.mime}
              tamanoBytes={archivo.tamanoBytes}
            />
          ))}
          {resultado.tipo.esDiligenciable && (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              <PencilLine className="size-3" aria-hidden="true" />
              Diligenciable
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}
