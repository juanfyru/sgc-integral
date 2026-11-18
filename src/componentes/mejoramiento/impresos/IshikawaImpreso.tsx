import type { RondaDeDetalle } from "@/db/consultas/mejoramiento/lectura";
import { CATEGORIAS_6M, ETIQUETA_6M, ETIQUETA_IMPACTO, type ContenidoIshikawa } from "@/lib/mejoramiento/analisis";
import { HojaDeAnalisis, type DatosDelAnalisisImpreso } from "./HojaDeAnalisis";
import { BORDE, Bloque, Cabecera, contenidoDe, SinContenido, Subtitulo, Tabla, TD } from "./Partes";

/**
 * Las seis categorías (6M) con sus causas posibles y la marca de confirmada (spec §9.1), en la disposición del diagrama: tres arriba
 * y tres abajo, alrededor del efecto (el hallazgo). Cada causa dice con texto si está confirmada: el color no es la única señal.
 */
export function DiagramaDeIshikawa({ contenido, efecto }: { contenido: ContenidoIshikawa; efecto: string }) {
  const categoria = (cat: (typeof CATEGORIAS_6M)[number]) => {
    const causas = contenido.causas.filter((c) => c.categoria === cat);
    return (
      <div key={cat} className={`ficha-corto min-w-0 ${BORDE} p-2`}>
        <p className="font-semibold">{ETIQUETA_6M[cat]}</p>
        {causas.length === 0 ? (
          <p className="text-muted-foreground">Sin causas</p>
        ) : (
          <ul className="mt-1 flex list-none flex-col gap-1">
            {causas.map((c, i) => (
              <li key={i} className="break-words">
                {c.texto}
                <span className="block text-xs text-muted-foreground">{c.confirmada ? "Confirmada" : "Posible, sin confirmar"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };
  return (
    <div role="group" aria-label="Diagrama de causa y efecto" className="grid min-w-0 gap-2 sm:grid-cols-3">
      {CATEGORIAS_6M.slice(0, 3).map(categoria)}
      <p className={`ficha-corto ficha-color-exacto break-words bg-marca-tinte p-2 text-center font-semibold sm:col-span-3 ${BORDE}`}>
        {`Efecto: ${efecto}`}
      </p>
      {CATEGORIAS_6M.slice(3).map(categoria)}
    </div>
  );
}

/** La priorización de las causas confirmadas (Apéndice A.4): su categoría, su impacto y si requieren acción. */
export function PriorizacionDeIshikawa({ contenido }: { contenido: ContenidoIshikawa }) {
  const confirmadas = contenido.causas.filter((c) => c.confirmada);
  if (confirmadas.length === 0) return <p className="py-1 text-muted-foreground">Ninguna causa confirmada.</p>;
  return (
    <Tabla nombre="Priorización de las causas confirmadas">
      <Cabecera columnas={["Categoría", "Causa confirmada", "Impacto", "¿Requiere acción?"]} />
      <tbody>
        {confirmadas.map((c, i) => (
          <tr key={i}>
            <td className={TD}>{ETIQUETA_6M[c.categoria]}</td>
            <td className={TD}>{c.texto}</td>
            <td className={TD}>{c.confirmada ? ETIQUETA_IMPACTO[c.impacto] : "—"}</td>
            <td className={TD}>{c.confirmada && c.requiereAccion ? "Sí" : "No"}</td>
          </tr>
        ))}
      </tbody>
    </Tabla>
  );
}

/** El contenido de un análisis de Ishikawa, o lo que la hoja dice si no lo tiene (una carga, uno que no se puede leer). */
export function ContenidoDeIshikawa({
  a,
  cargado,
  efecto,
  nivel = 3,
}: {
  a: Pick<RondaDeDetalle["analisis"][number], "contenido">;
  cargado: boolean;
  efecto: string;
  /** El de su subtítulo: 4 dentro de una ronda del registro completo. */
  nivel?: 3 | 4;
}) {
  const c = contenidoDe("ishikawa", a) as ContenidoIshikawa | null;
  if (!c) return <SinContenido a={a} cargado={cargado} />;
  return (
    <>
      <DiagramaDeIshikawa contenido={c} efecto={efecto} />
      <Subtitulo nivel={nivel}>Priorización de las causas confirmadas</Subtitulo>
      <PriorizacionDeIshikawa contenido={c} />
    </>
  );
}

/**
 * El impreso SGC-FO-AC-03 (spec 15 §16.4 y Apéndice A.4): un análisis de Ishikawa, con su información general, las seis categorías
 * con sus causas posibles y la marca de confirmada, la priorización de las confirmadas, la conclusión (la relación con la causa raíz
 * es la lista de causas raíz) y las firmas de su ronda. El de una carga sin contenido dice que está en el formato firmado, sin un
 * diagrama vacío.
 */
export function IshikawaImpreso(d: DatosDelAnalisisImpreso) {
  return (
    <HojaDeAnalisis d={d} titulo="Análisis de causa raíz · Ishikawa">
      <Bloque id="analisis-impreso-categorias" titulo="Causas por categoría">
        <ContenidoDeIshikawa a={d.analisis} cargado={d.hallazgo.cargado} efecto={d.hallazgo.titulo} />
      </Bloque>
    </HojaDeAnalisis>
  );
}
