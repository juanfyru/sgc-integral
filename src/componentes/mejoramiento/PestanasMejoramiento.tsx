import Link from "next/link";
import { RUTA_MIS_REPORTES, RUTA_REPORTES_RECIBIDOS } from "@/lib/mejoramiento/reportes";
import { RUTA_PLANES, veLaLista } from "@/lib/mejoramiento/rutas";
import { puede, type SujetoPermiso } from "@/lib/permisos";

const PESTANAS = [
  { clave: "hallazgos", etiqueta: "Hallazgos", href: "/mejoramiento" },
  { clave: "reportes", etiqueta: "Reportes recibidos", href: RUTA_REPORTES_RECIBIDOS },
  { clave: "actividades", etiqueta: "Mis actividades", href: "/mejoramiento/actividades" },
  { clave: "planes", etiqueta: "Planes", href: RUTA_PLANES },
  { clave: "mis-reportes", etiqueta: "Mis reportes", href: RUTA_MIS_REPORTES },
] as const;

export type Pestana = (typeof PESTANAS)[number]["clave"];

/**
 * Quién ve cada pestaña (spec 15 §16.1): «Hallazgos», quien se queda en la lista (`veLaLista`: ve alguno, o registra o ve todos);
 * «Reportes recibidos», los roles de control (`mejora.ver_todo`); «Mis actividades» y «Mis reportes», toda sesión (todos pueden
 * reportar); «Planes» (Fase 15B, anexo §3.6), quien ve algún plan (`veAlgunPlan`, que la página pasa como `vePlanes`) o los crea
 * (`mejora.planes`).
 */
export function pestanasVisibles(sujeto: SujetoPermiso, x: { veHallazgos: boolean; vePlanes?: boolean }): Pestana[] {
  return [
    ...(veLaLista(sujeto, x.veHallazgos) ? (["hallazgos"] as const) : []),
    ...(puede(sujeto, "mejora.ver_todo") ? (["reportes"] as const) : []),
    "actividades",
    ...(x.vePlanes === true || puede(sujeto, "mejora.planes") ? (["planes"] as const) : []),
    "mis-reportes",
  ];
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
