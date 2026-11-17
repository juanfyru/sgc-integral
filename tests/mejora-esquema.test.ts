/**
 * Esquema de la Fase 15A (migración 0018, spec 15 §12.2 y §19): las tablas de mejoramiento, las cuatro de solo inserción,
 * el trigger del hallazgo terminado, la criticidad de la no conformidad, el ajuste pendiente único por actividad, la firma
 * con un hallazgo como dueño y los cuatro borrados que ya existían, que ahora conocen a los hallazgos (§19.4). Nada queda
 * confirmado: todo corre dentro de una transacción que se revierte.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql, TransactionSql } from "postgres";
import postgres from "postgres";
import { TIPOS_SQL } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { registrarFirma } from "@/db/consultas/firmas";
import { condicionDeDeshacer } from "@/db/consultas/indicadores/importacion";
import { conDatos } from "@/db/consultas/indicadores/mediciones";
import { borrarIndicador } from "@/db/consultas/indicadores/operacion";
import { historiaDeNorma } from "@/db/consultas/normograma/lectura";
import { borrarNorma } from "@/db/consultas/normograma/normas";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { ErrorNormograma } from "@/lib/normograma/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { indicadorDePrueba } from "./utiles/indicadores";
import { sesionAdmin } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const AHORA = new Date("2026-11-17T15:00:00Z");
const TERMINALES = ["cerrado", "rechazado", "anulado"] as const;
const MEJORAMIENTO = "la cita un hallazgo de mejoramiento";
const CITADO = "El indicador está citado en un hallazgo de mejoramiento";

type Fallo = { codigo: string; restriccion: string | null } | null;

/** El código y la restricción del error, o `null` si la consulta entró. Cada intento va en su punto de guardado. */
async function fallo(tx: TransactionSql, consulta: () => PromiseLike<unknown>): Promise<Fallo> {
  await tx`SAVEPOINT intento`;
  try {
    await consulta();
    await tx`RELEASE SAVEPOINT intento`;
    return null;
  } catch (err) {
    await tx`ROLLBACK TO SAVEPOINT intento`;
    const e = err as { code?: string; constraint_name?: string; message?: string };
    // El 42501 de un trigger, no el de un privilegio: el dueño del esquema tiene todos.
    if (e.code === "42501") expect(e.message).not.toMatch(/permission denied|permiso denegado/i);
    return { codigo: e.code ?? "sin-codigo", restriccion: e.constraint_name ?? null };
  }
}

const codigo = async (tx: TransactionSql, consulta: () => PromiseLike<unknown>) => (await fallo(tx, consulta))?.codigo ?? null;

async function rechaza(promesa: Promise<unknown>, mensaje: string, clase: abstract new (...args: never[]) => Error) {
  const err = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(clase);
  expect((err as Error).message).toBe(mensaje);
}

