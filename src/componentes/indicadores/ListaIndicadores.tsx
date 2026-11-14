import Link from "next/link";
import { BarraEstados } from "@/componentes/ui/BarraEstados";
import { Insignia } from "@/componentes/ui/Insignia";
import { celda, celdaNumerica, TablaDatos } from "@/componentes/ui/TablaDatos";
import { Tendencia } from "@/componentes/ui/Tendencia";
import { rotuloCorto, type EstadoDePunto } from "@/componentes/ui/geometria-tubos";
import type { FilaDeLista, ResumenDeLista } from "@/db/consultas/indicadores/lista";
import { rutaDeIndicador } from "@/lib/indicadores/rutas";
import { FLECHA_DE_CAMBIO } from "@/lib/indicadores/textos";
import { ETIQUETA_PERIODICIDAD } from "@/lib/indicadores/tipos";
import { cuenta } from "@/lib/plural";
import { InsigniaSemaforo } from "./InsigniaSemaforo";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const ENLACE = `rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`;

const COLUMNAS = [
  { clave: "codigo", etiqueta: "Código" },
  { clave: "indicador", etiqueta: "Indicador" },
  { clave: "periodo", etiqueta: "Periodo" },
  { clave: "resultado", etiqueta: "Resultado", numerica: true },
  { clave: "meta", etiqueta: "Meta", numerica: true },
  { clave: "estado", etiqueta: "Estado" },
  { clave: "tendencia", etiqueta: "Tendencia" },
  { clave: "reporte", etiqueta: "Reporte" },
];

const sinFicha = (f: FilaDeLista) => f.estado === "borrador" || f.estado === "descartado";

/** Las marcas del indicador junto a su nombre (spec §12.2): «Restringido», «Retirado» y, para quien administra, su borrador. */
function Marcas({ f }: { f: FilaDeLista }) {
  const marcas: { texto: string; variante: "neutra" | "sin-dato" | "atencion" }[] = [];
  if (f.restringido) marcas.push({ texto: "Restringido", variante: "neutra" });
  if (f.retirado) marcas.push({ texto: "Retirado", variante: "sin-dato" });
  if (f.estado === "borrador") marcas.push({ texto: "Borrador", variante: "atencion" });
  if (f.estado === "descartado") marcas.push({ texto: "Descartado", variante: "sin-dato" });
  if (f.cambioEnCurso) marcas.push({ texto: f.cambioEnCurso === "borrador" ? "Cambio en borrador" : "Cambio por aprobar", variante: "atencion" });
  if (marcas.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {marcas.map((m) => (
        <Insignia key={m.texto} variante={m.variante}>
          {m.texto}
        </Insignia>
      ))}
    </span>
  );
}

/** «T3 2026», «Oct 2026», «2026»: corto a la vista y entero para los lectores de pantalla. */
function Periodo({ f }: { f: FilaDeLista }) {
  if (!f.periodo || !f.etiquetaPeriodo) return <span className="text-muted-foreground">—</span>;
  const anual = /^\d{4}$/.test(f.periodo);
  return (
    <>
      <span aria-hidden="true" className="whitespace-nowrap">
        {anual ? f.periodo : `${rotuloCorto(f.periodo, f.etiquetaPeriodo)} ${f.periodo.slice(0, 4)}`}
      </span>
      <span className="sr-only">{f.etiquetaPeriodo}</span>
    </>
  );
}

/**
 * La tendencia en miniatura (con dos periodos con dato o más; si no, «un solo periodo» o «—») y, escrita siempre que haya
 * comparación, hacia dónde fue el último valor y si eso es mejorar (spec §8.3 y §11): el periodo anterior medido puede
 * quedar fuera de los seis de la miniatura.
 */
