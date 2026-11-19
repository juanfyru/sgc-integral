/**
 * El registro de un hallazgo (spec 15 §7.1 a §7.4) y su código `HZ-AAAA-NNN`. El estado en que nace lo decide la tabla
 * de §7.4; el nacimiento, `nacerHallazgo`.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { enTransaccion, type OpcionesFlujo, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { lideresDeProceso } from "@/db/consultas/tramites";
import { registrarAuditoria } from "@/db/consultas/admin";
import { alcanceProcesos, enAlcance, filtroAcceso, filtroIndicadores, puedeVerHallazgo } from "@/lib/alcance";
import {
  EsquemaAnulacion,
  EsquemaCambioDeProceso,
  EsquemaHallazgo,
  EsquemaOcurrencia,
  EsquemaReclasificacion,
  EsquemaRespuestaAlEnte,
  HALLAZGO_DE_ORIGEN,
  type HallazgoValidado,
} from "@/lib/esquemas/mejoramiento";
import {
  FIJOS_DE_VERIFICACION,
  PROCESO_DEL_PUNTO,
  SIN_JUSTIFICAR_LA_ACCION,
  VERIFICACION_NO_EXISTE,
  YA_TIENE_NO_CONFORMIDAD,
} from "@/lib/mejoramiento/enganches";
import { esExterno } from "@/lib/mejoramiento/origenes";
import { formularAntesDe, venceEn } from "@/lib/mejoramiento/plazos";
import { destinoDeReclasificacion, type Perfil } from "@/lib/mejoramiento/reclasificar";
import { aceptadoVaA } from "@/lib/mejoramiento/reglas";
import { RESPONDA_DESDE_EL_PLAN } from "@/lib/mejoramiento/planes";
import { AJUSTE_POR_ANULACION } from "@/lib/mejoramiento/textos";
import { ErrorMejora, TERMINALES, type Clase, type Criticidad, type HallazgoBase, type Origen } from "@/lib/mejoramiento/tipos";
import { DESDE, YA_CAMBIO } from "@/lib/mejoramiento/transiciones";
import { ErrorPermiso, requerirPermiso } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { activosDeRol, avisarDeMejora, avisarDelTurno, ENTIDAD_HALLAZGO, lideresOAdmins, verificadoresActivos } from "./avisos";
import { contextoDeMejora, type ContextoMejora } from "./config";
import { bloquearHallazgo, dejarEvento, legible, nacerHallazgo, NO_EXISTE, transicionarHallazgo, type FilaNueva } from "./flujo";
import { cargaPendiente } from "./carga-confirmada";
import { bloquearPlanDelRegistro, clasificarAlNacer } from "./clasificacion";
import { hallazgoParaAbrir, procesosDelPunto } from "./enganche-verificacion";
import { DATO_YA_NO_EXISTE } from "./legible";
import { bloquearMarca, marcaDelPanel, salidaAlNacer } from "./marcas-base";
import { bloquearReporteRecibido, dejarClasificado } from "./reportes-base";
import { ENVIO_FUTURO, envioAntesDeAprobar, planQueResponde } from "./respuesta-plan";

/** Los campos de la identificación (spec §7.1). Los ids y las fechas también llegan como texto del formulario. */
export type DatosDeHallazgo = {
  clase: Clase;
  origen: Origen;
  fuente?: string | null;
  referenciaCaso?: string | null;
  /** `yyyy-mm-dd`, de hoy hacia atrás en la zona de la instalación. */
  detectadoEn: string;
  procesoId: number;
  subprocesoId?: number | null;
  criticidad?: Criticidad | null;
  titulo: string;
  descripcion: string;
  requisitoClausula?: string | null;
  requisitoNormaId?: number | null;
  requisitoDocumentoId?: number | null;
  documentoId?: number | null;
  indicadorId?: number | null;
  medicionId?: number | null;
  riesgo?: string | null;
  /** Solo en los orígenes externos: obligatoria en «Ente de control» (spec §13.4). */
  fechaLimiteEnte?: string | null;
  /** Un hallazgo `cerrado` del mismo proceso del que este es reincidencia (spec §7.5). */
  reincidenteDe?: number | null;
  /**
   * El hallazgo en cuya verificación se encontró este, distinto (spec §11.4): uno que quien registra puede ver. Solo al
   * registrar: editar y reclasificar no lo cambian.
   */
  derivadoDe?: number | null;
  /**
   * El reporte de un funcionario que se convierte en este hallazgo (spec §7.3): solo con `mejora.gestionar` y solo si sigue
   * «Recibido»; queda `convertido`, con este hallazgo, en la misma transacción. Solo al registrar.
   */
  reporteId?: number | null;
  /**
   * El plan en que nace (Fase 15B, anexo §3.4, camino 1): solo si quien registra tiene `mejora.planes` y el plan existe y no está
   * anulado; si no, nace sin plan, sin error. Solo al registrar (y al cargar).
   */
  planId?: number | null;
  /** El objetivo del maestro al que apunta (anexo §10.4): debe estar activo. Solo al registrar (y al cargar). */
  objetivoId?: number | null;
  /**
   * La medición marcada desde cuyo panel llegó el formulario (Fase 15B, anexo §6.3): el registro vuelve a sacar de ella la medición
   * y el indicador, que quedan fijos, y si la medición ya tiene una salida en vigor se rechaza (`MARCA_YA_DECIDIDA`). Solo para quien
   * puede resolver la marca; si no, se ignora. Solo al registrar.
   */
  marcaMedicionId?: number | null;
  /**
   * El hallazgo de verificación de Distribución del que nace una no conformidad (Fase 15B, anexo §7.2): solo con `mejora.gestionar`,
   * uno que quien registra ve y que todavía no tiene una no conformidad que cuente. La clase y el origen quedan fijos; el proceso, entre
   * los del punto. Solo al registrar: la carga, editar y reclasificar lo ignoran.
   */
  verificacionHallazgoId?: number | null;
  /** Por qué esa falla necesita acción correctiva: obligatoria con `verificacionHallazgoId` (al menos 10 caracteres). */
  accionJustificacion?: string | null;
};

/** Lo que un hallazgo ya enlaza: al editarlo, un enlace que no cambia no se vuelve a mirar con el alcance de hoy. */
export type EnlacesPrevios = { documentoId: number | null; indicadorId: number | null; medicionId: number | null };

/**
 * El consecutivo del año, dentro de la transacción del registro: sin huecos (una transacción revertida no lo quema,
 * como sí lo haría una secuencia) y sin repetirse (el `ON CONFLICT` serializa a dos registros del mismo año).
 */
export async function tomarCodigo(tx: TransactionSql, anio: number): Promise<{ consecutivo: number; codigo: string }> {
  const [f] = await tx`INSERT INTO mejora_consecutivos (anio, ultimo) VALUES (${anio}, 1)
    ON CONFLICT (anio) DO UPDATE SET ultimo = mejora_consecutivos.ultimo + 1
    RETURNING ultimo`;
  const consecutivo = Number(f.ultimo);
  return { consecutivo, codigo: "HZ-" + anio + "-" + String(consecutivo).padStart(3, "0") };
}

/**
 * Lo que el esquema no puede saber: la fecha de hoy, el proceso y lo enlazado. Solo lecturas. También la carga (`carga.ts`).
 *
 * «A qué se refiere» (Fase 15B, anexo §10.3) pasa además por el alcance de quien registra, con la regla del módulo de cada cosa: el
 * documento, `filtroAcceso`; el indicador y el de la medición, `filtroIndicadores`. Para quien no lo ve, no existe: el mismo
 * mensaje que un enlace que no existe (el del documento es el de su llave foránea, `DATO_YA_NO_EXISTE`). Al editar, `previos` trae
 * lo que el hallazgo ya enlazaba: un enlace que no cambia no se vuelve a mirar con el alcance de hoy (un documento que se
 * restringió después no impide corregir el título).
 */
