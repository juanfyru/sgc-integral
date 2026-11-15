/**
 * El origen de cada variable de una ficha y su desagregación, en el servidor (anexo 14C, §4.2, §5.2 y §6.1; Tarea 6 de la
 * 14C): guardar conserva el origen, copia lo que se firma, rechaza lo que no cuadra y copia y duplica como corresponde.
 * Contra la BD de desarrollo, dentro de una transacción que se revierte.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { aprobarFichas, enviarAAprobacion } from "@/db/consultas/indicadores/aprobacion";
import { origenesDeVersion, revisarOrigenes } from "@/db/consultas/indicadores/componentes";
import {
  abrirCambio,
  COLUMNAS_VARIABLE,
  contenidoDeVersion,
  crearIndicador,
  fichaParaEditar,
  guardarBorrador,
  opcionesDeFicha,
} from "@/db/consultas/indicadores/fichas";
import { duplicar } from "@/db/consultas/indicadores/operacion";
import { EsquemaFicha, type DatosFicha } from "@/lib/esquemas/indicadores";
import { huellaDeFicha, tipoDeCambio, type ContenidoFicha } from "@/lib/indicadores/ficha";
import { ErrorIndicador, type Toma } from "@/lib/indicadores/tipos";
import { datoDePrueba, dimensionDePrueba, indicadorDePrueba, type IndicadorDePrueba } from "./utiles/indicadores";
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

const AHORA = new Date("2026-11-10T15:00:00Z");
const CLAVE = { clave: "ok" };
const firmar = (tx: TransactionSql) => ({ sql: tx, ahora: AHORA, verificar: firmaDePrueba });

type Base = {
  admin: SesionFlujo;
  procesoId: number;
  tipoId: number;
  estrategico: number;
  porcentaje: number;
  cargoId: number;
};

/** El proceso SGC, los maestros sembrados y un cargo propio. */
async function base(tx: TransactionSql): Promise<Base> {
  const [p] = await tx`SELECT id FROM procesos WHERE sigla = 'SGC'`;
  const [t] = await tx`SELECT id FROM tipos_indicador WHERE nombre = 'Eficacia'`;
  const [es] = await tx`SELECT id FROM clasificaciones_indicador WHERE nombre = 'Estratégico'`;
  const [u] = await tx`SELECT id FROM unidades_indicador WHERE nombre = 'Porcentaje'`;
  const [area] = await tx`SELECT id FROM areas ORDER BY id LIMIT 1`;
  const [c] = await tx`INSERT INTO cargos (nombre, area_id) VALUES (${`ZZ Cargo ${unico()}`}, ${area.id}) RETURNING id`;
  return {
    admin: await sesionAdmin(tx),
    procesoId: Number(p.id),
    tipoId: Number(t.id),
    estrategico: Number(es.id),
    porcentaje: Number(u.id),
    cargoId: Number(c.id),
  };
}

const RANGOS_80 = JSON.stringify({ bien: [{ signo: ">=", valor: "80" }], atencion: [{ signo: ">=", valor: "56" }], critico: [{ signo: "<", valor: "56" }] });
/** Los de la meta 90 de `indicadorDePrueba`: un cambio sobre sus fichas los escribe. */
const RANGOS_90 = JSON.stringify({ bien: [{ signo: ">=", valor: "90" }], atencion: [{ signo: ">=", valor: "63" }], critico: [{ signo: "<", valor: "63" }] });

type Variable = DatosFicha["variables"][number];

const propia = (letra: string, nombre = `Propia ${letra}`): Variable => ({ letra, nombre, consolidacion: "suma", admiteNegativos: false });
const delDato = (letra: string, datoId: number, otros: Partial<Variable> = {}): Variable => ({
  letra,
  nombre: `Dato ${letra}`,
  consolidacion: "suma",
  admiteNegativos: false,
  origen: "compartida",
  datoId,
  ...otros,
});
const delIndicador = (letra: string, indicadorOrigenId: number, toma: Toma = "valor"): Variable => ({
  letra,
  nombre: `Tomada ${letra}`,
  consolidacion: "suma",
  admiteNegativos: false,
  origen: "indicador",
  indicadorOrigenId,
  toma,
});

/** Una ficha estratégica de fórmula libre (la suma de sus variables), trimestral desde 2026-T1, probada con unos. */
function ficha(b: Base, variables: Variable[], parcial: Partial<DatosFicha> = {}): DatosFicha {
  const letras = variables.map((v) => v.letra);
  return {
    procesoId: b.procesoId,
    nombre: "Atención integral",
    proposito: "Saber cuántas atenciones integrales se prestan",
    tipoId: b.tipoId,
    clasificacionId: b.estrategico,
    forma: "libre",
    formula: letras.join(" + "),
    variables,
    unidadId: b.porcentaje,
    decimales: 1,
    periodicidad: "trimestral",
    tendencia: "ascendente",
    meta: "80",
    semaforoModo: "rangos",
    rangos: RANGOS_80,
    cargosMedir: [b.cargoId],
    cargosAnalizar: [b.cargoId],
    normaIds: [],
    plazoReporteDias: 10,
    inicioMedicion: "2026-T1",
    soporteObligatorio: false,
    nivelAcceso: "general",
    mide: [],
    analiza: [],
    prueba: { valores: Object.fromEntries(letras.map((l) => [l, "1"])) },
    ...parcial,
  };
}

