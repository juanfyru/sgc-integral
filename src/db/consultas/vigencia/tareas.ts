/**
 * Las tareas de vigencia de «Mis tareas» (spec 13C §7.5 y §13.1), todas calculadas del estado, y la insignia de la
 * entrada «Vigencia» (spec 13C §14.1). Todo sale de una sola lectura por persona (`vigenciaDePersona`, resolución 1
 * de la Tarea 7): el cascarón corre en todas las páginas.
 *
 * «Revisar la vigencia»: nace cuando un documento interno vigente entra en atención y sigue mientras esté vencido.
 * Es de los líderes del proceso propietario o, si el proceso no tiene líder activo, de los Admin SGC (F13A-DC2).
 * Desaparece al ratificar, al publicar una versión nueva o al abrir un trámite (pasa a ser la tarea del trámite), y
 * no se da mientras el documento esté en la revisión anual abierta.
 *
 * «Verificar la vigencia» de un externo: de su responsable técnico, cuando la próxima verificación entra en la
 * ventana de atención o ya pasó. «Adoptar la edición nueva»: de quienes gestionan el externo con la misma regla de
 * F13A-DC2 (los líderes del proceso, o los Admin SGC si no tiene líder activo), desde que una verificación la
 * constató hasta que se adopte una edición. Las de los externos no se omiten con una revisión anual abierta.
 */
import { obtenerSql, type Cliente } from "@/db/cliente";
import { obtenerConfigDocumental, type ConfigDocumental } from "@/db/consultas/config-documental";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { alcanceProcesos, filtroVigencia, type Alcance } from "@/lib/alcance";
import { puede } from "@/lib/permisos";
import type { Tarea } from "@/lib/tareas";
import { estadoPlazo, fechaLimite } from "@/lib/tramites/plazos";
import { modoDeVigencia } from "@/lib/vigencia/modo";
import { textoFecha } from "@/lib/vigencia/plazo";
import { zonaHoraria } from "@/lib/zona-horaria";
import { contarVencidas, enElSemaforo, filasDeLectura, lecturaDeVigencia, type FilaDePersona, type FilaSemaforo } from "./fragmentos";

type Opciones = { sql?: Cliente; ahora?: Date };

/** Días que tiene quien gestiona un externo para adoptar la edición nueva que constató una verificación (spec 13C §13.1). */
export const DIAS_PARA_ADOPTAR = 15;

export type VigenciaDePersona = {
  /** Las de adoptar, las de verificar y las de revisar, en ese orden. */
  tareas: Tarea[];
  /** La insignia de «Vigencia»: los documentos de su alcance con la vigencia vencida. */
  vencidos: number;
};

const NADA: VigenciaDePersona = { tareas: [], vencidos: 0 };

const dias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;

/** «Revisar la vigencia de GTH-PR-01 v1 · vence el 14 ago 2026», «… · vencida hace 3 días» o «… · sin fecha de revisión». */
function titulo(f: FilaSemaforo, zona: string): string {
  const documento = `Revisar la vigencia de ${f.codigo} v${f.version.numero}`;
  if (!f.proximaRevision) return `${documento} · sin fecha de revisión`;
  if (f.vigencia.estado === "vencida" && f.vigencia.dias !== null) return `${documento} · vencida hace ${dias(-f.vigencia.dias)}`;
  return `${documento} · vence el ${textoFecha(f.proximaRevision, zona)}`;
}

/** Lo que no tiene fecha primero (es una anomalía), y después lo que vence antes. */
const porVencimiento = (a: FilaSemaforo, b: FilaSemaforo) =>
  (a.proximaRevision?.getTime() ?? Number.NEGATIVE_INFINITY) - (b.proximaRevision?.getTime() ?? Number.NEGATIVE_INFINITY) ||
  a.codigo.localeCompare(b.codigo, "es");

type Contexto = { sesion: SesionFlujo; alcance: Alcance; ahora: Date; zona: string; atencionDias: number };

/** F13A-DC2: el líder, en los procesos de su alcance; el Admin SGC, en los que no tienen líder activo. */
function esDeLaPersona(f: FilaDePersona, c: Contexto): boolean {
  if (c.sesion.rol === "lider_proceso") return !c.alcance.todos && c.alcance.procesoIds.includes(f.proceso.id);
  if (c.sesion.rol === "admin_sgc") return !f.procesoConLider;
  return false;
}

function revisarVigencia(filas: FilaDePersona[], c: Contexto): Tarea[] {
  return filas
    .filter(
      (f) =>
        f.origen === "interno" &&
        !f.enRevisionAnual &&
        esDeLaPersona(f, c) &&
        (f.vigencia.estado === "atencion" || f.vigencia.estado === "vencida"),
    )
    .sort(porVencimiento)
    .map((f) => ({
      id: `vigencia:${f.documentoId}`,
      modulo: "documentos",
      titulo: titulo(f, c.zona),
      detalle: f.titulo,
      vence: f.proximaRevision,
      enlace: `/documentos/${encodeURIComponent(f.codigo.toLowerCase())}`,
    }));
}

/**
 * «Verificar la vigencia de CEX-DE-01 · Guía de práctica clínica HTA», por la fecha de la próxima verificación y no por
 * el estado del semáforo: una edición nueva pendiente lo deja en atención, pero esa tarea es la de adoptarla.
 */
