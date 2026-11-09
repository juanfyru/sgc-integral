import Link from "next/link";
import { TablaDatos, celda, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import type { FilaExterno } from "@/db/consultas/vigencia/externos";
import { textoFecha } from "@/lib/vigencia/plazo";
import { textoVigenciaDeExterno } from "@/lib/vigencia/semaforo";
import { ETIQUETA_RESULTADO } from "@/lib/vigencia/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { ChipVigencia } from "../ChipVigencia";

const COLUMNAS: readonly ColumnaTabla[] = [
  { clave: "documento", etiqueta: "Documento" },
  { clave: "emisor", etiqueta: "Emisor · edición" },
  { clave: "adopcion", etiqueta: "Adopción" },
  { clave: "verificacion", etiqueta: "Última verificación" },
  { clave: "proxima", etiqueta: "Próxima verificación" },
  { clave: "responsable", etiqueta: "Responsable técnico" },
  { clave: "vigencia", etiqueta: "Vigencia" },
  { clave: "proceso", etiqueta: "Proceso" },
];

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

function Chip({ fila: f }: { fila: FilaExterno }) {
  const texto = textoVigenciaDeExterno({ adoptado: f.adoptadaEn !== null, vigencia: f.vigencia, impacto: f.impacto, edicionPendiente: f.edicionPendiente });
  return <ChipVigencia vigencia={{ estado: f.vigencia.estado, texto }} />;
}

function Documento({ fila: f }: { fila: FilaExterno }) {
  return (
    <>
      <div>
        <Link href={`/vigencia/externos/${f.documentoId}`} className={`rounded font-mono text-xs font-medium hover:underline ${FOCO}`}>
          {f.codigo}
        </Link>
      </div>
      <div className="break-words">{f.titulo}</div>
      {f.tituloOriginal ? <div className="break-words text-xs text-muted-foreground">{f.tituloOriginal}</div> : null}
    </>
  );
}

function Emisor({ fila: f }: { fila: FilaExterno }) {
  return <span className="break-words">{f.edicion ? `${f.emisor} · ${f.edicion}` : f.emisor}</span>;
}

function Fecha({ fecha, zona, vacio }: { fecha: Date | null; zona: string; vacio: string }) {
  return fecha ? <span className="whitespace-nowrap">{textoFecha(fecha, zona)}</span> : <span className="text-muted-foreground">{vacio}</span>;
}

function UltimaVerificacion({ fila: f, zona }: { fila: FilaExterno; zona: string }) {
  if (!f.ultimaVerificacion) return <span className="text-muted-foreground">Sin verificar</span>;
  return (
    <>
      <div className="whitespace-nowrap">{textoFecha(f.ultimaVerificacion.fecha, zona)}</div>
      <div className="text-xs text-muted-foreground">{`${ETIQUETA_RESULTADO[f.ultimaVerificacion.resultado]} · ${f.ultimaVerificacion.nombre}`}</div>
    </>
  );
}

/** La matriz SGC-MZ-03 (spec 13C §8.6, maqueta 7): tabla desde 768 px; por debajo, una tarjeta por externo. */
export function TablaExternos({ filas }: { filas: FilaExterno[] }) {
  const zona = zonaHoraria();
  return (
    <>
      <div className="hidden md:block">
        <TablaDatos titulo="Matriz de documentos externos" columnas={COLUMNAS} filas={filas.length} vacio="Sin documentos externos">
          {filas.map((f) => (
            <tr key={f.documentoId}>
              <td className={celda}><Documento fila={f} /></td>
              <td className={celda}><Emisor fila={f} /></td>
              <td className={celda}><Fecha fecha={f.adoptadaEn} zona={zona} vacio="Sin adoptar" /></td>
              <td className={celda}><UltimaVerificacion fila={f} zona={zona} /></td>
              <td className={celda}><Fecha fecha={f.proximaVerificacion} zona={zona} vacio="Sin fecha" /></td>
              <td className={celda}>{f.responsable}</td>
              <td className={celda}><Chip fila={f} /></td>
              <td className={`${celda} whitespace-nowrap`}>
                <abbr title={f.proceso.nombre} className="no-underline">{f.proceso.sigla}</abbr>
              </td>
            </tr>
          ))}
        </TablaDatos>
      </div>
      <ul className="flex list-none flex-col gap-3 md:hidden" aria-label="Matriz de documentos externos">
        {filas.map((f) => (
          <li key={f.documentoId} className="rounded-lg border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0"><Documento fila={f} /></div>
              <Chip fila={f} />
            </div>
            <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">Emisor</dt>
              <dd><Emisor fila={f} /></dd>
              <dt className="text-muted-foreground">Adopción</dt>
              <dd><Fecha fecha={f.adoptadaEn} zona={zona} vacio="Sin adoptar" /></dd>
              <dt className="text-muted-foreground">Verificación</dt>
              <dd><UltimaVerificacion fila={f} zona={zona} /></dd>
              <dt className="text-muted-foreground">Próxima</dt>
              <dd><Fecha fecha={f.proximaVerificacion} zona={zona} vacio="Sin fecha" /></dd>
              <dt className="text-muted-foreground">Responsable</dt>
              <dd>{f.responsable}</dd>
              <dt className="text-muted-foreground">Proceso</dt>
              <dd>{f.proceso.nombre}</dd>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
