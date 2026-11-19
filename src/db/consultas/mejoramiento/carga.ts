/**
 * Registrar un hallazgo ya en curso (spec 15 §15, Tarea 20): el que se tramitó en papel antes de la plataforma, con su plan ya
 * aprobado por fuera (el único punto de entrada, F15-DC29: uno sin plan aprobado se registra por el camino normal). Solo el Admin
 * SGC. En una transacción: el hallazgo (`cargado`, con el código del año de la carga), la corrección, la ronda 1 con el análisis,
 * las causas, las acciones y las actividades (con su fin original, su avance y, las terminadas, el día en que terminaron), el plan
 * aprobado con la fecha y el rol declarados, y un evento por cada paso hecho en papel (`registrar`, `corregir` y `aprobar_plan`),
 * marcados `fuera` y en su fecha real, el de la aprobación con el plan congelado y su huella (§12.2). Ninguna fila en `firmas`:
 * esos pasos no los firmó nadie en la plataforma. Nace por `nacerHallazgo(…, "cargar")`, «En ejecución» o, con todo terminado,
 * «Por verificar».
 *
 * Lo que se hizo en papel lo hizo otro: quien carga no queda como quien registró la corrección ni terminó una actividad
 * (`correccion_registrada_por` y `terminada_por` nulos; `quienesVerifican` no cuenta los eventos `fuera`), así que puede verificar.
 * La carga va en dos pasos: el plan no llega a sus responsables hasta que se sube el formato firmado (`carga-confirmada.ts`).
 *
 * Lo que la persona escribió (las descripciones, las causas, quién aprobó en papel) va a las tablas del hallazgo y a sus eventos,
 * nunca a la bitácora: `mejora_cargar` lleva solo fechas, el rol y cuántas actividades.
 */
