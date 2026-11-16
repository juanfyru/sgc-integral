import { InsigniaSemaforo } from "@/componentes/indicadores/InsigniaSemaforo";
import { Insignia } from "@/componentes/ui/Insignia";
import type { DatosDeReporte, VariableAjena, VariableDeReporte } from "@/db/consultas/indicadores/lectura";
import { deTexto, fraccion } from "@/lib/indicadores/formula/fraccion";
import { reglaDeTexto } from "@/lib/indicadores/reporte";
import { numeroEs } from "@/lib/indicadores/semaforo";
import { textoValor } from "@/lib/indicadores/textos";
import { VALOR_OCULTO } from "@/lib/indicadores/tipos";
import { VolverACalcular } from "./VolverACalcular";

export const LO_CALCULA_EL_SISTEMA = "Este indicador lo calcula el sistema. Nadie digita sus datos.";
/** La de un indicador sin variables propias (anexo 14C, §3.1): nadie lo mide, como a un automático. */
export const LLEGA_DE_OTRAS_FUENTES = "Este indicador no tiene datos propios: llegan de datos compartidos o de otros indicadores.";

/** Cómo se nombra, junto a la variable, de dónde llega un valor que no digita quien mide (maqueta 14). */
export const ETIQUETA_DE_AJENA: Record<VariableAjena["clase"], string> = { dato: "Dato compartido", indicador: "De otro indicador" };

/** Un valor guardado (punto decimal) como lo escribe la tabla del año: coma decimal y hasta cuatro decimales. */
const valorEnPantalla = (valor: string) => {
  const f = fraccion(valor);
  return f ? numeroEs(f, 4, "truncar") : valor;
};

const deIndicador = (a: VariableAjena) => [a.codigo, a.nombre].filter(Boolean).join(" ");

/** El aviso de un componente que la persona no ve y aún no tiene resultado (anexo 14C, §6.5): sin nombrarlo. */
export const FALTA_UN_COMPONENTE = "Falta un dato de un componente.";

/**
 * El aviso de «Falta un dato» de una variable ajena que aún no llega (anexo 14C, §3.1, maqueta 14); `null` si ya llegó o si
 * la variable es propia. Con `mide` (quien mide y aún no reportó lo suyo), le dice que ya puede reportarlo. La de un
 * componente que la persona no ve, `FALTA_UN_COMPONENTE`.
 */
export function avisoDeFalta(v: VariableDeReporte, mide: boolean): string | null {
  const a = v.ajena;
  if (a?.oculta) return a.llego ? null : FALTA_UN_COMPONENTE;
  if (!a || a.valor !== null) return null;
  if (a.clase === "indicador") return `Falta un dato. Sale de ${deIndicador(a)}, que aún no tiene resultado.`;
  const quien = a.proceso ? `«${a.nombre}» lo reporta ${a.proceso}${a.venceEl ? `; vence el ${a.venceEl}` : ""}.` : `«${a.nombre}» aún no se reporta.`;
  const despues = mide
    ? "Usted ya puede reportar lo suyo: el resultado se calcula solo cuando el dato llegue."
    : "El resultado se calcula solo cuando el dato llegue.";
  return `Falta un dato. ${quien} ${despues}`;
}

/** Los avisos de «Falta un dato» de las variables ajenas que no han llegado, uno por variable. */
export function AvisosDeFalta({ variables, mide }: { variables: VariableDeReporte[]; mide: boolean }) {
  const avisos = variables.flatMap((v) => {
    const aviso = avisoDeFalta(v, mide);
    return aviso ? [{ letra: v.letra, aviso }] : [];
  });
  if (avisos.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {avisos.map((a) => (
        <p key={a.letra} className="break-words rounded-md border border-l-4 border-border border-l-mod-indicadores bg-muted px-3 py-2 text-sm">
          {a.aviso}
        </p>
      ))}
    </div>
  );
}

/**
 * Una variable que no digita quien mide (anexo 14C, §3.1, maqueta 14): fija, con su nombre, de dónde llega («Dato
 * compartido» o «De otro indicador»), su valor o que aún no llega y, de un dato, quién lo reportó y cuándo. No se cambia
 * desde aquí: no hay campo, y el servidor rechaza un valor para ella. La de un componente que la persona no ve (anexo 14C,
 * §6.5) llega sin nombre ni cifra: «Indicador restringido», con «No disponible» si ya llegó.
 */
