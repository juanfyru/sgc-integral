/**
 * Aceptación de solicitudes contra la demo ya sembrada. Todo corre dentro de una transacción
 * que se revierte: no deja filas.
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

// Reales salvo en los casos de carrera, que sin concurrencia necesitan forzar un choque.
vi.mock("@/db/consultas/admin", async (original) => {
  const real = await original<typeof import("@/db/consultas/admin")>();
  return { ...real, crearVersionBorradorEn: vi.fn(real.crearVersionBorradorEn) };
});
vi.mock("@/db/consultas/codigos", async (original) => {
  const real = await original<typeof import("@/db/consultas/codigos")>();
  return { ...real, sugerirCodigo: vi.fn(real.sugerirCodigo) };
});

import type { TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { crearDocumentoEn, crearVersionBorradorEn } from "@/db/consultas/admin";
import { sugerirCodigo } from "@/db/consultas/codigos";
import { buscarParecidos } from "@/db/consultas/parecidos";
import { contextoDeAceptacion, datosParaAceptar } from "@/db/consultas/tramites";
import { MANEJADORES, crearSolicitud, transicionar } from "@/db/consultas/tramites-flujo";
import { aceptarCreacion, opc, sesionAdmin, sesionDe, solicitudDeCreacion, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const JUSTIFICACION = "Justificación de prueba.";

async function idDe(tx: TransactionSql, codigo: string): Promise<number> {
  const [d] = await tx`SELECT id FROM documentos WHERE codigo = ${codigo}`;
  return Number(d.id);
}

const avisosDe = (tx: TransactionSql, usuarioId: number, tramiteId: number) =>
  tx`SELECT tipo, titulo FROM notificaciones
    WHERE usuario_id = ${usuarioId} AND entidad = 'tramite' AND entidad_id = ${tramiteId} ORDER BY id`;

describe("aceptar una creación", () => {
  it("acepta una creación: código sugerido, documento, versión 1 y responsables", () => revertida(sql, async (tx) => {
    const { admin, gerente, liderCex, tramiteId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "FO", titulo: "Consentimiento informado de procedimientos menores" });
    const datos = await datosParaAceptar(tramiteId, { sql: tx });
    expect(datos.codigoSugerido).toBe("CEX-FO-01");                      // la demo no tiene formatos de CEX
    expect(datos.autoridad).toBe("operativo");
    const r = await transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
      datos: aceptarCreacion({ codigo: "CEX-FO-01", elaboradorId: liderCex.usuarioId, revisorId: admin.usuarioId, aprobadorId: admin.usuarioId }) }, opc(tx));
    expect(r).toEqual({ etapa: "elaboracion", ronda: 1 });
    const [t] = await tx`SELECT t.documento_id, v.numero, v.estado, d.codigo FROM tramites t
      JOIN documento_versiones v ON v.id = t.version_id JOIN documentos d ON d.id = t.documento_id WHERE t.id = ${tramiteId}`;
    expect(t).toMatchObject({ numero: 1, estado: "borrador", codigo: "CEX-FO-01" });
    const [e] = await tx`SELECT detalle FROM tramite_eventos WHERE tramite_id = ${tramiteId} AND tipo = 'aceptar'`;
    expect(e.detalle).toMatchObject({ decision: "nuevo", codigo: "CEX-FO-01" });
    expect(Array.isArray(e.detalle.parecidos)).toBe(true);               // evidencia del PC-02, aunque esté vacía
    void gerente;
  }));

  it("aplica la separación: quien elabora no revisa, y si elabora un Admin SGC aprueba Gerencia", () => revertida(sql, async (tx) => {
    const { admin, gerente, liderCex, tramiteId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "FO", titulo: "Formato de prueba de separación" });
    const intento = (d: Partial<Record<"elaboradorId" | "revisorId" | "aprobadorId", number>>) =>
      transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
        datos: aceptarCreacion({ codigo: "CEX-FO-01", elaboradorId: liderCex.usuarioId, revisorId: admin.usuarioId, aprobadorId: admin.usuarioId, ...d }) }, opc(tx));
    await expect(tx.savepoint(() => intento({ revisorId: liderCex.usuarioId }))).rejects.toThrow("Quien elabora no puede revisar");
    await expect(tx.savepoint(() => intento({ elaboradorId: admin.usuarioId, revisorId: liderCex.usuarioId }))).rejects.toThrow("Quien aprueba debe tener el rol Gerencia");
    expect(await intento({ elaboradorId: admin.usuarioId, revisorId: liderCex.usuarioId, aprobadorId: gerente.usuarioId })).toEqual({ etapa: "elaboracion", ronda: 1 });
  }));

  it("el evento guarda parecidos, clasificación, plantilla y responsables; el documento, lo elegido", () => revertida(sql, async (tx) => {
    const titulo = "Guía de Atención de Hipertensión Arterial";
    const { admin, liderCex, tramiteId, tipoDocumentoId, procesoId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "FO", titulo });
    const vistos = await buscarParecidos(titulo, { sql: tx });
    const [plantilla] = await tx`SELECT d.id, d.codigo, v.numero FROM documentos d
      JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente' WHERE d.codigo = 'SGC-FO-01'`;
    await tx`UPDATE tipos_documento SET plantilla_documento_id = ${plantilla.id} WHERE id = ${tipoDocumentoId}`;
    const [sub] = await tx`SELECT s.id, s.proceso_id FROM subprocesos s JOIN procesos p ON p.id = s.proceso_id WHERE p.sigla = 'GTH' ORDER BY s.orden LIMIT 1`;
    const [otroProceso] = await tx`SELECT id FROM procesos WHERE sigla = 'SGC'`;
    const relacionado = await idDe(tx, "SGC-PR-01");

    await transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
      datos: aceptarCreacion({
        codigo: "GTH-FO-77", titulo: "Título corregido al aceptar", descripcion: "Para qué sirve.", palabrasClave: "uno, dos",
        asociaciones: [{ subprocesoId: sub.id, esPrincipal: true }, { procesoId: otroProceso.id, esPrincipal: false }],
        relacionados: [relacionado], nivelAcceso: "restringido",
        elaboradorId: liderCex.usuarioId, revisorId: admin.usuarioId, aprobadorId: admin.usuarioId,
      }) }, opc(tx));

    const [t] = await tx`SELECT documento_id, proceso_id, subproceso_id, tipo_documento_id, elaborador_id, revisor_id, aprobador_id, vence_en FROM tramites WHERE id = ${tramiteId}`;
    expect(Number(t.proceso_id)).toBe(Number(sub.proceso_id));           // el trámite sigue al propietario elegido
    expect(Number(t.subproceso_id)).toBe(Number(sub.id));
    expect(Number(t.tipo_documento_id)).toBe(tipoDocumentoId);
    expect(Number(t.elaborador_id)).toBe(liderCex.usuarioId);
    expect(t.vence_en.toISOString()).toBe("2026-11-21T04:59:59.999Z");
    const [d] = await tx`SELECT titulo, descripcion, palabras_clave, nivel_acceso FROM documentos WHERE id = ${t.documento_id}`;
    expect({ ...d }).toEqual({ titulo: "Título corregido al aceptar", descripcion: "Para qué sirve.", palabras_clave: "uno, dos", nivel_acceso: "restringido" });
    const asociaciones = await tx`SELECT proceso_id, subproceso_id, es_principal FROM documento_proceso WHERE documento_id = ${t.documento_id} ORDER BY es_principal DESC`;
    expect(asociaciones.map((a) => [a.proceso_id, a.subproceso_id, a.es_principal])).toEqual([[null, sub.id, true], [otroProceso.id, null, false]]);
    const relaciones = await tx`SELECT relacionado_id FROM documento_relaciones WHERE documento_id = ${t.documento_id}`;
    expect(relaciones.map((r) => Number(r.relacionado_id))).toEqual([relacionado]);

    const [e] = await tx`SELECT detalle FROM tramite_eventos WHERE tramite_id = ${tramiteId} AND tipo = 'aceptar'`;
    expect(e.detalle).toMatchObject({
      decision: "nuevo",
      codigo: "GTH-FO-77",
      version: 1,
      plantilla: { codigo: "SGC-FO-01", version: plantilla.numero },
      clasificacion: {
        tipoDocumentoId,
        titulo: "Título corregido al aceptar",
        nivelAcceso: "restringido",
        relacionados: [relacionado],
        asociaciones: [{ subprocesoId: sub.id, esPrincipal: true }, { procesoId: otroProceso.id, esPrincipal: false }],
        solicitado: { procesoId, subprocesoId: null, tipoDocumentoId, titulo },   // lo corregido y lo anterior
      },
      responsables: {
        elaborador: { id: liderCex.usuarioId, nombre: liderCex.nombre },
        revisor: { id: admin.usuarioId, nombre: admin.nombre },
        aprobador: { id: admin.usuarioId, nombre: admin.nombre },
      },
    });
    expect(e.detalle.parecidos).toEqual(vistos);                         // la lista completa, con ids, versión y proceso
    expect(e.detalle.parecidos[0]).toMatchObject({ documentoId: await idDe(tx, "CEX-GU-01"), codigo: "CEX-GU-01", titulo, version: 1, procesoId, nivel: "muy_parecido" });
  }));

  it("si algo falla después de crear el documento, no queda ni documento ni versión", () => revertida(sql, async (tx) => {
    const { admin, liderCex, tramiteId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "FO", titulo: "Formato con un relacionado que no existe" });
    const [antes] = await tx`SELECT count(*) AS versiones FROM documento_versiones`;
    await expect(transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
      datos: aceptarCreacion({ codigo: "CEX-FO-01", relacionados: [999_999_999], elaboradorId: liderCex.usuarioId, revisorId: admin.usuarioId, aprobadorId: admin.usuarioId }) }, opc(tx)))
      .rejects.toThrow();
    const [despues] = await tx`SELECT count(*) AS versiones FROM documento_versiones`;
    expect(despues.versiones).toBe(antes.versiones);
    expect(await tx`SELECT 1 FROM documentos WHERE codigo = 'CEX-FO-01'`).toHaveLength(0);
    const [t] = await tx`SELECT etapa, documento_id FROM tramites WHERE id = ${tramiteId}`;
    expect({ ...t }).toEqual({ etapa: "aceptacion", documento_id: null });
  }));

  describe("el código ya se ocupó al aceptar", () => {
    async function ocuparCodigo(tx: TransactionSql, codigo: string, usuarioId: number, procesoId: number, tipoId: number) {
      await crearDocumentoEn(tx, { codigo, titulo: "Se adelantó otra aceptación", tipoId, descripcion: null, palabrasClave: null, asociaciones: [{ procesoId, esPrincipal: true }] }, usuarioId);
    }

    it("el sugerido toma el consecutivo siguiente, y el evento guarda el código final", () => revertida(sql, async (tx) => {
      const { admin, liderCex, tramiteId, procesoId, tipoDocumentoId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "FO", titulo: "Formato en carrera" });
      const { codigoSugerido } = await datosParaAceptar(tramiteId, { sql: tx });
      expect(codigoSugerido).toBe("CEX-FO-01");
      await ocuparCodigo(tx, "CEX-FO-01", admin.usuarioId, procesoId, tipoDocumentoId);
      await transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
        datos: aceptarCreacion({ codigo: "CEX-FO-01", codigoSugerido, elaboradorId: liderCex.usuarioId, revisorId: admin.usuarioId, aprobadorId: admin.usuarioId }) }, opc(tx));
      const [t] = await tx`SELECT d.codigo FROM tramites t JOIN documentos d ON d.id = t.documento_id WHERE t.id = ${tramiteId}`;
      expect(t.codigo).toBe("CEX-FO-02");
      const [e] = await tx`SELECT detalle FROM tramite_eventos WHERE tramite_id = ${tramiteId} AND tipo = 'aceptar'`;
      expect(e.detalle.codigo).toBe("CEX-FO-02");
    }));

    it("escrito a mano no se cambia: el error nombra el siguiente disponible y la transacción sigue usable", () => revertida(sql, async (tx) => {
      const { admin, liderCex, tramiteId, procesoId, tipoDocumentoId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "FO", titulo: "Formato escrito a mano" });
      await ocuparCodigo(tx, "CEX-FO-09", admin.usuarioId, procesoId, tipoDocumentoId);
      await expect(transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
        datos: aceptarCreacion({ codigo: "CEX-FO-09", codigoSugerido: "CEX-FO-10", elaboradorId: liderCex.usuarioId, revisorId: admin.usuarioId, aprobadorId: admin.usuarioId }) }, opc(tx)))
        .rejects.toThrow("Ese código ya existe. El siguiente disponible es CEX-FO-10");
      const [t] = await tx`SELECT etapa FROM tramites WHERE id = ${tramiteId}`;
      expect(t.etapa).toBe("aceptacion");
    }));

    it("sin formato no hay siguiente que nombrar", () => revertida(sql, async (tx) => {
      const { admin, liderCex, tramiteId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "FO", titulo: "Formato sin formato" });
      await tx`DELETE FROM configuracion WHERE clave = 'formato_codigo'`;
      await expect(transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
        datos: aceptarCreacion({ codigo: "GTH-PR-01", elaboradorId: liderCex.usuarioId, revisorId: admin.usuarioId, aprobadorId: admin.usuarioId }) }, opc(tx)))
        .rejects.toThrow(/^Ese código ya existe$/);
    }));

    it("reintenta hasta tres veces; después se rinde con el error", () => revertida(sql, async (tx) => {
      const { admin, liderCex, tramiteId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "FO", titulo: "Formato sin suerte" });
      const sugerir = vi.mocked(sugerirCodigo);
      sugerir.mockClear();
      sugerir.mockResolvedValue("GTH-PR-01");                            // siempre uno ocupado
      try {
        await expect(transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
          datos: aceptarCreacion({ codigo: "GTH-PR-02", codigoSugerido: "GTH-PR-02", elaboradorId: liderCex.usuarioId, revisorId: admin.usuarioId, aprobadorId: admin.usuarioId }) }, opc(tx)))
          .rejects.toThrow("Ese código ya existe. El siguiente disponible es GTH-PR-01");
        expect(sugerir).toHaveBeenCalledTimes(4);                        // el intento inicial y tres más
      } finally {
        sugerir.mockReset();
      }
    }));
  });

  it("el tipo elegido al aceptar manda: su autoridad decide quién aprueba, y el trámite y el documento lo siguen", () => revertida(sql, async (tx) => {
    const { admin, gerente, liderCex, tramiteId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "FO", titulo: "Lo pidieron como formato" });
    const [ca] = await tx`SELECT id FROM tipos_documento WHERE sigla = 'CA'`;              // estratégico; FO es operativo
    const aceptar = (aprobadorId: number) => transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
      datos: aceptarCreacion({ tipoDocumentoId: ca.id, codigo: "CEX-CA-77", elaboradorId: liderCex.usuarioId, revisorId: admin.usuarioId, aprobadorId }) }, opc(tx));
    await expect(tx.savepoint(() => aceptar(admin.usuarioId))).rejects.toThrow("Quien aprueba debe tener el rol Gerencia");
    await aceptar(gerente.usuarioId);
    const [t] = await tx`SELECT t.tipo_documento_id, d.tipo_id FROM tramites t JOIN documentos d ON d.id = t.documento_id WHERE t.id = ${tramiteId}`;
    expect(Number(t.tipo_documento_id)).toBe(Number(ca.id));
    expect(Number(t.tipo_id)).toBe(Number(ca.id));
  }));

  it("el código debe cumplir el formato y no estar usado, tampoco por un documento de otro proceso", () => revertida(sql, async (tx) => {
    const { admin, liderCex, tramiteId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "FO", titulo: "Formato con código" });
    const intento = (codigo: string) => transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
      datos: aceptarCreacion({ codigo, elaboradorId: liderCex.usuarioId, revisorId: admin.usuarioId, aprobadorId: admin.usuarioId }) }, opc(tx));
    await expect(tx.savepoint(() => intento("CEX-01"))).rejects.toThrow("El código no cumple el formato configurado (ej. CEX-FO-01)");
    await expect(tx.savepoint(() => intento("GTH-PR-01"))).rejects.toThrow("Ese código ya existe");
    await expect(intento("CEX-FO-01")).resolves.toEqual({ etapa: "elaboracion", ronda: 1 });
  }));

  it("la fecha límite es de hoy en adelante, en la zona de la instalación", () => revertida(sql, async (tx) => {
    const { admin, liderCex, tramiteId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "FO", titulo: "Formato con fecha" });
    const intento = (venceElaboracion: string, ahora: string) => transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
      datos: aceptarCreacion({ codigo: "CEX-FO-01", venceElaboracion, elaboradorId: liderCex.usuarioId, revisorId: admin.usuarioId, aprobadorId: admin.usuarioId }) }, opc(tx, ahora));
    // Las 03:00 UTC del 6 son las 22:00 del 5 en Bogotá: hoy todavía es el 5.
    await expect(tx.savepoint(() => intento("2026-11-04", "2026-11-06T03:00:00Z"))).rejects.toThrow("La fecha límite de elaboración no puede ser anterior a hoy");
    await expect(intento("2026-11-05", "2026-11-06T03:00:00Z")).resolves.toEqual({ etapa: "elaboracion", ronda: 1 });
    const [t] = await tx`SELECT vence_en FROM tramites WHERE id = ${tramiteId}`;
    expect(t.vence_en.toISOString()).toBe("2026-11-06T04:59:59.999Z");
  }));

  it("un tipo inactivo, un proceso inactivo y un usuario que no existe dan un error de negocio", () => revertida(sql, async (tx) => {
    const { admin, liderCex, tramiteId, tipoDocumentoId, procesoId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "FO", titulo: "Formato con datos viejos" });
    const intento = (d: Record<string, unknown>) => transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
      datos: aceptarCreacion({ codigo: "CEX-FO-01", elaboradorId: liderCex.usuarioId, revisorId: admin.usuarioId, aprobadorId: admin.usuarioId, ...d }) }, opc(tx));
    await expect(tx.savepoint(() => intento({ elaboradorId: 999_999_999 }))).rejects.toThrow("Falta designar quién elabora");
    await expect(tx.savepoint(() => intento({ revisorId: 999_999_999 }))).rejects.toThrow("Falta designar quién revisa");
    await expect(tx.savepoint(() => intento({ aprobadorId: 999_999_999 }))).rejects.toThrow("Falta designar quién aprueba");
    await tx`UPDATE procesos SET activo = false WHERE id = ${procesoId}`;
    await expect(tx.savepoint(() => intento({}))).rejects.toThrow("El proceso propietario no existe o está inactivo");
    await tx`UPDATE procesos SET activo = true WHERE id = ${procesoId}`;
    await tx`UPDATE tipos_documento SET activo = false WHERE id = ${tipoDocumentoId}`;
    await expect(tx.savepoint(() => intento({}))).rejects.toThrow("El tipo de documento no existe o está inactivo");
  }));

  it("un solicitante desactivado no impide aceptar", () => revertida(sql, async (tx) => {
    const { admin, liderCex, tramiteId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "FO", titulo: "Formato sin su solicitante" });
    await tx`UPDATE usuarios SET activo = false WHERE id = ${liderCex.usuarioId}`;
    const otroLider = await sesionDe(tx, "lider.gth");
    await expect(transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
      datos: aceptarCreacion({ codigo: "CEX-FO-01", elaboradorId: otroLider.usuarioId, revisorId: admin.usuarioId, aprobadorId: admin.usuarioId }) }, opc(tx)))
      .resolves.toEqual({ etapa: "elaboracion", ronda: 1 });
  }));

  it("el aviso accionable gana: el elaborador sabe que le toca, también si fue quien pidió", () => revertida(sql, async (tx) => {
    const { admin, liderCex, tramiteId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "FO", titulo: "Formato con avisos" });
    const otro = await sesionDe(tx, "lider.gth");
    await transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
      datos: aceptarCreacion({ codigo: "CEX-FO-01", elaboradorId: otro.usuarioId, revisorId: admin.usuarioId, aprobadorId: admin.usuarioId }) }, opc(tx));
    expect((await avisosDe(tx, otro.usuarioId, tramiteId)).map((a) => a.tipo)).toEqual(["tramite.paso"]);
    expect((await avisosDe(tx, liderCex.usuarioId, tramiteId)).map((a) => a.tipo)).toEqual(["tramite.resuelto"]);

    const b = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "FO", titulo: "Formato que elabora quien pide" });
    await transicionar(admin, { tramiteId: b.tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
      datos: aceptarCreacion({ codigo: "CEX-FO-02", elaboradorId: liderCex.usuarioId, revisorId: admin.usuarioId, aprobadorId: admin.usuarioId }) }, opc(tx));
    const avisos = await avisosDe(tx, liderCex.usuarioId, b.tramiteId);
    expect(avisos.map((a) => a.tipo)).toEqual(["tramite.paso"]);
    expect(avisos[0].titulo).toMatch(/aceptada: le toca elaborar/);
  }));
});

describe("una creación duplicada", () => {
  it("una creación duplicada pasa a modificación solo dentro del mismo proceso", () => revertida(sql, async (tx) => {
    const { admin, liderCex, tramiteId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "GU", titulo: "Guía de Atención de Hipertensión Arterial" });
    const parecidos = await buscarParecidos("Guía de Atención de Hipertensión Arterial", { sql: tx });
    expect(parecidos[0]).toMatchObject({ codigo: "CEX-GU-01", nivel: "muy_parecido" });
    const [otro] = await tx`SELECT id FROM documentos WHERE codigo = 'GTH-PR-01'`;
    const base = { elaboradorId: liderCex.usuarioId, revisorId: admin.usuarioId, aprobadorId: admin.usuarioId };
    const convertir = (documentoExistenteId: number) => transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
      datos: aceptarCreacion({ ...base, decision: "modificacion", documentoExistenteId, codigo: "CEX-GU-02" }) }, opc(tx));
    await expect(tx.savepoint(() => convertir(otro.id))).rejects.toThrow(/otro proceso/);
    await convertir(parecidos[0].documentoId);
    const [t] = await tx`SELECT t.tipo, v.numero FROM tramites t JOIN documento_versiones v ON v.id = t.version_id WHERE t.id = ${tramiteId}`;
    expect(t).toMatchObject({ tipo: "modificar", numero: 2 });
  }));

  it("queda como una modificación común y el evento conserva lo que se pidió y lo que se vio", () => revertida(sql, async (tx) => {
    const titulo = "Guía de Atención de Hipertensión Arterial";
    const { admin, liderCex, tramiteId, tipoDocumentoId, procesoId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "GU", titulo });
    const documentoExistenteId = await idDe(tx, "CEX-GU-01");
    await transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
      datos: aceptarCreacion({ decision: "modificacion", documentoExistenteId, elaboradorId: liderCex.usuarioId, revisorId: admin.usuarioId, aprobadorId: admin.usuarioId }) }, opc(tx));
    const [t] = await tx`SELECT titulo_propuesto, documento_id, tipo_documento_id, subproceso_id, vence_en FROM tramites WHERE id = ${tramiteId}`;
    const [propio] = await tx`SELECT subproceso_id FROM documento_proceso WHERE documento_id = ${documentoExistenteId} AND es_principal`;
    expect(t.titulo_propuesto).toBeNull();                               // si no, se mostraría como título nuevo
    expect(t.tipo_documento_id).toBeNull();
    expect(t.subproceso_id).toBe(propio.subproceso_id);
    expect(t.vence_en.toISOString()).toBe("2026-11-21T04:59:59.999Z");
    const [e] = await tx`SELECT detalle FROM tramite_eventos WHERE tramite_id = ${tramiteId} AND tipo = 'aceptar'`;
    expect(e.detalle).toMatchObject({ decision: "modificacion", codigo: "CEX-GU-01", version: 2, clasificacion: { solicitado: { procesoId, subprocesoId: null, tipoDocumentoId, titulo } } });
    expect(e.detalle.parecidos[0]).toMatchObject({ documentoId: documentoExistenteId, codigo: "CEX-GU-01", titulo, version: 1, procesoId, nivel: "muy_parecido" });
  }));

  it("usa la autoridad del tipo del documento existente, no la del tipo pedido", () => revertida(sql, async (tx) => {
    const { admin, gerente, liderCex, tramiteId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "FO", titulo: "Caracterización Consulta Externa" });
    const documentoExistenteId = await idDe(tx, "CEX-CA-01");            // CA es estratégico
    const convertir = (aprobadorId: number) => transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
      datos: aceptarCreacion({ decision: "modificacion", documentoExistenteId, elaboradorId: liderCex.usuarioId, revisorId: admin.usuarioId, aprobadorId }) }, opc(tx));
    await expect(tx.savepoint(() => convertir(admin.usuarioId))).rejects.toThrow("Quien aprueba debe tener el rol Gerencia");
    await expect(convertir(gerente.usuarioId)).resolves.toEqual({ etapa: "elaboracion", ronda: 1 });
  }));

  it("no se convierte si el documento ya tiene otro trámite abierto", () => revertida(sql, async (tx) => {
    const { admin, liderCex, tramiteId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "GU", titulo: "Guía de Atención de Hipertensión Arterial" });
    const documentoExistenteId = await idDe(tx, "CEX-GU-01");
    await crearSolicitud(liderCex, { tipo: "modificar", motivo: "mejora", justificacion: JUSTIFICACION, documentoId: documentoExistenteId }, opc(tx));
    await expect(transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
      datos: aceptarCreacion({ decision: "modificacion", documentoExistenteId, elaboradorId: liderCex.usuarioId, revisorId: admin.usuarioId, aprobadorId: admin.usuarioId }) }, opc(tx)))
      .rejects.toThrow("Ya hay un trámite abierto sobre este documento");
  }));

  it("dos conversiones a la vez: el choque del número de versión sale como trámite abierto", () => revertida(sql, async (tx) => {
    const { admin, liderCex, tramiteId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "GU", titulo: "Guía con dos conversiones" });
    const documentoExistenteId = await idDe(tx, "CEX-GU-01");            // v1 vigente
    // La otra conversión se adelantó: sin concurrencia, el núcleo inserta un número ya ocupado.
    vi.mocked(crearVersionBorradorEn).mockImplementationOnce(async (t, documentoId) => {
      await t`INSERT INTO documento_versiones (documento_id, numero, estado) VALUES (${documentoId}, 1, 'borrador')`;
      return { versionId: 0, numero: 1 };
    });
    await expect(transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
      datos: aceptarCreacion({ decision: "modificacion", documentoExistenteId, elaboradorId: liderCex.usuarioId, revisorId: admin.usuarioId, aprobadorId: admin.usuarioId }) }, opc(tx)))
      .rejects.toThrow("Ya hay un trámite abierto sobre este documento");
    const [t] = await tx`SELECT etapa FROM tramites WHERE id = ${tramiteId}`;
    expect(t.etapa).toBe("aceptacion");
  }));

  it("si aun así choca con tramites_uno_abierto_idx, sale el error de negocio y la transacción sigue viva", () => revertida(sql, async (tx) => {
    const { admin, liderCex, tramiteId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "GU", titulo: "Guía con carrera" });
    const documentoId = await idDe(tx, "CEX-GU-01");
    await crearSolicitud(liderCex, { tipo: "modificar", motivo: "mejora", justificacion: JUSTIFICACION, documentoId }, opc(tx));
    // Sin concurrencia, la única forma de llegar al UPDATE es un manejador que no precomprueba.
    const real = MANEJADORES.aceptar;
    MANEJADORES.aceptar = async () => ({ cambios: { tipo: "modificar", documentoId } });
    try {
      await expect(transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0 }, opc(tx)))
        .rejects.toThrow("Ya hay un trámite abierto sobre este documento");
    } finally {
      MANEJADORES.aceptar = real;
    }
    const [t] = await tx`SELECT etapa FROM tramites WHERE id = ${tramiteId}`;
    expect(t.etapa).toBe("aceptacion");
  }));
});

describe("aceptar una modificación", () => {
  it("una modificación abre la versión siguiente, con el plazo elegido y el aprobador de su autoridad", () => revertida(sql, async (tx) => {
    const admin = await sesionAdmin(tx);
    const lider = await sesionDe(tx, "lider.gth");
    const [doc] = await tx`SELECT id FROM documentos WHERE codigo = 'GTH-CA-01'`;          // v1 obsoleta, v2 vigente
    const m = await crearSolicitud(lider, { tipo: "modificar", motivo: "mejora", justificacion: "Se actualiza el alcance.", documentoId: doc.id }, opc(tx));
    const gerente = await sesionDe(tx, "gerente");
    await transicionar(admin, { tramiteId: m.tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
      datos: { elaboradorId: lider.usuarioId, revisorId: admin.usuarioId, aprobadorId: gerente.usuarioId, venceElaboracion: "2026-11-20" } }, opc(tx));
    const [v] = await tx`SELECT v.numero, t.vence_en FROM tramites t JOIN documento_versiones v ON v.id = t.version_id WHERE t.id = ${m.tramiteId}`;
    expect(v.numero).toBe(3);                                                              // CA es estratégico: aprueba Gerencia
    expect(v.vence_en.toISOString()).toBe("2026-11-21T04:59:59.999Z");
  }));

  const aceptarModificacion = async (tx: TransactionSql, codigo: string, tituloNuevo?: string) => {
    const admin = await sesionAdmin(tx);
    const lider = await sesionDe(tx, "lider.gth");
    const documentoId = await idDe(tx, codigo);
    const m = await crearSolicitud(lider, { tipo: "modificar", motivo: "mejora", justificacion: JUSTIFICACION, documentoId }, opc(tx));
    await transicionar(admin, { tramiteId: m.tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
      datos: { tituloNuevo, elaboradorId: lider.usuarioId, revisorId: admin.usuarioId, aprobadorId: admin.usuarioId, venceElaboracion: "2026-11-20" } }, opc(tx));
    return m.tramiteId;
  };

  it("guarda el título nuevo en el trámite solo si cambia, y el documento no lo ve hasta publicar", () => revertida(sql, async (tx) => {
    const [antes] = await tx`SELECT titulo FROM documentos WHERE codigo = 'GTH-PR-01'`;
    const sinCambio = await aceptarModificacion(tx, "GTH-PR-01", antes.titulo);
    const [a] = await tx`SELECT titulo_propuesto FROM tramites WHERE id = ${sinCambio}`;
    expect(a.titulo_propuesto).toBeNull();

    const conCambio = await aceptarModificacion(tx, "GTH-PR-02", "Título nuevo del procedimiento");
    const [b] = await tx`SELECT t.titulo_propuesto, d.titulo FROM tramites t JOIN documentos d ON d.id = t.documento_id WHERE t.id = ${conCambio}`;
    expect(b.titulo_propuesto).toBe("Título nuevo del procedimiento");
    expect(b.titulo).not.toBe("Título nuevo del procedimiento");
    const [e] = await tx`SELECT detalle FROM tramite_eventos WHERE tramite_id = ${conCambio} AND tipo = 'aceptar'`;
    expect(e.detalle).toMatchObject({ tituloNuevo: "Título nuevo del procedimiento", codigo: "GTH-PR-02" });
    expect(e.detalle).not.toHaveProperty("parecidos");
  }));

  it("no acepta si el documento tiene un borrador de carga pendiente", () => revertida(sql, async (tx) => {
    const documentoId = await idDe(tx, "GTH-PR-01");
    await tx`INSERT INTO documento_versiones (documento_id, numero, estado) VALUES (${documentoId}, 9, 'borrador')`;
    await expect(aceptarModificacion(tx, "GTH-PR-01")).rejects.toThrow("El documento tiene un borrador de carga pendiente: descártelo");
  }));

  it("un documento heredado con una versión anulada sale por aquí: la modificación abre la siguiente", () => revertida(sql, async (tx) => {
    const documentoId = await idDe(tx, "GTH-PR-01");
    await tx`INSERT INTO documento_versiones (documento_id, numero, estado) VALUES (${documentoId}, 90, 'anulado')`;
    const tramiteId = await aceptarModificacion(tx, "GTH-PR-01");
    const [v] = await tx`SELECT v.numero, v.estado FROM tramites t JOIN documento_versiones v ON v.id = t.version_id WHERE t.id = ${tramiteId}`;
    expect({ ...v }).toEqual({ numero: 91, estado: "borrador" });
  }));

  it("no acepta si el documento perdió su versión vigente", () => revertida(sql, async (tx) => {
    const admin = await sesionAdmin(tx);
    const lider = await sesionDe(tx, "lider.gth");
    const documentoId = await idDe(tx, "GTH-PR-01");
    const m = await crearSolicitud(lider, { tipo: "modificar", motivo: "mejora", justificacion: JUSTIFICACION, documentoId }, opc(tx));
    await tx`UPDATE documento_versiones SET estado = 'anulado' WHERE documento_id = ${documentoId} AND estado = 'vigente'`;
    await expect(transicionar(admin, { tramiteId: m.tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
      datos: { elaboradorId: lider.usuarioId, revisorId: admin.usuarioId, aprobadorId: admin.usuarioId, venceElaboracion: "2026-11-20" } }, opc(tx)))
      .rejects.toThrow("El documento ya no tiene versión vigente");
  }));

  it("el número siguiente ignora las versiones descartadas", () => revertida(sql, async (tx) => {
    const usuario = await sesionAdmin(tx);
    const documentoId = await idDe(tx, "GTH-CA-01");                     // v2 vigente
    await tx`INSERT INTO documento_versiones (documento_id, numero, estado) VALUES (${documentoId}, 3, 'descartado')`;
    expect(await crearVersionBorradorEn(tx, documentoId, usuario.usuarioId)).toMatchObject({ numero: 3 });
  }));
});

describe("aceptar una eliminación", () => {
  async function bajaDe(tx: TransactionSql, codigo: string) {
    const admin = await sesionAdmin(tx);
    const otroAdmin = await sesionAdmin(tx);
    const gerente = await sesionDe(tx, "gerente");
    const [doc] = await tx`SELECT d.id, v.id AS version_id FROM documentos d
      JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente' WHERE d.codigo = ${codigo}`;
    const { tramiteId, etapa } = await crearSolicitud(admin, { tipo: "eliminar", motivo: "mejora", justificacion: JUSTIFICACION, documentoId: doc.id }, opc(tx));
    const aceptar = (aprobadorId: number) => transicionar(otroAdmin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0, datos: { aprobadorId } }, opc(tx));
    return { admin, otroAdmin, gerente, doc, tramiteId, etapa, aceptar };
  }

  it("pasa a aprobación con la versión vigente, y con el solicitante admin_sgc exige Gerencia", () => revertida(sql, async (tx) => {
    const { otroAdmin, gerente, doc, tramiteId, etapa, aceptar } = await bajaDe(tx, "SGC-PR-01");
    expect(etapa).toBe("aceptacion");                                    // SGC no tiene líder
    await expect(tx.savepoint(() => aceptar(otroAdmin.usuarioId))).rejects.toThrow("Quien aprueba debe tener el rol Gerencia");
    expect(await aceptar(gerente.usuarioId)).toEqual({ etapa: "aprobacion", ronda: 0 });
    const [t] = await tx`SELECT version_id, aprobador_id, elaborador_id, revisor_id, vence_en FROM tramites WHERE id = ${tramiteId}`;
    expect(t.version_id).toBe(doc.version_id);
    expect(Number(t.aprobador_id)).toBe(gerente.usuarioId);
    expect(t.elaborador_id).toBeNull();
    expect(t.revisor_id).toBeNull();
    expect(t.vence_en.toISOString()).toBe("2026-11-11T04:59:59.999Z");   // aprobación: 5 días
    expect((await avisosDe(tx, gerente.usuarioId, tramiteId)).map((a) => a.tipo)).toEqual(["tramite.paso"]);
  }));

  it("no acepta si el documento tiene un borrador de carga pendiente (spec 13A §13.3)", () => revertida(sql, async (tx) => {
    const { gerente, doc, aceptar } = await bajaDe(tx, "SGC-PR-01");
    await tx`INSERT INTO documento_versiones (documento_id, numero, estado) VALUES (${doc.id}, 90, 'borrador')`;
    await expect(aceptar(gerente.usuarioId)).rejects.toThrow("El documento tiene un borrador de carga pendiente: descártelo");
  }));

  it("avisa también a quien pidió, y el evento guarda la versión y el aprobador", () => revertida(sql, async (tx) => {
    const { admin, gerente, tramiteId, aceptar } = await bajaDe(tx, "SGC-PR-01");
    await aceptar(gerente.usuarioId);
    expect((await avisosDe(tx, admin.usuarioId, tramiteId)).map((a) => a.tipo)).toContain("tramite.resuelto");
    const [e] = await tx`SELECT detalle FROM tramite_eventos WHERE tramite_id = ${tramiteId} AND tipo = 'aceptar'`;
    expect(e.detalle).toMatchObject({ codigo: "SGC-PR-01", responsables: { aprobador: { id: gerente.usuarioId, nombre: gerente.nombre } } });
    expect(e.detalle.version).toEqual(expect.any(Number));
  }));
});

describe("rechazar", () => {
  it("cierra con el motivo y avisa a quien pidió", () => revertida(sql, async (tx) => {
    const { admin, liderCex, tramiteId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "FO", titulo: "Formato que no procede" });
    const rechazar = (datos: Record<string, unknown>) => transicionar(admin, { tramiteId, accion: "rechazar", etapaEsperada: "aceptacion", rondaEsperada: 0, datos }, opc(tx));
    await expect(tx.savepoint(() => rechazar({ motivo: "   " }))).rejects.toThrow("Escriba el motivo");
    expect(await rechazar({ motivo: "Ya existe CEX-FO-02 en otro proceso." })).toEqual({ etapa: "rechazado", ronda: 0 });
    const [t] = await tx`SELECT motivo_cierre, cerrado_en, vence_en FROM tramites WHERE id = ${tramiteId}`;
    expect(t.motivo_cierre).toBe("Ya existe CEX-FO-02 en otro proceso.");
    expect(t.cerrado_en).not.toBeNull();
    expect(t.vence_en).toBeNull();
    const avisos = await avisosDe(tx, liderCex.usuarioId, tramiteId);
    expect(avisos.map((a) => a.tipo)).toEqual(["tramite.resuelto"]);
    expect(avisos[0].titulo).toMatch(/rechazada/);
    const [e] = await tx`SELECT detalle FROM tramite_eventos WHERE tramite_id = ${tramiteId} AND tipo = 'rechazar'`;
    expect(e.detalle).toEqual({ motivo: "Ya existe CEX-FO-02 en otro proceso." });
  }));

  it("quien no gestiona no rechaza", () => revertida(sql, async (tx) => {
    const { liderCex, tramiteId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "FO", titulo: "Formato sin permiso" });
    await expect(transicionar(liderCex, { tramiteId, accion: "rechazar", etapaEsperada: "aceptacion", rondaEsperada: 0, datos: { motivo: "No procede." } }, opc(tx)))
      .rejects.toThrow("Sin permiso para esta acción");
  }));
});

describe("buscarParecidos", () => {
  it("ignora tildes y mayúsculas, y da el proceso propietario", () => revertida(sql, async (tx) => {
    const [p] = await buscarParecidos("GUIA DE ATENCION DE HIPERTENSION ARTERIAL", { sql: tx });
    expect(p).toMatchObject({ codigo: "CEX-GU-01", titulo: "Guía de Atención de Hipertensión Arterial", version: 1, nivel: "muy_parecido" });
    const [c] = await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`;
    expect(p.procesoId).toBe(Number(c.id));                              // aunque el documento cuelgue de un subproceso
  }));

  it("también compara con las palabras clave: el título no se parece, pero ellas sí", () => revertida(sql, async (tx) => {
    const [titulo] = await tx`SELECT similarity(lower(unaccent(titulo)), 'reporte de eventos adversos') AS s FROM documentos WHERE codigo = 'SOG-PO-01'`;
    expect(titulo.s).toBeLessThan(0.3);                                  // por el título no saldría
    const [muy] = await buscarParecidos("Reporte de eventos adversos", { sql: tx });
    expect(muy).toMatchObject({ codigo: "SOG-PO-01", nivel: "muy_parecido" });
    const [parecido] = await buscarParecidos("Control de la cadena de frío", { sql: tx });
    expect(parecido).toMatchObject({ codigo: "PYM-PR-01", nivel: "parecido" });   // con tildes en lo buscado
  }));

  async function vigente(tx: TransactionSql, codigo: string, titulo: string) {
    const admin = await sesionAdmin(tx);
    const [p] = await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`;
    const [t] = await tx`SELECT id FROM tipos_documento WHERE sigla = 'FO'`;
    const { versionId } = await crearDocumentoEn(tx, { codigo, titulo, tipoId: t.id, descripcion: null, palabrasClave: null, asociaciones: [{ procesoId: p.id, esPrincipal: true }] }, admin.usuarioId);
    await tx`UPDATE documento_versiones SET estado = 'vigente', aprobo = 'x', fecha_aprobacion = '2026-01-01' WHERE id = ${versionId}`;
  }

  it("las tildes de lo que se busca tampoco cuentan", () => revertida(sql, async (tx) => {
    await vigente(tx, "CEX-FO-90", "Opalo indigo ambar");
    const [p] = await buscarParecidos("Ópalo índigo ámbar", { sql: tx });
    expect(p).toMatchObject({ codigo: "CEX-FO-90", nivel: "muy_parecido" });
  }));

  it("en las palabras clave tampoco cuentan las tildes, ni en lo buscado ni en lo guardado", () => revertida(sql, async (tx) => {
    await vigente(tx, "CEX-FO-90", "Formato distinto");
    await tx`UPDATE documentos SET palabras_clave = 'opalo indigo ambar' WHERE codigo = 'CEX-FO-90'`;
    expect((await buscarParecidos("Ópalo índigo ámbar", { sql: tx }))[0]).toMatchObject({ codigo: "CEX-FO-90", nivel: "muy_parecido" });
    await tx`UPDATE documentos SET palabras_clave = 'ópalo índigo ámbar' WHERE codigo = 'CEX-FO-90'`;
    expect((await buscarParecidos("Opalo indigo ambar", { sql: tx }))[0]).toMatchObject({ codigo: "CEX-FO-90", nivel: "muy_parecido" });
  }));

  it("por debajo de 0,3 no es parecido", () => revertida(sql, async (tx) => {
    await vigente(tx, "CEX-FO-90", "Limpieza");                          // similitud 0,19 con el título buscado
    const lista = await buscarParecidos("Registro de limpieza general del área quirúrgica", { sql: tx });
    expect(lista.map((l) => l.codigo)).not.toContain("CEX-FO-90");
  }));

  it("da hasta cinco, del más parecido al menos, con los dos niveles", () => revertida(sql, async (tx) => {
    const admin = await sesionAdmin(tx);
    const [p] = await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`;
    const [t] = await tx`SELECT id FROM tipos_documento WHERE sigla = 'FO'`;
    const titulos = [
      "Registro de limpieza general del área quirúrgica",
      "Registro de limpieza general del área",
      "Registro de limpieza general",
      "Registro de limpieza",
      "Limpieza quirúrgica",
      "Registro limpieza de ambulancias y equipos",
    ];
    for (const [i, titulo] of titulos.entries()) {
      const { versionId } = await crearDocumentoEn(tx, { codigo: `CEX-FO-9${i}`, titulo, tipoId: t.id, descripcion: null, palabrasClave: null, asociaciones: [{ procesoId: p.id, esPrincipal: true }] }, admin.usuarioId);
      await tx`UPDATE documento_versiones SET estado = 'vigente', aprobo = 'x', fecha_aprobacion = '2026-01-01' WHERE id = ${versionId}`;
    }
    const lista = await buscarParecidos("Registro de limpieza general del área quirúrgica", { sql: tx });
    expect(lista).toHaveLength(5);
    // Similitudes de 1, 0,77, 0,62, 0,45 y 0,43: la frontera de «muy parecido» es 0,6.
    expect(lista.map((l) => [l.codigo, l.nivel])).toEqual([
      ["CEX-FO-90", "muy_parecido"],
      ["CEX-FO-91", "muy_parecido"],
      ["CEX-FO-92", "muy_parecido"],
      ["CEX-FO-93", "parecido"],
      ["CEX-FO-94", "parecido"],
    ]);                                                                  // lo menos parecido queda fuera del tope
  }));

  it("solo cuenta los documentos con versión vigente, y nada parecido da una lista vacía", () => revertida(sql, async (tx) => {
    const admin = await sesionAdmin(tx);
    const [p] = await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`;
    const [t] = await tx`SELECT id FROM tipos_documento WHERE sigla = 'FO'`;
    await crearDocumentoEn(tx, { codigo: "CEX-FO-90", titulo: "Solo un borrador de consentimiento", tipoId: t.id, descripcion: null, palabrasClave: null, asociaciones: [{ procesoId: p.id, esPrincipal: true }] }, admin.usuarioId);
    expect(await buscarParecidos("Solo un borrador de consentimiento", { sql: tx })).toEqual([]);
    expect(await buscarParecidos("zzzz qqqq xxxx", { sql: tx })).toEqual([]);
  }));
});

describe("sugerirCodigo", () => {
  const procesoYTipo = async (tx: TransactionSql) => {
    const [p] = await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`;
    const [t] = await tx`SELECT id FROM tipos_documento WHERE sigla = 'FO'`;
    return { procesoId: Number(p.id), tipoDocumentoId: Number(t.id) };
  };

  it("cuenta todos los documentos, también los que nunca se publicaron", () => revertida(sql, async (tx) => {
    const admin = await sesionAdmin(tx);
    const p = await procesoYTipo(tx);
    expect(await sugerirCodigo(p, { sql: tx })).toBe("CEX-FO-01");
    await crearDocumentoEn(tx, { codigo: "CEX-FO-07", titulo: "Solo borrador", tipoId: p.tipoDocumentoId, descripcion: null, palabrasClave: null, asociaciones: [{ procesoId: p.procesoId, esPrincipal: true }] }, admin.usuarioId);
    expect(await sugerirCodigo(p, { sql: tx })).toBe("CEX-FO-08");
  }));

  it("sin formato válido no sugiere", () => revertida(sql, async (tx) => {
    const p = await procesoYTipo(tx);
    await tx`UPDATE configuracion SET valor = 'sin marcadores' WHERE clave = 'formato_codigo'`;
    expect(await sugerirCodigo(p, { sql: tx })).toBeNull();
    await tx`DELETE FROM configuracion WHERE clave = 'formato_codigo'`;
    expect(await sugerirCodigo(p, { sql: tx })).toBeNull();
  }));

  it("sin proceso o tipo conocidos no sugiere", () => revertida(sql, async (tx) => {
    const p = await procesoYTipo(tx);
    expect(await sugerirCodigo({ ...p, procesoId: 999_999_999 }, { sql: tx })).toBeNull();
    expect(await sugerirCodigo({ ...p, tipoDocumentoId: 999_999_999 }, { sql: tx })).toBeNull();
  }));
});

describe("crearDocumentoEn", () => {
  it("lleva el nivel de acceso, el número inicial y los relacionados", () => revertida(sql, async (tx) => {
    const admin = await sesionAdmin(tx);
    const [p] = await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`;
    const [t] = await tx`SELECT id FROM tipos_documento WHERE sigla = 'FO'`;
    const relacionado = await idDe(tx, "SGC-PR-01");
    const { documentoId, versionId } = await crearDocumentoEn(tx, {
      codigo: "CEX-FO-90", titulo: "Con todo", tipoId: t.id, descripcion: null, palabrasClave: null,
      asociaciones: [{ procesoId: p.id, esPrincipal: true }],
      nivelAcceso: "restringido", numeroInicial: 4, relacionados: [relacionado, relacionado],
    }, admin.usuarioId);
    expect(documentoId).toEqual(expect.any(Number));
    const [d] = await tx`SELECT nivel_acceso FROM documentos WHERE id = ${documentoId}`;
    expect(d.nivel_acceso).toBe("restringido");
    const [v] = await tx`SELECT numero, estado FROM documento_versiones WHERE id = ${versionId}`;
    expect({ ...v }).toEqual({ numero: 4, estado: "borrador" });
    const relaciones = await tx`SELECT relacionado_id FROM documento_relaciones WHERE documento_id = ${documentoId}`;
    expect(relaciones.map((r) => Number(r.relacionado_id))).toEqual([relacionado]);
  }));
});

describe("datos para la pantalla", () => {
  it("en una modificación da la autoridad del documento, sin parecidos ni código", () => revertida(sql, async (tx) => {
    const lider = await sesionDe(tx, "lider.gth");
    const documentoId = await idDe(tx, "GTH-CA-01");
    const { tramiteId } = await crearSolicitud(lider, { tipo: "modificar", motivo: "mejora", justificacion: JUSTIFICACION, documentoId }, opc(tx));
    const datos = await datosParaAceptar(tramiteId, { sql: tx });
    expect(datos).toMatchObject({ parecidos: [], codigoSugerido: null, plantilla: null, autoridad: "estrategico" });
    expect(datos.usuarios.map((u) => u.id)).toContain(lider.usuarioId);
  }));

  it("usuarios son solo los activos, con su rol y cargo", () => revertida(sql, async (tx) => {
    const { tramiteId, liderCex } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "FO", titulo: "Formato para ver usuarios" });
    const inactivo = await usuarioDePrueba(tx, { rol: "consulta" });
    await tx`UPDATE usuarios SET activo = false WHERE id = ${inactivo.usuarioId}`;
    const { usuarios } = await datosParaAceptar(tramiteId, { sql: tx });
    expect(usuarios.map((u) => u.id)).not.toContain(inactivo.usuarioId);
    expect(usuarios.find((u) => u.id === liderCex.usuarioId)).toEqual({ id: liderCex.usuarioId, nombre: liderCex.nombre, cargo: "Médico Coordinador", rol: "lider_proceso" });
  }));

  it("la plantilla es la versión vigente; sin vigente, el tipo no muestra nada", () => revertida(sql, async (tx) => {
    const { tramiteId, tipoDocumentoId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "FO", titulo: "Formato con plantilla" });
    const plantillaId = await idDe(tx, "SGC-FO-01");
    await tx`UPDATE tipos_documento SET plantilla_documento_id = ${plantillaId} WHERE id = ${tipoDocumentoId}`;
    const [v] = await tx`SELECT numero FROM documento_versiones WHERE documento_id = ${plantillaId} AND estado = 'vigente'`;
    expect((await datosParaAceptar(tramiteId, { sql: tx })).plantilla).toEqual({ codigo: "SGC-FO-01", version: v.numero });
    await tx`UPDATE documento_versiones SET estado = 'anulado' WHERE documento_id = ${plantillaId} AND estado = 'vigente'`;
    expect((await datosParaAceptar(tramiteId, { sql: tx })).plantilla).toBeNull();
  }));

  it("el contexto dice el rol de quien pidió aunque ya no esté activo, y la versión que sigue", () => revertida(sql, async (tx) => {
    const lider = await sesionDe(tx, "lider.gth");
    const documentoId = await idDe(tx, "GTH-CA-01");
    await crearSolicitud(lider, { tipo: "eliminar", motivo: "mejora", justificacion: JUSTIFICACION, documentoId }, opc(tx));
    await tx`UPDATE usuarios SET activo = false WHERE id = ${lider.usuarioId}`;
    const contexto = await contextoDeAceptacion({ tipo: "eliminar", documentoId, solicitanteId: lider.usuarioId }, { sql: tx });
    expect(contexto).toMatchObject({ solicitanteRol: "lider_proceso", documento: { tipo: "Caracterización", versionSiguiente: 3 }, catalogo: null });
  }));

  it("en una creación el contexto trae el catálogo para clasificar y para elegir el documento existente", () => revertida(sql, async (tx) => {
    const { liderCex, procesoId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "GU", titulo: "Guía nueva" });
    const contexto = await contextoDeAceptacion({ tipo: "crear", documentoId: null, solicitanteId: liderCex.usuarioId }, { sql: tx });
    expect(contexto.documento).toBeNull();
    const catalogo = contexto.catalogo!;
    expect(catalogo.formatoCodigo).toBe("{PROCESO}-{TIPO}-{NN}");
    expect(catalogo.tipos.find((t) => t.sigla === "CA")).toMatchObject({ nombre: "Caracterización", autoridad: "estrategico", plantilla: null });
    expect(catalogo.procesos.find((p) => p.sigla === "CEX")?.subprocesos.length).toBeGreaterThan(0);
    expect(catalogo.codigos).toContain("CEX-GU-01");
    expect(catalogo.documentos.find((d) => d.codigo === "CEX-GU-01")).toMatchObject({
      procesoId, tipo: "Guía", autoridad: "operativo", versionSiguiente: 2, conTramite: false, conBorrador: false,
    });
  }));
});
