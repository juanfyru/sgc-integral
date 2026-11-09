/**
 * Las tareas de vigencia de «Mis tareas» (spec 13C §7.5 y §13.1), todas calculadas del estado.
 *
 * «Revisar la vigencia»: nace cuando un documento interno vigente entra en atención y sigue mientras esté vencido.
 * Es de los líderes del proceso propietario o, si el proceso no tiene líder, de los Admin SGC (F13A-DC2).
 * Desaparece al ratificar, al publicar una versión nueva o al abrir un trámite (pasa a ser la tarea del trámite), y
 * no se da mientras el documento esté en la revisión anual abierta.
 *
 * «Verificar la vigencia» de un externo: de su responsable técnico, cuando la próxima verificación entra en la
 * ventana de atención o ya pasó. «Adoptar la edición nueva»: de quienes gestionan el externo, desde que una
 * verificación la constató hasta que se adopte una edición.
 */
import { obtenerSql, type Cliente } from "@/db/cliente";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { alcanceProcesos, filtroAcceso } from "@/lib/alcance";
import { puede } from "@/lib/permisos";
import type { Tarea } from "@/lib/tareas";
import { estadoPlazo, fechaLimite } from "@/lib/tramites/plazos";
import { textoFecha } from "@/lib/vigencia/plazo";
import { zonaHoraria } from "@/lib/zona-horaria";
import { columnasDeVigencia, enRevisionAnualAbierta, type FilaSemaforo } from "./fragmentos";

type Opciones = { sql?: Cliente; ahora?: Date };

/** Días que tiene quien gestiona un externo para adoptar la edición nueva que constató una verificación (spec 13C §13.1). */
export const DIAS_PARA_ADOPTAR = 15;

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

export async function tareasDeVigencia(sesion: SesionFlujo, opciones?: Opciones): Promise<Tarea[]> {
  if (sesion.rol !== "lider_proceso" && sesion.rol !== "admin_sgc") return [];
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();

  // El Admin SGC, los procesos sin líder: la misma regla de `lideresDeProceso` (un proceso inactivo no tiene).
  let suyos = sql`NOT (p.activo AND EXISTS (
    SELECT 1 FROM usuario_procesos up
    JOIN usuarios u ON u.id = up.usuario_id AND u.activo AND u.rol = 'lider_proceso'
    WHERE up.proceso_id = p.id))`;
  if (sesion.rol === "lider_proceso") {
    const alcance = await alcanceProcesos(sesion, { sql });
    if (alcance.todos || alcance.procesoIds.length === 0) return [];
    suyos = sql`p.id = ANY(${alcance.procesoIds})`;
  }
  const filas = await columnasDeVigencia(
    sql,
    sql`d.origen = 'interno' AND ${suyos} AND ${filtroAcceso(sql, sesion)} AND NOT ${enRevisionAnualAbierta(sql)}`,
    ahora,
  );
  const zona = zonaHoraria();
  return filas
    .filter((f) => f.vigencia.estado === "atencion" || f.vigencia.estado === "vencida")
    .sort(porVencimiento)
    .map((f) => ({
      id: `vigencia:${f.documentoId}`,
      modulo: "documentos" as const,
      titulo: titulo(f, zona),
      detalle: f.titulo,
      vence: f.proximaRevision,
      enlace: `/documentos/${encodeURIComponent(f.codigo.toLowerCase())}`,
    }));
}

/**
 * «Verificar la vigencia de CEX-DE-01 · Guía de práctica clínica HTA» para el responsable técnico. Se calcula por la
 * fecha de la próxima verificación y no por el estado del semáforo: una edición nueva pendiente lo deja en atención,
 * pero esa tarea es la de adoptarla. Un restringido que el responsable dejó de ver no le da tarea.
 */
export async function tareasDeExternos(sesion: SesionFlujo, opciones?: Opciones): Promise<Tarea[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const [filas, config] = await Promise.all([
    columnasDeVigencia(
      sql,
      sql`d.origen = 'externo' AND ${filtroAcceso(sql, sesion)}
        AND EXISTS (SELECT 1 FROM externos tarea_ex WHERE tarea_ex.documento_id = d.id AND tarea_ex.responsable_id = ${sesion.usuarioId})`,
      ahora,
    ),
    obtenerConfigDocumental({ sql }),
  ]);
  const zona = zonaHoraria();
  const pendientes: { fila: FilaSemaforo; tarea: Tarea }[] = [];
  for (const f of filas) {
    // Una vigente sin fecha no debería existir (la adopción la da): no hay qué vencer.
    if (!f.proximaRevision) continue;
    const plazo = estadoPlazo(f.proximaRevision, ahora, zona);
    const vencida = plazo.estado === "vencido";
    if (!vencida && plazo.dias > config.vigencia.atencionDias) continue;
    pendientes.push({
      fila: f,
      tarea: {
        id: `externo:${f.documentoId}`,
        modulo: "documentos",
        titulo: `Verificar la vigencia de ${f.codigo} · ${f.titulo}`,
        detalle: vencida ? `Verificación vencida hace ${dias(plazo.dias)}` : `Próxima verificación el ${textoFecha(f.proximaRevision, zona)}`,
        vence: f.proximaRevision,
        enlace: `/vigencia/externos/${f.documentoId}`,
      },
    });
  }
  return pendientes.sort((a, b) => porVencimiento(a.fila, b.fila)).map((p) => p.tarea);
}

/**
 * «Adoptar la edición nueva de CEX-DE-01» para quienes gestionan el externo (`externos.gestionar` en su alcance: el
 * líder, sus procesos; el Admin SGC, todos), desde la primera verificación «hay una edición nueva» hasta que se adopte
 * una o una verificación posterior diga que sigue vigente. Vence a los 15 días de esa primera verificación.
 */
export async function tareasDeAdopcion(sesion: SesionFlujo, opciones?: Opciones): Promise<Tarea[]> {
  if (!puede(sesion, "externos.gestionar")) return [];
  const sql = opciones?.sql ?? obtenerSql();
  const alcance = await alcanceProcesos(sesion, { sql });
  if (!alcance.todos && alcance.procesoIds.length === 0) return [];
  const filas = await sql`
    SELECT d.id, d.codigo, d.titulo, ex.edicion_nueva_pendiente_desde AS desde
    FROM documentos d
    JOIN externos ex ON ex.documento_id = d.id
    JOIN documento_proceso dp ON dp.documento_id = d.id AND dp.es_principal
    LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
    WHERE d.origen = 'externo' AND ex.edicion_nueva_pendiente_desde IS NOT NULL AND ${filtroAcceso(sql, sesion)}
      AND EXISTS (SELECT 1 FROM documento_versiones x WHERE x.documento_id = d.id AND x.estado = 'vigente')
      ${alcance.todos ? sql`` : sql`AND COALESCE(dp.proceso_id, s.proceso_id) = ANY(${alcance.procesoIds})`}
    ORDER BY ex.edicion_nueva_pendiente_desde, d.codigo`;
  const zona = zonaHoraria();
  return filas.map((f) => ({
    id: `adopcion:${f.id}`,
    modulo: "documentos",
    titulo: `Adoptar la edición nueva de ${f.codigo}`,
    detalle: f.titulo as string,
    vence: fechaLimite(new Date(f.desde as string), DIAS_PARA_ADOPTAR, zona),
    enlace: `/vigencia/externos/${f.id}`,
  }));
}
