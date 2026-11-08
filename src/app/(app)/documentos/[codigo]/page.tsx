import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  ClipboardList,
  Download,
  Eye,
  Link2,
  Lock,
  MapPin,
  PencilLine,
} from "lucide-react";
import {
  formatearTamano,
  formatoDesdeMime,
} from "@/componentes/documentos/IconoFormato";
import { BloqueDistribucion } from "@/componentes/distribucion/BloqueDistribucion";
import { AvisoVersionQr, versionDeQr } from "@/componentes/documentos/AvisoVersionQr";
import { DatosDeAprobacion } from "@/componentes/documentos/DatosDeAprobacion";
import { VisorPdf } from "@/componentes/documentos/VisorPdf";
import { Migas } from "@/componentes/navegacion/Migas";
import { MiniMapa } from "@/componentes/navegacion/MiniMapa";
import { claseBoton } from "@/componentes/ui/Boton";
import { Insignia } from "@/componentes/ui/Insignia";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import {
  type ArchivoFicha,
  obtenerFichaDocumento,
} from "@/db/consultas/documentos";
import { registrarEventoConsulta } from "@/db/consultas/eventos";
import { puedePedirSobreDocumento } from "@/db/consultas/tramites";
import { ipDePeticion } from "@/lib/ip";
import { exigirSesion } from "@/lib/paginas";

export const dynamic = "force-dynamic";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// "2026-03-12" → "12 de marzo de 2026" sin pasar por Date (evita sorpresas
// de zona horaria con columnas date).
function formatearFecha(fecha: string | null): string {
  if (!fecha) return "—";
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return `${dia} de ${MESES[mes - 1]} de ${anio}`;
}

const ETIQUETA_ROL: Record<ArchivoFicha["rol"], string> = {
  principal: "Documento de lectura",
  editable: "Versión para diligenciar",
  anexo: "Anexo",
};

