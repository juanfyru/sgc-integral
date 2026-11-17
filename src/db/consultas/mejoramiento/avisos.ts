/**
 * Quién tiene el turno de un hallazgo y los avisos del módulo (spec 15 §6.1, §8.1 y §14.2). El turno se calcula al leer,
 * con los usuarios activos de hoy: nunca se guarda. Las tareas siguientes refinan cada resolución en `QUIENES`.
 */
import type { TransactionSql } from "postgres";
import type { Cliente } from "@/db/cliente";
import { avisarA, type Destinatario } from "@/db/consultas/avisos-vencimiento";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { adminsActivos, lideresDeProceso } from "@/db/consultas/tramites";
import { turnoDe, type Turno } from "@/lib/mejoramiento/estados";
import type { EstadoHallazgo, HallazgoBase } from "@/lib/mejoramiento/tipos";
import type { Rol } from "@/lib/roles";

/** La entidad de los avisos y de la bitácora de un hallazgo. */
export const ENTIDAD_HALLAZGO = "mejora_hallazgo";

const rutaDelHallazgo = (id: number) => `/mejoramiento/${id}`;

/** Los usuarios activos de esos roles, por id. */
export async function activosDeRol(sql: Cliente, roles: readonly Rol[]): Promise<number[]> {
  const filas = await sql`SELECT id FROM usuarios WHERE rol = ANY(${roles as Rol[]}) AND activo ORDER BY id`;
  return filas.map((f) => Number(f.id));
}

/**
 * La condición de persona de todo lo que «le toca al líder» (spec §6.1, F15-DC3): ser un líder activo de ese proceso o,
 * si el proceso no tiene ninguno, ser Admin SGC.
 */
export async function actuaPorElProceso(tx: Cliente, sesion: SesionFlujo, procesoId: number): Promise<boolean> {
  const lideres = await lideresDeProceso(procesoId, { sql: tx });
  if (sesion.rol === "lider_proceso") return lideres.includes(sesion.usuarioId);
  return sesion.rol === "admin_sgc" && lideres.length === 0;
}

/** Los líderes activos del proceso o, si no tiene ninguno, los Admin SGC activos. */
async function lideresOAdmins(tx: TransactionSql, procesoId: number): Promise<number[]> {
  const lideres = await lideresDeProceso(procesoId, { sql: tx });
  return lideres.length > 0 ? lideres : adminsActivos({ sql: tx });
}

/** Cómo se resuelve cada turno a usuarios activos. Un solo lugar: las tareas 10, 13 y 16 lo refinan aquí. */
const QUIENES: Record<Turno, (tx: TransactionSql, h: HallazgoBase) => Promise<number[]>> = {
  lideres: (tx, h) => lideresOAdmins(tx, h.procesoId),
  registrador: async (tx, h) => {
    const [u] = await tx`SELECT id FROM usuarios WHERE id = ${h.registradoPor} AND activo`;
    return u ? [Number(u.id)] : adminsActivos({ sql: tx });
  },
  // Arbitra el Admin SGC; si lo registró un Admin SGC, Gerencia (spec §8.3). Sin Gerencia activa, el Admin SGC.
  arbitro: async (tx, h) => {
    const [u] = await tx`SELECT rol FROM usuarios WHERE id = ${h.registradoPor}`;
    if (u?.rol === "admin_sgc") {
      const gerencia = await activosDeRol(tx, ["gerencia"]);
      if (gerencia.length > 0) return gerencia;
    }
    return adminsActivos({ sql: tx });
  },
  admin: (tx) => adminsActivos({ sql: tx }),
  gerencia: (tx) => activosDeRol(tx, ["gerencia"]),
  // Los responsables activos de las actividades sin terminar de la ronda en curso (acción → ronda).
  responsables: async (tx, h) => {
    const filas = await tx`SELECT DISTINCT a.responsable_id AS id
      FROM mejora_actividades a
      JOIN mejora_acciones ac ON ac.id = a.accion_id
      JOIN mejora_rondas r ON r.id = ac.ronda_id
      JOIN usuarios u ON u.id = a.responsable_id AND u.activo
      WHERE a.hallazgo_id = ${h.id} AND r.numero = ${h.ronda} AND a.estado IN ('abierta', 'en_proceso')
      ORDER BY a.responsable_id`;
    return filas.map((f) => Number(f.id));
  },
  verificadores: (tx) => activosDeRol(tx, ["admin_sgc", "control_interno"]),
  validadores: (tx) => activosDeRol(tx, ["admin_sgc", "control_interno"]),
};

/** Los usuarios activos que tienen el turno del hallazgo en su estado actual; vacío si nadie lo tiene. */
export async function quienTieneElTurno(tx: TransactionSql, h: HallazgoBase): Promise<number[]> {
  const turno = turnoDe(h.estado);
  return turno ? QUIENES[turno](tx, h) : [];
}

/** Lo que el turno le pide a quien lo recibe, con el código (spec §14.1); el cuerpo del aviso es el título del hallazgo. */
const LO_QUE_SIGUE: Partial<Record<EstadoHallazgo, (codigo: string) => string>> = {
  por_aceptar: (c) => `Aceptar o rechazar ${c}`,
  rechazo: (c) => `Decidir sobre el rechazo de ${c}`,
  arbitraje: (c) => `Arbitrar el rechazo de ${c}`,
  por_corregir: (c) => `Registrar la corrección de ${c}`,
  por_decidir: (c) => `Decidir si ${c} requiere acción correctiva`,
  por_validar: (c) => `Validar la corrección de ${c}`,
  por_formular: (c) => `Formular la causa raíz y el plan de ${c}`,
  en_revision: (c) => `Revisar el plan de ${c}`,
  en_aprobacion: (c) => `Aprobar el plan de ${c}`,
  en_ejecucion: (c) => `Ejecutar las actividades del plan de ${c}`,
  por_verificar: (c) => `Verificar la implementación de ${c}`,
  por_cerrar: (c) => `Cerrar ${c}`,
};

/** Envuelve `avisarA` con la entidad y el enlace del hallazgo. Sin destinatarios no inserta nada. */
export async function avisarDeMejora(
  tx: TransactionSql,
  aviso: { tipo: string; titulo: string; hallazgoId: number },
  destinatarios: Destinatario[],
): Promise<void> {
  if (destinatarios.length === 0) return;
  await avisarA(
    tx,
    { tipo: aviso.tipo, titulo: aviso.titulo, enlace: rutaDelHallazgo(aviso.hallazgoId), entidad: ENTIDAD_HALLAZGO, entidadId: aviso.hallazgoId },
    destinatarios,
  );
}

/**
 * Avisa `mejora.turno` a quienes tienen el turno del estado del hallazgo, salvo a quien actuó (nadie se avisa de lo que
 * acaba de hacer). Devuelve a quiénes avisó.
 */
export async function avisarDelTurno(
  tx: TransactionSql,
  h: HallazgoBase,
  titulo: string,
  actorId: number | null,
): Promise<number[]> {
  const texto = LO_QUE_SIGUE[h.estado];
  if (!texto) return [];
  const destinos = (await quienTieneElTurno(tx, h)).filter((u) => u !== actorId);
  await avisarDeMejora(
    tx,
    { tipo: "mejora.turno", titulo: texto(h.codigo), hallazgoId: h.id },
    destinos.map((usuarioId) => ({ usuarioId, cuerpo: titulo })),
  );
  return destinos;
}
