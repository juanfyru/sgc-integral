import { useId } from "react";
import type { Tubo } from "./geometria-tubos";

/** Un id de `useId` que sirve dentro de `url(#…)`: en una página caben varias gráficas. */
export function useIdDeGrafica(prefijo: string): string {
  return `${prefijo}-${useId().replace(/[^\w-]/g, "")}`;
}

/**
 * Los degradados del volumen y el recorte de las pistas de una gráfica de tubos, con los ids de la gráfica. Las paradas
 * toman sus tonos de la clase de estado del degradado (`globals.css`).
 */
export function DefinicionesDeTubo({
  id,
  clases,
  pistas,
}: {
  id: string;
  clases: readonly string[];
  pistas: readonly { x: number; y: number; ancho: number; alto: number }[];
}) {
  return (
    <defs>
      {clases.map((c) => (
        <linearGradient key={c} id={`${id}-${c}`} className={c} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.1" className="tubo-parada-brillo" />
          <stop offset="0.55" className="tubo-parada-base" />
          <stop offset="1" className="tubo-parada-sombra" />
        </linearGradient>
      ))}
      <clipPath id={`${id}-pistas`}>
        {pistas.map((p, i) => (
          <rect key={i} x={p.x} y={p.y} width={p.ancho} height={p.alto} rx={p.ancho / 2} />
        ))}
      </clipPath>
    </defs>
  );
}

/**
 * Un tubo: la pista (más tenue si el periodo aún no llega) y, si tiene alto, el relleno con el degradado de su clase,
 * recortado por las pistas. El que sube desde la base lleva el tope redondeado (se alarga por debajo y el recorte lo
 * corta); el que parte del cero en medio de la pista es recto, y el negativo crece hacia abajo.
 */
export function TuboSvg({
  id,
  indice,
  tubo,
  tope,
  base,
  futuro,
  clase,
  negativo,
}: {
  id: string;
  /** El orden de la columna: da el retardo de su animación. */
  indice: number;
  tubo: Tubo;
  tope: number;
  base: number;
  futuro: boolean;
  /** La clase de estado del relleno (`tubo-bien`…); `null`, sin relleno. */
  clase: string | null;
  negativo: boolean;
}) {
  const desdeLaBase = !negativo && Math.abs(tubo.yRelleno + tubo.altoRelleno - base) < 0.001;
  return (
    <>
      <rect
        className={`tubo-pista ${futuro ? "fill-tubo-pista-futura" : "fill-tubo-pista"}`}
        x={tubo.x}
        y={tope}
        width={tubo.ancho}
        height={base - tope}
        rx={tubo.ancho / 2}
      />
      {clase !== null && tubo.altoRelleno > 0 ? (
        <g clipPath={`url(#${id}-pistas)`}>
          <rect
            className={`tubo-relleno ${clase}${negativo ? " tubo-negativo" : ""}`}
            style={{ "--i": indice } as React.CSSProperties}
            x={tubo.x}
            y={tubo.yRelleno}
            width={tubo.ancho}
            height={desdeLaBase ? tubo.altoRelleno + tubo.ancho : tubo.altoRelleno}
            rx={desdeLaBase ? tubo.ancho / 2 : 0}
            fill={`url(#${id}-${clase})`}
          />
        </g>
      ) : null}
    </>
  );
}
