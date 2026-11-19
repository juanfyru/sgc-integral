/**
 * La página de la no conformidad que nació de un hallazgo de verificación (`/mejoramiento/[id]`; Fase 15B, anexo §7.2, maqueta 6):
 * después de «2. Corrección», que es la de ese hallazgo de verificación, «Acción correctiva · Requerida: «…»», con quién la decidió, a
 * quien ve el hallazgo completo. La decisión sigue además dentro de «2. Corrección» para todo el que la veía en la 15A, también quien ve
 * el hallazgo solo por su actividad (lo que esta entrega añade no le quita nada). Pintada sobre la BD de trabajo, dentro de una transacción
 * que se revierte; la sesión y el cliente se sustituyen.
 */
import { renderToReadableStream } from "react-dom/server";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

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
  usePathname: () => "/",
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import PaginaHallazgo from "@/app/(app)/mejoramiento/[id]/page";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { registrarHallazgo } from "@/db/consultas/mejoramiento/registro";
import { baseDeMejora, c, datosDeHallazgo, hallazgoDeVerificacion, hallazgoEn } from "./utiles/mejoramiento";
import { revertida } from "./utiles/transaccion";
import { usuarioDePrueba } from "./utiles/tramites";

const sql = obtenerSql();
afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const AHORA = "2026-11-18T15:00:00Z";
const JUSTIFICACION = "Es la tercera copia obsoleta del año en este punto";

async function pintar(tx: TransactionSql, sesion: SesionFlujo, id: number): Promise<string> {
  contexto.tx = tx;
  contexto.sesion = sesion;
  try {
    const flujo = await renderToReadableStream(await PaginaHallazgo({ params: Promise.resolve({ id: String(id) }), searchParams: Promise.resolve({}) }));
    await flujo.allReady;
    return (await new Response(flujo).text()).replaceAll("<!-- -->", "");
  } finally {
    contexto.tx = null;
    contexto.sesion = null;
  }
}

const nombreDe = async (tx: TransactionSql, s: SesionFlujo) => (await tx`SELECT nombre FROM usuarios WHERE id = ${s.usuarioId}`)[0].nombre as string;

describe("la página de la no conformidad de un hallazgo de verificación", () => {
  it("a quien la ve completa: «Acción correctiva · Requerida: «…»», con quién la decidió, después de «2. Corrección»", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const vh = await hallazgoDeVerificacion(tx, { responsable, procesos: [b.procesoId] });
      const { id } = await registrarHallazgo(
        b.admin,
        { ...datosDeHallazgo(b.procesoId), verificacionHallazgoId: vh.id, accionJustificacion: JUSTIFICACION },
        c(AHORA, tx),
      );
      for (const quien of [b.admin, b.lider]) {
        const html = await pintar(tx, quien, id);
        expect(html).toMatch(/<h2 [^>]*>Acción correctiva<\/h2>/);
        expect(html).toContain(`Requerida: «${JUSTIFICACION}»`);
        expect(html).toContain(`La decidió al abrir la no conformidad: ${await nombreDe(tx, b.admin)}, `);
        // Va después de la corrección, que es la del hallazgo de verificación.
        expect(html.indexOf("2. Corrección")).toBeGreaterThan(-1);
        expect(html.indexOf("Acción correctiva</h2>")).toBeGreaterThan(html.indexOf("2. Corrección"));
        // Y dentro de «2. Corrección», como antes.
        expect(html).toContain("¿Requiere acción correctiva?");
      }
    }));

  it("a quien la ve solo por su actividad: la decisión dentro de «2. Corrección», como en la 15A, sin la pieza a la vista", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const persona = await usuarioDePrueba(tx, { rol: "consulta" });
      const h = await hallazgoEn(tx, b, "en_ejecucion", undefined, { responsableId: persona.usuarioId });
      const [f] = await tx`SELECT accion_justificacion FROM mejora_hallazgos WHERE id = ${h.id}`;
      const justificacion = f.accion_justificacion as string;
      // La común (15A): su decisión va dentro de «2. Corrección», sin la pieza de la 15B, a quien la ve completa y a quien la ve por su
      // actividad.
      for (const quien of [b.admin, persona]) {
        const comun = await pintar(tx, quien, h.id);
        expect(comun).not.toMatch(/<h2 [^>]*>Acción correctiva<\/h2>/);
        expect(comun).toContain("¿Requiere acción correctiva?");
        expect(comun).toContain(justificacion);
      }

      // La misma, enlazada a un hallazgo de verificación.
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const vh = await hallazgoDeVerificacion(tx, { responsable, procesos: [b.procesoId] });
      await tx`UPDATE mejora_hallazgos SET verificacion_hallazgo_id = ${vh.id} WHERE id = ${h.id}`;
      expect(await pintar(tx, b.admin, h.id)).toContain(`Requerida: «${justificacion}»`);
      // Quien la ve por su actividad sigue leyendo lo que leía: la decisión en «2. Corrección», sin la pieza a la vista.
      const porSuActividad = await pintar(tx, persona, h.id);
      expect(porSuActividad).not.toMatch(/<h2 [^>]*>Acción correctiva<\/h2>/);
      expect(porSuActividad).toContain("¿Requiere acción correctiva?");
      expect(porSuActividad).toContain(justificacion);
    }));
});
