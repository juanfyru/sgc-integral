import Link from "next/link";
import { Insignia, type VarianteInsignia } from "@/componentes/ui/Insignia";
import { celda, celdaNumerica, TablaDatos } from "@/componentes/ui/TablaDatos";
import type { IndicadorDeObjetivo, ObjetivoLeido } from "@/db/consultas/indicadores/objetivos";
import { ETIQUETA_ESTADO_OBJETIVO, type EstadoDeObjetivo } from "@/lib/indicadores/objetivos";
import { rutaDeIndicador } from "@/lib/indicadores/rutas";
import { InsigniaSemaforo } from "./InsigniaSemaforo";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const ENLACE = `rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`;

const COLUMNAS = [
  { clave: "codigo", etiqueta: "Código" },
  { clave: "indicador", etiqueta: "Indicador" },
  { clave: "proceso", etiqueta: "Proceso" },
  { clave: "periodo", etiqueta: "Periodo" },
  { clave: "resultado", etiqueta: "Resultado", numerica: true },
  { clave: "estado", etiqueta: "Estado" },
];

/**
 * Lo que Mejoramiento dice de un objetivo (Fase 15B, anexo §10.5): «4 hallazgos abiertos», con su enlace a la lista filtrada. Lo decide
 * la página con Mejoramiento (`abiertosPorObjetivo`); un objetivo sin hallazgos que la persona vea no lo trae, ni con un cero.
 */
export type HallazgosDeObjetivo = Readonly<Record<number, { texto: string; href: string }>>;

/** Las clases de objetivo, en el orden de la página. */
const CLASES: { clase: ObjetivoLeido["clase"]; titulo: string }[] = [
  { clase: "calidad", titulo: "Objetivos de calidad" },
  { clase: "institucional", titulo: "Objetivos institucionales" },
];

/**
 * Lo que dice la fila del indicador que resume los objetivos (§5.2): su insignia puede no coincidir con el estado del
 * objetivo, porque no cuenta para él.
 */
const NO_CUENTA = "No cuenta para el estado de este objetivo: es el indicador que resume los objetivos.";

/** El color del estado de un objetivo; el texto va siempre con él. */
const VARIANTE: Record<EstadoDeObjetivo, VarianteInsignia> = {
  cumplido: "bien",
  no_cumplido: "critico",
  sin_medicion: "sin-dato",
};

// Lo que se muestra de cada indicador, igual en la tabla y en la lista del celular.

function Codigo({ i }: { i: IndicadorDeObjetivo }) {
  return (
    <Link href={rutaDeIndicador(i.codigo)} className={ENLACE}>
      {i.codigo}
    </Link>
  );
}

/** El nombre y, en el que no cuenta para el estado del objetivo, por qué. */
function Nombre({ i }: { i: IndicadorDeObjetivo }) {
  return (
    <span className="flex flex-col gap-1">
      <span className="break-words">{i.nombre || "(sin nombre)"}</span>
      {i.cuenta ? null : <span className="text-xs text-muted-foreground">{NO_CUENTA}</span>}
    </span>
  );
}

function Resultado({ i }: { i: IndicadorDeObjetivo }) {
  return <>{i.resultado ?? <span className="text-muted-foreground">sin dato</span>}</>;
}

/** El estado escrito: «Bien», «Bien · no alcanza la meta», «Atención», «Crítico», «Sin meta» o «Sin dato». */
function Estado({ i }: { i: IndicadorDeObjetivo }) {
  return <InsigniaSemaforo semaforo={i.semaforo} cumple={i.cumple} conResultado={i.resultado !== null} />;
}

/**
 * Un objetivo en su tarjeta (anexo 14B, §7): su enunciado, su estado escrito y sus indicadores, cada uno con la medición
 * que se tomó en el periodo (código enlazado, nombre, proceso, periodo y resultado con su estado y la salvedad «no alcanza
 * la meta»); el que no cuenta para el estado del objetivo lo dice debajo de su nombre. Tabla en pantallas anchas y tarjetas
 * en el celular. Sin indicadores que la persona vea, lo dice.
 */
