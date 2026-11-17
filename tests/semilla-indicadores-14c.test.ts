/**
 * La demo de la 14C (anexo §10) contra la base sembrada: el dato compartido con sus dos responsables y sus periodos en los
 * tres estados (uno pendiente y en plazo; reportados, uno corregido y otro con soporte; y cerrados por el cierre del mes); las
 * dos fichas que lo usan, con el valor copiado y su resultado; la desagregada por sede, con una sede en Crítico bajo un total
 * en Bien y otro mes con una sede «Sin casos» y otra «No aplica»; el compuesto general, con sus valores copiados iguales a lo
 * que dan sus componentes; y el restringido, que `consulta` no ve y cuyo componente de talento humano no ve `lider.cex`, que sí
 * ve el compuesto. Desde el complemento de la 14C, el soporte obligatorio del uso de la agenda, activado a mitad del plazo de
 * un mes: ese mes lo debe y el anterior no. Y que, sembrada la demo, una lectura no tiene nada que abrir ni que propagar.
 * Solo lee (lo último, dentro de una transacción que se revierte). Los periodos salen del plan de la siembra (`planDe14C`),
 * contado desde su reloj. Como el resto de la demo, se salta si ya se usó (ver `utiles/demo.ts`); `SEMILLA_RECIEN=1` lo exige.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it, type TestContext } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql, type Cliente } from "@/db/cliente";
import { desgloseDe } from "@/db/consultas/indicadores/categorias";
import { designarResponsablesDeDato, guardarDato } from "@/db/consultas/indicadores/datos";
import { asegurarPeriodosDeDatos, reportarDato, tareasDeDatos } from "@/db/consultas/indicadores/datos-periodos";
import { revisarFuentes } from "@/db/consultas/indicadores/dependencias";
import { cambiarEstadoDeCategoria } from "@/db/consultas/indicadores/dimensiones";
import { abrirCambio } from "@/db/consultas/indicadores/fichas";
import { asegurarMediciones, reportar } from "@/db/consultas/indicadores/mediciones";
import { cambiarOperacion, designar } from "@/db/consultas/indicadores/operacion";
import { propagar, valorDeComponente } from "@/db/consultas/indicadores/propagacion";
import { bloquearParaSoporte, dejarSoporteSubido } from "@/db/consultas/indicadores/soportes";
import {
  agendaDeIndicadores,
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
import { porcentajeDeCumplimiento } from "@/lib/indicadores/cumplimiento";
import { CERO, comparar, deTexto, dividir, entero, fraccion, sumar } from "@/lib/indicadores/formula/fraccion";
import { textoValor } from "@/lib/indicadores/textos";
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

/**
 * Las designaciones que siembra la agenda en los cinco de la 14C y en `GTH-IND-01` (el componente que `lider.cex` no debe
 * ver), «función:usuario» en orden: de ellas dependen quién ve el restringido y quién recibe los avisos.
 */
const DESIGNADOS_SEMBRADOS: Record<string, string[]> = {
  [CEX_AGENDA.codigo]: ["analiza:lider.cex", "mide:lider.cex"],
  [CEX_CONSULTAS_TRIMESTRE.codigo]: ["analiza:lider.cex"],
  [CEX_HIPERTENSION.codigo]: ["analiza:lider.cex", "mide:lider.cex", "seguimiento:coordinadora.sgc"],
  [SGC_INDICE.codigo]: ["analiza:coordinadora.sgc"],
  [SGC_INDICE_RESTRINGIDO.codigo]: ["analiza:coordinadora.sgc", "seguimiento:lider.cex"],
  [GTH_01.codigo]: ["analiza:lider.gth", "mide:lider.gth"],
};

/** Quienes responden por el dato compartido, como los sembró la agenda. */
const RESPONSABLES_SEMBRADOS = ["consulta", "lider.cex"];

async function datoSembrado(db: Cliente = sql) {
  const [d] = await db`SELECT id FROM variables_compartidas WHERE nombre = ${DATO_CONSULTAS.nombre}`;
  return d ? Number(d.id) : null;
}

