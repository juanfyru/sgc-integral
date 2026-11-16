import { IconoFormato } from "@/componentes/documentos/IconoFormato";
import { Insignia } from "@/componentes/ui/Insignia";
import { celda, celdaNumerica, TablaDatos, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import type { EventoDeDato, PeriodoDeDato } from "@/db/consultas/indicadores/datos-periodos";
import type { Soporte } from "@/db/consultas/indicadores/soportes";
import { rutaDeSoporteDeDato } from "@/lib/indicadores/rutas";
import { cuenta } from "@/lib/plural";
import { fechaHoraLarga } from "@/lib/zona-horaria";
import { cifraDeDato, diaCorto, etiquetaDePeriodo, InsigniaPorReportar, paraReportar } from "./comun";
import { AccionDelPeriodo } from "./ReportarDato";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const SIN_NADIE_MAS = " (sin nadie más que pudiera reportarlo)";

type Guardado = { valor?: unknown; porCategoria?: unknown };

const objeto = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const enTexto = (v: unknown) => (typeof v === "string" && v !== "" ? cifraDeDato(v) : "?");

/** La última corrección del periodo, con su antes: lo que la tabla dice junto al valor y a quien lo reportó. */
const ultimaCorreccion = (eventos: EventoDeDato[]) => [...eventos].reverse().find((e) => e.tipo === "correccion") ?? null;

/** «Sede norte: 700 → 720»: las categorías que cambian entre lo que había y lo que quedó. */
function categoriasQueCambian(antes: Guardado, despues: Guardado, nombres: Map<string, string>): string[] {
  const a = objeto(antes.porCategoria);
  const b = objeto(despues.porCategoria);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((id) => a[id] !== b[id])
    .map((id) => `${nombres.get(id) ?? "Categoría"}: ${enTexto(a[id])} → ${enTexto(b[id])}`);
}

/** Lo que pasó en un evento del periodo, en una frase armada solo con su detalle. */
function fraseDelEvento(e: EventoDeDato, nombres: Map<string, string>): string {
  const d = e.detalle;
  const marca = d.sinResponsable === true ? SIN_NADIE_MAS : "";
  switch (e.tipo) {
    case "reporte": {
      const porCategoria = Object.entries(objeto(d.porCategoria)).map(([id, v]) => `${nombres.get(id) ?? "Categoría"}: ${enTexto(v)}`);
      return `Reportó ${enTexto(d.valor)}${porCategoria.length > 0 ? ` (${porCategoria.join("; ")})` : ""}${marca}`;
    }
    case "correccion": {
      const antes = objeto(d.antes) as Guardado;
      const despues = objeto(d.despues) as Guardado;
      const cambios = categoriasQueCambian(antes, despues, nombres);
      return `Corrigió: ${enTexto(antes.valor)} → ${enTexto(despues.valor)}${cambios.length > 0 ? ` (${cambios.join("; ")})` : ""}${marca}`;
    }
    case "soporte":
      return `${d.accion === "quitado" ? "Quitó" : "Subió"} el soporte «${typeof d.nombre === "string" ? d.nombre : "?"}»${marca}`;
    case "cierre":
      return "Se cerró el periodo";
    case "reapertura":
      return `Se reabrió el periodo${typeof d.justificacion === "string" && d.justificacion ? `: ${d.justificacion}` : ""}${marca}`;
    default:
      return e.tipo;
  }
}

/** El estado de un periodo en la tabla: el texto lleva el estado, el color no es la única señal. */
function Estado({ periodo, ahora }: { periodo: PeriodoDeDato; ahora: Date }) {
  if (periodo.estado === "cerrado") return <Insignia variante="sin-dato">Cerrado</Insignia>;
  if (periodo.estado === "reportado") return <Insignia variante="neutra">{periodo.corregido ? "Corregido" : "Reportado"}</Insignia>;
  if (periodo.sePide) return <InsigniaPorReportar venceEn={periodo.venceEn} ahora={ahora} />;
  return <Insignia variante="sin-dato">Ya no se pide</Insignia>;
}

/** Un periodo sin cerrar, salvo el pendiente que ya no se pide: ese solo conserva sus soportes para descargarlos. */
const seReportaDesdeLaFila = (p: PeriodoDeDato) => p.estado === "reportado" || (p.estado === "pendiente" && p.sePide);

function Soportes({ datoId, soportes }: { datoId: number; soportes: Soporte[] }) {
  if (soportes.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="flex list-none flex-col gap-1">
      {soportes.map((s) => (
        <li key={s.id} className="flex min-w-0 flex-wrap items-center gap-2">
          <a href={rutaDeSoporteDeDato(datoId, s.id)} className={`min-w-0 break-words rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`}>
            {s.nombre}
          </a>
          <IconoFormato mime={s.mime} tamanoBytes={s.tamano} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Los periodos de un dato (anexo 14C, §4.4 y §4.7, maqueta 12), del más reciente al más viejo: su valor y, si se corrigió,
 * el de antes; quién lo reportó y quién lo corrigió; sus soportes y su estado. Con `editable` (quien puede reportar el dato),
 * desde su fila se corrige un periodo reportado sin cerrar y se reporta uno pendiente que se pide. Debajo, el historial de
 * cada periodo, de solo inserción: qué
 * había, qué quedó, quién y cuándo.
 */
export function HistorialDelDato({
  datoId,
  periodos,
  historiales,
  soportes,
  editable,
  ahora,
}: {
  datoId: number;
  periodos: PeriodoDeDato[];
  historiales: Map<number, EventoDeDato[]>;
  soportes: Map<number, Soporte[]>;
  editable: boolean;
  ahora: Date;
}) {
  const columnas: ColumnaTabla[] = [
    { clave: "periodo", etiqueta: "Periodo" },
    { clave: "valor", etiqueta: "Valor", numerica: true },
    { clave: "reporto", etiqueta: "Lo reportó" },
    { clave: "soporte", etiqueta: "Soporte" },
    { clave: "estado", etiqueta: "Estado" },
    ...(editable ? [{ clave: "accion", etiqueta: "Acción", oculta: true }] : []),
  ];
  const conHistoria = periodos.filter((p) => (historiales.get(p.id) ?? []).length > 0);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <TablaDatos titulo="Periodos del dato" columnas={columnas} filas={periodos.length} vacio="Aún no se pide ningún periodo de este dato.">
        {periodos.map((p) => {
          const correccion = ultimaCorreccion(historiales.get(p.id) ?? []);
          const antes = correccion ? objeto(objeto(correccion.detalle).antes).valor : undefined;
          return (
            <tr key={p.id}>
              <td className={`${celda} whitespace-nowrap`}>{etiquetaDePeriodo(p.periodo, true)}</td>
              <td className={`${celdaNumerica} whitespace-nowrap`}>
                {p.valor === null ? <span className="text-muted-foreground">—</span> : cifraDeDato(p.valor)}
                {typeof antes === "string" ? <span className="block text-xs text-muted-foreground">{`antes ${cifraDeDato(antes)}`}</span> : null}
              </td>
              {/* Con ancho mínimo: a 390 px el nombre no se parte en un renglón por palabra (la tabla ya se desplaza). */}
              <td className={`${celda} min-w-48`}>
                {p.reporto ? (
                  <span>{p.reportadoEn ? `${p.reporto} · ${diaCorto(p.reportadoEn)}` : p.reporto}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
                {correccion ? (
                  <span className="block text-xs text-muted-foreground">{`lo corrigió ${correccion.quien ?? "el sistema"} · ${diaCorto(correccion.cuando)}`}</span>
                ) : null}
              </td>
              <td className={celda}>
                <Soportes datoId={datoId} soportes={soportes.get(p.id) ?? []} />
              </td>
              <td className={celda}>
                <Estado periodo={p} ahora={ahora} />
              </td>
              {editable ? (
                <td className={celda}>
                  {seReportaDesdeLaFila(p) ? (
                    <AccionDelPeriodo datoId={datoId} periodo={paraReportar(p, ahora)} soportes={soportes.get(p.id) ?? []} />
                  ) : null}
                </td>
              ) : null}
            </tr>
          );
        })}
      </TablaDatos>

      {conHistoria.length > 0 ? (
        <section aria-labelledby="historial-del-dato" className="flex min-w-0 flex-col gap-2">
          <h3 id="historial-del-dato" className="text-sm font-semibold">
            Historial
          </h3>
          <p className="text-sm text-muted-foreground">Cada cambio queda con lo que había, lo que quedó, quién lo hizo y cuándo. No se borra.</p>
          {conHistoria.map((p) => {
            const eventos = historiales.get(p.id) ?? [];
            const nombres = new Map((p.categorias ?? []).map((c) => [String(c.id), c.nombre]));
            return (
              <details key={p.id} className="rounded-md border border-border px-3 py-2">
                <summary className={`cursor-pointer rounded-sm text-sm font-medium ${FOCO}`}>
                  {`${etiquetaDePeriodo(p.periodo, true)} · ${cuenta(eventos.length, "movimiento", "movimientos")}`}
                </summary>
                <ol className="mt-2 flex list-none flex-col gap-1.5 text-sm">
                  {eventos.map((e, k) => (
                    <li key={k} className="break-words">
                      {fraseDelEvento(e, nombres)}
                      <span className="block text-xs text-muted-foreground">{`${e.quien ?? "El sistema"}, ${fechaHoraLarga(e.cuando)}`}</span>
                    </li>
                  ))}
                </ol>
              </details>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
