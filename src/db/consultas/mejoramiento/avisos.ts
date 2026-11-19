/**
 * Quién tiene el turno de un hallazgo y los avisos del módulo (spec 15 §6.1, §8.1 y §14.2). El turno se calcula al leer,
 * con los usuarios activos de hoy: nunca se guarda. Las tareas siguientes refinan cada resolución en `QUIENES`.
 */
import type { TransactionSql } from "postgres";
import type { Cliente } from "@/db/cliente";
import { avisarA, type Destinatario } from "@/db/consultas/avisar";
import { adminsActivos, lideresDeProceso } from "@/db/consultas/tramites";
import { quienesVerifican, validadoresDeCorreccion } from "@/lib/alcance";
import { turnoDe, type Turno } from "@/lib/mejoramiento/estados";
import { esExterno } from "@/lib/mejoramiento/origenes";
import type { EstadoHallazgo, HallazgoBase, ResultadoCierre } from "@/lib/mejoramiento/tipos";
import type { Rol } from "@/lib/roles";
import { lideresOAdmins } from "./proceso";

/** La entidad de los avisos y de la bitácora de un hallazgo. */
export const ENTIDAD_HALLAZGO = "mejora_hallazgo";

/** La entidad de los avisos y de la bitácora de una actividad del plan. */
export const ENTIDAD_ACTIVIDAD = "mejora_actividad";

const rutaDelHallazgo = (id: number) => `/mejoramiento/${id}`;

/** Los usuarios activos de esos roles, por id. */
export async function activosDeRol(sql: Cliente, roles: readonly Rol[]): Promise<number[]> {
  const filas = await sql`SELECT id FROM usuarios WHERE rol = ANY(${roles as Rol[]}) AND activo ORDER BY id`;
  return filas.map((f) => Number(f.id));
}

// Viven en `proceso.ts`, liviano (lo importa `archivos.ts` sin llegar a `avisos-vencimiento.ts`); aquí se reexportan.
export { actuaPorElProceso, lideresOAdmins } from "./proceso";

/**
 * Quienes arbitran un rechazo sostenido (spec §8.3, F15-DC13: no arbitra quien ya tomó parte): los Admin SGC activos; los
 * de Gerencia si un Admin SGC lo registró o lo sostuvo en lugar de quien lo registró. Si le toca a Gerencia y no hay
 * ninguna activa, los Admin SGC activos que no lo registraron ni lo sostuvieron. Quién lo sostuvo lo dice el último evento
 * `sostener` (su `usuario_id`). Una sola regla: la usan el turno y el arbitraje dentro de su transacción.
 */
export async function arbitrosDe(tx: Cliente, h: Pick<HallazgoBase, "id" | "registradoPor">): Promise<number[]> {
  return (await arbitrosDeVarios(tx, [h])).get(h.id) ?? [];
}

/**
 * Los Admin SGC y los de Gerencia activos, cada rol leído una sola vez por llamada (el turno y las tareas de una página entera los
 * piden para muchos hallazgos: anexo 15B §11.1). Una consulta por rol, la primera vez que se pide.
 */
export type ActivosDeUnaVez = (rol: "admin_sgc" | "gerencia") => Promise<number[]>;

export function activosDeUnaVez(tx: Cliente): ActivosDeUnaVez {
  const leidos = new Map<string, Promise<number[]>>();
  return (rol) => {
    if (!leidos.has(rol)) leidos.set(rol, rol === "admin_sgc" ? adminsActivos({ sql: tx }) : activosDeRol(tx, ["gerencia"]));
    return leidos.get(rol)!;
  };
}

/**
 * `arbitrosDe` de varios hallazgos: quién lo registró y quién lo sostuvo, de todos en una consulta, y la misma regla hallazgo por
 * hallazgo. Una sola regla para uno solo (el arbitraje, el aviso) y para una página (la lista y las tareas).
 */
