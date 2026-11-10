/**
 * La vigencia, los externos, el normograma y la revisión anual de la demo (spec 13C §17) contra la base sembrada:
 * el semáforo con vencidos, en atención y al día, las dos ratificaciones de meses atrás, los cuatro externos, las doce
 * normas con la derogación de la 2003 y sus impactos, la revisión anual abierta, la lista de todos y el formato del
 * informe. Solo lee: lo que prueba la guarda (`estadoDeLaDemo`) corre en transacciones que se revierten. Como el resto de
 * la demo, se salta si ya se usó (ver `utiles/demo.ts`); `SEMILLA_RECIEN=1` lo exige.
 */
import { existsSync, readFileSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it, vi, type TestContext } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { revisarFormatoActa } from "@/db/consultas/formato-acta";
import { resolverImpacto } from "@/db/consultas/normograma/impactos";
import { obtenerExterno, registrarVerificacion } from "@/db/consultas/vigencia/externos";
import { indicadoresDocumentales } from "@/db/consultas/vigencia/indicadores";
import { ratificar } from "@/db/consultas/vigencia/ratificaciones";
import { confirmarNormograma, formatoDelInforme, prorrogarRevision, revisionAbierta } from "@/db/consultas/vigencia/revision-anual";
import { pendientesPorProceso } from "@/db/consultas/vigencia/revision-anual/comun";
import { fijarProximaRevision, listarSemaforo, quitarFechaFijada } from "@/db/consultas/vigencia/semaforo";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { huellaDeArchivo } from "@/lib/huella";
import { fechaEnZona, fechaLimite } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { estadoDeLaDemo, exigirDemoIntacta, sembradaEn } from "./utiles/demo";
import { contenidoPorPagina, contieneTexto } from "./utiles/pdf";
import { sesionDe } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { firmaDePrueba } from "./utiles/vigencia";

const sql = obtenerSql();
const MS_DIA = 86_400_000;

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

/** Cuántos días antes de la siembra ocurrió `instante`. */
const diasAntes = (instante: Date, sembrada: Date) => (sembrada.getTime() - instante.getTime()) / MS_DIA;

async function documentoId(codigo: string): Promise<number> {
  const [d] = await sql`SELECT id FROM documentos WHERE codigo = ${codigo}`;
  if (!d) throw new Error(`La demo no trae ${codigo}`);
  return Number(d.id);
}

async function idDe(usuario: string): Promise<number> {
  const [u] = await sql`SELECT id FROM usuarios WHERE usuario = ${usuario}`;
  return Number(u.id);
}

const NORMAS = [
  "Decreto 1072 de 2015",
  "Decreto 780 de 2016",
  "Ley 100 de 1993",
  "Ley 1438 de 2011",
  "Ley 1581 de 2012",
  "Ley 527 de 1999",
  "Ley 594 de 2000",
  "Resolución 0312 de 2019",
  "Resolución 1995 de 1999",
  "Resolución 2003 de 2014",
  "Resolución 256 de 2016",
  "Resolución 3100 de 2019",
];

