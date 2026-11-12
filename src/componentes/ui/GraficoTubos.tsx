import type { Unidad } from "@/lib/indicadores/textos";
import type { LimiteDeGrafica } from "@/lib/indicadores/tipos";
import { DesplazableDeTubos } from "./DesplazableDeTubos";
import { TarjetaDeTubo } from "./TarjetaDeTubo";
import { DefinicionesDeTubo, TuboSvg, useIdDeGrafica } from "./TuboSvg";
import {
  anchoDeFranja,
  anchoDeLienzo,
  calcularTubos,
  cambiosDeAnio,
  claseDeRelleno,
  columnaInicial,
  escala,
  rotuloCorto,
  yDe,
  type Geometria,
  type PuntoDeSerie,
} from "./geometria-tubos";

const ALTO_PISTA = 160;
/**
 * El paso de cada columna: el lienzo mide los márgenes más un paso por periodo (`anchoDeLienzo`), así pocos periodos
 * caben en un teléfono y muchos crecen (y se desplazan) antes que apretar los valores. Una serie corta lo ensancha para
 * que su valor quepa con la unidad (`pasoYUnidad`).
 */
const PASO = 34;
/**
 * Cuánto se agranda la gráfica, como mucho, para llenar su caja: con pocos periodos el lienzo es angosto y, sin tope,
 * el texto y la altura crecerían al doble en una pantalla ancha.
 */
const ESCALA_MAXIMA = 1.3;
/** La escala va en su propio lienzo, fuera de lo que se desplaza: el de los tubos solo deja un respiro a la izquierda. */
const MARGEN = { izq: 6, arriba: 26 };
/** El ancho mínimo del lienzo de la escala; crece con el rótulo más largo. */
const EJE_MINIMO = 30;
/** Debajo van el rótulo y el valor; si la serie abarca más de un año, también el año. */
const ABAJO = 36;
const ABAJO_CON_ANIOS = 50;
const MARGEN_DERECHO_MINIMO = 100;
/** La letra del valor bajo cada columna y el aire mínimo que lo separa del de la columna vecina. */
const LETRA_VALOR = 10;
const AIRE_DEL_VALOR = 6;
/**
 * Lo más que ocupan las columnas de una serie corta cuando su franja se ensancha para que el valor quepa con su unidad: lo
 * de seis periodos a paso normal, que cabe en un teléfono (390 px). Una serie larga no se ensancha.
 */
const ANCHO_DE_SERIE_CORTA = 6 * PASO;
/** La letra más grande del valor y el estado que se imprimen sobre cada columna; con franjas angostas, menor. */
const LETRA_IMPRESA = 7.5;
/**
 * Un año con tantos periodos o más no cabe entero en un teléfono (390 px): su año se escribe también bajo su último
 * periodo, para que se lea al abrir la gráfica, que arranca en lo más reciente.
 */
const PERIODOS_PARA_REPETIR_ANIO = 8;

type Meta = { valor: number; texto: string } | { porPeriodo: (number | null)[]; texto: string };
type Limite = LimiteDeGrafica;

const cifra = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

/** El ancho aproximado de una etiqueta en el margen derecho (no hay medida de texto en el servidor). */
const anchoDeEtiqueta = (texto: string, tamano: number) => Math.ceil(texto.length * tamano * 0.56 + 16);

/**
 * El ancho aproximado del valor bajo una columna, en negrita: un poco más ancho por carácter que el de las etiquetas, para
 * pecar de holgado (no hay medida de texto en el servidor).
 */
export const anchoDelValor = (texto: string) => Math.ceil(texto.length * LETRA_VALOR * 0.6);

/**
 * El paso de las columnas y si el valor bajo cada una lleva su unidad (ola final, M7). La unidad se escribe si el valor más
 * largo cabe con ella en la franja, con su aire; en una serie corta la franja se ensancha hasta admitirla, sin pasar de
 * `ANCHO_DE_SERIE_CORTA`. Si no cabe, todos van sin unidad (la dice el eje): una sola decisión para la gráfica.
 */
export function pasoYUnidad(valores: readonly string[], periodos: number): { paso: number; conUnidad: boolean } {
  const necesario = Math.max(0, ...valores.map(anchoDelValor)) + AIRE_DEL_VALOR;
  const paso = necesario > PASO && necesario * Math.max(periodos, 1) <= ANCHO_DE_SERIE_CORTA ? necesario : PASO;
  return { paso, conUnidad: necesario <= paso };
}

const esPorcentaje = (u: Pick<Unidad, "sufijo">) => u.sufijo.trim() === "%";

