/**
 * Quién lee y quién escribe los archivos de un trámite, contra la demo ya sembrada. Todo corre
 * dentro de una transacción que se revierte; lo que llega al almacén lo borra `limpiar`.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import {
  editarVersionBorrador,
  eliminarArchivoBorrador,
  exigirEscrituraEnVersion,
  obtenerDocumentoAdmin,
  registrarArchivo,
} from "@/db/consultas/admin";
import {
  archivoDeTramite,
  autorizarArchivoDeTramite,
  borradorDeTramite,
} from "@/db/consultas/tramites-archivos";
import { ErrorTramite, type SesionFlujo } from "@/db/consultas/tramites-flujo";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { archivoPrincipal, sesionDe, tramiteEn } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

describe("autorizarArchivoDeTramite", () => {
  it("solo el elaborador escribe, y solo en elaboración", () => revertida(sql, async (tx) => {
    const consulta = await sesionDe(tx, "consulta");
    const t = await tramiteEn(tx, "elaboracion", { elaborador: consulta });
    const otro = await tramiteEn(tx, "elaboracion", { codigo: "GTH-PR-01" });
    const puede = (id: number, s: SesionFlujo, op: "leer" | "escribir") => autorizarArchivoDeTramite(id, s, op, { sql: tx });
    expect((await puede(t.tramiteId, consulta, "escribir")).ok).toBe(true);
    expect(await puede(otro.tramiteId, consulta, "escribir")).toEqual({ ok: false, estado: 404 });   // trámite ajeno
    expect(await puede(otro.tramiteId, consulta, "leer")).toEqual({ ok: false, estado: 404 });
    expect(await puede(t.tramiteId, t.revisor, "escribir")).toEqual({ ok: false, estado: 404 });     // lo ve, pero no elabora
    expect((await puede(t.tramiteId, t.revisor, "leer")).ok).toBe(true);
    await tx`UPDATE tramites SET etapa = 'revision' WHERE id = ${t.tramiteId}`;
    expect(await puede(t.tramiteId, consulta, "escribir")).toEqual({ ok: false, estado: 409 });     // suyo, fuera de elaboración
    await tx`UPDATE tramites SET etapa = 'publicado' WHERE id = ${t.tramiteId}`;
    expect(await puede(t.tramiteId, consulta, "leer")).toEqual({ ok: false, estado: 404 });          // cerrado: ya no por esta ruta
  }));

  it("da el destino de la ruta física: el código y el número de la versión en trámite", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    expect(await autorizarArchivoDeTramite(t.tramiteId, t.elaborador, "escribir", { sql: tx }))
      .toEqual({ ok: true, versionId: t.versionId, codigo: "GTH-PR-02", numero: 2 });
  }));

  it("un trámite que no existe, o que aún no tiene versión, da 404", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aceptacion");
    expect(await autorizarArchivoDeTramite(t.tramiteId, t.admin, "leer", { sql: tx })).toEqual({ ok: false, estado: 404 });
    expect(await autorizarArchivoDeTramite(999_999_999, t.admin, "leer", { sql: tx })).toEqual({ ok: false, estado: 404 });
  }));
});

describe("archivoDeTramite", () => {
  it("solo sirve archivos de la versión del trámite, y nunca un acta", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    const otro = await tramiteEn(tx, "elaboracion", { codigo: "GTH-PR-01" });
    const propio = await archivoPrincipal(tx, t.versionId!);
    const ajeno = await archivoPrincipal(tx, otro.versionId!);
    try {
      expect(await archivoDeTramite(t.tramiteId, propio.archivoId, { sql: tx })).toMatchObject({ mime: "application/pdf" });
      expect(await archivoDeTramite(t.tramiteId, ajeno.archivoId, { sql: tx })).toBeNull();
      const [acta] = await tx`INSERT INTO archivos (version_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
        VALUES (${t.versionId}, 'acta_aprobacion', ${`zz-pruebas/acta-${Date.now()}.pdf`}, 'acta.pdf', 'pdf', 'application/pdf', 10, ${"a".repeat(64)})
        RETURNING id`;
      expect(await archivoDeTramite(t.tramiteId, Number(acta.id), { sql: tx })).toBeNull();
    } finally {
      await propio.limpiar();
      await ajeno.limpiar();
    }
  }));

  it("en una eliminación no hay borrador: la versión vigente no sale sin marca por esta ruta", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aprobacion", { codigo: "GTH-PR-01", tipo: "eliminar" });
    const [vigente] = await tx`SELECT id FROM archivos WHERE version_id = ${t.versionId} AND rol = 'principal'`;
    expect(await archivoDeTramite(t.tramiteId, Number(vigente.id), { sql: tx })).toBeNull();
  }));
});

describe("una versión en trámite solo se toca desde el trámite", () => {
  const EN_TRAMITE = "Esta versión está en un trámite: se trabaja desde el trámite";
  const FUERA = "Este trámite ya no está en elaboración";
  let serie = 0;
  const anexo = (versionId: number) => ({
    versionId,
    rol: "anexo",
    ruta: `zz-pruebas/fila-${Date.now()}-${++serie}.pdf`,
    nombreOriginal: "anexo.pdf",
    extension: "pdf",
    mime: "application/pdf",
    tamanoBytes: 10,
    hashSha256: "a".repeat(64),
  });
  const version = {
    fechaElaboracion: null, fechaRevision: null, fechaAprobacion: null,
    elaboro: "Otra persona", reviso: null, aprobo: null, resumenCambios: "Texto del panel",
  };

  it("el panel no sube, no quita y no edita mientras el trámite está abierto", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    const a = await archivoPrincipal(tx, t.versionId!);
    try {
      const actor = t.admin.usuarioId;
      await expect(registrarArchivo(anexo(t.versionId!), actor, { sql: tx })).rejects.toThrow(EN_TRAMITE);
      await expect(eliminarArchivoBorrador(a.archivoId, actor, { sql: tx })).rejects.toThrow(EN_TRAMITE);
      await expect(editarVersionBorrador(t.versionId!, version, actor, { sql: tx })).rejects.toThrow(EN_TRAMITE);
      const [v] = await tx`SELECT elaboro, resumen_cambios FROM documento_versiones WHERE id = ${t.versionId}`;
      expect(v).toMatchObject({ elaboro: null, resumen_cambios: null });
      const [{ archivos }] = await tx`SELECT count(*)::int AS archivos FROM archivos WHERE version_id = ${t.versionId}`;
      expect(archivos).toBe(1);
    } finally { await a.limpiar(); }
  }));

  it("el elaborador sigue pudiendo desde su trámite, en elaboración", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    const opciones = { tramiteId: t.tramiteId, sql: tx };
    const { id } = await registrarArchivo(anexo(t.versionId!), t.elaborador.usuarioId, opciones);
    await eliminarArchivoBorrador(id, t.elaborador.usuarioId, opciones);
    const [{ archivos }] = await tx`SELECT count(*)::int AS archivos FROM archivos WHERE version_id = ${t.versionId}`;
    expect(archivos).toBe(0);
  }));

  it("el trámite no edita los datos de la versión: `editarVersionBorrador` es solo del panel", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    const opciones = { tramiteId: t.tramiteId, sql: tx } as Parameters<typeof editarVersionBorrador>[3];
    await expect(editarVersionBorrador(t.versionId!, version, t.elaborador.usuarioId, opciones)).rejects.toThrow(EN_TRAMITE);
  }));

  it("una reasignación deja fuera al elaborador anterior, aunque su subida ya estuviera en curso", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    const a = await archivoPrincipal(tx, t.versionId!);
    try {
      const nuevo = await sesionDe(tx, "consulta");
      await tx`UPDATE tramites SET elaborador_id = ${nuevo.usuarioId} WHERE id = ${t.tramiteId}`;
      const opciones = { tramiteId: t.tramiteId, sql: tx };
      const ANTERIOR = "Ya no es quien elabora este trámite";
      await expect(registrarArchivo(anexo(t.versionId!), t.elaborador.usuarioId, opciones)).rejects.toThrow(ANTERIOR);
      await expect(eliminarArchivoBorrador(a.archivoId, t.elaborador.usuarioId, opciones)).rejects.toThrow(ANTERIOR);
      await expect(registrarArchivo(anexo(t.versionId!), t.elaborador.usuarioId, opciones)).rejects.toBeInstanceOf(ErrorTramite);
      await expect(registrarArchivo(anexo(t.versionId!), nuevo.usuarioId, opciones)).resolves.toMatchObject({ id: expect.anything() });
    } finally { await a.limpiar(); }
  }));

  it("con el trámite en revisión tampoco se puede desde el trámite, y el panel sigue fuera", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      const [a] = await tx`SELECT id FROM archivos WHERE version_id = ${t.versionId}`;
      const actor = t.elaborador.usuarioId;
      const opciones = { tramiteId: t.tramiteId, sql: tx };
      await expect(registrarArchivo(anexo(t.versionId!), actor, opciones)).rejects.toThrow(FUERA);
      await expect(eliminarArchivoBorrador(Number(a.id), actor, opciones)).rejects.toThrow(FUERA);
      await expect(registrarArchivo(anexo(t.versionId!), actor, { sql: tx })).rejects.toThrow(EN_TRAMITE);
    } finally { await t.limpiar(); }
  }));

  it("otro trámite no da permiso sobre esta versión", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    const otro = await tramiteEn(tx, "elaboracion", { codigo: "GTH-PR-01" });
    await expect(registrarArchivo(anexo(t.versionId!), t.elaborador.usuarioId, { tramiteId: otro.tramiteId, sql: tx })).rejects.toThrow(FUERA);
  }));

  it("sin trámite, o con el trámite cerrado, el panel vuelve a poder", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    await tx`UPDATE tramites SET etapa = 'cancelado' WHERE id = ${t.tramiteId}`;
    await expect(registrarArchivo(anexo(t.versionId!), t.admin.usuarioId, { sql: tx })).resolves.toMatchObject({ id: expect.anything() });
  }));

  it("el trámite se lee con FOR SHARE, para esperar a una firma en curso", async () => {
    // Un test no puede dejar un trámite confirmado en `sgc`, y sin eso una segunda conexión no lo ve.
    const consultas: string[] = [];
    const tx = (cadenas: TemplateStringsArray) => {
      consultas.push(cadenas.join("?"));
      return Promise.resolve([]);
    };
    await exigirEscrituraEnVersion(tx as unknown as Parameters<typeof exigirEscrituraEnVersion>[0], 1);
    expect(consultas).toHaveLength(1);
    expect(consultas[0]).toContain("FOR SHARE");
  });

  it("los rechazos de quitar un archivo son de negocio: un archivo que no existe y una versión que no es borrador", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    const quitar = (id: number) => eliminarArchivoBorrador(id, t.admin.usuarioId, { sql: tx });
    await expect(quitar(999_999_999)).rejects.toThrow("El archivo no existe");
    await expect(quitar(999_999_999)).rejects.toBeInstanceOf(ErrorTramite);
    const [vigente] = await tx`SELECT a.id FROM archivos a
      JOIN documento_versiones v ON v.id = a.version_id AND v.estado = 'vigente'
      JOIN documentos d ON d.id = v.documento_id AND d.codigo = 'GTH-PR-01'
      LIMIT 1`;
    await expect(quitar(Number(vigente.id))).rejects.toThrow("Solo se pueden eliminar archivos de una versión en borrador");
    await expect(quitar(Number(vigente.id))).rejects.toBeInstanceOf(ErrorTramite);
  }));

  it("el panel sabe qué trámite tiene cada versión, y nada más que los abiertos", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    const [{ numero }] = await tx`SELECT numero FROM tramites WHERE id = ${t.tramiteId}`;
    const version = async () => {
      const doc = await obtenerDocumentoAdmin("GTH-PR-02", t.admin, { sql: tx });
      return doc?.versiones.find((v) => Number(v.id) === t.versionId);
    };
    expect((await version())?.tramite).toEqual({ id: t.tramiteId, numero });
    await tx`UPDATE tramites SET etapa = 'cancelado' WHERE id = ${t.tramiteId}`;
    expect((await version())?.tramite).toBeNull();
  }));
});

describe("archivoPrincipal", () => {
  it("escribe un PDF real con su huella verdadera, y limpiar lo borra", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    const a = await archivoPrincipal(tx, t.versionId!);
    const [{ ruta }] = await tx`SELECT ruta FROM archivos WHERE id = ${a.archivoId}`;
    const absoluta = resolverRutaAlmacen(ruta)!;
    try {
      expect(ruta).toMatch(/^zz-pruebas\//);
      const bytes = await readFile(absoluta);
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(a.hash);
    } finally { await a.limpiar(); }
    await expect(stat(absoluta)).rejects.toThrow();
  }));
});

describe("borradorDeTramite", () => {
  it("trae los archivos, el control de cambios, las observaciones abiertas y la plantilla", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      await tx`INSERT INTO tramite_observaciones (tramite_id, numero, ronda, origen, texto, autor_id, respuesta)
        VALUES (${t.tramiteId}, 1, 1, 'revision', 'Falta el responsable.', ${t.revisor.usuarioId}, 'Se agregó.'),
               (${t.tramiteId}, 2, 1, 'revision', 'Ya cerrada.', ${t.revisor.usuarioId}, NULL)`;
      await tx`UPDATE tramite_observaciones SET estado = 'cerrada' WHERE tramite_id = ${t.tramiteId} AND numero = 2`;
      const b = await borradorDeTramite(t.tramiteId, { sql: tx });
      expect(b.archivos).toHaveLength(1);
      expect(b.archivos[0]).toMatchObject({ rol: "principal", mime: "application/pdf" });
      expect(b.archivos[0].hashSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(b.controlCambios).toBeTruthy();
      expect(b.observaciones).toEqual([{ numero: 1, texto: "Falta el responsable.", respuesta: "Se agregó." }]);

      const [plantilla] = await tx`SELECT d.id, d.codigo, v.numero FROM documentos d
        JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente' WHERE d.codigo = 'GTH-PR-01'`;
      await tx`UPDATE tipos_documento SET plantilla_documento_id = ${plantilla.id}
        WHERE id = (SELECT tipo_id FROM documentos WHERE codigo = 'GTH-PR-02')`;
      expect((await borradorDeTramite(t.tramiteId, { sql: tx })).plantilla).toEqual({ codigo: "GTH-PR-01", version: plantilla.numero });
    } finally { await t.limpiar(); }
  }));
});
