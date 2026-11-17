/**
 * El plan de acción en borrador (spec 15 §8.6 y §10, Tarea 12): guardar y quitar acciones con sus actividades, el criterio
 * de eficacia, lo que le falta al plan para enviarse (`examinarPlan`) y los indicadores que se pueden enlazar. Todo dentro
 * de una transacción que se revierte; los ids y los códigos se leen, nunca se suponen.
 */
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { obtenerSql } from "@/db/cliente";
import { guardarAnalisis, guardarCausas, responderPreguntas } from "@/db/consultas/mejoramiento/analisis";
import { contextoDeMejora } from "@/db/consultas/mejoramiento/config";
import { NO_EXISTE } from "@/db/consultas/mejoramiento/flujo";
import { indicadorDeEficacia, indicadoresElegibles } from "@/db/consultas/mejoramiento/indicador-de-eficacia";
import { examinarPlan, guardarAccion, guardarCriterio, quitarAccion, usuariosAsignables } from "@/db/consultas/mejoramiento/plan";
import { anularHallazgo, reclasificarHallazgo } from "@/db/consultas/mejoramiento/registro";
import { fechaMinimaDeEficacia } from "@/lib/mejoramiento/eficacia";
import { huellaDePlan } from "@/lib/mejoramiento/huellas";
import { YA_CAMBIO } from "@/lib/mejoramiento/transiciones";
import type { HallazgoBase } from "@/lib/mejoramiento/tipos";
import { ErrorPermiso } from "@/lib/permisos";
import { indicadorDePrueba } from "./utiles/indicadores";
import { baseDeMejora, c, hallazgoEn, otroProcesoConLider, type BaseDeMejora } from "./utiles/mejoramiento";
import { usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
afterAll(() => sql.end());

// Miércoles 18 de noviembre de 2026, 10:00 en Bogotá: «hoy» es el 18.
const AHORA = "2026-11-18T15:00:00Z";

const actividad = (responsableId: number, cambios?: Partial<{ id: number; descripcion: string; inicio: string; fin: string }>) => ({
  descripcion: "Actualizar el formato de entrega de turno",
  responsableId,
  inicio: "2026-11-20",
  fin: "2026-12-05",
  ...cambios,
});

async function causasDe(tx: TransactionSql, hallazgoId: number): Promise<number[]> {
  const filas = await tx`SELECT id FROM mejora_causas WHERE hallazgo_id = ${hallazgoId} ORDER BY orden, id`;
  return filas.map((f) => Number(f.id));
}

/** Un análisis de 5 porqués, las causas que se pidan y las dos preguntas respondidas. */
async function analisisCompletoDe(tx: TransactionSql, b: BaseDeMejora, h: HallazgoBase, causas = ["El formato no dice quién lo llena"]) {
  const o = c(AHORA, tx);
  await guardarAnalisis(b.lider, { hallazgoId: h.id, metodo: "cinco_porques", contenido: { niveles: [{ respuesta: "Nadie lo asignó" }] } }, o);
  await guardarCausas(b.lider, { hallazgoId: h.id, causas: causas.map((texto) => ({ texto })) }, o);
  await responderPreguntas(
    b.lider,
    { hallazgoId: h.id, similares: false, cambios: { documentos: false, riesgos: false, controles: false } },
    o,
  );
  return causasDe(tx, h.id);
}

const examinar = async (tx: TransactionSql, hallazgoId: number) => examinarPlan(tx, hallazgoId, await contextoDeMejora(tx, new Date(AHORA)));

const contarFilas = async (tx: TransactionSql, hallazgoId: number) => {
  const [f] = await tx`SELECT
      (SELECT count(*) FROM mejora_acciones WHERE hallazgo_id = ${hallazgoId})::int AS acciones,
      (SELECT count(*) FROM mejora_actividades WHERE hallazgo_id = ${hallazgoId})::int AS actividades,
      (SELECT count(*) FROM mejora_accion_causas WHERE hallazgo_id = ${hallazgoId})::int AS vinculos`;
  return f as unknown as { acciones: number; actividades: number; vinculos: number };
};

describe("guardarAccion", () => {
  it("el caso simple: una acción con una actividad, en una llamada; la fecha original queda nula hasta aprobar", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular");
      const [causa] = await analisisCompletoDe(tx, b, h);
      const { id } = await guardarAccion(
        b.lider,
        {
          hallazgoId: h.id,
          tipo: "correctiva",
          descripcion: "Asignar el registro al turno de noche",
          causaIds: [causa],
          indicadorCumplimiento: "Procedimiento publicado",
          meta: "100 %",
          actividades: [actividad(b.lider.usuarioId)],
        },
        c(AHORA, tx),
      );
      const [accion] = await tx`SELECT orden, tipo, descripcion, recursos, indicador_cumplimiento, meta FROM mejora_acciones WHERE id = ${id}`;
      expect(accion).toMatchObject({ orden: 1, tipo: "correctiva", recursos: null, indicador_cumplimiento: "Procedimiento publicado", meta: "100 %" });
      const actividades = await tx`SELECT orden, responsable_id, to_char(inicio, 'YYYY-MM-DD') AS inicio, to_char(fin, 'YYYY-MM-DD') AS fin,
          fin_original, estado, avance
        FROM mejora_actividades WHERE accion_id = ${id}`;
      expect(actividades).toHaveLength(1);
      expect(actividades[0]).toMatchObject({ orden: 1, inicio: "2026-11-20", fin: "2026-12-05", fin_original: null, estado: "abierta", avance: 0 });
      expect(Number(actividades[0].responsable_id)).toBe(b.lider.usuarioId);
      expect(await tx`SELECT causa_id FROM mejora_accion_causas WHERE accion_id = ${id}`).toHaveLength(1);
      // Su evento y su bitácora llevan la etiqueta y la cantidad, nunca el texto de la acción.
      const [evento] = await tx`SELECT detalle FROM mejora_eventos WHERE hallazgo_id = ${h.id} AND tipo = 'accion_guardada'`;
      expect(evento.detalle).toMatchObject({ accion: "A1", actividades: 1 });
      const [bitacora] = await tx`SELECT detalle FROM auditoria WHERE accion = 'mejora_accion_guardada' AND entidad_id = ${h.id}`;
      expect(bitacora.detalle).toMatchObject({ codigo: h.codigo, ronda: 1, accion: "A1", actividades: 1 });
      expect(JSON.stringify(bitacora.detalle)).not.toContain("turno de noche");
    }));

  it("guardar otra vez con su id actualiza la misma acción y conserva el id de cada actividad que llega", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular", { clase: "oportunidad", criticidad: null });
      const o = c(AHORA, tx);
      const d = { hallazgoId: h.id, tipo: "mejora" as const, descripcion: "Unificar el formato", causaIds: [], actividades: [actividad(b.lider.usuarioId)] };
      const { id } = await guardarAccion(b.lider, d, o);
      const [primera] = await tx`SELECT id FROM mejora_actividades WHERE accion_id = ${id}`;
      const otra = await usuarioDePrueba(tx, { rol: "consulta" });
      await guardarAccion(
        b.lider,
        {
          ...d,
          accionId: id,
          descripcion: "Unificar el formato de entrega",
          actividades: [actividad(otra.usuarioId, { id: Number(primera.id), fin: "2026-12-10" }), actividad(b.lider.usuarioId, { descripcion: "Socializar" })],
        },
        o,
      );
      expect(await contarFilas(tx, h.id)).toMatchObject({ acciones: 1, actividades: 2 });
      const filas = await tx`SELECT id, orden, responsable_id, to_char(fin, 'YYYY-MM-DD') AS fin FROM mejora_actividades WHERE accion_id = ${id} ORDER BY orden`;
      expect(Number(filas[0].id)).toBe(Number(primera.id));
      expect(filas[0]).toMatchObject({ orden: 1, fin: "2026-12-10" });
      expect(Number(filas[0].responsable_id)).toBe(otra.usuarioId);
      expect(filas[1].orden).toBe(2);
      // Una actividad que no llega se quita.
      await guardarAccion(b.lider, { ...d, accionId: id, actividades: [actividad(b.lider.usuarioId, { id: Number(filas[1].id) })] }, o);
      const quedan = await tx`SELECT id, orden FROM mejora_actividades WHERE accion_id = ${id}`;
      expect(quedan.map((f) => Number(f.id))).toEqual([Number(filas[1].id)]);
      expect(quedan[0].orden).toBe(1);
    }));

  it("rechaza una acción sin actividades, un inicio posterior al fin, un responsable inactivo y una causa de otra ronda", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular");
      const o = c(AHORA, tx);
      const d = { hallazgoId: h.id, tipo: "correctiva" as const, descripcion: "Asignar el registro", causaIds: [] as number[] };
      await expect(guardarAccion(b.lider, { ...d, actividades: [] }, o)).rejects.toThrow("Toda acción lleva al menos una actividad");
      await expect(
        guardarAccion(b.lider, { ...d, actividades: [actividad(b.lider.usuarioId, { inicio: "2026-12-06", fin: "2026-12-05" })] }, o),
      ).rejects.toThrow("El inicio no puede ser posterior al fin");
      await expect(
        guardarAccion(b.lider, { ...d, actividades: [actividad(b.lider.usuarioId, { fin: "2026-02-30" })] }, o),
      ).rejects.toThrow("Escriba una fecha válida de fin");
      const inactivo = await usuarioDePrueba(tx, { rol: "consulta" });
      await tx`UPDATE usuarios SET activo = false WHERE id = ${inactivo.usuarioId}`;
      await expect(guardarAccion(b.lider, { ...d, actividades: [actividad(inactivo.usuarioId)] }, o)).rejects.toThrow(
        "El responsable debe ser un usuario activo",
      );
      // Una causa de otro hallazgo y una de otra ronda del mismo.
      const otro = await hallazgoEn(tx, b, "por_formular");
      await guardarCausas(b.lider, { hallazgoId: otro.id, causas: [{ texto: "Una causa del otro hallazgo" }] }, o);
      const [ajena] = await causasDe(tx, otro.id);
      await expect(guardarAccion(b.lider, { ...d, causaIds: [ajena], actividades: [actividad(b.lider.usuarioId)] }, o)).rejects.toThrow(
        "Esa causa no es de este hallazgo",
      );
      const [ronda2] = await tx`INSERT INTO mejora_rondas (hallazgo_id, numero) VALUES (${h.id}, 2) RETURNING id`;
      const [deOtraRonda] = await tx`INSERT INTO mejora_causas (hallazgo_id, ronda_id, orden, texto) VALUES (${h.id}, ${ronda2.id}, 1, 'De la ronda 2') RETURNING id`;
      await expect(
        guardarAccion(b.lider, { ...d, causaIds: [Number(deOtraRonda.id)], actividades: [actividad(b.lider.usuarioId)] }, o),
      ).rejects.toThrow("Esa causa no es de este hallazgo");
      expect(await contarFilas(tx, h.id)).toMatchObject({ acciones: 0, actividades: 0 });
    }));

  it("una acción o una actividad que no son de esta ronda se rechazan", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular", { clase: "observacion", criticidad: null });
      const otro = await hallazgoEn(tx, b, "por_formular", { clase: "observacion", criticidad: null });
      const o = c(AHORA, tx);
      const d = { tipo: "preventiva" as const, descripcion: "Revisar el formato", causaIds: [], actividades: [actividad(b.lider.usuarioId)] };
      const ajena = await guardarAccion(b.lider, { ...d, hallazgoId: otro.id }, o);
      await expect(guardarAccion(b.lider, { ...d, hallazgoId: h.id, accionId: ajena.id }, o)).rejects.toThrow("La acción no existe en esta ronda");
      const [actividadAjena] = await tx`SELECT id FROM mejora_actividades WHERE accion_id = ${ajena.id}`;
      const propia = await guardarAccion(b.lider, { ...d, hallazgoId: h.id }, o);
      await expect(
        guardarAccion(b.lider, { ...d, hallazgoId: h.id, accionId: propia.id, actividades: [actividad(b.lider.usuarioId, { id: Number(actividadAjena.id) })] }, o),
      ).rejects.toThrow("Una de las actividades ya no existe: vuelva a cargar la página");
      // Una acción nueva no trae actividades con id.
      await expect(
        guardarAccion(b.lider, { ...d, hallazgoId: h.id, actividades: [actividad(b.lider.usuarioId, { id: Number(actividadAjena.id) })] }, o),
      ).rejects.toThrow("Una de las actividades ya no existe: vuelva a cargar la página");
    }));

  it("quien formula: un líder de otro proceso no lo ve; el Admin SGC con líder en el proceso no formula", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const h = await hallazgoEn(tx, b, "por_formular", { clase: "observacion", criticidad: null });
      const d = { hallazgoId: h.id, tipo: "preventiva" as const, descripcion: "Revisar el formato", causaIds: [], actividades: [actividad(b.lider.usuarioId)] };
      await expect(guardarAccion(otro.lider, d, c(AHORA, tx))).rejects.toThrow(NO_EXISTE);
      await expect(guardarAccion(b.admin, d, c(AHORA, tx))).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(guardarCriterio(b.admin, { hallazgoId: h.id, criterios: ["no_recurrencia"] }, c(AHORA, tx))).rejects.toBeInstanceOf(ErrorPermiso);
    }));

  it("guardar con el hallazgo ya reclasificado (Review Focus 6)", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const o = c(AHORA, tx);
      const d = (hallazgoId: number) => ({
        hallazgoId,
        tipo: "mejora" as const,
        descripcion: "Unificar el formato de entrega",
        causaIds: [],
        actividades: [actividad(b.lider.usuarioId)],
      });
      // Todavía «Por decidir»: no se formula.
      const h = await hallazgoEn(tx, b, "por_decidir");
      await expect(guardarAccion(b.lider, d(h.id), o)).rejects.toThrow(YA_CAMBIO);
      expect((await contarFilas(tx, h.id)).acciones).toBe(0);
      // Reclasificado a oportunidad estando «Por decidir»: queda «Por formular» y se guarda.
      const [f] = await tx`SELECT fuente, titulo, requisito_clausula FROM mejora_hallazgos WHERE id = ${h.id}`;
      await reclasificarHallazgo(
        b.admin,
        {
          hallazgoId: h.id,
          clase: "oportunidad",
          criticidad: null,
          origen: "auditoria_interna",
          fuente: f.fuente as string,
          titulo: f.titulo as string,
          requisitoClausula: f.requisito_clausula as string,
          requisitoNormaId: null,
          requisitoDocumentoId: null,
          reincidenteDe: null,
          fechaLimiteEnte: null,
          nota: null,
          justificacion: "Es una oportunidad, no un incumplimiento",
        },
        o,
      );
      await expect(guardarAccion(b.lider, d(h.id), o)).resolves.toMatchObject({ id: expect.any(Number) });
      // Anulado: ya no se escribe nada.
      const anulado = await hallazgoEn(tx, b, "por_formular");
      await anularHallazgo(b.admin, { hallazgoId: anulado.id, justificacion: "Se registró dos veces" }, o);
      await expect(guardarAccion(b.lider, d(anulado.id), o)).rejects.toThrow(YA_CAMBIO);
      await expect(guardarCriterio(b.lider, { hallazgoId: anulado.id, criterios: ["no_recurrencia"] }, o)).rejects.toThrow(YA_CAMBIO);
      expect(await contarFilas(tx, anulado.id)).toMatchObject({ acciones: 0, actividades: 0, vinculos: 0 });
    }));
});

