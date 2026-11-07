import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/acciones-tramites", () => ({
  aceptarSolicitudAccion: vi.fn(),
  aprobarAccion: vi.fn(),
  aprobarYPublicarAccion: vi.fn(),
  cancelarTramiteAccion: vi.fn(),
  corregirDatosTramiteAccion: vi.fn(),
  crearSolicitudAccion: vi.fn(),
  darVistoBuenoAccion: vi.fn(),
  cerrarObservacionAccion: vi.fn(),
  conceptoFavorableAccion: vi.fn(),
  crearObservacionAccion: vi.fn(),
  devolverAprobacionAccion: vi.fn(),
  devolverRevisionAccion: vi.fn(),
  enviarARevisionAccion: vi.fn(),
  guardarVerificacionAccion: vi.fn(),
  reabrirObservacionAccion: vi.fn(),
  responderObservacionAccion: vi.fn(),
  guardarControlCambiosAccion: vi.fn(),
  negarEliminacionAccion: vi.fn(),
  negarVistoBuenoAccion: vi.fn(),
  publicarTramiteAccion: vi.fn(),
  reasignarTramiteAccion: vi.fn(),
  rechazarSolicitudAccion: vi.fn(),
  retirarSolicitudAccion: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const dialogos = vi.hoisted(() => ({ llamadas: [] as { children?: React.ReactNode }[] }));
// Registra lo que cada diálogo de firma recibe: cerrado, no pinta su formulario.
vi.mock("@/componentes/tramites/DialogoFirma", async (importar) => {
  const real = await importar<typeof import("@/componentes/tramites/DialogoFirma")>();
  return {
    ...real,
    DialogoFirma: (props: Parameters<typeof real.DialogoFirma>[0]) => {
      dialogos.llamadas.push(props);
      return real.DialogoFirma(props);
    },
  };
});

