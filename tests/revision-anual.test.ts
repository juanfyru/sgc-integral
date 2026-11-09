/**
 * La revisión anual de documentos (spec 13C §9): la campaña con su foto y sus decisiones automáticas, lo que se decide
 * fuera de su página (ratificar, verificar un externo, pedir una solicitud, publicar), el enlace de un trámite en curso,
 * la confirmación del normograma del proceso, la prórroga, el cierre firmado con el informe congelado y las tareas.
 * Todo corre dentro de una transacción que se revierte; cada caso cierra antes la revisión que esté abierta en la base.
 * Las campañas de prueba son de 2090: no chocan con el año de una revisión de la demo (único por año).
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import type { TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { aplicarPublicacion } from "@/db/consultas/admin";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { crearSolicitud, transicionar } from "@/db/consultas/tramites-flujo";
import { abrirEdicion, adoptarEdicion, registrarVerificacion } from "@/db/consultas/vigencia/externos";
import { ratificar } from "@/db/consultas/vigencia/ratificaciones";
import {
  abrirRevision,
  cerrarRevision,
  confirmarNormograma,
  enlazarTramiteExistente,
  informeCongelado,
  obtenerRevision,
  prorrogarRevision,
  registrarDecision,
  revisionAbierta,
} from "@/db/consultas/vigencia/revision-anual";
import { revisarVencimientosDeVigencia } from "@/db/consultas/vigencia/vencimientos";
import { misTareas } from "@/lib/tareas";
import { fechaEnZona, fechaLimite } from "@/lib/tramites/plazos";
import { textoFecha } from "@/lib/vigencia/plazo";
import { DECISIONES } from "@/lib/vigencia/tipos";
import { silenciarImpactos } from "./utiles/normograma";
import { documentoLibre, opc, sesionAdmin, sesionDe, tramiteEn, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import {
  externoDePrueba,
  firmaDePrueba,
  revisionDePrueba,
  sacarDeLaRevisionAbierta,
  silenciarRevisionAnual,
  silenciarVigencia,
  sinRevisionAbierta,
  vigenteFuera,
} from "./utiles/vigencia";

const sql = obtenerSql();
const ZONA = "America/Bogota";
const DIA = 86_400_000;
const ahora = new Date("2090-03-10T15:00:00Z");
const JUSTIFICACION = "Se revisa en la revisión anual de documentos.";

const fallaCon = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { code?: string }) => e.code ?? "sin-codigo",
  );

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-revision-anual-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

/** La fila de decisión de un documento en la revisión, tal como está en la BD. */
async function filaDe(tx: TransactionSql, revisionId: number, documentoId: number) {
  const [f] = await tx`SELECT decision, usuario_id, ratificacion_id, verificacion_id, tramite_id, version_id
    FROM revision_anual_decisiones WHERE revision_id = ${revisionId} AND documento_id = ${documentoId}`;
  if (!f) return null;
  const id = (v: unknown) => (v === null ? null : Number(v));
  return {
    decision: f.decision as string,
    usuarioId: id(f.usuario_id),
    ratificacionId: id(f.ratificacion_id),
    verificacionId: id(f.verificacion_id),
    tramiteId: id(f.tramite_id),
    versionId: Number(f.version_id),
  };
}

const procesoPorSigla = async (tx: TransactionSql, sigla: string) => {
  const [p] = await tx`SELECT id, nombre FROM procesos WHERE sigla = ${sigla}`;
  return { id: Number(p.id), nombre: p.nombre as string };
};

