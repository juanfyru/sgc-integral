import { describe, expect, it } from "vitest";
import { neutralizarFormula } from "@/lib/celdas";
import { parsearLoteCsv, plantillaCsv, resultadosCsv } from "@/lib/lote-usuarios";

const catalogo = { cargos: new Map([["enfermera jefe", 7]]), procesos: new Map([["GTH", 3], ["CEX", 4]]) };

describe("parsearLoteCsv", () => {
  it("parsea la plantilla con BOM y ; y acepta rol por etiqueta y procesos por sigla", () => {
    const csv = "﻿usuario;nombre;correo;rol;cargo;procesos\r\nana.perez;Ana Pérez;ana@h.gov.co;Líder de proceso;Enfermera Jefe;GTH|CEX\r\n";
    const r = parsearLoteCsv(csv, catalogo);
    expect(r.invalidas).toEqual([]);
    expect(r.validas[0]).toEqual({ linea: 2, datos: { usuario: "ana.perez", nombre: "Ana Pérez", correo: "ana@h.gov.co", rol: "lider_proceso", cargoId: 7, jefeInmediatoId: null, procesoIds: [3, 4], verHistorial: false } });
  });

  it("acepta coma como separador si la cabecera la usa, y campos entre comillas", () => {
    const csv = 'usuario,nombre,correo,rol,cargo,procesos\n"luis.g","Luis Gómez, Jr.",,consulta,,\n';
    expect(parsearLoteCsv(csv, catalogo).validas[0].datos).toMatchObject({ usuario: "luis.g", nombre: "Luis Gómez, Jr.", correo: null, rol: "consulta", cargoId: null, procesoIds: [] });
  });

  it("rechaza con número de línea: usuario inválido, rol desconocido, cargo inexistente, sigla inexistente, líder sin procesos y duplicado en el archivo", () => {
    const csv = ["usuario;nombre;correo;rol;cargo;procesos",
      "Ana Perez;Beatriz Bravo;;consulta;;", "b.b;Carlos Cano;;jefe;;", "c.c;Diana Díaz;;consulta;Portero;", "d.d;Elena Erazo;;consulta;;XYZ",
      "e.e;Elena Erazo;;lider_proceso;;", "f.f;Fabio Fernández;;consulta;;", "f.f;Fabio Otro;;consulta;;"].join("\n");
    const r = parsearLoteCsv(csv, catalogo);
    expect(r.validas.map((v) => v.datos.usuario)).toEqual(["f.f"]);
    expect(r.invalidas.map((i) => i.linea)).toEqual([2, 3, 4, 5, 6, 8]);
    expect(r.invalidas[5].error).toMatch(/repetido/);
    expect(r.invalidas[4].error).toBe("El líder de proceso debe tener al menos un proceso asignado");
    expect(r.invalidas.every((i) => !/^\w+: /.test(i.error))).toBe(true);
  });

  it("cuenta bien las líneas con saltos dentro de comillas", () => {
    const csv = 'usuario;nombre;correo;rol;cargo;procesos\n"a.a";"Nombre\nlargo";;consulta;;\nb.b;Beto Bravo;;consulta;;';
    const r = parsearLoteCsv(csv, catalogo);
    expect(r.validas.map((v) => v.linea)).toEqual([2, 4]);
  });

  it("rechaza cabecera incompleta y más de 500 filas", () => {
    expect(() => parsearLoteCsv("usuario;nombre\n", catalogo)).toThrow(/cabecera/i);
    const muchas = "usuario;nombre;correo;rol;cargo;procesos\n" + Array.from({ length: 501 }, (_, i) => `u${i};N;;consulta;;`).join("\n");
    expect(() => parsearLoteCsv(muchas, catalogo)).toThrow(/500/);
  });
});

describe("CSV generados", () => {
  it("la plantilla y el CSV de resultados llevan BOM y cabecera", () => {
    expect(plantillaCsv().startsWith("﻿usuario;nombre;correo;rol;cargo;procesos")).toBe(true);
    expect(resultadosCsv({ creados: [{ linea: 2, usuario: "a", nombre: "A", claveTemporal: "X" }], fallidos: [{ linea: 3, usuario: "b", error: "mal" }] })).toContain("3;b;;error;mal");
  });

  it("neutraliza la inyección de fórmulas y entrecomilla lo que lo necesita", () => {
    const csv = resultadosCsv({
      creados: [{ linea: 2, usuario: "a", nombre: '=HYPERLINK("x")', claveTemporal: "AB;C" }],
      fallidos: [{ linea: 3, usuario: "+cmd", error: "dijo \"no\"" }],
    });
    expect(csv).toContain("'=HYPERLINK(\"\"x\"\")");
    expect(csv).toContain('"AB;C"');
    expect(csv).toContain("'+cmd");
    expect(csv).toContain('"dijo ""no"""');
    expect(plantillaCsv()).not.toMatch(/;'/);
  });

  it("neutralizarFormula antepone apóstrofo solo a los disparadores", () => {
    for (const v of ["=1", "+1", "-1", "@x", "\tx", "\rx"]) expect(neutralizarFormula(v)).toBe(`'${v}`);
    expect(neutralizarFormula("normal")).toBe("normal");
  });
});
