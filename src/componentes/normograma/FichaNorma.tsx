import Link from "next/link";
import { FileText, Pencil } from "lucide-react";
import { EliminarArchivo } from "@/componentes/admin/EliminarArchivo";
import { ZonaCarga } from "@/componentes/admin/ZonaCarga";
import { formatearTamano } from "@/componentes/documentos/IconoFormato";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import type { DocumentoGestionable } from "@/db/consultas/normograma/asociaciones";
import type { Norma } from "@/db/consultas/normograma/lectura";
import { fechaDeNorma } from "@/lib/normograma/tipos";
import { InsigniaNorma } from "./TablaNormas";
import { SECCION, SeccionAdministrar, SeccionDocumentos, SeccionEstado, SeccionProcesos, SeccionRelaciones } from "./SeccionesNorma";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/** Lo que la ficha ofrece a la persona; vacío para quien solo lee. */
export type OpcionesFicha = {
  /** Los procesos activos que puede asociar y aún no lo están. */
  procesos: { id: number; nombre: string; sigla: string }[];
  /** Los documentos que puede enlazar (no enlazados) o desenlazar (enlazados). */
  documentos: DocumentoGestionable[];
  /** Las normas que pueden ser la afectada de una relación nueva (solo para quien administra). */
  normas: { id: number; nombre: string; titulo: string }[];
  /** Hoy, `yyyy-mm-dd` en la zona de la instalación. */
  hoy: string;
};

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

const rutaDelPdf = (n: Norma, a: NonNullable<Norma["archivo"]>) =>
  `/normograma/${n.id}/archivos/${a.id}/${encodeURIComponent(a.nombreOriginal)}`;

function SeccionDatos({ norma: n, administra }: { norma: Norma; administra: boolean }) {
  return (
    <section aria-labelledby="norma-datos" className={SECCION}>
      <h2 id="norma-datos" className="text-sm font-semibold">
        Datos de la norma
      </h2>
      <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
        <Dato etiqueta="Tipo, número y año">{n.nombre}</Dato>
        <Dato etiqueta="Fecha de expedición">{n.fechaExpedicion ? fechaDeNorma(n.fechaExpedicion) : "Sin fecha registrada"}</Dato>
        <Dato etiqueta="Entidad emisora">{n.entidadEmisora}</Dato>
        <Dato etiqueta="Título o epígrafe">{n.titulo}</Dato>
        <div className="min-w-0 sm:col-span-2">
          <Dato etiqueta="Tema o resumen">
            <span className="whitespace-pre-line">{n.tema ?? "Sin tema registrado"}</span>
          </Dato>
        </div>
        <div className="min-w-0 sm:col-span-2">
          <Dato etiqueta="Enlace oficial">
            {/* Texto para copiar, nunca un hipervínculo hacia fuera: la app no sale a internet (F13C-DC19). */}
            {n.enlaceOficial ? <span className="select-all break-all font-mono text-xs">{n.enlaceOficial}</span> : "Sin enlace registrado"}
          </Dato>
        </div>
        {n.notas ? (
          <div className="min-w-0 sm:col-span-2">
            <Dato etiqueta="Notas">
              <span className="whitespace-pre-line">{n.notas}</span>
            </Dato>
          </div>
        ) : null}
        <div className="min-w-0 sm:col-span-2">
          <Dato etiqueta="Texto de la norma (PDF)">
            {n.archivo ? (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {/* Un <a>, como las demás rutas de archivos: el enrutador pediría primero el PDF como página. */}
                <a
                  href={rutaDelPdf(n, n.archivo)}
                  target="_blank"
                  rel="noopener"
                  className={`inline-flex items-center gap-1 rounded underline underline-offset-2 ${FOCO}`}
                >
                  <FileText aria-hidden="true" className="size-4" />
                  {`Abrir el PDF · ${formatearTamano(n.archivo.tamanoBytes)}`}
                </a>
                {administra ? (
                  <EliminarArchivo direccion={`/api/normas/${n.id}/archivos/${n.archivo.id}`} nombre={n.archivo.nombreOriginal} de="de la norma" />
                ) : null}
              </span>
            ) : (
              "Sin PDF adjunto"
            )}
          </Dato>
        </div>
      </dl>
      {administra ? (
        <details className="rounded-md border border-border p-2">
          <summary className={`cursor-pointer rounded text-sm font-medium ${FOCO}`}>
            {n.archivo ? "Reemplazar el PDF" : "Adjuntar el PDF"}
          </summary>
          <div className="mt-2">
            <ZonaCarga direccion={`/api/normas/${n.id}/archivos`} soloPdf />
          </div>
        </details>
      ) : null}
    </section>
  );
}

/**
 * La ficha de una norma (spec 13C §10.6, maqueta 8), para toda sesión: datos, estado con su historial, relaciones en los
 * dos sentidos, procesos con su requisito, documentos internos y externos enlazados (los que la persona no ve, sin
 * código ni título) y el PDF; y lo que la persona puede hacer. Una retirada conserva su ficha, sin acciones.
 */
export function FichaNorma({ norma: n, opciones }: { norma: Norma; opciones: OpcionesFicha }) {
  const retirada = n.estado === "retirada";
  const administra = n.acciones.administrar && !retirada;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <EncabezadoPagina
        migas={[{ nombre: "Normograma", href: "/normograma" }, { nombre: n.nombre }]}
        titulo={n.nombre}
        descripcion={n.titulo}
        insignias={<InsigniaNorma estado={n.estado} estadoEn={n.estadoEn} />}
        acciones={
          administra ? (
            <Link href={`/normograma/${n.id}/editar`} className={`${claseBoton("secundario")} ${FOCO}`}>
              <Pencil aria-hidden="true" className="size-4" />
              Editar
            </Link>
          ) : undefined
        }
      />
      {retirada ? (
        <p role="note" className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
          {`Esta norma fue retirada${n.estadoEn ? ` el ${fechaDeNorma(n.estadoEn)}` : ""}: no aparece en las listas ni en la búsqueda y no admite cambios. Su historia se conserva.`}
        </p>
      ) : null}
      {/* Una sola columna, en el orden en que se lee y se recorre con el teclado. */}
      <div className="flex min-w-0 max-w-4xl flex-col gap-6">
        <SeccionDatos norma={n} administra={administra} />
        <SeccionEstado norma={n} administra={administra} hoy={opciones.hoy} />
        <SeccionRelaciones norma={n} administra={administra} normas={opciones.normas} />
        <SeccionProcesos norma={n} abierta={!retirada} procesos={opciones.procesos} />
        <SeccionDocumentos norma={n} abierta={!retirada} documentos={opciones.documentos} />
        {administra ? <SeccionAdministrar norma={n} /> : null}
      </div>
    </div>
  );
}
