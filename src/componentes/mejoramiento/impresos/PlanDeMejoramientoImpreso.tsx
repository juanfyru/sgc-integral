/**
 * El SGC-FO-14, plan de mejoramiento (Fase 15B, anexo §5, maqueta 4), de un plan para un proceso o consolidado de un proceso en un
 * año: el encabezado del formato, los datos del plan, una fila por actividad (o, a lo ancho, en qué va el hallazgo que todavía no
 * tiene plan de acción aprobado), «Aprobación y control», las convenciones de tipo y el pie. Las columnas son las del formato (spec
 * 15, Apéndice A.6) más «Plan», solo en el consolidado, y «Estado». Horizontal al imprimir (`Hoja horizontal`). Sin interacción:
 * todo llega leído por `fo14DePlan` o `fo14Consolidado`.
 */
import type { FilaDePlanDeAccion } from "@/db/consultas/mejoramiento/filas-de-plan";
import type { Fo14 } from "@/db/consultas/mejoramiento/fo14";
import { ORIGENES } from "@/lib/mejoramiento/origenes";
import { estadoDeActividadCorto, ETIQUETA_CLASE, REPROGRAMADA } from "@/lib/mejoramiento/textos";
import type { TipoAccion } from "@/lib/mejoramiento/tipos";
import { cuenta } from "@/lib/plural";
import { EncabezadoDeFormato } from "./EncabezadoDeFormato";
import { Bloque, BORDE, conPorcentajesUnidos, Hoja, Nota, PieDeImpreso, Tabla, TD, TH } from "./Partes";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/** La casilla «Plan» de un hallazgo del consolidado que no está en ningún plan (anexo §5.3). */
export const SIN_PLAN = "Sin plan";
/** La línea de «Aprobación y control» de un hallazgo cargado (anexo §5.4). */
export const APROBADO_FUERA = "Aprobado fuera de la plataforma";
/** Las convenciones de tipo del formato (spec 15, Apéndice A.6): los tres tipos de acción. */
export const SIGLA_DE_TIPO: Readonly<Record<TipoAccion, string>> = { correctiva: "AC", preventiva: "AP", mejora: "AM" };
export const CONVENCIONES_DE_TIPO = "Convenciones de tipo: AC, acción correctiva · AP, acción preventiva · AM, acción de mejora.";

/** Lo que pinta el impreso: el SGC-FO-14 ya leído y lo que la página pone (la entidad, quién imprime y cuándo). */
export type DatosDelPlanImpreso = {
  fo14: Fo14;
  /** El nombre de la entidad (`obtenerMarcaSegura`) y la dirección de su logo, o nula. */
  entidad: string;
  logo: string | null;
  impresoEn: Date;
  impresoPor: string;
  zona: string;
};

/** Las columnas de la tabla de las acciones después de «Hallazgo» y antes de «Estado»: las que cubre la fila de en qué va. */
const COLUMNAS_DE_LA_ACTIVIDAD = 12;

/**
 * El ancho relativo de cada columna de la tabla de las acciones, en su orden. Con `table-layout: fixed` la tabla mide el ancho de
 * la hoja (A4 o carta apaisadas, con los márgenes de `@page ficha-horizontal`) y cada columna su parte: ninguna casilla la ensancha
 * y el texto se parte dentro de ella. «Plan» solo existe en el consolidado.
 */
const PESOS: ReadonlyArray<{ clave: string; peso: number; soloConsolidado?: true }> = [
  { clave: "n", peso: 2.5 },
  { clave: "plan", peso: 8.5, soloConsolidado: true },
  { clave: "hallazgo", peso: 9.5 },
  { clave: "causa", peso: 8.5 },
  { clave: "accion", peso: 9.5 },
  { clave: "tipo", peso: 3.5 },
  { clave: "responsable", peso: 8 },
  { clave: "recursos", peso: 7.5 },
  { clave: "inicio", peso: 5.5 },
  { clave: "fin", peso: 9 },
  { clave: "indicador", peso: 8.5 },
  { clave: "meta", peso: 7.5 },
  { clave: "seguimiento", peso: 5.5 },
  { clave: "avance", peso: 5 },
  { clave: "observaciones", peso: 9 },
  { clave: "estado", peso: 7 },
];

/** Las casillas de la tabla de las acciones: relleno corto y el texto partido donde haga falta, nunca más ancho que su columna. */
const CELDA = `${BORDE} px-1 py-1 align-top [overflow-wrap:anywhere]`;
const CABECERA = `${CELDA} bg-muted text-left font-semibold hyphens-auto`;

