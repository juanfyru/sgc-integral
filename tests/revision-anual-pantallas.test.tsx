/**
 * Las pantallas de la revisión anual (spec 13C §9 y §14, maquetas 4, 5 y 6): la tabla de decisiones y sus botones, la
 * verificación de un externo en un paso, los diálogos de la campaña y, contra la BD de desarrollo dentro de una
 * transacción que se revierte, las páginas tal como las ve cada rol, la solicitud prellenada y el origen del trámite.
 * Las campañas de prueba son de 2090 y 2091 (una por año); ninguna revisión cerrada queda en la base.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const contexto = vi.hoisted(() => ({ tx: null as unknown, sesion: null as unknown }));

vi.mock("@/db/cliente", async (importar) => {
  const real = await importar<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => contexto.tx ?? real.obtenerSql() };
});
vi.mock("@/lib/paginas", () => ({
  exigirSesion: async () => contexto.sesion,
  exigirPermiso: async () => contexto.sesion,
  exigirEntradaPanel: async () => contexto.sesion,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("no encontrada");
  },
  redirect: (ruta: string) => {
    throw new Error(`redirige a ${ruta}`);
  },
  useRouter: () => ({ refresh: vi.fn() }),
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
  abrirRevisionAccion: vi.fn(),
  prorrogarRevisionAccion: vi.fn(),
  cerrarRevisionAccion: vi.fn(),
  enlazarTramiteAccion: vi.fn(),
  confirmarNormogramaAccion: vi.fn(),
}));
vi.mock("@/app/acciones-tramites", () => ({ crearSolicitudAccion: vi.fn() }));

import type { TransactionSql } from "postgres";
import PaginaRevisionAnual from "@/app/(app)/vigencia/revision-anual/page";
import PaginaDeRevision from "@/app/(app)/vigencia/revision-anual/[id]/page";
import PaginaDelExterno from "@/app/(app)/vigencia/externos/[id]/page";
import PaginaNuevaSolicitud from "@/app/(app)/tramites/nueva/page";
import { BloqueSolicitud } from "@/componentes/tramites/BloqueSolicitud";
import { FormularioVerificacion } from "@/componentes/vigencia/externos/FormularioVerificacion";
import { CuerpoCerrar } from "@/componentes/vigencia/revision/DialogoCerrar";
import { FormularioAbrir } from "@/componentes/vigencia/revision/DialogoAbrir";
import { FormularioProrrogar } from "@/componentes/vigencia/revision/DialogoProrrogar";
import { textoFueraDeTabla } from "@/componentes/vigencia/revision/SeccionProceso";
import { TablaDecisiones, accionesDeDecision, type AccionesDecision, type FilaDecision } from "@/componentes/vigencia/revision/TablaDecisiones";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { asociarProceso, enlazarDocumento } from "@/db/consultas/normograma/asociaciones";
import { cambiarEstadoNorma } from "@/db/consultas/normograma/normas";
import { obtenerTramite, origenDeTramite } from "@/db/consultas/tramites";
import { crearSolicitud } from "@/db/consultas/tramites-flujo";
import type { DecisionDeDocumento } from "@/db/consultas/vigencia/revision-anual";
import { cerrarRevision } from "@/db/consultas/vigencia/revision-anual";
import { finDeFecha } from "@/lib/tramites/plazos";
import type { Decision } from "@/lib/vigencia/tipos";
import { normaDePrueba } from "./utiles/normograma";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { externoDePrueba, firmaDePrueba, revisionDePrueba, vigenteFuera } from "./utiles/vigencia";

const ZONA = "America/Bogota";
const AHORA = finDeFecha("2026-11-08", ZONA);

// ── La tabla de decisiones, sin BD ──

const SIN: AccionesDecision = { decidir: false, ratificar: false, solicitar: false, enlazar: null, verificar: null, verTramite: false };

const base: FilaDecision = {
  documentoId: 1,
  codigo: "CEX-FO-01",
  titulo: "Consentimiento informado de procedimientos menores",
  origen: "interno",
  tipo: "Formato",
  autoridad: "operativo",
  proceso: { id: 3, nombre: "Consulta Externa", sigla: "CEX" },
  version: { id: 10, numero: 1, edicion: null },
  huella: "a".repeat(64),
  mesesRevision: 12,
  plazoPropio: false,
  ultimaRevision: { fecha: finDeFecha("2026-09-12", ZONA), clase: "publicacion", quien: null },
  proximaRevision: finDeFecha("2027-09-12", ZONA),
  fijada: null,
  vigencia: { estado: "al_dia", dias: 300 },
  tramite: null,
  impacto: null,
  edicionPendiente: null,
  decision: null,
  porDecidir: false,
  insumos: { acuses: { confirmados: 31, total: 34, porcentaje: 91 }, hallazgos: 0, normasCambiadas: [], consultas: 58, tramites: 1 },
  acciones: SIN,
};

const decision = (d: Partial<DecisionDeDocumento> & { decision: Decision }): DecisionDeDocumento => ({
  por: "Luz Dary Ortiz",
  en: finDeFecha("2026-11-06", ZONA),
  tramite: null,
  ratificacionId: null,
  verificacionId: null,
  ...d,
});

const filas: FilaDecision[] = [
  { ...base, decision: decision({ decision: "reciente", por: null }) },
  { ...base, documentoId: 2, codigo: "CEX-CA-01", porDecidir: true, acciones: { ...SIN, decidir: true, ratificar: true, solicitar: true, verTramite: true } },
  {
    ...base,
    documentoId: 3,
    codigo: "CEX-DE-01",
    origen: "externo",
    tipo: "Documento externo",
    version: { id: 13, numero: 1, edicion: "2017" },
    porDecidir: true,
    acciones: { ...SIN, decidir: true, verificar: { fuenteOficial: "https://www.minsalud.gov.co/guias", verificacionMeses: 12 } },
  },
  {
    ...base,
    documentoId: 4,
    codigo: "CEX-PR-02",
    decision: decision({ decision: "actualizar", tramite: { id: 9, numero: "SOL-2026-009", etapa: "cancelado" } }),
    porDecidir: true,
    acciones: { ...SIN, decidir: true, ratificar: true, solicitar: true, verTramite: true },
  },
  {
    ...base,
    documentoId: 5,
    codigo: "CEX-FO-03",
    decision: decision({ decision: "en_tramite", por: null, tramite: { id: 11, numero: "SOL-2026-011", etapa: "elaboracion" } }),
    tramite: { id: 11, numero: "SOL-2026-011", etapa: "elaboracion", dia: 3 },
    vigencia: { estado: "en_tramite", dias: null },
    acciones: { ...SIN, verTramite: true },
  },
  {
    ...base,
    documentoId: 6,
    codigo: "CEX-GU-02",
    porDecidir: true,
    tramite: { id: 12, numero: "SOL-2026-012", etapa: "visto_bueno", dia: 1 },
    vigencia: { estado: "en_tramite", dias: null },
    acciones: { ...SIN, decidir: true, enlazar: { id: 12, numero: "SOL-2026-012" } },
  },
  { ...base, documentoId: 7, codigo: "CEX-IN-04", porDecidir: true, acciones: SIN },
];

const tabla = (f: FilaDecision[] = filas) =>
  renderToStaticMarkup(<TablaDecisiones titulo="Documentos de Consulta Externa" filas={f} revision={{ id: 4, anio: 2026 }} ahora={AHORA} pideCodigo={false} volver="/vigencia/revision-anual?proceso=3" />);

/** La tarjeta (por debajo de 1024 px) de un documento: un `<li>` de la lista. */
function tarjeta(html: string, codigo: string): string {
  const lista = html.slice(html.indexOf('lg:hidden" aria-label="Documentos de'));
  const trozo = lista.split("<li").find((t) => t.includes(`${codigo} `));
  if (!trozo) throw new Error(`No está la tarjeta de ${codigo}`);
  return trozo;
}

