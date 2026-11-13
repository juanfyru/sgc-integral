import { InsigniaSemaforo } from "@/componentes/indicadores/InsigniaSemaforo";
import { LeyendaDeGrafica, metaDeGrafica } from "@/componentes/indicadores/LeyendaDeGrafica";
import { GraficoTubos } from "@/componentes/ui/GraficoTubos";
import type { ImpresionDelAnio } from "@/db/consultas/indicadores/impresion";
import {
  analisisEnTexto,
  camposDeFicha,
  camposDeOperacion,
  columnasDeVariables,
  cumpleEnTexto,
  fechaDeFirma,
  firmasDeFicha,
  marcasDeFila,
  periodoEnPalabras,
  rigeDesdeEnTexto,
  tramosPorVersion,
  type CampoDeTexto,
  type FirmaEnTexto,
} from "@/lib/indicadores/ficha-en-texto";
import { textoFecha } from "@/lib/vigencia/plazo";
import { zonaHoraria } from "@/lib/zona-horaria";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
/** Los bordes de la hoja, como los del Excel del usuario. */
const BORDE = "border border-border";
const TH = `${BORDE} bg-muted px-2 py-1 text-left align-top font-semibold`;
const TD = `${BORDE} px-2 py-1 align-top break-words`;

/** El título de un bloque de la hoja: una banda con el color de la marca, que se imprime en color. */
function Banda({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="ficha-banda ficha-color-exacto bg-marca-relleno px-2 py-1 text-xs font-bold uppercase tracking-wide text-white">
      {children}
    </h2>
  );
}

/** Un bloque de la hoja; `corto`: uno que no se parte entre dos hojas impresas (encabezado, firmas, cambios, operación). */
function Bloque({ id, titulo, corto = false, children }: { id: string; titulo: React.ReactNode; corto?: boolean; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className={`ficha-bloque${corto ? " ficha-corto" : ""} flex min-w-0 flex-col`}>
      <Banda id={id}>{titulo}</Banda>
      {children}
    </section>
  );
}

/** Una tabla de la hoja que se desplaza a lo ancho en pantallas angostas (enfocable, con nombre) y no se recorta al imprimir. */
function Tabla({ nombre, children, ancha = false }: { nombre: string; children: React.ReactNode; ancha?: boolean }) {
  return (
    <div role="region" aria-label={nombre} tabIndex={0} className={`min-w-0 overflow-x-auto print:overflow-visible ${FOCO}`}>
      <table className={`ficha-tabla w-full border-collapse text-xs ${ancha ? "min-w-[40rem] print:min-w-0" : ""}`}>{children}</table>
    </div>
  );
}

