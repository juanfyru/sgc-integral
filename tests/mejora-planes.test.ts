/**
 * El plan de mejoramiento y la clasificación de un hallazgo (Fase 15B, Tarea 2; anexo §3.1 a §3.6, §3.10 y §10.4): crear,
 * editar y anular un plan; poner, sacar y cambiar un hallazgo de plan; el objetivo de un hallazgo, también de uno cerrado; lo
 * que guarda el registro; y quién ve un plan. Contra la BD de trabajo, dentro de una transacción que se revierte. Las vigencias
 * de los códigos son lejanas (2090 a 2099): ningún plan confirmado las usa.
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import type { TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { enTransaccion } from "@/db/consultas/flujo/contrato";
import {
  bloquearPlanDelRegistro,
  cambiarDePlan,
  clasificacionDe,
  clasificarAlNacer,
  ponerEnPlan,
  ponerObjetivo,
  sacarDelPlan,
} from "@/db/consultas/mejoramiento/clasificacion";
import { anularPlan, bloquearPlan, editarPlan, type DatosDePlan } from "@/db/consultas/mejoramiento/planes";
import { anularHallazgo, registrarHallazgo } from "@/db/consultas/mejoramiento/registro";
import { puedeVerPlan } from "@/lib/alcance";
import {
  FALTA_LA_FECHA_DEL_ENTE,
  MOTIVO_CORTO,
  NO_CUENTA_PARA_PLAN,
  NO_ESTA_EN_UN_PLAN,
  OBJETIVO_INACTIVO,
  PLAN_ANULADO,
  PLAN_CON_HALLAZGOS,
  PLAN_NO_EXISTE,
  YA_EN_UN_PLAN,
} from "@/lib/mejoramiento/planes";
import { ErrorPermiso } from "@/lib/permisos";
import {
  actividadPorSql,
  baseDeMejora,
  c,
  datosDeHallazgo,
  hallazgoEn,
  otroProcesoConLider,
  planDeMejoraDePrueba,
  type BaseDeMejora,
} from "./utiles/mejoramiento";
import { revertida } from "./utiles/transaccion";
import { usuarioDePrueba } from "./utiles/tramites";

const sql = obtenerSql();
afterAll(() => sql.end());

const AHORA = "2026-11-17T15:00:00Z";
const o = (tx: TransactionSql) => c(AHORA, tx);
const MOTIVO = "El hallazgo corresponde a otro evento";

let objetivos = 0;

/** Un objetivo del maestro, activo por omisión. */
async function objetivoDePrueba(tx: TransactionSql, activo = true): Promise<{ id: number; enunciado: string }> {
  objetivos += 1;
  const enunciado = `Objetivo de prueba ${Date.now()}-${objetivos}`;
  const [f] = await tx`INSERT INTO objetivos (clase, enunciado, orden, activo) VALUES ('calidad', ${enunciado}, 999, ${activo}) RETURNING id`;
  return { id: Number(f.id), enunciado };
}

/** Un hallazgo que registra Control Interno en el proceso de la base. */
async function hallazgoNuevo(tx: TransactionSql, b: BaseDeMejora, titulo = "Formatos de entrega de turno sin diligenciar") {
  return registrarHallazgo(b.control, datosDeHallazgo(b.procesoId, { titulo }), o(tx));
}

const eventosDe = (tx: TransactionSql, planId: number) =>
  tx`SELECT tipo, hallazgo_id, detalle, usuario_id FROM mejora_plan_eventos WHERE plan_id = ${planId} ORDER BY id`;

const bitacora = (tx: TransactionSql, accion: string, entidadId: number) =>
  tx`SELECT entidad, detalle, usuario_id FROM auditoria WHERE accion = ${accion} AND entidad_id = ${entidadId} ORDER BY id`;

async function clasificacion(tx: TransactionSql, hallazgoId: number): Promise<{ plan: number | null; objetivo: number | null } | null> {
  const [f] = await tx`SELECT plan_id, objetivo_id FROM mejora_clasificacion WHERE hallazgo_id = ${hallazgoId}`;
  if (!f) return null;
  return { plan: f.plan_id === null ? null : Number(f.plan_id), objetivo: f.objetivo_id === null ? null : Number(f.objetivo_id) };
}

async function filaDelHallazgo(tx: TransactionSql, id: number): Promise<unknown> {
  const [f] = await tx`SELECT to_jsonb(h) AS fila FROM mejora_hallazgos h WHERE h.id = ${id}`;
  return f.fila;
}

async function eventosDelHallazgo(tx: TransactionSql, id: number): Promise<number> {
  const [f] = await tx`SELECT count(*)::int AS n FROM mejora_eventos WHERE hallazgo_id = ${id}`;
  return Number(f.n);
}

