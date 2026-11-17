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
      expect(r.cifras).toEqual({ abiertos: 0, conAlgoVencido: 0, esperanSuDecision: 0, enEspera: 0, reabiertos: 0 });
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
      await actividadPorSql(tx, a.id, persona.usuarioId);
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

describe("la lista", () => {
  it("los filtros: proceso, origen, clase, criticidad, estado y búsqueda sin tildes", async () => {
    await revertida(sql, async (tx) => {
      const { b, otro, a, x } = await escena(tx);
      const obs = await registrarHallazgo(
        b.admin,
        datosDeHallazgo(b.procesoId, { clase: "observacion", criticidad: null, titulo: "Rotulación de áreas" }),
        c(AHORA, tx),
      );
      const f = async (filtro: Parameters<typeof listarHallazgos>[1]) => ids(await listarHallazgos(b.admin, filtro, opt(tx)));
      expect(await f({ procesoId: otro.procesoId })).toEqual([x.id]);
      expect(await f({ origen: "auditoria_externa", procesoId: otro.procesoId })).toEqual([x.id]);
      expect(await f({ clase: "observacion" })).toContain(obs.id);
      expect(await f({ clase: "observacion" })).not.toContain(a.id);
      expect(await f({ criticidad: "media", procesoId: b.procesoId })).toEqual([a.id]);
      expect(await f({ estado: "por_aceptar", procesoId: b.procesoId })).toContain(a.id);
      expect(await f({ q: "rotulacion", procesoId: b.procesoId })).toEqual([obs.id]);
      expect(await f({ q: "ROTULACIÓN" })).toContain(obs.id);
      expect(await f({ q: a.codigo })).toEqual([a.id]);
      expect(await f({ estado: "abiertos", procesoId: b.procesoId })).toHaveLength(2);
      await tx`UPDATE mejora_hallazgos SET estado = 'anulado' WHERE id = ${obs.id}`;
      expect(await f({ estado: "abiertos", procesoId: b.procesoId })).toEqual([a.id]);
    });
  });

  it("las cifras y las marcas: algo vencido, en espera, reabiertos", async () => {
    await revertida(sql, async (tx) => {
      const { b, a, x } = await escena(tx);
      await actividadPorSql(tx, a.id, b.lider.usuarioId, { fin: "2026-11-10" });
      await tx`UPDATE mejora_hallazgos SET estado = 'en_espera', ronda = 2, vence_en = NULL WHERE id = ${x.id}`;
      const r = await listarHallazgos(b.admin, { procesoId: b.procesoId }, opt(tx));
      expect(r.filas.find((f) => f.id === a.id)?.marcas).toContain("Con algo vencido");
      const todo = await listarHallazgos(b.admin, {}, opt(tx));
      expect(todo.cifras.conAlgoVencido).toBeGreaterThanOrEqual(1);
      expect(todo.cifras.enEspera).toBeGreaterThanOrEqual(1);
      expect(todo.cifras.reabiertos).toBeGreaterThanOrEqual(1);
      const fx = todo.filas.find((f) => f.id === x.id)!;
      expect(fx.etiqueta).toBe("En espera de eficacia");
      expect(fx.marcas).toContain("Reabierto");
      expect(ids(await listarHallazgos(b.admin, { soloVencidos: true, procesoId: b.procesoId }, opt(tx)))).toEqual([a.id]);
    });
  });

  it("los externos van primero", async () => {
    await revertida(sql, async (tx) => {
      const { a, x, b } = await escena(tx);
      await actividadPorSql(tx, a.id, b.lider.usuarioId, { fin: "2026-11-01" });
      const r = await listarHallazgos(b.admin, {}, opt(tx));
      const orden = r.filas.map((f) => f.id);
      expect(r.filas[0].prioridadAlta).toBe(true);
      expect(orden.indexOf(x.id)).toBeLessThan(orden.indexOf(a.id));
      const primeraNormal = r.filas.findIndex((f) => !f.prioridadAlta);
      expect(r.filas.slice(primeraNormal).some((f) => f.prioridadAlta)).toBe(false);
    });
  });

  it("esperanSuDecision cuenta los hallazgos donde quien mira tiene el turno", async () => {
    await revertida(sql, async (tx) => {
      const { b, a } = await escena(tx);
      expect((await listarHallazgos(b.lider, {}, opt(tx))).cifras.esperanSuDecision).toBe(1);
      const g = await listarHallazgos(b.gerencia, { procesoId: b.procesoId }, opt(tx));
      expect(g.cifras.esperanSuDecision).toBe(0);
      expect(g.filas.find((f) => f.id === a.id)?.turno).toBe("La líder del proceso");
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
      expect(d.loQueSigue).toMatch(/usted/i);
      const dAdmin = (await leerHallazgo(b.admin, a.id, opt(tx)))!;
      expect(dAdmin.loQueSigue).toMatch(/líder del proceso/i);
    });
  });
});
