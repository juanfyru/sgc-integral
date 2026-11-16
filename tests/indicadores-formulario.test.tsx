/**
 * El formulario de la ficha de indicador (Fase 14A, Tarea 6; spec §12.4, maqueta 6): render estático con datos de
 * muestra, sin BD. Lo que se ve al abrirlo: la forma y sus variables, «Así quedará el semáforo», la prueba y «Más
 * opciones» plegado con sus valores por omisión; y que cada control tenga su etiqueta y envíe un campo del esquema.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/acciones-indicadores", () => ({
  crearIndicadorAccion: vi.fn(),
  guardarBorradorAccion: vi.fn(),
  abrirCambioAccion: vi.fn(),
}));
vi.mock("@/app/admin/acciones-indicadores", () => ({ guardarParametrosAccion: vi.fn() }));

import { FormularioParametros } from "@/componentes/indicadores/admin/FormularioParametros";
import { estadoDeRangos, rangosDelEditor, type EstadoEditor } from "@/componentes/indicadores/ficha/EditorDeRangos";
import {
  campoDeMasOpciones,
  campoDelError,
  codigoAlCambiarDeEleccion,
  codigoAlCambiarDeProceso,
  codigoPropuestoDe,
  conOrigen,
  FormularioFicha,
  siglaVigenteDe,
} from "@/componentes/indicadores/ficha/FormularioFicha";
import { cambioDeIndicador, cambioDeOrigen, nombreDeVariable, ORIGENES_DE_VARIABLE, origenConTecla } from "@/componentes/indicadores/ficha/OrigenDeVariable";
import { EsquemaFicha, EsquemaFichaDeLaPersona, type DatosFicha } from "@/lib/esquemas/indicadores";
import { parsearFormulario } from "@/lib/validacion";
import { CALCULOS, CLAVES_DE_CALCULO, ETIQUETA_ALCANCE, META_ENTERA } from "@/lib/indicadores/calculos/registro";
import { unidadDeForma } from "@/lib/indicadores/formula/formas";
import { AVISO_DE_NO_NOMBRARLO, AVISO_DESAGREGACION, avisoDeDeduccion, NADIE_MIDE_AJENO, ORIGEN_AJENO, type OpcionesFicha } from "@/lib/indicadores/tipos";

/** Los cálculos del registro tal como los arma `opcionesDeFicha`. */
const CALCULOS_DEL_REGISTRO: OpcionesFicha["calculos"] = CLAVES_DE_CALCULO.map((clave) => {
  const c = CALCULOS[clave];
  return {
    clave,
    nombre: c.nombre,
    clase: c.clase,
    forma: c.forma,
    tendencia: c.tendencia,
    reconstruible: c.reconstruible,
    exigeMeta: c.exigeMeta,
    unidadSugerida: c.unidadSugerida,
    alcances: c.alcances.map((a) => ({ clave: a, etiqueta: ETIQUETA_ALCANCE[a] })),
    variables: c.variables.map((v) => ({ ...v })),
  };
});

const OPCIONES: OpcionesFicha = {
  procesos: [
    { id: 2, sigla: "SGC", nombre: "Sistema de Gestión de Calidad" },
    { id: 13, sigla: "GTH", nombre: "Gestión del Talento Humano" },
  ],
  subprocesos: [
    { id: 40, procesoId: 13, nombre: "Bienestar", sigla: null },
    { id: 41, procesoId: 13, nombre: "Contratación", sigla: "CNT" },
  ],
  codigosPropuestos: { procesos: { 2: "SGC-ID-006", 13: "GTH-ID-001" }, subprocesos: { 41: "CNT-ID-001" } },
  tipos: [
    { id: 1, nombre: "Eficacia" },
    { id: 2, nombre: "Eficiencia" },
  ],
  clasificaciones: [
    { id: 1, nombre: "Estratégico", exigeNorma: false },
    { id: 2, nombre: "Operativo", exigeNorma: false },
    { id: 3, nombre: "Regulatorio", exigeNorma: true },
  ],
  unidades: [
    { id: 1, nombre: "Porcentaje", sufijo: " %", decimales: 1 },
    { id: 2, nombre: "Número", sufijo: "", decimales: 0 },
  ],
  objetivos: [{ id: 5, nombre: "Mejorar la satisfacción del usuario" }],
  cargos: [
    { id: 4, nombre: "Líder de Calidad" },
    { id: 9, nombre: "Coordinadora de Talento Humano" },
  ],
  normas: [{ id: 4, nombre: "Resolución 3100 de 2019", estado: "vigente" }],
  usuarios: [
    { id: 7, nombre: "Coordinadora del SGC", cargoId: 4 },
    { id: 8, nombre: "Auxiliar de calidad", cargoId: null },
  ],
  usuarioActual: 7,
  // El líder de SGC tiene otro cargo que la persona 7: así se distingue de dónde sale cada valor por omisión.
  cargosDeLideres: { 2: [9] },
  documentos: [{ id: 30, codigo: "SGC-PR-01", titulo: "Auditorías internas", procesoIds: [2] }],
  entes: ["Superintendencia de Salud"],
  umbralAtencionPct: 70,
  plazoReporteDias: 10,
  anio: 2026,
  periodos: {
    mensual: [{ clave: "2026-11", etiqueta: "Noviembre de 2026" }],
    bimestral: [{ clave: "2026-B6", etiqueta: "Sexto bimestre de 2026" }],
    trimestral: [
      { clave: "2026-T3", etiqueta: "Tercer trimestre de 2026" },
      { clave: "2026-T4", etiqueta: "Cuarto trimestre de 2026" },
    ],
    semestral: [{ clave: "2026-S2", etiqueta: "Segundo semestre de 2026" }],
    anual: [{ clave: "2026", etiqueta: "2026" }],
  },
  periodoEnCurso: { mensual: "2026-11", bimestral: "2026-B6", trimestral: "2026-T4", semestral: "2026-S2", anual: "2026" },
  calculos: CALCULOS_DEL_REGISTRO,
  calculosActivos: [],
  datos: [],
  tomables: [],
  dimensiones: [],
};

/** Un cambio sobre una ficha con versión aprobada: la única que conserva la regla anterior (Ruling 18). */
const pintarCambio = (valores: Partial<DatosFicha>, errorInicial?: string) =>
  renderToStaticMarkup(
    <FormularioFicha opciones={OPCIONES} valores={valores} edicion={{ versionId: 15, cambio: true, codigoFijo: true }} errorInicial={errorInicial} />,
  );

const pintar = (valores: Partial<DatosFicha> = {}) => renderToStaticMarkup(<FormularioFicha opciones={OPCIONES} valores={valores} />);