export async function arbitrosDeVarios(
  tx: Cliente,
  hs: ReadonlyArray<Pick<HallazgoBase, "id" | "registradoPor">>,
  activos: ActivosDeUnaVez = activosDeUnaVez(tx),
): Promise<Map<number, number[]>> {
  const arbitros = new Map<number, number[]>();
  if (hs.length === 0) return arbitros;
  const hechos = await tx`SELECT x.id, ur.rol AS rol_registro, s.hay, s.usuario_id AS sostuvo_id, us.rol AS rol_sostuvo
    FROM unnest(${tx.array(hs.map((h) => h.id))}::bigint[], ${tx.array(hs.map((h) => h.registradoPor))}::bigint[]) AS x(id, registrado_por)
    LEFT JOIN usuarios ur ON ur.id = x.registrado_por
    LEFT JOIN LATERAL (SELECT e.usuario_id, true AS hay FROM mejora_eventos e
      WHERE e.hallazgo_id = x.id AND e.tipo = 'sostener' ORDER BY e.id DESC LIMIT 1) s ON true
    LEFT JOIN usuarios us ON us.id = s.usuario_id`;
  const deCada = new Map(hechos.map((f) => [Number(f.id), f]));
  for (const h of hs) {
    const f = deCada.get(h.id);
    const admins = await activos("admin_sgc");
    if (f?.rol_registro !== "admin_sgc" && f?.rol_sostuvo !== "admin_sgc") {
      arbitros.set(h.id, [...admins]);
      continue;
    }
    const gerencia = await activos("gerencia");
    if (gerencia.length > 0) {
      arbitros.set(h.id, [...gerencia]);
      continue;
    }
    const tomaronParte = [h.registradoPor, f?.hay === true ? Number(f.sostuvo_id) : null];
    arbitros.set(h.id, admins.filter((u) => !tomaronParte.includes(u)));
  }
  return arbitros;
}

/** Quien elaboró el plan enviado de la ronda en curso (`mejora_rondas.elaborado_por`), o `null`. */
export async function elaboradorDelPlan(tx: Cliente, h: Pick<HallazgoBase, "id" | "ronda">): Promise<number | null> {
  const [r] = await tx`SELECT elaborado_por FROM mejora_rondas WHERE hallazgo_id = ${h.id} AND numero = ${h.ronda}`;
  return r?.elaborado_por === null || r?.elaborado_por === undefined ? null : Number(r.elaborado_por);
}

/**
 * Quienes revisan el plan enviado de la ronda en curso (spec §8.6, F15-DC15): los Admin SGC activos, salvo quien lo elaboró:
 * nadie firma «Revisó» sobre lo que elaboró. Una sola regla: la usan el turno y la revisión.
 */
export async function revisoresDe(tx: Cliente, h: Pick<HallazgoBase, "id" | "ronda">): Promise<number[]> {
  return (await revisoresDeVarios(tx, [h])).get(h.id) ?? [];
}

/** `revisoresDe` de varios hallazgos: quién elaboró cada plan, de todos en una consulta, y la misma regla. */
export async function revisoresDeVarios(
  tx: Cliente,
  hs: ReadonlyArray<Pick<HallazgoBase, "id" | "ronda">>,
  activos: ActivosDeUnaVez = activosDeUnaVez(tx),
): Promise<Map<number, number[]>> {
  const revisores = new Map<number, number[]>();
  if (hs.length === 0) return revisores;
  const filas = await tx`SELECT x.id, r.elaborado_por
    FROM unnest(${tx.array(hs.map((h) => h.id))}::bigint[], ${tx.array(hs.map((h) => h.ronda))}::int[]) AS x(id, ronda)
    LEFT JOIN mejora_rondas r ON r.hallazgo_id = x.id AND r.numero = x.ronda`;
  const elaboro = new Map(filas.map((f) => [Number(f.id), f.elaborado_por === null ? null : Number(f.elaborado_por)]));
  const admins = await activos("admin_sgc");
  for (const h of hs) revisores.set(h.id, admins.filter((u) => u !== (elaboro.get(h.id) ?? null)));
  return revisores;
}