describe("crear un plan", () => {
  it("como Control Interno da PM-<vigencia>-01, después -02; otra vigencia empieza en -01; deja su evento y su bitácora", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const nombre = "Auditoría de cumplimiento vigencia 2025";
      const uno = await planDeMejoraDePrueba(tx, b.control, { nombre, vigencia: 2093, objetivoTexto: "Cerrar las brechas de la cadena de frío" });
      const dos = await planDeMejoraDePrueba(tx, b.control, { vigencia: 2093 });
      const otro = await planDeMejoraDePrueba(tx, b.admin, { vigencia: 2094 });
      expect(uno.codigo).toBe("PM-2093-01");
      expect(dos.codigo).toBe("PM-2093-02");
      expect(otro.codigo).toBe("PM-2094-01");

      const [p] = await tx`SELECT codigo, vigencia, consecutivo, nombre, objetivo_texto, creado_por, anulado_en FROM mejora_planes WHERE id = ${uno.id}`;
      expect(p).toMatchObject({ codigo: "PM-2093-01", vigencia: 2093, consecutivo: 1, nombre, objetivo_texto: "Cerrar las brechas de la cadena de frío" });
      expect(Number(p.creado_por)).toBe(b.control.usuarioId);
      expect(p.anulado_en).toBeNull();

      const eventos = await eventosDe(tx, uno.id);
      expect(eventos.map((e) => e.tipo)).toEqual(["creado"]);
      expect(eventos[0].hallazgo_id).toBeNull();
      expect(Number(eventos[0].usuario_id)).toBe(b.control.usuarioId);
      expect(eventos[0].detalle.objetivoTexto).toBe("Cerrar las brechas de la cadena de frío");

      const [fila] = await bitacora(tx, "mejora_plan_crear", uno.id);
      expect(fila.entidad).toBe("mejora_plan");
      expect(fila.detalle).toMatchObject({ codigo: "PM-2093-01", nombre });
      expect(JSON.stringify(fila.detalle)).not.toContain("brechas");
      expect(fila.detalle).not.toHaveProperty("objetivoTexto");
    });
  });

  it("como líder o como Gerencia lanza por permiso", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      await expect(planDeMejoraDePrueba(tx, b.lider)).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(planDeMejoraDePrueba(tx, b.gerencia)).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(planDeMejoraDePrueba(tx, b.consulta)).rejects.toBeInstanceOf(ErrorPermiso);
    });
  });

  it("la fecha del ente: obligatoria con «Ente de control», opcional con «Auditoría externa» y nula con un origen interno", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const limite = async (id: number) =>
        (await tx`SELECT to_char(fecha_limite_ente, 'YYYY-MM-DD') AS f FROM mejora_planes WHERE id = ${id}`)[0].f as string | null;
      await expect(planDeMejoraDePrueba(tx, b.control, { origen: "ente_control" })).rejects.toThrow(FALTA_LA_FECHA_DEL_ENTE);
      const ente = await planDeMejoraDePrueba(tx, b.control, { origen: "ente_control", fechaLimiteEnte: "2026-12-15" });
      expect(await limite(ente.id)).toBe("2026-12-15");
      const externaSin = await planDeMejoraDePrueba(tx, b.control, { origen: "auditoria_externa" });
      expect(await limite(externaSin.id)).toBeNull();
      const externaCon = await planDeMejoraDePrueba(tx, b.control, { origen: "auditoria_externa", fechaLimiteEnte: "2027-01-20" });
      expect(await limite(externaCon.id)).toBe("2027-01-20");
      const interna = await planDeMejoraDePrueba(tx, b.control, { origen: "auditoria_interna", fechaLimiteEnte: "2026-12-15" });
      expect(await limite(interna.id)).toBeNull();
    });
  });

  it("el objetivo debe estar activo al elegirlo", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const inactivo = await objetivoDePrueba(tx, false);
      await expect(planDeMejoraDePrueba(tx, b.control, { objetivoId: inactivo.id })).rejects.toThrow(OBJETIVO_INACTIVO);
      const activo = await objetivoDePrueba(tx);
      const p = await planDeMejoraDePrueba(tx, b.control, { objetivoId: activo.id });
      expect((await bloquearPlan(tx, p.id)).objetivoId).toBe(activo.id);
    });
  });
});

