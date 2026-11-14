import { InsigniaSemaforo } from "@/componentes/indicadores/InsigniaSemaforo";
import type { DatosDeReporte } from "@/db/consultas/indicadores/lectura";
import { deTexto, fraccion } from "@/lib/indicadores/formula/fraccion";
import { reglaDeTexto } from "@/lib/indicadores/reporte";
import { numeroEs } from "@/lib/indicadores/semaforo";
import { textoValor } from "@/lib/indicadores/textos";
import { VolverACalcular } from "./VolverACalcular";

export const LO_CALCULA_EL_SISTEMA = "Este indicador lo calcula el sistema. Nadie digita sus datos.";

/** Un valor guardado (punto decimal) como lo escribe la tabla del año: coma decimal y hasta cuatro decimales. */
const valorEnPantalla = (valor: string) => {
  const f = fraccion(valor);
  return f ? numeroEs(f, 4, "truncar") : valor;
};

/**
 * La pantalla de reportar de una medición que calcula el sistema (anexo 14B, §4 y §5.4): de solo lectura, sin campos ni «No
 * aplica». Lo dice, dice cuándo tomó el sistema sus datos («Calculado por el sistema · foto del …») o cuándo los tomará
 * («Se calcula el …») y, si ya los tomó, muestra los valores de cada variable y el resultado con su estado, o el motivo de
 * «No aplica» que dejó. A quien administra (`administra`), en un cálculo de flujo sin cerrar ni reabrir, «Volver a calcular».
 */
export function DatosDelSistema({ datos, administra = false }: { datos: DatosDeReporte; administra?: boolean }) {
  const resultado = datos.resultado ? textoValor(deTexto(datos.resultado), datos.unidad, reglaDeTexto(datos.regla)) : null;
  const cuando = datos.foto ? `Calculado por el sistema · ${datos.foto}` : datos.seCalcula;
  return (
    <section aria-label="Datos del periodo" className="flex min-w-0 flex-col gap-3 rounded-lg border border-border px-4 py-3">
      <p className="text-sm">{LO_CALCULA_EL_SISTEMA}</p>
      {cuando ? <p className="text-sm text-muted-foreground">{cuando}</p> : null}
      {datos.noAplica ? (
        <p className="break-words text-sm">{datos.motivo ? `No aplica en este periodo: ${datos.motivo}` : "No aplica en este periodo."}</p>
      ) : datos.reportada ? (
        <dl className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
          {datos.variables.map((v) => (
            <div key={v.letra} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-sm font-medium">{v.nombre}</dt>
              <dd className="text-sm">{v.valor === null ? "—" : valorEnPantalla(v.valor)}</dd>
              {v.descripcion ? <dd className="text-xs text-muted-foreground">{v.descripcion}</dd> : null}
            </div>
          ))}
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-sm font-medium">Resultado</dt>
            <dd className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{resultado ?? "—"}</span>
              <InsigniaSemaforo semaforo={datos.semaforo} cumple={datos.cumple} conResultado={resultado !== null} />
            </dd>
          </div>
        </dl>
      ) : null}
      {administra && datos.recalculable ? <VolverACalcular medicionId={datos.medicionId} etiqueta={datos.etiqueta} /> : null}
    </section>
  );
}
