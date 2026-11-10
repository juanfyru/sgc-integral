/**
 * Avisos de vencimiento de la vigencia (spec 13C §7.5 y §13.3). Misma mecánica que los trámites y la distribución:
 * cada proceso en su transacción corta con `FOR UPDATE SKIP LOCKED` sobre sus filas, las marcas se vuelven a leer
 * bajo el candado y van en la misma transacción que el aviso, y el sistema no deja fila en `auditoria`; el rastro son
 * los avisos y las marcas. Sin destinatario no hay aviso ni marca, y sin jefe no hay escalamiento ni marca.
 *
 * Documentos internos con la revisión vencida (`revision_aviso_en` / `revision_escalado_en`): por pasada, un aviso
 * por persona y proceso con el conteo, nunca uno por documento; al líder del proceso (o a los Admin SGC si no tiene)
 * y siempre a los Admin SGC; a los días de `escalamientoDias`, uno a cada jefe de quienes tienen la tarea. Ninguno
 * lleva un código ni un título: así no nombra uno restringido a quien no lo ve. Lo que está en la revisión anual
 * abierta no se avisa: la campaña lo cubre.
 *
 * Externos con la verificación vencida (`externos.aviso_vencido_en` / `escalado_en`): vencido es que pasó la próxima
 * verificación, no el estado del semáforo. Un aviso por externo a su responsable técnico, que lo nombra (lo ve; si
 * dejó de ver un restringido, no se le avisa), uno por proceso a los Admin SGC con el conteo y sin códigos, y el
 * escalamiento al jefe del responsable sin código, título ni enlace.
 *
 * Impactos normativos pendientes vencidos: la pasada vive en `normograma/vencidos.ts` y se suma aquí. La de la revisión
 * anual vencida, en `revision-anual/vencidos.ts`.
 */
import type { PendingQuery, Row, TransactionSql } from "postgres";
import type { Cliente } from "@/db/cliente";
import { avisarA, jefesDe } from "@/db/consultas/avisos-vencimiento";
import type { ConfigDocumental } from "@/db/consultas/config-documental";
import { enTransaccion } from "@/db/consultas/flujo/contrato";
import { impactosVencidos } from "@/db/consultas/normograma/vencidos";
import { adminsActivos, lideresDeProceso } from "@/db/consultas/tramites";
import { filtroAccesoDe } from "@/lib/alcance";
import { estadoPlazo } from "@/lib/tramites/plazos";
import { textoResponsables } from "@/lib/tramites/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { columnasDeVigencia, enRevisionAnualAbierta, type FilaSemaforo } from "./fragmentos";
import { revisionVencida } from "./revision-anual/vencidos";

type Contexto = { sql: Cliente; ahora: Date; escalamientoDias: number };
type Resultado = { avisados: number; escalados: number };

const NADA: Resultado = { avisados: 0, escalados: 0 };
const documentos = (n: number) => `${n} ${n === 1 ? "documento" : "documentos"}`;
const externos = (n: number) => `${n} ${n === 1 ? "documento externo" : "documentos externos"}`;
const dias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;

/** Los internos vigentes con la revisión vencida que cumplen `condicion`, fuera de la revisión anual abierta. */
async function vencidos(sql: Cliente, condicion: PendingQuery<Row[]>, ahora: Date): Promise<FilaSemaforo[]> {
  const filas = await columnasDeVigencia(sql, sql`d.origen = 'interno' AND NOT ${enRevisionAnualAbierta(sql)} AND ${condicion}`, ahora);
  // Sin fecha de revisión no hay vencimiento, y uno en trámite ya tiene quién lo revise.
  return filas.filter((f) => f.vigencia.estado === "vencida");
}