describe("editar y anular un plan", () => {
  it("editar deja el evento con el antes y el después de lo que cambió y no toca los hallazgos que ya están en el plan", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const datos: Partial<DatosDePlan> = {
        nombre: "Visita de la Secretaría de Salud",
        origen: "ente_control",
        fechaEvento: "2026-10-20",
        fechaLimiteEnte: "2026-12-15",
      };
      const p = await planDeMejoraDePrueba(tx, b.control, datos);
      const h = await registrarHallazgo(
        b.control,
        datosDeHallazgo(b.procesoId, { origen: "ente_control", fuente: "Secretaría de Salud", fechaLimiteEnte: "2026-12-20" }),
        o(tx),
      );
      await ponerEnPlan(b.control, { planId: p.id, hallazgoIds: [h.id] }, o(tx));
      const antes = await filaDelHallazgo(tx, h.id);

      await editarPlan(
        b.control,
        p.id,
        { nombre: "Visita de seguimiento de la Secretaría", origen: "auditoria_externa", fechaEvento: "2026-10-20", fechaLimiteEnte: "2027-01-31" },
        o(tx),
      );

      const plan = await bloquearPlan(tx, p.id);
      expect(plan).toMatchObject({ nombre: "Visita de seguimiento de la Secretaría", origen: "auditoria_externa", fechaLimiteEnte: "2027-01-31" });
      const editado = (await eventosDe(tx, p.id)).find((e) => e.tipo === "editado")!;
      expect(editado.detalle).toEqual({
        antes: { nombre: "Visita de la Secretaría de Salud", origen: "ente_control", fechaLimiteEnte: "2026-12-15" },
        despues: { nombre: "Visita de seguimiento de la Secretaría", origen: "auditoria_externa", fechaLimiteEnte: "2027-01-31" },
      });
      const [fila] = await bitacora(tx, "mejora_plan_editar", p.id);
      expect(fila.detalle.campos).toEqual(["nombre", "origen", "fechaLimiteEnte"]);
      expect(await filaDelHallazgo(tx, h.id)).toEqual(antes);
    });
  });

  it("editar sin cambios lo dice; la vigencia no se edita", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const p = await planDeMejoraDePrueba(tx, b.control, { nombre: "Revisión por la dirección 2026", fechaEvento: "2026-06-30", vigencia: 2096 });
      await expect(
        editarPlan(b.control, p.id, { nombre: "Revisión por la dirección 2026", origen: "auditoria_interna", fechaEvento: "2026-06-30" }, o(tx)),
      ).rejects.toThrow("No cambió ningún dato del plan");
      await expect(
        editarPlan(b.control, p.id, { nombre: "Otro nombre", origen: "auditoria_interna", fechaEvento: "2026-06-30", vigencia: 2097 } as never, o(tx)),
      ).rejects.toThrow();
      expect((await bloquearPlan(tx, p.id)).vigencia).toBe(2096);
      await expect(editarPlan(b.lider, p.id, { nombre: "Otro nombre", origen: "auditoria_interna", fechaEvento: "2026-06-30" }, o(tx))).rejects.toBeInstanceOf(
        ErrorPermiso,
      );
      await expect(editarPlan(b.control, 2_000_000_000, { nombre: "Otro nombre", origen: "pamec", fechaEvento: "2026-06-30" }, o(tx))).rejects.toThrow(
        PLAN_NO_EXISTE,
      );
    });
  });

  it("un objetivo que se desactivó se conserva al editar, y no se puede elegir otro inactivo", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const objetivo = await objetivoDePrueba(tx);
      const p = await planDeMejoraDePrueba(tx, b.control, { nombre: "Plan con objetivo", fechaEvento: "2026-06-30", objetivoId: objetivo.id });
      await tx`UPDATE objetivos SET activo = false WHERE id = ${objetivo.id}`;
      await editarPlan(b.control, p.id, { nombre: "Plan con objetivo, renombrado", origen: "auditoria_interna", fechaEvento: "2026-06-30", objetivoId: objetivo.id }, o(tx));
      expect((await bloquearPlan(tx, p.id)).objetivoId).toBe(objetivo.id);
      const otro = await objetivoDePrueba(tx, false);
      await expect(
        editarPlan(b.control, p.id, { nombre: "Plan con objetivo, renombrado", origen: "auditoria_interna", fechaEvento: "2026-06-30", objetivoId: otro.id }, o(tx)),
      ).rejects.toThrow(OBJETIVO_INACTIVO);
    });
  });

  it("anular: con hallazgos no; con un motivo corto no; con motivo queda anulado y su código no se reutiliza", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const conHallazgo = await planDeMejoraDePrueba(tx, b.control, { vigencia: 2098 });
      const h = await hallazgoNuevo(tx, b);
      await ponerEnPlan(b.control, { planId: conHallazgo.id, hallazgoIds: [h.id] }, o(tx));
      await expect(anularPlan(b.control, { planId: conHallazgo.id, motivo: MOTIVO }, o(tx))).rejects.toThrow(PLAN_CON_HALLAZGOS);

      const vacio = await planDeMejoraDePrueba(tx, b.control, { vigencia: 2095 });
      expect(vacio.codigo).toBe("PM-2095-01");
      await expect(anularPlan(b.control, { planId: vacio.id, motivo: "123456789" }, o(tx))).rejects.toThrow(MOTIVO_CORTO);
      await expect(anularPlan(b.lider, { planId: vacio.id, motivo: MOTIVO }, o(tx))).rejects.toBeInstanceOf(ErrorPermiso);
      await anularPlan(b.control, { planId: vacio.id, motivo: "El evento se registró dos veces" }, o(tx));

      const [p] = await tx`SELECT anulado_en, anulado_por, anulado_motivo FROM mejora_planes WHERE id = ${vacio.id}`;
      expect(p.anulado_en).toEqual(new Date(AHORA));
      expect(Number(p.anulado_por)).toBe(b.control.usuarioId);
      expect(p.anulado_motivo).toBe("El evento se registró dos veces");
      expect((await bloquearPlan(tx, vacio.id)).anulado).toBe(true);
      const anulado = (await eventosDe(tx, vacio.id)).find((e) => e.tipo === "anulado")!;
      expect(anulado.detalle.motivo).toBe("El evento se registró dos veces");
      const [fila] = await bitacora(tx, "mejora_plan_anular", vacio.id);
      expect(fila.detalle).toMatchObject({ codigo: "PM-2095-01" });
      expect(JSON.stringify(fila.detalle)).not.toContain("dos veces");

      await expect(editarPlan(b.control, vacio.id, { nombre: "Otro nombre", origen: "pamec", fechaEvento: "2026-06-30" }, o(tx))).rejects.toThrow(PLAN_ANULADO);
      const otro = await hallazgoNuevo(tx, b, "Otro hallazgo");
      await expect(ponerEnPlan(b.control, { planId: vacio.id, hallazgoIds: [otro.id] }, o(tx))).rejects.toThrow(PLAN_ANULADO);
      await expect(anularPlan(b.control, { planId: vacio.id, motivo: MOTIVO }, o(tx))).rejects.toThrow(PLAN_ANULADO);
      expect((await planDeMejoraDePrueba(tx, b.control, { vigencia: 2095 })).codigo).toBe("PM-2095-02");
    });
  });
});

