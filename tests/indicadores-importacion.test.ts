/**
 * Importar un lote de fichas aprobadas antes de SGC Integral (spec fase 14A §5.3 a §5.8; Tarea 9): el lote, su plantilla
 * en el almacén, la vista previa y la importación con la clave. Contra la BD de desarrollo, dentro de una transacción que
 * se revierte: ningún lote, evento, ficha aprobada ni sigla queda confirmado. La plantilla se arma en memoria con
 * `plantillaDeImportacion` y se escribe en una carpeta de prueba del almacén que se borra al final.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { registrarArchivo } from "@/db/consultas/admin";
import { ErrorFirma, ErrorTramite, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { aprobarFichas, enviarAAprobacion } from "@/db/consultas/indicadores/aprobacion";
import { contenidoDeVersion, errorDeFichaImportada, guardarBorrador } from "@/db/consultas/indicadores/fichas";
import {
  archivoDeLote,
  autorizarArchivoDeLote,
  crearLote,
  datosDeFichaImportada,
  estadoDeLote,
  importarLote,
  lotesRecientes,
  resumenDeLote,
  listasDePlantilla,
  vistaPrevia,
} from "@/db/consultas/indicadores/importacion";
import { tareasDeIndicadores } from "@/db/consultas/indicadores/tareas";
import { rutaBaseAlmacen } from "@/lib/almacen";
import { EsquemaImportarLote, EsquemaVistaPreviaImportacion, juntarImportacion, type DatosFicha } from "@/lib/esquemas/indicadores";
import { huellaDeFicha } from "@/lib/indicadores/ficha";
import { COLUMNAS, type ClaveColumna } from "@/lib/indicadores/importacion/columnas";
import { plantillaDeImportacion } from "@/lib/indicadores/importacion/plantilla";
import type { Correspondencias, FichaImportada } from "@/lib/indicadores/importacion/revisar";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { normalizar } from "@/lib/lote-usuarios";
import { ErrorPermiso } from "@/lib/permisos";
import { MIME_XLSX } from "@/lib/subida";
import { parsearFormulario } from "@/lib/validacion";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { firmaDePrueba } from "./utiles/vigencia";

const sql = obtenerSql();

/** Todo lo que la prueba escribe en el almacén va bajo esta carpeta, que se borra al final pase lo que pase. */
const CARPETA = `importaciones/zz-prueba-${Date.now()}`;

