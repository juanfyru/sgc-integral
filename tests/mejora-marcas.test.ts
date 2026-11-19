/**
 * La marca «Requiere acción de mejora» de un indicador (Fase 15B, Tarea 8; anexo §6.1 a §6.5): qué es un pendiente, quién puede
 * decidirlo, sus tres salidas (un hallazgo nuevo, una ocurrencia de uno abierto, «No requiere»), la salida que deja el registro al
 * nacer, la que deja de estar en vigor y el candado de la medición. Contra la BD de trabajo, dentro de una transacción que se
 * revierte: una medición marcada exige una ficha aprobada, que ningún test deja confirmada. Por eso las decisiones que compiten
 * van en serie, y el candado se prueba como la primera sentencia de cada salida.
 *
 * `medicionMarcada` deja octubre de 2026 de un indicador nuevo en Crítico (10 %, meta 90 %), con su fecha límite en noviembre.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { analizar } from "@/db/consultas/indicadores/analisis";
import { obtenerParametros } from "@/db/consultas/indicadores/maestros";
import { asegurarMediciones, reportar } from "@/db/consultas/indicadores/mediciones";
import { NO_EXISTE } from "@/db/consultas/mejoramiento/flujo";
import {
  marcasDelIndicador,
  puedeResolverMarca,
  resolverConOcurrencia,
  resolverNoRequiere,
  salidasVisibles,
} from "@/db/consultas/mejoramiento/marcas";
import { cargarHallazgo } from "@/db/consultas/mejoramiento/carga";
import { rechazarHallazgo, retirarHallazgo } from "@/db/consultas/mejoramiento/recorrido";
import { tareasDeMarcas } from "@/db/consultas/mejoramiento/tareas";
import { anularHallazgo, registrarHallazgo, type DatosDeHallazgo } from "@/db/consultas/mejoramiento/registro";
import {
  estadoDeLaMarca,
  fraseDelResultado,
  JUSTIFICACION_CORTA,
  MARCA_SIN_PENDIENTE,
  MARCA_YA_DECIDIDA,
  tituloDeLaMarca,
  type MarcaSinDecidir,
} from "@/lib/mejoramiento/marcas";
import { rutaDeHallazgo } from "@/lib/mejoramiento/rutas";
import { ErrorMejora } from "@/lib/mejoramiento/tipos";
import { ErrorPermiso } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { indicadorDePrueba } from "./utiles/indicadores";
import {
  ANALISIS_DE_LA_MARCA,
  baseDeMejora,
  c,
  datosDeCarga,
  datosDeHallazgo,
  hallazgoEn,
  medicionMarcada,
  otroProcesoConLider,
  planDePrueba,
  type BaseDeMejora,
  type MedicionMarcada,
} from "./utiles/mejoramiento";
import { procesoNuevo } from "./utiles/mixto";
import { contadaConSuTransaccion } from "./utiles/sentencias";
import { revertida } from "./utiles/transaccion";
import { usuarioDePrueba } from "./utiles/tramites";

const sql = obtenerSql();
afterAll(() => sql.end());

/** Cuándo se reporta (y se analiza), antes de la fecha límite de octubre. */
const REPORTA = "2026-11-03T15:00:00Z";
/** Todavía antes de la fecha límite. */
const ANTES = "2026-11-05T15:00:00Z";
/** Ya pasada la fecha límite. */
const DESPUES = "2026-11-25T15:00:00Z";

async function rechaza(promesa: Promise<unknown>, mensaje: string) {
  const err = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ErrorMejora);
  expect((err as Error).message).toBe(mensaje);
}

async function sinPermiso(promesa: Promise<unknown>) {
  const err = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ErrorPermiso);
}

/** Cómo ve el panel del indicador la medición, como `sesion` a `ahora`: `null` si no está entre sus marcas. */
async function enElPanel(tx: TransactionSql, sesion: SesionFlujo, mm: MedicionMarcada, ahora: string) {
  const panel = await marcasDelIndicador(sesion, mm.ind.id, { sql: tx, ahora: new Date(ahora) });
  return panel?.marcas.find((m) => m.medicionId === mm.medicionId) ?? null;
}

const estadoEnElPanel = async (tx: TransactionSql, sesion: SesionFlujo, mm: MedicionMarcada, ahora: string) =>
  (await enElPanel(tx, sesion, mm, ahora))?.estado ?? null;

/** Las salidas de la medición, en su orden. */
const salidasDe = (tx: TransactionSql, medicionId: number) =>
  tx`SELECT salida, hallazgo_id, justificacion, decidido_por FROM mejora_marcas WHERE medicion_id = ${medicionId} ORDER BY id`;

/** Un hallazgo que cita el indicador y la medición, detectado el 4 de noviembre. */
const queCita = (b: BaseDeMejora, mm: MedicionMarcada, cambios?: Partial<DatosDeHallazgo>): DatosDeHallazgo =>
  datosDeHallazgo(b.procesoId, {
    origen: "indicador",
    fuente: null,
    detectadoEn: "2026-11-04",
    indicadorId: mm.ind.id,
    medicionId: mm.medicionId,
    titulo: "Oportunidad de citas por encima de la meta",
    ...cambios,
  });

/** Un hallazgo que solo cita el indicador, de Control Interno (no resuelve marcas: no deja salida). */
const deControl = (tx: TransactionSql, b: BaseDeMejora, indicadorId: number, ahora = DESPUES, cambios?: Partial<DatosDeHallazgo>) =>
  registrarHallazgo(b.control, datosDeHallazgo(b.procesoId, { indicadorId, detectadoEn: "2026-11-04", ...cambios }), c(ahora, tx));

const NO_REQUIERE = "El resultado se explica por el cierre temporal de la sede por obras";

// ─────────────────────────────────────────────────────────────────────────────
// La regla (pura)
// ─────────────────────────────────────────────────────────────────────────────