/** El valor de un campo oculto, con las entidades de HTML resueltas. */
function oculto(html: string, nombre: string): string | null {
  const m = new RegExp(`<input type="hidden" name="${nombre}" value="([^"]*)"`).exec(html);
  return m ? m[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") : null;
}

/** «Más opciones»: el `<details>` que lo contiene, de su apertura a su cierre (no anida otro). */
function masOpciones(html: string): string {
  const resumen = html.indexOf(">Más opciones</summary>");
  expect(resumen).toBeGreaterThan(-1);
  const inicio = html.lastIndexOf("<details", resumen);
  return html.slice(inicio, html.indexOf("</details>", resumen) + "</details>".length);
}

const nombres = (html: string) => [...new Set([...html.matchAll(/<(?:input|select|textarea)[^>]*\sname="([^"]+)"/g)].map((m) => m[1]))].sort();

/** La etiqueta de apertura del control que envía `nombre`. */
function control(html: string, nombre: string): string {
  const tag = html.match(new RegExp(`<(?:input|select|textarea)\\b[^>]*\\sname="${nombre}"[^>]*>`))?.[0];
  expect(tag, nombre).toBeTruthy();
  return tag!;
}

describe("FormularioFicha", () => {
  const html = pintar({ procesoId: 2, meta: "80", tendencia: "ascendente", umbralAtencionPct: 70 });

  it("primero pregunta cómo se calcula, con las cinco formas", () => {
    expect(html).toContain("¿Cómo se calcula?");
    for (const forma of ["Porcentaje", "Tasa", "Promedio o razón", "Conteo", "Fórmula libre"]) expect(html).toContain(`>${forma}<`);
    expect(html.indexOf("¿Cómo se calcula?")).toBeLessThan(html.indexOf(">Nombre<"));
  });

  it("con la forma «Porcentaje» hay dos variables, A y B", () => {
    expect(html).toContain(">A · Numerador<");
    expect(html).toContain(">B · Denominador<");
    const variables = JSON.parse(oculto(html, "variables")!) as { letra: string }[];
    expect(variables.map((v) => v.letra)).toEqual(["A", "B"]);
    expect(html).not.toContain(">C · ");
  });

  it("«Así quedará el semáforo» escribe los rangos en palabras", () => {
    expect(html).toContain("Así quedará el semáforo");
    // Un borrador inicial con la regla vieja no la conserva: el editor sale a la vista con los rangos equivalentes.
    expect(html).toContain("Bien: ≥ 80 % · Atención: ≥ 56 % · Crítico: &lt; 56 %");
    expect(html).toContain('id="rango-bien-signo"');
    expect(html).not.toContain(">Escribir los rangos</button>");
    expect(html).not.toContain(">Cambiar rangos</summary>");
  });

  it("«Más opciones» está plegado y trae tipo «Eficacia» y clasificación «Operativo»", () => {
    const mas = masOpciones(html);
    expect(mas).not.toMatch(/^<details[^>]*\sopen/);
    expect(mas).toContain('<option value="1" selected="">Eficacia</option>');
    expect(mas).toContain('<option value="2" selected="">Operativo</option>');
    // Sin persona designada, los responsables nacen con los cargos de los líderes del proceso; la línea base, con el año
    // de referencia.
    expect(JSON.parse(oculto(html, "cargosMedir")!)).toEqual([9]);
    expect(JSON.parse(oculto(html, "cargosAnalizar")!)).toEqual([9]);
    expect(mas).toContain("Sin línea base: 2026 es el año de referencia");
    expect(mas).toContain('<option value="2026-T4" selected="">Cuarto trimestre de 2026</option>');
  });

  it("el código propuesto es el del proceso y el plazo, el del parámetro", () => {
    expect(control(html, "codigo")).toContain('value="SGC-ID-006"');
    expect(control(html, "plazoReporteDias")).toContain('value="10"');
    expect(control(pintar(), "codigo")).toContain('value=""');
  });

  it("«Quién mide» nace sin persona: quien llena la ficha no queda designado (F14-DC10)", () => {
    expect(JSON.parse(oculto(html, "mide")!)).toEqual([]);
    expect(JSON.parse(oculto(html, "analiza")!)).toEqual([]);
    expect(html).toMatch(/<select id="ficha-mide"[^>]*>[\s\S]*?<option value="" selected="">\(el líder del proceso\)<\/option>/);
    expect(html).toMatch(/<select id="ficha-analiza"[^>]*>[\s\S]*?<option value="misma" selected="">La misma persona que mide<\/option>/);
  });

  it("los cargos responsables nacen con los de los líderes del proceso o, con persona designada, con el suyo", () => {
    // Sin proceso no hay líder del que tomarlos.
    expect(JSON.parse(oculto(pintar(), "cargosMedir")!)).toEqual([]);
    // Un proceso sin líderes con cargo tampoco propone.
    expect(JSON.parse(oculto(pintar({ procesoId: 13 }), "cargosMedir")!)).toEqual([]);
    const designada = pintar({ procesoId: 2, mide: [7], analiza: [7] });
    expect(JSON.parse(oculto(designada, "cargosMedir")!)).toEqual([4]);
    expect(JSON.parse(oculto(designada, "cargosAnalizar")!)).toEqual([4]);
    // Una persona sin cargo no se reemplaza por el del líder.
    expect(JSON.parse(oculto(pintar({ procesoId: 2, mide: [8], analiza: [8] }), "cargosMedir")!)).toEqual([]);
  });

  it("un error del servidor sobre un campo de «Más opciones» dice a qué campo llevar el foco", () => {
    expect(campoDeMasOpciones("Elija al menos un cargo responsable de medir")).toBe("ficha-cargo-medir");
    expect(campoDeMasOpciones("Elija al menos un cargo responsable de analizar")).toBe("ficha-cargo-analizar");
    expect(campoDeMasOpciones("Los cargos responsables de analizar no son válidos")).toBe("ficha-cargo-analizar");
    expect(campoDeMasOpciones("Los cargos responsables deben existir y estar activos")).toBe("ficha-cargo-medir");
    expect(campoDeMasOpciones("Un indicador regulatorio debe citar al menos una norma")).toBe("ficha-norma");
    expect(campoDeMasOpciones("La línea base debe ser un número")).toBe("ficha-lineaBaseValor");
    expect(campoDeMasOpciones("El mínimo del resultado no puede pasar del máximo")).toBe("ficha-resultadoMin");
    expect(campoDeMasOpciones("El mínimo de captura de A no puede pasar del máximo")).toBe("ficha-detalle-variables");
    expect(campoDeMasOpciones("El inicio de medición debe ser un periodo trimestral")).toBe("ficha-inicioMedicion");
    expect(campoDeMasOpciones("El procedimiento debe ser un documento del proceso")).toBe("ficha-procedimientoDocumentoId");
    // Lo que está a la vista no abre nada.
    expect(campoDeMasOpciones("Escriba la fórmula")).toBeNull();
    expect(campoDeMasOpciones("La meta debe ser un número")).toBeNull();
    expect(campoDeMasOpciones("El nombre debe tener al menos 1 carácter")).toBeNull();
    // Cada destino existe dentro de «Más opciones» y recibe el foco.
    const mas = masOpciones(html);
    for (const id of ["ficha-cargo-medir", "ficha-cargo-analizar", "ficha-norma", "ficha-detalle-variables"]) {
      expect(mas).toContain(`<fieldset id="${id}" tabindex="-1"`);
    }
    for (const id of ["ficha-tipoId", "ficha-lineaBaseValor", "ficha-resultadoMin", "ficha-inicioMedicion", "ficha-procedimientoDocumentoId"]) {
      expect(mas).toContain(`id="${id}"`);
    }
  });

  it("la prueba con valores de ejemplo dice el resultado, el color y la frase, y los guarda", () => {
    const conPrueba = pintar({ meta: "80", tendencia: "ascendente", umbralAtencionPct: 70, prueba: { valores: { A: "9", B: "10" } } });
    expect(conPrueba).toContain("Cumple: 90 % frente a una meta de 80 %.");
    expect(conPrueba).toMatch(/data-variante="bien"[^>]*>Bien</);
    expect(JSON.parse(oculto(conPrueba, "prueba")!)).toEqual({ valores: { A: "9", B: "10" } });
    // Sin valores no hay prueba que guardar.
    expect(oculto(html, "prueba")).toBeNull();
    // Fuera de los límites del resultado: lo dice una insignia con su texto, no un texto teñido.
    const fuera = pintar({ meta: "80", tendencia: "ascendente", resultadoMax: "100", prueba: { valores: { A: "12", B: "10" } } });
    expect(fuera).toMatch(/data-variante="atencion"[^>]*>Fuera de los límites del resultado</);
    expect(fuera).not.toContain('<span class="text-estado-atencion-texto">');
  });

  it("la unidad sigue a la forma: un conteo no queda en «Porcentaje» y la prueba lo dice (ronda 1 de la Tarea 19, D-3)", () => {
    const conteo = pintar({ forma: "conteo", meta: "5", tendencia: "descendente", umbralAtencionPct: 70, prueba: { valores: { A: "3" } } });
    expect(conteo).toMatch(/<select[^>]*id="ficha-unidadId"[^>]*>(?:(?!<\/select>)[\s\S])*<option value="2" selected="">Número/);
    expect(conteo).toContain("Cumple: 3 frente a una meta de máximo 5.");
    expect(conteo).not.toContain("3 %");
    // La forma «Porcentaje» sigue con su unidad, y una unidad elegida a mano no cambia con la forma.
    expect(pintar({ forma: "porcentaje" })).toMatch(/<option value="1" selected="">Porcentaje/);
    expect(pintar({ forma: "conteo", unidadId: 1 })).toMatch(/<option value="1" selected="">Porcentaje/);
  });

  it("la unidad que sugiere cada forma", () => {
    const unidades = [
      { id: 1, sufijo: " %" },
      { id: 2, sufijo: "" },
      { id: 3, sufijo: " por mil" },
    ];
    expect(unidadDeForma("porcentaje", 1000, unidades)).toBe(1);
    expect(unidadDeForma("conteo", 1000, unidades)).toBe(2);
    expect(unidadDeForma("razon", 1000, unidades)).toBe(2);
    expect(unidadDeForma("libre", 1000, unidades)).toBe(2);
    expect(unidadDeForma("tasa", 1000, unidades)).toBe(3);
    expect(unidadDeForma("tasa", 100000, unidades)).toBe(2);
    expect(unidadDeForma("porcentaje", 1000, [{ id: 2, sufijo: "" }])).toBeUndefined();
  });

  it("un error del servidor dice de qué campo es, también de los que están a la vista (ronda 1 de la Tarea 19, D-13)", () => {
    expect(campoDelError("La fórmula usa la variable D, que no está declarada")).toBe("ficha-formula");
    expect(campoDelError("La variable C no se usa en la fórmula")).toBe("ficha-formula");
    expect(campoDelError("Falta cerrar un paréntesis")).toBe("ficha-formula");
    expect(campoDelError("Ya existe un indicador con el código SGC-IND-01")).toBe("ficha-codigo");
    expect(campoDelError("El nombre de cada variable no puede pasar de 150 caracteres")).toBe("ficha-variables");
    expect(campoDelError("El nombre no puede pasar de 200 caracteres")).toBe("ficha-nombre");
    expect(campoDelError("Con meta 0 en tendencia descendente, escriba los rangos del semáforo")).toBe("ficha-meta");
    expect(campoDelError("El límite de crítico debe quedar por debajo de la meta")).toBe("ficha-limiteCritico");
    // Los de «Más opciones» siguen yendo a su campo; lo que no es de un campo, a ninguno.
    expect(campoDelError("Elija al menos un cargo responsable de medir")).toBe("ficha-cargo-medir");
    expect(campoDelError("No se pudo guardar")).toBeNull();
  });

  it("el error va junto a su campo, lo describe y no se repite al pie", () => {
    const mensaje = "La fórmula usa la variable D, que no está declarada";
    const conFormula = renderToStaticMarkup(
      <FormularioFicha opciones={OPCIONES} valores={{ forma: "libre", formula: "A + D" }} errorInicial={mensaje} />,
    );
    expect(conFormula).toMatch(/<textarea(?=[^>]*id="ficha-formula")(?=[^>]*aria-describedby="[^"]*ficha-formula-error)(?=[^>]*aria-invalid="true")[^>]*>/);
    expect(conFormula).toContain(`<p id="ficha-formula-error" role="alert" class="text-xs text-estado-critico-texto">${mensaje}</p>`);
    expect(conFormula.split(mensaje).length - 1).toBe(1);
    // Un grupo de casillas también lo lleva, descrito.
    const conCargos = renderToStaticMarkup(<FormularioFicha opciones={OPCIONES} errorInicial="Elija al menos un cargo responsable de medir" />);
    expect(conCargos).toMatch(/<fieldset id="ficha-cargo-medir" tabindex="-1" aria-describedby="ficha-cargo-medir-error"/);
    expect(conCargos).toContain('id="ficha-cargo-medir-error" role="alert"');
    // Un error que no es de un campo (o de uno que no se pinta: la fórmula de una forma que no es libre) queda al pie.
    const alPie = renderToStaticMarkup(<FormularioFicha opciones={OPCIONES} errorInicial={mensaje} />);
    expect(alPie).toContain(`<p role="alert" class="text-sm text-estado-critico-texto">${mensaje}</p>`);
  });

  it("el ente sugiere los ya usados", () => {
    expect(control(html, "ente")).toContain('list="ficha-entes"');
    expect(html).toContain('<datalist id="ficha-entes"><option value="Superintendencia de Salud"></option></datalist>');
  });

  it("al mudarse de proceso o de subproceso, el código se propone de nuevo si nadie lo tocó o si aún lleva la sigla anterior", () => {
    expect(codigoAlCambiarDeProceso("SGC-ID-006", false, "SGC", "GTH-ID-001")).toBe("GTH-ID-001");
    expect(codigoAlCambiarDeProceso("sgc-id-006", true, "SGC", "GTH-ID-001")).toBe("GTH-ID-001");
    expect(codigoAlCambiarDeProceso("SGC-IND-06", true, "SGC", "GTH-ID-001")).toBe("GTH-ID-001");
    expect(codigoAlCambiarDeProceso("", true, "SGC", "GTH-ID-001")).toBe("GTH-ID-001");
    expect(codigoAlCambiarDeProceso("CAL-07", true, "SGC", "GTH-ID-001")).toBe("CAL-07");
    expect(codigoAlCambiarDeProceso("SGCX-ID-002", true, "SGC", "GTH-ID-001")).toBe("SGCX-ID-002");
  });

  it("si la sigla vigente no cambia, el código se conserva tal cual", () => {
    // Entre dos subprocesos sin sigla (o de «ninguno» a uno), la sigla sigue siendo la del proceso.
    expect(codigoAlCambiarDeEleccion("GTH-ID-050", true, "GTH", "gth", "GTH-ID-001")).toBe("GTH-ID-050");
    expect(codigoAlCambiarDeEleccion("GTH-ID-003", false, "GTH", "GTH", "GTH-ID-004")).toBe("GTH-ID-003");
    // Si cambia, manda la regla de siempre.
    expect(codigoAlCambiarDeEleccion("GTH-ID-003", false, "GTH", "CNT", "CNT-ID-001")).toBe("CNT-ID-001");
    expect(codigoAlCambiarDeEleccion("GTH-ID-050", true, "GTH", "CNT", "CNT-ID-001")).toBe("CNT-ID-001");
    expect(codigoAlCambiarDeEleccion("CAL-07", true, "GTH", "CNT", "CNT-ID-001")).toBe("CAL-07");
    expect(codigoAlCambiarDeEleccion("", true, null, "CNT", "CNT-ID-001")).toBe("CNT-ID-001");
  });

  it("el código propuesto es el del subproceso con sigla o, si no, el del proceso", () => {
    expect(codigoPropuestoDe(OPCIONES, 13, 41)).toBe("CNT-ID-001");
    expect(codigoPropuestoDe(OPCIONES, 13, 40)).toBe("GTH-ID-001");
    expect(codigoPropuestoDe(OPCIONES, 13, "")).toBe("GTH-ID-001");
    expect(codigoPropuestoDe(OPCIONES, "", "")).toBe("");
    expect(siglaVigenteDe(OPCIONES, 13, 41)).toBe("CNT");
    expect(siglaVigenteDe(OPCIONES, 13, 40)).toBe("GTH");
    expect(siglaVigenteDe(OPCIONES, "", "")).toBeNull();
  });

  it("la fórmula libre se escribe y se lee en palabras; la tasa pide su factor; la constante, su rango", () => {
    const libre = pintar({
      forma: "libre",
      formula: "A / B",
      variables: [
        { letra: "A", nombre: "Días de estancia", consolidacion: "suma", admiteNegativos: false },
        { letra: "B", nombre: "Egresos", consolidacion: "suma", admiteNegativos: false },
      ],
    });
    expect(libre).toMatch(/<textarea[^>]*name="formula"/);
    expect(libre).toContain("Días de estancia ÷ Egresos");
    expect(pintar({ forma: "tasa" })).toMatch(/<select[^>]*name="factor"/);
    const constante = pintarCambio({ tendencia: "constante", meta: "98", metaMax: "100", tolerancia: "2" });
    expect(constante).toMatch(/name="metaMax"/);
    expect(constante).toMatch(/name="tolerancia"/);
  });

  it("todo control tiene su etiqueta y envía un campo del esquema", () => {
    const variantes = [
      html,
      pintar({ forma: "libre", formula: "A" }),
      pintar({ forma: "tasa", tendencia: "constante", meta: "1", semaforoModo: "fijo" }),
      pintar({ meta: "80", tendencia: "descendente", semaforoModo: "fijo", limiteCritico: "90", prueba: { valores: { A: "1", B: "2" } } }),
    ];
    const claves = Object.keys(EsquemaFicha.shape);
    for (const h of variantes) {
      for (const control of h.match(/<(?:input|select|textarea)\b[^>]*>/g) ?? []) {
        if (/type="hidden"/.test(control)) continue;
        if (/aria-label="[^"]+"/.test(control)) continue;
        const id = /\sid="([^"]+)"/.exec(control)?.[1];
        expect(id, control).toBeTruthy();
        expect(h, control).toContain(`for="${id}"`);
      }
      for (const n of nombres(h)) expect(claves, n).toContain(n);
    }
  });

  it("al editar un cambio pide el motivo y no deja cambiar el proceso ni el código", () => {
    const cambio = renderToStaticMarkup(
      <FormularioFicha
        opciones={OPCIONES}
        valores={{
          procesoId: 2,
          codigo: "SGC-IND-02",
          meta: "80",
          plazoReporteDias: 15,
          inicioMedicion: "2026-T3",
          nivelAcceso: "restringido",
          soporteObligatorio: true,
          mide: [8],
          analiza: [7, 8],
        }}
        edicion={{ versionId: 15, cambio: true, codigoFijo: true }}
      />,
    );
    expect(cambio).toContain('<input type="hidden" name="id" value="15"/>');
    expect(cambio).toMatch(/<textarea[^>]*name="motivoCambio"/);
    expect(control(cambio, "codigo")).toMatch(/readonly=""/i);
    expect(control(cambio, "codigo")).toContain('value="SGC-IND-02"');
    // El proceso viaja oculto y se muestra en solo lectura.
    expect(cambio).toContain('<input type="hidden" name="procesoId" value="2"/>');
    expect(cambio).not.toMatch(/<select[^>]*name="procesoId"/);
    expect(cambio).toContain("Guardar borrador");

    // Los datos de operación (spec §7.3) se ven pero no se editan: viajan como están y se cambian aparte.
    expect(control(cambio, "plazoReporteDias")).toMatch(/readonly=""/i);
    expect(control(cambio, "plazoReporteDias")).toContain('value="15"');
    expect(cambio).toContain('<input type="hidden" name="inicioMedicion" value="2026-T3"/>');
    expect(cambio).toContain('<input type="hidden" name="nivelAcceso" value="restringido"/>');
    expect(cambio).toContain('<input type="hidden" name="soporteObligatorio" value="on"/>');
    expect(JSON.parse(oculto(cambio, "mide")!)).toEqual([8]);
    expect(JSON.parse(oculto(cambio, "analiza")!)).toEqual([7, 8]);
    for (const nombre of ["inicioMedicion", "nivelAcceso", "soporteObligatorio"]) expect(cambio).not.toMatch(new RegExp(`<(select|input type="checkbox")[^>]*name="${nombre}"`));
    expect(cambio).not.toContain('<select id="ficha-mide"');
    expect(cambio).toMatch(/<input id="ficha-mide" readOnly="" [^>]*value="Auxiliar de calidad"/);
    expect(cambio).toMatch(/<input id="ficha-analiza" readOnly="" [^>]*value="Coordinadora del SGC, Auxiliar de calidad"/);
    expect(cambio).toMatch(/<input id="ficha-inicioMedicion" readOnly="" [^>]*value="Tercer trimestre de 2026"/);
    expect(cambio).toContain("Es un dato de operación: se cambia en «Datos de operación», no en la ficha.");
    // Cada control con su etiqueta y cada nombre del esquema (más el `id` de la ruta).
    const claves = [...Object.keys(EsquemaFicha.shape), "id"];
    for (const c of cambio.match(/<(?:input|select|textarea)\b[^>]*>/g) ?? []) {
      if (/type="hidden"/.test(c)) continue;
      const id = /\sid="([^"]+)"/.exec(c)?.[1];
      expect(id, c).toBeTruthy();
      expect(cambio, c).toContain(`for="${id}"`);
    }
    for (const n of nombres(cambio)) expect(claves, n).toContain(n);
  });
});

