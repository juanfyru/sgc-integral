/**
 * Los trámites de la demo (spec 13A §18.2) contra la base sembrada: deben quedar como los dejaría
 * `transicionar` y poder seguir con las funciones reales. La misma base se usa a mano: lo que se
 * afirma de la historia sembrada se filtra a lo sembrado, y lo que se afirma de cómo está la demo
 * se salta si ya avanzó (ver `utiles/demo.ts`). Solo lee: lo que avanza un trámite o genera el acta
 * corre en una transacción que se revierte.
 */
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { afterAll, describe, expect, it, vi, type TestContext } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { asegurarActa, reunirDatosActa } from "@/db/consultas/actas";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { listarFirmas } from "@/db/consultas/firmas";
import { leerFormatoCongelado, revisarFormatoActa } from "@/db/consultas/formato-acta";
import { cerrarObservacion, criteriosNoCumplen, guardarVerificacion, listarItemsVerificacion, listarObservaciones } from "@/db/consultas/revision";
import { datosParaAceptar, obtenerTramite } from "@/db/consultas/tramites";
import { transicionar } from "@/db/consultas/tramites-flujo";
import { revisarVencimientos } from "@/db/consultas/vencimientos";
import { generarFormatoActaDemo } from "@/db/semillas/formato-acta-demo";
import { generarActa } from "@/lib/acta";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { huellaDeArchivo } from "@/lib/huella";
import { motivoMembreteNoUtilizable } from "@/lib/membrete-acta";
import { misTareas } from "@/lib/tareas";
import { estadoPlazo, fechaEnZona, fechaLimite } from "@/lib/tramites/plazos";
import { LARGO_MIN_NOTA_CRITERIO } from "@/lib/tramites/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { exigirDemo, exigirDemoIntacta, sembradaEn } from "./utiles/demo";
import { huella } from "./utiles/formato";
import { contenidoPorPagina, contieneTexto } from "./utiles/pdf";
import { aprobacionConCriterio, opc, sesionDe } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
const FIRMA = { clave: "x" };

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

/** `ORDER BY id`: los sembrados son los primeros, aunque otro año repita el consecutivo. */
async function tramiteDe(consecutivo: number, cliente: Cliente = sql) {
  const [t] = await cliente`SELECT * FROM tramites WHERE consecutivo = ${consecutivo} ORDER BY id LIMIT 1`;
  return t;
}

const SEMBRADOS: Record<number, { etapa: string; ronda: number }> = {
  1: { etapa: "publicado", ronda: 1 },
  2: { etapa: "revision", ronda: 2 },
  3: { etapa: "publicacion", ronda: 1 },
  4: { etapa: "aceptacion", ronda: 0 },
  5: { etapa: "visto_bueno", ronda: 0 },
};

/** El trámite, si sigue en la etapa y la ronda en que se sembró; si no, el caso se salta. */
async function comoSeSembro(ctx: TestContext, consecutivo: number) {
  const t = await tramiteDe(consecutivo);
  const { etapa, ronda } = SEMBRADOS[consecutivo];
  exigirDemo(ctx, t.etapa === etapa && t.ronda === ronda, `${t.numero} ya no está en ${etapa}, ronda ${ronda}`);
  return t;
}

/** Corre los pasos con la hora de verdad: las fechas sembradas salen del momento de sembrar. */
const ahoraEn = (tx: TransactionSql) => opc(tx, new Date().toISOString());

/** Lo que dejó la siembra en una tabla de solo inserción, sin lo que se haya hecho después. */
async function firmasSembradas(tramiteId: number) {
  const sembrada = await sembradaEn(sql);
  return (await listarFirmas(tramiteId)).filter((f) => f.creadoEn <= sembrada);
}

