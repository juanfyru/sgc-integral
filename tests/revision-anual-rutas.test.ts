/**
 * El PDF del informe de la revisión anual (spec 13C §9.5 y §6.4): `asegurarInforme` con el patrón del acta y la ruta
 * `/vigencia/revision-anual/[id]/informe`, que solo entrega el de una revisión cerrada a quien ve el informe
 * institucional. Todo corre dentro de una transacción que se revierte, con el cliente de la app sustituido por ella
 * (el patrón de `tests/handlers-permisos.test.ts`): ninguna revisión cerrada queda en la base. Las campañas son de 2090
 * (una por año); el almacén es una carpeta temporal y lo que se escribe en él se borra en `finally`.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const enCurso = vi.hoisted(() => ({ sql: null as unknown }));

vi.mock("@/db/cliente", async (original) => {
  const real = await original<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => (enCurso.sql ?? real.obtenerSql()) as ReturnType<typeof real.obtenerSql> };
});

import { GET as pdfDelInforme } from "@/app/(app)/vigencia/revision-anual/[id]/informe/route";
import { GET as informeEjemplo } from "@/app/admin/api/informe-ejemplo/route";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { asegurarInforme } from "@/db/consultas/vigencia/informe";
import { cerrarRevision } from "@/db/consultas/vigencia/revision-anual";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { crearSesion } from "@/lib/sesion";
import { documentoConArchivo, huella, pdfDeFormato } from "./utiles/formato";
import { contenidoPorPagina, contieneTexto } from "./utiles/pdf";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { firmaDePrueba, revisionDePrueba } from "./utiles/vigencia";

const sql = obtenerSql();
const ahora = new Date("2090-03-10T15:00:00Z");
const cierre = new Date("2090-04-09T15:00:00Z");

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-revision-anual-rutas-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

const absoluta = (ruta: string) => {
  const a = resolverRutaAlmacen(ruta);
  if (!a) throw new Error(`Ruta inválida: ${ruta}`);
  return a;
};

async function configurar(tx: TransactionSql, valores: Record<string, string>) {
  for (const [clave, valor] of Object.entries(valores)) {
    await tx`INSERT INTO configuracion (clave, valor) VALUES (${clave}, ${valor}) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`;
  }
}

/**
 * Una revisión de 2090 abierta y cerrada con firma dentro de la transacción, con un formato propio para el informe cuyo
 * archivo está en el almacén temporal (`formatoAbsoluta`) y el nombre de la entidad configurado.
 */
async function revisionCerrada(tx: TransactionSql): Promise<{ revisionId: number; admin: SesionFlujo; formatoAbsoluta: string }> {
  const admin = await sesionAdmin(tx);
  const formato = await documentoConArchivo(tx, await pdfDeFormato());
  await configurar(tx, {
    nombre_entidad: "Entidad de la prueba",
    formato_informe_documento_id: String(formato.id),
    formato_informe_margen_superior_cm: "6",
    formato_informe_margen_inferior_cm: "4",
  });
  const { revisionId } = await revisionDePrueba(tx, admin, { ahora });
  await cerrarRevision(admin, { revisionId, credenciales: { clave: "ok" } }, { sql: tx, ahora: cierre, verificar: firmaDePrueba });
  return { revisionId, admin, formatoAbsoluta: formato.absoluta };
}

const RUTA = "informes/revision-2090.pdf";

