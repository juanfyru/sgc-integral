"use client";

import { useState } from "react";
import { Campo } from "@/componentes/ui/Campo";
import type { CatalogoClasificacion } from "@/db/consultas/tramites";
import { codigoSiguiente, validarFormato } from "@/lib/tramites/codigo";
import { Dato, EnlaceDocumento, anchoCompleto, type Plantilla, type TramiteParaAceptar } from "./PiezasAceptacion";

/** Lista desplegable de casillas: son muchas y casi nunca hace falta tocarlas. */
function ListaDeCasillas({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <details>
      <summary className="cursor-pointer text-sm font-medium">{titulo}</summary>
      <div className="mt-2 flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md border border-border p-3">{children}</div>
    </details>
  );
}

export function ayudaDelCodigo(p: { formato: string | null; sugerido: string | null; editado: boolean }): string {
  if (!p.formato) return "No hay un formato de código configurado: escríbalo.";
  if (p.sugerido && !p.editado) return `Sugerido: el siguiente consecutivo, con el formato ${p.formato}.`;
  return `Debe llevar las siglas del proceso y del tipo. Formato: ${p.formato}.${p.sugerido ? ` Vacíe el campo para volver a ${p.sugerido}.` : ""}`;
}

export function ClasificacionNueva({
  tramite,
  catalogo,
  codigoSugerido,
  tipoId,
  plantilla,
  alElegirTipo,
}: {
  tramite: TramiteParaAceptar;
  catalogo: CatalogoClasificacion;
  codigoSugerido: string | null;
  tipoId: string;
  plantilla: Plantilla;
  alElegirTipo: (id: string) => void;
}) {
  const opciones = catalogo.procesos.flatMap((p) => [
    { marca: `p:${p.id}`, nombre: `${p.nombre} (${p.sigla})`, sigla: p.sigla },
    ...p.subprocesos.map((s) => ({ marca: `s:${s.id}`, nombre: `${p.nombre} › ${s.nombre}`, sigla: p.sigla })),
  ]);
  const [principal, setPrincipal] = useState(tramite.subprocesoId ? `s:${tramite.subprocesoId}` : `p:${tramite.procesoId}`);
  const [sugerido, setSugerido] = useState(codigoSugerido);
  const [escrito, setEscrito] = useState<string | null>(null);
  const formato =
    catalogo.formatoCodigo !== null && validarFormato(catalogo.formatoCodigo) === null ? catalogo.formatoCodigo : null;

  // Lo escrito a mano no se toca; la sugerencia sigue al proceso y al tipo elegidos.
  const proponer = (marca: string, idTipo: string) => {
    const proceso = opciones.find((o) => o.marca === marca)?.sigla;
    const siglaTipo = catalogo.tipos.find((t) => String(t.id) === idTipo)?.sigla;
    setSugerido(proceso && siglaTipo ? codigoSiguiente(catalogo.formatoCodigo, catalogo.codigos, { proceso, tipo: siglaTipo }) : null);
  };

  return (
    <div className="flex flex-col gap-4">
      <Campo etiqueta="Título" nombre="titulo">
        <input required minLength={3} maxLength={200} defaultValue={tramite.tituloPropuesto ?? ""} className={anchoCompleto} />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Tipo de documento" nombre="tipoDocumentoId">
          <select
            required
            value={tipoId}
            onChange={(e) => {
              alElegirTipo(e.target.value);
              proponer(principal, e.target.value);
            }}
            className={anchoCompleto}
          >
            <option value="">Elija el tipo</option>
            {catalogo.tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {`${t.nombre} (${t.sigla})`}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Nivel de acceso" nombre="nivelAcceso">
          <select required defaultValue="general" className={anchoCompleto}>
            <option value="general">General</option>
            <option value="restringido">Restringido</option>
          </select>
        </Campo>
      </div>
      <Campo etiqueta="Proceso o subproceso propietario" nombre="principal">
        <select
          required
          value={principal}
          onChange={(e) => {
            setPrincipal(e.target.value);
            proponer(e.target.value, tipoId);
          }}
          className={anchoCompleto}
        >
          <option value="">Elija el propietario</option>
          {opciones.map((o) => (
            <option key={o.marca} value={o.marca}>
              {o.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <ListaDeCasillas titulo="Otros procesos donde aplica">
        {opciones
          .filter((o) => o.marca !== principal)
          .map((o) => (
            <label key={o.marca} className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="asociaciones" value={o.marca} />
              {o.nombre}
            </label>
          ))}
      </ListaDeCasillas>
      <Campo etiqueta="Descripción" nombre="descripcion" ayuda="Opcional. Alimenta la búsqueda.">
        <textarea rows={2} maxLength={2000} className={anchoCompleto} />
      </Campo>
      <Campo etiqueta="Palabras clave" nombre="palabrasClave" ayuda="Opcional. Separadas por coma.">
        <input maxLength={500} className={anchoCompleto} />
      </Campo>
      <ListaDeCasillas titulo="Documentos relacionados">
        {catalogo.documentos.map((d) => (
          <label key={d.id} className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="relacionados" value={d.id} />
            {`${d.codigo} — ${d.titulo}`}
          </label>
        ))}
      </ListaDeCasillas>
      <Campo etiqueta="Código" nombre="codigo" ayuda={ayudaDelCodigo({ formato, sugerido, editado: escrito !== null })}>
        <input
          required
          maxLength={40}
          value={escrito ?? sugerido ?? ""}
          onChange={(e) => setEscrito(e.target.value === "" ? null : e.target.value)}
          className={`${anchoCompleto} font-mono uppercase`}
        />
      </Campo>
      {sugerido ? <input type="hidden" name="codigoSugerido" value={sugerido} /> : null}
      <dl className="grid grid-cols-2 gap-3">
        <Dato etiqueta="Versión">1</Dato>
        {plantilla ? (
          <Dato etiqueta="Plantilla">
            <EnlaceDocumento codigo={plantilla.codigo}>{`${plantilla.codigo}, versión ${plantilla.version}`}</EnlaceDocumento>
          </Dato>
        ) : null}
      </dl>
    </div>
  );
}
