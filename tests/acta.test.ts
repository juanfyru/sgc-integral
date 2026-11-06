/**
 * El acta de aprobación y de eliminación: el PDF no necesita BD; su registro, su visibilidad y que
 * no se mezcle con los archivos del documento corren contra la demo ya sembrada, en una transacción
 * que se revierte. El archivo del acta lo borra cada test.
 */
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { asegurarActa, reunirDatosActa, versionDeActa } from "@/db/consultas/actas";
import { obtenerArchivoAdmin, obtenerDocumentoAdmin } from "@/db/consultas/admin";
import { obtenerArchivoVigente, obtenerFichaDocumento } from "@/db/consultas/documentos";
import { transicionar } from "@/db/consultas/tramites-flujo";
import { generarActa, type DatosActa } from "@/lib/acta";
import { puedeVerVersion } from "@/lib/alcance";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { contenidoPorPagina, contieneTexto } from "./utiles/pdf";
import { opc, tramiteEn } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const HUELLA = "9f2c".repeat(16);
const datos: DatosActa = {
  clase: "aprobacion",
  entidad: "ESE Hospital Nuestra Señora de Fátima de Suaza",
  documento: { codigo: "GTH-PR-02", titulo: "Procedimiento de Inducción y Reinducción", tipo: "Procedimiento", proceso: "Gestión del Talento Humano" },
  version: 3,
  solicitud: { numero: "SOL-2026-014", tipo: "Modificar", motivo: "Mejora del proceso", justificacion: "Se añade la inducción específica por servicio.", solicitante: "Diana Patricia Losada", fecha: new Date("2026-11-03T14:12:00Z") },
  vistoBueno: "Dado: quien pide es líder del proceso",
  aceptacion: { quien: "María Fernanda Perdomo", fecha: new Date("2026-11-04T13:30:00Z"), duplicidad: null },
  controlCambios: "Se añade la inducción específica por servicio y se actualiza el formato de evaluación.",
  firmas: [
    { firma: "Elaboró", nombre: "Diana Patricia Losada", cargo: "Coordinadora de Talento Humano", fecha: new Date("2026-11-12T16:40:00Z"), huella: HUELLA },
    { firma: "Revisó", nombre: "María Fernanda Perdomo", cargo: "Líder de Calidad", fecha: new Date("2026-11-13T14:05:00Z"), huella: HUELLA },
    { firma: "Aprobó", nombre: "Íñigo Nuñez Peñaloza", cargo: null, fecha: new Date("2026-11-13T14:06:00Z"), huella: HUELLA },
    { firma: "Publicó", nombre: "María Fernanda Perdomo", cargo: "Líder de Calidad", fecha: new Date("2026-11-13T14:06:00Z"), huella: HUELLA },
  ],
  rondas: 2,
  observaciones: { total: 2, cerradas: 2 },
  versionObsoleta: 2,
  publicadoEn: new Date("2026-11-13T14:06:00Z"),
  zona: "America/Bogota",
};

const textoDe = async (pdf: Uint8Array) => (await contenidoPorPagina(pdf)).join("\n");

const AVISO = "Algunos caracteres no se pudieron imprimir";

