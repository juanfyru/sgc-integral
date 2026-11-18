import Link from "next/link";
import type { EnlaceDelHallazgo } from "@/db/consultas/mejoramiento/lectura";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/** Lo que se dice de un enlace que la persona no puede ver (spec §6.3, F15-DC5): solo su clase, sin código, nombre ni ruta. */
const OCULTO = { indicador: "un indicador", documento: "un documento restringido", norma: "una norma" } as const;

/**
 * «Enlaces» de la columna derecha (spec 15 §16.2, maqueta 2): el hallazgo del que reincide, el de origen y los derivados, los
 * documentos, la norma y los indicadores. Cada uno llega ya decidido por la lectura: con su código, su nombre y su enlace solo a
 * quien puede verlo; a los demás, «un indicador» o «un documento restringido», sin enlace. Sin enlaces, no aparece.
 */
export function EnlacesDelHallazgo({ enlaces }: { enlaces: readonly EnlaceDelHallazgo[] }) {
  if (enlaces.length === 0) return null;
  return (
    <section aria-labelledby="enlaces-hallazgo" className="rounded-lg border border-border bg-card p-4">
      <h2 id="enlaces-hallazgo" className="font-display text-base font-semibold">
        Enlaces
      </h2>
      <ul className="mt-2 flex list-none flex-col gap-2">
        {enlaces.map((e, i) => (
          <li key={i} className="min-w-0 text-sm">
            <span className="block text-xs font-medium text-muted-foreground">{e.rotulo}</span>
            {e.visible ? (
              <span className="block break-words">
                <Link href={e.href} className={`rounded-sm font-medium text-marca underline-offset-2 hover:underline ${FOCO}`}>
                  {e.codigo ?? e.nombre}
                </Link>
                {e.codigo ? ` ${e.nombre}` : null}
              </span>
            ) : (
              <span className="block">{OCULTO[e.clase]}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
