/**
 * Los trámites de la demo (spec 13A §18.2) contra la base ya sembrada: deben quedar como los
 * dejaría `transicionar` y poder seguir con las funciones reales. Solo lee: lo que avanza un
 * trámite o genera el acta corre en una transacción que se revierte.
 */
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { asegurarActa, reunirDatosActa } from "@/db/consultas/actas";
import { listarFirmas } from "@/db/consultas/firmas";
import { cerrarObservacion, guardarVerificacion, listarItemsVerificacion, listarObservaciones } from "@/db/consultas/revision";
import { obtenerTramite } from "@/db/consultas/tramites";
import { transicionar } from "@/db/consultas/tramites-flujo";
import { revisarVencimientos } from "@/db/consultas/vencimientos";
import { generarActa } from "@/lib/acta";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { huellaDeArchivo } from "@/lib/huella";
import { misTareas } from "@/lib/tareas";
import { estadoPlazo, fechaEnZona, fechaLimite } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { opc, sesionDe, tramiteEn } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
const FIRMA = { clave: "x" };

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

async function tramiteDe(consecutivo: number, cliente: Cliente = sql) {
  const [t] = await cliente`SELECT * FROM tramites WHERE consecutivo = ${consecutivo} ORDER BY id LIMIT 1`;
  return t;
}

/** El instante de la siembra: lo que «vence hoy» es hoy el día que se sembró, no el día del test. */
async function sembradaEn(): Promise<Date> {
  const [u] = await sql`SELECT creado_en FROM usuarios WHERE usuario = 'gerente'`;
  return u.creado_en;
}

/** Corre los pasos con la hora de verdad: las fechas sembradas salen del momento de sembrar. */
const ahoraEn = (tx: TransactionSql) => opc(tx, new Date().toISOString());