const RANGOS_91 = JSON.stringify({
  bien: [{ signo: ">=", valor: "91" }],
  atencion: [{ signo: "entre", valor: "41", hasta: "90" }],
  critico: [{ signo: "<=", valor: "40" }],
});

describe("FormularioFicha: los rangos escritos (Tarea 5 de la 14A)", () => {
  it("una ficha nueva muestra a la vista una fila por estado y no «Cambiar rangos»", () => {
    const nueva = pintar();
    for (const estado of ["bien", "atencion", "critico"]) {
      expect(nueva).toMatch(new RegExp(`<select[^>]*id="rango-${estado}-signo"`));
      expect(nueva).toContain(`for="rango-${estado}-signo"`);
    }
    expect(nueva).toContain("Este indicador no usa Atención");
    expect(nueva).toMatch(/<input(?=[^>]*id="rango-sin-atencion")(?=[^>]*type="checkbox")[^>]*>/);
    expect(nueva).toContain(">≥</option>");
    expect(nueva).toContain(">entre</option>");
    expect(nueva).not.toContain("Cambiar rangos");
    expect(nueva).not.toContain("Escribir los rangos");
    // Sin meta no viajan rangos: el indicador queda «Sin meta».
    expect(oculto(nueva, "rangos")).toBeNull();
    expect(nueva).toContain("Sin meta: cada medición queda");
  });

  it("con meta y rangos viajan como JSON con el modo «rangos», y la vista los dice en palabras", () => {
    const h = pintar({ meta: "100", tendencia: "ascendente", rangos: RANGOS_91, semaforoModo: "rangos" });
    expect(JSON.parse(oculto(h, "rangos")!)).toEqual(JSON.parse(RANGOS_91));
    expect(oculto(h, "semaforoModo")).toBe("rangos");
    expect(h).toContain("Bien: ≥ 91 % · Atención: 41 a 90 % · Crítico: ≤ 40 %");
    expect(h).not.toContain("Escribir los rangos");
    expect(h).not.toContain("Cambiar rangos");
  });

  it("una ficha con la regla anterior muestra la regla vieja y «Escribir los rangos», sin el editor", () => {
    const viejo = pintarCambio({ meta: "80", tendencia: "ascendente", semaforoModo: "relativo", umbralAtencionPct: 70 });
    expect(viejo).toContain("Bien desde 80 % · Atención de 56 a 79,9 % · Crítico por debajo de 56 %");
    expect(viejo).toMatch(/<button[^>]*type="button"[^>]*>Escribir los rangos<\/button>/);
    expect(viejo).not.toContain('id="rango-bien-signo"');
    expect(viejo).not.toContain("Cambiar rangos");
    // La regla vieja viaja tal cual, sin rangos.
    expect(oculto(viejo, "rangos")).toBeNull();
    expect(oculto(viejo, "semaforoModo")).toBe("relativo");
    expect(oculto(viejo, "umbralAtencionPct")).toBe("70");
  });

  it("la prueba con 95 y meta 100 (Bien desde 91) dice «Bien · no alcanza la meta» y «No cumple»", () => {
    const h = pintar({ meta: "100", tendencia: "ascendente", rangos: RANGOS_91, semaforoModo: "rangos", prueba: { valores: { A: "95", B: "100" } } });
    expect(h).toContain("No cumple: 95 % frente a una meta de 100 %.");
    expect(h).toMatch(/data-variante="bien"[^>]*>Bien · no alcanza la meta</);
  });

  it("«Mantenerse en un rango» pide Bien «entre» y Atención y Crítico a cada lado", () => {
    const rangos = JSON.stringify({
      bien: [{ signo: "entre", valor: "98", hasta: "100" }],
      atencion: [{ signo: "entre", valor: "95", hasta: "97.9" }],
      critico: [{ signo: "<", valor: "95" }, { signo: ">", valor: "100" }],
    });
    const h = pintar({ tendencia: "constante", meta: "98", metaMax: "100", rangos, semaforoModo: "rangos" });
    for (const id of ["rango-bien-signo", "rango-atencion-debajo-signo", "rango-atencion-encima-signo", "rango-critico-debajo-signo", "rango-critico-encima-signo"]) {
      expect(h, id).toContain(`id="${id}"`);
    }
    expect(h).toContain("Atención por debajo");
    expect(h).toContain("Crítico por encima");
    expect(h).not.toMatch(/name="tolerancia"/);
  });

  it("«Más opciones» trae Nivel y Riesgo asociado, con lo guardado", () => {
    const mas = masOpciones(pintar({ nivel: "Proceso", riesgoAsociado: "Caída de la adherencia" }));
    expect(mas).toMatch(/<input(?=[^>]*id="ficha-nivel")(?=[^>]*name="nivel")(?=[^>]*value="Proceso")[^>]*>/);
    // El ejemplo de la ayuda es un nivel de la matriz del hospital, no una clasificación («Estratégico» lo es).
    expect(mas).toContain("Opcional: el nivel del indicador en el hospital (Estructura, Proceso o Resultado), por ejemplo «Proceso».");
    expect(mas).not.toContain("«Estratégico»");
    expect(mas).toMatch(/id="ficha-riesgoAsociado"/);
    expect(mas).toContain("Caída de la adherencia");
    expect(campoDeMasOpciones("El nivel no puede pasar de 60 caracteres")).toBe("ficha-nivel");
    expect(campoDeMasOpciones("El riesgo asociado no puede pasar de 300 caracteres")).toBe("ficha-riesgoAsociado");
  });

  it("los errores de los rangos van al editor, también «La meta debe quedar dentro del rango de Bien»", () => {
    for (const m of [
      "Escriba los rangos del semáforo",
      "Un cambio mayor escribe los rangos del semáforo: complete Bien, Atención y Crítico",
      "Escriba el rango de Bien",
      "Escriba el rango de Crítico",
      "En «más es mejor», Crítico va abajo, Atención en medio y Bien arriba",
      "Los rangos de Atención y Bien se cruzan",
      "El rango de Atención queda dentro del de Bien",
      "Entre Crítico y Atención queda un hueco de más de una unidad",
      "La meta debe quedar dentro del rango de Bien",
      "Para mantenerse en un rango, Atención y Crítico van a cada lado de Bien",
      "Complete los valores de cada rango",
      "Los valores de los rangos deben ser números",
    ]) {
      expect(campoDelError(m), m).toBe("ficha-rangos");
    }
    expect(campoDelError("La meta debe ser un número")).toBe("ficha-meta");
  });

  it("el error de los rangos va junto al editor, lo describe y no se repite; una ficha vieja abre el editor", () => {
    const mensaje = "Los rangos de Atención y Bien se cruzan";
    const h = renderToStaticMarkup(<FormularioFicha opciones={OPCIONES} valores={{ meta: "100", rangos: RANGOS_91 }} errorInicial={mensaje} />);
    expect(h).toMatch(/<fieldset id="ficha-rangos" tabindex="-1" aria-describedby="ficha-rangos-error"/);
    expect(h).toContain(`<p id="ficha-rangos-error" role="alert" class="text-xs text-estado-critico-texto">${mensaje}</p>`);
    expect(h.split(mensaje).length - 1).toBe(1);
    const viejo = pintarCambio(
      { meta: "80", semaforoModo: "relativo", umbralAtencionPct: 70 },
      "Un cambio mayor escribe los rangos del semáforo: complete Bien, Atención y Crítico",
    );
    // Parte de los rangos equivalentes a la regla vieja (como «Escribir los rangos»), no de filas en blanco.
    expect(JSON.parse(oculto(viejo, "rangos")!).atencion).toEqual([{ signo: ">=", valor: "56" }]);
    expect(viejo).toContain('id="rango-bien-signo"');
    expect(viejo).toContain('id="ficha-rangos-error"');
  });

  it("Parámetros ya no pide el «Umbral de atención (%)»", () => {
    const h = renderToStaticMarkup(
      <FormularioParametros parametros={{ umbralAtencionPct: 70, avisoPrevioDias: 5, plazoReporteDias: 10, incumplimientoPeriodos: 3, variacionConfirmarPct: 50 }} />,
    );
    expect(h).not.toContain("Umbral de atención");
    expect(h).not.toContain('name="umbralAtencionPct"');
    expect(h).toContain("Días de aviso previo");
  });
});

