"use client";

import { useActionState, useState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import type { Miembro, OpcionesFormularioLista } from "@/db/consultas/distribucion/listas";

type Valores = { nombre: string; descripcion: string | null; miembros: Miembro[] };

const claseGrupo = "flex min-w-0 flex-col gap-2";
const claseLista = "flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md border border-border p-3";

const clave = (tipo: string, referencia: number) => `${tipo}:${referencia}`;

function Casilla({ valor, marcada, children }: { valor: string; marcada: boolean; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name="miembros" value={valor} defaultChecked={marcada} className="size-4" />
      <span className="min-w-0 break-words">{children}</span>
    </label>
  );
}

export function FormularioLista({
  accion,
  id,
  valores,
  opciones,
}: {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  id?: number;
  valores: Valores;
  opciones: OpcionesFormularioLista;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const [filtro, setFiltro] = useState("");
  const enviado = (campo: string): string | undefined => {
    const x = estado?.valores?.[campo];
    return typeof x === "string" ? x : undefined;
  };
  const marcados = new Set(
    estado?.valores ? [estado.valores.miembros ?? []].flat() : valores.miembros.map((m) => clave(m.tipo, m.referenciaId)),
  );
  const ofrecidos = new Set([
    ...opciones.areas.map((a) => clave("area", a.id)),
    ...opciones.cargos.map((c) => clave("cargo", c.id)),
    ...opciones.procesos.map((p) => clave("proceso", p.id)),
    ...opciones.usuarios.map((u) => clave("usuario", u.id)),
  ]);
  // Miembros que ya no están activos: se muestran para poder quitarlos y no se pierden en silencio al guardar.
  const inactivos = valores.miembros.filter((m) => !ofrecidos.has(clave(m.tipo, m.referenciaId)));
  const cargosPorArea = new Map<number, { nombre: string; cargos: OpcionesFormularioLista["cargos"] }>();
  for (const c of opciones.cargos) {
    const g = cargosPorArea.get(c.areaId) ?? { nombre: c.areaNombre, cargos: [] };
    g.cargos.push(c);
    cargosPorArea.set(c.areaId, g);
  }
  const f = filtro.trim().toLocaleLowerCase("es");

  return (
    <form action={enviar} className="flex max-w-2xl flex-col gap-5">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <Campo etiqueta="Nombre de la lista" nombre="nombre" ayuda="Por ejemplo, Jefes de área o Personal asistencial.">
        <input required minLength={2} maxLength={80} defaultValue={enviado("nombre") ?? valores.nombre} className={claseControl} />
      </Campo>
      <Campo etiqueta="Descripción (opcional)" nombre="descripcion">
        <textarea rows={2} maxLength={300} defaultValue={enviado("descripcion") ?? valores.descripcion ?? ""} className={claseControl} />
      </Campo>

      <fieldset className={claseGrupo}>
        <legend className="mb-1 text-sm font-medium">Áreas (toda su gente)</legend>
        <div className={claseLista}>
          {opciones.areas.map((a) => (
            <Casilla key={a.id} valor={clave("area", a.id)} marcada={marcados.has(clave("area", a.id))}>{a.nombre}</Casilla>
          ))}
        </div>
      </fieldset>

      <fieldset className={claseGrupo}>
        <legend className="mb-1 text-sm font-medium">Cargos</legend>
        <div className={claseLista}>
          {[...cargosPorArea.entries()].map(([areaId, g]) => (
            <div key={areaId} role="group" aria-label={`Cargos de ${g.nombre}`} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">{g.nombre}</span>
              {g.cargos.map((c) => (
                <Casilla key={c.id} valor={clave("cargo", c.id)} marcada={marcados.has(clave("cargo", c.id))}>{c.nombre}</Casilla>
              ))}
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className={claseGrupo}>
        <legend className="mb-1 text-sm font-medium">Procesos (quienes están asignados)</legend>
        <div className={claseLista}>
          {opciones.procesos.map((p) => (
            <Casilla key={p.id} valor={clave("proceso", p.id)} marcada={marcados.has(clave("proceso", p.id))}>
              {p.sigla} · {p.nombre}
            </Casilla>
          ))}
        </div>
      </fieldset>

      <fieldset className={claseGrupo}>
        <legend className="mb-1 text-sm font-medium">Personas</legend>
        <input
          type="search"
          aria-label="Filtrar personas por nombre"
          placeholder="Filtrar por nombre"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className={claseControl}
        />
        <div className={claseLista}>
          {opciones.usuarios.map((u) => (
            <div key={u.id} hidden={f !== "" && !u.nombre.toLocaleLowerCase("es").includes(f)}>
              <Casilla valor={clave("usuario", u.id)} marcada={marcados.has(clave("usuario", u.id))}>
                {u.nombre} <span className="text-xs text-muted-foreground">({u.usuario})</span>
              </Casilla>
            </div>
          ))}
        </div>
      </fieldset>

      {inactivos.length > 0 ? (
        <fieldset className={claseGrupo}>
          <legend className="mb-1 text-sm font-medium">Miembros inactivos (desmarque para quitarlos)</legend>
          {inactivos.map((m) => (
            <Casilla key={clave(m.tipo, m.referenciaId)} valor={clave(m.tipo, m.referenciaId)} marcada={marcados.has(clave(m.tipo, m.referenciaId))}>
              {m.nombre} <span className="text-xs text-muted-foreground">(inactivo)</span>
            </Casilla>
          ))}
        </fieldset>
      ) : null}

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
