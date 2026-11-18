/**
 * Alcance y lecturas de los hallazgos (Fase 15A, Tarea 6, spec §6.3 y §16.2): quién ve qué, la lista con sus cifras y
 * filtros, y el detalle. Contra la BD de trabajo, dentro de una transacción que se revierte.
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import type { TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { quienTieneElTurno } from "@/db/consultas/mejoramiento/avisos";
import { leerHallazgo, listarHallazgos, turnoEnTexto } from "@/db/consultas/mejoramiento/lectura";
import { registrarHallazgo } from "@/db/consultas/mejoramiento/registro";
import { lideresDeProceso } from "@/db/consultas/tramites";
import { participacionEnHallazgo, puedeVerHallazgo } from "@/lib/alcance";
import type { HallazgoBase } from "@/lib/mejoramiento/tipos";
import { actividadPorSql, baseDeMejora, c, datosDeHallazgo, otroProcesoConLider } from "./utiles/mejoramiento";
import { revertida } from "./utiles/transaccion";
import { usuarioDePrueba } from "./utiles/tramites";

const sql = obtenerSql();
afterAll(() => sql.end());

const AHORA = "2026-11-17T15:00:00Z";
const ahora = new Date(AHORA);

/** Dos procesos con su líder, un hallazgo en cada uno (el de B, externo). */
async function escena(tx: TransactionSql) {
  const b = await baseDeMejora(tx);
  const otro = await otroProcesoConLider(tx);
  const a = await registrarHallazgo(b.admin, datosDeHallazgo(b.procesoId, { titulo: "Hallazgo del proceso A" }), c(AHORA, tx));
  const x = await registrarHallazgo(
    b.admin,
    datosDeHallazgo(otro.procesoId, { titulo: "Hallazgo del proceso B", origen: "auditoria_externa", fuente: "Auditoría externa" }),
    c(AHORA, tx),
  );
  return { b, otro, a, x };
}

const opt = (tx: TransactionSql) => ({ sql: tx, ahora });
const ids = (r: { filas: Array<{ id: number }> }) => r.filas.map((f) => f.id).sort((p, q) => p - q);

describe("alcance de los hallazgos", () => {
  it("quien tiene mejora.ver_todo ve los dos", async () => {
    await revertida(sql, async (tx) => {
      const { b, a, x } = await escena(tx);
      for (const s of [b.admin, b.gerencia, b.control]) {
        const r = await listarHallazgos(s, {}, opt(tx));
        expect(ids(r)).toEqual(expect.arrayContaining([a.id, x.id]));
        expect(await participacionEnHallazgo(a.id, s, { sql: tx })).toBe("completo");
        expect((await leerHallazgo(s, x.id, opt(tx)))?.ve).toBe("completo");
      }
    });
  });

  it("el líder ve solo el de su proceso", async () => {
    await revertida(sql, async (tx) => {
      const { b, otro, a, x } = await escena(tx);
      expect(ids(await listarHallazgos(b.lider, {}, opt(tx)))).toEqual([a.id]);
      expect(await leerHallazgo(b.lider, x.id, opt(tx))).toBeNull();
      expect((await leerHallazgo(otro.lider, x.id, opt(tx)))?.codigo).toBe(x.codigo);
      expect(await leerHallazgo(otro.lider, a.id, opt(tx))).toBeNull();
    });
  });

  it("el rol Consulta no ve ninguno, ni cifras", async () => {
    await revertida(sql, async (tx) => {
      const { b, a } = await escena(tx);
      const r = await listarHallazgos(b.consulta, {}, opt(tx));
      expect(r.filas).toHaveLength(0);
      expect(r.cifras).toEqual({ abiertos: 0, conAlgoVencido: 0, esperanSuDecision: 0, enEspera: 0, porEvaluar: 0, reabiertos: 0 });
      expect(await leerHallazgo(b.consulta, a.id, opt(tx))).toBeNull();
      expect(await puedeVerHallazgo(a.id, b.consulta, { sql: tx })).toBe(false);
    });
  });

  it("quien lo registró lo ve completo aunque deje de liderar el proceso", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await registrarHallazgo(b.lider, datosDeHallazgo(b.procesoId), c(AHORA, tx));
      await tx`DELETE FROM usuario_procesos WHERE usuario_id = ${b.lider.usuarioId}`;
      expect(await participacionEnHallazgo(h.id, b.lider, { sql: tx })).toBe("completo");
      expect((await leerHallazgo(b.lider, h.id, opt(tx)))?.ve).toBe("completo");
      expect(ids(await listarHallazgos(b.lider, {}, opt(tx)))).toEqual([h.id]);
    });
  });

  it('el responsable de una actividad ve ese hallazgo como "actividad" y no el otro', async () => {
    await revertida(sql, async (tx) => {
      const { a, x } = await escena(tx);
      const persona = await usuarioDePrueba(tx, { rol: "consulta" });
      await actividadPorSql(tx, a.id, persona.usuarioId, { aprobada: true });
      expect(await participacionEnHallazgo(a.id, persona, { sql: tx })).toBe("actividad");
      expect(await participacionEnHallazgo(x.id, persona, { sql: tx })).toBeNull();
      const d = await leerHallazgo(persona, a.id, opt(tx));
      expect(d?.ve).toBe("actividad");
      expect(d?.eventos).toEqual([]);
      expect(ids(await listarHallazgos(persona, {}, opt(tx)))).toEqual([a.id]);
      expect(await leerHallazgo(persona, x.id, opt(tx))).toBeNull();
    });
  });

  it("un identificador que no existe y uno que no se ve responden igual", async () => {
    await revertida(sql, async (tx) => {
      const { b, x } = await escena(tx);
      expect(await leerHallazgo(b.lider, x.id, opt(tx))).toBeNull();
      expect(await leerHallazgo(b.lider, 2_000_000_000, opt(tx))).toBeNull();
      expect(await puedeVerHallazgo(x.id, b.lider, { sql: tx })).toBe(false);
      expect(await puedeVerHallazgo(2_000_000_000, b.lider, { sql: tx })).toBe(false);
    });
  });
});