/**
 * El turno de «En revisión»: quienes lo revisan; si no queda ninguno (el otro Admin SGC dejó de estar activo después del
 * envío), quien lo elaboró, si sigue activo, para devolverlo y reenviarlo: el reenvío pasa directo a Gerencia (F15-DC15: la
 * falta de un segundo Admin SGC nunca traba el camino).
 */
async function turnoDeLaRevision(tx: Cliente, h: Pick<HallazgoBase, "id" | "ronda">): Promise<number[]> {
  const revisores = await revisoresDe(tx, h);
  if (revisores.length > 0) return revisores;
  const elaboro = await elaboradorDelPlan(tx, h);
  if (elaboro === null) return [];
  const [u] = await tx`SELECT id FROM usuarios WHERE id = ${elaboro} AND activo`;
  return u ? [elaboro] : [];
}

/** Cómo se resuelve cada turno a usuarios activos. Un solo lugar: las tareas 10, 13 y 16 lo refinan aquí. */
const QUIENES: Record<Turno, (tx: Cliente, h: HallazgoBase) => Promise<number[]>> = {
  // Quien lo registró no lo acepta (`puedeAceptar`, spec §6.1): fuera del turno de «Por aceptar», aunque lidere el proceso o
  // sea el Admin SGC que actúa por él. Sin nadie más, el turno queda vacío: nadie recibe el aviso, la tarea ni el vencido.
  lideres: async (tx, h) => {
    const lideres = await lideresOAdmins(tx, h.procesoId);
    return h.estado === "por_aceptar" ? lideres.filter((u) => u !== h.registradoPor) : lideres;
  },
  registrador: async (tx, h) => {
    const [u] = await tx`SELECT id FROM usuarios WHERE id = ${h.registradoPor} AND activo`;
    return u ? [Number(u.id)] : adminsActivos({ sql: tx });
  },
  arbitro: (tx, h) => arbitrosDe(tx, h),
  admin: (tx, h) => (h.estado === "en_revision" ? turnoDeLaRevision(tx, h) : adminsActivos({ sql: tx })),
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
  // Quien ejecutó no verifica; Gerencia, solo si ningún Admin SGC ni Control Interno activo puede (spec §11.1).
  verificadores: (tx, h) => quienesVerifican(tx, h.id),
  // Quien registró la corrección o es su responsable no la valida; en el cierre sin acción, tampoco quien decidió el «no».
  validadores: (tx, h) => validadoresDeCorreccion(h.id, { sql: tx }),
};

/** Quienes pueden verificar un hallazgo y evaluar su eficacia (`quienesVerifican`): los avisos de una posible recurrencia. */
export function verificadoresActivos(tx: Cliente, h: HallazgoBase): Promise<number[]> {
  return QUIENES.verificadores(tx, h);
}

/** Los usuarios activos que tienen el turno del hallazgo en su estado actual; vacío si nadie lo tiene. */
export async function quienTieneElTurno(tx: Cliente, h: HallazgoBase): Promise<number[]> {
  const turno = turnoDe(h.estado);
  return turno ? QUIENES[turno](tx, h) : [];
}

/** Lo que el turno le pide a quien lo recibe, con el código (spec §14.1); el cuerpo del aviso es el título del hallazgo. */
const LO_QUE_SIGUE: Partial<Record<EstadoHallazgo, (codigo: string, h: HallazgoBase) => string>> = {
  por_aceptar: (c) => `Aceptar o rechazar ${c}`,
  rechazo: (c) => `Decidir sobre el rechazo de ${c}`,
  arbitraje: (c) => `Arbitrar el rechazo de ${c}`,
  por_corregir: (c) => `Registrar la corrección de ${c}`,
  por_decidir: (c) => `Decidir si ${c} requiere acción correctiva`,
  por_validar: (c, h) => (h.correccionRequerida === false ? `Validar el cierre sin acción de ${c}` : `Validar la corrección de ${c}`),
  por_formular: (c) => `Formular la causa raíz y el plan de ${c}`,
  en_revision: (c) => `Revisar el plan de ${c}`,
  en_aprobacion: (c) => `Aprobar el plan de ${c}`,
  en_ejecucion: (c) => `Ejecutar las actividades del plan de ${c}`,
  por_verificar: (c) => `Verificar la implementación de ${c}`,
  por_cerrar: (c) => `Cerrar ${c}`,
};

