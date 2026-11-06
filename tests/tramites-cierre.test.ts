/**
 * Aprobación, publicación y eliminación firmadas: la regla de negocio 1 dentro del flujo.
 * Corre contra la demo ya sembrada, dentro de una transacción que se revierte.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { afterAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import type { TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { listarFirmas } from "@/db/consultas/firmas";
import {
  cerrarObservacion,
  criteriosNoCumplen,
  guardarVerificacion,
  listarItemsVerificacion,
  listarObservaciones,
  responderObservacion,
} from "@/db/consultas/revision";
import { lideresDeProcesosDelDocumento } from "@/db/consultas/tramites";
import { ErrorTramite, MANEJADORES, VALIDADORES, transicionar, type OpcionesFlujo, type SesionFlujo } from "@/db/consultas/tramites-flujo";
import { resolverRutaAlmacen } from "@/lib/almacen";
import type { Verificador } from "@/lib/firma";
import { huellaDeCriterios } from "@/lib/tramites/criterios";
import type { Etapa } from "@/lib/tramites/tipos";
import { opc, sesionAdmin, sesionDe, tramiteEn, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

type Trayecto = Awaited<ReturnType<typeof tramiteEn>>;

const NO_COINCIDE = "El archivo en el almacén no coincide con el aprobado. No se publicó.";

function verificadorEspia() {
  return vi.fn<Verificador>(async () => ({ ok: true, metodo: "clave" }));
}

async function rutaDelPrincipal(tx: TransactionSql, versionId: number | null): Promise<string> {
  const [a] = await tx`SELECT ruta FROM archivos WHERE version_id = ${versionId} AND rol = 'principal'`;
  const absoluta = resolverRutaAlmacen(a.ruta);
  if (!absoluta) throw new Error(`Ruta inválida: ${a.ruta}`);
  return absoluta;
}

const firmando = (t: Trayecto, accion: "aprobar" | "aprobar_y_publicar", etapa: Etapa, ronda = t.ronda) =>
  ({ tramiteId: t.tramiteId, accion, etapaEsperada: etapa, rondaEsperada: ronda, datos: { concepto: "Aprobado." }, credenciales: { clave: "x" } }) as const;

const publicar = (t: Trayecto, ronda = t.ronda) =>
  ({ tramiteId: t.tramiteId, accion: "publicar", etapaEsperada: "publicacion", rondaEsperada: ronda, credenciales: { clave: "x" } }) as const;

async function fallaSinGastarLaFirma(
  tx: TransactionSql,
  sesion: SesionFlujo,
  entrada: Parameters<typeof transicionar>[1],
  error: string | RegExp,
  opciones: OpcionesFlujo = opc(tx),
) {
  const verificar = verificadorEspia();
  await expect(tx.savepoint(() => transicionar(sesion, entrada, { ...opciones, verificar }))).rejects.toThrow(error);
  expect(verificar).not.toHaveBeenCalled();
}

const avisos = (tx: TransactionSql, tramiteId: number, tipo: string) =>
  tx`SELECT usuario_id, titulo FROM notificaciones WHERE entidad = 'tramite' AND entidad_id = ${tramiteId} AND tipo = ${tipo}`;

/** Sin `acta`: los datos congelados del acta se prueban en acta.test.ts. */
const ultimoDetalle = async (tx: TransactionSql, tramiteId: number, tipo: string) => {
  const detalle = (await tx`SELECT detalle FROM tramite_eventos WHERE tramite_id = ${tramiteId} AND tipo = ${tipo} ORDER BY id DESC LIMIT 1`)[0].detalle;
  delete detalle.acta;
  return detalle;
};

