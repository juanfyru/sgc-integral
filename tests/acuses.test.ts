/** Acuses de lectura: nacen al publicar, se superan con la versión nueva y se confirman con auditoría. */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import {
  acusesDeVersion,
  acusesPendientesDe,
  confirmarLectura,
  obtenerAcuse,
} from "@/db/consultas/distribucion/acuses";
import { tareasDeAcuses } from "@/db/consultas/distribucion/tareas";
import { transicionar } from "@/db/consultas/tramites-flujo";
import { ErrorDistribucion } from "@/lib/distribucion/tipos";
import { misTareas } from "@/lib/tareas";
import { fechaLimite } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { pdfDePrueba } from "./utiles/pdf";
import { opc, tramiteEn, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
const T1 = new Date("2026-11-20T15:00:00Z");
const T2 = new Date("2026-11-27T15:00:00Z");

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-acuses-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

const rechaza = (promesa: Promise<unknown>, mensaje: string) =>
  expect(promesa).rejects.toSatisfy((e) => e instanceof ErrorDistribucion && e.message === mensaje);

const gth = async (tx: TransactionSql) => Number((await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`)[0].id);

const publicar = (tx: TransactionSql, t: Awaited<ReturnType<typeof tramiteEn>>, ahora: Date) =>
  transicionar(
    t.admin,
    { tramiteId: t.tramiteId, etapaEsperada: "publicacion", rondaEsperada: t.ronda, accion: "publicar", credenciales: { clave: "x" } },
    opc(tx, ahora.toISOString()),
  );

const abrir = (tx: TransactionSql, versionId: number, usuarioId: number, tipo = "vista") =>
  tx`INSERT INTO eventos_consulta (tipo, documento_id, version_id, usuario_id)
    SELECT ${tipo}, documento_id, id, ${usuarioId} FROM documento_versiones WHERE id = ${versionId}`;

describe("al publicar", () => {
  it("nacen los acuses de la audiencia; los firmantes, por firma", () =>
    revertida(sql, async (tx) => {
      const lectora = await usuarioDePrueba(tx, { rol: "consulta", procesos: [await gth(tx)] });
      const t = await tramiteEn(tx, "publicacion", { principal: await pdfDePrueba([[612, 792]]) });
      try {
        await publicar(tx, t, T1);
        const filas = await tx`SELECT usuario_id, estado, modo FROM acuses WHERE version_id = ${t.versionId}`;
        expect(filas.find((f) => Number(f.usuario_id) === lectora.usuarioId)).toMatchObject({ estado: "pendiente", modo: null });
        expect(filas.find((f) => Number(f.usuario_id) === t.elaborador.usuarioId)).toMatchObject({ estado: "confirmado", modo: "firma" });
        // El admin no tiene procesos: no está en la audiencia y no recibe acuse aunque publique.
        expect(filas.some((f) => Number(f.usuario_id) === t.admin.usuarioId)).toBe(false);

        const [acuse] = await acusesPendientesDe(lectora.usuarioId, { sql: tx });
        expect(acuse.venceEn).toEqual(fechaLimite(T1, 15, zonaHoraria()));
        expect(acuse.origen).toBe("publicacion");
        expect(acuse.porQue).toMatch(/^pertenece al proceso /);
        expect((await tareasDeAcuses(lectora, { sql: tx }))[0]).toMatchObject({
          titulo: `Confirmar lectura de ${t.codigo} v2`,
          enlace: `/acuses/${acuse.id}`,
          id: `acuse:${acuse.id}`,
        });
        expect((await misTareas(lectora, { sql: tx })).tareas.map((x) => x.id)).toContain(`acuse:${acuse.id}`);

        const [aviso] = await tx`SELECT tipo, titulo, enlace FROM notificaciones WHERE usuario_id = ${lectora.usuarioId} AND tipo = 'distribucion.acuse'`;
        expect(aviso).toEqual({ tipo: "distribucion.acuse", titulo: `${t.codigo} v2 ${t.titulo}: confirme su lectura`, enlace: `/acuses/${acuse.id}` });
        // Quien firmó no recibe aviso de lo que ya leyó.
        const [{ n }] = await tx`SELECT count(*)::int AS n FROM notificaciones WHERE usuario_id = ${t.elaborador.usuarioId} AND tipo = 'distribucion.acuse'`;
        expect(n).toBe(0);

        const eventos = await tx`SELECT e.tipo FROM acuse_eventos e JOIN acuses a ON a.id = e.acuse_id
          WHERE a.version_id = ${t.versionId} AND a.usuario_id = ${t.elaborador.usuarioId} ORDER BY e.id`;
        expect(eventos.map((e) => e.tipo)).toEqual(["creado", "confirmado"]);

        const [cierre] = await tx`SELECT detalle FROM tramite_eventos WHERE tramite_id = ${t.tramiteId} AND tipo = 'publicar'`;
        expect(cierre.detalle.acuses).toMatchObject({ porFirma: expect.any(Number), creados: filas.length });
        expect(cierre.detalle.acuses.porFirma).toBeGreaterThanOrEqual(1);
      } finally {
        await t.limpiar();
      }
    }));

  it("un restringido no crea acuse a quien no lo ve, aunque su lista lo incluya", () =>
    revertida(sql, async (tx) => {
      const fuera = await usuarioDePrueba(tx, { rol: "consulta" });
      const t = await tramiteEn(tx, "publicacion", { principal: await pdfDePrueba([[612, 792]]) });
      try {
        await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE codigo = ${t.codigo}`;
        const [{ id: listaId }] = await tx`INSERT INTO listas_distribucion (nombre) VALUES (${`zz_lista_${Date.now()}`}) RETURNING id`;
        await tx`INSERT INTO lista_miembros (lista_id, tipo, referencia_id) VALUES (${listaId}, 'usuario', ${fuera.usuarioId})`;
        await tx`INSERT INTO documento_listas (documento_id, lista_id) SELECT id, ${listaId} FROM documentos WHERE codigo = ${t.codigo}`;
        await publicar(tx, t, T1);
        expect(await acusesPendientesDe(fuera.usuarioId, { sql: tx })).toEqual([]);
        const filas = await tx`SELECT 1 FROM acuses WHERE version_id = ${t.versionId}`;
        expect(filas.length).toBeGreaterThan(0);
      } finally {
        await t.limpiar();
      }
    }));

  it("quien está en una lista recibe «está en la lista …»", () =>
    revertida(sql, async (tx) => {
      const miembro = await usuarioDePrueba(tx, { rol: "consulta" });
      const t = await tramiteEn(tx, "publicacion", { principal: await pdfDePrueba([[612, 792]]) });
      try {
        const nombre = `zz_lista_${Date.now()}`;
        const [{ id: listaId }] = await tx`INSERT INTO listas_distribucion (nombre) VALUES (${nombre}) RETURNING id`;
        await tx`INSERT INTO lista_miembros (lista_id, tipo, referencia_id) VALUES (${listaId}, 'usuario', ${miembro.usuarioId})`;
        await tx`INSERT INTO documento_listas (documento_id, lista_id) SELECT id, ${listaId} FROM documentos WHERE codigo = ${t.codigo}`;
        await publicar(tx, t, T1);
        const [acuse] = await acusesPendientesDe(miembro.usuarioId, { sql: tx });
        expect(acuse.porQue).toBe(`está en la lista ${nombre}`);
      } finally {
        await t.limpiar();
      }
    }));
});

