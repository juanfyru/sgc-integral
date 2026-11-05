/**
 * Elaboración y envío a revisión, contra la demo ya sembrada. Todo corre dentro de una
 * transacción que se revierte; lo que llega al almacén lo borra `limpiar`.
 */
import { existsSync } from "node:fs";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { listarFirmas } from "@/db/consultas/firmas";
import { guardarControlCambios } from "@/db/consultas/tramites-archivos";
import {
  ErrorFirma,
  ErrorTramite,
  MANEJADORES,
  VALIDADORES,
  transicionar,
  type SesionFlujo,
} from "@/db/consultas/tramites-flujo";
import type { Verificador } from "@/lib/firma";
import type { Accion } from "@/lib/tramites/transiciones";
import { archivoPrincipal, opc, sesionDe, tramiteEn } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

describe("enviar a revisión", () => {
  it("no se envía sin archivo principal ni sin control de cambios", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    const enviar = () => tx.savepoint(() => transicionar(t.elaborador, { tramiteId: t.tramiteId, accion: "enviar_a_revision",
      etapaEsperada: "elaboracion", rondaEsperada: 1, credenciales: { clave: "x" } }, opc(tx)));
    await expect(enviar()).rejects.toThrow("Falta el archivo principal");
    const a = await archivoPrincipal(tx, t.versionId!);
    try {
      await expect(enviar()).rejects.toThrow("Falta el control de cambios");
      await guardarControlCambios(t.tramiteId, t.elaborador, "Se añade la inducción por servicio.", { sql: tx });
      expect(await enviar()).toEqual({ etapa: "revision", ronda: 1 });
      const [f] = await listarFirmas(t.tramiteId, { sql: tx });
      expect(f).toMatchObject({ firma: "elaboro", ronda: 1, hashSha256: a.hash, usuarioId: t.elaborador.usuarioId });
    } finally { await a.limpiar(); }
  }));

  it("si la firma falla, el trámite no avanza y no queda firma", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    const a = await archivoPrincipal(tx, t.versionId!);
    try {
      await guardarControlCambios(t.tramiteId, t.elaborador, "Cambios de prueba.", { sql: tx });
      const rechaza: Verificador = async () => ({ ok: false, mensaje: "Clave o código incorrectos", sesionCerrada: false });
      await expect(tx.savepoint(() => transicionar(t.elaborador, { tramiteId: t.tramiteId, accion: "enviar_a_revision",
        etapaEsperada: "elaboracion", rondaEsperada: 1, credenciales: { clave: "mala" } }, { ...opc(tx), verificar: rechaza })))
        .rejects.toBeInstanceOf(ErrorFirma);
      const [fila] = await tx`SELECT etapa FROM tramites WHERE id = ${t.tramiteId}`;
      expect(fila.etapa).toBe("elaboracion");
      expect(await listarFirmas(t.tramiteId, { sql: tx })).toEqual([]);
    } finally { await a.limpiar(); }
  }));

  it("lo que falta se dice antes de pedir la firma: no se gasta un código de recuperación", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    const verificar = vi.fn<Verificador>(async () => ({ ok: true, metodo: "clave" }));
    await expect(tx.savepoint(() => transicionar(t.elaborador, { tramiteId: t.tramiteId, accion: "enviar_a_revision",
      etapaEsperada: "elaboracion", rondaEsperada: 1, credenciales: { clave: "x" } }, { ...opc(tx), verificar })))
      .rejects.toThrow("Falta el archivo principal");
    expect(verificar).not.toHaveBeenCalled();
  }));

  it("un control de cambios en blanco no cuenta", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    const a = await archivoPrincipal(tx, t.versionId!);
    try {
      await tx`UPDATE documento_versiones SET resumen_cambios = '   ' WHERE id = ${t.versionId}`;
      await expect(tx.savepoint(() => transicionar(t.elaborador, { tramiteId: t.tramiteId, accion: "enviar_a_revision",
        etapaEsperada: "elaboracion", rondaEsperada: 1, credenciales: { clave: "x" } }, opc(tx))))
        .rejects.toThrow("Falta el control de cambios");
    } finally { await a.limpiar(); }
  }));

  it("toda observación abierta debe tener respuesta; las atendidas no estorban", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    const a = await archivoPrincipal(tx, t.versionId!);
    try {
      await guardarControlCambios(t.tramiteId, t.elaborador, "Cambios de prueba.", { sql: tx });
      const enviar = () => tx.savepoint(() => transicionar(t.elaborador, { tramiteId: t.tramiteId, accion: "enviar_a_revision",
        etapaEsperada: "elaboracion", rondaEsperada: 1, credenciales: { clave: "x" } }, opc(tx)));
      const [o] = await tx`INSERT INTO tramite_observaciones (tramite_id, numero, ronda, origen, texto, autor_id)
        VALUES (${t.tramiteId}, 1, 1, 'revision', 'Falta el responsable.', ${t.revisor.usuarioId}) RETURNING id`;
      await tx`INSERT INTO tramite_observaciones (tramite_id, numero, ronda, origen, texto, autor_id, estado)
        VALUES (${t.tramiteId}, 2, 1, 'revision', 'Ya atendida.', ${t.revisor.usuarioId}, 'atendida')`;
      await expect(enviar()).rejects.toThrow("Hay observaciones sin responder");
      await tx`UPDATE tramite_observaciones SET respuesta = '   ' WHERE id = ${o.id}`;
      await expect(enviar()).rejects.toThrow("Hay observaciones sin responder");
      await tx`UPDATE tramite_observaciones SET respuesta = 'Se agregó al jefe inmediato.' WHERE id = ${o.id}`;
      expect((await enviar()).etapa).toBe("revision");
    } finally { await a.limpiar(); }
  }));

  it("avisa al revisor con el paso, y a nadie más", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      const avisos = await tx`SELECT usuario_id, tipo, enlace FROM notificaciones
        WHERE entidad = 'tramite' AND entidad_id = ${t.tramiteId} AND tipo = 'tramite.paso' AND titulo LIKE '%revisar%'`;
      expect(avisos.map((a) => Number(a.usuario_id))).toEqual([t.revisor.usuarioId]);
      expect(avisos[0].enlace).toBe(`/tramites/${t.tramiteId}`);
      const [ultimo] = await tx`SELECT tipo FROM tramite_eventos WHERE tramite_id = ${t.tramiteId} ORDER BY id DESC LIMIT 1`;
      expect(ultimo.tipo).toBe("enviar_a_revision");
    } finally { await t.limpiar(); }
  }));
});

