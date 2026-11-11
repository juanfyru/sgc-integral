/**
 * Los soportes de una medición (Fase 14A, Tarea 11; spec §6.4, §8.2 y §8.7): subirlos (`POST /api/mediciones/[id]/archivos`),
 * verlos (`GET /indicadores/[codigo]/soportes/[archivoId]`) y quitarlos antes del cierre. Contra la BD de desarrollo, dentro de
 * una transacción que se revierte (el cliente de la app se sustituye por ella mientras dura) y con un almacén temporal.
 *
 * `ind` es trimestral, con inicio en el tercer trimestre de 2025 y aprobado el 15 de enero de 2026: su 2025-T3 es histórico y
 * el 2026-T2 ordinario. Lo mide una persona de rol Consulta; otra, también de Consulta y sin designar, ve el indicador pero
 * no sus soportes.
 */
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { NextRequest } from "next/server";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const enCurso = vi.hoisted(() => ({ sql: null as unknown }));

vi.mock("@/db/cliente", async (original) => {
  const real = await original<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => (enCurso.sql ?? real.obtenerSql()) as ReturnType<typeof real.obtenerSql> };
});

import { GET as verSoporte } from "@/app/(app)/indicadores/[codigo]/soportes/[archivoId]/[[...nombre]]/route";
import { POST as subirSoporte } from "@/app/api/mediciones/[id]/archivos/route";
import { obtenerSql } from "@/db/cliente";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { registrarArchivo } from "@/db/consultas/admin";
import { asegurarMediciones, reportar } from "@/db/consultas/indicadores/mediciones";
import { autorizarSoporte, quitarSoporte, soportesDe, soportesDeVarias } from "@/db/consultas/indicadores/soportes";
import { ErrorPermiso } from "@/lib/permisos";
import { crearSesion } from "@/lib/sesion";
import { ERROR_SOPORTE } from "@/lib/subida";
import { pngDePrueba } from "./png-prueba";
import { peticionDeSubida } from "./utiles/distribucion";
import { indicadorDePrueba, type OpcionesIndicadorDePrueba } from "./utiles/indicadores";
import { pdfDePrueba } from "./utiles/pdf";
import { usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const AHORA = new Date("2026-10-05T15:00:00Z");
const APROBADA = new Date("2026-01-15T15:00:00Z");
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const cookie = (token: string) => ({ cookie: `sgc_sesion=${token}` });

async function conToken(tx: TransactionSql, rol: "consulta" | "admin_sgc" | "gerencia") {
  const u = await usuarioDePrueba(tx, { rol });
  await tx`UPDATE usuarios SET acepto_datos_en = now(), totp_activo = true WHERE id = ${u.usuarioId}`;
  return { sesion: u, token: (await crearSesion(u.usuarioId, { ip: null, userAgent: null })).token };
}

/** Lo que un caso necesita: el indicador, la medición ordinaria y la histórica, quien mide, quien solo ve y un almacén vacío. */
async function entorno(
  fn: (e: {
    tx: TransactionSql;
    almacen: string;
    ind: Awaited<ReturnType<typeof indicadorDePrueba>>;
    medicion: number;
    historica: number;
    mide: Awaited<ReturnType<typeof conToken>>;
    ajeno: Awaited<ReturnType<typeof conToken>>;
    admin: Awaited<ReturnType<typeof conToken>>;
  }) => Promise<void>,
  o: OpcionesIndicadorDePrueba = {},
) {
  const almacenPrevio = process.env.ALMACEN_RUTA;
  const almacen = mkdtempSync(path.join(tmpdir(), "sgc-soportes-"));
  process.env.ALMACEN_RUTA = almacen;
  try {
    await revertida(sql, async (tx) => {
      enCurso.sql = tx;
      try {
        const mide = await conToken(tx, "consulta");
        const ajeno = await conToken(tx, "consulta");
        const admin = await conToken(tx, "admin_sgc");
        const ind = await indicadorDePrueba(tx, {
          periodicidad: "trimestral",
          inicioMedicion: "2025-T3",
          aprobadaEn: APROBADA,
          mide: [mide.sesion.usuarioId],
          ...o,
        });
        await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: ind.id });
        const id = async (periodo: string) =>
          Number((await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = ${periodo}`)[0].id);
        await fn({ tx, almacen, ind, medicion: await id("2026-T2"), historica: await id("2025-T3"), mide, ajeno, admin });
      } finally {
        enCurso.sql = null;
      }
    });
  } finally {
    if (almacenPrevio === undefined) delete process.env.ALMACEN_RUTA;
    else process.env.ALMACEN_RUTA = almacenPrevio;
    rmSync(almacen, { recursive: true, force: true });
  }
}

const subir = (token: string | null, medicionId: number | string, nombre: string, bytes: Uint8Array, cabeceras: Record<string, string> = {}) =>
  subirSoporte(peticionDeSubida(nombre, bytes, { host: "localhost:3002", ...(token ? cookie(token) : {}), ...cabeceras }), {
    params: Promise.resolve({ id: String(medicionId) }),
  });

const ver = (token: string | null, codigo: string, archivoId: number | string) =>
  verSoporte(
    new NextRequest(`http://localhost:3002/indicadores/${codigo}/soportes/${archivoId}/soporte.pdf`, { headers: token ? cookie(token) : {} }),
    { params: Promise.resolve({ codigo, archivoId: String(archivoId), nombre: ["soporte.pdf"] }) },
  );

const eventos = (tx: TransactionSql, medicionId: number) =>
  tx`SELECT tipo, usuario_id, detalle FROM medicion_eventos WHERE medicion_id = ${medicionId} AND tipo = 'soporte' ORDER BY id`;

const archivosDe = (tx: TransactionSql, medicionId: number) =>
  tx`SELECT id, contexto, contexto_id, rol, ruta, nombre_original, mime FROM archivos WHERE contexto = 'medicion' AND contexto_id = ${medicionId} ORDER BY id`;

const enAlmacen = (almacen: string, medicionId: number) => {
  const carpeta = path.join(almacen, "mediciones", String(medicionId));
  return existsSync(carpeta) ? readdirSync(carpeta) : [];
};

async function xlsxDePrueba(): Promise<Uint8Array> {
  const libro = new ExcelJS.Workbook();
  libro.addWorksheet("Datos").addRow([1, 2, 3]);
  return new Uint8Array(await libro.xlsx.writeBuffer());
}

const PDF = () => pdfDePrueba([[612, 792]]);

describe("POST /api/mediciones/[id]/archivos: quién sube", () => {
  it("401 sin sesión, 403 con un Origin ajeno, 404 a un id que no existe, 403 a quien ve el indicador y no lo mide, 409 si está cerrada", () =>
    entorno(async ({ tx, medicion, mide, ajeno, almacen }) => {
      const pdf = await PDF();
      expect((await subir(null, medicion, "soporte.pdf", pdf)).status).toBe(401);
      const origen = await subir(mide.token, medicion, "soporte.pdf", pdf, { origin: "https://malo.com" });
      expect(origen.status).toBe(403);
      expect(await origen.json()).toEqual({ error: "Origen no permitido" });
      expect((await subir(mide.token, "999999999", "soporte.pdf", pdf)).status).toBe(404);
      expect((await subir(mide.token, "abc", "soporte.pdf", pdf)).status).toBe(404);
      expect((await subir(mide.token, "99999999999999999999", "soporte.pdf", pdf)).status).toBe(404);
      expect((await subir(ajeno.token, medicion, "soporte.pdf", pdf)).status).toBe(403);
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id = ${medicion}`;
      expect((await subir(mide.token, medicion, "soporte.pdf", pdf)).status).toBe(409);
      // Nada quedó escrito.
      expect(await archivosDe(tx, medicion)).toHaveLength(0);
      expect(enAlmacen(almacen, medicion)).toEqual([]);
    }));

  it("a quien no ve el indicador (restringido, de otro proceso) le responde 404, no 403", () =>
    entorno(
      async ({ medicion, ajeno }) => {
        expect((await subir(ajeno.token, medicion, "soporte.pdf", await PDF())).status).toBe(404);
      },
      { nivelAcceso: "restringido" },
    ));

  it("autorizarSoporte: 404, 403 y 409 con su motivo; con un indicador retirado, 409", () =>
    entorno(async ({ tx, ind, medicion, mide, ajeno, admin }) => {
      expect(await autorizarSoporte(medicion, mide.sesion, { sql: tx })).toEqual({ ok: true, indicadorId: ind.id });
      expect(await autorizarSoporte(medicion, ajeno.sesion, { sql: tx })).toEqual({ ok: false, estado: 403 });
      // El Admin SGC no mide mientras haya quien mida.
      expect(await autorizarSoporte(medicion, admin.sesion, { sql: tx })).toEqual({ ok: false, estado: 403 });
      expect(await autorizarSoporte(999_999_999, mide.sesion, { sql: tx })).toEqual({ ok: false, estado: 404 });
      await tx`UPDATE indicadores SET estado = 'retirado', baja_por = ${admin.sesion.usuarioId}, baja_en = now(), baja_motivo = 'Ya no se mide' WHERE id = ${ind.id}`;
      expect(await autorizarSoporte(medicion, mide.sesion, { sql: tx })).toEqual({ ok: false, estado: 409 });
    }));
});

describe("POST /api/mediciones/[id]/archivos: qué se guarda", () => {
  it("guarda un PDF y un .xlsx en mediciones/<id>, con su fila de archivos y un evento soporte por cada uno", () =>
    entorno(async ({ tx, medicion, mide, almacen }) => {
      const pdf = await subir(mide.token, medicion, "Informe de Auditoría.pdf", await PDF());
      expect(pdf.status).toBe(201);
      const hoja = await subir(mide.token, medicion, "datos.xlsx", await xlsxDePrueba());
      expect(hoja.status).toBe(201);
      expect(await hoja.json()).toMatchObject({ nombre: "datos.xlsx", mime: XLSX });

      expect(await archivosDe(tx, medicion)).toEqual([
        expect.objectContaining({ contexto: "medicion", rol: "evidencia", ruta: `mediciones/${medicion}/informe-de-auditoria.pdf`, mime: "application/pdf" }),
        expect.objectContaining({ contexto: "medicion", rol: "evidencia", ruta: `mediciones/${medicion}/datos.xlsx`, mime: XLSX }),
      ]);
      expect(Number((await archivosDe(tx, medicion))[0].contexto_id)).toBe(medicion);
      expect(enAlmacen(almacen, medicion).sort()).toEqual(["datos.xlsx", "informe-de-auditoria.pdf"]);

      const e = await eventos(tx, medicion);
      expect(e).toHaveLength(2);
      expect(e[0]).toMatchObject({ usuario_id: mide.sesion.usuarioId, detalle: { accion: "subido", nombre: "Informe de Auditoría.pdf", antes: { soportes: 0 }, despues: { soportes: 1 } } });
      expect(e[1].detalle).toMatchObject({ accion: "subido", nombre: "datos.xlsx", despues: { soportes: 2 } });
      const [b] = await tx`SELECT count(*)::int AS n FROM auditoria WHERE accion = 'subir_archivo' AND usuario_id = ${mide.sesion.usuarioId}`;
      expect(b.n).toBe(2);
    }));

  it("rechaza un .xls, un .docx, un .zip, un .svg y un ZIP renombrado a .xlsx: 415 con ERROR_SOPORTE y nada queda escrito", () =>
    entorno(async ({ tx, medicion, mide, almacen }) => {
      const zip = new JSZip();
      zip.file("datos.txt", "no es una hoja de cálculo");
      const comprimido = await zip.generateAsync({ type: "uint8array" });
      const word = new JSZip();
      word.file("[Content_Types].xml", "<Types/>");
      word.file("word/document.xml", "<w:document/>");
      const docx = await word.generateAsync({ type: "uint8array" });
      const cfb = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...new Array(600).fill(0)]);
      const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      for (const [nombre, bytes] of [
        ["viejo.xls", cfb],
        ["acta.docx", docx],
        ["todo.zip", comprimido],
        ["imagen.svg", svg],
        ["disfrazado.xlsx", comprimido],
        ["disfrazado.xlsx", docx],
        ["disfrazado.xlsx", await word.generateAsync({ type: "uint8array", compression: "DEFLATE" })],
      ] as const) {
        const r = await subir(mide.token, medicion, nombre, bytes);
        expect(r.status, nombre).toBe(415);
        expect(await r.json()).toEqual({ error: ERROR_SOPORTE });
      }
      expect(await archivosDe(tx, medicion)).toHaveLength(0);
      expect(await eventos(tx, medicion)).toHaveLength(0);
      expect(enAlmacen(almacen, medicion)).toEqual([]);
    }));

  it("un .xlsx al estilo openpyxl (con [Content_Types].xml al final y la hoja grande) pasa: se comprueba sobre el archivo completo", () =>
    entorno(async ({ tx, medicion, mide, almacen }) => {
      let semilla = 7;
      const alea = () => (semilla = (semilla * 1103515245 + 12345) & 0x7fffffff);
      const tipos =
        '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>';
      const z = new JSZip();
      z.file("docProps/app.xml", "<a/>");
      z.file("xl/theme/theme1.xml", "<t/>".repeat(1500));
      z.file("xl/worksheets/sheet1.xml", "<worksheet>" + Array.from({ length: 20000 }, () => `<row><c><v>${alea()}.${alea()}</v></c></row>`).join("") + "</worksheet>");
      z.file("xl/workbook.xml", "<workbook/>");
      z.file("[Content_Types].xml", tipos);
      const libro = await z.generateAsync({ type: "uint8array", compression: "DEFLATE" });
      // La muestra de la subida no alcanza el final: file-type la daría por ZIP.
      const { fileTypeFromBuffer } = await import("file-type");
      expect((await fileTypeFromBuffer(libro.subarray(0, 16384)))?.mime).toBe("application/zip");
      const r = await subir(mide.token, medicion, "exportado.xlsx", libro);
      expect(r.status).toBe(201);
      expect((await archivosDe(tx, medicion)).map((a) => a.mime)).toEqual([XLSX]);
      expect(enAlmacen(almacen, medicion)).toEqual(["exportado.xlsx"]);
    }));

  it("el Admin SGC sin nadie más que mida sube un soporte y el evento lleva sinMedidor", () =>
    entorno(
      async ({ tx, ind, medicion, admin }) => {
        const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
        const sigla = `Z${Date.now() % 100_000_000}`;
        const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
          VALUES (${macro.id}, ${`Proceso ${sigla}`}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id`;
        await tx`UPDATE indicadores SET proceso_id = ${p.id} WHERE id = ${ind.id}`;
        expect((await subir(admin.token, medicion, "soporte.pdf", await PDF())).status).toBe(201);
        expect((await eventos(tx, medicion))[0].detalle).toMatchObject({ accion: "subido", sinMedidor: true });
      },
      { mide: [] },
    ));

  it("a un histórico también se le adjunta un soporte, aunque no lo exija", () =>
    entorno(async ({ tx, historica, mide }) => {
      expect((await subir(mide.token, historica, "foto.png", pngDePrueba(8, 8))).status).toBe(201);
      expect(await archivosDe(tx, historica)).toHaveLength(1);
    }));
});

describe("GET /indicadores/[codigo]/soportes/[archivoId]", () => {
  it("401 sin sesión; 404 a quien no ve soportes aunque vea el indicador; 200 como descarga a quien sí", () =>
    entorno(async ({ tx, ind, medicion, mide, ajeno, admin }) => {
      const { id } = (await (await subir(mide.token, medicion, "Informe.pdf", await PDF())).json()) as { id: number };
      expect((await ver(null, ind.codigo, id)).status).toBe(401);

      // Quien ve el indicador, pero no sus soportes: «no encontrado», nunca «sin permiso».
      const sinPermiso = await ver(ajeno.token, ind.codigo, id);
      expect(sinPermiso.status).toBe(404);
      expect((await tx`SELECT 1 FROM indicadores WHERE id = ${ind.id}`).length).toBe(1);

      for (const token of [mide.token, admin.token]) {
        const r = await ver(token, ind.codigo, id);
        expect(r.status).toBe(200);
        expect(r.headers.get("Content-Type")).toBe("application/pdf");
        expect(r.headers.get("Content-Disposition")).toMatch(/^attachment; filename="Informe.pdf"/);
        expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
        expect(r.headers.get("Cache-Control")).toBe("no-store");
      }
      // El código no distingue mayúsculas.
      expect((await ver(mide.token, ind.codigo.toLowerCase(), id)).status).toBe(200);
    }));

  it("un .xlsx se sirve también como descarga, con su MIME", () =>
    entorno(async ({ ind, medicion, mide }) => {
      const { id } = (await (await subir(mide.token, medicion, "datos.xlsx", await xlsxDePrueba())).json()) as { id: number };
      const r = await ver(mide.token, ind.codigo, id);
      expect(r.status).toBe(200);
      expect(r.headers.get("Content-Type")).toBe(XLSX);
      expect(r.headers.get("Content-Disposition")).toMatch(/^attachment/);
    }));

  it("un archivo de otro indicador, de otro contexto o que no existe, en la dirección de este, da 404", () =>
    entorno(async ({ tx, ind, medicion, mide, admin }) => {
      const { id } = (await (await subir(mide.token, medicion, "Informe.pdf", await PDF())).json()) as { id: number };
      const otro = await indicadorDePrueba(tx, { periodicidad: "trimestral", inicioMedicion: "2025-T3", aprobadaEn: APROBADA, mide: [mide.sesion.usuarioId] });
      // El soporte de este indicador, pedido con el código de otro.
      expect((await ver(admin.token, otro.codigo, id)).status).toBe(404);
      // Un archivo que no es un soporte de medición.
      const [h] = await tx`INSERT INTO archivos (version_id, contexto, contexto_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
        VALUES (NULL, 'hallazgo', 1, 'evidencia', 'hallazgos/1/x.pdf', 'x.pdf', 'pdf', 'application/pdf', 4, ${"a".repeat(64)}) RETURNING id`;
      expect((await ver(admin.token, ind.codigo, h.id)).status).toBe(404);
      expect((await ver(admin.token, ind.codigo, 999_999_999)).status).toBe(404);
      expect((await ver(admin.token, ind.codigo, "abc")).status).toBe(404);
      expect((await ver(admin.token, "no-existe-01", id)).status).toBe(404);
    }));

  it("a quien no ve el indicador (restringido) también le da 404", () =>
    entorno(
      async ({ ind, medicion, mide, ajeno }) => {
        const { id } = (await (await subir(mide.token, medicion, "Informe.pdf", await PDF())).json()) as { id: number };
        expect((await ver(ajeno.token, ind.codigo, id)).status).toBe(404);
        expect((await ver(mide.token, ind.codigo, id)).status).toBe(200);
      },
      { nivelAcceso: "restringido" },
    ));
});

describe("registrarArchivo (la transacción de la subida)", () => {
  const archivo = (medicionId: number) => ({
    versionId: null, rol: "evidencia", contexto: "medicion", contextoId: medicionId, ruta: `mediciones/${medicionId}/x.pdf`,
    nombreOriginal: "x.pdf", extension: "pdf", mime: "application/pdf", tamanoBytes: 4, hashSha256: "b".repeat(64),
  });

  it("con la medición cerrada, el indicador retirado o la medición inexistente rechaza, sin fila de archivos ni evento", () =>
    entorno(async ({ tx, ind, medicion, mide, admin }) => {
      const opciones = { sql: tx };
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id = ${medicion}`;
      await expect(registrarArchivo(archivo(medicion), mide.sesion.usuarioId, opciones)).rejects.toThrow("está cerrada");
      await expect(registrarArchivo(archivo(999_999_999), mide.sesion.usuarioId, opciones)).rejects.toThrow("La medición no existe");
      // Otra medición, abierta, de un indicador que se retira.
      const [abierta] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND estado = 'abierta' LIMIT 1`;
      await tx`UPDATE indicadores SET estado = 'retirado', baja_por = ${admin.sesion.usuarioId}, baja_en = now(), baja_motivo = 'Ya no se mide' WHERE id = ${ind.id}`;
      await expect(registrarArchivo(archivo(Number(abierta.id)), mide.sesion.usuarioId, opciones)).rejects.toThrow("ya no está activo");
      for (const id of [medicion, Number(abierta.id)]) {
        expect(await archivosDe(tx, id)).toHaveLength(0);
        expect(await eventos(tx, id)).toHaveLength(0);
      }
    }));
});

describe("soportesDe y soportesDeVarias", () => {
  it("los ve quien ve soportes; para los demás, null", () =>
    entorno(async ({ tx, ind, medicion, historica, mide, ajeno, admin }) => {
      await subir(mide.token, medicion, "uno.pdf", await PDF());
      await subir(mide.token, medicion, "dos.png", pngDePrueba(8, 8));
      await subir(mide.token, historica, "tres.pdf", await PDF());
      const lista = await soportesDe(mide.sesion, medicion, { sql: tx });
      expect(lista?.map((s) => [s.nombre, s.mime])).toEqual([
        ["uno.pdf", "application/pdf"],
        ["dos.png", "image/png"],
      ]);
      expect(lista?.[0].tamano).toBeGreaterThan(0);
      expect((await soportesDe(admin.sesion, medicion, { sql: tx }))?.length).toBe(2);
      expect(await soportesDe(ajeno.sesion, medicion, { sql: tx })).toBeNull();
      expect(await soportesDe(mide.sesion, 999_999_999, { sql: tx })).toBeNull();

      const varias = await soportesDeVarias(mide.sesion, ind.id, [medicion, historica], { sql: tx });
      expect([...(varias ?? new Map())].map(([id, s]) => [id, s.length]).sort()).toEqual([[historica, 1], [medicion, 2]].sort());
      expect(await soportesDeVarias(ajeno.sesion, ind.id, [medicion], { sql: tx })).toBeNull();
    }));
});

describe("quitar un soporte", () => {
  it("antes del cierre lo borra (fila y archivo), deja el evento y la bitácora; después del cierre, no", () =>
    entorno(async ({ tx, ind, medicion, mide, almacen }) => {
      const { id } = (await (await subir(mide.token, medicion, "Informe.pdf", await PDF())).json()) as { id: number };
      await subir(mide.token, medicion, "otro.pdf", await PDF());
      expect(enAlmacen(almacen, medicion).sort()).toEqual(["informe.pdf", "otro.pdf"]);

      await quitarSoporte(mide.sesion, { archivoId: id }, { sql: tx, ahora: AHORA });
      expect((await archivosDe(tx, medicion)).map((a) => a.nombre_original)).toEqual(["otro.pdf"]);
      expect(enAlmacen(almacen, medicion)).toEqual(["otro.pdf"]);
      const e = await eventos(tx, medicion);
      expect(e).toHaveLength(3);
      expect(e[2]).toMatchObject({ usuario_id: mide.sesion.usuarioId, detalle: { accion: "quitado", nombre: "Informe.pdf", antes: { soportes: 2 }, despues: { soportes: 1 } } });
      const [b] = await tx`SELECT usuario_id, detalle FROM auditoria WHERE accion = 'medicion_soporte_quitado' AND entidad = 'medicion' AND entidad_id = ${medicion}`;
      expect(b.usuario_id).toBe(mide.sesion.usuarioId);
      expect(b.detalle).toEqual({ codigo: ind.codigo, indicadorId: ind.id, periodo: "2026-T2", nombre: "Informe.pdf" });

      // Después del cierre, ni el archivo ni el evento cambian.
      const [restante] = await archivosDe(tx, medicion);
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id = ${medicion}`;
      await expect(quitarSoporte(mide.sesion, { archivoId: Number(restante.id) }, { sql: tx, ahora: AHORA })).rejects.toBeInstanceOf(ErrorIndicador);
      expect(await archivosDe(tx, medicion)).toHaveLength(1);
      expect(enAlmacen(almacen, medicion)).toEqual(["otro.pdf"]);
      expect(await eventos(tx, medicion)).toHaveLength(3);
    }));

  it("solo lo quita quien puede medir el indicador activo; un soporte que no existe, o que no es de una medición, no se quita", () =>
    entorno(async ({ tx, ind, medicion, mide, ajeno, admin }) => {
      const { id } = (await (await subir(mide.token, medicion, "Informe.pdf", await PDF())).json()) as { id: number };
      await expect(quitarSoporte(ajeno.sesion, { archivoId: id }, { sql: tx, ahora: AHORA })).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(quitarSoporte(admin.sesion, { archivoId: id }, { sql: tx, ahora: AHORA })).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(quitarSoporte(mide.sesion, { archivoId: 999_999_999 }, { sql: tx, ahora: AHORA })).rejects.toThrow("El soporte no existe");
      expect(await archivosDe(tx, medicion)).toHaveLength(1);
      await tx`UPDATE indicadores SET estado = 'retirado', baja_por = ${admin.sesion.usuarioId}, baja_en = now(), baja_motivo = 'Ya no se mide' WHERE id = ${ind.id}`;
      await expect(quitarSoporte(mide.sesion, { archivoId: id }, { sql: tx, ahora: AHORA })).rejects.toBeInstanceOf(ErrorIndicador);
      expect(await archivosDe(tx, medicion)).toHaveLength(1);
    }));
});

describe("quitar un soporte sin ver el indicador", () => {
  it("da el mismo mensaje que si el soporte no existiera", () =>
    entorno(
      async ({ tx, medicion, mide, ajeno }) => {
        const { id } = (await (await subir(mide.token, medicion, "Informe.pdf", await PDF())).json()) as { id: number };
        await expect(quitarSoporte(ajeno.sesion, { archivoId: id }, { sql: tx, ahora: AHORA })).rejects.toThrow("El soporte no existe");
        expect(await archivosDe(tx, medicion)).toHaveLength(1);
      },
      { nivelAcceso: "restringido" },
    ));
});

describe("con «soporte obligatorio»", () => {
  const datos = (medicionId: number) => ({ medicionId, valores: { A: "9", B: "10" }, parcial: false, confirmado: true });
  const estado = async (tx: TransactionSql, medicionId: number) =>
    (await tx`SELECT estado, reportada_en FROM mediciones WHERE id = ${medicionId}`)[0] as { estado: string; reportada_en: Date | null };

  it("no se reporta sin soporte; con el primero se reporta; quitar el último la devuelve a abierta y subir otro la deja reportada", () =>
    entorno(
      async ({ tx, medicion, mide }) => {
        const sesion: SesionFlujo = mide.sesion;
        await expect(reportar(sesion, datos(medicion), { sql: tx, ahora: AHORA })).rejects.toThrow(/soporte/i);

        // Un soporte con lo digitado guardado sin reportar: la medición sigue abierta.
        await reportar(sesion, { ...datos(medicion), parcial: true }, { sql: tx, ahora: AHORA });
        const { id } = (await (await subir(mide.token, medicion, "Informe.pdf", await PDF())).json()) as { id: number };
        expect((await estado(tx, medicion)).estado).toBe("abierta");

        await reportar(sesion, datos(medicion), { sql: tx, ahora: AHORA });
        expect((await estado(tx, medicion)).estado).toBe("reportada");

        await quitarSoporte(sesion, { archivoId: id }, { sql: tx, ahora: AHORA });
        const tras = await estado(tx, medicion);
        expect(tras.estado).toBe("abierta");
        expect(tras.reportada_en).not.toBeNull();
        const e = await eventos(tx, medicion);
        expect(e[e.length - 1].detalle).toMatchObject({ accion: "quitado", antes: { estado: "reportada", soportes: 1 }, despues: { estado: "abierta", soportes: 0 } });

        // Con los datos ya reportados, subir el soporte que falta la deja reportada.
        expect((await subir(mide.token, medicion, "Informe2.pdf", await PDF())).status).toBe(201);
        expect((await estado(tx, medicion)).estado).toBe("reportada");
        const final = await eventos(tx, medicion);
        expect(final[final.length - 1].detalle).toMatchObject({ accion: "subido", antes: { estado: "abierta" }, despues: { estado: "reportada" } });
      },
      { soporteObligatorio: true },
    ));
});
