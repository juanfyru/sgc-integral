/**
 * Lo que se ve de un indicador desagregado (Fase 14C, Tarea 15; anexo 14C §5.4 y §5.6, maquetas 9 y 10): la rejilla de captura
 * por categoría dentro del formulario de reporte (una celda por categoría y variable propia, con los originales con que se
 * pintó, el «No aplica» de fila con su motivo, el resultado de cada fila y el total), «Actualizar categorías» y la marca «n en
 * Crítico» de la lista y la tabla del año. En render estático con datos de muestra, sin BD.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/acciones-indicadores", () => ({
  reportarAccion: vi.fn(),
  marcarNoAplicaAccion: vi.fn(),
  quitarNoAplicaAccion: vi.fn(),
  actualizarCategoriasDeMedicion: vi.fn(),
  volverACalcularAccion: vi.fn(),
  reabrirMedicionAccion: vi.fn(),
  cerrarDeNuevoAccion: vi.fn(),
}));

import { ListaIndicadores } from "@/componentes/indicadores/ListaIndicadores";
import { ActualizarCategorias } from "@/componentes/indicadores/medicion/ActualizarCategorias";
import { enfocarCuandoSePueda } from "@/componentes/ui/foco";
import { FormularioReporte } from "@/componentes/indicadores/medicion/FormularioReporte";
import { RejillaDeCategorias } from "@/componentes/indicadores/medicion/RejillaDeCategorias";
import { TablaDelAnio } from "@/componentes/indicadores/medicion/TablaDelAnio";
import type { CategoriaDeReporte, DatosDeReporte, FilaDelAnio, VariableAjena } from "@/db/consultas/indicadores/lectura";
import type { FilaDeLista } from "@/db/consultas/indicadores/lista";
import { rejillaEnVivo } from "@/lib/indicadores/categorias";
import type { EstadoReporte } from "@/lib/indicadores/reporte";
import { conCambio, pintadosDe, semilla, valorEn } from "@/lib/indicadores/rejilla-formulario";
import { MOTIVO_DATO_SIN_CATEGORIA, MOTIVO_TODAS_NO_APLICAN } from "@/lib/indicadores/tipos";

const OBRAS = "Cerrado por obras todo octubre.";

const variable = (letra: string, nombre: string): DatosDeReporte["variables"][number] => ({
  letra,
  nombre,
  descripcion: null,
  fuente: null,
  capturaMin: null,
  capturaMax: null,
  admiteNegativos: false,
  valor: null,
  ajena: null,
});

const sede = (id: number, nombre: string, A: string | null, B: string | null, noAplica: string | null = null): CategoriaDeReporte => ({
  id,
  nombre,
  noAplica,
  delSistema: false,
  valores: { A, B },
});

/** Las seis sedes de la maqueta 9. */
const SEDES: CategoriaDeReporte[] = [
  sede(11, "Sede principal", "182", "200"),
  sede(12, "Puesto de salud 1", "43", "50"),
  sede(13, "Puesto de salud 2", "39", "50"),
  sede(14, "Puesto de salud 3", "11", "20"),
  sede(15, "Puesto de salud 4", "0", "0"),
  sede(16, "Puesto de salud 5", null, null, OBRAS),
];

/** El indicador de la maqueta 9: octubre de 2026, por sede, meta 85 y Crítico por debajo de 70. */
const DATOS: DatosDeReporte = {
  medicionId: 90,
  indicadorId: 9,
  codigo: "PYP-ID-003",
  nombre: "Adherencia a la guía de hipertensión",
  periodo: "2026-10",
  etiqueta: "Octubre de 2026",
  vence: "10 de noviembre de 2026",
  vencida: false,
  estado: "abierta",
  historica: false,
  noAplica: false,
  motivo: null,
  reportada: false,
  soporteObligatorio: false,
  soportes: 0,
  sinMedidor: false,
  mide: true,
  automatica: false,
  foto: null,
  seCalcula: null,
  recalculable: false,
  variables: [variable("A", "Pacientes con manejo adherente"), variable("B", "Pacientes auditados")],
  calculo: { formula: "A / B * 100", letras: ["A", "B"], resultadoMin: null, resultadoMax: null },
  formulaEnPalabras: "(Pacientes con manejo adherente ÷ Pacientes auditados) × 100",
  regla: { tendencia: "ascendente", meta: "85", metaMax: null, modo: "fijo", umbralPct: null, limite: "70", tolerancia: null },
  unidad: { sufijo: " %", decimales: 1 },
  rangos: "Bien desde 85 % · Atención de 70 a 84,9 % · Crítico por debajo de 70 %",
  resultado: null,
  semaforo: null,
  cumple: null,
  anterior: null,
  variacionPct: 30,
  categorias: SEDES,
  dimension: "Sede",
};

