/**
 * El historial de una medición corregida (spec 14 §8.7): lo que la tabla del año muestra bajo «Corregida», desde su
 * primera reapertura: qué hizo cada quien, cuándo, por qué y qué había y qué quedó. Funciones puras sobre los eventos de
 * `medicion_eventos`; los de los soportes, solo para quien ve los soportes (spec §6.4).
 */
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { fechaHoraLarga, zonaHoraria } from "@/lib/zona-horaria";
import { fraccion } from "./formula/fraccion";
import { numeroEs } from "./semaforo";
import { textoValor, type Unidad } from "./textos";
import { ETIQUETA_SEMAFORO, type Semaforo, type TipoEvento } from "./tipos";

/** Un evento de la medición como sale de la BD, con el nombre de quien actuó (`null`, el sistema). */
export type EventoDeMedicion = { id: number; tipo: TipoEvento; quien: string | null; creadoEn: Date; detalle: Record<string, unknown> };

/** Una línea del historial, ya en texto para la pantalla. */
export type EntradaDeHistorial = { id: number; que: string; quien: string; cuando: string; porque: string | null; cambios: string[] };

const ESTADO: Record<string, string> = { abierta: "Abierta", reportada: "Reportada", cerrada: "Cerrada" };
const TEXTOS: [clave: string, etiqueta: string][] = [
  ["analisis", "Análisis"],
  ["causa", "Causa"],
  ["accionPropuesta", "Acción propuesta"],
];

const objeto = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const distinto = (a: unknown, b: unknown) => JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);

function numero(v: unknown, unidad: Unidad | null): string | null {
  if (v === null || v === undefined) return null;
  const f = fraccion(String(v));
  if (!f) return String(v);
  return unidad ? textoValor(f, unidad) : numeroEs(f, 4, "truncar");
}

/** «marzo de 2026» del mes de un cierre (`AAAA-MM`). */
const mesEnPalabras = (mes: unknown) => {
  const clave = texto(mes);
  return clave ? (periodoDe(clave, zonaHoraria())?.etiqueta ?? clave) : "un mes";
};

/** Por qué se recalculó una medición sin que nadie la tocara (`detalle.causa` del evento `recalculo`; residuos finales, 3). */
const MOTIVO_DE_RECALCULO: Readonly<Record<string, string>> = {
  racha: " por la racha de periodos anteriores",
  soporte_obligatorio: " por el cambio del soporte obligatorio",
  plazo: " por el cambio del plazo",
};

/**
 * «El sistema actualizó «Total facturado»: de 1284300000 a 40000000»: lo que cambió de cada fuente de la propagación
 * (`detalle.fuentes`, anexo 14C §3.3), con el nombre de su variable; varias, separadas por «;». Si el evento pone o quita el
 * «No aplica» del sistema (nada que medir, §3.4, o el contagio de un componente, §6.3), «El sistema marcó «No aplica»» o «El
 * sistema quitó «No aplica»»: su motivo y los valores van en los cambios. Sin fuentes, «El sistema actualizó los valores por
 * categoría» si cambiaron celdas de un desagregado (anexo 14C, §5.7: van en los cambios), y si no, «El sistema actualizó un
 * valor».
 */
function queActualizo(e: EventoDeMedicion, nombres: Readonly<Record<string, string>>): string {
  const antes = objeto(e.detalle.antes);
  const despues = objeto(e.detalle.despues);
  if (typeof despues.noAplica === "boolean" && antes.noAplica !== despues.noAplica) {
    return despues.noAplica ? "El sistema marcó «No aplica»" : "El sistema quitó «No aplica»";
  }
  const fuentes = Array.isArray(e.detalle.fuentes) ? e.detalle.fuentes.map(objeto) : [];
  if (fuentes.length === 0) return categoriasDe(e).length > 0 ? "El sistema actualizó los valores por categoría" : "El sistema actualizó un valor";
  const cada = fuentes.map((f) => {
    const letra = String(f.letra);
    return `«${nombres[letra] ?? letra}»: de ${numero(f.antes, null) ?? "—"} a ${numero(f.despues, null) ?? "—"}`;
  });
  return `El sistema actualizó ${cada.join("; ")}`;
}