describe("aprobación", () => {
  it("si la autoridad del tipo cambió con el trámite abierto, quien ya no corresponde no firma; se reasigna y el nuevo aprueba", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aprobacion");
    try {
      await tx`UPDATE tipos_documento SET autoridad = 'estrategico' WHERE id = (SELECT tipo_id FROM documentos WHERE codigo = ${t.codigo})`;
      const mensaje = "Quien aprueba debe tener el rol Gerencia. Pida reasignar al aprobador.";
      await fallaSinGastarLaFirma(tx, t.aprobador, firmando(t, "aprobar", "aprobacion"), mensaje);
      await fallaSinGastarLaFirma(tx, t.aprobador, firmando(t, "aprobar_y_publicar", "aprobacion"), mensaje);

      const gerente = await sesionDe(tx, "gerente");
      await transicionar(t.admin, { tramiteId: t.tramiteId, accion: "reasignar", etapaEsperada: "aprobacion", rondaEsperada: t.ronda,
        datos: { motivo: "Cambió la autoridad del tipo.", papel: "aprobador", usuarioId: gerente.usuarioId } }, opc(tx));
      expect(await transicionar(gerente, firmando(t, "aprobar", "aprobacion"), opc(tx))).toEqual({ etapa: "publicacion", ronda: t.ronda });

      // Aprobada con la autoridad vigente entonces: publicar no la vuelve a exigir.
      await tx`UPDATE tipos_documento SET autoridad = 'operativo' WHERE id = (SELECT tipo_id FROM documentos WHERE codigo = ${t.codigo})`;
      expect(await transicionar(t.admin, publicar(t), opc(tx))).toMatchObject({ etapa: "publicado" });
    } finally { await t.limpiar(); }
  }));

  describe("si el rol del revisor cambió después de revisar", () => {
    const cambiarRol = (tx: TransactionSql, persona: SesionFlujo) => tx`UPDATE usuarios SET rol = 'consulta' WHERE id = ${persona.usuarioId}`;

    it("aprobar sigue firmando: su paso ya se dio", () => revertida(sql, async (tx) => {
      const t = await tramiteEn(tx, "aprobacion");
      try {
        await cambiarRol(tx, t.revisor);
        expect(await transicionar(t.aprobador, firmando(t, "aprobar", "aprobacion"), opc(tx))).toEqual({ etapa: "publicacion", ronda: t.ronda });
      } finally { await t.limpiar(); }
    }));

    it("aprobar y publicar también", () => revertida(sql, async (tx) => {
      const t = await tramiteEn(tx, "aprobacion");
      try {
        await cambiarRol(tx, t.revisor);
        expect(await transicionar(t.aprobador, firmando(t, "aprobar_y_publicar", "aprobacion"), opc(tx))).toMatchObject({ etapa: "publicado" });
      } finally { await t.limpiar(); }
    }));

    it("reasignar al aprobador también: se mira solo el rol de quien entra", () => revertida(sql, async (tx) => {
      const t = await tramiteEn(tx, "aprobacion");
      try {
        await cambiarRol(tx, t.revisor);
        const reasignar = (usuarioId: number) => transicionar(t.admin, { tramiteId: t.tramiteId, accion: "reasignar", etapaEsperada: "aprobacion", rondaEsperada: t.ronda,
          datos: { motivo: "Se reorganiza el equipo.", papel: "aprobador", usuarioId } }, opc(tx));
        const lider = await usuarioDePrueba(tx, { rol: "lider_proceso" });
        await expect(tx.savepoint(() => reasignar(lider.usuarioId))).rejects.toThrow("Quien aprueba debe ser Administrador del SGC");
        const otro = await sesionAdmin(tx);
        await reasignar(otro.usuarioId);
        expect(await transicionar(otro, firmando(t, "aprobar", "aprobacion"), opc(tx))).toEqual({ etapa: "publicacion", ronda: t.ronda });
      } finally { await t.limpiar(); }
    }));

    it("en revisión el paso sigue pendiente: su rol sí cuenta, y se le reasigna", () => revertida(sql, async (tx) => {
      const t = await tramiteEn(tx, "revision");
      try {
        await cambiarRol(tx, t.revisor);
        const reasignar = (datos: Record<string, unknown>) => transicionar(t.admin, { tramiteId: t.tramiteId, accion: "reasignar", etapaEsperada: "revision", rondaEsperada: t.ronda,
          datos: { motivo: "Se reorganiza el equipo.", ...datos } }, opc(tx));
        const otro = await sesionAdmin(tx);
        await expect(tx.savepoint(() => reasignar({ papel: "aprobador", usuarioId: otro.usuarioId })))
          .rejects.toThrow("Quien revisa debe ser Administrador del SGC o Líder de proceso");
        const relevo = await usuarioDePrueba(tx, { rol: "lider_proceso" });
        expect(await reasignar({ papel: "revisor", usuarioId: relevo.usuarioId })).toEqual({ etapa: "revision", ronda: t.ronda });
      } finally { await t.limpiar(); }
    }));
  });

  it("aprobar lleva a publicación, guarda el concepto y avisa a los administradores", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aprobacion");
    try {
      const r = await transicionar(t.aprobador, { ...firmando(t, "aprobar", "aprobacion"), datos: { concepto: "  Procede sin ajustes.  " } }, opc(tx));
      expect(r).toEqual({ etapa: "publicacion", ronda: t.ronda });
      expect(await ultimoDetalle(tx, t.tramiteId, "aprobar")).toEqual({ concepto: "Procede sin ajustes." });
      const firmas = (await listarFirmas(t.tramiteId, { sql: tx })).filter((f) => f.firma === "aprobo");
      expect(firmas).toHaveLength(1);
      const [v] = await tx`SELECT estado FROM documento_versiones WHERE id = ${t.versionId}`;
      expect(v.estado).toBe("borrador");
      const destinatarios = (await avisos(tx, t.tramiteId, "tramite.paso")).filter((a) => /publicar/.test(a.titulo)).map((a) => Number(a.usuario_id));
      expect(destinatarios).toContain(t.admin.usuarioId);
      expect(destinatarios).not.toContain(t.aprobador.usuarioId);
    } finally { await t.limpiar(); }
  }));

  it("sin un concepto válido no se pide la firma", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aprobacion");
    try {
      for (const concepto of ["ok", "   ", "x".repeat(2001), undefined]) {
        await fallaSinGastarLaFirma(tx, t.aprobador, { ...firmando(t, "aprobar", "aprobacion"), datos: { concepto } }, /concepto/);
        await fallaSinGastarLaFirma(tx, t.aprobador, { ...firmando(t, "aprobar_y_publicar", "aprobacion"), datos: { concepto } }, /concepto/);
      }
    } finally { await t.limpiar(); }
  }));

  it("el aprobador devuelve, y el documento vuelve a pasar por revisión", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aprobacion");
    try {
      const r = await transicionar(t.aprobador, { tramiteId: t.tramiteId, accion: "devolver_aprobacion", etapaEsperada: "aprobacion", rondaEsperada: t.ronda,
        datos: { observaciones: ["Falta citar la resolución vigente."] } }, opc(tx));
      expect(r).toEqual({ etapa: "elaboracion", ronda: t.ronda + 1 });
      const [o] = await tx`SELECT origen, estado FROM tramite_observaciones WHERE tramite_id = ${t.tramiteId} ORDER BY id DESC LIMIT 1`;
      expect(o).toMatchObject({ origen: "aprobacion", estado: "abierta" });
      expect(await ultimoDetalle(tx, t.tramiteId, "devolver_aprobacion")).toEqual({ observaciones: [1] });
      expect((await avisos(tx, t.tramiteId, "tramite.devuelto")).map((a) => Number(a.usuario_id))).toEqual([t.elaborador.usuarioId]);
    } finally { await t.limpiar(); }
  }));

  it("devolver exige de 1 a 10 observaciones válidas y no deja ninguna a medias", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aprobacion");
    try {
      const devolver = (observaciones: unknown) =>
        tx.savepoint(() => transicionar(t.aprobador, { tramiteId: t.tramiteId, accion: "devolver_aprobacion", etapaEsperada: "aprobacion", rondaEsperada: t.ronda, datos: { observaciones } }, opc(tx)));
      for (const lista of [undefined, [], "Texto suelto de más.", Array(11).fill("Observación repetida."), ["Observación válida.", "no"]]) {
        await expect(devolver(lista)).rejects.toBeInstanceOf(ErrorTramite);
      }
      const [{ total }] = await tx`SELECT count(*)::int AS total FROM tramite_observaciones WHERE tramite_id = ${t.tramiteId}`;
      expect(total).toBe(0);
      await expect(devolver(Array(10).fill("Observación repetida."))).resolves.toEqual({ etapa: "elaboracion", ronda: t.ronda + 1 });
    } finally { await t.limpiar(); }
  }));

  it("negar la eliminación cierra en rechazado con su motivo, y el documento sigue vigente", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aprobacion", { tipo: "eliminar" });
    const negar = (motivo?: string) =>
      transicionar(t.aprobador, { tramiteId: t.tramiteId, accion: "negar_eliminacion", etapaEsperada: "aprobacion", rondaEsperada: 0, datos: { motivo } }, opc(tx));
    await expect(tx.savepoint(() => negar("  "))).rejects.toThrow("Escriba el motivo");
    expect((await negar("El procedimiento sigue en uso.")).etapa).toBe("rechazado");
    const [fila] = await tx`SELECT numero, motivo_cierre, cerrado_en FROM tramites WHERE id = ${t.tramiteId}`;
    expect(fila.motivo_cierre).toBe("El procedimiento sigue en uso.");
    expect(fila.cerrado_en).not.toBeNull();
    const [v] = await tx`SELECT estado FROM documento_versiones WHERE id = ${t.versionId}`;
    expect(v.estado).toBe("vigente");
    expect(await listarFirmas(t.tramiteId, { sql: tx })).toEqual([]);
    const resueltos = await avisos(tx, t.tramiteId, "tramite.resuelto");
    expect(resueltos.find((a) => a.titulo === `Eliminación ${fila.numero} negada`)?.usuario_id).toBeDefined();
    expect(resueltos.filter((a) => a.titulo === `Eliminación ${fila.numero} negada`).map((a) => Number(a.usuario_id))).toEqual([t.elaborador.usuarioId]);
  }));

  it("devolver no aplica a una eliminación ni negar a una modificación", () => revertida(sql, async (tx) => {
    const e = await tramiteEn(tx, "aprobacion", { tipo: "eliminar" });
    await expect(tx.savepoint(() => transicionar(e.aprobador, { tramiteId: e.tramiteId, accion: "devolver_aprobacion", etapaEsperada: "aprobacion", rondaEsperada: 0, datos: { observaciones: ["Observación válida."] } }, opc(tx))))
      .rejects.toThrow("Esta acción no corresponde a este tipo de solicitud");
    const m = await tramiteEn(tx, "aprobacion");
    try {
      await expect(tx.savepoint(() => transicionar(m.aprobador, { tramiteId: m.tramiteId, accion: "negar_eliminacion", etapaEsperada: "aprobacion", rondaEsperada: m.ronda, datos: { motivo: "Motivo suficiente." } }, opc(tx))))
        .rejects.toThrow("Esta acción no corresponde a este tipo de solicitud");
    } finally { await m.limpiar(); }
  }));
});

