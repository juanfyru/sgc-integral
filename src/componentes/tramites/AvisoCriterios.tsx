import { LARGO_MIN_NOTA_CRITERIO } from "@/lib/tramites/tipos";

export type CriterioVisible = { texto: string; nota: string };

/** «1 criterio que no cumple» o «2 criterios que no cumplen». */
export function cuantosCriterios(n: number): string {
  return n === 1 ? "1 criterio que no cumple" : `${n} criterios que no cumplen`;
}

/** La nota de un criterio cuenta si, sin espacios, llega al mínimo (el servidor aplica la misma regla). */
export const notaSuficiente = (nota: string): boolean => nota.trim().length >= LARGO_MIN_NOTA_CRITERIO;

function Criterios({ criterios }: { criterios: CriterioVisible[] }) {
  return (
    <ul className="flex list-none flex-col gap-1.5">
      {criterios.map((c, i) => (
        <li key={i} className="flex flex-col text-sm">
          <span className="break-words font-medium">{c.texto}</span>
          <span className="whitespace-pre-wrap break-words">{c.nota ? `Nota: ${c.nota}` : "Sin nota"}</span>
        </li>
      ))}
    </ul>
  );
}

const CLASE = "flex min-w-0 flex-col gap-2 rounded-lg border border-estado-atencion bg-estado-atencion-fondo p-3 text-estado-atencion-texto";

/** Los criterios que no cumplen, para leerlos fuera de un diálogo de firma. */
export function ResumenCriterios({ criterios, titulo }: { criterios: CriterioVisible[]; titulo: string }) {
  if (criterios.length === 0) return null;
  return (
    <div role="group" aria-label={titulo} className={CLASE}>
      <p className="text-sm font-semibold">{titulo}</p>
      <Criterios criterios={criterios} />
    </div>
  );
}

/**
 * Los criterios y la casilla con que quien firma confirma haberlos visto. La casilla lleva la huella de
 * lo mostrado: si la lista cambia antes de firmar, el servidor rechaza la confirmación vieja.
 */
export function AvisoCriterios({
  criterios,
  huella,
  titulo,
  confirmacion,
}: {
  criterios: CriterioVisible[];
  huella: string;
  titulo: string;
  confirmacion: string;
}) {
  if (criterios.length === 0) return null;
  return (
    <div role="group" aria-label={titulo} className={CLASE}>
      <p className="text-sm font-semibold">{titulo}</p>
      <Criterios criterios={criterios} />
      <label className="flex items-start gap-2 text-sm font-medium">
        <input type="checkbox" name="confirmaNoCumple" value={huella} required className="mt-0.5" />
        {confirmacion}
      </label>
    </div>
  );
}