/** «Crítico por encima de…» dentro de una frase. */
const enMinuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/** Los periodos seguidos con el mismo valor, de la serie. */
function tramosDe<T>(serie: PuntoDeSerie[], valores: readonly (T | null)[]): { valor: T | null; desde: number; hasta: number }[] {
  const tramos: { valor: T | null; desde: number; hasta: number }[] = [];
  serie.forEach((_, i) => {
    const valor = valores[i] ?? null;
    const ultimo = tramos.at(-1);
    if (ultimo && ultimo.valor === valor) ultimo.hasta = i;
    else tramos.push({ valor, desde: i, hasta: i });
  });
  return tramos;
}

/** Los valores del límite que entran en la escala; el de la etiqueta es el del último periodo que lo tiene. */
const valoresDelLimite = (l: Limite | undefined): number[] =>
  l === undefined ? [] : "valor" in l ? [l.valor] : l.porPeriodo.filter((v): v is number => v !== null);

/**
 * Lo que la gráfica dice de su meta y su límite a las tecnologías de apoyo (las etiquetas del dibujo no se leen):
 * «meta 85 %» o «meta entre 95 y 105 %», «la meta cambia por periodo (85 % de enero a marzo; …)» y el límite con la
 * misma frase de su etiqueta y de «Así quedará el semáforo» («crítico por debajo de 59,5 %»; Tarea 19, D-7), o «el
 * límite de crítico cambia por periodo (…)» si sigue a una meta programada (D-8).
 */
function lecturaDeReferencias(
  serie: PuntoDeSerie[],
  meta: Meta | undefined,
  limite: Limite | undefined,
  rango: { min: number; max: number } | undefined,
  conCifra: (n: number) => string,
): string[] {
  const partes: string[] = [];
  const cuando = (t: { desde: number; hasta: number }) =>
    t.desde === t.hasta ? `en ${serie[t.desde].etiqueta}` : `de ${serie[t.desde].etiqueta} a ${serie[t.hasta].etiqueta}`;
  if (rango) partes.push(`meta entre ${cifra.format(rango.min)} y ${conCifra(rango.max)}`);
  else if (meta && "valor" in meta) partes.push(`meta ${conCifra(meta.valor)}`);
  else if (meta) {
    const tramos = tramosDe(serie, meta.porPeriodo);
    if (tramos.length === 1 && tramos[0].valor !== null) partes.push(`meta ${conCifra(tramos[0].valor)}`);
    else if (tramos.some((t) => t.valor !== null)) {
      partes.push(
        `la meta cambia por periodo (${tramos.map((t) => (t.valor === null ? `sin meta ${cuando(t)}` : `${conCifra(t.valor)} ${cuando(t)}`)).join("; ")})`,
      );
    }
  }
  if (limite && "valor" in limite) partes.push(enMinuscula(limite.texto));
  else if (limite) {
    const tramos = tramosDe(serie, limite.textos);
    if (tramos.length === 1 && tramos[0].valor !== null) partes.push(enMinuscula(tramos[0].valor));
    else {
      partes.push(
        `el límite de crítico cambia por periodo (${tramos.map((t) => (t.valor === null ? `sin límite ${cuando(t)}` : `${enMinuscula(t.valor)} ${cuando(t)}`)).join("; ")})`,
      );
    }
  }
  return partes;
}