describe("criterios que no cumplen en la aprobación", () => {
  const NOTA = "Se ajustará con la guía de redacción.";
  const FALTA_CONFIRMAR = "Confirme que aprueba a pesar de los criterios que no cumplen";
  const LISTA_CAMBIO = "La lista cambió mientras tenía abierto el diálogo. Recargue la página.";

  const concepto = (t: Trayecto, confirmaNoCumple: string) =>
    ({ tramiteId: t.tramiteId, accion: "concepto_favorable", etapaEsperada: "revision", rondaEsperada: t.ronda,
      datos: { concepto: "Cumple, con un criterio aceptado.", confirmaNoCumple }, credenciales: { clave: "x" } }) as const;

  /** Responde la lista en revisión: cumple, salvo `itemId`, que no cumple con su nota. */
  async function responderCon(tx: TransactionSql, t: Trayecto, itemId: number) {
    const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
    await guardarVerificacion(t.tramiteId, t.revisor,
      items.map((i) => (i.id === itemId ? { itemId: i.id, resultado: "no_cumple" as const, nota: NOTA } : { itemId: i.id, resultado: "cumple" as const })),
      { etapa: "revision", ronda: t.ronda }, { sql: tx });
  }

  /** Lleva a aprobación un trámite con un criterio en «No cumple» que el revisor aceptó. */
  async function aprobacionConCriterio(tx: TransactionSql) {
    const t = await tramiteEn(tx, "revision");
    try {
      const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
      const criterio = items.find((i) => !i.critico)!;
      await responderCon(tx, t, criterio.id);
      const confirmaNoCumple = huellaDeCriterios(await criteriosNoCumplen(t.tramiteId, t.ronda, { sql: tx }));
      await transicionar(t.revisor, concepto(t, confirmaNoCumple), opc(tx));
      return { t, criterio, confirmaNoCumple };
    } catch (err) {
      await t.limpiar();
      throw err;
    }
  }

  const conHuella = (entrada: ReturnType<typeof firmando>, confirmaNoCumple: string) =>
    ({ ...entrada, datos: { ...entrada.datos, confirmaNoCumple } });

  it("aprobar exige confirmar los criterios, antes de la firma", () => revertida(sql, async (tx) => {
    const { t, confirmaNoCumple } = await aprobacionConCriterio(tx);
    try {
      const entrada = firmando(t, "aprobar", "aprobacion");
      await fallaSinGastarLaFirma(tx, t.aprobador, entrada, FALTA_CONFIRMAR);
      await fallaSinGastarLaFirma(tx, t.aprobador, conHuella(entrada, "0".repeat(64)), LISTA_CAMBIO);
      await expect(transicionar(t.aprobador, conHuella(entrada, confirmaNoCumple), opc(tx))).resolves.toEqual({ etapa: "publicacion", ronda: t.ronda });
    } finally { await t.limpiar(); }
  }));

  it("aprobar y publicar también", () => revertida(sql, async (tx) => {
    const { t, confirmaNoCumple } = await aprobacionConCriterio(tx);
    try {
      const entrada = firmando(t, "aprobar_y_publicar", "aprobacion");
      await fallaSinGastarLaFirma(tx, t.aprobador, entrada, FALTA_CONFIRMAR);
      await fallaSinGastarLaFirma(tx, t.aprobador, conHuella(entrada, "0".repeat(64)), LISTA_CAMBIO);
      await expect(transicionar(t.aprobador, conHuella(entrada, confirmaNoCumple), opc(tx))).resolves.toEqual({ etapa: "publicado", ronda: t.ronda });
    } finally { await t.limpiar(); }
  }));

  it("una eliminación no pide confirmación", () => revertida(sql, async (tx) => {
    const aprobada = await tramiteEn(tx, "aprobacion", { tipo: "eliminar" });
    await expect(transicionar(aprobada.aprobador, firmando(aprobada, "aprobar", "aprobacion"), opc(tx))).resolves.toMatchObject({ etapa: "publicacion" });
    expect(await ultimoDetalle(tx, aprobada.tramiteId, "aprobar")).toEqual({ concepto: "Aprobado." });

    const ejecutada = await tramiteEn(tx, "aprobacion", { tipo: "eliminar" });
    await expect(transicionar(ejecutada.aprobador, firmando(ejecutada, "aprobar_y_publicar", "aprobacion"), opc(tx))).resolves.toMatchObject({ etapa: "eliminado" });
  }));

  it("la confirmación del aprobador queda en su evento", () => revertida(sql, async (tx) => {
    const aprobada = await aprobacionConCriterio(tx);
    const publicada = await aprobacionConCriterio(tx);
    try {
      const constancia = { noCumple: [{ texto: aprobada.criterio.texto, nota: NOTA }], confirmoNoCumple: true };
      await transicionar(aprobada.t.aprobador, conHuella(firmando(aprobada.t, "aprobar", "aprobacion"), aprobada.confirmaNoCumple), opc(tx));
      expect(await ultimoDetalle(tx, aprobada.t.tramiteId, "aprobar")).toEqual({ concepto: "Aprobado.", ...constancia });

      await transicionar(publicada.t.aprobador, conHuella(firmando(publicada.t, "aprobar_y_publicar", "aprobacion"), publicada.confirmaNoCumple), opc(tx));
      expect(await ultimoDetalle(tx, publicada.t.tramiteId, "aprobar_y_publicar")).toMatchObject({ concepto: "Aprobado.", ...constancia });
    } finally { await aprobada.t.limpiar(); await publicada.t.limpiar(); }
  }));

  it("sin criterios, el evento del aprobador no lleva constancia", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aprobacion");
    try {
      await transicionar(t.aprobador, firmando(t, "aprobar_y_publicar", "aprobacion"), opc(tx));
      const detalle = await ultimoDetalle(tx, t.tramiteId, "aprobar_y_publicar");
      expect(detalle).not.toHaveProperty("noCumple");
      expect(detalle).not.toHaveProperty("confirmoNoCumple");
    } finally { await t.limpiar(); }
  }));

  // Solo el concepto mira si el ítem es crítico (spec §5): ahí es donde una confirmación no debe bastar.
  it("el crítico sigue bloqueando aunque se confirme", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      const critico = (await listarItemsVerificacion({ sql: tx, soloActivos: true })).find((i) => i.critico)!;
      await responderCon(tx, t, critico.id);
      await fallaSinGastarLaFirma(tx, t.revisor, concepto(t, huellaDeCriterios([{ itemId: critico.id, nota: NOTA }])), "Hay un ítem crítico que no cumple");
    } finally { await t.limpiar(); }
  }));

  it("un ítem vuelto crítico después del concepto sigue a la vista del aprobador: confirma, y no bloquea", () => revertida(sql, async (tx) => {
    const { t, criterio, confirmaNoCumple } = await aprobacionConCriterio(tx);
    try {
      await tx`UPDATE lista_verificacion_items SET critico = true WHERE id = ${criterio.id}`;
      const entrada = firmando(t, "aprobar", "aprobacion");
      await fallaSinGastarLaFirma(tx, t.aprobador, entrada, FALTA_CONFIRMAR);
      await transicionar(t.aprobador, conHuella(entrada, confirmaNoCumple), opc(tx));
      expect(await ultimoDetalle(tx, t.tramiteId, "aprobar")).toMatchObject({ noCumple: [{ texto: criterio.texto, nota: NOTA }], confirmoNoCumple: true });
    } finally { await t.limpiar(); }
  }));
});

