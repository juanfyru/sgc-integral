/**
 * Los planes de mejoramiento de la demo (spec 15 §22, Tarea 22) contra la base sembrada: un hallazgo por cada fila de la tabla
 * de la tarea, con su etiqueta (`etiquetaDeEstado`) y su marca; los dos reportes de `consulta`; el caso de las maquetas con sus
 * tres actividades, una vencida y un ajuste por decidir; el «Por formular» a punto de vencer; las dos fechas mínimas de la
 * eficacia; el cargado con su escaneo y sin firmas del plan; ningún dato que parezca de un paciente; y que otra pasada de
 * vencimientos a la hora de la siembra no avisa nada. Solo lee (la pasada, dentro de una transacción que se revierte). Todo lo
 * que depende del día se mide contra el reloj de la siembra (`sembradaEn`), no contra el de la prueba. Como el resto de la demo,
 * se salta si ya se usó (ver `utiles/demo.ts`); `SEMILLA_RECIEN=1` lo exige.
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it, type TestContext } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { calendarioDeMejora } from "@/db/consultas/mejoramiento/config";
import { evaluableDesde, fechaMinimaDe } from "@/db/consultas/mejoramiento/espera";
import { hallazgoBase } from "@/db/consultas/mejoramiento/flujo";
import { venceLaActividad } from "@/db/consultas/mejoramiento/vence-actividad";
import { revisarVencimientosDeMejoramiento } from "@/db/consultas/mejoramiento/vencimientos";
import { DIA_NO_HABIL_DE_EJEMPLO, HALLAZGOS_DE_LA_DEMO, REPORTES_DE_LA_DEMO } from "@/db/semillas/mejoramiento-demo";
import { diasHabilesEntre } from "@/lib/dias-habiles";
import { etiquetaDeEstado, marcasDeHallazgo } from "@/lib/mejoramiento/estados";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { exigirDemo, sembradaEn } from "./utiles/demo";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
const ZONA = zonaHoraria();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

type Clave = keyof typeof HALLAZGOS_DE_LA_DEMO;
const CLAVES = Object.keys(HALLAZGOS_DE_LA_DEMO) as Clave[];

/**
 * Si lo sembrado en mejoramiento sigue como se sembró: los catorce hallazgos y los dos reportes, ningún paso ni evento de un
 * reporte después del reloj de la siembra (lo que se hace al recorrer la demo lleva la hora real: `ocurrio_en` en los
 * hallazgos y `creado_en` en los reportes, que la siembra inyecta) y el día no hábil de ejemplo como único del calendario.
 */
async function comoSeSembro(): Promise<{ intacta: boolean; motivo: string }> {
  const t = await sembradaEn(sql);
  const [c] = await sql`SELECT
      (SELECT count(*)::int FROM mejora_hallazgos) AS hallazgos,
      (SELECT count(*)::int FROM mejora_reportes) AS reportes,
      (SELECT count(*)::int FROM mejora_eventos WHERE ocurrio_en > ${t}) AS eventos,
      (SELECT count(*)::int FROM mejora_reporte_eventos WHERE creado_en > ${t}) AS "eventosDeReportes",
      (SELECT count(*)::int FROM dias_no_habiles) AS dias`;
  const cambios: string[] = [];
  if (c.hallazgos !== 14) cambios.push(`${c.hallazgos} hallazgos (se sembraron 14)`);
  if (c.reportes !== 2) cambios.push(`${c.reportes} reportes (se sembraron 2)`);
  if (c.eventos > 0) cambios.push(`${c.eventos} pasos de hallazgos posteriores a la siembra`);
  if (c.eventosDeReportes > 0) cambios.push(`${c.eventosDeReportes} eventos de reportes posteriores a la siembra`);
  if (c.dias !== 1) cambios.push(`${c.dias} días en el calendario de la entidad (se sembró 1)`);
  return { intacta: cambios.length === 0, motivo: cambios.length === 0 ? "mejoramiento está como se sembró" : `hay ${cambios.join("; ")}` };
}

async function exigirMejoramiento(ctx: TestContext): Promise<void> {
  const { intacta, motivo } = await comoSeSembro();
  exigirDemo(ctx, intacta, motivo);
}

/** El hallazgo sembrado de esa fila, por su título. */
async function hallazgo(clave: Clave) {
  const filas = await sql`SELECT * FROM mejora_hallazgos WHERE titulo = ${HALLAZGOS_DE_LA_DEMO[clave].titulo}`;
  expect(filas, clave).toHaveLength(1);
  return filas[0];
}

