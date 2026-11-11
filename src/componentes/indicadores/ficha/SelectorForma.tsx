"use client";

import { Check } from "lucide-react";
import type { Forma } from "@/lib/indicadores/tipos";

/** «1.000»: el factor con punto de miles, igual en el servidor y en el navegador (sin `Intl`). */
export const conMiles = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const FORMAS: readonly { forma: Forma; nombre: string; formula: (factor: number) => string }[] = [
  { forma: "porcentaje", nombre: "Porcentaje", formula: () => "A ÷ B × 100" },
  { forma: "tasa", nombre: "Tasa", formula: (factor) => `A ÷ B × ${conMiles(factor)}` },
  { forma: "razon", nombre: "Promedio o razón", formula: () => "A ÷ B" },
  { forma: "conteo", nombre: "Conteo", formula: () => "A" },
  { forma: "libre", nombre: "Fórmula libre", formula: () => "Usted la escribe" },
];

/**
 * «¿Cómo se calcula?» (spec §7.4 y §12.4): las cinco formas como un grupo de opciones. Las cuatro primeras arman solas la
 * fórmula y sus variables. Se elige con las flechas del teclado; la elegida lleva marca y no solo color.
 */
export function SelectorForma({ forma, factor, alElegir }: { forma: Forma; factor: number; alElegir: (forma: Forma) => void }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-medium">¿Cómo se calcula?</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {FORMAS.map((f) => {
          const elegida = f.forma === forma;
          return (
            <div key={f.forma} className="min-w-0">
              <input
                type="radio"
                id={`ficha-forma-${f.forma}`}
                name="forma"
                value={f.forma}
                checked={elegida}
                onChange={() => alElegir(f.forma)}
                className="peer sr-only"
              />
              <label
                htmlFor={`ficha-forma-${f.forma}`}
                className={`flex h-full cursor-pointer flex-col gap-0.5 rounded-md border px-3 py-2 text-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-marca ${
                  elegida ? "border-2 border-mod-indicadores bg-muted" : "border-border bg-card hover:bg-muted"
                }`}
              >
                <span className="flex items-center gap-1 font-semibold">
                  {elegida ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
                  <span>{f.nombre}</span>
                </span>
                <span className="text-xs text-muted-foreground">{f.formula(factor)}</span>
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