describe("estadoDeLaMarca: cuándo una marca ya se puede decidir (las reglas de analisisExigido y analisisCompleto)", () => {
  const VENCE = new Date("2026-11-11T04:59:59.999Z");
  const ANTES_DE = new Date("2026-11-05T15:00:00Z");
  const marca = (cambios: Partial<MarcaSinDecidir>): MarcaSinDecidir => ({
    semaforo: "critico",
    cumple: false,
    repetido: false,
    analisis: null,
    causa: null,
    accionPropuesta: null,
    venceEn: VENCE,
    cerrada: false,
    ...cambios,
  });
  const CAUSA = "Dos auditores internos en incapacidad";
  const ACCION = "Formar dos auditores suplentes";

  it("dos partes (Crítico): solo con la causa y la acción de al menos 10 caracteres; el análisis simple no basta", () => {
    expect(estadoDeLaMarca(marca({}), ANTES_DE)).toBe("espera_analisis");
    expect(estadoDeLaMarca(marca({ analisis: "Faltó una auditoría por la visita" }), ANTES_DE)).toBe("espera_analisis");
    expect(estadoDeLaMarca(marca({ causa: "123456789", accionPropuesta: ACCION }), ANTES_DE)).toBe("espera_analisis");
    expect(estadoDeLaMarca(marca({ causa: `   ${"x".repeat(9)}   `, accionPropuesta: ACCION }), ANTES_DE)).toBe("espera_analisis");
    expect(estadoDeLaMarca(marca({ causa: CAUSA, accionPropuesta: ACCION }), ANTES_DE)).toBe("pendiente");
    // La longitud es la de los indicadores (unidades UTF-16): cinco emojis son diez.
    expect(estadoDeLaMarca(marca({ causa: "🙂🙂🙂🙂🙂", accionPropuesta: ACCION }), ANTES_DE)).toBe("pendiente");
  });

  it("dos partes (un incumplimiento repetido en Atención): igual", () => {
    expect(estadoDeLaMarca(marca({ semaforo: "atencion", repetido: true, analisis: "Faltó una auditoría por la visita" }), ANTES_DE)).toBe(
      "espera_analisis",
    );
    expect(estadoDeLaMarca(marca({ semaforo: "atencion", repetido: true, causa: CAUSA, accionPropuesta: ACCION }), ANTES_DE)).toBe("pendiente");
  });

  it("ninguno (Crítico que alcanza la meta, con rangos): no pide análisis, es un pendiente de una vez", () => {
    expect(estadoDeLaMarca(marca({ cumple: true }), ANTES_DE)).toBe("pendiente");
  });

  it("una fila anterior a la 0012 (cumple nulo) en Crítico se lee como no cumple: espera sus dos partes", () => {
    expect(estadoDeLaMarca(marca({ cumple: null }), ANTES_DE)).toBe("espera_analisis");
  });

  it("vencida (después de su fecha límite, no en ella) o cerrada, sí, sin análisis", () => {
    expect(estadoDeLaMarca(marca({}), VENCE)).toBe("espera_analisis");
    expect(estadoDeLaMarca(marca({}), new Date(VENCE.getTime() + 1))).toBe("pendiente");
    expect(estadoDeLaMarca(marca({ cerrada: true }), ANTES_DE)).toBe("pendiente");
  });
});