const sinEtiquetas = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

/** La etiqueta `<input>` (o `<textarea>`) de un campo, para mirar sus atributos sin depender de su orden. */
function campo(html: string, nombre: string, valor?: string): string {
  const etiquetas = html.match(/<(?:input|textarea)\s[^>]*>/g) ?? [];
  const hallada = etiquetas.find((e) => e.includes(`name="${nombre}"`) && (valor === undefined || e.includes(`value="${valor}"`)));
  if (!hallada) throw new Error(`No está el campo ${nombre}`);
  return hallada;
}

describe("TablaDecisiones", () => {
  it("«Revisado recientemente» va sin botones; un pendiente lleva los tres, que piden la solicitud prellenada y enlazada", () => {
    const html = tabla();
    const reciente = tarjeta(html, "CEX-FO-01");
    expect(sinEtiquetas(reciente)).toContain("Revisado recientemente Publicada en la plataforma · 12 sep 2026");
    for (const boton of ["Ratificar", "Actualizar", "Eliminar"]) expect(reciente).not.toContain(boton);

    const pendiente = tarjeta(html, "CEX-CA-01");
    expect(pendiente).toContain("Ratificar sin cambios");
    expect(pendiente).toContain('href="/tramites/nueva?documento=CEX-CA-01&amp;tipo=modificar&amp;motivo=revision_anual&amp;revision=4"');
    expect(pendiente).toContain('href="/tramites/nueva?documento=CEX-CA-01&amp;tipo=eliminar&amp;motivo=revision_anual&amp;revision=4"');
    expect(pendiente).toMatch(/aria-label="Actualizar CEX-CA-01: pedir su modificación"[^>]*>Actualizar</);
    expect(pendiente).toMatch(/aria-label="Eliminar CEX-CA-01: pedir su eliminación"[^>]*>Eliminar</);
    // Lo mismo en la tabla desde 1024 px y en las tarjetas.
    expect(html).toContain('class="hidden lg:block"');
    expect(html).toContain('class="flex list-none flex-col gap-3 lg:hidden"');
  });

  it("en un externo, «Ratificar» es la verificación «sigue vigente»; «Actualizar» y «Eliminar» abren su página con el resultado elegido", () => {
    const externo = tarjeta(tabla(), "CEX-DE-01");
    expect(externo).toMatch(/aria-label="Ratificar CEX-DE-01: registrar la verificación «sigue vigente»"[^>]*>Ratificar</);
    expect(externo).not.toContain("Ratificar sin cambios");
    expect(externo).toContain('href="/vigencia/externos/3?verificar=edicion_nueva"');
    expect(externo).toContain('href="/vigencia/externos/3?verificar=retirado"');
    expect(externo).not.toContain("/tramites/nueva");
  });

  it("un pendiente por un trámite que murió muestra lo decidido y deja decidir otra vez; el de un trámite en curso, no", () => {
    const html = tabla();
    const muerto = tarjeta(html, "CEX-PR-02");
    expect(sinEtiquetas(muerto)).toContain("Actualizar · SOL-2026-009 · Cancelado");
    expect(muerto).toContain('href="/tramites/9"');
    expect(muerto).toContain("Ratificar sin cambios");
    expect(muerto).toContain("tipo=modificar");

    const enCurso = tarjeta(html, "CEX-FO-03");
    expect(sinEtiquetas(enCurso)).toContain("En trámite · SOL-2026-011 en elaboración");
    for (const boton of ["Ratificar", "tipo=modificar", "tipo=eliminar"]) expect(enCurso).not.toContain(boton);

    // Con un trámite abierto que no es su decisión, solo se ofrece enlazarlo.
    const enlazar = tarjeta(html, "CEX-GU-02");
    expect(enlazar).toContain("Enlazar el trámite en curso SOL-2026-012");
    expect(enlazar).not.toContain("Ratificar");
    expect(enlazar).not.toContain("tipo=modificar");
  });

  it("con la revisión abierta, lo que falta es «Pendiente», nunca «Sin revisar»; cerrada, «Sin revisar»", () => {
    const html = tabla();
    expect(sinEtiquetas(tarjeta(html, "CEX-IN-04"))).toContain("Pendiente");
    expect(html).not.toContain("Sin revisar");
    const cerrada = tabla([{ ...base, documentoId: 8, codigo: "CEX-IN-05", decision: decision({ decision: "sin_revisar", por: null }) }]);
    expect(sinEtiquetas(tarjeta(cerrada, "CEX-IN-05"))).toContain("Sin revisar");
  });

  it("los insumos de cada documento, y sin colores fijos ni opacidad", () => {
    const html = tabla();
    const fila = sinEtiquetas(tarjeta(html, "CEX-CA-01"));
    expect(fila).toContain("Acuses v. vigente 31 de 34 (91 %)");
    expect(fila).toContain("Consultas 2026 58");
    expect(fila).toContain("Trámites 2026 1");
    expect(fila).toContain("Normas cambiadas —");
    expect(html).not.toMatch(/opacity-|bg-white|text-gray-|bg-gray-|text-black/);
  });

  it("las acciones salen con puedeDecidir del proceso y porDecidir del documento", () => {
    const lider = { usuarioId: 8, rol: "lider_proceso" as const, verHistorial: false };
    const alcance = { todos: false as const, procesoIds: [3] };
    const pendiente = { ...base, porDecidir: true, decision: null };
    expect(accionesDeDecision(lider, pendiente, { puedeDecidir: true, alcance, verificable: null })).toEqual({
      decidir: true, ratificar: true, solicitar: true, enlazar: null, verificar: null, verTramite: true,
    });
    expect(accionesDeDecision(lider, pendiente, { puedeDecidir: false, alcance, verificable: null })).toMatchObject({ decidir: false, ratificar: false, solicitar: false });
    expect(accionesDeDecision(lider, { ...pendiente, porDecidir: false }, { puedeDecidir: true, alcance, verificable: null }).decidir).toBe(false);
    const conTramite = { ...pendiente, tramite: { id: 12, numero: "SOL-2026-012", etapa: "visto_bueno" as const, dia: 1 } };
    expect(accionesDeDecision(lider, conTramite, { puedeDecidir: true, alcance, verificable: null })).toMatchObject({
      decidir: true, ratificar: false, solicitar: false, enlazar: { id: 12, numero: "SOL-2026-012" },
    });
    const verificable = { fuenteOficial: null, verificacionMeses: 12 };
    const externo = { ...pendiente, origen: "externo" as const };
    expect(accionesDeDecision(lider, externo, { puedeDecidir: true, alcance, verificable })).toMatchObject({ decidir: true, verificar: verificable, ratificar: false });
    expect(accionesDeDecision(lider, externo, { puedeDecidir: true, alcance, verificable: null }).verificar).toBeNull();
  });

  it("explica en una línea los documentos que dejaron de estar vigentes y cuentan en las cifras", () => {
    expect(textoFueraDeTabla(15, 15)).toBeNull();
    expect(textoFueraDeTabla(15, 14)).toBe("1 documento de la revisión ya no está vigente (se eliminó o se retiró): cuenta en las cifras del proceso, pero no sale en la tabla.");
    expect(textoFueraDeTabla(15, 12)).toMatch(/^3 documentos de la revisión ya no están vigentes/);
  });
});

