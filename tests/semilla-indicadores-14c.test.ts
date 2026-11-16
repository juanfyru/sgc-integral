/**
 * La demo de la 14C (anexo §10) contra la base sembrada: el dato compartido con sus dos responsables y sus periodos en los
 * tres estados (uno pendiente y en plazo; reportados, uno corregido y otro con soporte; y cerrados por el cierre del mes); las
 * dos fichas que lo usan, con el valor copiado y su resultado; la desagregada por sede, con una sede en Crítico bajo un total
 * en Bien y otro mes con una sede «Sin casos» y otra «No aplica»; el compuesto general, con sus valores copiados iguales a lo
 * que dan sus componentes; y el restringido, que `consulta` no ve y cuyo componente de talento humano no ve `lider.cex`, que sí
 * ve el compuesto. Y que, sembrada la demo, una lectura no tiene nada que abrir ni que propagar. Solo lee (lo último, dentro de
 * una transacción que se revierte). Los periodos salen del plan de la siembra (`planDe14C`), contado desde su reloj. Como el
 * resto de la demo, se salta si ya se usó (ver `utiles/demo.ts`); `SEMILLA_RECIEN=1` lo exige.
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it, type TestContext } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { desgloseDe } from "@/db/consultas/indicadores/categorias";
import { asegurarPeriodosDeDatos, tareasDeDatos } from "@/db/consultas/indicadores/datos-periodos";
import { revisarFuentes } from "@/db/consultas/indicadores/dependencias";
import { asegurarMediciones } from "@/db/consultas/indicadores/mediciones";
import { propagar, valorDeComponente } from "@/db/consultas/indicadores/propagacion";
import {
  calendarioDeIndicadores,
  consultasDe,
  MOTIVO_SEDE_CERRADA,
  ofertadasDe,
  planDe14C,
} from "@/db/semillas/indicadores-demo-agenda";
import {
  CEX_01,
  CEX_AGENDA,
  CEX_CONSULTAS_TRIMESTRE,
  CEX_HIPERTENSION,
  DATO_CONSULTAS,
  GTH_01,
  SEDE,
  SGC_INDICE,
  SGC_INDICE_RESTRINGIDO,
} from "@/db/semillas/indicadores-demo-fichas";
import { componentesVisibles, puedeVerIndicador } from "@/lib/alcance";
import { comparar, deTexto, fraccion } from "@/lib/indicadores/formula/fraccion";
import type { Toma } from "@/lib/indicadores/tipos";
import { exigirDemo, sembradaEn } from "./utiles/demo";
import { sesionDe } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

/** Los cinco indicadores de la 14C. */
const DE_LA_14C = [CEX_AGENDA, CEX_CONSULTAS_TRIMESTRE, CEX_HIPERTENSION, SGC_INDICE, SGC_INDICE_RESTRINGIDO].map((f) => f.codigo);

async function datoSembrado() {
  const [d] = await sql`SELECT id FROM variables_compartidas WHERE nombre = ${DATO_CONSULTAS.nombre}`;
  return d ? Number(d.id) : null;
}

/** Los periodos del dato, por su clave. */
async function periodosDelDato(datoId: number) {
  return new Map((await sql`SELECT * FROM variable_valores WHERE variable_id = ${datoId}`).map((f) => [f.periodo as string, f]));
}

/**
 * Si lo sembrado en la 14C sigue como se sembró: los cinco indicadores activos y sin nada posterior a la siembra (versiones,
 * eventos de sus mediciones); el dato con sus periodos en el estado del plan y sin eventos posteriores, salvo el del soporte
 * (lo sube `registrarArchivo`, con la hora del reloj); y «Sede» con sus cuatro categorías activas.
 */
