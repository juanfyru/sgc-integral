/**
 * La tarea «Revisar la vigencia» (spec 13C §7.5 y §13.1): nace cuando un documento interno vigente entra en
 * atención y sigue mientras esté vencido. Es de los líderes del proceso propietario o, si el proceso no tiene
 * líder, de los Admin SGC (F13A-DC2). Desaparece al ratificar, al publicar una versión nueva o al abrir un trámite
 * (pasa a ser la tarea del trámite), y no se da mientras el documento esté en la revisión anual abierta.
 */
import { obtenerSql, type Cliente } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { alcanceProcesos, filtroAcceso } from "@/lib/alcance";
import type { Tarea } from "@/lib/tareas";
import { textoFecha } from "@/lib/vigencia/plazo";
import { zonaHoraria } from "@/lib/zona-horaria";
import { columnasDeVigencia, enRevisionAnualAbierta, type FilaSemaforo } from "./fragmentos";

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

export async function tareasDeVigencia(sesion: SesionFlujo, opciones?: { sql?: Cliente; ahora?: Date }): Promise<Tarea[]> {
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
