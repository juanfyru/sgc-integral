/**
 * Los planes de mejoramiento de la demo (spec 15 §22): catorce hallazgos que cubren el recorrido, dos reportes de `consulta`
 * y un día no hábil de ejemplo en el calendario de la entidad. Lo que se siembra y con qué etiqueta queda está en
 * `HALLAZGOS_DE_LA_DEMO` (lo lee `tests/semilla-mejoramiento.test.ts`).
 *
 * Todo pasa por las funciones del dominio, cada paso con la hora en que ocurrió (`opciones.ahora`, contada desde el reloj de
 * la siembra con `momentoHace`), y las firmas con la clave de la demo (`firmaDeLaDemo`): nunca SQL que escriba en las tablas
 * `mejora_*`. Un paso que caería después del reloj de la siembra detiene la semilla. Los archivos (la evidencia de una
 * corrección, de una actividad y el formato firmado de la carga) son PDF mínimos que la semilla genera y sube por
 * `registrarArchivo`, como cualquier otro; el de la carga, con la hora inyectada, así su evento `carga_confirmada` queda en
 * su día. La bitácora, los avisos y la hora de subida de un archivo llevan la hora de la siembra: no reciben otra.
 *
 * Cada hallazgo es una función corta que encadena sus pasos. Se siembran en el orden de su registro, para que los códigos
 * `HZ-AAAA-NNN` salgan en el orden de sus fechas; el reincidente de Apoyo Terapéutico va después del cerrado del que es
 * reincidencia. Al final corre la pasada de vencimientos de mejoramiento a la hora de la siembra: sembrada la demo, otra
 * pasada no tiene nada nuevo que avisar.
 *
 * Los procesos con líder son Gestión del Talento Humano (`lider.gth`) y Consulta Externa (`lider.cex`); en los demás actúa el
 * Admin SGC (`coordinadora.sgc`, F15-DC3) y, como durante la siembra no hay otro Admin SGC, el plan que ella elabora pasa
 * directo a Gerencia (F15-DC15).
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Sql } from "postgres";
import { resolverRutaAlmacen } from "../../lib/almacen";
import { esHabil, restarDiasHabiles, type AjustesDeCalendario } from "../../lib/dias-habiles";
import type { CriterioEficacia, MetodoAnalisis, TipoAccion } from "../../lib/mejoramiento/tipos";
import { fechaEnZona, finDeFecha } from "../../lib/tramites/plazos";
import { zonaHoraria } from "../../lib/zona-horaria";
import { registrarArchivo } from "../consultas/admin";
import { obtenerConfigDocumental } from "../consultas/config-documental";
import type { OpcionesFlujo, SesionFlujo } from "../consultas/flujo/contrato";
import { registrarSeguimiento, terminarActividad } from "../consultas/mejoramiento/actividades";
import { pedirAjuste } from "../consultas/mejoramiento/ajustes";
import { guardarAnalisis, guardarCausas, responderPreguntas } from "../consultas/mejoramiento/analisis";
import { aprobarPlan, enviarPlan, firmarRevision } from "../consultas/mejoramiento/aprobacion";
import { cargarHallazgo } from "../consultas/mejoramiento/carga";
import { agregarDiaDeCalendario, calendarioDeMejora } from "../consultas/mejoramiento/config";
import { fechaMinimaDe } from "../consultas/mejoramiento/espera";
import { guardarAccion, guardarCriterio } from "../consultas/mejoramiento/plan";
import {
  aceptarHallazgo,
  decidirAccionCorrectiva,
  rechazarHallazgo,
  registrarCorreccion,
  retirarHallazgo,
  sostenerHallazgo,
  validarCorreccion,
} from "../consultas/mejoramiento/recorrido";
import { registrarHallazgo, type DatosDeHallazgo } from "../consultas/mejoramiento/registro";
import { enviarReporte } from "../consultas/mejoramiento/reportes";
import { revisarVencimientosDeMejoramiento } from "../consultas/mejoramiento/vencimientos";
import { cerrarHallazgo, datosDeEvaluacion, evaluarEficacia, huellaDeLoVisto, verificarImplementacion } from "../consultas/mejoramiento/verificacion";
import { generarPlaceholder } from "../placeholders";
import { minutosDespues, momentoHace, sesionDe, type ContextoDistribucion } from "./distribucion-demo";
import { FIRMA, firmaDeLaDemo } from "./vigencia-demo";

/** Un hallazgo de la demo: su título (lo identifica), la etiqueta de su estado y, si la lleva, su marca. */
export type HallazgoDeLaDemo = { titulo: string; etiqueta: string; marca?: string };

/** Los catorce de la Tarea 22, en el orden de su tabla, con la etiqueta de `etiquetaDeEstado` con que quedan. */
export const HALLAZGOS_DE_LA_DEMO = {
  porAceptar: { titulo: "Capacitaciones del plan institucional sin la evaluación de su eficacia", etiqueta: "Por aceptar" },
  enArbitraje: { titulo: "Hojas de vida del personal asistencial sin la verificación de los títulos", etiqueta: "En arbitraje" },
  rechazado: { titulo: "Historias de odontología con el consentimiento informado impreso sin la firma del profesional", etiqueta: "Rechazado" },
  conCorreccion: { titulo: "Consentimiento informado en versión obsoleta en el consultorio de odontología", etiqueta: "Cerrado con corrección" },
  sinAccion: { titulo: "Registro de asistencia a la inducción sin la firma de un participante", etiqueta: "Cerrado sin acción" },
  enEjecucion: { titulo: "Dos turnos de noche sin registro de temperatura de la nevera de vacunas", etiqueta: "En ejecución", marca: "Con algo vencido" },
  porFormular: { titulo: "Adherencia a la guía de hipertensión arterial en Crítico en una de las sedes", etiqueta: "Por formular" },
  enRevision: { titulo: "Muestras de laboratorio de consulta externa rotuladas sin la hora de toma", etiqueta: "En revisión" },
  enAprobacion: { titulo: "Hojas de vida de equipos biomédicos sin el mantenimiento preventivo registrado", etiqueta: "En aprobación", marca: "Prioridad alta" },
  enEspera: { titulo: "Cupos de la agenda de medicina general perdidos por citas incumplidas", etiqueta: "En espera de eficacia" },
  porEvaluar: { titulo: "Tiempo de espera en triage II por encima de la meta en el turno de la noche", etiqueta: "Por evaluar la eficacia" },
  eficaz: { titulo: "Planilla de temperatura de la nevera de vacunas sin diligenciar el fin de semana", etiqueta: "Cerrado · eficaz" },
  reabierto: { titulo: "Unificar el formato de entrega de turno entre hospitalización y urgencias", etiqueta: "Por formular", marca: "Reabierto · ronda 2" },
  cargado: { titulo: "Carro de paro de urgencias sin la lista de chequeo diaria diligenciada", etiqueta: "En ejecución", marca: "Cargado" },
} as const satisfies Record<string, HallazgoDeLaDemo>;

/** Los dos reportes de `consulta` (spec §7.3), por lo que escribió: uno por clasificar y otro convertido en «En revisión». */
export const REPORTES_DE_LA_DEMO = {
  porClasificar: "En la sala de espera de urgencias el dispensador de gel antibacterial lleva tres días vacío.",
  convertido: "Una muestra de sangre de consulta externa llegó al laboratorio sin la hora de toma en el rótulo y hubo que repetir la toma.",
} as const;

/** El día no hábil de ejemplo del calendario de la entidad (spec §22): el primer día hábil desde tres semanas después de la siembra. */
export const DIA_NO_HABIL_DE_EJEMPLO = "Jornada institucional de autoevaluación: no se atienden trámites administrativos";

const CEX_SEGUIMIENTO = "CEX-ID-001";
const CEX_HIPERTENSION = "CEX-ID-003";
const AIN_TRIAGE = "AIN-IND-01";

