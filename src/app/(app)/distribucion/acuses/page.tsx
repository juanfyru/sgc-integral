import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { PestanasDistribucion } from "@/componentes/distribucion/PestanasDistribucion";
import { TablaAcuses, textoPorcentaje } from "@/componentes/distribucion/acuses/TablaAcuses";
import type { PersonaQueFalta } from "@/componentes/distribucion/acuses/QuienFalta";
import { claseBoton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { TarjetaCifra } from "@/componentes/ui/TarjetaCifra";
import { obtenerSql } from "@/db/cliente";
import { quienFalta, resumenAcuses } from "@/db/consultas/distribucion/acuses";
import { alcanceProcesos } from "@/lib/alcance";
import { periodoDeAcuses } from "@/lib/distribucion/periodo-acuses";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { exigirDistribucion } from "../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Acuses de lectura" };

const texto = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function PaginaAcuses({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await exigirSesion();
  await exigirDistribucion(sesion);
  // El responsable de un punto entra a «Distribución» por sus copias; los porcentajes no son suyos.
  if (!puede(sesion, "distribucion.ver")) notFound();
  const q = await searchParams;
  const periodo = periodoDeAcuses({ desde: texto(q.desde), hasta: texto(q.hasta), proceso: texto(q.proceso) });
  const sql = obtenerSql();
  const alcance = await alcanceProcesos(sesion);
  const [resumen, procesos] = await Promise.all([
    resumenAcuses(sesion, { desde: periodo.desde, hasta: periodo.hasta, procesoId: periodo.procesoId }),
    sql`SELECT id, nombre FROM procesos WHERE activo ORDER BY orden, id`,
  ]);
  const opciones = procesos.filter((p) => alcance.todos || alcance.procesoIds.includes(Number(p.id)));
  const faltan = new Map<number, PersonaQueFalta[]>();
  await Promise.all(
    resumen.versiones
      .filter((v) => v.pendientes > 0)
      .map(async (v) => {
        const personas = await quienFalta(v.versionId, sesion);
        if (personas) faltan.set(v.versionId, personas);
      }),
  );
  const consulta = new URLSearchParams({ desde: periodo.desdeTexto, hasta: periodo.hastaTexto });
  if (periodo.procesoId) consulta.set("proceso", String(periodo.procesoId));
  const { entidad } = resumen;

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Distribución" descripcion="Copias controladas, acuses de lectura, socializaciones y verificaciones" />
      <PestanasDistribucion activa="acuses" />

      <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filtros de acuses">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Publicadas desde
          <input type="date" name="desde" defaultValue={periodo.desdeTexto} className={claseControl} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Hasta
          <input type="date" name="hasta" defaultValue={periodo.hastaTexto} className={claseControl} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Proceso
          <select name="proceso" defaultValue={periodo.procesoId ?? ""} className={claseControl}>
            <option value="">Todos</option>
            {opciones.map((p) => (
              <option key={Number(p.id)} value={Number(p.id)}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={claseBoton("secundario")}>
          Filtrar
        </button>
        <a href={`/distribucion/acuses/excel?${consulta}`} className={`${claseBoton("primario")} ml-auto`}>
          <Download aria-hidden="true" className="size-4" />
          Descargar Excel
        </a>
      </form>

      <section aria-labelledby="cifras-acuses" className="flex flex-col gap-3">
        <h2 id="cifras-acuses" className="text-sm font-semibold">
          Cumplimiento de lectura
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TarjetaCifra
            etiqueta="Entidad"
            valor={textoPorcentaje(entidad.porcentaje)}
            detalle={`${entidad.confirmados} confirmados · ${entidad.pendientes} pendientes`}
            estado={entidad.porcentaje === null ? "sin-dato" : entidad.porcentaje >= 90 ? "bien" : entidad.porcentaje >= 60 ? "atencion" : "critico"}
          />
          {resumen.porProceso.map((p) => (
            <TarjetaCifra
              key={p.procesoId}
              etiqueta={p.nombre}
              valor={textoPorcentaje(p.porcentaje)}
              detalle={`${p.confirmados} confirmados · ${p.pendientes} pendientes`}
            />
          ))}
        </div>
      </section>

      <TablaAcuses filas={resumen.versiones} faltan={faltan} />
    </div>
  );
}
