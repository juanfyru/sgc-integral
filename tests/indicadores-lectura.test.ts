/**
 * Las lecturas del módulo de indicadores (Fase 14A, Tarea 15; spec §8.10, §11, §12.2, §12.3 y §12.7): la lista con sus
 * filtros y su barra de estados, lo que la persona puede hacer con un indicador, los resultados del año (filas, acumulado
 * y series de las gráficas) y la matriz del año. Contra la BD de desarrollo, dentro de una transacción que se revierte;
 * cada caso crea sus propios procesos y filtra por ellos, con la hora inyectada: lo que ya trae la base no cambia las
 * cuentas.
 */
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { analizar } from "@/db/consultas/indicadores/analisis";
import { asegurarConstancias, registrarConstancia } from "@/db/consultas/indicadores/constancias";
import { abrirCambio } from "@/db/consultas/indicadores/fichas";
import { resolverImpactoNoAfecta } from "@/db/consultas/indicadores/impactos";
import { desagregacionDelAnio, desgloseDelAnio, obtenerIndicador, resultadosDelAnio } from "@/db/consultas/indicadores/lectura";
import { consultaDeFiltro, filtroDeConsulta, listarIndicadores, type FiltroDeLista } from "@/db/consultas/indicadores/lista";
import { matrizDelAnio, type CeldaDeMatriz } from "@/db/consultas/indicadores/matriz";
import { asegurarMediciones, marcarNoAplica, reportar } from "@/db/consultas/indicadores/mediciones";
import { retirar } from "@/db/consultas/indicadores/operacion";
import { cambiarEstadoNorma } from "@/db/consultas/normograma/normas";
import {
  desagregadoDePrueba,
  dimensionDePrueba,
  filasDeMaqueta,
  indicadorDePrueba,
  nadaQueMedir,
  versionAutomatica,
  versionNueva,
  versionTrimestral,
  type IndicadorDePrueba,
  type OpcionesIndicadorDePrueba,
} from "./utiles/indicadores";
import { MOTIVO_NADA_QUE_MEDIR } from "@/lib/indicadores/tipos";
import { normaDePrueba } from "./utiles/normograma";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

/** Mediados de octubre de 2026: el tercer trimestre terminó y venció; el cuarto no ha terminado. */
const AHORA = new Date("2026-10-20T15:00:00Z");
/** Aprobado antes de 2026: ningún periodo de 2026 es histórico. */
const APROBADA = new Date("2025-12-15T15:00:00Z");
const opc = (tx: TransactionSql, ahora = AHORA) => ({ sql: tx, ahora });

let consecutivo = 0;

/** Un proceso que solo existe en la transacción. */
async function proceso(tx: TransactionSql): Promise<{ id: number; nombre: string }> {
  consecutivo += 1;
  const sigla = `L${Date.now() % 100_000_000}${consecutivo}`;
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const nombre = `Proceso de lectura ${sigla}`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${nombre}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id`;
  return { id: Number(p.id), nombre };
}

/** Un trimestral del proceso, aprobado antes de 2026, que se mide desde `inicio`. */
const trimestral = (tx: TransactionSql, procesoId: number, o: OpcionesIndicadorDePrueba = {}) =>
  indicadorDePrueba(tx, { procesoId, periodicidad: "trimestral", inicioMedicion: "2026-T1", aprobadaEn: APROBADA, ...o });

/**
 * Un indicador con nombre, tipo o subproceso propios: nace en borrador (la versión aprobada no se modifica), se le cambia
 * lo pedido y se aprueba como lo deja `indicadorDePrueba`.
 */
async function aprobadoCon(
  tx: TransactionSql,
  o: OpcionesIndicadorDePrueba,
  c: { nombre?: string; tipo?: string; subprocesoId?: number },
): Promise<IndicadorDePrueba> {
  const ind = await indicadorDePrueba(tx, { periodicidad: "trimestral", inicioMedicion: "2026-T1", ...o, estado: "borrador" });
  if (c.nombre) await tx`UPDATE indicador_versiones SET nombre = ${c.nombre} WHERE id = ${ind.versionId}`;
  if (c.tipo) {
    await tx`UPDATE indicador_versiones SET tipo_id = t.id, tipo_nombre = t.nombre FROM tipos_indicador t
      WHERE t.nombre = ${c.tipo} AND indicador_versiones.id = ${ind.versionId}`;
  }
  if (c.subprocesoId) {
    await tx`UPDATE indicador_versiones SET subproceso_id = s.id, subproceso_nombre = s.nombre FROM subprocesos s
      WHERE s.id = ${c.subprocesoId} AND indicador_versiones.id = ${ind.versionId}`;
  }
  const gerente = await usuarioDePrueba(tx, { rol: "gerencia" });
  await tx`UPDATE indicador_versiones SET estado = 'aprobada', elaborada_por = creado_por, elaborada_en = ${APROBADA},
      huella = ${"0".repeat(64)}, rige_desde = ${o.inicioMedicion ?? "2026-T1"}, aprobada_por = ${gerente.usuarioId}, aprobada_en = ${APROBADA}
    WHERE id = ${ind.versionId}`;
  await tx`UPDATE indicadores SET estado = 'activo' WHERE id = ${ind.id}`;
  return ind;
}

/** Abre los periodos del indicador y reporta los de `valores` a nombre de `quien`. */
async function medir(tx: TransactionSql, quien: SesionFlujo, ind: { id: number }, valores: Record<string, Record<string, string>>, ahora = AHORA) {
  await asegurarMediciones({ sql: tx, ahora, indicadorId: ind.id });
  const ids: Record<string, number> = {};
  for (const [periodo, v] of Object.entries(valores)) {
    const [m] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = ${periodo}`;
    await reportar(quien, { medicionId: Number(m.id), valores: v, parcial: false, confirmado: true }, opc(tx, ahora));
    ids[periodo] = Number(m.id);
  }
  return ids;
}

const lista = (tx: TransactionSql, sesion: SesionFlujo, filtro: FiltroDeLista) => listarIndicadores(sesion, filtro, opc(tx));
const codigos = async (tx: TransactionSql, sesion: SesionFlujo, filtro: FiltroDeLista) =>
  (await lista(tx, sesion, filtro)).filas.map((f) => f.codigo).sort();

/** Los meses que cubre cada celda, en orden: deben cubrir de enero a diciembre sin huecos ni solapes. */
const meses = (celdas: CeldaDeMatriz[]) => celdas.map((c) => [c.desdeMes, c.hastaMes]);
function cubreElAnio(celdas: CeldaDeMatriz[]) {
  let siguiente = 1;
  for (const c of celdas) {
    expect(c.desdeMes).toBe(siguiente);
    expect(c.hastaMes).toBeGreaterThanOrEqual(c.desdeMes);
    siguiente = c.hastaMes + 1;
  }
  expect(siguiente).toBe(13);
}

describe("filtroDeConsulta", () => {
  it("lee los nombres de los enlaces de tareas y avisos, y los demás filtros; lo inválido se ignora", () => {
    expect(filtroDeConsulta({ reporte: "por-reportar", participo: "1" })).toEqual({ reporte: "por-reportar", participo: true });
    expect(filtroDeConsulta({ reporte: "vencida", proceso: "12" })).toEqual({ reporte: "vencida", procesoId: 12 });
    expect(
      filtroDeConsulta({
        proceso: "3",
        subproceso: "4",
        clasificacion: "5",
        tipo: "6",
        semaforo: "sin-dato",
        reporte: "requiere-accion",
        texto: "  auditorías ",
        retirados: "1",
      }),
    ).toEqual({ procesoId: 3, subprocesoId: 4, clasificacionId: 5, tipoId: 6, semaforo: "sin-dato", reporte: "requiere-accion", texto: "auditorías", retirados: true });
    expect(filtroDeConsulta({ q: "triage" })).toEqual({ texto: "triage" });
    expect(filtroDeConsulta({ proceso: "x", semaforo: "verde", reporte: "todo", participo: "no", texto: "   ", retirados: "0", tipo: "-1" })).toEqual({});
    expect(filtroDeConsulta({ proceso: ["7", "8"] })).toEqual({ procesoId: 7 });
    expect(filtroDeConsulta({ texto: "x".repeat(300) }).texto).toHaveLength(100);
  });

  it("envio=pendiente, el de los enlaces de las constancias de envío al ente, va y vuelve con los demás", () => {
    expect(filtroDeConsulta({ envio: "pendiente", participo: "1" })).toEqual({ envio: "pendiente", participo: true });
    expect(filtroDeConsulta({ envio: "pendiente", proceso: "12" })).toEqual({ envio: "pendiente", procesoId: 12 });
    expect(filtroDeConsulta({ envio: "vencido" })).toEqual({});
    expect(consultaDeFiltro({ procesoId: 12, envio: "pendiente" })).toBe("proceso=12&envio=pendiente");
    expect(filtroDeConsulta(Object.fromEntries(new URLSearchParams(consultaDeFiltro({ envio: "pendiente", participo: true }))))).toEqual({
      envio: "pendiente",
      participo: true,
    });
  });
});

