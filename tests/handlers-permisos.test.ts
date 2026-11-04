/**
 * Handlers del panel por rol, contra la BD de desarrollo sembrada.
 * zz_consulta y zz_ci: el de control interno genera auditoría (exportar el
 * maestro), así que ambos llevan nombre único por corrida y no se borran.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { DELETE as eliminarArchivo, GET as verArchivo } from "@/app/admin/api/archivos/[archivoId]/route";
import { POST as subirArchivo } from "@/app/admin/api/archivos/route";
import { DELETE as quitarLogoRuta, POST as subirLogoRuta } from "@/app/admin/api/entidad/logo/route";
import { GET as servirLogo } from "@/app/marca/logo/route";
import { rutaBaseAlmacen } from "@/lib/almacen";
import { pngDePrueba } from "./png-prueba";
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

describe("logo de la entidad: /admin/api/entidad/logo y /marca/logo", () => {
  const cabecerasAdmin = (token: string) => ({ ...cookie(token), origin: "http://x", host: "x" });
  const peticionLogo = (metodo: "POST" | "DELETE", cabeceras: Record<string, string>, bytes?: Uint8Array) => {
    const init: { method: string; headers: Record<string, string>; body?: FormData } = { method: metodo, headers: cabeceras };
    if (bytes) {
      const cuerpo = new FormData();
      cuerpo.set("archivo", new File([bytes as BlobPart], "logo.png", { type: "image/png" }));
      init.body = cuerpo;
    }
    return new NextRequest("http://x/admin/api/entidad/logo", init);
  };
  let tokenAdmin: string;
  const png = pngDePrueba(64, 64, 0x33);

  beforeAll(async () => {
    tokenAdmin = await crearUsuario(`zz_admin_logo_${SUFIJO}`, "admin_sgc");
  });
  afterAll(async () => {
    // Restaura el logo de la demo (logo_version f0e59280).
    const original = readFileSync("src/db/semillas/recursos/logo-demo.png");
    await subirLogo(new Uint8Array(original), cabecerasAdmin(tokenAdmin));
  });

  async function subirLogo(bytes: Uint8Array, cabeceras: Record<string, string>) {
    return subirLogoRuta(peticionLogo("POST", cabeceras, bytes));
  }
  const rutaDelLogo = async () => {
    const [f] = await sql()`SELECT valor FROM configuracion WHERE clave = 'logo_ruta'`;
    return f ? path.join(rutaBaseAlmacen(), String(f.valor)) : null;
  };

  it("POST logo: 401 sin sesión, 403 consulta, 403 con Origin ajeno, 413 por Content-Length, 200 admin", async () => {
    expect((await subirLogo(png, { origin: "http://x", host: "x" })).status).toBe(401);
    expect((await subirLogo(png, cabecerasAdmin(tokenConsulta))).status).toBe(403);
    expect((await subirLogo(png, { ...cabecerasAdmin(tokenAdmin), origin: "http://otro" })).status).toBe(403);
    const grande = await subirLogoRuta(
      new NextRequest("http://x/admin/api/entidad/logo", {
        method: "POST",
        headers: { ...cabecerasAdmin(tokenAdmin), "content-length": String(1_048_576 + 65_537) },
      }),
    );
    expect(grande.status).toBe(413);
    expect(await grande.json()).toEqual({ error: "El logo supera 1 MB" });
    const ok = await subirLogo(png, cabecerasAdmin(tokenAdmin));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, version: expect.stringMatching(/^[0-9a-f]{8}$/) });
  });
  it("rechaza un archivo que no es imagen soportada y un cuerpo sin archivo", async () => {
    const r = await subirLogo(new TextEncoder().encode("<svg/>"), cabecerasAdmin(tokenAdmin));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "El logo debe ser PNG, JPG o WebP" });
    const sin = await subirLogoRuta(
      new NextRequest("http://x/admin/api/entidad/logo", { method: "POST", headers: cabecerasAdmin(tokenAdmin), body: new FormData() }),
    );
    expect(sin.status).toBe(400);
    expect(await sin.json()).toEqual({ error: "Falta el archivo" });
  });
  it("subir dos veces el mismo PNG conserva el archivo y la versión", async () => {
    const a = await (await subirLogo(png, cabecerasAdmin(tokenAdmin))).json();
    const ruta = (await rutaDelLogo())!;
    expect(existsSync(ruta)).toBe(true);
    const b = await (await subirLogo(png, cabecerasAdmin(tokenAdmin))).json();
    expect(b.version).toBe(a.version);
    expect(existsSync(ruta)).toBe(true);
  });
  it("cambiar de logo borra el archivo anterior", async () => {
    await subirLogo(png, cabecerasAdmin(tokenAdmin));
    const anterior = (await rutaDelLogo())!;
    await subirLogo(pngDePrueba(64, 64, 0x44), cabecerasAdmin(tokenAdmin));
    expect(existsSync(anterior)).toBe(false);
    expect(existsSync((await rutaDelLogo())!)).toBe(true);
  });
  it("GET /marca/logo sirve el logo con nosniff y 404 tras DELETE", async () => {
    await subirLogo(png, cabecerasAdmin(tokenAdmin));
    const g = await servirLogo();
    expect(g.status).toBe(200);
    expect(g.headers.get("content-type")).toBe("image/png");
    expect(g.headers.get("x-content-type-options")).toBe("nosniff");
    expect(g.headers.get("content-disposition")).toBe('inline; filename="logo.png"');
    expect(g.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(Buffer.from(await g.arrayBuffer()).equals(Buffer.from(png))).toBe(true);

    expect((await quitarLogoRuta(peticionLogo("DELETE", { origin: "http://x", host: "x" }))).status).toBe(401);
    expect((await quitarLogoRuta(peticionLogo("DELETE", cabecerasAdmin(tokenConsulta)))).status).toBe(403);
    const ruta = (await rutaDelLogo())!;
    const d = await quitarLogoRuta(peticionLogo("DELETE", cabecerasAdmin(tokenAdmin)));
    expect(d.status).toBe(200);
    expect(await d.json()).toEqual({ ok: true });
    expect(existsSync(ruta)).toBe(false);
    expect((await servirLogo()).status).toBe(404);
  });
});
