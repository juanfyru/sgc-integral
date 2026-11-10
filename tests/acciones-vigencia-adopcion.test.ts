/**
 * La adopción por el camino de la interfaz (F-I1 de la revisión final): el diálogo de «Adoptar esta edición» no envía
 * la verificación que pidió la edición nueva, así que la resuelve el dominio. Se llama a `adoptarEdicionAccion` con un
 * `FormData` real, contra la BD dentro de una transacción que se revierte (el cliente de la app se sustituye por ella);
 * solo la firma y la sesión son de mentira.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const { enCurso, redirect, requerirSesion } = vi.hoisted(() => ({
  enCurso: { sql: null as unknown },
  redirect: vi.fn((destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  }),
  requerirSesion: vi.fn(),
}));

vi.mock("@/db/cliente", async (original) => {
  const real = await original<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => (enCurso.sql ?? real.obtenerSql()) as ReturnType<typeof real.obtenerSql> };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/sesion-actual", () => ({ requerirSesion }));
vi.mock("@/lib/contexto-peticion", () => ({ contextoDePeticion: async () => ({ ip: "10.0.0.1", userAgent: "prueba" }) }));
// La acción no deja pasar un verificador: la clave «ok» pasa con método «clave» y cualquier otra no, sin tocar `accesos`.
vi.mock("@/lib/firma", async (original) => ({
  ...(await original<typeof import("@/lib/firma")>()),
  verificarParaFirmar: async (_sesion: unknown, credenciales: { clave: string }) =>
    credenciales.clave === "ok"
      ? { ok: true, metodo: "clave" }
      : { ok: false, mensaje: "Clave o código incorrectos", sesionCerrada: false },
}));

import { adoptarEdicionAccion } from "@/app/acciones-vigencia";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { abrirEdicion, registrarVerificacion } from "@/db/consultas/vigencia/externos";
import type { ResultadoVerificacion } from "@/lib/vigencia/tipos";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { externoDePrueba, revisionDePrueba, sinRevisionAbierta, type ExternoDePrueba } from "./utiles/vigencia";

const sql = obtenerSql();
const adoptadoEn = new Date("2089-01-15T15:00:00Z");
const ahora = new Date("2090-03-10T15:00:00Z");
const FUENTE = "https://www.minsalud.gov.co/guias";

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-acciones-adopcion-"));
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
  vi.clearAllMocks();
});

function formulario(campos: Record<string, string>) {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries(campos)) datos.append(campo, valor);
  return datos;
}

/** Un líder de prueba de CEX con un externo adoptado; la acción corre en `tx` como ese líder. */
async function preparar(tx: TransactionSql): Promise<{ lider: SesionFlujo; externo: ExternoDePrueba }> {
  const [cex] = await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`;
  const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [Number(cex.id)] });
  const externo = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017", ahora: adoptadoEn });
  enCurso.sql = tx;
  requerirSesion.mockResolvedValue(lider);
  return { lider, externo };
}

/** Verifica el externo con el dominio y devuelve el id de la verificación. */
async function verificar(tx: TransactionSql, lider: SesionFlujo, e: ExternoDePrueba, resultado: ResultadoVerificacion): Promise<number> {
  const r = await registrarVerificacion(lider, { documentoId: e.documentoId, resultado, fuente: FUENTE, nota: null }, { sql: tx, ahora });
  return r.verificacionId;
}

/**
 * Abre la edición «2024» (sin archivo principal: la firma lleva la huella de los datos y el diálogo no manda `huella`)
 * y la adopta por la acción, con el mismo formulario que arma `DialogoAdoptar`.
 */
async function adoptarPorLaAccion(tx: TransactionSql, lider: SesionFlujo, e: ExternoDePrueba): Promise<number> {
  const { versionId } = await abrirEdicion(lider, e.documentoId, { edicion: "2024", fechaEdicion: null, resumenCambios: "Metas de 2024" }, { sql: tx, ahora });
  const resultado = await adoptarEdicionAccion(null, formulario({ versionId: String(versionId), clave: "ok" })).catch((err: Error) => err.message);
  expect(resultado).toBe(`REDIRECT:/vigencia/externos/${e.documentoId}`);
  return versionId;
}

async function detalleDeAdopcion(tx: TransactionSql, documentoId: number) {
  const [a] = await tx`SELECT detalle FROM auditoria WHERE accion = 'externo_adoptado' AND entidad_id = ${documentoId}
    ORDER BY id DESC LIMIT 1`;
  return a.detalle as { verificacionId: number | null; numero: number };
}

describe("adoptarEdicionAccion enlaza la verificación «hay una edición nueva»", () => {
  it("en la revisión anual abierta, la decisión queda «actualizar» con su verificación y pasa a la versión adoptada", () =>
    revertida(sql, async (tx) => {
      try {
        await sinRevisionAbierta(tx);
        const { lider, externo } = await preparar(tx);
        const { revisionId } = await revisionDePrueba(tx, await sesionAdmin(tx), { ahora });
        const verificacionId = await verificar(tx, lider, externo, "edicion_nueva");

        const versionId = await adoptarPorLaAccion(tx, lider, externo);

        const [fila] = await tx`SELECT decision, verificacion_id, version_id FROM revision_anual_decisiones
          WHERE revision_id = ${revisionId} AND documento_id = ${externo.documentoId}`;
        expect({ decision: fila.decision, verificacionId: Number(fila.verificacion_id), versionId: Number(fila.version_id) }).toEqual({
          decision: "actualizar",
          verificacionId,
          versionId,
        });
        expect(await detalleDeAdopcion(tx, externo.documentoId)).toMatchObject({ verificacionId, numero: 2 });
        const [ex] = await tx`SELECT edicion_nueva_pendiente_desde FROM externos WHERE documento_id = ${externo.documentoId}`;
        expect(ex.edicion_nueva_pendiente_desde).toBeNull();
      } finally {
        enCurso.sql = null;
      }
    }));

  it("fuera de la campaña, la bitácora de la adopción enlaza la última «edición nueva» de la vigente", () =>
    revertida(sql, async (tx) => {
      try {
        await sinRevisionAbierta(tx);
        const { lider, externo } = await preparar(tx);
        await verificar(tx, lider, externo, "edicion_nueva");
        const ultima = await verificar(tx, lider, externo, "edicion_nueva");

        await adoptarPorLaAccion(tx, lider, externo);

        expect((await detalleDeAdopcion(tx, externo.documentoId)).verificacionId).toBe(ultima);
      } finally {
        enCurso.sql = null;
      }
    }));

  it("una «sigue vigente» posterior borra la edición pendiente: la adopción no enlaza ninguna verificación", () =>
    revertida(sql, async (tx) => {
      try {
        await sinRevisionAbierta(tx);
        const { lider, externo } = await preparar(tx);
        await verificar(tx, lider, externo, "edicion_nueva");
        await verificar(tx, lider, externo, "vigente");

        await adoptarPorLaAccion(tx, lider, externo);

        expect((await detalleDeAdopcion(tx, externo.documentoId)).verificacionId).toBeNull();
      } finally {
        enCurso.sql = null;
      }
    }));
});
