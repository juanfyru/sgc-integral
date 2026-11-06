/**
 * Configuración documental del panel: formato del código, plazos, publicación directa y lista de
 * verificación. Las funciones públicas abren su propia transacción (decisión P2); los tests usan sus
 * versiones `…En` dentro de una transacción que se revierte, y solo uno prueba el envoltorio, con
 * restauración en `finally`. El actor de ese uno es único por corrida.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { asegurarAdmin } from "@/db/consultas/admin";
import {
  alternarItemVerificacionEn,
  crearItemVerificacionEn,
  editarItemVerificacionEn,
  guardarConfigDocumental,
  guardarConfigDocumentalEn,
  moverItemVerificacionEn,
  obtenerConfigDocumental,
  type ConfigDocumental,
} from "@/db/consultas/config-documental";
import { listarItemsVerificacion } from "@/db/consultas/revision";
import { FORMATO_CODIGO_DEFECTO } from "@/lib/tramites/codigo";
import { documentoConArchivo, pdfDeFormato, pdfProtegido } from "./utiles/formato";
import { sesionAdmin } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
const USUARIO = `zz_config_${Date.now()}`;
let actorId: number;
let almacen: string;
const almacenPrevio = process.env.ALMACEN_RUTA;

beforeAll(async () => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-config-"));
  process.env.ALMACEN_RUTA = almacen;
  await asegurarAdmin(USUARIO, "Admin Config", "x");
  [{ id: actorId }] = await sql`SELECT id FROM usuarios WHERE usuario = ${USUARIO}`;
});

afterAll(async () => {
  if (almacenPrevio === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = almacenPrevio;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

const aGuardar = (c: ConfigDocumental) => ({
  formatoCodigo: c.formatoCodigo ?? FORMATO_CODIGO_DEFECTO,
  plazos: c.plazos,
  escalamientoDias: c.escalamientoDias,
  publicacionDirecta: c.publicacionDirecta,
  formatoActa: c.formatoActa,
});

const ultimaAuditoria = async (tx: TransactionSql, actorId: number) => {
  const [a] = await tx`SELECT detalle FROM auditoria WHERE usuario_id = ${actorId} AND accion = 'editar_config_documental' ORDER BY id DESC LIMIT 1`;
  return a.detalle;
};

describe("guardarConfigDocumental", () => {
  it("guarda la configuración, valida y audita", () => revertida(sql, async (tx) => {
    const { usuarioId } = await sesionAdmin(tx);
    const antes = await obtenerConfigDocumental({ sql: tx });
    const publicacionDirecta = !antes.publicacionDirecta;                // la demostración la apaga
    await guardarConfigDocumentalEn(tx, { ...aGuardar(antes), plazos: { ...antes.plazos, revision: 7 }, publicacionDirecta }, usuarioId);
    const despues = await obtenerConfigDocumental({ sql: tx });
    expect(despues.plazos.revision).toBe(7);
    expect(despues.publicacionDirecta).toBe(publicacionDirecta);
    const detalle = await ultimaAuditoria(tx, usuarioId);
    expect(Object.keys(detalle.cambios).sort()).toEqual(["plazo_revision_dias", "publicacion_directa"]);
    expect(detalle.cambios.publicacion_directa).toEqual({ antes: antes.publicacionDirecta ? "1" : "0", despues: publicacionDirecta ? "1" : "0" });

    const rechaza = (cambio: Partial<ReturnType<typeof aGuardar>>, mensaje?: RegExp) =>
      expect(tx.savepoint(() => guardarConfigDocumentalEn(tx, { ...aGuardar(antes), ...cambio }, usuarioId))).rejects.toThrow(mensaje);
    await rechaza({ formatoCodigo: "{PROCESO}-{NN}" }, /TIPO/);
    await rechaza({ formatoCodigo: "{PROCESO}{TIPO}-{NN}" }, /Separe/);
    await rechaza({ escalamientoDias: 0 });
    await rechaza({ escalamientoDias: 61 });
    await rechaza({ plazos: { ...antes.plazos, ajustes: 366 } });
    await rechaza({ plazos: { ...antes.plazos, ajustes: 1.5 } });
    expect((await obtenerConfigDocumental({ sql: tx })).plazos.ajustes).toBe(antes.plazos.ajustes);
  }));

  it("guardar lo mismo no registra cambios", () => revertida(sql, async (tx) => {
    const { usuarioId } = await sesionAdmin(tx);
    await guardarConfigDocumentalEn(tx, aGuardar(await obtenerConfigDocumental({ sql: tx })), usuarioId);
    expect((await ultimaAuditoria(tx, usuarioId)).cambios).toEqual({});
  }));

  it("una clave ausente o inválida cae al valor por defecto", () => revertida(sql, async (tx) => {
    await tx`DELETE FROM configuracion WHERE clave = 'plazo_elaboracion_dias'`;
    await tx`UPDATE configuracion SET valor = 'abc' WHERE clave = 'plazo_revision_dias'`;
    const c = await obtenerConfigDocumental({ sql: tx });
    expect([c.plazos.elaboracion, c.plazos.revision]).toEqual([15, 5]);
  }));

  it("el envoltorio público abre su transacción y confirma; se restaura en finally", async () => {
    const antes = await obtenerConfigDocumental();
    try {
      await guardarConfigDocumental({ ...aGuardar(antes), plazos: { ...antes.plazos, revision: 8 } }, actorId);
      expect((await obtenerConfigDocumental()).plazos.revision).toBe(8);
    } finally {
      await guardarConfigDocumental(aGuardar(antes), actorId);
    }
    expect((await obtenerConfigDocumental()).plazos.revision).toBe(antes.plazos.revision);
  });
});

describe("formato del acta", () => {
  const CLAVES = ["formato_acta_documento_id", "formato_acta_margen_inferior_cm", "formato_acta_margen_superior_cm"];
  const valorDe = async (tx: TransactionSql, clave: string) =>
    (await tx`SELECT valor FROM configuracion WHERE clave = ${clave}`)[0]?.valor;

  /** Parte sin formato, para que la prueba no dependa de lo que traiga la demo. */
  const sinFormato = async (tx: TransactionSql) => {
    await tx`DELETE FROM configuracion WHERE clave = ANY(${CLAVES})`;
    return obtenerConfigDocumental({ sql: tx });
  };

  it("sin claves, cae a los valores por defecto", () => revertida(sql, async (tx) => {
    expect((await sinFormato(tx)).formatoActa).toEqual({ documentoId: null, margenSuperiorCm: 5.5, margenInferiorCm: 3.5 });
  }));

  it("un valor inválido en la base también cae al de defecto", () => revertida(sql, async (tx) => {
    await sinFormato(tx);
    await tx`INSERT INTO configuracion (clave, valor) VALUES
      ('formato_acta_documento_id', 'abc'), ('formato_acta_margen_superior_cm', '13'), ('formato_acta_margen_inferior_cm', 'x')`;
    expect((await obtenerConfigDocumental({ sql: tx })).formatoActa).toEqual({ documentoId: null, margenSuperiorCm: 5.5, margenInferiorCm: 3.5 });
  }));

  it("guarda el formato y los márgenes, y lo audita", () => revertida(sql, async (tx) => {
    const { usuarioId } = await sesionAdmin(tx);
    const antes = await sinFormato(tx);
    const doc = await documentoConArchivo(tx);
    const formatoActa = { documentoId: doc.id, margenSuperiorCm: 4.2, margenInferiorCm: 3 };
    await guardarConfigDocumentalEn(tx, { ...aGuardar(antes), formatoActa }, usuarioId);

    expect((await obtenerConfigDocumental({ sql: tx })).formatoActa).toEqual(formatoActa);
    expect(await valorDe(tx, "formato_acta_margen_superior_cm")).toBe("4.2");
    const { cambios } = await ultimaAuditoria(tx, usuarioId);
    expect(Object.keys(cambios).sort()).toEqual(CLAVES);
    expect(cambios.formato_acta_documento_id).toEqual({ antes: "", despues: String(doc.id) });
    expect(cambios.formato_acta_margen_superior_cm).toEqual({ antes: "5.5", despues: "4.2" });
    expect(cambios.formato_acta_margen_inferior_cm).toEqual({ antes: "3.5", despues: "3" });

    await guardarConfigDocumentalEn(tx, aGuardar(await obtenerConfigDocumental({ sql: tx })), usuarioId);
    expect((await ultimaAuditoria(tx, usuarioId)).cambios).toEqual({});
  }));

  it("guarda las trece claves, y una ausente no cuenta como cambio si vale lo de defecto", () => revertida(sql, async (tx) => {
    const { usuarioId } = await sesionAdmin(tx);
    await guardarConfigDocumentalEn(tx, aGuardar(await sinFormato(tx)), usuarioId);
    expect((await ultimaAuditoria(tx, usuarioId)).cambios).toEqual({});
    const claves = [
      "formato_codigo", "plazo_visto_bueno_dias", "plazo_aceptacion_dias", "plazo_elaboracion_dias", "plazo_ajustes_dias",
      "plazo_revision_dias", "plazo_aprobacion_dias", "plazo_publicacion_dias", "escalamiento_dias", "publicacion_directa", ...CLAVES,
    ];
    const [{ n }] = await tx`SELECT count(*)::int AS n FROM configuracion WHERE clave = ANY(${claves})`;
    expect(n).toBe(13);
  }));

  it("rechaza un documento que no sirve, con el motivo", () => revertida(sql, async (tx) => {
    const { usuarioId } = await sesionAdmin(tx);
    const antes = await sinFormato(tx);
    const rechaza = (documentoId: number, mensaje: RegExp) =>
      expect(tx.savepoint(() => guardarConfigDocumentalEn(tx, { ...aGuardar(antes), formatoActa: { ...antes.formatoActa, documentoId } }, usuarioId)))
        .rejects.toThrow(mensaje);

    await rechaza((await documentoConArchivo(tx, await pdfDeFormato(2))).id, /una sola página/);
    await rechaza((await documentoConArchivo(tx, await pdfDeFormato(1, [595, 842]))).id, /tamaño carta/);
    await rechaza((await documentoConArchivo(tx, new Uint8Array([1, 2, 3]))).id, /no se puede leer/);
    await rechaza((await documentoConArchivo(tx, await pdfProtegido())).id, /no se puede leer/);
    const restringido = await documentoConArchivo(tx);
    await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${restringido.id}`;
    await rechaza(restringido.id, /restringido/);
    const perdido = await documentoConArchivo(tx);
    await rm(perdido.absoluta);
    await rechaza(perdido.id, /^El archivo del formato no se encuentra o cambió$/);
    expect((await obtenerConfigDocumental({ sql: tx })).formatoActa.documentoId).toBeNull();
  }));

  it("un formato que dejó de servir no impide guardar lo demás: solo se revisa si cambió", () => revertida(sql, async (tx) => {
    const { usuarioId } = await sesionAdmin(tx);
    const antes = await sinFormato(tx);
    const doc = await documentoConArchivo(tx);
    const formatoActa = { ...antes.formatoActa, documentoId: doc.id };
    await guardarConfigDocumentalEn(tx, { ...aGuardar(antes), formatoActa }, usuarioId);
    await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${doc.id}`;

    await guardarConfigDocumentalEn(tx, { ...aGuardar(antes), formatoActa, plazos: { ...antes.plazos, revision: 9 } }, usuarioId);
    expect(Object.keys((await ultimaAuditoria(tx, usuarioId)).cambios)).toEqual(["plazo_revision_dias"]);
    await guardarConfigDocumentalEn(tx, { ...aGuardar(antes), formatoActa: { ...formatoActa, margenSuperiorCm: 6 } }, usuarioId);
    const c = await obtenerConfigDocumental({ sql: tx });
    expect(c.formatoActa).toEqual({ ...formatoActa, margenSuperiorCm: 6 });

    // Quitarlo sí se puede; volver a elegirlo es un cambio, y entonces se revisa.
    await guardarConfigDocumentalEn(tx, { ...aGuardar(c), formatoActa: { ...c.formatoActa, documentoId: null } }, usuarioId);
    await expect(tx.savepoint(() => guardarConfigDocumentalEn(tx, aGuardar(c), usuarioId))).rejects.toThrow(/restringido/);
  }));

  it("rechaza márgenes fuera de rango", () => revertida(sql, async (tx) => {
    const { usuarioId } = await sesionAdmin(tx);
    const antes = await sinFormato(tx);
    const conMargenes = (margenSuperiorCm: number, margenInferiorCm: number) =>
      guardarConfigDocumentalEn(tx, { ...aGuardar(antes), formatoActa: { documentoId: null, margenSuperiorCm, margenInferiorCm } }, usuarioId);
    const rechaza = (superior: number, inferior: number, mensaje: string) =>
      expect(tx.savepoint(() => conMargenes(superior, inferior))).rejects.toThrow(mensaje);

    await rechaza(12.1, 2, "El espacio del encabezado debe estar entre 0 y 12 cm");
    await rechaza(-0.1, 2, "El espacio del encabezado debe estar entre 0 y 12 cm");
    await rechaza(Number.NaN, 2, "El espacio del encabezado debe estar entre 0 y 12 cm");
    await rechaza(2, 13, "El espacio del pie debe estar entre 0 y 12 cm");
    await rechaza(8.4, 7.7, "Entre los dos no pueden pasar de 16 cm");
    await rechaza(12, 4.1, "Entre los dos no pueden pasar de 16 cm");

    await conMargenes(0, 0);
    await conMargenes(8.3, 7.7);
    await conMargenes(12, 4);
    expect((await obtenerConfigDocumental({ sql: tx })).formatoActa).toMatchObject({ margenSuperiorCm: 12, margenInferiorCm: 4 });
  }));

  it("elegir ningún formato deja la clave vacía", () => revertida(sql, async (tx) => {
    const { usuarioId } = await sesionAdmin(tx);
    const antes = await sinFormato(tx);
    const doc = await documentoConArchivo(tx);
    await guardarConfigDocumentalEn(tx, { ...aGuardar(antes), formatoActa: { ...antes.formatoActa, documentoId: doc.id } }, usuarioId);
    await guardarConfigDocumentalEn(tx, aGuardar(antes), usuarioId);

    expect(await valorDe(tx, "formato_acta_documento_id")).toBe("");
    expect((await obtenerConfigDocumental({ sql: tx })).formatoActa.documentoId).toBeNull();
    expect((await ultimaAuditoria(tx, usuarioId)).cambios).toEqual({
      formato_acta_documento_id: { antes: String(doc.id), despues: "" },
    });
  }));
});