type Quien = "coordinadora" | "gerente" | "control" | "liderGth" | "liderCex" | "consulta" | "jefeUrgencias" | "regente";

const USUARIO: Record<Quien, string> = {
  coordinadora: "coordinadora.sgc",
  gerente: "gerente",
  control: "control.interno",
  liderGth: "lider.gth",
  liderCex: "lider.cex",
  consulta: "consulta",
  jefeUrgencias: "jefe.urgencias",
  regente: "regente.farmacia",
};

/** Lo que comparten los hallazgos: la conexión, el reloj, el calendario, las sesiones y los catálogos que citan. */
type Siembra = {
  sql: Sql;
  ahora: Date;
  zona: string;
  calendario: AjustesDeCalendario;
  entidad: string;
  s: Record<Quien, SesionFlujo>;
  proceso: Record<string, number>;
  subproceso: (sigla: string, slug: string) => number;
  indicador: (codigo: string) => number;
  norma3100: number;
  /** Los hallazgos ya sembrados, por su clave: el reincidente necesita el cerrado del que es reincidencia. */
  ids: Partial<Record<keyof typeof HALLAZGOS_DE_LA_DEMO, number>>;
};

// ─────────────────────────────────────────────────────────────────────────────
// El reloj
// ─────────────────────────────────────────────────────────────────────────────

/** Ningún paso cae después del reloj de la siembra: si cae, la semilla se detiene. */
function antesDeLaSiembra(s: Siembra, momento: Date): Date {
  if (momento.getTime() >= s.ahora.getTime()) {
    throw new Error(`Paso de la semilla de mejoramiento en el futuro: ${momento.toISOString()}`);
  }
  return momento;
}

/** El momento de un paso: `momentoHace(dias)` (hace `dias` días, ocho horas antes de que acabara ese día) y `minutos` después. */
const hace = (s: Siembra, dias: number, minutos = 0) => antesDeLaSiembra(s, minutosDespues(momentoHace(dias, s.ahora), minutos));

/** El mismo momento en el día `dia` (`AAAA-MM-DD` en la zona): para lo que se cuenta en días hábiles. */
const enElDia = (s: Siembra, dia: string, minutos = 0) =>
  antesDeLaSiembra(s, new Date(finDeFecha(dia, s.zona).getTime() - 8 * 3_600_000 + minutos * 60_000));

/** El día del calendario, en la zona, de hace `dias` días (negativo: en el futuro). Solo fechas: no es la hora de un paso. */
const dia = (s: Siembra, dias: number) => fechaEnZona(momentoHace(dias, s.ahora), s.zona);

/** Las opciones del dominio de un paso: su hora y la firma de la demo. */
const en = (s: Siembra, momento: Date): OpcionesFlujo => ({ sql: s.sql, ahora: momento, verificar: firmaDeLaDemo });

// ─────────────────────────────────────────────────────────────────────────────
// Los pasos comunes
// ─────────────────────────────────────────────────────────────────────────────

const CARPETA = { mejora_hallazgo: "hallazgos", mejora_actividad: "actividades" } as const;

/**
 * Un PDF mínimo de la semilla, en el almacén y registrado por `registrarArchivo` como lo haría la subida: la corrección y el
 * formato de la carga van al hallazgo; la evidencia, a su actividad. Con `ahora`, la hora con que el formato de una carga la
 * confirma.
 */
async function subir(
  s: Siembra,
  x: { contexto: keyof typeof CARPETA; id: number; rol: "correccion" | "carga" | "evidencia"; nombre: string; quien: SesionFlujo; ahora?: Date },
): Promise<void> {
  const contenido = await generarPlaceholder({ codigo: x.nombre, titulo: "Archivo de la demo de mejoramiento", numeroVersion: 1, ext: "pdf", entidad: s.entidad });
  const archivo = `${x.nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}.pdf`;
  const ruta = `mejoramiento/${CARPETA[x.contexto]}/${x.id}/${archivo}`;
  const destino = resolverRutaAlmacen(ruta);
  if (!destino) throw new Error(`Ruta de almacén inválida: ${ruta}`);
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, contenido);
  await registrarArchivo(
    {
      versionId: null,
      rol: x.rol,
      contexto: x.contexto,
      contextoId: x.id,
      ruta,
      nombreOriginal: `${x.nombre}.pdf`,
      extension: "pdf",
      mime: "application/pdf",
      tamanoBytes: contenido.length,
      hashSha256: createHash("sha256").update(contenido).digest("hex"),
    },
    x.quien.usuarioId,
    { sql: s.sql, ...(x.ahora ? { ahora: x.ahora } : {}) },
  );
}

/** La corrección de una no conformidad que sí la requirió, con su evidencia: la registra quien actúa por el proceso. */
async function corregir(
  s: Siembra,
  h: number,
  quien: SesionFlujo,
  x: { descripcion: string; responsable: SesionFlujo; dias: number },
): Promise<void> {
  await subir(s, { contexto: "mejora_hallazgo", id: h, rol: "correccion", nombre: "Evidencia de la corrección", quien });
  await registrarCorreccion(
    quien,
    { hallazgoId: h, requerida: true, descripcion: x.descripcion, responsableId: x.responsable.usuarioId, implementadaEn: dia(s, x.dias) },
    en(s, hace(s, x.dias)),
  );
}

type Actividad = { descripcion: string; responsable: SesionFlujo; inicio: number; fin: number };
type Accion = {
  tipo: TipoAccion;
  descripcion: string;
  /** El número de cada causa que ataca, de 1 en adelante. */
  causas: number[];
  recursos?: string;
  indicadorCumplimiento?: string;
  meta?: string;
  actividades: Actividad[];
};
type Plan = {
  analisis?: Array<{ metodo: MetodoAnalisis; equipo?: string; contenido: unknown }>;
  causas?: string[];
  preguntas?: { similares: string | null; cambios: string | null };
  acciones: Accion[];
  criterios: CriterioEficacia[];
  criterioOtro?: string;
  indicador?: string;
  /** Fuera de la no conformidad: el día de la evaluación, en días atrás. */
  evaluacion?: number;
};

/**
 * La causa raíz y el plan de la ronda en curso, en borrador, a nombre de quien formula, a la hora `momento`: los análisis, las
 * causas, las dos preguntas, las acciones con sus actividades (fechas en días atrás) y el criterio. Devuelve los ids de las
 * actividades, en el orden de sus acciones.
 */
async function formular(s: Siembra, h: number, quien: SesionFlujo, plan: Plan, momento: Date): Promise<number[][]> {
  let paso = 0;
  const o = () => en(s, antesDeLaSiembra(s, minutosDespues(momento, 5 * paso++)));
  for (const a of plan.analisis ?? []) {
    await guardarAnalisis(quien, { hallazgoId: h, metodo: a.metodo, equipo: a.equipo ?? null, contenido: a.contenido }, o());
  }
  if (plan.causas) await guardarCausas(quien, { hallazgoId: h, causas: plan.causas.map((texto) => ({ texto })) }, o());
  if (plan.preguntas) {
    const { similares, cambios } = plan.preguntas;
    await responderPreguntas(
      quien,
      {
        hallazgoId: h,
        similares: similares !== null,
        similaresDetalle: similares,
        cambios: { documentos: cambios !== null, riesgos: false, controles: false, descripcion: cambios },
      },
      o(),
    );
  }
  const causaIds = (
    await s.sql`SELECT c.id FROM mejora_causas c JOIN mejora_rondas r ON r.id = c.ronda_id
      JOIN mejora_hallazgos mh ON mh.id = c.hallazgo_id AND mh.ronda = r.numero
      WHERE c.hallazgo_id = ${h} ORDER BY c.orden, c.id`
  ).map((f) => Number(f.id));
  const actividades: number[][] = [];
  for (const a of plan.acciones) {
    const { id } = await guardarAccion(
      quien,
      {
        hallazgoId: h,
        tipo: a.tipo,
        descripcion: a.descripcion,
        causaIds: a.causas.map((n) => causaIds[n - 1]),
        recursos: a.recursos ?? null,
        indicadorCumplimiento: a.indicadorCumplimiento ?? null,
        meta: a.meta ?? null,
        actividades: a.actividades.map((x) => ({
          descripcion: x.descripcion,
          responsableId: x.responsable.usuarioId,
          inicio: dia(s, x.inicio),
          fin: dia(s, x.fin),
        })),
      },
      o(),
    );
    actividades.push((await s.sql`SELECT id FROM mejora_actividades WHERE accion_id = ${id} ORDER BY orden, id`).map((f) => Number(f.id)));
  }
  await guardarCriterio(
    quien,
    {
      hallazgoId: h,
      criterios: plan.criterios,
      criterioOtro: plan.criterioOtro ?? null,
      indicadorEficaciaId: plan.indicador ? s.indicador(plan.indicador) : null,
      fechaEvaluacion: plan.evaluacion === undefined ? null : dia(s, plan.evaluacion),
    },
    o(),
  );
  return actividades;
}