async function revisarProceso(tx: TransactionSql, procesoId: number, ids: number[], c: Contexto): Promise<Resultado> {
  // Las marcas se vuelven a leer con las filas bloqueadas, y la vigencia después: lo que otra pasada ya avisó, o lo
  // que se ratificó entre la lista y el candado, no se avisa.
  const marcas = await tx`SELECT id, revision_aviso_en, revision_escalado_en FROM documentos
    WHERE id = ANY(${ids}) ORDER BY id FOR UPDATE SKIP LOCKED`;
  if (marcas.length === 0) return NADA;
  const filas = await vencidos(tx, tx`d.id = ANY(${marcas.map((m) => Number(m.id))}) AND p.id = ${procesoId}`, c.ahora);
  const marca = new Map(marcas.map((m) => [Number(m.id), m]));
  const aAvisar = filas.filter((f) => marca.get(f.documentoId)?.revision_aviso_en === null);
  const aEscalar = filas.filter(
    (f) => marca.get(f.documentoId)?.revision_escalado_en === null && -(f.vigencia.dias ?? 0) > c.escalamientoDias,
  );
  if (aAvisar.length === 0 && aEscalar.length === 0) return NADA;

  const proceso = filas[0].proceso.nombre;
  const lideres = await lideresDeProceso(procesoId, { sql: tx });
  const admins = await adminsActivos({ sql: tx });
  // Quienes tienen la tarea: por ellos llega el escalamiento a su jefe.
  const responsables = lideres.length > 0 ? lideres : admins;
  const destinatarios = [...new Set([...responsables, ...admins])];
  const hecho = { ...NADA };

  // Sin destinatario no hubo aviso: la marca queda vacía y el documento se revisa otra vez cuando lo haya.
  if (aAvisar.length > 0 && destinatarios.length > 0) {
    await avisarA(
      tx,
      {
        tipo: "vigencia.vencida",
        titulo: `${documentos(aAvisar.length)} con revisión vencida en ${proceso}`,
        enlace: `/vigencia/semaforo?estado=vencida&proceso=${procesoId}`,
        entidad: "proceso",
        entidadId: procesoId,
      },
      destinatarios.map((usuarioId) => ({
        usuarioId,
        cuerpo: `${aAvisar.length === 1 ? "Ratifíquelo" : "Ratifíquelos"} sin cambios o solicite el cambio desde el semáforo.`,
      })),
    );
    await tx`UPDATE documentos SET revision_aviso_en = ${c.ahora} WHERE id = ANY(${aAvisar.map((f) => f.documentoId)})`;
    hecho.avisados = aAvisar.length;
  }

  // Sin jefe no se escala y el documento queda para cuando lo haya.
  const jefes = aEscalar.length > 0 ? await jefesDe(tx, responsables) : new Map<number, string[]>();
  if (jefes.size > 0) {
    // Sin código, título ni enlace: el jefe no gana acceso a los documentos (spec 13A §14.3).
    await avisarA(
      tx,
      { tipo: "vigencia.escalado", titulo: `Documentos con la revisión vencida en ${proceso}`, enlace: null, entidad: "proceso", entidadId: procesoId },
      [...jefes].map(([usuarioId, subalternos]) => ({
        usuarioId,
        cuerpo: `A cargo de ${textoResponsables(subalternos)}. ${documentos(aEscalar.length)} con la revisión vencida hace más de ${dias(c.escalamientoDias)}.`,
      })),
    );
    await tx`UPDATE documentos SET revision_escalado_en = ${c.ahora} WHERE id = ANY(${aEscalar.map((f) => f.documentoId)})`;
    hecho.escalados = aEscalar.length;
  }
  return hecho;
}

async function revisarInternosVencidos(c: Contexto): Promise<Resultado> {
  const candidatos = await vencidos(
    c.sql,
    c.sql`(d.revision_aviso_en IS NULL OR d.revision_escalado_en IS NULL)`,
    c.ahora,
  );
  const porProceso = new Map<number, number[]>();
  for (const f of candidatos) porProceso.set(f.proceso.id, [...(porProceso.get(f.proceso.id) ?? []), f.documentoId]);

  const total = { ...NADA };
  for (const [procesoId, ids] of porProceso) {
    try {
      const h = await enTransaccion(c.sql, (tx) => revisarProceso(tx, procesoId, ids, c));
      total.avisados += h.avisados;
      total.escalados += h.escalados;
    } catch (err) {
      console.error(`No se pudo revisar la vigencia vencida del proceso ${procesoId}:`, err);
    }
  }
  return total;
}

// ── Externos con la verificación vencida ──