describe("la historia sembrada", () => {
  it("cinco solicitudes, con consecutivos 1 a 5 del año en que se sembró", async () => {
    const filas = await sql`SELECT numero, consecutivo, anio FROM tramites ORDER BY id LIMIT 5`;
    const anio = fechaEnZona(await sembradaEn(sql), zonaHoraria()).slice(0, 4);
    expect(filas.map((f) => f.numero)).toEqual([1, 2, 3, 4, 5].map((n) => `SOL-${anio}-00${n}`));
    expect(filas.map((f) => f.consecutivo)).toEqual([1, 2, 3, 4, 5]);
    expect(filas.every((f) => String(f.anio) === anio)).toBe(true);
  });

  it("el trámite publicado tiene sus cuatro firmas con una sola huella y la versión quedó en la plataforma", async () => {
    const t = await tramiteDe(1);
    const firmas = await firmasSembradas(t.id);
    expect(firmas.map((f) => f.firma)).toEqual(["elaboro", "reviso", "aprobo", "publico"]);
    expect(new Set(firmas.map((f) => f.hashSha256)).size).toBe(1);
    const [v] = await sql`SELECT origen_aprobacion, numero, elaboro, reviso, aprobo, publicado_en, resumen_cambios,
        fecha_elaboracion::text AS fecha_elaboracion, fecha_revision::text AS fecha_revision, fecha_aprobacion::text AS fecha_aprobacion
      FROM documento_versiones WHERE id = ${t.version_id}`;
    expect(v).toMatchObject({ origen_aprobacion: "plataforma", numero: 3 });
    const [archivo] = await sql`SELECT ruta FROM archivos WHERE version_id = ${t.version_id} AND rol = 'principal'`;
    expect(await huellaDeArchivo(archivo.ruta)).toBe(firmas[0].hashSha256);

    const [elaboro, reviso, aprobo, publico] = firmas;
    expect([elaboro, reviso, aprobo].map((f) => `${f.nombre} — ${f.cargo}`)).toEqual([v.elaboro, v.reviso, v.aprobo]);
    const zona = zonaHoraria();
    expect(v.fecha_elaboracion).toBe(fechaEnZona(elaboro.creadoEn, zona));
    expect(v.fecha_revision).toBe(fechaEnZona(reviso.creadoEn, zona));
    expect(v.fecha_aprobacion).toBe(fechaEnZona(aprobo.creadoEn, zona));
    expect(v.publicado_en).toEqual(publico.creadoEn);
    expect(v.resumen_cambios).toBeTruthy();
    expect(t.etapa).toBe("publicado");                                           // un trámite cerrado no cambia
    expect(t.cerrado_en).toEqual(publico.creadoEn);
    expect(t.vence_en).toBeNull();

    const personas = await sql`SELECT usuario, id FROM usuarios WHERE usuario IN ('lider.gth', 'coordinadora.sgc', 'gerente')`;
    const id = Object.fromEntries(personas.map((p) => [p.usuario, Number(p.id)]));
    expect(firmas.map((f) => f.usuarioId)).toEqual([id["lider.gth"], id["coordinadora.sgc"], id.gerente, id["coordinadora.sgc"]]);
    expect([t.elaborador_id, t.revisor_id, t.aprobador_id].map(Number)).toEqual(firmas.slice(0, 3).map((f) => f.usuarioId));

    const anteriores = await sql`SELECT numero, estado FROM documento_versiones
      WHERE documento_id = ${t.documento_id} AND numero < 3 ORDER BY numero`;
    expect(anteriores).toEqual([{ numero: 1, estado: "obsoleto" }, { numero: 2, estado: "obsoleto" }]);
  });

  it("el evento de cierre lleva el acta congelada, con su versión, sus obsoletas y su huella", async () => {
    const t = await tramiteDe(1);
    const [e] = await sql`SELECT detalle FROM tramite_eventos WHERE tramite_id = ${t.id} AND tipo = 'publicar'`;
    const [{ hashSha256: huella }] = await firmasSembradas(t.id);
    expect(e.detalle).toMatchObject({ version: 3, obsoletas: [2], huella, acta: { clase: "aprobacion", versionObsoleta: 2, rondas: 1 } });
  });

  it("el trámite publicado trae un criterio aceptado y el formato congelado", async () => {
    const t = await tramiteDe(1);
    const criterios = await criteriosNoCumplen(t.id, t.ronda);
    expect(criterios).toHaveLength(1);
    const [{ texto, nota }] = criterios;
    expect(nota.trim().length).toBeGreaterThanOrEqual(LARGO_MIN_NOTA_CRITERIO);

    const eventos = await sql`SELECT tipo, detalle FROM tramite_eventos WHERE tramite_id = ${t.id}`;
    const detalle = (tipo: string) => eventos.find((e) => e.tipo === tipo)!.detalle;
    const constancia = { noCumple: [{ texto, nota }], confirmoNoCumple: true };
    expect(detalle("concepto_favorable")).toMatchObject(constancia);
    expect(detalle("aprobar")).toMatchObject(constancia);

    const [formato] = await sql`SELECT a.id, a.hash_sha256 FROM archivos a
      JOIN documento_versiones v ON v.id = a.version_id JOIN documentos d ON d.id = v.documento_id
      WHERE d.codigo = 'SGC-FO-06' AND v.numero = 1 AND a.rol = 'principal'`;
    expect(detalle("publicar").acta).toMatchObject({
      noCumple: [{ texto, nota }],
      formato: { archivoId: Number(formato.id), hash: formato.hash_sha256, codigo: "SGC-FO-06", version: 1, margenSuperiorCm: 4.2, margenInferiorCm: 3.2 },
    });
  });

  it("el trámite de GBS, sin criterios, no deja constancia en sus eventos", async () => {
    const eventos = await sql`SELECT detalle FROM tramite_eventos
      WHERE tramite_id = ${(await tramiteDe(3)).id} AND tipo IN ('concepto_favorable', 'aprobar')`;
    expect(eventos).toHaveLength(2);
    for (const { detalle } of eventos) {
      expect(detalle).not.toHaveProperty("noCumple");
      expect(detalle).not.toHaveProperty("confirmoNoCumple");
    }
  });

  it("los datos congelados generan el acta en PDF, con las cuatro firmas", async () => {
    const t = await tramiteDe(1);
    const datos = await reunirDatosActa(t.id);
    expect(datos?.firmas.map((f) => f.firma)).toEqual(["Elaboró", "Revisó", "Aprobó", "Publicó"]);
    // Sin membrete, el formato congelado no llega: el aviso de «no se recibió el archivo» es lo esperado.
    const aviso = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(Buffer.from(await generarActa(datos!)).subarray(0, 5).toString()).toBe("%PDF-");
      expect(aviso).toHaveBeenCalled();
    } finally {
      aviso.mockRestore();
    }
  });

  it("en la segunda ronda firmó quien elabora, con la huella del archivo de cada ronda", async () => {
    const firmas = await firmasSembradas((await tramiteDe(2)).id);
    expect(firmas.map((f) => `${f.firma}:${f.ronda}`)).toEqual(["elaboro:1", "elaboro:2"]);
    expect(firmas[0].hashSha256).not.toBe(firmas[1].hashSha256);
  });

  it("la devolución deja la lista de la primera ronda, dos observaciones y su historial", async () => {
    const t = await tramiteDe(2);
    const lista = await sql`SELECT count(*)::int AS n FROM tramite_verificaciones WHERE tramite_id = ${t.id} AND ronda = 1`;
    expect(lista).toEqual([{ n: 8 }]);
    const sembrada = await sembradaEn(sql);
    const observaciones = (await listarObservaciones(t.id)).filter((o) => o.creadoEn <= sembrada);
    expect(observaciones.map((o) => `${o.numero}:${o.ronda}:${o.origen}`)).toEqual(["1:1:revision", "2:1:revision"]);
    const eventos = await sql`SELECT tipo, ronda, detalle FROM tramite_eventos
      WHERE tramite_id = ${t.id} AND creado_en <= ${sembrada} ORDER BY id`;
    expect(eventos.map((e) => `${e.tipo}:${e.ronda}`)).toEqual([
      "solicitar:0", "visto_bueno_automatico:0", "aceptar:1", "enviar_a_revision:1", "devolver_revision:2", "enviar_a_revision:2",
    ]);
    // `venceEn` (la fecha límite de la etapa que cierra) lo trae la demo sembrada desde la Tarea 12; su forma la prueba
    // «los detalles sembrados tienen la forma de los que escribe el flujo real».
    const { venceEn, ...devolucion } = eventos[4].detalle;
    expect(devolucion).toEqual({ observaciones: [1, 2] });
    expect(venceEn === undefined || typeof venceEn === "string").toBe(true);
  });

  it("el trámite de GBS omitió el visto bueno y llegó a publicación con tres firmas de una huella", async () => {
    const t = await tramiteDe(3);
    const firmas = await firmasSembradas(t.id);
    expect(firmas.map((f) => f.firma)).toEqual(["elaboro", "reviso", "aprobo"]);
    expect(new Set(firmas.map((f) => f.hashSha256)).size).toBe(1);
    const [archivo] = await sql`SELECT ruta FROM archivos WHERE version_id = ${t.version_id} AND rol = 'principal'`;
    expect(await huellaDeArchivo(archivo.ruta)).toBe(firmas[0].hashSha256);
    const [omitido] = await sql`SELECT usuario_id FROM tramite_eventos WHERE tramite_id = ${t.id} AND tipo = 'visto_bueno_omitido'`;
    expect(omitido).toEqual({ usuario_id: null });
  });

  it("la creación la pidió el líder: su visto bueno se dio solo", async () => {
    const t = await tramiteDe(4);
    const eventos = await sql`SELECT tipo FROM tramite_eventos
      WHERE tramite_id = ${t.id} AND creado_en <= ${await sembradaEn(sql)} ORDER BY id`;
    expect(eventos.map((e) => e.tipo)).toEqual(["solicitar", "visto_bueno_automatico"]);
  });

  it("las plantillas tienen PDF y editable en su versión 1", async () => {
    const archivos = await sql`SELECT d.codigo, a.rol, a.extension FROM documentos d
      JOIN documento_versiones v ON v.documento_id = d.id AND v.numero = 1
      JOIN archivos a ON a.version_id = v.id
      WHERE d.codigo IN ('SGC-FO-04', 'SGC-FO-05') ORDER BY d.codigo, a.rol`;
    expect(archivos.map((a) => `${a.codigo}:${a.rol}:${a.extension}`)).toEqual([
      "SGC-FO-04:editable:docx", "SGC-FO-04:principal:pdf", "SGC-FO-05:editable:docx", "SGC-FO-05:principal:pdf",
    ]);
  });

  it("la bitácora cuenta lo mismo que el historial", async () => {
    const eventos = await sql`SELECT e.tramite_id, e.tipo, e.usuario_id, e.creado_en, e.ronda
      FROM tramite_eventos e WHERE e.tramite_id IN (SELECT id FROM tramites ORDER BY id LIMIT 5)
        AND e.creado_en <= ${await sembradaEn(sql)}
        AND e.tipo NOT IN ('visto_bueno_automatico', 'visto_bueno_omitido')
      ORDER BY e.id`;
    expect(eventos.length).toBeGreaterThan(10);
    for (const e of eventos) {
      const [a] = await sql`SELECT usuario_id, creado_en, detalle FROM auditoria
        WHERE accion = ${`tramite_${e.tipo}`} AND entidad = 'tramite' AND entidad_id = ${e.tramite_id} AND creado_en = ${e.creado_en}`;
      expect(a, `${e.tipo} de ${e.tramite_id}`).toBeDefined();
      expect(a.usuario_id).toBe(e.usuario_id);
      expect(a.detalle.ronda).toBe(e.ronda);
      expect(a.detalle.acta).toBeUndefined();
    }
  });

  it("quien tiene el paso pendiente recibió su aviso", async () => {
    const avisos = await sql`SELECT u.usuario, n.titulo, n.enlace FROM notificaciones n JOIN usuarios u ON u.id = n.usuario_id
      WHERE n.tipo = 'tramite.paso' ORDER BY n.id LIMIT 3`;
    const enlace = async (consecutivo: number) => `/tramites/${(await tramiteDe(consecutivo)).id}`;
    expect(avisos.map((a) => [a.usuario, a.titulo.replace(/SOL-\d{4}-/, "SOL-"), a.enlace])).toEqual([
      ["coordinadora.sgc", "Solicitud SOL-002: le toca revisar", await enlace(2)],
      ["coordinadora.sgc", "Solicitud SOL-004 por aceptar", await enlace(4)],
      ["lider.cex", "Solicitud SOL-005 espera su visto bueno", await enlace(5)],
    ]);
  });

  it("los detalles sembrados tienen la forma de los que escribe el flujo real", (ctx) => revertida(sql, async (tx) => {
    // Desde la Tarea 12 el paso que cierra una etapa guarda su fecha límite; una demo sembrada antes no la trae.
    const [conLimite] = await tx`SELECT 1 FROM tramite_eventos WHERE tramite_id = ${(await tramiteDe(1, tx)).id} AND detalle ? 'venceEn' LIMIT 1`;
    exigirDemo(ctx, conLimite !== undefined, "los eventos sembrados no guardan la fecha límite de su etapa (venceEn), la demo es anterior a la Tarea 12");
    const gerente = await sesionDe(tx, "gerente");
    const { t, confirmaNoCumple } = await aprobacionConCriterio(tx, { tipoDocumento: "CA", aprobador: gerente });
    try {
      await transicionar(gerente, { tramiteId: t.tramiteId, accion: "aprobar", etapaEsperada: "aprobacion", rondaEsperada: 1, datos: { concepto: "Aprobado.", confirmaNoCumple }, credenciales: FIRMA }, opc(tx));
      await transicionar(t.admin, { tramiteId: t.tramiteId, accion: "publicar", etapaEsperada: "publicacion", rondaEsperada: 1, credenciales: FIRMA }, opc(tx));
      const claves = async (tramiteId: number) => {
        const eventos = await tx`SELECT tipo, detalle FROM tramite_eventos WHERE tramite_id = ${tramiteId} ORDER BY id`;
        return eventos.map((e) => [e.tipo, Object.keys(e.detalle).sort(), Object.keys(e.detalle.acta ?? {}).sort()]);
      };
      const sembrado = await tramiteDe(1, tx);
      expect(await claves(sembrado.id)).toEqual(await claves(t.tramiteId));
      // La semilla guarda una fecha real, no un nulo por un `previo` sin fecha límite.
      const limites = await tx`SELECT detalle -> 'venceEn' AS vence FROM tramite_eventos WHERE tramite_id = ${sembrado.id} AND detalle ? 'venceEn'`;
      expect(limites.length > 0 && limites.every((e) => typeof e.vence === "string")).toBe(true);
      const publicar = (await tx`SELECT detalle FROM tramite_eventos WHERE tramite_id = ${sembrado.id} AND tipo = 'publicar'`)[0];
      expect(publicar.detalle.acuses).toEqual({ creados: expect.any(Number), porFirma: expect.any(Number) });
    } finally {
      await t.limpiar();
    }
  }));
});

