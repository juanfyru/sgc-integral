/**
 * La medición desagregada (Fase 14C, Tarea 14; anexo 14C §5): la lista de categorías que cada medición fija al abrirse, el
 * reporte de la rejilla (una celda por categoría y variable propia), el total que suma las categorías y escribe solo el
 * sistema, el desglose por categoría, «Actualizar categorías», el cambio de dimensión, el dato compartido por categoría y el
 * aviso de una categoría en Crítico. Contra la BD de desarrollo, dentro de una transacción que se revierte.
 *
 * El indicador de la maqueta 9 es mensual desde julio de 2026, aprobado el 15 de agosto (julio es histórico), de forma
 * «porcentaje», meta 85 y Crítico por debajo de 70, desagregado por sede, en un proceso que solo existe en la transacción.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { actualizarCategorias, desgloseDe, rehacerCategorias } from "@/db/consultas/indicadores/categorias";
import { reabrirMedicion } from "@/db/consultas/indicadores/cierre";
import { registrarHistoricos } from "@/db/consultas/indicadores/historicos";
import { asegurarMediciones, quitarNoAplica, recalcularMedicion, reportar } from "@/db/consultas/indicadores/mediciones";
import { propagar, valorDeDato } from "@/db/consultas/indicadores/propagacion";
import { columnasDePendiente, queFalta } from "@/db/consultas/indicadores/tareas";
import { adminsActivos } from "@/db/consultas/tramites";
import { describirEvento } from "@/lib/bitacora-detalle";
import { EsquemaReporte, juntarValoresDeReporte } from "@/lib/esquemas/indicadores";
import { historialDeCorreccion } from "@/lib/indicadores/historial";
import { ErrorIndicador, MOTIVO_DATO_SIN_CATEGORIA, MOTIVO_TODAS_NO_APLICAN, type TipoEvento } from "@/lib/indicadores/tipos";
import { ErrorPermiso } from "@/lib/permisos";
import { parsearFormulario } from "@/lib/validacion";
import {
  datoDePrueba,
  dimensionDePrueba,
  indicadorDePrueba,
  periodoDeDatoDePrueba,
  versionNueva,
  type OpcionesIndicadorDePrueba,
} from "./utiles/indicadores";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

let consecutivo = 0;
const unico = () => `${Date.now() % 100_000_000}${(consecutivo += 1)}`;

const AHORA = new Date("2026-11-05T15:00:00Z");
const APROBADA = new Date("2026-08-15T15:00:00Z");
const OCTUBRE = "2026-10";
const SEDES = ["Sede principal", "Puesto de salud 1", "Puesto de salud 2", "Puesto de salud 3", "Puesto de salud 4", "Puesto de salud 5"];
const OBRAS = "Cerrado por obras todo octubre.";

type Fila = { categoriaId: number; valores: Record<string, string | undefined>; noAplica?: string | null };

/** Las seis sedes de la maqueta 9: cinco con valores (la cuarta, sin casos) y la última «No aplica». */
const maqueta = (ids: number[]): Fila[] => [
  { categoriaId: ids[0], valores: { A: "182", B: "200" } },
  { categoriaId: ids[1], valores: { A: "43", B: "50" } },
  { categoriaId: ids[2], valores: { A: "39", B: "50" } },
  { categoriaId: ids[3], valores: { A: "11", B: "20" } },
  { categoriaId: ids[4], valores: { A: "0", B: "0" } },
  { categoriaId: ids[5], valores: {}, noAplica: OBRAS },
];

async function rechaza(promesa: Promise<unknown>, mensaje: string) {
  const err = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ErrorIndicador);
  expect((err as Error).message).toBe(mensaje);
}

const opc = (tx: TransactionSql, ahora = AHORA) => ({ sql: tx, ahora });

const rejilla = (tx: TransactionSql, sesion: SesionFlujo, medicionId: number, filas: Fila[], parcial = false, ahora = AHORA) =>
  reportar(sesion, { medicionId, valores: {}, filas, parcial, confirmado: true }, opc(tx, ahora));

