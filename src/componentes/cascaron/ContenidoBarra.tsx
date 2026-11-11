"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId } from "react";
import { IconoNav } from "./IconoNav";
import { Monograma } from "./Monograma";
import { GRUPOS, esActiva, type EntradaNav, type GrupoNav } from "./navegacion";

/** Hasta este largo el nombre de la entidad va a 14 px; más largo, a 12 px. Nunca se recorta. */
export const LARGO_NOMBRE_LETRA_NORMAL = 30;

export function claseNombreEntidad(nombre: string): "text-sm" | "text-xs" {
  return nombre.trim().length > LARGO_NOMBRE_LETRA_NORMAL ? "text-xs" : "text-sm";
}

export type MarcaBarra = { nombre: string; sigla: string; logoUrl: string | null };

export const ORDEN_GRUPOS: readonly GrupoNav[] = ["inicio", "documentos", "indicadores", "administracion"];

// Clases completas por color de grupo: Tailwind solo genera las que ve escritas.
const COLOR_ICONO = { marca: "text-marca", "mod-documentos": "text-mod-documentos", "mod-indicadores": "text-mod-indicadores" } as const;
const COLOR_INDICADOR = { marca: "bg-marca", "mod-documentos": "bg-mod-documentos", "mod-indicadores": "bg-mod-indicadores" } as const;

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/**
 * Marca, entradas por grupo y pie; lo comparten la barra lateral y el cajón móvil. «Inicio» lleva el conteo de las
 * tareas y «Vigencia», el de los documentos de su alcance con la vigencia vencida (spec 13C §14.1).
 */
export function ContenidoBarra({
  marca,
  entradas,
  tareas,
  vencidos = 0,
  version,
  alNavegar,
}: {
  marca: MarcaBarra;
  entradas: EntradaNav[];
  tareas: number;
  vencidos?: number;
  version: string;
  alNavegar?: () => void;
}) {
  const ruta = usePathname() ?? "";
  const prefijo = useId();
  const grupos = ORDEN_GRUPOS.map((g) => ({ id: g, entradas: entradas.filter((e) => e.grupo === g) })).filter(
    (g) => g.entradas.length > 0,
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Link href="/" onClick={alNavegar} className={`mx-3 mt-3 flex items-center gap-3 rounded-md px-2 py-2 ${FOCO}`}>
        {marca.logoUrl ? (
          // El logo lo sirve la propia app (/marca/logo); next/image exigiría sharp.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={marca.logoUrl} alt="" className="size-10 shrink-0 rounded-lg object-contain" />
        ) : (
          <Monograma sigla={marca.sigla} className="size-10 rounded-lg text-xs" />
        )}
        <span className="min-w-0">
          <span className={`block break-words ${claseNombreEntidad(marca.nombre)} font-semibold leading-tight text-foreground`}>
            {marca.nombre}
          </span>
          <span className="block text-xs text-muted-foreground">{marca.sigla}</span>
        </span>
      </Link>

      <nav aria-label="Navegación principal" className="mt-2 min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {grupos.map((grupo) => {
          const { etiqueta, color } = GRUPOS[grupo.id];
          const idEtiqueta = `${prefijo}-${grupo.id}`;
          return (
            <div key={grupo.id}>
              {etiqueta && (
                <p
                  id={idEtiqueta}
                  className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-texto-terciario"
                >
                  {etiqueta}
                </p>
              )}
              <ul className="flex flex-col gap-0.5" aria-labelledby={etiqueta ? idEtiqueta : undefined}>
                {grupo.entradas.map((e) => {
                  const activa = esActiva(e, ruta);
                  return (
                    <li key={e.href} className="relative">
                      {activa && (
                        <span
                          aria-hidden="true"
                          className={`absolute inset-y-1 -left-3 w-1 rounded-r-full ${COLOR_INDICADOR[color]}`}
                        />
                      )}
                      <Link
                        href={e.href}
                        onClick={alNavegar}
                        aria-current={activa ? "page" : undefined}
                        className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm font-medium ${FOCO} ${
                          activa
                            ? "border-marca bg-marca-relleno text-white"
                            : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        <IconoNav
                          nombre={e.icono}
                          className={`size-4 shrink-0 ${activa ? "text-white" : COLOR_ICONO[color]}`}
                        />
                        <span className="min-w-0 flex-1 break-words leading-tight">{e.etiqueta}</span>
                        {e.href === "/" && tareas > 0 && (
                          <span
                            data-contador={tareas}
                            className="rounded-full bg-estado-critico-fondo px-1.5 text-[11px] font-semibold leading-4 text-estado-critico-texto"
                          >
                            {tareas}
                            <span className="sr-only"> tareas pendientes</span>
                          </span>
                        )}
                        {e.href === "/vigencia" && vencidos > 0 && (
                          <span
                            data-vencidos={vencidos}
                            className="rounded-full bg-estado-critico-fondo px-1.5 text-[11px] font-semibold leading-4 text-estado-critico-texto"
                          >
                            {vencidos}
                            <span className="sr-only"> con revisión vencida</span>
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <p className="border-t border-linea-suave px-5 py-3 text-xs text-texto-terciario">{`SGC Integral · v${version}`}</p>
    </div>
  );
}