describe("asegurarInforme", () => {
  it("genera el informe una vez, lo registra con su huella y la segunda vez devuelve el mismo archivo", () =>
    revertida(sql, async (tx) => {
      try {
        const { revisionId, admin } = await revisionCerrada(tx);
        const a = await asegurarInforme(revisionId, { sql: tx, usuarioId: admin.usuarioId });
        expect(a).toEqual({ archivoId: expect.any(Number), ruta: RUTA });
        const bytes = new Uint8Array(await readFile(absoluta(RUTA)));
        const [fila] = await tx`SELECT version_id, contexto, contexto_id, rol, nombre_original, extension, mime, tamano_bytes, hash_sha256
          FROM archivos WHERE id = ${a!.archivoId}`;
        expect({ ...fila, contexto_id: Number(fila.contexto_id), tamano_bytes: Number(fila.tamano_bytes) }).toEqual({
          version_id: null,
          contexto: "revision_anual",
          contexto_id: revisionId,
          rol: "evidencia",
          nombre_original: "Informe revisión anual 2090.pdf",
          extension: "pdf",
          mime: "application/pdf",
          tamano_bytes: bytes.byteLength,
          hash_sha256: huella(bytes),
        });
        const paginas = await contenidoPorPagina(bytes);
        expect(contieneTexto(paginas[0], "INFORME DE REVISI")).toBe(true);
        expect(contieneTexto(paginas.join("\n"), `Revisión n.º ${revisionId}, cerrada el`)).toBe(true);
        const generadas = await tx`SELECT usuario_id, entidad, entidad_id, detalle FROM auditoria WHERE accion = 'informe_generado' AND entidad_id = ${a!.archivoId}`;
        expect(generadas).toHaveLength(1);
        expect(Number(generadas[0].usuario_id)).toBe(admin.usuarioId);
        expect(generadas[0]).toMatchObject({ entidad: "archivos", detalle: { revisionId, anio: 2090, huella: huella(bytes) } });

        // La segunda vez no genera nada: el archivo está en el almacén.
        const generar = vi.fn();
        expect(await asegurarInforme(revisionId, { sql: tx, usuarioId: admin.usuarioId, generar })).toEqual(a);
        expect(generar).not.toHaveBeenCalled();
        expect(await tx`SELECT 1 FROM archivos WHERE contexto = 'revision_anual' AND contexto_id = ${revisionId}`).toHaveLength(1);
      } finally {
        await rm(absoluta(RUTA), { force: true });
      }
    }));

  it("con el archivo borrado y la huella coincidente lo regenera; si sale otro, no lo entrega y lo deja en la bitácora", () =>
    revertida(sql, async (tx) => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const { revisionId, admin } = await revisionCerrada(tx);
        const a = (await asegurarInforme(revisionId, { sql: tx, usuarioId: admin.usuarioId }))!;
        const original = huella(new Uint8Array(await readFile(absoluta(RUTA))));

        await rm(absoluta(RUTA));
        expect(await asegurarInforme(revisionId, { sql: tx, usuarioId: admin.usuarioId })).toEqual(a);
        expect(huella(new Uint8Array(await readFile(absoluta(RUTA))))).toBe(original);
        expect(await tx`SELECT 1 FROM archivos WHERE contexto = 'revision_anual' AND contexto_id = ${revisionId}`).toHaveLength(1);
        expect(error).not.toHaveBeenCalled();

        await rm(absoluta(RUTA));
        const otros = async () => new Uint8Array([37, 80, 68, 70, 45, 49]);
        expect(await asegurarInforme(revisionId, { sql: tx, usuarioId: admin.usuarioId, generar: otros })).toBeNull();
        expect(existsSync(absoluta(RUTA))).toBe(false);
        const [fila] = await tx`SELECT hash_sha256 FROM archivos WHERE id = ${a.archivoId}`;
        expect(fila.hash_sha256).toBe(original);
        const perdidas = await tx`SELECT entidad, entidad_id, detalle FROM auditoria WHERE accion = 'informe_no_regenerable' AND usuario_id = ${admin.usuarioId}`;
        expect(perdidas).toHaveLength(1);
        expect(Number(perdidas[0].entidad_id)).toBe(a.archivoId);
        expect(perdidas[0].detalle).toMatchObject({ revisionId, anio: 2090, huellaRegistrada: original, huellaRegenerada: huella(await otros()) });
        expect(error).toHaveBeenCalledTimes(1);
      } finally {
        error.mockRestore();
        await rm(absoluta(RUTA), { force: true });
      }
    }));

  it("sin el archivo del formato congelado no hay informe: queda en la bitácora con el motivo «formato»", () =>
    revertida(sql, async (tx) => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const { revisionId, admin, formatoAbsoluta } = await revisionCerrada(tx);
        await rm(formatoAbsoluta);
        expect(await asegurarInforme(revisionId, { sql: tx, usuarioId: admin.usuarioId })).toBeNull();
        expect(existsSync(absoluta(RUTA))).toBe(false);
        expect(await tx`SELECT 1 FROM archivos WHERE contexto = 'revision_anual' AND contexto_id = ${revisionId}`).toHaveLength(0);
        const [r] = await tx`SELECT informe->'formato'->>'archivoId' AS archivo FROM revisiones_anuales WHERE id = ${revisionId}`;
        const perdidas = await tx`SELECT entidad_id, detalle FROM auditoria WHERE accion = 'informe_no_regenerable' AND usuario_id = ${admin.usuarioId}`;
        expect(perdidas).toHaveLength(1);
        expect(Number(perdidas[0].entidad_id)).toBe(Number(r.archivo));
        expect(perdidas[0].detalle).toMatchObject({ revisionId, anio: 2090, motivo: "formato" });
        expect(error).toHaveBeenCalledTimes(1);
      } finally {
        error.mockRestore();
        await rm(absoluta(RUTA), { force: true });
      }
    }));

  it("una revisión abierta no tiene informe", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const { revisionId } = await revisionDePrueba(tx, admin, { ahora });
      expect(await asegurarInforme(revisionId, { sql: tx, usuarioId: admin.usuarioId })).toBeNull();
      expect(await asegurarInforme(999_999_999, { sql: tx })).toBeNull();
      expect(await tx`SELECT 1 FROM archivos WHERE contexto = 'revision_anual' AND contexto_id = ${revisionId}`).toHaveLength(0);
    }));
});

