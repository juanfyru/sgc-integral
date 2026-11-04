import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarRange, FileSearch, Filter, SearchX, TimerOff } from "lucide-react";
import { CampoBusqueda } from "@/componentes/busqueda/CampoBusqueda";
import { TarjetaResultado } from "@/componentes/busqueda/TarjetaResultado";
import {
  buscarDocumentos,
  hayCriterios,
  registrarBusqueda,
  type FiltrosBusqueda,
  type RespuestaBusqueda,
} from "@/db/consultas/busqueda";
import { obtenerDetalleProceso } from "@/db/consultas/procesos";
import { crearLimitador } from "@/lib/limite";
import { exigirSesion } from "@/lib/paginas";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Buscar documentos" };

// Instancia única en el NAS: el limitador vive en la memoria del proceso.
// 30 búsquedas/minuto por usuario absorbe el debounce sin frenar a nadie real.
const permitirBusqueda = crearLimitador({ limite: 30, ventanaMs: 60_000 });

const SUGERENCIAS = [
  "vacunación",
  "acta de reunión",
  "GTH",
  "mantenimiento",
  "seguridad del paciente",
];

type Parametros = {
  q?: string;
  tipo?: string;
  proceso?: string;
  sub?: string;
  desde?: string;
  hasta?: string;
};

const CLAVES: (keyof Parametros)[] = ["q", "tipo", "proceso", "sub", "desde", "hasta"];

function urlBusqueda(
  actuales: Parametros,
  cambios: Partial<Record<keyof Parametros, string | null>>,
): string {
  const combinados = { ...actuales, ...cambios };
  const parametros = new URLSearchParams();
  for (const clave of CLAVES) {
    const valor = combinados[clave];
    if (valor) parametros.set(clave, valor);
  }
  const consulta = parametros.toString();
  return consulta ? `/buscar?${consulta}` : "/buscar";
}

