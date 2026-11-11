/**
 * Visibilidad y capacidades del módulo de indicadores (spec 14 §6) contra la BD de desarrollo, cada caso
 * dentro de una transacción que se revierte.
 */
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { TransactionSql } from "postgres";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { registrarFirma } from "@/db/consultas/firmas";
import {
  aprobadoresDeFicha,
  filtroIndicadores,
  puedeAnalizar,
  puedeAprobarFicha,
  puedeMedir,
  puedeObservar,
  puedeVerIndicador,
  puedeVerSoportes,
  responsablesDeAnalizar,
  responsablesDeMedir,
  type SujetoVisibilidad,
} from "@/lib/alcance";
import { ErrorTramite } from "@/db/consultas/flujo/contrato";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import type { Rol } from "@/lib/roles";
import { indicadorDePrueba } from "./utiles/indicadores";
import { usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

const sujeto = (u: { usuarioId: number; rol: Rol }): SujetoVisibilidad => ({ usuarioId: u.usuarioId, rol: u.rol, verHistorial: false });

async function proceso(tx: TransactionSql, sigla: string): Promise<number> {
  const [p] = await tx`SELECT id FROM procesos WHERE sigla = ${sigla}`;
  return Number(p.id);
}

/** Los usuarios de un restringido de GTH: los tres roles, líderes de GTH y de CEX, y consultas varios. */
async function escenario(tx: TransactionSql) {
  const gth = await proceso(tx, "GTH");
  const cex = await proceso(tx, "CEX");
  // Los líderes de la demo dejan de contar: cada caso trae los suyos y la demo puede cambiar.
  await tx`UPDATE usuarios SET activo = false
    WHERE rol = 'lider_proceso' AND id IN (SELECT usuario_id FROM usuario_procesos WHERE proceso_id IN (${gth}, ${cex}))`;
  const admin = await usuarioDePrueba(tx, { rol: "admin_sgc" });
  const gerencia = await usuarioDePrueba(tx, { rol: "gerencia" });
  const control = await usuarioDePrueba(tx, { rol: "control_interno" });
  const liderGth = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [gth] });
  const liderCex = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [cex] });
  const consultaGth = await usuarioDePrueba(tx, { rol: "consulta", procesos: [gth] });
  const consultaSeguimiento = await usuarioDePrueba(tx, { rol: "consulta" });
  const consultaNada = await usuarioDePrueba(tx, { rol: "consulta" });
  return { gth, cex, admin, gerencia, control, liderGth, liderCex, consultaGth, consultaSeguimiento, consultaNada };
}

