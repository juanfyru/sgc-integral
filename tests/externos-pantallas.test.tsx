/**
 * Las pantallas de los documentos externos (spec 13C §8.6 a §8.8 y §14): la matriz, la página de control, el bloque de
 * la ficha, el alta y la ficha del panel. Las piezas puras se pintan con datos de muestra; las páginas y el bloque, contra
 * la BD de desarrollo dentro de una transacción que se revierte, con la sesión y la conexión de la prueba.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const contexto = vi.hoisted(() => ({ tx: null as unknown, sesion: null as unknown }));

vi.mock("@/db/cliente", async (importar) => {
  const real = await importar<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => (contexto.tx ?? real.obtenerSql()) as ReturnType<typeof real.obtenerSql> };
});
vi.mock("@/lib/paginas", () => ({
  exigirSesion: async () => contexto.sesion,
  exigirPermiso: async () => contexto.sesion,
  exigirEntradaPanel: async () => contexto.sesion,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NO_ENCONTRADA");
  },
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  },
  useRouter: () => ({ refresh: () => {} }),
  usePathname: () => "/vigencia/externos",
}));
vi.mock("@/app/acciones-vigencia", () => ({
  ratificarAccion: vi.fn(),
  fijarFechaAccion: vi.fn(),
  quitarFechaAccion: vi.fn(),
  ajustarPlazoAccion: vi.fn(),
  registrarExternoAccion: vi.fn(),
  editarControlExternoAccion: vi.fn(),
  abrirEdicionAccion: vi.fn(),
  editarEdicionAccion: vi.fn(),
  descartarEdicionAccion: vi.fn(),
  adoptarEdicionAccion: vi.fn(),
  verificarExternoAccion: vi.fn(),
  retirarExternoAccion: vi.fn(),
}));
vi.mock("@/app/admin/acciones", () => ({
  crearVersionAccion: vi.fn(),
  descartarBorradorAccion: vi.fn(),
  deshacerCargaAccion: vi.fn(),
  editarVersionAccion: vi.fn(),
  publicarAccion: vi.fn(),
}));
vi.mock("@/app/acciones-distribucion", () => ({
  emitirCopiaAccion: vi.fn(),
  pedirAcusesAccion: vi.fn(),
  reemplazarCopiasAccion: vi.fn(),
}));

import PaginaDocumentoAdmin from "@/app/(app)/admin/(panel)/documentos/[codigo]/page";
import PaginaVigencia from "@/app/(app)/vigencia/page";
import PaginaExterno from "@/app/(app)/vigencia/externos/[id]/page";
import PaginaNuevoExterno from "@/app/(app)/vigencia/externos/nuevo/page";
import PaginaExternos from "@/app/(app)/vigencia/externos/page";
import { BloqueExterno } from "@/componentes/vigencia/externos/BloqueExterno";
import { CuerpoAdoptar, ocultosDeAdopcion } from "@/componentes/vigencia/externos/DialogoAdoptar";
import { FormularioControl } from "@/componentes/vigencia/externos/FormularioControl";
import { FormularioEdicion } from "@/componentes/vigencia/externos/FormularioEdicion";
import { FormularioExterno } from "@/componentes/vigencia/externos/FormularioExterno";
import { FormularioVerificacion } from "@/componentes/vigencia/externos/FormularioVerificacion";
import { PaginaExterno as VistaExterno } from "@/componentes/vigencia/externos/PaginaExterno";
import { TablaExternos } from "@/componentes/vigencia/externos/TablaExternos";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { puedePedirSobreDocumento } from "@/db/consultas/tramites";
import { crearDocumentoEn } from "@/db/consultas/admin";
import {
  abrirEdicion,
  descartarEdicion,
  registrarExterno,
  registrarVerificacion,
  type Externo,
  type FilaExterno,
} from "@/db/consultas/vigencia/externos";
import { vigenciaDePersona } from "@/db/consultas/vigencia/tareas";
import type { SesionValida } from "@/lib/sesion";
import { finDeFecha } from "@/lib/tramites/plazos";
import { sesionAdmin, sesionDe, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { datosExterno, externoDePrueba, vigenteFuera } from "./utiles/vigencia";

const sql = obtenerSql();
const ZONA = "America/Bogota";
const ahora = new Date("2026-11-08T15:00:00Z");

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-externos-pantallas-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

const sinEtiquetas = (html: string) => html.replace(/<[^>]+>/g, " ").replaceAll("&quot;", '"').replace(/\s+/g, " ");

// ── Piezas puras ──

const fila: FilaExterno = {
  documentoId: 7,
  codigo: "ATE-DE-01",
  titulo: "Manual de usuario, bomba de infusión Infusomat",
  tituloOriginal: "Infusomat Space — Instructions for use",
  proceso: { id: 4, nombre: "Apoyo Terapéutico", sigla: "ATE" },
  vigencia: { estado: "vencida", dias: -143, proxima: finDeFecha("2026-06-18", ZONA) },
  emisor: "B. Braun",
  edicion: "rev. 4.2",
  adoptadaEn: finDeFecha("2025-06-18", ZONA),
  ultimaVerificacion: null,
  proximaVerificacion: finDeFecha("2026-06-18", ZONA),
  responsable: "Carlos A. Rojas",
  responsableId: 31,
  fuenteOficial: "Portal del fabricante",
  norma: null,
  copiasVivas: 2,
  impacto: null,
  edicionPendiente: null,
};

describe("TablaExternos", () => {
  const filas: FilaExterno[] = [
    fila,
    {
      ...fila,
      documentoId: 8,
      codigo: "CEX-DE-01",
      titulo: "Guía de práctica clínica HTA",
      tituloOriginal: null,
      vigencia: { estado: "atencion", dias: 300, proxima: finDeFecha("2027-09-04", ZONA) },
      emisor: "MinSalud",
      edicion: "2017",
      ultimaVerificacion: { fecha: finDeFecha("2026-09-04", ZONA), resultado: "edicion_nueva", nombre: "Luz Dary Ortiz" },
      responsable: "Luz Dary Ortiz",
      edicionPendiente: { desde: finDeFecha("2026-09-04", ZONA) },
    },
    {
      ...fila,
      documentoId: 9,
      codigo: "AIN-DE-01",
      titulo: "Guías de reanimación cardiopulmonar",
      vigencia: { estado: "atencion", dias: null, proxima: null },
      edicion: null,
      adoptadaEn: null,
      proximaVerificacion: null,
    },
  ];
  const html = renderToStaticMarkup(<TablaExternos filas={filas} />);

  it("pinta «Vencida hace N días», el responsable técnico, el emisor y la edición; la fila enlaza a la página del externo", () => {
    expect(html).toContain("Vencida hace 143 días");
    expect(html).toContain("Carlos A. Rojas");
    expect(sinEtiquetas(html)).toContain("B. Braun · rev. 4.2");
    expect(html).toContain("Infusomat Space — Instructions for use");
    expect(html).toContain('href="/vigencia/externos/7"');
    expect(html).toContain("18 jun 2025");
  });

  it("la edición nueva pendiente y el externo sin adoptar dicen por qué están en atención", () => {
    expect(html).toContain("Atención · edición nueva pendiente de adoptar");
    expect(sinEtiquetas(html)).toContain("Hay una edición nueva · Luz Dary Ortiz");
    expect(html).toContain("Atención · sin edición adoptada");
    expect(html).toContain("Sin adoptar");
  });

  it("sin verificaciones desde la adopción lo dice como la ficha; sin edición adoptada, que no se ha verificado", () => {
    const soloAdoptada = renderToStaticMarkup(<TablaExternos filas={[fila]} />);
    expect(soloAdoptada).toContain("Sin verificaciones desde su adopción");
    expect(soloAdoptada).not.toContain(">Sin verificar<");
    expect(renderToStaticMarkup(<TablaExternos filas={[filas[2]]} />)).toContain(">Sin verificar<");
  });

  it("tabla desde 768 px y una tarjeta por externo debajo, sin opacidad ni colores fijos", () => {
    expect(html).toContain('class="hidden md:block"');
    expect(html).toMatch(/<ul class="flex list-none flex-col gap-3 md:hidden"[^>]*>/);
    expect(html.match(/<li class="rounded-lg border border-border bg-card p-3 text-sm">/g)).toHaveLength(filas.length);
    expect(html).not.toMatch(/opacity-|bg-white|text-gray-|\bazul\b/);
  });
});

const externo: Externo = {
  documentoId: 8,
  codigo: "CEX-DE-01",
  titulo: "Guía de práctica clínica HTA",
  nivelAcceso: "general",
  proceso: { id: 2, nombre: "Consulta Externa", sigla: "CEX" },
  control: {
    entidadEmisora: "Ministerio de Salud y Protección Social",
    tituloOriginal: null,
    fuenteOficial: "https://www.minsalud.gov.co/guias",
    responsable: { id: 30, nombre: "Luz Dary Ortiz" },
    verificacionMeses: 12,
    norma: null,
    edicionNuevaPendienteDesde: null,
  },
  vigente: {
    versionId: 80,
    numero: 1,
    edicion: "2017",
    fechaEdicion: null,
    adoptadaEn: finDeFecha("2026-02-03", ZONA),
    adoptoPor: "Líder de Consulta Externa — Médico Coordinador",
  },
  borrador: null,
  ediciones: [{ numero: 1, edicion: "2017", estado: "vigente", adoptadaEn: finDeFecha("2026-02-03", ZONA) }],
  verificaciones: [
    {
      id: 1,
      resultado: "vigente",
      fuente: "Portal del Ministerio",
      nota: "Sigue siendo la última",
      nombre: "Luz Dary Ortiz",
      creadoEn: finDeFecha("2026-05-03", ZONA),
      version: 1,
    },
  ],
  vigencia: { estado: "al_dia", dias: 200, proxima: finDeFecha("2027-05-03", ZONA) },
  impacto: null,
  retirado: false,
  acciones: { editar: true, abrirEdicion: true, adoptar: false, verificar: true, retirar: true },
};

const opciones = { personas: [{ id: 30, nombre: "Luz Dary Ortiz", cargo: "Enfermera Jefe" }], normas: [] };

describe("PaginaExterno", () => {
  it("sin edición en borrador no ofrece «Adoptar esta edición»: ofrece abrir la edición nueva, verificar y retirar", () => {
    const html = renderToStaticMarkup(<VistaExterno externo={externo} opciones={opciones} pideCodigo={false} />);
    expect(html).not.toContain("Adoptar esta edición");
    expect(html).not.toContain("Arrastre los archivos aquí");
    for (const texto of [">Adoptar edición nueva<", "Registrar verificación", "Retirar", ">Editar<", "Ministerio de Salud y Protección Social"]) {
      expect(html).toContain(texto);
    }
    // El historial: las ediciones y las verificaciones, con quién, la fuente y la nota.
    expect(sinEtiquetas(html)).toContain("Sigue vigente");
    expect(html).toContain("Portal del Ministerio");
    expect(html).toContain("Sigue siendo la última");
    // La fuente oficial es texto, no un enlace (F13C-DC19).
    expect(html).not.toContain('href="https://www.minsalud.gov.co/guias"');
    expect(html).not.toMatch(/opacity-|bg-white|text-gray-|\bazul\b/);
  });

  it("el orden del documento es el visual en todos los anchos: la verificación primero, sin reordenar ni dejar una columna vacía", () => {
    const conVerificacion = renderToStaticMarkup(<VistaExterno externo={externo} opciones={opciones} pideCodigo={false} />);
    const sinVerificacion = renderToStaticMarkup(
      <VistaExterno externo={{ ...externo, acciones: { ...externo.acciones, verificar: false } }} opciones={opciones} pideCodigo={false} />,
    );
    for (const html of [conVerificacion, sinVerificacion]) {
      expect(html).not.toMatch(/\border-(first|last|\d)|:order-/);
      // Una sola columna: no queda una lateral vacía cuando la persona no verifica.
      expect(html).not.toMatch(/grid-cols-\[minmax/);
    }
    const orden = ["externo-verificar", "externo-control", "externo-historial", "externo-retirar"].map((id) => conVerificacion.indexOf(`id="${id}"`));
    expect(orden.every((i) => i >= 0)).toBe(true);
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
    expect(sinVerificacion).not.toContain('id="externo-verificar"');
  });

  it("con la edición en borrador ofrece «Adoptar esta edición», la zona de carga, «Qué cambió» y «Descartar»", () => {
    const conBorrador: Externo = {
      ...externo,
      borrador: {
        versionId: 81,
        numero: 2,
        edicion: "2024",
        fechaEdicion: "2024-03-01",
        resumenCambios: "Metas de presión arterial actualizadas",
        huella: "b".repeat(64),
        archivos: [{ id: 5, rol: "principal", nombreOriginal: "guia-2024.pdf", extension: "pdf", mime: "application/pdf", tamanoBytes: 2048 }],
      },
      acciones: { ...externo.acciones, abrirEdicion: false, adoptar: true },
    };
    const html = renderToStaticMarkup(<VistaExterno externo={conBorrador} opciones={opciones} pideCodigo={false} />);
    for (const texto of ["Adoptar esta edición", "Arrastre los archivos aquí", "Qué cambió", "Metas de presión arterial actualizadas", "Descartar", "guia-2024.pdf"]) {
      expect(html).toContain(texto);
    }
    expect(html).not.toContain(">Adoptar edición nueva<");
  });

  it("a quien solo verifica le muestra la verificación, sin editar, abrir edición ni retirar; un retirado no ofrece nada", () => {
    const soloVerifica: Externo = { ...externo, acciones: { editar: false, abrirEdicion: false, adoptar: false, verificar: true, retirar: false } };
    const html = renderToStaticMarkup(<VistaExterno externo={soloVerifica} opciones={null} pideCodigo={false} />);
    expect(html).toContain("Registrar verificación");
    // «Adoptar edición nueva» sale en el efecto del resultado, pero no como acción.
    for (const texto of [">Adoptar edición nueva<", ">Retirar", ">Editar"]) expect(html).not.toContain(texto);
    // Los tres resultados se ven, cada uno con su efecto.
    for (const texto of ["Sigue vigente", "Hay una edición nueva", "Fue retirado o derogado"]) expect(html).toContain(texto);

    const retirado: Externo = {
      ...externo,
      vigente: null,
      retirado: true,
      ediciones: [{ numero: 1, edicion: "2017", estado: "anulado", adoptadaEn: finDeFecha("2026-02-03", ZONA) }],
      acciones: { editar: false, abrirEdicion: false, adoptar: false, verificar: false, retirar: false },
    };
    const deRetirado = renderToStaticMarkup(<VistaExterno externo={retirado} opciones={null} pideCodigo={false} />);
    expect(deRetirado).toContain("Retirado");
    expect(deRetirado).not.toContain("Registrar verificación");
  });

  it("el diálogo de adoptar dice lo que se firma: la huella del principal, o sin él la de los datos de la edición", () => {
    const conPrincipal = renderToStaticMarkup(<CuerpoAdoptar esPrimera conPrincipal />);
    expect(conPrincipal).toContain("con la huella de su archivo principal");
    expect(conPrincipal).not.toContain("Sin archivo principal");
    const sinPrincipal = renderToStaticMarkup(<CuerpoAdoptar esPrimera={false} conPrincipal={false} />);
    expect(sinPrincipal).toContain("Sin archivo principal: la firma lleva la huella de los datos de la edición");
    expect(sinPrincipal).not.toContain("huella de su archivo principal");
  });

  it("el diálogo envía oculta la huella que mostró, vacía si no había principal", () => {
    expect(ocultosDeAdopcion({ versionId: 81, huella: "b".repeat(64) })).toEqual({ versionId: "81", huella: "b".repeat(64) });
    expect(ocultosDeAdopcion({ versionId: 81, huella: null })).toEqual({ versionId: "81", huella: "" });
  });

  it("el diálogo de adoptar pide acuse y socialización en la primera edición; en una nueva el acuse va siempre", () => {
    const primera = renderToStaticMarkup(<CuerpoAdoptar esPrimera conPrincipal />);
    expect(primera).toContain("Pedir acuse de lectura a la audiencia");
    expect(primera).toContain("Requiere socialización");
    expect(primera).toMatch(/<input[^>]*name="pedirAcuses"/);
    expect(primera).not.toMatch(/<input[^>]*name="pedirAcuses"[^>]*disabled/);
    const nueva = renderToStaticMarkup(<CuerpoAdoptar esPrimera={false} conPrincipal />);
    expect(nueva).toMatch(/<input[^>]*checked=""[^>]*disabled=""|<input[^>]*disabled=""[^>]*checked=""/);
    expect(nueva).toContain("Requiere socialización");
  });
});

describe("los formularios envían solo lo que su esquema estricto acepta", () => {
  /** Los `name` de los campos que viajan en el formulario, sin repetir. */
  const nombres = (html: string) => [...new Set([...html.matchAll(/<(?:input|select|textarea)[^>]*\sname="([^"]+)"/g)].map((m) => m[1]))].sort();
  const opcionesAlta = {
    procesos: [{ id: 2, nombre: "Consulta Externa", sigla: "CEX", subprocesos: [{ id: 5, nombre: "Odontología" }], liderId: 30 }],
    todos: [
      { id: 2, nombre: "Consulta Externa", subprocesos: [{ id: 5, nombre: "Odontología" }] },
      { id: 3, nombre: "Gestión del Talento Humano", subprocesos: [] },
    ],
    personas: [
      { id: 30, nombre: "Luz Dary Ortiz", cargo: "Enfermera Jefe" },
      { id: 31, nombre: "Carlos A. Rojas", cargo: null },
    ],
    normas: [{ id: 1, nombre: "Resolución 3100 de 2019" }],
    verificacionMeses: 12,
  };

  it("el alta: el documento, los datos de control y la primera edición; el responsable por defecto es el líder del proceso", () => {
    const html = renderToStaticMarkup(<FormularioExterno opciones={opcionesAlta} usuarioId={31} />);
    expect(nombres(html)).toEqual(
      [
        "descripcion",
        "edicion",
        "entidadEmisora",
        "fechaEdicion",
        "fuenteOficial",
        "nivelAcceso",
        "normaId",
        "otrosProcesos",
        "palabrasClave",
        "procesoId",
        "responsableId",
        "subprocesoId",
        "tituloOriginal",
        "titulo",
        "verificacionMeses",
      ].sort(),
    );
    // El líder de CEX (30) va elegido; «también aplica en» no ofrece el proceso propietario.
    expect(html).toMatch(/<option value="30" selected="">Luz Dary Ortiz — Enfermera Jefe<\/option>/);
    expect(html).not.toContain('value="p:2"');
    expect(html).toContain('value="p:3"');
    expect(html).toMatch(/<input[^>]*name="verificacionMeses"[^>]*value="12"/);
    // La primera edición no pide «qué cambió».
    expect(html).not.toContain("resumenCambios");
  });

  it("la verificación, los datos de control y la edición", () => {
    expect(nombres(renderToStaticMarkup(<FormularioVerificacion documentoId={8} fuenteOficial={null} verificacionMeses={12} />))).toEqual(
      ["documentoId", "fuente", "nota", "resultado"].sort(),
    );
    expect(
      nombres(renderToStaticMarkup(<FormularioControl documentoId={8} control={externo.control} personas={opcionesAlta.personas} normas={[]} />)),
    ).toEqual(["entidadEmisora", "fuenteOficial", "id", "normaId", "responsableId", "tituloOriginal", "verificacionMeses"].sort());
    const edicion = renderToStaticMarkup(
      <FormularioEdicion modo="abrir" id={8} valores={{ edicion: "", fechaEdicion: null, resumenCambios: null }} exigeResumen />,
    );
    expect(nombres(edicion)).toEqual(["edicion", "fechaEdicion", "id", "resumenCambios"].sort());
    expect(edicion).toMatch(/<textarea[^>]*required=""[^>]*name="resumenCambios"|<textarea[^>]*name="resumenCambios"[^>]*required=""/);
  });
});

