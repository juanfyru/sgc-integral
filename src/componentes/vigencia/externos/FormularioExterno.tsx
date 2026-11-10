"use client";

import { useActionState, useState } from "react";
import { registrarExternoAccion } from "@/app/acciones-vigencia";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import type { OpcionesDeExterno } from "@/db/consultas/vigencia/externos";

const control = `${claseControl} w-full min-w-0 max-w-full`;

type Persona = OpcionesDeExterno["personas"][number];

/** «Nombre — Cargo», como en el resto de la plataforma. */
const textoPersona = (p: Persona) => (p.cargo ? `${p.nombre} — ${p.cargo}` : p.nombre);

/**
 * Los datos de control de un externo (spec 13C §8.2): emisor, título original, fuente oficial, responsable técnico,
 * periodicidad y norma. Los comparten el alta y «Editar»; el responsable lo controla quien los usa si lo necesita.
 */
export function CamposControl({
  valores,
  personas,
  normas,
  responsable,
}: {
  valores: {
    entidadEmisora: string;
    tituloOriginal: string | null;
    fuenteOficial: string | null;
    verificacionMeses: number;
    normaId: number | null;
  };
  personas: Persona[];
  normas: OpcionesDeExterno["normas"];
  responsable: { valor: number; alCambiar?: (id: number) => void };
}) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
      <Campo etiqueta="Entidad emisora" nombre="entidadEmisora" ayuda="Quien emite el documento: un ministerio, un fabricante, una sociedad científica.">
        <input required minLength={2} maxLength={200} defaultValue={valores.entidadEmisora} className={control} />
      </Campo>
      <Campo etiqueta="Título original (opcional)" nombre="tituloOriginal" ayuda="Si el documento se conoce con otro título.">
        <input maxLength={300} defaultValue={valores.tituloOriginal ?? ""} className={control} />
      </Campo>
      <Campo etiqueta="Fuente oficial (opcional)" nombre="fuenteOficial" ayuda="Dónde se consulta su vigencia: la dirección o el nombre del portal.">
        <input maxLength={500} defaultValue={valores.fuenteOficial ?? ""} className={control} />
      </Campo>
      <Campo
        etiqueta="Responsable técnico"
        nombre="responsableId"
        ayuda="Verifica su vigencia contra la fuente oficial. Si el documento es restringido, debe poder verlo."
      >
        {responsable.alCambiar ? (
          <select
            required
            value={responsable.valor}
            onChange={(e) => responsable.alCambiar?.(Number(e.target.value))}
            className={control}
          >
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {textoPersona(p)}
              </option>
            ))}
          </select>
        ) : (
          <select required defaultValue={responsable.valor} className={control}>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {textoPersona(p)}
              </option>
            ))}
          </select>
        )}
      </Campo>
      <Campo etiqueta="Periodicidad de verificación (meses)" nombre="verificacionMeses" ayuda="De 1 a 60 meses.">
        <input type="number" required min={1} max={60} step={1} defaultValue={valores.verificacionMeses} className={`${control} sm:w-32`} />
      </Campo>
      <Campo etiqueta="Norma enlazada (opcional)" nombre="normaId">
        <select defaultValue={valores.normaId ?? ""} className={control}>
          <option value="">Ninguna</option>
          {normas.map((n) => (
            <option key={n.id} value={n.id}>
              {n.nombre}
            </option>
          ))}
        </select>
      </Campo>
    </div>
  );
}

/** El responsable técnico por defecto: el líder del proceso propietario, o quien registra si no tiene (spec 13C §8.2). */
function responsablePorDefecto(opciones: OpcionesDeExterno, procesoId: number, usuarioId: number): number {
  return opciones.procesos.find((p) => p.id === procesoId)?.liderId ?? usuarioId;
}

/**
 * El alta de un externo (spec 13C §8.3): el documento, sus datos de control y la primera edición, que queda en
 * borrador. Al guardar lleva a la página del externo, donde se sube el archivo y se adopta con firma.
 */
