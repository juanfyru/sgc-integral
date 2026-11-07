/**
 * Avisos de vencimiento y escalamiento de la distribución (spec 13B): copias sin recibir o sin recoger,
 * lecturas pendientes, socializaciones y hallazgos. Misma mecánica que los trámites (13A): cada fila (o cada
 * versión, en los acuses) va en su transacción corta con `FOR UPDATE SKIP LOCKED`, y el sistema no deja fila en
 * `auditoria`; el rastro son los avisos y las marcas `aviso_vencido_en` / `escalado_en`.
 * El aviso al jefe nunca lleva título del documento, código ni enlace.
 */
import type { Row, TransactionSql } from "postgres";
import type { Cliente } from "@/db/cliente";
import type { ConfigDocumental } from "@/db/consultas/config-documental";
import { enTransaccion } from "@/db/consultas/flujo/contrato";
import { adminsActivos, lideresDeProceso, propietarioDeDocumento } from "@/db/consultas/tramites";
import { avisarA, jefesDe } from "@/db/consultas/avisos-vencimiento";
import { numeroDeCopia } from "@/lib/distribucion/copias";
import { estadoPlazo } from "@/lib/tramites/plazos";
import { textoResponsables } from "@/lib/tramites/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";

type Contexto = { sql: Cliente; ahora: Date; escalamientoDias: number; zona: string };
type Resultado = { avisados: number; escalados: number };
/** Cuántos avisos y escalamientos hizo una fila (los acuses de una versión pueden ser varios). */
type Hecho = { avisados: number; escalados: number };
type Falta = { avisar: boolean; escalar: boolean; dias: number };

const NADA: Hecho = { avisados: 0, escalados: 0 };
const dias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;
/** «A, B y C»: el jefe necesita ver a todos quienes le deben una lectura, no un «y 2 más». */
const listaDeNombres = (n: string[]) => (n.length < 2 ? n.join("") : `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}`);
const recortar = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

/** Corre `fn` por cada id, cada uno en su transacción; un fallo se registra y no frena a los demás. */
async function porFila(
  c: Contexto,
  ids: number[],
  rotulo: string,
  fn: (tx: TransactionSql, id: number) => Promise<Hecho>,
): Promise<Resultado> {
  const r = { avisados: 0, escalados: 0 };
  for (const id of ids) {
    try {
      const h = await enTransaccion(c.sql, (tx) => fn(tx, id));
      r.avisados += h.avisados;
      r.escalados += h.escalados;
    } catch (err) {
      console.error(`No se pudo revisar el vencimiento de ${rotulo} ${id}:`, err);
    }
  }
  return r;
}

/** Qué falta de aviso y de escalamiento en una fila vencida. */
function queFalta(c: Contexto, f: Row): Falta {
  const d = estadoPlazo(f.vence_en as Date, c.ahora, c.zona).dias;
  return {
    dias: d,
    avisar: f.aviso_vencido_en === null,
    escalar: f.escalado_en === null && d > c.escalamientoDias,
  };
}

/** Aviso a los destinatarios y, si toca, uno por jefe de los responsables. */
async function avisarYEscalar(
  tx: TransactionSql,
  f: Falta,
  d: {
    destinatarios: number[];
    responsables: number[];
    vencido: { titulo: string; cuerpo: string; enlace: string };
    escalado: string;
    entidad: string;
    entidadId: number;
  },
): Promise<Hecho> {
  const hecho = { ...NADA };
  // Sin destinatario no hubo aviso: la marca queda vacía y la fila se revisa otra vez cuando lo haya.
  if (f.avisar && d.destinatarios.length > 0) {
    await avisarA(
      tx,
      { tipo: "distribucion.vencido", titulo: d.vencido.titulo, enlace: d.vencido.enlace, entidad: d.entidad, entidadId: d.entidadId },
      d.destinatarios.map((usuarioId) => ({ usuarioId, cuerpo: d.vencido.cuerpo })),
    );
    hecho.avisados += 1;
  }
  const jefes = f.escalar ? await jefesDe(tx, d.responsables) : new Map<number, string[]>();
  if (jefes.size > 0) {
    await avisarA(
      tx,
      { tipo: "distribucion.escalado", titulo: d.escalado, enlace: null, entidad: d.entidad, entidadId: d.entidadId },
      [...jefes].map(([usuarioId, subalternos]) => ({
        usuarioId,
        cuerpo: `A cargo de ${textoResponsables(subalternos)}. Venció hace ${dias(f.dias)}.`,
      })),
    );
    hecho.escalados += 1;
  }
  return hecho;
}

async function marcar(
  tx: TransactionSql,
  tabla: "copias_controladas" | "socializaciones_requeridas" | "hallazgos",
  id: number,
  ahora: Date,
  h: Hecho,
): Promise<void> {
  if (h.avisados > 0) await tx`UPDATE ${tx(tabla)} SET aviso_vencido_en = ${ahora} WHERE id = ${id}`;
  if (h.escalados > 0) await tx`UPDATE ${tx(tabla)} SET escalado_en = ${ahora} WHERE id = ${id}`;
}