function verificarExternos(filas: FilaDePersona[], c: Contexto): Tarea[] {
  const pendientes: { fila: FilaDePersona; tarea: Tarea }[] = [];
  for (const f of filas) {
    // Una vigente sin fecha no debería existir (la adopción la da): no hay qué vencer.
    if (f.origen !== "externo" || f.responsableTecnicoId !== c.sesion.usuarioId || !f.proximaRevision) continue;
    const plazo = estadoPlazo(f.proximaRevision, c.ahora, c.zona);
    const vencida = plazo.estado === "vencido";
    if (!vencida && plazo.dias > c.atencionDias) continue;
    pendientes.push({
      fila: f,
      tarea: {
        id: `externo:${f.documentoId}`,
        modulo: "documentos",
        titulo: `Verificar la vigencia de ${f.codigo} · ${f.titulo}`,
        detalle: vencida ? `Verificación vencida hace ${dias(plazo.dias)}` : `Próxima verificación el ${textoFecha(f.proximaRevision, c.zona)}`,
        vence: f.proximaRevision,
        enlace: `/vigencia/externos/${f.documentoId}`,
      },
    });
  }
  return pendientes.sort((a, b) => porVencimiento(a.fila, b.fila)).map((p) => p.tarea);
}

/** «Adoptar la edición nueva de CEX-DE-01», a 15 días de la primera verificación «hay una edición nueva». */
function adoptarEdiciones(filas: FilaDePersona[], c: Contexto): Tarea[] {
  if (!puede(c.sesion, "externos.gestionar")) return [];
  return filas
    .flatMap((f) => (f.origen === "externo" && f.edicionPendiente && esDeLaPersona(f, c) ? [{ f, desde: f.edicionPendiente.desde }] : []))
    .sort((a, b) => a.desde.getTime() - b.desde.getTime() || a.f.codigo.localeCompare(b.f.codigo, "es"))
    .map(({ f, desde }) => ({
      id: `adopcion:${f.documentoId}`,
      modulo: "documentos",
      titulo: `Adoptar la edición nueva de ${f.codigo}`,
      detalle: f.titulo,
      vence: fechaLimite(desde, DIAS_PARA_ADOPTAR, c.zona),
      enlace: `/vigencia/externos/${f.documentoId}`,
    }));
}

/**
 * Las tareas de vigencia de la persona y la insignia de «Vigencia», con una sola consulta de vigencia y la
 * configuración leída una vez (la de `config` si quien llama ya la pidió). Las filas son las del semáforo que ve
 * (`vigencia.ver`) y, si es responsable técnico, sus externos (`lecturaDeVigencia`, compartida por petición con las
 * pestañas de Vigencia): quien no tiene ninguna de las dos no consulta nada, y quien solo necesita la insignia la cuenta
 * en SQL sin leer filas ni la configuración (`contarVencidas`). La insignia cuenta, con `vigencia.ver`, los vencidos del
 * semáforo que ve; si solo es responsable técnico, sus externos.
 */
export async function vigenciaDePersona(
  sesion: SesionFlujo,
  d: { responsableTecnico: boolean },
  opciones?: Opciones & { config?: Promise<ConfigDocumental> | ConfigDocumental },
): Promise<VigenciaDePersona> {
  const modo = modoDeVigencia(sesion, d.responsableTecnico);
  if (modo === "nada") return NADA;
  const veSemaforo = puede(sesion, "vigencia.ver") || puede(sesion, "documentos.indicadores");
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  if (modo === "conteo") {
    const alcance = await alcanceProcesos(sesion, { sql });
    return { tareas: [], vencidos: await contarVencidas(sql, filtroVigencia(sql, sesion, alcance), ahora) };
  }
  const [config, { filas: crudas, alcance }] = await Promise.all([
    opciones?.config ?? obtenerConfigDocumental({ sql }),
    lecturaDeVigencia(sql, sesion),
  ]);
  const filas = filasDeLectura(crudas, ahora, config);

  const c: Contexto = { sesion, alcance, ahora, zona: zonaHoraria(), atencionDias: config.vigencia.atencionDias };
  const cuenta = veSemaforo ? enElSemaforo(true, alcance) : (f: FilaDePersona) => f.responsableTecnicoId === sesion.usuarioId;
  return {
    tareas: [...adoptarEdiciones(filas, c), ...verificarExternos(filas, c), ...revisarVigencia(filas, c)],
    vencidos: filas.filter((f) => f.vigencia.estado === "vencida" && cuenta(f)).length,
  };
}

/** Las tareas de una fuente sola, de la misma lectura; «Mis tareas» y el cascarón usan `vigenciaDePersona`. */
async function deUnaFuente(sesion: SesionFlujo, prefijo: string, responsableTecnico: boolean, opciones?: Opciones): Promise<Tarea[]> {
  return (await vigenciaDePersona(sesion, { responsableTecnico }, opciones)).tareas.filter((t) => t.id.startsWith(prefijo));
}

/** «Revisar la vigencia» de los internos de la persona. */
export function tareasDeVigencia(sesion: SesionFlujo, opciones?: Opciones): Promise<Tarea[]> {
  return deUnaFuente(sesion, "vigencia:", false, opciones);
}

/** «Verificar la vigencia» de los externos de los que la persona es responsable técnico (y todavía ve). */
export function tareasDeExternos(sesion: SesionFlujo, opciones?: Opciones): Promise<Tarea[]> {
  return deUnaFuente(sesion, "externo:", true, opciones);
}

/** «Adoptar la edición nueva» de los externos que la persona gestiona. */
export function tareasDeAdopcion(sesion: SesionFlujo, opciones?: Opciones): Promise<Tarea[]> {
  return deUnaFuente(sesion, "adopcion:", false, opciones);
}
