import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccionesCopia } from "@/componentes/distribucion/copias/AccionesCopia";
import { HistorialCopia } from "@/componentes/distribucion/copias/HistorialCopia";
import { InsigniaCopia, fechaCorta } from "@/componentes/distribucion/copias/TablaCopias";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { obtenerCopia } from "@/db/consultas/distribucion/copias";
import { numeroDeCopia } from "@/lib/distribucion/copias";
import { ETIQUETA_MOTIVO_ANULACION, ETIQUETA_MOTIVO_POR_RECOGER } from "@/lib/distribucion/tipos";
import { exigirSesion } from "@/lib/paginas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Copia controlada" };

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="break-words text-sm">{children}</dd>
    </div>
  );
}

export default async function PaginaCopia({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await exigirSesion();
  const { id } = await params;
  if (!/^\d{1,15}$/.test(id)) notFound();
  // Quien no la ve (la consulta decide: alcance, responsable del punto o quien la emitió) recibe «no encontrado».
  const copia = await obtenerCopia(Number(id), sesion);
  if (!copia) notFound();
  const { imprimir } = await searchParams;
  const ahora = new Date();
  const reemplazada = copia.reemplazaCopiaId === null ? null : await obtenerCopia(copia.reemplazaCopiaId, sesion);
  const reemplazo = reemplazada && reemplazada.estado === "por_recoger"
    ? { numero: numeroDeCopia(reemplazada.numero), version: reemplazada.version }
    : null;
  const numero = numeroDeCopia(copia.numero);

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <EncabezadoPagina
        codigo={`${copia.codigo} v${copia.version}`}
        titulo={`Copia controlada N.º ${numero}`}
        descripcion={`${copia.titulo} · ${copia.punto.nombre}`}
        insignias={<InsigniaCopia copia={copia} ahora={ahora} />}
        migas={[{ nombre: "Distribución", href: "/distribucion/copias" }, { nombre: `Copia N.º ${numero}` }]}
        tituloEnfocable
      />

      {imprimir === "1" && copia.acciones.includes("pdf") ? (
        <section aria-labelledby="titulo-imprimir" className="rounded-xl border border-marca bg-card p-4">
          <h2 id="titulo-imprimir" className="text-sm font-semibold">
            La copia está lista para imprimir
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Abra el PDF sellado e imprímalo. Tiene 15 minutos desde que se emitió; pasado ese tiempo, la
            reimpresión pide un motivo y queda registrada.
          </p>
          <a
            href={`/distribucion/copias/${copia.id}/pdf`}
            target="_blank"
            rel="noopener"
            className={`mt-3 ${claseBoton("primario")}`}
          >
            Abrir el PDF para imprimir
          </a>
        </section>
      ) : null}

      <AccionesCopia
        copiaId={copia.id}
        acciones={copia.acciones}
        nuncaRecibida={copia.fechas.recibidaEn === null}
        reemplazo={reemplazo}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
        <section aria-labelledby="titulo-datos-copia" className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <h2 id="titulo-datos-copia" className="mb-3 text-sm font-semibold">
            Datos de la copia
          </h2>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
            <Dato etiqueta="Documento">
              <Link href={`/documentos/${copia.codigo.toLowerCase()}`} className="underline underline-offset-2">
                {`${copia.codigo} v${copia.version}`}
              </Link>
              {copia.versionVigente ? " · versión vigente" : " · ya no es la versión vigente"}
            </Dato>
            <Dato etiqueta="Punto de uso">{copia.punto.sede ? `${copia.punto.nombre} · ${copia.punto.sede}` : copia.punto.nombre}</Dato>
            <Dato etiqueta="Entregada a">
              {copia.responsable.cargo ? `${copia.responsable.nombre}, ${copia.responsable.cargo}` : copia.responsable.nombre}
            </Dato>
            <Dato etiqueta="Responsable actual del punto">{copia.responsableActual.nombre}</Dato>
            <Dato etiqueta="Emitida por">{`${copia.emitidaPor.nombre} · ${fechaCorta(copia.emitidaEn)}`}</Dato>
            <Dato etiqueta="Huella del PDF impreso">
              <span className="font-mono text-xs">{copia.hashPrincipal.slice(0, 16)}…</span>
            </Dato>
            {copia.nota ? <Dato etiqueta="Nota">{copia.nota}</Dato> : null}
            {copia.motivoPorRecoger ? (
              <Dato etiqueta="Por recoger porque">{ETIQUETA_MOTIVO_POR_RECOGER[copia.motivoPorRecoger]}</Dato>
            ) : null}
            {copia.motivoAnulacion ? (
              <Dato etiqueta="Motivo de la anulación">
                {ETIQUETA_MOTIVO_ANULACION[copia.motivoAnulacion as keyof typeof ETIQUETA_MOTIVO_ANULACION] ?? copia.motivoAnulacion}
              </Dato>
            ) : null}
            {reemplazada ? (
              <Dato etiqueta="Reemplaza a">
                <Link href={`/distribucion/copias/${reemplazada.id}`} className="underline underline-offset-2">
                  {`Copia N.º ${numeroDeCopia(reemplazada.numero)} de la v${reemplazada.version}`}
                </Link>
              </Dato>
            ) : null}
          </dl>
        </section>
        <HistorialCopia eventos={copia.eventos} />
      </div>
    </div>
  );
}
