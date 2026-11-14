import type { Unidad } from "@/lib/indicadores/textos";
import { NO_ALCANZA_LA_META } from "@/lib/indicadores/tipos";
import { Insignia, type VarianteInsignia } from "./Insignia";
import { claseDeRelleno, escala, NOMBRE_DE_ESTADO, type EstadoDePunto } from "./geometria-tubos";

const INSIGNIA: Record<EstadoDePunto, VarianteInsignia> = {
  bien: "bien",
  atencion: "atencion",
  critico: "critico",
  "sin-meta": "sin-dato",
  "sin-dato": "sin-dato",
  "no-aplica": "sin-dato",
  futuro: "sin-dato",
};

/** Dónde queda la etiqueta de la meta para no salirse por los extremos. */
const alineacion = (pct: number) => (pct < 15 ? "" : pct > 85 ? "-translate-x-full" : "-translate-x-1/2");

/**
 * El acumulado del año (spec §8.10 y §11): la cifra con su estado escrito y un tubo acostado que se llena hasta ella,
 * con la marca de la meta y su etiqueta. El tubo no se lee aparte: la cifra, el estado y la meta van escritos. Sin
 * `unidad` la escala sube hasta un número redondo; con un porcentaje, va de 0 a 100. Como las columnas, el relleno
 * parte del cero: un acumulado negativo crece hacia la izquierda.
 */
export function TuboAcumulado({
  valor,
  texto,
  estado,
  cumple = null,
  meta,
  unidad,
}: {
  valor: number | null;
  texto: string;
  estado: EstadoDePunto;
  /** Bien con `false` no alcanza la meta: la insignia lo dice. */
  cumple?: boolean | null;
  meta?: { valor: number; texto: string };
  unidad?: Pick<Unidad, "sufijo">;
}) {
  const e = escala(valor === null ? [] : [valor], meta ? [meta.valor] : [], unidad?.sufijo.trim() === "%");
  const pct = (v: number) => Number((((Math.min(Math.max(v, e.min), e.max) - e.min) * 100) / (e.max - e.min)).toFixed(3));
  const clase = valor === null ? null : claseDeRelleno(estado);
  const enMeta = meta ? pct(meta.valor) : null;
  const cero = pct(0);
  const desde = valor === null ? cero : Math.min(pct(valor), cero);
  const largo = valor === null ? 0 : Number((Math.max(pct(valor), cero) - desde).toFixed(3));

  return (
    <div className="tubo-color-exacto flex min-w-0 flex-col gap-2">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-display text-2xl font-semibold tabular-nums">{texto}</span>
        <Insignia variante={INSIGNIA[estado]}>{estado === "bien" && cumple === false ? `${NOMBRE_DE_ESTADO[estado]} · ${NO_ALCANZA_LA_META}` : NOMBRE_DE_ESTADO[estado]}</Insignia>
      </p>
      <div className={`relative ${meta ? "pb-5" : ""}`}>
        <div aria-hidden="true" className="h-3.5 overflow-hidden rounded-full bg-tubo-pista">
          {clase !== null && largo > 0 ? (
            <div className={`tubo-relleno tubo-acostado ${clase} h-full rounded-full`} style={{ width: `${largo}%`, marginLeft: `${desde}%` }} />
          ) : null}
        </div>
        {meta && enMeta !== null ? (
          <>
            <span aria-hidden="true" className="absolute -top-1 h-5.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground" style={{ left: `${enMeta}%` }} />
            <span className={`absolute top-5 whitespace-nowrap text-xs text-muted-foreground ${alineacion(enMeta)}`} style={{ left: `${enMeta}%` }}>
              {meta.texto}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
