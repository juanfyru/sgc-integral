import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/acciones-tramites", () => ({
  crearSolicitudAccion: vi.fn(),
  darVistoBuenoAccion: vi.fn(),
  negarVistoBuenoAccion: vi.fn(),
  retirarSolicitudAccion: vi.fn(),
}));

import { AccionesSolicitud } from "@/componentes/tramites/AccionesSolicitud";
import { BloqueSolicitud } from "@/componentes/tramites/BloqueSolicitud";
import { EncabezadoTramite } from "@/componentes/tramites/EncabezadoTramite";
import { FormularioSolicitud } from "@/componentes/tramites/FormularioSolicitud";
import { HistorialTramite } from "@/componentes/tramites/HistorialTramite";
import { PasosTramite } from "@/componentes/tramites/PasosTramite";
import { TablaTramites } from "@/componentes/tramites/TablaTramites";
import type { DetalleTramite, ResumenTramite } from "@/db/consultas/tramites";
import { EsquemaFirma, EsquemaMotivoCierre, EsquemaSolicitud } from "@/lib/esquemas/tramites";
import type { Etapa } from "@/lib/tramites/tipos";

const ahora = new Date("2026-11-05T15:00:00Z");

const resumen: ResumenTramite = {
  id: 7,
  numero: "SOL-2026-014",
  tipo: "modificar",
  etapa: "revision",
  ronda: 2,
  codigo: "GTH-PR-02",
  titulo: "Inducción y reinducción",
  versionNumero: 3,
  procesoNombre: "Talento Humano",
  responsables: ["Ana Pérez"],
  venceEn: new Date("2026-11-08T04:59:59.999Z"),
};

const detalle: DetalleTramite = {
  id: 7,
  numero: "SOL-2026-014",
  tipo: "modificar",
  motivo: "mejora",
  justificacion: "Se añade la inducción <b>por</b> servicio.",
  solicitanteId: 1,
  procesoId: 2,
  subprocesoId: null,
  tipoDocumentoId: null,
  tituloPropuesto: null,
  documentoId: 3,
  versionId: 4,
  etapa: "revision",
  ronda: 2,
  elaboradorId: 1,
  revisorId: 5,
  aprobadorId: 5,
  venceEn: new Date("2026-11-08T04:59:59.999Z"),
  motivoCierre: null,
  creadoEn: new Date("2026-11-03T14:00:00Z"),
  codigo: "GTH-PR-02",
  titulo: "Inducción y reinducción",
  versionNumero: 3,
  procesoNombre: "Talento Humano",
  solicitante: "Ana Pérez",
  elaborador: "Ana Pérez",
  revisor: "Luis Díaz",
  aprobador: "Luis Díaz",
  acciones: [],
  eventos: [
    { tipo: "solicitar", persona: "Ana Pérez", ronda: 0, detalle: {}, creadoEn: new Date("2026-11-03T14:12:00Z") },
    { tipo: "visto_bueno_automatico", persona: "Ana Pérez", ronda: 0, detalle: {}, creadoEn: new Date("2026-11-03T14:12:00Z") },
    { tipo: "negar_visto_bueno", persona: "Luis Díaz", ronda: 0, detalle: { motivo: "No aplica <i>aquí</i>." }, creadoEn: new Date("2026-11-04T13:30:00Z") },
  ],
};

describe("PasosTramite", () => {
  const pintar = (etapa: Etapa, tipo: "modificar" | "eliminar" = "modificar") =>
    renderToStaticMarkup(<PasosTramite etapa={etapa} tipo={tipo} />);
  const cuenta = (h: string, patron: RegExp) => (h.match(patron) ?? []).length;

  it("en revisión marca un solo paso actual y cuatro hechos con texto", () => {
    const h = pintar("revision");
    expect(cuenta(h, /aria-current="step"/g)).toBe(1);
    expect(cuenta(h, /<li/g)).toBe(7);
    expect(cuenta(h, /hecho/g)).toBe(4);
    expect(h).toMatch(/aria-current="step"[^]*Revisión/);
  });
  it("una eliminación pinta cinco pasos, sin elaboración ni revisión", () => {
    const h = pintar("aprobacion", "eliminar");
    expect(cuenta(h, /<li/g)).toBe(5);
    expect(h).not.toContain("Elaboración");
    expect(h).not.toContain("Revisión");
    expect(cuenta(h, /aria-current="step"/g)).toBe(1);
    expect(cuenta(h, /hecho/g)).toBe(3);
  });
  it("publicado deja todos los pasos hechos y ninguno actual", () => {
    const h = pintar("publicado");
    expect(h).not.toContain("aria-current");
    expect(cuenta(h, /hecho/g)).toBe(7);
  });
  it("un trámite cerrado sin terminar lo dice con texto y no marca pasos", () => {
    const h = pintar("rechazado");
    expect(h).not.toContain("aria-current");
    expect(h).not.toContain("hecho");
    expect(h).toContain("Rechazado");
  });
});

