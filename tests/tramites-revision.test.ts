/**
 * Revisión: lista de verificación, observaciones numeradas, devolución y concepto favorable.
 * Corre contra la demo ya sembrada, dentro de una transacción que se revierte.
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { listarFirmas } from "@/db/consultas/firmas";
import {
  cerrarObservacion,
  crearObservacion,
  guardarVerificacion,
  listarItemsVerificacion,
  listarObservaciones,
  obtenerVerificacion,
  reabrirObservacion,
  responderObservacion,
} from "@/db/consultas/revision";
import { ErrorTramite, transicionar } from "@/db/consultas/tramites-flujo";
import type { Verificador } from "@/lib/firma";
import { opc, tramiteEn } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

type Trayecto = Awaited<ReturnType<typeof tramiteEn>>;

describe("revisión", () => {
  it("el concepto favorable exige lista completa, ningún crítico sin cumplir y observaciones cerradas", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
      const favorable = () => tx.savepoint(() => transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "concepto_favorable",
        etapaEsperada: "revision", rondaEsperada: 1, datos: { concepto: "Cumple; listo para aprobación." }, credenciales: { clave: "x" } }, opc(tx)));
      const responder = (resultados: Record<number, "cumple" | "no_cumple" | "no_aplica">) => guardarVerificacion(t.tramiteId, t.revisor,
        items.filter((i) => resultados[i.id] ?? resultados[0]).map((i) => ({ itemId: i.id, resultado: resultados[i.id] ?? resultados[0] })), { sql: tx });

      await responder({ [items[0].id]: "cumple" });
      await expect(favorable()).rejects.toThrow("Faltan ítems de la lista por responder");
      await responder({ 0: "cumple", [items[0].id]: "no_cumple" });               // el primero es crítico
      await expect(favorable()).rejects.toThrow("Hay un ítem crítico que no cumple");
      await responder({ 0: "cumple", [items[3].id]: "no_cumple" });               // el cuarto no es crítico
      const n = await crearObservacion(t.tramiteId, t.revisor, "Falta el responsable en el numeral 5.2.", { sql: tx });
      await expect(favorable()).rejects.toThrow("Hay observaciones sin cerrar");

      expect(await transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "devolver_revision", etapaEsperada: "revision", rondaEsperada: 1 }, opc(tx)))
        .toEqual({ etapa: "elaboracion", ronda: 2 });
      const [fila] = await tx`SELECT vence_en FROM tramites WHERE id = ${t.tramiteId}`;
      expect(fila.vence_en.toISOString()).toBe("2026-11-11T04:59:59.999Z");       // ajustes: 5 días

      await responderObservacion(n, t.elaborador, "Se agregó al jefe inmediato.", { sql: tx });
      await transicionar(t.elaborador, { tramiteId: t.tramiteId, accion: "enviar_a_revision", etapaEsperada: "elaboracion", rondaEsperada: 2, credenciales: { clave: "x" } }, opc(tx));

      const ronda2 = await obtenerVerificacion(t.tramiteId, 2, { sql: tx });
      expect(ronda2.find((r) => r.itemId === items[3].id)!.resultado).toBe("no_cumple");   // parte de la ronda anterior
      const soloMirando = await obtenerVerificacion(t.tramiteId, 2, { sql: tx, sinPropuesta: true });
      expect(soloMirando.every((r) => r.resultado === null)).toBe(true);                     // quien mira no ve propuestas
      await guardarVerificacion(t.tramiteId, t.revisor, ronda2.map((r) => ({ itemId: r.itemId, resultado: r.resultado! })), { sql: tx });
      await cerrarObservacion(n, t.revisor, { sql: tx });
      const cierre = await transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "concepto_favorable", etapaEsperada: "revision", rondaEsperada: 2,
        datos: { concepto: "Observaciones atendidas." }, credenciales: { clave: "x" } }, opc(tx));
      expect(cierre).toEqual({ etapa: "aprobacion", ronda: 2 });
      const firmas = await listarFirmas(t.tramiteId, { sql: tx });
      expect(firmas.map((f) => `${f.firma}:${f.ronda}`)).toEqual(["elaboro:1", "elaboro:2", "reviso:2"]);
      expect(new Set(firmas.filter((f) => f.ronda === 2).map((f) => f.hashSha256)).size).toBe(1);
    } finally { await t.limpiar(); }
  }));

  it("cada quien solo hace lo suyo, y una ronda cerrada no se edita", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      await expect(tx.savepoint(() => crearObservacion(t.tramiteId, t.elaborador, "No debería poder.", { sql: tx }))).rejects.toBeInstanceOf(ErrorTramite);
      const o = await crearObservacion(t.tramiteId, t.revisor, "Observación de prueba.", { sql: tx });
      await expect(tx.savepoint(() => responderObservacion(o, t.elaborador, "Todavía no es mi turno.", { sql: tx }))).rejects.toBeInstanceOf(ErrorTramite);
      await expect(tx.savepoint(() => cerrarObservacion(o, t.revisor, { sql: tx }))).rejects.toBeInstanceOf(ErrorTramite);   // sigue abierta
      await transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "devolver_revision", etapaEsperada: "revision", rondaEsperada: 1 }, opc(tx));
      const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
      await expect(tx.savepoint(() => guardarVerificacion(t.tramiteId, t.revisor, [{ itemId: items[0].id, resultado: "cumple" }], { sql: tx })))
        .rejects.toBeInstanceOf(ErrorTramite);                                                                              // ya no está en revisión
      // El elaborador ya no responde a una observación ajena a su turno de revisión, y un tercero no ve nada.
      await expect(tx.savepoint(() => cerrarObservacion(o, t.revisor, { sql: tx }))).rejects.toBeInstanceOf(ErrorTramite);
    } finally { await t.limpiar(); }
  }));

  it("reabrir deja la observación abierta con su nota, sin respuesta, y bloquea el concepto favorable", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
      const completa = () => guardarVerificacion(t.tramiteId, t.revisor, items.map((i) => ({ itemId: i.id, resultado: "cumple" as const })), { sql: tx });
      await completa();
      const o = await crearObservacion(t.tramiteId, t.revisor, "Falta el responsable en el numeral 5.2.", { sql: tx });
      await transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "devolver_revision", etapaEsperada: "revision", rondaEsperada: 1 }, opc(tx));
      await responderObservacion(o, t.elaborador, "Se agregó al jefe inmediato.", { sql: tx });
      const enviar = () => tx.savepoint(() => transicionar(t.elaborador, { tramiteId: t.tramiteId, accion: "enviar_a_revision", etapaEsperada: "elaboracion", rondaEsperada: 2, credenciales: { clave: "x" } }, opc(tx)));
      await enviar();
      await completa();
      await cerrarObservacion(o, t.revisor, { sql: tx });
      await reabrirObservacion(o, t.revisor, "Aún no aparece en el diagrama.", { sql: tx });

      const [r] = await listarObservaciones(t.tramiteId, { sql: tx });
      expect(r).toMatchObject({ estado: "abierta", respuesta: null, notaReapertura: "Aún no aparece en el diagrama." });
      const [cols] = await tx`SELECT respondida_por, respondida_en, cerrada_por, cerrada_en FROM tramite_observaciones WHERE id = ${o}`;
      expect(cols).toEqual({ respondida_por: null, respondida_en: null, cerrada_por: null, cerrada_en: null });
      const [aud] = await tx`SELECT detalle FROM auditoria WHERE accion = 'tramite_reabrir_observacion' AND entidad_id = ${t.tramiteId}`;
      expect(aud.detalle).toMatchObject({ observacion: 1, respuestaAnterior: "Se agregó al jefe inmediato." });

      await expect(tx.savepoint(() => transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "concepto_favorable", etapaEsperada: "revision", rondaEsperada: 2,
        datos: { concepto: "Observaciones atendidas." }, credenciales: { clave: "x" } }, opc(tx)))).rejects.toThrow("Hay observaciones sin cerrar");

      // Devuelta otra vez, el elaborador debe responder de nuevo antes de enviar.
      await transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "devolver_revision", etapaEsperada: "revision", rondaEsperada: 2 }, opc(tx));
      await expect(enviar_ronda3(tx, t)).rejects.toThrow("Hay observaciones sin responder");
      await responderObservacion(o, t.elaborador, "Ahora sí aparece.", { sql: tx });
      await expect(enviar_ronda3(tx, t)).resolves.toBeDefined();
    } finally { await t.limpiar(); }
  }));

  it("un ítem desactivado no se exige ni aparece en la ronda siguiente, y la respuesta guardada conserva su texto", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
      await guardarVerificacion(t.tramiteId, t.revisor, items.map((i) => ({ itemId: i.id, resultado: "cumple" as const })), { sql: tx });
      const o = await crearObservacion(t.tramiteId, t.revisor, "Una observación para devolver.", { sql: tx });
      await transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "devolver_revision", etapaEsperada: "revision", rondaEsperada: 1 }, opc(tx));
      await responderObservacion(o, t.elaborador, "Atendida en el texto.", { sql: tx });
      await transicionar(t.elaborador, { tramiteId: t.tramiteId, accion: "enviar_a_revision", etapaEsperada: "elaboracion", rondaEsperada: 2, credenciales: { clave: "x" } }, opc(tx));

      const retirado = items[4];
      await tx`UPDATE lista_verificacion_items SET activo = false WHERE id = ${retirado.id}`;
      const ronda2 = await obtenerVerificacion(t.tramiteId, 2, { sql: tx });
      expect(ronda2.map((r) => r.itemId)).not.toContain(retirado.id);
      await guardarVerificacion(t.tramiteId, t.revisor, ronda2.map((r) => ({ itemId: r.itemId, resultado: r.resultado! })), { sql: tx });
      await cerrarObservacion(o, t.revisor, { sql: tx });
      const cierre = await transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "concepto_favorable", etapaEsperada: "revision", rondaEsperada: 2,
        datos: { concepto: "Sin el ítem retirado." }, credenciales: { clave: "x" } }, opc(tx));
      expect(cierre.etapa).toBe("aprobacion");

      const [guardada] = await tx`SELECT texto_item, critico FROM tramite_verificaciones WHERE tramite_id = ${t.tramiteId} AND ronda = 1 AND item_id = ${retirado.id}`;
      expect(guardada).toEqual({ texto_item: retirado.texto, critico: retirado.critico });
      await expect(tx.savepoint(() => guardarVerificacion(t.tramiteId, t.revisor, [{ itemId: retirado.id, resultado: "cumple" }], { sql: tx })))
        .rejects.toBeInstanceOf(ErrorTramite);
    } finally { await t.limpiar(); }
  }));

  it("las faltas se avisan antes de verificar la firma: no se gasta una clave por una lista incompleta", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      const verificar = vi.fn<Verificador>(async () => ({ ok: true, metodo: "clave" }));
      const intentar = (concepto: string) => tx.savepoint(() => transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "concepto_favorable",
        etapaEsperada: "revision", rondaEsperada: 1, datos: { concepto }, credenciales: { clave: "x" } }, { ...opc(tx), verificar }));
      await expect(intentar("Cumple; listo para aprobación.")).rejects.toThrow("Faltan ítems de la lista por responder");
      const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
      await guardarVerificacion(t.tramiteId, t.revisor, items.map((i) => ({ itemId: i.id, resultado: i === items[0] ? "no_cumple" as const : "cumple" as const })), { sql: tx });
      await expect(intentar("Cumple; listo para aprobación.")).rejects.toThrow("Hay un ítem crítico que no cumple");
      await guardarVerificacion(t.tramiteId, t.revisor, [{ itemId: items[0].id, resultado: "cumple" }], { sql: tx });
      await expect(intentar("ok")).rejects.toThrow("El concepto debe tener entre 5 y 2000 caracteres");
      await crearObservacion(t.tramiteId, t.revisor, "Una observación sin cerrar.", { sql: tx });
      await expect(intentar("Cumple; listo para aprobación.")).rejects.toThrow("Hay observaciones sin cerrar");
      expect(verificar).not.toHaveBeenCalled();
    } finally { await t.limpiar(); }
  }));

  it("devolver exige una observación abierta, avisa al elaborador y deja los números en el evento", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      const devolver = () => transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "devolver_revision", etapaEsperada: "revision", rondaEsperada: 1 }, opc(tx));
      await expect(tx.savepoint(devolver)).rejects.toThrow("Para devolver, escriba al menos una observación");
      await crearObservacion(t.tramiteId, t.revisor, "Primera observación.", { sql: tx });
      await crearObservacion(t.tramiteId, t.revisor, "Segunda observación.", { sql: tx });
      expect((await listarObservaciones(t.tramiteId, { sql: tx })).map((x) => x.numero)).toEqual([1, 2]);
      await devolver();
      const [e] = await tx`SELECT detalle FROM tramite_eventos WHERE tramite_id = ${t.tramiteId} AND tipo = 'devolver_revision'`;
      expect(e.detalle).toEqual({ observaciones: [1, 2] });
      const avisos = await tx`SELECT usuario_id FROM notificaciones WHERE entidad = 'tramite' AND entidad_id = ${t.tramiteId} AND tipo = 'tramite.devuelto'`;
      expect(avisos.map((a) => Number(a.usuario_id))).toEqual([t.elaborador.usuarioId]);
    } finally { await t.limpiar(); }
  }));

  it("el concepto favorable guarda en su evento la lista completa con texto y marca de crítico, y avisa al aprobador", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aprobacion");
    try {
      const [e] = await tx`SELECT detalle FROM tramite_eventos WHERE tramite_id = ${t.tramiteId} AND tipo = 'concepto_favorable'`;
      const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
      expect(e.detalle.concepto).toBe("Cumple; listo para aprobación.");
      expect(e.detalle.observaciones).toEqual({ total: 0, cerradas: 0 });
      expect(e.detalle.lista).toEqual(items.map((i) => ({ itemId: i.id, texto: i.texto, critico: i.critico, resultado: "cumple", nota: null })));
      const avisos = await tx`SELECT usuario_id FROM notificaciones WHERE entidad = 'tramite' AND entidad_id = ${t.tramiteId} AND tipo = 'tramite.paso'
        AND titulo LIKE '%le toca aprobar'`;
      expect(avisos.map((a) => Number(a.usuario_id))).toEqual([t.aprobador.usuarioId]);
    } finally { await t.limpiar(); }
  }));

  it("cada escritura deja su auditoría con el número de la observación", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
      await guardarVerificacion(t.tramiteId, t.revisor, [{ itemId: items[0].id, resultado: "cumple", nota: "  Revisado.  " }], { sql: tx });
      await crearObservacion(t.tramiteId, t.revisor, "Observación de prueba.", { sql: tx });
      const acciones = await tx`SELECT accion, detalle FROM auditoria WHERE entidad = 'tramite' AND entidad_id = ${t.tramiteId}
        AND accion IN ('tramite_guardar_lista', 'tramite_crear_observacion') ORDER BY id`;
      expect(acciones.map((a) => a.accion)).toEqual(["tramite_guardar_lista", "tramite_crear_observacion"]);
      expect(acciones[1].detalle.observacion).toBe(1);
      const [v] = await tx`SELECT nota FROM tramite_verificaciones WHERE tramite_id = ${t.tramiteId}`;
      expect(v.nota).toBe("Revisado.");
    } finally { await t.limpiar(); }
  }));
});

/** Envía a revisión en la ronda 3 (el trámite fue devuelto por segunda vez). */
function enviar_ronda3(tx: Parameters<Parameters<typeof revertida>[1]>[0], t: Trayecto) {
  return tx.savepoint(() => transicionar(t.elaborador, { tramiteId: t.tramiteId, accion: "enviar_a_revision", etapaEsperada: "elaboracion", rondaEsperada: 3, credenciales: { clave: "x" } }, opc(tx)));
}
