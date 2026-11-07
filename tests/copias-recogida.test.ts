/** La vida de la copia: recibido, recogida automática al dejar de ser vigente, reemplazo y tareas. */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { anularVigenteEn, deshacerCargaEn } from "@/db/consultas/admin";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import {
  confirmarRecibido,
  confirmarRecogida,
  confirmarReemplazo,
  copiasDeDocumento,
  obtenerCopia,
  reemplazarCopias,
} from "@/db/consultas/distribucion/copias";
import { abrirHallazgoDeRecogida } from "@/db/consultas/distribucion/hallazgos";
import { tareasDeCopias } from "@/db/consultas/distribucion/tareas";
import { alDejarDeSerVigente } from "@/db/consultas/distribucion/version-vigencia";
import { transicionar } from "@/db/consultas/tramites-flujo";
import { ErrorDistribucion } from "@/lib/distribucion/tipos";
import { fechaLimite } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { copiaDePrueba, copiaSobreVigente, puntoDePrueba, vigenteConPdf } from "./utiles/distribucion";
import { pdfDePrueba } from "./utiles/pdf";
import { opc, sesionAdmin, tramiteEn, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
const T0 = new Date("2026-11-12T15:00:00Z");
const T1 = new Date("2026-11-20T15:00:00Z");

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-recogida-"));
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

const ultimoAviso = async (tx: TransactionSql, usuarioId: number) =>
  (await tx`SELECT tipo, titulo, enlace FROM notificaciones WHERE usuario_id = ${usuarioId} ORDER BY id DESC LIMIT 1`)[0];

describe("al dejar de ser vigente", () => {
  it("al publicar por trámite, las copias de la obsoleta pasan a por recoger con tarea y aviso", () =>
    revertida(sql, async (tx) => {
      const t = await tramiteEn(tx, "publicacion", { principal: await pdfDePrueba([[612, 792]]) });
      try {
        const resp = await usuarioDePrueba(tx, { rol: "consulta" });
        const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["GTH"] });
        const { copiaId } = await copiaSobreVigente(tx, { emisor: t.admin, codigo: t.codigo, punto });
        await transicionar(
          t.admin,
          { tramiteId: t.tramiteId, etapaEsperada: "publicacion", rondaEsperada: t.ronda, accion: "publicar", credenciales: { clave: "x" } },
          opc(tx, "2026-11-20T15:00:00Z"),
        );
        const copia = await obtenerCopia(copiaId, resp, { sql: tx });
        expect(copia).toMatchObject({ estado: "por_recoger", motivoPorRecoger: "nueva_version", versionVigente: false });
        expect(copia?.venceEn).toEqual(fechaLimite(T1, (await obtenerConfigDocumental({ sql: tx })).distribucion.plazoRecogidaDias, zonaHoraria()));
        expect(copia?.fechas.porRecogerEn).toEqual(T1);
        expect((await tareasDeCopias(resp, { sql: tx })).map((x) => x.titulo)).toEqual([
          `Recoger la copia N.º 01 de ${t.codigo} v1 en ${punto.nombre}`,
        ]);
        expect(await ultimoAviso(tx, resp.usuarioId)).toEqual({
          tipo: "distribucion.recoger",
          titulo: `Recoja la copia N.º 01 de ${t.codigo} v1 en ${punto.nombre}: la versión 2 es la vigente desde hoy`,
          enlace: `/distribucion/copias/${copiaId}`,
        });
        const [evento] = await tx`SELECT detalle FROM copia_eventos WHERE copia_id = ${copiaId} AND tipo = 'por_recoger'`;
        expect(evento.detalle).toEqual({ motivo: "nueva_version", nuevaVersionId: (t.versionId as number) });
      } finally {
        await t.limpiar();
      }
    }));

  it("lo mismo al ejecutar una eliminación y al deshacer una carga", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["GTH"] });
      const a = await vigenteConPdf(tx, { proceso: "GTH", tipo: "PR" });
      const b = await vigenteConPdf(tx, { proceso: "GTH", tipo: "PR" });
      try {
        const copiaA = await copiaDePrueba(tx, { emisor: admin, documento: a.documento, punto, ahora: T0 });
        const copiaB = await copiaDePrueba(tx, { emisor: admin, documento: b.documento, punto, ahora: T0 });

        await anularVigenteEn(tx, a.documento.id, admin.usuarioId, T1);
        expect(await obtenerCopia(copiaA.copiaId, resp, { sql: tx })).toMatchObject({
          estado: "por_recoger",
          motivoPorRecoger: "eliminado",
        });
        expect((await ultimoAviso(tx, resp.usuarioId)).titulo).toBe(
          `Recoja la copia N.º 01 de ${a.documento.codigo} v1 en ${punto.nombre}: el documento fue eliminado`,
        );

        await deshacerCargaEn(tx, b.documento.id, "Se subió el archivo equivocado.", admin.usuarioId, T1);
        expect(await obtenerCopia(copiaB.copiaId, resp, { sql: tx })).toMatchObject({
          estado: "por_recoger",
          motivoPorRecoger: "carga_deshecha",
        });
        expect((await ultimoAviso(tx, resp.usuarioId)).titulo).toBe(
          `Recoja la copia N.º 01 de ${b.documento.codigo} v1 en ${punto.nombre}: la carga se deshizo`,
        );
      } finally {
        await a.limpiar();
        await b.limpiar();
      }
    }));

  it("no hace nada si la versión no tiene copias vivas, y no toca las anuladas", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["GTH"] });
      const v = await vigenteConPdf(tx, { proceso: "GTH", tipo: "PR" });
      try {
        expect(await alDejarDeSerVigente(tx, v.versionId, "nueva_version", T1)).toEqual({ copiasPorRecoger: 0 });
        const { copiaId } = await copiaDePrueba(tx, { emisor: admin, documento: v.documento, punto, ahora: T0 });
        await tx`UPDATE copias_controladas SET estado = 'anulada', anulada_en = ${T0}, motivo_anulacion = 'error' WHERE id = ${copiaId}`;
        expect(await alDejarDeSerVigente(tx, v.versionId, "eliminado", T1)).toEqual({ copiasPorRecoger: 0 });
        expect((await obtenerCopia(copiaId, admin, { sql: tx }))?.estado).toBe("anulada");
      } finally {
        await v.limpiar();
      }
    }));
});