afterAll(async () => {
  rmSync(path.join(rutaBaseAlmacen(), ...CARPETA.split("/")), { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

let consecutivo = 0;
const unico = () => `${Date.now() % 100_000_000}${(consecutivo += 1)}`;

/** El día de la importación: los periodos que terminaron antes son históricos (spec §5.8). */
const AHORA = new Date("2026-11-13T15:00:00Z");
const CLAVE = { clave: "ok" };
const REGLA = { pctAscendente: 90, pctDescendente: 110 };
const PREVIA = { documento: "SGC-TI-002 v1", aprobadoPor: "Gerente", fecha: "2026-09-11" };
const SIN_CORR: Correspondencias = { subprocesos: {}, cargos: {}, tipos: {}, unidades: {} };
const firmar = (tx: TransactionSql) => ({ sql: tx, ahora: AHORA, verificar: firmaDePrueba });

type Base = {
  admin: SesionFlujo;
  procesoId: number;
  sigla: string;
  subprocesoId: number;
  subproceso: string;
  cargoId: number;
  cargo: string;
};

/** Un proceso y un subproceso sin sigla que solo existen en la transacción, y un cargo de la estructura. */
async function base(tx: TransactionSql): Promise<Base> {
  // Si la demo ya dio la sigla CNT, la prueba la quita dentro de la transacción: la sigla elegida es la del archivo.
  await tx`UPDATE subprocesos SET sigla = NULL WHERE lower(sigla) = 'cnt'`;
  const u = unico();
  const sigla = `Z${u}`;
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${`Proceso ${sigla}`}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id`;
  const subproceso = `Gestión Contable ${u}`;
  const [s] = await tx`INSERT INTO subprocesos (proceso_id, nombre, slug, orden)
    VALUES (${p.id}, ${subproceso}, ${`gestion-contable-${u}`}, 1) RETURNING id`;
  const [area] = await tx`SELECT id FROM areas ORDER BY id LIMIT 1`;
  const cargo = `ZZ Contador ${u}`;
  const [c] = await tx`INSERT INTO cargos (nombre, area_id) VALUES (${cargo}, ${area.id}) RETURNING id`;
  return {
    admin: await sesionAdmin(tx),
    procesoId: Number(p.id),
    sigla,
    subprocesoId: Number(s.id),
    subproceso,
    cargoId: Number(c.id),
    cargo,
  };
}

type Fila = Partial<Record<ClaveColumna, string>>;

/** Una fila «Aprobado», mensual desde enero de 2026, ascendente con meta 95, con cargo, fuente y referente normativo. */
const aprobada = (b: Base, codigo: string, extra: Fila = {}): Fila => ({
  codigo,
  nombre: "Oportunidad del cierre contable",
  proceso: b.sigla,
  subproceso: b.subproceso,
  tipo: "Eficacia",
  clasificacion: "Regulatorio",
  nivel: "Resultado",
  objetivo: "Saber si el cierre contable sale a tiempo",
  forma: "Porcentaje",
  variableA: "Cierres a tiempo",
  variableB: "Cierres del mes",
  unidad: "Porcentaje",
  meta: "95",
  sentido: "Ascendente",
  periodicidad: "Mensual",
  fuente: "Contabilidad",
  cargo: b.cargo,
  riesgo: "Sanciones por cierre tardío",
  referenteNormativo: "Ley 1314 de 2009",
  inicioMedicion: "2026-01",
  estado: "Aprobado",
  ...extra,
});

/** Una fila «Propuesto», trimestral, de conteo y descendente, sin cargo ni objetivo. */
const propuesta = (b: Base, codigo: string, extra: Fila = {}): Fila => ({
  codigo,
  nombre: "Glosas contables",
  proceso: b.sigla,
  subproceso: b.subproceso,
  tipo: "Eficacia",
  clasificacion: "Estratégico",
  forma: "Conteo",
  variableA: "Glosas del trimestre",
  unidad: "Número",
  meta: "30",
  sentido: "Descendente",
  periodicidad: "Trimestral",
  inicioMedicion: "2026-01",
  estado: "Propuesto",
  ...extra,
});

/** La plantilla de la app con las filas escritas en la hoja «Indicadores», como la llenaría el hospital. */
async function plantilla(filas: Fila[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const vacia = await plantillaDeImportacion({
    procesos: ["SGC"],
    subprocesos: ["Gestión Contable"],
    tipos: ["Eficacia"],
    clasificaciones: ["Estratégico", "Regulatorio"],
    unidades: ["Porcentaje", "Número"],
  });
  await wb.xlsx.load(vacia as unknown as ArrayBuffer);
  const hoja = wb.getWorksheet("Indicadores")!;
  filas.forEach((f, i) => {
    COLUMNAS.forEach((c, j) => {
      if (f[c.clave] !== undefined) hoja.getCell(i + 2, j + 1).value = f[c.clave]!;
    });
  });
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/** Escribe la plantilla en la carpeta de prueba del almacén y la registra como el archivo del lote. */
async function subir(tx: TransactionSql, admin: SesionFlujo, loteId: number, bytes: Buffer): Promise<string> {
  const ruta = `${CARPETA}/${loteId}-${unico()}/plantilla.xlsx`;
  const absoluta = path.join(rutaBaseAlmacen(), ...ruta.split("/"));
  mkdirSync(path.dirname(absoluta), { recursive: true });
  writeFileSync(absoluta, bytes);
  await registrarArchivo(
    {
      versionId: null,
      rol: "evidencia",
      contexto: "importacion_indicadores",
      contextoId: loteId,
      ruta,
      nombreOriginal: "Matriz de indicadores.xlsx",
      extension: "xlsx",
      mime: MIME_XLSX,
      tamanoBytes: bytes.byteLength,
      hashSha256: sha256(bytes),
    },
    admin.usuarioId,
    { sql: tx },
  );
  return absoluta;
}

/** Un lote nuevo con su plantilla ya subida. */
async function loteCon(tx: TransactionSql, admin: SesionFlujo, filas: Fila[]): Promise<{ loteId: number; bytes: Buffer; absoluta: string }> {
  const { id } = await crearLote(admin, { sql: tx, ahora: AHORA });
  const bytes = await plantilla(filas);
  const absoluta = await subir(tx, admin, id, bytes);
  return { loteId: id, bytes, absoluta };
}

const datosImportacion = (extra: Partial<Parameters<typeof importarLote>[2]> = {}): Parameters<typeof importarLote>[2] => ({
  correspondencias: SIN_CORR,
  regla: REGLA,
  aprobacionPrevia: PREVIA,
  siglas: {},
  credenciales: CLAVE,
  ...extra,
});

async function rechaza(promesa: Promise<unknown>, mensaje: string, clase: new (...a: never[]) => Error = ErrorIndicador) {
  const err = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(clase);
  expect((err as Error).message).toBe(mensaje);
}

const indicadorDe = async (tx: TransactionSql, codigo: string) => {
  const [i] = await tx`SELECT i.id, i.estado, v.id AS version_id, v.estado AS version_estado, v.importacion_id, v.aprobacion_previa_documento,
      v.aprobacion_previa_por, to_char(v.aprobacion_previa_fecha, 'YYYY-MM-DD') AS aprobacion_previa_fecha, v.semaforo_modo, v.rangos,
      v.sustento_meta, v.huella, v.rige_desde, v.requisito, v.nivel, v.riesgo_asociado, v.proposito, v.aprobada_por, v.aprobada_en,
      v.elaborada_por, v.tipo_cambio
    FROM indicadores i JOIN indicador_versiones v ON v.indicador_id = i.id
    WHERE i.codigo = ${codigo} ORDER BY v.numero LIMIT 1`;
  return i;
};

describe("la ficha de una fila importada", () => {
  const ficha: FichaImportada = {
    codigo: "CNT-ID-001",
    nombre: "Oportunidad del cierre contable",
    procesoId: 14,
    subprocesoId: 42,
    tipoId: 1,
    clasificacionId: 3,
    nivel: "Resultado",
    proposito: null,
    forma: "porcentaje",
    factor: null,
    formula: "A / B * 100",
    variables: [
      { letra: "A", nombre: "Cierres a tiempo", fuente: "Contabilidad", consolidacion: "suma" },
      { letra: "B", nombre: "Cierres del mes", fuente: "Contabilidad", consolidacion: "ultimo" },
    ],
    unidadId: 1,
    meta: "95",
    metaMax: null,
    tendencia: "ascendente",
    periodicidad: "mensual",
    cargoId: 7,
    riesgoAsociado: "Sanciones",
    requisito: "Ley 1314 de 2009",
    inicioMedicion: "2026-01",
    estado: "aprobado",
    rangos: { bien: [{ signo: ">=", valor: "95" }], atencion: [{ signo: ">=", valor: "85.5" }], critico: [{ signo: "<", valor: "85.5" }] },
    siglaParaSubproceso: "CNT",
  };
  const parametros = { decimales: 1, plazoReporteDias: 10 };

  it("el cargo mide y analiza, la fuente va a cada variable, el referente al requisito y la regla al sustento", () => {
    const d = datosDeFichaImportada(ficha, REGLA, "SGC-TI-002 v1", parametros);
    expect(d).toMatchObject({
      procesoId: 14,
      subprocesoId: 42,
      codigo: "CNT-ID-001",
      proposito: null,
      requisito: "Ley 1314 de 2009",
      nivel: "Resultado",
      riesgoAsociado: "Sanciones",
      forma: "porcentaje",
      decimales: 1,
      meta: "95",
      semaforoModo: "rangos",
      sustentoMeta: "Regla de SGC-TI-002 v1: Alerta ≥ 90 % de la meta (ascendente) y ≤ 110 % (descendente)",
      cargosMedir: [7],
      cargosAnalizar: [7],
      normaIds: [],
      mide: [],
      analiza: [],
      plazoReporteDias: 10,
      inicioMedicion: "2026-01",
      soporteObligatorio: false,
      nivelAcceso: "general",
    });
    expect(JSON.parse(d.rangos!)).toEqual(ficha.rangos);
    expect(d.variables).toEqual([
      { letra: "A", nombre: "Cierres a tiempo", fuente: "Contabilidad", consolidacion: "suma", admiteNegativos: false },
      { letra: "B", nombre: "Cierres del mes", fuente: "Contabilidad", consolidacion: "ultimo", admiteNegativos: false },
    ]);
    expect(errorDeFichaImportada(d)).toBeNull();
  });

  it("sin meta no lleva modo, rangos ni sustento; sin cargo, ningún responsable", () => {
    const d = datosDeFichaImportada({ ...ficha, meta: null, rangos: null, cargoId: null }, REGLA, "SGC-TI-002 v1", parametros);
    expect(d.meta).toBeUndefined();
    expect(d.semaforoModo).toBeUndefined();
    expect(d.rangos).toBeUndefined();
    expect(d.sustentoMeta).toBeUndefined();
    expect(d.cargosMedir).toEqual([]);
    expect(errorDeFichaImportada(d)).toBeNull();
  });

  it("lo que la ficha de la app no admite se dice como problema de la fila", () => {
    const d = datosDeFichaImportada({ ...ficha, nombre: "x".repeat(201) }, REGLA, "SGC-TI-002 v1", parametros);
    expect(errorDeFichaImportada(d)).toBe("El nombre no puede pasar de 200 caracteres");
  });
});

describe("el formulario de la importación", () => {
  it("junta en JSON los <select> de las correspondencias y las siglas elegidas; uno vacío es «sin elegir»", () => {
    const f = new FormData();
    f.set("corr:subproceso:contabilidad general", "42");
    f.set("corr:cargo:contador", "");
    f.set("sigla:42", "CNT");
    f.set("documento", "SGC-TI-002 v1");
    f.set("pctAscendente", "90");
    f.set("pctDescendente", "110");
    f.set("clave", "secreta");
    const d = parsearFormulario(juntarImportacion(f), EsquemaImportarLote);
    expect(d).toEqual({
      correspondencias: { subprocesos: { "contabilidad general": 42 }, cargos: {}, tipos: {}, unidades: {} },
      siglas: { "42": "CNT" },
      documento: "SGC-TI-002 v1",
      pctAscendente: "90",
      pctDescendente: "110",
      clave: "secreta",
    });
    // Sin documento, el esquema no se adelanta: el mensaje es el de la consulta.
    const sinDocumento = new FormData();
    sinDocumento.set("clave", "secreta");
    expect(parsearFormulario(juntarImportacion(sinDocumento), EsquemaImportarLote)).toEqual({ clave: "secreta" });
    const vista = new FormData();
    vista.set("corr:unidad:porcentual", "1");
    expect(parsearFormulario(juntarImportacion(vista), EsquemaVistaPreviaImportacion)).toEqual({
      correspondencias: { subprocesos: {}, cargos: {}, tipos: {}, unidades: { porcentual: 1 } },
    });
  });

  it("una correspondencia de un catálogo que no existe, o con un id que no es número, no pasa", () => {
    const otro = new FormData();
    otro.set("corr:norma:ley 100", "3");
    expect(() => juntarImportacion(otro)).toThrow("Las correspondencias no tienen un formato válido");
    const malo = new FormData();
    malo.set("corr:tipo:eficacia", "uno");
    expect(() => parsearFormulario(juntarImportacion(malo), EsquemaVistaPreviaImportacion)).toThrow(
      "Las correspondencias no tienen un formato válido",
    );
  });
});

describe("el lote de importación", () => {
  it("lo prepara solo quien administra indicadores, y queda en la bitácora", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [b.procesoId] });
      await rechaza(crearLote(lider, { sql: tx }), new ErrorPermiso().message, ErrorPermiso);

      const { id } = await crearLote(b.admin, { sql: tx, ahora: AHORA });
      const [l] = await tx`SELECT cargado_por, cargado_en FROM importaciones_indicadores WHERE id = ${id}`;
      expect(Number(l.cargado_por)).toBe(b.admin.usuarioId);
      expect((l.cargado_en as Date).toISOString()).toBe(AHORA.toISOString());
      const [a] = await tx`SELECT usuario_id, entidad, detalle FROM auditoria
        WHERE accion = 'preparo_importacion_indicadores' AND entidad_id = ${id}`;
      expect({ usuario: Number(a.usuario_id), entidad: a.entidad }).toEqual({ usuario: b.admin.usuarioId, entidad: "importacion_indicadores" });
      expect(a.detalle).toEqual({ loteId: id });
    }));

  it("recibe una sola plantilla: su estado pasa de «sin archivo» a «por importar» y un segundo archivo se rechaza", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      expect(await estadoDeLote(tx, 999_999_999)).toBeNull();
      expect(await autorizarArchivoDeLote(999_999_999, b.admin, { sql: tx })).toEqual({ ok: false, estado: 404 });

      const { id } = await crearLote(b.admin, { sql: tx, ahora: AHORA });
      expect(await estadoDeLote(tx, id)).toBe("sin_archivo");
      expect(await autorizarArchivoDeLote(id, b.admin, { sql: tx })).toEqual({ ok: true });

      expect(await archivoDeLote(b.admin, id, { sql: tx })).toBeNull();
      const bytes = await plantilla([aprobada(b, `CNT-ID-${unico()}`)]);
      await subir(tx, b.admin, id, bytes);
      expect(await estadoDeLote(tx, id)).toBe("por_importar");
      // La plantilla subida se descarga como soporte del lote, solo administrando indicadores.
      expect(await archivoDeLote(b.admin, id, { sql: tx })).toEqual({
        ruta: expect.stringMatching(new RegExp(`^${CARPETA}/${id}-\\d+/plantilla\\.xlsx$`)),
        mime: MIME_XLSX,
        nombreOriginal: "Matriz de indicadores.xlsx",
      });
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [b.procesoId] });
      expect(await archivoDeLote(lider, id, { sql: tx })).toBeNull();
      expect(await autorizarArchivoDeLote(id, b.admin, { sql: tx })).toEqual({ ok: false, estado: 409 });
      // Dos subidas a la vez pasan las dos la autorización: el registro, con el lote bloqueado, deja entrar solo una.
      await rechaza(subir(tx, b.admin, id, bytes), "La importación ya tiene su plantilla", ErrorTramite);
    }));
});

describe("la lista y el resumen de los lotes", () => {
  it("dicen el estado y, ya importado, las cifras del evento; a quien no administra no le dicen nada", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [b.procesoId] });
      const vacio = await crearLote(b.admin, { sql: tx, ahora: AHORA });
      const { loteId } = await loteCon(tx, b.admin, [aprobada(b, `CNT-ID-${unico()}`), propuesta(b, `CNT-ID-${unico()}`)]);

      expect(await resumenDeLote(b.admin, vacio.id, { sql: tx })).toMatchObject({ id: vacio.id, estado: "sin_archivo", archivo: null, aprobadas: 0 });
      expect(await resumenDeLote(b.admin, loteId, { sql: tx })).toMatchObject({ estado: "por_importar", aprobadas: 0, borradores: 0, importadoEn: null });
      expect(await resumenDeLote(b.admin, 999_999_999, { sql: tx })).toBeNull();
      expect(await resumenDeLote(lider, loteId, { sql: tx })).toBeNull();
      expect(await lotesRecientes(lider, { sql: tx })).toEqual([]);

      await importarLote(b.admin, loteId, datosImportacion({ siglas: { [b.subprocesoId]: "CNT" } }), firmar(tx));
      const resumen = await resumenDeLote(b.admin, loteId, { sql: tx });
      expect(resumen).toMatchObject({ estado: "importado", aprobadas: 1, borradores: 1, omitidas: 0 });
      expect(resumen?.archivo).toMatch(/\.xlsx$/);
      expect(resumen?.importadoEn?.toISOString()).toBe(AHORA.toISOString());

      const lista = await lotesRecientes(b.admin, { sql: tx });
      expect(lista.length).toBeLessThanOrEqual(50);
      expect(lista.find((l) => l.id === loteId)).toMatchObject({ estado: "importado", aprobadas: 1, borradores: 1, cargadoPor: expect.any(String) });
      expect(lista.find((l) => l.id === vacio.id)).toMatchObject({ estado: "sin_archivo", archivo: null });
    }));

  it("la vista previa trae los procesos y la unidad con su sufijo, para pintar el nombre y los rangos", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const { loteId } = await loteCon(tx, b.admin, [aprobada(b, `CNT-ID-${unico()}`)]);
      const v = await vistaPrevia(b.admin, loteId, { correspondencias: SIN_CORR, regla: REGLA }, { sql: tx, ahora: AHORA });
      expect(v?.opciones.procesos.some((p) => p.id === b.procesoId)).toBe(true);
      expect(v?.opciones.unidades[0]).toMatchObject({ sufijo: expect.any(String), decimales: expect.any(Number) });
    }));
});

describe("la plantilla vacía", () => {
  it("trae en sus listas los procesos, subprocesos y maestros activos de hoy", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const [inactivo] = await tx`INSERT INTO subprocesos (proceso_id, nombre, slug, orden, activo)
        VALUES (${b.procesoId}, ${`ZZ Inactivo ${unico()}`}, ${`zz-inactivo-${unico()}`}, 2, false) RETURNING nombre`;
      const listas = await listasDePlantilla({ sql: tx });
      expect(listas.procesos).toContain(b.sigla);
      expect(listas.subprocesos).toContain(b.subproceso);
      expect(listas.subprocesos).not.toContain(inactivo.nombre);
      expect(listas.tipos).toContain("Eficacia");
      expect(listas.clasificaciones).toContain("Regulatorio");
      expect(listas.unidades).toContain("Porcentaje");
    }));
});

describe("la vista previa", () => {
  it("dice qué crearía cada fila, sus problemas y las correspondencias pendientes, sin escribir nada", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const codigo = `CNT-ID-${unico()}`;
      const { loteId } = await loteCon(tx, b.admin, [
        aprobada(b, codigo),
        propuesta(b, `CNT-ID-${unico()}`, { subproceso: "Contabilidad general" }),
        aprobada(b, `CNT-ID-${unico()}`, { meta: "noventa" }),
      ]);
      const antes = await tx`SELECT count(*)::int AS n FROM indicadores`;

      const v = (await vistaPrevia(b.admin, loteId, { correspondencias: SIN_CORR, regla: REGLA }, { sql: tx, ahora: AHORA }))!;
      expect(v.filas.map((f) => [f.numero, f.codigo, f.ficha !== null])).toEqual([
        [2, codigo, true],
        [3, expect.any(String), false],
        [4, expect.any(String), false],
      ]);
      expect(v.filas[0].ficha).toMatchObject({
        procesoId: b.procesoId,
        subprocesoId: b.subprocesoId,
        cargoId: b.cargoId,
        estado: "aprobado",
        siglaParaSubproceso: "CNT",
        rangos: { bien: [{ signo: ">=", valor: "95" }], atencion: [{ signo: ">=", valor: "85.5" }], critico: [{ signo: "<", valor: "85.5" }] },
      });
      expect(v.filas[2].problemas).toContain("La meta «noventa» no es un número");
      expect(v.pendientes).toEqual([{ tipo: "subproceso", texto: "Contabilidad general" }]);
      expect(v.opciones.subprocesos).toContainEqual(expect.objectContaining({ id: b.subprocesoId, nombre: b.subproceso }));
      expect(v.opciones.cargos).toContainEqual({ id: b.cargoId, nombre: b.cargo });
      expect(v.opciones.tipos.map((t) => t.nombre)).toContain("Eficacia");
      expect(v.opciones.unidades.map((u) => u.nombre)).toContain("Porcentaje");

      // Elegida la correspondencia, la fila se puede importar.
      const corr = { ...SIN_CORR, subprocesos: { [normalizar("Contabilidad general")]: b.subprocesoId } };
      const conCorr = (await vistaPrevia(b.admin, loteId, { correspondencias: corr, regla: REGLA }, { sql: tx, ahora: AHORA }))!;
      expect(conCorr.filas[1].ficha).toMatchObject({ subprocesoId: b.subprocesoId, estado: "propuesto", cargoId: null });
      expect(conCorr.pendientes).toEqual([]);

      expect(await tx`SELECT count(*)::int AS n FROM indicadores`).toEqual(antes);
      // Quien no administra indicadores no ve el lote.
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [b.procesoId] });
      expect(await vistaPrevia(lider, loteId, { correspondencias: SIN_CORR, regla: REGLA }, { sql: tx, ahora: AHORA })).toBeNull();
    }));

  it("el archivo del almacén se lee por su huella: uno cambiado no se revisa", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const { loteId, absoluta } = await loteCon(tx, b.admin, [aprobada(b, `CNT-ID-${unico()}`)]);
      writeFileSync(absoluta, await plantilla([aprobada(b, `CNT-ID-${unico()}`, { meta: "50" })]));
      await rechaza(
        vistaPrevia(b.admin, loteId, { correspondencias: SIN_CORR, regla: REGLA }, { sql: tx, ahora: AHORA }),
        "El archivo de la importación cambió en el almacén: cree una importación nueva con la plantilla",
      );
    }));
});

describe("importar el lote", () => {
  it("crea las aprobadas con su aprobación previa e históricos hasta la importación, y las propuestas en borrador", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [b.procesoId] });
      const [cod1, cod2] = [`CNT-ID-${unico()}`, `CNT-ID-${unico()}`];
      const { loteId, bytes } = await loteCon(tx, b.admin, [aprobada(b, cod1), propuesta(b, cod2)]);

      expect(await importarLote(b.admin, loteId, datosImportacion({ siglas: { [b.subprocesoId]: "CNT" } }), firmar(tx))).toEqual({
        aprobadas: 1,
        borradores: 1,
        omitidas: 0,
      });

      const a = await indicadorDe(tx, cod1);
      expect(a).toMatchObject({
        estado: "activo",
        version_estado: "aprobada",
        tipo_cambio: "inicial",
        aprobacion_previa_documento: "SGC-TI-002 v1",
        aprobacion_previa_por: "Gerente",
        aprobacion_previa_fecha: "2026-09-11",
        semaforo_modo: "rangos",
        rangos: { bien: [{ signo: ">=", valor: "95" }], atencion: [{ signo: ">=", valor: "85.5" }], critico: [{ signo: "<", valor: "85.5" }] },
        sustento_meta: "Regla de SGC-TI-002 v1: Alerta ≥ 90 % de la meta (ascendente) y ≤ 110 % (descendente)",
        rige_desde: "2026-01",
        requisito: "Ley 1314 de 2009",
        nivel: "Resultado",
        riesgo_asociado: "Sanciones por cierre tardío",
      });
      expect(Number(a.importacion_id)).toBe(loteId);
      expect(Number(a.aprobada_por)).toBe(b.admin.usuarioId);
      expect(Number(a.elaborada_por)).toBe(b.admin.usuarioId);
      expect((a.aprobada_en as Date).toISOString()).toBe(AHORA.toISOString());
      // La huella es la de cualquier versión aprobada, sobre su contenido firmado.
      expect(a.huella).toBe(huellaDeFicha(await contenidoDeVersion(tx, Number(a.version_id))));
      // Una ficha «Regulatoria» importada no exige norma enlazada hasta su siguiente cambio (spec §5.6).
      expect(await tx`SELECT 1 FROM indicador_normas WHERE version_id = ${a.version_id}`).toHaveLength(0);
      // El cargo mide y analiza; la fuente va a cada variable; no se designan personas.
      const responsables = await tx`SELECT cargo_id, funcion FROM indicador_responsables WHERE version_id = ${a.version_id} ORDER BY funcion`;
      expect(responsables.map((r) => [Number(r.cargo_id), r.funcion])).toEqual([
        [b.cargoId, "analizar"],
        [b.cargoId, "medir"],
      ]);
      const variables = await tx`SELECT letra, nombre, fuente, consolidacion FROM indicador_variables WHERE version_id = ${a.version_id} ORDER BY letra`;
      expect(variables.map((v) => ({ ...v }))).toEqual([
        { letra: "A", nombre: "Cierres a tiempo", fuente: "Contabilidad", consolidacion: "suma" },
        { letra: "B", nombre: "Cierres del mes", fuente: "Contabilidad", consolidacion: "suma" },
      ]);
      expect(await tx`SELECT 1 FROM indicador_designados WHERE indicador_id = ${a.id}`).toHaveLength(0);
      // Ni firmas ni avisos: la constancia es el evento del lote.
      expect(await tx`SELECT 1 FROM firmas WHERE indicador_version_id = ${a.version_id}`).toHaveLength(0);
      expect(await tx`SELECT 1 FROM notificaciones WHERE entidad = 'indicador' AND entidad_id = ${a.id}`).toHaveLength(0);

      // Lo terminado antes de la importación es histórico: de enero a octubre, sin tareas.
      const mediciones = await tx`SELECT periodo, historica FROM mediciones WHERE indicador_id = ${a.id} ORDER BY periodo`;
      expect(mediciones.map((m) => m.periodo)).toEqual(
        ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"].map((m) => `2026-${m}`),
      );
      expect(mediciones.every((m) => m.historica === true)).toBe(true);
      const { tareas, vencidas } = await tareasDeIndicadores(lider, { sql: tx, ahora: AHORA });
      expect(tareas.filter((t) => t.titulo.includes(cod1))).toEqual([]);
      expect(vencidas).toBe(0);

      const p = await indicadorDe(tx, cod2);
      expect(p).toMatchObject({
        estado: "borrador",
        version_estado: "borrador",
        proposito: null,
        rangos: { bien: [{ signo: "<=", valor: "30" }], atencion: [{ signo: "<=", valor: "33" }], critico: [{ signo: ">", valor: "33" }] },
        huella: null,
        // Ruling 32: una propuesta es un borrador normal; el lote la recuerda por el detalle de su evento.
        importacion_id: null,
        aprobacion_previa_documento: null,
        aprobacion_previa_por: null,
        aprobacion_previa_fecha: null,
      });
      expect(await tx`SELECT 1 FROM indicador_responsables WHERE version_id = ${p.version_id}`).toHaveLength(0);
      expect(await tx`SELECT 1 FROM mediciones WHERE indicador_id = ${p.id}`).toHaveLength(0);

      // El registro del lote: quién, con qué método, el archivo y su huella, la regla, la aprobación previa y lo creado.
      const eventos = await tx`SELECT tipo, usuario_id, metodo, detalle, creado_en FROM importacion_eventos WHERE importacion_id = ${loteId}`;
      expect(eventos).toHaveLength(1);
      expect(eventos[0]).toMatchObject({ tipo: "importado", metodo: "clave" });
      expect(Number(eventos[0].usuario_id)).toBe(b.admin.usuarioId);
      expect((eventos[0].creado_en as Date).toISOString()).toBe(AHORA.toISOString());
      expect(eventos[0].detalle).toMatchObject({
        codigos: [cod1, cod2],
        regla: REGLA,
        aprobacionPrevia: PREVIA,
        correspondencias: SIN_CORR,
        siglas: [{ subprocesoId: b.subprocesoId, sigla: "CNT" }],
        archivo: { huella: sha256(bytes), nombre: "Matriz de indicadores.xlsx" },
        fichas: [
          { codigo: cod1, indicadorId: Number(a.id), versionId: Number(a.version_id), estado: "aprobado" },
          { codigo: cod2, indicadorId: Number(p.id), versionId: Number(p.version_id), estado: "propuesto" },
        ],
      });
      // Una entrada de bitácora por lote, no una por ficha.
      const bitacora = await tx`SELECT accion, detalle FROM auditoria
        WHERE (entidad = 'importacion_indicadores' AND entidad_id = ${loteId}) OR (entidad = 'indicador' AND entidad_id IN (${a.id}, ${p.id}))
        ORDER BY id`;
      expect(bitacora.map((x) => x.accion)).toEqual(["preparo_importacion_indicadores", "importo_indicadores"]);
      expect(bitacora[1].detalle).toMatchObject({ loteId, aprobadas: 1, borradores: 1, omitidas: 0, codigos: [cod1, cod2] });
      // La sigla elegida queda en el subproceso.
      const [s] = await tx`SELECT sigla FROM subprocesos WHERE id = ${b.subprocesoId}`;
      expect(s.sigla).toBe("CNT");
      expect(await estadoDeLote(tx, loteId)).toBe("importado");
      expect(await autorizarArchivoDeLote(loteId, b.admin, { sql: tx })).toEqual({ ok: false, estado: 409 });

      // Importar otra vez el mismo lote no duplica nada.
      await rechaza(importarLote(b.admin, loteId, datosImportacion(), firmar(tx)), "Esta importación ya se hizo");
      expect(await tx`SELECT 1 FROM importacion_eventos WHERE importacion_id = ${loteId}`).toHaveLength(1);
    }));

  it("si otra importación del lote entra mientras se verifica la clave, esta dice «ya se hizo» y no escribe nada", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const codigo = `CNT-ID-${unico()}`;
      const { loteId } = await loteCon(tx, b.admin, [aprobada(b, codigo)]);
      // La otra importación confirma su evento entre la revisión de afuera y el candado del lote.
      const verificar = async () => {
        await tx`INSERT INTO importacion_eventos (importacion_id, tipo, usuario_id, metodo) VALUES (${loteId}, 'importado', ${b.admin.usuarioId}, 'clave')`;
        return { ok: true as const, metodo: "clave" as const };
      };
      await rechaza(importarLote(b.admin, loteId, datosImportacion(), { sql: tx, ahora: AHORA, verificar }), "Esta importación ya se hizo");
      expect(await tx`SELECT 1 FROM indicadores WHERE codigo = ${codigo}`).toHaveLength(0);
      expect(await tx`SELECT 1 FROM auditoria WHERE accion = 'importo_indicadores' AND entidad_id = ${loteId}`).toHaveLength(0);
    }));

  it("si las filas importables cambian mientras se verifica la clave, no se importa un lote distinto del que se vio", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const [cod1, cod2] = [`CNT-ID-${unico()}`, `CNT-ID-${unico()}`];
      const { loteId } = await loteCon(tx, b.admin, [aprobada(b, cod1), propuesta(b, cod2)]);
      // Alguien desactiva el cargo de la primera fila entre la revisión de afuera y el candado: queda pendiente.
      const verificar = async () => {
        await tx`UPDATE cargos SET activo = false WHERE id = ${b.cargoId}`;
        return { ok: true as const, metodo: "clave" as const };
      };
      await rechaza(
        importarLote(b.admin, loteId, datosImportacion(), { sql: tx, ahora: AHORA, verificar }),
        "La vista previa cambió mientras se importaba: revísela y vuelva a importar",
      );
      expect(await tx`SELECT 1 FROM indicadores WHERE codigo IN (${cod1}, ${cod2})`).toHaveLength(0);
      expect(await estadoDeLote(tx, loteId)).toBe("por_importar");
    }));

  it("una ficha propuesta sigue el camino de aprobación de la app hasta quedar aprobada", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const codigo = `CNT-ID-${unico()}`;
      const { loteId } = await loteCon(tx, b.admin, [propuesta(b, codigo)]);
      expect(await importarLote(b.admin, loteId, datosImportacion(), firmar(tx))).toEqual({ aprobadas: 0, borradores: 1, omitidas: 0 });
      const p = await indicadorDe(tx, codigo);
      expect(p).toMatchObject({ version_estado: "borrador", importacion_id: null, aprobacion_previa_documento: null });
      const [evento] = await tx`SELECT detalle FROM importacion_eventos WHERE importacion_id = ${loteId} AND tipo = 'importado'`;
      expect(evento.detalle.fichas).toEqual([{ codigo, indicadorId: Number(p.id), versionId: Number(p.version_id), estado: "propuesto" }]);
      const [t] = await tx`SELECT id FROM tipos_indicador WHERE nombre = 'Eficacia'`;
      const [c] = await tx`SELECT id FROM clasificaciones_indicador WHERE nombre = 'Estratégico'`;
      const [u] = await tx`SELECT id FROM unidades_indicador WHERE nombre = 'Número'`;
      const completa: DatosFicha = {
        procesoId: b.procesoId,
        subprocesoId: b.subprocesoId,
        codigo,
        nombre: "Glosas contables",
        proposito: "Saber cuántas glosas contables hay",
        tipoId: Number(t.id),
        clasificacionId: Number(c.id),
        forma: "conteo",
        variables: [{ letra: "A", nombre: "Glosas del trimestre", consolidacion: "suma", admiteNegativos: false }],
        unidadId: Number(u.id),
        decimales: 0,
        periodicidad: "trimestral",
        tendencia: "descendente",
        meta: "30",
        semaforoModo: "rangos",
        rangos: JSON.stringify({ bien: [{ signo: "<=", valor: "30" }], atencion: [{ signo: "<=", valor: "33" }], critico: [{ signo: ">", valor: "33" }] }),
        cargosMedir: [b.cargoId],
        cargosAnalizar: [b.cargoId],
        normaIds: [],
        plazoReporteDias: 10,
        inicioMedicion: "2026-T1",
        soporteObligatorio: false,
        nivelAcceso: "general",
        mide: [],
        analiza: [],
        prueba: { valores: { A: "12" } },
      };
      await guardarBorrador(b.admin, Number(p.version_id), completa, { sql: tx, ahora: AHORA });
      await enviarAAprobacion(b.admin, { versionId: Number(p.version_id), credenciales: CLAVE }, firmar(tx));
      const gerente = await usuarioDePrueba(tx, { rol: "gerencia" });
      expect(await aprobarFichas(gerente, { versionIds: [Number(p.version_id)], credenciales: CLAVE }, firmar(tx))).toEqual({ aprobadas: 1 });
      // Aprobada en la app: una versión aprobada corriente, con sus firmas, no «aprobada antes de SGC Integral».
      expect(await indicadorDe(tx, codigo)).toMatchObject({
        estado: "activo",
        version_estado: "aprobada",
        importacion_id: null,
        aprobacion_previa_documento: null,
        aprobacion_previa_por: null,
        aprobacion_previa_fecha: null,
      });
      const firmas = await tx`SELECT firma, usuario_id FROM firmas WHERE indicador_version_id = ${p.version_id} ORDER BY id`;
      expect(firmas.map((f) => [f.firma, Number(f.usuario_id)])).toEqual([
        ["elaboro", b.admin.usuarioId],
        ["aprobo", gerente.usuarioId],
      ]);
    }));

  it("una fila con un código ya usado se omite y el resto entra", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const usado = `CNT-ID-${unico()}`;
      const primero = await loteCon(tx, b.admin, [aprobada(b, usado)]);
      await importarLote(b.admin, primero.loteId, datosImportacion(), firmar(tx));

      const nuevo = `CNT-ID-${unico()}`;
      const segundo = await loteCon(tx, b.admin, [aprobada(b, usado, { nombre: "Repetido" }), aprobada(b, nuevo)]);
      const v = (await vistaPrevia(b.admin, segundo.loteId, { correspondencias: SIN_CORR, regla: REGLA }, { sql: tx, ahora: AHORA }))!;
      expect(v.filas[0].problemas).toContain(`El código ${usado} ya existe en la app`);

      expect(await importarLote(b.admin, segundo.loteId, datosImportacion(), firmar(tx))).toEqual({ aprobadas: 1, borradores: 0, omitidas: 1 });
      expect(await tx`SELECT nombre FROM indicador_versiones v JOIN indicadores i ON i.id = v.indicador_id WHERE i.codigo = ${usado}`).toEqual([
        { nombre: "Oportunidad del cierre contable" },
      ]);
      expect(await indicadorDe(tx, nuevo)).toMatchObject({ estado: "activo", version_estado: "aprobada" });
    }));

  it("los datos de la aprobación previa, la regla y las filas se revisan antes de pedir la clave", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const { loteId } = await loteCon(tx, b.admin, [aprobada(b, `CNT-ID-${unico()}`)]);
      let pedida = false;
      const opciones = { sql: tx, ahora: AHORA, verificar: async () => ((pedida = true), { ok: true as const, metodo: "clave" as const }) };
      const con = (previa: Partial<typeof PREVIA>) => datosImportacion({ aprobacionPrevia: { ...PREVIA, ...previa } });

      await rechaza(importarLote(b.admin, loteId, con({ documento: "  " }), opciones), "El documento de la aprobación previa es obligatorio");
      await rechaza(importarLote(b.admin, loteId, con({ aprobadoPor: "" }), opciones), "Quién aprobó es obligatorio");
      for (const fecha of ["11/09/2026", "2026-02-30", "", "2026-12-01"]) {
        await rechaza(importarLote(b.admin, loteId, con({ fecha }), opciones), "La fecha de la aprobación previa no es válida");
      }
      await rechaza(
        importarLote(b.admin, loteId, datosImportacion({ regla: { pctAscendente: 90.5, pctDescendente: 110 } }), opciones),
        "El porcentaje de Atención en ascendente debe ser un entero entre 1 y 99",
      );
      await rechaza(
        importarLote(b.admin, loteId, datosImportacion({ regla: { pctAscendente: 90, pctDescendente: 100 } }), opciones),
        "El porcentaje de Atención en descendente debe ser un entero entre 101 y 999",
      );
      await rechaza(
        importarLote(b.admin, loteId, datosImportacion({ siglas: { [b.subprocesoId]: "CNT", 1: "XYZ" } }), opciones),
        "Solo se da sigla a un subproceso de la importación que aún no la tiene",
      );
      await rechaza(importarLote(b.admin, 999_999_999, datosImportacion(), opciones), "La importación no existe");
      const sinArchivo = await crearLote(b.admin, { sql: tx, ahora: AHORA });
      await rechaza(importarLote(b.admin, sinArchivo.id, datosImportacion(), opciones), "Suba primero la plantilla de la importación");
      const conProblemas = await loteCon(tx, b.admin, [aprobada(b, `CNT-ID-${unico()}`, { sentido: "Constante" })]);
      await rechaza(importarLote(b.admin, conProblemas.loteId, datosImportacion(), opciones), "No hay filas para importar");
      expect(pedida).toBe(false);
      await rechaza(importarLote(await usuarioDePrueba(tx, { rol: "gerencia" }), loteId, datosImportacion(), opciones), new ErrorPermiso().message, ErrorPermiso);

      // Con la clave equivocada no se escribe nada.
      await rechaza(importarLote(b.admin, loteId, datosImportacion({ credenciales: { clave: "mala" } }), firmar(tx)), "Clave o código incorrectos", ErrorFirma);
      expect(await estadoDeLote(tx, loteId)).toBe("por_importar");
    }));
});