async function comoSeSembro(): Promise<{ intacta: boolean; motivo: string }> {
  const t = await sembradaEn(sql);
  const plan = planDe14C(t);
  const cambios: string[] = [];
  const estados = new Map((await sql`SELECT codigo, estado FROM indicadores WHERE codigo IN ${sql(DE_LA_14C)}`).map((f) => [f.codigo, f.estado]));
  for (const codigo of DE_LA_14C) if (estados.get(codigo) !== "activo") cambios.push(`${codigo} está ${estados.get(codigo) ?? "borrado"} (se sembró activo)`);
  const [c] = await sql`
    WITH ind AS (SELECT id FROM indicadores WHERE codigo IN ${sql(DE_LA_14C)})
    SELECT
      (SELECT count(*)::int FROM indicador_versiones WHERE indicador_id IN (SELECT id FROM ind) AND (creado_en > ${t} OR actualizado_en > ${t})) AS versiones,
      (SELECT count(*)::int FROM medicion_eventos e JOIN mediciones m ON m.id = e.medicion_id
        WHERE m.indicador_id IN (SELECT id FROM ind) AND e.creado_en > ${t}) AS eventos`;
  if (c.versiones > 0) cambios.push(`${c.versiones} versiones posteriores a la siembra`);
  if (c.eventos > 0) cambios.push(`${c.eventos} eventos de mediciones posteriores a la siembra`);

  const datoId = await datoSembrado();
  if (datoId === null) {
    cambios.push(`no existe el dato «${DATO_CONSULTAS.nombre}»`);
  } else {
    const periodos = await periodosDelDato(datoId);
    for (const mes of plan.meses) {
      const esperado = mes.clave === plan.pendiente.clave ? "pendiente" : mes.hasta.getTime() <= plan.corregido.hasta.getTime() ? "cerrado" : "reportado";
      const estado = periodos.get(mes.clave)?.estado;
      if (estado !== esperado) cambios.push(`el periodo ${mes.clave} del dato está ${estado ?? "sin abrir"} (se sembró ${esperado})`);
    }
    if (periodos.size !== plan.meses.length) cambios.push(`el dato tiene ${periodos.size} periodos (se sembraron ${plan.meses.length})`);
    const [e] = await sql`SELECT count(*) FILTER (WHERE ve.tipo <> 'soporte')::int AS otros, count(*) FILTER (WHERE ve.tipo = 'soporte')::int AS soportes
      FROM variable_eventos ve JOIN variable_valores vv ON vv.id = ve.valor_id WHERE vv.variable_id = ${datoId} AND ve.creado_en > ${t}`;
    if (e.otros > 0 || e.soportes !== 1) cambios.push(`${e.otros + e.soportes} eventos del dato posteriores a la siembra (se sembró el del soporte)`);
  }
  const [s] = await sql`SELECT count(*)::int AS total, count(*) FILTER (WHERE c.activo)::int AS activas
    FROM dimension_categorias c JOIN dimensiones d ON d.id = c.dimension_id WHERE d.nombre = ${SEDE.nombre}`;
  if (s.total !== SEDE.categorias.length || s.activas !== s.total) cambios.push(`«${SEDE.nombre}» tiene ${s.activas} de ${s.total} categorías activas (se sembraron ${SEDE.categorias.length})`);
  return { intacta: cambios.length === 0, motivo: cambios.length === 0 ? "la 14C está como se sembró" : `hay ${cambios.join("; ")}` };
}

async function exigir14C(ctx: TestContext): Promise<void> {
  const { intacta, motivo } = await comoSeSembro();
  exigirDemo(ctx, intacta, motivo);
}

async function indicador(codigo: string) {
  const [i] = await sql`SELECT * FROM indicadores WHERE codigo = ${codigo}`;
  if (!i) throw new Error(`La demo no trae ${codigo}`);
  return { id: Number(i.id), nivelAcceso: i.nivel_acceso as string };
}

async function medicion(codigo: string, periodo: string) {
  const [m] = await sql`SELECT m.* FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id WHERE i.codigo = ${codigo} AND m.periodo = ${periodo}`;
  if (!m) throw new Error(`${codigo} no tiene medición de ${periodo}`);
  return m;
}

/** Los valores de la medición sin categoría (el total, en un desagregado), por letra, con quién los puso. */
async function valores(medicionId: number) {
  const filas = await sql`SELECT iv.letra, mv.valor, mv.valor_exacto, mv.reportado_por FROM medicion_valores mv
    JOIN indicador_variables iv ON iv.id = mv.variable_id WHERE mv.medicion_id = ${medicionId} AND mv.categoria_id IS NULL`;
  return Object.fromEntries(
    filas.map((f) => [
      f.letra as string,
      {
        valor: Number(f.valor),
        // La fracción exacta, si el valor no cabe en cuatro decimales (anexo 14C, §3.2); si cabe, el valor mismo.
        fraccion: f.valor_exacto ? deTexto(f.valor_exacto as string) : fraccion(String(f.valor))!,
        porSistema: f.reportado_por === null,
      },
    ]),
  );
}

