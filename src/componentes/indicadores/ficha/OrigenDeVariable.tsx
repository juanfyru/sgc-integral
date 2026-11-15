"use client";

import { Check, TriangleAlert } from "lucide-react";
import { claseControl } from "@/componentes/ui/Campo";
import { Insignia } from "@/componentes/ui/Insignia";
import type { DatosFicha } from "@/lib/esquemas/indicadores";
import { avisoDeDeduccion, ETIQUETA_PERIODICIDAD, type Consolidacion, type OpcionesFicha, type Toma } from "@/lib/indicadores/tipos";

/**
 * De dónde sale cada variable de una ficha manual (anexo 14C, §3.1): la digita quien mide («Propia»), la reporta el
 * responsable de un dato compartido (§4.2) o es el resultado de otro indicador (§6.1). El origen y sus referencias viajan
 * en el JSON de `variables`: los controles de aquí no tienen `name` (el esquema de la ficha es estricto).
 */

/** El origen de una variable en el formulario: el de una automática lo pone el registro de cálculos. */
export type OrigenDeFormulario = NonNullable<DatosFicha["variables"][number]["origen"]>;

/** Una variable del formulario: la de la ficha con su origen siempre dicho (el esquema lo admite sin él, «propia»). */
export type VariableDelFormulario = Omit<DatosFicha["variables"][number], "origen"> & { origen: OrigenDeFormulario };

export const ORIGENES_DE_VARIABLE: readonly { valor: OrigenDeFormulario; nombre: string }[] = [
  { valor: "propia", nombre: "Propia" },
  { valor: "compartida", nombre: "Dato compartido" },
  { valor: "indicador", nombre: "Resultado de otro indicador" },
];

export const ETIQUETA_CONSOLIDACION: Record<Consolidacion, string> = { suma: "Se suma", ultimo: "Último valor", promedio: "Promedio" };

const CONTROL = `${claseControl} w-full min-w-0 max-w-full`;
const PASO: Readonly<Partial<Record<string, 1 | -1>>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/** El origen al que llevan las flechas desde `actual`, dando la vuelta, como en un grupo de radios; `null` con otra tecla. */
export function origenConTecla(actual: OrigenDeFormulario, tecla: string): OrigenDeFormulario | null {
  const paso = PASO[tecla];
  if (paso === undefined) return null;
  const n = ORIGENES_DE_VARIABLE.length;
  const i = ORIGENES_DE_VARIABLE.findIndex((o) => o.valor === actual);
  return ORIGENES_DE_VARIABLE[(i + paso + n) % n].valor;
}

/** Lo que una variable copia de un dato al elegirlo: el nombre y «cómo se junta» (el esquema los pide; el servidor los vuelve a copiar). */
function delDato(datos: OpcionesFicha["datos"], datoId: number | undefined): Partial<VariableDelFormulario> {
  const dato = datos.find((d) => d.id === datoId);
  return dato ? { datoId: dato.id, nombre: dato.nombre, consolidacion: dato.consolidacion } : {};
}

/**
 * Lo que cambia en la variable al elegir su origen: se sueltan las referencias que el nuevo no usa. Una que vuelve a ser
 * propia desde un indicador vuelve a «se suma» (el «último» de una tomada lo pone el servidor y no es de quien mide).
 */
export function cambioDeOrigen(v: VariableDelFormulario, origen: OrigenDeFormulario, datos: OpcionesFicha["datos"]): Partial<VariableDelFormulario> {
  if (origen === "propia") {
    return { origen, datoId: undefined, indicadorOrigenId: undefined, toma: undefined, ...(v.origen === "indicador" ? { consolidacion: "suma" as const } : {}) };
  }
  if (origen === "compartida") return { origen, indicadorOrigenId: undefined, toma: undefined, ...delDato(datos, v.datoId) };
  return { origen, datoId: undefined, toma: v.toma ?? "valor" };
}

/** Elegir el dato de una variable: su nombre y «cómo se junta» vienen con él. */
export const cambioDeDato = (datoId: number | undefined, datos: OpcionesFicha["datos"]): Partial<VariableDelFormulario> =>
  datoId === undefined ? { datoId: undefined } : { datoId, ...delDato(datos, datoId) };

