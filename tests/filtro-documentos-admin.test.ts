import { describe, expect, it } from "vitest";
import {
  FILTRO_VACIO,
  filtrarDocumentos,
  normalizarTexto,
  opcionesDe,
  type DocumentoFiltrable,
} from "@/lib/filtro-documentos-admin";
import { ETIQUETA_VIGENCIA } from "@/lib/vigencia/tipos";

const filas: (DocumentoFiltrable & { id: number })[] = [
  { id: 1, codigo: "GTH-PR-01", titulo: "Procedimiento de Inducción y Reinducción", tipoNombre: "Procedimiento", procesos: ["GTH"], estados: ["vigente"], vigencia: { estado: "vencida", dias: -86 } },
  { id: 2, codigo: "GTH-PR-02", titulo: "Procedimiento de Selección", tipoNombre: "Procedimiento", procesos: ["GTH"], estados: ["vigente", "borrador"], vigencia: { estado: "al_dia", dias: 200 } },
  { id: 3, codigo: "AIN-FO-01", titulo: "Formato de Remisión de Pacientes", tipoNombre: "Formato", procesos: ["AIN", "CEX"], estados: ["vigente"], vigencia: { estado: "vencida", dias: -3 } },
  { id: 4, codigo: "SGC-CA-01", titulo: "Caracterización del SGC", tipoNombre: "Caracterización", procesos: ["SGC"], estados: ["obsoleto"], vigencia: null },
  { id: 5, codigo: "ATE-GU-01", titulo: "Guía sin proceso", tipoNombre: "Guía", procesos: [], estados: ["descartado"], vigencia: null },
];

describe("normalizarTexto", () => {
  it("quita tildes y mayúsculas y recorta espacios", () => {
    expect(normalizarTexto("  Inducción Ñandú ")).toBe("induccion ñandu");
  });
});

describe("filtrarDocumentos", () => {
  it("sin filtro devuelve todas las filas en su orden", () => {
    expect(filtrarDocumentos(filas, FILTRO_VACIO).map((f) => f.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("el texto busca en código y título, sin tildes ni mayúsculas, y cada palabra debe aparecer", () => {
    expect(filtrarDocumentos(filas, { ...FILTRO_VACIO, texto: "induccion" }).map((f) => f.id)).toEqual([1]);
    expect(filtrarDocumentos(filas, { ...FILTRO_VACIO, texto: "gth-pr" }).map((f) => f.id)).toEqual([1, 2]);
    expect(filtrarDocumentos(filas, { ...FILTRO_VACIO, texto: "procedimiento seleccion" }).map((f) => f.id)).toEqual([2]);
    expect(filtrarDocumentos(filas, { ...FILTRO_VACIO, texto: "remision inducción" })).toEqual([]);
  });

  it("tipo, proceso y estado son coincidencias exactas y se combinan con el texto", () => {
    expect(filtrarDocumentos(filas, { ...FILTRO_VACIO, tipo: "Formato" }).map((f) => f.id)).toEqual([3]);
    expect(filtrarDocumentos(filas, { ...FILTRO_VACIO, proceso: "CEX" }).map((f) => f.id)).toEqual([3]);
    expect(filtrarDocumentos(filas, { ...FILTRO_VACIO, estado: "borrador" }).map((f) => f.id)).toEqual([2]);
    expect(filtrarDocumentos(filas, { ...FILTRO_VACIO, estado: "vigente", texto: "procedimiento" }).map((f) => f.id)).toEqual([1, 2]);
    expect(filtrarDocumentos(filas, { ...FILTRO_VACIO, tipo: "Guía", proceso: "GTH" })).toEqual([]);
  });

  it("un documento con vigente y borrador responde a los dos estados", () => {
    expect(filtrarDocumentos(filas, { ...FILTRO_VACIO, estado: "vigente" }).map((f) => f.id)).toEqual([1, 2, 3]);
  });

  it("el filtro de vigencia deja solo las filas con ese estado; sin elegir, son todas", () => {
    expect(FILTRO_VACIO.vigencia).toBe("");
    expect(filtrarDocumentos(filas, { ...FILTRO_VACIO, vigencia: "vencida" }).map((f) => f.id)).toEqual([1, 3]);
    expect(filtrarDocumentos(filas, { ...FILTRO_VACIO, vigencia: "al_dia" }).map((f) => f.id)).toEqual([2]);
    expect(filtrarDocumentos(filas, { ...FILTRO_VACIO, vigencia: "en_tramite" })).toEqual([]);
    expect(filtrarDocumentos(filas, { ...FILTRO_VACIO, vigencia: "vencida", proceso: "CEX" }).map((f) => f.id)).toEqual([3]);
  });
});

describe("opcionesDe", () => {
  it("saca los tipos y procesos presentes, sin repetir y ordenados, y los estados en el orden del ciclo de vida", () => {
    const o = opcionesDe(filas);
    expect(o.tipos).toEqual(["Caracterización", "Formato", "Guía", "Procedimiento"]);
    expect(o.procesos).toEqual(["AIN", "CEX", "GTH", "SGC"]);
    expect(o.estados).toEqual(["vigente", "borrador", "obsoleto", "descartado"]);
  });

  it("ofrece los estados de vigencia presentes, de lo más urgente a lo que está en trámite", () => {
    const conTramite = [...filas, { ...filas[0], id: 6, vigencia: { estado: "en_tramite" as const, dias: null } }];
    expect(opcionesDe(conTramite).vigencias).toEqual(["vencida", "al_dia", "en_tramite"]);
    expect(opcionesDe(conTramite).vigencias.map((v) => ETIQUETA_VIGENCIA[v])).toEqual(["Vencida", "Al día", "En trámite"]);
  });
});
