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
 *
 * Desde la 15B (anexo 15B, §15.1), seis hallazgos más y tres planes (`PLANES_DE_LA_DEMO`, creados en el orden de sus códigos): el
 * de la auditoría interna, con hallazgos y su objetivo; el de la visita del ente, con hallazgos de varios procesos (uno cerrado,
 * uno de otro origen, uno sin plan de acción aprobado y dos externos: uno respondido desde el plan, con su oficio, y otro listo); y
 * uno sin hallazgos. Las marcas salen de un indicador nuevo de Consulta Externa (`INDICADOR_DE_LAS_MARCAS`: el pendiente con su
 * análisis y un hallazgo sugerido, y el que espera el análisis), del Crítico de `SGC-IND-01` («no requiere») y del de `SGC-ID-002`
 * (lo resuelve la no conformidad del hallazgo de verificación de Urgencias, que nace a la hora de la siembra). Además, otro hallazgo
 * de verificación en Urgencias reabierto (la sugerencia), dos impactos de la Ley 1438 sobre la Ley 100 vencidos y escalados (solo
 * la pasada de impactos de la 13C), una actividad con dos trámites (uno publicado y otro en revisión), un «Por cerrar» cuyo
 * análisis marcó «documentos» y objetivos en dos hallazgos sin plan. Lo que cruza hallazgos ya sembrados va después de ellos, cada
 * paso con su hora en el pasado: las funciones del dominio leen la base como está, no como estaba a la hora del paso.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Sql } from "postgres";
import { resolverRutaAlmacen } from "../../lib/almacen";
import { esHabil, restarDiasHabiles, type AjustesDeCalendario } from "../../lib/dias-habiles";
import { TERMINALES, type CriterioEficacia, type MetodoAnalisis, type TipoAccion } from "../../lib/mejoramiento/tipos";
import { sanearNombre } from "../../lib/subida";
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
import { quienTieneElTurno } from "../consultas/mejoramiento/avisos";
import { agregarDiaDeCalendario, calendarioDeMejora } from "../consultas/mejoramiento/config";
import { fechaMinimaDe } from "../consultas/mejoramiento/espera";
import { hallazgoBase } from "../consultas/mejoramiento/flujo";
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
import { ITEMS_FIJOS } from "../../lib/distribucion/verificacion";
import { periodoDe } from "../../lib/indicadores-documentales/periodo";
import { anterior, periodoQueContiene } from "../../lib/indicadores/periodos";
import { corregirHallazgo, reabrirHallazgo } from "../consultas/distribucion/hallazgos";
import { abrirVerificacion, cerrarVerificacion, guardarAvance } from "../consultas/distribucion/verificaciones";
import { analizar } from "../consultas/indicadores/analisis";
import { aprobarFichas, enviarAAprobacion } from "../consultas/indicadores/aprobacion";
import { crearIndicador } from "../consultas/indicadores/fichas";
import { asegurarMediciones, reportar } from "../consultas/indicadores/mediciones";
import { ponerEnPlan, ponerObjetivo } from "../consultas/mejoramiento/clasificacion";
import { resolverNoRequiere } from "../consultas/mejoramiento/marcas";
import { crearPlan } from "../consultas/mejoramiento/planes";
import { registrarRespuestaDelPlan } from "../consultas/mejoramiento/respuesta-plan";
import { enlazarTramite } from "../consultas/mejoramiento/tramites-enlace";
import { registrarRelacion } from "../consultas/normograma/relaciones";
import { impactosVencidos } from "../consultas/normograma/vencidos";
import { minutosDespues, momentoHace, sesionDe, type ContextoDistribucion } from "./distribucion-demo";
import { datosDeFicha, type Catalogo, type FichaDemo } from "./indicadores-demo-fichas";
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
  // Los seis de la 15B (anexo 15B, §15.1).
  porCerrar: { titulo: "Instructivo de higiene de manos de urgencias desactualizado frente al protocolo institucional", etiqueta: "Por cerrar" },
  conTramites: { titulo: "Inducción del personal asistencial sin el módulo de seguridad del paciente", etiqueta: "En ejecución" },
  enteRespondido: { titulo: "Medicamentos de control especial sin el libro de registro al día en farmacia", etiqueta: "En ejecución" },
  enteListo: { titulo: "Planta eléctrica de emergencia sin el registro de sus pruebas semanales", etiqueta: "En ejecución" },
  sugeridoDeLaMarca: { titulo: "Usuarios de medicina general que esperan más de una semana por una cita", etiqueta: "Por aceptar" },
  desdeVerificacion: { titulo: "Copia no controlada de un formato en el servicio de urgencias", etiqueta: "Por formular" },
} as const satisfies Record<string, HallazgoDeLaDemo>;

type Clave = keyof typeof HALLAZGOS_DE_LA_DEMO;

/**
 * Los tres planes de la 15B, por su nombre (anexo 15B, §15.1): el de la visita del ente, con hallazgos de varios procesos; el de la
 * auditoría interna, con hallazgos y su objetivo; y uno sin hallazgos.
 */
export const PLANES_DE_LA_DEMO = {
  interno: "Auditoría interna de calidad",
  ente: "Visita de inspección de la Secretaría de Salud Departamental",
  vacio: "Autoevaluación de estándares de habilitación",
} as const;

/**
 * El indicador de las marcas (anexo 15B, §15.1): mensual, de Consulta Externa, con 45 días de plazo para reportar y analizar (el
 * informe del operador de la agenda llega a mitad del mes siguiente). Su penúltimo mes es el pendiente con su análisis; el último, el
 * que todavía espera el análisis: con ese plazo sigue dentro de él el día que se siembre.
 */
export const INDICADOR_DE_LAS_MARCAS = "Días de espera para una cita de medicina general";

/** Un momento de la siembra: hace `dias` días (`momentoHace`) y `minutos` después. */
type Momento = { dias: number; minutos?: number };

/**
 * Cuándo se registra cada hallazgo de la demo: un solo lugar, que usan su escenario y el orden de la siembra (los códigos salen
 * en el orden de sus fechas). El «Por formular» no está aquí: se registra en días hábiles hacia atrás (`diaDelPorFormular`); ni la
 * no conformidad del hallazgo de verificación, que nace a la hora de la siembra (`desdeLaVerificacion`).
 */
