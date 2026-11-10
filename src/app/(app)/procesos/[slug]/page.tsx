import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Layers, Share2 } from "lucide-react";
import { GruposPorTipo } from "@/componentes/documentos/GruposPorTipo";
import { TarjetaDocumento } from "@/componentes/documentos/TarjetaDocumento";
import { Icono } from "@/componentes/iconos";
import { Migas } from "@/componentes/navegacion/Migas";
import { MiniMapa } from "@/componentes/navegacion/MiniMapa";
import { NavHermanos } from "@/componentes/navegacion/NavHermanos";
import { NormasAplicables } from "@/componentes/normograma/NormasAplicables";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { ResumenVigencia } from "@/componentes/vigencia/ResumenVigencia";
import { normasDeProceso } from "@/db/consultas/normograma/asociaciones";
import { normasParaElegir } from "@/db/consultas/normograma/lectura";
import {
  obtenerDetalleProceso,
  obtenerDocumentosDeProceso,
  resumenVigenciaDeProceso,
} from "@/db/consultas/procesos";
import { alcanceProcesos, puedeAsociarNorma } from "@/lib/alcance";
import { exigirSesion } from "@/lib/paginas";

export const dynamic = "force-dynamic";

export default async function VistaProceso({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ subprocesos?: string }>;
}) {
  const sesion = await exigirSesion();
  const [{ slug }, { subprocesos: parametroSubprocesos }] = await Promise.all([
    params,
    searchParams,
  ]);

  const proceso = await obtenerDetalleProceso(slug, sesion);
  if (!proceso) notFound();

  const tieneSubprocesos = proceso.subprocesos.length > 0;
  const incluirSubprocesos = tieneSubprocesos && parametroSubprocesos !== "0";
  const [documentos, vigencia, normas, alcance] = await Promise.all([
    obtenerDocumentosDeProceso(proceso.id, incluirSubprocesos, sesion),
    resumenVigenciaDeProceso(proceso.id, sesion),
    normasDeProceso(proceso.id, sesion),
    alcanceProcesos(sesion),
  ]);
  // «Asociar norma» (spec 13C §10.3): quien tiene `normograma.procesos` sobre el proceso, con las normas que aún no aplican.
  // Una derogada ya no se asocia a un proceso nuevo (`asociarProceso` lo rechaza).
  const asociables = puedeAsociarNorma(sesion, proceso.id, alcance)
    ? await normasParaElegir({ sinProceso: proceso.id, sinDerogadas: true })
    : null;

  const propios = documentos.filter((d) => d.esPrincipal);
  const tambienAplican = documentos.filter((d) => !d.esPrincipal);

  return (
    <div
      className="max-w-4xl"
      style={{ "--color-banda": proceso.macro.color } as React.CSSProperties}
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Migas
          items={[{ nombre: proceso.macro.nombre }, { nombre: proceso.nombre }]}
        />
        <MiniMapa banda={proceso.macro.banda} nombreMacro={proceso.macro.nombre} />
      </div>

      <EncabezadoPagina
        icono={
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl banda-tinte banda-texto">
            <Icono nombre={proceso.icono} className="size-7" />
          </span>
        }
        codigo={proceso.sigla}
        insignias={<ResumenVigencia vencidas={vigencia.vencidas} atencion={vigencia.atencion} />}
        titulo={proceso.nombre}
        descripcion={proceso.descripcion || undefined}
      />

      {tieneSubprocesos && (
        <section className="mt-2" aria-labelledby="titulo-subprocesos">
          <h2
            id="titulo-subprocesos"
            className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"
          >
            <Layers className="size-4 text-muted-foreground" aria-hidden="true" />
            Subprocesos
          </h2>
          <ul className="grid list-none grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {proceso.subprocesos.map((sub) => (
              <li key={sub.id}>
                <Link
                  href={`/procesos/${proceso.slug}/${sub.slug}`}
                  aria-label={`${sub.nombre}: ${sub.docsVigentes} ${sub.docsVigentes === 1 ? "documento vigente" : "documentos vigentes"}`}
                  className="group flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3.5 py-3 shadow-xs transition-all duration-200 hover:-translate-y-px hover:border-[var(--color-banda)] hover:shadow-md focus-visible:border-[var(--color-banda)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-banda)]"
                >
                  <span className="text-sm/snug font-medium text-foreground">
                    {sub.nombre}
                  </span>
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground transition-colors group-hover:banda-tinte group-hover:banda-texto"
                    aria-hidden="true"
                  >
                    <FileText className="size-3" />
                    {sub.docsVigentes}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={tieneSubprocesos ? "mt-8" : "mt-2"} aria-labelledby="titulo-documentos">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2
            id="titulo-documentos"
            className="flex items-center gap-2 text-sm font-semibold text-foreground"
          >
            <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
            Documentos del proceso
          </h2>
          {tieneSubprocesos && (
            <nav
              aria-label="Alcance del listado de documentos"
              className="flex rounded-lg border border-border bg-muted p-0.5 text-xs font-medium"
            >
              <Link
                href={`/procesos/${proceso.slug}?subprocesos=0`}
                scroll={false}
                aria-current={!incluirSubprocesos ? "true" : undefined}
                className={
                  !incluirSubprocesos
                    ? "rounded-md bg-card px-2.5 py-1 text-foreground shadow-xs"
                    : "rounded-md px-2.5 py-1 text-muted-foreground hover:text-foreground"
                }
              >
                Solo del proceso
              </Link>
              <Link
                href={`/procesos/${proceso.slug}`}
                scroll={false}
                aria-current={incluirSubprocesos ? "true" : undefined}
                className={
                  incluirSubprocesos
                    ? "rounded-md bg-card px-2.5 py-1 text-foreground shadow-xs"
                    : "rounded-md px-2.5 py-1 text-muted-foreground hover:text-foreground"
                }
              >
                Incluir subprocesos
              </Link>
            </nav>
          )}
        </div>

        {propios.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            Este proceso aún no tiene documentos vigentes propios
            {tieneSubprocesos && !incluirSubprocesos
              ? " — pruebe incluyendo los subprocesos"
              : ""}
            .
          </p>
        ) : (
          <GruposPorTipo
            documentos={propios}
            contextoDe={(doc) =>
              doc.subproceso ? `En subproceso: ${doc.subproceso.nombre}` : undefined
            }
          />
        )}
      </section>

      <NormasAplicables proceso={{ id: proceso.id, slug: proceso.slug }} normas={normas} asociables={asociables} />

      {tambienAplican.length > 0 && (
        <section className="mt-8" aria-labelledby="titulo-tambien">
          <h2
            id="titulo-tambien"
            className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground"
          >
            <Share2 className="size-4 text-muted-foreground" aria-hidden="true" />
            También aplica aquí
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Documentos de otros procesos que se usan o consultan en este.
          </p>
          <ul className="grid list-none grid-cols-1 gap-2 rounded-xl border border-dashed border-border bg-muted/40 p-3 sm:grid-cols-2">
            {tambienAplican.map((doc) => (
              <TarjetaDocumento
                key={doc.codigo}
                documento={doc}
                contexto={doc.propietario ? `Propio de: ${doc.propietario}` : undefined}
              />
            ))}
          </ul>
        </section>
      )}

      <div className="mt-10">
        <NavHermanos
          anterior={proceso.anterior}
          siguiente={proceso.siguiente}
          base="/procesos"
          etiqueta="proceso"
        />
      </div>
    </div>
  );
}