describe("quien elabora no aprueba", () => {
  it("si el aprobador resulta ser quien firmó «elaboró», ni aprobar ni aprobar y publicar piden la firma", () => revertida(sql, async (tx) => {
    const elaborador = await sesionAdmin(tx);
    const t = await tramiteEn(tx, "aprobacion", { elaborador, aprobador: await sesionDe(tx, "gerente") }); // un admin_sgc que elabora aprueba Gerencia
    try {
      await tx`UPDATE tramites SET aprobador_id = ${elaborador.usuarioId} WHERE id = ${t.tramiteId}`;
      await fallaSinGastarLaFirma(tx, elaborador, firmando(t, "aprobar", "aprobacion"), "Quien elabora no puede aprobar");
      await fallaSinGastarLaFirma(tx, elaborador, firmando(t, "aprobar_y_publicar", "aprobacion"), "Quien elabora no puede aprobar");
    } finally { await t.limpiar(); }
  }));

  it("si elabora un Admin SGC, otro Admin SGC tampoco firma: aprueba Gerencia, aunque el revisor haya cambiado de rol", () => revertida(sql, async (tx) => {
    const elaborador = await sesionAdmin(tx);
    const t = await tramiteEn(tx, "aprobacion", { elaborador, aprobador: await sesionDe(tx, "gerente") });
    try {
      await tx`UPDATE usuarios SET rol = 'consulta' WHERE id = ${t.revisor.usuarioId}`;
      const otro = await sesionAdmin(tx);
      await tx`UPDATE tramites SET aprobador_id = ${otro.usuarioId} WHERE id = ${t.tramiteId}`;
      await fallaSinGastarLaFirma(tx, otro, firmando(t, "aprobar", "aprobacion"), "Quien aprueba debe tener el rol Gerencia. Pida reasignar al aprobador.");
      await fallaSinGastarLaFirma(tx, otro, firmando(t, "aprobar_y_publicar", "aprobacion"), "Quien aprueba debe tener el rol Gerencia. Pida reasignar al aprobador.");
    } finally { await t.limpiar(); }
  }));
});

