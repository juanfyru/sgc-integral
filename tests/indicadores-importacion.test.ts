/**
 * Importar un lote de fichas aprobadas antes de SGC Integral (spec fase 14A §5.3 a §5.8; Tarea 9): el lote, su plantilla
 * en el almacén, la vista previa y la importación con la clave. Contra la BD de desarrollo, dentro de una transacción que
 * se revierte: ningún lote, evento, ficha aprobada ni sigla queda confirmado. La plantilla se arma en memoria con
 * `plantillaDeImportacion` y se escribe en una carpeta de prueba del almacén que se borra al final.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
import { abrirCambio, contenidoDeVersion, errorDeFichaImportada, guardarBorrador } from "@/db/consultas/indicadores/fichas";
import { registrarHistoricos } from "@/db/consultas/indicadores/historicos";
import {
  archivoDeLote,
  autorizarArchivoDeLote,
  condicionDeDeshacer,
  crearLote,
  datosDeFichaImportada,
  deshacerImportacion,
  estadoDeLote,
  importarLote,
  lotesRecientes,
  resumenDeLote,
  listasDePlantilla,
  vistaPrevia,
} from "@/db/consultas/indicadores/importacion";
import { asegurarMediciones } from "@/db/consultas/indicadores/mediciones";
import { borrarIndicador, designar } from "@/db/consultas/indicadores/operacion";
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

/** La ficha de la fila «Propuesto» completada en la app: con propósito y cargos, lista para enviarse a aprobación. */
async function propuestaCompleta(tx: TransactionSql, b: Base, codigo: string): Promise<DatosFicha> {
  const [t] = await tx`SELECT id FROM tipos_indicador WHERE nombre = 'Eficacia'`;
  const [c] = await tx`SELECT id FROM clasificaciones_indicador WHERE nombre = 'Estratégico'`;
  const [u] = await tx`SELECT id FROM unidades_indicador WHERE nombre = 'Número'`;
  return {
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

  it("una vista previa vieja respecto de la base no se importa: los códigos que se vieron deben ser los de hoy (Ruling 38)", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const [cod1, cod2] = [`CNT-ID-${unico()}`, `CNT-ID-${unico()}`];
      const { loteId } = await loteCon(tx, b.admin, [aprobada(b, cod1), propuesta(b, cod2)]);
      const vista = (await vistaPrevia(b.admin, loteId, { correspondencias: SIN_CORR, regla: REGLA }, { sql: tx, ahora: AHORA }))!;
      const vistos = vista.filas.filter((f) => f.ficha).map((f) => f.ficha!.codigo.toLowerCase()).sort().join("\n");
      // Antes de dar la clave, alguien desactiva el cargo de la primera fila: la vista que se firmó ya no es la de hoy.
      await tx`UPDATE cargos SET activo = false WHERE id = ${b.cargoId}`;
      let pidioClave = false;
      const verificar = async () => ((pidioClave = true), { ok: true as const, metodo: "clave" as const });
      await rechaza(
        importarLote(b.admin, loteId, datosImportacion({ codigos: vistos }), { sql: tx, ahora: AHORA, verificar }),
        "La vista previa cambió mientras se importaba: revísela y vuelva a importar",
      );
      expect(pidioClave).toBe(false);
      expect(await tx`SELECT 1 FROM indicadores WHERE codigo = ${cod1}`).toHaveLength(0);
    }));

  it("los códigos llegan por el formulario con «\r\n» o con comas y la importación los acepta; si la vista quedó vieja, el mensaje es el de la vista y no el de las siglas", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const [cod1, cod2] = [`CNT-ID-${unico()}`, `CNT-ID-${unico()}`];
      const { loteId } = await loteCon(tx, b.admin, [aprobada(b, cod1), propuesta(b, cod2)]);
      const orden = [cod1, cod2].map((x) => x.toLowerCase()).sort();
      // Una sigla que no se puede dar: si se revisara antes que la vista, el mensaje sería el de las siglas.
      await rechaza(
        importarLote(b.admin, loteId, datosImportacion({ siglas: { 999999999: "ZZZ" }, codigos: "otro-codigo" }), firmar(tx)),
        "La vista previa cambió mientras se importaba: revísela y vuelva a importar",
      );
      const conCrLf = orden.join("\r\n");
      expect(await importarLote(b.admin, loteId, datosImportacion({ siglas: { [b.subprocesoId]: "CNT" }, codigos: conCrLf }), firmar(tx))).toMatchObject({
        aprobadas: 1,
        borradores: 1,
      });
    }));

  it("con los códigos que se vieron, la importación sigue igual; sin ellos, también", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const [cod1, cod2] = [`CNT-ID-${unico()}`, `CNT-ID-${unico()}`];
      const { loteId } = await loteCon(tx, b.admin, [aprobada(b, cod1), propuesta(b, cod2)]);
      const vistos = [cod1, cod2].map((x) => x.toLowerCase()).sort().join("\n");
      expect(await importarLote(b.admin, loteId, datosImportacion({ siglas: { [b.subprocesoId]: "CNT" }, codigos: vistos }), firmar(tx))).toMatchObject({
        aprobadas: 1,
        borradores: 1,
      });
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
      await guardarBorrador(b.admin, Number(p.version_id), await propuestaCompleta(tx, b, codigo), { sql: tx, ahora: AHORA });
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

// ─────────────────────────────────────────────────────────────────────────────
// Deshacer la importación (spec §5.9; Tarea 11)
// ─────────────────────────────────────────────────────────────────────────────

const MOTIVO = "Las metas se escribieron como fracción en la plantilla";
/** Después de la importación: noviembre ya terminó y es el primer periodo ordinario de la ficha aprobada. */
const DESPUES = new Date("2026-12-05T15:00:00Z");
const despues = (tx: TransactionSql) => ({ sql: tx, ahora: DESPUES, verificar: firmaDePrueba });

type Importado = {
  loteId: number;
  bytes: Buffer;
  cod1: string;
  cod2: string;
  aprobadaId: number;
  aprobadaVersion: number;
  propuestaId: number;
  propuestaVersion: number;
};

/** Un lote importado: una ficha «Aprobado», con sus históricos, y una «Propuesto»; el subproceso recibe la sigla CNT. */
async function importado(tx: TransactionSql, b: Base): Promise<Importado> {
  const [cod1, cod2] = [`CNT-ID-${unico()}`, `CNT-ID-${unico()}`];
  const { loteId, bytes } = await loteCon(tx, b.admin, [aprobada(b, cod1), propuesta(b, cod2)]);
  await importarLote(b.admin, loteId, datosImportacion({ siglas: { [b.subprocesoId]: "CNT" } }), firmar(tx));
  const a = await indicadorDe(tx, cod1);
  const p = await indicadorDe(tx, cod2);
  return {
    loteId,
    bytes,
    cod1,
    cod2,
    aprobadaId: Number(a.id),
    aprobadaVersion: Number(a.version_id),
    propuestaId: Number(p.id),
    propuestaVersion: Number(p.version_id),
  };
}

/** Una verificación de la clave que recuerda si se pidió. */
function clavePedida() {
  const c = { pedida: false, verificar: async () => ((c.pedida = true), { ok: true as const, metodo: "clave" as const }) };
  return c;
}

class Deshecho extends Error {}

/** Corre `fn` en un punto de guardado que siempre se revierte: cada caso parte del mismo lote recién importado. */
async function aparte(tx: TransactionSql, fn: (sp: TransactionSql) => Promise<void>): Promise<void> {
  try {
    await tx.savepoint(async (sp) => {
      await fn(sp);
      throw new Deshecho();
    });
  } catch (err) {
    if (!(err instanceof Deshecho)) throw err;
  }
}

/** Lo que queda de las fichas del lote, en cada tabla que deshacer vacía. */
async function quedan(tx: TransactionSql, f: Importado) {
  const ids = [f.aprobadaId, f.propuestaId];
  const versiones = [f.aprobadaVersion, f.propuestaVersion];
  const cuenta = async (consulta: Promise<readonly unknown[]>) => (await consulta).length;
  return {
    indicadores: await cuenta(tx`SELECT 1 FROM indicadores WHERE id IN ${tx(ids)}`),
    versiones: await cuenta(tx`SELECT 1 FROM indicador_versiones WHERE indicador_id IN ${tx(ids)}`),
    variables: await cuenta(tx`SELECT 1 FROM indicador_variables WHERE version_id IN ${tx(versiones)}`),
    responsables: await cuenta(tx`SELECT 1 FROM indicador_responsables WHERE version_id IN ${tx(versiones)}`),
    mediciones: await cuenta(tx`SELECT 1 FROM mediciones WHERE indicador_id IN ${tx(ids)}`),
    metas: await cuenta(tx`SELECT 1 FROM indicador_metas WHERE indicador_id IN ${tx(ids)}`),
  };
}

const NADA = { indicadores: 0, versiones: 0, variables: 0, responsables: 0, mediciones: 0, metas: 0 };

describe("deshacer la importación", () => {
  it("borra las fichas del lote con sus periodos abiertos sin datos y sus metas, deja el registro y libera los códigos", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const f = await importado(tx, b);
      // Pasado noviembre se abre su periodo ordinario y sale su aviso; y alguien programó la meta de enero: nada de eso es un dato.
      await asegurarMediciones({ sql: tx, ahora: DESPUES, indicadorId: f.aprobadaId });
      await tx`UPDATE mediciones SET aviso_previo_en = ${DESPUES} WHERE indicador_id = ${f.aprobadaId} AND periodo = '2026-11'`;
      await tx`INSERT INTO indicador_metas (indicador_id, periodo, meta, programada_por, programada_en)
        VALUES (${f.aprobadaId}, '2027-01', 96, ${b.admin.usuarioId}, ${DESPUES})`;
      expect(await quedan(tx, f)).toEqual({ indicadores: 2, versiones: 2, variables: 3, responsables: 2, mediciones: 11, metas: 1 });
      expect(await condicionDeDeshacer(tx, f.loteId)).toEqual({ puede: true, impiden: [] });

      expect(await deshacerImportacion(b.admin, f.loteId, { motivo: `  ${MOTIVO}  `, credenciales: CLAVE }, despues(tx))).toEqual({ fichas: 2 });

      expect(await quedan(tx, f)).toEqual(NADA);
      // El registro del lote: el evento «importado» sigue y se le añade «deshecho» con quién, cuándo, el motivo y los códigos.
      const eventos = await tx`SELECT tipo, usuario_id, metodo, detalle, creado_en FROM importacion_eventos WHERE importacion_id = ${f.loteId} ORDER BY id`;
      expect(eventos.map((e) => e.tipo)).toEqual(["importado", "deshecho"]);
      expect(eventos[1]).toMatchObject({ metodo: "clave", detalle: { motivo: MOTIVO, codigos: [f.cod1, f.cod2] } });
      expect(Number(eventos[1].usuario_id)).toBe(b.admin.usuarioId);
      expect((eventos[1].creado_en as Date).toISOString()).toBe(DESPUES.toISOString());
      const bitacora = await tx`SELECT usuario_id, entidad, detalle FROM auditoria
        WHERE accion = 'deshizo_importacion_indicadores' AND entidad_id = ${f.loteId}`;
      expect(bitacora).toHaveLength(1);
      expect({ usuario: Number(bitacora[0].usuario_id), entidad: bitacora[0].entidad }).toEqual({
        usuario: b.admin.usuarioId,
        entidad: "importacion_indicadores",
      });
      expect(bitacora[0].detalle).toEqual({ loteId: f.loteId, motivo: MOTIVO, codigos: [f.cod1, f.cod2], fichas: 2 });
      // La sigla que se le dio al subproceso queda, y la plantilla subida sigue como soporte del lote.
      const [s] = await tx`SELECT sigla FROM subprocesos WHERE id = ${b.subprocesoId}`;
      expect(s.sigla).toBe("CNT");
      expect(await archivoDeLote(b.admin, f.loteId, { sql: tx })).not.toBeNull();
      expect(await estadoDeLote(tx, f.loteId)).toBe("deshecho");
      expect(await resumenDeLote(b.admin, f.loteId, { sql: tx })).toMatchObject({ estado: "deshecho" });
      expect((await lotesRecientes(b.admin, { sql: tx })).find((l) => l.id === f.loteId)).toMatchObject({ estado: "deshecho" });
      expect(await condicionDeDeshacer(tx, f.loteId)).toEqual({ puede: false, impiden: [] });

      // La misma plantilla entra otra vez, con los mismos códigos, en un lote nuevo.
      const otro = await crearLote(b.admin, { sql: tx, ahora: DESPUES });
      await subir(tx, b.admin, otro.id, f.bytes);
      expect(await importarLote(b.admin, otro.id, datosImportacion(), despues(tx))).toEqual({ aprobadas: 1, borradores: 1, omitidas: 0 });
      const otra = await indicadorDe(tx, f.cod1);
      expect(otra).toMatchObject({ estado: "activo", version_estado: "aprobada" });
      expect(Number(otra.importacion_id)).toBe(otro.id);
    }));

  it("una medición reportada lo impide: la condición dice qué ficha y por qué, y no se pide la clave", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const f = await importado(tx, b);
      expect(
        await registrarHistoricos(b.admin, { indicadorId: f.aprobadaId, filas: [{ periodo: "2026-03", valores: { A: "8", B: "10" } }] }, { sql: tx, ahora: AHORA }),
      ).toEqual({ registrados: 1 });
      expect(await condicionDeDeshacer(tx, f.loteId)).toEqual({ puede: false, impiden: [{ codigo: f.cod1, motivo: "tiene datos reportados" }] });
      const c = clavePedida();
      await rechaza(
        deshacerImportacion(b.admin, f.loteId, { motivo: MOTIVO, credenciales: CLAVE }, { sql: tx, ahora: AHORA, verificar: c.verificar }),
        `No se puede deshacer: ${f.cod1} tiene datos reportados`,
      );
      expect(c.pedida).toBe(false);
      expect((await quedan(tx, f)).indicadores).toBe(2);
      expect(await estadoDeLote(tx, f.loteId)).toBe("importado");
    }));

  it("cualquier dato de una medición cuenta: «no aplica», la fecha de reporte, un análisis, un valor, una observación, un evento o un soporte", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const f = await importado(tx, b);
      const [m] = await tx`SELECT id, version_id FROM mediciones WHERE indicador_id = ${f.aprobadaId} AND periodo = '2026-02'`;
      const casos: [string, (sp: TransactionSql) => Promise<unknown>][] = [
        ["no aplica", (sp) => sp`UPDATE mediciones SET no_aplica = true, no_aplica_motivo = 'No hubo cierres ese mes' WHERE id = ${m.id}`],
        ["reportada_en", (sp) => sp`UPDATE mediciones SET reportada_en = ${AHORA} WHERE id = ${m.id}`],
        ["análisis", (sp) => sp`UPDATE mediciones SET analisis = 'El cierre salió tarde por la auditoría' WHERE id = ${m.id}`],
        [
          "valor",
          (sp) => sp`INSERT INTO medicion_valores (medicion_id, variable_id, valor)
            SELECT ${m.id}, id, 1 FROM indicador_variables WHERE version_id = ${m.version_id} ORDER BY letra LIMIT 1`,
        ],
        ["observación", (sp) => sp`INSERT INTO medicion_observaciones (medicion_id, usuario_id, texto) VALUES (${m.id}, ${b.admin.usuarioId}, 'Revisar el dato')`],
        ["evento", (sp) => sp`INSERT INTO medicion_eventos (medicion_id, tipo, usuario_id) VALUES (${m.id}, 'cierre', ${b.admin.usuarioId})`],
        [
          "soporte",
          (sp) => sp`INSERT INTO archivos (contexto, contexto_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
            VALUES ('medicion', ${m.id}, 'evidencia', ${`zz-soporte-${unico()}.pdf`}, 'cierre.pdf', 'pdf', 'application/pdf', 10, 'h')`,
        ],
      ];
      for (const [nombre, escribir] of casos) {
        await aparte(tx, async (sp) => {
          await escribir(sp);
          expect({ nombre, condicion: await condicionDeDeshacer(sp, f.loteId) }).toEqual({
            nombre,
            condicion: { puede: false, impiden: [{ codigo: f.cod1, motivo: "tiene datos reportados" }] },
          });
        });
      }
      // Sin nada de eso, sí se puede.
      expect(await condicionDeDeshacer(tx, f.loteId)).toEqual({ puede: true, impiden: [] });
    }));

  it("una persona designada lo impide", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const f = await importado(tx, b);
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [b.procesoId] });
      await designar(b.admin, { indicadorId: f.propuestaId, funcion: "mide", usuarioIds: [lider.usuarioId] }, { sql: tx, ahora: AHORA });
      expect(await condicionDeDeshacer(tx, f.loteId)).toEqual({ puede: false, impiden: [{ codigo: f.cod2, motivo: "tiene personas designadas" }] });
      await rechaza(
        deshacerImportacion(b.admin, f.loteId, { motivo: MOTIVO, credenciales: CLAVE }, firmar(tx)),
        `No se puede deshacer: ${f.cod2} tiene personas designadas`,
      );
    }));

  it("una versión posterior de una ficha aprobada lo impide, aunque sea un borrador de cambio", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const f = await importado(tx, b);
      await abrirCambio(b.admin, f.aprobadaId, { sql: tx, ahora: DESPUES });
      expect(await condicionDeDeshacer(tx, f.loteId)).toEqual({ puede: false, impiden: [{ codigo: f.cod1, motivo: "tiene una versión posterior" }] });
      await rechaza(
        deshacerImportacion(b.admin, f.loteId, { motivo: MOTIVO, credenciales: CLAVE }, despues(tx)),
        `No se puede deshacer: ${f.cod1} tiene una versión posterior`,
      );
    }));

  it("una propuesta modificada después de importarse lo impide; una enviada a aprobación lo dice así", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const f = await importado(tx, b);
      await guardarBorrador(b.admin, f.propuestaVersion, await propuestaCompleta(tx, b, f.cod2), { sql: tx, ahora: DESPUES });
      expect(await condicionDeDeshacer(tx, f.loteId)).toEqual({
        puede: false,
        impiden: [{ codigo: f.cod2, motivo: "la propuesta se modificó después de importarse" }],
      });
      await rechaza(
        deshacerImportacion(b.admin, f.loteId, { motivo: MOTIVO, credenciales: CLAVE }, despues(tx)),
        `No se puede deshacer: ${f.cod2} la propuesta se modificó después de importarse`,
      );
      // Enviada, tiene la firma «Elaboró», que no se borra: lo dice una sola vez, por la firma.
      await enviarAAprobacion(b.admin, { versionId: f.propuestaVersion, credenciales: CLAVE }, despues(tx));
      expect(await condicionDeDeshacer(tx, f.loteId)).toEqual({
        puede: false,
        impiden: [{ codigo: f.cod2, motivo: "la propuesta ya se envió a aprobación" }],
      });
    }));

  it("los impedimentos van en el orden de las fichas y el mensaje dice el primero", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const f = await importado(tx, b);
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [b.procesoId] });
      await guardarBorrador(b.admin, f.propuestaVersion, await propuestaCompleta(tx, b, f.cod2), { sql: tx, ahora: DESPUES });
      await designar(b.admin, { indicadorId: f.aprobadaId, funcion: "analiza", usuarioIds: [lider.usuarioId] }, { sql: tx, ahora: DESPUES });
      await registrarHistoricos(b.admin, { indicadorId: f.aprobadaId, filas: [{ periodo: "2026-03", valores: { A: "8", B: "10" } }] }, { sql: tx, ahora: DESPUES });
      expect(await condicionDeDeshacer(tx, f.loteId)).toEqual({
        puede: false,
        impiden: [
          { codigo: f.cod1, motivo: "tiene datos reportados" },
          { codigo: f.cod1, motivo: "tiene personas designadas" },
          { codigo: f.cod2, motivo: "la propuesta se modificó después de importarse" },
        ],
      });
      await rechaza(
        deshacerImportacion(b.admin, f.loteId, { motivo: MOTIVO, credenciales: CLAVE }, despues(tx)),
        `No se puede deshacer: ${f.cod1} tiene datos reportados`,
      );
    }));

  it("una propuesta que se borró en la app ya no está: se deshace el resto", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const f = await importado(tx, b);
      await borrarIndicador(b.admin, f.propuestaId, { sql: tx, ahora: AHORA });
      expect(await condicionDeDeshacer(tx, f.loteId)).toEqual({ puede: true, impiden: [] });
      expect(await deshacerImportacion(b.admin, f.loteId, { motivo: MOTIVO, credenciales: CLAVE }, despues(tx))).toEqual({ fichas: 1 });
      expect(await quedan(tx, f)).toEqual(NADA);
      const [e] = await tx`SELECT detalle FROM importacion_eventos WHERE importacion_id = ${f.loteId} AND tipo = 'deshecho'`;
      expect(e.detalle).toEqual({ motivo: MOTIVO, codigos: [f.cod1] });
    }));

  it("deshacer dos veces: la segunda dice «ya se deshizo», también si la otra entra mientras se verifica la clave", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const f = await importado(tx, b);
      await aparte(tx, async (sp) => {
        await deshacerImportacion(b.admin, f.loteId, { motivo: MOTIVO, credenciales: CLAVE }, despues(sp));
        const c = clavePedida();
        await rechaza(
          deshacerImportacion(b.admin, f.loteId, { motivo: MOTIVO, credenciales: CLAVE }, { sql: sp, ahora: DESPUES, verificar: c.verificar }),
          "Esta importación ya se deshizo",
        );
        expect(c.pedida).toBe(false);
        expect(await sp`SELECT 1 FROM importacion_eventos WHERE importacion_id = ${f.loteId} AND tipo = 'deshecho'`).toHaveLength(1);
      });
      // El otro «deshacer» confirma su evento entre la revisión de afuera y el candado del lote.
      const verificar = async () => {
        await tx`INSERT INTO importacion_eventos (importacion_id, tipo, usuario_id, metodo) VALUES (${f.loteId}, 'deshecho', ${b.admin.usuarioId}, 'clave')`;
        return { ok: true as const, metodo: "clave" as const };
      };
      await rechaza(
        deshacerImportacion(b.admin, f.loteId, { motivo: MOTIVO, credenciales: CLAVE }, { sql: tx, ahora: DESPUES, verificar }),
        "Esta importación ya se deshizo",
      );
      expect((await quedan(tx, f)).indicadores).toBe(2);
      expect(await tx`SELECT 1 FROM auditoria WHERE accion = 'deshizo_importacion_indicadores' AND entidad_id = ${f.loteId}`).toHaveLength(0);
    }));

  it("si alguien designa a una persona mientras se verifica la clave, la revisión dentro del candado lo ve y no borra nada", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const f = await importado(tx, b);
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [b.procesoId] });
      const verificar = async () => {
        await tx`INSERT INTO indicador_designados (indicador_id, usuario_id, funcion, creado_por)
          VALUES (${f.aprobadaId}, ${lider.usuarioId}, 'mide', ${b.admin.usuarioId})`;
        return { ok: true as const, metodo: "clave" as const };
      };
      await rechaza(
        deshacerImportacion(b.admin, f.loteId, { motivo: MOTIVO, credenciales: CLAVE }, { sql: tx, ahora: DESPUES, verificar }),
        `No se puede deshacer: ${f.cod1} tiene personas designadas`,
      );
      expect((await quedan(tx, f)).indicadores).toBe(2);
      expect(await estadoDeLote(tx, f.loteId)).toBe("importado");
    }));

  it("el motivo, el permiso, el lote y la clave se revisan, y sin la clave correcta no se borra nada", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const f = await importado(tx, b);
      const c = clavePedida();
      const opciones = { sql: tx, ahora: DESPUES, verificar: c.verificar };
      const con = (motivo: string, loteId = f.loteId) => deshacerImportacion(b.admin, loteId, { motivo, credenciales: CLAVE }, opciones);

      await rechaza(con("   corto   "), "El motivo debe tener al menos 10 caracteres");
      await rechaza(con("x".repeat(501)), "El motivo no puede pasar de 500 caracteres");
      // El motivo va antes que el lote.
      await rechaza(con("corto", 999_999_999), "El motivo debe tener al menos 10 caracteres");
      await rechaza(con(MOTIVO, 999_999_999), "La importación no existe");
      expect(await condicionDeDeshacer(tx, 999_999_999)).toEqual({ puede: false, impiden: [] });
      const porImportar = await loteCon(tx, b.admin, [aprobada(b, `CNT-ID-${unico()}`)]);
      expect(await condicionDeDeshacer(tx, porImportar.loteId)).toEqual({ puede: false, impiden: [] });
      await rechaza(con(MOTIVO, porImportar.loteId), "Esta importación no se ha hecho");
      const sinArchivo = await crearLote(b.admin, { sql: tx, ahora: AHORA });
      await rechaza(con(MOTIVO, sinArchivo.id), "Esta importación no se ha hecho");
      expect(c.pedida).toBe(false);

      const gerente = await usuarioDePrueba(tx, { rol: "gerencia" });
      await rechaza(deshacerImportacion(gerente, f.loteId, { motivo: MOTIVO, credenciales: CLAVE }, opciones), new ErrorPermiso().message, ErrorPermiso);
      await rechaza(
        deshacerImportacion(b.admin, f.loteId, { motivo: MOTIVO, credenciales: { clave: "mala" } }, despues(tx)),
        "Clave o código incorrectos",
        ErrorFirma,
      );
      expect((await quedan(tx, f)).indicadores).toBe(2);
      expect(await estadoDeLote(tx, f.loteId)).toBe("importado");
    }));
});