export function VariableFija({ variable: v, id }: { variable: VariableDeReporte; id: string }) {
  const a = v.ajena;
  if (!a) return null;
  const nota =
    a.valor === null
      ? null
      : a.clase === "dato"
        ? a.reporto && a.reportadoEl
          ? `Lo reportó ${a.reporto} el ${a.reportadoEl}. No se cambia desde aquí.`
          : "No se cambia desde aquí."
        : `Sale de ${deIndicador(a)}. No se cambia desde aquí.`;
  const valor = a.oculta
    ? a.llego
      ? VALOR_OCULTO
      : "Aún no tiene resultado"
    : a.valor === null
      ? a.clase === "dato"
        ? "Aún no lo reportan"
        : "Aún no tiene resultado"
      : valorEnPantalla(a.valor);
  return (
    <div role="group" aria-labelledby={`${id}-etiqueta`} className="flex min-w-0 flex-col gap-1">
      <p id={`${id}-etiqueta`} className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
        <span className="break-words">{v.nombre}</span>
        <Insignia variante="neutra">{ETIQUETA_DE_AJENA[a.clase]}</Insignia>
      </p>
      <p
        className={`break-words rounded-md border border-dashed border-border bg-muted px-3 py-2 text-sm tabular-nums ${a.valor === null ? "text-muted-foreground" : ""}`}
      >
        {valor}
      </p>
      {v.descripcion ? <p className="text-xs text-muted-foreground">{v.descripcion}</p> : null}
      {nota ? <p className="text-xs text-muted-foreground">{nota}</p> : null}
    </div>
  );
}

/**
 * La pantalla de reportar de una medición que nadie digita, de solo lectura, sin campos ni «No aplica». La de un automático
 * (anexo 14B, §4 y §5.4) lo dice, dice cuándo tomó el sistema sus datos («Calculado por el sistema · foto del …») o cuándo
 * los tomará («Se calcula el …») y, si ya los tomó, muestra los valores de cada variable y el resultado con su estado, o el
 * motivo de «No aplica» que dejó; a quien administra (`administra`), en un cálculo de flujo sin cerrar ni reabrir, «Volver a
 * calcular». La de un indicador sin variables propias (anexo 14C, §3.1) muestra cada variable fija, con lo que ya llegó, el
 * aviso de lo que falta y, reportada, el resultado.
 */
export function DatosDelSistema({ datos, administra = false }: { datos: DatosDeReporte; administra?: boolean }) {
  const resultado = datos.resultado ? textoValor(deTexto(datos.resultado), datos.unidad, reglaDeTexto(datos.regla)) : null;
  const cuando = datos.foto ? `Calculado por el sistema · ${datos.foto}` : datos.seCalcula;
  const elResultado = (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-sm font-medium">Resultado</dt>
      <dd className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{resultado ?? "—"}</span>
        <InsigniaSemaforo semaforo={datos.semaforo} cumple={datos.cumple} conResultado={resultado !== null} />
      </dd>
    </div>
  );
  return (
    <section aria-label="Datos del periodo" className="flex min-w-0 flex-col gap-3 rounded-lg border border-border px-4 py-3">
      <p className="text-sm">{datos.automatica ? LO_CALCULA_EL_SISTEMA : LLEGA_DE_OTRAS_FUENTES}</p>
      {cuando ? <p className="text-sm text-muted-foreground">{cuando}</p> : null}
      {datos.noAplica ? (
        <p className="break-words text-sm">{datos.motivo ? `No aplica en este periodo: ${datos.motivo}` : "No aplica en este periodo."}</p>
      ) : !datos.automatica ? (
        <>
          <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
            {datos.variables.map((v) => (
              <VariableFija key={v.letra} variable={v} id={`reporte-${v.letra}`} />
            ))}
          </div>
          <AvisosDeFalta variables={datos.variables} mide={false} />
          {datos.reportada ? <dl className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">{elResultado}</dl> : null}
        </>
      ) : datos.reportada ? (
        <dl className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
          {datos.variables.map((v) => (
            <div key={v.letra} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-sm font-medium">{v.nombre}</dt>
              <dd className="text-sm">{v.valor === null ? "—" : valorEnPantalla(v.valor)}</dd>
              {v.descripcion ? <dd className="text-xs text-muted-foreground">{v.descripcion}</dd> : null}
            </div>
          ))}
          {elResultado}
        </dl>
      ) : null}
      {administra && datos.recalculable ? <VolverACalcular medicionId={datos.medicionId} etiqueta={datos.etiqueta} /> : null}
    </section>
  );
}
