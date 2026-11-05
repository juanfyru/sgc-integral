/**
 * Consultas de escritura del admin contra la BD de desarrollo (migrada y
 * sembrada): crear documento/versión, editar, publicar con obsolescencia
 * automática (regla ISO 1) y anular.
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
  anularVigente,
  asegurarAdmin,
  crearDocumento,
  crearVersionBorrador,
  editarMetadatos,
  editarVersionBorrador,
  obtenerPatronCodigo,
  publicarVersion,
} from "@/db/consultas/admin";

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
    await expect(crearVersionBorrador(d.id, usuarioId)).rejects.toThrow(/borrador/);
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

  it("editarMetadatos cambia titulo; el codigo sigue editable antes de publicar", async () => {
    const [d] = await sql()`SELECT id FROM documentos WHERE codigo = ${CODIGO}`;
    await editarMetadatos(d.id, { ...datosBase(), titulo: "Titulo editado" }, usuarioId);
    const [d2] = await sql()`SELECT titulo FROM documentos WHERE id = ${d.id}`;
    expect(d2.titulo).toBe("Titulo editado");
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
    const r = await publicarVersion(v.id, usuarioId);
    expect(r.obsoletas).toBe(0);
    const [v2] = await sql()`SELECT estado FROM documento_versiones WHERE id = ${v.id}`;
    expect(v2.estado).toBe("vigente");
  });

  it("publicar v2 vuelve obsoleta a v1 en la misma transaccion", async () => {
    const [d] = await sql()`SELECT id FROM documentos WHERE codigo = ${CODIGO}`;
    const { versionId } = await crearVersionBorrador(d.id, usuarioId);
    await editarVersionBorrador(versionId, {
      fechaElaboracion: null, fechaRevision: null, fechaAprobacion: "2026-07-15",
      elaboro: null, reviso: null, aprobo: "Gerente", resumenCambios: "Cambio",
    }, usuarioId);
    await archivoFalso(versionId, "v2");
    const r = await publicarVersion(versionId, usuarioId);
    expect(r.obsoletas).toBe(1);

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

  it("no publica un borrador sin evidencia de aprobacion", async () => {
    const [d] = await sql()`SELECT id FROM documentos WHERE codigo = ${CODIGO}`;
    const { versionId } = await crearVersionBorrador(d.id, usuarioId);
    await archivoFalso(versionId, "v3");
    await expect(publicarVersion(versionId, usuarioId)).rejects.toThrow(/aprobaci/);
  });

  it("anularVigente saca el documento de circulacion", async () => {
    const [d] = await sql()`SELECT id FROM documentos WHERE codigo = ${CODIGO}`;
    await anularVigente(d.id, usuarioId);
    const vigentes = await sql()`SELECT 1 FROM documento_versiones
      WHERE documento_id = ${d.id} AND estado = 'vigente'`;
    expect(vigentes.length).toBe(0);
    const [anulada] = await sql()`SELECT 1 FROM documento_versiones
      WHERE documento_id = ${d.id} AND estado = 'anulado'`;
    expect(anulada).toBeTruthy();
    await expect(anularVigente(d.id, usuarioId)).rejects.toThrow(/vigente/);
  });
});
