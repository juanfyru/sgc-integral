/**
 * La aprobación de la ficha de indicador (spec 14 §7.6, Tarea 7 de la 14A): enviar con la firma «Elaboró», aprobar con
 * «Aprobó» (también en bloque, todo o nada), devolver con nota, descartar el borrador de un cambio, qué versión rige
 * cada periodo, el control de cambios y lo que cada persona ve de la ficha.
 *
 * Cada firma sigue F13A-R4: un validador de solo lectura, la clave fuera de la transacción y, dentro, los indicadores y
 * después las versiones bloqueados `FOR UPDATE` en orden de id (el orden de `fichas.ts`), con las comprobaciones
 * repetidas antes de escribir nada. Una versión pasa a `aprobada` en una sola sentencia: el trigger de la 0011 rechaza
 * cualquier cambio posterior.
 *
 * Una medición «reportada» es la que está `reportada` o `cerrada`, o la abierta con sus datos reportados (`reportada_en`)
 * o «no aplica»: ya tiene un dato que cuenta y ninguna versión nueva puede regirla (F14-DC17).
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { avisarA } from "@/db/consultas/avisos-vencimiento";
import { registrarFirma } from "@/db/consultas/firmas";
import { ErrorFirma, enTransaccion, type OpcionesFlujo, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { aprobadoresDeFicha, filtroAcceso, puedeAprobarFicha, puedeVerIndicador, type SujetoVisibilidad } from "@/lib/alcance";
import { verificarParaFirmar, type CredencialesFirma } from "@/lib/firma";
import { periodoDe, type Periodo } from "@/lib/indicadores-documentales/periodo";
import { camposCambiados, huellaDeFicha, tipoDeCambio, type ContenidoFicha } from "@/lib/indicadores/ficha";
import { periodicidadDe, periodosTerminados, periodoQueContiene, versionQueRigeEntre } from "@/lib/indicadores/periodos";
import {
  AVISO_DESIGNACION,
  ErrorIndicador,
  FUNCIONES_DESIGNADO,
  MAXIMO_EN_BLOQUE,
  type DatosOperacion,
  type EstadoVersion,
  type Periodicidad,
  type TipoCambio,
} from "@/lib/indicadores/tipos";
import { ErrorPermiso, puede, type SujetoPermiso } from "@/lib/permisos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { contenidoDeVersion } from "./fichas";
import { asegurarMediciones, quitarMedicionesDeOtraPeriodicidad } from "./mediciones";

type Opciones = { sql?: Cliente; ahora?: Date };

const FICHA_NO_EXISTE = "La ficha no existe";
const NO_LE_TOCA = "La ficha no existe o no le corresponde aprobarla";
const yaNoPorAprobar = (codigo: string) => `La ficha ${codigo} ya no está por aprobar`;

const ADJETIVO: Record<Periodicidad, string> = {
  mensual: "mensual",
  bimestral: "bimestral",
  trimestral: "trimestral",
  semestral: "semestral",
  anual: "anual",
};

/** La página de una versión de la ficha (spec §12.3, vista «Ficha técnica»). */
export const enlaceDeVersion = (codigo: string, numero: number) => `/indicadores/${encodeURIComponent(codigo)}?vista=ficha&version=${numero}`;

/** «primer trimestre de 2026» → «Primer trimestre de 2026»; una clave que no es periodo sale tal cual. */
export function etiquetaDePeriodo(clave: string): string {
  const etiqueta = periodoDe(clave, zonaHoraria())?.etiqueta ?? clave;
  return etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1);
}

/** «desde el primer trimestre de 2026», «desde noviembre de 2026», «desde 2026». */
export function desdePeriodo(clave: string): string {
  const etiqueta = periodoDe(clave, zonaHoraria())?.etiqueta ?? clave;
  const p = periodicidadDe(clave);
  return p === "mensual" || p === "anual" || p === null ? `desde ${etiqueta}` : `desde el ${etiqueta}`;
}

function exigirAdministrar(sesion: SujetoPermiso): void {
  if (!puede(sesion, "indicadores.administrar")) throw new ErrorPermiso();
}

const fecha = (v: unknown): Date | null => (v === null || v === undefined ? null : new Date(v as string));