describe("rangosDelEditor", () => {
  const fila = (signo: "<=" | ">=" | "entre", valor: string, hasta = "") => ({ signo, valor, hasta });
  it("convierte el estado: coma a punto, «hasta» solo con «entre», y sin Atención queda vacía", () => {
    const e: EstadoEditor = {
      bien: [fila(">=", "91,5")],
      atencion: [fila("entre", "41", "90")],
      critico: [fila("<=", " 40 ")],
      sinAtencion: false,
    };
    expect(rangosDelEditor(e)).toEqual({
      bien: [{ signo: ">=", valor: "91.5" }],
      atencion: [{ signo: "entre", valor: "41", hasta: "90" }],
      critico: [{ signo: "<=", valor: "40" }],
    });
    expect(rangosDelEditor({ ...e, sinAtencion: true }).atencion).toEqual([]);
  });
  it("en «mantenerse en un rango» una Atención sin escribir no deja una fila vacía", () => {
    const e: EstadoEditor = {
      bien: [fila("entre", "98", "100")],
      atencion: [fila("entre", "95", "98"), fila("entre", "", "")],
      critico: [fila("<=", "95"), { signo: ">=", valor: "102", hasta: "" }],
      sinAtencion: false,
    };
    expect(rangosDelEditor(e).atencion).toEqual([{ signo: "entre", valor: "95", hasta: "98" }]);
  });
});

describe("la regla anterior, el foco y las filas que se reabren (ronda 1 de la Tarea 5)", () => {
  it("un cambio sobre una ficha aprobada con la regla vieja muestra «Escribir los rangos»; un borrador inicial, el editor", () => {
    const cambio = pintarCambio({ meta: "80", semaforoModo: "relativo", umbralAtencionPct: 70 });
    expect(cambio).toContain(">Escribir los rangos</button>");
    expect(cambio).not.toContain('id="rango-bien-signo"');
    const inicial = pintar({ meta: "80", semaforoModo: "relativo", umbralAtencionPct: 70 });
    expect(inicial).toContain('id="rango-bien-signo"');
    expect(inicial).not.toContain(">Escribir los rangos</button>");
    expect(JSON.parse(oculto(inicial, "rangos")!)).toEqual({
      bien: [{ signo: ">=", valor: "80" }],
      atencion: [{ signo: ">=", valor: "56" }],
      critico: [{ signo: "<", valor: "56" }],
    });
    expect(oculto(inicial, "semaforoModo")).toBe("rangos");
  });

  it("un error que no es de los rangos no abre el editor en un cambio con la regla vieja", () => {
    const h = pintarCambio({ meta: "80", semaforoModo: "relativo", umbralAtencionPct: 70 }, "El nombre no puede pasar de 200 caracteres");
    expect(h).toContain(">Escribir los rangos</button>");
    expect(h).not.toContain('id="rango-bien-signo"');
  });

  it("el botón «Escribir los rangos» lleva el foco a la primera fila (un efecto con `rango-bien-signo`)", () => {
    // El efecto no corre en el render estático: se verifica que el destino exista cuando el editor está abierto.
    const abierto = pintar({ meta: "80", semaforoModo: "relativo", umbralAtencionPct: 70 });
    expect(abierto).toMatch(/<select[^>]*id="rango-bien-signo"/);
  });

  it("en «mantenerse en un rango» las filas de Atención vuelven a su lado al reabrir (ida y vuelta)", () => {
    const filaT = (signo: "<=" | ">=" | "entre" | "<" | ">", valor: string, hasta?: string) => (hasta === undefined ? { signo, valor } : { signo, valor, hasta });
    for (const atencion of [
      [filaT("entre", "95", "97.9"), filaT("<=", "102")],
      [filaT(">=", "95"), filaT("<=", "102")],
      [filaT("entre", "95", "97.9"), filaT("entre", "100.1", "102")],
    ]) {
      const rangos = { bien: [filaT("entre", "98", "100")], atencion, critico: [filaT("<", "95"), filaT(">", "102")] };
      const e = estadoDeRangos("constante", rangos);
      expect(e.sinAtencion).toBe(false);
      expect(e.atencion).toHaveLength(2);
      expect(e.atencion.every((f) => f.valor !== "")).toBe(true);
      expect(rangosDelEditor(e)).toEqual(rangos);
    }
    // Una sola fila de Atención queda en su lado y la otra en blanco.
    const una = estadoDeRangos("constante", { bien: [filaT("entre", "98", "100")], atencion: [filaT("<=", "102")], critico: [filaT("<", "95"), filaT(">", "102")] });
    expect(una.atencion[0].valor).toBe("");
    expect(una.atencion[1].valor).toBe("102");
  });
});

