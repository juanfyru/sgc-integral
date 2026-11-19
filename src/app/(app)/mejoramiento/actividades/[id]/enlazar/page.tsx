import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SearchX } from "lucide-react";
import { enlazarTramiteAccion } from "@/app/acciones-mejoramiento";
import { BotonDelEnlace } from "@/componentes/mejoramiento/actividad/BotonDelEnlace";
import { Boton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { Insignia } from "@/componentes/ui/Insignia";
import { candidatosParaEnlazar, terminoBien, TRAMITES_POR_PAGINA } from "@/db/consultas/mejoramiento/tramites-enlace";
import { fechaDeDia } from "@/lib/mejoramiento/formato";
import { rutaDeEnlazarTramite } from "@/lib/mejoramiento/rutas";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { ETIQUETA_ETAPA, ETIQUETA_TIPO_SOLICITUD, type Etapa, type TipoSolicitud } from "@/lib/tramites/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { exigirActividad, rutaDeActividad, rutaDeHallazgo } from "../../../_comun";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Enlazar un trámite" };

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/**
 * «Enlazar un trámite que ya existe» (Fase 15B, anexo §9.3): un formulario `GET` para buscar por número, código o título y, por cada
 * trámite que sirve (los que la persona ve, en curso o que terminaron bien, sin otra actividad y pedidos desde el día en que se detectó
 * el hallazgo: `candidatosParaEnlazar`), un botón que lo enlaza y vuelve a la actividad. A quien no abre la actividad, o no solicita
 * trámites, «no encontrado»; si la actividad ya no admite el enlace, vuelve a ella.
 */
export default async function PaginaEnlazarTramite({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await exigirSesion();
  const { id } = await params;
  const a = await exigirActividad(sesion, id);
  if (!puede(sesion, "tramites.solicitar")) notFound();
  if (!a.cambioDocumental.puedePedir) redirect(rutaDeActividad(a.id));
  const crudo = (await searchParams).q;
  const q = (Array.isArray(crudo) ? crudo[0] : crudo)?.trim().slice(0, 100) || undefined;
  const candidatos = await candidatosParaEnlazar(sesion, a.id, q);
  const zona = zonaHoraria();
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        migas={[
          { nombre: "Mejoramiento", href: "/mejoramiento" },
          ...(a.hallazgo.ve === "completo" ? [{ nombre: a.hallazgo.codigo, href: rutaDeHallazgo(a.hallazgo.id) }] : []),
          { nombre: a.etiqueta, href: rutaDeActividad(a.id) },
          { nombre: "Enlazar un trámite" },
        ]}
        codigo={`${a.hallazgo.codigo} · ${a.etiqueta}`}
        titulo="Enlazar un trámite que ya existe"
        descripcion="Los trámites que usted ve, en curso o que terminaron publicados o eliminados, que no atienden otra actividad y se pidieron desde el día en que se detectó el hallazgo."
      />
      <form method="get" action={rutaDeEnlazarTramite(a.id)} role="search" aria-label="Buscar trámites para enlazar" className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label htmlFor="enlazar-q" className="text-sm font-medium">
            Buscar
          </label>
          <input id="enlazar-q" name="q" type="search" defaultValue={q ?? ""} placeholder="Número, código o título" maxLength={100} className={claseControl} />
        </div>
        <div className="flex gap-2 pb-0.5">
          <Boton type="submit" variante="secundario">
            Buscar
          </Boton>
          <Link
            href={rutaDeEnlazarTramite(a.id)}
            className={`inline-flex items-center rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground ${FOCO}`}
          >
            Quitar
          </Link>
        </div>
      </form>
      {candidatos.length === 0 ? (
        <EstadoVacio
          icono={SearchX}
          titulo="Ningún trámite para enlazar"
          texto="No hay trámites que coincidan con la búsqueda. Los rechazados, los cancelados y los que ya atienden otra actividad no se enlazan."
        />
      ) : (
        <>
          {candidatos.length === TRAMITES_POR_PAGINA ? (
            <p className="text-sm text-muted-foreground">{`Se muestran los ${TRAMITES_POR_PAGINA} más recientes: afine la búsqueda para ver otros.`}</p>
          ) : null}
          <ul className="flex list-none flex-col gap-2" aria-label="Trámites que se pueden enlazar">
            {candidatos.map((t) => {
              const etapa = ETIQUETA_ETAPA[t.etapa as Etapa] ?? t.etapa;
              return (
                <li key={t.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">
                      <Link href={`/tramites/${t.id}`} className={`rounded-sm font-mono text-xs font-medium text-marca underline-offset-2 hover:underline ${FOCO}`}>
                        {t.numero}
                      </Link>{" "}
                      <span className="font-semibold">{ETIQUETA_TIPO_SOLICITUD[t.tipo as TipoSolicitud] ?? t.tipo}</span>{" "}
                      <span className="break-words">{t.documento}</span>
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Insignia variante={terminoBien(t.etapa) ? "bien" : "neutra"}>{terminoBien(t.etapa) ? etapa : `En ${etapa.toLowerCase()}`}</Insignia>
                      <span>{`Pedido el ${fechaDeDia(fechaEnZona(t.solicitadoEn, zona))}`}</span>
                    </span>
                  </span>
                  <BotonDelEnlace
                    ocultos={{ actividadId: a.id, tramiteId: t.id }}
                    texto="Enlazar"
                    enviando="Enlazando…"
                    etiqueta={`Enlazar ${t.numero} a la actividad ${a.etiqueta}`}
                    accion={enlazarTramiteAccion}
                  />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
