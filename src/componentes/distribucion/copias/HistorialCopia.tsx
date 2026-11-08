import type { EventoCopia } from "@/db/consultas/distribucion/copias";
import {
  ETIQUETA_DESTINO,
  ETIQUETA_MOTIVO_ANULACION,
  ETIQUETA_MOTIVO_POR_RECOGER,
  ETIQUETA_MOTIVO_REIMPRESION,
  type DestinoRecogida,
  type MotivoAnulacion,
  type MotivoPorRecoger,
  type MotivoReimpresion,
} from "@/lib/distribucion/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";

const FRASES: Record<EventoCopia["tipo"], string> = {
  emitida: "emitió la copia",
  impresa: "abrió el PDF para imprimir",
  consultada: "consultó el PDF",
  reimpresa: "reimprimió la copia",
  recibida: "confirmó el recibido",
  por_recoger: "dejó la copia por recoger",
  recogida: "confirmó la recogida",
  anulada: "anuló la copia",
};

function frase(e: EventoCopia): string {
  if (e.tipo === "por_recoger" && !e.usuario) return "La copia quedó por recoger";
  const hecho = FRASES[e.tipo];
  return e.usuario ? `${e.usuario} ${hecho}` : hecho.charAt(0).toUpperCase() + hecho.slice(1);
}

function detalleDe(e: EventoCopia): string[] {
  const d = e.detalle;
  const lineas: string[] = [];
  if (e.tipo === "emitida" && d.recibidaEnElActo === true) lineas.push("Recibida en el acto por quien responde por el punto");
  if (e.tipo === "por_recoger" && typeof d.motivo === "string") {
    lineas.push(ETIQUETA_MOTIVO_POR_RECOGER[d.motivo as MotivoPorRecoger] ?? d.motivo);
  }
  if (e.tipo === "recogida" && typeof d.destino === "string") {
    lineas.push(ETIQUETA_DESTINO[d.destino as DestinoRecogida] ?? d.destino);
  }
  if (e.tipo === "anulada" && typeof d.motivo === "string") {
    lineas.push(`Motivo: ${ETIQUETA_MOTIVO_ANULACION[d.motivo as MotivoAnulacion] ?? d.motivo}`);
  }
  if (e.tipo === "reimpresa" && typeof d.motivo === "string") {
    lineas.push(`Motivo: ${ETIQUETA_MOTIVO_REIMPRESION[d.motivo as MotivoReimpresion] ?? d.motivo}`);
  }
  if (typeof d.texto === "string") lineas.push(d.texto);
  return lineas;
}

export function HistorialCopia({ eventos }: { eventos: EventoCopia[] }) {
  const cuando = new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zonaHoraria(),
  });
  return (
    <section aria-labelledby="titulo-historial-copia" className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <h2 id="titulo-historial-copia" className="mb-3 text-sm font-semibold">
        Historial
      </h2>
      <ol className="flex list-none flex-col gap-2.5">
        {eventos.map((e, i) => (
          <li key={i} className="text-sm">
            <span className="block text-xs text-muted-foreground">{cuando.format(e.creadoEn)}</span>
            {frase(e)}
            {detalleDe(e).map((linea) => (
              <span key={linea} className="block whitespace-pre-wrap break-words text-xs text-muted-foreground">
                {linea}
              </span>
            ))}
          </li>
        ))}
      </ol>
    </section>
  );
}
