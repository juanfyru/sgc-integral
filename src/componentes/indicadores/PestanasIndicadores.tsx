import Link from "next/link";
import { puede, type SujetoPermiso } from "@/lib/permisos";

const PESTANAS = [
  { clave: "lista", etiqueta: "Lista", href: "/indicadores" },
  { clave: "matriz", etiqueta: "Matriz del año", href: "/indicadores/matriz" },
  { clave: "por-aprobar", etiqueta: "Por aprobar", href: "/indicadores/por-aprobar" },
  { clave: "cierre", etiqueta: "Cierre del mes", href: "/indicadores/cierre" },
] as const;

export type PestanaIndicadores = (typeof PESTANAS)[number]["clave"];

type Regla = (sujeto: SujetoPermiso, opciones: { aprueba: boolean }) => boolean;

/**
 * Quién ve cada pestaña (spec §6.4). Una pestaña sin regla aún no tiene página: «Cierre del mes» y «Matriz del año»
 * llegan con las suyas. `aprueba` es tener `indicadores.aprobar` (`apruebaFichas`).
 */
const QUIEN_LA_VE: Partial<Record<PestanaIndicadores, Regla>> = {
  lista: () => true,
  "por-aprobar": (sujeto, { aprueba }) => aprueba || puede(sujeto, "indicadores.administrar"),
};

/** Quien aprueba fichas: Gerencia y los líderes; de cuáles, lo dice `puedeAprobarFicha`. */
export const apruebaFichas = (sujeto: SujetoPermiso) => puede(sujeto, "indicadores.aprobar");

/** Las pestañas de «Indicadores» que existen para la persona (spec §12.1), en su orden. */
export function pestanasVisibles(sujeto: SujetoPermiso, opciones: { aprueba: boolean }): PestanaIndicadores[] {
  return PESTANAS.filter((p) => QUIEN_LA_VE[p.clave]?.(sujeto, opciones) === true).map((p) => p.clave);
}

export function PestanasIndicadores({
  activa,
  visibles,
  numeros = {},
}: {
  activa: PestanaIndicadores;
  visibles: readonly PestanaIndicadores[];
  /** El número de una pestaña («Por aprobar · 2»); sin él o en cero, no se pinta. */
  numeros?: Partial<Record<PestanaIndicadores, number>>;
}) {
  return (
    <nav aria-label="Secciones de Indicadores">
      <ul className="flex list-none flex-wrap gap-1 border-b border-border">
        {PESTANAS.filter((p) => visibles.includes(p.clave)).map((p) => {
          const esActiva = p.clave === activa;
          return (
            <li key={p.clave} className="-mb-px">
              <Link
                href={p.href}
                aria-current={esActiva ? "page" : undefined}
                className={`inline-block rounded-t-md border-b-2 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca ${
                  esActiva
                    ? "border-mod-indicadores font-semibold text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.etiqueta}
                {numeros[p.clave] ? ` · ${numeros[p.clave]}` : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
