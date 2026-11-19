/**
 * Lo que comparten el registro de un hallazgo y las salidas de la marca «Requiere acción de mejora» de una medición (Fase 15B,
 * anexo §6): el candado de la medición, las condiciones de SQL, la lectura de una medición marcada, quién puede resolverla y la
 * salida que deja el registro al nacer. Aparte de `marcas.ts`, que lo reexporta, para que `registro.ts` lo importe sin ciclo
 * (`marcas.ts` importa `registrarOcurrencia`). Lee `mediciones` e `indicadores` por SQL: no importa nada de
 * `src/db/consultas/indicadores/` (`tests/indicadores-ciclos.test.ts`).
 */
import type { TransactionSql } from "postgres";
import type { Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { deTexto } from "@/lib/indicadores/formula/fraccion";
import type { RangosEnTexto } from "@/lib/indicadores/rangos";
import { reglaDeTexto } from "@/lib/indicadores/reporte";
import { resultadoFrenteAMeta, textoMeta, textoValor, type Unidad } from "@/lib/indicadores/textos";
import type { ModoSemaforo, Semaforo, Tendencia } from "@/lib/indicadores/tipos";
import { filtroIndicadores } from "@/lib/alcance";
import { fraseDelResultado, MARCA_YA_DECIDIDA, tituloDeLaMarca, type MarcaSinDecidir } from "@/lib/mejoramiento/marcas";
import { ErrorMejora } from "@/lib/mejoramiento/tipos";
import { puede } from "@/lib/permisos";
import { zonaHoraria } from "@/lib/zona-horaria";

/** El mayor id que admite la llave del candado (`::int`): una medición con un id mayor no existe en la tabla de `int4`. */
const MAXIMO_INT4 = 2_147_483_647;

/** Un id de medición que puede existir y entra en la llave del candado. */
export const idDeMedicionValido = (id: number) => Number.isSafeInteger(id) && id > 0 && id <= MAXIMO_INT4;

/**
 * El candado de la medición (anexo §6.4): serializa las decisiones sobre una misma marca, que se vuelven a comprobar con él tomado.
 * Lo toman `resolverConOcurrencia` y `resolverNoRequiere` como su primera sentencia, y `registrarHallazgo` justo después del plan,
 * antes de cualquier otro candado. Su llave viene de lo que llega, sin leer nada antes. Un id fuera de `int4` no tiene medición: no
 * se toma (el `::int` daría un error crudo) y la lectura que sigue no la encuentra.
 */
export async function bloquearMarca(tx: TransactionSql, medicionId: number): Promise<void> {
  if (!idDeMedicionValido(medicionId)) return;
  await tx`SELECT pg_advisory_xact_lock(hashtext('sgc.mejora.marca'), ${medicionId}::int)`;
}

/**
 * La medición `m` tiene una salida en vigor (anexo §6.1): un «no requiere», o una que apunta a un hallazgo (nuevo, o el de una
 * ocurrencia) que no terminó rechazado ni anulado. A lo sumo una: lo garantiza el candado de la medición.
 */
export function salidaEnVigor(sql: Cliente) {
  return sql`EXISTS (SELECT 1 FROM mejora_marcas sv_k LEFT JOIN mejora_hallazgos sv_h ON sv_h.id = sv_k.hallazgo_id
    WHERE sv_k.medicion_id = m.id AND (sv_k.salida = 'no_requiere' OR sv_h.estado NOT IN ('rechazado', 'anulado')))`;
}

/**
 * La parte del pendiente que es SQL exacto (anexo §6.1), sobre `m` (medición) e `i` (indicador): ordinaria, de un indicador activo,
 * con la marca y sin una salida en vigor. Si ya se puede decidir lo dice `estadoDeLaMarca` con las reglas de los indicadores.
 */
export function marcaSinSalida(sql: Cliente) {
  return sql`(m.requiere_accion AND NOT m.historica AND i.estado = 'activo' AND NOT ${salidaEnVigor(sql)})`;
}

/** La medición con su indicador y la versión con que se calculó (su nombre, su regla y su unidad), para `columnasDeMarca`. */
export const desdeLaMedicion = (sql: Cliente) => sql`mediciones m JOIN indicadores i ON i.id = m.indicador_id
  JOIN indicador_versiones v ON v.id = m.version_id`;

/** Las columnas de una medición marcada (`desdeLaMedicion`) que leen `aMarcaLeida` y `estadoDeLaMarca`. */
export const columnasDeMarca = (sql: Cliente) => sql`m.id, m.indicador_id, m.periodo, m.hasta, m.vence_en, m.estado, m.semaforo, m.cumple,
  m.incumplimiento_repetido, m.analisis, m.causa, m.accion_propuesta, m.resultado_exacto, m.meta_aplicada, m.meta_max_aplicada,
  i.codigo, i.proceso_id, coalesce(v.nombre, i.codigo) AS nombre, v.tendencia, v.semaforo_modo, v.umbral_atencion_pct, v.limite_critico,
  v.tolerancia, v.rangos, v.unidad_sufijo, v.decimales`;

/** Una medición marcada, leída con `columnasDeMarca`. */
export type MarcaLeida = MarcaSinDecidir & {
  medicionId: number;
  indicadorId: number;
  procesoId: number;
  codigo: string;
  /** El nombre del indicador en la versión con que se calculó la medición (o su código). */
  nombre: string;
  /** La clave del periodo («2026-10»). */
  periodo: string;
  hasta: Date;
  /** Lo que la medición muestra: el resultado en texto (o nulo) y su meta en pocas palabras (o nula). */
  valor: string | null;
  frente: string | null;
  meta: string | null;
};

const texto = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

/** De una fila de `columnasDeMarca` a la marca, con los textos de su resultado con la regla con que se calculó (la meta aplicada). */
export function aMarcaLeida(f: Record<string, unknown>): MarcaLeida {
  const regla = reglaDeTexto({
    tendencia: (f.tendencia as Tendencia | null) ?? "ascendente",
    meta: texto(f.meta_aplicada),
    metaMax: texto(f.meta_max_aplicada),
    modo: (f.semaforo_modo as ModoSemaforo | null) ?? null,
    umbralPct: f.umbral_atencion_pct === null || f.umbral_atencion_pct === undefined ? null : Number(f.umbral_atencion_pct),
    limite: texto(f.limite_critico),
    tolerancia: texto(f.tolerancia),
    rangos: (f.rangos as RangosEnTexto | null) ?? null,
  });
  const unidad: Unidad = { sufijo: (f.unidad_sufijo as string | null) ?? "", decimales: f.decimales === null || f.decimales === undefined ? 0 : Number(f.decimales) };
  const semaforo = (f.semaforo as Semaforo | null) ?? null;
  const cumple = (f.cumple as boolean | null) ?? null;
  const resultado = typeof f.resultado_exacto === "string" ? deTexto(f.resultado_exacto) : null;
  return {
    medicionId: Number(f.id),
    indicadorId: Number(f.indicador_id),
    procesoId: Number(f.proceso_id),
    codigo: f.codigo as string,
    nombre: f.nombre as string,
    periodo: f.periodo as string,
    hasta: f.hasta as Date,
    venceEn: f.vence_en as Date,
    cerrada: f.estado === "cerrada",
    semaforo,
    cumple,
    repetido: f.incumplimiento_repetido === true,
    analisis: (f.analisis as string | null) ?? null,
    causa: (f.causa as string | null) ?? null,
    accionPropuesta: (f.accion_propuesta as string | null) ?? null,
    valor: resultado ? textoValor(resultado, unidad, regla) : null,
    frente: resultado ? resultadoFrenteAMeta({ resultado, semaforo, cumple }, regla, unidad) : null,
    meta: regla.meta === null ? null : textoMeta(regla, unidad),
  };
}

/** «octubre de 2026»: el periodo de la medición en palabras (o su clave). */
export const etiquetaDelPeriodo = (m: Pick<MarcaLeida, "periodo">) => periodoDe(m.periodo, zonaHoraria())?.etiqueta ?? m.periodo;

/** El título y la descripción que propone el registro desde la marca (anexo §6.2), y la descripción de su ocurrencia. */
export function textosDeLaMarca(m: MarcaLeida): { titulo: string; descripcion: string } {
  const periodo = etiquetaDelPeriodo(m);
  return {
    titulo: tituloDeLaMarca(m.nombre, periodo),
    descripcion: fraseDelResultado({ indicador: m.nombre, periodo, resultado: m.valor ?? "sin resultado", meta: m.meta, semaforo: m.semaforo, repetido: m.repetido }),
  };
}

/** Una medición leída para decidir sobre su marca, con quién la ve: lo que el candado protege, leído después de tomarlo. */
export type MarcaParaDecidir = MarcaLeida & {
  /** Lleva la marca, es ordinaria y su indicador está activo. */
  marcada: boolean;
  /** Tiene una salida en vigor (`salidaEnVigor`). */
  decidida: boolean;
  /** La persona ve el indicador (`filtroIndicadores`). */
  ve: boolean;
  /** El subproceso del indicador en su ficha vigente, si es de su proceso. */
  subprocesoId: number | null;
};

/** La medición `medicionId` para decidir sobre su marca; nula si no existe. Una sola sentencia. */
export async function leerMarca(sql: Cliente, sesion: SesionFlujo, medicionId: number): Promise<MarcaParaDecidir | null> {
  if (!idDeMedicionValido(medicionId)) return null;
  const [f] = await sql`SELECT ${columnasDeMarca(sql)},
      (m.requiere_accion AND NOT m.historica AND i.estado = 'activo') AS marcada,
      ${salidaEnVigor(sql)} AS decidida,
      ${filtroIndicadores(sql, sesion)} AS ve,
      (SELECT CASE WHEN EXISTS (SELECT 1 FROM subprocesos lm_s WHERE lm_s.id = lm_v.subproceso_id AND lm_s.proceso_id = i.proceso_id)
          THEN lm_v.subproceso_id END
        FROM indicador_versiones lm_v WHERE lm_v.indicador_id = i.id AND lm_v.estado = 'aprobada'
        ORDER BY lm_v.numero DESC LIMIT 1) AS subproceso_vigente
    FROM ${desdeLaMedicion(sql)}
    WHERE m.id = ${medicionId}`;
  if (!f) return null;
  return {
    ...aMarcaLeida(f),
    marcada: f.marcada === true,
    decidida: f.decidida === true,
    ve: f.ve === true,
    subprocesoId: f.subproceso_vigente === null || f.subproceso_vigente === undefined ? null : Number(f.subproceso_vigente),
  };
}

/**
 * Qué salidas puede dar la persona a las marcas de un indicador (anexo §6.2 y §12): un hallazgo nuevo o una ocurrencia, con
 * `mejora.registrar`, el Admin SGC y los líderes activos de su proceso; «No requiere», con `mejora.gestionar`. Las dos, solo si ve el
 * indicador (`filtroIndicadores`). A quien no puede ninguna no le cuesta una consulta.
 */
export async function puedeResolverMarca(
  sql: Cliente,
  sesion: SesionFlujo,
  indicador: { id: number; procesoId: number },
): Promise<{ hallazgo: boolean; noRequiere: boolean }> {
  const registra = puede(sesion, "mejora.registrar") && (sesion.rol === "admin_sgc" || sesion.rol === "lider_proceso");
  const gestiona = puede(sesion, "mejora.gestionar");
  if (!registra && !gestiona) return { hallazgo: false, noRequiere: false };
  const [f] = await sql`SELECT ${filtroIndicadores(sql, sesion)} AS ve,
      EXISTS (SELECT 1 FROM usuario_procesos pr_up JOIN procesos pr_p ON pr_p.id = pr_up.proceso_id AND pr_p.activo
        WHERE pr_up.usuario_id = ${sesion.usuarioId} AND pr_up.proceso_id = ${indicador.procesoId}) AS lidera
    FROM indicadores i WHERE i.id = ${indicador.id}`;
  const ve = f?.ve === true;
  return {
    hallazgo: ve && registra && (sesion.rol === "admin_sgc" || f.lidera === true),
    noRequiere: ve && gestiona,
  };
}

/** La entidad de bitácora de una salida: la medición, como en los actos de los indicadores. */
const ENTIDAD_MEDICION = "medicion";

/**
 * Escribe una salida (anexo §6.4: una fila por decisión, de solo inserción) y su bitácora `mejora_marca`. A la bitácora van el
 * indicador, el periodo, la salida y el código del hallazgo; la justificación de un «no requiere», nunca (decisión 42 de la 15A):
 * queda en la fila.
 */
export async function dejarSalida(
  tx: TransactionSql,
  sesion: SesionFlujo,
  m: Pick<MarcaLeida, "medicionId" | "indicadorId" | "codigo" | "periodo">,
  s:
    | { salida: "hallazgo" | "ocurrencia"; hallazgo: { id: number; codigo: string }; alRegistrar?: boolean }
    | { salida: "no_requiere"; justificacion: string },
  ahora: Date,
): Promise<void> {
  const hallazgoId = s.salida === "no_requiere" ? null : s.hallazgo.id;
  const justificacion = s.salida === "no_requiere" ? s.justificacion : null;
  await tx`INSERT INTO mejora_marcas (medicion_id, indicador_id, salida, hallazgo_id, justificacion, decidido_por, decidido_en)
    VALUES (${m.medicionId}, ${m.indicadorId}, ${s.salida}, ${hallazgoId}, ${justificacion}, ${sesion.usuarioId}, ${ahora})`;
  await registrarAuditoria(tx, {
    usuarioId: sesion.usuarioId,
    accion: "mejora_marca",
    entidad: ENTIDAD_MEDICION,
    entidadId: m.medicionId,
    detalle: {
      indicador: m.codigo,
      indicadorId: m.indicadorId,
      periodo: m.periodo,
      salida: s.salida,
      ...(s.salida === "no_requiere" ? {} : { hallazgo: s.hallazgo.codigo, hallazgoId: s.hallazgo.id }),
      ...(s.salida === "hallazgo" && s.alRegistrar ? { alRegistrar: true } : {}),
    },
  });
}

/**
 * Lo que el registro toma de la medición cuando el formulario llegó desde el panel de la marca (`marcaMedicionId`, anexo §6.3 y
 * §10.3): la medición y su indicador, que quedan fijos y aquí se vuelven a sacar de la base, y el subproceso vigente del indicador.
 * Solo si la persona puede resolver la marca con un hallazgo (`puedeResolverMarca`): a nadie más le llega ese campo, y uno forzado
 * se ignora sin decir por qué, como un registro por fuera. Nula también si la medición no existe.
 */
export async function marcaDelPanel(
  tx: TransactionSql,
  sesion: SesionFlujo,
  medicionId: number,
): Promise<{ medicionId: number; indicadorId: number; procesoId: number; subprocesoId: number | null } | null> {
  const m = await leerMarca(tx, sesion, medicionId);
  if (!m || !(await puedeResolverMarca(tx, sesion, { id: m.indicadorId, procesoId: m.procesoId })).hallazgo) return null;
  return { medicionId: m.medicionId, indicadorId: m.indicadorId, procesoId: m.procesoId, subprocesoId: m.subprocesoId };
}

/**
 * La salida «hallazgo» que deja el registro al nacer (anexo §6.3), en su misma transacción y con el candado de la medición ya
 * tomado: si la medición lleva la marca, no tiene salida en vigor y quien registra puede resolverla (el Admin SGC, o un líder del
 * proceso del indicador), sea ya un pendiente o espere todavía su análisis. Si registra otra persona, nada: el pendiente sigue y la
 * pantalla le propone el hallazgo como ocurrencia a quien decide. Sin la marca (un recálculo se la quitó), nada. Con una salida en
 * vigor, nada, salvo que el formulario llegara desde el panel (`desdeElPanel`): otra persona decidió entre tanto y abrir este
 * sería duplicar, así que se rechaza con `MARCA_YA_DECIDIDA` y el hallazgo no nace (la transacción se revierte).
 */
export async function salidaAlNacer(
  tx: TransactionSql,
  sesion: SesionFlujo,
  d: { medicionId: number; hallazgoId: number; desdeElPanel: boolean },
  ahora: Date,
): Promise<void> {
  const m = await leerMarca(tx, sesion, d.medicionId);
  if (!m || !(await puedeResolverMarca(tx, sesion, { id: m.indicadorId, procesoId: m.procesoId })).hallazgo) return;
  if (m.decidida) {
    if (d.desdeElPanel) throw new ErrorMejora(MARCA_YA_DECIDIDA);
    return;
  }
  if (!m.marcada) return;
  const [h] = await tx`SELECT codigo FROM mejora_hallazgos WHERE id = ${d.hallazgoId}`;
  await dejarSalida(tx, sesion, m, { salida: "hallazgo", hallazgo: { id: d.hallazgoId, codigo: h.codigo as string }, alRegistrar: true }, ahora);
}