describe("alcance: casos negativos y seguimientos", () => {
  it("el líder de un proceso inactivo y un antiguo líder que no registró no lo ven", async () => {
    await revertida(sql, async (tx) => {
      const { b, a } = await escena(tx);
      expect(await participacionEnHallazgo(a.id, b.lider, { sql: tx })).toBe("completo");
      await tx`UPDATE procesos SET activo = false WHERE id = ${b.procesoId}`;
      expect(await participacionEnHallazgo(a.id, b.lider, { sql: tx })).toBeNull();
      expect(await leerHallazgo(b.lider, a.id, opt(tx))).toBeNull();
      await tx`UPDATE procesos SET activo = true WHERE id = ${b.procesoId}`;
      await tx`DELETE FROM usuario_procesos WHERE usuario_id = ${b.lider.usuarioId}`;
      expect(await puedeVerHallazgo(a.id, b.lider, { sql: tx })).toBe(false);
      expect((await listarHallazgos(b.lider, {}, opt(tx))).filas).toHaveLength(0);
    });
  });

  it("quien figura solo en una actividad de un plan sin aprobar no ve el hallazgo ni lo recibe en la lista", async () => {
    await revertida(sql, async (tx) => {
      const { a } = await escena(tx);
      const persona = await usuarioDePrueba(tx, { rol: "consulta" });
      await actividadPorSql(tx, a.id, persona.usuarioId, { aprobada: false });
      expect(await participacionEnHallazgo(a.id, persona, { sql: tx })).toBeNull();
      expect(await puedeVerHallazgo(a.id, persona, { sql: tx })).toBe(false);
      expect(await leerHallazgo(persona, a.id, opt(tx))).toBeNull();
      expect(ids(await listarHallazgos(persona, {}, opt(tx)))).not.toContain(a.id);
      // Con el plan aprobado (`fin_original`), sí.
      await tx`UPDATE mejora_actividades SET fin_original = fin WHERE hallazgo_id = ${a.id}`;
      expect(await participacionEnHallazgo(a.id, persona, { sql: tx })).toBe("actividad");
    });
  });

  it("quien registró un seguimiento ve el hallazgo como actividad", async () => {
    await revertida(sql, async (tx) => {
      const { b, a, x } = await escena(tx);
      const persona = await usuarioDePrueba(tx, { rol: "consulta" });
      const act = await actividadPorSql(tx, a.id, b.lider.usuarioId);
      expect(await participacionEnHallazgo(a.id, persona, { sql: tx })).toBeNull();
      await tx`INSERT INTO mejora_seguimientos (hallazgo_id, actividad_id, fecha, realizado, avance, registrado_por)
        VALUES (${a.id}, ${act}, '2026-11-12', 'Se avanzó', 10, ${persona.usuarioId})`;
      expect(await participacionEnHallazgo(a.id, persona, { sql: tx })).toBe("actividad");
      expect(await participacionEnHallazgo(x.id, persona, { sql: tx })).toBeNull();
      expect(ids(await listarHallazgos(persona, {}, opt(tx)))).toEqual([a.id]);
    });
  });
});

