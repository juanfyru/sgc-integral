import Link from "next/link";
import { Gauge } from "lucide-react";
import { celda, celdaNumerica, TablaDatos } from "@/componentes/ui/TablaDatos";
import type { FilaDeProceso } from "@/db/consultas/indicadores/lista";
import { rutaDeIndicador } from "@/lib/indicadores/rutas";
import { InsigniaSemaforo } from "./InsigniaSemaforo";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const ENLACE = `rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`;

const COLUMNAS = [
  { clave: "codigo", etiqueta: "Código" },
  { clave: "indicador", etiqueta: "Indicador" },
  { clave: "periodo", etiqueta: "Periodo" },
  { clave: "resultado", etiqueta: "Resultado", numerica: true },
  { clave: "estado", etiqueta: "Estado" },
];

/** Lo que dice la columna «Resultado» cuando no hay uno: «n. a.», lo que falta reportar o «sin dato». */
function sinResultado(f: FilaDeProceso): string {
  if (f.noAplica) return "n. a.";
  return ["—", "Cerrado", "Reportado"].includes(f.reporte.texto) ? "sin dato" : f.reporte.texto;
}

function Tabla({ titulo, filas }: { titulo: string; filas: FilaDeProceso[] }) {
  return (
    <TablaDatos titulo={titulo} columnas={COLUMNAS} filas={filas.length} vacio="Sin indicadores.">
      {filas.map((f) => (
        <tr key={f.id}>
          <td className={`${celda} whitespace-nowrap font-mono text-xs`}>{f.codigo}</td>
          <td className={`${celda} min-w-48`}>
            <Link href={rutaDeIndicador(f.codigo)} className={`break-words ${ENLACE}`}>
              {f.nombre || "(sin nombre)"}
            </Link>
          </td>
          <td className={`${celda} whitespace-nowrap`}>{f.etiquetaPeriodo ?? <span className="text-muted-foreground">—</span>}</td>
          <td className={`${celdaNumerica} whitespace-nowrap`}>{f.resultado ?? <span className="text-muted-foreground">{sinResultado(f)}</span>}</td>
          <td className={celda}>
            <InsigniaSemaforo semaforo={f.semaforo} noAplica={f.noAplica} conResultado={f.resultado !== null} />
          </td>
        </tr>
      ))}
    </TablaDatos>
  );
}

/**
 * Los indicadores de un proceso o de un subproceso (spec 14 §12.8), después de sus documentos: código, nombre, último
 * periodo terminado, su resultado y su estado escrito, y el enlace a la matriz del proceso. Los de cada subproceso, con
 * su subtítulo. Si la persona no ve ninguno, la sección no se pinta (ni su título).
 */
export function IndicadoresDelProceso({
  procesoId,
  titulo,
  propios,
  porSubproceso = [],
}: {
  procesoId: number;
  titulo: string;
  propios: FilaDeProceso[];
  porSubproceso?: { subprocesoId: number; nombre: string; filas: FilaDeProceso[] }[];
}) {
  if (propios.length === 0 && porSubproceso.length === 0) return null;
  return (
    <section className="mt-8" aria-labelledby="titulo-indicadores">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="titulo-indicadores" className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Gauge className="size-4 text-muted-foreground" aria-hidden="true" />
          {titulo}
        </h2>
        <Link href={`/indicadores/matriz?proceso=${procesoId}`} className={`text-sm ${ENLACE}`}>
          Ver la matriz del proceso
        </Link>
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        {propios.length > 0 ? <Tabla titulo={titulo} filas={propios} /> : null}
        {porSubproceso.map((g) => (
          <div key={g.subprocesoId} className="flex min-w-0 flex-col gap-2">
            <h3 className="text-xs font-semibold text-muted-foreground">{`Subproceso: ${g.nombre}`}</h3>
            <Tabla titulo={`Indicadores del subproceso ${g.nombre}`} filas={g.filas} />
          </div>
        ))}
      </div>
    </section>
  );
}
