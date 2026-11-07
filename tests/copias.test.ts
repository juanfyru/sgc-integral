/** Copias controladas contra la BD de desarrollo, dentro de una transacción que se revierte. */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql, type Cliente } from "@/db/cliente";
import {
  anularCopia,
  conteosPorPunto,
  copiaParaPdf,
  emitirCopia,
  listarCopias,
  obtenerCopia,
  reimprimirCopia,
} from "@/db/consultas/distribucion/copias";
import { ErrorDistribucion } from "@/lib/distribucion/tipos";
import { fechaLimite } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { copiaDePrueba, puntoDePrueba, vigenteConPdf } from "./utiles/distribucion";
import { contenidoPorPagina, contieneTexto } from "./utiles/pdf";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
const T0 = new Date("2026-11-12T15:00:00Z");
const min = (n: number) => new Date(T0.getTime() + n * 60_000);

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-copias-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

const tipos = async (tx: Cliente, copiaId: number) =>
  (await tx`SELECT tipo FROM copia_eventos WHERE copia_id = ${copiaId} ORDER BY id`).map((e) => e.tipo);

const rechaza = (promesa: Promise<unknown>, mensaje: string) =>
  expect(promesa).rejects.toSatisfy((e) => e instanceof ErrorDistribucion && e.message === mensaje);

async function idsProcesos(tx: Cliente, siglas: string[]): Promise<number[]> {
  const filas = await tx`SELECT id FROM procesos WHERE sigla IN ${tx(siglas)}`;
  return filas.map((f) => Number(f.id));
}

