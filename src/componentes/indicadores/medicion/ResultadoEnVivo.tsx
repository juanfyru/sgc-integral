import { Insignia } from "@/componentes/ui/Insignia";
import { enPalabras } from "@/lib/indicadores/formula/formas";
import {
  calcularEnVivo,
  CIFRA_FUERA_DE_RANGO,
  DIVISION_POR_CERO,
  reglaDeTexto,
  type CalculoEnTexto,
  type ReglaEnTexto,
  type VariableDeCaptura,
} from "@/lib/indicadores/reporte";
import { fraseDeResultado, type Unidad } from "@/lib/indicadores/textos";
import { ETIQUETA_SEMAFORO } from "@/lib/indicadores/tipos";

const AVISO = "rounded-md border border-l-4 border-border bg-card px-3 py-2 text-sm";

/**
 * El resultado mientras se digita (spec §8.2, maqueta 3): la cifra, el color con su nombre, la frase, la fórmula con los
 * valores y los rangos en palabras, calculados con la misma función pura que usa el servidor, que es quien manda. Dice
 * también la división por cero, los límites del resultado y la pregunta por un salto grande.
 */
export function ResultadoEnVivo({
  calculo,
  regla,
  unidad,
  variables,
  valores,
  rangos,
  anterior,
  variacionPct,
}: {
  calculo: CalculoEnTexto;
  regla: ReglaEnTexto;
  unidad: Unidad;
  variables: readonly VariableDeCaptura[];
  valores: Readonly<Record<string, string>>;
  rangos: string | null;
  anterior: { clave: string; etiqueta: string; resultado: string } | null;
  variacionPct: number;
}) {
  const vivo = calcularEnVivo({ calculo, regla, unidad, variables, anterior, variacionPct }, valores);
  const conValores = enPalabras(
    calculo.formula,
    Object.fromEntries(variables.map((v) => [v.letra, (valores[v.letra] ?? "").trim() || v.nombre])),
  );

  let contenido: React.ReactNode;
  if (Object.keys(vivo.errores).length > 0) {
    contenido = <p className="text-muted-foreground">Corrija los datos para ver el resultado.</p>;
  } else if (!vivo.completo) {
    contenido = <p className="text-muted-foreground">Con todos los datos, aquí sale el resultado.</p>;
  } else if (vivo.resultado === null) {
    contenido = (
      <p className={`${AVISO} border-l-estado-atencion`}>{vivo.sinResultado === "division_por_cero" ? DIVISION_POR_CERO : CIFRA_FUERA_DE_RANGO}</p>
    );
  } else {
    const frase = fraseDeResultado({ resultado: vivo.resultado, semaforo: vivo.semaforo, noAplica: false, motivo: null }, reglaDeTexto(regla), unidad);
    contenido = (
      <>
        <p className="flex flex-wrap items-center gap-3">
          <span className="text-3xl font-bold tabular-nums">{vivo.texto}</span>
          {vivo.semaforo ? (
            <Insignia variante={vivo.semaforo}>{ETIQUETA_SEMAFORO[vivo.semaforo]}</Insignia>
          ) : (
            <Insignia variante="sin-dato">Sin meta</Insignia>
          )}
        </p>
        <p className="font-medium">{frase}</p>
        {vivo.fueraDeLimites ? <p className={`${AVISO} border-l-estado-critico`}>{vivo.fueraDeLimites}</p> : null}
        {vivo.variacion ? <p className={`${AVISO} border-l-estado-atencion`}>{vivo.variacion}</p> : null}
        {vivo.semaforo === "critico" ? (
          <p className={`${AVISO} border-l-estado-critico`}>
            El resultado queda en crítico: el análisis es obligatorio, en dos partes, y la medición quedará marcada «Requiere acción de
            mejora».
          </p>
        ) : vivo.semaforo === "atencion" ? (
          <p className={`${AVISO} border-l-estado-atencion`}>No cumple: después de reportar, el análisis es obligatorio.</p>
        ) : null}
      </>
    );
  }

  return (
    <section aria-labelledby="reporte-resultado" className="flex min-w-0 flex-col gap-2 rounded-lg border border-l-4 border-border border-l-mod-indicadores bg-muted px-4 py-3">
      <h2 id="reporte-resultado" className="text-sm font-semibold">
        Resultado
      </h2>
      <div aria-live="polite" className="flex min-w-0 flex-col gap-2 text-sm">
        {contenido}
      </div>
      <p className="break-words text-xs text-muted-foreground">{rangos ? `${conValores} · ${rangos}` : conValores}</p>
    </section>
  );
}