describe("publicación", () => {
  it("aprobar y publicar en un solo acto deja la versión vigente con sus datos de control", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aprobacion");                         // un procedimiento es operativo: aprueba un admin_sgc
    try {
      const [antes] = await tx`SELECT v.id, v.numero FROM documento_versiones v JOIN documentos d ON d.id = v.documento_id
        WHERE d.codigo = ${t.codigo} AND v.estado = 'vigente'`;
      const r = await transicionar(t.aprobador, { tramiteId: t.tramiteId, accion: "aprobar_y_publicar", etapaEsperada: "aprobacion", rondaEsperada: t.ronda,
        datos: { concepto: "Aprobado." }, credenciales: { clave: "x" } }, opc(tx));
      expect(r.etapa).toBe("publicado");
      const [v] = await tx`SELECT estado, origen_aprobacion, publicado_en, elaboro, reviso, aprobo, fecha_aprobacion::text AS fecha
        FROM documento_versiones WHERE id = ${t.versionId}`;
      expect(v).toMatchObject({ estado: "vigente", origen_aprobacion: "plataforma", fecha: "2026-11-05" });
      expect(v.publicado_en).not.toBeNull();
      expect(v.elaboro).toMatch(/ — /);                                  // «Nombre — Cargo»
      const [anterior] = await tx`SELECT estado FROM documento_versiones WHERE id = ${antes.id}`;
      expect(anterior.estado).toBe("obsoleto");
      const [{ vigentes }] = await tx`SELECT count(*)::int AS vigentes FROM documento_versiones v JOIN documentos d ON d.id = v.documento_id
        WHERE d.codigo = ${t.codigo} AND v.estado = 'vigente'`;
      expect(vigentes).toBe(1);
      const firmas = (await listarFirmas(t.tramiteId, { sql: tx })).filter((f) => f.ronda === t.ronda);
      expect(firmas.map((f) => f.firma)).toEqual(["elaboro", "reviso", "aprobo", "publico"]);
      expect(new Set(firmas.map((f) => f.hashSha256)).size).toBe(1);
      expect(await ultimoDetalle(tx, t.tramiteId, "aprobar_y_publicar")).toEqual({
        concepto: "Aprobado.", version: antes.numero + 1, obsoletas: [antes.numero], huella: firmas[0].hashSha256,
      });
      // Nadie queda esperando publicar lo que ya se publicó.
      expect((await avisos(tx, t.tramiteId, "tramite.paso")).filter((a) => /publicar/.test(a.titulo))).toHaveLength(0);
      expect((await avisos(tx, t.tramiteId, "tramite.cerrado")).length).toBeGreaterThan(0);
    } finally { await t.limpiar(); }
  }));

  it("un documento estratégico lo aprueba Gerencia y lo publica un Admin SGC", () => revertida(sql, async (tx) => {
    const gerente = await sesionDe(tx, "gerente");
    const t = await tramiteEn(tx, "aprobacion", { tipoDocumento: "CA", aprobador: gerente });
    try {
      const entrada = { tramiteId: t.tramiteId, etapaEsperada: "aprobacion", rondaEsperada: t.ronda, datos: { concepto: "Aprobado." }, credenciales: { clave: "x" } } as const;
      await expect(tx.savepoint(() => transicionar(gerente, { ...entrada, accion: "aprobar_y_publicar" }, opc(tx)))).rejects.toBeInstanceOf(ErrorTramite);
      expect((await transicionar(gerente, { ...entrada, accion: "aprobar" }, opc(tx))).etapa).toBe("publicacion");
      expect((await transicionar(t.admin, { tramiteId: t.tramiteId, accion: "publicar", etapaEsperada: "publicacion", rondaEsperada: t.ronda, credenciales: { clave: "x" } }, opc(tx))).etapa).toBe("publicado");
    } finally { await t.limpiar(); }
  }));

  it("publicar deja el detalle, la auditoría y los avisos a participantes y líderes", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion");
    try {
      await transicionar(t.admin, publicar(t), opc(tx));
      const [{ hash_sha256: huella }] = await tx`SELECT hash_sha256 FROM archivos WHERE version_id = ${t.versionId} AND rol = 'principal'`;
      const [v] = await tx`SELECT numero, documento_id FROM documento_versiones WHERE id = ${t.versionId}`;
      expect(await ultimoDetalle(tx, t.tramiteId, "publicar")).toEqual({ version: v.numero, obsoletas: [v.numero - 1], huella });
      const acciones = await tx`SELECT accion FROM auditoria WHERE entidad = 'documento_version' AND entidad_id = ${t.versionId}`;
      expect(acciones.map((a) => a.accion)).toContain("publicar_version");
      const lideres = await lideresDeProcesosDelDocumento(Number(v.documento_id), { sql: tx });
      const esperados = new Set([t.elaborador.usuarioId, t.revisor.usuarioId, t.aprobador.usuarioId, ...lideres]);
      const destinatarios = (await avisos(tx, t.tramiteId, "tramite.cerrado")).map((a) => Number(a.usuario_id));
      expect(destinatarios.toSorted()).toEqual([...esperados].toSorted());
      const [{ cerrado_en }] = await tx`SELECT cerrado_en FROM tramites WHERE id = ${t.tramiteId}`;
      expect(cerrado_en).not.toBeNull();
    } finally { await t.limpiar(); }
  }));

  it("las fechas heredadas son el día de cada firma en la zona, y la vigencia la hora de publicar", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aprobacion");
    try {
      // 23:30 del día 6 en Bogotá: en UTC ya es el 7.
      await transicionar(t.aprobador, firmando(t, "aprobar", "aprobacion"), opc(tx, "2026-11-07T04:30:00Z"));
      await transicionar(t.admin, publicar(t), opc(tx, "2026-11-09T15:00:00Z"));
      const [v] = await tx`SELECT fecha_elaboracion::text AS elaboracion, fecha_revision::text AS revision, fecha_aprobacion::text AS aprobacion,
          publicado_en, elaboro, reviso, aprobo
        FROM documento_versiones WHERE id = ${t.versionId}`;
      expect(v).toMatchObject({ elaboracion: "2026-11-05", revision: "2026-11-05", aprobacion: "2026-11-06" });
      expect(new Date(v.publicado_en).toISOString()).toBe("2026-11-09T15:00:00.000Z");
      expect(v.elaboro).toBe(`${t.elaborador.nombre} — Coordinadora de Talento Humano`);
      expect(v.reviso).toBe(t.revisor.nombre);                           // Sin cargo, solo el nombre.
      expect(v.aprobo).toBe(t.aprobador.nombre);
    } finally { await t.limpiar(); }
  }));

  it("en un solo acto, «Aprobó» sale de quien actúa, con su cargo y su día", () => revertida(sql, async (tx) => {
    const aprobador = await usuarioDePrueba(tx, { rol: "admin_sgc" });
    const [cargo] = await tx`SELECT id, nombre FROM cargos LIMIT 1`;
    await tx`UPDATE usuarios SET cargo_id = ${cargo.id} WHERE id = ${aprobador.usuarioId}`;
    const t = await tramiteEn(tx, "aprobacion", { aprobador });
    try {
      await transicionar(aprobador, firmando(t, "aprobar_y_publicar", "aprobacion"), opc(tx, "2026-11-07T04:30:00Z"));
      const [v] = await tx`SELECT aprobo, fecha_aprobacion::text AS fecha FROM documento_versiones WHERE id = ${t.versionId}`;
      expect(v).toEqual({ aprobo: `${aprobador.nombre} — ${cargo.nombre}`, fecha: "2026-11-06" });
    } finally { await t.limpiar(); }
  }));

  it("el título propuesto de una modificación se aplica solo al publicar", () => revertida(sql, async (tx) => {
    const nuevo = "Inducción y reinducción de todo el personal";
    const t = await tramiteEn(tx, "publicacion", { tituloNuevo: nuevo });
    try {
      const titulo = async () => (await tx`SELECT titulo FROM documentos WHERE codigo = ${t.codigo}`)[0].titulo;
      expect(await titulo()).toBe(t.titulo);
      await transicionar(t.admin, publicar(t), opc(tx));
      expect(await titulo()).toBe(nuevo);
      expect(await ultimoDetalle(tx, t.tramiteId, "publicar")).toMatchObject({
        tituloAnterior: t.titulo, titulo: nuevo,
      });
    } finally { await t.limpiar(); }
  }));

  it("una creación publica la versión 1 y conserva el título que quedó al aceptar", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aprobacion", { tipo: "crear" });
    try {
      // Quien acepta puede corregir el título; `titulo_propuesto` sigue siendo lo que se pidió.
      const [d] = await tx`UPDATE documentos SET titulo = 'Título que dejó el administrador'
        WHERE id = (SELECT documento_id FROM tramites WHERE id = ${t.tramiteId}) RETURNING id`;
      await transicionar(t.aprobador, firmando(t, "aprobar_y_publicar", "aprobacion"), opc(tx));
      const [doc] = await tx`SELECT titulo FROM documentos WHERE id = ${d.id}`;
      expect(doc.titulo).toBe("Título que dejó el administrador");
      const [v] = await tx`SELECT numero, estado FROM documento_versiones WHERE id = ${t.versionId}`;
      expect(v).toMatchObject({ numero: 1, estado: "vigente" });
      expect(await ultimoDetalle(tx, t.tramiteId, "aprobar_y_publicar")).toMatchObject({ version: 1, obsoletas: [] });
    } finally { await t.limpiar(); }
  }));

  it("no publica si el archivo del almacén cambió", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion");
    try {
      await tx`UPDATE archivos SET hash_sha256 = ${"0".repeat(64)} WHERE version_id = ${t.versionId} AND rol = 'principal'`;
      await expect(tx.savepoint(() => transicionar(t.admin, { tramiteId: t.tramiteId, accion: "publicar", etapaEsperada: "publicacion", rondaEsperada: t.ronda, credenciales: { clave: "x" } }, opc(tx))))
        .rejects.toThrow(/no coincide|cambió después/);
      const [v] = await tx`SELECT estado FROM documento_versiones WHERE id = ${t.versionId}`;
      expect(v.estado).toBe("borrador");
    } finally { await t.limpiar(); }
  }));

  it("con el archivo cambiado en disco, la firma no se pide ni se gasta", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion");
    try {
      await writeFile(await rutaDelPrincipal(tx, t.versionId), "otros bytes");
      await fallaSinGastarLaFirma(tx, t.admin, publicar(t), NO_COINCIDE);
    } finally { await t.limpiar(); }
  }));

  it("aprobar y publicar tampoco gasta la firma si el archivo cambió", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aprobacion");
    try {
      await writeFile(await rutaDelPrincipal(tx, t.versionId), "otros bytes");
      await fallaSinGastarLaFirma(tx, t.aprobador, firmando(t, "aprobar_y_publicar", "aprobacion"), NO_COINCIDE);
    } finally { await t.limpiar(); }
  }));

  it("un archivo que falta en el almacén se rechaza igual, sin revelar la ruta", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion");
    const espiaError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await rm(await rutaDelPrincipal(tx, t.versionId));
      await fallaSinGastarLaFirma(tx, t.admin, publicar(t), NO_COINCIDE);
      expect(espiaError).toHaveBeenCalled();
    } finally {
      espiaError.mockRestore();
      await t.limpiar();
    }
  }));

  it("el archivo y su fila coinciden, pero no con lo firmado: no gasta la firma", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion");
    try {
      const bytes = "otro archivo, con su huella registrada";
      await writeFile(await rutaDelPrincipal(tx, t.versionId), bytes);
      const hash = createHash("sha256").update(bytes).digest("hex");
      await tx`UPDATE archivos SET hash_sha256 = ${hash} WHERE version_id = ${t.versionId} AND rol = 'principal'`;
      await fallaSinGastarLaFirma(tx, t.admin, publicar(t), "El archivo cambió después de la firma de quien elaboró");
    } finally { await t.limpiar(); }
  }));

  it("una firma de otra ronda no cuenta para publicar", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion");
    try {
      await tx`UPDATE tramites SET ronda = ronda + 1 WHERE id = ${t.tramiteId}`;
      await fallaSinGastarLaFirma(tx, t.admin, publicar(t, t.ronda + 1), "Faltan firmas para publicar");
    } finally { await t.limpiar(); }
  }));

  it("sin la firma de quien revisó no se aprueba y publica", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      await tx`UPDATE tramites SET etapa = 'aprobacion' WHERE id = ${t.tramiteId}`;
      await fallaSinGastarLaFirma(tx, t.aprobador, firmando(t, "aprobar_y_publicar", "aprobacion"), "Faltan firmas para publicar");
    } finally { await t.limpiar(); }
  }));

  it("no publica una versión que dejó de ser borrador", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion");
    try {
      await tx`UPDATE documento_versiones SET estado = 'descartado' WHERE id = ${t.versionId}`;
      await fallaSinGastarLaFirma(tx, t.admin, publicar(t), "La versión de este trámite ya no está en borrador");
    } finally { await t.limpiar(); }
  }));

  it("si algo falla después de publicar, no queda nada: es una sola transacción", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion");
    const real = MANEJADORES.publicar!;
    MANEJADORES.publicar = async (c) => {
      await real(c);
      throw new Error("falla después de aplicar la publicación");
    };
    try {
      await expect(tx.savepoint(() => transicionar(t.admin, publicar(t), opc(tx)))).rejects.toThrow("falla después");
      const [v] = await tx`SELECT estado, elaboro, publicado_en FROM documento_versiones WHERE id = ${t.versionId}`;
      expect(v).toMatchObject({ estado: "borrador", elaboro: null, publicado_en: null });
      const [{ vigentes }] = await tx`SELECT count(*)::int AS vigentes FROM documento_versiones v JOIN documentos d ON d.id = v.documento_id
        WHERE d.codigo = ${t.codigo} AND v.estado = 'vigente'`;
      expect(vigentes).toBe(1);
      const [{ etapa }] = await tx`SELECT etapa FROM tramites WHERE id = ${t.tramiteId}`;
      expect(etapa).toBe("publicacion");
      expect((await listarFirmas(t.tramiteId, { sql: tx })).map((f) => f.firma)).not.toContain("publico");
    } finally {
      MANEJADORES.publicar = real;
      await t.limpiar();
    }
  }));
});

