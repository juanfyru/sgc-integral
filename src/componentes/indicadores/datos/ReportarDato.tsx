"use client";

import { useRouter } from "next/navigation";
import { useActionState, useId, useState } from "react";
import { reportarDatoCompartido } from "@/app/acciones-indicadores";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { ZonaCarga } from "@/componentes/admin/ZonaCarga";
import { IconoFormato } from "@/componentes/documentos/IconoFormato";
import { CLASE_DIALOGO } from "@/componentes/indicadores/admin/DialogoRetirar";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import type { Soporte } from "@/db/consultas/indicadores/soportes";
import type { EstadoReporte } from "@/lib/indicadores/reporte";
import { rutaDeSoporteDeDato, rutaDeSubidaDeDato } from "@/lib/indicadores/rutas";
import { PERIODO_SIN_CATEGORIAS } from "@/lib/indicadores/tipos";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const CONTROL = `${claseControl} w-full min-w-0 max-w-full`;
const CAJA = "flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3";
const AVISO = "flex flex-col gap-2 rounded-md border border-l-4 border-border border-l-estado-atencion bg-card px-3 py-2 text-sm";

/** Lo que la pantalla necesita de un periodo para reportarlo o corregirlo, ya en texto. */
export type PeriodoParaReportar = {
  id: number;
  /** «octubre de 2026». */
  etiqueta: string;
  /** «10 de noviembre». */
  vence: string;
  /** La fecha límite ya pasó: «Venció el …». */
  vencido: boolean;
  /** Ya reportado: lo que se envía es una corrección. */
  reportado: boolean;
  /** Lo guardado, con punto decimal. */
  valor: string | null;
  porCategoria: Record<string, string> | null;
  /** Las categorías que pide el periodo; `null` sin dimensión. */
  categorias: { id: number; nombre: string }[] | null;
};

const conComa = (v: string | null | undefined) => (v === null || v === undefined ? "" : v.replace(".", ","));

