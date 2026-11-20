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
import { engancheDeImpactos } from "@/db/consultas/mejoramiento/enganche-impacto";
import { engancheDeVerificacion } from "@/db/consultas/mejoramiento/enganche-verificacion";
import { hallazgoBase } from "@/db/consultas/mejoramiento/flujo";
import { marcasDelIndicador } from "@/db/consultas/mejoramiento/marcas";
import { tareasDeMejoramiento } from "@/db/consultas/mejoramiento/tareas";
import { venceLaActividad } from "@/db/consultas/mejoramiento/vence-actividad";
import { revisarVencimientosDeMejoramiento } from "@/db/consultas/mejoramiento/vencimientos";
import { datosDeEvaluacion } from "@/db/consultas/mejoramiento/verificacion";
import {
  DIA_NO_HABIL_DE_EJEMPLO,
  HALLAZGOS_DE_LA_DEMO,
  INDICADOR_DE_LAS_MARCAS,
  PLANES_DE_LA_DEMO,
  REPORTES_DE_LA_DEMO,
} from "@/db/semillas/mejoramiento-demo";
import { diasHabilesEntre } from "@/lib/dias-habiles";
import { etiquetaDeEstado, marcasDeHallazgo } from "@/lib/mejoramiento/estados";
import { TERMINALES } from "@/lib/mejoramiento/tipos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { exigirDemo, sembradaEn } from "./utiles/demo";
import { sesionDe } from "./utiles/tramites";
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
 * Si lo sembrado en mejoramiento sigue como se sembró: los hallazgos de `HALLAZGOS_DE_LA_DEMO` y los dos reportes, ningún paso
 * ni evento de un reporte después del reloj de la siembra (lo que se hace al recorrer la demo lleva la hora real: `ocurrio_en`
 * en los hallazgos y `creado_en` en los reportes, que la siembra inyecta), ningún aviso de mejoramiento leído por una persona
 * (la semilla deja leídos los resueltos en la hora en que nacieron; quien lee después lo hace más tarde) y el día no hábil de
 * ejemplo como único del calendario. Desde la 15B, también los tres planes y, después del reloj, ningún evento de un plan,
 * ninguna salida de una marca, ningún enlace a un trámite ni ningún cambio de la clasificación.
 */