describe("FormularioFicha: «Lo calcula el sistema» (14B, Tarea 4)", () => {
  /** Con la unidad «Días» en el maestro y dos cálculos que ya tienen ficha activa. */
  const OPCIONES_AUTO: OpcionesFicha = {
    ...OPCIONES,
    unidades: [...OPCIONES.unidades, { id: 3, nombre: "Días", sufijo: " días", decimales: 1 }],
    calculosActivos: [
      { calculo: "conformidad_fecha", alcance: "entidad", procesoId: 2 },
      { calculo: "vencidos", alcance: "proceso", procesoId: 13 },
    ],
  };
  // Sin interacción (el render es estático): «elegir» es pintar el formulario con lo elegido.
  const automatico = (calculo?: string, mas: Partial<DatosFicha> = {}, opciones = OPCIONES_AUTO) =>
    renderToStaticMarkup(<FormularioFicha opciones={opciones} valores={{ procesoId: 2, origenDato: "automatico", calculo, ...mas }} />);
  const radioOrigen = (h: string, valor: string) => h.match(new RegExp(`<input(?=[^>]*name="origenDato")(?=[^>]*value="${valor}")[^>]*>`))?.[0] ?? "";
  const html = pintar({ procesoId: 2, meta: "80", tendencia: "ascendente", umbralAtencionPct: 70 });

  it("«Cómo se obtiene el dato» va en «Más opciones», con sus dos opciones; una ficha nace con «Lo digita una persona»", () => {
    const manual = pintar();
    const mas = masOpciones(manual);
    expect(mas).toContain("Cómo se obtiene el dato");
    expect(mas).toContain(">Lo digita una persona<");
    expect(mas).toContain(">Lo calcula el sistema<");
    expect(radioOrigen(manual, "manual")).toContain('checked=""');
    expect(radioOrigen(manual, "automatico")).not.toContain('checked=""');
    // Sin «Lo calcula el sistema» no hay cálculo que elegir ni que enviar.
    expect(manual).not.toContain('name="calculo"');
    expect(manual).not.toContain('name="calculoAlcance"');
    expect(manual).not.toContain("Lo pone el cálculo");
  });

  it("al elegir «Lo calcula el sistema» aparecen «Cálculo» y «Alcance» y desaparecen las variables, la prueba y quién mide", () => {
    const h = automatico("acuses", { calculoAlcance: "entidad" });
    expect(radioOrigen(h, "automatico")).toContain('checked=""');
    const mas = masOpciones(h);
    expect(mas).toContain(">Cálculo</label>");
    expect(mas).toContain(">Alcance</label>");
    expect(mas).toMatch(/<select[^>]*name="calculo"[^>]*>(?:(?!<\/select>)[\s\S])*<option value="acuses" selected="">Acuses de lectura confirmados<\/option>/);
    for (const ausente of [
      'id="ficha-variables"',
      ">Variables</legend>",
      ">Prueba</legend>",
      "¿Cómo se calcula?",
      'name="factor"',
      'name="formula"',
      "Quién mide",
      "La misma persona que mide",
      "Cargos responsables de medir",
      "Cada reporte debe llevar su soporte",
      "Detalle de las variables",
      'id="ficha-tendencia"',
    ]) {
      expect(h, ausente).not.toContain(ausente);
    }
    expect(h).toContain('id="ficha-analiza"');
    expect(mas).toContain("Cargos responsables de analizar");
  });

  it("«Lo pone el cálculo» dice la fórmula en palabras, las variables con su descripción y la tendencia, a la vista", () => {
    const h = automatico("acuses", { calculoAlcance: "entidad" });
    const lopone = h.slice(h.indexOf("Lo pone el cálculo"), h.indexOf(">Nombre<"));
    expect(lopone).toContain("(Acuses confirmados ÷ Acuses confirmados y pendientes) × 100");
    expect(lopone).toContain("A · Acuses confirmados");
    expect(lopone).toContain("Cuenta los acuses de lectura pedidos en el periodo que la persona ya confirmó");
    expect(lopone).toContain("B · Acuses confirmados y pendientes");
    expect(lopone).toContain("Ascendente (mayor es mejor)");
    expect(masOpciones(h)).not.toContain("Lo pone el cálculo");
    // Sin cálculo elegido, dice dónde elegirlo.
    expect(automatico()).toContain("Elija el cálculo en «Más opciones», en «Cómo se obtiene el dato».");
    // La tendencia es la del cálculo, no la que traiga el formulario.
    expect(automatico("aprobacion", { tendencia: "ascendente", calculoAlcance: "entidad" })).toContain("Descendente (menor es mejor)");
  });

  it("solo ofrece los alcances del cálculo; con uno solo, ya está elegido", () => {
    const unico = automatico("conformidad_fecha");
    expect(unico).not.toMatch(/<select[^>]*name="calculoAlcance"/);
    expect(unico).toMatch(/<input(?=[^>]*id="ficha-calculoAlcance")(?=[^>]*readOnly="")(?=[^>]*value="Toda la entidad")[^>]*>/);
    expect(oculto(unico, "calculoAlcance")).toBe("entidad");
    const dos = automatico("acuses");
    const opciones = dos.match(/<select[^>]*name="calculoAlcance"[^>]*>([\s\S]*?)<\/select>/)?.[1] ?? "";
    expect([...opciones.matchAll(/>([^<]+)<\/option>/g)].map((m) => m[1])).toEqual(["Elija el alcance", "Toda la entidad", "El proceso de la ficha"]);
    expect(opciones).toContain('<option value="" selected="">Elija el alcance</option>');
    const objetivos = automatico("objetivos_cumplidos", { calculoAlcance: "calidad" }).match(/<select[^>]*name="calculoAlcance"[^>]*>([\s\S]*?)<\/select>/)?.[1] ?? "";
    expect(objetivos).toContain('<option value="calidad" selected="">Objetivos de calidad</option>');
    expect(objetivos).toContain(">Todos los objetivos</option>");
    expect(objetivos).not.toContain("Toda la entidad");
  });

  it("el plazo y el inicio de medición dicen lo que hacen en cada clase de cálculo", () => {
    const flujo = automatico("aprobacion", { calculoAlcance: "entidad" });
    expect(flujo).toContain(">Días de espera antes de calcular</label>");
    expect(flujo).toContain("El sistema calcula el periodo cuando pasan estos días desde su fin. Con 0, al terminar el periodo.");
    expect(flujo).not.toContain("Plazo de reporte (días)");
    // «Tiempo de aprobación» se llena hacia atrás: el inicio se elige y la ayuda lo dice.
    expect(flujo).toMatch(/<select[^>]*name="inicioMedicion"/);
    expect(flujo).toContain("El sistema calcula solo los periodos anteriores.");

    const estado = automatico("dentro_plazo", { calculoAlcance: "entidad" });
    expect(estado).toContain(">Plazo de reporte (días)</label>");
    expect(estado).toContain("Es la fecha límite del análisis. La foto se toma al terminar el periodo.");
    // No se llena hacia atrás: no hay inicio que elegir; viaja el periodo en curso, que el servidor fija al aprobar.
    expect(estado).not.toMatch(/<select[^>]*name="inicioMedicion"/);
    expect(estado).toContain("Empieza en el periodo en curso cuando se apruebe.");
    expect(oculto(estado, "inicioMedicion")).toBe("2026-T4");
    expect(oculto(automatico("dentro_plazo", { calculoAlcance: "entidad", periodicidad: "mensual" }), "inicioMedicion")).toBe("2026-11");
    // «Acuses» es de flujo pero no se llena hacia atrás.
    const acuses = automatico("acuses", { calculoAlcance: "entidad" });
    expect(acuses).toContain(">Días de espera antes de calcular</label>");
    expect(acuses).toContain("Empieza en el periodo en curso cuando se apruebe.");
    // Una ficha manual sigue como siempre.
    expect(html).toContain(">Plazo de reporte (días)</label>");
    expect(html).toContain("Después del cierre del periodo.");
    expect(html).toMatch(/<select[^>]*name="inicioMedicion"/);
  });

  it("envía origenDato, calculo y calculoAlcance, y lo que el esquema exige con lo del registro", () => {
    const h = automatico("aprobacion", { calculoAlcance: "proceso", mide: [7], analiza: [7], cargosMedir: [4], soporteObligatorio: true, prueba: { valores: { A: "1", B: "2" } } });
    const enviados = nombres(h);
    for (const n of ["origenDato", "calculo", "calculoAlcance", "forma", "variables", "tendencia", "inicioMedicion", "cargosAnalizar"]) expect(enviados, n).toContain(n);
    for (const n of ["factor", "formula", "prueba", "soporteObligatorio"]) expect(enviados, n).not.toContain(n);
    expect(control(h, "calculoAlcance")).toMatch(/<select/);
    expect(h).toMatch(/<select[^>]*name="calculoAlcance"[^>]*>(?:(?!<\/select>)[\s\S])*<option value="proceso" selected="">/);
    expect(oculto(h, "forma")).toBe("razon");
    expect(oculto(h, "tendencia")).toBe("descendente");
    const variables = EsquemaFicha.shape.variables.safeParse(oculto(h, "variables"));
    expect(variables.success).toBe(true);
    expect(variables.data?.map((v) => [v.letra, v.nombre, v.descripcion, v.consolidacion])).toEqual(
      CALCULOS.aprobacion.variables.map((v) => [v.letra, v.nombre, v.descripcion, v.consolidacion]),
    );
    // Nadie mide: ni persona ni cargo. Quien medía y analizaba sigue analizando.
    expect(JSON.parse(oculto(h, "mide")!)).toEqual([]);
    expect(JSON.parse(oculto(h, "cargosMedir")!)).toEqual([]);
    expect(JSON.parse(oculto(h, "analiza")!)).toEqual([7]);
    expect(h).toMatch(/<select id="ficha-analiza"[^>]*>(?:(?!<\/select>)[\s\S])*<option value="7" selected="">Coordinadora del SGC<\/option>/);
  });

  it("todo control de una ficha automática tiene su etiqueta y envía un campo del esquema", () => {
    const claves = Object.keys(EsquemaFicha.shape);
    for (const h of [automatico(), automatico("conformidad_fecha", { meta: "90" }), automatico("acuses"), automatico("aprobacion", { calculoAlcance: "entidad" })]) {
      for (const c of h.match(/<(?:input|select|textarea)\b[^>]*>/g) ?? []) {
        if (/type="hidden"/.test(c)) continue;
        if (/aria-label="[^"]+"/.test(c)) continue;
        const id = /\sid="([^"]+)"/.exec(c)?.[1];
        expect(id, c).toBeTruthy();
        expect(h, c).toContain(`for="${id}"`);
      }
      for (const n of nombres(h)) expect(claves, n).toContain(n);
    }
  });

  it("si el cálculo y el alcance ya tienen ficha activa, lo avisa junto al selector", () => {
    const aviso = "Ya hay una ficha activa para ese cálculo y alcance.";
    expect(masOpciones(automatico("conformidad_fecha"))).toContain(aviso);
    // Con alcance «proceso», solo la del mismo proceso.
    expect(automatico("vencidos", { calculoAlcance: "proceso" })).not.toContain(aviso);
    expect(automatico("vencidos", { calculoAlcance: "proceso", procesoId: 13 })).toContain(aviso);
    expect(automatico("vencidos", { calculoAlcance: "entidad" })).not.toContain(aviso);
    expect(automatico("acuses", { calculoAlcance: "entidad" })).not.toContain(aviso);
    // Una ficha manual no avisa nada.
    expect(renderToStaticMarkup(<FormularioFicha opciones={OPCIONES_AUTO} valores={{ procesoId: 2, calculo: "conformidad_fecha", calculoAlcance: "entidad" }} />)).not.toContain(aviso);
  });

  it("la unidad nace en la sugerida por el cálculo si existe en el maestro; una elegida a mano se conserva", () => {
    const unidad = (h: string) => h.match(/<select[^>]*id="ficha-unidadId"[^>]*>(?:(?!<\/select>)[\s\S])*?<option value="(\d+)" selected="">/)?.[1];
    expect(unidad(automatico("aprobacion"))).toBe("3");
    expect(automatico("aprobacion")).toMatch(/<select[^>]*id="ficha-decimales"[^>]*>(?:(?!<\/select>)[\s\S])*<option value="1" selected="">1<\/option>/);
    expect(unidad(automatico("vencidos"))).toBe("2");
    expect(unidad(automatico("acuses"))).toBe("1");
    // Sin «Días» en el maestro, la que sugiere su forma (un promedio, «Número»).
    expect(unidad(automatico("aprobacion", {}, { ...OPCIONES_AUTO, unidades: OPCIONES.unidades }))).toBe("2");
    expect(unidad(automatico("aprobacion", { unidadId: 1 }))).toBe("1");
  });

  it("un cálculo que exige meta lo dice en la meta", () => {
    expect(automatico("conformidad_fecha")).toContain("Obligatoria en este cálculo: con ella se juzga la conformidad en Distribución.");
    expect(automatico("acuses")).toContain("Opcional: sin meta, el indicador solo se vigila.");
  });

  it("en un cambio, la ayuda dice que cambiar el origen es un cambio mayor, y no muestra quién mide ni el soporte", () => {
    const cambio = renderToStaticMarkup(
      <FormularioFicha
        opciones={OPCIONES_AUTO}
        valores={{ procesoId: 2, origenDato: "automatico", calculo: "aprobacion", calculoAlcance: "entidad", plazoReporteDias: 5, inicioMedicion: "2026-T3", soporteObligatorio: true, mide: [8], analiza: [7] }}
        edicion={{ versionId: 15, cambio: true, codigoFijo: true }}
      />,
    );
    expect(masOpciones(cambio)).toContain("Cambiarlo es un cambio mayor.");
    expect(masOpciones(pintar())).not.toContain("Cambiarlo es un cambio mayor.");
    expect(cambio).toContain(">Días de espera antes de calcular</label>");
    expect(control(cambio, "plazoReporteDias")).toMatch(/readonly=""/i);
    expect(cambio).not.toContain('id="ficha-mide"');
    expect(cambio).not.toContain('id="ficha-soporteObligatorio"');
    expect(cambio).not.toContain('name="soporteObligatorio"');
    expect(JSON.parse(oculto(cambio, "mide")!)).toEqual([]);
    expect(JSON.parse(oculto(cambio, "analiza")!)).toEqual([7]);
    expect(cambio).toContain('<input type="hidden" name="inicioMedicion" value="2026-T3"/>');
  });

  it("los mensajes del servidor sobre el cálculo van a su campo y abren «Más opciones»", () => {
    expect(campoDeMasOpciones("Elija el cálculo que hace el sistema")).toBe("ficha-calculo");
    expect(campoDeMasOpciones("Ese cálculo no admite ese alcance")).toBe("ficha-calculoAlcance");
    expect(campoDeMasOpciones("Ya hay una ficha activa para ese cálculo y alcance: SGC-ID-004")).toBe("ficha-calculo");
    expect(campoDeMasOpciones("Ya hay una ficha activa para ese cálculo y alcance")).toBe("ficha-calculo");
    expect(campoDeMasOpciones("Un cálculo que no se llena hacia atrás rige desde el periodo en curso")).toBe("ficha-inicioMedicion");
    // La meta está a la vista: no abre nada.
    expect(campoDeMasOpciones("Este cálculo exige una meta: con ella se juzga la conformidad en Distribución")).toBeNull();
    expect(campoDelError("Este cálculo exige una meta: con ella se juzga la conformidad en Distribución")).toBe("ficha-meta");
    expect(campoDelError("Elija el cálculo que hace el sistema")).toBe("ficha-calculo");
    // La meta entera de un cálculo con tarjeta de Vigencia (anexo 14B, §6) también va a la meta, sin abrir nada.
    expect(campoDelError(META_ENTERA)).toBe("ficha-meta");
    expect(campoDeMasOpciones(META_ENTERA)).toBeNull();

    const sinCalculo = renderToStaticMarkup(
      <FormularioFicha opciones={OPCIONES_AUTO} valores={{ procesoId: 2, origenDato: "automatico" }} errorInicial="Elija el cálculo que hace el sistema" />,
    );
    expect(masOpciones(sinCalculo)).toContain('<p id="ficha-calculo-error" role="alert"');
    expect(sinCalculo.split("Elija el cálculo que hace el sistema").length - 1).toBe(1);
    const alcance = renderToStaticMarkup(
      <FormularioFicha opciones={OPCIONES_AUTO} valores={{ procesoId: 2, origenDato: "automatico", calculo: "conformidad_fecha" }} errorInicial="Ese cálculo no admite ese alcance" />,
    );
    expect(masOpciones(alcance)).toContain('<p id="ficha-calculoAlcance-error" role="alert"');
    const meta = renderToStaticMarkup(
      <FormularioFicha
        opciones={OPCIONES_AUTO}
        valores={{ procesoId: 2, origenDato: "automatico", calculo: "conformidad_fecha" }}
        errorInicial="Este cálculo exige una meta: con ella se juzga la conformidad en Distribución"
      />,
    );
    expect(meta).toContain('<p id="ficha-meta-error" role="alert"');
    // En una ficha manual el cálculo no se pinta: el mensaje queda al pie.
    const manual = renderToStaticMarkup(<FormularioFicha opciones={OPCIONES_AUTO} errorInicial="Elija el cálculo que hace el sistema" />);
    expect(manual).toContain('<p role="alert" class="text-sm text-estado-critico-texto">Elija el cálculo que hace el sistema</p>');
    // En una automática, lo de las variables (que no se pintan) también.
    const variables = renderToStaticMarkup(
      <FormularioFicha opciones={OPCIONES_AUTO} valores={{ procesoId: 2, origenDato: "automatico", calculo: "acuses" }} errorInicial="El nombre de cada variable debe tener al menos 1 carácter" />,
    );
    expect(variables).toContain('<p role="alert" class="text-sm text-estado-critico-texto">El nombre de cada variable debe tener al menos 1 carácter</p>');
  });
});

