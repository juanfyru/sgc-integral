/**
 * Las páginas de la ficha de indicador (Fase 14A, Tarea 6) contra la BD de desarrollo, dentro de una transacción que se
 * revierte (el cliente de la app se sustituye por ella): la lista básica, «Nuevo indicador» y la edición, con sus reglas
 * de «no encontrado».
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const contexto = vi.hoisted(() => ({ sql: null as unknown, sesion: null as unknown }));

vi.mock("@/db/cliente", async (original) => {
  const real = await original<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => (contexto.sql ?? real.obtenerSql()) as ReturnType<typeof real.obtenerSql> };
});
vi.mock("@/lib/paginas", () => ({ exigirSesion: async () => contexto.sesion }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NO_ENCONTRADA");
  },
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  },
  usePathname: () => "/indicadores",
}));
vi.mock("@/app/acciones-indicadores", () => ({
  crearIndicadorAccion: vi.fn(),
  guardarBorradorAccion: vi.fn(),
  abrirCambioAccion: vi.fn(),
}));

import PaginaEditarFicha from "@/app/(app)/indicadores/[codigo]/editar/page";
import PaginaNuevoIndicador from "@/app/(app)/indicadores/nuevo/page";
import PaginaIndicadores from "@/app/(app)/indicadores/page";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { crearIndicador } from "@/db/consultas/indicadores/fichas";
import type { DatosFicha } from "@/lib/esquemas/indicadores";
import type { SesionValida } from "@/lib/sesion";
import { indicadorDePrueba } from "./utiles/indicadores";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

beforeEach(() => {
  contexto.sesion = null;
});

const valida = (s: SesionFlujo): SesionValida => ({
  ...s,
  totpActivo: false,
  factorPendiente: false,
  debeCambiarClave: false,
  aceptoDatos: true,
  tema: "sistema",
});

const enTransaccion = (prueba: (tx: TransactionSql) => Promise<void>) =>
  revertida(sql, async (tx) => {
    contexto.sql = tx;
    try {
      await prueba(tx);
    } finally {
      contexto.sql = null;
    }
  });

/** Un borrador de forma «porcentaje» en el proceso SGC, creado por la consulta real. */
async function borrador(tx: TransactionSql, admin: SesionFlujo) {
  const [p] = await tx`SELECT id FROM procesos WHERE sigla = 'SGC'`;
  const [t] = await tx`SELECT id FROM tipos_indicador WHERE nombre = 'Eficacia'`;
  const [c] = await tx`SELECT id FROM clasificaciones_indicador WHERE nombre = 'Operativo'`;
  const [u] = await tx`SELECT id FROM unidades_indicador WHERE nombre = 'Porcentaje'`;
  const [cargo] = await tx`SELECT id FROM cargos WHERE activo ORDER BY id LIMIT 1`;
  const d: DatosFicha = {
    procesoId: Number(p.id),
    nombre: "Ficha nueva en borrador",
    proposito: "Saber si se cumple",
    tipoId: Number(t.id),
    clasificacionId: Number(c.id),
    forma: "porcentaje",
    variables: [
      { letra: "A", nombre: "Cumplidas", consolidacion: "suma", admiteNegativos: false },
      { letra: "B", nombre: "Programadas", consolidacion: "suma", admiteNegativos: false },
    ],
    unidadId: Number(u.id),
    decimales: 1,
    periodicidad: "trimestral",
    tendencia: "ascendente",
    meta: "80",
    semaforoModo: "relativo",
    umbralAtencionPct: 70,
    cargosMedir: [Number(cargo.id)],
    cargosAnalizar: [Number(cargo.id)],
    normaIds: [],
    plazoReporteDias: 10,
    inicioMedicion: "2026-T1",
    soporteObligatorio: false,
    nivelAcceso: "general",
    mide: [],
    analiza: [],
  };
  return crearIndicador(admin, d, { sql: tx });
}

const editar = async (codigo: string) => renderToStaticMarkup(await PaginaEditarFicha({ params: Promise.resolve({ codigo }) }));

describe("las páginas de la ficha de indicador", () => {
  it("/indicadores: Consulta ve lo aprobado sin borradores ni «Nuevo indicador»; quien administra, los borradores con su enlace", () =>
    enTransaccion(async (tx) => {
      const admin = await sesionAdmin(tx);
      const general = await indicadorDePrueba(tx);
      const nuevo = await borrador(tx, admin);

      contexto.sesion = valida(await usuarioDePrueba(tx, { rol: "consulta" }));
      const deConsulta = renderToStaticMarkup(await PaginaIndicadores());
      expect(deConsulta).toContain(general.codigo);
      expect(deConsulta).not.toContain(nuevo.codigo);
      expect(deConsulta).not.toContain("Nuevo indicador");
      expect(deConsulta).not.toContain("/editar");
      expect(deConsulta).toMatch(/aria-current="page"[^>]*>Lista</);

      contexto.sesion = valida(admin);
      const deAdmin = renderToStaticMarkup(await PaginaIndicadores());
      expect(deAdmin).toContain('href="/indicadores/nuevo"');
      expect(deAdmin).toContain(`href="/indicadores/${nuevo.codigo}/editar"`);
      expect(deAdmin).toContain(">Borrador<");
    }));

  it("/indicadores/nuevo: no existe para quien no administra; a quien administra le pinta el formulario", () =>
    enTransaccion(async (tx) => {
      const [p] = await tx`SELECT id FROM procesos WHERE sigla = 'SGC'`;
      contexto.sesion = valida(await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [Number(p.id)] }));
      await expect(PaginaNuevoIndicador()).rejects.toThrow("NO_ENCONTRADA");
      contexto.sesion = valida(await sesionAdmin(tx));
      const html = renderToStaticMarkup(await PaginaNuevoIndicador());
      expect(html).toContain("¿Cómo se calcula?");
      expect(html).toContain(">Más opciones</summary>");
      expect(html).not.toContain('name="id"');
    }));

  it("/indicadores/[codigo]/editar: el borrador con su formulario; la aprobada con «Abrir un cambio»; lo demás, no encontrado", () =>
    enTransaccion(async (tx) => {
      const admin = await sesionAdmin(tx);
      const nuevo = await borrador(tx, admin);
      const aprobado = await indicadorDePrueba(tx);

      contexto.sesion = valida(admin);
      const deBorrador = await editar(nuevo.codigo.toLowerCase());
      expect(deBorrador).toContain(`<input type="hidden" name="id" value="${nuevo.versionId}"/>`);
      expect(deBorrador).toContain("Ficha nueva en borrador");
      expect(deBorrador).toContain("Borrador · versión 1");
      expect(deBorrador).not.toContain('name="motivoCambio"');

      const deAprobada = await editar(aprobado.codigo);
      expect(deAprobada).toContain("Abrir un cambio");
      expect(deAprobada).toContain(`<input type="hidden" name="id" value="${aprobado.id}"/>`);
      expect(deAprobada).not.toContain("¿Cómo se calcula?");

      await expect(editar("ZZ-NO-EXISTE-1")).rejects.toThrow("NO_ENCONTRADA");
      await expect(editar("a b")).rejects.toThrow("NO_ENCONTRADA");
      contexto.sesion = valida(await usuarioDePrueba(tx, { rol: "gerencia" }));
      await expect(editar(aprobado.codigo)).rejects.toThrow("NO_ENCONTRADA");
    }));
});
