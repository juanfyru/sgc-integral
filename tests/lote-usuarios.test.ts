import { describe, expect, it } from "vitest";
import { neutralizarFormula } from "@/lib/celdas";
import { catalogoDeCargos, parsearLoteCsv, plantillaCsv, resultadosCsv } from "@/lib/lote-usuarios";

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

describe("cargos con el mismo nombre en varias áreas", () => {
  const catalogoAreas = {
    cargos: catalogoDeCargos([
      { id: 11, nombre: "Auxiliar de Enfermería", areaNombre: "Urgencias" },
      { id: 12, nombre: "Auxiliar de enfermeria", areaNombre: "Hospitalización" },
      { id: 13, nombre: "Enfermera Jefe", areaNombre: "Urgencias" },
    ]),
    procesos: new Map<string, number>(),
  };
  const csv = (...cargos: string[]) =>
    ["usuario;nombre;correo;rol;cargo;procesos", ...cargos.map((c, i) => `u${i}.x;Persona ${i};;consulta;${c};`)].join("\n");

  it("el nombre solo, repetido entre áreas, se rechaza y pide Área > Cargo", () => {
    const r = parsearLoteCsv(csv("Auxiliar de Enfermería"), catalogoAreas);
    expect(r.validas).toEqual([]);
    expect(r.invalidas).toEqual([
      { linea: 2, usuario: "u0.x", error: "El cargo «Auxiliar de Enfermería» existe en varias áreas; escríbalo como Área > Cargo" },
    ]);
  });

  it("Área > Cargo resuelve el cargo de esa área, normalizando ambas partes", () => {
    const r = parsearLoteCsv(
      csv("Urgencias > Auxiliar de Enfermería", "hospitalizacion>AUXILIAR DE ENFERMERÍA", "  Urgencias  >  enfermera   jefe "),
      catalogoAreas,
    );
    expect(r.invalidas).toEqual([]);
    expect(r.validas.map((v) => v.datos.cargoId)).toEqual([11, 12, 13]);
  });

  it("un nombre único sigue valiendo solo; un Área > Cargo que no existe se rechaza", () => {
    const r = parsearLoteCsv(csv("Enfermera Jefe", "Hospitalización > Enfermera Jefe", "> Enfermera Jefe"), catalogoAreas);
    expect(r.validas.map((v) => v.datos.cargoId)).toEqual([13]);
    expect(r.invalidas.map((i) => i.error)).toEqual([
      "Cargo inexistente «Hospitalización > Enfermera Jefe»",
      "Cargo inexistente «> Enfermera Jefe»",
    ]);
  });

  it("dos cargos del área que solo difieren en tildes o mayúsculas tampoco se eligen en silencio", () => {
    const repetidos = {
      cargos: catalogoDeCargos([
        { id: 21, nombre: "Camillero", areaNombre: "Urgencias" },
        { id: 22, nombre: "camillero", areaNombre: "Urgencias" },
      ]),
      procesos: new Map<string, number>(),
    };
    const r = parsearLoteCsv(csv("Urgencias > Camillero"), repetidos);
    expect(r.validas).toEqual([]);
    expect(r.invalidas[0].error).toBe(
      "El cargo «Urgencias > Camillero» está repetido en esa área con nombres casi iguales; corríjalo en Estructura",
    );
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