describe("los textos que propone el registro", () => {
  it("el título: el nombre y el periodo, en 150 caracteres como mucho, sin cortar el periodo", () => {
    expect(tituloDeLaMarca("Oportunidad de citas", "octubre de 2026")).toBe("Oportunidad de citas, octubre de 2026");
    const largo = tituloDeLaMarca("x".repeat(200), "octubre de 2026");
    expect(largo).toHaveLength(150);
    expect(largo.endsWith("…, octubre de 2026")).toBe(true);
  });

  it("la frase del resultado: el valor, la meta, el color y, si es el caso, que repite el incumplimiento", () => {
    expect(fraseDelResultado({ indicador: "Oportunidad de citas", periodo: "octubre de 2026", resultado: "4,6 días", meta: "≤ 3 días", semaforo: "critico", repetido: false })).toBe(
      "Octubre de 2026: «Oportunidad de citas» quedó en Crítico con 4,6 días (meta: ≤ 3 días).",
    );
    expect(fraseDelResultado({ indicador: "Auditorías", periodo: "tercer trimestre de 2026", resultado: "80 %", meta: "≥ 90 %", semaforo: "atencion", repetido: true })).toBe(
      "Tercer trimestre de 2026: «Auditorías» quedó en Atención con 80 % (meta: ≥ 90 %). Repite el incumplimiento de la meta.",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// El pendiente (anexo §6.1)
// ─────────────────────────────────────────────────────────────────────────────

describe("el pendiente", () => {
  it("con el análisis completo, sí, aunque falte para su fecha límite", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      expect(mm.venceEn.getTime()).toBeGreaterThan(new Date(ANTES).getTime());
      expect(mm.venceEn.getTime()).toBeLessThan(new Date(DESPUES).getTime());
      expect(await enElPanel(tx, b.admin, mm, ANTES)).toEqual({
        medicionId: mm.medicionId,
        periodo: "Octubre de 2026",
        resultado: "10 % frente a una meta de 90 %",
        semaforo: "critico",
        estado: "pendiente",
        esperaHasta: null,
        causa: ANALISIS_DE_LA_MARCA.causa,
        accionPropuesta: ANALISIS_DE_LA_MARCA.accionPropuesta,
        analizadaEn: "2026-11-03",
      });
    }));

  it("sin análisis y con la fecha límite por delante, no: espera su análisis, con el día en que se pedirá", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, procesoId: b.procesoId });
      expect(await enElPanel(tx, b.admin, mm, ANTES)).toMatchObject({
        estado: "espera_analisis",
        esperaHasta: fechaEnZona(mm.venceEn, zonaHoraria()),
        causa: null,
        accionPropuesta: null,
      });
    }));

  it("sin análisis y con la fecha límite pasada, sí", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, procesoId: b.procesoId });
      expect(await estadoEnElPanel(tx, b.admin, mm, DESPUES)).toBe("pendiente");
    }));

  it("reportada después de su fecha límite, sí desde ese momento: antes no tenía la marca", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const ind = await indicadorDePrueba(tx, {
        procesoId: b.procesoId,
        inicioMedicion: "2026-10",
        aprobadaEn: new Date("2026-01-15T15:00:00Z"),
        mide: [mide.usuarioId],
      });
      await asegurarMediciones({ sql: tx, ahora: new Date(DESPUES), indicadorId: ind.id });
      const [m] = await tx`SELECT id, vence_en FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = '2026-10'`;
      expect((m.vence_en as Date).getTime()).toBeLessThan(new Date(DESPUES).getTime());
      const mm = { ind, medicionId: Number(m.id) } as MedicionMarcada;
      expect(await estadoEnElPanel(tx, b.admin, mm, DESPUES)).toBeNull();
      await reportar(mide, { medicionId: mm.medicionId, valores: { A: "10", B: "100" }, parcial: false, confirmado: true }, { sql: tx, ahora: new Date(DESPUES) });
      expect(await estadoEnElPanel(tx, b.admin, mm, DESPUES)).toBe("pendiente");
    }));

  it("cerrada sin análisis, sí, aunque no haya llegado su fecha límite (la marca del cierre, por SQL)", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, procesoId: b.procesoId });
      expect(await estadoEnElPanel(tx, b.admin, mm, ANTES)).toBe("espera_analisis");
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id = ${mm.medicionId}`;
      expect(await estadoEnElPanel(tx, b.admin, mm, ANTES)).toBe("pendiente");
    }));

  it("histórica, nunca (un histórico no lleva la marca: se le pone por SQL, con la marca, para probarlo)", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      await tx`UPDATE mediciones SET historica = true, requiere_accion = true WHERE id = ${mm.medicionId}`;
      expect(await estadoEnElPanel(tx, b.admin, mm, DESPUES)).toBeNull();
    }));

  it("de un indicador retirado, no", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      await tx`UPDATE indicadores SET estado = 'retirado', baja_por = ${b.admin.usuarioId}, baja_en = now(), baja_motivo = 'Se reemplazó por otro indicador'
        WHERE id = ${mm.ind.id}`;
      expect(await estadoEnElPanel(tx, b.admin, mm, DESPUES)).toBeNull();
    }));

  it("si un recálculo le quita la marca (se corrige a Bien), deja de serlo", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      expect(await estadoEnElPanel(tx, b.admin, mm, ANTES)).toBe("pendiente");
      await reportar(mm.mide, { medicionId: mm.medicionId, valores: { A: "95", B: "100" }, parcial: false, confirmado: true }, { sql: tx, ahora: new Date(ANTES) });
      const [m] = await tx`SELECT requiere_accion FROM mediciones WHERE id = ${mm.medicionId}`;
      expect(m.requiere_accion).toBe(false);
      expect(await estadoEnElPanel(tx, b.admin, mm, ANTES)).toBeNull();
    }));

  it("un Bien con su análisis opcional, corregido a Crítico, espera las dos partes (analizada_en no decide)", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, procesoId: b.procesoId, valores: { A: "95", B: "100" } });
      await analizar(mm.analiza, { medicionId: mm.medicionId, analisis: "Se cumplió con holgura este mes" }, { sql: tx, ahora: new Date(REPORTA) });
      await reportar(mm.mide, { medicionId: mm.medicionId, valores: { A: "10", B: "100" }, parcial: false, confirmado: true }, { sql: tx, ahora: new Date(REPORTA) });
      const [m] = await tx`SELECT requiere_accion, analizada_en FROM mediciones WHERE id = ${mm.medicionId}`;
      expect([m.requiere_accion, m.analizada_en !== null]).toEqual([true, true]);
      expect(await estadoEnElPanel(tx, b.admin, mm, ANTES)).toBe("espera_analisis");
    }));

  it("con el análisis completo y abierta (le falta el soporte), sí: el estado guardado no decide", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      await tx`UPDATE mediciones SET estado = 'abierta' WHERE id = ${mm.medicionId}`;
      expect(await estadoEnElPanel(tx, b.admin, mm, ANTES)).toBe("pendiente");
    }));

  it("dos partes por un incumplimiento repetido (Atención): sin análisis espera; con él, sí", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const { incumplimientoPeriodos: n } = await obtenerParametros({ sql: tx });
      expect(n).toBeLessThanOrEqual(9);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const analiza = await usuarioDePrueba(tx, { rol: "consulta" });
      const ind = await indicadorDePrueba(tx, {
        procesoId: b.procesoId,
        inicioMedicion: `2026-${String(10 - n + 1).padStart(2, "0")}`,
        aprobadaEn: new Date("2026-01-15T15:00:00Z"),
        mide: [mide.usuarioId],
        analiza: [analiza.usuarioId],
      });
      await asegurarMediciones({ sql: tx, ahora: new Date(REPORTA), indicadorId: ind.id });
      const periodos = await tx`SELECT id, periodo FROM mediciones WHERE indicador_id = ${ind.id} ORDER BY desde`;
      for (const p of periodos) {
        await reportar(mide, { medicionId: Number(p.id), valores: { A: "80", B: "100" }, parcial: false, confirmado: true }, { sql: tx, ahora: new Date(REPORTA) });
      }
      const octubre = Number(periodos.find((p) => p.periodo === "2026-10")!.id);
      const [m] = await tx`SELECT semaforo, incumplimiento_repetido, requiere_accion FROM mediciones WHERE id = ${octubre}`;
      expect([m.semaforo, m.incumplimiento_repetido, m.requiere_accion]).toEqual(["atencion", true, true]);
      const mm = { ind, medicionId: octubre } as MedicionMarcada;
      expect(await estadoEnElPanel(tx, b.admin, mm, ANTES)).toBe("espera_analisis");
      await analizar(analiza, { medicionId: octubre, ...ANALISIS_DE_LA_MARCA }, { sql: tx, ahora: new Date(REPORTA) });
      expect(await estadoEnElPanel(tx, b.admin, mm, ANTES)).toBe("pendiente");
    }));
});

// ─────────────────────────────────────────────────────────────────────────────
// Quién puede (anexo §6.2 y §12)
// ─────────────────────────────────────────────────────────────────────────────

describe("quién puede decidir una marca", () => {
  it("el Admin SGC, las tres; un líder del proceso, las dos primeras; Control Interno, otro líder y Gerencia, ninguna", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      const o = { sql: tx, ahora: new Date(ANTES) };
      expect((await marcasDelIndicador(b.admin, mm.ind.id, o))?.puede).toEqual({ hallazgo: true, noRequiere: true });
      expect((await marcasDelIndicador(b.lider, mm.ind.id, o))?.puede).toEqual({ hallazgo: true, noRequiere: false });
      for (const s of [b.control, otro.lider, b.gerencia, b.consulta]) expect(await marcasDelIndicador(s, mm.ind.id, o)).toBeNull();
    }));

  it("sobre un indicador que no ve, no existe: un líder con un restringido de otro proceso", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: otro.procesoId, indicador: { nivelAcceso: "restringido" } });
      expect(await marcasDelIndicador(b.lider, mm.ind.id, { sql: tx, ahora: new Date(ANTES) })).toBeNull();
      expect(await puedeResolverMarca(tx, b.lider, { id: mm.ind.id, procesoId: otro.procesoId })).toEqual({ hallazgo: false, noRequiere: false });
      // Lo que no ve no existe: el mismo mensaje que una medición que no pide decidir, no uno de permiso.
      const h = await deControl(tx, b, mm.ind.id);
      await rechaza(resolverConOcurrencia(b.lider, { medicionId: mm.medicionId, hallazgoId: h.id }, c(ANTES, tx)), MARCA_SIN_PENDIENTE);
      // Su líder sí lo ve, y lo decide.
      expect((await marcasDelIndicador(otro.lider, mm.ind.id, { sql: tx, ahora: new Date(ANTES) }))?.puede).toEqual({ hallazgo: true, noRequiere: false });
    }));

  it("un líder no ve el borrador de su propio proceso: no puede ninguna salida (el Admin SGC, que administra indicadores, sí lo ve)", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const borrador = await indicadorDePrueba(tx, { procesoId: b.procesoId, estado: "borrador" });
      expect(await puedeResolverMarca(tx, b.lider, { id: borrador.id, procesoId: b.procesoId })).toEqual({ hallazgo: false, noRequiere: false });
      expect(await puedeResolverMarca(tx, b.admin, { id: borrador.id, procesoId: b.procesoId })).toEqual({ hallazgo: true, noRequiere: true });
    }));
});

// ─────────────────────────────────────────────────────────────────────────────
// Las salidas (anexo §6.2)
// ─────────────────────────────────────────────────────────────────────────────

describe("la ocurrencia de un hallazgo abierto", () => {
  it("deja la ocurrencia (origen medición, el último día del periodo, la frase del resultado), la salida y su bitácora, y avisa", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      const h = await deControl(tx, b, mm.ind.id);
      await resolverConOcurrencia(b.admin, { medicionId: mm.medicionId, hallazgoId: h.id }, c(DESPUES, tx));

      const ocurrencias = await tx`SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, descripcion, origen, registrado_por FROM mejora_ocurrencias WHERE hallazgo_id = ${h.id}`;
      expect(ocurrencias).toHaveLength(1);
      expect({ ...ocurrencias[0], registrado_por: Number(ocurrencias[0].registrado_por) }).toEqual({
        fecha: "2026-10-31",
        descripcion: `Octubre de 2026: «Indicador de prueba ${mm.ind.codigo}» quedó en Crítico con 10 % (meta: ≥ 90 %).`,
        origen: "medicion",
        registrado_por: b.admin.usuarioId,
      });
      const salidas = await salidasDe(tx, mm.medicionId);
      expect(salidas.map((s) => [s.salida, Number(s.hallazgo_id), s.justificacion])).toEqual([["ocurrencia", h.id, null]]);
      const [bitacora] = await tx`SELECT usuario_id, entidad, detalle FROM auditoria WHERE accion = 'mejora_marca' AND entidad_id = ${mm.medicionId}`;
      expect(bitacora.entidad).toBe("medicion");
      expect(bitacora.detalle).toMatchObject({ indicador: mm.ind.codigo, periodo: "2026-10", salida: "ocurrencia", hallazgo: h.codigo });
      const [evento] = await tx`SELECT detalle FROM mejora_eventos WHERE hallazgo_id = ${h.id} AND tipo = 'ocurrencia'`;
      expect(evento.detalle).toMatchObject({ origen: "medicion", medicionId: mm.medicionId, fecha: "2026-10-31" });
      // Como toda ocurrencia: a los líderes del proceso y a los demás Admin SGC, no a quien la registró.
      const avisados = (await tx`SELECT usuario_id FROM notificaciones WHERE tipo = 'mejora.ocurrencia' AND entidad_id = ${h.id}`).map((f) => Number(f.usuario_id));
      expect(avisados).toContain(b.lider.usuarioId);
      expect(avisados).not.toContain(b.admin.usuarioId);
      // Ya decidida: deja de ser un pendiente.
      expect(await estadoEnElPanel(tx, b.admin, mm, DESPUES)).toBeNull();
    }));

  it("con un hallazgo terminado, con uno que no cita el indicador o con uno que no ve, «el hallazgo no existe»", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      const o = c(DESPUES, tx);
      const anulado = await deControl(tx, b, mm.ind.id);
      await anularHallazgo(b.admin, { hallazgoId: anulado.id, justificacion: "Se registró dos veces por error" }, o);
      const noCita = await deControl(tx, b, mm.ind.id, DESPUES, { indicadorId: null });
      const ajeno = await registrarHallazgo(b.control, datosDeHallazgo(otro.procesoId, { indicadorId: mm.ind.id, detectadoEn: "2026-11-04" }), o);
      for (const hallazgoId of [anulado.id, noCita.id, 2_000_000_000]) {
        await rechaza(resolverConOcurrencia(b.admin, { medicionId: mm.medicionId, hallazgoId }, o), NO_EXISTE);
      }
      // El de otro proceso no lo ve su líder (ni puede añadirle ocurrencias); el Admin SGC, sí.
      await rechaza(resolverConOcurrencia(b.lider, { medicionId: mm.medicionId, hallazgoId: ajeno.id }, o), NO_EXISTE);
      expect(await salidasDe(tx, mm.medicionId)).toHaveLength(0);
      await resolverConOcurrencia(b.admin, { medicionId: mm.medicionId, hallazgoId: ajeno.id }, o);
      expect((await salidasDe(tx, mm.medicionId)).map((s) => Number(s.hallazgo_id))).toEqual([ajeno.id]);
    }));

  it("sobre una medición que todavía no es un pendiente, MARCA_SIN_PENDIENTE", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, procesoId: b.procesoId });
      const h = await deControl(tx, b, mm.ind.id, ANTES);
      await rechaza(resolverConOcurrencia(b.admin, { medicionId: mm.medicionId, hallazgoId: h.id }, c(ANTES, tx)), MARCA_SIN_PENDIENTE);
      await rechaza(resolverNoRequiere(b.admin, { medicionId: mm.medicionId, justificacion: NO_REQUIERE }, c(ANTES, tx)), MARCA_SIN_PENDIENTE);
      // Una que no existe, igual.
      await rechaza(resolverNoRequiere(b.admin, { medicionId: 2_000_000_000, justificacion: NO_REQUIERE }, c(ANTES, tx)), MARCA_SIN_PENDIENTE);
      await rechaza(resolverNoRequiere(b.admin, { medicionId: 9_000_000_000, justificacion: NO_REQUIERE }, c(ANTES, tx)), MARCA_SIN_PENDIENTE);
      expect(await salidasDe(tx, mm.medicionId)).toHaveLength(0);
    }));
});

describe("los candidatos a la ocurrencia", () => {
  it("los sin terminar que citan el indicador (por indicador, por medición o como indicador de eficacia) y la persona ve, el más reciente primero", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      const ajeno = await registrarHallazgo(b.control, datosDeHallazgo(otro.procesoId, { indicadorId: mm.ind.id, detectadoEn: "2026-11-04" }), c("2026-11-14T15:00:00Z", tx));
      const porIndicador = await deControl(tx, b, mm.ind.id, "2026-11-15T15:00:00Z");
      const porMedicion = await registrarHallazgo(b.control, queCita(b, mm, { indicadorId: null }), c("2026-11-16T15:00:00Z", tx));
      // Uno que no cita el indicador hasta que su plan lo toma como criterio de eficacia (registrado el 17).
      const porEficacia = await hallazgoEn(tx, b, "por_formular");
      await planDePrueba(tx, b, porEficacia.id, { indicadorId: mm.ind.id });
      const anulado = await deControl(tx, b, mm.ind.id, "2026-11-18T15:00:00Z");
      await anularHallazgo(b.admin, { hallazgoId: anulado.id, justificacion: "Se registró dos veces por error" }, c("2026-11-18T15:00:00Z", tx));
      await deControl(tx, b, mm.ind.id, "2026-11-19T15:00:00Z", { indicadorId: null });

      const ids = async (s: SesionFlujo) => (await marcasDelIndicador(s, mm.ind.id, { sql: tx, ahora: new Date(DESPUES) }))!.candidatos.map((x) => x.id);
      expect(await ids(b.admin)).toEqual([porEficacia.id, porMedicion.id, porIndicador.id, ajeno.id]);
      expect(await ids(b.lider)).toEqual([porEficacia.id, porMedicion.id, porIndicador.id]);
      const [primero] = (await marcasDelIndicador(b.admin, mm.ind.id, { sql: tx, ahora: new Date(DESPUES) }))!.candidatos;
      expect(primero).toEqual({ id: porEficacia.id, codigo: porEficacia.codigo, titulo: "Formatos de entrega de turno sin diligenciar", estado: "Por formular" });
    }));
});

describe("«No requiere acción de mejora»", () => {
  it("con 9 caracteres se rechaza; con una válida deja la fila con el texto y la bitácora sin él; un líder lanza por permiso", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      const o = c(ANTES, tx);
      await rechaza(resolverNoRequiere(b.admin, { medicionId: mm.medicionId, justificacion: "123456789" }, o), JUSTIFICACION_CORTA);
      await sinPermiso(resolverNoRequiere(b.lider, { medicionId: mm.medicionId, justificacion: NO_REQUIERE }, o));
      expect(await salidasDe(tx, mm.medicionId)).toHaveLength(0);

      await resolverNoRequiere(b.admin, { medicionId: mm.medicionId, justificacion: `  ${NO_REQUIERE}  ` }, o);
      const salidas = await salidasDe(tx, mm.medicionId);
      expect(salidas.map((s) => [s.salida, s.hallazgo_id, s.justificacion, Number(s.decidido_por)])).toEqual([["no_requiere", null, NO_REQUIERE, b.admin.usuarioId]]);
      const bitacora = await tx`SELECT detalle FROM auditoria WHERE accion = 'mejora_marca' AND entidad_id = ${mm.medicionId}`;
      expect(bitacora).toHaveLength(1);
      expect(bitacora[0].detalle).toMatchObject({ indicador: mm.ind.codigo, periodo: "2026-10", salida: "no_requiere" });
      expect(JSON.stringify(bitacora[0].detalle)).not.toContain("obras");
      expect(await estadoEnElPanel(tx, b.admin, mm, ANTES)).toBeNull();
    }));
});

// ─────────────────────────────────────────────────────────────────────────────
// El registro (anexo §6.3)
// ─────────────────────────────────────────────────────────────────────────────

describe("al nacer el hallazgo que cita la medición", () => {
  it("si registra el Admin SGC o el líder del proceso, queda la salida «hallazgo» en su misma transacción", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      for (const s of [b.admin, b.lider]) {
        const mm = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
        const h = await registrarHallazgo(s, queCita(b, mm), c(DESPUES, tx));
        const salidas = await salidasDe(tx, mm.medicionId);
        expect(salidas.map((x) => [x.salida, Number(x.hallazgo_id), Number(x.decidido_por)])).toEqual([["hallazgo", h.id, s.usuarioId]]);
        const [bitacora] = await tx`SELECT detalle FROM auditoria WHERE accion = 'mejora_marca' AND entidad_id = ${mm.medicionId}`;
        expect(bitacora.detalle).toMatchObject({ salida: "hallazgo", hallazgo: h.codigo, alRegistrar: true });
        expect(await estadoEnElPanel(tx, b.admin, mm, DESPUES)).toBeNull();
      }
    }));

  it("también cuando la medición todavía espera su análisis", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, procesoId: b.procesoId });
      expect(await estadoEnElPanel(tx, b.admin, mm, ANTES)).toBe("espera_analisis");
      const h = await registrarHallazgo(b.admin, queCita(b, mm), c(ANTES, tx));
      expect((await salidasDe(tx, mm.medicionId)).map((x) => Number(x.hallazgo_id))).toEqual([h.id]);
    }));

  it("si registra Control Interno, no queda salida: el pendiente sigue, con ese hallazgo como primer candidato", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      const h = await registrarHallazgo(b.control, queCita(b, mm), c(DESPUES, tx));
      expect(await salidasDe(tx, mm.medicionId)).toHaveLength(0);
      const panel = await marcasDelIndicador(b.admin, mm.ind.id, { sql: tx, ahora: new Date(DESPUES) });
      expect(panel?.marcas.find((m) => m.medicionId === mm.medicionId)?.estado).toBe("pendiente");
      expect(panel?.candidatos[0]?.id).toBe(h.id);
    }));
});

describe("el registro desde el panel (marcaMedicionId)", () => {
  it("si la medición ya tiene una salida en vigor, MARCA_YA_DECIDIDA y no nace ningún hallazgo", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      await resolverNoRequiere(b.admin, { medicionId: mm.medicionId, justificacion: NO_REQUIERE }, c(ANTES, tx));
      await rechaza(registrarHallazgo(b.admin, queCita(b, mm, { marcaMedicionId: mm.medicionId }), c(DESPUES, tx)), MARCA_YA_DECIDIDA);
      expect(await tx`SELECT 1 FROM mejora_hallazgos WHERE medicion_id = ${mm.medicionId}`).toHaveLength(0);
      // Sin venir del panel es un hallazgo más, sin rechazo y sin otra salida.
      const h = await registrarHallazgo(b.admin, queCita(b, mm), c(DESPUES, tx));
      expect((await tx`SELECT id FROM mejora_hallazgos WHERE medicion_id = ${mm.medicionId}`).map((f) => Number(f.id))).toEqual([h.id]);
      expect(await salidasDe(tx, mm.medicionId)).toHaveLength(1);
      // Control Interno no llega desde el panel: un `marcaMedicionId` forzado se ignora, sin decir que hay una decisión.
      await registrarHallazgo(b.control, queCita(b, mm, { marcaMedicionId: mm.medicionId }), c(DESPUES, tx));
      expect(await salidasDe(tx, mm.medicionId)).toHaveLength(1);
    }));

  it("si la marca desapareció (un recálculo), el hallazgo nace citando la medición y no se escribe ninguna salida", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      await reportar(mm.mide, { medicionId: mm.medicionId, valores: { A: "95", B: "100" }, parcial: false, confirmado: true }, { sql: tx, ahora: new Date(ANTES) });
      const h = await registrarHallazgo(b.admin, queCita(b, mm, { marcaMedicionId: mm.medicionId }), c(DESPUES, tx));
      const [fila] = await tx`SELECT indicador_id, medicion_id FROM mejora_hallazgos WHERE id = ${h.id}`;
      expect([Number(fila.indicador_id), Number(fila.medicion_id)]).toEqual([mm.ind.id, mm.medicionId]);
      expect(await salidasDe(tx, mm.medicionId)).toHaveLength(0);
    }));

  it("lo fijo sale de la base: la medición y su indicador; el subproceso del indicador llega si el proceso es el suyo", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const [sub] = await tx`INSERT INTO subprocesos (proceso_id, nombre, slug, orden) VALUES (${b.procesoId}, 'Consulta externa', ${`zz-sub-${Date.now()}`}, 1) RETURNING id`;
      const mm = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId, indicador: { subprocesoId: Number(sub.id) } });
      const otra = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      // Un envío forzado con otra medición y otro indicador: manda la del panel.
      const h = await registrarHallazgo(
        b.admin,
        queCita(b, mm, { marcaMedicionId: mm.medicionId, medicionId: otra.medicionId, indicadorId: otra.ind.id }),
        c(DESPUES, tx),
      );
      const [fila] = await tx`SELECT indicador_id, medicion_id, subproceso_id FROM mejora_hallazgos WHERE id = ${h.id}`;
      expect([Number(fila.indicador_id), Number(fila.medicion_id), Number(fila.subproceso_id)]).toEqual([mm.ind.id, mm.medicionId, Number(sub.id)]);
      expect((await salidasDe(tx, mm.medicionId)).map((x) => Number(x.hallazgo_id))).toEqual([h.id]);
      expect(await salidasDe(tx, otra.medicionId)).toHaveLength(0);

      // Con otro proceso elegido, sin el subproceso del indicador.
      const tercera = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId, indicador: { subprocesoId: Number(sub.id) } });
      const otroProceso = await procesoNuevo(tx);
      const h2 = await registrarHallazgo(b.admin, queCita(b, tercera, { procesoId: otroProceso, marcaMedicionId: tercera.medicionId }), c(DESPUES, tx));
      const [fila2] = await tx`SELECT proceso_id, subproceso_id FROM mejora_hallazgos WHERE id = ${h2.id}`;
      expect([Number(fila2.proceso_id), fila2.subproceso_id]).toEqual([otroProceso, null]);
    }));
});

describe("la salida en vigor", () => {
  it("con la salida «hallazgo» y ese hallazgo anulado, la medición vuelve a ser un pendiente y admite otra salida: dos filas", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      const h = await registrarHallazgo(b.admin, queCita(b, mm), c(DESPUES, tx));
      expect(await estadoEnElPanel(tx, b.admin, mm, DESPUES)).toBeNull();
      await anularHallazgo(b.admin, { hallazgoId: h.id, justificacion: "Se registró sobre la medición equivocada" }, c(DESPUES, tx));
      expect(await estadoEnElPanel(tx, b.admin, mm, DESPUES)).toBe("pendiente");
      await resolverNoRequiere(b.admin, { medicionId: mm.medicionId, justificacion: NO_REQUIERE }, c(DESPUES, tx));
      expect((await salidasDe(tx, mm.medicionId)).map((s) => s.salida)).toEqual(["hallazgo", "no_requiere"]);
    }));

  it("con ese hallazgo rechazado y retirado, también", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      const h = await registrarHallazgo(b.admin, queCita(b, mm), c(DESPUES, tx));
      await rechazarHallazgo(b.lider, { hallazgoId: h.id, justificacion: "El hecho no corresponde a este proceso" }, c(DESPUES, tx));
      expect(await estadoEnElPanel(tx, b.admin, mm, DESPUES)).toBeNull();
      await retirarHallazgo(b.admin, { hallazgoId: h.id }, c(DESPUES, tx));
      expect(await estadoEnElPanel(tx, b.admin, mm, DESPUES)).toBe("pendiente");
    }));

  it("con el hallazgo cerrado, no vuelve (la salida hacia el cerrado, por SQL)", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      const cerrado = await hallazgoEn(tx, b, "cerrado", { indicadorId: mm.ind.id, medicionId: mm.medicionId, origen: "indicador" });
      expect(await estadoEnElPanel(tx, b.admin, mm, DESPUES)).toBe("pendiente");
      await tx`INSERT INTO mejora_marcas (medicion_id, indicador_id, salida, hallazgo_id, decidido_por, decidido_en)
        VALUES (${mm.medicionId}, ${mm.ind.id}, 'hallazgo', ${cerrado.id}, ${b.admin.usuarioId}, ${new Date(DESPUES)})`;
      expect(await estadoEnElPanel(tx, b.admin, mm, DESPUES)).toBeNull();
      await rechaza(resolverNoRequiere(b.admin, { medicionId: mm.medicionId, justificacion: NO_REQUIERE }, c(DESPUES, tx)), MARCA_YA_DECIDIDA);
    }));
});

// ─────────────────────────────────────────────────────────────────────────────
// Dos decisiones sobre la misma medición y el candado (Review Focus 2)
// ─────────────────────────────────────────────────────────────────────────────

const CANDADO = /^SELECT pg_advisory_xact_lock\(hashtext\('sgc\.mejora\.marca'\), \?::int\)$/;

describe("dos decisiones sobre la misma medición", () => {
  it("después de «No requiere», la ocurrencia recibe MARCA_YA_DECIDIDA y queda una fila", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      const h = await deControl(tx, b, mm.ind.id);
      await resolverNoRequiere(b.admin, { medicionId: mm.medicionId, justificacion: NO_REQUIERE }, c(DESPUES, tx));
      await rechaza(resolverConOcurrencia(b.lider, { medicionId: mm.medicionId, hallazgoId: h.id }, c(DESPUES, tx)), MARCA_YA_DECIDIDA);
      await rechaza(resolverConOcurrencia(b.admin, { medicionId: mm.medicionId, hallazgoId: h.id }, c(DESPUES, tx)), MARCA_YA_DECIDIDA);
      expect(await salidasDe(tx, mm.medicionId)).toHaveLength(1);
      expect(await tx`SELECT 1 FROM mejora_ocurrencias WHERE hallazgo_id = ${h.id}`).toHaveLength(0);
    }));

  it("la primera sentencia de cada salida es el candado de la medición, y el registro lo toma antes de insertar el hallazgo", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const una = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      const otra = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      const tercera = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      const h = await deControl(tx, b, otra.ind.id);

      const noRequiere = contadaConSuTransaccion(tx);
      await resolverNoRequiere(b.admin, { medicionId: una.medicionId, justificacion: NO_REQUIERE }, c(DESPUES, noRequiere.sql));
      expect(noRequiere.fuera).toEqual([]);
      expect(noRequiere.dentro[0]).toMatch(CANDADO);

      const ocurrencia = contadaConSuTransaccion(tx);
      await resolverConOcurrencia(b.admin, { medicionId: otra.medicionId, hallazgoId: h.id }, c(DESPUES, ocurrencia.sql));
      expect(ocurrencia.fuera).toEqual([]);
      expect(ocurrencia.dentro[0]).toMatch(CANDADO);
      // El hallazgo se bloquea después de la medición.
      expect(ocurrencia.dentro.findIndex((s) => /FROM mejora_hallazgos WHERE id = \? FOR UPDATE/.test(s))).toBeGreaterThan(0);

      // También la que se rechaza toma el candado antes de mirar.
      const rechazada = contadaConSuTransaccion(tx);
      await rechaza(resolverNoRequiere(b.admin, { medicionId: una.medicionId, justificacion: NO_REQUIERE }, c(DESPUES, rechazada.sql)), MARCA_YA_DECIDIDA);
      expect(rechazada.fuera).toEqual([]);
      expect(rechazada.dentro[0]).toMatch(CANDADO);

      const registro = contadaConSuTransaccion(tx);
      await registrarHallazgo(b.admin, queCita(b, tercera, { marcaMedicionId: tercera.medicionId }), c(DESPUES, registro.sql));
      expect(registro.fuera).toEqual([]);
      const candado = registro.dentro.findIndex((s) => CANDADO.test(s));
      const consecutivo = registro.dentro.findIndex((s) => s.includes("INSERT INTO mejora_consecutivos"));
      const insercion = registro.dentro.findIndex((s) => s.includes("INSERT INTO mejora_hallazgos"));
      expect(candado).toBeGreaterThanOrEqual(0);
      expect(candado).toBeLessThan(consecutivo);
      expect(consecutivo).toBeLessThan(insercion);
      // Antes del candado, solo el del plan (que sin plan no corre): ninguna lectura que decida.
      expect(registro.dentro.slice(0, candado).filter((s) => !/mejora_planes/.test(s))).toEqual([]);
    }));
});

describe("el registro bloquea toda medición que llega (Review Focus 2 y 5)", () => {
  it("con un marcaMedicionId que no se atiende y otra medición elegida, bloquea las dos y la salida va a la elegida", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      // Una marca de otro proceso, restringida: el líder no la ve, así que el panel no se le atiende.
      const ajena = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: otro.procesoId, indicador: { nivelAcceso: "restringido" } });
      const propia = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      const registro = contadaConSuTransaccion(tx);
      const h = await registrarHallazgo(b.lider, queCita(b, propia, { marcaMedicionId: ajena.medicionId }), c(DESPUES, registro.sql));
      const candados = registro.dentro.flatMap((s, i) => (CANDADO.test(s) ? [i] : []));
      const insercion = registro.dentro.findIndex((s) => s.includes("INSERT INTO mejora_hallazgos"));
      expect(candados).toHaveLength(2);
      expect(Math.max(...candados)).toBeLessThan(insercion);
      expect(registro.dentro.slice(0, candados[0]).filter((s) => !/mejora_planes/.test(s))).toEqual([]);
      const [fila] = await tx`SELECT indicador_id, medicion_id FROM mejora_hallazgos WHERE id = ${h.id}`;
      expect([Number(fila.indicador_id), Number(fila.medicion_id)]).toEqual([propia.ind.id, propia.medicionId]);
      expect((await salidasDe(tx, propia.medicionId)).map((x) => Number(x.hallazgo_id))).toEqual([h.id]);
      expect(await salidasDe(tx, ajena.medicionId)).toHaveLength(0);
    }));

  it("toma el candado de la medición antes del FOR KEY SHARE del hallazgo de origen", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      const origen = await deControl(tx, b, mm.ind.id);
      const registro = contadaConSuTransaccion(tx);
      await registrarHallazgo(b.admin, queCita(b, mm, { derivadoDe: origen.id }), c(DESPUES, registro.sql));
      const candado = registro.dentro.findIndex((s) => CANDADO.test(s));
      const deOrigen = registro.dentro.findIndex((s) => /FROM mejora_hallazgos WHERE id = \? FOR KEY SHARE/.test(s));
      expect(candado).toBeGreaterThanOrEqual(0);
      expect(deOrigen).toBeGreaterThan(candado);
    }));
});

describe("la carga de un hallazgo ya en curso que cita una medición marcada (anexo §6.3; spec 15 §15)", () => {
  it("deja la salida «hallazgo» en su transacción, con el candado de la medición después del plan y antes de leer; el pendiente y su tarea desaparecen", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      expect(await estadoEnElPanel(tx, b.admin, mm, DESPUES)).toBe("pendiente");
      expect((await tareasDeMarcas(tx, b.admin, new Date(DESPUES))).map((t) => t.tarea.id)).toContain(`mej-marca:${mm.medicionId}`);

      const carga = contadaConSuTransaccion(tx);
      const h = await cargarHallazgo(
        b.admin,
        datosDeCarga(b.procesoId, b.lider.usuarioId, { origen: "indicador", fuente: null, indicadorId: mm.ind.id, medicionId: mm.medicionId }),
        c(DESPUES, carga.sql),
      );
      expect(carga.fuera).toEqual([]);
      // Sin plan, el candado es la primera sentencia: antes del FOR SHARE de los responsables, del consecutivo y del hallazgo.
      expect(carga.dentro[0]).toMatch(CANDADO);
      const responsables = carga.dentro.findIndex((s) => s.includes("FROM usuarios WHERE activo AND id = ANY(?) FOR SHARE"));
      const insercion = carga.dentro.findIndex((s) => s.includes("INSERT INTO mejora_hallazgos"));
      expect(responsables).toBeGreaterThan(0);
      expect(insercion).toBeGreaterThan(responsables);

      const salidas = await salidasDe(tx, mm.medicionId);
      expect(salidas.map((s) => [s.salida, Number(s.hallazgo_id), Number(s.decidido_por)])).toEqual([["hallazgo", h.id, b.admin.usuarioId]]);
      expect(await estadoEnElPanel(tx, b.admin, mm, DESPUES)).toBeNull();
      expect((await tareasDeMarcas(tx, b.admin, new Date(DESPUES))).map((t) => t.tarea.id)).not.toContain(`mej-marca:${mm.medicionId}`);
    }));

  it("con una salida en vigor es un hallazgo más: sin rechazo y sin otra salida, aunque traiga el marcaMedicionId del panel", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      await resolverNoRequiere(b.admin, { medicionId: mm.medicionId, justificacion: NO_REQUIERE }, c(DESPUES, tx));
      await cargarHallazgo(
        b.admin,
        datosDeCarga(b.procesoId, b.lider.usuarioId, {
          origen: "indicador",
          fuente: null,
          indicadorId: mm.ind.id,
          medicionId: mm.medicionId,
          marcaMedicionId: mm.medicionId,
        }),
        c(DESPUES, tx),
      );
      expect((await salidasDe(tx, mm.medicionId)).map((s) => s.salida)).toEqual(["no_requiere"]);
    }));
});

// ─────────────────────────────────────────────────────────────────────────────
// Lo que se ve de una salida (anexo §6.5)
// ─────────────────────────────────────────────────────────────────────────────

describe("salidasVisibles", () => {
  it("«Hallazgo HZ-…» con su enlace a quien ve el hallazgo; quien no, no recibe esa medición; «No requiere» a todo el que ve el indicador", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const conHallazgo = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      const h = await registrarHallazgo(b.admin, queCita(b, conHallazgo), c(DESPUES, tx));
      const sinAccion = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      await resolverNoRequiere(b.admin, { medicionId: sinAccion.medicionId, justificacion: NO_REQUIERE }, c(DESPUES, tx));
      const o = { sql: tx };

      expect(await salidasVisibles(b.lider, conHallazgo.ind.id, o)).toEqual(
        new Map([[conHallazgo.medicionId, { texto: `Hallazgo ${h.codigo}`, enlace: rutaDeHallazgo(h.id), justificacion: null, por: b.admin.nombre, en: new Date(DESPUES) }]]),
      );
      // Consulta ve el indicador, no el hallazgo: la medición no está.
      expect((await salidasVisibles(b.consulta, conHallazgo.ind.id, o)).size).toBe(0);
      expect((await salidasVisibles(otro.lider, conHallazgo.ind.id, o)).size).toBe(0);

      const noRequiere = new Map([
        [sinAccion.medicionId, { texto: "No requiere acción de mejora", enlace: null, justificacion: NO_REQUIERE, por: b.admin.nombre, en: new Date(DESPUES) }],
      ]);
      for (const s of [b.consulta, b.lider, otro.lider]) expect(await salidasVisibles(s, sinAccion.ind.id, o)).toEqual(noRequiere);
      // Anulado el hallazgo, su salida ya no está en vigor: no se muestra.
      await anularHallazgo(b.admin, { hallazgoId: h.id, justificacion: "Se registró sobre la medición equivocada" }, c(DESPUES, tx));
      expect((await salidasVisibles(b.admin, conHallazgo.ind.id, o)).size).toBe(0);
    }));

  it("a quien no ve el indicador, nada", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: otro.procesoId, indicador: { nivelAcceso: "restringido" } });
      await resolverNoRequiere(b.admin, { medicionId: mm.medicionId, justificacion: NO_REQUIERE }, c(DESPUES, tx));
      expect((await salidasVisibles(b.lider, mm.ind.id, { sql: tx })).size).toBe(0);
      expect((await salidasVisibles(otro.lider, mm.ind.id, { sql: tx })).size).toBe(1);
    }));
});
