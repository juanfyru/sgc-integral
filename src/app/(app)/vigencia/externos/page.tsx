import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText, Plus } from "lucide-react";
import { TablaExternos } from "@/componentes/vigencia/externos/TablaExternos";
import { PestanasVigencia, pestanasVisibles } from "@/componentes/vigencia/PestanasVigencia";
import { Boton, claseBoton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { listarExternos, type FilaExterno } from "@/db/consultas/vigencia/externos";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { cuenta } from "@/lib/plural";
import { consultaDeExternos, ESTADOS_DE_EXTERNO, filtroDeExternos } from "@/lib/vigencia/filtro-externos";
import { ETIQUETA_VIGENCIA, type EstadoVigencia } from "@/lib/vigencia/tipos";
import { exigirVigencia } from "../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Documentos externos" };

const ETIQUETA_FILTRO: Record<(typeof ESTADOS_DE_EXTERNO)[number] | "todos", string> = {
  vencida: "Vencidas",
  atencion: ETIQUETA_VIGENCIA.atencion,
  al_dia: ETIQUETA_VIGENCIA.al_dia,
  todos: "Todos",
};

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/** Las opciones de un filtro salen de las filas que la persona ve, sin repetir: nunca un proceso o alguien ajeno. */
function distintos<T extends { id: number; nombre: string }>(filas: FilaExterno[], de: (f: FilaExterno) => T): T[] {
  const vistos = new Map<number, T>();
  for (const f of filas) vistos.set(de(f).id, de(f));
  return [...vistos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/**
 * La matriz de documentos externos SGC-MZ-03 (spec 13C §8.6): con `vigencia.ver`, los de sus procesos; al responsable
 * técnico, los suyos. Filtros por estado, proceso, responsable y texto; registrar con `externos.gestionar`.
 */
export default async function PaginaExternos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await exigirSesion();
  const { responsableTecnico } = await exigirVigencia(sesion);
  const visibles = pestanasVisibles(sesion, responsableTecnico);
  if (!visibles.includes("externos")) notFound();

  const filtro = filtroDeExternos(await searchParams);
  const ahora = new Date();
  const filtrada = filtro.procesoId !== undefined || filtro.responsableId !== undefined || filtro.q !== undefined;
  const [todas, sinFiltro] = await Promise.all([
    listarExternos(sesion, { estado: "todos", procesoId: filtro.procesoId, responsableId: filtro.responsableId, q: filtro.q }, { ahora }),
    filtrada ? listarExternos(sesion, { estado: "todos" }, { ahora }) : Promise.resolve(null),
  ]);
  const base = sinFiltro ?? todas;
  const procesos = distintos(base, (f) => ({ id: f.proceso.id, nombre: f.proceso.nombre, sigla: f.proceso.sigla }));
  const responsables = distintos(base, (f) => ({ id: f.responsableId, nombre: f.responsable }));
  const filas = filtro.estado === "todos" ? todas : todas.filter((f) => f.vigencia.estado === filtro.estado);
  const cuantos = (estado: EstadoVigencia | "todos") => (estado === "todos" ? todas.length : todas.filter((f) => f.vigencia.estado === estado).length);
  const vigentes = base.filter((f) => f.adoptadaEn !== null).length;

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPagina
        titulo="Vigencia"
        descripcion={`Matriz de documentos externos (SGC-MZ-03) · ${cuenta(vigentes, "vigente", "vigentes")}`}
        acciones={
          <div className="flex flex-wrap gap-2">
            <a href={`/vigencia/externos/excel${consultaDeExternos(filtro)}`} className={`${claseBoton("secundario")} ${FOCO}`}>
              <Download aria-hidden="true" className="size-4" />
              Descargar Excel
            </a>
            {puede(sesion, "externos.gestionar") ? (
              <Link href="/vigencia/externos/nuevo" className={`${claseBoton("primario")} ${FOCO}`}>
                <Plus aria-hidden="true" className="size-4" />
                Registrar documento externo
              </Link>
            ) : null}
          </div>
        }
      />
      <PestanasVigencia activa="externos" visibles={visibles} />

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
        <nav aria-label="Estado de vigencia">
          <ul className="flex list-none flex-wrap gap-2">
            {([...ESTADOS_DE_EXTERNO, "todos"] as const).map((clave) => {
              const esActivo = clave === filtro.estado;
              return (
                <li key={clave}>
                  <Link
                    href={`/vigencia/externos${consultaDeExternos(filtro, { estado: clave })}`}
                    aria-current={esActivo ? "page" : undefined}
                    className={`inline-block rounded-full border px-3 py-1 text-sm ${FOCO} ${
                      esActivo ? "border-marca bg-muted font-semibold text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {`${ETIQUETA_FILTRO[clave]} (${cuantos(clave)})`}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <form method="get" action="/vigencia/externos" className="flex min-w-0 max-w-full flex-wrap items-end gap-2">
          {filtro.estado === "todos" ? null : <input type="hidden" name="estado" value={filtro.estado} />}
          {/* A 390 px cada filtro cede al ancho disponible: los nombres de proceso y de persona son largos. */}
          <div className="flex min-w-0 max-w-full flex-col gap-1">
            <label htmlFor="filtro-proceso" className="text-sm font-medium">
              Proceso
            </label>
            <select id="filtro-proceso" name="proceso" defaultValue={filtro.procesoId ?? ""} className={`${claseControl} w-full max-w-full`}>
              <option value="">Todos</option>
              {procesos.map((p) => (
                <option key={p.id} value={p.id}>
                  {`${p.sigla} · ${p.nombre}`}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 max-w-full flex-col gap-1">
            <label htmlFor="filtro-responsable" className="text-sm font-medium">
              Responsable técnico
            </label>
            <select
              id="filtro-responsable"
              name="responsable"
              defaultValue={filtro.responsableId ?? ""}
              className={`${claseControl} w-full max-w-full`}
            >
              <option value="">Todos</option>
              {responsables.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 max-w-full flex-col gap-1">
            <label htmlFor="filtro-texto" className="text-sm font-medium">
              Buscar
            </label>
            <input
              id="filtro-texto"
              type="search"
              name="q"
              defaultValue={filtro.q ?? ""}
              maxLength={100}
              placeholder="Código, título o emisor"
              className={`${claseControl} w-full max-w-full`}
            />
          </div>
          <Boton type="submit" variante="secundario">
            Filtrar
          </Boton>
        </form>
      </div>

      {filas.length === 0 ? (
        filtrada || filtro.estado !== "todos" ? (
          <EstadoVacio
            icono={FileText}
            titulo="No hay documentos externos aquí"
            texto="Ningún documento externo de su alcance cumple los filtros elegidos."
          />
        ) : (
          <EstadoVacio
            icono={FileText}
            titulo="Aún no hay documentos externos registrados"
            texto="Las normas, guías y manuales que emite otro y que el hospital aplica se registran aquí, con su responsable técnico y su verificación de vigencia."
            accion={puede(sesion, "externos.gestionar") ? { href: "/vigencia/externos/nuevo", etiqueta: "Registrar el primero" } : undefined}
          />
        )
      ) : (
        <TablaExternos filas={filas} />
      )}
    </div>
  );
}