async function procesoNuevo(tx: TransactionSql): Promise<number> {
  const sigla = `Z${unico()}`;
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${`Proceso ${sigla}`}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id`;
  return Number(p.id);
}

const medicionDe = async (tx: TransactionSql, indicadorId: number, periodo: string) =>
  Number((await tx`SELECT id FROM mediciones WHERE indicador_id = ${indicadorId} AND periodo = ${periodo}`)[0].id);

const fila = async (tx: TransactionSql, medicionId: number) => (await tx`SELECT * FROM mediciones WHERE id = ${medicionId}`)[0];

/** Las filas de `medicion_valores` de la medición: las celdas (con categoría) y el total (sin ella). */
const valoresDe = async (tx: TransactionSql, medicionId: number) => {
  const filas = await tx`SELECT mv.categoria_id, iv.letra, mv.valor, mv.reportado_por FROM medicion_valores mv
    JOIN indicador_variables iv ON iv.id = mv.variable_id WHERE mv.medicion_id = ${medicionId} ORDER BY mv.categoria_id NULLS LAST, iv.letra`;
  const lista = filas.map((f) => ({
    categoria: f.categoria_id === null ? null : Number(f.categoria_id),
    letra: f.letra as string,
    valor: Number(f.valor),
    por: f.reportado_por === null ? null : Number(f.reportado_por),
  }));
  return { celdas: lista.filter((v) => v.categoria !== null), total: lista.filter((v) => v.categoria === null) };
};

const eventos = (tx: TransactionSql, medicionId: number) =>
  tx`SELECT tipo, usuario_id, detalle FROM medicion_eventos WHERE medicion_id = ${medicionId} ORDER BY id`;

/** El indicador de la maqueta 9 con quienes lo miden, lo analizan y le hacen seguimiento y el líder de su proceso. */
async function entorno(tx: TransactionSql, o: OpcionesIndicadorDePrueba = {}) {
  const procesoId = await procesoNuevo(tx);
  const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [procesoId] });
  const mide = await usuarioDePrueba(tx, { rol: "consulta" });
  const otro = await usuarioDePrueba(tx, { rol: "consulta" });
  const analiza = await usuarioDePrueba(tx, { rol: "consulta" });
  const sigue = await usuarioDePrueba(tx, { rol: "gerencia" });
  const admin = await sesionAdmin(tx);
  const sede = await dimensionDePrueba(tx, `Sede ${unico()}`, SEDES);
  const ind = await indicadorDePrueba(tx, {
    procesoId,
    periodicidad: "mensual",
    inicioMedicion: "2026-07",
    aprobadaEn: APROBADA,
    meta: "85",
    modo: "fijo",
    limite: "70",
    dimensionId: sede.id,
    variables: { A: { nombre: "Pacientes con manejo adherente" }, B: { nombre: "Pacientes auditados" } },
    mide: [mide.usuarioId, otro.usuarioId],
    analiza: [analiza.usuarioId],
    seguimiento: [sigue.usuarioId],
    ...o,
  });
  await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: ind.id });
  const [dimension] = await tx`SELECT nombre FROM dimensiones WHERE id = ${sede.id}`;
  return { procesoId, lider, mide, otro, analiza, sigue, admin, sede: { ...sede, nombre: dimension.nombre as string }, ind, octubre: await medicionDe(tx, ind.id, OCTUBRE) };
}

/** Una categoría más de la dimensión, creada ahora (después de terminar los periodos de la prueba). */
async function categoriaNueva(tx: TransactionSql, dimensionId: number, nombre: string): Promise<number> {
  const [c] = await tx`INSERT INTO dimension_categorias (dimension_id, nombre, orden)
    VALUES (${dimensionId}, ${nombre}, (SELECT coalesce(max(orden), 0) + 1 FROM dimension_categorias WHERE dimension_id = ${dimensionId}))
    RETURNING id`;
  return Number(c.id);
}

describe("la lista de categorías de una medición", () => {
  it("una abierta trae las activas en su periodo; la creada después no entra, la desactivada a mitad sí; una histórica no lleva lista", () =>
    revertida(sql, async (tx) => {
      const [d] = await tx`INSERT INTO dimensiones (nombre, orden) VALUES (${`Servicio ${unico()}`}, 99) RETURNING id`;
      const crear = (nombre: string, orden: number, creado: string, desactivada: string | null) =>
        tx`INSERT INTO dimension_categorias (dimension_id, nombre, orden, activo, creado_en, desactivada_en)
          VALUES (${d.id}, ${nombre}, ${orden}, ${desactivada === null}, ${new Date(creado)}, ${desactivada === null ? null : new Date(desactivada)})`;
      await crear("Antigua", 1, "2025-01-10T12:00:00Z", null);
      await crear("Nueva", 2, "2026-11-02T12:00:00Z", null);
      await crear("Cerró en octubre", 3, "2025-01-10T12:00:00Z", "2026-10-15T12:00:00Z");
      await crear("Cerró en agosto", 4, "2025-01-10T12:00:00Z", "2026-08-20T12:00:00Z");
      const ind = await indicadorDePrueba(tx, { periodicidad: "mensual", inicioMedicion: "2026-07", aprobadaEn: APROBADA, dimensionId: Number(d.id) });
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: ind.id });
      const lista = async (periodo: string) => (await fila(tx, await medicionDe(tx, ind.id, periodo))).categorias as { nombre: string; noAplica: unknown }[] | null;

      expect((await lista("2026-10"))!.map((c) => c.nombre)).toEqual(["Antigua", "Cerró en octubre"]);
      expect((await lista("2026-09"))!.map((c) => c.nombre)).toEqual(["Antigua", "Cerró en octubre"]);
      expect((await lista("2026-08"))!.map((c) => c.nombre)).toEqual(["Antigua", "Cerró en octubre", "Cerró en agosto"]);
      expect((await lista("2026-10"))!.every((c) => c.noAplica === null)).toBe(true);
      const julio = await fila(tx, await medicionDe(tx, ind.id, "2026-07"));
      expect(julio.historica).toBe(true);
      expect(julio.categorias).toBeNull();
    }));
});

describe("reportar la rejilla", () => {
  it("la maqueta 9: diez celdas, el total sin usuario, 85,9 % Bien, una sede en Crítico y el desglose", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const ids = e.sede.categorias;
      const r = await rejilla(tx, e.mide, e.octubre, maqueta(ids));
      expect(r).toMatchObject({ ok: true, estado: "reportada", semaforo: "bien", cumple: true, faltaDato: false });

      const { celdas, total } = await valoresDe(tx, e.octubre);
      expect(celdas).toHaveLength(10);
      expect(celdas.every((c) => c.por === e.mide.usuarioId)).toBe(true);
      expect(total).toEqual([
        { categoria: null, letra: "A", valor: 275, por: null },
        { categoria: null, letra: "B", valor: 320, por: null },
      ]);
      const m = await fila(tx, e.octubre);
      expect(m.semaforo).toBe("bien");
      expect(m.categorias_en_critico).toBe(1);
      expect(m.reportada_por).toBe(e.mide.usuarioId);
      expect(m.requiere_accion).toBe(false);
      expect((m.categorias as { id: number; noAplica: string | null }[]).find((c) => c.id === ids[5])!.noAplica).toBe(OBRAS);

      const d = await desgloseDe(tx, e.octubre);
      expect(d).not.toBeNull();
      expect(d!.filas.map((f) => [f.categoria.nombre, f.estado, f.resultado, f.semaforo])).toEqual([
        ["Sede principal", "completa", "91 %", "bien"],
        ["Puesto de salud 1", "completa", "86 %", "bien"],
        ["Puesto de salud 2", "completa", "78 %", "atencion"],
        ["Puesto de salud 3", "completa", "55 %", "critico"],
        ["Puesto de salud 4", "sin_casos", null, null],
        ["Puesto de salud 5", "no_aplica", null, null],
      ]);
      expect(d!.filas[0].valores).toEqual({ A: "182", B: "200" });
      expect(d!.enCritico).toEqual(["Puesto de salud 3"]);
      expect(d!.total).toEqual({ valores: { A: "275", B: "320" }, resultado: "85,9 %", semaforo: "bien", cumple: true });
      expect(d).toMatchObject({ medicionId: e.octubre, periodo: OCTUBRE, dimension: e.sede.nombre, meta: "85 %" });

      // El evento del reporte lleva cada celda que cambió; lo mismo otra vez no deja nada.
      const [reporte] = await eventos(tx, e.octubre);
      expect(reporte.tipo).toBe("reporte");
      expect((reporte.detalle.categorias as unknown[]).length).toBe(6);
      expect(reporte.detalle.despues).toMatchObject({ A: "275", B: "320" });
      await rejilla(tx, e.mide, e.octubre, maqueta(ids));
      expect(await eventos(tx, e.octubre)).toHaveLength(1);
    }));

  it("falta una fila: dice cuál y no reporta nada; «No aplica» sin motivo dice de qué sede", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const ids = e.sede.categorias;
      await rechaza(rejilla(tx, e.mide, e.octubre, maqueta(ids).filter((f) => f.categoriaId !== ids[2])), "Faltan categorías por completar: Puesto de salud 2");
      expect((await fila(tx, e.octubre)).reportada_en).toBeNull();
      expect((await valoresDe(tx, e.octubre)).celdas).toEqual([]);

      const sinMotivo = maqueta(ids).map((f) => (f.categoriaId === ids[5] ? { ...f, noAplica: "abc" } : f));
      await rechaza(rejilla(tx, e.mide, e.octubre, sinMotivo), "Escriba el motivo de «No aplica» de Puesto de salud 5");
      await rechaza(rejilla(tx, e.mide, e.octubre, sinMotivo, true), "Escriba el motivo de «No aplica» de Puesto de salud 5");
      // Un motivo de los que usa el sistema no lo escribe una persona.
      const reservado = maqueta(ids).map((f) => (f.categoriaId === ids[5] ? { ...f, noAplica: MOTIVO_DATO_SIN_CATEGORIA } : f));
      await rechaza(rejilla(tx, e.mide, e.octubre, reservado), "Ese motivo lo usa el sistema: escriba el suyo con otras palabras");
      // Una categoría que no está en la lista, o un total digitado, es otro formulario.
      await rechaza(rejilla(tx, e.mide, e.octubre, [{ categoriaId: 999_999_999, valores: { A: "1" } }]), "La ficha del indicador cambió: recargue la página");
      await rechaza(
        reportar(e.mide, { medicionId: e.octubre, valores: { A: "275", B: "320" }, parcial: false, confirmado: true }, opc(tx)),
        "La ficha del indicador cambió: recargue la página",
      );
    }));

  it("todas «No aplica»: la medición queda «No aplica» por el sistema, y el siguiente reporte con una fila medida lo quita", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const ids = e.sede.categorias;
      const todas = ids.map((categoriaId) => ({ categoriaId, valores: {}, noAplica: "No hubo atención en el mes" }));
      expect(await rejilla(tx, e.mide, e.octubre, todas)).toMatchObject({ ok: true, estado: "reportada" });
      let m = await fila(tx, e.octubre);
      expect(m).toMatchObject({ no_aplica: true, no_aplica_motivo: MOTIVO_TODAS_NO_APLICAN, resultado_exacto: null });
      expect(m.reportada_en).not.toBeNull();
      expect((await valoresDe(tx, e.octubre)).total).toEqual([]);
      // Ese «No aplica» no lo quita una persona: se va con el reporte de la rejilla.
      await rechaza(quitarNoAplica(e.mide, e.octubre, opc(tx)), "Este «No aplica» lo puso el sistema: se quita solo cuando cambie el dato");

      const medidas = maqueta(ids).map((f, i) => (i < 5 ? { ...f, noAplica: null } : f));
      expect(await rejilla(tx, e.mide, e.octubre, medidas)).toMatchObject({ ok: true, semaforo: "bien" });
      m = await fila(tx, e.octubre);
      expect(m).toMatchObject({ no_aplica: false, no_aplica_motivo: null, semaforo: "bien" });
      expect(Number(m.resultado)).toBeCloseTo(85.9375, 6);
      expect((await eventos(tx, e.octubre)).map((x) => x.tipo)).toEqual(["reporte", "correccion"]);
    }));

  it("los límites de captura valen por celda y la confirmación por variación, sobre el total; sin confirmar no se escribe nada", () =>
    revertida(sql, async (tx) => {
      const variables = { A: { nombre: "Pacientes con manejo adherente", capturaMax: "150" }, B: { nombre: "Pacientes auditados" } };
      const e = await entorno(tx, { variables });
      const ids = e.sede.categorias;
      await rechaza(rejilla(tx, e.mide, e.octubre, maqueta(ids)), "Sede principal: «Pacientes con manejo adherente» no puede pasar de 150");
      expect((await valoresDe(tx, e.octubre)).celdas).toEqual([]);

      const septiembre = await medicionDe(tx, e.ind.id, "2026-09");
      const dentro = maqueta(ids).map((f, i) => (i === 0 ? { ...f, valores: { A: "150", B: "200" } } : f));
      await rejilla(tx, e.mide, septiembre, dentro);
      const bajo = dentro.map((f, i) => (i === 0 ? { ...f, valores: { A: "10", B: "200" } } : f));
      const r = await reportar(e.mide, { medicionId: e.octubre, valores: {}, filas: bajo, parcial: false, confirmado: false }, opc(tx));
      expect(r.ok).toBe(false);
      expect((await valoresDe(tx, e.octubre)).celdas).toEqual([]);
      expect((await fila(tx, e.octubre)).reportada_en).toBeNull();
    }));

  it("dos personas guardan sin reportar sedes distintas y no se pisan", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const ids = e.sede.categorias;
      const filas = maqueta(ids);
      await rejilla(tx, e.mide, e.octubre, filas.slice(0, 2), true);
      await rejilla(tx, e.otro, e.octubre, filas.slice(2, 4), true);
      const { celdas, total } = await valoresDe(tx, e.octubre);
      expect(celdas.map((c) => [c.categoria, c.letra, c.valor, c.por])).toEqual([
        [ids[0], "A", 182, e.mide.usuarioId],
        [ids[0], "B", 200, e.mide.usuarioId],
        [ids[1], "A", 43, e.mide.usuarioId],
        [ids[1], "B", 50, e.mide.usuarioId],
        [ids[2], "A", 39, e.otro.usuarioId],
        [ids[2], "B", 50, e.otro.usuarioId],
        [ids[3], "A", 11, e.otro.usuarioId],
        [ids[3], "B", 20, e.otro.usuarioId],
      ]);
      expect(total).toEqual([]);
      expect((await fila(tx, e.octubre)).reportada_en).toBeNull();
      // «Guardar sin reportar» no calcula ni deja evento: solo su entrada de bitácora.
      expect(await eventos(tx, e.octubre)).toHaveLength(0);
      const [bitacora] = await tx`SELECT detalle FROM auditoria WHERE accion = 'medicion_guardada' AND entidad_id = ${e.octubre} ORDER BY id LIMIT 1`;
      expect((bitacora.detalle.categorias as { id: number }[]).map((c) => c.id)).toEqual([ids[0], ids[1]]);
      // Vaciar una celda («») la quita; una que no vino no se toca.
      await rejilla(tx, e.otro, e.octubre, [{ categoriaId: ids[0], valores: { A: "" } }], true);
      expect((await valoresDe(tx, e.octubre)).celdas.filter((c) => c.categoria === ids[0]).map((c) => c.letra)).toEqual(["B"]);
    }));

  it("el total no lo pisa nadie: sin reportar no se escribe; ya reportada no se guarda sin reportar; corregir lo deja del sistema", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const ids = e.sede.categorias;
      await rejilla(tx, e.mide, e.octubre, maqueta(ids), true);
      expect((await valoresDe(tx, e.octubre)).total).toEqual([]);
      await rejilla(tx, e.mide, e.octubre, []);
      const reportado = await valoresDe(tx, e.octubre);

      // Ya reportada, «Guardar sin reportar» se rechaza como en cualquier medición y no escribe nada.
      await rechaza(
        rejilla(tx, e.otro, e.octubre, [{ categoriaId: ids[0], valores: { A: "150" } }], true),
        "La medición ya se reportó: corrija los datos y pulse «Reportar»",
      );
      expect(await valoresDe(tx, e.octubre)).toEqual(reportado);

      // Una corrección cambia la celda y el sistema reescribe el total: sigue sin usuario.
      await rejilla(tx, e.otro, e.octubre, [{ categoriaId: ids[0], valores: { A: "150" } }]);
      const v = await valoresDe(tx, e.octubre);
      expect(v.total.map((t) => [t.letra, t.valor, t.por])).toEqual([
        ["A", 243, null],
        ["B", 320, null],
      ]);
      expect(v.celdas.find((c) => c.categoria === ids[0] && c.letra === "A")).toMatchObject({ valor: 150, por: e.otro.usuarioId });
      expect((await fila(tx, e.octubre)).semaforo).toBe("atencion");
      const correccion = (await eventos(tx, e.octubre)).at(-1)!;
      expect(correccion).toMatchObject({ tipo: "correccion", usuario_id: e.otro.usuarioId });
      expect(correccion.detalle.categorias).toEqual([{ id: ids[0], nombre: "Sede principal", antes: { A: "182" }, despues: { A: "150" } }]);
    }));

  it("un cambio menor (otros ids, mismas letras) no borra el total al corregir, ni duplica celdas", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const ids = e.sede.categorias;
      await rejilla(tx, e.mide, e.octubre, maqueta(ids));
      await versionNueva(tx, {
        indicadorId: e.ind.id,
        usuarioId: e.admin.usuarioId,
        tipoCambio: "menor",
        rigeDesde: "2026-07",
        aprobadaEn: AHORA,
        dimensionId: e.sede.id,
        meta: "85",
        limite: "70",
      });
      await rejilla(tx, e.mide, e.octubre, []);
      let v = await valoresDe(tx, e.octubre);
      expect(v.total.map((t) => [t.letra, t.valor, t.por])).toEqual([
        ["A", 275, null],
        ["B", 320, null],
      ]);
      let m = await fila(tx, e.octubre);
      expect(Number(m.resultado)).toBeCloseTo(85.9375, 6);
      expect(m).toMatchObject({ estado: "reportada", semaforo: "bien", categorias_en_critico: 1 });
      const correcciones = await tx`SELECT 1 FROM notificaciones WHERE entidad = 'medicion' AND entidad_id = ${e.octubre} AND tipo = 'indicadores.correccion'`;
      expect(correcciones).toHaveLength(0);

      // Corregir una celda de A: el total de A cambia, el de B sigue, y ninguna celda queda dos veces.
      await rejilla(tx, e.mide, e.octubre, [{ categoriaId: ids[0], valores: { A: "183" } }]);
      v = await valoresDe(tx, e.octubre);
      expect(v.total.map((t) => [t.letra, t.valor])).toEqual([
        ["A", 276],
        ["B", 320],
      ]);
      const repetidas = await tx`SELECT mv.categoria_id, iv.letra, count(*)::int AS n FROM medicion_valores mv
        JOIN indicador_variables iv ON iv.id = mv.variable_id WHERE mv.medicion_id = ${e.octubre}
        GROUP BY mv.categoria_id, iv.letra HAVING count(*) > 1`;
      expect(repetidas).toEqual([]);
      expect(v.celdas.find((c) => c.categoria === ids[0] && c.letra === "A")!.valor).toBe(183);
      m = await fila(tx, e.octubre);
      expect(Number(m.resultado)).toBeCloseTo((276 / 320) * 100, 6);
    }));

  it("corregir una celda sin cambiar el total deja la corrección con las dos sedes, su antes y su después", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const ids = e.sede.categorias;
      await rejilla(tx, e.mide, e.octubre, maqueta(ids));
      await rejilla(tx, e.mide, e.octubre, [
        { categoriaId: ids[0], valores: { A: "183" } },
        { categoriaId: ids[1], valores: { A: "42" } },
      ]);
      const correccion = (await eventos(tx, e.octubre)).at(-1)!;
      expect(correccion.tipo).toBe("correccion");
      expect(correccion.detalle.categorias).toEqual([
        { id: ids[0], nombre: "Sede principal", antes: { A: "182" }, despues: { A: "183" } },
        { id: ids[1], nombre: "Puesto de salud 1", antes: { A: "43" }, despues: { A: "42" } },
      ]);
      expect(correccion.detalle.antes.A).toBe("275");
      expect(correccion.detalle.despues.A).toBe("275");
      const [bitacora] = await tx`SELECT detalle FROM auditoria WHERE accion = 'medicion_corregida' AND entidad_id = ${e.octubre}`;
      expect((bitacora.detalle.categorias as unknown[]).length).toBe(2);
    }));

  it("la cifra y el color de una categoría: «Bien · no alcanza la meta» con rangos escritos", () =>
    revertida(sql, async (tx) => {
      const rangos = {
        bien: [{ signo: ">=" as const, valor: "91" }],
        atencion: [{ signo: "entre" as const, valor: "41", hasta: "90" }],
        critico: [{ signo: "<=" as const, valor: "40" }],
      };
      const e = await entorno(tx, { rangos, meta: "100", modo: undefined, limite: undefined });
      await rejilla(tx, e.mide, e.octubre, [{ categoriaId: e.sede.categorias[0], valores: { A: "95", B: "100" } }], true);
      const d = await desgloseDe(tx, e.octubre);
      expect(d!.filas[0]).toMatchObject({ estado: "completa", resultado: "95 %", semaforo: "bien", cumple: false });
      expect(d!.filas[1]).toMatchObject({ estado: "incompleta", resultado: null, semaforo: null, cumple: null });
      expect(d!.total).toBeNull();
    }));

  it("reabrir un periodo viejo después de crear una sede: la lista es la de entonces y el total se recalcula igual", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const septiembre = await medicionDe(tx, e.ind.id, "2026-09");
      await rejilla(tx, e.mide, septiembre, maqueta(e.sede.categorias));
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id = ${septiembre}`;
      await categoriaNueva(tx, e.sede.id, "Puesto de salud 6");
      await reabrirMedicion(e.admin, { medicionId: septiembre, justificacion: "Se revisa la auditoría de septiembre" }, opc(tx));
      const m = await fila(tx, septiembre);
      expect((m.categorias as { nombre: string }[]).map((c) => c.nombre)).toEqual(SEDES);
      expect(Number(m.resultado)).toBeCloseTo(85.9375, 6);
      expect(m.categorias_en_critico).toBe(1);
    }));

  it("un histórico de un desagregado se registra con el total: sin lista, sin celdas y sin desglose", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const julio = await medicionDe(tx, e.ind.id, "2026-07");
      await registrarHistoricos(e.admin, { indicadorId: e.ind.id, filas: [{ periodo: "2026-07", valores: { A: "80", B: "100" } }] }, opc(tx));
      const m = await fila(tx, julio);
      expect(Number(m.resultado)).toBe(80);
      expect(m.categorias).toBeNull();
      expect(m.categorias_en_critico).toBeNull();
      const v = await valoresDe(tx, julio);
      expect(v.celdas).toEqual([]);
      expect(v.total.map((t) => [t.letra, t.valor, t.por])).toEqual([
        ["A", 80, e.admin.usuarioId],
        ["B", 100, e.admin.usuarioId],
      ]);
      expect(await desgloseDe(tx, julio)).toBeNull();
    }));
});