export default async function FichaDocumento({
  params,
  searchParams,
}: {
  params: Promise<{ codigo: string }>;
  searchParams: Promise<{ v?: string | string[] }>;
}) {
  const sesion = await exigirSesion();
  const { codigo } = await params;
  const versionDeCopia = versionDeQr((await searchParams).v);

  const ficha = await obtenerFichaDocumento(codigo, sesion);
  if (!ficha) notFound();

  // Trazabilidad D8: la consulta de la ficha queda en la bitácora de
  // eventos; si falla, la página igual responde.
  const cabeceras = await headers();
  await registrarEventoConsulta({
    tipo: "vista",
    documentoId: ficha.id,
    versionId: ficha.version.id,
    usuarioId: sesion.usuarioId,
    ip: ipDePeticion(cabeceras),
    userAgent: cabeceras.get("user-agent"),
  }).catch((err) => console.error("No se pudo registrar la vista:", err));

  const puedePedirCambio = await puedePedirSobreDocumento(sesion, ficha.id);
  const principal = ficha.ubicaciones.find((u) => u.esPrincipal);
  const pdf = ficha.archivos.find((a) => a.mime === "application/pdf");
  const rutaBase = `/documentos/${ficha.codigo.toLowerCase()}`;

  // URL del archivo con el nombre real al final: el visor de PDF embebido del
  // navegador (y extensiones/gestores de descarga) derivan el nombre de la
  // URL, no siempre del Content-Disposition. Sin esto algunos lo guardan con
  // un GUID sin extensión. El archivo se resuelve por id; el nombre es cosmético.
  const urlArchivo = (id: number, nombre: string, descarga = false) =>
    `${rutaBase}/archivos/${id}/${encodeURIComponent(nombre)}${descarga ? "?descarga=1" : ""}`;

  return (
    <div
      className="max-w-5xl"
      style={
        { "--color-banda": principal?.color ?? "var(--marca-relleno)" } as React.CSSProperties
      }
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Migas
          items={
            principal
              ? [
                  ...(principal.proceso
                    ? [
                        {
                          nombre: principal.proceso,
                          href: principal.url.split("/").slice(0, 3).join("/"),
                        },
                      ]
                    : []),
                  { nombre: principal.nombre, href: principal.url },
                  { nombre: ficha.codigo },
                ]
              : [{ nombre: ficha.codigo }]
          }
        />
        {principal && (
          <MiniMapa banda={principal.banda} nombreMacro={principal.macroNombre} />
        )}
      </div>

      <AvisoVersionQr solicitada={versionDeCopia} vigente={ficha.version.numero} />

      <EncabezadoPagina
        codigo={ficha.codigo}
        insignias={
          <>
            <span className="rounded-full banda-tinte px-2.5 py-0.5 text-xs font-medium banda-texto">
              {ficha.tipo.nombre}
            </span>
            <Insignia variante="bien" icono={BadgeCheck}>
              Vigente · versión {ficha.version.numero}
            </Insignia>
            {ficha.tipo.esDiligenciable && (
              <Insignia variante="neutra" icono={PencilLine}>
                Diligenciable
              </Insignia>
            )}
            {ficha.nivelAcceso === "restringido" && (
              <Insignia variante="atencion" icono={Lock}>
                Acceso restringido
              </Insignia>
            )}
          </>
        }
        titulo={ficha.titulo}
        descripcion={ficha.descripcion || undefined}
        acciones={
          puedePedirCambio ? (
            <Link
              href={`/tramites/nueva?documento=${encodeURIComponent(ficha.codigo)}`}
              className={`${claseBoton("secundario")} print:hidden`}
            >
              <ClipboardList className="size-4" aria-hidden="true" />
              Solicitar cambio
            </Link>
          ) : undefined
        }
      />

      <div className="mt-2 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_minmax(280px,340px)]">
        {/* En pantallas angostas (una columna) la información va primero y la
            vista previa al final: entrar directo al documento muestra todo el
            contenido sin tener que pasar por encima del visor. */}
        <div className="order-2 min-w-0 lg:order-1">
          {pdf ? (
            <section aria-label="Vista previa del documento">
              <VisorPdf
                src={urlArchivo(pdf.id, pdf.nombreOriginal)}
                urlDescarga={urlArchivo(pdf.id, pdf.nombreOriginal, true)}
                nombreDescarga={pdf.nombreOriginal}
                titulo={ficha.titulo}
              />
            </section>
          ) : (
            <p className="rounded-xl border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
              Este documento no tiene vista previa en el navegador — descárguelo
              desde el panel de archivos.
            </p>
          )}
        </div>

        <div className="order-1 flex min-w-0 flex-col gap-6 lg:order-2">
          <section
            aria-labelledby="titulo-archivos"
            className="rounded-xl border border-border bg-card p-4 shadow-xs"
          >
            <h2
              id="titulo-archivos"
              className="mb-3 text-sm font-semibold text-foreground"
            >
              Archivos
            </h2>
            <ul className="flex list-none flex-col gap-2.5">
              {ficha.archivos.map((archivo) => {
                const formato = formatoDesdeMime(archivo.mime);
                return (
                  <li
                    key={archivo.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">
                        {ETIQUETA_ROL[archivo.rol]}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {formato.etiqueta} · {formatearTamano(archivo.tamanoBytes)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {archivo.mime === "application/pdf" && (
                        <a
                          href={urlArchivo(archivo.id, archivo.nombreOriginal)}
                          target="_blank"
                          rel="noopener"
                          aria-label={`Abrir ${ETIQUETA_ROL[archivo.rol]} (${formato.etiqueta}) en una pestaña nueva`}
                          className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          <Eye className="size-4" aria-hidden="true" />
                        </a>
                      )}
                      <a
                        href={urlArchivo(archivo.id, archivo.nombreOriginal, true)}
                        download={archivo.nombreOriginal}
                        aria-label={`Descargar ${ETIQUETA_ROL[archivo.rol]} (${formato.etiqueta}, ${formatearTamano(archivo.tamanoBytes)})`}
                        className="inline-flex items-center gap-1.5 rounded-lg banda-solido px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-banda)]"
                      >
                        <Download className="size-3.5" aria-hidden="true" />
                        Descargar
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section
            aria-labelledby="titulo-control"
            className="rounded-xl border border-border bg-card p-4 shadow-xs"
          >
            <h2
              id="titulo-control"
              className="mb-3 text-sm font-semibold text-foreground"
            >
              Control del documento
            </h2>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 text-sm">
              <CampoControl etiqueta="Elaboró" valor={ficha.version.elaboro} />
              <CampoControl
                etiqueta="Fecha de elaboración"
                valor={formatearFecha(ficha.version.fechaElaboracion)}
              />
              <CampoControl etiqueta="Revisó" valor={ficha.version.reviso} />
              <CampoControl
                etiqueta="Fecha de revisión"
                valor={formatearFecha(ficha.version.fechaRevision)}
              />
              <CampoControl etiqueta="Aprobó" valor={ficha.version.aprobo} />
              <CampoControl
                etiqueta="Fecha de aprobación"
                valor={formatearFecha(ficha.version.fechaAprobacion)}
              />
              {ficha.version.resumenCambios && (
                <CampoControl
                  etiqueta="Cambios de esta versión"
                  valor={ficha.version.resumenCambios}
                />
              )}
              <DatosDeAprobacion origen={ficha.version.origenAprobacion} tramiteId={ficha.version.tramiteId} />
            </dl>
          </section>

          <BloqueDistribucion documento={{ id: ficha.id, codigo: ficha.codigo, titulo: ficha.titulo }} sesion={sesion} />

          <section aria-labelledby="titulo-ubicaciones">
            <h2
              id="titulo-ubicaciones"
              className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"
            >
              <MapPin className="size-4 text-muted-foreground" aria-hidden="true" />
              Dónde aplica
            </h2>
            <ul className="flex list-none flex-wrap gap-1.5">
              {ficha.ubicaciones.map((u) => (
                <li key={u.url + u.nombre}>
                  <Link
                    href={u.url}
                    className={
                      u.esPrincipal
                        ? "inline-flex items-center gap-1 rounded-full banda-solido px-3 py-1 text-xs font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-banda)]"
                        : "inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground/85 hover:border-[var(--color-banda)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-banda)]"
                    }
                  >
                    {u.proceso ? `${u.proceso} · ${u.nombre}` : u.nombre}
                    {u.esPrincipal && (
                      <span className="font-normal">· propietario</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {ficha.relacionados.length > 0 && (
            <section aria-labelledby="titulo-relacionados">
              <h2
                id="titulo-relacionados"
                className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"
              >
                <Link2 className="size-4 text-muted-foreground" aria-hidden="true" />
                Documentos relacionados
              </h2>
              <ul className="flex list-none flex-col gap-2">
                {ficha.relacionados.map((rel) => (
                  <li key={rel.codigo}>
                    <Link
                      href={`/documentos/${rel.codigo.toLowerCase()}`}
                      className="group flex flex-col gap-0.5 rounded-lg border border-border bg-card px-3 py-2 shadow-xs transition-colors hover:border-[var(--color-banda)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-banda)]"
                    >
                      <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
                        {rel.codigo} · {rel.tipo}
                      </span>
                      <span className="text-sm/snug font-medium text-foreground group-hover:banda-texto">
                        {rel.titulo}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function CampoControl({
  etiqueta,
  valor,
}: {
  etiqueta: string;
  valor: string | null;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="text-sm text-foreground">{valor ?? "—"}</dd>
    </div>
  );
}
