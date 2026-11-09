import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Plus, Scale } from "lucide-react";
import { FiltrosNormas } from "@/componentes/normograma/FiltrosNormas";
import { TablaNormas } from "@/componentes/normograma/TablaNormas";
import { TiposNorma } from "@/componentes/normograma/TiposNorma";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { aniosYEmisores, listarNormas } from "@/db/consultas/normograma/lectura";
import { listarTiposNorma } from "@/db/consultas/normograma/tipos-norma";
import { procesosActivos } from "@/db/consultas/procesos";
import { consultaDeNormas, filtroDeConsulta, filtroDeNormas, hayFiltros } from "@/lib/normograma/filtro-normas";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { cuenta } from "@/lib/plural";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Normograma" };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/**
 * El normograma (spec 13C §10.6, maqueta 8), para toda persona con sesión: la lista institucional con sus filtros y su
 * Excel; con `?proceso=<slug>`, el normograma del proceso con la columna del requisito. Quien administra registra normas
 * y, al pie, mantiene los tipos de norma. Un proceso que no existe es «no encontrado».
 */
export default async function PaginaNormograma({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await exigirSesion();
  const administra = puede(sesion, "normograma.administrar");
  const filtro = filtroDeNormas(await searchParams, administra);
  const [procesos, tipos, { anios, emisores }] = await Promise.all([procesosActivos(), listarTiposNorma(), aniosYEmisores()]);
  const proceso = filtro.proceso ? procesos.find((p) => p.slug === filtro.proceso) : undefined;
  if (filtro.proceso && !proceso) notFound();
  const filas = await listarNormas(filtroDeConsulta(filtro, proceso?.id), sesion);
  const vigentes = filas.filter((f) => f.estado === "vigente").length;
  const excel = `/normograma/excel${consultaDeNormas(filtro)}`;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        migas={proceso ? [{ nombre: "Normograma", href: "/normograma" }, { nombre: proceso.nombre }] : undefined}
        titulo={proceso ? `Normograma de ${proceso.nombre}` : "Normograma"}
        descripcion={`${proceso ? "Normas que aplican al proceso, con el requisito que le imponen" : "Normas aplicables al SGC, institucional y por proceso"} · ${cuenta(filas.length, "norma", "normas")}, ${cuenta(vigentes, "vigente", "vigentes")}`}
        acciones={
          <div className="flex flex-wrap gap-2">
            <a href={excel} className={`${claseBoton("secundario")} ${FOCO}`}>
              <Download aria-hidden="true" className="size-4" />
              {proceso ? "Excel del proceso" : "Excel institucional"}
            </a>
            {proceso ? (
              <Link href={`/procesos/${proceso.slug}`} className={`${claseBoton("secundario")} ${FOCO}`}>
                Ir al proceso
              </Link>
            ) : null}
            {administra ? (
              <Link href="/normograma/nueva" className={`${claseBoton("primario")} ${FOCO}`}>
                <Plus aria-hidden="true" className="size-4" />
                Nueva norma
              </Link>
            ) : null}
          </div>
        }
      />

      <FiltrosNormas
        filtro={filtro}
        tipos={tipos.map((t) => ({ id: t.id, nombre: t.nombre }))}
        anios={anios}
        emisores={emisores}
        procesos={procesos}
        administra={administra}
      />

      {filas.length === 0 ? (
        hayFiltros(filtro) || proceso ? (
          <EstadoVacio
            icono={Scale}
            titulo="No hay normas aquí"
            texto={proceso && !hayFiltros(filtro) ? "Ninguna norma está asociada a este proceso." : "Ninguna norma cumple los filtros elegidos."}
          />
        ) : (
          <EstadoVacio
            icono={Scale}
            titulo="Aún no hay normas registradas"
            texto="Las leyes, decretos y resoluciones que aplican al hospital se registran aquí, con los procesos a los que aplican y los documentos que las implementan."
            accion={administra ? { href: "/normograma/nueva", etiqueta: "Registrar la primera" } : undefined}
          />
        )
      ) : (
        <TablaNormas filas={filas} conRequisito={proceso !== undefined} />
      )}

      {administra ? <TiposNorma tipos={tipos} /> : null}
    </div>
  );
}
