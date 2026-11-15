/**
 * Los indicadores de la demo (spec 14 §22) contra la base sembrada: los ocho del SGC aprobados por Gerencia con sus
 * firmas, los de urgencias, talento humano, consulta externa y cartera, los estados de las fichas, los de las mediciones,
 * la meta programada, la observación sin respuesta, el cierre, la reapertura y los objetivos. Y los de la 14B (anexo §11):
 * `SGC-IND-03` calculado por el sistema desde su versión 2, la ficha de conformidad que da la meta a Distribución, la de
 * «Reportes a tiempo» con un periodo «No aplica» y otro en «Falta un dato», y las constancias de `CEX-IND-01`. Solo lee. Los
 * periodos salen del calendario de la siembra (`calendarioDeIndicadores`), contado desde su reloj. Como el resto de la
 * demo, se salta si ya se usó (ver `utiles/demo.ts`); `SEMILLA_RECIEN=1` lo exige.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { afterAll, describe, expect, it, type TestContext } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { fichaDeVersion, versionesDe } from "@/db/consultas/indicadores/aprobacion";
import { indicadoresQueExige } from "@/db/consultas/indicadores/busqueda";
import { mesPorOmision } from "@/db/consultas/indicadores/cierre";
import { listarMaestro } from "@/db/consultas/indicadores/maestros";
import { observacionesDe } from "@/db/consultas/indicadores/observaciones";
import { metaDeConformidad } from "@/db/consultas/indicadores/fichas-de-calculo";
import { tareasDeIndicadores } from "@/db/consultas/indicadores/tareas";
import { calendarioDeIndicadores, constanciasDeLaDemo } from "@/db/semillas/indicadores-demo-agenda";
import { SGC_CONFORMIDAD, SGC_REPORTES } from "@/db/semillas/indicadores-demo-fichas";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { aprobadoresDeFicha, puedeMedir, puedeVerIndicador } from "@/lib/alcance";
import { CALCULOS } from "@/lib/indicadores/calculos/registro";
import { estadoVisible } from "@/lib/indicadores/estados";
import { exigirDemo, sembradaEn } from "./utiles/demo";
import { sesionDe } from "./utiles/tramites";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

/** Código, nombre, variables A y B, meta, periodicidad y tipo de los ocho del Excel del usuario (spec 14.2). */
const DEL_SGC: [string, string, string, string, number, string, string][] = [
  ["SGC-IND-01", "Cumplimiento del Programa de Auditorías Internas", "Auditorías internas ejecutadas", "Auditorías internas programadas", 90, "trimestral", "Eficacia"],
  ["SGC-IND-02", "Eficacia de Acciones Correctivas", "Acciones correctivas eficaces", "Acciones correctivas evaluadas", 80, "trimestral", "Eficacia"],
  ["SGC-IND-03", "Cumplimiento de Objetivos de Calidad", "Objetivos de calidad cumplidos", "Objetivos de calidad definidos", 80, "semestral", "Eficacia"],
  ["SGC-IND-04", "Cumplimiento de la Revisión por la Dirección", "Revisiones realizadas", "Revisiones programadas", 100, "anual", "Eficacia"],
  ["SGC-IND-05", "Control de Información Documentada", "Documentos conformes", "Documentos revisados", 90, "trimestral", "Eficiencia"],
  ["SGC-IND-06", "Cumplimiento del Plan de Capacitación en Calidad", "Capacitaciones ejecutadas", "Capacitaciones programadas", 80, "trimestral", "Eficacia"],
  ["SGC-IND-07", "Gestión de Riesgos y Oportunidades", "Acciones de riesgo implementadas", "Acciones de riesgo planificadas", 70, "trimestral", "Eficacia"],
  ["SGC-IND-08", "Oportunidad de Cierre de No Conformidades", "No conformidades cerradas a tiempo", "No conformidades con plazo vencido o cerradas", 75, "trimestral", "Efectividad"],
];

/**
 * Los diecinueve indicadores sembrados con el estado en que se sembraron (con el de rangos, los dos del lote importado y,
 * desde la 14B, las dos fichas automáticas nuevas del SGC).
 */
const SEMBRADOS: Record<string, string> = {
  "CNT-ID-001": "activo",
  "TSR-ID-001": "activo",
  "GRF-ID-001": "borrador",
  [SGC_REPORTES.codigo]: "activo",
  [SGC_CONFORMIDAD.codigo]: "activo",
  "AIN-IND-01": "activo",
  "CEX-IND-01": "activo",
  "GRF-IND-01": "borrador",
  "GTH-IND-01": "activo",
  "GTH-IND-02": "borrador",
  ...Object.fromEntries(DEL_SGC.map(([codigo]) => [codigo, "activo"])),
  "SGC-IND-09": "retirado",
};

/**
 * Si lo sembrado en los indicadores sigue como se sembró: cada paso sembrado ocurrió antes del reloj de la siembra, y lo
 * que se hace después (reportar, analizar, observar, cambiar una ficha, programar una meta, designar, retirar, cerrar un
 * mes) queda con su hora. Mira solo los indicadores sembrados: los que se crean después no cambian lo sembrado. Lo que no
 * deja hora se compara con las cifras sembradas, como `SEMBRADO` en `utiles/demo.ts`: los diecinueve códigos con su estado
 * (un borrador se puede borrar), el único restringido y los cinco objetivos activos. Las constancias de envío también se
 * cuentan, no se fechan: el soporte de la registrada lo sube `registrarArchivo`, que escribe su evento con la hora del
 * reloj, y por eso la siembra la registra después, también con la hora del reloj (`sembrarConstancias`).
 */
