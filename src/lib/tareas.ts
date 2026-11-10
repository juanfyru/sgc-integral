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
import { tareasDeImpactos } from "@/db/consultas/normograma/impactos";
import { listarTramites, type ResumenTramite } from "@/db/consultas/tramites";
import { esResponsableTecnico } from "@/db/consultas/vigencia/externos";
import { tareasDeRevision } from "@/db/consultas/vigencia/revision-anual/tareas";
import { vigenciaDePersona, type VigenciaDePersona } from "@/db/consultas/vigencia/tareas";
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
  /** El título y el enlace pueden depender de lo que reúne: el enlace lleva a una pantalla que lo muestra todo. */
  titulo: (miembros: Tarea[], ahora: Date) => string;
  /** El detalle con la fecha más próxima, ya en texto, y si ya pasó. */
  detalle: (fecha: string, vencida: boolean) => string;
  enlace: (miembros: Tarea[], ahora: Date) => string;
};

const masculino = (fecha: string, vencida: boolean) => (vencida ? `El más atrasado venció el ${fecha}` : `El más próximo vence el ${fecha}`);

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

/**
 * Las fuentes que, pasadas de `umbral`, se muestran como una sola tarea (spec 13C §13.1, con el umbral de la 13B): solo
 * las que tienen una pantalla que muestra todo lo agrupado. No se agrupan la de la revisión anual (`revision:`, ya
 * viene una por proceso), la de los impactos normativos (`impacto:`: no hay una página que liste los pendientes, cada
 * tarea ya dice cuántos documentos tiene; Ruling 63) ni la de adoptar una edición nueva (`adopcion:`: la matriz de
 * externos no las reúne ni las filtra), ni las demás, que son pocas.
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
];

function unir(g: Grupo, miembros: Tarea[], ahora: Date): Tarea {
  const fechas = miembros.flatMap((t) => (t.vence ? [t.vence.getTime()] : []));
  const vence = fechas.length > 0 ? new Date(Math.min(...fechas)) : null;
  const texto = vence ? new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: zonaHoraria() }).format(vence) : null;
  return {
    id: g.id,
    modulo: "documentos",
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

/**
 * Los pasos que le tocan a la persona: los trámites (la pestaña «Por hacer» de la bandeja, spec 13A §14.1), las
 * copias, las lecturas por confirmar, las socializaciones por registrar, las verificaciones, los hallazgos (y su validación), de la
 * vigencia, la adopción de las ediciones nuevas, la verificación de sus externos y la revisión de sus documentos, la de
 * cada proceso suyo en la revisión anual abierta y los impactos normativos de sus procesos (estas dos, una consulta
 * acotada cada una, nada para quien no lidera ni es Admin SGC). Con ellas,
 * `vencidos`: la insignia de «Vigencia». La configuración documental se lee una sola vez, y solo si alguna
 * fuente la usa. `responsableTecnico`, si quien llama ya lo sabe (el cascarón).
 */
export async function misTareas(
  sesion: SesionFlujo,
  opciones?: { sql?: Cliente; ahora?: Date; responsableTecnico?: boolean },
): Promise<{ tareas: Tarea[]; total: number; vencidos: number }> {
  const fuentes = { sql: opciones?.sql, ahora: opciones?.ahora };
  const responsableTecnico = opciones?.responsableTecnico ?? (await esResponsableTecnico(sesion.usuarioId, { sql: opciones?.sql }));
  // La vigencia usa la configuración solo si lee filas: el conteo de la insignia no la necesita (Ruling 68).
  const usaConfig = puede(sesion, "verificaciones.realizar") || modoDeVigencia(sesion, responsableTecnico) === "filas";
  const config = usaConfig ? obtenerConfigDocumental({ sql: opciones?.sql }) : undefined;
  // Quien la espera recibe su rechazo; este `catch` solo evita uno sin atender si ninguna fuente llega a esperarla.
  config?.catch(() => {});
  const [tramites, copias, acuses, socializacion, verificacion, hallazgos, validacion, vigencia, revision, impactos] = await Promise.all([
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
  ];
  return { tareas: agruparTareas(tareas, 5, opciones?.ahora), total: tareas.length, vencidos: vigencia.vencidos };
}
