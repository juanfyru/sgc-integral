/**
 * Desde cuándo un indicador exige soporte (anexo del complemento de la 14C, §4.1 a §4.3 y §4.5): la fecha que escriben los
 * cinco sitios que cambian «soporte obligatorio», el `CHECK` que la ata a él, el relleno de la migración 0017 (la fecha de
 * los indicadores que ya lo exigen y la marca de sus mediciones en curso) y la marca de cada medición (`debe_soporte`), que
 * se decide al nacer o al activarse y que respetan todo recálculo y el rechazo de un reporte sin soporte. Contra la BD de
 * desarrollo, dentro de una transacción que se revierte.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { CONFIG_DOCUMENTAL_DEFECTO } from "@/db/consultas/config-documental";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { analizar } from "@/db/consultas/indicadores/analisis";
import { aprobarFichas, enviarAAprobacion, operacionDeIndicador } from "@/db/consultas/indicadores/aprobacion";
import { abrirCambio, crearIndicador, fichaParaEditar, guardarBorrador } from "@/db/consultas/indicadores/fichas";
import { medicionParaReportar, tablaDelAnio } from "@/db/consultas/indicadores/lectura";
import { listarIndicadores } from "@/db/consultas/indicadores/lista";
import { asegurarMediciones, marcarNoAplica, quitarNoAplica, reportar } from "@/db/consultas/indicadores/mediciones";
import { cambiarOperacion, duplicar } from "@/db/consultas/indicadores/operacion";
import { reabrirEnCascada } from "@/db/consultas/indicadores/reapertura";
import { tareasDeIndicadores } from "@/db/consultas/indicadores/tareas";
import { revisarVencimientosDeIndicadores } from "@/db/consultas/indicadores/vencimientos";
import type { DatosFicha } from "@/lib/esquemas/indicadores";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { estadoEnTexto } from "@/lib/indicadores/ficha-en-texto";
import { fechaLimiteDeReporte } from "@/lib/indicadores/periodos";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import type { Tarea } from "@/lib/tareas";
import { fechaLimite } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { indicadorDePrueba, silenciarIndicadores, type IndicadorDePrueba } from "./utiles/indicadores";
import {
  activarSoporte,
  AHORA,
  APROBADA,
  desactivarSoporte,
  falta,
  fila,
  medicionDe,
  mixto,
  procesoNuevo,
  propagarA,
  reportarElDato,
  reportarLoMio,
} from "./utiles/mixto";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { firmaDePrueba } from "./utiles/vigencia";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

let consecutivo = 0;
const unico = () => `${Date.now() % 100_000_000}${(consecutivo += 1)}`;
const CLAVE = { clave: "ok" };
const dia = (texto: string) => new Date(`${texto}T15:00:00Z`);

const MIGRACION_0017 = "0017_fase14c-soporte-desde.sql";
const MARCA_DEL_RELLENO = "-- relleno 0017";

/** Las sentencias de la migración, tal como las corre el migrador. */
function sentenciasDeLaMigracion(): string[] {
  const texto = readFileSync(path.resolve(import.meta.dirname, "../drizzle", MIGRACION_0017), "utf8");
  return texto.split("--> statement-breakpoint").map((s) => s.trim());
}

const fallaCon = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { code?: string }) => e.code ?? "sin-codigo",
  );

const desdeDe = async (tx: TransactionSql, indicadorId: number) =>
  ((await tx`SELECT soporte_obligatorio, soporte_obligatorio_desde FROM indicadores WHERE id = ${indicadorId}`)[0]) as {
    soporte_obligatorio: boolean;
    soporte_obligatorio_desde: Date | null;
  };

type Base = { admin: SesionFlujo; gerente: SesionFlujo; procesoId: number; tipoId: number; estrategico: number; operativo: number; porcentaje: number; cargoId: number };

/** El proceso SGC, los maestros sembrados, un cargo propio, un Administrador del SGC y una persona de Gerencia. */
async function base(tx: TransactionSql): Promise<Base> {
  const [p] = await tx`SELECT id FROM procesos WHERE sigla = 'SGC'`;
  const [t] = await tx`SELECT id FROM tipos_indicador WHERE nombre = 'Eficacia'`;
  const [es] = await tx`SELECT id FROM clasificaciones_indicador WHERE nombre = 'Estratégico'`;
  const [op] = await tx`SELECT id FROM clasificaciones_indicador WHERE nombre = 'Operativo'`;
  const [u] = await tx`SELECT id FROM unidades_indicador WHERE nombre = 'Porcentaje'`;
  const [area] = await tx`SELECT id FROM areas ORDER BY id LIMIT 1`;
  const [c] = await tx`INSERT INTO cargos (nombre, area_id) VALUES (${`ZZ Cargo ${unico()}`}, ${area.id}) RETURNING id`;
  return {
    admin: await sesionAdmin(tx),
    gerente: await usuarioDePrueba(tx, { rol: "gerencia" }),
    procesoId: Number(p.id),
    tipoId: Number(t.id),
    estrategico: Number(es.id),
    operativo: Number(op.id),
    porcentaje: Number(u.id),
    cargoId: Number(c.id),
  };
}

const RANGOS_90 = JSON.stringify({ bien: [{ signo: ">=", valor: "90" }], atencion: [{ signo: ">=", valor: "63" }], critico: [{ signo: "<", valor: "63" }] });

/** Una ficha mensual de forma «porcentaje» del proceso SGC, sin soporte obligatorio. */
const datos = (b: Base, parcial: Partial<DatosFicha> = {}): DatosFicha => ({
  procesoId: b.procesoId,
  nombre: "Cumplimiento del plan de capacitación",
  proposito: "Saber si se ejecutan las capacitaciones programadas",
  tipoId: b.tipoId,
  clasificacionId: b.operativo,
  forma: "porcentaje",
  variables: [
    { letra: "A", nombre: "Capacitaciones ejecutadas", consolidacion: "suma", admiteNegativos: false },
    { letra: "B", nombre: "Capacitaciones programadas", consolidacion: "suma", admiteNegativos: false },
  ],
  unidadId: b.porcentaje,
  decimales: 1,
  periodicidad: "mensual",
  tendencia: "ascendente",
  meta: "90",
  semaforoModo: "rangos",
  rangos: RANGOS_90,
  cargosMedir: [b.cargoId],
  cargosAnalizar: [b.cargoId],
  normaIds: [],
  plazoReporteDias: 10,
  inicioMedicion: "2026-01",
  soporteObligatorio: false,
  nivelAcceso: "general",
  mide: [],
  analiza: [],
  prueba: { valores: { A: "9", B: "10" } },
  ...parcial,
});