describe("eliminación", () => {
  it("una eliminación aprobada deja el documento anulado, con su firma", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aprobacion", { tipo: "eliminar" });
    try {
      await transicionar(t.aprobador, { tramiteId: t.tramiteId, accion: "aprobar", etapaEsperada: "aprobacion", rondaEsperada: 0, datos: { concepto: "Procede." }, credenciales: { clave: "x" } }, opc(tx));
      const r = await transicionar(t.admin, { tramiteId: t.tramiteId, accion: "publicar", etapaEsperada: "publicacion", rondaEsperada: 0, credenciales: { clave: "x" } }, opc(tx));
      expect(r.etapa).toBe("eliminado");
      const [v] = await tx`SELECT estado, numero FROM documento_versiones WHERE id = ${t.versionId}`;
      expect(v.estado).toBe("anulado");
      const firmas = await listarFirmas(t.tramiteId, { sql: tx });
      expect(firmas.map((f) => f.firma)).toEqual(["aprobo", "publico"]);
      const [{ hash_sha256: huella }] = await tx`SELECT hash_sha256 FROM archivos WHERE version_id = ${t.versionId} AND rol = 'principal'`;
      expect(new Set(firmas.map((f) => f.hashSha256))).toEqual(new Set([huella]));
      expect(await ultimoDetalle(tx, t.tramiteId, "publicar")).toEqual({ versionAnulada: v.numero });
      expect((await avisos(tx, t.tramiteId, "tramite.cerrado")).map((a) => Number(a.usuario_id))).toEqual(
        expect.arrayContaining([t.aprobador.usuarioId, t.elaborador.usuarioId]),
      );
    } finally { await t.limpiar(); }
  }));

  it("aprobar y ejecutar en un solo acto escribe las dos firmas", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aprobacion", { tipo: "eliminar" });
    const r = await transicionar(t.aprobador, firmando(t, "aprobar_y_publicar", "aprobacion"), opc(tx));
    expect(r.etapa).toBe("eliminado");
    expect((await listarFirmas(t.tramiteId, { sql: tx })).map((f) => f.firma)).toEqual(["aprobo", "publico"]);
    expect(await ultimoDetalle(tx, t.tramiteId, "aprobar_y_publicar")).toEqual({ concepto: "Aprobado.", versionAnulada: 1 });
  }));

  it("sin la firma de quien aprobó no se ejecuta", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aprobacion", { tipo: "eliminar" });
    await tx`UPDATE tramites SET etapa = 'publicacion' WHERE id = ${t.tramiteId}`;
    await fallaSinGastarLaFirma(tx, t.admin, publicar(t), "Faltan firmas para publicar");
  }));

  it("no se ejecuta si la versión del trámite ya no es la vigente", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion", { tipo: "eliminar" });
    await tx`UPDATE documento_versiones SET estado = 'obsoleto' WHERE id = ${t.versionId}`;
    await fallaSinGastarLaFirma(tx, t.admin, publicar(t), "La versión de este trámite ya no está vigente");
  }));

  it("no se ejecuta si el principal de la vigente no es el que se aprobó retirar: no gasta la firma", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion", { tipo: "eliminar" });
    await tx`UPDATE archivos SET hash_sha256 = ${"f".repeat(64)} WHERE version_id = ${t.versionId} AND rol = 'principal'`;
    await fallaSinGastarLaFirma(tx, t.admin, publicar(t), "El archivo cambió después de la firma de quien aprobó");
  }));

  it("la eliminación solo anula la versión que se aprobó retirar", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion", { tipo: "eliminar" });
    // Otra versión pasó a ser la vigente (y la del trámite quedó obsoleta) sin que el trámite lo supiera.
    await tx`UPDATE documento_versiones SET estado = 'obsoleto' WHERE id = ${t.versionId}`;
    const [{ documento_id: documentoId }] = await tx`SELECT documento_id FROM documento_versiones WHERE id = ${t.versionId}`;
    const [otra] = await tx`INSERT INTO documento_versiones (documento_id, numero, estado, origen_aprobacion, publicado_en, elaboro, reviso, aprobo, fecha_elaboracion, fecha_revision, fecha_aprobacion)
      VALUES (${documentoId}, 99, 'vigente', 'plataforma', now(), 'x', 'x', 'x', current_date, current_date, current_date) RETURNING id`;
    await tx`UPDATE tramites SET version_id = ${t.versionId} WHERE id = ${t.tramiteId}`;
    // `validarPublicar` ya lo ve; se salta para probar el manejador por sí solo.
    const validador = VALIDADORES.publicar;
    delete VALIDADORES.publicar;
    try {
      await expect(tx.savepoint(() => transicionar(t.admin, publicar(t, 0), opc(tx)))).rejects.toThrow("La versión vigente cambió: revise el trámite");
      const [v] = await tx`SELECT estado FROM documento_versiones WHERE id = ${otra.id}`;
      expect(v.estado).toBe("vigente");
    } finally { VALIDADORES.publicar = validador; }
  }));
});

