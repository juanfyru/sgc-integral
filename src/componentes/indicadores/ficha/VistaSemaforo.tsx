import { errorDeRegla, rangosEnPalabras, type Regla } from "@/lib/indicadores/semaforo";
import type { Unidad } from "@/lib/indicadores/textos";

/**
 * «Así quedará el semáforo» (spec §7.5 y §12.4): los rangos en palabras en cuanto hay meta, con la misma función que
 * usan la página, el reporte y el impreso. Si la regla no sirve, dice por qué; sin meta, que la medición queda «Sin meta».
 */
export function VistaSemaforo({
  regla,
  unidad,
  metaEscrita,
  accion = null,
}: {
  regla: Regla;
  unidad: Unidad;
  metaEscrita: boolean;
  /** Un botón junto al texto (en una ficha con la regla anterior, «Escribir los rangos»). */
  accion?: React.ReactNode;
}) {
  const texto =
    regla.meta === null
      ? metaEscrita
        ? "Escriba la meta como un número: 80 o 80,5."
        : "Sin meta: cada medición queda «Sin meta», sin color ni alertas."
      : regla.modo === "rangos" && !regla.rangos
        ? "Complete los números de los rangos del semáforo."
        : (errorDeRegla(regla) ?? rangosEnPalabras(regla, unidad) ?? "Complete los rangos del semáforo.");
  return (
    <div className="rounded-md border border-l-4 border-border border-l-mod-indicadores bg-muted px-3 py-2 text-sm">
      <p className="font-medium">Así quedará el semáforo</p>
      <p aria-live="polite" className="mt-0.5">
        {texto}
      </p>
      {accion ? <div className="mt-2">{accion}</div> : null}
    </div>
  );
}