// ── Contra la BD ──

const valida = (s: SesionFlujo): SesionValida => ({
  ...s,
  totpActivo: false,
  factorPendiente: false,
  debeCambiarClave: false,
  aceptoDatos: true,
  tema: "sistema",
});

/** Pinta lo que devuelve `pagina` (también con componentes asíncronos) con la conexión y la sesión de la prueba. */
async function pintar(tx: TransactionSql, sesion: SesionFlujo, pagina: () => Promise<React.ReactElement | null>): Promise<string> {
  contexto.tx = tx;
  contexto.sesion = valida(sesion);
  try {
    const elemento = await pagina();
    if (elemento === null) return "";
    const flujo = await renderToReadableStream(elemento);
    await flujo.allReady;
    return (await new Response(flujo).text()).replaceAll("<!-- -->", "");
  } finally {
    contexto.tx = null;
    contexto.sesion = null;
  }
}

/** La promesa de la página rechaza con «no encontrada» (o con la redirección). */
async function falla(tx: TransactionSql, sesion: SesionFlujo, pagina: () => Promise<unknown>): Promise<string> {
  contexto.tx = tx;
  contexto.sesion = valida(sesion);
  try {
    await pagina();
    return "sin error";
  } catch (err) {
    return (err as Error).message;
  } finally {
    contexto.tx = null;
    contexto.sesion = null;
  }
}

