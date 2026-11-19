import type { Cliente } from "@/db/cliente";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import {
  tareasDeAcuses,
  tareasDeCopias,
  tareasDeHallazgos,
  tareasDeSocializacion,
  tareasDeValidacion,
  tareasDeVerificacion,
} from "@/db/consultas/distribucion/tareas";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { tareasDeIndicadores } from "@/db/consultas/indicadores/tareas";
import { tareasDeMejoramiento } from "@/db/consultas/mejoramiento/tareas";
import { tareasDeImpactos } from "@/db/consultas/normograma/impactos";
import { listarTramites, type ResumenTramite } from "@/db/consultas/tramites";
import { esResponsableTecnico } from "@/db/consultas/vigencia/externos";
import { tareasDeRevision } from "@/db/consultas/vigencia/revision-anual/tareas";
import { vigenciaDePersona, type VigenciaDePersona } from "@/db/consultas/vigencia/tareas";
import { RUTA_REPORTES_RECIBIDOS } from "@/lib/mejoramiento/reportes";
import { RUTA_PLANES } from "@/lib/mejoramiento/rutas";
import { PREFIJO_REASIGNAR } from "@/lib/mejoramiento/textos";
import { puede } from "@/lib/permisos";
import { cuenta } from "@/lib/plural";
import { modoDeVigencia } from "@/lib/vigencia/modo";
import { zonaHoraria } from "@/lib/zona-horaria";

export type Tarea = {
  id: string; // "<fuente>:<id>", estable
  modulo: "documentos" | "indicadores" | "planes";
  titulo: string; // "Aprobar GTH-PR-12 v3"
  detalle: string | null; // "Inducción y reinducción"
  vence: Date | null;
  enlace: string; // ruta interna
};

export function tituloDeTarea(t: ResumenTramite): string {
  const codigo = t.codigo ?? t.numero;
  const documento = t.versionNumero === null ? codigo : `${codigo} v${t.versionNumero}`;
  const elimina = t.tipo === "eliminar";
  switch (t.etapa) {
    case "visto_bueno":
      return `Dar el visto bueno a ${t.numero}`;
    case "aceptacion":
      return `Aceptar ${t.numero}`;
    case "elaboracion":
      return `${t.ronda > 1 ? "Ajustar" : "Elaborar"} ${documento}`;
    case "revision":
      return `Revisar ${documento}`;
    case "aprobacion":
      return elimina ? `Aprobar la eliminación de ${codigo}` : `Aprobar ${documento}`;
    case "publicacion":
      return elimina ? `Eliminar ${codigo}` : `Publicar ${documento}`;
    default:
      return t.numero;
  }
}

type Grupo = {
  /** El inicio del `id` de las tareas que reúne. */
  prefijo: string;
  id: string;
  /** El de las tareas que reúne; sin él, «documentos». */
  modulo?: Tarea["modulo"];
  /** El título y el enlace pueden depender de lo que reúne: el enlace lleva a una pantalla que lo muestra todo. */
  titulo: (miembros: Tarea[], ahora: Date) => string;
  /** El detalle con la fecha más próxima, ya en texto, y si ya pasó. */
  detalle: (fecha: string, vencida: boolean) => string;
  enlace: (miembros: Tarea[], ahora: Date) => string;
};

const masculino = (fecha: string, vencida: boolean) => (vencida ? `El más atrasado venció el ${fecha}` : `El más próximo vence el ${fecha}`);
const femenino = (fecha: string, vencida: boolean) => (vencida ? `La más atrasada venció el ${fecha}` : `La más próxima vence el ${fecha}`);

/**
 * Un paso de los hallazgos de mejoramiento (`mej-<paso>:`): lleva a la lista filtrada por «Esperan su decisión», que con R2 son
 * justamente los hallazgos de estas tareas, y por el estado del paso (sin estado, el ajuste, la respuesta al ente y el formato
 * firmado de una carga, que no tienen uno propio).
 */
