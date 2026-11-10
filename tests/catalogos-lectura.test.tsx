/**
 * Los catálogos de la distribución en solo lectura (spec 13C §12.3): Puntos de uso y Listas de distribución se abren
 * con `distribucion.ver` y, sin `distribucion.gestionar`, se pintan sin botones ni formularios; el líder ve los puntos
 * de sus procesos y las listas completas. Pintadas sobre la BD de desarrollo, dentro de una transacción que se revierte.
 */
import { existsSync } from "node:fs";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const contexto = vi.hoisted(() => ({ tx: null as unknown, sesion: null as unknown }));

vi.mock("@/db/cliente", async (importar) => {
  const real = await importar<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => contexto.tx ?? real.obtenerSql() };
});
vi.mock("@/lib/paginas", () => ({ exigirSesion: async () => contexto.sesion }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("no encontrada");
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/app/admin/acciones-puntos-uso", () => ({
  alternarPuntoUsoAccion: vi.fn(),
  crearPuntoUsoAccion: vi.fn(),
  editarPuntoUsoAccion: vi.fn(),
}));
vi.mock("@/app/admin/acciones-listas", () => ({
  alternarListaAccion: vi.fn(),
  crearListaAccion: vi.fn(),
  editarListaAccion: vi.fn(),
}));

import PaginaListas from "@/app/(app)/admin/(catalogos)/listas-distribucion/page";
import PaginaLista from "@/app/(app)/admin/(catalogos)/listas-distribucion/[id]/page";
import PaginaNuevaLista from "@/app/(app)/admin/(catalogos)/listas-distribucion/nueva/page";
import PaginaPuntos from "@/app/(app)/admin/(catalogos)/puntos-uso/page";
import PaginaPunto from "@/app/(app)/admin/(catalogos)/puntos-uso/[id]/page";
import PaginaNuevoPunto from "@/app/(app)/admin/(catalogos)/puntos-uso/nuevo/page";
import { FormularioLista } from "@/componentes/distribucion/listas/FormularioLista";
import { obtenerSql } from "@/db/cliente";
import { crearLista, type OpcionesFormularioLista } from "@/db/consultas/distribucion/listas";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { puntoDePrueba } from "./utiles/distribucion";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

async function texto(elemento: ReactNode): Promise<string> {
  const flujo = await renderToReadableStream(elemento);
  await flujo.allReady;
  return (await new Response(flujo).text()).replaceAll("<!-- -->", "");
}

/** Las cuatro páginas (y las dos altas) pintadas como `sesion`, leyendo por la transacción del test. */
async function como(tx: TransactionSql, sesion: SesionFlujo, punto: { id: number }, lista: { id: number }) {
  contexto.tx = tx;
  contexto.sesion = sesion;
  const pintar = async (pagina: () => Promise<ReactNode>) => {
    try {
      return await texto(await pagina());
    } catch (err) {
      if ((err as Error).message === "no encontrada") return "NO ENCONTRADA";
      throw err;
    }
  };
  const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
  try {
    return {
      puntos: await pintar(() => PaginaPuntos()),
      punto: await pintar(() => PaginaPunto(params(punto.id))),
      nuevoPunto: await pintar(() => PaginaNuevoPunto({ searchParams: Promise.resolve({}) })),
      listas: await pintar(() => PaginaListas()),
      lista: await pintar(() => PaginaLista(params(lista.id))),
      nuevaLista: await pintar(() => PaginaNuevaLista()),
    };
  } finally {
    contexto.tx = null;
    contexto.sesion = null;
  }
}

async function catalogo(tx: TransactionSql) {
  const admin = await sesionAdmin(tx);
  const [{ id: gth }] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
  const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
  const deGth = await puntoDePrueba(tx, { responsable, procesos: ["GTH"], sede: "Sede de prueba" });
  const deAte = await puntoDePrueba(tx, { responsable, procesos: ["ATE"] });
  const nombreLista = `zz lista catálogo ${Date.now()}`;
  const lista = await crearLista(
    { nombre: nombreLista, descripcion: "Para el catálogo", miembros: [{ tipo: "usuario", referenciaId: responsable.usuarioId }] },
    admin.usuarioId,
    { sql: tx },
  );
  return { admin, gth: Number(gth), responsable, deGth, deAte, lista: { ...lista, nombre: nombreLista } };
}

const SIN_CONTROLES = /<form|<input|<textarea|<select|<button/;

