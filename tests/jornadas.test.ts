/**
 * Socialización (13B): la marca nace en la aceptación, la publicación pide la jornada, registrarla confirma
 * por asistencia y anularla lo revierte. Todo corre dentro de una transacción que se revierte.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { acusesDeVersion } from "@/db/consultas/distribucion/acuses";
import {
  anularJornada,
  jornadasDeVersion,
  listarJornadas,
  obtenerJornada,
  registrarJornada,
  socializacionDeVersion,
  type DatosJornada,
} from "@/db/consultas/distribucion/jornadas";
import { tareasDeSocializacion } from "@/db/consultas/distribucion/tareas";
import { corregirDatosDeControl } from "@/db/consultas/tramites-gestion";
import { transicionar } from "@/db/consultas/tramites-flujo";
import { puedeVerJornada } from "@/lib/alcance";
import { ErrorDistribucion } from "@/lib/distribucion/tipos";
import { ErrorPermiso } from "@/lib/permisos";
import { misTareas } from "@/lib/tareas";
import { fechaLimite } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { pdfDePrueba } from "./utiles/pdf";
import { documentoLibre, opc, sesionAdmin, sesionDe, tramiteEn, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
const PUBLICA = new Date("2026-11-20T15:00:00Z");
const REGISTRA = new Date("2026-11-22T15:00:00Z");
const ANULA = new Date("2026-11-25T15:00:00Z");

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-jornadas-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

const gth = async (tx: TransactionSql) => Number((await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`)[0].id);
const cex = async (tx: TransactionSql) => Number((await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`)[0].id);

type Trayecto = Awaited<ReturnType<typeof tramiteEn>>;

const publicar = (tx: TransactionSql, t: Trayecto, ahora = PUBLICA) =>
  transicionar(
    t.admin,
    { tramiteId: t.tramiteId, etapaEsperada: "publicacion", rondaEsperada: t.ronda, accion: "publicar", credenciales: { clave: "x" } },
    opc(tx, ahora.toISOString()),
  );

const rechaza = (promesa: Promise<unknown>, mensaje: string) =>
  expect(promesa).rejects.toSatisfy((e) => e instanceof ErrorDistribucion && e.message === mensaje);

/** Un trámite publicado con la marca y una lectora en GTH con su acuse pendiente. */
async function publicadoConMarca(tx: TransactionSql) {
  const lectora = await usuarioDePrueba(tx, { rol: "consulta", procesos: [await gth(tx)] });
  const t = await tramiteEn(tx, "publicacion", { principal: await pdfDePrueba([[612, 792]]), aceptar: { requiereSocializacion: true } });
  await publicar(tx, t);
  return { lectora, t, versionId: t.versionId as number, lider: await sesionDe(tx, "lider.gth") };
}

const datosDe = (versionId: number, facilitadorId: number, asistenteIds: number[], parcial: Partial<DatosJornada> = {}): DatosJornada => ({
  fecha: "2026-11-21",
  modalidad: "reunion_servicio",
  facilitadorId,
  versionIds: [versionId],
  asistenteIds,
  asistentesExternos: null,
  observaciones: null,
  ...parcial,
});