describe("visibilidad de un indicador", () => {
  it("un general lo ve toda sesión; un restringido, los tres roles que ven todo, el asignado a su proceso y el designado", () => revertida(sql, async (tx) => {
    const e = await escenario(tx);
    const general = await indicadorDePrueba(tx, { procesoId: e.gth, nivelAcceso: "general" });
    for (const u of [e.admin, e.gerencia, e.control, e.liderGth, e.liderCex, e.consultaGth, e.consultaSeguimiento, e.consultaNada]) {
      expect(await puedeVerIndicador(general.id, sujeto(u), { sql: tx })).toBe(true);
    }
    const r = await indicadorDePrueba(tx, { procesoId: e.gth, nivelAcceso: "restringido", seguimiento: [e.consultaSeguimiento.usuarioId] });
    const ve = (u: { usuarioId: number; rol: Rol }) => puedeVerIndicador(r.id, sujeto(u), { sql: tx });
    expect(await ve(e.admin)).toBe(true);
    expect(await ve(e.gerencia)).toBe(true);
    expect(await ve(e.control)).toBe(true);
    expect(await ve(e.liderGth)).toBe(true);
    expect(await ve(e.consultaGth)).toBe(true);
    expect(await ve(e.consultaSeguimiento)).toBe(true);
    expect(await ve(e.liderCex)).toBe(false);
    expect(await ve(e.consultaNada)).toBe(false);
  }));

  it("un indicador que no existe no lo ve nadie", () => revertida(sql, async (tx) => {
    const e = await escenario(tx);
    expect(await puedeVerIndicador(999_999_999, sujeto(e.admin), { sql: tx })).toBe(false);
  }));

  it("filtroIndicadores da el mismo resultado en un WHERE que puedeVerIndicador uno por uno", () => revertida(sql, async (tx) => {
    const e = await escenario(tx);
    const a = await indicadorDePrueba(tx, { procesoId: e.gth, nivelAcceso: "restringido" });
    const b = await indicadorDePrueba(tx, { procesoId: e.cex, nivelAcceso: "restringido", seguimiento: [e.consultaSeguimiento.usuarioId] });
    const c = await indicadorDePrueba(tx, { procesoId: e.cex, nivelAcceso: "general" });
    const ids = [a.id, b.id, c.id];
    for (const u of [e.admin, e.gerencia, e.control, e.liderGth, e.liderCex, e.consultaGth, e.consultaSeguimiento, e.consultaNada]) {
      const s = sujeto(u);
      const filas = await tx`SELECT i.id FROM indicadores i WHERE i.id IN ${tx(ids)} AND ${filtroIndicadores(tx, s)}`;
      const porFiltro = filas.map((f) => Number(f.id)).sort((x, y) => x - y);
      const unoPorUno: number[] = [];
      for (const id of ids) if (await puedeVerIndicador(id, s, { sql: tx })) unoPorUno.push(id);
      expect(porFiltro, `rol ${u.rol}`).toEqual(unoPorUno.sort((x, y) => x - y));
    }
  }));

  it("un proceso inactivo no da el alcance de un restringido", () => revertida(sql, async (tx) => {
    const e = await escenario(tx);
    const r = await indicadorDePrueba(tx, { procesoId: e.gth, nivelAcceso: "restringido" });
    expect(await puedeVerIndicador(r.id, sujeto(e.consultaGth), { sql: tx })).toBe(true);
    await tx`UPDATE procesos SET activo = false WHERE id = ${e.gth}`;
    expect(await puedeVerIndicador(r.id, sujeto(e.consultaGth), { sql: tx })).toBe(false);
  }));

  it("un borrador solo lo ve quien administra", () => revertida(sql, async (tx) => {
    const e = await escenario(tx);
    const b = await indicadorDePrueba(tx, { procesoId: e.gth, estado: "borrador", mide: [e.consultaNada.usuarioId] });
    expect(await puedeVerIndicador(b.id, sujeto(e.admin), { sql: tx })).toBe(true);
    for (const u of [e.gerencia, e.control, e.liderGth, e.consultaGth, e.consultaNada]) {
      expect(await puedeVerIndicador(b.id, sujeto(u), { sql: tx }), `rol ${u.rol}`).toBe(false);
    }
  }));

  it("un retirado lo ve quien pasa el filtro", () => revertida(sql, async (tx) => {
    const e = await escenario(tx);
    const r = await indicadorDePrueba(tx, { procesoId: e.gth });
    await tx`UPDATE indicadores SET estado = 'retirado', baja_por = ${e.admin.usuarioId}, baja_en = now(), baja_motivo = 'prueba' WHERE id = ${r.id}`;
    expect(await puedeVerIndicador(r.id, sujeto(e.consultaNada), { sql: tx })).toBe(true);
  }));
});

describe("soportes", () => {
  it("los tres roles, el líder del proceso y los designados; no el consulta asignado al proceso", () => revertida(sql, async (tx) => {
    const e = await escenario(tx);
    const designado = await usuarioDePrueba(tx, { rol: "consulta" });
    const i = await indicadorDePrueba(tx, { procesoId: e.gth, seguimiento: [designado.usuarioId] });
    const ve = (u: { usuarioId: number; rol: Rol }) => puedeVerSoportes(i.id, sujeto(u), { sql: tx });
    expect(await ve(e.admin)).toBe(true);
    expect(await ve(e.gerencia)).toBe(true);
    expect(await ve(e.control)).toBe(true);
    expect(await ve(e.liderGth)).toBe(true);
    expect(await ve(designado)).toBe(true);
    expect(await ve(e.liderCex)).toBe(false);
    expect(await ve(e.consultaGth)).toBe(false);
    expect(await ve(e.consultaNada)).toBe(false);
  }));
});

