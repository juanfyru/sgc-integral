/**
 * Ayudante de los tests del módulo de indicadores (Fase 14). Corre dentro de una transacción que se
 * revierte (`revertida`): lo que crea aquí no sobrevive al test.
 */
import type { TransactionSql } from "postgres";
import { maestroDeCategorias } from "@/db/consultas/indicadores/dimensiones";
import { escribirFoto } from "@/db/consultas/indicadores/fotos";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { asegurarMediciones, escribirTotal, reportar, versionDelPeriodo, type FilaDeReporte } from "@/db/consultas/indicadores/mediciones";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { CALCULOS, CLAVES_DE_CALCULO, calculoDe, type AlcanceDeCalculo, type ClaveDeCalculo } from "@/lib/indicadores/calculos/registro";
import { listaDelPeriodo } from "@/lib/indicadores/categorias";
import { formulaDeForma } from "@/lib/indicadores/formula/formas";
import { CERO } from "@/lib/indicadores/formula/fraccion";
import { contiene, fechaLimiteDeReporte } from "@/lib/indicadores/periodos";
import type { RangosEnTexto } from "@/lib/indicadores/rangos";
import { MOTIVO_NADA_QUE_MEDIR, type Consolidacion, type Periodicidad, type Tendencia, type Toma } from "@/lib/indicadores/tipos";
import { fechaLimite } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
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
  /** La fórmula de la versión 1, tal cual (sin validarla); sin valor, la de la forma «porcentaje». */
  formula?: string;
  /**
   * Una versión automática (anexo 14B, §5.3): la forma, la fórmula, la tendencia y las variables del registro (origen
   * `automatica`). Aprobada, el indicador guarda el cálculo y el alcance, como `alPublicarVersion`; el alcance «proceso» es el
   * del indicador. Un cálculo sin B (un conteo) deja `variables.B` en 0.
   */
  calculo?: { clave: ClaveDeCalculo; alcance: AlcanceDeCalculo };
  /** El objetivo al que apunta la versión 1 (con su enunciado de hoy); sin valor, ninguno. */
  objetivoId?: number;
  /**
   * El ente al que se reporta la versión 1 (anexo 14B, §8). Aprobada, el indicador lo cuenta desde `desde` (sin valor, desde
   * la aprobación), como lo dejaría `alPublicarVersion`; con `desde: null`, como una ficha aprobada antes de la 14B.
   */
  ente?: { nombre: string; periodicidad: Periodicidad; plazoDias: number; desde?: Date | null };
  /** Las normas que cita la versión 1, con el nombre de hoy (anexo 14B, §9); sin valor, ninguna. */
  normaIds?: number[];
  /** La dimensión por la que se desagrega la versión 1, con su nombre de hoy (anexo 14C, §5.2); sin valor, ninguna. */
  dimensionId?: number;
};

