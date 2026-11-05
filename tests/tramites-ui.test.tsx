import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/acciones-tramites", () => ({
  aceptarSolicitudAccion: vi.fn(),
  crearSolicitudAccion: vi.fn(),
  darVistoBuenoAccion: vi.fn(),
  negarVistoBuenoAccion: vi.fn(),
  rechazarSolicitudAccion: vi.fn(),
  retirarSolicitudAccion: vi.fn(),
}));

import { AccionesSolicitud } from "@/componentes/tramites/AccionesSolicitud";
import { BloqueSolicitud } from "@/componentes/tramites/BloqueSolicitud";
import { EncabezadoTramite } from "@/componentes/tramites/EncabezadoTramite";
import { FormularioSolicitud } from "@/componentes/tramites/FormularioSolicitud";
import { HistorialTramite } from "@/componentes/tramites/HistorialTramite";
import { PanelAceptacion, type TramiteParaAceptar } from "@/componentes/tramites/PanelAceptacion";
import { PasosTramite } from "@/componentes/tramites/PasosTramite";
import { TablaTramites } from "@/componentes/tramites/TablaTramites";
import type {
  CatalogoClasificacion,
  ContextoAceptacion,
  DatosParaAceptar,
  DetalleTramite,
  ResumenTramite,
} from "@/db/consultas/tramites";
import {
  EsquemaAceptarCreacion,
  EsquemaAceptarEliminacion,
  EsquemaAceptarModificacion,
  EsquemaFirma,
  EsquemaMotivoCierre,
  EsquemaSolicitud,
} from "@/lib/esquemas/tramites";
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

