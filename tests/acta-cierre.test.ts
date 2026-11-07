/**
 * El acta se congela al cerrar el trámite, cada cierre tiene la suya y escribirla es atómico y
 * repetible. Corre contra la demo ya sembrada, en una transacción que se revierte; el archivo del acta
 * lo borra cada test, y los del formato van a un almacén temporal.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { asegurarActa, reunirDatosActa, versionDeActa } from "@/db/consultas/actas";
import { obtenerDocumentoAdmin } from "@/db/consultas/admin";
import {
  cerrarObservacion,
  crearObservacion,
  criteriosNoCumplen,
  guardarVerificacion,
  listarItemsVerificacion,
  listarObservaciones,
  responderObservacion,
} from "@/db/consultas/revision";
import { transicionar } from "@/db/consultas/tramites-flujo";
import { generarActa, type DatosActa } from "@/lib/acta";
import type { Verificador } from "@/lib/firma";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { huellaDeCriterios } from "@/lib/tramites/criterios";
import { documentoConArchivo, huella, pdfDeFormato } from "./utiles/formato";
import { contenidoPorPagina, contieneTexto } from "./utiles/pdf";
import { NOTA, aprobacionConCriterio, documentoLibre, opc, sesionDe, tramiteEn } from "./utiles/tramites";
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

type Tx = Parameters<Parameters<typeof revertida>[1]>[0];

const actaDelEvento = async (tx: Tx, tramiteId: number) =>
  (await tx`SELECT detalle -> 'acta' AS acta FROM tramite_eventos WHERE tramite_id = ${tramiteId} AND detalle ? 'acta' ORDER BY id DESC LIMIT 1`)[0].acta;

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
      await tx`UPDATE documentos SET titulo = 'Otro título' WHERE codigo = ${t.codigo}`;
      await tx`UPDATE procesos SET nombre = 'Otro proceso' WHERE id = (SELECT proceso_id FROM tramites WHERE id = ${t.tramiteId})`;
      await tx`UPDATE usuarios SET nombre = 'Otro nombre' WHERE id = ${t.elaborador.usuarioId}`;
      expect(await reunirDatosActa(t.tramiteId, { sql: tx })).toEqual(antes);
      expect(antes!.documento.titulo).toBe(t.titulo);
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
    const mensaje = "Configure el nombre de la entidad antes de publicar";
    const ponerNombre = (valor: string) => tx`INSERT INTO configuracion (clave, valor) VALUES ('nombre_entidad', ${valor})
      ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`;
    const casos: { etiqueta: string; preparar: () => PromiseLike<unknown> }[] = [
      { etiqueta: "vacío", preparar: () => ponerNombre("   ") },
      { etiqueta: "sin configurar", preparar: () => ponerNombre("Entidad sin configurar") },
      { etiqueta: "sin fila", preparar: () => tx`DELETE FROM configuracion WHERE clave = 'nombre_entidad'` },
    ];
    const espia = () => vi.fn<Verificador>(async () => ({ ok: true, metodo: "clave" }));
    const intentar = async (sesion: Parameters<typeof transicionar>[0], entrada: Parameters<typeof transicionar>[1], opciones = opc(tx)) => {
      const verificar = espia();
      await expect(tx.savepoint(() => transicionar(sesion, entrada, { ...opciones, verificar }))).rejects.toThrow(mensaje);
      expect(verificar).not.toHaveBeenCalled();
    };

    const publicacion = await tramiteEn(tx, "publicacion");
    const aprobacion = await tramiteEn(tx, "aprobacion");
    const eliminacion = await tramiteEn(tx, "aprobacion", { tipo: "eliminar" });
    const eliminacionAprobada = await tramiteEn(tx, "publicacion", { tipo: "eliminar", tipoDocumento: "CA", aprobador: await sesionDe(tx, "gerente") });
    const aprobar = (t: typeof aprobacion) =>
      ({ tramiteId: t.tramiteId, accion: "aprobar_y_publicar", etapaEsperada: "aprobacion", rondaEsperada: t.ronda, datos: { concepto: "Aprobado." }, credenciales: { clave: "x" } }) as const;
    try {
      for (const caso of casos) {
        await caso.preparar();
        await intentar(publicacion.admin, publicar(publicacion));
        await intentar(aprobacion.aprobador, aprobar(aprobacion));
        await intentar(eliminacion.aprobador, aprobar(eliminacion));
        await intentar(eliminacionAprobada.admin, publicar(eliminacionAprobada));
        const [{ etapa }] = await tx`SELECT etapa FROM tramites WHERE id = ${publicacion.tramiteId}`;
        expect(etapa, caso.etiqueta).toBe("publicacion");
      }
      // Con nombre, la misma publicación sí pasa: el rechazo era por la entidad.
      await ponerNombre("Hospital de prueba");
      await expect(transicionar(publicacion.admin, publicar(publicacion), opc(tx))).resolves.toMatchObject({ etapa: "publicado" });
    } finally { await publicacion.limpiar(); await aprobacion.limpiar(); await eliminacion.limpiar(); await eliminacionAprobada.limpiar(); }
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

describe("los criterios que no cumplen en el acta", () => {
  const firmado = (t: { tramiteId: number; ronda: number }, accion: "aprobar" | "aprobar_y_publicar", confirmaNoCumple: string) =>
    ({ tramiteId: t.tramiteId, accion, etapaEsperada: "aprobacion", rondaEsperada: t.ronda, datos: { concepto: "Aprobado.", confirmaNoCumple }, credenciales: { clave: "x" } }) as const;

  /** El ítem se edita antes de cerrar: el acta lleva lo guardado. */
  const conItemEditado = (tx: Tx) => aprobacionConCriterio(tx, {
    antesDelConcepto: (itemId) => tx`UPDATE lista_verificacion_items SET texto = 'Texto editado antes de cerrar' WHERE id = ${itemId}`,
  });

  const concepto = (t: { tramiteId: number }, ronda: number, extra: Record<string, unknown> = {}) =>
    ({ tramiteId: t.tramiteId, accion: "concepto_favorable", etapaEsperada: "revision", rondaEsperada: ronda,
      datos: { concepto: "Cumple, con un criterio aceptado.", ...extra }, credenciales: { clave: "x" } }) as const;

  it("aprobar y publicar congela los criterios con el texto guardado, aunque el ítem se edite después", () => revertida(sql, async (tx) => {
    const { t, criterio, confirmaNoCumple } = await conItemEditado(tx);
    try {
      await transicionar(t.aprobador, firmado(t, "aprobar_y_publicar", confirmaNoCumple), opc(tx));
      await tx`UPDATE lista_verificacion_items SET texto = 'Texto editado después de cerrar' WHERE id = ${criterio.id}`;
      const noCumple = [{ texto: criterio.texto, nota: NOTA }];
      expect((await actaDelEvento(tx, t.tramiteId)).noCumple).toEqual(noCumple);
      const datos = (await reunirDatosActa(t.tramiteId, { sql: tx }))!;
      expect(datos.noCumple).toEqual(noCumple);
      const pdf = await textoDe(await generarActa(datos));
      expect(contieneTexto(pdf, "Criterios que no cumplen, con concepto favorable")).toBe(true);
      expect(contieneTexto(pdf, NOTA)).toBe(true);
    } finally { await t.limpiar(); }
  }));

  it("publicar aparte, después de aprobar, también los congela", () => revertida(sql, async (tx) => {
    const { t, criterio, confirmaNoCumple } = await conItemEditado(tx);
    try {
      await transicionar(t.aprobador, firmado(t, "aprobar", confirmaNoCumple), opc(tx));
      await transicionar(t.admin, publicar(t), opc(tx));
      expect((await actaDelEvento(tx, t.tramiteId)).noCumple).toEqual([{ texto: criterio.texto, nota: NOTA }]);
    } finally { await t.limpiar(); }
  }));

  it("solo cuenta la ronda aprobada: un criterio de una ronda devuelta no entra al acta", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    const estado = async () => {
      const [x] = await tx`SELECT etapa, ronda FROM tramites WHERE id = ${t.tramiteId}`;
      return { etapa: x.etapa, ronda: x.ronda };
    };
    try {
      const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
      const criterio = items.find((i) => !i.critico)!;
      await guardarVerificacion(t.tramiteId, t.revisor, [{ itemId: criterio.id, resultado: "no_cumple", nota: NOTA }], await estado(), { sql: tx });
      const n = await crearObservacion(t.tramiteId, t.revisor, "Falta el responsable en el numeral 5.2.", await estado(), { sql: tx });
      await transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "devolver_revision", etapaEsperada: "revision", rondaEsperada: t.ronda }, opc(tx));
      const nueva = t.ronda + 1;
      await responderObservacion(n, t.elaborador, "Se agregó al jefe inmediato.", await estado(), { sql: tx });
      await transicionar(t.elaborador, { tramiteId: t.tramiteId, accion: "enviar_a_revision", etapaEsperada: "elaboracion", rondaEsperada: nueva, credenciales: { clave: "x" } }, opc(tx));
      await guardarVerificacion(t.tramiteId, t.revisor, items.map((i) => ({ itemId: i.id, resultado: "cumple" as const })), await estado(), { sql: tx });
      await cerrarObservacion(n, t.revisor, await estado(), { sql: tx });
      await transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "concepto_favorable", etapaEsperada: "revision", rondaEsperada: nueva, datos: { concepto: "Cumple." }, credenciales: { clave: "x" } }, opc(tx));
      await transicionar(t.aprobador, { tramiteId: t.tramiteId, accion: "aprobar_y_publicar", etapaEsperada: "aprobacion", rondaEsperada: nueva, datos: { concepto: "Aprobado." }, credenciales: { clave: "x" } }, opc(tx));
      expect((await actaDelEvento(tx, t.tramiteId)).noCumple).toEqual([]);
    } finally { await t.limpiar(); }
  }));

  it("un criterio aprobado y devuelto no pasa a la ronda nueva: se responde otra vez, y el acta lleva la ronda que se aprobó", () => revertida(sql, async (tx) => {
    const { t, criterio } = await aprobacionConCriterio(tx);
    const nueva = t.ronda + 1;
    const estado = async () => {
      const [x] = await tx`SELECT etapa, ronda FROM tramites WHERE id = ${t.tramiteId}`;
      return { etapa: x.etapa, ronda: x.ronda };
    };
    try {
      await transicionar(t.aprobador, { tramiteId: t.tramiteId, accion: "devolver_aprobacion", etapaEsperada: "aprobacion", rondaEsperada: t.ronda, datos: { observaciones: ["Falta citar la resolución vigente."] } }, opc(tx));
      const [o] = await listarObservaciones(t.tramiteId, { sql: tx });
      await responderObservacion(o.id, t.elaborador, "Se citó la resolución.", await estado(), { sql: tx });
      await transicionar(t.elaborador, { tramiteId: t.tramiteId, accion: "enviar_a_revision", etapaEsperada: "elaboracion", rondaEsperada: nueva, credenciales: { clave: "x" } }, opc(tx));

      expect(await criteriosNoCumplen(t.tramiteId, nueva, { sql: tx })).toEqual([]);
      await expect(tx.savepoint(() => transicionar(t.revisor, concepto(t, nueva), opc(tx)))).rejects.toThrow("Faltan ítems de la lista por responder");

      // Otro criterio en la ronda nueva: si el acta mirara otra ronda, llevaría el primero.
      const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
      const otro = items.find((i) => !i.critico && i.id !== criterio.id)!;
      const OTRA_NOTA = "En esta ronda se acepta por otro motivo.";
      await guardarVerificacion(t.tramiteId, t.revisor,
        items.map((i) => (i.id === otro.id ? { itemId: i.id, resultado: "no_cumple" as const, nota: OTRA_NOTA } : { itemId: i.id, resultado: "cumple" as const })),
        await estado(), { sql: tx });
      await cerrarObservacion(o.id, t.revisor, await estado(), { sql: tx });
      const confirmaNoCumple = huellaDeCriterios(await criteriosNoCumplen(t.tramiteId, nueva, { sql: tx }));
      await transicionar(t.revisor, concepto(t, nueva, { confirmaNoCumple }), opc(tx));
      await transicionar(t.aprobador, firmado({ ...t, ronda: nueva }, "aprobar_y_publicar", confirmaNoCumple), opc(tx));
      expect((await actaDelEvento(tx, t.tramiteId)).noCumple).toEqual([{ texto: otro.texto, nota: OTRA_NOTA }]);
    } finally { await t.limpiar(); }
  }));

  it("un criterio sobre un ítem desactivado sigue exigiendo nota y confirmación, y sigue en el evento y en el acta", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    const esperado = { etapa: "revision", ronda: t.ronda } as const;
    try {
      const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
      const criterio = items.find((i) => !i.critico)!;
      await guardarVerificacion(t.tramiteId, t.revisor,
        items.map((i) => ({ itemId: i.id, resultado: i.id === criterio.id ? ("no_cumple" as const) : ("cumple" as const) })), esperado, { sql: tx });
      await tx`UPDATE lista_verificacion_items SET activo = false WHERE id = ${criterio.id}`;
      const rechaza = (mensaje: string) =>
        expect(tx.savepoint(() => transicionar(t.revisor, concepto(t, t.ronda), opc(tx)))).rejects.toThrow(mensaje);

      await rechaza("Escriba una nota en cada criterio que no cumple");
      await guardarVerificacion(t.tramiteId, t.revisor, [{ itemId: criterio.id, resultado: "no_cumple", nota: NOTA }], esperado, { sql: tx });
      await rechaza("Confirme que da concepto favorable a pesar de los criterios que no cumplen");

      const noCumple = [{ texto: criterio.texto, nota: NOTA }];
      const confirmaNoCumple = huellaDeCriterios(await criteriosNoCumplen(t.tramiteId, t.ronda, { sql: tx }));
      await transicionar(t.revisor, concepto(t, t.ronda, { confirmaNoCumple }), opc(tx));
      const [evento] = await tx`SELECT detalle FROM tramite_eventos WHERE tramite_id = ${t.tramiteId} AND tipo = 'concepto_favorable'`;
      expect(evento.detalle.noCumple).toEqual(noCumple);

      await transicionar(t.aprobador, firmado(t, "aprobar_y_publicar", confirmaNoCumple), opc(tx));
      expect((await actaDelEvento(tx, t.tramiteId)).noCumple).toEqual(noCumple);
    } finally { await t.limpiar(); }
  }));

  it("un cierre sin criterios deja la lista vacía, y una eliminación tampoco lleva", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion");
    const e = await tramiteEn(tx, "aprobacion", { tipo: "eliminar" });
    try {
      await transicionar(t.admin, publicar(t), opc(tx));
      expect((await actaDelEvento(tx, t.tramiteId)).noCumple).toEqual([]);
      await transicionar(e.aprobador, { tramiteId: e.tramiteId, accion: "aprobar_y_publicar", etapaEsperada: "aprobacion", rondaEsperada: e.ronda, datos: { concepto: "Procede." }, credenciales: { clave: "x" } }, opc(tx));
      expect((await actaDelEvento(tx, e.tramiteId)).noCumple).toEqual([]);
    } finally { await t.limpiar(); await e.limpiar(); }
  }));
});

