/**
 * Cancelar, reasignar y corregir datos de control de un trámite abierto, contra la demo ya
 * sembrada. Todo corre dentro de una transacción que se revierte: no deja filas.
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import type { TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { sugerirCodigo } from "@/db/consultas/codigos";
import { listarTramites } from "@/db/consultas/tramites";
import { guardarControlCambios } from "@/db/consultas/tramites-archivos";
import { ErrorTramite, transicionar, type SesionFlujo } from "@/db/consultas/tramites-flujo";
import { corregirDatosDeControl } from "@/db/consultas/tramites-gestion";
import { finDeFecha } from "@/lib/tramites/plazos";
import type { EtapaTrabajo } from "@/lib/tramites/tipos";
import { opc, sesionAdmin, sesionDe, tramiteEn, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

type Datos = Record<string, unknown>;

const reasignarEn = (tx: TransactionSql, quien: SesionFlujo, tramiteId: number, etapa: EtapaTrabajo, ronda: number, datos: Datos) =>
  transicionar(quien, { tramiteId, accion: "reasignar", etapaEsperada: etapa, rondaEsperada: ronda, datos: { motivo: "Se reorganiza el equipo.", ...datos } }, opc(tx));

const avisosDe = (tx: TransactionSql, usuarioId: number, tramiteId: number) =>
  tx`SELECT tipo, titulo, cuerpo, enlace FROM notificaciones
    WHERE usuario_id = ${usuarioId} AND entidad = 'tramite' AND entidad_id = ${tramiteId} ORDER BY id`;

const eventosDe = (tx: TransactionSql, tramiteId: number, tipo: string) =>
  tx`SELECT detalle, ronda, usuario_id FROM tramite_eventos WHERE tramite_id = ${tramiteId} AND tipo = ${tipo} ORDER BY id`;

describe("cancelar", () => {
  it("cancelar descarta la versión y libera su número", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    const [v] = await tx`SELECT numero FROM documento_versiones WHERE id = ${t.versionId}`;
    await transicionar(t.admin, { tramiteId: t.tramiteId, accion: "cancelar", etapaEsperada: "elaboracion", rondaEsperada: 1, datos: { motivo: "Se pidió por error." } }, opc(tx));
    const [vieja] = await tx`SELECT estado FROM documento_versiones WHERE id = ${t.versionId}`;
    expect(vieja.estado).toBe("descartado");
    const otro = await tramiteEn(tx, "elaboracion");                     // mismo documento: ya no hay trámite abierto
    const [nueva] = await tx`SELECT numero FROM documento_versiones WHERE id = ${otro.versionId}`;
    expect(nueva.numero).toBe(v.numero);                                 // la versión publicada seguirá siendo consecutiva
  }));

  it("deja el motivo, el evento con la versión y la fecha de cierre; los archivos se conservan", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      const [{ n: antes }] = await tx`SELECT count(*)::int AS n FROM archivos WHERE version_id = ${t.versionId}`;
      expect(await transicionar(t.admin, { tramiteId: t.tramiteId, accion: "cancelar", etapaEsperada: "revision", rondaEsperada: 1, datos: { motivo: "  Ya no se necesita.  " } }, opc(tx)))
        .toEqual({ etapa: "cancelado", ronda: 1 });
      const [fila] = await tx`SELECT motivo_cierre, cerrado_en, vence_en FROM tramites WHERE id = ${t.tramiteId}`;
      expect(fila.motivo_cierre).toBe("Ya no se necesita.");
      expect(fila.cerrado_en).toEqual(new Date("2026-11-05T15:00:00Z"));
      expect(fila.vence_en).toBeNull();
      const [v] = await tx`SELECT numero FROM documento_versiones WHERE id = ${t.versionId}`;
      const [evento] = await eventosDe(tx, t.tramiteId, "cancelar");
      expect(evento.detalle).toEqual({ motivo: "Ya no se necesita.", versionDescartada: v.numero });
      const [{ n: despues }] = await tx`SELECT count(*)::int AS n FROM archivos WHERE version_id = ${t.versionId}`;
      expect(despues).toBe(antes);
    } finally {
      await t.limpiar();
    }
  }));

  it("avisa a los participantes y a los líderes del documento, no a quien cancela", () => revertida(sql, async (tx) => {
    const elaborador = await usuarioDePrueba(tx, { rol: "consulta" });
    const t = await tramiteEn(tx, "elaboracion", { elaborador });
    const lider = await sesionDe(tx, "lider.gth");
    await transicionar(t.admin, { tramiteId: t.tramiteId, accion: "cancelar", etapaEsperada: "elaboracion", rondaEsperada: 1, datos: { motivo: "Se pidió por error." } }, opc(tx));
    for (const quien of [elaborador, t.revisor, t.aprobador, lider]) {
      expect((await avisosDe(tx, quien.usuarioId, t.tramiteId)).at(-1)?.tipo).toBe("tramite.cerrado");
    }
    expect((await avisosDe(tx, t.admin.usuarioId, t.tramiteId)).filter((a) => a.tipo === "tramite.cerrado")).toHaveLength(0);
  }));

  it("el motivo es obligatorio", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    await expect(transicionar(t.admin, { tramiteId: t.tramiteId, accion: "cancelar", etapaEsperada: "elaboracion", rondaEsperada: 1, datos: { motivo: "   " } }, opc(tx)))
      .rejects.toThrow("Escriba el motivo");
  }));

  it("una eliminación cancelada deja el documento vigente intacto", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aprobacion", { tipo: "eliminar" });
    await transicionar(t.admin, { tramiteId: t.tramiteId, accion: "cancelar", etapaEsperada: "aprobacion", rondaEsperada: 0, datos: { motivo: "Sigue en uso." } }, opc(tx));
    const [v] = await tx`SELECT estado FROM documento_versiones WHERE id = ${t.versionId}`;
    expect(v.estado).toBe("vigente");
    const [evento] = await eventosDe(tx, t.tramiteId, "cancelar");
    expect(evento.detalle).toEqual({ motivo: "Sigue en uso." });
  }));

  it("una solicitud sin aceptar se cancela: no hay versión y avisa a los líderes del proceso", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aceptacion", { tipo: "crear" });
    const otroLider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [Number((await tx`SELECT proceso_id FROM tramites WHERE id = ${t.tramiteId}`)[0].proceso_id)] });
    expect(await transicionar(t.admin, { tramiteId: t.tramiteId, accion: "cancelar", etapaEsperada: "aceptacion", rondaEsperada: 0, datos: { motivo: "Duplica otro formato." } }, opc(tx)))
      .toEqual({ etapa: "cancelado", ronda: 0 });
    expect((await avisosDe(tx, otroLider.usuarioId, t.tramiteId)).at(-1)?.tipo).toBe("tramite.cerrado");
  }));

  it("una creación cancelada no libera su código: el sugerido es el consecutivo siguiente", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion", { tipo: "crear", codigo: "CEX-FO-07" });
    const [{ id: procesoId }] = await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`;
    const [{ id: tipoDocumentoId }] = await tx`SELECT id FROM tipos_documento WHERE sigla = 'FO'`;
    const [{ documento_id: documentoId }] = await tx`SELECT documento_id FROM tramites WHERE id = ${t.tramiteId}`;
    await transicionar(t.admin, { tramiteId: t.tramiteId, accion: "cancelar", etapaEsperada: "elaboracion", rondaEsperada: 1, datos: { motivo: "Se pidió por error." } }, opc(tx));
    const versiones = await tx`SELECT estado FROM documento_versiones WHERE documento_id = ${documentoId}`;
    expect(versiones.map((v) => v.estado)).toEqual(["descartado"]);
    expect(await sugerirCodigo({ procesoId: Number(procesoId), tipoDocumentoId: Number(tipoDocumentoId) }, { sql: tx })).toBe("CEX-FO-08");
  }));
});

describe("reasignar", () => {
  it("un responsable desactivado no deja el trámite sin salida", () => revertida(sql, async (tx) => {
    const elaborador = await usuarioDePrueba(tx, { rol: "consulta" });
    const t = await tramiteEn(tx, "elaboracion", { elaborador });
    await tx`UPDATE usuarios SET activo = false WHERE id = ${elaborador.usuarioId}`;
    const enCurso = await listarTramites(t.admin, "en_curso", { sql: tx });
    expect(enCurso.some((x) => x.id === t.tramiteId)).toBe(true);
    const reasignar = (usuarioId: number) => transicionar(t.admin, { tramiteId: t.tramiteId, accion: "reasignar", etapaEsperada: "elaboracion", rondaEsperada: 1,
      datos: { papel: "elaborador", usuarioId, motivo: "Se retiró de la entidad." } }, opc(tx));
    await expect(tx.savepoint(() => reasignar(t.revisor.usuarioId))).rejects.toThrow("Quien elabora no puede revisar");
    const nuevo = await usuarioDePrueba(tx, { rol: "consulta" });
    expect(await reasignar(nuevo.usuarioId)).toEqual({ etapa: "elaboracion", ronda: 1 });
    const [fila] = await tx`SELECT elaborador_id FROM tramites WHERE id = ${t.tramiteId}`;
    expect(fila.elaborador_id).toBe(nuevo.usuarioId);
    const [aviso] = await tx`SELECT tipo FROM notificaciones WHERE usuario_id = ${nuevo.usuarioId} ORDER BY id DESC LIMIT 1`;
    expect(aviso.tipo).toBe("tramite.reasignado");
  }));

  it("la bandeja marca al responsable desactivado", () => revertida(sql, async (tx) => {
    const elaborador = await usuarioDePrueba(tx, { rol: "consulta" });
    const t = await tramiteEn(tx, "elaboracion", { elaborador });
    await tx`UPDATE usuarios SET activo = false WHERE id = ${elaborador.usuarioId}`;
    const enCurso = await listarTramites(t.admin, "en_curso", { sql: tx });
    expect(enCurso.find((x) => x.id === t.tramiteId)?.responsables).toEqual([`${elaborador.nombre} (inactivo)`]);
  }));

  it("dos designados desactivados se reemplazan uno a uno", () => revertida(sql, async (tx) => {
    const elaborador = await usuarioDePrueba(tx, { rol: "consulta" });
    const revisor = await usuarioDePrueba(tx, { rol: "lider_proceso" });
    const t = await tramiteEn(tx, "elaboracion", { elaborador, revisor });
    await tx`UPDATE usuarios SET activo = false WHERE id = ANY(${[elaborador.usuarioId, revisor.usuarioId]})`;
    const nuevoElaborador = await usuarioDePrueba(tx, { rol: "consulta" });
    const nuevoRevisor = await usuarioDePrueba(tx, { rol: "lider_proceso" });
    await reasignarEn(tx, t.admin, t.tramiteId, "elaboracion", 1, { papel: "elaborador", usuarioId: nuevoElaborador.usuarioId });
    await reasignarEn(tx, t.admin, t.tramiteId, "elaboracion", 1, { papel: "revisor", usuarioId: nuevoRevisor.usuarioId });
    const [fila] = await tx`SELECT elaborador_id, revisor_id FROM tramites WHERE id = ${t.tramiteId}`;
    expect([fila.elaborador_id, fila.revisor_id]).toEqual([nuevoElaborador.usuarioId, nuevoRevisor.usuarioId]);
  }));

  it("quien entra debe estar activo", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    const inactivo = await usuarioDePrueba(tx, { rol: "consulta" });
    await tx`UPDATE usuarios SET activo = false WHERE id = ${inactivo.usuarioId}`;
    await expect(reasignarEn(tx, t.admin, t.tramiteId, "elaboracion", 1, { papel: "elaborador", usuarioId: inactivo.usuarioId }))
      .rejects.toThrow("El usuario designado no está activo");
  }));

  it("deja la evidencia del cambio y avisa a quien entra y a quien sale", () => revertida(sql, async (tx) => {
    const elaborador = await usuarioDePrueba(tx, { rol: "consulta" });
    const t = await tramiteEn(tx, "elaboracion", { elaborador });
    const nuevo = await usuarioDePrueba(tx, { rol: "consulta" });
    await reasignarEn(tx, t.admin, t.tramiteId, "elaboracion", 1, { papel: "elaborador", usuarioId: nuevo.usuarioId, motivo: "Cambió de área." });
    const [evento] = await eventosDe(tx, t.tramiteId, "reasignar");
    expect(evento.detalle).toEqual({
      papel: "elaborador",
      de: { id: elaborador.usuarioId, nombre: elaborador.nombre },
      a: { id: nuevo.usuarioId, nombre: nuevo.nombre },
      venceEn: null,
      motivo: "Cambió de área.",
    });
    const [auditoria] = await tx`SELECT detalle FROM auditoria WHERE accion = 'tramite_reasignar' AND entidad_id = ${t.tramiteId}`;
    expect(auditoria.detalle).toMatchObject({ papel: "elaborador", de: "elaboracion", hacia: "elaboracion", sale: { id: elaborador.usuarioId }, a: { id: nuevo.usuarioId } });
    expect((await avisosDe(tx, nuevo.usuarioId, t.tramiteId)).at(-1)).toMatchObject({
      tipo: "tramite.reasignado",
      titulo: expect.stringMatching(/ahora le corresponde elaborar/),
      enlace: `/tramites/${t.tramiteId}`,
    });
    expect((await avisosDe(tx, elaborador.usuarioId, t.tramiteId)).at(-1)).toMatchObject({
      tipo: "tramite.reasignado",
      titulo: expect.stringMatching(/ya no le corresponde elaborar/),
    });
  }));

  it("quien sale ya no escribe en la versión", () => revertida(sql, async (tx) => {
    const elaborador = await usuarioDePrueba(tx, { rol: "consulta" });
    const t = await tramiteEn(tx, "elaboracion", { elaborador });
    const nuevo = await usuarioDePrueba(tx, { rol: "consulta" });
    await reasignarEn(tx, t.admin, t.tramiteId, "elaboracion", 1, { papel: "elaborador", usuarioId: nuevo.usuarioId });
    await expect(guardarControlCambios(t.tramiteId, elaborador, "Se ajusta la sección dos.", { sql: tx })).rejects.toThrow(ErrorTramite);
    await guardarControlCambios(t.tramiteId, nuevo, "Se ajusta la sección dos.", { sql: tx });
  }));

  it.each([
    ["elaborador", "revision"],
    ["elaborador", "aprobacion"],
    ["revisor", "aprobacion"],
    ["aprobador", "publicacion"],
  ] as const)("no se reasigna %s en %s: su paso ya pasó", (papel, etapa) => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, etapa);
    try {
      const nuevo = await usuarioDePrueba(tx, { rol: "lider_proceso" });
      await expect(reasignarEn(tx, t.admin, t.tramiteId, etapa, 1, { papel, usuarioId: nuevo.usuarioId }))
        .rejects.toThrow("Ese papel no se puede reasignar en esta etapa");
    } finally {
      await t.limpiar();
    }
  }));

  it.each(["elaboracion", "revision", "aprobacion"] as const)("el aprobador se reasigna en %s, con el rol que pide el documento", (etapa) => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, etapa);
    try {
      const otroAdmin = await sesionAdmin(tx);
      await reasignarEn(tx, t.admin, t.tramiteId, etapa, 1, { papel: "aprobador", usuarioId: otroAdmin.usuarioId });
      const [fila] = await tx`SELECT aprobador_id FROM tramites WHERE id = ${t.tramiteId}`;
      expect(fila.aprobador_id).toBe(otroAdmin.usuarioId);
      const gerente = await sesionDe(tx, "gerente");
      await expect(reasignarEn(tx, t.admin, t.tramiteId, etapa, 1, { papel: "aprobador", usuarioId: gerente.usuarioId }))
        .rejects.toThrow("Quien aprueba debe ser Administrador del SGC");
    } finally {
      await t.limpiar();
    }
  }));

  it("el revisor se reasigna en revisión; no borra lo ya firmado", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      const nuevo = await usuarioDePrueba(tx, { rol: "lider_proceso" });
      await reasignarEn(tx, t.admin, t.tramiteId, "revision", 1, { papel: "revisor", usuarioId: nuevo.usuarioId });
      const firmas = await tx`SELECT firma FROM firmas WHERE tramite_id = ${t.tramiteId}`;
      expect(firmas.map((f) => f.firma)).toEqual(["elaboro"]);
      const consulta = await usuarioDePrueba(tx, { rol: "consulta" });
      await expect(reasignarEn(tx, t.admin, t.tramiteId, "revision", 1, { papel: "revisor", usuarioId: consulta.usuarioId }))
        .rejects.toThrow("Quien revisa debe ser Administrador del SGC o Líder de proceso");
    } finally {
      await t.limpiar();
    }
  }));

  it("la autoridad es la del tipo del documento: un documento estratégico pide Gerencia", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    await tx`UPDATE documentos SET tipo_id = (SELECT id FROM tipos_documento WHERE sigla = 'PO')
      WHERE id = (SELECT documento_id FROM tramites WHERE id = ${t.tramiteId})`;
    await expect(reasignarEn(tx, t.admin, t.tramiteId, "elaboracion", 1, { papel: "aprobador", usuarioId: t.admin.usuarioId }))
      .rejects.toThrow("Quien aprueba debe tener el rol Gerencia");
    const gerente = await sesionDe(tx, "gerente");
    await reasignarEn(tx, t.admin, t.tramiteId, "elaboracion", 1, { papel: "aprobador", usuarioId: gerente.usuarioId });
  }));

  it("en una eliminación solo hay aprobador, y quien pidió no aprueba", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aprobacion", { tipo: "eliminar" });
    const lider = await sesionDe(tx, "lider.gth");
    await expect(reasignarEn(tx, t.admin, t.tramiteId, "aprobacion", 0, { papel: "revisor", usuarioId: lider.usuarioId }))
      .rejects.toThrow("Ese papel no se puede reasignar en esta etapa");
    const otroAdmin = await sesionAdmin(tx);
    await reasignarEn(tx, t.admin, t.tramiteId, "aprobacion", 0, { papel: "aprobador", usuarioId: otroAdmin.usuarioId });
    const [fila] = await tx`SELECT aprobador_id FROM tramites WHERE id = ${t.tramiteId}`;
    expect(fila.aprobador_id).toBe(otroAdmin.usuarioId);
  }));

  it.each(["visto_bueno", "aceptacion"] as const)("en %s no hay designados: solo cabe cambiar la fecha límite", (etapa) => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, etapa);
    const nuevo = await usuarioDePrueba(tx, { rol: "consulta" });
    await expect(reasignarEn(tx, t.admin, t.tramiteId, etapa, 0, { papel: "elaborador", usuarioId: nuevo.usuarioId }))
      .rejects.toThrow("Ese papel no se puede reasignar en esta etapa");
    await reasignarEn(tx, t.admin, t.tramiteId, etapa, 0, { venceEn: "2026-12-01" });
    const [fila] = await tx`SELECT vence_en FROM tramites WHERE id = ${t.tramiteId}`;
    expect(fila.vence_en).toEqual(finDeFecha("2026-12-01", "America/Bogota"));
    const [evento] = await eventosDe(tx, t.tramiteId, "reasignar");
    expect(evento.detalle).toEqual({ papel: null, de: null, a: null, venceEn: "2026-12-01", motivo: "Se reorganiza el equipo." });
  }));

  it("sin fecha nueva conserva la que había; con una, vence al final de ese día", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    const [antes] = await tx`SELECT vence_en FROM tramites WHERE id = ${t.tramiteId}`;
    const nuevo = await usuarioDePrueba(tx, { rol: "consulta" });
    await reasignarEn(tx, t.admin, t.tramiteId, "elaboracion", 1, { papel: "elaborador", usuarioId: nuevo.usuarioId });
    const [conservada] = await tx`SELECT vence_en FROM tramites WHERE id = ${t.tramiteId}`;
    expect(conservada.vence_en).toEqual(antes.vence_en);
    await reasignarEn(tx, t.admin, t.tramiteId, "elaboracion", 1, { papel: "elaborador", venceEn: "2026-11-05" });   // hoy aún sirve
    const [hoy] = await tx`SELECT vence_en FROM tramites WHERE id = ${t.tramiteId}`;
    expect(hoy.vence_en).toEqual(new Date("2026-11-06T04:59:59.999Z"));
    await expect(reasignarEn(tx, t.admin, t.tramiteId, "elaboracion", 1, { papel: "elaborador", venceEn: "2026-11-04" }))
      .rejects.toThrow("La fecha límite no puede ser anterior a hoy");
  }));

  it("la fecha se cambia en cualquier etapa de trabajo", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion");
    try {
      await reasignarEn(tx, t.admin, t.tramiteId, "publicacion", 1, { venceEn: "2026-12-01" });
      const [fila] = await tx`SELECT vence_en FROM tramites WHERE id = ${t.tramiteId}`;
      expect(fila.vence_en).toEqual(finDeFecha("2026-12-01", "America/Bogota"));
    } finally {
      await t.limpiar();
    }
  }));

  it.each<[string, Datos, string]>([
    ["sin persona ni fecha", { papel: "elaborador" }, "Elija a la persona o la fecha límite"],
    ["persona sin papel", { usuarioId: 1 }, "Elija el papel"],
    ["sin motivo", { venceEn: "2026-12-01", motivo: " " }, "Escriba el motivo"],
  ])("%s no procede", (_nombre, datos, mensaje) => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    await expect(reasignarEn(tx, t.admin, t.tramiteId, "elaboracion", 1, datos)).rejects.toThrow(mensaje);
  }));

  it("la misma persona no se reasigna", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    await expect(reasignarEn(tx, t.admin, t.tramiteId, "elaboracion", 1, { papel: "elaborador", usuarioId: t.elaborador.usuarioId }))
      .rejects.toThrow("Esa persona ya tiene ese papel");
  }));

  it("el solicitante no se cambia: no es un papel", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    await expect(reasignarEn(tx, t.admin, t.tramiteId, "elaboracion", 1, { papel: "solicitante", usuarioId: t.admin.usuarioId }))
      .rejects.toThrow("Ese papel no se puede reasignar en esta etapa");
  }));
});

describe("corregirDatosDeControl", () => {
  const enElaboracion = { etapa: "elaboracion", ronda: 1 } as const;

  const tituloDelDocumento = async (tx: TransactionSql, tramiteId: number): Promise<string> => {
    const [d] = await tx`SELECT d.titulo FROM documentos d JOIN tramites t ON t.documento_id = d.id WHERE t.id = ${tramiteId}`;
    return d.titulo;
  };

  it("en una modificación guarda el título en el trámite; el documento no cambia hasta publicar", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    const titulo = await tituloDelDocumento(tx, t.tramiteId);
    await corregirDatosDeControl(t.tramiteId, t.admin, { titulo: "Inducción general" }, enElaboracion, { sql: tx, ahora: new Date("2026-11-05T15:00:00Z") });
    const [fila] = await tx`SELECT titulo_propuesto, actualizado_en FROM tramites WHERE id = ${t.tramiteId}`;
    expect(fila.titulo_propuesto).toBe("Inducción general");
    expect(fila.actualizado_en).toEqual(new Date("2026-11-05T15:00:00Z"));
    expect(await tituloDelDocumento(tx, t.tramiteId)).toBe(titulo);
    const [evento] = await eventosDe(tx, t.tramiteId, "corregir_datos");
    expect(evento).toMatchObject({ ronda: 1, usuario_id: t.admin.usuarioId, detalle: { antes: { titulo }, despues: { titulo: "Inducción general" } } });
    const [auditoria] = await tx`SELECT usuario_id, detalle FROM auditoria WHERE accion = 'tramite_corregir_datos' AND entidad_id = ${t.tramiteId}`;
    expect(auditoria).toMatchObject({
      usuario_id: t.admin.usuarioId,
      detalle: { numero: expect.any(String), codigo: "GTH-PR-02", ronda: 1, antes: { titulo }, despues: { titulo: "Inducción general" } },
    });
  }));

  it("volver al título del documento deja el trámite sin título propuesto", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion", { tituloNuevo: "Otro título" });
    await corregirDatosDeControl(t.tramiteId, t.admin, { titulo: await tituloDelDocumento(tx, t.tramiteId) }, enElaboracion, { sql: tx });
    const [fila] = await tx`SELECT titulo_propuesto FROM tramites WHERE id = ${t.tramiteId}`;
    expect(fila.titulo_propuesto).toBeNull();
  }));

  it.each<[string, Datos]>([
    ["el código", { codigo: "GTH-PR-99" }],
    ["el tipo", { tipoDocumentoId: 1 }],
  ])("en una modificación no se corrige %s", (_nombre, datos) => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    const intento = corregirDatosDeControl(t.tramiteId, t.admin, datos, enElaboracion, { sql: tx });
    await expect(intento).rejects.toThrow(ErrorTramite);
    await expect(intento).rejects.toThrow("En una modificación solo se corrige el título");
  }));

  it.each(["aprobacion", "publicacion"] as const)("en %s los datos quedan fijos", (etapa) => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, etapa);
    try {
      const intento = corregirDatosDeControl(t.tramiteId, t.admin, { titulo: "Otro título" }, { etapa, ronda: 1 }, { sql: tx });
      await expect(intento).rejects.toThrow(ErrorTramite);
      await expect(intento).rejects.toThrow("Desde la aprobación los datos del documento quedan fijos");
    } finally {
      await t.limpiar();
    }
  }));

  it("en revisión también se corrige, sin mover el trámite", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      await corregirDatosDeControl(t.tramiteId, t.admin, { titulo: "Inducción general" }, { etapa: "revision", ronda: 1 }, { sql: tx });
      const [fila] = await tx`SELECT titulo_propuesto, etapa, ronda FROM tramites WHERE id = ${t.tramiteId}`;
      expect(fila).toMatchObject({ titulo_propuesto: "Inducción general", etapa: "revision", ronda: 1 });
    } finally {
      await t.limpiar();
    }
  }));

  it("compara la etapa y la ronda que vio la persona", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    await expect(corregirDatosDeControl(t.tramiteId, t.admin, { titulo: "Otro título" }, { etapa: "revision", ronda: 1 }, { sql: tx }))
      .rejects.toThrow("cambió mientras lo tenía abierto");
    await expect(corregirDatosDeControl(t.tramiteId, t.admin, { titulo: "Otro título" }, { etapa: "elaboracion", ronda: 2 }, { sql: tx }))
      .rejects.toThrow("cambió mientras lo tenía abierto");
  }));

  it("exige tramites.gestionar", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    await expect(corregirDatosDeControl(t.tramiteId, t.elaborador, { titulo: "Otro título" }, enElaboracion, { sql: tx }))
      .rejects.toThrow("Sin permiso para esta acción");
  }));

  it("sin nada distinto no escribe", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    await expect(corregirDatosDeControl(t.tramiteId, t.admin, { titulo: await tituloDelDocumento(tx, t.tramiteId) }, enElaboracion, { sql: tx }))
      .rejects.toThrow("No hay cambios que guardar");
    expect(await eventosDe(tx, t.tramiteId, "corregir_datos")).toHaveLength(0);
  }));

  describe("en una creación", () => {
    const documentoDe = async (tx: TransactionSql, tramiteId: number) => {
      const [d] = await tx`SELECT d.id, d.titulo, d.codigo, d.tipo_id, t.tipo_documento_id
        FROM documentos d JOIN tramites t ON t.documento_id = d.id WHERE t.id = ${tramiteId}`;
      return d;
    };

    it("cambia título, código y tipo del documento, con el antes y el después", () => revertida(sql, async (tx) => {
      const t = await tramiteEn(tx, "elaboracion", { tipo: "crear", codigo: "CEX-FO-07" });
      const [tipo] = await tx`SELECT id, nombre FROM tipos_documento WHERE sigla = 'RG'`;
      await corregirDatosDeControl(t.tramiteId, t.admin, { titulo: "Registro de quejas", codigo: "CEX-RG-07", tipoDocumentoId: Number(tipo.id) }, enElaboracion, { sql: tx });
      expect(await documentoDe(tx, t.tramiteId)).toMatchObject({ titulo: "Registro de quejas", codigo: "CEX-RG-07", tipo_id: tipo.id, tipo_documento_id: tipo.id });
      const [evento] = await eventosDe(tx, t.tramiteId, "corregir_datos");
      expect(evento.detalle).toEqual({
        antes: { titulo: "Formato de prueba del flujo", codigo: "CEX-FO-07", tipo: "Formato" },
        despues: { titulo: "Registro de quejas", codigo: "CEX-RG-07", tipo: tipo.nombre },
      });
    }));

    it("el evento solo lleva lo que cambió", () => revertida(sql, async (tx) => {
      const t = await tramiteEn(tx, "elaboracion", { tipo: "crear", codigo: "CEX-FO-07" });
      await corregirDatosDeControl(t.tramiteId, t.admin, { titulo: "Formato nuevo", codigo: "CEX-FO-07" }, enElaboracion, { sql: tx });
      const [evento] = await eventosDe(tx, t.tramiteId, "corregir_datos");
      expect(evento.detalle).toEqual({ antes: { titulo: "Formato de prueba del flujo" }, despues: { titulo: "Formato nuevo" } });
    }));

    it("el código debe cumplir el formato", () => revertida(sql, async (tx) => {
      const t = await tramiteEn(tx, "elaboracion", { tipo: "crear", codigo: "CEX-FO-07" });
      await expect(corregirDatosDeControl(t.tramiteId, t.admin, { codigo: "NO SIRVE" }, enElaboracion, { sql: tx }))
        .rejects.toThrow("El código no cumple el formato configurado (ej. CEX-FO-08)");
    }));

    it("un código repetido dice cuál sigue, y la transacción sigue viva", () => revertida(sql, async (tx) => {
      const t = await tramiteEn(tx, "elaboracion", { tipo: "crear", codigo: "CEX-FO-07" });
      await tx`INSERT INTO documentos (codigo, titulo, tipo_id)
        SELECT 'CEX-FO-09', 'Otro', id FROM tipos_documento WHERE sigla = 'FO'`;
      await expect(corregirDatosDeControl(t.tramiteId, t.admin, { codigo: "CEX-FO-09" }, enElaboracion, { sql: tx }))
        .rejects.toThrow("Ese código ya existe. El siguiente disponible es CEX-FO-10");
      expect((await documentoDe(tx, t.tramiteId)).codigo).toBe("CEX-FO-07");
    }));

    it("un tipo inactivo no se elige", () => revertida(sql, async (tx) => {
      const t = await tramiteEn(tx, "elaboracion", { tipo: "crear", codigo: "CEX-FO-07" });
      const [tipo] = await tx`UPDATE tipos_documento SET activo = false WHERE sigla = 'RG' RETURNING id`;
      await expect(corregirDatosDeControl(t.tramiteId, t.admin, { tipoDocumentoId: Number(tipo.id) }, enElaboracion, { sql: tx }))
        .rejects.toThrow("El tipo de documento no existe o está inactivo");
    }));

    it("un tipo de otra autoridad exige a quien corresponde aprobar", () => revertida(sql, async (tx) => {
      const t = await tramiteEn(tx, "elaboracion", { tipo: "crear", codigo: "CEX-FO-07" });
      const [tipo] = await tx`SELECT id FROM tipos_documento WHERE sigla = 'PO'`;
      await expect(corregirDatosDeControl(t.tramiteId, t.admin, { tipoDocumentoId: Number(tipo.id) }, enElaboracion, { sql: tx }))
        .rejects.toThrow("Quien aprueba debe tener el rol Gerencia");
      expect((await documentoDe(tx, t.tramiteId)).tipo_id).not.toBe(tipo.id);
    }));

    it("un designado desactivado no impide corregir el tipo", () => revertida(sql, async (tx) => {
      const elaborador = await usuarioDePrueba(tx, { rol: "consulta" });
      const t = await tramiteEn(tx, "elaboracion", { tipo: "crear", codigo: "CEX-FO-07", elaborador });
      await tx`UPDATE usuarios SET activo = false WHERE id = ${elaborador.usuarioId}`;
      const [tipo] = await tx`SELECT id FROM tipos_documento WHERE sigla = 'RG'`;
      await corregirDatosDeControl(t.tramiteId, t.admin, { tipoDocumentoId: Number(tipo.id) }, enElaboracion, { sql: tx });
      expect((await documentoDe(tx, t.tramiteId)).tipo_id).toBe(tipo.id);
    }));
  });
});
