/**
 * El SGC-FO-14, plan de mejoramiento (Fase 15B, anexo §5, maqueta 4), de un plan para un proceso o consolidado de un proceso en un
 * año: el encabezado del formato, los datos del plan, una fila por actividad (o, a lo ancho, en qué va el hallazgo que todavía no
 * tiene plan de acción aprobado), «Aprobación y control», las convenciones de tipo y el pie. Las columnas son las del formato (spec
 * 15, Apéndice A.6) más «Plan», solo en el consolidado, y «Estado». Horizontal al imprimir (`Hoja horizontal`). Sin interacción:
 * todo llega leído por `fo14DePlan` o `fo14Consolidado`.
 */
import type { FilaDePlanDeAccion } from "@/db/consultas/mejoramiento/filas-de-plan";
import type { Fo14 } from "@/db/consultas/mejoramiento/fo14";
import { estadoDeActividadEnTexto } from "@/lib/mejoramiento/excel-ente";
import { fechaDeDia } from "@/lib/mejoramiento/formato";
import { ORIGENES } from "@/lib/mejoramiento/origenes";
import { ETIQUETA_CLASE, REPROGRAMADA } from "@/lib/mejoramiento/textos";
import type { TipoAccion } from "@/lib/mejoramiento/tipos";
import { cuenta } from "@/lib/plural";
import { EncabezadoDeFormato } from "./EncabezadoDeFormato";
import { Bloque, conPorcentajesUnidos, Hoja, Nota, PieDeImpreso, Tabla, TD, TH } from "./Partes";

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

const VACIO = "—";

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
          <li key={o.clave} className="inline-flex items-center gap-1">
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
          {fila("Periodo / vigencia", String(e.vigencia), "Fecha de elaboración", fechaDeDia(e.elaboradoEl))}
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
      <td className={`${TD} tabular-nums`}>{n}</td>
      {conPlan ? <td className={`${TD} whitespace-nowrap font-mono`}>{f.hallazgo.planCodigo ?? SIN_PLAN}</td> : null}
      <td className={`${TD} min-w-40`}>
        <Hallazgo f={f} />
      </td>
      {!a || !accion ? (
        <>
          <td colSpan={COLUMNAS_DE_LA_ACTIVIDAD} className={`${TD} whitespace-pre-line text-muted-foreground`}>
            {f.enQueVa ?? ""}
          </td>
          <td className={TD} />
        </>
      ) : (
        <>
          <td className={`${TD} min-w-32`}>{causaRaiz(accion)}</td>
          <td className={`${TD} min-w-40`}>{`${accion.descripcion}: ${a.descripcion}`}</td>
          <td className={TD}>{SIGLA_DE_TIPO[accion.tipo]}</td>
          <td className={`${TD} min-w-28`}>
            {a.responsable}
            {a.cargo ? <span className="block text-muted-foreground">{a.cargo}</span> : null}
          </td>
          <td className={TD}>{accion.recursos ?? VACIO}</td>
          <td className={`${TD} whitespace-nowrap`}>{fechaDeDia(a.inicio)}</td>
          <td className={`${TD} whitespace-nowrap`}>
            {fechaDeDia(a.fin)}
            {a.reprogramada ? <span className="block font-semibold">{REPROGRAMADA}</span> : null}
          </td>
          <td className={TD}>{accion.indicadorCumplimiento ?? VACIO}</td>
          <td className={TD}>{accion.meta ? conPorcentajesUnidos(accion.meta) : VACIO}</td>
          <td className={`${TD} whitespace-nowrap`}>{a.ultimoSeguimiento ? fechaDeDia(a.ultimoSeguimiento.fecha) : VACIO}</td>
          <td className={`${TD} tabular-nums`}>{a.avance}</td>
          <td className={`${TD} min-w-32`}>{observaciones(a)}</td>
          <td className={`${TD} whitespace-nowrap${a.vencida ? " font-semibold text-estado-critico-texto" : ""}`}>{estadoDeActividadEnTexto(a)}</td>
        </>
      )}
    </tr>
  );
}

/** La tabla de las acciones, que se desplaza a lo ancho en pantalla (enfocable, con nombre) y cabe en la hoja apaisada. */
function Acciones({ fo14 }: { fo14: Fo14 }) {
  const conPlan = fo14.forma === "consolidado";
  const columnas = 2 + (conPlan ? 1 : 0) + COLUMNAS_DE_LA_ACTIVIDAD + 1;
  const th = (texto: string, extra?: { colSpan?: number; rowSpan?: number; scope?: "col" | "colgroup" }) => (
    <th scope={extra?.scope ?? "col"} colSpan={extra?.colSpan} rowSpan={extra?.rowSpan} className={TH}>
      {texto}
    </th>
  );
  const dos = { rowSpan: 2 };
  return (
    <div role="region" aria-label="Acciones del plan de mejoramiento" tabIndex={0} className={`min-w-0 overflow-x-auto print:overflow-visible ${FOCO}`}>
      <table className="ficha-tabla fo14-acciones w-full min-w-[80rem] border-collapse text-xs print:min-w-0">
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
              <td colSpan={columnas} className={`${TD} text-muted-foreground`}>
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
                {`${APROBADO_FUERA} · ${a.fuera.rol} · ${fechaDeDia(a.fuera.fecha)}`}
              </td>
            ) : (
              <>
                <td className={TD}>{a.elaboro?.nombre ?? VACIO}</td>
                <td className={TD}>{a.elaboro?.cargo ?? VACIO}</td>
                <td className={TD}>{a.aprobo?.nombre ?? VACIO}</td>
                <td className={TD}>{a.aprobo ? [a.aprobo.cargo, fechaDeDia(a.aprobo.fecha)].filter(Boolean).join(" · ") : VACIO}</td>
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