describe("el formato del acta", () => {
  let almacen: string;
  const almacenPrevio = process.env.ALMACEN_RUTA;

  beforeAll(() => {
    almacen = mkdtempSync(path.join(tmpdir(), "sgc-acta-"));
    process.env.ALMACEN_RUTA = almacen;
  });

  afterAll(() => {
    if (almacenPrevio === undefined) delete process.env.ALMACEN_RUTA;
    else process.env.ALMACEN_RUTA = almacenPrevio;
    rmSync(almacen, { recursive: true, force: true });
  });

  const ponerClave = (tx: Tx, clave: string, valor: string) =>
    tx`INSERT INTO configuracion (clave, valor) VALUES (${clave}, ${valor}) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`;

  /** Elige un documento como formato, con márgenes que no son los de por defecto. */
  async function formatoElegido(tx: Tx, bytes?: Uint8Array) {
    const formato = await documentoConArchivo(tx, bytes);
    await ponerClave(tx, "formato_acta_documento_id", String(formato.id));
    await ponerClave(tx, "formato_acta_margen_superior_cm", "6");
    await ponerClave(tx, "formato_acta_margen_inferior_cm", "3");
    return formato;
  }

  /** Dentro de la tolerancia de una carta, y otro archivo: `pdfDeFormato` solo cambia con la fecha. */
  const otraVersion = () => pdfDeFormato(1, [611, 791]);

  const aprobarYPublicar = (t: { tramiteId: number; ronda: number }) =>
    ({ tramiteId: t.tramiteId, accion: "aprobar_y_publicar", etapaEsperada: "aprobacion", rondaEsperada: t.ronda, datos: { concepto: "Procede." }, credenciales: { clave: "x" } }) as const;

  const noRegenerables = (tx: Tx, tramiteId: number) =>
    tx`SELECT usuario_id, entidad, entidad_id, detalle FROM auditoria
      WHERE accion = 'acta_no_regenerable' AND (detalle ->> 'tramiteId')::bigint = ${tramiteId} ORDER BY id`;

  const actasDe = async (tx: Tx, versionId: number | null) =>
    (await tx`SELECT count(*)::int AS n FROM archivos WHERE version_id = ${versionId} AND rol LIKE 'acta_%'`)[0].n;

  const leerActa = async (ruta: string) => new Uint8Array(await readFile(resolverRutaAlmacen(ruta)!));

  /** Sin formato, el nombre de la entidad va en el cuerpo; con él, ya está en su encabezado. */
  const conDisenoBasico = async (pdf: Uint8Array, entidad: string) => contieneTexto(await textoDe(pdf), entidad);

  /** Calla el `console.error` esperado y devuelve el espía, para contar sus llamadas. */
  async function conErrorEsperado<T>(fn: () => Promise<T>): Promise<{ resultado: T; llamadas: number }> {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const resultado = await fn();
      return { resultado, llamadas: error.mock.calls.length };
    } finally { error.mockRestore(); }
  }

  it("el cierre congela la versión vigente del formato y sus márgenes", () => revertida(sql, async (tx) => {
    const bytes = await pdfDeFormato();
    const f = await formatoElegido(tx, bytes);
    const t = await tramiteEn(tx, "publicacion");
    const e = await tramiteEn(tx, "aprobacion", { tipo: "eliminar" });
    const rutas: string[] = [];
    try {
      await transicionar(t.admin, publicar(t), opc(tx));
      await transicionar(e.aprobador, aprobarYPublicar(e), opc(tx));
      const esperado = { archivoId: f.archivoId, hash: huella(bytes), codigo: f.codigo, version: 1, margenSuperiorCm: 6, margenInferiorCm: 3 };
      expect((await actaDelEvento(tx, t.tramiteId)).formato).toEqual(esperado);
      expect((await actaDelEvento(tx, e.tramiteId)).formato).toEqual(esperado);     // un solo formato para las dos actas

      const datos = (await reunirDatosActa(t.tramiteId, { sql: tx }))!;
      expect(datos.formato).toEqual(esperado);
      const acta = (await asegurarActa(t.tramiteId, { sql: tx }))!;
      rutas.push(acta.ruta);
      const pdf = await leerActa(acta.ruta);
      expect(huella(pdf)).toBe(huella(await generarActa(datos, bytes)));
      expect(await conDisenoBasico(pdf, datos.entidad)).toBe(false);
    } finally { await borrarActas(rutas); await t.limpiar(); await e.limpiar(); }
  }));

  it("una versión nueva del formato no cambia un acta ya cerrada", () => revertida(sql, async (tx) => {
    const v1 = await pdfDeFormato();
    const f = await formatoElegido(tx, v1);
    const cerrada = await tramiteEn(tx, "publicacion");
    const nueva = await tramiteEn(tx, "publicacion", { codigo: f.codigo, principal: await otraVersion() });
    const rutas: string[] = [];
    try {
      await transicionar(cerrada.admin, publicar(cerrada), opc(tx));
      const congelado = (await actaDelEvento(tx, cerrada.tramiteId)).formato;
      await transicionar(nueva.admin, publicar(nueva), opc(tx));

      expect((await reunirDatosActa(cerrada.tramiteId, { sql: tx }))!.formato).toEqual(congelado);
      const generar = vi.fn(generarActa);
      const acta = (await asegurarActa(cerrada.tramiteId, { sql: tx, generar }))!;
      rutas.push(acta.ruta);
      expect(huella(generar.mock.calls[0][1]!)).toBe(huella(v1));
    } finally { await borrarActas(rutas); await cerrada.limpiar(); await nueva.limpiar(); }
  }));

  it("sin formato, restringido o sin versión vigente, se congela null", () => revertida(sql, async (tx) => {
    const casos: { etiqueta: string; preparar: (f: { id: number }) => PromiseLike<unknown> }[] = [
      { etiqueta: "sin formato", preparar: () => ponerClave(tx, "formato_acta_documento_id", "") },
      { etiqueta: "restringido", preparar: (f) => tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${f.id}` },
      { etiqueta: "sin versión vigente", preparar: (f) => tx`UPDATE documento_versiones SET estado = 'obsoleto' WHERE documento_id = ${f.id}` },
    ];
    for (const caso of casos) {
      await caso.preparar(await formatoElegido(tx));
      const t = await tramiteEn(tx, "publicacion");
      const rutas: string[] = [];
      try {
        await transicionar(t.admin, publicar(t), opc(tx));
        expect(await actaDelEvento(tx, t.tramiteId), caso.etiqueta).toHaveProperty("formato", null);
        const generar = vi.fn(generarActa);
        const acta = (await asegurarActa(t.tramiteId, { sql: tx, generar }))!;
        rutas.push(acta.ruta);
        expect(generar.mock.calls[0][1], caso.etiqueta).toBeNull();
      } finally { await borrarActas(rutas); await t.limpiar(); }
    }
  }));

  it("publicar una versión nueva del propio formato usa esa versión", () => revertida(sql, async (tx) => {
    const f = await formatoElegido(tx);
    const v2 = await otraVersion();
    const t = await tramiteEn(tx, "publicacion", { codigo: f.codigo, principal: v2 });
    const rutas: string[] = [];
    try {
      await transicionar(t.admin, publicar(t), opc(tx));
      const [principal] = await tx`SELECT id FROM archivos WHERE version_id = ${t.versionId} AND rol = 'principal'`;
      expect(Number(principal.id)).not.toBe(f.archivoId);
      expect((await actaDelEvento(tx, t.tramiteId)).formato).toMatchObject({ archivoId: Number(principal.id), hash: huella(v2), version: 2 });

      const generar = vi.fn(generarActa);
      const acta = (await asegurarActa(t.tramiteId, { sql: tx, generar }))!;
      rutas.push(acta.ruta);
      expect(huella(generar.mock.calls[0][1]!)).toBe(huella(v2));
      expect(await conDisenoBasico(await leerActa(acta.ruta), (await reunirDatosActa(t.tramiteId, { sql: tx }))!.entidad)).toBe(false);
    } finally { await borrarActas(rutas); await t.limpiar(); }
  }));

  it("el acta de la eliminación del propio formato sale con el diseño básico", () => revertida(sql, async (tx) => {
    const f = await formatoElegido(tx);
    const e = await tramiteEn(tx, "aprobacion", { codigo: f.codigo, tipo: "eliminar" });
    const rutas: string[] = [];
    try {
      await transicionar(e.aprobador, aprobarYPublicar(e), opc(tx));
      expect(await actaDelEvento(tx, e.tramiteId)).toHaveProperty("formato", null);
      const acta = (await asegurarActa(e.tramiteId, { sql: tx }))!;
      rutas.push(acta.ruta);
      expect(await conDisenoBasico(await leerActa(acta.ruta), (await reunirDatosActa(e.tramiteId, { sql: tx }))!.entidad)).toBe(true);
    } finally { await borrarActas(rutas); await e.limpiar(); }
  }));

  it("el formato perdido no deshace la publicación: no hay acta, queda en la bitácora y reintenta", () => revertida(sql, async (tx) => {
    const bytes = await pdfDeFormato();
    const f = await formatoElegido(tx, bytes);
    const t = await tramiteEn(tx, "publicacion");
    const rutas: string[] = [];
    try {
      await rm(f.absoluta);
      await expect(transicionar(t.admin, publicar(t), opc(tx))).resolves.toMatchObject({ etapa: "publicado" });

      // Sin quien la pida no hay autor para la fila: no se escribe, pero sí queda en el registro del servidor.
      const sinUsuario = await conErrorEsperado(() => asegurarActa(t.tramiteId, { sql: tx }));
      expect(sinUsuario).toEqual({ resultado: null, llamadas: 1 });
      expect(await noRegenerables(tx, t.tramiteId)).toHaveLength(0);

      const conUsuario = await conErrorEsperado(() => asegurarActa(t.tramiteId, { sql: tx, usuarioId: t.admin.usuarioId }));
      expect(conUsuario).toEqual({ resultado: null, llamadas: 1 });
      const filas = await noRegenerables(tx, t.tramiteId);
      expect(filas).toHaveLength(1);
      expect(Number(filas[0].usuario_id)).toBe(t.admin.usuarioId);
      expect(filas[0].entidad).toBe("archivos");
      expect(Number(filas[0].entidad_id)).toBe(f.archivoId);
      expect(filas[0].detalle).toEqual({ tramiteId: t.tramiteId, motivo: "formato", archivoId: f.archivoId });
      expect(await actasDe(tx, t.versionId)).toBe(0);
      const [version] = await tx`SELECT estado FROM documento_versiones WHERE id = ${t.versionId}`;
      expect(version.estado).toBe("vigente");

      await writeFile(f.absoluta, bytes);
      const acta = (await asegurarActa(t.tramiteId, { sql: tx, usuarioId: t.admin.usuarioId }))!;
      rutas.push(acta.ruta);
      expect(await actasDe(tx, t.versionId)).toBe(1);
      expect(await noRegenerables(tx, t.tramiteId)).toHaveLength(1);
    } finally { await borrarActas(rutas); await t.limpiar(); }
  }));

  it("con huella distinta no se usa otro archivo", () => revertida(sql, async (tx) => {
    const bytes = await pdfDeFormato();
    const f = await formatoElegido(tx, bytes);
    const t = await tramiteEn(tx, "publicacion");
    try {
      await transicionar(t.admin, publicar(t), opc(tx));
      await formatoElegido(tx);     // un formato sano elegido después: caer en él daría un acta

      const igualDeLargo = Uint8Array.from(bytes);
      igualDeLargo[igualDeLargo.length - 1] ^= 1;
      for (const cambiado of [igualDeLargo, await pdfDeFormato(2)]) {
        await writeFile(f.absoluta, cambiado);
        const generar = vi.fn(generarActa);
        const { resultado } = await conErrorEsperado(() => asegurarActa(t.tramiteId, { sql: tx, generar, usuarioId: t.admin.usuarioId }));
        expect(resultado).toBeNull();
        expect(generar).not.toHaveBeenCalled();
      }

      // Tampoco si alguien igualó la fila al archivo nuevo: cuenta la huella congelada.
      const otro = await pdfDeFormato(1, [612, 790]);
      await writeFile(f.absoluta, otro);
      await tx`UPDATE archivos SET hash_sha256 = ${huella(otro)}, tamano_bytes = ${otro.byteLength} WHERE id = ${f.archivoId}`;
      expect((await conErrorEsperado(() => asegurarActa(t.tramiteId, { sql: tx, usuarioId: t.admin.usuarioId }))).resultado).toBeNull();

      expect(await actasDe(tx, t.versionId)).toBe(0);
      expect(await noRegenerables(tx, t.tramiteId)).toHaveLength(3);
    } finally { await t.limpiar(); }
  }));

  it("un acta congelada antes de este cambio sigue saliendo", () => revertida(sql, async (tx) => {
    await formatoElegido(tx);       // hoy hay formato: un acta antigua no lo toma
    const t = await tramiteEn(tx, "publicacion");
    const rutas: string[] = [];
    try {
      await transicionar(t.admin, publicar(t), opc(tx));
      const antigua = await actaDelEvento(tx, t.tramiteId);
      delete antigua.formato;
      delete antigua.noCumple;
      await tx`INSERT INTO tramite_eventos (tramite_id, tipo, ronda, detalle) VALUES (${t.tramiteId}, 'publicar', ${t.ronda}, ${tx.json({ acta: antigua })})`;

      const datos = (await reunirDatosActa(t.tramiteId, { sql: tx }))!;
      expect(datos).not.toHaveProperty("formato");
      expect(datos).not.toHaveProperty("noCumple");
      const generar = vi.fn(generarActa);
      const acta = (await asegurarActa(t.tramiteId, { sql: tx, generar }))!;
      rutas.push(acta.ruta);
      expect(generar.mock.calls[0][1]).toBeNull();
      expect(huella(await leerActa(acta.ruta))).toBe(huella(await generarActa(datos)));
    } finally { await borrarActas(rutas); await t.limpiar(); }
  }));

  it("regenerar un acta con formato da los mismos bytes, aunque ya sea otro el elegido", () => revertida(sql, async (tx) => {
    const f = await formatoElegido(tx);
    const t = await tramiteEn(tx, "publicacion");
    const rutas: string[] = [];
    try {
      await transicionar(t.admin, publicar(t), opc(tx));
      const primera = (await asegurarActa(t.tramiteId, { sql: tx }))!;
      rutas.push(primera.ruta);
      const original = await leerActa(primera.ruta);
      expect(await conDisenoBasico(original, (await reunirDatosActa(t.tramiteId, { sql: tx }))!.entidad)).toBe(false);

      await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${f.id}`;
      await formatoElegido(tx);
      await ponerClave(tx, "formato_acta_margen_superior_cm", "2");
      await rm(resolverRutaAlmacen(primera.ruta)!);
      expect(await asegurarActa(t.tramiteId, { sql: tx })).toEqual(primera);
      expect(huella(await leerActa(primera.ruta))).toBe(huella(original));
    } finally { await borrarActas(rutas); await t.limpiar(); }
  }));

  it("si el acta ya está en disco, el formato no se toca", () => revertida(sql, async (tx) => {
    const f = await formatoElegido(tx);
    const t = await tramiteEn(tx, "publicacion");
    const rutas: string[] = [];
    try {
      await transicionar(t.admin, publicar(t), opc(tx));
      const acta = (await asegurarActa(t.tramiteId, { sql: tx }))!;
      rutas.push(acta.ruta);
      await rm(f.absoluta);
      const generar = vi.fn(generarActa);
      expect(await asegurarActa(t.tramiteId, { sql: tx, generar, usuarioId: t.admin.usuarioId })).toEqual(acta);
      expect(generar).not.toHaveBeenCalled();
      expect(await noRegenerables(tx, t.tramiteId)).toHaveLength(0);
    } finally { await borrarActas(rutas); await t.limpiar(); }
  }));

  it("un formato bien guardado que no sirve da el diseño básico, sin fila en la bitácora, y se regenera igual", () => revertida(sql, async (tx) => {
    await formatoElegido(tx, await pdfDeFormato(2));
    const t = await tramiteEn(tx, "publicacion");
    const rutas: string[] = [];
    try {
      await transicionar(t.admin, publicar(t), opc(tx));
      const { resultado: acta, llamadas } = await conErrorEsperado(() => asegurarActa(t.tramiteId, { sql: tx, usuarioId: t.admin.usuarioId }));
      rutas.push(acta!.ruta);
      expect(llamadas).toBe(1);
      expect(await noRegenerables(tx, t.tramiteId)).toHaveLength(0);
      const original = await leerActa(acta!.ruta);
      expect(await conDisenoBasico(original, (await reunirDatosActa(t.tramiteId, { sql: tx }))!.entidad)).toBe(true);

      await rm(resolverRutaAlmacen(acta!.ruta)!);
      const otra = await conErrorEsperado(() => asegurarActa(t.tramiteId, { sql: tx }));
      expect(otra.resultado).toEqual(acta);
      expect(huella(await leerActa(acta!.ruta))).toBe(huella(original));
    } finally { await borrarActas(rutas); await t.limpiar(); }
  }));
});