describe("generarActa", () => {
  it("translitera lo común y, si no queda nada sustituido, no añade la nota", async () => {
    const texto = "Requisito ≥ 5 días → plazo ≠ anterior ✓ ← ≤ Ω μ β 2126";
    const pdf = await textoDe(await generarActa({ ...datos, controlCambios: texto }));
    expect(contieneTexto(pdf, "Requisito >= 5 días -> plazo <> anterior [x] <- <= Ohm µ beta Ohm")).toBe(true);
    expect(contieneTexto(pdf, AVISO)).toBe(false);
  });

  it("el texto del informe: lo que no se puede imprimir sale como «?» y el acta lo dice", async () => {
    const pdf = await textoDe(await generarActa({ ...datos, solicitud: { ...datos.solicitud, justificacion: "Requisito ≥ 5 días → plazo ≠ anterior ✓ 😀 Ω" } }));
    expect(contieneTexto(pdf, "Requisito >= 5 días -> plazo <> anterior [x] ? Ohm")).toBe(true);
    expect(contieneTexto(pdf, `${AVISO} y se muestran como «?». El texto íntegro consta en el historial del trámite.`)).toBe(true);
  });

  it("un emoji en cualquier dato, por dentro que esté, añade la nota", async () => {
    const firmas = datos.firmas.map((f, i) => (i === 1 ? { ...f, cargo: "Calidad 😀" } : f));
    expect(contieneTexto(await textoDe(await generarActa({ ...datos, firmas })), AVISO)).toBe(true);
  });

  it("un «?» escrito por la persona no es un carácter perdido, ni lo es un salto de línea", async () => {
    const pdf = await textoDe(await generarActa({ ...datos, controlCambios: "¿Cumple?\nSí, con «comillas», €, — y ñ.\tFin." }));
    expect(contieneTexto(pdf, "¿Cumple?")).toBe(true);
    expect(contieneTexto(pdf, AVISO)).toBe(false);
  });

  it("con la nota, generarla otra vez da los mismos bytes", async () => {
    const d = { ...datos, controlCambios: "Con 😀" };
    expect(Buffer.from(await generarActa(d)).equals(Buffer.from(await generarActa(d)))).toBe(true);
  });

  it("las observaciones se cuentan en singular y en plural", async () => {
    const con = async (total: number, cerradas: number) => textoDe(await generarActa({ ...datos, observaciones: { total, cerradas } }));
    expect(contieneTexto(await con(1, 1), "1 de 1 cerrada")).toBe(true);
    expect(contieneTexto(await con(1, 1), "cerradas")).toBe(false);
    expect(contieneTexto(await con(3, 3), "3 de 3 cerradas")).toBe(true);
    expect(contieneTexto(await con(2, 1), "1 de 2 cerrada")).toBe(true);
    expect(contieneTexto(await con(0, 0), "Ninguna")).toBe(true);
  });

  it("el acta trae documento, versión, firmantes con tildes y eñes, y huellas", async () => {
    const pdf = await textoDe(await generarActa(datos));
    for (const texto of [
      "Acta de aprobación documental", "GTH-PR-02", "SOL-2026-014", "Íñigo Nuñez Peñaloza",
      "Coordinadora de Talento Humano", "13/11/2026 09:06", "Ley 527 de 1999", "Dado: quien pide es líder del proceso",
    ]) {
      expect(contieneTexto(pdf, texto), texto).toBe(true);
    }
    expect(contieneTexto(pdf, HUELLA)).toBe(true);
  });

  it("un texto muy largo o con un carácter fuera de la fuente no rompe el acta y sigue en otra página", async () => {
    const bytes = await generarActa({ ...datos, controlCambios: "Cambio 😀 ".repeat(600), clase: "eliminacion" });
    const paginas = await contenidoPorPagina(bytes);
    expect(paginas.length).toBeGreaterThan(1);
    expect(contieneTexto(paginas[0], "Acta de eliminación documental")).toBe(true);
    expect(contieneTexto(paginas[0], "Cambio ? Cambio ?")).toBe(true);
    paginas.forEach((p, i) => expect(contieneTexto(p, `Página ${i + 1} de ${paginas.length}`)).toBe(true));
  });

  it("una palabra más larga que la línea se corta en lugar de salirse de la hoja", async () => {
    const bytes = await generarActa({ ...datos, solicitud: { ...datos.solicitud, justificacion: "x".repeat(400) } });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(1);
    expect(contieneTexto(await textoDe(bytes), "x".repeat(60))).toBe(true);
  });

  it("un nombre en forma descompuesta (NFD) sale con su tilde y su eñe, no como «?»", async () => {
    const nombre = "María Nuñez";
    const pdf = await textoDe(await generarActa({ ...datos, firmas: [{ ...datos.firmas[0], nombre: nombre.normalize("NFD") }] }));
    expect(contieneTexto(pdf, nombre)).toBe(true);
  });

  it("la fecha del pie es la de la publicación, en la zona dada, y el mismo texto sale cada vez", async () => {
    const a = await textoDe(await generarActa(datos));
    const b = await textoDe(await generarActa(datos));
    expect(a).toBe(b);
    expect(contieneTexto(a, "Generada por SGC Integral el 13/11/2026 09:06")).toBe(true);
    const utc = await textoDe(await generarActa({ ...datos, zona: "UTC" }));
    expect(contieneTexto(utc, "Generada por SGC Integral el 13/11/2026 14:06")).toBe(true);
  });

  it("la eliminación nombra la versión anulada y no habla de rondas", async () => {
    const pdf = await textoDe(await generarActa({ ...datos, clase: "eliminacion", versionObsoleta: null }));
    expect(contieneTexto(pdf, "3, anulada el 13/11/2026")).toBe(true);
    expect(contieneTexto(pdf, "Rondas")).toBe(false);
  });
});

