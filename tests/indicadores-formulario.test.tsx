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
import { campoDeMasOpciones, campoDelError, codigoAlCambiarDeEleccion, codigoAlCambiarDeProceso, codigoPropuestoDe, FormularioFicha, siglaVigenteDe } from "@/componentes/indicadores/ficha/FormularioFicha";
import { EsquemaFicha, type DatosFicha } from "@/lib/esquemas/indicadores";
import { unidadDeForma } from "@/lib/indicadores/formula/formas";
import type { OpcionesFicha } from "@/lib/indicadores/tipos";

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
    const mas = masOpciones(pintar({ nivel: "Estratégico", riesgoAsociado: "Caída de la adherencia" }));
    expect(mas).toMatch(/<input(?=[^>]*id="ficha-nivel")(?=[^>]*name="nivel")(?=[^>]*value="Estratégico")[^>]*>/);
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
