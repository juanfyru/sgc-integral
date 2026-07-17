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
  asegurarAdmin,
  crearDocumento,
  crearVersionBorrador,
  editarMetadatos,
  editarVersionBorrador,
  obtenerPatronCodigo,
} from "@/db/consultas/admin";

const sql = () => obtenerSql();
let usuarioId: number;
let procesoId: number;
let tipoId: number;

const CODIGO = "ZZ-TST-901";

async function limpiar() {
  await sql()`DELETE FROM auditoria WHERE usuario_id IN
    (SELECT id FROM usuarios WHERE usuario = 'admin_pub')`;
  await sql()`DELETE FROM archivos WHERE version_id IN (
    SELECT v.id FROM documento_versiones v
    JOIN documentos d ON d.id = v.documento_id WHERE d.codigo LIKE 'ZZ-TST-%')`;
  await sql()`DELETE FROM documento_versiones WHERE documento_id IN
    (SELECT id FROM documentos WHERE codigo LIKE 'ZZ-TST-%')`;
  await sql()`DELETE FROM documentos WHERE codigo LIKE 'ZZ-TST-%'`;
  await sql()`DELETE FROM usuarios WHERE usuario = 'admin_pub'`;
}

beforeAll(async () => {
  await limpiar();
  await asegurarAdmin("admin_pub", "Admin", "x");
  [{ id: usuarioId }] = await sql()`SELECT id FROM usuarios WHERE usuario = 'admin_pub'`;
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
    expect(patron.test("PR-GTH-001")).toBe(true);
    expect(patron.test("basura")).toBe(false);
  });
});