describe("la verificación y los diálogos de la campaña", () => {
  it("la verificación fija «sigue vigente» manda el resultado oculto, pide la fuente y vuelve a la tabla", () => {
    const html = renderToStaticMarkup(
      <FormularioVerificacion documentoId={3} fuenteOficial="https://www.minsalud.gov.co/guias" verificacionMeses={12} resultadoFijo="vigente" volver="/vigencia/revision-anual?proceso=3" />,
    );
    expect(html).toContain('<input type="hidden" name="resultado" value="vigente"/>');
    expect(html).toContain('<input type="hidden" name="volver" value="/vigencia/revision-anual?proceso=3"/>');
    expect(html).not.toContain('type="radio"');
    expect(sinEtiquetas(html)).toContain("Resultado: Sigue vigente La próxima verificación pasa a 12 meses después de hoy.");
    expect(campo(html, "fuente")).toMatch(/required="" minLength="3" maxLength="300"/);
  });

  it("con un resultado elegido, la verificación se abre en él; sin volver, no manda volver", () => {
    const html = renderToStaticMarkup(<FormularioVerificacion documentoId={3} fuenteOficial={null} verificacionMeses={12} resultadoInicial="retirado" />);
    expect(campo(html, "resultado", "retirado")).toContain('checked=""');
    expect(campo(html, "resultado", "vigente")).not.toContain('checked=""');
    expect(html).toContain("Registrar verificación y retirar");
    expect(html).not.toContain('name="volver"');
  });

  it("abrir llega con el año, el plazo y la ventana de la configuración; prorrogar pide días y motivo; cerrar dice qué queda sin revisar", () => {
    const abrir = renderToStaticMarkup(<FormularioAbrir anio={2026} anioMinimo={2025} anioMaximo={2027} plazoDias={60} ventanaMeses={6} alCerrar={() => {}} />);
    expect(campo(abrir, "anio")).toMatch(/min="2025" max="2027".*value="2026"/);
    expect(campo(abrir, "plazoDias")).toMatch(/min="7" max="365".*value="60"/);
    expect(campo(abrir, "ventanaMeses")).toMatch(/min="0" max="24".*value="6"/);
    const prorrogar = renderToStaticMarkup(<FormularioProrrogar revisionId={4} anio={2026} venceTexto="31 dic 2026" alCerrar={() => {}} />);
    expect(prorrogar).toContain('<input type="hidden" name="revisionId" value="4"/>');
    expect(prorrogar).toContain("Hoy vence el 31 dic 2026.");
    expect(campo(prorrogar, "motivo")).toMatch(/required="" minLength="5" maxLength="500"/);
    expect(campo(prorrogar, "dias")).toMatch(/min="1" max="365"/);
    expect(sinEtiquetas(renderToStaticMarkup(<CuerpoCerrar anio={2026} documentos={124} pendientes={2} />))).toContain("Quedarán sin revisar 2 documentos");
    expect(sinEtiquetas(renderToStaticMarkup(<CuerpoCerrar anio={2026} documentos={124} pendientes={0} />))).toContain("Quedarán sin revisar Ninguno");
  });
});