describe("ciclo completo", () => {
  const ahoraDe = (tx: TransactionSql, id: number) =>
    tx`SELECT etapa, ronda FROM tramites WHERE id = ${id}`.then(([x]) => ({ etapa: x.etapa, ronda: x.ronda }));

  it("tras una devolución del aprobador: responder, revisar, aprobar y publicar en la ronda nueva", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aprobacion");
    try {
      const nueva = t.ronda + 1;
      expect(await transicionar(t.aprobador, { tramiteId: t.tramiteId, accion: "devolver_aprobacion", etapaEsperada: "aprobacion", rondaEsperada: t.ronda,
        datos: { observaciones: ["Falta citar la resolución vigente."] } }, opc(tx))).toEqual({ etapa: "elaboracion", ronda: nueva });
      const [o] = await listarObservaciones(t.tramiteId, { sql: tx });
      await responderObservacion(o.id, t.elaborador, "Se citó la resolución.", await ahoraDe(tx, t.tramiteId), { sql: tx });
      await transicionar(t.elaborador, { tramiteId: t.tramiteId, accion: "enviar_a_revision", etapaEsperada: "elaboracion", rondaEsperada: nueva, credenciales: { clave: "x" } }, opc(tx));
      const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
      await guardarVerificacion(t.tramiteId, t.revisor, items.map((i) => ({ itemId: i.id, resultado: "cumple" as const })), await ahoraDe(tx, t.tramiteId), { sql: tx });
      await cerrarObservacion(o.id, t.revisor, await ahoraDe(tx, t.tramiteId), { sql: tx });
      await transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "concepto_favorable", etapaEsperada: "revision", rondaEsperada: nueva, datos: { concepto: "Cumple." }, credenciales: { clave: "x" } }, opc(tx));
      expect((await transicionar(t.aprobador, firmando(t, "aprobar_y_publicar", "aprobacion", nueva), opc(tx))).etapa).toBe("publicado");
      const deLaRonda = (await listarFirmas(t.tramiteId, { sql: tx })).filter((f) => f.ronda === nueva);
      expect(deLaRonda.map((f) => f.firma)).toEqual(["elaboro", "reviso", "aprobo", "publico"]);
      const [v] = await tx`SELECT estado FROM documento_versiones WHERE id = ${t.versionId}`;
      expect(v.estado).toBe("vigente");
    } finally { await t.limpiar(); }
  }));

  it("un admin_sgc que elaboró también publica; aprueba Gerencia", () => revertida(sql, async (tx) => {
    const elaborador = await sesionAdmin(tx);
    const gerente = await sesionDe(tx, "gerente");
    const t = await tramiteEn(tx, "aprobacion", { elaborador, aprobador: gerente });
    try {
      const entrada = { tramiteId: t.tramiteId, etapaEsperada: "aprobacion", rondaEsperada: t.ronda, datos: { concepto: "Aprobado." }, credenciales: { clave: "x" } } as const;
      await transicionar(gerente, { ...entrada, accion: "aprobar" }, opc(tx));
      expect((await transicionar(elaborador, { tramiteId: t.tramiteId, accion: "publicar", etapaEsperada: "publicacion", rondaEsperada: t.ronda, credenciales: { clave: "x" } }, opc(tx))).etapa).toBe("publicado");
      const firmas = await listarFirmas(t.tramiteId, { sql: tx });
      expect(firmas.map((f) => [f.firma, f.usuarioId])).toEqual([
        ["elaboro", elaborador.usuarioId], ["reviso", t.revisor.usuarioId], ["aprobo", gerente.usuarioId], ["publico", elaborador.usuarioId],
      ]);
    } finally { await t.limpiar(); }
  }));
});
