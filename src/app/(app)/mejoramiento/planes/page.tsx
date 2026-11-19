import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { PestanasMejoramiento, pestanasVisibles } from "@/componentes/mejoramiento/PestanasMejoramiento";
import { ListaDePlanes } from "@/componentes/mejoramiento/planes/ListaDePlanes";
import { Boton, claseBoton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerSql } from "@/db/cliente";
import { contextoDeMejora } from "@/db/consultas/mejoramiento/config";
import { veAlgunHallazgo } from "@/db/consultas/mejoramiento/lectura";
import { listarPlanes, veAlgunPlan, vigenciasDePlanes, type FiltroDePlanes } from "@/db/consultas/mejoramiento/planes-lectura";
import { contarReportesPorClasificar } from "@/db/consultas/mejoramiento/reportes";
import { ORIGENES } from "@/lib/mejoramiento/origenes";
import { RUTA_NUEVO_PLAN, RUTA_PLANES } from "@/lib/mejoramiento/rutas";
import type { Origen } from "@/lib/mejoramiento/tipos";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { cuenta } from "@/lib/plural";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Planes de mejoramiento" };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Los filtros de la dirección; un valor que no se entiende se ignora, sin decir nada. */
function filtroDePlanes(p: Record<string, string | string[] | undefined>): FiltroDePlanes {
  const q = uno(p.q)?.trim().slice(0, 100);
  const vigencia = Number(uno(p.vigencia));
  const origen = uno(p.origen);
  return {
    ...(q ? { q } : {}),
    ...(Number.isInteger(vigencia) && vigencia >= 2000 && vigencia <= 2100 ? { vigencia } : {}),
    ...(ORIGENES.some((o) => o.clave === origen) ? { origen: origen as Origen } : {}),
    ...(uno(p.abiertos) === "1" ? { soloAbiertos: true } : {}),
    ...(uno(p.anulados) === "1" ? { anulados: true } : {}),
  };
}

/**
 * La pestaña «Planes» (anexo §3.9, maqueta 1): los planes que la persona ve (`filtroPlanes`), con la búsqueda por código o nombre y
 * los filtros por vigencia, origen y «Solo abiertos» (un formulario `GET`); los anulados, con su filtro. Las cifras de cada plan
 * son las de los hallazgos que ve completos. La ve quien ve algún plan o los crea (`mejora.planes`); a los demás, «no encontrado».
 */
export default async function PaginaPlanes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sesion = await exigirSesion();
  const crea = puede(sesion, "mejora.planes");
  const ahora = new Date();
  const [vePlanes, veHallazgos, porClasificar] = await Promise.all([
    veAlgunPlan(sesion),
    veAlgunHallazgo(sesion),
    contarReportesPorClasificar(sesion),
  ]);
  if (!vePlanes && !crea) notFound();
  const filtro = filtroDePlanes(await searchParams);
  const [planes, vigencias, contexto] = await Promise.all([
    listarPlanes(sesion, filtro, { ahora }),
    vigenciasDePlanes(sesion),
    contextoDeMejora(obtenerSql(), ahora),
  ]);
  const conFiltros = Object.keys(filtro).length > 0;
  const verTodo = puede(sesion, "mejora.ver_todo");

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        migas={[{ nombre: "Mejoramiento", href: "/mejoramiento" }, { nombre: "Planes" }]}
        titulo="Planes de mejoramiento"
        descripcion={
          planes.length > 0
            ? `${cuenta(planes.length, "plan", "planes")} · cada uno agrupa los hallazgos de una auditoría o un evento.`
            : "Agrupan los hallazgos de una auditoría o un evento para seguirlos y responderlos juntos."
        }
        acciones={
          crea ? (
            <Link href={RUTA_NUEVO_PLAN} className={`${claseBoton("primario")} ${FOCO}`}>
              <Plus aria-hidden="true" className="size-4" />
              Nuevo plan
            </Link>
          ) : null
        }
      />
      <PestanasMejoramiento activa="planes" visibles={pestanasVisibles(sesion, { veHallazgos, vePlanes })} numeros={{ reportes: porClasificar }} />
      <form method="get" action={RUTA_PLANES} role="search" aria-label="Filtrar planes" className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-48 flex-[2] flex-col gap-1">
          <label htmlFor="planes-q" className="text-sm font-medium">
            Buscar
          </label>
          <input id="planes-q" name="q" type="search" defaultValue={filtro.q ?? ""} placeholder="Código o nombre" maxLength={100} className={claseControl} />
        </div>
        <div className="flex min-w-32 flex-1 flex-col gap-1">
          <label htmlFor="planes-vigencia" className="text-sm font-medium">
            Vigencia
          </label>
          <select id="planes-vigencia" name="vigencia" defaultValue={filtro.vigencia === undefined ? "" : String(filtro.vigencia)} className={claseControl}>
            <option value="">Todas</option>
            {vigencias.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-36 flex-1 flex-col gap-1">
          <label htmlFor="planes-origen" className="text-sm font-medium">
            Origen
          </label>
          <select id="planes-origen" name="origen" defaultValue={filtro.origen ?? ""} className={claseControl}>
            <option value="">Todos</option>
            {ORIGENES.map((o) => (
              <option key={o.clave} value={o.clave}>
                {o.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="abiertos" value="1" defaultChecked={filtro.soloAbiertos === true} className="size-4 accent-marca" />
          Solo abiertos
        </label>
        {verTodo ? (
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" name="anulados" value="1" defaultChecked={filtro.anulados === true} className="size-4 accent-marca" />
            Incluir los anulados
          </label>
        ) : null}
        <div className="flex gap-2 pb-0.5">
          <Boton type="submit" variante="primario">
            Filtrar
          </Boton>
          <Link
            href={RUTA_PLANES}
            className={`inline-flex items-center rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground ${FOCO}`}
          >
            Quitar
          </Link>
        </div>
      </form>
      <ListaDePlanes planes={planes} contexto={contexto} conFiltros={conFiltros} />
    </div>
  );
}