export async function revisarIdentificacion(
  tx: TransactionSql,
  sesion: SesionFlujo,
  v: HallazgoValidado,
  c: ContextoMejora,
  previos?: EnlacesPrevios,
): Promise<void> {
  if (v.detectadoEn > fechaEnZona(c.ahora, c.zona)) throw new ErrorMejora("La fecha en que se detectó no puede ser futura");
  const [proceso] = await tx`SELECT activo FROM procesos WHERE id = ${v.procesoId}`;
  if (!proceso?.activo) throw new ErrorMejora("Elija un proceso activo");
  if (v.subprocesoId !== null) {
    const [s] = await tx`SELECT 1 FROM subprocesos WHERE id = ${v.subprocesoId} AND proceso_id = ${v.procesoId}`;
    if (!s) throw new ErrorMejora("El subproceso elegido no es de ese proceso");
  }
  if (v.documentoId !== null && v.documentoId !== previos?.documentoId) {
    const [d] = await tx`SELECT 1 FROM documentos d WHERE d.id = ${v.documentoId} AND ${filtroAcceso(tx, sesion)}`;
    if (!d) throw new ErrorMejora(DATO_YA_NO_EXISTE);
  }
  if (v.indicadorId !== null) {
    const ve = v.indicadorId === previos?.indicadorId ? tx`true` : filtroIndicadores(tx, sesion);
    const [i] = await tx`SELECT 1 FROM indicadores i WHERE i.id = ${v.indicadorId} AND i.estado IN ('activo', 'retirado') AND ${ve}`;
    if (!i) throw new ErrorMejora("Solo se puede enlazar un indicador activo o retirado");
  }
  if (v.medicionId !== null) {
    const ve = v.medicionId === previos?.medicionId ? tx`true` : filtroIndicadores(tx, sesion);
    const [m] = await tx`SELECT m.indicador_id FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id
      WHERE m.id = ${v.medicionId} AND m.resultado IS NOT NULL AND ${ve}`;
    if (!m) throw new ErrorMejora("Solo se puede enlazar una medición que ya tiene resultado");
    if (v.indicadorId !== null && Number(m.indicador_id) !== v.indicadorId) {
      throw new ErrorMejora("La medición elegida no es de ese indicador");
    }
  }
}

/** Las columnas de la identificación validada, sin el código: las del registro y las de la carga. */
export function filaDe(v: HallazgoValidado): Omit<FilaNueva, "codigo" | "anio" | "consecutivo"> {
  return {
    clase: v.clase,
    origen: v.origen,
    fuente: v.fuente,
    referenciaCaso: v.referenciaCaso,
    detectadoEn: v.detectadoEn,
    procesoId: v.procesoId,
    subprocesoId: v.subprocesoId,
    criticidad: v.criticidad,
    titulo: v.titulo,
    descripcion: v.descripcion,
    requisitoClausula: v.requisitoClausula,
    requisitoNormaId: v.requisitoNormaId,
    requisitoDocumentoId: v.requisitoDocumentoId,
    documentoId: v.documentoId,
    indicadorId: v.indicadorId,
    medicionId: v.medicionId,
    riesgo: v.riesgo,
    fechaLimiteEnte: v.fechaLimiteEnte,
    reincidenteDe: v.reincidenteDe,
  };
}

/**
 * Un hallazgo externo avisa también a cada usuario activo de Gerencia y a cada Admin SGC activo (spec §14.2), salvo a quien
 * lo registró. Es otro aviso que el del turno (en la Fase 16 sale además de inmediato por correo): quien tiene el turno
 * recibe los dos.
 */
async function avisarDelExterno(tx: TransactionSql, h: HallazgoBase, titulo: string, actorId: number): Promise<void> {
  const destinos = (await activosDeRol(tx, ["gerencia", "admin_sgc"])).filter((u) => u !== actorId);
  await avisarDeMejora(
    tx,
    { tipo: "mejora.externo", titulo: `Hallazgo externo ${h.codigo}: prioridad alta`, hallazgoId: h.id },
    destinos.map((usuarioId) => ({ usuarioId, cuerpo: titulo })),
  );
}

/**
 * Registra un hallazgo (spec §7.4). Nace aceptado si el origen es externo, si quien registra lidera ese proceso o si el
 * proceso no tiene ningún líder activo (F15-DC3: también cuando registra Control Interno); si no, «Por aceptar». Con
 * `reporteId`, convierte ese reporte (spec §7.3): lo clasifica el Admin SGC y el reporte debe seguir «Recibido»; el plazo de
 * formular corre desde ahora, la conversión, y no desde el reporte (§13.3).
 *
 * Con `planId` nace dentro de ese plan y con `objetivoId`, con ese objetivo (Fase 15B, anexo §3.4 camino 1 y §10.4):
 * `clasificarAlNacer`, en la misma transacción. Un plan que no admite (sin `mejora.planes`, anulado o que no existe) se ignora sin
 * decir por qué; un objetivo inactivo se rechaza (`OBJETIVO_INACTIVO`).
 *
 * Con una medición marcada (anexo §6.3), el registro deja la salida «hallazgo» de esa marca en su misma transacción
 * (`salidaAlNacer`) si quien registra puede resolverla. Con `marcaMedicionId` (el formulario llegó desde el panel de la marca y quien
 * registra puede resolverla, `marcaDelPanel`), la medición y el indicador se vuelven a sacar de la base, el subproceso del indicador
 * llega si el proceso elegido es el suyo, y una salida que otra persona decidió entre tanto rechaza el registro.
 *
 * Con `verificacionHallazgoId` (anexo §7.2) nace la no conformidad de ese hallazgo de verificación: solo el Admin SGC
 * (`mejora.gestionar`), con la clase y el origen fijos, el proceso entre los del punto, la justificación de la acción correctiva (al
 * menos 10 caracteres, `SIN_JUSTIFICAR_LA_ACCION`) y a lo sumo una que cuente (`YA_TIENE_NO_CONFORMIDAD`). La acción nace requerida
 * (`nacerHallazgo`, `fila.accion`) y, aceptada, va directo a «Por formular» (`aceptadoVaA`). La justificación queda en la fila y en el
 * evento, nunca en la bitácora.
 *
 * Orden de candados, el del módulo (primero el plan, después el hallazgo, después lo demás): el plan `FOR UPDATE`
 * (`bloquearPlanDelRegistro`, la primera sentencia, como en todo camino que clasifica: §3.4), el candado de la medición
 * (`bloquearMarca`: el de `medicionId` y el de `marcaMedicionId` si llegan distintas, en orden ascendente, con la llave de lo que
 * llega y antes de cualquier lectura que decida; así un registro nunca tiene la fila de un hallazgo mientras lo espera, y la salida
 * se escribe siempre sobre una medición bloqueada), el hallazgo de verificación (`verificacionHallazgoId`) `FOR KEY SHARE`, el
 * hallazgo de origen (`derivadoDe`) `FOR KEY SHARE` —el que tomaría la llave foránea al insertar,
 * pero antes del reporte—, el reporte `FOR UPDATE` y el consecutivo del año. Así no se cruza con `sumarReporte`, que bloquea el
 * hallazgo (`FOR UPDATE`) y después el reporte, ni con `ponerEnPlan` y `ponerObjetivo`, que bloquean el plan y después el hallazgo,
 * ni con `resolverConOcurrencia`, que toma la medición y después el hallazgo.
 */
