/**
 * Los impactos pendientes vencidos (spec 13C §13.3), para `revisarVencimientosDeVigencia` (la Tarea 9 la suma). Misma
 * mecánica que las demás pasadas: cada grupo (cambio y proceso) en su transacción corta con `FOR UPDATE SKIP LOCKED`,
 * las marcas se vuelven a leer bajo el candado y van en la misma transacción que el aviso, sin `auditoria`. Ningún aviso
 * nombra un documento.
 */
import type { TransactionSql } from "postgres";
import type { Cliente } from "@/db/cliente";
import { avisarA, jefesDe } from "@/db/consultas/avisos-vencimiento";
import { enTransaccion } from "@/db/consultas/flujo/contrato";
import { adminsActivos, lideresDeProceso } from "@/db/consultas/tramites";
import { enlaceDeImpacto } from "@/lib/normograma/tipos";
import { cuenta } from "@/lib/plural";
import { estadoPlazo } from "@/lib/tramites/plazos";
import { textoResponsables } from "@/lib/tramites/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { nombreSql } from "./busqueda";

/** Lo que la pasada de vencimientos le pasa a cada fuente: la conexión, la hora y los días hasta escalar. */
export type ContextoVencimientos = { sql: Cliente; ahora: Date; escalamientoDias: number };
type Resultado = { avisados: number; escalados: number };
const NADA: Resultado = { avisados: 0, escalados: 0 };

type Grupo = { cambioId: number; procesoId: number; ids: number[] };

async function revisarGrupo(tx: TransactionSql, g: Grupo, c: ContextoVencimientos): Promise<Resultado> {
  const zona = zonaHoraria();
  // Las marcas y el estado se vuelven a leer con las filas bloqueadas: lo que otra pasada ya avisó, o lo que se
  // resolvió entre la lista y el candado, no se avisa.
  const filas = await tx`SELECT id, vence_en, aviso_vencido_en, escalado_en FROM impactos_normativos
    WHERE id = ANY(${g.ids}) AND estado = 'pendiente'
    ORDER BY id FOR UPDATE SKIP LOCKED`;
  const vencidoHace = (f: (typeof filas)[number]) => {
    const plazo = estadoPlazo(new Date(f.vence_en), c.ahora, zona);
    return plazo.estado === "vencido" ? plazo.dias : null;
  };
  const vencidos = filas.filter((f) => vencidoHace(f) !== null);
  const aAvisar = vencidos.filter((f) => f.aviso_vencido_en === null);
  const aEscalar = vencidos.filter((f) => f.escalado_en === null && vencidoHace(f)! > c.escalamientoDias);
  if (aAvisar.length === 0 && aEscalar.length === 0) return NADA;

  const [d] = await tx`SELECT ${nombreSql(tx)} AS norma, p.nombre AS proceso
    FROM norma_cambios cn JOIN normas n ON n.id = cn.norma_id JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
    JOIN procesos p ON p.id = ${g.procesoId}
    WHERE cn.id = ${g.cambioId}`;
  const lideres = await lideresDeProceso(g.procesoId, { sql: tx });
  const admins = await adminsActivos({ sql: tx });
  // Quienes tienen la tarea: por ellos llega el escalamiento a su jefe. El aviso va además a los Admin SGC (§7.5).
  const responsables = lideres.length > 0 ? lideres : admins;
  const destinatarios = [...new Set([...responsables, ...admins])];
  const hecho = { ...NADA };

  // Sin destinatario no hubo aviso: la marca queda vacía y el impacto se revisa otra vez cuando lo haya.
  if (aAvisar.length > 0 && destinatarios.length > 0) {
    await avisarA(
      tx,
      {
        tipo: "normograma.impacto_vencido",
        titulo: `Venció la revisión del impacto de ${d.norma} en ${d.proceso}`,
        enlace: enlaceDeImpacto(g.cambioId, g.procesoId),
        entidad: "proceso",
        entidadId: g.procesoId,
      },
      destinatarios.map((usuarioId) => ({
        usuarioId,
        cuerpo: `${cuenta(aAvisar.length, "impacto sin resolver", "impactos sin resolver")}: abra una solicitud de cambio o registre que no afecta.`,
      })),
    );
    await tx`UPDATE impactos_normativos SET aviso_vencido_en = ${c.ahora} WHERE id = ANY(${aAvisar.map((f) => Number(f.id))})`;
    hecho.avisados = aAvisar.length;
  }

  // Sin jefe no se escala y el impacto queda para cuando lo haya. Sin enlace: el jefe no gana acceso (spec 13A §14.3).
  const jefes = aEscalar.length > 0 ? await jefesDe(tx, responsables) : new Map<number, string[]>();
  if (jefes.size > 0) {
    await avisarA(
      tx,
      { tipo: "normograma.escalado", titulo: `Impactos normativos vencidos en ${d.proceso}`, enlace: null, entidad: "proceso", entidadId: g.procesoId },
      [...jefes].map(([usuarioId, subalternos]) => ({
        usuarioId,
        cuerpo: `A cargo de ${textoResponsables(subalternos)}. ${cuenta(aEscalar.length, "impacto", "impactos")} de ${d.norma} sin resolver hace más de ${cuenta(c.escalamientoDias, "día", "días")}.`,
      })),
    );
    await tx`UPDATE impactos_normativos SET escalado_en = ${c.ahora} WHERE id = ANY(${aEscalar.map((f) => Number(f.id))})`;
    hecho.escalados = aEscalar.length;
  }
  return hecho;
}

/**
 * La pasada de los impactos pendientes vencidos, para `revisarVencimientosDeVigencia` (la Tarea 9 la suma): por cambio
 * y proceso, un aviso `normograma.impacto_vencido` a quien tiene la tarea y a los Admin SGC, y a los días de
 * `escalamientoDias` uno `normograma.escalado` a sus jefes; cada grupo en su transacción corta con `SKIP LOCKED`, sin
 * `auditoria`. `avisados` y `escalados` cuentan impactos.
 */
export async function impactosVencidos(c: ContextoVencimientos): Promise<Resultado> {
  const candidatos = await c.sql`SELECT id, cambio_id, proceso_id FROM impactos_normativos
    WHERE estado = 'pendiente' AND vence_en < ${c.ahora} AND (aviso_vencido_en IS NULL OR escalado_en IS NULL)
    ORDER BY cambio_id, proceso_id, id`;
  const grupos = new Map<string, Grupo>();
  for (const f of candidatos) {
    const clave = `${f.cambio_id}:${f.proceso_id}`;
    const g = grupos.get(clave) ?? { cambioId: Number(f.cambio_id), procesoId: Number(f.proceso_id), ids: [] };
    g.ids.push(Number(f.id));
    grupos.set(clave, g);
  }
  const total = { ...NADA };
  for (const g of grupos.values()) {
    try {
      const h = await enTransaccion(c.sql, (tx) => revisarGrupo(tx, g, c));
      total.avisados += h.avisados;
      total.escalados += h.escalados;
    } catch (err) {
      console.error(`No se pudieron revisar los impactos vencidos del cambio ${g.cambioId} en el proceso ${g.procesoId}:`, err);
    }
  }
  return total;
}