describe("la lista", () => {
  it("la lista trae el último periodo terminado de cada indicador, con su resultado, su meta, su estado y su tendencia", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const quien = await usuarioDePrueba(tx, { rol: "consulta" });
      const ind = await trimestral(tx, p.id, { mide: [quien.usuarioId], analiza: [quien.usuarioId] });
      const ids = await medir(tx, quien, ind, { "2026-T1": { A: "5", B: "5" }, "2026-T2": { A: "5", B: "6" }, "2026-T3": { A: "3", B: "5" } });
      await analizar(quien, { medicionId: ids["2026-T2"], analisis: "La auditoría de Farmacia se aplazó a julio" }, opc(tx));
      await analizar(
        quien,
        { medicionId: ids["2026-T3"], causa: "Dos auditores internos incapacitados en agosto", accionPropuesta: "Formar dos auditores suplentes" },
        opc(tx),
      );

      const { filas } = await lista(tx, quien, { procesoId: p.id });
      expect(filas).toHaveLength(1);
      const [f] = filas;
      expect(f).toMatchObject({
        id: ind.id,
        codigo: ind.codigo,
        nombre: `Indicador de prueba ${ind.codigo}`,
        proceso: p.nombre,
        subproceso: null,
        periodicidad: "trimestral",
        restringido: false,
        retirado: false,
        periodo: "2026-T3",
        resultado: "60 %",
        meta: "≥ 90 %",
        semaforo: "critico",
        flecha: "baja",
        mejora: false,
        reporte: { texto: "Reportado", vencida: false },
      });
      expect(f.tendencia).toHaveLength(3);
      [100, 83.3333, 60].forEach((v, i) => expect(f.tendencia[i]).toBeCloseTo(v, 3));

      // Un periodo que terminó y no se reportó es el último: sin dato, y la tendencia se corta.
      const otro = await trimestral(tx, p.id, { mide: [quien.usuarioId] });
      await medir(tx, quien, otro, { "2026-T1": { A: "9", B: "10" } });
      const sinDato = (await lista(tx, quien, { procesoId: p.id })).filas.find((x) => x.codigo === otro.codigo)!;
      expect(sinDato).toMatchObject({ periodo: "2026-T3", resultado: null, semaforo: null, meta: "≥ 90 %" });
      expect(sinDato.tendencia).toEqual([90, null, null]);
    }));

  it("los conteos y la barra de estados solo cuentan lo que la persona ve", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const quien = await usuarioDePrueba(tx, { rol: "consulta" });
      const general = await trimestral(tx, p.id, { inicioMedicion: "2026-T3", mide: [quien.usuarioId] });
      const restringido = await trimestral(tx, p.id, { inicioMedicion: "2026-T3", nivelAcceso: "restringido" });
      await medir(tx, quien, general, { "2026-T3": { A: "9", B: "10" } });
      const admin = await sesionAdmin(tx);
      await medir(tx, admin, restringido, { "2026-T3": { A: "3", B: "5" } });

      // Un Consulta ajeno al proceso no ve el restringido: ni en las filas ni en la barra.
      const ajeno = await usuarioDePrueba(tx, { rol: "consulta" });
      const deAjeno = await lista(tx, ajeno, { procesoId: p.id });
      expect(deAjeno.filas.map((f) => f.codigo)).toEqual([general.codigo]);
      expect(deAjeno.resumen).toEqual({ bien: 1, bienSinAlcanzar: 0, atencion: 0, critico: 0, sinDato: 0, noAplica: 0, vencidos: 0 });

      // El Admin SGC sí: el crítico, y su análisis vencido.
      const deAdmin = await lista(tx, admin, { procesoId: p.id });
      expect(deAdmin.filas.map((f) => f.codigo).sort()).toEqual([general.codigo, restringido.codigo].sort());
      expect(deAdmin.resumen).toEqual({ bien: 1, bienSinAlcanzar: 0, atencion: 0, critico: 1, sinDato: 0, noAplica: 0, vencidos: 1 });
      expect(deAdmin.filas.find((f) => f.codigo === restringido.codigo)).toMatchObject({ restringido: true, semaforo: "critico" });

      // El filtro de semáforo no cambia la barra: se cuenta antes.
      const criticos = await lista(tx, admin, { procesoId: p.id, semaforo: "critico" });
      expect(criticos.filas.map((f) => f.codigo)).toEqual([restringido.codigo]);
      expect(criticos.resumen).toEqual(deAdmin.resumen);

      // «No aplica» se cuenta aparte de «sin dato» (ronda 1 de la Tarea 19, D-11).
      const otro = await trimestral(tx, p.id, { inicioMedicion: "2026-T3", mide: [quien.usuarioId] });
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: otro.id });
      const [t3] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${otro.id} AND periodo = '2026-T3'`;
      await marcarNoAplica(quien, { medicionId: Number(t3.id), motivo: "No hubo casos que medir" }, opc(tx));
      expect((await lista(tx, ajeno, { procesoId: p.id })).resumen).toMatchObject({ bien: 1, sinDato: 0, noAplica: 1 });
      // Y el filtro «Estado: Sin dato» no trae los «No aplica», como la barra (ola final, M6).
      const sinDato = await trimestral(tx, p.id, { inicioMedicion: "2026-T3" });
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: sinDato.id });
      const filtrada = await lista(tx, ajeno, { procesoId: p.id, semaforo: "sin-dato" });
      expect(filtrada.filas.map((f) => f.codigo)).toEqual([sinDato.codigo]);

      // Un Bien que no alcanza la meta cuenta como Bien y la barra dice cuántos hay (spec 14A §3.1, ola final A-m2).
      const rangos = { bien: [{ signo: ">=" as const, valor: "80" }], atencion: [{ signo: ">=" as const, valor: "56" }], critico: [{ signo: "<" as const, valor: "56" }] };
      const sinAlcanzar = await trimestral(tx, p.id, { inicioMedicion: "2026-T3", rangos, mide: [quien.usuarioId] });
      await medir(tx, quien, sinAlcanzar, { "2026-T3": { A: "17", B: "20" } });
      expect((await lista(tx, ajeno, { procesoId: p.id })).resumen).toMatchObject({ bien: 2, bienSinAlcanzar: 1 });
    }));

  it("quien administra ve además los borradores y los cambios en curso, sin contarlos en la barra", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const admin = await sesionAdmin(tx);
      const general = await trimestral(tx, p.id, { inicioMedicion: "2026-T3" });
      await medir(tx, admin, general, { "2026-T3": { A: "9", B: "10" } });
      const borrador = await indicadorDePrueba(tx, { procesoId: p.id, estado: "borrador" });
      const consulta = await usuarioDePrueba(tx, { rol: "consulta" });

      expect(await codigos(tx, consulta, { procesoId: p.id })).toEqual([general.codigo]);
      const deAdmin = await lista(tx, admin, { procesoId: p.id });
      expect(deAdmin.filas.map((f) => f.codigo).sort()).toEqual([general.codigo, borrador.codigo].sort());
      expect(deAdmin.filas.find((f) => f.codigo === borrador.codigo)).toMatchObject({
        estado: "borrador",
        nombre: `Indicador de prueba ${borrador.codigo}`,
        periodo: null,
        semaforo: null,
      });
      expect(deAdmin.resumen).toEqual({ bien: 1, bienSinAlcanzar: 0, atencion: 0, critico: 0, sinDato: 0, noAplica: 0, vencidos: 0 });

      // Un cambio en curso sobre la aprobada: el nombre sigue siendo el aprobado y el cambio se marca, solo a quien administra.
      const cambio = await abrirCambio(admin, general.id, { sql: tx });
      const [actual] = await tx`SELECT nombre FROM indicador_versiones WHERE id = ${cambio.versionId}`;
      expect(actual.nombre).toBe(`Indicador de prueba ${general.codigo}`);
      const conCambio = (await lista(tx, admin, { procesoId: p.id })).filas.find((f) => f.codigo === general.codigo);
      expect(conCambio).toMatchObject({ nombre: `Indicador de prueba ${general.codigo}`, cambioEnCurso: "borrador", automatico: false });
      expect((await lista(tx, consulta, { procesoId: p.id })).filas[0].cambioEnCurso).toBeNull();
    }));

  it("filtros: proceso, clasificación, tipo, semáforo, estado del reporte, «donde participo», texto sin tildes y retirados", () =>
    revertida(sql, async (tx) => {
      const p1 = await proceso(tx);
      const p2 = await proceso(tx);
      const [sub] = await tx`INSERT INTO subprocesos (proceso_id, nombre, slug, orden) VALUES (${p1.id}, 'Auditoría interna', 'auditoria-interna', 1) RETURNING id`;
      const quien = await usuarioDePrueba(tx, { rol: "consulta" });
      const admin = await sesionAdmin(tx);
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [p1.id] });
      const soloT3 = { inicioMedicion: "2026-T3", aprobadaEn: APROBADA };

      const a = await aprobadoCon(tx, { procesoId: p1.id, ...soloT3, clasificacion: "Estratégico" }, {
        nombre: "Cumplimiento de auditorías internas",
        tipo: "Eficiencia",
        subprocesoId: Number(sub.id),
      });
      const b = await trimestral(tx, p1.id, { ...soloT3, mide: [quien.usuarioId] });
      const c = await trimestral(tx, p1.id, soloT3);
      const d = await trimestral(tx, p2.id, soloT3);
      const e = await trimestral(tx, p1.id, soloT3);
      // Su último periodo está reportado, pero el primero sigue sin reportar y venció.
      const f = await trimestral(tx, p1.id);
      // El proceso 1 tiene líder: él mide lo que no tiene designado (el Admin SGC ya no).
      await medir(tx, lider, a, { "2026-T3": { A: "9", B: "10" } });
      await medir(tx, quien, b, { "2026-T3": { A: "3", B: "5" } });
      await medir(tx, admin, d, { "2026-T3": { A: "9", B: "10" } });
      await medir(tx, lider, f, { "2026-T2": { A: "9", B: "10" }, "2026-T3": { A: "9", B: "10" } });
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: c.id });
      await retirar(admin, { indicadorId: e.id, motivo: "Ya no se mide" }, { sql: tx });

      const de = (filtro: FiltroDeLista, sesion = admin) => codigos(tx, sesion, filtro);
      const orden = (...xs: { codigo: string }[]) => xs.map((x) => x.codigo).sort();

      expect(await de({ procesoId: p1.id })).toEqual(orden(a, b, c, f));
      expect(await de({ procesoId: p2.id })).toEqual(orden(d));
      expect(await de({ procesoId: p1.id, subprocesoId: Number(sub.id) })).toEqual(orden(a));
      const [estrategico] = await tx`SELECT id FROM clasificaciones_indicador WHERE nombre = 'Estratégico'`;
      expect(await de({ procesoId: p1.id, clasificacionId: Number(estrategico.id) })).toEqual(orden(a));
      const [eficiencia] = await tx`SELECT id FROM tipos_indicador WHERE nombre = 'Eficiencia'`;
      expect(await de({ procesoId: p1.id, tipoId: Number(eficiencia.id) })).toEqual(orden(a));
      expect(await de({ procesoId: p1.id, semaforo: "bien" })).toEqual(orden(a, f));
      expect(await de({ procesoId: p1.id, semaforo: "critico" })).toEqual(orden(b));
      expect(await de({ procesoId: p1.id, semaforo: "sin-dato" })).toEqual(orden(c));
      expect(await de({ procesoId: p1.id, reporte: "por-reportar" })).toEqual(orden(c, f));
      expect(await de({ procesoId: p1.id, reporte: "falta-analisis" })).toEqual(orden(b));
      expect(await de({ procesoId: p1.id, reporte: "vencida" })).toEqual(orden(b, c, f));
      expect(await de({ procesoId: p1.id, reporte: "requiere-accion" })).toEqual(orden(b));
      expect(await de({ procesoId: p1.id, texto: "auditorias" })).toEqual(orden(a));
      expect(await de({ procesoId: p1.id, texto: "AUDITORÍAS INTERNAS" })).toEqual(orden(a));
      expect(await de({ procesoId: p1.id, texto: b.codigo.toLowerCase() })).toEqual(orden(b));
      expect(await de({ procesoId: p1.id, texto: "100%_" })).toEqual([]);
      expect(await de({ procesoId: p1.id, retirados: true })).toEqual(orden(a, b, c, e, f));
      expect((await lista(tx, admin, { procesoId: p1.id, retirados: true })).filas.find((x) => x.codigo === e.codigo)?.retirado).toBe(true);

      // «Donde participo»: el designado, su indicador; el líder, los de su proceso, con lo vencido aunque el último periodo esté reportado.
      expect(await de({ participo: true }, quien)).toEqual(orden(b));
      expect(await de({ reporte: "vencida", participo: true }, lider)).toEqual(orden(b, c, f));
      const conVencido = (await lista(tx, lider, { procesoId: p1.id, reporte: "vencida", participo: true })).filas.find((x) => x.codigo === f.codigo)!;
      expect(conVencido).toMatchObject({ periodo: "2026-T3", semaforo: "bien" });
      expect(conVencido.reporte.vencida).toBe(true);
      expect(conVencido.reporte.texto).toMatch(/^Vencido hace \d+ días$/);
      // Con el filtro de reporte, la barra cuenta lo que queda.
      expect((await lista(tx, admin, { procesoId: p1.id, reporte: "por-reportar" })).resumen).toMatchObject({ bien: 1, sinDato: 1 });
    }));

  it("no cuenta en la lista lo que quedó de otra periodicidad tras un cambio mayor", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const quien = await usuarioDePrueba(tx, { rol: "consulta" });
      const admin = await sesionAdmin(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: p.id, inicioMedicion: "2026-01", aprobadaEn: APROBADA, mide: [quien.usuarioId] });
      // Julio se reporta mensual; después rige una ficha trimestral desde el tercer trimestre y julio queda de otra periodicidad.
      await medir(tx, quien, ind, { "2026-06": { A: "9", B: "10" }, "2026-07": { A: "1", B: "10" } }, new Date("2026-08-15T15:00:00Z"));
      await versionTrimestral(tx, { indicadorId: ind.id, usuarioId: admin.usuarioId, rigeDesde: "2026-T3", aprobadaEn: new Date("2026-07-20T15:00:00Z") });
      const { filas, resumen } = await lista(tx, admin, { procesoId: p.id });
      expect(filas[0]).toMatchObject({ periodo: "2026-T3", semaforo: null, periodicidad: "trimestral" });
      // La tendencia no lleva julio como periodo vigente.
      expect(filas[0].tendencia.at(-2)).toBeCloseTo(90, 3);
      expect(resumen.critico).toBe(0);
    }));

  it("un automático sin datos dice «Falta un dato», sin «Vencida», y no cuenta entre los vencidos; lo anterior al paso a automático, sí", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const admin = await sesionAdmin(tx);
      const calculo = { clave: "dentro_plazo", alcance: "proceso" } as const;
      const auto = await trimestral(tx, p.id, { inicioMedicion: "2026-T3", calculo });
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: auto.id });

      const { filas, resumen } = await lista(tx, admin, { procesoId: p.id });
      expect(filas).toMatchObject([{ codigo: auto.codigo, periodo: "2026-T3", semaforo: null, reporte: { texto: "Falta un dato", vencida: false } }]);
      // La lista lo marca «Automático» (lo calcula el sistema).
      expect(filas[0].automatico).toBe(true);
      expect(resumen).toMatchObject({ sinDato: 1, vencidos: 0 });
      for (const reporte of ["vencida", "por-reportar", "falta-analisis"] as const) {
        expect(await codigos(tx, admin, { procesoId: p.id, reporte }), reporte).toEqual([]);
      }
      const [t3] = (await resultadosDelAnio(admin, auto.id, 2026, opc(tx))).filas;
      expect(t3).toMatchObject({ periodo: "2026-T3", estado: "falta_dato", vencida: false, automatica: true });
      // De estado: el sistema lo calcula al terminar el periodo, en la primera revisión (anexo 14B, §5.4).
      expect(t3).toMatchObject({ fotoEn: null, seCalcula: new Date("2026-10-01T04:59:59.999Z"), recalculable: false });
      // Un histórico que espera su cálculo tampoco está «Por registrar»: nadie lo registra.
      const deHistorico = await proceso(tx);
      const historico = await trimestral(tx, deHistorico.id, { inicioMedicion: "2026-T3", calculo, aprobadaEn: new Date("2026-10-05T15:00:00Z") });
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: historico.id });
      expect((await lista(tx, admin, { procesoId: deHistorico.id })).filas[0].reporte).toEqual({ texto: "Falta un dato", vencida: false });

      // Manual en el segundo trimestre y automático desde el tercero: el segundo sigue por reportar y vencido.
      const otroProceso = await proceso(tx);
      const cambio = await trimestral(tx, otroProceso.id, { inicioMedicion: "2026-T2" });
      await versionAutomatica(tx, {
        indicadorId: cambio.id,
        usuarioId: admin.usuarioId,
        rigeDesde: "2026-T3",
        aprobadaEn: new Date("2026-07-01T15:00:00Z"),
        periodicidad: "trimestral",
        calculo,
      });
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: cambio.id });
      const deCambio = await lista(tx, admin, { procesoId: otroProceso.id });
      expect(deCambio.filas[0].automatico).toBe(true);
      expect(deCambio.resumen.vencidos).toBe(1);
      expect(deCambio.filas[0].reporte).toMatchObject({ vencida: true });
      expect(deCambio.filas[0].reporte.texto).toMatch(/^Vencido hace \d+ días$/);
      const anio = (await resultadosDelAnio(admin, cambio.id, 2026, opc(tx))).filas;
      // `automatica` es la versión que rige cada periodo, no la ficha vigente.
      expect(anio.map((f) => [f.periodo, f.estado, f.vencida, f.automatica])).toEqual([
        ["2026-T2", "por_reportar", true, false],
        ["2026-T3", "falta_dato", false, true],
        ["2026-T4", "por_venir", false, true],
      ]);
      expect(anio.map((f) => f.seCalcula === null)).toEqual([true, false, true]);
    }));

  it("envio: la marca de la constancia pendiente (vencida o no) de cada indicador activo, y el filtro envio=pendiente", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const admin = await sesionAdmin(tx);
      // Desde julio solo nace el tercer trimestre; con 15 días venció el 15 de octubre, con 30 vence el 30.
      const desde = new Date("2026-07-05T15:00:00Z");
      const conEnte = (plazoDias: number, o: OpcionesIndicadorDePrueba = {}) =>
        indicadorDePrueba(tx, {
          procesoId: p.id,
          periodicidad: "mensual",
          inicioMedicion: "2026-01",
          aprobadaEn: APROBADA,
          ente: { nombre: "Superintendencia Nacional de Salud", periodicidad: "trimestral", plazoDias, desde },
          ...o,
        });
      const vencida = await conEnte(15, { mide: [mide.usuarioId] });
      const pendiente = await conEnte(30);
      const registrada = await conEnte(15, { mide: [mide.usuarioId] });
      const retirado = await conEnte(15);
      const sinEnte = await trimestral(tx, p.id);
      for (const i of [vencida, pendiente, registrada, retirado]) await asegurarConstancias({ sql: tx, ahora: AHORA, indicadorId: i.id });
      const t3 = async (i: { id: number }) => Number((await tx`SELECT id FROM reportes_externos WHERE indicador_id = ${i.id} AND periodo = '2026-T3'`)[0].id);
      const soporte = async (reporteId: number) =>
        tx`INSERT INTO archivos (contexto, contexto_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
          VALUES ('reporte_externo', ${reporteId}, 'evidencia', ${`reportes-externos/${reporteId}/r.pdf`}, 'r.pdf', 'pdf', 'application/pdf', 4, ${"a".repeat(64)})`;
      await soporte(await t3(registrada));
      await registrarConstancia(mide, { reporteId: await t3(registrada), fechaEnvio: "2026-10-10", radicado: "SNS-1" }, opc(tx));
      // Retirado con un soporte: la pendiente se conserva, pero ya no admite reportes y no se marca.
      await soporte(await t3(retirado));
      await retirar(admin, { indicadorId: retirado.id, motivo: "Ya no se mide" }, opc(tx));

      const filas = (await lista(tx, admin, { procesoId: p.id, retirados: true })).filas;
      const envio = Object.fromEntries(filas.map((f) => [f.codigo, f.envio]));
      expect(envio).toEqual({
        [vencida.codigo]: "vencido",
        [pendiente.codigo]: "pendiente",
        [registrada.codigo]: null,
        [retirado.codigo]: null,
        [sinEnte.codigo]: null,
      });
      // Un día antes de vencer, la del plazo de 15 días aún está pendiente.
      const antes = (await listarIndicadores(admin, { procesoId: p.id }, opc(tx, new Date("2026-10-15T15:00:00Z")))).filas;
      expect(antes.find((f) => f.id === vencida.id)?.envio).toBe("pendiente");

      // El filtro: con alguna pendiente, vencida o no; se combina con los demás (los enlaces de las tareas y los avisos).
      expect(await codigos(tx, admin, { procesoId: p.id, envio: "pendiente", retirados: true })).toEqual([vencida.codigo, pendiente.codigo].sort());
      expect(await codigos(tx, mide, { procesoId: p.id, envio: "pendiente", participo: true })).toEqual([vencida.codigo]);
      // La barra cuenta solo lo que deja el filtro.
      const { resumen } = await lista(tx, admin, { procesoId: p.id, envio: "pendiente" });
      expect(resumen.bien + resumen.atencion + resumen.critico + resumen.sinDato + resumen.noAplica).toBe(2);

      // Dos pendientes cuando el plazo del ente bajó: lo ya nacido conserva su fecha, y la del periodo más nuevo vence antes
      // (aquí, ya venció). Basta con que alguna haya vencido para que la fila lo diga: el aviso de vencido enlaza a esta lista.
      const dos = await conEnte(60, { ente: { nombre: "Superintendencia Nacional de Salud", periodicidad: "trimestral", plazoDias: 60, desde: new Date("2026-04-05T15:00:00Z") } });
      await asegurarConstancias({ sql: tx, ahora: AHORA, indicadorId: dos.id });
      await tx`UPDATE reportes_externos SET vence_en = ${new Date("2026-12-31T04:59:59.999Z")} WHERE indicador_id = ${dos.id} AND periodo = '2026-T2'`;
      await tx`UPDATE reportes_externos SET vence_en = ${new Date("2026-10-16T04:59:59.999Z")} WHERE indicador_id = ${dos.id} AND periodo = '2026-T3'`;
      expect((await tx`SELECT periodo, estado FROM reportes_externos WHERE indicador_id = ${dos.id} ORDER BY hasta`).map((r) => [r.periodo, r.estado])).toEqual([
        ["2026-T2", "pendiente"],
        ["2026-T3", "pendiente"],
      ]);
      expect((await lista(tx, admin, { procesoId: p.id })).filas.find((f) => f.id === dos.id)?.envio).toBe("vencido");
    }));

  it("impacto=1: los que tienen una revisión por cambio de norma pendiente (anexo 14B, §9), y va y vuelve por la URL", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const admin = await sesionAdmin(tx);
      const norma = await normaDePrueba(tx, admin);
      const cita = await indicadorDePrueba(tx, { procesoId: p.id, normaIds: [norma.id], aprobadaEn: APROBADA });
      const resuelta = await indicadorDePrueba(tx, { procesoId: p.id, normaIds: [norma.id], aprobadaEn: APROBADA });
      await indicadorDePrueba(tx, { procesoId: p.id, aprobadaEn: APROBADA });
      await cambiarEstadoNorma(admin, { normaId: norma.id, estado: "derogada", fecha: "2026-10-01", nota: null }, opc(tx));
      const [r] = await tx`SELECT id FROM impactos_indicadores WHERE indicador_id = ${resuelta.id}`;
      await resolverImpactoNoAfecta(admin, { impactoId: Number(r.id), nota: "La ficha no cambia" }, opc(tx));
      expect(await codigos(tx, admin, { procesoId: p.id, impacto: true })).toEqual([cita.codigo]);
      expect(filtroDeConsulta({ impacto: "1", proceso: "12" })).toEqual({ impacto: true, procesoId: 12 });
      expect(filtroDeConsulta({ impacto: "no" })).toEqual({});
      expect(consultaDeFiltro({ procesoId: 12, impacto: true })).toBe("proceso=12&impacto=1");
    }));
});

describe("el indicador", () => {
  it("obtenerIndicador dice qué puede hacer la persona", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const general = await trimestral(tx, p.id, { mide: [mide.usuarioId] });
      await medir(tx, mide, general, { "2026-T1": { A: "5", B: "5" }, "2026-T2": { A: "5", B: "6" }, "2026-T3": { A: "3", B: "5" } });

      const consulta = await usuarioDePrueba(tx, { rol: "consulta" });
      const v = await obtenerIndicador(consulta, general.codigo.toLowerCase(), opc(tx));
      expect(v).not.toBeNull();
      expect(v!.permisos).toEqual({ puedeMedir: false, puedeAnalizar: false, puedeObservar: false, veSoportes: false, administra: false });
      expect(v!).toMatchObject({ id: general.id, codigo: general.codigo, estado: "activo" });
      expect(v!.ficha.contenido.nombre).toBe(`Indicador de prueba ${general.codigo}`);
      expect(v!.operacion.mide).toEqual([mide.nombre]);
      // El último resultado, con su frase y su comparación con el periodo anterior medido.
      expect(v!.ultimo).toMatchObject({
        periodo: "2026-T3",
        etiqueta: "Tercer trimestre de 2026",
        resultado: "60 %",
        semaforo: "critico",
        frase: "No cumple: 60 % frente a una meta de 90 %.",
        requiereAccion: true,
        comparacion: { texto: "23,3 puntos menos que en el segundo trimestre", flecha: "baja", mejora: false },
      });

      expect((await obtenerIndicador(mide, general.codigo, opc(tx)))!.permisos).toMatchObject({ puedeMedir: true, veSoportes: true, administra: false });
      const control = await usuarioDePrueba(tx, { rol: "control_interno" });
      expect((await obtenerIndicador(control, general.codigo, opc(tx)))!.permisos).toMatchObject({ puedeMedir: false, puedeObservar: true, veSoportes: true });
      const admin = await sesionAdmin(tx);
      expect((await obtenerIndicador(admin, general.codigo, opc(tx)))!.permisos).toMatchObject({ administra: true, veSoportes: true });

      // Un restringido ajeno, un borrador y lo que no existe: no existen para la persona.
      const restringido = await trimestral(tx, p.id, { nivelAcceso: "restringido" });
      expect(await obtenerIndicador(consulta, restringido.codigo, opc(tx))).toBeNull();
      const borrador = await indicadorDePrueba(tx, { procesoId: p.id, estado: "borrador" });
      expect(await obtenerIndicador(admin, borrador.codigo, opc(tx))).toBeNull();
      expect(await obtenerIndicador(consulta, "ZZ-NO-EXISTE-1", opc(tx))).toBeNull();

      // Retirado: se ve, pero ya no se mide ni se analiza.
      await retirar(admin, { indicadorId: general.id, motivo: "Ya no se mide" }, { sql: tx });
      expect((await obtenerIndicador(mide, general.codigo, opc(tx)))!.permisos).toMatchObject({ puedeMedir: false, puedeAnalizar: false });
    }));

  it("los resultados del año: filas, acumulado, serie para la gráfica y una serie por variable", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const ind = await trimestral(tx, p.id, { mide: [mide.usuarioId] });
      await medir(tx, mide, ind, { "2026-T1": { A: "5", B: "5" }, "2026-T2": { A: "5", B: "6" }, "2026-T3": { A: "3", B: "5" } });

      const r = await resultadosDelAnio(mide, ind.id, 2026, opc(tx));
      expect(r.filas.map((f) => f.periodo)).toEqual(["2026-T1", "2026-T2", "2026-T3", "2026-T4"]);
      expect(r.acumulado).toMatchObject({ texto: "81,3 %", semaforo: "atencion", valores: { A: "13", B: "16" }, rotulo: null, meta: { valor: 90, texto: "Meta 90 %" } });
      expect(r.acumulado.valor).toBeCloseTo(81.25, 6);
      expect(r.serie).toHaveLength(4);
      expect(r.serie[0]).toEqual({ clave: "2026-T1", etiqueta: "primer trimestre de 2026", valor: 100, texto: "100 %", estado: "bien", nombreEstado: "Bien" });
      expect(r.serie[1]).toMatchObject({ texto: "83,3 %", estado: "atencion" });
      expect(r.serie[2]).toMatchObject({ texto: "60 %", estado: "critico" });
      expect(r.serie[3]).toMatchObject({ clave: "2026-T4", valor: null, estado: "futuro" });
      expect(r.variables.map((v) => [v.letra, v.nombre])).toEqual([["A", "Casos que cumplen"], ["B", "Casos evaluados"]]);
      expect(r.variables[1].serie.map((x) => x.valor)).toEqual([5, 6, 5, null]);
      expect(r.anios).toEqual([2026]);
      // La meta por periodo y el límite de crítico, para la gráfica.
      expect(r.grafica.meta).toEqual([90, 90, 90, 90]);
      expect(r.grafica.limite).toEqual({ valor: 63, texto: "Crítico por debajo de 63 %" });
      expect(r.grafica.rango).toBeNull();

      // Con `desde`, la serie abarca dos años; las filas y el acumulado siguen siendo los del año.
      const dos = await resultadosDelAnio(mide, ind.id, 2026, { ...opc(tx), desde: 2025 });
      expect(dos.serie.map((x) => x.clave)).toEqual(["2026-T1", "2026-T2", "2026-T3", "2026-T4"]);
      expect(dos.filas).toHaveLength(4);

      // Un «no aplica» se salta en el acumulado y en la gráfica es «n. a.».
      const otro = await trimestral(tx, p.id, { mide: [mide.usuarioId] });
      await medir(tx, mide, otro, { "2026-T1": { A: "9", B: "10" } });
      const [t2] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${otro.id} AND periodo = '2026-T2'`;
      await marcarNoAplica(mide, { medicionId: Number(t2.id), motivo: "No hubo casos en el trimestre" }, opc(tx));
      const conNoAplica = await resultadosDelAnio(mide, otro.id, 2026, opc(tx));
      expect(conNoAplica.serie[1]).toMatchObject({ estado: "no-aplica", valor: null });
      expect(conNoAplica.serie[2]).toMatchObject({ estado: "sin-dato", valor: null });
      expect(conNoAplica.acumulado).toMatchObject({ texto: "90 %", rotulo: "Acumulado parcial: falta el tercer trimestre" });

      // Quien no ve el indicador no recibe nada.
      const restringido = await trimestral(tx, p.id, { nivelAcceso: "restringido" });
      const ajeno = await usuarioDePrueba(tx, { rol: "consulta" });
      expect(await resultadosDelAnio(ajeno, restringido.id, 2026, opc(tx))).toMatchObject({ filas: [], serie: [], variables: [], anios: [] });
    }));

  it("el acumulado de un año con dos versiones de fórmula cubre la vigente, y el de un año anterior, el suyo", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const admin = await sesionAdmin(tx);
      const ind = await indicadorDePrueba(tx, {
        procesoId: p.id,
        inicioMedicion: "2025-11",
        aprobadaEn: new Date("2025-10-15T15:00:00Z"),
        mide: [mide.usuarioId],
      });
      const antes = new Date("2026-07-02T15:00:00Z");
      const enero = { A: "9", B: "10" };
      await medir(tx, mide, ind, { "2025-11": enero, "2025-12": { A: "8", B: "10" }, "2026-01": enero, "2026-02": enero, "2026-03": enero, "2026-04": enero, "2026-05": enero, "2026-06": enero }, antes);
      // Versión 2, desde julio: otra fórmula, con una variable más.
      const [v2] = await tx`INSERT INTO indicador_versiones (indicador_id, numero, estado, tipo_cambio, nombre, forma, formula, periodicidad,
          tendencia, meta, semaforo_modo, umbral_atencion_pct, unidad_sufijo, decimales, creado_por)
        VALUES (${ind.id}, 2, 'borrador', 'mayor', 'Con recuperados', 'libre', '(A + C) / B * 100', 'mensual', 'ascendente', 90,
          'relativo', 70, ' %', 1, ${admin.usuarioId}) RETURNING id`;
      await tx`SELECT id FROM indicador_versiones WHERE id = ${v2.id} FOR UPDATE`;
      for (const [orden, letra, nombre] of [[1, "A", "Casos que cumplen"], [2, "B", "Casos evaluados"], [3, "C", "Casos recuperados"]] as const) {
        await tx`INSERT INTO indicador_variables (version_id, letra, nombre, orden) VALUES (${v2.id}, ${letra}, ${nombre}, ${orden})`;
      }
      await tx`UPDATE indicador_versiones SET estado = 'aprobada', elaborada_por = ${admin.usuarioId}, huella = ${"2".repeat(64)},
          rige_desde = '2026-07', aprobada_por = ${admin.usuarioId}, aprobada_en = '2026-06-20T15:00:00Z'
        WHERE id = ${v2.id}`;
      await medir(tx, mide, ind, { "2026-07": { A: "4", B: "10", C: "4" }, "2026-08": { A: "4", B: "10", C: "4" } }, new Date("2026-09-02T15:00:00Z"));

      const r = await resultadosDelAnio(mide, ind.id, 2026, { ...opc(tx), ahora: new Date("2026-09-02T15:00:00Z") });
      // Julio y agosto con la fórmula nueva: (8 + 8) / 20.
      expect(r.acumulado).toMatchObject({ texto: "80 %", valores: { A: "8", B: "20", C: "8" }, rotulo: "Acumulado desde julio, versión 2" });
      // Las columnas: la unión de las letras del año, cada periodo con las de su ficha.
      expect(r.filas.find((f) => f.periodo === "2026-03")!.valores.map((v) => v.letra)).toEqual(["A", "B"]);
      expect(r.filas.find((f) => f.periodo === "2026-07")!.valores.map((v) => v.letra)).toEqual(["A", "B", "C"]);
      expect(r.variables.map((v) => v.letra)).toEqual(["A", "B", "C"]);
      expect(r.variables[2].serie.slice(0, 6).every((x) => x.valor === null)).toBe(true);
      expect(r.anios).toEqual([2025, 2026]);

      // 2025 lo rige entero la versión 1: su acumulado es el suyo, no el de la vigente.
      const de2025 = await resultadosDelAnio(mide, ind.id, 2025, { ...opc(tx), ahora: new Date("2026-09-02T15:00:00Z") });
      expect(de2025.acumulado).toMatchObject({ texto: "85 %", valores: { A: "17", B: "20" }, rotulo: null, semaforo: "atencion" });
    }));
});

