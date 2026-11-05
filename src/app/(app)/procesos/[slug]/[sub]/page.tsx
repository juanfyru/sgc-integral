import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { GruposPorTipo } from "@/componentes/documentos/GruposPorTipo";
import { TarjetaDocumento } from "@/componentes/documentos/TarjetaDocumento";
import { Icono } from "@/componentes/iconos";
import { Migas } from "@/componentes/navegacion/Migas";
import { MiniMapa } from "@/componentes/navegacion/MiniMapa";
import { NavHermanos } from "@/componentes/navegacion/NavHermanos";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import {
  obtenerDetalleSubproceso,
  obtenerDocumentosDeSubproceso,
} from "@/db/consultas/procesos";
import { exigirSesion } from "@/lib/paginas";

export const dynamic = "force-dynamic";

export default async function VistaSubproceso({
  params,
}: {
  params: Promise<{ slug: string; sub: string }>;
}) {
  await exigirSesion();
  const { slug, sub } = await params;

  const subproceso = await obtenerDetalleSubproceso(slug, sub);
  if (!subproceso) notFound();

  const documentos = await obtenerDocumentosDeSubproceso(subproceso.id);
  const propios = documentos.filter((d) => d.esPrincipal);
  const tambienAplican = documentos.filter((d) => !d.esPrincipal);

  return (
    <div
      className="max-w-4xl"
      style={{ "--color-banda": subproceso.macro.color } as React.CSSProperties}
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Migas
          items={[
            { nombre: subproceso.macro.nombre },
            {
              nombre: subproceso.proceso.nombre,
              href: `/procesos/${subproceso.proceso.slug}`,
            },
            { nombre: subproceso.nombre },
          ]}
        />
        <MiniMapa
          banda={subproceso.macro.banda}
          nombreMacro={subproceso.macro.nombre}
        />
      </div>

      <EncabezadoPagina
        icono={
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl banda-tinte banda-texto">
            <Icono nombre={subproceso.proceso.icono} className="size-7" />
          </span>
        }
        codigo={`${subproceso.proceso.sigla} · Subproceso`}
        titulo={subproceso.nombre}
        descripcion={`Subproceso de ${subproceso.proceso.nombre}.`}
      />

      <section className="mt-2" aria-labelledby="titulo-documentos">
        <h2
          id="titulo-documentos"
          className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"
        >
          <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
          Documentos del subproceso
        </h2>
        {propios.length === 0 && tambienAplican.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            Este subproceso aún no tiene documentos vigentes.
          </p>
        ) : (
          <GruposPorTipo documentos={propios} />
        )}
      </section>

      {tambienAplican.length > 0 && (
        <section className="mt-8" aria-labelledby="titulo-tambien">
          <h2
            id="titulo-tambien"
            className="mb-1 text-sm font-semibold text-foreground"
          >
            También aplica aquí
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Documentos de otros procesos que se usan o consultan en este
            subproceso.
          </p>
          <ul className="grid list-none grid-cols-1 gap-2 rounded-xl border border-dashed border-border bg-muted/40 p-3 sm:grid-cols-2">
            {tambienAplican.map((doc) => (
              <TarjetaDocumento
                key={doc.codigo}
                documento={doc}
                contexto={
                  doc.propietario ? `Propio de: ${doc.propietario}` : undefined
                }
              />
            ))}
          </ul>
        </section>
      )}

      <div className="mt-10">
        <NavHermanos
          anterior={subproceso.anterior}
          siguiente={subproceso.siguiente}
          base={`/procesos/${subproceso.proceso.slug}`}
          etiqueta="subproceso"
        />
      </div>
    </div>
  );
}