const operacion = (indicadorId: number, parcial: { plazoReporteDias?: number; soporteObligatorio: boolean }) => ({
  indicadorId,
  plazoReporteDias: parcial.plazoReporteDias ?? 10,
  inicioMedicion: "2026-01",
  soporteObligatorio: parcial.soporteObligatorio,
  nivelAcceso: "general" as const,
});

describe("los escritores de la fecha", () => {
  it("«Datos de operación»: activarlo pone la hora, cambiar solo el plazo no la mueve y desactivarlo la borra", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      expect(await desdeDe(tx, ind.id)).toEqual({ soporte_obligatorio: false, soporte_obligatorio_desde: null });

      await cambiarOperacion(b.admin, operacion(ind.id, { soporteObligatorio: true }), { sql: tx, ahora: dia("2026-10-05") });
      expect(await desdeDe(tx, ind.id)).toEqual({ soporte_obligatorio: true, soporte_obligatorio_desde: dia("2026-10-05") });

      await cambiarOperacion(b.admin, operacion(ind.id, { plazoReporteDias: 15, soporteObligatorio: true }), { sql: tx, ahora: dia("2026-10-20") });
      expect(await desdeDe(tx, ind.id)).toEqual({ soporte_obligatorio: true, soporte_obligatorio_desde: dia("2026-10-05") });

      await cambiarOperacion(b.admin, operacion(ind.id, { plazoReporteDias: 15, soporteObligatorio: false }), { sql: tx, ahora: dia("2026-10-25") });
      expect(await desdeDe(tx, ind.id)).toEqual({ soporte_obligatorio: false, soporte_obligatorio_desde: null });

      // Volver a activarlo pone la fecha nueva: no se guardan los intervalos anteriores.
      await cambiarOperacion(b.admin, operacion(ind.id, { plazoReporteDias: 15, soporteObligatorio: true }), { sql: tx, ahora: dia("2026-11-02") });
      expect(await desdeDe(tx, ind.id)).toEqual({ soporte_obligatorio: true, soporte_obligatorio_desde: dia("2026-11-02") });
    }));

  it("crear un indicador que lo exige pone la hora de la creación; uno que no, la deja nula", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const con = await crearIndicador(b.admin, datos(b, { soporteObligatorio: true }), { sql: tx, ahora: dia("2026-09-14") });
      expect(await desdeDe(tx, con.indicadorId)).toEqual({ soporte_obligatorio: true, soporte_obligatorio_desde: dia("2026-09-14") });
      const sin = await crearIndicador(b.admin, datos(b), { sql: tx, ahora: dia("2026-09-14") });
      expect(await desdeDe(tx, sin.indicadorId)).toEqual({ soporte_obligatorio: false, soporte_obligatorio_desde: null });
    }));

  it("un borrador que lo activa pone la hora; guardarlo otra vez sin cambiarlo no la mueve, y desactivarlo la borra", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const c = await crearIndicador(b.admin, datos(b), { sql: tx, ahora: dia("2026-09-01") });
      expect((await desdeDe(tx, c.indicadorId)).soporte_obligatorio_desde).toBeNull();

      await guardarBorrador(b.admin, c.versionId, datos(b, { soporteObligatorio: true }), { sql: tx, ahora: dia("2026-09-10") });
      expect(await desdeDe(tx, c.indicadorId)).toEqual({ soporte_obligatorio: true, soporte_obligatorio_desde: dia("2026-09-10") });

      await guardarBorrador(b.admin, c.versionId, datos(b, { soporteObligatorio: true, plazoReporteDias: 15, nombre: "Plan de capacitación" }), {
        sql: tx,
        ahora: dia("2026-09-20"),
      });
      expect(await desdeDe(tx, c.indicadorId)).toEqual({ soporte_obligatorio: true, soporte_obligatorio_desde: dia("2026-09-10") });

      await guardarBorrador(b.admin, c.versionId, datos(b, { plazoReporteDias: 15 }), { sql: tx, ahora: dia("2026-09-25") });
      expect(await desdeDe(tx, c.indicadorId)).toEqual({ soporte_obligatorio: false, soporte_obligatorio_desde: null });
    }));

  it("guardar sin cambiar el soporte no reescribe la fecha: conserva los microsegundos de una que puso el relleno", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      // `now()` y `auditoria.creado_en` guardan microsegundos; un `Date` de JavaScript solo milisegundos. La fecha va como texto
      // y se convierte en SQL: un parámetro `timestamptz` pasaría por un `Date` y perdería los microsegundos.
      const FECHA = "2026-10-12 15:00:00.123456+00";
      const igual = async (indicadorId: number) =>
        (await tx`SELECT soporte_obligatorio_desde = ${FECHA}::text::timestamptz AS igual FROM indicadores WHERE id = ${indicadorId}`)[0].igual;

      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId, soporteObligatorio: true });
      await tx`UPDATE indicadores SET soporte_obligatorio_desde = ${FECHA}::text::timestamptz WHERE id = ${ind.id}`;
      expect(await igual(ind.id)).toBe(true);
      await cambiarOperacion(b.admin, operacion(ind.id, { plazoReporteDias: 15, soporteObligatorio: true }), { sql: tx, ahora: dia("2026-11-01") });
      expect(await igual(ind.id)).toBe(true);

      const c = await crearIndicador(b.admin, datos(b, { soporteObligatorio: true }), { sql: tx, ahora: dia("2026-09-01") });
      await tx`UPDATE indicadores SET soporte_obligatorio_desde = ${FECHA}::text::timestamptz WHERE id = ${c.indicadorId}`;
      await guardarBorrador(b.admin, c.versionId, datos(b, { soporteObligatorio: true, plazoReporteDias: 15 }), { sql: tx, ahora: dia("2026-11-01") });
      expect(await igual(c.indicadorId)).toBe(true);
    }));

  it("duplicar uno que lo exige pone la hora de la duplicación, no la del original", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const origen = await crearIndicador(b.admin, datos(b, { soporteObligatorio: true }), { sql: tx, ahora: dia("2026-03-01") });
      const copia = await duplicar(b.admin, { indicadorId: origen.indicadorId, procesoId: b.procesoId }, { sql: tx, ahora: dia("2026-10-12") });
      const [nuevo] = await tx`SELECT id FROM indicadores WHERE codigo = ${copia.codigo}`;
      expect(await desdeDe(tx, Number(nuevo.id))).toEqual({ soporte_obligatorio: true, soporte_obligatorio_desde: dia("2026-10-12") });

      const sinSoporte = await crearIndicador(b.admin, datos(b), { sql: tx, ahora: dia("2026-03-01") });
      const otra = await duplicar(b.admin, { indicadorId: sinSoporte.indicadorId, procesoId: b.procesoId }, { sql: tx, ahora: dia("2026-10-12") });
      const [otro] = await tx`SELECT id FROM indicadores WHERE codigo = ${otra.codigo}`;
      expect(await desdeDe(tx, Number(otro.id))).toEqual({ soporte_obligatorio: false, soporte_obligatorio_desde: null });
    }));

  it("aprobar una versión que nadie mide (sin variables propias) apaga el soporte y borra la fecha", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const firmar = { sql: tx, ahora: dia("2026-11-10"), verificar: firmaDePrueba };
      const medidor = await usuarioDePrueba(tx, { rol: "consulta" });
      const uno = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const otro = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const ind: IndicadorDePrueba = await indicadorDePrueba(tx, {
        procesoId: b.procesoId,
        clasificacion: "Estratégico",
        soporteObligatorio: true,
        mide: [medidor.usuarioId],
      });
      expect((await desdeDe(tx, ind.id)).soporte_obligatorio_desde).not.toBeNull();

      const { versionId } = await abrirCambio(b.admin, ind.id, { sql: tx });
      const editable = (await fichaParaEditar(b.admin, ind.codigo, { sql: tx }))!.valores as DatosFicha;
      const tomada = (letra: string, indicadorOrigenId: number) => ({
        letra,
        nombre: `Tomada ${letra}`,
        consolidacion: "suma" as const,
        admiteNegativos: false,
        origen: "indicador" as const,
        indicadorOrigenId,
        toma: "valor" as const,
      });
      await guardarBorrador(
        b.admin,
        versionId,
        {
          ...editable,
          variables: [tomada("A", uno.id), tomada("B", otro.id)],
          cargosMedir: [],
          cargosAnalizar: [b.cargoId],
          semaforoModo: "rangos",
          rangos: RANGOS_90,
          umbralAtencionPct: undefined,
          prueba: undefined,
        },
        { sql: tx },
      );
      await enviarAAprobacion(b.admin, { versionId, motivo: "Ajustar la ficha", credenciales: CLAVE }, firmar);
      await aprobarFichas(b.gerente, { versionIds: [versionId], credenciales: CLAVE }, firmar);

      expect(await desdeDe(tx, ind.id)).toEqual({ soporte_obligatorio: false, soporte_obligatorio_desde: null });
    }));
});

