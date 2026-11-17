import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { celda, TablaDatos, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import type { ContextoMejora } from "@/db/consultas/mejoramiento/config";
import type { FilaDeHallazgo } from "@/db/consultas/mejoramiento/lectura";
import { ORIGENES } from "@/lib/mejoramiento/origenes";
import { quedanDiasHabiles } from "@/lib/mejoramiento/plazos";
import { rutaDeHallazgo } from "@/lib/mejoramiento/rutas";
import { ETIQUETA_CLASE, ETIQUETA_CRITICIDAD } from "@/lib/mejoramiento/textos";
import { InsigniasDelHallazgo } from "./InsigniasDelHallazgo";

type Contexto = Pick<ContextoMejora, "ahora" | "calendario" | "zona">;

const COLUMNAS: readonly ColumnaTabla[] = [
  { clave: "codigo", etiqueta: "Código" },
  { clave: "hallazgo", etiqueta: "Hallazgo" },
  { clave: "proceso", etiqueta: "Proceso" },
  { clave: "origen", etiqueta: "Origen" },
  { clave: "criticidad", etiqueta: "Criticidad" },
  { clave: "va", etiqueta: "En qué va" },
  { clave: "avance", etiqueta: "Avance", numerica: true },
  { clave: "vence", etiqueta: "Vence" },
];

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const ETIQUETA_ORIGEN = new Map<string, string>(ORIGENES.map((o) => [o.clave, o.etiqueta]));

/** «Vencida hace 4 días», «quedan 5 días hábiles», con la fecha límite en la zona de la instalación. */
export function textoDeVence(vence: Date | null, c: Contexto): { plazo: string; fecha: string; vencida: boolean } | null {
  if (!vence) return null;
  const fecha = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: c.zona }).format(vence);
  const dias = quedanDiasHabiles(vence, c);
  if (vence.getTime() < c.ahora.getTime()) {
    const n = -dias;
    return { fecha, vencida: true, plazo: n <= 0 ? "Vencida hoy" : `Vencida hace ${n} ${n === 1 ? "día" : "días"}` };
  }
  return {
    fecha,
    vencida: false,
    plazo: dias === 0 ? "Vence hoy" : dias === 1 ? "queda 1 día hábil" : `quedan ${dias} días hábiles`,
  };
}

function Vence({ vence, contexto }: { vence: Date | null; contexto: Contexto }) {
  const t = textoDeVence(vence, contexto);
  if (!t) return <span aria-label="Sin fecha límite">—</span>;
  return (
    <span className="block">
      <span className="block tabular-nums">{t.fecha}</span>
      <span className={`block text-xs ${t.vencida ? "font-semibold text-estado-critico-texto" : "text-muted-foreground"}`}>{t.plazo}</span>
    </span>
  );
}

function Estado({ fila }: { fila: FilaDeHallazgo }) {
  return (
    <span className="block">
      <span className="block font-medium">{fila.etiqueta}</span>
      <span className="block text-xs text-muted-foreground">{fila.turno}</span>
    </span>
  );
}

const textoAvance = (a: number | null) => (a === null ? "—" : `${a} %`);

/**
 * La lista de hallazgos (spec 15 §16.1, maqueta 1): una tabla desde 640 px y tarjetas por debajo. Cada fila dice en qué va
 * el hallazgo y quién tiene el turno; el estado y las marcas siempre llevan su texto.
 */
export function ListaDeHallazgos({ filas, contexto }: { filas: readonly FilaDeHallazgo[]; contexto: Contexto }) {
  if (filas.length === 0) {
    return (
      <EstadoVacio
        icono={ClipboardCheck}
        titulo="Aún no hay hallazgos"
        texto="Cuando se registre un hallazgo que usted pueda ver, aparecerá aquí con su estado y quién tiene el turno."
      />
    );
  }
  return (
    <>
      <div className="hidden sm:block">
        <TablaDatos titulo="Hallazgos de mejoramiento" columnas={COLUMNAS} filas={filas.length} vacio="Sin hallazgos">
          {filas.map((f) => (
            <tr key={f.id}>
              <td className={`${celda} whitespace-nowrap font-mono text-xs`}>
                <Link href={rutaDeHallazgo(f.id)} className={`rounded font-medium text-marca underline-offset-2 hover:underline ${FOCO}`}>
                  {f.codigo}
                </Link>
              </td>
              <td className={`${celda} min-w-64`}>
                <span className="block font-medium">{f.titulo}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  <InsigniasDelHallazgo clase={f.clase} criticidad={null} marcas={f.marcas} />
                </span>
              </td>
              <td className={celda}>{f.proceso}</td>
              <td className={celda}>{ETIQUETA_ORIGEN.get(f.origen) ?? f.origen}</td>
              <td className={celda}>{f.criticidad ? ETIQUETA_CRITICIDAD[f.criticidad] : "—"}</td>
              <td className={celda}>
                <Estado fila={f} />
              </td>
              <td className={`${celda} text-right tabular-nums`}>{textoAvance(f.avance)}</td>
              <td className={celda}>
                <Vence vence={f.vence} contexto={contexto} />
              </td>
            </tr>
          ))}
        </TablaDatos>
      </div>

      <ul aria-label="Hallazgos de mejoramiento" className="flex list-none flex-col gap-3 sm:hidden">
        {filas.map((f) => (
          <li key={f.id} className="rounded-lg border border-border bg-card p-3">
            <Link href={rutaDeHallazgo(f.id)} className={`rounded font-mono text-xs font-medium text-marca underline-offset-2 hover:underline ${FOCO}`}>
              {f.codigo}
            </Link>
            <p className="mt-1 text-sm font-medium">{f.titulo}</p>
            <p className="mt-1 flex flex-wrap gap-1">
              <InsigniasDelHallazgo clase={f.clase} criticidad={f.criticidad} marcas={f.marcas} />
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {f.proceso} · {ETIQUETA_ORIGEN.get(f.origen) ?? f.origen} · {ETIQUETA_CLASE[f.clase]}
            </p>
            <div className="mt-2 text-sm">
              <Estado fila={f} />
            </div>
            <div className="mt-2 flex items-start justify-between gap-3 text-sm">
              <Vence vence={f.vence} contexto={contexto} />
              <span className="tabular-nums">Avance: {textoAvance(f.avance)}</span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