describe("FormularioFicha: el origen de cada variable y la desagregación (14C, Tarea 8)", () => {
  /** Dos datos (uno ya inactivo, citado por el borrador), tres indicadores (uno restringido, uno retirado) y dos dimensiones. */
  const OPCIONES_14C: OpcionesFicha = {
    ...OPCIONES,
    datos: [
      { id: 50, nombre: "Partos atendidos", proceso: "Gestión del Talento Humano", periodicidad: "mensual", consolidacion: "suma", unidad: "partos", dimensionId: null, dimension: null },
      { id: 51, nombre: "Camas disponibles", proceso: "Sistema de Gestión de Calidad", periodicidad: "trimestral", consolidacion: "ultimo", unidad: null, dimensionId: null, dimension: null, inactivo: true },
    ],
    tomables: [
      { id: 70, codigo: "SGC-ID-001", nombre: "Satisfacción del usuario", periodicidad: "mensual", conMeta: true, restringido: false },
      { id: 71, codigo: "GTH-ID-002", nombre: "Ausentismo laboral", periodicidad: "trimestral", conMeta: true, restringido: true },
      { id: 72, codigo: "SGC-ID-003", nombre: "Quejas resueltas", periodicidad: "trimestral", conMeta: false, restringido: false, retirado: true },
    ],
    dimensiones: [
      { id: 3, nombre: "Sede" },
      { id: 4, nombre: "Servicio", inactiva: true },
    ],
  };
  type Variable = DatosFicha["variables"][number];
  const propia = (letra: string, mas: Partial<Variable> = {}): Variable => ({ letra, nombre: `Propia ${letra}`, consolidacion: "suma", admiteNegativos: false, ...mas });
  const delDato = (letra: string, datoId: number): Variable => ({
    letra,
    nombre: "Partos atendidos",
    consolidacion: "suma",
    admiteNegativos: false,
    origen: "compartida",
    datoId,
  });
  /** Como la devuelve `valoresDeVersion`: «cómo se junta» queda en «último», la columna es obligatoria. */
  const tomada = (letra: string, indicadorOrigenId: number, toma: "valor" | "cumplimiento" = "valor"): Variable => ({
    letra,
    nombre: `Tomada ${letra}`,
    consolidacion: "ultimo",
    admiteNegativos: false,
    origen: "indicador",
    indicadorOrigenId,
    toma,
  });
  const BASE: Partial<DatosFicha> = {
    procesoId: 2,
    nombre: "Atención integral",
    proposito: "Saber cuántas atenciones integrales se prestan",
    forma: "libre",
    meta: "80",
    tendencia: "ascendente",
    cargosMedir: [4],
    cargosAnalizar: [4],
  };
  const conVariables = (variables: Variable[], mas: Partial<DatosFicha> = {}): Partial<DatosFicha> => ({
    ...BASE,
    formula: variables.map((v) => v.letra).join(" + "),
    variables,
    ...mas,
  });
  const pintar14c = (valores: Partial<DatosFicha>, edicion?: { versionId: number; cambio: boolean; codigoFijo: boolean }) =>
    renderToStaticMarkup(<FormularioFicha opciones={OPCIONES_14C} valores={valores} edicion={edicion} />);
  /** La etiqueta de apertura del control con ese `id`. */
  const porId = (h: string, id: string) => h.match(new RegExp(`<(?:input|select|textarea)\\b(?=[^>]*\\sid="${id}")[^>]*>`))?.[0] ?? "";
  /** Las opciones de la lista con ese `id`: su valor, su texto y si está elegida. */
  const opcionesDe = (h: string, id: string) => {
    const lista = h.match(new RegExp(`<select\\b(?=[^>]*\\sid="${id}")[^>]*>([\\s\\S]*?)</select>`))?.[1] ?? "";
    return [...lista.matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)].map((m) => ({
      valor: /\svalue="([^"]*)"/.exec(m[1])?.[1] ?? "",
      texto: m[2],
      elegida: /\sselected=""/.test(m[1]),
    }));
  };
  const desescapar = (t: string) => t.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  /**
   * Lo que el navegador enviaría con el formulario tal como se pinta, sin tocar nada, leído como `parsearFormulario`: cada
   * control con nombre que no esté deshabilitado (las casillas y los radios, solo marcados; una lista, su opción elegida o
   * la primera), sin los vacíos ni el `id` de la ruta (que la acción omite); un nombre repetido, como lista.
   */
  function enviado(h: string): Record<string, string | string[]> {
    const pares: [string, string][] = [];
    for (const [, a] of h.matchAll(/<input\b([^>]*)>/g)) {
      const nombre = /\sname="([^"]+)"/.exec(a)?.[1];
      if (!nombre || /\sdisabled=""/.test(a)) continue;
      const tipo = /\stype="([^"]+)"/.exec(a)?.[1] ?? "text";
      const marcable = tipo === "checkbox" || tipo === "radio";
      if (marcable && !/\schecked=""/.test(a)) continue;
      pares.push([nombre, desescapar(/\svalue="([^"]*)"/.exec(a)?.[1] ?? (marcable ? "on" : ""))]);
    }
    for (const [, a, cuerpo] of h.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
      const nombre = /\sname="([^"]+)"/.exec(a)?.[1];
      if (!nombre || /\sdisabled=""/.test(a)) continue;
      const opciones = [...cuerpo.matchAll(/<option\b([^>]*)>/g)].map((m) => m[1]);
      const elegida = opciones.find((o) => /\sselected=""/.test(o)) ?? opciones[0] ?? "";
      pares.push([nombre, desescapar(/\svalue="([^"]*)"/.exec(elegida)?.[1] ?? "")]);
    }
    for (const [, a, cuerpo] of h.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/g)) {
      const nombre = /\sname="([^"]+)"/.exec(a)?.[1];
      if (nombre) pares.push([nombre, desescapar(cuerpo)]);
    }
    const objeto: Record<string, string | string[]> = {};
    for (const clave of new Set(pares.map(([n]) => n).filter((n) => n !== "id"))) {
      const valores = pares.filter(([n, v]) => n === clave && v !== "").map(([, v]) => v);
      if (valores.length > 0) objeto[clave] = valores.length === 1 ? valores[0] : valores;
    }
    return objeto;
  }

  it("cada variable pinta sus tres orígenes en un grupo con su leyenda, con «Propia» por omisión, y el grupo no viaja", () => {
    const h = pintar14c(conVariables([propia("A"), propia("B")]));
    expect(ORIGENES_DE_VARIABLE.map((o) => o.nombre)).toEqual(["Propia", "Dato compartido", "Resultado de otro indicador"]);
    for (const letra of ["A", "B"]) {
      expect(h).toMatch(new RegExp(`<fieldset id="ficha-variable-${letra}-origen"[^>]*><legend[^>]*>De dónde sale ${letra}</legend>`));
      for (const o of ORIGENES_DE_VARIABLE) {
        const radio = porId(h, `ficha-variable-${letra}-origen-${o.valor}`);
        expect(radio, o.valor).toContain('type="radio"');
        // El valor va en el JSON de `variables`: el radio no tiene nombre, así el esquema estricto no lo ve.
        expect(radio, o.valor).not.toMatch(/\sname=/);
        expect(h).toMatch(new RegExp(`for="ficha-variable-${letra}-origen-${o.valor}"[^>]*>(?:(?!</label>)[\\s\\S])*${o.nombre}`));
      }
      // Una sola parada del tabulador por grupo, en la elegida; las flechas recorren las demás.
      expect(porId(h, `ficha-variable-${letra}-origen-propia`)).toMatch(/checked=""/);
      expect(porId(h, `ficha-variable-${letra}-origen-propia`)).toMatch(/tabindex="0"/i);
      expect(porId(h, `ficha-variable-${letra}-origen-compartida`)).toMatch(/tabindex="-1"/i);
      expect(porId(h, `ficha-variable-${letra}-origen-indicador`)).not.toMatch(/checked=""/);
    }
    const variables = JSON.parse(oculto(h, "variables")!) as Variable[];
    expect(variables.map((v) => v.origen)).toEqual(["propia", "propia"]);
    // Una ficha sin `origen` (anterior a la 14C) nace en «Propia».
    expect(porId(pintar14c({ ...BASE, forma: "porcentaje" }), "ficha-variable-A-origen-propia")).toMatch(/checked=""/);
  });

  it("elegir el origen cambia solo el origen: pasar por otra opción con las flechas y volver no pierde lo elegido (ronda 1)", () => {
    const { datos, tomables } = OPCIONES_14C;
    const v = (x: Variable) => ({ ...x, origen: x.origen ?? ("propia" as const) });
    expect(cambioDeOrigen("compartida")).toEqual({ origen: "compartida" });
    expect(cambioDeOrigen("propia")).toEqual({ origen: "propia" });
    // Una propia con lo suyo que elige un dato, pasa por «Resultado de otro indicador» y elige uno, y vuelve: lo conserva todo.
    let x = v(propia("A", { nombre: "Partos del mes", consolidacion: "promedio", fuente: "Libro de partos" }));
    for (const paso of [cambioDeOrigen("compartida"), { datoId: 50 }, cambioDeOrigen("indicador"), cambioDeIndicador(x, 70, tomables), cambioDeOrigen("propia")]) {
      x = { ...x, ...paso };
    }
    expect(x).toMatchObject({ origen: "propia", nombre: "Partos del mes", consolidacion: "promedio", fuente: "Libro de partos", datoId: 50, indicadorOrigenId: 70 });
    // Al volver a cada origen, lo de ese origen sigue ahí; y lo que se lee como nombre es el del dato, si es un dato.
    expect(nombreDeVariable({ ...x, ...cambioDeOrigen("compartida") }, datos)).toBe("Partos atendidos");
    expect(nombreDeVariable(x, datos)).toBe("Partos del mes");
    expect(nombreDeVariable({ ...x, origen: "compartida", datoId: undefined }, datos)).toBe("");
    // Elegir el indicador: el nombre del indicador si la variable no tenía; del cumplimiento de uno con meta a uno sin meta, su valor.
    expect(cambioDeIndicador(v(propia("A", { nombre: " " })), 70, tomables)).toEqual({ indicadorOrigenId: 70, nombre: "Satisfacción del usuario" });
    expect(cambioDeIndicador(v(propia("A")), 70, tomables)).toEqual({ indicadorOrigenId: 70 });
    expect(cambioDeIndicador(v(tomada("A", 70, "cumplimiento")), 72, tomables)).toEqual({ indicadorOrigenId: 72, toma: "valor" });
  });

  it("una tomada cargada no deja en el estado el «último» del servidor (si vuelve a ser propia, nace en «se suma») y se envía en «último»", () => {
    expect(conOrigen(tomada("A", 70))).toMatchObject({ origen: "indicador", consolidacion: "suma", indicadorOrigenId: 70 });
    // Una propia en «último» lo conserva; una sin origen (anterior a la 14C) es propia.
    expect(conOrigen(propia("A", { consolidacion: "ultimo" }))).toMatchObject({ origen: "propia", consolidacion: "ultimo" });
    expect(conOrigen({ ...propia("A"), origen: undefined }).origen).toBe("propia");
    const enviada = (JSON.parse(oculto(pintar14c(conVariables([tomada("A", 70), propia("B")])), "variables")!) as Variable[])[0];
    expect(enviada).toMatchObject({ origen: "indicador", consolidacion: "ultimo" });
  });

  it("las flechas pasan al origen siguiente o al anterior, dando la vuelta; otra tecla no cambia nada", () => {
    expect(origenConTecla("propia", "ArrowRight")).toBe("compartida");
    expect(origenConTecla("compartida", "ArrowDown")).toBe("indicador");
    expect(origenConTecla("indicador", "ArrowRight")).toBe("propia");
    expect(origenConTecla("propia", "ArrowLeft")).toBe("indicador");
    expect(origenConTecla("compartida", "ArrowUp")).toBe("propia");
    expect(origenConTecla("propia", "Tab")).toBeNull();
    expect(origenConTecla("propia", "a")).toBeNull();
  });

  it("al elegir «Dato compartido», el nombre queda de solo lectura, sale la lista de datos y, del catálogo, la unidad y cómo se junta", () => {
    const h = pintar14c(conVariables([delDato("A", 50), propia("B")]));
    expect(porId(h, "ficha-variable-A-origen-compartida")).toMatch(/checked=""/);
    expect(h).toContain('for="ficha-variable-A-dato"');
    // El dato inactivo no se ofrece: esta variable no lo citaba (ronda 1).
    expect(opcionesDe(h, "ficha-variable-A-dato")).toEqual([
      { valor: "", texto: "Elija el dato", elegida: false },
      { valor: "50", texto: "Partos atendidos · Gestión del Talento Humano · Mensual", elegida: true },
    ]);
    expect(porId(h, "ficha-variable-A-dato")).toMatch(/required=""/);
    expect(porId(h, "ficha-variable-A")).toMatch(/readOnly=""/);
    expect(porId(h, "ficha-variable-A")).toContain('value="Partos atendidos"');
    expect(porId(h, "ficha-variable-A-dato-unidad")).toMatch(/readOnly=""/);
    expect(porId(h, "ficha-variable-A-dato-unidad")).toContain('value="partos"');
    expect(porId(h, "ficha-variable-A-dato-consolidacion")).toContain('value="Se suma"');
    // Lo demás también lo pone el dato: ni fuente ni detalle editable.
    expect(porId(h, "ficha-variable-A-fuente")).toBe("");
    const mas = masOpciones(h);
    for (const campo of ["descripcion", "unidad", "consolidacion", "min", "max", "negativos"]) expect(porId(mas, `ficha-variable-A-${campo}`), campo).toBe("");
    expect(mas).toContain("Lo pone el dato compartido");
    // La variable propia sigue igual.
    expect(porId(h, "ficha-variable-B")).not.toMatch(/readOnly=""/);
    expect(porId(h, "ficha-variable-B-fuente")).not.toBe("");
    expect(porId(mas, "ficha-variable-B-consolidacion")).not.toBe("");
    // Sin dato elegido, la lista pide uno.
    const sinDato = pintar14c(conVariables([{ ...delDato("A", 50), datoId: undefined, nombre: "" }, propia("B")]));
    expect(opcionesDe(sinDato, "ficha-variable-A-dato")[0]).toEqual({ valor: "", texto: "Elija el dato", elegida: true });
  });

  it("al elegir «Resultado de otro indicador» salen la lista de indicadores y qué se toma, y desaparece «cómo se junta»", () => {
    const h = pintar14c(conVariables([tomada("A", 70, "cumplimiento"), propia("B")]));
    expect(porId(h, "ficha-variable-A-origen-indicador")).toMatch(/checked=""/);
    // El retirado no se ofrece: esta variable no lo citaba (ronda 1).
    expect(opcionesDe(h, "ficha-variable-A-indicador")).toEqual([
      { valor: "", texto: "Elija el indicador", elegida: false },
      { valor: "70", texto: "SGC-ID-001 Satisfacción del usuario", elegida: true },
      { valor: "71", texto: "GTH-ID-002 Ausentismo laboral", elegida: false },
    ]);
    expect(porId(h, "ficha-variable-A-indicador")).toMatch(/required=""/);
    expect(opcionesDe(h, "ficha-variable-A-toma").map(({ texto, elegida }) => [texto, elegida])).toEqual([
      ["Su valor", false],
      ["Su porcentaje de cumplimiento", true],
    ]);
    // El nombre de la variable lo escribe quien elabora; la fuente no aplica.
    expect(porId(h, "ficha-variable-A")).not.toMatch(/readOnly=""/);
    expect(porId(h, "ficha-variable-A-fuente")).toBe("");
    const mas = masOpciones(h);
    expect(porId(mas, "ficha-variable-A-consolidacion")).toBe("");
    expect(mas).not.toContain("Cómo se junta A");
    // Nadie la digita: sin límites de captura ni negativos (ronda 1); sí qué incluye y su unidad.
    for (const campo of ["min", "max", "negativos"]) expect(porId(mas, `ficha-variable-A-${campo}`), campo).toBe("");
    expect(mas).not.toContain("A admite negativos");
    expect(porId(mas, "ficha-variable-A-descripcion")).not.toBe("");
    expect(porId(mas, "ficha-variable-A-unidad")).not.toBe("");
    for (const campo of ["consolidacion", "min", "max", "negativos"]) expect(porId(mas, `ficha-variable-B-${campo}`), campo).not.toBe("");
    // Lo que traiga de límites no se envía.
    const conLimites = pintar14c(conVariables([{ ...tomada("A", 70), capturaMin: "1", capturaMax: "9", admiteNegativos: true }, propia("B")]));
    expect((JSON.parse(oculto(conLimites, "variables")!) as Variable[])[0]).toEqual({
      letra: "A",
      nombre: "Tomada A",
      consolidacion: "ultimo",
      admiteNegativos: false,
      origen: "indicador",
      indicadorOrigenId: 70,
      toma: "valor",
    });
    // Un indicador sin meta no da su cumplimiento.
    const sinMeta = pintar14c(conVariables([tomada("A", 72), propia("B")]));
    expect(opcionesDe(sinMeta, "ficha-variable-A-toma")).toEqual([
      { valor: "valor", texto: "Su valor", elegida: true },
      { valor: "cumplimiento", texto: "Su porcentaje de cumplimiento", elegida: false },
    ]);
    expect(sinMeta).toMatch(/<option value="cumplimiento" disabled="">Su porcentaje de cumplimiento<\/option>/);
    expect(h).not.toMatch(/<option value="cumplimiento" disabled="">/);
  });

  it("con todas las variables ajenas se lee NADIE_MIDE_AJENO donde irían quién mide y su cargo, y no se pide la prueba", () => {
    const ajenas = pintar14c(conVariables([delDato("A", 50), tomada("B", 70)], { mide: [7], analiza: [7], soporteObligatorio: true, prueba: { valores: { A: "1", B: "2" } } }));
    expect(ajenas.split(NADIE_MIDE_AJENO).length - 1).toBe(2);
    expect(masOpciones(ajenas)).toContain(NADIE_MIDE_AJENO);
    expect(ajenas).not.toContain('<select id="ficha-mide"');
    expect(ajenas).not.toContain('id="ficha-cargo-medir"');
    expect(ajenas).not.toContain(">Prueba</legend>");
    expect(ajenas).not.toContain("La misma persona que mide");
    expect(ajenas).not.toContain("Cada reporte debe llevar su soporte");
    const enviados = nombres(ajenas);
    for (const n of ["prueba", "soporteObligatorio"]) expect(enviados, n).not.toContain(n);
    expect(JSON.parse(oculto(ajenas, "mide")!)).toEqual([]);
    expect(JSON.parse(oculto(ajenas, "cargosMedir")!)).toEqual([]);
    // Quien medía y analizaba sigue analizando.
    expect(JSON.parse(oculto(ajenas, "analiza")!)).toEqual([7]);
    // En un cambio, los datos de operación también lo dicen.
    const cambio = pintar14c(conVariables([delDato("A", 50), tomada("B", 70)], { mide: [8], analiza: [7] }), { versionId: 15, cambio: true, codigoFijo: true });
    expect(cambio).toContain(NADIE_MIDE_AJENO);
    expect(cambio).not.toContain("Auxiliar de calidad");
    expect(cambio).not.toContain('id="ficha-soporteObligatorio"');

    // «Cómo se obtiene el dato» no dice que lo digita una persona: llega de otras fuentes (ronda 1).
    expect(masOpciones(ajenas)).toMatch(new RegExp(`for="ficha-origen-manual"[^>]*>(?:(?!</label>)[\\s\\S])*${ORIGEN_AJENO}`));
    expect(ajenas).not.toContain("Lo digita una persona");

    // Con una sola propia, alguien mide: todo vuelve.
    const mixta = pintar14c(conVariables([delDato("A", 50), propia("B")]));
    expect(mixta).not.toContain(NADIE_MIDE_AJENO);
    expect(mixta).not.toContain(ORIGEN_AJENO);
    expect(masOpciones(mixta)).toContain(">Lo digita una persona<");
    expect(mixta).toContain('<select id="ficha-mide"');
    expect(mixta).toContain('id="ficha-cargo-medir"');
    expect(mixta).toContain(">Prueba</legend>");
    expect(JSON.parse(oculto(mixta, "cargosMedir")!)).toEqual([4]);
  });

  it("«Desagregación» va en «Más opciones»: ninguna o una dimensión, con el aviso siempre debajo, para leerlo antes de elegir", () => {
    for (const dimensionId of [undefined, 3]) {
      const mas = masOpciones(pintar14c(conVariables([propia("A")], { dimensionId })));
      expect(mas).toContain(">Desagregación</label>");
      expect(opcionesDe(mas, "ficha-dimensionId").find((o) => o.elegida)?.valor).toBe(dimensionId === undefined ? "" : "3");
      expect(mas).toContain(`<p id="ficha-dimensionId-ayuda" class="text-xs text-muted-foreground">${AVISO_DESAGREGACION}</p>`);
      expect(porId(mas, "ficha-dimensionId")).toContain('aria-describedby="ficha-dimensionId-ayuda"');
    }
    expect(opcionesDe(masOpciones(pintar14c(conVariables([propia("A")]))), "ficha-dimensionId")).toEqual([
      { valor: "", texto: "(ninguna)", elegida: true },
      { valor: "3", texto: "Sede", elegida: false },
      { valor: "4", texto: "Servicio (inactiva)", elegida: false },
    ]);
    // Una ficha automática no se desagrega: no se pinta ni viaja.
    const automatica = renderToStaticMarkup(
      <FormularioFicha opciones={OPCIONES_14C} valores={{ procesoId: 2, origenDato: "automatico", calculo: "acuses", calculoAlcance: "entidad", dimensionId: 3 }} />,
    );
    expect(automatica).not.toContain("ficha-dimensionId");
    expect(nombres(automatica)).not.toContain("dimensionId");
  });

  it("con un indicador restringido elegido sale el aviso de deducción con su nombre, en una insignia de atención que se anuncia", () => {
    const h = pintar14c(conVariables([tomada("A", 71), propia("B")], { nivelAcceso: "restringido" }));
    const aviso = avisoDeDeduccion("Ausentismo laboral");
    expect(aviso).toBe("Quien vea este indicador podrá deducir el resultado de «Ausentismo laboral» si es el único componente que no puede ver");
    // Dentro de una región `aria-live` que ya estaba: se anuncia al elegir el componente (ronda 1).
    // Y, junto a él, que no lo nombre en los textos que sí lee quien ve el indicador (ola final, O18).
    expect(AVISO_DE_NO_NOMBRARLO).toBe("No lo nombre en el propósito ni en el motivo del cambio: esos textos los lee quien ve este indicador.");
    const insignia = (texto: string) => `<span data-variante="atencion"[^>]*>(?:<svg[\\s\\S]*?</svg>)?${texto}</span>`;
    expect(h).toMatch(new RegExp(`<div id="ficha-variable-A-aviso" aria-live="polite"[^>]*>${insignia(aviso)}${insignia(AVISO_DE_NO_NOMBRARLO)}</div>`));
    // La región está en toda variable, vacía hasta que haga falta.
    const general = pintar14c(conVariables([tomada("A", 70), propia("B")]));
    expect(general).not.toContain("podrá deducir");
    expect(general).not.toContain(AVISO_DE_NO_NOMBRARLO);
    for (const letra of ["A", "B"]) expect(general).toMatch(new RegExp(`<div id="ficha-variable-${letra}-aviso" aria-live="polite"[^>]*></div>`));
  });

  it("ida y vuelta: lo que se envía sin tocar nada conserva los tres orígenes, sus referencias y la dimensión", () => {
    const variables = [delDato("A", 50), tomada("B", 70, "cumplimiento"), propia("C", { consolidacion: "promedio", fuente: "Historias clínicas", descripcion: "Las atenciones del mes" })];
    for (const edicion of [undefined, { versionId: 15, cambio: true, codigoFijo: true }]) {
      // Un cambio trae sus datos de operación, como los devuelve `valoresDeVersion`.
      const h = pintar14c(conVariables(variables, { dimensionId: 3, motivoCambio: "Desagregar por sede", inicioMedicion: "2026-T3", nivelAcceso: "general" }), edicion);
      const r = EsquemaFicha.safeParse(enviado(h));
      expect(r.success, r.error?.issues[0]?.message).toBe(true);
      expect(r.data!.dimensionId).toBe(3);
      expect(r.data!.variables).toEqual([
        { letra: "A", nombre: "Partos atendidos", consolidacion: "suma", admiteNegativos: false, origen: "compartida", datoId: 50 },
        { letra: "B", nombre: "Tomada B", consolidacion: "ultimo", admiteNegativos: false, origen: "indicador", indicadorOrigenId: 70, toma: "cumplimiento" },
        {
          letra: "C",
          nombre: "Propia C",
          descripcion: "Las atenciones del mes",
          fuente: "Historias clínicas",
          consolidacion: "promedio",
          admiteNegativos: false,
          origen: "propia",
        },
      ]);
    }
  });

  it("ida y vuelta de una cita vieja: el dato inactivo, el indicador retirado y la dimensión inactiva se ven marcados y se envían igual", () => {
    const h = pintar14c(
      conVariables([{ ...delDato("A", 51), nombre: "Camas disponibles", consolidacion: "ultimo" }, tomada("B", 72), propia("C"), delDato("D", 50), tomada("E", 70)], {
        dimensionId: 4,
      }),
    );
    expect(opcionesDe(h, "ficha-variable-A-dato").find((o) => o.elegida)?.texto).toBe("Camas disponibles · Sistema de Gestión de Calidad · Trimestral (inactivo)");
    expect(opcionesDe(h, "ficha-variable-B-indicador").find((o) => o.elegida)?.texto).toBe("SGC-ID-003 Quejas resueltas (retirado)");
    expect(opcionesDe(h, "ficha-dimensionId").find((o) => o.elegida)?.texto).toBe("Servicio (inactiva)");
    // Solo en la variable que los cita: en las demás no se ofrecen, porque ahí serían una cita nueva (ronda 1).
    expect(opcionesDe(h, "ficha-variable-D-dato").map((o) => o.valor)).toEqual(["", "50"]);
    expect(opcionesDe(h, "ficha-variable-E-indicador").map((o) => o.valor)).toEqual(["", "70", "71"]);
    expect(opcionesDe(h, "ficha-variable-A-dato").map((o) => o.valor)).toEqual(["", "50", "51"]);
    expect(opcionesDe(h, "ficha-variable-B-indicador").map((o) => o.valor)).toEqual(["", "70", "71", "72"]);
    const r = EsquemaFicha.safeParse(enviado(h));
    expect(r.success, r.error?.issues[0]?.message).toBe(true);
    expect(r.data!.dimensionId).toBe(4);
    expect(r.data!.variables.map((v) => [v.letra, v.origen, v.datoId, v.indicadorOrigenId, v.toma])).toEqual([
      ["A", "compartida", 51, undefined, undefined],
      ["B", "indicador", undefined, 72, "valor"],
      ["C", "propia", undefined, undefined, undefined],
      ["D", "compartida", 50, undefined, undefined],
      ["E", "indicador", undefined, 70, "valor"],
    ]);
  });

  it("una variable propia no envía referencias, aunque traiga ids viejos", () => {
    const h = pintar14c(conVariables([propia("A", { datoId: 50, indicadorOrigenId: 70, toma: "valor" }), propia("B")]));
    expect(JSON.parse(oculto(h, "variables")!)).toEqual([
      { letra: "A", nombre: "Propia A", consolidacion: "suma", admiteNegativos: false, origen: "propia" },
      { letra: "B", nombre: "Propia B", consolidacion: "suma", admiteNegativos: false, origen: "propia" },
    ]);
  });

  it("todo control de una ficha con datos, componentes y desagregación tiene su etiqueta, envía un campo del esquema y no repite `id`", () => {
    const claves = [...Object.keys(EsquemaFicha.shape), "id"];
    const variantes = [
      pintar14c(conVariables([delDato("A", 50), tomada("B", 71), propia("C")], { dimensionId: 3, nivelAcceso: "restringido" })),
      pintar14c(conVariables([delDato("A", 50), tomada("B", 70)])),
      pintar14c(conVariables([delDato("A", 50), tomada("B", 70)], { mide: [8] }), { versionId: 15, cambio: true, codigoFijo: true }),
      pintar14c({ ...BASE, forma: "porcentaje", variables: [delDato("A", 50), tomada("B", 72)] }),
    ];
    for (const h of variantes) {
      for (const c of h.match(/<(?:input|select|textarea)\b[^>]*>/g) ?? []) {
        if (/type="hidden"/.test(c)) continue;
        if (/aria-label="[^"]+"/.test(c)) continue;
        const id = /\sid="([^"]+)"/.exec(c)?.[1];
        expect(id, c).toBeTruthy();
        expect(h, c).toContain(`for="${id}"`);
      }
      for (const n of nombres(h)) expect(claves, n).toContain(n);
      const ids = [...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
      expect(ids.filter((x, i) => ids.indexOf(x) !== i)).toEqual([]);
    }
  });

  it("los mensajes del servidor sobre los orígenes y la desagregación van a su campo", () => {
    expect(campoDelError("Elija un dato compartido activo para la variable A")).toBe("ficha-variables");
    expect(campoDelError("Elija el indicador del que sale la variable B y qué se toma de él")).toBe("ficha-variables");
    expect(campoDelError("El indicador de la variable B debe estar activo y tener ficha vigente")).toBe("ficha-variables");
    expect(campoDelError("No se puede tomar el cumplimiento de un indicador sin meta (variable B)")).toBe("ficha-variables");
    expect(campoDelError("Esta ficha cerraría un ciclo entre indicadores")).toBe("ficha-variables");
    expect(campoDeMasOpciones("Elija una dimensión activa")).toBe("ficha-dimensionId");
    expect(campoDeMasOpciones("Un indicador desagregado no puede tomar el resultado de otro indicador")).toBe("ficha-dimensionId");
    expect(campoDeMasOpciones("El dato «Partos» está desagregado por Sede: desagregue el indicador por ella")).toBe("ficha-dimensionId");
    expect(campoDeMasOpciones("El dato «Partos» no está desagregado por Sede")).toBe("ficha-dimensionId");
    expect(campoDeMasOpciones("Una fórmula con min, max o abs no se puede desagregar")).toBe("ficha-dimensionId");
    expect(campoDeMasOpciones("Esta ficha toma un indicador restringido: debe ser restringida")).toBe("ficha-nivelAcceso");
    const h = renderToStaticMarkup(
      <FormularioFicha opciones={OPCIONES_14C} valores={conVariables([propia("A")], { dimensionId: 4 })} errorInicial="Elija una dimensión activa" />,
    );
    expect(masOpciones(h)).toContain('<p id="ficha-dimensionId-error" role="alert"');
    expect(h.split("Elija una dimensión activa").length - 1).toBe(1);
  });
});