describe("«Actualizar categorías» y el cambio de dimensión", () => {
  it("añade la sede que se registró tarde, no quita ninguna y no toca una reportada", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const tarde = await categoriaNueva(tx, e.sede.id, "Puesto de salud 6");
      await tx`UPDATE dimension_categorias SET activo = false, desactivada_en = now() WHERE id = ${e.sede.categorias[1]}`;
      const err = await actualizarCategorias(e.mide, e.octubre, opc(tx)).then(
        () => null,
        (x: unknown) => x,
      );
      expect(err).toBeInstanceOf(ErrorPermiso);

      expect(await actualizarCategorias(e.admin, e.octubre, opc(tx))).toEqual({ agregadas: 1 });
      const lista = (await fila(tx, e.octubre)).categorias as { id: number; nombre: string; noAplica: unknown }[];
      expect(lista.map((c) => c.nombre)).toEqual([...SEDES, "Puesto de salud 6"]);
      expect(lista.at(-1)).toMatchObject({ id: tarde, noAplica: null });
      const [evento] = await eventos(tx, e.octubre);
      expect(evento).toMatchObject({ tipo: "categorias", usuario_id: e.admin.usuarioId });
      expect(evento.detalle.agregadas).toEqual([{ id: tarde, nombre: "Puesto de salud 6" }]);
      const [bitacora] = await tx`SELECT usuario_id, detalle FROM auditoria WHERE accion = 'medicion_categorias_actualizadas' AND entidad_id = ${e.octubre}`;
      expect(bitacora.detalle).toMatchObject({ codigo: e.ind.codigo, periodo: OCTUBRE, agregadas: ["Puesto de salud 6"] });
      expect(describirEvento({ accion: "medicion_categorias_actualizadas", entidad: "medicion", entidadId: e.octubre, detalle: bitacora.detalle })).toBe(
        `Actualizó las categorías de ${e.ind.codigo}, octubre de 2026: añadió Puesto de salud 6`,
      );
      // Otra vez no añade nada ni deja nada.
      expect(await actualizarCategorias(e.admin, e.octubre, opc(tx))).toEqual({ agregadas: 0 });
      expect(await eventos(tx, e.octubre)).toHaveLength(1);

      const septiembre = await medicionDe(tx, e.ind.id, "2026-09");
      await rejilla(tx, e.mide, septiembre, maqueta(e.sede.categorias));
      await rechaza(actualizarCategorias(e.admin, septiembre, opc(tx)), "Solo se actualizan las categorías de una medición abierta sin reportar");
    }));

  it("una medición que nació sin categorías no se reporta vacía: se actualizan", () =>
    revertida(sql, async (tx) => {
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const admin = await sesionAdmin(tx);
      const [d] = await tx`INSERT INTO dimensiones (nombre, orden) VALUES (${`Sede ${unico()}`}, 99) RETURNING id`;
      await tx`INSERT INTO dimension_categorias (dimension_id, nombre, orden, creado_en) VALUES (${d.id}, 'Única', 1, ${new Date("2026-11-03T12:00:00Z")})`;
      const ind = await indicadorDePrueba(tx, { periodicidad: "mensual", inicioMedicion: "2026-07", aprobadaEn: APROBADA, dimensionId: Number(d.id), mide: [mide.usuarioId] });
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: ind.id });
      const octubre = await medicionDe(tx, ind.id, OCTUBRE);
      expect((await fila(tx, octubre)).categorias).toEqual([]);
      await rechaza(rejilla(tx, mide, octubre, []), "Esta medición no tiene categorías: pida al Administrador del SGC que las actualice");
      expect(await actualizarCategorias(admin, octubre, opc(tx))).toEqual({ agregadas: 1 });
    }));

  it("un cambio mayor de dimensión rehace la lista de una abierta y quita sus celdas; una reportada no se toca", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const septiembre = await medicionDe(tx, e.ind.id, "2026-09");
      await rejilla(tx, e.mide, septiembre, maqueta(e.sede.categorias));
      await rejilla(tx, e.mide, e.octubre, maqueta(e.sede.categorias).slice(0, 2), true);
      const servicio = await dimensionDePrueba(tx, `Servicio ${unico()}`, ["Urgencias", "Consulta externa"]);
      await versionNueva(tx, { indicadorId: e.ind.id, usuarioId: e.admin.usuarioId, tipoCambio: "mayor", rigeDesde: OCTUBRE, aprobadaEn: AHORA, dimensionId: servicio.id });

      expect(await rehacerCategorias(tx, e.ind.id, OCTUBRE, AHORA)).toBe(1);
      const octubre = await fila(tx, e.octubre);
      expect((octubre.categorias as { nombre: string }[]).map((c) => c.nombre)).toEqual(["Urgencias", "Consulta externa"]);
      expect(await valoresDe(tx, e.octubre)).toEqual({ celdas: [], total: [] });
      const ultimo = (await eventos(tx, e.octubre)).at(-1)!;
      expect(ultimo).toMatchObject({ tipo: "categorias", usuario_id: null });
      expect(ultimo.detalle).toMatchObject({ causa: "dimension" });

      const sept = await fila(tx, septiembre);
      expect((sept.categorias as { nombre: string }[]).map((c) => c.nombre)).toEqual(SEDES);
      expect((await valoresDe(tx, septiembre)).celdas).toHaveLength(10);
      // Ya en la dimensión nueva, otro cambio mayor que no la cambia no rehace nada.
      expect(await rehacerCategorias(tx, e.ind.id, OCTUBRE, AHORA)).toBe(0);
    }));
});

