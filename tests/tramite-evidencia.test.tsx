/**
 * La página del trámite conserva la evidencia de la revisión después de cerrarse (spec 13A §6.5 y
 * §9.3). Pinta la página real sobre un trámite de verdad, dentro de una transacción que se revierte.
 */
import { existsSync } from "node:fs";
import { renderToReadableStream } from "react-dom/server";
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

import PaginaTramite, { generateMetadata } from "@/app/(app)/tramites/[id]/page";
import { obtenerSql } from "@/db/cliente";
import {
  cerrarObservacion,
  crearObservacion,
  guardarVerificacion,
  listarItemsVerificacion,
  responderObservacion,
} from "@/db/consultas/revision";
import { transicionar, type SesionFlujo } from "@/db/consultas/tramites-flujo";
import { opc, sesionAdmin, sesionDe, tramiteEn } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

/** La página como la recibe `sesion`, leyendo por la transacción del test. */
async function pagina(tx: TransactionSql, tramiteId: number, sesion: SesionFlujo): Promise<string> {
  contexto.tx = tx;
  contexto.sesion = sesion;
  try {
    const elemento = await PaginaTramite({ params: Promise.resolve({ id: String(tramiteId) }) });
    const flujo = await renderToReadableStream(elemento);
    await flujo.allReady;
    return await new Response(flujo).text();
  } finally {
    contexto.tx = null;
  }
}

const firma = { credenciales: { clave: "x" } };

/** Devuelve con una observación y deja la ronda 2 respondida, con la observación cerrada y el concepto dado. */
async function dosRondas(tx: TransactionSql, t: Awaited<ReturnType<typeof tramiteEn>>) {
  const { tramiteId, revisor, elaborador } = t;
  const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
  await guardarVerificacion(
    tramiteId,
    revisor,
    items.map((i, n) => ({ itemId: i.id, resultado: "cumple" as const, ...(n === 1 ? { nota: "Revisar el numeral 5." } : {}) })),
    { etapa: "revision", ronda: 1 },
    { sql: tx },
  );
  const observacion = await crearObservacion(tramiteId, revisor, "Falta el responsable del numeral 5.", { etapa: "revision", ronda: 1 }, { sql: tx });
  await transicionar(revisor, { tramiteId, accion: "devolver_revision", etapaEsperada: "revision", rondaEsperada: 1 }, opc(tx));
  await responderObservacion(observacion, elaborador, "Se añadió el responsable.", { etapa: "elaboracion", ronda: 2 }, { sql: tx });
  await transicionar(elaborador, { tramiteId, accion: "enviar_a_revision", etapaEsperada: "elaboracion", rondaEsperada: 2, ...firma }, opc(tx));
  await guardarVerificacion(tramiteId, revisor, items.map((i) => ({ itemId: i.id, resultado: "cumple" as const })), { etapa: "revision", ronda: 2 }, { sql: tx });
  await cerrarObservacion(observacion, revisor, { etapa: "revision", ronda: 2 }, { sql: tx });
  await transicionar(revisor, { tramiteId, accion: "concepto_favorable", etapaEsperada: "revision", rondaEsperada: 2, datos: { concepto: "Atendido." }, ...firma }, opc(tx));
}

describe("la página del trámite cerrado", () => {
  it("publicado: Control Interno ve cada ronda, cada observación y ningún control", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      await dosRondas(tx, t);
      await transicionar(t.aprobador, { tramiteId: t.tramiteId, accion: "aprobar", etapaEsperada: "aprobacion", rondaEsperada: 2, datos: { concepto: "Aprobado." }, ...firma }, opc(tx));
      await transicionar(t.admin, { tramiteId: t.tramiteId, accion: "publicar", etapaEsperada: "publicacion", rondaEsperada: 2, ...firma }, opc(tx));

      const html = await pagina(tx, t.tramiteId, await sesionDe(tx, "control.interno"));
      expect(html).toContain("Lista de verificación");
      expect(html).toContain("Ronda 2");
      expect(html).toContain("Ronda 1");
      expect(html).toContain("Nota: Revisar el numeral 5.");
      expect(html).toContain("Falta el responsable del numeral 5.");
      expect(html).toContain("Respuesta: Se añadió el responsable.");
      expect(html).toContain("Cerró ");
      expect(html).not.toContain("<form");
      expect(html).not.toContain("Sin responder");
    } finally {
      await t.limpiar();
    }
  }));

  it("cancelado en revisión: el participante conserva lo observado, y el borrador no vuelve", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      await crearObservacion(t.tramiteId, t.revisor, "Falta el responsable del numeral 5.", { etapa: "revision", ronda: 1 }, { sql: tx });
      await transicionar(t.admin, { tramiteId: t.tramiteId, accion: "cancelar", etapaEsperada: "revision", rondaEsperada: 1, datos: { motivo: "Ya no se necesita." } }, opc(tx));

      const html = await pagina(tx, t.tramiteId, t.elaborador);
      expect(html).toContain("Falta el responsable del numeral 5.");
      expect(html).toContain("No se guardaron respuestas.");
      expect(html).not.toContain("<form");
      // Los archivos se rigen por su versión: la página del trámite cerrado no ofrece ninguno.
      expect(html).not.toContain("/archivos/");
    } finally {
      await t.limpiar();
    }
  }));

  it("cancelado antes de la revisión: no hay bloque vacío", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aceptacion");
    const admin = await sesionAdmin(tx);
    await transicionar(admin, { tramiteId: t.tramiteId, accion: "cancelar", etapaEsperada: "aceptacion", rondaEsperada: 0, datos: { motivo: "Ya no se necesita." } }, opc(tx));

    const html = await pagina(tx, t.tramiteId, admin);
    expect(html).toContain("La solicitud");
    expect(html).not.toContain("Lista de verificación");
    expect(html).not.toContain("Observaciones");
  }));
});

