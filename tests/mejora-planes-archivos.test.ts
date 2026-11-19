/**
 * Los archivos de un plan de mejoramiento (Fase 15B, Tarea 5; anexo §3.7): suben quienes tienen `mejora.planes`; los abren
 * quienes ven todo, y a los demás (también al líder de un hallazgo del plan) les responde lo mismo que a un plan que no existe;
 * un plan anulado no los admite; los quita quien los subió o el Admin SGC, salvo el oficio de una respuesta al ente ya
 * registrada, que nadie quita; y subir y quitar dejan su línea en el historial del plan, que solo lee quien ve todo. Contra la BD
 * de trabajo, dentro de una transacción que se revierte. Las vigencias son lejanas (2099): ningún plan confirmado la usa.
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import type { TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import {
  archivoServible,
  archivosDe,
  archivosQuitables,
  autorizarSubida,
  exigirDestinoAbierto,
  quitarArchivoDeMejora,
} from "@/db/consultas/mejoramiento/archivos";
import { ponerEnPlan } from "@/db/consultas/mejoramiento/clasificacion";
import { anularPlan } from "@/db/consultas/mejoramiento/planes";
import { leerPlan } from "@/db/consultas/mejoramiento/planes-lectura";
import { registrarHallazgo } from "@/db/consultas/mejoramiento/registro";
import { registrarRespuestaDelPlan } from "@/db/consultas/mejoramiento/respuesta-plan";
import { puedeAbrirArchivoDeMejora } from "@/lib/alcance";
import { PLAN_ANULADO } from "@/lib/mejoramiento/planes";
import {
  archivoDelPlan,
  baseDeMejora,
  c,
  datosDeHallazgo,
  hallazgoEn,
  planDeMejoraDePrueba,
  type BaseDeMejora,
} from "./utiles/mejoramiento";
import { revertida } from "./utiles/transaccion";
import { usuarioDePrueba } from "./utiles/tramites";

const sql = obtenerSql();
afterAll(() => sql.end());

const AHORA = "2026-11-18T15:00:00Z";
const o = (tx: TransactionSql) => c(AHORA, tx);
const NO_EXISTE_EL_DUENO = { ok: false, estado: 404, error: "Ya no existe a qué adjuntar el archivo" };
const OFICIO_REGISTRADO = "El oficio de la respuesta al ente ya se registró: no se quita";

/** Un plan de Control Interno con un hallazgo del proceso de la base: su líder ve el plan (lo ve completo). */
async function escena(tx: TransactionSql) {
  const b = await baseDeMejora(tx);
  const plan = await planDeMejoraDePrueba(tx, b.control);
  const h = await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId), o(tx));
  await ponerEnPlan(b.control, { planId: plan.id, hallazgoIds: [h.id] }, o(tx));
  return { b, plan, h };
}

const delPlan = (id: number) => ({ contexto: "mejora_plan", id }) as const;

const eventos = (tx: TransactionSql, planId: number) =>
  tx`SELECT tipo, hallazgo_id, detalle, usuario_id, creado_en FROM mejora_plan_eventos
    WHERE plan_id = ${planId} AND tipo IN ('archivo', 'archivo_quitado') ORDER BY id`;

/** Un plan anulado: se crea vacío (un plan con hallazgos no se anula) y se anula. */
async function planAnulado(tx: TransactionSql, b: BaseDeMejora) {
  const plan = await planDeMejoraDePrueba(tx, b.control, { nombre: "Plan que se anula por un error de registro" });
  await anularPlan(b.control, { planId: plan.id, motivo: "Se creó dos veces por un error" }, o(tx));
  return plan;
}