async function copiasVencidas(c: Contexto, estado: "emitida" | "por_recoger"): Promise<Resultado> {
  const candidatas = await c.sql`SELECT id FROM copias_controladas
    WHERE estado = ${estado} AND vence_en < ${c.ahora} AND (aviso_vencido_en IS NULL OR escalado_en IS NULL) ORDER BY id`;
  return porFila(c, candidatas.map((f) => Number(f.id)), "la copia", async (tx, id) => {
    const [f] = await tx`
      SELECT cc.numero, cc.emitida_por, cc.vence_en, cc.aviso_vencido_en, cc.escalado_en,
             pu.responsable_id, pu.nombre AS punto, d.codigo, v.numero AS version, d.titulo
      FROM copias_controladas cc
      JOIN puntos_uso pu ON pu.id = cc.punto_uso_id
      JOIN documento_versiones v ON v.id = cc.version_id
      JOIN documentos d ON d.id = v.documento_id
      WHERE cc.id = ${id} AND cc.estado = ${estado} AND cc.vence_en < ${c.ahora}
      FOR UPDATE OF cc SKIP LOCKED`;
    if (!f) return NADA;
    const falta = queFalta(c, f);
    if (!falta.avisar && !falta.escalar) return NADA;
    const responsable = Number(f.responsable_id);
    const destinatarios = [...new Set(estado === "emitida" ? [responsable, Number(f.emitida_por)] : [responsable])];
    const hecho = await avisarYEscalar(tx, falta, {
      destinatarios,
      responsables: [responsable],
      vencido: {
        titulo: `La copia N.º ${numeroDeCopia(Number(f.numero))} de ${f.codigo} v${f.version} en ${f.punto} sigue sin ${estado === "emitida" ? "recibido" : "recogerse"}`,
        cuerpo: f.titulo as string,
        enlace: `/distribucion/copias/${id}`,
      },
      escalado: estado === "emitida" ? "Una copia controlada sigue sin recibido" : "Una copia controlada sigue sin recogerse",
      entidad: "copia",
      entidadId: id,
    });
    await marcar(tx, "copias_controladas", id, c.ahora, hecho);
    return hecho;
  });
}

async function acusesVencidos(c: Contexto): Promise<Resultado> {
  const versiones = await c.sql`SELECT DISTINCT version_id FROM acuses
    WHERE estado = 'pendiente' AND vence_en < ${c.ahora} AND (aviso_vencido_en IS NULL OR escalado_en IS NULL)
    ORDER BY version_id`;
  return porFila(c, versiones.map((f) => Number(f.version_id)), "la lectura de la versión", async (tx, versionId) => {
    const filas = await tx`
      SELECT a.id, a.usuario_id, a.vence_en, a.aviso_vencido_en, a.escalado_en
      FROM acuses a
      WHERE a.version_id = ${versionId} AND a.estado = 'pendiente' AND a.vence_en < ${c.ahora}
        AND (a.aviso_vencido_en IS NULL OR a.escalado_en IS NULL)
      ORDER BY a.id
      FOR UPDATE OF a SKIP LOCKED`;
    if (filas.length === 0) return NADA;
    const [doc] = await tx`SELECT d.codigo, v.numero FROM documento_versiones v JOIN documentos d ON d.id = v.documento_id WHERE v.id = ${versionId}`;
    const rotulo = `${doc.codigo} v${doc.numero}`;
    const hecho = { ...NADA };
    const aEscalar: { id: number; usuarioId: number }[] = [];
    for (const f of filas) {
      const falta = queFalta(c, f);
      const usuarioId = Number(f.usuario_id);
      if (falta.avisar) {
        await avisarA(
          tx,
          {
            tipo: "distribucion.vencido",
            titulo: `${rotulo}: su lectura venció hace ${dias(falta.dias)}`,
            enlace: `/acuses/${f.id}`,
            entidad: "acuse",
            entidadId: Number(f.id),
          },
          [{ usuarioId, cuerpo: "Confirme la lectura del documento." }],
        );
        await tx`UPDATE acuses SET aviso_vencido_en = ${c.ahora} WHERE id = ${f.id}`;
        hecho.avisados += 1;
      }
      // Sin jefe no se escala y la lectura queda para cuando lo tenga.
      if (falta.escalar && (await jefesDe(tx, [usuarioId])).size > 0) aEscalar.push({ id: Number(f.id), usuarioId });
    }
    if (aEscalar.length > 0) {
      const jefes = await jefesDe(tx, aEscalar.map((a) => a.usuarioId));
      await avisarA(
        tx,
        { tipo: "distribucion.escalado", titulo: "Lecturas de documentos vencidas en su equipo", enlace: null, entidad: "version", entidadId: versionId },
        [...jefes].map(([usuarioId, nombres]) => ({
          usuarioId,
          cuerpo: `${nombres.length} ${nombres.length === 1 ? "lectura vencida" : "lecturas vencidas"} de ${listaDeNombres(nombres)}`,
        })),
      );
      await tx`UPDATE acuses SET escalado_en = ${c.ahora} WHERE id = ANY(${aEscalar.map((a) => a.id)})`;
      hecho.escalados += aEscalar.length;
    }
    return hecho;
  });
}

