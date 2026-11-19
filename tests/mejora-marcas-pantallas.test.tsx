/**
 * El panel «Requiere acción de mejora» de la página del indicador (Fase 15B, Tarea 9; anexo §6.5, maqueta 5), sin base: qué pinta para
 * un pendiente, con y sin candidatos, para quien no puede dar «No requiere», y para una medición que espera su análisis.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/acciones-mejoramiento", () => ({
  resolverMarcaConOcurrenciaAccion: async () => null,
  resolverMarcaNoRequiereAccion: async () => null,
}));

import { YaDecidida } from "@/componentes/indicadores/medicion/TablaDelAnio";
import { PanelDeMarcas } from "@/componentes/mejoramiento/marcas/PanelDeMarcas";
import type { CandidatoDeMarca, MarcaDeMedicion } from "@/db/consultas/mejoramiento/marcas";
import { ANCLA_DE_MARCAS } from "@/lib/mejoramiento/rutas";

const PENDIENTE: MarcaDeMedicion = {
  medicionId: 41,
  periodo: "Octubre de 2026",
  resultado: "4,6 días frente a una meta de 3 días",
  semaforo: "critico",
  estado: "pendiente",
  esperaHasta: null,
  causa: "Dos de cinco agendas estuvieron cerradas por incapacidad médica",
  accionPropuesta: "Definir un médico de reemplazo y abrir agenda extra",
  analizadaEn: "2026-11-12",
};
const ESPERA: MarcaDeMedicion = {
  ...PENDIENTE,
  medicionId: 42,
  periodo: "Noviembre de 2026",
  estado: "espera_analisis",
  esperaHasta: "2026-11-20",
  causa: null,
  accionPropuesta: null,
};
const CANDIDATOS: CandidatoDeMarca[] = [
  { id: 9, codigo: "HZ-2026-014", titulo: "Oportunidad de citas por encima de la meta", estado: "En ejecución" },
  { id: 8, codigo: "HZ-2026-003", titulo: "Agenda cerrada", estado: "Por formular" },
];
const TODO = { hallazgo: true, noRequiere: true };

const pintar = (p: Partial<Parameters<typeof PanelDeMarcas>[0]>) =>
  renderToStaticMarkup(<PanelDeMarcas marcas={[PENDIENTE]} candidatos={[]} puede={TODO} {...p} />);

describe("el panel de las marcas", () => {
  it("pinta un bloque por pendiente con el periodo, el resultado, la causa y la acción propuesta, y lleva el ancla de la tarea", () => {
    const html = pintar({ marcas: [PENDIENTE, { ...PENDIENTE, medicionId: 43, periodo: "Septiembre de 2026" }] });
    expect(html).toContain(`id="${ANCLA_DE_MARCAS}"`);
    expect(html).toContain("Octubre de 2026");
    expect(html).toContain("Septiembre de 2026");
    expect(html).toContain("4,6 días frente a una meta de 3 días");
    expect(html).toContain("Crítico");
    expect(html).toContain("Análisis del líder");
    expect(html).toContain("Dos de cinco agendas estuvieron cerradas por incapacidad médica");
    expect(html).toContain("Definir un médico de reemplazo y abrir agenda extra");
    expect((html.match(/<li /g) ?? []).length).toBe(2);
  });

  it("con candidatos, «Añadir como ocurrencia de HZ-…» va primero, con «Sugerido»; sin candidatos, no aparece", () => {
    const con = pintar({ candidatos: CANDIDATOS });
    expect(con).toContain("Añadir como ocurrencia de HZ-2026-014");
    expect(con).toContain("Añadir como ocurrencia de HZ-2026-003");
    expect(con.indexOf("HZ-2026-014")).toBeLessThan(con.indexOf("HZ-2026-003"));
    expect((con.match(/Sugerido/g) ?? []).length).toBe(1);
    expect(con.indexOf("Sugerido")).toBeLessThan(con.indexOf("HZ-2026-003"));
    const sin = pintar({});
    expect(sin).not.toContain("Añadir como ocurrencia");
    expect(sin).not.toContain("Sugerido");
  });

  it("«No requiere acción de mejora» solo para quien puede, con el aviso de no escribir datos de pacientes", () => {
    const con = pintar({});
    expect(con).toContain("No requiere acción de mejora");
    expect(con).toContain("No escriba nombres ni documentos de pacientes");
    const sin = pintar({ puede: { hallazgo: true, noRequiere: false } });
    expect(sin).not.toContain("No requiere acción de mejora");
    expect(sin).not.toContain("Justificación");
    expect(sin).toContain("Abrir un hallazgo nuevo");
  });

  it("decide con dos gestos: una salida elegida y «Guardar la decisión»; ninguna sale con un solo clic", () => {
    const html = pintar({ candidatos: CANDIDATOS });
    expect((html.match(/type="radio"/g) ?? []).length).toBe(3);
    expect((html.match(/Guardar la decisión/g) ?? []).length).toBe(1);
    expect(html).not.toMatch(/<button[^>]*>Añadir como ocurrencia/);
  });

  it("«Abrir un hallazgo nuevo» enlaza a /mejoramiento/nuevo?medicion=<id>", () => {
    expect(pintar({})).toContain('href="/mejoramiento/nuevo?medicion=41"');
  });

  it("una medición que espera su análisis lo dice con su fecha y no ofrece ningún botón", () => {
    const html = pintar({ marcas: [ESPERA], candidatos: CANDIDATOS });
    expect(html).toContain("Todavía no es un pendiente");
    expect(html).toContain("La decisión se pedirá cuando tenga su análisis, o el 20 de noviembre de 2026 si no lo tiene.");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Abrir un hallazgo nuevo");
    expect(html).not.toContain("Añadir como ocurrencia");
  });

  it("un pendiente sin análisis lo dice (anexo §6.1) y el que lo tiene, no", () => {
    const sinAnalisis = pintar({ marcas: [{ ...PENDIENTE, causa: null, accionPropuesta: null }] });
    expect(sinAnalisis).toContain("Sin análisis: quien analiza el indicador todavía lo puede escribir.");
    expect(pintar({})).not.toContain("Sin análisis:");
  });

  it("sin marcas no hay panel", () => {
    expect(pintar({ marcas: [] })).toBe("");
  });
});

describe("«Ya decidida» junto a un periodo (anexo §6.5)", () => {
  const EN = new Date("2026-11-12T15:30:00Z");
  it("con el hallazgo visible: «Hallazgo HZ-…» con su enlace", () => {
    const html = renderToStaticMarkup(<YaDecidida salida={{ texto: "Hallazgo HZ-2026-014", enlace: "/mejoramiento/9", justificacion: null, por: "Ana", en: EN }} />);
    expect(html).toContain("Ya decidida");
    expect(html).toContain('href="/mejoramiento/9"');
    expect(html).toContain("Hallazgo HZ-2026-014");
  });

  it("sin la entrada (quien no ve el hallazgo), la tabla no pinta nada: la medición no está en el mapa", () => {
    const salidas = new Map<number, { texto: string; enlace: string | null; justificacion: string | null; por: string; en: Date }>();
    expect(salidas.get(41)).toBeUndefined();
  });

  it("«No requiere acción de mejora» con su justificación, quién y cuándo, sin enlace", () => {
    const html = renderToStaticMarkup(
      <YaDecidida salida={{ texto: "No requiere acción de mejora", enlace: null, justificacion: "El cierre temporal de la sede explica el resultado", por: "María Pérez", en: EN }} />,
    );
    expect(html).toContain("No requiere acción de mejora");
    expect(html).toContain("El cierre temporal de la sede explica el resultado");
    expect(html).toContain("María Pérez");
    expect(html).toContain("2026");
    expect(html).not.toContain("<a ");
  });
});
