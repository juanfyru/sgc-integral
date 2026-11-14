/**
 * Ayudante de los tests del módulo de indicadores (Fase 14). Corre dentro de una transacción que se
 * revierte (`revertida`): lo que crea aquí no sobrevive al test.
 */
import type { TransactionSql } from "postgres";
import { escribirFoto } from "@/db/consultas/indicadores/fotos";
import { versionDelPeriodo } from "@/db/consultas/indicadores/mediciones";
import { CALCULOS, calculoDe, type AlcanceDeCalculo, type ClaveDeCalculo } from "@/lib/indicadores/calculos/registro";
import { formulaDeForma } from "@/lib/indicadores/formula/formas";
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
  /**
   * Una versión automática (anexo 14B, §5.3): la forma, la fórmula, la tendencia y las variables del registro (origen
   * `automatica`). Aprobada, el indicador guarda el cálculo y el alcance, como `alPublicarVersion`; el alcance «proceso» es el
   * del indicador. Un cálculo sin B (un conteo) deja `variables.B` en 0.
   */
  calculo?: { clave: ClaveDeCalculo; alcance: AlcanceDeCalculo };
  /** El objetivo al que apunta la versión 1 (con su enunciado de hoy); sin valor, ninguno. */
  objetivoId?: number;
};

export type VariableDePrueba = {
  nombre?: string;
  descripcion?: string;
  fuente?: string;
  capturaMin?: string;
  capturaMax?: string;
};

/**
 * Libera, para la prueba, un cálculo y su alcance (con alcance «proceso», en ese proceso): deja sin cálculo a los
 * indicadores activos que lo tienen, como la demo, para que el índice `indicadores_calculo_unico` no choque con ellos. Solo
 * dentro de `revertida`: la transacción se revierte y la demo queda como estaba.
 */
export async function liberarCalculo(tx: TransactionSql, clave: ClaveDeCalculo, alcance: AlcanceDeCalculo, procesoId?: number): Promise<void> {
  if (alcance === "proceso" && procesoId === undefined) throw new Error("Con alcance «proceso», diga el proceso");
  await tx`UPDATE indicadores SET calculo = NULL, calculo_alcance = NULL
    WHERE estado = 'activo' AND calculo = ${clave} AND calculo_alcance = ${alcance}
      AND (calculo_alcance <> 'proceso' OR proceso_id = ${procesoId ?? 0})`;
}

/**
 * Inserta por SQL un indicador de forma «porcentaje» (`A / B * 100`) con su versión 1 y sus variables A y B. La versión
 * nace en borrador y, salvo con `estado: "borrador"`, se pasa a aprobada al final: los triggers de la 0011 rechazan
 * filas hijas bajo una versión aprobada. Quien aprueba es un usuario de Gerencia creado aquí. Solo dentro de `revertida`:
 * con `calculo`, antes libera ese cálculo y alcance (`liberarCalculo`).
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
  const calculo = o.calculo ? CALCULOS[o.calculo.clave] : null;
  const forma = calculo?.forma ?? "porcentaje";
  if (o.calculo && aprobada) await liberarCalculo(tx, o.calculo.clave, o.calculo.alcance, procesoId);

  const [indicador] = await tx`INSERT INTO indicadores
      (codigo, proceso_id, estado, nivel_acceso, inicio_medicion, soporte_obligatorio, creado_por)
    VALUES (${codigo}, ${procesoId}, ${aprobada ? "activo" : "borrador"}, ${o.nivelAcceso ?? "general"},
      ${inicio}, ${o.soporteObligatorio ?? false}, ${elaboradaPor})
    RETURNING id`;
  const indicadorId = Number(indicador.id);

  // Como el flujo real (`crearIndicador`): sin factor fuera de la tasa y con el sufijo de la unidad del catálogo.
  const [version] = await tx`INSERT INTO indicador_versiones
      (indicador_id, numero, estado, tipo_cambio, nombre, proposito, tipo_id, tipo_nombre,
       clasificacion_id, clasificacion_nombre, proceso_nombre, objetivo_id, objetivo_nombre, origen_dato, calculo, calculo_alcance, forma, factor, formula,
       unidad_id, unidad_nombre, unidad_sufijo, decimales, periodicidad, tendencia, meta,
       semaforo_modo, umbral_atencion_pct, limite_critico, rangos, resultado_max, nivel, riesgo_asociado,
       importacion_id, aprobacion_previa_documento, aprobacion_previa_por, aprobacion_previa_fecha, creado_por)
    SELECT ${indicadorId}, 1, 'borrador', 'inicial', ${`Indicador de prueba ${codigo}`}, 'Medir el cumplimiento de la prueba',
      t.id, t.nombre, c.id, c.nombre, ${proceso.nombre as string}, ${o.objetivoId ?? null},
      (SELECT enunciado FROM objetivos WHERE id = ${o.objetivoId ?? null}), ${calculo ? "automatico" : "manual"}, ${o.calculo?.clave ?? null},
      ${o.calculo?.alcance ?? null}, ${forma}, NULL, ${formulaDeForma(forma)},
      un.id, un.nombre, un.sufijo, 1, ${o.periodicidad ?? "mensual"}, ${calculo?.tendencia ?? o.tendencia ?? "ascendente"}, ${meta},
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
  const declaradas = calculo
    ? calculo.variables.map((v, i) => ({ orden: i + 1, letra: v.letra, nombre: v.nombre, descripcion: v.descripcion, consolidacion: v.consolidacion }))
    : ([[1, "A", "Casos que cumplen"], [2, "B", "Casos evaluados"]] as const).map(([orden, letra, nombre]) => ({
        orden,
        letra,
        nombre,
        descripcion: null,
        consolidacion: "suma",
      }));
  for (const d of declaradas) {
    const x: VariableDePrueba = calculo ? {} : (o.variables?.[d.letra] ?? {});
    const [v] = await tx`INSERT INTO indicador_variables
        (version_id, letra, nombre, descripcion, fuente, captura_min, captura_max, consolidacion, origen, orden)
      VALUES (${versionId}, ${d.letra}, ${x.nombre ?? d.nombre}, ${x.descripcion ?? d.descripcion}, ${x.fuente ?? (calculo ? "La calcula el sistema" : null)},
        ${x.capturaMin ?? null}, ${x.capturaMax ?? null}, ${d.consolidacion}, ${calculo ? "automatica" : "propia"}, ${d.orden}) RETURNING id`;
    variables[d.letra] = Number(v.id);
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
    if (o.calculo) {
      await tx`UPDATE indicadores SET calculo = ${o.calculo.clave}, calculo_alcance = ${o.calculo.alcance} WHERE id = ${indicadorId}`;
    }
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

/**
 * Una versión 2 automática aprobada que rige desde `rigeDesde`, como la deja pasar una ficha manual a automática (anexo
 * 14B, §5.3): la forma, la fórmula, la tendencia y las variables del registro, de la periodicidad dada, y el indicador con
 * su cálculo y su alcance. Las mediciones anteriores siguen con la versión 1. Solo dentro de `revertida`: antes libera el
 * cálculo (`liberarCalculo`).
 */