/** Lo mismo, mensual desde enero. */
const mensual = (b: Base, variables: Variable[], parcial: Partial<DatosFicha> = {}) =>
  ficha(b, variables, { periodicidad: "mensual", inicioMedicion: "2026-01", ...parcial });

async function rechaza(promesa: Promise<unknown>, mensaje: string) {
  const err = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ErrorIndicador);
  expect((err as Error).message).toBe(mensaje);
}

/** Abre un cambio sobre una ficha de `indicadorDePrueba` y lo que el formulario mandaría, con cargos y los rangos de su meta. */
async function cambioSobre(tx: TransactionSql, b: Base, ind: IndicadorDePrueba): Promise<{ versionId: number; valores: DatosFicha }> {
  const { versionId } = await abrirCambio(b.admin, ind.id, { sql: tx });
  const editable = (await fichaParaEditar(b.admin, ind.codigo, { sql: tx }))!.valores as DatosFicha;
  return { versionId, valores: { ...editable, cargosMedir: [b.cargoId], cargosAnalizar: [b.cargoId], semaforoModo: "rangos", rangos: RANGOS_90 } };
}

/** Crea, envía y aprueba (con Gerencia) la ficha: queda la versión 1 aprobada y el indicador activo. */
async function aprobada(tx: TransactionSql, b: Base, d: DatosFicha) {
  const creado = await crearIndicador(b.admin, d, { sql: tx });
  await enviarAAprobacion(b.admin, { versionId: creado.versionId, credenciales: CLAVE }, firmar(tx));
  const gerente = await usuarioDePrueba(tx, { rol: "gerencia" });
  await aprobarFichas(gerente, { versionIds: [creado.versionId], credenciales: CLAVE }, firmar(tx));
  return creado;
}

/** Una cadena de indicadores aprobados en la que cada uno toma el valor del anterior: el último tiene `largo - 1` niveles. */
async function cadena(tx: TransactionSql, procesoId: number, largo: number): Promise<IndicadorDePrueba[]> {
  const lista = [await indicadorDePrueba(tx, { procesoId })];
  while (lista.length < largo) lista.push(await indicadorDePrueba(tx, { procesoId, variables: { A: { indicadorOrigenId: lista.at(-1)!.id } } }));
  return lista;
}

const retirar = (tx: TransactionSql, indicadorId: number, usuarioId: number) =>
  tx`UPDATE indicadores SET estado = 'retirado', baja_por = ${usuarioId}, baja_en = now(), baja_motivo = 'Prueba de retiro'
    WHERE id = ${indicadorId}`;

const filasDeVariables = (tx: TransactionSql, versionId: number) =>
  tx.unsafe(`SELECT ${COLUMNAS_VARIABLE} FROM indicador_variables WHERE version_id = $1 ORDER BY orden, letra`, [versionId]);

/** El contenido sin las claves dadas, de las variables y del primer nivel: como lo leía una versión anterior. */
function sinClaves(c: ContenidoFicha, deVariable: string[], dePrimerNivel: string[]): ContenidoFicha {
  const copia: Record<string, unknown> = { ...c };
  for (const clave of dePrimerNivel) delete copia[clave];
  copia.variables = c.variables.map((v) => {
    const variable: Record<string, unknown> = { ...v };
    for (const clave of deVariable) delete variable[clave];
    return variable;
  });
  return copia as unknown as ContenidoFicha;
}

const CICLO = "Esta ficha cerraría un ciclo entre indicadores";
const NIVELES = "Un indicador compuesto admite hasta cinco niveles";
const OBJETIVOS = "Esta ficha toma «Objetivos cumplidos»: no puede apuntar a un objetivo de esa misma clase";