export async function registrarHallazgo(
  sesion: SesionFlujo,
  d: DatosDeHallazgo,
  opciones?: OpcionesFlujo,
): Promise<{ id: number; codigo: string }> {
  requerirPermiso(sesion, "mejora.registrar");
  // La no conformidad de un hallazgo de verificación la abre el Admin SGC (anexo §7.1), antes de leer nada de ese hallazgo; la clase y
  // el origen son fijos y se ponen antes de leer el envío (anexo §10.3).
  const deVerificacion = d.verificacionHallazgoId !== undefined && d.verificacionHallazgoId !== null && String(d.verificacionHallazgoId) !== "";
  if (deVerificacion) requerirPermiso(sesion, "mejora.gestionar");
  const leido = EsquemaHallazgo.safeParse(deVerificacion ? { ...d, ...FIJOS_DE_VERIFICACION } : d);
  if (!leido.success) throw new ErrorMejora(leido.error.issues[0].message);
  const recibido = leido.data;
  // Clasificar un reporte es del Admin SGC (spec §6.1), aunque registrar lo puedan otros.
  if (recibido.reporteId !== null) requerirPermiso(sesion, "mejora.gestionar");
  const justificacion = recibido.accionJustificacion;
  if (recibido.verificacionHallazgoId !== null && (justificacion === null || justificacion.length < 10)) {
    throw new ErrorMejora(SIN_JUSTIFICAR_LA_ACCION);
  }
  const ahora = opciones?.ahora ?? new Date();
  return legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      await bloquearPlanDelRegistro(tx, sesion, recibido.planId);
      // Las dos que llegan, en orden ascendente y sin leer nada antes: la salida se escribe sobre una de ellas (la del panel, si se
      // atiende; si no, la elegida), y siempre con su candado tomado.
      const medicionesDelCandado = [...new Set([recibido.medicionId, recibido.marcaMedicionId].filter((x): x is number => x !== null))];
      for (const id of medicionesDelCandado.sort((a, b) => a - b)) await bloquearMarca(tx, id);
      // Desde el panel de la marca, lo fijo (la medición y su indicador) sale de la base, nunca del envío (anexo §10.3).
      const panel = recibido.marcaMedicionId !== null ? await marcaDelPanel(tx, sesion, recibido.marcaMedicionId) : null;
      const v: HallazgoValidado = panel
        ? {
            ...recibido,
            medicionId: panel.medicionId,
            indicadorId: panel.indicadorId,
            subprocesoId: recibido.subprocesoId ?? (recibido.procesoId === panel.procesoId ? panel.subprocesoId : null),
          }
        : recibido;
      const verificacion = v.verificacionHallazgoId !== null ? await verificacionDelRegistro(tx, sesion, v.verificacionHallazgoId, v.procesoId) : null;
      if (v.derivadoDe !== null) await tx`SELECT 1 FROM mejora_hallazgos WHERE id = ${v.derivadoDe} FOR KEY SHARE`;
      const reporte = v.reporteId !== null ? await bloquearReporteRecibido(tx, v.reporteId) : null;
      if (sesion.rol === "lider_proceso" && !enAlcance(await alcanceProcesos(sesion, { sql: tx }), v.procesoId)) {
        throw new ErrorPermiso();
      }
      const c = await contextoDeMejora(tx, ahora);
      await revisarIdentificacion(tx, sesion, v, c);
      await exigirReincidencia(tx, v.reincidenteDe, v.procesoId);
      // Para quien no puede ver el hallazgo de origen, no existe (spec §6.3): la misma frase que para un id que no existe.
      if (v.derivadoDe !== null && !(await puedeVerHallazgo(v.derivadoDe, sesion, { sql: tx }))) throw new ErrorMejora(HALLAZGO_DE_ORIGEN);
      const lideres = await lideresDeProceso(v.procesoId, { sql: tx });
      const nacioAceptado = esExterno(v.origen) || lideres.length === 0 || lideres.includes(sesion.usuarioId);
      const anio = Number(fechaEnZona(c.ahora, c.zona).slice(0, 4));
      const { consecutivo, codigo } = await tomarCodigo(tx, anio);
      const h = await nacerHallazgo(
        tx,
        sesion,
        {
          ...filaDe(v),
          derivadoDe: v.derivadoDe,
          codigo,
          anio,
          consecutivo,
          // Con el hallazgo de verificación, la acción correctiva nace requerida por quien la abre (anexo §7.2).
          verificacionHallazgoId: verificacion?.id ?? null,
          accion: verificacion ? { justificacion: justificacion as string, decididaPor: sesion.usuarioId, decididaEn: c.ahora } : null,
        },
        "registrar",
        // El evento y la bitácora llevan el id del de origen, el del reporte y el del hallazgo de verificación, nunca su texto; la
        // justificación de la acción, solo el evento (spec §6.4).
        {
          rumbo: { nacioAceptado },
          detalle: {
            ...(v.derivadoDe !== null ? { derivadoDe: v.derivadoDe } : {}),
            ...(reporte ? { reporteId: reporte.id } : {}),
            ...(verificacion ? { verificacionHallazgoId: verificacion.id } : {}),
          },
          ...(verificacion ? { soloEnElEvento: { accionJustificacion: justificacion } } : {}),
        },
        c,
      );
      await clasificarAlNacer(tx, sesion, h.id, { planId: v.planId, objetivoId: v.objetivoId }, c.ahora);
      if (v.medicionId !== null) await salidaAlNacer(tx, sesion, { medicionId: v.medicionId, hallazgoId: h.id, desdeElPanel: panel !== null }, c.ahora);
      if (reporte) await dejarClasificado(tx, sesion, reporte, { estado: "convertido", hallazgo: h }, c.ahora);
      if (esExterno(v.origen)) await avisarDelExterno(tx, h, v.titulo, sesion.usuarioId);
      return { id: h.id, codigo: h.codigo };
    }),
  );
}

/**
 * El hallazgo de verificación del que nace una no conformidad (anexo §7.2), vuelto a mirar dentro de la transacción del registro:
 * `FOR KEY SHARE` (el candado que tomaría la llave foránea al insertar), que quien registra lo ve (`filtroPuntos`: para quien no lo
 * ve, no existe), que no tenga ya una no conformidad que cuente (la garantía es el índice único parcial: su `23505` lo traduce
 * `legible`) y que el proceso elegido sea uno de los del punto, si el punto tiene alguno.
 */
async function verificacionDelRegistro(tx: TransactionSql, sesion: SesionFlujo, id: number, procesoId: number): Promise<{ id: number }> {
  await tx`SELECT 1 FROM hallazgos WHERE id = ${id} FOR KEY SHARE`;
  const vh = await hallazgoParaAbrir(tx, sesion, id);
  if (!vh) throw new ErrorMejora(VERIFICACION_NO_EXISTE);
  if (vh.yaTiene) throw new ErrorMejora(YA_TIENE_NO_CONFORMIDAD);
  exigirProcesoDelPunto(vh.procesos, procesoId);
  return { id: vh.id };
}

/**
 * El proceso de la no conformidad de un hallazgo de verificación, entre los procesos activos del punto; si el punto no tiene ninguno,
 * cualquiera.
 */
function exigirProcesoDelPunto(procesos: readonly number[], procesoId: number): void {
  if (procesos.length > 0 && !procesos.includes(procesoId)) throw new ErrorMejora(PROCESO_DEL_PUNTO);
}

const SOLO_CERRADO = "Solo se marca reincidencia de un hallazgo cerrado";

/**
 * La reincidencia solo enlaza un hallazgo `cerrado` del **mismo proceso** (spec §7.5). Quien no ve el hallazgo de otro
 * proceso recibe la misma frase que si no existiera. Solo lecturas: un cerrado ya no cambia.
 */
