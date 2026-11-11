/**
 * Ayudante de los tests del módulo de indicadores (Fase 14). Corre dentro de una transacción que se
 * revierte (`revertida`): lo que crea aquí no sobrevive al test.
 */
import type { TransactionSql } from "postgres";
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
       semaforo_modo, umbral_atencion_pct, creado_por)
    SELECT ${indicadorId}, 1, 'borrador', 'inicial', ${`Indicador de prueba ${codigo}`}, 'Medir el cumplimiento de la prueba',
      t.id, t.nombre, c.id, c.nombre, ${proceso.nombre as string}, 'manual', 'Porcentaje de cumplimiento', 'porcentaje', NULL, 'A / B * 100',
      un.id, un.nombre, un.sufijo, 1, ${o.periodicidad ?? "mensual"}, ${o.tendencia ?? "ascendente"}, ${meta},
      'relativo', ${o.umbralPct ?? 70}, ${elaboradaPor}
    FROM tipos_indicador t, clasificaciones_indicador c, unidades_indicador un
    WHERE t.nombre = 'Eficacia' AND c.nombre = ${clasificacion} AND un.nombre = 'Porcentaje'
    RETURNING id`;
  const versionId = Number(version.id);
  // Quien escribe hijos y luego actualiza el padre lo toma antes (los triggers hijos lo leen con FOR SHARE).
  await tx`SELECT id FROM indicador_versiones WHERE id = ${versionId} FOR UPDATE`;

  const variables: Record<"A" | "B", number> = { A: 0, B: 0 };
  for (const [orden, letra, nombre] of [[1, "A", "Casos que cumplen"], [2, "B", "Casos evaluados"]] as const) {
    const [v] = await tx`INSERT INTO indicador_variables (version_id, letra, nombre, consolidacion, origen, orden)
      VALUES (${versionId}, ${letra}, ${nombre}, 'suma', 'propia', ${orden}) RETURNING id`;
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