describe("guardar el origen de cada variable", () => {
  it("ida y vuelta: propia, dato compartido y resultado de otro indicador; guardar otra vez no los vuelve propios", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const dato = await datoDePrueba(tx, { procesoId: b.procesoId, nombre: `ZZ Pacientes ${unico()}` });
      const comp = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const { versionId, codigo } = await crearIndicador(
        b.admin,
        ficha(b, [propia("A", "Atenciones"), delDato("B", dato), delIndicador("C", comp.id, "cumplimiento")]),
        { sql: tx },
      );

      const editar = (await fichaParaEditar(b.admin, codigo, { sql: tx }))!;
      expect(editar.valores.variables).toMatchObject([
        { letra: "A", origen: "propia", datoId: undefined, indicadorOrigenId: undefined, toma: undefined },
        { letra: "B", origen: "compartida", datoId: dato, indicadorOrigenId: undefined },
        { letra: "C", origen: "indicador", datoId: undefined, indicadorOrigenId: comp.id, toma: "cumplimiento" },
      ]);
      expect(editar.contenido.variables).toMatchObject([
        { letra: "A", origen: "propia", variableCompartidaId: null, indicadorOrigenId: null, toma: null },
        { letra: "B", origen: "compartida", variableCompartidaId: dato, indicadorOrigenId: null, toma: null },
        { letra: "C", origen: "indicador", variableCompartidaId: null, indicadorOrigenId: comp.id, toma: "cumplimiento" },
      ]);

      await guardarBorrador(b.admin, versionId, EsquemaFicha.parse(editar.valores), { sql: tx });
      const otraVez = await contenidoDeVersion(tx, versionId);
      expect(otraVez.variables.map((v) => [v.letra, v.origen, v.variableCompartidaId, v.indicadorOrigenId, v.toma])).toEqual([
        ["A", "propia", null, null, null],
        ["B", "compartida", dato, null, null],
        ["C", "indicador", null, comp.id, "cumplimiento"],
      ]);
      expect(huellaDeFicha(otraVez)).toBe(huellaDeFicha(editar.contenido));
    }));

  it("el dato manda: la variable lleva lo del catálogo y su periodicidad, no lo que mande el formulario", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const nombre = `ZZ Consultas ${unico()}`;
      const dato = await datoDePrueba(tx, { procesoId: b.procesoId, nombre, consolidacion: "ultimo" });
      await tx`UPDATE variables_compartidas SET descripcion = 'Consultas de medicina general', fuente = 'Historia clínica',
          unidad = 'consultas', captura_min = 0, captura_max = 5000, admite_negativos = false
        WHERE id = ${dato}`;
      const { versionId } = await crearIndicador(
        b.admin,
        ficha(b, [
          propia("A"),
          delDato("B", dato, { nombre: "Otro nombre", consolidacion: "promedio", fuente: "Otra fuente", unidad: "otra", capturaMax: "7", admiteNegativos: true }),
        ]),
        { sql: tx },
      );
      const [b2] = await tx`SELECT nombre, descripcion, fuente, unidad, consolidacion, captura_min, captura_max, admite_negativos, dato_periodicidad,
          variable_compartida_id, origen
        FROM indicador_variables WHERE version_id = ${versionId} AND letra = 'B'`;
      expect(b2).toEqual({
        nombre,
        descripcion: "Consultas de medicina general",
        fuente: "Historia clínica",
        unidad: "consultas",
        consolidacion: "ultimo",
        captura_min: "0",
        captura_max: "5000",
        admite_negativos: false,
        dato_periodicidad: "mensual",
        variable_compartida_id: dato,
        origen: "compartida",
      });
    }));

  it("la tomada firma el código y el nombre del componente; renombrarlo después no cambia la versión ya guardada", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const comp = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const { versionId } = await crearIndicador(b.admin, ficha(b, [propia("A"), delIndicador("B", comp.id)]), { sql: tx });
      const [fila] = await tx`SELECT origen_codigo, origen_nombre, consolidacion, indicador_origen_id, toma
        FROM indicador_variables WHERE version_id = ${versionId} AND letra = 'B'`;
      expect(fila).toEqual({
        origen_codigo: comp.codigo,
        origen_nombre: `Indicador de prueba ${comp.codigo}`,
        consolidacion: "ultimo",
        indicador_origen_id: comp.id,
        toma: "valor",
      });
      const antes = await contenidoDeVersion(tx, versionId);

      // Una versión 2 del componente con otro nombre.
      const [v2] = await tx`INSERT INTO indicador_versiones (indicador_id, numero, estado, tipo_cambio, nombre, forma, formula, periodicidad,
          tendencia, meta, semaforo_modo, umbral_atencion_pct, unidad_sufijo, decimales, creado_por)
        VALUES (${comp.id}, 2, 'borrador', 'menor', 'Nombre nuevo del componente', 'porcentaje', 'A / B * 100', 'mensual', 'ascendente', 90,
          'relativo', 70, ' %', 1, ${b.admin.usuarioId}) RETURNING id`;
      await tx`UPDATE indicador_versiones SET estado = 'aprobada', elaborada_por = ${b.admin.usuarioId}, huella = ${"3".repeat(64)},
          rige_desde = '2026-06' WHERE id = ${v2.id}`;
      expect(await contenidoDeVersion(tx, versionId)).toEqual(antes);
      expect(antes.variables[1]).toMatchObject({ origenCodigo: comp.codigo, origenNombre: `Indicador de prueba ${comp.codigo}` });

      // Guardarla otra vez copia el nombre de la ficha vigente de hoy.
      await guardarBorrador(b.admin, versionId, ficha(b, [propia("A"), delIndicador("B", comp.id)]), { sql: tx });
      expect((await contenidoDeVersion(tx, versionId)).variables[1].origenNombre).toBe("Nombre nuevo del componente");
    }));

  it("una ficha manual con todas sus variables ajenas no exige cargo de medir; con alguna propia, sí", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const dato = await datoDePrueba(tx, { procesoId: b.procesoId });
      const comp = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const { versionId } = await crearIndicador(b.admin, ficha(b, [delDato("A", dato), delIndicador("B", comp.id)], { cargosMedir: [] }), { sql: tx });
      const [{ cuantos }] = await tx`SELECT count(*)::int AS cuantos FROM indicador_responsables WHERE version_id = ${versionId} AND funcion = 'medir'`;
      expect(cuantos).toBe(0);
      await rechaza(
        crearIndicador(b.admin, ficha(b, [propia("A"), delDato("B", dato)], { cargosMedir: [] }), { sql: tx }),
        "Elija al menos un cargo responsable de medir",
      );
    }));
});