describe("capacidad de medir y analizar", () => {
  it("mide el designado y el líder del proceso; el Admin SGC solo designado", () => revertida(sql, async (tx) => {
    const e = await escenario(tx);
    const designado = await usuarioDePrueba(tx, { rol: "consulta" });
    const i = await indicadorDePrueba(tx, { procesoId: e.gth, mide: [designado.usuarioId, e.admin.usuarioId] });
    const mide = (u: { usuarioId: number; rol: Rol }) => puedeMedir(i.id, sujeto(u), { sql: tx });
    expect(await mide(designado)).toEqual({ puede: true, sinMedidor: false });
    expect(await mide(e.liderGth)).toEqual({ puede: true, sinMedidor: false });
    expect(await mide(e.admin)).toEqual({ puede: true, sinMedidor: false });
    expect(await mide(e.liderCex)).toEqual({ puede: false, sinMedidor: false });
    expect(await mide(e.consultaGth)).toEqual({ puede: false, sinMedidor: false });
    // Un designado que mide no es analista: son funciones distintas.
    expect(await puedeAnalizar(i.id, sujeto(designado), { sql: tx })).toEqual({ puede: false, sinMedidor: false });

    const otro = await indicadorDePrueba(tx, { procesoId: e.gth, mide: [designado.usuarioId] });
    expect(await puedeMedir(otro.id, sujeto(e.admin), { sql: tx })).toEqual({ puede: false, sinMedidor: false });
  }));

  it("si el designado se desactiva y hay líder, el Admin SGC sigue sin poder; sin designado ni líder, puede con sinMedidor", () => revertida(sql, async (tx) => {
    const e = await escenario(tx);
    const designado = await usuarioDePrueba(tx, { rol: "consulta" });
    const i = await indicadorDePrueba(tx, { procesoId: e.gth, mide: [designado.usuarioId] });
    const admin = sujeto(e.admin);
    expect(await puedeMedir(i.id, admin, { sql: tx })).toEqual({ puede: false, sinMedidor: false });

    await tx`UPDATE usuarios SET activo = false WHERE id = ${designado.usuarioId}`;
    expect(await puedeMedir(i.id, sujeto(designado), { sql: tx })).toEqual({ puede: false, sinMedidor: false });
    expect(await puedeMedir(i.id, admin, { sql: tx })).toEqual({ puede: false, sinMedidor: false });

    await tx`UPDATE usuarios SET activo = false WHERE id = ${e.liderGth.usuarioId}`;
    expect(await puedeMedir(i.id, admin, { sql: tx })).toEqual({ puede: true, sinMedidor: true });

    const nuevo = await usuarioDePrueba(tx, { rol: "consulta" });
    await tx`INSERT INTO indicador_designados (indicador_id, usuario_id, funcion, creado_por) VALUES (${i.id}, ${nuevo.usuarioId}, 'mide', ${e.admin.usuarioId})`;
    expect(await puedeMedir(i.id, admin, { sql: tx })).toEqual({ puede: false, sinMedidor: false });
  }));

  it("analiza el designado en esa función y el líder; el Admin SGC con la misma regla", () => revertida(sql, async (tx) => {
    const e = await escenario(tx);
    const analista = await usuarioDePrueba(tx, { rol: "consulta" });
    const i = await indicadorDePrueba(tx, { procesoId: e.gth, analiza: [analista.usuarioId] });
    expect(await puedeAnalizar(i.id, sujeto(analista), { sql: tx })).toEqual({ puede: true, sinMedidor: false });
    expect(await puedeAnalizar(i.id, sujeto(e.liderGth), { sql: tx })).toEqual({ puede: true, sinMedidor: false });
    expect(await puedeAnalizar(i.id, sujeto(e.admin), { sql: tx })).toEqual({ puede: false, sinMedidor: false });
    const sinNadie = await indicadorDePrueba(tx, { procesoId: e.cex });
    await tx`UPDATE usuarios SET activo = false WHERE id = ${e.liderCex.usuarioId}`;
    expect(await puedeAnalizar(sinNadie.id, sujeto(e.admin), { sql: tx })).toEqual({ puede: true, sinMedidor: true });
  }));

  it("un indicador que no existe no lo mide ni lo analiza nadie", () => revertida(sql, async (tx) => {
    const e = await escenario(tx);
    expect(await puedeMedir(999_999_999, sujeto(e.admin), { sql: tx })).toEqual({ puede: false, sinMedidor: false });
    expect(await puedeAnalizar(999_999_999, sujeto(e.admin), { sql: tx })).toEqual({ puede: false, sinMedidor: false });
  }));
});