describe("el acta de un trámite", () => {
  it("el acta se genera una sola vez y, si falla al publicar, se genera a pedido", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion");
    const rutas: string[] = [];
    try {
      await transicionar(t.admin, { tramiteId: t.tramiteId, accion: "publicar", etapaEsperada: "publicacion", rondaEsperada: t.ronda, credenciales: { clave: "x" } }, opc(tx));
      const falla = async () => { throw new Error("fallo simulado"); };
      await expect(tx.savepoint(() => asegurarActa(t.tramiteId, { sql: tx, generar: falla }))).rejects.toThrow("fallo simulado");
      const [fila] = await tx`SELECT etapa FROM tramites WHERE id = ${t.tramiteId}`;
      expect(fila.etapa).toBe("publicado");                              // la publicación queda en pie
      const a = await asegurarActa(t.tramiteId, { sql: tx });
      const b = await asegurarActa(t.tramiteId, { sql: tx });
      rutas.push(a!.ruta);
      expect(b!.archivoId).toBe(a!.archivoId);
      const [archivo] = await tx`SELECT rol, mime, tamano_bytes, hash_sha256 FROM archivos WHERE id = ${a!.archivoId}`;
      expect(archivo).toMatchObject({ rol: "acta_aprobacion", mime: "application/pdf" });
      expect(Number(archivo.tamano_bytes)).toBeGreaterThan(0);
      expect(archivo.hash_sha256).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      for (const r of rutas) await rm(resolverRutaAlmacen(r)!, { force: true });
      await t.limpiar();
    }
  }));

  it("reúne los datos de lo que pasó: solicitud, visto bueno, aceptación, firmas de la última ronda y versión obsoleta", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion");
    try {
      await transicionar(t.admin, { tramiteId: t.tramiteId, accion: "publicar", etapaEsperada: "publicacion", rondaEsperada: t.ronda, credenciales: { clave: "x" } }, opc(tx));
      // Una firma de una ronda anterior no sale en el acta.
      await tx`INSERT INTO firmas (tramite_id, version_id, usuario_id, firma, ronda, hash_sha256, nombre_firmante, metodo)
        VALUES (${t.tramiteId}, ${t.versionId}, ${t.elaborador.usuarioId}, 'elaboro', 0, ${"0".repeat(64)}, 'Firma de una ronda vieja', 'clave')`;
      const d = await reunirDatosActa(t.tramiteId, { sql: tx });
      const [v] = await tx`SELECT numero FROM documento_versiones WHERE id = ${t.versionId}`;
      expect(d).toMatchObject({
        clase: "aprobacion",
        documento: { codigo: t.codigo, titulo: t.titulo },
        version: v.numero,
        solicitud: { tipo: "Modificar", motivo: "Mejora del proceso" },
        vistoBueno: "Dado: quien pide es líder del proceso",
        aceptacion: { quien: t.admin.nombre, duplicidad: null },
        controlCambios: "Se añade la inducción por servicio.",
        rondas: 1,
        observaciones: { total: 0, cerradas: 0 },
        versionObsoleta: v.numero - 1,
      });
      expect(d!.solicitud.solicitante).toBe(t.elaborador.nombre);
      expect(d!.firmas.map((f) => f.firma)).toEqual(["Elaboró", "Revisó", "Aprobó", "Publicó"]);
      expect(d!.firmas.map((f) => f.nombre)).not.toContain("Firma de una ronda vieja");
      expect(d!.firmas[0].cargo).toBe("Coordinadora de Talento Humano");
      expect(new Set(d!.firmas.map((f) => f.huella)).size).toBe(1);
      const [cierre] = await tx`SELECT cerrado_en FROM tramites WHERE id = ${t.tramiteId}`;
      expect(d!.publicadoEn).toEqual(cierre.cerrado_en);
    } finally { await t.limpiar(); }
  }));

  it("un trámite abierto, rechazado o cancelado no tiene acta", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aceptacion");
    expect(await reunirDatosActa(t.tramiteId, { sql: tx })).toBeNull();
    expect(await asegurarActa(t.tramiteId, { sql: tx })).toBeNull();
    for (const etapa of ["rechazado", "cancelado"]) {
      await tx`UPDATE tramites SET etapa = ${etapa} WHERE id = ${t.tramiteId}`;
      expect(await versionDeActa(t.tramiteId, { sql: tx })).toBeNull();
      expect(await asegurarActa(t.tramiteId, { sql: tx })).toBeNull();
    }
  }));

  it("el acta no sale en la ficha, ni en el detalle del panel, ni por las rutas de archivos; el trámite sí se enlaza", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion");
    const rutas: string[] = [];
    try {
      await transicionar(t.admin, { tramiteId: t.tramiteId, accion: "publicar", etapaEsperada: "publicacion", rondaEsperada: t.ronda, credenciales: { clave: "x" } }, opc(tx));
      const acta = (await asegurarActa(t.tramiteId, { sql: tx }))!;
      rutas.push(acta.ruta);

      const ficha = await obtenerFichaDocumento(t.codigo, t.admin, { sql: tx });
      expect(ficha!.archivos.map((a) => a.rol)).toEqual(["principal"]);
      expect(ficha!.version.tramiteId).toBe(t.tramiteId);

      const detalle = await obtenerDocumentoAdmin(t.codigo, t.admin, { sql: tx });
      const version = detalle!.versiones.find((v) => v.id === t.versionId)!;
      expect(version.archivos.map((a) => a.rol)).toEqual(["principal"]);
      expect(version.cierres).toEqual([{ id: t.tramiteId, etapa: "publicado" }]);

      // Ni por su id: las rutas de archivos no sirven un acta.
      expect(await obtenerArchivoVigente(t.codigo, acta.archivoId, t.admin, { sql: tx })).toBeNull();
      expect(await obtenerArchivoAdmin(acta.archivoId, { sql: tx })).toBeNull();
      const [principal] = await tx`SELECT id FROM archivos WHERE version_id = ${t.versionId} AND rol = 'principal'`;
      expect(await obtenerArchivoAdmin(Number(principal.id), { sql: tx })).not.toBeNull();
    } finally {
      for (const r of rutas) await rm(resolverRutaAlmacen(r)!, { force: true });
      await t.limpiar();
    }
  }));

  it("la eliminación deja su acta en la versión anulada", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aprobacion", { tipo: "eliminar" });
    const rutas: string[] = [];
    try {
      const r = await transicionar(t.aprobador, { tramiteId: t.tramiteId, accion: "aprobar_y_publicar", etapaEsperada: "aprobacion", rondaEsperada: 0, datos: { concepto: "Procede." }, credenciales: { clave: "x" } }, opc(tx));
      expect(r.etapa).toBe("eliminado");
      const d = await reunirDatosActa(t.tramiteId, { sql: tx });
      expect(d).toMatchObject({ clase: "eliminacion", versionObsoleta: null, rondas: 0, controlCambios: null });
      expect(d!.firmas.map((f) => f.firma)).toEqual(["Aprobó", "Publicó"]);
      const acta = (await asegurarActa(t.tramiteId, { sql: tx }))!;
      rutas.push(acta.ruta);
      const [fila] = await tx`SELECT rol, version_id FROM archivos WHERE id = ${acta.archivoId}`;
      expect(fila).toMatchObject({ rol: "acta_eliminacion" });
      expect(Number(fila.version_id)).toBe(t.versionId);
      const [v] = await tx`SELECT estado FROM documento_versiones WHERE id = ${t.versionId}`;
      expect(v.estado).toBe("anulado");
    } finally {
      for (const ruta of rutas) await rm(resolverRutaAlmacen(ruta)!, { force: true });
    }
  }));
});