const REGISTRO: Record<Exclude<Clave, "porFormular" | "desdeVerificacion">, Momento> = {
  eficaz: { dias: 210 },
  porCerrar: { dias: 120 },
  reabierto: { dias: 100 },
  enEspera: { dias: 80 },
  porEvaluar: { dias: 75 },
  enEjecucion: { dias: 30 },
  conTramites: { dias: 27 },
  conCorreccion: { dias: 25 },
  sinAccion: { dias: 20 },
  cargado: { dias: 12 },
  enRevision: { dias: 11 },
  enAprobacion: { dias: 9 },
  enteRespondido: { dias: 9, minutos: 30 },
  enteListo: { dias: 9, minutos: 60 },
  rechazado: { dias: 7 },
  enArbitraje: { dias: 6 },
  sugeridoDeLaMarca: { dias: 2 },
  porAceptar: { dias: 1, minutos: 120 },
};

/** Cuándo se crea cada plan: en el orden de sus códigos. El del ente, justo antes de que se registren sus dos externos. */
const CREACION_DE_PLAN: Record<keyof typeof PLANES_DE_LA_DEMO, Momento> = {
  interno: { dias: 33 },
  ente: { dias: 9, minutos: 10 },
  vacio: { dias: 1, minutos: 60 },
};

/** Cuándo se envía el reporte que sigue por clasificar. */
const REPORTE_POR_CLASIFICAR: Momento = { dias: 1, minutos: 150 };

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
  /** Los planes ya creados, por su clave. */
  planes: Partial<Record<keyof typeof PLANES_DE_LA_DEMO, number>>;
  /** Los objetivos del maestro, en el orden de su id: los tres de calidad y los dos institucionales de la 14A. */
  objetivos: number[];
  /** El id del indicador de las marcas, una vez creado (`indicadorDeLasMarcas`). */
  indicadorDeLasMarcas?: number;
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

/** El momento del registro de un hallazgo de la demo (`REGISTRO`, o el día hábil del «Por formular»), o el de un `Momento`. */
function registroDe(s: Siembra, de: Exclude<Clave, "desdeVerificacion"> | Momento): Date {
  if (de === "porFormular") return enElDia(s, diaDelPorFormular(s));
  const m = typeof de === "string" ? REGISTRO[de] : de;
  return hace(s, m.dias, m.minutos ?? 0);
}

/** Las opciones del dominio de un paso: su hora y la firma de la demo. */
const en = (s: Siembra, momento: Date): OpcionesFlujo => ({ sql: s.sql, ahora: momento, verificar: firmaDeLaDemo });

// ─────────────────────────────────────────────────────────────────────────────
// Los pasos comunes
// ─────────────────────────────────────────────────────────────────────────────

const CARPETA = { mejora_hallazgo: "hallazgos", mejora_actividad: "actividades", mejora_plan: "planes" } as const;

/**
 * Un PDF mínimo de la semilla, en el almacén y registrado por `registrarArchivo` como lo haría la subida: la corrección y el
 * formato de la carga van al hallazgo; la evidencia, a su actividad; el oficio de la respuesta al ente, al plan. Con `ahora`, la
 * hora con que el formato de una carga la confirma, o la del evento `archivo` del historial del plan. Devuelve el id del archivo.
 */
async function subir(
  s: Siembra,
  x: { contexto: keyof typeof CARPETA; id: number; rol: "correccion" | "carga" | "evidencia"; nombre: string; quien: SesionFlujo; ahora?: Date },
): Promise<number> {
  const contenido = await generarPlaceholder({ codigo: x.nombre, titulo: "Archivo de la demo de mejoramiento", numeroVersion: 1, ext: "pdf", entidad: s.entidad });
  const archivo = sanearNombre(`${x.nombre}.pdf`);
  const ruta = `mejoramiento/${CARPETA[x.contexto]}/${x.id}/${archivo}`;
  const destino = resolverRutaAlmacen(ruta);
  if (!destino) throw new Error(`Ruta de almacén inválida: ${ruta}`);
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, contenido);
  const { id } = await registrarArchivo(
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
  return Number(id);
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

/** La identificación de un hallazgo de la demo: su título de `HALLAZGOS_DE_LA_DEMO` y la fecha en que se detectó, `detectado` días atrás. */
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
    en(s, registroDe(s, "eficaz")),
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
    en(s, registroDe(s, "reabierto")),
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
    en(s, registroDe(s, "enEspera")),
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

/**
 * «Por evaluar la eficacia»: una observación de Atención Inmediata con `AIN-IND-01` enlazado y la fecha de evaluación ya cumplida.
 * Su actividad termina 64 días antes de la siembra: así el mes siguiente al de R ya terminó y la pantalla de evaluar muestra el
 * indicador antes, durante y después del plan, sea el día que sea.
 */
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
    en(s, registroDe(s, "porEvaluar")),
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
            { descripcion: "Asignar una enfermera de clasificación exclusiva para el turno de la noche", responsable: s.s.jefeUrgencias, inicio: 70, fin: 64 },
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
    dias: 68,
    realizado: "Se ajustó el cuadro de turnos: la clasificación de la noche quedó a cargo de una enfermera exclusiva.",
    avance: 50,
  });
  await terminar(s, clasificacion, s.s.jefeUrgencias, {
    dias: 64,
    realizado: "La enfermera de clasificación exclusiva quedó fija en el cuadro de turnos de la noche.",
    evidencia: "Cuadro de turnos de urgencias",
  });
  await verificar(s, h, [clasificacion], { dias: 60, nota: "Se revisó el cuadro de turnos y se observó la clasificación en una noche." });
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
    en(s, registroDe(s, "enEjecucion")),
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
    en(s, registroDe(s, "conCorreccion")),
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
    en(s, registroDe(s, "sinAccion")),
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
  const momento = registroDe(s, "cargado");
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
    en(s, registroDe(s, "enRevision")),
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
    en(s, registroDe(s, "porFormular")),
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
    en(s, registroDe(s, "enAprobacion")),
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
    en(s, registroDe(s, "rechazado")),
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
    en(s, registroDe(s, "enArbitraje")),
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
    en(s, registroDe(s, "porAceptar")),
  );
  s.ids.porAceptar = h;
}