describe("un dato compartido por categoría (anexo §5.7)", () => {
  const AHORA_T = new Date("2026-04-20T15:00:00Z");
  /** Un trimestral sin variables propias, con dos datos mensuales por sede; S3 nace en marzo y S4 se registra tarde. */
  async function porSede(tx: TransactionSql, propia = false) {
    const procesoId = await procesoNuevo(tx);
    const mide = await usuarioDePrueba(tx, { rol: "consulta" });
    const admin = await sesionAdmin(tx);
    const sede = await dimensionDePrueba(tx, `Sede ${unico()}`, ["S1", "S2"]);
    const [s3] = await tx`INSERT INTO dimension_categorias (dimension_id, nombre, orden, creado_en)
      VALUES (${sede.id}, 'S3', 3, ${new Date("2026-03-10T12:00:00Z")}) RETURNING id`;
    const [s1, s2] = sede.categorias;
    const S3 = Number(s3.id);
    const datoA = await datoDePrueba(tx, { procesoId, nombre: `Adherentes ${unico()}`, dimensionId: sede.id });
    const datoB = await datoDePrueba(tx, { procesoId, nombre: `Auditados ${unico()}`, dimensionId: sede.id });
    const ind = await indicadorDePrueba(tx, {
      procesoId,
      periodicidad: "trimestral",
      inicioMedicion: "2026-T1",
      aprobadaEn: new Date("2025-12-15T15:00:00Z"),
      dimensionId: sede.id,
      mide: [mide.usuarioId],
      variables: { A: propia ? { nombre: "Adherentes" } : { datoId: datoA }, B: { datoId: datoB } },
    });
    await asegurarMediciones({ sql: tx, ahora: AHORA_T, indicadorId: ind.id });
    const medicion = await medicionDe(tx, ind.id, "2026-T1");
    const S4 = await categoriaNueva(tx, sede.id, "S4");
    expect(await actualizarCategorias(admin, medicion, opc(tx, AHORA_T))).toEqual({ agregadas: 1 });
    /** Un mes del dato reportado con su valor por sede. */
    const mes = async (datoId: number, periodo: string, porCategoria: Record<number, string>) => {
      const total = Object.values(porCategoria).reduce((s, v) => s + Number(v), 0);
      const id = await periodoDeDatoDePrueba(tx, { datoId, periodo, valor: String(total), ahora: AHORA_T });
      await tx`UPDATE variable_valores SET por_categoria = ${tx.json(Object.fromEntries(Object.entries(porCategoria)))} WHERE id = ${id}`;
      return id;
    };
    return { ind, mide, admin, sedeId: sede.id, medicion, datoA, datoB, s1, s2, S3, S4, mes };
  }

  /** Los tres meses del dato B (auditados) por sede, sin S4: S3 solo en marzo. Devuelve los ids de los periodos. */
  const mesesDeB = async (p: Awaited<ReturnType<typeof porSede>>) => [
    await p.mes(p.datoB, "2026-01", { [p.s1]: "20", [p.s2]: "40" }),
    await p.mes(p.datoB, "2026-02", { [p.s1]: "20", [p.s2]: "40" }),
    await p.mes(p.datoB, "2026-03", { [p.s1]: "20", [p.s2]: "40", [p.S3]: "10" }),
  ];
  const pendienteDe = async (tx: TransactionSql, medicionId: number) =>
    queFalta(await tx`SELECT ${columnasDePendiente(tx)} FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id WHERE m.id = ${medicionId}`).get(
      medicionId,
    )?.falta;

  it("un mixto reportado cuya fila deja de ser «No aplica» por el dato vuelve a pedir su reporte, y el plazo no lo deja vencido", () =>
    revertida(sql, async (tx) => {
      const p = await porSede(tx, true);
      const A_TIEMPO = new Date("2026-04-05T15:00:00Z");
      const meses = await mesesDeB(p);
      // El «No aplica» del sistema en S4 llega antes de la fecha límite (el 10 de abril).
      await propagar({ sql: tx, ahora: A_TIEMPO, indicadorIds: [p.ind.id] });
      expect((await fila(tx, p.medicion)).categorias.find((c: { id: number }) => c.id === p.S4).noAplica).toBe(MOTIVO_DATO_SIN_CATEGORIA);
      const propias = [
        { categoriaId: p.s1, valores: { A: "30" } },
        { categoriaId: p.s2, valores: { A: "60" } },
        { categoriaId: p.S3, valores: { A: "5" } },
      ];
      expect(await rejilla(tx, p.mide, p.medicion, propias, false, A_TIEMPO)).toMatchObject({ ok: true, faltaDato: false });
      expect((await valoresDe(tx, p.medicion)).total.map((t) => t.valor)).toEqual([95, 190]);

      // Marzo pasa a traer S4: la fila ya no es «No aplica» y le faltan sus celdas propias.
      await tx`UPDATE variable_valores SET categorias = categorias || ${tx.json([{ id: p.S4, nombre: "S4", orden: 4, noAplica: null }])},
          por_categoria = por_categoria || ${tx.json({ [p.S4]: "8" })}
        WHERE id = ${meses[2]}`;
      await propagar({ sql: tx, ahora: AHORA_T, indicadorIds: [p.ind.id] });
      const m = await fila(tx, p.medicion);
      expect(m).toMatchObject({ reportada_en: null, reportada_por: null, estado: "abierta", resultado_exacto: null });
      expect((await valoresDe(tx, p.medicion)).total).toEqual([]);
      expect(await pendienteDe(tx, p.medicion)).toBe("reporte");
      expect(new Date(m.vence_en as string).getTime()).toBeGreaterThan(AHORA_T.getTime());
      const ultimo = (await eventos(tx, p.medicion)).at(-1)!;
      expect(ultimo).toMatchObject({ tipo: "propagacion", usuario_id: null });
      expect(ultimo.detalle.categorias).toContainEqual({ id: p.S4, nombre: "S4", antes: { B: null, noAplica: MOTIVO_DATO_SIN_CATEGORIA }, despues: { B: "8", noAplica: null } });

      // Al reportar la celda que falta, el total vuelve.
      await rejilla(tx, p.mide, p.medicion, [{ categoriaId: p.S4, valores: { A: "4" } }], false, AHORA_T);
      expect((await valoresDe(tx, p.medicion)).total.map((t) => t.valor)).toEqual([99, 198]);
      expect((await fila(tx, p.medicion)).reportada_por).toBe(p.mide.usuarioId);
    }));

  it("un cambio mayor que conserva la dimensión y deja de traer el dato quita el «No aplica» que el sistema puso en una fila", () =>
    revertida(sql, async (tx) => {
      const p = await porSede(tx, true);
      await mesesDeB(p);
      await propagar({ sql: tx, ahora: AHORA_T, indicadorIds: [p.ind.id] });
      expect((await fila(tx, p.medicion)).reportada_en).toBeNull();
      await versionNueva(tx, {
        indicadorId: p.ind.id,
        usuarioId: p.admin.usuarioId,
        tipoCambio: "mayor",
        rigeDesde: "2026-T1",
        aprobadaEn: AHORA_T,
        periodicidad: "trimestral",
        dimensionId: p.sedeId,
      });
      expect(await rehacerCategorias(tx, p.ind.id, "2026-T1", AHORA_T)).toBe(1);
      const lista = (await fila(tx, p.medicion)).categorias as { id: number; noAplica: string | null }[];
      expect(lista.map((c) => c.id)).toEqual([p.s1, p.s2, p.S3, p.S4]);
      expect(lista.every((c) => c.noAplica === null)).toBe(true);
      const ultimo = (await eventos(tx, p.medicion)).at(-1)!;
      expect(ultimo).toMatchObject({ tipo: "categorias", usuario_id: null });
      // Ahora S4 se mide como las demás.
      const todas = [p.s1, p.s2, p.S3, p.S4].map((categoriaId) => ({ categoriaId, valores: { A: "1", B: "2" } }));
      expect(await rejilla(tx, p.mide, p.medicion, todas, false, AHORA_T)).toMatchObject({ ok: true });
      expect(await rehacerCategorias(tx, p.ind.id, "2026-T1", AHORA_T)).toBe(0);
    }));

  it("después de un cambio menor, corregir y propagar un mixto conserva los dos totales", () =>
    revertida(sql, async (tx) => {
      const p = await porSede(tx, true);
      const meses = await mesesDeB(p);
      await propagar({ sql: tx, ahora: AHORA_T, indicadorIds: [p.ind.id] });
      const propias = [
        { categoriaId: p.s1, valores: { A: "30" } },
        { categoriaId: p.s2, valores: { A: "60" } },
        { categoriaId: p.S3, valores: { A: "5" } },
      ];
      await rejilla(tx, p.mide, p.medicion, propias, false, AHORA_T);
      await versionNueva(tx, {
        indicadorId: p.ind.id,
        usuarioId: p.admin.usuarioId,
        tipoCambio: "menor",
        rigeDesde: "2026-T1",
        aprobadaEn: AHORA_T,
        periodicidad: "trimestral",
        dimensionId: p.sedeId,
        variables: { A: { nombre: "Adherentes" }, B: { datoId: p.datoB } },
      });
      // Una acción sobre la medición (como reprogramar su meta) la pasa a la versión que rige, sin reescribir el total.
      await recalcularMedicion(tx, p.medicion, { ahora: AHORA_T, actorId: p.admin.usuarioId, evento: "meta" });
      await tx`UPDATE variable_valores SET por_categoria = por_categoria || ${tx.json({ [p.s1]: "30" })}, valor = valor + 10 WHERE id = ${meses[2]}`;
      await propagar({ sql: tx, ahora: AHORA_T, indicadorIds: [p.ind.id] });
      expect((await valoresDe(tx, p.medicion)).total.map((t) => [t.letra, t.valor])).toEqual([
        ["A", 95],
        ["B", 200],
      ]);
      const repetidas = await tx`SELECT mv.categoria_id, iv.letra FROM medicion_valores mv
        JOIN indicador_variables iv ON iv.id = mv.variable_id WHERE mv.medicion_id = ${p.medicion}
        GROUP BY mv.categoria_id, iv.letra HAVING count(*) > 1`;
      expect(repetidas).toEqual([]);
      expect(Number((await fila(tx, p.medicion)).resultado)).toBeCloseTo(47.5, 6);
    }));

  it("el trimestre suma los meses de cada sede; la creada en marzo se junta solo con marzo; la que no viene queda «No aplica»", () =>
    revertida(sql, async (tx) => {
      const p = await porSede(tx);
      const marzo: number[] = [];
      for (const [datoId, ene, feb, mar] of [
        [p.datoA, { [p.s1]: "10", [p.s2]: "20" }, { [p.s1]: "11", [p.s2]: "21" }, { [p.s1]: "12", [p.s2]: "22", [p.S3]: "5" }],
        [p.datoB, { [p.s1]: "20", [p.s2]: "40" }, { [p.s1]: "20", [p.s2]: "40" }, { [p.s1]: "20", [p.s2]: "40", [p.S3]: "10" }],
      ] as const) {
        await p.mes(datoId, "2026-01", ene);
        await p.mes(datoId, "2026-02", feb);
        marzo.push(await p.mes(datoId, "2026-03", mar));
      }
      const consulta = { datoId: p.datoA, consolidacion: "suma" as const, datoPeriodicidad: "mensual" as const, periodo: "2026-T1" };
      expect(await valorDeDato(tx, { ...consulta, categoriaId: p.S3 })).toMatchObject({ estado: "listo", periodos: [marzo[0]] });
      expect(await valorDeDato(tx, { ...consulta, categoriaId: p.S4 })).toMatchObject({ estado: "sin_categoria" });

      await propagar({ sql: tx, ahora: AHORA_T, indicadorIds: [p.ind.id] });
      const { celdas, total } = await valoresDe(tx, p.medicion);
      expect(celdas.map((c) => [c.categoria, c.letra, c.valor, c.por])).toEqual([
        [p.s1, "A", 33, null],
        [p.s1, "B", 60, null],
        [p.s2, "A", 63, null],
        [p.s2, "B", 120, null],
        [p.S3, "A", 5, null],
        [p.S3, "B", 10, null],
      ]);
      expect(total.map((t) => [t.letra, t.valor, t.por])).toEqual([
        ["A", 101, null],
        ["B", 190, null],
      ]);
      let m = await fila(tx, p.medicion);
      expect((m.categorias as { id: number; noAplica: string | null }[]).find((c) => c.id === p.S4)!.noAplica).toBe(MOTIVO_DATO_SIN_CATEGORIA);
      expect(m.reportada_en).not.toBeNull();
      expect(m.reportada_por).toBeNull();
      expect(Number(m.resultado)).toBeCloseTo((101 / 190) * 100, 6);
      // Otra pasada no escribe nada.
      expect(await propagar({ sql: tx, ahora: AHORA_T, indicadorIds: [p.ind.id] })).toMatchObject({ escritas: 0, noAplica: 0 });

      // Marzo pasa a traer S4 (como lo dejaría actualizar las categorías del periodo del dato): el «No aplica» se va solo.
      for (const [id, valor] of [
        [marzo[0], "7"],
        [marzo[1], "14"],
      ] as const) {
        await tx`UPDATE variable_valores SET categorias = categorias || ${tx.json([{ id: p.S4, nombre: "S4", orden: 4, noAplica: null }])},
            por_categoria = por_categoria || ${tx.json({ [p.S4]: valor })}
          WHERE id = ${id}`;
      }
      await propagar({ sql: tx, ahora: AHORA_T, indicadorIds: [p.ind.id] });
      m = await fila(tx, p.medicion);
      expect((m.categorias as { id: number; noAplica: string | null }[]).find((c) => c.id === p.S4)!.noAplica).toBeNull();
      expect((await valoresDe(tx, p.medicion)).total.map((t) => [t.letra, t.valor])).toEqual([
        ["A", 108],
        ["B", 204],
      ]);
      const ultimo = (await eventos(tx, p.medicion)).at(-1)!;
      expect(ultimo).toMatchObject({ tipo: "propagacion", usuario_id: null });
      expect((ultimo.detalle.categorias as { id: number }[]).map((c) => c.id)).toEqual([p.S4]);
    }));

  it("si ningún mes trae ninguna sede, el sistema deja la medición «No aplica» y lo quita cuando el dato trae alguna", () =>
    revertida(sql, async (tx) => {
      const p = await porSede(tx);
      const meses: number[] = [];
      for (const datoId of [p.datoA, p.datoB]) {
        for (const periodo of ["2026-01", "2026-02", "2026-03"]) meses.push(await p.mes(datoId, periodo, {}));
      }
      await tx`UPDATE variable_valores SET categorias = '[]'::jsonb WHERE id IN ${tx(meses)}`;
      await propagar({ sql: tx, ahora: AHORA_T, indicadorIds: [p.ind.id] });
      let m = await fila(tx, p.medicion);
      expect((m.categorias as { noAplica: string | null }[]).every((c) => c.noAplica === MOTIVO_DATO_SIN_CATEGORIA)).toBe(true);
      expect(m).toMatchObject({ no_aplica: true, no_aplica_motivo: MOTIVO_TODAS_NO_APLICAN, reportada_por: null, estado: "reportada" });
      expect(m.reportada_en).not.toBeNull();

      await tx`UPDATE variable_valores SET categorias = ${tx.json([{ id: p.s1, nombre: "S1", orden: 1, noAplica: null }])},
          por_categoria = ${tx.json({ [p.s1]: "4" })}
        WHERE id IN ${tx(meses)}`;
      await propagar({ sql: tx, ahora: AHORA_T, indicadorIds: [p.ind.id] });
      m = await fila(tx, p.medicion);
      expect(m).toMatchObject({ no_aplica: false, no_aplica_motivo: null });
      expect((m.categorias as { id: number; noAplica: string | null }[]).filter((c) => c.noAplica === null).map((c) => c.id)).toEqual([p.s1]);
      expect(Number(m.resultado)).toBe(100);
    }));

  it("la propagación no pisa el «No aplica» que una persona puso en una fila", () =>
    revertida(sql, async (tx) => {
      const p = await porSede(tx, true);
      const motivo = "La sede no atendió en el trimestre";
      const lomio = await rejilla(
        tx,
        p.mide,
        p.medicion,
        [
          { categoriaId: p.s1, valores: { A: "30" } },
          { categoriaId: p.s2, valores: { A: "60" } },
          { categoriaId: p.S3, valores: { A: "5" } },
          { categoriaId: p.S4, valores: {}, noAplica: motivo },
        ],
        false,
        AHORA_T,
      );
      expect(lomio).toMatchObject({ ok: true, faltaDato: true });
      expect((await valoresDe(tx, p.medicion)).total).toEqual([]);
      // Quien mide ya entregó lo suyo: la medición espera el dato, no su reporte (anexo §3.1).
      const pendiente = await tx`SELECT ${columnasDePendiente(tx)} FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id WHERE m.id = ${p.medicion}`;
      expect(queFalta(pendiente).get(p.medicion)?.falta).toBe("dato");
      await p.mes(p.datoB, "2026-01", { [p.s1]: "20", [p.s2]: "40" });
      await p.mes(p.datoB, "2026-02", { [p.s1]: "20", [p.s2]: "40" });
      await p.mes(p.datoB, "2026-03", { [p.s1]: "20", [p.s2]: "40", [p.S3]: "10" });
      await propagar({ sql: tx, ahora: AHORA_T, indicadorIds: [p.ind.id] });
      const m = await fila(tx, p.medicion);
      expect((m.categorias as { id: number; noAplica: string | null }[]).find((c) => c.id === p.S4)!.noAplica).toBe(motivo);
      expect((await valoresDe(tx, p.medicion)).total.map((t) => [t.letra, t.valor, t.por])).toEqual([
        ["A", 95, null],
        ["B", 190, null],
      ]);
      expect(m.reportada_por).toBe(p.mide.usuarioId);
      expect(Number(m.resultado)).toBe(50);
    }));
});

