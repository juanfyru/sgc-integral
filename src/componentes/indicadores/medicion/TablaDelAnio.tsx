import Link from "next/link";
import { CerrarDeNuevo, DialogoReabrir } from "@/componentes/indicadores/cierre/DialogoReabrir";
import type { ReaperturaEnTexto } from "@/db/consultas/indicadores/reapertura";
import { Insignia } from "@/componentes/ui/Insignia";
import { celda, celdaNumerica, TablaDatos, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import type { FilaDelAnio } from "@/db/consultas/indicadores/lectura";
import type { Soporte } from "@/db/consultas/indicadores/soportes";
import { ETIQUETA_ESTADO } from "@/lib/indicadores/estados";
import { analisisDeFila, marcasDeFila } from "@/lib/indicadores/ficha-en-texto";
import { textoDeEspera, textoDeFoto } from "@/lib/indicadores/fotos";
import type { EntradaDeHistorial } from "@/lib/indicadores/historial";
import { textoAcumulaDesde } from "@/lib/indicadores/resultados";
import { rutaDeIndicador, rutaDeSoporteDeDato } from "@/lib/indicadores/rutas";
import { enlaceDeSoporte, type SoporteDeDatoEnPantalla } from "@/lib/indicadores/soportes";
import { zonaHoraria } from "@/lib/zona-horaria";
import { InsigniaEnCritico, InsigniaSemaforo } from "../InsigniaSemaforo";
import { ActualizarCategorias } from "./ActualizarCategorias";
import { VolverACalcular } from "./VolverACalcular";

/** Las columnas de las variables viven con los textos de la ficha: la impresa y el Excel las usan también. */
export { columnasDeVariables } from "@/lib/indicadores/ficha-en-texto";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const ENLACE = `rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`;

/** «Corregida» con su historial (spec §8.7): qué había, qué quedó, quién, cuándo y por qué, desde la reapertura. */
function Historial({ etiqueta, entradas }: { etiqueta: string; entradas: EntradaDeHistorial[] }) {
  return (
    <details className="text-xs">
      <summary className={`cursor-pointer rounded-sm text-marca underline-offset-2 hover:underline ${FOCO}`}>
        Ver el historial<span className="sr-only">{` de ${etiqueta.toLowerCase()}`}</span>
      </summary>
      {/* Al menos 18 rem: la columna del estado se ensancha solo mientras el historial está abierto. */}
      <ol className="mt-1 flex min-w-72 max-w-sm list-none flex-col gap-2">
        {entradas.map((e) => (
          <li key={e.id} className="flex flex-col gap-0.5 break-words">
            <span>
              <b>{e.que}</b>
              {` · ${e.quien} · ${e.cuando}`}
            </span>
            {e.fuente ? <span>{e.fuente}</span> : null}
            {e.porque ? <span>{`Por qué: ${e.porque}`}</span> : null}
            {e.cambios.map((c, i) => (
              <span key={i} className="text-muted-foreground">
                {c}
              </span>
            ))}
          </li>
        ))}
      </ol>
    </details>
  );
}

function Estado({ f, historial, periodosSinCumplir }: { f: FilaDelAnio; historial: EntradaDeHistorial[] | null; periodosSinCumplir: number }) {
  const marcas = marcasDeFila(f, periodosSinCumplir);
  // Un histórico abierto sin datos no se reporta: se registra en la tabla del año (spec §8.8). Solo cambia la etiqueta.
  const etiqueta =
    f.historica && f.estado === "por_reportar"
      ? "Por registrar"
      : f.estado === "por_venir" || f.estado === "sin_dato"
        ? null
        : ETIQUETA_ESTADO[f.estado];
  const estado = etiqueta === null ? null : `${etiqueta}${f.vencida ? " · vencida" : ""}`;
  return (
    <div className="flex flex-col items-start gap-1">
      <InsigniaSemaforo semaforo={f.semaforo} cumple={f.cumple} noAplica={f.noAplica} conResultado={f.resultado !== null} />
      <InsigniaEnCritico n={f.enCritico} dimension={f.dimension} />
      {estado ? <span className="text-xs text-muted-foreground">{estado}</span> : null}
      {marcas.map((m) => (
        <Insignia key={m} variante="neutra">
          {m}
        </Insignia>
      ))}
      {f.corregida && historial && historial.length > 0 ? <Historial etiqueta={f.etiqueta} entradas={historial} /> : null}
    </div>
  );
}

/** El análisis con la regla de `analisisDeFila` (la misma de la ficha impresa y el Excel), con sus rótulos en negrita. */
function Analisis({ f }: { f: FilaDelAnio }) {
  const a = analisisDeFila(f);
  if (a?.tipo === "causa") {
    return (
      <span className="break-words">
        {a.causa ? (
          <>
            <b>Causa:</b> {a.causa}{" "}
          </>
        ) : null}
        {a.accionPropuesta ? (
          <>
            <b>Acción propuesta:</b> {a.accionPropuesta}
          </>
        ) : null}
      </span>
    );
  }
  if (a) return <span className="break-words">{a.texto}</span>;
  return <span className="text-muted-foreground">{f.cumple ? "Sin análisis (cumple)" : "—"}</span>;
}

/**
 * El valor de una variable en un periodo. Si la ficha que rige ese periodo nombra la letra distinto que el encabezado de
 * la columna (el de la versión más reciente), lo dice debajo, en texto: se lee sin cursor y lo leen los lectores de
 * pantalla. La de un componente que la persona no ve llega «No disponible» (anexo 14C, §6.5), en el gris del texto
 * secundario; la de uno más fino que acumula desde después dice desde cuándo, debajo y en texto (§6.3).
 */
function ValorDeVariable({
  columna,
  valor,
  periodo,
}: {
  columna: { letra: string; nombre: string };
  valor: FilaDelAnio["valores"][number] | undefined;
  periodo: string;
}) {
  if (!valor) return <>—</>;
  return (
    <>
      {valor.oculta ? <span className="font-normal text-muted-foreground">{valor.valor}</span> : (valor.valor ?? "—")}
      {valor.acumulaDesde ? (
        <span className="block text-xs font-normal text-muted-foreground">{`(${textoAcumulaDesde(valor.acumulaDesde, periodo)})`}</span>
      ) : null}
      {valor.nombre !== columna.nombre ? <span className="block text-xs font-normal text-muted-foreground">{`(${valor.nombre})`}</span> : null}
    </>
  );
}

/**
 * Los soportes de la medición y, después, los de los datos compartidos que usó (anexo 14C, §4.6), que se descargan por la ruta
 * del dato y lo dicen («dato compartido», con su periodo si el dato es más fino).
 */
function ListaDeSoportes({ codigo, soportes, deDatos }: { codigo: string; soportes: Soporte[]; deDatos: SoporteDeDatoEnPantalla[] }) {
  if (soportes.length === 0 && deDatos.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="flex list-none flex-col gap-1">
      {soportes.map((s) => (
        <li key={s.id}>
          <a href={enlaceDeSoporte(codigo, s)} className={`break-words ${ENLACE}`}>
            {s.nombre}
          </a>
        </li>
      ))}
      {deDatos.map((s) => (
        <li key={`dato-${s.id}`}>
          <a href={rutaDeSoporteDeDato(s.datoId, s.id)} className={`break-words ${ENLACE}`}>
            {s.nombre}
          </a>
          <span className="block text-xs text-muted-foreground">{s.deQue ? `Dato compartido · ${s.deQue}` : "Dato compartido"}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * La tabla del año (spec §8.5, §8.3 y §12.3; maqueta 2): una fila por periodo con sus valores, el resultado, la meta, la
 * columna «Cumple», el estado con sus marcas y el análisis; los soportes, en su columna, solo para quien los ve (`soportes`
 * es `null` para los demás, y entonces no hay columna). Quien puede medir tiene en cada periodo abierto
 * el enlace para reportarlo o corregirlo (un histórico se registra en el modo edición, spec §8.8), salvo en uno que
 * calcula el sistema (`automatica`, anexo 14B §4) o que nadie mide (`nadieLoMide`, anexo 14C §3.1), que quien puede
 * analizar abre con «Ver» en su pantalla de solo lectura;
 * quien puede analizar tiene además el de escribir o editar el análisis de lo que tiene resultado. Quien administra reabre una cerrada (`puedeReabrir`) y
 * cierra de nuevo una reabierta (`puedeCerrarDeNuevo`, spec §8.7); una corregida lleva su historial (`historial`). Las
 * marcas acompañan al estado (spec §8.5): «Histórico», «Corregida», «Requiere acción de mejora», «Meta ajustada después del
 * periodo», «N periodos sin cumplir» y «Periodicidad anterior», que no se toca (la dejó un cambio mayor); en un desagregado,
 * cuántas categorías quedaron en Crítico («1 en Crítico», anexo 14C §5.6), que no cambia el estado del total. Una fila que
 * calcula el sistema dice cuándo se tomaron sus datos («Calculado por el sistema · foto del …») o cuándo se tomarán («Se
 * calcula el …»), y quien administra (`puedeVolverACalcular`) vuelve a calcular la foto de un cálculo de flujo sin cerrar ni
 * reabrir (anexo 14B, §5.4), y actualiza las categorías de un desagregado abierto sin reportar (`puedeActualizarCategorias`,
 * anexo 14C §5.3), aunque no lo mida. Cada fila lleva
 * el ancla `periodo-<clave>`: la matriz del año enlaza a ella. Las columnas de las variables son las que pasa quien llama
 * (`columnasDeVariables`: la unión de las letras del año); un periodo cuya ficha no tiene una, la deja en «—».
 */
export function TablaDelAnio({
  filas,
  variables,
  anio,
  codigo,
  puedeMedir,
  puedeAnalizar = false,
  soportes = null,
  soportesDeDatos = null,
  puedeReabrir = false,
  puedeCerrarDeNuevo = false,
  puedeVolverACalcular = false,
  puedeActualizarCategorias = false,
  historial = null,
  reaperturas = null,
  periodosSinCumplir = 3,
}: {
  filas: FilaDelAnio[];
  variables: { letra: string; nombre: string }[];
  anio: number;
  codigo: string;
  puedeMedir: boolean;
  puedeAnalizar?: boolean;
  /** Los soportes de cada medición, solo a quien ve los soportes del indicador. */
  soportes?: Map<number, Soporte[]> | null;
  /** En esa misma columna, los soportes de los datos compartidos que usó cada medición (anexo 14C, §4.6). */
  soportesDeDatos?: Map<number, SoporteDeDatoEnPantalla[]> | null;
  puedeReabrir?: boolean;
  puedeCerrarDeNuevo?: boolean;
  /** Quien administra un indicador activo vuelve a calcular la foto de un cálculo de flujo (anexo 14B, §5.4). */
  puedeVolverACalcular?: boolean;
  /** Quien administra un indicador activo actualiza las categorías de un desagregado abierto sin reportar (anexo 14C, §5.3). */
  puedeActualizarCategorias?: boolean;
  /** El historial de cada medición corregida, por medición. */
  historial?: Map<number, EntradaDeHistorial[]> | null;
  /** Lo que se reabre con cada medición cerrada que otras usaron (anexo 14C, §3.5), por medición; las demás, sin lista. */
  reaperturas?: Map<number, ReaperturaEnTexto> | null;
  /** El parámetro del incumplimiento repetido (spec §10.3), para la marca «3 periodos sin cumplir». */
  periodosSinCumplir?: number;
}) {
  const conAcciones = puedeMedir || puedeAnalizar || puedeReabrir || puedeCerrarDeNuevo || puedeVolverACalcular || puedeActualizarCategorias;
  const zona = zonaHoraria();
  const columnas: ColumnaTabla[] = [
    { clave: "periodo", etiqueta: "Periodo" },
    ...variables.map((v) => ({ clave: `var-${v.letra}`, etiqueta: v.nombre, numerica: true })),
    { clave: "resultado", etiqueta: "Resultado", numerica: true },
    { clave: "meta", etiqueta: "Meta", numerica: true },
    { clave: "cumple", etiqueta: "Cumple" },
    { clave: "estado", etiqueta: "Estado" },
    { clave: "analisis", etiqueta: "Análisis" },
    ...(soportes ? [{ clave: "soportes", etiqueta: "Soportes" }] : []),
    ...(conAcciones ? [{ clave: "acciones", etiqueta: "Acciones", oculta: true }] : []),
  ];
  return (
    <TablaDatos titulo={`Resultados de ${anio}`} columnas={columnas} filas={filas.length} vacio={`No hay periodos que medir en ${anio}.`}>
      {filas.map((f) => {
        // Lo que calcula el sistema: cuándo tomó sus datos o cuándo los tomará. Mientras los espera, esa es su fecha.
        const delSistema = f.fotoEn ? `Calculado por el sistema · ${textoDeFoto(f.fotoEn, zona)}` : f.seCalcula ? textoDeEspera(f.seCalcula, zona) : null;
        const esperaLaFoto = f.automatica && f.fotoEn === null;
        const cabecera = (
          <th scope="row" className={`${celda} text-left font-medium`}>
            {f.etiqueta}
            {f.vence && f.estado !== "cerrada" && f.estado !== "reportada" && !f.historica && !f.deOtraPeriodicidad && !esperaLaFoto ? (
              <span className="block text-xs font-normal text-muted-foreground">{`Plazo hasta el ${f.vence}`}</span>
            ) : null}
            {delSistema ? <span className="block text-xs font-normal text-muted-foreground">{delSistema}</span> : null}
          </th>
        );
        const ancla = `periodo-${f.periodo}`;
        if (f.estado === "por_venir" || f.estado === "sin_dato") {
          return (
            <tr key={f.periodo} id={ancla} className="scroll-mt-24">
              {cabecera}
              <td colSpan={columnas.length - 1} className={`${celda} text-muted-foreground`}>
                {f.estado === "por_venir" ? "Por venir: el periodo no ha terminado." : "Sin dato: no se midió."}
              </td>
            </tr>
          );
        }
        // Una medición de otra periodicidad no se toca: nadie puede reportarla, analizarla ni reabrirla.
        const tocable = f.medicionId !== null && f.deOtraPeriodicidad !== true;
        // Lo que nadie mide (lo calcula el sistema o no tiene variables propias) no se reporta ni se corrige: quien lo
        // analiza lo ve en su pantalla de solo lectura. Los históricos de una ficha manual se registran en el modo edición.
        const nadieLoMide = f.nadieLoMide === true;
        const reportable = puedeMedir && tocable && !f.automatica && !nadieLoMide && f.estado !== "cerrada" && !f.historica;
        const deSoloLectura = puedeAnalizar && tocable && (f.automatica || (nadieLoMide && !f.historica));
        const analizable = puedeAnalizar && tocable && f.estado !== "cerrada" && f.resultado !== null && !f.noAplica;
        const conAnalisis = f.analisis !== null || f.causa !== null || f.accionPropuesta !== null;
        const reabrible = puedeReabrir && tocable && f.estado === "cerrada";
        // Corregida y sin cerrar: solo la reapertura marca «corregida».
        const reabierta = puedeCerrarDeNuevo && tocable && f.corregida && f.estado !== "cerrada";
        const recalculable = puedeVolverACalcular && tocable && f.recalculable;
        const actualizable = puedeActualizarCategorias && tocable && f.actualizable && f.medicionId !== null;
        return (
          <tr key={f.periodo} id={ancla} className="scroll-mt-24">
            {cabecera}
            {variables.map((v) => (
              <td key={v.letra} className={celdaNumerica}>
                <ValorDeVariable columna={v} valor={f.valores.find((x) => x.letra === v.letra)} periodo={f.periodo} />
              </td>
            ))}
            <td className={`${celdaNumerica} whitespace-nowrap`}>{f.resultado ?? (f.noAplica ? "n. a." : "—")}</td>
            <td className={`${celdaNumerica} whitespace-nowrap`}>{f.meta}</td>
            <td className={celda}>{f.cumple === null ? "—" : f.cumple ? "Sí" : "No"}</td>
            <td className={celda}>
              <Estado f={f} historial={f.medicionId === null ? null : (historial?.get(f.medicionId) ?? null)} periodosSinCumplir={periodosSinCumplir} />
            </td>
            <td className={`${celda} min-w-48`}>
              <Analisis f={f} />
            </td>
            {soportes ? (
              <td className={`${celda} min-w-32`}>
                <ListaDeSoportes
                  codigo={codigo}
                  soportes={f.medicionId === null ? [] : (soportes.get(f.medicionId) ?? [])}
                  deDatos={f.medicionId === null ? [] : (soportesDeDatos?.get(f.medicionId) ?? [])}
                />
              </td>
            ) : null}
            {conAcciones ? (
              <td className={celda}>
                <div className="flex flex-col items-start gap-1">
                  {reportable ? (
                    <Link href={`${rutaDeIndicador(codigo)}/reportar/${f.periodo}`} className={ENLACE}>
                      {f.estado === "por_reportar" ? "Reportar" : "Corregir"}
                      <span className="sr-only">{` ${f.etiqueta.toLowerCase()}`}</span>
                    </Link>
                  ) : null}
                  {deSoloLectura ? (
                    <Link href={`${rutaDeIndicador(codigo)}/reportar/${f.periodo}`} className={ENLACE}>
                      Ver
                      <span className="sr-only">{` ${f.etiqueta.toLowerCase()}`}</span>
                    </Link>
                  ) : null}
                  {analizable ? (
                    <Link href={`${rutaDeIndicador(codigo)}?vista=resultados&anio=${anio}&analizar=${f.periodo}#analisis`} className={ENLACE}>
                      {conAnalisis ? "Editar el análisis" : "Analizar"}
                      <span className="sr-only">{` ${f.etiqueta.toLowerCase()}`}</span>
                    </Link>
                  ) : null}
                  {reabrible ? (
                    <DialogoReabrir medicionId={f.medicionId!} codigo={codigo} etiqueta={f.etiqueta} reapertura={reaperturas?.get(f.medicionId!) ?? null} />
                  ) : null}
                  {reabierta ? <CerrarDeNuevo medicionId={f.medicionId!} etiqueta={f.etiqueta} /> : null}
                  {recalculable ? <VolverACalcular medicionId={f.medicionId!} etiqueta={f.etiqueta} /> : null}
                  {actualizable ? <ActualizarCategorias medicionId={f.medicionId!} etiqueta={f.etiqueta} /> : null}
                </div>
              </td>
            ) : null}
          </tr>
        );
      })}
    </TablaDatos>
  );
}