async function indicadoresComoSeSembraron(): Promise<{ intacta: boolean; motivo: string }> {
  const t = await sembradaEn(sql);
  const plan = constanciasDeLaDemo(t);
  const estados = new Map((await sql`SELECT codigo, estado FROM indicadores WHERE codigo IN ${sql(Object.keys(SEMBRADOS))}`).map((f) => [
    f.codigo as string,
    f.estado as string,
  ]));
  const [objetivos] = await sql`SELECT count(*)::int AS total, count(*) FILTER (WHERE activo)::int AS activos FROM objetivos`;
  const [c] = await sql`
    WITH ind AS (SELECT id FROM indicadores WHERE creado_en <= ${t}),
      ver AS (SELECT id FROM indicador_versiones WHERE indicador_id IN (SELECT id FROM ind)),
      med AS (SELECT id FROM mediciones WHERE indicador_id IN (SELECT id FROM ind))
    SELECT
      (SELECT count(*)::int FROM indicador_versiones WHERE indicador_id IN (SELECT id FROM ind) AND (creado_en > ${t} OR actualizado_en > ${t})) AS versiones,
      (SELECT count(*)::int FROM firmas WHERE indicador_version_id IN (SELECT id FROM ver) AND creado_en > ${t}) AS firmas,
      (SELECT count(*)::int FROM medicion_eventos WHERE medicion_id IN (SELECT id FROM med) AND creado_en > ${t}) AS eventos,
      (SELECT count(*)::int FROM medicion_observaciones WHERE medicion_id IN (SELECT id FROM med) AND creado_en > ${t}) AS observaciones,
      (SELECT count(*)::int FROM indicador_metas WHERE indicador_id IN (SELECT id FROM ind) AND programada_en > ${t}) AS metas,
      (SELECT count(*)::int FROM indicador_designados WHERE indicador_id IN (SELECT id FROM ind) AND creado_en > ${t}) AS designados,
      (SELECT count(*)::int FROM indicadores WHERE id IN (SELECT id FROM ind) AND baja_en > ${t}) AS bajas,
      (SELECT count(*)::int FROM cierres_indicadores WHERE cerrado_en > ${t}) AS cierres,
      (SELECT coalesce(string_agg(codigo, ', ' ORDER BY codigo), '') FROM indicadores
        WHERE id IN (SELECT id FROM ind) AND nivel_acceso = 'restringido') AS restringidos`;
  const cambios = ["versiones", "firmas", "eventos", "observaciones", "metas", "designados", "bajas", "cierres"]
    .filter((clave) => Number(c[clave]) > 0)
    .map((clave) => `${c[clave]} ${clave} posteriores a la siembra`);
  if (c.restringidos !== "GTH-IND-01") cambios.push(`los restringidos son «${c.restringidos}» (se sembró solo GTH-IND-01)`);
  // Solo las de los indicadores sembrados: lo que otro test deje en los suyos no cambia lo sembrado.
  const [r] = await sql`
    WITH ind AS (SELECT id FROM indicadores WHERE codigo IN ${sql(Object.keys(SEMBRADOS))}),
      rep AS (SELECT id, estado FROM reportes_externos WHERE indicador_id IN (SELECT id FROM ind))
    SELECT
      (SELECT count(*)::int FROM rep WHERE estado = 'registrada') AS registradas,
      (SELECT count(*)::int FROM rep WHERE estado = 'pendiente') AS pendientes,
      (SELECT count(*)::int FROM reporte_externo_eventos WHERE reporte_id IN (SELECT id FROM rep)) AS eventos,
      (SELECT count(*)::int FROM impactos_indicadores WHERE indicador_id IN (SELECT id FROM ind)) AS impactos`;
  // Una registrada con su soporte (dos eventos: el soporte y el registro); las demás, pendientes; ninguna revisión por norma.
  const sembradas: [string, number, string][] = [
    ["registradas", 1, "constancias registradas"],
    ["pendientes", plan.periodos.length - 1, "constancias pendientes"],
    ["eventos", 2, "eventos de constancias"],
    ["impactos", 0, "revisiones de indicadores por cambio de norma"],
  ];
  for (const [clave, n, nombre] of sembradas) {
    if (Number(r[clave]) !== n) cambios.push(`${r[clave]} ${nombre} (se sembraron ${n})`);
  }
  for (const [codigo, estado] of Object.entries(SEMBRADOS)) {
    if (estados.get(codigo) !== estado) cambios.push(`${codigo} está ${estados.get(codigo) ?? "borrado"} (se sembró ${estado})`);
  }
  if (objetivos.total !== 5 || objetivos.activos !== 5) cambios.push(`${objetivos.activos} de ${objetivos.total} objetivos activos (se sembraron 5 activos)`);
  return { intacta: cambios.length === 0, motivo: cambios.length === 0 ? "los indicadores están como se sembraron" : `hay ${cambios.join("; ")}` };
}

async function exigirIndicadores(ctx: TestContext): Promise<void> {
  const { intacta, motivo } = await indicadoresComoSeSembraron();
  exigirDemo(ctx, intacta, motivo);
}

async function indicador(codigo: string) {
  const [i] = await sql`SELECT i.*, p.sigla FROM indicadores i JOIN procesos p ON p.id = i.proceso_id WHERE i.codigo = ${codigo}`;
  if (!i) throw new Error(`La demo no trae ${codigo}`);
  return i;
}

const versiones = async (indicadorId: number) =>
  [...(await sql`SELECT * FROM indicador_versiones WHERE indicador_id = ${indicadorId} ORDER BY numero`)];

/** La versión aprobada de mayor número: la ficha vigente. */
async function vigente(indicadorId: number) {
  const aprobadas = (await versiones(indicadorId)).filter((v) => v.estado === "aprobada");
  return aprobadas[aprobadas.length - 1];
}

async function medicion(codigo: string, periodo: string) {
  const [m] = await sql`SELECT m.* FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id
    WHERE i.codigo = ${codigo} AND m.periodo = ${periodo}`;
  if (!m) throw new Error(`${codigo} no tiene medición de ${periodo}`);
  return m;
}

/** Los valores reportados de la medición, por letra. */
async function valores(medicionId: number): Promise<Record<string, number>> {
  const filas = await sql`SELECT iv.letra, mv.valor FROM medicion_valores mv JOIN indicador_variables iv ON iv.id = mv.variable_id
    WHERE mv.medicion_id = ${medicionId}`;
  return Object.fromEntries(filas.map((f) => [f.letra as string, Number(f.valor)]));
}

const designados = async (indicadorId: number, funcion: string) =>
  (await sql`SELECT u.usuario FROM indicador_designados d JOIN usuarios u ON u.id = d.usuario_id
    WHERE d.indicador_id = ${indicadorId} AND d.funcion = ${funcion} ORDER BY u.usuario`).map((f) => f.usuario as string);

