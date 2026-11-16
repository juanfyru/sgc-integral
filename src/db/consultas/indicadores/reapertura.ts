/**
 * La reapertura de lo cerrado (spec 14 §8.7, F14-DC31; anexo 14C, §3.5): una medición sola (`reabrirLaMedicion`, la que usa
 * `reabrirMedicion` de `cierre.ts`) o, en cascada, un periodo de un dato compartido o la medición de un componente con todo
 * lo cerrado que los usó (`reabrirEnCascada`), y la lista que se ve antes de confirmar (`listaDeReapertura`). Es de quien
 * administra, con justificación y sin clave. Lo que se reabre queda «Corregida», con su evento, su aviso y su entrada de
 * bitácora; las de un indicador retirado o de otra periodicidad quedan como están (`dependientesDe`). Una constancia de envío
 * al ente no cambia: guarda lo que se envió (anexo 14B, §8).
 *
 * **Orden de candados**, el mismo del cierre del mes (`clasificar`, en `cierre.ts`), para que la cascada, el cierre y quien
 * reporta no se interbloqueen:
 *   0. el candado consultivo del cierre (`serializarCierreYReapertura`, `candado-del-cierre.ts`), la primera sentencia de la
 *      transacción de todo lo que cierra o reabre: el cierre del mes, la cascada, el camino directo de `reabrirMedicion`,
 *      «Cerrar de nuevo» una medición (`cerrarDeNuevo`) y un periodo de un dato (`cerrarDeNuevoElDato`). Deciden con lo que
 *      está cerrado y lo que depende de qué, y sin él uno puede decidir con lo que otro está cambiando (el cierre ve cerrada
 *      una entrada que la cascada reabre a la vez y cierra lo que la usa). Toda lectura que decide va después de él, en la
 *      misma transacción; lo que se lee antes (para elegir el camino o pintar la lista) se vuelve a leer dentro;
 *   1. los periodos de los datos, `FOR UPDATE`, por id: aquí, el que se reabre. La fila del dato (`variables_compartidas`) no
 *      se toma: quien lo edita la toma `FOR UPDATE` sin tocar sus periodos, y quien reporta la toma `FOR SHARE` antes de su
 *      único periodo;
 *   2. los indicadores de lo que se reabre (el de la medición fuente y los de sus dependientes), `FOR SHARE`, por id;
 *   3. sus mediciones, `FOR UPDATE`, por `indicador_id, desde, id`: de cada indicador, todas desde la más temprana que se
 *      reabre, también las abiertas que siguen, porque el cálculo único de cada reabierta recalcula después las siguientes de
 *      su racha (`recalcularSiguientes`) y las bloquea: así ninguna fila se bloquea fuera de este orden.
 * Las fuentes se leen sin candado, como en la propagación. Es el candado consultivo, no la relectura, lo que impide el cruce
 * con un cierre; con todo bloqueado la lista se calcula otra vez, y si no es la que el diálogo mostró (`vistas`, anexo 14C
 * §3.5: se confirma lo que se vio), no se reabre nada (`LO_QUE_SE_REABRE_CAMBIO`). Un `40P01` que se cruce con quien reporta
 * llega legible a la persona (`sinInterbloqueoDelCierre`, en la acción). Después de confirmar, la propagación recalcula lo
 * reabierto con el valor de hoy de su fuente.
 *
 * El aviso de cada dependiente nombra la fuente solo a quien puede verla (un dato, `puedeVerDato`; un componente,
 * `componentesVisibles`, la regla única del anexo §6.5), por destinatario; a los demás, «un componente» o, si es un dato, «una de sus fuentes». El evento y la
 * bitácora guardan solo su referencia (`porFuente`, `{ clase, id }`), nunca su nombre: el historial la resuelve al leer
 * (`fuenteEnTexto`), con la visibilidad de quien lee. Al reabrir un periodo de un dato se avisa también a sus responsables.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { avisarA } from "@/db/consultas/avisos-vencimiento";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import {
  componentesVisibles,
  puedeMedir,
  puedeReportarDato,
  puedeVerDato,
  responsablesDeAnalizar,
  responsablesDeDato,
  responsablesDeMedir,
  type SujetoVisibilidad,
} from "@/lib/alcance";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { JUSTIFICACION_MAXIMA, JUSTIFICACION_MINIMA } from "@/lib/indicadores/cierre";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { ErrorPermiso, puede, type SujetoPermiso } from "@/lib/permisos";
import { textoFecha } from "@/lib/vigencia/plazo";
import { zonaHoraria } from "@/lib/zona-horaria";
import { serializarCierreYReapertura } from "./candado-del-cierre";
import { PERIODO_NO_EXISTE } from "./datos-periodos";
import { constanciasDe, dependientesDe, type Dependiente, type Fuente } from "./dependencias";
import { contextoDeMedicion, mide, NO_EXISTE, recalcularMedicion, versionesAprobadas, type Contexto, type CondicionDePersona } from "./mediciones";
import { propagarSinFallar } from "./propagacion";

export type { Dependiente, Fuente } from "./dependencias";

type Opciones = { sql?: Cliente; ahora?: Date };

const SOLO_CERRADO = "Solo se reabre lo que está cerrado";
export const LO_QUE_SE_REABRE_CAMBIO = "Lo que se reabre cambió mientras se confirmaba: revise la lista y vuelva a intentarlo";
export const INTERBLOQUEO_DEL_CIERRE = "Otra persona estaba reportando o cerrando una de esas mediciones al mismo tiempo: inténtelo de nuevo";

function exigirAdministrar(sesion: SujetoPermiso): void {
  if (!puede(sesion, "indicadores.administrar")) throw new ErrorPermiso();
}


/**
 * El cierre y la reapertura en cascada bloquean varios indicadores (ver el encabezado): si se cruzan con quien reporta o
 * corrige a la vez, PostgreSQL cancela una con `40P01` (entre ellos no se cruzan: los serializa el candado consultivo del
 * cierre). Para el `.catch` de una acción: ese error, legible; los demás, tal cual.
 */
