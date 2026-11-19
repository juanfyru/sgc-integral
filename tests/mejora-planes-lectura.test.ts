/**
 * Las lecturas del plan de mejoramiento (Fase 15B, Tarea 4; anexo §3.4 a §3.6): la lista de planes, el plan con sus hallazgos
 * agrupados por proceso y su historial, los candidatos para añadir y la clasificación en la página del hallazgo. Las cifras, el
 * avance, los grupos y el historial de quien no ve todo salen solo de los hallazgos que ve completos: nada le dice que el plan
 * tiene más (restricciones, Review Focus 1). Contra la BD de trabajo, dentro de una transacción que se revierte; los planes van en
 * la vigencia 2099 y cada caso busca el suyo por su código.
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import type { TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { cambiarDePlan, ponerEnPlan, sacarDelPlan } from "@/db/consultas/mejoramiento/clasificacion";
import { leerHallazgo } from "@/db/consultas/mejoramiento/lectura";
import { anularPlan, dejarEventoDePlan } from "@/db/consultas/mejoramiento/planes";
import { candidatosParaPlan, leerPlan, listarPlanes, veAlgunPlan } from "@/db/consultas/mejoramiento/planes-lectura";
import { retirarHallazgo } from "@/db/consultas/mejoramiento/recorrido";
import { anularHallazgo, registrarHallazgo } from "@/db/consultas/mejoramiento/registro";
import { ErrorPermiso } from "@/lib/permisos";
import {
  actividadPorSql,
  baseDeMejora,
  c,
  datosDeHallazgo,
  hallazgoEn,
  HORA_DE_ESCENA,
  otroProcesoConLider,
  planDeMejoraDePrueba,
  type BaseDeMejora,
} from "./utiles/mejoramiento";
import { revertida } from "./utiles/transaccion";
import { usuarioDePrueba } from "./utiles/tramites";

const sql = obtenerSql();
afterAll(() => sql.end());

const o = (tx: TransactionSql) => c(HORA_DE_ESCENA, tx);
const lee = (tx: TransactionSql) => ({ sql: tx, ahora: new Date(HORA_DE_ESCENA) });
const MOTIVO = "El hallazgo corresponde a otro evento";

/** Un hallazgo que registra Control Interno en `procesoId`, a la hora de la escena. */
async function registrado(tx: TransactionSql, b: BaseDeMejora, procesoId: number, titulo: string, cambios?: Parameters<typeof datosDeHallazgo>[1]) {
  return registrarHallazgo(b.control, datosDeHallazgo(procesoId, { titulo, ...cambios }), o(tx));
}

/**
 * El plan de la escena (anexo §3.5): en el proceso A de la base, uno cerrado, uno con una actividad vencida y uno anulado (se
 * queda en el plan y deja de contar); en el proceso B, dos sin terminar, uno de ellos con otro origen y otro con una actividad
 * (sin vencer) de la líder de A, que lo ve solo por ella. Nadie más ve el plan: el líder de C no lidera ninguno de sus procesos.
 */
async function escena(tx: TransactionSql) {
  const b = await baseDeMejora(tx);
  const B = await otroProcesoConLider(tx);
  const C = await otroProcesoConLider(tx);
  const plan = await planDeMejoraDePrueba(tx, b.control, { nombre: "Auditoría de cumplimiento de la escena" });
  const cerrado = await hallazgoEn(tx, b, "cerrado", { titulo: "Escena A cerrado" });
  const vencido = await registrado(tx, b, b.procesoId, "Escena A con actividad vencida");
  await actividadPorSql(tx, vencido.id, b.lider.usuarioId, { fin: "2026-11-01" });
  const anulado = await registrado(tx, b, b.procesoId, "Escena A anulado");
  const b1 = await registrado(tx, b, B.procesoId, "Escena B primero");
  await actividadPorSql(tx, b1.id, b.lider.usuarioId, { fin: "2026-12-31" });
  const b2 = await registrado(tx, b, B.procesoId, "Escena B con otro origen", { origen: "autoevaluacion", fuente: "Autoevaluación de noviembre" });
  await ponerEnPlan(b.control, { planId: plan.id, hallazgoIds: [cerrado.id, vencido.id, anulado.id, b1.id, b2.id] }, o(tx));
  await anularHallazgo(b.admin, { hallazgoId: anulado.id, justificacion: "Se registró dos veces por error" }, o(tx));
  return { b, B, C, plan, cerrado, vencido, anulado, b1, b2 };
}