/** El responsable registra un seguimiento de su actividad el día de hace `dias`. */
async function seguir(s: Siembra, actividadId: number, quien: SesionFlujo, x: { dias: number; realizado: string; avance: number; barreras?: string }) {
  await registrarSeguimiento(
    quien,
    { actividadId, fecha: dia(s, x.dias), realizado: x.realizado, avance: x.avance, barreras: x.barreras ?? null },
    en(s, hace(s, x.dias)),
  );
}

/** El responsable deja su actividad al 100 %, con su evidencia, y la termina: el último seguimiento y el cierre, el mismo día. */
async function terminar(s: Siembra, actividadId: number, quien: SesionFlujo, x: { dias: number; realizado: string; evidencia: string }) {
  await registrarSeguimiento(quien, { actividadId, fecha: dia(s, x.dias), realizado: x.realizado, avance: 100 }, en(s, hace(s, x.dias)));
  await subir(s, { contexto: "mejora_actividad", id: actividadId, rol: "evidencia", nombre: x.evidencia, quien });
  await terminarActividad(quien, { actividadId }, en(s, hace(s, x.dias, 10)));
}

/** Control Interno da por conformes todas las actividades terminadas de la ronda en curso: pasa a «En espera de eficacia». */
async function verificar(s: Siembra, h: number, actividades: number[], x: { dias: number; nota: string }) {
  await verificarImplementacion(
    s.s.control,
    { hallazgoId: h, actividades: actividades.map((id) => ({ id, conforme: true })), metodos: ["evidencias", "observacion"], nota: x.nota },
    en(s, hace(s, x.dias)),
  );
}

/** Control Interno evalúa la eficacia de la ronda en curso con lo que la pantalla le muestra a esa hora (`vistoHuella`). */
async function evaluar(
  s: Siembra,
  h: number,
  x: { dias: number; resultado: "eficaz" | "no_eficaz"; criterios: CriterioEficacia[]; hasta: "minima" | number; justificacion: string },
) {
  const momento = hace(s, x.dias);
  const fm = await fechaMinimaDe(s.sql, h, s.zona);
  if (!fm) throw new Error(`El hallazgo ${h} de la demo debía estar en espera de eficacia`);
  const o = en(s, momento);
  await evaluarEficacia(
    s.s.control,
    {
      hallazgoId: h,
      resultado: x.resultado,
      criterios: x.criterios,
      desde: fm.r,
      hasta: x.hasta === "minima" ? fm.minima : dia(s, x.hasta),
      justificacion: x.justificacion,
      vistoHuella: huellaDeLoVisto(await datosDeEvaluacion(s.s.control, h, o)),
      credenciales: FIRMA,
    },
    o,
  );
}