describe("el CHECK de la fecha", () => {
  it("exigir soporte sin fecha, o tener fecha sin exigirlo, viola indicadores_soporte_desde (23514)", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const actualizar = (soporte: boolean, desde: Date | null) =>
        tx.savepoint((s) => s`UPDATE indicadores SET soporte_obligatorio = ${soporte}, soporte_obligatorio_desde = ${desde} WHERE id = ${ind.id}`);
      expect(await fallaCon(actualizar(true, null))).toBe("23514");
      expect(await fallaCon(actualizar(false, dia("2026-10-12")))).toBe("23514");
      expect(await fallaCon(actualizar(true, dia("2026-10-12")))).toBeNull();
      expect(await fallaCon(actualizar(false, null))).toBeNull();
      const [nombre] = await tx`SELECT conname FROM pg_constraint WHERE conname = 'indicadores_soporte_desde'`;
      expect(nombre?.conname).toBe("indicadores_soporte_desde");
    }));

  it("una medición nace sin marca", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const id = await medicion(tx, ind, "2026-09", { venceEn: dia("2026-10-10") });
      const [m] = await tx`SELECT debe_soporte FROM mediciones WHERE id = ${id}`;
      expect(m.debe_soporte).toBe(false);
    }));
});

/** Una medición por SQL, en el estado pedido y con la fecha límite dada. */
async function medicion(
  tx: TransactionSql,
  ind: IndicadorDePrueba,
  periodo: string,
  o: { venceEn: Date; estado?: "abierta" | "reportada" | "cerrada"; historica?: boolean },
): Promise<number> {
  const p = periodoDe(periodo, zonaHoraria())!;
  const [m] = await tx`INSERT INTO mediciones (indicador_id, version_id, periodo, desde, hasta, vence_en, estado, historica)
    VALUES (${ind.id}, ${ind.versionId}, ${periodo}, ${p.desde}, ${p.hasta}, ${o.venceEn}, ${o.estado ?? "abierta"}, ${o.historica ?? false})
    RETURNING id`;
  return Number(m.id);
}

const evento = (tx: TransactionSql, medicionId: number, tipo: string, usuarioId: number | null, creadoEn: Date, detalle: object = {}) =>
  tx`INSERT INTO medicion_eventos (medicion_id, tipo, usuario_id, detalle, creado_en)
    VALUES (${medicionId}, ${tipo}, ${usuarioId}, ${tx.json(detalle as never)}, ${creadoEn})`;

const bitacora = (tx: TransactionSql, indicadorId: number, accion: string, detalle: object, creadoEn: Date, usuarioId: number) =>
  tx`INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle, creado_en)
    VALUES (${usuarioId}, ${accion}, 'indicador', ${indicadorId}, ${tx.json(detalle as never)}, ${creadoEn})`;

const OPERACION = { plazoReporteDias: 10, inicioMedicion: "2026-01", nivelAcceso: "general" };
const conSoporte = (v: boolean) => ({ ...OPERACION, soporteObligatorio: v });

