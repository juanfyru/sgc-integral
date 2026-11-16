"use client";

import { useActionState, useState, type MouseEvent, type ReactNode } from "react";
import { actualizarCategoriasDeMedicion } from "@/app/acciones-indicadores";
import type { EstadoConAviso } from "@/app/admin/comun";
import { InsigniaEnCritico, InsigniaSemaforo } from "@/componentes/indicadores/InsigniaSemaforo";
import { Boton } from "@/componentes/ui/Boton";
import { claseControl } from "@/componentes/ui/Campo";
import { Insignia, type VarianteInsignia } from "@/componentes/ui/Insignia";
import type { CategoriaDeReporte, DatosDeReporte } from "@/db/consultas/indicadores/lectura";
import { estadoDeCategoria, rejillaEnVivo, type FilaEnVivo, type TotalEnVivo } from "@/lib/indicadores/categorias";
import { fraccion } from "@/lib/indicadores/formula/fraccion";
import { calcularEnVivo, type CalculoEnVivo, type EstadoReporte } from "@/lib/indicadores/reporte";
import { numeroEs } from "@/lib/indicadores/semaforo";
import type { Semaforo } from "@/lib/indicadores/tipos";
import { cuenta } from "@/lib/plural";
import { AvisosDeFalta, ETIQUETA_DE_AJENA } from "./DatosDelSistema";
import { ResultadoEnVivo } from "./ResultadoEnVivo";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const AVISO = "flex flex-col gap-2 rounded-md border border-l-4 border-border bg-card px-3 py-2 text-sm";
/** En el teléfono, lo que recibe el foco no queda bajo el total fijo abajo. */
const SOBRE_EL_PIE = "scroll-mb-40 sm:scroll-mb-0";
/** Una celda: un bloque de la tarjeta en el teléfono; una celda de la tabla desde 640 px. */
const CELDA = "sm:table-cell sm:border-t sm:border-linea-suave sm:px-2 sm:py-2 sm:align-middle";

// El acento de cada fila sigue a su resultado; sin resultado, el borde neutro. Clases literales para Tailwind.
const ACENTO: Record<Semaforo, string> = {
  bien: "border-l-estado-bien",
  atencion: "border-l-estado-atencion",
  critico: "border-l-estado-critico",
};

/** Un desagregado, con la lista de categorías de su medición. */
export type DatosDeRejilla = DatosDeReporte & {
  categorias: CategoriaDeReporte[];
};

/** Lo que la persona cambió en un campo y con qué valor de la base estaba pintado cuando lo cambió. */
type Edicion = Record<string, { valor: string; base: string }>;

/** Un valor guardado (punto decimal) en el campo: coma decimal, como se digita. */
const enCampo = (valor: string | null) => (valor === null ? "" : valor.replace(".", ","));

/** Un valor guardado como lo escribe la tabla del año: coma decimal y hasta cuatro decimales. */
const enPantalla = (valor: string) => {
  const f = fraccion(valor);
  return f ? numeroEs(f, 4, "truncar") : valor;
};

const dePersona = (c: CategoriaDeReporte) => c.noAplica !== null && !c.delSistema;

/**
 * Cada campo de la rejilla con lo que pintó la base: las celdas propias (`c_<id>_<letra>`), la casilla «No aplica» (`na_<id>`,
 * «1» o «0») y su motivo (`motivo_<id>`). De aquí salen siempre los originales que viajan ocultos (`o_`, `ona_`, `omotivo_`):
 * nunca de lo que la persona digitó ni del estado que vuelve de la acción.
 */
function pintadosDe(d: DatosDeRejilla): Map<string, string> {
  const salida = new Map<string, string>();
  for (const c of d.categorias) {
    for (const v of d.variables) if (!v.ajena) salida.set(`c_${c.id}_${v.letra}`, enCampo(c.valores[v.letra] ?? null));
    if (c.delSistema) continue;
    salida.set(`na_${c.id}`, dePersona(c) ? "1" : "0");
    salida.set(`motivo_${c.id}`, dePersona(c) ? c.noAplica! : "");
  }
  return salida;
}

/**
 * Sin JavaScript, la acción vuelve con lo que se envió (`valores`): las celdas, las casillas y los motivos se repintan con
 * eso. La casilla de una fila solo si su estado pintado viajó (`ona_`): desmarcada no manda nada.
 */
