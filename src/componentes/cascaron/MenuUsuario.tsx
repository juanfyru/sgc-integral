"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, UserRound } from "lucide-react";
import { cambiarTemaAccion, salir } from "@/app/acciones-cuenta";
import type { Tema } from "@/lib/tema";
import { Desplegable } from "./Desplegable";
import { crearEnvioDiferido } from "./envio-diferido";

const OPCIONES_TEMA: ReadonlyArray<{ valor: Tema; etiqueta: string }> = [
  { valor: "claro", etiqueta: "Claro" },
  { valor: "oscuro", etiqueta: "Oscuro" },
  { valor: "sistema", etiqueta: "Según el sistema" },
];

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/**
 * Menú de cuenta sobre un <details> (`Desplegable`): abre y cierra sin JavaScript. El tema se
 * envía una sola vez, 400 ms después del último cambio de opción (recorrer el grupo con las flechas
 * no envía cada opción), o en cuanto el foco sale del formulario; sin JavaScript, con Aplicar.
 */
export function MenuUsuario({ nombre, etiquetaRol, tema }: { nombre: string; etiquetaRol: string; tema: Tema }) {
  const ruta = usePathname() ?? "/";
  const [envioTema] = useState(() => crearEnvioDiferido());
  useEffect(() => () => envioTema.cancelar(), [envioTema]);

  return (
    <Desplegable
      claseResumen={`flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm hover:bg-muted [&::-webkit-details-marker]:hidden ${FOCO}`}
      resumen={
        <>
          <UserRound className="size-4 text-muted-foreground sm:hidden" aria-hidden="true" />
          <span className="sr-only sm:hidden">{nombre}</span>
          <span className="hidden max-w-[10rem] truncate font-medium text-foreground sm:block">{nombre}</span>
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
        </>
      }
    >
      <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-border bg-card p-3 shadow-lg">
        <p className="truncate text-sm font-medium text-foreground">{nombre}</p>
        <p className="mb-3 text-xs text-muted-foreground">{etiquetaRol}</p>
        <Link href="/cuenta" className={`block rounded-md px-2 py-1.5 text-sm text-marca hover:bg-muted ${FOCO}`}>
          Mi cuenta
        </Link>

        <form
          action={cambiarTemaAccion}
          // Conserva la query string (filtros, búsqueda); sin JavaScript queda la ruta sola.
          onSubmit={(e) => {
            envioTema.cancelar(); // Aplicar (o el envío diferido) ya lleva el valor final
            const volver = e.currentTarget.elements.namedItem("volver");
            if (volver instanceof HTMLInputElement) volver.value = location.pathname + location.search;
          }}
          className="mt-3 border-t border-linea-suave pt-3"
        >
          <input type="hidden" name="volver" value={ruta} />
          <fieldset
            // El foco salió del formulario (Escape, clic fuera, Tab a Mi cuenta o Salir): se envía ya.
            // Dentro (otro radio, Aplicar) la espera sigue y Aplicar la cancela.
            onBlur={(e) => {
              if (!e.currentTarget.form?.contains(e.relatedTarget)) envioTema.vaciar();
            }}
          >
            <legend className="mb-1 px-2 text-xs font-semibold text-muted-foreground">Tema</legend>
            {OPCIONES_TEMA.map((o) => (
              <label
                key={o.valor}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted"
              >
                <input
                  type="radio"
                  name="tema"
                  value={o.valor}
                  defaultChecked={o.valor === tema}
                  onChange={(e) => {
                    const formulario = e.currentTarget.form;
                    envioTema.cambio(() => formulario?.requestSubmit());
                  }}
                  className="size-4 accent-marca-relleno"
                />
                {o.etiqueta}
              </label>
            ))}
          </fieldset>
          <button
            type="submit"
            className={`mt-1 w-full rounded-md border border-border px-2 py-1.5 text-left text-sm hover:bg-muted ${FOCO}`}
          >
            Aplicar
          </button>
        </form>

        <form action={salir} className="mt-3 border-t border-linea-suave pt-3">
          <button
            type="submit"
            className={`w-full rounded-md border border-border px-2 py-1.5 text-left text-sm hover:bg-muted ${FOCO}`}
          >
            Salir
          </button>
        </form>
      </div>
    </Desplegable>
  );
}