describe("cada cierre tiene su acta", () => {
  it("una versión publicada por un trámite y eliminada por otro: dos actas con su rol, y el panel las lista", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion");
    const rutas: string[] = [];
    try {
      await transicionar(t.admin, publicar(t), opc(tx));
      const e = await tramiteEn(tx, "aprobacion", { codigo: t.codigo, tipo: "eliminar" });
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

      const detalle = await obtenerDocumentoAdmin(t.codigo, e.admin, { sql: tx });
      const version = detalle!.versiones.find((v) => v.id === t.versionId)!;
      expect(version.estado).toBe("anulado");
      expect(version.cierres).toEqual([{ id: t.tramiteId, etapa: "publicado" }, { id: e.tramiteId, etapa: "eliminado" }]);
    } finally {
      await borrarActas(rutas);
      await t.limpiar();
    }
  }));
});

describe("los parecidos en el acta", () => {
  const SIGUIO = "se siguió como documento nuevo";

  it("dice el conteo y el nivel, sin códigos, también si el dato congelado los trae; el evento los conserva", () => revertida(sql, async (tx) => {
    const parecido = await documentoLibre(tx, { proceso: "CEX", tipo: "PR", titulo: "Formato de prueba del flujo" });
    const t = await tramiteEn(tx, "publicacion", { tipo: "crear" });
    try {
      await transicionar(t.admin, publicar(t), opc(tx));
      const [aceptar] = await tx`SELECT detalle FROM tramite_eventos WHERE tramite_id = ${t.tramiteId} AND tipo = 'aceptar'`;
      const vistos: { codigo: string; nivel: string }[] = aceptar.detalle.parecidos;
      expect(vistos.map((p) => p.codigo)).toContain(parecido.codigo);     // el historial no cambia
      const muy = vistos.filter((p) => p.nivel === "muy_parecido").length;
      const otros = vistos.length - muy;
      const nivel = (n: number, nombre: string) => (n === 0 ? [] : [`${n} ${nombre}${n === 1 ? "" : "s"}`]);
      const esperado = `Se vieron ${vistos.length} documento${vistos.length === 1 ? "" : "s"}: ${[...nivel(muy, "muy parecido"), ...nivel(otros, "parecido")].join(" y ")}; ${SIGUIO}`;

      const [cierre] = await tx`SELECT detalle -> 'acta' AS acta FROM tramite_eventos WHERE tramite_id = ${t.tramiteId} AND tipo = 'publicar'`;
      expect(cierre.acta.aceptacion.duplicidad).toBe(esperado);

      // Un acta congelada antes de esta regla: el texto trae el código y solo se puede insertar otro cierre.
      const conCodigos = `Se vieron 1 documento: ${parecido.codigo} (muy parecido); ${SIGUIO}`;
      const acta = { ...cierre.acta, aceptacion: { ...cierre.acta.aceptacion, duplicidad: conCodigos } };
      await tx`INSERT INTO tramite_eventos (tramite_id, tipo, ronda, detalle) VALUES (${t.tramiteId}, 'publicar', ${t.ronda}, ${tx.json({ acta })})`;
      const datos = (await reunirDatosActa(t.tramiteId, { sql: tx }))!;
      expect(datos.aceptacion.duplicidad).toBe(esperado);
      const pdf = await textoDe(await generarActa(datos));
      expect(contieneTexto(pdf, parecido.codigo)).toBe(false);
      expect(contieneTexto(pdf, "Duplicidad")).toBe(true);
    } finally { await t.limpiar(); }
  }));

  it("una modificación no vio parecidos: el acta no lleva la fila", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion");
    try {
      await transicionar(t.admin, publicar(t), opc(tx));
      expect((await reunirDatosActa(t.tramiteId, { sql: tx }))!.aceptacion.duplicidad).toBeNull();
    } finally { await t.limpiar(); }
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
      const auditadas = await tx`SELECT 1 FROM auditoria WHERE accion = 'acta_generada' AND entidad_id = ${ganadora}`;
      expect(auditadas).toHaveLength(0);                                  // la registró la otra petición
    } finally { await borrarActas(rutas); await t.limpiar(); }
  }));

  it("registrar el acta deja una fila en la bitácora con el trámite, la huella y quien la pidió; una sola vez", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion");
    const rutas: string[] = [];
    try {
      await transicionar(t.admin, publicar(t), opc(tx));
      const acta = (await asegurarActa(t.tramiteId, { sql: tx, usuarioId: t.aprobador.usuarioId }))!;
      rutas.push(acta.ruta);
      await asegurarActa(t.tramiteId, { sql: tx, usuarioId: t.admin.usuarioId });
      const [archivo] = await tx`SELECT hash_sha256 FROM archivos WHERE id = ${acta.archivoId}`;
      const filas = await tx`SELECT usuario_id, entidad, detalle FROM auditoria WHERE accion = 'acta_generada' AND entidad_id = ${acta.archivoId}`;
      expect(filas).toHaveLength(1);
      expect(Number(filas[0].usuario_id)).toBe(t.aprobador.usuarioId);
      expect(filas[0].entidad).toBe("archivos");
      expect(filas[0].detalle).toMatchObject({ tramiteId: t.tramiteId, huella: archivo.hash_sha256 });
      expect(filas[0].detalle.numero).toBe((await versionDeActa(t.tramiteId, { sql: tx }))!.numero);
    } finally { await borrarActas(rutas); await t.limpiar(); }
  }));

  it("sin usuario el acta se registra igual, y la fila queda sin autor", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion");
    const rutas: string[] = [];
    try {
      await transicionar(t.admin, publicar(t), opc(tx));
      const acta = (await asegurarActa(t.tramiteId, { sql: tx }))!;
      rutas.push(acta.ruta);
      const filas = await tx`SELECT usuario_id FROM auditoria WHERE accion = 'acta_generada' AND entidad_id = ${acta.archivoId}`;
      expect(filas.map((f) => f.usuario_id)).toEqual([null]);
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
      await tx`UPDATE documentos SET titulo = 'Cambió después' WHERE codigo = ${t.codigo}`;
      const segunda = (await asegurarActa(t.tramiteId, { sql: tx }))!;
      expect(segunda).toEqual(primera);
      expect(contieneTexto(await textoDe(new Uint8Array(await readFile(absoluta))), t.titulo)).toBe(true);
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