export function sinInterbloqueoDelCierre(err: unknown): never {
  throw (err as { code?: string } | null)?.code === "40P01" ? new ErrorIndicador(INTERBLOQUEO_DEL_CIERRE) : err;
}

/**
 * El permiso ya se exigió: quien administra reabre sin ser quien mide (`contextoDeMedicion` pide medir por omisión). Reabrir
 * no digita datos: también reabre la de un automático.
 */
export const ADMINISTRA: CondicionDePersona = async () => ({ puede: true, sinMedidor: false });
export const COMO_ADMINISTRADOR = { admiteCerrada: true, exigir: ADMINISTRA, digita: false };

/** La justificación de una reapertura, sin los espacios de los extremos, entre los límites de `lib/indicadores/cierre`. */
export function justificacionDe(valor: unknown): string {
  const t = typeof valor === "string" ? valor.trim() : "";
  if (t.length < JUSTIFICACION_MINIMA) throw new ErrorIndicador(`La justificación debe tener al menos ${JUSTIFICACION_MINIMA} caracteres`);
  if (t.length > JUSTIFICACION_MAXIMA) throw new ErrorIndicador(`La justificación no puede pasar de ${JUSTIFICACION_MAXIMA} caracteres`);
  return t;
}

/** El mes del cierre que la cerró («2026-03»), o `null`. */
async function mesDelCierre(sql: Cliente, cierreId: unknown): Promise<string | null> {
  if (cierreId === null || cierreId === undefined) return null;
  const [c] = await sql`SELECT to_char(mes, 'YYYY-MM') AS mes FROM cierres_indicadores WHERE id = ${Number(cierreId)}`;
  return (c?.mes as string | undefined) ?? null;
}

