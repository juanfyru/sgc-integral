"use client";

import { useActionState } from "react";
import { programarMetaAccion, quitarMetaProgramadaAccion } from "@/app/acciones-indicadores";
import type { EstadoConAviso } from "@/app/admin/comun";
import { Boton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { Insignia } from "@/componentes/ui/Insignia";
import { celda, TablaDatos, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import type { MetaDelPeriodo } from "@/db/consultas/indicadores/metas";

const CLASE = "m-auto w-full max-w-3xl rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40";
const CONTROL = `${claseControl} w-full min-w-0`;
const COLUMNAS: ColumnaTabla[] = [
  { clave: "periodo", etiqueta: "Periodo" },
  { clave: "ficha", etiqueta: "Meta de la ficha" },
  { clave: "programada", etiqueta: "Programada" },
  { clave: "cambiar", etiqueta: "Cambiar" },
];

const conComa = (v: string | null) => (v === null ? "" : v.replace(".", ","));
const enTexto = (m: MetaDelPeriodo) =>
  m.programada === null
    ? "—"
    : `${conComa(m.programada)}${m.programadaMax !== null && m.programadaMax !== m.programada ? ` a ${conComa(m.programadaMax)}` : ""}${m.sufijo}`;

/** Una fila: su formulario guarda la meta de ese periodo y dice el resultado ahí mismo. */
function FilaDeMeta({ indicadorId, m }: { indicadorId: number; m: MetaDelPeriodo }) {
  const [estado, enviar, pendiente] = useActionState(async (_previo: EstadoConAviso, formData: FormData): Promise<EstadoConAviso> => {
    const r = await programarMetaAccion(null, formData);
    return r === null ? { ok: true, aviso: "Meta guardada." } : r;
  }, null);
  const [estadoQuitar, quitar, quitando] = useActionState(async (_previo: EstadoConAviso, formData: FormData): Promise<EstadoConAviso> => {
    const r = await quitarMetaProgramadaAccion(null, formData);
    return r === null ? { ok: true, aviso: "Meta quitada: rige la de la ficha." } : r;
  }, null);
  const v = estado && !estado.ok ? (estado.valores ?? {}) : {};
  const valor = (campo: string, porOmision: string) => (typeof v[campo] === "string" ? (v[campo] as string) : porOmision);
  const id = (campo: string) => `meta-${m.periodo}-${campo}`;
  const marcas = [m.historica ? "Histórico" : null, m.tardia ? "Meta ajustada después del periodo" : null].filter((x): x is string => x !== null);
  return (
    <tr>
      <th scope="row" className={`${celda} text-left font-medium`}>
        {m.etiqueta}
        {marcas.map((x) => (
          <span key={x} className="mt-1 block">
            <Insignia variante="neutra">{x}</Insignia>
          </span>
        ))}
      </th>
      <td className={`${celda} whitespace-nowrap`}>{m.textoHeredada}</td>
      <td className={`${celda} whitespace-nowrap`}>{enTexto(m)}</td>
      <td className={`${celda} min-w-56`}>
        {m.cerrada ? (
          <span className="text-muted-foreground">Cerrada: reábrala para cambiar su meta.</span>
        ) : (
          <form action={enviar} className="flex flex-col gap-2">
            <input type="hidden" name="id" value={indicadorId} />
            <input type="hidden" name="periodo" value={m.periodo} />
            <label htmlFor={id("meta")} className="sr-only">{`Meta de ${m.etiqueta.toLowerCase()}`}</label>
            <input
              id={id("meta")}
              name="meta"
              required
              inputMode="decimal"
              autoComplete="off"
              defaultValue={valor("meta", conComa(m.programada ?? m.heredada))}
              className={CONTROL}
            />
            {m.constante ? (
              <>
                <label htmlFor={id("max")} className="text-xs">
                  Hasta (máximo del rango)
                </label>
                <input
                  id={id("max")}
                  name="metaMax"
                  inputMode="decimal"
                  autoComplete="off"
                  defaultValue={valor("metaMax", conComa(m.programadaMax ?? m.heredadaMax))}
                  className={CONTROL}
                />
              </>
            ) : null}
            {m.pideJustificacion ? (
              <>
                <label htmlFor={id("justificacion")} className="text-xs">
                  Justificación (el periodo ya terminó)
                </label>
                <textarea
                  id={id("justificacion")}
                  name="justificacion"
                  required
                  minLength={10}
                  maxLength={500}
                  rows={2}
                  defaultValue={valor("justificacion", "")}
                  className={CONTROL}
                />
              </>
            ) : null}
            {estado ? (
              <p role={estado.ok ? "status" : "alert"} className={`text-xs ${estado.ok ? "text-estado-bien-texto" : "text-estado-critico-texto"}`}>
                {estado.ok ? estado.aviso : estado.error}
              </p>
            ) : null}
            <div>
              <Boton type="submit" tamano="sm" variante="secundario" pendiente={pendiente}>
                {pendiente ? "Guardando…" : "Guardar"}
                <span className="sr-only">{` la meta de ${m.etiqueta.toLowerCase()}`}</span>
              </Boton>
            </div>
          </form>
        )}
        {!m.cerrada && m.programada !== null ? (
          <form action={quitar} className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
            <input type="hidden" name="id" value={indicadorId} />
            <input type="hidden" name="periodo" value={m.periodo} />
            {m.pideJustificacion ? (
              <>
                <label htmlFor={id("justificacion-quitar")} className="text-xs">
                  Justificación para quitarla (el periodo ya terminó)
                </label>
                <textarea
                  id={id("justificacion-quitar")}
                  name="justificacion"
                  required
                  minLength={10}
                  maxLength={500}
                  rows={2}
                  className={CONTROL}
                />
              </>
            ) : null}
            {estadoQuitar ? (
              <p role={estadoQuitar.ok ? "status" : "alert"} className={`text-xs ${estadoQuitar.ok ? "text-estado-bien-texto" : "text-estado-critico-texto"}`}>
                {estadoQuitar.ok ? estadoQuitar.aviso : estadoQuitar.error}
              </p>
            ) : null}
            <div>
              <Boton type="submit" tamano="sm" variante="secundario" pendiente={quitando}>
                {quitando ? "Quitando…" : "Quitar"}
                <span className="sr-only">{` la meta programada de ${m.etiqueta.toLowerCase()}`}</span>
              </Boton>
            </div>
          </form>
        ) : null}
      </td>
    </tr>
  );
}

/**
 * «Programar metas» (spec §8.9): la tabla de los periodos del año con la meta que heredan de la ficha, la programada y
 * un campo para cambiarla. Sin clave; queda en la bitácora con antes y después. Un periodo terminado pide justificación
 * y deja la marca; uno cerrado solo se cambia reabriéndolo.
 */
export function DialogoMetas({
  abierto,
  alCerrar,
  indicadorId,
  codigo,
  anio,
  metas,
}: {
  abierto: boolean;
  alCerrar: () => void;
  indicadorId: number;
  codigo: string;
  anio: number;
  metas: MetaDelPeriodo[];
}) {
  const titulo = `Programar metas de ${codigo} en ${anio}`;
  return (
    <Dialogo abierto={abierto} alCerrar={alCerrar} titulo={titulo} className={CLASE}>
      {abierto ? (
        <div className="flex flex-col gap-4 p-5">
          <p aria-hidden="true" className="font-semibold">
            {titulo}
          </p>
          <p className="text-sm text-muted-foreground">
            Antes de que el periodo termine, la meta se cambia libremente. Después, pide una justificación y la tabla del año lo marca «Meta ajustada después
            del periodo». Un histórico no la pide. En rangos fijos, el límite de crítico es el de la ficha.
          </p>
          <TablaDatos titulo={titulo} columnas={COLUMNAS} filas={metas.length} vacio={`No hay periodos que medir en ${anio}.`}>
            {metas.map((m) => (
              <FilaDeMeta key={m.periodo} indicadorId={indicadorId} m={m} />
            ))}
          </TablaDatos>
          <div className="flex justify-end">
            <Boton variante="secundario" onClick={alCerrar}>
              Cerrar
            </Boton>
          </div>
        </div>
      ) : null}
    </Dialogo>
  );
}
