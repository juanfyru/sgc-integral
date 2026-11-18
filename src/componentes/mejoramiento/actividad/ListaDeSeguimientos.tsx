import type { SeguimientoDeActividad } from "@/db/consultas/mejoramiento/actividades";
import { fechaDeDia } from "@/lib/mejoramiento/formato";

/**
 * Los seguimientos de una actividad (spec 15 §10.3, maqueta 6), del más reciente al más antiguo: la fecha, quién, lo que se
 * hizo, el avance y las barreras. De solo inserción: uno equivocado se corrige con otro.
 */
export function ListaDeSeguimientos({ seguimientos }: { seguimientos: ReadonlyArray<Omit<SeguimientoDeActividad, "creadoEn">> }) {
  if (seguimientos.length === 0) return <p className="text-sm text-muted-foreground">Aún no hay seguimientos.</p>;
  return (
    <ol className="flex list-none flex-col gap-3">
      {seguimientos.map((s) => (
        <li key={s.id} className="flex min-w-0 flex-col gap-1 border-l-2 border-mod-planes pl-3 text-sm">
          <span className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="font-medium">
              <time dateTime={s.fecha}>{fechaDeDia(s.fecha)}</time>
              <span className="font-normal text-muted-foreground">{` · ${s.quien}`}</span>
            </span>
            <span className="font-medium">{`${s.avance} %`}</span>
          </span>
          <span className="whitespace-pre-line break-words">{s.realizado}</span>
          {s.barreras ? <span className="whitespace-pre-line break-words text-muted-foreground">{`Barreras: ${s.barreras}`}</span> : null}
        </li>
      ))}
    </ol>
  );
}
