/**
 * El soporte de un periodo de un dato compartido (anexo 14C, §4.6; Tarea 13 de la 14C): subirlo
 * (`POST /api/datos-compartidos/[id]/archivos`, con `id` el periodo), quitarlo (`DELETE` en la misma ruta, con `?archivo=`) y
 * descargarlo (`GET /indicadores/datos/[id]/soportes/[archivoId]`). Contra la BD de desarrollo, dentro de una transacción
 * que se revierte (el cliente de la app se sustituye por ella mientras dura) y con un almacén temporal.
 *
 * El dato es mensual, de un proceso que solo existe en la transacción (sin líderes), con un responsable de rol Consulta. Lo
 * usa un indicador general que mide otra persona de Consulta; una tercera, también de Consulta y sin designar, ve el
 * indicador pero no el dato ni sus soportes. El Admin SGC ve el dato y no lo reporta: el dato tiene responsable activo.
 */
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
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

import { GET as verSoporte } from "@/app/(app)/indicadores/datos/[id]/soportes/[archivoId]/route";
import { DELETE as quitarSoporte, POST as subirSoporte } from "@/app/api/datos-compartidos/[id]/archivos/route";
import { obtenerSql } from "@/db/cliente";
import { puedeVerSoporteDeDato, soporteDeDatoServible, soportesDeDato } from "@/db/consultas/indicadores/datos-soporte";
import { describirEvento, nombreDeAccion } from "@/lib/bitacora-detalle";
import { crearSesion } from "@/lib/sesion";
import { ERROR_SOPORTE } from "@/lib/subida";
import { peticionDeSubida } from "./utiles/distribucion";
import { datoDePrueba, indicadorDePrueba, periodoDeDatoDePrueba } from "./utiles/indicadores";
import { pdfDePrueba } from "./utiles/pdf";
import { usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const AHORA = new Date("2026-11-03T15:00:00Z");
const NOMBRE = "Total facturado en el mes";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const HOST = "localhost:3002";
const cookie = (token: string) => ({ cookie: `sgc_sesion=${token}` });

let consecutivo = 0;

async function conToken(tx: TransactionSql, rol: "consulta" | "admin_sgc" | "gerencia") {
  const u = await usuarioDePrueba(tx, { rol });
  await tx`UPDATE usuarios SET acepto_datos_en = now(), totp_activo = true WHERE id = ${u.usuarioId}`;
  return { sesion: u, token: (await crearSesion(u.usuarioId, { ip: null, userAgent: null })).token };
}

type Persona = Awaited<ReturnType<typeof conToken>>;

type Entorno = {
  tx: TransactionSql;
  almacen: string;
  datoId: number;
  /** Octubre de 2026, pendiente. */
  periodoId: number;
  /** Septiembre de 2026, ya reportado. */
  otroPeriodoId: number;
  indicador: Awaited<ReturnType<typeof indicadorDePrueba>>;
  responsable: Persona;
  mide: Persona;
  ve: Persona;
  admin: Persona;
};

/** Lo que un caso necesita, dentro de una transacción que se revierte y con un almacén vacío. */
async function entorno(fn: (e: Entorno) => Promise<void>) {
  const almacenPrevio = process.env.ALMACEN_RUTA;
  const almacen = mkdtempSync(path.join(tmpdir(), "sgc-datos-soporte-"));
  process.env.ALMACEN_RUTA = almacen;
  try {
    await revertida(sql, async (tx) => {
      enCurso.sql = tx;
      try {
        consecutivo += 1;
        const sigla = `Z${Date.now() % 100_000_000}${consecutivo}`;
        const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
        const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
          VALUES (${macro.id}, ${`Proceso ${sigla}`}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id`;
        const procesoId = Number(p.id);
        const responsable = await conToken(tx, "consulta");
        const mide = await conToken(tx, "consulta");
        const ve = await conToken(tx, "consulta");
        const admin = await conToken(tx, "admin_sgc");
        const datoId = await datoDePrueba(tx, { procesoId, nombre: NOMBRE, responsables: [responsable.sesion.usuarioId] });
        const indicador = await indicadorDePrueba(tx, { procesoId, mide: [mide.sesion.usuarioId], variables: { B: { datoId } } });
        const periodoId = await periodoDeDatoDePrueba(tx, { datoId, periodo: "2026-10", ahora: AHORA });
        const otroPeriodoId = await periodoDeDatoDePrueba(tx, { datoId, periodo: "2026-09", valor: "1200", ahora: AHORA });
        await fn({ tx, almacen, datoId, periodoId, otroPeriodoId, indicador, responsable, mide, ve, admin });
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

const params = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });

const subir = (token: string | null, periodoId: number | string, nombre: string, bytes: Uint8Array, cabeceras: Record<string, string> = {}) =>
  subirSoporte(peticionDeSubida(nombre, bytes, { host: HOST, ...(token ? cookie(token) : {}), ...cabeceras }), params(periodoId));

const quitar = (token: string | null, periodoId: number | string, archivoId: number | string, cabeceras: Record<string, string> = {}) =>
  quitarSoporte(
    new NextRequest(`http://${HOST}/api/datos-compartidos/${periodoId}/archivos?archivo=${archivoId}`, {
      method: "DELETE",
      headers: { host: HOST, origin: `http://${HOST}`, ...(token ? cookie(token) : {}), ...cabeceras },
    }),
    params(periodoId),
  );

const ver = (token: string | null, datoId: number | string, archivoId: number | string) =>
  verSoporte(new NextRequest(`http://${HOST}/indicadores/datos/${datoId}/soportes/${archivoId}`, { headers: token ? cookie(token) : {} }), {
    params: Promise.resolve({ id: String(datoId), archivoId: String(archivoId) }),
  });

const archivosDe = (tx: TransactionSql, periodoId: number) =>
  tx`SELECT id, contexto, contexto_id, rol, ruta, nombre_original, mime FROM archivos
    WHERE contexto = 'dato_compartido' AND contexto_id = ${periodoId} ORDER BY id`;

const eventos = async (tx: TransactionSql, periodoId: number) =>
  (await tx`SELECT tipo, usuario_id, detalle FROM variable_eventos WHERE valor_id = ${periodoId} ORDER BY id`).map((e) => ({
    tipo: e.tipo as string,
    usuarioId: e.usuario_id === null ? null : Number(e.usuario_id),
    detalle: e.detalle as Record<string, unknown>,
  }));

const bitacora = async (tx: TransactionSql, datoId: number, accion: string) =>
  (await tx`SELECT usuario_id, detalle FROM auditoria WHERE entidad = 'dato_compartido' AND entidad_id = ${datoId} AND accion = ${accion} ORDER BY id`).map(
    (f) => ({ usuarioId: Number(f.usuario_id), detalle: f.detalle as Record<string, unknown> }),
  );

const enAlmacen = (almacen: string, periodoId: number) => {
  const carpeta = path.join(almacen, "datos-compartidos", String(periodoId));
  return existsSync(carpeta) ? readdirSync(carpeta) : [];
};

const PDF = () => pdfDePrueba([[612, 792]]);

async function xlsxDePrueba(): Promise<Uint8Array> {
  const libro = new ExcelJS.Workbook();
  libro.addWorksheet("Datos").addRow([1, 2, 3]);
  return new Uint8Array(await libro.xlsx.writeBuffer());
}

/** Sube un PDF como el responsable y devuelve el id del archivo. */
async function subido(e: Entorno, nombre = "Cierre de facturación octubre.pdf", periodoId = e.periodoId): Promise<number> {
  const r = await subir(e.responsable.token, periodoId, nombre, await PDF());
  expect(r.status).toBe(201);
  return ((await r.json()) as { id: number }).id;
}

describe("POST /api/datos-compartidos/[id]/archivos: quién sube", () => {
  it("401 sin sesión, 403 con un Origin ajeno, 404 a un periodo que no existe o que no se ve, 403 a quien lo ve y no lo reporta", () =>
    entorno(async ({ tx, almacen, periodoId, responsable, mide, ve, admin }) => {
      const pdf = await PDF();
      expect((await subir(null, periodoId, "soporte.pdf", pdf)).status).toBe(401);
      const origen = await subir(responsable.token, periodoId, "soporte.pdf", pdf, { origin: "https://malo.com" });
      expect(origen.status).toBe(403);
      expect(await origen.json()).toEqual({ error: "Origen no permitido" });
      for (const id of ["999999999", "abc", "99999999999999999999"]) {
        expect((await subir(responsable.token, id, "soporte.pdf", pdf)).status, id).toBe(404);
      }
      // Quien no ve el dato (también quien mide un indicador que lo usa): para él no existe.
      for (const p of [ve, mide]) {
        const r = await subir(p.token, periodoId, "soporte.pdf", pdf);
        expect(r.status).toBe(404);
        expect(await r.json()).toEqual({ error: "El periodo del dato no existe" });
      }
      // El Admin SGC ve el dato, pero lo reporta su responsable.
      const sinPermiso = await subir(admin.token, periodoId, "soporte.pdf", pdf);
      expect(sinPermiso.status).toBe(403);
      expect(await sinPermiso.json()).toEqual({ error: "Sin permiso" });
      expect(await archivosDe(tx, periodoId)).toHaveLength(0);
      expect(enAlmacen(almacen, periodoId)).toEqual([]);
    }));

  it("con el periodo cerrado, 409 y nada queda escrito", () =>
    entorno(async ({ tx, almacen, periodoId, responsable }) => {
      await tx`UPDATE variable_valores SET estado = 'cerrado', valor = 0 WHERE id = ${periodoId}`;
      const r = await subir(responsable.token, periodoId, "soporte.pdf", await PDF());
      expect(r.status).toBe(409);
      expect(await r.json()).toEqual({ error: "El periodo está cerrado: ya no admite cambios en sus soportes" });
      expect(await archivosDe(tx, periodoId)).toHaveLength(0);
      expect(await eventos(tx, periodoId)).toEqual([]);
      expect(enAlmacen(almacen, periodoId)).toEqual([]);
    }));
});

describe("POST /api/datos-compartidos/[id]/archivos: qué se guarda", () => {
  it("el responsable sube un PDF y un .xlsx: 201, su fila en datos-compartidos/<periodo>, el evento «soporte» y la bitácora", () =>
    entorno(async (e) => {
      const { tx, almacen, datoId, periodoId, responsable } = e;
      await subido(e);
      const hoja = await subir(responsable.token, periodoId, "detalle.xlsx", await xlsxDePrueba());
      expect(hoja.status).toBe(201);
      expect(await hoja.json()).toMatchObject({ nombre: "detalle.xlsx", mime: XLSX });

      const filas = await archivosDe(tx, periodoId);
      expect(filas.map((f) => [f.rol, f.ruta, f.mime, Number(f.contexto_id)])).toEqual([
        ["evidencia", `datos-compartidos/${periodoId}/cierre-de-facturacion-octubre.pdf`, "application/pdf", periodoId],
        ["evidencia", `datos-compartidos/${periodoId}/detalle.xlsx`, XLSX, periodoId],
      ]);
      expect(enAlmacen(almacen, periodoId).sort()).toEqual(["cierre-de-facturacion-octubre.pdf", "detalle.xlsx"]);
      expect(await eventos(tx, periodoId)).toEqual([
        { tipo: "soporte", usuarioId: responsable.sesion.usuarioId, detalle: { accion: "subido", nombre: "Cierre de facturación octubre.pdf" } },
        { tipo: "soporte", usuarioId: responsable.sesion.usuarioId, detalle: { accion: "subido", nombre: "detalle.xlsx" } },
      ]);
      // En la bitácora, como cualquier evidencia: el `subir_archivo` de `registrarArchivo`, sin una entrada propia del dato.
      const subidas = await tx`SELECT usuario_id, detalle FROM auditoria
        WHERE accion = 'subir_archivo' AND detalle->>'contexto' = 'dato_compartido' AND (detalle->>'contextoId')::bigint = ${periodoId}
        ORDER BY id`;
      expect(subidas.map((f) => [Number(f.usuario_id), (f.detalle as Record<string, unknown>).nombre])).toEqual([
        [responsable.sesion.usuarioId, "Cierre de facturación octubre.pdf"],
        [responsable.sesion.usuarioId, "detalle.xlsx"],
      ]);
      expect(await tx`SELECT 1 FROM auditoria WHERE entidad = 'dato_compartido' AND entidad_id = ${datoId}`).toHaveLength(0);
      // El periodo sigue pendiente: el soporte no es el reporte.
      expect((await tx`SELECT estado FROM variable_valores WHERE id = ${periodoId}`)[0].estado).toBe("pendiente");
    }));

  it("un .xls no es un soporte: 415 con ERROR_SOPORTE y nada queda escrito", () =>
    entorno(async ({ tx, almacen, periodoId, responsable }) => {
      const cfb = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...new Array(600).fill(0)]);
      const r = await subir(responsable.token, periodoId, "viejo.xls", cfb);
      expect(r.status).toBe(415);
      expect(await r.json()).toEqual({ error: ERROR_SOPORTE });
      expect(await archivosDe(tx, periodoId)).toHaveLength(0);
      expect(await eventos(tx, periodoId)).toEqual([]);
      expect(enAlmacen(almacen, periodoId)).toEqual([]);
    }));

  it("a un periodo ya reportado, antes del cierre, también se le adjunta", () =>
    entorno(async (e) => {
      await subido(e, "respaldo.pdf", e.otroPeriodoId);
      expect(await archivosDe(e.tx, e.otroPeriodoId)).toHaveLength(1);
    }));

  it("sin responsable ni líder activos, el Admin SGC sube el soporte y el evento lo marca", () =>
    entorno(async (e) => {
      const { tx, periodoId, responsable, admin } = e;
      await tx`UPDATE usuarios SET activo = false WHERE id = ${responsable.sesion.usuarioId}`;
      const r = await subir(admin.token, periodoId, "soporte.pdf", await PDF());
      expect(r.status).toBe(201);
      expect((await eventos(tx, periodoId))[0]).toEqual({
        tipo: "soporte",
        usuarioId: admin.sesion.usuarioId,
        detalle: { accion: "subido", nombre: "soporte.pdf", sinResponsable: true },
      });
    }));
});

describe("DELETE /api/datos-compartidos/[id]/archivos?archivo=", () => {
  it("el responsable lo quita antes del cierre: la fila, el archivo, el evento «soporte» y la bitácora", () =>
    entorno(async (e) => {
      const { tx, almacen, datoId, periodoId, responsable } = e;
      const archivoId = await subido(e);
      const r = await quitar(responsable.token, periodoId, archivoId);
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ ok: true });
      expect(await archivosDe(tx, periodoId)).toHaveLength(0);
      expect(enAlmacen(almacen, periodoId)).toEqual([]);
      expect((await eventos(tx, periodoId)).map((x) => x.detalle)).toEqual([
        { accion: "subido", nombre: "Cierre de facturación octubre.pdf" },
        { accion: "quitado", nombre: "Cierre de facturación octubre.pdf" },
      ]);
      expect(await bitacora(tx, datoId, "dato_soporte_quitado")).toEqual([
        {
          usuarioId: responsable.sesion.usuarioId,
          detalle: { nombre: NOMBRE, periodo: "2026-10", periodoId, archivo: "Cierre de facturación octubre.pdf" },
        },
      ]);
    }));

  it("401 sin sesión, 403 con un Origin ajeno o a quien ve el dato y no lo reporta, 404 a quien no lo ve y a un archivo de otro periodo", () =>
    entorno(async (e) => {
      const { tx, periodoId, otroPeriodoId, ve, mide, admin, responsable } = e;
      const archivoId = await subido(e);
      const deOtro = await subido(e, "septiembre.pdf", otroPeriodoId);
      expect((await quitar(null, periodoId, archivoId)).status).toBe(401);
      expect((await quitar(responsable.token, periodoId, archivoId, { origin: "https://malo.com" })).status).toBe(403);
      expect((await quitar(admin.token, periodoId, archivoId)).status).toBe(403);
      for (const p of [ve, mide]) expect((await quitar(p.token, periodoId, archivoId)).status).toBe(404);
      // El archivo existe, pero es de otro periodo; un id que no es un número tampoco.
      const ajeno = await quitar(responsable.token, periodoId, deOtro);
      expect(ajeno.status).toBe(404);
      expect(await ajeno.json()).toEqual({ error: "El soporte no existe" });
      expect((await quitar(responsable.token, periodoId, "abc")).status).toBe(404);
      expect((await quitar(responsable.token, "abc", archivoId)).status).toBe(404);
      expect(await archivosDe(tx, periodoId)).toHaveLength(1);
      expect(await archivosDe(tx, otroPeriodoId)).toHaveLength(1);
    }));

  it("con el periodo cerrado, 409 y el soporte se queda", () =>
    entorno(async (e) => {
      const archivoId = await subido(e);
      await e.tx`UPDATE variable_valores SET estado = 'cerrado', valor = 0 WHERE id = ${e.periodoId}`;
      const r = await quitar(e.responsable.token, e.periodoId, archivoId);
      expect(r.status).toBe(409);
      expect(await r.json()).toEqual({ error: "El periodo está cerrado: ya no admite cambios en sus soportes" });
      expect(await archivosDe(e.tx, e.periodoId)).toHaveLength(1);
    }));
});

