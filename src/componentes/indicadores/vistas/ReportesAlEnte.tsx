import { Insignia, type VarianteInsignia } from "@/componentes/ui/Insignia";
import { celda, TablaDatos, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import type { Constancia, EnteDeLaFicha, EventoDeConstancia, ResultadoExterno } from "@/db/consultas/indicadores/constancias";
import type { Soporte } from "@/db/consultas/indicadores/soportes";
import { avisoDeParcial } from "@/lib/indicadores/constancias";
import { fechaYHora } from "@/lib/indicadores/ficha-en-texto";
import { enlaceDeSoporte } from "@/lib/indicadores/soportes";
import { textoFecha } from "@/lib/vigencia/plazo";
import { zonaHoraria } from "@/lib/zona-horaria";
import { ENLACE, FOCO, Recuadro } from "./comun";
import { CorregirEnvio, RegistrarEnvio } from "./FormulariosDeConstancia";

export type DatosDeReportes = {
  codigo: string;
  ente: EnteDeLaFicha;
  /** De la más reciente a la más antigua. */
  constancias: Constancia[];
  /** Los soportes de cada constancia, solo a quien ve los soportes del indicador. */
  soportes: Map<number, Soporte[]> | null;
  /** El historial de cada constancia, con la misma regla. */
  historial: Map<number, EventoDeConstancia[]> | null;
  /**
   * Lo que pide registrar y corregir, solo a quien puede (ve el indicador activo y lo mide, o administra indicadores): el
   * día de hoy (la fecha de envío no puede ser futura) y el resultado del periodo de cada pendiente.
   */
  registro: { hoy: string; resultados: Map<number, ResultadoExterno> } | null;
};

const TITULO = "Constancias de envío";

/** El estado, siempre escrito: «Pendiente», «Vencida», «Registrada» o «Registrada · corregida». */
function estadoDe(c: Constancia): { texto: string; variante: VarianteInsignia } {
  if (c.estado === "registrada") return { texto: c.corregida ? "Registrada · corregida" : "Registrada", variante: "bien" };
  return c.vencida ? { texto: "Vencida", variante: "critico" } : { texto: "Pendiente", variante: "atencion" };
}

/** Lo que se envió, con «(parcial)» si lo fue; nada mientras está pendiente. */
const resultadoEnviado = (c: Constancia) =>
  c.estado === "registrada" ? `${c.resultadoEnviado ?? "Sin resultado"}${c.parcial ? " (parcial)" : ""}` : null;

function Vacio() {
  return <span className="text-muted-foreground">—</span>;
}

/** El registro, cada corrección y los soportes, en orden (anexo §8), a quien ve los soportes. */
function Historial({ etiqueta, eventos }: { etiqueta: string; eventos: EventoDeConstancia[] }) {
  return (
    <details className="text-xs">
      <summary className={`cursor-pointer rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`}>
        Ver el historial<span className="sr-only">{` de ${etiqueta.toLowerCase()}`}</span>
      </summary>
      <ol className="mt-1 flex min-w-64 max-w-sm list-none flex-col gap-2">
        {eventos.map((e, i) => (
          <li key={i} className="flex flex-col gap-0.5 break-words">
            <span>{e.texto}</span>
            <span className="text-muted-foreground">{`${e.quien} · ${fechaYHora(e.cuando)}`}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

function Estado({ c, historial }: { c: Constancia; historial: EventoDeConstancia[] | null }) {
  const e = estadoDe(c);
  return (
    <div className="flex flex-col items-start gap-1">
      <Insignia variante={e.variante}>{e.texto}</Insignia>
      {historial && historial.length > 0 ? <Historial etiqueta={c.etiqueta} eventos={historial} /> : null}
    </div>
  );
}

function ListaDeSoportes({ codigo, soportes }: { codigo: string; soportes: Soporte[] }) {
  if (soportes.length === 0) return <Vacio />;
  return (
    <ul className="flex list-none flex-col gap-1">
      {soportes.map((s) => (
        <li key={s.id}>
          <a href={enlaceDeSoporte(codigo, s)} className={`break-words ${ENLACE}`}>
            {s.nombre}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** El enlace a su formulario, más abajo en la vista. */
function Accion({ c }: { c: Constancia }) {
  return (
    <a href={`#constancia-${c.id}`} className={`whitespace-nowrap ${ENLACE}`}>
      {c.estado === "pendiente" ? "Registrar el envío" : "Corregir"}
      <span className="sr-only">{`, ${c.etiqueta.toLowerCase()}`}</span>
    </a>
  );
}

/** El periodo y, si la constancia nació con otro ente que el de la ficha vigente, ese ente (lo ya nacido no cambia). */
function Periodo({ c, ente }: { c: Constancia; ente: string | null }) {
  return (
    <>
      {c.etiqueta}
      {c.ente !== ente ? <span className="block text-xs font-normal text-muted-foreground">{c.ente}</span> : null}
    </>
  );
}

/** Lo que dice la vista antes de la tabla: a qué ente se reporta y, si la ficha no genera constancias, por qué. */
function presentacion(e: EnteDeLaFicha): { texto: string; aviso: string | null } {
  if (e.ente === null) return { texto: "La ficha vigente ya no se reporta a un ente: no se piden constancias nuevas.", aviso: null };
  if (e.incompleto) return { texto: `Se reporta a ${e.ente}.`, aviso: "Complete el ente, su periodicidad y su plazo en la ficha para llevar las constancias." };
  if (!e.seReporta) {
    return {
      texto: `Se reporta a ${e.ente}.`,
      aviso: "La periodicidad del ente debe ser la de medición o una que la contenga: corríjala en la ficha para llevar las constancias.",
    };
  }
  return { texto: `Se reporta a ${e.ente}. Cada periodo del ente pide su constancia de envío: la fecha, el radicado y al menos un soporte.`, aviso: null };
}

/**
 * «Reportes al ente» (anexo 14B, §8): las constancias de envío del indicador, en tabla desde 768 px y en tarjetas por
 * debajo, con su periodo, su fecha límite, su estado escrito, cuándo se envió, el radicado, el resultado enviado y quién lo
 * registró. Los soportes y el historial, solo a quien ve los soportes (`soportes` e `historial` son `null` para los demás);
 * los formularios de «Registrar el envío» de cada pendiente y de «Corregir» de cada registrada, solo a quien puede
 * registrar (`registro`). El servidor vuelve a comprobar cada escritura.
 */
export function ReportesAlEnte({ codigo, ente, constancias, soportes, historial, registro }: DatosDeReportes) {
  const zona = zonaHoraria();
  const { texto, aviso } = presentacion(ente);
  const soportesDe = (c: Constancia) => soportes?.get(c.id) ?? [];
  const historialDe = (c: Constancia) => (historial ? (historial.get(c.id) ?? []) : null);
  const columnas: ColumnaTabla[] = [
    { clave: "periodo", etiqueta: "Periodo" },
    { clave: "limite", etiqueta: "Fecha límite" },
    { clave: "estado", etiqueta: "Estado" },
    { clave: "enviado", etiqueta: "Enviado el" },
    { clave: "radicado", etiqueta: "Radicado" },
    { clave: "resultado", etiqueta: "Resultado enviado" },
    { clave: "registro", etiqueta: "Registró" },
    ...(soportes ? [{ clave: "soportes", etiqueta: "Soportes" }] : []),
    ...(registro ? [{ clave: "acciones", etiqueta: "Acciones", oculta: true }] : []),
  ];
  const enviado = (c: Constancia) => (c.fechaEnvio ? <span className="whitespace-nowrap">{textoFecha(c.fechaEnvio, zona)}</span> : <Vacio />);
  const pendientes = constancias.filter((c) => c.estado === "pendiente");
  const registradas = constancias.filter((c) => c.estado === "registrada");

  return (
    <section aria-labelledby="indicador-reportes" className="flex min-w-0 flex-col gap-4">
      <h2 id="indicador-reportes" className="text-lg font-semibold">
        Reportes al ente
      </h2>
      <p className="text-sm text-muted-foreground">{texto}</p>
      {aviso ? (
        <Recuadro>
          <p>{aviso}</p>
        </Recuadro>
      ) : null}
      {constancias.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay constancias: la primera nace cuando termina el primer periodo del ente.</p>
      ) : (
        <>
          <div className="hidden md:block">
            <TablaDatos titulo={TITULO} columnas={columnas} filas={constancias.length} vacio="Aún no hay constancias.">
              {constancias.map((c) => (
                <tr key={c.id}>
                  <th scope="row" className={`${celda} text-left font-medium`}>
                    <Periodo c={c} ente={ente.ente} />
                  </th>
                  <td className={`${celda} whitespace-nowrap`}>{textoFecha(c.venceEn, zona)}</td>
                  <td className={celda}>
                    <Estado c={c} historial={historialDe(c)} />
                  </td>
                  <td className={celda}>{enviado(c)}</td>
                  <td className={`${celda} break-words`}>{c.radicado ?? <Vacio />}</td>
                  <td className={`${celda} whitespace-nowrap`}>{resultadoEnviado(c) ?? <Vacio />}</td>
                  <td className={celda}>{c.registradaPor ?? <Vacio />}</td>
                  {soportes ? (
                    <td className={`${celda} min-w-32`}>
                      <ListaDeSoportes codigo={codigo} soportes={soportesDe(c)} />
                    </td>
                  ) : null}
                  {registro ? (
                    <td className={celda}>
                      <Accion c={c} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </TablaDatos>
          </div>
          <ul className="flex list-none flex-col gap-3 md:hidden" aria-label={TITULO}>
            {constancias.map((c) => (
              <li key={c.id} className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 font-medium">
                    <Periodo c={c} ente={ente.ente} />
                  </p>
                  <Insignia variante={estadoDe(c).variante}>{estadoDe(c).texto}</Insignia>
                </div>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                  <dt className="text-muted-foreground">Fecha límite</dt>
                  <dd>{textoFecha(c.venceEn, zona)}</dd>
                  <dt className="text-muted-foreground">Enviado el</dt>
                  <dd>{enviado(c)}</dd>
                  <dt className="text-muted-foreground">Radicado</dt>
                  <dd className="break-words">{c.radicado ?? <Vacio />}</dd>
                  <dt className="text-muted-foreground">Resultado</dt>
                  <dd>{resultadoEnviado(c) ?? <Vacio />}</dd>
                  <dt className="text-muted-foreground">Registró</dt>
                  <dd className="break-words">{c.registradaPor ?? <Vacio />}</dd>
                  {soportes ? (
                    <>
                      <dt className="text-muted-foreground">Soportes</dt>
                      <dd className="min-w-0">
                        <ListaDeSoportes codigo={codigo} soportes={soportesDe(c)} />
                      </dd>
                    </>
                  ) : null}
                </dl>
                {(historialDe(c)?.length ?? 0) > 0 ? <Historial etiqueta={c.etiqueta} eventos={historialDe(c)!} /> : null}
                {registro ? (
                  <div>
                    <Accion c={c} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
      {registro && pendientes.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-4">
          {pendientes.map((c) => {
            const r = registro.resultados.get(c.id);
            return (
              <RegistrarEnvio
                key={c.id}
                constancia={{ id: c.id, etiqueta: c.etiqueta }}
                codigo={codigo}
                soportes={soportesDe(c)}
                resultado={`Resultado del periodo: ${r?.texto ?? "sin resultado"}`}
                aviso={r?.parcial ? avisoDeParcial(r) : null}
                hoy={registro.hoy}
              />
            );
          })}
        </div>
      ) : null}
      {registro && registradas.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-3">
          {registradas.map((c) => (
            <CorregirEnvio
              key={c.id}
              constancia={{ id: c.id, etiqueta: c.etiqueta, fechaEnvio: c.fechaEnvio, radicado: c.radicado, nota: c.nota }}
              codigo={codigo}
              soportes={soportesDe(c)}
              hoy={registro.hoy}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
