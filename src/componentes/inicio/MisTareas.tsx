import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { Insignia } from "@/componentes/ui/Insignia";
import type { Tarea } from "@/lib/tareas";
import { fechaCompactaLocal, zonaHoraria } from "@/lib/zona-horaria";

const MARCA_MODULO: Record<Tarea["modulo"], string> = {
  documentos: "bg-mod-documentos",
  indicadores: "bg-mod-indicadores",
  planes: "bg-mod-planes",
};

function fechaCorta(d: Date) {
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: zonaHoraria() });
}

function Vencimiento({ vence, ahora }: { vence: Date; ahora: Date }) {
  const diaVence = fechaCompactaLocal(vence);
  const diaHoy = fechaCompactaLocal(ahora);
  if (diaVence < diaHoy) return <Insignia variante="critico">Vencida</Insignia>;
  if (diaVence === diaHoy) return <Insignia variante="atencion">Vence hoy</Insignia>;
  return <Insignia variante="neutra">{fechaCorta(vence)}</Insignia>;
}

export function MisTareas({ tareas, total = tareas.length, ahora = new Date() }: { tareas: Tarea[]; total?: number; ahora?: Date }) {
  return (
    <section aria-labelledby="mis-tareas-titulo" className="mb-8">
      <h2 id="mis-tareas-titulo" className="mb-3 font-display text-lg font-semibold">
        Mis tareas{" "}
        <span className="text-sm font-normal text-muted-foreground">({total})</span>
      </h2>
      {tareas.length === 0 ? (
        <EstadoVacio
          icono={ClipboardCheck}
          titulo="No tiene tareas pendientes"
          texto="Cuando un documento necesite su revisión o aprobación, aparecerá aquí."
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border bg-card">
          {tareas.map((t) => (
            <li key={t.id} className="flex">
              <span aria-hidden="true" className={`w-1 shrink-0 ${MARCA_MODULO[t.modulo]}`} />
              <Link
                href={t.enlace}
                className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{t.titulo}</span>
                  {t.detalle ? (
                    <span className="block text-xs text-muted-foreground">{t.detalle}</span>
                  ) : null}
                </span>
                {t.vence ? <Vencimiento vence={t.vence} ahora={ahora} /> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