/**
 * Elegir el indicador de una variable: si aún no tiene nombre, toma el del indicador; y si se tomaba el cumplimiento de uno
 * con meta y el nuevo no la tiene, pasa a su valor.
 */
export function cambioDeIndicador(v: VariableDelFormulario, id: number | undefined, tomables: OpcionesFicha["tomables"]): Partial<VariableDelFormulario> {
  const t = tomables.find((x) => x.id === id);
  return {
    indicadorOrigenId: id,
    ...(t && v.nombre.trim() === "" ? { nombre: t.nombre } : {}),
    ...(t && !t.conMeta && v.toma === "cumplimiento" ? { toma: "valor" as const } : {}),
  };
}

/** La advertencia al tomar un indicador restringido (anexo 14C, §6.1): una insignia de atención con su texto. */
export function AvisoDeDeduccion({ nombre }: { nombre: string }) {
  return (
    <Insignia variante="atencion" icono={TriangleAlert}>
      {avisoDeDeduccion(nombre)}
    </Insignia>
  );
}

function Rotulado({ id, etiqueta, ayuda, children }: { id: string; etiqueta: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {etiqueta}
      </label>
      {children}
      {ayuda ? (
        <p id={`${id}-ayuda`} className="text-xs text-muted-foreground">
          {ayuda}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Una variable en «Variables»: de dónde sale (un grupo de opciones que se recorre con las flechas, como un grupo de radios:
 * una sola parada del tabulador, en la elegida) y lo que ese origen pide. Propia: su nombre y su fuente. Dato compartido: el
 * dato y, en solo lectura, su nombre, su unidad y «cómo se junta». Resultado de otro indicador: el indicador, qué se toma y
 * el nombre de la variable; con uno restringido, el aviso de deducción.
 */
export function OrigenDeVariable({
  variable: v,
  etiqueta,
  datos,
  tomables,
  alCambiar,
}: {
  variable: VariableDelFormulario;
  /** El rótulo de su nombre: «Variable A» o «A · Numerador». */
  etiqueta: string;
  datos: OpcionesFicha["datos"];
  tomables: OpcionesFicha["tomables"];
  alCambiar: (cambio: Partial<VariableDelFormulario>) => void;
}) {
  const id = `ficha-variable-${v.letra}`;
  const dato = v.origen === "compartida" ? (datos.find((d) => d.id === v.datoId) ?? null) : null;
  const tomable = v.origen === "indicador" ? (tomables.find((t) => t.id === v.indicadorOrigenId) ?? null) : null;
  const elegir = (origen: OrigenDeFormulario) => alCambiar(cambioDeOrigen(v, origen, datos));
  const conTecla = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const siguiente = origenConTecla(v.origen, e.key);
    if (!siguiente) return;
    e.preventDefault();
    elegir(siguiente);
    document.getElementById(`${id}-origen-${siguiente}`)?.focus();
  };
  const numero = (t: string) => (t ? Number(t) : undefined);
  const nombre = (
    <Rotulado id={id} etiqueta={etiqueta}>
      <input
        id={id}
        maxLength={150}
        value={v.nombre}
        placeholder="Qué se cuenta en el periodo"
        onChange={(e) => alCambiar({ nombre: e.target.value })}
        className={CONTROL}
      />
    </Rotulado>
  );

  return (
    <>
      <fieldset id={`${id}-origen`} className="min-w-0 sm:col-span-2">
        <legend className="mb-1 text-sm font-medium">{`De dónde sale ${v.letra}`}</legend>
        <div className="flex flex-wrap gap-2">
          {ORIGENES_DE_VARIABLE.map((o, i) => {
            const elegida = o.valor === v.origen;
            return (
              <div key={o.valor} className="min-w-0">
                <input
                  type="radio"
                  id={`${id}-origen-${o.valor}`}
                  checked={elegida}
                  tabIndex={elegida ? 0 : -1}
                  aria-posinset={i + 1}
                  aria-setsize={ORIGENES_DE_VARIABLE.length}
                  onChange={() => elegir(o.valor)}
                  onKeyDown={conTecla}
                  className="peer sr-only"
                />
                <label
                  htmlFor={`${id}-origen-${o.valor}`}
                  className={`flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-marca ${
                    elegida ? "border-2 border-mod-indicadores bg-muted font-semibold" : "border-border bg-card hover:bg-muted"
                  }`}
                >
                  {elegida ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
                  <span>{o.nombre}</span>
                </label>
              </div>
            );
          })}
        </div>
      </fieldset>

      {v.origen === "propia" ? (
        <>
          {nombre}
          <Rotulado id={`${id}-fuente`} etiqueta={`Fuente de ${v.letra}`}>
            <input
              id={`${id}-fuente`}
              maxLength={300}
              value={v.fuente ?? ""}
              placeholder="De dónde sale el dato"
              onChange={(e) => alCambiar({ fuente: e.target.value })}
              className={CONTROL}
            />
          </Rotulado>
        </>
      ) : null}

      {v.origen === "compartida" ? (
        <>
          <div className="min-w-0 sm:col-span-2">
            <Rotulado id={`${id}-dato`} etiqueta={`Dato compartido de ${v.letra}`}>
              <select id={`${id}-dato`} required value={v.datoId ?? ""} onChange={(e) => alCambiar(cambioDeDato(numero(e.target.value), datos))} className={CONTROL}>
                <option value="">Elija el dato</option>
                {datos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {`${d.nombre} · ${d.proceso} · ${ETIQUETA_PERIODICIDAD[d.periodicidad]}${d.inactivo ? " (inactivo)" : ""}`}
                  </option>
                ))}
              </select>
            </Rotulado>
          </div>
          <Rotulado id={id} etiqueta={etiqueta} ayuda="Lo pone el dato compartido.">
            <input id={id} readOnly value={dato?.nombre ?? (v.datoId !== undefined ? v.nombre : "")} aria-describedby={`${id}-ayuda`} className={CONTROL} />
          </Rotulado>
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
            <Rotulado id={`${id}-dato-unidad`} etiqueta={`Unidad de ${v.letra}`}>
              <input id={`${id}-dato-unidad`} readOnly value={dato?.unidad ?? ""} placeholder="(sin unidad)" className={CONTROL} />
            </Rotulado>
            <Rotulado id={`${id}-dato-consolidacion`} etiqueta={`Cómo se junta ${v.letra} en un periodo mayor`}>
              <input id={`${id}-dato-consolidacion`} readOnly value={dato ? ETIQUETA_CONSOLIDACION[dato.consolidacion] : ""} className={CONTROL} />
            </Rotulado>
          </div>
        </>
      ) : null}

      {v.origen === "indicador" ? (
        <>
          <Rotulado id={`${id}-indicador`} etiqueta={`Indicador del que sale ${v.letra}`}>
            <select
              id={`${id}-indicador`}
              required
              value={v.indicadorOrigenId ?? ""}
              onChange={(e) => alCambiar(cambioDeIndicador(v, numero(e.target.value), tomables))}
              className={CONTROL}
            >
              <option value="">Elija el indicador</option>
              {tomables.map((t) => (
                <option key={t.id} value={t.id}>
                  {`${t.codigo} ${t.nombre}${t.retirado ? " (retirado)" : ""}`}
                </option>
              ))}
            </select>
          </Rotulado>
          <Rotulado
            id={`${id}-toma`}
            etiqueta={`Qué se toma para ${v.letra}`}
            ayuda={tomable && !tomable.conMeta ? "Sin meta no hay porcentaje de cumplimiento: se toma su valor." : undefined}
          >
            <select
              id={`${id}-toma`}
              value={v.toma ?? "valor"}
              onChange={(e) => alCambiar({ toma: e.target.value as Toma })}
              aria-describedby={tomable && !tomable.conMeta ? `${id}-toma-ayuda` : undefined}
              className={CONTROL}
            >
              <option value="valor">Su valor</option>
              <option value="cumplimiento" disabled={tomable !== null && !tomable.conMeta && v.toma !== "cumplimiento"}>
                Su porcentaje de cumplimiento
              </option>
            </select>
          </Rotulado>
          {nombre}
          {tomable?.restringido ? (
            <p className="min-w-0 sm:col-span-2">
              <AvisoDeDeduccion nombre={tomable.nombre} />
            </p>
          ) : null}
        </>
      ) : null}
    </>
  );
}
