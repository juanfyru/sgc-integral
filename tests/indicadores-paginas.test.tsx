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
  reportarAccion: vi.fn(),
  marcarNoAplicaAccion: vi.fn(),
  quitarNoAplicaAccion: vi.fn(),
  analizarAccion: vi.fn(),
  observarAccion: vi.fn(),
  responderAccion: vi.fn(),
  programarMetaAccion: vi.fn(),
  registrarHistoricosAccion: vi.fn(),
  quitarSoporteAccion: vi.fn(),
  cerrarMesAccion: vi.fn(),
  reabrirMedicionAccion: vi.fn(),
  cerrarDeNuevoAccion: vi.fn(),
}));

import PaginaCierre from "@/app/(app)/indicadores/cierre/page";
import PaginaIndicador from "@/app/(app)/indicadores/[codigo]/page";
import PaginaEditarFicha from "@/app/(app)/indicadores/[codigo]/editar/page";
import PaginaNuevoIndicador from "@/app/(app)/indicadores/nuevo/page";
import PaginaIndicadores from "@/app/(app)/indicadores/page";
import PaginaPorAprobar from "@/app/(app)/indicadores/por-aprobar/page";
import { ResumenDeCierre } from "@/componentes/indicadores/cierre/ResumenDeCierre";
import { TablaDelAnio } from "@/componentes/indicadores/medicion/TablaDelAnio";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { aprobarFichas, enviarAAprobacion } from "@/db/consultas/indicadores/aprobacion";
import { cerrarMes, reabrirMedicion, type ResumenDeCierre as DatosDelResumen } from "@/db/consultas/indicadores/cierre";
import { crearIndicador } from "@/db/consultas/indicadores/fichas";
import type { FilaDelAnio } from "@/db/consultas/indicadores/lectura";
import { asegurarMediciones, reportar } from "@/db/consultas/indicadores/mediciones";
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
      const deConsulta = renderToStaticMarkup(await PaginaIndicadores({ searchParams: Promise.resolve({}) }));
      expect(deConsulta).toContain(general.codigo);
      expect(deConsulta).not.toContain(nuevo.codigo);
      expect(deConsulta).not.toContain("Nuevo indicador");
      expect(deConsulta).not.toContain("/editar");
      expect(deConsulta).toMatch(/aria-current="page"[^>]*>Lista</);

      contexto.sesion = valida(admin);
      const deAdmin = renderToStaticMarkup(await PaginaIndicadores({ searchParams: Promise.resolve({}) }));
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
      // Con ficha aprobada, la vista por omisión es «Resultados»; la ficha técnica se pide.
      expect(await pagina(nuevo.codigo.toLowerCase())).toMatch(/aria-current="page"[^>]*>Resultados</);
      const ficha = await pagina(nuevo.codigo.toLowerCase(), { vista: "ficha" });
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

// ─────────────────────────────────────────────────────────────────────────────
// Tarea 12: el cierre del mes y la reapertura
// ─────────────────────────────────────────────────────────────────────────────