describe("poner un hallazgo en un plan", () => {
  it("un hallazgo cerrado entra sin que su fila ni sus eventos cambien", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "cerrado");
      const p = await planDeMejoraDePrueba(tx, b.control);
      const antes = await filaDelHallazgo(tx, h.id);
      const eventos = await eventosDelHallazgo(tx, h.id);
      await ponerEnPlan(b.control, { planId: p.id, hallazgoIds: [h.id] }, o(tx));
      expect(await filaDelHallazgo(tx, h.id)).toEqual(antes);
      expect(await eventosDelHallazgo(tx, h.id)).toBe(eventos);
      expect(await clasificacion(tx, h.id)).toEqual({ plan: p.id, objetivo: null });
      const entra = (await eventosDe(tx, p.id)).filter((e) => e.tipo === "entra");
      expect(entra).toHaveLength(1);
      expect(Number(entra[0].hallazgo_id)).toBe(h.id);
      const [fila] = await bitacora(tx, "mejora_plan_entra", p.id);
      expect(fila.entidad).toBe("mejora_plan");
      expect(fila.detalle).toMatchObject({ codigo: p.codigo, hallazgoId: h.id, hallazgo: h.codigo });
    });
  });

  it("varios a la vez, con un evento por hallazgo; uno anulado, uno que ya está en otro plan o un plan anulado no", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const p = await planDeMejoraDePrueba(tx, b.control);
      const otro = await planDeMejoraDePrueba(tx, b.control);
      const [h1, h2, h3] = [await hallazgoNuevo(tx, b, "Uno"), await hallazgoNuevo(tx, b, "Dos"), await hallazgoNuevo(tx, b, "Tres")];
      await ponerEnPlan(b.control, { planId: p.id, hallazgoIds: [h2.id, h1.id] }, o(tx));
      const entra = (await eventosDe(tx, p.id)).filter((e) => e.tipo === "entra").map((e) => Number(e.hallazgo_id));
      expect(entra).toEqual([h1.id, h2.id]);

      await expect(ponerEnPlan(b.control, { planId: otro.id, hallazgoIds: [h1.id] }, o(tx))).rejects.toThrow(YA_EN_UN_PLAN);
      await expect(ponerEnPlan(b.control, { planId: p.id, hallazgoIds: [h1.id] }, o(tx))).rejects.toThrow(YA_EN_UN_PLAN);
      // Todo o nada: el que sí podía entrar tampoco entra.
      await expect(ponerEnPlan(b.control, { planId: otro.id, hallazgoIds: [h3.id, h2.id] }, o(tx))).rejects.toThrow(YA_EN_UN_PLAN);
      expect(await clasificacion(tx, h3.id)).toBeNull();

      const anulado = await hallazgoNuevo(tx, b, "Anulado");
      await anularHallazgo(b.admin, { hallazgoId: anulado.id, justificacion: "Se registró por error dos veces" }, o(tx));
      await expect(ponerEnPlan(b.control, { planId: p.id, hallazgoIds: [anulado.id] }, o(tx))).rejects.toThrow(NO_CUENTA_PARA_PLAN);

      const vacio = await planDeMejoraDePrueba(tx, b.control);
      await anularPlan(b.control, { planId: vacio.id, motivo: MOTIVO }, o(tx));
      await expect(ponerEnPlan(b.control, { planId: vacio.id, hallazgoIds: [h3.id] }, o(tx))).rejects.toThrow(PLAN_ANULADO);
      await expect(ponerEnPlan(b.control, { planId: 2_000_000_000, hallazgoIds: [h3.id] }, o(tx))).rejects.toThrow(PLAN_NO_EXISTE);
      await expect(ponerEnPlan(b.lider, { planId: p.id, hallazgoIds: [h3.id] }, o(tx))).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(ponerEnPlan(b.control, { planId: p.id, hallazgoIds: [] }, o(tx))).rejects.toThrow("Elija al menos un hallazgo");
    });
  });

  it("el objetivo del plan: lo recibe el que no tiene, el que tiene uno lo conserva y con conObjetivo falso no lo recibe", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const delPlan = await objetivoDePrueba(tx);
      const propio = await objetivoDePrueba(tx);
      const p = await planDeMejoraDePrueba(tx, b.control, { objetivoId: delPlan.id });
      const otro = await planDeMejoraDePrueba(tx, b.control, { objetivoId: delPlan.id });
      const [sin, con, desmarcado] = [await hallazgoNuevo(tx, b, "Sin objetivo"), await hallazgoNuevo(tx, b, "Con objetivo"), await hallazgoNuevo(tx, b, "Desmarcado")];
      await ponerObjetivo(b.control, { hallazgoId: con.id, objetivoId: propio.id }, o(tx));

      await ponerEnPlan(b.control, { planId: p.id, hallazgoIds: [sin.id, con.id] }, o(tx));
      expect(await clasificacion(tx, sin.id)).toEqual({ plan: p.id, objetivo: delPlan.id });
      expect(await clasificacion(tx, con.id)).toEqual({ plan: p.id, objetivo: propio.id });
      const [rastro] = await bitacora(tx, "mejora_objetivo", sin.id);
      expect(rastro.entidad).toBe("mejora_hallazgo");
      expect(rastro.detalle).toMatchObject({ codigo: sin.codigo, antes: null, despues: { id: delPlan.id, enunciado: delPlan.enunciado }, plan: p.codigo });
      expect(await bitacora(tx, "mejora_objetivo", con.id)).toHaveLength(1);

      await ponerEnPlan(b.control, { planId: otro.id, hallazgoIds: [desmarcado.id], conObjetivo: false }, o(tx));
      expect(await clasificacion(tx, desmarcado.id)).toEqual({ plan: otro.id, objetivo: null });
      expect(await bitacora(tx, "mejora_objetivo", desmarcado.id)).toHaveLength(0);
    });
  });
});