describe("el aviso de una categoría en Crítico (anexo §5.6, F14C-DC39)", () => {
  const avisos = async (tx: TransactionSql, medicionId: number) =>
    (
      await tx`SELECT usuario_id, tipo, titulo FROM notificaciones
        WHERE entidad = 'medicion' AND entidad_id = ${medicionId} AND tipo IN ('indicadores.alerta', 'indicadores.correccion') ORDER BY id`
    ).map((n) => ({ usuarioId: Number(n.usuario_id), tipo: n.tipo as string, titulo: n.titulo as string }));
  const quienes = (lista: { usuarioId: number }[]) => [...new Set(lista.map((a) => a.usuarioId))].sort((a, b) => a - b);

  it("total en Bien con una sede en Crítico avisa a quien analiza y a quien hace seguimiento; una corrección que la saca avisa «Corrección»", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const nombre = `Indicador de prueba ${e.ind.codigo}`;
      const ids = e.sede.categorias;
      await rejilla(tx, e.mide, e.octubre, maqueta(ids));
      let lista = await avisos(tx, e.octubre);
      expect(quienes(lista)).toEqual([e.analiza.usuarioId, e.sigue.usuarioId].sort((a, b) => a - b));
      expect(lista.map((a) => a.usuarioId)).not.toContain(e.lider.usuarioId);
      for (const admin of await adminsActivos({ sql: tx })) expect(lista.map((a) => a.usuarioId)).not.toContain(admin);
      expect(lista.every((a) => a.tipo === "indicadores.alerta" && a.titulo === `${nombre}: 85,9 %, Bien. En Crítico: Puesto de salud 3 (55 %). Octubre de 2026`)).toBe(true);
      // No exige análisis ni pone «Requiere acción de mejora».
      expect(await fila(tx, e.octubre)).toMatchObject({ estado: "reportada", requiere_accion: false, alerta_estado: "bien_con_critico" });

      await rejilla(tx, e.mide, e.octubre, [{ categoriaId: ids[3], valores: { A: "18" } }]);
      lista = (await avisos(tx, e.octubre)).filter((a) => a.tipo === "indicadores.correccion");
      expect(quienes(lista)).toEqual([e.analiza.usuarioId, e.sigue.usuarioId].sort((a, b) => a - b));
      expect(lista[0].titulo).toBe(`Corrección: ${nombre} pasó de Bien con 1 categoría en Crítico a Bien. Octubre de 2026`);
      expect(await fila(tx, e.octubre)).toMatchObject({ categorias_en_critico: 0, alerta_estado: null });
    }));

  it("total en Bien sin sedes en Crítico no avisa a nadie; en Atención, la alerta de siempre nombra la sede", () =>
    revertida(sql, async (tx) => {
      const e = await entorno(tx);
      const nombre = `Indicador de prueba ${e.ind.codigo}`;
      const ids = e.sede.categorias;
      const bien = maqueta(ids).map((f, i) => (i === 3 ? { ...f, valores: { A: "18", B: "20" } } : f));
      await rejilla(tx, e.mide, e.octubre, bien);
      expect(await avisos(tx, e.octubre)).toEqual([]);

      const septiembre = await medicionDe(tx, e.ind.id, "2026-09");
      const atencion = maqueta(ids).map((f, i) => (i === 0 ? { ...f, valores: { A: "150", B: "200" } } : f));
      await rejilla(tx, e.mide, septiembre, atencion);
      const lista = await avisos(tx, septiembre);
      expect(lista[0].titulo).toBe(`${nombre}: 75,9 % frente a una meta de 85 %, Atención. En Crítico: Puesto de salud 3 (55 %). Septiembre de 2026`);
    }));
});

