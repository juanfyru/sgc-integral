import Link from "next/link";
import { Insignia } from "@/componentes/ui/Insignia";
import { etiquetaDePeriodo, type FichaLeida, type FirmaDeFicha, type OperacionLeida } from "@/db/consultas/indicadores/aprobacion";
import type { ContenidoFicha } from "@/lib/indicadores/ficha";
import { enPalabras } from "@/lib/indicadores/formula/formas";
import { fraccion } from "@/lib/indicadores/formula/fraccion";
import { numeroExacto, rangosEnPalabras, type Regla } from "@/lib/indicadores/semaforo";
import { textoMeta, type Unidad } from "@/lib/indicadores/textos";
import type { ModoSemaforo, Tendencia } from "@/lib/indicadores/tipos";
import { fechaHoraLocal } from "@/lib/zona-horaria";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

const FORMA: Record<string, string> = {
  porcentaje: "Porcentaje",
  tasa: "Tasa",
  razon: "Promedio o razón",
  conteo: "Conteo",
  libre: "Fórmula libre",
};
const PERIODICIDAD: Record<string, string> = {
  mensual: "Mensual",
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};
const TENDENCIA: Record<string, string> = {
  ascendente: "Ascendente (mayor es mejor)",
  descendente: "Descendente (menor es mejor)",
  constante: "Constante (mantenerse en un rango)",
};
const CONSOLIDACION: Record<string, string> = { suma: "Se suma", ultimo: "Último valor", promedio: "Promedio" };
const ORIGEN: Record<string, string> = { manual: "Lo digita una persona", automatico: "Lo calcula el sistema" };

const fr = (v: string | null) => (v === null ? null : fraccion(v));

/** La regla del semáforo con lo que la versión firmó. */
export function reglaDeFicha(c: ContenidoFicha): Regla {
  return {
    tendencia: (c.tendencia ?? "ascendente") as Tendencia,
    meta: fr(c.meta),
    metaMax: fr(c.metaMax),
    modo: (c.semaforoModo as ModoSemaforo | null) ?? null,
    umbralPct: c.umbralAtencionPct,
    limite: fr(c.limiteCritico),
    tolerancia: fr(c.tolerancia),
  };
}

export const unidadDeFicha = (c: ContenidoFicha): Unidad => ({ sufijo: c.unidadSufijo ?? "", decimales: c.decimales ?? 0 });

/** Un número firmado, con coma y los decimales que hagan falta. */
function cifra(v: string | null, u: Unidad): string | null {
  const f = fr(v);
  return f === null ? null : `${numeroExacto(f, u.decimales)}${u.sufijo}`;
}

