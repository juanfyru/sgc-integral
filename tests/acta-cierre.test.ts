/**
 * El acta se congela al cerrar el trámite, cada cierre tiene la suya y escribirla es atómico y
 * repetible. Corre contra la demo ya sembrada, en una transacción que se revierte; el archivo del acta
 * lo borra cada test.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { asegurarActa, reunirDatosActa, versionDeActa } from "@/db/consultas/actas";
import { obtenerDocumentoAdmin } from "@/db/consultas/admin";
import {
  cerrarObservacion,
  guardarVerificacion,
  listarItemsVerificacion,
  listarObservaciones,
  responderObservacion,
} from "@/db/consultas/revision";
import { transicionar } from "@/db/consultas/tramites-flujo";
import { generarActa, type DatosActa } from "@/lib/acta";
import type { Verificador } from "@/lib/firma";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { contenidoPorPagina, contieneTexto } from "./utiles/pdf";
import { opc, tramiteEn } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const textoDe = async (pdf: Uint8Array) => (await contenidoPorPagina(pdf)).join("\n");

const publicar = (t: { tramiteId: number; ronda: number }) =>
  ({ tramiteId: t.tramiteId, accion: "publicar", etapaEsperada: "publicacion", rondaEsperada: t.ronda, credenciales: { clave: "x" } }) as const;

async function borrarActas(rutas: string[]) {
  for (const r of rutas) await rm(resolverRutaAlmacen(r)!, { force: true });
}

describe("una justificación con saltos de línea", () => {
  it("sale en líneas separadas, sin «?» en su lugar", async () => {
    const datos = {
      clase: "aprobacion", entidad: "ESE", documento: { codigo: "X-01", titulo: "T", tipo: "P", proceso: "Q" }, version: 1,
      solicitud: { numero: "SOL-2026-001", tipo: "Modificar", motivo: "M", justificacion: "Primer motivo.\nSegundo motivo.\n\nTercero.", solicitante: "S", fecha: new Date() },
      vistoBueno: "V", aceptacion: { quien: "A", fecha: new Date(), duplicidad: null }, controlCambios: null, firmas: [],
      rondas: 1, observaciones: { total: 0, cerradas: 0 }, versionObsoleta: null, publicadoEn: new Date(), zona: "America/Bogota",
    } satisfies DatosActa;
    const pdf = await textoDe(await generarActa(datos));
    for (const linea of ["Primer motivo.", "Segundo motivo.", "Tercero."]) expect(contieneTexto(pdf, linea), linea).toBe(true);
    expect(contieneTexto(pdf, "Primer motivo.?")).toBe(false);
  });
});

describe("el acta se congela al cerrar", () => {
  it("renombrar después el título, el proceso y al solicitante no cambia el acta", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion");
    try {
      await transicionar(t.admin, publicar(t), opc(tx));
      const antes = await reunirDatosActa(t.tramiteId, { sql: tx });
      await tx`UPDATE documentos SET titulo = 'Otro título' WHERE codigo = 'GTH-PR-02'`;
      await tx`UPDATE procesos SET nombre = 'Otro proceso' WHERE id = (SELECT proceso_id FROM tramites WHERE id = ${t.tramiteId})`;
      await tx`UPDATE usuarios SET nombre = 'Otro nombre' WHERE id = ${t.elaborador.usuarioId}`;
      expect(await reunirDatosActa(t.tramiteId, { sql: tx })).toEqual(antes);
      expect(antes!.documento.titulo).toBe("Procedimiento de Inducción y Reinducción");
    } finally { await t.limpiar(); }
  }));

  it("si la modificación trae título nuevo, el acta lleva el título con el que queda el documento", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion", { tituloNuevo: "Inducción de todo el personal" });
    try {
      await transicionar(t.admin, publicar(t), opc(tx));
      expect((await reunirDatosActa(t.tramiteId, { sql: tx }))!.documento.titulo).toBe("Inducción de todo el personal");
    } finally { await t.limpiar(); }
  }));

  it("sin el nombre de la entidad, o con el de la instalación sin configurar, no se pide la firma y no queda nada", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion");
    try {
      for (const preparar of [
        () => tx`DELETE FROM configuracion WHERE clave = 'nombre_entidad'`,
        () => tx`UPDATE configuracion SET valor = '   ' WHERE clave = 'nombre_entidad'`,
        () => tx`UPDATE configuracion SET valor = 'Entidad sin configurar' WHERE clave = 'nombre_entidad'`,
      ]) {
        await preparar();
        const verificar = vi.fn<Verificador>(async () => ({ ok: true, metodo: "clave" }));
        await expect(tx.savepoint(() => transicionar(t.admin, publicar(t), { ...opc(tx), verificar }))).rejects.toThrow(
          "Configure el nombre de la entidad antes de publicar",
        );
        expect(verificar).not.toHaveBeenCalled();
        const [{ etapa }] = await tx`SELECT etapa FROM tramites WHERE id = ${t.tramiteId}`;
        expect(etapa).toBe("publicacion");
      }
    } finally { await t.limpiar(); }
  }));

  it("el acta guarda las observaciones y las rondas de una devolución del aprobador", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aprobacion");
    try {
      const nueva = t.ronda + 1;
      const estado = async () => {
        const [x] = await tx`SELECT etapa, ronda FROM tramites WHERE id = ${t.tramiteId}`;
        return { etapa: x.etapa, ronda: x.ronda };
      };
      await transicionar(t.aprobador, { tramiteId: t.tramiteId, accion: "devolver_aprobacion", etapaEsperada: "aprobacion", rondaEsperada: t.ronda, datos: { observaciones: ["Falta citar la resolución vigente."] } }, opc(tx));
      const [o] = await listarObservaciones(t.tramiteId, { sql: tx });
      await responderObservacion(o.id, t.elaborador, "Se citó la resolución.", await estado(), { sql: tx });
      await transicionar(t.elaborador, { tramiteId: t.tramiteId, accion: "enviar_a_revision", etapaEsperada: "elaboracion", rondaEsperada: nueva, credenciales: { clave: "x" } }, opc(tx));
      const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
      await guardarVerificacion(t.tramiteId, t.revisor, items.map((i) => ({ itemId: i.id, resultado: "cumple" as const })), await estado(), { sql: tx });
      await cerrarObservacion(o.id, t.revisor, await estado(), { sql: tx });
      await transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "concepto_favorable", etapaEsperada: "revision", rondaEsperada: nueva, datos: { concepto: "Cumple." }, credenciales: { clave: "x" } }, opc(tx));
      await transicionar(t.aprobador, { tramiteId: t.tramiteId, accion: "aprobar_y_publicar", etapaEsperada: "aprobacion", rondaEsperada: nueva, datos: { concepto: "Aprobado." }, credenciales: { clave: "x" } }, opc(tx));
      const d = await reunirDatosActa(t.tramiteId, { sql: tx });
      expect(d).toMatchObject({ rondas: nueva, observaciones: { total: 1, cerradas: 1 } });
      expect(d!.firmas.map((f) => f.firma)).toEqual(["Elaboró", "Revisó", "Aprobó", "Publicó"]);
    } finally { await t.limpiar(); }
  }));
});

describe("cada cierre tiene su acta", () => {
  it("una versión publicada por un trámite y eliminada por otro: dos actas con su rol, y el panel las lista", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion");
    const rutas: string[] = [];
    try {
      await transicionar(t.admin, publicar(t), opc(tx));
      const e = await tramiteEn(tx, "aprobacion", { codigo: "GTH-PR-02", tipo: "eliminar" });
      expect(e.versionId).toBe(t.versionId);                              // la eliminación usa la versión vigente
      await transicionar(e.aprobador, { tramiteId: e.tramiteId, accion: "aprobar_y_publicar", etapaEsperada: "aprobacion", rondaEsperada: 0, datos: { concepto: "Procede." }, credenciales: { clave: "x" } }, opc(tx));

      const aprobacion = (await asegurarActa(t.tramiteId, { sql: tx }))!;
      const eliminacion = (await asegurarActa(e.tramiteId, { sql: tx }))!;
      rutas.push(aprobacion.ruta, eliminacion.ruta);
      expect(eliminacion.archivoId).not.toBe(aprobacion.archivoId);
      expect(eliminacion.ruta).not.toBe(aprobacion.ruta);
      const filas = await tx`SELECT rol FROM archivos WHERE version_id = ${t.versionId} AND rol LIKE 'acta_%' ORDER BY rol`;
      expect(filas.map((f) => f.rol)).toEqual(["acta_aprobacion", "acta_eliminacion"]);
      expect((await reunirDatosActa(e.tramiteId, { sql: tx }))!.clase).toBe("eliminacion");

      const detalle = await obtenerDocumentoAdmin("GTH-PR-02", e.admin, { sql: tx });
      const version = detalle!.versiones.find((v) => v.id === t.versionId)!;
      expect(version.estado).toBe("anulado");
      expect(version.cierres).toEqual([{ id: t.tramiteId, etapa: "publicado" }, { id: e.tramiteId, etapa: "eliminado" }]);
    } finally {
      await borrarActas(rutas);
      await t.limpiar();
    }
  }));
});

describe("escribir el acta", () => {
  it("un archivo huérfano en la ruta se reemplaza y la huella de la fila es la del archivo", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion");
    const rutas: string[] = [];
    try {
      await transicionar(t.admin, publicar(t), opc(tx));
      const ruta = `actas/${(await versionDeActa(t.tramiteId, { sql: tx }))!.numero}.pdf`;
      const absoluta = resolverRutaAlmacen(ruta)!;
      await mkdir(path.dirname(absoluta), { recursive: true });
      await writeFile(absoluta, "restos de un intento anterior");
      rutas.push(ruta);
      const acta = (await asegurarActa(t.tramiteId, { sql: tx }))!;
      const [fila] = await tx`SELECT hash_sha256 FROM archivos WHERE id = ${acta.archivoId}`;
      expect(createHash("sha256").update(await readFile(absoluta)).digest("hex")).toBe(fila.hash_sha256);
    } finally { await borrarActas(rutas); await t.limpiar(); }
  }));

  it("si otra petición registró el acta mientras se generaba, devuelve la que quedó", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion");
    const rutas: string[] = [];
    try {
      await transicionar(t.admin, publicar(t), opc(tx));
      let ganadora = 0;
      const generar = async (d: DatosActa) => {
        const [f] = await tx`INSERT INTO archivos (version_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
          VALUES (${t.versionId}, 'acta_aprobacion', 'actas/otra-peticion.pdf', 'otra.pdf', 'pdf', 'application/pdf', 1, ${"a".repeat(64)}) RETURNING id`;
        ganadora = Number(f.id);
        return generarActa(d);
      };
      const acta = (await asegurarActa(t.tramiteId, { sql: tx, generar }))!;
      rutas.push(`actas/${(await versionDeActa(t.tramiteId, { sql: tx }))!.numero}.pdf`);
      expect(acta.archivoId).toBe(ganadora);
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM archivos WHERE version_id = ${t.versionId} AND rol = 'acta_aprobacion'`;
      expect(n).toBe(1);
    } finally { await borrarActas(rutas); await t.limpiar(); }
  }));

  it("una fila sin archivo en disco se regenera con los datos congelados, no da 404 para siempre", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion");
    const rutas: string[] = [];
    try {
      await transicionar(t.admin, publicar(t), opc(tx));
      const primera = (await asegurarActa(t.tramiteId, { sql: tx }))!;
      rutas.push(primera.ruta);
      const absoluta = resolverRutaAlmacen(primera.ruta)!;
      await rm(absoluta);
      await tx`UPDATE documentos SET titulo = 'Cambió después' WHERE codigo = 'GTH-PR-02'`;
      const segunda = (await asegurarActa(t.tramiteId, { sql: tx }))!;
      expect(segunda).toEqual(primera);
      expect(contieneTexto(await textoDe(new Uint8Array(await readFile(absoluta))), "Procedimiento de Inducción y Reinducción")).toBe(true);
    } finally { await borrarActas(rutas); await t.limpiar(); }
  }));
  it("si el acta regenerada no es idéntica a la registrada, no se sirve ni se pisa la fila", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion");
    const rutas: string[] = [];
    try {
      await transicionar(t.admin, publicar(t), opc(tx));
      const primera = (await asegurarActa(t.tramiteId, { sql: tx }))!;
      rutas.push(primera.ruta);
      const absoluta = resolverRutaAlmacen(primera.ruta)!;
      const [{ hash_sha256: original, tamano_bytes: tamano }] = await tx`SELECT hash_sha256, tamano_bytes FROM archivos WHERE id = ${primera.archivoId}`;
      await tx`UPDATE archivos SET hash_sha256 = ${"b".repeat(64)} WHERE id = ${primera.archivoId}`;
      await rm(absoluta);
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        expect(await asegurarActa(t.tramiteId, { sql: tx, usuarioId: t.admin.usuarioId })).toBeNull();
        expect(error).toHaveBeenCalled();
      } finally { error.mockRestore(); }
      const [fila] = await tx`SELECT hash_sha256, tamano_bytes FROM archivos WHERE id = ${primera.archivoId}`;
      expect(fila.hash_sha256).toBe("b".repeat(64));
      expect(fila.tamano_bytes).toBe(tamano);
      await expect(readFile(absoluta)).rejects.toThrow();
      const [a] = await tx`SELECT detalle FROM auditoria WHERE usuario_id = ${t.admin.usuarioId} AND accion = 'acta_no_regenerable' ORDER BY id DESC LIMIT 1`;
      expect(a.detalle).toMatchObject({ huellaRegistrada: "b".repeat(64), huellaRegenerada: original });
    } finally { await borrarActas(rutas); await t.limpiar(); }
  }));
});
