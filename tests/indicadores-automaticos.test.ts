/**
 * La ficha de fuente automática en el servidor (Fase 14B, Tarea 3; anexo 14B §5.3): el registro fija la forma, la
 * fórmula, las variables y la tendencia; no se piden la prueba ni un cargo de medir; a lo sumo una ficha activa por
 * cálculo y alcance; un cálculo que no se llena hacia atrás empieza en el periodo en curso; nadie la mide ni lleva
 * soporte; «Crear a partir de este» nace manual. Contra la BD de desarrollo, dentro de una transacción que se revierte:
 * ninguna ficha aprobada queda confirmada.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { aprobarFichas, enviarAAprobacion, previaDeEnvio } from "@/db/consultas/indicadores/aprobacion";
import { abrirCambio, crearIndicador, fichaParaEditar, guardarBorrador } from "@/db/consultas/indicadores/fichas";
import { asegurarMediciones, reportar, versionesAprobadas } from "@/db/consultas/indicadores/mediciones";
import { cambiarOperacion, designar, duplicar } from "@/db/consultas/indicadores/operacion";
import { esCalculoRepetido, yaHayUnaActiva } from "@/db/consultas/indicadores/publicacion";
import { EsquemaFicha, type DatosFicha } from "@/lib/esquemas/indicadores";
import type { AlcanceDeCalculo, ClaveDeCalculo } from "@/lib/indicadores/calculos/registro";
import { describirEvento } from "@/lib/bitacora-detalle";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { indicadorDePrueba, liberarCalculo } from "./utiles/indicadores";
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

/** Hoy, a efectos de la prueba: noviembre de 2026 está en curso. */
const AHORA = new Date("2026-11-14T15:00:00Z");
const CLAVE = { clave: "ok" };
const firmar = (tx: TransactionSql) => ({ sql: tx, ahora: AHORA, verificar: firmaDePrueba });
const RANGOS_90 = JSON.stringify({ bien: [{ signo: ">=", valor: "90" }], atencion: [{ signo: ">=", valor: "63" }], critico: [{ signo: "<", valor: "63" }] });

type Base = { admin: SesionFlujo; gerente: SesionFlujo; sgc: number; tipoId: number; estrategico: number; porcentaje: number; cargoId: number };

async function base(tx: TransactionSql): Promise<Base> {
  const [p] = await tx`SELECT id FROM procesos WHERE sigla = 'SGC'`;
  const [t] = await tx`SELECT id FROM tipos_indicador WHERE nombre = 'Eficacia'`;
  const [es] = await tx`SELECT id FROM clasificaciones_indicador WHERE nombre = 'Estratégico'`;
  const [u] = await tx`SELECT id FROM unidades_indicador WHERE nombre = 'Porcentaje'`;
  const [area] = await tx`SELECT id FROM areas ORDER BY id LIMIT 1`;
  const [c] = await tx`INSERT INTO cargos (nombre, area_id) VALUES (${`ZZ Cargo ${unico()}`}, ${area.id}) RETURNING id`;
  return {
    admin: await sesionAdmin(tx),
    gerente: await usuarioDePrueba(tx, { rol: "gerencia" }),
    sgc: Number(p.id),
    tipoId: Number(t.id),
    estrategico: Number(es.id),
    porcentaje: Number(u.id),
    cargoId: Number(c.id),
  };
}

