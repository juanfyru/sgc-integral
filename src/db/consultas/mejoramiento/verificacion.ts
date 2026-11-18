/**
 * Verificar la implementación, evaluar la eficacia y cerrar (spec 15 §11, §8.7 y §12; Tarea 16). Quien ejecutó no verifica:
 * la regla es `puedeVerificar` (`src/lib/alcance.ts`), y se repite dentro de cada transacción. Verificar no lleva firma; evaluar
 * firma «Verificó» y cerrar «Cerró», con F13A-R4 (un validador de solo lectura, la clave con `verificarParaFirmar` fuera de la
 * transacción y, dentro, el hallazgo bloqueado y todo otra vez). Cuando evalúa «eficaz» un Admin SGC, el mismo acto cierra: una
 * sola clave y las dos firmas. «No eficaz» abre la ronda siguiente (`nuevaRonda` del motor) y deja la evaluada como estaba.
 *
 * Lo que la persona escribe con texto libre (las notas de la verificación, la justificación, las lecciones, cómo se atendieron
 * los cambios) y lo que la pantalla mostró (`visto`) van a sus columnas y al evento, nunca a la bitácora (`soloEnElEvento`).
 *
 * Orden de candados: el hallazgo `FOR UPDATE` (`bloquearHallazgo`), después la ronda en curso y, al verificar, sus actividades.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { avisarA } from "@/db/consultas/avisos-vencimiento";
import { registrarFirma } from "@/db/consultas/firmas";
import { enTransaccion, type OpcionesFlujo, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { basesDe, leerPeriodos } from "@/db/consultas/indicadores/lectura";
import { lideresDeProceso } from "@/db/consultas/tramites";
import { puedeVerHallazgo, puedeVerificar, puedeVerIndicador, quienesVerifican } from "@/lib/alcance";
import {
  EsquemaCierre,
  EsquemaEvaluacion,
  EsquemaVerificacion,
  SIN_DECIDIR,
  SIN_LECCIONES,
  type CierreValidado,
  type EvaluacionValidada,
} from "@/lib/esquemas/mejoramiento";
import type { CredencialesFirma } from "@/lib/firma";
import type { Periodicidad } from "@/lib/indicadores/tipos";
import { fechaMinimaDeEficacia, leerCriterios, yaSePuedeEvaluar } from "@/lib/mejoramiento/eficacia";
import { fechaLargaDeDia } from "@/lib/mejoramiento/formato";
import { huellaDeCierre, huellaDeContenido, huellaDeEvaluacion } from "@/lib/mejoramiento/huellas";
import { rutaDeActividad } from "@/lib/mejoramiento/rutas";
import { ErrorMejora, METODOS_DE_VERIFICACION, type CriterioEficacia, type HallazgoBase } from "@/lib/mejoramiento/tipos";
import { YA_CAMBIO } from "@/lib/mejoramiento/transiciones";
import { ErrorPermiso, puede, requerirPermiso } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { leer } from "./analisis";
import { verificarFirma } from "./aprobacion";
import { activosDeRol, avisarDeMejora, ENTIDAD_ACTIVIDAD } from "./avisos";
import { contextoDeMejora, type ContextoMejora } from "./config";
import { bloquearHallazgo, hallazgoBase, legible, NO_EXISTE, transicionarHallazgo } from "./flujo";
import { indicadorDeEficacia } from "./indicador-de-eficacia";
import { etiquetaDeActividad } from "./plan";

export { METODOS_DE_VERIFICACION };

type Persona = Pick<SesionFlujo, "usuarioId" | "rol" | "verHistorial">;
type Opciones = { sql?: Cliente; ahora?: Date };

export const NADIE_PUEDE_VERIFICAR = "Nadie puede verificar este hallazgo: quienes tienen el rol participaron en su ejecución";
export const AJUSTE_POR_DECIDIR = "Hay un ajuste por decidir: decídalo antes de verificar";
export const ACTIVIDAD_AJENA = "Una de las actividades no es de este plan: vuelva a cargar la página";
export const INDICADOR_RETIRADO = "El indicador se retiró: evalúe con otro criterio";
export const SIN_INDICADOR_ENLAZADO = "El plan no enlazó un indicador: evalúe con otro criterio";
export const CAMBIOS_SIN_ATENDER = "Diga cómo se atendieron los cambios que el análisis pidió";
export const SIN_FIRMA_DE_LA_EVALUACION = "La evaluación de la eficacia no tiene su firma «Verificó»: vuelva a cargar la página";
export const LO_VISTO_CAMBIO = "Cambió lo que se muestra para evaluar: revíselo";
export const PERIODO_DESPUES_DE_HOY = "El periodo evaluado no puede terminar después de hoy";

/** El aviso al responsable de una actividad devuelta (spec §11.4 y §14.2): sin la nota ni el contenido del hallazgo. */
export const ACTIVIDAD_DEVUELTA = "Se devolvió una actividad suya en la verificación";

