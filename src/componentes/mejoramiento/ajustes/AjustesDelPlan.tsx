import { Insignia, type VarianteInsignia } from "@/componentes/ui/Insignia";
import type { AjusteDeDetalle } from "@/db/consultas/mejoramiento/lectura";
import { fechaDeDia } from "@/lib/mejoramiento/formato";
import { ETIQUETA_ESTADO_AJUSTE, ETIQUETA_TIPO_ACCION, fraseDelAjuste } from "@/lib/mejoramiento/textos";
import type { EstadoAjuste } from "@/lib/mejoramiento/tipos";
import { fechaEnZona } from "@/lib/tramites/plazos";

const VARIANTE: Record<EstadoAjuste, VarianteInsignia> = { pendiente: "atencion", aprobado: "bien", negado: "sin-dato" };

/** La frase de lo que pide un ajuste, con las etiquetas de la página («A1.2», «A1») y las fechas que guardó. */
export function fraseDeAjusteDeDetalle(
  x: Pick<AjusteDeDetalle, "tipo" | "actividadId" | "cambio">,
  etiquetas: Readonly<Record<number, string>>,
  acciones: Readonly<Record<number, string>>,
): string {
  const c = x.cambio;
  return fraseDelAjuste({
    tipo: x.tipo,
    // En uno que añade, la actividad que creó al aprobarse no es lo que se pidió: la frase nombra la acción.
    actividad: x.tipo !== "agregar" && x.actividadId !== null ? (etiquetas[x.actividadId] ?? null) : null,
    ...(c?.tipo === "reprogramar" ? { finAntes: c.finAntes, finNuevo: c.finNuevo } : {}),
    ...(c?.tipo === "agregar"
      ? { finNuevo: c.fin, accionNueva: c.accion !== null, accion: c.accionId !== null ? (acciones[c.accionId] ?? null) : null }
      : {}),
  });
}

/** «1», «1 y 2», «1, 2 y 3». */
const enumerar = (n: readonly number[]) => (n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}`);

/**
 * Lo que añade un ajuste, en líneas, para quien lo decide y para la lista: la acción nueva (su tipo, su descripción y las causas
 * que ataca, por su número, `causas`: id → número) y la actividad (su descripción, su responsable y sus fechas). Vacío en los
 * demás tipos.
 */
export function lineasDeLoQueSeAnade(
  x: Pick<AjusteDeDetalle, "cambio" | "responsableNuevo">,
  causas: Readonly<Record<number, number>>,
): string[] {
  const c = x.cambio;
  if (c?.tipo !== "agregar") return [];
  const lineas: string[] = [];
  if (c.accion) {
    const numeros = c.accion.causaIds.flatMap((id) => (causas[id] === undefined ? [] : [causas[id]])).sort((a, b) => a - b);
    const ataca = numeros.length === 1 ? ` · ataca la causa ${numeros[0]}` : numeros.length > 1 ? ` · ataca las causas ${enumerar(numeros)}` : "";
    lineas.push(`Acción nueva: ${ETIQUETA_TIPO_ACCION[c.accion.tipo] ?? c.accion.tipo} · «${c.accion.descripcion}»${ataca}`);
  }
  lineas.push(`Actividad: «${c.descripcion}» · responsable: ${x.responsableNuevo ?? "—"} · del ${fechaDeDia(c.inicio)} al ${fechaDeDia(c.fin)}`);
  return lineas;
}

/**
 * «Ajustes del plan» de una ronda (spec 15 §10.6 y §16.2): cada ajuste pedido, del más antiguo al más reciente, con lo que pidió,
 * por qué, quién y cuándo, su estado en texto y, decidido, quién, cuándo, la nota y el acta. El plan congelado no cambia: el
 * ajuste es un registro aparte, con su antes y su después. Uno que añade dice la acción nueva y la actividad
 * (`lineasDeLoQueSeAnade`). `children` es lo que la página ofrece arriba («Pedir un ajuste»).
 */
export function AjustesDelPlan({
  ajustes,
  etiquetas,
  acciones,
  causas = {},
  zona,
  titulo = "Ajustes del plan",
  children,
}: {
  ajustes: readonly AjusteDeDetalle[];
  /** Las actividades por su id («A1.2») y las acciones por el suyo («A1»). */
  etiquetas: Readonly<Record<number, string>>;
  acciones: Readonly<Record<number, string>>;
  /** Las causas de la ronda por su id: su número («la causa 2»). */
  causas?: Readonly<Record<number, number>>;
  zona: string;
  titulo?: string;
  children?: React.ReactNode;
}) {
  const dia = (d: Date) => fechaDeDia(fechaEnZona(d, zona));
  const id = `ajustes-${titulo.replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="font-display text-base font-semibold">
          {titulo}
        </h2>
        {children}
      </div>
      {ajustes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no se ha pedido ningún ajuste.</p>
      ) : (
        <ol className="flex list-none flex-col gap-3">
          {ajustes.map((x) => {
            const lineas = lineasDeLoQueSeAnade(x, causas);
            return (
              <li key={x.id} className="flex min-w-0 flex-col gap-1 border-l-2 border-mod-planes pl-3 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="break-words font-medium">{fraseDeAjusteDeDetalle(x, etiquetas, acciones)}</span>
                  <Insignia variante={VARIANTE[x.estado] ?? "sin-dato"}>{ETIQUETA_ESTADO_AJUSTE[x.estado] ?? x.estado}</Insignia>
                </p>
                {lineas.map((linea) => (
                  <p key={linea} className="break-words">
                    {linea}
                  </p>
                ))}
                {x.cambio === null ? <p className="text-muted-foreground">Lo que pidió no se puede leer.</p> : null}
                <p className="whitespace-pre-line break-words">{`Causa: ${x.causa}`}</p>
                <p className="text-xs text-muted-foreground">{`Lo pidió ${x.pedidoPor} el ${dia(x.pedidoEn)}`}</p>
                {x.decididoEn && x.decididoPor ? (
                  <p className="text-xs text-muted-foreground">
                    {`${x.estado === "aprobado" ? "Lo aprobó" : "Lo negó"} ${x.decididoPor} el ${dia(x.decididoEn)}`}
                  </p>
                ) : null}
                {x.nota ? <p className="whitespace-pre-line break-words">{`Nota: ${x.nota}`}</p> : null}
                {x.acta ? <p>{`Acta del Comité: ${x.acta.numero}, del ${fechaDeDia(x.acta.fecha)}`}</p> : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