describe("catálogos de la distribución en solo lectura", () => {
  it("Gerencia abre las cuatro páginas sin botones ni formularios; las altas no existen para ella", () =>
    revertida(sql, async (tx) => {
      const c = await catalogo(tx);
      const gerente = await usuarioDePrueba(tx, { rol: "gerencia" });
      const p = await como(tx, gerente, c.deGth, c.lista);

      expect(p.puntos).toContain(c.deGth.nombre);
      expect(p.puntos).toContain(c.deAte.nombre);
      expect(p.puntos).not.toContain("Nuevo punto de uso");
      expect(p.puntos).not.toContain("/admin/puntos-uso/nuevo");
      expect(p.puntos).not.toMatch(SIN_CONTROLES);

      expect(p.punto).toContain(c.deGth.nombre);
      expect(p.punto).toContain("Sede de prueba");
      expect(p.punto).toContain(c.responsable.nombre);
      expect(p.punto).toContain("Gestión del Talento Humano");
      expect(p.punto).toMatch(new RegExp(`<a [^>]*href="/distribucion/copias\\?punto=${c.deGth.id}"`));
      expect(p.punto).not.toContain("Desactivar");
      expect(p.punto).not.toMatch(SIN_CONTROLES);

      expect(p.listas).toContain(c.lista.nombre);
      expect(p.listas).not.toContain("Nueva lista");
      expect(p.listas).not.toContain("/admin/listas-distribucion/nueva");
      expect(p.listas).not.toMatch(SIN_CONTROLES);

      expect(p.lista).toContain(c.lista.nombre);
      expect(p.lista).toContain("Para el catálogo");
      expect(p.lista).toContain(`Persona: ${c.responsable.nombre}`);
      expect(p.lista).toContain("Resuelve hoy a 1 persona");
      expect(p.lista).not.toContain("Desactivar");
      expect(p.lista).not.toMatch(SIN_CONTROLES);

      expect(p.nuevoPunto).toBe("NO ENCONTRADA");
      expect(p.nuevaLista).toBe("NO ENCONTRADA");
    }));

  it("el líder ve solo los puntos de sus procesos y las listas completas; el detalle de otro punto no existe", () =>
    revertida(sql, async (tx) => {
      const c = await catalogo(tx);
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [c.gth] });
      const p = await como(tx, lider, c.deGth, c.lista);
      expect(p.puntos).toContain(c.deGth.nombre);
      expect(p.puntos).not.toContain(c.deAte.nombre);
      expect(p.puntos).not.toMatch(SIN_CONTROLES);
      expect(p.punto).toContain(c.deGth.nombre);
      expect(p.punto).not.toMatch(SIN_CONTROLES);
      expect(p.listas).toContain(c.lista.nombre);
      expect(p.lista).toContain("Resuelve hoy a 1 persona");
      expect(p.lista).not.toMatch(SIN_CONTROLES);

      const ajeno = await como(tx, lider, c.deAte, c.lista);
      expect(ajeno.punto).toBe("NO ENCONTRADA");
    }));

  it("Admin SGC conserva los botones y los formularios", () =>
    revertida(sql, async (tx) => {
      const c = await catalogo(tx);
      const p = await como(tx, c.admin, c.deGth, c.lista);
      expect(p.puntos).toMatch(/<a [^>]*href="\/admin\/puntos-uso\/nuevo"[^>]*>Nuevo punto de uso<\/a>/);
      expect(p.punto).toContain("<form");
      expect(p.punto).toContain("Desactivar");
      expect(p.listas).toMatch(/<a [^>]*href="\/admin\/listas-distribucion\/nueva"[^>]*>Nueva lista<\/a>/);
      expect(p.lista).toContain("<form");
      expect(p.nuevoPunto).toContain("<form");
      expect(p.nuevaLista).toContain("<form");
    }));

  it("quien no tiene distribucion.ver recibe «no encontrado» en todas, aunque responda por el punto", () =>
    revertida(sql, async (tx) => {
      const c = await catalogo(tx);
      const p = await como(tx, c.responsable, c.deGth, c.lista);
      expect(Object.values(p).every((html) => html === "NO ENCONTRADA")).toBe(true);
    }));
});

describe("FormularioLista y el miembro «todos»", () => {
  const opciones: OpcionesFormularioLista = {
    areas: [{ id: 1, nombre: "Urgencias" }],
    cargos: [],
    procesos: [{ id: 2, sigla: "GTH", nombre: "Gestión del Talento Humano" }],
    usuarios: [{ id: 3, nombre: "Ana Pérez", usuario: "ana" }],
  };
  const pintar = (miembros: Parameters<typeof FormularioLista>[0]["valores"]["miembros"]) =>
    renderToStaticMarkup(<FormularioLista accion={vi.fn()} opciones={opciones} valores={{ nombre: "Lista", descripcion: null, miembros }} />);

  /** La casilla de «todos», sea cual sea el orden en que React escribe sus atributos. */
  const casillaTodos = (html: string) => /<input[^>]*name="miembros"[^>]*value="todos"[^>]*\/>/.exec(html)?.[0] ?? "";

  it("ofrece «Todos los usuarios activos»; marcada, los demás selectores quedan ocultos y no viajan", () => {
    const sin = pintar([{ tipo: "area", referenciaId: 1, nombre: "Urgencias" }]);
    expect(casillaTodos(sin)).toContain('type="checkbox"');
    expect(casillaTodos(sin)).not.toContain("checked");
    expect(sin).toContain("Todos los usuarios activos");
    expect(sin).not.toMatch(/<fieldset[^>]*disabled/);

    const con = pintar([{ tipo: "todos", referenciaId: null, nombre: "Todos los usuarios activos" }]);
    expect(casillaTodos(con)).toContain('checked=""');
    expect(con).toMatch(/<fieldset[^>]*disabled=""[^>]*hidden=""|<fieldset[^>]*hidden=""[^>]*disabled=""/);
    // «Todos» no es un miembro inactivo que haya que quitar.
    expect(con).not.toContain("Miembros inactivos");
  });
});