describe("quitarAccion", () => {
  it("quita la acción con sus actividades y sus causas, y numera otra vez las que quedan", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular");
      const [causa] = await analisisCompletoDe(tx, b, h);
      const o = c(AHORA, tx);
      const base = { hallazgoId: h.id, tipo: "correctiva" as const, causaIds: [causa] };
      const a1 = await guardarAccion(b.lider, { ...base, descripcion: "Primera", actividades: [actividad(b.lider.usuarioId)] }, o);
      const a2 = await guardarAccion(b.lider, { ...base, descripcion: "Segunda", actividades: [actividad(b.lider.usuarioId), actividad(b.lider.usuarioId)] }, o);
      const a3 = await guardarAccion(b.lider, { ...base, descripcion: "Tercera", actividades: [actividad(b.lider.usuarioId)] }, o);
      await quitarAccion(b.lider, { hallazgoId: h.id, accionId: a2.id }, o);
      const quedan = await tx`SELECT id, orden FROM mejora_acciones WHERE hallazgo_id = ${h.id} ORDER BY orden`;
      expect(quedan.map((f) => [Number(f.id), f.orden])).toEqual([[a1.id, 1], [a3.id, 2]]);
      expect(await contarFilas(tx, h.id)).toMatchObject({ acciones: 2, actividades: 2, vinculos: 2 });
      const [evento] = await tx`SELECT detalle FROM mejora_eventos WHERE hallazgo_id = ${h.id} AND tipo = 'accion_quitada'`;
      expect(evento.detalle).toMatchObject({ accion: "A2", actividades: 2 });
      const [bitacora] = await tx`SELECT detalle FROM auditoria WHERE accion = 'mejora_accion_quitada' AND entidad_id = ${h.id}`;
      expect(bitacora.detalle).toMatchObject({ codigo: h.codigo, ronda: 1, accion: "A2" });
      await expect(quitarAccion(b.lider, { hallazgoId: h.id, accionId: a2.id }, o)).rejects.toThrow("La acción no existe en esta ronda");
      // La causa que ataca la acción ya no puede quitarse de la lista; sin acciones, sí.
      await expect(guardarCausas(b.lider, { hallazgoId: h.id, causas: [] }, o)).rejects.toThrow("Esa causa tiene acciones");
    }));
});