describe("lista de verificación", () => {
  it("los ítems se crean, se ordenan y se desactivan, nunca se borran", () => revertida(sql, async (tx) => {
    const { usuarioId } = await sesionAdmin(tx);
    const id = await crearItemVerificacionEn(tx, { texto: "Ítem de prueba de la configuración", critico: true }, usuarioId);
    const orden = async () => (await listarItemsVerificacion({ sql: tx })).map((i) => i.id);
    expect((await orden()).at(-1)).toBe(id);
    await moverItemVerificacionEn(tx, id, "arriba", usuarioId);
    expect((await orden()).at(-2)).toBe(id);
    await moverItemVerificacionEn(tx, id, "abajo", usuarioId);
    expect((await orden()).at(-1)).toBe(id);
    await moverItemVerificacionEn(tx, id, "abajo", usuarioId); // ya es el último: no cambia nada
    expect((await orden()).at(-1)).toBe(id);

    await editarItemVerificacionEn(tx, id, { texto: "Ítem de prueba editado", critico: false }, usuarioId);
    await alternarItemVerificacionEn(tx, id, false, usuarioId);
    const todos = await listarItemsVerificacion({ sql: tx });
    expect(todos.find((i) => i.id === id)).toMatchObject({ activo: false, critico: false, texto: "Ítem de prueba editado" });
    expect((await listarItemsVerificacion({ sql: tx, soloActivos: true })).some((i) => i.id === id)).toBe(false);

    const acciones = await tx`SELECT accion FROM auditoria WHERE usuario_id = ${usuarioId} AND entidad = 'lista_verificacion_items' AND entidad_id = ${id}`;
    expect(acciones.map((a) => a.accion).sort()).toEqual([
      "alternar_item_verificacion",
      "crear_item_verificacion",
      "editar_item_verificacion",
      "mover_item_verificacion",
      "mover_item_verificacion",
    ]);
  }));

  it("el texto debe tener de 5 a 300 caracteres y el ítem debe existir", () => revertida(sql, async (tx) => {
    const { usuarioId } = await sesionAdmin(tx);
    const falla = (fn: () => Promise<unknown>, mensaje: RegExp) => expect(tx.savepoint(fn)).rejects.toThrow(mensaje);
    await falla(() => crearItemVerificacionEn(tx, { texto: "abc", critico: false }, usuarioId), /entre 5 y 300/);
    await falla(() => crearItemVerificacionEn(tx, { texto: "x".repeat(301), critico: false }, usuarioId), /entre 5 y 300/);
    await falla(() => alternarItemVerificacionEn(tx, 999999999, false, usuarioId), /no existe/);
    await falla(() => moverItemVerificacionEn(tx, 999999999, "arriba", usuarioId), /no existe/);
  }));
});