async function socializacionesVencidas(c: Contexto): Promise<Resultado> {
  const candidatas = await c.sql`SELECT id FROM socializaciones_requeridas
    WHERE cumplida_en IS NULL AND superada_en IS NULL AND vence_en < ${c.ahora} AND (aviso_vencido_en IS NULL OR escalado_en IS NULL)
    ORDER BY id`;
  return porFila(c, candidatas.map((f) => Number(f.id)), "la socialización", async (tx, id) => {
    const [f] = await tx`
      SELECT r.version_id, r.vence_en, r.aviso_vencido_en, r.escalado_en, d.id AS documento_id, d.codigo, v.numero AS version, d.titulo
      FROM socializaciones_requeridas r
      JOIN documento_versiones v ON v.id = r.version_id
      JOIN documentos d ON d.id = v.documento_id
      WHERE r.id = ${id} AND r.cumplida_en IS NULL AND r.superada_en IS NULL AND r.vence_en < ${c.ahora}
      FOR UPDATE OF r SKIP LOCKED`;
    if (!f) return NADA;
    const falta = queFalta(c, f);
    if (!falta.avisar && !falta.escalar) return NADA;
    const propietario = await propietarioDeDocumento(Number(f.documento_id), { sql: tx });
    const lideres = propietario ? await lideresDeProceso(propietario.procesoId, { sql: tx }) : [];
    const responsables = lideres.length > 0 ? lideres : await adminsActivos({ sql: tx });
    const hecho = await avisarYEscalar(tx, falta, {
      destinatarios: responsables,
      responsables,
      vencido: {
        titulo: `Socialización de ${f.codigo} v${f.version}: venció el plazo para registrarla`,
        cuerpo: f.titulo as string,
        enlace: `/distribucion/socializaciones/nueva?version=${f.version_id}`,
      },
      escalado: "Una socialización de documento sigue sin registrarse",
      entidad: "socializacion",
      entidadId: id,
    });
    await marcar(tx, "socializaciones_requeridas", id, c.ahora, hecho);
    return hecho;
  });
}

async function hallazgosVencidos(c: Contexto): Promise<Resultado> {
  const candidatas = await c.sql`SELECT id FROM hallazgos
    WHERE estado = 'abierto' AND vence_en < ${c.ahora} AND (aviso_vencido_en IS NULL OR escalado_en IS NULL) ORDER BY id`;
  return porFila(c, candidatas.map((f) => Number(f.id)), "el hallazgo", async (tx, id) => {
    const [f] = await tx`
      SELECT h.descripcion, h.origen, h.verificacion_id, h.copia_id, h.vence_en, h.aviso_vencido_en, h.escalado_en,
             pu.responsable_id, pu.nombre AS punto
      FROM hallazgos h JOIN puntos_uso pu ON pu.id = h.punto_uso_id
      WHERE h.id = ${id} AND h.estado = 'abierto' AND h.vence_en < ${c.ahora}
      FOR UPDATE OF h SKIP LOCKED`;
    if (!f) return NADA;
    const falta = queFalta(c, f);
    if (!falta.avisar && !falta.escalar) return NADA;
    const responsable = Number(f.responsable_id);
    const enlace =
      f.origen === "verificacion" && f.verificacion_id !== null
        ? `/distribucion/verificaciones/${f.verificacion_id}`
        : f.copia_id !== null
          ? `/distribucion/copias/${f.copia_id}`
          : "/distribucion/verificaciones";
    const hecho = await avisarYEscalar(tx, falta, {
      destinatarios: [responsable],
      responsables: [responsable],
      vencido: { titulo: `Hallazgo vencido en ${f.punto}: ${recortar(f.descripcion as string, 80)}`, cuerpo: `Venció hace ${dias(falta.dias)}.`, enlace },
      escalado: "Un hallazgo de verificación sigue sin corregirse",
      entidad: "hallazgo",
      entidadId: id,
    });
    await marcar(tx, "hallazgos", id, c.ahora, hecho);
    return hecho;
  });
}

export async function revisarVencimientosDeDistribucion(opciones: {
  sql: Cliente;
  ahora: Date;
  config: ConfigDocumental;
}): Promise<Resultado> {
  const c: Contexto = {
    sql: opciones.sql,
    ahora: opciones.ahora,
    escalamientoDias: opciones.config.escalamientoDias,
    zona: zonaHoraria(),
  };
  const total = { avisados: 0, escalados: 0 };
  for (const pasada of [
    () => copiasVencidas(c, "emitida"),
    () => copiasVencidas(c, "por_recoger"),
    () => acusesVencidos(c),
    () => socializacionesVencidas(c),
    () => hallazgosVencidos(c),
  ]) {
    const r = await pasada();
    total.avisados += r.avisados;
    total.escalados += r.escalados;
  }
  return total;
}
