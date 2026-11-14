import Link from "next/link";
import { Insignia, type VarianteInsignia } from "@/componentes/ui/Insignia";
import { celda, celdaNumerica, TablaDatos } from "@/componentes/ui/TablaDatos";
import type { ObjetivoLeido } from "@/db/consultas/indicadores/objetivos";
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

/** Las clases de objetivo, en el orden de la página. */
const CLASES: { clase: ObjetivoLeido["clase"]; titulo: string }[] = [
  { clase: "calidad", titulo: "Objetivos de calidad" },
  { clase: "institucional", titulo: "Objetivos institucionales" },
];

/** El color del estado de un objetivo; el texto va siempre con él. */
const VARIANTE: Record<EstadoDeObjetivo, VarianteInsignia> = {
  cumplido: "bien",
  no_cumplido: "critico",
  sin_medicion: "sin-dato",
};

/**
 * Un objetivo en su tarjeta (anexo 14B, §7): su enunciado, su estado escrito y la tabla de sus indicadores, cada uno con
 * la medición que se tomó en el periodo (código enlazado, nombre, proceso, periodo y resultado con su estado y la salvedad
 * «no alcanza la meta»). Sin indicadores que la persona vea, lo dice.
 */
function TarjetaObjetivo({ objetivo: o }: { objetivo: ObjetivoLeido }) {
  const titulo = `objetivo-${o.id}`;
  return (
    <article aria-labelledby={titulo} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={titulo} className="min-w-0 break-words font-medium">
          {o.enunciado}
        </h3>
        <Insignia variante={VARIANTE[o.estado]}>{ETIQUETA_ESTADO_OBJETIVO[o.estado]}</Insignia>
      </div>
      {o.indicadores.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin indicadores que mostrar</p>
      ) : (
        <TablaDatos titulo={`Indicadores del objetivo: ${o.enunciado}`} columnas={COLUMNAS} filas={o.indicadores.length} vacio="Sin indicadores que mostrar">
          {o.indicadores.map((i) => (
            <tr key={i.codigo}>
              <td className={`${celda} whitespace-nowrap font-mono text-xs`}>
                <Link href={rutaDeIndicador(i.codigo)} className={ENLACE}>
                  {i.codigo}
                </Link>
              </td>
              <td className={`${celda} min-w-48 break-words`}>{i.nombre || "(sin nombre)"}</td>
              <td className={`${celda} min-w-32`}>{i.proceso}</td>
              <td className={`${celda} whitespace-nowrap`}>{i.periodo ?? <span className="text-muted-foreground">—</span>}</td>
              <td className={`${celdaNumerica} whitespace-nowrap`}>{i.resultado ?? <span className="text-muted-foreground">sin dato</span>}</td>
              <td className={celda}>
                <InsigniaSemaforo semaforo={i.semaforo} cumple={i.cumple} conResultado={i.resultado !== null} />
              </td>
            </tr>
          ))}
        </TablaDatos>
      )}
    </article>
  );
}

/** Los objetivos de la página «Objetivos» (anexo 14B, §7), por clase, cada uno en su tarjeta. Una clase sin objetivos no se pinta. */
export function Objetivos({ objetivos }: { objetivos: ObjetivoLeido[] }) {
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
              <TarjetaObjetivo key={o.id} objetivo={o} />
            ))}
        </section>
      ))}
    </div>
  );
}