function TarjetaObjetivo({ objetivo: o, hallazgos }: { objetivo: ObjetivoLeido; hallazgos?: { texto: string; href: string } }) {
  const titulo = `objetivo-${o.id}`;
  const tituloDeIndicadores = `Indicadores del objetivo: ${o.enunciado}`;
  return (
    <article aria-labelledby={titulo} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={titulo} className="min-w-0 break-words font-medium">
          {o.enunciado}
        </h3>
        <Insignia variante={VARIANTE[o.estado]}>{ETIQUETA_ESTADO_OBJETIVO[o.estado]}</Insignia>
      </div>
      {hallazgos ? (
        <p className="text-sm">
          <Link href={hallazgos.href} className={ENLACE}>
            {hallazgos.texto}
            <span aria-hidden="true"> →</span>
          </Link>
        </p>
      ) : null}
      {o.indicadores.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin indicadores que mostrar</p>
      ) : (
        <>
          <div className="hidden md:block">
            <TablaDatos titulo={tituloDeIndicadores} columnas={COLUMNAS} filas={o.indicadores.length} vacio="Sin indicadores que mostrar">
              {o.indicadores.map((i) => (
                <tr key={i.codigo}>
                  <td className={`${celda} whitespace-nowrap font-mono text-xs`}>
                    <Codigo i={i} />
                  </td>
                  <td className={`${celda} min-w-48`}>
                    <Nombre i={i} />
                  </td>
                  <td className={`${celda} min-w-32`}>{i.proceso}</td>
                  <td className={`${celda} whitespace-nowrap`}>{i.periodo ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className={`${celdaNumerica} whitespace-nowrap`}>
                    <Resultado i={i} />
                  </td>
                  <td className={celda}>
                    <Estado i={i} />
                  </td>
                </tr>
              ))}
            </TablaDatos>
          </div>
          <ul className="flex list-none flex-col gap-3 md:hidden" aria-label={tituloDeIndicadores}>
            {o.indicadores.map((i) => (
              <li key={i.codigo} className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3 text-sm">
                <div className="flex min-w-0 flex-col items-start gap-1">
                  <span className="font-mono text-xs">
                    <Codigo i={i} />
                  </span>
                  <Nombre i={i} />
                </div>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                  <dt className="text-muted-foreground">Proceso</dt>
                  <dd className="break-words">{i.proceso}</dd>
                  {/* Sin medición, el periodo no se pinta. */}
                  {i.periodo ? (
                    <>
                      <dt className="text-muted-foreground">Periodo</dt>
                      <dd>{i.periodo}</dd>
                    </>
                  ) : null}
                  <dt className="text-muted-foreground">Resultado</dt>
                  <dd className="tabular-nums">
                    <Resultado i={i} />
                  </dd>
                  <dt className="text-muted-foreground">Estado</dt>
                  <dd>
                    <Estado i={i} />
                  </dd>
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}

/**
 * Los objetivos de la página «Objetivos» (anexo 14B, §7), por clase, cada uno en su tarjeta. Una clase sin objetivos no se pinta. Con
 * `hallazgos` (Fase 15B, anexo §10.5), cada objetivo que lo trae dice cuántos hallazgos abiertos apuntan a él; los demás, nada.
 */
export function Objetivos({ objetivos, hallazgos = {} }: { objetivos: ObjetivoLeido[]; hallazgos?: HallazgosDeObjetivo }) {
  return (
    <div className="flex min-w-0 flex-col gap-8">
      {CLASES.filter((c) => objetivos.some((o) => o.clase === c.clase)).map((c) => (
        <section key={c.clase} aria-labelledby={`clase-${c.clase}`} className="flex min-w-0 flex-col gap-4">
          <h2 id={`clase-${c.clase}`} className="font-display text-lg font-semibold">
            {c.titulo}
          </h2>
          {objetivos
            .filter((o) => o.clase === c.clase)
            .map((o) => (
              <TarjetaObjetivo key={o.id} objetivo={o} hallazgos={hallazgos[o.id]} />
            ))}
        </section>
      ))}
    </div>
  );
}