describe("confirmar la lectura", () => {
  it("exige ser el destinatario, estar pendiente y haber abierto el documento", () =>
    revertida(sql, async (tx) => {
      const lectora = await usuarioDePrueba(tx, { rol: "consulta", procesos: [await gth(tx)] });
      const otra = await usuarioDePrueba(tx, { rol: "consulta", procesos: [await gth(tx)] });
      const t = await tramiteEn(tx, "publicacion", { principal: await pdfDePrueba([[612, 792]]) });
      try {
        await publicar(tx, t, T1);
        const [{ id }] = await acusesPendientesDe(lectora.usuarioId, { sql: tx });

        await rechaza(confirmarLectura(id, lectora, { sql: tx, ahora: T2 }), "Abra el documento antes de confirmar la lectura");
        await rechaza(confirmarLectura(id, otra, { sql: tx, ahora: T2 }), "La tarea no existe");
        expect(await obtenerAcuse(id, otra, { sql: tx })).toBeNull();
        expect((await obtenerAcuse(id, lectora, { sql: tx }))?.abierto).toBe(false);

        await abrir(tx, t.versionId as number, lectora.usuarioId, "descarga");
        expect((await obtenerAcuse(id, lectora, { sql: tx }))?.abierto).toBe(true);
        await confirmarLectura(id, lectora, { sql: tx, ahora: T2 });

        expect(await obtenerAcuse(id, lectora, { sql: tx })).toMatchObject({ estado: "confirmado", modo: "individual", confirmadoEn: T2 });
        const eventos = await tx`SELECT tipo, usuario_id FROM acuse_eventos WHERE acuse_id = ${id} ORDER BY id`;
        expect(eventos.map((e) => e.tipo)).toEqual(["creado", "confirmado"]);
        expect(Number(eventos[1].usuario_id)).toBe(lectora.usuarioId);
        const [auditoria] = await tx`SELECT usuario_id, entidad_id, detalle FROM auditoria WHERE accion = 'acuse_lectura' AND entidad = 'acuse' AND entidad_id = ${id}`;
        expect(Number(auditoria.usuario_id)).toBe(lectora.usuarioId);
        expect(auditoria.detalle).toEqual({ codigo: t.codigo, version: 2, acuseId: id });

        await rechaza(confirmarLectura(id, lectora, { sql: tx, ahora: T2 }), "Esta lectura ya no está pendiente");
        expect(await acusesPendientesDe(lectora.usuarioId, { sql: tx })).toEqual([]);
        expect(await tareasDeAcuses(lectora, { sql: tx })).toEqual([]);
        const resumen = await acusesDeVersion(t.versionId as number, { sql: tx });
        expect(resumen.confirmados).toBeGreaterThanOrEqual(2);
        expect(resumen.porcentaje).not.toBeNull();
      } finally {
        await t.limpiar();
      }
    }));
});

