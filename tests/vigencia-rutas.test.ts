/**
 * Las rutas de «Vigencia»: el Excel del semáforo y las páginas, con su regla de alcance. Corren contra la BD
 * dentro de una transacción que se revierte (el cliente de la app se sustituye por ella) y escriben solo en un
 * almacén temporal.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const contexto = vi.hoisted(() => ({ sql: null as unknown, sesion: null as unknown, sesionDePeticion: vi.fn() }));

vi.mock("@/db/cliente", async (original) => {
  const real = await original<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => (contexto.sql ?? real.obtenerSql()) as ReturnType<typeof real.obtenerSql> };
});
vi.mock("@/lib/sesion-actual", () => ({ sesionDePeticion: contexto.sesionDePeticion }));
vi.mock("@/lib/paginas", () => ({ exigirSesion: async () => contexto.sesion }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NO_ENCONTRADA");
  },
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  },
}));
vi.mock("@/app/acciones-vigencia", () => ({
  ratificarAccion: vi.fn(),
  fijarFechaAccion: vi.fn(),
  quitarFechaAccion: vi.fn(),
  ajustarPlazoAccion: vi.fn(),
}));

import { GET } from "@/app/(app)/vigencia/semaforo/excel/route";
import PaginaVigencia from "@/app/(app)/vigencia/page";
import PaginaSemaforo from "@/app/(app)/vigencia/semaforo/page";
import { obtenerSql } from "@/db/cliente";
import { BloqueVigencia } from "@/componentes/vigencia/BloqueVigencia";
import { ratificar } from "@/db/consultas/vigencia/ratificaciones";
import { fijarProximaRevision } from "@/db/consultas/vigencia/semaforo";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import type { SesionValida } from "@/lib/sesion";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { sesionAdmin, sesionDe, tramiteEn, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { firmaDePrueba, vigenteFuera } from "./utiles/vigencia";

const sql = obtenerSql();

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-vigencia-rutas-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

beforeEach(() => {
  contexto.sesionDePeticion.mockReset();
  contexto.sesion = null;
});

const pedir = (consulta = "") => GET(new NextRequest(`http://localhost:3002/vigencia/semaforo/excel${consulta}`));
const como = (sesion: SesionFlujo | null) => contexto.sesionDePeticion.mockResolvedValue(sesion);
const valida = (s: SesionFlujo): SesionValida => ({
  ...s,
  totpActivo: false,
  factorPendiente: false,
  debeCambiarClave: false,
  aceptoDatos: true,
  tema: "sistema",
});

/** Corre la prueba con la app apuntando a la transacción revertida. */
const enTransaccion = (prueba: (tx: Parameters<Parameters<typeof revertida>[1]>[0]) => Promise<void>) =>
  revertida(sql, async (tx) => {
    contexto.sql = tx;
    try {
      await prueba(tx);
    } finally {
      contexto.sql = null;
    }
  });

async function filasDelExcel(res: Response): Promise<string[][]> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await res.arrayBuffer());
  const filas: string[][] = [];
  libro.worksheets[0].eachRow((fila) => {
    const valores = fila.values as unknown[];
    filas.push(valores.slice(1).map((v) => (v === null || v === undefined ? "" : String(v))));
  });
  return filas;
}

