/** Lo que pintan las piezas de «Vigencia» sin BD: el chip, las pestañas, la tabla del semáforo y el diálogo. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/acciones-vigencia", () => ({
  ratificarAccion: vi.fn(),
  fijarFechaAccion: vi.fn(),
  quitarFechaAccion: vi.fn(),
  ajustarPlazoAccion: vi.fn(),
}));

import { ChipVigencia } from "@/componentes/vigencia/ChipVigencia";
import { CuerpoRatificar } from "@/componentes/vigencia/DialogoRatificar";
import { FormularioFijarFecha } from "@/componentes/vigencia/DialogoFijarFecha";
import { PestanasVigencia, pestanasVisibles } from "@/componentes/vigencia/PestanasVigencia";
import { TablaSemaforo, type FilaConAcciones } from "@/componentes/vigencia/TablaSemaforo";
import { finDeFecha } from "@/lib/tramites/plazos";

const ZONA = "America/Bogota";
const AHORA = finDeFecha("2026-11-08", ZONA);
const sinAcciones = { ratificar: false, solicitar: false, ajustar: false, verTramite: false };

const base: FilaConAcciones = {
  documentoId: 1,
  codigo: "GTH-PR-01",
  titulo: "Selección y vinculación de personal",
  origen: "interno",
  tipo: "Procedimiento",
  autoridad: "operativo",
  proceso: { id: 3, nombre: "Gestión del Talento Humano", sigla: "GTH" },
  version: { id: 10, numero: 1, edicion: null },
  huella: "a".repeat(64),
  mesesRevision: 12,
  plazoPropio: false,
  ultimaRevision: { fecha: finDeFecha("2025-08-14", ZONA), clase: "aprobacion", quien: "Gerente" },
  proximaRevision: finDeFecha("2026-08-14", ZONA),
  fijada: null,
  vigencia: { estado: "vencida", dias: -86 },
  tramite: null,
  impacto: null,
  edicionPendiente: null,
  revisionAnual: null,
  acciones: { ratificar: true, solicitar: true, ajustar: false, verTramite: false },
};

const filas: FilaConAcciones[] = [
  base,
  {
    ...base,
    documentoId: 2,
    codigo: "SGC-PR-01",
    ultimaRevision: { fecha: finDeFecha("2026-01-30", ZONA), clase: "publicacion", quien: null },
    proximaRevision: finDeFecha("2027-01-30", ZONA),
    fijada: { por: "María F. Perdomo", en: finDeFecha("2026-11-03", ZONA), nota: "carga inicial" },
    vigencia: { estado: "atencion", dias: 83 },
    acciones: { ratificar: true, solicitar: false, ajustar: true, verTramite: false },
  },
  {
    ...base,
    documentoId: 3,
    codigo: "GTH-PR-02",
    version: { id: 12, numero: 2, edicion: null },
    vigencia: { estado: "en_tramite", dias: null },
    tramite: { id: 9, numero: "SOL-2026-002", etapa: "revision", dia: 3 },
    acciones: { ...sinAcciones, verTramite: true },
  },
  {
    ...base,
    documentoId: 4,
    codigo: "CEX-DE-01",
    origen: "externo",
    tipo: "Documento externo",
    version: { id: 13, numero: 1, edicion: "2017" },
    ultimaRevision: { fecha: finDeFecha("2026-02-03", ZONA), clase: "verificacion", quien: "Luz Dary Ortiz" },
    proximaRevision: finDeFecha("2027-02-03", ZONA),
    vigencia: { estado: "al_dia", dias: 87 },
    acciones: sinAcciones,
  },
];

describe("ChipVigencia", () => {
  it("cada estado lleva su texto, nunca solo el color", () => {
    const chip = (f: Pick<FilaConAcciones, "vigencia" | "tramite" | "impacto">) => renderToStaticMarkup(<ChipVigencia fila={f} />);
    expect(chip(base)).toContain("Vencida hace 86 días");
    expect(chip(base)).toContain('data-variante="critico"');
    expect(chip({ ...base, vigencia: { estado: "atencion", dias: 0 } })).toContain("Vence hoy");
    expect(chip({ ...base, vigencia: { estado: "atencion", dias: null } })).toContain("Atención · sin fecha de revisión");
    expect(chip({ ...base, vigencia: { estado: "al_dia", dias: 200 } })).toContain("Al día");
    expect(chip(filas[2])).toContain("En trámite · revisión, día 3");
    // Sin día (etapa sin fecha límite): solo la etapa.
    const sinDia = chip({ ...filas[2], tramite: { ...filas[2].tramite!, dia: null } });
    expect(sinDia).toContain("En trámite · revisión<");
    expect(sinDia).not.toContain("día");
    expect(chip({ ...base, vigencia: { estado: "atencion", dias: 300 }, impacto: { cambioId: 1, procesoId: 3, norma: "Resolución 2003 de 2014" } })).toContain(
      "Atención · revisión por cambio normativo",
    );
  });

  it("el texto no se parte en varias líneas, y en una lista pinta el texto que ya trae", () => {
    expect(renderToStaticMarkup(<ChipVigencia fila={filas[2]} />)).toMatch(/class="whitespace-nowrap">En trámite · revisión, día 3</);
    const enLista = renderToStaticMarkup(<ChipVigencia vigencia={{ estado: "en_tramite", texto: "En trámite · revisión, día 3" }} />);
    expect(enLista).toContain('data-variante="neutra"');
    expect(enLista).toMatch(/class="whitespace-nowrap">En trámite · revisión, día 3</);
  });
});

describe("PestanasVigencia", () => {
  it("pinta solo las pestañas que existen para la persona y marca la activa", () => {
    const html = renderToStaticMarkup(<PestanasVigencia activa="semaforo" visibles={["semaforo"]} />);
    expect(html).toContain("Semáforo");
    expect(html).toContain('aria-current="page"');
    for (const otra of ["Revisión anual", "Externos", "Indicadores"]) expect(html).not.toContain(otra);
    // Quien ve el semáforo ve también la revisión anual y los externos (y los indicadores, con `documentos.indicadores`); el
    // responsable técnico sin `vigencia.ver`, solo los externos.
    expect(pestanasVisibles({ rol: "lider_proceso" }, false)).toEqual(["semaforo", "revision-anual", "externos", "indicadores"]);
    expect(pestanasVisibles({ rol: "consulta" }, true)).toEqual(["externos"]);
    expect(pestanasVisibles({ rol: "consulta" }, false)).toEqual([]);
    const todas = renderToStaticMarkup(<PestanasVigencia activa="semaforo" visibles={["semaforo", "revision-anual", "externos", "indicadores"]} />);
    for (const etiqueta of ["Semáforo", "Revisión anual", "Externos", "Indicadores"]) expect(todas).toContain(etiqueta);
  });
});

describe("TablaSemaforo", () => {
  const html = renderToStaticMarkup(<TablaSemaforo filas={filas} ahora={AHORA} pideCodigo={false} />);

  it("tabla desde 768 px y una tarjeta por documento debajo", () => {
    expect(html).toContain('class="hidden md:block"');
    expect(html).toMatch(/<ul class="flex list-none flex-col gap-3 md:hidden"[^>]*>/);
    expect(html.match(/<li class="rounded-lg border border-border bg-card p-3 text-sm">/g)).toHaveLength(filas.length);
  });

  it("dice la última y la próxima revisión, la fecha fijada y la edición de un externo", () => {
    for (const texto of [
      "14 ago 2025",
      "Aprobación fuera de la plataforma",
      "14 ago 2026",
      "Publicada en la plataforma",
      "Fijada por María F. Perdomo el 3 nov 2026",
      "CEX-DE-01 ed. 2017",
      "Verificado por Luz Dary Ortiz",
    ]) {
      expect(html).toContain(texto);
    }
  });

  it("la línea del tipo de un externo no repite «externo» cuando el tipo ya lo dice", () => {
    expect(html).toContain(">Documento externo<");
    expect(html).not.toContain("Documento externo · externo");
    const otroTipo = renderToStaticMarkup(<TablaSemaforo filas={[{ ...filas[3], tipo: "Guía de práctica clínica" }]} ahora={AHORA} pideCodigo={false} />);
    expect(otroTipo).toContain("Guía de práctica clínica · externo");
  });

  it("los botones salen según las acciones; el trámite abierto se enlaza", () => {
    expect(html).toContain("Ratificar sin cambios");
    expect(html).toContain("/tramites/nueva?documento=GTH-PR-01&amp;motivo=revision_anual");
    expect(html).not.toContain("documento=SGC-PR-01&amp;motivo");
    expect(html).toContain('href="/tramites/9"');
    expect(html).toContain("Ver trámite SOL-2026-002");
    const sinEnlace = renderToStaticMarkup(<TablaSemaforo filas={[{ ...filas[2], acciones: sinAcciones }]} ahora={AHORA} pideCodigo={false} />);
    expect(sinEnlace).not.toContain('href="/tramites/9"');
    expect(sinEnlace).toContain("Trámite SOL-2026-002");
  });

  it("no atenúa con opacidad ni usa colores fijos", () => {
    expect(html).not.toMatch(/opacity-|bg-white|text-gray-|\bazul\b/);
  });

  it("en la revisión anual abierta, la leyenda va junto a los botones, también si no hay botones (spec 13C §7.5)", () => {
    expect(html).not.toContain("En revisión anual");
    const pintar = (fila: FilaConAcciones) => renderToStaticMarkup(<TablaSemaforo filas={[fila]} ahora={AHORA} pideCodigo={false} />);
    const conBotones = pintar({ ...base, revisionAnual: { anio: 2026 } });
    // Una vez en la tabla y otra en la tarjeta, después de los botones.
    expect(conBotones.match(/>En revisión anual 2026</g)).toHaveLength(2);
    expect(conBotones.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).toMatch(/Solicitar cambio En revisión anual 2026/);
    const sinBotones = pintar({ ...base, revisionAnual: { anio: 2026 }, acciones: sinAcciones });
    expect(sinBotones.match(/>En revisión anual 2026</g)).toHaveLength(2);
    expect(sinBotones).not.toContain("Ratificar sin cambios");
  });
});

describe("diálogos de vigencia", () => {
  it("ratificar dice a qué fecha pasará la próxima revisión y pide la nota opcional", () => {
    const html = renderToStaticMarkup(<CuerpoRatificar proximaRevision="8 nov 2027" />);
    expect(html).toContain("La próxima revisión pasará al <strong");
    expect(html).toContain("8 nov 2027");
    expect(html).toContain("Nota (opcional)");
    expect(html).toContain('maxLength="1000"');
  });

  it("fijar la fecha manda todos los documentos y acota la fecha", () => {
    const html = renderToStaticMarkup(
      <FormularioFijarFecha documentoIds={[4, 7, 9]} etiqueta="Fijar" minima="2026-11-09" maxima="2027-11-08" maximaTexto="8 nov 2027" alCerrar={() => {}} />,
    );
    expect(html.match(/name="documentoIds"/g)).toHaveLength(3);
    expect(html).toContain('min="2026-11-09"');
    expect(html).toContain('max="2027-11-08"');
    expect(html).toContain("De mañana al 8 nov 2027.");
    expect(html).toContain('minLength="5"');
  });
});
