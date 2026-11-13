"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { abrirCambioAccion, crearIndicadorAccion, guardarBorradorAccion } from "@/app/acciones-indicadores";
import { enviarSinReiniciar } from "@/componentes/admin/sin-reiniciar";
import { Boton, claseBoton } from "@/componentes/ui/Boton";
import { Campo, claseControl } from "@/componentes/ui/Campo";
import type { DatosFicha } from "@/lib/esquemas/indicadores";
import { analizar } from "@/lib/indicadores/formula/analizar";
import { enPalabras, FACTORES_TASA, formulaDeForma, letrasDeForma, unidadDeForma } from "@/lib/indicadores/formula/formas";
import { fraccion } from "@/lib/indicadores/formula/fraccion";
import { rangosATexto, rangosDeTexto, type RangosEnTexto } from "@/lib/indicadores/rangos";
import { rangosEquivalentes, type Regla } from "@/lib/indicadores/semaforo";
import {
  CONSOLIDACIONES,
  ETIQUETA_PERIODICIDAD,
  PERIODICIDADES,
  TENDENCIAS,
  type Consolidacion,
  type Forma,
  type ModoSemaforo,
  type OpcionesFicha,
  type Periodicidad,
  type Tendencia,
} from "@/lib/indicadores/tipos";
import { EditorDeRangos, estadoDeRangos, rangosDelEditor } from "./EditorDeRangos";
import { PruebaFormula } from "./PruebaFormula";
import { conMiles, SelectorForma } from "./SelectorForma";
import { VistaSemaforo } from "./VistaSemaforo";

type Variable = DatosFicha["variables"][number];

/** Editar un borrador: su versión; `cambio` si ya hay una ficha aprobada; `codigoFijo` si el proceso y el código ya no cambian. */
export type EdicionFicha = { versionId: number; cambio: boolean; codigoFijo: boolean };

const CONTROL = `${claseControl} w-full min-w-0 max-w-full`;
const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";
const RESUMEN = `cursor-pointer rounded-md text-sm font-medium ${FOCO}`;

const ETIQUETA_TENDENCIA: Record<Tendencia, string> = {
  ascendente: "Ascendente (mayor es mejor)",
  descendente: "Descendente (menor es mejor)",
  constante: "Constante (mantenerse en un rango)",
};
const ETIQUETA_CONSOLIDACION: Record<Consolidacion, string> = { suma: "Se suma", ultimo: "Último valor", promedio: "Promedio" };
/** Qué es cada variable en las formas que la arman solas (spec §7.4). */
const PAPEL: Record<Exclude<Forma, "libre">, readonly string[]> = {
  porcentaje: ["Numerador", "Denominador"],
  tasa: ["Casos", "Población"],
  razon: ["Suma", "Cantidad"],
  conteo: ["Conteo"],
};
const LETRAS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** El elemento de ese nombre (spec §12.4: tipo «Eficacia», clasificación «Operativo») o, si no existe, el primero. */
const porNombre = (lista: readonly { id: number; nombre: string }[], nombre: string) =>
  (lista.find((x) => sinTildes(x.nombre) === sinTildes(nombre)) ?? lista[0])?.id;
/** «80.5» de la BD se escribe «80,5». */
const conComa = (v: string | undefined) => (v === undefined ? "" : v.replace(".", ","));
const variableNueva = (letra: string): Variable => ({ letra, nombre: "", consolidacion: "suma", admiteNegativos: false });

function variablesDeForma(forma: Forma, actuales: readonly Variable[]): Variable[] {
  if (forma === "libre") return actuales.length > 0 ? [...actuales] : [variableNueva("A")];
  return letrasDeForma(forma).map((letra) => actuales.find((v) => v.letra === letra) ?? variableNueva(letra));
}

/** Lo que viaja en el campo oculto `variables`: sin los textos vacíos, que el esquema lee como «no vino». */
function limpia(v: Variable): Variable {
  const opcional = (t: string | undefined) => (t && t.trim() ? t.trim() : undefined);
  return {
    letra: v.letra,
    nombre: v.nombre.trim(),
    descripcion: opcional(v.descripcion),
    fuente: opcional(v.fuente),
    unidad: opcional(v.unidad),
    consolidacion: v.consolidacion,
    capturaMin: opcional(v.capturaMin),
    capturaMax: opcional(v.capturaMax),
    admiteNegativos: v.admiteNegativos,
  };
}

/** La sigla que da el código de una elección: la del subproceso si tiene, si no la del proceso. */
export function siglaVigenteDe(opciones: OpcionesFicha, procesoId: number | "", subprocesoId: number | ""): string | null {
  if (procesoId === "") return null;
  const delSub = subprocesoId === "" ? null : (opciones.subprocesos.find((s) => s.id === subprocesoId)?.sigla ?? null);
  return delSub ?? opciones.procesos.find((p) => p.id === procesoId)?.sigla ?? null;
}

/** El código que se propone para una elección: `SIGLA-ID-NNN` del subproceso con sigla o, si no, del proceso. */
export function codigoPropuestoDe(opciones: OpcionesFicha, procesoId: number | "", subprocesoId: number | ""): string {
  if (procesoId === "") return "";
  const delSub = subprocesoId === "" ? undefined : opciones.codigosPropuestos.subprocesos[subprocesoId];
  return delSub ?? opciones.codigosPropuestos.procesos[procesoId] ?? "";
}

/**
 * El código al cambiar de proceso o de subproceso (spec §7.1: la sigla decide el código): el propuesto de la elección nueva
 * si nadie lo tocó, si quedó vacío o si aún lleva el prefijo de la elección anterior (`SIGLA-ID-` o el antiguo
 * `SIGLA-IND-`); si no, el que escribió la persona.
 */
export function codigoAlCambiarDeProceso(codigo: string, tocado: boolean, siglaAnterior: string | null, propuesto: string): string {
  const actual = codigo.trim().toLowerCase();
  const delAnterior =
    siglaAnterior !== null &&
    (actual.startsWith(`${siglaAnterior}-ID-`.toLowerCase()) || actual.startsWith(`${siglaAnterior}-IND-`.toLowerCase()));
  return !tocado || actual === "" || delAnterior ? propuesto : codigo;
}

/** Como `codigoAlCambiarDeProceso`, pero si la sigla vigente no cambia (sin distinguir mayúsculas) el código no se toca. */
export function codigoAlCambiarDeEleccion(
  codigo: string,
  tocado: boolean,
  siglaAnterior: string | null,
  siglaNueva: string | null,
  propuesto: string,
): string {
  if ((siglaAnterior ?? "").toLowerCase() === (siglaNueva ?? "").toLowerCase()) return codigo;
  return codigoAlCambiarDeProceso(codigo, tocado, siglaAnterior, propuesto);
}

/** Un dato que aquí solo se muestra: sin `name`, el valor viaja aparte. */
function SoloLectura({ id, etiqueta, valor, ayuda }: { id: string; etiqueta: string; valor: string; ayuda: string }) {
  return (
    <Etiquetado id={id} etiqueta={etiqueta} ayuda={ayuda}>
      <input id={id} readOnly value={valor} className={CONTROL} />
    </Etiquetado>
  );
}

const EN_OPERACION = "Es un dato de operación: se cambia en «Datos de operación», no en la ficha.";

function Etiquetado({ id, etiqueta, ayuda, children }: { id: string; etiqueta: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {etiqueta}
      </label>
      {children}
      {ayuda ? <p className="text-xs text-muted-foreground">{ayuda}</p> : null}
    </div>
  );
}

