"use client";

import { Check } from "lucide-react";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import type { DatosFicha } from "@/lib/esquemas/indicadores";
import { enPalabras, formulaDeForma } from "@/lib/indicadores/formula/formas";
import { ESPERA_ANTES_DE_CALCULAR, type Forma, type OpcionesFicha } from "@/lib/indicadores/tipos";

/**
 * «Cómo se obtiene el dato» (anexo 14B, §5.3): lo digita una persona o lo calcula el sistema. Con el sistema, se elige uno
 * de los cálculos del registro y su alcance; la forma, la fórmula, las variables y la tendencia las pone el cálculo
 * (`LoPoneElCalculo`), y el servidor vuelve a tomarlas del registro.
 */

export type CalculoDeFicha = OpcionesFicha["calculos"][number];

const CONTROL = `${claseControl} w-full min-w-0 max-w-full`;

export const ROTULO_PLAZO = "Plazo de reporte (días)";
export const INICIO_EN_CURSO = "Empieza en el periodo en curso cuando se apruebe.";
export const INICIO_HACIA_ATRAS = "El sistema calcula solo los periodos anteriores.";
export const META_EXIGIDA = "Obligatoria en este cálculo: con ella se juzga la conformidad en Distribución.";
const OCUPADO = "Ya hay una ficha activa para ese cálculo y alcance.";
const DONDE_SE_ELIGE = "en «Más opciones», en «Cómo se obtiene el dato».";

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** El cálculo de esa clave entre los que ofrece el formulario; `null` sin elegir. */
export const calculoElegido = (calculos: readonly CalculoDeFicha[], clave: string | undefined): CalculoDeFicha | null =>
  calculos.find((c) => c.clave === clave) ?? null;

/** El alcance al elegir un cálculo: el que había, si el cálculo lo admite; con un solo alcance, ese; si no, sin elegir. */
export function alcanceDelCalculo(c: CalculoDeFicha | null, actual: string): string {
  if (!c) return "";
  if (c.alcances.some((a) => a.clave === actual)) return actual;
  return c.alcances.length === 1 ? c.alcances[0].clave : "";
}

/** La unidad que sugiere el cálculo («Porcentaje», «Días» o «Número»), si el maestro la tiene. */
export const unidadDelCalculo = (c: CalculoDeFicha, unidades: readonly { id: number; nombre: string }[]): number | undefined =>
  unidades.find((u) => sinTildes(u.nombre) === sinTildes(c.unidadSugerida))?.id;

/** Otra ficha activa ya usa ese cálculo y alcance (con alcance «proceso», en el mismo proceso). */
export const calculoOcupado = (activos: OpcionesFicha["calculosActivos"], calculo: string, alcance: string, procesoId: number | "") =>
  activos.some((a) => a.calculo === calculo && a.alcance === alcance && (alcance !== "proceso" || a.procesoId === procesoId));

/** Las variables del cálculo como viajan en la ficha: el nombre y la descripción del registro. */
export const variablesDelCalculo = (c: CalculoDeFicha): DatosFicha["variables"] =>
  c.variables.map((v) => ({ letra: v.letra, nombre: v.nombre, descripcion: v.descripcion, consolidacion: v.consolidacion, admiteNegativos: false }));

/** La forma del cálculo: las del registro nunca son «libre». */
export const formaDelCalculo = (c: CalculoDeFicha) => c.forma as Exclude<Forma, "libre">;

/**
 * Qué es el plazo de reporte en un automático: en uno de flujo, los días que el sistema espera tras el fin del periodo para
 * calcularlo; en uno de estado (y en todos), la fecha límite del análisis.
 */
export function plazoDelCalculo(c: CalculoDeFicha): { etiqueta: string; ayuda: string } {
  return c.clase === "flujo"
    ? { etiqueta: ESPERA_ANTES_DE_CALCULAR, ayuda: "El sistema calcula el periodo cuando pasan estos días desde su fin. Con 0, al terminar el periodo." }
    : { etiqueta: ROTULO_PLAZO, ayuda: "Es la fecha límite del análisis. La foto se toma al terminar el periodo." };
}

/** Un control oculto en el «Más opciones» plegado: si el navegador lo rechaza al enviar, se abre para mostrarlo. */
const abrirSuPlegable = (e: React.FormEvent<HTMLElement>) => {
  const plegable = e.currentTarget.closest("details");
  if (plegable) plegable.open = true;
};

function ErrorDeCampo({ id, error }: { id: string; error?: string }) {
  return error ? (
    <p id={`${id}-error`} role="alert" className="text-xs text-estado-critico-texto">
      {error}
    </p>
  ) : null;
}

const ORIGENES = [
  { valor: "manual", nombre: "Lo digita una persona", detalle: "Quien mide reporta los valores de cada periodo." },
  { valor: "automatico", nombre: "Lo calcula el sistema", detalle: "Lo toma de la plataforma: nadie lo digita." },
] as const;