const delPlan = async (sesion: SesionFlujo, tx: TransactionSql, codigo: string, extra?: { anulados?: boolean }) =>
  (await listarPlanes(sesion, { q: codigo, ...extra }, lee(tx))).filter((p) => p.codigo === codigo);

describe("listarPlanes y leerPlan: quien ve todo", () => {
  it("Gerencia: cuatro hallazgos que cuentan (el anulado no), tres abiertos y uno con algo vencido; dos grupos y el historial entero", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const [fila] = await delPlan(e.b.gerencia, tx, e.plan.codigo);
      expect(fila).toMatchObject({ id: e.plan.id, codigo: e.plan.codigo, hallazgos: 4, abiertos: 3, conAlgoVencido: 1, estado: "abierto" });

      const plan = await leerPlan(e.b.gerencia, e.plan.id, lee(tx));
      expect(plan).not.toBeNull();
      expect(plan!.grupos.map((g) => g.procesoId).sort()).toEqual([e.b.procesoId, e.B.procesoId].sort());
      const filas = plan!.grupos.flatMap((g) => g.filas);
      expect(filas.find((f) => f.id === e.anulado.id)?.cuenta).toBe(false);
      expect(filas.filter((f) => f.cuenta).map((f) => f.id).sort()).toEqual([e.cerrado.id, e.vencido.id, e.b1.id, e.b2.id].sort());
      // El historial entero: la creación y la entrada de cada uno de los cinco.
      expect(plan!.historial.filter((h) => h.tipo === "entra").map((h) => h.hallazgo).sort()).toEqual(
        [e.cerrado, e.vencido, e.anulado, e.b1, e.b2].map((h) => h.codigo).sort(),
      );
      expect(plan!.historial.some((h) => h.tipo === "creado")).toBe(true);
      expect(plan!.puede).toEqual({ gestionar: false, verTodo: true, responder: false });
    }));

  it("Control Interno puede gestionarlo; el Admin SGC, además, responder al ente", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      expect((await leerPlan(e.b.control, e.plan.id, lee(tx)))!.puede).toEqual({ gestionar: true, verTodo: true, responder: false });
      expect((await leerPlan(e.b.admin, e.plan.id, lee(tx)))!.puede).toEqual({ gestionar: true, verTodo: true, responder: true });
    }));

  it("«Origen distinto» solo en el hallazgo cuyo origen no es el del plan", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const filas = (await leerPlan(e.b.gerencia, e.plan.id, lee(tx)))!.grupos.flatMap((g) => g.filas);
      expect(filas.filter((f) => f.origenDistinto).map((f) => f.id)).toEqual([e.b2.id]);
    }));
});

