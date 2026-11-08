import Link from "next/link";
import { QuienFalta, type PersonaQueFalta } from "@/componentes/distribucion/acuses/QuienFalta";
import { fechaCorta } from "@/componentes/distribucion/copias/TablaCopias";
import { Insignia } from "@/componentes/ui/Insignia";
import { TablaDatos, celda, celdaNumerica, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import type { FilaAcuses } from "@/db/consultas/distribucion/acuses";

const COLUMNAS: readonly ColumnaTabla[] = [
  { clave: "documento", etiqueta: "Documento" },
  { clave: "proceso", etiqueta: "Proceso" },
  { clave: "confirmados", etiqueta: "Confirmados", numerica: true },
  { clave: "pendientes", etiqueta: "Pendientes", numerica: true },
  { clave: "porcentaje", etiqueta: "Cumplimiento", numerica: true },
  { clave: "vence", etiqueta: "Vencen" },
  { clave: "falta", etiqueta: "Quién falta", oculta: true },
];

export function textoPorcentaje(p: number | null): string {
  return p === null ? "Sin datos" : `${p} %`;
}

/** El cumplimiento de lectura por versión; el porcentaje va siempre en texto y la insignia solo lo refuerza. */
export function TablaAcuses({ filas, faltan }: { filas: FilaAcuses[]; faltan: Map<number, PersonaQueFalta[]> }) {
  return (
    <TablaDatos titulo="Acuses de lectura por versión" columnas={COLUMNAS} filas={filas.length} vacio="No hay acuses en este periodo.">
      {filas.map((f) => (
        <tr key={f.versionId}>
          <td className={celda}>
            <Link
              href={`/documentos/${f.codigo.toLowerCase()}`}
              className="rounded font-mono text-xs font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
            >
              {`${f.codigo} v${f.version}`}
            </Link>
            <div>{f.titulo}</div>
            {f.porAsistencia > 0 || f.porFirma > 0 ? (
              <div className="text-xs text-muted-foreground">
                {[f.porAsistencia > 0 ? `${f.porAsistencia} por asistencia` : null, f.porFirma > 0 ? `${f.porFirma} por firma` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            ) : null}
          </td>
          <td className={celda}>{f.proceso}</td>
          <td className={celdaNumerica}>{f.confirmados}</td>
          <td className={celdaNumerica}>{f.pendientes}</td>
          <td className={celdaNumerica}>
            <Insignia variante={f.porcentaje === null ? "sin-dato" : f.porcentaje >= 90 ? "bien" : f.porcentaje >= 60 ? "atencion" : "critico"}>
              {textoPorcentaje(f.porcentaje)}
            </Insignia>
          </td>
          <td className={celda}>{f.venceEn ? fechaCorta(f.venceEn) : "—"}</td>
          <td className={celda}>
            <QuienFalta titulo={`${f.codigo} v${f.version}`} personas={faltan.get(f.versionId) ?? []} />
          </td>
        </tr>
      ))}
    </TablaDatos>
  );
}