describe("sacar y cambiar de plan", () => {
  it("sacar pide motivo, lo deja en el evento y no en la bitácora; la fila queda con el objetivo o se borra", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const objetivo = await objetivoDePrueba(tx);
      const p = await planDeMejoraDePrueba(tx, b.control);
      const [conObjetivo, sinObjetivo] = [await hallazgoNuevo(tx, b, "Con objetivo"), await hallazgoNuevo(tx, b, "Sin objetivo")];
      await ponerObjetivo(b.control, { hallazgoId: conObjetivo.id, objetivoId: objetivo.id }, o(tx));
      await ponerEnPlan(b.control, { planId: p.id, hallazgoIds: [conObjetivo.id, sinObjetivo.id] }, o(tx));

      await expect(sacarDelPlan(b.control, { hallazgoId: conObjetivo.id, motivo: "" }, o(tx))).rejects.toThrow(MOTIVO_CORTO);
      await expect(sacarDelPlan(b.lider, { hallazgoId: conObjetivo.id, motivo: MOTIVO }, o(tx))).rejects.toBeInstanceOf(ErrorPermiso);
      await sacarDelPlan(b.control, { hallazgoId: conObjetivo.id, motivo: MOTIVO }, o(tx));
      await sacarDelPlan(b.admin, { hallazgoId: sinObjetivo.id, motivo: MOTIVO }, o(tx));
      expect(await clasificacion(tx, conObjetivo.id)).toEqual({ plan: null, objetivo: objetivo.id });
      expect(await clasificacion(tx, sinObjetivo.id)).toBeNull();

      const sale = (await eventosDe(tx, p.id)).filter((e) => e.tipo === "sale");
      expect(sale.map((e) => Number(e.hallazgo_id))).toEqual([conObjetivo.id, sinObjetivo.id]);
      expect(sale[0].detalle.motivo).toBe(MOTIVO);
      const filas = await bitacora(tx, "mejora_plan_sale", p.id);
      expect(filas).toHaveLength(2);
      expect(filas[0].detalle).toMatchObject({ codigo: p.codigo, hallazgoId: conObjetivo.id, hallazgo: conObjetivo.codigo });
      expect(JSON.stringify(filas)).not.toContain(MOTIVO);

      await expect(sacarDelPlan(b.control, { hallazgoId: sinObjetivo.id, motivo: MOTIVO }, o(tx))).rejects.toThrow(NO_ESTA_EN_UN_PLAN);
    });
  });

  it("un hallazgo anulado dentro del plan se queda en él; se puede sacar, y vacío el plan se anula", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const p = await planDeMejoraDePrueba(tx, b.control);
      const h = await hallazgoNuevo(tx, b);
      await ponerEnPlan(b.control, { planId: p.id, hallazgoIds: [h.id] }, o(tx));
      await anularHallazgo(b.admin, { hallazgoId: h.id, justificacion: "Se registró por error dos veces" }, o(tx));
      expect(await clasificacion(tx, h.id)).toEqual({ plan: p.id, objetivo: null });
      await expect(anularPlan(b.control, { planId: p.id, motivo: MOTIVO }, o(tx))).rejects.toThrow(PLAN_CON_HALLAZGOS);
      const antes = await filaDelHallazgo(tx, h.id);
      await sacarDelPlan(b.control, { hallazgoId: h.id, motivo: MOTIVO }, o(tx));
      expect(await filaDelHallazgo(tx, h.id)).toEqual(antes);
      await anularPlan(b.control, { planId: p.id, motivo: MOTIVO }, o(tx));
      expect((await bloquearPlan(tx, p.id)).anulado).toBe(true);
    });
  });

  it("cambiar de plan deja un «sale» en uno y un «entra» en el otro, en una transacción", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const objetivo = await objetivoDePrueba(tx);
      const origen = await planDeMejoraDePrueba(tx, b.control);
      const destino = await planDeMejoraDePrueba(tx, b.control, { objetivoId: objetivo.id });
      const h = await hallazgoEn(tx, b, "cerrado");
      await ponerEnPlan(b.control, { planId: origen.id, hallazgoIds: [h.id] }, o(tx));
      const antes = await filaDelHallazgo(tx, h.id);

      await expect(cambiarDePlan(b.control, { hallazgoId: h.id, planId: origen.id, motivo: MOTIVO }, o(tx))).rejects.toThrow(YA_EN_UN_PLAN);
      await expect(cambiarDePlan(b.control, { hallazgoId: h.id, planId: destino.id, motivo: "corto" }, o(tx))).rejects.toThrow(MOTIVO_CORTO);
      await cambiarDePlan(b.control, { hallazgoId: h.id, planId: destino.id, motivo: MOTIVO }, o(tx));

      expect(await clasificacion(tx, h.id)).toEqual({ plan: destino.id, objetivo: objetivo.id });
      expect(await filaDelHallazgo(tx, h.id)).toEqual(antes);
      const sale = (await eventosDe(tx, origen.id)).filter((e) => e.tipo === "sale");
      const entra = (await eventosDe(tx, destino.id)).filter((e) => e.tipo === "entra");
      expect(sale).toHaveLength(1);
      expect(entra).toHaveLength(1);
      expect(sale[0].detalle).toMatchObject({ motivo: MOTIVO, haciaPlanId: destino.id });
      expect(entra[0].detalle).toMatchObject({ motivo: MOTIVO, desdePlanId: origen.id });
      expect((await bitacora(tx, "mejora_plan_sale", origen.id))[0].detalle).toMatchObject({ hacia: destino.codigo });
      expect((await bitacora(tx, "mejora_plan_entra", destino.id))[0].detalle).toMatchObject({ desde: origen.codigo });

      // A un plan anulado no se cambia: el hallazgo se queda donde estaba y no queda ningún evento.
      const anulado = await planDeMejoraDePrueba(tx, b.control);
      await anularPlan(b.control, { planId: anulado.id, motivo: MOTIVO }, o(tx));
      await expect(cambiarDePlan(b.control, { hallazgoId: h.id, planId: anulado.id, motivo: MOTIVO }, o(tx))).rejects.toThrow(PLAN_ANULADO);
      expect(await clasificacion(tx, h.id)).toEqual({ plan: destino.id, objetivo: objetivo.id });
      expect((await eventosDe(tx, destino.id)).filter((e) => e.tipo === "sale")).toHaveLength(0);

      const suelto = await hallazgoNuevo(tx, b, "Suelto");
      await expect(cambiarDePlan(b.control, { hallazgoId: suelto.id, planId: destino.id, motivo: MOTIVO }, o(tx))).rejects.toThrow(NO_ESTA_EN_UN_PLAN);
    });
  });
});

