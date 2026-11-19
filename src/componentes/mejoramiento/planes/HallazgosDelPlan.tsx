import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { BarraDeAvance } from "@/componentes/mejoramiento/actividad/MisActividades";
import { InsigniasDelHallazgo } from "@/componentes/mejoramiento/InsigniasDelHallazgo";
import { textoDeVence } from "@/componentes/mejoramiento/ListaDeHallazgos";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { Insignia } from "@/componentes/ui/Insignia";
import { celda, TablaDatos, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import { TarjetaCifra } from "@/componentes/ui/TarjetaCifra";
import type { ContextoMejora } from "@/db/consultas/mejoramiento/config";
import type { DetalleDePlan, FilaDelPlan } from "@/db/consultas/mejoramiento/planes-lectura";
import { ETIQUETA_ORIGEN } from "@/lib/mejoramiento/origenes";
import { rutaDeAnadirAPlan, rutaDeHallazgo } from "@/lib/mejoramiento/rutas";
import { cuenta } from "@/lib/plural";
import type { AccionDelPaso } from "../pasos/Partes";
import { DialogoSacarDelPlan } from "./DialogoSacarDelPlan";

type Contexto = Pick<ContextoMejora, "ahora" | "calendario" | "zona">;

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/** «Origen distinto: …» (anexo §3.4): el hallazgo conserva su origen; la fila lo advierte. */
const origenDistinto = (f: Pick<FilaDelPlan, "origen">) => `Origen distinto: ${ETIQUETA_ORIGEN[f.origen]}`;

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

function Titulo({ f }: { f: FilaDelPlan }) {
  return (
    <>
      <span className="block break-words font-medium">{f.titulo}</span>
      <span className="mt-1 flex flex-wrap gap-1">
        <InsigniasDelHallazgo clase={f.clase} criticidad={f.criticidad} marcas={f.marcas} />
        {f.origenDistinto ? <Insignia variante="atencion">{origenDistinto(f)}</Insignia> : null}
        {f.cuenta ? null : <Insignia variante="sin-dato">{`${f.etiqueta}: ya no cuenta en el plan`}</Insignia>}
      </span>
    </>
  );
}

function EnQueVa({ f }: { f: FilaDelPlan }) {
  return (
    <span className="block">
      <span className="block font-medium">{f.etiqueta}</span>
      <span className="block text-xs text-muted-foreground">{f.turno}</span>
    </span>
  );
}

const textoAvance = (f: FilaDelPlan) => (f.avance === null ? <span aria-label="Sin avance">—</span> : <BarraDeAvance avance={f.avance} etiqueta={`Avance de ${f.codigo}`} />);

const COLUMNAS = (conSacar: boolean): readonly ColumnaTabla[] => [
  { clave: "codigo", etiqueta: "Código" },
  { clave: "hallazgo", etiqueta: "Hallazgo" },
  { clave: "va", etiqueta: "En qué va" },
  { clave: "avance", etiqueta: "Avance" },
  { clave: "vence", etiqueta: "Vence" },
  ...(conSacar ? [{ clave: "sacar", etiqueta: "Acciones", oculta: true }] : []),
];

/**
 * Las cifras y los hallazgos del plan agrupados por proceso (anexo §3.5 y §3.9, maqueta 2): una tabla por proceso desde 640 px y
 * tarjetas por debajo. Llegan ya decididos por la lectura: solo los que quien mira ve completos, y las cifras de esos mismos; los
 * anulados o rechazados que se quedaron en el plan, al final de su grupo y con su marca. «Sacar» (con motivo), a quien gestiona.
 */
export function HallazgosDelPlan({
  plan,
  contexto,
  sacar,
}: {
  plan: DetalleDePlan;
  contexto: Contexto;
  /** La acción de sacar; sin ella (o sin `puede.gestionar`) no hay botón. */
  sacar?: AccionDelPaso;
}) {
  const conSacar = plan.puede.gestionar && sacar !== undefined;
  return (
    <section aria-labelledby="hallazgos-del-plan" className="flex min-w-0 flex-col gap-4">
      <h2 id="hallazgos-del-plan" className="sr-only">
        Hallazgos del plan
      </h2>
      <div aria-label="Cifras del plan" role="group" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TarjetaCifra etiqueta="Hallazgos" valor={plan.hallazgos} />
        <TarjetaCifra etiqueta="Abiertos" valor={plan.abiertos} />
        <TarjetaCifra etiqueta="Con algo vencido" valor={plan.conAlgoVencido} estado={plan.conAlgoVencido > 0 ? "critico" : undefined} />
        <TarjetaCifra etiqueta="Avance" valor={plan.avance === null ? "—" : `${plan.avance} %`} />
      </div>
      {plan.grupos.length === 0 ? (
        <EstadoVacio
          icono={ClipboardCheck}
          titulo="Este plan aún no tiene hallazgos"
          texto={
            plan.puede.gestionar
              ? "Añada hallazgos que ya existen o registre uno nuevo dentro del plan."
              : "Cuando se añadan hallazgos al plan, aparecerán aquí agrupados por proceso."
          }
          accion={plan.puede.gestionar ? { href: rutaDeAnadirAPlan(plan.id), etiqueta: "Añadir hallazgos" } : undefined}
        />
      ) : (
        plan.grupos.map((g) => {
          const cuentan = g.filas.filter((f) => f.cuenta).length;
          const noCuentan = g.filas.length - cuentan;
          const titulo = `${g.proceso} · ${cuenta(cuentan, "hallazgo", "hallazgos")}${noCuentan > 0 ? ` · ${noCuentan} que ya no ${noCuentan === 1 ? "cuenta" : "cuentan"}` : ""}`;
          return (
            <div key={g.procesoId} className="flex min-w-0 flex-col gap-2">
              <h3 className="flex flex-wrap items-center justify-between gap-2 border-l-4 border-mod-planes pl-3 text-sm font-semibold">
                <span>{titulo}</span>
              </h3>
              <div className="hidden sm:block">
                <TablaDatos titulo={`Hallazgos de ${g.proceso}`} columnas={COLUMNAS(conSacar)} filas={g.filas.length} vacio="Sin hallazgos">
                  {g.filas.map((f) => (
                    <tr key={f.id}>
                      <td className={`${celda} whitespace-nowrap font-mono text-xs`}>
                        <Link href={rutaDeHallazgo(f.id)} className={`rounded font-medium text-marca underline-offset-2 hover:underline ${FOCO}`}>
                          {f.codigo}
                        </Link>
                      </td>
                      <td className={`${celda} min-w-64`}>
                        <Titulo f={f} />
                      </td>
                      <td className={celda}>
                        <EnQueVa f={f} />
                      </td>
                      <td className={`${celda} min-w-32`}>{textoAvance(f)}</td>
                      <td className={celda}>
                        <Vence vence={f.vence} contexto={contexto} />
                      </td>
                      {conSacar && sacar ? (
                        <td className={`${celda} text-right`}>
                          <DialogoSacarDelPlan hallazgoId={f.id} codigo={f.codigo} plan={plan.codigo} accion={sacar} lugar="tabla" />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </TablaDatos>
              </div>
              <ul aria-label={`Hallazgos de ${g.proceso}`} className="flex list-none flex-col gap-3 sm:hidden">
                {g.filas.map((f) => (
                  <li key={f.id} className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-3">
                    <Link href={rutaDeHallazgo(f.id)} className={`rounded font-mono text-xs font-medium text-marca underline-offset-2 hover:underline ${FOCO}`}>
                      {f.codigo}
                    </Link>
                    <span className="text-sm">
                      <Titulo f={f} />
                    </span>
                    <span className="text-sm">
                      <EnQueVa f={f} />
                    </span>
                    <dl className="flex flex-col gap-2 text-sm">
                      <div className="flex min-w-0 items-center gap-2">
                        <dt className="shrink-0 text-muted-foreground">Avance:</dt>
                        <dd className="min-w-0 flex-1">{textoAvance(f)}</dd>
                      </div>
                      <div className="flex min-w-0 items-start gap-2">
                        <dt className="shrink-0 text-muted-foreground">Vence:</dt>
                        <dd className="min-w-0">
                          <Vence vence={f.vence} contexto={contexto} />
                        </dd>
                      </div>
                    </dl>
                    {conSacar && sacar ? (
                      <span className="flex justify-end">
                        <DialogoSacarDelPlan hallazgoId={f.id} codigo={f.codigo} plan={plan.codigo} accion={sacar} lugar="tarjeta" />
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </section>
  );
}