/** Los periodos del dato, por su clave. */
async function periodosDelDato(datoId: number, db: Cliente = sql) {
  return new Map((await db`SELECT * FROM variable_valores WHERE variable_id = ${datoId}`).map((f) => [f.periodo as string, f]));
}

/**
 * Si lo sembrado sigue como se sembró, para todo lo que los casos leen y el recorrido de «Qué probar y cómo (Fase 14C)»
 * cambia: los cinco indicadores de la 14C activos; en **toda** la demo de indicadores, nada posterior a la siembra
 * (indicadores o datos nuevos, versiones, firmas, eventos de mediciones, metas programadas, bajas ni cierres: los compuestos
 * dependen de sus componentes, y la lectura en vacío del último caso, de todo); las designaciones de los cinco y de
 * `GTH-IND-01` (`DESIGNADOS_SEMBRADOS`); quienes responden por el dato; sus periodos en el estado del plan y sin eventos
 * posteriores, salvo el del soporte (lo sube `registrarArchivo`, con la hora del reloj); «Sede» con sus cuatro categorías
 * activas, ninguna nueva; y, desde el complemento de la 14C, el soporte obligatorio del uso de la agenda desde la hora en que
 * lo activó la agenda (desactivarlo lo borra y volver a activarlo lo mueve). Lo que no deja hora (quitar una designación o un
 * responsable) se compara con lo sembrado.
 */