/** La sección de «Más opciones»: el origen del dato y, con el sistema, el cálculo y su alcance. */
export function OrigenDelDato({
  automatico,
  alElegirOrigen,
  cambio,
  calculos,
  calculo,
  alcance,
  alElegirCalculo,
  alElegirAlcance,
  ocupado,
  errorDe,
}: {
  automatico: boolean;
  alElegirOrigen: (automatico: boolean) => void;
  /** Un cambio sobre una ficha aprobada: conserva el origen y cambiarlo es un cambio mayor. */
  cambio: boolean;
  calculos: readonly CalculoDeFicha[];
  calculo: string;
  alcance: string;
  alElegirCalculo: (clave: string) => void;
  alElegirAlcance: (alcance: string) => void;
  ocupado: boolean;
  errorDe: (id: string) => string | undefined;
}) {
  const elegido = calculoElegido(calculos, calculo);
  const unico = elegido?.alcances.length === 1 ? elegido.alcances[0] : null;
  const errorAlcance = errorDe("ficha-calculoAlcance");
  return (
    <fieldset aria-describedby={cambio ? "ficha-origen-ayuda" : undefined} className="flex min-w-0 flex-col gap-3">
      <legend className="mb-1 text-sm font-medium">Cómo se obtiene el dato</legend>
      {cambio ? (
        <p id="ficha-origen-ayuda" className="text-xs text-muted-foreground">
          Cambiarlo es un cambio mayor.
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ORIGENES.map((o) => {
          const elegida = (o.valor === "automatico") === automatico;
          return (
            <div key={o.valor} className="min-w-0">
              <input
                type="radio"
                id={`ficha-origen-${o.valor}`}
                name="origenDato"
                value={o.valor}
                checked={elegida}
                onChange={() => alElegirOrigen(o.valor === "automatico")}
                className="peer sr-only"
              />
              <label
                htmlFor={`ficha-origen-${o.valor}`}
                className={`flex h-full cursor-pointer flex-col gap-0.5 rounded-md border px-3 py-2 text-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-marca ${
                  elegida ? "border-2 border-mod-indicadores bg-muted" : "border-border bg-card hover:bg-muted"
                }`}
              >
                <span className="flex items-center gap-1 font-semibold">
                  {elegida ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
                  <span>{o.nombre}</span>
                </span>
                <span className="text-xs text-muted-foreground">{o.detalle}</span>
              </label>
            </div>
          );
        })}
      </div>
      {automatico ? (
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo etiqueta="Cálculo" nombre="calculo" id="ficha-calculo" error={errorDe("ficha-calculo")}>
            <select required value={calculo} onChange={(e) => alElegirCalculo(e.target.value)} onInvalid={abrirSuPlegable} className={CONTROL}>
              <option value="">Elija el cálculo</option>
              {calculos.map((c) => (
                <option key={c.clave} value={c.clave}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Campo>
          {unico ? (
            // Un solo alcance: ya está elegido; se muestra y viaja aparte.
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="ficha-calculoAlcance" className="text-sm font-medium">
                Alcance
              </label>
              <input
                id="ficha-calculoAlcance"
                readOnly
                value={unico.etiqueta}
                aria-describedby={errorAlcance ? "ficha-calculoAlcance-error" : undefined}
                aria-invalid={errorAlcance ? "true" : undefined}
                className={CONTROL}
              />
              <input type="hidden" name="calculoAlcance" value={unico.clave} />
              <ErrorDeCampo id="ficha-calculoAlcance" error={errorAlcance} />
            </div>
          ) : (
            <Campo etiqueta="Alcance" nombre="calculoAlcance" id="ficha-calculoAlcance" error={errorAlcance}>
              <select
                required
                disabled={!elegido}
                value={alcance}
                onChange={(e) => alElegirAlcance(e.target.value)}
                onInvalid={abrirSuPlegable}
                className={CONTROL}
              >
                <option value="">Elija el alcance</option>
                {(elegido?.alcances ?? []).map((a) => (
                  <option key={a.clave} value={a.clave}>
                    {a.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          {ocupado ? (
            <p role="status" className="text-sm text-estado-atencion-texto sm:col-span-2">
              {OCUPADO}
            </p>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}

/**
 * Lo que el cálculo pone y no se edita, a la vista donde una ficha manual elige su forma y sus variables: la fórmula en
 * palabras, las variables con su nombre y su descripción, y la tendencia.
 */
export function LoPoneElCalculo({ calculo, alcance, tendencia }: { calculo: CalculoDeFicha | null; alcance: string; tendencia: string }) {
  const nombres = Object.fromEntries((calculo?.variables ?? []).map((v) => [v.letra, v.nombre]));
  const etiquetaAlcance = calculo?.alcances.find((a) => a.clave === alcance)?.etiqueta;
  const dato = "grid min-w-0 grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-[8rem_minmax(0,1fr)]";
  return (
    <div role="group" aria-labelledby="ficha-lo-pone" className="min-w-0 rounded-md border border-l-4 border-border border-l-mod-indicadores px-3 py-2 text-sm">
      <p id="ficha-lo-pone" className="font-medium">
        Lo pone el cálculo
      </p>
      {calculo ? (
        <dl className="mt-2 flex min-w-0 flex-col gap-2">
          <div className={dato}>
            <dt className="text-muted-foreground">Cálculo</dt>
            <dd className="min-w-0 break-words">{etiquetaAlcance ? `${calculo.nombre} · ${etiquetaAlcance}` : calculo.nombre}</dd>
          </div>
          <div className={dato}>
            <dt className="text-muted-foreground">Fórmula</dt>
            <dd className="min-w-0 break-words">{enPalabras(formulaDeForma(formaDelCalculo(calculo)), nombres)}</dd>
          </div>
          <div className={dato}>
            <dt className="text-muted-foreground">Variables</dt>
            <dd className="min-w-0">
              <ul className="flex list-none flex-col gap-1">
                {calculo.variables.map((v) => (
                  <li key={v.letra} className="break-words">
                    <span className="font-medium">{`${v.letra} · ${v.nombre}`}</span>
                    <span className="block text-muted-foreground">{v.descripcion}</span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
          <div className={dato}>
            <dt className="text-muted-foreground">Tendencia</dt>
            <dd className="min-w-0">{tendencia}</dd>
          </div>
        </dl>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">
        {calculo ? `El cálculo y su alcance se eligen ${DONDE_SE_ELIGE}` : `Elija el cálculo ${DONDE_SE_ELIGE}`}
      </p>
    </div>
  );
}