/**
 * La gráfica principal de un indicador (spec §11, estilo A «Tubos»): un tubo por periodo que se llena hasta su
 * resultado con el color de su estado, el valor escrito debajo, la meta como línea con su etiqueta en el margen derecho
 * (escalonada si cambia entre periodos), el límite de crítico punteado y, en tendencia constante, la franja del rango.
 * Sin meta, los tubos van en neutro y no hay líneas. Con más de un año, el eje marca dónde empieza cada uno. Cada franja
 * se enfoca con el teclado y dice su valor y su estado; la tarjeta (`TarjetaDeTubo`) lo repite al pasar el cursor. El
 * nombre de la figura y la tabla equivalente (`sr-only`) dicen además la meta y el límite. La escala va en su propio
 * lienzo, a la izquierda y fuera de lo que se desplaza: en un teléfono, o con muchos periodos, siempre se ve. Bajo un
 * periodo que aún no llega se escribe «—». Al imprimir, la hoja de estilos pone el relleno sólido y escribe el valor y el
 * estado sobre cada columna que tiene valor.
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
  /** El nombre de la figura y el título de la tabla equivalente; la gráfica les añade la meta y el límite. */
  titulo: string;
  /** Con `porPeriodo`, `texto` es solo el nombre («Meta»): la gráfica le añade la cifra de cada periodo. */
  meta?: Meta;
  /**
   * El límite de crítico. Quien llama lo pasa siempre que el indicador tenga umbral de crítico: sin esta línea punteada,
   * atención y crítico se distinguen solo por el color.
   */
  limite?: Limite;
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
  const referencias = [...metas, ...valoresDelLimite(limite), ...(rango ? [rango.min, rango.max] : [])];
  const e = escala(serie.flatMap((p) => (p.valor === null ? [] : [p.valor])), referencias, esPorcentaje(unidad));

  const conCifra = (m: number) => `${cifra.format(m)}${unidad.sufijo}`;
  const lectura = [titulo, lecturaDeReferencias(serie, meta, limite, rango, conCifra).join(", ")].filter(Boolean).join(": ");
  const ultimaMeta = metas.at(-1);
  const etiquetaMeta = meta === undefined || ultimaMeta === undefined ? null : "valor" in meta ? meta.texto : `${meta.texto} ${conCifra(ultimaMeta)}`;
  const anchoMeta = etiquetaMeta ? anchoDeEtiqueta(etiquetaMeta, 9.5) : 0;
  const anchoLimite = limite ? anchoDeEtiqueta(limite.texto, 9) : 0;
  const der = Math.max(MARGEN_DERECHO_MINIMO, Math.max(anchoMeta, anchoLimite) + 12);
  // Los rótulos de la escala, el de arriba con su unidad, en un lienzo angosto que no se desplaza (siempre se ven).
  const rotulos = e.marcas.map((m, i) => ({ m, texto: i === e.marcas.length - 1 ? conCifra(m) : cifra.format(m) }));
  const eje = Math.max(EJE_MINIMO, ...rotulos.map((r) => Math.ceil(r.texto.length * 9.5 * 0.56) + 10));
  const anios = cambiosDeAnio(serie.map((p) => p.clave));
  const abajo = anios.length > 0 ? ABAJO_CON_ANIOS : ABAJO;
  const { paso, conUnidad } = pasoYUnidad(
    serie.filter((p) => p.valor !== null).map((p) => p.texto),
    serie.length,
  );
  const g: Geometria = {
    ancho: anchoDeLienzo(serie.length, { izq: MARGEN.izq, der }, paso),
    alto: MARGEN.arriba + ALTO_PISTA + abajo,
    margen: { ...MARGEN, der, abajo },
  };
  const base = MARGEN.arriba + ALTO_PISTA;
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
    // Lo que no ha llegado lleva «—»: un texto largo se encima con el de la franja vecina. El nombre lo dice la zona.
    if (p.estado === "futuro") return "—";
    if (p.valor === null || conUnidad || !p.texto.endsWith(unidad.sufijo)) return p.texto;
    // Sin su unidad (la dice el eje), y sin el espacio que la precedía.
    return p.texto.slice(0, p.texto.length - unidad.sufijo.length).trimEnd();
  };

  // Al imprimir, sobre cada columna con valor van su valor y su estado, en dos líneas, con una letra que quepa en la
  // franja (doce meses en una hoja vertical); sobre las demás nada: debajo ya dicen «s. d.», «n. a.» o «—».
  const impresos = serie.filter((p) => p.valor !== null).flatMap((p) => [p.texto, p.nombreEstado]);
  const largo = Math.max(1, ...impresos.map((t) => t.length));
  const letraImpresa = Math.max(4, Math.min(LETRA_IMPRESA, Math.floor(((franja - 2) / (largo * 0.56)) * 10) / 10));

  const yMeta = meta === undefined || ultimaMeta === undefined ? null : y(ultimaMeta);
  const ultimoLimite = valoresDelLimite(limite).at(-1);
  const yLimite = ultimoLimite === undefined ? null : y(ultimoLimite);
  // Dos etiquetas casi a la misma altura se separan; la de la meta se queda junto a su línea.
  const yEtiquetaLimite =
    yLimite === null ? null : yMeta !== null && Math.abs(yLimite - yMeta) < 20 ? yMeta + (yLimite >= yMeta ? 20 : -20) : yLimite;

  // El año bajo el primer periodo de cada uno (y bajo el último del año más reciente si no cabe en un teléfono).
  const rotulosDeAnio = anios.flatMap((a, k) => {
    const hasta = (anios[k + 1]?.indice ?? serie.length) - 1;
    const inicio = { x: MARGEN.izq + a.indice * franja + 2, anclaje: "start" as const, anio: a.anio, clave: `${a.anio}-inicio` };
    const repetir = k === anios.length - 1 && hasta - a.indice + 1 >= PERIODOS_PARA_REPETIR_ANIO;
    return repetir ? [inicio, { x: MARGEN.izq + (hasta + 1) * franja - 2, anclaje: "end" as const, anio: a.anio, clave: `${a.anio}-fin` }] : [inicio];
  });

  return (
    <figure className="flex min-w-0 flex-col">
      <TarjetaDeTubo>
        {/*
          Dos columnas en la proporción de sus lienzos: cuando caben, los dos se agrandan por igual y la escala sigue a la
          misma altura que los tubos; cuando no, la escala queda a 1:1 y lo de la derecha se desplaza a 1:1.
        */}
        <div
          className="grid items-start"
          style={{ gridTemplateColumns: `minmax(${eje}px, ${eje}fr) minmax(0, ${g.ancho}fr)`, maxWidth: Math.round((eje + g.ancho) * ESCALA_MAXIMA) }}
        >
          <svg viewBox={`0 0 ${eje} ${g.alto}`} aria-hidden="true" className="tubo-eje block h-auto w-full">
            {rotulos.map((r) => (
              <text key={r.m} x={eje - 4} y={y(r.m) + 3.5} textAnchor="end" fontSize={9.5} className="fill-muted-foreground">
                {r.texto}
              </text>
            ))}
          </svg>
          <DesplazableDeTubos inicio={columnaInicial(serie)} className="tubo-desplazable min-w-0 overflow-x-auto [direction:rtl]">
            <svg viewBox={`0 0 ${g.ancho} ${g.alto}`} className="tubo-lienzo block h-auto w-full [direction:ltr]" style={{ minWidth: g.ancho }}>
              <DefinicionesDeTubo id={id} clases={clases} pistas={tubos.map((t) => ({ x: t.x, y: tope, ancho: t.ancho, alto: base - tope }))} />
              <g role="img" aria-label={lectura}>
                {e.marcas.map((m) => (
                  <line key={m} data-marca={m} x1={0} x2={derecha} y1={y(m)} y2={y(m)} className="stroke-border" strokeWidth={1} />
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
                {tubos.map((t, i) => {
                  const p = serie[i];
                  return (
                    <TuboSvg
                      key={p.clave}
                      id={id}
                      indice={i}
                      tubo={t}
                      tope={tope}
                      base={base}
                      futuro={p.estado === "futuro"}
                      clase={p.valor === null ? null : claseDeRelleno(p.estado)}
                      negativo={p.valor !== null && p.valor < 0}
                    />
                  );
                })}
                {anios.slice(1).map((a) => (
                  <line
                    key={a.anio}
                    className="tubo-anio stroke-border"
                    x1={MARGEN.izq + a.indice * franja}
                    x2={MARGEN.izq + a.indice * franja}
                    y1={tope - 4}
                    y2={g.alto - 2}
                    strokeWidth={1}
                    strokeDasharray="2 2"
                  />
                ))}
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
                      {p.valor !== null ? (
                        <text className="tubo-impreso" x={t.centro} y={tope - 4 - letraImpresa * 1.2} textAnchor="middle" fontSize={letraImpresa}>
                          <tspan x={t.centro}>{p.texto}</tspan>
                          <tspan x={t.centro} dy={letraImpresa * 1.2}>
                            {p.nombreEstado}
                          </tspan>
                        </text>
                      ) : null}
                    </g>
                  );
                })}
                {rotulosDeAnio.map((r) => (
                  <text
                    key={r.clave}
                    className="tubo-anio fill-muted-foreground font-semibold"
                    x={r.x}
                    y={base + 43}
                    textAnchor={r.anclaje}
                    fontSize={9.5}
                  >
                    {r.anio}
                  </text>
                ))}
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
                    data-columna={i}
                    data-periodo={p.etiqueta}
                    data-valor={p.valor === null ? "" : p.texto}
                    data-estado={p.estado}
                    data-nombre={p.nombreEstado}
                    data-meta={metaDe(i)}
                  />
                ))}
              </g>
            </svg>
          </DesplazableDeTubos>
        </div>
      </TarjetaDeTubo>
      <figcaption className="sr-only">
        <table>
          <caption>{lectura}</caption>
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