/** Una lista de casillas (cargos, normas): cada una con su etiqueta. */
function Casillas({
  prefijo,
  leyenda,
  ayuda,
  opciones,
  elegidas,
  alCambiar,
  error,
}: {
  prefijo: string;
  leyenda: string;
  ayuda?: string;
  opciones: { id: number; nombre: string }[];
  elegidas: readonly number[];
  alCambiar: (ids: number[]) => void;
  /** El error del servidor sobre este grupo: va junto a él y lo describe (Tarea 19, D-13). */
  error?: string;
}) {
  return (
    // Enfocable desde el código: un error del servidor sobre este campo lleva el foco aquí (`campoDelError`).
    <fieldset id={prefijo} tabIndex={-1} aria-describedby={error ? `${prefijo}-error` : undefined} className="min-w-0">
      <legend className="text-sm font-medium">{leyenda}</legend>
      {ayuda ? <p className="text-xs text-muted-foreground">{ayuda}</p> : null}
      <ErrorDeCampo id={prefijo} error={error} />
      {opciones.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">No hay opciones para elegir.</p>
      ) : (
        <ul className="mt-1 flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
          {opciones.map((o) => {
            const id = `${prefijo}-${o.id}`;
            const marcada = elegidas.includes(o.id);
            return (
              <li key={o.id} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id={id}
                  checked={marcada}
                  onChange={() => alCambiar(marcada ? elegidas.filter((x) => x !== o.id) : [...elegidas, o.id])}
                  className="mt-1"
                />
                <label htmlFor={id} className="text-sm">
                  {o.nombre}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}

/**
 * Los errores del servidor sobre un campo que vive en «Más opciones», plegado: el `id` del control (o del grupo de
 * casillas) al que llevar el foco tras abrirlo. `null` si el campo está a la vista.
 */
const CAMPOS_DE_MAS_OPCIONES: readonly [RegExp, string][] = [
  [/^(Elija el tipo|El tipo no existe)/, "ficha-tipoId"],
  [/^(Elija la clasificación$|La clasificación no existe)/, "ficha-clasificacionId"],
  [/^(Elija la unidad del resultado|La unidad no existe)/, "ficha-unidadId"],
  [/^Los decimales/, "ficha-decimales"],
  [/^El requisito/, "ficha-requisito"],
  [/^El objetivo que mide/, "ficha-objetivoId"],
  [/^El procedimiento/, "ficha-procedimientoDocumentoId"],
  [/^El punto de control/, "ficha-puntoControl"],
  [/^(Las normas|Elija hasta 20 normas|Un indicador regulatorio|Solo se pueden citar normas|La norma no existe)/, "ficha-norma"],
  [/(cargos? responsables? de analizar)/, "ficha-cargo-analizar"],
  [/^(Los cargos responsables|Elija al menos un cargo responsable de medir|Elija hasta 20 cargos)/, "ficha-cargo-medir"],
  [/^La línea base/, "ficha-lineaBaseValor"],
  [/^El periodo de la línea base/, "ficha-lineaBasePeriodo"],
  [/^La nota de la línea base/, "ficha-lineaBaseNota"],
  [/^El sustento de la meta/, "ficha-sustentoMeta"],
  [/^El nivel$|^El nivel /, "ficha-nivel"],
  [/^El riesgo asociado/, "ficha-riesgoAsociado"],
  [/^El mínimo del resultado/, "ficha-resultadoMin"],
  [/^El máximo del resultado/, "ficha-resultadoMax"],
  [/^(La descripción de una variable|La unidad de una variable|El mínimo de captura|El máximo de captura|Diga si cada variable|Elija cómo se junta)/, "ficha-detalle-variables"],
  [/^(Elija el inicio de medición$|El inicio de medición)/, "ficha-inicioMedicion"],
  [/^Elija el nivel de acceso/, "ficha-nivelAcceso"],
  [/^El ente/, "ficha-ente"],
  [/^Elija con qué periodicidad se reporta al ente/, "ficha-periodicidadExterna"],
  [/^El plazo del ente/, "ficha-plazoExternoDias"],
];

export function campoDeMasOpciones(mensaje: string): string | null {
  return CAMPOS_DE_MAS_OPCIONES.find(([patron]) => patron.test(mensaje))?.[1] ?? null;
}

/**
 * Los errores de los rangos escritos (los de `errorDeRangos`, los del contrato de la ficha y «La meta debe quedar dentro
 * del rango de Bien»): van junto al editor, no junto a la meta.
 */
const RANGOS_ESCRITOS =
  /^(Escriba los rangos del semáforo|Un cambio mayor escribe los rangos|Complete los valores de cada rango|Los rangos del semáforo no tienen|Los valores de los rangos|Un estado admite|Solo «entre» lleva|Escriba el rango de|En «|Cada estado lleva|Para mantenerse en un rango|Los rangos de .+ se cruzan|El rango de .+ queda dentro|Entre .+ queda un hueco|La meta debe quedar dentro del rango de Bien)/;

/** Los errores del servidor sobre un campo que está a la vista: el `id` del control o del grupo. */
const CAMPOS_A_LA_VISTA: readonly [RegExp, string][] = [
  [
    /^(Escriba la fórmula|La fórmula|La variable [A-Z] (no se usa|está repetida)|Falta (cerrar|un valor|un operador|el paréntesis)|Separe los argumentos|Carácter no admitido|Nombre no reconocido|Número demasiado largo|Cada variable es una sola letra|Hay un paréntesis)/,
    "ficha-formula",
  ],
  [/^(Ya existe un indicador con el código|El código)/, "ficha-codigo"],
  [/^(El nombre de cada variable|Declare al menos una variable|Una ficha admite hasta|Las variables no tienen|Cada variable lleva una letra)/, "ficha-variables"],
  [/^El nombre/, "ficha-nombre"],
  [/^(Elija el proceso$|El proceso no existe)/, "ficha-procesoId"],
  [/^El subproceso/, "ficha-subprocesoId"],
  [/^El objetivo del indicador/, "ficha-proposito"],
  [/^Elija la periodicidad/, "ficha-periodicidad"],
  [/^El plazo de reporte/, "ficha-plazoReporteDias"],
  [/^Elija la tendencia/, "ficha-tendencia"],
  [RANGOS_ESCRITOS, "ficha-rangos"],
  [/^El máximo del rango/, "ficha-metaMax"],
  [/^(La meta|Con meta)/, "ficha-meta"],
  [/^La tolerancia/, "ficha-tolerancia"],
  [/^Elija el modo del semáforo/, "ficha-semaforoModo"],
  [/^El umbral de atención/, "ficha-umbralAtencionPct"],
  [/^(Escriba el límite de crítico|El límite de crítico)/, "ficha-limiteCritico"],
  [/^El motivo del cambio/, "ficha-motivoCambio"],
];

/**
 * El campo al que se refiere un error del servidor al guardar la ficha (Tarea 19, D-13): el mensaje va junto a él, lo
 * describe (`aria-describedby`) y el foco va a él, abriendo «Más opciones» si hace falta. `null` si
 * el error no es de un campo: queda al pie del formulario.
 */
export function campoDelError(mensaje: string): string | null {
  return CAMPOS_A_LA_VISTA.find(([patron]) => patron.test(mensaje))?.[1] ?? campoDeMasOpciones(mensaje);
}

/** El error junto a un grupo de controles (los campos de `Campo` lo pintan ellos mismos). */
function ErrorDeCampo({ id, error }: { id: string; error?: string }) {
  return error ? (
    <p id={`${id}-error`} role="alert" className="text-xs text-estado-critico-texto">
      {error}
    </p>
  ) : null;
}

/**
 * El formulario de la ficha (spec §12.4, maqueta 6): primero cómo se calcula; a la vista lo del caso común, «Así quedará
 * el semáforo» y la prueba; lo demás de §7.2 y §7.3 en «Más opciones», plegado, con sus valores por omisión. Las
 * variables y las listas viajan como JSON en campos ocultos. Sin `edicion`, crea el indicador; con ella, guarda el
 * borrador.
 */
export function FormularioFicha({
  opciones,
  valores = {},
  edicion,
  errorInicial,
}: {
  opciones: OpcionesFicha;
  valores?: Partial<DatosFicha>;
  edicion?: EdicionFicha;
  /** Un error ya dado, como si el servidor lo acabara de devolver (para pintarlo junto a su campo en las pruebas). */
  errorInicial?: string;
}) {
  const [estado, enviar, pendiente] = useActionState(
    edicion ? guardarBorradorAccion : crearIndicadorAccion,
    errorInicial ? { ok: false as const, error: errorInicial } : null,
  );
  const masOpciones = useRef<HTMLDetailsElement>(null);
  // Un error sobre un campo: el foco va a él, abriendo antes los plegables que lo contienen («Más opciones», «Cambiar
  // rangos»), para que la persona lo vea junto a su mensaje.
  useEffect(() => {
    const id = estado?.error ? campoDelError(estado.error) : null;
    if (!id) return;
    const campo = document.getElementById(id);
    if (!campo) {
      const detalles = masOpciones.current;
      if (detalles && campoDeMasOpciones(estado?.error ?? "")) {
        detalles.open = true;
        detalles.querySelector("summary")?.focus();
      }
      return;
    }
    for (let d = campo.closest("details"); d; d = d.parentElement?.closest("details") ?? null) d.open = true;
    campo.focus();
  }, [estado]);
  /** Los cargos por omisión (spec §12.4): el de la persona designada o, sin persona, los de los líderes activos del proceso. */
  const cargosPorOmision = (usuario: number | "", proceso: number | ""): number[] => {
    if (usuario !== "") {
      const cargo = opciones.usuarios.find((u) => u.id === usuario)?.cargoId;
      return cargo === null || cargo === undefined ? [] : [cargo];
    }
    return proceso === "" ? [] : [...(opciones.cargosDeLideres[proceso] ?? [])];
  };
  const formaInicial = valores.forma ?? "porcentaje";
  // La unidad sigue a la forma mientras nadie la elija a mano: un conteo no queda en «%» (Tarea 19, D-3).
  const unidadPorForma = (f: Forma, fa: number) => unidadDeForma(f, fa, opciones.unidades);
  const unidadInicial = valores.unidadId ?? unidadPorForma(formaInicial, valores.factor ?? 1000) ?? opciones.unidades[0]?.id;
  // Quien llena la ficha no queda designado solo: sin persona, mide el líder del proceso (F14-DC10, spec §6.3).
  const mideInicial: number | "" = valores.mide ? (valores.mide[0] ?? "") : "";
  const analizaInicial: number | "" | "misma" =
    valores.analiza === undefined || (valores.analiza.length === 1 && valores.analiza[0] === mideInicial) ? "misma" : (valores.analiza[0] ?? "");

  const [forma, setForma] = useState<Forma>(formaInicial);
  const [factor, setFactor] = useState(valores.factor ?? 1000);
  const [formula, setFormula] = useState(valores.formula ?? "");
  const [variables, setVariables] = useState<Variable[]>(() => variablesDeForma(formaInicial, valores.variables ?? []));
  const [procesoId, setProcesoId] = useState<number | "">(valores.procesoId ?? "");
  const [subprocesoId, setSubprocesoId] = useState<number | "">(valores.subprocesoId ?? "");
  const [procedimientoId, setProcedimientoId] = useState<number | "">(valores.procedimientoDocumentoId ?? "");
  const [codigo, setCodigo] = useState(valores.codigo ?? codigoPropuestoDe(opciones, valores.procesoId ?? "", valores.subprocesoId ?? ""));
  const [codigoTocado, setCodigoTocado] = useState(valores.codigo !== undefined);
  const [periodicidad, setPeriodicidad] = useState<Periodicidad>(valores.periodicidad ?? "trimestral");
  const [inicio, setInicio] = useState(valores.inicioMedicion ?? opciones.periodoEnCurso[valores.periodicidad ?? "trimestral"]);
  const [tendencia, setTendencia] = useState<Tendencia>(valores.tendencia ?? "ascendente");
  const [meta, setMeta] = useState(conComa(valores.meta));
  const [metaMax, setMetaMax] = useState(conComa(valores.metaMax));
  const [tolerancia, setTolerancia] = useState(conComa(valores.tolerancia));
  // La regla anterior (relativa o con límite fijo) de una ficha que ya tiene meta: no se reescribe sola (spec 14A §3.5).
  const modo: ModoSemaforo = valores.semaforoModo ?? "relativo";
  // Solo una ficha con versión aprobada (un cambio) conserva la regla anterior; un borrador inicial no (Ruling 18): el
  // servidor nunca la guarda en una ficha nueva, así que ahí el editor aparece de una vez, con los rangos equivalentes.
  const conReglaAnterior = valores.rangos === undefined && (valores.meta ?? "").trim() !== "";
  const esAntigua = conReglaAnterior && edicion?.cambio === true;
  const [escribiendo, setEscribiendo] = useState(false);
  // Cuántas veces se pidió llevar el foco a la primera fila: el efecto depende solo de este contador, así que cambiar la
  // tendencia (que remonta el editor) no vuelve a mover el foco.
  const [pidioFoco, setPidioFoco] = useState(0);
  const rangosGuardados = valores.rangos === undefined ? null : (JSON.parse(valores.rangos) as RangosEnTexto);
  const [rangosIniciales, setRangosIniciales] = useState<RangosEnTexto | null>(rangosGuardados);
  const [claveEditor, setClaveEditor] = useState(0);
  const [rangos, setRangos] = useState<RangosEnTexto>(() =>
    rangosDelEditor(estadoDeRangos(valores.tendencia ?? "ascendente", rangosGuardados)),
  );
  const umbral = String(valores.umbralAtencionPct ?? opciones.umbralAtencionPct);
  const limite = conComa(valores.limiteCritico);
  const [resultadoMin, setResultadoMin] = useState(conComa(valores.resultadoMin));
  const [resultadoMax, setResultadoMax] = useState(conComa(valores.resultadoMax));
  const [unidadId, setUnidadId] = useState<number | "">(unidadInicial ?? "");
  const [unidadTocada, setUnidadTocada] = useState(valores.unidadId !== undefined);
  const [decimales, setDecimales] = useState(valores.decimales ?? opciones.unidades.find((u) => u.id === unidadInicial)?.decimales ?? 0);
  const [decimalesTocados, setDecimalesTocados] = useState(valores.decimales !== undefined);
  const [clasificacionId, setClasificacionId] = useState<number | "">(valores.clasificacionId ?? porNombre(opciones.clasificaciones, "Operativo") ?? "");
  const [mide, setMide] = useState<number | "">(mideInicial);
  const [analiza, setAnaliza] = useState<number | "" | "misma">(analizaInicial);
  const [cargosMedir, setCargosMedir] = useState<number[]>(valores.cargosMedir ?? cargosPorOmision(mideInicial, valores.procesoId ?? ""));
  const [cargosAnalizar, setCargosAnalizar] = useState<number[]>(
    valores.cargosAnalizar ?? cargosPorOmision(analizaInicial === "misma" ? mideInicial : analizaInicial, valores.procesoId ?? ""),
  );
  const [cargosTocados, setCargosTocados] = useState({ medir: valores.cargosMedir !== undefined, analizar: valores.cargosAnalizar !== undefined });
  const [normaIds, setNormaIds] = useState<number[]>(valores.normaIds ?? []);
  const [prueba, setPrueba] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(valores.prueba?.valores ?? {}).map(([letra, v]) => [letra, conComa(v)])),
  );

  // «Escribir los rangos» desmonta su botón: el foco pasa a la primera fila del editor, no se pierde en la página.
  useEffect(() => {
    if (pidioFoco > 0) document.getElementById("rango-bien-signo")?.focus();
  }, [pidioFoco]);

  const formulaVigente = forma === "libre" ? formula : formulaDeForma(forma, forma === "tasa" ? factor : undefined);
  const analisis = analizar(formulaVigente);
  const nombres = Object.fromEntries(variables.map((v) => [v.letra, v.nombre.trim() || v.letra]));
  const etiqueta = (v: Variable, i: number) => (forma === "libre" ? `Variable ${v.letra}` : `${v.letra} · ${PAPEL[forma][i]}`);
  const unidad = opciones.unidades.find((u) => u.id === unidadId);
  const vista = { sufijo: unidad?.sufijo ?? "", decimales };
  const constante = tendencia === "constante";
  const reglaAntigua: Regla = {
    tendencia,
    meta: fraccion(meta.trim()),
    metaMax: constante ? fraccion(metaMax.trim()) : null,
    modo: constante ? null : modo,
    umbralPct: !constante && modo === "relativo" && /^\d{1,2}$/.test(umbral.trim()) ? Number(umbral) : null,
    limite: !constante && modo === "fijo" ? fraccion(limite.trim()) : null,
    tolerancia: constante ? fraccion(tolerancia.trim()) : null,
  };
  const errorDeRangosDelServidor = estado?.error ? campoDelError(estado.error) === "ficha-rangos" : false;
  // Un error de los rangos, o una ficha inicial con la regla vieja, abren el editor por el mismo camino de «Escribir los
  // rangos» (parte de los rangos equivalentes) y queda abierto: `escribiendo` no se deshace.
  if (conReglaAnterior && !escribiendo && (!esAntigua || errorDeRangosDelServidor)) escribirLosRangos(null);
  const usaRangos = !esAntigua || escribiendo;
  const regla: Regla = usaRangos
    ? { ...reglaAntigua, modo: "rangos", umbralPct: null, limite: null, tolerancia: null, rangos: rangosDeTexto(rangos) }
    : reglaAntigua;
  const clasificacion = opciones.clasificaciones.find((c) => c.id === clasificacionId);
  const subprocesos = opciones.subprocesos.filter((s) => s.procesoId === procesoId);
  const documentos = opciones.documentos.filter((d) => procesoId !== "" && d.procesoIds.includes(procesoId));
  const proceso = opciones.procesos.find((p) => p.id === procesoId);
  const bloqueado = edicion?.codigoFijo === true;
  // El cambio de una ficha aprobada no toca los datos de operación (spec §7.3): se muestran y viajan como están.
  const operacionFija = edicion?.cambio === true;
  const listaMide = operacionFija ? (valores.mide ?? []) : mide === "" ? [] : [mide];
  const listaAnaliza = operacionFija ? (valores.analiza ?? []) : analiza === "misma" ? listaMide : analiza === "" ? [] : [analiza];
  const nombresDe = (ids: readonly number[]) =>
    ids.length === 0 ? "(el líder del proceso)" : ids.map((id) => opciones.usuarios.find((u) => u.id === id)?.nombre ?? `Usuario ${id}`).join(", ");
  const etiquetaDeInicio = (clave: string | undefined) =>
    clave === undefined ? "" : (Object.values(opciones.periodos).flat().find((p) => p.clave === clave)?.etiqueta ?? clave);

  const cambiarVariable = (letra: string, cambio: Partial<Variable>) =>
    setVariables((vs) => vs.map((v) => (v.letra === letra ? { ...v, ...cambio } : v)));

  function elegirForma(f: Forma) {
    if (f === "libre" && !formula.trim()) setFormula(formulaVigente);
    setForma(f);
    setVariables((vs) => variablesDeForma(f, vs));
    sugerirUnidad(f, factor);
  }

  function sugerirUnidad(f: Forma, fa: number) {
    const u = unidadPorForma(f, fa);
    if (!unidadTocada && u !== undefined) {
      setUnidadId(u);
      if (!decimalesTocados) setDecimales(opciones.unidades.find((x) => x.id === u)?.decimales ?? decimales);
    }
  }

  function elegirTendencia(t: Tendencia) {
    setTendencia(t);
    // Los signos de cada fila dependen de la tendencia: el editor parte de filas vacías de la nueva.
    setRangosIniciales(null);
    setRangos(rangosDelEditor(estadoDeRangos(t, null)));
    setClaveEditor((c) => c + 1);
  }

  /** «Escribir los rangos» en una ficha con la regla anterior: el editor parte de los rangos que dan los mismos colores. */
  function escribirLosRangos(foco: string | null) {
    const equivalentes = rangosEquivalentes(reglaAntigua);
    const inicial = equivalentes === null ? null : rangosATexto(equivalentes);
    setRangosIniciales(inicial);
    setRangos(rangosDelEditor(estadoDeRangos(tendencia, inicial)));
    setClaveEditor((c) => c + 1);
    if (foco) setPidioFoco((c) => c + 1);
    setEscribiendo(true);
  }

  function elegirSubproceso(id: number | "") {
    setSubprocesoId(id);
    if (!bloqueado) {
      setCodigo(codigoAlCambiarDeEleccion(
        codigo, codigoTocado, siglaVigenteDe(opciones, procesoId, subprocesoId), siglaVigenteDe(opciones, procesoId, id),
        codigoPropuestoDe(opciones, procesoId, id),
      ));
    }
  }

  function elegirProceso(id: number | "") {
    setProcesoId(id);
    setSubprocesoId("");
    if (procedimientoId !== "" && !opciones.documentos.some((d) => d.id === procedimientoId && id !== "" && d.procesoIds.includes(id))) {
      setProcedimientoId("");
    }
    setCodigo(codigoAlCambiarDeEleccion(
      codigo, codigoTocado, siglaVigenteDe(opciones, procesoId, subprocesoId), siglaVigenteDe(opciones, id, ""),
      codigoPropuestoDe(opciones, id, ""),
    ));
    // Sin persona designada, los responsables son los cargos de los líderes del proceso nuevo.
    if (!cargosTocados.medir && mide === "") setCargosMedir(cargosPorOmision("", id));
    if (!cargosTocados.analizar && (analiza === "misma" ? mide : analiza) === "") setCargosAnalizar(cargosPorOmision("", id));
  }

  function elegirPeriodicidad(p: Periodicidad) {
    setPeriodicidad(p);
    if (!operacionFija && !opciones.periodos[p].some((x) => x.clave === inicio)) setInicio(opciones.periodoEnCurso[p]);
  }

  function elegirMide(id: number | "") {
    setMide(id);
    if (!cargosTocados.medir) setCargosMedir(cargosPorOmision(id, procesoId));
    if (analiza === "misma" && !cargosTocados.analizar) setCargosAnalizar(cargosPorOmision(id, procesoId));
  }

  function elegirAnaliza(v: number | "" | "misma") {
    setAnaliza(v);
    if (!cargosTocados.analizar) setCargosAnalizar(cargosPorOmision(v === "misma" ? mide : v, procesoId));
  }

  function elegirUnidad(id: number | "") {
    setUnidadId(id);
    setUnidadTocada(true);
    if (!decimalesTocados) setDecimales(opciones.unidades.find((u) => u.id === id)?.decimales ?? decimales);
  }

  const libreSiguiente = LETRAS.find((l) => !variables.some((v) => v.letra === l));
  // El campo del error, si está en el formulario tal como se pinta ahora; si no, el error queda al pie.
  const ausentes = new Set<string>([
    ...(forma === "libre" ? [] : ["ficha-formula"]),
    ...(bloqueado ? ["ficha-procesoId"] : []),
    // Los controles de la regla anterior ya no se pintan: sus errores (solo de fichas viejas) quedan al pie.
    "ficha-semaforoModo",
    "ficha-umbralAtencionPct",
    "ficha-limiteCritico",
    ...(constante ? [] : ["ficha-metaMax"]),
    ...(constante && !usaRangos ? [] : ["ficha-tolerancia"]),
    ...(edicion?.cambio ? [] : ["ficha-motivoCambio"]),
    ...(operacionFija ? ["ficha-inicioMedicion", "ficha-nivelAcceso"] : []),
  ]);
  const campoConError = estado?.error ? campoDelError(estado.error) : null;
  const errorEn = campoConError !== null && !ausentes.has(campoConError) ? campoConError : null;
  const errorDe = (id: string) => (errorEn === id ? estado?.error : undefined);

  return (
    <form action={enviar} onSubmit={enviarSinReiniciar(enviar)} className="flex min-w-0 flex-col gap-6">
      {edicion ? <input type="hidden" name="id" value={edicion.versionId} /> : null}
      <input type="hidden" name="variables" value={JSON.stringify(variables.map(limpia))} />
      <input type="hidden" name="cargosMedir" value={JSON.stringify(cargosMedir)} />
      <input type="hidden" name="cargosAnalizar" value={JSON.stringify(cargosAnalizar)} />
      <input type="hidden" name="normaIds" value={JSON.stringify(normaIds)} />
      <input type="hidden" name="mide" value={JSON.stringify(listaMide)} />
      <input type="hidden" name="analiza" value={JSON.stringify(listaAnaliza)} />
      {bloqueado ? <input type="hidden" name="procesoId" value={procesoId} /> : null}
      {operacionFija ? (
        <>
          <input type="hidden" name="inicioMedicion" value={valores.inicioMedicion ?? ""} />
          <input type="hidden" name="nivelAcceso" value={valores.nivelAcceso ?? "general"} />
          {valores.soporteObligatorio ? <input type="hidden" name="soporteObligatorio" value="on" /> : null}
        </>
      ) : null}

      <SelectorForma forma={forma} factor={factor} alElegir={elegirForma} />
      {forma === "tasa" ? (
        <div className="max-w-xs">
          <Campo etiqueta="Factor de la tasa" nombre="factor" id="ficha-factor" error={errorDe("ficha-factor")}>
            <select
              value={factor}
              onChange={(e) => {
                setFactor(Number(e.target.value));
                sugerirUnidad(forma, Number(e.target.value));
              }}
              className={CONTROL}
            >
              {FACTORES_TASA.map((f) => (
                <option key={f} value={f}>
                  {`Por ${conMiles(f)}`}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      ) : null}

      <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <Campo etiqueta="Nombre" nombre="nombre" id="ficha-nombre" error={errorDe("ficha-nombre")}>
            <input required maxLength={200} defaultValue={valores.nombre ?? ""} className={CONTROL} />
          </Campo>
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            {bloqueado ? (
              <Etiquetado id="ficha-proceso" etiqueta="Proceso" ayuda="Queda fijo desde la primera aprobación.">
                <input id="ficha-proceso" readOnly value={proceso ? `${proceso.sigla} · ${proceso.nombre}` : ""} className={CONTROL} />
              </Etiquetado>
            ) : (
              <Campo etiqueta="Proceso" nombre="procesoId" id="ficha-procesoId" error={errorDe("ficha-procesoId")}>
                <select required value={procesoId} onChange={(e) => elegirProceso(e.target.value ? Number(e.target.value) : "")} className={CONTROL}>
                  <option value="">Elija el proceso</option>
                  {opciones.procesos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {`${p.sigla} · ${p.nombre}`}
                    </option>
                  ))}
                </select>
              </Campo>
            )}
            <Campo etiqueta="Subproceso" nombre="subprocesoId" id="ficha-subprocesoId" error={errorDe("ficha-subprocesoId")}>
              <select value={subprocesoId} onChange={(e) => elegirSubproceso(e.target.value ? Number(e.target.value) : "")} className={CONTROL}>
                <option value="">(ninguno)</option>
                {subprocesos.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <Campo
            etiqueta="Código"
            nombre="codigo"
            id="ficha-codigo" error={errorDe("ficha-codigo")}
            ayuda={bloqueado ? "Queda fijo desde la primera aprobación." : "Lo propone el sistema; puede cambiarlo mientras la ficha no esté aprobada."}
          >
            <input
              readOnly={bloqueado}
              maxLength={30}
              value={codigo}
              onChange={(e) => {
                setCodigo(e.target.value);
                setCodigoTocado(true);
              }}
              className={`${CONTROL} font-mono`}
            />
          </Campo>
          <Campo etiqueta="Objetivo del indicador" nombre="proposito" id="ficha-proposito" error={errorDe("ficha-proposito")} ayuda="Qué se quiere saber con este indicador.">
            <textarea required maxLength={1000} rows={2} defaultValue={valores.proposito ?? ""} className={CONTROL} />
          </Campo>

          <fieldset
            id="ficha-variables"
            tabIndex={-1}
            aria-describedby={errorDe("ficha-variables") ? "ficha-variables-error" : undefined}
            className="flex min-w-0 flex-col gap-3"
          >
            <legend className="mb-1 text-sm font-medium">Variables</legend>
            <ErrorDeCampo id="ficha-variables" error={errorDe("ficha-variables")} />
            {variables.map((v, i) => (
              <div key={v.letra} className="grid min-w-0 grid-cols-1 gap-2 rounded-md border border-border p-3 sm:grid-cols-2">
                <Etiquetado id={`ficha-variable-${v.letra}`} etiqueta={etiqueta(v, i)}>
                  <input
                    id={`ficha-variable-${v.letra}`}
                    maxLength={150}
                    value={v.nombre}
                    placeholder="Qué se cuenta en el periodo"
                    onChange={(e) => cambiarVariable(v.letra, { nombre: e.target.value })}
                    className={CONTROL}
                  />
                </Etiquetado>
                <Etiquetado id={`ficha-variable-${v.letra}-fuente`} etiqueta={`Fuente de ${v.letra}`}>
                  <input
                    id={`ficha-variable-${v.letra}-fuente`}
                    maxLength={300}
                    value={v.fuente ?? ""}
                    placeholder="De dónde sale el dato"
                    onChange={(e) => cambiarVariable(v.letra, { fuente: e.target.value })}
                    className={CONTROL}
                  />
                </Etiquetado>
                {forma === "libre" && variables.length > 1 ? (
                  <div className="sm:col-span-2">
                    <Boton variante="fantasma" tamano="sm" onClick={() => setVariables((vs) => vs.filter((x) => x.letra !== v.letra))}>
                      {`Quitar la variable ${v.letra}`}
                    </Boton>
                  </div>
                ) : null}
              </div>
            ))}
            {forma === "libre" && libreSiguiente ? (
              <div>
                <Boton variante="secundario" tamano="sm" onClick={() => setVariables((vs) => [...vs, variableNueva(libreSiguiente)])}>
                  {`Añadir la variable ${libreSiguiente}`}
                </Boton>
              </div>
            ) : null}
          </fieldset>

          {forma === "libre" ? (
            <Campo
              etiqueta="Fórmula"
              nombre="formula"
              id="ficha-formula" error={errorDe("ficha-formula")}
              ayuda="Letras de la A a la Z, + − × ÷, paréntesis y min(a; b), max(a; b), abs(a), con punto y coma entre argumentos."
            >
              <textarea maxLength={300} rows={2} value={formula} onChange={(e) => setFormula(e.target.value)} className={`${CONTROL} font-mono`} />
            </Campo>
          ) : null}
          <p aria-live="polite" className="text-sm">
            {analisis.ok ? (
              <>
                <span className="font-medium">En palabras: </span>
                {enPalabras(formulaVigente, nombres)}
              </>
            ) : (
              <span className="text-estado-critico-texto">{analisis.error}</span>
            )}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo etiqueta="Periodicidad" nombre="periodicidad" id="ficha-periodicidad" error={errorDe("ficha-periodicidad")}>
              <select value={periodicidad} onChange={(e) => elegirPeriodicidad(e.target.value as Periodicidad)} className={CONTROL}>
                {PERIODICIDADES.map((p) => (
                  <option key={p} value={p}>
                    {ETIQUETA_PERIODICIDAD[p]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo
              etiqueta="Plazo de reporte (días)"
              nombre="plazoReporteDias"
              id="ficha-plazoReporteDias" error={errorDe("ficha-plazoReporteDias")}
              ayuda={operacionFija ? EN_OPERACION : "Después del cierre del periodo."}
            >
              <input
                type="number"
                required
                readOnly={operacionFija}
                min={0}
                max={90}
                step={1}
                defaultValue={valores.plazoReporteDias ?? opciones.plazoReporteDias}
                className={CONTROL}
              />
            </Campo>
          </div>
          <Campo etiqueta="Tendencia" nombre="tendencia" id="ficha-tendencia" error={errorDe("ficha-tendencia")}>
            <select value={tendencia} onChange={(e) => elegirTendencia(e.target.value as Tendencia)} className={CONTROL}>
              {TENDENCIAS.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_TENDENCIA[t]}
                </option>
              ))}
            </select>
          </Campo>
          {constante ? (
            <div className={`grid min-w-0 grid-cols-1 gap-4 ${usaRangos ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
              <Campo etiqueta="Meta: desde" nombre="meta" id="ficha-meta" error={errorDe("ficha-meta")}>
                <input inputMode="decimal" value={meta} onChange={(e) => setMeta(e.target.value)} className={CONTROL} />
              </Campo>
              <Campo etiqueta="Meta: hasta" nombre="metaMax" id="ficha-metaMax" error={errorDe("ficha-metaMax")} ayuda="Igual a «desde» si es un solo valor.">
                <input inputMode="decimal" value={metaMax} onChange={(e) => setMetaMax(e.target.value)} className={CONTROL} />
              </Campo>
              {usaRangos ? null : (
                <Campo etiqueta="Tolerancia" nombre="tolerancia" id="ficha-tolerancia" error={errorDe("ficha-tolerancia")} ayuda="A cada lado del rango; puede ser 0.">
                  <input inputMode="decimal" value={tolerancia} onChange={(e) => setTolerancia(e.target.value)} className={CONTROL} />
                </Campo>
              )}
            </div>
          ) : (
            <Campo etiqueta="Meta" nombre="meta" id="ficha-meta" error={errorDe("ficha-meta")} ayuda="Opcional: sin meta, el indicador solo se vigila.">
              <input inputMode="decimal" value={meta} onChange={(e) => setMeta(e.target.value)} className={CONTROL} />
            </Campo>
          )}
          {usaRangos ? (
            <EditorDeRangos
              key={claveEditor}
              tendencia={tendencia}
              inicial={rangosIniciales}
              error={errorEn === "ficha-rangos" ? (estado?.error ?? null) : null}
              idError="ficha-rangos"
              alCambiar={setRangos}
              enviar={meta.trim() !== ""}
            />
          ) : null}
          <VistaSemaforo
            regla={regla}
            unidad={vista}
            metaEscrita={meta.trim() !== ""}
            accion={
              usaRangos ? null : (
                <Boton type="button" variante="secundario" tamano="sm" onClick={() => escribirLosRangos("rango-bien-signo")}>
                  Escribir los rangos
                </Boton>
              )
            }
          />
          {usaRangos || constante ? null : (
            <>
              <input type="hidden" name="semaforoModo" value={modo} />
              {modo === "relativo" ? <input type="hidden" name="umbralAtencionPct" value={umbral} /> : <input type="hidden" name="limiteCritico" value={limite} />}
            </>
          )}
          {operacionFija ? (
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <SoloLectura id="ficha-mide" etiqueta="Quién mide" valor={nombresDe(listaMide)} ayuda={EN_OPERACION} />
              <SoloLectura id="ficha-analiza" etiqueta="Quién analiza" valor={nombresDe(listaAnaliza)} ayuda={EN_OPERACION} />
            </div>
          ) : (
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <Etiquetado id="ficha-mide" etiqueta="Quién mide" ayuda="Sin persona, mide el líder del proceso.">
                <select id="ficha-mide" value={mide} onChange={(e) => elegirMide(e.target.value ? Number(e.target.value) : "")} className={CONTROL}>
                  <option value="">(el líder del proceso)</option>
                  {opciones.usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                    </option>
                  ))}
                </select>
              </Etiquetado>
              <Etiquetado id="ficha-analiza" etiqueta="Quién analiza">
                <select
                  id="ficha-analiza"
                  value={analiza}
                  onChange={(e) => elegirAnaliza(e.target.value === "misma" ? "misma" : e.target.value ? Number(e.target.value) : "")}
                  className={CONTROL}
                >
                  <option value="misma">La misma persona que mide</option>
                  <option value="">(el líder del proceso)</option>
                  {opciones.usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                    </option>
                  ))}
                </select>
              </Etiquetado>
            </div>
          )}
          <PruebaFormula
            formula={formulaVigente}
            variables={variables.map((v, i) => ({ letra: v.letra, etiqueta: etiqueta(v, i) }))}
            regla={regla}
            unidad={vista}
            resultadoMin={resultadoMin}
            resultadoMax={resultadoMax}
            valores={prueba}
            alCambiar={(letra, valor) => setPrueba((p) => ({ ...p, [letra]: valor }))}
          />
        </div>
      </div>

      {edicion?.cambio ? (
        <Campo
          etiqueta="Motivo del cambio"
          nombre="motivoCambio"
          id="ficha-motivoCambio" error={errorDe("ficha-motivoCambio")}
          ayuda="Obligatorio al enviar el cambio. El sistema decide si es mayor o menor comparando con la ficha vigente."
        >
          <textarea maxLength={500} rows={2} defaultValue={valores.motivoCambio ?? ""} className={CONTROL} />
        </Campo>
      ) : null}

      <details ref={masOpciones} className="rounded-md border border-border px-3 py-2">
        <summary className={RESUMEN}>Más opciones</summary>
        <div className="mt-3 flex min-w-0 flex-col gap-5">
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo etiqueta="Tipo" nombre="tipoId" id="ficha-tipoId" error={errorDe("ficha-tipoId")}>
              <select defaultValue={valores.tipoId ?? porNombre(opciones.tipos, "Eficacia")} className={CONTROL}>
                {opciones.tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Clasificación" nombre="clasificacionId" id="ficha-clasificacionId" error={errorDe("ficha-clasificacionId")} ayuda="Decide quién aprueba la ficha.">
              <select value={clasificacionId} onChange={(e) => setClasificacionId(e.target.value ? Number(e.target.value) : "")} className={CONTROL}>
                {opciones.clasificaciones.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Unidad del resultado" nombre="unidadId" id="ficha-unidadId" error={errorDe("ficha-unidadId")}>
              <select value={unidadId} onChange={(e) => elegirUnidad(e.target.value ? Number(e.target.value) : "")} className={CONTROL}>
                {opciones.unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Decimales con que se muestra" nombre="decimales" id="ficha-decimales" error={errorDe("ficha-decimales")}>
              <select
                value={decimales}
                onChange={(e) => {
                  setDecimales(Number(e.target.value));
                  setDecimalesTocados(true);
                }}
                className={CONTROL}
              >
                {[0, 1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Requisito" nombre="requisito" id="ficha-requisito" error={errorDe("ficha-requisito")} ayuda="Por ejemplo: NTC ISO 9001:2015, numeral 9.2.">
              <input maxLength={120} defaultValue={valores.requisito ?? ""} className={CONTROL} />
            </Campo>
            <Campo etiqueta="Objetivo que mide" nombre="objetivoId" id="ficha-objetivoId" error={errorDe("ficha-objetivoId")}>
              <select defaultValue={valores.objetivoId ?? ""} className={CONTROL}>
                <option value="">(ninguno)</option>
                {opciones.objetivos.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Procedimiento" nombre="procedimientoDocumentoId" id="ficha-procedimientoDocumentoId" error={errorDe("ficha-procedimientoDocumentoId")} ayuda="Un documento vigente del proceso.">
              <select value={procedimientoId} onChange={(e) => setProcedimientoId(e.target.value ? Number(e.target.value) : "")} className={CONTROL}>
                <option value="">(ninguno)</option>
                {documentos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {`${d.codigo} · ${d.titulo}`}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Punto de control" nombre="puntoControl" id="ficha-puntoControl" error={errorDe("ficha-puntoControl")} ayuda="Por ejemplo: PC-13.">
              <input maxLength={60} defaultValue={valores.puntoControl ?? ""} className={CONTROL} />
            </Campo>
            <Campo etiqueta="Nivel" nombre="nivel" id="ficha-nivel" error={errorDe("ficha-nivel")} ayuda="Opcional: el nivel del indicador en el hospital, por ejemplo «Estratégico».">
              <input maxLength={60} defaultValue={valores.nivel ?? ""} className={CONTROL} />
            </Campo>
            <Campo etiqueta="Riesgo asociado" nombre="riesgoAsociado" id="ficha-riesgoAsociado" error={errorDe("ficha-riesgoAsociado")} ayuda="Opcional: el riesgo del proceso que este indicador vigila.">
              <input maxLength={300} defaultValue={valores.riesgoAsociado ?? ""} className={CONTROL} />
            </Campo>
          </div>

          <Casillas
            prefijo="ficha-norma"
            error={errorDe("ficha-norma")}
            leyenda="Normas que lo exigen"
            ayuda={clasificacion?.exigeNorma ? "Esta clasificación exige al menos una norma vigente o modificada." : "Opcional en esta clasificación."}
            opciones={opciones.normas.map((n) => ({ id: n.id, nombre: n.estado === "vigente" ? n.nombre : `${n.nombre} (${n.estado})` }))}
            elegidas={normaIds}
            alCambiar={setNormaIds}
          />

          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            <Casillas
              prefijo="ficha-cargo-medir"
            error={errorDe("ficha-cargo-medir")}
              leyenda="Cargos responsables de medir"
              ayuda="Por omisión, el cargo de quien mide."
              opciones={opciones.cargos}
              elegidas={cargosMedir}
              alCambiar={(ids) => {
                setCargosMedir(ids);
                setCargosTocados((t) => ({ ...t, medir: true }));
              }}
            />
            <Casillas
              prefijo="ficha-cargo-analizar"
            error={errorDe("ficha-cargo-analizar")}
              leyenda="Cargos responsables de analizar"
              ayuda="Por omisión, el cargo de quien analiza."
              opciones={opciones.cargos}
              elegidas={cargosAnalizar}
              alCambiar={(ids) => {
                setCargosAnalizar(ids);
                setCargosTocados((t) => ({ ...t, analizar: true }));
              }}
            />
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
            <Campo etiqueta="Línea base" nombre="lineaBaseValor" id="ficha-lineaBaseValor" error={errorDe("ficha-lineaBaseValor")}>
              <input inputMode="decimal" defaultValue={conComa(valores.lineaBaseValor)} className={CONTROL} />
            </Campo>
            <Campo etiqueta="Periodo de la línea base" nombre="lineaBasePeriodo" id="ficha-lineaBasePeriodo" error={errorDe("ficha-lineaBasePeriodo")} ayuda="Por ejemplo: 2025 o 2025-T4.">
              <input maxLength={7} defaultValue={valores.lineaBasePeriodo ?? ""} className={CONTROL} />
            </Campo>
            <Campo etiqueta="Nota de la línea base" nombre="lineaBaseNota" id="ficha-lineaBaseNota" error={errorDe("ficha-lineaBaseNota")}>
              <input
                maxLength={500}
                defaultValue={valores.lineaBaseNota ?? (valores.lineaBaseValor ? "" : `Sin línea base: ${opciones.anio} es el año de referencia`)}
                className={CONTROL}
              />
            </Campo>
          </div>
          <Campo etiqueta="Sustento de la meta" nombre="sustentoMeta" id="ficha-sustentoMeta" error={errorDe("ficha-sustentoMeta")}>
            <textarea maxLength={500} rows={2} defaultValue={valores.sustentoMeta ?? ""} className={CONTROL} />
          </Campo>
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo etiqueta="Mínimo del resultado" nombre="resultadoMin" id="ficha-resultadoMin" error={errorDe("ficha-resultadoMin")} ayuda="Opcional: por ejemplo, 0.">
              <input inputMode="decimal" value={resultadoMin} onChange={(e) => setResultadoMin(e.target.value)} className={CONTROL} />
            </Campo>
            <Campo etiqueta="Máximo del resultado" nombre="resultadoMax" id="ficha-resultadoMax" error={errorDe("ficha-resultadoMax")} ayuda="Opcional: por ejemplo, 100.">
              <input inputMode="decimal" value={resultadoMax} onChange={(e) => setResultadoMax(e.target.value)} className={CONTROL} />
            </Campo>
          </div>

          <fieldset
            id="ficha-detalle-variables"
            tabIndex={-1}
            aria-describedby={errorDe("ficha-detalle-variables") ? "ficha-detalle-variables-error" : undefined}
            className="flex min-w-0 flex-col gap-3"
          >
            <legend className="mb-1 text-sm font-medium">Detalle de las variables</legend>
            <ErrorDeCampo id="ficha-detalle-variables" error={errorDe("ficha-detalle-variables")} />
            {variables.map((v, i) => (
              <div key={v.letra} className="grid min-w-0 grid-cols-1 gap-2 rounded-md border border-border p-3 sm:grid-cols-2">
                <p className="text-sm font-medium sm:col-span-2">{etiqueta(v, i)}</p>
                <Etiquetado id={`ficha-variable-${v.letra}-descripcion`} etiqueta={`Qué incluye y qué excluye ${v.letra}`}>
                  <textarea
                    id={`ficha-variable-${v.letra}-descripcion`}
                    maxLength={500}
                    rows={2}
                    value={v.descripcion ?? ""}
                    onChange={(e) => cambiarVariable(v.letra, { descripcion: e.target.value })}
                    className={CONTROL}
                  />
                </Etiquetado>
                <Etiquetado id={`ficha-variable-${v.letra}-unidad`} etiqueta={`Unidad de ${v.letra}`}>
                  <input
                    id={`ficha-variable-${v.letra}-unidad`}
                    maxLength={40}
                    value={v.unidad ?? ""}
                    onChange={(e) => cambiarVariable(v.letra, { unidad: e.target.value })}
                    className={CONTROL}
                  />
                </Etiquetado>
                <Etiquetado id={`ficha-variable-${v.letra}-consolidacion`} etiqueta={`Cómo se junta ${v.letra} en un periodo mayor`}>
                  <select
                    id={`ficha-variable-${v.letra}-consolidacion`}
                    value={v.consolidacion}
                    onChange={(e) => cambiarVariable(v.letra, { consolidacion: e.target.value as Consolidacion })}
                    className={CONTROL}
                  >
                    {CONSOLIDACIONES.map((c) => (
                      <option key={c} value={c}>
                        {ETIQUETA_CONSOLIDACION[c]}
                      </option>
                    ))}
                  </select>
                </Etiquetado>
                <div className="grid min-w-0 grid-cols-2 gap-2">
                  <Etiquetado id={`ficha-variable-${v.letra}-min`} etiqueta={`Mínimo de ${v.letra}`}>
                    <input
                      id={`ficha-variable-${v.letra}-min`}
                      inputMode="decimal"
                      value={conComa(v.capturaMin)}
                      onChange={(e) => cambiarVariable(v.letra, { capturaMin: e.target.value })}
                      className={CONTROL}
                    />
                  </Etiquetado>
                  <Etiquetado id={`ficha-variable-${v.letra}-max`} etiqueta={`Máximo de ${v.letra}`}>
                    <input
                      id={`ficha-variable-${v.letra}-max`}
                      inputMode="decimal"
                      value={conComa(v.capturaMax)}
                      onChange={(e) => cambiarVariable(v.letra, { capturaMax: e.target.value })}
                      className={CONTROL}
                    />
                  </Etiquetado>
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <input
                    type="checkbox"
                    id={`ficha-variable-${v.letra}-negativos`}
                    checked={v.admiteNegativos}
                    onChange={(e) => cambiarVariable(v.letra, { admiteNegativos: e.target.checked })}
                  />
                  <label htmlFor={`ficha-variable-${v.letra}-negativos`} className="text-sm">
                    {`${v.letra} admite negativos`}
                  </label>
                </div>
              </div>
            ))}
          </fieldset>

          {operacionFija ? (
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
              <SoloLectura id="ficha-inicioMedicion" etiqueta="Inicio de medición" valor={etiquetaDeInicio(valores.inicioMedicion)} ayuda={EN_OPERACION} />
              <SoloLectura
                id="ficha-nivelAcceso"
                etiqueta="Nivel de acceso"
                valor={valores.nivelAcceso === "restringido" ? "Restringido" : "General"}
                ayuda={EN_OPERACION}
              />
              <SoloLectura id="ficha-soporteObligatorio" etiqueta="Soporte obligatorio" valor={valores.soporteObligatorio ? "Sí" : "No"} ayuda={EN_OPERACION} />
            </div>
          ) : (
            <>
              <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                <Campo etiqueta="Inicio de medición" nombre="inicioMedicion" id="ficha-inicioMedicion" error={errorDe("ficha-inicioMedicion")} ayuda="El primer periodo que se mide; puede ser anterior a hoy.">
                  <select value={inicio} onChange={(e) => setInicio(e.target.value)} className={CONTROL}>
                    {opciones.periodos[periodicidad].map((p) => (
                      <option key={p.clave} value={p.clave}>
                        {p.etiqueta}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo etiqueta="Nivel de acceso" nombre="nivelAcceso" id="ficha-nivelAcceso" error={errorDe("ficha-nivelAcceso")} ayuda="Uno restringido solo lo ven los del proceso y los designados.">
                  <select defaultValue={valores.nivelAcceso ?? "general"} className={CONTROL}>
                    <option value="general">General</option>
                    <option value="restringido">Restringido</option>
                  </select>
                </Campo>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="ficha-soporteObligatorio" name="soporteObligatorio" defaultChecked={valores.soporteObligatorio ?? false} />
                <label htmlFor="ficha-soporteObligatorio" className="text-sm">
                  Cada reporte debe llevar su soporte
                </label>
              </div>
            </>
          )}

          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="min-w-0">
              <Campo etiqueta="Se reporta a un ente" nombre="ente" id="ficha-ente" error={errorDe("ficha-ente")} ayuda="Opcional: el destinatario externo. Sugiere los ya usados.">
                <input maxLength={150} list="ficha-entes" defaultValue={valores.ente ?? ""} className={CONTROL} />
              </Campo>
              <datalist id="ficha-entes">
                {opciones.entes.map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
            </div>
            <Campo etiqueta="Periodicidad del ente" nombre="periodicidadExterna" id="ficha-periodicidadExterna" error={errorDe("ficha-periodicidadExterna")}>
              <select defaultValue={valores.periodicidadExterna ?? ""} className={CONTROL}>
                <option value="">(no se reporta)</option>
                {PERIODICIDADES.map((p) => (
                  <option key={p} value={p}>
                    {ETIQUETA_PERIODICIDAD[p]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Plazo del ente (días)" nombre="plazoExternoDias" id="ficha-plazoExternoDias" error={errorDe("ficha-plazoExternoDias")}>
              <input type="number" min={0} max={365} step={1} defaultValue={valores.plazoExternoDias ?? ""} className={CONTROL} />
            </Campo>
          </div>
        </div>
      </details>

      {estado && errorEn === null ? (
        <p role="alert" className="text-sm text-estado-critico-texto">
          {estado.error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link href="/indicadores" className={`${claseBoton("secundario")} ${FOCO}`}>
          Cancelar
        </Link>
        <Boton type="submit" pendiente={pendiente}>
          {pendiente ? "Guardando…" : "Guardar borrador"}
        </Boton>
      </div>
    </form>
  );
}

/** «Editar ficha» sobre una aprobada (spec §7.6.5): abre un borrador con el contenido vigente. */
export function AbrirCambio({ indicadorId }: { indicadorId: number }) {
  const [estado, enviar, pendiente] = useActionState(abrirCambioAccion, null);
  return (
    <form action={enviar} className="flex flex-col items-start gap-2">
      <input type="hidden" name="id" value={indicadorId} />
      <Boton type="submit" pendiente={pendiente}>
        {pendiente ? "Abriendo…" : "Abrir un cambio"}
      </Boton>
      {estado ? (
        <p role="alert" className="text-sm text-estado-critico-texto">
          {estado.error}
        </p>
      ) : null}
    </form>
  );
}
