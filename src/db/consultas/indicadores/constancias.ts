/**
 * Las constancias de envío al ente (anexo 14B, §8): el registro de que el resultado de un periodo externo de un indicador
 * regulatorio se reportó a su ente. Nacen solas (`asegurarConstancias`) para cada periodo de la periodicidad externa que
 * terminó después de que la ficha vigente empezó a reportarse (`indicadores.ente_desde`, que escribe `alPublicarVersion`):
 * añadir el ente a una ficha con años de historia, o a una importada, no abre envíos vencidos. Cada una guarda el nombre del
 * ente y su fecha límite de cuando nació; un cambio posterior de la ficha no las toca.
 *
 * Registran y corrigen, sin clave (F14-DC33), quien ve el indicador y puede medirlo o administra indicadores
 * (`puedeRegistrarConstancia`): registrar congela el resultado del periodo externo (`resultadoDelPeriodoExterno`) y corregir
 * no lo recalcula. El historial (`reporte_externo_eventos`) es de solo inserción. Candados: el indicador `FOR SHARE` (o
 * `FOR UPDATE` quien escribe su `ente_desde`) y después la constancia `FOR UPDATE`.
 *
 * Las importaciones van en un solo sentido: esto lee los periodos con `lectura.ts`, y por eso `alPublicarVersion` y
 * `retirar` quitan las pendientes con `quitarConstanciasSinSoporte` (`operacion.ts`), sin importar este archivo.
 */
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { filtroIndicadores, puedeMedir, puedeVerIndicador, responsableDe, type Responsabilidad, type SujetoVisibilidad } from "@/lib/alcance";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { acumulado } from "@/lib/indicadores/acumulado";
import { envioValido, justificacionValida, seReportaAlEnte, type Envio } from "@/lib/indicadores/constancias";
import { aTexto } from "@/lib/indicadores/formula/fraccion";
import { fechaLimiteDeReporte, periodoQueContiene, periodosTerminados } from "@/lib/indicadores/periodos";
import { fichaDeCalculo } from "@/lib/indicadores/reporte";
import { rachasDe } from "@/lib/indicadores/resultados";
import { rutaDeIndicador } from "@/lib/indicadores/rutas";
import { textoValor } from "@/lib/indicadores/textos";
import { ErrorIndicador, SIN_RESPONSABLE, type Periodicidad } from "@/lib/indicadores/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";
import type { Tarea } from "@/lib/tareas";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { leerPeriodos, type Base } from "./lectura";
import { conMayuscula, texto, versionesAprobadasDe } from "./mediciones";

type Opciones = { sql?: Cliente; ahora?: Date };

const NO_EXISTE = "La constancia no existe";
const RETIRADO = "El indicador está retirado: ya no admite reportes";
const YA_REGISTRADA = "La constancia ya está registrada: corríjala";
const SIN_REGISTRAR = "La constancia aún no está registrada: regístrela";
const SIN_SOPORTE = "Adjunte al menos un soporte antes de registrar";
const SIN_CAMBIOS = "No hay cambios que corregir";

/** Lo que la ficha vigente dice del ente, como lo lee `seReportaAlEnte`. */
const enteDeVersion = (v: Record<string, unknown>) => ({
  ente: (v.ente as string | null) ?? null,
  periodicidadExterna: (v.periodicidad_externa as string | null) ?? null,
  plazoExternoDias: v.plazo_externo_dias === null || v.plazo_externo_dias === undefined ? null : Number(v.plazo_externo_dias),
  periodicidad: (v.periodicidad as string | null) ?? null,
});

// ─────────────────────────────────────────────────────────────────────────────
// Cuándo nacen
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los indicadores activos con inicio de medición (los mismos cuyos periodos abre la pasada) cuya ficha vigente trae los
 * tres datos del ente; la condición entera se revisa otra vez con el candado.
 */