/**
 * Lo que le toca a quien tiene el turno, con el código («Aceptar o rechazar HZ-2026-004»), o nulo si el estado no tiene turno.
 * Sin líder, lo acepta el Admin SGC, que no rechaza (un rechazo solo existe con líder, `puedeRechazar`); un externo no se
 * rechaza, se responde (spec §7.4): «Aceptar». Una sola frase para el aviso del turno, la tarea y el aviso de vencido.
 */
export async function queLeToca(tx: Cliente, h: HallazgoBase): Promise<string | null> {
  const hayLideres = queLeTocaPideLideres(h) ? (await lideresDeProceso(h.procesoId, { sql: tx })).length > 0 : true;
  return queLeTocaCon(h, hayLideres);
}

/** Si `queLeToca` necesita saber si el proceso del hallazgo tiene líderes (solo en «Por aceptar» de un origen interno). */
export function queLeTocaPideLideres(h: Pick<HallazgoBase, "estado" | "origen">): boolean {
  return h.estado === "por_aceptar" && !esExterno(h.origen);
}

/** `queLeToca` con lo que sabe quien llama de los líderes del proceso: las tareas de una página entera lo leen de una vez. */
export function queLeTocaCon(h: HallazgoBase, hayLideres: boolean): string | null {
  const texto = LO_QUE_SIGUE[h.estado];
  if (!texto) return null;
  const sinRechazo = h.estado === "por_aceptar" && (esExterno(h.origen) || !hayLideres);
  return sinRechazo ? `Aceptar ${h.codigo}` : texto(h.codigo, h);
}

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
  const texto = await queLeToca(tx, h);
  if (!texto) return [];
  const destinos = (await quienTieneElTurno(tx, h)).filter((u) => u !== actorId);
  await avisarDeMejora(tx, { tipo: "mejora.turno", titulo: texto, hallazgoId: h.id }, destinos.map((usuarioId) => ({ usuarioId, cuerpo: titulo })));
  return destinos;
}

// ─────────────────────────────────────────────────────────────────────────────
// Los desenlaces (spec §11.5 y §14.2): el cierre, el arbitraje y el retiro
// ─────────────────────────────────────────────────────────────────────────────

/** Cómo terminó un hallazgo cerrado, en el título de su aviso («Se cerró HZ-…: …»). */
const COMO_SE_CERRO: Record<ResultadoCierre, string> = {
  eficaz: "el plan fue eficaz",
  con_correccion: "cerrado con corrección",
  sin_accion: "cerrado sin acción",
};

/**
 * El aviso de un desenlace del hallazgo: el título con el código y el cuerpo con el título del hallazgo, que todos sus
 * destinatarios ven completo (los líderes del proceso, quien lo registró y Gerencia, spec §11.5, sin excepción); nunca a quien
 * actuó. Quien reportó lo que dio origen al hallazgo o se le sumó recibe además el neutro de «Mis reportes»
 * (`avisarAQuienesReportaron`, que manda el motor); si también es destinatario por su rol, recibe los dos. Ningún texto escrito
 * por una persona (ni la nota del arbitraje).
 */
async function avisarDelDesenlace(
  tx: TransactionSql,
  h: Pick<HallazgoBase, "id">,
  aviso: { tipo: string; titulo: string },
  destinos: number[],
  actorId: number | null,
): Promise<void> {
  const fuera = new Set<number | null>([actorId]);
  const [{ titulo }] = await tx`SELECT titulo FROM mejora_hallazgos WHERE id = ${h.id}`;
  await avisarDeMejora(
    tx,
    { ...aviso, hallazgoId: h.id },
    [...new Set(destinos)].filter((u) => !fuera.has(u)).map((usuarioId) => ({ usuarioId, cuerpo: titulo as string })),
  );
}

