import { describe, expect, it } from "vitest";
import { ESTADOS_COPIA, ErrorDistribucion, VENTANA_IMPRESION_MS } from "@/lib/distribucion/tipos";
import { enVentanaDeImpresion, numeroDeCopia, puedePasar, textoSello, urlDeQr } from "@/lib/distribucion/copias";
import { acusadosPorFirma, porcentaje } from "@/lib/distribucion/acuses";
import {
  ITEMS_FIJOS,
  armarListaDeChequeo,
  conformidad,
  esConforme,
  verificacionVencida,
} from "@/lib/distribucion/verificacion";
import { ErrorTramite } from "@/db/consultas/flujo/contrato";

describe("copias", () => {
  it("puedePasar: solo las seis aristas", () => {
    const ok = [
      ["emitida", "recibida"],
      ["emitida", "anulada"],
      ["recibida", "anulada"],
      ["emitida", "por_recoger"],
      ["recibida", "por_recoger"],
      ["por_recoger", "recogida"],
    ];
    for (const de of ESTADOS_COPIA)
      for (const a of ESTADOS_COPIA) expect(puedePasar(de, a)).toBe(ok.some(([x, y]) => x === de && y === a));
  });
  it("numeroDeCopia", () => {
    expect(numeroDeCopia(2)).toBe("02");
    expect(numeroDeCopia(100)).toBe("100");
  });
  const base = {
    numero: 2,
    codigo: "GTH-PR-02",
    version: 2,
    punto: "Urgencias",
    responsable: "Luz Dary Ortiz",
    cargo: "Enfermera Jefe",
    emitidaEn: new Date("2026-11-12T15:00:00Z"),
    zona: "America/Bogota",
  };
  it("textoSello", () => {
    expect(textoSello(base)).toEqual({
      titulo: "COPIA CONTROLADA N.º 02",
      detalle: "GTH-PR-02 v2 · Urgencias · Entregada a Luz Dary Ortiz, Enfermera Jefe · 12/11/2026",
    });
  });
  it("textoSello sin cargo y con la fecha en la zona", () => {
    const r = textoSello({ ...base, cargo: null, emitidaEn: new Date("2026-11-13T02:00:00Z") });
    expect(r.detalle).toBe("GTH-PR-02 v2 · Urgencias · Entregada a Luz Dary Ortiz · 12/11/2026");
  });
  it("urlDeQr", () => {
    expect(urlDeQr("https://sgc.gov.co", "GTH-PR-02", 2)).toBe("https://sgc.gov.co/documentos/GTH-PR-02?v=2");
    expect(urlDeQr(null, "GTH-PR-02", 2)).toBeNull();
  });
  it("enVentanaDeImpresion", () => {
    const t0 = new Date("2026-11-12T15:00:00Z");
    expect(VENTANA_IMPRESION_MS).toBe(900_000);
    expect(enVentanaDeImpresion(null, t0)).toBe(false);
    expect(enVentanaDeImpresion(t0, new Date(t0.getTime() + 14 * 60_000))).toBe(true);
    expect(enVentanaDeImpresion(t0, new Date(t0.getTime() + 15 * 60_000))).toBe(false);
  });
  it("ErrorDistribucion es un ErrorTramite", () => {
    expect(new ErrorDistribucion("x")).toBeInstanceOf(ErrorTramite);
  });
});

describe("acuses", () => {
  it("porcentaje", () => {
    expect(porcentaje(23, 11)).toBe(68);
    expect(porcentaje(0, 0)).toBeNull();
  });
  it("acusadosPorFirma", () => {
    expect(acusadosPorFirma([1, 2, 2, 9, 3], [3, 2, 5])).toEqual([2, 3]);
  });
});

describe("verificación", () => {
  it("armarListaDeChequeo", () => {
    const lista = armarListaDeChequeo([
      { id: 9, codigo: "ATE-FO-02", version: 1, numero: 1, estado: "por_recoger" },
      { id: 7, codigo: "ATE-PR-01", version: 3, numero: 1, estado: "recibida" },
    ]);
    expect(lista.map((i) => i.texto)).toEqual([
      "ATE-PR-01 v3 · Copia N.º 01: está",
      "ATE-PR-01 v3 · Copia N.º 01: legible",
      "ATE-PR-01 v3 · Copia N.º 01: es la versión vigente",
      "ATE-FO-02 v1 · Copia N.º 01 (obsoleta): ya no está",
      ...ITEMS_FIJOS,
    ]);
    expect(lista[3]).toMatchObject({ origen: "copia_por_recoger", copiaId: 9 });
    expect(lista[0]).toMatchObject({ origen: "copia", copiaId: 7 });
    expect(lista[4]).toMatchObject({ origen: "fijo", copiaId: null });
  });
  it("armarListaDeChequeo ordena por código, versión y número", () => {
    const lista = armarListaDeChequeo([
      { id: 3, codigo: "B-1", version: 1, numero: 1, estado: "emitida" },
      { id: 2, codigo: "A-1", version: 2, numero: 2, estado: "emitida" },
      { id: 1, codigo: "A-1", version: 2, numero: 1, estado: "emitida" },
    ]);
    const ids = lista.filter((i) => i.origen === "copia" && i.texto.endsWith(": está")).map((i) => i.copiaId);
    expect(ids).toEqual([1, 2, 3]);
  });
  it("armarListaDeChequeo sin copias solo trae los fijos", () => {
    expect(armarListaDeChequeo([]).map((i) => i.texto)).toEqual([...ITEMS_FIJOS]);
  });
  it("esConforme", () => {
    expect(esConforme([{ respuesta: "conforme" }, { respuesta: "no_aplica" }, { respuesta: null }])).toBe(true);
    expect(esConforme([{ respuesta: "conforme" }, { respuesta: "no_conforme" }])).toBe(false);
    expect(esConforme([])).toBe(true);
  });
  it("conformidad", () => {
    expect(conformidad([{ conforme: true }, { conforme: true }, { conforme: false }], 95)).toEqual({
      porcentaje: 67,
      cumple: false,
    });
    expect(conformidad([{ conforme: true }, { conforme: true }], 95)).toEqual({ porcentaje: 100, cumple: true });
    expect(conformidad([], 95)).toEqual({ porcentaje: null, cumple: null });
  });
  it("verificacionVencida", () => {
    const ahora = new Date("2026-11-12T15:00:00Z");
    const hace = (d: number) => new Date(ahora.getTime() - d * 86_400_000);
    expect(verificacionVencida(null, 30, ahora)).toBe(true);
    expect(verificacionVencida(hace(29), 30, ahora)).toBe(false);
    expect(verificacionVencida(hace(30), 30, ahora)).toBe(true);
  });
});