describe("puedeVerVersion", () => {
  const versionEn = async (estado: string) => {
    const [v] = await sql`SELECT v.id FROM documento_versiones v JOIN documentos d ON d.id = v.documento_id
      WHERE v.estado = ${estado} AND d.nivel_acceso = 'general' ORDER BY v.id LIMIT 1`;
    return v ? Number(v.id) : null;
  };

  it("la vigente la ve todo el que pasa el nivel de acceso; la obsoleta y la anulada, quien tiene historial", () => revertida(sql, async (tx) => {
    const consulta = { usuarioId: 0, rol: "consulta", verHistorial: false } as const;
    const control = { usuarioId: 0, rol: "control_interno", verHistorial: false } as const;
    const conMarca = { usuarioId: 0, rol: "consulta", verHistorial: true } as const;
    const vigente = (await versionEn("vigente"))!;
    expect(await puedeVerVersion(vigente, consulta, { sql: tx })).toBe(true);

    const obsoleta = (await versionEn("obsoleto"))!;
    expect(obsoleta, "la demo trae una versión obsoleta").not.toBeNull();
    expect(await puedeVerVersion(obsoleta, consulta, { sql: tx })).toBe(false);
    expect(await puedeVerVersion(obsoleta, control, { sql: tx })).toBe(true);
    expect(await puedeVerVersion(obsoleta, conMarca, { sql: tx })).toBe(true);

    // Una versión anulada sigue la misma regla.
    await tx`UPDATE documento_versiones SET estado = 'anulado' WHERE id = ${vigente}`;
    expect(await puedeVerVersion(vigente, consulta, { sql: tx })).toBe(false);
    expect(await puedeVerVersion(vigente, control, { sql: tx })).toBe(true);
    // Un borrador, o una versión que no existe, no se sirve por aquí.
    await tx`UPDATE documento_versiones SET estado = 'borrador' WHERE id = ${vigente}`;
    expect(await puedeVerVersion(vigente, control, { sql: tx })).toBe(false);
    expect(await puedeVerVersion(2_000_000_000, control, { sql: tx })).toBe(false);
  }));

  it("un documento restringido exige además estar asignado a su proceso", () => revertida(sql, async (tx) => {
    const vigente = (await versionEn("vigente"))!;
    await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = (SELECT documento_id FROM documento_versiones WHERE id = ${vigente})`;
    expect(await puedeVerVersion(vigente, { usuarioId: 0, rol: "consulta", verHistorial: false }, { sql: tx })).toBe(false);
    expect(await puedeVerVersion(vigente, { usuarioId: 0, rol: "control_interno", verHistorial: false }, { sql: tx })).toBe(true);
  }));
});