describe("el formato de acta de la demo", () => {
  const cm = (x: number) => (x * 72) / 2.54;

  it("sirve como formato, con el nombre que recibe, su título, su código y su versión", async () => {
    const bytes = await generarFormatoActaDemo("Entidad de prueba");
    expect(await motivoMembreteNoUtilizable(bytes)).toBeNull();
    const paginas = await contenidoPorPagina(bytes);
    expect(paginas).toHaveLength(1);
    for (const texto of ["Entidad de prueba", "ACTA DE CONTROL DOCUMENTAL", "SGC-FO-06", "Versión: 1"]) {
      expect(contieneTexto(paginas[0], texto), texto).toBe(true);
    }
  });

  it("deja el cuerpo en blanco: el encabezado llega hasta 4 cm y el pie empieza a 3 cm", async () => {
    const [pagina] = await contenidoPorPagina(await generarFormatoActaDemo("Una entidad con un nombre bastante largo para partirse en varias líneas"));
    const alturas = [...pagina.matchAll(/(-?[\d.]+) (-?[\d.]+) (?:Tm|m|l)\s/g)].map((m) => Number(m[2]));
    expect(alturas.length).toBeGreaterThan(10);
    expect(alturas.filter((y) => y < 792 - cm(4) && y > cm(3))).toEqual([]);
    expect(Math.max(...alturas.filter((y) => y <= cm(3)))).toBeGreaterThan(cm(2.5));
  });

  it("la demo lo trae elegido, con márgenes coherentes, y sirve", async (ctx) => {
    await exigirDemoIntacta(ctx, sql);
    const { formatoActa } = await obtenerConfigDocumental();
    const [d] = await sql`SELECT id FROM documentos WHERE codigo = 'SGC-FO-06'`;
    const revision = formatoActa.documentoId ? await revisarFormatoActa(formatoActa.documentoId) : null;
    exigirDemo(
      ctx,
      formatoActa.documentoId === Number(d?.id) && formatoActa.margenSuperiorCm === 4.2 && formatoActa.margenInferiorCm === 3.2 &&
        revision?.estado === "listo" && revision.version === 1,
      "se eligió otro formato del acta, otros márgenes u otra versión",
    );
    expect(formatoActa).toMatchObject({ margenSuperiorCm: 4.2, margenInferiorCm: 3.2 });
    expect(revision).toMatchObject({ estado: "listo", codigo: "SGC-FO-06", version: 1 });
    // Es el formato de la demo, y no un placeholder que también serviría.
    const [{ ruta }] = await sql`SELECT a.ruta FROM archivos a JOIN documento_versiones v ON v.id = a.version_id
      WHERE v.documento_id = ${d.id} AND a.rol = 'principal'`;
    const [pagina] = await contenidoPorPagina(await readFile(resolverRutaAlmacen(ruta)!));
    expect(contieneTexto(pagina, "Formato ficticio de la demostración")).toBe(true);
  });
});