async function comoSeSembro(db: Cliente = sql): Promise<{ intacta: boolean; motivo: string }> {
  const t = await sembradaEn(db);
  const plan = planDe14C(t);
  const cambios: string[] = [];
  const estados = new Map((await db`SELECT codigo, estado FROM indicadores WHERE codigo IN ${db(DE_LA_14C)}`).map((f) => [f.codigo, f.estado]));
  for (const codigo of DE_LA_14C) if (estados.get(codigo) !== "activo") cambios.push(`${codigo} está ${estados.get(codigo) ?? "borrado"} (se sembró activo)`);
  const [c] = await db`SELECT
      (SELECT count(*)::int FROM indicadores WHERE creado_en > ${t}) AS indicadores,
      (SELECT count(*)::int FROM variables_compartidas WHERE creado_en > ${t}) AS datos,
      (SELECT count(*)::int FROM indicador_versiones WHERE creado_en > ${t} OR actualizado_en > ${t}) AS versiones,
      (SELECT count(*)::int FROM firmas WHERE indicador_version_id IS NOT NULL AND creado_en > ${t}) AS firmas,
      (SELECT count(*)::int FROM medicion_eventos WHERE creado_en > ${t}) AS eventos,
      (SELECT count(*)::int FROM indicador_metas WHERE programada_en > ${t}) AS metas,
      (SELECT count(*)::int FROM indicadores WHERE baja_en > ${t}) AS bajas,
      (SELECT count(*)::int FROM cierres_indicadores WHERE cerrado_en > ${t}) AS cierres`;
  for (const clave of ["indicadores", "datos", "versiones", "firmas", "eventos", "metas", "bajas", "cierres"]) {
    if (Number(c[clave]) > 0) cambios.push(`${c[clave]} ${clave} posteriores a la siembra`);
  }
  const designados = await db`SELECT i.codigo, d.funcion || ':' || u.usuario AS designado FROM indicador_designados d
    JOIN indicadores i ON i.id = d.indicador_id JOIN usuarios u ON u.id = d.usuario_id
    WHERE i.codigo IN ${db(Object.keys(DESIGNADOS_SEMBRADOS))} ORDER BY 1, 2`;
  for (const [codigo, sembrados] of Object.entries(DESIGNADOS_SEMBRADOS)) {
    const hoy = designados.filter((d) => d.codigo === codigo).map((d) => d.designado as string);
    if (hoy.join() !== sembrados.join()) cambios.push(`${codigo} tiene designados ${hoy.join(", ") || "ninguno"} (se sembraron ${sembrados.join(", ")})`);
  }

  const datoId = await datoSembrado(db);
  if (datoId === null) {
    cambios.push(`no existe el dato «${DATO_CONSULTAS.nombre}»`);
  } else {
    const responden = (await db`SELECT u.usuario FROM variable_responsables r JOIN usuarios u ON u.id = r.usuario_id
      WHERE r.variable_id = ${datoId} AND r.designado_en <= ${t} ORDER BY u.usuario`).map((r) => r.usuario as string);
    const [{ n: responsables }] = await db`SELECT count(*)::int AS n FROM variable_responsables WHERE variable_id = ${datoId}`;
    if (responden.join() !== RESPONSABLES_SEMBRADOS.join() || responsables !== RESPONSABLES_SEMBRADOS.length) {
      cambios.push(`responden por el dato ${responsables} personas (se sembraron ${RESPONSABLES_SEMBRADOS.join(" y ")})`);
    }
    const periodos = await periodosDelDato(datoId, db);
    for (const mes of plan.meses) {
      const esperado = mes.clave === plan.pendiente.clave ? "pendiente" : mes.hasta.getTime() <= plan.corregido.hasta.getTime() ? "cerrado" : "reportado";
      const estado = periodos.get(mes.clave)?.estado;
      if (estado !== esperado) cambios.push(`el periodo ${mes.clave} del dato está ${estado ?? "sin abrir"} (se sembró ${esperado})`);
    }
    if (periodos.size !== plan.meses.length) cambios.push(`el dato tiene ${periodos.size} periodos (se sembraron ${plan.meses.length})`);
    const [e] = await db`SELECT count(*) FILTER (WHERE ve.tipo <> 'soporte')::int AS otros, count(*) FILTER (WHERE ve.tipo = 'soporte')::int AS soportes
      FROM variable_eventos ve JOIN variable_valores vv ON vv.id = ve.valor_id WHERE vv.variable_id = ${datoId} AND ve.creado_en > ${t}`;
    if (e.otros > 0 || e.soportes !== 1) cambios.push(`${e.otros + e.soportes} eventos del dato posteriores a la siembra (se sembró el del soporte)`);
  }
  const [s] = await db`SELECT count(*)::int AS total, count(*) FILTER (WHERE c.activo)::int AS activas,
      count(*) FILTER (WHERE c.creado_en > ${t})::int AS nuevas
    FROM dimension_categorias c JOIN dimensiones d ON d.id = c.dimension_id WHERE d.nombre = ${SEDE.nombre}`;
  if (s.total !== SEDE.categorias.length || s.activas !== s.total || s.nuevas > 0) {
    cambios.push(`«${SEDE.nombre}» tiene ${s.activas} de ${s.total} categorías activas (se sembraron ${SEDE.categorias.length})`);
  }
  const activacion = activacionDelSoporte(t);
  const [soporte] = await db`SELECT soporte_obligatorio_desde FROM indicadores WHERE codigo = ${CEX_AGENDA.codigo}`;
  const desde = soporte?.soporte_obligatorio_desde ? new Date(soporte.soporte_obligatorio_desde) : null;
  if (desde?.getTime() !== activacion.momento.getTime()) {
    const hoy = desde ? `exige soporte desde ${desde.toISOString()}` : "no exige soporte";
    cambios.push(`${CEX_AGENDA.codigo} ${hoy} (se sembró desde ${activacion.momento.toISOString()})`);
  }
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

/** La activación del soporte obligatorio que siembra la agenda (complemento de la 14C), con su hora. */
function activacionDelSoporte(sembrada: Date) {
  const paso = agendaDeIndicadores(sembrada).find((p) => p.hecho.tipo === "soporte");
  if (!paso || paso.hecho.tipo !== "soporte") throw new Error("La agenda no activa el soporte obligatorio");
  return { momento: paso.momento, ...paso.hecho };
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
    // El aviso de la sede en Crítico con el total en Bien, a quien hace seguimiento (quien reportó no lo recibe). Que siga sin
    // leer no es de la semilla sino del uso: si `coordinadora.sgc` ya lo abrió, la demo ya se usó (al final del caso).
    const avisos = await sql`SELECT u.usuario, n.titulo, n.leida_en FROM notificaciones n JOIN usuarios u ON u.id = n.usuario_id
      WHERE n.tipo = 'indicadores.alerta' AND n.entidad = 'medicion' AND n.entidad_id = ${conCritica.id}`;
    expect(avisos.map((a) => a.usuario)).toEqual(["coordinadora.sgc"]);
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
    exigirDemo(ctx, avisos[0].leida_en === null, "coordinadora.sgc ya leyó el aviso de la sede en Crítico de CEX-ID-003");
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

    // Aparte de la copia: el resultado es el promedio de los cinco cumplimientos, cada uno calculado aquí con la regla pura
    // (`porcentajeDeCumplimiento`) desde el resultado, el «cumple» y la meta aplicada de la medición del componente y la
    // tendencia de su versión. Es la cifra que citan los documentos: «91 %».
    let suma = CERO;
    for (const variable of SGC_INDICE.variables) {
      if (variable.origen !== "indicador") continue;
      const [c] = await sql`SELECT m.resultado_exacto, m.cumple, m.meta_aplicada, v.tendencia FROM mediciones m
        JOIN indicadores i ON i.id = m.indicador_id JOIN indicador_versiones v ON v.id = m.version_id
        WHERE i.codigo = ${variable.codigo} AND m.periodo = ${m.periodo}`;
      const cumplimiento = porcentajeDeCumplimiento({
        resultado: deTexto(c.resultado_exacto),
        cumple: c.cumple,
        meta: fraccion(String(c.meta_aplicada)),
        tendencia: c.tendencia,
      });
      expect(cumplimiento, variable.codigo).not.toBeNull();
      suma = sumar(suma, cumplimiento!);
    }
    const promedio = dividir(suma, entero(SGC_INDICE.variables.length))!;
    expect(comparar(deTexto(m.resultado_exacto), promedio)).toBe(0);
    expect(textoValor(promedio, { sufijo: " %", decimales: SGC_INDICE.decimales })).toBe("91 %");
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

    // Lo que `lider.cex` lee de la ficha no nombra el área del componente que no ve: el propósito es de quien ve el indicador.
    const [ficha] = await sql`SELECT v.nombre, v.proposito FROM indicador_versiones v WHERE v.indicador_id = ${restringido.id} AND v.estado = 'aprobada'`;
    expect(`${ficha.nombre as string} ${ficha.proposito as string}`).not.toMatch(/talento humano|ausentismo/i);

    const m = await medicion(SGC_INDICE_RESTRINGIDO.codigo, cal.trimestres[2].clave);
    expect(m).toMatchObject({ semaforo: "bien" });
    expect((await revisarFuentes(sql, [Number(m.id)])).get(Number(m.id))).toMatchObject({ coincide: true, faltan: [] });
  });

  it("el uso de la agenda exige soporte desde la mitad del plazo de un mes: ese mes lo debe y el anterior, reportado y vencido, no", async (ctx) => {
    await exigir14C(ctx);
    const sembrada = await sembradaEn(sql);
    const cal = calendarioDeIndicadores(sembrada);
    const activacion = activacionDelSoporte(sembrada);
    expect([activacion.debe, activacion.noDebe]).toEqual([cal.meses[1].clave, cal.meses[2].clave]);
    const [i] = await sql`SELECT soporte_obligatorio, soporte_obligatorio_desde FROM indicadores WHERE codigo = ${CEX_AGENDA.codigo}`;
    expect(i.soporte_obligatorio).toBe(true);
    expect(new Date(i.soporte_obligatorio_desde).getTime()).toBe(activacion.momento.getTime());

    // La marca de cada una, decidida al activar (anexo del complemento, §4.2): la que seguía en su plazo lo debe; la que
    // quien mide ya había reportado, con la fecha límite pasada, no.
    const debe = await medicion(CEX_AGENDA.codigo, activacion.debe);
    const noDebe = await medicion(CEX_AGENDA.codigo, activacion.noDebe);
    expect([debe.debe_soporte, noDebe.debe_soporte]).toEqual([true, false]);
    expect(new Date(debe.reportada_en).getTime()).toBeLessThan(activacion.momento.getTime());
    expect(new Date(debe.vence_en).getTime()).toBeGreaterThan(activacion.momento.getTime());
    expect(new Date(noDebe.reportada_en).getTime()).toBeLessThan(activacion.momento.getTime());
    expect(new Date(noDebe.vence_en).getTime()).toBeLessThan(activacion.momento.getTime());
    // La que lo debe queda sin él, para el recorrido: es tarea de quien mide hasta que lo adjunte.
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM archivos WHERE contexto = 'medicion' AND contexto_id = ${debe.id}`;
    expect(n).toBe(0);
    expect(debe.estado).toBe("abierta");
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

describe("la guarda de la 14C ve lo que cambia el recorrido", () => {
  /**
   * Cada paso de «Qué probar y cómo (Fase 14C)» y de su complemento que cambia algo que estos casos leen, hecho con las
   * funciones del dominio en una transacción que se revierte: después de él, `comoSeSembro` lo nota (y los casos saltan en
   * vez de fallar). El cierre del mes (paso 4) no se prueba aquí (ningún test deja ni hace un cierre de la demo): lo ve la
   * cuenta de cierres posteriores, y sus eventos, la de eventos. Leer el aviso de la sede en Crítico lo decide el caso de la
   * desagregada (`exigirDemo`).
   */
  it("un dato nuevo, el dato reportado, la rejilla corregida, una sede desactivada, un componente corregido, un cambio de ficha, las designaciones, los responsables y el soporte del uso de la agenda", async (ctx) => {
    await exigir14C(ctx);
    const plan = planDe14C(await sembradaEn(sql));
    const cal = calendarioDeIndicadores(await sembradaEn(sql));
    const pasos: [string, (tx: TransactionSql) => Promise<unknown>, RegExp][] = [
      [
        "paso 1: un dato nuevo",
        async (tx) =>
          guardarDato(
            await sesionDe(tx, "coordinadora.sgc"),
            { procesoId: (await tx`SELECT id FROM procesos WHERE sigla = 'AIN'`)[0].id, nombre: `zz_dato_${Date.now()}`, periodicidad: "mensual", consolidacion: "suma", admiteNegativos: false, plazoReporteDias: 10 },
            { sql: tx },
          ),
        /1 datos posteriores a la siembra/,
      ],
      [
        "pasos 2 y 3: el dato pendiente se reporta",
        async (tx) =>
          reportarDato(
            await sesionDe(tx, "consulta"),
            { periodoId: Number((await periodosDelDato((await datoSembrado(tx))!, tx)).get(plan.pendiente.clave)!.id), valor: "1600", confirmado: true },
            { sql: tx },
          ),
        new RegExp(`el periodo ${plan.pendiente.clave} del dato está reportado`),
      ],
      [
        "paso 5: la rejilla se corrige",
        async (tx) => {
          const m = await tx`SELECT m.id, m.categorias FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id
            WHERE i.codigo = ${CEX_HIPERTENSION.codigo} AND m.periodo = ${cal.meses[1].clave}`;
          const principal = (m[0].categorias as { id: number; nombre: string }[]).find((c) => c.nombre === SEDE.categorias[0])!;
          return reportar(
            await sesionDe(tx, "lider.cex"),
            { medicionId: Number(m[0].id), valores: {}, parcial: false, confirmado: true, filas: [{ categoriaId: principal.id, valores: { A: "42" } }] },
            { sql: tx },
          );
        },
        /eventos posteriores a la siembra/,
      ],
      [
        "paso 6: una sede se desactiva",
        async (tx) => {
          const [c] = await tx`SELECT c.id FROM dimension_categorias c JOIN dimensiones d ON d.id = c.dimension_id
            WHERE d.nombre = ${SEDE.nombre} AND c.nombre = ${SEDE.categorias[2]}`;
          return cambiarEstadoDeCategoria(await sesionDe(tx, "coordinadora.sgc"), { id: Number(c.id), activo: false }, { sql: tx });
        },
        /«Sede» tiene 3 de 4 categorías activas/,
      ],
      [
        "paso 7: un componente se corrige",
        async (tx) => {
          const [m] = await tx`SELECT m.id FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id
            WHERE i.codigo = 'SGC-IND-01' AND m.periodo = ${cal.trimestres[2].clave}`;
          return reportar(await sesionDe(tx, "coordinadora.sgc"), { medicionId: Number(m.id), valores: { A: "4", B: "5" }, parcial: false, confirmado: true }, { sql: tx });
        },
        /eventos posteriores a la siembra/,
      ],
      [
        "paso 10: se abre un cambio de una ficha aprobada",
        async (tx) => abrirCambio(await sesionDe(tx, "coordinadora.sgc"), (await indicador("SGC-IND-02")).id, { sql: tx }),
        /versiones posteriores a la siembra/,
      ],
      [
        "alguien designa a `consulta` en el restringido",
        async (tx) =>
          designar(
            await sesionDe(tx, "coordinadora.sgc"),
            { indicadorId: (await indicador(SGC_INDICE_RESTRINGIDO.codigo)).id, funcion: "seguimiento", usuarioIds: [(await sesionDe(tx, "lider.cex")).usuarioId, (await sesionDe(tx, "consulta")).usuarioId] },
            { sql: tx },
          ),
        new RegExp(`${SGC_INDICE_RESTRINGIDO.codigo} tiene designados`),
      ],
      [
        "alguien quita el seguimiento de `lider.cex`",
        async (tx) =>
          designar(await sesionDe(tx, "coordinadora.sgc"), { indicadorId: (await indicador(SGC_INDICE_RESTRINGIDO.codigo)).id, funcion: "seguimiento", usuarioIds: [] }, { sql: tx }),
        new RegExp(`${SGC_INDICE_RESTRINGIDO.codigo} tiene designados analiza:coordinadora.sgc \\(`),
      ],
      [
        "alguien deja de responder por el dato",
        async (tx) =>
          designarResponsablesDeDato(
            await sesionDe(tx, "coordinadora.sgc"),
            { datoId: (await datoSembrado(tx))!, usuarioIds: [(await sesionDe(tx, "consulta")).usuarioId] },
            { sql: tx },
          ),
        /responden por el dato 1 personas/,
      ],
      [
        "complemento: se adjunta el soporte que debe el uso de la agenda",
        async (tx) => {
          const [m] = await tx`SELECT m.id FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id
            WHERE i.codigo = ${CEX_AGENDA.codigo} AND m.periodo = ${activacionDelSoporte(await sembradaEn(tx)).debe}`;
          await bloquearParaSoporte(tx, Number(m.id));
          await tx`INSERT INTO archivos (rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256, contexto, contexto_id)
            VALUES ('evidencia', ${`zz/${Date.now()}.pdf`}, 'soporte.pdf', 'pdf', 'application/pdf', 10, ${"a".repeat(64)}, 'medicion', ${m.id})`;
          return dejarSoporteSubido(tx, { medicionId: Number(m.id), usuarioId: (await sesionDe(tx, "lider.cex")).usuarioId, nombre: "soporte.pdf", ahora: new Date() });
        },
        /eventos posteriores a la siembra/,
      ],
      [
        "complemento: el uso de la agenda deja de exigir soporte",
        async (tx) => {
          const [i] = await tx`SELECT id, plazo_reporte_dias, inicio_medicion, nivel_acceso FROM indicadores WHERE codigo = ${CEX_AGENDA.codigo}`;
          return cambiarOperacion(
            await sesionDe(tx, "coordinadora.sgc"),
            { indicadorId: Number(i.id), plazoReporteDias: Number(i.plazo_reporte_dias), inicioMedicion: i.inicio_medicion, soporteObligatorio: false, nivelAcceso: i.nivel_acceso },
            { sql: tx },
          );
        },
        new RegExp(`${CEX_AGENDA.codigo} no exige soporte`),
      ],
    ];
    for (const [nombre, paso, motivo] of pasos) {
      await revertida(sql, async (tx) => {
        expect((await comoSeSembro(tx)).intacta, nombre).toBe(true);
        await paso(tx);
        const despues = await comoSeSembro(tx);
        expect(despues.intacta, nombre).toBe(false);
        expect(despues.motivo, nombre).toMatch(motivo);
      });
    }
  });
});
