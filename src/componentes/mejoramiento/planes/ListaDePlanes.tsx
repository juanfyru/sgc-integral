import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { BarraDeAvance } from "@/componentes/mejoramiento/actividad/MisActividades";
import { textoDeVence } from "@/componentes/mejoramiento/ListaDeHallazgos";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { Insignia, type VarianteInsignia } from "@/componentes/ui/Insignia";
import { celda, TablaDatos, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import type { ContextoMejora } from "@/db/consultas/mejoramiento/config";
import type { PlanDeLaLista } from "@/db/consultas/mejoramiento/planes-lectura";
import { fechaDeDia, fechaLargaDeDia } from "@/lib/mejoramiento/formato";
import { ETIQUETA_ORIGEN } from "@/lib/mejoramiento/origenes";
import { ETIQUETA_ESTADO_PLAN, type EstadoDePlan } from "@/lib/mejoramiento/planes";
import { rutaDePlan } from "@/lib/mejoramiento/rutas";
import { finDeFecha } from "@/lib/tramites/plazos";

type Contexto = Pick<ContextoMejora, "ahora" | "calendario" | "zona">;

const COLUMNAS: readonly ColumnaTabla[] = [
  { clave: "codigo", etiqueta: "Código" },
  { clave: "plan", etiqueta: "Plan" },
  { clave: "origen", etiqueta: "Origen" },
  { clave: "vigencia", etiqueta: "Vigencia", numerica: true },
  { clave: "hallazgos", etiqueta: "Hallazgos" },
  { clave: "avance", etiqueta: "Avance" },
  { clave: "ente", etiqueta: "Fecha del ente" },
  { clave: "estado", etiqueta: "Estado" },
];

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/** El estado de un plan con su palabra (el color nunca es la única señal). */
const VARIANTE_ESTADO: Readonly<Record<EstadoDePlan, VarianteInsignia>> = {
  abierto: "modulo",
  sin_hallazgos: "neutra",
  cerrado: "bien",
  anulado: "sin-dato",
};

export function InsigniaEstadoPlan({ estado }: { estado: EstadoDePlan }) {
  return (
    <Insignia variante={VARIANTE_ESTADO[estado]} modulo={estado === "abierto" ? "planes" : undefined}>
      {ETIQUETA_ESTADO_PLAN[estado]}
    </Insignia>
  );
}

/** «5 abiertos de 6», con «1 con algo vencido» debajo; sin ninguno que cuente, «Sin hallazgos». */
function Hallazgos({ p }: { p: PlanDeLaLista }) {
  if (p.hallazgos === 0) return <span className="text-muted-foreground">Sin hallazgos</span>;
  return (
    <span className="block">
      <span className="block">{`${p.abiertos} ${p.abiertos === 1 ? "abierto" : "abiertos"} de ${p.hallazgos}`}</span>
      {p.conAlgoVencido > 0 ? (
        <span className="block text-xs font-semibold text-estado-critico-texto">{`${p.conAlgoVencido} con algo vencido`}</span>
      ) : null}
    </span>
  );
}

function Avance({ p }: { p: PlanDeLaLista }) {
  if (p.avance === null) return <span aria-label="Sin avance">—</span>;
  return <BarraDeAvance avance={p.avance} etiqueta={`Avance de ${p.codigo}`} />;
}

/** La fecha límite del ente y, mientras el plan está abierto, cuánto falta (en días hábiles) o desde cuándo venció. */
function FechaDelEnte({ p, contexto }: { p: PlanDeLaLista; contexto: Contexto }) {
  if (!p.fechaLimiteEnte) return <span aria-label="Sin fecha del ente">—</span>;
  const plazo = p.estado === "abierto" ? textoDeVence(finDeFecha(p.fechaLimiteEnte, contexto.zona), contexto) : null;
  return (
    <span className="block">
      <span className="block tabular-nums">{fechaDeDia(p.fechaLimiteEnte)}</span>
      {plazo ? (
        <span className={`block text-xs ${plazo.vencida ? "font-semibold text-estado-critico-texto" : "text-muted-foreground"}`}>{plazo.plazo}</span>
      ) : null}
    </span>
  );
}

/**
 * La pestaña «Planes» (anexo §3.9, maqueta 1): una tabla desde 640 px y tarjetas por debajo. Las cifras, el avance y el estado de
 * cada plan son los de los hallazgos que ve quien mira; el estado siempre lleva su palabra.
 */
export function ListaDePlanes({ planes, contexto, conFiltros }: { planes: readonly PlanDeLaLista[]; contexto: Contexto; conFiltros?: boolean }) {
  if (planes.length === 0) {
    return (
      <EstadoVacio
        icono={FolderKanban}
        titulo={conFiltros ? "Ningún plan coincide con los filtros" : "Aún no hay planes a la vista"}
        texto={
          conFiltros
            ? "Pruebe con otra búsqueda o quite los filtros."
            : "Cuando un plan de mejoramiento agrupe hallazgos que usted pueda ver, aparecerá aquí con su avance."
        }
      />
    );
  }
  return (
    <>
      <div className="hidden sm:block">
        <TablaDatos titulo="Planes de mejoramiento" columnas={COLUMNAS} filas={planes.length} vacio="Sin planes">
          {planes.map((p) => (
            <tr key={p.id}>
              <td className={`${celda} whitespace-nowrap font-mono text-xs`}>
                <Link href={rutaDePlan(p.id)} className={`rounded font-medium text-marca underline-offset-2 hover:underline ${FOCO}`}>
                  {p.codigo}
                </Link>
              </td>
              <td className={`${celda} min-w-64`}>
                <span className="block font-medium">{p.nombre}</span>
                <span className="block text-xs text-muted-foreground">{`Evento: ${fechaLargaDeDia(p.fechaEvento)}`}</span>
              </td>
              <td className={celda}>{ETIQUETA_ORIGEN[p.origen]}</td>
              <td className={`${celda} text-right tabular-nums`}>{p.vigencia}</td>
              <td className={celda}>
                <Hallazgos p={p} />
              </td>
              <td className={`${celda} min-w-32`}>
                <Avance p={p} />
              </td>
              <td className={celda}>
                <FechaDelEnte p={p} contexto={contexto} />
              </td>
              <td className={`${celda} whitespace-nowrap`}>
                <InsigniaEstadoPlan estado={p.estado} />
              </td>
            </tr>
          ))}
        </TablaDatos>
      </div>

      <ul aria-label="Planes de mejoramiento" className="flex list-none flex-col gap-3 sm:hidden">
        {planes.map((p) => (
          <li key={p.id} className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-3">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <Link href={rutaDePlan(p.id)} className={`rounded font-mono text-xs font-medium text-marca underline-offset-2 hover:underline ${FOCO}`}>
                {p.codigo}
              </Link>
              <InsigniaEstadoPlan estado={p.estado} />
            </span>
            <span className="break-words text-sm font-medium">{p.nombre}</span>
            <span className="text-xs text-muted-foreground">{`${ETIQUETA_ORIGEN[p.origen]} · vigencia ${p.vigencia} · evento: ${fechaLargaDeDia(p.fechaEvento)}`}</span>
            <span className="text-sm">
              <Hallazgos p={p} />
            </span>
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <dt className="shrink-0 text-muted-foreground">Avance:</dt>
                <dd className="min-w-0 flex-1">
                  <Avance p={p} />
                </dd>
              </div>
              {p.fechaLimiteEnte ? (
                <div className="flex min-w-0 items-start gap-2">
                  <dt className="shrink-0 text-muted-foreground">Fecha del ente:</dt>
                  <dd className="min-w-0">
                    <FechaDelEnte p={p} contexto={contexto} />
                  </dd>
                </div>
              ) : null}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