describe("el historial de un desagregado", () => {
  const evento = (id: number, tipo: TipoEvento, detalle: Record<string, unknown>, quien: string | null = "Ana") => ({
    id,
    tipo,
    quien,
    creadoEn: new Date("2026-11-03T15:00:00Z"),
    detalle,
  });
  const historial = (...eventos: ReturnType<typeof evento>[]) =>
    historialDeCorreccion([evento(1, "reapertura", { justificacion: "Se revisa la auditoría" }), ...eventos], {
      unidad: { sufijo: " %", decimales: 1 },
      nombres: { A: "Con manejo adherente", B: "Auditados" },
      conSoportes: false,
    }).slice(1);

  it("«Actualizar categorías» dice cuántas añadió y cuáles; rehacer la lista lo dice el sistema", () => {
    const [una, dos, rehecha] = historial(
      evento(2, "categorias", { agregadas: [{ id: 7, nombre: "Puesto de salud 6" }] }),
      evento(3, "categorias", { agregadas: [{ id: 8, nombre: "Puesto 7" }, { id: 9, nombre: "Puesto 8" }] }),
      evento(4, "categorias", { causa: "dimension", antes: ["Norte", "Sur"], despues: ["Urgencias"], valoresQuitados: 2 }, null),
    );
    expect(una.que).toBe("Añadió 1 categoría: Puesto de salud 6");
    expect(dos.que).toBe("Añadió 2 categorías: Puesto 7, Puesto 8");
    expect(rehecha).toMatchObject({ que: "El sistema rehízo las categorías por el cambio de desagregación", quien: "El sistema" });
    expect(rehecha.cambios).toEqual(["Categorías: Norte, Sur → Urgencias"]);
  });

  it("el «No aplica» de fila que quita un cambio mayor sin el dato lo dice el sistema, fila por fila", () => {
    const [limpia] = historial(
      evento(2, "categorias", {
        causa: "sin_dato",
        categorias: [{ id: 4, nombre: "S4", antes: { noAplica: MOTIVO_DATO_SIN_CATEGORIA }, despues: { noAplica: null } }],
      }, null),
    );
    expect(limpia).toMatchObject({ que: "El sistema quitó el «No aplica» de las categorías: la ficha ya no trae el dato", quien: "El sistema" });
    expect(limpia.cambios).toEqual([`S4 · No aplica: «${MOTIVO_DATO_SIN_CATEGORIA}» → No`]);
  });

  it("una corrección nombra cada celda y cada «No aplica» de fila que cambió, aunque el total no cambie", () => {
    const [correccion, propagacion] = historial(
      evento(2, "correccion", {
        categorias: [
          { id: 1, nombre: "Sede principal", antes: { A: "182" }, despues: { A: "183" } },
          { id: 6, nombre: "Puesto de salud 5", antes: { noAplica: null }, despues: { noAplica: OBRAS } },
        ],
        antes: { A: "275", B: "320", noAplica: false },
        despues: { A: "275", B: "320", noAplica: false },
      }),
      evento(3, "propagacion", { fuentes: [], categorias: [{ id: 4, nombre: "S4", antes: { A: null }, despues: { A: "7" } }], antes: {}, despues: {} }, null),
    );
    expect(correccion.cambios).toEqual(["Sede principal · Con manejo adherente: 182 → 183", `Puesto de salud 5 · No aplica: No → «${OBRAS}»`]);
    expect(propagacion.que).toBe("El sistema actualizó los valores por categoría");
    expect(propagacion.cambios).toEqual(["S4 · Con manejo adherente: — → 7"]);
  });
});

