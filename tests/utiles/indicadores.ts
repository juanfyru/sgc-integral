/**
 * Ayudante de los tests del módulo de indicadores (Fase 14). Corre dentro de una transacción que se
 * revierte (`revertida`): lo que crea aquí no sobrevive al test.
 */
import type { TransactionSql } from "postgres";
import type { RangosEnTexto } from "@/lib/indicadores/rangos";
import type { Periodicidad, Tendencia } from "@/lib/indicadores/tipos";
import { usuarioDePrueba } from "./tramites";

let consecutivo = 0;

/** La clave de periodo de enero de 2026 en cada periodicidad. */
const INICIO_POR_PERIODICIDAD: Record<Periodicidad, string> = {
  mensual: "2026-01",
  bimestral: "2026-B1",
  trimestral: "2026-T1",
  semestral: "2026-S1",
  anual: "2026",
};

export type IndicadorDePrueba = {
  id: number;
  codigo: string;
  versionId: number;
  variables: { A: number; B: number };
  procesoId: number;
};

export type OpcionesIndicadorDePrueba = {
  procesoId?: number;
  nivelAcceso?: "general" | "restringido";
  estado?: "borrador" | "activo";
  periodicidad?: Periodicidad;
  tendencia?: Tendencia;
  /** `null` deja la meta vacía; sin valor, 90. */
  meta?: string | null;
  umbralPct?: number;
  /** Con «fijo», el límite de crítico es `limite`; sin valor, «relativo» con el umbral. */
  modo?: "relativo" | "fijo";
  limite?: string;
  /** Con rangos, `semaforo_modo = 'rangos'` y la regla sale de ellos (sin umbral ni límite). */
  rangos?: RangosEnTexto;
  nivel?: string;
  /** Un lote de importación de la transacción: la versión nace con su lote y su aprobación previa. */
  importacionId?: number;
  /** Con `importacionId`: la aprobación previa que lleva la versión; sin valor, «Acta 1 de 2025». */
  aprobacionPrevia?: { documento: string; aprobadoPor: string; fecha: string };
  riesgoAsociado?: string;
  clasificacion?: "Estratégico" | "Operativo" | "Regulatorio";
  /** Clave de periodo desde la que se mide y rige la versión 1; sin valor, enero de 2026 en la periodicidad. */
  inicioMedicion?: string;
  aprobadaEn?: Date;
  soporteObligatorio?: boolean;
  /** Ids de usuario designados en cada función. */
  mide?: number[];
  analiza?: number[];
  seguimiento?: number[];
  elaboradaPor?: number;
  /** Lo que cambia de cada variable; sin valor, «Casos que cumplen» y «Casos evaluados», sin fuente ni límites. */
  variables?: Partial<Record<"A" | "B", VariableDePrueba>>;
  /** El máximo del resultado (límites del indicador); sin valor, ninguno. */
  resultadoMax?: string;
};

export type VariableDePrueba = {
  nombre?: string;
  descripcion?: string;
  fuente?: string;
  capturaMin?: string;
  capturaMax?: string;
};

/**
 * Inserta por SQL un indicador de forma «porcentaje» (`A / B * 100`) con su versión 1 y sus variables A y B. La versión
 * nace en borrador y, salvo con `estado: "borrador"`, se pasa a aprobada al final: los triggers de la 0011 rechazan
 * filas hijas bajo una versión aprobada. Quien aprueba es un usuario de Gerencia creado aquí.
 */