describe("la lista", () => {
  it("los filtros: proceso, origen, clase, criticidad, estado y búsqueda sin tildes", async () => {
    await revertida(sql, async (tx) => {
      const { b, otro, a, x } = await escena(tx);
      const obs = await registrarHallazgo(
        b.admin,
        datosDeHallazgo(b.procesoId, { clase: "observacion", criticidad: null, titulo: "Rotulación de áreas" }),
        c(AHORA, tx),
      );
      const pam = await registrarHallazgo(
        b.admin,
        datosDeHallazgo(b.procesoId, { origen: "pamec", criticidad: "alta", titulo: "Otro asunto" }),
        c(AHORA, tx),
      );
      await tx`UPDATE mejora_hallazgos SET estado = 'por_corregir' WHERE id = ${pam.id}`;
      const f = async (filtro: Parameters<typeof listarHallazgos>[1]) => ids(await listarHallazgos(b.admin, filtro, opt(tx)));
      const delA = { procesoId: b.procesoId };
      expect(await f({ procesoId: otro.procesoId })).toEqual([x.id]);
      expect(await f({ ...delA, origen: "pamec" })).toEqual([pam.id]);
      expect(await f({ ...delA, origen: "auditoria_interna" })).toEqual([a.id, obs.id].sort((p, q) => p - q));
      expect(await f({ ...delA, clase: "observacion" })).toEqual([obs.id]);
      expect(await f({ ...delA, criticidad: "alta" })).toEqual([pam.id]);
      expect(await f({ ...delA, criticidad: "media" })).toEqual([a.id]);
      expect(await f({ ...delA, estado: "por_corregir" })).toEqual([pam.id]);
      expect(await f({ ...delA, estado: "por_aceptar" })).toEqual([a.id, obs.id].sort((p, q) => p - q));
      expect(await f({ ...delA, q: "rotulacion" })).toEqual([obs.id]);
      expect(await f({ ...delA, q: "ROTULACIÓN" })).toEqual([obs.id]);
      expect(await f({ q: a.codigo })).toEqual([a.id]);
      expect(await f({ ...delA, estado: "abiertos" })).toHaveLength(3);
      await tx`UPDATE mejora_hallazgos SET estado = 'anulado' WHERE id = ${obs.id}`;
      expect(await f({ ...delA, estado: "abiertos" })).toEqual([a.id, pam.id].sort((p, q) => p - q));
    });
  });

  it("sin_accion es solo «Cerrado sin acción»; reabiertos, los abiertos de ronda 2 o más", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mk = (titulo: string) => registrarHallazgo(b.admin, datosDeHallazgo(b.procesoId, { titulo }), c(AHORA, tx));
      const sinAccion = await mk("Cerrado sin acción");
      const conCorreccion = await mk("Cerrado con corrección");
      const abierto = await mk("Abierto sin acción requerida");
      const reabierto = await mk("Reabierto");
      await tx`UPDATE mejora_hallazgos SET estado = 'cerrado', resultado_cierre = 'sin_accion' WHERE id = ${sinAccion.id}`;
      await tx`UPDATE mejora_hallazgos SET estado = 'cerrado', resultado_cierre = 'con_correccion' WHERE id = ${conCorreccion.id}`;
      await tx`UPDATE mejora_hallazgos SET estado = 'por_validar', accion_requerida = false WHERE id = ${abierto.id}`;
      await tx`UPDATE mejora_hallazgos SET ronda = 2 WHERE id = ${reabierto.id}`;
      const f = async (estado: "sin_accion" | "reabiertos") =>
        ids(await listarHallazgos(b.admin, { estado, procesoId: b.procesoId }, opt(tx)));
      expect(await f("sin_accion")).toEqual([sinAccion.id]);
      expect(await f("reabiertos")).toEqual([reabierto.id]);
      const fila = (await listarHallazgos(b.admin, { estado: "reabiertos", procesoId: b.procesoId }, opt(tx))).filas[0];
      expect(fila.marcas).toContain("Reabierto · ronda 2");
    });
  });

  it("las cifras exactas, las marcas y el filtro solo vencidos", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mk = (titulo: string) => registrarHallazgo(b.lider, datosDeHallazgo(b.procesoId, { titulo }), c(AHORA, tx));
      const conActividad = await mk("Con actividad vencida");
      const conPaso = await mk("Con el paso vencido");
      const enEspera = await mk("En espera");
      const sinPlan = await mk("Actividad sin plan aprobado");
      await actividadPorSql(tx, conActividad.id, b.lider.usuarioId, { fin: "2026-11-10", aprobada: true });
      await actividadPorSql(tx, sinPlan.id, b.lider.usuarioId, { fin: "2026-11-10", aprobada: false });
      await tx`UPDATE mejora_hallazgos SET vence_en = '2026-11-01T00:00:00Z' WHERE id = ${conPaso.id}`;
      await tx`UPDATE mejora_hallazgos SET estado = 'en_espera', ronda = 2, vence_en = NULL WHERE id = ${enEspera.id}`;
      const r = await listarHallazgos(b.lider, {}, opt(tx));
      expect(r.cifras).toEqual({ abiertos: 4, conAlgoVencido: 2, esperanSuDecision: 3, enEspera: 1, porEvaluar: 0, reabiertos: 1 });
      const marcasDe = (id: number) => r.filas.find((fila) => fila.id === id)!.marcas;
      expect(marcasDe(conActividad.id)).toContain("Con algo vencido");
      expect(marcasDe(conPaso.id)).not.toContain("Con algo vencido");
      expect(marcasDe(sinPlan.id)).not.toContain("Con algo vencido");
      expect(r.filas.find((fila) => fila.id === enEspera.id)?.etiqueta).toBe("En espera de eficacia");
      expect(ids(await listarHallazgos(b.lider, { soloVencidos: true }, opt(tx)))).toEqual(
        [conActividad.id, conPaso.id].sort((p, q) => p - q),
      );
    });
  });

  it("los externos llevan «Prioridad alta» y van primero; luego los vencidos y por vence ascendente, nulos al final", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mk = (titulo: string, cambios = {}) => registrarHallazgo(b.admin, datosDeHallazgo(b.procesoId, { titulo, ...cambios }), c(AHORA, tx));
      const externo = await mk("Externo", { origen: "auditoria_externa", fuente: "Auditoría externa" });
      const vencido = await mk("Vencido");
      const pronto = await mk("Pronto");
      const tarde = await mk("Tarde");
      const sinFecha = await mk("Sin fecha");
      await actividadPorSql(tx, vencido.id, b.lider.usuarioId, { fin: "2026-11-01", aprobada: true });
      await tx`UPDATE mejora_hallazgos SET vence_en = '2026-12-20T00:00:00Z' WHERE id = ${vencido.id}`;
      await tx`UPDATE mejora_hallazgos SET vence_en = '2026-11-25T00:00:00Z' WHERE id = ${pronto.id}`;
      await tx`UPDATE mejora_hallazgos SET vence_en = '2026-12-05T00:00:00Z' WHERE id = ${tarde.id}`;
      await tx`UPDATE mejora_hallazgos SET vence_en = NULL WHERE id = ${sinFecha.id}`;
      const r = await listarHallazgos(b.admin, { procesoId: b.procesoId }, opt(tx));
      expect(r.filas.map((fila) => fila.id)).toEqual([externo.id, vencido.id, pronto.id, tarde.id, sinFecha.id]);
      expect(r.filas[0].prioridadAlta).toBe(true);
      expect(r.filas[0].marcas).toContain("Prioridad alta");
    });
  });

  it("el avance es el promedio de las acciones, cada una el de sus actividades vivas", async () => {
    await revertida(sql, async (tx) => {
      const { b, a } = await escena(tx);
      const una = await actividadPorSql(tx, a.id, b.lider.usuarioId, { avance: 100 });
      await actividadPorSql(tx, a.id, b.lider.usuarioId, { avance: 0 });
      const otra = await actividadPorSql(tx, a.id, b.lider.usuarioId, { avance: 0 });
      await actividadPorSql(tx, a.id, b.lider.usuarioId, { avance: 0, accionDe: otra });
      await actividadPorSql(tx, a.id, b.lider.usuarioId, { avance: 0, accionDe: otra });
      await actividadPorSql(tx, a.id, b.lider.usuarioId, { avance: 90, estado: "cancelada", accionDe: otra });
      expect(una).toBeGreaterThan(0);
      // acciones: 100 · 0 · 0 → 33; la cancelada no cuenta
      const fila = (await listarHallazgos(b.lider, {}, opt(tx))).filas[0];
      expect(fila.avance).toBe(33);
      const solo = await registrarHallazgo(b.admin, datosDeHallazgo(b.procesoId, { titulo: "Solo dos acciones" }), c(AHORA, tx));
      const p = await actividadPorSql(tx, solo.id, b.lider.usuarioId, { avance: 100 });
      const q = await actividadPorSql(tx, solo.id, b.lider.usuarioId, { avance: 0 });
      await actividadPorSql(tx, solo.id, b.lider.usuarioId, { avance: 0, accionDe: q });
      await actividadPorSql(tx, solo.id, b.lider.usuarioId, { avance: 0, accionDe: q });
      expect(p).not.toBe(q);
      const f2 = (await listarHallazgos(b.lider, { q: solo.codigo }, opt(tx))).filas[0];
      expect(f2.avance).toBe(50);
    });
  });

  it("esperanSuDecision cuenta y filtra los hallazgos donde quien mira tiene el turno", async () => {
    await revertida(sql, async (tx) => {
      const { b, a, x } = await escena(tx);
      const l = await listarHallazgos(b.lider, {}, opt(tx));
      expect(l.cifras.esperanSuDecision).toBe(1);
      expect(ids(await listarHallazgos(b.lider, { esperanSuDecision: true }, opt(tx)))).toEqual([a.id]);
      expect(ids(await listarHallazgos(b.consulta, { esperanSuDecision: true }, opt(tx)))).toEqual([]);
      const g = await listarHallazgos(b.gerencia, { procesoId: b.procesoId }, opt(tx));
      expect(g.filas.find((f) => f.id === a.id)?.turno).toBe("La líder del proceso");
      expect(x.id).toBeGreaterThan(0);
    });
  });

  it("el turno se calcula al leer", async () => {
    await revertida(sql, async (tx) => {
      const { b, a } = await escena(tx);
      const h: HallazgoBase = {
        id: a.id, codigo: a.codigo, clase: "no_conformidad", criticidad: "media", origen: "auditoria_interna",
        estado: "por_aceptar", ronda: 1, procesoId: b.procesoId, reincidenteDe: null, correccionRequerida: null,
        accionRequerida: null, resultadoCierre: null, registradoPor: b.admin.usuarioId,
      };
      expect(await turnoEnTexto(tx, h)).toBe("La líder del proceso");
      await tx`UPDATE usuarios SET activo = false WHERE id = ${b.lider.usuarioId}`;
      expect(await lideresDeProceso(b.procesoId, { sql: tx })).toEqual([]);
      expect(await quienTieneElTurno(tx, h)).toContain(b.admin.usuarioId);
      expect(await turnoEnTexto(tx, h)).toBe("Administrador del SGC");
      expect(await turnoEnTexto(tx, { ...h, estado: "por_validar" })).toBe("Quien puede validar");
    });
  });
});

