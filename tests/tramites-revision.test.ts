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
import type { TransactionSql } from "postgres";
import {
  listarItemsVerificacion,
  listarObservaciones,
  listarRondasVerificacion,
  obtenerVerificacion,
  type Esperado,
  type Resultado,
} from "@/db/consultas/revision";
import * as real from "@/db/consultas/revision";
import { CAMBIO_MIENTRAS, ErrorTramite, transicionar } from "@/db/consultas/tramites-flujo";
import type { Verificador } from "@/lib/firma";
import { opc, tramiteEn } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

/** Lo que vería una persona que acaba de abrir la página: el estado del trámite en este instante. */
async function esperadoDelTramite(tx: TransactionSql, tramiteId: number): Promise<Esperado> {
  const [t] = await tx`SELECT etapa, ronda FROM tramites WHERE id = ${tramiteId}`;
  return { etapa: t.etapa, ronda: t.ronda };
}
async function esperadoDeObservacion(tx: TransactionSql, observacionId: number): Promise<Esperado> {
  const [t] = await tx`SELECT t.etapa, t.ronda FROM tramite_observaciones o JOIN tramites t ON t.id = o.tramite_id WHERE o.id = ${observacionId}`;
  return { etapa: t.etapa, ronda: t.ronda };
}
type Opc = { sql: TransactionSql };
type Sesion = Parameters<typeof real.crearObservacion>[1];
const guardarVerificacion = async (id: number, ses: Sesion, r: { itemId: number; resultado: Resultado; nota?: string }[], o: Opc) =>
  real.guardarVerificacion(id, ses, r, await esperadoDelTramite(o.sql, id), o);
const crearObservacion = async (id: number, ses: Sesion, texto: string, o: Opc) =>
  real.crearObservacion(id, ses, texto, await esperadoDelTramite(o.sql, id), o);
const responderObservacion = async (id: number, ses: Sesion, texto: string, o: Opc) =>
  real.responderObservacion(id, ses, texto, await esperadoDeObservacion(o.sql, id), o);
const cerrarObservacion = async (id: number, ses: Sesion, o: Opc) =>
  real.cerrarObservacion(id, ses, await esperadoDeObservacion(o.sql, id), o);