describe("la matriz del año", () => {
  it("abre solo los periodos de los indicadores que lee, uno por uno: el que falla se registra y la matriz se pinta (M3)", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const otro = await proceso(tx);
      const a = await trimestral(tx, p.id);
      const b = await trimestral(tx, p.id);
      const ajeno = await trimestral(tx, otro.id);
      const abiertas = async (id: number) => Number((await tx`SELECT count(*)::int AS n FROM mediciones WHERE indicador_id = ${id}`)[0].n);
      const admin = await sesionAdmin(tx);
      // El primer indicador que intenta abrir lanza; el cliente es el mismo para todo lo demás.
      let intentos = 0;
      const cliente = new Proxy(tx, {
        get: (destino, propiedad) => {
          if (propiedad !== "savepoint") return Reflect.get(destino, propiedad, destino);
          return (fn: never) => (++intentos === 1 ? Promise.reject(new Error("falla de prueba")) : destino.savepoint(fn));
        },
      });
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const m = await matrizDelAnio(admin, { anio: 2026, procesoId: p.id }, { sql: cliente, ahora: AHORA });
        expect(error).toHaveBeenCalledTimes(1);
        expect(m.procesos[0].filas.map((f) => f.codigo).sort()).toEqual([a.codigo, b.codigo].sort());
        // Uno de los dos no abrió (el que falló); el otro abrió sus tres trimestres terminados; el de otro proceso, nada.
        expect([await abiertas(a.id), await abiertas(b.id)].sort()).toEqual([0, 3]);
        expect(await abiertas(ajeno.id)).toBe(0);
      } finally {
        error.mockRestore();
      }
    }));

  it("la matriz: una celda por periodo con sus meses, y la columna del año", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const t = await trimestral(tx, p.id, { mide: [mide.usuarioId] });
      const m = await indicadorDePrueba(tx, { procesoId: p.id, inicioMedicion: "2026-01", aprobadaEn: APROBADA, meta: "85", mide: [mide.usuarioId] });
      const a = await indicadorDePrueba(tx, { procesoId: p.id, periodicidad: "anual", inicioMedicion: "2026", aprobadaEn: APROBADA });
      const medioAnio = await indicadorDePrueba(tx, { procesoId: p.id, inicioMedicion: "2026-04", aprobadaEn: APROBADA, mide: [mide.usuarioId] });
      await medir(tx, mide, t, { "2026-T1": { A: "5", B: "5" }, "2026-T2": { A: "5", B: "6" }, "2026-T3": { A: "3", B: "5" } });
      await medir(tx, mide, m, { "2026-03": { A: "43", B: "50" } });
      const [feb] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${m.id} AND periodo = '2026-02'`;
      await marcarNoAplica(mide, { medicionId: Number(feb.id), motivo: "No hubo casos en febrero" }, opc(tx));
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: medioAnio.id });

      const matriz = await matrizDelAnio(mide, { anio: 2026, procesoId: p.id }, opc(tx));
      expect(matriz.procesos.map((x) => x.id)).toEqual([p.id]);
      const filas = matriz.procesos[0].filas;
      const de = (codigo: string) => filas.find((f) => f.codigo === codigo)!;

      expect(meses(de(t.codigo).celdas)).toEqual([[1, 3], [4, 6], [7, 9], [10, 12]]);
      expect(de(t.codigo).celdas.map((c) => c.texto)).toEqual(["100 %", "83,3 %", "60 %", "—"]);
      expect(de(t.codigo).celdas[0]).toMatchObject({ estado: "bien", nombre: "primer trimestre: 100 %, Bien" });
      expect(de(t.codigo).celdas[0].enlace).toBe(`/indicadores/${t.codigo}?vista=resultados&anio=2026#periodo-2026-T1`);
      expect(de(t.codigo).celdas[3]).toMatchObject({ estado: "futuro", enlace: null });
      // La columna del año es el mismo acumulado que la página del indicador.
      const resultados = await resultadosDelAnio(mide, t.id, 2026, opc(tx));
      expect(de(t.codigo).anio).toMatchObject({ desdeMes: 1, hastaMes: 12, texto: resultados.acumulado.texto, estado: "atencion" });
      expect(de(t.codigo).anio.texto).toBe("81,3 %");

      expect(de(m.codigo).celdas).toHaveLength(12);
      expect(de(m.codigo).celdas[2]).toMatchObject({ desdeMes: 3, hastaMes: 3, texto: "86 %", estado: "bien", nombre: "marzo: 86 %, Bien" });
      expect(de(m.codigo).celdas[1]).toMatchObject({ texto: "n. a.", estado: "no-aplica", nombre: "febrero: no aplica" });
      expect(de(m.codigo).celdas[0]).toMatchObject({ texto: "s. d.", estado: "sin-dato", nombre: "enero: sin dato" });
      expect(meses(de(a.codigo).celdas)).toEqual([[1, 12]]);
      // Sin acumulado (el año aún no termina ningún periodo), «s. d.»: «—» es «por venir» en la leyenda.
      expect(de(a.codigo).anio).toMatchObject({ texto: "s. d.", estado: "sin-dato", nombre: "Año 2026: sin dato" });
      // Desde abril: lo de antes es una sola celda vacía, y todo suma doce meses.
      expect(de(medioAnio.codigo).celdas[0]).toMatchObject({ desdeMes: 1, hastaMes: 3, estado: "vacia", enlace: null });
      for (const f of filas) cubreElAnio(f.celdas);
    }));

  it("tras un cambio de periodicidad las celdas siguen cubriendo el año y manda la periodicidad que rige", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const admin = await sesionAdmin(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: p.id, inicioMedicion: "2026-01", aprobadaEn: APROBADA, mide: [mide.usuarioId] });
      await medir(tx, mide, ind, { "2026-06": { A: "9", B: "10" }, "2026-07": { A: "1", B: "10" } }, new Date("2026-08-15T15:00:00Z"));
      await versionTrimestral(tx, { indicadorId: ind.id, usuarioId: admin.usuarioId, rigeDesde: "2026-T3", aprobadaEn: new Date("2026-07-20T15:00:00Z") });
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: ind.id });

      const [fila] = (await matrizDelAnio(admin, { anio: 2026, procesoId: p.id }, opc(tx))).procesos[0].filas;
      expect(meses(fila.celdas)).toEqual([[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 9], [10, 12]]);
      cubreElAnio(fila.celdas);
      // El tercer trimestre (sin dato) pisa el julio mensual que quedó de la ficha anterior.
      expect(fila.celdas[6]).toMatchObject({ texto: "s. d.", estado: "sin-dato" });

      // La tabla del año sí muestra julio, marcado y sin acciones.
      const r = await resultadosDelAnio(admin, ind.id, 2026, opc(tx));
      expect(r.filas.find((f) => f.periodo === "2026-07")).toMatchObject({ deOtraPeriodicidad: true, resultado: "10 %" });
      expect(r.serie.map((x) => x.clave)).not.toContain("2026-07");

      // La misma fórmula y las mismas variables: el acumulado no se parte con la versión trimestral (nota 4). Junta los
      // meses de la versión 1 con el trimestre de la 2, y deja fuera el julio mensual que quedó.
      const mes = { A: "9", B: "10" };
      await medir(tx, mide, ind, { "2026-01": mes, "2026-02": mes, "2026-03": mes, "2026-04": mes, "2026-05": mes, "2026-T3": { A: "27", B: "30" } });
      const acumulado = (await resultadosDelAnio(admin, ind.id, 2026, opc(tx))).acumulado;
      expect(acumulado).toMatchObject({ texto: "90 %", semaforo: "bien", valores: { A: "81", B: "90" }, rotulo: null });
      const [conTodo] = (await matrizDelAnio(admin, { anio: 2026, procesoId: p.id }, opc(tx))).procesos[0].filas;
      expect(conTodo.anio).toMatchObject({ texto: "90 %", estado: "bien", nombre: "Año 2026: 90 %, Bien" });
      expect(conTodo.anio.nombre).not.toContain("desde");
    }));

  it("un cambio que no toca la fórmula ni las variables no parte el acumulado del año", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const admin = await sesionAdmin(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: p.id, inicioMedicion: "2026-05", aprobadaEn: APROBADA, mide: [mide.usuarioId] });
      await medir(tx, mide, ind, { "2026-05": { A: "9", B: "10" }, "2026-06": { A: "7", B: "10" } }, new Date("2026-07-02T15:00:00Z"));
      // Versión 2, mayor, desde julio: otra meta, la misma fórmula; versión 3, menor, sobre ella (el mismo «rige desde»).
      for (const [numero, tipo, meta, huella] of [[2, "mayor", 80, "4"], [3, "menor", 80, "5"]] as const) {
        const [v] = await tx`INSERT INTO indicador_versiones (indicador_id, numero, estado, tipo_cambio, nombre, forma, formula, periodicidad,
            tendencia, meta, semaforo_modo, umbral_atencion_pct, unidad_sufijo, decimales, creado_por)
          VALUES (${ind.id}, ${numero}, 'borrador', ${tipo}, ${`Versión ${numero}`}, 'porcentaje', 'A / B * 100', 'mensual', 'ascendente', ${meta},
            'relativo', 70, ' %', 1, ${admin.usuarioId}) RETURNING id`;
        await tx`SELECT id FROM indicador_versiones WHERE id = ${v.id} FOR UPDATE`;
        for (const [orden, letra] of [[1, "A"], [2, "B"]] as const) {
          await tx`INSERT INTO indicador_variables (version_id, letra, nombre, orden) VALUES (${v.id}, ${letra}, ${letra}, ${orden})`;
        }
        await tx`UPDATE indicador_versiones SET estado = 'aprobada', elaborada_por = ${admin.usuarioId}, huella = ${huella.repeat(64)},
            rige_desde = '2026-07', aprobada_por = ${tipo === "menor" ? null : admin.usuarioId}, aprobada_en = '2026-06-20T15:00:00Z'
          WHERE id = ${v.id}`;
      }
      const despues = new Date("2026-09-02T15:00:00Z");
      await medir(tx, mide, ind, { "2026-07": { A: "8", B: "10" }, "2026-08": { A: "8", B: "10" } }, despues);
      const r = await resultadosDelAnio(mide, ind.id, 2026, { sql: tx, ahora: despues });
      // Mayo a agosto juntos (32 / 40), contra la meta del último periodo medido (80): Bien, sin «desde …, versión 2».
      expect(r.acumulado).toMatchObject({ texto: "80 %", semaforo: "bien", valores: { A: "32", B: "40" }, rotulo: null, meta: { valor: 80 } });
    }));

  it("un retirado sale en la matriz marcado y lo posterior al retiro no se mide, no está por venir (ronda 1 de la Tarea 19, D-9)", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const admin = await sesionAdmin(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const t = await trimestral(tx, p.id, { mide: [mide.usuarioId] });
      await medir(tx, mide, t, { "2026-T1": { A: "5", B: "5" }, "2026-T2": { A: "5", B: "6" } });
      // El tercer trimestre se abrió y quedó vacío: el retiro lo quita.
      await retirar(admin, { indicadorId: t.id, motivo: "Ya no se mide" }, opc(tx));
      const m = await matrizDelAnio(admin, { anio: 2026, procesoId: p.id }, opc(tx));
      const fila = m.procesos[0].filas.find((f) => f.codigo === t.codigo)!;
      expect(fila.retirado).toBe(true);
      expect(fila.celdas.map((c) => [c.desdeMes, c.hastaMes, c.estado])).toEqual([
        [1, 3, "bien"],
        [4, 6, "atencion"],
        [7, 12, "vacia"],
      ]);
      expect(fila.celdas[2].nombre).toBe("julio a diciembre: no se mide");
      // Un activo del mismo proceso no lleva la marca y conserva su periodo por venir.
      const activo = await trimestral(tx, p.id, { mide: [mide.usuarioId] });
      await medir(tx, mide, activo, { "2026-T1": { A: "5", B: "5" } });
      const otra = await matrizDelAnio(admin, { anio: 2026, procesoId: p.id }, opc(tx));
      const deActivo = otra.procesos[0].filas.find((f) => f.codigo === activo.codigo)!;
      expect(deActivo.retirado).toBe(false);
      expect(deActivo.celdas.at(-1)?.estado).toBe("futuro");
    }));

  it("la matriz agrupa por proceso y deja fuera lo restringido ajeno y lo que no se midió ese año", () =>
    revertida(sql, async (tx) => {
      const p1 = await proceso(tx);
      const p2 = await proceso(tx);
      const consulta = await usuarioDePrueba(tx, { rol: "consulta" });
      const admin = await sesionAdmin(tx);
      const uno = await trimestral(tx, p1.id);
      const dos = await trimestral(tx, p2.id);
      const restringido = await trimestral(tx, p2.id, { nivelAcceso: "restringido" });
      const de2027 = await trimestral(tx, p1.id, { inicioMedicion: "2027-T1" });
      for (const i of [uno, dos, restringido, de2027]) await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: i.id });
      const [clasificacion] = await tx`SELECT id FROM clasificaciones_indicador WHERE nombre = 'Operativo'`;

      const grupos = async (sesion: SesionFlujo, anio = 2026) => {
        const m = await matrizDelAnio(sesion, { anio }, opc(tx));
        return Object.fromEntries(m.procesos.filter((x) => x.id === p1.id || x.id === p2.id).map((x) => [x.id, x.filas.map((f) => f.codigo).sort()]));
      };
      expect(await grupos(consulta)).toEqual({ [p1.id]: [uno.codigo], [p2.id]: [dos.codigo] });
      expect(await grupos(admin)).toEqual({ [p1.id]: [uno.codigo], [p2.id]: [dos.codigo, restringido.codigo].sort() });
      // 2025 no se midió: ninguno empieza antes de 2026.
      expect(await grupos(admin, 2025)).toEqual({});
      // Los filtros: proceso y clasificación.
      const soloP2 = await matrizDelAnio(admin, { anio: 2026, procesoId: p2.id, clasificacionId: Number(clasificacion.id) }, opc(tx));
      expect(soloP2.procesos.map((x) => x.id)).toEqual([p2.id]);
      expect(soloP2.procesos[0].nombre).toBe(p2.nombre);
    }));

  it("el filtro de subproceso: solo el de la versión aprobada vigente del indicador; sin él, también los demás", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const [sub] = await tx`INSERT INTO subprocesos (proceso_id, nombre, slug, orden) VALUES (${p.id}, 'Urgencias de prueba', 'urgencias-prueba', 1) RETURNING id`;
      const admin = await sesionAdmin(tx);
      const con = await aprobadoCon(tx, { procesoId: p.id, aprobadaEn: APROBADA }, { subprocesoId: Number(sub.id) });
      const sin = await trimestral(tx, p.id);
      for (const i of [con, sin]) await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: i.id });
      const codigosDe = async (f: { subprocesoId?: number }) =>
        (await matrizDelAnio(admin, { anio: 2026, procesoId: p.id, ...f }, opc(tx))).procesos.flatMap((x) => x.filas.map((r) => r.codigo)).sort();
      expect(await codigosDe({ subprocesoId: Number(sub.id) })).toEqual([con.codigo]);
      expect(await codigosDe({})).toEqual([con.codigo, sin.codigo].sort());
    }));
});

