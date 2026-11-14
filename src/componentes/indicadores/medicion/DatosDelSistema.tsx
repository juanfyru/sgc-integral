import { InsigniaSemaforo } from "@/componentes/indicadores/InsigniaSemaforo";
import type { DatosDeReporte } from "@/db/consultas/indicadores/lectura";
import { deTexto } from "@/lib/indicadores/formula/fraccion";
import { reglaDeTexto } from "@/lib/indicadores/reporte";
import { textoValor } from "@/lib/indicadores/textos";

export const LO_CALCULA_EL_SISTEMA = "Este indicador lo calcula el sistema. Nadie digita sus datos.";

/**
 * La pantalla de reportar de una medición que calcula el sistema (anexo 14B, §4): de solo lectura, sin campos ni «No
 * aplica». Lo dice y, si el sistema ya tomó sus datos, muestra los valores de cada variable y el resultado con su estado, o
 * el motivo de «No aplica» que dejó.
 */
export function DatosDelSistema({ datos }: { datos: DatosDeReporte }) {
  const resultado = datos.resultado ? textoValor(deTexto(datos.resultado), datos.unidad, reglaDeTexto(datos.regla)) : null;
  return (
    <section aria-label="Datos del periodo" className="flex min-w-0 flex-col gap-3 rounded-lg border border-border px-4 py-3">
      <p className="text-sm">{LO_CALCULA_EL_SISTEMA}</p>
      {datos.noAplica ? (
        <p className="break-words text-sm">{datos.motivo ? `No aplica en este periodo: ${datos.motivo}` : "No aplica en este periodo."}</p>
      ) : datos.reportada ? (
        <dl className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
          {datos.variables.map((v) => (
            <div key={v.letra} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-sm font-medium">{v.nombre}</dt>
              <dd className="text-sm">{v.valor === null ? "—" : v.valor.replace(".", ",")}</dd>
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
    </section>
  );
}