describe("la marca y la publicación", () => {
  it("la marca de la aceptación llega a la fila y, al publicar, crea la socialización requerida y la tarea del líder", () =>
    revertida(sql, async (tx) => {
      const t = await tramiteEn(tx, "publicacion", { principal: await pdfDePrueba([[612, 792]]), aceptar: { requiereSocializacion: true } });
      try {
        const [fila] = await tx`SELECT requiere_socializacion FROM tramites WHERE id = ${t.tramiteId}`;
        expect(fila.requiere_socializacion).toBe(true);
        const [aceptado] = await tx`SELECT detalle FROM tramite_eventos WHERE tramite_id = ${t.tramiteId} AND tipo = 'aceptar'`;
        expect(aceptado.detalle.requiereSocializacion).toBe(true);

        await publicar(tx, t);
        const [req] = await tx`SELECT vence_en, cumplida_en, superada_en FROM socializaciones_requeridas WHERE version_id = ${t.versionId}`;
        expect(req.vence_en).toEqual(fechaLimite(PUBLICA, 30, zonaHoraria()));
        expect(req.cumplida_en).toBeNull();
        const [cierre] = await tx`SELECT detalle FROM tramite_eventos WHERE tramite_id = ${t.tramiteId} AND tipo = 'publicar'`;
        expect(cierre.detalle.socializacion).toBeTruthy();

        const lider = await sesionDe(tx, "lider.gth");
        const tarea = (await tareasDeSocializacion(lider, { sql: tx })).find((x) => x.id === `socializacion:${t.versionId}`);
        expect(tarea).toMatchObject({
          titulo: `Registrar la socialización de ${t.codigo} v2`,
          vence: req.vence_en,
          enlace: `/distribucion/socializaciones/nueva?version=${t.versionId}`,
        });
        expect((await misTareas(lider, { sql: tx })).tareas.map((x) => x.id)).toContain(`socializacion:${t.versionId}`);
        // Una persona de otro proceso, y el Admin SGC (el proceso tiene líder), no la reciben.
        expect(await tareasDeSocializacion(await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [await cex(tx)] }), { sql: tx })).toEqual([]);
        expect((await tareasDeSocializacion(t.admin, { sql: tx })).some((x) => x.id === `socializacion:${t.versionId}`)).toBe(false);

        const [aviso] = await tx`SELECT titulo, enlace FROM notificaciones
          WHERE usuario_id = ${lider.usuarioId} AND tipo = 'distribucion.socializar' AND entidad = 'socializacion'`;
        expect(aviso).toEqual({ titulo: `Registre la socialización de ${t.codigo} v2`, enlace: `/distribucion/socializaciones/nueva?version=${t.versionId}` });

        expect(await socializacionDeVersion(t.versionId as number, { sql: tx })).toEqual({
          requerida: true,
          venceEn: req.vence_en,
          cumplida: null,
          superada: false,
        });
      } finally {
        await t.limpiar();
      }
    }));

  it("sin la marca, publicar no pide socialización ni crea tarea", () =>
    revertida(sql, async (tx) => {
      const t = await tramiteEn(tx, "publicacion", { principal: await pdfDePrueba([[612, 792]]) });
      try {
        await publicar(tx, t);
        expect(await tx`SELECT 1 FROM socializaciones_requeridas WHERE version_id = ${t.versionId}`).toHaveLength(0);
        expect(await socializacionDeVersion(t.versionId as number, { sql: tx })).toMatchObject({ requerida: false, cumplida: null });
      } finally {
        await t.limpiar();
      }
    }));

  it("sin líder en el proceso propietario, la tarea y el aviso son de los Admin SGC", () =>
    revertida(sql, async (tx) => {
      const t = await tramiteEn(tx, "publicacion", { principal: await pdfDePrueba([[612, 792]]), aceptar: { requiereSocializacion: true } });
      try {
        await tx`DELETE FROM usuario_procesos WHERE proceso_id = ${await gth(tx)}`;
        await publicar(tx, t);
        expect((await tareasDeSocializacion(t.admin, { sql: tx })).map((x) => x.id)).toContain(`socializacion:${t.versionId}`);
        const [{ n }] = await tx`SELECT count(*)::int AS n FROM notificaciones
          WHERE usuario_id = ${t.admin.usuarioId} AND tipo = 'distribucion.socializar'`;
        expect(n).toBe(1);
      } finally {
        await t.limpiar();
      }
    }));

  it("corregir la marca: toda etapa de trabajo, solo con distribucion.gestionar, y deja su frase en el historial", () =>
    revertida(sql, async (tx) => {
      const t = await tramiteEn(tx, "aprobacion", { principal: await pdfDePrueba([[612, 792]]) });
      try {
        const esperado = { etapa: "aprobacion" as const, ronda: t.ronda };
        const lider = await sesionDe(tx, "lider.gth");
        await expect(corregirDatosDeControl(t.tramiteId, lider, { requiereSocializacion: true }, esperado, opc(tx))).rejects.toThrow("Sin permiso");
        await corregirDatosDeControl(t.tramiteId, t.admin, { requiereSocializacion: true }, esperado, opc(tx));
        const [fila] = await tx`SELECT requiere_socializacion FROM tramites WHERE id = ${t.tramiteId}`;
        expect(fila.requiere_socializacion).toBe(true);
        const [e] = await tx`SELECT detalle FROM tramite_eventos WHERE tramite_id = ${t.tramiteId} AND tipo = 'corregir_datos'`;
        expect(e.detalle).toEqual({ antes: { socializacion: "no" }, despues: { socializacion: "sí" } });
        await expect(corregirDatosDeControl(t.tramiteId, t.admin, { requiereSocializacion: true }, esperado, opc(tx))).rejects.toThrow("No hay cambios");
        // Los datos del documento siguen fijos desde la aprobación.
        await expect(corregirDatosDeControl(t.tramiteId, t.admin, { titulo: "Otro título" }, esperado, opc(tx))).rejects.toThrow("quedan fijos");
      } finally {
        await t.limpiar();
      }
    }));
});