export default async function PaginaBuscar({
  searchParams,
}: {
  searchParams: Promise<Parametros>;
}) {
  const sesion = await exigirSesion();
  const sp = await searchParams;
  const parametros: Parametros = Object.fromEntries(
    CLAVES.map((c) => [c, typeof sp[c] === "string" ? sp[c] : undefined]),
  );
  const filtros: FiltrosBusqueda = {
    q: parametros.q,
    tipo: parametros.tipo,
    proceso: parametros.proceso,
    subproceso: parametros.sub,
    desde: parametros.desde,
    hasta: parametros.hasta,
  };
  const conCriterios = hayCriterios(filtros);

  let limitado = false;
  let respuesta: RespuestaBusqueda = {
    resultados: [],
    total: 0,
    facetas: { tipos: [], procesos: [] },
  };

  if (conCriterios) {
    if (!permitirBusqueda(String(sesion.usuarioId))) {
      limitado = true;
    } else {
      respuesta = await buscarDocumentos(filtros);
      if (filtros.q?.trim()) {
        await registrarBusqueda(filtros.q, respuesta.total).catch((err) =>
          console.error("No se pudo registrar la búsqueda:", err),
        );
      }
    }
  }

  // Subprocesos del proceso filtrado, para el tercer nivel de filtro.
  const detalleProceso = parametros.proceso
    ? await obtenerDetalleProceso(parametros.proceso)
    : null;

  const hayFiltros = Boolean(
    parametros.tipo || parametros.proceso || parametros.sub || parametros.desde || parametros.hasta,
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-10">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-azul-tinta sm:text-3xl">
          Buscar documentos
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Solo se muestran documentos <strong>vigentes</strong>. Puede buscar
          por código (incluso parcial, como «GTH»), título o palabras clave.
        </p>
      </header>

      <Suspense>
        <CampoBusqueda valorInicial={parametros.q ?? ""} />
      </Suspense>

      {limitado ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <TimerOff className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-semibold text-foreground">
            Demasiadas búsquedas en poco tiempo
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            Espere un momento e intente de nuevo.
          </p>
        </div>
      ) : !conCriterios ? (
        <EstadoInicial />
      ) : (
        <div className="mt-6 grid gap-8 lg:grid-cols-[15rem_1fr]">
          <aside aria-label="Filtros de búsqueda" className="space-y-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Filter className="size-4 text-muted-foreground" aria-hidden="true" />
                Filtros
              </h2>
              {hayFiltros && (
                <Link
                  href={urlBusqueda(parametros, {
                    tipo: null,
                    proceso: null,
                    sub: null,
                    desde: null,
                    hasta: null,
                  })}
                  className="text-xs font-medium text-marca underline-offset-2 hover:underline"
                >
                  Limpiar todo
                </Link>
              )}
            </div>

            {respuesta.facetas.tipos.length > 0 && (
              <section aria-labelledby="filtro-tipo">
                <h3
                  id="filtro-tipo"
                  className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Tipo de documento
                </h3>
                <ul className="space-y-1">
                  {respuesta.facetas.tipos.map((tipo) => {
                    const activo = parametros.tipo === tipo.clave;
                    return (
                      <li key={tipo.clave}>
                        <Link
                          prefetch={false}
                          href={urlBusqueda(parametros, {
                            tipo: activo ? null : tipo.clave,
                          })}
                          aria-current={activo ? "true" : undefined}
                          className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                            activo
                              ? "bg-azul font-medium text-white"
                              : "text-foreground hover:bg-muted"
                          }`}
                        >
                          <span>{tipo.nombre}</span>
                          <span
                            className={`text-xs tabular-nums ${activo ? "text-white/80" : "text-muted-foreground"}`}
                          >
                            {tipo.cantidad}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {respuesta.facetas.procesos.length > 0 && (
              <section aria-labelledby="filtro-proceso">
                <h3
                  id="filtro-proceso"
                  className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Proceso
                </h3>
                <ul className="space-y-1">
                  {respuesta.facetas.procesos.map((proceso) => {
                    const activo = parametros.proceso === proceso.clave;
                    return (
                      <li key={proceso.clave}>
                        <Link
                          prefetch={false}
                          href={urlBusqueda(parametros, {
                            proceso: activo ? null : proceso.clave,
                            sub: null,
                          })}
                          aria-current={activo ? "true" : undefined}
                          className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                            activo
                              ? "bg-azul font-medium text-white"
                              : "text-foreground hover:bg-muted"
                          }`}
                        >
                          <span className="min-w-0 truncate">{proceso.nombre}</span>
                          <span
                            className={`shrink-0 text-xs tabular-nums ${activo ? "text-white/80" : "text-muted-foreground"}`}
                          >
                            {proceso.cantidad}
                          </span>
                        </Link>
                        {activo &&
                          detalleProceso &&
                          detalleProceso.subprocesos.length > 0 && (
                            <ul className="mt-1 space-y-0.5 border-l border-border pl-3">
                              {detalleProceso.subprocesos.map((subproceso) => {
                                const subActivo = parametros.sub === subproceso.slug;
                                return (
                                  <li key={subproceso.id}>
                                    <Link
                                      prefetch={false}
                                      href={urlBusqueda(parametros, {
                                        sub: subActivo ? null : subproceso.slug,
                                      })}
                                      aria-current={subActivo ? "true" : undefined}
                                      className={`block rounded-md px-2 py-1 text-xs transition-colors ${
                                        subActivo
                                          ? "bg-azul/10 font-medium text-marca"
                                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                      }`}
                                    >
                                      {subproceso.nombre}
                                    </Link>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <section aria-labelledby="filtro-fechas">
              <h3
                id="filtro-fechas"
                className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                <CalendarRange className="size-3.5" aria-hidden="true" />
                Fecha de aprobación
              </h3>
              <form action="/buscar" method="get" className="space-y-2">
                {parametros.q && <input type="hidden" name="q" value={parametros.q} />}
                {parametros.tipo && (
                  <input type="hidden" name="tipo" value={parametros.tipo} />
                )}
                {parametros.proceso && (
                  <input type="hidden" name="proceso" value={parametros.proceso} />
                )}
                {parametros.sub && (
                  <input type="hidden" name="sub" value={parametros.sub} />
                )}
                <label className="block text-xs text-muted-foreground">
                  Desde
                  <input
                    type="date"
                    name="desde"
                    defaultValue={parametros.desde}
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-2.5 text-sm text-foreground shadow-xs outline-none focus:border-azul focus:ring-2 focus:ring-azul/20"
                  />
                </label>
                <label className="block text-xs text-muted-foreground">
                  Hasta
                  <input
                    type="date"
                    name="hasta"
                    defaultValue={parametros.hasta}
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-2.5 text-sm text-foreground shadow-xs outline-none focus:border-azul focus:ring-2 focus:ring-azul/20"
                  />
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="h-8 rounded-lg bg-azul px-3 text-xs font-medium text-white transition-colors hover:bg-azul-profundo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
                  >
                    Aplicar
                  </button>
                  {(parametros.desde || parametros.hasta) && (
                    <Link
                      href={urlBusqueda(parametros, { desde: null, hasta: null })}
                      className="text-xs font-medium text-marca underline-offset-2 hover:underline"
                    >
                      Quitar fechas
                    </Link>
                  )}
                </div>
              </form>
            </section>
          </aside>

          <section aria-label="Resultados de búsqueda">
            <p aria-live="polite" className="mb-3 text-sm text-muted-foreground">
              {respuesta.total === 0
                ? "Sin resultados"
                : respuesta.total === 1
                  ? "1 documento encontrado"
                  : `${respuesta.total} documentos encontrados`}
              {parametros.q?.trim() ? (
                <>
                  {" "}
                  para «<span className="font-medium text-foreground">{parametros.q.trim()}</span>»
                </>
              ) : null}
            </p>

            {respuesta.total === 0 ? (
              <SinResultados parametros={parametros} hayFiltros={hayFiltros} />
            ) : (
              <ul className="space-y-2.5">
                {respuesta.resultados.map((resultado, indice) => (
                  <TarjetaResultado key={resultado.id} resultado={resultado} indice={indice} />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function EstadoInicial() {
  return (
    <div className="mt-10 flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <FileSearch className="size-9 text-muted-foreground" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-foreground">
          ¿Qué documento necesita?
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Escriba arriba, o pruebe con uno de estos ejemplos:
        </p>
      </div>
      <ul className="flex flex-wrap justify-center gap-2">
        {SUGERENCIAS.map((sugerencia) => (
          <li key={sugerencia}>
            <Link
              href={`/buscar?q=${encodeURIComponent(sugerencia)}`}
              className="inline-block rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-azul hover:text-marca"
            >
              {sugerencia}
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        También puede navegar desde el{" "}
        <Link href="/" className="font-medium text-marca underline-offset-2 hover:underline">
          mapa de procesos
        </Link>
        .
      </p>
    </div>
  );
}

function SinResultados({
  parametros,
  hayFiltros,
}: {
  parametros: Parametros;
  hayFiltros: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
      <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-foreground">
          No se encontraron documentos vigentes
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Revise la ortografía o pruebe con menos palabras
          {hayFiltros ? ", o quite algún filtro" : ""}.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {hayFiltros && (
          <Link
            href={urlBusqueda(parametros, {
              tipo: null,
              proceso: null,
              sub: null,
              desde: null,
              hasta: null,
            })}
            className="inline-block rounded-full border border-azul bg-azul/5 px-3 py-1.5 text-xs font-medium text-marca transition-colors hover:bg-azul/10"
          >
            Quitar los filtros
          </Link>
        )}
        {SUGERENCIAS.map((sugerencia) => (
          <Link
            key={sugerencia}
            href={`/buscar?q=${encodeURIComponent(sugerencia)}`}
            className="inline-block rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-azul hover:text-marca"
          >
            {sugerencia}
          </Link>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Si el documento debería existir, repórtelo a la oficina de Calidad — las
        búsquedas sin resultados quedan registradas para completar la
        documentación.
      </p>
    </div>
  );
}