describe("destinatarios de tareas y avisos", () => {
  it("responsablesDeMedir: designados activos; si no, líderes activos; si no, Admin SGC activos", () => revertida(sql, async (tx) => {
    const e = await escenario(tx);
    const d1 = await usuarioDePrueba(tx, { rol: "consulta" });
    const d2 = await usuarioDePrueba(tx, { rol: "consulta" });
    const i = await indicadorDePrueba(tx, { procesoId: e.gth, mide: [d1.usuarioId, d2.usuarioId], analiza: [d1.usuarioId] });
    const ordenados = (ids: number[]) => [...ids].sort((a, b) => a - b);
    expect(ordenados(await responsablesDeMedir(i.id, { sql: tx }))).toEqual(ordenados([d1.usuarioId, d2.usuarioId]));
    expect(await responsablesDeAnalizar(i.id, { sql: tx })).toEqual([d1.usuarioId]);

    await tx`UPDATE usuarios SET activo = false WHERE id = ${d1.usuarioId}`;
    expect(await responsablesDeMedir(i.id, { sql: tx })).toEqual([d2.usuarioId]);
    await tx`UPDATE usuarios SET activo = false WHERE id = ${d2.usuarioId}`;
    expect(await responsablesDeMedir(i.id, { sql: tx })).toEqual([e.liderGth.usuarioId]);
    expect(await responsablesDeAnalizar(i.id, { sql: tx })).toEqual([e.liderGth.usuarioId]);

    await tx`UPDATE usuarios SET activo = false WHERE id = ${e.liderGth.usuarioId}`;
    const admins = await tx`SELECT id FROM usuarios WHERE rol = 'admin_sgc' AND activo ORDER BY id`;
    const res = await responsablesDeMedir(i.id, { sql: tx });
    expect(res).toEqual(admins.map((a) => Number(a.id)));
    expect(res).toContain(e.admin.usuarioId);
  }));
});

describe("observar", () => {
  it("observa quien ve el indicador y es de los tres roles o designado en seguimiento", () => revertida(sql, async (tx) => {
    const e = await escenario(tx);
    const i = await indicadorDePrueba(tx, { procesoId: e.gth, seguimiento: [e.consultaSeguimiento.usuarioId] });
    const obs = (u: { usuarioId: number; rol: Rol }) => puedeObservar(i.id, sujeto(u), { sql: tx });
    expect(await obs(e.admin)).toBe(true);
    expect(await obs(e.gerencia)).toBe(true);
    expect(await obs(e.control)).toBe(true);
    expect(await obs(e.consultaSeguimiento)).toBe(true);
    expect(await obs(e.liderGth)).toBe(false);
    expect(await obs(e.consultaGth)).toBe(false);
    expect(await obs(e.consultaNada)).toBe(false);
    // Designado en seguimiento de un restringido de otro proceso: lo ve por la designación y observa.
    const r = await indicadorDePrueba(tx, { procesoId: e.gth, nivelAcceso: "restringido", seguimiento: [e.consultaSeguimiento.usuarioId] });
    expect(await puedeObservar(r.id, sujeto(e.consultaSeguimiento), { sql: tx })).toBe(true);
    // Un designado que solo mide no observa.
    const medidor = await usuarioDePrueba(tx, { rol: "consulta" });
    const m = await indicadorDePrueba(tx, { procesoId: e.gth, mide: [medidor.usuarioId] });
    expect(await puedeObservar(m.id, sujeto(medidor), { sql: tx })).toBe(false);
  }));
});