/** Los campos de un bloque en dos columnas: el nombre y su valor (con su detalle debajo, si lo tiene). */
function Campos({ nombre, campos }: { nombre: string; campos: CampoDeTexto[] }) {
  return (
    <Tabla nombre={nombre}>
      <tbody>
        {campos.map((c) => (
          <tr key={c.termino}>
            <th scope="row" className={`${TH} w-[38%] sm:w-52`}>
              {c.termino}
            </th>
            <td className={TD}>
              {c.valor}
              {c.detalle ? <span className="block text-muted-foreground">{c.detalle}</span> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </Tabla>
  );
}

function Firma({ f }: { f: FirmaEnTexto }) {
  return (
    <div className={`ficha-firma flex min-w-0 flex-col gap-0.5 ${BORDE} px-2 py-2`}>
      <span className="font-semibold">{f.rol}</span>
      {f.nombre ? (
        <>
          <span className="break-words">{f.nombre}</span>
          {f.cargo ? <span className="break-words text-muted-foreground">{f.cargo}</span> : null}
          {f.fecha ? <span className="text-muted-foreground">{`Firmado el ${fechaDeFirma(f.fecha)}`}</span> : null}
        </>
      ) : (
        <span className="text-muted-foreground">{f.nota}</span>
      )}
    </div>
  );
}

export type DatosDeFichaImpresa = ImpresionDelAnio & {
  /** El nombre de la entidad, de la marca (`obtenerMarcaSegura`): nunca escrito en el código. */
  entidad: string;
  /** La dirección del logo de la entidad (`/marca/logo?v=…`); `null` sin logo. */
  logo: string | null;
};

/**
 * La ficha impresa de un indicador (spec §7.8, maqueta 7), con el diseño de la ficha del usuario: el encabezado (logo,
 * entidad, «Ficha técnica de indicador», código, versión y fechas), la identificación y la estructura de medición de la
 * versión que regía el año (la fórmula y los rangos en palabras), las firmas tomadas de `firmas`, el control de cambios
 * hasta esa versión, los datos de operación rotulados como tales, el seguimiento del año (una fila por periodo de la
 * periodicidad, en el orden del calendario y en tramos por la versión con que se calculó, y el acumulado del año) y la
 * gráfica, que al imprimir escribe el valor y el estado sobre cada columna con valor. Sin soportes ni observaciones. La
 * hoja titula sus bloques con `h2`: el `h1` es el de la página.
 */
export function FichaImpresa(d: DatosDeFichaImpresa) {
  const { ficha, resultados: r, anio } = d;
  const zona = zonaHoraria();
  const { identificacion, estructura } = camposDeFicha(ficha);
  const aprobada = d.versiones.find((v) => v.id === ficha.versionId)?.aprobadaEn ?? ficha.firmas.aprobo?.fecha ?? null;
  const variables = columnasDeVariables(r.filas);
  const columnas = 1 + variables.length + 5;
  const a = r.acumulado;
  const id = (bloque: string) => `ficha-impresa-${bloque}`;

  return (
    <article aria-labelledby={id("titulo")} className="ficha-impresa flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-card p-4 text-sm text-foreground print:rounded-none print:border-0 print:p-0">
      <header
        className={`ficha-encabezado ficha-corto grid min-w-0 grid-cols-1 ${BORDE} ${d.logo ? "sm:grid-cols-[8rem_minmax(0,1fr)_13rem]" : "sm:grid-cols-[minmax(0,1fr)_13rem]"}`}
      >
        {d.logo ? (
          <div className="flex items-center justify-center border-b border-border p-2 sm:border-b-0 sm:border-r">
            {/* El logo lo sirve la propia app (/marca/logo); next/image exigiría sharp. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={d.logo} alt={`Logo de ${d.entidad}`} className="max-h-16 max-w-full object-contain" />
          </div>
        ) : null}
        <div className="flex min-w-0 flex-col items-center justify-center gap-1 border-b border-border p-2 text-center sm:border-b-0 sm:border-r">
          <p className="break-words font-semibold uppercase">{d.entidad}</p>
          <p id={id("titulo")} className="font-bold uppercase tracking-wide">
            Ficha técnica de indicador
          </p>
        </div>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 p-2 text-xs">
          <dt className="font-semibold">Código</dt>
          <dd className="break-all font-mono">{d.codigo}</dd>
          <dt className="font-semibold">Versión</dt>
          <dd>{ficha.numero}</dd>
          <dt className="font-semibold">Vigente desde</dt>
          <dd>{aprobada ? textoFecha(aprobada, zona) : "—"}</dd>
          <dt className="font-semibold">Rige desde</dt>
          <dd>{rigeDesdeEnTexto(ficha)}</dd>
        </dl>
      </header>

      <Bloque id={id("identificacion")} titulo="Identificación">
        <Campos nombre="Identificación del indicador" campos={identificacion} />
      </Bloque>

      <Bloque id={id("estructura")} titulo="Estructura de medición">
        <Campos nombre="Estructura de medición" campos={estructura} />
      </Bloque>

      <Bloque id={id("firmas")} titulo="Firmas" corto>
        <div className="ficha-firmas grid gap-2 pt-2 sm:grid-cols-2">
          {firmasDeFicha(ficha).map((f) => (
            <Firma key={f.rol} f={f} />
          ))}
        </div>
      </Bloque>

      <Bloque id={id("cambios")} titulo="Control de cambios" corto>
        <Tabla nombre="Control de cambios" ancha>
          <thead>
            <tr>
              {["Versión", "Rige desde", "Qué cambió y por qué", "Elaboró", "Aprobó"].map((c) => (
                <th key={c} scope="col" className={TH}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.versiones.map((v) => (
              <tr key={v.id}>
                <td className={`${TD} whitespace-nowrap`}>{`${v.numero} · ${v.tipoCambio === "inicial" ? "Inicial" : v.tipoCambio === "mayor" ? "Mayor" : "Menor"}`}</td>
                <td className={TD}>{periodoEnPalabras(v.rigeDesde)}</td>
                <td className={TD}>
                  {v.tipoCambio === "inicial" ? "Primera versión de la ficha" : v.cambios.join(", ")}
                  {v.motivo && v.tipoCambio !== "inicial" ? <span className="block text-muted-foreground">{`Motivo: ${v.motivo}`}</span> : null}
                </td>
                <td className={TD}>{v.elaboro ? `${v.elaboro}${v.elaboradaEn ? ` · ${textoFecha(v.elaboradaEn, zona)}` : ""}` : "(sin firma)"}</td>
                <td className={TD}>
                  {v.tipoCambio === "menor"
                    ? "No requiere: cambio menor"
                    : v.aprobo
                      ? `${v.aprobo}${v.aprobadaEn ? ` · ${textoFecha(v.aprobadaEn, zona)}` : ""}`
                      : "(sin firma)"}
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      </Bloque>

      <Bloque id={id("operacion")} titulo="Datos de operación" corto>
        <p className="py-1 text-xs text-muted-foreground">No son contenido de la ficha: no crean versión ni se firman.</p>
        <Campos nombre="Datos de operación" campos={camposDeOperacion(d.operacion)} />
      </Bloque>

      <Bloque id={id("seguimiento")} titulo={`Seguimiento y medición · ${anio}`}>
        <Tabla nombre={`Seguimiento y medición de ${anio}`} ancha>
          <thead>
            <tr>
              <th scope="col" className={TH}>
                Periodo
              </th>
              {variables.map((v) => (
                <th key={v.letra} scope="col" className={TH}>
                  {v.nombre}
                </th>
              ))}
              {["Resultado", "Meta", "Cumple", "Semáforo", "Análisis del resultado"].map((c) => (
                <th key={c} scope="col" className={TH}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          {tramosPorVersion(r.filas).map((b, i) => (
            <tbody key={`${i}-${b.version}`}>
              <tr className="ficha-tramo">
                <th scope="rowgroup" colSpan={columnas} className={`${TD} bg-marca-tinte text-left font-semibold`}>
                  {`Calculado con la versión ${b.version} de la ficha`}
                </th>
              </tr>
              {b.filas.map((f) => {
                const marcas = marcasDeFila(f, d.periodosSinCumplir);
                const valores = new Map(f.valores.map((v) => [v.letra, v.valor]));
                return (
                  <tr key={`${f.periodo}-${f.deOtraPeriodicidad ? "otra" : "rige"}`}>
                    <th scope="row" className={`${TD} text-left font-normal`}>
                      {f.etiqueta}
                      {marcas.length > 0 ? <span className="block text-muted-foreground">{marcas.join(" · ")}</span> : null}
                    </th>
                    {variables.map((v) => (
                      <td key={v.letra} className={`${TD} text-right tabular-nums`}>
                        {valores.get(v.letra) ?? "—"}
                      </td>
                    ))}
                    <td className={`${TD} whitespace-nowrap text-right font-semibold tabular-nums`}>{f.resultado ?? "—"}</td>
                    <td className={`${TD} whitespace-nowrap`}>{f.meta}</td>
                    <td className={TD}>{cumpleEnTexto(f.cumple) || "—"}</td>
                    <td className={`${TD} ficha-color-exacto`}>
                      {f.estado === "por_venir" ? "Por venir" : <InsigniaSemaforo semaforo={f.semaforo} cumple={f.cumple} noAplica={f.noAplica} conResultado={f.resultado !== null} />}
                    </td>
                    <td className={TD}>{analisisEnTexto(f)}</td>
                  </tr>
                );
              })}
            </tbody>
          ))}
          {/* El acumulado cierra la tabla en su propio grupo (un pie se repetiría en cada hoja impresa). */}
          <tbody>
            <tr>
              <th scope="row" className={`${TD} bg-muted text-left font-bold`}>
                Acumulado del año
              </th>
              {variables.map((v) => (
                <td key={v.letra} className={`${TD} bg-muted text-right font-semibold tabular-nums`}>
                  {a.valores[v.letra] ?? "—"}
                </td>
              ))}
              <td className={`${TD} bg-muted whitespace-nowrap text-right font-bold tabular-nums`}>{a.texto ?? "—"}</td>
              <td className={`${TD} bg-muted whitespace-nowrap`}>{a.metaEnTexto ?? "—"}</td>
              <td className={`${TD} bg-muted`}>{a.texto ? cumpleEnTexto(a.cumple) || "—" : "—"}</td>
              <td className={`${TD} ficha-color-exacto bg-muted`}>
                <InsigniaSemaforo semaforo={a.semaforo} cumple={a.cumple} conResultado={a.texto !== null} />
              </td>
              <td className={`${TD} bg-muted`}>
                {a.rotulo ?? (a.texto ? "Se calcula juntando las variables de los periodos del año, nunca promediando los resultados." : `Aún no hay periodos medidos en ${anio}.`)}
              </td>
            </tr>
          </tbody>
        </Tabla>
      </Bloque>

      <Bloque id={id("grafica")} titulo="Representación gráfica">
        <div className="ficha-grafica flex min-w-0 flex-col gap-2 pt-2">
          <LeyendaDeGrafica conMeta={metaDeGrafica(r.grafica) !== undefined} conLimite={r.grafica.limite !== null} conAsterisco={r.serie.some((p) => p.sinAlcanzar)} />
          <GraficoTubos
            serie={r.serie}
            titulo={`Resultado de ${anio}`}
            meta={metaDeGrafica(r.grafica)}
            limite={r.grafica.limite ?? undefined}
            rango={r.grafica.rango ?? undefined}
            unidad={r.grafica.unidad}
            columnas={["Periodo", "Resultado", "Estado"]}
          />
        </div>
      </Bloque>
    </article>
  );
}