/** «marzo de 2026»: la etiqueta de un periodo, o su clave si no es un periodo. */
const etiquetaDe = (clave: string) => periodoDe(clave, zonaHoraria())?.etiqueta ?? clave;

/**
 * Cómo se nombra la fuente de una cascada: `texto` para quien la ve (`ve`), «el dato «Total facturado», marzo de 2026» o
 * «CEX-ID-002 Oportunidad de la cita, marzo de 2026»; `oculta` para quien no, «una de sus fuentes» o «un componente».
 */
export type FuenteEnTexto = { texto: string; oculta: string; ve: (sujeto: SujetoVisibilidad) => Promise<boolean> };

/** Lo que se dice de la fuente a quien no la ve (anexo 14C, §3.5: «por un cambio en un componente»). */
export const OCULTA: Readonly<Record<Fuente["clase"], string>> = { dato: "una de sus fuentes", medicion: "un componente" };

/** La fuente de una cascada (`porFuente`, `{ clase, id }`) en texto, leída hoy; `null` si ya no está. */
export async function fuenteEnTexto(sql: Cliente, ref: { clase: Fuente["clase"]; id: number }): Promise<FuenteEnTexto | null> {
  if (ref.clase === "dato") {
    const [p] = await sql`SELECT vv.periodo, d.id, d.nombre FROM variable_valores vv JOIN variables_compartidas d ON d.id = vv.variable_id
      WHERE vv.id = ${ref.id}`;
    if (!p) return null;
    const datoId = Number(p.id);
    return {
      texto: `el dato «${p.nombre as string}», ${etiquetaDe(p.periodo as string)}`,
      oculta: OCULTA.dato,
      ve: (sujeto) => puedeVerDato(datoId, sujeto, { sql }),
    };
  }
  const [m] = await sql`SELECT m.periodo, i.id, i.codigo FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id WHERE m.id = ${ref.id}`;
  if (!m) return null;
  const indicadorId = Number(m.id);
  const nombre = (await versionesAprobadas(sql, indicadorId))[0]?.nombre ?? (m.codigo as string);
  return {
    texto: `${m.codigo as string} ${nombre}, ${etiquetaDe(m.periodo as string)}`,
    oculta: OCULTA.medicion,
    ve: async (sujeto) => (await componentesVisibles(sql, sujeto, [indicadorId])).has(indicadorId),
  };
}

/** Quien recibe un aviso, con su rol de hoy: con él se decide si ve la fuente. */
async function sujetosDe(tx: TransactionSql, ids: readonly number[]): Promise<Map<number, SujetoVisibilidad>> {
  if (ids.length === 0) return new Map();
  const filas = await tx`SELECT id, rol, ver_historial FROM usuarios WHERE id IN ${tx([...ids])}`;
  return new Map(filas.map((u) => [Number(u.id), { usuarioId: Number(u.id), rol: u.rol, verHistorial: u.ver_historial === true }]));
}

/**
 * Reabre una medición cerrada ya bloqueada (`ctx`, de `contextoDeMedicion` con `COMO_ADMINISTRADOR`): queda «Corregida» y
 * vuelve a `reportada` o a `abierta` (lo decide `recalcularMedicion`, con el evento `reapertura` cuyo estado de antes es
 * `cerrada`), se avisa a quienes miden (o, si nadie la mide, a quienes analizan), salvo a quien reabre, y queda en la
 * bitácora. Es el único cambio que el trigger admite en una cerrada. Si quien reabre está designado para medir, el evento y
 * la bitácora lo marcan (`propioMedidor`); si solo mide como respaldo, `sinMedidor`; en lo que nadie mide (un automático o un
 * indicador sin variables propias), ninguna de las dos. Con `porFuente` (una cascada), el evento y la bitácora guardan la
 * referencia de la fuente y el aviso la nombra solo a quien puede verla.
 */
