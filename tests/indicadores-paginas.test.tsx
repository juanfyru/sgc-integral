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
  enviarAAprobacionAccion: vi.fn(),
  aprobarFichasAccion: vi.fn(),
  devolverFichaAccion: vi.fn(),
  descartarBorradorAccion: vi.fn(),
  designarAccion: vi.fn(),
  cambiarOperacionAccion: vi.fn(),
  duplicarAccion: vi.fn(),
  retirarAccion: vi.fn(),
  descartarIndicadorAccion: vi.fn(),
  borrarIndicadorAccion: vi.fn(),
}));

import PaginaIndicador from "@/app/(app)/indicadores/[codigo]/page";
import PaginaEditarFicha from "@/app/(app)/indicadores/[codigo]/editar/page";
import PaginaNuevoIndicador from "@/app/(app)/indicadores/nuevo/page";
import PaginaIndicadores from "@/app/(app)/indicadores/page";
import PaginaPorAprobar from "@/app/(app)/indicadores/por-aprobar/page";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { aprobarFichas, enviarAAprobacion } from "@/db/consultas/indicadores/aprobacion";
import { crearIndicador } from "@/db/consultas/indicadores/fichas";
import { descartarIndicador, retirar } from "@/db/consultas/indicadores/operacion";
import type { DatosFicha } from "@/lib/esquemas/indicadores";
import type { SesionValida } from "@/lib/sesion";
import { indicadorDePrueba } from "./utiles/indicadores";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { firmaDePrueba } from "./utiles/vigencia";

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

/** Un borrador de forma «porcentaje» en el proceso SGC (o en `procesoId`), creado por la consulta real. */
async function borrador(tx: TransactionSql, admin: SesionFlujo, parcial: Partial<DatosFicha> = {}) {
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
    ...parcial,
  };
  return crearIndicador(admin, d, { sql: tx });
}

const editar = async (codigo: string) => renderToStaticMarkup(await PaginaEditarFicha({ params: Promise.resolve({ codigo }) }));
const pagina = async (codigo: string, sp: Record<string, string> = {}) =>
  renderToStaticMarkup(await PaginaIndicador({ params: Promise.resolve({ codigo }), searchParams: Promise.resolve(sp) }));
const firmar = (tx: TransactionSql) => ({ sql: tx, verificar: firmaDePrueba });

