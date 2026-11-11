import Link from "next/link";
import type { SujetoPermiso } from "@/lib/permisos";

const PESTANAS = [
  { clave: "lista", etiqueta: "Lista", href: "/indicadores" },
  { clave: "matriz", etiqueta: "Matriz del año", href: "/indicadores/matriz" },
  { clave: "por-aprobar", etiqueta: "Por aprobar", href: "/indicadores/por-aprobar" },
  { clave: "cierre", etiqueta: "Cierre del mes", href: "/indicadores/cierre" },
] as const;

export type PestanaIndicadores = (typeof PESTANAS)[number]["clave"];

type Regla = (sujeto: SujetoPermiso, opciones: { aprueba: boolean }) => boolean;

/** Quién ve cada pestaña. Una pestaña sin regla aún no tiene página: «Por aprobar», «Cierre del mes» y «Matriz del año» llegan con las suyas. */
const QUIEN_LA_VE: Partial<Record<PestanaIndicadores, Regla>> = {
  lista: () => true,
};

/** Las pestañas de «Indicadores» que existen para la persona (spec §12.1), en su orden. */
export function pestanasVisibles(sujeto: SujetoPermiso, opciones: { aprueba: boolean }): PestanaIndicadores[] {
  return PESTANAS.filter((p) => QUIEN_LA_VE[p.clave]?.(sujeto, opciones) === true).map((p) => p.clave);
}

export function PestanasIndicadores({ activa, visibles }: { activa: PestanaIndicadores; visibles: readonly PestanaIndicadores[] }) {
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
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
