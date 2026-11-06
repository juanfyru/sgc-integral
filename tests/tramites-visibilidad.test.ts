/**
 * Quién ve un trámite (spec 13A §6.5) y la bandeja, contra la demo ya sembrada. Todo corre
 * dentro de una transacción que se revierte.
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import type { TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { crearSolicitud, transicionar } from "@/db/consultas/tramites-flujo";
import {
  lideresDeProceso,
  lideresDeProcesosDelDocumento,
  listarTramites,
  obtenerTramite,
  participaEnTramites,
  puedePedirSobreDocumento,
} from "@/db/consultas/tramites";
import { puedeVerTramite } from "@/lib/alcance";
import { opc, sesionAdmin, sesionDe, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

async function tramiteGth(tx: TransactionSql) {
  const lider = await sesionDe(tx, "lider.gth");
  const [doc] = await tx`SELECT id FROM documentos WHERE codigo = 'GTH-PR-01'`;
  const r = await crearSolicitud(lider, { tipo: "modificar", motivo: "mejora", justificacion: "Se añade la inducción por servicio.", documentoId: doc.id }, opc(tx));
  return { lider, tramiteId: r.tramiteId, numero: r.numero, documentoId: Number(doc.id) };
}

const visto = async (tx: TransactionSql, id: number, usuario: string) =>
  (await obtenerTramite(id, await sesionDe(tx, usuario), { sql: tx })) !== null;

describe("obtenerTramite", () => {
  it("lo ven el participante, el administrador y otro líder del proceso; nadie más", () => revertida(sql, async (tx) => {
    const { lider, tramiteId, numero } = await tramiteGth(tx);
    const detalle = await obtenerTramite(tramiteId, lider, { sql: tx });
    expect(detalle).toMatchObject({
      numero,
      tipo: "modificar",
      etapa: "aceptacion",
      codigo: "GTH-PR-01",
      solicitante: lider.nombre,
      elaborador: null,
      acciones: ["retirar"],
    });
    expect(detalle?.procesoNombre).toBeTruthy();
    expect(detalle?.titulo).toBeTruthy();
    expect(detalle?.eventos.map((e) => [e.tipo, e.persona])).toEqual([
      ["solicitar", lider.nombre],
      ["visto_bueno_automatico", lider.nombre],
    ]);

    const admin = await sesionAdmin(tx);
    expect((await obtenerTramite(tramiteId, admin, { sql: tx }))?.acciones).toEqual(["aceptar", "rechazar", "cancelar", "reasignar"]);
    const [gth] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
    const otroLider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [gth.id] });
    expect(await obtenerTramite(tramiteId, otroLider, { sql: tx })).not.toBeNull();

    for (const usuario of ["lider.cex", "consulta", "gerente", "control.interno"]) {
      expect(await visto(tx, tramiteId, usuario)).toBe(false);
    }
  }));

  it("un participante lo ve sea cual sea su rol; estar asignado al proceso sin liderar no basta", () => revertida(sql, async (tx) => {
    const { tramiteId } = await tramiteGth(tx);
    const elaborador = await usuarioDePrueba(tx, { rol: "consulta" });
    const [gth] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
    const asignado = await usuarioDePrueba(tx, { rol: "consulta", procesos: [gth.id] });
    expect(await obtenerTramite(tramiteId, elaborador, { sql: tx })).toBeNull();
    expect(await obtenerTramite(tramiteId, asignado, { sql: tx })).toBeNull();
    await tx`UPDATE tramites SET elaborador_id = ${elaborador.usuarioId} WHERE id = ${tramiteId}`;
    expect(await obtenerTramite(tramiteId, elaborador, { sql: tx })).not.toBeNull();
    expect(await participaEnTramites(elaborador.usuarioId, { sql: tx })).toBe(true);
    expect(await participaEnTramites(asignado.usuarioId, { sql: tx })).toBe(false);
  }));

  it("el líder de un proceso donde el documento también aplica lo ve, sin el visto bueno", () => revertida(sql, async (tx) => {
    const admin = await sesionAdmin(tx);
    const [doc] = await tx`SELECT id FROM documentos WHERE codigo = 'GTH-PR-01'`;
    const r = await crearSolicitud(admin, { tipo: "modificar", motivo: "mejora", justificacion: "Justificación de prueba.", documentoId: doc.id }, opc(tx));
    expect(await visto(tx, r.tramiteId, "lider.cex")).toBe(false);
    const [cex] = await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`;
    await tx`INSERT INTO documento_proceso (documento_id, proceso_id, es_principal) VALUES (${doc.id}, ${cex.id}, false)`;
    expect(await visto(tx, r.tramiteId, "lider.cex")).toBe(true);
    expect((await obtenerTramite(r.tramiteId, await sesionDe(tx, "lider.cex"), { sql: tx }))?.acciones).toEqual([]);
    expect((await obtenerTramite(r.tramiteId, await sesionDe(tx, "lider.gth"), { sql: tx }))?.acciones).toEqual(["dar_visto_bueno", "negar_visto_bueno"]);
  }));

  it("en una creación cuenta el proceso declarado", () => revertida(sql, async (tx) => {
    const admin = await sesionAdmin(tx);
    const [cex] = await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`;
    const [tipo] = await tx`SELECT id FROM tipos_documento WHERE sigla = 'FO'`;
    const r = await crearSolicitud(admin, { tipo: "crear", motivo: "mejora", justificacion: "Justificación de prueba.", procesoId: cex.id, tipoDocumentoId: tipo.id, tituloPropuesto: "Formato nuevo de consulta" }, opc(tx));
    expect(await visto(tx, r.tramiteId, "lider.cex")).toBe(true);
    expect(await visto(tx, r.tramiteId, "lider.gth")).toBe(false);
    const detalle = await obtenerTramite(r.tramiteId, admin, { sql: tx });
    expect(detalle).toMatchObject({ codigo: null, titulo: "Formato nuevo de consulta", versionNumero: null });
  }));

  it("publicado lo ve además quien tiene historial; rechazado o cancelado no", () => revertida(sql, async (tx) => {
    const { tramiteId } = await tramiteGth(tx);
    await tx`UPDATE tramites SET etapa = 'publicado' WHERE id = ${tramiteId}`;
    expect(await visto(tx, tramiteId, "control.interno")).toBe(true);
    expect(await visto(tx, tramiteId, "consulta")).toBe(false);
    await tx`UPDATE usuarios SET ver_historial = true WHERE usuario = 'consulta'`;
    expect(await visto(tx, tramiteId, "consulta")).toBe(true);
    await tx`UPDATE tramites SET etapa = 'cancelado' WHERE id = ${tramiteId}`;
    expect(await visto(tx, tramiteId, "control.interno")).toBe(false);
    expect(await visto(tx, tramiteId, "consulta")).toBe(false);
  }));

  it("un documento restringido exige además el nivel de acceso a quien entra por historial", () => revertida(sql, async (tx) => {
    const { tramiteId, documentoId } = await tramiteGth(tx);
    await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${documentoId}`;
    await tx`UPDATE tramites SET etapa = 'publicado' WHERE id = ${tramiteId}`;
    await tx`UPDATE usuarios SET ver_historial = true WHERE usuario = 'consulta'`;
    expect(await visto(tx, tramiteId, "consulta")).toBe(false);
    expect(await visto(tx, tramiteId, "control.interno")).toBe(true);
  }));

  it("un líder cuyo proceso quedó inactivo sale del alcance", () => revertida(sql, async (tx) => {
    const { tramiteId, lider } = await tramiteGth(tx);
    await tx`UPDATE tramites SET solicitante_id = ${(await sesionAdmin(tx)).usuarioId} WHERE id = ${tramiteId}`;
    expect(await obtenerTramite(tramiteId, lider, { sql: tx })).not.toBeNull();
    await tx`UPDATE procesos SET activo = false WHERE sigla = 'GTH'`;
    expect(await obtenerTramite(tramiteId, lider, { sql: tx })).toBeNull();
  }));

  it("un líder sin procesos no ve nada, y no rompe la consulta", () => revertida(sql, async (tx) => {
    const { tramiteId } = await tramiteGth(tx);
    const sinProcesos = await usuarioDePrueba(tx, { rol: "lider_proceso" });
    expect(await obtenerTramite(tramiteId, sinProcesos, { sql: tx })).toBeNull();
    expect(await listarTramites(sinProcesos, "en_curso", { sql: tx })).toEqual([]);
  }));

  it("lideresDeProceso devuelve solo líderes activos de procesos activos", () => revertida(sql, async (tx) => {
    const [gth] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
    const lider = await sesionDe(tx, "lider.gth");
    const consulta = await usuarioDePrueba(tx, { rol: "consulta", procesos: [gth.id] });
    const inactivo = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [gth.id] });
    await tx`UPDATE usuarios SET activo = false WHERE id = ${inactivo.usuarioId}`;
    const lideres = await lideresDeProceso(gth.id, { sql: tx });
    expect(lideres).toContain(lider.usuarioId);
    expect(lideres).not.toContain(consulta.usuarioId);
    expect(lideres).not.toContain(inactivo.usuarioId);
    await tx`UPDATE procesos SET activo = false WHERE id = ${gth.id}`;
    expect(await lideresDeProceso(gth.id, { sql: tx })).toEqual([]);
  }));
});

describe("lideresDeProcesosDelDocumento", () => {
  it("cuenta el subproceso por su proceso, sin repetir, y solo líderes activos de procesos activos", () => revertida(sql, async (tx) => {
    const [doc] = await tx`SELECT id FROM documentos WHERE codigo = 'GTH-PR-01'`;                     // asociado a un subproceso de GTH
    const lideres = (o: { sql: TransactionSql }) => lideresDeProcesosDelDocumento(doc.id, o);
    const gth = await sesionDe(tx, "lider.gth");
    const cex = await sesionDe(tx, "lider.cex");
    expect(await lideres({ sql: tx })).toContain(gth.usuarioId);
    expect(await lideres({ sql: tx })).not.toContain(cex.usuarioId);

    const [pGth] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
    const [pCex] = await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`;
    await tx`INSERT INTO documento_proceso (documento_id, proceso_id, es_principal) VALUES (${doc.id}, ${pCex.id}, false), (${doc.id}, ${pGth.id}, false)`;
    const conCex = await lideres({ sql: tx });
    expect(conCex).toContain(cex.usuarioId);
    expect(new Set(conCex).size).toBe(conCex.length);

    const consulta = await usuarioDePrueba(tx, { rol: "consulta", procesos: [pGth.id] });
    const inactivo = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [pGth.id] });
    await tx`UPDATE usuarios SET activo = false WHERE id = ${inactivo.usuarioId}`;
    expect(await lideres({ sql: tx })).not.toContain(consulta.usuarioId);
    expect(await lideres({ sql: tx })).not.toContain(inactivo.usuarioId);

    await tx`UPDATE procesos SET activo = false WHERE id = ${pCex.id}`;
    expect(await lideres({ sql: tx })).not.toContain(cex.usuarioId);
  }));
});

describe("puedeVerTramite", () => {
  const base = { esParticipante: false, lideraAlgunProceso: false, verHistorial: false, pasaNivelAcceso: true } as const;

  it.each([
    ["el participante", { ...base, etapa: "revision", rol: "consulta", esParticipante: true }, true],
    ["el administrador", { ...base, etapa: "revision", rol: "admin_sgc" }, true],
    ["el líder de un proceso del documento", { ...base, etapa: "revision", rol: "lider_proceso", lideraAlgunProceso: true }, true],
    ["otro líder", { ...base, etapa: "revision", rol: "lider_proceso" }, false],
    ["consulta", { ...base, etapa: "revision", rol: "consulta" }, false],
    ["gerencia", { ...base, etapa: "revision", rol: "gerencia" }, false],
    ["control interno, abierto", { ...base, etapa: "revision", rol: "control_interno" }, false],
    ["control interno, publicado", { ...base, etapa: "publicado", rol: "control_interno" }, true],
    ["control interno, eliminado", { ...base, etapa: "eliminado", rol: "control_interno" }, true],
    ["control interno, rechazado", { ...base, etapa: "rechazado", rol: "control_interno" }, false],
    ["control interno, cancelado", { ...base, etapa: "cancelado", rol: "control_interno" }, false],
    ["consulta con la marca, publicado", { ...base, etapa: "publicado", rol: "consulta", verHistorial: true }, true],
    ["consulta con la marca, abierto", { ...base, etapa: "aprobacion", rol: "consulta", verHistorial: true }, false],
    ["consulta con la marca, restringido", { ...base, etapa: "publicado", rol: "consulta", verHistorial: true, pasaNivelAcceso: false }, false],
    ["consulta sin la marca, publicado", { ...base, etapa: "publicado", rol: "consulta" }, false],
    ["un rol distinto de líder no gana por el proceso", { ...base, etapa: "revision", rol: "consulta", lideraAlgunProceso: true }, false],
    ["el participante de un restringido", { ...base, etapa: "publicado", rol: "consulta", esParticipante: true, pasaNivelAcceso: false }, true],
  ] as const)("%s", (_nombre, fila, esperado) => {
    expect(puedeVerTramite(fila)).toBe(esperado);
  });
});

describe("listarTramites", () => {
  /** Cada caso mira solo lo que crea: las bandejas también traen los trámites de la demo. */
  async function soloDelCaso(tx: TransactionSql) {
    const [{ tope }] = await tx`SELECT COALESCE(max(id), 0) AS tope FROM tramites`;
    return async (pestana: Parameters<typeof listarTramites>[1], sesion: Parameters<typeof listarTramites>[0]) =>
      (await listarTramites(sesion, pestana, { sql: tx })).filter((f) => f.id > Number(tope));
  }

  it("«por hacer» es lo que le toca; quien solo puede retirar lo ve en curso", () => revertida(sql, async (tx) => {
    const bandeja = await soloDelCaso(tx);
    const { lider, tramiteId } = await tramiteGth(tx);
    const admin = await sesionAdmin(tx);
    expect(await bandeja("por_hacer", lider)).toEqual([]);
    const enCurso = await bandeja("en_curso", lider);
    expect(enCurso.map((t) => t.id)).toEqual([tramiteId]);
    expect(enCurso[0]).toMatchObject({ tipo: "modificar", etapa: "aceptacion", ronda: 0, codigo: "GTH-PR-01", versionNumero: null });
    expect(enCurso[0].responsables).toContain(admin.nombre);
    expect((await bandeja("por_hacer", admin)).map((t) => t.id)).toEqual([tramiteId]);
    expect(await bandeja("en_curso", await sesionDe(tx, "lider.cex"))).toEqual([]);
    expect(await bandeja("por_hacer", await sesionDe(tx, "consulta"))).toEqual([]);
    expect(await bandeja("cerrados", lider)).toEqual([]);
  }));

  it("el visto bueno es tarea del líder; al retirarse, pasa a cerrados", () => revertida(sql, async (tx) => {
    const bandeja = await soloDelCaso(tx);
    const admin = await sesionAdmin(tx);
    const lider = await sesionDe(tx, "lider.gth");
    const [doc] = await tx`SELECT id FROM documentos WHERE codigo = 'GTH-PR-01'`;
    const r = await crearSolicitud(admin, { tipo: "modificar", motivo: "mejora", justificacion: "Justificación de prueba.", documentoId: doc.id }, opc(tx));
    const [fila] = await bandeja("por_hacer", lider);
    expect(fila).toMatchObject({ id: r.tramiteId, etapa: "visto_bueno" });
    expect(fila.responsables).toEqual([lider.nombre]);
    expect(await bandeja("por_hacer", admin)).toEqual([]);
    await transicionar(admin, { tramiteId: r.tramiteId, accion: "retirar", etapaEsperada: "visto_bueno", rondaEsperada: 0 }, opc(tx));
    expect(await bandeja("en_curso", lider)).toEqual([]);
    const [cerrado] = await bandeja("cerrados", lider);
    expect(cerrado).toMatchObject({ id: r.tramiteId, etapa: "cancelado", venceEn: null, responsables: [] });
  }));

  it("en visto bueno, un proceso inactivo no tiene responsables", () => revertida(sql, async (tx) => {
    const bandeja = await soloDelCaso(tx);
    const admin = await sesionAdmin(tx);
    const [doc] = await tx`SELECT id FROM documentos WHERE codigo = 'GTH-PR-01'`;
    await crearSolicitud(admin, { tipo: "modificar", motivo: "mejora", justificacion: "Justificación de prueba.", documentoId: doc.id }, opc(tx));
    await tx`UPDATE procesos SET activo = false WHERE sigla = 'GTH'`;
    const [fila] = await bandeja("en_curso", admin);
    expect(fila).toMatchObject({ etapa: "visto_bueno", responsables: [] });
  }));

  it("un responsable desactivado sigue saliendo en la bandeja", () => revertida(sql, async (tx) => {
    const bandeja = await soloDelCaso(tx);
    const { tramiteId } = await tramiteGth(tx);
    const admin = await sesionAdmin(tx);
    const elaborador = await usuarioDePrueba(tx, { rol: "consulta" });
    await tx`UPDATE tramites SET etapa = 'elaboracion', ronda = 1, elaborador_id = ${elaborador.usuarioId} WHERE id = ${tramiteId}`;
    await tx`UPDATE usuarios SET activo = false WHERE id = ${elaborador.usuarioId}`;
    const [fila] = await bandeja("en_curso", admin);
    expect(fila.responsables).toEqual([`${elaborador.nombre} (inactivo)`]);
  }));
});

describe("puedePedirSobreDocumento", () => {
  it("el administrador sobre cualquiera; el líder sobre los suyos; los demás sobre ninguno", () => revertida(sql, async (tx) => {
    const [doc] = await tx`SELECT id FROM documentos WHERE codigo = 'GTH-PR-01'`;
    const pide = async (s: Awaited<ReturnType<typeof sesionDe>>) => puedePedirSobreDocumento(s, doc.id, { sql: tx });
    expect(await pide(await sesionAdmin(tx))).toBe(true);
    expect(await pide(await sesionDe(tx, "lider.gth"))).toBe(true);
    expect(await pide(await sesionDe(tx, "lider.cex"))).toBe(false);
    expect(await pide(await sesionDe(tx, "gerente"))).toBe(false);
    expect(await pide(await sesionDe(tx, "consulta"))).toBe(false);
  }));
});
