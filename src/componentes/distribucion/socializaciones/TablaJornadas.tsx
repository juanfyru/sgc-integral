import Link from "next/link";
import { Insignia } from "@/componentes/ui/Insignia";
import { TablaDatos, celda, celdaNumerica, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import type { Jornada } from "@/db/consultas/distribucion/jornadas";
import { ETIQUETA_MODALIDAD } from "@/lib/distribucion/tipos";

const COLUMNAS: readonly ColumnaTabla[] = [
  { clave: "fecha", etiqueta: "Fecha" },
  { clave: "modalidad", etiqueta: "Modalidad" },
  { clave: "documentos", etiqueta: "Documentos" },
  { clave: "asistentes", etiqueta: "Asistentes", numerica: true },
  { clave: "evidencia", etiqueta: "Evidencia" },
  { clave: "estado", etiqueta: "Estado" },
];

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «2026-11-14» → «14 nov 2026»: la fecha de una jornada es un día, sin hora ni zona. */
export function fechaDeJornada(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  return `${dia} ${MESES[mes - 1]} ${anio}`;
}

export function textoEvidencia(cantidad: number): string {
  return cantidad === 0 ? "Sin acta adjunta" : cantidad === 1 ? "1 archivo" : `${cantidad} archivos`;
}

/** Lo que cada fila dice va en texto; la insignia solo refuerza el estado. */
export function TablaJornadas({ jornadas }: { jornadas: Jornada[] }) {
  return (
    <TablaDatos titulo="Jornadas de socialización" columnas={COLUMNAS} filas={jornadas.length} vacio="No hay jornadas registradas en este periodo.">
      {jornadas.map((j) => (
        <tr key={j.id}>
          <td className={celda}>
            <Link
              href={`/distribucion/socializaciones/${j.id}`}
              className="rounded font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
            >
              {fechaDeJornada(j.fecha)}
            </Link>
          </td>
          <td className={celda}>{ETIQUETA_MODALIDAD[j.modalidad]}</td>
          <td className={celda}>
            <ul className="list-none">
              {j.versiones.map((v) => (
                <li key={v.versionId}>
                  <span className="font-mono text-xs">{`${v.codigo} v${v.version}`}</span> {v.titulo}
                </li>
              ))}
            </ul>
          </td>
          <td className={celdaNumerica}>{j.asistentesCantidad}</td>
          <td className={celda}>{textoEvidencia(j.evidenciasCantidad)}</td>
          <td className={celda}>
            {j.anulada ? <Insignia variante="critico">Anulada</Insignia> : <Insignia variante="bien">Registrada</Insignia>}
          </td>
        </tr>
      ))}
    </TablaDatos>
  );
}