describe("el detalle", () => {
  it("trae la identificación, las rondas con sus actividades y lo que sigue", async () => {
    await revertida(sql, async (tx) => {
      const { b, a } = await escena(tx);
      await actividadPorSql(tx, a.id, b.lider.usuarioId);
      const d = (await leerHallazgo(b.lider, a.id, opt(tx)))!;
      expect(d.codigo).toBe(a.codigo);
      expect(d.titulo).toBe("Hallazgo del proceso A");
      expect(d.rondas).toHaveLength(1);
      expect(d.rondas[0].acciones[0].actividades[0].descripcion).toBe("Actividad de prueba");
      expect(d.eventos.length).toBeGreaterThan(0);
      expect(d.loQueSigue).toMatchObject({ paso: "aceptar", puede: true });
      expect(d.loQueSigue.turno).toMatch(/usted/i);
      const dAdmin = (await leerHallazgo(b.admin, a.id, opt(tx)))!;
      expect(dAdmin.loQueSigue).toMatchObject({ paso: "aceptar", puede: false });
      expect(dAdmin.loQueSigue.turno).toMatch(/líder del proceso/i);
    });
  });

  it("el hallazgo anterior solo se nombra a quien puede verlo", async () => {
    await revertida(sql, async (tx) => {
      const { b, otro, a, x } = await escena(tx);
      await tx`UPDATE mejora_hallazgos SET reincidente_de = ${x.id} WHERE id = ${a.id}`;
      const dLider = (await leerHallazgo(b.lider, a.id, opt(tx)))!;
      expect(dLider.reincidenteDe).toEqual({ visible: false });
      expect(JSON.stringify(dLider.reincidenteDe)).not.toContain(x.codigo);
      expect(dLider.marcas).toContain("Reincidente");
      const dAdmin = (await leerHallazgo(b.admin, a.id, opt(tx)))!;
      expect(dAdmin.reincidenteDe).toMatchObject({ id: x.id, codigo: x.codigo });
      expect(otro.lider.usuarioId).not.toBe(b.lider.usuarioId);
    });
  });
});
