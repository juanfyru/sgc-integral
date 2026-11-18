import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Insignia, type VarianteInsignia } from "@/componentes/ui/Insignia";
import type { AccionDeDetalle, RondaDeDetalle } from "@/db/consultas/mejoramiento/lectura";
import { ETIQUETA_PERIODICIDAD, type Periodicidad } from "@/lib/indicadores/tipos";
import { leerCriterios } from "@/lib/mejoramiento/eficacia";
import { fechaDeDia, fechaLargaDeDia, vencidaHace } from "@/lib/mejoramiento/formato";
import { rutaDeActividad } from "@/lib/mejoramiento/rutas";
import { ETIQUETA_CRITERIO, ETIQUETA_ESTADO_ACTIVIDAD, ETIQUETA_TIPO_ACCION } from "@/lib/mejoramiento/textos";
import { estaAbierta, type EstadoActividad, type TipoAccion } from "@/lib/mejoramiento/tipos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";

/** El indicador enlazado tal como lo puede leer quien mira: con su nombre solo si lo ve (`puedeVerIndicador`). */
export type IndicadorEnLectura = { visible: true; codigo: string; nombre: string; periodicidad: Periodicidad } | { visible: false } | null;

const ESTADO_PLAN: Record<string, string> = { borrador: "En borrador", enviado: "Enviado", aprobado: "Aprobado" };

const VARIANTE_ACTIVIDAD: Record<EstadoActividad, VarianteInsignia> = {
  abierta: "neutra",
  en_proceso: "modulo",
  terminada: "bien",
  cancelada: "sin-dato",
};

type Actividad = AccionDeDetalle["actividades"][number];

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/** Sin terminar ni cancelar, de un plan aprobado: la que todavía necesita a su responsable. */
const pendiente = (a: Actividad) => a.finOriginal !== null && estaAbierta(a.estado);

/** El estado, siempre con texto; «Vencida hace N días» (spec §10.2) solo con el plan aprobado y sin terminar ni cancelar. */
function EstadoDeActividad({ a, hoy }: { a: Actividad; hoy: string }) {
  const estado = a.estado as EstadoActividad;
  const vencida = pendiente(a) && a.fin < hoy;
  if (vencida) return <Insignia variante="critico">{vencidaHace(a.fin, hoy)}</Insignia>;
  return (
    <Insignia variante={VARIANTE_ACTIVIDAD[estado] ?? "sin-dato"} modulo="planes">
      {ETIQUETA_ESTADO_ACTIVIDAD[estado] ?? a.estado}
    </Insignia>
  );
}

/** El ajuste por decidir de la actividad (spec §10.6), como lo dice la maqueta 2: «Pidió ajuste al 28 nov · por decidir». */
function textoDelAjustePendiente(ajuste: RondaDeDetalle["ajustes"][number] | undefined): string | null {
  if (!ajuste) return null;
  if (ajuste.cambio?.tipo === "reprogramar") return `Pidió ajuste al ${fechaDeDia(ajuste.cambio.finNuevo)} · por decidir`;
  if (ajuste.tipo === "cancelar") return "Pidió cancelarla · por decidir";
  return "Ajuste por decidir";
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-0.5 break-words text-sm">{children}</dd>
    </div>
  );
}