function queHizo(e: EventoDeMedicion, nombres: Readonly<Record<string, string>>): string {
  switch (e.tipo) {
    case "reapertura":
      return "Reabrió";
    case "correccion":
      return "Corrigió";
    case "reporte":
      return "Reportó";
    case "historico":
      return "Registró el histórico";
    case "no_aplica":
      return "Marcó «No aplica»";
    case "analisis":
      return TEXTOS.some(([k]) => texto(objeto(e.detalle.antes)[k]) !== null) ? "Editó el análisis" : "Escribió el análisis";
    case "meta":
      return "Cambió la meta";
    case "cierre":
      return e.detalle.deNuevo === true ? "Cerró de nuevo" : `Cerró con el cierre de ${mesEnPalabras(e.detalle.mes)}`;
    case "soporte": {
      const nombre = texto(e.detalle.nombre);
      const que = e.detalle.accion === "subido" ? "Subió" : e.detalle.accion === "quitado" ? "Quitó" : "Cambió";
      return nombre ? `${que} el soporte «${nombre}»` : `${que} un soporte`;
    }
    case "recalculo":
      return `Se recalculó${MOTIVO_DE_RECALCULO[String(e.detalle.causa)] ?? ""}`;
    case "foto":
      // La foto la toma el sistema; con `recalculo`, quien administra la volvió a tomar (anexo 14B, §5.4).
      return e.detalle.recalculo === true ? "Se volvió a calcular" : "El sistema tomó la foto";
    case "propagacion":
      return queActualizo(e, nombres);
    case "categorias": {
      // El sistema la rehace cuando un cambio mayor cambia la dimensión; quien administra le añade las que faltaban.
      if (e.detalle.causa === "dimension") return "El sistema rehízo las categorías por el cambio de desagregación";
      const agregadas = (Array.isArray(e.detalle.agregadas) ? e.detalle.agregadas : []).map((c) => texto(objeto(c).nombre)).filter((n) => n !== null);
      if (agregadas.length === 0) return "Actualizó las categorías";
      return `Añadió ${agregadas.length === 1 ? "1 categoría" : `${agregadas.length} categorías`}: ${agregadas.join(", ")}`;
    }
  }
}

/** Las categorías que cambiaron en un reporte, una corrección o una propagación (`detalle.categorias`, anexo 14C §5.4). */
const categoriasDe = (e: EventoDeMedicion) => (Array.isArray(e.detalle.categorias) ? e.detalle.categorias.map(objeto) : []);

/**
 * «Sede principal · Pacientes auditados: 182 → 183» por cada celda que cambió y «Puesto de salud 5 · No aplica: No →
 * «Cerrado por obras»» por cada «No aplica» de fila; en el evento que rehízo la lista, «Categorías: … → …».
 */
function cambiosDeCategorias(e: EventoDeMedicion, nombres: Readonly<Record<string, string>>): string[] {
  if (e.tipo === "categorias" && e.detalle.causa === "dimension") {
    const lista = (v: unknown) => (Array.isArray(v) && v.length > 0 ? v.map(String).join(", ") : "ninguna");
    return [`Categorías: ${lista(e.detalle.antes)} → ${lista(e.detalle.despues)}`];
  }
  const salida: string[] = [];
  for (const c of categoriasDe(e)) {
    const nombre = texto(c.nombre) ?? "Una categoría";
    const antes = objeto(c.antes);
    const despues = objeto(c.despues);
    for (const l of [...new Set([...Object.keys(antes), ...Object.keys(despues)])].filter((k) => /^[A-Z]$/.test(k)).sort()) {
      if (distinto(antes[l], despues[l])) salida.push(`${nombre} · ${nombres[l] ?? l}: ${numero(antes[l], null) ?? "—"} → ${numero(despues[l], null) ?? "—"}`);
    }
    if (distinto(antes.noAplica, despues.noAplica)) {
      const motivo = (v: unknown) => (texto(v) ? `«${texto(v)}»` : "No");
      salida.push(`${nombre} · No aplica: ${motivo(antes.noAplica)} → ${motivo(despues.noAplica)}`);
    }
  }
  return salida;
}

/**
 * Qué había y qué quedó: las variables (por su nombre), las celdas y los «No aplica» de fila de un desagregado, «no aplica», el
 * resultado, el semáforo, el estado, la marca de incumplimiento repetido, el análisis y la meta.
 */
