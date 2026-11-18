/**
 * Las piezas comunes de los impresos de mejoramiento (spec 15 §16.4): la hoja, sus bloques con banda, las tablas, las firmas (las del
 * sistema, con su huella corta, y los pasos hechos en papel de un hallazgo cargado) y el pie. Sobre las clases `.ficha-*` de la ficha
 * impresa de un indicador (`src/app/globals.css`): ninguna fila ni bloque corto se parte entre dos hojas. Sin interacción.
 */
import type { FirmaDelHallazgo } from "@/db/consultas/mejoramiento/aprobacion";
import type { DetalleDeHallazgo, RondaDeDetalle } from "@/db/consultas/mejoramiento/lectura";
import { leerCambios, leerContenido, type ContenidoDeAnalisis } from "@/lib/mejoramiento/analisis";
import { fechaDeDia, fechaYHora } from "@/lib/mejoramiento/formato";
import { fechaEnZona } from "@/lib/tramites/plazos";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
export const BORDE = "border border-border";
export const TH = `${BORDE} bg-muted px-2 py-1 text-left align-top font-semibold`;
export const TD = `${BORDE} px-2 py-1 align-top break-words`;

/** Lo que dice una etapa que todavía no se registró. */
export const SIN_REGISTRAR = "Sin registrar todavía.";
/** Un análisis cargado sin su contenido estructurado (spec §15): lo que se hizo en papel está en el escaneo. */
export const CONTENIDO_EN_LA_CARGA = "El contenido de este análisis está en el formato firmado de la carga.";
/** Un paso de un hallazgo cargado: se hizo en papel, sin firma del sistema (spec §15). */
export const HECHO_FUERA = "Hecho fuera de la plataforma, sin firma del sistema";

/** La hoja impresa: un artículo con el título del encabezado como nombre. */
export function Hoja({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <article
      aria-labelledby={titulo}
      className="ficha-impresa flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-card p-4 text-sm text-foreground print:rounded-none print:border-0 print:p-0"
    >
      {children}
    </article>
  );
}

/** El título de un bloque: una banda con el color de la marca, que se imprime en color. */
function Banda({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="ficha-banda ficha-color-exacto bg-marca-relleno px-2 py-1 text-xs font-bold uppercase tracking-wide text-white">
      {children}
    </h2>
  );
}

/** Un bloque de la hoja con su banda; `corto`: uno que no se parte entre dos hojas impresas. */
export function Bloque({ id, titulo, corto = false, children }: { id: string; titulo: string; corto?: boolean; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className={`ficha-bloque${corto ? " ficha-corto" : ""} flex min-w-0 flex-col gap-2`}>
      <Banda id={id}>{titulo}</Banda>
      {children}
    </section>
  );
}

/** El subtítulo de una parte de un bloque («Ronda 2»; dentro de ella, `nivel` 4): no queda solo al pie de una hoja. */
export function Subtitulo({ nivel = 3, children }: { nivel?: 3 | 4; children: React.ReactNode }) {
  const Etiqueta = nivel === 3 ? "h3" : "h4";
  return <Etiqueta className={`ficha-tramo pt-1 ${nivel === 3 ? "text-sm" : "text-xs"} font-semibold`}>{children}</Etiqueta>;
}

/** Un texto neutro de la hoja (lo que falta, una nota). */
export function Nota({ children }: { children: React.ReactNode }) {
  return <p className="py-1 text-muted-foreground">{children}</p>;
}

/** Una tabla de la hoja que se desplaza a lo ancho en pantallas angostas (enfocable, con nombre) y no se recorta al imprimir. */
export function Tabla({ nombre, ancha = false, children }: { nombre: string; ancha?: boolean; children: React.ReactNode }) {
  return (
    <div role="region" aria-label={nombre} tabIndex={0} className={`min-w-0 overflow-x-auto print:overflow-visible ${FOCO}`}>
      <table className={`ficha-tabla w-full border-collapse text-xs ${ancha ? "min-w-[40rem] print:min-w-0" : ""}`}>{children}</table>
    </div>
  );
}

