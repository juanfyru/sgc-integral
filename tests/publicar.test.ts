/**
 * Consultas de escritura del admin contra la BD de desarrollo (migrada y
 * sembrada): crear documento/versión, editar, publicar con obsolescencia
 * automática (regla ISO 1) y anular. El camino directo solo da de alta: la segunda
 * versión la abre `crearVersionBorradorEn` y la publica `aplicarPublicacion`, como
 * hace un trámite (ver tests/camino-directo.test.ts).
 */
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// vitest pone NODE_ENV=test y en ese modo @next/env ignora .env.local;
// se carga con el mecanismo nativo de Node (>=20.12).
if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import {
  anularVigenteEn,
  aplicarPublicacion,
  asegurarAdmin,
  crearDocumento,
  crearVersionBorrador,
  crearVersionBorradorEn,
  editarCatalogo,
  editarControl,
  editarVersionBorrador,
  publicarVersion,
} from "@/db/consultas/admin";
import { obtenerPatronCodigo } from "@/db/consultas/codigos";

const sql = () => obtenerSql();
let usuarioId: number;
let procesoId: number;
let tipoId: number;

const CODIGO = "ZZ-TST-901";
// Con historial en auditoria el usuario no se borra (FK restrict + trigger): nombre único por corrida.
const USUARIO = `admin_pub_${Date.now()}`;

async function limpiar() {
  await sql()`DELETE FROM archivos WHERE version_id IN (
    SELECT v.id FROM documento_versiones v
    JOIN documentos d ON d.id = v.documento_id WHERE d.codigo LIKE 'ZZ-TST-%')`;
  await sql()`DELETE FROM documento_versiones WHERE documento_id IN
    (SELECT id FROM documentos WHERE codigo LIKE 'ZZ-TST-%')`;
  await sql()`DELETE FROM documentos WHERE codigo LIKE 'ZZ-TST-%'`;
}

beforeAll(async () => {
  await limpiar();
  await asegurarAdmin(USUARIO, "Admin", "x");
  [{ id: usuarioId }] = await sql()`SELECT id FROM usuarios WHERE usuario = ${USUARIO}`;
  [{ id: procesoId }] = await sql()`SELECT id FROM procesos WHERE activo LIMIT 1`;
  [{ id: tipoId }] = await sql()`SELECT id FROM tipos_documento WHERE activo LIMIT 1`;
});

afterAll(async () => {
  await limpiar();
  await sql().end();
});

function datosBase() {
  return {
    codigo: CODIGO,
    titulo: "Documento de prueba Fase 6",
    tipoId,
    descripcion: null,
    palabrasClave: null,
    asociaciones: [{ procesoId, esPrincipal: true }],
  };
}

