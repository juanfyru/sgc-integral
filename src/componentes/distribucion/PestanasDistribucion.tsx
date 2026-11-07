import Link from "next/link";

const PESTANAS = [
  { clave: "copias", etiqueta: "Copias controladas", href: "/distribucion/copias" },
  { clave: "acuses", etiqueta: "Acuses de lectura", href: "/distribucion/acuses" },
  { clave: "socializaciones", etiqueta: "Socializaciones", href: "/distribucion/socializaciones" },
  { clave: "verificaciones", etiqueta: "Verificaciones", href: "/distribucion/verificaciones" },
] as const;

export type PestanaDistribucion = (typeof PESTANAS)[number]["clave"];

export function PestanasDistribucion({ activa }: { activa: PestanaDistribucion }) {
  return (
    <nav aria-label="Secciones de Distribución">
      <ul className="flex list-none flex-wrap gap-1 border-b border-border">
        {PESTANAS.map((p) => {
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