/** La cabecera de una tabla de la hoja. */
export function Cabecera({ columnas }: { columnas: readonly string[] }) {
  return (
    <thead>
      <tr>
        {columnas.map((c) => (
          <th key={c} scope="col" className={TH}>
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export type Campo = { termino: string; valor: React.ReactNode };

/** Los campos de un bloque en dos columnas: el nombre y su valor. Los que llegan sin valor no se pintan. */
export function Campos({ nombre, campos }: { nombre: string; campos: ReadonlyArray<Campo | null> }) {
  const hay = campos.filter((c): c is Campo => c !== null);
  return (
    <Tabla nombre={nombre}>
      <tbody>
        {hay.map((c) => (
          <tr key={c.termino}>
            <th scope="row" className={`${TH} w-[38%] sm:w-56`}>
              {c.termino}
            </th>
            <td className={`${TD} whitespace-pre-line`}>{c.valor}</td>
          </tr>
        ))}
      </tbody>
    </Tabla>
  );
}

/** Los 12 primeros caracteres de una huella: la que se imprime (spec §16.4). */
export const huellaCorta = (huella: string) => huella.slice(0, 12);

/** La casilla de una firma del sistema: el acto, quién, su cargo, cuándo y la huella corta; sin firma, `sinFirma`. */
export function CasillaDeFirma({ rol, firma, sinFirma, zona }: { rol: string; firma: FirmaDelHallazgo | null; sinFirma: string; zona: string }) {
  return (
    <div className={`ficha-firma flex min-w-0 flex-col gap-0.5 ${BORDE} px-2 py-2`}>
      <span className="font-semibold">{rol}</span>
      {firma ? (
        <>
          <span className="break-words">{firma.nombre}</span>
          {firma.cargo ? <span className="break-words text-muted-foreground">{firma.cargo}</span> : null}
          <span className="text-muted-foreground">{`Firmado el ${fechaYHora(firma.cuando, zona)}`}</span>
          <span className="break-all font-mono text-xs text-muted-foreground">{`Huella: ${huellaCorta(firma.huella)}`}</span>
        </>
      ) : (
        <span className="text-muted-foreground">{sinFirma}</span>
      )}
    </div>
  );
}

/** La casilla de un paso hecho en papel (spec §15): el acto, quién (si se sabe) y el día, sin firma ni huella del sistema. */
export function CasillaEnPapel({ rol, quien, cuando, zona, nota }: { rol: string; quien: string | null; cuando: Date; zona: string; nota?: string }) {
  return (
    <div className={`ficha-firma flex min-w-0 flex-col gap-0.5 ${BORDE} px-2 py-2`}>
      <span className="font-semibold">{rol}</span>
      {quien ? <span className="break-words">{quien}</span> : null}
      <span className="text-muted-foreground">{`El ${fechaDeDia(fechaEnZona(cuando, zona))}`}</span>
      <span className="text-muted-foreground">{HECHO_FUERA}</span>
      {nota ? <span className="break-words text-muted-foreground">{nota}</span> : null}
    </div>
  );
}

/** Una fila de casillas de firma. */
export function Firmas({ nombre, children }: { nombre: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={nombre} className="ficha-firmas ficha-corto grid gap-2 pt-1 sm:grid-cols-3">
      {children}
    </div>
  );
}

type FirmasDelPlan = { elaboro: FirmaDelHallazgo | null; reviso: FirmaDelHallazgo | null; aprobo: FirmaDelHallazgo | null };

/**
 * Las firmas del plan de una ronda, las de su envío vigente: desde su última «Elaboró» (la «Revisó» de un envío devuelto firmó otro
 * plan, como en `firmasDelEnvio`). Ninguna si no se ha enviado.
 */
export function firmasDelPlan(firmas: readonly FirmaDelHallazgo[], ronda: number): FirmasDelPlan {
  const deLaRonda = firmas.filter((f) => f.ronda === ronda);
  const desde = deLaRonda.findLastIndex((f) => f.firma === "elaboro");
  const envio = desde === -1 ? [] : deLaRonda.slice(desde);
  const de = (firma: "elaboro" | "reviso" | "aprobo") => envio.find((f) => f.firma === firma) ?? null;
  return { elaboro: de("elaboro"), reviso: de("reviso"), aprobo: de("aprobo") };
}

/** La última firma de ese acto en la ronda («Verificó», «Cerró»), o nula. */
export function ultimaFirma(firmas: readonly FirmaDelHallazgo[], ronda: number, firma: "verifico" | "cerro"): FirmaDelHallazgo | null {
  return firmas.findLast((f) => f.ronda === ronda && f.firma === firma) ?? null;
}

/** «Impreso el … por …» (spec §16.4), con la hora en la zona de la instalación. */
export function PieDeImpreso({ impresoEn, impresoPor, zona }: { impresoEn: Date; impresoPor: string; zona: string }) {
  return (
    <footer className="ficha-corto border-t border-border pt-2 text-xs text-muted-foreground">
      {`Impreso el ${fechaYHora(impresoEn, zona)} por ${impresoPor}`}
    </footer>
  );
}

type Analisis = RondaDeDetalle["analisis"][number];

/** Lo guardado de un análisis, leído con el esquema de su método; `null` si no hay contenido o no pasa. */
export function contenidoDe(metodo: "cinco_porques" | "ishikawa" | "otro", a: Pick<Analisis, "contenido">): ContenidoDeAnalisis | null {
  if (a.contenido === null || a.contenido === undefined) return null;
  try {
    return leerContenido(metodo, a.contenido);
  } catch {
    return null;
  }
}

/**
 * Lo que la hoja dice de un análisis sin contenido que pintar: el de una carga, que está en el formato firmado; uno vacío, que no se
 * registró; uno guardado que no se puede leer, eso. Nunca un diagrama vacío.
 */
export function SinContenido({ a, cargado }: { a: Pick<Analisis, "contenido">; cargado: boolean }) {
  if (a.contenido === null || a.contenido === undefined) return <Nota>{cargado ? CONTENIDO_EN_LA_CARGA : SIN_REGISTRAR}</Nota>;
  return <Nota>No se pudo leer este análisis.</Nota>;
}

/** «¿Hay no conformidades similares en otros procesos?» y «¿Se requieren cambios…?» (spec §9.3), en texto. */
export function preguntasDeCierre(r: Pick<RondaDeDetalle, "similares" | "similaresDetalle" | "cambios">): Campo[] {
  const leidos = leerCambios(r.cambios);
  const cuales = leidos
    ? [leidos.documentos ? "documentos" : null, leidos.riesgos ? "matriz de riesgos" : null, leidos.controles ? "controles" : null].filter(Boolean)
    : [];
  return [
    {
      termino: "¿Hay no conformidades similares en otros procesos?",
      valor: r.similares === null ? "Sin responder" : r.similares ? `Sí: ${r.similaresDetalle ?? ""}` : "No",
    },
    {
      termino: "¿Se requieren cambios en documentos, riesgos o controles?",
      valor:
        leidos === null
          ? "Sin responder"
          : leidos === undefined
            ? "No se pudo leer esta respuesta."
            : cuales.length > 0
              ? `Sí (${cuales.join(", ")}): ${leidos.descripcion ?? ""}`
              : "No",
    },
  ];
}

/** Las causas raíz de la ronda, en su orden, con por qué no llevan acción si es el caso. */
export function CausasRaiz({ causas }: { causas: RondaDeDetalle["causas"] }) {
  if (causas.length === 0) return <>Sin causas raíz registradas</>;
  return (
    <ol className="list-decimal pl-5">
      {causas.map((c) => (
        <li key={c.id} className="break-words">
          {c.texto}
          {c.sinAccionPorque ? <span className="block text-muted-foreground">{`Sin acción porque: ${c.sinAccionPorque}`}</span> : null}
        </li>
      ))}
    </ol>
  );
}

/** El día en que se formuló el análisis: el del envío del plan de su ronda o, en papel, el de su aprobación. */
export function fechaDelAnalisis(r: Pick<RondaDeDetalle, "enviadoEn" | "aprobadoEn">, zona: string): string {
  const cuando = r.enviadoEn ?? r.aprobadoEn;
  return cuando ? fechaDeDia(fechaEnZona(cuando, zona)) : "Aún no se envía con el plan";
}

/** El paso hecho en papel de un hallazgo cargado (su evento marcado `fuera`), o nada. */
export function pasoEnPapel(h: Pick<DetalleDeHallazgo, "cargado" | "eventos">, tipo: string): DetalleDeHallazgo["eventos"][number] | null {
  if (!h.cargado) return null;
  return h.eventos.find((e) => e.fuera && e.tipo === tipo) ?? null;
}