describe("GET /indicadores/datos/[id]/soportes/[archivoId]", () => {
  it("el responsable y quien mide un indicador que usa el dato lo descargan; quien solo ve el indicador general recibe 404", () =>
    entorno(async (e) => {
      const { datoId, responsable, mide, ve, admin } = e;
      const archivoId = await subido(e);
      expect((await ver(null, datoId, archivoId)).status).toBe(401);
      for (const p of [responsable, mide, admin]) {
        const r = await ver(p.token, datoId, archivoId);
        expect(r.status).toBe(200);
        expect(r.headers.get("Content-Type")).toBe("application/pdf");
        expect(r.headers.get("Content-Disposition")).toMatch(/^attachment; filename="Cierre de facturacion octubre.pdf"/);
        expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
        expect(r.headers.get("Cache-Control")).toBe("no-store");
      }
      expect((await ver(ve.token, datoId, archivoId)).status).toBe(404);
    }));

  it("un archivo que no es soporte de ese dato es 404: otro dato, una medición, un id que no es un número", () =>
    entorno(async (e) => {
      const { tx, datoId, indicador, responsable } = e;
      const archivoId = await subido(e);
      const otroDato = await datoDePrueba(tx, { procesoId: indicador.procesoId, responsables: [responsable.sesion.usuarioId] });
      expect((await ver(responsable.token, otroDato, archivoId)).status).toBe(404);
      const [medicion] = await tx`INSERT INTO archivos (version_id, contexto, contexto_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
        VALUES (NULL, 'medicion', ${e.periodoId}, 'evidencia', 'mediciones/x/y.pdf', 'y.pdf', 'pdf', 'application/pdf', 4, ${"d".repeat(64)})
        RETURNING id`;
      expect((await ver(responsable.token, datoId, Number(medicion.id))).status).toBe(404);
      expect((await ver(responsable.token, datoId, "abc")).status).toBe(404);
      expect((await ver(responsable.token, "abc", archivoId)).status).toBe(404);
    }));
});