export async function exigirReincidencia(tx: TransactionSql, anteriorId: number | null, procesoId: number, propioId?: number): Promise<void> {
  if (anteriorId === null) return;
  const [o] = await tx`SELECT proceso_id, estado FROM mejora_hallazgos WHERE id = ${anteriorId}`;
  if (!o || anteriorId === propioId || Number(o.proceso_id) !== procesoId) throw new ErrorMejora(`${SOLO_CERRADO} del mismo proceso`);
  if (o.estado !== "cerrado") throw new ErrorMejora(SOLO_CERRADO);
}

// ─────────────────────────────────────────────────────────────────────────────
// La identificación como diferencia (editar y reclasificar guardan el antes y el después en su evento)
// ─────────────────────────────────────────────────────────────────────────────

const CAMPOS = [
  "clase", "origen", "fuente", "referenciaCaso", "detectadoEn", "procesoId", "subprocesoId", "criticidad", "titulo",
  "descripcion", "requisitoClausula", "requisitoNormaId", "requisitoDocumentoId", "documentoId", "indicadorId",
  "medicionId", "riesgo", "fechaLimiteEnte", "reincidenteDe",
] as const;
type Campo = (typeof CAMPOS)[number];
type Identificacion = Record<Campo, string | number | null>;

const idONulo = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** La fila completa del hallazgo, con las dos fechas como texto del día. */
async function leerFila(tx: TransactionSql, id: number) {
  const [f] = await tx`SELECT *, to_char(detectado_en, 'YYYY-MM-DD') AS detectado, to_char(fecha_limite_ente, 'YYYY-MM-DD') AS limite
    FROM mejora_hallazgos WHERE id = ${id}`;
  if (!f) throw new ErrorMejora(NO_EXISTE);
  return f;
}

function identificacionDeFila(f: Record<string, unknown>): Identificacion {
  return {
    clase: f.clase as string,
    origen: f.origen as string,
    fuente: (f.fuente as string | null) ?? null,
    referenciaCaso: (f.referencia_caso as string | null) ?? null,
    detectadoEn: f.detectado as string,
    procesoId: Number(f.proceso_id),
    subprocesoId: idONulo(f.subproceso_id),
    criticidad: (f.criticidad as string | null) ?? null,
    titulo: f.titulo as string,
    descripcion: f.descripcion as string,
    requisitoClausula: (f.requisito_clausula as string | null) ?? null,
    requisitoNormaId: idONulo(f.requisito_norma_id),
    requisitoDocumentoId: idONulo(f.requisito_documento_id),
    documentoId: idONulo(f.documento_id),
    indicadorId: idONulo(f.indicador_id),
    medicionId: idONulo(f.medicion_id),
    riesgo: (f.riesgo as string | null) ?? null,
    fechaLimiteEnte: (f.limite as string | null) ?? null,
    reincidenteDe: idONulo(f.reincidente_de),
  };
}

function identificacionDeValidado(v: HallazgoValidado): Identificacion {
  return Object.fromEntries(CAMPOS.map((k) => [k, v[k] ?? null])) as Identificacion;
}

/** Solo lo que cambió, con su valor de antes y su valor de después. */
function diferencias(a: Identificacion, b: Identificacion): { antes: Partial<Identificacion>; despues: Partial<Identificacion> } {
  const antes: Partial<Identificacion> = {};
  const despues: Partial<Identificacion> = {};
  for (const k of CAMPOS) {
    if (a[k] === b[k]) continue;
    antes[k] = a[k];
    despues[k] = b[k];
  }
  return { antes, despues };
}

const hayCambios = (d: { antes: object }) => Object.keys(d.antes).length > 0;

/** El perfil de una identificación; el hallazgo de verificación del que nació no se reclasifica: es el de la fila. */
const perfilDe = (i: Identificacion, verificacionHallazgoId: number | null): Perfil => ({
  clase: i.clase as Clase,
  criticidad: i.criticidad as Criticidad | null,
  origen: i.origen as Origen,
  reincidenteDe: i.reincidenteDe as number | null,
  verificacionHallazgoId,
});