describe("guardarCriterio", () => {
  it("guarda los criterios y el indicador elegible; lo que no aplica se descarta", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular");
      const o = c(AHORA, tx);
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      await guardarCriterio(
        b.lider,
        {
          hallazgoId: h.id,
          criterios: ["otro", "mejora_indicador", "otro"],
          criterioOtro: "Auditoría de seguimiento a los tres meses",
          indicadorEficaciaId: ind.id,
          // En una no conformidad no hay fecha de evaluación.
          fechaEvaluacion: "2027-01-15",
        },
        o,
      );
      const [r] = await tx`SELECT criterios, criterio_otro, indicador_eficacia_id, fecha_evaluacion FROM mejora_rondas WHERE hallazgo_id = ${h.id} AND numero = 1`;
      expect(r.criterios).toEqual(["mejora_indicador", "otro"]);
      expect(r.criterio_otro).toBe("Auditoría de seguimiento a los tres meses");
      expect(Number(r.indicador_eficacia_id)).toBe(ind.id);
      expect(r.fecha_evaluacion).toBeNull();
      await guardarCriterio(b.lider, { hallazgoId: h.id, criterios: ["no_recurrencia"], criterioOtro: "Sobra", indicadorEficaciaId: ind.id }, o);
      const [r2] = await tx`SELECT criterios, criterio_otro, indicador_eficacia_id FROM mejora_rondas WHERE hallazgo_id = ${h.id} AND numero = 1`;
      expect(r2).toMatchObject({ criterios: ["no_recurrencia"], criterio_otro: null, indicador_eficacia_id: null });
      const [bitacora] = await tx`SELECT detalle FROM auditoria WHERE accion = 'mejora_criterio_guardado' AND entidad_id = ${h.id} ORDER BY id DESC LIMIT 1`;
      expect(bitacora.detalle).toMatchObject({ codigo: h.codigo, ronda: 1, criterios: ["no_recurrencia"] });
      expect(await tx`SELECT 1 FROM mejora_eventos WHERE hallazgo_id = ${h.id} AND tipo = 'criterio_guardado'`).toHaveLength(2);
      expect(await guardarCriterio(b.lider, { hallazgoId: h.id, criterios: ["eficaz"] as never }, o).catch((e: Error) => e.message)).toBe(
        "Elija un criterio de eficacia válido",
      );
    }));

  it("el indicador debe poder elegirse: uno que quien formula no ve, o en borrador, se rechaza igual", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const h = await hallazgoEn(tx, b, "por_formular");
      const o = c(AHORA, tx);
      const oculto = await indicadorDePrueba(tx, { procesoId: otro.procesoId, nivelAcceso: "restringido" });
      const borrador = await indicadorDePrueba(tx, { procesoId: b.procesoId, estado: "borrador" });
      for (const id of [oculto.id, borrador.id]) {
        await expect(guardarCriterio(b.lider, { hallazgoId: h.id, criterios: ["mejora_indicador"], indicadorEficaciaId: id }, o)).rejects.toThrow(
          "Ese indicador no se puede enlazar: elija uno activo que usted pueda ver",
        );
      }
    }));
});