const largo = (texto: unknown) => (typeof texto === "string" ? texto.trim().length : 0);

describe("indicadores sembrados", () => {
  it("están los ocho indicadores del proceso SGC, aprobados por Gerencia", async (ctx) => {
    await exigirIndicadores(ctx);
    const admin = await sesionDe(sql, "coordinadora.sgc");
    const gerente = await sesionDe(sql, "gerente");
    for (const [codigo, nombre, a, b, meta, periodicidad, tipo] of DEL_SGC) {
      const i = await indicador(codigo);
      expect(i.sigla, codigo).toBe("SGC");
      expect(i.estado, codigo).toBe("activo");
      const v = await vigente(i.id);
      expect(v, codigo).toMatchObject({
        nombre,
        forma: "porcentaje",
        formula: "A / B * 100",
        periodicidad,
        tendencia: "ascendente",
        semaforo_modo: "rangos",
        tipo_nombre: tipo,
        clasificacion_nombre: "Estratégico",
      });
      expect(Number(v.meta), codigo).toBe(meta);
      const variables = await sql`SELECT letra, nombre FROM indicador_variables WHERE version_id = ${v.id} ORDER BY letra`;
      const [v1] = await versiones(i.id);
      const v1Variables = await sql`SELECT letra, nombre FROM indicador_variables WHERE version_id = ${v1.id} ORDER BY letra`;
      // Las del Excel quedan en la versión 1. `SGC-IND-03` lo calcula el sistema desde su versión 2 (anexo 14B, §11): su
      // vigente lleva las variables del registro de cálculos y nadie la mide (la aprobación quitó a quien medía).
      expect(v1Variables.map((x) => [x.letra, x.nombre]), codigo).toEqual([["A", a], ["B", b]]);
      if (codigo === "SGC-IND-03") {
        const registro = CALCULOS.objetivos_cumplidos.variables.map((x) => [x.letra, x.nombre]);
        expect(variables.map((x) => [x.letra, x.nombre]), codigo).toEqual(registro);
        expect(await designados(i.id, "mide"), codigo).toEqual([]);
      } else {
        expect(variables.map((x) => [x.letra, x.nombre]), codigo).toEqual([["A", a], ["B", b]]);
        expect(await designados(i.id, "mide"), codigo).toEqual(["coordinadora.sgc"]);
      }

      // La ficha impresa y el Excel leen las firmas de la versión: «Elaboró» sobre su huella y «Aprobó».
      expect(v1, codigo).toMatchObject({ numero: 1, tipo_cambio: "inicial", estado: "aprobada" });
      const ficha = await fichaDeVersion(admin, v1.id, { sql });
      expect(ficha?.firmas.elaboro?.nombre, codigo).toBe(admin.nombre);
      expect(ficha?.firmas.aprobo?.nombre, codigo).toBe(gerente.nombre);
    }
  });

  it("hay un indicador de urgencias medido por alguien de rol Consulta, uno restringido, uno regulatorio con su norma y uno de cartera en su subproceso", async (ctx) => {
    await exigirIndicadores(ctx);
    const consulta = await sesionDe(sql, "consulta");

    const ain = await indicador("AIN-IND-01");
    expect(ain.estado).toBe("activo");
    const vAin = await vigente(ain.id);
    expect(vAin).toMatchObject({
      nombre: "Tiempo de espera en triage II",
      subproceso_nombre: "Urgencias",
      unidad_nombre: "Minutos",
      forma: "razon",
      periodicidad: "mensual",
      tendencia: "descendente",
    });
    expect(Number(vAin.meta)).toBe(30);
    const jefe = await sesionDe(sql, "jefe.urgencias");
    expect(jefe.rol).toBe("consulta");
    expect(await designados(ain.id, "mide")).toEqual(["jefe.urgencias"]);
    // Reporta como designado, sin ser líder ni Admin SGC.
    expect(await puedeMedir(ain.id, jefe, { sql })).toEqual({ puede: true, sinMedidor: false });

    const gth = await indicador("GTH-IND-01");
    expect(gth).toMatchObject({ estado: "activo", nivel_acceso: "restringido" });
    const vGth = await vigente(gth.id);
    expect(vGth).toMatchObject({ nombre: "Rotación de personal", periodicidad: "trimestral", tendencia: "descendente" });
    expect(Number(vGth.meta)).toBe(5);
    expect(await designados(gth.id, "mide")).toEqual(["lider.gth"]);
    expect(await puedeVerIndicador(gth.id, consulta, { sql })).toBe(false);
    expect(await puedeVerIndicador(gth.id, await sesionDe(sql, "lider.gth"), { sql })).toBe(true);

    const cex = await indicador("CEX-IND-01");
    expect(cex.estado).toBe("activo");
    const vCex = await vigente(cex.id);
    expect(vCex).toMatchObject({
      nombre: "Oportunidad en la asignación de cita de medicina general",
      clasificacion_nombre: "Regulatorio",
      unidad_nombre: "Días",
      periodicidad: "mensual",
      tendencia: "descendente",
    });
    expect(Number(vCex.meta)).toBe(3);
    expect((await sql`SELECT norma_nombre FROM indicador_normas WHERE version_id = ${vCex.id}`).map((n) => n.norma_nombre)).toEqual([
      "Resolución 256 de 2016",
    ]);
    expect(await designados(cex.id, "mide")).toEqual(["lider.cex"]);
    // En el Normograma, «Indicadores que exige».
    const [norma] = await sql`SELECT id FROM normas WHERE numero = '256' AND anio = 2016`;
    // Solo entre los sembrados: aprobar después otro que la cite no cambia lo sembrado.
    const exige = (await indicadoresQueExige(consulta, Number(norma.id), { sql })).map((x) => x.codigo);
    expect(exige.filter((codigo) => Object.hasOwn(SEMBRADOS, codigo))).toEqual(["CEX-IND-01"]);

    const grf = await indicador("GRF-IND-01");
    const [vGrf] = await versiones(grf.id);
    expect(vGrf).toMatchObject({ nombre: "Recaudo de cartera corriente", subproceso_nombre: "Gestión de Cartera", periodicidad: "mensual" });
  });

  it("hay una ficha por aprobar, un borrador, un retirado y uno con versión 2", async (ctx) => {
    await exigirIndicadores(ctx);
    const admin = await sesionDe(sql, "coordinadora.sgc");
    const gerente = await sesionDe(sql, "gerente");
    const liderGth = await sesionDe(sql, "lider.gth");

    // Por aprobar: lo operativo de GTH lo aprueba su líder.
    const porAprobar = await indicador("GTH-IND-02");
    const [vPor] = await versiones(porAprobar.id);
    expect(porAprobar.estado).toBe("borrador");
    expect(vPor).toMatchObject({ nombre: "Cumplimiento del plan de capacitación institucional", estado: "por_aprobar", tipo_cambio: "inicial" });
    expect(await aprobadoresDeFicha(vPor.id, { sql })).toEqual([liderGth.usuarioId]);

    // Borrador: nunca se envió.
    const borrador = await indicador("GRF-IND-01");
    expect(borrador.estado).toBe("borrador");
    expect((await versiones(borrador.id)).map((v) => v.estado)).toEqual(["borrador"]);
    expect(await sql`SELECT 1 FROM firmas f JOIN indicador_versiones v ON v.id = f.indicador_version_id WHERE v.indicador_id = ${borrador.id}`).toHaveLength(0);

    // Retirado, con su motivo; antes estuvo aprobado.
    const retirado = await indicador("SGC-IND-09");
    expect(retirado.estado).toBe("retirado");
    expect(Number(retirado.baja_por)).toBe(admin.usuarioId);
    expect(largo(retirado.baja_motivo)).toBeGreaterThanOrEqual(5);
    expect((await versiones(retirado.id)).map((v) => v.estado)).toEqual(["aprobada"]);

    // Versión 2 por un cambio mayor (la meta), aprobada por Gerencia, y una 3 por un cambio menor, sin aprobador.
    const cal = calendarioDeIndicadores(await sembradaEn(sql));
    const conCambios = await indicador("SGC-IND-05");
    const [v1, v2, v3] = await versiones(conCambios.id);
    expect([v1, v2, v3].map((v) => [v.numero, v.tipo_cambio, v.estado])).toEqual([
      [1, "inicial", "aprobada"],
      [2, "mayor", "aprobada"],
      [3, "menor", "aprobada"],
    ]);
    expect([v1, v2, v3].map((v) => Number(v.meta))).toEqual([85, 90, 90]);
    expect([v2.rige_desde, v3.rige_desde]).toEqual([cal.trimestreSiguiente.clave, cal.trimestreSiguiente.clave]);
    expect(largo(v2.motivo_cambio)).toBeGreaterThan(0);
    expect(largo(v3.motivo_cambio)).toBeGreaterThan(0);
    const ficha2 = await fichaDeVersion(admin, v2.id, { sql });
    expect(ficha2?.firmas.elaboro?.nombre).toBe(admin.nombre);
    expect(ficha2?.firmas.aprobo?.nombre).toBe(gerente.nombre);
    const ficha3 = await fichaDeVersion(admin, v3.id, { sql });
    expect(ficha3?.firmas.elaboro?.nombre).toBe(admin.nombre);
    expect(ficha3?.firmas.aprobo).toBeNull();
    // Las mediciones viejas conservan su versión.
    for (const t of cal.trimestres) expect(Number((await medicion("SGC-IND-05", t.clave)).version_id), t.clave).toBe(v1.id);
    // Sigue manual (anexo 14B, decisión 5.3 del usuario): la conformidad en puntos de uso tiene su ficha aparte.
    expect([v1, v2, v3].map((v) => [v.origen_dato, v.calculo])).toEqual([["manual", null], ["manual", null], ["manual", null]]);
    expect(conCambios.calculo).toBeNull();
  });

  it("el año de la demo tiene históricos, un «Bien», un «Atención» con análisis, un «Crítico» con causa y acción, un sin dato, una vencida y un «no aplica»", async (ctx) => {
    await exigirIndicadores(ctx);
    const sembrada = await sembradaEn(sql);
    const cal = calendarioDeIndicadores(sembrada);
    const [t1, t2, t3] = cal.trimestres;

    // `SGC-IND-01` con los valores de la maqueta: dos históricos y el primero que se reporta, en Crítico.
    const auditorias = [];
    for (const t of cal.trimestres) auditorias.push(await medicion("SGC-IND-01", t.clave));
    expect(await Promise.all(auditorias.map((m) => valores(m.id)))).toEqual([{ A: 5, B: 5 }, { A: 5, B: 6 }, { A: 3, B: 5 }]);
    expect(auditorias.map((m) => [m.periodo, m.historica, m.semaforo])).toEqual([
      [t1.clave, true, "bien"],
      [t2.clave, true, "atencion"],
      [t3.clave, false, "critico"],
    ]);
    const critica = auditorias[2];
    expect(critica.requiere_accion).toBe(true);
    expect(largo(critica.causa)).toBeGreaterThanOrEqual(10);
    expect(largo(critica.accion_propuesta)).toBeGreaterThanOrEqual(10);
    expect(["reportada", "cerrada"]).toContain(critica.estado);
    // Ningún histórico pide análisis ni lleva la marca.
    expect(auditorias.slice(0, 2).every((m) => m.requiere_accion === false && m.estado !== "abierta")).toBe(true);

    // Bien, en una medición ordinaria.
    const bien = await medicion("AIN-IND-01", cal.meses[6].clave);
    expect(bien).toMatchObject({ historica: false, semaforo: "bien" });

    // Atención con su análisis.
    const atencion = await medicion("SGC-IND-02", t3.clave);
    expect(atencion).toMatchObject({ historica: false, semaforo: "atencion", requiere_accion: false });
    expect(largo(atencion.analisis)).toBeGreaterThanOrEqual(10);
    expect(["reportada", "cerrada"]).toContain(atencion.estado);

    // Sin dato: nadie la reportó y la cerró el cierre del mes.
    const sinDato = await medicion("AIN-IND-01", cal.meses[4].clave);
    expect(sinDato).toMatchObject({ historica: false, estado: "cerrada", no_aplica: false, resultado_exacto: null, reportada_en: null });

    // Vencida: abierta, sin datos y con la fecha límite pasada.
    const vencida = await medicion("AIN-IND-01", cal.meses[2].clave);
    expect(vencida).toMatchObject({ historica: false, estado: "abierta", reportada_en: null });
    expect(
      estadoVisible(
        { estado: "abierta", vence: vencida.vence_en, historica: false, datosCompletos: false, faltaDatoAjeno: false, faltaAnalisis: false },
        sembrada,
      ),
    ).toEqual({ estado: "por_reportar", vencida: true });
    // Es la única: lo demás que pasó su plazo de reporte se reportó; lo que sigue en plazo queda por reportar, sin vencer.
    const vencidas = await sql`SELECT i.codigo, m.periodo FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id
      WHERE i.codigo IN ${sql(Object.keys(SEMBRADOS))} AND m.estado = 'abierta' AND NOT m.historica AND NOT m.no_aplica
        AND m.reportada_en IS NULL AND m.vence_en < ${sembrada}`;
    expect(vencidas.map((v) => [v.codigo, v.periodo])).toEqual([["AIN-IND-01", cal.meses[2].clave]]);

    // No aplica, con su motivo.
    const noAplica = await medicion("SGC-IND-08", t3.clave);
    expect(noAplica).toMatchObject({ historica: false, no_aplica: true, semaforo: null });
    expect(largo(noAplica.no_aplica_motivo)).toBeGreaterThanOrEqual(5);
  });

  it("hay una meta programada, una observación sin respuesta, un cierre y una medición reabierta y corregida", async (ctx) => {
    await exigirIndicadores(ctx);
    const sembrada = await sembradaEn(sql);
    const cal = calendarioDeIndicadores(sembrada);
    const admin = await sesionDe(sql, "coordinadora.sgc");
    const t3 = cal.trimestres[2];

    // Una meta programada distinta de la de la ficha (80) y dentro de Bien, antes de terminar el periodo: sin la marca de tardía.
    const capacitacion = await indicador("SGC-IND-06");
    const [meta] = await sql`SELECT meta, tardia FROM indicador_metas WHERE indicador_id = ${capacitacion.id} AND periodo = ${t3.clave}`;
    expect(Number(meta.meta)).toBe(90);
    expect(meta.tardia).toBe(false);
    expect(Number((await vigente(capacitacion.id)).meta)).toBe(80);
    const conMeta = await medicion("SGC-IND-06", t3.clave);
    expect(Number(conMeta.meta_aplicada)).toBe(90);
    // 17/20 = 85 %: Bien (desde 80) sin alcanzar la meta de 90, y sin la marca de tardía. Pide análisis y lo tiene: queda
    // reportada, no abierta y vencida por falta de análisis.
    expect(conMeta).toMatchObject({ semaforo: "bien", cumple: false, meta_tardia: false, estado: "reportada" });
    expect(largo(conMeta.analisis)).toBeGreaterThanOrEqual(10);

    // La observación de Control Interno, sin respuesta; quien tiene rol Consulta no la ve.
    const critica = await medicion("SGC-IND-01", t3.clave);
    const observaciones = await observacionesDe(admin, critica.id, { sql });
    expect(observaciones).toHaveLength(1);
    expect(observaciones![0].autor).toBe((await sesionDe(sql, "control.interno")).nombre);
    expect(observaciones![0].respuestas).toEqual([]);
    expect(await observacionesDe(await sesionDe(sql, "consulta"), critica.id, { sql })).toBeNull();

    // El cierre del mes de hace tres meses; el que sigue por cerrar es el de hace dos.
    const cierres = await sql`SELECT c.id, to_char(c.mes, 'YYYY-MM') AS mes, u.usuario FROM cierres_indicadores c
      JOIN usuarios u ON u.id = c.cerrado_por ORDER BY c.mes`;
    expect(cierres.map((c) => [c.mes, c.usuario])).toEqual([[cal.meses[3].clave, "coordinadora.sgc"]]);
    expect(await mesPorOmision({ sql, ahora: sembrada })).toBe(cal.meses[2].clave);
    expect(Number((await medicion("AIN-IND-01", cal.meses[4].clave)).cierre_id)).toBe(Number(cierres[0].id));

    // Reabierta con justificación, corregida por quien mide (de Atención a Bien) y cerrada de nuevo.
    const corregida = await medicion("CEX-IND-01", cal.meses[4].clave);
    expect(corregida).toMatchObject({ corregida: true, estado: "cerrada", semaforo: "bien" });
    expect(largo(corregida.reabierta_motivo)).toBeGreaterThanOrEqual(10);
    const eventos = await sql`SELECT tipo, detalle FROM medicion_eventos WHERE medicion_id = ${corregida.id} ORDER BY creado_en, id`;
    expect(eventos.map((e) => e.tipo)).toEqual(["reporte", "analisis", "cierre", "reapertura", "correccion", "cierre"]);
    const correccion = eventos.find((e) => e.tipo === "correccion")!.detalle as { antes: { semaforo: string }; despues: { semaforo: string } };
    expect([correccion.antes.semaforo, correccion.despues.semaforo]).toEqual(["atencion", "bien"]);
  });

  it("hay tres objetivos de calidad y dos institucionales", async (ctx) => {
    await exigirIndicadores(ctx);
    const objetivos = await listarMaestro("objetivos", { sql });
    expect(objetivos.filter((o) => o.clase === "calidad")).toHaveLength(3);
    expect(objetivos.filter((o) => o.clase === "institucional")).toHaveLength(2);
    // Con algunos indicadores ligados.
    expect(objetivos.filter((o) => o.usos > 0).length).toBeGreaterThanOrEqual(3);
  });

  it("cada ficha sembrada trae su línea base o «sin línea base» con su nota (ronda 1 de la Tarea 19, D-10)", async (ctx) => {
    await exigirIndicadores(ctx);
    const fichas = await sql`SELECT i.codigo, v.numero, v.linea_base_valor, v.linea_base_periodo, v.linea_base_nota
      FROM indicador_versiones v JOIN indicadores i ON i.id = v.indicador_id
      WHERE i.codigo LIKE ANY (${["SGC-IND-%", "AIN-IND-%", "CEX-IND-%", "GTH-IND-%", "GRF-IND-%"]}::text[]) ORDER BY i.codigo, v.numero`;
    expect(fichas.length).toBeGreaterThanOrEqual(14);
    const sinNinguna = fichas.filter((f) => !(f.linea_base_valor !== null && f.linea_base_periodo !== null) && largo(f.linea_base_nota) === 0);
    expect(sinNinguna.map((f) => `${f.codigo} v${f.numero}`)).toEqual([]);
    // Donde tiene sentido, una línea base de verdad; en las demás, la nota que propone el formulario.
    const de = (codigo: string) => fichas.find((f) => f.codigo === codigo)!;
    expect([de("AIN-IND-01").linea_base_periodo, de("CEX-IND-01").linea_base_periodo]).toEqual(["2025", "2025"]);
    expect(de("SGC-IND-01").linea_base_nota).toMatch(/^Sin línea base: \d{4} es el año de referencia$/);
    // El cambio mayor y el menor de SGC-IND-05 no cambiaron la línea base: no la cuentan entre lo que cambió.
    const resumen = await versionesDe(Number((await indicador("SGC-IND-05")).id), { sql });
    const cambios = resumen.filter((r) => r.tipoCambio !== "inicial");
    expect(cambios).toHaveLength(2);
    for (const v of cambios) expect(v.cambios).not.toContain("Nota de la línea base");
  });

  it("los avisos de lo que la historia ya resolvió quedan leídos; la alerta, la observación, la reapertura y la ficha por aprobar, no", async (ctx) => {
    await exigirIndicadores(ctx);
    // Los avisos de los indicadores sembrados (los de una medición, por su indicador).
    const avisos = await sql`SELECT n.tipo, u.usuario, i.codigo, n.leida_en IS NOT NULL AS leida
      FROM notificaciones n JOIN usuarios u ON u.id = n.usuario_id
      LEFT JOIN mediciones m ON n.entidad = 'medicion' AND m.id = n.entidad_id
      JOIN indicadores i ON i.id = CASE WHEN n.entidad = 'indicador' THEN n.entidad_id ELSE m.indicador_id END
      WHERE n.tipo LIKE 'indicadores.%' AND i.codigo IN ${sql(Object.keys(SEMBRADOS))}`;
    const resueltos = avisos.filter(
      (a) =>
        ["indicadores.aprobada", "indicadores.designacion", "indicadores.retirado"].includes(a.tipo) ||
        (a.tipo === "indicadores.por_aprobar" && a.codigo !== "GTH-IND-02"),
    );
    expect(new Set(resueltos.map((a) => a.tipo))).toEqual(
      new Set(["indicadores.aprobada", "indicadores.designacion", "indicadores.retirado", "indicadores.por_aprobar"]),
    );
    expect(resueltos.filter((a) => !a.leida)).toEqual([]);

    const importan = [
      ["indicadores.alerta", "gerente", "SGC-IND-01"],
      ["indicadores.observacion", "coordinadora.sgc", "SGC-IND-01"],
      ["indicadores.reabierta", "lider.cex", "CEX-IND-01"],
      ["indicadores.por_aprobar", "lider.gth", "GTH-IND-02"],
    ].map(([tipo, usuario, codigo]) => avisos.filter((a) => a.tipo === tipo && a.usuario === usuario && a.codigo === codigo));
    for (const de of importan) expect(de.length).toBeGreaterThan(0);
    // Si alguien los leyó, la demo ya se usó.
    exigirDemo(ctx, importan.flat().every((a) => !a.leida), "se leyeron avisos de los indicadores de la demo");
  });
  it("CNT-ID-001 tiene sus rangos, un periodo en Bien que no cumple con su análisis y otro que cumple", async (ctx) => {
    await exigirIndicadores(ctx);
    const [sub] = await sql`SELECT sigla FROM subprocesos WHERE nombre = 'Gestión Contable'`;
    expect(sub?.sigla).toBe("CNT");
    const i = await indicador("CNT-ID-001");
    expect(i.estado).toBe("activo");
    const v = await vigente(i.id);
    expect(v).toMatchObject({ nombre: "Oportunidad en el cierre contable", periodicidad: "mensual", semaforo_modo: "rangos" });
    expect(Number(v.meta)).toBe(100);
    expect(v.rangos).toEqual({
      bien: [{ signo: ">=", valor: "91" }],
      atencion: [{ signo: "entre", valor: "41", hasta: "90" }],
      critico: [{ signo: "<=", valor: "40" }],
    });
    const filas = await sql`SELECT periodo, semaforo, cumple, resultado, analisis FROM mediciones
      WHERE indicador_id = ${i.id} AND estado = 'reportada' ORDER BY periodo`;
    expect(filas).toHaveLength(2);
    expect(filas.map((m) => [Number(m.resultado), m.semaforo, m.cumple])).toEqual([[95, "bien", false], [100, "bien", true]]);
    expect(largo(filas[0].analisis)).toBeGreaterThan(20);
  });

  it("el lote importado trae una ficha aprobada con su importación y una propuesta sin ella", async (ctx) => {
    await exigirIndicadores(ctx);
    const aprobada = await indicador("TSR-ID-001");
    const va = await vigente(aprobada.id);
    expect(va.importacion_id).not.toBeNull();
    expect(va).toMatchObject({ aprobacion_previa_documento: "SGC-TI-002 v1", aprobacion_previa_por: "Gerente" });
    const propuesta = await indicador("GRF-ID-001");
    const [vp] = await versiones(propuesta.id);
    expect(vp).toMatchObject({ estado: "borrador", importacion_id: null });
    const [e] = await sql`SELECT detalle FROM importacion_eventos WHERE importacion_id = ${va.importacion_id} AND tipo = 'importado'`;
    expect((e.detalle as { fichas: { codigo: string; estado: string }[] }).fichas.map((f) => [f.codigo, f.estado])).toEqual([
      ["TSR-ID-001", "aprobado"],
      ["GRF-ID-001", "propuesto"],
    ]);
    const [sub] = await sql`SELECT sigla FROM subprocesos WHERE nombre = 'Gestión Tesorería'`;
    expect(sub?.sigla).toBe("TSR");
    // La plantilla del lote está en el almacén con la huella de su fila.
    const [a] = await sql`SELECT ruta, hash_sha256 FROM archivos WHERE contexto = 'importacion_indicadores' AND contexto_id = ${va.importacion_id}`;
    const bytes = await readFile(resolverRutaAlmacen(a.ruta as string)!);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(a.hash_sha256);
  });
});