describe("GET /vigencia/revision-anual/[id]/informe", () => {
  const pedir = (id: string, token?: string) =>
    pdfDelInforme(
      new NextRequest(`http://localhost:3002/vigencia/revision-anual/${id}/informe`, token ? { headers: { cookie: `sgc_sesion=${token}` } } : undefined),
      { params: Promise.resolve({ id }) },
    );

  /** Una persona de ese rol con su sesión, dentro de la transacción. */
  async function token(tx: TransactionSql, rol: "gerencia" | "control_interno" | "lider_proceso" | "consulta"): Promise<string> {
    const [gth] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
    const u = await usuarioDePrueba(tx, { rol, procesos: rol === "lider_proceso" ? [Number(gth.id)] : [] });
    await tx`UPDATE usuarios SET acepto_datos_en = now(), totp_activo = true WHERE id = ${u.usuarioId}`;
    return (await crearSesion(u.usuarioId, { ip: null, userAgent: null })).token;
  }

  it("401 sin sesión", async () => {
    expect((await pedir("1")).status).toBe(401);
  });

  it("Gerencia y Control Interno lo reciben en línea y sin caché; el líder y Consulta, «no encontrado»; la abierta no tiene", () =>
    revertida(sql, async (tx) => {
      enCurso.sql = tx;
      try {
        const { revisionId } = await revisionCerrada(tx);
        const [gerencia, control, lider, consulta] = [
          await token(tx, "gerencia"),
          await token(tx, "control_interno"),
          await token(tx, "lider_proceso"),
          await token(tx, "consulta"),
        ];
        for (const t of [gerencia, control]) {
          const res = await pedir(String(revisionId), t);
          expect(res.status).toBe(200);
          expect(res.headers.get("Content-Type")).toBe("application/pdf");
          expect(res.headers.get("Cache-Control")).toBe("no-store");
          expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
          expect(res.headers.get("Content-Disposition")).toMatch(/^inline; filename="Informe revision anual 2090\.pdf"/);
          const paginas = await contenidoPorPagina(new Uint8Array(await res.arrayBuffer()));
          expect(contieneTexto(paginas[0], "INFORME DE REVISI")).toBe(true);
        }
        // Lo generó quien lo pidió primero; los demás reciben el mismo archivo.
        expect(await tx`SELECT 1 FROM auditoria WHERE accion = 'informe_generado' AND (detalle->>'revisionId')::bigint = ${revisionId}`).toHaveLength(1);
        for (const t of [lider, consulta]) expect((await pedir(String(revisionId), t)).status).toBe(404);
        expect((await pedir("abc", gerencia)).status).toBe(404);
        expect((await pedir("999999999", gerencia)).status).toBe(404);

        // Abierta, la revisión no tiene informe en PDF: 404 también para quien lo verá al cerrarla.
        const admin = await sesionAdmin(tx);
        const otra = await revisionDePrueba(tx, admin, { ahora: new Date("2091-03-10T15:00:00Z") });
        expect((await pedir(String(otra.revisionId), gerencia)).status).toBe(404);
      } finally {
        enCurso.sql = null;
        await rm(absoluta(RUTA), { force: true });
      }
    }));

  it("si el informe no se puede entregar responde 404 y dice que quedó en la bitácora", () =>
    revertida(sql, async (tx) => {
      enCurso.sql = tx;
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const { revisionId, formatoAbsoluta } = await revisionCerrada(tx);
        await rm(formatoAbsoluta);
        const res = await pedir(String(revisionId), await token(tx, "gerencia"));
        expect(res.status).toBe(404);
        expect((await res.json()).error).toMatch(/bitácora/);
        expect(await tx`SELECT 1 FROM auditoria WHERE accion = 'informe_no_regenerable' AND (detalle->>'revisionId')::bigint = ${revisionId}`).toHaveLength(1);
      } finally {
        error.mockRestore();
        enCurso.sql = null;
        await rm(absoluta(RUTA), { force: true });
      }
    }));
});