const sinFiltro = () => ({ searchParams: Promise.resolve({}) });

describe("BloqueExterno en la ficha", () => {
  it("quien ve el documento ve el emisor, la edición, quién adoptó, el responsable y la verificación; el enlace de gestión, solo quien puede", () =>
    revertida(sql, async (tx) => {
      const lider = await sesionDe(tx, "lider.cex");
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const lector = await usuarioDePrueba(tx, { rol: "consulta" });
      const e = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017", responsableId: responsable.usuarioId, ahora });
      try {
        const deLector = await pintar(tx, lector, () => BloqueExterno({ documentoId: e.documentoId, sesion: lector }));
        for (const texto of ["Documento externo", "Ministerio de Salud y Protección Social", "2017", responsable.nombre, lider.nombre, "Al día"]) {
          expect(deLector).toContain(texto);
        }
        expect(deLector).toContain("https://www.minsalud.gov.co/guias");
        expect(deLector).not.toContain('href="https://www.minsalud.gov.co/guias"');
        expect(deLector).not.toContain("Gestionar en Vigencia → Externos");

        for (const sesion of [lider, responsable]) {
          const html = await pintar(tx, sesion, () => BloqueExterno({ documentoId: e.documentoId, sesion }));
          expect(html).toContain(`href="/vigencia/externos/${e.documentoId}"`);
          expect(html).toContain("Gestionar en Vigencia → Externos");
        }
        // Un externo no tiene trámite: el líder de su proceso, que sí pide cambios sobre un interno del mismo proceso, no
        // puede pedirlo sobre el externo (la regla que esconde «Solicitar cambio» en las dos fichas).
        const interno = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14", proceso: "CEX" });
        expect(await puedePedirSobreDocumento(lider, interno.id, { sql: tx })).toBe(true);
        expect(await puedePedirSobreDocumento(lider, e.documentoId, { sql: tx })).toBe(false);
        // Un interno no tiene este bloque.
        expect(await pintar(tx, lider, () => BloqueExterno({ documentoId: interno.id, sesion: lider }))).toBe("");
      } finally {
        await e.limpiar();
      }
    }));

  it("un restringido no existe para quien no lo ve", () =>
    revertida(sql, async (tx) => {
      const lider = await sesionDe(tx, "lider.cex");
      const e = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017", nivelAcceso: "restringido", ahora });
      try {
        const ajeno = await usuarioDePrueba(tx, { rol: "consulta" });
        expect(await pintar(tx, ajeno, () => BloqueExterno({ documentoId: e.documentoId, sesion: ajeno }))).toBe("");
        expect(await pintar(tx, lider, () => BloqueExterno({ documentoId: e.documentoId, sesion: lider }))).toContain("Documento externo");
      } finally {
        await e.limpiar();
      }
    }));
});