describe("registrar y anular una jornada", () => {
  it("confirma por asistencia y cumple la requerida; anularla lo revierte", () =>
    revertida(sql, async (tx) => {
      const { lectora, t, versionId, lider } = await publicadoConMarca(tx);
      try {
        const [pendiente] = await tx`SELECT id FROM acuses WHERE version_id = ${versionId} AND usuario_id = ${lectora.usuarioId} AND estado = 'pendiente'`;
        const { jornadaId, acusesPorAsistencia } = await registrarJornada(lider, datosDe(versionId, lider.usuarioId, [lectora.usuarioId, lider.usuarioId]), {
          sql: tx,
          ahora: REGISTRA,
        });
        expect(acusesPorAsistencia).toBe(1); // el líder ya había firmado: su acuse no se toca

        expect(await tx`SELECT estado, modo, jornada_id, confirmado_en FROM acuses WHERE id = ${pendiente.id}`).toEqual([
          { estado: "confirmado", modo: "asistencia", jornada_id: jornadaId, confirmado_en: REGISTRA },
        ]);
        expect((await tx`SELECT modo FROM acuses WHERE version_id = ${versionId} AND usuario_id = ${lider.usuarioId}`)[0].modo).toBe("firma");
        const [evento] = await tx`SELECT tipo, detalle FROM acuse_eventos WHERE acuse_id = ${pendiente.id} ORDER BY id DESC LIMIT 1`;
        expect(evento).toEqual({ tipo: "confirmado", detalle: { modo: "asistencia", jornadaId } });
        expect((await acusesDeVersion(versionId, { sql: tx })).porAsistencia).toBe(1);

        const [req] = await tx`SELECT cumplida_en, jornada_id FROM socializaciones_requeridas WHERE version_id = ${versionId}`;
        expect(req).toEqual({ cumplida_en: REGISTRA, jornada_id: jornadaId });
        expect(await tareasDeSocializacion(lider, { sql: tx })).toEqual([]);
        expect(await socializacionDeVersion(versionId, { sql: tx })).toMatchObject({
          requerida: true,
          venceEn: null,
          cumplida: { jornadaId, fecha: "2026-11-21", modalidad: "reunion_servicio", asistentes: 2, evidencias: 0 },
        });
        const [auditoria] = await tx`SELECT usuario_id, detalle FROM auditoria WHERE accion = 'jornada_registrada' AND entidad_id = ${jornadaId}`;
        expect(Number(auditoria.usuario_id)).toBe(lider.usuarioId);
        expect(auditoria.detalle).toMatchObject({ acusesPorAsistencia: 1, requeridasCumplidas: 1, asistentes: [lectora.usuarioId, lider.usuarioId] });

        // Una jornada no se edita: solo la anula quien la registró o quien gestiona la distribución.
        await expect(anularJornada(jornadaId, lectora, "No corresponde.", { sql: tx, ahora: ANULA })).rejects.toBeInstanceOf(ErrorPermiso);
        await rechaza(anularJornada(jornadaId, lider, "  ", { sql: tx, ahora: ANULA }), "Escriba el motivo");
        await anularJornada(jornadaId, lider, "Se registró sobre el documento equivocado.", { sql: tx, ahora: ANULA });
        await rechaza(anularJornada(jornadaId, lider, "Otra vez.", { sql: tx, ahora: ANULA }), "La jornada ya está anulada");

        expect(await tx`SELECT estado, modo, jornada_id, confirmado_en, vence_en FROM acuses WHERE id = ${pendiente.id}`).toEqual([
          { estado: "pendiente", modo: null, jornada_id: null, confirmado_en: null, vence_en: fechaLimite(ANULA, 15, zonaHoraria()) },
        ]);
        const eventos = await tx`SELECT tipo, usuario_id FROM acuse_eventos WHERE acuse_id = ${pendiente.id} ORDER BY id`;
        expect(eventos.map((e) => e.tipo)).toEqual(["creado", "confirmado", "revertido"]);
        expect(Number(eventos[2].usuario_id)).toBe(lider.usuarioId);
        expect(await tx`SELECT cumplida_en, jornada_id, superada_en FROM socializaciones_requeridas WHERE version_id = ${versionId}`).toEqual([
          { cumplida_en: null, jornada_id: null, superada_en: null },
        ]);
        expect((await tareasDeSocializacion(lider, { sql: tx })).map((x) => x.id)).toContain(`socializacion:${versionId}`);
        const [anulada] = await tx`SELECT anulada_en, anulada_por, motivo_anulacion FROM jornadas WHERE id = ${jornadaId}`;
        expect(anulada).toEqual({ anulada_en: ANULA, anulada_por: lider.usuarioId, motivo_anulacion: "Se registró sobre el documento equivocado." });
        const [auditoriaAnula] = await tx`SELECT detalle FROM auditoria WHERE accion = 'jornada_anulada' AND entidad_id = ${jornadaId}`;
        expect(auditoriaAnula.detalle).toMatchObject({ motivo: "Se registró sobre el documento equivocado.", acusesRevertidos: 1, requeridasReabiertas: 1 });
        expect((await obtenerJornada(jornadaId, lider, { sql: tx }))?.anulada).toMatchObject({ por: lider.nombre });
      } finally {
        await t.limpiar();
      }
    }));

  it("si la versión ya no es vigente, anular supera el acuse y la requerida en vez de reabrirlos", () =>
    revertida(sql, async (tx) => {
      const { lectora, t, versionId, lider } = await publicadoConMarca(tx);
      try {
        const { jornadaId } = await registrarJornada(lider, datosDe(versionId, lider.usuarioId, [lectora.usuarioId]), { sql: tx, ahora: REGISTRA });
        // La versión dejó de ser vigente después de la jornada: al anularla, lo que confirmó no vuelve a pedirse.
        await tx`UPDATE documento_versiones SET estado = 'obsoleto' WHERE id = ${versionId}`;
        await anularJornada(jornadaId, lider, "Se anula la jornada.", { sql: tx, ahora: ANULA });
        const [acuse] = await tx`SELECT estado, modo, motivo_cierre FROM acuses WHERE version_id = ${versionId} AND usuario_id = ${lectora.usuarioId}`;
        expect(acuse).toEqual({ estado: "superado", modo: null, motivo_cierre: "nueva_version" });
        const [req] = await tx`SELECT cumplida_en, superada_en FROM socializaciones_requeridas WHERE version_id = ${versionId}`;
        expect(req).toEqual({ cumplida_en: null, superada_en: ANULA });
      } finally {
        await t.limpiar();
      }
    }));

  it("una versión nueva supera la socialización que nadie registró", () =>
    revertida(sql, async (tx) => {
      const { t, versionId } = await publicadoConMarca(tx);
      try {
        const { alDejarDeSerVigente } = await import("@/db/consultas/distribucion/version-vigencia");
        await alDejarDeSerVigente(tx, versionId, "nueva_version", ANULA);
        expect(await socializacionDeVersion(versionId, { sql: tx })).toEqual({ requerida: true, venceEn: null, cumplida: null, superada: true });
        expect(await tareasDeSocializacion(await sesionDe(tx, "lider.gth"), { sql: tx })).toEqual([]);
      } finally {
        await t.limpiar();
      }
    }));

  it("rechaza fecha futura, sin documentos, sin asistentes ni externos, un líder fuera de su alcance y a quien no registra", () =>
    revertida(sql, async (tx) => {
      const { lectora, t, versionId, lider } = await publicadoConMarca(tx);
      try {
        const ok = (parcial: Partial<DatosJornada>) => registrarJornada(lider, datosDe(versionId, lider.usuarioId, [lectora.usuarioId], parcial), { sql: tx, ahora: REGISTRA });
        await rechaza(ok({ fecha: "2026-11-23" }), "La fecha no puede ser futura");
        await rechaza(ok({ versionIds: [] }), "Elija al menos un documento");
        await rechaza(ok({ asistenteIds: [], asistentesExternos: "  " }), "Registre al menos un asistente o escriba quiénes asistieron de fuera");
        await rechaza(ok({ facilitadorId: 999_999_999 }), "El facilitador no existe o está inactivo");
        // Solo externos sí alcanza.
        await ok({ asistenteIds: [], asistentesExternos: "Dos personas de la empresa contratista" });

        const deCex = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [await cex(tx)] });
        await rechaza(
          registrarJornada(deCex, datosDe(versionId, deCex.usuarioId, [lectora.usuarioId]), { sql: tx, ahora: REGISTRA }),
          `El documento ${t.codigo} no es de sus procesos`,
        );
        await expect(
          registrarJornada(lectora, datosDe(versionId, lider.usuarioId, [lectora.usuarioId]), { sql: tx, ahora: REGISTRA }),
        ).rejects.toBeInstanceOf(ErrorPermiso);
        // El Admin SGC no tiene restricción de alcance.
        await registrarJornada(t.admin, datosDe(versionId, lider.usuarioId, [lider.usuarioId]), { sql: tx, ahora: REGISTRA });
      } finally {
        await t.limpiar();
      }
    }));

  it("el listado y la consulta por versión muestran la jornada con su resumen", () =>
    revertida(sql, async (tx) => {
      const { lectora, t, versionId, lider } = await publicadoConMarca(tx);
      try {
        const { jornadaId } = await registrarJornada(lider, datosDe(versionId, lider.usuarioId, [lectora.usuarioId]), { sql: tx, ahora: REGISTRA });
        const enLista = (await listarJornadas(lider, { desde: new Date("2026-11-01T05:00:00Z"), hasta: new Date("2026-12-01T05:00:00Z") }, { sql: tx })).find((j) => j.id === jornadaId);
        expect(enLista).toMatchObject({
          fecha: "2026-11-21",
          modalidad: "reunion_servicio",
          facilitador: { id: lider.usuarioId },
          asistentesCantidad: 1,
          evidenciasCantidad: 0,
          puedeVerEvidencia: true,
          versiones: [{ versionId, codigo: t.codigo, version: 2 }],
        });
        expect(enLista?.asistentes.map((a) => a.id)).toEqual([lectora.usuarioId]);
        expect((await jornadasDeVersion(versionId, lider, { sql: tx })).map((j) => j.id)).toEqual([jornadaId]);
        expect(await listarJornadas(lider, { desde: new Date("2026-12-01T05:00:00Z") }, { sql: tx })).toEqual([]);
        const otroProceso = await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`;
        expect((await listarJornadas(lider, { procesoId: Number(otroProceso[0].id) }, { sql: tx })).some((j) => j.id === jornadaId)).toBe(false);
      } finally {
        await t.limpiar();
      }
    }));
});

describe("quién ve la jornada y su evidencia", () => {
  it("el resumen lo ve quien ve el documento; la lista de asistentes y los archivos, la administración y el líder del proceso", () =>
    revertida(sql, async (tx) => {
      const { lectora, t, versionId, lider } = await publicadoConMarca(tx);
      try {
        const { jornadaId } = await registrarJornada(lider, datosDe(versionId, lider.usuarioId, [lectora.usuarioId]), { sql: tx, ahora: REGISTRA });
        await tx`INSERT INTO archivos (contexto, contexto_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
          VALUES ('jornada', ${jornadaId}, 'evidencia', ${`zz-pruebas/jornada-${jornadaId}/acta.pdf`}, 'acta.pdf', 'pdf', 'application/pdf', 1, ${"0".repeat(64)})`;

        const de = (usuario: Awaited<ReturnType<typeof usuarioDePrueba>>) => obtenerJornada(jornadaId, usuario, { sql: tx });
        const consulta = await de(lectora);
        expect(consulta).toMatchObject({ puedeVerEvidencia: false, asistentes: [], evidencias: [], asistentesCantidad: 1, evidenciasCantidad: 1 });

        const control = await usuarioDePrueba(tx, { rol: "control_interno" });
        const conEvidencia = await de(control);
        expect(conEvidencia).toMatchObject({ puedeVerEvidencia: true, evidenciasCantidad: 1 });
        expect(conEvidencia?.evidencias.map((e) => e.nombreOriginal)).toEqual(["acta.pdf"]);
        expect((await de(lider))?.puedeVerEvidencia).toBe(true);
        expect((await de(t.admin))?.puedeVerEvidencia).toBe(true);

        const deCex = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [await cex(tx)] });
        expect(await de(deCex)).toMatchObject({ puedeVerEvidencia: false, asistentes: [] });
        const procesos = [await gth(tx)];
        const documentoIds = [Number((await tx`SELECT id FROM documentos WHERE codigo = ${t.codigo}`)[0].id)];
        expect(await puedeVerJornada(lectora, { procesoIds: procesos, documentoIds }, { sql: tx })).toEqual({ ve: true, evidencia: false });
        expect(await puedeVerJornada(control, { procesoIds: procesos, documentoIds }, { sql: tx })).toEqual({ ve: true, evidencia: true });
        expect(await puedeVerJornada(deCex, { procesoIds: procesos, documentoIds }, { sql: tx })).toEqual({ ve: true, evidencia: false });

        // Un documento restringido deja sin jornada a quien no lo ve; la administración sí la conserva.
        await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE codigo = ${t.codigo}`;
        const sinAcceso = await usuarioDePrueba(tx, { rol: "consulta" });
        expect(await de(sinAcceso)).toBeNull();
        expect(await de(deCex)).toBeNull();
        expect(await de(control)).not.toBeNull();
      } finally {
        await t.limpiar();
      }
    }));
});

