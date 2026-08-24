/**
 * Cableado del route público de archivos con la marca de agua (reglas 3/6/7 +
 * ISO 7.5.3): con ?descarga=1 un PDF vigente sale estampado; la vista previa
 * inline sale byte a byte igual al original del almacén. Requiere la BD dev
 * migrada y sembrada (D19) y el ./almacen generado por el seed.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";
import { GET } from "@/app/documentos/[codigo]/archivos/[archivoId]/[[...nombre]]/route";
import { obtenerSql } from "@/db/cliente";
import { rutaBaseAlmacen } from "@/lib/almacen";
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

function peticion(url: string) {
  return new NextRequest(url, {
    headers: { "user-agent": UA, "x-forwarded-for": "127.0.0.1" },
  });
}

afterAll(async () => {
  const sql = obtenerSql();
  await sql`DELETE FROM eventos_consulta WHERE user_agent = ${UA}`;
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

  it("sin ?descarga=1 la vista previa sirve el original byte a byte", async () => {
    const { id, ruta } = await archivoPdfVigente("MN-CAL-001");
    const res = await GET(
      peticion(`http://localhost:3000/documentos/mn-cal-001/archivos/${id}`),
      { params: Promise.resolve({ codigo: "mn-cal-001", archivoId: String(id) }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("inline");

    const cuerpo = Buffer.from(await res.arrayBuffer());
    const original = await readFile(
      path.join(rutaBaseAlmacen(), ...ruta.split("/")),
    );
    expect(cuerpo.equals(original)).toBe(true);
  });
});