// ── Las páginas, contra la BD de desarrollo en una transacción que se revierte ──

const sql = obtenerSql();
let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-revision-anual-pantallas-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

const ABRE = new Date("2090-03-10T15:00:00Z");
const CIERRA = new Date("2090-04-09T15:00:00Z");
type Consulta = Record<string, string>;

/** Pinta `pagina` con la conexión de la prueba y la sesión dada. */
async function pintar(tx: TransactionSql, sesion: SesionFlujo, pagina: () => Promise<React.ReactElement>): Promise<string> {
  contexto.tx = tx;
  contexto.sesion = sesion;
  try {
    return renderToStaticMarkup(await pagina());
  } finally {
    contexto.tx = null;
    contexto.sesion = null;
  }
}

const pestana = (consulta: Consulta = {}) => () => PaginaRevisionAnual({ searchParams: Promise.resolve(consulta) });
const revisionPagina = (id: number | string) => () => PaginaDeRevision({ params: Promise.resolve({ id: String(id) }) });

async function procesoDe(tx: TransactionSql, sigla: string): Promise<{ id: number; nombre: string }> {
  const [p] = await tx`SELECT id, nombre FROM procesos WHERE sigla = ${sigla}`;
  return { id: Number(p.id), nombre: p.nombre as string };
}