describe("el objetivo de un hallazgo", () => {
  it("se pone, se cambia y se quita sobre un hallazgo cerrado, con su rastro en la bitácora; uno inactivo no", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "cerrado");
      const [uno, dos, inactivo] = [await objetivoDePrueba(tx), await objetivoDePrueba(tx), await objetivoDePrueba(tx, false)];
      const antes = await filaDelHallazgo(tx, h.id);

      await ponerObjetivo(b.control, { hallazgoId: h.id, objetivoId: uno.id }, o(tx));
      expect(await clasificacion(tx, h.id)).toEqual({ plan: null, objetivo: uno.id });
      await ponerObjetivo(b.admin, { hallazgoId: h.id, objetivoId: dos.id }, o(tx));
      expect(await clasificacion(tx, h.id)).toEqual({ plan: null, objetivo: dos.id });
      await expect(ponerObjetivo(b.control, { hallazgoId: h.id, objetivoId: inactivo.id }, o(tx))).rejects.toThrow(OBJETIVO_INACTIVO);
      await expect(ponerObjetivo(b.lider, { hallazgoId: h.id, objetivoId: uno.id }, o(tx))).rejects.toBeInstanceOf(ErrorPermiso);
      await ponerObjetivo(b.control, { hallazgoId: h.id, objetivoId: null }, o(tx));
      expect(await clasificacion(tx, h.id)).toBeNull();
      expect(await filaDelHallazgo(tx, h.id)).toEqual(antes);

      const filas = await bitacora(tx, "mejora_objetivo", h.id);
      expect(filas.map((f) => f.detalle)).toEqual([
        { codigo: h.codigo, antes: null, despues: { id: uno.id, enunciado: uno.enunciado } },
        { codigo: h.codigo, antes: { id: uno.id, enunciado: uno.enunciado }, despues: { id: dos.id, enunciado: dos.enunciado } },
        { codigo: h.codigo, antes: { id: dos.id, enunciado: dos.enunciado }, despues: null },
      ]);
      expect(filas.every((f) => f.entidad === "mejora_hallazgo")).toBe(true);
    });
  });

  it("quitar el objetivo de un hallazgo en un plan conserva el plan; clasificacionDe trae el plan y el objetivo", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const objetivo = await objetivoDePrueba(tx);
      const p = await planDeMejoraDePrueba(tx, b.control, { nombre: "Plan de la auditoría de noviembre", objetivoId: objetivo.id });
      const [h, suelto] = [await hallazgoNuevo(tx, b), await hallazgoNuevo(tx, b, "Suelto")];
      await ponerEnPlan(b.control, { planId: p.id, hallazgoIds: [h.id] }, o(tx));
      const mapa = await clasificacionDe(tx, [h.id, suelto.id]);
      expect(mapa.get(h.id)).toEqual({ planId: p.id, planCodigo: p.codigo, planNombre: "Plan de la auditoría de noviembre", objetivoId: objetivo.id, objetivo: objetivo.enunciado });
      expect(mapa.get(suelto.id)).toEqual({ planId: null, planCodigo: null, planNombre: null, objetivoId: null, objetivo: null });
      await ponerObjetivo(b.control, { hallazgoId: h.id, objetivoId: null }, o(tx));
      expect(await clasificacion(tx, h.id)).toEqual({ plan: p.id, objetivo: null });
      expect((await clasificacionDe(tx, [])).size).toBe(0);
    });
  });
});

