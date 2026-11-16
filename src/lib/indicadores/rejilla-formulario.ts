/**
 * Lo delicado del formulario de la rejilla de un desagregado (anexo 14C, §5.4; D9), sin React: lo que pintó la base en cada
 * campo (de ahí salen siempre los originales que viajan ocultos), lo que la persona cambió y con qué valor de la base estaba
 * pintado cuando lo cambió, lo que se siembra cuando la acción vuelve sin JavaScript, y el cálculo en vivo de las filas y del
 * total. Lo usan `FormularioReporte` y `RejillaDeCategorias`. Sin Node ni BD.
 */
import type { CategoriaDeReporte, DatosDeReporte } from "@/db/consultas/indicadores/lectura";
import { rejillaEnVivo } from "./categorias";
import { calcularEnVivo, type CalculoEnVivo, type EstadoReporte } from "./reporte";
import { numeroEs } from "./semaforo";

/** Un desagregado, con la lista de categorías de su medición. */
export type DatosDeRejilla = DatosDeReporte & { categorias: CategoriaDeReporte[] };

/** Lo que la persona cambió en cada campo (por su `name`) y con qué valor de la base estaba pintado cuando lo cambió. */
export type Edicion = Record<string, { valor: string; base: string }>;

/** Un valor guardado (punto decimal) en el campo: coma decimal, como se digita. */
const enCampo = (valor: string | null) => (valor === null ? "" : valor.replace(".", ","));

const dePersona = (c: CategoriaDeReporte) => c.noAplica !== null && !c.delSistema;

/**
 * Cada campo de la rejilla con lo que pintó la base: las celdas propias (`c_<id>_<letra>`), la casilla «No aplica» (`na_<id>`,
 * «1» o «0») y su motivo (`motivo_<id>`); una fila con «No aplica» del sistema no tiene casilla ni motivo. De aquí salen siempre
 * los originales que viajan ocultos (`o_`, `ona_`, `omotivo_`): nunca de lo que la persona digitó ni del estado que vuelve de
 * la acción.
 */
export function pintadosDe(d: Pick<DatosDeRejilla, "categorias" | "variables">): Map<string, string> {
  const salida = new Map<string, string>();
  for (const c of d.categorias) {
    for (const v of d.variables) if (!v.ajena) salida.set(`c_${c.id}_${v.letra}`, enCampo(c.valores[v.letra] ?? null));
    if (c.delSistema) continue;
    salida.set(`na_${c.id}`, dePersona(c) ? "1" : "0");
    salida.set(`motivo_${c.id}`, dePersona(c) ? c.noAplica! : "");
  }
  return salida;
}

/** ¿Lo enviado difiere de su original enviado? Como lo decide el servidor, sin los espacios de los extremos. */
const difiere = (enviado: string, original: string | undefined) => original === undefined || enviado.trim() !== original.trim();

/**
 * Sin JavaScript, la acción vuelve con lo que se envió (`valores`): se siembra solo lo que la persona cambió frente al original
 * que viajó con ello (una celda distinta de su `o_`, una casilla distinta de su `ona_`, un motivo distinto de su `omotivo_`);
 * lo que se envió tal como se pintó no se siembra, porque la base pudo cambiar entre tanto. La casilla de una fila solo si su
 * estado pintado viajó (`ona_`): desmarcada no manda nada.
 */
export function semilla(estado: EstadoReporte, pintados: ReadonlyMap<string, string>): Edicion {
  const valores = estado && estado.ok === false ? estado.valores : undefined;
  if (!valores) return {};
  const texto = (k: string) => (typeof valores[k] === "string" ? (valores[k] as string) : undefined);
  const salida: Edicion = {};
  for (const [k, base] of pintados) {
    if (k.startsWith("na_")) {
      const pintada = texto(`o${k}`);
      const enviada = texto(k) === "1" ? "1" : "0";
      if (pintada !== undefined && enviada !== pintada) salida[k] = { valor: enviada, base };
      continue;
    }
    const enviado = texto(k);
    const original = k.startsWith("c_") ? texto(`o_${k.slice(2)}`) : texto(`o${k}`);
    if (enviado !== undefined && difiere(enviado, original)) salida[k] = { valor: enviado, base };
  }
  return salida;
}

/** Lo que muestra un campo: lo que la persona cambió, mientras la base no cambie ese campo; si cambió, lo nuevo de la base. */
export function valorEn(edicion: Edicion, pintados: ReadonlyMap<string, string>, k: string): string {
  const base = pintados.get(k) ?? "";
  const e = edicion[k];
  return e && e.base === base ? e.valor : base;
}

/** La edición con el campo `k` cambiado a `valor`, anotado con lo que la base pintaba en él. */
export function conCambio(edicion: Edicion, pintados: ReadonlyMap<string, string>, k: string, valor: string): Edicion {
  return { ...edicion, [k]: { valor, base: pintados.get(k) ?? "" } };
}

/**
 * La rejilla con lo que la persona lleva digitado: lo pintado, el valor de cada campo, si cada fila está «No aplica», el
 * cálculo de las filas (`rejillaEnVivo`, con los límites de captura de cada celda; a lo ajeno no lo limitan las reglas de
 * quien mide) y, con todas las filas completas, «Sin casos» o «No aplica», el total: la suma en texto y su resultado
 * (`calcularEnVivo`, sin límites de captura: los del resultado y la variación valen solo para él).
 */
export function rejillaCalculada(d: DatosDeRejilla, edicion: Edicion) {
  const pintados = pintadosDe(d);
  const valor = (k: string) => valorEn(edicion, pintados, k);
  const noAplica = (c: CategoriaDeReporte) => c.delSistema || valor(`na_${c.id}`) === "1";
  const variables = d.variables.map((v) => ({
    letra: v.letra,
    nombre: v.nombre,
    capturaMin: v.ajena ? null : v.capturaMin,
    capturaMax: v.ajena ? null : v.capturaMax,
    admiteNegativos: v.ajena ? true : v.admiteNegativos,
    ajena: v.ajena !== null,
  }));
  const vivo = rejillaEnVivo(
    { calculo: d.calculo, regla: d.regla, unidad: d.unidad, variables },
    d.categorias.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      noAplica: noAplica(c),
      textos: Object.fromEntries(d.variables.map((v) => [v.letra, v.ajena ? enCampo(c.valores[v.letra] ?? null) : valor(`c_${c.id}_${v.letra}`)])),
    })),
  );
  const sinLimites = variables.map((v) => ({ ...v, capturaMin: null, capturaMax: null, admiteNegativos: true }));
  const totalEnTexto =
    vivo.total.clase === "total" ? Object.fromEntries(Object.entries(vivo.total.valores).map(([l, f]) => [l, numeroEs(f, 4, "truncar")])) : null;
  const total: CalculoEnVivo | null = totalEnTexto
    ? calcularEnVivo(
        { calculo: d.calculo, regla: d.regla, unidad: d.unidad, variables: sinLimites, anterior: d.anterior, variacionPct: d.variacionPct },
        totalEnTexto,
      )
    : null;
  return { pintados, valor, noAplica, vivo, sinLimites, totalEnTexto, total };
}