describe("lo que se rechaza al guardar", () => {
  it("del dato compartido: que falte, que no esté activo en una cita nueva y su periodicidad", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      await rechaza(
        crearIndicador(b.admin, ficha(b, [propia("A"), { ...propia("B"), origen: "compartida" }]), { sql: tx }),
        "Elija un dato compartido activo para la variable B",
      );
      await rechaza(crearIndicador(b.admin, ficha(b, [propia("A"), delDato("B", 999_999_999)]), { sql: tx }), "Elija un dato compartido activo para la variable B");
      const inactivo = await datoDePrueba(tx, { procesoId: b.procesoId });
      await tx`UPDATE variables_compartidas SET activa = false WHERE id = ${inactivo}`;
      await rechaza(crearIndicador(b.admin, ficha(b, [propia("A"), delDato("B", inactivo)]), { sql: tx }), "Elija un dato compartido activo para la variable B");

      const nombre = `ZZ Trimestral ${unico()}`;
      const trimestral = await datoDePrueba(tx, { procesoId: b.procesoId, nombre, periodicidad: "trimestral" });
      await rechaza(
        crearIndicador(b.admin, mensual(b, [propia("A"), delDato("B", trimestral)]), { sql: tx }),
        `El dato «${nombre}» es trimestral: el indicador debe medirse con esa periodicidad o con una que la contenga`,
      );
      // Trimestral o más gruesa, sí.
      await crearIndicador(b.admin, ficha(b, [propia("A"), delDato("B", trimestral)]), { sql: tx });
      await crearIndicador(b.admin, ficha(b, [propia("A"), delDato("B", trimestral)], { periodicidad: "anual", inicioMedicion: "2026" }), { sql: tx });
    }));

  it("del componente: qué se toma, retirado en una cita nueva, a sí mismo, periodicidad, meta y nivel de acceso", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const comp = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      await rechaza(
        crearIndicador(b.admin, ficha(b, [propia("A"), { ...delIndicador("B", comp.id), toma: undefined }]), { sql: tx }),
        "Elija el indicador del que sale la variable B y qué se toma de él",
      );

      const retirado = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      await retirar(tx, retirado.id, b.admin.usuarioId);
      await rechaza(
        crearIndicador(b.admin, ficha(b, [propia("A"), delIndicador("B", retirado.id)]), { sql: tx }),
        "El indicador de la variable B debe estar activo y tener ficha vigente",
      );
      const enBorrador = await indicadorDePrueba(tx, { procesoId: b.procesoId, estado: "borrador" });
      await rechaza(
        crearIndicador(b.admin, ficha(b, [propia("A"), delIndicador("B", enBorrador.id)]), { sql: tx }),
        "El indicador de la variable B debe estar activo y tener ficha vigente",
      );

      const mismo = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const cambio = await cambioSobre(tx, b, mismo);
      await rechaza(
        guardarBorrador(b.admin, cambio.versionId, { ...cambio.valores, variables: [cambio.valores.variables[0], delIndicador("B", mismo.id)] }, { sql: tx }),
        "Un indicador no puede tomar su propio resultado",
      );

      const trimestral = await indicadorDePrueba(tx, { procesoId: b.procesoId, periodicidad: "trimestral" });
      await rechaza(
        crearIndicador(b.admin, mensual(b, [propia("A"), delIndicador("B", trimestral.id)]), { sql: tx }),
        "El indicador de la variable B se mide con una periodicidad más gruesa que la de esta ficha",
      );

      const sinMeta = await indicadorDePrueba(tx, { procesoId: b.procesoId, meta: null });
      await rechaza(
        crearIndicador(b.admin, ficha(b, [propia("A"), delIndicador("B", sinMeta.id, "cumplimiento")]), { sql: tx }),
        "No se puede tomar el cumplimiento de un indicador sin meta (variable B)",
      );
      // Su valor, sí.
      await crearIndicador(b.admin, ficha(b, [propia("A"), delIndicador("B", sinMeta.id)]), { sql: tx });

      const restringido = await indicadorDePrueba(tx, { procesoId: b.procesoId, nivelAcceso: "restringido" });
      await rechaza(
        crearIndicador(b.admin, ficha(b, [propia("A"), delIndicador("B", restringido.id)]), { sql: tx }),
        "Esta ficha toma un indicador restringido: debe ser restringida",
      );
      await crearIndicador(b.admin, ficha(b, [propia("A"), delIndicador("B", restringido.id)], { nivelAcceso: "restringido" }), { sql: tx });

      // En un cambio rige el nivel de acceso del indicador, no el que traiga el formulario.
      const cerrado = await indicadorDePrueba(tx, { procesoId: b.procesoId, nivelAcceso: "restringido" });
      const deCerrado = await cambioSobre(tx, b, cerrado);
      await guardarBorrador(
        b.admin,
        deCerrado.versionId,
        { ...deCerrado.valores, nivelAcceso: "general", variables: [deCerrado.valores.variables[0], delIndicador("B", restringido.id)] },
        { sql: tx },
      );
      const abierto = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const deAbierto = await cambioSobre(tx, b, abierto);
      await rechaza(
        guardarBorrador(
          b.admin,
          deAbierto.versionId,
          { ...deAbierto.valores, nivelAcceso: "restringido", variables: [deAbierto.valores.variables[0], delIndicador("B", restringido.id)] },
          { sql: tx },
        ),
        "Esta ficha toma un indicador restringido: debe ser restringida",
      );
    }));

  it("un ciclo: A toma B cuando la vigente de B ya toma A", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const a = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const deA = await indicadorDePrueba(tx, { procesoId: b.procesoId, variables: { A: { indicadorOrigenId: a.id } } });
      const cambio = await cambioSobre(tx, b, a);
      await rechaza(
        guardarBorrador(b.admin, cambio.versionId, { ...cambio.valores, variables: [cambio.valores.variables[0], delIndicador("B", deA.id)] }, { sql: tx }),
        CICLO,
      );
    }));

  it("cinco niveles como mucho, también para los que están encima de la ficha", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const i = await cadena(tx, b.procesoId, 6);
      // I5 tiene cinco niveles debajo: tomarlo daría seis; tomar I4, cinco.
      await rechaza(crearIndicador(b.admin, ficha(b, [propia("A"), delIndicador("B", i[5].id)]), { sql: tx }), NIVELES);
      await crearIndicador(b.admin, ficha(b, [propia("A"), delIndicador("B", i[4].id)]), { sql: tx });

      // I1, a mitad de la cadena, toma otro compuesto de un nivel: queda en dos, pero I5 quedaría en seis.
      const y = await cadena(tx, b.procesoId, 2);
      const cambio = await cambioSobre(tx, b, i[1]);
      expect(cambio.valores.variables[0]).toMatchObject({ origen: "indicador", indicadorOrigenId: i[0].id });
      await rechaza(
        guardarBorrador(b.admin, cambio.versionId, { ...cambio.valores, variables: [cambio.valores.variables[0], delIndicador("B", y[1].id)] }, { sql: tx }),
        NIVELES,
      );
      // Un componente simple no alarga nada.
      await guardarBorrador(b.admin, cambio.versionId, { ...cambio.valores, variables: [cambio.valores.variables[0], delIndicador("B", y[0].id)] }, { sql: tx });
    }));

  it("«Objetivos cumplidos» de una clase no puede llegar a un indicador que apunte a un objetivo de esa clase", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const objetivo = async (clase: "calidad" | "institucional") => {
        const [o] = await tx`INSERT INTO objetivos (clase, enunciado, orden) VALUES (${clase}, ${`ZZ Objetivo ${unico()}`}, 99) RETURNING id`;
        return Number(o.id);
      };
      const calidad = await objetivo("calidad");
      const institucional = await objetivo("institucional");
      const cumplidos = await indicadorDePrueba(tx, { procesoId: b.procesoId, calculo: { clave: "objetivos_cumplidos", alcance: "calidad" } });
      const intermedio = await indicadorDePrueba(tx, { procesoId: b.procesoId, variables: { A: { indicadorOrigenId: cumplidos.id } } });

      // A través de otro compuesto, hacia un objetivo de calidad: no; hacia uno institucional, sí.
      await rechaza(
        crearIndicador(b.admin, ficha(b, [propia("A"), delIndicador("B", intermedio.id)], { objetivoId: calidad }), { sql: tx }),
        OBJETIVOS,
      );
      await crearIndicador(b.admin, ficha(b, [propia("A"), delIndicador("B", intermedio.id)], { objetivoId: institucional }), { sql: tx });

      // El que apunta a calidad ya toma un indicador simple; ese simple no puede empezar a tomar «Objetivos cumplidos».
      const simple = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      await indicadorDePrueba(tx, { procesoId: b.procesoId, objetivoId: calidad, variables: { A: { indicadorOrigenId: simple.id } } });
      const cambio = await cambioSobre(tx, b, simple);
      await rechaza(
        guardarBorrador(b.admin, cambio.versionId, { ...cambio.valores, variables: [cambio.valores.variables[0], delIndicador("B", cumplidos.id)] }, { sql: tx }),
        CICLO,
      );
    }));

  it("de la desagregación: automática, tomada, dato sin ella o con otra, dimensión inactiva y fórmula con max", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const sede = await dimensionDePrueba(tx, `ZZ Sede ${unico()}`, ["Norte", "Sur"]);
      const [{ nombre: nombreSede }] = await tx`SELECT nombre FROM dimensiones WHERE id = ${sede.id}`;
      const comp = await indicadorDePrueba(tx, { procesoId: b.procesoId });

      await rechaza(
        crearIndicador(
          b.admin,
          ficha(b, [propia("A"), propia("B")], { origenDato: "automatico", calculo: "acuses", calculoAlcance: "entidad", cargosMedir: [], dimensionId: sede.id }),
          { sql: tx },
        ),
        "Un indicador que calcula el sistema no se desagrega",
      );
      await rechaza(
        crearIndicador(b.admin, ficha(b, [propia("A"), delIndicador("B", comp.id)], { dimensionId: sede.id }), { sql: tx }),
        "Un indicador desagregado no puede tomar el resultado de otro indicador",
      );

      const sinDimension = `ZZ Sin sede ${unico()}`;
      const datoSin = await datoDePrueba(tx, { procesoId: b.procesoId, nombre: sinDimension });
      await rechaza(
        crearIndicador(b.admin, ficha(b, [propia("A"), delDato("B", datoSin)], { dimensionId: sede.id }), { sql: tx }),
        `El dato «${sinDimension}» no está desagregado por ${nombreSede as string}`,
      );
      const conDimension = `ZZ Por sede ${unico()}`;
      const datoCon = await datoDePrueba(tx, { procesoId: b.procesoId, nombre: conDimension, dimensionId: sede.id });
      await rechaza(
        crearIndicador(b.admin, ficha(b, [propia("A"), delDato("B", datoCon)]), { sql: tx }),
        `El dato «${conDimension}» está desagregado por ${nombreSede as string}: desagregue el indicador por ella`,
      );
      // Con la misma dimensión, sí.
      await crearIndicador(b.admin, ficha(b, [propia("A"), delDato("B", datoCon)], { dimensionId: sede.id }), { sql: tx });

      const inactiva = await dimensionDePrueba(tx, `ZZ Servicio ${unico()}`, ["Urgencias"]);
      await tx`UPDATE dimensiones SET activo = false WHERE id = ${inactiva.id}`;
      await rechaza(crearIndicador(b.admin, ficha(b, [propia("A"), propia("B")], { dimensionId: inactiva.id }), { sql: tx }), "Elija una dimensión activa");
      await rechaza(crearIndicador(b.admin, ficha(b, [propia("A"), propia("B")], { dimensionId: 999_999_999 }), { sql: tx }), "Elija una dimensión activa");

      await rechaza(
        crearIndicador(b.admin, ficha(b, [propia("A"), propia("B")], { formula: "max(A - B; 0)", dimensionId: sede.id }), { sql: tx }),
        "Una fórmula con min, max o abs no se puede desagregar",
      );
    }));

  it("una cita vieja sigue valiendo: el dato que la vigente ya citaba, aunque se haya desactivado", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const dato = await datoDePrueba(tx, { procesoId: b.procesoId });
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId, variables: { A: { datoId: dato } } });
      await tx`UPDATE variables_compartidas SET activa = false WHERE id = ${dato}`;
      const cambio = await cambioSobre(tx, b, ind);
      expect(cambio.valores.variables[0]).toMatchObject({ origen: "compartida", datoId: dato });
      await guardarBorrador(b.admin, cambio.versionId, cambio.valores, { sql: tx });
      const origenes = await origenesDeVersion(tx, cambio.versionId);
      expect(origenes.variables[0]).toMatchObject({ letra: "A", origen: "compartida", datoId: dato, citaNueva: false });
      expect(await revisarOrigenes(tx, origenes)).toBeNull();

      const otro = await datoDePrueba(tx, { procesoId: b.procesoId });
      await tx`UPDATE variables_compartidas SET activa = false WHERE id = ${otro}`;
      await rechaza(
        guardarBorrador(b.admin, cambio.versionId, { ...cambio.valores, variables: [delDato("A", otro), cambio.valores.variables[1]] }, { sql: tx }),
        "Elija un dato compartido activo para la variable A",
      );
    }));

  it("«El dato cambió»: al enviar o aprobar, el dato de una cita nueva ya no es el que la ficha copió", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const nombre = `ZZ Egresos ${unico()}`;
      const dato = await datoDePrueba(tx, { procesoId: b.procesoId, nombre });
      const sede = await dimensionDePrueba(tx, `ZZ Sede ${unico()}`, ["Norte"]);
      const d = ficha(b, [propia("A"), delDato("B", dato)]);
      const { indicadorId, versionId } = await crearIndicador(b.admin, d, { sql: tx });
      const origenes = await origenesDeVersion(tx, versionId);
      expect(origenes).toEqual({
        indicadorId,
        periodicidad: "trimestral",
        restringido: false,
        automatica: false,
        objetivoClase: null,
        dimensionId: null,
        conFuncionesNoSumables: false,
        variables: [
          { letra: "A", origen: "propia", datoId: null, indicadorOrigenId: null, toma: null, citaNueva: false, firmado: { datoPeriodicidad: null, consolidacion: "suma" } },
          { letra: "B", origen: "compartida", datoId: dato, indicadorOrigenId: null, toma: null, citaNueva: true, firmado: { datoPeriodicidad: "mensual", consolidacion: "suma" } },
        ],
      });
      expect(await revisarOrigenes(tx, origenes)).toBeNull();

      const cambio = `El dato «${nombre}» cambió desde que se guardó esta ficha: guárdela de nuevo`;
      await tx`UPDATE variables_compartidas SET periodicidad = 'trimestral' WHERE id = ${dato}`;
      expect(await revisarOrigenes(tx, await origenesDeVersion(tx, versionId))).toBe(cambio);
      await tx`UPDATE variables_compartidas SET periodicidad = 'mensual', consolidacion = 'promedio' WHERE id = ${dato}`;
      expect(await revisarOrigenes(tx, await origenesDeVersion(tx, versionId))).toBe(cambio);
      // Con otra dimensión también gana «cambió»: guardar de nuevo dice qué falta.
      await tx`UPDATE variables_compartidas SET consolidacion = 'suma', dimension_id = ${sede.id} WHERE id = ${dato}`;
      expect(await revisarOrigenes(tx, await origenesDeVersion(tx, versionId))).toBe(cambio);
      const [{ nombre: nombreSede }] = await tx`SELECT nombre FROM dimensiones WHERE id = ${sede.id}`;
      await rechaza(guardarBorrador(b.admin, versionId, d, { sql: tx }), `El dato «${nombre}» está desagregado por ${nombreSede as string}: desagregue el indicador por ella`);
    }));
});