function semilla(estado: EstadoReporte, pintados: Map<string, string>): Edicion {
  const valores = estado && estado.ok === false ? estado.valores : undefined;
  if (!valores) return {};
  const texto = (k: string) => (typeof valores[k] === "string" ? (valores[k] as string) : undefined);
  const salida: Edicion = {};
  for (const [k, base] of pintados) {
    if (k.startsWith("na_")) {
      if (texto(`o${k}`) !== undefined) salida[k] = { valor: texto(k) === "1" ? "1" : "0", base };
      continue;
    }
    const t = texto(k);
    if (t !== undefined) salida[k] = { valor: t, base };
  }
  return salida;
}

/** El resultado de una fila (o del total) con su estado escrito: «91 % · Bien», «Sin casos», «No aplica», «Por completar». */
function ResultadoDeFila({ f }: { f: Pick<FilaEnVivo, "estado" | "texto" | "semaforo" | "cumple" | "esperaDato"> }) {
  if (f.estado === "incompleta") return <Insignia variante="sin-dato">{f.esperaDato ? "Falta un dato" : "Por completar"}</Insignia>;
  const e = estadoDeCategoria({
    estado: f.estado,
    semaforo: f.semaforo,
    cumple: f.cumple,
    conResultado: f.texto !== null,
  });
  const variante: VarianteInsignia = f.semaforo ?? "sin-dato";
  return <Insignia variante={variante}>{f.texto && f.estado === "completa" ? `${f.texto} · ${e.texto}` : e.texto}</Insignia>;
}

/** Lo que dice el total mientras no hay suma: falta una categoría, espera un dato o ninguna aplica. */
function SinTotal({ total }: { total: Exclude<TotalEnVivo, { clase: "total" }> }) {
  const [insignia, texto] =
    total.clase === "espera"
      ? ["Falta un dato", "El total se calcula cuando llegue el dato que falta de cada categoría."]
      : total.clase === "ninguna_aplica"
        ? ["No aplica", "Ninguna categoría aplica: al reportar, la medición entera queda «No aplica»."]
        : [
            "Por reportar",
            "El total se calcula cuando todas las categorías estén completas, «Sin casos» o «No aplica». Lo guardado hasta ahora no se pierde.",
          ];
  return (
    <section
      aria-labelledby="rejilla-total"
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-l-4 border-border border-l-border bg-muted px-4 py-3"
    >
      <h2 id="rejilla-total" className="text-sm font-semibold">
        Total
      </h2>
      <div aria-live="polite" className="flex min-w-0 flex-col gap-2 text-sm">
        <p className="flex flex-wrap items-center gap-3">
          <span className="text-3xl font-bold text-muted-foreground">—</span>
          <Insignia variante="sin-dato">{insignia}</Insignia>
        </p>
        <p className="text-muted-foreground">{texto}</p>
      </div>
    </section>
  );
}

/** El total en el pie fijo del teléfono: la cifra, su estado y las categorías en Crítico. */
function TotalDelPie({
  total,
  vivo,
  enCritico,
  dimension,
}: {
  total: TotalEnVivo;
  vivo: CalculoEnVivo | null;
  enCritico: number;
  dimension: string | null;
}) {
  const sinSuma = total.clase === "espera" ? "Falta un dato" : total.clase === "ninguna_aplica" ? "No aplica" : "Por reportar";
  return (
    <div aria-live="polite" className="flex flex-wrap items-center justify-between gap-2 sm:hidden">
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-2xl font-bold tabular-nums">{vivo?.texto ?? "—"}</span>
        {vivo?.texto ? (
          <InsigniaSemaforo semaforo={vivo.semaforo} cumple={vivo.cumple} conResultado />
        ) : (
          <Insignia variante="sin-dato">{total.clase === "total" ? "Sin dato" : sinSuma}</Insignia>
        )}
      </span>
      <InsigniaEnCritico n={enCritico} dimension={dimension} />
    </div>
  );
}