/** El cambio de proceso vuelve a avisar a los líderes del proceso nuevo, como si el hallazgo acabara de llegar a «Por aceptar». */
async function avisarAlProcesoNuevo(tx: TransactionSql, h: HallazgoBase, procesoId: number, titulo: string, actorId: number): Promise<void> {
  await avisarDelTurno(tx, { ...h, estado: "por_aceptar", procesoId }, titulo, actorId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Ocurrencias (spec §7.5)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Una ocurrencia más de un hallazgo abierto: no nace otro hallazgo. Avisa a los líderes del proceso y al Admin SGC y, si el
 * hallazgo espera su evaluación de eficacia, además a quienes pueden verificarlo, como posible recurrencia (§11.4). Quien
 * no ve el proceso del hallazgo recibe «no existe».
 */
export async function registrarOcurrencia(
  sesion: SesionFlujo,
  d: {
    hallazgoId: number;
    fecha: string;
    descripcion: string;
    origen?: "registro" | "reporte" | "medicion";
    reporteId?: number | null;
    medicionId?: number | null;
  },
  opciones?: OpcionesFlujo,
): Promise<void> {
  requerirPermiso(sesion, "mejora.registrar");
  const leido = EsquemaOcurrencia.safeParse(d);
  if (!leido.success) throw new ErrorMejora(leido.error.issues[0].message);
  const o = leido.data;
  // La medición de la que nace (la marca de un indicador, anexo 15B §6.2), como id: el evento y la bitácora la nombran.
  const deLaMedicion = o.origen === "medicion" && o.medicionId !== null ? { medicionId: o.medicionId } : {};
  const ahora = opciones?.ahora ?? new Date();
  return legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      const h = await bloquearHallazgo(tx, o.hallazgoId);
      if (sesion.rol === "lider_proceso" && !enAlcance(await alcanceProcesos(sesion, { sql: tx }), h.procesoId)) {
        // Quien lo ve por otro camino (una actividad suya) no puede añadirle ocurrencias; quien no lo ve, no sabe que existe.
        throw (await puedeVerHallazgo(h.id, sesion, { sql: tx })) ? new ErrorPermiso() : new ErrorMejora(NO_EXISTE);
      }
      if (h.estado === "cerrado") throw new ErrorMejora("El hallazgo ya terminó: regístrelo como reincidencia");
      if (TERMINALES.includes(h.estado)) throw new ErrorMejora("El hallazgo ya terminó y no admite ocurrencias");
      const c = await contextoDeMejora(tx, ahora);
      if (o.fecha > fechaEnZona(c.ahora, c.zona)) throw new ErrorMejora("La fecha de la ocurrencia no puede ser futura");
      const [{ titulo }] = await tx`SELECT titulo FROM mejora_hallazgos WHERE id = ${h.id}`;
      await tx`INSERT INTO mejora_ocurrencias (hallazgo_id, fecha, descripcion, origen, reporte_id, registrado_por, creado_en)
        VALUES (${h.id}, ${o.fecha}, ${o.descripcion}, ${o.origen}, ${o.reporteId}, ${sesion.usuarioId}, ${c.ahora})`;
      await dejarEvento(tx, {
        hallazgoId: h.id,
        ronda: h.ronda,
        tipo: "ocurrencia",
        detalle: { fecha: o.fecha, origen: o.origen, ...deLaMedicion },
        usuarioId: sesion.usuarioId,
        ocurrioEn: c.ahora,
      });
      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: "mejora_ocurrencia",
        entidad: ENTIDAD_HALLAZGO,
        entidadId: h.id,
        detalle: { codigo: h.codigo, titulo, fecha: o.fecha, origen: o.origen, ...deLaMedicion },
      });
      const lideres = await lideresDeProceso(h.procesoId, { sql: tx });
      const admins = await activosDeRol(tx, ["admin_sgc"]);
      const destinos = [...new Set([...lideres, ...admins])].filter((u) => u !== sesion.usuarioId);
      await avisarDeMejora(
        tx,
        { tipo: "mejora.ocurrencia", titulo: `Nueva ocurrencia en ${h.codigo}`, hallazgoId: h.id },
        destinos.map((usuarioId) => ({ usuarioId, cuerpo: titulo as string })),
      );
      if (h.estado === "en_espera") {
        const verificadores = (await verificadoresActivos(tx, h)).filter((u) => u !== sesion.usuarioId);
        await avisarDeMejora(
          tx,
          { tipo: "mejora.recurrencia", titulo: `Posible recurrencia en ${h.codigo}, en espera de su evaluación`, hallazgoId: h.id },
          verificadores.map((usuarioId) => ({ usuarioId, cuerpo: titulo as string })),
        );
      }
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Editar, reclasificar, cambiar de proceso y anular (spec §7.6)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mientras el hallazgo está «Por aceptar», quien lo registró corrige cualquier campo de la identificación menos el código;
 * el evento `editado` guarda el antes y el después de lo que cambió. Si cambia el proceso, avisa a sus líderes y el plazo de
 * aceptar se cuenta otra vez desde este acto (como `cambiarProceso`). Si el origen pasa a externo, queda aceptado (§7.4). La no
 * conformidad de un hallazgo de verificación (Fase 15B, anexo §7.2) conserva su clase y su origen, que son fijos y se ponen antes de
 * leer lo enviado (la única validación ya los usa: lo forzado no cuenta ni en lo que el esquema exige), y su proceso sigue entre los
 * del punto (`procesosDelPunto`, sin la regla de quién ve el punto). Lo enviado se lee después de bloquear el hallazgo: ahí se sabe si
 * nació de un hallazgo de verificación.
 */
export async function editarHallazgo(sesion: SesionFlujo, id: number, d: DatosDeHallazgo, opciones?: OpcionesFlujo): Promise<void> {
  requerirPermiso(sesion, "mejora.registrar");
  const ahora = opciones?.ahora ?? new Date();
  return legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      const h = await bloquearHallazgo(tx, id);
      if (h.registradoPor !== sesion.usuarioId) {
        throw (await puedeVerHallazgo(id, sesion, { sql: tx })) ? new ErrorPermiso() : new ErrorMejora(NO_EXISTE);
      }
      if (h.estado !== "por_aceptar") throw new ErrorMejora(YA_CAMBIO);
      const leido = EsquemaHallazgo.safeParse(h.verificacionHallazgoId === null ? d : { ...d, ...FIJOS_DE_VERIFICACION });
      if (!leido.success) throw new ErrorMejora(leido.error.issues[0].message);
      const v = leido.data;
      if (h.verificacionHallazgoId !== null) exigirProcesoDelPunto(await procesosDelPunto(tx, h.verificacionHallazgoId), v.procesoId);
      if (sesion.rol === "lider_proceso" && !enAlcance(await alcanceProcesos(sesion, { sql: tx }), v.procesoId)) {
        throw new ErrorPermiso();
      }
      const c = await contextoDeMejora(tx, ahora);
      const f = await leerFila(tx, h.id);
      const antes = identificacionDeFila(f);
      const previos = { documentoId: antes.documentoId, indicadorId: antes.indicadorId, medicionId: antes.medicionId } as EnlacesPrevios;
      await revisarIdentificacion(tx, sesion, v, c, previos);
      await exigirReincidencia(tx, v.reincidenteDe, v.procesoId, h.id);
      const despues = identificacionDeValidado(v);
      const cambios = diferencias(antes, despues);
      if (!hayCambios(cambios)) throw new ErrorMejora("No cambió ningún dato del hallazgo");
      await tx`UPDATE mejora_hallazgos SET clase = ${v.clase}, origen = ${v.origen}, fuente = ${v.fuente},
          referencia_caso = ${v.referenciaCaso}, detectado_en = ${v.detectadoEn}, proceso_id = ${v.procesoId},
          subproceso_id = ${v.subprocesoId}, criticidad = ${v.criticidad}, titulo = ${v.titulo}, descripcion = ${v.descripcion},
          requisito_clausula = ${v.requisitoClausula}, requisito_norma_id = ${v.requisitoNormaId},
          requisito_documento_id = ${v.requisitoDocumentoId}, documento_id = ${v.documentoId}, indicador_id = ${v.indicadorId},
          medicion_id = ${v.medicionId}, riesgo = ${v.riesgo}, fecha_limite_ente = ${v.fechaLimiteEnte},
          reincidente_de = ${v.reincidenteDe}
        WHERE id = ${h.id}`;
      if (antes.fechaLimiteEnte !== despues.fechaLimiteEnte) {
        const formularAntes = formularAntesDe({ registradoEn: f.registrado_en as Date, fechaLimiteEnte: v.fechaLimiteEnte }, c);
        await tx`UPDATE mejora_rondas SET formular_antes_de = ${formularAntes} WHERE hallazgo_id = ${h.id} AND numero = 1`;
      }
      await dejarEvento(tx, {
        hallazgoId: h.id,
        ronda: h.ronda,
        tipo: "editado",
        detalle: { antes: cambios.antes, despues: cambios.despues },
        usuarioId: sesion.usuarioId,
        ocurrioEn: c.ahora,
      });
      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: "mejora_editar",
        entidad: ENTIDAD_HALLAZGO,
        entidadId: h.id,
        detalle: { codigo: h.codigo, campos: Object.keys(cambios.antes) },
      });
      if (antes.procesoId !== despues.procesoId) {
        // Los líderes nuevos lo reciben ahora: su plazo de aceptar cuenta desde este acto, con su propio aviso de vencido y de
        // escalamiento.
        await tx`UPDATE mejora_hallazgos SET vence_en = ${venceEn("aceptar", c.ahora, c)}, aviso_vencido_en = NULL, escalado_en = NULL
          WHERE id = ${h.id}`;
        await avisarAlProcesoNuevo(tx, h, v.procesoId, v.titulo, sesion.usuarioId);
      }
      if (!esExterno(antes.origen as Origen) && esExterno(v.origen)) {
        await transicionarHallazgo(
          tx,
          sesion,
          h,
          "reclasificar",
          {
            rumbo: { quedaEn: aceptadoVaA({ clase: v.clase, verificacionHallazgoId: h.verificacionHallazgoId }) },
            soloEnElEvento: { justificacion: "El origen pasó a externo al editar el registro" },
          },
          c,
        );
        await avisarDelExterno(tx, h, v.titulo, sesion.usuarioId);
      }
    }),
  );
}

const FIRMADA = "La identificación ya se firmó: no se puede reclasificar";

/**
 * El Admin SGC corrige la identificación, con justificación, hasta que se envía el plan de la ronda 1 (spec §7.6). La
 * descripción no se reescribe: la nota queda en el evento. Las consecuencias salen de la tabla de §7.6
 * (`destinoDeReclasificacion`) y el estado cambia siempre por `transicionarHallazgo`; si cambia, el plazo de formular se
 * cuenta de nuevo desde este acto (§13.3).
 */