/**
 * Una campaña de 2090 abierta dentro de la transacción, con un documento de GTH aprobado hace mucho (por decidir) y un
 * líder de GTH, una Gerencia, un Control Interno y una Consulta de prueba.
 */
async function campana(tx: TransactionSql) {
  const admin = await sesionAdmin(tx);
  const gth = await procesoDe(tx, "GTH");
  const cex = await procesoDe(tx, "CEX");
  const doc = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: "GTH" });
  const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [gth.id] });
  const gerencia = await usuarioDePrueba(tx, { rol: "gerencia" });
  const control = await usuarioDePrueba(tx, { rol: "control_interno" });
  const consulta = await usuarioDePrueba(tx, { rol: "consulta" });
  const { revisionId } = await revisionDePrueba(tx, admin, { ahora: ABRE });
  return { admin, gth, cex, doc, lider, gerencia, control, consulta, revisionId };
}

async function cerrar(tx: TransactionSql, admin: SesionFlujo, revisionId: number) {
  await tx`INSERT INTO configuracion (clave, valor) VALUES ('nombre_entidad', 'Entidad de la prueba')
    ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`;
  await cerrarRevision(admin, { revisionId, credenciales: { clave: "ok" } }, { sql: tx, ahora: CIERRA, verificar: firmaDePrueba });
}