/** Las actividades de la ronda en curso del hallazgo, con su responsable y si están vencidas el día de la siembra. */
async function actividadesDe(hallazgoId: number, hoy: string) {
  return sql`SELECT a.id, a.estado, a.fin_original, u.usuario,
      (a.estado IN ('abierta', 'en_proceso') AND ${venceLaActividad(sql)} < ${hoy}::date) AS vencida
    FROM mejora_actividades a
    JOIN mejora_acciones ac ON ac.id = a.accion_id
    JOIN mejora_rondas r ON r.id = ac.ronda_id
    JOIN mejora_hallazgos h ON h.id = a.hallazgo_id AND h.ronda = r.numero
    JOIN usuarios u ON u.id = a.responsable_id
    WHERE a.hallazgo_id = ${hallazgoId}
    ORDER BY ac.orden, a.orden`;
}

describe("los planes de mejoramiento de la demo", () => {
  it("hay un hallazgo por cada fila de la tabla, con su etiqueta y su marca", async (ctx) => {
    await exigirMejoramiento(ctx);
    const t = await sembradaEn(sql);
    const hoy = fechaEnZona(t, ZONA);
    for (const clave of CLAVES) {
      const fila = await hallazgo(clave);
      const h = await hallazgoBase(sql, Number(fila.id));
      const espera = await evaluableDesde(sql, Number(fila.id), t);
      expect(etiquetaDeEstado(h!, { yaSePuedeEvaluar: espera?.yaSePuede ?? false }), clave).toBe(HALLAZGOS_DE_LA_DEMO[clave].etiqueta);
      const marca: string | undefined = (HALLAZGOS_DE_LA_DEMO[clave] as { marca?: string }).marca;
      if (marca) {
        const vencida = (await actividadesDe(Number(fila.id), hoy)).some((a) => a.vencida === true);
        expect(marcasDeHallazgo(h!, { cargado: fila.cargado === true, algunaActividadVencida: vencida }), clave).toContain(marca);
      }
    }
    // Cada fila es un hallazgo distinto: catorce títulos, catorce códigos.
    const codigos = await sql`SELECT codigo FROM mejora_hallazgos ORDER BY codigo`;
    expect(new Set(codigos.map((f) => f.codigo)).size).toBe(CLAVES.length);
  });

  it("los códigos salen en el orden de su registro", async (ctx) => {
    await exigirMejoramiento(ctx);
    const filas = await sql`SELECT anio, consecutivo FROM mejora_hallazgos ORDER BY registrado_en, id`;
    const orden = filas.map((f) => Number(f.anio) * 10_000 + Number(f.consecutivo));
    expect(orden).toEqual([...orden].sort((a, b) => a - b));
  });

  it("los dos reportes son de consulta: uno por clasificar y otro convertido en el «En revisión»", async (ctx) => {
    await exigirMejoramiento(ctx);
    const reportes = await sql`SELECT r.descripcion, r.estado, r.hallazgo_id, u.usuario FROM mejora_reportes r
      JOIN usuarios u ON u.id = r.reportado_por ORDER BY r.id`;
    const enRevision = await hallazgo("enRevision");
    expect(reportes.map((r) => ({ ...r }))).toEqual([
      { descripcion: REPORTES_DE_LA_DEMO.convertido, estado: "convertido", hallazgo_id: enRevision.id, usuario: "consulta" },
      { descripcion: REPORTES_DE_LA_DEMO.porClasificar, estado: "recibido", hallazgo_id: null, usuario: "consulta" },
    ]);
  });

  it("el caso de las maquetas: reincidente y de criticidad alta, con tres actividades, una vencida y un ajuste por decidir", async (ctx) => {
    await exigirMejoramiento(ctx);
    const hoy = fechaEnZona(await sembradaEn(sql), ZONA);
    const h = await hallazgo("enEjecucion");
    const eficaz = await hallazgo("eficaz");
    expect({ criticidad: h.criticidad, reincidente: h.reincidente_de, proceso: h.proceso_id }).toEqual({
      criticidad: "alta",
      reincidente: eficaz.id,
      proceso: eficaz.proceso_id,
    });
    const actividades = await actividadesDe(Number(h.id), hoy);
    expect(actividades.map((a) => a.usuario).sort()).toEqual(["consulta", "coordinadora.sgc", "jefe.urgencias"]);
    expect(actividades.every((a) => a.fin_original !== null)).toBe(true);
    expect(actividades.filter((a) => a.vencida === true).map((a) => a.usuario)).toEqual(["jefe.urgencias"]);
    const ajustes = await sql`SELECT aj.tipo, aj.estado, u.usuario FROM mejora_ajustes aj JOIN usuarios u ON u.id = aj.pedido_por
      WHERE aj.hallazgo_id = ${h.id}`;
    expect(ajustes.map((a) => ({ ...a }))).toEqual([{ tipo: "reprogramar", estado: "pendiente", usuario: "jefe.urgencias" }]);
    const aprobo = await sql`SELECT u.usuario FROM firmas f JOIN usuarios u ON u.id = f.usuario_id
      WHERE f.mejora_hallazgo_id = ${h.id} AND f.firma = 'aprobo'`;
    expect(aprobo.map((f) => f.usuario)).toEqual(["gerente"]);
  });

  it("el «Por formular» no está vencido y vence dentro de los próximos cinco días hábiles", async (ctx) => {
    await exigirMejoramiento(ctx);
    const t = await sembradaEn(sql);
    const h = await hallazgo("porFormular");
    expect(h.estado).toBe("por_formular");
    const vence = h.vence_en as Date;
    expect(vence.getTime()).toBeGreaterThan(t.getTime());
    const quedan = diasHabilesEntre(t, vence, await calendarioDeMejora(sql), ZONA);
    expect(quedan).toBeGreaterThanOrEqual(1);
    expect(quedan).toBeLessThanOrEqual(5);
  });

  it("el «Por evaluar» ya llegó a su fecha mínima y el «En espera», con CEX-ID-001, todavía no", async (ctx) => {
    await exigirMejoramiento(ctx);
    const hoy = fechaEnZona(await sembradaEn(sql), ZONA);
    const porEvaluar = await fechaMinimaDe(sql, Number((await hallazgo("porEvaluar")).id), ZONA);
    const enEspera = await fechaMinimaDe(sql, Number((await hallazgo("enEspera")).id), ZONA);
    expect(porEvaluar!.minima <= hoy).toBe(true);
    expect(enEspera!.minima > hoy).toBe(true);
    expect(enEspera!.indicador).toMatchObject({ codigo: "CEX-ID-001", periodicidad: "mensual" });
  });

  it("el cargado tiene su escaneo y ninguna firma del plan", async (ctx) => {
    await exigirMejoramiento(ctx);
    const h = await hallazgo("cargado");
    expect(h.cargado).toBe(true);
    const escaneos = await sql`SELECT id FROM archivos
      WHERE contexto = 'mejora_hallazgo' AND contexto_id = ${h.id} AND rol = 'carga' AND version_id IS NULL`;
    expect(escaneos).toHaveLength(1);
    const firmas = await sql`SELECT firma FROM firmas WHERE mejora_hallazgo_id = ${h.id}`;
    expect(firmas).toEqual([]);
    const [confirmada] = await sql`SELECT ocurrio_en FROM mejora_eventos WHERE hallazgo_id = ${h.id} AND tipo = 'carga_confirmada'`;
    expect((confirmada.ocurrio_en as Date).getTime()).toBeLessThan((await sembradaEn(sql)).getTime());
  });

  it("el calendario de la entidad trae un día no hábil de ejemplo", async (ctx) => {
    await exigirMejoramiento(ctx);
    const dias = await sql`SELECT tipo, motivo FROM dias_no_habiles`;
    expect(dias.map((d) => ({ ...d }))).toEqual([{ tipo: "no_habil", motivo: DIA_NO_HABIL_DE_EJEMPLO }]);
  });

  it("ninguna descripción, corrección ni seguimiento lleva la palabra «cédula» ni un número de seis a diez cifras", async (ctx) => {
    await exigirMejoramiento(ctx);
    const textos = [
      ...(await sql`SELECT titulo AS t FROM mejora_hallazgos`),
      ...(await sql`SELECT descripcion AS t FROM mejora_hallazgos`),
      ...(await sql`SELECT correccion_descripcion AS t FROM mejora_hallazgos WHERE correccion_descripcion IS NOT NULL`),
      ...(await sql`SELECT realizado AS t FROM mejora_seguimientos`),
      ...(await sql`SELECT barreras AS t FROM mejora_seguimientos WHERE barreras IS NOT NULL`),
      ...(await sql`SELECT descripcion AS t FROM mejora_reportes`),
    ].map((f) => f.t as string);
    expect(textos.length).toBeGreaterThan(30);
    for (const texto of textos) {
      expect(texto, texto).not.toMatch(/c[ée]dula/i);
      expect(texto, texto).not.toMatch(/\b\d{6,10}\b/);
    }
  });

  it("sembrada la demo, otra pasada de vencimientos a la hora de la siembra no avisa nada", async (ctx) => {
    await exigirMejoramiento(ctx);
    const t = await sembradaEn(sql);
    await revertida(sql, async (tx) => {
      const config = await obtenerConfigDocumental({ sql: tx });
      expect(await revisarVencimientosDeMejoramiento({ sql: tx, ahora: t, config })).toEqual({ avisados: 0, escalados: 0 });
    });
  });
});