describe("quién sube un archivo a un plan", () => {
  it("Control Interno y el Admin SGC; Gerencia ve los archivos y no sube; al líder de un hallazgo del plan, lo mismo que a un plan que no existe", () =>
    revertida(sql, async (tx) => {
      const { b, plan } = await escena(tx);
      expect(await autorizarSubida(b.control, delPlan(plan.id), { sql: tx })).toEqual({ ok: true, carpeta: `mejoramiento/planes/${plan.id}` });
      expect((await autorizarSubida(b.admin, delPlan(plan.id), { sql: tx })).ok).toBe(true);
      expect(await autorizarSubida(b.gerencia, delPlan(plan.id), { sql: tx })).toEqual({
        ok: false,
        estado: 403,
        error: "Sin permiso para adjuntar este archivo",
      });
      const deUnoQueNoExiste = await autorizarSubida(b.lider, delPlan(999999999), { sql: tx });
      expect(deUnoQueNoExiste).toEqual(NO_EXISTE_EL_DUENO);
      expect(await autorizarSubida(b.lider, delPlan(plan.id), { sql: tx })).toEqual(deUnoQueNoExiste);
      expect(await autorizarSubida(b.consulta, delPlan(plan.id), { sql: tx })).toEqual(deUnoQueNoExiste);
      expect(await autorizarSubida(b.control, delPlan(999999999), { sql: tx })).toEqual(NO_EXISTE_EL_DUENO);

      // El dominio lo repite al registrar: el líder no sube aunque llegue a `registrarArchivo`.
      await expect(archivoDelPlan(tx, plan.id, b.lider.usuarioId)).rejects.toThrow("Sin permiso para adjuntar este archivo");
      const id = await archivoDelPlan(tx, plan.id, b.control.usuarioId);
      const [fila] = await tx`SELECT contexto, contexto_id, rol, version_id FROM archivos WHERE id = ${id}`;
      expect(fila).toEqual({ contexto: "mejora_plan", contexto_id: plan.id, rol: "evidencia", version_id: null });
    }));

  it("un plan anulado no admite archivos: exigirDestinoAbierto lanza PLAN_ANULADO y autorizarSubida responde 409", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const plan = await planAnulado(tx, b);
      await expect(
        tx.savepoint((s) => exigirDestinoAbierto(s, "mejora_plan", plan.id, b.control.usuarioId, "evidencia")),
      ).rejects.toThrow(PLAN_ANULADO);
      expect(await autorizarSubida(b.control, delPlan(plan.id), { sql: tx })).toEqual({ ok: false, estado: 409, error: PLAN_ANULADO });
      await expect(archivoDelPlan(tx, plan.id, b.admin.usuarioId)).rejects.toThrow(PLAN_ANULADO);
    }));
});

describe("quién abre un archivo de un plan", () => {
  it("quien ve todo (Gerencia, Control Interno, el Admin SGC); el líder de un hallazgo del plan, no, y tampoco lo lista", () =>
    revertida(sql, async (tx) => {
      const { b, plan } = await escena(tx);
      const id = await archivoDelPlan(tx, plan.id, b.control.usuarioId, { nombre: "Informe final de auditoría.pdf" });
      const archivo = { contexto: "mejora_plan", contextoId: plan.id };
      for (const s of [b.gerencia, b.control, b.admin]) expect(await puedeAbrirArchivoDeMejora(archivo, s, { sql: tx })).toBe(true);
      for (const s of [b.lider, b.consulta]) expect(await puedeAbrirArchivoDeMejora(archivo, s, { sql: tx })).toBe(false);
      expect(await puedeAbrirArchivoDeMejora({ contexto: "mejora_plan", contextoId: 999999999 }, b.gerencia, { sql: tx })).toBe(false);

      expect(await archivoServible(b.gerencia, id, { sql: tx })).toMatchObject({ nombreOriginal: "Informe final de auditoría.pdf" });
      expect(await archivoServible(b.lider, id, { sql: tx })).toBeNull();
      expect((await archivosDe(tx, b.gerencia, archivo)).map((a) => a.id)).toEqual([id]);
      expect(await archivosDe(tx, b.lider, archivo)).toEqual([]);

      // La página del plan: el bloque de archivos, solo a quien ve todo; al líder, nada (ni el bloque).
      const deGerencia = await leerPlan(b.gerencia, plan.id, { sql: tx, ahora: new Date(AHORA) });
      expect(deGerencia?.archivos).toEqual({
        lista: [expect.objectContaining({ id, nombre: "Informe final de auditoría.pdf" })],
        quitables: [],
        puedeSubir: false,
      });
      const deControl = await leerPlan(b.control, plan.id, { sql: tx, ahora: new Date(AHORA) });
      expect(deControl?.archivos).toMatchObject({ quitables: [id], puedeSubir: true });
      const delLider = await leerPlan(b.lider, plan.id, { sql: tx, ahora: new Date(AHORA) });
      expect(delLider).not.toBeNull();
      expect(delLider?.archivos).toBeNull();
      expect(JSON.stringify(delLider)).not.toContain("Informe final de auditoría");
    }));
});