function cambiosDe(e: EventoDeMedicion, unidad: Unidad, nombres: Readonly<Record<string, string>>): string[] {
  const antes = objeto(e.detalle.antes);
  const despues = objeto(e.detalle.despues);
  const salida: string[] = [];
  const cambio = (etiqueta: string, a: string | null, b: string | null, vacio: string) => salida.push(`${etiqueta}: ${a ?? vacio} → ${b ?? vacio}`);
  // El evento que rehízo la lista guarda en `antes` y `despues` los nombres de las categorías, no valores.
  if (e.tipo === "categorias") return cambiosDeCategorias(e, nombres);
  const letras = [...new Set([...Object.keys(antes), ...Object.keys(despues)])].filter((k) => /^[A-Z]$/.test(k)).sort();
  for (const l of letras) if (distinto(antes[l], despues[l])) cambio(nombres[l] ?? l, numero(antes[l], null), numero(despues[l], null), "—");
  salida.push(...cambiosDeCategorias(e, nombres));
  if (distinto(antes.noAplica, despues.noAplica)) {
    cambio("No aplica", antes.noAplica === true ? "Sí" : "No", despues.noAplica === true ? "Sí" : "No", "No");
  }
  if (distinto(antes.motivo, despues.motivo)) cambio("Motivo", texto(antes.motivo), texto(despues.motivo), "—");
  if (distinto(antes.soportes, despues.soportes)) {
    const n = (v: unknown) => (typeof v === "number" ? String(v) : null);
    cambio("Soportes", n(antes.soportes), n(despues.soportes), "—");
  }
  if (distinto(antes.meta, despues.meta) || distinto(antes.metaMax, despues.metaMax)) {
    // «90 %» o, en un rango, «98 a 100 %».
    const meta = (m: Record<string, unknown>) => {
      if (m.meta === null || m.meta === undefined) return null;
      const rango = m.metaMax !== null && m.metaMax !== undefined && distinto(m.meta, m.metaMax);
      return rango ? `${numero(m.meta, null)} a ${numero(m.metaMax, unidad)}` : numero(m.meta, unidad);
    };
    cambio("Meta", meta(antes), meta(despues), "sin meta");
  }
  if (distinto(antes.resultado, despues.resultado)) cambio("Resultado", numero(antes.resultado, unidad), numero(despues.resultado, unidad), "sin resultado");
  if (distinto(antes.semaforo, despues.semaforo)) {
    const s = (v: unknown) => (typeof v === "string" && v in ETIQUETA_SEMAFORO ? ETIQUETA_SEMAFORO[v as Semaforo] : null);
    cambio("Semáforo", s(antes.semaforo), s(despues.semaforo), "sin semáforo");
  }
  // Con rangos propios, Bien puede no alcanzar la meta: el semáforo no cambia y el cumplimiento sí (spec 14A §3.1).
  if (distinto(antes.cumple, despues.cumple)) {
    const s = (v: unknown) => (v === true ? "Sí" : v === false ? "No" : null);
    cambio("Cumple", s(antes.cumple), s(despues.cumple), "—");
  }
  if (distinto(antes.estado, despues.estado)) {
    const s = (v: unknown) => (typeof v === "string" ? (ESTADO[v] ?? v) : null);
    cambio("Estado", s(antes.estado), s(despues.estado), "—");
  }
  if (distinto(antes.incumplimientoRepetido, despues.incumplimientoRepetido)) {
    const s = (v: unknown) => (v === true ? "Sí" : v === false ? "No" : null);
    cambio("Incumplimiento repetido", s(antes.incumplimientoRepetido), s(despues.incumplimientoRepetido), "—");
  }
  for (const [k, etiqueta] of TEXTOS) {
    if (distinto(texto(antes[k]), texto(despues[k]))) cambio(etiqueta, texto(antes[k]) && `«${texto(antes[k])}»`, texto(despues[k]) && `«${texto(despues[k])}»`, "(vacío)");
  }
  return salida;
}

/**
 * El historial de la medición desde su primera reapertura, de lo más antiguo a lo más reciente; vacío si nunca se
 * reabrió. Los eventos de los soportes, solo con `conSoportes` (quien ve los soportes). `eventos` van en el orden en que
 * se registraron.
 */
export function historialDeCorreccion(
  eventos: readonly EventoDeMedicion[],
  c: { unidad: Unidad; nombres: Readonly<Record<string, string>>; conSoportes: boolean },
): EntradaDeHistorial[] {
  const desde = eventos.findIndex((e) => e.tipo === "reapertura");
  if (desde < 0) return [];
  return eventos
    .slice(desde)
    .filter((e) => c.conSoportes || e.tipo !== "soporte")
    .map((e) => ({
      id: e.id,
      que: queHizo(e, c.nombres),
      quien: e.quien ?? "El sistema",
      cuando: fechaHoraLarga(e.creadoEn),
      porque: texto(e.detalle.justificacion),
      cambios: cambiosDe(e, c.unidad, c.nombres),
    }));
}
