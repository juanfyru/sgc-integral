/**
 * La semilla mínima de una instalación nueva (13C, resolución 9 de la Tarea 14): deja las claves de configuración de la
 * vigencia, del informe y de las metas con sus valores por defecto, el tipo «Documento externo» y los tipos de norma; y,
 * de la 14A (spec 14 §22), los tres maestros y los cinco parámetros de los indicadores. No se ejecuta contra la base:
 * `sembrarBase` corre sobre una conexión falsa que solo anota lo que insertaría.
 */
import { describe, expect, it } from "vitest";
import { CONFIG_DOCUMENTAL_DEFECTO } from "@/db/consultas/config-documental";
import { CAMPOS_PARAMETROS, PARAMETROS_DEFECTO } from "@/db/consultas/indicadores/maestros";
import * as e from "@/db/esquema";
import { sembrarBase, TIPOS_NORMA, type Db } from "@/db/semillas/minima";

type Fila = Record<string, unknown>;

/** Lo que `sembrarBase` insertaría, por tabla; `returning` devuelve las filas con un id. */
async function loQueSiembra(): Promise<Map<unknown, Fila[]>> {
  const insertadas = new Map<unknown, Fila[]>();
  const db = {
    insert: (tabla: unknown) => ({
      values: (filas: Fila[]) => {
        insertadas.set(tabla, [...(insertadas.get(tabla) ?? []), ...filas]);
        return Object.assign(Promise.resolve(), { returning: async () => filas.map((f, i) => ({ ...f, id: i + 1 })) });
      },
    }),
  } as unknown as Db;
  await sembrarBase(db);
  return insertadas;
}

describe("sembrarBase", () => {
  it("deja las claves de la 13C con los valores por defecto de la configuración documental", async () => {
    const configuracion = new Map(((await loQueSiembra()).get(e.configuracion) ?? []).map((f) => [f.clave, f.valor]));
    const { vigencia, metas } = CONFIG_DOCUMENTAL_DEFECTO;
    expect(Object.fromEntries([...configuracion].filter(([clave]) => /^(revision_|externos_|impacto_|formato_informe_|meta_)/.test(String(clave))))).toEqual({
      revision_atencion_dias: String(vigencia.atencionDias),
      revision_anual_plazo_dias: String(vigencia.revisionAnualPlazoDias),
      revision_anual_ventana_meses: String(vigencia.revisionAnualVentanaMeses),
      externos_verificacion_meses: String(vigencia.externosVerificacionMeses),
      impacto_plazo_dias: String(vigencia.impactoPlazoDias),
      formato_informe_margen_superior_cm: String(vigencia.formatoInforme.margenSuperiorCm),
      formato_informe_margen_inferior_cm: String(vigencia.formatoInforme.margenInferiorCm),
      meta_dentro_plazo_pct: String(metas.dentroPlazoPct),
      meta_aprobacion_dias: String(metas.aprobacionDias),
      meta_vencidos: String(metas.vencidos),
      meta_acuses_pct: String(metas.acusesPct),
      meta_externos_pct: String(metas.externosPct),
      meta_etapas_plazo_pct: String(metas.etapasPlazoPct),
    });
    // El formato del informe no trae documento: como el del acta, lo elige la entidad.
    expect(configuracion.has("formato_informe_documento_id")).toBe(false);
  });

  it("siembra el tipo «Documento externo» y los tipos de norma, en su orden", async () => {
    const sembrado = await loQueSiembra();
    expect(sembrado.get(e.tiposDocumento)).toEqual(
      expect.arrayContaining([expect.objectContaining({ nombre: "Documento externo", sigla: "DE", autoridad: "operativo", esDiligenciable: false })]),
    );
    expect(sembrado.get(e.tiposNorma)).toEqual(TIPOS_NORMA.map((nombre, i) => ({ nombre, orden: i + 1 })));
  });

  it("siembra los maestros y los parámetros de indicadores, sin objetivos, indicadores, dimensiones ni variables", async () => {
    const sembrado = await loQueSiembra();
    expect(sembrado.get(e.tiposIndicador)).toEqual(
      ["Eficacia", "Eficiencia", "Efectividad"].map((nombre, i) => ({ nombre, orden: i + 1 })),
    );
    expect(sembrado.get(e.clasificacionesIndicador)).toEqual([
      { nombre: "Estratégico", aprueba: "gerencia", exigeNorma: false, orden: 1 },
      { nombre: "Operativo", aprueba: "lider", exigeNorma: false, orden: 2 },
      { nombre: "Regulatorio", aprueba: "gerencia", exigeNorma: true, orden: 3 },
    ]);
    expect(sembrado.get(e.unidadesIndicador)?.map((u) => u.nombre)).toEqual([
      "Porcentaje", "Número", "Días", "Horas", "Minutos", "Tasa por mil", "Pesos",
    ]);
    const configuracion = new Map((sembrado.get(e.configuracion) ?? []).map((f) => [f.clave, f.valor]));
    expect(Object.fromEntries(CAMPOS_PARAMETROS.map((c) => [c.clave, configuracion.get(c.clave)]))).toEqual(
      Object.fromEntries(CAMPOS_PARAMETROS.map((c) => [c.clave, String(PARAMETROS_DEFECTO[c.campo])])),
    );
    // Los objetivos, los indicadores, las dimensiones y las variables compartidas son de la entidad.
    for (const tabla of [e.objetivos, e.indicadores, e.indicadorVersiones, e.dimensiones, e.variablesCompartidas]) {
      expect(sembrado.has(tabla)).toBe(false);
    }
  });
});