function detallesDeAccion(a: AccionDeDetalle, ordenDeCausa: Map<number, number>): string {
  const causas = a.causaIds.map((id) => ordenDeCausa.get(id)).filter((n): n is number => n !== undefined).sort((x, y) => x - y);
  return [
    causas.length === 1 ? `Ataca la causa ${causas[0]}` : causas.length > 1 ? `Ataca las causas ${causas.join(", ")}` : null,
    a.recursos ? `recursos: ${a.recursos}` : null,
    a.indicadorCumplimiento ? `indicador de cumplimiento: ${a.indicadorCumplimiento}` : null,
    a.meta ? `meta: ${a.meta}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function textoDelCriterio(ronda: RondaDeDetalle, indicador: IndicadorEnLectura): string | null {
  const criterios = leerCriterios(ronda.criterios);
  if (criterios.length === 0) return null;
  return criterios
    .map((c) => {
      if (c === "mejora_indicador") {
        if (indicador === null) return "mejora del indicador asociado (sin elegir)";
        return indicador.visible
          ? `mejora del indicador ${indicador.codigo} «${indicador.nombre}» (${ETIQUETA_PERIODICIDAD[indicador.periodicidad].toLowerCase()})`
          : "mejora de un indicador";
      }
      if (c === "otro") return ronda.criterioOtro ? `otro: ${ronda.criterioOtro}` : "otro";
      return ETIQUETA_CRITERIO[c].toLowerCase();
    })
    .join(", ");
}

/**
 * «4. Plan de acción» de la página del hallazgo (spec 15 §10 y §16.2, maqueta 2), solo lectura: cada acción con su tipo, las
 * causas que ataca y sus datos, y debajo sus actividades con el responsable, el fin, el avance y el estado (siempre con
 * texto). Al final, el criterio de eficacia; el indicador enlazado se nombra solo a quien lo ve. Plegable: abierta mientras
 * es la etapa en curso. Se lee en texto también por quien solo es responsable de una actividad. Cada actividad enlaza a su
 * página solo si quien mira la abre (`seAbre`); la de un responsable inactivo lo dice con texto, y `deActividad` añade lo que
 * la página ofrece en esa actividad (reasignarla, escalarla). Bajo el estado de cada una, la escalada a Gerencia y el ajuste por
 * decidir (spec §10.6 y §10.7).
 */
export function PlanEnLectura({
  ronda,
  titulo = "4. Plan de acción",
  abierta,
  indicador,
  evaluableDesde,
  hoy,
  deActividad,
}: {
  ronda: RondaDeDetalle;
  titulo?: string;
  abierta: boolean;
  indicador: IndicadorEnLectura;
  /** Con el plan sin aprobar: desde cuándo se podría evaluar con las fechas planeadas. */
  evaluableDesde?: string | null;
  hoy: string;
  /** Lo que la página pone bajo una actividad (p. ej. «Reasignar»), o nada. */
  deActividad?: (actividad: Actividad) => React.ReactNode;
}) {
  const ordenDeCausa = new Map(ronda.causas.map((c) => [c.id, c.orden]));
  const actividades = ronda.acciones.reduce((n, a) => n + a.actividades.length, 0);
  const resumen =
    ronda.acciones.length === 0
      ? "Sin acciones"
      : `${ronda.acciones.length} ${ronda.acciones.length === 1 ? "acción" : "acciones"} · ${actividades} ${actividades === 1 ? "actividad" : "actividades"}`;
  const criterio = textoDelCriterio(ronda, indicador);
  const zona = zonaHoraria();
  const pendientes = new Map(ronda.ajustes.filter((x) => x.estado === "pendiente" && x.actividadId !== null).map((x) => [x.actividadId, x]));
  return (
    <details open={abierta} className="group rounded-lg border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-lg px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca">
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-display text-base font-semibold">{titulo}</span>
            <Insignia variante="modulo" modulo="planes">
              {ESTADO_PLAN[ronda.estadoPlan] ?? ronda.estadoPlan}
            </Insignia>
          </span>
          <span className="block break-words text-sm text-muted-foreground">{resumen}</span>
        </span>
        <ChevronDown aria-hidden="true" className="mt-1 size-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-4 border-t border-linea-suave px-4 py-3">
        {ronda.acciones.length === 0 ? <p className="text-sm text-muted-foreground">Aún no hay acciones en el plan.</p> : null}
        {ronda.acciones.map((a) => {
          const detalles = detallesDeAccion(a, ordenDeCausa);
          return (
            <section key={a.id} aria-label={`Acción A${a.orden}`} className="flex min-w-0 flex-col gap-2">
              <h3 className="break-words text-sm">
                <span className="font-semibold">{`A${a.orden} · ${ETIQUETA_TIPO_ACCION[a.tipo as TipoAccion] ?? a.tipo}.`}</span> {a.descripcion}
              </h3>
              {detalles ? <p className="break-words text-xs text-muted-foreground">{detalles}</p> : null}
              {typeof a.avance === "number" ? <p className="text-xs text-muted-foreground">{`Avance de la acción: ${a.avance} %`}</p> : null}
              <ul className="flex list-none flex-col gap-2">
                {a.actividades.map((x) => (
                  <li key={x.id} className="flex min-w-0 flex-col gap-2 rounded-md border border-linea-suave p-3">
                    <p className="break-words text-sm">
                      <span className="font-medium">{`A${a.orden}.${x.orden}`}</span>{" "}
                      {x.seAbre ? (
                        <Link href={rutaDeActividad(x.id)} className={`rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`}>
                          {x.descripcion}
                        </Link>
                      ) : (
                        x.descripcion
                      )}
                    </p>
                    <dl className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
                      <Dato etiqueta="Responsable">
                        {x.responsable}
                        {!x.responsableActivo && pendiente(x) ? (
                          <span className="mt-1 block">
                            <Insignia variante="atencion">Responsable inactivo</Insignia>
                          </span>
                        ) : null}
                      </Dato>
                      <Dato etiqueta="Fin">
                        {fechaDeDia(x.fin)}
                        {x.finOriginal && x.finOriginal !== x.fin ? (
                          <span className="block text-xs text-muted-foreground">{`original: ${fechaDeDia(x.finOriginal)}`}</span>
                        ) : null}
                      </Dato>
                      <Dato etiqueta="Avance">
                        {/* Antes de aprobarse el plan, la actividad no ha empezado: «—», como en la lista. */}
                        {x.finOriginal === null ? (
                          <span>—</span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <span aria-hidden="true" className="h-1.5 w-full max-w-24 overflow-hidden rounded-full bg-muted">
                              <span className="block h-full rounded-full bg-mod-planes" style={{ width: `${Math.max(0, Math.min(100, x.avance))}%` }} />
                            </span>
                            <span>{`${x.avance} %`}</span>
                          </span>
                        )}
                      </Dato>
                      <Dato etiqueta="Estado">
                        <EstadoDeActividad a={x} hoy={hoy} />
                        {x.gerenciaEn ? (
                          <span className="mt-1 block text-xs">{`Escalada a Gerencia el ${fechaDeDia(fechaEnZona(x.gerenciaEn, zona))}`}</span>
                        ) : null}
                        {pendientes.has(x.id) ? (
                          <span className="mt-1 block text-xs text-muted-foreground">{textoDelAjustePendiente(pendientes.get(x.id))}</span>
                        ) : null}
                      </Dato>
                    </dl>
                    {deActividad?.(x) ?? null}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {criterio || ronda.fechaEvaluacion || evaluableDesde ? (
          <dl className="grid gap-3 border-t border-linea-suave pt-3 sm:grid-cols-2">
            {criterio ? <Dato etiqueta="Criterio de eficacia">{criterio}</Dato> : null}
            {ronda.fechaEvaluacion ? <Dato etiqueta="Fecha de evaluación">{fechaDeDia(ronda.fechaEvaluacion)}</Dato> : null}
            {evaluableDesde ? <Dato etiqueta="Con este plan, la eficacia se podría evaluar desde">{fechaLargaDeDia(evaluableDesde)}</Dato> : null}
          </dl>
        ) : null}
      </div>
    </details>
  );
}

/** Lo que le falta al plan para enviarse (spec §8.6), en frases; sin faltas, lo dice. El envío llega con las firmas. */
export function FaltasDelPlan({ faltas }: { faltas: readonly string[] }) {
  return (
    <section aria-labelledby="faltas-titulo" className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <h3 id="faltas-titulo" className="font-display text-base font-semibold">
        Para enviar a revisión
      </h3>
      {faltas.length === 0 ? (
        <p className="text-sm">El análisis y el plan tienen todo lo que se pide para enviarse.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{faltas.length === 1 ? "Falta esto:" : `Faltan ${faltas.length} cosas:`}</p>
          <ul className="list-disc pl-5 text-sm">
            {faltas.map((f) => (
              <li key={f} className="break-words">
                {f}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