describe("versiones admitidas y documentos que no se ven", () => {
  const versionDe = async (tx: TransactionSql, documentoId: number) =>
    Number((await tx`SELECT id FROM documento_versiones WHERE documento_id = ${documentoId} ORDER BY numero DESC LIMIT 1`)[0].id);

  it("una jornada sobre una versión obsoleta se registra y no cambia acuses ni requeridas", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const asistente = await usuarioDePrueba(tx, { rol: "consulta", procesos: [await gth(tx)] });
      const documento = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
      const versionId = await versionDe(tx, documento.id);
      await tx`UPDATE documento_versiones SET estado = 'obsoleto' WHERE id = ${versionId}`;
      const [acuse] = await tx`INSERT INTO acuses (version_id, usuario_id, origen, estado, motivo_cierre, cerrado_en, vence_en)
        VALUES (${versionId}, ${asistente.usuarioId}, 'publicacion', 'superado', 'nueva_version', now(), now()) RETURNING id`;
      const [req] = await tx`INSERT INTO socializaciones_requeridas (version_id, vence_en, superada_en)
        VALUES (${versionId}, now(), now()) RETURNING id`;

      const { jornadaId, acusesPorAsistencia } = await registrarJornada(admin, datosDe(versionId, admin.usuarioId, [asistente.usuarioId]), { sql: tx, ahora: REGISTRA });
      expect(acusesPorAsistencia).toBe(0);
      expect(await tx`SELECT estado, modo, jornada_id FROM acuses WHERE id = ${acuse.id}`).toEqual([{ estado: "superado", modo: null, jornada_id: null }]);
      expect(await tx`SELECT cumplida_en, jornada_id FROM socializaciones_requeridas WHERE id = ${req.id}`).toEqual([{ cumplida_en: null, jornada_id: null }]);
      expect((await obtenerJornada(jornadaId, admin, { sql: tx }))?.versiones).toMatchObject([{ versionId, vigente: false }]);
    }));

  it("un borrador no se socializa", () =>
    revertida(sql, async (tx) => {
      const t = await tramiteEn(tx, "elaboracion");
      try {
        await rechaza(
          registrarJornada(t.admin, datosDe(t.versionId as number, t.admin.usuarioId, [t.admin.usuarioId]), { sql: tx, ahora: REGISTRA }),
          `Solo se socializa una versión vigente u obsoleta: ${t.codigo} v2 no lo es`,
        );
      } finally {
        await t.limpiar();
      }
    }));

  it("quien solo ve uno de los documentos de la jornada no ve el código ni el título del restringido", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const visible = await documentoLibre(tx, { proceso: "GTH", tipo: "PR", titulo: "Documento visible de la jornada" });
      const reservado = await documentoLibre(tx, { proceso: "GTH", tipo: "PR", titulo: "Documento reservado de la jornada" });
      await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${reservado.id}`;
      const { jornadaId } = await registrarJornada(
        admin,
        datosDe(await versionDe(tx, visible.id), admin.usuarioId, [admin.usuarioId], { versionIds: [await versionDe(tx, visible.id), await versionDe(tx, reservado.id)] }),
        { sql: tx, ahora: REGISTRA },
      );

      const consulta = await usuarioDePrueba(tx, { rol: "consulta" });
      const vista = await obtenerJornada(jornadaId, consulta, { sql: tx });
      expect(vista?.versiones.map((v) => v.codigo)).toEqual([visible.codigo]);
      expect(vista?.versionesOcultas).toBe(1);
      expect(JSON.stringify(vista)).not.toContain(reservado.codigo);
      expect(JSON.stringify(vista)).not.toContain("reservado");
      expect((await listarJornadas(consulta, {}, { sql: tx })).find((j) => j.id === jornadaId)?.versiones).toHaveLength(1);

      // La administración ve los dos.
      expect((await obtenerJornada(jornadaId, admin, { sql: tx }))?.versiones).toHaveLength(2);
      expect((await obtenerJornada(jornadaId, admin, { sql: tx }))?.versionesOcultas).toBe(0);
    }));
});
