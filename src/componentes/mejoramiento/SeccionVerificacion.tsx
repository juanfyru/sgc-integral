import { ChevronDown } from "lucide-react";
import { Insignia } from "@/componentes/ui/Insignia";
import type { EvaluacionDeRonda, RondaDeDetalle } from "@/db/consultas/mejoramiento/lectura";
import { fechaDeDia, fechaLargaDeDia, fechaYHora } from "@/lib/mejoramiento/formato";
import { ETIQUETA_CRITERIO, ETIQUETA_METODO_VERIFICACION } from "@/lib/mejoramiento/textos";
import { TablaDelIndicador } from "./pasos/Partes";

const RESUMEN = "flex cursor-pointer list-none items-start justify-between gap-3 rounded-lg px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-0.5 whitespace-pre-line break-words text-sm">{children}</dd>
    </div>
  );
}

/** Una lista en palabras, en minúscula después de la primera: «Revisión de evidencias, observación en sitio». */
function enPalabras(textos: readonly string[]): string {
  return textos.map((t, i) => (i === 0 ? t : t.charAt(0).toLowerCase() + t.slice(1))).join(", ");
}

/** Una sección plegable de la página del hallazgo, con su resumen de una línea (maqueta 2). */
function Plegable({ titulo, resumen, abierta, children }: { titulo: string; resumen: string; abierta: boolean; children: React.ReactNode }) {
  return (
    <details open={abierta} className="group rounded-lg border border-border bg-card">
      <summary className={RESUMEN}>
        <span className="min-w-0">
          <span className="block font-display text-base font-semibold">{titulo}</span>
          <span className="block break-words text-sm text-muted-foreground">{resumen}</span>
        </span>
        <ChevronDown aria-hidden="true" className="mt-1 size-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-4 border-t border-linea-suave px-4 py-3">{children}</div>
    </details>
  );
}

/**
 * «5. Seguimiento y verificación» (SGC-FO-AC-01 sección 5; spec 15 §10.3 y §11.4, PC-08): el avance de las actividades de la ronda
 * (los seguimientos de cada una están en su página, enlazada desde el plan) y lo que decidió quien verificó la implementación:
 * cada actividad conforme o devuelta (con su nota a quien ve el hallazgo completo y su fecha para corregir), cómo se verificó,
 * quién y cuándo. Los archivos de la verificación llegan como hijos.
 */
