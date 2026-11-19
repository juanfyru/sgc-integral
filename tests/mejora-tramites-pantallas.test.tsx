/**
 * Lo que se pinta del cambio documental de una actividad (Fase 15B, anexo §9, maqueta 7): la sección «Cambio documental» de la
 * actividad, lo que comprueba el cierre, el historial del hallazgo y lo que falta para terminar. Sin base: las piezas con sus datos.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HistorialDelHallazgo } from "@/componentes/mejoramiento/HistorialDelHallazgo";
import { CambioDocumental, TramitesDelCierre } from "@/componentes/mejoramiento/actividad/CambioDocumental";
import { PaginaDeActividad } from "@/componentes/mejoramiento/actividad/PaginaDeActividad";
import type { DetalleDeActividad } from "@/db/consultas/mejoramiento/actividades";
import type { TramiteEnlazado } from "@/db/consultas/mejoramiento/tramites-enlace";
import { exigeComoSeAtendieron } from "@/lib/mejoramiento/analisis";
import { PIDALO_AL_LIDER } from "@/lib/mejoramiento/enganches";
import { fechaDeDia } from "@/lib/mejoramiento/formato";

const accion = vi.fn(async () => null);
const ZONA = "America/Bogota";

const tramite = (x: Partial<TramiteEnlazado>): TramiteEnlazado => ({
  enlaceId: 1,
  tramiteId: 40,
  origen: "pedido",
  etapa: "revision",
  terminoBien: false,
  terminoEn: null,
  documento: "PR-GBS-03 Supervisión de contratos",
  tipo: "modificar",
  visible: true,
  seQuita: false,
  ...x,
});

const PUBLICADO = tramite({ enlaceId: 2, tramiteId: 41, etapa: "publicado", terminoBien: true, terminoEn: new Date("2026-11-14T15:00:00Z"), documento: "FO-GBS-12 Informe de supervisión de contratos", tipo: "crear" });
const EN_REVISION = tramite({ enlaceId: 3, tramiteId: 42, origen: "enlazado", seQuita: true });
const CANCELADO = tramite({ enlaceId: 4, tramiteId: 43, etapa: "cancelado", terminoEn: new Date("2026-11-10T15:00:00Z"), documento: "MA-GBS-01 Manual de contratación" });

const seccion = (x: Partial<Parameters<typeof CambioDocumental>[0]>) =>
  renderToStaticMarkup(
    <CambioDocumental actividadId={77} tramites={[]} admite puedePedir={false} devueltaEn={null} zona={ZONA} quitar={accion} {...x} />,
  );

describe("«Cambio documental» en la actividad (maqueta 7)", () => {
  it("a quien puede pedirlo: sus trámites con el estado, «Pedir cambio documental» y «Enlazar un trámite que ya existe»", () => {
    const html = seccion({ tramites: [PUBLICADO, EN_REVISION, CANCELADO], puedePedir: true });
    expect(html).toContain("Cambio documental");
    expect(html).toContain('href="/tramites/nueva?actividad=77"');
    expect(html).toContain("Pedir cambio documental");
    expect(html).toContain('href="/mejoramiento/actividades/77/enlazar"');
    expect(html).toContain("Enlazar un trámite que ya existe");
    expect(html).toContain('href="/tramites/41"');
    expect(html).toContain("FO-GBS-12 Informe de supervisión de contratos");
    expect(html).toMatch(new RegExp(`data-variante="bien"[^>]*>Publicado el ${fechaDeDia("2026-11-14")}`));
    expect(html).toContain("Vale como evidencia de esta actividad.");
    expect(html).toContain("En revisión");
    expect(html).toContain("Queda como historia; no vale como evidencia.");
    // Solo el enlazado después, y si quien mira puede, se quita.
    expect(html.split("Quitar el enlace").length - 1).toBeGreaterThanOrEqual(1);
    expect(html).toContain('name="enlaceId" value="3"');
    expect(html).not.toContain('name="enlaceId" value="2"');
    expect(html).not.toContain(PIDALO_AL_LIDER);
  });

  it("a su responsable, que no solicita trámites: ve los trámites y a quién pedírselo, sin botones", () => {
    const html = seccion({ tramites: [PUBLICADO] });
    expect(html).toContain(PIDALO_AL_LIDER);
    expect(html).not.toContain("Pedir cambio documental");
    expect(html).not.toContain("/enlazar");
  });

  it("un trámite que quien mira no ve no se nombra ni se enlaza", () => {
    const html = seccion({ tramites: [tramite({ visible: false, documento: null })] });
    expect(html).not.toContain("/tramites/40");
    expect(html).not.toContain("PR-GBS-03");
    expect(html).toContain("un documento");
    expect(html).toContain("En revisión");
  });

  it("en una actividad devuelta, el que terminó antes de la devolución ya no vale", () => {
    const html = seccion({ tramites: [PUBLICADO], devueltaEn: new Date("2026-11-20T15:00:00Z") });
    expect(html).toContain("Terminó antes de la devolución: no vale como evidencia de lo corregido.");
  });

  it("sin trámites y con la actividad que ya no admite el pedido, no aparece", () => {
    expect(seccion({ admite: false })).toBe("");
    expect(seccion({ admite: false, tramites: [PUBLICADO] })).toContain("FO-GBS-12");
  });
});

describe("lo que comprueba el cierre (anexo §9.6)", () => {
  it("la regla: riesgos o controles, siempre; solo documentos, sin un trámite que terminó bien; nada, nunca", () => {
    const solo = { documentos: true, riesgos: false, controles: false };
    expect(exigeComoSeAtendieron(solo, 1)).toBe(false);
    expect(exigeComoSeAtendieron(solo, 0)).toBe(true);
    expect(exigeComoSeAtendieron({ documentos: true, riesgos: true, controles: false }, 2)).toBe(true);
    expect(exigeComoSeAtendieron({ documentos: false, riesgos: false, controles: true }, 0)).toBe(true);
    expect(exigeComoSeAtendieron({ documentos: false, riesgos: false, controles: false }, 0)).toBe(false);
    expect(exigeComoSeAtendieron(null, 0)).toBe(false);
  });

  it("la pantalla lista los trámites que terminaron bien y dice si hace falta decir cómo", () => {
    const con = renderToStaticMarkup(<TramitesDelCierre cambios="documentos" tramites={[{ tramiteId: 41, documento: "FO-GBS-12" }]} exige={false} />);
    expect(con).toContain("El análisis pidió cambios en documentos.");
    expect(con).toContain("1 trámite terminó bien");
    expect(con).toContain("FO-GBS-12");
    expect(con).toContain("no hace falta decir cómo se atendieron");
    const sin = renderToStaticMarkup(<TramitesDelCierre cambios="documentos" tramites={[]} exige />);
    expect(sin).toContain("Ningún trámite enlazado terminó bien");
  });
});

describe("el historial del hallazgo (anexo §9.7)", () => {
  it("dice qué pasó con el trámite de cada actividad, sin nombrar el trámite", () => {
    const cuando = new Date("2026-11-18T15:00:00Z");
    const html = renderToStaticMarkup(
      <HistorialDelHallazgo
        zona={ZONA}
        eventos={[
          { id: 1, tipo: "tramite_enlazado", ronda: 1, quien: "M. Cuéllar", cuando, detalle: { actividadId: 77, actividad: "A1.2", tramiteId: 41, origen: "pedido" } },
          { id: 2, tipo: "tramite_enlazado", ronda: 1, quien: "M. Cuéllar", cuando, detalle: { actividadId: 77, actividad: "A1.2", tramiteId: 42, origen: "enlazado" } },
          { id: 3, tipo: "tramite_desenlazado", ronda: 1, quien: "M. Cuéllar", cuando, detalle: { actividadId: 77, actividad: "A1.2", tramiteId: 42 } },
          { id: 4, tipo: "tramite_terminado", ronda: 1, quien: null, cuando, detalle: { actividadId: 77, actividad: "A1.2", tramiteId: 41, etapa: "publicado" } },
        ]}
      />,
    );
    expect(html).toContain("Pidió un trámite documental desde la actividad A1.2");
    expect(html).toContain("Enlazó un trámite documental a la actividad A1.2");
    expect(html).toContain("Quitó un trámite documental de la actividad A1.2");
    expect(html).toContain("Terminó un trámite documental de la actividad A1.2: publicado");
    expect(html).not.toContain("41");
  });
});

describe("lo que falta para terminar una actividad (anexo §9.4)", () => {
  const base: DetalleDeActividad = {
    id: 22, etiqueta: "A2.1", descripcion: "Elaborar el formato de informe de supervisión", responsableId: 8, responsable: "J. Perdomo",
    responsableActivo: true, inicio: "2026-11-01", finOriginal: "2026-12-31", fin: "2026-12-31", vence: "2026-12-31", avance: 100,
    estado: "en_proceso", reprogramaciones: 0, terminadaEn: null, terminadaPor: null, verificacion: null, verificacionNota: null,
    corregirAntesDe: null, vencida: false, accion: { id: 5, etiqueta: "A2", tipo: "correctiva", descripcion: "Formalizar la supervisión" },
    hallazgo: { id: 19, codigo: "HZ-2026-019", titulo: "Contratos sin informe de supervisión", proceso: "Bienes y servicios", estado: "en_ejecucion", etiqueta: "En ejecución", ronda: 1, ve: "actividad" },
    seguimientos: [], archivos: [], esResponsable: true, puedeSeguir: true, puedeReasignar: false, avanceMinimo: 0, ajustePendiente: null,
    puedePedirAjuste: false, gerenciaEn: null, ajustes: [], tramites: [], tramiteQueVale: false, devueltaEn: null,
    cambioDocumental: { admite: true, puedePedir: false },
  };
  const pagina = (a: DetalleDeActividad) =>
    renderToStaticMarkup(
      <PaginaDeActividad
        actividad={a}
        hoy="2026-11-18"
        usuarios={[]}
        subida={null}
        quitables={[]}
        acciones={{ seguimiento: accion, terminar: accion, reasignar: accion, pedirAjuste: accion }}
        cambioDocumental={<p>Sección del cambio documental</p>}
      />,
    );

  it("con un trámite que ya vale, no falta evidencia; con uno en curso, falta un archivo o que termine bien", () => {
    expect(pagina(base)).toContain("Para terminar hace falta al menos un archivo de evidencia.");
    expect(pagina({ ...base, tramites: [EN_REVISION] })).toContain(
      "Para terminar hace falta al menos un archivo de evidencia o un trámite enlazado que termine bien.",
    );
    expect(pagina({ ...base, tramites: [PUBLICADO], tramiteQueVale: true })).not.toContain("Para terminar hace falta");
    expect(pagina(base)).toContain("Sección del cambio documental");
  });
});
