import { HeartPulse } from "lucide-react";
import { Icono } from "@/componentes/iconos";
import type { DatosMapa } from "@/db/consultas/mapa";
import { Banda } from "./Banda";
import { Conector } from "./Conector";
import { Phva } from "./Phva";
import { RailPeriferico } from "./RailPeriferico";

function tipoConector(
  bandaActual: string,
  bandaSiguiente: string,
): "dirige" | "soporte" | "mejora" {
  if (bandaActual === "estrategicos") return "dirige";
  if (bandaSiguiente === "evaluacion") return "mejora";
  return "soporte";
}

// Vista de escritorio del mapa (≥lg). El equivalente mobile es AcordeonMapa.
export function MapaProcesos({ datos }: { datos: DatosMapa }) {
  const { macroprocesos, entradas, salidas, convenciones, configuracion } =
    datos;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 xl:grid-cols-[235px_minmax(0,1fr)_235px]">
        {/* Bandas centrales */}
        <div className="order-1 xl:order-2">
          {macroprocesos.map((macro, i) => (
            <div key={macro.id}>
              {i > 0 && (
                <Conector
                  tipo={tipoConector(
                    macroprocesos[i - 1].banda,
                    macro.banda,
                  )}
                />
              )}
              <Banda macro={macro} indice={i} />
            </div>
          ))}
        </div>

        {/* Rieles: a los costados en xl, en dos columnas debajo en lg */}
        <div className="order-2 grid gap-5 sm:grid-cols-2 xl:contents">
          <div className="xl:order-1">
            <RailPeriferico
              titulo="Entradas del Sistema"
              tipo="entrada"
              elementos={entradas}
            />
          </div>
          <div className="flex flex-col gap-5 xl:order-3">
            <RailPeriferico
              titulo="Salidas del Sistema"
              tipo="salida"
              elementos={salidas}
            />
            <Phva
              titulo={configuracion.titulo_phva ?? "Mejora Continua"}
              texto={configuracion.texto_phva ?? ""}
            />
          </div>
        </div>
      </div>

      {/* Convenciones (desde BD) */}
      <section
        aria-label="Convenciones"
        className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 rounded-xl border border-border bg-card px-4 py-2.5 shadow-xs"
      >
        {convenciones.map((c) => (
          <span
            key={c.texto}
            className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground ${c.activo === false ? "opacity-50 line-through" : ""}`}
          >
            <Icono nombre={c.icono} className="size-3.5 text-verde-texto" />
            {c.texto}
          </span>
        ))}
      </section>

      {/* Lema institucional */}
      <p className="flex items-center justify-center gap-2.5 rounded-xl bg-azul-profundo px-6 py-3.5 text-center font-display text-sm font-semibold text-white sm:text-base">
        <HeartPulse className="size-4.5 shrink-0 text-verde" aria-hidden="true" />
        {configuracion.lema ??
          "Comprometidos con la vida y el bienestar de nuestra comunidad"}
      </p>
    </div>
  );
}