const VACIO = "—";

/** `AAAA-MM-DD` como `DD/MM/AAAA`, el día del formato (maqueta 4). */
const diaDelFormato = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;

/** Un día en una columna angosta: si no cabe, se parte antes del año y no dentro de una cifra. */
function Dia({ dia }: { dia: string }) {
  return (
    <span className="tabular-nums">
      {`${dia.slice(8, 10)}/${dia.slice(5, 7)}/`}
      <wbr />
      {dia.slice(0, 4)}
    </span>
  );
}

/** Una lista de líneas dentro de una casilla: un líder por línea. */
function Lineas({ lineas }: { lineas: readonly string[] }) {
  return (
    <ul className="flex list-none flex-col">
      {lineas.map((l, i) => (
        <li key={i} className="break-words">
          {l}
        </li>
      ))}
    </ul>
  );
}

/** Los catorce orígenes, cada uno con su casilla: marcada la de los que tienen las filas (anexo §5.2). */
function Fuentes({ fuentes }: { fuentes: Fo14["encabezado"]["fuentes"] }) {
  const tiene = new Set(fuentes);
  return (
    <ul className="flex list-none flex-wrap gap-x-4 gap-y-1">
      {ORIGENES.map((o) => {
        const marcada = tiene.has(o.clave);
        return (
          // `relative`: el texto para lector de pantalla (`sr-only`, absoluto) queda dentro de la tabla que se desplaza y no ensancha
          // la página a 390 px.
          <li key={o.clave} className="relative inline-flex items-center gap-1">
            <span
              aria-hidden="true"
              className="inline-flex size-3.5 shrink-0 items-center justify-center border border-foreground text-[0.6rem] font-bold leading-none"
            >
              {marcada ? "X" : ""}
            </span>
            <span className={marcada ? "font-semibold" : undefined}>{o.etiqueta}</span>
            <span className="sr-only">{marcada ? "(marcada)" : "(sin marcar)"}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Los datos del plan (anexo §5.2): dos pares por fila, como el formato; la fuente y el objetivo, a lo ancho. */
function DatosDelPlan({ fo14 }: { fo14: Fo14 }) {
  const e = fo14.encabezado;
  const fila = (a: string, va: React.ReactNode, b: string, vb: React.ReactNode, mono = false) => (
    <tr>
      <th scope="row" className={`${TH} w-36`}>
        {a}
      </th>
      <td className={TD}>{va}</td>
      <th scope="row" className={`${TH} w-36`}>
        {b}
      </th>
      <td className={`${TD}${mono ? " font-mono" : ""}`}>{vb}</td>
    </tr>
  );
  const sinLider = e.responsables.length === 0;
  return (
    <div className="ficha-corto">
      <Tabla nombre="Datos del plan de mejoramiento" ancha>
        <tbody>
          {fila("Origen del plan", e.origenDelPlan, "Código del plan", e.codigoDelPlan, fo14.forma === "plan")}
          {fila("Macroproceso", e.macroproceso, "Proceso", e.proceso)}
          {fila(
            "Responsable",
            sinLider ? "Sin líder activo" : <Lineas lineas={e.responsables.map((r) => r.nombre)} />,
            "Cargo",
            sinLider ? VACIO : <Lineas lineas={e.responsables.map((r) => r.cargo ?? "Sin cargo")} />,
          )}
          {fila("Periodo / vigencia", String(e.vigencia), "Fecha de elaboración", diaDelFormato(e.elaboradoEl))}
          <tr>
            <th scope="row" className={TH}>
              Fuente del hallazgo
            </th>
            <td colSpan={3} className={TD}>
              <Fuentes fuentes={e.fuentes} />
            </td>
          </tr>
          <tr>
            <th scope="row" className={TH}>
              Objetivo del plan
            </th>
            <td colSpan={3} className={`${TD} whitespace-pre-line`}>
              {e.objetivo ?? ""}
            </td>
          </tr>
        </tbody>
      </Tabla>
    </div>
  );
}

/** El código, el título y la clase del hallazgo; la ronda, cuando tiene más de una (anexo §5.3). */
function Hallazgo({ f }: { f: FilaDePlanDeAccion }) {
  return (
    <>
      <span className="font-mono">{f.hallazgo.codigo}</span>
      {` · ${f.hallazgo.titulo}`}
      <span className="block text-muted-foreground">
        {[ETIQUETA_CLASE[f.hallazgo.clase], f.rondas > 1 ? `Ronda ${f.ronda}` : null].filter(Boolean).join(" · ")}
      </span>
    </>
  );
}

/** Las causas que la acción ataca, con el método entre paréntesis. */
function causaRaiz(accion: NonNullable<FilaDePlanDeAccion["accion"]>): string {
  const partes = [accion.causas || null, accion.metodo ? `(${accion.metodo})` : null].filter(Boolean);
  return partes.length > 0 ? partes.join(" ") : VACIO;
}

/** «Observaciones / evidencia»: lo que dice el último seguimiento y cuántos archivos tiene la actividad (F15B-DC12). */
function observaciones(a: NonNullable<FilaDePlanDeAccion["actividad"]>): string {
  const partes = [a.ultimoSeguimiento?.realizado ?? null, a.archivos > 0 ? cuenta(a.archivos, "archivo", "archivos") : null].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : VACIO;
}

function FilaDeActividad({ n, f, conPlan }: { n: number; f: FilaDePlanDeAccion; conPlan: boolean }) {
  const a = f.actividad;
  const accion = f.accion;
  return (
    <tr>
      <td className={`${CELDA} tabular-nums`}>{n}</td>
      {conPlan ? <td className={`${CELDA} font-mono`}>{f.hallazgo.planCodigo ?? SIN_PLAN}</td> : null}
      <td className={CELDA}>
        <Hallazgo f={f} />
      </td>
      {!a || !accion ? (
        <>
          <td colSpan={COLUMNAS_DE_LA_ACTIVIDAD} className={`${CELDA} whitespace-pre-line text-muted-foreground`}>
            {f.enQueVa ?? ""}
          </td>
          <td className={CELDA} />
        </>
      ) : (
        <>
          <td className={CELDA}>{causaRaiz(accion)}</td>
          <td className={CELDA}>{`${accion.descripcion}: ${a.descripcion}`}</td>
          <td className={CELDA}>{SIGLA_DE_TIPO[accion.tipo]}</td>
          <td className={CELDA}>
            {a.responsable}
            {a.cargo ? <span className="block text-muted-foreground">{a.cargo}</span> : null}
          </td>
          <td className={CELDA}>{accion.recursos ?? VACIO}</td>
          <td className={CELDA}>
            <Dia dia={a.inicio} />
          </td>
          <td className={CELDA}>
            <Dia dia={a.fin} />
            {a.reprogramada ? <span className="block font-semibold hyphens-auto">{REPROGRAMADA}</span> : null}
          </td>
          <td className={CELDA}>{accion.indicadorCumplimiento ?? VACIO}</td>
          <td className={CELDA}>{accion.meta ? conPorcentajesUnidos(accion.meta) : VACIO}</td>
          <td className={CELDA}>{a.ultimoSeguimiento ? <Dia dia={a.ultimoSeguimiento.fecha} /> : VACIO}</td>
          <td className={`${CELDA} tabular-nums`}>{a.avance}</td>
          <td className={CELDA}>{observaciones(a)}</td>
          <td className={`${CELDA}${a.vencida ? " font-semibold text-estado-critico-texto" : ""}`}>{estadoDeActividadCorto(a)}</td>
        </>
      )}
    </tr>
  );
}

/**
 * La tabla de las acciones: al imprimir mide el ancho de la hoja apaisada (`table-layout: fixed`, las columnas en proporción a
 * `PESOS`, a 7 pt); en pantalla, a 10 px, desde 56 rem cabe en el contenido a 1280 px y por debajo se desplaza a lo ancho
 * (enfocable, con nombre).
 */
function Acciones({ fo14 }: { fo14: Fo14 }) {
  const conPlan = fo14.forma === "consolidado";
  const pesos = PESOS.filter((p) => conPlan || !p.soloConsolidado);
  const total = pesos.reduce((s, p) => s + p.peso, 0);
  const th = (texto: string, extra?: { colSpan?: number; rowSpan?: number; scope?: "col" | "colgroup" }) => (
    <th scope={extra?.scope ?? "col"} colSpan={extra?.colSpan} rowSpan={extra?.rowSpan} className={CABECERA}>
      {texto}
    </th>
  );
  const dos = { rowSpan: 2 };
  return (
    <div role="region" aria-label="Acciones del plan de mejoramiento" tabIndex={0} className={`min-w-0 overflow-x-auto print:overflow-visible ${FOCO}`}>
      <table className="ficha-tabla fo14-acciones w-full min-w-[56rem] table-fixed border-collapse text-[0.625rem] print:min-w-0">
        <colgroup>
          {pesos.map((p) => (
            <col key={p.clave} style={{ width: `${((p.peso / total) * 100).toFixed(3)}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {th("N°", dos)}
            {conPlan ? th("Plan", dos) : null}
            {th("Hallazgo / oportunidad de mejora", dos)}
            {th("Causa raíz", dos)}
            {th("Acción de mejora", dos)}
            {th("Tipo", dos)}
            {th("Responsable", dos)}
            {th("Recursos", dos)}
            {th("Inicio", dos)}
            {th("Fin", dos)}
            {th("Indicador de cumplimiento", dos)}
            {th("Meta", dos)}
            {th("Seguimiento", { colSpan: 3, scope: "colgroup" })}
            {th("Estado", dos)}
          </tr>
          <tr>
            {th("Fecha")}
            {th("% avance")}
            {th("Observaciones / evidencia")}
          </tr>
        </thead>
        <tbody>
          {fo14.filas.length === 0 ? (
            <tr>
              <td colSpan={pesos.length} className={`${CELDA} text-muted-foreground`}>
                {conPlan ? `El proceso no tuvo hallazgos abiertos en ${fo14.encabezado.vigencia}.` : "Sin hallazgos que imprimir."}
              </td>
            </tr>
          ) : (
            fo14.filas.map((f, i) => <FilaDeActividad key={`${f.hallazgo.id}-${f.ronda}-${f.actividad?.id ?? "va"}`} n={i + 1} f={f} conPlan={conPlan} />)
          )}
        </tbody>
      </table>
    </div>
  );
}

/** «Aprobación y control» (anexo §5.4): una línea por hallazgo con plan de acción aprobado; uno cargado, aprobado en papel. */
function AprobacionYControl({ aprobaciones }: { aprobaciones: Fo14["aprobaciones"] }) {
  if (aprobaciones.length === 0) return <Nota>Ningún hallazgo de este impreso tiene todavía su plan de acción aprobado.</Nota>;
  return (
    <Tabla nombre="Aprobación y control">
      <thead>
        <tr>
          {["Hallazgo", "Elaborado por", "Cargo", "Aprobado por", "Cargo y fecha"].map((c) => (
            <th key={c} scope="col" className={TH}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {aprobaciones.map((a) => (
          <tr key={a.codigo}>
            <td className={`${TD} whitespace-nowrap font-mono`}>{a.codigo}</td>
            {a.fuera ? (
              <td colSpan={4} className={TD}>
                {`${APROBADO_FUERA} · ${a.fuera.rol} · ${diaDelFormato(a.fuera.fecha)}`}
              </td>
            ) : (
              <>
                <td className={TD}>{a.elaboro?.nombre ?? VACIO}</td>
                <td className={TD}>{a.elaboro?.cargo ?? VACIO}</td>
                <td className={TD}>{a.aprobo?.nombre ?? VACIO}</td>
                <td className={TD}>{a.aprobo ? [a.aprobo.cargo, diaDelFormato(a.aprobo.fecha)].filter(Boolean).join(" · ") : VACIO}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </Tabla>
  );
}

export function PlanDeMejoramientoImpreso({ fo14, entidad, logo, impresoEn, impresoPor, zona }: DatosDelPlanImpreso) {
  const titulo = "fo14-titulo";
  return (
    <Hoja titulo={titulo} horizontal>
      <EncabezadoDeFormato entidad={entidad} logo={logo} titulo="Plan de mejoramiento" formato={fo14.formato} zona={zona} idTitulo={titulo} />
      <DatosDelPlan fo14={fo14} />
      <Bloque id="fo14-acciones" titulo="Acciones de mejora">
        <Acciones fo14={fo14} />
      </Bloque>
      <Bloque id="fo14-aprobacion" titulo="Aprobación y control">
        <AprobacionYControl aprobaciones={fo14.aprobaciones} />
      </Bloque>
      <Nota>{CONVENCIONES_DE_TIPO}</Nota>
      <PieDeImpreso impresoEn={impresoEn} impresoPor={impresoPor} zona={zona} />
    </Hoja>
  );
}