export async function reabrirLaMedicion(
  tx: TransactionSql,
  sesion: SesionFlujo,
  ctx: Contexto,
  d: { justificacion: string; ahora: Date; porFuente?: { clase: Fuente["clase"]; id: number; aviso: FuenteEnTexto | null } },
): Promise<void> {
  const m = ctx.medicion;
  const { justificacion, ahora } = d;
  const cierre = await mesDelCierre(tx, m.cierre_id);
  // El único cambio que el trigger admite en una cerrada; el estado lo decide enseguida el cálculo.
  await tx`UPDATE mediciones SET estado = 'abierta', reabierta_por = ${sesion.usuarioId}, reabierta_en = ${ahora},
      reabierta_motivo = ${justificacion}, corregida = true, cierre_id = NULL, sin_analisis = false
    WHERE id = ${m.id}`;
  const nadieLoMide = !mide(ctx.version);
  const capacidad = nadieLoMide ? null : await puedeMedir(ctx.indicador.id, sesion, { sql: tx });
  const marca = !capacidad?.puede ? {} : capacidad.sinMedidor ? { sinMedidor: true } : { propioMedidor: true };
  const porFuente = d.porFuente ? { porFuente: { clase: d.porFuente.clase, id: d.porFuente.id } } : {};
  // El estado de antes es el verdadero (`cerrada`), no el provisional del UPDATE: el evento queda siempre.
  const r = await recalcularMedicion(tx, m.id, {
    ahora,
    actorId: sesion.usuarioId,
    evento: "reapertura",
    estadoAnterior: "cerrada",
    detalle: { justificacion, cierre, ...porFuente, ...marca },
  });
  const codigo = ctx.indicador.codigo;
  const periodo = m.periodo as string;
  const responsables = nadieLoMide ? responsablesDeAnalizar : responsablesDeMedir;
  const destinatarios = (await responsables(ctx.indicador.id, { sql: tx })).filter((u) => u !== sesion.usuarioId);
  if (destinatarios.length > 0) {
    const reabrio = `${sesion.nombre} reabrió ${codigo}, ${ctx.periodo.etiqueta}`;
    const sujetos = d.porFuente ? await sujetosDe(tx, destinatarios) : new Map<number, SujetoVisibilidad>();
    const cuerpos = [];
    for (const usuarioId of destinatarios) {
      let porque = "";
      if (d.porFuente) {
        const sujeto = sujetos.get(usuarioId);
        const aviso = d.porFuente.aviso;
        const ve = sujeto && aviso ? await aviso.ve(sujeto) : false;
        porque = `, por un cambio en ${ve && aviso ? aviso.texto : OCULTA[d.porFuente.clase]}`;
      }
      cuerpos.push({ usuarioId, cuerpo: `${reabrio}${porque}: ${justificacion}` });
    }
    await avisarA(
      tx,
      {
        tipo: "indicadores.reabierta",
        titulo: `Medición reabierta en ${codigo}`,
        enlace: `/indicadores/${encodeURIComponent(codigo)}?vista=resultados&anio=${periodo.slice(0, 4)}`,
        entidad: "medicion",
        entidadId: m.id,
      },
      cuerpos,
    );
  }
  await registrarAuditoria(tx, {
    usuarioId: sesion.usuarioId,
    accion: "medicion_reabierta",
    entidad: "medicion",
    entidadId: m.id,
    detalle: { codigo, indicadorId: ctx.indicador.id, periodo, justificacion, cierre, estado: r.estado, ...porFuente, ...marca },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// La fuente
// ─────────────────────────────────────────────────────────────────────────────

const idValido = (id: unknown) => typeof id === "number" && Number.isSafeInteger(id) && id > 0;

/** La fuente con su id comprobado: si no es válido, «no existe». */
function fuenteValida(f: Fuente): Fuente {
  if (f.clase === "dato") {
    if (!idValido(f.periodoId)) throw new ErrorIndicador(PERIODO_NO_EXISTE);
    return { clase: "dato", periodoId: f.periodoId };
  }
  if (f.clase === "medicion" && idValido(f.medicionId)) return { clase: "medicion", medicionId: f.medicionId };
  throw new ErrorIndicador(NO_EXISTE);
}

type FuenteLeida =
  | { clase: "dato"; fila: Record<string, unknown> & { id: number; datoId: number; nombre: string; periodo: string }; titulo: string }
  | { clase: "medicion"; ctx: Contexto; nombre: string; titulo: string };

/**
 * La fuente como está (con `bloquear`, dentro de la transacción y ya bloqueada por `bloquear`): un periodo del dato con el
 * nombre del dato, o la medición con lo que exige reabrirla (`contextoDeMedicion`: un indicador retirado no se reabre, ni lo
 * de otra periodicidad). Con su título («Reabrir «Total facturado en el mes» · agosto de 2026»).
 */
async function leerFuente(sql: Cliente, sesion: SesionFlujo, f: Fuente, bloquear: boolean): Promise<FuenteLeida> {
  if (f.clase === "dato") {
    const [p] = await sql`SELECT vv.*, d.nombre FROM variable_valores vv JOIN variables_compartidas d ON d.id = vv.variable_id WHERE vv.id = ${f.periodoId}`;
    if (!p) throw new ErrorIndicador(PERIODO_NO_EXISTE);
    const fila = { ...p, id: Number(p.id), datoId: Number(p.variable_id), nombre: p.nombre as string, periodo: p.periodo as string };
    const etiqueta = etiquetaDe(fila.periodo);
    return { clase: "dato", fila, titulo: `Reabrir «${fila.nombre}» · ${etiqueta}` };
  }
  const ctx = await contextoDeMedicion(sql, sesion, f.medicionId, bloquear, COMO_ADMINISTRADOR);
  const nombre = (await versionesAprobadas(sql, ctx.indicador.id))[0]?.nombre ?? ctx.indicador.codigo;
  return {
    clase: "medicion",
    ctx,
    nombre,
    titulo: `Reabrir ${ctx.indicador.codigo}, ${ctx.periodo.etiqueta}`,
  };
}

const estaCerrada = (f: FuenteLeida) => (f.clase === "dato" ? f.fila.estado === "cerrado" : f.ctx.medicion.estado === "cerrada");

/**
 * Lo que se va a reabrir con `fuente` (maqueta 13): el título del diálogo, las mediciones cerradas que se reabren (las que la
 * usaron y las que dependen de esas) y las que no, con su razón (`dependientesDe`). Solo quien administra: ve todo.
 */
export async function listaDeReapertura(
  sesion: SesionFlujo,
  fuente: Fuente,
  opciones?: Opciones,
): Promise<{ titulo: string; seReabren: Dependiente[]; noSeReabren: Dependiente[] }> {
  exigirAdministrar(sesion);
  const sql = opciones?.sql ?? obtenerSql();
  const f = fuenteValida(fuente);
  const { titulo } = await leerFuente(sql, sesion, f, false);
  const lista = await dependientesDe(sql, f);
  return { titulo, seReabren: lista.filter((x) => x.seReabre), noSeReabren: lista.filter((x) => !x.seReabre) };
}

/**
 * Los candados del encabezado, en su orden: el periodo del dato; los indicadores de las mediciones (la fuente y las que se
 * reabren), `FOR SHARE`; y de cada uno, sus mediciones desde la más temprana que se reabre, `FOR UPDATE`. Devuelve los ids de
 * todas las mediciones que quedaron bloqueadas.
 */
async function bloquear(tx: TransactionSql, fuente: Fuente, seReabren: readonly Dependiente[]): Promise<Set<number>> {
  if (fuente.clase === "dato") await tx`SELECT id FROM variable_valores WHERE id = ${fuente.periodoId} FOR UPDATE`;
  const ids = [...(fuente.clase === "medicion" ? [fuente.medicionId] : []), ...seReabren.map((x) => x.medicionId)];
  if (ids.length === 0) return new Set();
  const desde = await tx`SELECT indicador_id, min(desde) AS desde FROM mediciones WHERE id IN ${tx(ids)} GROUP BY indicador_id ORDER BY indicador_id`;
  const indicadores = desde.map((f) => Number(f.indicador_id));
  await tx`SELECT id FROM indicadores WHERE id IN ${tx(indicadores)} ORDER BY id FOR SHARE`;
  const filas = await tx`SELECT m.id FROM mediciones m
    JOIN unnest(${tx.array(indicadores)}::bigint[], ${tx.array(desde.map((f) => new Date(f.desde as Date).toISOString()))}::timestamptz[]) AS x(indicador_id, desde)
      ON m.indicador_id = x.indicador_id AND m.desde >= x.desde
    ORDER BY m.indicador_id, m.desde, m.id
    FOR UPDATE OF m`;
  return new Set(filas.map((f) => Number(f.id)));
}

/**
 * Reabre en cascada (anexo 14C, §3.5): un periodo cerrado de un dato compartido (también para reportarlo tarde) o la medición
 * cerrada de un componente, y cada medición cerrada que la usó o depende de las que la usaron (`dependientesDe`), con una
 * justificación de al menos 10 caracteres y sin clave. En una transacción, con los candados del encabezado y la lista
 * calculada otra vez con todo bloqueado: el periodo del dato vuelve a `reportado` si tiene valor y a `pendiente` si no,
 * `corregido`, con quién, cuándo y por qué y su evento `reapertura` (que marca `propioResponsable` si quien reabre también lo
 * reporta, o `sinResponsable` si lo reporta de respaldo) y su bitácora (`dato_reabierto`); la medición fuente, como una sola
 * (`reabrirLaMedicion`); y cada dependiente que se reabre, igual, con `porFuente`. Las que no se reabren no se tocan.
 * Con `vistas` (las mediciones que el diálogo listó en «se reabren», con la fuente si es una medición; anexo 14C §3.5: se
 * confirma lo que se vio), si lo que se reabriría con todo bloqueado no es eso mismo, no reabre nada. Después de confirmar,
 * propaga a lo reabierto. `reabiertas` cuenta las mediciones reabiertas (con la fuente, si es una); `sinTocar`, las que
 * quedaron como estaban.
 */
export async function reabrirEnCascada(
  sesion: SesionFlujo,
  d: { fuente: Fuente; justificacion: string; vistas?: readonly number[] },
  opciones?: Opciones,
): Promise<{ reabiertas: number; sinTocar: number }> {
  exigirAdministrar(sesion);
  const justificacion = justificacionDe(d.justificacion);
  const fuente = fuenteValida(d.fuente);
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  // Lo que puede fallar sin escribir, antes de los candados (F13A-R4): que exista, que esté cerrada y que se pueda reabrir.
  if (!estaCerrada(await leerFuente(sql, sesion, fuente, false))) throw new ErrorIndicador(SOLO_CERRADO);

  const hecho = await enTransaccion(sql, async (tx) => {
    await serializarCierreYReapertura(tx);
    const bloqueadas = await bloquear(tx, fuente, (await dependientesDe(tx, fuente)).filter((x) => x.seReabre));
    const f = await leerFuente(tx, sesion, fuente, true);
    if (!estaCerrada(f)) throw new ErrorIndicador(SOLO_CERRADO);
    const lista = await dependientesDe(tx, fuente);
    const seReabren = lista.filter((x) => x.seReabre);
    if (seReabren.some((x) => !bloqueadas.has(x.medicionId))) throw new ErrorIndicador(LO_QUE_SE_REABRE_CAMBIO);
    if (d.vistas !== undefined) {
      const enOrden = (ids: readonly number[]) => JSON.stringify([...new Set(ids)].sort((a, b) => a - b));
      const seReabriran = [...(fuente.clase === "medicion" ? [fuente.medicionId] : []), ...seReabren.map((x) => x.medicionId)];
      if (enOrden(d.vistas) !== enOrden(seReabriran)) throw new ErrorIndicador(LO_QUE_SE_REABRE_CAMBIO);
    }
    const sinTocar = lista.length - seReabren.length;
    const indicadores = new Set(seReabren.map((x) => x.indicadorId));
    let reabiertas = 0;

    if (f.clase === "dato") {
      await reabrirElPeriodo(tx, sesion, f.fila, { justificacion, ahora, reabiertas: seReabren.length, sinTocar });
    } else {
      await reabrirLaMedicion(tx, sesion, f.ctx, { justificacion, ahora });
      indicadores.add(f.ctx.indicador.id);
      reabiertas += 1;
    }
    const ref = { clase: fuente.clase, id: fuente.clase === "dato" ? fuente.periodoId : fuente.medicionId };
    const porFuente = { ...ref, aviso: await fuenteEnTexto(tx, ref) };
    const enOrden = [...seReabren].sort((a, b) => a.indicadorId - b.indicadorId || a.periodo.localeCompare(b.periodo) || a.medicionId - b.medicionId);
    for (const x of enOrden) {
      const ctx = await contextoDeMedicion(tx, sesion, x.medicionId, true, COMO_ADMINISTRADOR);
      if (ctx.medicion.estado !== "cerrada") throw new ErrorIndicador(LO_QUE_SE_REABRE_CAMBIO);
      await reabrirLaMedicion(tx, sesion, ctx, { justificacion, ahora, porFuente });
      reabiertas += 1;
    }
    return { reabiertas, sinTocar, indicadores: [...indicadores] };
  });
  await propagarSinFallar({ sql, ahora, indicadorIds: hecho.indicadores });
  return { reabiertas: hecho.reabiertas, sinTocar: hecho.sinTocar };
}

/**
 * El periodo cerrado del dato, ya bloqueado, vuelve a `reportado` (con valor) o a `pendiente`, con su evento, el aviso a sus
 * responsables (salvo a quien reabre) y su bitácora.
 */
async function reabrirElPeriodo(
  tx: TransactionSql,
  sesion: SesionFlujo,
  p: Record<string, unknown> & { id: number; datoId: number; nombre: string; periodo: string },
  d: { justificacion: string; ahora: Date; reabiertas: number; sinTocar: number },
): Promise<void> {
  const estado = p.valor === null || p.valor === undefined ? "pendiente" : "reportado";
  const cierre = await mesDelCierre(tx, p.cierre_id);
  await tx`UPDATE variable_valores SET estado = ${estado}, corregido = true, reabierto_por = ${sesion.usuarioId}, reabierto_en = ${d.ahora},
      reapertura_justificacion = ${d.justificacion}, cierre_id = NULL
    WHERE id = ${p.id}`;
  // Quien reabre y además lo reporta (anexo 14C, §4.4), como `propioMedidor` en una medición; de respaldo, `sinResponsable`.
  const capacidad = await puedeReportarDato(p.datoId, sesion, { sql: tx });
  const marca = !capacidad.puede ? {} : capacidad.sinMedidor ? { sinResponsable: true } : { propioResponsable: true };
  const detalle = { justificacion: d.justificacion, cierre, antes: { estado: "cerrado" }, despues: { estado }, ...marca };
  await tx`INSERT INTO variable_eventos (valor_id, tipo, usuario_id, detalle, creado_en)
    VALUES (${p.id}, 'reapertura', ${sesion.usuarioId}, ${tx.json(detalle)}, ${d.ahora})`;
  // Sus responsables, para que lo corrijan o lo reporten tarde; su plazo y sus marcas de aviso no se tocan.
  const responsables = (await responsablesDeDato(tx, p.datoId)).filter((u) => u !== sesion.usuarioId);
  if (responsables.length > 0) {
    await avisarA(
      tx,
      {
        tipo: "indicadores.dato_reabierto",
        titulo: `Dato compartido reabierto: ${p.nombre}`,
        enlace: `/indicadores/datos/${p.datoId}`,
        entidad: "dato_compartido",
        entidadId: p.datoId,
      },
      responsables.map((usuarioId) => ({
        usuarioId,
        cuerpo: `${sesion.nombre} reabrió el dato «${p.nombre}», ${etiquetaDe(p.periodo)}: ${d.justificacion}`,
      })),
    );
  }
  await registrarAuditoria(tx, {
    usuarioId: sesion.usuarioId,
    accion: "dato_reabierto",
    entidad: "dato_compartido",
    entidadId: p.datoId,
    detalle: {
      nombre: p.nombre,
      periodo: p.periodo,
      periodoId: p.id,
      justificacion: d.justificacion,
      cierre,
      estado,
      reabiertas: d.reabiertas,
      sinTocar: d.sinTocar,
      ...marca,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// La lista en el diálogo
// ─────────────────────────────────────────────────────────────────────────────

/** La lista de una reapertura lista para el diálogo (maqueta 13), con sus textos ya en la zona de la instalación. */
export type ReaperturaEnTexto = {
  titulo: string;
  /** La fuente es un dato: el botón dice «Reabrir el dato y {n} mediciones». */
  deDato: boolean;
  /** Las que se reabren; si la fuente es una medición, ella primero. */
  seReabren: { id: number; texto: string; constancia: string | null }[];
  noSeReabren: { id: number; texto: string }[];
};

const RAZON: Record<Exclude<Dependiente["porQueNo"], null>, string> = {
  retirado: "indicador retirado: queda como está",
  otra_periodicidad: "de otra periodicidad: queda como está",
};

/**
 * `listaDeReapertura` para el diálogo, de quien administra: «FAC-ID-001 Porcentaje de glosa inicial · agosto de 2026», con
 * «Ya se reportó al ente el 12 oct 2026» si la constancia ya se registró, y la razón de las que no se reabren. Para una
 * medición, la lista de las que se reabren empieza por ella. `null` si la fuente no tiene dependientes cerradas y es una
 * medición: su diálogo es el de siempre.
 */
export async function reaperturaEnTexto(sesion: SesionFlujo, fuente: Fuente, opciones?: Opciones): Promise<ReaperturaEnTexto | null> {
  exigirAdministrar(sesion);
  const sql = opciones?.sql ?? obtenerSql();
  const valida = fuenteValida(fuente);
  // Primero lo que depende de ella: la tabla del año lo pide por cada cerrada, y casi ninguna tiene dependientes.
  const lista = await dependientesDe(sql, valida);
  if (valida.clase === "medicion" && lista.length === 0) return null;
  const f = await leerFuente(sql, sesion, valida, false);
  const zona = zonaHoraria();
  const constancia = (en: Date | null) => (en ? `Ya se reportó al ente el ${textoFecha(en, zona)}` : null);
  const linea = (x: { codigo: string; nombre: string; periodo: string }) => `${x.codigo} ${x.nombre} · ${etiquetaDe(x.periodo)}`;
  const seReabren = lista.filter((x) => x.seReabre).map((x) => ({ id: x.medicionId, texto: linea(x), constancia: constancia(x.constanciaEn) }));
  if (f.clase === "medicion") {
    const yo = { medicionId: f.ctx.medicion.id, indicadorId: f.ctx.indicador.id };
    const en = (await constanciasDe(sql, [yo])).get(yo.medicionId) ?? null;
    seReabren.unshift({
      id: yo.medicionId,
      texto: linea({ codigo: f.ctx.indicador.codigo, nombre: f.nombre, periodo: f.ctx.medicion.periodo as string }),
      constancia: constancia(en),
    });
  }
  return {
    titulo: f.titulo,
    deDato: f.clase === "dato",
    seReabren,
    noSeReabren: lista.filter((x) => !x.seReabre).map((x) => ({ id: x.medicionId, texto: `${linea(x)} · ${RAZON[x.porQueNo ?? "retirado"]}` })),
  };
}
