import Link from "next/link";
import type { SujetoPermiso } from "@/lib/permisos";

const PESTANAS = [
  { clave: "hallazgos", etiqueta: "Hallazgos", href: "/mejoramiento" },
  { clave: "reportes", etiqueta: "Reportes recibidos", href: "/mejoramiento/reportes" },
  { clave: "actividades", etiqueta: "Mis actividades", href: "/mejoramiento/actividades" },
  { clave: "mis-reportes", etiqueta: "Mis reportes", href: "/mejoramiento/reportar" },
] as const;

export type Pestana = (typeof PESTANAS)[number]["clave"];

/**
 * Quién ve cada pestaña (spec 15 §16.1): «Hallazgos», quien ve alguno; «Mis actividades», toda sesión. Las de «Reportes
 * recibidos» y «Mis reportes» se abren cuando existan sus páginas (Tarea 18): una pestaña que lleva a «no encontrado» no se
 * ofrece.
 */
export function pestanasVisibles(_sujeto: SujetoPermiso, x: { veHallazgos: boolean }): Pestana[] {
  return x.veHallazgos ? ["hallazgos", "actividades"] : ["actividades"];
}

export function PestanasMejoramiento({
  activa,
  visibles,
  numeros = {},
}: {
  activa: Pestana;
  visibles: readonly Pestana[];
  /** El número de una pestaña («Reportes recibidos · 2»); sin él o en cero, no se pinta. */
  numeros?: Partial<Record<Pestana, number>>;
}) {
  return (
    <nav aria-label="Secciones de Mejoramiento">
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
                    ? "border-mod-planes font-semibold text-foreground"
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