describe("PanelAceptacion", () => {
  const ana = { id: 1, nombre: "Ana Admin", cargo: "Coordinadora de calidad", rol: "admin_sgc" as const };
  const leo = { id: 2, nombre: "Leo Líder", cargo: null, rol: "lider_proceso" as const };
  const gina = { id: 3, nombre: "Gina Gerente", cargo: "Gerente", rol: "gerencia" as const };
  const carlos = { id: 4, nombre: "Carlos Consulta", cargo: null, rol: "consulta" as const };

  const creacion: TramiteParaAceptar = {
    id: 7, etapa: "aceptacion", ronda: 0, tipo: "crear", solicitanteId: 2, procesoId: 20, subprocesoId: null,
    tipoDocumentoId: 50, tituloPropuesto: "Consentimiento de <b>menores</b>", codigo: null, titulo: "Consentimiento de <b>menores</b>", procesoNombre: "Consulta Externa",
  };
  const catalogo: CatalogoClasificacion = {
    tipos: [
      { id: 50, nombre: "Formato", sigla: "FO", activo: true, autoridad: "operativo", plantilla: { codigo: "SGC-FO-01", version: 3 } },
      { id: 51, nombre: "Manual", sigla: "MN", activo: true, autoridad: "estrategico", plantilla: null },
    ],
    procesos: [{ id: 20, nombre: "Consulta Externa", sigla: "CEX", subprocesos: [{ id: 200, nombre: "Odontología" }] }],
    documentos: [
      { id: 90, codigo: "CEX-FO-03", titulo: "Consentimiento de odontología", version: 2, versionSiguiente: 3, procesoId: 20, proceso: "Consulta Externa", tipoId: 50, tipo: "Formato", autoridad: "operativo", conTramite: false, conBorrador: false },
      { id: 91, codigo: "CEX-FO-04", titulo: "Con trámite", version: 1, versionSiguiente: 2, procesoId: 20, proceso: "Consulta Externa", tipoId: 50, tipo: "Formato", autoridad: "operativo", conTramite: true, conBorrador: false },
      { id: 92, codigo: "AIN-FO-02", titulo: "De otro proceso", version: 1, versionSiguiente: 2, procesoId: 21, proceso: "Internación", tipoId: 50, tipo: "Formato", autoridad: "operativo", conTramite: false, conBorrador: false },
    ],
    formatoCodigo: "{PROCESO}-{TIPO}-{NN}",
    codigos: ["CEX-FO-03", "CEX-FO-04"],
  };
  const datos: DatosParaAceptar = {
    parecidos: [
      { documentoId: 90, codigo: "CEX-FO-03", titulo: "Consentimiento de odontología", version: 2, procesoId: 20, nivel: "muy_parecido" },
      { documentoId: 92, codigo: "AIN-FO-02", titulo: "De otro proceso", version: 1, procesoId: 21, nivel: "parecido" },
    ],
    codigoSugerido: "CEX-FO-05",
    plantilla: { codigo: "SGC-FO-01", version: 3 },
    autoridad: "operativo",
    usuarios: [ana, leo, gina, carlos],
  };
  const contexto: ContextoAceptacion = { solicitanteRol: "lider_proceso", documento: null, catalogo };

  const panel = (p: Partial<React.ComponentProps<typeof PanelAceptacion>> = {}) =>
    renderToStaticMarkup(
      <PanelAceptacion tramite={creacion} datos={datos} contexto={contexto} usuarioId={1} plazos={{ revision: 5, aprobacion: 7 }} hoy="2026-11-05" venceSugerida="2026-11-20" {...p} />,
    );
  /** El valor elegido y las opciones de un `<select>`, leídos del HTML. */
  const selector = (html: string, nombre: string) => {
    const bloque = new RegExp(`<select[^>]*name="${nombre}"[^>]*>(.*?)</select>`).exec(html)?.[1] ?? "";
    const opciones = [...bloque.matchAll(/<option value="([^"]*)"( selected="")?/g)];
    return { valores: opciones.map((o) => o[1]).filter(Boolean), elegido: opciones.find((o) => o[2])?.[1] ?? "" };
  };

  it("una creación muestra los parecidos, la clasificación, el código sugerido y los responsables", () => {
    const html = panel();
    expect(html).toContain("¿Ya existe un documento parecido?");
    expect(html).toContain("Muy parecido");
    expect(html).toContain("Parecido");
    expect(html).toContain("de otro proceso");                           // el estado no es solo color
    expect(html).toContain('name="codigo"');
    expect(html).toContain('value="CEX-FO-05"');
    expect(html).toContain("Sugerido: siguiente consecutivo de CEX-FO");
    expect(html).toContain("SGC-FO-01, versión 3");
    expect(html).toContain('min="2026-11-05"');
    expect(html).toContain('value="2026-11-20"');
    expect(html).toContain("Aceptar y abrir el trámite");
    expect(html).toContain("Rechazar con motivo");
    expect(html).toContain("&lt;b&gt;menores");                          // el título propuesto es texto plano
  });

  it("sin parecidos lo dice, y sin formato pide escribir el código", () => {
    const html = panel({ datos: { ...datos, parecidos: [], codigoSugerido: null } });
    expect(html).toContain("No hay documentos vigentes con un título parecido");
    expect(html).toContain("No hay un formato de código configurado");
  });

  it("por defecto elabora quien pidió y revisa quien acepta; el revisor excluye al elaborador", () => {
    const html = panel();
    expect(selector(html, "elaboradorId")).toMatchObject({ elegido: "2", valores: ["1", "2", "3", "4"] });
    expect(selector(html, "revisorId")).toEqual({ elegido: "1", valores: ["1"] });
  });

  it("si quien acepta es el elaborador, el revisor queda sin valor", () => {
    const html = panel({ tramite: { ...creacion, solicitanteId: 1 } });
    expect(selector(html, "revisorId")).toEqual({ elegido: "", valores: ["2"] });
  });

  it("un candidato único a aprobar viene elegido; el rol sale de la autoridad y de quien elabora", () => {
    const operativo = panel();
    expect(selector(operativo, "aprobadorId")).toEqual({ elegido: "1", valores: ["1"] });
    expect(operativo).toContain("Formato es un tipo operativo: aprueba el Administrador del SGC");
    const elaboraAdmin = panel({ tramite: { ...creacion, solicitanteId: 1 } });
    expect(selector(elaboraAdmin, "aprobadorId")).toEqual({ elegido: "3", valores: ["3"] });
    expect(elaboraAdmin).toContain("Elabora un Administrador del SGC: aprueba Gerencia");
    const estrategico = panel({ tramite: { ...creacion, tipoDocumentoId: 51 } });
    expect(selector(estrategico, "aprobadorId").valores).toEqual(["3"]);
    expect(estrategico).toContain("Manual es un tipo estratégico: aprueba Gerencia");
  });

  it("sin candidatos dice qué falta y desactiva Aceptar", () => {
    const html = panel({ tramite: { ...creacion, tipoDocumentoId: 51 }, datos: { ...datos, usuarios: [ana, leo, carlos] } });
    expect(html).toContain("No hay ningún usuario activo con el rol Gerencia");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Aceptar y abrir el trámite/);
    const sinOtro = panel({ tramite: { ...creacion, solicitanteId: 3, tipoDocumentoId: 51 } });
    expect(sinOtro).toContain("No hay otro usuario activo con el rol Gerencia: quien elabora no puede aprobar");
    expect(panel({ datos: { ...datos, usuarios: [leo, gina] } })).toContain("No hay ningún usuario activo que pueda revisar");
  });

  it("si quien pidió ya no está activo, nadie elabora por defecto", () => {
    const html = panel({ datos: { ...datos, usuarios: [ana, gina] } });
    expect(selector(html, "elaboradorId").elegido).toBe("");
  });

  it("una modificación muestra los datos sin editarlos y el título actual", () => {
    const tramite: TramiteParaAceptar = { ...creacion, tipo: "modificar", tipoDocumentoId: null, tituloPropuesto: null, codigo: "GTH-PR-02", titulo: "Inducción", procesoNombre: "Talento Humano" };
    const html = panel({
      tramite,
      datos: { ...datos, parecidos: [], codigoSugerido: null },
      contexto: { solicitanteRol: "lider_proceso", documento: { tipo: "Procedimiento", versionSiguiente: 4 }, catalogo: null },
    });
    expect(html).toContain("GTH-PR-02");
    expect(html).toContain("Procedimiento");
    expect(html).toContain("Talento Humano");
    expect(html).toContain("Versión");
    expect(html).toMatch(/<input[^>]*name="tituloNuevo"[^>]*value="Inducción"|<input[^>]*value="Inducción"[^>]*name="tituloNuevo"/);
    for (const campo of ["codigo", "tipoDocumentoId", "principal", "decision", "titulo"]) expect(html).not.toContain(`name="${campo}"`);
    expect(html).not.toContain("¿Ya existe un documento parecido?");
    expect(html).toContain("Procedimiento es un tipo operativo");
  });

  it("una eliminación solo pide el aprobador", () => {
    const tramite: TramiteParaAceptar = { ...creacion, tipo: "eliminar", tipoDocumentoId: null, tituloPropuesto: null, codigo: "GTH-PR-02", titulo: "Inducción" };
    const eliminar = (solicitanteRol: "lider_proceso" | "admin_sgc", solicitanteId = 2) =>
      panel({
        tramite: { ...tramite, solicitanteId },
        datos: { ...datos, parecidos: [], codigoSugerido: null },
        contexto: { solicitanteRol, documento: { tipo: "Procedimiento", versionSiguiente: 4 }, catalogo: null },
      });
    const html = eliminar("lider_proceso");
    expect(html).toContain('name="aprobadorId"');
    for (const campo of ["elaboradorId", "revisorId", "venceElaboracion", "tituloNuevo", "codigo"]) expect(html).not.toContain(`name="${campo}"`);
    expect(html).not.toContain("Clasificación y código");
    expect(html).toContain("Aceptar y pasar a aprobación");
    expect(selector(html, "aprobadorId").valores).toEqual(["1"]);
    const pideAdmin = eliminar("admin_sgc", 99);                         // quien pidió ya no está activo, pero su rol cuenta
    expect(selector(pideAdmin, "aprobadorId").valores).toEqual(["3"]);
    expect(pideAdmin).toContain("La pide un Administrador del SGC: aprueba Gerencia");
  });

  it("ningún texto llama Coordinador SGC al rol", () => {
    expect(panel()).not.toContain("Coordinador SGC");
  });
});

