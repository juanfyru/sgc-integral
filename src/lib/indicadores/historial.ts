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

function queHizo(e: EventoDeMedicion): string {
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
      return "Se recalculó";
  }
}

/** Qué había y qué quedó: las variables (por su nombre), «no aplica», el resultado, el semáforo, el estado, el análisis y la meta. */
function cambiosDe(e: EventoDeMedicion, unidad: Unidad, nombres: Readonly<Record<string, string>>): string[] {
  const antes = objeto(e.detalle.antes);
  const despues = objeto(e.detalle.despues);
  const salida: string[] = [];
  const cambio = (etiqueta: string, a: string | null, b: string | null, vacio: string) => salida.push(`${etiqueta}: ${a ?? vacio} → ${b ?? vacio}`);
  const letras = [...new Set([...Object.keys(antes), ...Object.keys(despues)])].filter((k) => /^[A-Z]$/.test(k)).sort();
  for (const l of letras) if (distinto(antes[l], despues[l])) cambio(nombres[l] ?? l, numero(antes[l], null), numero(despues[l], null), "—");
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
  if (distinto(antes.estado, despues.estado)) {
    const s = (v: unknown) => (typeof v === "string" ? (ESTADO[v] ?? v) : null);
    cambio("Estado", s(antes.estado), s(despues.estado), "—");
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
      que: queHizo(e),
      quien: e.quien ?? "El sistema",
      cuando: fechaHoraLarga(e.creadoEn),
      porque: texto(e.detalle.justificacion),
      cambios: cambiosDe(e, c.unidad, c.nombres),
    }));
}
