"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { claseBoton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { InsigniaEstadoDocumento } from "@/componentes/ui/Insignia";
import { TablaDatos, celda, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import { ChipVigencia } from "@/componentes/vigencia/ChipVigencia";
import {
  ETIQUETA_ESTADO_FILTRO,
  FILTRO_VACIO,
  filtrarDocumentos,
  opcionesDe,
  type FiltroDocumentos,
} from "@/lib/filtro-documentos-admin";
import { ETIQUETA_VIGENCIA, type EstadoVigencia } from "@/lib/vigencia/tipos";

export type FilaTablaDocumentos = {
  id: number;
  codigo: string;
  titulo: string;
  tipoNombre: string;
  procesos: string[];
  estados: string[];
  vigencia: { estado: EstadoVigencia; dias: number | null; texto: string } | null;
};

const COLUMNAS: readonly ColumnaTabla[] = [
  { clave: "codigo", etiqueta: "Código" },
  { clave: "titulo", etiqueta: "Título" },
  { clave: "tipo", etiqueta: "Tipo" },
  { clave: "procesos", etiqueta: "Procesos" },
  { clave: "estado", etiqueta: "Estado" },
  { clave: "vigencia", etiqueta: "Vigencia" },
];

const claseEtiqueta = "flex flex-col gap-1 text-sm font-medium";

/**
 * La tabla de Gestión de documentos con su filtro: texto sobre código y título, y tipo, proceso, estado y vigencia exactos.
 * Filtra al escribir, sobre la lista que ya llegó del servidor; la dirección de la página no cambia.
 */
export function TablaDocumentosAdmin({ filas }: { filas: FilaTablaDocumentos[] }) {
  const [filtro, setFiltro] = useState<FiltroDocumentos>(FILTRO_VACIO);
  const opciones = useMemo(() => opcionesDe(filas), [filas]);
  const visibles = useMemo(() => filtrarDocumentos(filas, filtro), [filas, filtro]);
  const filtrando = Object.values(filtro).some(Boolean);
  const cambiar = (campo: keyof FiltroDocumentos) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFiltro((f) => ({ ...f, [campo]: e.target.value }));

  return (
    <div className="flex flex-col gap-3">
      <form role="search" aria-label="Filtrar documentos" onSubmit={(e) => e.preventDefault()} className="flex flex-wrap items-end gap-3">
        <label className={`${claseEtiqueta} min-w-56 flex-1`}>
          Buscar
          <input
            type="search"
            value={filtro.texto}
            onChange={cambiar("texto")}
            placeholder="Código o título"
            autoComplete="off"
            className={claseControl}
          />
        </label>
        <label className={claseEtiqueta}>
          Tipo
          <select value={filtro.tipo} onChange={cambiar("tipo")} className={claseControl}>
            <option value="">Todos</option>
            {opciones.tipos.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className={claseEtiqueta}>
          Proceso
          <select value={filtro.proceso} onChange={cambiar("proceso")} className={claseControl}>
            <option value="">Todos</option>
            {opciones.procesos.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className={claseEtiqueta}>
          Estado
          <select value={filtro.estado} onChange={cambiar("estado")} className={claseControl}>
            <option value="">Todos</option>
            {opciones.estados.map((e) => (
              <option key={e} value={e}>{ETIQUETA_ESTADO_FILTRO[e] ?? e}</option>
            ))}
          </select>
        </label>
        <label className={claseEtiqueta}>
          Vigencia
          <select value={filtro.vigencia} onChange={cambiar("vigencia")} className={claseControl}>
            <option value="">Todas</option>
            {opciones.vigencias.map((v) => (
              <option key={v} value={v}>{ETIQUETA_VIGENCIA[v]}</option>
            ))}
          </select>
        </label>
        {filtrando ? (
          <button type="button" onClick={() => setFiltro(FILTRO_VACIO)} className={claseBoton("secundario")}>
            Limpiar
          </button>
        ) : null}
      </form>
      <p role="status" className="text-sm text-muted-foreground">
        {filtrando
          ? `${visibles.length} de ${filas.length} ${filas.length === 1 ? "documento" : "documentos"}`
          : `${filas.length} ${filas.length === 1 ? "documento" : "documentos"}`}
      </p>
      <TablaDatos
        titulo="Documentos del SGC"
        columnas={COLUMNAS}
        filas={visibles.length}
        vacio={filtrando ? "Ningún documento coincide con el filtro." : "Sin documentos"}
      >
        {visibles.map((d) => (
          <tr key={d.id} className="hover:bg-muted/50">
            <td className={`${celda} whitespace-nowrap font-mono`}>
              <Link href={`/admin/documentos/${d.codigo}`} className="hover:underline">
                {d.codigo}
              </Link>
            </td>
            <td className={celda}>{d.titulo}</td>
            <td className={celda}>{d.tipoNombre}</td>
            <td className={celda}>{d.procesos.length > 0 ? d.procesos.join(", ") : "—"}</td>
            <td className={celda}>
              <span className="flex flex-wrap gap-1">
                {d.estados.map((e) => (
                  <InsigniaEstadoDocumento key={e} estado={e} />
                ))}
              </span>
            </td>
            <td className={celda}>
              {d.vigencia ? <ChipVigencia vigencia={d.vigencia} /> : "—"}
            </td>
          </tr>
        ))}
      </TablaDatos>
    </div>
  );
}