/** Un proceso que solo existe en la transacción. */
async function procesoNuevo(tx: TransactionSql): Promise<number> {
  const sigla = `Z${unico()}`;
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${`Proceso ${sigla}`}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id`;
  return Number(p.id);
}

/** Una ficha manual mensual desde enero de 2026, ya probada; la aprueba Gerencia (estratégica). */
const manual = (b: Base, parcial: Partial<DatosFicha> = {}): DatosFicha => ({
  procesoId: b.sgc,
  nombre: "Cumplimiento del plan de capacitación",
  proposito: "Saber si se ejecutan las capacitaciones programadas",
  tipoId: b.tipoId,
  clasificacionId: b.estrategico,
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

/** La misma ficha, de fuente automática: sin prueba ni cargo de medir. */
const automatica = (b: Base, calculo: string, alcance: string, parcial: Partial<DatosFicha> = {}): DatosFicha =>
  manual(b, { origenDato: "automatico", calculo, calculoAlcance: alcance, cargosMedir: [], prueba: undefined, ...parcial });

/** Sin meta ni rangos: los cálculos de «menos es mejor» no usan los rangos de la ficha base. */
const SIN_META: Partial<DatosFicha> = { meta: undefined, semaforoModo: undefined, rangos: undefined };

async function rechaza(promesa: Promise<unknown>, mensaje: string) {
  const err = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ErrorIndicador);
  expect((err as Error).message).toBe(mensaje);
}

/** Crea y envía; queda por aprobar. */
async function enviada(tx: TransactionSql, b: Base, d: DatosFicha) {
  const creado = await crearIndicador(b.admin, d, { sql: tx, ahora: AHORA });
  await enviarAAprobacion(b.admin, { versionId: creado.versionId, credenciales: CLAVE }, firmar(tx));
  return creado;
}

/** Crea, envía y aprueba con Gerencia: la versión 1 aprobada y el indicador activo. */
async function aprobada(tx: TransactionSql, b: Base, d: DatosFicha) {
  const creado = await enviada(tx, b, d);
  await aprobarFichas(b.gerente, { versionIds: [creado.versionId], credenciales: CLAVE }, firmar(tx));
  return creado;
}

const versionDe = async (tx: TransactionSql, versionId: number) =>
  (await tx`SELECT estado, tipo_cambio, origen_dato, calculo, calculo_alcance, forma, factor, formula, tendencia, prueba, rige_desde
    FROM indicador_versiones WHERE id = ${versionId}`)[0];

const indicadorDe = async (tx: TransactionSql, indicadorId: number) =>
  (await tx`SELECT estado, calculo, calculo_alcance, inicio_medicion, soporte_obligatorio FROM indicadores WHERE id = ${indicadorId}`)[0];

const variablesDe = (tx: TransactionSql, versionId: number) =>
  tx`SELECT letra, nombre, descripcion, fuente, unidad, consolidacion, origen, captura_min, captura_max, admite_negativos
    FROM indicador_variables WHERE version_id = ${versionId} ORDER BY orden, letra`;

/** Las entradas `indicador_aprobado` del indicador, de la más reciente a la primera. */
const aprobacionEnBitacora = async (tx: TransactionSql, indicadorId: number) =>
  (await tx`SELECT detalle FROM auditoria WHERE accion = 'indicador_aprobado' AND entidad = 'indicador' AND entidad_id = ${indicadorId}
    ORDER BY id DESC`) as unknown as { detalle: Record<string, unknown> }[];

const mideDe = async (tx: TransactionSql, indicadorId: number) =>
  (await tx`SELECT usuario_id FROM indicador_designados WHERE indicador_id = ${indicadorId} AND funcion = 'mide' ORDER BY usuario_id`).map((f) =>
    Number(f.usuario_id),
  );

describe("la ficha automática en el servidor", () => {
  it("una ficha automática toma del registro la forma, las variables y la tendencia", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      await liberarCalculo(tx, "acuses", "entidad");
      const persona = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [b.sgc] });
      // Lo que el formulario mande de forma, fórmula, variables, tendencia, medición y soporte no cuenta: lo pone el registro.
      const { indicadorId, versionId } = await crearIndicador(
        b.admin,
        automatica(b, "acuses", "entidad", {
          forma: "conteo",
          formula: "Z",
          tendencia: "descendente",
          variables: [{ letra: "Z", nombre: "Lo que sea", fuente: "Una planilla", unidad: "casos", consolidacion: "ultimo", capturaMin: "1", admiteNegativos: true }],
          cargosMedir: [b.cargoId],
          mide: [persona.usuarioId],
          analiza: [persona.usuarioId],
          soporteObligatorio: true,
          prueba: { valores: { Z: "3" } },
        }),
        { sql: tx, ahora: AHORA },
      );

      expect(await versionDe(tx, versionId)).toMatchObject({
        origen_dato: "automatico",
        calculo: "acuses",
        calculo_alcance: "entidad",
        forma: "porcentaje",
        factor: null,
        formula: "A / B * 100",
        tendencia: "ascendente",
        prueba: null,
      });
      expect(await variablesDe(tx, versionId)).toEqual([
        {
          letra: "A",
          nombre: "Acuses confirmados",
          descripcion: "Cuenta los acuses de lectura pedidos en el periodo que la persona ya confirmó",
          fuente: "La calcula el sistema",
          unidad: null,
          consolidacion: "suma",
          origen: "automatica",
          captura_min: null,
          captura_max: null,
          admite_negativos: false,
        },
        {
          letra: "B",
          nombre: "Acuses confirmados y pendientes",
          descripcion: "Cuenta los acuses de lectura pedidos en el periodo, confirmados o todavía pendientes",
          fuente: "La calcula el sistema",
          unidad: null,
          consolidacion: "suma",
          origen: "automatica",
          captura_min: null,
          captura_max: null,
          admite_negativos: false,
        },
      ]);
      const responsables = await tx`SELECT funcion FROM indicador_responsables WHERE version_id = ${versionId}`;
      expect(responsables.map((r) => r.funcion)).toEqual(["analizar"]);
      expect(await mideDe(tx, indicadorId)).toEqual([]);
      const [analiza] = await tx`SELECT count(*)::int AS n FROM indicador_designados WHERE indicador_id = ${indicadorId} AND funcion = 'analiza'`;
      expect(analiza.n).toBe(1);
      // El indicador guarda el cálculo de su ficha vigente: un borrador todavía no lo tiene.
      expect(await indicadorDe(tx, indicadorId)).toMatchObject({ estado: "borrador", calculo: null, calculo_alcance: null, soporte_obligatorio: false });
    }));

  it("no exige la prueba ni un cargo de medir; un manual sí", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      await liberarCalculo(tx, "etapas", "entidad");
      const auto = await crearIndicador(b.admin, automatica(b, "etapas", "entidad"), { sql: tx, ahora: AHORA });
      const previa = await previaDeEnvio(b.admin, auto.versionId, { sql: tx, ahora: AHORA });
      expect(previa?.probada).toBe(true);
      await enviarAAprobacion(b.admin, { versionId: auto.versionId, credenciales: CLAVE }, firmar(tx));
      expect((await versionDe(tx, auto.versionId)).estado).toBe("por_aprobar");

      await rechaza(crearIndicador(b.admin, manual(b, { cargosMedir: [] }), { sql: tx }), "Elija al menos un cargo responsable de medir");
      const sinPrueba = await crearIndicador(b.admin, manual(b, { prueba: undefined }), { sql: tx });
      expect((await previaDeEnvio(b.admin, sinPrueba.versionId, { sql: tx, ahora: AHORA }))?.probada).toBe(false);
      await rechaza(
        enviarAAprobacion(b.admin, { versionId: sinPrueba.versionId, credenciales: CLAVE }, firmar(tx)),
        "Pruebe la fórmula con valores de ejemplo antes de enviarla",
      );
    }));

  it("rechaza una clave que no es del registro y un alcance que el cálculo no admite", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      for (const calculo of ["constructor", "__proto__", "otro", ""]) {
        await rechaza(crearIndicador(b.admin, automatica(b, calculo, "entidad"), { sql: tx }), "Elija el cálculo que hace el sistema");
      }
      await rechaza(crearIndicador(b.admin, automatica(b, "conformidad_fecha", "proceso"), { sql: tx }), "Ese cálculo no admite ese alcance");
      await rechaza(crearIndicador(b.admin, automatica(b, "objetivos_cumplidos", "entidad"), { sql: tx }), "Ese cálculo no admite ese alcance");
      await rechaza(crearIndicador(b.admin, automatica(b, "acuses", "constructor"), { sql: tx }), "Ese cálculo no admite ese alcance");
      await rechaza(crearIndicador(b.admin, automatica(b, "acuses", ""), { sql: tx }), "Ese cálculo no admite ese alcance");
      // Una manual no lleva cálculo aunque el formulario lo mande.
      const { versionId } = await crearIndicador(b.admin, manual(b, { calculo: "acuses", calculoAlcance: "entidad" }), { sql: tx });
      expect(await versionDe(tx, versionId)).toMatchObject({ origen_dato: "manual", calculo: null, calculo_alcance: null });
    }));

  it("conformidad a la fecha exige meta", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      await liberarCalculo(tx, "conformidad_fecha", "entidad");
      await liberarCalculo(tx, "conformidad_periodo", "entidad");
      await rechaza(
        crearIndicador(b.admin, automatica(b, "conformidad_fecha", "entidad", SIN_META), { sql: tx }),
        "Este cálculo exige una meta: con ella se juzga la conformidad en Distribución",
      );
      // Los demás no la exigen.
      await crearIndicador(b.admin, automatica(b, "conformidad_periodo", "entidad", SIN_META), { sql: tx });
      const { versionId } = await crearIndicador(b.admin, automatica(b, "conformidad_fecha", "entidad"), { sql: tx });
      expect((await versionDe(tx, versionId)).calculo).toBe("conformidad_fecha");
    }));

  it("guardar el borrador de un automático lo deja automático", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      await liberarCalculo(tx, "externos", "proceso", b.sgc);
      const { versionId, codigo, indicadorId } = await crearIndicador(b.admin, automatica(b, "externos", "proceso"), { sql: tx, ahora: AHORA });
      // Lo que el formulario vuelve a enviar trae el origen, el cálculo y el alcance.
      const ficha = await fichaParaEditar(b.admin, codigo, { sql: tx });
      expect(ficha!.valores).toMatchObject({ origenDato: "automatico", calculo: "externos", calculoAlcance: "proceso", cargosMedir: [] });
      await guardarBorrador(b.admin, versionId, EsquemaFicha.parse(ficha!.valores), { sql: tx, ahora: AHORA });
      expect(await versionDe(tx, versionId)).toMatchObject({ origen_dato: "automatico", calculo: "externos", calculo_alcance: "proceso" });
      expect((await variablesDe(tx, versionId)).map((v) => v.origen)).toEqual(["automatica", "automatica"]);

      // El cambio de una ficha aprobada también: guardado sin tocar nada sigue siendo automático y menor.
      await enviarAAprobacion(b.admin, { versionId, credenciales: CLAVE }, firmar(tx));
      await aprobarFichas(b.gerente, { versionIds: [versionId], credenciales: CLAVE }, firmar(tx));
      const cambio = await abrirCambio(b.admin, indicadorId, { sql: tx, ahora: AHORA });
      const deCambio = await fichaParaEditar(b.admin, codigo, { sql: tx });
      await guardarBorrador(b.admin, cambio.versionId, EsquemaFicha.parse({ ...deCambio!.valores, nombre: "Externos al día" }), { sql: tx, ahora: AHORA });
      expect(await versionDe(tx, cambio.versionId)).toMatchObject({ origen_dato: "automatico", calculo: "externos", tipo_cambio: "menor" });
      expect((await variablesDe(tx, cambio.versionId)).map((v) => v.origen)).toEqual(["automatica", "automatica"]);

      // Y volver a manual deja la versión sin cálculo y sus variables propias.
      await guardarBorrador(b.admin, cambio.versionId, manual(b, { codigo, motivoCambio: "Lo vuelve a digitar una persona" }), { sql: tx, ahora: AHORA });
      expect(await versionDe(tx, cambio.versionId)).toMatchObject({ origen_dato: "manual", calculo: null, calculo_alcance: null, tipo_cambio: "mayor" });
      expect((await variablesDe(tx, cambio.versionId)).map((v) => v.origen)).toEqual(["propia", "propia"]);

      // Publicada, el indicador ya no guarda el cálculo: otra ficha puede tomar ese cálculo y alcance.
      await enviarAAprobacion(b.admin, { versionId: cambio.versionId, credenciales: CLAVE }, firmar(tx));
      await aprobarFichas(b.gerente, { versionIds: [cambio.versionId], credenciales: CLAVE }, firmar(tx));
      expect(await indicadorDe(tx, indicadorId)).toMatchObject({ estado: "activo", calculo: null, calculo_alcance: null });
      const relevo = await enviada(tx, b, automatica(b, "externos", "proceso"));
      expect((await versionDe(tx, relevo.versionId)).estado).toBe("por_aprobar");
    }));

  it("a lo sumo una ficha activa por cálculo y alcance", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      await liberarCalculo(tx, "etapas", "entidad");
      await liberarCalculo(tx, "aprobacion", "entidad");
      await liberarCalculo(tx, "etapas", "proceso", b.sgc);
      const primera = await aprobada(tx, b, automatica(b, "etapas", "entidad"));
      expect(await indicadorDe(tx, primera.indicadorId)).toMatchObject({ estado: "activo", calculo: "etapas", calculo_alcance: "entidad" });

      const otra = await crearIndicador(b.admin, automatica(b, "etapas", "entidad"), { sql: tx, ahora: AHORA });
      await rechaza(
        enviarAAprobacion(b.admin, { versionId: otra.versionId, credenciales: CLAVE }, firmar(tx)),
        `Ya hay una ficha activa para ese cálculo y alcance: ${primera.codigo}`,
      );

      // Enviadas cuando no había otra activa: la segunda no se aprueba después de la primera.
      const a = await enviada(tx, b, automatica(b, "aprobacion", "entidad", SIN_META));
      const segunda = await enviada(tx, b, automatica(b, "aprobacion", "entidad", SIN_META));
      await aprobarFichas(b.gerente, { versionIds: [a.versionId], credenciales: CLAVE }, firmar(tx));
      await rechaza(
        aprobarFichas(b.gerente, { versionIds: [segunda.versionId], credenciales: CLAVE }, firmar(tx)),
        `Ya hay una ficha activa para ese cálculo y alcance: ${a.codigo}`,
      );
      expect((await versionDe(tx, segunda.versionId)).estado).toBe("por_aprobar");

      // Con alcance «proceso», una por proceso: en dos procesos distintos, las dos.
      const otroProceso = await procesoNuevo(tx);
      const enSgc = await aprobada(tx, b, automatica(b, "etapas", "proceso"));
      const enOtro = await aprobada(tx, b, automatica(b, "etapas", "proceso", { procesoId: otroProceso }));
      expect(await indicadorDe(tx, enSgc.indicadorId)).toMatchObject({ estado: "activo", calculo: "etapas", calculo_alcance: "proceso" });
      expect(await indicadorDe(tx, enOtro.indicadorId)).toMatchObject({ estado: "activo", calculo: "etapas", calculo_alcance: "proceso" });
      const repetida = await crearIndicador(b.admin, automatica(b, "etapas", "proceso", { procesoId: otroProceso }), { sql: tx, ahora: AHORA });
      await rechaza(
        enviarAAprobacion(b.admin, { versionId: repetida.versionId, credenciales: CLAVE }, firmar(tx)),
        `Ya hay una ficha activa para ese cálculo y alcance: ${enOtro.codigo}`,
      );
    }));

  it("dos fichas del mismo cálculo aprobadas en el mismo bloque: no se aprueba ninguna y el mensaje es legible", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      await liberarCalculo(tx, "vencidos", "entidad");
      await liberarCalculo(tx, "vencidos", "proceso", b.sgc);
      const a = await enviada(tx, b, automatica(b, "vencidos", "entidad", SIN_META));
      const c = await enviada(tx, b, automatica(b, "vencidos", "entidad", SIN_META));
      await rechaza(
        aprobarFichas(b.gerente, { versionIds: [c.versionId, a.versionId], credenciales: CLAVE }, firmar(tx)),
        `Las fichas ${a.codigo} y ${c.codigo} usan el mismo cálculo y alcance: solo una puede quedar activa`,
      );
      expect((await versionDe(tx, a.versionId)).estado).toBe("por_aprobar");
      expect((await versionDe(tx, c.versionId)).estado).toBe("por_aprobar");
      expect(await indicadorDe(tx, a.indicadorId)).toMatchObject({ estado: "borrador", calculo: null });

      // El mismo cálculo con alcance «proceso» en dos procesos sí cabe en un bloque.
      const otroProceso = await procesoNuevo(tx);
      const x = await enviada(tx, b, automatica(b, "vencidos", "proceso", SIN_META));
      const y = await enviada(tx, b, automatica(b, "vencidos", "proceso", { ...SIN_META, procesoId: otroProceso }));
      expect(await aprobarFichas(b.gerente, { versionIds: [x.versionId, y.versionId], credenciales: CLAVE }, firmar(tx))).toEqual({ aprobadas: 2 });
    }));

  it("un cálculo que no se llena hacia atrás empieza en el periodo en curso al aprobarse", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      await liberarCalculo(tx, "dentro_plazo", "entidad");
      const { indicadorId, versionId } = await aprobada(tx, b, automatica(b, "dentro_plazo", "entidad", { inicioMedicion: "2026-01" }));
      expect(await indicadorDe(tx, indicadorId)).toMatchObject({ estado: "activo", inicio_medicion: "2026-11", calculo: "dentro_plazo" });
      expect((await versionDe(tx, versionId)).rige_desde).toBe("2026-11");
      const [m] = await tx`SELECT count(*)::int AS n FROM mediciones WHERE indicador_id = ${indicadorId}`;
      expect(m.n).toBe(0);
      // La aprobación movió un dato de operación: la bitácora lo dice.
      const [aprobado] = await aprobacionEnBitacora(tx, indicadorId);
      expect(aprobado.detalle.inicioMedicion).toEqual({ antes: "2026-01", despues: "2026-11" });
      expect(aprobado.detalle).not.toHaveProperty("soporteApagado");
      expect(describirEvento({ accion: "indicador_aprobado", entidad: "indicador", entidadId: indicadorId, detalle: aprobado.detalle })).toMatch(
        /\(versión 1\)\. El inicio de medición pasó de enero de 2026 a noviembre de 2026\.$/,
      );
    }));

  it("el periodo en curso es el de la aprobación, no el del envío", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      await liberarCalculo(tx, "dentro_plazo", "entidad");
      await liberarCalculo(tx, "acuses", "entidad");
      const diciembre = { sql: tx, ahora: new Date("2026-12-03T15:00:00Z"), verificar: firmaDePrueba };
      // Una ficha nueva enviada en noviembre y aprobada en diciembre empieza en diciembre.
      const nueva = await enviada(tx, b, automatica(b, "dentro_plazo", "entidad"));
      expect((await versionDe(tx, nueva.versionId)).rige_desde).toBe("2026-11");
      await aprobarFichas(b.gerente, { versionIds: [nueva.versionId], credenciales: CLAVE }, diciembre);
      expect(await indicadorDe(tx, nueva.indicadorId)).toMatchObject({ estado: "activo", inicio_medicion: "2026-12" });
      expect((await versionDe(tx, nueva.versionId)).rige_desde).toBe("2026-12");
      const [m] = await tx`SELECT count(*)::int AS n FROM mediciones WHERE indicador_id = ${nueva.indicadorId}`;
      expect(m.n).toBe(0);

      // Un cambio mayor que se envió para regir desde noviembre ya no puede hacerlo en diciembre: se devuelve.
      const { indicadorId, codigo } = await aprobada(tx, b, manual(b));
      const { versionId } = await abrirCambio(b.admin, indicadorId, { sql: tx, ahora: AHORA });
      await guardarBorrador(b.admin, versionId, automatica(b, "acuses", "entidad", { codigo, motivoCambio: "Lo calcula el sistema" }), {
        sql: tx,
        ahora: AHORA,
      });
      await enviarAAprobacion(b.admin, { versionId, credenciales: CLAVE }, firmar(tx));
      await rechaza(
        aprobarFichas(b.gerente, { versionIds: [versionId], credenciales: CLAVE }, diciembre),
        `La ficha ${codigo} ya no puede regir desde noviembre de 2026: devuélvala para que elijan otro periodo`,
      );
      expect((await versionDe(tx, versionId)).estado).toBe("por_aprobar");
    }));

  it("uno que se llena hacia atrás conserva su inicio y abre sus históricos", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      await liberarCalculo(tx, "etapas", "entidad");
      const { indicadorId, versionId } = await aprobada(tx, b, automatica(b, "etapas", "entidad", { inicioMedicion: "2026-08" }));
      expect(await indicadorDe(tx, indicadorId)).toMatchObject({ estado: "activo", inicio_medicion: "2026-08" });
      expect((await versionDe(tx, versionId)).rige_desde).toBe("2026-08");
      // Sin datos de operación movidos, la bitácora no inventa ninguno.
      const [aprobado] = await aprobacionEnBitacora(tx, indicadorId);
      expect(aprobado.detalle).not.toHaveProperty("inicioMedicion");
      expect(aprobado.detalle).not.toHaveProperty("soporteApagado");
      const mediciones = await tx`SELECT periodo, historica FROM mediciones WHERE indicador_id = ${indicadorId} ORDER BY desde`;
      expect(mediciones).toEqual([
        { periodo: "2026-08", historica: true },
        { periodo: "2026-09", historica: true },
        { periodo: "2026-10", historica: true },
      ]);
    }));

  it("pasar de manual a un cálculo que no se llena hacia atrás rige desde el periodo en curso", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      await liberarCalculo(tx, "acuses", "entidad");
      const { indicadorId, codigo } = await aprobada(tx, b, manual(b));
      const { versionId } = await abrirCambio(b.admin, indicadorId, { sql: tx, ahora: AHORA });
      await guardarBorrador(b.admin, versionId, automatica(b, "acuses", "entidad", { codigo, motivoCambio: "Lo calcula el sistema" }), {
        sql: tx,
        ahora: AHORA,
      });
      expect((await versionDe(tx, versionId)).tipo_cambio).toBe("mayor");
      // El diálogo de envío solo ofrece el periodo en curso.
      expect((await previaDeEnvio(b.admin, versionId, { sql: tx, ahora: AHORA }))?.rige).toEqual({
        porOmision: "2026-11",
        opciones: [{ clave: "2026-11", etiqueta: "Noviembre de 2026" }],
      });
      await rechaza(
        enviarAAprobacion(b.admin, { versionId, rigeDesde: "2026-10", credenciales: CLAVE }, firmar(tx)),
        "Un cálculo que no se llena hacia atrás rige desde el periodo en curso",
      );
      // Sin elegir, rige desde el periodo en curso.
      await enviarAAprobacion(b.admin, { versionId, credenciales: CLAVE }, firmar(tx));
      expect(await versionDe(tx, versionId)).toMatchObject({ estado: "por_aprobar", rige_desde: "2026-11" });
      await aprobarFichas(b.gerente, { versionIds: [versionId], credenciales: CLAVE }, firmar(tx));
      expect(await versionDe(tx, versionId)).toMatchObject({ estado: "aprobada", rige_desde: "2026-11", origen_dato: "automatico" });
      expect(await indicadorDe(tx, indicadorId)).toMatchObject({ calculo: "acuses", calculo_alcance: "entidad", inicio_medicion: "2026-01" });
      // Las mediciones anteriores conservan su versión manual.
      const [vieja] = await tx`SELECT v.origen_dato FROM mediciones m JOIN indicador_versiones v ON v.id = m.version_id
        WHERE m.indicador_id = ${indicadorId} AND m.periodo = '2026-10'`;
      expect(vieja.origen_dato).toBe("manual");
      // La versión que calcula sabe de dónde sale el dato.
      const [nueva, anterior] = await versionesAprobadas(tx, indicadorId);
      expect(nueva).toMatchObject({ origenDato: "automatico", calculoAutomatico: { clave: "acuses", alcance: "entidad" } });
      expect(anterior).toMatchObject({ origenDato: "manual", calculoAutomatico: null });
    }));

  it("al aprobarse quita a quienes miden y lo deja en la bitácora; designar «mide» se rechaza", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      await liberarCalculo(tx, "etapas", "entidad");
      await liberarCalculo(tx, "externos", "entidad");
      const uno = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [b.sgc] });
      const dos = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [b.sgc] });
      const { indicadorId, codigo } = await aprobada(tx, b, manual(b, { mide: [uno.usuarioId, dos.usuarioId], analiza: [uno.usuarioId], soporteObligatorio: true }));
      expect(await mideDe(tx, indicadorId)).toHaveLength(2);

      const { versionId } = await abrirCambio(b.admin, indicadorId, { sql: tx, ahora: AHORA });
      await guardarBorrador(b.admin, versionId, automatica(b, "etapas", "entidad", { codigo, motivoCambio: "Lo calcula el sistema" }), {
        sql: tx,
        ahora: AHORA,
      });
      await enviarAAprobacion(b.admin, { versionId, credenciales: CLAVE }, firmar(tx));
      // Enviar no toca a quienes miden: solo la publicación.
      expect(await mideDe(tx, indicadorId)).toHaveLength(2);
      await aprobarFichas(b.gerente, { versionIds: [versionId], credenciales: CLAVE }, firmar(tx));

      expect(await mideDe(tx, indicadorId)).toEqual([]);
      expect(await indicadorDe(tx, indicadorId)).toMatchObject({ soporte_obligatorio: false, calculo: "etapas" });
      const [analiza] = await tx`SELECT count(*)::int AS n FROM indicador_designados WHERE indicador_id = ${indicadorId} AND funcion = 'analiza'`;
      expect(analiza.n).toBe(1);
      const bitacora = await tx`SELECT usuario_id, detalle FROM auditoria
        WHERE accion = 'indicador_medidores_quitados' AND entidad = 'indicador' AND entidad_id = ${indicadorId}`;
      expect(bitacora.map((f) => ({ usuario: Number(f.usuario_id), detalle: f.detalle }))).toEqual([
        { usuario: b.gerente.usuarioId, detalle: { codigo, cuantos: 2 } },
      ]);

      await rechaza(
        designar(b.admin, { indicadorId, funcion: "mide", usuarioIds: [uno.usuarioId] }, { sql: tx, ahora: AHORA }),
        "Este indicador lo calcula el sistema: nadie lo mide",
      );
      // Analizar y hacer seguimiento, sí.
      await designar(b.admin, { indicadorId, funcion: "seguimiento", usuarioIds: [dos.usuarioId] }, { sql: tx, ahora: AHORA });

      // Sin nadie que quitar, no hay entrada en la bitácora.
      const otra = await aprobada(tx, b, automatica(b, "externos", "entidad"));
      const [ninguna] = await tx`SELECT count(*)::int AS n FROM auditoria
        WHERE accion = 'indicador_medidores_quitados' AND entidad = 'indicador' AND entidad_id = ${otra.indicadorId}`;
      expect(ninguna.n).toBe(0);
    }));

  it("un cambio menor publicado también pasa por la publicación: el cálculo sigue y nadie queda midiendo", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      await liberarCalculo(tx, "externos", "entidad");
      const persona = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [b.sgc] });
      const { indicadorId, codigo } = await aprobada(tx, b, automatica(b, "externos", "entidad"));
      // Un «mide» que quedara de antes de la 14B: la publicación del cambio menor lo quita.
      await tx`INSERT INTO indicador_designados (indicador_id, usuario_id, funcion, creado_por) VALUES (${indicadorId}, ${persona.usuarioId}, 'mide', ${b.admin.usuarioId})`;
      const { versionId } = await abrirCambio(b.admin, indicadorId, { sql: tx, ahora: AHORA });
      const ficha = await fichaParaEditar(b.admin, codigo, { sql: tx });
      await guardarBorrador(b.admin, versionId, EsquemaFicha.parse({ ...ficha!.valores, nombre: "Externos al día", motivoCambio: "Aclarar el nombre" }), {
        sql: tx,
        ahora: AHORA,
      });
      expect(await enviarAAprobacion(b.admin, { versionId, credenciales: CLAVE }, firmar(tx))).toEqual({ codigo, menor: true });
      expect(await versionDe(tx, versionId)).toMatchObject({ estado: "aprobada", tipo_cambio: "menor", calculo: "externos" });
      expect(await indicadorDe(tx, indicadorId)).toMatchObject({ calculo: "externos", calculo_alcance: "entidad" });
      expect(await mideDe(tx, indicadorId)).toEqual([]);
      const [bitacora] = await tx`SELECT usuario_id, detalle FROM auditoria
        WHERE accion = 'indicador_medidores_quitados' AND entidad = 'indicador' AND entidad_id = ${indicadorId}`;
      expect({ usuario: Number(bitacora.usuario_id), detalle: bitacora.detalle }).toEqual({ usuario: b.admin.usuarioId, detalle: { codigo, cuantos: 1 } });
      // Sin soporte que apagar, el cambio menor no dice nada de él.
      const [menor] = await tx`SELECT detalle FROM auditoria WHERE accion = 'indicador_cambio_menor' AND entidad = 'indicador' AND entidad_id = ${indicadorId}`;
      expect(menor.detalle).not.toHaveProperty("soporteApagado");

      // Un soporte obligatorio que quedara de antes de la 14B: el siguiente cambio menor lo apaga y lo dice.
      await tx`UPDATE indicadores SET soporte_obligatorio = true WHERE id = ${indicadorId}`;
      const otro = await abrirCambio(b.admin, indicadorId, { sql: tx, ahora: AHORA });
      const deOtro = await fichaParaEditar(b.admin, codigo, { sql: tx });
      await guardarBorrador(b.admin, otro.versionId, EsquemaFicha.parse({ ...deOtro!.valores, nombre: "Externos verificados al día", motivoCambio: "Otro nombre." }), {
        sql: tx,
        ahora: AHORA,
      });
      await enviarAAprobacion(b.admin, { versionId: otro.versionId, credenciales: CLAVE }, firmar(tx));
      expect((await indicadorDe(tx, indicadorId)).soporte_obligatorio).toBe(false);
      const [ultimo] = await tx`SELECT detalle FROM auditoria WHERE accion = 'indicador_cambio_menor' AND entidad = 'indicador' AND entidad_id = ${indicadorId}
        ORDER BY id DESC LIMIT 1`;
      expect(ultimo.detalle).toMatchObject({ soporteApagado: true, medicionesRecalculadas: 0 });
      expect(describirEvento({ accion: "indicador_cambio_menor", entidad: "indicador", entidadId: indicadorId, detalle: ultimo.detalle })).toBe(
        `Publicó un cambio menor en la ficha de ${codigo} (versión 3): Otro nombre. Se apagó el soporte obligatorio.`,
      );
    }));

  it("«Crear a partir de este» sobre un automático nace manual", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      await liberarCalculo(tx, "acuses", "entidad");
      const persona = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [b.sgc] });
      const origen = await aprobada(tx, b, automatica(b, "acuses", "entidad", { analiza: [persona.usuarioId] }));
      // Un «mide» que quedara de antes tampoco se copia.
      await tx`INSERT INTO indicador_designados (indicador_id, usuario_id, funcion, creado_por) VALUES (${origen.indicadorId}, ${persona.usuarioId}, 'mide', ${b.admin.usuarioId})`;

      const { codigo } = await duplicar(b.admin, { indicadorId: origen.indicadorId, procesoId: b.sgc }, { sql: tx, ahora: AHORA });
      const [copia] = await tx`SELECT i.id, i.calculo, i.calculo_alcance, v.id AS version_id FROM indicadores i
        JOIN indicador_versiones v ON v.indicador_id = i.id WHERE i.codigo = ${codigo}`;
      expect(copia).toMatchObject({ calculo: null, calculo_alcance: null });
      const versionId = Number(copia.version_id);
      expect(await versionDe(tx, versionId)).toMatchObject({ origen_dato: "manual", calculo: null, calculo_alcance: null, estado: "borrador" });
      const variables = await variablesDe(tx, versionId);
      // Sin la fuente del automático («La calcula el sistema»), que en la copia sería falsa.
      expect(variables.map((v) => [v.letra, v.nombre, v.origen, v.fuente])).toEqual([
        ["A", "Acuses confirmados", "propia", null],
        ["B", "Acuses confirmados y pendientes", "propia", null],
      ]);
      expect(await mideDe(tx, Number(copia.id))).toEqual([]);
      const [analiza] = await tx`SELECT count(*)::int AS n FROM indicador_designados WHERE indicador_id = ${copia.id} AND funcion = 'analiza'`;
      expect(analiza.n).toBe(1);
    }));

  it("soporte obligatorio no aplica", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      await liberarCalculo(tx, "etapas", "entidad");
      const { indicadorId } = await aprobada(tx, b, automatica(b, "etapas", "entidad", { inicioMedicion: "2026-08" }));
      const operacion = { indicadorId, plazoReporteDias: 10, inicioMedicion: "2026-08", nivelAcceso: "general" as const };
      await rechaza(
        cambiarOperacion(b.admin, { ...operacion, soporteObligatorio: true }, { sql: tx, ahora: AHORA }),
        "Un indicador que calcula el sistema no lleva soporte",
      );
      // Lo demás de la operación sí cambia.
      await cambiarOperacion(b.admin, { ...operacion, plazoReporteDias: 5, soporteObligatorio: false }, { sql: tx, ahora: AHORA });
      expect(await indicadorDe(tx, indicadorId)).toMatchObject({ soporte_obligatorio: false });
    }));

  it("un cálculo que no se llena hacia atrás no adelanta su inicio de medición; uno que sí, lo adelanta", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      await liberarCalculo(tx, "dentro_plazo", "entidad");
      await liberarCalculo(tx, "etapas", "entidad");
      const operacion = { plazoReporteDias: 10, soporteObligatorio: false, nivelAcceso: "general" as const };
      const estado = await aprobada(tx, b, automatica(b, "dentro_plazo", "entidad"));
      expect((await indicadorDe(tx, estado.indicadorId)).inicio_medicion).toBe("2026-11");
      await rechaza(
        cambiarOperacion(b.admin, { ...operacion, indicadorId: estado.indicadorId, inicioMedicion: "2026-10" }, { sql: tx, ahora: AHORA }),
        "Este cálculo no se llena hacia atrás: su inicio de medición no puede adelantarse",
      );
      // Hacia adelante, con las reglas de siempre; y de vuelta hasta el periodo en que rige, no antes.
      await cambiarOperacion(b.admin, { ...operacion, indicadorId: estado.indicadorId, inicioMedicion: "2026-12" }, { sql: tx, ahora: AHORA });
      expect((await indicadorDe(tx, estado.indicadorId)).inicio_medicion).toBe("2026-12");
      await cambiarOperacion(b.admin, { ...operacion, indicadorId: estado.indicadorId, inicioMedicion: "2026-11" }, { sql: tx, ahora: AHORA });
      expect((await indicadorDe(tx, estado.indicadorId)).inicio_medicion).toBe("2026-11");
      await rechaza(
        cambiarOperacion(b.admin, { ...operacion, indicadorId: estado.indicadorId, inicioMedicion: "2026-10" }, { sql: tx, ahora: AHORA }),
        "Este cálculo no se llena hacia atrás: su inicio de medición no puede adelantarse",
      );

      const flujo = await aprobada(tx, b, automatica(b, "etapas", "entidad", { inicioMedicion: "2026-08" }));
      await cambiarOperacion(b.admin, { ...operacion, indicadorId: flujo.indicadorId, inicioMedicion: "2026-07" }, { sql: tx, ahora: AHORA });
      expect((await indicadorDe(tx, flujo.indicadorId)).inicio_medicion).toBe("2026-07");
    }));

  it("decide la versión que rige el inicio nuevo, no la vigente", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      await liberarCalculo(tx, "acuses", "entidad");
      await liberarCalculo(tx, "dentro_plazo", "entidad");
      const operacion = { plazoReporteDias: 10, soporteObligatorio: false, nivelAcceso: "general" as const };
      const motivo = { motivoCambio: "Cambia de dónde sale el dato" };

      // Manual desde enero y automática (no se llena hacia atrás) desde noviembre: diciembre de 2025 lo rige la manual.
      const deManual = await aprobada(tx, b, manual(b));
      const aAcuses = await abrirCambio(b.admin, deManual.indicadorId, { sql: tx, ahora: AHORA });
      await guardarBorrador(b.admin, aAcuses.versionId, automatica(b, "acuses", "entidad", { codigo: deManual.codigo, ...motivo }), { sql: tx, ahora: AHORA });
      await enviarAAprobacion(b.admin, { versionId: aAcuses.versionId, credenciales: CLAVE }, firmar(tx));
      await aprobarFichas(b.gerente, { versionIds: [aAcuses.versionId], credenciales: CLAVE }, firmar(tx));
      expect(await indicadorDe(tx, deManual.indicadorId)).toMatchObject({ calculo: "acuses", inicio_medicion: "2026-01" });
      await cambiarOperacion(b.admin, { ...operacion, indicadorId: deManual.indicadorId, inicioMedicion: "2025-12" }, { sql: tx, ahora: AHORA });
      expect((await indicadorDe(tx, deManual.indicadorId)).inicio_medicion).toBe("2025-12");

      // Automática desde noviembre y manual desde diciembre: la vigente es manual, pero junio lo regiría la automática.
      const diciembre = { sql: tx, ahora: new Date("2026-12-03T15:00:00Z"), verificar: firmaDePrueba };
      const deEstado = await aprobada(tx, b, automatica(b, "dentro_plazo", "entidad"));
      const aManual = await abrirCambio(b.admin, deEstado.indicadorId, { sql: tx, ahora: diciembre.ahora });
      await guardarBorrador(b.admin, aManual.versionId, manual(b, { codigo: deEstado.codigo, ...motivo }), { sql: tx, ahora: diciembre.ahora });
      await enviarAAprobacion(b.admin, { versionId: aManual.versionId, rigeDesde: "2026-12", credenciales: CLAVE }, diciembre);
      await aprobarFichas(b.gerente, { versionIds: [aManual.versionId], credenciales: CLAVE }, diciembre);
      expect(await indicadorDe(tx, deEstado.indicadorId)).toMatchObject({ calculo: null, inicio_medicion: "2026-11" });
      await rechaza(
        cambiarOperacion(b.admin, { ...operacion, indicadorId: deEstado.indicadorId, inicioMedicion: "2026-06" }, diciembre),
        "Este cálculo no se llena hacia atrás: su inicio de medición no puede adelantarse",
      );
    }));

  it("al pasar a automático se apaga el soporte obligatorio: la medición que solo lo esperaba queda reportada", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      await liberarCalculo(tx, "etapas", "entidad");
      const persona = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [b.sgc] });
      const dia = (d: number, mes = 11) => new Date(`2026-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}T15:00:00Z`);
      const octubre = { sql: tx, ahora: dia(5, 10), verificar: firmaDePrueba };
      // Manual desde octubre, aprobada el 5 de octubre: la medición de octubre no es histórica.
      const creado = await crearIndicador(b.admin, manual(b, { inicioMedicion: "2026-10", mide: [persona.usuarioId] }), { sql: tx, ahora: dia(5, 10) });
      await enviarAAprobacion(b.admin, { versionId: creado.versionId, credenciales: CLAVE }, octubre);
      await aprobarFichas(b.gerente, { versionIds: [creado.versionId], credenciales: CLAVE }, octubre);
      await asegurarMediciones({ sql: tx, ahora: dia(3), indicadorId: creado.indicadorId });
      const [m] = await tx`SELECT id, historica FROM mediciones WHERE indicador_id = ${creado.indicadorId} AND periodo = '2026-10'`;
      expect(m.historica).toBe(false);
      const medicionId = Number(m.id);
      await reportar(persona, { medicionId, valores: { A: "9", B: "10" }, parcial: false, confirmado: true }, { sql: tx, ahora: dia(3) });
      // Con el soporte obligatorio, en plazo, vuelve a abierta: solo le falta el soporte.
      const operacion = { indicadorId: creado.indicadorId, plazoReporteDias: 10, inicioMedicion: "2026-10", nivelAcceso: "general" as const };
      await cambiarOperacion(b.admin, { ...operacion, soporteObligatorio: true }, { sql: tx, ahora: dia(4) });
      const estadoDe = async () => (await tx`SELECT estado FROM mediciones WHERE id = ${medicionId}`)[0].estado as string;
      expect(await estadoDe()).toBe("abierta");

      const { versionId } = await abrirCambio(b.admin, creado.indicadorId, { sql: tx, ahora: AHORA });
      await guardarBorrador(b.admin, versionId, automatica(b, "etapas", "entidad", { codigo: creado.codigo, motivoCambio: "Lo calcula el sistema" }), {
        sql: tx,
        ahora: AHORA,
      });
      await enviarAAprobacion(b.admin, { versionId, credenciales: CLAVE }, firmar(tx));
      // Enviar no lo toca: solo la publicación.
      expect(await estadoDe()).toBe("abierta");
      await aprobarFichas(b.gerente, { versionIds: [versionId], credenciales: CLAVE }, firmar(tx));
      expect(await indicadorDe(tx, creado.indicadorId)).toMatchObject({ soporte_obligatorio: false, calculo: "etapas" });
      expect(await estadoDe()).toBe("reportada");
      const [recalculo] = await tx`SELECT usuario_id, detalle FROM medicion_eventos WHERE medicion_id = ${medicionId} AND tipo = 'recalculo'
        ORDER BY id DESC LIMIT 1`;
      expect(recalculo).toMatchObject({ usuario_id: b.gerente.usuarioId, detalle: { causa: "soporte_obligatorio", despues: { estado: "reportada" } } });
      // La aprobación apagó un dato de operación: la bitácora lo dice (el inicio no se movió: «etapas» se llena hacia atrás).
      const [aprobado] = await aprobacionEnBitacora(tx, creado.indicadorId);
      expect(aprobado.detalle).toMatchObject({ soporteApagado: true, medicionesRecalculadas: 1 });
      expect(aprobado.detalle).not.toHaveProperty("inicioMedicion");
      expect(describirEvento({ accion: "indicador_aprobado", entidad: "indicador", entidadId: 1, detalle: aprobado.detalle })).toBe(
        `Aprobó la ficha de ${creado.codigo} (versión 2). Se apagó el soporte obligatorio (1 medición recalculada).`,
      );
    }));

  it("el indicador de prueba con cálculo nace automático, con las variables del registro", () =>
    revertida(sql, async (tx) => {
      await base(tx);
      for (const [clave, alcance, letras] of [
        ["acuses", "entidad", ["A", "B"]],
        ["vencidos", "proceso", ["A"]],
      ] as [ClaveDeCalculo, AlcanceDeCalculo, string[]][]) {
        const ind = await indicadorDePrueba(tx, { calculo: { clave, alcance } });
        expect(await indicadorDe(tx, ind.id)).toMatchObject({ estado: "activo", calculo: clave, calculo_alcance: alcance });
        expect(await versionDe(tx, ind.versionId)).toMatchObject({ origen_dato: "automatico", calculo: clave, calculo_alcance: alcance });
        const variables = await variablesDe(tx, ind.versionId);
        expect(variables.map((v) => [v.letra, v.origen])).toEqual(letras.map((l) => [l, "automatica"]));
      }
      // Libera el cálculo que va a usar: una ficha activa con ese cálculo y alcance (como las de la demo) se queda sin él.
      const antes = await indicadorDePrueba(tx, { calculo: { clave: "conformidad_fecha", alcance: "entidad" } });
      const despues = await indicadorDePrueba(tx, { calculo: { clave: "conformidad_fecha", alcance: "entidad" } });
      expect(await indicadorDe(tx, antes.id)).toMatchObject({ estado: "activo", calculo: null, calculo_alcance: null });
      expect(await indicadorDe(tx, despues.id)).toMatchObject({ calculo: "conformidad_fecha", calculo_alcance: "entidad" });
      // Con alcance «proceso», solo en su proceso.
      const otroProceso = await procesoNuevo(tx);
      const enGth = await indicadorDePrueba(tx, { calculo: { clave: "etapas", alcance: "proceso" } });
      await indicadorDePrueba(tx, { calculo: { clave: "etapas", alcance: "proceso" }, procesoId: otroProceso });
      expect(await indicadorDe(tx, enGth.id)).toMatchObject({ calculo: "etapas", calculo_alcance: "proceso" });
    }));

  it("el choque con el índice único se reconoce por su nombre (dos aprobaciones a la vez)", () =>
    revertida(sql, async (tx) => {
      await base(tx);
      await indicadorDePrueba(tx, { calculo: { clave: "etapas", alcance: "entidad" } });
      const otro = await indicadorDePrueba(tx, { calculo: { clave: "etapas", alcance: "proceso" } });
      // En un punto de guardado: el error no deja la transacción de la prueba inservible.
      const err = await tx
        .savepoint((sp) => sp`UPDATE indicadores SET calculo_alcance = 'entidad' WHERE id = ${otro.id}`)
        .then(
          () => null,
          (e: unknown) => e,
        );
      expect(esCalculoRepetido(err)).toBe(true);
      expect(yaHayUnaActiva()).toBe("Ya hay una ficha activa para ese cálculo y alcance");
      expect(esCalculoRepetido(new ErrorIndicador("otro"))).toBe(false);
    }));
});