export function SeccionVerificacion({
  ronda,
  titulo = "5. Seguimiento y verificación",
  abierta,
  zona,
  children,
}: {
  ronda: RondaDeDetalle;
  titulo?: string;
  abierta: boolean;
  zona: string;
  children?: React.ReactNode;
}) {
  const actividades = ronda.acciones.flatMap((a) =>
    a.actividades.filter((x) => x.finOriginal !== null && x.estado !== "cancelada").map((x) => ({ ...x, etiqueta: `A${a.orden}.${x.orden}` })),
  );
  const terminadas = actividades.filter((x) => x.estado === "terminada").length;
  const devueltas = actividades.filter((x) => x.verificacion === "devuelta");
  // El de la ronda: el promedio de los avances de sus acciones (`avanceDeHallazgo`, que ya calculó la lectura por acción).
  const porAccion = ronda.acciones.flatMap((a) => (typeof a.avance === "number" ? [a.avance] : []));
  const avance = porAccion.length === 0 ? null : Math.round(porAccion.reduce((x, y) => x + y, 0) / porAccion.length);
  const v = ronda.verificacion;
  const resumen = v
    ? `Verificó ${v.por}, ${fechaYHora(v.en, zona)} · todas conformes`
    : [
        avance === null ? null : `Avance ${avance} %`,
        `${terminadas} de ${actividades.length} ${actividades.length === 1 ? "actividad terminada" : "actividades terminadas"}`,
        devueltas.length === 0 ? null : `${devueltas.length} ${devueltas.length === 1 ? "devuelta" : "devueltas"} en la verificación`,
      ]
        .filter(Boolean)
        .join(" · ");
  const verificadas = actividades.filter((x) => x.verificacion !== null);
  return (
    <Plegable titulo={titulo} resumen={resumen} abierta={abierta}>
      <p className="text-sm text-muted-foreground">Los seguimientos de cada actividad están en su página, enlazada desde el plan.</p>
      {verificadas.length > 0 ? (
        <ul className="flex list-none flex-col gap-2">
          {verificadas.map((x) => (
            <li key={x.id} className="flex min-w-0 flex-col gap-1 rounded-md border border-linea-suave p-3 text-sm">
              <span className="flex flex-wrap items-center gap-2">
                <span className="break-words">
                  <span className="font-semibold">{x.etiqueta}</span> {x.descripcion}
                </span>
                <Insignia variante={x.verificacion === "conforme" ? "bien" : "atencion"}>{x.verificacion === "conforme" ? "Conforme" : "Devuelta"}</Insignia>
              </span>
              {x.verificacion === "devuelta" && x.verificacionNota ? (
                <span className="whitespace-pre-line break-words">{x.verificacionNota}</span>
              ) : null}
              {x.verificacion === "devuelta" && x.corregirAntesDe ? (
                <span className="text-xs text-muted-foreground">{`Corregir a más tardar el ${fechaLargaDeDia(x.corregirAntesDe)}`}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {v ? (
        <dl className="grid gap-3 sm:grid-cols-2">
          <Dato etiqueta="Cómo se verificó">{enPalabras(v.metodos.map((m) => ETIQUETA_METODO_VERIFICACION[m]))}</Dato>
          <Dato etiqueta="Verificó">{`${v.por}, ${fechaYHora(v.en, zona)}`}</Dato>
          {v.nota ? (
            <div className="sm:col-span-2">
              <Dato etiqueta="Nota de la verificación">{v.nota}</Dato>
            </div>
          ) : null}
        </dl>
      ) : null}
      {children}
    </Plegable>
  );
}

/**
 * «6. Verificación de eficacia» (SGC-FO-AC-01 sección 6; spec 15 §11.4, PC-09). En la espera, desde cuándo se puede registrar
 * «eficaz»; evaluada, el resultado (con texto), los criterios, el periodo, quién y cuándo y, a quien ve el hallazgo completo, la
 * justificación y lo que la pantalla mostró al evaluar (congelado): el indicador ya llega decidido por la lectura («un
 * indicador», sin código ni cifras, a quien no lo ve) y cada periodo dice «antes», «durante» o «después».
 */
export function SeccionEficacia({
  evaluacion: e,
  evaluableDesde,
  titulo = "6. Verificación de eficacia",
  abierta,
  zona,
  children,
}: {
  evaluacion: EvaluacionDeRonda | null;
  /** En la espera, desde qué día se puede registrar «eficaz». */
  evaluableDesde: string | null;
  titulo?: string;
  abierta: boolean;
  zona: string;
  children?: React.ReactNode;
}) {
  if (!e) {
    return (
      <Plegable
        titulo={titulo}
        resumen={evaluableDesde ? `«Eficaz» se puede registrar desde el ${fechaLargaDeDia(evaluableDesde)}` : "En espera de eficacia"}
        abierta={abierta}
      >
        <p className="text-sm">
          {evaluableDesde
            ? `Se espera a que el plan muestre su efecto: «Eficaz» se puede registrar desde el ${fechaLargaDeDia(evaluableDesde)}; «No eficaz», en cualquier momento de la espera.`
            : "Se espera a que el plan muestre su efecto."}
        </p>
        {children}
      </Plegable>
    );
  }
  const eficaz = e.resultado === "eficaz";
  const v = e.visto;
  return (
    <Plegable titulo={titulo} resumen={`${eficaz ? "Eficaz" : "No eficaz"} · ${e.por}, ${fechaYHora(e.en, zona)}`} abierta={abierta}>
      <dl className="grid gap-3 sm:grid-cols-2">
        <Dato etiqueta="Resultado">
          <Insignia variante={eficaz ? "bien" : "critico"}>{eficaz ? "Eficaz" : "No eficaz"}</Insignia>
        </Dato>
        <Dato etiqueta="Verificó">{`${e.por}, ${fechaYHora(e.en, zona)}`}</Dato>
        <Dato etiqueta="Criterios evaluados">{enPalabras(e.criterios.map((c) => ETIQUETA_CRITERIO[c])) || "—"}</Dato>
        {e.desde && e.hasta ? <Dato etiqueta="Periodo evaluado">{`${fechaDeDia(e.desde)} a ${fechaDeDia(e.hasta)}`}</Dato> : null}
        {e.justificacion ? (
          <div className="sm:col-span-2">
            <Dato etiqueta="Justificación">{e.justificacion}</Dato>
          </div>
        ) : null}
      </dl>
      {v ? (
        <section className="flex min-w-0 flex-col gap-2 border-t border-linea-suave pt-3">
          <h3 className="text-sm font-semibold">Lo que se mostró al evaluar</h3>
          <p className="text-sm text-muted-foreground">{`La última actividad terminó el ${fechaLargaDeDia(v.r)}; «Eficaz» se podía registrar desde el ${fechaLargaDeDia(v.minima)}.`}</p>
          {v.indicador === null ? null : v.indicador.visible ? (
            <TablaDelIndicador codigo={v.indicador.codigo} nombre={v.indicador.nombre} filas={v.indicador.filas} />
          ) : (
            <p className="text-sm">El plan enlazó un indicador: sus resultados no se muestran a quien no lo ve.</p>
          )}
          {v.ocurrencias.length === 0 ? (
            <p className="text-sm">Sin ocurrencias desde que terminó el plan.</p>
          ) : (
            <ul className="flex list-none flex-col gap-1 text-sm">
              {v.ocurrencias.map((o, i) => (
                <li key={i} className="break-words border-l-2 border-mod-planes pl-3">
                  <span className="font-medium">{fechaDeDia(o.fecha)}:</span> {o.descripcion}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      {children}
    </Plegable>
  );
}