export const notaCorta = (actividad: string) => `La nota de la actividad ${actividad} debe tener al menos 10 caracteres`;
export const sinFechaParaCorregir = (actividad: string) => `Escriba hasta cuándo se corrige la actividad ${actividad}`;
export const fechaParaCorregirPasada = (actividad: string) => `La fecha para corregir la actividad ${actividad} no puede ser anterior a hoy`;
export const desdeLaMinima = (minima: string) => `La eficacia se puede evaluar desde el ${fechaLargaDeDia(minima)}`;
export const ocurrenciasSinConfirmar = (n: number) =>
  n === 1
    ? "Hay 1 ocurrencia posterior a la implementación: confírmelo para registrar la eficacia"
    : `Hay ${n} ocurrencias posteriores a la implementación: confírmelo para registrar la eficacia`;

// ─────────────────────────────────────────────────────────────────────────────
// Lo común
// ─────────────────────────────────────────────────────────────────────────────

async function existente(sql: Cliente, hallazgoId: number): Promise<HallazgoBase> {
  const h = await hallazgoBase(sql, hallazgoId);
  if (!h) throw new ErrorMejora(NO_EXISTE);
  return h;
}

/**
 * Quien no puede verificar (spec §11.1): a quien no ve el hallazgo, no existe; si nadie puede (todos los que tienen el rol
 * ejecutaron), lo dice, porque se resuelve dando el rol a otra persona; si otro puede, `ErrorPermiso`.
 */
async function exigirVerificador(sql: Cliente, p: Persona, hallazgoId: number): Promise<void> {
  if (await puedeVerificar(hallazgoId, p, { sql })) return;
  if (!(await puedeVerHallazgo(hallazgoId, p, { sql }))) throw new ErrorMejora(NO_EXISTE);
  throw (await quienesVerifican(sql, hallazgoId)).length === 0 ? new ErrorMejora(NADIE_PUEDE_VERIFICAR) : new ErrorPermiso();
}

type RondaEnCurso = {
  id: number;
  numero: number;
  criterios: CriterioEficacia[];
  indicadorId: number | null;
  fechaEvaluacion: string | null;
  cambios: unknown;
};

/** La ronda en curso del hallazgo; con `bloquear`, `FOR UPDATE` (después del hallazgo). */
async function rondaEnCurso(sql: Cliente, h: Pick<HallazgoBase, "id" | "ronda">, bloquear = false): Promise<RondaEnCurso> {
  const [r] = await sql`SELECT id, numero, criterios, indicador_eficacia_id, cambios, to_char(fecha_evaluacion, 'YYYY-MM-DD') AS fecha_evaluacion
    FROM mejora_rondas WHERE hallazgo_id = ${h.id} AND numero = ${h.ronda} ${bloquear ? sql`FOR UPDATE` : sql``}`;
  if (!r) throw new ErrorMejora(YA_CAMBIO);
  return {
    id: Number(r.id),
    numero: Number(r.numero),
    criterios: leerCriterios(r.criterios),
    indicadorId: r.indicador_eficacia_id === null ? null : Number(r.indicador_eficacia_id),
    fechaEvaluacion: (r.fecha_evaluacion as string | null) ?? null,
    cambios: r.cambios ?? null,
  };
}

/** Si la segunda pregunta del análisis pidió cambios en documentos, riesgos o controles (spec §9.3 y §11.5). */
function pideCambios(cambios: unknown): boolean {
  if (typeof cambios !== "object" || cambios === null) return false;
  const c = cambios as Record<string, unknown>;
  return c.documentos === true || c.riesgos === true || c.controles === true;
}

/** Lo que el cierre exige (spec §11.5): las lecciones y, si el análisis pidió cambios, cómo se atendieron. */
function exigirLoDelCierre(lecciones: string | null, cambiosAtendidos: string | null, cambios: unknown): void {
  if (!lecciones) throw new ErrorMejora(SIN_LECCIONES);
  if (pideCambios(cambios) && !cambiosAtendidos) throw new ErrorMejora(CAMBIOS_SIN_ATENDER);
}

/**
 * Los avisos del cierre (spec §11.5 y §14.2): a los líderes activos del proceso, a quien lo registró y a cada usuario activo de
 * Gerencia, que no firma; nunca a quien cierra.
 */