describe("la desagregación al guardar", () => {
  it("escribe la dimensión con su nombre y quitarla deja las dos columnas en nulo", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const sede = await dimensionDePrueba(tx, `ZZ Sede ${unico()}`, ["Norte", "Sur"]);
      const [{ nombre }] = await tx`SELECT nombre FROM dimensiones WHERE id = ${sede.id}`;
      const { versionId } = await crearIndicador(b.admin, ficha(b, [propia("A"), propia("B")], { dimensionId: sede.id }), { sql: tx });
      const columnas = () => tx`SELECT dimension_id, dimension_nombre FROM indicador_versiones WHERE id = ${versionId}`;
      expect((await columnas())[0]).toEqual({ dimension_id: sede.id, dimension_nombre: nombre });
      expect(await contenidoDeVersion(tx, versionId)).toMatchObject({ dimensionId: sede.id, dimensionNombre: nombre });

      await guardarBorrador(b.admin, versionId, ficha(b, [propia("A"), propia("B")]), { sql: tx });
      expect((await columnas())[0]).toEqual({ dimension_id: null, dimension_nombre: null });
    }));
});

describe("la huella y las copias", () => {
  it("la huella de lo viejo: una ficha sin nada de la 14C firma lo mismo que antes", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const c = await contenidoDeVersion(tx, ind.versionId);
      expect(c.dimensionNombre).toBeNull();
      expect(c.variables.map((v) => [v.datoPeriodicidad, v.origenCodigo, v.origenNombre])).toEqual([
        [null, null, null],
        [null, null, null],
      ]);
      // El contenido como lo leía la 14B, sin las claves de la 14C.
      expect(huellaDeFicha(c)).toBe(huellaDeFicha(sinClaves(c, ["datoPeriodicidad", "origenCodigo", "origenNombre"], ["dimensionNombre"])));

      // Aprobada por el camino real: la huella guardada es la que se vuelve a calcular.
      const { versionId } = await aprobada(tx, b, ficha(b, [propia("A"), propia("B")]));
      const [v] = await tx`SELECT estado, huella FROM indicador_versiones WHERE id = ${versionId}`;
      expect(v.estado).toBe("aprobada");
      expect(huellaDeFicha(await contenidoDeVersion(tx, versionId))).toBe(v.huella);
    }));

  it("abrirCambio sobre un compuesto aprobado copia los orígenes y lo firmado; guardarlo sin cambios no cambia nada", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const dato = await datoDePrueba(tx, { procesoId: b.procesoId });
      const comp = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const creado = await aprobada(tx, b, ficha(b, [propia("A"), delDato("B", dato), delIndicador("C", comp.id, "cumplimiento")]));
      const [{ huella }] = await tx`SELECT huella FROM indicador_versiones WHERE id = ${creado.versionId}`;
      expect(huellaDeFicha(await contenidoDeVersion(tx, creado.versionId))).toBe(huella);

      const { versionId } = await abrirCambio(b.admin, creado.indicadorId, { sql: tx });
      const sinOrden = (filas: readonly Record<string, unknown>[]) => filas.map((f) => ({ ...f, orden: undefined }));
      expect(sinOrden(await filasDeVariables(tx, versionId))).toEqual(sinOrden(await filasDeVariables(tx, creado.versionId)));
      expect((await filasDeVariables(tx, versionId))[1]).toMatchObject({ origen: "compartida", dato_periodicidad: "mensual" });

      const editable = (await fichaParaEditar(b.admin, creado.codigo, { sql: tx }))!.valores;
      await guardarBorrador(b.admin, versionId, EsquemaFicha.parse(editable), { sql: tx });
      expect(tipoDeCambio(await contenidoDeVersion(tx, creado.versionId), await contenidoDeVersion(tx, versionId))).toBe("ninguno");
    }));

  it("duplicar un compuesto con un dato: la copia lleva variables propias con sus nombres y ninguna referencia", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const dato = await datoDePrueba(tx, { procesoId: b.procesoId, nombre: `ZZ Remisiones ${unico()}` });
      await tx`UPDATE variables_compartidas SET descripcion = 'Remisiones a otro nivel', unidad = 'remisiones' WHERE id = ${dato}`;
      const comp = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const original = await crearIndicador(
        b.admin,
        ficha(b, [propia("A", "Atenciones"), delDato("B", dato), delIndicador("C", comp.id, "cumplimiento")]),
        { sql: tx },
      );
      const { codigo } = await duplicar(b.admin, { indicadorId: original.indicadorId, procesoId: b.procesoId }, { sql: tx });
      const variablesDe = (c: string) => tx`SELECT v.letra, v.nombre, v.descripcion, v.unidad, v.origen, v.variable_compartida_id, v.dato_periodicidad,
          v.indicador_origen_id, v.toma, v.origen_codigo, v.origen_nombre
        FROM indicador_variables v JOIN indicador_versiones iv ON iv.id = v.version_id JOIN indicadores i ON i.id = iv.indicador_id
        WHERE lower(i.codigo) = lower(${c}) ORDER BY v.orden`;
      const de = await variablesDe(original.codigo);
      const copia = await variablesDe(codigo);
      const sinReferencias = { origen: "propia", variable_compartida_id: null, dato_periodicidad: null, indicador_origen_id: null, toma: null, origen_codigo: null, origen_nombre: null };
      expect(copia).toEqual(de.map((v) => ({ letra: v.letra, nombre: v.nombre, descripcion: v.descripcion, unidad: v.unidad, ...sinReferencias })));
      expect(copia[1]).toMatchObject({ descripcion: "Remisiones a otro nivel", unidad: "remisiones" });
    }));

  it("duplicar conserva la desagregación si su dimensión sigue activa", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const sede = await dimensionDePrueba(tx, `ZZ Sede ${unico()}`, ["Norte", "Sur"]);
      const [{ nombre }] = await tx`SELECT nombre FROM dimensiones WHERE id = ${sede.id}`;
      const dato = await datoDePrueba(tx, { procesoId: b.procesoId, dimensionId: sede.id });
      const original = await crearIndicador(b.admin, ficha(b, [propia("A"), delDato("B", dato)], { dimensionId: sede.id }), { sql: tx });
      const dimensionDe = async (c: string) =>
        (await tx`SELECT iv.dimension_id, iv.dimension_nombre FROM indicador_versiones iv JOIN indicadores i ON i.id = iv.indicador_id
          WHERE lower(i.codigo) = lower(${c})`)[0];

      const activa = await duplicar(b.admin, { indicadorId: original.indicadorId, procesoId: b.procesoId }, { sql: tx });
      expect(await dimensionDe(activa.codigo)).toEqual({ dimension_id: sede.id, dimension_nombre: nombre });

      await tx`UPDATE dimensiones SET activo = false WHERE id = ${sede.id}`;
      const inactiva = await duplicar(b.admin, { indicadorId: original.indicadorId, procesoId: b.procesoId }, { sql: tx });
      expect(await dimensionDe(inactiva.codigo)).toEqual({ dimension_id: null, dimension_nombre: null });
    }));
});