describe("/vigencia/revision-anual con la campaña abierta", () => {
  it("el Admin SGC ve el avance con prorrogar y cerrar; con ?proceso= decide sobre sus documentos y confirma su normograma", () =>
    revertida(sql, async (tx) => {
      const c = await campana(tx);
      try {
        const html = await pintar(tx, c.admin, pestana());
        expect(html).toContain("Revisión anual 2090");
        expect(html).toContain("Documentos con decisión");
        expect(html).toContain("Prorrogar…");
        expect(html).toContain("Cerrar y generar informe");
        expect(html).toContain(`href="/vigencia/revision-anual/${c.revisionId}"`);
        expect(html).toContain(`href="/vigencia/revision-anual?proceso=${c.gth.id}#proceso-${c.gth.id}"`);
        // Sin ?proceso=, el avance; los documentos, en la página del proceso.
        expect(html).not.toContain(c.doc.codigo);

        const delProceso = await pintar(tx, c.admin, pestana({ proceso: String(c.gth.id) }));
        expect(delProceso).toContain(`Revisión anual 2090 · ${c.gth.nombre}`);
        expect(delProceso).toContain(c.doc.codigo);
        expect(delProceso).toContain(`tipo=modificar&amp;motivo=revision_anual&amp;revision=${c.revisionId}`);
        expect(delProceso).toContain("Ratificar sin cambios");
        expect(delProceso).toContain(`Normograma de ${c.gth.nombre}`);
        expect(delProceso).toContain(`aria-label="Sin novedad en el normograma de ${c.gth.nombre}"`);
        // Un proceso que no está en la revisión, o un valor que no es un id, se ignora.
        expect(await pintar(tx, c.admin, pestana({ proceso: "abc" }))).not.toContain(c.doc.codigo);
      } finally {
        await c.doc.limpiar();
      }
    }));

  it("el líder ve y decide solo en sus procesos, con sus cifras; Gerencia y Control Interno lo ven todo sin botones; Consulta no la ve", () =>
    revertida(sql, async (tx) => {
      const c = await campana(tx);
      try {
        const lider = await pintar(tx, c.lider, pestana());
        expect(lider).toContain(`Revisión anual 2090 · ${c.gth.nombre}`);
        expect(lider).toContain(c.doc.codigo);
        expect(lider).toContain("Ratificar sin cambios");
        expect(lider).toContain("de sus procesos con decisión");
        expect(lider).toContain(`href="/vigencia/revision-anual/${c.revisionId}"`);
        // Nada de la entidad: ni el avance por proceso, ni otro proceso, ni gestionar la campaña.
        for (const ajeno of ["Documentos con decisión", "Avance por proceso", c.cex.nombre, "Prorrogar…", "Cerrar y generar informe"]) {
          expect(lider).not.toContain(ajeno);
        }

        for (const quien of [c.gerencia, c.control]) {
          const html = await pintar(tx, quien, pestana({ proceso: String(c.gth.id) }));
          expect(html).toContain("Documentos con decisión");
          expect(html).toContain(c.doc.codigo);
          expect(html).toContain("Pendiente");
          for (const boton of ["Prorrogar…", "Cerrar y generar informe", "Ratificar sin cambios", "tipo=modificar", "Sin novedad en el normograma"]) {
            expect(html).not.toContain(boton);
          }
        }
        await expect(pintar(tx, c.consulta, pestana())).rejects.toThrow("no encontrada");
      } finally {
        await c.doc.limpiar();
      }
    }));

  it("un externo por decidir se ratifica verificándolo en la tabla, a quien puede verificarlo", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const externo = await externoDePrueba(tx, admin, { proceso: "CEX", edicion: "2017", ahora: new Date("2089-01-10T15:00:00Z") });
      try {
        const { revisionId } = await revisionDePrueba(tx, admin, { ahora: ABRE });
        const html = await pintar(tx, admin, pestana({ proceso: String(externo.procesoId) }));
        const fila = tarjeta(html, externo.codigo);
        expect(fila).toContain(`aria-label="Ratificar ${externo.codigo}: registrar la verificación «sigue vigente»"`);
        expect(fila).toContain(`href="/vigencia/externos/${externo.documentoId}?verificar=edicion_nueva"`);
        expect(fila).not.toContain("/tramites/nueva");
        expect(revisionId).toBeGreaterThan(0);
      } finally {
        await externo.limpiar();
      }
    }));
});

describe("/vigencia/revision-anual sin campaña abierta", () => {
  it("muestra la última cerrada con su enlace, el PDF a quien ve el informe y, a quien gestiona, abrir la del año", () =>
    revertida(sql, async (tx) => {
      const c = await campana(tx);
      vi.useFakeTimers({ toFake: ["Date"], now: new Date("2091-02-01T15:00:00Z") });
      try {
        await cerrar(tx, c.admin, c.revisionId);
        const admin = await pintar(tx, c.admin, pestana());
        expect(admin).toContain("Revisión anual 2090");
        expect(admin).toContain(`href="/vigencia/revision-anual/${c.revisionId}"`);
        expect(admin).toContain(`href="/vigencia/revision-anual/${c.revisionId}/informe"`);
        expect(admin).toContain("Abrir la revisión anual 2091");

        const lider = await pintar(tx, c.lider, pestana());
        expect(lider).toContain(`href="/vigencia/revision-anual/${c.revisionId}"`);
        expect(lider).not.toContain("/informe");
        expect(lider).not.toContain("Abrir la revisión anual");
      } finally {
        vi.useRealTimers();
        await c.doc.limpiar();
      }
    }));
});