describe("listarPlanes y leerPlan: la líder de un proceso del plan", () => {
  it("cuenta solo los suyos y recibe un grupo, sin nada de los hallazgos de B aunque vea uno por su actividad; el historial trae la creación", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const [fila] = await delPlan(e.b.lider, tx, e.plan.codigo);
      expect(fila).toMatchObject({ hallazgos: 2, abiertos: 1, conAlgoVencido: 1, estado: "abierto" });

      const plan = await leerPlan(e.b.lider, e.plan.id, lee(tx));
      expect(plan).not.toBeNull();
      expect(plan!.grupos).toHaveLength(1);
      expect(plan!.grupos[0].procesoId).toBe(e.b.procesoId);
      // El anulado de su proceso sí, con su marca: así se entiende por qué el plan no se puede anular.
      expect(plan!.grupos[0].filas.map((f) => [f.id, f.cuenta])).toEqual(
        expect.arrayContaining([[e.cerrado.id, true], [e.vencido.id, true], [e.anulado.id, false]]),
      );
      expect(plan!.historial.some((h) => h.tipo === "creado")).toBe(true);
      expect(plan!.historial.filter((h) => h.tipo === "entra").map((h) => h.hallazgo).sort()).toEqual(
        [e.cerrado, e.vencido, e.anulado].map((h) => h.codigo).sort(),
      );
      expect(plan!.puede.verTodo).toBe(false);
      expect(plan!.puede.gestionar).toBe(false);
      // Ninguna huella de B: ni su código, ni su título, aunque vea B1 por su actividad.
      const todo = JSON.stringify(plan);
      for (const h of [e.b1, e.b2]) expect(todo).not.toContain(h.codigo);
      expect(todo).not.toContain("Escena B");
    }));

  it("del historial sin hallazgo, la líder lee solo la creación, la edición y la anulación: ni los archivos ni la respuesta al ente", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      for (const tipo of ["archivo", "archivo_quitado", "respuesta"]) {
        await dejarEventoDePlan(tx, { planId: e.plan.id, tipo, detalle: {}, usuarioId: e.b.admin.usuarioId, ahora: new Date(HORA_DE_ESCENA) });
      }
      const deGerencia = (await leerPlan(e.b.gerencia, e.plan.id, lee(tx)))!.historial.map((h) => h.tipo);
      expect(deGerencia).toEqual(expect.arrayContaining(["archivo", "archivo_quitado", "respuesta", "creado"]));
      const deLaLider = (await leerPlan(e.b.lider, e.plan.id, lee(tx)))!.historial.map((h) => h.tipo);
      expect(deLaLider).toContain("creado");
      for (const tipo of ["archivo", "archivo_quitado", "respuesta"]) expect(deLaLider).not.toContain(tipo);
    }));

  it("tampoco lee un archivo ni una respuesta que citen un hallazgo que ve completo: de los suyos, solo que entró o salió", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      for (const tipo of ["archivo", "respuesta"]) {
        await dejarEventoDePlan(tx, {
          planId: e.plan.id,
          hallazgoId: e.vencido.id,
          tipo,
          detalle: { hallazgo: e.vencido.codigo },
          usuarioId: e.b.admin.usuarioId,
          ahora: new Date(HORA_DE_ESCENA),
        });
      }
      const deGerencia = (await leerPlan(e.b.gerencia, e.plan.id, lee(tx)))!.historial;
      expect(deGerencia.filter((h) => h.hallazgo === e.vencido.codigo).map((h) => h.tipo).sort()).toEqual(["archivo", "entra", "respuesta"]);
      const deLaLider = (await leerPlan(e.b.lider, e.plan.id, lee(tx)))!.historial;
      expect(deLaLider.filter((h) => h.hallazgo === e.vencido.codigo).map((h) => h.tipo)).toEqual(["entra"]);
      for (const tipo of ["archivo", "respuesta"]) expect(deLaLider.map((h) => h.tipo)).not.toContain(tipo);
    }));

  it("el avance y el estado salen de lo que ve: con todo lo suyo terminado, «Cerrado»", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const B = await otroProcesoConLider(tx);
      const plan = await planDeMejoraDePrueba(tx, b.control);
      const cerrado = await hallazgoEn(tx, b, "cerrado", { titulo: "Lo suyo, cerrado" });
      const ajeno = await registrado(tx, b, B.procesoId, "Lo ajeno, abierto");
      await ponerEnPlan(b.control, { planId: plan.id, hallazgoIds: [cerrado.id, ajeno.id] }, o(tx));
      const [suya] = await delPlan(b.lider, tx, plan.codigo);
      expect(suya).toMatchObject({ estado: "cerrado", hallazgos: 1, abiertos: 0 });
      const [ajena] = await delPlan(B.lider, tx, plan.codigo);
      expect(ajena).toMatchObject({ estado: "abierto", hallazgos: 1, abiertos: 1, avance: null });
    }));
});

describe("quien no ve el plan", () => {
  it("el líder de otro proceso no lo encuentra en la lista y leerPlan da nulo, como un id que no existe", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      expect(await delPlan(e.C.lider, tx, e.plan.codigo)).toEqual([]);
      expect(await leerPlan(e.C.lider, e.plan.id, lee(tx))).toBeNull();
      expect(await leerPlan(e.b.gerencia, 999_999_999, lee(tx))).toBeNull();
      expect(await leerPlan(e.b.gerencia, -1, lee(tx))).toBeNull();
      expect(await leerPlan(e.b.consulta, e.plan.id, lee(tx))).toBeNull();
    }));

  it("un plan sin hallazgos lo ve Control Interno («Sin hallazgos») y no la líder", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const plan = await planDeMejoraDePrueba(tx, b.control);
      const [fila] = await delPlan(b.control, tx, plan.codigo);
      expect(fila).toMatchObject({ estado: "sin_hallazgos", hallazgos: 0, abiertos: 0, conAlgoVencido: 0, avance: null });
      expect((await leerPlan(b.control, plan.id, lee(tx)))?.grupos).toEqual([]);
      expect(await delPlan(b.lider, tx, plan.codigo)).toEqual([]);
      expect(await leerPlan(b.lider, plan.id, lee(tx))).toBeNull();
    }));

  it("un plan anulado aparece solo con `anulados: true`, y nunca a la líder", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const plan = await planDeMejoraDePrueba(tx, b.control);
      await anularPlan(b.control, { planId: plan.id, motivo: "Se creó dos veces por error" }, o(tx));
      expect(await delPlan(b.gerencia, tx, plan.codigo)).toEqual([]);
      const [fila] = await delPlan(b.gerencia, tx, plan.codigo, { anulados: true });
      expect(fila).toMatchObject({ estado: "anulado" });
      expect((await leerPlan(b.gerencia, plan.id, lee(tx)))?.anuladoMotivo).toBe("Se creó dos veces por error");
      expect(await delPlan(b.lider, tx, plan.codigo, { anulados: true })).toEqual([]);
    }));
});