describe("FormularioFicha: un valor guardado con tres decimales que nadie tocó (complemento de la 14C, Tarea 2)", () => {
  const RANGOS_2375 = JSON.stringify({
    bien: [{ signo: ">=", valor: "2.375" }],
    atencion: [{ signo: "entre", valor: "1.5", hasta: "2.374" }],
    critico: [{ signo: "<", valor: "1.5" }],
  });
  const VARIABLES = [
    { letra: "A", nombre: "Ejecutadas", consolidacion: "suma" as const, admiteNegativos: false, capturaMin: "2.375", capturaMax: "5000.5" },
    { letra: "B", nombre: "Programadas", consolidacion: "suma" as const, admiteNegativos: false },
  ];
  const guardada = () =>
    pintarCambio({ forma: "porcentaje", meta: "100", tendencia: "ascendente", rangos: RANGOS_2375, semaforoModo: "rangos", variables: VARIABLES });
  /** Lo que el formulario manda al servidor: los dos campos ocultos que llevan los valores, más lo mínimo que el esquema exige. */
  const alServidor = (h: string) => {
    const fd = new FormData();
    const base: Record<string, string> = {
      procesoId: "2", nombre: "Cumplimiento", proposito: "Saber si se cumple", tipoId: "1", clasificacionId: "2", forma: "porcentaje",
      unidadId: "1", decimales: "1", periodicidad: "trimestral", tendencia: "ascendente", meta: "100", cargosMedir: "[4]",
      cargosAnalizar: "[4]", normaIds: "[]", plazoReporteDias: "10", inicioMedicion: "2026-T1", nivelAcceso: "general", mide: "[7]", analiza: "[7]",
      semaforoModo: "rangos", rangos: oculto(h, "rangos")!, variables: oculto(h, "variables")!,
    };
    for (const [k, v] of Object.entries(base)) fd.set(k, v);
    return fd;
  };

  it("el campo oculto de los rangos lleva el texto con coma, no con punto", () => {
    const rangos = oculto(guardada(), "rangos")!;
    expect(rangos).not.toMatch(/\d\.\d/);
    expect(JSON.parse(rangos)).toEqual({
      bien: [{ signo: ">=", valor: "2,375" }],
      atencion: [{ signo: "entre", valor: "1,5", hasta: "2,374" }],
      critico: [{ signo: "<", valor: "1,5" }],
    });
  });

  it("los límites de captura viajan con coma desde el principio (en el campo `variables` que el formulario envía)", () => {
    // `renderToStaticMarkup` no deja teclear: lo que viaja al enviar es la función `limpia` sobre el estado inicial.
    const [a] = JSON.parse(oculto(guardada(), "variables")!) as { capturaMin?: string; capturaMax?: string }[];
    expect([a.capturaMin, a.capturaMax]).toEqual(["2,375", "5000,5"]);
  });

  it("con esos valores enviados tal cual, el esquema los acepta y los guarda con punto", () => {
    const d = parsearFormulario(alServidor(guardada()), EsquemaFichaDeLaPersona);
    expect(JSON.parse(d.rangos!).bien[0].valor).toBe("2.375");
    expect(JSON.parse(d.rangos!).atencion[0].hasta).toBe("2.374");
    expect([d.variables[0].capturaMin, d.variables[0].capturaMax]).toEqual(["2.375", "5000.5"]);
  });
});
