"use client";

import { useActionState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import type { OpcionesFormularioPunto } from "@/db/consultas/distribucion/puntos-uso";

type Valores = {
  nombre: string;
  sede: string | null;
  ubicacion: string | null;
  responsableId: number | null;
  procesoIds: number[];
};

export function FormularioPuntoUso({
  accion,
  id,
  valores,
  opciones,
}: {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  id?: number;
  valores: Valores;
  opciones: OpcionesFormularioPunto;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const enviado = (campo: string): string | undefined => {
    const x = estado?.valores?.[campo];
    return typeof x === "string" ? x : undefined;
  };
  const marcados = new Set(
    estado?.valores
      ? [estado.valores.procesoIds ?? []].flat().map(Number)
      : valores.procesoIds,
  );

  return (
    <form action={enviar} className="flex max-w-lg flex-col gap-5">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <Campo etiqueta="Nombre del punto de uso" nombre="nombre" ayuda="Por ejemplo, Farmacia o Consultorio 3.">
        <input required minLength={2} maxLength={80} defaultValue={enviado("nombre") ?? valores.nombre} className={claseControl} />
      </Campo>
      <Campo etiqueta="Sede (opcional)" nombre="sede">
        <input maxLength={80} defaultValue={enviado("sede") ?? valores.sede ?? ""} className={claseControl} />
      </Campo>
      <Campo etiqueta="Ubicación (opcional)" nombre="ubicacion" ayuda="Piso, bloque o referencia para encontrarlo.">
        <input maxLength={200} defaultValue={enviado("ubicacion") ?? valores.ubicacion ?? ""} className={claseControl} />
      </Campo>
      <Campo etiqueta="Responsable" nombre="responsableId" ayuda="Recibe y devuelve las copias controladas del punto.">
        <select required defaultValue={enviado("responsableId") ?? (valores.responsableId ? String(valores.responsableId) : "")} className={claseControl}>
          <option value="">Seleccione…</option>
          {opciones.usuarios.map((u) => (
            <option key={u.id} value={u.id}>{u.nombre} ({u.usuario})</option>
          ))}
        </select>
      </Campo>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Procesos que usan este punto</legend>
        {opciones.procesos.map((p) => (
          <label key={p.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="procesoIds" value={p.id} defaultChecked={marcados.has(p.id)} className="size-4" />
            {p.sigla} · {p.nombre}
          </label>
        ))}
      </fieldset>
      {estado && (
        <p role="alert" className="rounded-md bg-estado-critico-fondo px-3 py-2 text-sm text-estado-critico-texto">
          {estado.error}
        </p>
      )}
      <Boton type="submit" pendiente={pendiente} className="self-start">
        {pendiente ? "Guardando…" : "Guardar"}
      </Boton>
    </form>
  );
}