/**
 * La rejilla de captura de un indicador desagregado (anexo 14C, §5.4; maquetas 9 y 10), dentro del formulario de reporte: una
 * fila por categoría de la lista de la medición y una celda por variable propia (`c_<id>_<letra>`, con el texto con que se
 * pintó en `o_<id>_<letra>`); lo ajeno (un dato por categoría) va fijo en su fila, con su valor o «Falta un dato». Cada fila
 * dice al instante su resultado y su color (`rejillaEnVivo`, con los límites de captura de cada celda); la de 0 ÷ 0 queda
 * «Sin casos» sola; la casilla «No aplica» (`na_<id>`) pide su motivo (`motivo_<id>`) y su estado pintado viaja en `ona_<id>` y
 * `omotivo_<id>`: el servidor decide con ellos qué cambió la persona, y una casilla desmarcada no manda nada. Un «No aplica»
 * que puso el sistema se muestra con su motivo, sin casilla. La fila del total suma las que aplican cuando todas están
 * completas, «Sin casos» o «No aplica»; mientras tanto, «Falta {n} categoría(s): …». Las categorías en Crítico se nombran.
 *
 * Desde 640 px es una tabla y, a la derecha (o debajo), el resultado del total, los avisos y los botones; más angosto, el
 * mismo marcado se reacomoda en una tarjeta por categoría y el total queda fijo abajo con los botones: nunca dos juegos de
 * campos. Lo que la persona cambia se guarda con el valor con que estaba pintado: si la base cambia ese campo (otra persona
 * guardó y la página se repintó), se muestra lo nuevo.
 */