const eventosDe = async (periodoId: number) =>
  (await sql`SELECT tipo FROM variable_eventos WHERE valor_id = ${periodoId} ORDER BY creado_en, id`).map((e) => e.tipo as string);

describe("la demo de la 14C", () => {
  it("el dato compartido tiene sus dos responsables y sus periodos en los tres estados: pendiente, reportados y cerrados", async (ctx) => {
    await exigir14C(ctx);
    const sembrada = await sembradaEn(sql);
    const plan = planDe14C(sembrada);
    const datoId = (await datoSembrado())!;
    const responsables = await sql`SELECT u.usuario FROM variable_responsables r JOIN usuarios u ON u.id = r.usuario_id
      WHERE r.variable_id = ${datoId} ORDER BY u.usuario`;
    expect(responsables.map((r) => r.usuario)).toEqual(["consulta", "lider.cex"]);
    const periodos = await periodosDelDato(datoId);

    // Pendiente, en plazo: es tarea de quien responde por él, sin vencer.
    const pendiente = periodos.get(plan.pendiente.clave)!;
    expect(pendiente).toMatchObject({ estado: "pendiente", se_pide: true, valor: null });
    expect(new Date(pendiente.vence_en).getTime()).toBeGreaterThan(sembrada.getTime());
    const tarea = (await tareasDeDatos(sql, await sesionDe(sql, "consulta"))).find((t) => t.id === `dato:${Number(pendiente.id)}`);
    expect(tarea?.vence?.getTime()).toBeGreaterThan(sembrada.getTime());

    // Reportado, con su soporte.
    const conSoporte = periodos.get(plan.conSoporte.clave)!;
    expect(conSoporte).toMatchObject({ estado: "reportado", corregido: false });
    expect(Number(conSoporte.valor)).toBe(consultasDe(plan.conSoporte));
    const soportes = await sql`SELECT mime FROM archivos WHERE contexto = 'dato_compartido' AND contexto_id = ${conSoporte.id}`;
    expect(soportes.map((s) => s.mime)).toEqual(["application/pdf"]);
    expect(await eventosDe(Number(conSoporte.id))).toEqual(["reporte", "soporte"]);

    // Corregido antes del cierre (lo corrigió `lider.cex`, no quien lo reportó) y cerrado por el cierre del mes.
    const cal = calendarioDeIndicadores(sembrada);
    const corregido = periodos.get(plan.corregido.clave)!;
    expect(corregido).toMatchObject({ estado: "cerrado", corregido: true });
    expect(Number(corregido.valor)).toBe(consultasDe(plan.corregido));
    expect(await eventosDe(Number(corregido.id))).toEqual(["reporte", "correccion", "cierre"]);
    const [cierre] = await sql`SELECT id FROM cierres_indicadores WHERE to_char(mes, 'YYYY-MM') = ${cal.meses[3].clave}`;
    expect(Number(corregido.cierre_id)).toBe(Number(cierre.id));
    const [corrigio] = await sql`SELECT u.usuario FROM variable_eventos ve JOIN usuarios u ON u.id = ve.usuario_id
      WHERE ve.valor_id = ${corregido.id} AND ve.tipo = 'correccion'`;
    expect(corrigio.usuario).toBe("lider.cex");

    // Cada mes del plan está: los del cierre o antes, cerrados; los demás, reportados.
    for (const mes of plan.meses) {
      if (mes.clave === plan.pendiente.clave) continue;
      const esperado = mes.hasta.getTime() <= plan.corregido.hasta.getTime() ? "cerrado" : "reportado";
      expect(periodos.get(mes.clave)?.estado, mes.clave).toBe(esperado);
    }
  });

  it("las dos fichas que lo usan, de distinta periodicidad, tienen el valor copiado por el sistema y su resultado", async (ctx) => {
    await exigir14C(ctx);
    const sembrada = await sembradaEn(sql);
    const plan = planDe14C(sembrada);
    const cal = calendarioDeIndicadores(sembrada);

    // El uso de la agenda (mensual, mixto) del mes corregido: A es el dato ya corregido; B, lo que digitó quien mide.
    const agenda = await medicion(CEX_AGENDA.codigo, plan.corregido.clave);
    expect(agenda).toMatchObject({ estado: "cerrada", semaforo: "bien" });
    const v = await valores(Number(agenda.id));
    expect(v.A).toMatchObject({ valor: consultasDe(plan.corregido), porSistema: true });
    expect(v.B).toMatchObject({ valor: ofertadasDe(plan.corregido), porSistema: false });
    expect(deTexto(agenda.resultado_exacto)).not.toBeNull();
    // El del pendiente: el dato aún no está. Lo propio ya se reportó («Falta un dato»), salvo si el pendiente es el mes que
    // acaba de terminar (`meses[0]`, sembrando en los primeros días de un mes): sigue en plazo, por reportar.
    const espera = await medicion(CEX_AGENDA.codigo, plan.pendiente.clave);
    expect(espera).toMatchObject({ resultado_exacto: null });
    const yaReporto = plan.pendiente.clave !== cal.meses[0].clave;
    expect(Object.keys(await valores(Number(espera.id)))).toEqual(yaReporto ? ["B"] : []);

    // Las consultas del trimestre (trimestral, sin variables propias): los tres meses del dato, juntados.
    const trimestre = await medicion(CEX_CONSULTAS_TRIMESTRE.codigo, plan.trimestreCompleto.clave);
    expect(trimestre).toMatchObject({ estado: "cerrada", semaforo: "bien" });
    const meses = plan.meses.filter((m) => m.desde.getTime() >= plan.trimestreCompleto.desde.getTime() && m.hasta.getTime() <= plan.trimestreCompleto.hasta.getTime());
    expect(meses).toHaveLength(3);
    expect((await valores(Number(trimestre.id))).A).toMatchObject({ valor: meses.reduce((suma, m) => suma + consultasDe(m), 0), porSistema: true });
    if (plan.trimestreQueEspera) {
      const queEspera = await medicion(CEX_CONSULTAS_TRIMESTRE.codigo, plan.trimestreQueEspera.clave);
      expect(queEspera).toMatchObject({ resultado_exacto: null, estado: "abierta" });
    }
  });

  it("la desagregada por sede tiene un mes con el total en Bien y una sede en Crítico, y otro con una sede «Sin casos» y otra «No aplica»", async (ctx) => {
    await exigir14C(ctx);
    const cal = calendarioDeIndicadores(await sembradaEn(sql));
    const conCritica = await medicion(CEX_HIPERTENSION.codigo, cal.meses[2].clave);
    expect(conCritica).toMatchObject({ semaforo: "bien", cumple: true, categorias_en_critico: 1 });
    expect((await desgloseDe(sql, Number(conCritica.id)))?.enCritico).toEqual([SEDE.categorias[3]]);
    // El aviso de la sede en Crítico con el total en Bien, a quien hace seguimiento (quien reportó no lo recibe), sin leer.
    const avisos = await sql`SELECT u.usuario, n.titulo, n.leida_en FROM notificaciones n JOIN usuarios u ON u.id = n.usuario_id
      WHERE n.tipo = 'indicadores.alerta' AND n.entidad = 'medicion' AND n.entidad_id = ${conCritica.id}`;
    expect(avisos.map((a) => [a.usuario, a.leida_en])).toEqual([["coordinadora.sgc", null]]);
    expect(avisos[0].titulo).toContain(`Bien. En Crítico: ${SEDE.categorias[3]} (55 %).`);

    const otra = await medicion(CEX_HIPERTENSION.codigo, cal.meses[1].clave);
    expect(otra).toMatchObject({ semaforo: "bien", categorias_en_critico: 0 });
    const desglose = (await desgloseDe(sql, Number(otra.id)))!;
    expect(desglose.filas.map((f) => [f.categoria.nombre, f.estado])).toEqual([
      [SEDE.categorias[0], "completa"],
      [SEDE.categorias[1], "sin_casos"],
      [SEDE.categorias[2], "no_aplica"],
      [SEDE.categorias[3], "completa"],
    ]);
    expect(desglose.filas[2].categoria.noAplica).toBe(MOTIVO_SEDE_CERRADA);
    // El total lo escribió el sistema: la suma de las sedes que aplican (la «Sin casos» suma sus ceros).
    const total = await valores(Number(otra.id));
    expect([total.A, total.B].map((x) => [x.valor, x.porSistema])).toEqual([[57, true], [64, true]]);
  });

  it("el compuesto general tiene resultado y lo copiado de cada componente es lo que el componente da", async (ctx) => {
    await exigir14C(ctx);
    const cal = calendarioDeIndicadores(await sembradaEn(sql));
    const m = await medicion(SGC_INDICE.codigo, cal.trimestres[2].clave);
    expect(m).toMatchObject({ semaforo: "bien" });
    expect(deTexto(m.resultado_exacto)).not.toBeNull();
    const revision = (await revisarFuentes(sql, [Number(m.id)])).get(Number(m.id))!;
    expect(revision).toMatchObject({ coincide: true, faltan: [] });
    expect(revision.mediciones).toHaveLength(SGC_INDICE.variables.length);

    const copiados = await valores(Number(m.id));
    for (const variable of SGC_INDICE.variables) {
      if (variable.origen !== "indicador") throw new Error("El compuesto general solo toma indicadores");
      const fuente = await valorDeComponente(sql, {
        indicadorId: (await indicador(variable.codigo)).id,
        toma: variable.toma as Toma,
        periodo: m.periodo,
        desde: m.desde,
        hasta: m.hasta,
      });
      expect(fuente.estado, variable.codigo).toBe("listo");
      const copiado = copiados[variable.letra];
      expect(copiado.porSistema, variable.codigo).toBe(true);
      if (fuente.estado === "listo") expect(comparar(copiado.fraccion, fuente.valor), variable.codigo).toBe(0);
    }
  });

  it("el compuesto restringido lo aprueba Gerencia; `consulta` no lo ve y `lider.cex` lo ve sin ver su componente de talento humano", async (ctx) => {
    await exigir14C(ctx);
    const cal = calendarioDeIndicadores(await sembradaEn(sql));
    const restringido = await indicador(SGC_INDICE_RESTRINGIDO.codigo);
    expect(restringido.nivelAcceso).toBe("restringido");
    const [aprobo] = await sql`SELECT u.usuario FROM firmas f JOIN indicador_versiones v ON v.id = f.indicador_version_id
      JOIN usuarios u ON u.id = f.usuario_id WHERE v.indicador_id = ${restringido.id} AND f.firma = 'aprobo'`;
    expect(aprobo.usuario).toBe("gerente");

    const consulta = await sesionDe(sql, "consulta");
    const liderCex = await sesionDe(sql, "lider.cex");
    const gth = await indicador(GTH_01.codigo);
    const cex = await indicador(CEX_01.codigo);
    expect(await puedeVerIndicador(restringido.id, consulta, { sql })).toBe(false);
    expect(await puedeVerIndicador(restringido.id, liderCex, { sql })).toBe(true);
    expect(await puedeVerIndicador(gth.id, liderCex, { sql })).toBe(false);
    expect([...(await componentesVisibles(sql, liderCex, [gth.id, cex.id]))]).toEqual([cex.id]);
    // Gerencia ve los dos.
    expect((await componentesVisibles(sql, await sesionDe(sql, "gerente"), [gth.id, cex.id])).size).toBe(2);

    const m = await medicion(SGC_INDICE_RESTRINGIDO.codigo, cal.trimestres[2].clave);
    expect(m).toMatchObject({ semaforo: "bien" });
    expect((await revisarFuentes(sql, [Number(m.id)])).get(Number(m.id))).toMatchObject({ coincide: true, faltan: [] });
  });

  it("sembrada la demo, una lectura no tiene periodos que abrir ni valores que propagar", async (ctx) => {
    await exigir14C(ctx);
    const sembrada = await sembradaEn(sql);
    await revertida(sql, async (tx) => {
      expect(await asegurarPeriodosDeDatos({ sql: tx, ahora: sembrada })).toEqual({ abiertos: 0, quitados: 0 });
      expect(await asegurarMediciones({ sql: tx, ahora: sembrada })).toBe(0);
      expect(await propagar({ sql: tx, ahora: sembrada })).toEqual({ escritas: 0, noAplica: 0, fallidas: 0 });
    });
  });
});