describe("control de cambios", () => {
  it("lo escribe solo el elaborador y solo en elaboración, y queda en la bitácora", () => revertida(sql, async (tx) => {
    const consulta = await sesionDe(tx, "consulta");
    const t = await tramiteEn(tx, "elaboracion");
    const guardar = (s: SesionFlujo) => tx.savepoint(() => guardarControlCambios(t.tramiteId, s, "  Se añade la inducción.  ", { sql: tx }));
    await expect(guardar(consulta)).rejects.toThrow("El trámite no existe");
    await expect(guardar(t.revisor)).rejects.toThrow("No es la persona designada para este paso");

    await guardar(t.elaborador);
    const [v] = await tx`SELECT documento_id, resumen_cambios FROM documento_versiones WHERE id = ${t.versionId}`;
    expect(v.resumen_cambios).toBe("Se añade la inducción.");
    const [a] = await tx`SELECT usuario_id, entidad, detalle FROM auditoria
      WHERE accion = 'editar_version' AND entidad_id = ${t.versionId} ORDER BY id DESC LIMIT 1`;
    expect(Number(a.usuario_id)).toBe(t.elaborador.usuarioId);
    expect(a.entidad).toBe("documento_version");
    expect(Number(a.detalle.documentoId)).toBe(Number(v.documento_id));

    await tx`UPDATE tramites SET etapa = 'revision' WHERE id = ${t.tramiteId}`;
    await expect(guardar(t.elaborador)).rejects.toBeInstanceOf(ErrorTramite);
    await expect(guardar(t.elaborador)).rejects.toThrow("Este trámite ya no está en esa etapa");
  }));
});

