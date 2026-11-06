/**
 * El documento que la entidad elige como formato del acta (spec de las adiciones, §4.2 y §4.4). Corre
 * contra la demo en transacciones que se revierten; los PDF van a un almacén temporal.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { archivoDeFormato, documentosParaFormato, membreteListo, revisarFormatoActa } from "@/db/consultas/formato-acta";
import {
  documentoConArchivo,
  huella,
  pdfContenidoCorrupto,
  pdfContenidoVacio,
  pdfDeFormato,
  pdfProtegido,
  pdfSinContenido,
  pdfSinPaginas,
} from "./utiles/formato";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-formato-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

const NO_LEGIBLE = /no se puede leer/;

describe("revisarFormatoActa", () => {
  it("sin documento elegido no hay nada que revisar", async () => {
    expect(await revisarFormatoActa(null)).toEqual({ estado: "sin_formato" });
  });

  it("un PDF de una página, carta, general y vigente está listo", () => revertida(sql, async (tx) => {
    const doc = await documentoConArchivo(tx);
    expect(await revisarFormatoActa(doc.id, { sql: tx })).toEqual({ estado: "listo", codigo: doc.codigo, version: 1 });
  }));

  it("cada motivo se explica", () => revertida(sql, async (tx) => {
    const motivoDe = async (id: number) => {
      const r = await revisarFormatoActa(id, { sql: tx });
      return r.estado === "no_sirve" ? r.motivo : r.estado;
    };

    const sinVigente = await documentoConArchivo(tx);
    await tx`UPDATE documento_versiones SET estado = 'obsoleto' WHERE documento_id = ${sinVigente.id}`;
    expect(await motivoDe(sinVigente.id)).toMatch(/no tiene versión vigente/);
    expect(await motivoDe(999_999_999)).toMatch(/no tiene versión vigente/);

    const restringido = await documentoConArchivo(tx);
    await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${restringido.id}`;
    expect(await motivoDe(restringido.id)).toMatch(/restringido/);

    const word = await documentoConArchivo(tx);
    await tx`UPDATE archivos SET mime = 'application/msword' WHERE id = ${word.archivoId}`;
    expect(await motivoDe(word.id)).toMatch(/debe ser PDF/);

    expect(await motivoDe((await documentoConArchivo(tx, await pdfDeFormato(2))).id)).toMatch(/una sola página/);
    expect(await motivoDe((await documentoConArchivo(tx, await pdfDeFormato(1, [595, 842]))).id)).toMatch(/tamaño carta/);
    expect(await motivoDe((await documentoConArchivo(tx, new Uint8Array([1, 2, 3]))).id)).toMatch(NO_LEGIBLE);
  }));

  it("un PDF protegido con clave, vacío o sin páginas se rechaza con un motivo", () => revertida(sql, async (tx) => {
    for (const bytes of [await pdfProtegido(), new Uint8Array(0), await pdfSinPaginas()]) {
      const doc = await documentoConArchivo(tx, bytes);
      expect(await revisarFormatoActa(doc.id, { sql: tx })).toEqual({ estado: "no_sirve", motivo: expect.stringMatching(NO_LEGIBLE) });
    }
  }));

  it("un PDF que abre pero no se puede incrustar no está listo, y no entrega membrete", () => revertida(sql, async (tx) => {
    for (const bytes of [await pdfSinContenido(), await pdfContenidoCorrupto()]) {
      const doc = await documentoConArchivo(tx, bytes);
      expect(await revisarFormatoActa(doc.id, { sql: tx })).toEqual({ estado: "no_sirve", motivo: expect.stringMatching(NO_LEGIBLE) });
      expect(await membreteListo(doc.id, { sql: tx })).toBeNull();
    }
    const vacio = await documentoConArchivo(tx, await pdfContenidoVacio());
    expect(await revisarFormatoActa(vacio.id, { sql: tx })).toMatchObject({ estado: "listo" });
  }));

  it("el archivo perdido o cambiado no es lo mismo que uno que no sirve", () => revertida(sql, async (tx) => {
    const perdido = await documentoConArchivo(tx);
    await rm(perdido.absoluta);
    expect(await revisarFormatoActa(perdido.id, { sql: tx })).toEqual({ estado: "perdido" });

    const cambiado = await documentoConArchivo(tx);
    await writeFile(cambiado.absoluta, await pdfDeFormato(2));
    expect(await revisarFormatoActa(cambiado.id, { sql: tx })).toEqual({ estado: "perdido" });

    const fueraDelAlmacen = await documentoConArchivo(tx);
    await tx`UPDATE archivos SET ruta = ${`../${fueraDelAlmacen.codigo}.pdf`} WHERE id = ${fueraDelAlmacen.archivoId}`;
    expect(await revisarFormatoActa(fueraDelAlmacen.id, { sql: tx })).toEqual({ estado: "perdido" });
  }));

  it("una lectura que falla por otra causa también es perdido, y queda en el registro", () => revertida(sql, async (tx) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const doc = await documentoConArchivo(tx);
      await rm(doc.absoluta);
      await mkdir(doc.absoluta); // Leer una carpeta falla con EISDIR, no con ENOENT.
      expect(await revisarFormatoActa(doc.id, { sql: tx })).toEqual({ estado: "perdido" });
      expect(error).toHaveBeenCalledOnce();
    } finally {
      error.mockRestore();
    }
  }));
});

describe("archivoDeFormato", () => {
  it("da la versión vigente, general y con PDF, sin mirar el archivo", () => revertida(sql, async (tx) => {
    const bytes = await pdfDeFormato();
    const doc = await documentoConArchivo(tx, bytes);
    const [{ ruta }] = await tx`SELECT ruta FROM archivos WHERE id = ${doc.archivoId}`;
    await rm(doc.absoluta);
    expect(await archivoDeFormato(doc.id, { sql: tx })).toEqual({
      archivoId: doc.archivoId, ruta, hash: huella(bytes), codigo: doc.codigo, version: 1,
    });
  }));

  it("sin versión vigente, restringido o sin PDF, no hay archivo", () => revertida(sql, async (tx) => {
    const a = await documentoConArchivo(tx);
    await tx`UPDATE documento_versiones SET estado = 'obsoleto' WHERE documento_id = ${a.id}`;
    const b = await documentoConArchivo(tx);
    await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${b.id}`;
    const c = await documentoConArchivo(tx);
    await tx`UPDATE archivos SET mime = 'application/msword' WHERE id = ${c.archivoId}`;
    for (const { id } of [a, b, c]) expect(await archivoDeFormato(id, { sql: tx })).toBeNull();
  }));
});

describe("membreteListo", () => {
  it("entrega los bytes del formato listo, y nada si no lo está", () => revertida(sql, async (tx) => {
    const bytes = await pdfDeFormato();
    const doc = await documentoConArchivo(tx, bytes);
    const listo = await membreteListo(doc.id, { sql: tx });
    expect(listo).toMatchObject({ archivoId: doc.archivoId, codigo: doc.codigo, version: 1, hash: huella(bytes) });
    expect(Buffer.from(listo!.bytes).equals(Buffer.from(bytes))).toBe(true);

    expect(await membreteListo(null, { sql: tx })).toBeNull();
    expect(await membreteListo((await documentoConArchivo(tx, await pdfDeFormato(2))).id, { sql: tx })).toBeNull();
    await rm(doc.absoluta);
    expect(await membreteListo(doc.id, { sql: tx })).toBeNull();
  }));
});

describe("documentosParaFormato", () => {
  it("la lista solo ofrece documentos que pueden servir", () => revertida(sql, async (tx) => {
    const sirve = await documentoConArchivo(tx);
    const sinVigente = await documentoConArchivo(tx);
    await tx`UPDATE documento_versiones SET estado = 'obsoleto' WHERE documento_id = ${sinVigente.id}`;
    const restringido = await documentoConArchivo(tx);
    await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${restringido.id}`;
    const word = await documentoConArchivo(tx);
    await tx`UPDATE archivos SET mime = 'application/msword' WHERE id = ${word.archivoId}`;

    const lista = await documentosParaFormato({ sql: tx });
    expect(lista).toContainEqual({ id: sirve.id, codigo: sirve.codigo, titulo: sirve.titulo });
    const ids = lista.map((d) => d.id);
    for (const { id } of [sinVigente, restringido, word]) expect(ids).not.toContain(id);
  }));

  it("el documento ya elegido sigue en la lista aunque ya no sirva", () => revertida(sql, async (tx) => {
    const elegido = await documentoConArchivo(tx);
    await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${elegido.id}`;
    expect((await documentosParaFormato({ sql: tx, incluir: elegido.id })).map((d) => d.id)).toContain(elegido.id);
    expect((await documentosParaFormato({ sql: tx, incluir: null })).map((d) => d.id)).not.toContain(elegido.id);
  }));
});