async function candidatas(sql: Cliente, indicadorId?: number): Promise<{ id: number; conEnteDesde: boolean }[]> {
  const filas = await sql`SELECT i.id, i.ente_desde IS NOT NULL AS con_ente_desde
    FROM indicadores i
    CROSS JOIN LATERAL (
      SELECT v.ente, v.periodicidad_externa, v.plazo_externo_dias FROM indicador_versiones v
      WHERE v.indicador_id = i.id AND v.estado = 'aprobada' ORDER BY v.numero DESC LIMIT 1
    ) va
    WHERE i.estado = 'activo' AND i.inicio_medicion IS NOT NULL
      AND btrim(coalesce(va.ente, '')) <> '' AND va.periodicidad_externa IS NOT NULL AND va.plazo_externo_dias IS NOT NULL
      ${indicadorId === undefined ? sql`` : sql`AND i.id = ${indicadorId}`}
    ORDER BY i.id`;
  return filas.map((f) => ({ id: Number(f.id), conEnteDesde: f.con_ente_desde === true }));
}

/**
 * Un indicador en su transacción, con el estado releído bajo el candado: si su ficha vigente se reporta y todavía no sabe
 * desde cuándo (se aprobó antes de la 14B), empieza a contar ahora y no se le abre nada; si ya lo sabe, una constancia por
 * cada periodo externo que terminó después de ese momento y del inicio de medición. Quien escribe `ente_desde` toma el
 * indicador `FOR UPDATE`; quien solo abre constancias, `FOR SHARE`, como `abrirPeriodos`.
 */
function asegurarDe(sql: Cliente, c: { id: number; conEnteDesde: boolean }, ahora: Date): Promise<number> {
  return enTransaccion(sql, async (tx) => {
    const [i] = c.conEnteDesde
      ? await tx`SELECT ente_desde, inicio_medicion FROM indicadores WHERE id = ${c.id} AND estado = 'activo' FOR SHARE`
      : await tx`SELECT ente_desde, inicio_medicion FROM indicadores WHERE id = ${c.id} AND estado = 'activo' FOR UPDATE`;
    if (!i?.inicio_medicion) return 0;
    const [v] = await tx`SELECT ente, periodicidad_externa, plazo_externo_dias, periodicidad FROM indicador_versiones
      WHERE indicador_id = ${c.id} AND estado = 'aprobada' ORDER BY numero DESC LIMIT 1`;
    const ente = v ? enteDeVersion(v) : null;
    if (!ente || !seReportaAlEnte(ente)) return 0;
    if (i.ente_desde === null) {
      // Con `FOR SHARE` no se escribe: otra publicación lo cambió entre la lista y el candado; la pasada siguiente lo ve.
      if (!c.conEnteDesde) await tx`UPDATE indicadores SET ente_desde = ${ahora} WHERE id = ${c.id}`;
      return 0;
    }
    const zona = zonaHoraria();
    const desde = new Date(i.ente_desde as string).getTime();
    const inicio = periodoDe(i.inicio_medicion as string, zona)?.desde.getTime();
    if (inicio === undefined) return 0;
    const externa = ente.periodicidadExterna as Periodicidad;
    const primero = periodoQueContiene(externa, new Date(Math.max(desde, inicio)), zona).clave;
    const nuevos = periodosTerminados(externa, primero, ahora, zona).filter((p) => p.hasta.getTime() > desde && p.hasta.getTime() > inicio);
    if (nuevos.length === 0) return 0;
    const plazo = ente.plazoExternoDias!;
    const iso = (d: Date) => d.toISOString();
    const creadas = await tx`INSERT INTO reportes_externos (indicador_id, periodo, desde, hasta, vence_en, ente)
      SELECT ${c.id}, x.periodo, x.desde, x.hasta, x.vence_en, ${ente.ente!.trim()}
      FROM unnest(
        ${tx.array(nuevos.map((p) => p.clave))}::text[],
        ${tx.array(nuevos.map((p) => iso(p.desde)))}::timestamptz[],
        ${tx.array(nuevos.map((p) => iso(p.hasta)))}::timestamptz[],
        ${tx.array(nuevos.map((p) => iso(fechaLimiteDeReporte(p, plazo, zona))))}::timestamptz[]
      ) AS x(periodo, desde, hasta, vence_en)
      ON CONFLICT (indicador_id, periodo) DO NOTHING
      RETURNING id`;
    return creadas.length;
  });
}

/**
 * Abre (crea, idempotente) las constancias pendientes de cada indicador activo que se reporta a un ente, o solo de
 * `indicadorId`, y devuelve cuántas creó. La llaman la pasada de vencimientos (después de abrir los periodos) y la página del
 * indicador. Sin `indicadorId`, uno que falla se registra y los demás siguen; con él, el error llega a quien llama.
 */