describe("el relleno de la migración 0017", () => {
  it("la migración trae los dos UPDATE marcados y el CHECK va después del relleno de la fecha", () => {
    const sentencias = sentenciasDeLaMigracion();
    const rellenos = sentencias.flatMap((s, i) => (s.startsWith(MARCA_DEL_RELLENO) ? [i] : []));
    expect(rellenos).toHaveLength(2);
    for (const i of rellenos) expect(sentencias[i].slice(MARCA_DEL_RELLENO.length).trim()).toMatch(/^UPDATE /);
    const check = sentencias.findIndex((s) => s.includes('ADD CONSTRAINT "indicadores_soporte_desde"'));
    expect(check).toBeGreaterThan(rellenos[0]);
  });

  it("pone la fecha de la bitácora o la de la creación y marca las mediciones en curso con la regla del anexo §4.3", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const quien = b.admin.usuarioId;
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });

      // A: lo exige desde la última activación de la bitácora, el 12 de octubre. Antes lo exigió al crearse, lo dejó de
      // exigir el 1 de octubre, y el 1 de noviembre solo cambió el plazo (sí a sí: no cuenta).
      const a = await indicadorDePrueba(tx, { procesoId: b.procesoId, soporteObligatorio: true });
      await bitacora(tx, a.id, "indicador_creado", { codigo: a.codigo, operacion: conSoporte(true) }, dia("2026-09-01"), quien);
      await bitacora(tx, a.id, "indicador_operacion", { codigo: a.codigo, antes: conSoporte(true), despues: conSoporte(false) }, dia("2026-10-01"), quien);
      await bitacora(tx, a.id, "indicador_operacion", { codigo: a.codigo, antes: conSoporte(false), despues: conSoporte(true) }, dia("2026-10-12"), quien);
      await bitacora(
        tx,
        a.id,
        "indicador_operacion",
        { codigo: a.codigo, antes: conSoporte(true), despues: { ...conSoporte(true), plazoReporteDias: 15 } },
        dia("2026-11-01"),
        quien,
      );
      // B: lo exige y la bitácora no lo dice: vale la creación, el 1 de marzo.
      const bb = await indicadorDePrueba(tx, { procesoId: b.procesoId, soporteObligatorio: true });
      await tx`UPDATE indicadores SET creado_en = ${dia("2026-03-01")} WHERE id = ${bb.id}`;
      // C: lo activó en un borrador el 15 de julio.
      const c = await indicadorDePrueba(tx, { procesoId: b.procesoId, soporteObligatorio: true });
      await bitacora(
        tx,
        c.id,
        "indicador_borrador_guardado",
        { codigo: c.codigo, operacion: { antes: conSoporte(false), despues: conSoporte(true) } },
        dia("2026-07-15"),
        quien,
      );
      // D: la bitácora dice que lo activó, pero hoy no lo exige: sigue sin fecha.
      const d = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      await bitacora(tx, d.id, "indicador_operacion", { codigo: d.codigo, antes: conSoporte(false), despues: conSoporte(true) }, dia("2026-10-12"), quien);

      // Las mediciones de A (fecha: 12 de octubre).
      const reportadaVencida = await medicion(tx, a, "2026-09", { estado: "reportada", venceEn: dia("2026-10-10") });
      await evento(tx, reportadaVencida, "reporte", mide.usuarioId, dia("2026-10-03"));
      const sinReportar = await medicion(tx, a, "2026-10", { venceEn: dia("2026-11-10") });
      const sinReportarVencida = await medicion(tx, a, "2026-07", { venceEn: dia("2026-08-10") });
      const reportadaEnPlazo = await medicion(tx, a, "2026-06", { estado: "reportada", venceEn: dia("2026-10-15") });
      await evento(tx, reportadaEnPlazo, "reporte", mide.usuarioId, dia("2026-10-03"));
      // Su fecha límite se movió al 20 por el análisis, pero la de su reporte era el 10 (`venceAntes`): no la debe.
      const conVenceAntes = await medicion(tx, a, "2026-05", { estado: "abierta", venceEn: dia("2026-10-20") });
      await evento(tx, conVenceAntes, "reporte", mide.usuarioId, dia("2026-10-03"));
      await evento(tx, conVenceAntes, "propagacion", null, dia("2026-10-06"), { venceEn: dia("2026-10-20").toISOString(), venceAntes: dia("2026-10-10").toISOString() });
      // Reportada tarde (el 11, con fecha límite el 10), pero antes de la fecha: tampoco la debe.
      const reportadaTarde = await medicion(tx, a, "2026-04", { estado: "reportada", venceEn: dia("2026-10-10") });
      await evento(tx, reportadaTarde, "reporte", mide.usuarioId, dia("2026-10-11"));
      // «No aplica» de quien mide cuenta como su reporte.
      const noAplica = await medicion(tx, a, "2026-03", { estado: "reportada", venceEn: dia("2026-10-10") });
      await evento(tx, noAplica, "no_aplica", mide.usuarioId, dia("2026-10-03"));
      // Lo que hizo el sistema no es un reporte de quien mide.
      const soloSistema = await medicion(tx, a, "2026-02", { estado: "abierta", venceEn: dia("2026-10-10") });
      await evento(tx, soloSistema, "reporte", null, dia("2026-10-03"));
      // Una cerrada sin reportar no se marca (ni choca con el trigger de las cerradas), y una histórica tampoco.
      const cerrada = await medicion(tx, a, "2026-08", { estado: "cerrada", venceEn: dia("2026-09-10") });
      const historica = await medicion(tx, a, "2025-12", { historica: true, venceEn: dia("2026-01-10") });
      // De B (fecha: 1 de marzo): reportada el 3 de octubre, después de la fecha.
      const deB = await medicion(tx, bb, "2026-09", { estado: "reportada", venceEn: dia("2026-10-10") });
      await evento(tx, deB, "reporte", mide.usuarioId, dia("2026-10-03"));
      // De D, que no lo exige: sin marca.
      const deD = await medicion(tx, d, "2026-10", { venceEn: dia("2026-11-10") });

      const rellenos = sentenciasDeLaMigracion().filter((s) => s.startsWith(MARCA_DEL_RELLENO));
      expect(rellenos).toHaveLength(2);
      for (const s of rellenos) await tx.unsafe(s);

      expect(await desdeDe(tx, a.id)).toEqual({ soporte_obligatorio: true, soporte_obligatorio_desde: dia("2026-10-12") });
      expect(await desdeDe(tx, bb.id)).toEqual({ soporte_obligatorio: true, soporte_obligatorio_desde: dia("2026-03-01") });
      expect(await desdeDe(tx, c.id)).toEqual({ soporte_obligatorio: true, soporte_obligatorio_desde: dia("2026-07-15") });
      expect(await desdeDe(tx, d.id)).toEqual({ soporte_obligatorio: false, soporte_obligatorio_desde: null });

      const ids = { reportadaVencida, sinReportar, sinReportarVencida, reportadaEnPlazo, conVenceAntes, reportadaTarde, noAplica, soloSistema, cerrada, historica, deB, deD };
      const filas = await tx`SELECT id, debe_soporte, estado FROM mediciones WHERE id IN ${tx(Object.values(ids))}`;
      const marca = Object.fromEntries(Object.entries(ids).map(([nombre, id]) => [nombre, filas.find((f) => Number(f.id) === id)!.debe_soporte]));
      expect(marca).toEqual({
        reportadaVencida: false,
        sinReportar: true,
        sinReportarVencida: true,
        reportadaEnPlazo: true,
        conVenceAntes: false,
        reportadaTarde: false,
        noAplica: false,
        soloSistema: true,
        cerrada: false,
        historica: false,
        deB: true,
        deD: false,
      });
      expect(filas.find((f) => Number(f.id) === cerrada)!.estado).toBe("cerrada");
    }));
});

