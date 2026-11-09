import Link from "next/link";
import { Insignia, type VarianteInsignia } from "@/componentes/ui/Insignia";
import { TablaDatos, celda, celdaNumerica, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import type { FilaNorma } from "@/db/consultas/normograma/lectura";
import { textoEstadoNorma, type EstadoNorma } from "@/lib/normograma/tipos";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

const VARIANTE: Record<EstadoNorma, VarianteInsignia> = {
  vigente: "bien",
  modificada: "atencion",
  derogada: "critico",
  retirada: "sin-dato",
};

/** El estado de una norma, siempre en texto: «Derogada · 25/11/2019». */
export function InsigniaNorma({ estado, estadoEn }: { estado: EstadoNorma; estadoEn: string | null }) {
  return <Insignia variante={VARIANTE[estado]}>{textoEstadoNorma(estado, estadoEn)}</Insignia>;
}

/** Una fila de la lista; `requisito`, el que la norma impone al proceso del normograma de proceso. */
export type FilaDeTabla = FilaNorma & { requisito?: string | null };

function Norma({ fila: f }: { fila: FilaDeTabla }) {
  return (
    <>
      <Link href={`/normograma/${f.id}`} className={`rounded font-medium hover:underline ${FOCO}`}>
        {f.nombre}
      </Link>
      <div className="break-words text-muted-foreground">{f.titulo}</div>
    </>
  );
}

const procesos = (f: FilaDeTabla) => (f.procesos.length > 0 ? f.procesos.join(", ") : "Sin procesos asociados");
const requisito = (f: FilaDeTabla) => f.requisito || "Sin requisito escrito";

/**
 * La lista del normograma (spec 13C §10.6, maqueta 8): norma, emisor, estado, procesos y documentos enlazados que la
 * persona ve; en el normograma de un proceso, también el requisito. Tabla desde 768 px; por debajo, una tarjeta por norma.
 */
export function TablaNormas({ filas, conRequisito = false }: { filas: FilaDeTabla[]; conRequisito?: boolean }) {
  const columnas: ColumnaTabla[] = [
    { clave: "norma", etiqueta: "Norma" },
    { clave: "emisor", etiqueta: "Emisor" },
    { clave: "estado", etiqueta: "Estado" },
    { clave: "procesos", etiqueta: "Procesos" },
    ...(conRequisito ? [{ clave: "requisito", etiqueta: "Requisito" }] : []),
    { clave: "documentos", etiqueta: "Documentos", numerica: true },
  ];
  return (
    <>
      <div className="hidden md:block">
        <TablaDatos titulo="Normas del normograma" columnas={columnas} filas={filas.length} vacio="Sin normas">
          {filas.map((f) => (
            <tr key={f.id}>
              <td className={celda}>
                <Norma fila={f} />
              </td>
              <td className={`${celda} break-words`}>{f.entidadEmisora}</td>
              <td className={celda}>
                <InsigniaNorma estado={f.estado} estadoEn={f.estadoEn} />
              </td>
              <td className={`${celda} break-words`}>{procesos(f)}</td>
              {conRequisito ? <td className={`${celda} whitespace-pre-line break-words`}>{requisito(f)}</td> : null}
              <td className={celdaNumerica}>{f.documentos}</td>
            </tr>
          ))}
        </TablaDatos>
      </div>
      <ul className="flex list-none flex-col gap-3 md:hidden" aria-label="Normas del normograma">
        {filas.map((f) => (
          <li key={f.id} className="rounded-lg border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <Norma fila={f} />
              </div>
              <InsigniaNorma estado={f.estado} estadoEn={f.estadoEn} />
            </div>
            <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">Emisor</dt>
              <dd className="break-words">{f.entidadEmisora}</dd>
              <dt className="text-muted-foreground">Procesos</dt>
              <dd className="break-words">{procesos(f)}</dd>
              {conRequisito ? (
                <>
                  <dt className="text-muted-foreground">Requisito</dt>
                  <dd className="whitespace-pre-line break-words">{requisito(f)}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Documentos</dt>
              <dd>{f.documentos}</dd>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
