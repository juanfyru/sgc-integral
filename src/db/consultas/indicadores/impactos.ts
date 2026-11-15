/**
 * Los impactos por cambio de norma sobre los indicadores (anexo 14B, §9): cuando una norma pasa a modificada, derogada o
 * retirada, en la transacción del cambio (`cambiarEstadoEn`) nace una revisión por cada indicador activo cuya ficha
 * vigente la cita, con el plazo de los impactos de la 13C y un aviso a los Administradores del SGC activos, salvo a quien
 * hizo el cambio. No bloquea el indicador. Se resuelve en la página del indicador con «No afecta» y una nota, con la primera
 * versión de la ficha enviada (o publicada, si es un cambio menor) después de nacer la revisión, cuando queda aprobada
 * (`resolverImpactosPorVersion`, desde `alPublicarVersion`), o con el retiro del indicador (`resolverImpactosPorRetiro`,
 * desde `retirar`). Es tarea de quien administra indicadores, vence, avisa y escala como los de la 13C, en su propia pasada
 * (`impactosDeIndicadoresVencidos`); ningún aviso nombra el indicador, que puede ser restringido.
 *
 * Es un módulo liviano a propósito: lo importan `normograma/normas.ts`, `publicacion.ts`, `operacion.ts`, `tareas.ts` y
 * `vencimientos.ts`, así que no importa `lectura.ts`, `aprobacion.ts` ni `fichas.ts` (cerraría un ciclo de importaciones).
 *
 * Crear las revisiones no toma candados explícitos sobre `indicadores`: la llave foránea toma `FOR KEY SHARE`, que puede
 * cruzarse con quien guarda una ficha que cita la norma (el indicador `FOR UPDATE` y después la norma `FOR KEY SHARE`,
 * mientras el cambio de estado tiene la norma `FOR UPDATE`). Ese `40P01` lo vuelven legible las acciones
 * (`legibleSiInterbloqueo`), sin reintentar.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { avisarA, jefesDe } from "@/db/consultas/avisos-vencimiento";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { nombreSql } from "@/db/consultas/normograma/busqueda";
import { adminsActivos } from "@/db/consultas/tramites";
import { filtroIndicadores, puedeVerIndicador, type SujetoVisibilidad } from "@/lib/alcance";
import { rutaDeIndicador } from "@/lib/indicadores/rutas";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { ETIQUETA_ESTADO_NORMA, type EstadoNorma } from "@/lib/normograma/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";
import { cuenta } from "@/lib/plural";
import type { Tarea } from "@/lib/tareas";
import { estadoPlazo, fechaLimite } from "@/lib/tramites/plazos";
import { textoResponsables } from "@/lib/tramites/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { diaYMes } from "./pasada";

type Opciones = { sql?: Cliente; ahora?: Date };

export const IMPACTO_NO_EXISTE = "El impacto no existe";
export const IMPACTO_RESUELTO = "Ese impacto ya está resuelto";

/** La lista de «Indicadores» filtrada por las revisiones pendientes: el enlace de los avisos y de la tarea agrupada. */
export const ENLACE_DE_IMPACTOS = "/indicadores?impacto=1";

const estadoEnTexto = (estado: EstadoNorma) => ETIQUETA_ESTADO_NORMA[estado].toLowerCase();

// ─────────────────────────────────────────────────────────────────────────────
// El interbloqueo entre la norma y la ficha
// ─────────────────────────────────────────────────────────────────────────────

export const INTERBLOQUEO_NORMA_O_FICHA = "Otra persona estaba cambiando esa norma o esa ficha al mismo tiempo: inténtelo de nuevo";

/**
 * El `40P01` de PostgreSQL (quien cambia el estado de la norma y quien guarda, envía o aprueba una ficha que la cita, a la
 * vez) como un error de negocio legible; cualquier otro error, tal cual. Lo usan las acciones, que no reintentan.
 */
export function legibleSiInterbloqueo(err: unknown): unknown {
  return (err as { code?: string } | null)?.code === "40P01" ? new ErrorIndicador(INTERBLOQUEO_NORMA_O_FICHA) : err;
}

// ─────────────────────────────────────────────────────────────────────────────
// Nacen con el cambio de la norma
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Las revisiones de un cambio (`cambioId`, ya insertado en `norma_cambios`), dentro de su transacción: una `pendiente` por
 * cada indicador `activo` cuya versión aprobada de mayor número cita la norma, con `vence_en` como los de la 13C, y el aviso
 * `indicadores.impacto` a los Administradores del SGC activos, salvo a `usuarioId`. Sin candados explícitos sobre
 * `indicadores`. Devuelve cuántas nacieron.
 */