describe("GET /vigencia/semaforo/excel", () => {
  it("401 sin sesión y 404 a quien no ve el semáforo, sin dejar rastro", () =>
    enTransaccion(async (tx) => {
      como(null);
      expect((await pedir()).status).toBe(401);
      const consulta = await sesionDe(tx, "consulta");
      como(consulta);
      expect((await pedir()).status).toBe(404);
      expect((await tx`SELECT 1 FROM auditoria WHERE accion = 'exporto_semaforo' AND usuario_id = ${consulta.usuarioId}`).length).toBe(0);
    }));

  it("entrega el xlsx con las filas filtradas, la nota de la fecha fijada y la bitácora", () =>
    enTransaccion(async (tx) => {
      const admin = await sesionAdmin(tx);
      const vencido = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14" });
      const fijado = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14" });
      // La app usa la hora real: la fecha fijada se cuenta desde hoy.
      const fecha = fechaEnZona(new Date(Date.now() + 120 * 86_400_000), zonaHoraria());
      await fijarProximaRevision(admin, { documentoIds: [fijado.id], fecha, nota: "=carga inicial" }, { sql: tx });
      como(admin);
      const res = await pedir(`?estado=vencida&proceso=${vencido.procesoId}&origen=interno`);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="semaforo-\d{8}\.xlsx"$/);
      const filas = await filasDelExcel(res);
      const cabecera = filas.find((f) => f[0] === "Código")!;
      expect(cabecera).toEqual(expect.arrayContaining(["Código", "Próxima revisión", "Vigencia", "Nota de la fecha fijada"]));
      const deVencido = filas.find((f) => f[0] === vencido.codigo)!;
      expect(deVencido[cabecera.indexOf("Vigencia")]).toMatch(/^Vencida hace \d+ días$/);
      // El filtro de estado deja fuera al fijado (al día).
      expect(filas.some((f) => f[0] === fijado.codigo)).toBe(false);
      const [a] = await tx`SELECT detalle FROM auditoria WHERE accion = 'exporto_semaforo' AND usuario_id = ${admin.usuarioId}`;
      expect(a.detalle).toMatchObject({ formato: "excel", estado: "vencida", procesoId: vencido.procesoId, origen: "interno" });

      const todos = await filasDelExcel(await pedir("?estado=cualquiera"));
      const cab = todos.find((f) => f[0] === "Código")!;
      const deFijado = todos.find((f) => f[0] === fijado.codigo)!;
      // La nota es texto del usuario: no llega como fórmula.
      expect(deFijado[cab.indexOf("Nota de la fecha fijada")]).toBe("'=carga inicial");
      expect(deFijado[cab.indexOf("Fijada por")]).toContain(admin.nombre);
      const auditadas = await tx`SELECT detalle->>'estado' AS estado FROM auditoria WHERE accion = 'exporto_semaforo' AND usuario_id = ${admin.usuarioId} ORDER BY id`;
      expect(auditadas.map((x) => x.estado)).toEqual(["vencida", "todos"]);
    }));

  it("limita a diez descargas por minuto por persona", () =>
    enTransaccion(async (tx) => {
      const gerente = await usuarioDePrueba(tx, { rol: "gerencia" });
      como(gerente);
      for (let i = 0; i < 10; i++) expect((await pedir("?estado=vencida")).status).toBe(200);
      const res = await pedir("?estado=vencida");
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("60");
    }));
});