describe("TablaTramites", () => {
  const pintar = (t: Partial<ResumenTramite>) =>
    renderToStaticMarkup(<TablaTramites tramites={[{ ...resumen, ...t }]} ahora={ahora} />);

  it("un vencido lo dice con texto, no solo con color", () => {
    expect(pintar({ venceEn: new Date("2026-11-04T04:59:59.999Z") })).toContain("Vencido hace 2 días");
    expect(pintar({ venceEn: new Date("2026-11-05T04:59:59.999Z") })).toContain("Vencido hace 1 día<");
  });
  it("«Hoy», «En N días» y sin plazo", () => {
    expect(pintar({ venceEn: new Date("2026-11-06T04:59:59.999Z") })).toContain("Hoy");
    expect(pintar({ venceEn: new Date("2026-11-07T04:59:59.999Z") })).toContain("En 1 día<");
    expect(pintar({ venceEn: new Date("2026-11-09T04:59:59.999Z") })).toContain("En 3 días");
    expect(pintar({ venceEn: null })).toContain("Sin plazo");
  });
  it("trae solicitud, documento, qué pide, etapa con ronda y responsable", () => {
    const h = pintar({});
    for (const texto of ["SOL-2026-014", "GTH-PR-02", "Inducción y reinducción", "Versión 3 en trámite", "Talento Humano", "Modificar", "Revisión, ronda 2", "Ana Pérez"]) {
      expect(h).toContain(texto);
    }
    expect(h).toContain('href="/tramites/7"');
  });
  it("la ronda 1 no se menciona, y lo nuevo se dice", () => {
    const h = pintar({ etapa: "aceptacion", ronda: 0, codigo: null, versionNumero: null, tipo: "crear" });
    expect(h).toContain("Aceptación");
    expect(h).not.toContain("ronda");
    expect(h).toContain("Documento nuevo");
    expect(pintar({ etapa: "elaboracion", ronda: 1 })).not.toContain("ronda");
  });
  it("varios responsables se resumen", () => {
    expect(pintar({ responsables: ["A", "B", "C"] })).toContain("A y 2 más");
  });
});

describe("página del trámite", () => {
  it("EncabezadoTramite muestra código, título, versión, solicitud, qué pide y etapa", () => {
    const h = renderToStaticMarkup(<EncabezadoTramite tramite={detalle} ahora={ahora} />);
    for (const texto of ["GTH-PR-02", "Inducción y reinducción", "Versión 3 en trámite", "SOL-2026-014", "Modificar", "mejora del proceso", "Revisión, ronda 2"]) {
      expect(h).toContain(texto);
    }
    expect(h).toContain("<h1");
  });
  it("BloqueSolicitud escapa la justificación y dice cómo quedó el visto bueno", () => {
    const h = renderToStaticMarkup(<BloqueSolicitud tramite={detalle} />);
    expect(h).toContain("&lt;b&gt;por&lt;/b&gt;");
    expect(h).not.toContain("<b>por");
    expect(h).toContain("Mejora del proceso");
    expect(h).toContain("Ana Pérez");
    expect(h).toMatch(/quien pide es el líder/);
  });
  it("HistorialTramite dice quién hizo qué y escapa el motivo", () => {
    const h = renderToStaticMarkup(<HistorialTramite tipo="modificar" eventos={detalle.eventos} />);
    expect(h).toContain("Ana Pérez pidió la modificación");
    expect(h).toContain("Luis Díaz negó el visto bueno");
    expect(h).toContain("&lt;i&gt;aquí&lt;/i&gt;");
    expect(h).toMatch(/3 de nov/);
  });
  it("AccionesSolicitud pinta solo las acciones permitidas, con etapa y ronda ocultas", () => {
    const con = (acciones: DetalleTramite["acciones"]) =>
      renderToStaticMarkup(<AccionesSolicitud tramite={{ id: 7, etapa: "visto_bueno", ronda: 0 }} acciones={acciones} />);
    expect(con([])).toBe("");
    expect(con(["cancelar", "reasignar"])).toBe("");
    const lider = con(["dar_visto_bueno", "negar_visto_bueno"]);
    expect(lider).toContain("Dar visto bueno");
    expect(lider).toContain("Negar con motivo");
    expect(lider).not.toContain("Retirar");
    expect(lider).toMatch(/name="etapa"[^>]*value="visto_bueno"|value="visto_bueno"[^>]*name="etapa"/);
    const solicitante = con(["retirar"]);
    expect(solicitante).toContain("Retirar la solicitud");
    expect(solicitante).not.toContain("Dar visto bueno");
  });
});