async function rechaza(promesa: Promise<unknown>, mensaje: string) {
  const err = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ErrorIndicador);
  expect((err as Error).message).toBe(mensaje);
}

/** Un soporte de la medición, como lo deja la subida: una fila de `archivos` con contexto `medicion`. */
const adjuntarSoporte = (tx: TransactionSql, medicionId: number) =>
  tx`INSERT INTO archivos (rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256, contexto, contexto_id)
    VALUES ('evidencia', ${`zz/${unico()}.pdf`}, 'soporte.pdf', 'pdf', 'application/pdf', 10, ${"a".repeat(64)}, 'medicion', ${medicionId})`;

const idsDeTareas = (r: { tareas: Tarea[] }) => r.tareas.map((t) => t.id);

const marcaDe = async (tx: TransactionSql, medicionId: number) => (await fila(tx, medicionId)).debe_soporte as boolean;
const estadoYMarca = async (tx: TransactionSql, medicionId: number) => {
  const m = await fila(tx, medicionId);
  return [m.estado as string, m.debe_soporte as boolean];
};

/** Lo propio de septiembre en el mixto: con B en 1.284.300.000 es el 3 % (crítico); con 40.000.000, el 96 % (cumple). */
const LO_MIO = { A: "38529000" };
const CRITICO = "1284300000";
const CUMPLE = "40000000";

/**
 * La marca de cada medición (anexo del complemento, §4.2) en los casos de §4.5, sobre el mixto de `utiles/mixto.ts`:
 * septiembre vence el 10 de octubre y quien mide reportó lo suyo el 5 (`AHORA`), sin soporte. La marca se decide al
 * activarse el soporte o al nacer la medición, y la respetan todo recálculo (de una persona, la propagación, el cambio del
 * soporte o la reapertura) y el rechazo de un reporte sin soporte.
 */
