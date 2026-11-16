"use client";

import { startTransition, useActionState, useState, type FormEvent, type MouseEvent } from "react";
import { marcarNoAplicaAccion, quitarNoAplicaAccion, reportarAccion } from "@/app/acciones-indicadores";
import type { EstadoAccion } from "@/app/admin/comun";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import type { DatosDeReporte } from "@/db/consultas/indicadores/lectura";
import { calcularEnVivo, type EstadoReporte } from "@/lib/indicadores/reporte";
import { MOTIVO_TODAS_NO_APLICAN, MOTIVOS_DEL_SISTEMA } from "@/lib/indicadores/tipos";
import { cuenta } from "@/lib/plural";
import { AvisosDeFalta, VariableFija } from "./DatosDelSistema";
import { ActualizarCategorias, RejillaDeCategorias } from "./RejillaDeCategorias";
import { ResultadoEnVivo } from "./ResultadoEnVivo";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const CAJA = "flex min-w-0 flex-col gap-3 rounded-lg border border-border px-4 py-3";
const AVISO = "flex flex-col gap-2 rounded-md border border-l-4 border-border border-l-estado-atencion bg-card px-3 py-2 text-sm";

/**
 * Envía desde una transición, para que React no reinicie lo digitado, con lo mismo que mandaría el navegador: los campos
 * con `name` y el botón pulsado, que `new FormData(form)` no incluye y se añade aquí. Un navegador sin
 * `SubmitEvent.submitter` usa el último botón pulsado, que cada botón anota en el formulario (`anotarBoton`).
 */
function enviarConBoton(enviar: (datos: FormData) => void) {
  return (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const datos = new FormData(formulario);
    const boton = (evento.nativeEvent as SubmitEvent).submitter;
    const nombre = boton instanceof HTMLButtonElement && boton.name ? boton.name : formulario.dataset.botonNombre;
    const valor = boton instanceof HTMLButtonElement && boton.name ? boton.value : formulario.dataset.botonValor;
    if (nombre && valor !== undefined) datos.set(nombre, valor);
    startTransition(() => enviar(datos));
  };
}

function anotarBoton(evento: MouseEvent<HTMLButtonElement>) {
  const { form, name, value } = evento.currentTarget;
  if (form && name) {
    form.dataset.botonNombre = name;
    form.dataset.botonValor = value;
  }
}

function Mensaje({ estado }: { estado: EstadoReporte | EstadoAccion }) {
  if (!estado) return null;
  if (estado.ok) {
    return (
      <p role="status" className="text-sm text-estado-bien-texto">
        {estado.aviso}
      </p>
    );
  }
  return (
    <p role="alert" className="text-sm text-estado-critico-texto">
      {estado.error}
    </p>
  );
}

/** «No aplica en este periodo» (spec §8.2): pide el motivo, cuenta como reportado y no pide análisis ni soporte. */
function NoAplica({ medicionId, volver, abierto }: { medicionId: number; volver: string; abierto: boolean }) {
  const [estado, enviar, pendiente] = useActionState(marcarNoAplicaAccion, null);
  const motivo = estado?.valores?.motivo;
  return (
    <details open={abierto || undefined} className="rounded-md border border-border px-3 py-2">
      <summary className={`cursor-pointer rounded-sm text-sm font-medium ${FOCO}`}>No aplica en este periodo</summary>
      <form action={enviar} onSubmit={enviarConBoton(enviar)} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="id" value={medicionId} />
        <input type="hidden" name="volver" value={volver} />
        <p className="text-sm text-muted-foreground">
          Si en el periodo no hubo casos que medir, márquelo así: cuenta como reportado, queda en gris y no pide análisis ni soporte.
        </p>
        <Campo etiqueta="Motivo" nombre="motivo" id="reporte-motivo" ayuda="Entre 5 y 500 caracteres. Por ejemplo: no hubo auditorías programadas.">
          <textarea
            required
            minLength={5}
            maxLength={500}
            rows={2}
            defaultValue={typeof motivo === "string" ? motivo : ""}
            className={`${claseControl} w-full`}
          />
        </Campo>
        <Mensaje estado={estado} />
        <div>
          <Boton type="submit" variante="secundario" pendiente={pendiente}>
            {pendiente ? "Marcando…" : "Marcar «No aplica»"}
          </Boton>
        </div>
      </form>
    </details>
  );
}