/** La identificación común: una no conformidad interna del proceso, detectada `detectado` días atrás. */
function identificacion(s: Siembra, clave: keyof typeof HALLAZGOS_DE_LA_DEMO, d: Omit<DatosDeHallazgo, "titulo" | "detectadoEn"> & { detectado: number }): DatosDeHallazgo {
  const { detectado, ...resto } = d;
  return { ...resto, titulo: HALLAZGOS_DE_LA_DEMO[clave].titulo, detectadoEn: dia(s, detectado) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Los catorce hallazgos, cada uno con sus pasos
// ─────────────────────────────────────────────────────────────────────────────

/** «Cerrado · eficaz»: Apoyo Terapéutico (sin líder), verificado y evaluado por Control Interno y cerrado por la coordinadora. */
async function eficaz(s: Siembra): Promise<void> {
  const { id: h } = await registrarHallazgo(
    s.s.control,
    identificacion(s, "eficaz", {
      clase: "no_conformidad",
      origen: "auditoria_interna",
      fuente: "Auditoría interna de cadena de frío",
      detectado: 211,
      procesoId: s.proceso.ATE,
      subprocesoId: s.subproceso("ATE", "farmacia"),
      criticidad: "media",
      descripcion:
        "En la auditoría interna de cadena de frío se encontró la planilla de temperatura de la nevera de vacunas de farmacia sin los registros del sábado y el domingo de dos fines de semana seguidos.",
      requisitoClausula: "ISO 9001:2015, 7.1.5 y 8.5.4",
    }),
    en(s, hace(s, 210)),
  );
  s.ids.eficaz = h;
  await corregir(s, h, s.s.coordinadora, {
    descripcion: "Se revisó el termómetro de máximas y mínimas de esos días: los biológicos se mantuvieron en rango y no hubo que descartar dosis.",
    responsable: s.s.regente,
    dias: 209,
  });
  await decidirAccionCorrectiva(
    s.s.coordinadora,
    { hallazgoId: h, requiere: true, justificacion: "Se repitió en dos fines de semana seguidos: hay que buscar la causa antes de cerrarlo." },
    en(s, hace(s, 208)),
  );
  const [[charla]] = await formular(
    s,
    h,
    s.s.coordinadora,
    {
      analisis: [
        {
          metodo: "cinco_porques",
          equipo: "Regente de farmacia y Coordinación del SGC",
          contenido: {
            niveles: [
              { respuesta: "Nadie registró la temperatura los sábados y los domingos." },
              { respuesta: "El auxiliar de fin de semana no sabía que debía hacerlo." },
              { respuesta: "No recibió la inducción de cadena de frío." },
            ],
          },
        },
      ],
      causas: ["El personal de fin de semana no recibió capacitación en el registro de temperatura"],
      preguntas: { similares: null, cambios: null },
      acciones: [
        {
          tipo: "correctiva",
          descripcion: "Capacitar al personal de farmacia en el registro de temperatura de la nevera de vacunas",
          causas: [1],
          indicadorCumplimiento: "Personal de fin de semana capacitado",
          meta: "Todo el personal de fin de semana",
          actividades: [{ descripcion: "Dar una charla de cadena de frío al personal de farmacia de fin de semana", responsable: s.s.regente, inicio: 200, fin: 185 }],
        },
      ],
      criterios: ["no_recurrencia"],
    },
    hace(s, 206),
  );
  await enviarPlan(s.s.coordinadora, { hallazgoId: h, credenciales: FIRMA }, en(s, hace(s, 203)));
  await aprobarPlan(s.s.gerente, { hallazgoId: h, credenciales: FIRMA }, en(s, hace(s, 201)));
  await terminar(s, charla, s.s.regente, {
    dias: 190,
    realizado: "Se dio la charla de cadena de frío a los auxiliares de fin de semana y firmaron la asistencia.",
    evidencia: "Lista de asistencia a la charla de cadena de frío",
  });
  await verificar(s, h, [charla], { dias: 186, nota: "La lista de asistencia está firmada por todo el personal de fin de semana." });
  await evaluar(s, h, {
    dias: 125,
    resultado: "eficaz",
    criterios: ["no_recurrencia"],
    hasta: "minima",
    justificacion: "Desde la charla no faltó ningún registro de fin de semana en la planilla de temperatura de la nevera de vacunas.",
  });
  await cerrarHallazgo(
    s.s.coordinadora,
    {
      hallazgoId: h,
      lecciones: "El registro de fin de semana se sostuvo; conviene incluir la cadena de frío en la inducción del personal nuevo de farmacia.",
      credenciales: FIRMA,
    },
    en(s, hace(s, 124)),
  );
}

/** «Reabierto · ronda 2»: una oportunidad de mejora de Internación cuya ronda 1 Control Interno evaluó «no eficaz». */
async function reabierto(s: Siembra): Promise<void> {
  const { id: h } = await registrarHallazgo(
    s.s.coordinadora,
    identificacion(s, "reabierto", {
      clase: "oportunidad",
      origen: "autoevaluacion",
      fuente: "Autoevaluación de estándares de habilitación del primer semestre",
      detectado: 102,
      procesoId: s.proceso.INT,
      subprocesoId: s.subproceso("INT", "hospitalizacion-adulto-y-pediatrico"),
      descripcion:
        "En la autoevaluación de estándares se vio que hospitalización y urgencias entregan el turno con formatos distintos, y que la información de quien pasa de un servicio al otro llega incompleta.",
    }),
    en(s, hace(s, 100)),
  );
  s.ids.reabierto = h;
  const [[propuesta, prueba]] = await formular(
    s,
    h,
    s.s.coordinadora,
    {
      acciones: [
        {
          tipo: "mejora",
          descripcion: "Diseñar un formato único de entrega de turno para hospitalización y urgencias",
          causas: [],
          actividades: [
            { descripcion: "Elaborar la propuesta del formato con las jefes de enfermería", responsable: s.s.jefeUrgencias, inicio: 95, fin: 70 },
            { descripcion: "Probar el formato durante un mes en los dos servicios", responsable: s.s.jefeUrgencias, inicio: 69, fin: 40 },
          ],
        },
      ],
      criterios: ["otro"],
      criterioOtro: "Los dos servicios entregan el turno con el mismo formato y completo",
      evaluacion: 20,
    },
    hace(s, 98),
  );
  await enviarPlan(s.s.coordinadora, { hallazgoId: h, credenciales: FIRMA }, en(s, hace(s, 97)));
  await aprobarPlan(s.s.gerente, { hallazgoId: h, credenciales: FIRMA }, en(s, hace(s, 95)));
  await terminar(s, propuesta, s.s.jefeUrgencias, {
    dias: 72,
    realizado: "Se acordó con las jefes de enfermería un formato con diagnóstico, pendientes y alertas.",
    evidencia: "Propuesta del formato de entrega de turno",
  });
  await terminar(s, prueba, s.s.jefeUrgencias, {
    dias: 42,
    realizado: "Se usó el formato durante un mes en los dos servicios y se recogieron las observaciones.",
    evidencia: "Entregas de turno con el formato nuevo",
  });
  await verificar(s, h, [propuesta, prueba], { dias: 38, nota: "Las dos actividades tienen su evidencia y se vio el formato en uso." });
  await evaluar(s, h, {
    dias: 3,
    resultado: "no_eficaz",
    criterios: ["otro"],
    hasta: 4,
    justificacion: "En veinte entregas de turno revisadas, urgencias siguió usando su formato anterior en el turno de la noche.",
  });
}

/** «En espera de eficacia», todavía no evaluable: Consulta Externa, con el indicador mensual `CEX-ID-001` enlazado. */
async function enEspera(s: Siembra): Promise<void> {
  const { id: h } = await registrarHallazgo(
    s.s.liderCex,
    identificacion(s, "enEspera", {
      clase: "no_conformidad",
      origen: "pqrsf",
      fuente: "Buzón de PQRSF de consulta externa",
      referenciaCaso: "PQRSF-2026-118",
      detectado: 81,
      procesoId: s.proceso.CEX,
      subprocesoId: s.subproceso("CEX", "medicina-general"),
      criticidad: "media",
      descripcion:
        "En las quejas del mes, varios usuarios dicen que no consiguen cita de medicina general, mientras en la agenda quedan cupos sin usar de personas que no asistieron ni cancelaron.",
      requisitoClausula: "ISO 9001:2015, 8.2.1 y 9.1.2",
    }),
    en(s, hace(s, 80)),
  );
  s.ids.enEspera = h;
  await corregir(s, h, s.s.liderCex, {
    descripcion: "Se llamó a los usuarios de las quejas y se les asignó cita de medicina general en la misma semana.",
    responsable: s.s.consulta,
    dias: 79,
  });
  await decidirAccionCorrectiva(
    s.s.coordinadora,
    { hallazgoId: h, requiere: true, justificacion: "Las quejas por cupos perdidos se repiten cada mes: hay que atacar la causa." },
    en(s, hace(s, 78)),
  );
  const [[confirmar, publicar]] = await formular(
    s,
    h,
    s.s.liderCex,
    {
      analisis: [
        {
          metodo: "cinco_porques",
          equipo: "Líder de Consulta Externa y auxiliares de admisiones",
          contenido: {
            niveles: [
              { respuesta: "Quedan cupos de medicina general sin usar en la agenda.", evidencia: "Reporte de citas incumplidas" },
              { respuesta: "Los usuarios que no van a la cita no la cancelan." },
              { respuesta: "Nadie les recuerda la cita ni les pide confirmarla." },
            ],
          },
        },
      ],
      causas: ["Las citas no se confirman antes de la fecha y los cupos incumplidos no se liberan"],
      preguntas: { similares: null, cambios: null },
      acciones: [
        {
          tipo: "correctiva",
          descripcion: "Confirmar las citas un día antes y liberar los cupos que no se confirmen",
          causas: [1],
          indicadorCumplimiento: "Citas confirmadas el día anterior",
          meta: "Nueve de cada diez citas confirmadas",
          actividades: [
            { descripcion: "Llamar o escribir a cada usuario el día anterior a su cita", responsable: s.s.consulta, inicio: 72, fin: 35 },
            { descripcion: "Publicar cada mañana los cupos liberados en la agenda", responsable: s.s.liderCex, inicio: 72, fin: 25 },
          ],
        },
      ],
      criterios: ["mejora_indicador"],
      indicador: CEX_SEGUIMIENTO,
    },
    hace(s, 75),
  );
  await enviarPlan(s.s.liderCex, { hallazgoId: h, credenciales: FIRMA }, en(s, hace(s, 73)));
  await firmarRevision(s.s.coordinadora, { hallazgoId: h, requiereRecursos: false, credenciales: FIRMA }, en(s, hace(s, 72)));
  await seguir(s, confirmar, s.s.consulta, { dias: 50, realizado: "Se confirmaron por teléfono las citas de las dos primeras semanas.", avance: 60 });
  await terminar(s, confirmar, s.s.consulta, {
    dias: 30,
    realizado: "Las citas se confirman todos los días; los cupos no confirmados se pasan a la lista de espera.",
    evidencia: "Registro de confirmación de citas",
  });
  await terminar(s, publicar, s.s.liderCex, {
    dias: 22,
    realizado: "Cada mañana se publican en la agenda los cupos liberados del día.",
    evidencia: "Agenda con los cupos liberados",
  });
  await verificar(s, h, [confirmar, publicar], { dias: 18, nota: "Se revisaron los registros de confirmación y la agenda de tres días." });
}

/** «Por evaluar la eficacia»: una observación de Atención Inmediata con `AIN-IND-01` enlazado y la fecha de evaluación ya cumplida. */
async function porEvaluar(s: Siembra): Promise<void> {
  const { id: h } = await registrarHallazgo(
    s.s.coordinadora,
    identificacion(s, "porEvaluar", {
      clase: "observacion",
      origen: "indicador",
      fuente: "Seguimiento mensual del indicador AIN-IND-01",
      detectado: 76,
      procesoId: s.proceso.AIN,
      subprocesoId: s.subproceso("AIN", "urgencias"),
      indicadorId: s.indicador(AIN_TRIAGE),
      descripcion:
        "En el seguimiento mensual del indicador, el tiempo de espera de los pacientes clasificados en triage II pasó la meta de treinta minutos, sobre todo en el turno de la noche.",
    }),
    en(s, hace(s, 75)),
  );
  s.ids.porEvaluar = h;
  const [[clasificacion]] = await formular(
    s,
    h,
    s.s.coordinadora,
    {
      acciones: [
        {
          tipo: "preventiva",
          descripcion: "Reorganizar la clasificación de triage en el turno de la noche",
          causas: [],
          actividades: [
            { descripcion: "Asignar una enfermera de clasificación exclusiva para el turno de la noche", responsable: s.s.jefeUrgencias, inicio: 70, fin: 40 },
          ],
        },
      ],
      criterios: ["mejora_indicador"],
      indicador: AIN_TRIAGE,
      evaluacion: 2,
    },
    hace(s, 73),
  );
  await enviarPlan(s.s.coordinadora, { hallazgoId: h, credenciales: FIRMA }, en(s, hace(s, 72)));
  await aprobarPlan(s.s.gerente, { hallazgoId: h, credenciales: FIRMA }, en(s, hace(s, 71)));
  await seguir(s, clasificacion, s.s.jefeUrgencias, {
    dias: 55,
    realizado: "Se ajustó el cuadro de turnos: la clasificación de la noche quedó a cargo de una enfermera exclusiva.",
    avance: 50,
  });
  await terminar(s, clasificacion, s.s.jefeUrgencias, {
    dias: 41,
    realizado: "Se cumplió un mes completo con la enfermera de clasificación exclusiva en la noche.",
    evidencia: "Cuadro de turnos de urgencias",
  });
  await verificar(s, h, [clasificacion], { dias: 36, nota: "Se revisó el cuadro de turnos y se observó la clasificación en una noche." });
}

/**
 * «En ejecución», el caso de las maquetas: Apoyo Terapéutico, criticidad alta y reincidente del cerrado de la misma nevera, con
 * el plan aprobado por Gerencia. Tres actividades: la de la coordinadora, terminada; la de `consulta`, abierta; y la de
 * `jefe.urgencias`, vencida y con un ajuste de fecha por decidir.
 */
async function enEjecucion(s: Siembra): Promise<void> {
  if (!s.ids.eficaz) throw new Error("El reincidente de la demo necesita antes el cerrado del que es reincidencia");
  const { id: h } = await registrarHallazgo(
    s.s.control,
    identificacion(s, "enEjecucion", {
      clase: "no_conformidad",
      origen: "auditoria_interna",
      fuente: "Auditoría interna de cadena de frío",
      detectado: 31,
      procesoId: s.proceso.ATE,
      subprocesoId: s.subproceso("ATE", "farmacia"),
      criticidad: "alta",
      descripcion: "En la planilla de la nevera de vacunas de farmacia faltan los registros de temperatura de dos turnos de noche seguidos.",
      requisitoClausula: "ISO 9001:2015, 8.5.1",
      requisitoNormaId: s.norma3100,
      riesgo: "R-07 Pérdida de biológicos",
      reincidenteDe: s.ids.eficaz,
    }),
    en(s, hace(s, 30)),
  );
  s.ids.enEjecucion = h;
  await corregir(s, h, s.s.coordinadora, {
    descripcion: "Se revisó la cadena de frío con el termómetro de máximas y mínimas y se pasaron los biológicos a la nevera de respaldo mientras se verificaba la temperatura.",
    responsable: s.s.regente,
    dias: 29,
  });
  const [[cambio], [termometro]] = await formular(
    s,
    h,
    s.s.coordinadora,
    {
      analisis: [
        {
          metodo: "cinco_porques",
          equipo: "Regente de farmacia, auxiliar del turno de noche y Coordinación del SGC",
          contenido: {
            niveles: [
              { respuesta: "Nadie registró la temperatura en los turnos de noche.", evidencia: "Planilla de temperatura del mes" },
              { respuesta: "El auxiliar de noche no tiene asignada esa tarea.", evidencia: "Cuadro de turnos" },
              { respuesta: "El procedimiento no dice quién registra en el turno de noche." },
              { respuesta: "Se escribió cuando la farmacia no abría de noche y no se revisó al ampliar el horario." },
            ],
          },
        },
      ],
      causas: ["El procedimiento de cadena de frío no asigna el registro de temperatura al turno de noche"],
      preguntas: {
        similares: "Laboratorio también tiene una nevera con turno de noche",
        cambios: "Actualizar el procedimiento de cadena de frío para incluir el turno de noche",
      },
      acciones: [
        {
          tipo: "correctiva",
          descripcion: "Actualizar el procedimiento de cadena de frío para incluir el turno de noche",
          causas: [1],
          indicadorCumplimiento: "Procedimiento publicado y socializado",
          meta: "Todos los auxiliares de farmacia socializados",
          actividades: [
            { descripcion: "Pedir el cambio documental del procedimiento de cadena de frío", responsable: s.s.coordinadora, inicio: 21, fin: 10 },
            { descripcion: "Socializar la versión nueva con los auxiliares de farmacia", responsable: s.s.consulta, inicio: 10, fin: -20 },
          ],
        },
        {
          tipo: "correctiva",
          descripcion: "Instalar un termómetro con registro automático en la nevera de vacunas",
          causas: [1],
          recursos: "Un termómetro con registrador de datos, con cargo al presupuesto de la vigencia",
          meta: "Registro continuo las veinticuatro horas",
          actividades: [{ descripcion: "Comprar e instalar el termómetro con registro automático", responsable: s.s.jefeUrgencias, inicio: 21, fin: 6 }],
        },
      ],
      criterios: ["no_recurrencia"],
    },
    hace(s, 26),
  );
  await enviarPlan(s.s.coordinadora, { hallazgoId: h, credenciales: FIRMA }, en(s, hace(s, 23)));
  await aprobarPlan(s.s.gerente, { hallazgoId: h, credenciales: FIRMA }, en(s, hace(s, 21)));
  await seguir(s, termometro, s.s.jefeUrgencias, { dias: 18, realizado: "Se definieron las especificaciones del termómetro con el regente de farmacia.", avance: 10 });
  await terminar(s, cambio, s.s.coordinadora, {
    dias: 14,
    realizado: "Se radicó la solicitud de cambio del procedimiento de cadena de frío y se envió el borrador al regente.",
    evidencia: "Solicitud de cambio del procedimiento de cadena de frío",
  });
  await seguir(s, termometro, s.s.jefeUrgencias, {
    dias: 9,
    realizado: "Se pidieron tres cotizaciones; el proveedor elegido no tiene existencias por ahora.",
    avance: 30,
    barreras: "El proveedor no tiene existencias del equipo",
  });
  await pedirAjuste(
    s.s.jefeUrgencias,
    {
      hallazgoId: h,
      tipo: "reprogramar",
      actividadId: termometro,
      finNuevo: dia(s, -20),
      causa: "El proveedor elegido no tiene existencias del termómetro hasta dentro de dos semanas.",
    },
    en(s, hace(s, 1)),
  );
}

/** «Cerrado con corrección»: una no conformidad menor de Consulta Externa que no requirió acción correctiva. */
async function conCorreccion(s: Siembra): Promise<void> {
  const { id: h } = await registrarHallazgo(
    s.s.coordinadora,
    identificacion(s, "conCorreccion", {
      clase: "no_conformidad",
      origen: "control_documental",
      fuente: "Revisión de documentos en el punto de uso Odontología",
      detectado: 26,
      procesoId: s.proceso.CEX,
      subprocesoId: s.subproceso("CEX", "odontologia"),
      criticidad: "baja",
      descripcion: "En la revisión del punto de uso de odontología se encontró en uso una copia en papel del consentimiento informado en una versión ya obsoleta.",
      requisitoClausula: "ISO 9001:2015, 7.5.3",
    }),
    en(s, hace(s, 25)),
  );
  s.ids.conCorreccion = h;
  await aceptarHallazgo(s.s.liderCex, { hallazgoId: h }, en(s, hace(s, 24)));
  await corregir(s, h, s.s.liderCex, {
    descripcion: "Se retiró la copia obsoleta, se dejó la versión vigente y se revisaron los demás formatos del consultorio.",
    responsable: s.s.liderCex,
    dias: 23,
  });
  await decidirAccionCorrectiva(
    s.s.coordinadora,
    { hallazgoId: h, requiere: false, justificacion: "Fue una copia aislada que ya se retiró, y no hay otras copias sin control en el consultorio." },
    en(s, hace(s, 22)),
  );
  await validarCorreccion(s.s.control, { hallazgoId: h }, en(s, hace(s, 21)));
}

/** «Cerrado sin acción»: una no conformidad menor de Talento Humano sin corrección ni acción, validada por Control Interno. */
async function sinAccion(s: Siembra): Promise<void> {
  const { id: h } = await registrarHallazgo(
    s.s.control,
    identificacion(s, "sinAccion", {
      clase: "no_conformidad",
      origen: "control_interno",
      fuente: "Seguimiento de Control Interno al proceso de ingreso",
      detectado: 21,
      procesoId: s.proceso.GTH,
      subprocesoId: s.subproceso("GTH", "ingreso"),
      criticidad: "baja",
      descripcion: "En el seguimiento de Control Interno al proceso de ingreso, el registro de asistencia de la última inducción tiene un participante sin firma.",
      requisitoClausula: "ISO 9001:2015, 7.5.3",
    }),
    en(s, hace(s, 20)),
  );
  s.ids.sinAccion = h;
  await aceptarHallazgo(s.s.liderGth, { hallazgoId: h }, en(s, hace(s, 19)));
  await registrarCorreccion(
    s.s.liderGth,
    {
      hallazgoId: h,
      requerida: false,
      descripcion: "El participante firmó la asistencia de la jornada siguiente de la misma inducción: no hay nada que corregir de inmediato.",
    },
    en(s, hace(s, 18)),
  );
  await decidirAccionCorrectiva(
    s.s.coordinadora,
    { hallazgoId: h, requiere: false, justificacion: "Es un caso aislado: el registro de las demás inducciones del año está completo." },
    en(s, hace(s, 17)),
  );
  await validarCorreccion(s.s.control, { hallazgoId: h }, en(s, hace(s, 15)));
}

/** «Cargado» (spec §15): un hallazgo de Atención Inmediata tramitado en papel, con su plan aprobado por Gerencia y su escaneo. */
async function cargado(s: Siembra): Promise<void> {
  const momento = hace(s, 12);
  const { id: h } = await cargarHallazgo(
    s.s.coordinadora,
    {
      ...identificacion(s, "cargado", {
        clase: "no_conformidad",
        origen: "pamec",
        fuente: "Auditoría PAMEC del segundo semestre",
        detectado: 160,
        procesoId: s.proceso.AIN,
        subprocesoId: s.subproceso("AIN", "urgencias"),
        criticidad: "media",
        descripcion: "En la auditoría del PAMEC se encontró la lista de chequeo del carro de paro de urgencias sin diligenciar varios días de la semana.",
        requisitoClausula: "Resolución 3100 de 2019, estándar de dotación",
      }),
      registradoEnPapel: dia(s, 158),
      correccion: { requerida: true, descripcion: "Se revisó el carro de paro completo y se repusieron los medicamentos vencidos.", implementadaEn: dia(s, 155) },
      analisis: {
        metodo: "cinco_porques",
        causas: ["La lista de chequeo del carro de paro no tiene un responsable por turno"],
        contenido: {
          niveles: [
            { respuesta: "La lista de chequeo no se diligenció varios días." },
            { respuesta: "Cada turno suponía que la diligenciaba el turno anterior." },
            { respuesta: "La lista no dice quién la diligencia en cada turno." },
          ],
        },
      },
      acciones: [
        {
          tipo: "correctiva",
          descripcion: "Asignar la revisión diaria del carro de paro a la enfermera de cada turno",
          causas: [1],
          indicadorCumplimiento: "Listas de chequeo diligenciadas",
          meta: "Todos los días del mes",
          actividades: [
            { descripcion: "Actualizar la lista de chequeo con un responsable por turno", responsableId: s.s.jefeUrgencias.usuarioId, inicio: dia(s, 140), fin: dia(s, 110), avance: 100, terminadaEn: dia(s, 112) },
            { descripcion: "Verificar cada semana la lista de chequeo diligenciada", responsableId: s.s.consulta.usuarioId, inicio: dia(s, 108), fin: dia(s, -30), avance: 50 },
          ],
        },
      ],
      criterios: ["no_recurrencia"],
      aprobacion: { nombre: "Gerente de ejemplo", cargo: "Gerente", fecha: dia(s, 145), rol: "gerencia" },
    },
    en(s, momento),
  );
  s.ids.cargado = h;
  await subir(s, {
    contexto: "mejora_hallazgo",
    id: h,
    rol: "carga",
    nombre: "Formato del hallazgo firmado en papel",
    quien: s.s.coordinadora,
    ahora: antesDeLaSiembra(s, minutosDespues(momento, 10)),
  });
}

/** «En revisión»: el reporte de `consulta` que la coordinadora convierte; el líder lo analiza con 5 porqués e Ishikawa. */
async function enRevision(s: Siembra): Promise<void> {
  const { id: reporteId } = await enviarReporte(
    s.s.consulta,
    { descripcion: REPORTES_DE_LA_DEMO.convertido, vistoEn: dia(s, 13), procesoId: s.proceso.CEX, referenciaCaso: "EA-2026-031" },
    en(s, hace(s, 12, 60)),
  );
  const { id: h } = await registrarHallazgo(
    s.s.coordinadora,
    identificacion(s, "enRevision", {
      clase: "no_conformidad",
      origen: "evento_adverso",
      fuente: "Reporte de un funcionario",
      referenciaCaso: "EA-2026-031",
      detectado: 13,
      procesoId: s.proceso.CEX,
      subprocesoId: s.subproceso("CEX", "medicina-general"),
      criticidad: "media",
      descripcion: "Dos muestras de sangre de consulta externa llegaron al laboratorio sin la hora de toma en el rótulo, y hubo que repetir la toma.",
      requisitoClausula: "ISO 9001:2015, 8.5.2",
      reporteId,
    }),
    en(s, hace(s, 11)),
  );
  s.ids.enRevision = h;
  await aceptarHallazgo(s.s.liderCex, { hallazgoId: h }, en(s, hace(s, 10)));
  await corregir(s, h, s.s.liderCex, {
    descripcion: "Se revisaron los rótulos de las muestras del día y se recordó al personal de toma de muestras que la hora es obligatoria.",
    responsable: s.s.liderCex,
    dias: 9,
  });
  await decidirAccionCorrectiva(
    s.s.coordinadora,
    { hallazgoId: h, requiere: true, justificacion: "Un rótulo incompleto puede llevar a un error en el resultado: hay que buscar la causa." },
    en(s, hace(s, 8)),
  );
  await formular(
    s,
    h,
    s.s.liderCex,
    {
      analisis: [
        {
          metodo: "cinco_porques",
          equipo: "Líder de Consulta Externa, bacterióloga y auxiliares de toma de muestras",
          contenido: {
            niveles: [
              { respuesta: "El rótulo salió sin la hora de toma." },
              { respuesta: "El rótulo impreso no tiene un espacio para la hora.", evidencia: "Rótulo en uso" },
              { respuesta: "El formato del rótulo se diseñó antes de exigir la hora de toma." },
            ],
          },
        },
        {
          metodo: "ishikawa",
          equipo: "Líder de Consulta Externa y laboratorio",
          contenido: {
            causas: [
              { categoria: "metodo", texto: "El rótulo no tiene un campo para la hora de toma", confirmada: true, impacto: "alto", requiereAccion: true },
              { categoria: "mano_de_obra", texto: "Personal nuevo sin inducción en el rotulado de muestras", confirmada: true, impacto: "medio", requiereAccion: true },
              { categoria: "material", texto: "Etiquetas que se borran con el alcohol", confirmada: false },
              { categoria: "medio_ambiente", texto: "Sala de toma de muestras congestionada en la mañana", confirmada: false },
            ],
          },
        },
      ],
      causas: [
        "El formato del rótulo no tiene un campo obligatorio para la hora de toma",
        "El personal nuevo de toma de muestras no recibe inducción sobre el rotulado",
      ],
      preguntas: {
        similares: "Urgencias usa el mismo rótulo para sus muestras",
        cambios: "Actualizar el instructivo de toma y rotulado de muestras",
      },
      acciones: [
        {
          tipo: "correctiva",
          descripcion: "Cambiar el rótulo de las muestras para que la hora de toma sea un campo obligatorio",
          causas: [1],
          indicadorCumplimiento: "Rótulo nuevo en uso",
          meta: "Todas las muestras con la hora de toma",
          actividades: [{ descripcion: "Diseñar el rótulo nuevo con el laboratorio", responsable: s.s.consulta, inicio: -1, fin: -15 }],
        },
        {
          tipo: "correctiva",
          descripcion: "Incluir el rotulado de muestras en la inducción del personal de toma de muestras",
          causas: [2],
          actividades: [{ descripcion: "Actualizar la inducción y capacitar al personal de toma de muestras", responsable: s.s.liderCex, inicio: -1, fin: -30 }],
        },
      ],
      criterios: ["no_recurrencia", "reduccion_pqrs"],
    },
    hace(s, 3),
  );
  await enviarPlan(s.s.liderCex, { hallazgoId: h, credenciales: FIRMA }, en(s, hace(s, 1, 30)));
}

/**
 * «Por formular», a punto de vencer: Consulta Externa, registrado por su líder ocho días hábiles atrás contando hoy si es hábil
 * (un día no hábil no cuenta: nueve hacia atrás), así le quedan dos de los diez del plazo de formular caiga donde caiga un
 * festivo. Sin arbitraje, reclasificación ni «no» cambiado por «sí», que contarían el plazo otra vez.
 */
function diaDelPorFormular(s: Siembra): string {
  const hoy = fechaEnZona(s.ahora, s.zona);
  return restarDiasHabiles(hoy, esHabil(hoy, s.calendario) ? 8 : 9, s.calendario);
}

async function porFormular(s: Siembra): Promise<void> {
  const registro = diaDelPorFormular(s);
  const { id: h } = await registrarHallazgo(
    s.s.liderCex,
    {
      clase: "no_conformidad",
      origen: "indicador",
      fuente: "Seguimiento mensual del indicador CEX-ID-003",
      detectadoEn: registro,
      procesoId: s.proceso.CEX,
      subprocesoId: s.subproceso("CEX", "medicina-general"),
      criticidad: "media",
      titulo: HALLAZGOS_DE_LA_DEMO.porFormular.titulo,
      descripcion:
        "En el seguimiento mensual del indicador de adherencia a la guía de hipertensión, una de las sedes quedó en Crítico aunque el total de consulta externa está en Bien.",
      requisitoClausula: "Guía de práctica clínica de hipertensión arterial adoptada por la institución",
      indicadorId: s.indicador(CEX_HIPERTENSION),
    },
    en(s, enElDia(s, registro)),
  );
  s.ids.porFormular = h;
  await subir(s, { contexto: "mejora_hallazgo", id: h, rol: "correccion", nombre: "Evidencia de la corrección", quien: s.s.liderCex });
  await registrarCorreccion(
    s.s.liderCex,
    {
      hallazgoId: h,
      requerida: true,
      descripcion: "Se revisaron con el médico de la sede las historias auditadas y se programó el control de quienes no tenían el manejo de la guía.",
      responsableId: s.s.liderCex.usuarioId,
      implementadaEn: registro,
    },
    en(s, enElDia(s, registro, 60)),
  );
  await decidirAccionCorrectiva(
    s.s.coordinadora,
    { hallazgoId: h, requiere: true, justificacion: "La diferencia con las otras sedes pide buscar la causa antes de cerrarlo." },
    en(s, enElDia(s, registro, 24 * 60)),
  );
}

/** «En aprobación»: de origen «Ente de control», con su fecha del ente; sin líder en el proceso, lo aprueba Gerencia. */
async function enAprobacion(s: Siembra): Promise<void> {
  const { id: h } = await registrarHallazgo(
    s.s.coordinadora,
    identificacion(s, "enAprobacion", {
      clase: "no_conformidad",
      origen: "ente_control",
      fuente: "Visita de inspección de la Secretaría de Salud Departamental",
      detectado: 10,
      procesoId: s.proceso.GBS,
      subprocesoId: s.subproceso("GBS", "mantenimiento"),
      criticidad: "alta",
      descripcion:
        "En la visita de inspección, la Secretaría de Salud encontró que las hojas de vida de los equipos biomédicos no registran el mantenimiento preventivo del último año (hallazgo 3 del acta de visita).",
      requisitoClausula: "Resolución 3100 de 2019, estándar de dotación",
      fechaLimiteEnte: dia(s, -16),
    }),
    en(s, hace(s, 9)),
  );
  s.ids.enAprobacion = h;
  await corregir(s, h, s.s.coordinadora, {
    descripcion: "Se reunieron los soportes de mantenimiento que tenía el proveedor y se pasaron a las hojas de vida de los equipos.",
    responsable: s.s.coordinadora,
    dias: 8,
  });
  await formular(
    s,
    h,
    s.s.coordinadora,
    {
      analisis: [
        {
          metodo: "cinco_porques",
          equipo: "Coordinación del SGC y técnico de mantenimiento",
          contenido: {
            niveles: [
              { respuesta: "Las hojas de vida no tienen el mantenimiento registrado." },
              { respuesta: "Los soportes del proveedor se archivan en compras y no en mantenimiento." },
              { respuesta: "El procedimiento no dice quién pasa los soportes a la hoja de vida." },
            ],
          },
        },
      ],
      causas: ["El procedimiento de mantenimiento no asigna quién registra cada mantenimiento en la hoja de vida del equipo"],
      preguntas: { similares: null, cambios: "Actualizar el procedimiento de mantenimiento preventivo" },
      acciones: [
        {
          tipo: "correctiva",
          descripcion: "Registrar cada mantenimiento en la hoja de vida del equipo",
          causas: [1],
          indicadorCumplimiento: "Hojas de vida al día",
          meta: "Todos los equipos biomédicos",
          actividades: [
            { descripcion: "Actualizar el procedimiento de mantenimiento preventivo con el registro en la hoja de vida", responsable: s.s.coordinadora, inicio: 2, fin: -12 },
            { descripcion: "Pasar a las hojas de vida los soportes de mantenimiento del último año", responsable: s.s.regente, inicio: 2, fin: -10 },
          ],
        },
      ],
      criterios: ["no_recurrencia"],
    },
    hace(s, 5),
  );
  await enviarPlan(s.s.coordinadora, { hallazgoId: h, credenciales: FIRMA }, en(s, hace(s, 1, 60)));
}

/** «Rechazado»: el líder de Consulta Externa lo rechaza y la coordinadora, que lo registró, lo retira. */
async function rechazado(s: Siembra): Promise<void> {
  const { id: h } = await registrarHallazgo(
    s.s.coordinadora,
    identificacion(s, "rechazado", {
      clase: "no_conformidad",
      origen: "otro",
      fuente: "Revisión de historias clínicas de odontología",
      detectado: 8,
      procesoId: s.proceso.CEX,
      subprocesoId: s.subproceso("CEX", "odontologia"),
      criticidad: "media",
      descripcion: "En la revisión de historias clínicas de odontología, el consentimiento informado impreso no tiene la firma del profesional.",
      requisitoClausula: "ISO 9001:2015, 8.5.1",
    }),
    en(s, hace(s, 7)),
  );
  s.ids.rechazado = h;
  await rechazarHallazgo(
    s.s.liderCex,
    {
      hallazgoId: h,
      justificacion: "El profesional firma el consentimiento en la historia clínica electrónica; la copia impresa que se revisó no lleva firma por diseño.",
    },
    en(s, hace(s, 6)),
  );
  await retirarHallazgo(s.s.coordinadora, { hallazgoId: h }, en(s, hace(s, 5)));
}

/** «En arbitraje»: `lider.gth` lo rechaza y Control Interno, que lo registró, lo sostiene: lo arbitra el Admin SGC. */
async function enArbitraje(s: Siembra): Promise<void> {
  const { id: h } = await registrarHallazgo(
    s.s.control,
    identificacion(s, "enArbitraje", {
      clase: "no_conformidad",
      origen: "control_interno",
      fuente: "Seguimiento de Control Interno a las vinculaciones del semestre",
      detectado: 7,
      procesoId: s.proceso.GTH,
      subprocesoId: s.subproceso("GTH", "ingreso"),
      criticidad: "media",
      descripcion:
        "En el seguimiento a las vinculaciones del semestre, tres hojas de vida del personal asistencial no tienen la verificación de los títulos ante la entidad que los expidió.",
      requisitoClausula: "Resolución 3100 de 2019, estándar de talento humano",
    }),
    en(s, hace(s, 6)),
  );
  s.ids.enArbitraje = h;
  await rechazarHallazgo(
    s.s.liderGth,
    { hallazgoId: h, justificacion: "La verificación de los títulos la hace la Subgerencia Científica antes de remitir la hoja de vida a Talento Humano." },
    en(s, hace(s, 5)),
  );
  await sostenerHallazgo(
    s.s.control,
    { hallazgoId: h, replica: "El procedimiento de ingreso asigna a Talento Humano la verificación de los títulos antes de la vinculación." },
    en(s, hace(s, 1, 90)),
  );
}

/** «Por aceptar»: una no conformidad de auditoría interna en Talento Humano, registrada ayer por Control Interno. */
async function porAceptar(s: Siembra): Promise<void> {
  const { id: h } = await registrarHallazgo(
    s.s.control,
    identificacion(s, "porAceptar", {
      clase: "no_conformidad",
      origen: "auditoria_interna",
      fuente: "Auditoría interna al proceso de talento humano",
      detectado: 2,
      procesoId: s.proceso.GTH,
      subprocesoId: s.subproceso("GTH", "desarrollo"),
      criticidad: "media",
      descripcion:
        "En la auditoría interna, las capacitaciones del semestre tienen registro de asistencia pero ninguna tiene la evaluación de su eficacia que pide el procedimiento.",
      requisitoClausula: "ISO 9001:2015, 7.2 d)",
    }),
    en(s, hace(s, 1, 120)),
  );
  s.ids.porAceptar = h;
}

/** El reporte que sigue por clasificar: de `consulta`, ayer. */
async function reportePorClasificar(s: Siembra): Promise<void> {
  await enviarReporte(
    s.s.consulta,
    { descripcion: REPORTES_DE_LA_DEMO.porClasificar, vistoEn: dia(s, 2), procesoId: s.proceso.AIN },
    en(s, hace(s, 1, 150)),
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/** El día no hábil de ejemplo: el primer día hábil desde tres semanas después de la siembra. */
function diaDeEjemplo(s: Siembra): string {
  let d = dia(s, -21);
  while (!esHabil(d, s.calendario)) d = fechaEnZona(new Date(finDeFecha(d, s.zona).getTime() + 1), s.zona);
  return d;
}

async function prepararSiembra(sql: Sql, c: ContextoDistribucion): Promise<Siembra> {
  const s = {} as Record<Quien, SesionFlujo>;
  for (const [quien, usuario] of Object.entries(USUARIO) as [Quien, string][]) s[quien] = await sesionDe(sql, usuario);
  const subprocesos = new Map(
    (await sql`SELECT s.id, p.sigla, s.slug FROM subprocesos s JOIN procesos p ON p.id = s.proceso_id`).map((f) => [`${f.sigla}/${f.slug}`, Number(f.id)]),
  );
  const indicadores = new Map((await sql`SELECT id, codigo FROM indicadores`).map((f) => [f.codigo as string, Number(f.id)]));
  const [norma] = await sql`SELECT n.id FROM normas n JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
    WHERE tn.nombre = 'Resolución' AND n.numero = '3100' AND n.anio = 2019`;
  if (!norma) throw new Error("La demo de mejoramiento necesita la Resolución 3100 de 2019 del normograma");
  const [{ valor: entidad }] = await sql`SELECT valor FROM configuracion WHERE clave = 'nombre_entidad'`;
  return {
    sql,
    ahora: c.ahora,
    zona: zonaHoraria(),
    calendario: await calendarioDeMejora(sql),
    entidad,
    s,
    proceso: c.procesoPorSigla,
    subproceso: (sigla, slug) => {
      const id = subprocesos.get(`${sigla}/${slug}`);
      if (!id) throw new Error(`Subproceso demo no encontrado: ${sigla}/${slug}`);
      return id;
    },
    indicador: (codigo) => {
      const id = indicadores.get(codigo);
      if (!id) throw new Error(`La demo de mejoramiento necesita el indicador ${codigo}`);
      return id;
    },
    norma3100: Number(norma.id),
    ids: {},
  };
}

export async function sembrarMejoramiento(sql: Sql, c: ContextoDistribucion): Promise<void> {
  console.log("Sembrando planes de mejoramiento: hallazgos, reportes y el calendario de la entidad…");
  const s = await prepararSiembra(sql, c);
  // Antes que todo: los plazos de la demo se cuentan con el calendario que ya lo tiene.
  await agregarDiaDeCalendario(s.s.coordinadora, { fecha: diaDeEjemplo(s), tipo: "no_habil", motivo: DIA_NO_HABIL_DE_EJEMPLO }, { sql });
  s.calendario = await calendarioDeMejora(sql);

  // En el orden de su registro: así los códigos salen en el orden de sus fechas.
  const hallazgos: Array<{ registro: Date; sembrar: (s: Siembra) => Promise<void> }> = [
    { registro: hace(s, 210), sembrar: eficaz },
    { registro: hace(s, 100), sembrar: reabierto },
    { registro: hace(s, 80), sembrar: enEspera },
    { registro: hace(s, 75), sembrar: porEvaluar },
    { registro: hace(s, 30), sembrar: enEjecucion },
    { registro: hace(s, 25), sembrar: conCorreccion },
    { registro: hace(s, 20), sembrar: sinAccion },
    { registro: hace(s, 12), sembrar: cargado },
    { registro: hace(s, 11), sembrar: enRevision },
    { registro: enElDia(s, diaDelPorFormular(s)), sembrar: porFormular },
    { registro: hace(s, 9), sembrar: enAprobacion },
    { registro: hace(s, 7), sembrar: rechazado },
    { registro: hace(s, 6), sembrar: enArbitraje },
    { registro: hace(s, 1, 120), sembrar: porAceptar },
    { registro: hace(s, 1, 150), sembrar: reportePorClasificar },
  ];
  hallazgos.sort((a, b) => a.registro.getTime() - b.registro.getTime());
  for (const { sembrar } of hallazgos) await sembrar(s);

  // A la hora de la siembra: lo que ya venció avisa ahora, y otra pasada a esa hora no tiene nada nuevo que avisar.
  await revisarVencimientosDeMejoramiento({ sql, ahora: c.ahora, config: await obtenerConfigDocumental({ sql }) });
}
