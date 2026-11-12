"use client";

import { useId, useState } from "react";
import { designarAccion } from "@/app/acciones-indicadores";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { Dialogo } from "@/componentes/ui/Dialogo";
import type { FuncionDesignado } from "@/lib/indicadores/tipos";
import { CLASE_DIALOGO } from "./DialogoRetirar";
import { useAccionDeDialogo } from "./useAccionDeDialogo";

type Persona = { id: number; nombre: string; activo: boolean };

const FUNCIONES: { clave: FuncionDesignado; etiqueta: string; ayuda: string }[] = [
  { clave: "mide", etiqueta: "Quién mide", ayuda: "Reporta los valores de cada periodo." },
  { clave: "analiza", etiqueta: "Quién analiza", ayuda: "Escribe el análisis de cada medición." },
  { clave: "seguimiento", etiqueta: "Quién hace seguimiento", ayuda: "Sigue el indicador y ve sus soportes." },
];

const MAXIMO = 20;

/**
 * «Designar personas» (spec §7.3): reemplaza la lista de una función. Quien entra recibe un aviso; la bitácora guarda lo
 * que había y lo que queda. Solo se ofrecen usuarios activos; quien ya está designado y se desactivó sigue en la lista,
 * marcado «inactivo», hasta que se le quite.
 */
export function DialogoDesignar({
  abierto,
  alCerrar,
  indicadorId,
  codigo,
  usuarios,
  designados,
}: {
  abierto: boolean;
  alCerrar: () => void;
  indicadorId: number;
  codigo: string;
  usuarios: { id: number; nombre: string }[];
  designados: Record<FuncionDesignado, Persona[]>;
}) {
  const [funcion, setFuncion] = useState<FuncionDesignado>("mide");
  // Solo se envía la función elegida: al cambiarla, la selección vuelve a la lista guardada de esa función.
  const guardados = (f: FuncionDesignado) => designados[f].map((p) => p.id);
  const [elegidos, setElegidos] = useState<number[]>(guardados("mide"));
  const [filtro, setFiltro] = useState("");
  const [estado, enviar, pendiente] = useAccionDeDialogo(designarAccion, alCerrar);
  const idFuncion = useId();
  const idFiltro = useId();
  const inactivos = new Set(Object.values(designados).flatMap((l) => l.filter((p) => !p.activo).map((p) => p.id)));
  const actuales = elegidos;
  const visibles = usuarios.filter((u) => u.nombre.toLowerCase().includes(filtro.trim().toLowerCase()));
  const info = FUNCIONES.find((f) => f.clave === funcion)!;

  function alternar(id: number, marcado: boolean) {
    setElegidos((previo) => (marcado ? [...previo, id] : previo.filter((x) => x !== id)));
  }

  return (
    <Dialogo abierto={abierto} alCerrar={alCerrar} titulo={`Designar personas de ${codigo}`} className={CLASE_DIALOGO}>
      {abierto ? (
        <form action={enviar} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="id" value={indicadorId} />
          <input type="hidden" name="usuarioIds" value={JSON.stringify(actuales)} />
          <p aria-hidden="true" className="font-semibold">{`Designar personas de ${codigo}`}</p>
          <p className="text-sm text-muted-foreground">
            Se guarda la lista completa de la función elegida. Quien entra recibe un aviso. No crea una versión nueva de la ficha.
          </p>
          <div className="flex flex-col gap-1">
            <label htmlFor={idFuncion} className="text-sm font-medium">
              Función
            </label>
            <select id={idFuncion} name="funcion" value={funcion} onChange={(e) => {
                const nueva = e.target.value as FuncionDesignado;
                setFuncion(nueva);
                setElegidos(guardados(nueva));
              }} className={`${claseControl} w-full`}>
              {FUNCIONES.map((f) => (
                <option key={f.clave} value={f.clave}>
                  {f.etiqueta}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{info.ayuda}</p>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={idFiltro} className="text-sm font-medium">
              Buscar persona
            </label>
            <input id={idFiltro} type="search" value={filtro} onChange={(e) => setFiltro(e.target.value)} className={`${claseControl} w-full`} />
          </div>
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-medium">{`${info.etiqueta}: ${actuales.length} de ${MAXIMO} como máximo`}</legend>
            <ul className="max-h-56 list-none overflow-y-auto rounded-md border border-border p-2">
              {visibles.map((u) => (
                <li key={u.id}>
                  <label className="flex items-center gap-2 rounded-sm px-1 py-1 text-sm hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={actuales.includes(u.id)}
                      onChange={(e) => alternar(u.id, e.target.checked)}
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
            <Boton variante="secundario" onClick={alCerrar}>
              Volver
            </Boton>
            <Boton type="submit" pendiente={pendiente}>
              {pendiente ? "Guardando…" : "Guardar"}
            </Boton>
          </div>
        </form>
      ) : null}
    </Dialogo>
  );
}