export async function asegurarConstancias(opciones: { sql: Cliente; ahora: Date; indicadorId?: number }): Promise<number> {
  const { sql, ahora, indicadorId } = opciones;
  let creadas = 0;
  for (const c of await candidatas(sql, indicadorId)) {
    if (indicadorId !== undefined) {
      creadas += await asegurarDe(sql, c, ahora);
      continue;
    }
    try {
      creadas += await asegurarDe(sql, c, ahora);
    } catch (err) {
      console.error(`No se pudieron abrir las constancias de envío del indicador ${c.id}:`, err);
    }
  }
  return creadas;
}

// ─────────────────────────────────────────────────────────────────────────────
// El resultado del periodo externo
// ─────────────────────────────────────────────────────────────────────────────

export type ResultadoExterno = {
  /** «86,7 %»: nunca contradice el color; `null` sin resultado. */
  texto: string | null;
  /** La fracción exacta («260/3»); `null` sin resultado. */
  exacto: string | null;
  parcial: boolean;
  /** Las etiquetas de los periodos de medición sin dato («marzo de 2026»). */
  faltan: string[];
  /** Las de los que no están cerrados. */
  sinCerrar: string[];
};

/**
 * El resultado del periodo externo (anexo §8): el acumulado de §8.10 (`acumulado`, con la preparación de
 * `resumenAcumulado`: la racha del último periodo terminado, la consolidación de sus variables y la regla del último
 * medido) sobre los periodos de medición que el periodo externo contiene, de la periodicidad que rige (`leerPeriodos`).
 * Es parcial si falta el dato de alguno o alguno no está cerrado; se puede registrar igual.
 */