describe("cómo está la demo", () => {
  it("los cinco trámites están en las etapas previstas", async (ctx) => {
    await exigirDemoIntacta(ctx, sql);
    const filas = await sql`SELECT numero, consecutivo, tipo, etapa, ronda FROM tramites ORDER BY id LIMIT 5`;
    expect(filas.map((f) => `${f.consecutivo}:${f.tipo}:${f.etapa}:${f.ronda}`)).toEqual([
      "1:modificar:publicado:1", "2:modificar:revision:2", "3:modificar:publicacion:1", "4:crear:aceptacion:0", "5:eliminar:visto_bueno:0",
    ]);
    expect(filas.every((f) => /^SOL-\d{4}-00[1-5]$/.test(f.numero))).toBe(true);
  });

  it("ningún paso sembrado tiene una hora futura, y los tipos PR y FO apuntan a su plantilla", async (ctx) => {
    await exigirDemoIntacta(ctx, sql);
    const sembrada = await sembradaEn(sql);
    const [{ futuros }] = await sql`SELECT count(*)::int AS futuros FROM tramite_eventos WHERE creado_en > ${sembrada}`;
    expect(futuros).toBe(0);
    const filas = await sql`SELECT t.sigla, d.codigo FROM tipos_documento t JOIN documentos d ON d.id = t.plantilla_documento_id ORDER BY t.sigla`;
    expect(filas.map((f) => `${f.sigla}:${f.codigo}`)).toEqual(["FO:SGC-FO-05", "PR:SGC-FO-04"]);
  });

  it("la versión 3 de la caracterización es la vigente y su acta aún no existe", async (ctx) => {
    await exigirDemoIntacta(ctx, sql);
    const t = await tramiteDe(1);
    const [v] = await sql`SELECT estado FROM documento_versiones WHERE id = ${t.version_id}`;
    expect(v.estado).toBe("vigente");
    const [acta] = await sql`SELECT 1 FROM archivos WHERE version_id = ${t.version_id} AND rol = 'acta_aprobacion'`;
    exigirDemo(ctx, acta === undefined, "ya se pidió el acta de la primera solicitud");
  });

  it("el acta nace la primera vez que se pide", async (ctx) => {
    const t = await tramiteDe(1);
    const [ya] = await sql`SELECT 1 FROM archivos WHERE version_id = ${t.version_id} AND rol = 'acta_aprobacion'`;
    exigirDemo(ctx, ya === undefined, "ya se pidió el acta de la primera solicitud");
    await revertida(sql, async (tx) => {
      const acta = await asegurarActa(t.id, { sql: tx });
      try {
        expect(acta?.ruta).toMatch(/^actas\/SOL-\d{4}-001\.pdf$/);
        // Sobre el formato sembrado: son los bytes de generarla con ese fondo.
        const datos = (await reunirDatosActa(t.id, { sql: tx }))!;
        const formato = await leerFormatoCongelado(datos.formato!, { sql: tx });
        expect(formato).not.toBeNull();
        expect(huella(await readFile(resolverRutaAlmacen(acta!.ruta)!))).toBe(huella(await generarActa(datos, formato)));
      } finally {
        // La fila se revierte con el test; el archivo se borra aquí.
        await rm(resolverRutaAlmacen(`actas/${t.numero}.pdf`)!, { force: true });
      }
    });
  });

  it("el trámite en revisión tiene el archivo de su última firma, sin concepto, y una observación por cerrar", async (ctx) => {
    const t = await comoSeSembro(ctx, 2);
    const firmas = await listarFirmas(t.id);
    expect(firmas.map((f) => `${f.firma}:${f.ronda}`)).toEqual(["elaboro:1", "elaboro:2"]);
    const [archivo] = await sql`SELECT ruta FROM archivos WHERE version_id = ${t.version_id} AND rol = 'principal'`;
    expect(await huellaDeArchivo(archivo.ruta)).toBe(firmas[1].hashSha256);
    const [v] = await sql`SELECT estado, numero FROM documento_versiones WHERE id = ${t.version_id}`;
    expect(v).toEqual({ estado: "borrador", numero: 2 });
    const observaciones = await listarObservaciones(t.id);
    exigirDemo(ctx, observaciones.length === 2 && observaciones[1].estado === "atendida", `${t.numero} ya cambió sus observaciones`);
    expect(observaciones.map((o) => `${o.numero}:${o.estado}`)).toEqual(["1:cerrada", "2:atendida"]);
    expect(observaciones.every((o) => o.respuesta)).toBe(true);
  });

  it("el trámite en publicación venció dos días antes de sembrar, y sus marcas no vienen de la siembra", async (ctx) => {
    const t = await comoSeSembro(ctx, 3);
    const sembrada = await sembradaEn(sql);
    expect(estadoPlazo(t.vence_en, sembrada, zonaHoraria())).toEqual({ estado: "vencido", dias: 2 });
    // Se siembran en NULL; la pasada corre con cualquier visita a la aplicación.
    expect([t.aviso_vencido_en, t.escalado_en].every((marca) => marca === null || marca > sembrada)).toBe(true);
  });

  it("la creación por aceptar venció el día en que se sembró", async (ctx) => {
    const t = await comoSeSembro(ctx, 4);
    expect(t.titulo_propuesto).toBe("Consentimiento informado de procedimientos menores");
    expect(t.documento_id).toBeNull();
    expect(estadoPlazo(t.vence_en, await sembradaEn(sql), zonaHoraria()).estado).toBe("vence_hoy");
    expect(t.vence_en).toEqual(fechaLimite(t.creado_en, 3, zonaHoraria()));
  });
});

