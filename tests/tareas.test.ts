import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import type { ResumenTramite } from "@/db/consultas/tramites";
import type { SesionFlujo } from "@/db/consultas/tramites-flujo";
import { misTareas, tituloDeTarea } from "@/lib/tareas";
import { sesionAdmin, sesionDe, tramiteEn, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const resumen: ResumenTramite = {
  id: 7,
  numero: "SOL-2026-014",
  tipo: "modificar",
  etapa: "revision",
  ronda: 1,
  codigo: "GTH-PR-02",
  titulo: "Inducción y reinducción",
  versionNumero: 3,
  procesoNombre: "Talento Humano",
  responsables: [],
  venceEn: null,
};

describe("tituloDeTarea", () => {
  it.each<[Partial<ResumenTramite>, string]>([
    [{ etapa: "visto_bueno", ronda: 0, codigo: null, versionNumero: null }, "Dar el visto bueno a SOL-2026-014"],
    [{ etapa: "aceptacion", ronda: 0, codigo: null, versionNumero: null }, "Aceptar SOL-2026-014"],
    [{ etapa: "elaboracion", ronda: 1 }, "Elaborar GTH-PR-02 v3"],
    [{ etapa: "elaboracion", ronda: 2 }, "Ajustar GTH-PR-02 v3"],
    [{ etapa: "revision" }, "Revisar GTH-PR-02 v3"],
    [{ etapa: "aprobacion" }, "Aprobar GTH-PR-02 v3"],
    [{ etapa: "aprobacion", tipo: "eliminar" }, "Aprobar la eliminación de GTH-PR-02"],
    [{ etapa: "publicacion" }, "Publicar GTH-PR-02 v3"],
    [{ etapa: "publicacion", tipo: "eliminar" }, "Eliminar GTH-PR-02"],
  ])("%j", (parcial, titulo) => {
    expect(tituloDeTarea({ ...resumen, ...parcial })).toBe(titulo);
  });
});

describe("misTareas", () => {
  const enlaceDe = (tramiteId: number) => `/tramites/${tramiteId}`;
  const tiene = async (sesion: SesionFlujo, tx: TransactionSql, tramiteId: number) =>
    (await misTareas(sesion, { sql: tx })).some((t) => t.enlace === enlaceDe(tramiteId));

  it("en revisión la tarea es del revisor, con su enlace y su vencimiento", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      const [v] = await tx`SELECT numero FROM documento_versiones WHERE id = ${t.versionId}`;
      const [fila] = await tx`SELECT vence_en FROM tramites WHERE id = ${t.tramiteId}`;
      const [doc] = await tx`SELECT d.titulo FROM documentos d JOIN tramites t ON t.documento_id = d.id WHERE t.id = ${t.tramiteId}`;
      const tareas = await misTareas(t.revisor, { sql: tx });
      expect(tareas.find((x) => x.enlace === enlaceDe(t.tramiteId))).toEqual({
        id: `tramite:${t.tramiteId}`,
        modulo: "documentos",
        titulo: `Revisar ${t.codigo} v${v.numero}`,
        detalle: doc.titulo,
        vence: fila.vence_en,
        enlace: enlaceDe(t.tramiteId),
      });
      expect(await tiene(t.elaborador, tx, t.tramiteId)).toBe(false);
      expect(await tiene(await usuarioDePrueba(tx, { rol: "consulta" }), tx, t.tramiteId)).toBe(false);
      expect(await tiene(t.admin, tx, t.tramiteId)).toBe(false);          // cancelar o reasignar no es una tarea
    } finally {
      await t.limpiar();
    }
  }));

  it("en publicación la tienen todos los administradores", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "publicacion");
    try {
      for (const admin of [t.admin, t.aprobador, await sesionAdmin(tx)]) {
        expect(await tiene(admin, tx, t.tramiteId)).toBe(true);
      }
      expect(await tiene(t.revisor, tx, t.tramiteId)).toBe(false);
    } finally {
      await t.limpiar();
    }
  }));

  it("el visto bueno es de los líderes del proceso, y la solicitud no es tarea de quien la retiraría", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "visto_bueno");
    const lider = await sesionDe(tx, "lider.gth");
    expect((await misTareas(lider, { sql: tx })).find((x) => x.enlace === enlaceDe(t.tramiteId))?.titulo).toMatch(/^Dar el visto bueno a SOL-/);
    expect(await tiene(t.admin, tx, t.tramiteId)).toBe(false);
  }));

  it("no hace una consulta por trámite", () => revertida(sql, async (tx) => {
    const t1 = await tramiteEn(tx, "elaboracion");
    const contar = async () => {
      let consultas = 0;
      const contada = new Proxy(tx, {
        apply(objetivo, propio, argumentos) {
          consultas += 1;
          return Reflect.apply(objetivo, propio, argumentos);
        },
      });
      await misTareas(t1.revisor, { sql: contada as unknown as Cliente });
      return consultas;
    };
    const conUno = await contar();
    await tramiteEn(tx, "elaboracion", { tipo: "crear", revisor: t1.revisor });
    await tramiteEn(tx, "elaboracion", { tipo: "crear", codigo: "CEX-ZP-02", revisor: t1.revisor });
    expect(await contar()).toBe(conUno);
  }));
});