describe("la clasificación al nacer", () => {
  it("un líder con plan guarda solo el objetivo, sin lanzar; Control Interno entra al plan con su evento", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const objetivo = await objetivoDePrueba(tx);
      const p = await planDeMejoraDePrueba(tx, b.control);
      const ahora = new Date(AHORA);

      const delLider = await registrarHallazgo(b.lider, datosDeHallazgo(b.procesoId, { titulo: "Del líder" }), o(tx));
      await clasificarAlNacer(tx, b.lider, delLider.id, { planId: p.id, objetivoId: objetivo.id }, ahora);
      expect(await clasificacion(tx, delLider.id)).toEqual({ plan: null, objetivo: objetivo.id });
      expect((await eventosDe(tx, p.id)).filter((e) => e.tipo === "entra")).toHaveLength(0);
      expect((await bitacora(tx, "mejora_objetivo", delLider.id))[0].detalle).toMatchObject({ antes: null, despues: { id: objetivo.id } });

      const deControl = await hallazgoNuevo(tx, b, "De Control Interno");
      await clasificarAlNacer(tx, b.control, deControl.id, { planId: p.id, objetivoId: null }, ahora);
      expect(await clasificacion(tx, deControl.id)).toEqual({ plan: p.id, objetivo: null });
      const entra = (await eventosDe(tx, p.id)).filter((e) => e.tipo === "entra");
      expect(entra.map((e) => Number(e.hallazgo_id))).toEqual([deControl.id]);
      expect(entra[0].detalle).toMatchObject({ alRegistrar: true });

      // Un plan que no existe o anulado se ignora en silencio; el objetivo se guarda igual.
      const vacio = await planDeMejoraDePrueba(tx, b.control);
      await anularPlan(b.control, { planId: vacio.id, motivo: MOTIVO }, o(tx));
      const [x, y, z] = [await hallazgoNuevo(tx, b, "X"), await hallazgoNuevo(tx, b, "Y"), await hallazgoNuevo(tx, b, "Z")];
      await clasificarAlNacer(tx, b.control, x.id, { planId: 2_000_000_000, objetivoId: objetivo.id }, ahora);
      await clasificarAlNacer(tx, b.control, y.id, { planId: vacio.id, objetivoId: null }, ahora);
      await clasificarAlNacer(tx, b.control, z.id, { planId: null, objetivoId: null }, ahora);
      expect(await clasificacion(tx, x.id)).toEqual({ plan: null, objetivo: objetivo.id });
      expect(await clasificacion(tx, y.id)).toBeNull();
      expect(await clasificacion(tx, z.id)).toBeNull();

      const inactivo = await objetivoDePrueba(tx, false);
      const w = await hallazgoNuevo(tx, b, "W");
      await expect(
        enTransaccion(tx, (sp) => clasificarAlNacer(sp, b.lider, w.id, { planId: null, objetivoId: inactivo.id }, ahora)),
      ).rejects.toThrow(OBJETIVO_INACTIVO);
    });
  });

  it("bloquearPlanDelRegistro, el primer candado del registro: solo con mejora.planes y un plan que existe y no está anulado", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      // Los dos planes, por SQL y sin historial: el `INSERT` de un evento toma `FOR KEY SHARE` sobre su plan (la llave foránea)
      // y marcaría la fila. Así, `xmax` de la fila es `0` mientras nadie la bloquea, y deja de serlo con el candado de fila.
      const planPorSql = async (consecutivo: number, anuladoEn: Date | null) => {
        const [f] = await tx`INSERT INTO mejora_planes (codigo, vigencia, consecutivo, nombre, origen, fecha_evento, creado_por,
            anulado_en, anulado_por, anulado_motivo)
          VALUES (${`PM-2090-0${consecutivo}`}, 2090, ${consecutivo}, 'Plan por SQL de la prueba', 'auditoria_interna', '2026-11-10',
            ${b.control.usuarioId}, ${anuladoEn}, ${anuladoEn ? b.control.usuarioId : null}, ${anuladoEn ? MOTIVO : null})
          RETURNING id, codigo`;
        return { id: Number(f.id), codigo: f.codigo as string };
      };
      const p = await planPorSql(1, null);
      const anulado = await planPorSql(2, new Date(AHORA));
      const bloqueado = async (id: number) => (await tx`SELECT xmax::text <> '0' AS si FROM mejora_planes WHERE id = ${id}`)[0].si as boolean;
      expect(await bloqueado(p.id)).toBe(false);
      expect(await bloqueado(anulado.id)).toBe(false);

      expect(await bloquearPlanDelRegistro(tx, b.lider, p.id)).toBeNull();
      expect(await bloquearPlanDelRegistro(tx, b.gerencia, p.id)).toBeNull();
      expect(await bloquearPlanDelRegistro(tx, b.control, null)).toBeNull();
      expect(await bloquearPlanDelRegistro(tx, b.control, 2_000_000_000)).toBeNull();
      expect(await bloquearPlanDelRegistro(tx, b.control, 0)).toBeNull();
      expect(await bloquearPlanDelRegistro(tx, b.control, anulado.id)).toBeNull();
      expect(await bloqueado(p.id)).toBe(false);
      expect(await bloqueado(anulado.id)).toBe(false);

      expect(await bloquearPlanDelRegistro(tx, b.admin, p.id)).toMatchObject({ id: p.id, codigo: p.codigo, anulado: false });
      expect(await bloqueado(p.id)).toBe(true);

      // Con el candado ya tomado, clasificarAlNacer lo vuelve a pedir sin esperar y el hallazgo entra al mismo plan.
      const h = await hallazgoNuevo(tx, b);
      await clasificarAlNacer(tx, b.admin, h.id, { planId: p.id, objetivoId: null }, new Date(AHORA));
      expect(await clasificacion(tx, h.id)).toEqual({ plan: p.id, objetivo: null });
    });
  });
});