function Dato({ termino, children }: { termino: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-0.5 py-2 sm:grid-cols-[12rem_minmax(0,1fr)]">
      <dt className="text-sm text-muted-foreground">{termino}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

function Seccion({
  id,
  titulo,
  nivel,
  descripcion,
  children,
}: {
  id: string;
  titulo: string;
  nivel: 2 | 3;
  descripcion?: string;
  children: React.ReactNode;
}) {
  const Titulo = nivel === 3 ? "h3" : "h2";
  return (
    <section aria-labelledby={id} className="rounded-lg border border-border bg-card p-4">
      <Titulo id={id} className="text-base font-semibold">
        {titulo}
      </Titulo>
      {descripcion ? <p className="mt-0.5 text-sm text-muted-foreground">{descripcion}</p> : null}
      <dl className="mt-2 divide-y divide-linea-suave">{children}</dl>
    </section>
  );
}

const ninguno = <span className="text-muted-foreground">(ninguno)</span>;

function textoFirma(f: FirmaDeFicha) {
  return (
    <>
      <span className="font-medium">{f.nombre}</span>
      {f.cargo ? <span className="text-muted-foreground">{` · ${f.cargo}`}</span> : null}
      <span className="block text-xs text-muted-foreground">{fechaHoraLocal(f.fecha)}</span>
    </>
  );
}

/**
 * La ficha técnica en lectura (spec §12.3): el contenido firmado de §7.2, con la fórmula y los rangos en palabras; las
 * firmas, tomadas de `firmas`; y, aparte, los datos de operación, que no se versionan ni se firman. El procedimiento
 * solo se nombra a quien ve ese documento (F13C-R11).
 */
export function FichaTecnica({
  ficha,
  operacion,
  nivel = 2,
}: {
  ficha: FichaLeida;
  /** Los datos de operación de hoy; sin ellos (una versión anterior), no se pintan. */
  operacion: OperacionLeida | null;
  /** El nivel de los títulos de sus secciones: 3 dentro de otra sección (las versiones anteriores). */
  nivel?: 2 | 3;
}) {
  const id = (seccion: string) => `ficha-v${ficha.numero}-${seccion}`;
  const c = ficha.contenido;
  const u = unidadDeFicha(c);
  const regla = reglaDeFicha(c);
  const nombres = Object.fromEntries(c.variables.map((v) => [v.letra, v.nombre?.trim() || v.letra]));
  const medir = c.responsables.filter((r) => r.funcion === "medir").map((r) => r.cargoNombre);
  const analizar = c.responsables.filter((r) => r.funcion === "analizar").map((r) => r.cargoNombre);
  const lineaBase = c.lineaBaseValor !== null ? `${cifra(c.lineaBaseValor, u)}${c.lineaBasePeriodo ? ` (${c.lineaBasePeriodo})` : ""}` : null;
  const limites = [c.resultadoMin !== null ? `desde ${cifra(c.resultadoMin, u)}` : null, c.resultadoMax !== null ? `hasta ${cifra(c.resultadoMax, u)}` : null]
    .filter(Boolean)
    .join(" ");
  const aprobo =
    ficha.firmas.aprobo ??
    (ficha.estado === "aprobada" && ficha.tipoCambio === "menor" ? "No requiere: es un cambio menor" : ficha.estado === "por_aprobar" ? "Pendiente" : null);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Seccion id={id("identificacion")} nivel={nivel} titulo="Identificación">
        <Dato termino="Nombre">{c.nombre}</Dato>
        <Dato termino="Proceso">{c.subprocesoNombre ? `${c.procesoNombre} › ${c.subprocesoNombre}` : c.procesoNombre}</Dato>
        <Dato termino="Objetivo del indicador">{c.proposito}</Dato>
        <Dato termino="Requisito">{c.requisito ?? ninguno}</Dato>
        <Dato termino="Tipo">{c.tipoNombre}</Dato>
        <Dato termino="Clasificación">{c.clasificacionNombre}</Dato>
        <Dato termino="Objetivo que mide">{c.objetivoNombre ?? ninguno}</Dato>
        {ficha.procedimiento ? (
          <Dato termino="Procedimiento">
            <Link
              href={`/documentos/${encodeURIComponent(ficha.procedimiento.codigo.toLowerCase())}`}
              className={`rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`}
            >
              {`${ficha.procedimiento.codigo} · ${ficha.procedimiento.titulo}`}
            </Link>
          </Dato>
        ) : null}
        {c.puntoControl ? <Dato termino="Punto de control">{c.puntoControl}</Dato> : null}
        <Dato termino="Normas que lo exigen">{c.normas.length > 0 ? c.normas.map((n) => n.normaNombre).join("; ") : ninguno}</Dato>
        {c.ente ? (
          <Dato termino="Se reporta a">
            {[c.ente, c.periodicidadExterna ? PERIODICIDAD[c.periodicidadExterna]?.toLowerCase() : null, c.plazoExternoDias !== null ? `plazo de ${c.plazoExternoDias} días` : null]
              .filter(Boolean)
              .join(" · ")}
          </Dato>
        ) : null}
      </Seccion>

      <Seccion id={id("estructura")} nivel={nivel} titulo="Estructura de medición">
        <Dato termino="Cómo se obtiene el dato">{ORIGEN[c.origenDato] ?? c.origenDato}</Dato>
        <Dato termino="Cómo se calcula">{c.forma ? (FORMA[c.forma] ?? c.forma) : ninguno}</Dato>
        {c.formula ? (
          <Dato termino="Fórmula">
            <span className="block">{enPalabras(c.formula, nombres)}</span>
            <span className="block font-mono text-xs text-muted-foreground">{c.formula}</span>
          </Dato>
        ) : null}
        <Dato termino="Variables">
          <ul className="flex list-none flex-col gap-2">
            {c.variables.map((v) => (
              <li key={v.letra}>
                <span className="font-medium">{`${v.letra} · ${v.nombre ?? ""}`}</span>
                <span className="block text-muted-foreground">
                  {[
                    v.descripcion,
                    v.fuente ? `Fuente: ${v.fuente}` : null,
                    v.unidad ? `Unidad: ${v.unidad}` : null,
                    CONSOLIDACION[v.consolidacion] ?? v.consolidacion,
                    v.capturaMin !== null || v.capturaMax !== null
                      ? `Se captura ${[v.capturaMin !== null ? `desde ${v.capturaMin.replace(".", ",")}` : null, v.capturaMax !== null ? `hasta ${v.capturaMax.replace(".", ",")}` : null].filter(Boolean).join(" ")}`
                      : null,
                    v.admiteNegativos ? "Admite negativos" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </Dato>
        <Dato termino="Unidad del resultado">{`${c.unidadNombre ?? ""}${u.sufijo.trim() ? ` (${u.sufijo.trim()})` : ""} · ${c.decimales ?? 0} decimales`}</Dato>
        <Dato termino="Periodicidad">{c.periodicidad ? (PERIODICIDAD[c.periodicidad] ?? c.periodicidad) : ninguno}</Dato>
        <Dato termino="Tendencia">{c.tendencia ? (TENDENCIA[c.tendencia] ?? c.tendencia) : ninguno}</Dato>
        <Dato termino="Meta">{regla.meta === null ? "Sin meta: cada medición queda «Sin meta», sin color ni alertas" : textoMeta(regla, u)}</Dato>
        {regla.meta !== null ? <Dato termino="Semáforo">{rangosEnPalabras(regla, u) ?? ninguno}</Dato> : null}
        {limites ? <Dato termino="Límites del resultado">{limites}</Dato> : null}
        <Dato termino="Línea base">{lineaBase ?? c.lineaBaseNota ?? ninguno}</Dato>
        {lineaBase && c.lineaBaseNota ? <Dato termino="Nota de la línea base">{c.lineaBaseNota}</Dato> : null}
        {c.sustentoMeta ? <Dato termino="Sustento de la meta">{c.sustentoMeta}</Dato> : null}
        <Dato termino="Responsables de medir">{medir.length > 0 ? medir.join(", ") : ninguno}</Dato>
        <Dato termino="Responsables de analizar">{analizar.length > 0 ? analizar.join(", ") : ninguno}</Dato>
      </Seccion>

      <Seccion id={id("firmas")} nivel={nivel} titulo="Firmas">
        <Dato termino="Elaboró">{ficha.firmas.elaboro ? textoFirma(ficha.firmas.elaboro) : <span className="text-muted-foreground">Sin enviar</span>}</Dato>
        <Dato termino="Revisó y aprobó">
          {aprobo === null ? (
            <span className="text-muted-foreground">Sin enviar</span>
          ) : typeof aprobo === "string" ? (
            <span className="text-muted-foreground">{aprobo}</span>
          ) : (
            textoFirma(aprobo)
          )}
        </Dato>
        {ficha.rigeDesde ? <Dato termino="Rige desde">{etiquetaDePeriodo(ficha.rigeDesde)}</Dato> : null}
        {ficha.motivo && ficha.tipoCambio !== "inicial" ? <Dato termino="Motivo del cambio">{ficha.motivo}</Dato> : null}
      </Seccion>

      {operacion ? (
        <Seccion id={id("operacion")} nivel={nivel} titulo="Datos de operación" descripcion="No son contenido de la ficha: no crean versión ni se firman.">
          <Dato termino="Quién mide">{operacion.mide.length > 0 ? operacion.mide.join(", ") : "El líder del proceso"}</Dato>
          <Dato termino="Quién analiza">{operacion.analiza.length > 0 ? operacion.analiza.join(", ") : "El líder del proceso"}</Dato>
          <Dato termino="Quién hace seguimiento">{operacion.seguimiento.length > 0 ? operacion.seguimiento.join(", ") : ninguno}</Dato>
          <Dato termino="Plazo de reporte">{`${operacion.plazoReporteDias} días después del cierre del periodo`}</Dato>
          <Dato termino="Inicio de medición">{operacion.inicioMedicion ? etiquetaDePeriodo(operacion.inicioMedicion) : ninguno}</Dato>
          <Dato termino="Soporte obligatorio">{operacion.soporteObligatorio ? "Sí: cada reporte lleva su soporte" : "No"}</Dato>
          <Dato termino="Nivel de acceso">
            <Insignia variante="neutra">{operacion.nivelAcceso === "restringido" ? "Restringido" : "General"}</Insignia>
          </Dato>
        </Seccion>
      ) : null}
    </div>
  );
}
