import Link from "next/link";
import { Megaphone, Paperclip } from "lucide-react";
import { ArchivosDe, type ArchivoParaLista } from "@/componentes/mejoramiento/ArchivosDe";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { Insignia, type VarianteInsignia } from "@/componentes/ui/Insignia";
import type { MiReporte } from "@/db/consultas/mejoramiento/reportes";
import { fechaDeDia, fechaYHora } from "@/lib/mejoramiento/formato";
import { rutaDeReportar, type EtiquetaDeReporte } from "@/lib/mejoramiento/reportes";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

const VARIANTE: Record<EtiquetaDeReporte, VarianteInsignia> = {
  Recibido: "neutra",
  "En trámite": "modulo",
  Cerrado: "bien",
  Descartado: "sin-dato",
};

/** La etiqueta de un reporte para quien lo envió: siempre con su texto (spec 15 §7.3). */
export function EtiquetaDelReporte({ etiqueta }: { etiqueta: EtiquetaDeReporte }) {
  return (
    <Insignia variante={VARIANTE[etiqueta]} modulo="planes">
      {etiqueta}
    </Insignia>
  );
}

/**
 * «Mis reportes» (spec 15 §7.3 y §16.1): los reportes que envió la persona, del más reciente al más antiguo, cada uno con su
 * etiqueta y, si se descartó, el motivo. Nada del hallazgo: ni su código, ni su título, ni un enlace. Mientras sigue «Recibido» y
 * tiene menos de tres archivos, se le pueden adjuntar más. Pensado para el teléfono: una tarjeta por reporte.
 */
export function MisReportes({
  reportes,
  zona,
}: {
  reportes: ReadonlyArray<{ reporte: MiReporte; archivos: ArchivoParaLista[] }>;
  zona: string;
}) {
  if (reportes.length === 0) {
    return (
      <EstadoVacio
        icono={Megaphone}
        titulo="Aún no ha enviado reportes"
        texto="Si ve algo que no se está haciendo como debe (una posible no conformidad), repórtelo: el Administrador del SGC lo revisa y le cuenta en qué terminó."
        accion={{ href: rutaDeReportar(), etiqueta: "Reportar una posible no conformidad" }}
      />
    );
  }
  return (
    <ul className="flex list-none flex-col gap-3" aria-label="Mis reportes">
      {reportes.map(({ reporte: r, archivos }) => (
        <li key={r.id} className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <EtiquetaDelReporte etiqueta={r.etiqueta} />
            <span className="text-xs text-muted-foreground">{`Enviado el ${fechaYHora(r.cuando, zona)}`}</span>
          </div>
          <p className="whitespace-pre-line break-words text-sm">{r.descripcion}</p>
          <p className="text-xs text-muted-foreground">{`Lo vio el ${fechaDeDia(r.vistoEn)}`}</p>
          {r.motivo ? (
            <p className="whitespace-pre-line break-words border-l-2 border-mod-planes pl-3 text-sm">{`Motivo: ${r.motivo}`}</p>
          ) : null}
          {archivos.length > 0 ? <ArchivosDe archivos={archivos} /> : null}
          {r.puedeAdjuntar ? (
            <Link
              href={rutaDeReportar(r.id)}
              className={`inline-flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium text-marca underline-offset-2 hover:underline ${FOCO}`}
            >
              <Paperclip aria-hidden="true" className="size-4" />
              Adjuntar archivos
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
