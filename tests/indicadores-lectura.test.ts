/**
 * Las lecturas del módulo de indicadores (Fase 14A, Tarea 15; spec §8.10, §11, §12.2, §12.3 y §12.7): la lista con sus
 * filtros y su barra de estados, lo que la persona puede hacer con un indicador, los resultados del año (filas, acumulado
 * y series de las gráficas) y la matriz del año. Contra la BD de desarrollo, dentro de una transacción que se revierte;
 * cada caso crea sus propios procesos y filtra por ellos, con la hora inyectada: lo que ya trae la base no cambia las
 * cuentas.
 */
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { analizar } from "@/db/consultas/indicadores/analisis";
import { abrirCambio } from "@/db/consultas/indicadores/fichas";
import {
  filtroDeConsulta,
  listarIndicadores,
  matrizDelAnio,
  obtenerIndicador,
  resultadosDelAnio,
  type CeldaDeMatriz,
  type FiltroDeLista,
} from "@/db/consultas/indicadores/lectura";
import { asegurarMediciones, marcarNoAplica, reportar } from "@/db/consultas/indicadores/mediciones";
import { retirar } from "@/db/consultas/indicadores/operacion";
import { indicadorDePrueba, versionTrimestral, type IndicadorDePrueba, type OpcionesIndicadorDePrueba } from "./utiles/indicadores";
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
      expect(deAjeno.resumen).toEqual({ bien: 1, atencion: 0, critico: 0, sinDato: 0, vencidos: 0 });

      // El Admin SGC sí: el crítico, y su análisis vencido.
      const deAdmin = await lista(tx, admin, { procesoId: p.id });
      expect(deAdmin.filas.map((f) => f.codigo).sort()).toEqual([general.codigo, restringido.codigo].sort());
      expect(deAdmin.resumen).toEqual({ bien: 1, atencion: 0, critico: 1, sinDato: 0, vencidos: 1 });
      expect(deAdmin.filas.find((f) => f.codigo === restringido.codigo)).toMatchObject({ restringido: true, semaforo: "critico" });

      // El filtro de semáforo no cambia la barra: se cuenta antes.
      const criticos = await lista(tx, admin, { procesoId: p.id, semaforo: "critico" });
      expect(criticos.filas.map((f) => f.codigo)).toEqual([restringido.codigo]);
      expect(criticos.resumen).toEqual(deAdmin.resumen);
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
      expect(deAdmin.resumen).toEqual({ bien: 1, atencion: 0, critico: 0, sinDato: 0, vencidos: 0 });

      // Un cambio en curso sobre la aprobada: el nombre sigue siendo el aprobado y el cambio se marca, solo a quien administra.
      const cambio = await abrirCambio(admin, general.id, { sql: tx });
      const [actual] = await tx`SELECT nombre FROM indicador_versiones WHERE id = ${cambio.versionId}`;
      expect(actual.nombre).toBe(`Indicador de prueba ${general.codigo}`);
      const conCambio = (await lista(tx, admin, { procesoId: p.id })).filas.find((f) => f.codigo === general.codigo);
      expect(conCambio).toMatchObject({ nombre: `Indicador de prueba ${general.codigo}`, cambioEnCurso: "borrador" });
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
});
