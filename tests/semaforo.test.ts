/** El semáforo de vigencia (spec 13C §7): la consulta, el alcance y la próxima revisión fijada a mano. */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import {
  ajustarPlazo,
  conteosSemaforo,
  fijarProximaRevision,
  listarSemaforo,
  quitarFechaFijada,
  vigenciaDeDocumento,
} from "@/db/consultas/vigencia/semaforo";
import { ErrorPermiso } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { sesionAdmin, sesionDe, tramiteEn } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { sinRevisionAbierta, vigenteFuera } from "./utiles/vigencia";

const sql = obtenerSql();
const ZONA = "America/Bogota";
const ahora = new Date("2026-11-08T15:00:00Z");

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-semaforo-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

describe("semáforo de vigencia", () => {
  it("un documento aprobado fuera hace 15 meses sale vencido aunque se cargó ayer", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const d = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14" });
      const fila = (await listarSemaforo(await sesionAdmin(tx), { estado: "vencida" }, { sql: tx, ahora })).find((f) => f.documentoId === d.id)!;
      expect(fila.vigencia.estado).toBe("vencida");
      expect(fila.vigencia.dias).toBe(-86);
      expect(fechaEnZona(fila.proximaRevision!, ZONA)).toBe("2026-08-14");
      expect(fila.ultimaRevision).toMatchObject({ clase: "aprobacion" });
      expect(fechaEnZona(fila.ultimaRevision!.fecha, ZONA)).toBe("2025-08-14");
      expect(fila).toMatchObject({ codigo: d.codigo, origen: "interno", mesesRevision: 12, fijada: null, tramite: null, impacto: null, huella: d.hash });
      expect(fila.version).toMatchObject({ id: d.versionId, numero: 1 });
      expect(fila.proceso).toMatchObject({ id: d.procesoId, sigla: "GTH" });
      // El filtro de estado se aplica sobre el estado calculado.
      expect((await listarSemaforo(await sesionAdmin(tx), { estado: "al_dia" }, { sql: tx, ahora })).some((f) => f.documentoId === d.id)).toBe(false);
    }));

  it("el líder solo ve los documentos de sus procesos y Gerencia todo", () =>
    revertida(sql, async (tx) => {
      const cex = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "CEX" });
      const gth = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "GTH" });
      const ids = (filas: { documentoId: number }[]) => filas.map((f) => f.documentoId);

      const delLider = ids(await listarSemaforo(await sesionDe(tx, "lider.gth"), {}, { sql: tx, ahora }));
      expect(delLider).toContain(gth.id);
      expect(delLider).not.toContain(cex.id);

      const gerente = await sesionDe(tx, "gerente");
      const deGerencia = ids(await listarSemaforo(gerente, {}, { sql: tx, ahora }));
      expect(deGerencia).toEqual(expect.arrayContaining([gth.id, cex.id]));
      // Filtros por proceso y por origen.
      const soloCex = await listarSemaforo(gerente, { procesoId: cex.procesoId }, { sql: tx, ahora });
      expect(soloCex.every((f) => f.proceso.id === cex.procesoId)).toBe(true);
      expect(ids(soloCex)).toContain(cex.id);
      expect(ids(await listarSemaforo(gerente, { origen: "externo" }, { sql: tx, ahora }))).not.toContain(cex.id);

      // Consulta no tiene la pestaña: la consulta no le devuelve nada.
      expect(await listarSemaforo(await sesionDe(tx, "consulta"), {}, { sql: tx, ahora })).toEqual([]);

      // La ficha muestra la vigencia a quien ve el documento, también a un líder ajeno, sin acciones.
      const ajeno = await vigenciaDeDocumento(cex.id, await sesionDe(tx, "lider.gth"), { sql: tx, ahora });
      expect(ajeno).not.toBeNull();
      expect(ajeno!.acciones).toEqual({ ratificar: false, solicitar: false, ajustar: false });
      const propio = await vigenciaDeDocumento(gth.id, await sesionDe(tx, "lider.gth"), { sql: tx, ahora });
      expect(propio!.acciones).toEqual({ ratificar: true, solicitar: true, ajustar: false });
      expect(propio!.ratificaciones).toEqual([]);

      // Un restringido no existe para quien no lo ve.
      await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${cex.id}`;
      expect(await vigenciaDeDocumento(cex.id, await sesionDe(tx, "lider.gth"), { sql: tx, ahora })).toBeNull();
      expect(ids(await listarSemaforo(await sesionDe(tx, "lider.cex"), {}, { sql: tx, ahora }))).toContain(cex.id);
    }));

  it("fijar la fecha a mano la muestra como fijada y la rechaza fuera de los límites", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const admin = await sesionAdmin(tx);
      const d = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14" });
      await expect(
        fijarProximaRevision(admin, { documentoIds: [d.id], fecha: fechaEnZona(ahora, ZONA), nota: "carga inicial" }, { sql: tx, ahora }),
      ).rejects.toThrow("La fecha debe estar entre");
      await expect(
        fijarProximaRevision(admin, { documentoIds: [d.id], fecha: "2027-11-09", nota: "carga inicial" }, { sql: tx, ahora }),
      ).rejects.toThrow("La fecha debe estar entre mañana y el 8 nov 2027");
      await tx`UPDATE documentos SET revision_aviso_en = now(), revision_escalado_en = now() WHERE id = ${d.id}`;
      expect(await fijarProximaRevision(admin, { documentoIds: [d.id], fecha: "2027-03-01", nota: "carga inicial" }, { sql: tx, ahora })).toEqual({ fijados: 1 });
      const v = await vigenciaDeDocumento(d.id, admin, { sql: tx, ahora });
      expect(v!.fijada).toMatchObject({ nota: "carga inicial", por: admin.nombre });
      expect(fechaEnZona(v!.proximaRevision!, ZONA)).toBe("2027-03-01");
      expect(v!.vigencia.estado).toBe("al_dia");
      expect(v!.acciones.ajustar).toBe(true);
      const [doc] = await tx`SELECT revision_aviso_en, revision_escalado_en, fijada_por FROM documentos WHERE id = ${d.id}`;
      expect(doc).toMatchObject({ revision_aviso_en: null, revision_escalado_en: null, fijada_por: admin.usuarioId });
      const [a] = await tx`SELECT detalle FROM auditoria WHERE accion = 'fecha_revision_fijada' AND entidad_id = ${d.id}`;
      expect(a).toBeTruthy();
      expect(a.detalle).toEqual({ codigo: d.codigo, fecha: "2027-03-01", nota: "carga inicial" });

      await quitarFechaFijada(admin, d.id, { sql: tx, ahora });
      const sinFijar = await vigenciaDeDocumento(d.id, admin, { sql: tx, ahora });
      expect(sinFijar!.fijada).toBeNull();
      expect(sinFijar!.vigencia.estado).toBe("vencida");
      expect((await tx`SELECT 1 FROM auditoria WHERE accion = 'fecha_revision_quitada' AND entidad_id = ${d.id}`).length).toBe(1);
      await expect(quitarFechaFijada(admin, d.id, { sql: tx, ahora })).rejects.toThrow("no tiene una fecha fijada");
    }));

  it("fijar a varios documentos rechaza todo si la fecha no cabe en uno y lo nombra", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const a = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14" });
      const b = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14" });
      await tx`UPDATE documentos SET meses_revision = 3 WHERE id = ${b.id}`;
      await expect(
        fijarProximaRevision(admin, { documentoIds: [a.id, b.id], fecha: "2027-03-01", nota: "carga inicial" }, { sql: tx, ahora }),
      ).rejects.toThrow(b.codigo);
      expect((await tx`SELECT 1 FROM documentos WHERE id IN (${a.id}, ${b.id}) AND proxima_revision_fijada IS NOT NULL`).length).toBe(0);
      expect(await fijarProximaRevision(admin, { documentoIds: [a.id, b.id], fecha: "2027-01-15", nota: "carga inicial" }, { sql: tx, ahora })).toEqual({ fijados: 2 });
      expect((await tx`SELECT 1 FROM auditoria WHERE accion = 'fecha_revision_fijada' AND entidad_id IN (${a.id}, ${b.id})`).length).toBe(2);
    }));

  it("un líder no fija fechas y un trámite abierto pone el documento en trámite", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const lider = await sesionDe(tx, "lider.gth");
      const d = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14", proceso: "GTH" });
      await expect(fijarProximaRevision(lider, { documentoIds: [d.id], fecha: "2027-03-01", nota: "carga inicial" }, { sql: tx, ahora })).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(ajustarPlazo(lider, { documentoId: d.id, mesesRevision: 24 }, { sql: tx, ahora })).rejects.toBeInstanceOf(ErrorPermiso);

      const t = await tramiteEn(tx, "elaboracion", { codigo: d.codigo });
      const fila = (await listarSemaforo(lider, { estado: "en_tramite" }, { sql: tx, ahora })).find((f) => f.documentoId === d.id)!;
      expect(fila.vigencia).toEqual({ estado: "en_tramite", dias: null });
      // La aceptación fue el 5 de noviembre: el 8 es el cuarto día de la elaboración.
      expect(fila.tramite).toMatchObject({ id: t.tramiteId, etapa: "elaboracion", dia: 4 });
      // Por debajo sigue vencido: la próxima revisión no cambia.
      expect(fechaEnZona(fila.proximaRevision!, ZONA)).toBe("2026-08-14");
      const v = await vigenciaDeDocumento(d.id, lider, { sql: tx, ahora });
      expect(v!.acciones).toEqual({ ratificar: false, solicitar: false, ajustar: false });
    }));

  it("ajustar el plazo cambia la próxima revisión y queda auditado con antes y después", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const d = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14" });
      await ajustarPlazo(admin, { documentoId: d.id, mesesRevision: 24 }, { sql: tx, ahora });
      const v = await vigenciaDeDocumento(d.id, admin, { sql: tx, ahora });
      expect(v!.mesesRevision).toBe(24);
      expect(fechaEnZona(v!.proximaRevision!, ZONA)).toBe("2027-08-14");
      expect(v!.vigencia.estado).toBe("al_dia");
      await ajustarPlazo(admin, { documentoId: d.id, mesesRevision: null }, { sql: tx, ahora });
      expect((await vigenciaDeDocumento(d.id, admin, { sql: tx, ahora }))!.mesesRevision).toBe(12);
      const auditados = await tx`SELECT detalle FROM auditoria WHERE accion = 'plazo_revision_ajustado' AND entidad_id = ${d.id} ORDER BY id`;
      expect(auditados.map((a) => a.detalle)).toEqual([
        { codigo: d.codigo, antes: null, despues: 24 },
        { codigo: d.codigo, antes: 24, despues: null },
      ]);
      for (const meses of [0, 121]) {
        await expect(ajustarPlazo(admin, { documentoId: d.id, mesesRevision: meses }, { sql: tx, ahora })).rejects.toThrow("entre 1 y 120");
      }
    }));

  it("sin fecha de revisión el documento sale en atención y no cuenta en el porcentaje dentro del plazo", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const vencido = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14" });
      const sinFecha = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01" });
      // Un externo sin verificación ni adopción registrada no tiene desde cuándo contar.
      await tx`UPDATE documentos SET origen = 'externo' WHERE id = ${sinFecha.id}`;
      await tx`UPDATE documento_versiones SET publicado_en = NULL WHERE id = ${sinFecha.versionId}`;
      const filas = await listarSemaforo(admin, { estado: "todos" }, { sql: tx, ahora });
      const fila = filas.find((f) => f.documentoId === sinFecha.id)!;
      expect(fila.proximaRevision).toBeNull();
      expect(fila.vigencia).toEqual({ estado: "atencion", dias: null });
      expect(fila.ultimaRevision).toBeNull();

      const conteos = await conteosSemaforo(admin, { sql: tx, ahora });
      expect(conteos.total).toBe(filas.length);
      expect(conteos.vencida + conteos.atencion + conteos.al_dia + conteos.en_tramite).toBe(conteos.total);
      expect(conteos.vencida).toBe(filas.filter((f) => f.vigencia.estado === "vencida").length);
      const conFecha = filas.filter((f) => f.proximaRevision !== null);
      // La próxima revisión es el fin de su día: no venció mientras no haya pasado.
      const dentro = conFecha.filter((f) => f.proximaRevision!.getTime() >= ahora.getTime());
      expect(conteos.dentroDelPlazoPct).toBe(Math.round((dentro.length / conFecha.length) * 100));
      expect(filas.some((f) => f.documentoId === vencido.id && f.vigencia.estado === "vencida")).toBe(true);
    }));
});
