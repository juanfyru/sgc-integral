/**
 * Lo que se ve de un indicador desagregado (Fase 14C, Tarea 15; anexo 14C §5.4 y §5.6, maquetas 9 y 10): la rejilla de captura
 * por categoría dentro del formulario de reporte (una celda por categoría y variable propia, con los originales con que se
 * pintó, el «No aplica» de fila con su motivo, el resultado de cada fila y el total), «Actualizar categorías» y la marca «n en
 * Crítico» de la lista y la tabla del año. En render estático con datos de muestra, sin BD.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

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
import { FormularioReporte } from "@/componentes/indicadores/medicion/FormularioReporte";
import { RejillaDeCategorias } from "@/componentes/indicadores/medicion/RejillaDeCategorias";
import { TablaDelAnio } from "@/componentes/indicadores/medicion/TablaDelAnio";
import type { CategoriaDeReporte, DatosDeReporte, FilaDelAnio, VariableAjena } from "@/db/consultas/indicadores/lectura";
import type { FilaDeLista } from "@/db/consultas/indicadores/lista";
import type { EstadoReporte } from "@/lib/indicadores/reporte";
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

const rejilla = (o: Partial<DatosDeReporte> = {}, estado: EstadoReporte = null) =>
  renderToStaticMarkup(
    <RejillaDeCategorias datos={{ ...DATOS, ...o, categorias: o.categorias ?? SEDES }} estado={estado} pendiente={false} alPulsar={() => {}} mensaje={null} />,
  );

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
    expect(html).toContain("1 en Crítico: Puesto de salud 3");
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
    expect(html).not.toMatch(/<input[^>]*type="hidden"[^>]*name="na_/);
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
      valores: { c_11_A: "999", o_11_A: "999", ona_11: "1", omotivo_11: "otra cosa", na_12: "1", ona_12: "0", motivo_12: "Sin pacientes este mes" },
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
    expect(formulario({}, true)).toMatch(/<button[^>]*type="submit"[^>]*>Actualizar categorías<\/button>/);
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
    };
    const html = renderToStaticMarkup(<TablaDelAnio filas={[fila]} variables={[]} anio={2026} codigo="PYP-ID-003" puedeMedir={false} />);
    expect(html).toContain(">2 en Crítico<");
    expect(html).toContain('aria-label="2 categorías de Sede en Crítico"');
  });
});
