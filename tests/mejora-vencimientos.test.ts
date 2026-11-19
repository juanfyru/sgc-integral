/**
 * La pasada de vencimientos de mejoramiento (spec 15 §14.3, Tarea 19): los pasos vencidos de un hallazgo, de un reporte y de un
 * ajuste, las actividades vencidas, el escalamiento al jefe sin contenido, el recordatorio de seguimiento y la eficacia por
 * evaluar, con sus marcas. Cada caso silencia antes lo que ya hay en la base (la de trabajo trae hallazgos con pasos vencidos) y
 * los demás módulos, dentro de una transacción que se revierte, y cuenta solo lo suyo.
 */
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

// El gancho «entre la lista y el candado» (ronda 1, punto 5): `correrPaso` real, con algo que pasa después de resolver a quién
// avisar y antes de la transacción del candado. Sin gancho, la pasada de siempre.
const { entreLaListaYElCandado } = vi.hoisted(() => ({ entreLaListaYElCandado: { una: null as null | (() => Promise<unknown>) } }));
vi.mock("@/db/consultas/indicadores/pasada", async (original) => {
  const real = await original<typeof import("@/db/consultas/indicadores/pasada")>();
  return {
    ...real,
    correrPaso: ((c, paso) =>
      real.correrPaso(c, {
        ...paso,
        resolver: async (ctx, candidatas) => {
          const resueltos = await paso.resolver(ctx, candidatas);
          const gancho = entreLaListaYElCandado.una;
          entreLaListaYElCandado.una = null;
          if (gancho) await gancho();
          return resueltos;
        },
      })) as typeof real.correrPaso,
  };
});