export type VariableDePrueba = {
  nombre?: string;
  descripcion?: string;
  fuente?: string;
  capturaMin?: string;
  capturaMax?: string;
  /**
   * El dato compartido que cita la variable (anexo 14C, §4.2): origen «compartida» y, como lo escribe el servidor, todo lo
   * que la variable firma del dato (nombre, descripción, fuente, unidad, «cómo se junta», límites, «admite negativos» y su
   * periodicidad), sin importar lo demás que traiga esta variable. La periodicidad de la ficha debe contener la del dato.
   */
  datoId?: number;
  /**
   * El indicador del que sale la variable (anexo 14C, §6.1): origen «indicador», con lo que se toma (sin valor, su valor),
   * «cómo se junta» en «último» y, como lo escribe el servidor, el código del indicador y el nombre de su ficha vigente.
   */
  indicadorOrigenId?: number;
  toma?: Toma;
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
 * Sin fichas activas de los cálculos con tarjeta de Vigencia (`documental` en el registro; anexo 14B, §6): de la entidad
 * y, con alcance «proceso», de los procesos dados. Para que una prueba que lee las metas de Configuración documental, el
 * umbral de conformidad o las tarjetas de Vigencia no dependa de las fichas automáticas que traiga la demo. Solo dentro de
 * `revertida`.
 */
export async function sinFichasDocumentales(tx: TransactionSql, procesos: number[] = []): Promise<void> {
  for (const clave of CLAVES_DE_CALCULO) {
    if (CALCULOS[clave].documental === null) continue;
    await liberarCalculo(tx, clave, "entidad");
    if (!CALCULOS[clave].alcances.includes("proceso")) continue;
    for (const p of procesos) await liberarCalculo(tx, clave, "proceso", p);
  }
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
       importacion_id, aprobacion_previa_documento, aprobacion_previa_por, aprobacion_previa_fecha,
       ente, periodicidad_externa, plazo_externo_dias, dimension_id, dimension_nombre, creado_por)
    SELECT ${indicadorId}, 1, 'borrador', 'inicial', ${`Indicador de prueba ${codigo}`}, 'Medir el cumplimiento de la prueba',
      t.id, t.nombre, c.id, c.nombre, ${proceso.nombre as string}, ${o.objetivoId ?? null},
      (SELECT enunciado FROM objetivos WHERE id = ${o.objetivoId ?? null}), ${calculo ? "automatico" : "manual"}, ${o.calculo?.clave ?? null},
      ${o.calculo?.alcance ?? null}, ${forma}, NULL, ${o.formula ?? formulaDeForma(forma)},
      un.id, un.nombre, un.sufijo, 1, ${o.periodicidad ?? "mensual"}, ${calculo?.tendencia ?? o.tendencia ?? "ascendente"}, ${meta},
      ${o.rangos ? "rangos" : (o.modo ?? "relativo")}, ${o.rangos || o.modo === "fijo" ? null : (o.umbralPct ?? 70)}, ${o.limite ?? null},
      ${o.rangos ? tx.json(o.rangos as never) : null}, ${o.resultadoMax ?? null}, ${o.nivel ?? null}, ${o.riesgoAsociado ?? null},
      ${o.importacionId ?? null}, ${o.importacionId ? (o.aprobacionPrevia?.documento ?? "Acta 1 de 2025") : null}, ${o.importacionId ? (o.aprobacionPrevia?.aprobadoPor ?? "Comité de calidad") : null},
      ${o.importacionId ? (o.aprobacionPrevia?.fecha ?? "2025-01-15") : null},
      ${o.ente?.nombre ?? null}, ${o.ente?.periodicidad ?? null}, ${o.ente?.plazoDias ?? null},
      ${o.dimensionId ?? null}, (SELECT nombre FROM dimensiones WHERE id = ${o.dimensionId ?? null}), ${elaboradaPor}
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
    const fila = {
      version_id: versionId,
      letra: d.letra,
      orden: d.orden,
      origen: calculo ? "automatica" : "propia",
      nombre: x.nombre ?? d.nombre,
      descripcion: x.descripcion ?? d.descripcion,
      fuente: x.fuente ?? (calculo ? "La calcula el sistema" : null),
      unidad: null as string | null,
      consolidacion: d.consolidacion as string,
      captura_min: x.capturaMin ?? null,
      captura_max: x.capturaMax ?? null,
      admite_negativos: false,
      variable_compartida_id: null as number | null,
      dato_periodicidad: null as string | null,
      indicador_origen_id: null as number | null,
      toma: null as Toma | null,
      origen_codigo: null as string | null,
      origen_nombre: null as string | null,
    };
    if (x.datoId !== undefined) {
      // Como `guardarBorrador`: el catálogo manda sobre lo que la variable firma del dato.
      const [dato] = await tx`SELECT nombre, descripcion, fuente, unidad, periodicidad, consolidacion, captura_min, captura_max, admite_negativos
        FROM variables_compartidas WHERE id = ${x.datoId}`;
      if (!contiene(o.periodicidad ?? "mensual", dato.periodicidad as Periodicidad)) {
        throw new Error(`Una ficha ${o.periodicidad ?? "mensual"} no puede citar un dato ${dato.periodicidad as string}`);
      }
      Object.assign(fila, {
        origen: "compartida",
        nombre: dato.nombre,
        descripcion: dato.descripcion,
        fuente: dato.fuente,
        unidad: dato.unidad,
        consolidacion: dato.consolidacion,
        captura_min: dato.captura_min,
        captura_max: dato.captura_max,
        admite_negativos: dato.admite_negativos,
        variable_compartida_id: x.datoId,
        dato_periodicidad: dato.periodicidad,
      });
    } else if (x.indicadorOrigenId !== undefined) {
      const [componente] = await tx`SELECT i.codigo, v.nombre FROM indicadores i
        JOIN indicador_versiones v ON v.indicador_id = i.id AND v.estado = 'aprobada'
        WHERE i.id = ${x.indicadorOrigenId} ORDER BY v.numero DESC LIMIT 1`;
      if (!componente) throw new Error("El indicador de origen no tiene una ficha aprobada");
      Object.assign(fila, {
        origen: "indicador",
        consolidacion: "ultimo",
        indicador_origen_id: x.indicadorOrigenId,
        toma: x.toma ?? "valor",
        origen_codigo: componente.codigo,
        origen_nombre: componente.nombre,
      });
    }
    const [v] = await tx`INSERT INTO indicador_variables ${tx(fila)} RETURNING id`;
    variables[d.letra] = Number(v.id);
  }

  if (o.normaIds && o.normaIds.length > 0) {
    await tx`INSERT INTO indicador_normas (version_id, norma_id, norma_nombre)
      SELECT ${versionId}, n.id, concat_ws(' ', tn.nombre, n.numero, 'de', n.anio::text)
      FROM normas n JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
      WHERE n.id = ANY(${o.normaIds}) ORDER BY n.id`;
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
    if (o.ente && o.ente.desde !== null) {
      await tx`UPDATE indicadores SET ente_desde = ${o.ente.desde ?? aprobadaEn} WHERE id = ${indicadorId}`;
    }
  }

  return { id: indicadorId, codigo, versionId, variables, procesoId };
}