describe("los trámites de la demo", () => {
  it("la demo trae cinco trámites en las etapas previstas", async () => {
    const filas = await sql`SELECT numero, consecutivo, tipo, etapa, ronda FROM tramites ORDER BY id LIMIT 5`;
    expect(filas.map((f) => `${f.consecutivo}:${f.tipo}:${f.etapa}:${f.ronda}`)).toEqual([
      "1:modificar:publicado:1", "2:modificar:revision:2", "3:modificar:publicacion:1", "4:crear:aceptacion:0", "5:eliminar:visto_bueno:0",
    ]);
    expect(filas.every((f) => /^SOL-\d{4}-00[1-5]$/.test(f.numero))).toBe(true);
  });

  it("el número lleva el año en que se sembró", async () => {
    const t = await tramiteDe(1);
    const anio = fechaEnZona(await sembradaEn(), zonaHoraria()).slice(0, 4);
    expect(t.numero).toBe(`SOL-${anio}-001`);
    expect(String(t.anio)).toBe(anio);
  });

  it("el trámite publicado tiene sus cuatro firmas con una sola huella y la versión quedó en la plataforma", async () => {
    const t = await tramiteDe(1);
    const firmas = await listarFirmas(t.id);
    expect(firmas.map((f) => f.firma)).toEqual(["elaboro", "reviso", "aprobo", "publico"]);
    expect(new Set(firmas.map((f) => f.hashSha256)).size).toBe(1);
    const [v] = await sql`SELECT estado, origen_aprobacion, numero, elaboro, reviso, aprobo, publicado_en, resumen_cambios,
        fecha_elaboracion::text AS fecha_elaboracion, fecha_revision::text AS fecha_revision, fecha_aprobacion::text AS fecha_aprobacion
      FROM documento_versiones WHERE id = ${t.version_id}`;
    expect(v).toMatchObject({ estado: "vigente", origen_aprobacion: "plataforma", numero: 3 });
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
    expect(t.cerrado_en).toEqual(publico.creadoEn);
    expect(t.vence_en).toBeNull();
    expect([t.elaborador_id, t.revisor_id, t.aprobador_id, publico.usuarioId].map(Number)).toEqual(firmas.map((f) => f.usuarioId));

    const personas = await sql`SELECT usuario, id FROM usuarios WHERE usuario IN ('lider.gth', 'coordinadora.sgc', 'gerente')`;
    const id = Object.fromEntries(personas.map((p) => [p.usuario, Number(p.id)]));
    expect(firmas.map((f) => f.usuarioId)).toEqual([id["lider.gth"], id["coordinadora.sgc"], id.gerente, id["coordinadora.sgc"]]);

    const versiones = await sql`SELECT numero, estado FROM documento_versiones
      WHERE documento_id = ${t.documento_id} ORDER BY numero`;
    expect(versiones).toEqual([{ numero: 1, estado: "obsoleto" }, { numero: 2, estado: "obsoleto" }, { numero: 3, estado: "vigente" }]);
  });

  it("el evento de cierre lleva el acta congelada, con su versión, sus obsoletas y su huella", async () => {
    const t = await tramiteDe(1);
    const [e] = await sql`SELECT detalle FROM tramite_eventos WHERE tramite_id = ${t.id} AND tipo = 'publicar'`;
    const huella = (await listarFirmas(t.id))[0].hashSha256;
    expect(e.detalle).toMatchObject({ version: 3, obsoletas: [2], huella, acta: { clase: "aprobacion", versionObsoleta: 2, rondas: 1 } });
  });

  it("el acta del trámite publicado no se siembra: se genera sola, con la entidad de la demo", () => revertida(sql, async (tx) => {
    const t = await tramiteDe(1, tx);
    const [sembrada] = await tx`SELECT 1 FROM archivos WHERE version_id = ${t.version_id} AND rol = 'acta_aprobacion'`;
    expect(sembrada).toBeUndefined();
    const datos = await reunirDatosActa(t.id, { sql: tx });
    expect(datos?.firmas.map((f) => f.firma)).toEqual(["Elaboró", "Revisó", "Aprobó", "Publicó"]);
    expect(Buffer.from(await generarActa(datos!)).subarray(0, 5).toString()).toBe("%PDF-");

    const acta = await asegurarActa(t.id, { sql: tx });
    try {
      expect(acta?.ruta).toMatch(/^actas\/SOL-\d{4}-001\.pdf$/);
    } finally {
      // La fila se revierte con el test; el archivo se borra aquí.
      await rm(resolverRutaAlmacen(`actas/${t.numero}.pdf`)!, { force: true });
    }
  }));

  it("en la segunda ronda firma quien elabora con la huella del archivo de cada ronda, y nadie ha dado concepto", async () => {
    const t = await tramiteDe(2);
    const firmas = await listarFirmas(t.id);
    expect(firmas.map((f) => `${f.firma}:${f.ronda}`)).toEqual(["elaboro:1", "elaboro:2"]);
    expect(firmas[0].hashSha256).not.toBe(firmas[1].hashSha256);
    const [archivo] = await sql`SELECT ruta FROM archivos WHERE version_id = ${t.version_id} AND rol = 'principal'`;
    expect(await huellaDeArchivo(archivo.ruta)).toBe(firmas[1].hashSha256);
    const [v] = await sql`SELECT estado, numero FROM documento_versiones WHERE id = ${t.version_id}`;
    expect(v).toEqual({ estado: "borrador", numero: 2 });
  });

  it("la segunda ronda trae la lista de la primera y sus dos observaciones", async () => {
    const t = await tramiteDe(2);
    const lista = await sql`SELECT ronda, count(*)::int AS n FROM tramite_verificaciones WHERE tramite_id = ${t.id} GROUP BY ronda`;
    const [{ activos }] = await sql`SELECT count(*)::int AS activos FROM lista_verificacion_items WHERE activo`;
    expect(lista).toEqual([{ ronda: 1, n: activos }]);
    const observaciones = await listarObservaciones(t.id);
    expect(observaciones.map((o) => `${o.numero}:${o.estado}:${o.ronda}:${o.origen}`)).toEqual(["1:cerrada:1:revision", "2:atendida:1:revision"]);
    expect(observaciones.every((o) => o.respuesta)).toBe(true);
    const eventos = await sql`SELECT tipo, ronda, detalle FROM tramite_eventos WHERE tramite_id = ${t.id} ORDER BY id`;
    expect(eventos.map((e) => `${e.tipo}:${e.ronda}`)).toEqual([
      "solicitar:0", "visto_bueno_automatico:0", "aceptar:1", "enviar_a_revision:1", "devolver_revision:2", "enviar_a_revision:2",
    ]);
    expect(eventos[4].detalle).toEqual({ observaciones: [1, 2] });
  });

  it("el trámite en publicación omitió el visto bueno, tiene tres firmas y venció hace dos días sin avisar todavía", async () => {
    const t = await tramiteDe(3);
    const firmas = await listarFirmas(t.id);
    expect(firmas.map((f) => f.firma)).toEqual(["elaboro", "reviso", "aprobo"]);
    expect(new Set(firmas.map((f) => f.hashSha256)).size).toBe(1);
    const [archivo] = await sql`SELECT ruta FROM archivos WHERE version_id = ${t.version_id} AND rol = 'principal'`;
    expect(await huellaDeArchivo(archivo.ruta)).toBe(firmas[0].hashSha256);
    const [omitido] = await sql`SELECT usuario_id FROM tramite_eventos WHERE tramite_id = ${t.id} AND tipo = 'visto_bueno_omitido'`;
    expect(omitido).toEqual({ usuario_id: null });
    const sembrada = await sembradaEn();
    expect(estadoPlazo(t.vence_en, sembrada, zonaHoraria())).toEqual({ estado: "vencido", dias: 2 });
    // Se siembran en NULL; la pasada corre con cualquier visita a la aplicación, y la base también es la de las pruebas a mano.
    expect([t.aviso_vencido_en, t.escalado_en].every((marca) => marca === null || marca > sembrada)).toBe(true);
  });

  it("la creación por aceptar trae el visto bueno dado y vence hoy", async () => {
    const t = await tramiteDe(4);
    expect(t.titulo_propuesto).toBe("Consentimiento informado de procedimientos menores");
    expect(t.documento_id).toBeNull();
    const eventos = await sql`SELECT tipo FROM tramite_eventos WHERE tramite_id = ${t.id} ORDER BY id`;
    expect(eventos.map((e) => e.tipo)).toEqual(["solicitar", "visto_bueno_automatico"]);
    expect(estadoPlazo(t.vence_en, await sembradaEn(), zonaHoraria()).estado).toBe("vence_hoy");
    expect(t.vence_en).toEqual(fechaLimite(t.creado_en, 3, zonaHoraria()));
  });

  it("los tipos PR y FO tienen plantilla vigente", async () => {
    const filas = await sql`SELECT t.sigla, d.codigo FROM tipos_documento t JOIN documentos d ON d.id = t.plantilla_documento_id ORDER BY t.sigla`;
    expect(filas.map((f) => `${f.sigla}:${f.codigo}`)).toEqual(["FO:SGC-FO-05", "PR:SGC-FO-04"]);
    const archivos = await sql`SELECT d.codigo, a.rol, a.extension FROM documentos d
      JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente'
      JOIN archivos a ON a.version_id = v.id
      WHERE d.codigo IN ('SGC-FO-04', 'SGC-FO-05') ORDER BY d.codigo, a.rol`;
    expect(archivos.map((a) => `${a.codigo}:${a.rol}:${a.extension}`)).toEqual([
      "SGC-FO-04:editable:docx", "SGC-FO-04:principal:pdf", "SGC-FO-05:editable:docx", "SGC-FO-05:principal:pdf",
    ]);
  });

  it("la bitácora cuenta lo mismo que el historial", async () => {
    const eventos = await sql`SELECT e.tramite_id, e.tipo, e.usuario_id, e.creado_en, e.ronda
      FROM tramite_eventos e WHERE e.tramite_id IN (SELECT id FROM tramites ORDER BY id LIMIT 5)
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

  it("no hay ningún evento con una hora futura: la semilla escribe el pasado", async () => {
    const [{ futuros }] = await sql`SELECT count(*)::int AS futuros FROM tramite_eventos e
      WHERE e.creado_en > (SELECT creado_en FROM usuarios WHERE usuario = 'gerente')`;
    expect(futuros).toBe(0);
  });

  it("quien tiene el paso pendiente lo ve en su campana", async () => {
    const avisos = await sql`SELECT u.usuario, n.titulo, n.enlace FROM notificaciones n JOIN usuarios u ON u.id = n.usuario_id
      WHERE n.tipo = 'tramite.paso' ORDER BY n.id`;
    const enlace = async (consecutivo: number) => `/tramites/${(await tramiteDe(consecutivo)).id}`;
    expect(avisos.map((a) => [a.usuario, a.titulo.replace(/SOL-\d{4}-/, "SOL-"), a.enlace])).toEqual([
      ["coordinadora.sgc", "Solicitud SOL-002: le toca revisar", await enlace(2)],
      ["coordinadora.sgc", "Solicitud SOL-004 por aceptar", await enlace(4)],
      ["lider.cex", "Solicitud SOL-005 espera su visto bueno", await enlace(5)],
    ]);
  });
});

describe("con las funciones reales", () => {
  it("cada trámite sembrado se puede leer y seguir", async () => {
    const admin = await sesionDe(sql, "coordinadora.sgc");
    for (const consecutivo of [2, 3, 4, 5]) {
      const { id } = await tramiteDe(consecutivo);
      const d = await obtenerTramite(id, admin);
      expect(d).not.toBeNull();
      expect(d!.eventos.length).toBeGreaterThan(0);
    }
    const pub = await tramiteDe(3);
    expect((await obtenerTramite(pub.id, admin))!.acciones).toContain("publicar");
    expect((await misTareas(await sesionDe(sql, "lider.cex"))).some((x) => /Dar el visto bueno a SOL-\d{4}-005/.test(x.titulo))).toBe(true);
  });

  it("el trámite en revisión llega hasta publicado", () => revertida(sql, async (tx) => {
    const admin = await sesionDe(tx, "coordinadora.sgc");
    const { id: tramiteId } = await tramiteDe(2, tx);
    const esperado = { etapa: "revision", ronda: 2 } as const;
    const [abierta] = (await listarObservaciones(tramiteId, { sql: tx })).filter((o) => o.estado === "atendida");
    await cerrarObservacion(abierta.id, admin, esperado, { sql: tx });
    const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
    await guardarVerificacion(tramiteId, admin, items.map((i) => ({ itemId: i.id, resultado: "cumple" as const })), esperado, { sql: tx });
    await transicionar(admin, { tramiteId, accion: "concepto_favorable", etapaEsperada: "revision", rondaEsperada: 2, datos: { concepto: "Cumple; listo para aprobación." }, credenciales: FIRMA }, ahoraEn(tx));
    await expect(transicionar(admin, { tramiteId, accion: "aprobar_y_publicar", etapaEsperada: "aprobacion", rondaEsperada: 2, datos: { concepto: "Aprobado." }, credenciales: FIRMA }, ahoraEn(tx)))
      .resolves.toEqual({ etapa: "publicado", ronda: 2 });
  }));

  it("el trámite vencido se publica y deja cuatro firmas con la misma huella", () => revertida(sql, async (tx) => {
    const admin = await sesionDe(tx, "coordinadora.sgc");
    const { id: tramiteId, version_id } = await tramiteDe(3, tx);
    await expect(transicionar(admin, { tramiteId, accion: "publicar", etapaEsperada: "publicacion", rondaEsperada: 1, credenciales: FIRMA }, ahoraEn(tx)))
      .resolves.toEqual({ etapa: "publicado", ronda: 1 });
    const firmas = await listarFirmas(tramiteId, { sql: tx });
    expect(firmas).toHaveLength(4);
    expect(new Set(firmas.map((f) => f.hashSha256)).size).toBe(1);
    const [v] = await tx`SELECT estado, origen_aprobacion FROM documento_versiones WHERE id = ${version_id}`;
    expect(v).toEqual({ estado: "vigente", origen_aprobacion: "plataforma" });
  }));

  it("la pasada de vencimientos avisa del trámite vencido", () => revertida(sql, async (tx) => {
    const { id, numero } = await tramiteDe(3, tx);
    await tx`UPDATE tramites SET aviso_vencido_en = NULL, escalado_en = NULL WHERE id = ${id}`;   // como quedó sembrado
    const { avisados } = await revisarVencimientos({ sql: tx, ahora: await sembradaEn() });
    expect(avisados).toBeGreaterThanOrEqual(1);
    const [fila] = await tx`SELECT aviso_vencido_en FROM tramites WHERE id = ${id}`;
    expect(fila.aviso_vencido_en).not.toBeNull();
    const [aviso] = await tx`SELECT titulo FROM notificaciones WHERE entidad_id = ${id} AND tipo = 'tramite.vencido' LIMIT 1`;
    expect(aviso.titulo).toContain(numero);
  }));

  it("la creación por aceptar recibe el código siguiente de su proceso y su tipo", () => revertida(sql, async (tx) => {
    const admin = await sesionDe(tx, "coordinadora.sgc");
    const liderCex = await sesionDe(tx, "lider.cex");
    const consulta = await sesionDe(tx, "consulta");
    const { id: tramiteId, proceso_id, tipo_documento_id, titulo_propuesto } = await tramiteDe(4, tx);
    const venceElaboracion = fechaEnZona(fechaLimite(new Date(), 15, zonaHoraria()), zonaHoraria());
    await expect(transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0, datos: {
      decision: "nuevo", tipoDocumentoId: Number(tipo_documento_id), asociaciones: [{ procesoId: Number(proceso_id), esPrincipal: true }],
      titulo: titulo_propuesto, relacionados: [], nivelAcceso: "general", venceElaboracion, codigo: "CEX-FO-01",
      elaboradorId: consulta.usuarioId, revisorId: liderCex.usuarioId, aprobadorId: admin.usuarioId,
    } }, ahoraEn(tx))).resolves.toEqual({ etapa: "elaboracion", ronda: 1 });
  }));

  it("la eliminación espera al líder y sigue hasta la aprobación de Gerencia", () => revertida(sql, async (tx) => {
    const admin = await sesionDe(tx, "coordinadora.sgc");
    const liderCex = await sesionDe(tx, "lider.cex");
    const gerente = await sesionDe(tx, "gerente");
    const { id: tramiteId } = await tramiteDe(5, tx);
    await transicionar(liderCex, { tramiteId, accion: "dar_visto_bueno", etapaEsperada: "visto_bueno", rondaEsperada: 0 }, ahoraEn(tx));
    await expect(transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0, datos: { aprobadorId: gerente.usuarioId } }, ahoraEn(tx)))
      .resolves.toEqual({ etapa: "aprobacion", ronda: 0 });
  }));

  it("los detalles sembrados tienen la forma de los que escribe el flujo real", () => revertida(sql, async (tx) => {
    const gerente = await sesionDe(tx, "gerente");
    const t = await tramiteEn(tx, "publicacion", { codigo: "GTH-CA-01", aprobador: gerente });
    try {
      await transicionar(t.admin, { tramiteId: t.tramiteId, accion: "publicar", etapaEsperada: "publicacion", rondaEsperada: 1, credenciales: FIRMA }, opc(tx));
      const claves = async (tramiteId: number) => {
        const eventos = await tx`SELECT tipo, detalle FROM tramite_eventos WHERE tramite_id = ${tramiteId} ORDER BY id`;
        return eventos.map((e) => [e.tipo, Object.keys(e.detalle).sort(), Object.keys(e.detalle.acta ?? {}).sort()]);
      };
      const sembrado = await tramiteDe(1, tx);
      expect(await claves(sembrado.id)).toEqual(await claves(t.tramiteId));
    } finally {
      await t.limpiar();
    }
  }));
});