export async function reclasificarHallazgo(
  sesion: SesionFlujo,
  d: {
    hallazgoId: number;
    clase: Clase;
    criticidad: Criticidad | null;
    origen: Origen;
    fuente: string | null;
    referenciaCaso?: string | null;
    titulo: string;
    requisitoClausula: string | null;
    requisitoNormaId: number | null;
    requisitoDocumentoId: number | null;
    reincidenteDe: number | null;
    fechaLimiteEnte: string | null;
    nota: string | null;
    justificacion: string;
  },
  opciones?: OpcionesFlujo,
): Promise<void> {
  requerirPermiso(sesion, "mejora.gestionar");
  const leido = EsquemaReclasificacion.safeParse(d);
  if (!leido.success) throw new ErrorMejora(leido.error.issues[0].message);
  const r = leido.data;
  const ahora = opciones?.ahora ?? new Date();
  return legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      const h = await bloquearHallazgo(tx, r.hallazgoId);
      if (!(DESDE.reclasificar as readonly string[]).includes(h.estado)) throw new ErrorMejora(YA_CAMBIO);
      const [ronda] = await tx`SELECT enviado_en FROM mejora_rondas WHERE hallazgo_id = ${h.id} AND numero = ${h.ronda}`;
      if (h.ronda > 1 || ronda?.enviado_en) throw new ErrorMejora(FIRMADA);
      const c = await contextoDeMejora(tx, ahora);
      const f = await leerFila(tx, h.id);
      const antes = identificacionDeFila(f);
      const unida = EsquemaHallazgo.safeParse({
        ...antes,
        clase: r.clase,
        criticidad: r.criticidad,
        origen: r.origen,
        fuente: r.fuente,
        referenciaCaso: r.referenciaCaso ?? antes.referenciaCaso,
        titulo: r.titulo,
        requisitoClausula: r.requisitoClausula,
        requisitoNormaId: r.requisitoNormaId,
        requisitoDocumentoId: r.requisitoDocumentoId,
        reincidenteDe: r.reincidenteDe,
        fechaLimiteEnte: r.fechaLimiteEnte,
      });
      if (!unida.success) throw new ErrorMejora(unida.error.issues[0].message);
      const v = unida.data;
      await exigirReincidencia(tx, v.reincidenteDe, h.procesoId, h.id);
      const despues = identificacionDeValidado(v);
      const cambios = diferencias(antes, despues);
      if (!hayCambios(cambios) && !r.nota) throw new ErrorMejora("No cambió ningún dato de la identificación");
      const quedaEn = destinoDeReclasificacion(perfilDe(antes, h.verificacionHallazgoId), perfilDe(despues, h.verificacionHallazgoId), h.estado, {
        correccionRegistrada: f.correccion_registrada_en !== null,
      });
      const cambiaElEstado = quedaEn !== h.estado;
      const cambiaLaFecha = antes.fechaLimiteEnte !== despues.fechaLimiteEnte;
      if (cambiaElEstado || cambiaLaFecha) {
        const formularAntes = formularAntesDe(
          { registradoEn: cambiaElEstado ? c.ahora : (f.registrado_en as Date), fechaLimiteEnte: v.fechaLimiteEnte },
          c,
        );
        await tx`UPDATE mejora_rondas SET formular_antes_de = ${formularAntes} WHERE hallazgo_id = ${h.id} AND numero = ${h.ronda}`;
        if (!cambiaElEstado && h.estado === "por_formular") {
          await tx`UPDATE mejora_hallazgos SET vence_en = ${formularAntes}, aviso_vencido_en = NULL, escalado_en = NULL WHERE id = ${h.id}`;
        }
      }
      // Al salir de una decisión hacia «Por formular», la decisión anterior ya no vale: la acción pasa a ser obligada y se
      // borra quién y cuándo decidió (o validó). El antes y el después quedan en el evento.
      const saleDeUnaDecision = quedaEn === "por_formular" && (h.estado === "por_decidir" || h.estado === "por_validar");
      let decision: Record<string, unknown> | null = null;
      if (saleDeUnaDecision) {
        decision = {
          antes: {
            accionRequerida: (f.accion_requerida as boolean | null) ?? null,
            justificacion: (f.accion_justificacion as string | null) ?? null,
            decididaPor: idONulo(f.accion_decidida_por),
            decididaEn: (f.accion_decidida_en as Date | null) ?? null,
            validadaPor: idONulo(f.validada_por),
            validadaEn: (f.validada_en as Date | null) ?? null,
          },
          despues: { accionRequerida: true },
        };
        await tx`UPDATE mejora_hallazgos SET accion_requerida = true, accion_justificacion = NULL, accion_decidida_por = NULL,
          accion_decidida_en = NULL, validada_por = NULL, validada_en = NULL WHERE id = ${h.id}`;
      }
      await tx`UPDATE mejora_hallazgos SET clase = ${v.clase}, criticidad = ${v.criticidad}, origen = ${v.origen},
          fuente = ${v.fuente}, referencia_caso = ${v.referenciaCaso}, titulo = ${v.titulo},
          requisito_clausula = ${v.requisitoClausula}, requisito_norma_id = ${v.requisitoNormaId},
          requisito_documento_id = ${v.requisitoDocumentoId}, reincidente_de = ${v.reincidenteDe},
          fecha_limite_ente = ${v.fechaLimiteEnte}
        WHERE id = ${h.id}`;
      await transicionarHallazgo(
        tx,
        sesion,
        h,
        "reclasificar",
        {
          rumbo: { quedaEn },
          // A la bitácora, solo qué campos cambiaron (como al editar); el antes y el después, la justificación, la decisión que se
          // borra y la nota llevan texto escrito por una persona: van al evento (spec §6.4).
          detalle: { campos: Object.keys(cambios.antes) },
          soloEnElEvento: {
            antes: cambios.antes,
            despues: cambios.despues,
            justificacion: r.justificacion,
            ...(decision ? { decision } : {}),
            ...(r.nota ? { nota: r.nota } : {}),
          },
        },
        c,
      );
      if (!esExterno(antes.origen as Origen) && esExterno(v.origen)) await avisarDelExterno(tx, h, v.titulo, sesion.usuarioId);
    }),
  );
}

/**
 * El proceso solo se cambia mientras el hallazgo está «Por aceptar», y avisa a los líderes del proceso nuevo (spec §7.6), que lo
 * reciben entonces: el plazo de aceptar se cuenta otra vez desde este acto.
 */
export async function cambiarProceso(
  sesion: SesionFlujo,
  d: { hallazgoId: number; procesoId: number; justificacion: string },
  opciones?: OpcionesFlujo,
): Promise<void> {
  requerirPermiso(sesion, "mejora.gestionar");
  const leido = EsquemaCambioDeProceso.safeParse(d);
  if (!leido.success) throw new ErrorMejora(leido.error.issues[0].message);
  const r = leido.data;
  const ahora = opciones?.ahora ?? new Date();
  return legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      const h = await bloquearHallazgo(tx, r.hallazgoId);
      if (h.estado !== "por_aceptar") throw new ErrorMejora(YA_CAMBIO);
      if (h.procesoId === r.procesoId) throw new ErrorMejora("Elija un proceso distinto del actual");
      const [nuevo] = await tx`SELECT nombre, activo FROM procesos WHERE id = ${r.procesoId}`;
      if (!nuevo?.activo) throw new ErrorMejora("Elija un proceso activo");
      const c = await contextoDeMejora(tx, ahora);
      const [viejo] = await tx`SELECT p.nombre, h.titulo, h.subproceso_id, h.reincidente_de
        FROM mejora_hallazgos h JOIN procesos p ON p.id = h.proceso_id WHERE h.id = ${h.id}`;
      // El subproceso es del proceso anterior, y una reincidencia solo vale dentro de su proceso. Los líderes nuevos lo reciben
      // ahora: su plazo de aceptar cuenta desde este acto, con su propio aviso de vencido y de escalamiento.
      await tx`UPDATE mejora_hallazgos SET proceso_id = ${r.procesoId}, subproceso_id = NULL, reincidente_de = NULL,
        vence_en = ${venceEn("aceptar", c.ahora, c)}, aviso_vencido_en = NULL, escalado_en = NULL WHERE id = ${h.id}`;
      await dejarEvento(tx, {
        hallazgoId: h.id,
        ronda: h.ronda,
        tipo: "proceso_cambiado",
        detalle: {
          antes: {
            procesoId: h.procesoId,
            proceso: viejo.nombre,
            subprocesoId: idONulo(viejo.subproceso_id),
            reincidenteDe: idONulo(viejo.reincidente_de),
          },
          despues: { procesoId: r.procesoId, proceso: nuevo.nombre, subprocesoId: null, reincidenteDe: null },
          justificacion: r.justificacion,
        },
        usuarioId: sesion.usuarioId,
        ocurrioEn: c.ahora,
      });
      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: "mejora_cambiar_proceso",
        entidad: ENTIDAD_HALLAZGO,
        entidadId: h.id,
        // La justificación es texto libre: queda en el evento (spec §6.4).
        detalle: { codigo: h.codigo, antes: viejo.nombre, despues: nuevo.nombre },
      });
      await avisarAlProcesoNuevo(tx, h, r.procesoId, viejo.titulo as string, sesion.usuarioId);
    }),
  );
}

