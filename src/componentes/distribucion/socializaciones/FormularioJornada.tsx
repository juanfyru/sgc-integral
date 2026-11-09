"use client";

import { useActionState, useMemo, useState } from "react";
import { registrarJornadaAccion } from "@/app/acciones-distribucion";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { ErrorAccion } from "@/componentes/tramites/AccionesSolicitud";
import { Boton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import type { OpcionesDeJornada } from "@/db/consultas/distribucion/jornadas";
import { ETIQUETA_MODALIDAD, MODALIDADES_JORNADA } from "@/lib/distribucion/tipos";

const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Una lista de casillas con buscador. Lo que el filtro oculta sigue en el formulario: lo marcado no se pierde. */
function ListaMarcable<T extends { clave: number; texto: string }>({
  titulo,
  nombre,
  elementos,
  marcados,
  alMarcar,
  vacio,
}: {
  titulo: string;
  nombre: string;
  elementos: T[];
  marcados: Set<number>;
  alMarcar: (clave: number, marcado: boolean) => void;
  vacio: string;
}) {
  const [busqueda, setBusqueda] = useState("");
  const q = normal(busqueda.trim());
  const cuantos = useMemo(() => elementos.filter((e) => q === "" || normal(e.texto).includes(q)).length, [elementos, q]);
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="text-sm font-medium">{titulo}</legend>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {`Buscar en ${titulo.toLowerCase()}`}
        {/* Sin `name`: solo filtra la lista, no viaja en el formulario. */}
        <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} autoComplete="off" className={claseControl} />
      </label>
      <ul className="max-h-56 list-none overflow-y-auto rounded-md border border-border p-1">
        {elementos.length === 0 ? <li className="px-2 py-1 text-sm text-muted-foreground">{vacio}</li> : null}
        {elementos.map((e) => (
          <li key={e.clave} hidden={q !== "" && !normal(e.texto).includes(q)}>
            <label className="flex items-start gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
              <input
                type="checkbox"
                name={nombre}
                value={e.clave}
                checked={marcados.has(e.clave)}
                onChange={(ev) => alMarcar(e.clave, ev.target.checked)}
                className="mt-0.5 size-4"
              />
              <span>{e.texto}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {`${marcados.size} marcados · ${cuantos} de ${elementos.length} a la vista`}
      </p>
    </fieldset>
  );
}

function conMarca(previo: Set<number>, clave: number, marcado: boolean): Set<number> {
  const siguiente = new Set(previo);
  if (marcado) siguiente.add(clave);
  else siguiente.delete(clave);
  return siguiente;
}

export function FormularioJornada({
  opciones,
  hoy,
  facilitadorInicial,
  versionInicial,
}: {
  opciones: OpcionesDeJornada;
  hoy: string;
  facilitadorInicial: number;
  versionInicial: number | null;
}) {
  const [estado, enviar, pendiente] = useActionState(registrarJornadaAccion, null);
  const [versiones, setVersiones] = useState(
    () => new Set(versionInicial !== null && opciones.documentos.some((d) => d.versionId === versionInicial) ? [versionInicial] : []),
  );
  const [asistentes, setAsistentes] = useState<Set<number>>(() => new Set());
  const [conAnteriores, setConAnteriores] = useState(false);
  const hayAnteriores = opciones.documentos.some((d) => !d.vigente);
  // La vigente va por defecto; las obsoletas solo si se piden (o ya están marcadas).
  const documentos = opciones.documentos.filter((d) => d.vigente || conAnteriores || versiones.has(d.versionId));

  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Campo etiqueta="Fecha de la jornada" nombre="fecha">
          <input type="date" required max={hoy} defaultValue={hoy} className={claseControl} />
        </Campo>
        <Campo etiqueta="Modalidad" nombre="modalidad">
          <select required defaultValue="presencial" className={claseControl}>
            {MODALIDADES_JORNADA.map((m) => (
              <option key={m} value={m}>
                {ETIQUETA_MODALIDAD[m]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Facilitador" nombre="facilitadorId">
          <select required defaultValue={facilitadorInicial} className={claseControl}>
            {opciones.personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.cargo ? `${p.nombre} — ${p.cargo}` : p.nombre}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      {hayAnteriores ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={conAnteriores} onChange={(e) => setConAnteriores(e.target.checked)} className="mt-0.5 size-4" />
          <span>
            Incluir versiones anteriores (obsoletas)
            <span className="block text-xs text-muted-foreground">
              Para registrar tarde una capacitación hecha cuando regía esa versión. La vigente va por defecto.
            </span>
          </span>
        </label>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ListaMarcable
          titulo="Documentos socializados"
          nombre="versionIds"
          elementos={documentos.map((d) => ({
            clave: d.versionId,
            texto: `${d.codigo} v${d.version}${d.vigente ? "" : " (obsoleta)"} · ${d.titulo}`,
          }))}
          marcados={versiones}
          alMarcar={(k, m) => setVersiones((p) => conMarca(p, k, m))}
          vacio="No hay documentos en sus procesos."
        />
        <ListaMarcable
          titulo="Asistentes"
          nombre="asistenteIds"
          elementos={opciones.personas.map((p) => ({ clave: p.id, texto: p.cargo ? `${p.nombre} — ${p.cargo}` : p.nombre }))}
          marcados={asistentes}
          alMarcar={(k, m) => setAsistentes((p) => conMarca(p, k, m))}
          vacio="No hay personas activas."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Campo
          etiqueta="Asistentes externos"
          nombre="asistentesExternos"
          ayuda="Quienes no están en la plataforma, uno por renglón. Obligatorio si no marca ningún asistente."
        >
          <textarea rows={3} maxLength={1000} className={claseControl} />
        </Campo>
        <Campo etiqueta="Observaciones" nombre="observaciones">
          <textarea rows={3} maxLength={2000} className={claseControl} />
        </Campo>
      </div>

      <p className="text-sm text-muted-foreground">
        Quien asista y tenga pendiente la lectura de estos documentos queda con su acuse confirmado por asistencia. La
        evidencia (acta, listado firmado, fotos) se adjunta en la página de la jornada, durante las 24 horas siguientes.
      </p>
      <div className="flex flex-col items-end gap-2">
        <ErrorAccion estado={estado} />
        <Boton type="submit" pendiente={pendiente}>
          {pendiente ? "Registrando…" : "Registrar"}
        </Boton>
      </div>
    </form>
  );
}