/**
 * Inserta por SQL un dato compartido activo del catálogo (anexo 14C, §4.1), sin periodos, con sus responsables. Sin valor:
 * un nombre único, mensual, se suma, plazo de 10 días, sin límites de captura, sin negativos y sin dimensión. Solo dentro
 * de `revertida`.
 */
export async function datoDePrueba(
  tx: TransactionSql,
  d: {
    procesoId: number;
    nombre?: string;
    periodicidad?: Periodicidad;
    consolidacion?: Consolidacion;
    dimensionId?: number;
    plazoReporteDias?: number;
    capturaMin?: string;
    capturaMax?: string;
    admiteNegativos?: boolean;
    responsables?: number[];
  },
): Promise<number> {
  consecutivo += 1;
  const [dato] = await tx`INSERT INTO variables_compartidas (proceso_id, nombre, periodicidad, consolidacion, plazo_reporte_dias, dimension_id,
      captura_min, captura_max, admite_negativos)
    VALUES (${d.procesoId}, ${d.nombre ?? `ZZ Dato ${Date.now() % 100_000_000}-${consecutivo}`}, ${d.periodicidad ?? "mensual"},
      ${d.consolidacion ?? "suma"}, ${d.plazoReporteDias ?? 10}, ${d.dimensionId ?? null}, ${d.capturaMin ?? null}, ${d.capturaMax ?? null},
      ${d.admiteNegativos ?? false})
    RETURNING id`;
  for (const usuarioId of d.responsables ?? []) {
    await tx`INSERT INTO variable_responsables (variable_id, usuario_id) VALUES (${dato.id}, ${usuarioId})`;
  }
  return Number(dato.id);
}

/**
 * Inserta por SQL un periodo del dato (anexo 14C, §4.3), como lo abriría `asegurarPeriodosDeDatos` a `ahora`: su fecha
 * límite es el fin del periodo más el plazo del dato o, si ya pasó, `ahora` más el plazo (no nace vencido); con dimensión,
 * su lista de categorías. Sin `estado`, `reportado` si trae `valor` y `pendiente` si no; reportado o cerrado, con `valor`
 * (sin él, 0), sin quien lo reportó y a `ahora`. Solo dentro de `revertida`. Ojo: un pendiente que ningún indicador pide
 * lo quita la siguiente pasada (`asegurarPeriodosDeDatos` también recorre los datos que solo tienen pendientes).
 */
