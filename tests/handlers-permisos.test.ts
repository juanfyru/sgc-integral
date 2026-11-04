/**
 * Handlers del panel por rol, contra la BD de desarrollo sembrada.
 * zz_consulta y zz_ci: el de control interno genera auditoría (exportar el
 * maestro), así que ambos llevan nombre único por corrida y no se borran.
 */
import { existsSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { DELETE as eliminarArchivo, GET as verArchivo } from "@/app/admin/api/archivos/[archivoId]/route";
import { POST as subirArchivo } from "@/app/admin/api/archivos/route";
import { GET as buscarApi } from "@/app/api/buscar/route";
import { GET as excelMaestro } from "@/app/(app)/admin/(panel)/maestro/excel/route";
import { obtenerSql } from "@/db/cliente";
import { crearSesion } from "@/lib/sesion";

const sql = () => obtenerSql();
const SUFIJO = Date.now();
let tokenConsulta: string;
let tokenCi: string;
let tokenGerencia: string;
let usuarioGerenciaId: number;
let archivoBorradorId: number;

const cookie = (token: string) => ({ cookie: `sgc_sesion=${token}` });

async function crearUsuario(nombre: string, rol: string): Promise<string> {
  const { token } = await crearUsuarioConId(nombre, rol);
  return token;
}

async function crearUsuarioConId(nombre: string, rol: string) {
  const [u] = await sql()`
    INSERT INTO usuarios (usuario, nombre, hash_clave, rol, acepto_datos_en, totp_activo)
    VALUES (${nombre}, ${nombre}, 'hash-falso', ${rol}, now(), true) RETURNING id`;
  const { token } = await crearSesion(Number(u.id), { ip: null, userAgent: null });
  return { token, id: Number(u.id) };
}

beforeAll(async () => {
  tokenConsulta = await crearUsuario(`zz_consulta_${SUFIJO}`, "consulta");
  tokenCi = await crearUsuario(`zz_ci_${SUFIJO}`, "control_interno");
  const g = await crearUsuarioConId(`zz_gerencia_${SUFIJO}`, "gerencia");
  tokenGerencia = g.token;
  usuarioGerenciaId = g.id;
  const [a] = await sql()`
    SELECT a.id FROM archivos a
    JOIN documento_versiones v ON v.id = a.version_id
    JOIN documentos d ON d.id = v.documento_id
    WHERE d.codigo = 'FT-CAL-003' AND a.rol = 'principal' LIMIT 1`;
  archivoBorradorId = Number(a.id);
});

afterAll(async () => {
  await sql().end();
});

describe("handlers del panel por rol", () => {
  it("consulta no exporta el maestro (403) y control interno sí (200)", async () => {
    expect((await excelMaestro(new NextRequest("http://localhost:3002/admin/maestro/excel", { headers: cookie(tokenConsulta) }))).status).toBe(403);
    expect((await excelMaestro(new NextRequest("http://localhost:3002/admin/maestro/excel", { headers: cookie(tokenCi) }))).status).toBe(200);
  });
  it("consulta no ve archivos de cualquier estado por la ruta del admin; control interno sí", async () => {
    const params = { params: Promise.resolve({ archivoId: String(archivoBorradorId) }) };
    expect((await verArchivo(new NextRequest("http://localhost:3002/admin/api/archivos/1", { headers: cookie(tokenConsulta) }), params)).status).toBe(403);
    expect((await verArchivo(new NextRequest("http://localhost:3002/admin/api/archivos/1", { headers: cookie(tokenCi) }), params)).status).toBe(200);
  });
  it("control interno no puede subir ni borrar archivos (403)", async () => {
    expect((await subirArchivo(new NextRequest("http://localhost:3002/admin/api/archivos?version=1&rol=principal", { method: "POST", headers: cookie(tokenCi) }))).status).toBe(403);
    expect((await eliminarArchivo(new NextRequest("http://localhost:3002/admin/api/archivos/1", { method: "DELETE", headers: cookie(tokenCi) }), { params: Promise.resolve({ archivoId: "1" }) })).status).toBe(403);
  });
  it("gerencia no exporta ni siquiera con incluir=todos (403, sin auditoría); el alcance lo fija alcanceMaestro", async () => {
    const res = await excelMaestro(new NextRequest("http://localhost:3002/admin/maestro/excel?incluir=todos", { headers: cookie(tokenGerencia) }));
    expect(res.status).toBe(403);
    const filas = await sql()`SELECT 1 FROM auditoria WHERE usuario_id = ${usuarioGerenciaId} AND accion = 'exporto_maestro'`;
    expect(filas.length).toBe(0);
  });
});

describe("GET /api/buscar", () => {
  it("401 sin sesión", async () => expect((await buscarApi(new NextRequest("http://x/api/buscar?q=acta"))).status).toBe(401));
  it("devuelve hasta 8 vigentes con ruta a la ficha", async () => {
    const r = await buscarApi(new NextRequest("http://x/api/buscar?q=acta", { headers: cookie(tokenConsulta) }));
    const { resultados } = await r.json();
    expect(resultados.length).toBeGreaterThan(0);
    expect(resultados.length).toBeLessThanOrEqual(8);
    expect(resultados[0].ruta).toMatch(/^\/documentos\/[a-z0-9-]+$/);
  });
  it("menos de dos caracteres: lista vacía", async () => {
    expect((await (await buscarApi(new NextRequest("http://x/api/buscar?q=a", { headers: cookie(tokenConsulta) }))).json()).resultados).toEqual([]);
  });
});