describe("el cierre del mes", () => {
  /**
   * Un indicador mensual que se mide desde enero de 2003: antes de todo inicio de medición de la base, así ni sus
   * mediciones ni sus cierres confirmados (el del punto de control, los de la demo) cambian lo que estos casos ven.
   */
  async function deEnero2003(tx: TransactionSql) {
    const mide = await usuarioDePrueba(tx, { rol: "consulta" });
    const ind = await indicadorDePrueba(tx, { inicioMedicion: "2003-01", aprobadaEn: new Date("2002-12-15T15:00:00Z"), mide: [mide.usuarioId] });
    await asegurarMediciones({ sql: tx, indicadorId: ind.id });
    const [enero] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = '2003-01'`;
    return { mide, ind, enero: Number(enero.id) };
  }
  const cierre = async (sp: Record<string, string> = {}) => renderToStaticMarkup(await PaginaCierre({ searchParams: Promise.resolve(sp) }));

  it("/indicadores/cierre: solo quien administra; el resumen del mes elegido, su confirmación y los cierres anteriores", () =>
    enTransaccion(async (tx) => {
      const admin = await sesionAdmin(tx);
      const { mide, ind } = await deEnero2003(tx);
      for (const rol of ["lider_proceso", "gerencia", "consulta"] as const) {
        contexto.sesion = valida(await usuarioDePrueba(tx, { rol }));
        await expect(cierre()).rejects.toThrow("NO_ENCONTRADA");
      }

      contexto.sesion = valida(admin);
      const html = await cierre({ mes: "2003-01" });
      expect(html).toMatch(/aria-current="page"[^>]*>Cierre del mes</);
      expect(html).toContain(">Resumen de enero de 2003</h2>");
      // Quedará sin dato, con quién debía medirla; y la confirmación sin clave.
      expect(html).toContain(ind.codigo);
      expect(html).toContain(mide.nombre);
      expect(html).toMatch(/<select[^>]*name="mes"/);
      expect(html).toContain('<option value="2003-01" selected="">Enero de 2003</option>');
      expect(html).toMatch(/aria-haspopup="dialog"[^>]*>Cerrar enero de 2003</);
      // Las cuentas por proceso (spec §9.2), con el proceso del indicador.
      const [proceso] = await tx`SELECT nombre FROM procesos WHERE id = ${ind.procesoId}`;
      expect(html).toContain(">Por proceso</h3>");
      expect(html).toMatch(new RegExp(`<th scope="row"[^>]*>${proceso.nombre}</th>`));
      // Nada queda en plazo ni hay históricos por registrar: la caja «No se cierran» no aparece.
      expect(html).not.toContain("No se cierran");
      for (const raro of ["2003-13", "2003-1", "abc", "2099-01"]) await expect(cierre({ mes: raro })).rejects.toThrow("NO_ENCONTRADA");

      const { cerradas } = await cerrarMes(admin, "2003-01", { sql: tx });
      const cerrado = await cierre({ mes: "2003-01", cerrado: "2003-01", cerradas: String(cerradas) });
      expect(cerrado).toContain(`Se cerró enero de 2003: ${cerradas === 1 ? "1 medición cerrada" : `${cerradas} mediciones cerradas`}.`);
      expect(cerrado).toContain("Enero de 2003 ya está cerrado.");
      expect(cerrado).not.toContain(">Cerrar enero de 2003<");
      expect(cerrado).toContain(">Cierres anteriores</h2>");
      expect(cerrado).toMatch(new RegExp(`Enero de 2003</td><td[^>]*>${admin.nombre}</td>`));
      for (const raro of [{ cerrado: "2003-13", cerradas: "1" }, { cerrado: "2003-01", cerradas: "x" }]) {
        expect(await cierre(raro)).not.toContain("Se cerró");
      }
    }), 20_000);

  it("/indicadores/[codigo]: quien administra reabre lo cerrado y cierra de nuevo lo reabierto; «Corregida» lleva su historial", () =>
    enTransaccion(async (tx) => {
      const admin = await sesionAdmin(tx);
      const { mide, ind, enero } = await deEnero2003(tx);
      await reportar(mide, { medicionId: enero, valores: { A: "9", B: "10" }, parcial: false, confirmado: true }, { sql: tx });
      await cerrarMes(admin, "2003-01", { sql: tx });
      const de2003 = () => pagina(ind.codigo, { vista: "resultados", anio: "2003" });

      contexto.sesion = valida(admin);
      expect(await de2003()).toMatch(/aria-haspopup="dialog"[^>]*>Reabrir<span class="sr-only"> Enero de 2003<\/span>/);
      contexto.sesion = valida(mide);
      expect(await de2003()).not.toContain(">Reabrir<");

      await reabrirMedicion(admin, { medicionId: enero, justificacion: "El dato venía del informe equivocado" }, { sql: tx });
      contexto.sesion = valida(admin);
      const reabierta = await de2003();
      expect(reabierta).not.toContain(">Reabrir<");
      expect(reabierta).toMatch(/>Cerrar de nuevo<span class="sr-only"> Enero de 2003<\/span>/);
      expect(reabierta).toContain(">Corregida<");
      expect(reabierta).toContain("Reabrió");
      expect(reabierta).toContain("El dato venía del informe equivocado");
      expect(reabierta).toContain("Estado: Cerrada → Reportada");

      // El historial lo ve quien ve el indicador; «Cerrar de nuevo», solo quien administra.
      contexto.sesion = valida(await usuarioDePrueba(tx, { rol: "consulta" }));
      const ajena = await de2003();
      expect(ajena).toContain("El dato venía del informe equivocado");
      expect(ajena).not.toContain(">Cerrar de nuevo<");
    }), 20_000);
});

// Ronda 2 de la Tarea 12 (punto de control en navegador): los textos y la estructura del resumen y de la tabla del año.
describe("el resumen del cierre y la tabla del año, sin navegador", () => {
  const RESUMEN: DatosDelResumen = {
    mes: "2003-03",
    yaCerrado: false,
    aCerrar: 0,
    reportadas: 0,
    sinDato: [],
    noAplica: 0,
    sinAnalisis: 0,
    observacionesSinRespuesta: 0,
    enPlazo: 0,
    historicosSinRegistrar: 0,
    porProceso: [],
  };
  const resumen = (o: Partial<DatosDelResumen>) =>
    renderToStaticMarkup(<ResumenDeCierre resumen={{ ...RESUMEN, ...o }} mes="marzo de 2003" periodos={{}} />);

  it("sin filas, «Por proceso» y «Quedarán sin dato» son una frase, no una tabla vacía", () => {
    const html = resumen({});
    expect(html).toContain("<p class=\"text-sm text-muted-foreground\">Ningún proceso tiene mediciones que cerrar ni observaciones sin respuesta.</p>");
    expect(html).toContain("<p class=\"text-sm text-muted-foreground\">Ninguna medición quedará sin dato.</p>");
    expect(html).not.toContain("<table");
    // Con filas, las dos tablas.
    const conFilas = resumen({
      aCerrar: 1,
      sinDato: [{ codigo: "ZZ-1", nombre: "Uno", proceso: "Gestión", periodo: "2003-03", quien: ["Ana"] }],
      porProceso: [{ proceso: "Gestión", reportadas: 0, sinDato: 1, noAplica: 0, sinAnalisis: 0, observacionesSinRespuesta: 0 }],
    });
    expect(conFilas.match(/<table/g)).toHaveLength(2);
  });

  it("«No se cierran» concuerda en número y no aparece si los dos grupos están vacíos", () => {
    expect(resumen({})).not.toContain("No se cierran");
    const uno = resumen({ enPlazo: 1, historicosSinRegistrar: 1 });
    expect(uno).toContain("No se cierran");
    expect(uno).toContain("1 medición sigue dentro de su plazo de reporte: queda para el siguiente cierre.");
    expect(uno).toContain("1 histórico sin registrar sigue abierto hasta que se registre.");
    const varios = resumen({ enPlazo: 3, historicosSinRegistrar: 2 });
    expect(varios).toContain("3 mediciones siguen dentro de su plazo de reporte: quedan para el siguiente cierre.");
    expect(varios).toContain("2 históricos sin registrar siguen abiertos hasta que se registren.");
    const soloPlazo = resumen({ enPlazo: 2 });
    expect(soloPlazo).toContain("2 mediciones siguen dentro de su plazo de reporte");
    expect(soloPlazo).not.toContain("histórico");
  });

  it("en la tabla del año, «Reabrir» y «Cerrar de nuevo» no se parten y el historial abierto tiene un ancho que se lee", () => {
    const fila = (o: Partial<FilaDelAnio>): FilaDelAnio => ({
      periodo: "2003-01",
      etiqueta: "Enero de 2003",
      medicionId: 41,
      estado: "cerrada",
      vencida: false,
      vence: "10 de febrero de 2003",
      historica: false,
      noAplica: false,
      motivo: null,
      valores: [],
      resultado: "90 %",
      semaforo: "bien",
      meta: "≥ 90 %",
      cumple: true,
      frase: null,
      requiereAccion: false,
      repetido: false,
      corregida: false,
      metaTardia: false,
      sinAnalisis: false,
      analisis: null,
      causa: null,
      accionPropuesta: null,
      ...o,
    });
    const historial = new Map([
      [42, [{ id: 1, que: "Reabrió", quien: "Ana", cuando: "21 de abril de 2003, 10:00", porque: "El dato venía de otro informe", cambios: ["Estado: Cerrada → Reportada"] }]],
    ]);
    const html = renderToStaticMarkup(
      <TablaDelAnio
        filas={[fila({}), fila({ periodo: "2003-02", etiqueta: "Febrero de 2003", medicionId: 42, estado: "reportada", corregida: true })]}
        variables={[]}
        anio={2003}
        codigo="ZZ-1"
        puedeMedir={false}
        puedeReabrir
        puedeCerrarDeNuevo
        historial={historial}
      />,
    );
    expect(html).toMatch(/<button[^>]*class="[^"]*whitespace-nowrap[^"]*"[^>]*>Reabrir<span class="sr-only"> Enero de 2003<\/span>/);
    expect(html).toMatch(/<button[^>]*class="[^"]*whitespace-nowrap[^"]*"[^>]*>Cerrar de nuevo<span class="sr-only"> Febrero de 2003<\/span>/);
    // La lista del historial ocupa al menos 18 rem: la columna se ensancha solo mientras está abierta.
    expect(html).toMatch(/<details[^>]*>.*<ol class="[^"]*min-w-72[^"]*">.*El dato venía de otro informe/);
  });
});
