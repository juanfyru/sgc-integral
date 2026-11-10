import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { BarrasPorProceso } from "@/componentes/vigencia/indicadores/BarrasPorProceso";
import { FiltroPeriodo } from "@/componentes/vigencia/indicadores/FiltroPeriodo";
import { TablaPorProceso } from "@/componentes/vigencia/indicadores/TablaPorProceso";
import { TarjetasIndicadores } from "@/componentes/vigencia/indicadores/TarjetasIndicadores";
import { PestanasVigencia, pestanasVisibles } from "@/componentes/vigencia/PestanasVigencia";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { indicadoresDocumentales } from "@/db/consultas/vigencia/indicadores";
import { procesosDelSemaforo } from "@/db/consultas/vigencia/semaforo";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { cuenta } from "@/lib/plural";
import { filtroDeConsulta } from "@/lib/vigencia/filtro-semaforo";
import { exigirVigencia } from "../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Indicadores documentales" };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/**
 * Los indicadores del proceso documental (spec 13C §11, maqueta 9), con `documentos.indicadores`: el líder ve solo sus
 * procesos, y un proceso fuera de su alcance es «no encontrado». Los de estado se miden hoy; los de flujo, por el
 * periodo elegido (el año en curso si no se elige o no se entiende).
 */
export default async function PaginaIndicadores({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await exigirSesion();
  const { responsableTecnico } = await exigirVigencia(sesion);
  if (!puede(sesion, "documentos.indicadores")) notFound();

  const q = await searchParams;
  const periodoPedido = (Array.isArray(q.periodo) ? q.periodo[0] : q.periodo) ?? "";
  const { procesoId } = filtroDeConsulta({ proceso: q.proceso });
  const ahora = new Date();
  const [r, procesos] = await Promise.all([
    indicadoresDocumentales(sesion, { periodo: periodoPedido, procesoId }, { ahora }),
    procesosDelSemaforo(sesion),
  ]);
  if (!r) notFound();

  const conProceso = r.procesoId === null ? "" : `&proceso=${r.procesoId}`;
  const nombreProceso = r.procesoId === null ? "todos" : (procesos.find((p) => p.id === r.procesoId)?.nombre ?? "no disponible");
  // El Semáforo muestra «Vencida» solo lo que no está en trámite: lo demás lo cuenta aparte.
  const enSemaforo = r.vencidos.filter((v) => v.tramite === null).length;
  const enTramite = r.vencidos.length - enSemaforo;
  const metaDentro = r.indicadores.find((i) => i.clave === "dentro_plazo")?.meta ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        titulo="Vigencia"
        descripcion="Plazo de revisión, revisión anual, documentos externos e indicadores del proceso documental"
        acciones={
          <a href={`/vigencia/indicadores/excel?periodo=${r.periodo.clave}${conProceso}`} className={`${claseBoton("secundario")} ${FOCO}`}>
            <Download aria-hidden="true" className="size-4" />
            Descargar Excel
          </a>
        }
      />
      <PestanasVigencia activa="indicadores" visibles={pestanasVisibles(sesion, responsableTecnico)} />

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
        <p className="text-sm text-muted-foreground">
          {`Periodo: ${r.periodo.etiqueta} · Proceso: ${nombreProceso} · las metas se fijan en Configuración documental`}
        </p>
        <FiltroPeriodo periodo={r.periodo.clave} procesoId={r.procesoId} procesos={procesos} ahora={ahora} />
      </div>

      <TarjetasIndicadores indicadores={r.indicadores} tramites={r.tramites} />

      {r.vencidos.length > 0 && puede(sesion, "vigencia.ver") ? (
        <p className="text-sm">
          {enSemaforo > 0 ? (
            <Link href={`/vigencia/semaforo?estado=vencida${conProceso}`} className={`rounded underline underline-offset-2 ${FOCO}`}>
              {enSemaforo === 1 ? "Ver el vencido en el Semáforo" : `Ver los ${enSemaforo} vencidos en el Semáforo`}
            </Link>
          ) : null}
          {enTramite > 0 ? (
            <span className="text-muted-foreground">
              {`${enSemaforo > 0 ? " · " : ""}${cuenta(enTramite, "vencido está", "vencidos están")} en trámite: el Semáforo ${
                enTramite === 1 ? "lo muestra" : "los muestra"
              } en «En trámite».`}
            </span>
          ) : null}
        </p>
      ) : null}

      {/* Uno debajo del otro, a todo el ancho; lado a lado solo desde 2xl, y cada uno con su altura. */}
      <div className="grid grid-cols-1 items-start gap-6 2xl:grid-cols-2">
        <BarrasPorProceso filas={r.vencidosPorProceso} />
        <TablaPorProceso filas={r.dentroPorProceso} meta={metaDentro} />
      </div>

      <p className="text-sm text-muted-foreground">
        Los indicadores de estado (dentro del plazo, vencidos, externos al día y la conformidad actual) se calculan a la fecha
        de hoy; los de flujo (aprobación, acuses, etapas en plazo y la conformidad del periodo), por el periodo elegido.
      </p>
    </div>
  );
}
