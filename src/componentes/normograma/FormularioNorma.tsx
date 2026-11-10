"use client";

import Link from "next/link";
import { useActionState } from "react";
import { crearNormaAccion, editarNormaAccion } from "@/app/acciones-normograma";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton, claseBoton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";

const CONTROL = `${claseControl} w-full min-w-0 max-w-full`;
const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

export type ValoresNorma = {
  id: number;
  tipoNormaId: number;
  numero: string;
  anio: number;
  fechaExpedicion: string | null;
  entidadEmisora: string;
  titulo: string;
  tema: string | null;
  enlaceOficial: string | null;
  notas: string | null;
};

/**
 * Registrar o editar una norma (spec 13C §10.1), para quien administra el normograma. La entidad emisora sugiere lo ya
 * escrito en otras normas (`datalist`, sin catálogo aparte); el enlace oficial es texto de referencia: el sistema no lo
 * abre. Al guardar lleva a la ficha.
 */
export function FormularioNorma({
  norma,
  tipos,
  emisores,
}: {
  /** La norma que se edita; sin ella, el alta. */
  norma?: ValoresNorma;
  /** Los tipos activos y, al editar, el de la norma aunque esté inactivo. */
  tipos: { id: number; nombre: string }[];
  emisores: string[];
}) {
  const [estado, enviar, pendiente] = useActionState(norma ? editarNormaAccion : crearNormaAccion, null);
  const cancelar = norma ? `/normograma/${norma.id}` : "/normograma";

  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex min-w-0 max-w-3xl flex-col gap-4">
      {norma ? <input type="hidden" name="id" value={norma.id} /> : null}
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
        <Campo etiqueta="Tipo de norma" nombre="tipoNormaId">
          <select required defaultValue={norma?.tipoNormaId ?? ""} className={CONTROL}>
            <option value="" disabled>
              Elija el tipo
            </option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Número" nombre="numero" ayuda="Como lo cita la norma: «3100», «1995».">
          <input required minLength={1} maxLength={40} defaultValue={norma?.numero ?? ""} className={CONTROL} />
        </Campo>
        <Campo etiqueta="Año" nombre="anio">
          <input type="number" required min={1800} max={2100} step={1} defaultValue={norma?.anio ?? ""} className={CONTROL} />
        </Campo>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
        <Campo etiqueta="Fecha de expedición (opcional)" nombre="fechaExpedicion">
          <input type="date" defaultValue={norma?.fechaExpedicion ?? ""} className={CONTROL} />
        </Campo>
        <div className="min-w-0 sm:col-span-2">
          <Campo etiqueta="Entidad emisora" nombre="entidadEmisora" ayuda="Escriba o elija una de las ya registradas.">
            <input required minLength={2} maxLength={200} list="emisores-sugeridos" defaultValue={norma?.entidadEmisora ?? ""} className={CONTROL} />
          </Campo>
          <datalist id="emisores-sugeridos">
            {emisores.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        </div>
      </div>
      <Campo etiqueta="Título o epígrafe" nombre="titulo">
        <textarea required minLength={3} maxLength={500} rows={2} defaultValue={norma?.titulo ?? ""} className={CONTROL} />
      </Campo>
      <Campo etiqueta="Tema o resumen (opcional)" nombre="tema" ayuda="Entra a la búsqueda. Hasta 2000 caracteres.">
        <textarea maxLength={2000} rows={3} defaultValue={norma?.tema ?? ""} className={CONTROL} />
      </Campo>
      <Campo
        etiqueta="Enlace oficial (opcional)"
        nombre="enlaceOficial"
        ayuda="La dirección de referencia. Se muestra como texto para copiar: el sistema no la consulta ni la abre."
      >
        <input maxLength={500} defaultValue={norma?.enlaceOficial ?? ""} className={CONTROL} />
      </Campo>
      <Campo etiqueta="Notas (opcional)" nombre="notas" ayuda="Hasta 2000 caracteres.">
        <textarea maxLength={2000} rows={3} defaultValue={norma?.notas ?? ""} className={CONTROL} />
      </Campo>
      <ErrorAccion estado={estado} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link href={cancelar} className={`${claseBoton("secundario")} ${FOCO}`}>
          Cancelar
        </Link>
        <Boton type="submit" pendiente={pendiente}>
          {pendiente ? "Guardando…" : norma ? "Guardar los cambios" : "Registrar la norma"}
        </Boton>
      </div>
    </form>
  );
}
