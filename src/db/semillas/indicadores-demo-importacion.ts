/**
 * El lote importado de la demo (spec 14A §8): una plantilla pequeña armada con el código de la app (`plantillaDeImportacion`),
 * con dos filas, y llevada por `crearLote` e `importarLote` como la llevaría la persona. La «Aprobado» entra aprobada
 * antes de SGC Integral (aprobación previa «SGC-TI-002 v1», «Gerente», 2026-09-11) y la «Propuesto» queda en borrador. La
 * plantilla queda en el almacén como un archivo real, con la huella de su fila de `archivos`, para que la vista previa y
 * la descarga del lote la lean. La firma es la de la demo.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import type { Sql } from "postgres";
import { resolverRutaAlmacen } from "../../lib/almacen";
import { COLUMNAS, type ClaveColumna } from "../../lib/indicadores/importacion/columnas";
import { plantillaDeImportacion } from "../../lib/indicadores/importacion/plantilla";
import { MIME_XLSX } from "../../lib/subida";
import { registrarArchivo } from "../consultas/admin";
import type { SesionFlujo } from "../consultas/flujo/contrato";
import { crearLote, importarLote, listasDePlantilla } from "../consultas/indicadores/importacion";
import { FIRMA, firmaDeLaDemo } from "./vigencia-demo";

const NOMBRE_ARCHIVO = "indicadores-tesoreria-y-presupuesto.xlsx";

type Fila = Partial<Record<ClaveColumna, string>>;

/** Dos filas: la de tesorería, aprobada antes (propone la sigla `TSR`), y la de presupuesto, propuesta. */
function filasDelLote(inicio: string): Fila[] {
  const comunes: Fila = {
    proceso: "GRF",
    tipo: "Eficacia",
    clasificacion: "Operativo",
    nivel: "Proceso",
    forma: "Porcentaje",
    unidad: "Porcentaje",
    sentido: "Ascendente",
    periodicidad: "Mensual",
    cargo: "Subgerente Administrativo",
    inicioMedicion: inicio,
  };
  return [
    {
      ...comunes,
      codigo: "TSR-ID-001",
      nombre: "Oportunidad en el pago a proveedores",
      subproceso: "Gestión Tesorería",
      objetivo: "Medir si las cuentas de los proveedores se pagan dentro del plazo pactado.",
      variableA: "Cuentas de proveedores pagadas en el plazo",
      variableB: "Cuentas de proveedores radicadas",
      meta: "90",
      fuente: "Informe mensual de tesorería",
      riesgo: "Pérdida de proveedores por mora en el pago",
      estado: "Aprobado",
    },
    {
      ...comunes,
      codigo: "GRF-ID-001",
      nombre: "Ejecución del presupuesto de gastos",
      subproceso: "Gestión Presupuestal",
      objetivo: "Medir qué parte del presupuesto de gastos del mes se ejecutó.",
      variableA: "Presupuesto de gastos ejecutado",
      variableB: "Presupuesto de gastos programado",
      meta: "95",
      fuente: "Informe de ejecución presupuestal",
      estado: "Propuesto",
    },
  ];
}

/** La plantilla vacía de la app con las filas escritas debajo de los encabezados (sus columnas siguen el orden de `COLUMNAS`). */
async function plantillaLlena(sql: Sql, filas: Fila[]): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load((await plantillaDeImportacion(await listasDePlantilla({ sql }))) as unknown as ArrayBuffer);
  const hoja = libro.getWorksheet("Indicadores");
  if (!hoja) throw new Error("La plantilla de la app no trae la hoja «Indicadores»");
  filas.forEach((fila, i) => {
    COLUMNAS.forEach((c, k) => {
      const valor = fila[c.clave];
      if (valor !== undefined) hoja.getCell(i + 2, k + 1).value = valor;
    });
  });
  return Buffer.from(await libro.xlsx.writeBuffer());
}

export async function sembrarLoteImportado(sql: Sql, coordinadora: SesionFlujo, inicio: string, ahora: Date): Promise<void> {
  const { id: loteId } = await crearLote(coordinadora, { sql, ahora });
  const bytes = await plantillaLlena(sql, filasDelLote(inicio));
  const ruta = `importaciones/${loteId}/${NOMBRE_ARCHIVO}`;
  const destino = resolverRutaAlmacen(ruta);
  if (!destino) throw new Error(`Ruta de almacén inválida: ${ruta}`);
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, bytes);
  await registrarArchivo(
    {
      versionId: null,
      rol: "evidencia",
      ruta,
      nombreOriginal: NOMBRE_ARCHIVO,
      extension: "xlsx",
      mime: MIME_XLSX,
      tamanoBytes: bytes.length,
      hashSha256: createHash("sha256").update(bytes).digest("hex"),
      contexto: "importacion_indicadores",
      contextoId: loteId,
    },
    coordinadora.usuarioId,
    { sql },
  );
  const [sub] = await sql`SELECT id FROM subprocesos WHERE nombre = 'Gestión Tesorería'`;
  if (!sub) throw new Error("La demo no trae el subproceso Gestión Tesorería");
  const r = await importarLote(
    coordinadora,
    loteId,
    {
      correspondencias: { subprocesos: {}, cargos: {}, tipos: {}, unidades: {} },
      regla: { pctAscendente: 90, pctDescendente: 110 },
      aprobacionPrevia: { documento: "SGC-TI-002 v1", aprobadoPor: "Gerente", fecha: "2026-09-11" },
      siglas: { [Number(sub.id)]: "TSR" },
      credenciales: FIRMA,
    },
    { sql, ahora, verificar: firmaDeLaDemo },
  );
  if (r.aprobadas !== 1 || r.borradores !== 1 || r.omitidas !== 0) {
    throw new Error(`El lote importado de la demo quedó en ${r.aprobadas} aprobada(s), ${r.borradores} borrador(es) y ${r.omitidas} omitida(s)`);
  }
}