describe("cada trámite se sigue con las funciones reales", () => {
  it("se puede leer", async () => {
    const admin = await sesionDe(sql, "coordinadora.sgc");
    for (const consecutivo of [1, 2, 3, 4, 5]) {
      const d = await obtenerTramite((await tramiteDe(consecutivo)).id, admin);
      expect(d).not.toBeNull();
      expect(d!.eventos.length).toBeGreaterThan(0);
    }
  });

  it("el vencido ofrece «Publicar», y el de visto bueno es tarea del líder", async (ctx) => {
    const admin = await sesionDe(sql, "coordinadora.sgc");
    const pub = await comoSeSembro(ctx, 3);
    expect((await obtenerTramite(pub.id, admin))!.acciones).toContain("publicar");
    const visto = await comoSeSembro(ctx, 5);
    const { tareas } = await misTareas(await sesionDe(sql, "lider.cex"));
    expect(tareas.some((x) => x.titulo === `Dar el visto bueno a ${visto.numero}`)).toBe(true);
  });

  it("el trámite en revisión llega hasta publicado", async (ctx) => {
    const { id: tramiteId } = await comoSeSembro(ctx, 2);
    await revertida(sql, async (tx) => {
      const admin = await sesionDe(tx, "coordinadora.sgc");
      const esperado = { etapa: "revision", ronda: 2 } as const;
      for (const o of await listarObservaciones(tramiteId, { sql: tx })) {
        if (o.estado === "atendida") await cerrarObservacion(o.id, admin, esperado, { sql: tx });
      }
      const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
      await guardarVerificacion(tramiteId, admin, items.map((i) => ({ itemId: i.id, resultado: "cumple" as const })), esperado, { sql: tx });
      await transicionar(admin, { tramiteId, accion: "concepto_favorable", etapaEsperada: "revision", rondaEsperada: 2, datos: { concepto: "Cumple; listo para aprobación." }, credenciales: FIRMA }, ahoraEn(tx));
      await expect(transicionar(admin, { tramiteId, accion: "aprobar_y_publicar", etapaEsperada: "aprobacion", rondaEsperada: 2, datos: { concepto: "Aprobado." }, credenciales: FIRMA }, ahoraEn(tx)))
        .resolves.toEqual({ etapa: "publicado", ronda: 2 });
    });
  });

  it("el trámite vencido se publica y deja cuatro firmas con la misma huella", async (ctx) => {
    const { id: tramiteId, version_id } = await comoSeSembro(ctx, 3);
    await revertida(sql, async (tx) => {
      const admin = await sesionDe(tx, "coordinadora.sgc");
      await expect(transicionar(admin, { tramiteId, accion: "publicar", etapaEsperada: "publicacion", rondaEsperada: 1, credenciales: FIRMA }, ahoraEn(tx)))
        .resolves.toEqual({ etapa: "publicado", ronda: 1 });
      const firmas = await listarFirmas(tramiteId, { sql: tx });
      expect(firmas).toHaveLength(4);
      expect(new Set(firmas.map((f) => f.hashSha256)).size).toBe(1);
      const [v] = await tx`SELECT estado, origen_aprobacion FROM documento_versiones WHERE id = ${version_id}`;
      expect(v).toEqual({ estado: "vigente", origen_aprobacion: "plataforma" });
    });
  });

  it("la pasada de vencimientos avisa del trámite vencido", async (ctx) => {
    const { id, numero } = await comoSeSembro(ctx, 3);
    const sembrada = await sembradaEn(sql);
    await revertida(sql, async (tx) => {
      await tx`UPDATE tramites SET aviso_vencido_en = NULL, escalado_en = NULL WHERE id = ${id}`;   // como quedó sembrado
      const { avisados } = await revisarVencimientos({ sql: tx, ahora: sembrada });
      expect(avisados).toBeGreaterThanOrEqual(1);
      const [fila] = await tx`SELECT aviso_vencido_en FROM tramites WHERE id = ${id}`;
      expect(fila.aviso_vencido_en).not.toBeNull();
      const [aviso] = await tx`SELECT titulo FROM notificaciones WHERE entidad_id = ${id} AND tipo = 'tramite.vencido' LIMIT 1`;
      expect(aviso.titulo).toContain(numero);
    });
  });

  it("la creación por aceptar recibe el código siguiente de su proceso y su tipo", async (ctx) => {
    const { id: tramiteId, proceso_id, tipo_documento_id, titulo_propuesto } = await comoSeSembro(ctx, 4);
    await revertida(sql, async (tx) => {
      const admin = await sesionDe(tx, "coordinadora.sgc");
      const liderCex = await sesionDe(tx, "lider.cex");
      const consulta = await sesionDe(tx, "consulta");
      const { codigoSugerido } = await datosParaAceptar(tramiteId, { sql: tx });
      const venceElaboracion = fechaEnZona(fechaLimite(new Date(), 15, zonaHoraria()), zonaHoraria());
      await expect(transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0, datos: {
        decision: "nuevo", tipoDocumentoId: Number(tipo_documento_id), asociaciones: [{ procesoId: Number(proceso_id), esPrincipal: true }],
        titulo: titulo_propuesto, relacionados: [], nivelAcceso: "general", venceElaboracion, codigo: codigoSugerido,
        elaboradorId: consulta.usuarioId, revisorId: liderCex.usuarioId, aprobadorId: admin.usuarioId,
      } }, ahoraEn(tx))).resolves.toEqual({ etapa: "elaboracion", ronda: 1 });
    });
  });

  it("la eliminación espera al líder y sigue hasta la aprobación de Gerencia", async (ctx) => {
    const { id: tramiteId } = await comoSeSembro(ctx, 5);
    await revertida(sql, async (tx) => {
      const admin = await sesionDe(tx, "coordinadora.sgc");
      const liderCex = await sesionDe(tx, "lider.cex");
      const gerente = await sesionDe(tx, "gerente");
      await transicionar(liderCex, { tramiteId, accion: "dar_visto_bueno", etapaEsperada: "visto_bueno", rondaEsperada: 0 }, ahoraEn(tx));
      await expect(transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0, datos: { aprobadorId: gerente.usuarioId } }, ahoraEn(tx)))
        .resolves.toEqual({ etapa: "aprobacion", ronda: 0 });
    });
  });
});