/** Los eventos `foto` de la medición: los escribe el sistema, sin usuario. */
const fotosDe = async (medicionId: number) =>
  sql`SELECT usuario_id, detalle FROM medicion_eventos WHERE medicion_id = ${medicionId} AND tipo = 'foto' ORDER BY id`;

/** El indicador activo de la demo cuya ficha vigente usa el cálculo con ese alcance. */
async function delCalculo(calculo: string, alcance: string) {
  const filas = await sql`SELECT i.*, p.sigla FROM indicadores i JOIN procesos p ON p.id = i.proceso_id
    WHERE i.estado = 'activo' AND i.calculo = ${calculo} AND i.calculo_alcance = ${alcance}`;
  expect(filas, `${calculo} / ${alcance}`).toHaveLength(1);
  return filas[0];
}

describe("lo que calcula el sistema y lo regulatorio (anexo 14B, §11)", () => {
  it("SGC-IND-03 lo calcula el sistema desde su versión 2, con «Objetivos cumplidos» de calidad, y su semestre ya tiene la foto", async (ctx) => {
    await exigirIndicadores(ctx);
    const cal = calendarioDeIndicadores(await sembradaEn(sql));
    const i = await indicador("SGC-IND-03");
    expect(i).toMatchObject({ calculo: "objetivos_cumplidos", calculo_alcance: "calidad" });
    const [v1, v2, otra] = await versiones(i.id);
    expect(otra).toBeUndefined();
    expect(v1).toMatchObject({ numero: 1, tipo_cambio: "inicial", estado: "aprobada", origen_dato: "manual", calculo: null });
    expect(v2).toMatchObject({
      numero: 2,
      tipo_cambio: "mayor",
      estado: "aprobada",
      origen_dato: "automatico",
      calculo: "objetivos_cumplidos",
      calculo_alcance: "calidad",
      rige_desde: cal.semestreAutomatico.clave,
    });
    expect(largo(v2.motivo_cambio)).toBeGreaterThan(0);
    // La versión manual no dejó datos desde ese semestre: la automática no podría regir desde un periodo con datos.
    const [{ manuales }] = await sql`SELECT count(*)::int AS manuales FROM mediciones
      WHERE indicador_id = ${i.id} AND hasta >= ${cal.semestreAutomatico.desde} AND reportada_por IS NOT NULL`;
    expect(manuales).toBe(0);

    // El semestre, con la foto del sistema: sin usuario, con los objetivos cumplidos de los que tuvieron medición (A de B).
    // Con el histórico, cumplen dos de tres (Atención); con el ordinario, uno de tres (Crítico): `cambioDeSgc03`.
    const m = await medicion("SGC-IND-03", cal.semestreAutomatico.clave);
    expect(m.foto_en).not.toBeNull();
    expect(m).toMatchObject({ version_id: v2.id, reportada_por: null, no_aplica: false, semaforo: cal.sgc03.esperado, reabierta_en: null });
    expect(m.historica).toBe(cal.semestreAutomatico.clave === cal.semestreHistorico.clave);
    expect(await valores(m.id)).toEqual({ A: cal.sgc03.esperado === "atencion" ? 2 : 1, B: 3 });
    // Sin cerrar: «Volver a calcular» vale sobre ella (anexo 14B, §5.4).
    expect(m.estado).not.toBe("cerrada");
    const fotos = await fotosDe(m.id);
    expect(fotos.map((f) => [f.usuario_id, f.detalle.calculo, f.detalle.alcance])).toEqual([[null, "objetivos_cumplidos", "calidad"]]);
  });

  it("la ficha de «Conformidad en puntos de uso» es de toda la entidad, con meta 90, y su mes anterior ya tiene la foto", async (ctx) => {
    await exigirIndicadores(ctx);
    const sembrada = await sembradaEn(sql);
    const cal = calendarioDeIndicadores(sembrada);
    const i = await delCalculo("conformidad_fecha", "entidad");
    expect(i).toMatchObject({ codigo: SGC_CONFORMIDAD.codigo, sigla: "SGC", inicio_medicion: cal.mesAnterior.clave });
    const v = await vigente(i.id);
    expect(v).toMatchObject({ numero: 1, origen_dato: "automatico", periodicidad: "mensual", tendencia: "ascendente" });
    expect(Number(v.meta)).toBe(90);
    // Nadie la mide; Gerencia la aprobó en el mes anterior a la siembra, que es desde cuando mide.
    expect(await designados(i.id, "mide")).toEqual([]);
    const aprobada = new Date(v.aprobada_en).getTime();
    expect(aprobada >= cal.mesAnterior.desde.getTime() && aprobada <= cal.mesAnterior.hasta.getTime()).toBe(true);

    // El mes anterior, fotografiado: Farmacia conforme y Urgencias no (su verificación dejó el hallazgo abierto), 1 de 2.
    // 50 % frente a 90 es Crítico: la coordinadora lo analizó con su causa y su acción.
    const m = await medicion(i.codigo as string, cal.mesAnterior.clave);
    expect(m.foto_en).not.toBeNull();
    expect(await valores(m.id)).toEqual({ A: 1, B: 2 });
    expect(m).toMatchObject({ reportada_por: null, semaforo: "critico", cumple: false, requiere_accion: true, estado: "reportada" });
    expect(largo(m.causa)).toBeGreaterThanOrEqual(10);
    expect(largo(m.accion_propuesta)).toBeGreaterThanOrEqual(10);
    expect((await fotosDe(m.id)).map((f) => f.usuario_id)).toEqual([null]);

    // Una sola meta (anexo 14B, §6): Distribución juzga la conformidad con la de la ficha, no con el 95 de la configuración.
    const admin = await sesionDe(sql, "coordinadora.sgc");
    expect(await metaDeConformidad(95, admin, { sql, ahora: sembrada })).toEqual({ umbral: 90, ficha: SGC_CONFORMIDAD.codigo });
  });

  it("«Reportes a tiempo» del SGC trae un mes «No aplica» puesto por el sistema y otro en «Falta un dato», sin tarea ni aviso", async (ctx) => {
    await exigirIndicadores(ctx);
    const sembrada = await sembradaEn(sql);
    const i = await delCalculo("reportes_a_tiempo", "proceso");
    expect(i).toMatchObject({ codigo: SGC_REPORTES.codigo, sigla: "SGC", plazo_reporte_dias: 31 });
    const filas = await sql`SELECT * FROM mediciones WHERE indicador_id = ${i.id} ORDER BY desde`;

    // Los meses sin fechas límite de los indicadores del SGC: «No aplica» con el motivo del cálculo, sin usuario.
    const noAplica = filas.filter((m) => m.no_aplica);
    expect(noAplica.length).toBeGreaterThan(0);
    for (const m of noAplica) {
      expect(m.foto_en, m.periodo).not.toBeNull();
      expect(m, m.periodo).toMatchObject({ reportada_por: null, no_aplica_motivo: CALCULOS.reportes_a_tiempo.sinDatos, semaforo: null });
      expect((await fotosDe(m.id)).map((f) => f.usuario_id), m.periodo).toEqual([null]);
    }
    // Lo que el sistema ya calculó con datos no pidió análisis: los del SGC se reportaron a tiempo.
    for (const m of filas.filter((x) => x.foto_en !== null && !x.no_aplica)) expect(m, m.periodo).toMatchObject({ semaforo: "bien", cumple: true });

    // El mes anterior espera su foto: abierto, sin datos y dentro de su plazo (31 días).
    const esperan = filas.filter((m) => m.foto_en === null);
    expect(esperan.length).toBeGreaterThan(0);
    for (const m of esperan) {
      expect(m, m.periodo).toMatchObject({ estado: "abierta", reportada_en: null, no_aplica: false, historica: false });
      expect(new Date(m.vence_en).getTime(), m.periodo).toBeGreaterThan(sembrada.getTime());
    }
    // Nadie tiene la tarea de reportarla ni aviso de ella (anexo 14B, §4: «Falta un dato»).
    const deEsperan = new Set(esperan.flatMap((m) => [`medir:${m.id}`, `analizar:${m.id}`]));
    for (const usuario of ["coordinadora.sgc", "gerente", "control.interno"]) {
      const { tareas } = await tareasDeIndicadores(await sesionDe(sql, usuario), { sql, ahora: sembrada });
      expect(tareas.filter((t) => deEsperan.has(t.id)), usuario).toEqual([]);
    }
    const avisos = await sql`SELECT n.tipo FROM notificaciones n WHERE n.entidad = 'medicion' AND n.entidad_id IN ${sql(esperan.map((m) => Number(m.id)))}`;
    expect(avisos).toEqual([]);
  });

  it("CEX-IND-01 se reporta al ente cada trimestre: una constancia registrada con su radicado y su soporte, y otra vencida", async (ctx) => {
    await exigirIndicadores(ctx);
    const sembrada = await sembradaEn(sql);
    const plan = constanciasDeLaDemo(sembrada);
    const cex = await indicador("CEX-IND-01");
    expect(await vigente(cex.id)).toMatchObject({ ente: "Ministerio de Salud y Protección Social", periodicidad_externa: "trimestral", plazo_externo_dias: 30 });
    const constancias = await sql`SELECT *, to_char(fecha_envio, 'YYYY-MM-DD') AS envio FROM reportes_externos
      WHERE indicador_id = ${cex.id} ORDER BY hasta`;
    expect(constancias.map((c) => [c.periodo, new Date(c.vence_en).getTime()])).toEqual(plan.periodos.map((p) => [p.clave, p.vence.getTime()]));

    const registradas = constancias.filter((c) => c.estado === "registrada");
    expect(registradas.map((c) => c.periodo)).toEqual([plan.registrada]);
    const [r] = registradas;
    expect(r).toMatchObject({ radicado: plan.radicado, envio: plan.fechaEnvio, ente: "Ministerio de Salud y Protección Social", corregida: false });
    expect(r.resultado_enviado).toMatch(/días$/);
    expect(Number(r.registrada_por)).toBe((await sesionDe(sql, "lider.cex")).usuarioId);
    // Su soporte: un PDF en el almacén, con la huella de su fila; y su historial, el soporte y el registro.
    const soportes = await sql`SELECT ruta, mime, hash_sha256 FROM archivos WHERE contexto = 'reporte_externo' AND contexto_id = ${r.id}`;
    expect(soportes.map((s) => s.mime)).toEqual(["application/pdf"]);
    const bytes = await readFile(resolverRutaAlmacen(soportes[0].ruta as string)!);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(soportes[0].hash_sha256);
    const eventos = await sql`SELECT tipo FROM reporte_externo_eventos WHERE reporte_id = ${r.id} ORDER BY id`;
    expect(eventos.map((e) => e.tipo)).toEqual(["soporte", "registro"]);

    // Al menos una pendiente ya venció: la tarea «Registrar el reporte…» de quien mide.
    const vencidas = constancias.filter((c) => c.estado === "pendiente" && new Date(c.vence_en).getTime() < sembrada.getTime());
    expect(vencidas.length).toBeGreaterThan(0);
    const { tareas } = await tareasDeIndicadores(await sesionDe(sql, "lider.cex"), { sql, ahora: sembrada });
    for (const c of vencidas) expect(tareas.map((t) => t.id), c.periodo).toContain(`constancia:${c.id}`);
  });

  it("no hay revisiones de indicadores por cambio de norma: el recorrido las provoca", async (ctx) => {
    await exigirIndicadores(ctx);
    expect(await sql`SELECT ii.id FROM impactos_indicadores ii JOIN indicadores i ON i.id = ii.indicador_id
      WHERE i.codigo IN ${sql(Object.keys(SEMBRADOS))}`).toEqual([]);
    // La única norma que cambió de estado en la demo (la 2003 de 2014, derogada) no la cita ningún indicador sembrado.
    const citan = await sql`SELECT DISTINCT i.codigo FROM indicador_normas n
      JOIN indicador_versiones v ON v.id = n.version_id JOIN indicadores i ON i.id = v.indicador_id
      WHERE n.norma_id IN (SELECT norma_id FROM norma_cambios) AND i.codigo IN ${sql(Object.keys(SEMBRADOS))}`;
    expect(citan).toEqual([]);
  });
});