const pasoDeMejora = (paso: string, que: string, estado: string | null, detalle = masculino): Grupo => ({
  prefijo: `mej-${paso}:`,
  id: `mejora-${paso}`,
  modulo: "planes",
  titulo: (m) => `${m.length} ${que}`,
  detalle,
  enlace: () => `/mejoramiento?decision=1${estado ? `&estado=${estado}` : ""}`,
});

/** Un documento por revisar está vencido si su próxima revisión ya pasó; sin fecha, o antes de ella, está en atención. */
const vencidas = (miembros: Tarea[], ahora: Date) => miembros.filter((t) => t.vence !== null && t.vence.getTime() < ahora.getTime()).length;

/** «9 documentos por revisar: 7 vencidos y 2 en atención»; solo vencidos, «6 documentos por revisar» (Ruling 62). */
function documentosPorRevisar(miembros: Tarea[], ahora: Date): string {
  const total = `${miembros.length} documentos por revisar`;
  const vencidos = vencidas(miembros, ahora);
  const enAtencion = miembros.length - vencidos;
  if (enAtencion === 0) return total;
  return vencidos === 0
    ? `${total}: ${enAtencion} en atención`
    : `${total}: ${cuenta(vencidos, "vencido", "vencidos")} y ${enAtencion} en atención`;
}

/** «6 indicadores por reportar, 2 vencidos»; sin vencidos, «6 indicadores por reportar» (spec 14 §10.1). */
const indicadoresPor = (que: string) => (miembros: Tarea[], ahora: Date) => {
  const vencidos = vencidas(miembros, ahora);
  const total = `${miembros.length} indicadores por ${que}`;
  return vencidos === 0 ? total : `${total}, ${cuenta(vencidos, "vencido", "vencidos")}`;
};

/**
 * Las fuentes que, pasadas de `umbral`, se muestran como una sola tarea (spec 13C §13.1, con el umbral de la 13B): solo
 * las que tienen una pantalla que muestra todo lo agrupado. No se agrupan la de la revisión anual (`revision:`, ya
 * viene una por proceso), la de los impactos normativos (`impacto:`: no hay una página que liste los pendientes, cada
 * tarea ya dice cuántos documentos tiene; Ruling 63) ni la de adoptar una edición nueva (`adopcion:`: la matriz de
 * externos no las reúne ni las filtra), ni las demás, que son pocas. De los indicadores (spec 14 §10.1) se agrupan
 * reportar y analizar, que llevan a la lista filtrada por lo que falta y por «Donde participo», los reportes al ente por
 * registrar (anexo 14B, §8), que llevan a la lista filtrada por el envío pendiente, los periodos de los datos compartidos
 * por reportar (anexo 14C, §4.4: `dato:`), que llevan a «Datos compartidos», las revisiones por cambio de norma
 * (anexo 14B, §9: `impacto-indicador:`, que no empieza por el `impacto:` de la 13C), que llevan a la lista filtrada por la
 * revisión pendiente, y las fichas por aprobar; no las observaciones ni las fichas devueltas (`ficha-devuelta:` no empieza
 * por `ficha:`). De mejoramiento (spec 15 §14.1) se agrupa cada fuente `mej-…:`: los reportes por clasificar, que llevan a
 * «Reportes recibidos»; las actividades, que llevan a «Mis actividades» si todas son de quien mira y, con alguna por reasignar
 * (de un responsable inactivo, que «Mis actividades» no muestra), a la lista de los hallazgos que esperan su decisión; cada
 * paso de los hallazgos (`pasoDeMejora`); y las respuestas al ente de los planes (Fase 15B, `mej-ente-plan:`), que llevan a la
 * pestaña «Planes». No se agrupan las marcas de los indicadores por decidir (Fase 15B, `mej-marca:`), como `adopcion:`: ninguna
 * pantalla las reúne todas (la lista de indicadores filtrada por «Requiere acción de mejora» mira solo la última medición de cada
 * uno), así que cada una lleva al panel de su indicador.
 */