async function avisarDelCierre(tx: TransactionSql, sesion: Persona, h: HallazgoBase): Promise<void> {
  const lideres = await lideresDeProceso(h.procesoId, { sql: tx });
  const [registro] = await tx`SELECT id FROM usuarios WHERE id = ${h.registradoPor} AND activo`;
  const gerencia = await activosDeRol(tx, ["gerencia"]);
  const destinos = [...new Set([...lideres, ...(registro ? [Number(registro.id)] : []), ...gerencia])].filter((u) => u !== sesion.usuarioId);
  const [{ titulo }] = await tx`SELECT titulo FROM mejora_hallazgos WHERE id = ${h.id}`;
  await avisarDeMejora(
    tx,
    { tipo: "mejora.cerrado", titulo: `Se cerró ${h.codigo}: el plan fue eficaz`, hallazgoId: h.id },
    destinos.map((usuarioId) => ({ usuarioId, cuerpo: titulo as string })),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Verificar la implementación (spec §11.4), sin firma
// ─────────────────────────────────────────────────────────────────────────────

/**
 * En un solo acto, quien puede verificar marca cada actividad terminada de la ronda en curso como conforme o la devuelve (con
 * su nota, de al menos diez caracteres, y una fecha para corregir de hoy en adelante) y dice cómo verificó. No se verifica con
 * un ajuste por decidir en la ronda. Si devuelve alguna, esas vuelven a «En proceso» (su fin original y su fin no cambian) y
 * el hallazgo a «En ejecución», con un aviso a cada responsable de una devuelta (y no el de turno a todos); el evento guarda
 * de cada devuelta los archivos y el último seguimiento que tenía, para que terminarla otra vez pida algo nuevo. Con todas
 * conformes, la ronda guarda quién, cuándo, los métodos y la nota, y el hallazgo pasa a «En espera de eficacia».
 */
export async function verificarImplementacion(
  sesion: SesionFlujo,
  d: {
    hallazgoId: number;
    actividades: Array<{ id: number; conforme: boolean; nota?: string | null; corregirAntesDe?: string | null }>;
    metodos: string[];
    nota?: string | null;
  },
  opciones?: OpcionesFlujo,
): Promise<void> {
  requerirPermiso(sesion, "mejora.verificar");
  const v = leer(EsquemaVerificacion, d);
  const ahora = opciones?.ahora ?? new Date();
  await legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      const h = await bloquearHallazgo(tx, v.hallazgoId);
      await exigirVerificador(tx, sesion, h.id);
      if (h.estado !== "por_verificar") throw new ErrorMejora(YA_CAMBIO);
      const ronda = await rondaEnCurso(tx, h, true);
      const [pendiente] = await tx`SELECT 1 FROM mejora_ajustes WHERE ronda_id = ${ronda.id} AND estado = 'pendiente' LIMIT 1`;
      if (pendiente) throw new ErrorMejora(AJUSTE_POR_DECIDIR);
      const actividades = await tx`SELECT a.id, a.orden, a.estado, a.responsable_id, ac.orden AS accion_orden
        FROM mejora_actividades a JOIN mejora_acciones ac ON ac.id = a.accion_id
        WHERE ac.ronda_id = ${ronda.id} AND a.estado <> 'cancelada'
        ORDER BY ac.orden, a.orden, a.id FOR UPDATE OF a`;
      if (actividades.some((a) => a.estado !== "terminada")) throw new ErrorMejora(YA_CAMBIO);
      const deLaRonda = new Set(actividades.map((a) => Number(a.id)));
      if (v.actividades.some((x) => !deLaRonda.has(x.id))) throw new ErrorMejora(ACTIVIDAD_AJENA);
      const decision = new Map(v.actividades.map((x) => [x.id, x]));
      if (actividades.some((a) => !decision.has(Number(a.id)))) throw new ErrorMejora(SIN_DECIDIR);

      const c = await contextoDeMejora(tx, ahora);
      const hoy = fechaEnZona(ahora, c.zona);
      const conformes: Array<{ id: number; etiqueta: string }> = [];
      const devueltas: Array<{
        id: number;
        etiqueta: string;
        responsableId: number;
        nota: string;
        corregirAntesDe: string;
        archivos: number[];
        seguimiento: number | null;
      }> = [];
      for (const a of actividades) {
        const id = Number(a.id);
        const etiqueta = etiquetaDeActividad(Number(a.accion_orden), Number(a.orden));
        const x = decision.get(id)!;
        if (x.conforme) {
          conformes.push({ id, etiqueta });
          continue;
        }
        if (!x.nota || x.nota.length < 10) throw new ErrorMejora(notaCorta(etiqueta));
        if (!x.corregirAntesDe) throw new ErrorMejora(sinFechaParaCorregir(etiqueta));
        if (x.corregirAntesDe < hoy) throw new ErrorMejora(fechaParaCorregirPasada(etiqueta));
        // Lo que había al devolverla: terminarla otra vez pide un seguimiento y un archivo posteriores (por id, `terminarActividad`).
        const archivos = await tx`SELECT id FROM archivos
          WHERE contexto = 'mejora_actividad' AND contexto_id = ${id} AND version_id IS NULL ORDER BY id`;
        const [ultimo] = await tx`SELECT max(id) AS id FROM mejora_seguimientos WHERE actividad_id = ${id}`;
        devueltas.push({
          id,
          etiqueta,
          responsableId: Number(a.responsable_id),
          nota: x.nota,
          corregirAntesDe: x.corregirAntesDe,
          archivos: archivos.map((f) => Number(f.id)),
          seguimiento: ultimo?.id === null || ultimo?.id === undefined ? null : Number(ultimo.id),
        });
      }

      if (conformes.length > 0) {
        await tx`UPDATE mejora_actividades SET verificacion = 'conforme', verificacion_nota = NULL, corregir_antes_de = NULL
          WHERE id IN ${tx(conformes.map((x) => x.id))}`;
      }
      for (const x of devueltas) {
        // Vuelve a estar abierta: quién la terminó queda en su evento `actividad_terminada` (lo lee `quienesVerifican`).
        await tx`UPDATE mejora_actividades
          SET estado = 'en_proceso', verificacion = 'devuelta', verificacion_nota = ${x.nota}, corregir_antes_de = ${x.corregirAntesDe},
            terminada_en = NULL, terminada_por = NULL
          WHERE id = ${x.id}`;
      }
      if (devueltas.length === 0) {
        await tx`UPDATE mejora_rondas
          SET verificada_por = ${sesion.usuarioId}, verificada_en = ${ahora}, verificacion_metodos = ${tx.json(v.metodos as never)},
            verificacion_nota = ${v.nota}
          WHERE id = ${ronda.id}`;
      }
      await transicionarHallazgo(
        tx,
        sesion,
        h,
        "verificar_implementacion",
        {
          rumbo: { devolvioAlguna: devueltas.length > 0 },
          detalle: { metodos: v.metodos, conformes: conformes.map((x) => x.etiqueta), devueltas: devueltas.map((x) => x.etiqueta) },
          soloEnElEvento: {
            ...(v.nota ? { nota: v.nota } : {}),
            ...(devueltas.length > 0
              ? {
                  notas: devueltas.map((x) => ({
                    actividadId: x.id,
                    actividad: x.etiqueta,
                    nota: x.nota,
                    corregirAntesDe: x.corregirAntesDe,
                    archivos: x.archivos,
                    seguimiento: x.seguimiento,
                  })),
                }
              : {}),
          },
          // El aviso por actividad devuelta reemplaza el de turno («Ejecutar las actividades…»), que llegaría también a quien no
          // tiene nada devuelto (spec §14.2).
          sinAvisoDelTurno: devueltas.length > 0,
        },
        c,
      );
      for (const x of devueltas) {
        if (x.responsableId === sesion.usuarioId) continue;
        const [activo] = await tx`SELECT 1 FROM usuarios WHERE id = ${x.responsableId} AND activo`;
        if (!activo) continue;
        await avisarA(
          tx,
          { tipo: "mejora.actividad_devuelta", titulo: ACTIVIDAD_DEVUELTA, enlace: rutaDeActividad(x.id), entidad: ENTIDAD_ACTIVIDAD, entidadId: x.id },
          [
            {
              usuarioId: x.responsableId,
              cuerpo: `La actividad ${x.etiqueta} se devolvió con una nota de quien verificó. Corríjala a más tardar el ${fechaLargaDeDia(x.corregirAntesDe)}.`,
            },
          ],
        );
      }
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// La fecha mínima y lo que se muestra al evaluar (spec §11.2 a §11.4)
// ─────────────────────────────────────────────────────────────────────────────

export type IndicadorDeLaEspera = { id: number; codigo: string; nombre: string; periodicidad: Periodicidad; plazoReporteDias: number };

/**
 * R (spec §11.3): el día, en la zona, en que terminó la última actividad no cancelada de la ronda en curso; nulo si no tiene
 * ninguna o alguna sigue sin terminar.
 */
async function diaR(sql: Cliente, h: Pick<HallazgoBase, "id" | "ronda">, zona: string): Promise<string | null> {
  const [f] = await sql`SELECT max(a.terminada_en) AS r, bool_and(a.estado = 'terminada') AS todas
    FROM mejora_actividades a JOIN mejora_acciones ac ON ac.id = a.accion_id JOIN mejora_rondas r ON r.id = ac.ronda_id
    WHERE a.hallazgo_id = ${h.id} AND r.numero = ${h.ronda} AND a.estado <> 'cancelada'`;
  if (!f || f.r === null || f.todas !== true) return null;
  return fechaEnZona(f.r as Date, zona);
}

/**
 * La fecha mínima de eficacia de la ronda en espera (spec §11.3), calculada al leer: desde R, con el indicador enlazado si sigue
 * activo, con la periodicidad de su ficha vigente. Retirado (o ya no enlazable), la espera vuelve a la de dos meses y
 * `indicadorRetirado` lo dice. Nulo si el hallazgo no está «En espera de eficacia». Sin regla de visibilidad: el nombre del
 * indicador lo muestra quien llama solo a quien puede verlo.
 */
export async function fechaMinimaDe(
  sql: Cliente,
  hallazgoId: number,
  zona: string,
): Promise<{ minima: string; r: string; indicador: IndicadorDeLaEspera | null; indicadorRetirado: boolean } | null> {
  const h = await hallazgoBase(sql, hallazgoId);
  if (!h || h.estado !== "en_espera") return null;
  const ronda = await rondaEnCurso(sql, h);
  const r = await diaR(sql, h, zona);
  if (r === null) return null;
  const enlazado = ronda.indicadorId === null ? null : await indicadorDeEficacia(sql, ronda.indicadorId);
  const activo = enlazado !== null && enlazado.activo;
  const minima = fechaMinimaDeEficacia(
    { clase: h.clase, r, fechaEvaluacion: ronda.fechaEvaluacion, periodicidad: enlazado && enlazado.activo ? enlazado.periodicidad : null },
    zona,
  );
  return {
    minima,
    r,
    indicador: enlazado
      ? { id: enlazado.id, codigo: enlazado.codigo, nombre: enlazado.nombre, periodicidad: enlazado.periodicidad, plazoReporteDias: enlazado.plazoReporteDias }
      : null,
    indicadorRetirado: enlazado !== null && !activo,
  };
}

/**
 * Desde qué día se puede registrar «eficaz» y si ya llegó (R4: lo que pinta «Por evaluar la eficacia» en la lista, la página y
 * las cifras, con `etiquetaDeEstado(h, { yaSePuedeEvaluar })`). Nulo si el hallazgo no está «En espera de eficacia».
 */
export async function evaluableDesde(
  sql: Cliente,
  hallazgoId: number,
  ahora: Date,
): Promise<{ desde: string; yaSePuede: boolean } | null> {
  const zona = zonaHoraria();
  const fm = await fechaMinimaDe(sql, hallazgoId, zona);
  return fm ? { desde: fm.minima, yaSePuede: yaSePuedeEvaluar(fm.minima, ahora, zona) } : null;
}

export type FilaDelIndicador = {
  periodo: string;
  etiqueta: string;
  /** «60 %»; nulo sin dato o «no aplica» (`noAplica` dice cuál de los dos, spec §11.2). */
  resultado: string | null;
  semaforo: string | null;
  noAplica: boolean;
  momento: "antes" | "durante" | "despues";
};

/**
 * Los resultados del indicador enlazado (spec §11.4): desde dos periodos antes del que contiene R hasta el último que terminó a
 * `ahora`, cada uno marcado «antes», «durante» (el que contiene R) o «después». Un periodo sin dato o «no aplica» sale con
 * `resultado` nulo: no bloquea, quien verifica decide. Solo lee (no abre periodos). Lo que se toma de cada periodo es el resultado
 * del propio indicador, que ve quien ve el indicador: sin las variables, nada de un componente oculto (anexo 14C, §6.5).
 */
async function filasDelIndicador(sql: Cliente, indicadorId: number, r: string, ahora: Date, zona: string): Promise<FilaDelIndicador[]> {
  const anioR = Number(r.slice(0, 4));
  const anioHoy = Number(fechaEnZona(ahora, zona).slice(0, 4));
  const bases = await basesDe(sql, [indicadorId]);
  const leidos = (await leerPeriodos(sql, bases, { desde: anioR - 2, hasta: Math.max(anioR, anioHoy) }, ahora)).get(indicadorId) ?? [];
  const filas = leidos
    .filter((l) => l.fila.deOtraPeriodicidad !== true)
    .map((l) => ({ fila: l.fila, desde: fechaEnZona(l.periodo.desde, zona), hasta: fechaEnZona(l.periodo.hasta, zona), termino: l.periodo.hasta < ahora }));
  const deR = filas.findIndex((f) => f.hasta >= r);
  const primera = Math.max(0, (deR === -1 ? filas.length : deR) - 2);
  return filas
    .slice(primera)
    .filter((f) => f.termino)
    .map((f) => ({
      periodo: f.fila.periodo,
      etiqueta: f.fila.etiqueta,
      resultado: f.fila.resultado,
      semaforo: f.fila.semaforo,
      noAplica: f.fila.noAplica,
      momento: f.hasta < r ? "antes" : f.desde > r ? "despues" : "durante",
    }));
}

export type DatosDeEvaluacion = {
  minima: string;
  yaSePuede: boolean;
  /** Los criterios del plan de la ronda. */
  criterios: string[];
  /** El indicador enlazado, si lo hay; a quien no puede verlo, «un indicador», sin código ni cifras. */
  indicador: { codigo: string; nombre: string; filas: FilaDelIndicador[] } | null;
  /** El indicador enlazado se retiró: el criterio «mejora del indicador» no se puede marcar como evaluado. */
  indicadorRetirado: boolean;
  /** Las ocurrencias con fecha de R en adelante (una del mismo día pudo ser posterior), de la más antigua a la más reciente. */
  ocurrencias: Array<{ fecha: string; descripcion: string }>;
};

/** Lo que se muestra al evaluar y con qué se calculó: la fecha mínima, la ronda en curso y lo que ve quien evalúa. */
async function loQueSeMuestra(
  sql: Cliente,
  sesion: Persona,
  h: HallazgoBase,
  ahora: Date,
  zona: string,
): Promise<{ r: string; indicadorId: number | null; ronda: RondaEnCurso; datos: DatosDeEvaluacion }> {
  const fm = await fechaMinimaDe(sql, h.id, zona);
  if (!fm) throw new ErrorMejora(YA_CAMBIO);
  const ronda = await rondaEnCurso(sql, h);
  let indicador: DatosDeEvaluacion["indicador"] = null;
  if (fm.indicador) {
    indicador = (await puedeVerIndicador(fm.indicador.id, sesion, { sql }))
      ? { codigo: fm.indicador.codigo, nombre: fm.indicador.nombre, filas: await filasDelIndicador(sql, fm.indicador.id, fm.r, ahora, zona) }
      : { codigo: "", nombre: "un indicador", filas: [] };
  }
  const ocurrencias = await sql`SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, descripcion FROM mejora_ocurrencias
    WHERE hallazgo_id = ${h.id} AND fecha >= ${fm.r} ORDER BY fecha, id`;
  return {
    r: fm.r,
    indicadorId: fm.indicador?.id ?? null,
    ronda,
    datos: {
      minima: fm.minima,
      yaSePuede: yaSePuedeEvaluar(fm.minima, ahora, zona),
      criterios: ronda.criterios,
      indicador,
      indicadorRetirado: fm.indicadorRetirado,
      ocurrencias: ocurrencias.map((o) => ({ fecha: o.fecha as string, descripcion: o.descripcion as string })),
    },
  };
}

/**
 * La huella de lo que la pantalla de evaluar muestra (spec §11.4 y §12.2): las filas del indicador y las ocurrencias. La página
 * la manda con el formulario (`vistoHuella`) y `evaluarEficacia` la compara con lo que vuelve a leer: se firma lo que se vio.
 */
export function huellaDeLoVisto(datos: DatosDeEvaluacion): string {
  return huellaDeContenido({ indicador: datos.indicador, ocurrencias: datos.ocurrencias });
}

/**
 * Lo que la pantalla de evaluar muestra sin que nadie lo busque (spec §11.4): la fecha mínima y si ya llegó, el criterio del
 * plan, los resultados del indicador enlazado y las ocurrencias posteriores a R. Solo para quien puede verificar, con el hallazgo
 * «En espera de eficacia» (si no, `YA_CAMBIO`); a quien no lo ve, no existe. Es lo que `evaluarEficacia` congela en el evento.
 */
export async function datosDeEvaluacion(sesion: SesionFlujo, hallazgoId: number, opciones?: Opciones): Promise<DatosDeEvaluacion> {
  requerirPermiso(sesion, "mejora.verificar");
  const sql = opciones?.sql ?? obtenerSql();
  const h = await existente(sql, hallazgoId);
  await exigirVerificador(sql, sesion, h.id);
  if (h.estado !== "en_espera") throw new ErrorMejora(YA_CAMBIO);
  return (await loQueSeMuestra(sql, sesion, h, opciones?.ahora ?? new Date(), zonaHoraria())).datos;
}

// ─────────────────────────────────────────────────────────────────────────────
// Evaluar la eficacia (firma «Verificó»; con el Admin SGC, también «Cerró»)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La huella del plan aprobado de la ronda: la del evento que lo dejó aprobado y guardó su copia (`detalle.plan`, spec §12.2), no
 * la de un `revisar_plan` que solo lo pasó a Gerencia. Un hallazgo cargado aprobó su plan fuera de la plataforma (Tarea 20):
 * sin ese evento, la huella es vacía.
 */
async function huellaDelPlanAprobado(sql: Cliente, h: Pick<HallazgoBase, "id" | "ronda">): Promise<string> {
  const [e] = await sql`SELECT detalle->>'huella' AS huella FROM mejora_eventos
    WHERE hallazgo_id = ${h.id} AND ronda = ${h.ronda} AND tipo IN ('revisar_plan', 'aprobar_plan') AND detalle->'plan' IS NOT NULL
    ORDER BY id DESC LIMIT 1`;
  return (e?.huella as string | null | undefined) ?? "";
}

type Evaluacion = {
  h: HallazgoBase;
  ronda: RondaEnCurso;
  /**
   * Lo que la pantalla mostró (spec §11.4), con el id del indicador enlazado: quien pinte el evento después nombra el indicador
   * y sus cifras solo a quien `puedeVerIndicador` (ruling 4), sin suponer que la ronda sigue enlazando el mismo.
   */
  visto: {
    r: string;
    minima: string;
    indicadorId: number | null;
    indicador: DatosDeEvaluacion["indicador"];
    ocurrencias: DatosDeEvaluacion["ocurrencias"];
  };
  huella: string;
  ocurrencias: number;
  /** Si el mismo acto cierra (evalúa «eficaz» el Admin SGC): lo del cierre y su huella. */
  cierre: { lecciones: string; cambiosAtendidos: string | null; huella: string } | null;
};

/**
 * Lo que debe cumplirse para evaluar, sin escribir nada: quien puede verificar, «En espera de eficacia», un periodo evaluado que
 * no termina después de hoy, lo que se muestra igual a lo que vio la persona (`vistoHuella`), el criterio del indicador solo
 * si sigue enlazado y activo, «eficaz» desde la fecha mínima (el día de `c.ahora` en la zona) y con las ocurrencias posteriores
 * confirmadas, y, si cierra, lo del cierre. Devuelve lo que se firma.
 */
async function validarEvaluacion(
  sql: Cliente,
  sesion: Persona,
  v: EvaluacionValidada,
  c: ContextoMejora,
): Promise<Evaluacion> {
  const h = await existente(sql, v.hallazgoId);
  await exigirVerificador(sql, sesion, h.id);
  if (h.estado !== "en_espera") throw new ErrorMejora(YA_CAMBIO);
  if (v.hasta > fechaEnZona(c.ahora, c.zona)) throw new ErrorMejora(PERIODO_DESPUES_DE_HOY);
  const { r, indicadorId, ronda, datos } = await loQueSeMuestra(sql, sesion, h, c.ahora, c.zona);
  // Se firma lo que se vio: si cambió lo que se muestra (otra ocurrencia, otro resultado del indicador), la persona lo revisa.
  if (huellaDeLoVisto(datos) !== v.vistoHuella) throw new ErrorMejora(LO_VISTO_CAMBIO);
  if (v.criterios.includes("mejora_indicador")) {
    if (datos.indicador === null) throw new ErrorMejora(SIN_INDICADOR_ENLAZADO);
    if (datos.indicadorRetirado) throw new ErrorMejora(INDICADOR_RETIRADO);
  }
  const eficaz = v.resultado === "eficaz";
  if (eficaz && !yaSePuedeEvaluar(datos.minima, c.ahora, c.zona)) throw new ErrorMejora(desdeLaMinima(datos.minima));
  if (eficaz && datos.ocurrencias.length > 0 && !v.confirmaOcurrencias) {
    throw new ErrorMejora(ocurrenciasSinConfirmar(datos.ocurrencias.length));
  }
  const cierra = eficaz && puede(sesion, "mejora.gestionar");
  if (cierra) exigirLoDelCierre(v.lecciones, v.cambiosAtendidos, ronda.cambios);

  const visto = { r, minima: datos.minima, indicadorId, indicador: datos.indicador, ocurrencias: datos.ocurrencias };
  const huella = huellaDeEvaluacion({
    huellaDelPlan: await huellaDelPlanAprobado(sql, h),
    resultado: v.resultado,
    criterios: v.criterios,
    desde: v.desde,
    hasta: v.hasta,
    justificacion: v.justificacion,
    visto,
  });
  let cierre: Evaluacion["cierre"] = null;
  if (cierra) {
    const lecciones = v.lecciones!;
    const cambiosAtendidos = pideCambios(ronda.cambios) ? v.cambiosAtendidos : null;
    cierre = { lecciones, cambiosAtendidos, huella: huellaDeCierre({ huellaDeLaEvaluacion: huella, resultado: "eficaz", lecciones, cambiosAtendidos }) };
  }
  return { h, ronda, visto, huella, ocurrencias: datos.ocurrencias.length, cierre };
}

/**
 * Registra la evaluación de la eficacia de la ronda en curso (spec §11.4) con la firma «Verificó»: los criterios evaluados, el
 * periodo, el resultado y la justificación, con lo que la pantalla mostró congelado en el evento (`detalle.visto`). «Eficaz»
 * pasa a «Por cerrar» o, si evalúa un Admin SGC, cierra en el mismo acto con la firma «Cerró» (una sola clave). «No eficaz»
 * deja la ronda con su resultado y abre la siguiente en «Por formular» (spec §8.7). Si lo que se mostró cambió entre el
 * validador y la transacción, la huella de dentro no es la de fuera: `YA_CAMBIO`.
 */
export async function evaluarEficacia(
  sesion: SesionFlujo,
  d: {
    hallazgoId: number;
    resultado: "eficaz" | "no_eficaz";
    criterios: string[];
    desde: string;
    hasta: string;
    justificacion: string;
    confirmaOcurrencias?: boolean;
    lecciones?: string | null;
    cambiosAtendidos?: string | null;
    /** La huella de lo que la pantalla mostró al evaluar (`huellaDeLoVisto`). */
    vistoHuella: string;
    credenciales: CredencialesFirma;
  },
  opciones: OpcionesFlujo = {},
): Promise<void> {
  requerirPermiso(sesion, "mejora.verificar");
  const { credenciales, ...datos } = d;
  const v = leer(EsquemaEvaluacion, datos);
  const sql = opciones.sql ?? obtenerSql();
  const ahora = opciones.ahora ?? new Date();
  const fuera = await legible(validarEvaluacion(sql, sesion, v, await contextoDeMejora(sql, ahora)));
  const { metodo, contexto } = await verificarFirma(sesion, credenciales, opciones, ahora);

  await legible(
    enTransaccion(sql, async (tx) => {
      const h = await bloquearHallazgo(tx, v.hallazgoId);
      await rondaEnCurso(tx, h, true);
      const c = await contextoDeMejora(tx, ahora);
      const e = await validarEvaluacion(tx, sesion, v, c);
      // Se firma lo que se validó antes de pedir la clave: si cambió lo que se mostró, no.
      if (e.huella !== fuera.huella) throw new ErrorMejora(YA_CAMBIO);
      await tx`UPDATE mejora_rondas
        SET evaluada_por = ${sesion.usuarioId}, evaluada_en = ${ahora}, resultado = ${v.resultado}, evaluacion_desde = ${v.desde},
          evaluacion_hasta = ${v.hasta}, evaluacion_criterios = ${tx.json(v.criterios as never)}, evaluacion_justificacion = ${v.justificacion}
        WHERE id = ${e.ronda.id}`;
      const firma = { tramiteId: null, versionId: null, mejoraHallazgoId: h.id, usuarioId: sesion.usuarioId, ronda: h.ronda, metodo, contexto, ahora };
      await registrarFirma(tx, { ...firma, firma: "verifico", hashSha256: e.huella });
      // Lo que termina el hallazgo va antes de la transición: después, el trigger no deja tocarlo.
      if (e.cierre) {
        await tx`UPDATE mejora_hallazgos
          SET cerrado_en = ${ahora}, cerrado_por = ${sesion.usuarioId}, resultado_cierre = 'eficaz', lecciones = ${e.cierre.lecciones},
            cambios_atendidos = ${e.cierre.cambiosAtendidos}
          WHERE id = ${h.id}`;
        await registrarFirma(tx, { ...firma, firma: "cerro", hashSha256: e.cierre.huella });
      }
      const eficaz = v.resultado === "eficaz";
      await transicionarHallazgo(
        tx,
        sesion,
        h,
        eficaz ? "evaluar_eficaz" : "evaluar_no_eficaz",
        {
          rumbo: { verificaAdmin: e.cierre !== null },
          detalle: {
            huella: e.huella,
            resultado: v.resultado,
            criterios: v.criterios,
            desde: v.desde,
            hasta: v.hasta,
            ...(e.ocurrencias > 0 ? { ocurrencias: e.ocurrencias } : {}),
            ...(e.cierre ? { cierra: true, huellaDelCierre: e.cierre.huella } : {}),
          },
          soloEnElEvento: {
            justificacion: v.justificacion,
            visto: e.visto,
            ...(e.cierre ? { lecciones: e.cierre.lecciones, cambiosAtendidos: e.cierre.cambiosAtendidos } : {}),
          },
          nuevaRonda: !eficaz,
        },
        c,
      );
      if (e.cierre) await avisarDelCierre(tx, sesion, h);
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cerrar (firma «Cerró»)
// ─────────────────────────────────────────────────────────────────────────────

/** La evaluación que se cierra: la última firma «Verificó» de la ronda en curso (su huella es la que encadena «Cerró»). */
async function firmaDeLaEvaluacion(sql: Cliente, h: Pick<HallazgoBase, "id" | "ronda">): Promise<{ firmaId: number; huella: string }> {
  const [f] = await sql`SELECT id, hash_sha256 FROM firmas
    WHERE mejora_hallazgo_id = ${h.id} AND ronda = ${h.ronda} AND firma = 'verifico' ORDER BY id DESC LIMIT 1`;
  if (!f) throw new ErrorMejora(SIN_FIRMA_DE_LA_EVALUACION);
  return { firmaId: Number(f.id), huella: f.hash_sha256 as string };
}

type Cierre = { h: HallazgoBase; evaluacion: { firmaId: number; huella: string }; cambiosAtendidos: string | null; huella: string };

/** Lo que debe cumplirse para cerrar, sin escribir nada: «Por cerrar», las lecciones y los cambios atendidos. */
async function validarCierre(sql: Cliente, sesion: Persona, v: CierreValidado): Promise<Cierre> {
  // El permiso (`mejora.gestionar`) lo exige `cerrarHallazgo` antes de llamarlo.
  const h = await existente(sql, v.hallazgoId);
  if (h.estado !== "por_cerrar") throw new ErrorMejora(YA_CAMBIO);
  const ronda = await rondaEnCurso(sql, h);
  exigirLoDelCierre(v.lecciones, v.cambiosAtendidos, ronda.cambios);
  const evaluacion = await firmaDeLaEvaluacion(sql, h);
  const cambiosAtendidos = pideCambios(ronda.cambios) ? v.cambiosAtendidos : null;
  return {
    h,
    evaluacion,
    cambiosAtendidos,
    huella: huellaDeCierre({ huellaDeLaEvaluacion: evaluacion.huella, resultado: "eficaz", lecciones: v.lecciones, cambiosAtendidos }),
  };
}

/**
 * El Admin SGC cierra un hallazgo eficaz (spec §11.5) con la firma «Cerró»: las lecciones aprendidas (al menos diez
 * caracteres) y, si la segunda pregunta del análisis pidió cambios en documentos, riesgos o controles, cómo se atendieron. Todo
 * lo del cierre se escribe antes de la transición a «Cerrado»; avisa a los líderes del proceso, a quien lo registró y a Gerencia.
 */
export async function cerrarHallazgo(
  sesion: SesionFlujo,
  d: { hallazgoId: number; lecciones: string; cambiosAtendidos?: string | null; credenciales: CredencialesFirma },
  opciones: OpcionesFlujo = {},
): Promise<void> {
  requerirPermiso(sesion, "mejora.gestionar");
  const { credenciales, ...datos } = d;
  const v = leer(EsquemaCierre, datos);
  const sql = opciones.sql ?? obtenerSql();
  const ahora = opciones.ahora ?? new Date();
  const fuera = await legible(validarCierre(sql, sesion, v));
  const { metodo, contexto } = await verificarFirma(sesion, credenciales, opciones, ahora);

  await legible(
    enTransaccion(sql, async (tx) => {
      const h = await bloquearHallazgo(tx, v.hallazgoId);
      await rondaEnCurso(tx, h, true);
      const k = await validarCierre(tx, sesion, v);
      // Se cierra la evaluación que se validó antes de pedir la clave.
      if (k.evaluacion.firmaId !== fuera.evaluacion.firmaId) throw new ErrorMejora(YA_CAMBIO);
      const c = await contextoDeMejora(tx, ahora);
      await tx`UPDATE mejora_hallazgos
        SET cerrado_en = ${ahora}, cerrado_por = ${sesion.usuarioId}, resultado_cierre = 'eficaz', lecciones = ${v.lecciones},
          cambios_atendidos = ${k.cambiosAtendidos}
        WHERE id = ${h.id}`;
      await registrarFirma(tx, {
        tramiteId: null,
        versionId: null,
        mejoraHallazgoId: h.id,
        usuarioId: sesion.usuarioId,
        firma: "cerro",
        ronda: h.ronda,
        hashSha256: k.huella,
        metodo,
        contexto,
        ahora,
      });
      await transicionarHallazgo(
        tx,
        sesion,
        h,
        "cerrar",
        { detalle: { huella: k.huella }, soloEnElEvento: { lecciones: v.lecciones, cambiosAtendidos: k.cambiosAtendidos } },
        c,
      );
      await avisarDelCierre(tx, sesion, h);
    }),
  );
}
