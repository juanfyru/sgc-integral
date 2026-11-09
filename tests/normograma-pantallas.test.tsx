/**
 * Las pantallas del normograma (spec 13C §10.6, §10.5 y §14): la lista con sus filtros, la ficha de una norma, los
 * formularios, la página de impactos, «Normas aplicables» del proceso, el grupo «Normas» de la búsqueda, la marca de
 * cambio normativo de la ficha del documento y la verificación de un externo pedida desde un impacto. Las piezas puras se
 * pintan con datos de muestra; las páginas, contra la BD de desarrollo dentro de una transacción que se revierte, con la
 * sesión y la conexión de la prueba.
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
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => "/normograma",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/app/acciones-normograma", () => ({
  crearNormaAccion: vi.fn(),
  editarNormaAccion: vi.fn(),
  cambiarEstadoNormaAccion: vi.fn(),
  retirarNormaAccion: vi.fn(),
  borrarNormaAccion: vi.fn(),
  registrarRelacionAccion: vi.fn(),
  eliminarRelacionAccion: vi.fn(),
  crearTipoNormaAccion: vi.fn(),
  editarTipoNormaAccion: vi.fn(),
  moverTipoNormaAccion: vi.fn(),
  alternarTipoNormaAccion: vi.fn(),
  asociarProcesoAccion: vi.fn(),
  desasociarProcesoAccion: vi.fn(),
  enlazarDocumentoAccion: vi.fn(),
  desenlazarDocumentoAccion: vi.fn(),
  resolverImpactoAccion: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
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

import PaginaDocumentoAdmin from "@/app/(app)/admin/(panel)/documentos/[codigo]/page";
import PaginaBuscar from "@/app/(app)/buscar/page";
import FichaDocumento from "@/app/(app)/documentos/[codigo]/page";
import PaginaEditarNorma from "@/app/(app)/normograma/[id]/editar/page";
import PaginaNorma from "@/app/(app)/normograma/[id]/page";
import PaginaImpactosDelCambio from "@/app/(app)/normograma/impactos/[cambioId]/page";
import PaginaNuevaNorma from "@/app/(app)/normograma/nueva/page";
import PaginaNormograma from "@/app/(app)/normograma/page";
import VistaProceso from "@/app/(app)/procesos/[slug]/page";
import PaginaExterno from "@/app/(app)/vigencia/externos/[id]/page";
import { ZonaCarga } from "@/componentes/admin/ZonaCarga";
import { AsociarProceso } from "@/componentes/normograma/AsociarProceso";
import { FormularioEstado } from "@/componentes/normograma/DialogoEstado";
import { DialogoRelacion, FormularioRelacion } from "@/componentes/normograma/DialogoRelacion";
import { EnlazarDocumento } from "@/componentes/normograma/EnlazarDocumento";
import { FormularioNorma } from "@/componentes/normograma/FormularioNorma";
import { NormasAplicables } from "@/componentes/normograma/NormasAplicables";
import { NormasEnlazadas } from "@/componentes/normograma/NormasEnlazadas";
import { TablaNormas, type FilaDeTabla } from "@/componentes/normograma/TablaNormas";
import { BloqueVigencia } from "@/componentes/vigencia/BloqueVigencia";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { asociarProceso, enlazarDocumento, normasDeProceso } from "@/db/consultas/normograma/asociaciones";
import { resolverImpacto } from "@/db/consultas/normograma/impactos";
import { cambiarEstadoNorma, retirarNorma } from "@/db/consultas/normograma/normas";
import { eliminarRelacion, registrarRelacion } from "@/db/consultas/normograma/relaciones";
import {
  EsquemaAsociarProceso,
  EsquemaEnlazarDocumento,
  EsquemaEstadoNorma,
  EsquemaNorma,
  EsquemaRelacion,
} from "@/lib/esquemas/normograma";
import type { SesionValida } from "@/lib/sesion";
import { normaDePrueba } from "./utiles/normograma";
import { sesionAdmin, sesionDe, tramiteEn, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { externoDePrueba, procesoSinLider, vigenteFuera } from "./utiles/vigencia";

const sql = obtenerSql();
const ahora = new Date("2026-11-08T15:00:00Z");

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-normograma-pantallas-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

const sinEtiquetas = (html: string) => html.replace(/<[^>]+>/g, " ").replaceAll("&quot;", '"').replaceAll("&amp;", "&").replace(/\s+/g, " ");
/** Los `name` de los campos que viajan en el formulario, sin repetir. */
const nombres = (html: string) => [...new Set([...html.matchAll(/<(?:input|select|textarea)[^>]*\sname="([^"]+)"/g)].map((m) => m[1]))].sort();
const veces = (texto: string, parte: string) => texto.split(parte).length - 1;
/** Las claves de un esquema estricto, ordenadas: lo que el formulario debe enviar, ni más ni menos. */
const claves = (esquema: { shape: Record<string, unknown> }, ...extra: string[]) => [...Object.keys(esquema.shape), ...extra].sort();

// ── Piezas puras ──

const fila: FilaDeTabla = {
  id: 7,
  nombre: "Resolución 2003 de 2014",
  titulo: "Habilitación de prestadores (anterior)",
  entidadEmisora: "Ministerio de Salud y Protección Social",
  estado: "derogada",
  estadoEn: "2019-11-25",
  anio: 2014,
  tipo: "Resolución",
  procesos: ["Consulta Externa", "Sistema Obligatorio de Garantía de la Calidad"],
  documentos: 2,
  requisito: "Estándar de procesos prioritarios, art. 5",
};

describe("TablaNormas", () => {
  it("pinta «Derogada · 25 nov 2019» en texto, el nombre con su enlace a la ficha, el emisor, los procesos y los documentos", () => {
    const html = renderToStaticMarkup(<TablaNormas filas={[fila, { ...fila, id: 8, nombre: "Ley 1581 de 2012", estado: "vigente", estadoEn: null, procesos: [] }]} />);
    // El formato de fechas de la aplicación (`textoFecha`), como el resto de las pantallas.
    expect(html).toContain("Derogada · 25 nov 2019");
    expect(html).not.toContain("25/11/2019");
    expect(html).toContain('href="/normograma/7"');
    expect(html).toContain("Consulta Externa, Sistema Obligatorio de Garantía de la Calidad");
    expect(sinEtiquetas(html)).toContain("Ley 1581 de 2012");
    expect(html).toContain("Sin procesos asociados");
    // La vigente no lleva fecha; el requisito solo va en el normograma de un proceso.
    expect(html).toMatch(/>Vigente</);
    expect(html).not.toContain("Requisito");
    expect(html).not.toContain(fila.requisito!);
  });

  it("en el normograma del proceso lleva la columna «Requisito»; tabla desde 768 px y una tarjeta por norma debajo, sin opacidad", () => {
    const html = renderToStaticMarkup(<TablaNormas filas={[fila]} conRequisito />);
    expect(html).toContain(">Requisito<");
    expect(html).toContain(fila.requisito);
    expect(html).toContain('class="hidden md:block"');
    expect(html).toMatch(/<ul class="[^"]*md:hidden[^"]*" aria-label="Normas del normograma"/);
    expect(html).not.toContain("opacity");
  });
});

describe("NormasAplicables", () => {
  const normas = Array.from({ length: 7 }, (_, i) => ({ ...fila, id: 100 + i, nombre: `Resolución ${100 + i} de 2020`, requisito: null }));

  it("muestra las primeras cinco con su estado, el enlace «Ver las N en el normograma del proceso» y «Asociar norma» solo si se puede", () => {
    const html = renderToStaticMarkup(<NormasAplicables proceso={{ id: 4, slug: "consulta-externa" }} normas={normas} asociables={[{ id: 9, nombre: "Ley 1581 de 2012", titulo: "Datos personales" }]} />);
    expect(html).toContain("Normas aplicables (7)");
    for (let i = 0; i < 5; i += 1) expect(html).toContain(`href="/normograma/${100 + i}"`);
    expect(html).not.toContain('href="/normograma/105"');
    expect(html).toContain('href="/normograma?proceso=consulta-externa"');
    expect(html).toContain("Ver las 7 en el normograma del proceso");
    expect(html).toContain("Asociar norma");
    // Sin requisito escrito, el título de la norma.
    expect(html).toContain(fila.titulo);

    const lector = renderToStaticMarkup(<NormasAplicables proceso={{ id: 4, slug: "consulta-externa" }} normas={normas.slice(0, 1)} asociables={null} />);
    expect(lector).not.toContain("Asociar norma");
    expect(lector).toContain("Verla en el normograma del proceso");
    expect(renderToStaticMarkup(<NormasAplicables proceso={{ id: 4, slug: "x" }} normas={[]} asociables={null} />)).toContain(
      "Ninguna norma del normograma está asociada a este proceso.",
    );
  });
});

describe("los formularios envían solo lo que su esquema estricto acepta", () => {
  it("la norma: los campos de EsquemaNorma; al editar, también el id de la ruta; la entidad emisora sugiere las ya escritas", () => {
    const alta = renderToStaticMarkup(<FormularioNorma tipos={[{ id: 3, nombre: "Resolución" }]} emisores={["Congreso de la República", "Ministerio de Salud y Protección Social"]} />);
    expect(nombres(alta)).toEqual(claves(EsquemaNorma));
    expect(alta).toMatch(/<input[^>]*list="emisores-sugeridos"/);
    expect(alta).toContain('<datalist id="emisores-sugeridos"><option value="Congreso de la República"></option>');
    expect(alta).toContain("Registrar la norma");
    const edicion = renderToStaticMarkup(
      <FormularioNorma
        norma={{
          id: 7,
          tipoNormaId: 3,
          numero: "3100",
          anio: 2019,
          fechaExpedicion: "2019-11-25",
          entidadEmisora: "Ministerio de Salud y Protección Social",
          titulo: "Habilitación",
          tema: null,
          enlaceOficial: "minsalud.gov.co",
          notas: null,
        }}
        tipos={[{ id: 3, nombre: "Resolución" }]}
        emisores={[]}
      />,
    );
    // El `id` de la ruta se lee aparte (`omitir: ["id"]`).
    expect(nombres(edicion)).toEqual(claves(EsquemaNorma, "id"));
    expect(edicion).toMatch(/<input[^>]*name="numero"[^>]*value="3100"|<input[^>]*value="3100"[^>]*name="numero"/);
  });

  it("el estado (sin «Retirada»: eso es «Retirar…»), la relación, la asociación y el enlace", () => {
    const estado = renderToStaticMarkup(<FormularioEstado normaId={7} nombre="Resolución 3100 de 2019" estado="vigente" hoy="2026-11-08" alCerrar={() => {}} />);
    expect(nombres(estado)).toEqual(claves(EsquemaEstadoNorma));
    expect(estado).toContain('value="derogada"');
    expect(estado).not.toContain('value="retirada"');
    expect(estado).not.toContain('value="vigente"');

    const relacion = renderToStaticMarkup(
      <FormularioRelacion normaId={7} nombre="Resolución 3100 de 2019" normas={[{ id: 8, nombre: "Resolución 2003 de 2014", titulo: "Anterior" }]} alCerrar={() => {}} />,
    );
    expect(nombres(relacion)).toEqual(claves(EsquemaRelacion));
    for (const tipo of ["modifica", "deroga", "reglamenta"]) expect(relacion).toContain(`value="${tipo}"`);

    expect(nombres(renderToStaticMarkup(<AsociarProceso normaId={7} procesos={[{ id: 4, nombre: "Consulta Externa", sigla: "CEX" }]} />))).toEqual(
      claves(EsquemaAsociarProceso),
    );
    expect(nombres(renderToStaticMarkup(<AsociarProceso procesoId={4} normas={[{ id: 7, nombre: "Resolución 3100 de 2019", titulo: "Habilitación" }]} />))).toEqual(
      claves(EsquemaAsociarProceso),
    );
    expect(nombres(renderToStaticMarkup(<AsociarProceso normaId={7} procesoId={4} requisito="art. 5" proceso="Consulta Externa" />))).toEqual(
      claves(EsquemaAsociarProceso),
    );
    expect(
      nombres(renderToStaticMarkup(<EnlazarDocumento normaId={7} documentos={[{ id: 3, codigo: "CEX-PR-02", titulo: "Atención", origen: "interno", enlazado: false }]} />)),
    ).toEqual(claves(EsquemaEnlazarDocumento));
  });

  it("«Registrar relación» sin normas que puedan ser la afectada dice por qué está deshabilitado", () => {
    const sinCandidatas = renderToStaticMarkup(<DialogoRelacion normaId={7} nombre="Resolución 3100 de 2019" normas={[]} />);
    expect(sinCandidatas).toMatch(/<button[^>]*aria-describedby="relacion-7-sin-normas"[^>]*disabled=""/);
    expect(sinCandidatas).toContain('id="relacion-7-sin-normas"');
    expect(sinEtiquetas(sinCandidatas)).toContain("No hay otra norma vigente o modificada que pueda ser la afectada.");
    const conCandidatas = renderToStaticMarkup(
      <DialogoRelacion normaId={7} nombre="Resolución 3100 de 2019" normas={[{ id: 8, nombre: "Resolución 2003 de 2014", titulo: "Anterior" }]} />,
    );
    expect(conCandidatas).not.toContain("No hay otra norma");
    expect(conCandidatas).not.toContain('disabled=""');
  });

  it("la zona de carga del PDF de la norma habla de un PDF, no de «archivos»", () => {
    const html = renderToStaticMarkup(<ZonaCarga direccion="/api/normas/7/archivos" soloPdf />);
    expect(html).toContain('aria-label="Zona de carga: arrastre el PDF o presione para elegirlo"');
    expect(sinEtiquetas(html)).toContain("Arrastre el PDF aquí");
    expect(html).not.toContain("archivos aquí");
    expect(html).not.toContain("arrastre archivos");
    // Las demás zonas siguen igual.
    expect(renderToStaticMarkup(<ZonaCarga direccion="/admin/api/archivos?versionId=1" />)).toContain(
      'aria-label="Zona de carga: arrastre archivos o presione para elegirlos"',
    );
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

const ficha = (id: number | string) => () => PaginaNorma({ params: Promise.resolve({ id: String(id) }) });
const conConsulta = (q: Record<string, string>) => ({ searchParams: Promise.resolve(q) });
const procesoDe = async (tx: TransactionSql, sigla: string) => {
  const [p] = await tx`SELECT id, nombre, slug FROM procesos WHERE sigla = ${sigla}`;
  return { id: Number(p.id), nombre: p.nombre as string, slug: p.slug as string };
};

describe("la ficha de la norma", () => {
  /** Una norma con un documento general, uno restringido (GTH) y un externo enlazados, una relación y un proceso. */
  async function normaCompleta(tx: TransactionSql) {
    const admin = await sesionAdmin(tx);
    const liderCex = await sesionDe(tx, "lider.cex");
    const anterior = await normaDePrueba(tx, admin, { titulo: "Habilitación de prestadores (anterior)" });
    const n = await normaDePrueba(tx, admin, {
      titulo: "Procedimientos y condiciones de habilitación",
      tema: "Habilitación de prestadores de servicios de salud",
      enlaceOficial: "https://www.minsalud.gov.co/Normatividad/3100",
      notas: "Revisar con Gestión Jurídica.",
    });
    const { relacionId } = await registrarRelacion(admin, { normaId: n.id, afectadaId: anterior.id, tipo: "deroga", detalle: "Toda la resolución" }, { sql: tx, ahora });
    const cex = await procesoDe(tx, "CEX");
    await asociarProceso(admin, { normaId: n.id, procesoId: cex.id, requisito: "Estándar de procesos prioritarios, art. 5" }, { sql: tx });
    const publico = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "GTH" });
    const restringido = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "GTH" });
    await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${restringido.id}`;
    const externo = await externoDePrueba(tx, liderCex, { proceso: "CEX", edicion: "2017" });
    for (const documentoId of [publico.id, restringido.id, externo.documentoId]) {
      await enlazarDocumento(admin, { normaId: n.id, documentoId }, { sql: tx });
    }
    const limpiar = async () => {
      await publico.limpiar();
      await restringido.limpiar();
      await externo.limpiar();
    };
    return { admin, anterior, n, relacionId, cex, publico, restringido, externo, limpiar };
  }

  it("a Consulta le oculta el código y el título de un documento restringido y a Gerencia se los muestra; el enlace oficial es texto", () =>
    revertida(sql, async (tx) => {
      const c = await normaCompleta(tx);
      try {
        const consulta = await usuarioDePrueba(tx, { rol: "consulta" });
        const html = await pintar(tx, consulta, ficha(c.n.id));
        const texto = sinEtiquetas(html);
        expect(texto).toContain(c.publico.codigo);
        expect(texto).toContain(c.externo.codigo);
        expect(html).not.toContain(c.restringido.codigo);
        // Lo que la persona no puede ver no existe para ella: ni se nombra ni se cuenta (decisión del controlador, R4).
        expect(texto).not.toContain("que usted no puede ver");
        expect(texto).not.toMatch(/restringid/i);
        expect(html).toContain(`href="/documentos/${c.publico.codigo.toLowerCase()}"`);
        // Datos, relación, proceso con su requisito.
        for (const parte of [c.n.nombre, "Habilitación de prestadores de servicios de salud", "Revisar con Gestión Jurídica.", "Toda la resolución", "Estándar de procesos prioritarios, art. 5"]) {
          expect(texto).toContain(parte);
        }
        expect(texto).toContain(`Deroga a ${c.anterior.nombre}`);
        expect(texto).toContain("Sin PDF adjunto");
        // El enlace oficial se muestra como texto, nunca como hipervínculo hacia fuera.
        expect(html).toContain("https://www.minsalud.gov.co/Normatividad/3100");
        expect(html).not.toMatch(/href="https?:\/\//);
        // Quien solo lee no ve acciones.
        for (const accion of ["Editar", "Cambiar estado", "Registrar relación", "Retirar…", "Eliminar relación…", "Asociar proceso", "Enlazar documento", "Adjuntar el PDF"]) {
          expect(texto).not.toContain(accion);
        }

        const deGerencia = sinEtiquetas(await pintar(tx, await sesionDe(tx, "gerente"), ficha(c.n.id)));
        expect(deGerencia).toContain(c.restringido.codigo);
        expect(deGerencia).not.toContain("que usted no puede ver");
      } finally {
        await c.limpiar();
      }
    }));

  it("quien administra edita, cambia el estado, relaciona, adjunta el PDF y retira; sin historia, también borra", () =>
    revertida(sql, async (tx) => {
      const c = await normaCompleta(tx);
      try {
        const html = await pintar(tx, c.admin, ficha(c.n.id));
        const texto = sinEtiquetas(html);
        expect(html).toContain(`href="/normograma/${c.n.id}/editar"`);
        for (const accion of ["Cambiar estado", "Registrar relación", "Eliminar relación…", "Retirar…", "Asociar proceso", "Enlazar documento", "Adjuntar el PDF", `Quitar el enlace de ${c.publico.codigo}…`]) {
          expect(texto).toContain(accion);
        }
        expect(texto).not.toContain("Borrar…");

        // Con PDF: un <a> en otra pestaña (como los demás archivos), no un enlace del enrutador, que pediría el archivo dos veces.
        const [archivo] = await tx`INSERT INTO archivos (contexto, contexto_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
          VALUES ('norma', ${c.n.id}, 'evidencia', ${`zz-pruebas/normas/${c.n.id}/r.pdf`}, 'Resolución.pdf', 'pdf', 'application/pdf', 2048, ${"0".repeat(64)})
          RETURNING id`;
        const conPdf = await pintar(tx, c.admin, ficha(c.n.id));
        const ruta = `/normograma/${c.n.id}/archivos/${archivo.id}/${encodeURIComponent("Resolución.pdf")}`;
        expect(conPdf).toContain(`<a href="${ruta}" target="_blank" rel="noopener"`);
        expect(sinEtiquetas(conPdf)).toContain("Abrir el PDF · 2 KB");

        const vacia = await normaDePrueba(tx, c.admin);
        expect(sinEtiquetas(await pintar(tx, c.admin, ficha(vacia.id)))).toContain("Borrar…");
      } finally {
        await c.limpiar();
      }
    }));

  it("la afectada dice «Derogada por …» y su historial conserva el cambio aunque la relación se elimine después", () =>
    revertida(sql, async (tx) => {
      const c = await normaCompleta(tx);
      try {
        const consulta = await usuarioDePrueba(tx, { rol: "consulta" });
        const antes = sinEtiquetas(await pintar(tx, consulta, ficha(c.anterior.id)));
        expect(antes).toContain(`Derogada por ${c.n.nombre}`);
        expect(antes).toContain("Vigente → Derogada");

        await eliminarRelacion(c.admin, { relacionId: c.relacionId, motivo: "Registrada por error" }, { sql: tx });
        const despues = sinEtiquetas(await pintar(tx, consulta, ficha(c.anterior.id)));
        expect(despues).toContain("No modifica, deroga ni reglamenta otra norma, ni otra la afecta.");
        expect(despues).toContain("Vigente → Derogada");
        expect(despues).toContain(`Derogada por ${c.n.nombre} (relación eliminada después)`);
      } finally {
        await c.limpiar();
      }
    }));

  it("el líder asocia sus procesos y enlaza sus documentos; no ve los de otros procesos ni las acciones de quien administra", () =>
    revertida(sql, async (tx) => {
      const c = await normaCompleta(tx);
      try {
        const liderGth = await sesionDe(tx, "lider.gth");
        const gth = await procesoDe(tx, "GTH");
        // Un proceso activo que el líder de GTH no lidera y que la norma no tiene: no se le ofrece.
        const [ajeno] = await tx`SELECT id FROM procesos WHERE activo AND id <> ${c.cex.id}
          AND id NOT IN (SELECT proceso_id FROM usuario_procesos WHERE usuario_id = ${liderGth.usuarioId}) ORDER BY id LIMIT 1`;
        const html = await pintar(tx, liderGth, ficha(c.n.id));
        const texto = sinEtiquetas(html);
        expect(texto).toContain("Asociar proceso");
        expect(html).toMatch(new RegExp(`<option value="${gth.id}">GTH · `));
        expect(html).not.toMatch(new RegExp(`<option value="${ajeno.id}">`));
        // El documento de GTH que enlazó el Admin SGC: el líder de GTH puede quitar su enlace; el externo de CEX, no.
        expect(texto).toContain(`Quitar el enlace de ${c.publico.codigo}…`);
        expect(texto).not.toContain(`Quitar el enlace de ${c.externo.codigo}…`);
        // El requisito de CEX no es suyo.
        expect(texto).not.toContain("Editar el requisito de Consulta Externa");
        for (const accion of ["Cambiar estado", "Registrar relación", "Retirar…", "Adjuntar el PDF"]) expect(texto).not.toContain(accion);
        expect(html).not.toContain(`href="/normograma/${c.n.id}/editar"`);

        const liderCex = await sesionDe(tx, "lider.cex");
        expect(sinEtiquetas(await pintar(tx, liderCex, ficha(c.n.id)))).toContain("Editar el requisito de Consulta Externa");
      } finally {
        await c.limpiar();
      }
    }));

  it("una retirada conserva su ficha sin acciones; una que no existe o un id inválido son «no encontrada»", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const n = await normaDePrueba(tx, admin);
      await retirarNorma(admin, { normaId: n.id, motivo: "Registrada por error" }, { sql: tx, ahora });
      const texto = sinEtiquetas(await pintar(tx, admin, ficha(n.id)));
      expect(texto).toContain("Retirada · 8 nov 2026");
      expect(texto).toContain("Esta norma fue retirada el 8 nov 2026");
      expect(texto).toContain("Registrada por error");
      for (const accion of ["Editar", "Cambiar estado", "Registrar relación", "Retirar…", "Borrar…", "Asociar proceso"]) expect(texto).not.toContain(accion);
      expect(await falla(tx, admin, ficha(987_654_321))).toBe("NO_ENCONTRADA");
      expect(await falla(tx, admin, ficha("abc"))).toBe("NO_ENCONTRADA");
      expect(await falla(tx, admin, () => PaginaEditarNorma({ params: Promise.resolve({ id: String(n.id) }) }))).toBe("NO_ENCONTRADA");
    }));
});

describe("páginas del normograma", () => {
  it("Consulta lee la lista y descarga el Excel institucional; no registra normas ni ve los tipos ni las retiradas", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const n = await normaDePrueba(tx, admin);
      const numero = n.nombre.split(" ")[1];
      const consulta = await usuarioDePrueba(tx, { rol: "consulta" });
      const html = await pintar(tx, consulta, () => PaginaNormograma(conConsulta({ q: numero })));
      expect(html).toContain(`href="/normograma/${n.id}"`);
      expect(html).toContain(`href="/normograma/excel?q=${numero}"`);
      expect(sinEtiquetas(html)).toContain("Excel institucional");
      for (const texto of ["Nueva norma", "Tipos de norma", "Incluir retiradas"]) expect(sinEtiquetas(html)).not.toContain(texto);
      expect(html).not.toContain('value="retirada"');
      // A 390 px los filtros no desbordan: cada selector cede al ancho disponible.
      for (const id of ["filtro-tipo", "filtro-anio", "filtro-emisor", "filtro-estado", "filtro-proceso"]) {
        expect(html).toMatch(new RegExp(`<select[^>]*id="${id}"[^>]*class="[^"]*\\bw-full\\b[^"]*\\bmin-w-0\\b`));
      }
      // Una retirada no sale, ni pidiendo «incluir retiradas» sin administrar.
      await retirarNorma(admin, { normaId: n.id, motivo: "Registrada por error" }, { sql: tx, ahora });
      expect(await pintar(tx, consulta, () => PaginaNormograma(conConsulta({ q: numero, retiradas: "1" })))).not.toContain(`href="/normograma/${n.id}"`);
      expect(await pintar(tx, admin, () => PaginaNormograma(conConsulta({ q: numero, retiradas: "1" })))).toContain(`href="/normograma/${n.id}"`);
    }));

  it("quien administra ve «Nueva norma», los tipos de norma al pie y «Incluir retiradas»", () =>
    revertida(sql, async (tx) => {
      const texto = sinEtiquetas(await pintar(tx, await sesionAdmin(tx), () => PaginaNormograma(conConsulta({}))));
      for (const parte of ["Nueva norma", "Tipos de norma", "Nuevo tipo de norma", "Incluir retiradas", "Renombrar Resolución"]) expect(texto).toContain(parte);
    }));

  it("con ?proceso=<slug> es el normograma del proceso: su título, la columna «Requisito» y su Excel; un proceso que no existe es «no encontrado»", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const cex = await procesoDe(tx, "CEX");
      const n = await normaDePrueba(tx, admin);
      await asociarProceso(admin, { normaId: n.id, procesoId: cex.id, requisito: "Autoevaluación anual" }, { sql: tx });
      const consulta = await usuarioDePrueba(tx, { rol: "consulta" });
      const html = await pintar(tx, consulta, () => PaginaNormograma(conConsulta({ proceso: cex.slug })));
      const texto = sinEtiquetas(html);
      expect(texto).toContain(`Normograma de ${cex.nombre}`);
      expect(html).toContain(">Requisito<");
      expect(texto).toContain("Autoevaluación anual");
      expect(texto).toContain("Excel del proceso");
      expect(html).toContain(`href="/normograma/excel?proceso=${cex.slug}"`);
      expect(await falla(tx, consulta, () => PaginaNormograma(conConsulta({ proceso: "no-existe" })))).toBe("NO_ENCONTRADA");
    }));

  it("registrar y editar son de quien administra; para los demás no existen", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const n = await normaDePrueba(tx, admin, { entidadEmisora: "Superintendencia Nacional de Salud" });
      for (const quien of [await usuarioDePrueba(tx, { rol: "consulta" }), await sesionDe(tx, "lider.gth"), await sesionDe(tx, "gerente")]) {
        expect(await falla(tx, quien, () => PaginaNuevaNorma())).toBe("NO_ENCONTRADA");
        expect(await falla(tx, quien, () => PaginaEditarNorma({ params: Promise.resolve({ id: String(n.id) }) }))).toBe("NO_ENCONTRADA");
      }
      // Diez emisores que van antes en el orden alfabético: la lista sugerida trae todos, no los diez primeros.
      for (let i = 0; i < 10; i += 1) await normaDePrueba(tx, admin, { entidadEmisora: `Aaa emisor de prueba ${i}` });
      const alta = await pintar(tx, admin, () => PaginaNuevaNorma());
      expect(sinEtiquetas(alta)).toContain("Registrar la norma");
      expect(alta).toContain('<datalist id="emisores-sugeridos">');
      expect(alta).toContain('<option value="Superintendencia Nacional de Salud"></option>');
      const edicion = await pintar(tx, admin, () => PaginaEditarNorma({ params: Promise.resolve({ id: String(n.id) }) }));
      expect(sinEtiquetas(edicion)).toContain(`Editar ${n.nombre}`);
      expect(edicion).toContain('value="Superintendencia Nacional de Salud"');
      expect(edicion).toContain('<option value="Aaa emisor de prueba 9"></option>');
      expect(edicion).toMatch(new RegExp(`<input type="hidden" name="id" value="${n.id}"`));
    }));
});

