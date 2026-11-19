/**
 * Lo que llega puesto al formulario de registro de un hallazgo (Fase 15B, anexo §3.4 camino 1 y §10.3): los parámetros `plan`,
 * `documento`, `indicador` y `proceso` de `/mejoramiento/nuevo`, y la precedencia de los enganches que añaden las tareas
 * siguientes. Lo que la persona no puede ver o no puede usar se ignora sin decir por qué: el `Prellenado` vacío, sin lanzar.
 * Contra la BD de trabajo, dentro de una transacción que se revierte.
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import type { TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { anularPlan } from "@/db/consultas/mejoramiento/planes";
import { engancheDe, PRELLENADO_VACIO, prellenadoDeRegistro } from "@/db/consultas/mejoramiento/prellenado";
import { rutaDeRegistro } from "@/lib/mejoramiento/rutas";
import { indicadorDePrueba } from "./utiles/indicadores";
import { baseDeMejora, c, objetivoDePrueba, otroProcesoConLider, planDeMejoraDePrueba } from "./utiles/mejoramiento";
import { procesoNuevo } from "./utiles/mixto";
import { revertida } from "./utiles/transaccion";
import { documentoLibre, tipoLibre, TIPO_LIBRE, usuarioDePrueba } from "./utiles/tramites";

const sql = obtenerSql();
afterAll(() => sql.end());

const AHORA = "2026-11-17T15:00:00Z";

const siglaDe = async (tx: TransactionSql, procesoId: number) => (await tx`SELECT sigla FROM procesos WHERE id = ${procesoId}`)[0].sigla as string;
const slugDe = async (tx: TransactionSql, procesoId: number) => (await tx`SELECT slug FROM procesos WHERE id = ${procesoId}`)[0].slug as string;

/** Un documento vigente del proceso, general o restringido. */
async function documentoDe(tx: TransactionSql, procesoId: number, nivel: "general" | "restringido" = "general") {
  await tipoLibre(tx);
  const d = await documentoLibre(tx, { proceso: await siglaDe(tx, procesoId), tipo: TIPO_LIBRE });
  if (nivel === "restringido") await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${d.id}`;
  return d;
}

describe("prellenadoDeRegistro: el plan", () => {
  it("como Control Interno: propone el origen, el nombre como fuente, la fecha del ente y el objetivo; el plan viaja oculto", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const objetivo = await objetivoDePrueba(tx);
      const p = await planDeMejoraDePrueba(tx, b.control, {
        nombre: "Visita de la Superintendencia de noviembre",
        origen: "ente_control",
        fechaLimiteEnte: "2026-12-15",
        objetivoId: objetivo.id,
      });
      expect(await prellenadoDeRegistro(b.control, { plan: String(p.id) }, { sql: tx })).toEqual({
        valores: { origen: "ente_control", fuente: "Visita de la Superintendencia de noviembre", fechaLimiteEnte: "2026-12-15", objetivoId: objetivo.id },
        fijos: [],
        ocultos: { planId: String(p.id) },
        rotulo: `Se registra dentro del plan ${p.codigo}`,
      });
      // El Admin SGC también tiene `mejora.planes`.
      expect((await prellenadoDeRegistro(b.admin, { plan: String(p.id) }, { sql: tx })).ocultos).toEqual({ planId: String(p.id) });
    });
  });

  it("un plan interno sin objetivo no propone fecha del ente ni objetivo; uno con el objetivo desactivado no lo propone", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const interno = await planDeMejoraDePrueba(tx, b.control);
      expect((await prellenadoDeRegistro(b.control, { plan: String(interno.id) }, { sql: tx })).valores).toEqual({
        origen: "auditoria_interna",
        fuente: "Auditoría interna de calidad de noviembre",
      });

      const objetivo = await objetivoDePrueba(tx);
      const conObjetivo = await planDeMejoraDePrueba(tx, b.control, { objetivoId: objetivo.id });
      await tx`UPDATE objetivos SET activo = false WHERE id = ${objetivo.id}`;
      expect((await prellenadoDeRegistro(b.control, { plan: String(conObjetivo.id) }, { sql: tx })).valores).not.toHaveProperty("objetivoId");
    });
  });

  it("como líder (sin mejora.planes), de un plan anulado o de un id que no existe: vacío, sin lanzar", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const p = await planDeMejoraDePrueba(tx, b.control);
      expect(await prellenadoDeRegistro(b.lider, { plan: String(p.id) }, { sql: tx })).toEqual(PRELLENADO_VACIO);
      expect(await prellenadoDeRegistro(b.consulta, { plan: String(p.id) }, { sql: tx })).toEqual(PRELLENADO_VACIO);

      const anulado = await planDeMejoraDePrueba(tx, b.control);
      await anularPlan(b.control, { planId: anulado.id, motivo: "El plan se creó por error en la vigencia" }, c(AHORA, tx));
      expect(await prellenadoDeRegistro(b.control, { plan: String(anulado.id) }, { sql: tx })).toEqual(PRELLENADO_VACIO);

      for (const plan of ["2000000000", "0", "abc", "", "1e3", "-4"]) {
        expect(await prellenadoDeRegistro(b.control, { plan }, { sql: tx })).toEqual(PRELLENADO_VACIO);
      }
    });
  });
});

describe("prellenadoDeRegistro: a qué se refiere y el proceso", () => {
  it("un documento que la persona ve, por su código: el documento y su proceso", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const d = await documentoDe(tx, b.procesoId);
      expect(await prellenadoDeRegistro(b.control, { documento: d.codigo }, { sql: tx })).toEqual({
        valores: { documentoId: d.id, procesoId: b.procesoId },
        fijos: [],
        ocultos: {},
        rotulo: null,
      });
      // El restringido de su proceso lo ve su líder.
      const propio = await documentoDe(tx, b.procesoId, "restringido");
      expect((await prellenadoDeRegistro(b.lider, { documento: propio.codigo }, { sql: tx })).valores).toEqual({
        documentoId: propio.id,
        procesoId: b.procesoId,
      });
    });
  });

  it("uno restringido que no ve, un código que no existe o uno sin versión vigente: vacío", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await procesoNuevo(tx);
      const ajeno = await documentoDe(tx, otro, "restringido");
      expect(await prellenadoDeRegistro(b.lider, { documento: ajeno.codigo }, { sql: tx })).toEqual(PRELLENADO_VACIO);
      expect(await prellenadoDeRegistro(b.consulta, { documento: ajeno.codigo }, { sql: tx })).toEqual(PRELLENADO_VACIO);
      expect(await prellenadoDeRegistro(b.control, { documento: "NO-EXISTE-999" }, { sql: tx })).toEqual(PRELLENADO_VACIO);

      // Sin versión vigente no está entre los que el formulario ofrece.
      const tipo = await tipoLibre(tx);
      const [sinVigente] = await tx`INSERT INTO documentos (codigo, titulo, tipo_id)
        VALUES (${`ZZ-SV-${Date.now()}`}, 'Documento sin versión vigente', ${tipo}) RETURNING codigo`;
      expect(await prellenadoDeRegistro(b.control, { documento: sinVigente.codigo as string }, { sql: tx })).toEqual(PRELLENADO_VACIO);
    });
  });

  it("un documento general de un proceso que el líder no lidera: el documento, sin proponer ese proceso", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await procesoNuevo(tx);
      const d = await documentoDe(tx, otro);
      expect((await prellenadoDeRegistro(b.lider, { documento: d.codigo }, { sql: tx })).valores).toEqual({ documentoId: d.id });
    });
  });

  it("un indicador que ve, por su código: el indicador y su proceso; uno restringido que no ve, o un borrador: vacío", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      expect(await prellenadoDeRegistro(b.control, { indicador: ind.codigo }, { sql: tx })).toEqual({
        valores: { indicadorId: ind.id, procesoId: b.procesoId },
        fijos: [],
        ocultos: {},
        rotulo: null,
      });

      const otro = await procesoNuevo(tx);
      const restringido = await indicadorDePrueba(tx, { procesoId: otro, nivelAcceso: "restringido" });
      expect(await prellenadoDeRegistro(b.lider, { indicador: restringido.codigo }, { sql: tx })).toEqual(PRELLENADO_VACIO);
      // Quien administra indicadores ve también los borradores, pero un borrador no se enlaza a un hallazgo.
      const borrador = await indicadorDePrueba(tx, { procesoId: b.procesoId, estado: "borrador" });
      expect(await prellenadoDeRegistro(b.admin, { indicador: borrador.codigo }, { sql: tx })).toEqual(PRELLENADO_VACIO);
      expect(await prellenadoDeRegistro(b.control, { indicador: "ZZ-NO-EXISTE" }, { sql: tx })).toEqual(PRELLENADO_VACIO);
    });
  });

  it("un proceso donde puede registrar, por su slug; un líder con uno que no lidera, o un proceso inactivo: vacío", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const slug = await slugDe(tx, b.procesoId);
      expect(await prellenadoDeRegistro(b.control, { proceso: slug }, { sql: tx })).toEqual({
        valores: { procesoId: b.procesoId },
        fijos: [],
        ocultos: {},
        rotulo: null,
      });
      expect((await prellenadoDeRegistro(b.lider, { proceso: slug }, { sql: tx })).valores).toEqual({ procesoId: b.procesoId });

      const otro = await otroProcesoConLider(tx);
      expect(await prellenadoDeRegistro(b.lider, { proceso: await slugDe(tx, otro.procesoId) }, { sql: tx })).toEqual(PRELLENADO_VACIO);

      await tx`UPDATE procesos SET activo = false WHERE id = ${otro.procesoId}`;
      expect(await prellenadoDeRegistro(b.control, { proceso: await slugDe(tx, otro.procesoId) }, { sql: tx })).toEqual(PRELLENADO_VACIO);
      expect(await prellenadoDeRegistro(b.control, { proceso: "no-existe" }, { sql: tx })).toEqual(PRELLENADO_VACIO);
    });
  });

  it("el documento y el plan juntos se combinan; el proceso explícito manda sobre el del documento", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const d = await documentoDe(tx, b.procesoId);
      const p = await planDeMejoraDePrueba(tx, b.control);
      expect(await prellenadoDeRegistro(b.control, { plan: String(p.id), documento: d.codigo }, { sql: tx })).toEqual({
        valores: { origen: "auditoria_interna", fuente: "Auditoría interna de calidad de noviembre", documentoId: d.id, procesoId: b.procesoId },
        fijos: [],
        ocultos: { planId: String(p.id) },
        rotulo: `Se registra dentro del plan ${p.codigo}`,
      });

      // Lo que no admite no borra lo demás: con un plan que el líder no puede usar, el documento llega igual.
      expect((await prellenadoDeRegistro(b.lider, { plan: String(p.id), documento: d.codigo }, { sql: tx })).valores).toEqual({
        documentoId: d.id,
        procesoId: b.procesoId,
      });

      const otro = await procesoNuevo(tx);
      const control = await usuarioDePrueba(tx, { rol: "control_interno" });
      expect(
        (await prellenadoDeRegistro(control, { documento: d.codigo, proceso: await slugDe(tx, otro) }, { sql: tx })).valores,
      ).toEqual({ documentoId: d.id, procesoId: otro });
    });
  });

  it("los enganches que añaden las tareas siguientes todavía no ponen nada y no estorban a los demás parámetros", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const p = await planDeMejoraDePrueba(tx, b.control);
      const r = await prellenadoDeRegistro(b.control, { plan: String(p.id), medicion: "1", verificacion: "2", impacto: "3", impactoIndicador: "4" }, { sql: tx });
      expect(r.ocultos).toEqual({ planId: String(p.id) });
      expect(r.fijos).toEqual([]);
    });
  });
});

describe("engancheDe: si llega más de uno de medicion, verificacion, impacto e impactoIndicador, se usa el primero de esa lista", () => {
  it("por presencia, en ese orden", () => {
    expect(engancheDe({})).toBeNull();
    expect(engancheDe({ plan: "3", documento: "X" })).toBeNull();
    expect(engancheDe({ impactoIndicador: "4", impacto: "3", verificacion: "2", medicion: "1" })).toEqual({ clave: "medicion", valor: "1" });
    expect(engancheDe({ impactoIndicador: "4", impacto: "3", verificacion: "2" })).toEqual({ clave: "verificacion", valor: "2" });
    expect(engancheDe({ impactoIndicador: "4", impacto: "3" })).toEqual({ clave: "impacto", valor: "3" });
    expect(engancheDe({ impactoIndicador: "4" })).toEqual({ clave: "impactoIndicador", valor: "4" });
    // El primero que llega manda aunque no sirva: no se cae al siguiente.
    expect(engancheDe({ medicion: "x", verificacion: "2" })).toEqual({ clave: "medicion", valor: "x" });
    // Uno vacío no llegó.
    expect(engancheDe({ medicion: "", verificacion: "2" })).toEqual({ clave: "verificacion", valor: "2" });
  });
});

describe("rutaDeRegistro", () => {
  it("lleva solo los parámetros que vienen, en un orden fijo y codificados", () => {
    expect(rutaDeRegistro({})).toBe("/mejoramiento/nuevo");
    expect(rutaDeRegistro({ documento: "FAR-PR-04", plan: "5" })).toBe("/mejoramiento/nuevo?plan=5&documento=FAR-PR-04");
    expect(rutaDeRegistro({ indicador: "SGC-ID-004", proceso: "farmacia", documento: "" })).toBe(
      "/mejoramiento/nuevo?indicador=SGC-ID-004&proceso=farmacia",
    );
    expect(rutaDeRegistro({ documento: "A B&C" })).toBe("/mejoramiento/nuevo?documento=A+B%26C");
    expect(rutaDeRegistro({ impactoIndicador: "9", medicion: "7", verificacion: "8", impacto: "6" })).toBe(
      "/mejoramiento/nuevo?medicion=7&verificacion=8&impacto=6&impactoIndicador=9",
    );
  });
});