describe("examinarPlan (spec §8.6)", () => {
  it("una no conformidad sin nada: el análisis, las preguntas, la acción correctiva y el criterio", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular");
      const { faltas, evaluableDesde } = await examinar(tx, h.id);
      expect(faltas).toEqual(
        expect.arrayContaining([
          "Falta el análisis de causa raíz",
          "Escriba al menos una causa raíz",
          "Responda las dos preguntas de cierre del análisis",
          "El plan de una no conformidad lleva al menos una acción correctiva",
          "Defina el criterio de eficacia",
        ]),
      );
      expect(evaluableDesde).toBeNull();
    }));

  it("una falta por regla: sin correctiva, correctiva sin causa, causa sin acción, fecha pasada, sin indicador", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular");
      const [c1, c2] = await analisisCompletoDe(tx, b, h, ["El formato no dice quién lo llena", "No hay quien revise el turno"]);
      const o = c(AHORA, tx);
      const preventiva = await guardarAccion(
        b.lider,
        { hallazgoId: h.id, tipo: "preventiva", descripcion: "Revisar los demás formatos", causaIds: [], actividades: [actividad(b.lider.usuarioId)] },
        o,
      );
      let { faltas } = await examinar(tx, h.id);
      expect(faltas).toContain("El plan de una no conformidad lleva al menos una acción correctiva");
      expect(faltas).not.toContain("Falta el análisis de causa raíz");
      expect(faltas).not.toContain("Responda las dos preguntas de cierre del análisis");
      expect(faltas).toContain("La causa 1 no tiene acción ni justificación");
      expect(faltas).toContain("La causa 2 no tiene acción ni justificación");

      // La correctiva sin causa es la A2: la A1 es la preventiva.
      const correctiva = await guardarAccion(
        b.lider,
        {
          hallazgoId: h.id,
          tipo: "correctiva",
          descripcion: "Asignar el registro",
          causaIds: [],
          actividades: [actividad(b.lider.usuarioId), actividad(b.lider.usuarioId, { inicio: "2026-11-10", fin: "2026-11-17" })],
        },
        o,
      );
      ({ faltas } = await examinar(tx, h.id));
      expect(faltas).not.toContain("El plan de una no conformidad lleva al menos una acción correctiva");
      expect(faltas).toContain("La acción A2 no dice qué causa ataca");
      expect(faltas).toContain("La actividad A2.2 termina en una fecha pasada");
      expect(faltas).not.toContain("La actividad A2.1 termina en una fecha pasada");

      await guardarAccion(
        b.lider,
        { hallazgoId: h.id, accionId: correctiva.id, tipo: "correctiva", descripcion: "Asignar el registro", causaIds: [c1], actividades: [actividad(b.lider.usuarioId)] },
        o,
      );
      await guardarCriterio(b.lider, { hallazgoId: h.id, criterios: ["mejora_indicador", "otro"] }, o);
      ({ faltas } = await examinar(tx, h.id));
      expect(faltas).not.toContain("La acción A2 no dice qué causa ataca");
      expect(faltas).not.toContain("La causa 1 no tiene acción ni justificación");
      expect(faltas).toContain("La causa 2 no tiene acción ni justificación");
      expect(faltas).not.toContain("Defina el criterio de eficacia");
      expect(faltas).toContain("Elija el indicador");
      expect(faltas).toContain("Describa el otro criterio de eficacia");
      expect(preventiva.id).toBeGreaterThan(0);
      expect(c2).toBeGreaterThan(0);
    }));

  it("en la observación: la fecha de evaluación, no anterior al fin de la última actividad", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular", { clase: "observacion", criticidad: null });
      const o = c(AHORA, tx);
      await guardarAccion(
        b.lider,
        { hallazgoId: h.id, tipo: "preventiva", descripcion: "Revisar el formato", causaIds: [], actividades: [actividad(b.lider.usuarioId)] },
        o,
      );
      await guardarCriterio(b.lider, { hallazgoId: h.id, criterios: ["no_recurrencia"] }, o);
      let r = await examinar(tx, h.id);
      expect(r.faltas).toEqual(["Escriba la fecha de evaluación"]);
      await guardarCriterio(b.lider, { hallazgoId: h.id, criterios: ["no_recurrencia"], fechaEvaluacion: "2026-12-04" }, o);
      r = await examinar(tx, h.id);
      expect(r.faltas).toEqual(["La evaluación no puede ser anterior al fin de la última actividad"]);
      await guardarCriterio(b.lider, { hallazgoId: h.id, criterios: ["no_recurrencia"], fechaEvaluacion: "2027-01-15" }, o);
      r = await examinar(tx, h.id);
      expect(r.faltas).toEqual([]);
      expect(r.evaluableDesde).toBe("2027-01-15");
    }));

  it("en una oportunidad sin análisis no falta nada del análisis; sin acciones, falta la acción", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular", { clase: "oportunidad", criticidad: null });
      const o = c(AHORA, tx);
      await guardarCriterio(b.lider, { hallazgoId: h.id, criterios: ["reduccion_pqrs"], fechaEvaluacion: "2027-01-15" }, o);
      let { faltas } = await examinar(tx, h.id);
      expect(faltas).toEqual(["El plan lleva al menos una acción"]);
      await guardarAccion(
        b.lider,
        { hallazgoId: h.id, tipo: "mejora", descripcion: "Unificar el formato", causaIds: [], actividades: [actividad(b.lider.usuarioId)] },
        o,
      );
      ({ faltas } = await examinar(tx, h.id));
      expect(faltas).toEqual([]);
    }));

  it("un plan completo: sin faltas, con su huella y la fecha desde la que se podrá evaluar", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular");
      const [causa] = await analisisCompletoDe(tx, b, h);
      const o = c(AHORA, tx);
      await guardarAccion(
        b.lider,
        {
          hallazgoId: h.id,
          tipo: "correctiva",
          descripcion: "Asignar el registro al turno de noche",
          causaIds: [causa],
          actividades: [actividad(b.lider.usuarioId, { fin: "2026-11-30" }), actividad(b.lider.usuarioId, { fin: "2026-12-05" })],
        },
        o,
      );
      await guardarCriterio(b.lider, { hallazgoId: h.id, criterios: ["no_recurrencia"] }, o);
      const r = await examinar(tx, h.id);
      expect(r.faltas).toEqual([]);
      expect(r.huella).toMatch(/^[0-9a-f]{64}$/);
      expect(r.huella).toBe(huellaDePlan(r.plan));
      // Sin indicador: dos meses después del mayor fin.
      expect(r.evaluableDesde).toBe("2027-02-05");
      expect(r.evaluableDesde).toBe(fechaMinimaDeEficacia({ clase: "no_conformidad", r: "2026-12-05", fechaEvaluacion: null, periodicidad: null }, "America/Bogota"));
      expect(r.plan.acciones[0]).toMatchObject({ numero: "A1", causas: [1] });
      expect(r.plan.acciones[0].actividades.map((a) => a.numero)).toEqual(["A1.1", "A1.2"]);
      expect(r.plan.acciones[0].actividades[0]).toMatchObject({ responsableId: b.lider.usuarioId, responsable: expect.any(String) });
      // Leer otra vez no cambia la huella; con el indicador mensual, dos periodos completos: desde el 1 de marzo.
      expect((await examinar(tx, h.id)).huella).toBe(r.huella);
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId, periodicidad: "mensual" });
      await guardarCriterio(b.lider, { hallazgoId: h.id, criterios: ["no_recurrencia", "mejora_indicador"], indicadorEficaciaId: ind.id }, o);
      const conIndicador = await examinar(tx, h.id);
      expect(conIndicador.faltas).toEqual([]);
      expect(conIndicador.evaluableDesde).toBe("2027-03-01");
      expect(conIndicador.huella).not.toBe(r.huella);
      // Si el indicador se retira, la falta lo dice y la fecha vuelve a la de dos meses.
      await tx`UPDATE indicadores SET estado = 'retirado', baja_por = ${b.admin.usuarioId}, baja_en = now(), baja_motivo = 'Ya no se mide'
        WHERE id = ${ind.id}`;
      const retirado = await examinar(tx, h.id);
      expect(retirado.faltas).toEqual(["El indicador elegido ya no está activo: elija otro"]);
      expect(retirado.evaluableDesde).toBe("2027-02-05");
    }));
});