describe("emitirCopia", () => {
  it("emite con número por versión, abre la ventana y avisa al responsable", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["GTH"] });
      const { documento, hash, limpiar } = await vigenteConPdf(tx, { proceso: "GTH", tipo: "PR" });
      try {
        const a = await emitirCopia(admin, { documentoId: documento.id, puntoUsoId: punto.id, nota: null }, { sql: tx, ahora: T0 });
        const b = await emitirCopia(admin, { documentoId: documento.id, puntoUsoId: punto.id, nota: "segunda" }, { sql: tx, ahora: T0 });
        expect([a.numero, b.numero]).toEqual([1, 2]);
        const copia = await obtenerCopia(a.copiaId, resp, { sql: tx });
        expect(copia).toMatchObject({ estado: "emitida", hashPrincipal: hash, numero: 1, acciones: ["recibir"] });
        expect(copia?.venceEn).toEqual(fechaLimite(T0, 3, zonaHoraria()));
        expect(await tipos(tx, a.copiaId)).toEqual(["emitida"]);
        const [aviso] = await tx`SELECT tipo, enlace, titulo FROM notificaciones WHERE usuario_id = ${resp.usuarioId} ORDER BY id DESC LIMIT 1`;
        expect(aviso).toMatchObject({ tipo: "distribucion.copia", enlace: `/distribucion/copias/${b.copiaId}` });
        expect(aviso.titulo).toBe(`Le entregarán la copia N.º 02 de ${documento.codigo} v1 en ${punto.nombre}`);
        const [auditoria] = await tx`SELECT detalle FROM auditoria WHERE accion = 'copia_emitida' AND entidad_id = ${a.copiaId}`;
        expect(auditoria.detalle).toMatchObject({ codigo: documento.codigo, version: 1, numero: 1, punto: punto.nombre });
      } finally {
        await limpiar();
      }
    }));

  it("quien emite y es responsable la recibe en el acto, sin aviso", () =>
    revertida(sql, async (tx) => {
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: await idsProcesos(tx, ["GTH"]) });
      const punto = await puntoDePrueba(tx, { responsable: lider, procesos: ["GTH"] });
      const { documento, limpiar } = await vigenteConPdf(tx, { proceso: "GTH", tipo: "PR" });
      try {
        const { copiaId } = await copiaDePrueba(tx, { emisor: lider, documento, punto, ahora: T0 });
        const copia = await obtenerCopia(copiaId, lider, { sql: tx });
        expect(copia).toMatchObject({ estado: "recibida", venceEn: null });
        expect(copia?.fechas.recibidaEn).toEqual(T0);
        expect(await tipos(tx, copiaId)).toEqual(["emitida", "recibida"]);
        const [{ detalle }] = await tx`SELECT detalle FROM copia_eventos WHERE copia_id = ${copiaId} AND tipo = 'emitida'`;
        expect(detalle).toEqual({ recibidaEnElActo: true });
        const [{ n }] = await tx`SELECT count(*)::int AS n FROM notificaciones WHERE usuario_id = ${lider.usuarioId} AND tipo = 'distribucion.copia'`;
        expect(n).toBe(0);
      } finally {
        await limpiar();
      }
    }));

  it("rechaza sin PDF, sin vigente, punto inactivo, restringido que el responsable no ve, líder fuera de alcance y sin permiso", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["GTH"] });
      const emitir = (sesion: typeof admin, documentoId: number) =>
        emitirCopia(sesion, { documentoId, puntoUsoId: punto.id, nota: null }, { sql: tx, ahora: T0 });

      await rechaza(emitir(admin, 999_999_999), "El documento no existe");

      const sinPdf = await vigenteConPdf(tx, { proceso: "GTH", tipo: "PR" });
      const obsoleto = await vigenteConPdf(tx, { proceso: "GTH", tipo: "PR" });
      const restringido = await vigenteConPdf(tx, { proceso: "GTH", tipo: "PR", restringido: true });
      const otro = await vigenteConPdf(tx, { proceso: "GTH", tipo: "PR" });
      try {
        await tx`UPDATE archivos SET mime = 'application/msword' WHERE version_id = ${sinPdf.versionId} AND rol = 'principal'`;
        await rechaza(emitir(admin, sinPdf.documento.id), "Para emitir copias controladas el archivo principal debe ser PDF");

        await tx`UPDATE documento_versiones SET estado = 'obsoleto' WHERE id = ${obsoleto.versionId}`;
        await rechaza(emitir(admin, obsoleto.documento.id), "El documento no tiene versión vigente");

        await rechaza(emitir(admin, restringido.documento.id), `El responsable de ${punto.nombre} no tiene acceso a este documento`);

        const sinAlcance = await usuarioDePrueba(tx, { rol: "lider_proceso" });
        await rechaza(emitir(sinAlcance, restringido.documento.id), "El documento no existe");

        await expect(emitir(await usuarioDePrueba(tx, { rol: "consulta" }), otro.documento.id)).rejects.toThrow(
          "Sin permiso para esta acción",
        );

        await tx`UPDATE puntos_uso SET activo = false WHERE id = ${punto.id}`;
        await rechaza(emitir(admin, otro.documento.id), "El punto de uso no existe o está inactivo");
      } finally {
        await sinPdf.limpiar();
        await obsoleto.limpiar();
        await restringido.limpiar();
        await otro.limpiar();
      }
    }));

  it("un restringido sí se emite si el responsable está asignado a un proceso del documento", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta", procesos: await idsProcesos(tx, ["GTH"]) });
      const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["GTH"] });
      const { documento, limpiar } = await vigenteConPdf(tx, { proceso: "GTH", tipo: "PR", restringido: true });
      try {
        const { numero } = await copiaDePrueba(tx, { emisor: admin, documento, punto, ahora: T0 });
        expect(numero).toBe(1);
      } finally {
        await limpiar();
      }
    }));

  it("el líder emite solo sobre documentos de su alcance", () =>
    revertida(sql, async (tx) => {
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: await idsProcesos(tx, ["GTH"]) });
      const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["GTH"] });
      const propio = await vigenteConPdf(tx, { proceso: "GTH", tipo: "PR" });
      const ajeno = await vigenteConPdf(tx, { proceso: "CEX", tipo: "PR" });
      try {
        await copiaDePrueba(tx, { emisor: lider, documento: propio.documento, punto, ahora: T0 });
        await rechaza(copiaDePrueba(tx, { emisor: lider, documento: ajeno.documento, punto, ahora: T0 }), "El documento no existe");
      } finally {
        await propio.limpiar();
        await ajeno.limpiar();
      }
    }));
});