export async function resultadoDelPeriodoExterno(sql: Cliente, indicadorId: number, periodo: string, ahora: Date): Promise<ResultadoExterno> {
  const zona = zonaHoraria();
  const externo = periodoDe(periodo, zona);
  const [i] = await sql`SELECT inicio_medicion, soporte_obligatorio FROM indicadores WHERE id = ${indicadorId}`;
  if (!externo || !i) throw new ErrorIndicador(NO_EXISTE);
  const versiones = (await versionesAprobadasDe(sql, [indicadorId])).get(indicadorId) ?? [];
  const base: Base = { id: indicadorId, inicio: texto(i.inicio_medicion), soporteObligatorio: i.soporte_obligatorio === true, versiones };
  const anio = Number(periodo.slice(0, 4));
  const dentro = ((await leerPeriodos(sql, [base], { desde: anio, hasta: anio }, ahora)).get(indicadorId) ?? []).filter(
    (l) =>
      l.fila.deOtraPeriodicidad !== true &&
      l.periodo.desde.getTime() >= externo.desde.getTime() &&
      l.periodo.hasta.getTime() <= externo.hasta.getTime(),
  );
  const sinCerrar = dentro.filter((l) => l.fila.estado !== "cerrada").map((l) => l.periodo.etiqueta);
  const terminados = dentro.filter((l) => l.periodo.hasta.getTime() < ahora.getTime());
  const ultimo = terminados.at(-1);
  const ficha = ultimo ? fichaDeCalculo(ultimo.version.calculo) : null;
  if (!ultimo || !ficha) return { texto: null, exacto: null, parcial: sinCerrar.length > 0, faltan: [], sinCerrar };

  const rachas = rachasDe(versiones);
  const rachaDe = (l: (typeof dentro)[number]) => rachas.get(l.version.id)?.id ?? l.version.id;
  const racha = rachaDe(ultimo);
  const medido = [...terminados].reverse().find((l) => rachaDe(l) === racha && l.resultado !== null);
  const regla = (medido ?? ultimo).regla;
  // Como en `resumenAcumulado`: con el inicio del periodo delante, el orden es el del calendario.
  const orden = (l: (typeof dentro)[number]) => `${l.periodo.desde.toISOString()}#${l.periodo.clave}`;
  const clave = (o: string) => o.slice(o.indexOf("#") + 1);
  const r = acumulado(
    dentro
      .filter((l) => l.fila.medicionId !== null)
      .map((l) => ({ clave: orden(l), versionId: rachaDe(l), noAplica: l.fila.noAplica, valores: l.resultado !== null ? l.valores : null })),
    {
      versionId: racha,
      calculo: ficha,
      consolidacion: Object.fromEntries(ultimo.version.variables.map((v) => [v.letra, v.consolidacion])),
      esperados: terminados.map(orden),
      regla,
    },
  );
  const faltan = r.faltan.map(clave).map((k) => periodoDe(k, zona)?.etiqueta ?? k);
  return {
    texto: r.resultado ? textoValor(r.resultado, ultimo.version.unidad, regla) : null,
    exacto: r.resultado ? aTexto(r.resultado) : null,
    parcial: faltan.length > 0 || sinCerrar.length > 0,
    faltan,
    sinCerrar,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Registrar y corregir
// ─────────────────────────────────────────────────────────────────────────────

/** Quien ve el indicador y puede medirlo (`puedeMedir`) o administra indicadores. */
export async function puedeRegistrarConstancia(indicadorId: number, sujeto: SujetoVisibilidad, opciones?: { sql?: Cliente }): Promise<boolean> {
  const sql = opciones?.sql ?? obtenerSql();
  if (!(await puedeVerIndicador(indicadorId, sujeto, { sql }))) return false;
  if (puede(sujeto, "indicadores.administrar")) return true;
  return (await puedeMedir(indicadorId, sujeto, { sql })).puede;
}

type ConstanciaBloqueada = { id: number; indicadorId: number; codigo: string; periodo: string; ente: string; estado: string; envio: Envio };

/**
 * La constancia con sus candados (el indicador `FOR SHARE` y la constancia `FOR UPDATE`, en ese orden) y lo que exige
 * tocarla: quien no ve el indicador recibe «no existe»; quien lo ve y no puede registrar, `ErrorPermiso`; un indicador
 * retirado ya no admite reportes.
 */
async function constanciaBloqueada(tx: Cliente, sesion: SujetoVisibilidad, reporteId: number): Promise<ConstanciaBloqueada> {
  const [i] = await tx`SELECT id, codigo, estado FROM indicadores
    WHERE id = (SELECT indicador_id FROM reportes_externos WHERE id = ${reporteId}) FOR SHARE`;
  const [r] = await tx`SELECT id, periodo, ente, estado, to_char(fecha_envio, 'YYYY-MM-DD') AS fecha_envio, radicado, nota
    FROM reportes_externos WHERE id = ${reporteId} FOR UPDATE`;
  if (!i || !r || !(await puedeVerIndicador(Number(i.id), sesion, { sql: tx }))) throw new ErrorIndicador(NO_EXISTE);
  if (!(await puedeRegistrarConstancia(Number(i.id), sesion, { sql: tx }))) throw new ErrorPermiso();
  if (i.estado !== "activo") throw new ErrorIndicador(RETIRADO);
  return {
    id: Number(r.id),
    indicadorId: Number(i.id),
    codigo: i.codigo as string,
    periodo: r.periodo as string,
    ente: r.ente as string,
    estado: r.estado as string,
    envio: { fechaEnvio: (r.fecha_envio as string | null) ?? "", radicado: (r.radicado as string | null) ?? "", nota: (r.nota as string | null) ?? null },
  };
}

/** El envío ya recortado, o el mensaje de lo que no vale; «hoy» es el día de `ahora` en la zona. */
function exigirEnvio(d: { fechaEnvio: string; radicado: string; nota?: string }, ahora: Date): Envio {
  const envio = envioValido(d, fechaEnZona(ahora, zonaHoraria()));
  if (typeof envio === "string") throw new ErrorIndicador(envio);
  return envio;
}

/**
 * Registra el envío de una constancia pendiente (anexo §8): fecha de envío (no futura), radicado, nota opcional y al menos un
 * soporte ya adjunto. Congela el resultado del periodo externo en la constancia (su texto y, en el detalle, su fracción
 * exacta y qué periodos faltaban o no estaban cerrados), con el evento `registro` y la bitácora.
 */
export async function registrarConstancia(
  sesion: SesionFlujo,
  d: { reporteId: number; fechaEnvio: string; radicado: string; nota?: string },
  opciones?: Opciones,
): Promise<void> {
  if (!puede(sesion, "indicadores.medir")) throw new ErrorPermiso();
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const envio = exigirEnvio(d, ahora);
  await enTransaccion(sql, async (tx) => {
    const c = await constanciaBloqueada(tx, sesion, d.reporteId);
    if (c.estado !== "pendiente") throw new ErrorIndicador(YA_REGISTRADA);
    const [s] = await tx`SELECT count(*)::int AS n FROM archivos WHERE contexto = 'reporte_externo' AND contexto_id = ${c.id}`;
    if (Number(s.n) === 0) throw new ErrorIndicador(SIN_SOPORTE);
    const r = await resultadoDelPeriodoExterno(tx, c.indicadorId, c.periodo, ahora);
    const detalle = { exacto: r.exacto, parcial: r.parcial, faltan: r.faltan, sinCerrar: r.sinCerrar };
    await tx`UPDATE reportes_externos SET estado = 'registrada', fecha_envio = ${envio.fechaEnvio}, radicado = ${envio.radicado},
        nota = ${envio.nota}, resultado_enviado = ${r.texto}, resultado_detalle = ${tx.json(detalle)},
        registrada_por = ${sesion.usuarioId}, registrada_en = ${ahora}
      WHERE id = ${c.id}`;
    await tx`INSERT INTO reporte_externo_eventos (reporte_id, tipo, usuario_id, detalle, creado_en)
      VALUES (${c.id}, 'registro', ${sesion.usuarioId}, ${tx.json({ ...envio, resultado: r.texto, ...detalle })}, ${ahora})`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "constancia_registrada",
      entidad: "reporte_externo",
      entidadId: c.id,
      detalle: { codigo: c.codigo, periodo: c.periodo, ente: c.ente, radicado: envio.radicado, fechaEnvio: envio.fechaEnvio, resultado: r.texto },
    });
  });
}