describe("la página de impactos", () => {
  /** Una norma enlazada a un interno y a un externo de CEX, y asociada a GTH (sin documentos), derogada hoy. */
  async function derogada(tx: TransactionSql) {
    const admin = await sesionAdmin(tx);
    const liderCex = await sesionDe(tx, "lider.cex");
    const cex = await procesoDe(tx, "CEX");
    const gth = await procesoDe(tx, "GTH");
    const n = await normaDePrueba(tx, admin);
    const interno = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "CEX" });
    const externo = await externoDePrueba(tx, liderCex, { proceso: "CEX", edicion: "2017" });
    await enlazarDocumento(admin, { normaId: n.id, documentoId: interno.id }, { sql: tx });
    await enlazarDocumento(admin, { normaId: n.id, documentoId: externo.documentoId }, { sql: tx });
    await asociarProceso(admin, { normaId: n.id, procesoId: gth.id, requisito: null }, { sql: tx });
    const { cambioId } = await cambiarEstadoNorma(admin, { normaId: n.id, estado: "derogada", fecha: "2026-11-01", nota: null }, { sql: tx, ahora });
    const impactos = await tx`SELECT id, documento_id, proceso_id FROM impactos_normativos WHERE cambio_id = ${cambioId} ORDER BY id`;
    const deDocumento = (id: number) => Number(impactos.find((i) => Number(i.documento_id) === id)!.id);
    const deProceso = Number(impactos.find((i) => i.documento_id === null)!.id);
    const limpiar = async () => {
      await interno.limpiar();
      await externo.limpiar();
    };
    return { admin, liderCex, cex, gth, n, interno, externo, cambioId: cambioId!, impactoInterno: deDocumento(interno.id), impactoExterno: deDocumento(externo.documentoId), deProceso, limpiar };
  }
  const pagina = (cambioId: number, proceso: number | string) => () =>
    PaginaImpactosDelCambio({ params: Promise.resolve({ cambioId: String(cambioId) }), searchParams: Promise.resolve({ proceso: String(proceso) }) });

  it("muestra «Verificar el externo» para un externo y «Abrir solicitud de cambio» para un interno, con «No afecta…» en los dos", () =>
    revertida(sql, async (tx) => {
      const d = await derogada(tx);
      try {
        const html = await pintar(tx, d.liderCex, pagina(d.cambioId, d.cex.id));
        const texto = sinEtiquetas(html);
        expect(texto).toContain(`Revisar el impacto de ${d.n.nombre} (derogada) en ${d.cex.nombre}`);
        expect(texto).toContain(`${d.interno.codigo} v1`);
        expect(texto).toContain(d.externo.codigo);
        expect(html).toContain(`href="/vigencia/externos/${d.externo.documentoId}?impacto=${d.impactoExterno}"`);
        expect(html).toContain(
          `href="/tramites/nueva?documento=${encodeURIComponent(d.interno.codigo)}&amp;motivo=cambio_normativo&amp;impacto=${d.impactoInterno}"`,
        );
        // Un externo no tiene trámite: una sola «Abrir solicitud de cambio», la del interno.
        expect(veces(texto, "Verificar el externo")).toBe(1);
        expect(veces(texto, "Abrir solicitud de cambio")).toBe(1);
        expect(veces(texto, "No afecta…")).toBe(2);
        // La página cuenta el plazo con la hora real: vence el 23 nov 2026 (o ya venció, si la prueba corre después).
        expect(texto).toMatch(/Pendiente · (vence el 23 nov 2026|vence hoy|venció hace \d+ días?)/);
        // «No afecta…» envía lo que pide EsquemaResolverImpacto.
        expect(html).toMatch(new RegExp(`<input type="hidden" name="impactoId" value="${d.impactoInterno}"/><input type="hidden" name="resolucion" value="no_afecta"/>`));
        expect(html).toContain(`id="impacto-${d.impactoInterno}-nota"`);
        expect(sinEtiquetas(html)).toContain("Queda en la historia del documento.");
      } finally {
        await d.limpiar();
      }
    }));

  it("el impacto de un proceso sin documentos ofrece «Abrir solicitud de creación» y «No afecta…»; resuelto, dice cómo y por qué", () =>
    revertida(sql, async (tx) => {
      const d = await derogada(tx);
      try {
        const liderGth = await sesionDe(tx, "lider.gth");
        const html = await pintar(tx, liderGth, pagina(d.cambioId, d.gth.id));
        expect(html).toContain(`href="/tramites/nueva?tipo=crear&amp;proceso=${d.gth.id}&amp;motivo=cambio_normativo&amp;impacto=${d.deProceso}"`);
        expect(sinEtiquetas(html)).toContain(`El proceso ${d.gth.nombre}`);
        expect(sinEtiquetas(html)).not.toContain("Abrir solicitud de cambio");
        // Sin documento, la nota queda en el impacto del proceso, no en la historia de un documento.
        expect(sinEtiquetas(html)).toContain("Queda en el impacto del proceso y en la bitácora.");
        expect(sinEtiquetas(html)).not.toContain("historia del documento");

        await resolverImpacto(liderGth, { impactoId: d.deProceso, resolucion: "no_afecta", nota: "Nada del proceso cambia." }, { sql: tx, ahora });
        const resuelto = sinEtiquetas(await pintar(tx, liderGth, pagina(d.cambioId, d.gth.id)));
        expect(resuelto).toContain("Resuelto · No afecta");
        expect(resuelto).toContain("Nada del proceso cambia.");
        expect(resuelto).toContain("Todo está resuelto.");
        expect(resuelto).not.toContain("No afecta…");
      } finally {
        await d.limpiar();
      }
    }));

  it("la ven el líder del proceso y el Admin SGC; el líder de otro proceso, Gerencia y Consulta reciben «no encontrada»", () =>
    revertida(sql, async (tx) => {
      const d = await derogada(tx);
      try {
        expect(sinEtiquetas(await pintar(tx, d.admin, pagina(d.cambioId, d.cex.id)))).toContain("Verificar el externo");
        for (const quien of [await sesionDe(tx, "lider.gth"), await sesionDe(tx, "gerente"), await usuarioDePrueba(tx, { rol: "consulta" })]) {
          expect(await falla(tx, quien, pagina(d.cambioId, d.cex.id))).toBe("NO_ENCONTRADA");
        }
        expect(await falla(tx, d.admin, pagina(d.cambioId, "abc"))).toBe("NO_ENCONTRADA");
        expect(await falla(tx, d.admin, pagina(987_654_321, d.cex.id))).toBe("NO_ENCONTRADA");
      } finally {
        await d.limpiar();
      }
    }));

  it("no muestra el documento que la persona no ve (resolución 7); el Admin SGC lo ve", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const proceso = await procesoSinLider(tx);
      const gth = await procesoDe(tx, "GTH");
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [proceso.id] });
      const visible = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: proceso.sigla });
      const oculto = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: proceso.sigla });
      try {
        await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${oculto.id}`;
        const n = await normaDePrueba(tx, admin);
        for (const documentoId of [visible.id, oculto.id]) await enlazarDocumento(admin, { normaId: n.id, documentoId }, { sql: tx });
        const { cambioId } = await cambiarEstadoNorma(admin, { normaId: n.id, estado: "derogada", fecha: "2026-11-01", nota: null }, { sql: tx, ahora });
        // El restringido pasa a otro proceso después del cambio: su impacto sigue en el del líder, que ya no lo ve.
        await tx`UPDATE documento_proceso SET proceso_id = ${gth.id}, subproceso_id = NULL WHERE documento_id = ${oculto.id} AND es_principal`;

        const html = await pintar(tx, lider, pagina(cambioId!, proceso.id));
        expect(sinEtiquetas(html)).toContain(visible.codigo);
        expect(html).not.toContain(oculto.codigo);
        expect(sinEtiquetas(html)).toContain("1 pendiente de 1.");
        const delAdmin = sinEtiquetas(await pintar(tx, admin, pagina(cambioId!, proceso.id)));
        expect(delAdmin).toContain(oculto.codigo);
        expect(delAdmin).toContain("2 pendientes de 2.");
      } finally {
        await visible.limpiar();
        await oculto.limpiar();
      }
    }));

  it("un interno con un trámite abierto ofrece enlazar ese trámite en lugar de abrir otra solicitud", () =>
    revertida(sql, async (tx) => {
      const t = await tramiteEn(tx, "elaboracion");
      try {
        const admin = await sesionAdmin(tx);
        const [doc] = await tx`SELECT id FROM documentos WHERE codigo = ${t.codigo}`;
        const [tramite] = await tx`SELECT numero FROM tramites WHERE id = ${t.tramiteId}`;
        const gth = await procesoDe(tx, "GTH");
        const n = await normaDePrueba(tx, admin);
        await enlazarDocumento(admin, { normaId: n.id, documentoId: Number(doc.id) }, { sql: tx });
        const { cambioId } = await cambiarEstadoNorma(admin, { normaId: n.id, estado: "modificada", fecha: "2026-11-01", nota: null }, { sql: tx, ahora });
        const html = await pintar(tx, admin, pagina(cambioId!, gth.id));
        const texto = sinEtiquetas(html);
        expect(texto).toContain(`Enlazar el trámite en curso ${tramite.numero}`);
        expect(texto).not.toContain("Abrir solicitud de cambio");
        expect(html).toMatch(new RegExp(`<input type="hidden" name="resolucion" value="solicitud"/><input type="hidden" name="tramiteId" value="${t.tramiteId}"/>`));
      } finally {
        await t.limpiar();
      }
    }));
});

describe("la marca «Revisión por cambio normativo» del bloque Vigencia", () => {
  it("enlaza a la página de impactos para quien la ve (el líder del proceso, el Admin SGC); para los demás es texto", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const gth = await procesoDe(tx, "GTH");
      const n = await normaDePrueba(tx, admin);
      const doc = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "GTH" });
      try {
        await enlazarDocumento(admin, { normaId: n.id, documentoId: doc.id }, { sql: tx });
        const { cambioId } = await cambiarEstadoNorma(admin, { normaId: n.id, estado: "derogada", fecha: "2026-11-01", nota: null }, { sql: tx, ahora });
        const enlace = `href="/normograma/impactos/${cambioId}?proceso=${gth.id}"`;
        const marca = `Revisión por cambio normativo · ${n.nombre}`;
        for (const quien of [await sesionDe(tx, "lider.gth"), admin]) {
          const html = await pintar(tx, quien, () => BloqueVigencia({ documentoId: doc.id, sesion: quien }));
          expect(html).toContain(enlace);
          expect(sinEtiquetas(html)).toContain(marca);
        }
        for (const quien of [await usuarioDePrueba(tx, { rol: "consulta" }), await sesionDe(tx, "gerente")]) {
          const html = await pintar(tx, quien, () => BloqueVigencia({ documentoId: doc.id, sesion: quien }));
          expect(sinEtiquetas(html)).toContain(marca);
          expect(html).not.toContain("/normograma/impactos/");
        }
        // «No afecta…» con nota quita la marca.
        const [impacto] = await tx`SELECT id FROM impactos_normativos WHERE cambio_id = ${cambioId}`;
        await resolverImpacto(admin, { impactoId: Number(impacto.id), resolucion: "no_afecta", nota: "El documento ya cumple." }, { sql: tx, ahora });
        expect(sinEtiquetas(await pintar(tx, admin, () => BloqueVigencia({ documentoId: doc.id, sesion: admin })))).not.toContain("Revisión por cambio normativo");
      } finally {
        await doc.limpiar();
      }
    }));
});

describe("la verificación de un externo pedida desde su impacto", () => {
  it("con ?impacto= de este externo y pendiente, el formulario lo envía y lo dice; con uno ajeno, no", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const liderCex = await sesionDe(tx, "lider.cex");
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const n = await normaDePrueba(tx, admin);
      const externo = await externoDePrueba(tx, liderCex, { proceso: "CEX", edicion: "2017", responsableId: responsable.usuarioId });
      const otro = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "CEX" });
      try {
        await enlazarDocumento(admin, { normaId: n.id, documentoId: externo.documentoId }, { sql: tx });
        await enlazarDocumento(admin, { normaId: n.id, documentoId: otro.id }, { sql: tx });
        const { cambioId } = await cambiarEstadoNorma(admin, { normaId: n.id, estado: "derogada", fecha: "2026-11-01", nota: null }, { sql: tx, ahora });
        const impactos = await tx`SELECT id, documento_id FROM impactos_normativos WHERE cambio_id = ${cambioId}`;
        const suyo = Number(impactos.find((i) => Number(i.documento_id) === externo.documentoId)!.id);
        const ajeno = Number(impactos.find((i) => Number(i.documento_id) === otro.id)!.id);
        const paginaDel = (impacto: number) => () =>
          PaginaExterno({ params: Promise.resolve({ id: String(externo.documentoId) }), searchParams: Promise.resolve({ impacto: String(impacto) }) });

        for (const quien of [liderCex, responsable]) {
          const html = await pintar(tx, quien, paginaDel(suyo));
          expect(html).toMatch(new RegExp(`<input type="hidden" name="impactoId" value="${suyo}"/>`));
          expect(sinEtiquetas(html)).toContain(`Revisión por cambio normativo · ${n.nombre}`);
        }
        expect(await pintar(tx, liderCex, paginaDel(ajeno))).not.toContain('name="impactoId"');
        // Sin la consulta, la página es la de siempre.
        expect(await pintar(tx, liderCex, () => PaginaExterno({ params: Promise.resolve({ id: String(externo.documentoId) }) }))).not.toContain('name="impactoId"');
      } finally {
        await externo.limpiar();
        await otro.limpiar();
      }
    }));
});

describe("«Normas aplicables» en la página del proceso", () => {
  it("el líder del proceso ve sus normas con «Asociar norma»; Consulta las ve sin asociar; el líder de otro proceso tampoco asocia", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const cex = await procesoDe(tx, "CEX");
      const asociada = await normaDePrueba(tx, admin);
      const libre = await normaDePrueba(tx, admin);
      await asociarProceso(admin, { normaId: asociada.id, procesoId: cex.id, requisito: "Estándar de procesos prioritarios" }, { sql: tx });
      const liderCex = await sesionDe(tx, "lider.cex");
      const total = (await normasDeProceso(cex.id, liderCex, { sql: tx })).length;
      const vista = () => VistaProceso({ params: Promise.resolve({ slug: cex.slug }), searchParams: Promise.resolve({}) });

      const html = await pintar(tx, liderCex, vista);
      const texto = sinEtiquetas(html);
      expect(texto).toContain(`Normas aplicables (${total})`);
      expect(html).toContain(`href="/normograma?proceso=${cex.slug}"`);
      expect(texto).toContain("Asociar norma");
      // Ofrece las que aún no aplican al proceso, no la ya asociada.
      expect(html).toMatch(new RegExp(`<option value="${libre.id}">`));
      expect(html).not.toMatch(new RegExp(`<option value="${asociada.id}">`));

      for (const quien of [await usuarioDePrueba(tx, { rol: "consulta" }), await sesionDe(tx, "lider.gth")]) {
        const otro = sinEtiquetas(await pintar(tx, quien, vista));
        expect(otro).toContain(`Normas aplicables (${total})`);
        expect(otro).not.toContain("Asociar norma");
      }
    }));
});

describe("el grupo «Normas» de la búsqueda", () => {
  it("con texto, /buscar muestra las normas que coinciden debajo de los documentos; sin texto, ninguna; una retirada, nunca", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const n = await normaDePrueba(tx, admin, { titulo: "Condiciones de habilitación de prestadores" });
      const retirada = await normaDePrueba(tx, admin);
      await retirarNorma(admin, { normaId: retirada.id, motivo: "Registrada por error" }, { sql: tx, ahora });
      const consulta = await usuarioDePrueba(tx, { rol: "consulta" });
      const numero = n.nombre.split(" ")[1];

      const html = await pintar(tx, consulta, () => PaginaBuscar({ searchParams: Promise.resolve({ q: numero }) }));
      expect(html).toContain('id="titulo-normas"');
      expect(html).toContain(`href="/normograma/${n.id}"`);
      expect(sinEtiquetas(html)).toContain(n.nombre);
      expect(sinEtiquetas(html)).toContain("Condiciones de habilitación de prestadores");
      expect(sinEtiquetas(html)).toMatch(/Normas .*Vigente/);

      const conRetirada = await pintar(tx, consulta, () => PaginaBuscar({ searchParams: Promise.resolve({ q: retirada.nombre.split(" ")[1] }) }));
      expect(conRetirada).not.toContain(`href="/normograma/${retirada.id}"`);
      expect(await pintar(tx, consulta, () => PaginaBuscar({ searchParams: Promise.resolve({}) }))).not.toContain('id="titulo-normas"');
    }));
});

describe("«Normas enlazadas» en la ficha del documento (spec 13C §14.4)", () => {
  it("lista las normas enlazadas con su estado en texto y el enlace a su ficha; de solo lectura; sin normas no se pinta", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const consulta = await usuarioDePrueba(tx, { rol: "consulta" });
      const doc = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "GTH" });
      const solo = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "GTH" });
      try {
        const vigente = await normaDePrueba(tx, admin);
        const derogada = await normaDePrueba(tx, admin);
        for (const normaId of [vigente.id, derogada.id]) await enlazarDocumento(admin, { normaId, documentoId: doc.id }, { sql: tx });
        await cambiarEstadoNorma(admin, { normaId: derogada.id, estado: "derogada", fecha: "2026-11-01", nota: null }, { sql: tx, ahora });

        const html = await pintar(tx, consulta, () => NormasEnlazadas({ documentoId: doc.id, sesion: consulta }));
        const texto = sinEtiquetas(html);
        expect(html).toContain('<h2 id="titulo-normas-enlazadas"');
        expect(texto).toContain("Normas enlazadas (2)");
        expect(html).toContain(`href="/normograma/${vigente.id}"`);
        expect(html).toContain(`href="/normograma/${derogada.id}"`);
        expect(texto).toContain(derogada.nombre);
        expect(texto).toContain("Derogada · 1 nov 2026");
        expect(texto).toMatch(/Vigente/);
        // De solo lectura: enlazar y quitar se hace desde la ficha de la norma.
        expect(html).not.toContain("<form");
        // En el panel va dentro de la ficha con su nivel de título.
        expect(await pintar(tx, admin, () => NormasEnlazadas({ documentoId: doc.id, sesion: admin, nivel: 3 }))).toContain(
          '<h3 id="titulo-normas-enlazadas"',
        );

        expect(await pintar(tx, consulta, () => NormasEnlazadas({ documentoId: solo.id, sesion: consulta }))).toBe("");
      } finally {
        await doc.limpiar();
        await solo.limpiar();
      }
    }));

  it("las dos fichas (portal y panel) la muestran, también la de un externo", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const liderCex = await sesionDe(tx, "lider.cex");
      const doc = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "GTH" });
      const externo = await externoDePrueba(tx, liderCex, { proceso: "CEX", edicion: "2017" });
      try {
        const n = await normaDePrueba(tx, admin);
        for (const documentoId of [doc.id, externo.documentoId]) await enlazarDocumento(admin, { normaId: n.id, documentoId }, { sql: tx });
        for (const codigo of [doc.codigo, externo.codigo]) {
          const portal = await pintar(tx, admin, () =>
            FichaDocumento({ params: Promise.resolve({ codigo: codigo.toLowerCase() }), searchParams: Promise.resolve({}) }),
          );
          expect(portal, codigo).toContain('id="titulo-normas-enlazadas"');
          expect(portal, codigo).toContain(`href="/normograma/${n.id}"`);
          const panel = await pintar(tx, admin, () => PaginaDocumentoAdmin({ params: Promise.resolve({ codigo }) }));
          expect(panel, codigo).toContain('id="titulo-normas-enlazadas"');
          expect(panel, codigo).toContain(`href="/normograma/${n.id}"`);
        }
      } finally {
        await doc.limpiar();
        await externo.limpiar();
      }
    }));
});
