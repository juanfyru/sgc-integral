import { Check } from "lucide-react";
import { ETIQUETA_ETAPA, type Etapa, type TipoSolicitud } from "@/lib/tramites/tipos";

type Paso = { etiqueta: string; etapa: Etapa | null };

const PASOS: readonly Paso[] = [
  { etiqueta: "Solicitud", etapa: null },
  { etiqueta: "Visto bueno", etapa: "visto_bueno" },
  { etiqueta: "Aceptación", etapa: "aceptacion" },
  { etiqueta: "Elaboración", etapa: "elaboracion" },
  { etiqueta: "Revisión", etapa: "revision" },
  { etiqueta: "Aprobación", etapa: "aprobacion" },
  { etiqueta: "Publicación", etapa: "publicacion" },
];

const CLASE_PASO = {
  hecho: "border-transparent bg-estado-bien-fondo text-estado-bien-texto",
  actual: "border-marca bg-marca-relleno font-semibold text-white",
  pendiente: "border-border text-muted-foreground",
};

/** Las siete etapas, o cinco en una eliminación. El estado se dice con ícono y texto, no solo con color. */
export function PasosTramite({ etapa, tipo }: { etapa: Etapa; tipo: TipoSolicitud }) {
  const pasos = tipo === "eliminar" ? PASOS.filter((p) => p.etapa !== "elaboracion" && p.etapa !== "revision") : PASOS;
  const terminado = etapa === "publicado" || etapa === "eliminado";
  const sinTerminar = etapa === "rechazado" || etapa === "cancelado";
  const actual = pasos.findIndex((p) => p.etapa === etapa);
  const estadoDe = (i: number): keyof typeof CLASE_PASO => {
    if (terminado) return "hecho";
    if (sinTerminar) return "pendiente";
    if (i < actual) return "hecho";
    return i === actual ? "actual" : "pendiente";
  };

  return (
    <section aria-label="Pasos del trámite" className="space-y-2">
      <ol className="flex list-none flex-wrap gap-2">
        {pasos.map((p, i) => {
          const estado = estadoDe(i);
          return (
            <li
              key={p.etiqueta}
              aria-current={estado === "actual" ? "step" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${CLASE_PASO[estado]}`}
            >
              {estado === "hecho" ? (
                <Check className="size-3.5" aria-hidden="true" />
              ) : (
                <span aria-hidden="true">{i + 1}</span>
              )}
              {p.etiqueta}
              {estado === "hecho" ? <span className="sr-only"> (hecho)</span> : null}
            </li>
          );
        })}
      </ol>
      {sinTerminar ? (
        <p className="text-sm text-muted-foreground">
          {`El trámite se cerró como «${ETIQUETA_ETAPA[etapa]}» sin completar los pasos.`}
        </p>
      ) : null}
    </section>
  );
}
