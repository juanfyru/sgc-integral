/**
 * La pasada de vencimientos de mejoramiento (spec 15 §14.3, Tarea 19): los pasos vencidos de un hallazgo, de un reporte y de un
 * ajuste, las actividades vencidas, el escalamiento al jefe sin contenido, el recordatorio de seguimiento y la eficacia por
 * evaluar, con sus marcas. Cada caso silencia antes lo que ya hay en la base (la de trabajo trae hallazgos con pasos vencidos) y
 * los demás módulos, dentro de una transacción que se revierte, y cuenta solo lo suyo.
 */
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { obtenerSql } from "@/db/cliente";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { decidirAjuste, pedirAjuste } from "@/db/consultas/mejoramiento/ajustes";
import { registrarSeguimiento } from "@/db/consultas/mejoramiento/actividades";
import { registrarCorreccion } from "@/db/consultas/mejoramiento/recorrido";
import { enviarReporte } from "@/db/consultas/mejoramiento/reportes";
import { revisarVencimientosDeMejoramiento } from "@/db/consultas/mejoramiento/vencimientos";
import { verificarImplementacion } from "@/db/consultas/mejoramiento/verificacion";
import { revisarVencimientos } from "@/db/consultas/vencimientos";
import { silenciarDistribucion } from "./utiles/distribucion";
import { silenciarIndicadores } from "./utiles/indicadores";
import {
  baseDeMejora,
  c,
  evidenciaDeCorreccion,
  HORA_DE_ESCENA,
  hallazgoEn,
  silenciarMejoramiento,
  terminarTodas,
} from "./utiles/mejoramiento";
import { silenciarImpactos } from "./utiles/normograma";
import { revertida } from "./utiles/transaccion";
import { usuarioDePrueba } from "./utiles/tramites";
import { silenciarRevisionAnual, silenciarVigencia } from "./utiles/vigencia";

const sql = obtenerSql();
afterAll(() => sql.end());

const TITULO = "Formatos de entrega de turno sin diligenciar";
const ACTIVIDAD = "Actividad 1 del plan de prueba";

/** Lo que ya hay en la base, de todos los módulos, queda sin nada que avisar: el test cuenta solo lo suyo. */
async function silenciarTodo(tx: TransactionSql): Promise<void> {
  await tx`UPDATE tramites SET aviso_vencido_en = coalesce(aviso_vencido_en, now()), escalado_en = coalesce(escalado_en, now())`;
  await silenciarDistribucion(tx);
  await silenciarVigencia(tx);
  await silenciarImpactos(tx);
  await silenciarRevisionAnual(tx);
  await silenciarIndicadores(tx);
  await silenciarMejoramiento(tx);
}

async function pasada(tx: TransactionSql, ahora: string) {
  return revisarVencimientosDeMejoramiento({ sql: tx, ahora: new Date(ahora), config: await obtenerConfigDocumental({ sql: tx }) });
}

/** Los avisos de ese tipo sobre esa entidad. */
const avisos = (tx: TransactionSql, tipo: string, entidad: string, id: number) =>
  tx`SELECT usuario_id, titulo, cuerpo, enlace, entidad, entidad_id FROM notificaciones
    WHERE tipo = ${tipo} AND entidad = ${entidad} AND entidad_id = ${id} ORDER BY id`;

const actividadDe = async (tx: TransactionSql, hallazgoId: number) =>
  Number((await tx`SELECT id FROM mejora_actividades WHERE hallazgo_id = ${hallazgoId} ORDER BY id LIMIT 1`)[0].id);

// El 17 de noviembre (`HORA_DE_ESCENA`) nacen los pasos: el de 3 días hábiles vence al final del viernes 20.
const LUNES_23 = "2026-11-23T15:00:00Z";