describe("páginas de Vigencia", () => {
  it("/vigencia lleva al semáforo a quien lo ve y no existe para Consulta", () =>
    enTransaccion(async (tx) => {
      contexto.sesion = valida(await sesionDe(tx, "gerente"));
      await expect(PaginaVigencia()).rejects.toThrow("REDIRECT:/vigencia/semaforo");
      contexto.sesion = valida(await sesionDe(tx, "consulta"));
      await expect(PaginaVigencia()).rejects.toThrow("NO_ENCONTRADA");
      await expect(PaginaSemaforo({ searchParams: Promise.resolve({}) })).rejects.toThrow("NO_ENCONTRADA");
    }));

  it("el semáforo del Admin SGC pinta tarjetas, filtros, la fila y el bloque de fijar fecha", () =>
    enTransaccion(async (tx) => {
      const admin = await sesionAdmin(tx);
      const d = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14" });
      contexto.sesion = valida(admin);
      const html = renderToStaticMarkup(await PaginaSemaforo({ searchParams: Promise.resolve({ estado: "vencida", proceso: String(d.procesoId) }) }));
      for (const texto of ["Revisión vencida", "Al día", "En trámite", "Semáforo", "Descargar Excel", d.codigo, "Ratificar", "Solicitar cambio"]) {
        expect(html).toContain(texto);
      }
      expect(html).toMatch(/Fijar próxima revisión (a los \d+ documentos filtrados|al documento filtrado)/);
      expect(html).toMatch(/Vencida hace \d+ días/);
      expect(html).toContain(`/tramites/nueva?documento=${d.codigo}&amp;motivo=revision_anual`);
      // Las pestañas que aún no existen no se pintan.
      expect(html).not.toContain("/vigencia/externos");
      expect(html).not.toContain("/vigencia/indicadores");
      // A 390 px el selector de proceso, con nombres largos, no desborda la página: cede al ancho disponible.
      const clases = (patron: RegExp) => (html.match(patron)?.[1] ?? "").split(/\s+/);
      expect(clases(/<select[^>]*id="filtro-proceso"[^>]*class="([^"]*)"/)).toEqual(expect.arrayContaining(["w-full", "max-w-full"]));
      expect(clases(/<div class="([^"]*)"><label for="filtro-proceso"/)).toEqual(expect.arrayContaining(["min-w-0", "max-w-full"]));
      expect(clases(/<form class="([^"]*)" action="\/vigencia\/semaforo"/)).toEqual(expect.arrayContaining(["min-w-0", "max-w-full"]));
    }));

  it("el líder no ve el bloque de fijar fecha ni filas de otros procesos", () =>
    enTransaccion(async (tx) => {
      const ajeno = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14", proceso: "CEX" });
      const propio = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14", proceso: "GTH" });
      contexto.sesion = valida(await sesionDe(tx, "lider.gth"));
      const html = renderToStaticMarkup(await PaginaSemaforo({ searchParams: Promise.resolve({ estado: "vencida" }) }));
      expect(html).toContain(propio.codigo);
      expect(html).not.toContain(ajeno.codigo);
      expect(html).not.toContain("Fijar próxima revisión");
    }));
});

describe("bloque «Vigencia» de la ficha", () => {
  it("al líder le muestra el estado, el plazo, la última revisión y los botones; tras ratificar, «Ratificado el …»", () =>
    enTransaccion(async (tx) => {
      const d = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14", proceso: "GTH" });
      const lider = await sesionDe(tx, "lider.gth");
      const antes = renderToStaticMarkup((await BloqueVigencia({ documentoId: d.id, sesion: lider }))!);
      for (const texto of ["Vigencia", "Vencida hace", "12 meses (el del tipo Procedimiento)", "14 ago 2025 · fecha de aprobación registrada", "14 ago 2026", "Ratificar sin cambios", "Solicitar cambio"]) {
        expect(antes).toContain(texto);
      }
      expect(antes).not.toContain("Ajustar");

      await ratificar(lider, { documentoId: d.id, nota: "Sin cambios", credenciales: { clave: "ok" } }, { sql: tx, verificar: firmaDePrueba });
      const despues = renderToStaticMarkup((await BloqueVigencia({ documentoId: d.id, sesion: lider }))!);
      expect(despues).toMatch(new RegExp(String.raw`Ratificado el \d{1,2} [a-z]{3} \d{4} por ${lider.nombre}`));
      expect(despues).toContain("Ratificaciones de la versión 1");
      expect(despues).toContain("Sin cambios");
      expect(despues).toContain("Al día");
    }));

  it("el Admin SGC ve «Ajustar» y la fecha fijada; un externo no tiene este bloque", () =>
    enTransaccion(async (tx) => {
      const admin = await sesionAdmin(tx);
      const d = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14" });
      const fecha = fechaEnZona(new Date(Date.now() + 60 * 86_400_000), zonaHoraria());
      await fijarProximaRevision(admin, { documentoIds: [d.id], fecha, nota: "carga inicial" }, { sql: tx });
      const html = renderToStaticMarkup((await BloqueVigencia({ documentoId: d.id, sesion: admin }))!);
      for (const texto of ["Ajustar", "Plazo de revisión (meses)", "Fijar la próxima revisión", "Quitar la fecha fijada", `Fijada por ${admin.nombre}`, "carga inicial"]) {
        expect(html).toContain(texto);
      }
      await tx`UPDATE documentos SET origen = 'externo' WHERE id = ${d.id}`;
      expect(await BloqueVigencia({ documentoId: d.id, sesion: admin })).toBeNull();
      // Quien no ve el documento no recibe el bloque.
      await tx`UPDATE documentos SET nivel_acceso = 'restringido', origen = 'interno' WHERE id = ${d.id}`;
      expect(await BloqueVigencia({ documentoId: d.id, sesion: await sesionDe(tx, "lider.cex") })).toBeNull();
    }));
});