export function RejillaDeCategorias({
  datos,
  estado,
  pendiente,
  alPulsar,
  mensaje,
}: {
  datos: DatosDeRejilla;
  /** Lo que volvió de la acción: la confirmación que pide y, sin JavaScript, lo que se envió. */
  estado: EstadoReporte;
  pendiente: boolean;
  /** Anota el botón pulsado en el formulario (`intencion`). */
  alPulsar: (evento: MouseEvent<HTMLButtonElement>) => void;
  /** El aviso o el error del último envío. */
  mensaje: ReactNode;
}) {
  const pintados = pintadosDe(datos);
  const [edicion, setEdicion] = useState<Edicion>(() => semilla(estado, pintados));
  const [confirmado, setConfirmado] = useState(false);
  const valor = (k: string) => {
    const base = pintados.get(k) ?? "";
    const e = edicion[k];
    return e && e.base === base ? e.valor : base;
  };
  const cambiar = (k: string, v: string) => {
    const base = pintados.get(k) ?? "";
    setEdicion((actual) => ({ ...actual, [k]: { valor: v, base } }));
    setConfirmado(false);
  };

  const dimension = datos.dimension ?? "Categoría";
  const ajenas = datos.variables.filter((v) => v.ajena).map((v) => v.letra);
  const variables = datos.variables.map((v) => ({
    letra: v.letra,
    nombre: v.nombre,
    // A lo ajeno no lo limitan las reglas de captura de quien mide.
    capturaMin: v.ajena ? null : v.capturaMin,
    capturaMax: v.ajena ? null : v.capturaMax,
    admiteNegativos: v.ajena ? true : v.admiteNegativos,
    ajena: v.ajena !== null,
  }));
  const noAplica = (c: CategoriaDeReporte) => c.delSistema || valor(`na_${c.id}`) === "1";
  const vivo = rejillaEnVivo(
    {
      calculo: datos.calculo,
      regla: datos.regla,
      unidad: datos.unidad,
      variables,
    },
    datos.categorias.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      noAplica: noAplica(c),
      textos: Object.fromEntries(
        datos.variables.map((v) => [v.letra, v.ajena ? enCampo(c.valores[v.letra] ?? null) : valor(`c_${c.id}_${v.letra}`)]),
      ),
    })),
  );
  // Los límites del resultado y la confirmación por variación valen solo para el total (anexo 14C, §5.4).
  const sinLimites = variables.map((v) => ({
    ...v,
    capturaMin: null,
    capturaMax: null,
    admiteNegativos: true,
  }));
  const totalEnTexto =
    vivo.total.clase === "total" ? Object.fromEntries(Object.entries(vivo.total.valores).map(([l, f]) => [l, numeroEs(f, 4, "truncar")])) : null;
  const total = totalEnTexto
    ? calcularEnVivo(
        {
          calculo: datos.calculo,
          regla: datos.regla,
          unidad: datos.unidad,
          variables: sinLimites,
          anterior: datos.anterior,
          variacionPct: datos.variacionPct,
        },
        totalEnTexto,
      )
    : null;
  const pregunta = total?.variacion ?? (estado && !estado.ok ? (estado.confirmar ?? null) : null);
  const aplican = datos.categorias.filter((c) => !noAplica(c));
  const faltaAjeno = aplican.some((c) => ajenas.some((l) => c.valores[l] === null));
  // El aviso de «Falta un dato» de cada variable ajena, si alguna categoría que aplica aún no lo tiene.
  const conAviso = datos.variables.map((v) =>
    v.ajena
      ? {
          ...v,
          ajena: {
            ...v.ajena,
            valor: aplican.some((c) => c.valores[v.letra] === null) ? null : (v.ajena.valor ?? ""),
          },
        }
      : v,
  );
  const faltan = vivo.total.clase === "faltan" ? vivo.total.categorias : [];
  const avisoDeFalta = faltan.length > 0 ? `${faltan.length === 1 ? "Falta" : "Faltan"} ${cuenta(faltan.length, "categoría", "categorías")}: ${faltan.join(", ")}` : null;
  const avisoDeCritico = vivo.enCritico.length > 0 ? `${vivo.enCritico.length} en Crítico: ${vivo.enCritico.map((f) => f.nombre).join(", ")}` : null;

  return (
    // Una columna hasta 1024 px (flex: el pie fijo del teléfono se pega a lo largo de toda la rejilla, no solo de su celda de
    // la cuadrícula); desde ahí, la tabla a la izquierda y el total, los avisos y los botones a la derecha.
    <div className="flex min-w-0 flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:grid-rows-[auto_1fr] lg:gap-y-3">
      <div className="min-w-0 sm:overflow-x-auto lg:row-span-2">
        <table className="block w-full text-sm sm:table">
          <caption className="sr-only">{`Datos por ${datos.dimension ?? "categoría"}`}</caption>
          <thead className="hidden text-left text-xs font-semibold text-muted-foreground sm:table-header-group">
            <tr>
              <th scope="col" className="px-2 py-2 align-bottom">
                {dimension}
              </th>
              {datos.variables.map((v) => (
                <th key={v.letra} scope="col" className="px-2 py-2 text-right align-bottom">
                  {v.nombre}
                  {v.ajena ? <span className="block font-normal">{`${ETIQUETA_DE_AJENA[v.ajena.clase]} · No se cambia desde aquí`}</span> : null}
                </th>
              ))}
              <th scope="col" className="px-2 py-2 align-bottom">
                Resultado
              </th>
              <th scope="col" className="px-2 py-2 align-bottom">
                <span className="sr-only">No aplica</span>
              </th>
            </tr>
          </thead>
          <tbody className="flex flex-col gap-3 sm:table-row-group">
            {datos.categorias.map((c, i) => {
              const f = vivo.filas[i];
              const marcada = !c.delSistema && valor(`na_${c.id}`) === "1";
              const acento = f.estado === "completa" && f.semaforo ? ACENTO[f.semaforo] : "border-l-border";
              return (
                <tr
                  key={c.id}
                  className="grid grid-cols-2 items-start gap-x-3 gap-y-2 rounded-lg border border-border bg-card p-3 sm:table-row sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0"
                >
                  <th
                    scope="row"
                    className={`order-1 self-center break-words border-l-4 ${acento} pl-2 text-left font-semibold sm:order-none sm:table-cell sm:border-t sm:border-t-linea-suave sm:px-2 sm:py-2 sm:align-middle sm:font-medium`}
                  >
                    {c.nombre}
                  </th>
                  {c.delSistema || marcada ? (
                    <td colSpan={datos.variables.length} className={`order-3 col-span-2 flex min-w-0 flex-col gap-1 sm:order-none ${CELDA}`}>
                      {c.delSistema ? (
                        <span className="break-words">{`No aplica · ${c.noAplica}`}</span>
                      ) : (
                        <>
                          <label htmlFor={`rejilla-${c.id}-motivo`} className="text-xs font-medium">
                            Motivo de «No aplica»
                          </label>
                          <textarea
                            id={`rejilla-${c.id}-motivo`}
                            name={`motivo_${c.id}`}
                            aria-label={`${c.nombre}: motivo de «No aplica»`}
                            required
                            minLength={5}
                            maxLength={500}
                            rows={2}
                            value={valor(`motivo_${c.id}`)}
                            onChange={(e) => cambiar(`motivo_${c.id}`, e.target.value)}
                            className={`${claseControl} w-full min-w-0 ${SOBRE_EL_PIE}`}
                          />
                        </>
                      )}
                    </td>
                  ) : (
                    datos.variables.map((v) => {
                      const id = `rejilla-${c.id}-${v.letra}`;
                      const k = `c_${c.id}_${v.letra}`;
                      if (v.ajena) {
                        const guardado = c.valores[v.letra] ?? null;
                        return (
                          <td key={v.letra} className={`order-3 flex min-w-0 flex-col gap-1 sm:order-none ${CELDA}`}>
                            <span className="text-xs font-medium sm:hidden">{v.nombre}</span>
                            <span
                              className={`rounded-md border border-dashed border-border bg-muted px-2 py-1.5 text-right tabular-nums ${guardado === null ? "text-muted-foreground" : ""}`}
                            >
                              {guardado === null ? "Falta un dato" : enPantalla(guardado)}
                            </span>
                          </td>
                        );
                      }
                      const error = f.errores[v.letra];
                      return (
                        <td key={v.letra} className={`order-3 flex min-w-0 flex-col gap-1 sm:order-none ${CELDA}`}>
                          <label htmlFor={id} className="text-xs font-medium sm:hidden">
                            {v.nombre}
                          </label>
                          <input
                            id={id}
                            name={k}
                            inputMode="decimal"
                            autoComplete="off"
                            aria-label={`${c.nombre}: ${v.nombre}`}
                            aria-invalid={error ? "true" : undefined}
                            aria-describedby={error ? `${id}-error` : undefined}
                            value={valor(k)}
                            onChange={(e) => cambiar(k, e.target.value)}
                            className={`${claseControl} w-full min-w-16 text-right tabular-nums ${SOBRE_EL_PIE}`}
                          />
                          <input type="hidden" name={`o_${c.id}_${v.letra}`} value={pintados.get(k) ?? ""} />
                          {error ? (
                            <p id={`${id}-error`} className="text-xs text-estado-critico-texto">
                              {error}
                            </p>
                          ) : null}
                        </td>
                      );
                    })
                  )}
                  <td className={`order-2 self-center justify-self-end sm:order-none ${CELDA}`}>
                    <ResultadoDeFila f={f} />
                  </td>
                  <td className={`order-4 col-span-2 sm:order-none ${CELDA}`}>
                    {c.delSistema ? (
                      <span className="text-xs text-muted-foreground">Lo marcó el sistema</span>
                    ) : (
                      <>
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            name={`na_${c.id}`}
                            value="1"
                            checked={marcada}
                            onChange={(e) => cambiar(`na_${c.id}`, e.target.checked ? "1" : "0")}
                            aria-label={`${c.nombre}: No aplica`}
                            className={`size-4 ${FOCO} ${SOBRE_EL_PIE}`}
                          />
                          <span>No aplica</span>
                        </label>
                        <input type="hidden" name={`ona_${c.id}`} value={pintados.get(`na_${c.id}`) ?? "0"} />
                        <input type="hidden" name={`omotivo_${c.id}`} value={pintados.get(`motivo_${c.id}`) ?? ""} />
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="hidden font-semibold sm:table-row">
              <th scope="row" className={`bg-muted text-left ${CELDA}`}>
                Total
              </th>
              {datos.variables.map((v) => (
                <td key={v.letra} className={`bg-muted text-right tabular-nums ${CELDA}`}>
                  {totalEnTexto?.[v.letra] ?? "—"}
                </td>
              ))}
              <td className={`bg-muted ${CELDA}`}>
                {total?.texto ? (
                  <ResultadoDeFila
                    f={{
                      estado: "completa",
                      texto: total.texto,
                      semaforo: total.semaforo,
                      cumple: total.cumple,
                      esperaDato: false,
                    }}
                  />
                ) : (
                  "—"
                )}
              </td>
              <td className={`bg-muted ${CELDA}`} />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex min-w-0 flex-col gap-3 lg:col-start-2">
        <div className="hidden sm:block">
          {totalEnTexto ? (
            <ResultadoEnVivo
              calculo={datos.calculo}
              regla={datos.regla}
              unidad={datos.unidad}
              variables={sinLimites}
              valores={totalEnTexto}
              rangos={datos.rangos}
              anterior={datos.anterior}
              variacionPct={datos.variacionPct}
            />
          ) : (
            <SinTotal total={vivo.total as Exclude<TotalEnVivo, { clase: "total" }>} />
          )}
        </div>
        {avisoDeCritico ? <p className={`${AVISO} border-l-estado-critico`}>{avisoDeCritico}</p> : null}
        {avisoDeFalta ? <p className={`${AVISO} border-l-estado-atencion`}>{avisoDeFalta}</p> : null}
        <AvisosDeFalta variables={conAviso} mide />
        {pregunta ? (
          <div className={`${AVISO} border-l-estado-atencion`}>
            {/* Desde 640 px, el resultado del total ya dice la variación. */}
            <p className={total?.variacion ? "sm:hidden" : ""}>{pregunta}</p>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                name="confirmado"
                checked={confirmado}
                onChange={(e) => setConfirmado(e.target.checked)}
                className={`mt-0.5 size-4 ${FOCO} ${SOBRE_EL_PIE}`}
              />
              <span>Sí, los datos son correctos</span>
            </label>
          </div>
        ) : null}
        {datos.soporteObligatorio && !datos.historica ? (
          <p className="text-sm">
            {datos.soportes > 0
              ? `Soporte obligatorio en este indicador: ${cuenta(datos.soportes, "archivo adjunto", "archivos adjuntos")}.`
              : "Este indicador exige un soporte: adjúntelo antes de reportar."}
          </p>
        ) : null}
      </div>
      {/* En el teléfono, el total y los botones quedan fijos abajo; lo que recibe el foco se desplaza sobre ellos. */}
      <div className="sticky bottom-0 z-10 -mx-4 -mb-3 flex flex-col gap-2 border-t border-border bg-card px-4 py-3 sm:static sm:mx-0 sm:mb-0 sm:border-0 sm:bg-transparent sm:p-0 lg:col-start-2 lg:self-start">
        <TotalDelPie total={vivo.total} vivo={total} enCritico={vivo.enCritico.length} dimension={datos.dimension} />
        {mensaje}
        <div className="flex flex-wrap gap-2">
          {datos.reportada ? null : (
            <Boton
              type="submit"
              name="intencion"
              value="parcial"
              onClick={alPulsar}
              variante="secundario"
              pendiente={pendiente}
              className="flex-1 sm:flex-none"
            >
              Guardar sin reportar
            </Boton>
          )}
          <Boton type="submit" name="intencion" value="reportar" onClick={alPulsar} pendiente={pendiente} className="flex-1 sm:flex-none">
            {faltaAjeno ? "Reportar lo mío" : "Reportar"}
          </Boton>
        </div>
      </div>
    </div>
  );
}

/**
 * «Actualizar categorías» (anexo 14C, §5.3), de quien administra, en una medición abierta sin reportar: añade a su lista las
 * categorías que hoy están activas y no estaban. No navega: la pantalla se repinta con la lista nueva y el aviso dice cuántas
 * añadió.
 */
export function ActualizarCategorias({ medicionId }: { medicionId: number }) {
  const [estado, enviar, pendiente] = useActionState<EstadoConAviso, FormData>(actualizarCategoriasDeMedicion, null);
  return (
    <form action={enviar} className="flex flex-col items-start gap-2 rounded-md border border-border px-3 py-2">
      <input type="hidden" name="id" value={medicionId} />
      <p className="text-sm text-muted-foreground">
        Añade a la lista las categorías que hoy están activas y no están en ella; ninguna sale. Una que no operó en el periodo se
        marca «No aplica».
      </p>
      <Boton type="submit" variante="secundario" pendiente={pendiente}>
        Actualizar categorías
      </Boton>
      {estado ? (
        estado.ok ? (
          <p role="status" className="text-sm text-estado-bien-texto">
            {estado.aviso}
          </p>
        ) : (
          <p role="alert" className="text-sm text-estado-critico-texto">
            {estado.error}
          </p>
        )
      ) : null}
    </form>
  );
}
