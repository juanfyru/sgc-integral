import { useId } from "react";
import type { Unidad } from "@/lib/indicadores/textos";
import { TarjetaDeTubo } from "./TarjetaDeTubo";
import {
  anchoDeFranja,
  calcularTubos,
  claseDeRelleno,
  escala,
  rotuloCorto,
  yDe,
  type Geometria,
  type PuntoDeSerie,
} from "./geometria-tubos";

const ALTO = 222;
const ANCHO_MINIMO = 540;
/** Con muchos periodos el lienzo crece (y se desplaza en pantallas angostas) antes que apretar los valores. */
const FRANJA_MINIMA = 34;
const MARGEN = { izq: 34, arriba: 26, abajo: 36 };
const MARGEN_DERECHO_MINIMO = 100;
/** Con franjas angostas el valor de cada columna va sin su unidad: la dice el eje. */
const FRANJA_CON_UNIDAD = 48;

type Meta = { valor: number; texto: string } | { porPeriodo: (number | null)[]; texto: string };

const cifra = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

/** El ancho aproximado de una etiqueta en el margen derecho (no hay medida de texto en el servidor). */
const anchoDeEtiqueta = (texto: string, tamano: number) => Math.ceil(texto.length * tamano * 0.56 + 16);

const esPorcentaje = (u: Pick<Unidad, "sufijo">) => u.sufijo.trim() === "%";

/**
 * Los degradados del volumen y el recorte de las pistas de una gráfica, con ids propios: en una página caben varias
 * gráficas. Las paradas toman sus tonos de la clase de estado del degradado (`globals.css`).
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

/** Un id de `useId` que sirve dentro de `url(#…)`. */
export function useIdDeGrafica(prefijo: string): string {
  return `${prefijo}-${useId().replace(/[^\w-]/g, "")}`;
}

/**
 * La gráfica principal de un indicador (spec §11, estilo A «Tubos»): un tubo por periodo que se llena hasta su
 * resultado con el color de su estado, el valor escrito debajo, la meta como línea con su etiqueta en el margen derecho
 * (escalonada si cambia entre periodos), el límite de crítico punteado y, en tendencia constante, la franja del rango.
 * Sin meta, los tubos van en neutro y no hay líneas. Cada franja se enfoca con el teclado y dice su valor y su estado;
 * la tarjeta (`TarjetaDeTubo`) lo repite al pasar el cursor. La tabla equivalente va en `sr-only`. Al imprimir, la hoja
 * de estilos pone el relleno sólido y escribe el valor y el estado sobre cada columna.
 */