describe("quién ve un plan", () => {
  it("quien ve todo, también vacío; el líder del proceso de un hallazgo y quien lo registró; nadie más", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const vacio = await planDeMejoraDePrueba(tx, b.control);
      const p = await planDeMejoraDePrueba(tx, b.control);
      const h = await hallazgoNuevo(tx, b);
      await ponerEnPlan(b.control, { planId: p.id, hallazgoIds: [h.id] }, o(tx));
      const persona = await usuarioDePrueba(tx, { rol: "consulta" });
      await actividadPorSql(tx, h.id, persona.usuarioId, { aprobada: true });

      for (const s of [b.gerencia, b.admin, b.control]) {
        expect(await puedeVerPlan(vacio.id, s, { sql: tx })).toBe(true);
        expect(await puedeVerPlan(p.id, s, { sql: tx })).toBe(true);
      }
      expect(await puedeVerPlan(p.id, b.lider, { sql: tx })).toBe(true);
      expect(await puedeVerPlan(vacio.id, b.lider, { sql: tx })).toBe(false);
      expect(await puedeVerPlan(p.id, otro.lider, { sql: tx })).toBe(false);
      expect(await puedeVerPlan(p.id, persona, { sql: tx })).toBe(false);
      expect(await puedeVerPlan(p.id, b.consulta, { sql: tx })).toBe(false);
      expect(await puedeVerPlan(2_000_000_000, b.gerencia, { sql: tx })).toBe(false);
      expect(await puedeVerPlan(0, b.gerencia, { sql: tx })).toBe(false);

      // Quien registró un hallazgo del plan lo ve aunque deje de liderar el proceso.
      const registrado = await registrarHallazgo(b.lider, datosDeHallazgo(b.procesoId, { titulo: "Lo registró el líder" }), o(tx));
      const suyo = await planDeMejoraDePrueba(tx, b.control);
      await ponerEnPlan(b.control, { planId: suyo.id, hallazgoIds: [registrado.id] }, o(tx));
      await tx`DELETE FROM usuario_procesos WHERE usuario_id = ${b.lider.usuarioId}`;
      expect(await puedeVerPlan(suyo.id, b.lider, { sql: tx })).toBe(true);
      expect(await puedeVerPlan(p.id, b.lider, { sql: tx })).toBe(false);
    });
  });
});