describe("el formulario de la rejilla (EsquemaReporte, juntarValoresDeReporte)", () => {
  const leer = (campos: [string, string][]) => {
    const fd = new FormData();
    for (const [k, v] of campos) fd.append(k, v);
    return parsearFormulario(juntarValoresDeReporte(fd), EsquemaReporte, { omitir: ["id", "volver", "periodo"] });
  };

  it("cada celda en `c_<categoría>_<letra>` (vacía es vaciarla); `na_<categoría>` «1» con su motivo marca, «0» quita", () => {
    expect(
      leer([
        ["id", "7"],
        ["c_12_A", "182"],
        ["c_12_B", ""],
        ["c_13_A", "43"],
        ["na_14", "1"],
        ["motivo_14", OBRAS],
        ["na_15", "0"],
        ["motivo_15", "lo que quedó escrito"],
        ["intencion", "parcial"],
      ]),
    ).toEqual({
      valores: {},
      filas: [
        { categoriaId: 12, valores: { A: "182", B: "" } },
        { categoriaId: 13, valores: { A: "43" } },
        { categoriaId: 14, valores: {}, noAplica: OBRAS },
        { categoriaId: 15, valores: {}, noAplica: null },
      ],
      intencion: "parcial",
      confirmado: false,
    });
    // Sin celdas, el formulario de siempre.
    expect(leer([["valor_A", "5"], ["intencion", "reportar"]])).toEqual({ valores: { A: "5" }, intencion: "reportar", confirmado: false });
  });

  it("una categoría que no es un id o una letra que no es una letra no pasan", () => {
    expect(() => leer([["c_norte_A", "1"], ["intencion", "reportar"]])).toThrow("Los valores no tienen un formato válido");
    expect(() => leer([["c_12_AB", "1"], ["intencion", "reportar"]])).toThrow("Los valores no tienen un formato válido");
    expect(() => leer([["na_12", "si"], ["intencion", "reportar"]])).toThrow("Los valores no tienen un formato válido");
  });
});