describe("al llegar una versión nueva", () => {
  it("supera los pendientes de la anterior y no los cuenta en el porcentaje", () =>
    revertida(sql, async (tx) => {
      const lectora = await usuarioDePrueba(tx, { rol: "consulta", procesos: [await gth(tx)] });
      const t = await tramiteEn(tx, "publicacion", { principal: await pdfDePrueba([[612, 792]]) });
      let t2: Awaited<ReturnType<typeof tramiteEn>> | null = null;
      try {
        await publicar(tx, t, T1);
        const [pendiente] = await acusesPendientesDe(lectora.usuarioId, { sql: tx });
        const antes = await acusesDeVersion(t.versionId as number, { sql: tx });
        expect(antes.pendientes).toBeGreaterThanOrEqual(1);

        t2 = await tramiteEn(tx, "publicacion", { codigo: t.codigo, principal: await pdfDePrueba([[612, 792]]) });
        await publicar(tx, t2, T2);

        const [fila] = await tx`SELECT estado, cerrado_en, motivo_cierre FROM acuses WHERE id = ${pendiente.id}`;
        expect(fila).toEqual({ estado: "superado", cerrado_en: T2, motivo_cierre: "nueva_version" });
        const eventos = await tx`SELECT tipo FROM acuse_eventos WHERE acuse_id = ${pendiente.id} ORDER BY id`;
        expect(eventos.map((e) => e.tipo)).toEqual(["creado", "superado"]);
        expect((await acusesDeVersion(t.versionId as number, { sql: tx })).pendientes).toBe(0);
        // Hay un acuse nuevo, de la versión 3, para la misma persona.
        const [nuevo] = await acusesPendientesDe(lectora.usuarioId, { sql: tx });
        expect(nuevo).toMatchObject({ version: 3 });
        expect(nuevo.id).not.toBe(pendiente.id);
      } finally {
        await t2?.limpiar();
        await t.limpiar();
      }
    }));
});