/** La meta (recta o escalonada, con huecos donde no hay) y el límite de crítico punteado, que se escalona con ella. */
function Lineas({
  meta,
  limite,
  y,
  izq,
  derecha,
  franja,
}: {
  meta?: Meta;
  limite?: Limite;
  y: (v: number) => number;
  izq: number;
  derecha: number;
  franja: number;
}) {
  // Una línea escalonada, con huecos donde el periodo no tiene valor: la de la meta y la del límite que la sigue.
  const escalonar = (porPeriodo: readonly (number | null)[]) => {
    let d = "";
    let anterior = false;
    porPeriodo.forEach((m, i) => {
      if (m === null) {
        anterior = false;
        return;
      }
      d += `${anterior ? "V" : `M${izq + i * franja},`}${y(m)}H${izq + (i + 1) * franja}`;
      anterior = true;
    });
    return d;
  };
  const escalonada = meta && "porPeriodo" in meta ? escalonar(meta.porPeriodo) : "";
  const limiteEscalonado = limite && "porPeriodo" in limite ? escalonar(limite.porPeriodo) : "";
  return (
    <>
      {limiteEscalonado ? (
        <path className="tubo-limite stroke-muted-foreground" d={limiteEscalonado} fill="none" strokeWidth={1.2} strokeDasharray="3 3" />
      ) : null}
      {limite && "valor" in limite ? (
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