const GRUPOS: readonly Grupo[] = [
  // Una lectura vence siempre después de pedirse: el detalle de la 13B no cambia.
  {
    prefijo: "acuse:",
    id: "acuses",
    titulo: (m) => `${m.length} lecturas por confirmar`,
    detalle: (fecha) => `La más próxima vence el ${fecha}`,
    enlace: () => "/acuses",
  },
  // El semáforo de los vencidos solo si todos lo están: si no, el filtro escondería los que están en atención.
  {
    prefijo: "vigencia:",
    id: "vigencia",
    titulo: documentosPorRevisar,
    detalle: masculino,
    enlace: (m, ahora) => (vencidas(m, ahora) === m.length ? "/vigencia/semaforo?estado=vencida" : "/vigencia/semaforo"),
  },
  { prefijo: "externo:", id: "externos", titulo: (m) => `${m.length} externos por verificar`, detalle: masculino, enlace: () => "/vigencia/externos" },
  {
    prefijo: "medir:",
    id: "indicadores-por-reportar",
    modulo: "indicadores",
    titulo: indicadoresPor("reportar"),
    detalle: masculino,
    enlace: () => "/indicadores?reporte=por-reportar&participo=1",
  },
  {
    prefijo: "analizar:",
    id: "indicadores-por-analizar",
    modulo: "indicadores",
    titulo: indicadoresPor("analizar"),
    detalle: masculino,
    enlace: () => "/indicadores?reporte=falta-analisis&participo=1",
  },
  {
    prefijo: "constancia:",
    id: "reportes-al-ente",
    modulo: "indicadores",
    titulo: (m) => `${m.length} reportes al ente por registrar`,
    detalle: masculino,
    enlace: () => "/indicadores?envio=pendiente&participo=1",
  },
  {
    prefijo: "dato:",
    id: "datos-por-reportar",
    modulo: "indicadores",
    titulo: () => "Datos compartidos por reportar",
    detalle: masculino,
    enlace: () => "/indicadores/datos",
  },
  {
    prefijo: "impacto-indicador:",
    id: "indicadores-por-revisar-norma",
    modulo: "indicadores",
    // Cuenta revisiones: un indicador con dos normas cambiadas suma dos.
    titulo: (m) => `${cuenta(m.length, "revisión de un indicador", "revisiones de indicadores")} por un cambio de norma`,
    detalle: masculino,
    enlace: () => "/indicadores?impacto=1",
  },
  {
    prefijo: "ficha:",
    id: "fichas-por-aprobar",
    modulo: "indicadores",
    titulo: (m) => `${m.length} fichas por aprobar`,
    detalle: masculino,
    enlace: () => "/indicadores/por-aprobar",
  },
  {
    prefijo: "mej-clasificar:",
    id: "mejora-reportes",
    modulo: "planes",
    titulo: (m) => `${m.length} reportes de mejoramiento por clasificar`,
    detalle: masculino,
    enlace: () => RUTA_REPORTES_RECIBIDOS,
  },
  {
    prefijo: "mej-actividad:",
    id: "mejora-actividades",
    modulo: "planes",
    titulo: (m) => `${m.length} actividades de planes de mejoramiento`,
    detalle: femenino,
    enlace: (m) => (m.some((t) => t.titulo.startsWith(PREFIJO_REASIGNAR)) ? "/mejoramiento?decision=1" : "/mejoramiento/actividades"),
  },
  pasoDeMejora("aceptar", "hallazgos por aceptar o rechazar", "por_aceptar"),
  pasoDeMejora("rechazo", "rechazos de hallazgos por decidir", "rechazo"),
  pasoDeMejora("arbitrar", "rechazos de hallazgos por arbitrar", "arbitraje"),
  pasoDeMejora("corregir", "correcciones de hallazgos por registrar", "por_corregir", femenino),
  pasoDeMejora("decidir", "hallazgos por decidir si requieren acción correctiva", "por_decidir"),
  pasoDeMejora("validar", "correcciones de hallazgos por validar", "por_validar", femenino),
  pasoDeMejora("formular", "planes de mejoramiento por formular", "por_formular"),
  pasoDeMejora("revisar", "planes de mejoramiento por revisar", "en_revision"),
  pasoDeMejora("aprobar", "planes de mejoramiento por aprobar", "en_aprobacion"),
  pasoDeMejora("ajuste", "ajustes de planes de mejoramiento por decidir", null),
  pasoDeMejora("verificar", "hallazgos por verificar", "por_verificar"),
  pasoDeMejora("evaluar", "hallazgos por evaluar la eficacia", "por_evaluar"),
  pasoDeMejora("cerrar", "hallazgos por cerrar", "por_cerrar"),
  pasoDeMejora("ente", "respuestas al ente por registrar", null, femenino),
  pasoDeMejora("escaneo", "cargas sin su formato firmado", null, femenino),
  // Una por plan (anexo 15B §3.8): no empieza por `mej-ente:`, así que no se mezcla con las de un hallazgo suelto.
  {
    prefijo: "mej-ente-plan:",
    id: "mejora-ente-plan",
    modulo: "planes",
    titulo: (m) => `${m.length} respuestas al ente de planes por registrar`,
    detalle: femenino,
    enlace: () => RUTA_PLANES,
  },
];