describe("/vigencia/revision-anual/[id]", () => {
  it("cerrada: Gerencia ve el informe congelado con su PDF; el líder, la sección de su proceso; Consulta, no encontrada", () =>
    revertida(sql, async (tx) => {
      const c = await campana(tx);
      try {
        await cerrar(tx, c.admin, c.revisionId);
        const gerencia = await pintar(tx, c.gerencia, revisionPagina(c.revisionId));
        expect(gerencia).toContain("Revisión anual 2090");
        expect(gerencia).toContain(`href="/vigencia/revision-anual/${c.revisionId}/informe"`);
        expect(gerencia).toContain("Informe en PDF");
        expect(gerencia).toContain(c.doc.codigo);
        expect(gerencia).toContain("Sin revisar");
        expect(gerencia).toContain("Estado al cierre");
        expect(gerencia).toContain(c.cex.nombre);

        const lider = await pintar(tx, c.lider, revisionPagina(c.revisionId));
        expect(lider).toContain(`Revisión anual 2090 · ${c.gth.nombre}`);
        expect(lider).toContain(c.doc.codigo);
        expect(lider).toContain("Sin revisar");
        for (const ajeno of ["Informe en PDF", "/informe", c.cex.nombre, "Ratificar sin cambios", "Sin novedad en el normograma"]) {
          expect(lider).not.toContain(ajeno);
        }

        await expect(pintar(tx, c.consulta, revisionPagina(c.revisionId))).rejects.toThrow("no encontrada");
        await expect(pintar(tx, c.gerencia, revisionPagina("abc"))).rejects.toThrow("no encontrada");
        await expect(pintar(tx, c.gerencia, revisionPagina(999_999_999))).rejects.toThrow("no encontrada");
      } finally {
        await c.doc.limpiar();
      }
    }));

  it("abierta: el informe parcial de hoy, que dice «pendiente» y no tiene PDF", () =>
    revertida(sql, async (tx) => {
      const c = await campana(tx);
      try {
        const html = await pintar(tx, c.admin, revisionPagina(c.revisionId));
        expect(html).toContain("Informe parcial");
        expect(html).toContain("Pendientes");
        expect(html).toContain("Estado hoy");
        expect(html).not.toContain("Sin revisar");
        expect(html).not.toContain("/informe");
      } finally {
        await c.doc.limpiar();
      }
    }));
});

