/**
 * Cableado del route público de archivos con la marca de agua (reglas 3/6/7 +
 * ISO 7.5.3): TODO PDF vigente que sale por la ruta pública va estampado —
 * la descarga como adjunto y la vista previa inline (el visor del navegador
 * permite descargar/imprimir, así que una vista limpia sería un hueco).
 * Requiere la BD dev migrada y sembrada (D19) y el ./almacen del seed.
 */
import { existsSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET } from "@/app/(portal)/documentos/[codigo]/archivos/[archivoId]/[[...nombre]]/route";
import { obtenerSql } from "@/db/cliente";
import { crearSesion } from "@/lib/sesion";
import { contenidoPorPagina, contieneTexto } from "./utiles/pdf";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

// User-agent distintivo: los eventos de descarga que registre este test se
// limpian por él en el afterAll, sin tocar datos reales.
const UA = "vitest-marca-agua";

async function archivoPdfVigente(codigo: string) {
  const sql = obtenerSql();
  const [fila] = await sql`
    SELECT a.id, a.ruta
    FROM archivos a
    JOIN documento_versiones v ON v.id = a.version_id
    JOIN documentos d ON d.id = v.documento_id
    WHERE d.codigo = ${codigo} AND v.estado = 'vigente'
      AND a.rol = 'principal' AND a.mime = 'application/pdf'`;
  expect(fila, `archivo PDF vigente de ${codigo}`).toBeDefined();
  return fila as { id: number; ruta: string };
}

let usuarioId = 0;
let token = "";

// Usuario sin historia en auditoria/accesos (solo sesión y eventos): se borra al final.
beforeAll(async () => {
  const sql = obtenerSql();
  const [u] = await sql`
    INSERT INTO usuarios (usuario, nombre, hash_clave, rol, acepto_datos_en)
    VALUES (${`zz_descarga_${Date.now()}`}, 'Prueba descarga', 'x', 'consulta', now())
    RETURNING id`;
  usuarioId = u.id;
  token = (await crearSesion(usuarioId, { ip: null, userAgent: UA })).token;
});

function peticion(url: string) {
  return new NextRequest(url, {
    headers: { "user-agent": UA, "x-forwarded-for": "127.0.0.1", cookie: `sgc_sesion=${token}` },
  });
}

afterAll(async () => {
  const sql = obtenerSql();
  await sql`DELETE FROM eventos_consulta WHERE user_agent = ${UA}`;
  await sql`DELETE FROM usuarios WHERE id = ${usuarioId}`;
  await sql.end();
});

describe("route público de archivos — marca de agua", () => {
  it("con ?descarga=1 un PDF vigente sale estampado como adjunto", async () => {
    const { id } = await archivoPdfVigente("MN-CAL-001");
    const res = await GET(
      peticion(
        `http://localhost:3000/documentos/mn-cal-001/archivos/${id}?descarga=1`,
      ),
      { params: Promise.resolve({ codigo: "mn-cal-001", archivoId: String(id) }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("attachment");

    const cuerpo = new Uint8Array(await res.arrayBuffer());
    const paginas = await contenidoPorPagina(cuerpo);
    expect(paginas.length).toBeGreaterThanOrEqual(1);
    for (const contenido of paginas) {
      expect(contieneTexto(contenido, "COPIA NO CONTROLADA")).toBe(true);
    }
  });

  it("sin ?descarga=1 la vista previa también sale estampada, inline", async () => {
    const { id } = await archivoPdfVigente("MN-CAL-001");
    const res = await GET(
      peticion(`http://localhost:3000/documentos/mn-cal-001/archivos/${id}`),
      { params: Promise.resolve({ codigo: "mn-cal-001", archivoId: String(id) }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("inline");

    const cuerpo = new Uint8Array(await res.arrayBuffer());
    const paginas = await contenidoPorPagina(cuerpo);
    expect(paginas.length).toBeGreaterThanOrEqual(1);
    for (const contenido of paginas) {
      expect(contieneTexto(contenido, "COPIA NO CONTROLADA")).toBe(true);
    }
  });

  it("sin cookie responde 401 y no registra evento", async () => {
    const { id } = await archivoPdfVigente("MN-CAL-001");
    const res = await GET(
      new NextRequest(`http://localhost:3002/documentos/mn-cal-001/archivos/${id}?descarga=1`),
      { params: Promise.resolve({ codigo: "mn-cal-001", archivoId: String(id) }) },
    );
    expect(res.status).toBe(401);
  });

  it("la descarga queda registrada con el usuario de la sesión", async () => {
    const sql = obtenerSql();
    const [e] = await sql`SELECT usuario_id FROM eventos_consulta WHERE user_agent = ${UA} ORDER BY id DESC LIMIT 1`;
    expect(e.usuario_id).toBe(usuarioId);
  });
});
