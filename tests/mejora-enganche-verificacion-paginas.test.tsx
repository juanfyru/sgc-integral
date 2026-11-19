/**
 * Las páginas con lo de la no conformidad de un hallazgo de verificación (Fase 15B, anexo §7.1, §7.2 y §7.4): la lista de
 * `/distribucion/verificaciones` (la tabla con lo que decide `engancheDeVerificacion` y, filtrada por un punto que acumula hallazgos,
 * la sugerencia del punto encima), la verificación cerrada (`/distribucion/verificaciones/[id]`) y la edición de la no conformidad
 * (`/mejoramiento/[id]/editar`, con lo fijo como texto y solo los procesos del punto). Pintadas sobre la BD de trabajo, dentro de una
 * transacción que se revierte; la sesión y el cliente se sustituyen.
 */
import { renderToReadableStream } from "react-dom/server";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

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
vi.mock("@/app/acciones-distribucion", () => ({
  agregarItemLibreAccion: vi.fn(),
  cerrarHallazgoAccion: vi.fn(),
  cerrarVerificacionAccion: vi.fn(),
  corregirHallazgoAccion: vi.fn(),
  reabrirHallazgoAccion: vi.fn(),
  validarHallazgoAccion: vi.fn(),
  descartarVerificacionAccion: vi.fn(),
  guardarAvanceAccion: vi.fn(),
}));
vi.mock("@/app/acciones-mejoramiento", () => ({ editarHallazgoAccion: vi.fn() }));

import PaginaVerificaciones from "@/app/(app)/distribucion/verificaciones/page";
import PaginaVerificacion from "@/app/(app)/distribucion/verificaciones/[id]/page";
import PaginaEditarHallazgo from "@/app/(app)/mejoramiento/[id]/editar/page";
import { obtenerSql } from "@/db/cliente";
import { corregirHallazgo, reabrirHallazgo } from "@/db/consultas/distribucion/hallazgos";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { registrarHallazgo } from "@/db/consultas/mejoramiento/registro";
import { puntoDePrueba, verificarPunto } from "./utiles/distribucion";
import { baseDeMejora, c, datosDeHallazgo, hallazgoDeVerificacion } from "./utiles/mejoramiento";
import { procesoNuevo } from "./utiles/mixto";
import { revertida } from "./utiles/transaccion";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";

const sql = obtenerSql();
afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const ACUMULA = "Este punto acumula 3 hallazgos en 12 meses. Puede abrir una no conformidad para tratar la causa.";
const JUSTIFICACION = "Es la tercera copia obsoleta del año en este punto";

/** Pinta el elemento que devuelve una página como `sesion`, con la BD en `tx`. */
async function pintar(tx: TransactionSql, sesion: SesionFlujo, pagina: () => Promise<React.ReactElement>): Promise<string> {
  contexto.tx = tx;
  contexto.sesion = sesion;
  try {
    const flujo = await renderToReadableStream(await pagina());
    await flujo.allReady;
    return (await new Response(flujo).text()).replaceAll("<!-- -->", "");
  } finally {
    contexto.tx = null;
    contexto.sesion = null;
  }
}

const lista = (tx: TransactionSql, sesion: SesionFlujo, q: Record<string, string>) =>
  pintar(tx, sesion, () => PaginaVerificaciones({ searchParams: Promise.resolve(q) }));

/** Lo que va de «Hallazgos» (el título de la tabla) en adelante. */
const desdeLaTabla = (html: string) => html.slice(html.indexOf(">Hallazgos</h2>"));

/** Tres hallazgos del mismo punto en los últimos doce meses (la página se pinta con la hora real). */
async function puntoQueAcumula(tx: TransactionSql, responsable: SesionFlujo) {
  const ahora = Date.now();
  const hace = (dias: number) => new Date(ahora - dias * 86_400_000).toISOString();
  const primero = await hallazgoDeVerificacion(tx, { responsable, ahora: hace(3) });
  const otros = [
    await hallazgoDeVerificacion(tx, { responsable, punto: primero.punto, ahora: hace(40), origen: "recogida" }),
    await hallazgoDeVerificacion(tx, { responsable, punto: primero.punto, ahora: hace(80), origen: "recogida" }),
  ];
  return { primero, ids: [primero.id, ...otros.map((x) => x.id)] };
}

describe("/distribucion/verificaciones con lo de mejoramiento", () => {
  it("al Admin SGC: «Abrir no conformidad» en cada fila y, filtrada por el punto que acumula, la sugerencia sobre la tabla", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const { primero } = await puntoQueAcumula(tx, responsable);

      const tabla = desdeLaTabla(await lista(tx, admin, { punto: String(primero.punto.id) }));
      // Encima de la tabla, antes de su primera fila, y además en cada fila.
      expect(tabla.indexOf(ACUMULA)).toBeGreaterThan(0);
      expect(tabla.indexOf(ACUMULA)).toBeLessThan(tabla.indexOf("<table"));
      expect(tabla.split(ACUMULA).length - 1).toBe(4);
      expect(tabla).toContain(`href="/mejoramiento/nuevo?verificacion=${primero.id}"`);
      // Sin el filtro, la sugerencia solo va en las filas.
      const sinFiltro = desdeLaTabla(await lista(tx, admin, {}));
      expect(sinFiltro.indexOf(ACUMULA)).toBeGreaterThan(sinFiltro.indexOf("<table"));

      // Al responsable del punto: la lista de siempre, sin nada de mejoramiento.
      const delResponsable = await lista(tx, responsable, { punto: String(primero.punto.id) });
      expect(delResponsable).toContain("Copia obsoleta del protocolo de triage");
      expect(delResponsable).not.toContain("Abrir no conformidad");
      expect(delResponsable).not.toContain("Puede abrir una no conformidad");
    }));

  it("la sugerencia del punto encima sale aunque todas sus filas se hayan reabierto (ronda 1, punto 4)", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const { primero, ids } = await puntoQueAcumula(tx, responsable);
      const o = { sql: tx, ahora: new Date() };
      for (const id of ids) {
        await corregirHallazgo(id, responsable, "Se retiró la copia vieja del puesto", o);
        await reabrirHallazgo(id, admin, "La copia vieja sigue en el cajón", o);
      }
      const tabla = desdeLaTabla(await lista(tx, admin, { punto: String(primero.punto.id) }));
      expect(tabla.indexOf(ACUMULA)).toBeGreaterThan(0);
      expect(tabla.indexOf(ACUMULA)).toBeLessThan(tabla.indexOf("<table"));
      // En las filas, cada una dice que se reabrió; «acumula» sale una sola vez, encima.
      expect(tabla.split(ACUMULA).length - 1).toBe(1);
      expect(tabla.split("Este hallazgo se reabrió una vez.").length - 1).toBe(3);
    }));
});

