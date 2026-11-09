import Link from "next/link";
import { puede, type SujetoPermiso } from "@/lib/permisos";

const PESTANAS = [
  { clave: "semaforo", etiqueta: "Semáforo", href: "/vigencia/semaforo" },
  { clave: "revision-anual", etiqueta: "Revisión anual", href: "/vigencia/revision-anual" },
  { clave: "externos", etiqueta: "Externos", href: "/vigencia/externos" },
  { clave: "indicadores", etiqueta: "Indicadores", href: "/vigencia/indicadores" },
] as const;

export type PestanaVigencia = (typeof PESTANAS)[number]["clave"];

/**
 * Las pestañas que existen para la persona: con `vigencia.ver`, el semáforo y los externos; al responsable técnico
 * sin ese permiso, solo los externos (los suyos).
 */
export function pestanasVisibles(sujeto: SujetoPermiso, responsableTecnico: boolean): PestanaVigencia[] {
  if (puede(sujeto, "vigencia.ver")) return ["semaforo", "externos"];
  return responsableTecnico ? ["externos"] : [];
}

/**
 * Las cuatro pestañas de «Vigencia»; `visibles` dice cuáles pinta, porque cada una tiene su regla (spec 13C
 * §14.2) y las Tareas 7, 11 y 12 las encienden cuando existen.
 */
export function PestanasVigencia({ activa, visibles }: { activa: PestanaVigencia; visibles: readonly PestanaVigencia[] }) {
  return (
    <nav aria-label="Secciones de Vigencia">
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
                    ? "border-marca font-semibold text-foreground"
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
