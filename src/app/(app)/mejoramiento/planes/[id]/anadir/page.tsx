import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SearchX } from "lucide-react";
import { ponerEnPlanAccion } from "@/app/acciones-mejoramiento";
import { SelectorDeHallazgos } from "@/componentes/mejoramiento/planes/SelectorDeHallazgos";
import { Boton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { procesosDelAlcance } from "@/db/consultas/mejoramiento/opciones";
import { CANDIDATOS_POR_PAGINA, candidatosParaPlan } from "@/db/consultas/mejoramiento/planes-lectura";
import { ORIGENES } from "@/lib/mejoramiento/origenes";
import { RUTA_PLANES, rutaDeAnadirAPlan } from "@/lib/mejoramiento/rutas";
import type { Origen } from "@/lib/mejoramiento/tipos";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { exigirPlan, rutaDePlan } from "../../../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Añadir hallazgos al plan" };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** La búsqueda de la dirección; un valor que no se entiende se ignora. */
function filtroDeCandidatos(p: Record<string, string | string[] | undefined>) {
  const q = uno(p.q)?.trim().slice(0, 100);
  const proceso = Number(uno(p.proceso));
  const anio = Number(uno(p.anio));
  const origen = uno(p.origen);
  return {
    ...(q ? { q } : {}),
    ...(Number.isSafeInteger(proceso) && proceso > 0 ? { proceso } : {}),
    ...(ORIGENES.some((o) => o.clave === origen) ? { origen: origen as Origen } : {}),
    ...(Number.isInteger(anio) && anio >= 2000 && anio <= 2100 ? { anio } : {}),
  };
}

/**
 * «Añadir hallazgos» a un plan (anexo §3.4, camino 2): un formulario `GET` para buscar por código o título y filtrar por proceso,
 * origen y año, y otro con las casillas de los que se pueden añadir (los que cuentan y no están en ningún plan, hasta cincuenta),
 * que envía `ponerEnPlanAccion`. Solo con `mejora.planes` (a los demás, «no encontrado»); en un plan anulado no se añade nada.
 */
export default async function PaginaAnadirAlPlan({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await exigirSesion();
  if (!puede(sesion, "mejora.planes")) notFound();
  const { id } = await params;
  const { plan } = await exigirPlan(id);
  if (!plan.puede.gestionar) redirect(rutaDePlan(plan.id));
  const filtro = filtroDeCandidatos(await searchParams);
  const [candidatos, procesos] = await Promise.all([candidatosParaPlan(sesion, plan.id, filtro), procesosDelAlcance(sesion)]);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        migas={[
          { nombre: "Mejoramiento", href: "/mejoramiento" },
          { nombre: "Planes", href: RUTA_PLANES },
          { nombre: plan.codigo, href: rutaDePlan(plan.id) },
          { nombre: "Añadir hallazgos" },
        ]}
        codigo={plan.codigo}
        titulo={`Añadir hallazgos a ${plan.nombre}`}
        descripcion="Los que cuentan y no están en ningún plan, en cualquier estado, también cerrados. Conservan su origen y su fecha del ente."
      />
      <form method="get" action={rutaDeAnadirAPlan(plan.id)} role="search" aria-label="Buscar hallazgos para el plan" className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-48 flex-[2] flex-col gap-1">
          <label htmlFor="anadir-q" className="text-sm font-medium">
            Buscar
          </label>
          <input id="anadir-q" name="q" type="search" defaultValue={filtro.q ?? ""} placeholder="Código o título" maxLength={100} className={claseControl} />
        </div>
        <div className="flex min-w-36 flex-1 flex-col gap-1">
          <label htmlFor="anadir-proceso" className="text-sm font-medium">
            Proceso
          </label>
          <select id="anadir-proceso" name="proceso" defaultValue={filtro.proceso === undefined ? "" : String(filtro.proceso)} className={claseControl}>
            <option value="">Todos</option>
            {procesos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-36 flex-1 flex-col gap-1">
          <label htmlFor="anadir-origen" className="text-sm font-medium">
            Origen
          </label>
          <select id="anadir-origen" name="origen" defaultValue={filtro.origen ?? ""} className={claseControl}>
            <option value="">Todos</option>
            {ORIGENES.map((o) => (
              <option key={o.clave} value={o.clave}>
                {o.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div className="flex w-28 flex-col gap-1">
          <label htmlFor="anadir-anio" className="text-sm font-medium">
            Año
          </label>
          <input
            id="anadir-anio"
            name="anio"
            type="number"
            inputMode="numeric"
            min={2000}
            max={2100}
            defaultValue={filtro.anio ?? ""}
            className={claseControl}
          />
        </div>
        <div className="flex gap-2 pb-0.5">
          <Boton type="submit" variante="secundario">
            Buscar
          </Boton>
          <Link
            href={rutaDeAnadirAPlan(plan.id)}
            className={`inline-flex items-center rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground ${FOCO}`}
          >
            Quitar
          </Link>
        </div>
      </form>
      {candidatos.length === 0 ? (
        <EstadoVacio
          icono={SearchX}
          titulo="Ningún hallazgo para añadir"
          texto="No hay hallazgos sin plan que coincidan con la búsqueda. Los anulados y los rechazados no se añaden a un plan."
        />
      ) : (
        <>
          {candidatos.length === CANDIDATOS_POR_PAGINA ? (
            <p className="text-sm text-muted-foreground">{`Se muestran los primeros ${CANDIDATOS_POR_PAGINA}: afine la búsqueda para ver otros.`}</p>
          ) : null}
          <SelectorDeHallazgos planId={plan.id} candidatos={candidatos} proponeObjetivo={plan.proponeObjetivo} accion={ponerEnPlanAccion} />
        </>
      )}
    </div>
  );
}