function unir(g: Grupo, miembros: Tarea[], ahora: Date): Tarea {
  const fechas = miembros.flatMap((t) => (t.vence ? [t.vence.getTime()] : []));
  const vence = fechas.length > 0 ? new Date(Math.min(...fechas)) : null;
  const texto = vence ? new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: zonaHoraria() }).format(vence) : null;
  return {
    id: g.id,
    modulo: g.modulo ?? "documentos",
    titulo: g.titulo(miembros, ahora),
    detalle: vence && texto ? g.detalle(texto, vence.getTime() < ahora.getTime()) : null,
    vence,
    enlace: g.enlace(miembros, ahora),
  };
}

/**
 * Más de `umbral` tareas de una misma fuente de `GRUPOS` (lecturas por confirmar, documentos por revisar, externos por
 * verificar) se muestran como una sola, en el lugar de la primera. Quien llama cuenta el total sobre las tareas sin
 * agrupar (F13B-R12).
 */
export function agruparTareas(tareas: Tarea[], umbral = 5, ahora = new Date()): Tarea[] {
  const agrupadas = new Map<Grupo, Tarea>();
  for (const g of GRUPOS) {
    const miembros = tareas.filter((t) => t.id.startsWith(g.prefijo));
    if (miembros.length > umbral) agrupadas.set(g, unir(g, miembros, ahora));
  }
  if (agrupadas.size === 0) return tareas;
  const puestas = new Set<Grupo>();
  return tareas.flatMap((t) => {
    const g = GRUPOS.find((x) => t.id.startsWith(x.prefijo));
    const agrupada = g ? agrupadas.get(g) : undefined;
    if (!g || !agrupada) return [t];
    if (puestas.has(g)) return [];
    puestas.add(g);
    return [agrupada];
  });
}

const SIN_VIGENCIA: VigenciaDePersona = { tareas: [], vencidos: 0 };
const SIN_INDICADORES = { tareas: [] as Tarea[], vencidas: 0 };
const SIN_MEJORAMIENTO = { tareas: [] as Tarea[] };

/**
 * Los pasos que le tocan a la persona: los trámites (la pestaña «Por hacer» de la bandeja, spec 13A §14.1), las
 * copias, las lecturas por confirmar, las socializaciones por registrar, las verificaciones, los hallazgos (y su validación), de la
 * vigencia, la adopción de las ediciones nuevas, la verificación de sus externos y la revisión de sus documentos, la de
 * cada proceso suyo en la revisión anual abierta y los impactos normativos de sus procesos (estas dos, una consulta
 * acotada cada una, nada para quien no lidera ni es Admin SGC), las de los indicadores y, al final, las de mejoramiento (spec
 * 15 §14.1, sin insignia en la barra). Con ellas,
 * `vencidos`: la insignia de «Vigencia», y `vencidasIndicadores`: la de «Indicadores» (spec 14 §10.1). La configuración
 * documental se lee una sola vez, y solo si alguna fuente la usa. `responsableTecnico`, si quien llama ya lo sabe (el
 * cascarón).
 */