export async function crearImpactosDeIndicadores(
  tx: TransactionSql,
  d: { cambioId: number; normaId: number; usuarioId: number; ahora: Date; plazoDias: number },
): Promise<number> {
  const vence = fechaLimite(d.ahora, d.plazoDias, zonaHoraria());
  const nacidas = await tx`INSERT INTO impactos_indicadores (norma_cambio_id, norma_id, indicador_id, vence_en, creado_en)
    SELECT ${d.cambioId}, ${d.normaId}, i.id, ${vence}, ${d.ahora}
    FROM indicadores i
    JOIN LATERAL (
      SELECT v.id FROM indicador_versiones v WHERE v.indicador_id = i.id AND v.estado = 'aprobada' ORDER BY v.numero DESC LIMIT 1
    ) va ON true
    WHERE i.estado = 'activo'
      AND EXISTS (SELECT 1 FROM indicador_normas vn WHERE vn.version_id = va.id AND vn.norma_id = ${d.normaId})
    ORDER BY i.id
    RETURNING id`;
  if (nacidas.length === 0) return 0;

  const [c] = await tx`SELECT ${nombreSql(tx)} AS norma, c.estado_nuevo
    FROM norma_cambios c JOIN normas n ON n.id = c.norma_id JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
    WHERE c.id = ${d.cambioId}`;
  const destinatarios = (await adminsActivos({ sql: tx })).filter((u) => u !== d.usuarioId);
  if (destinatarios.length > 0) {
    const n = nacidas.length;
    await avisarA(
      tx,
      {
        tipo: "indicadores.impacto",
        titulo: `${cuenta(n, "indicador cita", "indicadores citan")} ${c.norma as string}, que pasó a ${estadoEnTexto(c.estado_nuevo as EstadoNorma)}: revise ${n === 1 ? "su ficha" : "cada ficha"}`,
        enlace: ENLACE_DE_IMPACTOS,
        entidad: "norma",
        entidadId: d.normaId,
      },
      destinatarios.map((usuarioId) => ({
        usuarioId,
        cuerpo: "Cada revisión se resuelve en la página del indicador: no afecta, una versión nueva de la ficha o el retiro.",
      })),
    );
  }
  return nacidas.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lo que muestra la página del indicador y la de impactos de la 13C
// ─────────────────────────────────────────────────────────────────────────────

/** `fecha`, la del cambio de la norma (`AAAA-MM-DD`); `vencido`, si ya pasó el día de `venceEn`. */
export type ImpactoDeIndicador = { id: number; norma: string; estadoNuevo: string; fecha: string; venceEn: Date; vencido: boolean };

/** Las revisiones pendientes del indicador, de la más antigua a la más reciente; vacío a quien no ve el indicador. */
export async function impactosPendientesDe(sesion: SujetoVisibilidad, indicadorId: number, opciones?: Opciones): Promise<ImpactoDeIndicador[]> {
  const sql = opciones?.sql ?? obtenerSql();
  if (!(await puedeVerIndicador(indicadorId, sesion, { sql }))) return [];
  const ahora = opciones?.ahora ?? new Date();
  const zona = zonaHoraria();
  const filas = await sql`SELECT ii.id, ii.vence_en, c.estado_nuevo, c.fecha::text AS fecha, ${nombreSql(sql)} AS norma
    FROM impactos_indicadores ii
    JOIN norma_cambios c ON c.id = ii.norma_cambio_id
    JOIN normas n ON n.id = ii.norma_id
    JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
    WHERE ii.indicador_id = ${indicadorId} AND ii.estado = 'pendiente'
    ORDER BY ii.creado_en, ii.id`;
  return filas.map((f) => {
    const venceEn = new Date(f.vence_en as string);
    return {
      id: Number(f.id),
      norma: f.norma as string,
      estadoNuevo: f.estado_nuevo as string,
      fecha: f.fecha as string,
      venceEn,
      vencido: estadoPlazo(venceEn, ahora, zona).estado === "vencido",
    };
  });
}

/** Una revisión de un indicador en la sección «Indicadores» de la página de impactos de la 13C. */
export type IndicadorDelCambio = {
  codigo: string;
  nombre: string;
  estado: "pendiente" | "resuelto";
  resolucion: string | null;
};

/**
 * Las revisiones que un cambio abrió en los indicadores de un proceso, por código, para la sección «Indicadores» de la
 * página de impactos de la 13C (en lectura). Solo los que la persona ve (`filtroIndicadores`): un restringido no sale para
 * quien no lo ve. El nombre es el de la ficha vigente.
 */
export async function indicadoresDelCambio(sesion: SujetoVisibilidad, cambioId: number, procesoId: number, opciones?: { sql?: Cliente }): Promise<IndicadorDelCambio[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT i.codigo, coalesce(va.nombre, i.codigo) AS nombre, ii.estado, ii.resolucion
    FROM impactos_indicadores ii
    JOIN indicadores i ON i.id = ii.indicador_id
    LEFT JOIN LATERAL (
      SELECT v.nombre FROM indicador_versiones v WHERE v.indicador_id = i.id AND v.estado = 'aprobada' ORDER BY v.numero DESC LIMIT 1
    ) va ON true
    WHERE ii.norma_cambio_id = ${cambioId} AND i.proceso_id = ${procesoId} AND ${filtroIndicadores(sql, sesion)}
    ORDER BY i.codigo, ii.id`;
  return filas.map((f) => ({
    codigo: f.codigo as string,
    nombre: f.nombre as string,
    estado: f.estado as IndicadorDelCambio["estado"],
    resolucion: (f.resolucion as string | null) ?? null,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Las tres salidas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * «No afecta» (anexo 14B, §9), con una nota de 5 a 500 caracteres, solo para quien administra indicadores. Como las
 * constancias (`constanciaBloqueada`): el indicador `FOR SHARE` y después la revisión `FOR UPDATE`; si no existe o la persona
 * no ve su indicador, «no existe» (para ella no existe); después, el permiso; y debe seguir `pendiente`. Queda resuelta a
 * nombre de quien la registra, con su entrada de bitácora.
 */
export async function resolverImpactoNoAfecta(sesion: SesionFlujo, d: { impactoId: number; nota: string }, opciones?: Opciones): Promise<void> {
  const nota = typeof d.nota === "string" ? d.nota.trim() : "";
  if (nota.length < 5) throw new ErrorIndicador("La nota debe tener al menos 5 caracteres");
  if (nota.length > 500) throw new ErrorIndicador("La nota no puede pasar de 500 caracteres");
  const ahora = opciones?.ahora ?? new Date();
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const [ind] = await tx`SELECT id FROM indicadores
      WHERE id = (SELECT indicador_id FROM impactos_indicadores WHERE id = ${d.impactoId}) FOR SHARE`;
    const [i] = await tx`SELECT ii.id, ii.indicador_id, ii.norma_cambio_id, ii.estado, ind.codigo, ${nombreSql(tx)} AS norma
      FROM impactos_indicadores ii
      JOIN indicadores ind ON ind.id = ii.indicador_id
      JOIN normas n ON n.id = ii.norma_id
      JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
      WHERE ii.id = ${d.impactoId}
      FOR UPDATE OF ii`;
    if (!ind || !i || !(await puedeVerIndicador(Number(ind.id), sesion, { sql: tx }))) throw new ErrorIndicador(IMPACTO_NO_EXISTE);
    if (!puede(sesion, "indicadores.administrar")) throw new ErrorPermiso();
    if (i.estado !== "pendiente") throw new ErrorIndicador(IMPACTO_RESUELTO);
    await tx`UPDATE impactos_indicadores SET estado = 'resuelto', resolucion = 'no_afecta', nota = ${nota},
        resuelto_por = ${sesion.usuarioId}, resuelto_en = ${ahora}
      WHERE id = ${i.id}`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "impacto_indicador_resuelto",
      entidad: "indicador",
      entidadId: Number(i.indicador_id),
      detalle: {
        impactoId: Number(i.id),
        cambioId: Number(i.norma_cambio_id),
        codigo: i.codigo as string,
        norma: i.norma as string,
        resolucion: "no_afecta",
        nota,
      },
    });
  });
}

/**
 * La versión que queda aprobada (`alPublicarVersion`) resuelve con `nueva_version` las revisiones pendientes del indicador
 * que nacieron antes de que se enviara (o, en un cambio menor, se publicara: `elaboradaEn`); una que ya estaba por aprobar
 * cuando cambió la norma no las resuelve. Figura como quien resolvió quien la elaboró (`actorId` si no se sabe). Quien llama
 * tiene el indicador `FOR UPDATE`. Devuelve cuántas resolvió; su bitácora es la de quien llama.
 */
export async function resolverImpactosPorVersion(
  tx: TransactionSql,
  d: { indicadorId: number; versionId: number; elaboradaPor: number | null; elaboradaEn: Date | null; actorId: number; ahora: Date },
): Promise<number> {
  if (d.elaboradaEn === null) return 0;
  const resueltas = await tx`UPDATE impactos_indicadores SET estado = 'resuelto', resolucion = 'nueva_version', version_id = ${d.versionId},
      resuelto_por = ${d.elaboradaPor ?? d.actorId}, resuelto_en = ${d.ahora}
    WHERE indicador_id = ${d.indicadorId} AND estado = 'pendiente' AND creado_en < ${d.elaboradaEn}
    RETURNING id`;
  return resueltas.length;
}

/** El retiro del indicador (`retirar`) resuelve todas sus revisiones pendientes. Quien llama tiene el indicador `FOR UPDATE`. */
export async function resolverImpactosPorRetiro(tx: TransactionSql, d: { indicadorId: number; usuarioId: number; ahora: Date }): Promise<number> {
  const resueltas = await tx`UPDATE impactos_indicadores SET estado = 'resuelto', resolucion = 'retiro', resuelto_por = ${d.usuarioId},
      resuelto_en = ${d.ahora}
    WHERE indicador_id = ${d.indicadorId} AND estado = 'pendiente'
    RETURNING id`;
  return resueltas.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// La tarea y la pasada de las vencidas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * «Revisar SGC-ID-001 por el cambio de Resolución 3100 de 2019»: una tarea por revisión pendiente de un indicador activo, de
 * quien administra indicadores (para los demás no se consulta nada), con la fecha límite de la revisión y el enlace a la
 * ficha del indicador.
 */
export async function tareasDeImpactosDeIndicadores(sql: Cliente, sesion: SesionFlujo): Promise<Tarea[]> {
  if (!puede(sesion, "indicadores.administrar")) return [];
  const filas = await sql`SELECT ii.id, ii.vence_en, i.codigo, va.nombre, ${nombreSql(sql)} AS norma
    FROM impactos_indicadores ii JOIN indicadores i ON i.id = ii.indicador_id
    JOIN normas n ON n.id = ii.norma_id
    JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
    LEFT JOIN LATERAL (
      SELECT v.nombre FROM indicador_versiones v WHERE v.indicador_id = i.id AND v.estado = 'aprobada' ORDER BY v.numero DESC LIMIT 1
    ) va ON true
    WHERE ii.estado = 'pendiente' AND i.estado = 'activo' AND ${filtroIndicadores(sql, sesion)}
    ORDER BY ii.vence_en, ii.id`;
  return filas.map((f) => ({
    id: `impacto-indicador:${Number(f.id)}`,
    modulo: "indicadores" as const,
    titulo: `Revisar ${f.codigo as string} por el cambio de ${f.norma as string}`,
    detalle: (f.nombre as string | null) ?? null,
    vence: new Date(f.vence_en as string),
    enlace: `${rutaDeIndicador(f.codigo as string)}?vista=ficha`,
  }));
}

type ContextoVencidos = { sql: Cliente; ahora: Date; escalamientoDias: number };
type Resultado = { avisados: number; escalados: number };
const NADA: Resultado = { avisados: 0, escalados: 0 };

type Grupo = { cambioId: number; normaId: number; ids: number[] };

/**
 * Un cambio de norma: sus revisiones vencidas, con la mecánica de `revisarGrupo` de la 13C (`normograma/vencidos.ts`). Las
 * marcas y el estado se releen con las filas bloqueadas: lo que otra pasada ya avisó, o lo que se resolvió entre la lista y
 * el candado, no se avisa.
 */
async function revisarGrupo(tx: TransactionSql, g: Grupo, c: ContextoVencidos): Promise<Resultado> {
  const zona = zonaHoraria();
  const filas = await tx`SELECT ii.id, ii.vence_en, ii.aviso_vencido_en, ii.escalado_en
    FROM impactos_indicadores ii JOIN indicadores i ON i.id = ii.indicador_id
    WHERE ii.id = ANY(${g.ids}) AND ii.estado = 'pendiente' AND i.estado = 'activo'
    ORDER BY ii.id FOR UPDATE OF ii SKIP LOCKED`;
  const vencidoHace = (f: (typeof filas)[number]) => {
    const plazo = estadoPlazo(new Date(f.vence_en as string), c.ahora, zona);
    return plazo.estado === "vencido" ? plazo.dias : null;
  };
  const vencidos = filas.filter((f) => vencidoHace(f) !== null);
  const aAvisar = vencidos.filter((f) => f.aviso_vencido_en === null);
  const aEscalar = vencidos.filter((f) => f.escalado_en === null && vencidoHace(f)! > c.escalamientoDias);
  if (aAvisar.length === 0 && aEscalar.length === 0) return NADA;

  const [d] = await tx`SELECT ${nombreSql(tx)} AS norma FROM normas n JOIN tipos_norma tn ON tn.id = n.tipo_norma_id WHERE n.id = ${g.normaId}`;
  const norma = d.norma as string;
  // La tarea es de quienes administran indicadores: por ellos llega el escalamiento a su jefe.
  const admins = await adminsActivos({ sql: tx });
  const hecho = { ...NADA };

  // Sin destinatario no hubo aviso: la marca queda vacía y la revisión se mira otra vez cuando lo haya.
  if (aAvisar.length > 0 && admins.length > 0) {
    const primera = new Date(Math.min(...aAvisar.map((f) => new Date(f.vence_en as string).getTime())));
    await avisarA(
      tx,
      {
        tipo: "indicadores.impacto_vencido",
        titulo: `Venció la revisión de ${cuenta(aAvisar.length, "indicador", "indicadores")} por el cambio de ${norma}`,
        enlace: ENLACE_DE_IMPACTOS,
        entidad: "norma",
        entidadId: g.normaId,
      },
      admins.map((usuarioId) => ({ usuarioId, cuerpo: `El plazo venció el ${diaYMes(primera, zona)}.` })),
    );
    await tx`UPDATE impactos_indicadores SET aviso_vencido_en = ${c.ahora} WHERE id = ANY(${aAvisar.map((f) => Number(f.id))})`;
    hecho.avisados = aAvisar.length;
  }

  // Sin jefe no se escala y la revisión queda para cuando lo haya. Sin código, nombre ni enlace del indicador.
  const jefes = aEscalar.length > 0 ? await jefesDe(tx, admins) : new Map<number, string[]>();
  if (jefes.size > 0) {
    await avisarA(
      tx,
      { tipo: "indicadores.impacto_escalado", titulo: "Revisiones de indicadores por cambio de norma vencidas", enlace: null, entidad: "norma", entidadId: g.normaId },
      [...jefes].map(([usuarioId, subalternos]) => ({
        usuarioId,
        cuerpo: `A cargo de ${textoResponsables(subalternos)}. ${cuenta(aEscalar.length, "revisión de indicador", "revisiones de indicadores")} por el cambio de ${norma} sin resolver hace más de ${cuenta(c.escalamientoDias, "día", "días")}.`,
      })),
    );
    await tx`UPDATE impactos_indicadores SET escalado_en = ${c.ahora} WHERE id = ANY(${aEscalar.map((f) => Number(f.id))})`;
    hecho.escalados = aEscalar.length;
  }
  return hecho;
}

/**
 * La pasada de las revisiones vencidas (anexo 14B, §9), para `revisarVencimientosDeIndicadores`: por cambio de norma, un
 * aviso `indicadores.impacto_vencido` a los Administradores del SGC activos y, pasados los `escalamientoDias`, uno
 * `indicadores.impacto_escalado` a sus jefes; cada cambio en su transacción corta con `SKIP LOCKED`, sin `auditoria`. Solo
 * las de indicadores activos. `avisados` y `escalados` cuentan revisiones.
 */
export async function impactosDeIndicadoresVencidos(c: ContextoVencidos): Promise<Resultado> {
  const candidatos = await c.sql`SELECT ii.id, ii.norma_cambio_id, ii.norma_id
    FROM impactos_indicadores ii JOIN indicadores i ON i.id = ii.indicador_id
    WHERE ii.estado = 'pendiente' AND i.estado = 'activo' AND ii.vence_en < ${c.ahora}
      AND (ii.aviso_vencido_en IS NULL OR ii.escalado_en IS NULL)
    ORDER BY ii.norma_cambio_id, ii.id`;
  const grupos = new Map<number, Grupo>();
  for (const f of candidatos) {
    const cambioId = Number(f.norma_cambio_id);
    const g = grupos.get(cambioId) ?? { cambioId, normaId: Number(f.norma_id), ids: [] };
    g.ids.push(Number(f.id));
    grupos.set(cambioId, g);
  }
  const total = { ...NADA };
  for (const g of grupos.values()) {
    try {
      const h = await enTransaccion(c.sql, (tx) => revisarGrupo(tx, g, c));
      total.avisados += h.avisados;
      total.escalados += h.escalados;
    } catch (err) {
      console.error(`No se pudieron revisar las revisiones vencidas de indicadores del cambio de norma ${g.cambioId}:`, err);
    }
  }
  return total;
}