describe("ventana de impresión", () => {
  it("dentro, una sola impresa; fuera, 409; la reimpresión la reabre; quien solo ve, consultada", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const ci = await usuarioDePrueba(tx, { rol: "control_interno" });
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["GTH"] });
      const { documento, limpiar } = await vigenteConPdf(tx, { proceso: "GTH", tipo: "PR" });
      try {
        const { copiaId } = await copiaDePrueba(tx, { emisor: admin, documento, punto, ahora: T0 });
        const pedir = (sesion: typeof admin, ahora: Date) => copiaParaPdf(copiaId, sesion, { sql: tx, ahora });

        expect(await pedir(admin, min(1))).toMatchObject({ ok: true, nombre: `${documento.codigo}-v1-copia-01.pdf` });
        expect(await tipos(tx, copiaId)).toEqual(["emitida", "impresa"]);
        expect((await pedir(admin, min(2))).ok).toBe(true);
        expect(await tipos(tx, copiaId)).toEqual(["emitida", "impresa"]);

        expect(await pedir(admin, min(16))).toEqual({ ok: false, estado: 409 });

        await reimprimirCopia(copiaId, admin, "deteriorada", null, { sql: tx, ahora: min(20) });
        expect((await pedir(admin, min(21))).ok).toBe(true);
        expect((await pedir(admin, min(22))).ok).toBe(true);
        expect(await tipos(tx, copiaId)).toEqual(["emitida", "impresa", "reimpresa", "impresa"]);
        const [{ detalle }] = await tx`SELECT detalle FROM copia_eventos WHERE copia_id = ${copiaId} AND tipo = 'reimpresa'`;
        expect(detalle).toEqual({ usuarioId: admin.usuarioId, motivo: "deteriorada" });

        expect((await pedir(ci, min(300))).ok).toBe(true);
        expect((await tipos(tx, copiaId)).at(-1)).toBe("consultada");

        // El responsable (consulta) no puede pedir el PDF; un ajeno ni siquiera ve la copia.
        expect(await pedir(resp, min(1))).toEqual({ ok: false, estado: 404 });
        const ajeno = await usuarioDePrueba(tx, { rol: "consulta" });
        expect(await pedir(ajeno, min(1))).toEqual({ ok: false, estado: 404 });
      } finally {
        await limpiar();
      }
    }));

  it("reimprimir con «otro» exige texto y solo vale en estado vivo", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["GTH"] });
      const { documento, limpiar } = await vigenteConPdf(tx, { proceso: "GTH", tipo: "PR" });
      try {
        const { copiaId } = await copiaDePrueba(tx, { emisor: admin, documento, punto, ahora: T0 });
        await rechaza(reimprimirCopia(copiaId, admin, "otro", "  ", { sql: tx, ahora: min(20) }), "Escriba el motivo de la reimpresión");
        await reimprimirCopia(copiaId, admin, "otro", "Se mojó", { sql: tx, ahora: min(20) });
        const [{ detalle }] = await tx`SELECT detalle FROM copia_eventos WHERE copia_id = ${copiaId} AND tipo = 'reimpresa'`;
        expect(detalle).toMatchObject({ motivo: "otro", texto: "Se mojó" });
        await anularCopia(copiaId, admin, "error", null, { sql: tx, ahora: min(21) });
        await rechaza(reimprimirCopia(copiaId, admin, "ilegible", null, { sql: tx, ahora: min(22) }), "La copia ya no está en ese estado");
        expect(await copiaParaPdf(copiaId, admin, { sql: tx, ahora: min(22) })).toEqual({ ok: false, estado: 409 });
      } finally {
        await limpiar();
      }
    }));

  it("si la huella del principal en disco no coincide con la de la copia, no se sirve", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["GTH"] });
      const { documento, limpiar } = await vigenteConPdf(tx, { proceso: "GTH", tipo: "PR" });
      try {
        const { copiaId } = await copiaDePrueba(tx, { emisor: admin, documento, punto, ahora: T0 });
        await tx`UPDATE copias_controladas SET hash_principal = ${"f".repeat(64)} WHERE id = ${copiaId}`;
        expect(await copiaParaPdf(copiaId, admin, { sql: tx, ahora: min(1) })).toEqual({ ok: false, estado: 409 });
      } finally {
        await limpiar();
      }
    }));
});

describe("anularCopia", () => {
  it("solo desde emitida o recibida, por quien emitió o quien gestiona", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const otroAdmin = await sesionAdmin(tx);
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: await idsProcesos(tx, ["GTH"]) });
      const otroLider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: await idsProcesos(tx, ["GTH"]) });
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["GTH"] });
      const { documento, limpiar } = await vigenteConPdf(tx, { proceso: "GTH", tipo: "PR" });
      try {
        const { copiaId } = await copiaDePrueba(tx, { emisor: lider, documento, punto, ahora: T0 });
        await rechaza(anularCopia(copiaId, otroLider, "error", null, { sql: tx, ahora: min(1) }), "La copia no existe");
        await anularCopia(copiaId, lider, "extraviada", "Se perdió en el traslado", { sql: tx, ahora: min(2) });
        const copia = await obtenerCopia(copiaId, admin, { sql: tx });
        expect(copia).toMatchObject({ estado: "anulada", motivoAnulacion: "extraviada" });
        expect(copia?.fechas.anuladaEn).toEqual(min(2));
        expect(await tipos(tx, copiaId)).toEqual(["emitida", "anulada"]);
        const [{ n }] = await tx`SELECT count(*)::int AS n FROM auditoria WHERE accion = 'copia_anulada' AND entidad_id = ${copiaId}`;
        expect(n).toBe(1);
        const [aviso] = await tx`SELECT titulo FROM notificaciones WHERE usuario_id = ${resp.usuarioId} ORDER BY id DESC LIMIT 1`;
        expect(aviso.titulo).toContain("Se anuló la copia N.º 01");
        await rechaza(anularCopia(copiaId, otroAdmin, "error", null, { sql: tx, ahora: min(3) }), "La copia ya no está en ese estado");

        // quien gestiona anula una que emitió otra persona
        const dos = await copiaDePrueba(tx, { emisor: lider, documento, punto, ahora: T0 });
        await anularCopia(dos.copiaId, otroAdmin, "error", null, { sql: tx, ahora: min(4) });
        expect((await obtenerCopia(dos.copiaId, admin, { sql: tx }))?.estado).toBe("anulada");

        // por_recoger no se anula
        const tres = await copiaDePrueba(tx, { emisor: lider, documento, punto, ahora: T0 });
        await tx`UPDATE copias_controladas SET estado = 'por_recoger', motivo_por_recoger = 'nueva_version', por_recoger_en = ${T0} WHERE id = ${tres.copiaId}`;
        await rechaza(anularCopia(tres.copiaId, lider, "error", null, { sql: tx, ahora: min(5) }), "La copia ya no está en ese estado");
      } finally {
        await limpiar();
      }
    }));
});