export async function periodoDeDatoDePrueba(
  tx: TransactionSql,
  d: { datoId: number; periodo: string; valor?: string; estado?: "pendiente" | "reportado" | "cerrado"; ahora: Date },
): Promise<number> {
  const zona = zonaHoraria();
  const periodo = periodoDe(d.periodo, zona);
  if (!periodo) throw new Error(`El periodo «${d.periodo}» no existe`);
  const [dato] = await tx`SELECT plazo_reporte_dias, dimension_id FROM variables_compartidas WHERE id = ${d.datoId}`;
  const plazo = Number(dato.plazo_reporte_dias);
  const limite = fechaLimiteDeReporte(periodo, plazo, zona);
  const vence = limite.getTime() < d.ahora.getTime() ? fechaLimite(d.ahora, plazo, zona) : limite;
  const categorias =
    dato.dimension_id === null ? null : listaDelPeriodo(await maestroDeCategorias(tx, Number(dato.dimension_id)), periodo);
  const estado = d.estado ?? (d.valor === undefined ? "pendiente" : "reportado");
  const conValor = estado !== "pendiente";
  const [fila] = await tx`INSERT INTO variable_valores (variable_id, periodo, desde, hasta, vence_en, estado, valor, reportado_en, categorias)
    VALUES (${d.datoId}, ${d.periodo}, ${periodo.desde}, ${periodo.hasta}, ${vence}, ${estado}, ${conValor ? (d.valor ?? "0") : null},
      ${conValor ? d.ahora : null}, ${categorias === null ? null : tx.json(categorias as never)})
    RETURNING id`;
  return Number(fila.id);
}

/** Un lote de importación con su evento «importado» (quién y cuándo), dentro de la transacción de la prueba. */
export async function loteImportado(tx: TransactionSql, d: { usuarioId: number; importadoEn: Date }): Promise<number> {
  const [l] = await tx`INSERT INTO importaciones_indicadores (cargado_por, cargado_en) VALUES (${d.usuarioId}, ${d.importadoEn}) RETURNING id`;
  await tx`INSERT INTO importacion_eventos (importacion_id, tipo, usuario_id, metodo, detalle, creado_en)
    VALUES (${l.id}, 'importado', ${d.usuarioId}, 'clave', '{}'::jsonb, ${d.importadoEn})`;
  return Number(l.id);
}

/**
 * Calla la pasada de los indicadores (y el cierre) sobre lo que trae la base (la demo, el punto de control): marca como
 * avisadas y escaladas sus mediciones abiertas; da por fotografiadas (`foto_en`, sin valores) las de sus automáticos que
 * esperan la foto, para que `tomarFotos` no las calcule (anexo 14B, §5.4); marca como avisadas y escaladas sus constancias
 * de envío pendientes, sus revisiones por cambio de norma pendientes (anexo 14B, §9) y los periodos pendientes de sus datos
 * compartidos (anexo 14C, §4.4); y deja sin inicio de medición a sus indicadores activos, para que no abra periodos nuevos
 * ni constancias nuevas (`asegurarConstancias` solo mira los que tienen inicio) ni periodos nuevos de un dato
 * (`asegurarPeriodosDeDatos`, tampoco), y para que la propagación no les copie nada (`propagar` tampoco: anexo 14C, §3.3).
 * `revisarVencimientos` los recorre todos y un test cuenta solo lo suyo. Se llama antes de crear los datos del test,
 * dentro de la transacción que se revierte.
 */