/**
 * La medición «No aplica»: su motivo y, si lo puso una persona, «Quitar «No aplica»». Uno del sistema (`MOTIVOS_DEL_SISTEMA`)
 * no se ofrece quitar: lo quita la propagación cuando cambia su fuente, y el servidor lo rechaza.
 */
function QuitarNoAplica({ medicionId, motivo }: { medicionId: number; motivo: string | null }) {
  const [estado, enviar, pendiente] = useActionState(quitarNoAplicaAccion, null);
  const delSistema = motivo !== null && MOTIVOS_DEL_SISTEMA.includes(motivo);
  return (
    <div className={CAJA}>
      <p className="break-words text-sm">{motivo ? `No aplica en este periodo: ${motivo}` : "No aplica en este periodo."}</p>
      {delSistema ? (
        <p className="text-sm text-muted-foreground">Lo marcó el sistema: se quita solo cuando cambie el dato.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Cuenta como reportado. Si sí hubo casos, quítelo y reporte los datos.</p>
          <form action={enviar} className="flex flex-col items-start gap-2">
            <input type="hidden" name="id" value={medicionId} />
            <Mensaje estado={estado} />
            <Boton type="submit" variante="secundario" pendiente={pendiente}>
              {pendiente ? "Quitando…" : "Quitar «No aplica»"}
            </Boton>
          </form>
        </>
      )}
    </div>
  );
}

/**
 * Reportar una medición (spec §8.2 y §12.5, maqueta 3): un campo por variable propia con su nombre, su descripción y su
 * fuente; cada variable ajena, fija, con su valor o el aviso de que aún no llega (anexo 14C, §3.1, maqueta 14); el
 * resultado, el color y la frase mientras se digita, con lo ajeno que ya llegó; la confirmación de un salto grande;
 * «Guardar sin reportar», «Reportar» («Reportar lo mío» mientras falte un valor ajeno; ya reportada, «Guardar la
 * corrección») y «No aplica en este periodo». Sirve a 390 px y con teclado. Un desagregado manda, en este mismo formulario y
 * a la misma acción, su rejilla por categoría (`RejillaDeCategorias`; ya reportada, solo «Reportar») y, a quien administra,
 * «Actualizar categorías» mientras la medición siga abierta sin reportar.
 */