/** Días desde que pasó la próxima verificación; null si no ha pasado (o no tiene fecha). */
function diasVencido(f: FilaSemaforo, ahora: Date, zona: string): number | null {
  if (!f.proximaRevision) return null;
  const plazo = estadoPlazo(f.proximaRevision, ahora, zona);
  return plazo.estado === "vencido" ? plazo.dias : null;
}

/** Los externos vigentes cuya próxima verificación ya pasó y que cumplen `condicion`. */
async function externosVencidos(sql: Cliente, condicion: PendingQuery<Row[]>, ahora: Date): Promise<FilaSemaforo[]> {
  const zona = zonaHoraria();
  const filas = await columnasDeVigencia(sql, sql`d.origen = 'externo' AND ${condicion}`, ahora);
  return filas.filter((f) => diasVencido(f, ahora, zona) !== null);
}

async function revisarExternosDeProceso(tx: TransactionSql, procesoId: number, ids: number[], c: Contexto): Promise<Resultado> {
  const zona = zonaHoraria();
  // Las marcas y el responsable se vuelven a leer con las filas bloqueadas, y la vigencia después: lo que otra pasada
  // ya avisó, o lo que se verificó entre la lista y el candado, no se avisa.
  const marcas = await tx`SELECT ex.documento_id, ex.responsable_id, ex.aviso_vencido_en, ex.escalado_en, u.activo,
      ${filtroAccesoDe(tx, tx`ex.responsable_id`)} AS lo_ve
    FROM externos ex
    JOIN documentos d ON d.id = ex.documento_id
    JOIN usuarios u ON u.id = ex.responsable_id
    WHERE ex.documento_id = ANY(${ids})
    ORDER BY ex.documento_id
    FOR UPDATE OF ex SKIP LOCKED`;
  if (marcas.length === 0) return NADA;
  const filas = await externosVencidos(tx, tx`d.id = ANY(${marcas.map((m) => Number(m.documento_id))}) AND p.id = ${procesoId}`, c.ahora);
  const marca = new Map(marcas.map((m) => [Number(m.documento_id), m]));
  const vencidoHace = (f: FilaSemaforo) => diasVencido(f, c.ahora, zona) ?? 0;
  const aAvisar = filas.filter((f) => marca.get(f.documentoId)?.aviso_vencido_en === null);
  const aEscalar = filas.filter((f) => marca.get(f.documentoId)?.escalado_en === null && vencidoHace(f) > c.escalamientoDias);
  if (aAvisar.length === 0 && aEscalar.length === 0) return NADA;

  const proceso = filas[0].proceso.nombre;
  const hecho = { ...NADA };

  // Al responsable técnico, uno por externo y con su nombre: es el suyo y lo ve.
  const avisados = new Set<number>();
  for (const f of aAvisar) {
    const m = marca.get(f.documentoId)!;
    if (!m.activo || !m.lo_ve) continue;
    await avisarA(
      tx,
      {
        tipo: "externos.vencida",
        titulo: `${f.codigo} · ${f.titulo}: la verificación de vigencia venció hace ${dias(vencidoHace(f))}`,
        enlace: `/vigencia/externos/${f.documentoId}`,
        entidad: "documento",
        entidadId: f.documentoId,
      },
      [{ usuarioId: Number(m.responsable_id), cuerpo: "Consulte la fuente oficial y registre la verificación." }],
    );
    avisados.add(f.documentoId);
  }
  // A los Admin SGC, agrupado por proceso y sin códigos.
  const admins = aAvisar.length > 0 ? await adminsActivos({ sql: tx }) : [];
  if (admins.length > 0) {
    await avisarA(
      tx,
      {
        tipo: "externos.vencida",
        titulo: `${externos(aAvisar.length)} con la verificación de vigencia vencida en ${proceso}`,
        enlace: `/vigencia/externos?estado=vencida&proceso=${procesoId}`,
        entidad: "proceso",
        entidadId: procesoId,
      },
      admins.map((usuarioId) => ({
        usuarioId,
        cuerpo: `${aAvisar.length === 1 ? "Su responsable técnico debe verificarlo" : "Sus responsables técnicos deben verificarlos"} contra la fuente oficial.`,
      })),
    );
    for (const f of aAvisar) avisados.add(f.documentoId);
  }
  if (avisados.size > 0) {
    await tx`UPDATE externos SET aviso_vencido_en = ${c.ahora} WHERE documento_id = ANY(${[...avisados]})`;
    hecho.avisados = avisados.size;
  }

  // Al jefe de cada responsable técnico: sin código, título ni enlace, porque el jefe puede no ver un restringido.
  const porJefe = new Map<number, { subalternos: Set<string>; cuantos: number }>();
  const escalados: number[] = [];
  for (const f of aEscalar) {
    const jefes = await jefesDe(tx, [Number(marca.get(f.documentoId)!.responsable_id)]);
    if (jefes.size === 0) continue;
    escalados.push(f.documentoId);
    for (const [jefeId, nombres] of jefes) {
      const actual = porJefe.get(jefeId) ?? { subalternos: new Set<string>(), cuantos: 0 };
      for (const nombre of nombres) actual.subalternos.add(nombre);
      actual.cuantos += 1;
      porJefe.set(jefeId, actual);
    }
  }
  if (porJefe.size > 0) {
    await avisarA(
      tx,
      {
        tipo: "externos.escalado",
        titulo: `Documentos externos con la verificación de vigencia vencida en ${proceso}`,
        enlace: null,
        entidad: "proceso",
        entidadId: procesoId,
      },
      [...porJefe].map(([usuarioId, e]) => ({
        usuarioId,
        cuerpo: `A cargo de ${textoResponsables([...e.subalternos])}. ${externos(e.cuantos)} con la verificación vencida hace más de ${dias(c.escalamientoDias)}.`,
      })),
    );
    await tx`UPDATE externos SET escalado_en = ${c.ahora} WHERE documento_id = ANY(${escalados})`;
    hecho.escalados = escalados.length;
  }
  return hecho;
}