describe("los indicadores que se pueden enlazar", () => {
  it("el indicador elegible: ni en borrador, ni retirado, ni uno restringido que no se ve", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const activo = await indicadorDePrueba(tx, { procesoId: otro.procesoId, periodicidad: "trimestral" });
      const borrador = await indicadorDePrueba(tx, { procesoId: b.procesoId, estado: "borrador" });
      const retirado = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      await tx`UPDATE indicadores SET estado = 'retirado', baja_por = ${b.admin.usuarioId}, baja_en = now(), baja_motivo = 'Ya no se mide'
        WHERE id = ${retirado.id}`;
      const restringido = await indicadorDePrueba(tx, { procesoId: otro.procesoId, nivelAcceso: "restringido" });
      const delLider = (await indicadoresElegibles(tx, b.lider)).map((x) => x.id);
      expect(delLider).toContain(activo.id);
      expect(delLider).not.toContain(borrador.id);
      expect(delLider).not.toContain(retirado.id);
      expect(delLider).not.toContain(restringido.id);
      expect((await indicadoresElegibles(tx, b.admin)).map((x) => x.id)).toContain(restringido.id);
      expect((await indicadoresElegibles(tx, otro.lider)).map((x) => x.id)).toContain(restringido.id);
      const fila = (await indicadoresElegibles(tx, b.lider)).find((x) => x.id === activo.id);
      expect(fila).toMatchObject({ codigo: activo.codigo, nombre: `Indicador de prueba ${activo.codigo}`, periodicidad: "trimestral" });

      expect(await indicadorDeEficacia(tx, activo.id)).toMatchObject({ id: activo.id, codigo: activo.codigo, activo: true, periodicidad: "trimestral", plazoReporteDias: 10 });
      expect(await indicadorDeEficacia(tx, retirado.id)).toMatchObject({ activo: false, periodicidad: "mensual" });
      expect(await indicadorDeEficacia(tx, borrador.id)).toBeNull();
      expect(await indicadorDeEficacia(tx, 0)).toBeNull();
    }));

  it("los responsables que se pueden asignar: los usuarios activos, con su cargo", () =>
    revertida(sql, async (tx) => {
      const activo = await usuarioDePrueba(tx, { rol: "consulta" });
      const inactivo = await usuarioDePrueba(tx, { rol: "consulta" });
      await tx`UPDATE usuarios SET activo = false WHERE id = ${inactivo.usuarioId}`;
      const [cargo] = await tx`SELECT id, nombre FROM cargos ORDER BY id LIMIT 1`;
      if (cargo) await tx`UPDATE usuarios SET cargo_id = ${cargo.id} WHERE id = ${activo.usuarioId}`;
      const lista = await usuariosAsignables(tx);
      const ids = lista.map((u) => u.id);
      expect(ids).toContain(activo.usuarioId);
      expect(ids).not.toContain(inactivo.usuarioId);
      expect(lista.find((u) => u.id === activo.usuarioId)).toMatchObject({ cargo: cargo ? cargo.nombre : null });
    }));
});
