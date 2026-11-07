/**
 * Un acuse de un documento restringido deja de existir para quien ya no puede ver el documento (spec 13B
 * §6.4 y 13A §12): no está en «Mis tareas», «Mis lecturas» ni en `/acuses/[id]`. Al cambiarle el rol, los
 * pendientes de lo que deja de ver se retiran. Contra la BD de desarrollo, en transacciones que se revierten.
 */
import { existsSync } from "node:fs";
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
}));

import PaginaAcuse from "@/app/(app)/acuses/[id]/page";
import { obtenerSql } from "@/db/cliente";
import { acusesPropios, confirmarLectura, obtenerAcuse } from "@/db/consultas/distribucion/acuses";
import { tareasDeAcuses } from "@/db/consultas/distribucion/tareas";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { editarUsuario } from "@/db/consultas/usuarios";
import { ErrorDistribucion } from "@/lib/distribucion/tipos";
import { datosDeUsuario } from "./utiles/distribucion";
import { documentoLibre, sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
const T1 = new Date("2026-11-20T15:00:00Z");

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

/** Un acuse pendiente de la vigente del documento, escrito directo: lo que se prueba es quién lo ve después. */
async function acusePendiente(tx: TransactionSql, documentoId: number, usuarioId: number): Promise<number> {
  const [a] = await tx`INSERT INTO acuses (version_id, usuario_id, origen, estado, creado_en, vence_en)
    SELECT id, ${usuarioId}, 'solicitud_manual', 'pendiente', ${T1}, ${new Date("2026-12-05T04:59:59Z")}
    FROM documento_versiones WHERE documento_id = ${documentoId} AND estado = 'vigente'
    RETURNING id`;
  return Number(a.id);
}

async function restringido(tx: TransactionSql) {
  const doc = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
  await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${doc.id}`;
  return doc;
}

/** La página de la tarea como la recibe `sesion`; lanza «no encontrada» si no la ve. */
async function pagina(tx: TransactionSql, sesion: SesionFlujo, id: number) {
  contexto.tx = tx;
  contexto.sesion = sesion;
  try {
    return await PaginaAcuse({ params: Promise.resolve({ id: String(id) }) });
  } finally {
    contexto.tx = null;
    contexto.sesion = null;
  }
}

describe("acuses de un documento restringido", () => {
  it("quien deja de ver el documento no ve la tarea, ni la lectura, ni su página, ni puede confirmarla", () =>
    revertida(sql, async (tx) => {
      const [gth] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
      const persona = await usuarioDePrueba(tx, { rol: "consulta", procesos: [Number(gth.id)] });
      const doc = await restringido(tx);
      const acuseId = await acusePendiente(tx, doc.id, persona.usuarioId);

      expect((await tareasDeAcuses(persona, { sql: tx })).map((t) => t.id)).toContain(`acuse:${acuseId}`);
      expect(await obtenerAcuse(acuseId, persona, { sql: tx })).not.toBeNull();
      await expect(pagina(tx, persona, acuseId)).resolves.toBeTruthy();

      // Sale del proceso por fuera de la plataforma: el acuse sigue pendiente, pero el documento ya no es visible.
      await tx`DELETE FROM usuario_procesos WHERE usuario_id = ${persona.usuarioId}`;
      expect((await tareasDeAcuses(persona, { sql: tx })).map((t) => t.id)).not.toContain(`acuse:${acuseId}`);
      expect(await obtenerAcuse(acuseId, persona, { sql: tx })).toBeNull();
      expect((await acusesPropios(persona.usuarioId, { sql: tx })).map((a) => a.id)).not.toContain(acuseId);
      await expect(pagina(tx, persona, acuseId)).rejects.toThrow("no encontrada");
      await expect(confirmarLectura(acuseId, persona, { sql: tx })).rejects.toSatisfy(
        (e) => e instanceof ErrorDistribucion && e.message === "La tarea no existe",
      );
    }));

  it("al cambiarle el rol se retiran los pendientes de lo que deja de ver; los demás siguen", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const persona = await usuarioDePrueba(tx, { rol: "control_interno" });
      const doc = await restringido(tx);
      const general = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
      const deRestringido = await acusePendiente(tx, doc.id, persona.usuarioId);
      const deGeneral = await acusePendiente(tx, general.id, persona.usuarioId);

      await editarUsuario(persona.usuarioId, { ...(await datosDeUsuario(tx, persona.usuarioId)), rol: "consulta" }, admin.usuarioId, {
        sql: tx,
        ahora: T1,
      });

      const filas = await tx`SELECT id, estado, motivo_cierre FROM acuses WHERE id IN ${tx([deRestringido, deGeneral])} ORDER BY id`;
      expect(filas.map((f) => [Number(f.id), f.estado, f.motivo_cierre])).toEqual([
        [deRestringido, "retirado", "perdio_acceso"],
        [deGeneral, "pendiente", null],
      ]);
      const [evento] = await tx`SELECT tipo, detalle FROM acuse_eventos WHERE acuse_id = ${deRestringido} ORDER BY id DESC LIMIT 1`;
      expect(evento).toMatchObject({ tipo: "retirado", detalle: { motivo: "perdio_acceso" } });

      const sesion = { ...persona, rol: "consulta" as const };
      expect((await tareasDeAcuses(sesion, { sql: tx })).map((t) => t.id)).toEqual([`acuse:${deGeneral}`]);
      await expect(pagina(tx, sesion, deRestringido)).rejects.toThrow("no encontrada");
    }));
});