describe("lo que el formulario ofrece", () => {
  it("datos activos, indicadores activos con ficha vigente (sin el propio ni borradores) y dimensiones activas", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const activo = await datoDePrueba(tx, { procesoId: b.procesoId, nombre: `ZZ Activo ${unico()}`, periodicidad: "trimestral" });
      const inactivo = await datoDePrueba(tx, { procesoId: b.procesoId });
      await tx`UPDATE variables_compartidas SET activa = false WHERE id = ${inactivo}`;
      const propio = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const otro = await indicadorDePrueba(tx, { procesoId: b.procesoId, nivelAcceso: "restringido", periodicidad: "trimestral" });
      const sinMeta = await indicadorDePrueba(tx, { procesoId: b.procesoId, meta: null });
      const borrador = await indicadorDePrueba(tx, { procesoId: b.procesoId, estado: "borrador" });
      const retirado = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      await retirar(tx, retirado.id, b.admin.usuarioId);
      const dimension = await dimensionDePrueba(tx, `ZZ Sede ${unico()}`, ["Norte"]);
      const apagada = await dimensionDePrueba(tx, `ZZ Servicio ${unico()}`, ["Urgencias"]);
      await tx`UPDATE dimensiones SET activo = false WHERE id = ${apagada.id}`;

      const o = await opcionesDeFicha(b.admin, { sql: tx, actuales: { codigo: propio.codigo } });
      const ids = (xs: readonly { id: number }[]) => xs.map((x) => x.id);
      expect(o.datos.find((x) => x.id === activo)).toMatchObject({ periodicidad: "trimestral", consolidacion: "suma", dimensionId: null });
      expect(ids(o.datos)).not.toContain(inactivo);
      expect(o.tomables.find((x) => x.id === otro.id)).toEqual({
        id: otro.id,
        codigo: otro.codigo,
        nombre: `Indicador de prueba ${otro.codigo}`,
        periodicidad: "trimestral",
        conMeta: true,
        restringido: true,
      });
      expect(o.tomables.find((x) => x.id === sinMeta.id)).toMatchObject({ conMeta: false, restringido: false });
      for (const fuera of [propio, borrador, retirado]) expect(ids(o.tomables)).not.toContain(fuera.id);
      const [{ nombre }] = await tx`SELECT nombre FROM dimensiones WHERE id = ${dimension.id}`;
      expect(o.dimensiones).toContainEqual({ id: dimension.id, nombre });
      expect(ids(o.dimensiones)).not.toContain(apagada.id);
    }));
});