export function FormularioReporte({ datos, volver, administra = false }: { datos: DatosDeReporte; volver: string; administra?: boolean }) {
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(datos.variables.map((v) => [v.letra, v.valor === null ? "" : v.valor.replace(".", ",")])),
  );
  const [confirmado, setConfirmado] = useState(false);
  const [estado, enviar, pendiente] = useActionState(reportarAccion, null);

  // Un desagregado se reporta por su rejilla (anexo 14C, §5.4), también cuando quedó entero «No aplica» porque ninguna
  // categoría aplicó: se corrige reportando alguna fila. El «No aplica» de toda la medición que puso una persona, como siempre.
  const categorias = datos.categorias;
  if (categorias && (!datos.noAplica || datos.motivo === MOTIVO_TODAS_NO_APLICAN)) {
    const abiertaSinReportar = datos.estado === "abierta" && !datos.reportada && !datos.noAplica;
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <form action={enviar} onSubmit={enviarConBoton(enviar)} className={CAJA}>
          <input type="hidden" name="id" value={datos.medicionId} />
          <input type="hidden" name="volver" value={volver} />
          <input type="hidden" name="periodo" value={datos.periodo} />
          <RejillaDeCategorias
            datos={{ ...datos, categorias }}
            estado={estado}
            pendiente={pendiente}
            alPulsar={anotarBoton}
            mensaje={estado && !(estado.ok === false && estado.confirmar) ? <Mensaje estado={estado} /> : null}
          />
        </form>
        {datos.noAplica ? null : <NoAplica medicionId={datos.medicionId} volver={volver} abierto={false} />}
        {administra && abiertaSinReportar ? <ActualizarCategorias medicionId={datos.medicionId} /> : null}
      </div>
    );
  }

  if (datos.noAplica) return <QuitarNoAplica medicionId={datos.medicionId} motivo={datos.motivo} />;

  // Lo ajeno entra al cálculo en vivo tal como llegó, sin campo: no lo limitan las reglas de captura de quien mide.
  const variables = datos.variables.map((v) => (v.ajena ? { ...v, capturaMin: null, capturaMax: null, admiteNegativos: true } : v));
  const faltaAjeno = datos.variables.some((v) => v.ajena !== null && v.ajena.valor === null);
  const vivo = calcularEnVivo({ ...datos, variables }, valores);
  const pregunta = vivo.variacion ?? (estado && !estado.ok ? (estado.confirmar ?? null) : null);
  const alCambiar = (letra: string, valor: string) => {
    setValores((actuales) => ({ ...actuales, [letra]: valor }));
    setConfirmado(false);
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <form action={enviar} onSubmit={enviarConBoton(enviar)} className={CAJA}>
        <input type="hidden" name="id" value={datos.medicionId} />
        <input type="hidden" name="volver" value={volver} />
        <input type="hidden" name="periodo" value={datos.periodo} />
        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
          <fieldset className="flex min-w-0 flex-col gap-3">
            <legend className="sr-only">Datos del periodo</legend>
            {datos.variables.map((v) => {
              const id = `reporte-${v.letra}`;
              if (v.ajena) return <VariableFija key={v.letra} variable={v} id={id} />;
              const error = vivo.errores[v.letra];
              const descritoPor = [v.descripcion || v.fuente ? `${id}-ayuda` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
              return (
                <div key={v.letra} className="flex min-w-0 flex-col gap-1">
                  <label htmlFor={id} className="text-sm font-medium">
                    {v.nombre}
                  </label>
                  <input
                    id={id}
                    name={`valor_${v.letra}`}
                    inputMode="decimal"
                    autoComplete="off"
                    value={valores[v.letra] ?? ""}
                    onChange={(e) => alCambiar(v.letra, e.target.value)}
                    aria-describedby={descritoPor}
                    aria-invalid={error ? "true" : undefined}
                    className={`${claseControl} w-full min-w-0`}
                  />
                  {v.descripcion || v.fuente ? (
                    <p id={`${id}-ayuda`} className="text-xs text-muted-foreground">
                      {[v.descripcion, v.fuente ? `Fuente: ${v.fuente}` : null].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                  {error ? (
                    <p id={`${id}-error`} className="text-xs text-estado-critico-texto">
                      {error}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </fieldset>
          <ResultadoEnVivo
            calculo={datos.calculo}
            regla={datos.regla}
            unidad={datos.unidad}
            variables={variables}
            valores={valores}
            rangos={datos.rangos}
            anterior={datos.anterior}
            variacionPct={datos.variacionPct}
          />
        </div>

        <AvisosDeFalta variables={datos.variables} mide />

        {pregunta ? (
          <div className={AVISO}>
            {vivo.variacion ? null : <p>{pregunta}</p>}
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                name="confirmado"
                checked={confirmado}
                onChange={(e) => setConfirmado(e.target.checked)}
                className={`mt-0.5 size-4 ${FOCO}`}
              />
              <span>Sí, los datos son correctos</span>
            </label>
          </div>
        ) : null}

        {datos.soporteObligatorio && !datos.historica ? (
          <p className="text-sm">
            {datos.soportes > 0
              ? `Soporte obligatorio en este indicador: ${cuenta(datos.soportes, "archivo adjunto", "archivos adjuntos")}.`
              : "Este indicador exige un soporte: adjúntelo antes de reportar."}
          </p>
        ) : null}

        {estado && !(estado.ok === false && estado.confirmar) ? <Mensaje estado={estado} /> : null}

        <div className="flex flex-wrap gap-2">
          {datos.reportada ? (
            <Boton type="submit" name="intencion" value="reportar" onClick={anotarBoton} pendiente={pendiente}>
              {pendiente ? "Guardando…" : "Guardar la corrección"}
            </Boton>
          ) : (
            <>
              <Boton type="submit" name="intencion" value="parcial" onClick={anotarBoton} variante="secundario" pendiente={pendiente}>
                Guardar sin reportar
              </Boton>
              <Boton type="submit" name="intencion" value="reportar" onClick={anotarBoton} pendiente={pendiente}>
                {faltaAjeno ? "Reportar lo mío" : "Reportar"}
              </Boton>
            </>
          )}
        </div>
      </form>
      <NoAplica medicionId={datos.medicionId} volver={volver} abierto={vivo.sinResultado === "division_por_cero"} />
    </div>
  );
}