describe("listado y conteos", () => {
  it("filtra por estado y punto, y cuenta por punto", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["GTH"] });
      const { documento, limpiar } = await vigenteConPdf(tx, { proceso: "GTH", tipo: "PR" });
      try {
        const a = await copiaDePrueba(tx, { emisor: admin, documento, punto, ahora: T0 });
        const b = await copiaDePrueba(tx, { emisor: admin, documento, punto, ahora: T0 });
        await anularCopia(b.copiaId, admin, "error", null, { sql: tx, ahora: min(1) });
        const op = { sql: tx };
        expect((await listarCopias(admin, { puntoId: punto.id, estado: "vivas" }, op)).map((c) => c.id)).toEqual([a.copiaId]);
        expect((await listarCopias(admin, { puntoId: punto.id, estado: "anuladas" }, op)).map((c) => c.id)).toEqual([b.copiaId]);
        expect(await listarCopias(admin, { documentoId: documento.id, estado: "todas" }, op)).toHaveLength(2);
        expect(await listarCopias(admin, { puntoId: punto.id, estado: "por_recoger" }, op)).toHaveLength(0);
        // el responsable del punto ve sus copias; otra persona, ninguna
        expect(await listarCopias(resp, { puntoId: punto.id }, op)).toHaveLength(2);
        expect(await listarCopias(await usuarioDePrueba(tx, { rol: "consulta" }), { puntoId: punto.id }, op)).toHaveLength(0);
        const fila = (await conteosPorPunto(admin, op)).find((c) => c.puntoId === punto.id);
        expect(fila).toMatchObject({ vivas: 1, porRecoger: 0, sinRecibido: 1, nombre: punto.nombre });
      } finally {
        await limpiar();
      }
    }));
});

describe("PDF sellado", () => {
  const imagenes = (doc: PDFDocument, i: number) => {
    const x = doc.getPage(i).node.Resources()?.lookup(PDFName.of("XObject"));
    return x instanceof PDFDict ? x.keys().length : 0;
  };

  it("trae el QR con url_publica y sale sin QR sin ella", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const resp = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["GTH"], nombre: "Urgencias" });
      const { documento, limpiar } = await vigenteConPdf(tx, { proceso: "GTH", tipo: "PR" });
      try {
        const { copiaId } = await copiaDePrueba(tx, { emisor: admin, documento, punto, ahora: T0 });

        await tx`DELETE FROM configuracion WHERE clave = 'url_publica'`;
        const sin = await copiaParaPdf(copiaId, admin, { sql: tx, ahora: min(1) });
        if (!sin.ok) throw new Error("debía generarse");
        const docSin = await PDFDocument.load(sin.bytes);
        expect(docSin.getPageCount()).toBe(2);
        expect(imagenes(docSin, 0)).toBe(0);

        await tx`INSERT INTO configuracion (clave, valor) VALUES ('url_publica', 'https://sgc.ejemplo.gov.co')
          ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`;
        const con = await copiaParaPdf(copiaId, admin, { sql: tx, ahora: min(2) });
        if (!con.ok) throw new Error("debía generarse");
        const docCon = await PDFDocument.load(con.bytes);
        expect(imagenes(docCon, 0)).toBe(1);
        expect(imagenes(docCon, 1)).toBe(1);
        for (const pagina of await contenidoPorPagina(con.bytes)) {
          expect(contieneTexto(pagina, "COPIA CONTROLADA N")).toBe(true);
          expect(contieneTexto(pagina, `${documento.codigo} v1`)).toBe(true);
        }
      } finally {
        await limpiar();
      }
    }));
});