export async function indicadorDePrueba(
  tx: TransactionSql,
  o: OpcionesIndicadorDePrueba = {},
): Promise<IndicadorDePrueba> {
  consecutivo += 1;
  const codigo = `ZZ-IND-${Date.now() % 100_000_000}-${consecutivo}`;
  const aprobada = (o.estado ?? "activo") === "activo";
  const inicio = o.inicioMedicion ?? INICIO_POR_PERIODICIDAD[o.periodicidad ?? "mensual"];

  const procesoId =
    o.procesoId ?? Number((await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`)[0].id);
  const [proceso] = await tx`SELECT nombre FROM procesos WHERE id = ${procesoId}`;
  const elaboradaPor = o.elaboradaPor ?? (await usuarioDePrueba(tx, { rol: "admin_sgc" })).usuarioId;
  const clasificacion = o.clasificacion ?? "Operativo";
  const meta = o.meta === undefined ? "90" : o.meta;

  const [indicador] = await tx`INSERT INTO indicadores
      (codigo, proceso_id, estado, nivel_acceso, inicio_medicion, soporte_obligatorio, creado_por)
    VALUES (${codigo}, ${procesoId}, ${aprobada ? "activo" : "borrador"}, ${o.nivelAcceso ?? "general"},
      ${inicio}, ${o.soporteObligatorio ?? false}, ${elaboradaPor})
    RETURNING id`;
  const indicadorId = Number(indicador.id);

  // Como el flujo real (`crearIndicador`): sin factor fuera de la tasa y con el sufijo de la unidad del catálogo.
  const [version] = await tx`INSERT INTO indicador_versiones
      (indicador_id, numero, estado, tipo_cambio, nombre, proposito, tipo_id, tipo_nombre,
       clasificacion_id, clasificacion_nombre, proceso_nombre, origen_dato, calculo, forma, factor, formula,
       unidad_id, unidad_nombre, unidad_sufijo, decimales, periodicidad, tendencia, meta,
       semaforo_modo, umbral_atencion_pct, limite_critico, rangos, resultado_max, nivel, riesgo_asociado,
       importacion_id, aprobacion_previa_documento, aprobacion_previa_por, aprobacion_previa_fecha, creado_por)
    SELECT ${indicadorId}, 1, 'borrador', 'inicial', ${`Indicador de prueba ${codigo}`}, 'Medir el cumplimiento de la prueba',
      t.id, t.nombre, c.id, c.nombre, ${proceso.nombre as string}, 'manual', 'Porcentaje de cumplimiento', 'porcentaje', NULL, 'A / B * 100',
      un.id, un.nombre, un.sufijo, 1, ${o.periodicidad ?? "mensual"}, ${o.tendencia ?? "ascendente"}, ${meta},
      ${o.rangos ? "rangos" : (o.modo ?? "relativo")}, ${o.rangos || o.modo === "fijo" ? null : (o.umbralPct ?? 70)}, ${o.limite ?? null},
      ${o.rangos ? tx.json(o.rangos as never) : null}, ${o.resultadoMax ?? null}, ${o.nivel ?? null}, ${o.riesgoAsociado ?? null},
      ${o.importacionId ?? null}, ${o.importacionId ? (o.aprobacionPrevia?.documento ?? "Acta 1 de 2025") : null}, ${o.importacionId ? (o.aprobacionPrevia?.aprobadoPor ?? "Comité de calidad") : null},
      ${o.importacionId ? (o.aprobacionPrevia?.fecha ?? "2025-01-15") : null}, ${elaboradaPor}
    FROM tipos_indicador t, clasificaciones_indicador c, unidades_indicador un
    WHERE t.nombre = 'Eficacia' AND c.nombre = ${clasificacion} AND un.nombre = 'Porcentaje'
    RETURNING id`;
  const versionId = Number(version.id);
  // Quien escribe hijos y luego actualiza el padre lo toma antes (los triggers hijos lo leen con FOR SHARE).
  await tx`SELECT id FROM indicador_versiones WHERE id = ${versionId} FOR UPDATE`;

  const variables: Record<"A" | "B", number> = { A: 0, B: 0 };
  for (const [orden, letra, nombre] of [[1, "A", "Casos que cumplen"], [2, "B", "Casos evaluados"]] as const) {
    const x = o.variables?.[letra] ?? {};
    const [v] = await tx`INSERT INTO indicador_variables
        (version_id, letra, nombre, descripcion, fuente, captura_min, captura_max, consolidacion, origen, orden)
      VALUES (${versionId}, ${letra}, ${x.nombre ?? nombre}, ${x.descripcion ?? null}, ${x.fuente ?? null},
        ${x.capturaMin ?? null}, ${x.capturaMax ?? null}, 'suma', 'propia', ${orden}) RETURNING id`;
    variables[letra] = Number(v.id);
  }

  const designados: [string, number[] | undefined][] = [["mide", o.mide], ["analiza", o.analiza], ["seguimiento", o.seguimiento]];
  for (const [funcion, usuarios] of designados) {
    for (const usuarioId of usuarios ?? []) {
      await tx`INSERT INTO indicador_designados (indicador_id, usuario_id, funcion, creado_por)
        VALUES (${indicadorId}, ${usuarioId}, ${funcion}, ${elaboradaPor})`;
    }
  }

  if (aprobada) {
    const aprobadora = await usuarioDePrueba(tx, { rol: "gerencia" });
    const aprobadaEn = o.aprobadaEn ?? new Date();
    await tx`UPDATE indicador_versiones SET estado = 'aprobada', elaborada_por = ${elaboradaPor},
        elaborada_en = ${aprobadaEn}, huella = ${"0".repeat(64)}, rige_desde = ${inicio},
        aprobada_por = ${aprobadora.usuarioId}, aprobada_en = ${aprobadaEn}
      WHERE id = ${versionId}`;
  }

  return { id: indicadorId, codigo, versionId, variables, procesoId };
}

/** Un lote de importación con su evento «importado» (quién y cuándo), dentro de la transacción de la prueba. */
export async function loteImportado(tx: TransactionSql, d: { usuarioId: number; importadoEn: Date }): Promise<number> {
  const [l] = await tx`INSERT INTO importaciones_indicadores (cargado_por, cargado_en) VALUES (${d.usuarioId}, ${d.importadoEn}) RETURNING id`;
  await tx`INSERT INTO importacion_eventos (importacion_id, tipo, usuario_id, metodo, detalle, creado_en)
    VALUES (${l.id}, 'importado', ${d.usuarioId}, 'clave', '{}'::jsonb, ${d.importadoEn})`;
  return Number(l.id);
}

/**
 * Calla la pasada de los indicadores sobre lo que trae la base (la demo, el punto de control): marca como avisadas y
 * escaladas sus mediciones abiertas y deja sin inicio de medición a sus indicadores activos, para que no abra periodos
 * nuevos. `revisarVencimientos` los recorre todos y un test cuenta solo lo suyo. Se llama antes de crear los datos del
 * test, dentro de la transacción que se revierte.
 */
export async function silenciarIndicadores(tx: TransactionSql): Promise<void> {
  await tx`UPDATE mediciones SET aviso_previo_en = coalesce(aviso_previo_en, now()), aviso_vencido_en = coalesce(aviso_vencido_en, now()),
      escalado_en = coalesce(escalado_en, now())
    WHERE estado <> 'cerrada' AND (aviso_previo_en IS NULL OR aviso_vencido_en IS NULL OR escalado_en IS NULL)`;
  await tx`UPDATE indicadores SET inicio_medicion = NULL WHERE estado = 'activo' AND inicio_medicion IS NOT NULL`;
}

/**
 * Una versión 2 trimestral aprobada que rige desde `rigeDesde`, como la dejaría un cambio mayor de periodicidad, sin
 * quitar las mediciones abiertas de la periodicidad vieja: quedan «de otra periodicidad» (`esDeOtraPeriodicidad`).
 */
export async function versionTrimestral(
  tx: TransactionSql,
  d: { indicadorId: number; usuarioId: number; rigeDesde: string; aprobadaEn: Date },
): Promise<number> {
  const [v2] = await tx`INSERT INTO indicador_versiones (indicador_id, numero, estado, tipo_cambio, nombre, forma, formula, periodicidad,
      tendencia, meta, semaforo_modo, umbral_atencion_pct, unidad_sufijo, decimales, creado_por)
    VALUES (${d.indicadorId}, 2, 'borrador', 'mayor', 'Trimestral', 'porcentaje', 'A / B * 100', 'trimestral', 'ascendente', 90, 'relativo', 70,
      ' %', 1, ${d.usuarioId}) RETURNING id`;
  await tx`SELECT id FROM indicador_versiones WHERE id = ${v2.id} FOR UPDATE`;
  for (const [orden, letra] of [[1, "A"], [2, "B"]] as const) {
    await tx`INSERT INTO indicador_variables (version_id, letra, nombre, orden) VALUES (${v2.id}, ${letra}, ${letra}, ${orden})`;
  }
  await tx`UPDATE indicador_versiones SET estado = 'aprobada', elaborada_por = ${d.usuarioId}, huella = ${"1".repeat(64)},
      rige_desde = ${d.rigeDesde}, aprobada_por = ${d.usuarioId}, aprobada_en = ${d.aprobadaEn}
    WHERE id = ${v2.id}`;
  return Number(v2.id);
}
