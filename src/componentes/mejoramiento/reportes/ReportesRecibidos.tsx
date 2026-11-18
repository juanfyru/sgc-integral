import Link from "next/link";
import { Inbox } from "lucide-react";
import type { EstadoAccion } from "@/app/admin/comun";
import { ArchivosDe, type ArchivoParaLista } from "@/componentes/mejoramiento/ArchivosDe";
import { ClasificarReporte, type ParecidoDelReporte } from "@/componentes/mejoramiento/reportes/ClasificarReporte";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { Insignia, type VarianteInsignia } from "@/componentes/ui/Insignia";
import type { ReporteDeLaLista } from "@/db/consultas/mejoramiento/reportes";
import { fechaDeDia, fechaYHora } from "@/lib/mejoramiento/formato";
import { DIAS_DE_CLASIFICADOS, type EstadoReporte } from "@/lib/mejoramiento/reportes";
import { rutaDeHallazgo } from "@/lib/mejoramiento/rutas";
import { fechaEnZona } from "@/lib/tramites/plazos";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

type Accion = (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;

const ESTADO: Record<EstadoReporte, { texto: string; variante: VarianteInsignia }> = {
  recibido: { texto: "Por clasificar", variante: "atencion" },
  convertido: { texto: "Convertido en hallazgo", variante: "modulo" },
  sumado: { texto: "Añadido a un hallazgo", variante: "modulo" },
  descartado: { texto: "Descartado", variante: "sin-dato" },
};

export type FilaDeReporteRecibido = {
  reporte: ReporteDeLaLista;
  archivos: ArchivoParaLista[];
  /** Los archivos que quien mira puede quitar (el Admin SGC, mientras está recibido: para retirar datos de pacientes). */
  quitables: number[];
  /** Los hallazgos abiertos parecidos, para sumarlo; nulo si quien mira no clasifica o ya está clasificado. */
  parecidos: ParecidoDelReporte[] | null;
};

/**
 * «Reportes recibidos» (spec 15 §7.3 y §16.1), para los roles de control (`mejora.ver_todo`): cada reporte con quién lo envió,
 * cuándo y dónde lo vio, su referencia, sus archivos y su estado; los que esperan, con su plazo. Al Admin SGC (`gestiona`), en
 * los que siguen recibidos, la clasificación (`ClasificarReporte`). Del ya clasificado, el hallazgo (lo ven todos los hallazgos)
 * o el motivo del descarte. Una tarjeta por reporte, también en el teléfono.
 */
export function ReportesRecibidos({
  filas,
  gestiona,
  zona,
  ahora,
  sumar,
  descartar,
}: {
  filas: readonly FilaDeReporteRecibido[];
  gestiona: boolean;
  zona: string;
  ahora: Date;
  sumar: Accion;
  descartar: Accion;
}) {
  const alcance = (
    <p className="text-xs text-muted-foreground">
      {`Se muestran todos los que esperan su clasificación y los clasificados en los últimos ${DIAS_DE_CLASIFICADOS} días.`}
    </p>
  );
  if (filas.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <EstadoVacio
          icono={Inbox}
          titulo="No hay reportes recibidos"
          texto="Cuando un funcionario reporte una posible no conformidad, aparecerá aquí para clasificarla."
        />
        {alcance}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
    {alcance}
    <ul className="flex list-none flex-col gap-3" aria-label="Reportes recibidos">
      {filas.map(({ reporte: r, archivos, quitables, parecidos }) => {
        const estado = ESTADO[r.estado];
        const recibido = r.estado === "recibido";
        const vencido = recibido && r.vence < ahora;
        return (
          <li key={r.id} className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-1.5">
                <Insignia variante={estado.variante} modulo="planes">
                  {estado.texto}
                </Insignia>
                {vencido ? <Insignia variante="critico">Vencido</Insignia> : null}
              </span>
              {recibido ? (
                <span className="text-xs text-muted-foreground">{`Clasificar a más tardar el ${fechaDeDia(fechaEnZona(r.vence, zona))}`}</span>
              ) : null}
            </div>
            <p className="text-sm">
              <span className="font-medium">{r.reportadoPor}</span>
              <span className="text-muted-foreground">{` · lo reportó el ${fechaYHora(r.cuando, zona)}`}</span>
            </p>
            <p className="whitespace-pre-line break-words text-sm">{r.descripcion}</p>
            <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <div className="flex gap-1">
                <dt>Lo vio:</dt>
                <dd>{fechaDeDia(r.vistoEn)}</dd>
              </div>
              <div className="flex gap-1">
                <dt>Proceso:</dt>
                <dd>{r.proceso ?? "No lo sabe"}</dd>
              </div>
              {r.referenciaCaso ? (
                <div className="flex gap-1">
                  <dt>Referencia del caso:</dt>
                  <dd className="break-all">{r.referenciaCaso}</dd>
                </div>
              ) : null}
            </dl>
            {archivos.length > 0 ? <ArchivosDe archivos={archivos} quitables={quitables} /> : null}
            {r.hallazgo ? (
              <p className="text-sm">
                {r.estado === "sumado" ? "Se añadió como ocurrencia de " : "Se convirtió en "}
                <Link href={rutaDeHallazgo(r.hallazgo.id)} className={`rounded-sm font-medium text-marca underline-offset-2 hover:underline ${FOCO}`}>
                  {r.hallazgo.codigo}
                </Link>{" "}
                <span className="break-words">{r.hallazgo.titulo}</span>
              </p>
            ) : null}
            {r.motivo ? (
              <p className="whitespace-pre-line break-words border-l-2 border-mod-planes pl-3 text-sm">{`Motivo: ${r.motivo}`}</p>
            ) : null}
            {gestiona && recibido && parecidos !== null ? (
              <ClasificarReporte reporteId={r.id} parecidos={parecidos} conProceso={r.procesoId !== null} sumar={sumar} descartar={descartar} />
            ) : null}
          </li>
        );
      })}
    </ul>
    </div>
  );
}