describe("la campaña", () => {
  it("abre la campaña con la foto: recientes, en trámite y pendientes; una sola abierta", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const admin = await sesionAdmin(tx);
      const viejo = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: "GTH" });
      const nuevo = await vigenteFuera(tx, { fechaAprobacion: fechaEnZona(ahora, ZONA), proceso: "GTH" });
      const enTramite = await tramiteEn(tx, "elaboracion");
      const [{ documento_id }] = await tx`SELECT documento_id FROM tramites WHERE id = ${enTramite.tramiteId}`;
      const enTramiteId = Number(documento_id);

      const { revisionId } = await abrirRevision(admin, { anio: 2090, plazoDias: 60, ventanaMeses: 6 }, { sql: tx, ahora });
      const r = (await obtenerRevision(revisionId, admin, { sql: tx, ahora }))!;
      const del = (id: number) => r.documentos.find((d) => d.documentoId === id)!;
      const decision = (id: number) => del(id).decision?.decision ?? null;
      expect(decision(viejo.id)).toBeNull();
      expect(decision(nuevo.id)).toBe("reciente");
      expect(decision(enTramiteId)).toBe("en_tramite");
      expect(del(enTramiteId).decision).toMatchObject({ por: null, tramite: { id: enTramite.tramiteId, etapa: "elaboracion" } });
      expect(r).toMatchObject({
        anio: 2090,
        estado: "abierta",
        plazoDias: 60,
        ventanaMeses: 6,
        abiertaPor: admin.nombre,
        abiertaEn: ahora,
        venceEn: fechaLimite(ahora, 60, ZONA),
        prorrogas: [],
        cerradaPor: null,
        cerradaEn: null,
      });

      // La foto es institucional: todo documento con versión vigente de un proceso activo, visible o no.
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM documentos d
        JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'
        JOIN documento_proceso dp ON dp.documento_id = d.id AND dp.es_principal
        LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
        JOIN procesos p ON p.id = COALESCE(dp.proceso_id, s.proceso_id) AND p.activo`;
      expect(r.totales.documentos).toBe(n);
      expect(Object.values(r.totales).reduce((a, b) => a + b, 0) - r.totales.documentos).toBe(n);
      expect(r.totales.reciente).toBeGreaterThanOrEqual(1);
      expect(r.totales.en_tramite).toBeGreaterThanOrEqual(1);
      const gth = r.procesos.find((p) => p.sigla === "GTH")!;
      expect(gth.documentos).toBe(r.documentos.filter((d) => d.proceso.id === gth.id).length);
      expect(gth.decididos).toBe(gth.documentos - r.documentos.filter((d) => d.proceso.id === gth.id && d.decision === null).length);
      expect(gth).toMatchObject({ normograma: null, puedeDecidir: true });

      const [a] = await tx`SELECT usuario_id, detalle FROM auditoria WHERE accion = 'revision_anual_abierta' AND entidad_id = ${revisionId}`;
      expect(Number(a.usuario_id)).toBe(admin.usuarioId);
      expect(a.detalle).toMatchObject({ anio: 2090, plazoDias: 60, ventanaMeses: 6, documentos: n });

      // El aviso a líderes, Gerencia y Control Interno nombra el año y la fecha, no documentos; nadie se avisa a sí mismo.
      const avisos = await tx`SELECT u.usuario, n.titulo, n.enlace FROM notificaciones n JOIN usuarios u ON u.id = n.usuario_id
        WHERE n.tipo = 'revision.abierta' AND n.entidad = 'revision_anual' AND n.entidad_id = ${revisionId}`;
      expect(avisos.map((x) => x.usuario)).toEqual(expect.arrayContaining(["lider.gth", "gerente"]));
      expect(avisos.map((x) => x.usuario)).not.toContain(admin.usuario);
      expect(avisos[0]).toMatchObject({
        titulo: `Se abrió la revisión anual 2090: decida sobre los documentos de sus procesos antes del ${textoFecha(fechaLimite(ahora, 60, ZONA), ZONA)}`,
        enlace: "/vigencia/revision-anual",
      });

      await expect(abrirRevision(admin, { anio: 2091, plazoDias: 60, ventanaMeses: 6 }, { sql: tx, ahora })).rejects.toThrow(
        "Ya hay una revisión anual abierta",
      );
      expect((await revisionAbierta({ sql: tx }))?.id).toBe(revisionId);
      await enTramite.limpiar();
    }));

  it("el año va del anterior al siguiente, uno por año; solo el Admin SGC la abre", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const admin = await sesionAdmin(tx);
      const o = { sql: tx, ahora };
      await expect(abrirRevision(admin, { anio: 2088, plazoDias: 60, ventanaMeses: 6 }, o)).rejects.toThrow("El año debe estar entre 2089 y 2091");
      await expect(abrirRevision(admin, { anio: 2090, plazoDias: 3, ventanaMeses: 6 }, o)).rejects.toThrow("El plazo debe estar entre 7 y 365 días");
      await expect(abrirRevision(await sesionDe(tx, "lider.gth"), { anio: 2090, plazoDias: 60, ventanaMeses: 6 }, o)).rejects.toThrow(
        "Sin permiso para esta acción",
      );
      const { revisionId } = await abrirRevision(admin, { anio: 2090, plazoDias: 60, ventanaMeses: 6 }, o);
      await sinRevisionAbierta(tx);
      expect((await tx`SELECT estado FROM revisiones_anuales WHERE id = ${revisionId}`)[0].estado).toBe("cerrada");
      await expect(abrirRevision(admin, { anio: 2090, plazoDias: 60, ventanaMeses: 6 }, o)).rejects.toThrow("Ya hay una revisión anual de 2090");
    }));

  it("un documento publicado después de abrir entra como revisado recientemente; uno con trámite conserva su decisión al publicar", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const admin = await sesionAdmin(tx);
      const enPublicacion = await tramiteEn(tx, "publicacion");
      const [{ documento_id }] = await tx`SELECT documento_id FROM tramites WHERE id = ${enPublicacion.tramiteId}`;
      const conTramite = Number(documento_id);
      const { revisionId } = await revisionDePrueba(tx, admin, { ahora });
      const gth = await procesoPorSigla(tx, "GTH");
      const contar = async () =>
        Number((await tx`SELECT documentos FROM revision_anual_procesos WHERE revision_id = ${revisionId} AND proceso_id = ${gth.id}`)[0].documentos);
      const antes = await contar();

      // Nace después de abrir: no estaba en la foto.
      const nuevo = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
      expect(await filaDe(tx, revisionId, nuevo.id)).toBeNull();
      const [v2] = await tx`INSERT INTO documento_versiones (documento_id, numero, estado, aprobo, fecha_aprobacion)
        VALUES (${nuevo.id}, 2, 'borrador', 'Prueba', '2090-03-01') RETURNING id`;
      await aplicarPublicacion(tx, Number(v2.id), "fuera", admin.usuarioId, ahora);
      expect(await filaDe(tx, revisionId, nuevo.id)).toMatchObject({ decision: "reciente", usuarioId: null, versionId: Number(v2.id) });
      expect(await contar()).toBe(antes + 1);

      // El trámite que estaba en curso al abrir publica: la decisión sigue siendo la suya y el estado se lee al cerrar.
      expect(await filaDe(tx, revisionId, conTramite)).toMatchObject({ decision: "en_tramite", tramiteId: enPublicacion.tramiteId });
      await transicionar(
        enPublicacion.admin,
        { tramiteId: enPublicacion.tramiteId, accion: "publicar", etapaEsperada: "publicacion", rondaEsperada: enPublicacion.ronda, credenciales: { clave: "x" } },
        opc(tx, "2090-03-11T15:00:00Z"),
      );
      expect(await filaDe(tx, revisionId, conTramite)).toMatchObject({ decision: "en_tramite", tramiteId: enPublicacion.tramiteId });
      expect(await contar()).toBe(antes + 1);
      await enPublicacion.limpiar();
    }));
});

describe("los tests que confirman cargas reales", () => {
  it("sacarDeLaRevisionAbierta saca de la foto abierta los documentos de prueba, con su conteo, y deja borrarlos", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const admin = await sesionAdmin(tx);
      const { revisionId } = await revisionDePrueba(tx, admin, { ahora });
      const gth = await procesoPorSigla(tx, "GTH");
      const contar = async () =>
        Number((await tx`SELECT documentos FROM revision_anual_procesos WHERE revision_id = ${revisionId} AND proceso_id = ${gth.id}`)[0].documentos);
      const antes = await contar();
      const nuevo = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
      const [v2] = await tx`INSERT INTO documento_versiones (documento_id, numero, estado, aprobo, fecha_aprobacion)
        VALUES (${nuevo.id}, 2, 'borrador', 'Prueba', '2090-03-01') RETURNING id`;
      await aplicarPublicacion(tx, Number(v2.id), "fuera", admin.usuarioId, ahora);
      expect(await contar()).toBe(antes + 1);

      await sacarDeLaRevisionAbierta(tx, nuevo.codigo);
      expect(await filaDe(tx, revisionId, nuevo.id)).toBeNull();
      expect(await contar()).toBe(antes);
      await tx`DELETE FROM archivos WHERE version_id IN (SELECT id FROM documento_versiones WHERE documento_id = ${nuevo.id})`;
      await tx`DELETE FROM documento_versiones WHERE documento_id = ${nuevo.id}`;
      expect(await tx`SELECT 1 FROM documento_versiones WHERE documento_id = ${nuevo.id}`).toHaveLength(0);
    }));
});

describe("las decisiones", () => {
  it("ratificar desde la ficha, verificar un externo y pedir una solicitud registran la decisión; Gerencia también aunque no decida", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const admin = await sesionAdmin(tx);
      const gerente = await sesionDe(tx, "gerente");
      const liderGth = await sesionDe(tx, "lider.gth");
      const liderCex = await sesionDe(tx, "lider.cex");
      const estrategico = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: "GTH", autoridad: "estrategico" });
      const aEliminar = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: "GTH" });
      const externo = await externoDePrueba(tx, liderCex, { proceso: "CEX", edicion: "2017", ahora: new Date("2089-01-15T15:00:00Z") });
      const otroExterno = await externoDePrueba(tx, liderCex, { proceso: "CEX", edicion: "2015", ahora: new Date("2089-01-15T15:00:00Z") });
      const { revisionId } = await revisionDePrueba(tx, admin, { ahora });
      expect(await filaDe(tx, revisionId, externo.documentoId)).toMatchObject({ decision: "sin_revisar", usuarioId: null });
      const despues = new Date(ahora.getTime() + DIA);

      const { ratificacionId } = await ratificar(
        gerente,
        { documentoId: estrategico.id, nota: null, credenciales: { clave: "ok" } },
        { sql: tx, ahora: despues, verificar: firmaDePrueba },
      );
      const { verificacionId } = await registrarVerificacion(
        liderCex,
        { documentoId: externo.documentoId, resultado: "edicion_nueva", fuente: "https://www.minsalud.gov.co/guias", nota: null },
        { sql: tx, ahora: despues },
      );
      const { tramiteId } = await crearSolicitud(
        liderGth,
        { tipo: "eliminar", motivo: "revision_anual", justificacion: JUSTIFICACION, documentoId: aEliminar.id },
        { sql: tx, ahora: despues },
      );

      expect(await filaDe(tx, revisionId, estrategico.id)).toMatchObject({
        decision: "ratificar",
        usuarioId: gerente.usuarioId,
        ratificacionId,
        verificacionId: null,
        tramiteId: null,
      });
      expect(await filaDe(tx, revisionId, externo.documentoId)).toMatchObject({ decision: "actualizar", usuarioId: liderCex.usuarioId, verificacionId });
      expect(await filaDe(tx, revisionId, aEliminar.id)).toMatchObject({ decision: "eliminar", usuarioId: liderGth.usuarioId, tramiteId });
      // La ratificación y la verificación quedan enlazadas a la revisión; la solicitud no nació de su página.
      const [rat] = await tx`SELECT revision_anual_id FROM ratificaciones WHERE id = ${ratificacionId}`;
      const [ver] = await tx`SELECT revision_anual_id FROM externo_verificaciones WHERE id = ${verificacionId}`;
      const [sol] = await tx`SELECT revision_anual_id FROM tramites WHERE id = ${tramiteId}`;
      expect([Number(rat.revision_anual_id), Number(ver.revision_anual_id), sol.revision_anual_id]).toEqual([revisionId, revisionId, null]);

      const [a] = await tx`SELECT usuario_id, detalle FROM auditoria
        WHERE accion = 'revision_anual_decision' AND entidad_id = ${revisionId} AND detalle->>'documentoId' = ${String(estrategico.id)}`;
      expect(Number(a.usuario_id)).toBe(gerente.usuarioId);
      expect(a.detalle).toMatchObject({ codigo: estrategico.codigo, antes: null, despues: { decision: "ratificar", ratificacionId } });

      // La adopción de la edición nueva no cambia la decisión: quedó fija con su verificación.
      const { versionId } = await abrirEdicion(
        liderCex,
        externo.documentoId,
        { edicion: "2024", fechaEdicion: null, resumenCambios: "Metas de 2024" },
        { sql: tx, ahora: despues },
      );
      await adoptarEdicion(
        liderCex,
        { versionId, pedirAcuses: false, requiereSocializacion: false, credenciales: { clave: "ok" }, verificacionId },
        { sql: tx, ahora: despues, verificar: firmaDePrueba },
      );
      expect(await filaDe(tx, revisionId, externo.documentoId)).toMatchObject({ decision: "actualizar", verificacionId, versionId: externo.versionId });
      const r = (await obtenerRevision(revisionId, admin, { sql: tx, ahora: despues }))!;
      expect(r.documentos.find((d) => d.documentoId === externo.documentoId)!.decision).toMatchObject({
        decision: "actualizar",
        por: liderCex.nombre,
        verificacionId,
      });

      // Un externo registrado y adoptado después de abrir entra como revisado recientemente, por el sistema.
      const nuevoExterno = await externoDePrueba(tx, liderCex, { proceso: "CEX", edicion: "2020", ahora: despues });
      expect(await filaDe(tx, revisionId, nuevoExterno.documentoId)).toMatchObject({ decision: "reciente", usuarioId: null });

      // La verificación «fue retirado» lo retira, y su decisión es eliminar con esa verificación.
      const retirado = await registrarVerificacion(
        liderCex,
        { documentoId: otroExterno.documentoId, resultado: "retirado", fuente: "https://www.minsalud.gov.co/guias", nota: "Derogada" },
        { sql: tx, ahora: despues },
      );
      expect(retirado.retirado).toBe(true);
      expect(await filaDe(tx, revisionId, otroExterno.documentoId)).toMatchObject({
        decision: "eliminar",
        usuarioId: liderCex.usuarioId,
        verificacionId: retirado.verificacionId,
      });
    }));

  it("el líder decide solo sobre sus procesos; una decisión con trámite aceptado queda fija; una con trámite retirado se puede cambiar", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const admin = await sesionAdmin(tx);
      const liderGth = await sesionDe(tx, "lider.gth");
      const liderCex = await sesionDe(tx, "lider.cex");
      const deCex = await documentoLibre(tx, { proceso: "CEX", tipo: "PR" });
      const previa = await crearSolicitud(liderCex, { tipo: "modificar", motivo: "mejora", justificacion: JUSTIFICACION, documentoId: deCex.id }, { sql: tx, ahora });
      const aceptado = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: "GTH" });
      const retirado = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: "GTH" });
      const { revisionId } = await revisionDePrueba(tx, admin, { ahora });
      const o = { sql: tx, ahora };

      // El trámite en curso al abrir es «en trámite»; enlazarlo lo vuelve la decisión del líder. Al de otro proceso, el
      // documento no le existe.
      expect(await filaDe(tx, revisionId, deCex.id)).toMatchObject({ decision: "en_tramite", tramiteId: previa.tramiteId, usuarioId: null });
      const enlazar = { revisionId, documentoId: deCex.id, tramiteId: previa.tramiteId };
      await expect(enlazarTramiteExistente(liderGth, enlazar, o)).rejects.toThrow("El documento no existe");
      await expect(enlazarTramiteExistente(liderCex, { ...enlazar, tramiteId: previa.tramiteId + 100_000 }, o)).rejects.toThrow(
        "El trámite no está abierto sobre este documento",
      );
      await enlazarTramiteExistente(liderCex, enlazar, o);
      expect(await filaDe(tx, revisionId, deCex.id)).toMatchObject({ decision: "actualizar", tramiteId: previa.tramiteId, usuarioId: liderCex.usuarioId });

      // La solicitud aceptada fija la decisión: nada la cambia.
      const t = await tramiteEn(tx, "elaboracion", { codigo: aceptado.codigo });
      expect(await filaDe(tx, revisionId, aceptado.id)).toMatchObject({ decision: "actualizar", tramiteId: t.tramiteId, usuarioId: liderGth.usuarioId });
      const otra = { documentoId: aceptado.id, versionId: aceptado.versionId, decision: "ratificar" as const, usuarioId: admin.usuarioId, ahora };
      expect(await registrarDecision(tx, otra)).toEqual({ revisionId });
      expect(await filaDe(tx, revisionId, aceptado.id)).toMatchObject({ decision: "actualizar", tramiteId: t.tramiteId });

      // La retirada no: el líder ratifica y la decisión cambia, con antes y después en la bitácora.
      const r = await tramiteEn(tx, "aceptacion", { codigo: retirado.codigo });
      expect(await filaDe(tx, revisionId, retirado.id)).toMatchObject({ decision: "actualizar", tramiteId: r.tramiteId });
      await transicionar(liderGth, { tramiteId: r.tramiteId, accion: "retirar", etapaEsperada: "aceptacion", rondaEsperada: 0 }, opc(tx));
      const { ratificacionId } = await ratificar(
        liderGth,
        { documentoId: retirado.id, nota: null, credenciales: { clave: "ok" } },
        { sql: tx, ahora, verificar: firmaDePrueba },
      );
      expect(await filaDe(tx, revisionId, retirado.id)).toMatchObject({ decision: "ratificar", ratificacionId, tramiteId: null });
      const [a] = await tx`SELECT detalle FROM auditoria
        WHERE accion = 'revision_anual_decision' AND entidad_id = ${revisionId} AND detalle->>'documentoId' = ${String(retirado.id)}
        ORDER BY id DESC LIMIT 1`;
      expect(a.detalle).toMatchObject({
        antes: { decision: "actualizar", tramiteId: r.tramiteId },
        despues: { decision: "ratificar", ratificacionId, tramiteId: null },
      });
      await t.limpiar();

      // Lo que cada quien ve: el líder, sus procesos y sus documentos; Gerencia, todo sin decidir; Consulta, nada.
      const delLider = (await obtenerRevision(revisionId, liderGth, o))!;
      const gth = await procesoPorSigla(tx, "GTH");
      const cex = await procesoPorSigla(tx, "CEX");
      const suyos = delLider.procesos.map((p) => p.id);
      expect(suyos).toContain(gth.id);
      expect(suyos).not.toContain(cex.id);
      expect(delLider.documentos.every((d) => suyos.includes(d.proceso.id))).toBe(true);
      expect(delLider.documentos.map((d) => d.documentoId)).not.toContain(deCex.id);
      const deGerencia = (await obtenerRevision(revisionId, await sesionDe(tx, "gerente"), o))!;
      expect(deGerencia.procesos.length).toBeGreaterThan(1);
      expect(deGerencia.procesos.every((p) => !p.puedeDecidir)).toBe(true);
      expect(await obtenerRevision(revisionId, await usuarioDePrueba(tx, { rol: "consulta" }), o)).toBeNull();
    }));

  it("sin revisión abierta, ratificar no registra decisión ni enlaza la ratificación", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const d = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: "GTH" });
      const { ratificacionId } = await ratificar(
        await sesionDe(tx, "lider.gth"),
        { documentoId: d.id, nota: null, credenciales: { clave: "ok" } },
        { sql: tx, ahora, verificar: firmaDePrueba },
      );
      expect(await registrarDecision(tx, { documentoId: d.id, versionId: d.versionId, decision: "ratificar", usuarioId: null, ahora })).toBeNull();
      expect((await tx`SELECT revision_anual_id FROM ratificaciones WHERE id = ${ratificacionId}`)[0].revision_anual_id).toBeNull();
      expect(await tx`SELECT 1 FROM revision_anual_decisiones WHERE documento_id = ${d.id}`).toHaveLength(0);
    }));
});

describe("tareas y avisos de la campaña", () => {
  it("mientras hay campaña no hay tareas ni avisos individuales de vigencia y sí la tarea del proceso", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      await silenciarVigencia(tx);
      await silenciarImpactos(tx);
      await silenciarRevisionAnual(tx);
      const admin = await sesionAdmin(tx);
      const liderGth = await sesionDe(tx, "lider.gth");
      const config = await obtenerConfigDocumental({ sql: tx });
      const viejo = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: "GTH" });
      const ids = async () => (await misTareas(liderGth, { sql: tx, ahora })).tareas.map((t) => t.id);
      expect(await ids()).toContain(`vigencia:${viejo.id}`);

      const { revisionId } = await revisionDePrueba(tx, admin, { ahora });
      const gth = await procesoPorSigla(tx, "GTH");
      const tareas = (await misTareas(liderGth, { sql: tx, ahora })).tareas;
      expect(tareas.map((t) => t.id)).not.toContain(`vigencia:${viejo.id}`);
      expect(tareas.some((t) => t.id.startsWith("revision:"))).toBe(true);
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM revision_anual_decisiones rad
        JOIN documento_proceso dp ON dp.documento_id = rad.documento_id AND dp.es_principal
        LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
        WHERE rad.revision_id = ${revisionId} AND rad.decision = 'sin_revisar' AND COALESCE(dp.proceso_id, s.proceso_id) = ${gth.id}`;
      // Los documentos sin decisión, más uno: falta confirmar el normograma del proceso.
      expect(tareas.find((t) => t.id === `revision:${revisionId}:${gth.id}`)).toEqual({
        id: `revision:${revisionId}:${gth.id}`,
        modulo: "documentos",
        titulo: `Revisar los documentos de ${gth.nombre} (${n + 1} pendientes)`,
        detalle: "Revisión anual 2090",
        vence: fechaLimite(ahora, 60, ZONA),
        enlace: `/vigencia/revision-anual?proceso=${gth.id}`,
      });
      expect((await revisarVencimientosDeVigencia({ sql: tx, ahora, config })).avisados).toBe(0);
    }));
});

