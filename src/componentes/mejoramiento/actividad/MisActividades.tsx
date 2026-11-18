import Link from "next/link";
import { ListChecks } from "lucide-react";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { Insignia, type VarianteInsignia } from "@/componentes/ui/Insignia";
import type { ActividadPropia } from "@/db/consultas/mejoramiento/actividades";
import { fechaDeDia, vencidaHace } from "@/lib/mejoramiento/formato";
import { rutaDeActividad } from "@/lib/mejoramiento/rutas";
import { ETIQUETA_ESTADO_ACTIVIDAD } from "@/lib/mejoramiento/textos";
import { ACTIVIDAD_ABIERTA, type EstadoActividad } from "@/lib/mejoramiento/tipos";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

const VARIANTE: Record<EstadoActividad, VarianteInsignia> = {
  abierta: "neutra",
  en_proceso: "modulo",
  terminada: "bien",
  cancelada: "sin-dato",
};

/**
 * El estado de una actividad, siempre con texto: «Vencida hace N días» (desde `vence`: la fecha para corregir si se devolvió, si no
 * el fin), el guardado y, si se devolvió, «Devuelta».
 */
export function EstadoDeLaActividad({ estado, vencida, devuelta, vence, hoy }: { estado: EstadoActividad; vencida: boolean; devuelta: boolean; vence: string; hoy: string }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {vencida ? (
        <Insignia variante="critico">{vencidaHace(vence, hoy)}</Insignia>
      ) : (
        <Insignia variante={VARIANTE[estado]} modulo="planes">
          {ETIQUETA_ESTADO_ACTIVIDAD[estado]}
        </Insignia>
      )}
      {devuelta && ACTIVIDAD_ABIERTA.includes(estado) ? <Insignia variante="atencion">Devuelta</Insignia> : null}
    </span>
  );
}

/** La barra del avance, con su cifra en texto al lado (la barra sola no dice nada a un lector de pantalla). */
export function BarraDeAvance({ avance, etiqueta }: { avance: number; etiqueta: string }) {
  const valor = Math.max(0, Math.min(100, avance));
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        role="progressbar"
        aria-label={etiqueta}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={valor}
        className="h-2 w-full min-w-16 overflow-hidden rounded-full bg-muted"
      >
        <span className="block h-full rounded-full bg-mod-planes" style={{ width: `${valor}%` }} />
      </span>
      <span className="shrink-0 text-sm font-medium">{`${valor} %`}</span>
    </span>
  );
}

function Tarjeta({ a, hoy }: { a: ActividadPropia; hoy: string }) {
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <Link href={rutaDeActividad(a.id)} className={`break-words rounded-sm font-medium text-marca underline-offset-2 hover:underline ${FOCO}`}>
        {a.descripcion}
      </Link>
      <span className="font-mono text-xs text-muted-foreground">{`${a.hallazgoCodigo} · ${a.etiqueta}`}</span>
      <span className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <EstadoDeLaActividad estado={a.estado} vencida={a.vencida} devuelta={a.devuelta} vence={a.vence} hoy={hoy} />
        <span className="text-muted-foreground">{`Fin: ${fechaDeDia(a.fin)}`}</span>
      </span>
      <BarraDeAvance avance={a.avance} etiqueta={`Avance de ${a.etiqueta}`} />
    </li>
  );
}

/**
 * «Mis actividades» (spec 15 §16.1): las actividades a cargo de la persona, pensadas para el teléfono. Las que siguen
 * abiertas arriba, por su fin; debajo, las terminadas o canceladas. Cada una lleva a su página.
 */
export function MisActividades({ actividades, hoy }: { actividades: readonly ActividadPropia[]; hoy: string }) {
  if (actividades.length === 0) {
    return (
      <EstadoVacio
        icono={ListChecks}
        titulo="No tiene actividades a su cargo"
        texto="Cuando se apruebe un plan de acción con una actividad suya, aparecerá aquí con su fecha y su avance."
      />
    );
  }
  const abiertas = actividades.filter((a) => ACTIVIDAD_ABIERTA.includes(a.estado));
  const cerradas = actividades.filter((a) => !ACTIVIDAD_ABIERTA.includes(a.estado));
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {abiertas.length > 0 ? (
        <section aria-labelledby="actividades-por-hacer" className="flex min-w-0 flex-col gap-3">
          <h2 id="actividades-por-hacer" className="font-display text-base font-semibold">
            Por hacer
          </h2>
          <ul className="grid grid-cols-1 list-none gap-3 lg:grid-cols-2">
            {abiertas.map((a) => (
              <Tarjeta key={a.id} a={a} hoy={hoy} />
            ))}
          </ul>
        </section>
      ) : null}
      {cerradas.length > 0 ? (
        <section aria-labelledby="actividades-cerradas" className="flex min-w-0 flex-col gap-3">
          <h2 id="actividades-cerradas" className="font-display text-base font-semibold">
            Terminadas o canceladas
          </h2>
          <ul className="grid grid-cols-1 list-none gap-3 lg:grid-cols-2">
            {cerradas.map((a) => (
              <Tarjeta key={a.id} a={a} hoy={hoy} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