describe("aprobación de la ficha", () => {
  it("aprueba Gerencia lo estratégico y lo regulatorio, y el líder lo operativo; nunca quien elaboró", () => revertida(sql, async (tx) => {
    const e = await escenario(tx);
    const gerenciasActivas = async () => (await tx`SELECT id FROM usuarios WHERE rol = 'gerencia' AND activo ORDER BY id`).map((f) => Number(f.id));
    const lideresGth = [e.liderGth.usuarioId];
    for (const clasificacion of ["Estratégico", "Regulatorio"] as const) {
      const i = await indicadorDePrueba(tx, { procesoId: e.gth, clasificacion, elaboradaPor: e.admin.usuarioId });
      const gerencias = await gerenciasActivas();
      expect(await aprobadoresDeFicha(i.versionId, { sql: tx })).toEqual(gerencias);
      expect(await puedeAprobarFicha(i.versionId, sujeto(e.gerencia), { sql: tx })).toBe(true);
      expect(await puedeAprobarFicha(i.versionId, sujeto(e.liderGth), { sql: tx })).toBe(false);
      expect(await puedeAprobarFicha(i.versionId, sujeto(e.admin), { sql: tx })).toBe(false);
    }
    const operativo = await indicadorDePrueba(tx, { procesoId: e.gth, clasificacion: "Operativo", elaboradaPor: e.admin.usuarioId });
    expect(await aprobadoresDeFicha(operativo.versionId, { sql: tx })).toEqual(lideresGth);
    expect(await puedeAprobarFicha(operativo.versionId, sujeto(e.liderGth), { sql: tx })).toBe(true);
    expect(await puedeAprobarFicha(operativo.versionId, sujeto(e.liderCex), { sql: tx })).toBe(false);
    expect(await puedeAprobarFicha(operativo.versionId, sujeto(e.gerencia), { sql: tx })).toBe(false);

    // Quien elaboró nunca aprueba: si la ficha la elaboró el líder, no queda líder y aprueba Gerencia.
    const delLider = await indicadorDePrueba(tx, { procesoId: e.gth, clasificacion: "Operativo", elaboradaPor: e.liderGth.usuarioId });
    expect(await aprobadoresDeFicha(delLider.versionId, { sql: tx })).toEqual(await gerenciasActivas());
    expect(await puedeAprobarFicha(delLider.versionId, sujeto(e.liderGth), { sql: tx })).toBe(false);
    expect(await puedeAprobarFicha(delLider.versionId, sujeto(e.gerencia), { sql: tx })).toBe(true);

    // Elaboró un gerente: no se aprueba a sí mismo.
    const delGerente = await indicadorDePrueba(tx, { procesoId: e.gth, clasificacion: "Estratégico", elaboradaPor: e.gerencia.usuarioId });
    expect(await aprobadoresDeFicha(delGerente.versionId, { sql: tx })).not.toContain(e.gerencia.usuarioId);
    expect(await puedeAprobarFicha(delGerente.versionId, sujeto(e.gerencia), { sql: tx })).toBe(false);
  }));

  it("operativo en un proceso sin líder: aprueba Gerencia", () => revertida(sql, async (tx) => {
    const e = await escenario(tx);
    const sinLider = await tx`SELECT p.id FROM procesos p WHERE p.activo AND NOT EXISTS (
      SELECT 1 FROM usuario_procesos up JOIN usuarios u ON u.id = up.usuario_id AND u.activo AND u.rol = 'lider_proceso'
      WHERE up.proceso_id = p.id) LIMIT 1`;
    const procesoId = sinLider.length > 0
      ? Number(sinLider[0].id)
      : Number((await tx`INSERT INTO procesos (nombre, sigla, slug, banda, orden) VALUES ('Proceso de prueba', 'ZZP', ${`zz-${Date.now()}`}, 'apoyo', 99) RETURNING id`)[0].id);
    const i = await indicadorDePrueba(tx, { procesoId, clasificacion: "Operativo", elaboradaPor: e.admin.usuarioId });
    const gerencias = (await tx`SELECT id FROM usuarios WHERE rol = 'gerencia' AND activo ORDER BY id`).map((f) => Number(f.id));
    expect(await aprobadoresDeFicha(i.versionId, { sql: tx })).toEqual(gerencias);
    expect(await puedeAprobarFicha(i.versionId, sujeto(e.gerencia), { sql: tx })).toBe(true);
  }));
});

describe("errores del módulo", () => {
  it("ErrorIndicador es un ErrorTramite con su nombre", () => {
    const err = new ErrorIndicador("Mensaje de negocio");
    expect(err).toBeInstanceOf(ErrorTramite);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Mensaje de negocio");
    expect(err.name).toBe("ErrorIndicador");
  });
});

describe("firma de una ficha", () => {
  it("registrarFirma guarda una firma de ficha sin trámite ni versión de documento", () => revertida(sql, async (tx) => {
    const e = await escenario(tx);
    const i = await indicadorDePrueba(tx, { procesoId: e.gth, estado: "borrador" });
    const id = await registrarFirma(tx, {
      tramiteId: null,
      versionId: null,
      indicadorVersionId: i.versionId,
      usuarioId: e.admin.usuarioId,
      firma: "elaboro",
      ronda: 0,
      hashSha256: "0".repeat(64),
      metodo: "clave",
      contexto: { ip: null, userAgent: "test" },
    });
    const [f] = await tx`SELECT tramite_id, version_id, indicador_version_id, firma, ronda FROM firmas WHERE id = ${id}`;
    expect(f.tramite_id).toBeNull();
    expect(f.version_id).toBeNull();
    expect(Number(f.indicador_version_id)).toBe(i.versionId);
    expect(f).toMatchObject({ firma: "elaboro", ronda: 0 });
  }));

  it("sin indicadorVersionId queda nulo, y una firma sin trámite ni ficha la rechaza la BD", () => revertida(sql, async (tx) => {
    const e = await escenario(tx);
    const base = { versionId: null, usuarioId: e.admin.usuarioId, ronda: 0, hashSha256: "0".repeat(64), metodo: "clave" as const, contexto: { ip: null, userAgent: "test" } };
    const id = await registrarFirma(tx, { ...base, tramiteId: null, firma: "ratifico" });
    const [f] = await tx`SELECT indicador_version_id FROM firmas WHERE id = ${id}`;
    expect(f.indicador_version_id).toBeNull();
    const codigo = await tx.savepoint((s) => registrarFirma(s, { ...base, tramiteId: null, firma: "elaboro" })).then(() => null, (err) => err.code);
    expect(codigo).toBe("23514");
  }));
});
