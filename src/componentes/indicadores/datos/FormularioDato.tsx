"use client";

import { useActionState, useId, useState, type KeyboardEvent } from "react";
import { borrarDatoCompartido, cambiarEstadoDelDato, designarResponsablesDelDato, guardarDatoCompartido } from "@/app/admin/acciones-indicadores";
import type { EstadoAccion } from "@/app/admin/comun";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { CLASE_DIALOGO } from "@/componentes/indicadores/admin/DialogoRetirar";
import { useAccionDeDialogo } from "@/componentes/indicadores/admin/useAccionDeDialogo";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import type { DatoCompartido, OpcionesDeDato } from "@/db/consultas/indicadores/datos";
import { CONSOLIDACION } from "@/lib/indicadores/ficha-en-texto";
import { CONSOLIDACIONES, ETIQUETA_PERIODICIDAD, PERIODICIDADES } from "@/lib/indicadores/tipos";

const CONTROL = `${claseControl} w-full min-w-0 max-w-full`;
// `CLASE_DIALOGO`, más ancho: el formulario del dato va en dos columnas.
const DIALOGO = CLASE_DIALOGO.replace("max-w-md", "max-w-2xl");
const MAXIMO_RESPONSABLES = 20;

/** En un campo de búsqueda dentro de un formulario, Enter no envía la selección a medio hacer. */
const sinEnviarConEnter = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter") e.preventDefault();
};

const CONGELADO =
  "Una ficha aprobada ya cita este dato: su periodicidad, cómo se junta y su desagregación no cambian. Si hace falta otra cosa, cree otro dato.";

/** Lo que el formulario muestra de un campo: lo que la persona envió si el servidor lo rechazó, o lo guardado. */
function valorDe(estado: EstadoAccion, campo: string, guardado: string | number | null | undefined): string {
  const enviado = estado?.valores?.[campo];
  if (typeof enviado === "string") return enviado;
  return guardado === null || guardado === undefined ? "" : String(guardado);
}

const conComa = (v: string | null) => (v === null ? null : v.replace(".", ","));

/** Un campo que no cambia: su valor como texto y, para que el formulario estricto lo reciba, oculto. */
function Fijo({ etiqueta, nombre, valor, texto }: { etiqueta: string; nombre: string; valor: string; texto: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-sm font-medium">{etiqueta}</p>
      <p className="rounded-md border border-dashed border-border bg-muted px-3 py-2 text-sm">{texto}</p>
      {valor ? <input type="hidden" name={nombre} value={valor} /> : null}
    </div>
  );
}

/**
 * Los campos de un dato del catálogo (anexo 14C, §4.1). Con `dato`, lo guardado; si una ficha aprobada lo cita, la
 * periodicidad, cómo se junta y la desagregación van de solo lectura con su explicación (F14C-DC34). Un dato nuevo trae puesto
 * el plazo de reporte de la entidad.
 */