describe("recibido y recogida", () => {
  it("solo el responsable actual recibe; la segunda confirmación falla; cambiar el responsable traslada la tarea", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const relevo = await usuarioDePrueba(tx, { rol: "consulta" });
      const ajeno = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["GTH"] });
      const v = await vigenteConPdf(tx, { proceso: "GTH", tipo: "PR" });
      try {
        const { copiaId } = await copiaDePrueba(tx, { emisor: admin, documento: v.documento, punto, ahora: T0 });
        expect((await tareasDeCopias(resp, { sql: tx })).map((x) => x.titulo)).toEqual([
          `Recibir la copia N.º 01 de ${v.documento.codigo} v1 en ${punto.nombre}`,
        ]);

        await expect(confirmarRecibido(copiaId, ajeno, { sql: tx, ahora: T0 })).rejects.toThrow("La copia no existe");
        await rechaza(confirmarRecibido(copiaId, admin, { sql: tx, ahora: T0 }), "Solo el responsable actual del punto confirma el recibido");

        await tx`UPDATE puntos_uso SET responsable_id = ${relevo.usuarioId} WHERE id = ${punto.id}`;
        expect(await tareasDeCopias(resp, { sql: tx })).toEqual([]);
        expect((await tareasDeCopias(relevo, { sql: tx })).map((x) => x.enlace)).toEqual([`/distribucion/copias/${copiaId}`]);
        await rechaza(confirmarRecibido(copiaId, resp, { sql: tx, ahora: T0 }), "Solo el responsable actual del punto confirma el recibido");

        const tarde = new Date(T0.getTime() + 3_600_000);
        await confirmarRecibido(copiaId, relevo, { sql: tx, ahora: tarde });
        const copia = await obtenerCopia(copiaId, relevo, { sql: tx });
        expect(copia).toMatchObject({ estado: "recibida", venceEn: null, acciones: [] });
        expect(copia?.fechas.recibidaEn).toEqual(tarde);
        expect((await tx`SELECT tipo FROM copia_eventos WHERE copia_id = ${copiaId} ORDER BY id`).map((e) => e.tipo)).toEqual(["emitida", "recibida"]);
        const [auditoria] = await tx`SELECT usuario_id FROM auditoria WHERE accion = 'copia_recibida' AND entidad_id = ${copiaId}`;
        expect(Number(auditoria.usuario_id)).toBe(relevo.usuarioId);
        await rechaza(confirmarRecibido(copiaId, relevo, { sql: tx }), "La copia ya no está en ese estado");
        expect(await tareasDeCopias(relevo, { sql: tx })).toEqual([]);
      } finally {
        await v.limpiar();
      }
    }));

  it("la recogida la confirma el responsable actual o quien gestiona; la segunda falla; limpia el vencimiento", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: (await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`).map((p) => Number(p.id)) });
      const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["GTH"] });
      const a = await vigenteConPdf(tx, { proceso: "GTH", tipo: "PR" });
      const b = await vigenteConPdf(tx, { proceso: "GTH", tipo: "PR" });
      try {
        const ca = await copiaDePrueba(tx, { emisor: admin, documento: a.documento, punto, ahora: T0 });
        const cb = await copiaDePrueba(tx, { emisor: admin, documento: b.documento, punto, ahora: T0 });
        await confirmarRecibido(ca.copiaId, resp, { sql: tx, ahora: T0 });
        await alDejarDeSerVigente(tx, a.versionId, "nueva_version", T1);
        await alDejarDeSerVigente(tx, b.versionId, "nueva_version", T1);

        await rechaza(confirmarRecogida(ca.copiaId, lider, "devuelta", { sql: tx }), "Solo el responsable actual del punto confirma la recogida");
        await rechaza(confirmarRecogida(ca.copiaId, resp, "retirada_en_verificacion" as never, { sql: tx }), "Elija qué se hizo con la copia");

        const dia = new Date(T1.getTime() + 86_400_000);
        await confirmarRecogida(ca.copiaId, resp, "destruida", { sql: tx, ahora: dia });
        expect(await obtenerCopia(ca.copiaId, resp, { sql: tx })).toMatchObject({ estado: "recogida", destinoRecogida: "destruida", venceEn: null, acciones: [] });
        const [evento] = await tx`SELECT detalle, usuario_id FROM copia_eventos WHERE copia_id = ${ca.copiaId} AND tipo = 'recogida'`;
        expect(evento.detalle).toEqual({ usuarioId: resp.usuarioId, destino: "destruida" });
        await rechaza(confirmarRecogida(ca.copiaId, resp, "devuelta", { sql: tx }), "La copia ya no está en ese estado");

        await confirmarRecogida(cb.copiaId, admin, "devuelta", { sql: tx, ahora: dia });
        expect((await obtenerCopia(cb.copiaId, admin, { sql: tx }))?.destinoRecogida).toBe("devuelta");
        const [{ n }] = await tx`SELECT count(*)::int AS n FROM hallazgos WHERE copia_id IN (${ca.copiaId}, ${cb.copiaId})`;
        expect(n).toBe(0);
        expect(await tareasDeCopias(resp, { sql: tx })).toEqual([]);
      } finally {
        await a.limpiar();
        await b.limpiar();
      }
    }));

  it("recogida «no se encontró» abre un hallazgo al responsable", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["GTH"] });
      const v = await vigenteConPdf(tx, { proceso: "GTH", tipo: "PR" });
      try {
        const { copiaId } = await copiaDePrueba(tx, { emisor: admin, documento: v.documento, punto, ahora: T0 });
        await alDejarDeSerVigente(tx, v.versionId, "eliminado", T1);
        await confirmarRecogida(copiaId, resp, "no_encontrada", { sql: tx, ahora: T1 });
        const [h] = await tx`SELECT * FROM hallazgos WHERE copia_id = ${copiaId}`;
        expect(h).toMatchObject({
          origen: "recogida",
          estado: "abierto",
          retirado_en_el_acto: false,
          descripcion: `La copia N.º 01 de ${v.documento.codigo} v1 no se encontró al recogerla`,
        });
        expect([Number(h.punto_uso_id), Number(h.responsable_id), Number(h.documento_id)]).toEqual([punto.id, resp.usuarioId, v.documento.id]);
        expect(h.vence_en).toEqual(fechaLimite(T1, (await obtenerConfigDocumental({ sql: tx })).distribucion.plazoCorreccionDias, zonaHoraria()));
        expect(await ultimoAviso(tx, resp.usuarioId)).toMatchObject({ tipo: "distribucion.hallazgo", enlace: `/distribucion/copias/${copiaId}` });
      } finally {
        await v.limpiar();
      }
    }));
});

describe("hallazgo de recogida", () => {
  it("abrirHallazgoDeRecogida abre el hallazgo de origen recogida y avisa al responsable actual", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["GTH"] });
      const v = await vigenteConPdf(tx, { proceso: "GTH", tipo: "PR" });
      try {
        const { copiaId } = await copiaDePrueba(tx, { emisor: admin, documento: v.documento, punto, ahora: T0 });
        const copia = (await obtenerCopia(copiaId, admin, { sql: tx }))!;
        await abrirHallazgoDeRecogida(tx, copia, T1, 5);
        const [h] = await tx`SELECT origen, estado, copia_id, vence_en, creado_en FROM hallazgos WHERE copia_id = ${copiaId}`;
        expect(h).toMatchObject({ origen: "recogida", estado: "abierto", vence_en: fechaLimite(T1, 5, zonaHoraria()), creado_en: T1 });
        expect(await ultimoAviso(tx, resp.usuarioId)).toMatchObject({ tipo: "distribucion.hallazgo", enlace: `/distribucion/copias/${copiaId}` });
      } finally {
        await v.limpiar();
      }
    }));
});

describe("reemplazo", () => {
  it("reemplazar emite una por punto, enlazada, y una sola tarea doble la resuelve", () =>
    revertida(sql, async (tx) => {
      const t = await tramiteEn(tx, "publicacion", { principal: await pdfDePrueba([[612, 792]]) });
      try {
        const resp = await usuarioDePrueba(tx, { rol: "consulta" });
        const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["GTH"] });
        const vieja = await copiaSobreVigente(tx, { emisor: t.admin, codigo: t.codigo, punto, ahora: T0 });
        await confirmarRecibido(vieja.copiaId, resp, { sql: tx, ahora: T0 });
        await transicionar(
          t.admin,
          { tramiteId: t.tramiteId, etapaEsperada: "publicacion", rondaEsperada: t.ronda, accion: "publicar", credenciales: { clave: "x" } },
          opc(tx, "2026-11-20T15:00:00Z"),
        );
        const [{ id: documentoId }] = await tx`SELECT documento_id AS id FROM documento_versiones WHERE id = ${t.versionId}`;

        const antes = await copiasDeDocumento(Number(documentoId), t.admin, { sql: tx });
        expect(antes).toMatchObject({ puedeReemplazar: true, versionVigenteId: (t.versionId as number) });
        expect(antes.porRecoger.map((c) => c.id)).toEqual([vieja.copiaId]);

        expect(await reemplazarCopias(t.admin, t.versionId as number, { sql: tx, ahora: T1 })).toEqual({ emitidas: 1 });
        expect(await reemplazarCopias(t.admin, t.versionId as number, { sql: tx, ahora: T1 })).toEqual({ emitidas: 0 });

        const [nueva] = await tx`SELECT id, numero, estado, reemplaza_copia_id FROM copias_controladas WHERE version_id = ${t.versionId}`;
        expect({ numero: nueva.numero, estado: nueva.estado, reemplaza: Number(nueva.reemplaza_copia_id) }).toEqual({
          numero: 1,
          estado: "emitida",
          reemplaza: vieja.copiaId,
        });
        expect((await tareasDeCopias(resp, { sql: tx })).map((x) => [x.id, x.titulo])).toEqual([
          [`copia:${nueva.id}`, `Recibir la copia N.º 01 de la v2 y retirar la N.º 01 de la v1 en ${punto.nombre}`],
        ]);
        expect((await copiasDeDocumento(Number(documentoId), t.admin, { sql: tx })).puedeReemplazar).toBe(false);

        await confirmarReemplazo(Number(nueva.id), resp, "devuelta", { sql: tx, ahora: T1 });
        expect(await obtenerCopia(Number(nueva.id), resp, { sql: tx })).toMatchObject({ estado: "recibida", reemplazaCopiaId: vieja.copiaId });
        expect(await obtenerCopia(vieja.copiaId, resp, { sql: tx })).toMatchObject({ estado: "recogida", destinoRecogida: "devuelta" });
        expect(await tareasDeCopias(resp, { sql: tx })).toEqual([]);
        await rechaza(confirmarReemplazo(Number(nueva.id), resp, "devuelta", { sql: tx }), "La copia ya no está en ese estado");
      } finally {
        await t.limpiar();
      }
    }));

  it("sin PDF en la versión nueva no reemplaza, y una copia sin reemplazo no se confirma como tal", () =>
    revertida(sql, async (tx) => {
      const t = await tramiteEn(tx, "publicacion", { principal: await pdfDePrueba([[612, 792]]) });
      try {
        const resp = await usuarioDePrueba(tx, { rol: "consulta" });
        const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["GTH"] });
        const vieja = await copiaSobreVigente(tx, { emisor: t.admin, codigo: t.codigo, punto, ahora: T0 });
        await transicionar(
          t.admin,
          { tramiteId: t.tramiteId, etapaEsperada: "publicacion", rondaEsperada: t.ronda, accion: "publicar", credenciales: { clave: "x" } },
          opc(tx, "2026-11-20T15:00:00Z"),
        );
        await rechaza(confirmarReemplazo(vieja.copiaId, resp, "devuelta", { sql: tx }), "Esta copia no reemplaza a otra");
        await tx`DELETE FROM archivos WHERE version_id = ${t.versionId} AND rol = 'principal'`;
        await rechaza(
          reemplazarCopias(t.admin, t.versionId as number, { sql: tx }),
          "La versión nueva no tiene PDF: las copias anteriores se recogen sin reemplazo",
        );
      } finally {
        await t.limpiar();
      }
    }));
});