describe("quién quita un archivo de un plan", () => {
  it("quien lo subió y el Admin SGC; otra persona de Control Interno, no; en un plan anulado, nadie", () =>
    revertida(sql, async (tx) => {
      const { b, plan } = await escena(tx);
      const otroControl = await usuarioDePrueba(tx, { rol: "control_interno" });
      const archivo = { contexto: "mejora_plan", contextoId: plan.id };
      const suyo = await archivoDelPlan(tx, plan.id, b.control.usuarioId);
      const otro = await archivoDelPlan(tx, plan.id, b.control.usuarioId);
      expect(await archivosQuitables(tx, otroControl, [{ id: suyo }], archivo)).toEqual([]);
      await expect(quitarArchivoDeMejora(otroControl, suyo, { sql: tx })).rejects.toThrow("No puede quitar este archivo");
      await expect(quitarArchivoDeMejora(b.lider, suyo, { sql: tx })).rejects.toThrow("El archivo no existe");
      expect(await archivosQuitables(tx, b.control, [{ id: suyo }, { id: otro }], archivo)).toEqual([suyo, otro]);
      await quitarArchivoDeMejora(b.control, suyo, { sql: tx });
      await quitarArchivoDeMejora(b.admin, otro, { sql: tx });
      expect(await tx`SELECT id FROM archivos WHERE id IN (${suyo}, ${otro})`).toHaveLength(0);

      // Anulado, ni el Admin SGC: el plan ya no admite cambios.
      const anulable = await planDeMejoraDePrueba(tx, b.control, { nombre: "Plan vacío con un archivo" });
      const enElAnulado = await archivoDelPlan(tx, anulable.id, b.control.usuarioId);
      await anularPlan(b.control, { planId: anulable.id, motivo: "Se creó dos veces por un error" }, o(tx));
      for (const s of [b.control, b.admin]) await expect(quitarArchivoDeMejora(s, enElAnulado, { sql: tx })).rejects.toThrow(PLAN_ANULADO);
      expect(await archivosQuitables(tx, b.admin, [{ id: enElAnulado }], { contexto: "mejora_plan", contextoId: anulable.id })).toEqual([]);
    }));

  it("el oficio de una respuesta al ente registrada no lo quita nadie: el mensaje del dominio, no el 23503 de la llave", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const plan = await planDeMejoraDePrueba(tx, b.control, { origen: "ente_control", fechaLimiteEnte: "2026-12-30" });
      const h = await hallazgoEn(tx, b, "en_ejecucion", { origen: "ente_control", fuente: "Superintendencia Nacional de Salud", fechaLimiteEnte: "2026-12-30" });
      await ponerEnPlan(b.control, { planId: plan.id, hallazgoIds: [h.id] }, o(tx));
      const oficio = await archivoDelPlan(tx, plan.id, b.admin.usuarioId);
      const otro = await archivoDelPlan(tx, plan.id, b.admin.usuarioId);
      await registrarRespuestaDelPlan(b.admin, { planId: plan.id, enviadaEn: "2026-11-18", oficioId: oficio, vistos: [h.id] }, o(tx));
      const archivo = { contexto: "mejora_plan", contextoId: plan.id };
      expect(await archivosQuitables(tx, b.admin, [{ id: oficio }, { id: otro }], archivo)).toEqual([otro]);
      for (const s of [b.admin, b.control]) {
        await expect(tx.savepoint((s2) => quitarArchivoDeMejora(s, oficio, { sql: s2 }))).rejects.toThrow(OFICIO_REGISTRADO);
      }
      expect(await tx`SELECT id FROM archivos WHERE id = ${oficio}`).toHaveLength(1);
      await quitarArchivoDeMejora(b.admin, otro, { sql: tx });
    }));
});

describe("el historial del plan", () => {
  it("subir y quitar dejan sus eventos «archivo» y «archivo_quitado», con el archivo y quién, a la hora de quien llama; solo los lee quien ve todo", () =>
    revertida(sql, async (tx) => {
      const { b, plan } = await escena(tx);
      const id = await archivoDelPlan(tx, plan.id, b.control.usuarioId, { nombre: "Oficio de traslado del ente.pdf", ahora: AHORA });
      await quitarArchivoDeMejora(b.admin, id, { sql: tx, ahora: new Date("2026-11-18T16:00:00Z") });
      expect(await eventos(tx, plan.id)).toEqual([
        {
          tipo: "archivo",
          hallazgo_id: null,
          detalle: { archivoId: id, nombre: "Oficio de traslado del ente.pdf" },
          usuario_id: b.control.usuarioId,
          creado_en: new Date(AHORA),
        },
        {
          tipo: "archivo_quitado",
          hallazgo_id: null,
          detalle: { archivoId: id, nombre: "Oficio de traslado del ente.pdf" },
          usuario_id: b.admin.usuarioId,
          creado_en: new Date("2026-11-18T16:00:00Z"),
        },
      ]);
      const ahora = new Date("2026-11-18T17:00:00Z");
      const deGerencia = await leerPlan(b.gerencia, plan.id, { sql: tx, ahora });
      expect(deGerencia?.historial.slice(0, 2).map((e) => e.texto)).toEqual([
        "quitó el archivo «Oficio de traslado del ente.pdf» del plan",
        "adjuntó el archivo «Oficio de traslado del ente.pdf» al plan",
      ]);
      const delLider = await leerPlan(b.lider, plan.id, { sql: tx, ahora });
      expect(delLider?.historial.some((e) => e.tipo === "archivo" || e.tipo === "archivo_quitado")).toBe(false);
    }));
});