const reabrirObservacion = async (id: number, ses: Sesion, nota: string, o: Opc) =>
  real.reabrirObservacion(id, ses, nota, await esperadoDeObservacion(o.sql, id), o);

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
      // Quien mira no ve la propuesta como si fuera de la ronda 2: ve la ronda 1, con su número.
      expect((await listarRondasVerificacion(t.tramiteId, { sql: tx })).map((r) => r.ronda)).toEqual([1]);
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

  it("quien solo mira una ronda respondida no ve un ítem creado después como «Sin responder»", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aprobacion");
    try {
      const [antes] = await listarRondasVerificacion(t.tramiteId, { sql: tx });
      await tx`INSERT INTO lista_verificacion_items (texto, critico, orden) VALUES ('Ítem creado después de la revisión', false, 9999)`;
      const [mirando] = await listarRondasVerificacion(t.tramiteId, { sql: tx });
      expect(mirando.respuestas.map((r) => r.itemId)).toEqual(antes.respuestas.map((r) => r.itemId));
      // Quien revisa sí lo ve, para responderlo.
      const revisando = await obtenerVerificacion(t.tramiteId, t.ronda, { sql: tx });
      expect(revisando).toHaveLength(antes.respuestas.length + 1);
    } finally { await t.limpiar(); }
  }));

  it("las rondas van de la más reciente a la primera, cada una como se respondió", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      expect(await listarRondasVerificacion(t.tramiteId, { sql: tx })).toEqual([]);
      const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
      const [primero, segundo] = items;
      await guardarVerificacion(t.tramiteId, t.revisor, [
        { itemId: segundo.id, resultado: "no_aplica" },
        { itemId: primero.id, resultado: "no_cumple", nota: "Falta el numeral 5." },
      ], { sql: tx });
      await crearObservacion(t.tramiteId, t.revisor, "Falta el numeral 5.", { sql: tx });
      await transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "devolver_revision", etapaEsperada: "revision", rondaEsperada: 1 }, opc(tx));
      await tx`UPDATE lista_verificacion_items SET texto = 'Texto de hoy', critico = NOT critico WHERE id = ${primero.id}`;

      const [ronda1] = await listarRondasVerificacion(t.tramiteId, { sql: tx });
      expect(ronda1.ronda).toBe(1);
      expect(ronda1.respuestas.map((r) => r.itemId)).toEqual([primero.id, segundo.id]);    // en el orden de la lista
      // Conserva el texto y la marca de crítico con que se respondió, y la nota.
      expect(ronda1.respuestas[0]).toEqual({ itemId: primero.id, texto: primero.texto, critico: primero.critico, resultado: "no_cumple", nota: "Falta el numeral 5." });

      await responderObservacion((await listarObservaciones(t.tramiteId, { sql: tx }))[0].id, t.elaborador, "Se añadió el numeral.", { sql: tx });
      await transicionar(t.elaborador, { tramiteId: t.tramiteId, accion: "enviar_a_revision", etapaEsperada: "elaboracion", rondaEsperada: 2, credenciales: { clave: "x" } }, opc(tx));
      await guardarVerificacion(t.tramiteId, t.revisor, [{ itemId: primero.id, resultado: "cumple" }], { sql: tx });

      const rondas = await listarRondasVerificacion(t.tramiteId, { sql: tx });
      expect(rondas.map((r) => r.ronda)).toEqual([2, 1]);
      expect(rondas[0].respuestas).toEqual([{ itemId: primero.id, texto: "Texto de hoy", critico: !primero.critico, resultado: "cumple", nota: null }]);
    } finally { await t.limpiar(); }
  }));

  it("las observaciones dicen quién respondió y quién cerró, y cuándo", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      const n = await crearObservacion(t.tramiteId, t.revisor, "Falta el responsable.", { sql: tx });
      expect((await listarObservaciones(t.tramiteId, { sql: tx }))[0]).toMatchObject({ respondidaPor: null, cerradaPor: null, cerradaEn: null });
      await transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "devolver_revision", etapaEsperada: "revision", rondaEsperada: 1 }, opc(tx));
      await responderObservacion(n, t.elaborador, "Se añadió.", { sql: tx });
      await transicionar(t.elaborador, { tramiteId: t.tramiteId, accion: "enviar_a_revision", etapaEsperada: "elaboracion", rondaEsperada: 2, credenciales: { clave: "x" } }, opc(tx));
      await cerrarObservacion(n, t.revisor, { sql: tx });
      const [o] = await listarObservaciones(t.tramiteId, { sql: tx });
      expect(o).toMatchObject({ respondidaPor: t.elaborador.nombre, cerradaPor: t.revisor.nombre, estado: "cerrada" });
      expect(o.respondidaEn).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
      expect(o.cerradaEn).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
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
  it("una pestaña vieja no escribe sobre la ronda actual: guardar da el aviso de cambio y no deja nada", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
      const vieja: Esperado = { etapa: "revision", ronda: 1 };
      await guardarVerificacion(t.tramiteId, t.revisor, items.map((i) => ({ itemId: i.id, resultado: "no_cumple" as const })), { sql: tx });
      const o = await crearObservacion(t.tramiteId, t.revisor, "Observación de la primera ronda.", { sql: tx });
      await transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "devolver_revision", etapaEsperada: "revision", rondaEsperada: 1 }, opc(tx));
      await responderObservacion(o, t.elaborador, "Atendida.", { sql: tx });
      await transicionar(t.elaborador, { tramiteId: t.tramiteId, accion: "enviar_a_revision", etapaEsperada: "elaboracion", rondaEsperada: 2, credenciales: { clave: "x" } }, opc(tx));

      const stale = (hacer: () => Promise<unknown>) => expect(tx.savepoint(hacer)).rejects.toThrow(CAMBIO_MIENTRAS);
      await stale(() => real.guardarVerificacion(t.tramiteId, t.revisor, [{ itemId: items[0].id, resultado: "cumple" }], vieja, { sql: tx }));
      await stale(() => real.crearObservacion(t.tramiteId, t.revisor, "Desde la pestaña vieja.", vieja, { sql: tx }));
      await stale(() => real.cerrarObservacion(o, t.revisor, vieja, { sql: tx }));
      await stale(() => real.reabrirObservacion(o, t.revisor, "Desde la pestaña vieja.", vieja, { sql: tx }));
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM tramite_verificaciones WHERE tramite_id = ${t.tramiteId} AND ronda = 2`;
      expect(n).toBe(0);
      expect((await listarObservaciones(t.tramiteId, { sql: tx })).map((x) => x.estado)).toEqual(["atendida"]);
    } finally { await t.limpiar(); }
  }));

  it("cerrar con la vista de antes de reabrir y responder otra vez no cierra la respuesta nueva", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      const o = await crearObservacion(t.tramiteId, t.revisor, "Falta el responsable.", { sql: tx });
      await transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "devolver_revision", etapaEsperada: "revision", rondaEsperada: 1 }, opc(tx));
      const enviar = (ronda: number) => transicionar(t.elaborador, { tramiteId: t.tramiteId, accion: "enviar_a_revision", etapaEsperada: "elaboracion", rondaEsperada: ronda, credenciales: { clave: "x" } }, opc(tx));
      await responderObservacion(o, t.elaborador, "Primera respuesta.", { sql: tx });
      await enviar(2);
      const vieja = await esperadoDeObservacion(tx, o);                          // la pestaña abierta en la ronda 2
      await reabrirObservacion(o, t.revisor, "Todavía falta la fecha.", { sql: tx });
      await transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "devolver_revision", etapaEsperada: "revision", rondaEsperada: 2 }, opc(tx));
      await responderObservacion(o, t.elaborador, "Segunda respuesta.", { sql: tx });
      await enviar(3);
      await expect(tx.savepoint(() => real.cerrarObservacion(o, t.revisor, vieja, { sql: tx }))).rejects.toThrow(CAMBIO_MIENTRAS);
      expect((await listarObservaciones(t.tramiteId, { sql: tx }))[0].estado).toBe("atendida");
    } finally { await t.limpiar(); }
  }));

  it("una observación atendida pero sin cerrar impide el concepto; una propuesta sin guardar no cuenta; un ítem activado después falta", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
      const completa = () => guardarVerificacion(t.tramiteId, t.revisor, items.map((i) => ({ itemId: i.id, resultado: "cumple" as const })), { sql: tx });
      const favorable = (ronda: number) => tx.savepoint(() => transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "concepto_favorable", etapaEsperada: "revision", rondaEsperada: ronda,
        datos: { concepto: "Cumple; listo para aprobación." }, credenciales: { clave: "x" } }, opc(tx)));
      await completa();
      const o = await crearObservacion(t.tramiteId, t.revisor, "Falta el responsable.", { sql: tx });
      await transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "devolver_revision", etapaEsperada: "revision", rondaEsperada: 1 }, opc(tx));
      await responderObservacion(o, t.elaborador, "Atendida.", { sql: tx });
      await transicionar(t.elaborador, { tramiteId: t.tramiteId, accion: "enviar_a_revision", etapaEsperada: "elaboracion", rondaEsperada: 2, credenciales: { clave: "x" } }, opc(tx));

      // La ronda 2 solo tiene la propuesta de la 1: sin guardar no se puede dar el concepto.
      await expect(favorable(2)).rejects.toThrow("Faltan ítems de la lista por responder");
      await completa();
      await expect(favorable(2)).rejects.toThrow("Hay observaciones sin cerrar");        // atendida, no cerrada
      await cerrarObservacion(o, t.revisor, { sql: tx });
      const [nuevo] = await tx`INSERT INTO lista_verificacion_items (texto, critico, orden) VALUES ('Ítem activado después', false, 99) RETURNING id`;
      await expect(favorable(2)).rejects.toThrow("Faltan ítems de la lista por responder");
      await guardarVerificacion(t.tramiteId, t.revisor, [{ itemId: Number(nuevo.id), resultado: "no_aplica" }], { sql: tx });
      expect((await favorable(2)).etapa).toBe("aprobacion");
    } finally { await t.limpiar(); }
  }));

  it("sin ítems activos no hay concepto, aunque la ronda ya tenga sus respuestas guardadas", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
      await guardarVerificacion(t.tramiteId, t.revisor, items.map((i) => ({ itemId: i.id, resultado: "cumple" as const })), { sql: tx });
      await tx`UPDATE lista_verificacion_items SET activo = false`;
      const verificar = vi.fn<Verificador>(async () => ({ ok: true, metodo: "clave" }));
      await expect(tx.savepoint(() => transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "concepto_favorable", etapaEsperada: "revision", rondaEsperada: 1,
        datos: { concepto: "Cumple; listo para aprobación." }, credenciales: { clave: "x" } }, { ...opc(tx), verificar })))
        .rejects.toThrow("No hay ítems activos en la lista de verificación. Pida al Administrador del SGC que los active.");
      expect(verificar).not.toHaveBeenCalled();
    } finally { await t.limpiar(); }
  }));

  it("la respuesta de un ítem desactivado antes de firmar sigue en el evento, y un crítico que no cumple sigue impidiendo el concepto", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
      await guardarVerificacion(t.tramiteId, t.revisor, items.map((i) => ({ itemId: i.id, resultado: i.id === items[0].id ? "no_cumple" as const : "cumple" as const })), { sql: tx });
      await tx`UPDATE lista_verificacion_items SET activo = false WHERE id = ${items[0].id}`;
      const favorable = () => tx.savepoint(() => transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "concepto_favorable", etapaEsperada: "revision", rondaEsperada: 1,
        datos: { concepto: "Cumple; listo para aprobación." }, credenciales: { clave: "x" } }, opc(tx)));
      await expect(favorable()).rejects.toThrow("Hay un ítem crítico que no cumple");
      await guardarVerificacion(t.tramiteId, t.revisor, [{ itemId: items[0].id, resultado: "cumple" }], { sql: tx });   // ya respondido en la ronda: se puede corregir
      await favorable();
      const [e] = await tx`SELECT detalle FROM tramite_eventos WHERE tramite_id = ${t.tramiteId} AND tipo = 'concepto_favorable'`;
      expect(e.detalle.lista).toHaveLength(items.length);
      expect(e.detalle.lista[0]).toMatchObject({ itemId: items[0].id, texto: items[0].texto, critico: true, resultado: "cumple" });
    } finally { await t.limpiar(); }
  }));

  it("un tercero que no es revisor ni elaborador no puede escribir en ninguna función", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
      const o = await crearObservacion(t.tramiteId, t.revisor, "Observación de prueba.", { sql: tx });
      const tercero = t.admin;
      const rechaza = (hacer: () => Promise<unknown>) => expect(tx.savepoint(hacer)).rejects.toBeInstanceOf(ErrorTramite);
      await rechaza(() => guardarVerificacion(t.tramiteId, tercero, [{ itemId: items[0].id, resultado: "cumple" }], { sql: tx }));
      await rechaza(() => crearObservacion(t.tramiteId, tercero, "Observación ajena.", { sql: tx }));
      await rechaza(() => cerrarObservacion(o, tercero, { sql: tx }));
      await rechaza(() => reabrirObservacion(o, tercero, "Nota ajena.", { sql: tx }));
      await rechaza(() => responderObservacion(o, tercero, "Respuesta ajena.", { sql: tx }));
      // Y un id que no existe da el mismo mensaje que un trámite que no se ve.
      await expect(tx.savepoint(() => real.cerrarObservacion(2_000_000_000, t.revisor, { etapa: "revision", ronda: 1 }, { sql: tx }))).rejects.toThrow("El trámite no existe");
    } finally { await t.limpiar(); }
  }));

  it("reescribir una respuesta atendida deja la anterior en la auditoría", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      const o = await crearObservacion(t.tramiteId, t.revisor, "Falta el responsable.", { sql: tx });
      await transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "devolver_revision", etapaEsperada: "revision", rondaEsperada: 1 }, opc(tx));
      await responderObservacion(o, t.elaborador, "Primera respuesta.", { sql: tx });
      await responderObservacion(o, t.elaborador, "Respuesta corregida.", { sql: tx });
      const auds = await tx`SELECT detalle FROM auditoria WHERE accion = 'tramite_responder_observacion' AND entidad_id = ${t.tramiteId} ORDER BY id`;
      expect(auds[0].detalle.respuestaAnterior).toBeUndefined();
      expect(auds[1].detalle.respuestaAnterior).toBe("Primera respuesta.");
    } finally { await t.limpiar(); }
  }));
});

/** Envía a revisión en la ronda 3 (el trámite fue devuelto por segunda vez). */
function enviar_ronda3(tx: Parameters<Parameters<typeof revertida>[1]>[0], t: Trayecto) {
  return tx.savepoint(() => transicionar(t.elaborador, { tramiteId: t.tramiteId, accion: "enviar_a_revision", etapaEsperada: "elaboracion", rondaEsperada: 3, credenciales: { clave: "x" } }, opc(tx)));
}