describe("la solicitud prellenada", () => {
  const nueva = (consulta: Consulta) => () => PaginaNuevaSolicitud({ searchParams: Promise.resolve(consulta) });

  it("desde la revisión abierta llega enlazada y con el tipo y el motivo; una revisión que no es la abierta se ignora", () =>
    revertida(sql, async (tx) => {
      const c = await campana(tx);
      try {
        const consulta = { documento: c.doc.codigo, tipo: "eliminar", motivo: "revision_anual", revision: String(c.revisionId) };
        const html = await pintar(tx, c.lider, nueva(consulta));
        expect(campo(html, "revisionAnualId")).toContain(`value="${c.revisionId}"`);
        expect(html).toContain("Esta solicitud nace de la revisión anual 2090");
        expect(campo(html, "tipo", "eliminar")).toContain('checked=""');
        expect(html).toMatch(/<option[^>]*value="revision_anual"[^>]*selected=""|<option[^>]*selected=""[^>]*value="revision_anual"/);

        for (const revision of ["999999999", "abc"]) {
          const ignorada = await pintar(tx, c.lider, nueva({ ...consulta, revision }));
          expect(ignorada).not.toContain('name="revisionAnualId"');
          expect(ignorada).not.toContain("nace de la revisión anual");
        }
      } finally {
        await c.doc.limpiar();
      }
    }));

  it("con el impacto del documento lo manda oculto; el de otro documento o el de un proceso ajeno se ignora", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const gth = await procesoDe(tx, "GTH");
      const cex = await procesoDe(tx, "CEX");
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [gth.id] });
      const doc = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "GTH" });
      const otro = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "GTH" });
      try {
        const n = await normaDePrueba(tx, admin);
        await enlazarDocumento(admin, { normaId: n.id, documentoId: doc.id }, { sql: tx });
        await asociarProceso(admin, { normaId: n.id, procesoId: cex.id, requisito: null }, { sql: tx });
        const { cambioId } = await cambiarEstadoNorma(admin, { normaId: n.id, estado: "derogada", fecha: "2026-11-01", nota: null }, { sql: tx, ahora: AHORA });
        const impactos = await tx`SELECT id, documento_id FROM impactos_normativos WHERE cambio_id = ${cambioId} ORDER BY id`;
        const delDocumento = Number(impactos.find((i) => i.documento_id !== null)!.id);
        const deCex = Number(impactos.find((i) => i.documento_id === null)!.id);

        const html = await pintar(tx, lider, nueva({ documento: doc.codigo, motivo: "cambio_normativo", impacto: String(delDocumento) }));
        expect(campo(html, "impactoId")).toContain(`value="${delDocumento}"`);
        expect(html).toContain(`Esta solicitud atiende el cambio de ${n.nombre}`);

        const deOtro = await pintar(tx, lider, nueva({ documento: otro.codigo, motivo: "cambio_normativo", impacto: String(delDocumento) }));
        expect(deOtro).not.toContain('name="impactoId"');
        const ajeno = await pintar(tx, lider, nueva({ tipo: "crear", proceso: String(cex.id), motivo: "cambio_normativo", impacto: String(deCex) }));
        expect(ajeno).not.toContain('name="impactoId"');
        // El Admin SGC sí ve el impacto de CEX: la creación en ese proceso llega enlazada.
        const delAdmin = await pintar(tx, admin, nueva({ tipo: "crear", proceso: String(cex.id), motivo: "cambio_normativo", impacto: String(deCex) }));
        expect(campo(delAdmin, "impactoId")).toContain(`value="${deCex}"`);
        expect(campo(delAdmin, "tipo", "crear")).toContain('checked=""');
      } finally {
        await doc.limpiar();
        await otro.limpiar();
      }
    }));

  it("el trámite dice de dónde nació, bajo el motivo", () =>
    revertida(sql, async (tx) => {
      const c = await campana(tx);
      try {
        const { tramiteId } = await crearSolicitud(
          c.lider,
          { tipo: "modificar", motivo: "revision_anual", justificacion: "Se actualiza en la revisión anual.", documentoId: c.doc.id, revisionAnualId: c.revisionId },
          { sql: tx, ahora: ABRE },
        );
        expect(await origenDeTramite(tramiteId, { sql: tx })).toBe("Abierto desde la revisión anual 2090");
        const tramite = (await obtenerTramite(tramiteId, c.lider, { sql: tx }))!;
        const html = renderToStaticMarkup(<BloqueSolicitud tramite={tramite} origen="Abierto desde la revisión anual 2090" />);
        expect(sinEtiquetas(html)).toContain("Motivo Revisión anual Abierto desde la revisión anual 2090");
        expect(sinEtiquetas(renderToStaticMarkup(<BloqueSolicitud tramite={tramite} />))).not.toContain("Abierto desde");
        expect(await origenDeTramite(999_999_999, { sql: tx })).toBeNull();
      } finally {
        await c.doc.limpiar();
      }
    }));
});

describe("la página del externo con ?verificar=", () => {
  it("abre la verificación con el resultado pedido; un valor desconocido se ignora", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const externo = await externoDePrueba(tx, admin, { proceso: "CEX", edicion: "2017" });
      const pagina = (consulta: Consulta) => () =>
        PaginaDelExterno({ params: Promise.resolve({ id: String(externo.documentoId) }), searchParams: Promise.resolve(consulta) });
      try {
        expect(campo(await pintar(tx, admin, pagina({ verificar: "edicion_nueva" })), "resultado", "edicion_nueva")).toContain('checked=""');
        expect(campo(await pintar(tx, admin, pagina({ verificar: "retirado" })), "resultado", "retirado")).toContain('checked=""');
        const desconocido = await pintar(tx, admin, pagina({ verificar: "__proto__" }));
        expect(campo(desconocido, "resultado", "vigente")).toContain('checked=""');
      } finally {
        await externo.limpiar();
      }
    }));
});