/** La rejilla sola, con la edición que siembra `estado` (como la arma `FormularioReporte`). */
const rejilla = (o: Partial<DatosDeReporte> = {}, estado: EstadoReporte = null) => {
  const datos = { ...DATOS, ...o, categorias: o.categorias ?? SEDES };
  return renderToStaticMarkup(
    <RejillaDeCategorias
      datos={datos}
      estado={estado}
      edicion={semilla(estado, pintadosDe(datos))}
      alCambiar={() => {}}
      confirmado={false}
      alConfirmar={() => {}}
      pendiente={false}
      alPulsar={() => {}}
      mensaje={null}
    />,
  );
};

const formulario = (o: Partial<DatosDeReporte> = {}, administra = false) =>
  renderToStaticMarkup(<FormularioReporte datos={{ ...DATOS, ...o }} volver="/indicadores/PYP-ID-003" administra={administra} />);

/** El `<input …>` con ese `name`, o `undefined`. */
const campo = (html: string, nombre: string) => new RegExp(`<input[^>]*name="${nombre}"[^>]*>`).exec(html)?.[0];
const valorDe = (etiqueta: string | undefined) => /value="([^"]*)"/.exec(etiqueta ?? "")?.[1];
const veces = (html: string, texto: string) => html.split(texto).length - 1;

