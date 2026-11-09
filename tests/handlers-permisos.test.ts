/**
 * Handlers del panel por rol, contra la BD de desarrollo sembrada.
 * zz_consulta y zz_ci: el de control interno genera auditoría (exportar el
 * maestro), así que ambos llevan nombre único por corrida y no se borran. Lo que necesita un documento externo
 * corre dentro de una transacción que se revierte: el cliente de la app se sustituye por ella mientras dura.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const enCurso = vi.hoisted(() => ({ sql: null as unknown }));

vi.mock("@/db/cliente", async (original) => {
  const real = await original<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => (enCurso.sql ?? real.obtenerSql()) as ReturnType<typeof real.obtenerSql> };
});

import { DELETE as eliminarArchivo, GET as verArchivo } from "@/app/admin/api/archivos/[archivoId]/route";
import { POST as subirArchivo } from "@/app/admin/api/archivos/route";
import { DELETE as quitarLogoRuta, POST as subirLogoRuta } from "@/app/admin/api/entidad/logo/route";
import { GET as actaEjemplo } from "@/app/admin/api/acta-ejemplo/route";
import { GET as informeEjemplo } from "@/app/admin/api/informe-ejemplo/route";
import { GET as informeAnual } from "@/app/(app)/vigencia/revision-anual/[id]/informe/route";
import { GET as servirLogo } from "@/app/marca/logo/route";
import { rutaBaseAlmacen } from "@/lib/almacen";
import { pngDePrueba } from "./png-prueba";
import { contenidoPorPagina, contieneTexto } from "./utiles/pdf";
import { LOGO_MAX_BYTES } from "@/lib/logo";
import { GET as buscarApi } from "@/app/api/buscar/route";
import { GET as excelMaestro } from "@/app/(app)/admin/(panel)/maestro/excel/route";
import { GET as verArchivoTramite } from "@/app/(app)/tramites/[id]/archivos/[archivoId]/[[...nombre]]/route";
import { DELETE as quitarArchivoTramite } from "@/app/api/tramites/[id]/archivos/[archivoId]/route";
import { POST as subirArchivoTramite } from "@/app/api/tramites/[id]/archivos/route";
import { DELETE as quitarArchivoExterno } from "@/app/api/externos/[versionId]/archivos/[archivoId]/route";
import { POST as subirArchivoExterno } from "@/app/api/externos/[versionId]/archivos/route";
import { DELETE as quitarArchivoNorma } from "@/app/api/normas/[id]/archivos/[archivoId]/route";
import { POST as subirArchivoNorma } from "@/app/api/normas/[id]/archivos/route";
import { GET as excelAcuses } from "@/app/(app)/distribucion/acuses/excel/route";
import { GET as excelCopias } from "@/app/(app)/distribucion/copias/excel/route";
import { GET as excelVerificaciones } from "@/app/(app)/distribucion/verificaciones/excel/route";
import { GET as excelSemaforo } from "@/app/(app)/vigencia/semaforo/excel/route";
import { GET as excelExternos } from "@/app/(app)/vigencia/externos/excel/route";
import { GET as excelIndicadores } from "@/app/(app)/vigencia/indicadores/excel/route";
import { GET as archivoDeEdicionExterna } from "@/app/(app)/vigencia/externos/[id]/archivos/[archivoId]/[[...nombre]]/route";
import { GET as excelNormograma } from "@/app/(app)/normograma/excel/route";
import { GET as pdfDeNorma } from "@/app/(app)/normograma/[id]/archivos/[archivoId]/[[...nombre]]/route";
import { GET as pdfCopia } from "@/app/(app)/distribucion/copias/[id]/pdf/route";
import { POST as reimprimirCopiaRuta } from "@/app/(app)/distribucion/copias/[id]/reimprimir/route";
import { obtenerSql } from "@/db/cliente";
import { listarDocumentosAdmin, obtenerDocumentoAdmin } from "@/db/consultas/admin";
import { crearSesion } from "@/lib/sesion";
import { revertida } from "./utiles/transaccion";
import { sesionDe, usuarioDePrueba } from "./utiles/tramites";
import { externoDePrueba } from "./utiles/vigencia";

const sql = () => obtenerSql();
const SUFIJO = Date.now();
let tokenConsulta: string;
let tokenCi: string;
let tokenGerencia: string;
let tokenAdmin: string;
let tokenMarca: string;
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
  tokenAdmin = await crearUsuario(`zz_admin_archivos_${SUFIJO}`, "admin_sgc");
  const marca = await crearUsuarioConId(`zz_marca_${SUFIJO}`, "consulta");
  tokenMarca = marca.token;
  await sql()`UPDATE usuarios SET ver_historial = true WHERE id = ${marca.id}`;
  const g = await crearUsuarioConId(`zz_gerencia_${SUFIJO}`, "gerencia");
  tokenGerencia = g.token;
  usuarioGerenciaId = g.id;
  const [a] = await sql()`
    SELECT a.id FROM archivos a
    JOIN documento_versiones v ON v.id = a.version_id
    JOIN documentos d ON d.id = v.documento_id
    WHERE d.codigo = 'SGC-FO-03' AND a.rol = 'principal' LIMIT 1`;
  archivoBorradorId = Number(a.id);
});

afterAll(async () => {
  await sql().end();
});

describe("GET /admin/api/acta-ejemplo", () => {
  const pedir = (token?: string) =>
    actaEjemplo(new NextRequest("http://localhost:3002/admin/api/acta-ejemplo", token ? { headers: cookie(token) } : undefined));

  it("sin sesión responde 401", async () => {
    expect((await pedir()).status).toBe(401);
  });

  it("sin el permiso de gestionar trámites responde 403", async () => {
    for (const token of [tokenConsulta, tokenCi, tokenGerencia]) expect((await pedir(token)).status).toBe(403);
  });

  it("con el permiso entrega un PDF en línea, de dos páginas marcadas, y no escribe nada", async () => {
    const conteo = () => sql()`SELECT (SELECT count(*)::int FROM archivos) AS archivos, (SELECT count(*)::int FROM auditoria) AS auditoria`;
    const [antes] = await conteo();
    const res = await pedir(tokenAdmin);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Disposition")).toMatch(/^inline/);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(2);
    const paginas = await contenidoPorPagina(bytes);
    for (const pagina of paginas) expect(contieneTexto(pagina, "EJEMPLO, SIN VALOR")).toBe(true);
    expect(contieneTexto(paginas.join("\n"), "Criterios que no cumplen, con concepto favorable")).toBe(true);
    const [despues] = await conteo();
    expect({ ...despues }).toEqual({ ...antes });
  });
});

describe("GET /admin/api/informe-ejemplo", () => {
  const pedir = (token?: string) =>
    informeEjemplo(new NextRequest("http://localhost:3002/admin/api/informe-ejemplo", token ? { headers: cookie(token) } : undefined));

  it("401 sin sesión y 403 sin el permiso de gestionar trámites", async () => {
    expect((await pedir()).status).toBe(401);
    for (const token of [tokenConsulta, tokenCi, tokenGerencia]) expect((await pedir(token)).status).toBe(403);
  });

  it("con el permiso entrega un PDF en línea, de varias hojas marcadas, y no escribe nada", async () => {
    const conteo = () => sql()`SELECT (SELECT count(*)::int FROM archivos) AS archivos, (SELECT count(*)::int FROM auditoria) AS auditoria`;
    const [antes] = await conteo();
    const res = await pedir(tokenAdmin);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Disposition")).toMatch(/^inline/);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const paginas = await contenidoPorPagina(new Uint8Array(await res.arrayBuffer()));
    expect(paginas.length).toBeGreaterThanOrEqual(2);
    for (const pagina of paginas) expect(contieneTexto(pagina, "EJEMPLO, SIN VALOR")).toBe(true);
    expect(contieneTexto(paginas[0], "INFORME DE REVISI")).toBe(true);
    const [despues] = await conteo();
    expect({ ...despues }).toEqual({ ...antes });
  });
});

describe("GET /vigencia/revision-anual/[id]/informe", () => {
  const pedir = (id: string, token?: string) =>
    informeAnual(new NextRequest(`http://localhost:3002/vigencia/revision-anual/${id}/informe`, token ? { headers: cookie(token) } : undefined), {
      params: Promise.resolve({ id }),
    });

  it("401 sin sesión; a quien no ve el informe, y a una revisión que no existe, 404 y nunca «sin permiso»", async () => {
    expect((await pedir("1")).status).toBe(401);
    const [{ id }] = await sql()`SELECT COALESCE(max(id), 0) + 1000 AS id FROM revisiones_anuales`;
    for (const token of [tokenConsulta, tokenGerencia, tokenCi, tokenAdmin]) expect((await pedir(String(id), token)).status).toBe(404);
    expect((await pedir("abc", tokenAdmin)).status).toBe(404);
  });
});

describe("GET /distribucion/acuses/excel", () => {
  const pedir = (token?: string) =>
    excelAcuses(new NextRequest("http://localhost:3002/distribucion/acuses/excel", token ? { headers: cookie(token) } : undefined));

  it("401 sin sesión y 403 a quien no ve la distribución", async () => {
    expect((await pedir()).status).toBe(401);
    expect((await pedir(tokenConsulta)).status).toBe(403);
  });

  it("control interno recibe el Excel sin caché y queda auditado", async () => {
    const res = await pedir(tokenCi);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="acuses-\d{8}\.xlsx"$/);
    const [u] = await sql()`SELECT id FROM usuarios WHERE usuario = ${`zz_ci_${SUFIJO}`}`;
    const filas = await sql()`SELECT 1 FROM auditoria WHERE usuario_id = ${u.id} AND accion = 'exporto_acuses'`;
    expect(filas.length).toBe(1);
  });
});

describe.each([
  { nombre: "copias", accion: "exporto_copias", ruta: excelCopias, prefijo: "copias" },
  { nombre: "verificaciones", accion: "exporto_verificaciones", ruta: excelVerificaciones, prefijo: "verificaciones" },
])("GET /distribucion/$nombre/excel", ({ accion, ruta, nombre, prefijo }) => {
  const pedir = (token?: string) =>
    ruta(new NextRequest(`http://localhost:3002/distribucion/${nombre}/excel`, token ? { headers: cookie(token) } : undefined));

  it("401 sin sesion y 403 a quien no ve la distribucion", async () => {
    expect((await pedir()).status).toBe(401);
    expect((await pedir(tokenConsulta)).status).toBe(403);
  });

  it("control interno recibe el Excel sin cache y queda auditado", async () => {
    const [u] = await sql()`SELECT id FROM usuarios WHERE usuario = ${`zz_ci_${SUFIJO}`}`;
    const antes = (await sql()`SELECT 1 FROM auditoria WHERE usuario_id = ${u.id} AND accion = ${accion}`).length;
    const res = await pedir(tokenCi);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Disposition")).toMatch(new RegExp(String.raw`^attachment; filename="${prefijo}-\d{8}\.xlsx"$`));
    const filas = await sql()`SELECT 1 FROM auditoria WHERE usuario_id = ${u.id} AND accion = ${accion}`;
    expect(filas.length).toBe(antes + 1);
  });
});

describe("GET /vigencia/semaforo/excel", () => {
  const pedir = (token?: string) =>
    excelSemaforo(new NextRequest("http://localhost:3002/vigencia/semaforo/excel", token ? { headers: cookie(token) } : undefined));

  it("401 sin sesión y 404 a quien no ve el semáforo", async () => {
    expect((await pedir()).status).toBe(401);
    expect((await pedir(tokenConsulta)).status).toBe(404);
  });

  it("Gerencia recibe el xlsx sin caché y queda auditado", async () => {
    const antes = (await sql()`SELECT 1 FROM auditoria WHERE usuario_id = ${usuarioGerenciaId} AND accion = 'exporto_semaforo'`).length;
    const res = await pedir(tokenGerencia);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="semaforo-\d{8}\.xlsx"$/);
    const filas = await sql()`SELECT 1 FROM auditoria WHERE usuario_id = ${usuarioGerenciaId} AND accion = 'exporto_semaforo'`;
    expect(filas.length).toBe(antes + 1);
  });
});

describe("GET /vigencia/externos/excel", () => {
  const pedir = (token?: string) =>
    excelExternos(new NextRequest("http://localhost:3002/vigencia/externos/excel", token ? { headers: cookie(token) } : undefined));

  async function filasDelExcel(res: Response): Promise<string[][]> {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await res.arrayBuffer());
    const filas: string[][] = [];
    libro.worksheets[0].eachRow((fila) => {
      const valores = fila.values as unknown[];
      filas.push(valores.slice(1).map((v) => (v === null || v === undefined ? "" : String(v))));
    });
    return filas;
  }

  it("401 sin sesión y 404 a Consulta sin externos a su cargo", async () => {
    expect((await pedir()).status).toBe(401);
    expect((await pedir(tokenConsulta)).status).toBe(404);
  });

  it("el responsable técnico de rol Consulta recibe el xlsx con solo sus externos, y queda auditado", () =>
    revertida(sql(), async (tx) => {
      enCurso.sql = tx;
      try {
        const lider = await sesionDe(tx, "lider.cex");
        const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
        const suyo = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017", responsableId: responsable.usuarioId });
        const ajeno = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2019" });
        try {
          const { token } = await crearSesion(responsable.usuarioId, { ip: null, userAgent: null });
          await tx`UPDATE usuarios SET acepto_datos_en = now(), totp_activo = true WHERE id = ${responsable.usuarioId}`;
          const res = await pedir(token);
          expect(res.status).toBe(200);
          expect(res.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
          expect(res.headers.get("Cache-Control")).toBe("no-store");
          expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="externos-\d{8}\.xlsx"$/);
          const texto = (await filasDelExcel(res)).map((f) => f.join(" | ")).join("\n");
          expect(texto).toContain(suyo.codigo);
          expect(texto).toContain("Ministerio de Salud y Protección Social");
          expect(texto).toContain("https://www.minsalud.gov.co/guias");
          expect(texto).not.toContain(ajeno.codigo);
          const auditoria = await tx`SELECT detalle FROM auditoria WHERE usuario_id = ${responsable.usuarioId} AND accion = 'exporto_externos'`;
          expect(auditoria).toHaveLength(1);
          expect(auditoria[0].detalle).toMatchObject({ formato: "excel", total: 1 });
        } finally {
          await suyo.limpiar();
          await ajeno.limpiar();
        }
      } finally {
        enCurso.sql = null;
      }
    }));
});

describe("GET /vigencia/indicadores/excel", () => {
  const pedir = (token?: string, consulta = "") =>
    excelIndicadores(new NextRequest(`http://localhost:3002/vigencia/indicadores/excel${consulta}`, token ? { headers: cookie(token) } : undefined));

  async function hojasDelExcel(res: Response): Promise<Record<string, string>> {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await res.arrayBuffer());
    const hojas: Record<string, string> = {};
    for (const hoja of libro.worksheets) {
      const filas: string[] = [];
      hoja.eachRow((fila) => filas.push((fila.values as unknown[]).slice(1).map((v) => (v === null || v === undefined ? "" : String(v))).join(" | ")));
      hojas[hoja.name] = filas.join("\n");
    }
    return hojas;
  }

  it("401 sin sesión y 404 a Consulta, que no tiene los indicadores", async () => {
    expect((await pedir()).status).toBe(401);
    expect((await pedir(tokenConsulta)).status).toBe(404);
  });

  it("el líder recibe las tres hojas de sus procesos, sin caché, y queda auditado con el periodo y el proceso; un proceso ajeno es 404", () =>
    revertida(sql(), async (tx) => {
      enCurso.sql = tx;
      try {
        const [gth] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
        const [cex] = await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`;
        const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [Number(gth.id)] });
        const { token } = await crearSesion(lider.usuarioId, { ip: null, userAgent: null });
        await tx`UPDATE usuarios SET acepto_datos_en = now(), totp_activo = true WHERE id = ${lider.usuarioId}`;

        expect((await pedir(token, `?proceso=${cex.id}`)).status).toBe(404);
        const res = await pedir(token, `?periodo=2026-T4&proceso=${gth.id}`);
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        expect(res.headers.get("Cache-Control")).toBe("no-store");
        expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="indicadores-\d{8}\.xlsx"$/);
        const hojas = await hojasDelExcel(res);
        expect(Object.keys(hojas)).toEqual(["Indicadores", "Por proceso", "Vencidos"]);
        expect(hojas.Indicadores).toContain("Documentos dentro de su plazo de revisión");
        expect(hojas.Indicadores).toContain("Periodo: cuarto trimestre de 2026 · Proceso: Gestión del Talento Humano");
        expect(hojas["Por proceso"]).not.toMatch(/^CEX \|/m);
        const auditoria = await tx`SELECT detalle FROM auditoria WHERE usuario_id = ${lider.usuarioId} AND accion = 'exporto_indicadores'`;
        expect(auditoria).toHaveLength(1);
        expect(auditoria[0].detalle).toEqual({ formato: "excel", periodo: "2026-T4", procesoId: Number(gth.id) });
      } finally {
        enCurso.sql = null;
      }
    }));

  it("limita a diez descargas por minuto por persona", () =>
    revertida(sql(), async (tx) => {
      enCurso.sql = tx;
      try {
        const lider = await usuarioDePrueba(tx, { rol: "lider_proceso" });
        const { token } = await crearSesion(lider.usuarioId, { ip: null, userAgent: null });
        await tx`UPDATE usuarios SET acepto_datos_en = now(), totp_activo = true WHERE id = ${lider.usuarioId}`;
        for (let i = 0; i < 10; i++) expect((await pedir(token)).status).toBe(200);
        const res = await pedir(token);
        expect(res.status).toBe(429);
        expect(res.headers.get("Retry-After")).toBe("60");
      } finally {
        enCurso.sql = null;
      }
    }));
});

describe("GET /vigencia/externos/[id]/archivos/[archivoId]", () => {
  const pedir = (token?: string, id = "999999999", archivoId = "999999999") =>
    archivoDeEdicionExterna(
      new NextRequest(`http://localhost:3002/vigencia/externos/${id}/archivos/${archivoId}/x.pdf`, token ? { headers: cookie(token) } : undefined),
      { params: Promise.resolve({ id, archivoId, nombre: ["x.pdf"] }) },
    );

  it("401 sin sesión; un externo o un archivo que no existe, o que no se ve, responde 404 y nunca «sin permiso»", async () => {
    expect((await pedir()).status).toBe(401);
    for (const token of [tokenConsulta, tokenAdmin]) expect((await pedir(token)).status).toBe(404);
    expect((await pedir(tokenAdmin, "abc")).status).toBe(404);
  });
});

describe("GET /normograma/excel", () => {
  const pedir = (token?: string) =>
    excelNormograma(new NextRequest("http://localhost:3002/normograma/excel", token ? { headers: cookie(token) } : undefined));

  it("401 sin sesión; Consulta lo descarga (el normograma se lee sin permiso) y queda auditado", async () => {
    expect((await pedir()).status).toBe(401);
    const res = await pedir(tokenConsulta);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="normograma-\d{8}\.xlsx"$/);
    const [{ id }] = await sql()`SELECT id FROM usuarios WHERE usuario = ${`zz_consulta_${SUFIJO}`}`;
    const filas = await sql()`SELECT detalle FROM auditoria WHERE usuario_id = ${id} AND accion = 'exporto_normograma'`;
    expect(filas).toHaveLength(1);
    expect(filas[0].detalle).toMatchObject({ formato: "excel", alcance: "Institucional" });
  });
});

describe("GET /normograma/[id]/archivos/[archivoId]", () => {
  const pedir = (token?: string, id = "999999999", archivoId = "999999999") =>
    pdfDeNorma(
      new NextRequest(`http://localhost:3002/normograma/${id}/archivos/${archivoId}/x.pdf`, token ? { headers: cookie(token) } : undefined),
      { params: Promise.resolve({ id, archivoId, nombre: ["x.pdf"] }) },
    );

  it("401 sin sesión; una norma o un archivo que no existe responde 404, nunca «sin permiso»", async () => {
    expect((await pedir()).status).toBe(401);
    for (const token of [tokenConsulta, tokenAdmin]) expect((await pedir(token)).status).toBe(404);
    expect((await pedir(tokenConsulta, "abc")).status).toBe(404);
  });
});

describe("handlers del panel por rol", () => {
  it("consulta no exporta el maestro (403) y control interno sí (200)", async () => {
    expect((await excelMaestro(new NextRequest("http://localhost:3002/admin/maestro/excel", { headers: cookie(tokenConsulta) }))).status).toBe(403);
    expect((await excelMaestro(new NextRequest("http://localhost:3002/admin/maestro/excel", { headers: cookie(tokenCi) }))).status).toBe(200);
  });
  describe("GET de archivos del panel: quien no puede ver el archivo recibe 404, nunca «sin permiso»", () => {
    const pedir = async (token: string | null, archivoId: number) => {
      const params = { params: Promise.resolve({ archivoId: String(archivoId) }) };
      const res = await verArchivo(
        new NextRequest("http://localhost:3002/admin/api/archivos/1", token ? { headers: cookie(token) } : undefined),
        params,
      );
      return res.status;
    };
    const archivoDe = async (codigo: string, estado: string): Promise<number> => {
      const [a] = await sql()`
        SELECT a.id FROM archivos a
        JOIN documento_versiones v ON v.id = a.version_id
        JOIN documentos d ON d.id = v.documento_id
        WHERE d.codigo = ${codigo} AND v.estado = ${estado} LIMIT 1`;
      expect(a, `archivo ${estado} de ${codigo}`).toBeDefined();
      return Number(a.id);
    };

    it("sin sesión responde 401", async () => {
      expect(await pedir(null, archivoBorradorId)).toBe(401);
    });
    it("un borrador solo se sirve a quien administra", async () => {
      expect(await pedir(tokenAdmin, archivoBorradorId)).toBe(200);
      expect(await pedir(tokenCi, archivoBorradorId)).toBe(404);
      expect(await pedir(tokenMarca, archivoBorradorId)).toBe(404);
      expect(await pedir(tokenConsulta, archivoBorradorId)).toBe(404);
    });
    it("una versión obsoleta o anulada se sirve con historial; sin él, 404", async () => {
      for (const id of [await archivoDe("GTH-CA-01", "obsoleto"), await archivoDe("GIC-IN-02", "anulado")]) {
        expect(await pedir(tokenCi, id)).toBe(200);
        expect(await pedir(tokenMarca, id)).toBe(200);
        expect(await pedir(tokenConsulta, id)).toBe(404);
      }
    });
    it("gerencia no tiene historial: tampoco por el panel", async () => {
      expect(await pedir(tokenGerencia, await archivoDe("GTH-CA-01", "obsoleto"))).toBe(404);
    });
    it("un restringido exige además la regla de acceso: la marca individual no la da", async () => {
      const id = await archivoDe("GTH-FO-01", "vigente");
      expect(await pedir(tokenCi, id)).toBe(200);
      expect(await pedir(tokenMarca, id)).toBe(404);
    });

    describe("versión descartada", () => {
      const codigo = `ZZ-DESC-${SUFIJO}`;
      const nombreArchivo = `zz_descartado_${SUFIJO}.pdf`;
      let documentoId: number;
      let versionId: number;
      let archivoId: number;

      // Documento propio: el almacén y la demo quedan como estaban.
      beforeAll(async () => {
        writeFileSync(path.join(rutaBaseAlmacen(), nombreArchivo), "%PDF-1.4 prueba");
        const [{ id: tipoId }] = await sql()`SELECT id FROM tipos_documento WHERE activo LIMIT 1`;
        const [{ id: procesoId }] = await sql()`SELECT id FROM procesos WHERE activo LIMIT 1`;
        [{ id: documentoId }] = await sql()`INSERT INTO documentos (codigo, titulo, tipo_id)
          VALUES (${codigo}, 'Carga deshecha', ${tipoId}) RETURNING id`;
        [{ id: versionId }] = await sql()`INSERT INTO documento_versiones (documento_id, numero, estado, fecha_elaboracion)
          VALUES (${documentoId}, 1, 'descartado', '2026-01-01') RETURNING id`;
        await sql()`INSERT INTO documento_proceso (documento_id, proceso_id, es_principal)
          VALUES (${documentoId}, ${procesoId}, true)`;
        [{ id: archivoId }] = await sql()`INSERT INTO archivos
            (version_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
          VALUES (${versionId}, 'principal', ${nombreArchivo}, 'carga.pdf', 'pdf', 'application/pdf', 15, 'x')
          RETURNING id`;
      });

      afterAll(async () => {
        await sql()`DELETE FROM archivos WHERE id = ${archivoId}`;
        await sql()`DELETE FROM documento_proceso WHERE documento_id = ${documentoId}`;
        await sql()`DELETE FROM documento_versiones WHERE id = ${versionId}`;
        await sql()`DELETE FROM documentos WHERE id = ${documentoId}`;
        rmSync(path.join(rutaBaseAlmacen(), nombreArchivo), { force: true });
      });

      it("su archivo solo se sirve a quien administra", async () => {
        expect(await pedir(tokenAdmin, archivoId)).toBe(200);
        expect(await pedir(tokenCi, archivoId)).toBe(404);
        expect(await pedir(tokenMarca, archivoId)).toBe(404);
      });

      it("el panel la reserva a quien administra", async () => {
        const ci = { usuarioId: 0, rol: "control_interno", verHistorial: false } as const;
        const admin = { usuarioId: 0, rol: "admin_sgc", verHistorial: false } as const;
        expect(await obtenerDocumentoAdmin(codigo, ci)).toBeNull();
        expect((await listarDocumentosAdmin(ci)).some((d) => d.codigo === codigo)).toBe(false);
        expect((await obtenerDocumentoAdmin(codigo, admin))!.versiones.map((v) => v.estado)).toEqual(["descartado"]);
        expect((await listarDocumentosAdmin(admin)).some((d) => d.codigo === codigo)).toBe(true);
      });
    });
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
    // El caso se arma con la BD: SGC-FO-03 solo tiene un borrador e GIC-IN-02 solo una versión anulada.
    const sinVigente = await sql()`
      SELECT d.codigo FROM documentos d
      WHERE d.codigo IN ('SGC-FO-03', 'GIC-IN-02')
        AND NOT EXISTS (SELECT 1 FROM documento_versiones v WHERE v.documento_id = d.id AND v.estado = 'vigente')
        AND EXISTS (SELECT 1 FROM documento_versiones v WHERE v.documento_id = d.id)`;
    expect(sinVigente.map((f) => f.codigo).sort()).toEqual(["GIC-IN-02", "SGC-FO-03"]);
    const codigos = async (q: string): Promise<string[]> => {
      const r = await buscarApi(new NextRequest(`http://x/api/buscar?q=${encodeURIComponent(q)}`, { headers: cookie(tokenConsulta) }));
      return (await r.json()).resultados.map((f: { codigo: string }) => f.codigo);
    };
    // Control positivo: la misma búsqueda por código sí trae los vigentes de la serie.
    const cal = await codigos("SGC-FO");
    expect(cal).toContain("SGC-FO-01");
    expect(cal).not.toContain("SGC-FO-03");
    const gic = await codigos("GIC-IN");
    expect(gic).toContain("GIC-IN-01");
    expect(gic).not.toContain("GIC-IN-02");
    expect(await codigos("fax")).not.toContain("GIC-IN-02");
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

describe("archivos del trámite", () => {
  const TRAMITE = "999999999";
  const peticion = (metodo: string, ruta: string, cabeceras: Record<string, string> = {}) =>
    new NextRequest(`http://sgc.local${ruta}`, { method: metodo, headers: { host: "sgc.local", ...cabeceras } });
  const subir = (cabeceras?: Record<string, string>, id = TRAMITE, rol = "principal") =>
    subirArchivoTramite(peticion("POST", `/api/tramites/${id}/archivos?rol=${rol}`, cabeceras), { params: Promise.resolve({ id }) });
  const quitar = (cabeceras?: Record<string, string>, id = TRAMITE) =>
    quitarArchivoTramite(peticion("DELETE", `/api/tramites/${id}/archivos/1`, cabeceras), { params: Promise.resolve({ id, archivoId: "1" }) });
  const ver = (cabeceras?: Record<string, string>, id = TRAMITE, archivoId = "1") =>
    verArchivoTramite(peticion("GET", `/tramites/${id}/archivos/${archivoId}`, cabeceras), { params: Promise.resolve({ id, archivoId }) });

  it("sin sesión responden 401", async () => {
    expect((await subir()).status).toBe(401);
    expect((await quitar()).status).toBe(401);
    expect((await ver()).status).toBe(401);
  });

  it("los que escriben responden 403 con un Origin ajeno, aun con sesión", async () => {
    const ajeno = { ...cookie(tokenConsulta), origin: "https://malo.com" };
    const subida = await subir(ajeno);
    expect(subida.status).toBe(403);
    expect(await subida.json()).toEqual({ error: "Origen no permitido" });
    expect((await quitar(ajeno)).status).toBe(403);
  });

  it("el rol de archivo se valida antes de mirar el trámite", async () => {
    expect((await subir(cookie(tokenConsulta), TRAMITE, "acta_aprobacion")).status).toBe(400);
  });

  it("un trámite que no existe, o que no se puede ver, responde 404 y nunca «sin permiso»", async () => {
    expect((await subir(cookie(tokenConsulta))).status).toBe(404);
    expect((await quitar(cookie(tokenConsulta))).status).toBe(404);
    expect((await ver(cookie(tokenConsulta))).status).toBe(404);
  });

  it("un id que no es un número responde 404", async () => {
    expect((await subir(cookie(tokenConsulta), "abc")).status).toBe(404);
    expect((await quitar(cookie(tokenConsulta), "abc")).status).toBe(404);
    expect((await ver(cookie(tokenConsulta), "abc")).status).toBe(404);
    expect((await ver(cookie(tokenConsulta), TRAMITE, "abc")).status).toBe(404);
    expect((await ver(cookie(tokenConsulta), "99999999999999999999")).status).toBe(404);
  });

  it("el ritmo tiene tope por usuario: 30 escrituras y 60 lecturas por minuto", async () => {
    const seguidas = async (n: number, pedir: () => Promise<Response>) => {
      for (let i = 0; i < n; i++) expect((await pedir()).status).toBe(404);
      expect((await pedir()).status).toBe(429);
    };
    const token = await crearUsuario(`zz_ritmo_tramite_${SUFIJO}`, "consulta");
    await seguidas(30, () => subir(cookie(token)));
    await seguidas(30, () => quitar(cookie(token)));
    await seguidas(60, () => ver(cookie(token)));
  });
});

describe("archivos de la edición de un externo", () => {
  const VERSION = "999999999";
  const peticion = (metodo: string, ruta: string, cabeceras: Record<string, string> = {}) =>
    new NextRequest(`http://sgc.local${ruta}`, { method: metodo, headers: { host: "sgc.local", ...cabeceras } });
  const subir = (cabeceras?: Record<string, string>, versionId = VERSION, rol = "principal") =>
    subirArchivoExterno(peticion("POST", `/api/externos/${versionId}/archivos?rol=${rol}`, cabeceras), {
      params: Promise.resolve({ versionId }),
    });
  const quitar = (cabeceras?: Record<string, string>, versionId = VERSION, archivoId = "1") =>
    quitarArchivoExterno(peticion("DELETE", `/api/externos/${versionId}/archivos/${archivoId}`, cabeceras), {
      params: Promise.resolve({ versionId, archivoId }),
    });

  it("sin sesión responden 401", async () => {
    expect((await subir()).status).toBe(401);
    expect((await quitar()).status).toBe(401);
  });

  it("sin el permiso de gestionar externos responden 403", async () => {
    for (const token of [tokenConsulta, tokenCi, tokenGerencia]) {
      expect((await subir(cookie(token))).status).toBe(403);
      expect((await quitar(cookie(token))).status).toBe(403);
    }
  });

  it("con un Origin ajeno responden 403, aun con el permiso", async () => {
    const ajeno = { ...cookie(tokenAdmin), origin: "https://malo.com" };
    const subida = await subir(ajeno);
    expect(subida.status).toBe(403);
    expect(await subida.json()).toEqual({ error: "Origen no permitido" });
    expect((await quitar(ajeno)).status).toBe(403);
  });

  it("el rol de archivo se valida antes de mirar la versión", async () => {
    expect((await subir(cookie(tokenAdmin), VERSION, "acta_aprobacion")).status).toBe(400);
  });

  it("una versión que no existe, o un id que no es un número, responde 404 y nunca «sin permiso»", async () => {
    expect((await subir(cookie(tokenAdmin))).status).toBe(404);
    expect((await quitar(cookie(tokenAdmin))).status).toBe(404);
    expect((await subir(cookie(tokenAdmin), "abc")).status).toBe(404);
    expect((await quitar(cookie(tokenAdmin), "abc")).status).toBe(404);
    expect((await quitar(cookie(tokenAdmin), VERSION, "abc")).status).toBe(404);
    expect((await subir(cookie(tokenAdmin), "99999999999999999999")).status).toBe(404);
  });
});

describe("PDF de una norma: /api/normas/[id]/archivos", () => {
  const NORMA = "999999999";
  const peticion = (metodo: string, ruta: string, cabeceras: Record<string, string> = {}) =>
    new NextRequest(`http://sgc.local${ruta}`, { method: metodo, headers: { host: "sgc.local", ...cabeceras } });
  const subir = (cabeceras?: Record<string, string>, id = NORMA) =>
    subirArchivoNorma(peticion("POST", `/api/normas/${id}/archivos`, cabeceras), { params: Promise.resolve({ id }) });
  const quitar = (cabeceras?: Record<string, string>, id = NORMA, archivoId = "1") =>
    quitarArchivoNorma(peticion("DELETE", `/api/normas/${id}/archivos/${archivoId}`, cabeceras), {
      params: Promise.resolve({ id, archivoId }),
    });

  it("sin sesión responden 401", async () => {
    expect((await subir()).status).toBe(401);
    expect((await quitar()).status).toBe(401);
  });

  it("sin el permiso de administrar el normograma responden 403", async () => {
    for (const token of [tokenConsulta, tokenCi, tokenGerencia]) {
      expect((await subir(cookie(token))).status).toBe(403);
      expect((await quitar(cookie(token))).status).toBe(403);
    }
  });

  it("con un Origin ajeno responden 403, aun con el permiso", async () => {
    const ajeno = { ...cookie(tokenAdmin), origin: "https://malo.com" };
    const subida = await subir(ajeno);
    expect(subida.status).toBe(403);
    expect(await subida.json()).toEqual({ error: "Origen no permitido" });
    expect((await quitar(ajeno)).status).toBe(403);
  });

  it("una norma o un archivo que no existe, o un id que no es un número, responde 404", async () => {
    expect((await subir(cookie(tokenAdmin))).status).toBe(404);
    expect((await quitar(cookie(tokenAdmin))).status).toBe(404);
    expect((await subir(cookie(tokenAdmin), "abc")).status).toBe(404);
    expect((await quitar(cookie(tokenAdmin), "abc")).status).toBe(404);
    expect((await quitar(cookie(tokenAdmin), NORMA, "abc")).status).toBe(404);
    expect((await subir(cookie(tokenAdmin), "99999999999999999999")).status).toBe(404);
  });
});

describe("copias controladas: /distribucion/copias/[id]/pdf y /reimprimir", () => {
  const COPIA = "999999999";
  const parametros = { params: Promise.resolve({ id: COPIA }) };
  const ver = (cabeceras: Record<string, string>) =>
    pdfCopia(new NextRequest(`http://sgc.local/distribucion/copias/${COPIA}/pdf`, { headers: cabeceras }), parametros);
  const reimprimir = (cabeceras: Record<string, string>) =>
    reimprimirCopiaRuta(
      new NextRequest(`http://sgc.local/distribucion/copias/${COPIA}/reimprimir`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", host: "sgc.local", ...cabeceras },
        body: "motivo=ilegible",
      }),
      parametros,
    );

  it("sin sesión responden 401", async () => {
    expect((await ver({})).status).toBe(401);
    expect((await reimprimir({})).status).toBe(401);
  });

  it("una copia que no existe, o que no se puede ver, responde 404 y nunca «sin permiso»", async () => {
    expect((await ver(cookie(tokenConsulta))).status).toBe(404);
    expect((await ver(cookie(tokenAdmin))).status).toBe(404);
  });

  it("reimprimir sin el permiso de emitir responde 403; con un Origin ajeno, también", async () => {
    expect((await reimprimir(cookie(tokenConsulta))).status).toBe(403);
    expect((await reimprimir({ ...cookie(tokenAdmin), origin: "http://otro.local" })).status).toBe(403);
  });

  it("reimprimir una copia que no existe, o que no se ve, responde 404", async () => {
    const res = await reimprimir({ ...cookie(tokenAdmin), origin: "http://sgc.local" });
    expect(res.status).toBe(404);
  });
});