export function CamposDelDato({ dato, opciones, estado, prefijo }: { dato: DatoCompartido | null; opciones: OpcionesDeDato; estado: EstadoAccion; prefijo: string }) {
  const v = (campo: string, guardado: string | number | null | undefined) => valorDe(estado, campo, guardado);
  const congelado = dato?.citado === true;
  const negativos = estado?.valores ? estado.valores.admiteNegativos === "on" : dato?.admiteNegativos === true;
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
      <Campo etiqueta="Proceso dueño" nombre="procesoId" id={`${prefijo}-procesoId`}>
        <select required defaultValue={v("procesoId", dato?.procesoId)} className={CONTROL}>
          <option value="">Elija el proceso</option>
          {opciones.procesos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <Campo etiqueta="Nombre" nombre="nombre" id={`${prefijo}-nombre`} ayuda="Único en su proceso.">
        <input required maxLength={150} defaultValue={v("nombre", dato?.nombre)} className={CONTROL} />
      </Campo>
      <div className="sm:col-span-2">
        <Campo etiqueta="Qué incluye y qué excluye" nombre="descripcion" id={`${prefijo}-descripcion`}>
          <textarea rows={2} maxLength={500} defaultValue={v("descripcion", dato?.descripcion)} className={CONTROL} />
        </Campo>
      </div>
      <Campo etiqueta="Fuente" nombre="fuente" id={`${prefijo}-fuente`}>
        <input maxLength={300} defaultValue={v("fuente", dato?.fuente)} className={CONTROL} />
      </Campo>
      <Campo etiqueta="Unidad" nombre="unidad" id={`${prefijo}-unidad`}>
        <input maxLength={40} defaultValue={v("unidad", dato?.unidad)} className={CONTROL} />
      </Campo>
      {congelado && dato ? (
        <>
          <p className="text-sm text-muted-foreground sm:col-span-2">{CONGELADO}</p>
          <Fijo etiqueta="Periodicidad" nombre="periodicidad" valor={dato.periodicidad} texto={ETIQUETA_PERIODICIDAD[dato.periodicidad]} />
          <Fijo etiqueta="Cómo se junta" nombre="consolidacion" valor={dato.consolidacion} texto={CONSOLIDACION[dato.consolidacion]} />
          <Fijo
            etiqueta="Desagregación"
            nombre="dimensionId"
            valor={dato.dimensionId === null ? "" : String(dato.dimensionId)}
            texto={dato.dimension ?? "(ninguna)"}
          />
        </>
      ) : (
        <>
          <Campo etiqueta="Periodicidad" nombre="periodicidad" id={`${prefijo}-periodicidad`}>
            <select required defaultValue={v("periodicidad", dato?.periodicidad ?? "mensual")} className={CONTROL}>
              {PERIODICIDADES.map((p) => (
                <option key={p} value={p}>
                  {ETIQUETA_PERIODICIDAD[p]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo
            etiqueta="Cómo se junta"
            nombre="consolidacion"
            id={`${prefijo}-consolidacion`}
            ayuda="Cómo se vuelve el valor de un periodo más largo, el de un indicador trimestral o anual."
          >
            <select required defaultValue={v("consolidacion", dato?.consolidacion ?? "suma")} className={CONTROL}>
              {CONSOLIDACIONES.map((c) => (
                <option key={c} value={c}>
                  {CONSOLIDACION[c]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo
            etiqueta="Desagregación"
            nombre="dimensionId"
            id={`${prefijo}-dimensionId`}
            ayuda="Con una dimensión, se reporta un valor por cada categoría y el dato es su suma."
          >
            <select defaultValue={v("dimensionId", dato?.dimensionId)} className={CONTROL}>
              <option value="">(ninguna)</option>
              {opciones.dimensiones.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </Campo>
        </>
      )}
      <Campo etiqueta="Mínimo de captura" nombre="capturaMin" id={`${prefijo}-capturaMin`} ayuda="Opcional.">
        <input inputMode="decimal" autoComplete="off" defaultValue={v("capturaMin", conComa(dato?.capturaMin ?? null))} className={CONTROL} />
      </Campo>
      <Campo etiqueta="Máximo de captura" nombre="capturaMax" id={`${prefijo}-capturaMax`} ayuda="Opcional.">
        <input inputMode="decimal" autoComplete="off" defaultValue={v("capturaMax", conComa(dato?.capturaMax ?? null))} className={CONTROL} />
      </Campo>
      <Campo
        etiqueta="Plazo de reporte (días)"
        nombre="plazoReporteDias"
        id={`${prefijo}-plazoReporteDias`}
        ayuda="Días después de terminar el periodo, de 0 a 90."
      >
        <input
          type="number"
          required
          min={0}
          max={90}
          step={1}
          defaultValue={v("plazoReporteDias", dato?.plazoReporteDias ?? opciones.plazoReporteDias)}
          className={CONTROL}
        />
      </Campo>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name="admiteNegativos" defaultChecked={negativos} className="size-4 accent-marca-relleno" />
        Admite valores negativos
      </label>
    </div>
  );
}

/** El diálogo con los campos del dato; sin `dato`, lo crea. Cuando sale bien se cierra y la página se vuelve a pintar. */
function DialogoDato({
  abierto,
  alCerrar,
  dato,
  opciones,
}: {
  abierto: boolean;
  alCerrar: () => void;
  dato: DatoCompartido | null;
  opciones: OpcionesDeDato;
}) {
  const [estado, enviar, pendiente] = useAccionDeDialogo(guardarDatoCompartido, alCerrar);
  const prefijo = `dato${useId().replace(/[^\w-]/g, "")}`;
  const titulo = dato ? `Editar «${dato.nombre}»` : "Nuevo dato compartido";
  return (
    <Dialogo abierto={abierto} alCerrar={alCerrar} titulo={titulo} className={DIALOGO}>
      {abierto ? (
        <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col gap-4 p-5">
          {dato ? <input type="hidden" name="id" value={dato.id} /> : null}
          <p aria-hidden="true" className="font-semibold">
            {titulo}
          </p>
          <p className="text-sm text-muted-foreground">
            Un dato compartido lo reporta una sola vez quien responde por él, y lo toman todos los indicadores que lo usan.
          </p>
          <CamposDelDato dato={dato} opciones={opciones} estado={estado} prefijo={prefijo} />
          <ErrorAccion estado={estado} />
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={alCerrar}>
              Volver
            </Boton>
            <Boton type="submit" pendiente={pendiente}>
              {pendiente ? "Guardando…" : dato ? "Guardar los cambios" : "Crear el dato"}
            </Boton>
          </div>
        </form>
      ) : null}
    </Dialogo>
  );
}

/** «Nuevo dato» (maqueta 11), para quien administra indicadores. */
export function NuevoDato({ opciones }: { opciones: OpcionesDeDato }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton onClick={() => setAbierto(true)}>Nuevo dato</Boton>
      <DialogoDato abierto={abierto} alCerrar={() => setAbierto(false)} dato={null} opciones={opciones} />
    </>
  );
}

/** «Editar el dato», en la página del dato, para quien administra indicadores. */
export function EditarDato({ dato, opciones }: { dato: DatoCompartido; opciones: OpcionesDeDato }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)}>
        Editar el dato
      </Boton>
      <DialogoDato abierto={abierto} alCerrar={() => setAbierto(false)} dato={dato} opciones={opciones} />
    </>
  );
}

/**
 * «Responsables» del dato (anexo 14C, §4.4): reemplaza la lista completa, como «Designar personas» de un indicador. Solo se
 * ofrecen usuarios activos; quien ya responde y se desactivó sigue en la lista, marcado «inactivo», hasta que se le quite.
 */
export function ResponsablesDelDato({ dato, usuarios }: { dato: DatoCompartido; usuarios: OpcionesDeDato["usuarios"] }) {
  const [abierto, setAbierto] = useState(false);
  const guardados = dato.responsables.map((r) => r.id);
  const [elegidos, setElegidos] = useState<number[]>(guardados);
  const [filtro, setFiltro] = useState("");
  const cerrar = () => setAbierto(false);
  const [estado, enviar, pendiente] = useAccionDeDialogo(designarResponsablesDelDato, cerrar);
  const idFiltro = useId();
  const inactivos = new Set(dato.responsables.filter((r) => !r.activo).map((r) => r.id));
  const visibles = usuarios.filter((u) => u.nombre.toLowerCase().includes(filtro.trim().toLowerCase()));
  const titulo = `Responsables de «${dato.nombre}»`;

  return (
    <>
      <Boton
        variante="secundario"
        onClick={() => {
          setElegidos(guardados);
          setAbierto(true);
        }}
      >
        Cambiar responsables
      </Boton>
      <Dialogo abierto={abierto} alCerrar={cerrar} titulo={titulo} className={CLASE_DIALOGO}>
        {abierto ? (
          <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col gap-4 p-5">
            <input type="hidden" name="id" value={dato.id} />
            <input type="hidden" name="usuarioIds" value={JSON.stringify(elegidos)} />
            <p aria-hidden="true" className="font-semibold">
              {titulo}
            </p>
            <p className="text-sm text-muted-foreground">
              Lo reportan y lo corrigen sus responsables y los líderes del proceso dueño. Se guarda la lista completa.
            </p>
            <div className="flex flex-col gap-1">
              <label htmlFor={idFiltro} className="text-sm font-medium">
                Buscar persona
              </label>
              <input
                id={idFiltro}
                type="search"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                onKeyDown={sinEnviarConEnter}
                className={CONTROL}
              />
            </div>
            <fieldset className="flex flex-col gap-1">
              <legend className="text-sm font-medium">{`Responden: ${elegidos.length} de ${MAXIMO_RESPONSABLES} como máximo`}</legend>
              <ul className="max-h-56 list-none overflow-y-auto rounded-md border border-border p-2">
                {visibles.map((u) => (
                  <li key={u.id}>
                    <label className="flex items-center gap-2 rounded-sm px-1 py-1 text-sm hover:bg-muted">
                      <input
                        type="checkbox"
                        checked={elegidos.includes(u.id)}
                        onChange={(e) => setElegidos((previo) => (e.target.checked ? [...previo, u.id] : previo.filter((x) => x !== u.id)))}
                        className="size-4 accent-marca-relleno"
                      />
                      <span className="min-w-0 break-words">{u.nombre}</span>
                      {inactivos.has(u.id) ? <span className="text-xs text-muted-foreground">(inactivo)</span> : null}
                    </label>
                  </li>
                ))}
                {visibles.length === 0 ? <li className="px-1 py-1 text-sm text-muted-foreground">Nadie coincide con la búsqueda.</li> : null}
              </ul>
            </fieldset>
            <ErrorAccion estado={estado} />
            <div className="flex flex-wrap justify-end gap-2">
              <Boton variante="secundario" onClick={cerrar}>
                Volver
              </Boton>
              <Boton type="submit" pendiente={pendiente}>
                {pendiente ? "Guardando…" : "Guardar"}
              </Boton>
            </div>
          </form>
        ) : null}
      </Dialogo>
    </>
  );
}

/**
 * «Desactivar el dato» o «Activar el dato» (anexo 14C, §4.1), para quien administra indicadores. Se desactiva solo si ningún
 * indicador activo lo usa; si el servidor lo rechaza, su mensaje se muestra tal cual.
 */
export function EstadoDelDato({ dato }: { dato: DatoCompartido }) {
  const [estado, enviar, pendiente] = useActionState(cambiarEstadoDelDato, null);
  return (
    <form action={enviar} className="flex flex-col items-start gap-1">
      <input type="hidden" name="id" value={dato.id} />
      <input type="hidden" name="activa" value={dato.activa ? "false" : "true"} />
      <Boton type="submit" variante="secundario" pendiente={pendiente}>
        {pendiente ? "Guardando…" : dato.activa ? "Desactivar el dato" : "Activar el dato"}
      </Boton>
      <ErrorAccion estado={estado} />
    </form>
  );
}

/**
 * «Borrar el dato» (anexo 14C, §4.1), para quien administra indicadores: pide confirmarlo, porque no se deshace, y al terminar
 * lleva a «Datos compartidos». Un dato con historia no se borra (se desactiva): la página no ofrece el botón, y si la
 * historia aparece mientras tanto, el servidor lo rechaza con su mensaje.
 */
export function BorrarDato({ dato }: { dato: DatoCompartido }) {
  const [abierto, setAbierto] = useState(false);
  const cerrar = () => setAbierto(false);
  const [estado, enviar, pendiente] = useAccionDeDialogo(borrarDatoCompartido, cerrar);
  const titulo = `Borrar «${dato.nombre}»`;
  return (
    <>
      <Boton variante="peligro" onClick={() => setAbierto(true)}>
        Borrar el dato
      </Boton>
      <Dialogo abierto={abierto} alCerrar={cerrar} titulo={titulo} className={CLASE_DIALOGO}>
        {abierto ? (
          <form action={enviar} className="flex flex-col gap-4 p-5">
            <input type="hidden" name="id" value={dato.id} />
            <p aria-hidden="true" className="font-semibold">
              {titulo}
            </p>
            <p className="text-sm text-muted-foreground">
              Se borran el dato y sus responsables, y no se puede deshacer. Solo se borra un dato que ninguna ficha cita y que no
              tiene periodos; si ya tiene historia, desactívelo.
            </p>
            <ErrorAccion estado={estado} />
            <div className="flex flex-wrap justify-end gap-2">
              <Boton variante="secundario" onClick={cerrar}>
                Volver
              </Boton>
              <Boton type="submit" variante="peligro" pendiente={pendiente}>
                {pendiente ? "Borrando…" : "Borrar el dato"}
              </Boton>
            </div>
          </form>
        ) : null}
      </Dialogo>
    </>
  );
}