describe("RejillaDeCategorias (maquetas 9 y 10)", () => {
  it("una celda por categoría y variable propia, con su nombre accesible y el texto con que se pintó", () => {
    const html = rejilla();
    for (const c of SEDES.slice(0, 5)) {
      for (const [letra, nombre] of [
        ["A", "Pacientes con manejo adherente"],
        ["B", "Pacientes auditados"],
      ] as const) {
        const celda = campo(html, `c_${c.id}_${letra}`);
        expect(celda, `c_${c.id}_${letra}`).toBeDefined();
        expect(celda).toContain(`aria-label="${c.nombre}: ${nombre}"`);
        expect(celda).toContain('inputMode="decimal"');
        expect(valorDe(celda)).toBe(c.valores[letra]);
        expect(valorDe(campo(html, `o_${c.id}_${letra}`))).toBe(c.valores[letra]);
        expect(campo(html, `o_${c.id}_${letra}`)).toContain('type="hidden"');
      }
    }
    // Un solo juego de campos: la tabla de escritorio y las tarjetas del teléfono son el mismo marcado.
    expect(veces(html, 'name="c_')).toBe(10);
    expect(veces(html, 'name="c_11_A"')).toBe(1);
    // La fila «No aplica» no trae celdas, y ninguna celda manda un total digitado.
    expect(html).not.toContain('name="c_16_');
    expect(html).not.toContain('name="valor_');
  });

  it("cada fila dice su resultado y su estado en texto; la de 0 ÷ 0 queda «Sin casos» sola; el total suma las que aplican", () => {
    const html = rejilla();
    expect(html).toContain("91 % · Bien");
    expect(html).toContain("86 % · Bien");
    expect(html).toContain("78 % · Atención");
    expect(html).toContain("55 % · Crítico");
    expect(html).toContain(">Sin casos<");
    // El total: 275 de 320, 85,9 % y Bien.
    expect(html).toMatch(/>Total<[\s\S]*>275<[\s\S]*>320</);
    expect(html).toContain("85,9 %");
    expect(html).toContain("Cumple: 85,9 % frente a una meta de 85 %.");
    // La sede en Crítico se nombra, aunque el total cumpla.
    expect(html).toContain("1 en Crítico: Puesto de salud 3 (55 %)");
    expect(html).not.toMatch(/Falta \d+ categor/);
    // Nada de `opacity` para atenuar.
    expect(html).not.toMatch(/opacity/);
  });

  it("el «No aplica» de fila es una casilla con su motivo; los originales dicen cómo se pintó la fila", () => {
    const html = rejilla();
    const casilla = campo(html, "na_16");
    expect(casilla).toContain('type="checkbox"');
    expect(casilla).toContain('value="1"');
    expect(casilla).toContain("checked");
    expect(html).toMatch(new RegExp(`<textarea[^>]*name="motivo_16"[^>]*>${OBRAS}</textarea>`));
    expect(valorDe(campo(html, "ona_16"))).toBe("1");
    expect(valorDe(campo(html, "omotivo_16"))).toBe(OBRAS);
    // Una fila sin «No aplica»: la casilla sin marcar, sin campo de motivo, y pintada «0».
    expect(campo(html, "na_11")).not.toContain("checked");
    expect(html).not.toContain('name="motivo_11"');
    expect(valorDe(campo(html, "ona_11"))).toBe("0");
    expect(valorDe(campo(html, "omotivo_11"))).toBe("");
    // Nunca un `na_` oculto en «0»: quitaría el «No aplica» que otra persona acaba de poner.
    expect(html).not.toMatch(/<input(?=[^>]*type="hidden")(?=[^>]*name="na_)[^>]*>/);
  });

  it("mientras falta una categoría lo dice con su nombre y no hay total", () => {
    const html = rejilla({ categorias: SEDES.map((c) => (c.id === 13 ? { ...c, valores: { A: "39", B: null } } : c)) });
    expect(html).toContain("Falta 1 categoría: Puesto de salud 2");
    expect(html).not.toContain("85,9 %");
    expect(html).toContain("Lo guardado hasta ahora no se pierde.");
    const dos = rejilla({ categorias: SEDES.map((c) => (c.id === 13 || c.id === 12 ? { ...c, valores: { A: null, B: null } } : c)) });
    expect(dos).toContain("Faltan 2 categorías: Puesto de salud 1, Puesto de salud 2");
  });

  it("un «No aplica» que puso el sistema se muestra con su motivo, sin casilla ni originales de fila", () => {
    const html = rejilla({ categorias: SEDES.map((c) => (c.id === 16 ? { ...c, noAplica: MOTIVO_DATO_SIN_CATEGORIA, delSistema: true } : c)) });
    expect(html).toContain(MOTIVO_DATO_SIN_CATEGORIA);
    expect(html).not.toContain('name="na_16"');
    expect(html).not.toContain('name="ona_16"');
    expect(html).not.toContain('name="omotivo_16"');
    expect(html).not.toContain('name="motivo_16"');
  });

  it("al volver con un error, las celdas se repintan con lo digitado y los originales siguen siendo los de la base", () => {
    const estado: EstadoReporte = {
      ok: false,
      error: "Puesto de salud 2: «Pacientes auditados» debe ser un número",
      // Un original enviado distinto del de la base («150») y del digitado («999»): el `o_` pintado debe ser el de la base.
      valores: { c_11_A: "999", o_11_A: "150", ona_11: "1", omotivo_11: "otra cosa", na_12: "1", ona_12: "0", motivo_12: "Sin pacientes este mes", omotivo_12: "" },
    };
    const html = rejilla({}, estado);
    expect(valorDe(campo(html, "c_11_A"))).toBe("999");
    expect(valorDe(campo(html, "o_11_A"))).toBe("182");
    expect(valorDe(campo(html, "ona_11"))).toBe("0");
    expect(valorDe(campo(html, "omotivo_11"))).toBe("");
    // La casilla que se marcó vuelve marcada, con su motivo; su estado pintado sigue siendo el de la base.
    expect(campo(html, "na_12")).toContain("checked");
    expect(html).toMatch(/<textarea[^>]*name="motivo_12"[^>]*>Sin pacientes este mes<\/textarea>/);
    expect(valorDe(campo(html, "ona_12"))).toBe("0");
  });

  it("en un mixto, el dato por categoría va fijo en su fila; si aún no llega, «Falta un dato» y «Reportar lo mío»", () => {
    const ajena: VariableAjena = {
      clase: "dato",
      fuenteId: 5,
      nombre: "Pacientes auditados",
      proceso: "Promoción y prevención",
      codigo: null,
      valor: null,
      reporto: null,
      reportadoEn: null,
      reportadoEl: null,
      venceEn: null,
      venceEl: null,
    };
    const mixto: Partial<DatosDeReporte> = {
      variables: [variable("A", "Pacientes con manejo adherente"), { ...variable("B", "Pacientes auditados"), ajena }],
      categorias: SEDES.map((c) => (c.id === 12 ? { ...c, valores: { A: "43", B: null } } : c)),
    };
    const html = formulario(mixto);
    expect(html).not.toContain('name="c_11_B"');
    expect(html).toContain('name="c_11_A"');
    expect(html).toMatch(/>200</);
    expect(html).toContain("Falta un dato");
    expect(html).toContain("Dato compartido · No se cambia desde aquí");
    expect(html).toMatch(/<button[^>]*value="reportar"[^>]*>Reportar lo mío<\/button>/);
    // Ya reportada, la rejilla solo ofrece «Reportar», también en un mixto al que le falta el dato (ronda 1, M2).
    const reportado = formulario({ ...mixto, reportada: true, estado: "reportada" });
    expect(reportado).toMatch(/<button[^>]*value="reportar"[^>]*>Reportar<\/button>/);
    expect(reportado).not.toContain("Reportar lo mío");
  });

  it("la pregunta de la confirmación y su casilla van en el pie fijo, con los botones (ronda 1, I1)", () => {
    const pregunta = "El resultado (85,9 %) se aleja más de 30 % del segundo trimestre de 2026 (50 %). ¿Los datos son correctos?";
    const html = rejilla({}, { ok: false, error: pregunta, confirmar: pregunta });
    const pie = html.indexOf('data-pie="rejilla"');
    expect(pie).toBeGreaterThan(-1);
    const enElPie = html.slice(pie);
    expect(enElPie).toContain(pregunta);
    expect(enElPie).toMatch(/<input(?=[^>]*type="checkbox")(?=[^>]*name="confirmado")(?=[^>]*id="rejilla-confirmado")[^>]*>/);
    expect(enElPie).toContain("Sí, los datos son correctos");
    expect(html.slice(0, pie)).not.toContain('name="confirmado"');
    // La casilla dice qué confirma: la pregunta es su descripción (ronda 2).
    expect(enElPie).toMatch(/<input(?=[^>]*name="confirmado")(?=[^>]*aria-describedby="rejilla-pregunta")[^>]*>/);
    expect(enElPie).toMatch(new RegExp(`<p[^>]*id="rejilla-pregunta"[^>]*>${pregunta.replace(/[().?]/g, "\\$&")}</p>`));
    // El pie toma su alto en una variable: lo que recibe el foco se desplaza por encima de él.
    expect(html).toContain("scroll-mb-[calc(var(--alto-pie,10rem)_+_0.5rem)]");
  });

  it("al volver con la confirmación, las celdas siguen con lo digitado y los originales con la base (ronda 2)", () => {
    const pregunta = "El resultado (98,4 %) se aleja más de 30 % del segundo trimestre de 2026 (50 %). ¿Los datos son correctos?";
    const html = rejilla({}, { ok: false, error: pregunta, confirmar: pregunta, valores: { c_11_A: "199", o_11_A: "150", c_12_A: "43", o_12_A: "43" } });
    expect(valorDe(campo(html, "c_11_A"))).toBe("199");
    expect(valorDe(campo(html, "o_11_A"))).toBe("182");
    expect(valorDe(campo(html, "c_12_A"))).toBe("43");
    expect(html.slice(html.indexOf('data-pie="rejilla"'))).toContain(pregunta);
  });

  it("a 390 px el resultado de una fila puede partirse en la tarjeta; desde 640 px, no (ronda 2)", () => {
    const html = rejilla();
    const celdas = [...html.matchAll(/<td class="order-2 [^"]*"/g)].map((m) => m[0]);
    expect(celdas).toHaveLength(6);
    for (const c of celdas) {
      expect(c).toContain("sm:whitespace-nowrap");
      expect(c).not.toMatch(/[" ]whitespace-nowrap/);
    }
  });

  it("en el teléfono, el pie dice lo que diría el resultado del total: la división por cero y el análisis obligatorio (ronda 1, M3)", () => {
    const ceros = SEDES.map((c) => (c.id === 16 ? c : { ...c, valores: { A: "0", B: "0" } }));
    const html = rejilla({ categorias: ceros });
    expect(html.slice(html.indexOf('data-pie="rejilla"'))).toContain("No se puede calcular: división por cero.");
    const critico = rejilla({ categorias: SEDES.map((c) => (c.id === 11 ? { ...c, valores: { A: "10", B: "200" } } : c)) });
    expect(critico.slice(critico.indexOf('data-pie="rejilla"'))).toContain("el análisis es obligatorio");
    // «No aplica en este periodo» se abre solo cuando el total divide por cero, como en el formulario de siempre.
    expect(formulario({ categorias: ceros })).toMatch(/<details open=""/);
    expect(formulario()).not.toMatch(/<details open=""/);
  });
});

describe("el foco tras «Actualizar categorías» (ronda 2, como «Subir» y «Bajar» de las dimensiones)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("vuelve al botón en cuanto deja de estar deshabilitado; si el botón no está, al aviso", () => {
    class BotonFalso {
      disabled = true;
      focus = vi.fn();
    }
    const cuadros: (() => void)[] = [];
    const elementos: Record<string, unknown> = {};
    vi.stubGlobal("HTMLButtonElement", BotonFalso);
    vi.stubGlobal("requestAnimationFrame", (f: () => void) => cuadros.push(f));
    vi.stubGlobal("document", { getElementById: (id: string) => elementos[id] ?? null });
    const boton = new BotonFalso();
    const aviso = { focus: vi.fn() };
    elementos.boton = boton;
    elementos.aviso = aviso;
    // Mientras la acción termina, el botón sigue deshabilitado: espera un cuadro.
    enfocarCuandoSePueda("boton", "aviso");
    expect(boton.focus).not.toHaveBeenCalled();
    boton.disabled = false;
    cuadros.shift()!();
    expect(boton.focus).toHaveBeenCalledTimes(1);
    expect(aviso.focus).not.toHaveBeenCalled();
    // Sin el botón, después de sus intentos, el aviso.
    delete elementos.boton;
    enfocarCuandoSePueda("boton", "aviso", 2);
    while (cuadros.length > 0) cuadros.shift()!();
    expect(aviso.focus).toHaveBeenCalledTimes(1);
  });

  it("el botón tiene el `id` al que vuelve el foco", () => {
    const html = renderToStaticMarkup(<ActualizarCategorias medicionId={90} etiqueta="Octubre de 2026" />);
    expect(html).toMatch(/<button(?=[^>]*\sid="[^"]+")(?=[^>]*type="submit")[^>]*>Actualizar categorías</);
  });
});

describe("la rejilla del formulario, sin render (ronda 1, M8)", () => {
  const pintados = pintadosDe({ ...DATOS, categorias: SEDES });

  it("lo pintado sale de la base: las celdas propias con coma, la casilla y el motivo de una fila de persona", () => {
    expect(pintados.get("c_11_A")).toBe("182");
    expect(pintados.get("na_16")).toBe("1");
    expect(pintados.get("motivo_16")).toBe(OBRAS);
    expect(pintados.get("na_11")).toBe("0");
    expect(pintadosDe({ ...DATOS, categorias: [sede(20, "Norte", "3.5", null)] }).get("c_20_A")).toBe("3,5");
    // Una fila del sistema no tiene casilla.
    expect(pintadosDe({ ...DATOS, categorias: [{ ...sede(21, "Sur", null, null, MOTIVO_DATO_SIN_CATEGORIA), delSistema: true }] }).has("na_21")).toBe(false);
  });

  it("sin JavaScript, siembra solo lo que la persona cambió frente a lo que se envió como original (M1)", () => {
    const valores = {
      // Cambió la celda: entra.
      c_11_A: "999",
      o_11_A: "182",
      // Se envió igual que su original (que entonces era 43): no entra, aunque hoy la base diga otra cosa.
      c_12_A: "43",
      o_12_A: "43",
      // Marcó una casilla que se pintó sin marcar, con su motivo: entran.
      na_13: "1",
      ona_13: "0",
      motivo_13: "Sin pacientes este mes",
      omotivo_13: "",
      // Desmarcó una que se pintó marcada: entra desmarcada; su motivo se envió igual: no entra.
      ona_16: "1",
      motivo_16: OBRAS,
      omotivo_16: OBRAS,
      // Una casilla sin marcar que se pintó sin marcar: no entra.
      ona_14: "0",
    };
    const conOtraBase = pintadosDe({ ...DATOS, categorias: SEDES.map((c) => (c.id === 12 ? { ...c, valores: { A: "45", B: "50" } } : c)) });
    const e = semilla({ ok: false, error: "x", valores }, conOtraBase);
    expect(Object.keys(e).sort()).toEqual(["c_11_A", "motivo_13", "na_13", "na_16"]);
    expect(valorEn(e, conOtraBase, "c_11_A")).toBe("999");
    expect(valorEn(e, conOtraBase, "c_12_A")).toBe("45");
    expect(valorEn(e, conOtraBase, "na_13")).toBe("1");
    expect(valorEn(e, conOtraBase, "na_16")).toBe("0");
    expect(semilla(null, conOtraBase)).toEqual({});
    expect(semilla({ ok: true, aviso: "ok" }, conOtraBase)).toEqual({});
  });

  it("lo que la persona cambia se muestra mientras la base no cambie ese campo; si cambia, se muestra lo nuevo", () => {
    const e = conCambio({}, pintados, "c_11_A", "190");
    expect(valorEn(e, pintados, "c_11_A")).toBe("190");
    expect(valorEn(e, pintados, "c_11_B")).toBe("200");
    const repintada = pintadosDe({ ...DATOS, categorias: SEDES.map((c) => (c.id === 11 ? { ...c, valores: { A: "195", B: "200" } } : c)) });
    expect(valorEn(e, repintada, "c_11_A")).toBe("195");
  });

  it("rejillaEnVivo: con lo propio completo y sin el dato ajeno, el total espera; con todas las filas «No aplica», ninguna aplica (M9)", () => {
    const d = {
      calculo: DATOS.calculo,
      regla: DATOS.regla,
      unidad: DATOS.unidad,
      variables: [
        { letra: "A", nombre: "Atendidos", capturaMin: null, capturaMax: null, admiteNegativos: false, ajena: false },
        { letra: "B", nombre: "Auditados", capturaMin: null, capturaMax: null, admiteNegativos: true, ajena: true },
      ],
    };
    const espera = rejillaEnVivo(d, [
      { id: 1, nombre: "Norte", noAplica: false, textos: { A: "4", B: "5" } },
      { id: 2, nombre: "Sur", noAplica: false, textos: { A: "3", B: "" } },
    ]);
    expect(espera.total).toEqual({ clase: "espera" });
    expect(espera.filas.map((f) => [f.estado, f.esperaDato])).toEqual([
      ["completa", false],
      ["incompleta", true],
    ]);
    // Sin lo propio, faltan (aunque también falte lo ajeno).
    expect(rejillaEnVivo(d, [{ id: 2, nombre: "Sur", noAplica: false, textos: { A: "", B: "" } }]).total).toEqual({ clase: "faltan", categorias: ["Sur"] });
    const ninguna = rejillaEnVivo(d, [
      { id: 1, nombre: "Norte", noAplica: true, textos: { A: "4", B: "5" } },
      { id: 2, nombre: "Sur", noAplica: true, textos: {} },
    ]);
    expect(ninguna.total).toEqual({ clase: "ninguna_aplica" });
    expect(ninguna.enCritico).toEqual([]);
  });
});

describe("FormularioReporte con una rejilla", () => {
  it("manda la rejilla a reportar, con «Guardar sin reportar» y «Reportar», y conserva «No aplica en este periodo»", () => {
    const html = formulario();
    expect(html).toContain('<input type="hidden" name="id" value="90"/>');
    expect(html).toMatch(/<button(?=[^>]*value="parcial")[^>]*>Guardar sin reportar<\/button>/);
    expect(html).toMatch(/<button(?=[^>]*value="reportar")[^>]*>Reportar<\/button>/);
    expect(html).toContain(">No aplica en este periodo</summary>");
  });

  it("ya reportada solo ofrece «Reportar»; con todas las filas «No aplica», la rejilla en vez de la caja del sistema", () => {
    const reportada = formulario({ reportada: true, estado: "reportada", resultado: "55/64", semaforo: "bien", cumple: true });
    expect(reportada).not.toContain("Guardar sin reportar");
    expect(reportada).not.toContain("Guardar la corrección");
    expect(reportada).toMatch(/<button(?=[^>]*value="reportar")[^>]*>Reportar<\/button>/);

    const todas = formulario({
      reportada: true,
      noAplica: true,
      motivo: MOTIVO_TODAS_NO_APLICAN,
      categorias: SEDES.map((c) => ({ ...c, noAplica: "No operó en el periodo", valores: { A: null, B: null } })),
    });
    expect(todas).toContain('name="na_11"');
    expect(todas).not.toContain("Lo marcó el sistema: se quita solo cuando cambie el dato.");
    // El «No aplica» de toda la medición que puso una persona sigue como hoy.
    expect(formulario({ reportada: true, noAplica: true, motivo: "No hubo auditorías" })).toContain("Quitar «No aplica»");
  });

  it("«Actualizar categorías», solo a quien administra y en una medición abierta sin reportar", () => {
    expect(formulario({}, true)).toMatch(/<button[^>]*type="submit"[^>]*>Actualizar categorías<span class="sr-only"> · octubre de 2026<\/span><\/button>/);
    expect(formulario({}, false)).not.toContain("Actualizar categorías");
    expect(formulario({ reportada: true, estado: "reportada" }, true)).not.toContain("Actualizar categorías");
    expect(formulario({ categorias: null, dimension: null }, true)).not.toContain("Actualizar categorías");
  });
});

describe("la marca «n en Crítico» (anexo 14C, §5.6)", () => {
  const FILA: FilaDeLista = {
    id: 1,
    codigo: "PYP-ID-003",
    nombre: "Adherencia a la guía de hipertensión",
    proceso: "Promoción y prevención",
    subproceso: null,
    subprocesoId: null,
    periodicidad: "mensual",
    restringido: false,
    retirado: false,
    automatico: false,
    estado: "activo",
    cambioEnCurso: null,
    periodo: "2026-10",
    etiquetaPeriodo: "Octubre de 2026",
    resultado: "85,9 %",
    meta: "≥ 85 %",
    semaforo: "bien",
    noAplica: false,
    cumple: true,
    tendencia: [80, 85.9],
    flecha: "sube",
    mejora: true,
    reporte: { texto: "Reportado", vencida: false },
    envio: null,
    enCritico: 1,
    dimension: "Sede",
  };

  it("la lista marca «1 en Crítico» con el nombre de la dimensión para los lectores de pantalla", () => {
    const html = renderToStaticMarkup(
      <ListaIndicadores filas={[FILA, { ...FILA, id: 2, codigo: "PYP-ID-004", enCritico: 0 }, { ...FILA, id: 3, codigo: "PYP-ID-005", enCritico: null, dimension: null }]} resumen={{ bien: 3, bienSinAlcanzar: 0, atencion: 0, critico: 0, sinDato: 0, noAplica: 0, vencidos: 0 }} />,
    );
    expect(veces(html, ">1 en Crítico<")).toBe(1);
    expect(html).toContain('aria-label="1 categoría de Sede en Crítico"');
    // El nombre de la dimensión, también a la vista (ronda 1, D2). Solo la insignia no se parte: el nombre es texto libre.
    expect(veces(html, ">por Sede<")).toBe(1);
    expect(html).toMatch(/<span role="img"(?=[^>]*class="[^"]*flex-wrap)(?![^>]*whitespace-nowrap)[^>]*><span class="whitespace-nowrap"><span data-variante="critico"/);
    expect(html).not.toContain("0 en Crítico");
  });

  it("la tabla del año también, en el estado del periodo", () => {
    const fila: FilaDelAnio = {
      periodo: "2026-10",
      etiqueta: "Octubre de 2026",
      version: 1,
      medicionId: 90,
      estado: "reportada",
      vencida: false,
      vence: "10 de noviembre de 2026",
      historica: false,
      noAplica: false,
      motivo: null,
      valores: [],
      resultado: "85,9 %",
      semaforo: "bien",
      meta: "≥ 85 %",
      cumple: true,
      frase: null,
      requiereAccion: false,
      repetido: false,
      corregida: false,
      metaTardia: false,
      sinAnalisis: false,
      analisis: null,
      causa: null,
      accionPropuesta: null,
      automatica: false,
      fotoEn: null,
      seCalcula: null,
      recalculable: false,
      enCritico: 2,
      dimension: "Sede",
      actualizable: false,
    };
    const html = renderToStaticMarkup(<TablaDelAnio filas={[fila]} variables={[]} anio={2026} codigo="PYP-ID-003" puedeMedir={false} />);
    expect(html).toContain(">2 en Crítico<");
    expect(html).toContain('aria-label="2 categorías de Sede en Crítico"');
    expect(html).toContain(">por Sede<");
    expect(html).not.toContain("Actualizar categorías");
  });

  it("«Actualizar categorías» en las acciones de la tabla del año, a quien administra y en la medición que lo admite (ronda 1, D1)", () => {
    const base: FilaDelAnio = {
      periodo: "2026-10",
      etiqueta: "Octubre de 2026",
      version: 1,
      medicionId: 90,
      estado: "por_reportar",
      vencida: false,
      vence: "10 de noviembre de 2026",
      historica: false,
      noAplica: false,
      motivo: null,
      valores: [],
      resultado: null,
      semaforo: null,
      meta: "≥ 85 %",
      cumple: null,
      frase: null,
      requiereAccion: false,
      repetido: false,
      corregida: false,
      metaTardia: false,
      sinAnalisis: false,
      analisis: null,
      causa: null,
      accionPropuesta: null,
      automatica: false,
      fotoEn: null,
      seCalcula: null,
      recalculable: false,
      enCritico: null,
      dimension: "Sede",
      actualizable: true,
    };
    const tabla = (f: FilaDelAnio, puede: boolean) =>
      renderToStaticMarkup(<TablaDelAnio filas={[f]} variables={[]} anio={2026} codigo="PYP-ID-003" puedeMedir={false} puedeActualizarCategorias={puede} />);
    const html = tabla(base, true);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Actualizar categorías<span class="sr-only"> · octubre de 2026<\/span><\/button>/);
    expect(html).toContain('<input type="hidden" name="id" value="90"/>');
    expect(tabla(base, false)).not.toContain("Actualizar categorías");
    expect(tabla({ ...base, actualizable: false }, true)).not.toContain("Actualizar categorías");
    expect(tabla({ ...base, deOtraPeriodicidad: true }, true)).not.toContain("Actualizar categorías");
  });
});

describe("la ayuda del punto de miles (complemento 14C, Tarea 1)", () => {
  it("va una sola vez sobre la tabla y cada campo de valor propio la referencia", () => {
    const html = rejilla();
    expect(veces(html, `<p id="rejilla-miles"`)).toBe(1);
    expect(html).toContain("Sin puntos de miles; use la coma para los decimales.");
    const celda = campo(html, `c_${SEDES[0].id}_A`);
    expect(celda).toMatch(/aria-describedby="[^"]*rejilla-miles[^"]*"/);
  });
});