import type { z } from "zod";
import { obtenerSql } from "@/db/cliente";
import { enTransaccion, type OpcionesFlujo, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import {
  EsquemaCarga,
  EsquemaHallazgo,
  LA_ACCION,
  LA_ACTIVIDAD,
  LA_CAUSA,
  type CargaValidada,
  type HallazgoValidado,
} from "@/lib/esquemas/mejoramiento";
import { leerContenido } from "@/lib/mejoramiento/analisis";
import { CARGA_SIN_ENGANCHE } from "@/lib/mejoramiento/enganches";
import { rolQueAproboEnPapel } from "@/lib/mejoramiento/reglas";
import { ErrorMejora, type MetodoAnalisis, type TipoAccion } from "@/lib/mejoramiento/tipos";
import { requerirPermiso } from "@/lib/permisos";
import { fechaEnZona, finDeFecha } from "@/lib/tramites/plazos";
import { leer } from "./analisis";
import { cierrePrevistoDelPlan } from "./aprobacion";
import { bloquearPlanDelRegistro, clasificarAlNacer } from "./clasificacion";
import { contextoDeMejora } from "./config";
import { dejarEvento, legible, nacerHallazgo } from "./flujo";
import { indicadorElegible } from "./indicador-de-eficacia";
import { bloquearMarca, salidaAlNacer } from "./marcas-base";
import { etiquetaDeAccion, etiquetaDeActividad, examinarPlan, INDICADOR_NO_ELEGIBLE, RESPONSABLE_INACTIVO } from "./plan";
import { exigirReincidencia, filaDe, revisarIdentificacion, tomarCodigo, type DatosDeHallazgo } from "./registro";

export { cargaConfirmada, FALTA_EL_ESCANEO, FALTA_EL_FORMATO } from "./carga-confirmada";

/** Lo que trae un hallazgo ya en curso: la identificación de §7.1 y lo que se hizo en papel. */
export type DatosDeCarga = DatosDeHallazgo & {
  /** El día en que se registró en papel: la fecha de su evento `registrar`. */
  registradoEnPapel: string;
  /** Solo en la no conformidad (§8.4): sin requerirla, `descripcion` es la justificación. */
  correccion: { requerida: boolean; descripcion: string; implementadaEn?: string | null };
  /**
   * El contenido estructurado del método es opcional. Fuera de la no conformidad el análisis también lo es (§9.5): sin método ni
   * contenido no hay fila de análisis, y las causas, si las hay, son de la ronda.
   */
  analisis: { metodo?: MetodoAnalisis | null; causas: string[]; contenido?: unknown };
  /** `causas`: el número de cada causa del análisis que ataca (de 1 en adelante). Una actividad con `terminadaEn` ya terminó. */
  acciones: Array<{
    tipo: TipoAccion;
    descripcion: string;
    causas: number[];
    recursos?: string | null;
    indicadorCumplimiento?: string | null;
    meta?: string | null;
    actividades: Array<{ descripcion: string; responsableId: number; inicio: string; fin: string; avance: number; terminadaEn?: string | null }>;
  }>;
  criterios: string[];
  criterioOtro?: string | null;
  indicadorEficaciaId?: number | null;
  fechaEvaluacion?: string | null;
  /** Quién aprobó el plan en papel (texto), cuándo y con qué rol. */
  aprobacion: { nombre: string; cargo: string; fecha: string; rol: "gerencia" | "admin_sgc" };
};

const SOLO_POR_EL_CAMINO_NORMAL = "Un hallazgo ya en curso no nace de un reporte ni de otro hallazgo: regístrelo por el camino normal";

/** El primer mensaje del esquema, con la etiqueta de la acción («A1») o de la actividad («A1.2»), o el número de la causa. */
function mensajeDe(issue: z.core.$ZodIssue): string {
  const [lista, i, sub, j] = issue.path;
  if (lista === "analisis" && i === "causas" && typeof sub === "number") return issue.message.replaceAll(LA_CAUSA, String(sub + 1));
  if (lista !== "acciones" || typeof i !== "number") return issue.message;
  const conAccion = issue.message.replaceAll(LA_ACCION, etiquetaDeAccion(i + 1));
  return sub === "actividades" && typeof j === "number" ? conAccion.replaceAll(LA_ACTIVIDAD, etiquetaDeActividad(i + 1, j + 1)) : conAccion;
}

/** La identificación con `EsquemaHallazgo` y lo demás con `EsquemaCarga`, que necesita la clase y el día de detección ya leídos. */
function leerCarga(d: DatosDeCarga): { v: HallazgoValidado; carga: CargaValidada } {
  const { registradoEnPapel, correccion, analisis, acciones, criterios, criterioOtro, indicadorEficaciaId, fechaEvaluacion, aprobacion, ...identificacion } = d;
  const v = leer(EsquemaHallazgo, identificacion);
  if (v.derivadoDe !== null || v.reporteId !== null) throw new ErrorMejora(SOLO_POR_EL_CAMINO_NORMAL);
  // El enlace a un hallazgo de verificación o a un impacto de norma solo lo escribe el registro (Fase 15B, anexo §7.2 y §8).
  if (v.verificacionHallazgoId !== null || v.impactoId !== null || v.impactoIndicadorId !== null) throw new ErrorMejora(CARGA_SIN_ENGANCHE);
  const leido = EsquemaCarga.safeParse({
    clase: v.clase,
    detectadoEn: v.detectadoEn,
    registradoEnPapel,
    correccion,
    analisis,
    acciones,
    criterios,
    criterioOtro,
    indicadorEficaciaId,
    fechaEvaluacion,
    aprobacion,
  });
  if (!leido.success) throw new ErrorMejora(mensajeDe(leido.error.issues[0]));
  return { v, carga: leido.data };
}

/** Lo que depende de hoy (el día de `ahora` en la zona, R8): ninguna fecha del papel es futura. */
function revisarFechasDeHoy(carga: CargaValidada, hoy: string): void {
  if (carga.registradoEnPapel > hoy) throw new ErrorMejora("La fecha de registro en papel no puede ser futura");
  if (carga.aprobacion.fecha > hoy) throw new ErrorMejora("La fecha de aprobación del plan no puede ser futura");
  if (carga.correccion?.implementadaEn && carga.correccion.implementadaEn > hoy) {
    throw new ErrorMejora("La fecha en que se implementó la corrección no puede ser futura");
  }
  carga.acciones.forEach((a, i) =>
    a.actividades.forEach((x, j) => {
      if (x.terminadaEn !== null && x.terminadaEn > hoy) {
        throw new ErrorMejora(`La fecha en que terminó la actividad ${etiquetaDeActividad(i + 1, j + 1)} no puede ser futura`);
      }
    }),
  );
}

/**
 * El primer instante de un día del calendario en la zona: lo que se guarda de un paso hecho en papel, del que solo se sabe el día
 * (`ocurrio_en`, `aprobado_en`, `terminada_en`). Nunca después de `ahora` si el día es hoy o antes, y su día en la zona es el declarado.
 */
function inicioDelDia(dia: string, zona: string): Date {
  const anterior = new Date(Date.parse(`${dia}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  return new Date(finDeFecha(anterior, zona).getTime() + 1);
}

/**
 * Carga un hallazgo ya en curso (spec §15) y devuelve su id y su código. Las reglas del papel las valida `EsquemaCarga`; las de
 * hoy, la base y lo enlazado, el dominio dentro de la transacción. El rol que aprobó es el declarado, salvo criticidad alta u origen
 * externo, que es Gerencia (`rolQueAproboEnPapel`: decide los ajustes). Sin avisos: el plan llega a sus responsables con el
 * formato firmado (`confirmarCarga`).
 *
 * Con `planId` y `objetivoId`, como el registro (Fase 15B, anexo §3.4 camino 1: «vale igual para registrar un hallazgo ya en
 * curso»): el plan es el primer candado de la transacción (`bloquearPlanDelRegistro`) y la clasificación se escribe después de
 * `nacerHallazgo` (`clasificarAlNacer`). Con una medición marcada, como el registro (anexo §6.3): su candado va justo después del
 * plan y la salida «hallazgo» de la marca se escribe en esta misma transacción (`salidaAlNacer`, sin el panel: la carga no lo
 * atiende).
 */
export async function cargarHallazgo(
  sesion: SesionFlujo,
  d: DatosDeCarga,
  opciones?: OpcionesFlujo,
): Promise<{ id: number; codigo: string }> {
  requerirPermiso(sesion, "mejora.gestionar");
  const { v, carga } = leerCarga(d);
  const { metodo } = carga.analisis;
  const contenido = carga.analisis.contenido === null || metodo === null ? null : leerContenido(metodo, carga.analisis.contenido);
  const ahora = opciones?.ahora ?? new Date();
  return legible(
    enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
      await bloquearPlanDelRegistro(tx, sesion, v.planId);
      // El candado de la medición que cita, en el orden del registro (después del plan y antes de cualquier lectura que decida):
      // la carga deja la salida de su marca como el registro (anexo 15B §6.3).
      if (v.medicionId !== null) await bloquearMarca(tx, v.medicionId);
      const c = await contextoDeMejora(tx, ahora);
      const hoy = fechaEnZona(c.ahora, c.zona);
      await revisarIdentificacion(tx, sesion, v, c);
      await exigirReincidencia(tx, v.reincidenteDe, v.procesoId);
      revisarFechasDeHoy(carga, hoy);
      const actividades = carga.acciones.flatMap((a) => a.actividades);
      // Los responsables, `FOR SHARE`: nadie los desactiva hasta que la carga termine.
      const responsables = [...new Set(actividades.map((a) => a.responsableId))];
      const activos = await tx`SELECT id FROM usuarios WHERE activo AND id = ANY(${responsables}) FOR SHARE`;
      if (activos.length !== responsables.length) throw new ErrorMejora(RESPONSABLE_INACTIVO);
      if (carga.indicadorEficaciaId !== null && !(await indicadorElegible(tx, sesion, carga.indicadorEficaciaId))) {
        throw new ErrorMejora(INDICADOR_NO_ELEGIBLE);
      }

      const anio = Number(hoy.slice(0, 4));
      const { consecutivo, codigo } = await tomarCodigo(tx, anio);
      const terminadas = actividades.filter((a) => a.terminadaEn !== null).length;
      const rol = rolQueAproboEnPapel(v, carga.aprobacion.rol);
      const h = await nacerHallazgo(
        tx,
        sesion,
        { ...filaDe(v), derivadoDe: null, codigo, anio, consecutivo },
        "cargar",
        {
          rumbo: { quedaEn: terminadas === actividades.length ? "por_verificar" : "en_ejecucion" },
          detalle: {
            registradoEnPapel: carga.registradoEnPapel,
            aprobadoEn: carga.aprobacion.fecha,
            aprobadoRol: rol,
            actividades: actividades.length,
            terminadas,
          },
          sinAvisoDelTurno: true,
        },
        c,
      );
      await clasificarAlNacer(tx, sesion, h.id, { planId: v.planId, objetivoId: v.objetivoId }, c.ahora);
      // Nunca llega desde el panel de la marca: un `marcaMedicionId` que traiga el formulario se ignora.
      if (v.medicionId !== null) await salidaAlNacer(tx, sesion, { medicionId: v.medicionId, hallazgoId: h.id, desdeElPanel: false }, c.ahora);
      // Sin el formato firmado nadie puede verificar: el plazo de «Por verificar» lo pone el escaneo (`confirmarCarga`).
      if (h.estado === "por_verificar") await tx`UPDATE mejora_hallazgos SET vence_en = NULL WHERE id = ${h.id}`;

      // La corrección (solo de la no conformidad): la registraron en papel, no quien carga.
      const diaDeLaCorreccion = carga.correccion?.implementadaEn ?? carga.registradoEnPapel;
      if (carga.correccion) {
        await tx`UPDATE mejora_hallazgos SET correccion_requerida = ${carga.correccion.requerida},
            correccion_descripcion = ${carga.correccion.descripcion}, correccion_implementada_en = ${carga.correccion.implementadaEn},
            correccion_registrada_en = ${inicioDelDia(diaDeLaCorreccion, c.zona)}, accion_requerida = true
          WHERE id = ${h.id}`;
      }

      // La ronda 1: el análisis, las causas, las acciones con sus actividades y el criterio de eficacia.
      const [r] = await tx`SELECT id FROM mejora_rondas WHERE hallazgo_id = ${h.id} AND numero = 1`;
      const rondaId = Number(r.id);
      // El análisis, como lo admite la formulación (§9.5): obligatorio en la no conformidad (su contenido estructurado no, spec §15);
      // en las demás clases, solo con su contenido. Sin él no queda una fila vacía.
      if (metodo !== null && (v.clase === "no_conformidad" || contenido !== null)) {
        await tx`INSERT INTO mejora_analisis (hallazgo_id, ronda_id, orden, metodo, contenido)
          VALUES (${h.id}, ${rondaId}, 1, ${metodo}, ${contenido === null ? null : tx.json(contenido as never)})`;
      }
      const causaIds: number[] = [];
      for (const [i, texto] of carga.analisis.causas.entries()) {
        const [x] = await tx`INSERT INTO mejora_causas (hallazgo_id, ronda_id, orden, texto)
          VALUES (${h.id}, ${rondaId}, ${i + 1}, ${texto}) RETURNING id`;
        causaIds.push(Number(x.id));
      }
      for (const [i, a] of carga.acciones.entries()) {
        const [ac] = await tx`INSERT INTO mejora_acciones (hallazgo_id, ronda_id, orden, tipo, descripcion, recursos, indicador_cumplimiento, meta)
          VALUES (${h.id}, ${rondaId}, ${i + 1}, ${a.tipo}, ${a.descripcion}, ${a.recursos}, ${a.indicadorCumplimiento}, ${a.meta})
          RETURNING id`;
        const accionId = Number(ac.id);
        if (a.causas.length > 0) {
          await tx`INSERT INTO mejora_accion_causas ${tx(a.causas.map((n) => ({ hallazgo_id: h.id, accion_id: accionId, causa_id: causaIds[n - 1] })))}`;
        }
        for (const [j, x] of a.actividades.entries()) {
          // La fecha de fin original es la que se carga (spec §15); terminada, sin archivo y sin quien la terminó en la plataforma.
          const estado = x.terminadaEn !== null ? "terminada" : x.avance > 0 ? "en_proceso" : "abierta";
          await tx`INSERT INTO mejora_actividades
              (hallazgo_id, accion_id, orden, descripcion, responsable_id, inicio, fin_original, fin, avance, estado, terminada_en)
            VALUES (${h.id}, ${accionId}, ${j + 1}, ${x.descripcion}, ${x.responsableId}, ${x.inicio}, ${x.fin}, ${x.fin}, ${x.avance},
              ${estado}, ${x.terminadaEn === null ? null : inicioDelDia(x.terminadaEn, c.zona)})`;
        }
      }
      await tx`UPDATE mejora_rondas SET criterios = ${tx.json(carga.criterios as never)}, criterio_otro = ${carga.criterioOtro},
          indicador_eficacia_id = ${carga.indicadorEficaciaId}, fecha_evaluacion = ${carga.fechaEvaluacion}
        WHERE id = ${rondaId}`;

      // El plan aprobado en papel, congelado como el de la plataforma (spec §12.2), con el cierre previsto de sus fechas.
      const { plan, huella } = await examinarPlan(tx, h.id, c);
      const aprobadoPor = `${carga.aprobacion.nombre}, ${carga.aprobacion.cargo}`;
      const previsto = await cierrePrevistoDelPlan(tx, v, actividades.map((x) => x.fin), plan, c);
      await tx`UPDATE mejora_rondas SET estado_plan = 'aprobado', aprobado_en = ${inicioDelDia(carga.aprobacion.fecha, c.zona)},
          aprobado_rol = ${rol}, aprobado_fuera = ${aprobadoPor}, cierre_previsto = ${previsto}
        WHERE id = ${rondaId}`;

      // Cada paso hecho en papel, en su fecha real y marcado fuera de la plataforma.
      const enPapel = (tipo: string, dia: string, detalle: Record<string, unknown>) =>
        dejarEvento(tx, { hallazgoId: h.id, ronda: 1, tipo, detalle, usuarioId: sesion.usuarioId, fuera: true, ocurrioEn: inicioDelDia(dia, c.zona) });
      await enPapel("registrar", carga.registradoEnPapel, {});
      if (carga.correccion) {
        await enPapel("corregir", diaDeLaCorreccion, { requerida: carga.correccion.requerida, implementadaEn: carga.correccion.implementadaEn });
      }
      await enPapel("aprobar_plan", carga.aprobacion.fecha, { huella, plan, aprobadoRol: rol, aprobadoPor });
      return { id: h.id, codigo: h.codigo };
    }),
  );
}