describe("ronda de corrección 1", () => {
  it("el bloque toma el nivel de encabezado de donde se monta (en el panel, bajo el h3 de la versión)", () =>
    enTransaccion(async (tx) => {
      const d = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14", proceso: "GTH" });
      const lider = await sesionDe(tx, "lider.gth");
      await ratificar(lider, { documentoId: d.id, nota: null, credenciales: { clave: "ok" } }, { sql: tx, verificar: firmaDePrueba });
      const enPortal = renderToStaticMarkup((await BloqueVigencia({ documentoId: d.id, sesion: lider }))!);
      expect(enPortal).toContain('<h2 id="titulo-vigencia"');
      expect(enPortal).toContain("<h3");
      const enPanel = renderToStaticMarkup((await BloqueVigencia({ documentoId: d.id, sesion: lider, nivel: 4 }))!);
      expect(enPanel).toContain('<h4 id="titulo-vigencia"');
      expect(enPanel).toContain("<h5");
      // Fuera de los diálogos (cerrados no se leen; abiertos, son modales con su propio título).
      expect(enPanel.replace(/<dialog[\s\S]*?<\/dialog>/g, "")).not.toMatch(/<h[23][ >]/);
      expect(enPanel).toContain("<dialog");
      const panel = readFileSync(path.join(import.meta.dirname, "../src/app/(app)/admin/(panel)/documentos/[codigo]/page.tsx"), "utf8");
      expect(panel).toContain("<BloqueVigencia documentoId={documento.id} sesion={sesion} nivel={4} />");
    }));

  it("el trámite abierto se enlaza solo a quien puede abrirlo; a los demás, el número como texto", () =>
    enTransaccion(async (tx) => {
      const d = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14", proceso: "GTH" });
      const t = await tramiteEn(tx, "elaboracion", { codigo: d.codigo });
      const [{ numero }] = await tx`SELECT numero FROM tramites WHERE id = ${t.tramiteId}`;
      const enlace = `href="/tramites/${t.tramiteId}"`;
      const delLider = renderToStaticMarkup((await BloqueVigencia({ documentoId: d.id, sesion: await sesionDe(tx, "lider.gth") }))!);
      expect(delLider).toContain(enlace);
      for (const usuario of ["gerente", "control.interno", "lider.cex"]) {
        const html = renderToStaticMarkup((await BloqueVigencia({ documentoId: d.id, sesion: await sesionDe(tx, usuario) }))!);
        expect(html, usuario).not.toContain(enlace);
        expect(html, usuario).toContain(numero);
      }
    }));

  it("con filtro de proceso y ninguna fila, la cabecera del Excel nombra el proceso, no su id", () =>
    enTransaccion(async (tx) => {
      const [m] = await tx`SELECT macroproceso_id FROM procesos WHERE sigla = 'GTH'`;
      const sigla = `ZQ${Date.now() % 100000}`;
      const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
        VALUES (${m.macroproceso_id}, 'Proceso vacío de prueba', ${sigla}, ${sigla.toLowerCase()}, 'circle', 999) RETURNING id`;
      como(await sesionAdmin(tx));
      const res = await pedir(`?proceso=${p.id}`);
      expect(res.status).toBe(200);
      const filas = await filasDelExcel(res);
      const detalle = filas[3][0];
      expect(detalle).toContain("Proceso: Proceso vacío de prueba");
      expect(detalle).not.toContain(`Proceso: ${p.id}`);
      expect(detalle).toContain("Total: 0");
    }));
});