describe("huella de las firmas siguientes", () => {
  let respaldo: { manejadores: typeof MANEJADORES; validadores: typeof VALIDADORES };
  const reponer = <T extends object>(registro: T, copia: T) => {
    for (const clave of Object.keys(registro)) delete registro[clave as keyof T];
    Object.assign(registro, copia);
  };
  /** Las acciones de las Tareas 9 y 10 se prueban aparte: aquí solo importa la firma. */
  const sinNegocio = (accion: Accion) => {
    MANEJADORES[accion] = async () => {};
    delete VALIDADORES[accion];
  };
  beforeEach(() => {
    respaldo = { manejadores: { ...MANEJADORES }, validadores: { ...VALIDADORES } };
  });
  afterEach(() => {
    reponer(MANEJADORES, respaldo.manejadores);
    reponer(VALIDADORES, respaldo.validadores);
  });

  it("una firma siguiente exige la huella que firmó el elaborador", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      sinNegocio("concepto_favorable");
      const firmar = () => tx.savepoint(() => transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "concepto_favorable",
        etapaEsperada: "revision", rondaEsperada: 1, credenciales: { clave: "x" } }, opc(tx)));
      const [{ hash_sha256: original }] = await tx`SELECT hash_sha256 FROM archivos WHERE version_id = ${t.versionId} AND rol = 'principal'`;
      await tx`UPDATE archivos SET hash_sha256 = ${"0".repeat(64)} WHERE version_id = ${t.versionId} AND rol = 'principal'`;
      await expect(firmar()).rejects.toThrow("El archivo cambió después de la firma de quien elaboró");
      expect((await listarFirmas(t.tramiteId, { sql: tx })).map((f) => f.firma)).toEqual(["elaboro"]);

      await tx`UPDATE archivos SET hash_sha256 = ${original} WHERE version_id = ${t.versionId} AND rol = 'principal'`;
      expect(await firmar()).toEqual({ etapa: "aprobacion", ronda: 1 });
      const firmas = await listarFirmas(t.tramiteId, { sql: tx });
      expect(firmas.map((f) => f.firma)).toEqual(["elaboro", "reviso"]);
      expect(firmas[1].hashSha256).toBe(firmas[0].hashSha256);
    } finally { await t.limpiar(); }
  }));

  it("cuenta la ronda en curso: lo que se firmó en otra ronda no vale", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      sinNegocio("concepto_favorable");
      await tx`UPDATE tramites SET ronda = 2 WHERE id = ${t.tramiteId}`;
      await expect(tx.savepoint(() => transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "concepto_favorable",
        etapaEsperada: "revision", rondaEsperada: 2, credenciales: { clave: "x" } }, opc(tx))))
        .rejects.toThrow("El archivo cambió después de la firma de quien elaboró");
    } finally { await t.limpiar(); }
  }));

  it("en una eliminación nadie elabora, y la firma lleva la huella de lo que se retira", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aprobacion", { codigo: "GTH-PR-01", tipo: "eliminar" });
    sinNegocio("aprobar");
    expect(await transicionar(t.aprobador, { tramiteId: t.tramiteId, accion: "aprobar", etapaEsperada: "aprobacion",
      rondaEsperada: t.ronda, credenciales: { clave: "x" } }, opc(tx))).toEqual({ etapa: "publicacion", ronda: t.ronda });
    const [archivo] = await tx`SELECT hash_sha256 FROM archivos WHERE version_id = ${t.versionId} AND rol = 'principal'`;
    expect((await listarFirmas(t.tramiteId, { sql: tx }))[0]).toMatchObject({ firma: "aprobo", hashSha256: archivo.hash_sha256 });
  }));
});
