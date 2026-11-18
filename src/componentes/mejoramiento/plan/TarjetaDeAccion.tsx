"use client";

import { startTransition, useActionState, useState } from "react";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import { AVISO_SIN_PACIENTES, ETIQUETA_TIPO_ACCION, textoDeUsuario } from "@/lib/mejoramiento/textos";
import { TIPOS_ACCION, type TipoAccion } from "@/lib/mejoramiento/tipos";
import { ErrorDeAnalisis, useGuardado, type AccionDeAnalisis } from "../analisis/Partes";

/** Una actividad tal como la edita el formulario: sin `id`, todavía no se ha guardado. */
export type ActividadDelFormulario = {
  id: number | null;
  descripcion: string;
  responsableId: number | null;
  inicio: string;
  fin: string;
};

/** Una acción tal como la edita el formulario; `id` nulo es una acción nueva. */
export type AccionDelFormulario = {
  id: number | null;
  orden: number;
  tipo: TipoAccion;
  descripcion: string;
  causaIds: number[];
  recursos: string;
  indicadorCumplimiento: string;
  meta: string;
  actividades: ActividadDelFormulario[];
};

/** Un responsable posible, con el texto que lo distingue de un homónimo (`etiquetasDeUsuarios`), si la lectura lo dio. */
export type UsuarioAsignable = { id: number; nombre: string; cargo: string | null; etiqueta?: string };

const vacia = (): ActividadDelFormulario => ({ id: null, descripcion: "", responsableId: null, inicio: "", fin: "" });

/**
 * Una acción del plan con sus actividades en filas (spec 15 §10.1 y §10.2, maqueta 5): el tipo, las causas que ataca, la
 * descripción, los recursos, el indicador de cumplimiento y la meta; debajo, una fila por actividad con su responsable, su
 * inicio y su fin, y «Añadir otra actividad». Guardar envía la acción entera; las actividades viajan como JSON y conservan su
 * `id`. Quitar una acción guardada pide confirmación; una nueva sin guardar solo se descarta.
 */