/**
 * Corrige la fecha, el radicado o la nota de una constancia registrada (anexo §8), con justificación de 10 a 500
 * caracteres: no recalcula el resultado congelado, la deja marcada `corregida` y guarda el antes y el después en el evento
 * `correccion` y en la bitácora.
 */
export async function corregirConstancia(
  sesion: SesionFlujo,
  d: { reporteId: number; fechaEnvio: string; radicado: string; nota?: string; justificacion: string },
  opciones?: Opciones,
): Promise<void> {
  if (!puede(sesion, "indicadores.medir")) throw new ErrorPermiso();
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const despues = exigirEnvio(d, ahora);
  const j = justificacionValida(d.justificacion);
  if (!j.ok) throw new ErrorIndicador(j.mensaje);
  await enTransaccion(sql, async (tx) => {
    const c = await constanciaBloqueada(tx, sesion, d.reporteId);
    if (c.estado !== "registrada") throw new ErrorIndicador(SIN_REGISTRAR);
    const antes = c.envio;
    if (antes.fechaEnvio === despues.fechaEnvio && antes.radicado === despues.radicado && antes.nota === despues.nota) {
      throw new ErrorIndicador(SIN_CAMBIOS);
    }
    await tx`UPDATE reportes_externos SET fecha_envio = ${despues.fechaEnvio}, radicado = ${despues.radicado}, nota = ${despues.nota},
        corregida = true
      WHERE id = ${c.id}`;
    const cambio = { justificacion: j.texto, antes, despues };
    await tx`INSERT INTO reporte_externo_eventos (reporte_id, tipo, usuario_id, detalle, creado_en)
      VALUES (${c.id}, 'correccion', ${sesion.usuarioId}, ${tx.json(cambio)}, ${ahora})`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "constancia_corregida",
      entidad: "reporte_externo",
      entidadId: c.id,
      detalle: { codigo: c.codigo, periodo: c.periodo, ente: c.ente, ...cambio },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Lecturas
// ─────────────────────────────────────────────────────────────────────────────

export type Constancia = {
  id: number;
  periodo: string;
  /** «Tercer trimestre de 2026». */
  etiqueta: string;
  ente: string;
  venceEn: Date;
  estado: "pendiente" | "registrada";
  /** Pendiente con la fecha límite ya pasada. */
  vencida: boolean;
  /** `AAAA-MM-DD`. */
  fechaEnvio: string | null;
  radicado: string | null;
  resultadoEnviado: string | null;
  parcial: boolean;
  nota: string | null;
  /** El nombre de quien la registró. */
  registradaPor: string | null;
  registradaEn: Date | null;
  corregida: boolean;
};

/** Las constancias del indicador, de la más reciente a la más antigua; `null` a quien no ve el indicador. */
export async function constanciasDe(sesion: SujetoVisibilidad, indicadorId: number, opciones?: Opciones): Promise<Constancia[] | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  if (!(await puedeVerIndicador(indicadorId, sesion, { sql }))) return null;
  const zona = zonaHoraria();
  const filas = await sql`SELECT r.id, r.periodo, r.ente, r.vence_en, r.estado, to_char(r.fecha_envio, 'YYYY-MM-DD') AS fecha_envio,
      r.radicado, r.resultado_enviado, r.resultado_detalle, r.nota, u.nombre AS registrada_por, r.registrada_en, r.corregida
    FROM reportes_externos r LEFT JOIN usuarios u ON u.id = r.registrada_por
    WHERE r.indicador_id = ${indicadorId}
    ORDER BY r.hasta DESC, r.id DESC`;
  return filas.map((f) => {
    const venceEn = new Date(f.vence_en as string);
    const estado = f.estado as Constancia["estado"];
    const periodo = f.periodo as string;
    return {
      id: Number(f.id),
      periodo,
      etiqueta: conMayuscula(periodoDe(periodo, zona)?.etiqueta ?? periodo),
      ente: f.ente as string,
      venceEn,
      estado,
      vencida: estado === "pendiente" && venceEn.getTime() < ahora.getTime(),
      fechaEnvio: (f.fecha_envio as string | null) ?? null,
      radicado: (f.radicado as string | null) ?? null,
      resultadoEnviado: (f.resultado_enviado as string | null) ?? null,
      parcial: (f.resultado_detalle as { parcial?: unknown } | null)?.parcial === true,
      nota: (f.nota as string | null) ?? null,
      registradaPor: (f.registrada_por as string | null) ?? null,
      registradaEn: f.registrada_en === null ? null : new Date(f.registrada_en as string),
      corregida: f.corregida === true,
    };
  });
}

/**
 * Las tareas «Registrar el reporte a *ente*: *código*, *periodo*» (anexo §8): las constancias pendientes de indicadores
 * activos que la persona ve y de las que es responsable de medir (`responsableDe`, con el respaldo de siempre: los
 * líderes y, sin ellos, el Admin SGC; un automático no lo mide nadie y cae en ese respaldo). Solo lee: corre en cada página
 * del cascarón y no abre constancias.
 */
export async function tareasDeConstancias(sql: Cliente, sesion: SesionFlujo): Promise<Tarea[]> {
  const filas = await sql`SELECT * FROM (
      SELECT r.id, r.periodo, r.ente, r.vence_en, i.codigo, i.calculo, p.nombre AS proceso,
        ${responsableDe(sql, sesion, "mide")} AS mide
      FROM reportes_externos r JOIN indicadores i ON i.id = r.indicador_id JOIN procesos p ON p.id = i.proceso_id
      WHERE r.estado = 'pendiente' AND i.estado = 'activo' AND ${filtroIndicadores(sql, sesion)}
    ) x
    WHERE x.mide IS NOT NULL
    ORDER BY x.vence_en, x.id`;
  const zona = zonaHoraria();
  return filas.map((f) => {
    const codigo = f.codigo as string;
    const periodo = f.periodo as string;
    // A un automático no se le designa quien mida: el detalle de respaldo no le sirve.
    const respaldo = (f.mide as Responsabilidad) === "respaldo" && f.calculo === null;
    return {
      id: `constancia:${f.id}`,
      modulo: "indicadores" as const,
      titulo: `Registrar el reporte a ${f.ente as string}: ${codigo}, ${periodoDe(periodo, zona)?.etiqueta ?? periodo}`,
      detalle: respaldo ? SIN_RESPONSABLE : (f.proceso as string),
      vence: new Date(f.vence_en as string),
      enlace: `${rutaDeIndicador(codigo)}?vista=reportes`,
    };
  });
}