describe("la marca de cada medición", () => {
  const ZONA = zonaHoraria();
  const EXIGE = "Este indicador exige un soporte: adjúntelo antes de reportar";
  const ANALISIS = "La glosa bajó por la revisión previa de las cuentas.";
  const CAUSA = "Las cuentas de urgencias se glosaron completas";
  const ACCION = "Revisar las cuentas de urgencias antes de radicarlas";

  it("caso 1: activado el 12, con el plazo vencido; el dato llega el 20 y no cumple: pide el análisis con plazo nuevo y no el soporte", () =>
    revertida(sql, async (tx) => {
      const x = await mixto(tx);
      await reportarLoMio(tx, x.mide, x.medicion, LO_MIO);
      await activarSoporte(tx, x.ind.id, dia("2026-10-12"));
      await reportarElDato(tx, x.responsable, x.datoId, "2026-09", CRITICO, dia("2026-10-20"));
      await propagarA(tx, dia("2026-10-20"), [x.ind.id]);
      const m = await fila(tx, x.medicion);
      expect([m.semaforo, m.estado, m.debe_soporte]).toEqual(["critico", "abierta", false]);
      expect(m.vence_en).toEqual(fechaLimite(dia("2026-10-20"), 10, ZONA));
      expect(await falta(tx, x.medicion)).toBe("analisis");
      // Pide el análisis y no el soporte: quien analiza tiene su tarea y quien mide, ninguna.
      const del20 = { sql: tx, ahora: dia("2026-10-20") };
      expect(idsDeTareas(await tareasDeIndicadores(x.mide, del20))).not.toContain(`medir:${x.medicion}`);
      expect(idsDeTareas(await tareasDeIndicadores(x.analiza, del20))).toContain(`analizar:${x.medicion}`);

      // Con el análisis que pide queda reportada: el soporte no se le debe.
      await analizar(x.analiza, { medicionId: x.medicion, causa: CAUSA, accionPropuesta: ACCION }, { sql: tx, ahora: dia("2026-10-21") });
      expect(await estadoYMarca(tx, x.medicion)).toEqual(["reportada", false]);
    }));

  it("caso 2: activado el 12; el dato llega el 20 y cumple: queda reportada, y un análisis opcional el 21 no la reabre", () =>
    revertida(sql, async (tx) => {
      const x = await mixto(tx);
      await reportarLoMio(tx, x.mide, x.medicion, LO_MIO);
      await activarSoporte(tx, x.ind.id, dia("2026-10-12"));
      await reportarElDato(tx, x.responsable, x.datoId, "2026-09", CUMPLE, dia("2026-10-20"));
      await propagarA(tx, dia("2026-10-20"), [x.ind.id]);
      expect(await estadoYMarca(tx, x.medicion)).toEqual(["reportada", false]);

      await analizar(x.analiza, { medicionId: x.medicion, analisis: ANALISIS }, { sql: tx, ahora: dia("2026-10-21") });
      const m = await fila(tx, x.medicion);
      expect([m.analisis, m.estado, m.debe_soporte]).toEqual([ANALISIS, "reportada", false]);
    }));

  it("caso 3: activado el 6, dentro del plazo: lo debe aunque el dato llegue el 20 y cumpla", () =>
    revertida(sql, async (tx) => {
      const x = await mixto(tx);
      await reportarLoMio(tx, x.mide, x.medicion, LO_MIO);
      await activarSoporte(tx, x.ind.id, dia("2026-10-06"));
      expect(await estadoYMarca(tx, x.medicion)).toEqual(["abierta", true]);

      await reportarElDato(tx, x.responsable, x.datoId, "2026-09", CUMPLE, dia("2026-10-20"));
      await propagarA(tx, dia("2026-10-20"), [x.ind.id]);
      const m = await fila(tx, x.medicion);
      expect([m.semaforo, m.estado, m.debe_soporte]).toEqual(["bien", "abierta", true]);
    }));

  it("caso 5: activado el 6, desactivado el 8 y vuelto a activar el 12: ya estaba reportado con su plazo vencido y no lo debe", () =>
    revertida(sql, async (tx) => {
      const x = await mixto(tx);
      await reportarLoMio(tx, x.mide, x.medicion, LO_MIO);
      await activarSoporte(tx, x.ind.id, dia("2026-10-06"));
      expect(await marcaDe(tx, x.medicion)).toBe(true);
      await desactivarSoporte(tx, x.ind.id, dia("2026-10-08"));
      await activarSoporte(tx, x.ind.id, dia("2026-10-12"));
      expect(await marcaDe(tx, x.medicion)).toBe(false);
    }));

  it("caso 6: desactivado, nadie lo debe: la que solo esperaba el soporte queda reportada", () =>
    revertida(sql, async (tx) => {
      const x = await mixto(tx);
      await reportarLoMio(tx, x.mide, x.medicion, LO_MIO);
      await activarSoporte(tx, x.ind.id, dia("2026-10-06"));
      await reportarElDato(tx, x.responsable, x.datoId, "2026-09", CUMPLE, dia("2026-10-07"));
      await propagarA(tx, dia("2026-10-07"), [x.ind.id]);
      expect(await estadoYMarca(tx, x.medicion)).toEqual(["abierta", true]);

      await desactivarSoporte(tx, x.ind.id, dia("2026-10-08"));
      expect((await fila(tx, x.medicion)).estado).toBe("reportada");
    }));

  it("caso 7: activado el 12; el 1 de noviembre el plazo sube a 15 días: la marca no cambia, y corregir lo propio no pide el soporte", () =>
    revertida(sql, async (tx) => {
      const x = await mixto(tx);
      await reportarLoMio(tx, x.mide, x.medicion, LO_MIO);
      await activarSoporte(tx, x.ind.id, dia("2026-10-12"));
      await reportarElDato(tx, x.responsable, x.datoId, "2026-09", CUMPLE, dia("2026-10-20"));
      await propagarA(tx, dia("2026-10-20"), [x.ind.id]);
      expect(await estadoYMarca(tx, x.medicion)).toEqual(["reportada", false]);

      await cambiarOperacion(
        await sesionAdmin(tx),
        { indicadorId: x.ind.id, plazoReporteDias: 15, inicioMedicion: "2026-09", soporteObligatorio: true, nivelAcceso: "general" },
        { sql: tx, ahora: dia("2026-11-01") },
      );
      // La fecha límite nueva queda después de la activación; la marca, decidida el 12, no cambia con ella.
      const m = await fila(tx, x.medicion);
      expect(m.vence_en).toEqual(fechaLimiteDeReporte(periodoDe("2026-09", ZONA)!, 15, ZONA));
      expect(m.vence_en.getTime()).toBeGreaterThan(dia("2026-10-12").getTime());
      expect([m.estado, m.debe_soporte]).toEqual(["reportada", false]);

      // Quien mide corrige lo suyo sin soporte el 2: no se le pide, y sigue reportada.
      expect(await reportarLoMio(tx, x.mide, x.medicion, { A: "38000000" }, dia("2026-11-02"))).toMatchObject({ ok: true, estado: "reportada" });
      expect(await marcaDe(tx, x.medicion)).toBe(false);
    }));

  it("caso 8: septiembre sin reportar al activarse el 12 lo debe; reportarlo el 20 sin soporte se rechaza, y con él se acepta", () =>
    revertida(sql, async (tx) => {
      const x = await mixto(tx);
      await activarSoporte(tx, x.ind.id, dia("2026-10-12"));
      expect(await marcaDe(tx, x.medicion)).toBe(true);
      await rechaza(reportarLoMio(tx, x.mide, x.medicion, LO_MIO, dia("2026-10-20")), EXIGE);

      await adjuntarSoporte(tx, x.medicion);
      expect(await reportarLoMio(tx, x.mide, x.medicion, LO_MIO, dia("2026-10-20"))).toMatchObject({ ok: true });
    }));

  it("caso 8 con el contagio: el reporte que puso el sistema no es de quien mide; al activarse lo debe, y al quitarse el contagio reportarlo tarde sin soporte se rechaza", () =>
    revertida(sql, async (tx) => {
      // X mensual y el compuesto mixto C: A toma el valor de X y B la digita quien mide C, que no reportó septiembre.
      const procesoId = await procesoNuevo(tx);
      const mideX = await usuarioDePrueba(tx, { rol: "consulta" });
      const mideC = await usuarioDePrueba(tx, { rol: "consulta" });
      const comun = { procesoId, periodicidad: "mensual" as const, inicioMedicion: "2026-09", aprobadaEn: APROBADA };
      const x = await indicadorDePrueba(tx, { ...comun, mide: [mideX.usuarioId] });
      const c = await indicadorDePrueba(tx, {
        ...comun,
        mide: [mideC.usuarioId],
        variables: { A: { indicadorOrigenId: x.id, toma: "valor" }, B: { nombre: "Casos evaluados" } },
      });
      for (const i of [x, c]) await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: i.id });
      const [deX, deC] = [await medicionDe(tx, x.id, "2026-09"), await medicionDe(tx, c.id, "2026-09")];

      // El 11, con septiembre ya vencido, X no aplica: el contagio da a C por reportado, sin persona.
      await marcarNoAplica(mideX, { medicionId: deX, motivo: "Sin casos en el mes" }, { sql: tx, ahora: dia("2026-10-11") });
      await propagarA(tx, dia("2026-10-11"), [x.id]);
      let m = await fila(tx, deC);
      expect([m.no_aplica, m.reportada_en, m.reportada_por]).toEqual([true, dia("2026-10-11"), null]);

      // El 12 se activa el soporte: quien mide C no había entregado lo suyo, así que lo debe.
      await activarSoporte(tx, c.id, dia("2026-10-12"));
      expect(await marcaDe(tx, deC)).toBe(true);

      // El 20 X aplica: el contagio se quita y le devuelve el reporte a quien mide C, vencido (llegó tarde: la fecha no se mueve).
      await quitarNoAplica(mideX, deX, { sql: tx, ahora: dia("2026-10-20") });
      await reportar(mideX, { medicionId: deX, valores: { A: "60", B: "100" }, parcial: false, confirmado: true }, { sql: tx, ahora: dia("2026-10-20") });
      await propagarA(tx, dia("2026-10-20"), [x.id]);
      m = await fila(tx, deC);
      expect([m.no_aplica, m.reportada_en, m.debe_soporte]).toEqual([false, null, true]);
      expect(m.vence_en.getTime()).toBeLessThan(dia("2026-10-21").getTime());
      await rechaza(reportar(mideC, { medicionId: deC, valores: { B: "100" }, parcial: false, confirmado: true }, { sql: tx, ahora: dia("2026-10-21") }), EXIGE);
    }));

  it("nace marcada: con el soporte activo, la medición que abre asegurarMediciones lo debe; una histórica, no", () =>
    revertida(sql, async (tx) => {
      const x = await mixto(tx);
      await activarSoporte(tx, x.ind.id, dia("2026-10-12"));
      await asegurarMediciones({ sql: tx, ahora: dia("2026-11-05"), indicadorId: x.ind.id });
      expect(await marcaDe(tx, await medicionDe(tx, x.ind.id, "2026-10"))).toBe(true);

      // Aprobados el 15 de agosto desde junio: junio y julio son históricos.
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const desdeJunio = { procesoId: x.procesoId, inicioMedicion: "2026-06", aprobadaEn: APROBADA, mide: [mide.usuarioId] };
      const con = await indicadorDePrueba(tx, { ...desdeJunio, soporteObligatorio: true });
      const sin = await indicadorDePrueba(tx, desdeJunio);
      const marcas = async (indicadorId: number) => {
        await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId });
        const filas = await tx`SELECT periodo, historica, debe_soporte FROM mediciones WHERE indicador_id = ${indicadorId} ORDER BY periodo`;
        return Object.fromEntries(filas.map((f) => [f.periodo as string, [f.historica as boolean, f.debe_soporte as boolean]]));
      };
      expect(await marcas(con.id)).toEqual({ "2026-06": [true, false], "2026-07": [true, false], "2026-08": [false, true], "2026-09": [false, true] });
      expect(await marcas(sin.id)).toEqual({ "2026-06": [true, false], "2026-07": [true, false], "2026-08": [false, false], "2026-09": [false, false] });
    }));

  it("reabrir: la cerrada antes de activarse vuelve sin marca y queda reportada sin soporte; la marcada conserva su marca", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const reabrir = (medicionId: number, ahora: Date) =>
        reabrirEnCascada(admin, { fuente: { clase: "medicion", medicionId }, justificacion: "Facturación corrigió el total del mes" }, { sql: tx, ahora });

      const x = await mixto(tx);
      await reportarLoMio(tx, x.mide, x.medicion, LO_MIO);
      await reportarElDato(tx, x.responsable, x.datoId, "2026-09", CUMPLE);
      await propagarA(tx, AHORA, [x.ind.id]);
      expect(await estadoYMarca(tx, x.medicion)).toEqual(["reportada", false]);
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id = ${x.medicion}`;
      // Activarlo dentro del plazo no toca la cerrada (el trigger de las cerradas no lo dejaría): se queda sin marca.
      await activarSoporte(tx, x.ind.id, dia("2026-10-06"));
      expect(await estadoYMarca(tx, x.medicion)).toEqual(["cerrada", false]);
      await reabrir(x.medicion, dia("2026-10-07"));
      expect(await estadoYMarca(tx, x.medicion)).toEqual(["reportada", false]);

      const y = await mixto(tx);
      await activarSoporte(tx, y.ind.id, dia("2026-10-06"));
      await adjuntarSoporte(tx, y.medicion);
      await reportarLoMio(tx, y.mide, y.medicion, LO_MIO, dia("2026-10-07"));
      await reportarElDato(tx, y.responsable, y.datoId, "2026-09", CUMPLE, dia("2026-10-07"));
      await propagarA(tx, dia("2026-10-07"), [y.ind.id]);
      expect(await estadoYMarca(tx, y.medicion)).toEqual(["reportada", true]);
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id = ${y.medicion}`;
      await reabrir(y.medicion, dia("2026-10-08"));
      expect(await estadoYMarca(tx, y.medicion)).toEqual(["reportada", true]);
    }));
});