describe("FormularioSolicitud", () => {
  const procesos = [{ id: 1, nombre: "Talento Humano", sigla: "GTH", subprocesos: [{ id: 5, nombre: "Ingreso" }] }];
  const tipos = [{ id: 2, nombre: "Formato", sigla: "FO" }];
  const documentos = [
    { id: 3, codigo: "GTH-PR-02", titulo: "Inducción", proceso: "Talento Humano", conTramite: false },
    { id: 4, codigo: "GTH-PR-03", titulo: "Retiro", proceso: "Talento Humano", conTramite: true },
  ];

  it("con un documento elegido llega como modificación de ese documento", () => {
    const h = renderToStaticMarkup(<FormularioSolicitud procesos={procesos} tipos={tipos} documentos={documentos} documentoInicialId={3} />);
    expect(h).toMatch(/value="modificar"[^>]*checked=""|checked=""[^>]*value="modificar"/);
    expect(h).toMatch(/<option[^>]*value="3"[^>]*selected=""|<option[^>]*selected=""[^>]*value="3"/);
    expect(h).not.toContain('name="tituloPropuesto"');
  });
  it("un documento con trámite abierto no se puede elegir", () => {
    const h = renderToStaticMarkup(<FormularioSolicitud procesos={procesos} tipos={tipos} documentos={documentos} documentoInicialId={3} />);
    expect(h).toMatch(/<option[^>]*disabled=""[^>]*>GTH-PR-03/);
    expect(h).toContain("trámite abierto");
  });
  it("sin documento arranca como creación, con proceso, tipo y título", () => {
    const h = renderToStaticMarkup(<FormularioSolicitud procesos={procesos} tipos={tipos} documentos={documentos} />);
    for (const campo of ["procesoId", "tipoDocumentoId", "tituloPropuesto", "motivo", "justificacion"]) {
      expect(h).toContain(`name="${campo}"`);
    }
    expect(h).not.toContain('name="documentoId"');
  });
});

describe("esquemas del trámite", () => {
  const solicitud = { tipo: "crear", motivo: "mejora", justificacion: "Diez caracteres.", procesoId: "3", tipoDocumentoId: "2", tituloPropuesto: "Tres" };

  it("EsquemaSolicitud convierte los ids, recorta y es estricto", () => {
    expect(EsquemaSolicitud.parse({ ...solicitud, justificacion: "  Diez caracteres.  " })).toEqual({ ...solicitud, procesoId: 3, tipoDocumentoId: 2 });
    expect(EsquemaSolicitud.safeParse({ ...solicitud, extra: "x" }).success).toBe(false);
    expect(EsquemaSolicitud.safeParse({ ...solicitud, tipo: "otro" }).success).toBe(false);
    expect(EsquemaSolicitud.safeParse({ ...solicitud, motivo: "otro" }).success).toBe(false);
  });
  it.each([
    ["justificacion", "x".repeat(9), false],
    ["justificacion", "x".repeat(10), true],
    ["justificacion", "x".repeat(2000), true],
    ["justificacion", "x".repeat(2001), false],
    ["tituloPropuesto", "xx", false],
    ["tituloPropuesto", "xxx", true],
    ["tituloPropuesto", "x".repeat(200), true],
    ["tituloPropuesto", "x".repeat(201), false],
  ])("EsquemaSolicitud: %s de largo %#", (campo, valor, valido) => {
    expect(EsquemaSolicitud.safeParse({ ...solicitud, [campo]: valor }).success).toBe(valido);
  });
  it("EsquemaMotivoCierre pide de 5 a 1000 caracteres", () => {
    expect(EsquemaMotivoCierre.safeParse({ motivo: "1234" }).success).toBe(false);
    expect(EsquemaMotivoCierre.safeParse({ motivo: "   12345   " }).success).toBe(true);
    expect(EsquemaMotivoCierre.safeParse({ motivo: "x".repeat(1001) }).success).toBe(false);
    expect(EsquemaMotivoCierre.safeParse({ motivo: "12345", id: "1" }).success).toBe(false);
  });
  it("EsquemaFirma limita la clave y el código, sin recortar la clave", () => {
    expect(EsquemaFirma.parse({ clave: " con espacio " })).toEqual({ clave: " con espacio " });
    expect(EsquemaFirma.safeParse({ clave: "" }).success).toBe(false);
    expect(EsquemaFirma.safeParse({ clave: "x".repeat(129) }).success).toBe(false);
    expect(EsquemaFirma.safeParse({ clave: "x", codigo: "12345" }).success).toBe(false);
    expect(EsquemaFirma.safeParse({ clave: "x", codigo: "123456" }).success).toBe(true);
    expect(EsquemaFirma.safeParse({ clave: "x", codigo: "x".repeat(21) }).success).toBe(false);
    expect(EsquemaFirma.safeParse({ clave: "x", otro: "y" }).success).toBe(false);
  });
});