export function TarjetaDeAccion({
  hallazgoId,
  accion,
  causas,
  usuarios,
  inactivos = [],
  guardar,
  quitar,
  alGuardar,
  alDescartar,
}: {
  hallazgoId: number;
  accion: AccionDelFormulario;
  causas: ReadonlyArray<{ id: number; orden: number; texto: string }>;
  usuarios: readonly UsuarioAsignable[];
  /** Los responsables guardados que ya no están activos: se nombran para que no desaparezcan sin aviso. */
  inactivos?: ReadonlyArray<{ id: number; nombre: string }>;
  guardar: AccionDeAnalisis;
  quitar: AccionDeAnalisis;
  /** Tras guardar sin error (una acción nueva se retira de la lista de nuevas: la guardada llega de la página). */
  alGuardar?: () => void;
  /** Descartar una acción nueva que no se ha guardado. */
  alDescartar?: () => void;
}) {
  const etiqueta = `A${accion.orden}`;
  const clave = accion.id === null ? `nueva-${accion.orden}` : `accion-${accion.id}`;
  const [filas, setFilas] = useState<ActividadDelFormulario[]>(() => (accion.actividades.length > 0 ? accion.actividades : [vacia()]));
  const [estado, enviar, pendiente] = useActionState(guardar, null);
  const guardado = useGuardado(estado, pendiente, alGuardar);
  const [estadoQuitar, enviarQuitar, quitando] = useActionState(quitar, null);
  const [confirmando, setConfirmando] = useState(false);

  const cambiar = (i: number, cambio: Partial<ActividadDelFormulario>) => setFilas((l) => l.map((f, j) => (j === i ? { ...f, ...cambio } : f)));
  const actividades = JSON.stringify(
    filas.map((f) => ({
      ...(f.id ? { id: f.id } : {}),
      descripcion: f.descripcion,
      responsableId: f.responsableId,
      inicio: f.inicio,
      fin: f.fin,
    })),
  );
  const quitarGuardada = () => {
    const datos = new FormData();
    datos.set("hallazgoId", String(hallazgoId));
    datos.set("accionId", String(accion.id));
    startTransition(() => enviarQuitar(datos));
  };
  const opcionesDeResponsable = (actual: number | null) => {
    const ausente = actual !== null && !usuarios.some((u) => u.id === actual) ? inactivos.find((u) => u.id === actual) : undefined;
    return (
      <>
        <option value="">Elija el responsable</option>
        {ausente ? <option value={ausente.id}>{`${ausente.nombre} (ya no está activo)`}</option> : null}
        {usuarios.map((u) => (
          <option key={u.id} value={u.id}>
            {textoDeUsuario(u)}
          </option>
        ))}
      </>
    );
  };

  return (
    <form
      action={enviar}
      onSubmit={enviarSinReiniciar(enviar)}
      aria-labelledby={`${clave}-titulo`}
      className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-card p-4"
    >
      <h3 id={`${clave}-titulo`} className="font-display text-base font-semibold">
        {accion.id === null ? `Acción ${etiqueta} (sin guardar)` : `Acción ${etiqueta}`}
      </h3>
      <input type="hidden" name="hallazgoId" value={hallazgoId} />
      {accion.id !== null ? <input type="hidden" name="accionId" value={accion.id} /> : null}
      <input type="hidden" name="actividades" value={actividades} />

      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${clave}-tipo`} className="text-sm font-medium">
            Tipo<span className="sr-only">{` de la acción ${etiqueta}`}</span>
          </label>
          <select id={`${clave}-tipo`} name="tipo" defaultValue={accion.tipo} className={claseControl}>
            {TIPOS_ACCION.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TIPO_ACCION[t]}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="flex min-w-0 flex-col gap-1">
          <legend className="text-sm font-medium">
            Causa que ataca<span className="sr-only">{` la acción ${etiqueta}`}</span>
          </legend>
          {causas.length === 0 ? (
            <p className="text-sm text-muted-foreground">La ronda no tiene causas raíz: se escriben en la pestaña «Causa raíz».</p>
          ) : (
            causas.map((c) => (
              <label key={c.id} className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="causaIds" value={c.id} defaultChecked={accion.causaIds.includes(c.id)} className="mt-0.5 size-4 shrink-0" />
                <span className="min-w-0 break-words">{`${c.orden}. ${c.texto}`}</span>
              </label>
            ))
          )}
          <p className="text-xs text-muted-foreground">Obligatoria en la acción correctiva.</p>
        </fieldset>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${clave}-descripcion`} className="text-sm font-medium">
          {`Qué se va a hacer (acción ${etiqueta})`}
        </label>
        <textarea
          id={`${clave}-descripcion`}
          name="descripcion"
          rows={2}
          maxLength={2000}
          defaultValue={accion.descripcion}
          aria-describedby={`${clave}-aviso`}
          className={claseControl}
        />
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={`${clave}-recursos`} className="text-sm font-medium">
            Recursos necesarios<span className="sr-only">{` de la acción ${etiqueta}`}</span>
          </label>
          <input id={`${clave}-recursos`} type="text" name="recursos" maxLength={1000} defaultValue={accion.recursos} className={claseControl} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={`${clave}-indicador`} className="text-sm font-medium">
            Indicador de cumplimiento<span className="sr-only">{` de la acción ${etiqueta}`}</span>
          </label>
          <input
            id={`${clave}-indicador`}
            type="text"
            name="indicadorCumplimiento"
            maxLength={500}
            defaultValue={accion.indicadorCumplimiento}
            className={claseControl}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={`${clave}-meta`} className="text-sm font-medium">
            Meta<span className="sr-only">{` de la acción ${etiqueta}`}</span>
          </label>
          <input id={`${clave}-meta`} type="text" name="meta" maxLength={500} defaultValue={accion.meta} className={claseControl} />
        </div>
      </div>

      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="text-sm font-semibold">{`Actividades de la acción ${etiqueta}`}</legend>
        <ol className="flex list-none flex-col gap-3">
          {filas.map((f, i) => {
            const numero = `${etiqueta}.${i + 1}`;
            const id = `${clave}-act-${i}`;
            return (
              <li
                key={f.id ?? `n${i}`}
                className="grid min-w-0 gap-2 rounded-md border border-linea-suave p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,13rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,13rem)_9.5rem_9.5rem_auto] lg:items-end"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <label htmlFor={`${id}-descripcion`} className="text-xs font-medium">
                    {`Actividad ${numero}`}
                  </label>
                  <input
                    id={`${id}-descripcion`}
                    type="text"
                    maxLength={1000}
                    value={f.descripcion}
                    onChange={(e) => cambiar(i, { descripcion: e.target.value })}
                    aria-describedby={`${clave}-aviso`}
                    className={claseControl}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <label htmlFor={`${id}-responsable`} className="text-xs font-medium">
                    Responsable<span className="sr-only">{` de la actividad ${numero}`}</span>
                  </label>
                  <select
                    id={`${id}-responsable`}
                    value={f.responsableId ?? ""}
                    onChange={(e) => cambiar(i, { responsableId: e.target.value === "" ? null : Number(e.target.value) })}
                    className={`${claseControl} min-w-0`}
                  >
                    {opcionesDeResponsable(f.responsableId)}
                  </select>
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <label htmlFor={`${id}-inicio`} className="text-xs font-medium">
                    Inicio<span className="sr-only">{` de la actividad ${numero}`}</span>
                  </label>
                  <input
                    id={`${id}-inicio`}
                    type="date"
                    value={f.inicio}
                    onChange={(e) => cambiar(i, { inicio: e.target.value })}
                    className={claseControl}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <label htmlFor={`${id}-fin`} className="text-xs font-medium">
                    Fin<span className="sr-only">{` de la actividad ${numero}`}</span>
                  </label>
                  <input id={`${id}-fin`} type="date" value={f.fin} onChange={(e) => cambiar(i, { fin: e.target.value })} className={claseControl} />
                </div>
                {filas.length > 1 ? (
                  <Boton
                    variante="fantasma"
                    tamano="sm"
                    className="justify-self-start"
                    onClick={() => {
                      setFilas((l) => l.filter((_, j) => j !== i));
                      // La fila desaparece con su botón: el foco va a «Añadir otra actividad», que sigue ahí.
                      document.getElementById(`${clave}-anadir-actividad`)?.focus();
                    }}
                  >
                    Quitar<span className="sr-only">{` la actividad ${numero}`}</span>
                  </Boton>
                ) : null}
              </li>
            );
          })}
        </ol>
        {filas.length < 30 ? (
          <Boton
            id={`${clave}-anadir-actividad`}
            variante="secundario"
            tamano="sm"
            className="self-start"
            onClick={() => setFilas((l) => [...l, vacia()])}
          >
            Añadir otra actividad<span className="sr-only">{` a la acción ${etiqueta}`}</span>
          </Boton>
        ) : null}
      </fieldset>

      <p id={`${clave}-aviso`} className="text-xs text-muted-foreground">
        {AVISO_SIN_PACIENTES}
      </p>
      <ErrorDeAnalisis estado={estado} />
      <ErrorDeAnalisis estado={estadoQuitar} />
      <div className="flex flex-wrap items-center gap-3">
        <Boton id={`${clave}-guardar`} type="submit" pendiente={pendiente}>
          {pendiente ? "Guardando…" : `Guardar la acción ${etiqueta}`}
        </Boton>
        {accion.id !== null ? (
          <Boton variante="peligro" pendiente={quitando} onClick={() => setConfirmando(true)} aria-haspopup="dialog">
            {quitando ? "Quitando…" : "Quitar esta acción"}
          </Boton>
        ) : alDescartar ? (
          <Boton variante="fantasma" onClick={alDescartar}>
            Descartar esta acción
          </Boton>
        ) : null}
        <span role="status" className="text-sm text-muted-foreground">
          {guardado && accion.id !== null ? "Guardado." : ""}
        </span>
      </div>
      {accion.id !== null ? (
        <Dialogo
          abierto={confirmando}
          alCerrar={() => setConfirmando(false)}
          titulo={`Quitar la acción ${etiqueta}`}
          className="m-auto w-full max-w-md rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
        >
          <div className="flex flex-col gap-4 p-5">
            <p aria-hidden="true" className="font-semibold">
              {`Quitar la acción ${etiqueta}`}
            </p>
            <p className="text-sm">
              {`Se quitará la acción ${etiqueta} del plan, con ${accion.actividades.length === 1 ? "su actividad" : `sus ${accion.actividades.length} actividades`}. Las acciones siguientes se numeran otra vez.`}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Boton variante="secundario" onClick={() => setConfirmando(false)}>
                Cancelar
              </Boton>
              <Boton
                variante="peligro"
                onClick={() => {
                  setConfirmando(false);
                  quitarGuardada();
                }}
              >
                Quitar la acción
              </Boton>
            </div>
          </div>
        </Dialogo>
      ) : null}
    </form>
  );
}