describe("el cierre", () => {
  it("cerrar con clave congela el informe, marca sin revisar y protege las filas; cerrar dos veces falla", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const admin = await sesionAdmin(tx);
      const enCurso = await tramiteEn(tx, "elaboracion");
      const [{ documento_id }] = await tx`SELECT documento_id FROM tramites WHERE id = ${enCurso.tramiteId}`;
      const [{ codigo: codigoEnCurso }] = await tx`SELECT codigo FROM documentos WHERE id = ${documento_id}`;
      const { revisionId } = await revisionDePrueba(tx, admin, { ahora });
      const cierre = new Date(ahora.getTime() + 30 * DIA);
      const o = { sql: tx, ahora: cierre, verificar: firmaDePrueba };

      // Una clave errada no escribe nada de la campaña.
      await expect(cerrarRevision(admin, { revisionId, credenciales: { clave: "mala" } }, o)).rejects.toThrow("Clave o código incorrectos");
      expect((await tx`SELECT estado, informe FROM revisiones_anuales WHERE id = ${revisionId}`)[0]).toEqual({ estado: "abierta", informe: null });

      const r = await cerrarRevision(admin, { revisionId, credenciales: { clave: "ok" } }, o);
      expect(r.sinRevisar).toBeGreaterThan(0);
      const [fila] = await tx`SELECT estado, cerrada_por, cerrada_en, metodo_cierre, informe->'totales' AS totales
        FROM revisiones_anuales WHERE id = ${revisionId}`;
      expect(fila).toMatchObject({ estado: "cerrada", metodo_cierre: "clave", cerrada_en: cierre });
      expect(Number(fila.cerrada_por)).toBe(admin.usuarioId);
      expect(fila.totales).toMatchObject({ sin_revisar: r.sinRevisar });

      // El informe congelado basta para regenerar el PDF: fechas, quién cerró, cada decisión con el estado del trámite.
      const informe = (await informeCongelado(revisionId, { sql: tx }))!;
      expect(informe).toMatchObject({
        anio: 2090,
        abiertaEn: ahora,
        cerradaEn: cierre,
        cerradaPor: { nombre: admin.nombre, cargo: null },
        metodo: "clave",
        prorrogas: [],
        zona: ZONA,
      });
      expect(typeof informe.entidad).toBe("string");
      expect(informe).toHaveProperty("formato");
      expect(DECISIONES.reduce((s, d) => s + informe.totales[d], 0)).toBe(informe.alcance.documentos);
      expect(informe.decisiones).toHaveLength(informe.alcance.documentos);
      expect(informe.alcance.internos + informe.alcance.externos).toBe(informe.alcance.documentos);
      expect(informe.decisiones.find((d) => d.codigo === codigoEnCurso)).toMatchObject({
        decision: "en_tramite",
        responsable: null,
        solicitud: { estadoAlCierre: "En curso: Elaboración", venceEn: expect.any(Date) },
      });
      expect(informe.decisiones.filter((d) => d.decision === "sin_revisar").every((d) => d.fecha === null)).toBe(true);

      await expect(cerrarRevision(admin, { revisionId, credenciales: { clave: "ok" } }, o)).rejects.toThrow("La revisión ya está cerrada");
      expect(await fallaCon(tx.savepoint((s) => s`UPDATE revisiones_anuales SET plazo_dias = 1 WHERE id = ${revisionId}`))).toBe("42501");
      expect(await fallaCon(tx.savepoint((s) => s`UPDATE revision_anual_decisiones SET decision = 'ratificar' WHERE revision_id = ${revisionId}`))).toBe(
        "42501",
      );
      // Cerrada, nada la toca: ni una decisión, ni la prórroga, ni el normograma.
      expect(await registrarDecision(tx, { documentoId: Number(documento_id), versionId: 1, decision: "ratificar", usuarioId: null, ahora: cierre })).toBeNull();
      await expect(prorrogarRevision(admin, { revisionId, dias: 10, motivo: "Una prórroga tardía" }, o)).rejects.toThrow("La revisión ya está cerrada");
      const gth = await procesoPorSigla(tx, "GTH");
      await expect(
        confirmarNormograma(await sesionDe(tx, "lider.gth"), { revisionId, procesoId: gth.id, resultado: "sin_novedad", nota: null }, o),
      ).rejects.toThrow("La revisión ya está cerrada");

      const [a] = await tx`SELECT detalle FROM auditoria WHERE accion = 'revision_anual_cerrada' AND entidad_id = ${revisionId}`;
      expect(a.detalle).toMatchObject({ anio: 2090, sinRevisar: r.sinRevisar, metodo: "clave" });
      const avisos = await tx`SELECT u.usuario FROM notificaciones n JOIN usuarios u ON u.id = n.usuario_id
        WHERE n.tipo = 'revision.cerrada' AND n.entidad_id = ${revisionId}`;
      expect(avisos.map((x) => x.usuario)).toEqual(expect.arrayContaining(["gerente", "lider.gth"]));
      // Las tareas de la campaña desaparecen.
      expect((await misTareas(await sesionDe(tx, "lider.gth"), { sql: tx, ahora: cierre })).tareas.some((t) => t.id.startsWith("revision:"))).toBe(false);
      await enCurso.limpiar();
    }));

  it("prorrogar mueve la fecha, exige motivo y reinicia las marcas de aviso", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const liderGth = await sesionDe(tx, "lider.gth");
      const { revisionId } = await revisionDePrueba(tx, admin, { ahora });
      await tx`UPDATE revision_anual_procesos SET aviso_vencido_en = now(), escalado_en = now() WHERE revision_id = ${revisionId}`;
      const o = { sql: tx, ahora };
      const motivo = "Auditoría externa en curso";
      await expect(prorrogarRevision(admin, { revisionId, dias: 15, motivo: "No" }, o)).rejects.toThrow("El motivo debe tener al menos 5 caracteres");
      await expect(prorrogarRevision(admin, { revisionId, dias: 0, motivo }, o)).rejects.toThrow("La prórroga debe ser de 1 a 365 días");
      await expect(prorrogarRevision(liderGth, { revisionId, dias: 15, motivo }, o)).rejects.toThrow("Sin permiso para esta acción");
      const antes = (await revisionAbierta({ sql: tx }))!.venceEn;

      await prorrogarRevision(admin, { revisionId, dias: 15, motivo }, o);
      const r = (await revisionAbierta({ sql: tx }))!;
      expect(r.venceEn).toEqual(fechaLimite(antes, 15, ZONA));
      expect(r.prorrogas).toEqual([{ fecha: ahora, dias: 15, motivo, por: admin.nombre }]);
      const marcas = await tx`SELECT aviso_vencido_en, escalado_en FROM revision_anual_procesos WHERE revision_id = ${revisionId}`;
      expect(marcas.every((m) => m.aviso_vencido_en === null && m.escalado_en === null)).toBe(true);
      const [a] = await tx`SELECT detalle FROM auditoria WHERE accion = 'revision_anual_prorrogada' AND entidad_id = ${revisionId}`;
      expect(a.detalle).toMatchObject({ anio: 2090, dias: 15, motivo });
      // A los líderes con pendientes, con su proceso y el conteo: el motivo no va en el aviso.
      const [aviso] = await tx`SELECT titulo, cuerpo FROM notificaciones
        WHERE tipo = 'revision.prorrogada' AND entidad_id = ${revisionId} AND usuario_id = ${liderGth.usuarioId}`;
      expect(aviso.titulo).toBe(`La revisión anual 2090 se prorrogó hasta el ${textoFecha(fechaLimite(antes, 15, ZONA), ZONA)}`);
      expect(aviso.cuerpo).toContain((await procesoPorSigla(tx, "GTH")).nombre);
      expect(aviso.cuerpo).not.toContain(motivo);

      // Una segunda prórroga se suma a la primera.
      await prorrogarRevision(admin, { revisionId, dias: 5, motivo: "Cierre del trimestre" }, o);
      expect((await revisionAbierta({ sql: tx }))!.prorrogas.map((p) => p.dias)).toEqual([15, 5]);
    }));

  it("confirmar el normograma del proceso: «sin novedad» sin nota; «cambios» con nota avisa a los Admin SGC", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const liderGth = await sesionDe(tx, "lider.gth");
      const { revisionId } = await revisionDePrueba(tx, admin, { ahora });
      const gth = await procesoPorSigla(tx, "GTH");
      const cex = await procesoPorSigla(tx, "CEX");
      const o = { sql: tx, ahora };
      const leer = async () =>
        (await tx`SELECT normograma_resultado, normograma_nota, normograma_por, normograma_en FROM revision_anual_procesos
          WHERE revision_id = ${revisionId} AND proceso_id = ${gth.id}`)[0];

      await confirmarNormograma(liderGth, { revisionId, procesoId: gth.id, resultado: "sin_novedad", nota: null }, o);
      expect(await leer()).toMatchObject({ normograma_resultado: "sin_novedad", normograma_nota: null, normograma_en: ahora });
      expect(Number((await leer()).normograma_por)).toBe(liderGth.usuarioId);
      expect((await obtenerRevision(revisionId, liderGth, o))!.procesos.find((p) => p.id === gth.id)!.normograma).toMatchObject({
        resultado: "sin_novedad",
        nota: null,
        por: liderGth.nombre,
        en: ahora,
      });

      await expect(confirmarNormograma(liderGth, { revisionId, procesoId: gth.id, resultado: "cambios", nota: "Hay" }, o)).rejects.toThrow(
        "La nota debe tener al menos 5 caracteres",
      );
      // El proceso de otro líder no existe para él.
      await expect(confirmarNormograma(liderGth, { revisionId, procesoId: cex.id, resultado: "sin_novedad", nota: null }, o)).rejects.toThrow(
        "El proceso no existe",
      );
      const nota = "Falta la Resolución 3100 de 2019 en el normograma";
      await confirmarNormograma(liderGth, { revisionId, procesoId: gth.id, resultado: "cambios", nota }, o);
      expect(await leer()).toMatchObject({ normograma_resultado: "cambios", normograma_nota: nota });
      const avisos = await tx`SELECT usuario_id, titulo, cuerpo, enlace FROM notificaciones
        WHERE tipo = 'revision.normograma_cambios' AND entidad_id = ${revisionId}`;
      expect(avisos.map((a) => Number(a.usuario_id))).toContain(admin.usuarioId);
      expect(avisos.map((a) => Number(a.usuario_id))).not.toContain(liderGth.usuarioId);
      expect(avisos[0]).toMatchObject({ titulo: `${gth.nombre}: el normograma tiene cambios por registrar (revisión anual 2090)`, cuerpo: nota });
      const [a] = await tx`SELECT detalle FROM auditoria WHERE accion = 'revision_anual_normograma' AND entidad_id = ${revisionId}
        ORDER BY id DESC LIMIT 1`;
      expect(a.detalle).toMatchObject({ procesoId: gth.id, resultado: "cambios", nota, antes: { resultado: "sin_novedad", nota: null } });
    }));
});