/** El reporte que sigue por clasificar: de `consulta`, ayer. */
async function reportePorClasificar(s: Siembra): Promise<void> {
  await enviarReporte(
    s.s.consulta,
    { descripcion: REPORTES_DE_LA_DEMO.porClasificar, vistoEn: dia(s, 2), procesoId: s.proceso.AIN },
    en(s, registroDe(s, REPORTE_POR_CLASIFICAR)),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lo de la 15B (anexo 15B, §15.1): los planes, las marcas, los enganches y el cambio documental
// ─────────────────────────────────────────────────────────────────────────────

/** El año de un día `AAAA-MM-DD`: la vigencia de un plan es la de su evento. */
const anioDe = (dia: string) => Number(dia.slice(0, 4));

/** Crea un plan de la demo a su hora (`CREACION_DE_PLAN`), a nombre de quien lo crea, y lo deja en `s.planes`. */
async function nuevoPlan(
  s: Siembra,
  clave: keyof typeof PLANES_DE_LA_DEMO,
  quien: SesionFlujo,
  d: { origen: "auditoria_interna" | "ente_control" | "autoevaluacion"; evento: number; objetivoTexto?: string; objetivoId?: number; fechaLimiteEnte?: string },
): Promise<number> {
  const fechaEvento = dia(s, d.evento);
  const m = CREACION_DE_PLAN[clave];
  const { id } = await crearPlan(
    quien,
    {
      nombre: PLANES_DE_LA_DEMO[clave],
      origen: d.origen,
      fechaEvento,
      vigencia: anioDe(fechaEvento),
      objetivoTexto: d.objetivoTexto ?? null,
      objetivoId: d.objetivoId ?? null,
      fechaLimiteEnte: d.fechaLimiteEnte ?? null,
    },
    en(s, hace(s, m.dias, m.minutos ?? 0)),
  );
  s.planes[clave] = id;
  return id;
}

/** El plan de la auditoría interna, con el primer objetivo de calidad: Control Interno lo crea antes de registrar en él. */
async function planInterno(s: Siembra): Promise<void> {
  await nuevoPlan(s, "interno", s.s.control, {
    origen: "auditoria_interna",
    evento: 34,
    objetivoTexto: "Verificar que los procesos asistenciales y de apoyo cumplen los requisitos del sistema de gestión de la calidad.",
    objetivoId: s.objetivos[0],
  });
}

/** Un plan sin hallazgos: la autoevaluación que todavía no ha dejado ninguno. */
async function planVacio(s: Siembra): Promise<void> {
  await nuevoPlan(s, "vacio", s.s.control, { origen: "autoevaluacion", evento: 2 });
}

/**
 * «Por cerrar», y su análisis marcó «documentos» sin un trámite enlazado: el cierre le pedirá cómo se atendieron los cambios
 * (anexo 15B, §9.6). Atención Inmediata, sin líder: lo trabaja la coordinadora, lo aprueba Gerencia y lo verifica y evalúa
 * «eficaz» Control Interno; espera la firma «Cerró».
 */
async function porCerrar(s: Siembra): Promise<void> {
  const { id: h } = await registrarHallazgo(
    s.s.control,
    identificacion(s, "porCerrar", {
      clase: "no_conformidad",
      origen: "auditoria_interna",
      fuente: "Auditoría interna de seguridad del paciente",
      detectado: 121,
      procesoId: s.proceso.AIN,
      subprocesoId: s.subproceso("AIN", "urgencias"),
      criticidad: "media",
      descripcion:
        "En la auditoría interna de seguridad del paciente, el instructivo de higiene de manos publicado en urgencias no tiene los cinco momentos del protocolo institucional vigente.",
      requisitoClausula: "ISO 9001:2015, 7.5.2",
    }),
    en(s, registroDe(s, "porCerrar")),
  );
  s.ids.porCerrar = h;
  await corregir(s, h, s.s.coordinadora, {
    descripcion: "Se retiró el instructivo desactualizado de los puestos de urgencias y se dejó a la vista el protocolo institucional vigente.",
    responsable: s.s.jefeUrgencias,
    dias: 118,
  });
  await decidirAccionCorrectiva(
    s.s.coordinadora,
    { hallazgoId: h, requiere: true, justificacion: "El instructivo se publicó sin revisar el protocolo vigente: hay que buscar la causa." },
    en(s, hace(s, 117)),
  );
  const [[socializar]] = await formular(
    s,
    h,
    s.s.coordinadora,
    {
      analisis: [
        {
          metodo: "cinco_porques",
          equipo: "Enfermera jefe de urgencias y Coordinación del SGC",
          contenido: {
            niveles: [
              { respuesta: "El instructivo de urgencias no tiene los cinco momentos de la higiene de manos." },
              { respuesta: "Se elaboró antes de que se actualizara el protocolo institucional." },
              { respuesta: "Cuando el protocolo cambió, nadie revisó los instructivos que dependen de él." },
            ],
          },
        },
      ],
      causas: ["Al cambiar el protocolo institucional no se revisan los instructivos que dependen de él"],
      preguntas: { similares: null, cambios: "Actualizar el instructivo de higiene de manos de urgencias con el protocolo institucional" },
      acciones: [
        {
          tipo: "correctiva",
          descripcion: "Actualizar el instructivo de higiene de manos de urgencias y socializarlo con el personal",
          causas: [1],
          indicadorCumplimiento: "Personal de urgencias socializado",
          meta: "Todo el personal de urgencias",
          actividades: [{ descripcion: "Socializar el instructivo actualizado con el personal de urgencias", responsable: s.s.jefeUrgencias, inicio: 110, fin: 95 }],
        },
      ],
      criterios: ["no_recurrencia"],
    },
    hace(s, 115),
  );
  await enviarPlan(s.s.coordinadora, { hallazgoId: h, credenciales: FIRMA }, en(s, hace(s, 113)));
  await aprobarPlan(s.s.gerente, { hallazgoId: h, credenciales: FIRMA }, en(s, hace(s, 112)));
  await terminar(s, socializar, s.s.jefeUrgencias, {
    dias: 96,
    realizado: "Se socializó el instructivo actualizado en los tres turnos de urgencias.",
    evidencia: "Lista de asistencia a la socialización del instructivo",
  });
  await verificar(s, h, [socializar], { dias: 92, nota: "La lista de asistencia cubre los tres turnos y el instructivo publicado es el vigente." });
  await evaluar(s, h, {
    dias: 3,
    resultado: "eficaz",
    criterios: ["no_recurrencia"],
    hasta: "minima",
    justificacion: "En las rondas de seguridad del paciente de los dos meses siguientes no se encontró un instructivo desactualizado en urgencias.",
  });
}

/**
 * «En ejecución», registrado en el plan de la auditoría interna: Talento Humano, con su líder. Su primera actividad, de `lider.gth`,
 * tiene enlazados dos trámites documentales (los enlaza él más adelante, `enlazarLosTramites`); la segunda es de `jefe.urgencias`, que
 * no puede solicitar trámites.
 */
async function conTramites(s: Siembra): Promise<void> {
  const planId = s.planes.interno;
  if (!planId) throw new Error("El hallazgo con trámites de la demo necesita antes el plan de la auditoría interna");
  const { id: h } = await registrarHallazgo(
    s.s.control,
    {
      ...identificacion(s, "conTramites", {
        clase: "no_conformidad",
        origen: "auditoria_interna",
        fuente: PLANES_DE_LA_DEMO.interno,
        detectado: 28,
        procesoId: s.proceso.GTH,
        subprocesoId: s.subproceso("GTH", "ingreso"),
        criticidad: "media",
        descripcion:
          "En la auditoría interna de calidad, las tres últimas inducciones del personal asistencial no incluyeron el módulo de seguridad del paciente que pide la caracterización del proceso.",
        requisitoClausula: "ISO 9001:2015, 7.2 y 7.3",
      }),
      planId,
      objetivoId: s.objetivos[0],
    },
    en(s, registroDe(s, "conTramites")),
  );
  s.ids.conTramites = h;
  await aceptarHallazgo(s.s.liderGth, { hallazgoId: h }, en(s, hace(s, 27, 120)));
  await corregir(s, h, s.s.liderGth, {
    descripcion: "Se programó el módulo de seguridad del paciente para el personal que ingresó en las tres últimas inducciones.",
    responsable: s.s.liderGth,
    dias: 26,
  });
  await decidirAccionCorrectiva(
    s.s.coordinadora,
    { hallazgoId: h, requiere: true, justificacion: "Se repitió en tres inducciones seguidas: hay que buscar la causa." },
    en(s, hace(s, 25, 30)),
  );
  await formular(
    s,
    h,
    s.s.liderGth,
    {
      analisis: [
        {
          metodo: "cinco_porques",
          equipo: "Líder de Talento Humano y Coordinación del SGC",
          contenido: {
            niveles: [
              { respuesta: "La inducción no tuvo el módulo de seguridad del paciente." },
              { respuesta: "El procedimiento de inducción no lo incluye en su lista de temas." },
              { respuesta: "El módulo se añadió a la caracterización del proceso y no se pasó al procedimiento." },
            ],
          },
        },
      ],
      causas: ["El procedimiento de inducción no se actualizó cuando la caracterización del proceso añadió el módulo"],
      preguntas: { similares: null, cambios: "Actualizar la caracterización y el procedimiento de inducción con el módulo de seguridad del paciente" },
      acciones: [
        {
          tipo: "correctiva",
          descripcion: "Incluir el módulo de seguridad del paciente en el procedimiento de inducción",
          causas: [1],
          indicadorCumplimiento: "Inducciones con el módulo",
          meta: "Todas las inducciones del personal asistencial",
          actividades: [
            { descripcion: "Actualizar la caracterización y el procedimiento de inducción con el módulo de seguridad del paciente", responsable: s.s.liderGth, inicio: 22, fin: -15 },
            { descripcion: "Dar el módulo de seguridad del paciente en la próxima inducción del personal asistencial", responsable: s.s.jefeUrgencias, inicio: 20, fin: -25 },
          ],
        },
      ],
      criterios: ["no_recurrencia"],
    },
    hace(s, 24),
  );
  await enviarPlan(s.s.liderGth, { hallazgoId: h, credenciales: FIRMA }, en(s, hace(s, 23)));
  await firmarRevision(s.s.coordinadora, { hallazgoId: h, requiereRecursos: false, credenciales: FIRMA }, en(s, hace(s, 22)));
}

/** Un hallazgo de la visita del ente, registrado dentro de su plan: nace aceptado y pide la fecha límite del ente (spec 15 §13.4). */
async function delEnte(
  s: Siembra,
  clave: "enteRespondido" | "enteListo",
  planId: number,
  d: { proceso: string; subproceso: string; descripcion: string; requisitoClausula: string },
): Promise<number> {
  const { id } = await registrarHallazgo(
    s.s.coordinadora,
    {
      ...identificacion(s, clave, {
        clase: "no_conformidad",
        origen: "ente_control",
        fuente: PLANES_DE_LA_DEMO.ente,
        detectado: 10,
        procesoId: s.proceso[d.proceso],
        subprocesoId: s.subproceso(d.proceso, d.subproceso),
        criticidad: "media",
        descripcion: d.descripcion,
        requisitoClausula: d.requisitoClausula,
        fechaLimiteEnte: dia(s, -16),
      }),
      planId,
    },
    en(s, registroDe(s, clave)),
  );
  s.ids[clave] = id;
  return id;
}

/** El plan de acción de un externo del ente, en borrador: una acción con una actividad a cargo de `responsable`. */
async function planDeUnExterno(
  s: Siembra,
  h: number,
  x: { causa: string; porques: string[]; accion: string; actividad: string; responsable: SesionFlujo; momento: Date },
): Promise<void> {
  await formular(
    s,
    h,
    s.s.coordinadora,
    {
      analisis: [{ metodo: "cinco_porques", equipo: "Coordinación del SGC", contenido: { niveles: x.porques.map((respuesta) => ({ respuesta })) } }],
      causas: [x.causa],
      preguntas: { similares: null, cambios: null },
      acciones: [
        { tipo: "correctiva", descripcion: x.accion, causas: [1], actividades: [{ descripcion: x.actividad, responsable: x.responsable, inicio: 3, fin: -12 }] },
      ],
      criterios: ["no_recurrencia"],
    },
    x.momento,
  );
}

/**
 * El plan de la visita del ente (anexo 15B, §15.1): la coordinadora lo crea y registra en él dos externos de la visita (Apoyo
 * Terapéutico y Bienes y Servicios), y le añade tres de la 15A: el «En aprobación» de la misma visita (sin plan de acción aprobado),
 * el cerrado eficaz y el «En espera de eficacia» de Consulta Externa (de otro origen). El primer externo tiene su plan aprobado y su
 * respuesta registrada desde el plan, con el oficio entre los archivos del plan; el segundo se aprueba después de esa respuesta, así
 * que queda listo para responder y da la tarea del plan. En este orden: la base se lee como está, no como estaba a la hora del paso.
 */
async function planDelEnte(s: Siembra): Promise<void> {
  const planId = await nuevoPlan(s, "ente", s.s.coordinadora, {
    origen: "ente_control",
    evento: 10,
    objetivoTexto: "Responder a la Secretaría de Salud los hallazgos del acta de visita dentro del plazo que fijó.",
    fechaLimiteEnte: dia(s, -16),
  });
  const respondido = await delEnte(s, "enteRespondido", planId, {
    proceso: "ATE",
    subproceso: "farmacia",
    descripcion: "En la visita, la Secretaría de Salud encontró que el libro de registro de los medicamentos de control especial de farmacia no está al día (hallazgo 1 del acta de visita).",
    requisitoClausula: "Resolución 3100 de 2019, estándar de medicamentos",
  });
  const listo = await delEnte(s, "enteListo", planId, {
    proceso: "GBS",
    subproceso: "mantenimiento",
    descripcion: "En la visita, la Secretaría de Salud encontró que la planta eléctrica de emergencia no tiene el registro de sus pruebas semanales del último trimestre (hallazgo 2 del acta de visita).",
    requisitoClausula: "Resolución 3100 de 2019, estándar de infraestructura",
  });
  const de15A = [s.ids.eficaz, s.ids.enEspera, s.ids.enAprobacion];
  if (de15A.some((id) => id === undefined)) throw new Error("El plan del ente necesita antes el eficaz, el «En espera» y el «En aprobación»");
  await ponerEnPlan(s.s.coordinadora, { planId, hallazgoIds: (de15A as number[]).sort((a, b) => a - b), conObjetivo: false }, en(s, hace(s, 8, 30)));

  await corregir(s, respondido, s.s.coordinadora, {
    descripcion: "Se pasaron al libro los movimientos de los medicamentos de control especial con los soportes de dispensación.",
    responsable: s.s.regente,
    dias: 8,
  });
  await corregir(s, listo, s.s.coordinadora, {
    descripcion: "Se hizo la prueba de la planta eléctrica y se dejó su registro en la hoja de vida del equipo.",
    responsable: s.s.coordinadora,
    dias: 8,
  });
  await planDeUnExterno(s, respondido, {
    causa: "El libro de control especial no tiene un responsable de registrarlo cada día",
    porques: ["El libro no está al día.", "Cada turno supone que lo registra el siguiente.", "El procedimiento de farmacia no asigna quién lo registra."],
    accion: "Asignar el registro diario del libro de control especial al regente de farmacia",
    actividad: "Registrar cada día los movimientos de control especial y revisarlos cada semana",
    responsable: s.s.regente,
    momento: hace(s, 7),
  });
  await enviarPlan(s.s.coordinadora, { hallazgoId: respondido, credenciales: FIRMA }, en(s, hace(s, 6)));
  await aprobarPlan(s.s.gerente, { hallazgoId: respondido, credenciales: FIRMA }, en(s, hace(s, 6, 60)));

  // La respuesta al ente, desde el plan: el oficio es un archivo del plan y la respuesta vale para el único listo.
  const oficioId = await subir(s, {
    contexto: "mejora_plan",
    id: planId,
    rol: "evidencia",
    nombre: "Oficio de respuesta a la Secretaría de Salud",
    quien: s.s.coordinadora,
    ahora: hace(s, 5),
  });
  await registrarRespuestaDelPlan(s.s.coordinadora, { planId, enviadaEn: dia(s, 5), oficioId, vistos: [respondido] }, en(s, hace(s, 5, 30)));

  await planDeUnExterno(s, listo, {
    causa: "El mantenimiento preventivo de la planta eléctrica no tiene un formato de registro de la prueba semanal",
    porques: ["La prueba semanal no quedó registrada.", "No hay un formato para registrarla.", "El plan de mantenimiento solo pide la prueba, no su registro."],
    accion: "Registrar la prueba semanal de la planta eléctrica en la hoja de vida del equipo",
    actividad: "Hacer y registrar la prueba semanal de la planta eléctrica",
    responsable: s.s.coordinadora,
    momento: hace(s, 5, 60),
  });
  await enviarPlan(s.s.coordinadora, { hallazgoId: listo, credenciales: FIRMA }, en(s, hace(s, 4, 30)));
  await aprobarPlan(s.s.gerente, { hallazgoId: listo, credenciales: FIRMA }, en(s, hace(s, 4, 60)));
}

/** «Por aceptar»: lo registra Control Interno y cita el indicador de las marcas, no una medición: es la ocurrencia que el panel sugiere. */
async function sugeridoDeLaMarca(s: Siembra): Promise<void> {
  const { id } = await registrarHallazgo(
    s.s.control,
    identificacion(s, "sugeridoDeLaMarca", {
      clase: "no_conformidad",
      origen: "pqrsf",
      fuente: "Buzón de PQRSF de consulta externa",
      referenciaCaso: "PQRSF-2026-131",
      detectado: 3,
      procesoId: s.proceso.CEX,
      subprocesoId: s.subproceso("CEX", "medicina-general"),
      criticidad: "media",
      descripcion:
        "Varias quejas del mes dicen que la primera cita de medicina general disponible está a más de una semana; el indicador de días de espera lo confirma.",
      requisitoClausula: "ISO 9001:2015, 8.2.1",
      indicadorId: s.indicadorDeLasMarcas,
    }),
    en(s, registroDe(s, "sugeridoDeLaMarca")),
  );
  s.ids.sugeridoDeLaMarca = id;
}

/** El indicador de las marcas (`INDICADOR_DE_LAS_MARCAS`): lo mide y lo analiza `lider.cex`, que también aprueba su ficha. */
const FICHA_DE_LAS_MARCAS: FichaDemo = {
  codigo: "CEX-ID-004",
  proceso: "CEX",
  subproceso: "medicina-general",
  nombre: INDICADOR_DE_LAS_MARCAS,
  proposito: "Medir cuántos días espera en promedio un usuario entre la solicitud y la cita de medicina general.",
  tipo: "Eficiencia",
  clasificacion: "Operativo",
  forma: "razon",
  unidad: "Días",
  decimales: 1,
  periodicidad: "mensual",
  tendencia: "descendente",
  meta: "3",
  a: {
    nombre: "Días de espera de las citas asignadas",
    descripcion: "Suma de los días entre la solicitud y la cita de cada cita de medicina general asignada en el mes",
    fuente: "Informe mensual del operador de la agenda",
    unidad: "días",
  },
  b: {
    nombre: "Citas de medicina general asignadas",
    descripcion: "Citas de medicina general asignadas en el mes",
    fuente: "Informe mensual del operador de la agenda",
    unidad: "citas",
  },
  prueba: ["450", "150"],
  cargo: "Médico Coordinador",
  plazoReporte: 45,
};

/**
 * Crea, aprueba y mide el indicador de las marcas (anexo 15B, §15.1), por las funciones de indicadores y con la hora de cada paso:
 * aprobado a mitad del penúltimo mes, ese mes se reporta en Crítico y se analiza (el pendiente con su análisis); el último, también
 * en Crítico, se reporta sin análisis (todavía no es un pendiente: está dentro de sus 45 días). No toca ningún indicador sembrado.
 * Devuelve su id.
 */
async function indicadorDeLasMarcas(s: Siembra): Promise<number> {
  const mesEnCurso = periodoQueContiene("mensual", s.ahora, s.zona);
  const ultimo = periodoDe(anterior(mesEnCurso.clave), s.zona)!;
  const penultimo = periodoDe(anterior(ultimo.clave), s.zona)!;
  const enMes = (p: { desde: Date }, dias: number, horas: number) => antesDeLaSiembra(s, new Date(p.desde.getTime() + dias * 86_400_000 + horas * 3_600_000));
  const porNombre = async (tabla: "tipos_indicador" | "clasificaciones_indicador" | "unidades_indicador" | "cargos") =>
    new Map((await s.sql`SELECT id, nombre FROM ${s.sql(tabla)}`).map((f) => [f.nombre as string, Number(f.id)]));
  const [tipos, clasificaciones, unidades, cargos] = await Promise.all([
    porNombre("tipos_indicador"),
    porNombre("clasificaciones_indicador"),
    porNombre("unidades_indicador"),
    porNombre("cargos"),
  ]);
  const de = (mapa: Map<string, number>, nombre: string) => {
    const id = mapa.get(nombre);
    if (id === undefined) throw new Error(`La demo de mejoramiento no encuentra «${nombre}»`);
    return id;
  };
  const noSeUsa = () => {
    throw new Error("La ficha de las marcas no cita ese catálogo");
  };
  const cat: Catalogo = {
    proceso: (sigla) => s.proceso[sigla],
    subproceso: s.subproceso,
    tipo: (n) => de(tipos, n),
    clasificacion: (n) => de(clasificaciones, n),
    unidad: (n) => de(unidades, n),
    cargo: (n) => de(cargos, n),
    norma: noSeUsa,
    documento: noSeUsa,
    objetivo: noSeUsa,
    dato: noSeUsa,
    dimension: noSeUsa,
    indicador: noSeUsa,
  };
  const lider = s.s.liderCex;
  const creacion = enMes(penultimo, 14, 9);
  const op = { inicio: penultimo.clave, mide: [lider.usuarioId], analiza: [lider.usuarioId] };
  const { indicadorId, versionId } = await crearIndicador(s.s.coordinadora, datosDeFicha(cat, FICHA_DE_LAS_MARCAS, op), { sql: s.sql, ahora: creacion });
  const conFirma = (ahora: Date) => ({ sql: s.sql, ahora, verificar: firmaDeLaDemo });
  await enviarAAprobacion(s.s.coordinadora, { versionId, credenciales: FIRMA }, conFirma(minutosDespues(creacion, 60)));
  await aprobarFichas(lider, { versionIds: [versionId], credenciales: FIRMA }, conFirma(enMes(penultimo, 15, 10)));

  const medir = async (periodo: { clave: string }, valores: { A: string; B: string }, ahora: Date): Promise<number> => {
    await asegurarMediciones({ sql: s.sql, ahora, indicadorId });
    const [m] = await s.sql`SELECT id FROM mediciones WHERE indicador_id = ${indicadorId} AND periodo = ${periodo.clave}`;
    if (!m) throw new Error(`El indicador de las marcas no tiene medición de ${periodo.clave}`);
    const r = await reportar(lider, { medicionId: Number(m.id), valores, parcial: false, confirmado: true }, { sql: s.sql, ahora });
    if (!r.ok || r.semaforo !== "critico") throw new Error(`El indicador de las marcas debía quedar en Crítico en ${periodo.clave}`);
    return Number(m.id);
  };
  // El penúltimo: 4,7 días frente a una meta de 3, analizado al día siguiente.
  const reporte = enMes(ultimo, 2, 10);
  const pendiente = await medir(penultimo, { A: "702", B: "150" }, reporte);
  await analizar(
    lider,
    {
      medicionId: pendiente,
      causa: "Dos médicos de la agenda de medicina general estuvieron de vacaciones y sus citas no se reasignaron a los demás.",
      accionPropuesta: "Programar las vacaciones de los médicos por turnos y abrir agenda adicional los sábados cuando falte un médico.",
    },
    { sql: s.sql, ahora: minutosDespues(reporte, 24 * 60) },
  );
  // El último: 5 días, reportado poco después de terminar el mes y sin análisis.
  const terminado = ultimo.hasta.getTime();
  const margen = Math.min(2 * 86_400_000, Math.floor((s.ahora.getTime() - terminado) / 2));
  await medir(ultimo, { A: "735", B: "147" }, antesDeLaSiembra(s, new Date(terminado + margen)));
  return indicadorId;
}

/** La salida «no requiere» del Crítico de `SGC-IND-01`, ya analizado: la coordinadora la decide al día siguiente de su análisis. */
async function noRequiereDeLasAuditorias(s: Siembra): Promise<void> {
  const [m] = await s.sql`SELECT m.id, m.analizada_en FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id
    WHERE i.codigo = 'SGC-IND-01' AND m.requiere_accion AND NOT m.historica ORDER BY m.desde DESC LIMIT 1`;
  if (!m?.analizada_en) throw new Error("La demo de mejoramiento necesita el Crítico analizado de SGC-IND-01");
  const momento = new Date(Math.min((m.analizada_en as Date).getTime() + 86_400_000, s.ahora.getTime() - 3_600_000));
  await resolverNoRequiere(
    s.s.coordinadora,
    {
      medicionId: Number(m.id),
      justificacion:
        "Las dos auditorías que faltaron ya se reprogramaron para el trimestre siguiente y la formación de los auditores de respaldo está en el plan de capacitación.",
    },
    en(s, antesDeLaSiembra(s, momento)),
  );
}

/**
 * Otro hallazgo de verificación en Urgencias, reabierto una vez y sin no conformidad: la fila con la sugerencia (anexo 15B, §7.4).
 * Una verificación de Urgencias después de la que ya tiene: su última sigue no conforme, así la conformidad de los puntos que
 * fotografía `SGC-ID-002` no cambia. `jefe.urgencias` lo corrige y la coordinadora lo reabre con un plazo nuevo.
 */
async function reabiertoEnUrgencias(s: Siembra): Promise<void> {
  const [punto] = await s.sql`SELECT id FROM puntos_uso WHERE nombre = 'Urgencias'`;
  const ahora = hace(s, 8);
  const { verificacionId } = await abrirVerificacion(s.s.coordinadora, Number(punto.id), { sql: s.sql, ahora });
  const items = await s.sql`SELECT id, texto FROM verificacion_items WHERE verificacion_id = ${verificacionId} ORDER BY orden`;
  const obsoletos = ITEMS_FIJOS[0];
  await guardarAvance(
    verificacionId,
    s.s.coordinadora,
    items.map((i) =>
      i.texto === obsoletos
        ? { itemId: Number(i.id), respuesta: "no_conforme" as const, nota: "Una copia impresa de una versión anterior del protocolo de triage en el puesto de enfermería" }
        : { itemId: Number(i.id), respuesta: "conforme" as const, nota: null },
    ),
    { sql: s.sql, ahora },
  );
  await cerrarVerificacion(verificacionId, s.s.coordinadora, { sql: s.sql, ahora: minutosDespues(ahora, 10) });
  const [h] = await s.sql`SELECT id FROM hallazgos WHERE verificacion_id = ${verificacionId}`;
  await corregirHallazgo(Number(h.id), s.s.jefeUrgencias, "Se retiró la copia impresa y se dejó a la vista el acceso a la versión vigente en la plataforma.", {
    sql: s.sql,
    ahora: hace(s, 6),
  });
  await reabrirHallazgo(Number(h.id), s.s.coordinadora, "En la ronda de seguimiento la copia anterior seguía en el puesto de enfermería del turno de la noche.", {
    sql: s.sql,
    ahora: hace(s, 2),
  });
}

/**
 * Un impacto de norma vencido y escalado, sin hallazgo (anexo 15B, §8): la Ley 1438 de 2011 modifica la Ley 100 de 1993, registrado
 * hace cuarenta días; la pasada de los impactos vencidos de la 13C corre a los veinte, cuando ya venció y pasó el escalamiento, y
 * avisa y escala de una vez. Solo esa pasada: la de vencimientos completa avisaría lo demás de otros módulos.
 */
async function impactoVencido(s: Siembra): Promise<void> {
  const normas = new Map(
    (await s.sql`SELECT n.id, n.numero, n.anio FROM normas n JOIN tipos_norma tn ON tn.id = n.tipo_norma_id WHERE tn.nombre = 'Ley'`).map((f) => [
      `${f.numero}/${f.anio}`,
      Number(f.id),
    ]),
  );
  const [ley1438, ley100] = [normas.get("1438/2011"), normas.get("100/1993")];
  if (!ley1438 || !ley100) throw new Error("La demo de mejoramiento necesita la Ley 100 de 1993 y la Ley 1438 de 2011 en el normograma");
  await registrarRelacion(
    s.s.coordinadora,
    {
      normaId: ley1438,
      afectadaId: ley100,
      tipo: "modifica",
      detalle: "La Ley 1438 de 2011 modifica artículos de la Ley 100 de 1993 sobre el Sistema General de Seguridad Social en Salud.",
      fecha: "2011-01-19",
    },
    { sql: s.sql, ahora: hace(s, 40) },
  );
  const { escalamientoDias } = await obtenerConfigDocumental({ sql: s.sql });
  await impactosVencidos({ sql: s.sql, ahora: hace(s, 20), escalamientoDias });
}

/** `lider.gth` enlaza a su actividad el trámite publicado de la caracterización y el que sigue en revisión del procedimiento de inducción. */
async function enlazarLosTramites(s: Siembra): Promise<void> {
  const h = s.ids.conTramites;
  if (!h) throw new Error("Los enlaces de la demo necesitan antes el hallazgo con trámites");
  const [actividad] = await s.sql`SELECT a.id FROM mejora_actividades a JOIN usuarios u ON u.id = a.responsable_id
    WHERE a.hallazgo_id = ${h} AND u.usuario = 'lider.gth'`;
  const tramite = async (codigo: string, etapa: string) => {
    const [t] = await s.sql`SELECT t.id FROM tramites t JOIN documentos d ON d.id = t.documento_id WHERE d.codigo = ${codigo} AND t.etapa = ${etapa}`;
    if (!t) throw new Error(`La demo de mejoramiento necesita el trámite de ${codigo} en ${etapa}`);
    return Number(t.id);
  };
  await enlazarTramite(s.s.liderGth, { actividadId: Number(actividad.id), tramiteId: await tramite("GTH-CA-01", "publicado") }, en(s, hace(s, 5)));
  await enlazarTramite(s.s.liderGth, { actividadId: Number(actividad.id), tramiteId: await tramite("GTH-PR-02", "revision") }, en(s, hace(s, 5, 10)));
}

/**
 * La clasificación que no se hace al registrar: Control Interno pone en el plan de la auditoría interna el reincidente de la nevera y
 * el «Por aceptar» de Talento Humano (reciben el objetivo del plan); la coordinadora pone un objetivo a dos hallazgos sin plan.
 */
async function clasificar(s: Siembra): Promise<void> {
  const { interno } = s.planes;
  const { enEjecucion, porAceptar, reabierto, sugeridoDeLaMarca } = s.ids;
  if (!interno || !enEjecucion || !porAceptar || !reabierto || !sugeridoDeLaMarca) throw new Error("La clasificación de la demo necesita antes sus hallazgos");
  await ponerEnPlan(s.s.control, { planId: interno, hallazgoIds: [enEjecucion, porAceptar].sort((a, b) => a - b), conObjetivo: true }, en(s, hace(s, 1, 180)));
  await ponerObjetivo(s.s.coordinadora, { hallazgoId: reabierto, objetivoId: s.objetivos[2] }, en(s, hace(s, 1, 190)));
  await ponerObjetivo(s.s.coordinadora, { hallazgoId: sugeridoDeLaMarca, objetivoId: s.objetivos[3] }, en(s, hace(s, 1, 200)));
}

/**
 * La no conformidad del hallazgo de verificación de Urgencias (anexo 15B, §7.2), a la hora de la siembra: la abre la coordinadora,
 * cita el Crítico de conformidad de `SGC-ID-002` (que la foto de la siembra marcó y analizó a esa misma hora), y con ello le escribe su
 * salida «hallazgo» (§6.3). Atención Inmediata no tiene líder: nace aceptada y va a «Por formular».
 */
async function desdeLaVerificacion(s: Siembra): Promise<void> {
  const [vh] = await s.sql`SELECT id, creado_en FROM hallazgos WHERE estado = 'abierto' AND descripcion LIKE '%AIN-FO-01%' ORDER BY id LIMIT 1`;
  const [m] = await s.sql`SELECT m.id, m.indicador_id FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id
    WHERE i.codigo = 'SGC-ID-002' AND m.requiere_accion ORDER BY m.desde DESC LIMIT 1`;
  if (!vh || !m) throw new Error("La demo de mejoramiento necesita el hallazgo de verificación de Urgencias y el Crítico de SGC-ID-002");
  const { id } = await registrarHallazgo(
    s.s.coordinadora,
    {
      clase: "no_conformidad",
      origen: "control_documental",
      fuente: "Verificación del punto Urgencias",
      detectadoEn: fechaEnZona(vh.creado_en as Date, s.zona),
      procesoId: s.proceso.AIN,
      subprocesoId: s.subproceso("AIN", "urgencias"),
      criticidad: "media",
      titulo: HALLAZGOS_DE_LA_DEMO.desdeVerificacion.titulo,
      descripcion: "En la verificación del punto de uso de Urgencias se encontró una copia no controlada de AIN-FO-01, impresa sin sello, en el servicio.",
      requisitoClausula: "ISO 9001:2015, 7.5.3",
      indicadorId: Number(m.indicador_id),
      medicionId: Number(m.id),
      verificacionHallazgoId: Number(vh.id),
      accionJustificacion: "Una copia no controlada en un servicio asistencial puede llevar a usar un formato desactualizado: hay que tratar la causa.",
    },
    en(s, s.ahora),
  );
  s.ids.desdeVerificacion = id;
}

// ─────────────────────────────────────────────────────────────────────────────

/** El día no hábil de ejemplo: el primer día hábil desde tres semanas después de la siembra. */
function diaDeEjemplo(s: Siembra): string {
  let d = dia(s, -21);
  while (!esHabil(d, s.calendario)) d = fechaEnZona(new Date(finDeFecha(d, s.zona).getTime() + 1), s.zona);
  return d;
}

/**
 * Los avisos que la historia sembrada ya resolvió, leídos (como `leerAvisosResueltos` de `indicadores-demo.ts`): la campana de
 * cada usuario de la demo trae lo que hoy le toca, no cada paso de catorce historias. No puede decidirse por la hora: todos los
 * avisos llevan la de la siembra. Quedan leídos los `mejora.*` de los hallazgos terminados (los del hallazgo y los de sus
 * actividades), los `mejora.turno` de quien ya no tiene el turno de su hallazgo (`quienTieneElTurno`, la regla del motor) y los
 * `mejora.actividad_asignada` de las actividades terminadas. Se marcan leídos en la hora en que nacieron (`leida_en =
 * creado_en`): así lo que una persona lea después (con la hora de entonces) se distingue de lo que dejó leído la semilla
 * (`tests/semilla-mejoramiento.test.ts`). `notificaciones` no es una tabla de mejoramiento y la marca de lectura no se audita
 * (F12-D35).
 */
async function leerAvisosResueltos(sql: Sql): Promise<void> {
  const terminados = sql`SELECT id FROM mejora_hallazgos WHERE estado IN ${sql([...TERMINALES])}`;
  await sql`UPDATE notificaciones n SET leida_en = n.creado_en
    WHERE n.leida_en IS NULL AND n.tipo LIKE 'mejora.%' AND (
      (n.entidad = 'mejora_hallazgo' AND n.entidad_id IN (${terminados}))
      OR (n.entidad = 'mejora_actividad' AND n.entidad_id IN (SELECT id FROM mejora_actividades WHERE hallazgo_id IN (${terminados})))
      OR (n.tipo = 'mejora.actividad_asignada' AND n.entidad = 'mejora_actividad'
        AND n.entidad_id IN (SELECT id FROM mejora_actividades WHERE estado = 'terminada')))`;
  const conTurno = await sql`SELECT DISTINCT entidad_id FROM notificaciones
    WHERE leida_en IS NULL AND tipo = 'mejora.turno' AND entidad = 'mejora_hallazgo' ORDER BY entidad_id`;
  for (const f of conTurno) {
    const h = await hallazgoBase(sql, Number(f.entidad_id));
    if (!h) continue;
    const turno = await quienTieneElTurno(sql, h);
    await sql`UPDATE notificaciones SET leida_en = creado_en
      WHERE leida_en IS NULL AND tipo = 'mejora.turno' AND entidad = 'mejora_hallazgo' AND entidad_id = ${h.id}
        AND NOT (usuario_id = ANY(${turno}::bigint[]))`;
  }
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
    planes: {},
    objetivos: (await sql`SELECT id FROM objetivos ORDER BY id`).map((f) => Number(f.id)),
  };
}

export async function sembrarMejoramiento(sql: Sql, c: ContextoDistribucion): Promise<void> {
  console.log("Sembrando planes de mejoramiento: hallazgos, reportes y el calendario de la entidad…");
  const s = await prepararSiembra(sql, c);
  // Antes que todo: los plazos de la demo se cuentan con el calendario que ya lo tiene.
  await agregarDiaDeCalendario(s.s.coordinadora, { fecha: diaDeEjemplo(s), tipo: "no_habil", motivo: DIA_NO_HABIL_DE_EJEMPLO }, { sql });
  s.calendario = await calendarioDeMejora(sql);

  // El indicador de las marcas (15B) va antes que los hallazgos: uno lo cita. No crea hallazgos, así que no mueve ningún código.
  s.indicadorDeLasMarcas = await indicadorDeLasMarcas(s);

  // En el orden de su registro (`REGISTRO`): así los códigos salen en el orden de sus fechas. A igual hora, en el de esta lista. El
  // del ente registra sus dos externos (`planDelEnte`); los planes se crean en el orden de sus códigos (`CREACION_DE_PLAN`).
  const escenarios: Record<Exclude<Clave, "enteListo" | "desdeVerificacion">, (s: Siembra) => Promise<void>> = {
    eficaz,
    porCerrar,
    reabierto,
    enEspera,
    porEvaluar,
    enEjecucion,
    conTramites,
    conCorreccion,
    sinAccion,
    cargado,
    enRevision,
    porFormular,
    enAprobacion,
    enteRespondido: planDelEnte,
    rechazado,
    enArbitraje,
    sugeridoDeLaMarca,
    porAceptar,
  };
  const momentoDePlan = (clave: keyof typeof PLANES_DE_LA_DEMO) => hace(s, CREACION_DE_PLAN[clave].dias, CREACION_DE_PLAN[clave].minutos ?? 0);
  const siembras = [
    ...(Object.keys(escenarios) as (keyof typeof escenarios)[]).map((clave) => ({ registro: registroDe(s, clave), sembrar: escenarios[clave] })),
    { registro: registroDe(s, REPORTE_POR_CLASIFICAR), sembrar: reportePorClasificar },
    { registro: momentoDePlan("interno"), sembrar: planInterno },
    { registro: momentoDePlan("vacio"), sembrar: planVacio },
  ];
  siembras.sort((a, b) => a.registro.getTime() - b.registro.getTime());
  for (const { sembrar } of siembras) await sembrar(s);

  // Lo de la 15B que cruza hallazgos ya sembrados, cada paso con su hora en el pasado: la base se lee como está.
  await noRequiereDeLasAuditorias(s);
  await reabiertoEnUrgencias(s);
  await impactoVencido(s);
  await enlazarLosTramites(s);
  await clasificar(s);
  // A la hora de la siembra, la última: el Crítico de `SGC-ID-002` nació con la foto de esa hora.
  await desdeLaVerificacion(s);

  // Antes de la pasada: lo que ella avise queda sin leer.
  await leerAvisosResueltos(sql);
  // A la hora de la siembra: lo que ya venció avisa ahora, y otra pasada a esa hora no tiene nada nuevo que avisar.
  await revisarVencimientosDeMejoramiento({ sql, ahora: c.ahora, config: await obtenerConfigDocumental({ sql }) });
}