export function FormularioExterno({ opciones, usuarioId }: { opciones: OpcionesDeExterno; usuarioId: number }) {
  const [estado, enviar, pendiente] = useActionState(registrarExternoAccion, null);
  const [procesoId, setProcesoId] = useState(opciones.procesos[0]?.id ?? 0);
  const [subprocesoId, setSubprocesoId] = useState("");
  const [responsableId, setResponsableId] = useState(() => responsablePorDefecto(opciones, procesoId, usuarioId));
  const [responsableElegido, setResponsableElegido] = useState(false);
  const proceso = opciones.procesos.find((p) => p.id === procesoId);

  const cambiarProceso = (id: number) => {
    setProcesoId(id);
    setSubprocesoId("");
    // Mientras nadie lo haya elegido a mano, el responsable sigue al líder del proceso.
    if (!responsableElegido) setResponsableId(responsablePorDefecto(opciones, id, usuarioId));
  };

  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex min-w-0 flex-col gap-6">
      <section aria-labelledby="alta-documento" className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs">
        <h2 id="alta-documento" className="text-sm font-semibold">
          El documento
        </h2>
        <Campo etiqueta="Título" nombre="titulo" ayuda="Como se conocerá en el hospital. Entre 3 y 200 caracteres.">
          <input required minLength={3} maxLength={200} className={control} />
        </Campo>
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo etiqueta="Proceso propietario" nombre="procesoId" ayuda="De él sale el código; no cambia después.">
            <select required value={procesoId} onChange={(e) => cambiarProceso(Number(e.target.value))} className={control}>
              {opciones.procesos.map((p) => (
                <option key={p.id} value={p.id}>
                  {`${p.sigla} · ${p.nombre}`}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Subproceso (opcional)" nombre="subprocesoId">
            <select value={subprocesoId} onChange={(e) => setSubprocesoId(e.target.value)} className={control}>
              <option value="">Todo el proceso</option>
              {(proceso?.subprocesos ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">También aplica en (opcional)</legend>
          <div className="flex max-h-56 min-w-0 flex-col gap-1 overflow-y-auto rounded-md border border-border p-3">
            {opciones.todos
              .filter((p) => p.id !== procesoId)
              .map((p) => (
                <div key={p.id} className="flex min-w-0 flex-col gap-1">
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" name="otrosProcesos" value={`p:${p.id}`} className="mt-0.5 size-4" />
                    <span className="min-w-0 break-words">{p.nombre}</span>
                  </label>
                  {p.subprocesos.map((s) => (
                    <label key={s.id} className="ml-6 flex items-start gap-2 text-sm">
                      <input type="checkbox" name="otrosProcesos" value={`s:${s.id}`} className="mt-0.5 size-4" />
                      <span className="min-w-0 break-words">{s.nombre}</span>
                    </label>
                  ))}
                </div>
              ))}
          </div>
        </fieldset>
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo etiqueta="Nivel de acceso" nombre="nivelAcceso" ayuda="Uno restringido solo lo ven quienes están en sus procesos.">
            <select required defaultValue="general" className={control}>
              <option value="general">General</option>
              <option value="restringido">Restringido</option>
            </select>
          </Campo>
          <Campo etiqueta="Palabras clave (opcional)" nombre="palabrasClave" ayuda="Separadas por coma. Alimentan la búsqueda.">
            <input maxLength={500} className={control} />
          </Campo>
        </div>
        <Campo etiqueta="Descripción (opcional)" nombre="descripcion">
          <textarea rows={3} maxLength={2000} className={control} />
        </Campo>
      </section>

      <section aria-labelledby="alta-control" className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs">
        <h2 id="alta-control" className="text-sm font-semibold">
          Datos de control
        </h2>
        <CamposControl
          valores={{ entidadEmisora: "", tituloOriginal: null, fuenteOficial: null, verificacionMeses: opciones.verificacionMeses, normaId: null }}
          personas={opciones.personas}
          normas={opciones.normas}
          responsable={{
            valor: responsableId,
            alCambiar: (id) => {
              setResponsableId(id);
              setResponsableElegido(true);
            },
          }}
        />
      </section>

      <section aria-labelledby="alta-edicion" className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs">
        <h2 id="alta-edicion" className="text-sm font-semibold">
          Primera edición
        </h2>
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo etiqueta="Edición" nombre="edicion" ayuda="Como la nombra el emisor: «2017», «rev. 4.2», «Res. 0312 de 2019».">
            <input required maxLength={60} className={control} />
          </Campo>
          <Campo etiqueta="Fecha de emisión (opcional)" nombre="fechaEdicion">
            <input type="date" className={control} />
          </Campo>
        </div>
        <p className="text-sm text-muted-foreground">
          La edición queda en borrador: en la página siguiente se sube su archivo y se adopta con su firma.
        </p>
      </section>

      <div className="flex flex-col items-end gap-2">
        <ErrorAccion estado={estado} />
        <Boton type="submit" pendiente={pendiente}>
          {pendiente ? "Registrando…" : "Registrar documento externo"}
        </Boton>
      </div>
    </form>
  );
}
