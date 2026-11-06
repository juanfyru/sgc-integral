/**
 * Avisos de vencimiento y escalamiento (spec 13A §14.3). Corre fuera de cualquier petición: cada
 * trámite va en su propia transacción corta y `SKIP LOCKED` salta al que está en una transición
 * o lo está revisando otra pasada. Lo vuelve a mirar la siguiente. Lo hace el sistema, no una
 * persona: no deja fila en `auditoria`; el rastro son los avisos y las marcas del trámite.
 */
import type { Row, TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { supervisoresDe } from "@/db/consultas/estructura";
import { aFilaTramite, adminsActivos, lideresDeProceso, rotuloDeTramite } from "@/db/consultas/tramites";
import { estadoPlazo } from "@/lib/tramites/plazos";
import { ETAPAS_ABIERTAS, ETIQUETA_ETAPA, textoResponsables } from "@/lib/tramites/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { enTransaccion, type FilaTramite, type TipoAviso } from "./flujo/contrato";

/** Quienes tienen el paso en curso. Un designado desactivado cuenta: por él llega el aviso a su jefe. */
export async function responsablesDe(tramite: FilaTramite, opciones?: { sql?: Cliente }): Promise<number[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const designado = (id: number | null) => (id === null ? [] : [id]);
  switch (tramite.etapa) {
    case "visto_bueno":
      return lideresDeProceso(tramite.procesoId, { sql });
    case "aceptacion":
    case "publicacion":
      return adminsActivos({ sql });
    case "elaboracion":
      return designado(tramite.elaboradorId);
    case "revision":
      return designado(tramite.revisorId);
    case "aprobacion":
      return designado(tramite.aprobadorId);
    default:
      return [];
  }
}

function queFalta(f: Row, ahora: Date, escalamientoDias: number, zona: string) {
  const vencido = f.vence_en !== null && f.vence_en < ahora;
  return {
    avisar: vencido && f.aviso_vencido_en === null,
    escalar: vencido && f.escalado_en === null && estadoPlazo(f.vence_en, ahora, zona).dias > escalamientoDias,
  };
}

type Destinatario = { usuarioId: number; cuerpo: string };

/** Una sola inserción: una por destinatario. Sin enlace, el aviso no abre el trámite. */
async function avisar(
  tx: TransactionSql,
  tramiteId: number,
  aviso: { tipo: TipoAviso; titulo: string; enlace: string | null },
  destinatarios: Destinatario[],
): Promise<void> {
  await tx`INSERT INTO notificaciones (usuario_id, tipo, titulo, cuerpo, enlace, entidad, entidad_id)
    SELECT u, ${aviso.tipo}, ${aviso.titulo}, c, ${aviso.enlace}, 'tramite', ${tramiteId}
    FROM unnest(
      ${tx.array(destinatarios.map((d) => d.usuarioId))}::int[],
      ${tx.array(destinatarios.map((d) => d.cuerpo))}::text[]
    ) AS a(u, c)`;
}

/** Cada jefe, sin repetir, con los subalternos suyos que tienen el paso. */
async function jefesDe(tx: TransactionSql, responsables: number[]): Promise<Map<number, string[]>> {
  const filas = await tx`SELECT id, nombre FROM usuarios WHERE id = ANY(${responsables}) ORDER BY nombre, id`;
  const jefes = new Map<number, string[]>();
  for (const { id, nombre } of filas) {
    for (const jefe of await supervisoresDe(Number(id), { sql: tx })) {
      jefes.set(jefe.id, [...(jefes.get(jefe.id) ?? []), nombre]);
    }
  }
  return jefes;
}

const NADA = { avisado: false, escalado: false };

async function revisarTramite(tx: TransactionSql, id: number, ahora: Date, escalamientoDias: number, zona: string) {
  const [f] = await tx`SELECT * FROM tramites WHERE id = ${id} AND etapa = ANY(${ETAPAS_ABIERTAS}) FOR UPDATE SKIP LOCKED`;
  if (!f) return NADA;
  const falta = queFalta(f, ahora, escalamientoDias, zona);
  if (!falta.avisar && !falta.escalar) return NADA;

  const tramite = aFilaTramite(f);
  const responsables = await responsablesDe(tramite, { sql: tx });
  const paso = ETIQUETA_ETAPA[tramite.etapa].toLowerCase();
  const hecho = { ...NADA };

  // Sin destinatario no hubo aviso: la marca queda vacía y el paso se revisa otra vez cuando lo haya.
  if (falta.avisar && responsables.length > 0) {
    const { texto } = await rotuloDeTramite(tx, tramite);
    await avisar(
      tx,
      id,
      { tipo: "tramite.vencido", titulo: `Solicitud ${tramite.numero}: venció el plazo de ${paso}`, enlace: `/tramites/${id}` },
      responsables.map((usuarioId) => ({ usuarioId, cuerpo: texto })),
    );
    await tx`UPDATE tramites SET aviso_vencido_en = ${ahora} WHERE id = ${id}`;
    hecho.avisado = true;
  }

  const jefes = falta.escalar ? await jefesDe(tx, responsables) : new Map<number, string[]>();
  if (jefes.size > 0) {
    const { dias } = estadoPlazo(tramite.venceEn, ahora, zona);
    const hace = `Venció hace ${dias} ${dias === 1 ? "día" : "días"}.`;
    // Ni título ni código ni enlace: el jefe no gana acceso al trámite (spec 13A §14.3).
    await avisar(
      tx,
      id,
      { tipo: "tramite.escalado", titulo: `Solicitud ${tramite.numero}: el paso de ${paso} sigue vencido`, enlace: null },
      [...jefes].map(([usuarioId, subalternos]) => ({ usuarioId, cuerpo: `A cargo de ${textoResponsables(subalternos)}. ${hace}` })),
    );
    await tx`UPDATE tramites SET escalado_en = ${ahora} WHERE id = ${id}`;
    hecho.escalado = true;
  }
  return hecho;
}

export async function revisarVencimientos(opciones?: { sql?: Cliente; ahora?: Date }): Promise<{ avisados: number; escalados: number }> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const zona = zonaHoraria();
  const { escalamientoDias } = await obtenerConfigDocumental({ sql });
  const vencidos = await sql`SELECT id, vence_en, aviso_vencido_en, escalado_en FROM tramites
    WHERE etapa = ANY(${ETAPAS_ABIERTAS}) AND vence_en < ${ahora} AND (aviso_vencido_en IS NULL OR escalado_en IS NULL)
    ORDER BY id`;

  const resultado = { avisados: 0, escalados: 0 };
  for (const fila of vencidos) {
    const { avisar: conAviso, escalar } = queFalta(fila, ahora, escalamientoDias, zona);
    if (!conAviso && !escalar) continue;
    try {
      const { avisado, escalado } = await enTransaccion(sql, (tx) => revisarTramite(tx, Number(fila.id), ahora, escalamientoDias, zona));
      if (avisado) resultado.avisados += 1;
      if (escalado) resultado.escalados += 1;
    } catch (err) {
      console.error(`No se pudo revisar el vencimiento del trámite ${fila.id}:`, err);
    }
  }
  return resultado;
}