describe("el avance del plan", () => {
  it("el promedio de los que tienen plan de acción aprobado: 75 y 30, y uno sin él, dan 53", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const plan = await planDeMejoraDePrueba(tx, b.control);
      const h75 = await registrado(tx, b, b.procesoId, "Con avance 75");
      await actividadPorSql(tx, h75.id, b.lider.usuarioId, { avance: 75 });
      const h30 = await registrado(tx, b, b.procesoId, "Con avance 30");
      await actividadPorSql(tx, h30.id, b.lider.usuarioId, { avance: 30 });
      const sin = await registrado(tx, b, b.procesoId, "Sin plan de acción aprobado");
      await actividadPorSql(tx, sin.id, b.lider.usuarioId, { avance: 90, aprobada: false });
      await ponerEnPlan(b.control, { planId: plan.id, hallazgoIds: [h75.id, h30.id, sin.id] }, o(tx));
      const [fila] = await delPlan(b.gerencia, tx, plan.codigo);
      expect(fila.avance).toBe(53);
      expect((await leerPlan(b.gerencia, plan.id, lee(tx)))!.avance).toBe(53);
    }));
});

describe("el historial del plan nombra otro plan solo a quien lo ve", () => {
  it("cambiar de plan: Gerencia lee los dos códigos; la líder del hallazgo que se fue no lee el del plan que no ve", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const B = await otroProcesoConLider(tx);
      const origen = await planDeMejoraDePrueba(tx, b.control, { nombre: "Plan de origen" });
      const destino = await planDeMejoraDePrueba(tx, b.control, { nombre: "Plan de destino" });
      const suyo = await registrado(tx, b, b.procesoId, "Se queda en el de origen");
      const ajeno = await registrado(tx, b, B.procesoId, "Pasa al de destino");
      await ponerEnPlan(b.control, { planId: origen.id, hallazgoIds: [suyo.id, ajeno.id] }, o(tx));
      await cambiarDePlan(b.control, { hallazgoId: ajeno.id, planId: destino.id, motivo: MOTIVO }, o(tx));

      const deGerencia = (await leerPlan(b.gerencia, origen.id, lee(tx)))!.historial.find((h) => h.tipo === "sale");
      expect(deGerencia?.texto).toContain(destino.codigo);
      expect(deGerencia?.texto).toContain(MOTIVO);
      // B.lider ve el plan de destino (tiene su hallazgo) pero no el de origen, que se quedó con uno de A.
      const deB = (await leerPlan(B.lider, destino.id, lee(tx)))!.historial.find((h) => h.tipo === "entra");
      expect(deB?.hallazgo).toBe(ajeno.codigo);
      expect(deB?.texto).not.toContain(origen.codigo);
      expect(deB?.texto).toContain("otro plan");
    }));

  it("sacar deja su motivo en el historial", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const plan = await planDeMejoraDePrueba(tx, b.control);
      const [h, otro] = [await registrado(tx, b, b.procesoId, "Sale del plan"), await registrado(tx, b, b.procesoId, "Se queda")];
      await ponerEnPlan(b.control, { planId: plan.id, hallazgoIds: [h.id, otro.id] }, o(tx));
      await sacarDelPlan(b.control, { hallazgoId: h.id, motivo: MOTIVO }, o(tx));
      const linea = (await leerPlan(b.gerencia, plan.id, lee(tx)))!.historial.find((x) => x.tipo === "sale");
      expect(linea).toMatchObject({ hallazgo: h.codigo });
      expect(linea?.texto).toContain(MOTIVO);
    }));
});