describe("quién ve el soporte de un dato (puedeVerSoporteDeDato, soporteDeDatoServible, soportesDeDato)", () => {
  it("quien ve el dato y quien ve los soportes de un indicador con una ficha aprobada que lo cita; nadie más", () =>
    entorno(async (e) => {
      const { tx, datoId, periodoId, responsable, mide, ve, admin } = e;
      for (const [p, ve_] of [
        [responsable, true],
        [mide, true],
        [admin, true],
        [ve, false],
      ] as const) {
        expect(await puedeVerSoporteDeDato(tx, p.sesion, datoId)).toBe(ve_);
      }
      const archivoId = await subido(e);
      expect(await soporteDeDatoServible(mide.sesion, { datoId, archivoId }, { sql: tx })).toMatchObject({
        nombreOriginal: "Cierre de facturación octubre.pdf",
        mime: "application/pdf",
      });
      expect(await soporteDeDatoServible(ve.sesion, { datoId, archivoId }, { sql: tx })).toBeNull();
      const porPeriodo = (await soportesDeDato(responsable.sesion, datoId, { sql: tx }))!;
      expect(porPeriodo.get(periodoId)?.map((s) => [s.id, s.nombre, s.mime])).toEqual([[archivoId, "Cierre de facturación octubre.pdf", "application/pdf"]]);
      expect(await soportesDeDato(ve.sesion, datoId, { sql: tx })).toBeNull();
    }));

  it("un borrador que cita el dato no da acceso a sus soportes", () =>
    entorno(async ({ tx, datoId, indicador }) => {
      const otro = await usuarioDePrueba(tx, { rol: "consulta" });
      await indicadorDePrueba(tx, { procesoId: indicador.procesoId, estado: "borrador", mide: [otro.usuarioId], variables: { B: { datoId } } });
      expect(await puedeVerSoporteDeDato(tx, otro, datoId)).toBe(false);
    }));
});

describe("la bitácora del soporte de un dato", () => {
  it("la quitada dice qué archivo, de qué dato y de qué periodo (la subida queda en el «subir_archivo» genérico)", () => {
    const evento = (accion: string, detalle: Record<string, unknown>) =>
      describirEvento({ accion, entidad: "dato_compartido", entidadId: 4, detalle });
    const detalle = { nombre: NOMBRE, periodo: "2026-10", periodoId: 9, archivo: "cierre.pdf" };
    expect(evento("dato_soporte_quitado", detalle)).toBe(`Quitó el soporte «cierre.pdf» del dato compartido «${NOMBRE}», octubre de 2026`);
    expect(evento("dato_soporte_quitado", { ...detalle, sinResponsable: true })).toBe(
      `Quitó el soporte «cierre.pdf» del dato compartido «${NOMBRE}», octubre de 2026 (sin nadie más que pudiera reportarlo)`,
    );
    expect(evento("dato_soporte_quitado", { archivo: "cierre.pdf" })).toBe("Quitó el soporte «cierre.pdf» de un dato compartido");
    expect(nombreDeAccion("dato_soporte_quitado")).toBe("Quitó un soporte de un dato compartido");
  });
});