describe("GET /admin/api/informe-ejemplo", () => {
  const pedir = (token: string) =>
    informeEjemplo(new NextRequest("http://localhost:3002/admin/api/informe-ejemplo", { headers: { cookie: `sgc_sesion=${token}` } }));

  async function tokenAdmin(tx: TransactionSql): Promise<string> {
    const u = await sesionAdmin(tx);
    await tx`UPDATE usuarios SET acepto_datos_en = now(), totp_activo = true WHERE id = ${u.usuarioId}`;
    return (await crearSesion(u.usuarioId, { ip: null, userAgent: null })).token;
  }

  /** Por cada página, si lleva el membrete (el único objeto que el informe incrusta). */
  const fondos = async (bytes: Uint8Array) => {
    const { PDFDict, PDFDocument, PDFName } = await import("pdf-lib");
    return (await PDFDocument.load(bytes)).getPages().map((p) => {
      const objetos = p.node.Resources()?.lookup(PDFName.of("XObject"));
      return objetos instanceof PDFDict && objetos.keys().length > 0;
    });
  };

  it("usa el formato elegido para el informe, con sus espacios; si no hay, el del acta; sin ninguno, el diseño básico", () =>
    revertida(sql, async (tx) => {
      enCurso.sql = tx;
      try {
        const acta = await documentoConArchivo(tx, await pdfDeFormato());
        const informe = await documentoConArchivo(tx, await pdfDeFormato());
        const t = await tokenAdmin(tx);
        const alturaMaxima = async (res: Response) => {
          const [primera] = await contenidoPorPagina(new Uint8Array(await res.arrayBuffer()));
          return Math.max(...[...primera.matchAll(/\b1 0 0 1 48 (\d+(?:\.\d+)?) Tm/g)].map((m) => Number(m[1])));
        };
        const cm = (x: number) => (x * 72) / 2.54;

        await configurar(tx, {
          nombre_entidad: "Entidad de la prueba",
          formato_acta_documento_id: String(acta.id),
          formato_acta_margen_superior_cm: "5",
          formato_acta_margen_inferior_cm: "3",
          formato_informe_documento_id: String(informe.id),
          formato_informe_margen_superior_cm: "9",
          formato_informe_margen_inferior_cm: "4",
        });
        const conInforme = await pedir(t);
        expect(conInforme.status).toBe(200);
        const bytes = new Uint8Array(await conInforme.clone().arrayBuffer());
        expect(await fondos(bytes)).not.toContain(false);
        const paginas = await contenidoPorPagina(bytes);
        expect(paginas.length).toBeGreaterThanOrEqual(2);
        for (const p of paginas) expect(contieneTexto(p, "EJEMPLO, SIN VALOR")).toBe(true);
        expect(await alturaMaxima(conInforme)).toBeLessThanOrEqual(792 - cm(9));

        await configurar(tx, { formato_informe_documento_id: "" });
        const conActa = await pedir(t);
        expect(await alturaMaxima(conActa.clone())).toBeGreaterThan(792 - cm(9));
        expect(await alturaMaxima(conActa.clone())).toBeLessThanOrEqual(792 - cm(5));
        expect(await fondos(new Uint8Array(await conActa.arrayBuffer()))).not.toContain(false);

        await configurar(tx, { formato_acta_documento_id: "" });
        const basico = new Uint8Array(await (await pedir(t)).arrayBuffer());
        expect(await fondos(basico)).not.toContain(true);
        expect(contieneTexto((await contenidoPorPagina(basico))[0], "Entidad de la prueba")).toBe(true);
      } finally {
        enCurso.sql = null;
      }
    }));

  it("el ritmo tiene tope por persona: 10 por minuto", () =>
    revertida(sql, async (tx) => {
      enCurso.sql = tx;
      try {
        await configurar(tx, { formato_acta_documento_id: "", formato_informe_documento_id: "" });
        const t = await tokenAdmin(tx);
        for (let i = 0; i < 10; i++) expect((await pedir(t)).status).toBe(200);
        const res = await pedir(t);
        expect(res.status).toBe(429);
        expect(res.headers.get("Retry-After")).toBe("60");
      } finally {
        enCurso.sql = null;
      }
    }), 30_000);
});