describe("crear y editar", () => {
  it("crearDocumento deja documento + version 1 borrador + asociacion + auditoria", async () => {
    const { documentoId, versionId } = await crearDocumento(datosBase(), usuarioId);
    const [v] = await sql()`SELECT numero, estado FROM documento_versiones WHERE id = ${versionId}`;
    expect(v).toMatchObject({ numero: 1, estado: "borrador" });
    const asoc = await sql()`SELECT es_principal FROM documento_proceso WHERE documento_id = ${documentoId}`;
    expect(asoc.length).toBe(1);
    const [aud] = await sql()`SELECT 1 FROM auditoria
      WHERE accion = 'crear_documento' AND entidad_id = ${documentoId}`;
    expect(aud).toBeTruthy();
  });

  it("rechaza crear sin exactamente una asociacion principal", async () => {
    await expect(
      crearDocumento({ ...datosBase(), codigo: "ZZ-TST-902", asociaciones: [] }, usuarioId),
    ).rejects.toThrow(/principal/);
  });

  it("rechaza un segundo borrador simultaneo", async () => {
    const [d] = await sql()`SELECT id FROM documentos WHERE codigo = ${CODIGO}`;
    await expect(crearVersionBorrador(d.id, usuarioId)).rejects.toThrow(/en borrador/);
  });

  it("editarVersionBorrador guarda la evidencia de aprobacion", async () => {
    const [v] = await sql()`SELECT v.id FROM documento_versiones v
      JOIN documentos d ON d.id = v.documento_id
      WHERE d.codigo = ${CODIGO} AND v.estado = 'borrador'`;
    await editarVersionBorrador(v.id, {
      fechaElaboracion: "2026-07-01", fechaRevision: "2026-07-05",
      fechaAprobacion: "2026-07-10", elaboro: "Calidad", reviso: "Gerencia",
      aprobo: "Gerente", resumenCambios: "Version inicial",
    }, usuarioId);
    const [v2] = await sql()`SELECT aprobo FROM documento_versiones WHERE id = ${v.id}`;
    expect(v2.aprobo).toBe("Gerente");
  });

  it("editarControl cambia el titulo y editarCatalogo la descripcion antes de publicar", async () => {
    const [d] = await sql()`SELECT id FROM documentos WHERE codigo = ${CODIGO}`;
    await editarControl(d.id, { codigo: CODIGO, titulo: "Titulo editado", tipoId }, usuarioId);
    await editarCatalogo(
      d.id,
      { descripcion: "Descripcion editada", palabrasClave: null, asociaciones: datosBase().asociaciones, relacionados: [], nivelAcceso: "general" },
      usuarioId,
    );
    const [d2] = await sql()`SELECT titulo, descripcion FROM documentos WHERE id = ${d.id}`;
    expect(d2).toMatchObject({ titulo: "Titulo editado", descripcion: "Descripcion editada" });
  });

  it("obtenerPatronCodigo valida el formato provisional", async () => {
    const patron = await obtenerPatronCodigo();
    expect(patron.test("GTH-PR-01")).toBe(true);
    expect(patron.test("basura")).toBe(false);
  });
});

// Inserta una fila mínima en archivos para poder publicar (el flujo real
// pasa por el handler de subida; aquí se prueba SOLO la transacción).
async function archivoFalso(versionId: number, sufijo: string) {
  await sql()`INSERT INTO archivos (version_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
    VALUES (${versionId}, 'principal', ${"pruebas/falso-" + sufijo + ".pdf"},
            'falso.pdf', 'pdf', 'application/pdf', 100, ${"hash-" + sufijo})`;
}

