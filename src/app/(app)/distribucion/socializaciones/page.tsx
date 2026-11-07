import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { PestanasDistribucion } from "@/componentes/distribucion/PestanasDistribucion";
import { TablaJornadas } from "@/componentes/distribucion/socializaciones/TablaJornadas";
import { claseBoton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { listarJornadas, procesosParaFiltro } from "@/db/consultas/distribucion/jornadas";
import { periodoDeAcuses } from "@/lib/distribucion/periodo-acuses";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { exigirDistribucion } from "../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Socializaciones" };

const texto = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function PaginaSocializaciones({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await exigirSesion();
  await exigirDistribucion(sesion);
  const q = await searchParams;
  const periodo = periodoDeAcuses({ desde: texto(q.desde), hasta: texto(q.hasta), proceso: texto(q.proceso) });
  const [jornadas, opciones] = await Promise.all([
    listarJornadas(sesion, { desde: periodo.desde, hasta: periodo.hasta, procesoId: periodo.procesoId }),
    procesosParaFiltro(sesion),
  ]);
  const puedeRegistrar = puede(sesion, "socializaciones.registrar");

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        titulo="Distribución"
        descripcion="Copias controladas, acuses de lectura, socializaciones y verificaciones"
        acciones={
          puedeRegistrar ? (
            <Link href="/distribucion/socializaciones/nueva" className={claseBoton("primario")}>
              Registrar socialización
            </Link>
          ) : undefined
        }
      />
      <PestanasDistribucion activa="socializaciones" />

      <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filtros de socializaciones">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Desde
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
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={claseBoton("secundario")}>
          Filtrar
        </button>
      </form>

      {jornadas.length === 0 ? (
        <EstadoVacio
          icono={Users}
          titulo="No hay jornadas en este periodo"
          texto="Cuando se registre una jornada de socialización, aparecerá aquí con su evidencia."
        />
      ) : (
        <TablaJornadas jornadas={jornadas} />
      )}
    </div>
  );
}