describe("lo que se ve de un desagregado (14C, Tarea 15; anexo 14C §5.6)", () => {
  it("desgloseDelAnio trae el desglose de cada periodo medido del año, en orden y con los números de las barras", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const { ind, quien, dimension, mediciones } = await desagregadoDePrueba(tx, {
        procesoId: p.id,
        ahora: AHORA,
        aprobadaEn: APROBADA,
        reportados: { "2026-T3": "182", "2026-T2": "150" },
      });
      // El primer trimestre, guardado sin reportar: no está medido.
      const [t1] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = '2026-T1'`;
      await reportar(
        quien,
        { medicionId: Number(t1.id), valores: {}, filas: [{ categoriaId: dimension.categorias[0], valores: { A: "1", B: "2" } }], parcial: true, confirmado: true },
        opc(tx),
      );

      const desgloses = await desgloseDelAnio(tx, ind.id, 2026);
      expect(desgloses.map((d) => d.periodo)).toEqual(["2026-T2", "2026-T3"]);
      expect(desgloses.map((d) => d.medicionId)).toEqual([mediciones["2026-T2"], mediciones["2026-T3"]]);
      const t3 = desgloses[1];
      expect(t3.dimension).toBe(dimension.nombre);
      expect(t3.filas.map((f) => f.numero)).toEqual([91, 86, 78, 55, null, null]);
      expect(t3.filas[0].numeros).toEqual({ A: 182, B: 200 });
      expect(t3.filas[5].numeros).toEqual({ A: null, B: null });
      expect(t3.total!.numero).toBeCloseTo(85.9375, 4);
      expect(t3.total!.numeros).toEqual({ A: 275, B: 320 });
      expect(t3.metaNumero).toBe(85);
      expect(desgloses[0].filas[0]).toMatchObject({ resultado: "75 %", numero: 75, semaforo: "atencion" });
      expect(await desgloseDelAnio(tx, ind.id, 2025)).toEqual([]);
    }));

  it("la lista y la tabla del año marcan las categorías en Crítico con el nombre de la dimensión", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const { ind, quien, dimension } = await desagregadoDePrueba(tx, { procesoId: p.id, ahora: AHORA, aprobadaEn: APROBADA, reportados: { "2026-T3": "182" } });
      const sinDesagregar = await trimestral(tx, p.id, { mide: [quien.usuarioId] });
      await medir(tx, quien, sinDesagregar, { "2026-T3": { A: "9", B: "10" } });

      const filas = (await lista(tx, quien, { procesoId: p.id })).filas;
      expect(filas.find((f) => f.id === ind.id)).toMatchObject({ periodo: "2026-T3", enCritico: 1, dimension: dimension.nombre });
      expect(filas.find((f) => f.id === sinDesagregar.id)).toMatchObject({ enCritico: null, dimension: null });

      const anio = (await resultadosDelAnio(quien, ind.id, 2026, opc(tx))).filas;
      expect(anio.find((f) => f.periodo === "2026-T3")).toMatchObject({ enCritico: 1, dimension: dimension.nombre, actualizable: false });
      // Un periodo abierto sin reportar no tiene marca, pero sí su dimensión y se le pueden actualizar las categorías; uno
      // que no ha terminado no tiene medición.
      expect(anio.find((f) => f.periodo === "2026-T2")).toMatchObject({ enCritico: null, dimension: dimension.nombre, actualizable: true });
      expect(anio.find((f) => f.periodo === "2026-T4")).toMatchObject({ enCritico: null, dimension: null, actualizable: false });
      // Sin desagregar, nada que actualizar.
      const otro = (await resultadosDelAnio(quien, sinDesagregar.id, 2026, opc(tx))).filas;
      expect(otro.every((f) => f.dimension === null && f.actualizable === false)).toBe(true);
    }));

  it("una fila «No aplica» no lleva los valores que tenía antes de marcarla, aunque sigan guardados (ronda 1, I2)", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const { ind, quien, dimension, mediciones } = await desagregadoDePrueba(tx, { procesoId: p.id, ahora: AHORA, aprobadaEn: APROBADA, reportados: { "2026-T3": "182" } });
      // La corrección marca «No aplica» la segunda sede, que tenía 43 de 50.
      const filas = filasDeMaqueta(dimension.categorias).map((f, i) => (i === 1 ? { categoriaId: f.categoriaId, valores: {}, noAplica: "No atendió pacientes en el trimestre" } : f));
      await reportar(quien, { medicionId: mediciones["2026-T3"], valores: {}, filas, parcial: false, confirmado: true }, opc(tx));
      const [t3] = await desgloseDelAnio(tx, ind.id, 2026);
      expect(t3.filas[1]).toMatchObject({ estado: "no_aplica", valores: { A: null, B: null }, numeros: { A: null, B: null }, resultado: null });
      expect(t3.total!.valores).toEqual({ A: "232", B: "270" });
      // Las celdas siguen guardadas: al quitarle el «No aplica» vuelven.
      const [celdas] = await tx`SELECT count(*)::int AS n FROM medicion_valores WHERE medicion_id = ${mediciones["2026-T3"]} AND categoria_id = ${dimension.categorias[1]}`;
      expect(celdas.n).toBe(2);
    }));

  it("el «No aplica» que deja la propagación cuando no hay nada que medir entra al desglose, y el desglose lo dice (ronda 1, I3)", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const { ind, quien, dimension } = await desagregadoDePrueba(tx, { procesoId: p.id, ahora: AHORA, aprobadaEn: APROBADA, reportados: { "2026-T2": "182" } });
      const t3 = await nadaQueMedir(tx, quien, ind.id, dimension.categorias, "2026-T3");
      const desgloses = await desgloseDelAnio(tx, ind.id, 2026);
      expect(desgloses.map((d) => [d.periodo, d.noAplica])).toEqual([
        ["2026-T2", null],
        ["2026-T3", MOTIVO_NADA_QUE_MEDIR],
      ]);
      expect(desgloses[1].medicionId).toBe(t3);
      expect(desgloses[1].filas.slice(0, 5).every((f) => f.estado === "sin_casos")).toBe(true);
      // El «No aplica» de toda la medición puesto por una persona sigue fuera.
      await tx`UPDATE mediciones SET no_aplica_motivo = 'No hubo auditorías en el trimestre' WHERE id = ${t3}`;
      expect((await desgloseDelAnio(tx, ind.id, 2026)).map((d) => d.periodo)).toEqual(["2026-T2"]);
    }));

  it("desagregacionDelAnio: los periodos medidos por categoría y la dimensión que rige el año; un año sin desagregar no tiene (ronda 1, M5 y M7)", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const { ind, dimension, mediciones } = await desagregadoDePrueba(tx, { procesoId: p.id, ahora: AHORA, aprobadaEn: APROBADA, reportados: { "2026-T2": "150", "2026-T3": "182" } });
      expect(await desagregacionDelAnio(tx, ind.id, 2026)).toEqual({
        medidos: [
          { medicionId: mediciones["2026-T2"], periodo: "2026-T2" },
          { medicionId: mediciones["2026-T3"], periodo: "2026-T3" },
        ],
        dimension: dimension.nombre,
      });
      // Un indicador que se midió sin desagregar en 2025 y se desagrega desde 2026.
      const admin = await sesionAdmin(tx);
      const sede = await dimensionDePrueba(tx, `Servicio ${p.id}`, ["Norte", "Sur"]);
      const antes = await indicadorDePrueba(tx, { procesoId: p.id, periodicidad: "trimestral", inicioMedicion: "2025-T1", aprobadaEn: new Date("2024-12-15T15:00:00Z") });
      await versionNueva(tx, { indicadorId: antes.id, usuarioId: admin.usuarioId, tipoCambio: "mayor", rigeDesde: "2026-T1", aprobadaEn: new Date("2025-12-20T15:00:00Z"), periodicidad: "trimestral", dimensionId: sede.id });
      expect(await desagregacionDelAnio(tx, antes.id, 2025)).toEqual({ medidos: [], dimension: null });
      expect((await desagregacionDelAnio(tx, antes.id, 2026)).dimension).toBe(`Servicio ${p.id}`);
    }));
});