export async function silenciarIndicadores(tx: TransactionSql): Promise<void> {
  await tx`UPDATE mediciones SET aviso_previo_en = coalesce(aviso_previo_en, now()), aviso_vencido_en = coalesce(aviso_vencido_en, now()),
      escalado_en = coalesce(escalado_en, now())
    WHERE estado <> 'cerrada' AND (aviso_previo_en IS NULL OR aviso_vencido_en IS NULL OR escalado_en IS NULL)`;
  await tx`UPDATE variable_valores SET aviso_previo_en = coalesce(aviso_previo_en, now()), aviso_vencido_en = coalesce(aviso_vencido_en, now()),
      escalado_en = coalesce(escalado_en, now())
    WHERE estado = 'pendiente' AND (aviso_previo_en IS NULL OR aviso_vencido_en IS NULL OR escalado_en IS NULL)`;
  await tx`UPDATE reportes_externos SET aviso_vencido_en = coalesce(aviso_vencido_en, now()), escalado_en = coalesce(escalado_en, now())
    WHERE estado = 'pendiente' AND (aviso_vencido_en IS NULL OR escalado_en IS NULL)`;
  await tx`UPDATE impactos_indicadores SET aviso_vencido_en = coalesce(aviso_vencido_en, now()), escalado_en = coalesce(escalado_en, now())
    WHERE estado = 'pendiente' AND (aviso_vencido_en IS NULL OR escalado_en IS NULL)`;
  // Lo que `tomarFotos` busca: abierta, sin foto, sin datos ni «no aplica», de un indicador con alguna versión automática.
  await tx`UPDATE mediciones m SET foto_en = now()
    WHERE m.estado = 'abierta' AND m.foto_en IS NULL AND m.reportada_en IS NULL AND NOT m.no_aplica
      AND EXISTS (SELECT 1 FROM indicador_versiones v
        WHERE v.indicador_id = m.indicador_id AND v.estado = 'aprobada' AND v.origen_dato = 'automatico')`;
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
 * La versión siguiente del indicador, aprobada y rigiendo desde `rigeDesde`, como la deja aprobar un cambio menor o mayor,
 * sin tocar las mediciones: de la periodicidad dada (sin valor, mensual), forma «porcentaje» (`A / B * 100`, o la fórmula
 * dada, tal cual; meta 90, umbral 70) y sus variables A y B, propias (con el nombre dado o su letra) o, con `datoId`, de un
 * dato compartido, con lo que firman del dato (su nombre, su periodicidad y «cómo se junta»), como `indicadorDePrueba`; o,
 * con `indicadorOrigenId`, tomadas de otro indicador (lo que se toma, sin valor, su valor; «cómo se junta» en «último»).
 * Solo dentro de `revertida`.
 */
export async function versionNueva(
  tx: TransactionSql,
  d: {
    indicadorId: number;
    usuarioId: number;
    tipoCambio: "menor" | "mayor";
    rigeDesde: string;
    aprobadaEn: Date;
    periodicidad?: Periodicidad;
    formula?: string;
    variables?: Partial<Record<"A" | "B", { nombre?: string; datoId?: number; indicadorOrigenId?: number; toma?: Toma }>>;
    /** La dimensión por la que se desagrega, con su nombre de hoy (anexo 14C, §5.2); sin valor, ninguna. */
    dimensionId?: number;
    /** La meta (sin valor, 90); con `limite`, Crítico por debajo de él («fijo») en vez del umbral relativo de 70. */
    meta?: string;
    limite?: string;
  },
): Promise<{ versionId: number; variables: { A: number; B: number } }> {
  const [{ numero }] = await tx`SELECT coalesce(max(numero), 0) + 1 AS numero FROM indicador_versiones WHERE indicador_id = ${d.indicadorId}`;
  const [v] = await tx`INSERT INTO indicador_versiones (indicador_id, numero, estado, tipo_cambio, nombre, forma, formula, periodicidad,
      tendencia, meta, semaforo_modo, umbral_atencion_pct, limite_critico, unidad_sufijo, decimales, dimension_id, dimension_nombre, creado_por)
    VALUES (${d.indicadorId}, ${numero}, 'borrador', ${d.tipoCambio}, ${`Versión ${numero}`}, 'porcentaje', ${d.formula ?? "A / B * 100"},
      ${d.periodicidad ?? "mensual"}, 'ascendente', ${d.meta ?? "90"}, ${d.limite ? "fijo" : "relativo"}, ${d.limite ? null : 70},
      ${d.limite ?? null}, ' %', 1, ${d.dimensionId ?? null},
      (SELECT nombre FROM dimensiones WHERE id = ${d.dimensionId ?? null}), ${d.usuarioId}) RETURNING id`;
  const versionId = Number(v.id);
  await tx`SELECT id FROM indicador_versiones WHERE id = ${versionId} FOR UPDATE`;
  const variables: Record<"A" | "B", number> = { A: 0, B: 0 };
  for (const [orden, letra] of [[1, "A"], [2, "B"]] as const) {
    const x = d.variables?.[letra] ?? {};
    const [dato] =
      x.datoId === undefined ? [] : await tx`SELECT nombre, periodicidad, consolidacion FROM variables_compartidas WHERE id = ${x.datoId}`;
    const [fila] = dato
      ? await tx`INSERT INTO indicador_variables (version_id, letra, nombre, orden, origen, consolidacion, variable_compartida_id, dato_periodicidad)
          VALUES (${versionId}, ${letra}, ${dato.nombre as string}, ${orden}, 'compartida', ${dato.consolidacion as string}, ${x.datoId!},
            ${dato.periodicidad as string}) RETURNING id`
      : x.indicadorOrigenId !== undefined
        ? await tx`INSERT INTO indicador_variables (version_id, letra, nombre, orden, origen, consolidacion, indicador_origen_id, toma,
              origen_codigo, origen_nombre)
            SELECT ${versionId}, ${letra}, ${x.nombre ?? letra}, ${orden}, 'indicador', 'ultimo', i.id, ${x.toma ?? "valor"}, i.codigo, v.nombre
            FROM indicadores i JOIN indicador_versiones v ON v.indicador_id = i.id AND v.estado = 'aprobada'
            WHERE i.id = ${x.indicadorOrigenId} ORDER BY v.numero DESC LIMIT 1
            RETURNING id`
        : await tx`INSERT INTO indicador_variables (version_id, letra, nombre, orden) VALUES (${versionId}, ${letra}, ${x.nombre ?? letra}, ${orden})
            RETURNING id`;
    variables[letra] = Number(fila.id);
  }
  await tx`UPDATE indicador_versiones SET estado = 'aprobada', elaborada_por = ${d.usuarioId}, huella = ${"3".repeat(64)},
      rige_desde = ${d.rigeDesde}, aprobada_por = ${d.usuarioId}, aprobada_en = ${d.aprobadaEn}
    WHERE id = ${versionId}`;
  return { versionId, variables };
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
 * fotografiada a `ahora`, la fecha límite contada desde la foto si pide un análisis y llegó con el plazo vencido, y el
 * cálculo único con el evento `foto`, sin usuario).
 */
export async function fotoDePrueba(tx: TransactionSql, medicionId: number, valores: Partial<Record<"A" | "B", string>>, ahora: Date): Promise<void> {
  const [m] = await tx`SELECT m.id, m.indicador_id, m.periodo, m.historica, m.vence_en, i.plazo_reporte_dias
    FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id WHERE m.id = ${medicionId} FOR UPDATE OF m`;
  const version = await versionDelPeriodo(tx, Number(m.indicador_id), m.periodo as string);
  const definicion = version?.calculoAutomatico ? calculoDe(version.calculoAutomatico.clave) : null;
  if (!version || !definicion) throw new Error("La foto de prueba es solo para un periodo que calcula el sistema");
  const foto = { valores: Object.fromEntries(Object.entries(valores).filter((e): e is [string, string] => e[1] !== undefined)) };
  await escribirFoto(
    tx,
    { id: medicionId, historica: m.historica === true, venceEn: new Date(m.vence_en as string) },
    { version, definicion, alcance: version.calculoAutomatico!.alcance, plazoDias: Number(m.plazo_reporte_dias), foto, ahora },
  );
}

/**
 * Inserta por SQL una dimensión activa con sus categorías activas, en ese orden y con `creado_en` un año atrás, para que
 * entren a cualquier periodo de prueba (anexo 14C, §5.1). Solo dentro de `revertida`.
 */
export async function dimensionDePrueba(
  tx: TransactionSql,
  nombre: string,
  categorias: string[],
): Promise<{ id: number; categorias: number[] }> {
  const [dimension] = await tx`INSERT INTO dimensiones (nombre, orden)
    VALUES (${nombre}, (SELECT coalesce(max(orden), 0) + 1 FROM dimensiones)) RETURNING id`;
  const ids: number[] = [];
  for (const [i, categoria] of categorias.entries()) {
    const [c] = await tx`INSERT INTO dimension_categorias (dimension_id, nombre, orden, creado_en)
      VALUES (${dimension.id}, ${categoria}, ${i + 1}, now() - interval '1 year') RETURNING id`;
    ids.push(Number(c.id));
  }
  return { id: Number(dimension.id), categorias: ids };
}

/** Las seis sedes de la maqueta 9 de la 14C y el motivo de la que no aplica. */
export const SEDES_DE_MAQUETA = ["Sede principal", "Puesto de salud 1", "Puesto de salud 2", "Puesto de salud 3", "Puesto de salud 4", "Puesto de salud 5"];
export const OBRAS = "Cerrado por obras todo octubre.";

/**
 * Las filas de la rejilla de la maqueta 9 de la 14C para las categorías `ids`, en ese orden: 182/200, 43/50, 39/50, 11/20
 * (Crítico), 0/0 («Sin casos») y la sexta «No aplica» con `OBRAS`. `principal` cambia el numerador de la primera.
 */
export function filasDeMaqueta(ids: readonly number[], principal = "182"): FilaDeReporte[] {
  return [
    { categoriaId: ids[0], valores: { A: principal, B: "200" } },
    { categoriaId: ids[1], valores: { A: "43", B: "50" } },
    { categoriaId: ids[2], valores: { A: "39", B: "50" } },
    { categoriaId: ids[3], valores: { A: "11", B: "20" } },
    { categoriaId: ids[4], valores: { A: "0", B: "0" } },
    { categoriaId: ids[5], valores: {}, noAplica: OBRAS },
  ];
}

/**
 * Un trimestral de 2026 desagregado por una dimensión nueva con las seis sedes de la maqueta 9 de la 14C (`categorias` cambia
 * sus nombres), meta 85 y Crítico por debajo de 70, con quien lo mide; abre sus periodos a `ahora` y reporta por la rejilla
 * los de `reportados` (periodo → numerador de la primera sede, `filasDeMaqueta`). Solo dentro de `revertida`.
 */
export async function desagregadoDePrueba(
  tx: TransactionSql,
  d: { procesoId: number; ahora: Date; aprobadaEn: Date; reportados: Record<string, string>; categorias?: string[] },
): Promise<{
  ind: IndicadorDePrueba;
  quien: SesionFlujo;
  dimension: { id: number; nombre: string; categorias: number[] };
  mediciones: Record<string, number>;
}> {
  consecutivo += 1;
  const nombre = `Sede ${Date.now() % 100_000_000}-${consecutivo}`;
  const dimension = await dimensionDePrueba(tx, nombre, d.categorias ?? SEDES_DE_MAQUETA);
  const quien = await usuarioDePrueba(tx, { rol: "consulta" });
  const ind = await indicadorDePrueba(tx, {
    procesoId: d.procesoId,
    periodicidad: "trimestral",
    inicioMedicion: "2026-T1",
    aprobadaEn: d.aprobadaEn,
    meta: "85",
    modo: "fijo",
    limite: "70",
    dimensionId: dimension.id,
    mide: [quien.usuarioId],
    analiza: [quien.usuarioId],
    variables: { A: { nombre: "Pacientes con manejo adherente" }, B: { nombre: "Pacientes auditados" } },
  });
  await asegurarMediciones({ sql: tx, ahora: d.ahora, indicadorId: ind.id });
  const mediciones: Record<string, number> = {};
  for (const [periodo, principal] of Object.entries(d.reportados)) {
    const [m] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = ${periodo}`;
    mediciones[periodo] = Number(m.id);
    await reportar(
      quien,
      { medicionId: Number(m.id), valores: {}, filas: filasDeMaqueta(dimension.categorias, principal), parcial: false, confirmado: true },
      { sql: tx, ahora: d.ahora },
    );
  }
  return { ind, quien, dimension: { ...dimension, nombre }, mediciones };
}

/**
 * Deja la medición `periodo` de un desagregado de `desagregadoDePrueba` como la deja la propagación cuando no hay nada que
 * medir (anexo 14C, §5.7): las cinco primeras sedes en 0 ÷ 0 («Sin casos»), la sexta «No aplica», el total en cero escrito por
 * el sistema y la medición reportada y «No aplica» con `MOTIVO_NADA_QUE_MEDIR`. Devuelve su id. Solo dentro de `revertida`.
 */
export async function nadaQueMedir(tx: TransactionSql, quien: SesionFlujo, indicadorId: number, categorias: readonly number[], periodo: string): Promise<number> {
  const [m] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${indicadorId} AND periodo = ${periodo}`;
  const medicionId = Number(m.id);
  const filas = filasDeMaqueta(categorias).map((f, i) => (i < 5 ? { categoriaId: f.categoriaId, valores: { A: "0", B: "0" } } : f));
  await reportar(quien, { medicionId, valores: {}, filas, parcial: true, confirmado: true }, { sql: tx });
  const version = (await versionDelPeriodo(tx, indicadorId, periodo))!;
  await escribirTotal(tx, medicionId, version, { A: CERO, B: CERO }, new Date());
  await tx`UPDATE mediciones SET no_aplica = true, no_aplica_motivo = ${MOTIVO_NADA_QUE_MEDIR}, reportada_por = ${quien.usuarioId}, reportada_en = now()
    WHERE id = ${medicionId}`;
  return medicionId;
}
