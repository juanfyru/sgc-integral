/**
 * Las filas de un plan de acción (Fase 15B, Tarea 6; anexo §4.2 y §5.3): una por actividad de un plan aprobado, de todas las
 * rondas, y una sin actividad por cada ronda en curso sin plan aprobado. Contra la BD de trabajo, dentro de una transacción que
 * se revierte; lo que el dominio no sabe llevar (un cierre, una ronda 2) se escribe por SQL en esa misma transacción.
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import type { TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { filasDePlanDeAccion } from "@/db/consultas/mejoramiento/filas-de-plan";
import { actividadPorSql, baseDeMejora, hallazgoEn } from "./utiles/mejoramiento";
import { contada } from "./utiles/sentencias";
import { revertida } from "./utiles/transaccion";
import { usuarioDePrueba } from "./utiles/tramites";

const sql = obtenerSql();
afterAll(() => sql.end());

const AHORA = new Date("2026-11-18T15:00:00Z");

describe("filasDePlanDeAccion", () => {
  it("una acción con dos actividades da dos filas con el mismo hallazgo y la misma acción", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "en_ejecucion", undefined, { actividades: 2 });
      const filas = await filasDePlanDeAccion(tx, [h.id], AHORA);
      expect(filas).toHaveLength(2);
      expect(filas[0].hallazgo).toEqual(filas[1].hallazgo);
      expect(filas[0].hallazgo.codigo).toBe(h.codigo);
      expect(filas[0].accion).toEqual(filas[1].accion);
      expect(filas[0].accion?.numero).toBe("A1");
      expect(filas[0].accion?.causas).toBe("El procedimiento no asigna el registro al turno de noche");
      expect(filas[0].accion?.metodo).toBe("5 porqués");
      expect(filas.map((f) => f.actividad?.descripcion)).toEqual(["Actividad 1 del plan de prueba", "Actividad 2 del plan de prueba"]);
      expect(filas.every((f) => f.rondas === 1 && f.ronda === 1 && f.enQueVa === null)).toBe(true);
    }));

  it("un hallazgo por formular y uno en revisión dan una fila sin acción ni actividad que dice en qué van", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const a = await hallazgoEn(tx, b, "por_formular");
      const r = await hallazgoEn(tx, b, "en_revision");
      const filas = await filasDePlanDeAccion(tx, [a.id, r.id], AHORA);
      expect(filas.map((f) => [f.hallazgo.codigo, f.accion, f.actividad, f.enQueVa])).toEqual([
        [a.codigo, null, null, "Por formular: plan de acción en formulación"],
        [r.codigo, null, null, "En revisión"],
      ]);
    }));

  it("un hallazgo cerrado con corrección o sin acción lo dice con la fecha larga", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const con = await hallazgoEn(tx, b, "por_aceptar");
      const sin = await hallazgoEn(tx, b, "por_aceptar");
      await tx`UPDATE mejora_hallazgos SET estado = 'cerrado', resultado_cierre = 'con_correccion', cerrado_en = '2027-03-01T15:00:00Z',
        correccion_descripcion = 'Se diligenciaron los formatos' WHERE id = ${con.id}`;
      await tx`UPDATE mejora_hallazgos SET estado = 'cerrado', resultado_cierre = 'sin_accion', cerrado_en = '2027-03-02T15:00:00Z' WHERE id = ${sin.id}`;
      const filas = await filasDePlanDeAccion(tx, [con.id, sin.id], AHORA);
      expect(filas.map((f) => f.enQueVa)).toEqual([
        "Cerrado con corrección el 1 de marzo de 2027: Se diligenciaron los formatos",
        "Cerrado sin acción el 2 de marzo de 2027",
      ]);
    }));

  it("con una ronda 2 en borrador y la 1 con dos actividades salen tres filas, todas con rondas 2", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "en_ejecucion", undefined, { actividades: 2 });
      await tx`INSERT INTO mejora_rondas (hallazgo_id, numero) VALUES (${h.id}, 2)`;
      await tx`UPDATE mejora_hallazgos SET ronda = 2, estado = 'por_formular' WHERE id = ${h.id}`;
      const filas = await filasDePlanDeAccion(tx, [h.id], AHORA);
      expect(filas.map((f) => [f.ronda, f.rondas, f.actividad === null])).toEqual([
        [1, 2, false],
        [1, 2, false],
        [2, 2, true],
      ]);
      expect(filas[2].enQueVa).toBe("Por formular: plan de acción en formulación");
    }));

  it("la cancelada sale con su estado y la de fin pasado sin terminar, vencida; la reprogramada lo dice", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "en_ejecucion", undefined, { actividades: 3 });
      const ids = (await tx`SELECT id FROM mejora_actividades WHERE hallazgo_id = ${h.id} ORDER BY orden, id`).map((x) => Number(x.id));
      await tx`UPDATE mejora_actividades SET estado = 'cancelada' WHERE id = ${ids[0]}`;
      await tx`UPDATE mejora_actividades SET estado = 'en_proceso', fin = '2026-11-01', reprogramaciones = 1 WHERE id = ${ids[1]}`;
      await tx`UPDATE mejora_actividades SET estado = 'abierta', fin = '2026-12-30' WHERE id = ${ids[2]}`;
      const filas = await filasDePlanDeAccion(tx, [h.id], AHORA);
      const por = new Map(filas.map((f) => [f.actividad!.id, f.actividad!]));
      expect(por.get(ids[0])).toMatchObject({ estado: "cancelada", vencida: false });
      expect(por.get(ids[1])).toMatchObject({ estado: "en_proceso", vencida: true, reprogramada: true });
      expect(por.get(ids[2])).toMatchObject({ estado: "abierta", vencida: false, reprogramada: false });
    }));

  it("el último seguimiento, los archivos y el cargo (nulo si no tiene)", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const sinCargo = await usuarioDePrueba(tx, { rol: "consulta" });
      const h = await hallazgoEn(tx, b, "por_aceptar");
      const a = await actividadPorSql(tx, h.id, sinCargo.usuarioId);
      await tx`INSERT INTO mejora_seguimientos (hallazgo_id, actividad_id, fecha, realizado, avance, registrado_por)
        VALUES (${h.id}, ${a}, '2026-11-10', 'Primero', 10, ${sinCargo.usuarioId}), (${h.id}, ${a}, '2026-11-15', 'Segundo', 30, ${sinCargo.usuarioId})`;
      const [f] = await filasDePlanDeAccion(tx, [h.id], AHORA);
      expect(f.actividad?.ultimoSeguimiento).toEqual({ fecha: "2026-11-15", realizado: "Segundo" });
      expect(f.actividad?.archivos).toBe(0);
      expect(f.actividad?.cargo).toBeNull();
      const [cargo] = await tx`SELECT id, nombre FROM cargos ORDER BY id LIMIT 1`;
      await tx`UPDATE usuarios SET cargo_id = ${cargo.id} WHERE id = ${sinCargo.usuarioId}`;
      const [g] = await filasDePlanDeAccion(tx, [h.id], AHORA);
      expect(g.actividad?.cargo).toBe(cargo.nombre);
    }));

  it("ordena por código del hallazgo, ronda, acción y actividad, y no pasa de seis consultas con cincuenta actividades", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const x = await hallazgoEn(tx, b, "por_aceptar");
      const y = await hallazgoEn(tx, b, "por_aceptar");
      for (let i = 0; i < 25; i++) await actividadPorSql(tx, x.id, b.lider.usuarioId);
      for (let i = 0; i < 25; i++) await actividadPorSql(tx, y.id, b.lider.usuarioId);
      const { sql: contador, sentencias } = contada(tx);
      const filas = await filasDePlanDeAccion(contador, [y.id, x.id], AHORA);
      expect(filas).toHaveLength(50);
      expect(sentencias.length).toBeLessThanOrEqual(6);
      const codigos = filas.map((f) => f.hallazgo.codigo);
      expect(codigos).toEqual([...codigos].sort());
      expect(codigos[0]).toBe([x.codigo, y.codigo].sort()[0]);
    }));

  it("sin hallazgos no consulta nada", async () => {
    const { sql: contador, sentencias } = contada(sql as unknown as TransactionSql);
    expect(await filasDePlanDeAccion(contador, [], AHORA)).toEqual([]);
    expect(sentencias).toHaveLength(0);
  });
});
