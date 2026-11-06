/**
 * Solicitud, visto bueno y punto único de transiciones, contra la demo ya sembrada. Todo
 * corre dentro de una transacción que se revierte: no deja filas.
 */
import { existsSync } from "node:fs";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import type { TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { CONFIG_DOCUMENTAL_DEFECTO, obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { listarFirmas } from "@/db/consultas/firmas";
import {
  ErrorFirma,
  ErrorTramite,
  MANEJADORES,
  VALIDADORES,
  crearSolicitud,
  enTransaccion,
  transicionar,
  type Manejador,
} from "@/db/consultas/tramites-flujo";
import type { Verificador } from "@/lib/firma";
import type { Accion } from "@/lib/tramites/transiciones";
import { documentoLibre, opc, sesionAdmin, sesionDe, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const JUSTIFICACION = "Justificación de prueba.";

describe("solicitud y visto bueno", () => {
  it("el líder pide sobre su proceso y el visto bueno queda dado", () => revertida(sql, async (tx) => {
    const lider = await sesionDe(tx, "lider.gth");
    const doc = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
    const r = await crearSolicitud(lider, { tipo: "modificar", motivo: "mejora", justificacion: "Se añade la inducción por servicio.", documentoId: doc.id }, opc(tx));
    expect(r.numero).toMatch(/^SOL-2026-\d{3,}$/);
    expect(r.etapa).toBe("aceptacion");
    const eventos = await tx`SELECT tipo FROM tramite_eventos WHERE tramite_id = ${r.tramiteId} ORDER BY id`;
    expect(eventos.map((e) => e.tipo)).toEqual(["solicitar", "visto_bueno_automatico"]);
    const [t] = await tx`SELECT vence_en, ronda FROM tramites WHERE id = ${r.tramiteId}`;
    expect(t.vence_en.toISOString()).toBe("2026-11-09T04:59:59.999Z");        // aceptación: 3 días
    expect(t.ronda).toBe(0);
    const avisos = await tx`SELECT n.tipo FROM notificaciones n JOIN usuarios u ON u.id = n.usuario_id
      WHERE n.entidad = 'tramite' AND n.entidad_id = ${r.tramiteId} AND u.rol = 'admin_sgc'`;
    expect(avisos.length).toBeGreaterThan(0);
    expect(avisos.every((a) => a.tipo === "tramite.paso")).toBe(true);
  }));

  it("un líder no pide sobre un proceso ajeno, ni dos veces sobre el mismo documento", () => revertida(sql, async (tx) => {
    const doc = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
    const datos = { tipo: "modificar", motivo: "mejora", justificacion: JUSTIFICACION, documentoId: doc.id } as const;
    await expect(crearSolicitud(await sesionDe(tx, "lider.cex"), datos, opc(tx))).rejects.toThrow(/procesos que lidera/);
    await crearSolicitud(await sesionDe(tx, "lider.gth"), datos, opc(tx));
    await expect(crearSolicitud(await sesionDe(tx, "lider.gth"), datos, opc(tx))).rejects.toThrow(/Ya hay un trámite abierto/);
    // Se detecta antes del INSERT: la transacción de quien llama sigue viva.
    await expect(tx`SELECT 1`).resolves.toHaveLength(1);
  }));

  it("si pide el Admin SGC, el líder da o niega el visto bueno", () => revertida(sql, async (tx) => {
    const admin = await sesionAdmin(tx);                                       // crea un admin_sgc dentro de la transacción
    const doc = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
    const r = await crearSolicitud(admin, { tipo: "eliminar", motivo: "mejora", justificacion: "Ya no se usa en el proceso.", documentoId: doc.id }, opc(tx));
    expect(r.etapa).toBe("visto_bueno");
    const entrada = { tramiteId: r.tramiteId, accion: "dar_visto_bueno", etapaEsperada: "visto_bueno", rondaEsperada: 0 } as const;
    await expect(transicionar(await sesionDe(tx, "lider.cex"), entrada, opc(tx))).rejects.toBeInstanceOf(ErrorTramite);
    expect(await transicionar(await sesionDe(tx, "lider.gth"), entrada, opc(tx))).toEqual({ etapa: "aceptacion", ronda: 0 });
    await expect(transicionar(await sesionDe(tx, "lider.gth"), entrada, opc(tx))).rejects.toThrow(/cambió mientras/);  // doble envío
  }));

  it("sin líder en el proceso el visto bueno se omite; negar exige motivo; retirar cancela", () => revertida(sql, async (tx) => {
    const admin = await sesionAdmin(tx);
    const [p] = await tx`SELECT p.id FROM procesos p WHERE p.activo AND NOT EXISTS (
      SELECT 1 FROM usuario_procesos up JOIN usuarios u ON u.id = up.usuario_id AND u.activo AND u.rol = 'lider_proceso' WHERE up.proceso_id = p.id) LIMIT 1`;
    const [tipo] = await tx`SELECT id FROM tipos_documento WHERE sigla = 'FO'`;
    const r = await crearSolicitud(admin, { tipo: "crear", motivo: "solicitud_personal", justificacion: "Se necesita un formato nuevo.", procesoId: p.id, tipoDocumentoId: tipo.id, tituloPropuesto: "Formato de prueba" }, opc(tx));
    expect(r.etapa).toBe("aceptacion");
    const [e] = await tx`SELECT tipo FROM tramite_eventos WHERE tramite_id = ${r.tramiteId} ORDER BY id DESC LIMIT 1`;
    expect(e.tipo).toBe("visto_bueno_omitido");
    expect(await transicionar(admin, { tramiteId: r.tramiteId, accion: "retirar", etapaEsperada: "aceptacion", rondaEsperada: 0 }, opc(tx)))
      .toEqual({ etapa: "cancelado", ronda: 0 });
    const [t] = await tx`SELECT vence_en, cerrado_en FROM tramites WHERE id = ${r.tramiteId}`;
    expect(t.vence_en).toBeNull(); expect(t.cerrado_en).not.toBeNull();
  }));

  it("negar el visto bueno exige motivo, cierra el trámite y avisa al solicitante", () => revertida(sql, async (tx) => {
    const admin = await sesionAdmin(tx);
    const lider = await sesionDe(tx, "lider.gth");
    const doc = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
    const r = await crearSolicitud(admin, { tipo: "modificar", motivo: "mejora", justificacion: JUSTIFICACION, documentoId: doc.id }, opc(tx));
    const entrada = { tramiteId: r.tramiteId, accion: "negar_visto_bueno", etapaEsperada: "visto_bueno", rondaEsperada: 0 } as const;
    await expect(transicionar(lider, entrada, opc(tx))).rejects.toThrow(/motivo/);
    await expect(transicionar(lider, { ...entrada, datos: { motivo: "   " } }, opc(tx))).rejects.toThrow(/motivo/);
    expect(await transicionar(lider, { ...entrada, datos: { motivo: "No corresponde al proceso." } }, opc(tx))).toEqual({ etapa: "rechazado", ronda: 0 });
    const [t] = await tx`SELECT motivo_cierre, vence_en, cerrado_en FROM tramites WHERE id = ${r.tramiteId}`;
    expect(t.motivo_cierre).toBe("No corresponde al proceso.");
    expect(t.vence_en).toBeNull();
    expect(t.cerrado_en).not.toBeNull();
    const [e] = await tx`SELECT detalle, usuario_id FROM tramite_eventos WHERE tramite_id = ${r.tramiteId} AND tipo = 'negar_visto_bueno'`;
    expect(e.detalle).toEqual({ motivo: "No corresponde al proceso." });
    expect(e.usuario_id).toBe(lider.usuarioId);
    const avisos = await tx`SELECT usuario_id, enlace FROM notificaciones WHERE entidad = 'tramite' AND entidad_id = ${r.tramiteId} AND tipo = 'tramite.resuelto'`;
    expect(avisos.map((a) => a.usuario_id)).toEqual([admin.usuarioId]);
    expect(avisos[0].enlace).toBe(`/tramites/${r.tramiteId}`);
  }));

  it("dar el visto bueno avisa a cada administrador una vez y a quien actúa ninguna", () => revertida(sql, async (tx) => {
    const admin = await sesionAdmin(tx);
    const lider = await sesionDe(tx, "lider.gth");
    const doc = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
    const r = await crearSolicitud(admin, { tipo: "modificar", motivo: "mejora", justificacion: JUSTIFICACION, documentoId: doc.id }, opc(tx));
    const [pedido] = await tx`SELECT count(*)::int AS n FROM notificaciones WHERE entidad = 'tramite' AND entidad_id = ${r.tramiteId}`;
    expect(pedido.n).toBeGreaterThan(0);                                       // los líderes de GTH
    await tx`DELETE FROM notificaciones WHERE entidad = 'tramite' AND entidad_id = ${r.tramiteId}`;
    await transicionar(lider, { tramiteId: r.tramiteId, accion: "dar_visto_bueno", etapaEsperada: "visto_bueno", rondaEsperada: 0 }, opc(tx));
    const avisos = await tx`SELECT usuario_id, tipo FROM notificaciones WHERE entidad = 'tramite' AND entidad_id = ${r.tramiteId}`;
    const ids = avisos.map((a) => a.usuario_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(lider.usuarioId);
    expect(avisos.find((a) => a.usuario_id === admin.usuarioId)?.tipo).toBe("tramite.resuelto");
    const otros = avisos.filter((a) => a.usuario_id !== admin.usuarioId);
    expect(otros.length).toBeGreaterThan(0);
    expect(otros.every((a) => a.tipo === "tramite.paso")).toBe(true);
    const [{ vence_en }] = await tx`SELECT vence_en FROM tramites WHERE id = ${r.tramiteId}`;
    expect(vence_en.toISOString()).toBe("2026-11-09T04:59:59.999Z");
  }));

  it("nadie se avisa de lo que acaba de hacer", () => revertida(sql, async (tx) => {
    const admin = await sesionAdmin(tx);
    const otro = await sesionAdmin(tx);
    const [p] = await tx`SELECT p.id FROM procesos p WHERE p.activo AND NOT EXISTS (
      SELECT 1 FROM usuario_procesos up JOIN usuarios u ON u.id = up.usuario_id AND u.activo AND u.rol = 'lider_proceso' WHERE up.proceso_id = p.id) LIMIT 1`;
    const [tipo] = await tx`SELECT id FROM tipos_documento WHERE sigla = 'FO'`;
    const r = await crearSolicitud(admin, { tipo: "crear", motivo: "mejora", justificacion: JUSTIFICACION, procesoId: p.id, tipoDocumentoId: tipo.id, tituloPropuesto: "Formato de prueba" }, opc(tx));
    const avisados = async () => (await tx`SELECT usuario_id FROM notificaciones WHERE entidad = 'tramite' AND entidad_id = ${r.tramiteId}`).map((n) => n.usuario_id);
    expect(await avisados()).toContain(otro.usuarioId);
    expect(await avisados()).not.toContain(admin.usuarioId);
    await transicionar(admin, { tramiteId: r.tramiteId, accion: "retirar", etapaEsperada: "aceptacion", rondaEsperada: 0 }, opc(tx));
    expect(await avisados()).not.toContain(admin.usuarioId);
  }));

  it("retirar exige ser el solicitante, y un rechazo no escribe nada", () => revertida(sql, async (tx) => {
    const admin = await sesionAdmin(tx);
    const otro = await sesionAdmin(tx);
    const doc = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
    const r = await crearSolicitud(admin, { tipo: "modificar", motivo: "mejora", justificacion: JUSTIFICACION, documentoId: doc.id }, opc(tx));
    const entrada = { tramiteId: r.tramiteId, accion: "retirar", etapaEsperada: "visto_bueno", rondaEsperada: 0 } as const;
    await expect(transicionar(otro, entrada, opc(tx))).rejects.toThrow(/persona designada/);
    const ultimaAuditoria = async () => (await tx`SELECT accion, detalle FROM auditoria WHERE entidad = 'tramite' AND entidad_id = ${r.tramiteId} ORDER BY id DESC LIMIT 1`)[0];
    expect((await ultimaAuditoria()).accion).toBe("tramite_solicitar");
    await transicionar(admin, entrada, opc(tx));
    const a = await ultimaAuditoria();
    expect(a.accion).toBe("tramite_retirar");
    expect(a.detalle).toMatchObject({ codigo: doc.codigo, documentoId: doc.id, de: "visto_bueno", hacia: "cancelado", ronda: 0 });
    const lideres = await tx`SELECT n.tipo FROM notificaciones n JOIN usuarios u ON u.id = n.usuario_id
      WHERE n.entidad = 'tramite' AND n.entidad_id = ${r.tramiteId} AND n.tipo = 'tramite.cerrado' AND u.usuario = 'lider.gth'`;
    expect(lideres).toHaveLength(1);
  }));

  it("retirar avisa a los líderes de todos los procesos del documento", () => revertida(sql, async (tx) => {
    const admin = await sesionAdmin(tx);
    const doc = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
    const [cex] = await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`;
    await tx`INSERT INTO documento_proceso (documento_id, proceso_id, es_principal) VALUES (${doc.id}, ${cex.id}, false)`;
    const r = await crearSolicitud(admin, { tipo: "modificar", motivo: "mejora", justificacion: JUSTIFICACION, documentoId: doc.id }, opc(tx));
    await transicionar(admin, { tramiteId: r.tramiteId, accion: "retirar", etapaEsperada: "visto_bueno", rondaEsperada: 0 }, opc(tx));
    const avisados = await tx`SELECT u.usuario FROM notificaciones n JOIN usuarios u ON u.id = n.usuario_id
      WHERE n.entidad = 'tramite' AND n.entidad_id = ${r.tramiteId} AND n.tipo = 'tramite.cerrado' ORDER BY u.usuario`;
    expect(avisados.map((a) => a.usuario)).toEqual(["lider.cex", "lider.gth"]);
  }));

  it("en una creación sin documento, retirar avisa a los líderes del proceso declarado", () => revertida(sql, async (tx) => {
    const admin = await sesionAdmin(tx);
    const [cex] = await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`;
    const [tipo] = await tx`SELECT id FROM tipos_documento WHERE sigla = 'FO'`;
    const r = await crearSolicitud(admin, { tipo: "crear", motivo: "mejora", justificacion: JUSTIFICACION, procesoId: cex.id, tipoDocumentoId: tipo.id, tituloPropuesto: "Formato de prueba" }, opc(tx));
    await transicionar(admin, { tramiteId: r.tramiteId, accion: "retirar", etapaEsperada: "visto_bueno", rondaEsperada: 0 }, opc(tx));
    const avisados = await tx`SELECT u.usuario FROM notificaciones n JOIN usuarios u ON u.id = n.usuario_id
      WHERE n.entidad = 'tramite' AND n.entidad_id = ${r.tramiteId} AND n.tipo = 'tramite.cerrado'`;
    expect(avisados.map((a) => a.usuario)).toEqual(["lider.cex"]);
  }));

  it("reglas de crear: permiso, proceso activo, tipo activo, título y documento vigente", () => revertida(sql, async (tx) => {
    const admin = await sesionAdmin(tx);
    const base = { motivo: "mejora", justificacion: JUSTIFICACION } as const;
    const consulta = await sesionDe(tx, "consulta");
    const doc = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
    await expect(crearSolicitud(consulta, { ...base, tipo: "modificar", documentoId: doc.id }, opc(tx))).rejects.toBeInstanceOf(ErrorTramite);

    const [gth] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
    const [cex] = await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`;
    const [tipo] = await tx`SELECT id FROM tipos_documento WHERE sigla = 'FO'`;
    const [sub] = await tx`SELECT id FROM subprocesos WHERE proceso_id = ${gth.id} AND activo LIMIT 1`;
    const crear = { ...base, tipo: "crear", tipoDocumentoId: tipo.id, tituloPropuesto: "Formato de prueba" } as const;
    await expect(crearSolicitud(admin, { ...crear }, opc(tx))).rejects.toThrow(/proceso/i);
    await expect(crearSolicitud(admin, { ...crear, procesoId: gth.id, tituloPropuesto: undefined }, opc(tx))).rejects.toThrow(/título/i);
    await expect(crearSolicitud(admin, { ...crear, procesoId: gth.id, tipoDocumentoId: undefined }, opc(tx))).rejects.toThrow(/tipo de documento/i);
    await expect(crearSolicitud(admin, { ...crear, procesoId: cex.id, subprocesoId: sub.id }, opc(tx))).rejects.toThrow(/subproceso/i);

    await tx`UPDATE tipos_documento SET activo = false WHERE id = ${tipo.id}`;
    await expect(crearSolicitud(admin, { ...crear, procesoId: gth.id }, opc(tx))).rejects.toThrow(/tipo de documento/i);
    await tx`UPDATE tipos_documento SET activo = true WHERE id = ${tipo.id}`;

    const porSub = await crearSolicitud(admin, { ...crear, subprocesoId: sub.id }, opc(tx));
    const [t] = await tx`SELECT proceso_id, subproceso_id FROM tramites WHERE id = ${porSub.tramiteId}`;
    expect(t).toEqual({ proceso_id: gth.id, subproceso_id: sub.id });

    const sinVigente = await documentoLibre(tx, { proceso: "SGC", tipo: "FO" });
    await tx`UPDATE documento_versiones SET estado = 'borrador' WHERE documento_id = ${sinVigente.id}`;
    await expect(crearSolicitud(admin, { ...base, tipo: "modificar", documentoId: sinVigente.id }, opc(tx))).rejects.toThrow(/versión vigente/);
    await expect(crearSolicitud(admin, { ...base, tipo: "eliminar" }, opc(tx))).rejects.toThrow(/documento/i);
  }));

  it("el número es anual, por la zona de la instalación, con al menos tres dígitos", () => revertida(sql, async (tx) => {
    const admin = await sesionAdmin(tx);
    const [p] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
    const [tipo] = await tx`SELECT id FROM tipos_documento WHERE sigla = 'FO'`;
    const crear = { tipo: "crear", motivo: "mejora", justificacion: JUSTIFICACION, procesoId: p.id, tipoDocumentoId: tipo.id, tituloPropuesto: "Formato de prueba" } as const;
    const uno = await crearSolicitud(admin, crear, opc(tx));
    const dos = await crearSolicitud(admin, crear, opc(tx));
    const n = (s: string) => Number(s.split("-")[2]);
    expect(n(dos.numero)).toBe(n(uno.numero) + 1);
    // 04:59 UTC del 1 de enero aún es 31 de diciembre en Bogotá.
    expect((await crearSolicitud(admin, crear, opc(tx, "2027-01-01T04:59:00Z"))).numero).toMatch(/^SOL-2026-/);
    expect((await crearSolicitud(admin, crear, opc(tx, "2027-01-01T05:00:00Z"))).numero).toBe("SOL-2027-001");
  }));

  it("dos solicitudes simultáneas se turnan el consecutivo", async () => {
    const pedir = async (tx: TransactionSql) => {
      const admin = await sesionAdmin(tx);
      const [p] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
      const [tipo] = await tx`SELECT id FROM tipos_documento WHERE sigla = 'FO'`;
      return crearSolicitud(admin, { tipo: "crear", motivo: "mejora", justificacion: JUSTIFICACION, procesoId: p.id, tipoDocumentoId: tipo.id, tituloPropuesto: "Formato de prueba" }, opc(tx));
    };
    let soltar = () => {};
    const espera = new Promise<void>((r) => { soltar = r; });
    let avisarLista = () => {};
    const lista = new Promise<void>((r) => { avisarLista = r; });
    const primera = revertida(sql, async (tx) => {
      await pedir(tx);
      avisarLista();
      await espera;
    });
    await Promise.race([lista, primera]);                                      // si la primera falla, el test acaba aquí
    let segundaTermino = false;
    const segunda = revertida(sql, async (tx) => {
      await pedir(tx);
      segundaTermino = true;
    });
    // Sin el candado también esperaría, pero en el índice único y para fallar al confirmarse la primera.
    try {
      let esperaCandado = false;
      for (let i = 0; i < 100 && !esperaCandado; i++) {
        const [{ n }] = await sql`SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`;
        esperaCandado = n > 0;
        if (!esperaCandado) await new Promise((r) => setTimeout(r, 20));
      }
      expect(esperaCandado).toBe(true);
      expect(segundaTermino).toBe(false);
    } finally {
      soltar();                                                                // con un fallo, tampoco deja la transacción abierta
    }
    await Promise.all([primera, segunda]);
    expect(segundaTermino).toBe(true);
  });
});

describe("configuración documental", () => {
  it("lee los valores y cae al defecto si la clave falta, está vacía o no es un entero de 0 a 365", () => revertida(sql, async (tx) => {
    await tx`DELETE FROM configuracion WHERE clave LIKE 'plazo%' OR clave IN ('escalamiento_dias', 'publicacion_directa', 'formato_codigo')`;
    expect(await obtenerConfigDocumental({ sql: tx })).toEqual(CONFIG_DOCUMENTAL_DEFECTO);
    await tx`INSERT INTO configuracion (clave, valor) VALUES
      ('plazo_revision_dias', '0'), ('plazo_aprobacion_dias', '366'), ('plazo_elaboracion_dias', '2.5'),
      ('plazo_publicacion_dias', ''), ('plazo_aceptacion_dias', '-1'), ('plazo_ajustes_dias', ' 7 '),
      ('escalamiento_dias', 'x'), ('publicacion_directa', '0'), ('formato_codigo', '{PROCESO}-{TIPO}-{NNN}')`;
    const c = await obtenerConfigDocumental({ sql: tx });
    expect(c.plazos).toEqual({ ...CONFIG_DOCUMENTAL_DEFECTO.plazos, revision: 0, ajustes: 7 });
    expect(c.escalamientoDias).toBe(3);
    expect(c.publicacionDirecta).toBe(false);
    expect(c.formatoCodigo).toBe("{PROCESO}-{TIPO}-{NNN}");
  }));
});

describe("transicionar", () => {
  // Estos casos prueban `transicionar`, no los manejadores reales que las tareas siguientes
  // registran: cada uno cambia los registros a su medida y al final se dejan como estaban.
  const reponer = <T extends object>(registro: T, respaldo: T) => {
    for (const clave of Object.keys(registro)) delete registro[clave as keyof T];
    Object.assign(registro, respaldo);
  };
  let respaldo = { manejadores: { ...MANEJADORES }, validadores: { ...VALIDADORES } };
  const registrar = (accion: Accion, manejador: Manejador) => {
    MANEJADORES[accion] = manejador;
    delete VALIDADORES[accion];
  };
  beforeEach(() => {
    respaldo = { manejadores: { ...MANEJADORES }, validadores: { ...VALIDADORES } };
  });
  afterEach(() => {
    reponer(MANEJADORES, respaldo.manejadores);
    reponer(VALIDADORES, respaldo.validadores);
  });

  /** Trámite en elaboración sobre la versión vigente de un documento, que tiene archivo principal. */
  async function enElaboracion(tx: TransactionSql) {
    const lider = await sesionDe(tx, "lider.gth");
    const admin = await sesionAdmin(tx);
    const libre = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
    const [doc] = await tx`SELECT d.id, d.codigo, v.id AS version_id, a.hash_sha256 FROM documentos d
      JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'
      JOIN archivos a ON a.version_id = v.id AND a.rol = 'principal'
      WHERE d.id = ${libre.id}`;
    const r = await crearSolicitud(lider, { tipo: "modificar", motivo: "mejora", justificacion: JUSTIFICACION, documentoId: doc.id }, opc(tx));
    await tx`UPDATE tramites SET etapa = 'elaboracion', ronda = 1, elaborador_id = ${lider.usuarioId},
      revisor_id = ${admin.usuarioId}, aprobador_id = ${admin.usuarioId}, version_id = ${doc.version_id} WHERE id = ${r.tramiteId}`;
    const entrada = { tramiteId: r.tramiteId, accion: "enviar_a_revision", etapaEsperada: "elaboracion", rondaEsperada: 1, credenciales: { clave: "x" } } as const;
    return { lider, admin, tramiteId: r.tramiteId, entrada, huella: doc.hash_sha256 as string, versionId: Number(doc.version_id), codigo: libre.codigo };
  }

  it("no llama al verificador si la acción no procede", () => revertida(sql, async (tx) => {
    const lider = await sesionDe(tx, "lider.gth");
    const doc = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
    const r = await crearSolicitud(lider, { tipo: "modificar", motivo: "mejora", justificacion: "Justificación de prueba.", documentoId: doc.id }, opc(tx));
    let llamadas = 0;
    const verificar: Verificador = async () => { llamadas++; return { ok: true, metodo: "clave" }; };
    await expect(tx.savepoint(() => transicionar(lider, { tramiteId: r.tramiteId, accion: "enviar_a_revision", etapaEsperada: "aceptacion", rondaEsperada: 0, credenciales: { clave: "x" } }, { ...opc(tx), verificar })))
      .rejects.toBeInstanceOf(ErrorTramite);
    expect(llamadas).toBe(0);
  }));

  it("el trámite que no se puede ver y el que no existe responden igual", () => revertida(sql, async (tx) => {
    const lider = await sesionDe(tx, "lider.gth");
    const doc = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
    const r = await crearSolicitud(lider, { tipo: "modificar", motivo: "mejora", justificacion: JUSTIFICACION, documentoId: doc.id }, opc(tx));
    const entrada = { tramiteId: r.tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0 } as const;
    await expect(transicionar(await sesionDe(tx, "gerente"), entrada, opc(tx))).rejects.toThrow("El trámite no existe");
    await expect(transicionar(lider, { ...entrada, tramiteId: 999_999_999 }, opc(tx))).rejects.toThrow("El trámite no existe");
  }));

  it("una acción sin manejador no está disponible y no llega a la firma", () => revertida(sql, async (tx) => {
    const t = await enElaboracion(tx);
    delete MANEJADORES.enviar_a_revision;
    delete VALIDADORES.enviar_a_revision;
    let llamadas = 0;
    const verificar: Verificador = async () => { llamadas++; return { ok: true, metodo: "clave" }; };
    await expect(transicionar(t.lider, t.entrada, { ...opc(tx), verificar })).rejects.toThrow("Acción no disponible");
    expect(llamadas).toBe(0);
  }));

  it("una acción que firma registra la firma con la huella del principal y la hora de `ahora`", () => revertida(sql, async (tx) => {
    const t = await enElaboracion(tx);
    registrar("enviar_a_revision", async () => ({ detalle: { nota: "lista" } }));
    const ahora = "2026-11-06T16:30:00Z";
    expect(await transicionar(t.lider, t.entrada, opc(tx, ahora))).toEqual({ etapa: "revision", ronda: 1 });
    const firmas = await listarFirmas(t.tramiteId, { sql: tx });
    expect(firmas).toHaveLength(1);
    expect(firmas[0]).toMatchObject({ firma: "elaboro", ronda: 1, usuarioId: t.lider.usuarioId, hashSha256: t.huella, metodo: "clave" });
    expect(firmas[0].creadoEn.toISOString()).toBe(new Date(ahora).toISOString());
    const [f] = await tx`SELECT version_id FROM firmas WHERE tramite_id = ${t.tramiteId}`;
    expect(f.version_id).toBe(t.versionId);
    const [e] = await tx`SELECT tipo, ronda, detalle, creado_en FROM tramite_eventos WHERE tramite_id = ${t.tramiteId} ORDER BY id DESC LIMIT 1`;
    expect(e).toMatchObject({ tipo: "enviar_a_revision", ronda: 1, detalle: { nota: "lista" } });
    expect(e.creado_en.toISOString()).toBe(new Date(ahora).toISOString());
    const [fila] = await tx`SELECT vence_en, actualizado_en, aviso_vencido_en, escalado_en FROM tramites WHERE id = ${t.tramiteId}`;
    expect(fila.actualizado_en.toISOString()).toBe(new Date(ahora).toISOString());
    expect(fila.vence_en.toISOString()).toBe("2026-11-12T04:59:59.999Z");      // revisión: 5 días desde el 6 de noviembre
    expect(fila.aviso_vencido_en).toBeNull();
    expect(fila.escalado_en).toBeNull();
    const [a] = await tx`SELECT detalle FROM auditoria WHERE accion = 'tramite_enviar_a_revision' AND entidad_id = ${t.tramiteId}`;
    expect(a.detalle).toMatchObject({ codigo: t.codigo, de: "elaboracion", hacia: "revision", ronda: 1, nota: "lista" });
  }));

  it("sin credenciales o con una firma fallida no hay transición, y `sesionCerrada` viaja en el error", () => revertida(sql, async (tx) => {
    const t = await enElaboracion(tx);
    let manejado = 0;
    registrar("enviar_a_revision", async () => { manejado++; });
    await expect(transicionar(t.lider, { ...t.entrada, credenciales: undefined }, opc(tx))).rejects.toBeInstanceOf(ErrorFirma);
    const rechaza = (sesionCerrada: boolean): Verificador => async () => ({ ok: false, mensaje: "Clave o código incorrectos", sesionCerrada });
    const abierta = await transicionar(t.lider, t.entrada, { ...opc(tx), verificar: rechaza(false) }).catch((e: unknown) => e);
    expect(abierta).toBeInstanceOf(ErrorFirma);
    expect((abierta as ErrorFirma).sesionCerrada).toBe(false);
    expect((abierta as ErrorFirma).message).toBe("Clave o código incorrectos");
    const cerrada = await transicionar(t.lider, t.entrada, { ...opc(tx), verificar: rechaza(true) }).catch((e: unknown) => e);
    expect((cerrada as ErrorFirma).sesionCerrada).toBe(true);
    expect((cerrada as ErrorFirma).bloqueada).toBe(false);
    expect(cerrada).toBeInstanceOf(ErrorTramite);
    const bloquea: Verificador = async () => ({ ok: false, mensaje: "Clave o código incorrectos", sesionCerrada: true, bloqueada: true });
    expect(((await transicionar(t.lider, t.entrada, { ...opc(tx), verificar: bloquea }).catch((e: unknown) => e)) as ErrorFirma).bloqueada).toBe(true);
    expect(manejado).toBe(0);
    expect(await listarFirmas(t.tramiteId, { sql: tx })).toEqual([]);
  }));

  it("el validador corre antes de la firma y otra vez con la fila bloqueada", () => revertida(sql, async (tx) => {
    const t = await enElaboracion(tx);
    let firmas = 0;
    const verificar: Verificador = async () => { firmas++; return { ok: true, metodo: "clave" }; };
    registrar("enviar_a_revision", async () => {});
    let vistas = 0;
    VALIDADORES.enviar_a_revision = async ({ datos, tramite }) => {
      vistas++;
      expect(tramite.id).toBe(t.tramiteId);
      if (datos.falla) throw new ErrorTramite("Falta el archivo principal");
    };
    await expect(transicionar(t.lider, { ...t.entrada, datos: { falla: true } }, { ...opc(tx), verificar })).rejects.toThrow("Falta el archivo principal");
    expect(firmas).toBe(0);
    expect(vistas).toBe(1);
    await transicionar(t.lider, t.entrada, { ...opc(tx), verificar });
    expect(firmas).toBe(1);
    expect(vistas).toBe(3);
  }));

  it("si otra pestaña se adelanta durante la firma, la transacción lo detecta y no escribe", () => revertida(sql, async (tx) => {
    const t = await enElaboracion(tx);
    registrar("enviar_a_revision", async () => {});
    const verificar: Verificador = async () => {
      await tx`UPDATE tramites SET etapa = 'revision' WHERE id = ${t.tramiteId}`;
      return { ok: true, metodo: "clave" };
    };
    await expect(transicionar(t.lider, t.entrada, { ...opc(tx), verificar })).rejects.toThrow(/cambió mientras/);
    expect(await listarFirmas(t.tramiteId, { sql: tx })).toEqual([]);
    expect(await tx`SELECT 1 FROM tramite_eventos WHERE tramite_id = ${t.tramiteId} AND tipo = 'enviar_a_revision'`).toHaveLength(0);
  }));

  it("sin archivo principal la firma falla con un error de negocio", () => revertida(sql, async (tx) => {
    const t = await enElaboracion(tx);
    registrar("enviar_a_revision", async () => {});
    await tx`UPDATE tramites SET version_id = NULL WHERE id = ${t.tramiteId}`;
    await expect(tx.savepoint(() => transicionar(t.lider, t.entrada, opc(tx)))).rejects.toThrow("Falta el archivo principal");
  }));

  it("aplica los cambios y el vencimiento del efecto; la ronda sube y ajustes usa su plazo", () => revertida(sql, async (tx) => {
    const t = await enElaboracion(tx);
    const nuevo = await usuarioDePrueba(tx, { rol: "lider_proceso" });
    await tx`UPDATE tramites SET etapa = 'revision', vence_en = '2026-12-01T00:00:00Z', aviso_vencido_en = now(), escalado_en = now() WHERE id = ${t.tramiteId}`;
    // Una devolución entra a elaboración con la ronda 2: plazo de ajustes (5 días).
    registrar("devolver_revision", async () => ({ cambios: { revisorId: nuevo.usuarioId, tituloPropuesto: undefined } }));
    expect(await transicionar(t.admin, { tramiteId: t.tramiteId, accion: "devolver_revision", etapaEsperada: "revision", rondaEsperada: 1 }, opc(tx)))
      .toEqual({ etapa: "elaboracion", ronda: 2 });
    const [a] = await tx`SELECT revisor_id, vence_en, aviso_vencido_en, escalado_en FROM tramites WHERE id = ${t.tramiteId}`;
    expect(a.revisor_id).toBe(nuevo.usuarioId);
    expect(a.vence_en.toISOString()).toBe("2026-11-11T04:59:59.999Z");
    expect([a.aviso_vencido_en, a.escalado_en]).toEqual([null, null]);
    // Si la etapa no cambia el vencimiento se conserva, y un efecto lo puede fijar.
    const entrada = { tramiteId: t.tramiteId, accion: "reasignar", etapaEsperada: "elaboracion", rondaEsperada: 2 } as const;
    registrar("reasignar", async () => {});
    await transicionar(t.admin, entrada, opc(tx));
    const [b] = await tx`SELECT vence_en FROM tramites WHERE id = ${t.tramiteId}`;
    expect(b.vence_en.toISOString()).toBe("2026-11-11T04:59:59.999Z");
    const fijo = new Date("2026-12-24T04:59:59.999Z");
    registrar("reasignar", async () => ({ cambios: { venceEn: fijo } }));
    await transicionar(t.admin, entrada, opc(tx));
    const [c] = await tx`SELECT vence_en FROM tramites WHERE id = ${t.tramiteId}`;
    expect(c.vence_en.toISOString()).toBe(fijo.toISOString());
  }));

  it("enTransaccion abre una transacción, o un savepoint dentro de la que le dan", async () => {
    await revertida(sql, async (tx) => {
      const [fuera] = await tx`SELECT txid_current() AS id`;
      const dentro = await enTransaccion(tx, async (t) => (await t`SELECT txid_current() AS id`)[0].id);
      expect(dentro).toBe(fuera.id);                                           // no abre otra
      const orden = async () => (await tx`SELECT orden FROM tipos_documento WHERE sigla = 'FO'`)[0].orden;
      const antes = await orden();
      await expect(enTransaccion(tx, async (t) => {
        await t`UPDATE tipos_documento SET orden = orden + 1000 WHERE sigla = 'FO'`;
        throw new ErrorTramite("falla");
      })).rejects.toThrow("falla");
      expect(await orden()).toBe(antes);
    });
    expect(await enTransaccion(sql, async (t) => "savepoint" in t)).toBe(true);
  });

  it("un fallo después del UPDATE no deja nada escrito, y la transacción sigue usable", () => revertida(sql, async (tx) => {
    const t = await enElaboracion(tx);
    const foto = async () => {
      const [fila] = await tx`SELECT etapa, ronda, vence_en, actualizado_en FROM tramites WHERE id = ${t.tramiteId}`;
      const [{ eventos }] = await tx`SELECT count(*)::int AS eventos FROM tramite_eventos WHERE tramite_id = ${t.tramiteId}`;
      const [{ auditoria }] = await tx`SELECT count(*)::int AS auditoria FROM auditoria WHERE entidad = 'tramite' AND entidad_id = ${t.tramiteId}`;
      const [{ avisos }] = await tx`SELECT count(*)::int AS avisos FROM notificaciones WHERE entidad = 'tramite' AND entidad_id = ${t.tramiteId}`;
      return { ...fila, eventos, auditoria, avisos };
    };
    await tx`UPDATE tramites SET version_id = NULL WHERE id = ${t.tramiteId}`;     // la huella falla después del UPDATE
    registrar("enviar_a_revision", async () => ({ avisos: [{ usuarioIds: [t.admin.usuarioId], tipo: "tramite.paso", titulo: "No debe salir" }] }));
    const antes = await foto();
    await expect(transicionar(t.lider, t.entrada, opc(tx, "2026-11-20T15:00:00Z"))).rejects.toThrow("Falta el archivo principal");
    expect(await foto()).toEqual(antes);
    // Un error SQL tampoco envenena la transacción de quien llama.
    registrar("enviar_a_revision", async ({ tx: interior }) => { await interior`SELECT 1 / 0`; });
    await expect(transicionar(t.lider, t.entrada, opc(tx))).rejects.toThrow(/division by zero/);
    expect(await foto()).toEqual(antes);
  }));

  it("el detalle de un manejador no pisa de, hacia ni ronda en la auditoría", () => revertida(sql, async (tx) => {
    const t = await enElaboracion(tx);
    registrar("enviar_a_revision", async () => ({ detalle: { de: "otra", hacia: "otra", ronda: 99, nota: "lista" } }));
    await transicionar(t.lider, t.entrada, opc(tx));
    const [a] = await tx`SELECT detalle FROM auditoria WHERE accion = 'tramite_enviar_a_revision' AND entidad_id = ${t.tramiteId}`;
    expect(a.detalle).toMatchObject({ de: "elaboracion", hacia: "revision", ronda: 1, nota: "lista" });
  }));
});