export async function versionAutomatica(
  tx: TransactionSql,
  d: { indicadorId: number; usuarioId: number; rigeDesde: string; aprobadaEn: Date; periodicidad: Periodicidad; calculo: { clave: ClaveDeCalculo; alcance: AlcanceDeCalculo } },
): Promise<number> {
  const calculo = CALCULOS[d.calculo.clave];
  const [i] = await tx`SELECT proceso_id FROM indicadores WHERE id = ${d.indicadorId}`;
  await liberarCalculo(tx, d.calculo.clave, d.calculo.alcance, Number(i.proceso_id));
  const [v2] = await tx`INSERT INTO indicador_versiones (indicador_id, numero, estado, tipo_cambio, nombre, origen_dato, calculo,
      calculo_alcance, forma, formula, periodicidad, tendencia, meta, semaforo_modo, umbral_atencion_pct, unidad_sufijo, decimales, creado_por)
    VALUES (${d.indicadorId}, 2, 'borrador', 'mayor', 'Automático', 'automatico', ${d.calculo.clave}, ${d.calculo.alcance}, ${calculo.forma},
      ${formulaDeForma(calculo.forma)}, ${d.periodicidad}, ${calculo.tendencia}, 90, 'relativo', 70, ' %', 1, ${d.usuarioId}) RETURNING id`;
  await tx`SELECT id FROM indicador_versiones WHERE id = ${v2.id} FOR UPDATE`;
  for (const [k, v] of calculo.variables.entries()) {
    await tx`INSERT INTO indicador_variables (version_id, letra, nombre, descripcion, fuente, consolidacion, origen, orden)
      VALUES (${v2.id}, ${v.letra}, ${v.nombre}, ${v.descripcion}, 'La calcula el sistema', ${v.consolidacion}, 'automatica', ${k + 1})`;
  }
  await tx`UPDATE indicador_versiones SET estado = 'aprobada', elaborada_por = ${d.usuarioId}, huella = ${"2".repeat(64)},
      rige_desde = ${d.rigeDesde}, aprobada_por = ${d.usuarioId}, aprobada_en = ${d.aprobadaEn}
    WHERE id = ${v2.id}`;
  await tx`UPDATE indicadores SET calculo = ${d.calculo.clave}, calculo_alcance = ${d.calculo.alcance} WHERE id = ${d.indicadorId}`;
  return Number(v2.id);
}

/**
 * La foto del sistema (anexo 14B, §5.4) con los valores que pide la prueba, sin esperar su momento ni tomar el cálculo: la
 * escribe `escribirFoto`, lo mismo que escribe `tomarFotos` (valores sin quien los reportó, la medición reportada y
 * fotografiada a `ahora`, la fecha límite de un cálculo de flujo contada desde la foto y el cálculo único con el evento
 * `foto`, sin usuario).
 */
export async function fotoDePrueba(tx: TransactionSql, medicionId: number, valores: Partial<Record<"A" | "B", string>>, ahora: Date): Promise<void> {
  const [m] = await tx`SELECT m.id, m.indicador_id, m.periodo, m.historica, i.plazo_reporte_dias
    FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id WHERE m.id = ${medicionId} FOR UPDATE OF m`;
  const version = await versionDelPeriodo(tx, Number(m.indicador_id), m.periodo as string);
  const definicion = version?.calculoAutomatico ? calculoDe(version.calculoAutomatico.clave) : null;
  if (!version || !definicion) throw new Error("La foto de prueba es solo para un periodo que calcula el sistema");
  const foto = { valores: Object.fromEntries(Object.entries(valores).filter((e): e is [string, string] => e[1] !== undefined)) };
  await escribirFoto(
    tx,
    { id: medicionId, historica: m.historica === true },
    { version, definicion, alcance: version.calculoAutomatico!.alcance, plazoDias: Number(m.plazo_reporte_dias), foto, ahora },
  );
}