import { AccionesGestion, aprobadoresPara, candidatosDe, efectoDeCancelar, opcionesDePropietario, type TramiteParaGestionar } from "@/componentes/tramites/AccionesGestion";
import { AccionesSolicitud } from "@/componentes/tramites/AccionesSolicitud";
import { BloqueSolicitud } from "@/componentes/tramites/BloqueSolicitud";
import { DialogoFirma, FormularioFirma, textoDeFirmar } from "@/componentes/tramites/DialogoFirma";
import { EliminarArchivo } from "@/componentes/admin/EliminarArchivo";
import { EncabezadoTramite } from "@/componentes/tramites/EncabezadoTramite";
import { FormularioSolicitud } from "@/componentes/tramites/FormularioSolicitud";
import { HistorialTramite } from "@/componentes/tramites/HistorialTramite";
import { ayudaDelCodigo } from "@/componentes/tramites/ClasificacionNueva";
import { PanelAceptacion, type TramiteParaAceptar } from "@/componentes/tramites/PanelAceptacion";
import { AvisoCriterios, ResumenCriterios, cuantosCriterios } from "@/componentes/tramites/AvisoCriterios";
import { PanelAprobacion, type TramiteParaAprobar } from "@/componentes/tramites/PanelAprobacion";
import { EvidenciaRevision } from "@/componentes/tramites/EvidenciaRevision";
import { EnvioARevision, PanelElaboracion, hayCambiosSinGuardar } from "@/componentes/tramites/PanelElaboracion";
import { ListaSoloLectura, ListaVerificacion } from "@/componentes/tramites/ListaVerificacion";
import { Observaciones } from "@/componentes/tramites/Observaciones";
import { PanelPublicacion } from "@/componentes/tramites/PanelPublicacion";
import { hayDistribucion, ResumenDistribucion } from "@/componentes/tramites/ResumenDistribucion";
import { PanelRevision } from "@/componentes/tramites/PanelRevision";
import { PasosTramite } from "@/componentes/tramites/PasosTramite";
import { TablaTramites } from "@/componentes/tramites/TablaTramites";
import type { Accion } from "@/lib/tramites/transiciones";
import type {
  CatalogoClasificacion,
  ContextoAceptacion,
  DatosParaAceptar,
  DatosParaGestionar,
  DetalleTramite,
  ResumenTramite,
} from "@/db/consultas/tramites";
import type { Observacion, RespuestaGuardada, RespuestaItem, RondaVerificacion } from "@/db/consultas/revision";
import type { Borrador } from "@/db/consultas/tramites-archivos";
import {
  EsquemaAceptarCreacion,
  EsquemaAceptarEliminacion,
  EsquemaAceptarModificacion,
  EsquemaControlCambios,
  EsquemaCorreccionDatos,
  EsquemaFirma,
  EsquemaMotivoCierre,
  EsquemaReasignar,
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
  requiereSocializacion: false,
  creadoEn: new Date("2026-11-03T14:00:00Z"),
  codigo: "GTH-PR-02",
  titulo: "Inducción y reinducción",
  versionNumero: 3,
  procesoNombre: "Talento Humano",
  solicitante: "Ana Pérez",
  elaborador: "Ana Pérez",
  revisor: "Luis Díaz",
  aprobador: "Luis Díaz",
  responsables: ["Luis Díaz"],
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
  it("el responsable desactivado se ve como tal", () => {
    expect(pintar({ responsables: ["Ana Pérez (inactivo)"] })).toContain("Ana Pérez (inactivo)");
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
  it("HistorialTramite muestra el concepto del revisor como texto plano", () => {
    const evento = { tipo: "concepto_favorable", persona: "Rosa Gil", ronda: 1, detalle: { concepto: "Cumple <b>todo</b>." }, creadoEn: ahora };
    const h = renderToStaticMarkup(<HistorialTramite tipo="modificar" eventos={[evento]} />);
    expect(h).toContain("Concepto: Cumple &lt;b&gt;todo&lt;/b&gt;.");
  });
  it("el encabezado nombra al responsable del paso y marca al inactivo", () => {
    const h = renderToStaticMarkup(<EncabezadoTramite tramite={{ ...detalle, responsables: ["Ana Pérez (inactivo)"] }} ahora={ahora} />);
    expect(h).toContain("Responsable: Ana Pérez (inactivo)");
    expect(renderToStaticMarkup(<EncabezadoTramite tramite={{ ...detalle, etapa: "cancelado", responsables: [] }} ahora={ahora} />)).not.toContain("Responsable");
  });
  it("una reasignación o una corrección no cuentan como entrada a la etapa", () => {
    const entrada = { tipo: "concepto_favorable", persona: "Rosa", ronda: 2, detalle: {}, creadoEn: new Date("2026-11-03T14:00:00Z") };
    const base = { ...detalle, etapa: "aprobacion" as const, ronda: 2, venceEn: new Date("2026-11-08T04:59:59.999Z"), eventos: [entrada] };
    const dia = (eventos: DetalleTramite["eventos"]) => renderToStaticMarkup(<EncabezadoTramite tramite={{ ...base, eventos }} ahora={ahora} />).match(/día \d+ de \d+/)?.[0];
    const sinCambio = dia([entrada]);
    expect(sinCambio).toBeDefined();
    const despues = new Date("2026-11-05T14:00:00Z");
    expect(dia([entrada, { tipo: "reasignar", persona: "Ana", ronda: 2, detalle: {}, creadoEn: despues }])).toBe(sinCambio);
    expect(dia([entrada, { tipo: "corregir_datos", persona: "Ana", ronda: 2, detalle: {}, creadoEn: despues }])).toBe(sinCambio);
  });
  it("HistorialTramite cuenta la reasignación con quién sale, quién entra y el motivo", () => {
    const reasignar = {
      tipo: "reasignar",
      persona: "Ana",
      ronda: 1,
      detalle: { papel: "elaborador", de: { id: 1, nombre: "Luis <b>Díaz</b>" }, a: { id: 2, nombre: "Rosa Gil" }, venceEn: "2026-12-01", motivo: "Cambió de área." },
      creadoEn: ahora,
    };
    const h = renderToStaticMarkup(<HistorialTramite tipo="modificar" eventos={[reasignar]} />);
    expect(h).toContain("Ana reasignó un responsable");
    expect(h).toContain("Quien elabora: Luis &lt;b&gt;Díaz&lt;/b&gt; → Rosa Gil");
    expect(h).toContain("Nueva fecha límite: 2026-12-01");
    expect(h).toContain("Motivo: Cambió de área.");
  });
  it("una reasignación de solo la fecha lo dice así", () => {
    const evento = { tipo: "reasignar", persona: "Ana", ronda: 1, detalle: { papel: null, de: null, a: null, venceEn: "2026-12-01", motivo: "Más plazo." }, creadoEn: ahora };
    const h = renderToStaticMarkup(<HistorialTramite tipo="modificar" eventos={[evento]} />);
    expect(h).toContain("Ana cambió la fecha límite");
    expect(h).not.toContain("→");
  });
  it("HistorialTramite dice también quién deja de aprobar y quién entra", () => {
    const aprobador = { de: { id: 3, nombre: "Carla" }, a: { id: 5, nombre: "Elena" } };
    const reasignar = {
      tipo: "reasignar",
      persona: "Ana",
      ronda: 1,
      detalle: { papel: "elaborador", de: { id: 1, nombre: "Luis" }, a: { id: 3, nombre: "Carla" }, venceEn: null, motivo: "Lo asume el SGC.", aprobador },
      creadoEn: ahora,
    };
    const corregir = { tipo: "corregir_datos", persona: "Ana", ronda: 1, detalle: { antes: { proceso: "CEX" }, despues: { proceso: "GTH" }, aprobador }, creadoEn: ahora };
    const h = renderToStaticMarkup(<HistorialTramite tipo="crear" eventos={[reasignar, corregir]} />);
    expect(h.match(/Quien aprueba: Carla → Elena/g)).toHaveLength(2);
    expect(h).toContain("Quien elabora: Luis → Carla");
    expect(h).toContain("Proceso: CEX → GTH");
  });
  it("HistorialTramite cuenta la corrección con el antes y el después", () => {
    const evento = {
      tipo: "corregir_datos",
      persona: "Ana",
      ronda: 1,
      detalle: { antes: { titulo: "Viejo", codigo: "CEX-FO-01", tipo: "Formato" }, despues: { titulo: "Nuevo", codigo: "CEX-RG-01", tipo: "Registro" } },
      creadoEn: ahora,
    };
    const h = renderToStaticMarkup(<HistorialTramite tipo="crear" eventos={[evento]} />);
    expect(h).toContain("Ana corrigió los datos del documento");
    for (const linea of ["Título: Viejo → Nuevo", "Código: CEX-FO-01 → CEX-RG-01", "Tipo: Formato → Registro"]) expect(h).toContain(linea);
  });
  it("HistorialTramite dice qué asociación secundaria retiró la corrección", () => {
    const evento = {
      tipo: "corregir_datos",
      persona: "Ana",
      ronda: 1,
      detalle: { antes: { proceso: "CEX" }, despues: { proceso: "GTH" }, secundariaRetirada: "Gestión del Talento" },
      creadoEn: ahora,
    };
    const h = renderToStaticMarkup(<HistorialTramite tipo="crear" eventos={[evento]} />);
    expect(h).toContain("Deja de figurar como proceso donde aplica: Gestión del Talento");
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

describe("AccionesGestion", () => {
  const usuarios: DatosParaGestionar["usuarios"] = [
    { id: 1, nombre: "Ana", cargo: null, rol: "consulta" },
    { id: 2, nombre: "Beto", cargo: null, rol: "lider_proceso" },
    { id: 3, nombre: "Carla", cargo: null, rol: "admin_sgc" },
    { id: 4, nombre: "Dora", cargo: null, rol: "admin_sgc" },
    { id: 5, nombre: "Elena", cargo: null, rol: "gerencia" },
    { id: 6, nombre: "Fabio", cargo: null, rol: "lider_proceso" },
  ];
  const datos: DatosParaGestionar = {
    usuarios,
    autoridad: "operativo",
    rolOriginador: "consulta",
    tipos: [{ id: 1, nombre: "Formato", autoridad: "operativo" }],
    procesos: [{ id: 6, nombre: "Consulta Externa", sigla: "CEX", subprocesos: [{ id: 9, nombre: "Medicina General" }] }],
  };
  const tramite: TramiteParaGestionar = {
    id: 7,
    etapa: "elaboracion",
    ronda: 1,
    tipo: "crear",
    codigo: "CEX-FO-01",
    titulo: "Formato nuevo",
    tipoDocumentoId: 1,
    procesoId: 6,
    subprocesoId: null,
    solicitanteId: 2,
    elaboradorId: 1,
    revisorId: 2,
    aprobadorId: 3,
    elaborador: "Ana",
    revisor: "Beto",
    aprobador: "Carla",
    requiereSocializacion: false,
  };
  const pintar = (parcial: Partial<TramiteParaGestionar> = {}) =>
    renderToStaticMarkup(<AccionesGestion tramite={{ ...tramite, ...parcial }} datos={datos} hoy="2026-11-05" />);
  const ids = (lista: { id: number }[]) => lista.map((u) => u.id);

  it("en elaboración y revisión ofrece corregir, reasignar y cancelar", () => {
    for (const etapa of ["elaboracion", "revision"] as const) {
      const h = pintar({ etapa });
      for (const boton of ["Corregir datos del documento", "Reasignar", "Cancelar el trámite"]) expect(h).toContain(boton);
    }
  });
  it("la marca de socialización se corrige en toda etapa de trabajo, y solo si se puede gestionar la distribución", () => {
    const conMarca = (parcial: Partial<TramiteParaGestionar>, puedeMarcar: boolean) =>
      renderToStaticMarkup(<AccionesGestion tramite={{ ...tramite, ...parcial }} datos={datos} hoy="2026-11-05" puedeMarcar={puedeMarcar} />);
    for (const etapa of ["aceptacion", "elaboracion", "aprobacion", "publicacion"] as const) {
      expect(conMarca({ etapa }, true)).toContain("Marca de socialización");
      expect(conMarca({ etapa }, false)).not.toContain("Marca de socialización");
    }
    expect(conMarca({ etapa: "aprobacion", tipo: "eliminar" }, true)).not.toContain("Marca de socialización");
  });
  it("desde la aprobación los datos quedan fijos: no se ofrece corregir", () => {
    for (const etapa of ["aprobacion", "publicacion", "aceptacion", "visto_bueno"] as const) {
      const h = pintar({ etapa });
      expect(h).not.toContain("Corregir datos");
      expect(h).toContain("Reasignar");
      expect(h).toContain("Cancelar el trámite");
    }
  });
  it("cancelar dice qué pasa con la versión según la solicitud", () => {
    expect(efectoDeCancelar(tramite)).toContain("El código no se reutiliza");
    expect(efectoDeCancelar({ ...tramite, tipo: "modificar" })).toContain("El documento vigente no cambia");
    expect(efectoDeCancelar({ ...tramite, tipo: "eliminar" })).toContain("sigue vigente");
    expect(efectoDeCancelar({ ...tramite, elaboradorId: null })).not.toContain("versión");
  });
  it("los candidatos respetan la separación y excluyen a quien ya tiene el papel", () => {
    expect(ids(candidatosDe("elaborador", tramite, datos))).toEqual([3, 4, 5, 6]);   // quien aprueba puede pasar a elaborar
    expect(ids(candidatosDe("revisor", tramite, datos))).toEqual([3, 4, 6]);
    expect(ids(candidatosDe("aprobador", tramite, datos))).toEqual([4]);
  });
  it("un originador admin_sgc o un tipo estratégico piden Gerencia", () => {
    expect(ids(candidatosDe("aprobador", tramite, { ...datos, rolOriginador: "admin_sgc" }))).toEqual([5]);
    expect(ids(candidatosDe("aprobador", tramite, { ...datos, autoridad: "estrategico" }))).toEqual([5]);
  });
  it("quien aprueba, si cambia, sigue al elaborador elegido y a la autoridad del tipo", () => {
    expect(ids(aprobadoresPara(tramite, datos, "operativo", { id: 1, rol: "consulta" }))).toEqual([4]);
    expect(ids(aprobadoresPara(tramite, datos, "operativo", { id: 4, rol: "admin_sgc" }))).toEqual([5]);
    expect(ids(aprobadoresPara(tramite, datos, "estrategico", { id: 1, rol: "consulta" }))).toEqual([5]);
  });
  it("el propietario se elige como en la aceptación, por proceso o subproceso", () => {
    expect(opcionesDePropietario(datos.procesos)).toEqual([
      { marca: "p:6", nombre: "Consulta Externa (CEX)" },
      { marca: "s:9", nombre: "Consulta Externa › Medicina General" },
    ]);
  });
  it("en una eliminación el originador es quien pidió", () => {
    const eliminar = { ...tramite, tipo: "eliminar" as const, solicitanteId: 4, elaboradorId: null, revisorId: null };
    expect(ids(candidatosDe("aprobador", eliminar, { ...datos, rolOriginador: "lider_proceso" }))).toEqual([]);
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
    expect(html).toContain("Sugerido: el siguiente consecutivo, con el formato {PROCESO}-{TIPO}-{NN}.");
    expect(html).toMatch(/<input[^>]*type="hidden"[^>]*name="codigoSugerido"[^>]*value="CEX-FO-05"|<input[^>]*name="codigoSugerido"[^>]*value="CEX-FO-05"/);
    expect(html).toContain("SGC-FO-01, versión 3");
    expect(html).toContain('min="2026-11-05"');
    expect(html).toContain('value="2026-11-20"');
    expect(html).toContain("Aceptar y abrir el trámite");
    expect(html).toContain("Rechazar con motivo");
    expect(html).toContain("&lt;b&gt;menores");                          // el título propuesto es texto plano
  });

  it("sin parecidos lo dice, y sin formato pide escribir el código", () => {
    const html = panel({ datos: { ...datos, parecidos: [], codigoSugerido: null } });
    expect(html).toContain("No hay documentos vigentes con un título o palabras clave parecidos");
    expect(html).not.toContain('name="codigoSugerido"');
  });

  it("sin un formato válido pide escribir el código", () => {
    const sinFormato = { ...contexto, catalogo: { ...catalogo, formatoCodigo: null } };
    expect(panel({ contexto: sinFormato, datos: { ...datos, codigoSugerido: null } })).toContain("No hay un formato de código configurado");
    const invalido = { ...contexto, catalogo: { ...catalogo, formatoCodigo: "sin marcadores" } };
    expect(panel({ contexto: invalido, datos: { ...datos, codigoSugerido: null } })).toContain("No hay un formato de código configurado");
  });

  it("la ayuda del código sale del formato y dice «Sugerido» solo mientras no se edite", () => {
    const f = "HNSF-{PROCESO}{TIPO}-{NNN}";
    expect(ayudaDelCodigo({ formato: f, sugerido: "HNSF-CEXFO-002", editado: false })).toBe(`Sugerido: el siguiente consecutivo, con el formato ${f}.`);
    const editado = ayudaDelCodigo({ formato: f, sugerido: "HNSF-CEXFO-002", editado: true });
    expect(editado).toBe(`Debe llevar las siglas del proceso y del tipo. Formato: ${f}. Vacíe el campo para volver a HNSF-CEXFO-002.`);
    expect(editado).not.toContain("Sugerido");
    expect(ayudaDelCodigo({ formato: f, sugerido: null, editado: false })).toBe(`Debe llevar las siglas del proceso y del tipo. Formato: ${f}.`);
    expect(ayudaDelCodigo({ formato: null, sugerido: null, editado: true })).toBe("No hay un formato de código configurado: escríbalo.");
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

describe("DialogoFirma", () => {
  const HUELLA = `9f2c${"0".repeat(56)}a41b`;
  const props: React.ComponentProps<typeof DialogoFirma> = {
    titulo: "Firmar como «Elaboró»",
    etiquetaBoton: "Enviar a revisión",
    resumen: { documento: "GTH-PR-02 Inducción", version: 3, huella: HUELLA },
    accion: vi.fn(),
    ocultos: { id: "7", etapa: "elaboracion", ronda: "1" },
    pideCodigo: false,
  };
  const formularioDe = (cambios: Partial<typeof props> = {}, hijos?: React.ReactNode) =>
    renderToStaticMarkup(<FormularioFirma {...props} {...cambios} alCancelar={() => {}}>{hijos}</FormularioFirma>);

  it("cerrado solo es un botón: la clave no está en la página", () => {
    const html = renderToStaticMarkup(<DialogoFirma {...props} />);
    expect(html).toContain("Enviar a revisión");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain('name="clave"');
  });

  it("dice qué se firma: documento, versión y huella abreviada", () => {
    const html = formularioDe();
    expect(html).toContain("GTH-PR-02 Inducción");
    expect(html).toContain("<dd>3</dd>");
    expect(html).toContain("9f2c…a41b");
    expect(html).not.toContain(HUELLA);
    expect(html).toContain("Firmar y enviar a revisión");
    expect(html).toContain("Cancelar");
  });

  it("sin archivo principal lo dice en vez de una huella", () => {
    expect(formularioDe({ resumen: { documento: "Doc", version: null, huella: null } })).toContain("Sin archivo principal");
  });

  it("la clave es de contraseña y lleva los campos ocultos", () => {
    const html = formularioDe();
    expect(html).toMatch(/<input[^>]*type="password"[^>]*autoComplete="current-password"|<input[^>]*autoComplete="current-password"[^>]*type="password"/);
    expect(html).toContain('name="clave"');
    expect(html).not.toContain('name="codigo"');
    for (const [nombre, valor] of Object.entries(props.ocultos)) {
      expect(html).toContain(`name="${nombre}" value="${valor}"`);
    }
  });

  it("con segundo factor pide el código, con su ayuda", () => {
    const html = formularioDe({ pideCodigo: true });
    expect(html).toContain('name="codigo"');
    expect(html).not.toContain("inputMode"); // Un código de recuperación lleva letras.
    expect(html).toContain('autoComplete="one-time-code"');
    expect(html).toContain("Código de su aplicación de autenticación o un código de recuperación");
  });

  it("los campos propios de la acción van dentro del formulario", () => {
    expect(formularioDe({}, <textarea name="concepto" />)).toMatch(/<form.*name="concepto".*<\/form>/);
  });
});

describe("firmar", () => {
  it("el botón se lee bien con una acción o con dos", () => {
    expect(textoDeFirmar("Publicar")).toBe("Firmar y publicar");
    expect(textoDeFirmar("Enviar a revisión")).toBe("Firmar y enviar a revisión");
    expect(textoDeFirmar("Aprobar y publicar")).toBe("Firmar, aprobar y publicar");
    expect(textoDeFirmar("Aprobar y eliminar")).toBe("Firmar, aprobar y eliminar");
  });

  it("el encabezado del trámite deja que el foco llegue al título", () => {
    const html = renderToStaticMarkup(<EncabezadoTramite tramite={detalle} ahora={ahora} />);
    expect(html).toMatch(/<h1 tabindex="-1"/);
  });
});

describe("quitar un archivo", () => {
  it("pide confirmación en un diálogo que dice qué archivo se va", () => {
    const html = renderToStaticMarkup(<EliminarArchivo direccion="/api/tramites/1/archivos/2" nombre="Inducción <v3>.pdf" />);
    expect(html).toContain("<dialog");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("Se quitará «Inducción &lt;v3&gt;.pdf» del borrador");
    expect(html).toContain("Cancelar");
  });
});

describe("PanelElaboracion", () => {
  const tramite = { id: 7, etapa: "elaboracion", ronda: 1, codigo: "GTH-PR-02", titulo: "Inducción", versionNumero: 3 } as const;
  const borrador: Borrador = {
    archivos: [
      { id: 21, rol: "principal", nombreOriginal: "Inducción v3.pdf", mime: "application/pdf", tamanoBytes: 2048, hashSha256: `9f2c${"0".repeat(56)}a41b` },
      { id: 22, rol: "editable", nombreOriginal: "fuente.docx", mime: "application/zip", tamanoBytes: 500, hashSha256: `abcd${"0".repeat(56)}ef01` },
    ],
    controlCambios: "Se añade la <b>inducción</b>.",
    plantilla: { codigo: "SGC-FO-01", version: 2 },
  };
  const observacion = (parcial: Partial<Observacion>): Observacion => ({
    id: 5, numero: 1, ronda: 1, origen: "revision", texto: "Falta el <i>responsable</i>.", autor: "Ana Pérez",
    respuesta: null, respondidaPor: null, respondidaEn: null, estado: "abierta", notaReapertura: null,
    cerradaPor: null, cerradaEn: null, creadoEn: ahora, ...parcial,
  });
  const pintar = (editable: boolean, b: Borrador = borrador, pideCodigo = false, observaciones: Observacion[] = [observacion({})]) =>
    renderToStaticMarkup(<PanelElaboracion tramite={tramite} borrador={b} observaciones={observaciones} editable={editable} pideCodigo={pideCodigo} />);

  it("a 390 px los dos primeros campos de la solicitud van en una columna que no los ensancha", () => {
    const html = renderToStaticMarkup(<FormularioSolicitud procesos={[{ id: 1, nombre: "Un proceso con un nombre muy largo", sigla: "CEX", subprocesos: [] }]} tipos={[]} documentos={[]} />);
    expect(html).toContain("grid grid-cols-1 gap-4 sm:grid-cols-2");
  });

  it("el elaborador carga en la ruta del trámite, quita archivos y envía a revisión", () => {
    const html = pintar(true);
    expect(html).toContain("Arrastre los archivos aquí");
    expect(html).toContain("Quitar");
    expect(html).toContain('name="resumenCambios"');
    expect(html).toContain("Guardar el control de cambios");
    expect(html).toContain("Enviar a revisión");
    expect(html).toContain('data-marca="EN TRÁMITE"');
  });

  it("con el control de cambios sin guardar no se puede firmar, y dice por qué", () => {
    const pintarEnvio = (sinGuardar: boolean) =>
      renderToStaticMarkup(<EnvioARevision tramite={tramite} huella={null} pideCodigo={false} sinGuardar={sinGuardar} />);
    const bloqueado = pintarEnvio(true);
    expect(bloqueado).toContain("Guarde el control de cambios antes de enviar");
    expect(bloqueado).toMatch(/<button[^>]* disabled=""[^>]*>Enviar a revisión/); // La clase también dice «disabled:».
    expect(bloqueado).not.toContain("aria-haspopup");
    const libre = pintarEnvio(false);
    expect(libre).not.toContain("Guarde el control");
    expect(libre).toContain('aria-haspopup="dialog"');
  });

  it("los cambios se comparan con lo guardado, sin contar los espacios de los extremos", () => {
    expect(hayCambiosSinGuardar("", null)).toBe(false);
    expect(hayCambiosSinGuardar("  Igual  ", "Igual")).toBe(false);
    expect(hayCambiosSinGuardar("Otro", "Igual")).toBe(true);
    expect(hayCambiosSinGuardar("Nuevo", null)).toBe(true);
    expect(hayCambiosSinGuardar("", "Igual")).toBe(true);
  });

  it("al abrir, lo guardado está en el campo y nada pide guardar", () => {
    const html = pintar(true);
    expect(html).toContain("Se añade la &lt;b&gt;inducción&lt;/b&gt;.");
    expect(html).not.toContain("Guarde el control");
    expect(html).toContain('role="status"');
  });

  it("los demás ven el mismo bloque en solo lectura, con la banda", () => {
    const html = pintar(false);
    expect(html).toContain('data-marca="EN TRÁMITE"');
    expect(html).toContain("Borrador de la versión 3");
    expect(html).toContain("Inducción v3.pdf");
    for (const editable of ["Arrastre los archivos aquí", "Quitar", 'name="resumenCambios"', "Guardar el control de cambios", "Enviar a revisión"]) {
      expect(html).not.toContain(editable);
    }
  });

  it("cada archivo dice su rol, su tamaño y su huella abreviada, y se abre por la ruta del trámite", () => {
    const html = pintar(false);
    expect(html).toContain('href="/tramites/7/archivos/21/Inducci%C3%B3n%20v3.pdf"');
    expect(html).toContain("Principal · huella ");
    expect(html).toContain("9f2c…a41b");
    expect(html).toContain("Editable · huella ");
    expect(html).toContain("2 KB");
    expect(html).not.toContain("0".repeat(56));
  });

  it("enlaza a la plantilla vigente, si la hay", () => {
    expect(pintar(false)).toContain('href="/documentos/SGC-FO-01"');
    expect(pintar(false, { ...borrador, plantilla: null })).not.toContain("Plantilla vigente");
  });

  it("el enlace a la plantilla se ve como enlace sin pasar el mouse", () => {
    const enlace = pintar(false).match(/<a [^>]*href="\/documentos\/SGC-FO-01"[^>]*>/)?.[0] ?? "";
    expect(enlace.match(/class="([^"]*)"/)?.[1].split(" ")).toContain("underline");
  });

  it("el control de cambios y las observaciones son texto plano", () => {
    const html = pintar(false);
    expect(html).toContain("Se añade la &lt;b&gt;inducción&lt;/b&gt;.");
    expect(html).toContain("Observación 1");
    expect(html).toContain("Falta el &lt;i&gt;responsable&lt;/i&gt;.");
    expect(html).toContain("Abierta");
    expect(pintar(false, borrador, false, [observacion({ numero: 2, texto: "Otra.", respuesta: "Hecho.", estado: "atendida" })])).toContain("Respuesta: Hecho.");
  });

  it("solo el elaborador ve el formulario para responder, y no en una observación cerrada", () => {
    expect(pintar(true)).toContain('name="respuesta"');
    expect(pintar(false)).not.toContain('name="respuesta"');
    expect(pintar(true, borrador, false, [observacion({ estado: "cerrada" })])).not.toContain('name="respuesta"');
  });

  it("sin archivos ni control de cambios lo dice", () => {
    const html = pintar(false, { archivos: [], controlCambios: null, plantilla: null }, false, []);
    expect(html).toContain("Todavía no hay archivos.");
    expect(html).toContain("Todavía sin escribir.");
    expect(html).not.toContain("Observación 1");
  });
});

describe("revisión", () => {
  const tramite = { id: 7, etapa: "revision", ronda: 2, codigo: "GTH-PR-02", titulo: "Inducción", versionNumero: 3 } as const;
  const respuestas: RespuestaItem[] = [
    { itemId: 1, texto: "Usa la plantilla vigente", critico: true, resultado: "cumple", nota: null },
    { itemId: 2, texto: "Redacción <b>clara</b>", critico: false, resultado: "no_aplica", nota: "No <i>aplica</i>." },
    { itemId: 3, texto: "Sin responder aún", critico: false, resultado: null, nota: null },
  ];
  const guardadas: RespuestaGuardada[] = [
    { itemId: 1, texto: "Usa la plantilla vigente", critico: true, resultado: "cumple", nota: null },
    { itemId: 2, texto: "Redacción <b>clara</b>", critico: false, resultado: "no_aplica", nota: "No <i>aplica</i>." },
  ];
  const sinCriterios = { criterios: [], huellaCriterios: "", criticosActuales: [] };
  const edicion = { estado: null, enviar: () => {}, pendiente: false, guardado: false, alCambiar: () => {}, alEnviar: () => {} };
  const obs = (parcial: Partial<Observacion>): Observacion => ({
    id: 5, numero: 1, ronda: 1, origen: "revision", texto: "Falta el responsable.", autor: "Ana Pérez",
    respuesta: null, respondidaPor: null, respondidaEn: null, estado: "abierta", notaReapertura: null,
    cerradaPor: null, cerradaEn: null, creadoEn: ahora, ...parcial,
  });

  it("cada ítem es un fieldset con su legend, tres opciones, y el crítico lleva el texto", () => {
    const html = renderToStaticMarkup(<ListaVerificacion tramite={tramite} respuestas={respuestas} criticosActuales={[]} edicion={edicion} />);
    expect(html.match(/<fieldset/g)).toHaveLength(3);
    expect(html.match(/<legend/g)).toHaveLength(3);
    expect(html.match(/type="radio"/g)).toHaveLength(9);
    expect(html.match(/Crítico/g)).toHaveLength(1);
    expect(html).toMatch(/<legend[^>]*>.*Usa la plantilla vigente.*Crítico.*<\/legend>/);
    expect(html).toContain("Guardar avance");
    expect(html).toMatch(/checked="" value="cumple"/);
    expect(html).toContain("Redacción &lt;b&gt;clara&lt;/b&gt;");
  });

  it("en solo lectura el resultado va como texto y no hay formulario", () => {
    const html = renderToStaticMarkup(<ListaSoloLectura respuestas={guardadas} etiqueta="Respuestas de la ronda 1" />);
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<fieldset");
    expect(html).toContain('aria-label="Respuestas de la ronda 1"');
    expect(html).toContain("Cumple");
    expect(html).toContain("No aplica");
    expect(html).toContain("Crítico");
    expect(html).toContain("Nota: No &lt;i&gt;aplica&lt;/i&gt;.");
  });

  it("las observaciones muestran número, autor y estado con texto, y cada formulario solo a quien corresponde", () => {
    const lista = [
      obs({}),
      obs({ id: 6, numero: 2, estado: "atendida", respuesta: "Hecho." }),
      obs({ id: 7, numero: 3, estado: "cerrada", respuesta: "Listo.", notaReapertura: "Revisar de nuevo." }),
    ];
    const revisor = renderToStaticMarkup(<Observaciones tramite={tramite} observaciones={lista} puedeRevisar puedeResponder={false} />);
    expect(revisor).toContain("Observación 2");
    expect(revisor).toContain("Ana Pérez");
    for (const estado of ["Abierta", "Atendida", "Cerrada"]) expect(revisor).toContain(estado);
    expect(revisor).toContain("Respuesta: Hecho.");
    expect(revisor).toContain("Nota de reapertura: Revisar de nuevo.");
    expect(revisor).toContain('name="texto"');
    expect(revisor.match(/Cerrar la observación/g)).toHaveLength(1); // solo la atendida
    expect(revisor.match(/Reabrir con una nota/g)).toHaveLength(2); // la atendida y la cerrada
    expect(revisor).not.toContain('name="respuesta"');

    const lector = renderToStaticMarkup(<Observaciones tramite={tramite} observaciones={lista} puedeRevisar={false} puedeResponder={false} />);
    expect(lector).not.toContain("<form");
    expect(lector).toContain("Observación 3");

    const elaborador = renderToStaticMarkup(<Observaciones tramite={tramite} observaciones={lista} puedeRevisar={false} puedeResponder />);
    expect(elaborador.match(/name="respuesta"/g)).toHaveLength(2); // la abierta y la atendida
    expect(elaborador).not.toContain('name="texto"');
  });

  it("el panel ofrece las dos salidas al revisor", () => {
    const revisor = renderToStaticMarkup(
      <PanelRevision tramite={tramite} respuestas={respuestas} hayItemsActivos propuesta={false} observaciones={[obs({})]} huella={`9f2c${"0".repeat(56)}a41b`} pideCodigo={false} {...sinCriterios} />,
    );
    expect(revisor).toContain("Devolver a elaboración");
    expect(revisor).toContain("Dar concepto favorable");
    expect(revisor).toContain("Guardar avance");
    expect(revisor).not.toContain("Guarde el avance de la lista");
    expect(revisor).not.toContain("Se propone lo respondido");
  });

  it("el aviso de guardar vive en una región que ya existe, para que se anuncie al aparecer", () => {
    const panel = (propuesta: boolean) =>
      renderToStaticMarkup(<PanelRevision tramite={tramite} respuestas={respuestas} hayItemsActivos propuesta={propuesta} observaciones={[]} huella={null} pideCodigo={false} {...sinCriterios} />);
    expect(panel(false)).toMatch(/<p id="concepto-sin-guardar" role="status"[^>]*><\/p>/);
    expect(panel(true)).toMatch(/<p id="concepto-sin-guardar" role="status"[^>]*>Guarde el avance de la lista antes de dar el concepto<\/p>/);
  });

  it("sin ítems activos el concepto no se ofrece y el aviso va en la misma región", () => {
    const aviso = "No hay ítems activos en la lista de verificación. Pida al Administrador del SGC que los active.";
    const html = renderToStaticMarkup(
      <PanelRevision tramite={tramite} respuestas={[]} hayItemsActivos={false} propuesta={false} observaciones={[]} huella={null} pideCodigo={false} {...sinCriterios} />,
    );
    expect(html).toContain(`role="status" class="text-sm text-muted-foreground">${aviso}</p>`);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-describedby="concepto-sin-guardar"[^>]*>Dar concepto favorable|<button[^>]*aria-describedby="concepto-sin-guardar"[^>]*disabled=""[^>]*>Dar concepto favorable/);
    expect(html).toContain("Devolver a elaboración");
  });

  it("la lista propuesta cuenta como sin guardar: el concepto espera a que el revisor la confirme", () => {
    const html = renderToStaticMarkup(
      <PanelRevision tramite={tramite} respuestas={respuestas} hayItemsActivos propuesta observaciones={[]} huella={null} pideCodigo={false} {...sinCriterios} />,
    );
    expect(html).toContain("Se propone lo respondido en la ronda anterior.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-describedby="concepto-sin-guardar"[^>]*>Dar concepto favorable|<button[^>]*aria-describedby="concepto-sin-guardar"[^>]*disabled=""[^>]*>Dar concepto favorable/);
    expect(html).toContain("Guarde el avance de la lista antes de dar el concepto");
    expect(html).toContain("Guardar avance");
    expect(html).toContain("Devolver a elaboración");
  });

  describe("evidencia de la revisión, para consultar", () => {
    const publicado = { id: 7, etapa: "publicado", ronda: 2 } as const;
    const rondas: RondaVerificacion[] = [
      { ronda: 2, respuestas: guardadas },
      { ronda: 1, respuestas: [{ itemId: 1, texto: "Usa la plantilla de entonces", critico: true, resultado: "no_cumple", nota: "Falta el numeral 5." }] },
    ];
    const cerrada = obs({ estado: "cerrada", respuesta: "Se añadió.", respondidaPor: "Luis Gómez", respondidaEn: "05/11/2026 09:10", notaReapertura: "Revisar de nuevo.", cerradaPor: "Ana Pérez", cerradaEn: "05/11/2026 10:20" });

    it("un trámite cerrado conserva cada ronda y cada observación, sin un solo control", () => {
      const html = renderToStaticMarkup(<EvidenciaRevision tramite={publicado} rondas={rondas} observaciones={[cerrada]} />);
      expect(html).toContain("Ronda 2");
      expect(html).toContain("Usa la plantilla vigente");
      expect(html).toContain("Falta el responsable.");
      expect(html).toContain("Ana Pérez · revisión, ronda 1");
      expect(html).toContain("Respuesta: Se añadió.");
      expect(html).toContain("Respondió Luis Gómez, 05/11/2026 09:10");
      expect(html).toContain("Nota de reapertura: Revisar de nuevo.");
      expect(html).toContain("Cerrada");
      expect(html).toContain("Cerró Ana Pérez, 05/11/2026 10:20");
      for (const control of ["<form", "<button", "<input", "<textarea"]) expect(html).not.toContain(control);
    });

    it("la ronda más reciente va abierta y las anteriores en un details, con su texto y su nota", () => {
      const html = renderToStaticMarkup(<EvidenciaRevision tramite={publicado} rondas={rondas} observaciones={[]} />);
      expect(html.match(/<details/g)).toHaveLength(1);
      expect(html).not.toContain("<details open");
      const [abierta, anterior] = html.split("<details");
      expect(abierta).toContain("Ronda 2");
      expect(abierta).toContain("Usa la plantilla vigente");
      expect(anterior).toContain("Ronda 1");
      expect(anterior).toContain("Usa la plantilla de entonces");
      expect(anterior).toContain("No cumple");
      expect(anterior).toContain("Nota: Falta el numeral 5.");
    });

    it("cerrado con lista y sin observaciones lo dice, sin hablar de un futuro que no llegará", () => {
      const html = renderToStaticMarkup(<EvidenciaRevision tramite={publicado} rondas={rondas} observaciones={[]} />);
      expect(html).toContain("No hubo observaciones.");
      expect(html).not.toContain("Todavía");
    });

    it("cancelado con observaciones y sin lista guardada conserva las observaciones", () => {
      const html = renderToStaticMarkup(<EvidenciaRevision tramite={{ id: 7, etapa: "cancelado", ronda: 1 }} rondas={[]} observaciones={[obs({})]} />);
      expect(html).toContain("No se guardaron respuestas.");
      expect(html).toContain("Falta el responsable.");
      expect(html).not.toContain("<form");
    });

    it("un trámite que nunca llegó a revisión no pinta ningún bloque", () => {
      expect(renderToStaticMarkup(<EvidenciaRevision tramite={{ id: 7, etapa: "cancelado", ronda: 0 }} rondas={[]} observaciones={[]} />)).toBe("");
    });

    it("en revisión, quien solo mira ve la ronda de lo respondido y que la ronda en curso aún no tiene respuestas", () => {
      const html = renderToStaticMarkup(
        <EvidenciaRevision tramite={{ id: 7, etapa: "revision", ronda: 3 }} rondas={rondas} observaciones={[]} rondaEnCurso={3} />,
      );
      expect(html).toContain("Ronda 3, en curso: todavía sin respuestas guardadas.");
      expect(html).toContain("Ronda 2");
      expect(html).toContain("Cumple");
      expect(html).not.toContain("Sin responder");
      expect(html).toContain("Todavía no hay observaciones.");
    });

    it("con respuestas en la ronda en curso, esa va abierta y la anterior en un details", () => {
      const html = renderToStaticMarkup(
        <EvidenciaRevision tramite={{ id: 7, etapa: "revision", ronda: 2 }} rondas={rondas} observaciones={[]} rondaEnCurso={2} />,
      );
      expect(html).toContain("Ronda 2, en curso");
      expect(html).not.toContain("todavía sin respuestas");
      expect(html.match(/<details/g)).toHaveLength(1);
    });

    it("la primera ronda en curso, sin nada guardado, no pinta ítems sin responder", () => {
      const html = renderToStaticMarkup(<EvidenciaRevision tramite={{ id: 7, etapa: "revision", ronda: 1 }} rondas={[]} observaciones={[]} rondaEnCurso={1} />);
      expect(html).toContain("Ronda 1, en curso: todavía sin respuestas guardadas.");
      expect(html).not.toContain("<ul");
    });
  });

  it("en ajustes, quien elabora ve la lista de la ronda anterior con sus notas y nada que marcar", () => {
    const panel = (rondaAnterior: RondaVerificacion | null) =>
      renderToStaticMarkup(
        <PanelElaboracion
          tramite={{ ...tramite, etapa: "elaboracion" }}
          borrador={{ archivos: [], controlCambios: null, plantilla: null }}
          observaciones={[]}
          rondaAnterior={rondaAnterior}
          editable
          pideCodigo={false}
        />,
      );
    const html = panel({ ronda: 1, respuestas: guardadas });
    expect(html).toContain("Lista de verificación de la ronda 1");
    expect(html).toContain("Nota: No &lt;i&gt;aplica&lt;/i&gt;.");
    expect(html).not.toContain('name="resultado_');
    expect(panel(null)).not.toContain("Lista de verificación");
  });
});

const HUELLA_CRITERIOS = "c0ffee".repeat(10) + "abcd";
const CASILLA = new RegExp(`<input type="checkbox"(?=[^>]*required="")(?=[^>]*name="confirmaNoCumple")(?=[^>]*value="${HUELLA_CRITERIOS}")`);

/** Lo que cada DialogoFirma recibió como hijos: el diálogo cerrado no pinta su formulario. */
const hijosDeDialogos = (): string[] => dialogos.llamadas.map((l) => renderToStaticMarkup(<>{l.children}</>));

describe("criterios que no cumplen en pantalla", () => {
  const tramite = { id: 7, etapa: "revision", ronda: 2, codigo: "GTH-PR-02", titulo: "Inducción", versionNumero: 3 } as const;
  const respuestas: RespuestaItem[] = [
    { itemId: 1, texto: "Usa la plantilla vigente", critico: false, resultado: "cumple", nota: null },
    { itemId: 2, texto: "Redacción <b>clara</b>", critico: false, resultado: "no_cumple", nota: "Se ajustará con la guía." },
  ];
  const criterio = { texto: "Redacción <b>clara</b>", nota: "Se ajustará con la guía." };
  const edicion = { estado: null, enviar: () => {}, pendiente: false, guardado: false, alCambiar: () => {}, alEnviar: () => {} };
  const propsRevision = {
    tramite, respuestas, hayItemsActivos: true, propuesta: false, observaciones: [], huella: null, pideCodigo: false,
    criterios: [criterio], huellaCriterios: HUELLA_CRITERIOS, criticosActuales: [] as number[],
  };
  const panel = (extra: Partial<typeof propsRevision> = {}) => renderToStaticMarkup(<PanelRevision {...propsRevision} {...extra} />);
  const BLOQUEADO = /<button[^>]*disabled=""[^>]*aria-describedby="concepto-sin-guardar"[^>]*>Dar concepto favorable|<button[^>]*aria-describedby="concepto-sin-guardar"[^>]*disabled=""[^>]*>Dar concepto favorable/;
  const estadoDelConcepto = (html: string) => /<p id="concepto-sin-guardar" role="status"[^>]*>([^<]*)<\/p>/.exec(html)?.[1];
  const avisoDe = (n: number) =>
    renderToStaticMarkup(
      <AvisoCriterios
        criterios={Array.from({ length: n }, (_, i) => ({ texto: `Criterio ${i + 1}`, nota: `Nota del criterio ${i + 1}.` }))}
        huella={HUELLA_CRITERIOS}
        titulo="Hay criterios"
        confirmacion="Confirmo"
      />,
    );

  it("la nota dice que es obligatoria si no cumple y, al elegir «No cumple», que saldrá en el acta", () => {
    const html = renderToStaticMarkup(<ListaVerificacion tramite={tramite} respuestas={respuestas} criticosActuales={[]} edicion={edicion} />);
    expect(html).toContain("Nota (obligatoria si no cumple)");
    expect(html.match(/Esta nota saldrá en el acta, visible para toda la entidad\./g)).toHaveLength(1); // solo el ítem en «No cumple»
    expect(html).toContain('aria-describedby="aviso-nota-2"');
    expect(html).not.toContain("Nota (opcional)");
  });

  it("un ítem vuelto crítico durante la ronda se pinta como crítico", () => {
    const html = renderToStaticMarkup(<ListaVerificacion tramite={tramite} respuestas={respuestas} criticosActuales={[2]} edicion={edicion} />);
    expect(html.match(/Crítico/g)).toHaveLength(1);
    expect(html).toMatch(/<legend[^>]*>.*Redacción &lt;b&gt;clara&lt;\/b&gt;.*Crítico.*<\/legend>/);
  });

  it("la casilla lleva la huella, es obligatoria y el texto sale escapado", () => {
    const html = avisoDe(1);
    expect(html).toMatch(CASILLA);
    expect(html).toContain(`value="${HUELLA_CRITERIOS}"`);
    expect(html).toContain("Nota: Nota del criterio 1.");
    expect(renderToStaticMarkup(<AvisoCriterios criterios={[criterio]} huella="h" titulo="t" confirmacion="c" />)).toContain("Redacción &lt;b&gt;clara&lt;/b&gt;");
    expect(avisoDe(2).match(/<li/g)).toHaveLength(2);
  });

  it("sin criterios no hay aviso ni casilla, y el diálogo de firma no cambia", () => {
    expect(renderToStaticMarkup(<AvisoCriterios criterios={[]} huella="h" titulo="t" confirmacion="c" />)).toBe("");
    expect(renderToStaticMarkup(<ResumenCriterios criterios={[]} titulo="t" />)).toBe("");
    const abierto = (hijos: React.ReactNode) =>
      renderToStaticMarkup(
        <FormularioFirma titulo="Firmar" etiquetaBoton="Dar concepto favorable" resumen={{ documento: "Doc", version: 1, huella: null }} accion={vi.fn()} ocultos={{}} pideCodigo={false} alCancelar={() => {}}>
          {hijos}
        </FormularioFirma>,
      );
    expect(abierto(<AvisoCriterios criterios={[]} huella="h" titulo="t" confirmacion="c" />)).toBe(abierto(null));
    expect(estadoDelConcepto(panel({ criterios: [] }))).toBe("");
  });

  it("con el diálogo abierto, la casilla obligatoria queda dentro del formulario, antes de la clave", () => {
    const html = renderToStaticMarkup(
      <FormularioFirma titulo="Firmar" etiquetaBoton="Dar concepto favorable" resumen={{ documento: "Doc", version: 1, huella: null }} accion={vi.fn()} ocultos={{}} pideCodigo={false} alCancelar={() => {}}>
        <AvisoCriterios criterios={[criterio]} huella={HUELLA_CRITERIOS} titulo="Hay criterios" confirmacion="Confirmo" />
      </FormularioFirma>,
    );
    const formulario = html.slice(html.indexOf("<form"), html.indexOf("</form>"));
    const casilla = formulario.search(CASILLA);
    expect(casilla).toBeGreaterThan(0);
    expect(formulario.indexOf('name="clave"')).toBeGreaterThan(casilla);
    expect(html.indexOf("</form>")).toBeGreaterThan(html.search(CASILLA));
  });

  it("con criterios, el diálogo del revisor lleva la lista y la casilla en singular y en plural", () => {
    dialogos.llamadas.length = 0;
    expect(panel()).not.toMatch(/disabled=""/);
    expect(estadoDelConcepto(panel())).toBe("");
    const [uno] = hijosDeDialogos();
    expect(uno).toContain("Esta revisión tiene 1 criterio que no cumple");
    expect(uno).toContain("Redacción &lt;b&gt;clara&lt;/b&gt;");
    expect(uno).toContain("Doy concepto favorable a pesar de este criterio");
    expect(uno).toMatch(CASILLA);
    expect(uno.indexOf("confirmaNoCumple")).toBeLessThan(uno.indexOf('name="concepto"'));
    dialogos.llamadas.length = 0;
    panel({ criterios: [criterio, { texto: "Otro", nota: "Otra nota." }] });
    const [varios] = hijosDeDialogos();
    expect(varios).toContain("Esta revisión tiene 2 criterios que no cumplen");
    expect(varios).toContain("Doy concepto favorable a pesar de estos criterios");
  });

  it("con una nota faltante el concepto queda desactivado y lo dice", () => {
    const html = panel({ criterios: [criterio, { texto: "Redacción", nota: "   ab " }] });
    expect(estadoDelConcepto(html)).toBe("Escriba una nota en cada criterio que no cumple");
    expect(html).toMatch(BLOQUEADO);
  });

  it("un ítem crítico en «No cumple» bloquea con su propio mensaje, antes que el de la nota", () => {
    const mensaje = "Hay un ítem crítico que no cumple";
    expect(estadoDelConcepto(panel({ respuestas: [{ ...respuestas[1], critico: true }], criterios: [] }))).toBe(mensaje);
    // Marcado crítico después de guardar la ronda: lo dice criticosActuales.
    const html = panel({ criticosActuales: [2], criterios: [{ texto: "x", nota: "" }] });
    expect(estadoDelConcepto(html)).toBe(mensaje);
    expect(html).toMatch(BLOQUEADO);
    // Crítico, pero respondido «Cumple»: no bloquea.
    expect(estadoDelConcepto(panel({ criticosActuales: [1] }))).toBe("");
  });

  it("guardar el avance tiene prioridad sobre los demás avisos", () => {
    expect(estadoDelConcepto(panel({ propuesta: true, criterios: [{ texto: "x", nota: "" }] }))).toBe("Guarde el avance de la lista antes de dar el concepto");
  });

  describe("aprobación", () => {
    const modificacion: TramiteParaAprobar = { id: 7, etapa: "aprobacion", ronda: 2, tipo: "modificar", codigo: "GTH-PR-02", titulo: "Inducción", versionNumero: 3 };
    const propsAprobacion = (t: TramiteParaAprobar, acciones: Accion[], criterios = [criterio]) => ({
      tramite: t, acciones, revisado: { persona: "Ana", concepto: "Cumple." }, huella: "a".repeat(64), pideCodigo: false, criterios, huellaCriterios: HUELLA_CRITERIOS,
    });
    const pintar = (...args: Parameters<typeof propsAprobacion>) => renderToStaticMarkup(<PanelAprobacion {...propsAprobacion(...args)} />);

    it("el aprobador ve el aviso antes de abrir el diálogo, encima del concepto del revisor", () => {
      const html = pintar(modificacion, ["aprobar", "aprobar_y_publicar"]);
      expect(html).toContain("El revisor dio concepto favorable con 1 criterio que no cumple");
      expect(html.indexOf("El revisor dio concepto")).toBeLessThan(html.indexOf("Concepto de Ana"));
      expect(html).toContain("Nota: Se ajustará con la guía.");
      expect(html).not.toContain("confirmaNoCumple"); // la casilla solo va dentro del diálogo
    });

    it("en plural dice cuántos", () => {
      expect(pintar(modificacion, ["aprobar"], [criterio, { texto: "Otro", nota: "Otra nota." }])).toContain("con 2 criterios que no cumplen");
    });

    it("Aprobar y Aprobar y publicar llevan cada uno la casilla en su diálogo", () => {
      dialogos.llamadas.length = 0;
      pintar(modificacion, ["aprobar", "aprobar_y_publicar"]);
      const hijos = hijosDeDialogos();
      expect(hijos).toHaveLength(2);
      for (const h of hijos) {
        expect(h).toContain("El revisor dio concepto favorable con 1 criterio que no cumple");
        expect(h).toContain("Apruebo a pesar de este criterio");
        expect(h).toMatch(CASILLA);
      }
    });

    it("en una eliminación no hay aviso ni casilla", () => {
      const eliminacion: TramiteParaAprobar = { ...modificacion, ronda: 0, tipo: "eliminar", versionNumero: 2 };
      dialogos.llamadas.length = 0;
      expect(pintar(eliminacion, ["aprobar", "aprobar_y_publicar"], [])).not.toContain("El revisor dio concepto favorable");
      expect(hijosDeDialogos().join("")).not.toContain("confirmaNoCumple");
    });
  });

  it("el historial dice cuántos criterios se aceptaron", () => {
    const evento = (n: number) => ({ tipo: "concepto_favorable", persona: "Ana", ronda: 2, detalle: { concepto: "Cumple.", noCumple: Array.from({ length: n }, () => ({ texto: "t", nota: "n" })), confirmoNoCumple: true }, creadoEn: ahora });
    expect(renderToStaticMarkup(<HistorialTramite tipo="modificar" eventos={[evento(1)]} />)).toContain("con 1 criterio que no cumple, aceptado");
    expect(renderToStaticMarkup(<HistorialTramite tipo="modificar" eventos={[evento(3)]} />)).toContain("con 3 criterios que no cumplen, aceptados");
    expect(renderToStaticMarkup(<HistorialTramite tipo="modificar" eventos={[evento(0)]} />)).not.toContain("criterio");
  });

  it("cuantosCriterios concuerda en número", () => {
    expect(cuantosCriterios(1)).toBe("1 criterio que no cumple");
    expect(cuantosCriterios(2)).toBe("2 criterios que no cumplen");
  });
});


describe("aprobación y publicación", () => {
  const modificacion: TramiteParaAprobar = { id: 7, etapa: "aprobacion", ronda: 2, tipo: "modificar", codigo: "GTH-PR-02", titulo: "Inducción", versionNumero: 3 };
  const eliminacion: TramiteParaAprobar = { ...modificacion, ronda: 0, tipo: "eliminar", versionNumero: 2 };
  const pintar = (t: TramiteParaAprobar, acciones: Accion[]) =>
    renderToStaticMarkup(
      <PanelAprobacion tramite={t} acciones={acciones} revisado={{ persona: "Ana <b>Pérez</b>", concepto: "Cumple <i>todo</i>." }} huella={"a".repeat(64)} pideCodigo={false} criterios={[]} huellaCriterios={HUELLA_CRITERIOS} />,
    );

  it("el aprobador sin gestión ve aprobar y devolver, no aprobar y publicar", () => {
    const html = pintar(modificacion, ["aprobar", "devolver_aprobacion"]);
    expect(html).toContain("Devolver con observaciones");
    expect(html).toContain(">Aprobar<");
    expect(html).not.toContain("Aprobar y publicar");
    expect(html).not.toContain("Negar la eliminación");
  });

  it("con gestión, ofrece además aprobar y publicar en un solo acto", () => {
    expect(pintar(modificacion, ["aprobar", "devolver_aprobacion", "aprobar_y_publicar"])).toContain("Aprobar y publicar");
  });

  it("en una eliminación se niega en vez de devolver", () => {
    const html = pintar(eliminacion, ["aprobar", "negar_eliminacion", "aprobar_y_publicar"]);
    expect(html).toContain("Negar la eliminación");
    expect(html).toContain("Aprobar y eliminar");
    expect(html).not.toContain("Aprobar y publicar");
    expect(html).not.toContain("Devolver con observaciones");
  });

  it("lo revisado se muestra como texto plano", () => {
    const html = pintar(modificacion, ["aprobar"]);
    expect(html).toContain("Concepto de Ana &lt;b&gt;Pérez&lt;/b&gt;");
    expect(html).toContain("Cumple &lt;i&gt;todo&lt;/i&gt;.");
  });

  it("publicar y eliminar se distinguen, y eliminar lo advierte", () => {
    const panel = (t: TramiteParaAprobar) =>
      renderToStaticMarkup(<PanelPublicacion tramite={{ ...t, etapa: "publicacion" }} huella={"a".repeat(64)} pideCodigo={false} />);
    expect(panel(modificacion)).toContain(">Publicar<");
    expect(panel(modificacion)).not.toContain("Eliminar el documento");
    expect(panel(eliminacion)).toContain(">Eliminar el documento<");
    expect(panel(eliminacion)).not.toContain(">Publicar<");
  });

  it("el historial no dice que una eliminación se publicó", () => {
    const evento = { tipo: "publicar", persona: "Ana", ronda: 0, detalle: {}, creadoEn: ahora };
    expect(renderToStaticMarkup(<HistorialTramite tipo="eliminar" eventos={[evento]} />)).toContain("Ana ejecutó la eliminación, con clave");
    expect(renderToStaticMarkup(<HistorialTramite tipo="modificar" eventos={[evento]} />)).toContain("Ana publicó, con clave");
  });
});

describe("esquemas de gestión", () => {
  it("EsquemaReasignar admite solo fecha o solo persona, y nada fuera de lista", () => {
    expect(EsquemaReasignar.parse({ venceEn: "2026-12-01", motivo: "  Más plazo.  " })).toEqual({ venceEn: "2026-12-01", motivo: "Más plazo." });
    expect(EsquemaReasignar.parse({ papel: "revisor", usuarioId: "4", motivo: "Cambió de área." })).toEqual({ papel: "revisor", usuarioId: 4, motivo: "Cambió de área." });
    expect(EsquemaReasignar.parse({ papel: "elaborador", usuarioId: "4", aprobadorId: "5", motivo: "Cambió de área." })).toMatchObject({ aprobadorId: 5 });
    expect(EsquemaReasignar.safeParse({ papel: "solicitante", usuarioId: "4", motivo: "Cambió de área." }).success).toBe(false);
    expect(EsquemaReasignar.safeParse({ venceEn: "01/12/2026", motivo: "Más plazo." }).success).toBe(false);
    expect(EsquemaReasignar.safeParse({ venceEn: "2026-12-01", motivo: "no" }).success).toBe(false);
    expect(EsquemaReasignar.safeParse({ venceEn: "2026-12-01", motivo: "Más plazo.", sobra: "x" }).success).toBe(false);
  });
  it("EsquemaCorreccionDatos normaliza y no admite otros campos", () => {
    expect(EsquemaCorreccionDatos.parse({ titulo: " Otro ", codigo: " cex-fo-01 ", tipoDocumentoId: "2" })).toEqual({ titulo: "Otro", codigo: "CEX-FO-01", tipoDocumentoId: 2 });
    expect(EsquemaCorreccionDatos.parse({ titulo: "Otro" })).toEqual({ titulo: "Otro" });
    expect(EsquemaCorreccionDatos.safeParse({ titulo: "xx" }).success).toBe(false);
    expect(EsquemaCorreccionDatos.safeParse({ titulo: "Otro", sobra: "2" }).success).toBe(false);
  });
  it("EsquemaCorreccionDatos traduce el propietario y admite a quien aprueba", () => {
    expect(EsquemaCorreccionDatos.parse({ principal: "p:6", aprobadorId: "5" })).toEqual({ procesoId: 6, aprobadorId: 5 });
    expect(EsquemaCorreccionDatos.parse({ principal: "s:9" })).toEqual({ subprocesoId: 9 });
    expect(EsquemaCorreccionDatos.safeParse({ principal: "9" }).success).toBe(false);
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
      expect(EsquemaAceptarCreacion.parse({ ...nuevo, codigoSugerido: " cex-fo-01 " }).codigoSugerido).toBe("CEX-FO-01");
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
  it("EsquemaControlCambios recorta y pide de 5 a 2000 caracteres", () => {
    expect(EsquemaControlCambios.parse({ resumenCambios: "  Cinco  " })).toEqual({ resumenCambios: "Cinco" });
    expect(EsquemaControlCambios.safeParse({ resumenCambios: "Poco" }).success).toBe(false);
    expect(EsquemaControlCambios.safeParse({ resumenCambios: "x".repeat(2001) }).success).toBe(false);
    expect(EsquemaControlCambios.safeParse({ resumenCambios: "Cinco", sobra: "x" }).success).toBe(false);
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

describe("distribución del trámite publicado", () => {
  it("pinta acuses y copias con enlace a la ficha, sin socialización si no se pasa", () => {
    const h = renderToStaticMarkup(
      <ResumenDistribucion
        version={3}
        enlace="/documentos/gth-pr-02"
        acuses={{ confirmados: 23, pendientes: 11, porcentaje: 68 }}
        copias={{ sinRecibir: 1, recibidas: 3, porRecoger: 2 }}
      />,
    );
    expect(h).toContain("Distribución de la versión 3");
    expect(h).toContain("acuses 23 de 34 (68 %)");
    expect(h).toContain("copias: 1 emitida sin recibir, 3 recibidas, 2 de versiones anteriores por recoger");
    expect(h).not.toContain("socialización");
    expect(h).toContain('href="/documentos/gth-pr-02"');
  });
  it("omite los segmentos de copias en cero y toda la parte si no hay nada", () => {
    const parcial = renderToStaticMarkup(<ResumenDistribucion version={1} enlace="/d" acuses={null} copias={{ sinRecibir: 0, recibidas: 2, porRecoger: 0 }} />);
    expect(parcial).toContain("acuses: sin destinatarios · copias: 2 recibidas");
    expect(parcial).not.toMatch(/sin recibir|por recoger|undefined|null/);
    const vacio = renderToStaticMarkup(<ResumenDistribucion version={1} enlace="/d" acuses={null} copias={{ sinRecibir: 0, recibidas: 0, porRecoger: 0 }} />);
    expect(vacio).not.toContain("copias:");
    const sinPermiso = renderToStaticMarkup(<ResumenDistribucion version={1} enlace="/d" acuses={null} copias={null} />);
    expect(sinPermiso).not.toContain("copias:");
  });
  it("si se pasa la socialización, la dice", () => {
    const h = renderToStaticMarkup(
      <ResumenDistribucion
        version={2}
        enlace="/d"
        acuses={null}
        socializacion={{ requerida: true, venceEn: new Date("2026-11-20T17:00:00Z"), cumplida: null, superada: false }}
        copias={null}
      />,
    );
    expect(h).toContain("socialización requerida, vence el 20 de noviembre de 2026");
  });
  it("solo un trámite publicado con versión muestra la distribución, nunca una eliminación", () => {
    const t = { etapa: "publicado", tipo: "modificar", versionId: 4, versionNumero: 3 };
    expect(hayDistribucion(t)).toBe(true);
    expect(hayDistribucion({ ...t, tipo: "eliminar" })).toBe(false);
    expect(hayDistribucion({ ...t, etapa: "eliminado", tipo: "eliminar" })).toBe(false);
    expect(hayDistribucion({ ...t, etapa: "aprobacion" })).toBe(false);
    expect(hayDistribucion({ ...t, versionId: null })).toBe(false);
  });
});