describe("vigencia sembrada", () => {
  it("el semáforo: vencidos GTH-PR-01, AIN-FO-01 y ATE-DE-01, en atención SGC-PR-01 y los demás al día o en trámite", async (ctx) => {
    await exigirDemoIntacta(ctx, sql);
    const ahora = await sembradaEn(sql);
    const admin = await sesionDe(sql, "coordinadora.sgc");
    const filas = await listarSemaforo(admin, { estado: "todos" }, { sql, ahora });
    const en = (estado: string) => filas.filter((f) => f.vigencia.estado === estado).map((f) => f.codigo).sort();

    expect(filas).toHaveLength(34);
    expect(en("vencida")).toEqual(["AIN-FO-01", "ATE-DE-01", "GTH-PR-01"]);
    expect(en("atencion")).toEqual(["SGC-PR-01"]);
    expect(en("en_tramite")).toEqual(["CEX-CA-01", "CEX-GU-01", "GBS-PR-01", "GTH-PR-02"]);
    expect(en("al_dia")).toHaveLength(26);
    // Ninguno sin desde cuándo contar: una vigente sin próxima revisión saldría en atención.
    expect(filas.every((f) => f.proximaRevision !== null)).toBe(true);

    const de = (codigo: string) => filas.find((f) => f.codigo === codigo)!;
    // La coordinadora la fijó a 83 días: dentro de los 90 de aviso.
    expect(de("SGC-PR-01").vigencia).toEqual({ estado: "atencion", dias: 83 });
    expect(de("SGC-PR-01").fijada).toMatchObject({ por: admin.nombre });
    // Los dos vencidos de la carga inicial vencen por su fecha de aprobación, de hace más de un año, sin fecha fijada.
    for (const codigo of ["GTH-PR-01", "AIN-FO-01"]) {
      expect(de(codigo).fijada, codigo).toBeNull();
      expect(de(codigo).ultimaRevision?.clase, codigo).toBe("aprobacion");
      expect(de(codigo).vigencia.dias!, codigo).toBeLessThan(0);
    }
    // El externo de la bomba de infusión vence por su adopción de hace 17 meses: nunca se verificó.
    expect(de("ATE-DE-01").ultimaRevision?.clase).toBe("adopcion");

    // La carga inicial: la coordinadora fijó la fecha de los internos aprobados fuera que no se ratificaron.
    const fijadas = filas.filter((f) => f.fijada !== null);
    // Los 24 internos aprobados fuera y no ratificados, salvo los dos vencidos, más SGC-PR-01.
    expect(fijadas).toHaveLength(25);
    expect(new Set(fijadas.map((f) => f.fijada!.por))).toEqual(new Set([admin.nombre]));
    expect(fijadas.every((f) => f.fijada!.nota.startsWith("Carga inicial"))).toBe(true);
    expect(fijadas.every((f) => f.origen === "interno")).toBe(true);
    expect(fijadas.map((f) => f.codigo)).not.toContain("GTH-FO-01");
    expect(fijadas.map((f) => f.codigo)).not.toContain("CEX-CA-01");
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM auditoria WHERE accion = 'fecha_revision_fijada'`;
    expect(n).toBe(fijadas.length);
  });

  it("dos ratificaciones de meses atrás, con la firma «Ratificó» sin trámite", async (ctx) => {
    await exigirDemoIntacta(ctx, sql);
    const sembrada = await sembradaEn(sql);
    const filas = await sql`
      SELECT d.codigo, v.numero, u.usuario, f.firma, f.ronda, f.tramite_id, f.creado_en AS firmada_en, f.hash_sha256,
        r.creado_en, r.nota, r.revision_anual_id, a.hash_sha256 AS huella
      FROM ratificaciones r
      JOIN firmas f ON f.id = r.firma_id
      JOIN usuarios u ON u.id = f.usuario_id
      JOIN documento_versiones v ON v.id = r.version_id
      JOIN documentos d ON d.id = v.documento_id
      JOIN archivos a ON a.version_id = v.id AND a.rol = 'principal'
      ORDER BY r.creado_en`;
    expect(filas.map((f) => [f.codigo, f.numero, f.usuario, f.firma, f.ronda, f.tramite_id, f.revision_anual_id])).toEqual([
      ["CEX-CA-01", 1, "lider.cex", "ratifico", 0, null, null],
      ["GTH-FO-01", 1, "lider.gth", "ratifico", 0, null, null],
    ]);
    for (const f of filas) {
      expect(diasAntes(f.creado_en, sembrada), f.codigo).toBeGreaterThan(90);
      expect(f.firmada_en).toEqual(f.creado_en);
      expect(f.hash_sha256).toBe(f.huella);
      expect(f.nota?.length ?? 0).toBeGreaterThan(5);
    }
    // La de Consulta Externa quedó fuera de la ventana de seis meses: entra a la revisión por decidir.
    expect(diasAntes(filas[0].creado_en, sembrada)).toBeGreaterThan(200);
    expect(diasAntes(filas[1].creado_en, sembrada)).toBeLessThan(180);
  });

  it("cuatro externos: CEX-DE-01 verificado al día, ATE-DE-01 vencido, SOG-DE-01 con una edición obsoleta y GTH-DE-01 enlazado a la 0312", async (ctx) => {
    await exigirDemoIntacta(ctx, sql);
    const sembrada = await sembradaEn(sql);
    const admin = await sesionDe(sql, "coordinadora.sgc");
    const codigos = await sql`SELECT d.codigo FROM documentos d JOIN externos ex ON ex.documento_id = d.id ORDER BY d.codigo`;
    expect(codigos.map((c) => c.codigo)).toEqual(["ATE-DE-01", "CEX-DE-01", "GTH-DE-01", "SOG-DE-01"]);
    const externo = async (codigo: string) => (await obtenerExterno(await documentoId(codigo), admin, { sql, ahora: sembrada }))!;

    const cex = await externo("CEX-DE-01");
    expect(cex.titulo).toContain("hipertensión arterial");
    expect(cex.control.entidadEmisora).toContain("Ministerio de Salud");
    expect(cex.control.responsable.id).toBe(await idDe("lider.cex"));
    expect(cex.vigente?.edicion).toBe("2017");
    expect(cex.verificaciones.map((v) => [v.resultado, v.version])).toEqual([["vigente", 1]]);
    const verificadaHace = diasAntes(cex.verificaciones[0].creadoEn, sembrada);
    expect(verificadaHace).toBeGreaterThan(260);
    expect(verificadaHace).toBeLessThan(280);
    expect(cex.vigencia.estado).toBe("al_dia");

    const ate = await externo("ATE-DE-01");
    expect(ate.titulo).toContain("bomba de infusión");
    expect(ate.control.responsable.id).toBe(await idDe("regente.farmacia"));
    expect(ate.vigente?.edicion).toBe("rev. 4.2");
    expect(ate.verificaciones).toEqual([]);
    const adoptadaHace = diasAntes(ate.vigente!.adoptadaEn, sembrada);
    expect(adoptadaHace).toBeGreaterThan(500);
    expect(adoptadaHace).toBeLessThan(540);
    expect(ate.vigencia.estado).toBe("vencida");

    const sog = await externo("SOG-DE-01");
    expect(sog.titulo).toContain("Resolución 3100 de 2019");
    expect(sog.control.responsable.id).toBe(admin.usuarioId);
    expect(sog.control.norma?.nombre).toBe("Resolución 3100 de 2019");
    expect(sog.ediciones.map((e) => [e.numero, e.edicion, e.estado])).toEqual([
      [2, "2019, corr.", "vigente"],
      [1, "2019", "obsoleto"],
    ]);
    expect(sog.vigencia.estado).toBe("al_dia");

    const gth = await externo("GTH-DE-01");
    expect(gth.titulo).toContain("SG-SST");
    expect(gth.control.responsable.id).toBe(await idDe("lider.gth"));
    expect(gth.control.norma?.nombre).toBe("Resolución 0312 de 2019");
    expect(gth.vigencia.estado).toBe("al_dia");

    // Cada edición adoptada tiene su PDF en el almacén, firmado «Adoptó» sin trámite con la huella del archivo.
    const adopciones = await sql`
      SELECT d.codigo, v.numero, f.ronda, f.tramite_id, f.hash_sha256, a.ruta, a.hash_sha256 AS huella, a.mime
      FROM firmas f
      JOIN documento_versiones v ON v.id = f.version_id
      JOIN documentos d ON d.id = v.documento_id
      JOIN archivos a ON a.version_id = v.id AND a.rol = 'principal'
      WHERE f.firma = 'adopto'
      ORDER BY d.codigo, v.numero`;
    expect(adopciones.map((a) => `${a.codigo} v${a.numero}`)).toEqual(["ATE-DE-01 v1", "CEX-DE-01 v1", "GTH-DE-01 v1", "SOG-DE-01 v1", "SOG-DE-01 v2"]);
    for (const a of adopciones) {
      expect([a.ronda, a.tramite_id, a.mime]).toEqual([0, null, "application/pdf"]);
      expect(a.hash_sha256).toBe(a.huella);
      expect(await huellaDeArchivo(a.ruta)).toBe(a.huella);
    }
    // Una copia controlada del manual de la bomba, recibida en Farmacia: la adopción de la edición nueva la pondrá «por recoger».
    const copias = await sql`SELECT pu.nombre AS punto, v.numero, cc.estado, ue.usuario AS emitio, cc.emitida_en
      FROM copias_controladas cc
      JOIN documento_versiones v ON v.id = cc.version_id JOIN documentos d ON d.id = v.documento_id
      JOIN puntos_uso pu ON pu.id = cc.punto_uso_id JOIN usuarios ue ON ue.id = cc.emitida_por
      WHERE d.origen = 'externo'`;
    expect(copias.map((x) => [x.punto, x.numero, x.estado, x.emitio])).toEqual([["Farmacia", 1, "recibida", "coordinadora.sgc"]]);
    // Después de la verificación de Farmacia de hace 95 días, que la encontró sin copias.
    expect(diasAntes(copias[0].emitida_en, sembrada)).toBeLessThan(95);
    // Son altas sin acuse, y la edición nueva de SOG-DE-01 no tiene audiencia: ningún acuse de un externo.
    const [{ acuses }] = await sql`SELECT count(*)::int AS acuses FROM acuses a
      JOIN documento_versiones v ON v.id = a.version_id JOIN documentos d ON d.id = v.documento_id WHERE d.origen = 'externo'`;
    expect(acuses).toBe(0);
  });

  it("doce normas; la Resolución 2003 de 2014 derogada por la 3100 con un impacto pendiente en CEX y otro «no afecta» en SOG", async (ctx) => {
    await exigirDemoIntacta(ctx, sql);
    const sembrada = await sembradaEn(sql);
    const normas = await sql`
      SELECT concat_ws(' ', tn.nombre, n.numero, 'de', n.anio::text) AS nombre, n.estado, n.estado_en::text AS estado_en,
        n.entidad_emisora, n.titulo, n.tema,
        (SELECT count(*)::int FROM norma_procesos np WHERE np.norma_id = n.id AND np.requisito IS NOT NULL) AS con_requisito,
        (SELECT count(*)::int FROM norma_documentos nd WHERE nd.norma_id = n.id) AS enlazados
      FROM normas n JOIN tipos_norma tn ON tn.id = n.tipo_norma_id`;
    expect(normas.map((n) => n.nombre).sort()).toEqual([...NORMAS].sort());
    for (const n of normas) {
      expect(n.entidad_emisora.length, n.nombre).toBeGreaterThan(5);
      expect(n.titulo.length, n.nombre).toBeGreaterThan(20);
      expect(n.tema?.length ?? 0, n.nombre).toBeGreaterThan(5);
      expect(n.con_requisito, n.nombre).toBeGreaterThanOrEqual(1);
    }
    expect(normas.filter((n) => n.enlazados > 0)).toHaveLength(12);
    const noVigentes = normas.filter((n) => n.estado !== "vigente").map((n) => [n.nombre, n.estado, n.estado_en]);
    expect(noVigentes).toEqual([["Resolución 2003 de 2014", "derogada", "2019-11-25"]]);

    const relaciones = await sql`
      SELECT r.id, r.tipo, concat_ws(' ', ta.nombre, a.numero, 'de', a.anio::text) AS norma,
        concat_ws(' ', tb.nombre, b.numero, 'de', b.anio::text) AS afectada
      FROM norma_relaciones r
      JOIN normas a ON a.id = r.norma_id JOIN tipos_norma ta ON ta.id = a.tipo_norma_id
      JOIN normas b ON b.id = r.afectada_id JOIN tipos_norma tb ON tb.id = b.tipo_norma_id
      WHERE r.eliminada_en IS NULL ORDER BY r.tipo`;
    expect(relaciones.map((r) => [r.tipo, r.norma, r.afectada])).toEqual([
      ["deroga", "Resolución 3100 de 2019", "Resolución 2003 de 2014"],
      ["reglamenta", "Resolución 3100 de 2019", "Decreto 780 de 2016"],
    ]);
    const cambios = await sql`SELECT c.estado_anterior, c.estado_nuevo, c.fecha::text AS fecha, c.relacion_id, c.creado_en,
        (SELECT count(*)::int FROM impactos_normativos i WHERE i.cambio_id = c.id) AS impactos
      FROM norma_cambios c`;
    expect(cambios.map((c) => [c.estado_anterior, c.estado_nuevo, c.fecha, Number(c.relacion_id), c.impactos])).toEqual([
      ["vigente", "derogada", "2019-11-25", Number(relaciones[0].id), 2],
    ]);

    const impactos = await sql`
      SELECT d.codigo, p.sigla, i.estado, i.resolucion, i.nota, i.vence_en, u.usuario AS resolvio
      FROM impactos_normativos i
      JOIN procesos p ON p.id = i.proceso_id
      LEFT JOIN documentos d ON d.id = i.documento_id
      LEFT JOIN usuarios u ON u.id = i.resuelto_por
      ORDER BY p.sigla`;
    expect(impactos.map((i) => [i.codigo, i.sigla, i.estado, i.resolucion, i.resolvio])).toEqual([
      ["CEX-GU-01", "CEX", "pendiente", null, null],
      [null, "SOG", "resuelto", "no_afecta", "coordinadora.sgc"],
    ]);
    // El pendiente aún está en plazo: la demo no amanece con un impacto vencido.
    expect(impactos[0].vence_en.getTime()).toBeGreaterThan(sembrada.getTime());
    expect(impactos[1].nota.length).toBeGreaterThanOrEqual(5);

    const enlaces = await sql`
      SELECT concat_ws(' ', tn.nombre, n.numero, 'de', n.anio::text) AS norma, d.codigo
      FROM norma_documentos nd JOIN normas n ON n.id = nd.norma_id JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
      JOIN documentos d ON d.id = nd.documento_id`;
    const pares = enlaces.map((e) => `${e.norma} → ${e.codigo}`);
    for (const par of [
      "Resolución 3100 de 2019 → SOG-DE-01",
      "Resolución 3100 de 2019 → GTH-FO-01",
      "Resolución 0312 de 2019 → GTH-DE-01",
      "Resolución 1995 de 1999 → AIN-PR-01",
      "Resolución 2003 de 2014 → CEX-GU-01",
    ]) {
      expect(pares).toContain(par);
    }
  });

  it("la revisión anual del año abierta hace una semana: GTH con su normograma confirmado, CEX a medias y AIN sin líder", async (ctx) => {
    await exigirDemoIntacta(ctx, sql);
    const sembrada = await sembradaEn(sql);
    const zona = zonaHoraria();
    const r = await revisionAbierta({ sql });
    expect(r).not.toBeNull();
    const anio = Number(fechaEnZona(sembrada, zona).slice(0, 4));
    expect([r!.anio, r!.plazoDias, r!.ventanaMeses]).toEqual([anio, 60, 6]);
    expect(fechaEnZona(r!.abiertaEn, zona)).toBe(fechaEnZona(fechaLimite(sembrada, -7, zona), zona));
    const [{ cerradas }] = await sql`SELECT count(*)::int AS cerradas FROM revisiones_anuales WHERE estado = 'cerrada'`;
    expect(cerradas).toBe(0);

    const decisiones = await sql`
      SELECT d.codigo, p.sigla, rad.decision, u.usuario, t.numero, t.etapa, t.motivo, t.revision_anual_id
      FROM revision_anual_decisiones rad
      JOIN documentos d ON d.id = rad.documento_id
      JOIN documento_proceso dp ON dp.documento_id = d.id AND dp.es_principal
      LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
      JOIN procesos p ON p.id = COALESCE(dp.proceso_id, s.proceso_id)
      LEFT JOIN usuarios u ON u.id = rad.usuario_id
      LEFT JOIN tramites t ON t.id = rad.tramite_id
      WHERE rad.revision_id = ${r!.id}
      ORDER BY d.codigo`;
    expect(decisiones).toHaveLength(34);
    const delProceso = (sigla: string) => decisiones.filter((x) => x.sigla === sigla).map((x) => [x.codigo, x.decision]);
    // GTH: lo publicado, lo ratificado y lo adoptado en la ventana entran revisados; GTH-PR-01, vencido, sigue por decidir.
    expect(delProceso("GTH")).toEqual([
      ["GTH-CA-01", "reciente"],
      ["GTH-DE-01", "reciente"],
      ["GTH-FO-01", "reciente"],
      ["GTH-PR-01", "sin_revisar"],
      ["GTH-PR-02", "en_tramite"],
    ]);
    expect(delProceso("CEX")).toEqual([
      ["CEX-CA-01", "actualizar"],
      ["CEX-DE-01", "sin_revisar"],
      ["CEX-GU-01", "en_tramite"],
    ]);
    const solicitud = decisiones.find((x) => x.codigo === "CEX-CA-01")!;
    expect([solicitud.usuario, solicitud.numero, solicitud.etapa, solicitud.motivo, Number(solicitud.revision_anual_id)]).toEqual([
      "lider.cex",
      `SOL-${anio}-006`,
      "aceptacion",
      "revision_anual",
      r!.id,
    ]);
    // La solicitud de la campaña nace después de SOL-…-005: el consecutivo y la fecha van en el mismo orden.
    const [quinta, sexta] = await sql`SELECT creado_en FROM tramites WHERE numero IN (${`SOL-${anio}-005`}, ${`SOL-${anio}-006`}) ORDER BY numero`;
    expect(sexta.creado_en.getTime()).toBeGreaterThan(quinta.creado_en.getTime());
    expect(sexta.creado_en.getTime()).toBeLessThan(sembrada.getTime());
    expect(delProceso("AIN").every(([, decision]) => decision === "sin_revisar")).toBe(true);
    // Fuera de GTH y CEX nadie decidió: lo que no es pendiente lo puso la foto (reciente o en trámite).
    const otras = decisiones.filter((x) => x.sigla !== "GTH" && x.sigla !== "CEX");
    expect(otras.every((x) => ["sin_revisar", "reciente", "en_tramite"].includes(x.decision) && x.usuario === null)).toBe(true);

    const pendientes = await pendientesPorProceso(sql, r!.id);
    const siglas = await sql`SELECT id, sigla FROM procesos`;
    const sigla = new Map(siglas.map((p) => [Number(p.id), p.sigla as string]));
    const de = (s: string) => pendientes.find((p) => sigla.get(p.procesoId) === s)!;
    expect([de("GTH").sinDecision, de("GTH").faltaNormograma]).toEqual([1, false]);
    expect([de("CEX").sinDecision, de("CEX").faltaNormograma]).toEqual([1, true]);
    expect([de("AIN").sinDecision, de("AIN").faltaNormograma]).toEqual([3, true]);
    expect(pendientes.filter((p) => !p.faltaNormograma).map((p) => sigla.get(p.procesoId))).toEqual(["GTH"]);

    const [normograma] = await sql`SELECT rap.normograma_resultado, u.usuario FROM revision_anual_procesos rap
      JOIN procesos p ON p.id = rap.proceso_id JOIN usuarios u ON u.id = rap.normograma_por
      WHERE rap.revision_id = ${r!.id} AND p.sigla = 'GTH'`;
    expect(normograma).toEqual({ normograma_resultado: "sin_novedad", usuario: "lider.gth" });
    const [{ lideres }] = await sql`SELECT count(*)::int AS lideres FROM usuario_procesos up
      JOIN usuarios u ON u.id = up.usuario_id AND u.activo AND u.rol = 'lider_proceso'
      JOIN procesos p ON p.id = up.proceso_id WHERE p.sigla = 'AIN'`;
    expect(lideres).toBe(0);
  });

  it("la lista «Todo el hospital» llega a todos los usuarios activos y el hallazgo de Urgencias sigue abierto", async (ctx) => {
    await exigirDemoIntacta(ctx, sql);
    const miembros = await sql`SELECT m.tipo, m.referencia_id FROM lista_miembros m
      JOIN listas_distribucion l ON l.id = m.lista_id WHERE l.nombre = 'Todo el hospital'`;
    expect(miembros).toEqual([{ tipo: "todos", referencia_id: null }]);
    const hallazgos = await sql`SELECT h.estado, pu.nombre FROM hallazgos h
      JOIN verificaciones v ON v.id = h.verificacion_id JOIN puntos_uso pu ON pu.id = v.punto_uso_id`;
    expect(hallazgos).toEqual([{ estado: "abierto", nombre: "Urgencias" }]);
  });

  it("el informe tiene su formato propio elegido, con sus márgenes, y sirve", async (ctx) => {
    await exigirDemoIntacta(ctx, sql);
    const id = await documentoId("SGC-FO-07");
    const { vigencia } = await obtenerConfigDocumental({ sql });
    expect(vigencia.formatoInforme).toEqual({ documentoId: id, margenSuperiorCm: 4.2, margenInferiorCm: 3.2 });
    expect(await revisarFormatoActa(id, { sql })).toMatchObject({ estado: "listo", codigo: "SGC-FO-07", version: 1 });
    expect(await formatoDelInforme(sql)).toMatchObject({ codigo: "SGC-FO-07", version: 1, margenSuperiorCm: 4.2, margenInferiorCm: 3.2 });
    const [{ ruta }] = await sql`SELECT a.ruta FROM archivos a JOIN documento_versiones v ON v.id = a.version_id
      WHERE v.documento_id = ${id} AND a.rol = 'principal'`;
    const [pagina] = await contenidoPorPagina(readFileSync(resolverRutaAlmacen(ruta)!));
    for (const texto of ["INFORME DE REVISIÓN ANUAL", "SGC-FO-07", "Formato ficticio de la demostración"]) {
      expect(contieneTexto(pagina, texto), texto).toBe(true);
    }
  });

  it("los indicadores miden los externos al día: tres de cuatro, con dato", async (ctx) => {
    await exigirDemoIntacta(ctx, sql);
    const sembrada = await sembradaEn(sql);
    const gerente = await sesionDe(sql, "gerente");
    const resultado = await indicadoresDocumentales(gerente, { periodo: "" }, { sql, ahora: sembrada });
    const externos = resultado!.indicadores.find((i) => i.clave === "externos")!;
    expect([externos.numerador, externos.denominador]).toEqual([3, 4]);
    expect(externos.valor).not.toBeNull();
    expect(externos.cumple).toBe(false);
    const vencidos = resultado!.indicadores.find((i) => i.clave === "vencidos")!;
    expect(vencidos.valor).toBe(3);
  });
});

describe("la guarda de la demo", () => {
  /** Si la demo seguiría intacta después de `paso`, hecho por el dominio dentro de una transacción que se revierte. */
  const intactaTras = (paso: (tx: TransactionSql) => Promise<unknown>) =>
    revertida(sql, async (tx) => {
      await paso(tx);
      return (await estadoDeLaDemo(tx)).intacta;
    });

  it("se entera de los pasos del recorrido que no crean filas: los casos de la demo saltan en vez de fallar", async (ctx) => {
    await exigirDemoIntacta(ctx, sql);
    const [{ id: revisionId }] = await sql`SELECT id FROM revisiones_anuales WHERE estado = 'abierta'`;
    const [{ id: impactoId }] = await sql`SELECT id FROM impactos_normativos WHERE estado = 'pendiente'`;
    const [{ id: cex }] = await sql`SELECT id FROM procesos WHERE sigla = 'CEX'`;
    const enUnMes = fechaEnZona(fechaLimite(new Date(), 30, zonaHoraria()), zonaHoraria());
    const pasos: Record<string, (tx: TransactionSql) => Promise<unknown>> = {
      "fijar la fecha de un vencido": async (tx) =>
        fijarProximaRevision(
          await sesionDe(tx, "coordinadora.sgc"),
          { documentoIds: [await documentoId("GTH-PR-01")], fecha: enUnMes, nota: "Prueba de la guarda" },
          { sql: tx },
        ),
      "quitar una fecha fijada": async (tx) => quitarFechaFijada(await sesionDe(tx, "coordinadora.sgc"), await documentoId("SGC-PR-01"), { sql: tx }),
      "ratificar un vencido": async (tx) =>
        ratificar(
          await sesionDe(tx, "lider.gth"),
          { documentoId: await documentoId("GTH-PR-01"), nota: null, credenciales: { clave: "ok" } },
          { sql: tx, verificar: firmaDePrueba },
        ),
      "verificar un externo": async (tx) =>
        registrarVerificacion(
          await sesionDe(tx, "regente.farmacia"),
          { documentoId: await documentoId("ATE-DE-01"), resultado: "vigente", fuente: "Portal del fabricante", nota: null },
          { sql: tx },
        ),
      "resolver el impacto pendiente": async (tx) =>
        resolverImpacto(
          await sesionDe(tx, "lider.cex"),
          { impactoId: Number(impactoId), resolucion: "no_afecta", nota: "Prueba de la guarda" },
          { sql: tx },
        ),
      "confirmar un normograma": async (tx) =>
        confirmarNormograma(
          await sesionDe(tx, "lider.cex"),
          { revisionId: Number(revisionId), procesoId: Number(cex), resultado: "sin_novedad", nota: null },
          { sql: tx },
        ),
      "prorrogar la revisión anual": async (tx) =>
        prorrogarRevision(await sesionDe(tx, "coordinadora.sgc"), { revisionId: Number(revisionId), dias: 15, motivo: "Prueba de la guarda" }, { sql: tx }),
    };
    for (const [nombre, paso] of Object.entries(pasos)) {
      expect(await intactaTras(paso), nombre).toBe(false);
    }
    // Sin tocar nada, sigue intacta.
    expect(await intactaTras(async () => {})).toBe(true);
  });

  it("tras ratificar, exigirDemoIntacta salta el caso con su aviso (con SEMILLA_RECIEN=1, falla a propósito)", async (ctx) => {
    await exigirDemoIntacta(ctx, sql);
    const skip = vi.fn();
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await revertida(sql, async (tx) => {
        await ratificar(
          await sesionDe(tx, "lider.gth"),
          { documentoId: await documentoId("GTH-PR-01"), nota: null, credenciales: { clave: "ok" } },
          { sql: tx, verificar: firmaDePrueba },
        );
        const llamada = exigirDemoIntacta({ skip } as unknown as TestContext, tx);
        if (process.env.SEMILLA_RECIEN === "1") {
          await expect(llamada).rejects.toThrow("SEMILLA_RECIEN=1, pero hay 3 ratificaciones (se sembraron 2)");
        } else {
          await llamada;
          expect(skip).toHaveBeenCalledWith(expect.stringContaining("3 ratificaciones (se sembraron 2)"));
        }
      });
    } finally {
      aviso.mockRestore();
    }
  });
});