describe("esquemas del trámite", () => {
  const solicitud = { tipo: "crear", motivo: "mejora", justificacion: "Diez caracteres.", procesoId: "3", tipoDocumentoId: "2", tituloPropuesto: "Tres" };

  describe("aceptar", () => {
    const responsables = { elaboradorId: "2", revisorId: "3", aprobadorId: "4", venceElaboracion: "2026-11-20" };
    const nuevo = { decision: "nuevo", tipoDocumentoId: "5", principal: "s:7", titulo: "Formato nuevo", nivelAcceso: "general", codigo: " cex-fo-01 ", ...responsables };

    it("una marca sola o varias dan listas, y los ids llegan como números", () => {
      const uno = EsquemaAceptarCreacion.parse({ ...nuevo, asociaciones: "p:2", relacionados: "9" });
      expect(uno.asociaciones).toEqual([{ subprocesoId: 7, esPrincipal: true }, { procesoId: 2, esPrincipal: false }]);
      expect(uno.relacionados).toEqual([9]);
      expect(uno.codigo).toBe("CEX-FO-01");
      expect(uno).toMatchObject({ tipoDocumentoId: 5, elaboradorId: 2, revisorId: 3, aprobadorId: 4 });
      const varios = EsquemaAceptarCreacion.parse({ ...nuevo, asociaciones: ["p:2", "s:7", "s:7"], relacionados: ["9", "10"] });
      expect(varios.asociaciones).toEqual([{ subprocesoId: 7, esPrincipal: true }, { procesoId: 2, esPrincipal: false }]);
      expect(varios.relacionados).toEqual([9, 10]);
      expect(EsquemaAceptarCreacion.parse(nuevo)).toMatchObject({ relacionados: [], asociaciones: [{ subprocesoId: 7, esPrincipal: true }] });
    });

    it.each(["tipoDocumentoId", "principal", "titulo", "nivelAcceso", "codigo", "elaboradorId", "revisorId", "aprobadorId", "venceElaboracion"])(
      "un documento nuevo exige %s",
      (campo) => {
        const incompleto: Record<string, string> = { ...nuevo };
        delete incompleto[campo];
        expect(EsquemaAceptarCreacion.safeParse(incompleto).success).toBe(false);
      },
    );

    it("convertir en modificación exige el documento y no pide la clasificación", () => {
      const convertir = { decision: "modificacion", ...responsables };
      const sinDocumento = EsquemaAceptarCreacion.safeParse(convertir);
      expect(sinDocumento.success ? null : sinDocumento.error.issues[0].path).toEqual(["documentoExistenteId"]);
      expect(EsquemaAceptarCreacion.parse({ ...convertir, documentoExistenteId: "8" })).toMatchObject({ decision: "modificacion", documentoExistenteId: 8, asociaciones: [], relacionados: [] });
      expect(EsquemaAceptarCreacion.safeParse({ ...nuevo, decision: "modificacion", documentoExistenteId: "8" }).success).toBe(true);
    });

    it.each([
      ["una marca rara", { principal: "x:7" }],
      ["una marca con id cero", { asociaciones: ["p:0"] }],
      ["un relacionado que no es id", { relacionados: ["abc"] }],
      ["un nivel inventado", { nivelAcceso: "secreto" }],
      ["una decisión inventada", { decision: "quizas" }],
      ["un título corto", { titulo: "ab" }],
      ["una fecha que no existe", { venceElaboracion: "2026-02-31" }],
      ["una fecha con otro formato", { venceElaboracion: "20/11/2026" }],
      ["un campo de más", { sobra: "x" }],
    ])("rechaza %s", (_nombre, cambio) => {
      expect(EsquemaAceptarCreacion.safeParse({ ...nuevo, ...cambio }).success).toBe(false);
    });

    it("los esquemas de modificación y eliminación son estrictos", () => {
      expect(EsquemaAceptarModificacion.parse({ ...responsables, tituloNuevo: " Otro " })).toEqual({ tituloNuevo: "Otro", elaboradorId: 2, revisorId: 3, aprobadorId: 4, venceElaboracion: "2026-11-20" });
      expect(EsquemaAceptarModificacion.parse(responsables)).not.toHaveProperty("tituloNuevo");
      expect(EsquemaAceptarModificacion.safeParse({ ...responsables, codigo: "X" }).success).toBe(false);
      expect(EsquemaAceptarEliminacion.parse({ aprobadorId: "4" })).toEqual({ aprobadorId: 4 });
      expect(EsquemaAceptarEliminacion.safeParse({ aprobadorId: "4", elaboradorId: "2" }).success).toBe(false);
      expect(EsquemaAceptarEliminacion.safeParse({}).success).toBe(false);
    });
  });

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