describe("veAlgunPlan", () => {
  it("la líder, solo con un hallazgo suyo en un plan; Consulta, no", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [b.procesoId] });
      expect(await veAlgunPlan(lider, { sql: tx })).toBe(false);
      const plan = await planDeMejoraDePrueba(tx, b.control);
      const h = await registrado(tx, b, b.procesoId, "Hallazgo que da el plan");
      await ponerEnPlan(b.control, { planId: plan.id, hallazgoIds: [h.id] }, o(tx));
      expect(await veAlgunPlan(lider, { sql: tx })).toBe(true);
      expect(await veAlgunPlan(b.consulta, { sql: tx })).toBe(false);
    }));
});

describe("candidatosParaPlan", () => {
  it("trae los que cuentan y no tienen plan; no los de otro plan, ni anulados ni rechazados; la líder lanza por permiso", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const plan = await planDeMejoraDePrueba(tx, b.control);
      const otroPlan = await planDeMejoraDePrueba(tx, b.control);
      const libre = await registrado(tx, b, b.procesoId, "Candidato libre");
      const enOtro = await registrado(tx, b, b.procesoId, "Candidato en otro plan");
      await ponerEnPlan(b.control, { planId: otroPlan.id, hallazgoIds: [enOtro.id] }, o(tx));
      const anulado = await registrado(tx, b, b.procesoId, "Candidato anulado");
      await anularHallazgo(b.admin, { hallazgoId: anulado.id, justificacion: "Se registró dos veces por error" }, o(tx));
      const rechazado = await hallazgoEn(tx, b, "rechazo", { titulo: "Candidato rechazado" });
      await retirarHallazgo(b.control, { hallazgoId: rechazado.id }, o(tx));
      const cerrado = await hallazgoEn(tx, b, "cerrado", { titulo: "Candidato cerrado" });

      const ids = (await candidatosParaPlan(b.control, plan.id, { proceso: b.procesoId }, lee(tx))).map((x) => x.id);
      expect(ids.sort()).toEqual([libre.id, cerrado.id].sort());
      const porTexto = await candidatosParaPlan(b.control, plan.id, { q: "candidato LIBRE" }, lee(tx));
      expect(porTexto.map((x) => x.id)).toEqual([libre.id]);
      expect(porTexto[0]).toMatchObject({ codigo: libre.codigo, titulo: "Candidato libre", origen: "auditoria_interna" });
      expect(await candidatosParaPlan(b.control, plan.id, { proceso: b.procesoId, origen: "pamec" }, lee(tx))).toEqual([]);
      await expect(candidatosParaPlan(b.lider, plan.id, { proceso: b.procesoId }, lee(tx))).rejects.toBeInstanceOf(ErrorPermiso);
    }));
});

describe("la clasificación en la página del hallazgo", () => {
  it("quien solo tiene una actividad lee el código y el nombre del plan, sin enlace; la líder, con enlace", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const plan = await planDeMejoraDePrueba(tx, b.control, { nombre: "Plan de la clasificación" });
      const h = await registrado(tx, b, b.procesoId, "Hallazgo clasificado");
      await ponerEnPlan(b.control, { planId: plan.id, hallazgoIds: [h.id] }, o(tx));
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      await actividadPorSql(tx, h.id, responsable.usuarioId);

      const suya = await leerHallazgo(responsable, h.id, lee(tx));
      expect(suya?.ve).toBe("actividad");
      expect(suya?.clasificacion).toMatchObject({
        plan: { codigo: plan.codigo, nombre: "Plan de la clasificación", enlace: false },
        puedeClasificar: false,
      });
      expect((await leerHallazgo(b.lider, h.id, lee(tx)))?.clasificacion).toMatchObject({
        plan: { id: plan.id, enlace: true },
        puedeClasificar: false,
      });
      expect((await leerHallazgo(b.control, h.id, lee(tx)))?.clasificacion.puedeClasificar).toBe(true);
      const suelto = await registrado(tx, b, b.procesoId, "Hallazgo sin plan");
      expect((await leerHallazgo(b.control, suelto.id, lee(tx)))?.clasificacion).toEqual({
        plan: null,
        objetivo: null,
        objetivoId: null,
        puedeClasificar: true,
      });
    }));
});