/** Quita un soporte mientras el periodo no esté cerrado; el servidor vuelve a comprobarlo. */
function QuitarSoporte({ periodoId, soporte }: { periodoId: number; soporte: Soporte }) {
  const router = useRouter();
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function quitar() {
    setPendiente(true);
    setError(null);
    try {
      const r = await fetch(`${rutaDeSubidaDeDato(periodoId)}?archivo=${soporte.id}`, { method: "DELETE" });
      if (r.ok) {
        router.refresh();
        return;
      }
      const cuerpo = (await r.json().catch(() => null)) as { error?: string } | null;
      setError(cuerpo?.error ?? "No se pudo quitar el soporte");
    } catch {
      setError("Error de red");
    } finally {
      setPendiente(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Boton variante="peligro" tamano="sm" pendiente={pendiente} onClick={quitar} aria-label={`Quitar el soporte ${soporte.nombre}`}>
        {pendiente ? "Quitando…" : "Quitar"}
      </Boton>
      {error ? (
        <span role="alert" className="text-xs text-estado-critico-texto">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Los soportes de un periodo del dato (anexo 14C, §4.6): cada uno, un enlace de descarga con su formato y su tamaño; con
 * `editable` (quien puede reportar el dato, antes del cierre), quitar uno y subir otro.
 */
export function SoportesDelPeriodo({
  datoId,
  periodoId,
  etiqueta,
  soportes,
  editable,
}: {
  datoId: number;
  periodoId: number;
  etiqueta: string;
  soportes: Soporte[];
  editable: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-sm font-medium">Soporte (opcional)</p>
      {soportes.length > 0 ? (
        <ul className="flex list-none flex-col gap-2">
          {soportes.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <a href={rutaDeSoporteDeDato(datoId, s.id)} className={`min-w-0 break-words rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`}>
                  {s.nombre}
                </a>
                <IconoFormato mime={s.mime} tamanoBytes={s.tamano} />
              </span>
              {editable ? <QuitarSoporte periodoId={periodoId} soporte={s} /> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Sin soportes adjuntos.</p>
      )}
      {editable ? (
        <>
          <p className="text-xs text-muted-foreground">
            Un PDF, una imagen o un Excel (.xlsx). Se puede quitar mientras el periodo no esté cerrado. Lo ven quienes ven el dato y quienes ven
            los soportes de los indicadores que lo usan.
          </p>
          <ZonaCarga direccion={rutaDeSubidaDeDato(periodoId)} soporte nombre={`Zona de carga de los soportes de ${etiqueta}`} />
        </>
      ) : null}
    </div>
  );
}

function Mensaje({ estado }: { estado: EstadoReporte }) {
  if (!estado || (!estado.ok && estado.confirmar)) return null;
  return estado.ok ? (
    <p role="status" className="text-sm text-estado-bien-texto">
      {estado.aviso}
    </p>
  ) : (
    <p role="alert" className="text-sm text-estado-critico-texto">
      {estado.error}
    </p>
  );
}

/**
 * Reportar un periodo de un dato compartido, o corregirlo antes del cierre (anexo 14C, §4.4, maqueta 12): un valor o, si el
 * dato tiene dimensión, uno por cada categoría del periodo (el dato es su suma); la confirmación cuando el valor se aleja
 * mucho del periodo anterior; y sus soportes. No tiene «no aplica». Con `alReportar`, avisa cuando sale bien (el diálogo de
 * un periodo se cierra); dentro de un diálogo, el título ya lo lleva el diálogo y aquí no se repite para el lector de
 * pantalla. Un periodo de un dato con dimensión que nació sin categorías no pinta campos: dice que el Administrador del SGC
 * debe actualizarlas (`PERIODO_SIN_CATEGORIAS`, el mismo texto con que el servidor lo rechaza). El servidor valida todo otra vez.
 */
export function ReportarDato({
  datoId,
  periodo,
  soportes,
  alReportar,
}: {
  datoId: number;
  periodo: PeriodoParaReportar;
  soportes: Soporte[];
  alReportar?: () => void;
}) {
  const [estado, enviar, pendiente] = useActionState(async (previo: EstadoReporte, datos: FormData): Promise<EstadoReporte> => {
    const resultado = await reportarDatoCompartido(previo, datos);
    if (resultado?.ok) alReportar?.();
    return resultado;
  }, null);
  const prefijo = `dato${useId().replace(/[^\w-]/g, "")}`;
  // «Sí, el valor es correcto» vale para el valor que se preguntó: cambiar cualquier valor la desmarca.
  const [confirmado, setConfirmado] = useState(false);
  // La pregunta es del periodo en que se hizo: el formulario de otro periodo empieza sin ella.
  const pregunta = estado && !estado.ok && estado.valores?.id === String(periodo.id) ? (estado.confirmar ?? null) : null;
  const titulo = `${periodo.reportado ? "Corregir" : "Reportar"} · ${periodo.etiqueta}`;
  const encabezado = alReportar ? (
    <p aria-hidden="true" className="text-sm font-semibold">
      {titulo}
    </p>
  ) : (
    <h2 id={`${prefijo}-titulo`} className="text-sm font-semibold">
      {titulo}
    </h2>
  );

  // Un periodo que nació sin categorías no tiene qué digitar: en vez de un formulario sin campos, lo que hay que hacer.
  if (periodo.categorias !== null && periodo.categorias.length === 0) {
    return (
      <section aria-labelledby={alReportar ? undefined : `${prefijo}-titulo`} className={CAJA}>
        {encabezado}
        <p className={AVISO}>{PERIODO_SIN_CATEGORIAS}</p>
        <SoportesDelPeriodo datoId={datoId} periodoId={periodo.id} etiqueta={periodo.etiqueta} soportes={soportes} editable />
      </section>
    );
  }

  return (
    <section aria-labelledby={alReportar ? undefined : `${prefijo}-titulo`} className={CAJA}>
      {encabezado}
      <form
        key={periodo.id}
        action={enviar}
        onSubmit={enviarSinReiniciar(enviar)}
        onChange={(e) => {
          if (!(e.target instanceof HTMLInputElement) || e.target.name !== "confirmado") setConfirmado(false);
        }}
        className="flex min-w-0 flex-col gap-3"
      >
        <input type="hidden" name="id" value={periodo.id} />
        {periodo.categorias === null ? (
          <Campo etiqueta="Valor" nombre="valor" id={`${prefijo}-valor`}>
            <input required inputMode="decimal" autoComplete="off" defaultValue={conComa(periodo.valor)} className={CONTROL} />
          </Campo>
        ) : (
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="text-sm font-medium">Valor de cada categoría</legend>
            <p className="text-xs text-muted-foreground">El dato del periodo es la suma de todas.</p>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              {periodo.categorias.map((c) => (
                <Campo key={c.id} etiqueta={c.nombre} nombre={`categoria_${c.id}`} id={`${prefijo}-categoria-${c.id}`}>
                  <input
                    required
                    inputMode="decimal"
                    autoComplete="off"
                    defaultValue={conComa(periodo.porCategoria?.[String(c.id)])}
                    className={CONTROL}
                  />
                </Campo>
              ))}
            </div>
          </fieldset>
        )}

        {pregunta ? (
          <div className={AVISO}>
            <p>{pregunta}</p>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                name="confirmado"
                checked={confirmado}
                onChange={(e) => setConfirmado(e.target.checked)}
                className={`mt-0.5 size-4 ${FOCO}`}
              />
              <span>Sí, el valor es correcto</span>
            </label>
          </div>
        ) : null}

        <SoportesDelPeriodo datoId={datoId} periodoId={periodo.id} etiqueta={periodo.etiqueta} soportes={soportes} editable />

        <Mensaje estado={estado} />
        <div>
          <Boton type="submit" pendiente={pendiente}>
            {pendiente ? "Guardando…" : periodo.reportado ? "Guardar la corrección" : "Reportar el dato"}
          </Boton>
        </div>
        <p className="text-xs text-muted-foreground">
          {periodo.reportado
            ? "Se corrige sin justificación hasta el cierre; el historial guarda lo que había. Los indicadores que lo usan se recalculan."
            : `${periodo.vencido ? "Venció" : "Vence"} el ${periodo.vence}. Al reportarlo se calculan los indicadores que lo esperaban.`}
        </p>
      </form>
    </section>
  );
}

/** «Reportar» o «Corregir» en la fila de un periodo: el mismo formulario en un diálogo, que se cierra cuando sale bien. */
export function AccionDelPeriodo({ datoId, periodo, soportes }: { datoId: number; periodo: PeriodoParaReportar; soportes: Soporte[] }) {
  const [abierto, setAbierto] = useState(false);
  const verbo = periodo.reportado ? "Corregir" : "Reportar";
  return (
    <>
      <Boton variante="secundario" tamano="sm" onClick={() => setAbierto(true)} aria-label={`${verbo} ${periodo.etiqueta}`}>
        {verbo}
      </Boton>
      <Dialogo abierto={abierto} alCerrar={() => setAbierto(false)} titulo={`${verbo} · ${periodo.etiqueta}`} className={CLASE_DIALOGO}>
        {abierto ? (
          <div className="flex flex-col gap-3 p-5">
            <ReportarDato datoId={datoId} periodo={periodo} soportes={soportes} alReportar={() => setAbierto(false)} />
            <div className="flex justify-end">
              <Boton variante="secundario" onClick={() => setAbierto(false)}>
                Volver
              </Boton>
            </div>
          </div>
        ) : null}
      </Dialogo>
    </>
  );
}