export function GraficoTubos({
  serie,
  titulo,
  meta: metaDada,
  limite,
  rango,
  unidad,
  columnas,
}: {
  serie: PuntoDeSerie[];
  /** El nombre de la figura y el título de la tabla equivalente. */
  titulo: string;
  /** Con `porPeriodo`, `texto` es solo el nombre («Meta»): la gráfica le añade la cifra de cada periodo. */
  meta?: Meta;
  limite?: { valor: number; texto: string };
  /** La franja del rango de una meta en tendencia constante. */
  rango?: { min: number; max: number };
  unidad: Pick<Unidad, "sufijo">;
  /** Los encabezados de la tabla equivalente: periodo, valor y estado. */
  columnas: readonly [string, string, string];
}) {
  const id = useIdDeGrafica("tubos");
  if (serie.length === 0) return <p className="text-sm text-muted-foreground">Sin periodos para mostrar.</p>;
  // Una meta por periodo de la serie, ni una más.
  const meta: Meta | undefined = metaDada && "porPeriodo" in metaDada ? { ...metaDada, porPeriodo: metaDada.porPeriodo.slice(0, serie.length) } : metaDada;

  const metas = meta === undefined ? [] : "valor" in meta ? [meta.valor] : meta.porPeriodo.filter((m): m is number => m !== null);
  const referencias = [...metas, ...(limite ? [limite.valor] : []), ...(rango ? [rango.min, rango.max] : [])];
  const e = escala(serie.flatMap((p) => (p.valor === null ? [] : [p.valor])), referencias, esPorcentaje(unidad));

  const conCifra = (m: number) => `${cifra.format(m)}${unidad.sufijo}`;
  const ultimaMeta = metas.at(-1);
  const etiquetaMeta = meta === undefined || ultimaMeta === undefined ? null : "valor" in meta ? meta.texto : `${meta.texto} ${conCifra(ultimaMeta)}`;
  const anchoMeta = etiquetaMeta ? anchoDeEtiqueta(etiquetaMeta, 9.5) : 0;
  const anchoLimite = limite ? anchoDeEtiqueta(limite.texto, 9) : 0;
  const der = Math.max(MARGEN_DERECHO_MINIMO, Math.max(anchoMeta, anchoLimite) + 12);
  const g: Geometria = {
    ancho: Math.max(ANCHO_MINIMO, MARGEN.izq + der + serie.length * FRANJA_MINIMA),
    alto: ALTO,
    margen: { ...MARGEN, der },
  };
  const base = ALTO - MARGEN.abajo;
  const tope = MARGEN.arriba;
  const derecha = g.ancho - der;
  const franja = anchoDeFranja(serie.length, g);
  const tubos = calcularTubos(serie, g, e);
  const y = (v: number) => yDe(v, g, e);
  const clases = [...new Set(serie.map((p) => (p.valor === null ? null : claseDeRelleno(p.estado))).filter((c) => c !== null))];

  const metaDe = (i: number): string => {
    if (meta === undefined) return "";
    if ("valor" in meta) return meta.texto;
    const m = meta.porPeriodo[i];
    return m === null || m === undefined ? "Sin meta" : `${meta.texto} ${conCifra(m)}`;
  };
  const debajo = (p: PuntoDeSerie): string => {
    if (p.estado === "sin-dato") return "s. d.";
    if (p.estado === "no-aplica") return "n. a.";
    if (p.valor === null || franja >= FRANJA_CON_UNIDAD || !p.texto.endsWith(unidad.sufijo)) return p.texto;
    return p.texto.slice(0, p.texto.length - unidad.sufijo.length);
  };

  const yMeta = meta === undefined || ultimaMeta === undefined ? null : y(ultimaMeta);
  const yLimite = limite ? y(limite.valor) : null;
  // Dos etiquetas casi a la misma altura se separan; la de la meta se queda junto a su línea.
  const yEtiquetaLimite =
    yLimite === null ? null : yMeta !== null && Math.abs(yLimite - yMeta) < 20 ? yMeta + (yLimite >= yMeta ? 20 : -20) : yLimite;

  return (
    <figure className="flex min-w-0 flex-col">
      <TarjetaDeTubo>
        <div className="tubo-desplazable overflow-x-auto [direction:rtl]">
          <svg viewBox={`0 0 ${g.ancho} ${ALTO}`} className="tubo-lienzo block h-auto w-full [direction:ltr]" style={{ minWidth: g.ancho }}>
            <DefinicionesDeTubo id={id} clases={clases} pistas={tubos.map((t) => ({ x: t.x, y: tope, ancho: t.ancho, alto: base - tope }))} />
            <g role="img" aria-label={titulo}>
              {e.marcas.map((m, i) => (
                <g key={m}>
                  <line x1={MARGEN.izq} x2={derecha} y1={y(m)} y2={y(m)} className="stroke-border" strokeWidth={1} />
                  <text x={MARGEN.izq - 6} y={y(m) + 3.5} textAnchor="end" fontSize={9.5} className="fill-muted-foreground">
                    {i === e.marcas.length - 1 ? conCifra(m) : cifra.format(m)}
                  </text>
                </g>
              ))}
              {rango ? (
                <rect
                  className="tubo-franja fill-estado-bien-fondo"
                  x={MARGEN.izq}
                  y={y(rango.max)}
                  width={derecha - MARGEN.izq}
                  height={Math.max(y(rango.min) - y(rango.max), 0)}
                />
              ) : null}
              {tubos.map((t, i) => (
                <rect
                  key={serie[i].clave}
                  className={`tubo-pista ${serie[i].estado === "futuro" ? "fill-tubo-pista-futura" : "fill-tubo-pista"}`}
                  x={t.x}
                  y={tope}
                  width={t.ancho}
                  height={base - tope}
                  rx={t.ancho / 2}
                />
              ))}
              <g clipPath={`url(#${id}-pistas)`}>
                {tubos.map((t, i) => {
                  const clase = serie[i].valor === null ? null : claseDeRelleno(serie[i].estado);
                  return clase ? (
                    <rect
                      key={serie[i].clave}
                      className={`tubo-relleno ${clase}`}
                      style={{ "--i": i } as React.CSSProperties}
                      x={t.x}
                      y={t.yRelleno}
                      width={t.ancho}
                      height={t.altoRelleno + t.ancho}
                      rx={t.ancho / 2}
                      fill={`url(#${id}-${clase})`}
                    />
                  ) : null;
                })}
              </g>
              <Lineas meta={meta} y={y} izq={MARGEN.izq} derecha={derecha} franja={franja} limite={limite} />
              {etiquetaMeta !== null && yMeta !== null ? (
                <g>
                  <rect x={derecha + 6} y={yMeta - 9} width={anchoMeta} height={18} rx={9} className="fill-foreground" />
                  <text x={derecha + 6 + anchoMeta / 2} y={yMeta + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={600} className="fill-card">
                    {etiquetaMeta}
                  </text>
                </g>
              ) : null}
              {limite && yEtiquetaLimite !== null ? (
                <g>
                  <rect
                    x={derecha + 6}
                    y={yEtiquetaLimite - 9}
                    width={anchoLimite}
                    height={18}
                    rx={9}
                    className="fill-card stroke-muted-foreground"
                    strokeWidth={1}
                  />
                  <text x={derecha + 6 + anchoLimite / 2} y={yEtiquetaLimite + 3.5} textAnchor="middle" fontSize={9} className="fill-foreground">
                    {limite.texto}
                  </text>
                </g>
              ) : null}
              {tubos.map((t, i) => {
                const p = serie[i];
                const valor = debajo(p);
                return (
                  <g key={p.clave}>
                    <text x={t.centro} y={base + 15} textAnchor="middle" fontSize={9.5} className="fill-muted-foreground">
                      {rotuloCorto(p.clave, p.etiqueta)}
                    </text>
                    {valor ? (
                      <text
                        x={t.centro}
                        y={base + 29}
                        textAnchor="middle"
                        fontSize={10}
                        className={p.valor === null ? "fill-muted-foreground" : "fill-foreground font-semibold"}
                      >
                        {valor}
                      </text>
                    ) : null}
                    <text className="tubo-impreso" x={t.centro} y={tope - 13} textAnchor="middle" fontSize={7.5}>
                      {p.valor !== null ? <tspan x={t.centro}>{p.texto}</tspan> : null}
                      <tspan x={t.centro} dy={9}>
                        {p.nombreEstado}
                      </tspan>
                    </text>
                  </g>
                );
              })}
            </g>
            <g className="tubo-zonas">
              {serie.map((p, i) => (
                <rect
                  key={p.clave}
                  className="tubo-zona"
                  x={MARGEN.izq + i * franja}
                  y={tope}
                  width={franja}
                  height={base - tope}
                  rx={4}
                  tabIndex={0}
                  role="img"
                  aria-label={p.valor === null ? `${p.etiqueta}: ${p.nombreEstado}` : `${p.etiqueta}: ${p.texto}, ${p.nombreEstado}`}
                  data-tubo={i}
                  data-periodo={p.etiqueta}
                  data-valor={p.valor === null ? "" : p.texto}
                  data-estado={p.estado}
                  data-nombre={p.nombreEstado}
                  data-meta={metaDe(i)}
                />
              ))}
            </g>
          </svg>
        </div>
      </TarjetaDeTubo>
      <figcaption className="sr-only">
        <table>
          <caption>{titulo}</caption>
          <thead>
            <tr>
              {columnas.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {serie.map((p) => (
              <tr key={p.clave}>
                <th scope="row">{p.etiqueta}</th>
                <td>{p.valor === null ? "—" : p.texto}</td>
                <td>{p.nombreEstado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}

/** La meta (recta o escalonada, con huecos donde no hay) y el límite de crítico punteado. */
function Lineas({
  meta,
  limite,
  y,
  izq,
  derecha,
  franja,
}: {
  meta?: Meta;
  limite?: { valor: number; texto: string };
  y: (v: number) => number;
  izq: number;
  derecha: number;
  franja: number;
}) {
  let escalonada = "";
  if (meta && "porPeriodo" in meta) {
    let anterior = false;
    meta.porPeriodo.forEach((m, i) => {
      if (m === null) {
        anterior = false;
        return;
      }
      escalonada += `${anterior ? "V" : `M${izq + i * franja},`}${y(m)}H${izq + (i + 1) * franja}`;
      anterior = true;
    });
  }
  return (
    <>
      {limite ? (
        <line
          className="tubo-limite stroke-muted-foreground"
          x1={izq}
          x2={derecha + 4}
          y1={y(limite.valor)}
          y2={y(limite.valor)}
          strokeWidth={1.2}
          strokeDasharray="3 3"
        />
      ) : null}
      {meta && "valor" in meta ? (
        <line className="tubo-meta stroke-foreground" x1={izq} x2={derecha + 4} y1={y(meta.valor)} y2={y(meta.valor)} strokeWidth={1.5} />
      ) : null}
      {escalonada ? <path className="tubo-meta stroke-foreground" d={escalonada} fill="none" strokeWidth={1.5} /> : null}
    </>
  );
}