/** Las sentencias de la migración `NNNN_*.sql`, como las corre el migrador. */
function sentencias(numero: string): string[] {
  const carpeta = path.resolve(import.meta.dirname, "../drizzle");
  const archivo = readdirSync(carpeta).find((f) => f.startsWith(`${numero}_`) && f.endsWith(".sql"));
  if (!archivo) throw new Error(`No hay una migración ${numero}`);
  return readFileSync(path.join(carpeta, archivo), "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
}

type Base = { admin: SesionFlujo; usuarioId: number; procesoId: number };

async function base(tx: TransactionSql): Promise<Base> {
  const admin = await sesionAdmin(tx);
  const [p] = await tx`SELECT id FROM procesos WHERE activo ORDER BY id LIMIT 1`;
  return { admin, usuarioId: admin.usuarioId, procesoId: Number(p.id) };
}

let consecutivo = 0;

type OpcionesHallazgo = {
  estado?: string;
  clase?: string;
  criticidad?: string | null;
  indicadorId?: number;
  medicionId?: number;
  requisitoNormaId?: number;
};

/** Un hallazgo por SQL directo, del año 9999: su código no choca con uno de verdad. */
async function hallazgo(tx: TransactionSql, b: Base, o: OpcionesHallazgo = {}): Promise<number> {
  consecutivo += 1;
  const clase = o.clase ?? "no_conformidad";
  const criticidad = o.criticidad === undefined ? (clase === "no_conformidad" ? "media" : null) : o.criticidad;
  const [h] = await tx`INSERT INTO mejora_hallazgos (codigo, anio, consecutivo, clase, origen, fuente, detectado_en, proceso_id,
      criticidad, titulo, descripcion, requisito_norma_id, indicador_id, medicion_id, estado, registrado_por, registrado_en)
    VALUES (${`HZ-9999-${String(consecutivo).padStart(3, "0")}`}, 9999, ${consecutivo}, ${clase}, 'auditoria_interna',
      'Auditoría interna de prueba', '2026-11-03', ${b.procesoId}, ${criticidad}, 'Hallazgo de prueba',
      'La descripción del hallazgo de prueba, con su evidencia', ${o.requisitoNormaId ?? null}, ${o.indicadorId ?? null},
      ${o.medicionId ?? null}, ${o.estado ?? "en_ejecucion"}, ${b.usuarioId}, ${AHORA})
    RETURNING id`;
  return Number(h.id);
}

async function ronda(tx: TransactionSql, hallazgoId: number, numero = 1, indicadorEficaciaId: number | null = null): Promise<number> {
  const [r] = await tx`INSERT INTO mejora_rondas (hallazgo_id, numero, formular_antes_de, estado_plan, indicador_eficacia_id)
    VALUES (${hallazgoId}, ${numero}, ${AHORA}, 'aprobado', ${indicadorEficaciaId}) RETURNING id`;
  return Number(r.id);
}

type Hijas = { ronda: number; analisis: number; causa: number; otraCausa: number; accion: number; actividad: number; ajuste: number };

/** Una fila en cada tabla hija del hallazgo, escritas mientras está en curso. */
async function hijas(tx: TransactionSql, b: Base, h: number): Promise<Hijas> {
  const r = await ronda(tx, h);
  const [an] = await tx`INSERT INTO mejora_analisis (hallazgo_id, ronda_id, orden, metodo, equipo, contenido)
    VALUES (${h}, ${r}, 1, 'cinco_porques', 'Equipo de calidad', ${tx.json({ niveles: [{ respuesta: "No se revisó la lista" }] })})
    RETURNING id`;
  const [c1] = await tx`INSERT INTO mejora_causas (hallazgo_id, ronda_id, orden, texto) VALUES (${h}, ${r}, 1, 'Causa uno') RETURNING id`;
  const [c2] = await tx`INSERT INTO mejora_causas (hallazgo_id, ronda_id, orden, texto) VALUES (${h}, ${r}, 2, 'Causa dos') RETURNING id`;
  const [ac] = await tx`INSERT INTO mejora_acciones (hallazgo_id, ronda_id, orden, tipo, descripcion)
    VALUES (${h}, ${r}, 1, 'correctiva', 'Acción de prueba') RETURNING id`;
  await tx`INSERT INTO mejora_accion_causas (hallazgo_id, accion_id, causa_id) VALUES (${h}, ${ac.id}, ${c1.id})`;
  const [act] = await tx`INSERT INTO mejora_actividades (hallazgo_id, accion_id, orden, descripcion, responsable_id, inicio,
      fin_original, fin, estado)
    VALUES (${h}, ${ac.id}, 1, 'Actividad de prueba', ${b.usuarioId}, '2026-11-04', '2026-11-30', '2026-11-30', 'en_proceso')
    RETURNING id`;
  const [aj] = await tx`INSERT INTO mejora_ajustes (hallazgo_id, ronda_id, tipo, actividad_id, datos, causa, pedido_por, pedido_en, estado)
    VALUES (${h}, ${r}, 'reprogramar', ${act.id}, ${tx.json({ fin: "2026-12-15" })}, 'La actividad necesita más tiempo',
      ${b.usuarioId}, ${AHORA}, 'pendiente')
    RETURNING id`;
  await tx`INSERT INTO mejora_eventos (hallazgo_id, ronda, tipo, usuario_id, ocurrio_en) VALUES (${h}, 1, 'registrar', ${b.usuarioId}, ${AHORA})`;
  await tx`INSERT INTO mejora_seguimientos (hallazgo_id, actividad_id, fecha, realizado, avance, registrado_por)
    VALUES (${h}, ${act.id}, '2026-11-10', 'Se hizo la mitad', 50, ${b.usuarioId})`;
  await tx`INSERT INTO mejora_ocurrencias (hallazgo_id, fecha, descripcion, origen, registrado_por)
    VALUES (${h}, '2026-11-12', 'Volvió a pasar en el turno de la noche', 'registro', ${b.usuarioId})`;
  return {
    ronda: r,
    analisis: Number(an.id),
    causa: Number(c1.id),
    otraCausa: Number(c2.id),
    accion: Number(ac.id),
    actividad: Number(act.id),
    ajuste: Number(aj.id),
  };
}

/**
 * Cada escritura sobre el hallazgo y sus hijas, con su resultado: insertar una fila nueva, cambiar una de antes y borrar
 * una. Con el hallazgo en curso se borra la recién insertada (no tiene dependientes); terminado, la de antes.
 */
async function escrituras(tx: TransactionSql, b: Base, h: number, f: Hijas): Promise<Record<string, string | null>> {
  const r: Record<string, string | null> = {};
  r["UPDATE mejora_hallazgos"] = await codigo(tx, () => tx`UPDATE mejora_hallazgos SET titulo = 'Otro título' WHERE id = ${h}`);
  r["UPDATE mejora_hallazgos (estado)"] = await codigo(tx, () => tx`UPDATE mejora_hallazgos SET estado = 'en_ejecucion' WHERE id = ${h}`);

  type Tabla = { tabla: string; insertar: () => PromiseLike<readonly { id?: unknown }[]>; cambiar: string; existente: number };
  const tablas: Tabla[] = [
    {
      tabla: "mejora_rondas",
      insertar: () => tx`INSERT INTO mejora_rondas (hallazgo_id, numero, formular_antes_de, estado_plan)
        VALUES (${h}, 2, ${AHORA}, 'borrador') RETURNING id`,
      cambiar: "nota_recursos = 'Otra nota'",
      existente: f.ronda,
    },
    {
      tabla: "mejora_analisis",
      insertar: () => tx`INSERT INTO mejora_analisis (hallazgo_id, ronda_id, orden, metodo, contenido)
        VALUES (${h}, ${f.ronda}, 2, 'otro', ${tx.json({ nombre: "Lluvia de ideas", descripcion: "Con el equipo" })}) RETURNING id`,
      cambiar: "observaciones = 'Otra observación'",
      existente: f.analisis,
    },
    {
      tabla: "mejora_causas",
      insertar: () => tx`INSERT INTO mejora_causas (hallazgo_id, ronda_id, orden, texto) VALUES (${h}, ${f.ronda}, 3, 'Causa tres') RETURNING id`,
      cambiar: "texto = 'Causa uno, corregida'",
      existente: f.causa,
    },
    {
      tabla: "mejora_acciones",
      insertar: () => tx`INSERT INTO mejora_acciones (hallazgo_id, ronda_id, orden, tipo, descripcion)
        VALUES (${h}, ${f.ronda}, 2, 'mejora', 'Otra acción') RETURNING id`,
      cambiar: "descripcion = 'Acción corregida'",
      existente: f.accion,
    },
    {
      tabla: "mejora_actividades",
      insertar: () => tx`INSERT INTO mejora_actividades (hallazgo_id, accion_id, orden, descripcion, responsable_id, inicio, fin)
        VALUES (${h}, ${f.accion}, 2, 'Otra actividad', ${b.usuarioId}, '2026-11-05', '2026-12-01') RETURNING id`,
      cambiar: "avance = 60",
      existente: f.actividad,
    },
    {
      tabla: "mejora_ajustes",
      insertar: () => tx`INSERT INTO mejora_ajustes (hallazgo_id, ronda_id, tipo, datos, causa, pedido_por, pedido_en)
        VALUES (${h}, ${f.ronda}, 'agregar', ${tx.json({ descripcion: "Una actividad más" })}, 'Hace falta otra actividad',
          ${b.usuarioId}, ${AHORA}) RETURNING id`,
      cambiar: "nota = 'Otra nota'",
      existente: f.ajuste,
    },
  ];
  for (const t of tablas) {
    let nueva: number | null = null;
    r[`INSERT ${t.tabla}`] = await codigo(tx, async () => {
      const [fila] = await t.insertar();
      nueva = Number(fila.id);
    });
    r[`UPDATE ${t.tabla}`] = await codigo(tx, () => tx.unsafe(`UPDATE ${t.tabla} SET ${t.cambiar} WHERE id = $1`, [t.existente]));
    const borrar = nueva ?? t.existente;
    r[`DELETE ${t.tabla}`] = await codigo(tx, () => tx.unsafe(`DELETE FROM ${t.tabla} WHERE id = $1`, [borrar]));
  }

  // La tabla de enlace no tiene id: su llave son la acción y la causa.
  let enlazada = false;
  r["INSERT mejora_accion_causas"] = await codigo(tx, async () => {
    await tx`INSERT INTO mejora_accion_causas (hallazgo_id, accion_id, causa_id) VALUES (${h}, ${f.accion}, ${f.otraCausa})`;
    enlazada = true;
  });
  r["UPDATE mejora_accion_causas"] = await codigo(
    tx,
    () => tx`UPDATE mejora_accion_causas SET hallazgo_id = hallazgo_id WHERE accion_id = ${f.accion} AND causa_id = ${f.causa}`,
  );
  r["DELETE mejora_accion_causas"] = await codigo(
    tx,
    () => tx`DELETE FROM mejora_accion_causas WHERE accion_id = ${f.accion} AND causa_id = ${enlazada ? f.otraCausa : f.causa}`,
  );

  r["INSERT mejora_eventos"] = await codigo(
    tx,
    () => tx`INSERT INTO mejora_eventos (hallazgo_id, ronda, tipo, usuario_id, ocurrio_en) VALUES (${h}, 1, 'ocurrencia', ${b.usuarioId}, ${AHORA})`,
  );
  r["INSERT mejora_seguimientos"] = await codigo(
    tx,
    () => tx`INSERT INTO mejora_seguimientos (hallazgo_id, actividad_id, fecha, realizado, avance, registrado_por)
      VALUES (${h}, ${f.actividad}, '2026-11-14', 'Se hizo otro tanto', 70, ${b.usuarioId})`,
  );
  r["INSERT mejora_ocurrencias"] = await codigo(
    tx,
    () => tx`INSERT INTO mejora_ocurrencias (hallazgo_id, fecha, descripcion, origen, registrado_por)
      VALUES (${h}, '2026-11-15', 'Volvió a pasar', 'registro', ${b.usuarioId})`,
  );
  return r;
}

/** Un reporte de un funcionario, con un evento. */
async function reporte(tx: TransactionSql, b: Base): Promise<{ reporte: number; evento: number }> {
  const [r] = await tx`INSERT INTO mejora_reportes (reportado_por, reportado_en, descripcion, visto_en, estado, vence_en)
    VALUES (${b.usuarioId}, ${AHORA}, 'La nevera de vacunas marcaba nueve grados', '2026-11-16', 'recibido', ${AHORA}) RETURNING id`;
  const [e] = await tx`INSERT INTO mejora_reporte_eventos (reporte_id, tipo, usuario_id) VALUES (${r.id}, 'enviado', ${b.usuarioId}) RETURNING id`;
  return { reporte: Number(r.id), evento: Number(e.id) };
}

async function normaDePrueba(tx: TransactionSql, b: Base): Promise<number> {
  const [n] = await tx`INSERT INTO normas (tipo_norma_id, numero, anio, entidad_emisora, titulo, creado_por)
    SELECT id, ${`zz-15a-${Date.now()}-${++consecutivo}`}, 2026, 'Ministerio de Salud', 'Norma de prueba', ${b.usuarioId}
    FROM tipos_norma ORDER BY id LIMIT 1
    RETURNING id`;
  return Number(n.id);
}

async function medicionAbierta(tx: TransactionSql, indicador: { id: number; versionId: number }, clave = "2026-01"): Promise<number> {
  const p = periodoDe(clave, zonaHoraria())!;
  const [m] = await tx`INSERT INTO mediciones (indicador_id, version_id, periodo, desde, hasta, vence_en)
    VALUES (${indicador.id}, ${indicador.versionId}, ${clave}, ${p.desde}, ${p.hasta}, ${p.hasta}) RETURNING id`;
  return Number(m.id);
}

/** Un lote importado con una ficha aprobada, como lo deja `importarLote` (el evento `importado` lista sus fichas). */
async function loteConUnaFicha(tx: TransactionSql, b: Base) {
  const [l] = await tx`INSERT INTO importaciones_indicadores (cargado_por, cargado_en) VALUES (${b.usuarioId}, ${AHORA}) RETURNING id`;
  const loteId = Number(l.id);
  const ficha = await indicadorDePrueba(tx, { procesoId: b.procesoId, importacionId: loteId, aprobadaEn: AHORA });
  await tx`INSERT INTO importacion_eventos (importacion_id, tipo, usuario_id, metodo, detalle, creado_en)
    VALUES (${loteId}, 'importado', ${b.usuarioId}, 'clave',
      ${tx.json({ fichas: [{ indicadorId: ficha.id, versionId: ficha.versionId, estado: "aprobado" }] } as never)}, ${AHORA})`;
  expect(await condicionDeDeshacer(tx, loteId)).toEqual({ puede: true, impiden: [] });
  return { loteId, ficha };
}

const COLUMNAS: Record<string, string[]> = {
  dias_no_habiles: ["id", "fecha", "tipo", "motivo", "creado_por", "creado_en"],
  mejora_consecutivos: ["anio", "ultimo"],
  mejora_hallazgos: [
    "id", "codigo", "anio", "consecutivo", "clase", "origen", "fuente", "referencia_caso", "detectado_en", "proceso_id",
    "subproceso_id", "criticidad", "titulo", "descripcion", "requisito_clausula", "requisito_norma_id",
    "requisito_documento_id", "documento_id", "indicador_id", "medicion_id", "riesgo", "estado", "ronda", "registrado_por",
    "registrado_en", "reincidente_de", "derivado_de", "cargado", "correccion_requerida", "correccion_descripcion",
    "correccion_responsable_id", "correccion_responsable_nombre", "correccion_implementada_en", "correccion_registrada_por",
    "correccion_registrada_en", "accion_requerida", "accion_justificacion", "accion_decidida_por", "accion_decidida_en",
    "validada_por", "validada_en", "fecha_limite_ente", "respuesta_ente_en", "respuesta_ente_por", "vence_en",
    "aviso_vencido_en", "escalado_en", "aviso_evaluar_en", "cerrado_en", "cerrado_por", "resultado_cierre", "lecciones",
    "cambios_atendidos", "anulado_motivo",
  ],
  mejora_rondas: [
    "id", "hallazgo_id", "numero", "formular_antes_de", "enviado_en", "estado_plan", "elaborado_por", "revisado_por",
    "revisado_en", "aprobado_por", "aprobado_en", "aprobado_rol", "aprobado_fuera", "requiere_recursos", "nota_recursos",
    "similares", "similares_detalle", "cambios", "criterios", "criterio_otro", "indicador_eficacia_id", "fecha_evaluacion",
    "cierre_previsto", "verificada_por", "verificada_en", "verificacion_metodos", "verificacion_nota", "evaluada_por",
    "evaluada_en", "resultado", "evaluacion_desde", "evaluacion_hasta", "evaluacion_criterios", "evaluacion_justificacion",
  ],
  mejora_analisis: ["id", "hallazgo_id", "ronda_id", "orden", "metodo", "equipo", "observaciones", "contenido"],
  mejora_causas: ["id", "hallazgo_id", "ronda_id", "orden", "texto", "sin_accion_porque"],
  mejora_acciones: ["id", "hallazgo_id", "ronda_id", "orden", "tipo", "descripcion", "recursos", "indicador_cumplimiento", "meta"],
  mejora_accion_causas: ["hallazgo_id", "accion_id", "causa_id"],
  mejora_actividades: [
    "id", "hallazgo_id", "accion_id", "orden", "descripcion", "responsable_id", "inicio", "fin_original", "fin", "avance",
    "estado", "terminada_en", "terminada_por", "verificacion", "verificacion_nota", "corregir_antes_de", "cancelada_en",
    "reprogramaciones", "gerencia_en", "aviso_vencido_en", "escalado_en", "recordatorio_en",
  ],
  mejora_seguimientos: ["id", "hallazgo_id", "actividad_id", "fecha", "realizado", "avance", "barreras", "registrado_por", "creado_en"],
  mejora_ajustes: [
    "id", "hallazgo_id", "ronda_id", "tipo", "actividad_id", "datos", "causa", "pedido_por", "pedido_en", "estado",
    "decidido_por", "decidido_en", "nota", "acta_numero", "acta_fecha", "vence_en", "aviso_vencido_en",
  ],
  mejora_ocurrencias: ["id", "hallazgo_id", "fecha", "descripcion", "origen", "reporte_id", "registrado_por", "creado_en"],
  mejora_eventos: ["id", "hallazgo_id", "ronda", "tipo", "detalle", "usuario_id", "fuera", "ocurrio_en", "creado_en"],
  mejora_reportes: [
    "id", "reportado_por", "reportado_en", "descripcion", "visto_en", "proceso_id", "referencia_caso", "estado", "hallazgo_id",
    "motivo_descarte", "clasificado_por", "clasificado_en", "vence_en", "aviso_vencido_en", "escalado_en",
  ],
  mejora_reporte_eventos: ["id", "reporte_id", "tipo", "detalle", "usuario_id", "creado_en"],
};

const CLAVES_POR_OMISION: Record<string, string> = {
  mej_plazo_clasificar_dias: "3",
  mej_plazo_aceptar_dias: "3",
  mej_plazo_decision_dias: "3",
  mej_plazo_correccion_dias: "3",
  mej_plazo_formular_dias: "10",
  mej_plazo_reenviar_dias: "5",
  mej_plazo_revisar_dias: "3",
  mej_plazo_aprobar_dias: "3",
  mej_plazo_verificar_dias: "5",
  mej_plazo_evaluar_dias: "5",
  mej_recordatorio_alta_dias: "15",
  mej_recordatorio_dias: "30",
  mej_formato_registro_documento_id: "",
  mej_formato_porques_documento_id: "",
  mej_formato_ishikawa_documento_id: "",
};

const HIJAS_QUE_CAMBIAN = [
  "mejora_rondas", "mejora_analisis", "mejora_causas", "mejora_acciones", "mejora_accion_causas", "mejora_actividades", "mejora_ajustes",
];
const DE_SOLO_INSERCION = ["mejora_eventos", "mejora_seguimientos", "mejora_ocurrencias", "mejora_reporte_eventos"];

describe.skipIf(!process.env.DATABASE_URL_MIGRADOR)("esquema de la migración 0018", () => {
  let dueno: Sql;
  let sql: Sql;

  beforeAll(() => {
    dueno = postgres(process.env.DATABASE_URL_MIGRADOR!, { max: 1, types: TIPOS_SQL });
    sql = postgres(process.env.DATABASE_URL!, { max: 1, types: TIPOS_SQL });
  });
  afterAll(async () => {
    await dueno.end();
    await sql.end();
  });

  it("las quince tablas existen con sus columnas", async () => {
    const filas = await dueno`SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN ${dueno(Object.keys(COLUMNAS))} ORDER BY table_name, ordinal_position`;
    const porTabla: Record<string, string[]> = {};
    for (const f of filas) (porTabla[f.table_name as string] ??= []).push(f.column_name as string);
    expect(porTabla).toEqual(COLUMNAS);
    const [firma] = await dueno`SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'firmas' AND column_name = 'mejora_hallazgo_id'`;
    expect(firma).toEqual({ data_type: "bigint", is_nullable: "YES" });
  });

  it("los triggers están en cada tabla, con su momento", async () => {
    const filas = await dueno`SELECT c.relname AS tabla, pg_get_triggerdef(t.oid) AS definicion
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal AND c.relname LIKE 'mejora\\_%' ORDER BY c.relname, t.tgname`;
    // «momento · función» de cada trigger de la tabla, en orden; pg_get_triggerdef escribe los eventos como INSERT, DELETE, UPDATE.
    const encontrados: Record<string, string[]> = {};
    for (const f of filas) {
      const m = /^CREATE TRIGGER \S+ (BEFORE [A-Z ]+?) ON \S+ FOR EACH ROW EXECUTE FUNCTION (\w+)\(\)$/.exec(f.definicion as string);
      (encontrados[f.tabla as string] ??= []).push(m ? `${m[1]} · ${m[2]}` : (f.definicion as string));
    }
    const TERMINADO = "sgc_impedir_si_hallazgo_terminado";
    const INMUTABLE = "sgc_impedir_modificacion";
    const esperado: Record<string, string[]> = { mejora_hallazgos: [`BEFORE DELETE OR UPDATE · ${TERMINADO}`] };
    for (const tabla of HIJAS_QUE_CAMBIAN) esperado[tabla] = [`BEFORE INSERT OR DELETE OR UPDATE · ${TERMINADO}`];
    for (const tabla of DE_SOLO_INSERCION) {
      esperado[tabla] = [`BEFORE DELETE OR UPDATE · ${INMUTABLE}`];
      if (tabla !== "mejora_reporte_eventos") esperado[tabla].push(`BEFORE INSERT · ${TERMINADO}`);
      esperado[tabla].sort();
    }
    for (const lista of Object.values(encontrados)) lista.sort();
    expect(encontrados).toEqual(esperado);
  });

  it("la migración deja las quince claves con su valor por omisión y no pisa las que ya están", () =>
    revertida(dueno, async (tx) => {
      const insercion = sentencias("0018").find((s) => s.startsWith('INSERT INTO "configuracion"'));
      expect(insercion).toBeDefined();
      await tx`DELETE FROM configuracion WHERE clave LIKE 'mej\\_%'`;
      await tx`INSERT INTO configuracion (clave, valor) VALUES ('mej_plazo_formular_dias', '12')`;
      await tx.unsafe(insercion!);
      const filas = await tx`SELECT clave, valor FROM configuracion WHERE clave LIKE 'mej\\_%'`;
      expect(Object.fromEntries(filas.map((f) => [f.clave, f.valor]))).toEqual({ ...CLAVES_POR_OMISION, mej_plazo_formular_dias: "12" });
    }));

  it("las tablas de solo inserción rechazan UPDATE y DELETE también al dueño", () =>
    revertida(dueno, async (tx) => {
      const b = await base(tx);
      const h = await hallazgo(tx, b);
      await hijas(tx, b, h);
      const r = await reporte(tx, b);
      const resultado: Record<string, string | null> = {};
      for (const tabla of ["mejora_eventos", "mejora_seguimientos", "mejora_ocurrencias"]) {
        resultado[`UPDATE ${tabla}`] = await codigo(tx, () => tx.unsafe(`UPDATE ${tabla} SET creado_en = creado_en WHERE hallazgo_id = $1`, [h]));
        resultado[`DELETE ${tabla}`] = await codigo(tx, () => tx.unsafe(`DELETE FROM ${tabla} WHERE hallazgo_id = $1`, [h]));
      }
      resultado["UPDATE mejora_reporte_eventos"] = await codigo(tx, () => tx`UPDATE mejora_reporte_eventos SET tipo = 'otro' WHERE id = ${r.evento}`);
      resultado["DELETE mejora_reporte_eventos"] = await codigo(tx, () => tx`DELETE FROM mejora_reporte_eventos WHERE id = ${r.evento}`);
      expect(resultado).toEqual(Object.fromEntries(Object.keys(resultado).map((k) => [k, "42501"])));
      expect(Object.keys(resultado)).toHaveLength(DE_SOLO_INSERCION.length * 2);
      // Las filas siguen ahí: el trigger no las dejó cambiar.
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM mejora_eventos WHERE hallazgo_id = ${h}`;
      expect(n).toBe(1);
    }));

  it("un hallazgo terminado no cambia, ni sus hijas, ni recibe hijas nuevas", () =>
    revertida(dueno, async (tx) => {
      const b = await base(tx);
      for (const terminal of TERMINALES) {
        const h = await hallazgo(tx, b);
        const f = await hijas(tx, b, h);
        // El acto que lo termina sale de un estado en curso: ese UPDATE sí entra.
        expect(await codigo(tx, () => tx`UPDATE mejora_hallazgos SET estado = ${terminal} WHERE id = ${h}`), terminal).toBeNull();
        const resultado = await escrituras(tx, b, h, f);
        resultado["DELETE mejora_hallazgos"] = await codigo(tx, () => tx`DELETE FROM mejora_hallazgos WHERE id = ${h}`);
        expect(resultado, terminal).toEqual(Object.fromEntries(Object.keys(resultado).map((k) => [k, "42501"])));
        expect(Object.keys(resultado)).toHaveLength(2 + 6 * 3 + 3 + 3 + 1);
        const [fila] = await tx`SELECT estado, titulo FROM mejora_hallazgos WHERE id = ${h}`;
        expect(fila).toEqual({ estado: terminal, titulo: "Hallazgo de prueba" });
      }
    }));

  it("un hallazgo en curso sí cambia", () =>
    revertida(dueno, async (tx) => {
      const b = await base(tx);
      const h = await hallazgo(tx, b);
      const f = await hijas(tx, b, h);
      const resultado = await escrituras(tx, b, h, f);
      expect(resultado).toEqual(Object.fromEntries(Object.keys(resultado).map((k) => [k, null])));
      // Un hallazgo en curso sin hijas también se borra.
      const solo = await hallazgo(tx, b);
      expect(await codigo(tx, () => tx`DELETE FROM mejora_hallazgos WHERE id = ${solo}`)).toBeNull();
    }));

  it("la criticidad es de la no conformidad", () =>
    revertida(dueno, async (tx) => {
      const b = await base(tx);
      const incoherente = { codigo: "23514", restriccion: "mejora_hallazgos_criticidad_coherente" };
      expect(await fallo(tx, () => hallazgo(tx, b, { clase: "observacion", criticidad: "alta" }))).toEqual(incoherente);
      expect(await fallo(tx, () => hallazgo(tx, b, { clase: "oportunidad", criticidad: "baja" }))).toEqual(incoherente);
      expect(await fallo(tx, () => hallazgo(tx, b, { clase: "no_conformidad", criticidad: null }))).toEqual(incoherente);
      expect(await fallo(tx, () => hallazgo(tx, b, { clase: "no_conformidad", criticidad: "grave" }))).toEqual({
        codigo: "23514",
        restriccion: "mejora_hallazgos_criticidad_valida",
      });
      expect(await fallo(tx, () => hallazgo(tx, b, { clase: "no_conformidad", criticidad: "alta" }))).toBeNull();
      expect(await fallo(tx, () => hallazgo(tx, b, { clase: "observacion", criticidad: null }))).toBeNull();
      expect(await fallo(tx, () => hallazgo(tx, b, { clase: "oportunidad", criticidad: null }))).toBeNull();
    }));

  it("un solo ajuste pendiente por actividad", () =>
    revertida(dueno, async (tx) => {
      const b = await base(tx);
      const h = await hallazgo(tx, b);
      const f = await hijas(tx, b, h);
      const pedir = (tipo: string, actividadId: number | null) => () =>
        tx`INSERT INTO mejora_ajustes (hallazgo_id, ronda_id, tipo, actividad_id, datos, causa, pedido_por, pedido_en, estado)
          VALUES (${h}, ${f.ronda}, ${tipo}, ${actividadId}, ${tx.json({})}, 'Otra causa del ajuste', ${b.usuarioId}, ${AHORA}, 'pendiente')`;
      expect(await fallo(tx, pedir("cancelar", f.actividad))).toEqual({ codigo: "23505", restriccion: "mejora_ajustes_un_pendiente_idx" });
      // Los «añadir» no tienen actividad todavía: varios a la vez.
      expect(await fallo(tx, pedir("agregar", null))).toBeNull();
      expect(await fallo(tx, pedir("agregar", null))).toBeNull();
      // Decidido el primero, la actividad admite otro.
      await tx`UPDATE mejora_ajustes SET estado = 'negado', decidido_por = ${b.usuarioId}, decidido_en = ${AHORA} WHERE id = ${f.ajuste}`;
      expect(await fallo(tx, pedir("cancelar", f.actividad))).toBeNull();
    }));

  it("una firma con hallazgo no necesita trámite", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const h = await hallazgo(tx, b, { estado: "en_espera" });
      const comunes = {
        tramiteId: null,
        versionId: null,
        usuarioId: b.usuarioId,
        ronda: 1,
        hashSha256: "a".repeat(64),
        metodo: "clave" as const,
        contexto: { ip: null, userAgent: null },
        ahora: AHORA,
      };
      const verifico = await registrarFirma(tx, { ...comunes, mejoraHallazgoId: h, firma: "verifico" });
      const cerro = await registrarFirma(tx, { ...comunes, mejoraHallazgoId: h, firma: "cerro" });
      const filas = await tx`SELECT id, mejora_hallazgo_id, tramite_id, version_id, indicador_version_id, firma, ronda
        FROM firmas WHERE mejora_hallazgo_id = ${h} ORDER BY id`;
      expect(filas).toEqual([
        { id: verifico, mejora_hallazgo_id: h, tramite_id: null, version_id: null, indicador_version_id: null, firma: "verifico", ronda: 1 },
        { id: cerro, mejora_hallazgo_id: h, tramite_id: null, version_id: null, indicador_version_id: null, firma: "cerro", ronda: 1 },
      ]);
      expect(await fallo(tx, () => registrarFirma(tx, { ...comunes, firma: "verifico" }))).toEqual({
        codigo: "23514",
        restriccion: "firmas_tramite_coherente",
      });
      expect(await fallo(tx, () => registrarFirma(tx, { ...comunes, mejoraHallazgoId: null, firma: "cerro" }))).toEqual({
        codigo: "23514",
        restriccion: "firmas_tramite_coherente",
      });
    }));

  describe("los borrados que ya existen conocen a los hallazgos", () => {
    it("una norma citada como requisito tiene historia y no se borra", () =>
      revertida(sql, async (tx) => {
        const b = await base(tx);
        const n = await normaDePrueba(tx, b);
        const historia = async () => (await tx`SELECT ${historiaDeNorma(tx, n)} AS tiene`)[0].tiene;
        expect(await historia()).toBe(false);
        await hallazgo(tx, b, { requisitoNormaId: n });
        expect(await historia()).toBe(true);
        await rechaza(borrarNorma(b.admin, n, { sql: tx, ahora: AHORA }), "La norma tiene historia: retírela", ErrorNormograma);
        expect(await tx`SELECT 1 FROM normas WHERE id = ${n}`).toHaveLength(1);
      }));

    it("una medición citada por un hallazgo cuenta como medición con datos", () =>
      revertida(sql, async (tx) => {
        const b = await base(tx);
        const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId });
        const m = await medicionAbierta(tx, ind);
        const tieneDatos = async () => (await tx`SELECT ${conDatos(tx)} AS con FROM mediciones m WHERE m.id = ${m}`)[0].con;
        expect(await tieneDatos()).toBe(false);
        await hallazgo(tx, b, { clase: "observacion", indicadorId: ind.id, medicionId: m });
        expect(await tieneDatos()).toBe(true);
      }));

    it("un lote no se deshace si un hallazgo cita una de sus fichas: por el indicador, por su medición o como indicador de eficacia", () =>
      revertida(sql, async (tx) => {
        const b = await base(tx);

        const porIndicador = await loteConUnaFicha(tx, b);
        await hallazgo(tx, b, { clase: "observacion", indicadorId: porIndicador.ficha.id });
        expect(await condicionDeDeshacer(tx, porIndicador.loteId)).toEqual({
          puede: false,
          impiden: [{ codigo: porIndicador.ficha.codigo, motivo: MEJORAMIENTO }],
        });

        const porEficacia = await loteConUnaFicha(tx, b);
        await ronda(tx, await hallazgo(tx, b, { clase: "oportunidad" }), 1, porEficacia.ficha.id);
        expect(await condicionDeDeshacer(tx, porEficacia.loteId)).toEqual({
          puede: false,
          impiden: [{ codigo: porEficacia.ficha.codigo, motivo: MEJORAMIENTO }],
        });

        // Citar la medición la vuelve historia (`conDatos`) y es, además, la cita de un hallazgo.
        const porMedicion = await loteConUnaFicha(tx, b);
        await hallazgo(tx, b, { clase: "observacion", medicionId: await medicionAbierta(tx, porMedicion.ficha) });
        expect(await condicionDeDeshacer(tx, porMedicion.loteId)).toEqual({
          puede: false,
          impiden: [
            { codigo: porMedicion.ficha.codigo, motivo: "tiene periodos cerrados o con datos" },
            { codigo: porMedicion.ficha.codigo, motivo: MEJORAMIENTO },
          ],
        });
      }));

    it("un borrador citado por un hallazgo no se borra: responde con su mensaje y no con el 23503", () =>
      revertida(sql, async (tx) => {
        const b = await base(tx);
        const citado = await indicadorDePrueba(tx, { procesoId: b.procesoId, estado: "borrador" });
        await hallazgo(tx, b, { clase: "observacion", indicadorId: citado.id });
        await rechaza(borrarIndicador(b.admin, citado.id, { sql: tx, ahora: AHORA }), CITADO, ErrorIndicador);

        const deEficacia = await indicadorDePrueba(tx, { procesoId: b.procesoId, estado: "borrador" });
        await ronda(tx, await hallazgo(tx, b, { clase: "oportunidad" }), 1, deEficacia.id);
        await rechaza(borrarIndicador(b.admin, deEficacia.id, { sql: tx, ahora: AHORA }), CITADO, ErrorIndicador);
        expect(await tx`SELECT 1 FROM indicadores WHERE id IN ${tx([citado.id, deEficacia.id])}`).toHaveLength(2);

        const libre = await indicadorDePrueba(tx, { procesoId: b.procesoId, estado: "borrador" });
        await borrarIndicador(b.admin, libre.id, { sql: tx, ahora: AHORA });
        expect(await tx`SELECT 1 FROM indicadores WHERE id = ${libre.id}`).toHaveLength(0);
      }));
  });
});