export async function misTareas(
  sesion: SesionFlujo,
  opciones?: { sql?: Cliente; ahora?: Date; responsableTecnico?: boolean },
): Promise<{ tareas: Tarea[]; total: number; vencidos: number; vencidasIndicadores: number }> {
  const fuentes = { sql: opciones?.sql, ahora: opciones?.ahora };
  const responsableTecnico = opciones?.responsableTecnico ?? (await esResponsableTecnico(sesion.usuarioId, { sql: opciones?.sql }));
  // La vigencia usa la configuración solo si lee filas: el conteo de la insignia no la necesita (Ruling 68).
  const usaConfig = puede(sesion, "verificaciones.realizar") || modoDeVigencia(sesion, responsableTecnico) === "filas";
  const config = usaConfig ? obtenerConfigDocumental({ sql: opciones?.sql }) : undefined;
  // Quien la espera recibe su rechazo; este `catch` solo evita uno sin atender si ninguna fuente llega a esperarla.
  config?.catch(() => {});
  const [tramites, copias, acuses, socializacion, verificacion, hallazgos, validacion, vigencia, revision, impactos, indicadores, mejoramiento] = await Promise.all([
    listarTramites(sesion, "por_hacer", fuentes),
    tareasDeCopias(sesion, fuentes),
    tareasDeAcuses(sesion, fuentes),
    tareasDeSocializacion(sesion, fuentes),
    tareasDeVerificacion(sesion, { ...fuentes, config }),
    tareasDeHallazgos(sesion, fuentes),
    tareasDeValidacion(sesion, { sql: opciones?.sql, config }),
    // Calculada del estado y la más pesada: si falla se registra, y las demás tareas y la página siguen sin ella.
    vigenciaDePersona(sesion, { responsableTecnico }, { ...fuentes, config }).catch((err: unknown) => {
      console.error("No se pudo calcular la vigencia de «Mis tareas» y de la insignia:", err);
      return SIN_VIGENCIA;
    }),
    tareasDeRevision(sesion, fuentes),
    tareasDeImpactos(sesion, fuentes),
    // Como la vigencia, calculada del estado: si falla se registra, y las demás tareas y la página siguen sin ella.
    tareasDeIndicadores(sesion, fuentes).catch((err: unknown) => {
      console.error("No se pudieron calcular las tareas de indicadores de «Mis tareas» y de la insignia:", err);
      return SIN_INDICADORES;
    }),
    // También calculadas del estado: si fallan se registra, y las demás tareas y la página siguen sin ellas.
    tareasDeMejoramiento(sesion, fuentes).catch((err: unknown) => {
      console.error("No se pudieron calcular las tareas de mejoramiento de «Mis tareas»:", err);
      return SIN_MEJORAMIENTO;
    }),
  ]);
  const tareas: Tarea[] = [
    ...tramites.map((t) => ({
      id: `tramite:${t.id}`,
      modulo: "documentos" as const,
      titulo: tituloDeTarea(t),
      detalle: t.titulo,
      vence: t.venceEn,
      enlace: `/tramites/${t.id}`,
    })),
    ...copias,
    ...acuses,
    ...socializacion,
    ...verificacion,
    ...hallazgos,
    ...validacion,
    ...vigencia.tareas,
    ...revision,
    ...impactos,
    ...indicadores.tareas,
    ...mejoramiento.tareas,
  ];
  return {
    tareas: agruparTareas(tareas, 5, opciones?.ahora),
    total: tareas.length,
    vencidos: vigencia.vencidos,
    vencidasIndicadores: indicadores.vencidas,
  };
}