/**
 * Anula un hallazgo no terminado, con justificación (spec §7.6): queda «Anulado» con su código y su historia. Sus
 * actividades sin terminar pasan a canceladas y sus ajustes por decidir, a negados (spec §10.6); el motivo, esas cancelaciones y
 * esos ajustes se escriben **antes** del cambio de estado:
 * un hallazgo anulado ya no admite escrituras (trigger `sgc_impedir_si_hallazgo_terminado`). Avisa a los líderes, a los
 * responsables de las actividades que se cancelaron y a Gerencia si el plan lo había aprobado ella.
 */
export async function anularHallazgo(
  sesion: SesionFlujo,
  d: { hallazgoId: number; justificacion: string },
  opciones?: OpcionesFlujo,
): Promise<void> {
  requerirPermiso(sesion, "mejora.gestionar");
  const leido = EsquemaAnulacion.safeParse(d);
  if (!leido.success) throw new ErrorMejora(leido.error.issues[0].message);
  const r = leido.data;
  const ahora = opciones?.ahora ?? new Date();
  return legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      const h = await bloquearHallazgo(tx, r.hallazgoId);
      if (TERMINALES.includes(h.estado)) throw new ErrorMejora(YA_CAMBIO);
      const c = await contextoDeMejora(tx, ahora);
      const [{ titulo }] = await tx`SELECT titulo FROM mejora_hallazgos WHERE id = ${h.id}`;
      // Una carga sin su formato firmado no le entregó nada a sus responsables (spec §15): no se les avisa que se anuló.
      const sinEntregar = await cargaPendiente(tx, h.id);
      const canceladas = await tx`UPDATE mejora_actividades SET estado = 'cancelada', cancelada_en = ${c.ahora}
        WHERE hallazgo_id = ${h.id} AND estado IN ('abierta', 'en_proceso') RETURNING responsable_id, fin_original`;
      await tx`UPDATE mejora_hallazgos SET anulado_motivo = ${r.justificacion} WHERE id = ${h.id}`;
      // Los ajustes que quedaban por decidir se niegan a nombre de quien anula, antes de la transición: un hallazgo anulado ya
      // no admite cambios en sus hijas (spec §10.6; trigger `sgc_impedir_si_hallazgo_terminado`).
      await tx`UPDATE mejora_ajustes SET estado = 'negado', decidido_por = ${sesion.usuarioId}, decidido_en = ${c.ahora},
          nota = ${AJUSTE_POR_ANULACION}
        WHERE hallazgo_id = ${h.id} AND estado = 'pendiente'`;
      await transicionarHallazgo(
        tx,
        sesion,
        h,
        "anular",
        { detalle: { actividadesCanceladas: canceladas.length }, soloEnElEvento: { justificacion: r.justificacion } },
        c,
      );
      // Solo los responsables de un plan aprobado alguna vez: a quien figuraba en un borrador nunca se le entregó nada.
      const entregadas = sinEntregar ? [] : canceladas.filter((a) => a.fin_original !== null);
      const responsables = entregadas.length
        ? (
            await tx`SELECT id FROM usuarios WHERE activo AND id = ANY(${entregadas.map((a) => Number(a.responsable_id))}::bigint[])`
          ).map((u) => Number(u.id))
        : [];
      const [aprobo] = await tx`SELECT 1 FROM mejora_rondas WHERE hallazgo_id = ${h.id} AND aprobado_rol = 'gerencia' AND aprobado_en IS NOT NULL LIMIT 1`;
      const gerencia = aprobo ? await activosDeRol(tx, ["gerencia"]) : [];
      const destinos = [...new Set([...(await lideresOAdmins(tx, h.procesoId)), ...responsables, ...gerencia])].filter(
        (u) => u !== sesion.usuarioId,
      );
      await avisarDeMejora(
        tx,
        { tipo: "mejora.anulado", titulo: `Se anuló ${h.codigo}`, hallazgoId: h.id },
        destinos.map((usuarioId) => ({ usuarioId, cuerpo: titulo as string })),
      );
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// La respuesta al ente (spec §13.4)
// ─────────────────────────────────────────────────────────────────────────────

export const SIN_OFICIO = "Adjunte el oficio de respuesta";
export const OFICIO_AJENO = "Elija el oficio entre los archivos del hallazgo subidos después de aprobar el plan";
export const SOLO_EXTERNO = "Solo un hallazgo de origen externo lleva respuesta al ente";
export const PLAN_SIN_APROBAR = "El plan todavía no está aprobado: la respuesta al ente se registra después de aprobarlo";
export const YA_RESPONDIDO = "Ya se registró la respuesta al ente";
// Los bordes de la fecha de envío son los mismos desde el plan (anexo 15B §3.8): viven en `respuesta-plan.ts`.
export { ENVIO_FUTURO, envioAntesDeAprobar };

/**
 * La aprobación del plan de la ronda en vigor (la del hallazgo): el día, en la zona de la instalación, en que se aprobó (en uno
 * cargado, el que se declaró, spec §15); nula si el plan de esa ronda no está aprobado. La respuesta al ente responde a ese plan
 * (spec §13.4).
 */
export async function aprobacionEnVigor(sql: Cliente, hallazgoId: number, zona: string): Promise<{ dia: string } | null> {
  const [r] = await sql`SELECT r.aprobado_en FROM mejora_rondas r JOIN mejora_hallazgos h ON h.id = r.hallazgo_id AND h.ronda = r.numero
    WHERE r.hallazgo_id = ${hallazgoId} AND r.estado_plan = 'aprobado' AND r.aprobado_en IS NOT NULL`;
  return r ? { dia: fechaEnZona(r.aprobado_en as Date, zona) } : null;
}

/**
 * Los archivos del hallazgo (rol `evidencia`) subidos después de aprobado el plan de la ronda en vigor: los que pueden ser el
 * oficio de la respuesta al ente. «Después» lo dice el orden de la bitácora, la subida (`subir_archivo`) contra la transición que
 * aprobó el plan de esa ronda (la que la llevó a «En ejecución», con su `ronda` en el detalle), y no la hora:
 * `archivos.creado_en` es la de la base al subir y la aprobación guarda la de `ahora`. En un hallazgo cargado (spec §15) el plan de
 * la ronda 1 se aprobó en papel: cuenta su carga (`mejora_cargar`, nazca «En ejecución» o «Por verificar»). Sin ese plan aprobado,
 * ninguno. Una sola regla para el acto y para el formulario.
 */
export async function oficiosPosibles(sql: Cliente, hallazgoId: number): Promise<number[]> {
  const filas = await sql`
    WITH h AS (SELECT id, ronda FROM mejora_hallazgos WHERE id = ${hallazgoId}),
    aprobado AS (
      SELECT max(au.id) AS id FROM auditoria au CROSS JOIN h
      WHERE au.entidad = 'mejora_hallazgo' AND au.entidad_id = h.id AND au.detalle->>'ronda' = h.ronda::text
        AND ((au.accion IN ('mejora_aprobar_plan', 'mejora_revisar_plan') AND au.detalle->'estado'->>'despues' = 'en_ejecucion')
          OR au.accion = 'mejora_cargar'))
    SELECT a.id FROM archivos a CROSS JOIN aprobado
    WHERE a.contexto = 'mejora_hallazgo' AND a.contexto_id = ${hallazgoId} AND a.rol = 'evidencia' AND a.version_id IS NULL
      AND aprobado.id IS NOT NULL
      AND EXISTS (SELECT 1 FROM auditoria s
        WHERE s.accion = 'subir_archivo' AND s.entidad = 'archivo' AND s.entidad_id = a.id AND s.id > aprobado.id)
    ORDER BY a.id`;
  return filas.map((f) => Number(f.id));
}

/**
 * El Admin SGC registra la respuesta al ente de un hallazgo externo con el plan de la ronda en vigor aprobado (spec §13.4): la
 * fecha en que se envió, ni posterior a hoy ni anterior al día en que se aprobó ese plan (en la zona de la instalación), y el
 * oficio, uno de los archivos del hallazgo subidos después de esa aprobación (`oficiosPosibles`), comprobado dentro de la
 * transacción. Una sola vez. Deja la fecha y quién en el hallazgo, el evento `respuesta_ente` y su bitácora, con la fecha y el id
 * del oficio, sin texto libre; desde entonces el oficio no se quita. Cumple la tarea «Registrar la respuesta al ente». No avisa:
 * no le pasa el turno a nadie. Un hallazgo que está en un plan se responde desde el plan (anexo 15B §3.8,
 * `registrarRespuestaDelPlan`): aquí se rechaza con `RESPONDA_DESDE_EL_PLAN`, mirado con el hallazgo ya bloqueado (quien lo pone
 * en un plan o lo saca lo bloquea después del plan y espera este candado).
 */
export async function registrarRespuestaAlEnte(
  sesion: SesionFlujo,
  d: { hallazgoId: number; enviadaEn: string; oficioId: number },
  opciones?: OpcionesFlujo,
): Promise<void> {
  requerirPermiso(sesion, "mejora.gestionar");
  const leido = EsquemaRespuestaAlEnte.safeParse(d);
  if (!leido.success) throw new ErrorMejora(leido.error.issues[0].message);
  const r = leido.data;
  const ahora = opciones?.ahora ?? new Date();
  return legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      // El hallazgo `FOR UPDATE` primero: una subida o una quitada de sus archivos lo toma `FOR SHARE` y espera.
      const h = await bloquearHallazgo(tx, r.hallazgoId);
      if (!(await puedeVerHallazgo(h.id, sesion, { sql: tx }))) throw new ErrorMejora(NO_EXISTE);
      if (TERMINALES.includes(h.estado)) throw new ErrorMejora("El hallazgo ya terminó y no admite cambios");
      if (!esExterno(h.origen)) throw new ErrorMejora(SOLO_EXTERNO);
      const [f] = await tx`SELECT respuesta_ente_en FROM mejora_hallazgos WHERE id = ${h.id}`;
      if (f.respuesta_ente_en !== null) throw new ErrorMejora(YA_RESPONDIDO);
      if (await planQueResponde(tx, h.id)) throw new ErrorMejora(RESPONDA_DESDE_EL_PLAN);
      const c = await contextoDeMejora(tx, ahora);
      const aprobacion = await aprobacionEnVigor(tx, h.id, c.zona);
      if (!aprobacion) throw new ErrorMejora(PLAN_SIN_APROBAR);
      if (r.enviadaEn > fechaEnZona(c.ahora, c.zona)) throw new ErrorMejora(ENVIO_FUTURO);
      if (r.enviadaEn < aprobacion.dia) throw new ErrorMejora(envioAntesDeAprobar(aprobacion.dia));
      const candidatos = await oficiosPosibles(tx, h.id);
      if (candidatos.length === 0) throw new ErrorMejora(SIN_OFICIO);
      if (!candidatos.includes(r.oficioId)) throw new ErrorMejora(OFICIO_AJENO);
      await tx`UPDATE mejora_hallazgos SET respuesta_ente_en = ${r.enviadaEn}, respuesta_ente_por = ${sesion.usuarioId} WHERE id = ${h.id}`;
      await dejarEvento(tx, {
        hallazgoId: h.id,
        ronda: h.ronda,
        tipo: "respuesta_ente",
        detalle: { enviadaEn: r.enviadaEn, oficioId: r.oficioId },
        usuarioId: sesion.usuarioId,
        ocurrioEn: c.ahora,
      });
      await registrarAuditoria(tx, {
        usuarioId: sesion.usuarioId,
        accion: "mejora_respuesta_ente",
        entidad: ENTIDAD_HALLAZGO,
        entidadId: h.id,
        detalle: { codigo: h.codigo, enviadaEn: r.enviadaEn, oficioId: r.oficioId },
      });
    }),
  );
}

