import Link from "next/link";
import { FormularioConfirmar } from "@/componentes/distribucion/acuses/FormularioConfirmar";
import { claseBoton } from "@/componentes/ui/Boton";
import { Insignia } from "@/componentes/ui/Insignia";
import type { Acuse } from "@/db/consultas/distribucion/acuses";
import { zonaHoraria } from "@/lib/zona-horaria";

export function fechaLarga(fecha: Date): string {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: zonaHoraria() }).format(fecha);
}

function queCambio(acuse: Acuse): string {
  if (acuse.queCambio) return acuse.queCambio;
  if (acuse.version === 1) return "Documento nuevo";
  return acuse.publicadoEn ? `Versión ${acuse.version}, vigente desde ${fechaLarga(acuse.publicadoEn)}` : `Versión ${acuse.version}`;
}

/** La tarea de leer una versión nueva (maqueta 2 de la entrega 13B). */
export function TareaAcuse({ acuse }: { acuse: Acuse }) {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <section aria-labelledby="titulo-que-cambio" className="rounded-xl border border-border bg-card p-4 shadow-xs">
        <h2 id="titulo-que-cambio" className="text-sm font-semibold">
          Qué cambió
        </h2>
        <p className="mt-1 whitespace-pre-line break-words text-sm">{queCambio(acuse)}</p>
        <h2 className="mt-4 text-sm font-semibold">Le llega porque</h2>
        <p className="mt-1 text-sm">{`Usted ${acuse.porQue}.`}</p>
        <p className="mt-4 text-sm text-muted-foreground">{`Plazo para confirmar: ${fechaLarga(acuse.venceEn)}`}</p>
      </section>

      <section aria-labelledby="titulo-confirmar" className="rounded-xl border border-border bg-card p-4 shadow-xs">
        <h2 id="titulo-confirmar" className="mb-3 text-sm font-semibold">
          Confirmar la lectura
        </h2>
        <Link href={`/documentos/${acuse.codigo.toLowerCase()}`} className={`mb-4 ${claseBoton("secundario")}`}>
          Abrir el documento
        </Link>
        {acuse.estado === "confirmado" ? (
          <p className="text-sm">
            <Insignia variante="bien">{`Lectura confirmada el ${fechaLarga(acuse.confirmadoEn ?? acuse.creadoEn)}`}</Insignia>
          </p>
        ) : acuse.estado === "pendiente" ? (
          <FormularioConfirmar acuseId={acuse.id} version={acuse.version} abierto={acuse.abierto} />
        ) : (
          <p className="text-sm text-muted-foreground">Esta lectura ya no está pendiente.</p>
        )}
      </section>
    </div>
  );
}
