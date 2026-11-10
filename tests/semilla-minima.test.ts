/**
 * La semilla mínima de una instalación nueva (13C, resolución 9 de la Tarea 14): deja las claves de configuración de la
 * vigencia, del informe y de las metas con sus valores por defecto, el tipo «Documento externo» y los tipos de norma. No
 * se ejecuta contra la base: `sembrarBase` corre sobre una conexión falsa que solo anota lo que insertaría.
 */
import { describe, expect, it } from "vitest";
import { CONFIG_DOCUMENTAL_DEFECTO } from "@/db/consultas/config-documental";
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
});