/**
 * Lo enlazado que el formulario de edición no pinta: la edición lo conserva en vez de borrarlo. `verificacionHallazgoId` (Fase 15B,
 * anexo §7.2) dice además si la clase y el origen son fijos; no se reenvía: no cambia nunca.
 */
export async function enlacesDelHallazgo(
  id: number,
  opciones?: { sql?: Cliente },
): Promise<{
  subprocesoId: number | null;
  documentoId: number | null;
  indicadorId: number | null;
  medicionId: number | null;
  reincidenteDe: number | null;
  verificacionHallazgoId: number | null;
}> {
  const sql = opciones?.sql ?? obtenerSql();
  const [f] = await sql`SELECT subproceso_id, documento_id, indicador_id, medicion_id, reincidente_de, verificacion_hallazgo_id
    FROM mejora_hallazgos WHERE id = ${id}`;
  if (!f) throw new ErrorMejora(NO_EXISTE);
  return {
    verificacionHallazgoId: idONulo(f.verificacion_hallazgo_id),
    subprocesoId: idONulo(f.subproceso_id),
    documentoId: idONulo(f.documento_id),
    indicadorId: idONulo(f.indicador_id),
    medicionId: idONulo(f.medicion_id),
    reincidenteDe: idONulo(f.reincidente_de),
  };
}

/** El proceso en que está un hallazgo ahora (la edición compara contra el que se eligió). */
export async function procesoDelHallazgo(id: number, opciones?: { sql?: Cliente }): Promise<number> {
  const [f] = await (opciones?.sql ?? obtenerSql())`SELECT proceso_id FROM mejora_hallazgos WHERE id = ${id}`;
  if (!f) throw new ErrorMejora(NO_EXISTE);
  return Number(f.proceso_id);
}

/**
 * El hallazgo de origen de uno derivado (`/mejoramiento/nuevo?derivado=<id>`, spec §11.4): su código, su título y su proceso,
 * solo si quien registra lo ve; si no, o si no existe, nulo (la página no dice por qué lo ignoró).
 */
export async function hallazgoDeOrigen(
  sesion: SesionFlujo,
  id: number,
  opciones?: { sql?: Cliente },
): Promise<{ id: number; codigo: string; titulo: string; procesoId: number } | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const sql = opciones?.sql ?? obtenerSql();
  if (!(await puedeVerHallazgo(id, sesion, { sql }))) return null;
  const [f] = await sql`SELECT id, codigo, titulo, proceso_id FROM mejora_hallazgos WHERE id = ${id}`;
  return f ? { id: Number(f.id), codigo: f.codigo as string, titulo: f.titulo as string, procesoId: Number(f.proceso_id) } : null;
}
