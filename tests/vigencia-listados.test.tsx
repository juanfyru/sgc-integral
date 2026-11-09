/**
 * El estado de vigencia donde ya se miran los documentos (spec 13C §7.2 y §14.4): Gestión de documentos, la
 * página del proceso y el Listado Maestro. Contra la BD de desarrollo, dentro de una transacción que se revierte;
 * las páginas se pintan de verdad, con la sesión y la conexión de la prueba.
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
}));

import type { TransactionSql } from "postgres";
import PaginaMaestro from "@/app/(app)/admin/(panel)/maestro/page";
import PaginaDocumentosAdmin from "@/app/(app)/admin/(panel)/page";
import VistaProceso from "@/app/(app)/procesos/[slug]/page";
import { ResumenVigencia } from "@/componentes/vigencia/ResumenVigencia";
import { obtenerSql } from "@/db/cliente";
import { listarDocumentosAdmin } from "@/db/consultas/admin";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { obtenerDocumentosDeProceso, obtenerDocumentosDeSubproceso, resumenVigenciaDeProceso } from "@/db/consultas/procesos";
import { fijarProximaRevision, listarSemaforo } from "@/db/consultas/vigencia/semaforo";
import { textoVigenciaDeFila } from "@/lib/vigencia/semaforo";
import { documentoLibre, sesionAdmin, sesionDe, tramiteEn, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { vigenteFuera } from "./utiles/vigencia";

const sql = obtenerSql();
const ahora = new Date("2026-11-08T15:00:00Z");

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-vigencia-listados-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

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

const sinEtiquetas = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("Gestión de documentos", () => {
  it("las páginas que solo relacionan documentos no calculan la vigencia", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const vencido = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14" });
      const filas = await listarDocumentosAdmin(admin, { sql: tx, ahora, vigencia: false });
      expect(filas.find((f) => f.id === vencido.id)).toMatchObject({ versionVigente: 1, vigencia: null });
    }));

  it("cada fila trae su origen y su vigencia; lo que no está vigente no tiene semáforo", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const vencido = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14" });
      const obsoleto = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
      await tx`UPDATE documento_versiones SET estado = 'obsoleto' WHERE documento_id = ${obsoleto.id}`;

      const filas = await listarDocumentosAdmin(admin, { sql: tx, ahora });
      expect(filas.find((f) => f.id === vencido.id)).toMatchObject({ origen: "interno", vigencia: { estado: "vencida", dias: -86 } });
      expect(filas.find((f) => f.id === obsoleto.id)).toMatchObject({ origen: "interno", vigencia: null });

      const html = await pintar(tx, admin, () => PaginaDocumentosAdmin());
      expect(html).toContain(">Vigencia<");
      // Junto a «Registrar documento ya aprobado», el alta de un externo (spec 13C §14.4), para quien los gestiona.
      expect(html).toMatch(/<a[^>]*href="\/vigencia\/externos\/nuevo"[^>]*>Registrar documento externo<\/a>/);
      expect(sinEtiquetas(html)).toMatch(new RegExp(`${vencido.codigo} ${vencido.titulo} Procedimiento GTH Vigente Vencida hace \\d+ días`));
    }));

  it("«Registrar documento externo» lo ve solo quien tiene `externos.gestionar` (13C, resolución 7 de la Tarea 14)", () =>
    revertida(sql, async (tx) => {
      const boton = /<a[^>]*href="\/vigencia\/externos\/nuevo"[^>]*>Registrar documento externo<\/a>/;
      const admin = await sesionAdmin(tx);
      // El Admin SGC, con «Registrar documento ya aprobado» (si la publicación directa está encendida) y el de externos.
      const delAdmin = await pintar(tx, admin, () => PaginaDocumentosAdmin());
      expect(delAdmin).toMatch(boton);
      expect(delAdmin.indexOf("Registrar documento externo")).toBeGreaterThan(delAdmin.indexOf("<h1"));
      // Control Interno entra a Gestión (ve el historial) pero no gestiona externos.
      expect(await pintar(tx, await usuarioDePrueba(tx, { rol: "control_interno" }), () => PaginaDocumentosAdmin())).not.toContain("Registrar documento externo");
      // Un líder con la marca `ver_historial` entra al panel y sí gestiona los externos de sus procesos.
      const lider = { ...(await usuarioDePrueba(tx, { rol: "lider_proceso" })), verHistorial: true };
      expect(await pintar(tx, lider, () => PaginaDocumentosAdmin())).toMatch(boton);
    }));
});

describe("el texto del chip en las listas", () => {
  it("un documento en trámite dice en Gestión y en la página del proceso lo mismo que en el semáforo", () =>
    revertida(sql, async (tx) => {
      const t = await tramiteEn(tx, "elaboracion");
      try {
        const admin = await sesionAdmin(tx);
        const lider = await sesionDe(tx, "lider.gth");
        const [doc] = await tx`SELECT d.id, d.titulo FROM tramites tr JOIN documentos d ON d.id = tr.documento_id WHERE tr.id = ${t.tramiteId}`;
        const id = Number(doc.id);
        const [gth] = await tx`SELECT id, slug FROM procesos WHERE sigla = 'GTH'`;
        const delSemaforo = async (conAhora?: Date) =>
          textoVigenciaDeFila((await listarSemaforo(admin, { estado: "todos" }, { sql: tx, ahora: conAhora })).find((f) => f.documentoId === id)!);
        const texto = await delSemaforo(ahora);
        expect(texto).toMatch(/^En trámite · elaboración/);

        expect((await listarDocumentosAdmin(admin, { sql: tx, ahora })).find((f) => f.id === id)?.vigencia).toMatchObject({ estado: "en_tramite", texto });
        expect((await obtenerDocumentosDeProceso(Number(gth.id), false, lider, { sql: tx, ahora })).find((d) => d.id === id)?.vigencia).toMatchObject({
          estado: "en_tramite",
          texto,
        });

        // Las páginas calculan con la hora real: el texto esperado también.
        const ahoraReal = await delSemaforo();
        const gestion = sinEtiquetas(await pintar(tx, admin, () => PaginaDocumentosAdmin()));
        // Vigente y, para quien administra, el borrador del trámite; después, la vigencia.
        expect(gestion).toContain(`${t.codigo} ${doc.titulo} Procedimiento GTH Vigente Borrador ${ahoraReal} `);
        const pagina = sinEtiquetas(
          await pintar(tx, lider, () => VistaProceso({ params: Promise.resolve({ slug: gth.slug }), searchParams: Promise.resolve({}) })),
        );
        expect(pagina).toContain(`${t.codigo} v1 ${ahoraReal}`);
      } finally {
        await t.limpiar();
      }
    }));
});

describe("página del proceso", () => {
  it("cada documento lleva su vigencia, y el resumen cuenta solo lo que la persona ve", () =>
    revertida(sql, async (tx) => {
      const lider = await sesionDe(tx, "lider.gth");
      const [gth] = await tx`SELECT id, slug FROM procesos WHERE sigla = 'GTH'`;
      const gthId = Number(gth.id);
      const consulta = await usuarioDePrueba(tx, { rol: "consulta" });
      const antesLider = await resumenVigenciaDeProceso(gthId, lider, { sql: tx, ahora });
      const antesConsulta = await resumenVigenciaDeProceso(gthId, consulta, { sql: tx, ahora });

      const vencido = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14" });
      const pronto = await vigenteFuera(tx, { fechaAprobacion: "2025-12-14" });
      const restringido = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14" });
      await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${restringido.id}`;

      const docs = await obtenerDocumentosDeProceso(gthId, false, lider, { sql: tx, ahora });
      expect(docs.find((d) => d.id === vencido.id)?.vigencia).toEqual({ estado: "vencida", dias: -86, texto: "Vencida hace 86 días" });
      expect(docs.find((d) => d.id === pronto.id)?.vigencia).toEqual({ estado: "atencion", dias: 36, texto: "Vence en 36 días" });

      expect(await resumenVigenciaDeProceso(gthId, lider, { sql: tx, ahora })).toEqual({
        vencidas: antesLider.vencidas + 2,
        atencion: antesLider.atencion + 1,
      });
      // El restringido no existe para quien no está asignado a GTH: ni en la lista ni en el conteo.
      expect((await obtenerDocumentosDeProceso(gthId, false, consulta, { sql: tx, ahora })).some((d) => d.id === restringido.id)).toBe(false);
      expect(await resumenVigenciaDeProceso(gthId, consulta, { sql: tx, ahora })).toEqual({
        vencidas: antesConsulta.vencidas + 1,
        atencion: antesConsulta.atencion + 1,
      });

      const html = sinEtiquetas(
        await pintar(tx, lider, () => VistaProceso({ params: Promise.resolve({ slug: gth.slug }), searchParams: Promise.resolve({}) })),
      );
      expect(html).toMatch(/\d+ con revisión vencida/);
      expect(html).toMatch(/\d+ en atención/);
      expect(html).toMatch(new RegExp(`${vencido.codigo} v1 Vencida hace \\d+ días`));
    }));

  it("en la página del subproceso también", () =>
    revertida(sql, async (tx) => {
      const lider = await sesionDe(tx, "lider.gth");
      const [s] = await tx`SELECT s.id, s.slug FROM subprocesos s JOIN procesos p ON p.id = s.proceso_id
        WHERE p.sigla = 'GTH' AND s.activo ORDER BY s.orden LIMIT 1`;
      const d = await documentoLibre(tx, { proceso: "GTH", tipo: "PR", subproceso: s.slug });
      await tx`UPDATE documento_versiones SET fecha_aprobacion = '2025-08-14' WHERE documento_id = ${d.id}`;
      const docs = await obtenerDocumentosDeSubproceso(Number(s.id), lider, { sql: tx, ahora });
      expect(docs.find((x) => x.id === d.id)?.vigencia).toEqual({ estado: "vencida", dias: -86, texto: "Vencida hace 86 días" });
    }));

  it("el resumen no se muestra si no hay nada vencido ni en atención", () => {
    expect(renderToStaticMarkup(<ResumenVigencia vencidas={0} atencion={0} />)).toBe("");
    const solo = sinEtiquetas(renderToStaticMarkup(<ResumenVigencia vencidas={0} atencion={2} />));
    expect(solo).toContain("2 en atención");
    expect(solo).not.toContain("vencida");
    expect(sinEtiquetas(renderToStaticMarkup(<ResumenVigencia vencidas={1} atencion={0} />))).toContain("1 con revisión vencida");
  });
});

describe("Listado Maestro", () => {
  it("la página trae las columnas de origen, edición, revisión y vigencia", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const d = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14" });
      const html = await pintar(tx, admin, () => PaginaMaestro({ searchParams: Promise.resolve({}) }));
      for (const cabecera of ["Origen", "Edición", "Última revisión", "Próxima revisión", "Vigencia"]) {
        expect(html).toContain(`>${cabecera}<`);
      }
      expect(sinEtiquetas(html)).toContain(
        `${d.codigo} ${d.titulo} Procedimiento Interno 1 — Vigente 2025-08-14 — — Prueba Fuera de la plataforma 2025-08-14 2026-08-14 Vencida Gestión del Talento Humano`,
      );
    }));

  it("la próxima revisión fijada a mano dice quién y cuándo, con el formato del semáforo", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const d = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14" });
      await fijarProximaRevision(admin, { documentoIds: [d.id], fecha: "2026-12-15", nota: "Carga inicial" }, { sql: tx, ahora });
      const html = sinEtiquetas(await pintar(tx, admin, () => PaginaMaestro({ searchParams: Promise.resolve({}) })));
      expect(html).toContain(`2025-08-14 2026-12-15 Fijada por ${admin.nombre} el 8 nov 2026 `);
    }));
});