describe("la marca de transacción que deja borrar una versión importada", () => {
  const raiz = path.resolve(import.meta.dirname, "..");
  const fuentes = readdirSync(path.join(raiz, "src"), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(ts|tsx|js|mjs|cjs|sql)$/.test(e.name))
    .map((e) => path.join(e.parentPath, e.name));

  it("la pone un solo lugar de src/, el que deshace la importación, y solo para su transacción", () => {
    const llamadas = fuentes.flatMap((archivo) =>
      [...readFileSync(archivo, "utf8").matchAll(/set_config\(\s*['"]sgc\.deshacer_importacion['"]\s*,(.*)$/gm)].map((m) => ({
        archivo: path.relative(raiz, archivo).replaceAll("\\", "/"),
        resto: m[1],
      })),
    );
    expect(llamadas.map((l) => l.archivo)).toEqual(["src/db/consultas/indicadores/importacion.ts"]);
    // `true`: la marca dura la transacción; sin él quedaría en la conexión del pool para quien la use después.
    expect(llamadas[0].resto).toMatch(/,\s*true\s*\)/);
    // Tampoco con SET, que también duraría la sesión entera.
    expect(fuentes.filter((archivo) => /\bSET\s+(?:SESSION\s+|LOCAL\s+)?sgc\.deshacer_importacion\b/i.test(readFileSync(archivo, "utf8")))).toEqual([]);
  });
});
