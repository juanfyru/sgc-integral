/**
 * La distribución de la demo (spec 13B §16) contra la base sembrada: puntos de uso, copias en cada
 * estado, acuses de `GTH-CA-01` v3, la jornada y las dos verificaciones. Solo lee. Como el resto de
 * la demo, se salta si ya se usó (ver `utiles/demo.ts`).
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { exigirDemo, exigirDemoIntacta } from "./utiles/demo";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const CODIGO = "GTH-CA-01";

async function versionDe(numero: number) {
  const [v] = await sql`SELECT v.id, v.estado FROM documento_versiones v JOIN documentos d ON d.id = v.documento_id
    WHERE d.codigo = ${CODIGO} AND v.numero = ${numero}`;
  return v;
}

describe("distribución sembrada", () => {
  it("siete puntos de uso con su responsable y sus procesos, en la sede principal", async (ctx) => {
    const puntos = await sql`
      SELECT pu.nombre, pu.sede, u.usuario,
             (SELECT string_agg(p.sigla, ',' ORDER BY p.sigla) FROM punto_uso_procesos pp JOIN procesos p ON p.id = pp.proceso_id
               WHERE pp.punto_uso_id = pu.id) AS procesos
      FROM puntos_uso pu JOIN usuarios u ON u.id = pu.responsable_id ORDER BY pu.orden`;
    exigirDemo(ctx, puntos.length === 7, `hay ${puntos.length} puntos de uso`);
    expect(puntos.map((p) => [p.nombre, p.usuario, p.procesos])).toEqual([
      ["Urgencias", "jefe.urgencias", "AIN"],
      ["Farmacia", "regente.farmacia", "ATE"],
      ["Laboratorio", "consulta", "ADX"],
      ["Vacunación", "consulta", "PYM"],
      ["Odontología", "lider.cex", "CEX"],
      ["Talento Humano", "lider.gth", "GTH"],
      ["Archivo", "coordinadora.sgc", "GDO"],
    ]);
    expect(new Set(puntos.map((p) => p.sede))).toEqual(new Set(["Sede principal"]));
  });

  it("los usuarios nuevos y los procesos de cada quien", async () => {
    const filas = await sql`
      SELECT u.usuario, u.rol, c.nombre AS cargo, u.acepto_datos_en IS NOT NULL AS acepto,
             COALESCE((SELECT string_agg(p.sigla, ',' ORDER BY p.sigla) FROM usuario_procesos up JOIN procesos p ON p.id = up.proceso_id
               WHERE up.usuario_id = u.id), '') AS procesos
      FROM usuarios u LEFT JOIN cargos c ON c.id = u.cargo_id
      WHERE u.usuario IN ('consulta', 'coordinadora.sgc', 'jefe.urgencias', 'regente.farmacia', 'gerente', 'control.interno')
      ORDER BY u.usuario`;
    expect(filas.map((f) => [f.usuario, f.rol, f.cargo, f.procesos])).toEqual([
      ["consulta", "consulta", "Auxiliar de Enfermería", "AIN,CEX"],
      ["control.interno", "control_interno", "Jefe de Control Interno", ""],
      ["coordinadora.sgc", "admin_sgc", "Líder de Calidad", "SGC"],
      ["gerente", "gerencia", "Gerente", ""],
      ["jefe.urgencias", "consulta", "Enfermera Jefe", "AIN"],
      ["regente.farmacia", "consulta", "Regente de Farmacia", "ATE"],
    ]);
    expect(filas.every((f) => f.acepto)).toBe(true);
  });

  it("dos listas, «Todo el hospital» con todos los usuarios activos, y la audiencia de GTH-CA-01 con lectura obligatoria al ingreso", async (ctx) => {
    const listas = await sql`SELECT l.nombre, count(m.*)::int AS miembros, min(m.tipo) AS tipo
      FROM listas_distribucion l JOIN lista_miembros m ON m.lista_id = l.id GROUP BY l.id ORDER BY l.nombre`;
    // Desde la 13C, «Todo el hospital» tiene un solo miembro «todos» (spec 13C §17); una demo anterior la trae por áreas.
    const todos = listas.find((l) => l.nombre === "Todo el hospital");
    exigirDemo(ctx, listas.length === 2 && todos?.tipo === "todos", `hay ${listas.length} listas, o «Todo el hospital» no es la de la 13C`);
    expect(listas.map((l) => [l.nombre, l.miembros, l.tipo])).toEqual([
      ["Personal asistencial", 1, "area"],
      ["Todo el hospital", 1, "todos"],
    ]);
    const asignadas = await sql`SELECT l.nombre, d.lectura_obligatoria_ingreso AS obligatoria
      FROM documentos d JOIN documento_listas dl ON dl.documento_id = d.id JOIN listas_distribucion l ON l.id = dl.lista_id
      WHERE d.codigo = ${CODIGO}`;
    expect(asignadas.map((a) => [a.nombre, a.obligatoria])).toEqual([["Todo el hospital", true]]);
  });

  it("cuatro copias de GTH-CA-01: recibida, emitida vencida, por recoger y anulada", async (ctx) => {
    const copias = await sql`
      SELECT pu.nombre AS punto, v.numero AS version, cc.numero, cc.estado, cc.motivo_anulacion, cc.motivo_por_recoger,
             ue.usuario AS emitida_por, cc.vence_en < now() AS vencida, cc.recibida_en IS NOT NULL AS con_recibido
      FROM copias_controladas cc
      JOIN documento_versiones v ON v.id = cc.version_id JOIN documentos d ON d.id = v.documento_id
      JOIN puntos_uso pu ON pu.id = cc.punto_uso_id JOIN usuarios ue ON ue.id = cc.emitida_por
      WHERE d.codigo = ${CODIGO} ORDER BY pu.nombre`;
    // El recorrido manual confirma el recibido de Urgencias: entonces la demo ya avanzó.
    const urgenciasSembrada = copias.some((c) => c.punto === "Urgencias" && c.estado === "emitida");
    exigirDemo(ctx, copias.length === 4 && urgenciasSembrada, `GTH-CA-01 tiene ${copias.length} copias o la de Urgencias ya se recibió`);
    const por = Object.fromEntries(copias.map((c) => [c.punto, c]));
    expect(Object.keys(por).sort()).toEqual(["Archivo", "Talento Humano", "Urgencias", "Vacunación"]);

    const th = por["Talento Humano"];
    expect([th.version, th.numero, th.estado, th.emitida_por]).toEqual([3, 1, "recibida", "lider.gth"]);
    const urgencias = por.Urgencias;
    expect([urgencias.version, urgencias.numero, urgencias.estado, urgencias.emitida_por, urgencias.vencida, urgencias.con_recibido])
      .toEqual([3, 2, "emitida", "coordinadora.sgc", true, false]);
    const archivo = por.Archivo;
    expect([archivo.version, archivo.estado, archivo.motivo_por_recoger, archivo.con_recibido])
      .toEqual([2, "por_recoger", "nueva_version", true]);
    const vacunacion = por["Vacunación"];
    expect([vacunacion.version, vacunacion.numero, vacunacion.estado, vacunacion.motivo_anulacion])
      .toEqual([3, 3, "anulada", "error"]);
  });

  it("los acuses de la v3: por firma, individuales, por asistencia, y un pendiente vencido", async (ctx) => {
    const v3 = await versionDe(3);
    const acuses = await sql`SELECT u.usuario, a.origen, a.estado, a.modo, a.vence_en < now() AS vencido
      FROM acuses a JOIN usuarios u ON u.id = a.usuario_id WHERE a.version_id = ${v3.id} ORDER BY u.usuario`;
    const [{ audiencia }] = await sql`SELECT count(*)::int AS audiencia FROM usuarios WHERE activo AND cargo_id IS NOT NULL`;
    const pendienteSembrado = acuses.some((a) => a.usuario === "control.interno" && a.estado === "pendiente");
    exigirDemo(
      ctx,
      acuses.length === audiencia && v3.estado === "vigente" && pendienteSembrado,
      "los acuses de la v3 ya no son los sembrados",
    );
    expect(acuses.every((a) => a.origen === "publicacion")).toBe(true);

    const [publicar] = await sql`SELECT e.detalle FROM tramite_eventos e JOIN tramites t ON t.id = e.tramite_id
      WHERE t.documento_id = (SELECT id FROM documentos WHERE codigo = ${CODIGO}) AND e.tipo = 'publicar' ORDER BY e.id LIMIT 1`;
    const porFirma = acuses.filter((a) => a.modo === "firma");
    expect(publicar.detalle.acuses).toEqual({ creados: acuses.length, porFirma: porFirma.length });
    expect(porFirma.map((a) => a.usuario).sort()).toEqual(["coordinadora.sgc", "gerente", "lider.gth"]);

    const de = (usuario: string) => acuses.find((a) => a.usuario === usuario)!;
    expect([de("consulta").estado, de("consulta").modo]).toEqual(["confirmado", "individual"]);
    expect([de("jefe.urgencias").estado, de("jefe.urgencias").modo]).toEqual(["confirmado", "individual"]);
    expect([de("regente.farmacia").estado, de("regente.farmacia").modo]).toEqual(["confirmado", "asistencia"]);
    expect([de("lider.cex").estado, de("lider.cex").modo]).toEqual(["confirmado", "asistencia"]);

    const pendientes = acuses.filter((a) => a.estado === "pendiente");
    expect(pendientes.map((a) => a.usuario)).toEqual(["control.interno"]);
    expect(pendientes.filter((a) => a.vencido)).toHaveLength(1);
    expect(acuses.filter((a) => a.estado === "confirmado")).toHaveLength(acuses.length - 1);
  });

  it("una jornada de reunión de servicio con cuatro asistentes y su acta como evidencia", async (ctx) => {
    const jornadas = await sql`SELECT j.id, j.modalidad, u.usuario AS facilitador,
        (SELECT count(*)::int FROM jornada_asistentes ja WHERE ja.jornada_id = j.id) AS asistentes,
        (SELECT string_agg(d.codigo || ' v' || v.numero, ',') FROM jornada_versiones jv
           JOIN documento_versiones v ON v.id = jv.version_id JOIN documentos d ON d.id = v.documento_id
           WHERE jv.jornada_id = j.id) AS versiones
      FROM jornadas j JOIN usuarios u ON u.id = j.facilitador_id`;
    exigirDemo(ctx, jornadas.length === 1, `hay ${jornadas.length} jornadas`);
    const [j] = jornadas;
    expect([j.modalidad, j.facilitador, j.asistentes, j.versiones]).toEqual(["reunion_servicio", "lider.gth", 4, "GTH-CA-01 v3"]);
    const asistentes = await sql`SELECT u.usuario FROM jornada_asistentes ja JOIN usuarios u ON u.id = ja.usuario_id
      WHERE ja.jornada_id = ${j.id} ORDER BY u.usuario`;
    expect(asistentes.map((a) => a.usuario)).toEqual(["consulta", "jefe.urgencias", "lider.cex", "regente.farmacia"]);
    const evidencias = await sql`SELECT mime, extension FROM archivos WHERE contexto = 'jornada' AND contexto_id = ${j.id}`;
    expect(evidencias.map((f) => [f.mime, f.extension])).toEqual([["application/pdf", "pdf"]]);
  });

  it("Farmacia verificada conforme y Urgencias con un hallazgo abierto y vencido", async (ctx) => {
    const verificaciones = await sql`SELECT v.id, pu.nombre AS punto, v.estado, v.conforme, v.cerrada_en < now() - interval '15 days' AS antigua
      FROM verificaciones v JOIN puntos_uso pu ON pu.id = v.punto_uso_id ORDER BY pu.orden`;
    exigirDemo(ctx, verificaciones.length === 2 && verificaciones.every((v) => v.estado === "cerrada"), "las verificaciones ya no son las sembradas");
    const [urgencias, farmacia] = verificaciones;
    expect([urgencias.punto, urgencias.conforme, farmacia.punto, farmacia.conforme]).toEqual(["Urgencias", false, "Farmacia", true]);
    expect(farmacia.antigua).toBe(true);

    const items = await sql`SELECT verificacion_id, texto, respuesta, nota FROM verificacion_items ORDER BY verificacion_id, orden`;
    const deFarmacia = items.filter((i) => Number(i.verificacion_id) === Number(farmacia.id));
    expect(deFarmacia).toHaveLength(3);
    expect(deFarmacia.every((i) => i.respuesta === "conforme")).toBe(true);
    const noConformes = items.filter((i) => i.respuesta === "no_conforme");
    expect(noConformes.map((i) => [Number(i.verificacion_id), i.texto, i.nota])).toEqual([
      [Number(urgencias.id), "Sin copias no controladas (impresiones sin sello)", "Copia no controlada de AIN-FO-01"],
    ]);

    const hallazgos = await sql`SELECT h.estado, h.descripcion, u.usuario, h.vence_en < now() AS vencido
      FROM hallazgos h JOIN usuarios u ON u.id = h.responsable_id`;
    expect(hallazgos).toHaveLength(1);
    expect(hallazgos[0].estado).toBe("abierto");
    expect(hallazgos[0].usuario).toBe("jefe.urgencias");
    expect(hallazgos[0].descripcion).toContain("Copia no controlada de AIN-FO-01");
    expect(hallazgos[0].vencido).toBe(true);
  });

  it("la bitácora y las notificaciones de lo sembrado", async (ctx) => {
    await exigirDemoIntacta(ctx, sql);
    const acciones = await sql`SELECT DISTINCT accion FROM auditoria WHERE accion IN
      ('crear_punto_uso', 'crear_lista', 'copia_emitida', 'copia_anulada', 'acuse_lectura', 'jornada_registrada', 'verificacion_abierta', 'verificacion_cerrada')`;
    expect(acciones).toHaveLength(8);
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM notificaciones WHERE tipo LIKE 'distribucion.%'`;
    expect(n).toBeGreaterThan(0);
  });
});