describe("la ficha del panel de un externo", () => {
  /** Con la carga directa abierta, que es cuando el panel ofrece sus caminos de versión a un interno. */
  async function conCargaAbierta(tx: TransactionSql) {
    await tx`INSERT INTO configuracion (clave, valor) VALUES ('publicacion_directa', 'true')
      ON CONFLICT (clave) DO UPDATE SET valor = 'true'`;
  }
  /** Un interno de CEX solo con su versión en borrador, como lo deja «Registrar documento ya aprobado». */
  async function internoEnBorrador(tx: TransactionSql, admin: SesionFlujo) {
    const [cex] = await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`;
    const [tipo] = await tx`SELECT id FROM tipos_documento WHERE sigla = 'PR'`;
    const codigo = `ZZB-PR-${Date.now() % 100000}`;
    const { documentoId, versionId } = await crearDocumentoEn(
      tx,
      {
        codigo,
        titulo: "Interno de contraste",
        tipoId: Number(tipo.id),
        descripcion: null,
        palabrasClave: null,
        asociaciones: [{ procesoId: Number(cex.id), esPrincipal: true }],
        nivelAcceso: "general",
      },
      admin.usuarioId,
    );
    return { documentoId, versionId, codigo };
  }
  const panel = (tx: TransactionSql, admin: SesionFlujo, codigo: string) =>
    pintar(tx, admin, () => PaginaDocumentoAdmin({ params: Promise.resolve({ codigo }) }));

  it("con la edición en borrador no ofrece la zona de carga, el control de la versión, publicar ni descartar, que un interno sí tiene", () =>
    revertida(sql, async (tx) => {
      await conCargaAbierta(tx);
      const admin = await sesionAdmin(tx);
      const interno = await internoEnBorrador(tx, admin);
      const delInterno = await panel(tx, admin, interno.codigo);
      const caminos = ["Arrastre los archivos aquí", "Control de la versión", "Publicar versión", "Descartar borrador"];
      for (const texto of caminos) expect(delInterno, texto).toContain(texto);

      const [cex] = await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`;
      const r = await registrarExterno(admin, datosExterno({ procesoId: Number(cex.id), responsableId: admin.usuarioId }), { sql: tx, ahora });
      const delExterno = await panel(tx, admin, r.codigo);
      expect(delExterno).toContain(r.codigo);
      for (const texto of caminos) expect(delExterno, texto).not.toContain(texto);
      expect(delExterno).toContain("Gestionar en Vigencia → Externos");
      expect(delExterno).toContain(`href="/vigencia/externos/${r.documentoId}"`);
    }));

  it("sin versión ni borrador no ofrece «Nueva versión (borrador)», que un interno en esa situación sí tiene", () =>
    revertida(sql, async (tx) => {
      await conCargaAbierta(tx);
      const admin = await sesionAdmin(tx);
      const interno = await internoEnBorrador(tx, admin);
      await tx`UPDATE documento_versiones SET estado = 'descartado' WHERE id = ${interno.versionId}`;
      expect(await panel(tx, admin, interno.codigo)).toContain("Nueva versión (borrador)");

      const [cex] = await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`;
      const r = await registrarExterno(admin, datosExterno({ procesoId: Number(cex.id), responsableId: admin.usuarioId }), { sql: tx, ahora });
      await descartarEdicion(admin, r.versionId, { sql: tx });
      expect(await panel(tx, admin, r.codigo)).not.toContain("Nueva versión (borrador)");
    }));

  it("con una edición vigente no ofrece «Solicitar cambio» ni «Deshacer carga», que un interno cargado sí tiene", () =>
    revertida(sql, async (tx) => {
      await conCargaAbierta(tx);
      const admin = await sesionAdmin(tx);
      const interno = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14", proceso: "CEX" });
      const delInterno = await panel(tx, admin, interno.codigo);
      for (const texto of ["Solicitar cambio", "Deshacer carga"]) expect(delInterno, texto).toContain(texto);

      const e = await externoDePrueba(tx, admin, { proceso: "CEX", edicion: "2017", ahora });
      try {
        const delExterno = await panel(tx, admin, e.codigo);
        for (const texto of ["Solicitar cambio", "Deshacer carga"]) expect(delExterno, texto).not.toContain(texto);
      } finally {
        await e.limpiar();
      }
    }));
});

describe("páginas de Vigencia → Externos", () => {
  it("el responsable técnico de rol Consulta entra a Vigencia por sus externos: solo la pestaña Externos y solo los suyos", () =>
    revertida(sql, async (tx) => {
      const lider = await sesionDe(tx, "lider.cex");
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const suyo = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017", responsableId: responsable.usuarioId, ahora });
      const ajeno = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2019", ahora });
      try {
        expect(await falla(tx, responsable, () => PaginaVigencia())).toBe("REDIRECT:/vigencia/externos");
        const html = await pintar(tx, responsable, () => PaginaExternos(sinFiltro()));
        expect(html).toContain(suyo.codigo);
        expect(html).not.toContain(ajeno.codigo);
        expect(html).toContain('href="/vigencia/externos"');
        expect(html).not.toContain('href="/vigencia/semaforo"');
        expect(html).not.toContain("Registrar documento externo");
        expect(html).toContain("Descargar Excel");
        // A 390 px los filtros no desbordan: los selectores ceden al ancho disponible.
        for (const id of ["filtro-proceso", "filtro-responsable"]) {
          expect(html).toMatch(new RegExp(`<select[^>]*id="${id}"[^>]*class="[^"]*\\bw-full\\b[^"]*"`));
        }
        // Su página de control: la verificación, sin gestionar.
        const pagina = await pintar(tx, responsable, () => PaginaExterno({ params: Promise.resolve({ id: String(suyo.documentoId) }) }));
        expect(pagina).toContain("Registrar verificación");
        expect(pagina).not.toContain(">Adoptar edición nueva<");
        expect(await falla(tx, responsable, () => PaginaExterno({ params: Promise.resolve({ id: String(ajeno.documentoId) }) }))).toBe("NO_ENCONTRADA");
        expect(await falla(tx, responsable, () => PaginaNuevoExterno())).toBe("NO_ENCONTRADA");
      } finally {
        await suyo.limpiar();
        await ajeno.limpiar();
      }
    }));

  it("el líder ve las pestañas Semáforo y Externos, «Registrar documento externo» y la edición en borrador de sus externos", () =>
    revertida(sql, async (tx) => {
      const lider = await sesionDe(tx, "lider.cex");
      const e = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017", ahora });
      try {
        await registrarVerificacion(
          lider,
          { documentoId: e.documentoId, resultado: "edicion_nueva", fuente: "Portal del Ministerio", nota: null },
          { sql: tx, ahora },
        );
        const html = await pintar(tx, lider, () => PaginaExternos(sinFiltro()));
        for (const texto of ['href="/vigencia/semaforo"', 'href="/vigencia/externos"', "Registrar documento externo", e.codigo]) {
          expect(html).toContain(texto);
        }
        expect(html).toContain("Atención · edición nueva pendiente de adoptar");

        await abrirEdicion(lider, e.documentoId, { edicion: "2024", fechaEdicion: null, resumenCambios: "Metas nuevas" }, { sql: tx, ahora });
        const pagina = await pintar(tx, lider, () => PaginaExterno({ params: Promise.resolve({ id: String(e.documentoId) }) }));
        for (const texto of ["Adoptar esta edición", "Arrastre los archivos aquí", "Metas nuevas", "Descartar"]) expect(pagina).toContain(texto);
        expect(pagina).toContain("Atención · edición nueva pendiente de adoptar");

        const alta = await pintar(tx, lider, () => PaginaNuevoExterno());
        for (const texto of ["Registrar documento externo", "Entidad emisora", "Responsable técnico", "Primera edición"]) expect(alta).toContain(texto);
        expect(await falla(tx, lider, () => PaginaExterno({ params: Promise.resolve({ id: "abc" }) }))).toBe("NO_ENCONTRADA");
      } finally {
        await e.limpiar();
      }
    }));
});

describe("la matriz vacía", () => {
  it("sin filtros dice que aún no hay externos y ofrece registrar el primero; con filtros, que ninguno los cumple", () =>
    revertida(sql, async (tx) => {
      const [m] = await tx`SELECT macroproceso_id FROM procesos WHERE sigla = 'GTH'`;
      const sigla = `ZE${Date.now() % 100000}`;
      const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
        VALUES (${m.macroproceso_id}, 'Proceso sin externos', ${sigla}, ${sigla.toLowerCase()}, 'circle', 999) RETURNING id`;
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [Number(p.id)] });

      const vacia = await pintar(tx, lider, () => PaginaExternos(sinFiltro()));
      expect(vacia).toContain("Aún no hay documentos externos registrados");
      expect(vacia).toMatch(/<a[^>]*href="\/vigencia\/externos\/nuevo"[^>]*>Registrar el primero<\/a>/);
      expect(vacia).not.toContain("cumple los filtros");

      const filtrada = await pintar(tx, lider, () => PaginaExternos({ searchParams: Promise.resolve({ estado: "vencida" }) }));
      expect(filtrada).toContain("Ningún documento externo de su alcance cumple los filtros elegidos.");
      expect(filtrada).not.toContain("Registrar el primero");
    }));
});

describe("la insignia de «Vigencia» en la barra", () => {
  it("cuenta los vencidos del alcance: el semáforo para quien lo ve y sus externos para el responsable técnico", () =>
    revertida(sql, async (tx) => {
      const lider = await sesionDe(tx, "lider.cex");
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const vencidos = async (sesion: SesionFlujo, responsableTecnico: boolean) =>
        (await vigenciaDePersona(sesion, { responsableTecnico }, { sql: tx, ahora })).vencidos;
      const antes = await vencidos(lider, false);
      const e = await externoDePrueba(tx, lider, {
        proceso: "CEX",
        edicion: "2017",
        responsableId: responsable.usuarioId,
        ahora: new Date("2025-08-14T15:00:00Z"),
      });
      try {
        expect(await vencidos(lider, false)).toBe(antes + 1);
        expect(await vencidos(responsable, true)).toBe(1);
        // Quien no ve la entrada no cuenta nada.
        expect(await vencidos(responsable, false)).toBe(0);
      } finally {
        await e.limpiar();
      }
    }));
});