/** Quien registró el hallazgo, si sigue activo. */
async function registradorActivo(tx: Cliente, h: Pick<HallazgoBase, "registradoPor">): Promise<number[]> {
  const [u] = await tx`SELECT id FROM usuarios WHERE id = ${h.registradoPor} AND activo`;
  return u ? [Number(u.id)] : [];
}

/**
 * Los avisos del cierre, con su desenlace en el título (`mejora.cerrado`): a los líderes activos del proceso, a quien lo registró
 * y a cada usuario activo de Gerencia; nunca a quien cierra. Lo llaman el cierre eficaz (al evaluar o al cerrar,
 * `verificacion.ts`) y la validación de la corrección o del cierre sin acción (`validarCorreccion`).
 */
export async function avisarDelCierre(tx: TransactionSql, h: HallazgoBase, resultado: ResultadoCierre, actorId: number): Promise<void> {
  const destinos = [
    ...(await lideresDeProceso(h.procesoId, { sql: tx })),
    ...(await registradorActivo(tx, h)),
    ...(await activosDeRol(tx, ["gerencia"])),
  ];
  await avisarDelDesenlace(tx, h, { tipo: "mejora.cerrado", titulo: `Se cerró ${h.codigo}: ${COMO_SE_CERRO[resultado]}` }, destinos, actorId);
}

/**
 * El resultado de un arbitraje (`mejora.arbitrado`, spec §8.3), sin quien arbitra. Si confirma el rechazo, a quien lo registró y a
 * los líderes del proceso. Si confirma el hallazgo, solo a quien lo registró: quienes reciben el turno del estado nuevo ya tienen
 * su aviso (`avisarDelTurno`) y no les llega otro por el mismo hecho. `despues` es el estado que dejó el arbitraje.
 */
export async function avisarDelArbitraje(
  tx: TransactionSql,
  h: HallazgoBase,
  confirma: "hallazgo" | "rechazo",
  despues: EstadoHallazgo,
  actorId: number,
): Promise<void> {
  const registro = await registradorActivo(tx, h);
  if (confirma === "rechazo") {
    const destinos = [...registro, ...(await lideresDeProceso(h.procesoId, { sql: tx }))];
    await avisarDelDesenlace(tx, h, { tipo: "mejora.arbitrado", titulo: `Se arbitró ${h.codigo}: se confirmó el rechazo` }, destinos, actorId);
    return;
  }
  const conTurno = await quienTieneElTurno(tx, { ...h, estado: despues });
  const destinos = registro.filter((u) => !conTurno.includes(u));
  await avisarDelDesenlace(tx, h, { tipo: "mejora.arbitrado", titulo: `Se arbitró ${h.codigo}: el hallazgo sigue` }, destinos, actorId);
}

/**
 * El retiro tras el rechazo (`mejora.retirado`, spec §8.3): a los líderes activos del proceso y, si lo retiró el Admin SGC en su
 * lugar, a quien lo registró (Fase 15B, anexo §11.3); nunca a quien lo retira.
 */
export async function avisarDelRetiro(tx: TransactionSql, h: HallazgoBase, actorId: number): Promise<void> {
  const destinos = [...(await lideresDeProceso(h.procesoId, { sql: tx })), ...(await registradorActivo(tx, h))];
  await avisarDelDesenlace(tx, h, { tipo: "mejora.retirado", titulo: `Se retiró ${h.codigo}` }, destinos, actorId);
}

/**
 * Cuando el Admin SGC sostiene el hallazgo en lugar de quien lo registró (Fase 15B, anexo §11.3), a quien lo registró
 * (`mejora.sostenido`), con el título del hallazgo y nunca la réplica. Si lo sostuvo quien lo registró, a nadie: es su acto.
 * Quienes arbitran reciben su turno (`avisarDelTurno`).
 */
export async function avisarDelSostenido(tx: TransactionSql, h: HallazgoBase, actorId: number): Promise<void> {
  if (h.registradoPor === actorId) return;
  const destinos = await registradorActivo(tx, h);
  await avisarDelDesenlace(tx, h, { tipo: "mejora.sostenido", titulo: `Se sostuvo ${h.codigo}: pasa a arbitraje` }, destinos, actorId);
}