describe("la ronda 2 con la lista desactivada", () => {
  it("sin ítems activos no hay concepto: el panel lo dice y el servidor lo rechaza con el mismo mensaje", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
      await guardarVerificacion(t.tramiteId, t.revisor, items.map((i) => ({ itemId: i.id, resultado: "cumple" as const })), { etapa: "revision", ronda: 1 }, { sql: tx });
      const observacion = await crearObservacion(t.tramiteId, t.revisor, "Falta el responsable.", { etapa: "revision", ronda: 1 }, { sql: tx });
      await transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "devolver_revision", etapaEsperada: "revision", rondaEsperada: 1 }, opc(tx));
      await responderObservacion(observacion, t.elaborador, "Se añadió.", { etapa: "elaboracion", ronda: 2 }, { sql: tx });
      await transicionar(t.elaborador, { tramiteId: t.tramiteId, accion: "enviar_a_revision", etapaEsperada: "elaboracion", rondaEsperada: 2, ...firma }, opc(tx));
      await cerrarObservacion(observacion, t.revisor, { etapa: "revision", ronda: 2 }, { sql: tx });
      await tx`UPDATE lista_verificacion_items SET activo = false`;

      const html = await pagina(tx, t.tramiteId, t.revisor);
      expect(html).not.toContain("Se propone lo respondido");
      expect(html).not.toContain("Guarde el avance de la lista");
      expect(html).toContain("No hay ítems activos en la lista de verificación. Pida al Administrador del SGC que los active.");
      await expect(tx.savepoint(() => transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "concepto_favorable", etapaEsperada: "revision", rondaEsperada: 2, datos: { concepto: "Atendido." }, ...firma }, opc(tx))))
        .rejects.toThrow("No hay ítems activos en la lista de verificación. Pida al Administrador del SGC que los active.");
    } finally {
      await t.limpiar();
    }
  }));
});

describe("el título de la pestaña", () => {
  it("no delata nada: ajeno, inexistente o no numérico dicen lo mismo", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "aceptacion");
    contexto.tx = tx;
    try {
      const titulo = async (id: string) => (await generateMetadata({ params: Promise.resolve({ id }) })).title;
      contexto.sesion = await sesionDe(tx, "lider.gth");
      expect(await titulo(String(t.tramiteId))).toBe("Trámite");
      expect(await titulo("999999999")).toBe("Página no encontrada");
      expect(await titulo("abc")).toBe("Página no encontrada");
      contexto.sesion = await sesionDe(tx, "lider.cex");
      expect(await titulo(String(t.tramiteId))).toBe("Página no encontrada");
    } finally {
      contexto.tx = null;
    }
  }));
});

describe("la página del trámite abierto", () => {
  it("en ajustes, quien elabora ve las notas por ítem de la ronda anterior", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
      await guardarVerificacion(t.tramiteId, t.revisor, [{ itemId: items[1].id, resultado: "no_cumple", nota: "Revisar el numeral 5." }], { etapa: "revision", ronda: 1 }, { sql: tx });
      await crearObservacion(t.tramiteId, t.revisor, "Falta el responsable.", { etapa: "revision", ronda: 1 }, { sql: tx });
      await transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "devolver_revision", etapaEsperada: "revision", rondaEsperada: 1 }, opc(tx));

      const html = await pagina(tx, t.tramiteId, t.elaborador);
      expect(html).toContain("Lista de verificación de la ronda 1");
      expect(html).toContain("Nota: Revisar el numeral 5.");
      expect(html).not.toContain('name="resultado_');
    } finally {
      await t.limpiar();
    }
  }));

  it("en la ronda 2, quien solo mira no ve «Sin responder»: ve de qué ronda es cada respuesta", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
      await guardarVerificacion(t.tramiteId, t.revisor, items.map((i) => ({ itemId: i.id, resultado: "cumple" as const })), { etapa: "revision", ronda: 1 }, { sql: tx });
      const observacion = await crearObservacion(t.tramiteId, t.revisor, "Falta el responsable.", { etapa: "revision", ronda: 1 }, { sql: tx });
      await transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "devolver_revision", etapaEsperada: "revision", rondaEsperada: 1 }, opc(tx));
      await responderObservacion(observacion, t.elaborador, "Se añadió.", { etapa: "elaboracion", ronda: 2 }, { sql: tx });
      await transicionar(t.elaborador, { tramiteId: t.tramiteId, accion: "enviar_a_revision", etapaEsperada: "elaboracion", rondaEsperada: 2, ...firma }, opc(tx));

      const elaborador = await pagina(tx, t.tramiteId, t.elaborador);
      expect(elaborador).toContain("Ronda 2, en curso: todavía sin respuestas guardadas.");
      expect(elaborador).toContain("Ronda 1");
      expect(elaborador).not.toContain("Sin responder");
      expect(elaborador).not.toContain('name="resultado_');

      const revisor = await pagina(tx, t.tramiteId, t.revisor);
      expect(revisor).toContain('name="resultado_');
    } finally {
      await t.limpiar();
    }
  }));
});