function TendenciaDeFila({ f }: { f: FilaDeLista }) {
  const conDato = f.tendencia.filter((v) => v !== null).length;
  const final: EstadoDePunto = f.semaforo ?? (f.noAplica ? "no-aplica" : f.resultado ? "sin-meta" : "sin-dato");
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 whitespace-nowrap">
      {conDato >= 2 ? (
        <Tendencia valores={f.tendencia} estadoFinal={final} descripcion={`Tendencia de los últimos ${f.tendencia.length} periodos`} />
      ) : (
        <span className="text-muted-foreground">{conDato === 0 ? "—" : "un solo periodo"}</span>
      )}
      {f.flecha ? (
        <span className="text-xs">
          <span aria-hidden="true">{FLECHA_DE_CAMBIO[f.flecha]} </span>
          {f.flecha}
          {f.mejora === null ? null : f.mejora ? " · mejora" : " · empeora"}
        </span>
      ) : null}
    </span>
  );
}

/** La barra de estados de la lista, con su lectura en texto, y los reportes vencidos. */
export function BarraDeLista({ resumen }: { resumen: ResumenDeLista }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <BarraEstados bien={resumen.bien} bienSinAlcanzar={resumen.bienSinAlcanzar} atencion={resumen.atencion} critico={resumen.critico} sinDato={resumen.sinDato} noAplica={resumen.noAplica} />
      <p className="text-sm text-muted-foreground">
        {resumen.vencidos === 0 ? "Ningún reporte vencido." : `${cuenta(resumen.vencidos, "reporte vencido", "reportes vencidos")}.`}
      </p>
    </div>
  );
}

/**
 * La lista de indicadores (spec §12.2 y §11, maqueta 4): arriba, la barra con cuántos hay en cada estado y su lectura en
 * texto, y los reportes vencidos; en cada fila el último periodo terminado, su resultado y su meta, el estado escrito, la
 * tendencia en miniatura y el estado del reporte. Lo que no tiene ficha aprobada (un borrador, que solo le llega a quien
 * administra) va sin periodo ni estado.
 */
export function ListaIndicadores({ filas, resumen }: { filas: FilaDeLista[]; resumen: ResumenDeLista }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <BarraDeLista resumen={resumen} />
      <TablaDatos titulo="Indicadores" columnas={COLUMNAS} filas={filas.length} vacio="Sin indicadores.">
        {filas.map((f) => (
          <tr key={f.id}>
            <td className={`${celda} whitespace-nowrap font-mono text-xs`}>{f.codigo}</td>
            <td className={`${celda} min-w-56`}>
              <span className="flex flex-col gap-1">
                <Link href={rutaDeIndicador(f.codigo)} className={`break-words ${ENLACE}`}>
                  {f.nombre || "(sin nombre)"}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {`${f.proceso}${f.subproceso ? ` › ${f.subproceso}` : ""}${f.periodicidad ? ` · ${ETIQUETA_PERIODICIDAD[f.periodicidad]}` : ""}`}
                </span>
                <Marcas f={f} />
              </span>
            </td>
            <td className={celda}>
              <Periodo f={f} />
            </td>
            <td className={`${celdaNumerica} whitespace-nowrap`}>
              {f.resultado ?? <span className="text-muted-foreground">{f.noAplica ? "n. a." : sinFicha(f) ? "—" : "sin dato"}</span>}
            </td>
            <td className={`${celdaNumerica} whitespace-nowrap`}>{f.meta ?? "—"}</td>
            <td className={celda}>
              {sinFicha(f) ? <span className="text-muted-foreground">—</span> : <InsigniaSemaforo semaforo={f.semaforo} cumple={f.cumple} noAplica={f.noAplica} conResultado={f.resultado !== null} />}
            </td>
            <td className={celda}>
              <TendenciaDeFila f={f} />
            </td>
            <td className={`${celda} ${f.reporte.vencida ? "font-semibold" : ""}`}>{f.reporte.texto}</td>
          </tr>
        ))}
      </TablaDatos>
    </div>
  );
}
