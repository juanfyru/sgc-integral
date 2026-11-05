/**
 * Handlers del panel por rol, contra la BD de desarrollo sembrada.
 * zz_consulta y zz_ci: el de control interno genera auditoría (exportar el
 * maestro), así que ambos llevan nombre único por corrida y no se borran.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
import { LOGO_MAX_BYTES } from "@/lib/logo";
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
  it("un código con solo versiones no vigentes (borrador o anulada) no aparece", async () => {
    // El caso se arma con la BD: FT-CAL-003 solo tiene un borrador e IN-GIC-002 solo una versión anulada.
    const sinVigente = await sql()`
      SELECT d.codigo FROM documentos d
      WHERE d.codigo IN ('FT-CAL-003', 'IN-GIC-002')
        AND NOT EXISTS (SELECT 1 FROM documento_versiones v WHERE v.documento_id = d.id AND v.estado = 'vigente')
        AND EXISTS (SELECT 1 FROM documento_versiones v WHERE v.documento_id = d.id)`;
    expect(sinVigente.map((f) => f.codigo).sort()).toEqual(["FT-CAL-003", "IN-GIC-002"]);
    const codigos = async (q: string): Promise<string[]> => {
      const r = await buscarApi(new NextRequest(`http://x/api/buscar?q=${encodeURIComponent(q)}`, { headers: cookie(tokenConsulta) }));
      return (await r.json()).resultados.map((f: { codigo: string }) => f.codigo);
    };
    // Control positivo: la misma búsqueda por código sí trae los vigentes de la serie.
    const cal = await codigos("FT-CAL");
    expect(cal).toContain("FT-CAL-001");
    expect(cal).not.toContain("FT-CAL-003");
    const gic = await codigos("IN-GIC");
    expect(gic).toContain("IN-GIC-001");
    expect(gic).not.toContain("IN-GIC-002");
    expect(await codigos("fax")).not.toContain("IN-GIC-002");
  });
  it("menos de dos caracteres: lista vacía", async () => {
    expect((await (await buscarApi(new NextRequest("http://x/api/buscar?q=a", { headers: cookie(tokenConsulta) }))).json()).resultados).toEqual([]);
  });
});

describe("logo de la entidad: /admin/api/entidad/logo y /marca/logo", () => {
  const cabecerasAdmin = (token: string) => ({ ...cookie(token), origin: "http://x", host: "x" });
  const peticionLogo = (metodo: "POST" | "DELETE", cabeceras: Record<string, string>, bytes?: Uint8Array) => {
    const init: { method: string; headers: Record<string, string>; body?: FormData } = { method: metodo, headers: { ...cabeceras } };
    if (bytes) {
      const cuerpo = new FormData();
      cuerpo.set("archivo", new File([bytes as BlobPart], "logo.png", { type: "image/png" }));
      init.body = cuerpo;
      init.headers["content-length"] ??= String(bytes.byteLength + 512);
    }
    return new NextRequest("http://x/admin/api/entidad/logo", init);
  };
  const png = pngDePrueba(64, 64, 0x33);

  // El POST admite 10 subidas por minuto y usuario, y cuenta también las que rechaza después del
  // permiso y del Origin: cada describe que sube usa su propio Admin SGC, así un test nuevo no da 429.
  let nAdmins = 0;
  function adminPropio(): { token: () => string; id: () => number } {
    let usuario = { token: "", id: 0 };
    beforeAll(async () => {
      usuario = await crearUsuarioConId(`zz_admin_logo${++nAdmins}_${SUFIJO}`, "admin_sgc");
    });
    return { token: () => usuario.token, id: () => usuario.id };
  }

  async function subirLogo(bytes: Uint8Array, cabeceras: Record<string, string>) {
    return subirLogoRuta(peticionLogo("POST", cabeceras, bytes));
  }
  const rutaDelLogo = async () => {
    const [f] = await sql()`SELECT valor FROM configuracion WHERE clave = 'logo_ruta'`;
    return f ? path.join(rutaBaseAlmacen(), String(f.valor)) : null;
  };

  const restaurador = adminPropio();
  afterAll(async () => {
    // Restaura el logo de la demo (logo_version f0e59280).
    const original = readFileSync("src/db/semillas/recursos/logo-demo.png");
    await subirLogo(new Uint8Array(original), cabecerasAdmin(restaurador.token()));
  });

  describe("POST: permisos, tamaño y tipo", () => {
    const admin = adminPropio();
    it("POST logo: 401 sin sesión, 403 consulta, 403 con Origin ajeno, 413 por Content-Length, 200 admin", async () => {
      expect((await subirLogo(png, { origin: "http://x", host: "x" })).status).toBe(401);
      expect((await subirLogo(png, cabecerasAdmin(tokenConsulta))).status).toBe(403);
      expect((await subirLogo(png, { ...cabecerasAdmin(admin.token()), origin: "http://otro" })).status).toBe(403);
      const grande = await subirLogoRuta(
        new NextRequest("http://x/admin/api/entidad/logo", {
          method: "POST",
          headers: { ...cabecerasAdmin(admin.token()), "content-length": String(LOGO_MAX_BYTES + 65_537) },
        }),
      );
      expect(grande.status).toBe(413);
      expect(await grande.json()).toEqual({ error: "El logo supera 1 MB" });
      const ok = await subirLogo(png, cabecerasAdmin(admin.token()));
      expect(ok.status).toBe(200);
      expect(await ok.json()).toMatchObject({ ok: true, version: expect.stringMatching(/^[0-9a-f]{8}$/) });
    });
    it("rechaza un archivo que no es imagen soportada y un cuerpo sin archivo", async () => {
      const r = await subirLogo(new TextEncoder().encode("<svg/>"), cabecerasAdmin(admin.token()));
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: "El logo debe ser PNG, JPG o WebP" });
      const sin = await subirLogoRuta(
        new NextRequest("http://x/admin/api/entidad/logo", { method: "POST", headers: { ...cabecerasAdmin(admin.token()), "content-length": "10" }, body: new FormData() }),
      );
      expect(sin.status).toBe(400);
      expect(await sin.json()).toEqual({ error: "Falta el archivo" });
    });
  });

  describe("POST: archivos en el almacén", () => {
    const admin = adminPropio();
    it("subir dos veces el mismo PNG conserva el archivo y la versión", async () => {
      const a = await (await subirLogo(png, cabecerasAdmin(admin.token()))).json();
      const ruta = (await rutaDelLogo())!;
      expect(existsSync(ruta)).toBe(true);
      const b = await (await subirLogo(png, cabecerasAdmin(admin.token()))).json();
      expect(b.version).toBe(a.version);
      expect(existsSync(ruta)).toBe(true);
    });
    it("cambiar de logo borra el archivo anterior", async () => {
      await subirLogo(png, cabecerasAdmin(admin.token()));
      const anterior = (await rutaDelLogo())!;
      await subirLogo(pngDePrueba(64, 64, 0x44), cabecerasAdmin(admin.token()));
      expect(existsSync(anterior)).toBe(false);
      expect(existsSync((await rutaDelLogo())!)).toBe(true);
    });
  });

  describe("POST: Content-Length", () => {
    const admin = adminPropio();
    it("POST logo sin Content-Length o con uno inválido: 411 antes de leer el cuerpo", async () => {
      for (const valor of [undefined, "abc", "0", "-5"]) {
        const cabeceras: Record<string, string> = { ...cabecerasAdmin(admin.token()) };
        if (valor !== undefined) cabeceras["content-length"] = valor;
        const r = await subirLogoRuta(new NextRequest("http://x/admin/api/entidad/logo", { method: "POST", headers: cabeceras, body: new FormData() }));
        expect(r.status).toBe(411);
        expect(await r.json()).toEqual({ error: "Falta el tamaño del archivo" });
      }
    });
  });

  describe("POST: límite de ritmo", () => {
    const admin = adminPropio();
    it("POST logo: el límite de ritmo responde 429 a la subida número 11 en un minuto", async () => {
      const estados: number[] = [];
      for (let n = 0; n < 11; n++) {
        estados.push((await subirLogoRuta(new NextRequest("http://x/admin/api/entidad/logo", {
          method: "POST", headers: { ...cabecerasAdmin(admin.token()), "content-length": "10" }, body: new FormData(),
        }))).status);
      }
      expect(estados.slice(0, 10).every((e) => e === 400)).toBe(true);
      expect(estados[10]).toBe(429);
    });
  });

  describe("DELETE y GET /marca/logo", () => {
    const admin = adminPropio();
    it("DELETE con logo_ruta alterada en BD no borra archivos fuera de marca/logo-<hex>", async () => {
      const ajeno = path.join(rutaBaseAlmacen(), "zz_logo_ajeno.txt");
      writeFileSync(ajeno, "no tocar");
      await quitarLogoRuta(peticionLogo("DELETE", cabecerasAdmin(admin.token()))); // no dejar huérfano el logo actual
      try {
        for (const [clave, valor] of [["logo_ruta", "zz_logo_ajeno.txt"], ["logo_mime", "image/png"], ["logo_version", "00000000"]]) {
          await sql()`INSERT INTO configuracion (clave, valor) VALUES (${clave}, ${valor}) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`;
        }
        expect((await servirLogo()).status).toBe(404);
        const d = await quitarLogoRuta(peticionLogo("DELETE", cabecerasAdmin(admin.token())));
        expect(d.status).toBe(200);
        expect(existsSync(ajeno)).toBe(true);
      } finally {
        rmSync(ajeno, { force: true });
      }
    });
    it("GET /marca/logo sirve el logo con nosniff y 404 tras DELETE", async () => {
      await subirLogo(png, cabecerasAdmin(admin.token()));
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
      const d = await quitarLogoRuta(peticionLogo("DELETE", cabecerasAdmin(admin.token())));
      expect(d.status).toBe(200);
      expect(await d.json()).toEqual({ ok: true });
      expect(existsSync(ruta)).toBe(false);
      expect((await servirLogo()).status).toBe(404);
    });
    it("DELETE sin logo responde igual (200 { ok: true }) y no audita", async () => {
      expect(await rutaDelLogo()).toBeNull(); // el test anterior lo quitó
      const contar = async () => {
        const [f] = await sql()`SELECT count(*)::int AS n FROM auditoria WHERE usuario_id = ${admin.id()} AND accion = 'quitar_logo'`;
        return Number(f.n);
      };
      const antes = await contar();
      const d = await quitarLogoRuta(peticionLogo("DELETE", cabecerasAdmin(admin.token())));
      expect(d.status).toBe(200);
      expect(await d.json()).toEqual({ ok: true });
      expect(await contar()).toBe(antes);
    });
  });
});