/** Los indicadores de las versiones y después las versiones, `FOR UPDATE` en orden de id. */
async function bloquear(tx: TransactionSql, versionIds: readonly number[]): Promise<void> {
  await tx`SELECT id FROM indicadores
    WHERE id IN (SELECT indicador_id FROM indicador_versiones WHERE id IN ${tx(versionIds)})
    ORDER BY id FOR UPDATE`;
  await tx`SELECT id FROM indicador_versiones WHERE id IN ${tx(versionIds)} ORDER BY id FOR UPDATE`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Qué versión rige
// ─────────────────────────────────────────────────────────────────────────────

/** La ficha vigente: la última versión aprobada (spec §7.6.5). */
export async function versionVigente(sql: Cliente, indicadorId: number): Promise<{ id: number; numero: number } | null> {
  const [v] = await sql`SELECT id, numero FROM indicador_versiones
    WHERE indicador_id = ${indicadorId} AND estado = 'aprobada' ORDER BY numero DESC LIMIT 1`;
  return v ? { id: Number(v.id), numero: Number(v.numero) } : null;
}

/**
 * La versión aprobada de mayor número cuyo «rige desde» empieza antes que el periodo o con él. Para un histórico
 * anterior a todas, la de mayor número entre las que comparten el «rige desde» más antiguo: un cambio menor guarda el
 * «rige desde» de la versión que reemplaza y, con número mayor, rige los mismos periodos, también los históricos. Se
 * compara por fechas: un cambio mayor puede traer otra periodicidad.
 */
export async function versionQueRige(sql: Cliente, indicadorId: number, periodo: string): Promise<number | null> {
  const zona = zonaHoraria();
  const objetivo = periodoDe(periodo, zona);
  if (!objetivo) throw new ErrorIndicador("El periodo no es válido");
  const filas = await sql`SELECT id, rige_desde FROM indicador_versiones
    WHERE indicador_id = ${indicadorId} AND estado = 'aprobada' ORDER BY numero DESC`;
  const versiones = filas.map((f) => ({ id: Number(f.id), rigeDesde: f.rige_desde as string | null }));
  return versionQueRigeEntre(versiones, objetivo, zona)?.id ?? null;
}

/**
 * Una medición «reportada» para «Rige desde» (F14-DC17: no se recalcula lo ya medido): reportada o cerrada, y también la
 * abierta que ya tiene sus datos reportados o «no aplica» y espera el análisis o el soporte.
 */
const conDatoReportado = (sql: Cliente) => sql`(estado IN ('reportada', 'cerrada') OR reportada_en IS NOT NULL OR no_aplica)`;

/** El fin del último periodo con una medición reportada; `null` si no hay ninguna. */
async function finDeLoReportado(sql: Cliente, indicadorId: number): Promise<Date | null> {
  const [m] = await sql`SELECT max(hasta) AS hasta FROM mediciones
    WHERE indicador_id = ${indicadorId} AND ${conDatoReportado(sql)}`;
  return fecha(m?.hasta);
}

const despues = (p: Periodicidad, periodo: Periodo, zona: string) => periodoQueContiene(p, new Date(periodo.hasta.getTime() + 1), zona);

type AprobadaDeRige = { rigeDesde: string | null; periodicidad: Periodicidad | null };

/** Las versiones aprobadas, de mayor a menor número (el orden de `versionQueRigeEntre`), con su periodicidad. */
async function aprobadasDeRige(sql: Cliente, indicadorId: number): Promise<AprobadaDeRige[]> {
  const filas = await sql`SELECT rige_desde, periodicidad FROM indicador_versiones
    WHERE indicador_id = ${indicadorId} AND estado = 'aprobada' ORDER BY numero DESC`;
  return filas.map((f) => ({ rigeDesde: (f.rige_desde as string | null) ?? null, periodicidad: (f.periodicidad as Periodicidad | null) ?? null }));
}

/** La periodicidad que reemplaza un cambio que empieza con `periodo`: la de la versión que rige justo antes. */
function periodicidadQueReemplaza(aprobadas: readonly AprobadaDeRige[], periodo: Periodo, zona: string): Periodicidad | null {
  return versionQueRigeEntre(aprobadas, { desde: new Date(periodo.desde.getTime() - 1) }, zona)?.periodicidad ?? null;
}

/**
 * Frontera común: el periodo empieza donde empieza también un periodo de la periodicidad que reemplaza. Si no, un periodo
 * viejo se partiría en dos y una parte del tiempo se mediría dos veces (de bimestral a trimestral desde abril).
 */
function enFronteraComun(aprobadas: readonly AprobadaDeRige[], periodo: Periodo, zona: string): boolean {
  const anterior = periodicidadQueReemplaza(aprobadas, periodo, zona);
  return anterior === null || periodoQueContiene(anterior, periodo.desde, zona).desde.getTime() === periodo.desde.getTime();
}

/**
 * El primer periodo, en la periodicidad dada, que no se cruza con una medición reportada (sin ninguna, el que contiene el
 * inicio de medición o, sin inicio, el en curso) y empieza en una frontera común con la periodicidad que reemplaza. Puede
 * no haber empezado.
 */
async function primerSinReporte(sql: Cliente, indicadorId: number, periodicidad: Periodicidad, ahora: Date): Promise<Periodo> {
  const zona = zonaHoraria();
  const [i] = await sql`SELECT inicio_medicion FROM indicadores WHERE id = ${indicadorId}`;
  if (!i) throw new ErrorIndicador("El indicador no existe");
  const ultimo = await finDeLoReportado(sql, indicadorId);
  let candidato: Periodo;
  if (ultimo) {
    const tras = new Date(ultimo.getTime() + 1);
    const contiene = periodoQueContiene(periodicidad, tras, zona);
    candidato = contiene.desde.getTime() < tras.getTime() ? despues(periodicidad, contiene, zona) : contiene;
  } else {
    const inicio = i.inicio_medicion ? periodoDe(i.inicio_medicion as string, zona) : null;
    candidato = periodoQueContiene(periodicidad, inicio ? inicio.desde : ahora, zona);
  }
  // Las fronteras comunes se repiten al menos una vez al año: doce pasos bastan.
  const aprobadas = await aprobadasDeRige(sql, indicadorId);
  for (let k = 0; k < 12 && !enFronteraComun(aprobadas, candidato, zona); k++) candidato = despues(periodicidad, candidato, zona);
  return candidato;
}

/**
 * Desde cuándo rige por omisión un cambio mayor (F14-DC17): el primer periodo, en la periodicidad de la versión nueva,
 * que no se cruza con una medición reportada (sin ninguna, el que contiene el inicio de medición) y empieza en una
 * frontera común con la que reemplaza; nunca uno que no ha empezado: si lo fuera, el periodo en curso (que
 * `validarRige` puede rechazar: ver `previaDeEnvio`).
 */
export async function rigeDesdePorOmision(sql: Cliente, indicadorId: number, periodicidad: Periodicidad, ahora: Date): Promise<string> {
  const candidato = await primerSinReporte(sql, indicadorId, periodicidad, ahora);
  return candidato.desde.getTime() > ahora.getTime() ? periodoQueContiene(periodicidad, ahora, zonaHoraria()).clave : candidato.clave;
}

/**
 * Lo que la elección de «Rige desde» de un cambio mayor debe cumplir (F14-DC17): de la periodicidad de la versión nueva,
 * ya empezado, en una frontera común con la periodicidad que reemplaza, sin mediciones reportadas en él ni después y, al
 * enviar (`desdeLoPorOmision`), no anterior al de por omisión (spec §7.6.5). Al aprobar no se mira ese límite: correr el
 * tiempo no invalida lo elegido al enviar.
 */
async function validarRige(
  sql: Cliente,
  indicadorId: number,
  clave: string,
  periodicidad: Periodicidad,
  ahora: Date,
  desdeLoPorOmision: boolean,
): Promise<void> {
  const zona = zonaHoraria();
  const periodo = periodicidadDe(clave) === periodicidad ? periodoDe(clave, zona) : null;
  if (!periodo) throw new ErrorIndicador(`«Rige desde» debe ser un periodo ${ADJETIVO[periodicidad]}`);
  if (periodo.desde.getTime() > ahora.getTime()) throw new ErrorIndicador("Una versión no puede regir desde un periodo que no ha empezado");
  const aprobadas = await aprobadasDeRige(sql, indicadorId);
  const anterior = periodicidadQueReemplaza(aprobadas, periodo, zona);
  if (anterior !== null && !enFronteraComun(aprobadas, periodo, zona)) {
    throw new ErrorIndicador(
      `La ficha pasa de periodicidad ${ADJETIVO[anterior]} a ${ADJETIVO[periodicidad]}: «Rige desde» debe empezar donde empieza un periodo ${ADJETIVO[anterior]}`,
    );
  }
  const [m] = await sql`SELECT
      coalesce(bool_or(desde <= ${periodo.hasta} AND hasta >= ${periodo.desde}), false) AS en_el_periodo,
      coalesce(bool_or(desde > ${periodo.hasta}), false) AS despues
    FROM mediciones WHERE indicador_id = ${indicadorId} AND ${conDatoReportado(sql)}`;
  if (m.en_el_periodo) throw new ErrorIndicador("Ese periodo ya tiene una medición reportada");
  if (m.despues) throw new ErrorIndicador("Hay mediciones reportadas después de ese periodo: elija uno posterior");
  if (desdeLoPorOmision) {
    const porOmision = await rigeDesdePorOmision(sql, indicadorId, periodicidad, ahora);
    const minimo = periodoDe(porOmision, zonaHoraria())!;
    if (periodo.desde.getTime() < minimo.desde.getTime()) {
      throw new ErrorIndicador(`Un cambio mayor rige ${desdePeriodo(porOmision)} o desde un periodo posterior`);
    }
  }
}

/**
 * Los periodos que se pueden elegir como «Rige desde» de un cambio mayor: del de por omisión al que está en curso, solo
 * los que empiezan en una frontera común con la periodicidad que reemplazan.
 */
export async function opcionesDeRige(
  sql: Cliente,
  indicadorId: number,
  periodicidad: Periodicidad,
  ahora: Date,
): Promise<{ porOmision: string; opciones: { clave: string; etiqueta: string }[] }> {
  const zona = zonaHoraria();
  const porOmision = await rigeDesdePorOmision(sql, indicadorId, periodicidad, ahora);
  const enCurso = periodoQueContiene(periodicidad, ahora, zona);
  const aprobadas = await aprobadasDeRige(sql, indicadorId);
  const periodos = [...periodosTerminados(periodicidad, porOmision, ahora, zona), enCurso].filter((p) => enFronteraComun(aprobadas, p, zona));
  const claves = [...new Set(periodos.map((p) => p.clave))];
  return { porOmision, opciones: claves.map((clave) => ({ clave, etiqueta: etiquetaDePeriodo(clave) })) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Enviar
// ─────────────────────────────────────────────────────────────────────────────

type DatosEnvio = { versionId: number; rigeDesde?: string; motivo?: string };

type Envio = {
  indicadorId: number;
  codigo: string;
  numero: number;
  tipo: TipoCambio;
  rigeDesde: string;
  motivo: string | null;
  contenido: ContenidoFicha;
};

/** Lo que debe cumplirse para enviar, sin escribir nada. El tipo de cambio lo decide el sistema contra la vigente. */
async function validarEnvio(sql: Cliente, d: DatosEnvio, ahora: Date): Promise<Envio> {
  const [v] = await sql`SELECT v.indicador_id, v.numero, v.estado, v.prueba, v.motivo_cambio, v.periodicidad,
      i.codigo, i.estado AS indicador_estado, i.inicio_medicion,
      EXISTS (SELECT 1 FROM clasificaciones_indicador c WHERE c.id = v.clasificacion_id) AS con_clasificacion
    FROM indicador_versiones v JOIN indicadores i ON i.id = v.indicador_id
    WHERE v.id = ${d.versionId}`;
  if (!v || v.indicador_estado === "descartado") throw new ErrorIndicador(FICHA_NO_EXISTE);
  if (v.indicador_estado === "retirado") throw new ErrorIndicador("Un indicador retirado no admite cambios en su ficha");
  if (v.estado !== "borrador") throw new ErrorIndicador("Solo se envía una ficha en borrador");
  if (v.prueba === null) throw new ErrorIndicador("Pruebe la fórmula con valores de ejemplo antes de enviarla");
  // Sin clasificación no hay quién apruebe (`aprobadoresDeFicha`).
  if (!v.con_clasificacion) throw new ErrorIndicador("Elija la clasificación antes de enviar la ficha");

  const indicadorId = Number(v.indicador_id);
  const contenido = await contenidoDeVersion(sql, d.versionId);
  const vigente = await versionVigente(sql, indicadorId);
  let tipo: TipoCambio = "inicial";
  if (vigente) {
    const t = tipoDeCambio(await contenidoDeVersion(sql, vigente.id), contenido);
    if (t === "ninguno") throw new ErrorIndicador("No hay cambios que enviar");
    tipo = t;
  }
  const motivo = d.motivo?.trim() || (v.motivo_cambio as string | null)?.trim() || null;
  if (tipo !== "inicial" && !motivo) throw new ErrorIndicador("Escriba el motivo del cambio");
  if (motivo && motivo.length > 500) throw new ErrorIndicador("El motivo del cambio no puede pasar de 500 caracteres");

  let rigeDesde: string | null;
  if (tipo === "inicial") {
    rigeDesde = v.inicio_medicion as string | null;
  } else if (tipo === "menor") {
    const [r] = await sql`SELECT rige_desde FROM indicador_versiones WHERE id = ${vigente!.id}`;
    rigeDesde = r.rige_desde as string;
  } else {
    const periodicidad = v.periodicidad as Periodicidad;
    rigeDesde = d.rigeDesde ?? (await rigeDesdePorOmision(sql, indicadorId, periodicidad, ahora));
    await validarRige(sql, indicadorId, rigeDesde, periodicidad, ahora, true);
  }
  if (!rigeDesde) throw new ErrorIndicador("Elija el inicio de medición antes de enviar la ficha");
  return { indicadorId, codigo: v.codigo as string, numero: Number(v.numero), tipo, rigeDesde, motivo, contenido };
}

/**
 * Envía la ficha en borrador con la firma «Elaboró» sobre la huella de su contenido (spec §7.6.1). Un cambio menor queda
 * aprobado de inmediato, sin aprobador, y rige los mismos periodos que la versión que reemplaza; uno inicial o mayor
 * queda por aprobar y avisa a quienes pueden aprobarlo. `rigeDesde` solo cuenta en un cambio mayor; `motivo`, en un
 * cambio (sin él, el que guardó el borrador).
 */
export async function enviarAAprobacion(
  sesion: SesionFlujo,
  d: DatosEnvio & { credenciales: CredencialesFirma },
  opciones: OpcionesFlujo = {},
): Promise<{ codigo: string; menor: boolean }> {
  exigirAdministrar(sesion);
  const sql = opciones.sql ?? obtenerSql();
  const ahora = opciones.ahora ?? new Date();
  const contexto = opciones.contexto ?? { ip: null, userAgent: null };

  await validarEnvio(sql, d, ahora);
  const verificar = opciones.verificar ?? verificarParaFirmar;
  const r = await verificar(sesion, d.credenciales, contexto, ahora);
  if (!r.ok) throw new ErrorFirma(r.mensaje, r.sesionCerrada, r.bloqueada);

  return enTransaccion(sql, async (tx) => {
    await bloquear(tx, [d.versionId]);
    const e = await validarEnvio(tx, d, ahora);
    const huella = huellaDeFicha(e.contenido);
    const menor = e.tipo === "menor";
    // `elaborada_por` va antes de buscar a los aprobadores: quien elabora nunca aprueba (spec §6.3).
    await tx`UPDATE indicador_versiones SET estado = ${menor ? "aprobada" : "por_aprobar"}, tipo_cambio = ${e.tipo}, huella = ${huella},
        elaborada_por = ${sesion.usuarioId}, elaborada_en = ${ahora}, rige_desde = ${e.rigeDesde}, motivo_cambio = ${e.motivo},
        nota_devolucion = NULL, actualizado_en = ${ahora}
      WHERE id = ${d.versionId}`;
    await registrarFirma(tx, {
      tramiteId: null,
      versionId: null,
      indicadorVersionId: d.versionId,
      usuarioId: sesion.usuarioId,
      firma: "elaboro",
      ronda: 0,
      hashSha256: huella,
      metodo: r.metodo,
      contexto,
      ahora,
    });
    if (!menor) {
      const aprobadores = await aprobadoresDeFicha(d.versionId, { sql: tx });
      if (aprobadores.length > 0) {
        const cuerpo = `${e.tipo === "inicial" ? "Ficha nueva" : `Cambio mayor, versión ${e.numero}`}: la elaboró ${sesion.nombre}.`;
        await avisarA(
          tx,
          {
            tipo: "indicadores.por_aprobar",
            titulo: `Ficha por aprobar: ${e.codigo} · ${e.contenido.nombre ?? ""}`.trim(),
            enlace: enlaceDeVersion(e.codigo, e.numero),
            entidad: "indicador",
            entidadId: e.indicadorId,
          },
          aprobadores.map((usuarioId) => ({ usuarioId, cuerpo })),
        );
      }
    }
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: menor ? "indicador_cambio_menor" : "indicador_enviado",
      entidad: "indicador",
      entidadId: e.indicadorId,
      detalle: {
        codigo: e.codigo,
        nombre: e.contenido.nombre,
        versionId: d.versionId,
        numero: e.numero,
        tipoCambio: e.tipo,
        rigeDesde: e.rigeDesde,
        motivo: e.motivo,
      },
    });
    return { codigo: e.codigo, menor };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Aprobar, devolver y descartar
// ─────────────────────────────────────────────────────────────────────────────

type PorAprobar = {
  versionId: number;
  indicadorId: number;
  codigo: string;
  numero: number;
  nombre: string | null;
  tipo: TipoCambio;
  huella: string;
  rigeDesde: string;
  elaboradaPor: number | null;
};

/** Si la versión se envió alguna vez (está aprobada o lleva una firma «Elaboró»): su aprobador ya supo de ella. */
const fueEnviada = (sql: Cliente) => sql`(v.estado = 'aprobada' OR EXISTS (
  SELECT 1 FROM firmas env_f WHERE env_f.indicador_version_id = v.id AND env_f.firma = 'elaboro'))`;

/**
 * Por qué no se puede aprobar ni devolver una versión que ya no está por aprobar. El código solo se dice de una que se
 * envió alguna vez; de un borrador que nunca se envió o de uno descartado así, el mismo mensaje que a quien no le toca:
 * `aprobadoresDeFicha` no mira el estado y el código de un borrador no debe salir por aquí (spec §6.4).
 */
const yaNo = (v: Record<string, unknown>) => new ErrorIndicador(v.enviada === true ? yaNoPorAprobar(v.codigo as string) : NO_LE_TOCA);

/**
 * Lo que debe cumplirse para aprobar, sin escribir nada, en orden de id. Primero si a la persona le toca (quien no es su
 * aprobador recibe siempre el mismo mensaje, sin código), después si sigue por aprobar y si su contenido es el firmado.
 */
async function validarAprobacion(sql: Cliente, sesion: SujetoVisibilidad, ids: readonly number[], ahora: Date): Promise<PorAprobar[]> {
  const filas = await sql`SELECT v.id, v.indicador_id, v.numero, v.estado, v.tipo_cambio, v.nombre, v.huella, v.rige_desde,
      v.elaborada_por, v.periodicidad, i.codigo, i.estado AS indicador_estado, i.inicio_medicion, ${fueEnviada(sql)} AS enviada
    FROM indicador_versiones v JOIN indicadores i ON i.id = v.indicador_id
    WHERE v.id IN ${sql(ids)}`;
  const salida: PorAprobar[] = [];
  for (const id of ids) {
    const v = filas.find((f) => Number(f.id) === id);
    if (!v || !(await puedeAprobarFicha(id, sesion, { sql }))) throw new ErrorIndicador(NO_LE_TOCA);
    const codigo = v.codigo as string;
    if (v.estado !== "por_aprobar" || v.indicador_estado === "retirado" || v.indicador_estado === "descartado") throw yaNo(v);
    if (huellaDeFicha(await contenidoDeVersion(sql, id)) !== v.huella) {
      throw new ErrorIndicador(`La ficha ${codigo} cambió después de la firma de quien la elaboró`);
    }
    const tipo = v.tipo_cambio as TipoCambio;
    // La versión inicial rige desde el inicio de medición de hoy; un cambio mayor, desde lo elegido, si sigue sin reporte.
    let rigeDesde = v.rige_desde as string;
    if (tipo === "inicial") {
      rigeDesde = (v.inicio_medicion as string | null) ?? rigeDesde;
    } else if (tipo === "mayor") {
      try {
        await validarRige(sql, Number(v.indicador_id), rigeDesde, v.periodicidad as Periodicidad, ahora, false);
      } catch (err) {
        if (!(err instanceof ErrorIndicador)) throw err;
        throw new ErrorIndicador(`La ficha ${codigo} ya no puede regir ${desdePeriodo(rigeDesde)}: devuélvala para que elijan otro periodo`);
      }
    }
    salida.push({
      versionId: id,
      indicadorId: Number(v.indicador_id),
      codigo,
      numero: Number(v.numero),
      nombre: v.nombre as string | null,
      tipo,
      huella: v.huella as string,
      rigeDesde,
      elaboradaPor: v.elaborada_por === null ? null : Number(v.elaborada_por),
    });
  }
  return salida;
}

/**
 * Aprueba las fichas elegidas con una sola clave y la firma «Aprobó» sobre la huella de cada una (spec §7.6.3 y §7.6.4).
 * Todo o nada: si alguna ya no está por aprobar o no le corresponde a la persona, no se firma ninguna y el mensaje dice
 * cuál. La primera versión aprobada deja el indicador activo.
 */
export async function aprobarFichas(
  sesion: SesionFlujo,
  d: { versionIds: number[]; credenciales: CredencialesFirma },
  opciones: OpcionesFlujo = {},
): Promise<{ aprobadas: number }> {
  if (!puede(sesion, "indicadores.aprobar")) throw new ErrorPermiso();
  const ids = [...new Set(d.versionIds)].sort((a, b) => a - b);
  if (ids.length === 0) throw new ErrorIndicador("Elija al menos una ficha");
  if (ids.length > MAXIMO_EN_BLOQUE) throw new ErrorIndicador(`Elija hasta ${MAXIMO_EN_BLOQUE} fichas`);
  const sql = opciones.sql ?? obtenerSql();
  const ahora = opciones.ahora ?? new Date();
  const contexto = opciones.contexto ?? { ip: null, userAgent: null };

  await validarAprobacion(sql, sesion, ids, ahora);
  // Una sola verificación: el código del segundo factor no sirve dos veces.
  const verificar = opciones.verificar ?? verificarParaFirmar;
  const r = await verificar(sesion, d.credenciales, contexto, ahora);
  if (!r.ok) throw new ErrorFirma(r.mensaje, r.sesionCerrada, r.bloqueada);

  return enTransaccion(sql, async (tx) => {
    await bloquear(tx, ids);
    const fichas = await validarAprobacion(tx, sesion, ids, ahora);
    for (const f of fichas) {
      await tx`UPDATE indicador_versiones SET estado = 'aprobada', aprobada_por = ${sesion.usuarioId}, aprobada_en = ${ahora},
          rige_desde = ${f.rigeDesde}, actualizado_en = ${ahora}
        WHERE id = ${f.versionId}`;
      await registrarFirma(tx, {
        tramiteId: null,
        versionId: null,
        indicadorVersionId: f.versionId,
        usuarioId: sesion.usuarioId,
        firma: "aprobo",
        ronda: 0,
        hashSha256: f.huella,
        metodo: r.metodo,
        contexto,
        ahora,
      });
      // Un cambio mayor de periodicidad deja vacías de la periodicidad vieja en su tramo: se quitan (las que tienen datos, no).
      const medicionesQuitadas = f.tipo === "mayor" ? await quitarMedicionesDeOtraPeriodicidad(tx, f.indicadorId, f.rigeDesde) : 0;
      if (f.tipo === "inicial") {
        await tx`UPDATE indicadores SET estado = 'activo' WHERE id = ${f.indicadorId} AND estado = 'borrador'`;
        // Al aprobarse la primera versión se abren de una vez los periodos históricos (spec §8.1).
        await asegurarMediciones({ sql: tx, ahora, indicadorId: f.indicadorId });
        // Quienes se designaron antes de la primera aprobación no pudieron recibir su aviso: el indicador no existía para ellos.
        const designados = await tx`SELECT DISTINCT d.usuario_id, d.funcion FROM indicador_designados d
          JOIN usuarios u ON u.id = d.usuario_id AND u.activo
          WHERE d.indicador_id = ${f.indicadorId} AND d.usuario_id <> ${sesion.usuarioId} ORDER BY d.usuario_id, d.funcion`;
        for (const funcion of FUNCIONES_DESIGNADO) {
          const personas = designados.filter((x) => x.funcion === funcion).map((x) => Number(x.usuario_id));
          if (personas.length === 0) continue;
          await avisarA(
            tx,
            {
              tipo: "indicadores.designacion",
              titulo: `${AVISO_DESIGNACION[funcion]} ${f.codigo}`,
              enlace: `/indicadores/${encodeURIComponent(f.codigo)}`,
              entidad: "indicador",
              entidadId: f.indicadorId,
            },
            personas.map((usuarioId) => ({ usuarioId, cuerpo: `${AVISO_DESIGNACION[funcion]} ${f.codigo}${f.nombre ? `: ${f.nombre}` : ""}` })),
          );
        }
      }
      if (f.elaboradaPor !== null) {
        await avisarA(
          tx,
          {
            tipo: "indicadores.aprobada",
            titulo: `Se aprobó la ficha de ${f.codigo}`,
            enlace: enlaceDeVersion(f.codigo, f.numero),
            entidad: "indicador",
            entidadId: f.indicadorId,
          },
          [{ usuarioId: f.elaboradaPor, cuerpo: `Versión ${f.numero}, aprobada por ${sesion.nombre}. Rige ${desdePeriodo(f.rigeDesde)}.` }],
        );
      }
      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: "indicador_aprobado",
        entidad: "indicador",
        entidadId: f.indicadorId,
        detalle: {
          codigo: f.codigo,
          nombre: f.nombre,
          versionId: f.versionId,
          numero: f.numero,
          tipoCambio: f.tipo,
          rigeDesde: f.rigeDesde,
          ...(f.tipo === "mayor" ? { medicionesQuitadas } : {}),
        },
      });
    }
    return { aprobadas: fichas.length };
  });
}

/**
 * Devuelve una ficha por aprobar a borrador, con nota y sin clave, y avisa a quien la elaboró (spec §7.6.3). Responde el
 * código, para que la página lo confirme.
 */
export async function devolverFicha(
  sesion: SesionFlujo,
  d: { versionId: number; nota: string },
  opciones?: Opciones,
): Promise<{ codigo: string }> {
  if (!puede(sesion, "indicadores.aprobar")) throw new ErrorPermiso();
  const nota = d.nota.trim();
  if (nota.length < 5) throw new ErrorIndicador("La nota debe tener al menos 5 caracteres");
  if (nota.length > 1000) throw new ErrorIndicador("La nota no puede pasar de 1000 caracteres");
  const ahora = opciones?.ahora ?? new Date();
  return enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    await bloquear(tx, [d.versionId]);
    const [v] = await tx`SELECT v.indicador_id, v.numero, v.estado, v.nombre, v.elaborada_por, i.codigo, ${fueEnviada(tx)} AS enviada
      FROM indicador_versiones v JOIN indicadores i ON i.id = v.indicador_id WHERE v.id = ${d.versionId}`;
    if (!v || !(await puedeAprobarFicha(d.versionId, sesion, { sql: tx }))) throw new ErrorIndicador(NO_LE_TOCA);
    const codigo = v.codigo as string;
    if (v.estado !== "por_aprobar") throw yaNo(v);
    // De vuelta en borrador no queda nada de la firma de quien la elaboró en la versión: la firma sigue en `firmas`.
    await tx`UPDATE indicador_versiones SET estado = 'borrador', nota_devolucion = ${nota}, huella = NULL, elaborada_por = NULL,
        elaborada_en = NULL, rige_desde = NULL, actualizado_en = ${ahora}
      WHERE id = ${d.versionId}`;
    const indicadorId = Number(v.indicador_id);
    if (v.elaborada_por !== null) {
      await avisarA(
        tx,
        {
          tipo: "indicadores.devuelta",
          titulo: `Devolvieron la ficha de ${codigo}`,
          enlace: `/indicadores/${encodeURIComponent(codigo)}/editar`,
          entidad: "indicador",
          entidadId: indicadorId,
        },
        [{ usuarioId: Number(v.elaborada_por), cuerpo: nota }],
      );
    }
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "indicador_devuelto",
      entidad: "indicador",
      entidadId: indicadorId,
      detalle: { codigo, nombre: v.nombre as string | null, versionId: d.versionId, numero: Number(v.numero), nota },
    });
    return { codigo };
  });
}