/** Un proceso que solo existe en la transacción, con un líder suyo. */
async function procesoConLider(tx: TransactionSql) {
  const sigla = `Z${Date.now() % 100_000_000}${Math.floor(Math.random() * 1000)}`;
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${`Proceso ${sigla}`}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id`;
  const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [Number(p.id)] });
  return { procesoId: Number(p.id), lider };
}

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
      expect(deAdmin).toContain(`href="/indicadores/${nuevo.codigo}"`);
      expect(deAdmin).toContain(">Borrador<");
      // «Por aprobar» es de quien administra o aprueba.
      expect(deAdmin).toContain('href="/indicadores/por-aprobar"');
      expect(deConsulta).not.toContain('href="/indicadores/por-aprobar"');
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

  it("/indicadores/[codigo]/editar: el borrador ofrece enviarlo y avisa si falta la prueba", () =>
    enTransaccion(async (tx) => {
      const admin = await sesionAdmin(tx);
      contexto.sesion = valida(admin);
      const sinProbar = await borrador(tx, admin);
      expect(await editar(sinProbar.codigo)).toContain("pruebe la fórmula con valores de ejemplo");
      const probado = await borrador(tx, admin, { prueba: { valores: { A: "9", B: "10" } } });
      const html = await editar(probado.codigo);
      expect(html).toContain(">Enviar a aprobación</button>");
      expect(html).toContain("Se envía la ficha tal como quedó guardada");
      // Una ficha nueva no se descarta aquí.
      expect(html).not.toContain("Descartar el cambio");
    }));

  it("/indicadores/[codigo]: la ficha técnica y las versiones de un indicador aprobado, para quien lo ve", () =>
    enTransaccion(async (tx) => {
      const admin = await sesionAdmin(tx);
      const [es] = await tx`SELECT id FROM clasificaciones_indicador WHERE nombre = 'Estratégico'`;
      const nuevo = await borrador(tx, admin, { clasificacionId: Number(es.id), prueba: { valores: { A: "9", B: "10" } } });
      await enviarAAprobacion(admin, { versionId: nuevo.versionId, credenciales: { clave: "ok" } }, firmar(tx));
      const gerente = await usuarioDePrueba(tx, { rol: "gerencia" });
      await aprobarFichas(gerente, { versionIds: [nuevo.versionId], credenciales: { clave: "ok" } }, firmar(tx));

      contexto.sesion = valida(await usuarioDePrueba(tx, { rol: "consulta" }));
      const ficha = await pagina(nuevo.codigo.toLowerCase());
      expect(ficha).toContain("Ficha nueva en borrador");
      expect(ficha).toMatch(/aria-current="page"[^>]*>Ficha técnica</);
      expect(ficha).toContain("(Cumplidas ÷ Programadas) × 100");
      expect(ficha).toContain("Bien desde 80 %");
      expect(ficha).toContain(">Elaboró<");
      expect(ficha).toContain(">Datos de operación<");
      expect(ficha).toContain("vigente desde el primer trimestre de 2026");
      expect(ficha).toContain("Porcentaje (%) · 1 decimal<");
      expect(ficha).not.toContain("Editar ficha");
      const versiones = await pagina(nuevo.codigo, { vista: "versiones" });
      expect(versiones).toContain("Control de cambios");
      expect(versiones).toContain("Primera versión de la ficha");

      await expect(pagina(nuevo.codigo, { vista: "otra" })).rejects.toThrow("NO_ENCONTRADA");
      await expect(pagina(nuevo.codigo, { version: "9" })).rejects.toThrow("NO_ENCONTRADA");
      await expect(pagina(nuevo.codigo, { version: "uno" })).rejects.toThrow("NO_ENCONTRADA");
      contexto.sesion = valida(admin);
      expect(await pagina(nuevo.codigo)).toContain(">Administrar<");
      expect(ficha).not.toContain(">Administrar<");
    }));

  it("/indicadores/[codigo]: la ficha por aprobar de un indicador nuevo la abre quien debe aprobarla; para los demás no existe", () =>
    enTransaccion(async (tx) => {
      const admin = await sesionAdmin(tx);
      const { procesoId, lider } = await procesoConLider(tx);
      const nuevo = await borrador(tx, admin, { procesoId, prueba: { valores: { A: "9", B: "10" } } });
      contexto.sesion = valida(lider);
      // En borrador, ni quien la aprobará la ve.
      await expect(pagina(nuevo.codigo)).rejects.toThrow("NO_ENCONTRADA");
      await enviarAAprobacion(admin, { versionId: nuevo.versionId, credenciales: { clave: "ok" } }, firmar(tx));

      const html = await pagina(nuevo.codigo);
      expect(html).toContain("Por aprobar");
      expect(html).toContain(">Aprobar</button>");
      expect(html).toContain(">Devolver</button>");
      expect(html).not.toContain(">Versiones<");
      expect(await pagina(nuevo.codigo, { version: "1" })).toContain(">Aprobar</button>");
      await expect(pagina(nuevo.codigo, { vista: "versiones" })).rejects.toThrow("NO_ENCONTRADA");
      await expect(pagina(nuevo.codigo, { version: "2" })).rejects.toThrow("NO_ENCONTRADA");

      for (const rol of ["consulta", "gerencia"] as const) {
        contexto.sesion = valida(await usuarioDePrueba(tx, { rol }));
        await expect(pagina(nuevo.codigo)).rejects.toThrow("NO_ENCONTRADA");
      }
      contexto.sesion = valida(await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [procesoId] }));
      expect(await pagina(nuevo.codigo)).toContain(">Aprobar</button>");
      // Quien administra la ve, sin aprobarla.
      contexto.sesion = valida(admin);
      const deAdmin = await pagina(nuevo.codigo);
      expect(deAdmin).toContain("Espera la aprobación");
      expect(deAdmin).not.toContain(">Aprobar</button>");
    }));

  it("/indicadores/[codigo]: un indicador descartado lo ve quien administra, marcado, y nadie más", () =>
    enTransaccion(async (tx) => {
      const admin = await sesionAdmin(tx);
      const { procesoId, lider } = await procesoConLider(tx);
      const enviado = await borrador(tx, admin, { procesoId, prueba: { valores: { A: "9", B: "10" } } });
      await enviarAAprobacion(admin, { versionId: enviado.versionId, credenciales: { clave: "ok" } }, firmar(tx));
      await descartarIndicador(admin, { indicadorId: enviado.indicadorId, motivo: "Se abandonó la idea" }, { sql: tx });

      contexto.sesion = valida(admin);
      const html = await pagina(enviado.codigo);
      expect(html).toContain(">Descartado<");
      expect(html).toContain("Motivo: Se abandonó la idea");
      expect(html).toContain("Versión 1, descartada: nunca rigió.");
      expect(html).toContain(">Administrar<");
      expect(await pagina(enviado.codigo, { vista: "versiones" })).toContain("Control de cambios");

      for (const sesion of [lider, await usuarioDePrueba(tx, { rol: "gerencia" }), await usuarioDePrueba(tx, { rol: "consulta" })]) {
        contexto.sesion = valida(sesion);
        await expect(pagina(enviado.codigo)).rejects.toThrow("NO_ENCONTRADA");
      }

      // Un indicador retirado lo ven todos; el motivo y «Administrar», solo quien administra.
      const activo = await indicadorDePrueba(tx);
      await retirar(admin, { indicadorId: activo.id, motivo: "Ya no se mide" }, { sql: tx });
      contexto.sesion = valida(await usuarioDePrueba(tx, { rol: "consulta" }));
      const deConsulta = await pagina(activo.codigo);
      expect(deConsulta).toContain(">Retirado<");
      expect(deConsulta).not.toContain("Ya no se mide");
      expect(deConsulta).not.toContain(">Administrar<");
      contexto.sesion = valida(admin);
      expect(await pagina(activo.codigo)).toContain("Motivo: Ya no se mide");
    }));

  it("/indicadores/por-aprobar: no existe para Consulta; quien aprueba ve lo suyo y quien administra, los borradores", () =>
    enTransaccion(async (tx) => {
      const admin = await sesionAdmin(tx);
      const { procesoId, lider } = await procesoConLider(tx);
      const enviado = await borrador(tx, admin, { procesoId, nombre: "Ficha enviada al líder", prueba: { valores: { A: "9", B: "10" } } });
      await enviarAAprobacion(admin, { versionId: enviado.versionId, credenciales: { clave: "ok" } }, firmar(tx));
      const quieto = await borrador(tx, admin, { nombre: "Ficha que sigue en borrador" });

      const porAprobar = async (sp: Record<string, string> = {}) =>
        renderToStaticMarkup(await PaginaPorAprobar({ searchParams: Promise.resolve(sp) }));
      contexto.sesion = valida(await usuarioDePrueba(tx, { rol: "consulta" }));
      await expect(porAprobar()).rejects.toThrow("NO_ENCONTRADA");

      contexto.sesion = valida(lider);
      const deLider = await porAprobar();
      expect(deLider).toContain("Ficha enviada al líder");
      expect(deLider).toContain(`aria-label="Elegir ${enviado.codigo}"`);
      expect(deLider).toMatch(/aria-current="page"[^>]*>Por aprobar · 1</);
      expect(deLider).not.toContain("Ficha que sigue en borrador");
      expect(deLider).not.toContain("Borradores y devueltas");
      expect(deLider).not.toContain('role="status"');
      // «Aprobar las seleccionadas» vuelve con cuántas aprobó: la página lo confirma.
      expect(await porAprobar({ aprobadas: "1" })).toContain('<p role="status" class="rounded-lg border border-border bg-muted p-3 text-sm text-foreground">Se aprobó 1 ficha.</p>');
      expect(await porAprobar({ aprobadas: "3" })).toContain(">Se aprobaron 3 fichas.</p>");
      for (const raro of ["0", "x", "1000", "-1"]) expect(await porAprobar({ aprobadas: raro })).not.toContain('role="status"');

      contexto.sesion = valida(admin);
      const deAdmin = await porAprobar();
      expect(deAdmin).toContain("Borradores y devueltas");
      expect(deAdmin).toContain(quieto.codigo);
      expect(deAdmin).toContain("Enviadas, esperando aprobación");
      expect(deAdmin).not.toContain("Le toca aprobar");
    }));
});