describe("revisarVencimientosDeMejoramiento", () => {
  it("silenciarMejoramiento deja la base sin nada que avisar, también años después", () =>
    revertida(sql, async (tx) => {
      await silenciarTodo(tx);
      expect(await pasada(tx, "2030-06-03T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 });
    }));

  it("la pasada es idempotente: la primera avisa una vez por paso vencido y la segunda, cero", () =>
    revertida(sql, async (tx) => {
      await silenciarTodo(tx);
      const b = await baseDeMejora(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const o = c(HORA_DE_ESCENA, tx);
      const porCorregir = await hallazgoEn(tx, b, "por_corregir");
      const { id: reporteId } = await enviarReporte(b.consulta, { descripcion: "Vi la nevera de vacunas abierta en el turno", vistoEn: "2026-11-16" }, o);
      const enEjecucion = await hallazgoEn(tx, b, "en_ejecucion", undefined, { responsableId: responsable.usuarioId, fin: "2026-11-19" });
      const actividadId = await actividadDe(tx, enEjecucion.id);
      await pedirAjuste(
        b.lider,
        { hallazgoId: enEjecucion.id, tipo: "reprogramar", actividadId, finNuevo: "2026-12-30", causa: "El proveedor no entrega antes" },
        o,
      );
      expect(await pasada(tx, "2026-11-20T15:00:00Z")).toEqual({ avisados: 1, escalados: 0 }); // solo la actividad, que terminaba el 19
      expect(await pasada(tx, LUNES_23)).toEqual({ avisados: 3, escalados: 0 }); // el paso, el reporte y el ajuste
      expect(await pasada(tx, "2026-11-23T16:00:00Z")).toEqual({ avisados: 0, escalados: 0 });

      const delPaso = await avisos(tx, "mejora.vencido", "mejora_hallazgo", porCorregir.id);
      expect(delPaso).toEqual([
        {
          usuario_id: b.lider.usuarioId,
          titulo: `Venció el plazo para registrar la corrección de ${porCorregir.codigo}`,
          cuerpo: TITULO,
          enlace: `/mejoramiento/${porCorregir.id}`,
          entidad: "mejora_hallazgo",
          entidad_id: porCorregir.id,
        },
      ]);
      const delReporte = await avisos(tx, "mejora.vencido", "mejora_reporte", reporteId);
      expect(delReporte.map((a) => Number(a.usuario_id))).toContain(b.admin.usuarioId);
      expect(delReporte[0]).toMatchObject({ titulo: `Venció el plazo para clasificar el reporte n.º ${reporteId}`, enlace: "/mejoramiento/reportes?vista=recibidos" });
      const delAjuste = await avisos(tx, "mejora.vencido", "mejora_hallazgo", enEjecucion.id);
      expect(delAjuste.map((a) => Number(a.usuario_id))).toContain(b.admin.usuarioId);
      expect(delAjuste.map((a) => Number(a.usuario_id))).not.toContain(b.lider.usuarioId); // lo pidió: no lo decide
      expect(delAjuste[0].titulo).toBe(`Venció el plazo para decidir un ajuste de ${enEjecucion.codigo}`);
      expect(await avisos(tx, "mejora.actividad_vencida", "mejora_actividad", actividadId)).toEqual([
        {
          usuario_id: responsable.usuarioId,
          titulo: `Venció la actividad A1.1 de ${enEjecucion.codigo}`,
          cuerpo: `${ACTIVIDAD}. Venció el 19 de noviembre.`,
          enlace: `/mejoramiento/actividades/${actividadId}`,
          entidad: "mejora_actividad",
          entidad_id: actividadId,
        },
      ]);
    }));

  it("el aviso al jefe no lleva contenido, y se escala solo pasados los días de escalamientoDias", () =>
    revertida(sql, async (tx) => {
      await silenciarTodo(tx);
      const b = await baseDeMejora(tx);
      const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
      const jefeDelLider = await usuarioDePrueba(tx, { rol: "consulta" });
      const responsable = await usuarioDePrueba(tx, { rol: "consulta", jefeId: jefe.usuarioId });
      await tx`UPDATE usuarios SET jefe_inmediato_id = ${jefeDelLider.usuarioId} WHERE id = ${b.lider.usuarioId}`;
      const conActividad = await hallazgoEn(tx, b, "en_ejecucion", undefined, { responsableId: responsable.usuarioId, fin: "2026-11-19" });
      const porCorregir = await hallazgoEn(tx, b, "por_corregir");
      // El domingo 22: la actividad lleva 3 días vencida y el paso 2; nada se escala todavía.
      expect(await pasada(tx, "2026-11-22T15:00:00Z")).toEqual({ avisados: 2, escalados: 0 });
      expect(await pasada(tx, LUNES_23)).toEqual({ avisados: 0, escalados: 1 }); // la actividad: 4 días
      expect(await pasada(tx, "2026-11-24T15:00:00Z")).toEqual({ avisados: 0, escalados: 1 }); // el paso: 4 días
      expect(await pasada(tx, "2026-11-25T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 });

      const alJefe = await tx`SELECT tipo, titulo, cuerpo, enlace, entidad, entidad_id FROM notificaciones WHERE usuario_id = ${jefe.usuarioId}`;
      expect(alJefe).toEqual([
        {
          tipo: "mejora.escalado",
          titulo: "Una actividad de mejoramiento sigue vencida",
          cuerpo: `A cargo de ${responsable.nombre}. Venció hace 4 días.`,
          enlace: null,
          entidad: "usuario",
          entidad_id: responsable.usuarioId,
        },
      ]);
      const alDelLider = await tx`SELECT tipo, titulo, cuerpo, enlace, entidad, entidad_id FROM notificaciones WHERE usuario_id = ${jefeDelLider.usuarioId}`;
      expect(alDelLider).toEqual([
        {
          tipo: "mejora.escalado",
          titulo: "Un paso de mejoramiento sigue vencido",
          cuerpo: `A cargo de ${b.lider.nombre}. Venció hace 4 días.`,
          enlace: null,
          entidad: "usuario",
          entidad_id: b.lider.usuarioId,
        },
      ]);
      for (const a of [...alJefe, ...alDelLider]) {
        const texto = `${a.titulo} ${a.cuerpo}`;
        for (const prohibido of [conActividad.codigo, porCorregir.codigo, TITULO, ACTIVIDAD, "A1.1"]) expect(texto).not.toContain(prohibido);
      }
    }));

  it("sin jefe no se marca: la fila sigue siendo candidata en la pasada siguiente", () =>
    revertida(sql, async (tx) => {
      await silenciarTodo(tx);
      const b = await baseDeMejora(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const h = await hallazgoEn(tx, b, "en_ejecucion", undefined, { responsableId: responsable.usuarioId, fin: "2026-11-19" });
      const actividadId = await actividadDe(tx, h.id);
      expect(await pasada(tx, "2026-11-25T15:00:00Z")).toEqual({ avisados: 1, escalados: 0 });
      expect(await pasada(tx, "2026-11-26T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 });
      const [sinMarca] = await tx`SELECT escalado_en FROM mejora_actividades WHERE id = ${actividadId}`;
      expect(sinMarca.escalado_en).toBeNull();
      const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
      await tx`UPDATE usuarios SET jefe_inmediato_id = ${jefe.usuarioId} WHERE id = ${responsable.usuarioId}`;
      expect(await pasada(tx, "2026-11-27T15:00:00Z")).toEqual({ avisados: 0, escalados: 1 });
      const [marcada] = await tx`SELECT escalado_en FROM mejora_actividades WHERE id = ${actividadId}`;
      expect(marcada.escalado_en).toEqual(new Date("2026-11-27T15:00:00Z"));
    }));

  it("el recordatorio: a los 15 días en una no conformidad de criticidad alta y a los 30 en las demás; se repite y un seguimiento lo reinicia", () =>
    revertida(sql, async (tx) => {
      await silenciarTodo(tx);
      const b = await baseDeMejora(tx);
      const deAlta = await usuarioDePrueba(tx, { rol: "consulta" });
      const deMedia = await usuarioDePrueba(tx, { rol: "consulta" });
      // Del 17 de noviembre al 31 de marzo: ninguna vence en la prueba.
      const alta = await hallazgoEn(tx, b, "en_ejecucion", { criticidad: "alta" }, { responsableId: deAlta.usuarioId, fin: "2027-03-31" });
      const media = await hallazgoEn(tx, b, "en_ejecucion", undefined, { responsableId: deMedia.usuarioId, fin: "2027-03-31" });
      const actividadAlta = await actividadDe(tx, alta.id);
      const actividadMedia = await actividadDe(tx, media.id);
      expect(await pasada(tx, "2026-12-01T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 });
      expect(await pasada(tx, "2026-12-02T15:00:00Z")).toEqual({ avisados: 1, escalados: 0 }); // 15 días desde el inicio
      expect(await pasada(tx, "2026-12-03T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 });
      expect(await pasada(tx, "2026-12-16T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 });
      expect(await pasada(tx, "2026-12-17T15:00:00Z")).toEqual({ avisados: 2, escalados: 0 }); // 15 más en la alta; 30 en la media
      expect(await avisos(tx, "mejora.recordatorio", "mejora_actividad", actividadAlta)).toHaveLength(2);
      const [recordatorio] = await avisos(tx, "mejora.recordatorio", "mejora_actividad", actividadMedia);
      expect(recordatorio).toMatchObject({
        usuario_id: deMedia.usuarioId,
        titulo: `Registre el seguimiento de la actividad A1.1 de ${media.codigo}`,
        cuerpo: `${ACTIVIDAD}. Lleva 30 días o más sin un seguimiento.`,
        enlace: `/mejoramiento/actividades/${actividadMedia}`,
      });
      await registrarSeguimiento(
        deAlta,
        { actividadId: actividadAlta, fecha: "2026-12-10", realizado: "Se capacitó al turno de noche en el registro", avance: 40 },
        c("2026-12-20T15:00:00Z", tx),
      );
      // El seguimiento se registró el 20, aunque diga lo que se hizo el 10: cuenta desde el 20.
      expect(await pasada(tx, "2027-01-03T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 });
      expect(await pasada(tx, "2027-01-04T15:00:00Z")).toEqual({ avisados: 1, escalados: 0 });
      expect(await avisos(tx, "mejora.recordatorio", "mejora_actividad", actividadAlta)).toHaveLength(3);
    }));

  it("una transición borra las marcas del paso anterior", () =>
    revertida(sql, async (tx) => {
      await silenciarTodo(tx);
      const b = await baseDeMejora(tx);
      const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
      await tx`UPDATE usuarios SET jefe_inmediato_id = ${jefe.usuarioId} WHERE id = ${b.lider.usuarioId}`;
      const h = await hallazgoEn(tx, b, "por_corregir");
      expect(await pasada(tx, "2026-11-25T15:00:00Z")).toEqual({ avisados: 1, escalados: 1 });
      const [marcado] = await tx`SELECT aviso_vencido_en, escalado_en FROM mejora_hallazgos WHERE id = ${h.id}`;
      expect(marcado).toEqual({ aviso_vencido_en: new Date("2026-11-25T15:00:00Z"), escalado_en: new Date("2026-11-25T15:00:00Z") });
      await evidenciaDeCorreccion(tx, h.id, b.lider.usuarioId);
      await registrarCorreccion(
        b.lider,
        { hallazgoId: h.id, requerida: true, descripcion: "Se diligenciaron los formatos", responsableId: b.lider.usuarioId, implementadaEn: "2026-11-24" },
        c("2026-11-25T16:00:00Z", tx),
      );
      const [limpio] = await tx`SELECT estado, aviso_vencido_en, escalado_en FROM mejora_hallazgos WHERE id = ${h.id}`;
      expect(limpio).toEqual({ estado: "por_decidir", aviso_vencido_en: null, escalado_en: null });
      // «Por decidir» vence el lunes 30: el 1 de diciembre se avisa otra vez, ahora a quien decide.
      expect(await pasada(tx, "2026-12-01T15:00:00Z")).toEqual({ avisados: 1, escalados: 0 });
      expect((await avisos(tx, "mejora.vencido", "mejora_hallazgo", h.id)).map((a) => Number(a.usuario_id))).toContain(b.admin.usuarioId);
    }));

  it("una devolución de la verificación borra las marcas de la actividad: vuelve a avisar pasada su fecha para corregir", () =>
    revertida(sql, async (tx) => {
      await silenciarTodo(tx);
      const b = await baseDeMejora(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const enEjecucion = await hallazgoEn(tx, b, "en_ejecucion", undefined, { responsableId: responsable.usuarioId, fin: "2026-11-19" });
      const actividadId = await actividadDe(tx, enEjecucion.id);
      expect(await pasada(tx, "2026-12-02T15:00:00Z")).toEqual({ avisados: 1, escalados: 0 });
      await terminarTodas(tx, b, enEjecucion.id, "2026-12-02T16:00:00Z");
      await verificarImplementacion(
        b.control,
        {
          hallazgoId: enEjecucion.id,
          actividades: [{ id: actividadId, conforme: false, nota: "Falta la firma del jefe de enfermería", corregirAntesDe: "2026-12-04" }],
          metodos: ["evidencias"],
        },
        c("2026-12-02T17:00:00Z", tx),
      );
      const [devuelta] = await tx`SELECT aviso_vencido_en, escalado_en FROM mejora_actividades WHERE id = ${actividadId}`;
      expect(devuelta).toEqual({ aviso_vencido_en: null, escalado_en: null });
      expect(await pasada(tx, "2026-12-04T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 }); // hasta el 4 para corregir
      expect(await pasada(tx, "2026-12-05T15:00:00Z")).toEqual({ avisados: 1, escalados: 0 });
      expect(await avisos(tx, "mejora.actividad_vencida", "mejora_actividad", actividadId)).toHaveLength(2);
    }));

  it("la actividad con un ajuste pendiente sigue avisando como vencida; aprobado el ajuste, deja de hacerlo", () =>
    revertida(sql, async (tx) => {
      await silenciarTodo(tx);
      const b = await baseDeMejora(tx);
      const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
      const responsable = await usuarioDePrueba(tx, { rol: "consulta", jefeId: jefe.usuarioId });
      const h = await hallazgoEn(tx, b, "en_ejecucion", undefined, { responsableId: responsable.usuarioId, fin: "2026-11-19" });
      const actividadId = await actividadDe(tx, h.id);
      const { id: ajusteId } = await pedirAjuste(
        responsable,
        { hallazgoId: h.id, tipo: "reprogramar", actividadId, finNuevo: "2026-12-30", causa: "El proveedor no entrega antes del 30" },
        c("2026-11-20T15:00:00Z", tx),
      );
      // Con el ajuste por decidir (vence el miércoles 25), la actividad sigue vencida: avisa y, a los 4 días, escala.
      expect(await pasada(tx, "2026-11-20T16:00:00Z")).toEqual({ avisados: 1, escalados: 0 });
      expect(await pasada(tx, LUNES_23)).toEqual({ avisados: 0, escalados: 1 });
      await decidirAjuste(b.admin, { ajusteId, aprueba: true, nota: "Se aprueba con la fecha que da el proveedor" }, c("2026-11-24T15:00:00Z", tx));
      const [reprogramada] = await tx`SELECT to_char(fin, 'YYYY-MM-DD') AS fin, aviso_vencido_en, escalado_en FROM mejora_actividades WHERE id = ${actividadId}`;
      expect(reprogramada).toEqual({ fin: "2026-12-30", aviso_vencido_en: null, escalado_en: null });
      expect(await pasada(tx, "2026-11-30T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 });
      expect(await avisos(tx, "mejora.actividad_vencida", "mejora_actividad", actividadId)).toHaveLength(1);
    }));

  it("un ajuste vencido avisa a quien lo decide y nunca se escala (R3); un reporte vencido sí", () =>
    revertida(sql, async (tx) => {
      await silenciarTodo(tx);
      const b = await baseDeMejora(tx);
      const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
      await tx`UPDATE usuarios SET jefe_inmediato_id = ${jefe.usuarioId} WHERE id = ${b.admin.usuarioId}`;
      const o = c(HORA_DE_ESCENA, tx);
      const h = await hallazgoEn(tx, b, "en_ejecucion");
      const actividadId = await actividadDe(tx, h.id);
      await pedirAjuste(
        b.lider,
        { hallazgoId: h.id, tipo: "reprogramar", actividadId, finNuevo: "2026-12-30", causa: "El proveedor no entrega antes" },
        o,
      );
      const { id: reporteId } = await enviarReporte(b.consulta, { descripcion: "Vi la nevera de vacunas abierta en el turno", vistoEn: "2026-11-16" }, o);
      // Los dos vencieron el viernes 20: el 30 llevan 10 días.
      expect(await pasada(tx, "2026-11-30T15:00:00Z")).toEqual({ avisados: 2, escalados: 1 });
      expect(await pasada(tx, "2026-12-07T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 });
      const alJefe = await tx`SELECT tipo, titulo, cuerpo, entidad, entidad_id FROM notificaciones WHERE usuario_id = ${jefe.usuarioId}`;
      expect(alJefe).toEqual([
        {
          tipo: "mejora.escalado",
          titulo: "Un paso de mejoramiento sigue vencido",
          cuerpo: `A cargo de ${b.admin.nombre}. Venció hace 10 días.`,
          entidad: "usuario",
          entidad_id: b.admin.usuarioId,
        },
      ]);
      expect(`${alJefe[0].titulo} ${alJefe[0].cuerpo}`).not.toContain(String(reporteId));
      expect(await avisos(tx, "mejora.vencido", "mejora_hallazgo", h.id)).not.toHaveLength(0);
    }));

  it("la actividad vencida de un responsable inactivo avisa a los líderes del proceso, para reasignarla", () =>
    revertida(sql, async (tx) => {
      await silenciarTodo(tx);
      const b = await baseDeMejora(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const h = await hallazgoEn(tx, b, "en_ejecucion", undefined, { responsableId: responsable.usuarioId, fin: "2026-11-19" });
      const actividadId = await actividadDe(tx, h.id);
      await tx`UPDATE usuarios SET activo = false WHERE id = ${responsable.usuarioId}`;
      expect(await pasada(tx, "2026-11-20T15:00:00Z")).toEqual({ avisados: 1, escalados: 0 });
      expect(await avisos(tx, "mejora.actividad_vencida", "mejora_actividad", actividadId)).toEqual([
        {
          usuario_id: b.lider.usuarioId,
          titulo: `Venció la actividad A1.1 de ${h.codigo} y su responsable ya no está activo`,
          cuerpo: `${ACTIVIDAD}. Venció el 19 de noviembre. Reasígnela.`,
          enlace: `/mejoramiento/${h.id}`,
          entidad: "mejora_actividad",
          entidad_id: actividadId,
        },
      ]);
    }));

  it("la eficacia por evaluar avisa a quien puede verificar desde la fecha mínima y, vencido su plazo, como un paso vencido", () =>
    revertida(sql, async (tx) => {
      await silenciarTodo(tx);
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "en_espera");
      // R es el 17 de noviembre: la fecha mínima, el domingo 17 de enero; el plazo de evaluar, cinco días hábiles, el viernes 22.
      expect(await pasada(tx, "2027-01-16T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 });
      expect(await pasada(tx, "2027-01-17T15:00:00Z")).toEqual({ avisados: 1, escalados: 0 });
      const porEvaluar = await avisos(tx, "mejora.por_evaluar", "mejora_hallazgo", h.id);
      expect(porEvaluar.map((a) => Number(a.usuario_id))).toContain(b.control.usuarioId);
      expect(porEvaluar.map((a) => Number(a.usuario_id))).not.toContain(b.lider.usuarioId);
      expect(porEvaluar[0]).toMatchObject({ titulo: `Ya se puede evaluar la eficacia de ${h.codigo}`, cuerpo: TITULO });
      expect(await pasada(tx, "2027-01-18T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 });
      expect(await pasada(tx, "2027-01-22T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 });
      expect(await pasada(tx, "2027-01-25T15:00:00Z")).toEqual({ avisados: 1, escalados: 0 });
      const [vencido] = await avisos(tx, "mejora.vencido", "mejora_hallazgo", h.id);
      expect(vencido.titulo).toBe(`Venció el plazo para evaluar la eficacia de ${h.codigo}`);
    }));
});

describe("revisarVencimientos", () => {
  it("suma lo de mejoramiento a su total", () =>
    revertida(sql, async (tx) => {
      await silenciarTodo(tx);
      expect(await revisarVencimientos({ sql: tx, ahora: new Date(LUNES_23) })).toEqual({ avisados: 0, escalados: 0 });
      const b = await baseDeMejora(tx);
      await hallazgoEn(tx, b, "por_corregir");
      expect(await revisarVencimientos({ sql: tx, ahora: new Date("2026-11-23T16:00:00Z") })).toEqual({ avisados: 1, escalados: 0 });
    }));
});