async function comoSeSembro(): Promise<{ intacta: boolean; motivo: string }> {
  const t = await sembradaEn(sql);
  const [c] = await sql`SELECT
      (SELECT count(*)::int FROM mejora_hallazgos) AS hallazgos,
      (SELECT count(*)::int FROM mejora_reportes) AS reportes,
      (SELECT count(*)::int FROM mejora_eventos WHERE ocurrio_en > ${t}) AS eventos,
      (SELECT count(*)::int FROM mejora_reporte_eventos WHERE creado_en > ${t}) AS "eventosDeReportes",
      (SELECT count(*)::int FROM notificaciones WHERE tipo LIKE 'mejora.%' AND leida_en > creado_en) AS leidos,
      (SELECT count(*)::int FROM dias_no_habiles) AS dias,
      (SELECT count(*)::int FROM mejora_planes) AS planes,
      (SELECT count(*)::int FROM mejora_plan_eventos WHERE creado_en > ${t}) AS "eventosDePlanes",
      (SELECT count(*)::int FROM mejora_marcas WHERE decidido_en > ${t}) AS marcas,
      (SELECT count(*)::int FROM mejora_actividad_tramites WHERE enlazado_en > ${t}) AS enlaces,
      (SELECT count(*)::int FROM mejora_clasificacion WHERE actualizado_en > ${t}) AS clasificaciones`;
  const cambios: string[] = [];
  const sembrados = CLAVES.length;
  if (c.hallazgos !== sembrados) cambios.push(`${c.hallazgos} hallazgos (se sembraron ${sembrados})`);
  const planes = Object.keys(PLANES_DE_LA_DEMO).length;
  if (c.planes !== planes) cambios.push(`${c.planes} planes (se sembraron ${planes})`);
  for (const clave of ["eventosDePlanes", "marcas", "enlaces", "clasificaciones"] as const) {
    if (c[clave] > 0) cambios.push(`${c[clave]} ${clave} posteriores a la siembra`);
  }
  if (c.reportes !== 2) cambios.push(`${c.reportes} reportes (se sembraron 2)`);
  if (c.eventos > 0) cambios.push(`${c.eventos} pasos de hallazgos posteriores a la siembra`);
  if (c.eventosDeReportes > 0) cambios.push(`${c.eventosDeReportes} eventos de reportes posteriores a la siembra`);
  if (c.leidos > 0) cambios.push(`${c.leidos} avisos de mejoramiento leídos después de la siembra`);
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
    const t = await sembradaEn(sql);
    const hoy = fechaEnZona(t, ZONA);
    const porEvaluarId = Number((await hallazgo("porEvaluar")).id);
    const porEvaluar = await fechaMinimaDe(sql, porEvaluarId, ZONA);
    const enEspera = await fechaMinimaDe(sql, Number((await hallazgo("enEspera")).id), ZONA);
    expect(porEvaluar!.minima <= hoy).toBe(true);
    expect(enEspera!.minima > hoy).toBe(true);
    expect(enEspera!.indicador).toMatchObject({ codigo: "CEX-ID-001", periodicidad: "mensual" });
    // Lo que la pantalla de evaluar muestra del «Por evaluar» (spec §11.4): AIN-IND-01 antes, durante y después del plan.
    const datos = await datosDeEvaluacion(await sesionDe(sql, "control.interno"), porEvaluarId, { sql, ahora: t });
    expect(datos.indicador?.codigo).toBe("AIN-IND-01");
    expect(new Set(datos.indicador!.filas.map((f) => f.momento))).toEqual(new Set(["antes", "durante", "despues"]));
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

  it("los avisos que la historia sembrada ya resolvió quedan leídos; los de lo que hoy toca, no", async (ctx) => {
    await exigirMejoramiento(ctx);
    const aviso = (usuario: string, extra: ReturnType<typeof sql>) => sql`SELECT n.tipo, n.leida_en FROM notificaciones n
      JOIN usuarios u ON u.id = n.usuario_id WHERE u.usuario = ${usuario} AND ${extra}`;
    // El cierre del eficaz (HZ-…-001): Gerencia recibió su aviso y la semilla lo deja leído, como todo lo del hallazgo.
    const eficaz = await hallazgo("eficaz");
    const delEficaz = await aviso("gerente", sql`n.entidad = 'mejora_hallazgo' AND n.entidad_id = ${eficaz.id}`);
    expect(delEficaz.map((n) => n.tipo)).toContain("mejora.cerrado");
    expect(delEficaz.filter((n) => n.leida_en === null)).toEqual([]);
    // La actividad de `consulta` en el caso de las maquetas sigue abierta: su aviso de asignación queda sin leer.
    const maquetas = await hallazgo("enEjecucion");
    const [abierta] = await sql`SELECT a.id FROM mejora_actividades a JOIN usuarios u ON u.id = a.responsable_id
      WHERE a.hallazgo_id = ${maquetas.id} AND u.usuario = 'consulta' AND a.estado = 'abierta'`;
    const asignada = await aviso("consulta", sql`n.tipo = 'mejora.actividad_asignada' AND n.entidad_id = ${abierta.id}`);
    expect(asignada.map((n) => n.leida_en)).toEqual([null]);
    // Y la del coordinador, terminada, queda leída.
    const [terminada] = await sql`SELECT a.id FROM mejora_actividades a JOIN usuarios u ON u.id = a.responsable_id
      WHERE a.hallazgo_id = ${maquetas.id} AND u.usuario = 'coordinadora.sgc' AND a.estado = 'terminada'`;
    const suya = await aviso("coordinadora.sgc", sql`n.tipo = 'mejora.actividad_asignada' AND n.entidad_id = ${terminada.id}`);
    expect(suya.map((n) => n.leida_en !== null)).toEqual([true]);
    // El turno de hoy queda sin leer: `lider.gth` acepta o rechaza el «Por aceptar»; el de un paso que ya pasó, leído.
    const porAceptar = await hallazgo("porAceptar");
    const turno = await aviso("lider.gth", sql`n.tipo = 'mejora.turno' AND n.entidad_id = ${porAceptar.id}`);
    expect(turno.map((n) => n.leida_en)).toEqual([null]);
    const yaPaso = await aviso("lider.cex", sql`n.tipo = 'mejora.turno' AND n.entidad_id = ${(await hallazgo("enRevision")).id}`);
    expect(yaPaso.length).toBeGreaterThan(0);
    expect(yaPaso.every((n) => n.leida_en !== null)).toBe(true);
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
      // Tampoco queda un trámite enlazado que haya terminado sin su aviso, en un hallazgo sin terminar (anexo 15B, §9.5).
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM mejora_actividad_tramites e
        JOIN tramites tr ON tr.id = e.tramite_id JOIN mejora_hallazgos h ON h.id = e.hallazgo_id
        WHERE e.avisado_en IS NULL AND tr.cerrado_en IS NOT NULL AND h.estado NOT IN ${tx([...TERMINALES])}`;
      expect(n).toBe(0);
    });
  });
});

/** El plan sembrado con ese nombre (`PLANES_DE_LA_DEMO`). */
async function plan(nombre: string) {
  const filas = await sql`SELECT * FROM mejora_planes WHERE nombre = ${nombre}`;
  expect(filas, nombre).toHaveLength(1);
  return filas[0];
}

/** Los hallazgos de un plan, con su proceso, su estado y su origen. */
async function hallazgosDelPlan(planId: number) {
  return sql`SELECT h.id, h.titulo, h.estado, h.origen, h.proceso_id FROM mejora_clasificacion c
    JOIN mejora_hallazgos h ON h.id = c.hallazgo_id WHERE c.plan_id = ${planId} ORDER BY h.id`;
}

describe("lo que la 15B le añade a la demo (anexo 15B, §15.1)", () => {
  it("el plan del ente: dos procesos, uno cerrado, uno de otro origen, uno sin plan de acción aprobado y dos externos aprobados", async (ctx) => {
    await exigirMejoramiento(ctx);
    const p = await plan(PLANES_DE_LA_DEMO.ente);
    expect(p.origen).toBe("ente_control");
    expect(p.codigo).toMatch(/^PM-\d{4}-\d{2,}$/);
    const hs = await hallazgosDelPlan(Number(p.id));
    const titulos = hs.map((h) => h.titulo);
    for (const clave of ["eficaz", "enEspera", "enAprobacion", "enteRespondido", "enteListo"] as const) {
      expect(titulos, clave).toContain(HALLAZGOS_DE_LA_DEMO[clave].titulo);
    }
    expect(new Set(hs.map((h) => h.proceso_id)).size).toBeGreaterThanOrEqual(2);
    expect(hs.some((h) => h.estado === "cerrado")).toBe(true);
    expect(hs.some((h) => h.origen !== "ente_control")).toBe(true);
    expect((await hallazgo("enAprobacion")).estado).toBe("en_aprobacion");
  });

  it("el plan del ente tiene un archivo y una respuesta para uno de sus externos; el otro sigue listo, con su tarea", async (ctx) => {
    await exigirMejoramiento(ctx);
    const t = await sembradaEn(sql);
    const p = await plan(PLANES_DE_LA_DEMO.ente);
    const archivos = await sql`SELECT id FROM archivos WHERE contexto = 'mejora_plan' AND contexto_id = ${p.id}`;
    expect(archivos.length).toBeGreaterThanOrEqual(1);
    const respuestas = await sql`SELECT r.id, r.archivo_id FROM mejora_plan_respuestas r WHERE r.plan_id = ${p.id}`;
    expect(respuestas).toHaveLength(1);
    expect(archivos.map((a) => Number(a.id))).toContain(Number(respuestas[0].archivo_id));
    const incluidos = await sql`SELECT hallazgo_id FROM mejora_plan_respuesta_hallazgos WHERE respuesta_id = ${respuestas[0].id}`;
    expect(incluidos.map((f) => Number(f.hallazgo_id))).toEqual([Number((await hallazgo("enteRespondido")).id)]);
    const tareas = (await tareasDeMejoramiento(await sesionDe(sql, "coordinadora.sgc"), { sql, ahora: t })).tareas.map((x) => x.id);
    expect(tareas).toContain(`mej-ente-plan:${p.id}`);
  });

  it("un plan interno con hallazgos y su objetivo, y un plan sin ninguno", async (ctx) => {
    await exigirMejoramiento(ctx);
    const interno = await plan(PLANES_DE_LA_DEMO.interno);
    expect(interno.origen).toBe("auditoria_interna");
    expect(interno.objetivo_id).not.toBeNull();
    expect((await hallazgosDelPlan(Number(interno.id))).length).toBeGreaterThanOrEqual(2);
    const vacio = await plan(PLANES_DE_LA_DEMO.vacio);
    expect(await hallazgosDelPlan(Number(vacio.id))).toEqual([]);
    const codigos = await sql`SELECT codigo FROM mejora_planes ORDER BY creado_en, id`;
    const orden = codigos.map((f) => f.codigo as string);
    expect(orden).toEqual([...orden].sort());
  });

  it("un objetivo en un plan y en dos hallazgos sueltos", async (ctx) => {
    await exigirMejoramiento(ctx);
    const sueltos = await sql`SELECT hallazgo_id FROM mejora_clasificacion WHERE plan_id IS NULL AND objetivo_id IS NOT NULL`;
    expect(sueltos.length).toBeGreaterThanOrEqual(2);
  });

  it("las cuatro marcas: una pendiente con su análisis y un hallazgo sugerido, una que espera el análisis, una con hallazgo y una con «no requiere»", async (ctx) => {
    await exigirMejoramiento(ctx);
    const t = await sembradaEn(sql);
    const coordinadora = await sesionDe(sql, "coordinadora.sgc");
    const [ind] = await sql`SELECT DISTINCT i.id FROM indicadores i JOIN indicador_versiones iv ON iv.indicador_id = i.id
      WHERE iv.nombre = ${INDICADOR_DE_LAS_MARCAS}`;
    const panel = await marcasDelIndicador(coordinadora, Number(ind.id), { sql, ahora: t });
    expect(panel?.marcas.map((m) => m.estado)).toEqual(["pendiente", "espera_analisis"]);
    const [pendiente] = panel!.marcas;
    expect(pendiente.causa).not.toBeNull();
    expect(pendiente.accionPropuesta).not.toBeNull();
    expect(panel!.candidatos.map((c) => c.titulo)).toContain(HALLAZGOS_DE_LA_DEMO.sugeridoDeLaMarca.titulo);
    const tareas = (await tareasDeMejoramiento(coordinadora, { sql, ahora: t })).tareas.map((x) => x.id);
    expect(tareas).toContain(`mej-marca:${pendiente.medicionId}`);
    const salidas = await sql`SELECT mm.salida, i.codigo, mm.hallazgo_id, mm.justificacion FROM mejora_marcas mm
      JOIN indicadores i ON i.id = mm.indicador_id ORDER BY mm.id`;
    const conHallazgo = salidas.filter((f) => f.salida === "hallazgo");
    expect(conHallazgo.map((f) => Number(f.hallazgo_id))).toEqual([Number((await hallazgo("desdeVerificacion")).id)]);
    const noRequiere = salidas.filter((f) => f.salida === "no_requiere");
    expect(noRequiere).toHaveLength(1);
    expect((noRequiere[0].justificacion as string).length).toBeGreaterThanOrEqual(10);
    // Ninguna salida es posterior a la siembra.
    const [{ tarde }] = await sql`SELECT count(*)::int AS tarde FROM mejora_marcas WHERE decidido_en > ${t}`;
    expect(tarde).toBe(0);
  });

  it("una no conformidad «Por formular» nacida de un hallazgo de verificación, y otro, de una recogida, con la sugerencia", async (ctx) => {
    await exigirMejoramiento(ctx);
    const t = await sembradaEn(sql);
    const nc = await hallazgo("desdeVerificacion");
    expect({ estado: nc.estado, clase: nc.clase, origen: nc.origen }).toEqual({
      estado: "por_formular",
      clase: "no_conformidad",
      origen: "control_documental",
    });
    expect(nc.verificacion_hallazgo_id).not.toBeNull();
    const otros = await sql`SELECT id, punto_uso_id, reaperturas FROM hallazgos WHERE id <> ${nc.verificacion_hallazgo_id} ORDER BY id`;
    const filas = otros.map((f) => ({ id: Number(f.id), puntoUsoId: Number(f.punto_uso_id), reaperturas: Number(f.reaperturas) }));
    const enganche = await engancheDeVerificacion(await sesionDe(sql, "coordinadora.sgc"), filas, { sql, ahora: t });
    const conSugerencia = filas.filter((f) => enganche.get(f.id)?.sugerir);
    expect(conSugerencia.length).toBeGreaterThanOrEqual(1);
    expect(conSugerencia.every((f) => enganche.get(f.id)?.puedeAbrir === true)).toBe(true);
    // El de la recogida del Archivo, reabierto una vez: su punto tiene un proceso con líder, que podrá aceptar o rechazar la no
    // conformidad, y lo corrigió una Admin SGC, que no podrá verificarla.
    const [recogida] = await sql`SELECT h.id, h.reaperturas, h.corregido_por, u.rol FROM hallazgos h
      LEFT JOIN usuarios u ON u.id = h.responsable_id WHERE h.origen = 'recogida'`;
    expect(conSugerencia.map((f) => f.id)).toContain(Number(recogida.id));
    expect(Number(recogida.reaperturas)).toBe(1);
    expect(recogida.rol).toBe("admin_sgc");
    const [{ lideres }] = await sql`SELECT count(*)::int AS lideres FROM hallazgos h
      JOIN punto_uso_procesos pp ON pp.punto_uso_id = h.punto_uso_id
      JOIN usuario_procesos up ON up.proceso_id = pp.proceso_id JOIN usuarios u ON u.id = up.usuario_id
      WHERE h.id = ${recogida.id} AND u.rol = 'lider_proceso' AND u.activo`;
    expect(lideres).toBeGreaterThanOrEqual(1);
  });

  it("la no conformidad del hallazgo de verificación cita un documento, así la página de un documento lista un hallazgo", async (ctx) => {
    await exigirMejoramiento(ctx);
    const nc = await hallazgo("desdeVerificacion");
    const [doc] = await sql`SELECT codigo FROM documentos WHERE id = ${nc.documento_id}`;
    expect(doc?.codigo).toBe("AIN-FO-01");
  });

  it("un impacto de norma vencido y escalado, sin hallazgo, con su sugerencia", async (ctx) => {
    await exigirMejoramiento(ctx);
    const t = await sembradaEn(sql);
    const impactos = await sql`SELECT i.id FROM impactos_normativos i
      WHERE i.estado = 'pendiente' AND i.vence_en < ${t} AND i.escalado_en IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM mejora_hallazgos h WHERE h.impacto_id = i.id)`;
    expect(impactos.length).toBeGreaterThanOrEqual(1);
    const ids = impactos.map((f) => Number(f.id));
    const enganche = await engancheDeImpactos(await sesionDe(sql, "coordinadora.sgc"), "documento", ids, { sql, ahora: t });
    expect(ids.some((id) => enganche.get(id)?.sugerir === true)).toBe(true);
  });

  it("una actividad abierta con dos trámites enlazados, uno publicado y otro en curso", async (ctx) => {
    await exigirMejoramiento(ctx);
    const h = await hallazgo("conTramites");
    expect(h.estado).toBe("en_ejecucion");
    const enlaces = await sql`SELECT e.actividad_id, a.estado AS actividad, tr.etapa FROM mejora_actividad_tramites e
      JOIN mejora_actividades a ON a.id = e.actividad_id JOIN tramites tr ON tr.id = e.tramite_id
      WHERE e.hallazgo_id = ${h.id} ORDER BY tr.id`;
    expect(enlaces).toHaveLength(2);
    expect(new Set(enlaces.map((e) => Number(e.actividad_id))).size).toBe(1);
    expect(["abierta", "en_proceso"]).toContain(enlaces[0].actividad);
    expect(enlaces.map((e) => e.etapa).filter((e) => e === "publicado")).toHaveLength(1);
    expect(enlaces.some((e) => !["publicado", "eliminado", "rechazado", "cancelado"].includes(e.etapa as string))).toBe(true);
  });

  it("otro «Por cerrar» con «documentos» y un trámite en publicación en su actividad: publicado, el cierre no pedirá cómo", async (ctx) => {
    await exigirMejoramiento(ctx);
    const h = await hallazgo("porCerrarConTramite");
    expect({ estado: h.estado, clase: h.clase }).toEqual({ estado: "por_cerrar", clase: "observacion" });
    const [ronda] = await sql`SELECT cambios FROM mejora_rondas WHERE hallazgo_id = ${h.id} AND numero = ${h.ronda}`;
    expect((ronda.cambios as { documentos: boolean }).documentos).toBe(true);
    const enlaces = await sql`SELECT tr.etapa, d.codigo FROM mejora_actividad_tramites e JOIN tramites tr ON tr.id = e.tramite_id
      JOIN documentos d ON d.id = tr.documento_id WHERE e.hallazgo_id = ${h.id}`;
    expect(enlaces.map((e) => ({ ...e }))).toEqual([{ etapa: "publicacion", codigo: "GBS-PR-01" }]);
  });

  it("un hallazgo «Por cerrar» cuyo análisis marcó «documentos», sin un trámite enlazado", async (ctx) => {
    await exigirMejoramiento(ctx);
    const h = await hallazgo("porCerrar");
    expect(h.estado).toBe("por_cerrar");
    const [ronda] = await sql`SELECT cambios FROM mejora_rondas WHERE hallazgo_id = ${h.id} AND numero = ${h.ronda}`;
    expect((ronda.cambios as { documentos: boolean }).documentos).toBe(true);
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM mejora_actividad_tramites WHERE hallazgo_id = ${h.id}`;
    expect(n).toBe(0);
  });
});