/**
 * Descarta el borrador de un cambio: la ficha vigente queda como estaba y el número no se reusa. La versión 1 de un
 * indicador nuevo no se descarta aquí: el indicador se descarta o se borra entero (spec §7.7).
 */
export async function descartarBorrador(sesion: SesionFlujo, versionId: number, opciones?: Opciones): Promise<void> {
  exigirAdministrar(sesion);
  const ahora = opciones?.ahora ?? new Date();
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    await bloquear(tx, [versionId]);
    const [v] = await tx`SELECT v.indicador_id, v.numero, v.estado, v.nombre, i.codigo
      FROM indicador_versiones v JOIN indicadores i ON i.id = v.indicador_id WHERE v.id = ${versionId}`;
    if (!v) throw new ErrorIndicador(FICHA_NO_EXISTE);
    if (v.estado !== "borrador") throw new ErrorIndicador("Solo se descarta una ficha en borrador");
    const indicadorId = Number(v.indicador_id);
    if (!(await versionVigente(tx, indicadorId))) {
      throw new ErrorIndicador("La ficha de un indicador nuevo no se descarta aquí: descarte o borre el indicador");
    }
    await tx`UPDATE indicador_versiones SET estado = 'descartada', actualizado_en = ${ahora} WHERE id = ${versionId}`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "indicador_borrador_descartado",
      entidad: "indicador",
      entidadId: indicadorId,
      detalle: { codigo: v.codigo as string, nombre: v.nombre as string | null, versionId, numero: Number(v.numero) },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// «Por aprobar»
// ─────────────────────────────────────────────────────────────────────────────

/** El nombre congelado en la última firma «Elaboró» de la versión. */
const ultimoElaboro = (sql: Cliente) => sql`(SELECT f.nombre_firmante FROM firmas f
  WHERE f.indicador_version_id = v.id AND f.firma = 'elaboro' ORDER BY f.id DESC LIMIT 1)`;

export type FichaPorAprobar = {
  versionId: number;
  indicadorId: number;
  codigo: string;
  numero: number;
  nombre: string;
  proceso: string;
  tipoCambio: TipoCambio;
  /** Lo que cambió frente a la vigente; vacío en una ficha nueva. */
  cambios: string[];
  motivo: string | null;
  elaboro: string;
  enviadaEn: Date;
};

/** Lo que cambió una versión frente a la vigente del indicador; vacío si no hay vigente o si es ella. */
export async function cambiosFrenteALaVigente(sql: Cliente, indicadorId: number, versionId: number): Promise<string[]> {
  const vigente = await versionVigente(sql, indicadorId);
  if (!vigente || vigente.id === versionId) return [];
  return camposCambiados(await contenidoDeVersion(sql, vigente.id), await contenidoDeVersion(sql, versionId));
}

/** Las fichas por aprobar de las que la persona es hoy aprobadora (spec §12.6), de la más antigua a la más reciente. */
export async function fichasPorAprobar(sesion: SujetoVisibilidad, opciones?: { sql?: Cliente }): Promise<FichaPorAprobar[]> {
  if (!puede(sesion, "indicadores.aprobar")) return [];
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT v.id, v.indicador_id, v.numero, v.tipo_cambio, v.nombre, v.proceso_nombre, v.motivo_cambio,
      v.elaborada_en, i.codigo, ${ultimoElaboro(sql)} AS elaboro
    FROM indicador_versiones v JOIN indicadores i ON i.id = v.indicador_id
    WHERE v.estado = 'por_aprobar' AND i.estado IN ('borrador', 'activo')
    ORDER BY v.elaborada_en, v.id`;
  const salida: FichaPorAprobar[] = [];
  for (const f of filas) {
    const versionId = Number(f.id);
    if (!(await puedeAprobarFicha(versionId, sesion, { sql }))) continue;
    const indicadorId = Number(f.indicador_id);
    salida.push({
      versionId,
      indicadorId,
      codigo: f.codigo as string,
      numero: Number(f.numero),
      nombre: (f.nombre as string | null) ?? "",
      proceso: (f.proceso_nombre as string | null) ?? "",
      tipoCambio: f.tipo_cambio as TipoCambio,
      cambios: f.tipo_cambio === "inicial" ? [] : await cambiosFrenteALaVigente(sql, indicadorId, versionId),
      motivo: (f.motivo_cambio as string | null) ?? null,
      elaboro: (f.elaboro as string | null) ?? "",
      enviadaEn: new Date(f.elaborada_en as string),
    });
  }
  return salida;
}

export type FichaEnCurso = {
  versionId: number;
  codigo: string;
  numero: number;
  nombre: string;
  proceso: string;
  estado: "borrador" | "por_aprobar";
  tipoCambio: TipoCambio;
  /** La nota de quien la devolvió; `null` si no se ha devuelto. */
  nota: string | null;
  /** Cuándo se guardó por última vez (borrador) o se envió (por aprobar). */
  fecha: Date;
};

/** Para quien administra: los borradores (con la nota si se devolvieron) y lo enviado que espera aprobación. */
export async function fichasEnCurso(sesion: SujetoVisibilidad, opciones?: { sql?: Cliente }): Promise<FichaEnCurso[]> {
  if (!puede(sesion, "indicadores.administrar")) return [];
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT v.id, v.numero, v.estado, v.tipo_cambio, v.nombre, v.proceso_nombre, v.nota_devolucion,
      v.actualizado_en, v.elaborada_en, i.codigo
    FROM indicador_versiones v JOIN indicadores i ON i.id = v.indicador_id
    WHERE v.estado IN ('borrador', 'por_aprobar') AND i.estado IN ('borrador', 'activo')
    ORDER BY (v.nota_devolucion IS NULL), v.actualizado_en DESC, v.id DESC`;
  return filas.map((f) => ({
    versionId: Number(f.id),
    codigo: f.codigo as string,
    numero: Number(f.numero),
    nombre: (f.nombre as string | null) ?? "",
    proceso: (f.proceso_nombre as string | null) ?? "",
    estado: f.estado as FichaEnCurso["estado"],
    tipoCambio: f.tipo_cambio as TipoCambio,
    nota: (f.nota_devolucion as string | null) ?? null,
    fecha: new Date((f.estado === "por_aprobar" ? (f.elaborada_en ?? f.actualizado_en) : f.actualizado_en) as string),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Lo que cada persona ve de la ficha
// ─────────────────────────────────────────────────────────────────────────────

export type VersionVisible = { id: number; numero: number; estado: EstadoVersion; aprueba: boolean };

/**
 * Las versiones de la ficha que la persona puede abrir (spec §6.4): las aprobadas, quien ve el indicador; las demás,
 * quien administra; y la que está por aprobar, también quien debe aprobarla, aunque el indicador aún no exista para él
 * (`ve` falso). `aprueba` dice si la persona puede aprobarla ahora.
 */
export async function versionesVisibles(
  sesion: SujetoVisibilidad,
  indicadorId: number,
  opciones?: { sql?: Cliente },
): Promise<{ ve: boolean; versiones: VersionVisible[] }> {
  const sql = opciones?.sql ?? obtenerSql();
  const ve = await puedeVerIndicador(indicadorId, sesion, { sql });
  const administra = puede(sesion, "indicadores.administrar");
  const aprobador = puede(sesion, "indicadores.aprobar");
  const filas = await sql`SELECT id, numero, estado FROM indicador_versiones WHERE indicador_id = ${indicadorId} ORDER BY numero`;
  const versiones: VersionVisible[] = [];
  for (const f of filas) {
    const id = Number(f.id);
    const estado = f.estado as EstadoVersion;
    const aprueba = estado === "por_aprobar" && aprobador && (await puedeAprobarFicha(id, sesion, { sql }));
    if ((estado === "aprobada" && ve) || administra || aprueba) versiones.push({ id, numero: Number(f.numero), estado, aprueba });
  }
  return { ve, versiones };
}

export type FirmaDeFicha = { nombre: string; cargo: string | null; fecha: Date };

export type FichaLeida = {
  versionId: number;
  indicadorId: number;
  numero: number;
  estado: EstadoVersion;
  tipoCambio: TipoCambio;
  rigeDesde: string | null;
  motivo: string | null;
  notaDevolucion: string | null;
  elaboradaEn: Date | null;
  /** El contenido firmado; sin el id del procedimiento si la persona no ve ese documento. */
  contenido: ContenidoFicha;
  /** El procedimiento enlazado, solo si la persona ve ese documento (F13C-R11). */
  procedimiento: { id: number; codigo: string; titulo: string } | null;
  /** Tomadas de `firmas`: el nombre y el cargo congelados al firmar. */
  firmas: { elaboro: FirmaDeFicha | null; aprobo: FirmaDeFicha | null };
  /** La persona puede aprobarla ahora. */
  aprueba: boolean;
};

const firmaDe = (f: Record<string, unknown> | undefined): FirmaDeFicha | null =>
  f ? { nombre: f.nombre_firmante as string, cargo: (f.cargo_firmante as string | null) ?? null, fecha: new Date(f.creado_en as string) } : null;

/** Una versión de la ficha para leerla, si la persona puede abrirla (`versionesVisibles`); si no, `null`. */
export async function fichaDeVersion(sesion: SujetoVisibilidad, versionId: number, opciones?: { sql?: Cliente }): Promise<FichaLeida | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [v] = await sql`SELECT indicador_id, numero, estado, tipo_cambio, rige_desde, motivo_cambio, nota_devolucion, huella, elaborada_en
    FROM indicador_versiones WHERE id = ${versionId}`;
  if (!v) return null;
  const indicadorId = Number(v.indicador_id);
  const visible = (await versionesVisibles(sesion, indicadorId, { sql })).versiones.find((x) => x.id === versionId);
  if (!visible) return null;

  const contenido = await contenidoDeVersion(sql, versionId);
  let procedimiento: FichaLeida["procedimiento"] = null;
  if (contenido.procedimientoDocumentoId !== null) {
    const [doc] = await sql`SELECT d.id, d.codigo, d.titulo FROM documentos d
      WHERE d.id = ${contenido.procedimientoDocumentoId} AND ${filtroAcceso(sql, sesion)}`;
    procedimiento = doc ? { id: Number(doc.id), codigo: doc.codigo as string, titulo: doc.titulo as string } : null;
  }
  const firmas = await sql`SELECT firma, hash_sha256, nombre_firmante, cargo_firmante, creado_en FROM firmas
    WHERE indicador_version_id = ${versionId} ORDER BY id DESC`;
  const huella = v.huella as string | null;
  return {
    versionId,
    indicadorId,
    numero: Number(v.numero),
    estado: v.estado as EstadoVersion,
    tipoCambio: v.tipo_cambio as TipoCambio,
    rigeDesde: (v.rige_desde as string | null) ?? null,
    motivo: (v.motivo_cambio as string | null) ?? null,
    notaDevolucion: (v.nota_devolucion as string | null) ?? null,
    elaboradaEn: fecha(v.elaborada_en),
    contenido: { ...contenido, procedimientoDocumentoId: procedimiento ? procedimiento.id : null },
    procedimiento,
    firmas: {
      elaboro: huella === null ? null : firmaDe(firmas.find((f) => f.firma === "elaboro" && f.hash_sha256 === huella)),
      aprobo: v.estado === "aprobada" ? firmaDe(firmas.find((f) => f.firma === "aprobo")) : null,
    },
    aprueba: visible.aprueba,
  };
}

export type OperacionLeida = DatosOperacion & { mide: string[]; analiza: string[]; seguimiento: string[] };

/** Los datos de operación del indicador (spec §7.3) y sus designados activos: no se versionan ni se firman. */
export async function operacionDeIndicador(indicadorId: number, opciones?: { sql?: Cliente }): Promise<OperacionLeida> {
  const sql = opciones?.sql ?? obtenerSql();
  const [i] = await sql`SELECT plazo_reporte_dias, inicio_medicion, soporte_obligatorio, nivel_acceso FROM indicadores WHERE id = ${indicadorId}`;
  if (!i) throw new ErrorIndicador("El indicador no existe");
  const designados = await sql`SELECT d.funcion, u.nombre FROM indicador_designados d
    JOIN usuarios u ON u.id = d.usuario_id AND u.activo
    WHERE d.indicador_id = ${indicadorId} ORDER BY u.nombre, d.id`;
  const de = (funcion: string) => designados.filter((x) => x.funcion === funcion).map((x) => x.nombre as string);
  return {
    plazoReporteDias: Number(i.plazo_reporte_dias),
    inicioMedicion: (i.inicio_medicion as string | null) ?? "",
    soporteObligatorio: i.soporte_obligatorio as boolean,
    nivelAcceso: i.nivel_acceso as DatosOperacion["nivelAcceso"],
    mide: de("mide"),
    analiza: de("analiza"),
    seguimiento: de("seguimiento"),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Control de cambios
// ─────────────────────────────────────────────────────────────────────────────

export type VersionResumen = {
  id: number;
  numero: number;
  tipoCambio: TipoCambio;
  rigeDesde: string;
  motivo: string | null;
  /** Lo que cambió frente a la versión aprobada anterior; vacío en la inicial. */
  cambios: string[];
  elaboro: string | null;
  elaboradaEn: Date | null;
  /** `null` en un cambio menor: no requiere aprobación. */
  aprobo: string | null;
  aprobadaEn: Date | null;
};

/**
 * El control de cambios (spec §7.6.6), de la versión más reciente a la primera: solo las aprobadas, que ve todo el que
 * ve el indicador. Los nombres y las fechas salen de las firmas.
 */
export async function versionesDe(indicadorId: number, opciones?: { sql?: Cliente }): Promise<VersionResumen[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT v.id, v.numero, v.tipo_cambio, v.rige_desde, v.motivo_cambio, v.elaborada_en, v.aprobada_en,
      el.nombre_firmante AS elaboro, el.creado_en AS elaboro_en, ap.nombre_firmante AS aprobo, ap.creado_en AS aprobo_en
    FROM indicador_versiones v
    LEFT JOIN LATERAL (SELECT nombre_firmante, creado_en FROM firmas
      WHERE indicador_version_id = v.id AND firma = 'elaboro' AND hash_sha256 = v.huella ORDER BY id DESC LIMIT 1) el ON true
    LEFT JOIN LATERAL (SELECT nombre_firmante, creado_en FROM firmas
      WHERE indicador_version_id = v.id AND firma = 'aprobo' ORDER BY id DESC LIMIT 1) ap ON true
    WHERE v.indicador_id = ${indicadorId} AND v.estado = 'aprobada'
    ORDER BY v.numero`;
  const contenidos: ContenidoFicha[] = [];
  for (const f of filas) contenidos.push(await contenidoDeVersion(sql, Number(f.id)));
  return filas
    .map((f, i) => ({
      id: Number(f.id),
      numero: Number(f.numero),
      tipoCambio: f.tipo_cambio as TipoCambio,
      rigeDesde: f.rige_desde as string,
      motivo: (f.motivo_cambio as string | null) ?? null,
      cambios: i === 0 ? [] : camposCambiados(contenidos[i - 1], contenidos[i]),
      elaboro: (f.elaboro as string | null) ?? null,
      elaboradaEn: fecha(f.elaboro_en ?? f.elaborada_en),
      aprobo: (f.aprobo as string | null) ?? null,
      aprobadaEn: fecha(f.aprobo_en ?? f.aprobada_en),
    }))
    .reverse();
}

// ─────────────────────────────────────────────────────────────────────────────
// Lo que el diálogo de envío muestra
// ─────────────────────────────────────────────────────────────────────────────

export type PreviaDeEnvio = {
  versionId: number;
  numero: number;
  /** «ninguno» si el borrador no cambia nada frente a la vigente. */
  tipo: TipoCambio | "ninguno";
  cambios: string[];
  huella: string;
  probada: boolean;
  motivo: string | null;
  /** La nota de quien la devolvió, si se devolvió. */
  notaDevolucion: string | null;
  /** Desde cuándo regirá: el inicio de medición (inicial) o el de la versión que reemplaza (menor). */
  rigeDesde: string | null;
  /** Solo en un cambio mayor que hoy se puede enviar: los periodos que se pueden elegir. */
  rige: { porOmision: string; opciones: { clave: string; etiqueta: string }[] } | null;
  /**
   * Un cambio mayor que hoy no tiene desde cuándo regir (todo lo empezado ya tiene mediciones reportadas): el primer
   * periodo de su periodicidad sin reporte, desde cuyo inicio se podrá enviar. `null` en los demás casos.
   */
  enviableDesde: string | null;
};

/** Para quien administra: qué se va a firmar al enviar el borrador guardado. `null` si la versión no es un borrador. */
export async function previaDeEnvio(sesion: SujetoPermiso, versionId: number, opciones?: Opciones): Promise<PreviaDeEnvio | null> {
  exigirAdministrar(sesion);
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const [v] = await sql`SELECT v.indicador_id, v.numero, v.estado, v.prueba, v.motivo_cambio, v.nota_devolucion, v.periodicidad,
      i.inicio_medicion
    FROM indicador_versiones v JOIN indicadores i ON i.id = v.indicador_id WHERE v.id = ${versionId}`;
  if (!v || v.estado !== "borrador") return null;
  const indicadorId = Number(v.indicador_id);
  const contenido = await contenidoDeVersion(sql, versionId);
  const vigente = await versionVigente(sql, indicadorId);
  const tipo = vigente ? tipoDeCambio(await contenidoDeVersion(sql, vigente.id), contenido) : "inicial";
  let rigeDesde: string | null = null;
  if (tipo === "inicial") rigeDesde = (v.inicio_medicion as string | null) ?? null;
  if (tipo === "menor") {
    const [r] = await sql`SELECT rige_desde FROM indicador_versiones WHERE id = ${vigente!.id}`;
    rigeDesde = r.rige_desde as string;
  }
  const periodicidad = v.periodicidad as Periodicidad | null;
  let rige: PreviaDeEnvio["rige"] = null;
  let enviableDesde: string | null = null;
  if (tipo === "mayor" && periodicidad) {
    rige = await opcionesDeRige(sql, indicadorId, periodicidad, ahora);
    // El de por omisión es el más temprano posible: si no pasa, ningún otro de la lista pasa.
    try {
      await validarRige(sql, indicadorId, rige.porOmision, periodicidad, ahora, true);
    } catch (err) {
      if (!(err instanceof ErrorIndicador)) throw err;
      rige = null;
      enviableDesde = (await primerSinReporte(sql, indicadorId, periodicidad, ahora)).clave;
    }
  }
  return {
    versionId,
    numero: Number(v.numero),
    tipo,
    cambios: vigente ? await cambiosFrenteALaVigente(sql, indicadorId, versionId) : [],
    huella: huellaDeFicha(contenido),
    probada: v.prueba !== null,
    motivo: (v.motivo_cambio as string | null) ?? null,
    notaDevolucion: (v.nota_devolucion as string | null) ?? null,
    rigeDesde,
    rige,
    enviableDesde,
  };
}
