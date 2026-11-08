import Link from "next/link";
import { Download } from "lucide-react";
import { claseBoton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { Insignia } from "@/componentes/ui/Insignia";
import { TablaDatos, celda, celdaNumerica, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import type { ConformidadActual, FilaHistorial } from "@/db/consultas/distribucion/verificaciones-resumen";
import { TarjetaConformidad } from "./EstadoPuntos";
import { fechaConAnio } from "./fecha";

const COLUMNAS: readonly ColumnaTabla[] = [
  { clave: "punto", etiqueta: "Punto de uso" },
  { clave: "cerrada", etiqueta: "Cerrada" },
  { clave: "verifico", etiqueta: "Verificó" },
  { clave: "resultado", etiqueta: "Resultado" },
  { clave: "items", etiqueta: "Ítems conformes", numerica: true },
  { clave: "hallazgos", etiqueta: "Hallazgos abiertos", numerica: true },
];

export function HistorialVerificaciones({
  filas,
  conformidad,
  fallos,
  puntos,
  filtro,
}: {
  filas: FilaHistorial[];
  conformidad: ConformidadActual;
  fallos: { texto: string; veces: number }[];
  puntos: { id: number; nombre: string }[];
  filtro: { punto?: number; desde: string; hasta: string; resultado?: string };
}) {
  const consulta = new URLSearchParams({ desde: filtro.desde, hasta: filtro.hasta });
  if (filtro.punto) consulta.set("punto", String(filtro.punto));
  if (filtro.resultado) consulta.set("resultado", filtro.resultado);
  return (
    <section aria-labelledby="historial-verificaciones" className="flex flex-col gap-3">
      <h2 id="historial-verificaciones" className="text-sm font-semibold">
        Historial de verificaciones
      </h2>
      <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filtros del historial">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Punto de uso
          <select name="punto" defaultValue={filtro.punto ?? ""} className={claseControl}>
            <option value="">Todos</option>
            {puntos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Desde
          <input type="date" name="desde" defaultValue={filtro.desde} className={claseControl} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Hasta
          <input type="date" name="hasta" defaultValue={filtro.hasta} className={claseControl} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Resultado
          <select name="resultado" defaultValue={filtro.resultado ?? ""} className={claseControl}>
            <option value="">Todos</option>
            <option value="conforme">Conforme</option>
            <option value="no_conforme">No conforme</option>
          </select>
        </label>
        <button type="submit" className={claseBoton("secundario")}>
          Filtrar
        </button>
        <a href={`/distribucion/verificaciones/excel?${consulta}`} className={`${claseBoton("primario")} ml-auto`}>
          <Download aria-hidden="true" className="size-4" />
          Descargar Excel
        </a>
      </form>

      <div className="max-w-xs">
        <TarjetaConformidad etiqueta="Conformidad del periodo" c={conformidad} />
      </div>

      <TablaDatos titulo="Verificaciones cerradas" columnas={COLUMNAS} filas={filas.length} vacio="No hay verificaciones cerradas en este periodo.">
        {filas.map((f) => (
          <tr key={f.id}>
            <td className={celda}>
              <Link
                href={`/distribucion/verificaciones/${f.id}`}
                className="rounded font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
              >
                {f.punto}
              </Link>
              {f.sede ? <div className="text-xs text-muted-foreground">{f.sede}</div> : null}
            </td>
            <td className={celda}>{fechaConAnio(f.cerradaEn)}</td>
            <td className={celda}>
              {f.verificoNombre}
              {f.propioPunto ? <div className="text-xs text-muted-foreground">Responsable del punto</div> : null}
            </td>
            <td className={celda}>
              <Insignia variante={f.conforme ? "bien" : "critico"}>{f.conforme ? "Conforme" : "No conforme"}</Insignia>
            </td>
            <td className={celdaNumerica}>{`${f.itemsConformes} de ${f.itemsTotal}`}</td>
            <td className={celdaNumerica}>{f.hallazgosAbiertos}</td>
          </tr>
        ))}
      </TablaDatos>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Qué falla más en el periodo</h3>
        {fallos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ningún ítem salió no conforme en este periodo.</p>
        ) : (
          <ol className="flex list-none flex-col gap-1 text-sm">
            {fallos.map((f) => (
              <li key={f.texto} className="flex items-baseline justify-between gap-3 border-b border-linea-suave py-1">
                <span>{f.texto}</span>
                <span className="tabular-nums text-muted-foreground">{`${f.veces} ${f.veces === 1 ? "vez" : "veces"}`}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
