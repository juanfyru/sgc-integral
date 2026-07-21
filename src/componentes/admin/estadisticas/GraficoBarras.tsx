import type { PuntoSerie } from "@/db/consultas/estadisticas";
import { calcularBarras } from "./geometria";

const ANCHO = 640;
const ALTO = 140;

export function GraficoBarras({ serie }: { serie: PuntoSerie[] }) {
  const barras = calcularBarras(serie, { ancho: ANCHO, alto: ALTO, separacion: 3 });
  const total = serie.reduce((s, p) => s + p.conteo, 0);

  if (serie.length === 0)
    return <p className="text-sm text-muted-foreground">Sin consultas en el periodo.</p>;

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="h-36 w-full"
        role="img"
        aria-label={`Consultas por día en el periodo: ${total} en total, ${serie.length} días con actividad.`}
        preserveAspectRatio="none"
      >
        {barras.map((b) => (
          <rect
            key={b.fecha}
            x={b.x}
            y={b.y}
            width={b.ancho}
            height={b.alto}
            className="fill-primary/70"
          >
            <title>{`${b.fecha}: ${b.conteo}`}</title>
          </rect>
        ))}
      </svg>
      <figcaption className="sr-only">
        <table>
          <caption>Consultas por día</caption>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Consultas</th>
            </tr>
          </thead>
          <tbody>
            {serie.map((p) => (
              <tr key={p.fecha}>
                <td>{p.fecha}</td>
                <td>{p.conteo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}