/**
 * Lo que se ve (anexo del complemento, §4.4): las tareas, la lista, la pasada y la tabla del año preguntan lo mismo que
 * `recalcularMedicion`, la marca y si hay soporte, y no el estado guardado ni el plazo. Un soporte que se debe mientras la
 * medición espera su dato es de quien mide, como cualquier soporte, y vence con la fecha límite de la medición. Sobre el
 * mixto de `utiles/mixto.ts`: septiembre vence el 10 de octubre y quien mide reporta lo suyo el 5, sin soporte.
 */
describe("lo que se ve: tareas, lista, pasada y tabla del año", () => {
  const config = { ...CONFIG_DOCUMENTAL_DEFECTO, escalamientoDias: 3 };
  const OCT_12 = dia("2026-10-12");
  const SOPORTE = "Falta el soporte obligatorio";
  type Mixto = Awaited<ReturnType<typeof mixto>>;

  const tareaDeMedir = async (tx: TransactionSql, sesion: SesionFlujo, medicionId: number, ahora: Date) => {
    const { tareas, vencidas } = await tareasDeIndicadores(sesion, { sql: tx, ahora });
    return { tarea: tareas.find((t) => t.id === `medir:${medicionId}`) ?? null, vencidas };
  };
  const enLaLista = async (tx: TransactionSql, x: Mixto, ahora: Date) => {
    const { filas, resumen } = await listarIndicadores(x.mide, { procesoId: x.procesoId }, { sql: tx, ahora });
    return { reporte: filas.find((f) => f.id === x.ind.id)?.reporte, vencidos: resumen.vencidos };
  };
  const septiembre = async (tx: TransactionSql, x: Mixto, ahora: Date) => {
    const f = (await tablaDelAnio(x.mide, x.ind.id, 2026, { sql: tx, ahora })).find((p) => p.periodo === "2026-09")!;
    return { estado: f.estado, faltaSoporte: f.faltaSoporte === true, vencida: f.vencida, texto: estadoEnTexto(f) };
  };
  const enLaPantalla = async (tx: TransactionSql, x: Mixto, ahora: Date) => {
    const d = await medicionParaReportar(x.mide, x.ind.codigo, "2026-09", { sql: tx, ahora });
    return { debeSoporte: d?.debeSoporte, vencida: d?.vencida };
  };
  const avisosDe = async (tx: TransactionSql, usuarioId: number) =>
    (await tx`SELECT tipo, titulo FROM notificaciones WHERE usuario_id = ${usuarioId} ORDER BY id`).map((n) => ({ tipo: n.tipo, titulo: n.titulo }));

  it("caso 3, el 12: sin el dato y con el plazo vencido, la tarea, la lista, la pasada y la tabla dicen que debe el soporte, vencido", () =>
    revertida(sql, async (tx) => {
      await silenciarIndicadores(tx);
      const x = await mixto(tx);
      await reportarLoMio(tx, x.mide, x.medicion, LO_MIO);
      await activarSoporte(tx, x.ind.id, dia("2026-10-06"));
      expect(await falta(tx, x.medicion)).toBe("dato");
      const vence = (await fila(tx, x.medicion)).vence_en as Date;

      expect(await tareaDeMedir(tx, x.mide, x.medicion, OCT_12)).toMatchObject({ tarea: { detalle: SOPORTE, vence }, vencidas: 1 });
      expect(await enLaLista(tx, x, OCT_12)).toEqual({ reporte: { texto: "Vencido hace 2 días", vencida: true }, vencidos: 1 });
      expect(await septiembre(tx, x, OCT_12)).toEqual({
        estado: "falta_dato",
        faltaSoporte: true,
        vencida: true,
        texto: "Falta un dato · falta el soporte · vencida",
      });
      expect(await enLaPantalla(tx, x, OCT_12)).toEqual({ debeSoporte: true, vencida: true });
      await revisarVencimientosDeIndicadores({ sql: tx, ahora: OCT_12, config });
      expect((await fila(tx, x.medicion)).aviso_vencido_en).toEqual(OCT_12);
      expect(await avisosDe(tx, x.mide.usuarioId)).toContainEqual({ tipo: "indicadores.vencido", titulo: "Tiene 1 indicador por reportar con el plazo vencido" });

      // Con el soporte adjunto ya no se debe nada de quien mide: solo espera el dato, que no es de nadie ni vence.
      await adjuntarSoporte(tx, x.medicion);
      expect(await tareaDeMedir(tx, x.mide, x.medicion, OCT_12)).toEqual({ tarea: null, vencidas: 0 });
      expect(await enLaLista(tx, x, OCT_12)).toEqual({ reporte: { texto: "Falta un dato", vencida: false }, vencidos: 0 });
      expect(await septiembre(tx, x, OCT_12)).toEqual({ estado: "falta_dato", faltaSoporte: false, vencida: false, texto: "Falta un dato" });
      expect(await enLaPantalla(tx, x, OCT_12)).toEqual({ debeSoporte: true, vencida: false });
    }));

  it("una medición abierta con todo lo demás completo y sin la marca (estado viejo): ni tarea, ni vencida en la lista, ni aviso; la tabla la da por reportada", () =>
    revertida(sql, async (tx) => {
      await silenciarIndicadores(tx);
      const x = await mixto(tx);
      await reportarLoMio(tx, x.mide, x.medicion, LO_MIO);
      await reportarElDato(tx, x.responsable, x.datoId, "2026-09", CUMPLE);
      await propagarA(tx, AHORA, [x.ind.id]);
      expect(await estadoYMarca(tx, x.medicion)).toEqual(["reportada", false]);
      // Como la dejaba la regla de antes de la 0017: abierta solo por un soporte que esta medición no debe (anexo §4.3).
      await tx`UPDATE indicadores SET soporte_obligatorio = true, soporte_obligatorio_desde = ${dia("2026-10-06")} WHERE id = ${x.ind.id}`;
      await tx`UPDATE mediciones SET estado = 'abierta' WHERE id = ${x.medicion}`;

      expect(await tareaDeMedir(tx, x.mide, x.medicion, OCT_12)).toEqual({ tarea: null, vencidas: 0 });
      const lista = await enLaLista(tx, x, OCT_12);
      expect([lista.reporte?.vencida, lista.vencidos]).toEqual([false, 0]);
      expect(await septiembre(tx, x, OCT_12)).toMatchObject({ estado: "reportada", faltaSoporte: false, vencida: false });
      expect((await enLaPantalla(tx, x, OCT_12)).debeSoporte).toBe(false);
      await revisarVencimientosDeIndicadores({ sql: tx, ahora: OCT_12, config });
      expect((await fila(tx, x.medicion)).aviso_vencido_en).toBeNull();
    }));

  it("los datos de operación traen desde cuándo exige soporte; desactivarlo la quita", () =>
    revertida(sql, async (tx) => {
      const x = await mixto(tx);
      expect(await operacionDeIndicador(x.ind.id, { sql: tx })).toMatchObject({ soporteObligatorio: false, soporteDesde: null });
      // Las 10 de la noche del 12 en la zona de la instalación: ya es el 13 en UTC.
      const desde = new Date("2026-10-13T03:00:00Z");
      await activarSoporte(tx, x.ind.id, desde);
      expect(await operacionDeIndicador(x.ind.id, { sql: tx })).toMatchObject({ soporteObligatorio: true, soporteDesde: desde });
      await desactivarSoporte(tx, x.ind.id, dia("2026-10-20"));
      expect(await operacionDeIndicador(x.ind.id, { sql: tx })).toMatchObject({ soporteObligatorio: false, soporteDesde: null });
    }));
});