/** La pasada de los externos con la verificación vencida; `avisados` y `escalados` cuentan externos. */
async function revisarExternosVencidos(c: Contexto): Promise<Resultado> {
  const candidatos = await externosVencidos(
    c.sql,
    c.sql`EXISTS (SELECT 1 FROM externos marca_ex
      WHERE marca_ex.documento_id = d.id AND (marca_ex.aviso_vencido_en IS NULL OR marca_ex.escalado_en IS NULL))`,
    c.ahora,
  );
  const porProceso = new Map<number, number[]>();
  for (const f of candidatos) porProceso.set(f.proceso.id, [...(porProceso.get(f.proceso.id) ?? []), f.documentoId]);

  const total = { ...NADA };
  for (const [procesoId, ids] of porProceso) {
    try {
      const h = await enTransaccion(c.sql, (tx) => revisarExternosDeProceso(tx, procesoId, ids, c));
      total.avisados += h.avisados;
      total.escalados += h.escalados;
    } catch (err) {
      console.error(`No se pudo revisar la verificación vencida de los externos del proceso ${procesoId}:`, err);
    }
  }
  return total;
}

/**
 * Los internos con la revisión vencida, los externos con la verificación vencida, los impactos normativos pendientes
 * vencidos (`impactosVencidos`) y los procesos de la revisión anual vencida con pendientes (`revisionVencida`), spec 13C
 * §13.3; cuentan documentos, impactos y procesos, no avisos.
 */
export async function revisarVencimientosDeVigencia(opciones: {
  sql: Cliente;
  ahora: Date;
  config: ConfigDocumental;
}): Promise<Resultado> {
  const c: Contexto = { sql: opciones.sql, ahora: opciones.ahora, escalamientoDias: opciones.config.escalamientoDias };
  const internos = await revisarInternosVencidos(c);
  const deExternos = await revisarExternosVencidos(c);
  const deImpactos = await impactosVencidos(c);
  const deLaRevision = await revisionVencida(c);
  return {
    avisados: internos.avisados + deExternos.avisados + deImpactos.avisados + deLaRevision.avisados,
    escalados: internos.escalados + deExternos.escalados + deImpactos.escalados + deLaRevision.escalados,
  };
}