describe("/distribucion/verificaciones/[id] cerrada (ronda 1, punto 3)", () => {
  it("cada hallazgo gana «Abrir no conformidad» para el Admin SGC y, abierta, «No conformidad HZ-…»; al responsable, nada que abrir", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const punto = await puntoDePrueba(tx, { responsable });
      const { verificacionId } = await verificarPunto(tx, { verificador: b.admin, punto, ahora: new Date(), respuesta: "no_conforme" });
      const hallazgos = await tx`SELECT id FROM hallazgos WHERE verificacion_id = ${verificacionId} ORDER BY id`;
      expect(hallazgos.length).toBeGreaterThan(0);
      const [primero] = hallazgos.map((f) => Number(f.id));
      const verificacion = (quien: SesionFlujo) =>
        pintar(tx, quien, () => PaginaVerificacion({ params: Promise.resolve({ id: String(verificacionId) }) }));

      const antes = await verificacion(b.admin);
      expect(antes).toMatch(new RegExp(`<a [^>]*href="/mejoramiento/nuevo\\?verificacion=${primero}"[^>]*>Abrir no conformidad</a>`));
      const r = await registrarHallazgo(
        b.admin,
        { ...datosDeHallazgo(b.procesoId), verificacionHallazgoId: primero, accionJustificacion: JUSTIFICACION },
        c(new Date().toISOString(), tx),
      );
      const despues = await verificacion(b.admin);
      expect(despues).not.toContain(`href="/mejoramiento/nuevo?verificacion=${primero}"`);
      expect(despues).toMatch(new RegExp(`<a [^>]*href="/mejoramiento/${r.id}"[^>]*>No conformidad ${r.codigo}</a> · Por aceptar`));
      const delResponsable = await verificacion(responsable);
      expect(delResponsable).not.toContain("Abrir no conformidad");
      expect(delResponsable).not.toContain(`href="/mejoramiento/${r.id}"`);
    }));
});

describe("/mejoramiento/[id]/editar de la no conformidad de un hallazgo de verificación (ronda 1, punto 1)", () => {
  it("la clase y el origen como texto fijo, sin sus selectores, y solo los procesos del punto; sin procesos en el punto, todos", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await procesoNuevo(tx);
      const [{ nombre: delOtro }] = await tx`SELECT nombre FROM procesos WHERE id = ${otro}`;
      const [{ nombre: delPunto }] = await tx`SELECT nombre FROM procesos WHERE id = ${b.procesoId}`;
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const editar = async (procesos: number[]) => {
        const vh = await hallazgoDeVerificacion(tx, { responsable, procesos });
        const { id } = await registrarHallazgo(
          b.admin,
          { ...datosDeHallazgo(b.procesoId), verificacionHallazgoId: vh.id, accionJustificacion: JUSTIFICACION },
          c(new Date().toISOString(), tx),
        );
        return pintar(tx, b.admin, () => PaginaEditarHallazgo({ params: Promise.resolve({ id: String(id) }) }));
      };
      const html = await editar([b.procesoId]);
      expect(html).not.toMatch(/<select[^>]*name="clase"/);
      expect(html).not.toMatch(/<select[^>]*name="origen"/);
      expect(html).toMatch(/<input type="hidden" name="clase" value="no_conformidad"\/>/);
      expect(html).toMatch(/<input type="hidden" name="origen" value="control_documental"\/>/);
      expect(html).toContain("Control documental");
      const procesos = html.match(/<select[^>]*name="procesoId"[^>]*>[\s\S]*?<\/select>/)![0];
      expect(procesos).toContain(delPunto as string);
      expect(procesos).not.toContain(delOtro as string);
      // Sin procesos en el punto, se elige entre todos.
      const sinProcesos = (await editar([])).match(/<select[^>]*name="procesoId"[^>]*>[\s\S]*?<\/select>/)![0];
      expect(sinProcesos).toContain(delOtro as string);

      // Una no conformidad que no nació de una verificación edita la clase y el origen como siempre.
      const { id: comun } = await registrarHallazgo(b.admin, datosDeHallazgo(b.procesoId), c(new Date().toISOString(), tx));
      const normal = await pintar(tx, b.admin, () => PaginaEditarHallazgo({ params: Promise.resolve({ id: String(comun) }) }));
      expect(normal).toMatch(/<select[^>]*name="clase"/);
      expect(normal).toMatch(/<select[^>]*name="origen"/);
    }));
});