import { obtenerSql } from "@/db/cliente";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { decidirAjuste, escalarAGerencia, pedirAjuste, SOLO_VENCIDA } from "@/db/consultas/mejoramiento/ajustes";
import { leerActividad, misActividades, reasignarActividad, registrarSeguimiento } from "@/db/consultas/mejoramiento/actividades";
import { leerHallazgo, listarHallazgos } from "@/db/consultas/mejoramiento/lectura";
import { registrarCorreccion } from "@/db/consultas/mejoramiento/recorrido";
import { enviarReporte } from "@/db/consultas/mejoramiento/reportes";
import { revisarVencimientosDeMejoramiento } from "@/db/consultas/mejoramiento/vencimientos";
import { verificarImplementacion } from "@/db/consultas/mejoramiento/verificacion";
import { revisarVencimientos } from "@/db/consultas/vencimientos";
import { silenciarDistribucion } from "./utiles/distribucion";
import { silenciarIndicadores } from "./utiles/indicadores";
import { cargarHallazgo } from "@/db/consultas/mejoramiento/carga";
import { anularHallazgo } from "@/db/consultas/mejoramiento/registro";
import {
  baseDeMejora,
  c,
  datosDeCarga,
  escaneoDeLaCarga,
  evidenciaDeCorreccion,
  HORA_DE_ESCENA,
  hallazgoEn,
  silenciarMejoramiento,
  terminarTodas,
  tramiteEnlazado,
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
      // Ni el número del reporte ni que lo hay. No se busca la cifra suelta: un id de una cifra está en «hace 10 días» o en
      // el nombre de una persona de prueba («Prueba 48»), y la base recién sembrada da ids bajos.
      expect(`${alJefe[0].titulo} ${alJefe[0].cuerpo}`).not.toContain(`n.º ${reporteId}`);
      expect(`${alJefe[0].titulo} ${alJefe[0].cuerpo}`).not.toMatch(/reporte/i);
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

describe("una sola regla de «actividad vencida» (ronda 1, punto 1)", () => {
  const LUNES = "2026-11-23T15:00:00Z";

  /** Una actividad devuelta el 18 de noviembre con su fecha para corregir, de un hallazgo «En ejecución». */
  async function devuelta(tx: TransactionSql, fin: string, corregirAntesDe: string) {
    const b = await baseDeMejora(tx);
    const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
    const h = await hallazgoEn(tx, b, "en_ejecucion", undefined, { responsableId: responsable.usuarioId, fin });
    const actividadId = await actividadDe(tx, h.id);
    await terminarTodas(tx, b, h.id, HORA_DE_ESCENA);
    await verificarImplementacion(
      b.control,
      { hallazgoId: h.id, actividades: [{ id: actividadId, conforme: false, nota: "Falta la firma del jefe de enfermería", corregirAntesDe }], metodos: ["evidencias"] },
      c("2026-11-18T15:00:00Z", tx),
    );
    return { b, responsable, h, actividadId };
  }

  /** Lo que dicen de la actividad «Mis actividades», su página y la del hallazgo (el `vence` con que la pinta). */
  async function loQueSeVe(tx: TransactionSql, x: Awaited<ReturnType<typeof devuelta>>) {
    const o = c(LUNES, tx);
    const propia = (await misActividades(x.responsable, o)).find((a) => a.id === x.actividadId);
    const pagina = await leerActividad(x.responsable, x.actividadId, o);
    const detalle = await leerHallazgo(x.b.admin, x.h.id, o);
    const enElPlan = detalle?.rondas.flatMap((r) => r.acciones.flatMap((ac) => ac.actividades)).find((a) => a.id === x.actividadId);
    return { mis: propia?.vencida, pagina: pagina?.vencida, vence: enElPlan?.vence, marca: detalle?.marcas.includes("Con algo vencido") };
  }

  it("devuelta con el fin pasado y la fecha para corregir por venir: a tiempo en todas partes, y no se escala", () =>
    revertida(sql, async (tx) => {
      const x = await devuelta(tx, "2026-11-19", "2026-11-27");
      expect(await loQueSeVe(tx, x)).toEqual({ mis: false, pagina: false, vence: "2026-11-27", marca: false });
      // La página ofrece «Escalar a Gerencia» solo con `vence` antes de hoy; el servidor tampoco lo acepta.
      await expect(
        escalarAGerencia(x.b.admin, { actividadId: x.actividadId, nota: "Lleva días vencida y nadie responde" }, c(LUNES, tx)),
      ).rejects.toThrow(SOLO_VENCIDA);
    }));

  it("devuelta con la fecha para corregir ya pasada y el fin por venir: vencida en todas partes, y se escala", () =>
    revertida(sql, async (tx) => {
      const x = await devuelta(tx, "2026-12-15", "2026-11-20");
      expect(await loQueSeVe(tx, x)).toEqual({ mis: true, pagina: true, vence: "2026-11-20", marca: true });
      await escalarAGerencia(x.b.admin, { actividadId: x.actividadId, nota: "Lleva días vencida y nadie responde" }, c(LUNES, tx));
      const [a] = await tx`SELECT gerencia_en FROM mejora_actividades WHERE id = ${x.actividadId}`;
      expect(a.gerencia_en).toEqual(new Date(LUNES));
    }));
});

describe("lo que cambió entre la lista y el candado, y la reasignación (ronda 1, puntos 5 y 6)", () => {
  it("el aviso de una actividad va a quien la tiene ahora: reasignada entre la lista y el candado, se salta sin marca", () =>
    revertida(sql, async (tx) => {
      await silenciarTodo(tx);
      const b = await baseDeMejora(tx);
      const antes = await usuarioDePrueba(tx, { rol: "consulta" });
      const despues = await usuarioDePrueba(tx, { rol: "consulta" });
      const h = await hallazgoEn(tx, b, "en_ejecucion", undefined, { responsableId: antes.usuarioId, fin: "2026-11-19" });
      const actividadId = await actividadDe(tx, h.id);
      entreLaListaYElCandado.una = () => tx`UPDATE mejora_actividades SET responsable_id = ${despues.usuarioId} WHERE id = ${actividadId}`;
      expect(await pasada(tx, "2026-11-20T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 });
      const [sinMarca] = await tx`SELECT aviso_vencido_en FROM mejora_actividades WHERE id = ${actividadId}`;
      expect(sinMarca.aviso_vencido_en).toBeNull();
      expect(await avisos(tx, "mejora.actividad_vencida", "mejora_actividad", actividadId)).toEqual([]);
      expect(await pasada(tx, "2026-11-20T16:00:00Z")).toEqual({ avisados: 1, escalados: 0 });
      expect((await avisos(tx, "mejora.actividad_vencida", "mejora_actividad", actividadId)).map((a) => a.usuario_id)).toEqual([despues.usuarioId]);
    }));

  it("reasignar no adelanta el recordatorio: cuenta desde la reasignación", () =>
    revertida(sql, async (tx) => {
      await silenciarTodo(tx);
      const b = await baseDeMejora(tx);
      const antes = await usuarioDePrueba(tx, { rol: "consulta" });
      const despues = await usuarioDePrueba(tx, { rol: "consulta" });
      // Del 17 de noviembre al 31 de marzo, sin seguimientos: el recordatorio tocaba el 17 de diciembre.
      const h = await hallazgoEn(tx, b, "en_ejecucion", undefined, { responsableId: antes.usuarioId, fin: "2027-03-31" });
      const actividadId = await actividadDe(tx, h.id);
      await reasignarActividad(
        b.lider,
        { actividadId, responsableId: despues.usuarioId, motivo: "Quien la tenía pasó a otro servicio del hospital" },
        c("2026-12-20T15:00:00Z", tx),
      );
      expect(await pasada(tx, "2026-12-21T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 });
      expect(await pasada(tx, "2027-01-18T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 });
      expect(await pasada(tx, "2027-01-19T15:00:00Z")).toEqual({ avisados: 1, escalados: 0 });
      expect((await avisos(tx, "mejora.recordatorio", "mejora_actividad", actividadId)).map((a) => a.usuario_id)).toEqual([despues.usuarioId]);
    }));
});

describe("«Con algo vencido» de un hallazgo en espera (ronda 1, punto 7)", () => {
  it("cuenta y filtra la evaluación vencida con la regla de la pasada", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "en_espera");
      // La fecha mínima, el domingo 17 de enero; el plazo de evaluar vence al final del viernes 22.
      const lista = async (ahora: string) => {
        const o = { sql: tx, ahora: new Date(ahora) };
        const l = await listarHallazgos(b.lider, { procesoId: b.procesoId }, o);
        const vencidos = await listarHallazgos(b.lider, { procesoId: b.procesoId, soloVencidos: true }, o);
        return { cifra: l.cifras.conAlgoVencido, filtro: vencidos.filas.map((f) => f.id) };
      };
      expect(await lista("2027-01-22T15:00:00Z")).toEqual({ cifra: 0, filtro: [] });
      expect(await lista("2027-01-25T15:00:00Z")).toEqual({ cifra: 1, filtro: [h.id] });
    }));
});

describe("el trámite enlazado que termina (Fase 15B, anexo §9.5)", () => {
  const PASA = "2026-11-19T15:00:00Z";
  const terminados = (tx: TransactionSql, hallazgoId: number) =>
    tx`SELECT detalle, usuario_id FROM mejora_eventos WHERE hallazgo_id = ${hallazgoId} AND tipo = 'tramite_terminado' ORDER BY id`;
  const marcas = (tx: TransactionSql, actividadId: number) =>
    tx`SELECT tramite_id, avisado_en FROM mejora_actividad_tramites WHERE actividad_id = ${actividadId} ORDER BY id`;

  it("avisa una vez a su responsable, con un texto si terminó bien y otro si no; deja el evento y marca el enlace", () =>
    revertida(sql, async (tx) => {
      await silenciarTodo(tx);
      const b = await baseDeMejora(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const h = await hallazgoEn(tx, b, "en_ejecucion", undefined, { responsableId: responsable.usuarioId });
      const actividadId = await actividadDe(tx, h.id);
      const bien = await tramiteEnlazado(tx, { actividadId, usuarioId: b.lider.usuarioId, etapa: "publicado", terminoEn: "2026-11-18T15:00:00Z" });
      const mal = await tramiteEnlazado(tx, { actividadId, usuarioId: b.lider.usuarioId, etapa: "cancelado", terminoEn: "2026-11-18T16:00:00Z" });
      await tramiteEnlazado(tx, { actividadId, usuarioId: b.lider.usuarioId, etapa: "aprobacion" });
      expect(await pasada(tx, PASA)).toEqual({ avisados: 2, escalados: 0 });
      const recibidos = await avisos(tx, "mejora.tramite_terminado", "mejora_actividad", actividadId);
      expect(recibidos.map((a) => Number(a.usuario_id))).toEqual([responsable.usuarioId, responsable.usuarioId]);
      expect(recibidos.every((a) => a.enlace === `/mejoramiento/actividades/${actividadId}`)).toBe(true);
      expect(new Set(recibidos.map((a) => a.titulo)).size).toBe(2);
      // Ni el título del hallazgo ni la descripción de la actividad nombran el documento del trámite.
      for (const a of recibidos) expect(`${a.titulo} ${a.cuerpo}`).not.toContain("Formato de prueba del turno");
      const eventos = await terminados(tx, h.id);
      expect(eventos.map((e) => (e.detalle as { tramiteId: number }).tramiteId)).toEqual([bien.tramiteId, mal.tramiteId]);
      expect(eventos.every((e) => e.usuario_id === null)).toBe(true);
      const filas = await marcas(tx, actividadId);
      expect(filas.map((f) => f.avisado_en !== null)).toEqual([true, true, false]);
      // Lo hace el sistema: sin bitácora. Y la segunda pasada no avisa.
      expect(await pasada(tx, "2026-11-20T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 });
      expect(await avisos(tx, "mejora.tramite_terminado", "mejora_actividad", actividadId)).toHaveLength(2);
      expect(await terminados(tx, h.id)).toHaveLength(2);
    }));

  it("con el responsable inactivo avisa a los líderes del proceso, para reasignarla, una sola vez; sin líder, a los Admin SGC", () =>
    revertida(sql, async (tx) => {
      await silenciarTodo(tx);
      const b = await baseDeMejora(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const h = await hallazgoEn(tx, b, "en_ejecucion", undefined, { responsableId: responsable.usuarioId });
      const actividadId = await actividadDe(tx, h.id);
      const { tramiteId } = await tramiteEnlazado(tx, { actividadId, usuarioId: b.lider.usuarioId, etapa: "publicado", terminoEn: "2026-11-18T15:00:00Z" });
      await tx`UPDATE usuarios SET activo = false WHERE id = ${responsable.usuarioId}`;
      expect(await pasada(tx, PASA)).toEqual({ avisados: 1, escalados: 0 });
      const [aviso, ...mas] = await avisos(tx, "mejora.tramite_terminado", "mejora_actividad", actividadId);
      expect(mas).toHaveLength(0);
      expect(Number(aviso.usuario_id)).toBe(b.lider.usuarioId);
      expect(aviso.titulo).toBe(`El trámite de la actividad A1.1 de ${h.codigo} quedó publicado y su responsable ya no está activo`);
      expect(aviso.cuerpo).toContain("Reasígnela.");
      expect(aviso.enlace).toBe(`/mejoramiento/${h.id}`);
      expect(`${aviso.titulo} ${aviso.cuerpo}`).not.toContain("Formato de prueba del turno");
      const eventos = await terminados(tx, h.id);
      expect(eventos.map((e) => (e.detalle as { tramiteId: number }).tramiteId)).toEqual([tramiteId]);
      expect((await marcas(tx, actividadId))[0].avisado_en).not.toBeNull();
      expect(await pasada(tx, "2026-11-20T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 });
      expect(await avisos(tx, "mejora.tramite_terminado", "mejora_actividad", actividadId)).toHaveLength(1);
      expect(await terminados(tx, h.id)).toHaveLength(1);

      // Sin líder activo en el proceso, a los Admin SGC activos.
      const segundo = await usuarioDePrueba(tx, { rol: "consulta" });
      const otro = await hallazgoEn(tx, b, "en_ejecucion", undefined, { responsableId: segundo.usuarioId });
      const otraActividad = await actividadDe(tx, otro.id);
      await tramiteEnlazado(tx, { actividadId: otraActividad, usuarioId: b.admin.usuarioId, etapa: "cancelado", terminoEn: "2026-11-18T15:00:00Z" });
      await tx`UPDATE usuarios SET activo = false WHERE id IN (${segundo.usuarioId}, ${b.lider.usuarioId})`;
      await pasada(tx, "2026-11-21T15:00:00Z");
      const admins = (await tx`SELECT id FROM usuarios WHERE rol = 'admin_sgc' AND activo ORDER BY id`).map((f) => Number(f.id));
      const recibidos = await avisos(tx, "mejora.tramite_terminado", "mejora_actividad", otraActividad);
      expect(recibidos.map((a) => Number(a.usuario_id))).toEqual(admins);
      expect(recibidos.map((a) => Number(a.usuario_id))).toContain(b.admin.usuarioId);
      expect(recibidos.every((a) => a.titulo === `El trámite de la actividad A1.1 de ${otro.codigo} terminó sin publicarse y su responsable ya no está activo`)).toBe(true);
    }));

  it("con la actividad ya terminada o cancelada deja el evento y la marca, sin aviso y sin contarse como avisada", () =>
    revertida(sql, async (tx) => {
      await silenciarTodo(tx);
      const b = await baseDeMejora(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const h = await hallazgoEn(tx, b, "en_ejecucion", undefined, { responsableId: responsable.usuarioId, actividades: 3 });
      const [terminada, cancelada] = (await tx`SELECT id FROM mejora_actividades WHERE hallazgo_id = ${h.id} ORDER BY id`).map((f) => Number(f.id));
      await tx`UPDATE mejora_actividades SET estado = 'terminada', avance = 100, terminada_en = ${new Date(HORA_DE_ESCENA)}, terminada_por = ${responsable.usuarioId}
        WHERE id = ${terminada}`;
      await tx`UPDATE mejora_actividades SET estado = 'cancelada', cancelada_en = ${new Date(HORA_DE_ESCENA)} WHERE id = ${cancelada}`;
      const deLaTerminada = await tramiteEnlazado(tx, { actividadId: terminada, usuarioId: b.lider.usuarioId, etapa: "publicado", terminoEn: "2026-11-18T15:00:00Z" });
      const deLaCancelada = await tramiteEnlazado(tx, { actividadId: cancelada, usuarioId: b.lider.usuarioId, etapa: "rechazado", terminoEn: "2026-11-18T15:00:00Z" });
      expect(await pasada(tx, PASA)).toEqual({ avisados: 0, escalados: 0 });
      for (const actividadId of [terminada, cancelada]) {
        expect(await avisos(tx, "mejora.tramite_terminado", "mejora_actividad", actividadId)).toHaveLength(0);
        expect((await marcas(tx, actividadId))[0].avisado_en).not.toBeNull();
      }
      expect((await terminados(tx, h.id)).map((e) => (e.detalle as { tramiteId: number }).tramiteId)).toEqual([
        deLaTerminada.tramiteId,
        deLaCancelada.tramiteId,
      ]);
      expect(await pasada(tx, "2026-11-20T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 });
      expect(await terminados(tx, h.id)).toHaveLength(2);
    }));

  it("con el hallazgo terminado no avisa ni toca el enlace; con una carga sin su formato, tampoco, hasta que llega", () =>
    revertida(sql, async (tx) => {
      await silenciarTodo(tx);
      const b = await baseDeMejora(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const h = await hallazgoEn(tx, b, "en_ejecucion", undefined, { responsableId: responsable.usuarioId });
      const actividadId = await actividadDe(tx, h.id);
      const { tramiteId } = await tramiteEnlazado(tx, { actividadId, usuarioId: b.lider.usuarioId, etapa: "aprobacion" });
      await anularHallazgo(b.admin, { hallazgoId: h.id, justificacion: "Se registró dos veces el mismo hecho" }, c(HORA_DE_ESCENA, tx));
      await tx`UPDATE tramites SET etapa = 'publicado', cerrado_en = ${new Date("2026-11-18T15:00:00Z")} WHERE id = ${tramiteId}`;
      expect(await pasada(tx, PASA)).toEqual({ avisados: 0, escalados: 0 });
      expect((await marcas(tx, actividadId))[0].avisado_en).toBeNull();
      expect(await terminados(tx, h.id)).toHaveLength(0);
      expect(await avisos(tx, "mejora.tramite_terminado", "mejora_actividad", actividadId)).toHaveLength(0);

      const { id: cargado } = await cargarHallazgo(b.admin, datosDeCarga(b.procesoId, responsable.usuarioId), c(HORA_DE_ESCENA, tx));
      const [deCarga] = await tx`SELECT id FROM mejora_actividades WHERE hallazgo_id = ${cargado} AND estado <> 'terminada' ORDER BY id LIMIT 1`;
      const enCarga = Number(deCarga.id);
      await tramiteEnlazado(tx, { actividadId: enCarga, usuarioId: b.admin.usuarioId, etapa: "publicado", terminoEn: "2026-11-18T15:00:00Z" });
      expect(await pasada(tx, PASA)).toEqual({ avisados: 0, escalados: 0 });
      expect((await marcas(tx, enCarga))[0].avisado_en).toBeNull();
      expect(await avisos(tx, "mejora.tramite_terminado", "mejora_actividad", enCarga)).toHaveLength(0);
      // Con el formato firmado, la pasada siguiente sí avisa.
      await escaneoDeLaCarga(tx, cargado, b.admin.usuarioId, PASA);
      await pasada(tx, "2026-11-20T15:00:00Z");
      expect((await marcas(tx, enCarga))[0].avisado_en).not.toBeNull();
      expect((await avisos(tx, "mejora.tramite_terminado", "mejora_actividad", enCarga)).map((a) => Number(a.usuario_id))).toEqual([
        responsable.usuarioId,
      ]);
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