describe("publicar y anular", () => {
  it("no publica sin archivo principal", async () => {
    const [v] = await sql()`SELECT v.id FROM documento_versiones v
      JOIN documentos d ON d.id = v.documento_id
      WHERE d.codigo = ${CODIGO} AND v.estado = 'borrador'`;
    await expect(publicarVersion(v.id, usuarioId)).rejects.toThrow(/principal/);
  });

  it("publica v1: queda vigente, con auditoria", async () => {
    const [v] = await sql()`SELECT v.id FROM documento_versiones v
      JOIN documentos d ON d.id = v.documento_id
      WHERE d.codigo = ${CODIGO} AND v.estado = 'borrador'`;
    await archivoFalso(v.id, "v1");
    const r = await sql().begin((tx) => aplicarPublicacion(tx, v.id, "fuera", usuarioId));
    expect(r).toMatchObject({ numero: 1, obsoletas: [] });
    const [v2] = await sql()`SELECT estado, origen_aprobacion, publicado_en FROM documento_versiones WHERE id = ${v.id}`;
    expect(v2).toMatchObject({ estado: "vigente", origen_aprobacion: "fuera" });
    expect(v2.publicado_en).not.toBeNull();
    const [aud] = await sql()`SELECT detalle FROM auditoria
      WHERE accion = 'publicar_version' AND entidad_id = ${v.id}`;
    expect(aud.detalle).toMatchObject({ numero: 1, obsoletas: [] });
  });

  it("publicar v2 vuelve obsoleta a v1 en la misma transaccion", async () => {
    const [d] = await sql()`SELECT id FROM documentos WHERE codigo = ${CODIGO}`;
    const { versionId } = await sql().begin((tx) => crearVersionBorradorEn(tx, d.id, usuarioId));
    await editarVersionBorrador(versionId, {
      fechaElaboracion: null, fechaRevision: null, fechaAprobacion: "2026-07-15",
      elaboro: null, reviso: null, aprobo: "Gerente", resumenCambios: "Cambio",
    }, usuarioId);
    await archivoFalso(versionId, "v2");
    const ahora = new Date("2026-11-05T15:00:00Z");
    const r = await sql().begin((tx) => aplicarPublicacion(tx, versionId, "plataforma", usuarioId, ahora));
    expect(r).toEqual({ documentoId: Number(d.id), numero: 2, obsoletas: [1] });
    const [v2] = await sql()`SELECT origen_aprobacion, publicado_en FROM documento_versiones WHERE id = ${versionId}`;
    expect(v2.origen_aprobacion).toBe("plataforma");
    expect(new Date(v2.publicado_en).getTime()).toBe(ahora.getTime());

    const estados = await sql()`SELECT numero, estado FROM documento_versiones
      WHERE documento_id = ${d.id} ORDER BY numero`;
    expect(estados).toMatchObject([
      { numero: 1, estado: "obsoleto" },
      { numero: 2, estado: "vigente" },
    ]);
    // La regla de oro: exactamente UNA vigente.
    const vigentes = await sql()`SELECT 1 FROM documento_versiones
      WHERE documento_id = ${d.id} AND estado = 'vigente'`;
    expect(vigentes.length).toBe(1);
  });

  it("aplicarPublicacion rechaza lo que no es borrador y no toca la vigente", async () => {
    const [v] = await sql()`SELECT v.id FROM documento_versiones v
      JOIN documentos d ON d.id = v.documento_id
      WHERE d.codigo = ${CODIGO} AND v.estado = 'obsoleto'`;
    await expect(sql().begin((tx) => aplicarPublicacion(tx, v.id, "fuera", usuarioId))).rejects.toThrow(/borrador/);
    const [{ estado }] = await sql()`SELECT estado FROM documento_versiones WHERE id = ${v.id}`;
    expect(estado).toBe("obsoleto");
    const vigentes = await sql()`SELECT numero FROM documento_versiones v JOIN documentos d ON d.id = v.documento_id
      WHERE d.codigo = ${CODIGO} AND v.estado = 'vigente'`;
    expect(vigentes).toMatchObject([{ numero: 2 }]);
  });

  it("publicarVersion, el camino directo, publica con origen fuera", async () => {
    const { documentoId, versionId } = await crearDocumento({ ...datosBase(), codigo: "ZZ-TST-903" }, usuarioId);
    await editarVersionBorrador(versionId, {
      fechaElaboracion: null, fechaRevision: null, fechaAprobacion: "2026-07-15",
      elaboro: null, reviso: null, aprobo: "Gerente", resumenCambios: "Cambio",
    }, usuarioId);
    await archivoFalso(versionId, "d1");
    expect(await publicarVersion(versionId, usuarioId)).toEqual({ documentoId, obsoletas: 0 });
    const filas = await sql()`SELECT numero, estado, origen_aprobacion FROM documento_versiones
      WHERE documento_id = ${documentoId} ORDER BY numero`;
    expect(filas).toMatchObject([{ numero: 1, estado: "vigente", origen_aprobacion: "fuera" }]);
  });

  it("no publica un borrador sin evidencia de aprobacion", async () => {
    const { versionId } = await crearDocumento({ ...datosBase(), codigo: "ZZ-TST-904" }, usuarioId);
    await archivoFalso(versionId, "v3");
    await expect(publicarVersion(versionId, usuarioId)).rejects.toThrow(/aprobaci/);
  });

  it("anularVigenteEn saca el documento de circulacion", async () => {
    const [d] = await sql()`SELECT id FROM documentos WHERE codigo = ${CODIGO}`;
    const anular = () => sql().begin((tx) => anularVigenteEn(tx, d.id, usuarioId));
    await anular();
    const vigentes = await sql()`SELECT 1 FROM documento_versiones
      WHERE documento_id = ${d.id} AND estado = 'vigente'`;
    expect(vigentes.length).toBe(0);
    const [anulada] = await sql()`SELECT 1 FROM documento_versiones
      WHERE documento_id = ${d.id} AND estado = 'anulado'`;
    expect(anulada).toBeTruthy();
    await expect(anular()).rejects.toThrow(/vigente/);
  });
});
