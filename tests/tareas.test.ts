import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import type { ResumenTramite } from "@/db/consultas/tramites";
import type { SesionFlujo } from "@/db/consultas/tramites-flujo";
import { agruparTareas, misTareas, tituloDeTarea } from "@/lib/tareas";
import { documentoLibre, sesionAdmin, sesionDe, tramiteEn, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { sinRevisionAbierta } from "./utiles/vigencia";

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
    (await misTareas(sesion, { sql: tx })).tareas.some((t) => t.enlace === enlaceDe(tramiteId));

  it("en revisión la tarea es del revisor, con su enlace y su vencimiento", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "revision");
    try {
      const [v] = await tx`SELECT numero FROM documento_versiones WHERE id = ${t.versionId}`;
      const [fila] = await tx`SELECT vence_en FROM tramites WHERE id = ${t.tramiteId}`;
      const [doc] = await tx`SELECT d.titulo FROM documentos d JOIN tramites t ON t.documento_id = d.id WHERE t.id = ${t.tramiteId}`;
      const { tareas } = await misTareas(t.revisor, { sql: tx });
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
    expect((await misTareas(lider, { sql: tx })).tareas.find((x) => x.enlace === enlaceDe(t.tramiteId))?.titulo).toMatch(/^Dar el visto bueno a SOL-/);
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

  /**
   * Un proceso que nace en la transacción, con un líder nuevo que además revisa un trámite: sus tareas son solo las que
   * el test le da. Con «lider.gth», los documentos de la demo que estén por revisar se sumarían y, pasados cinco, la
   * agrupación escondería la tarea que se busca.
   */
  async function liderAislado(tx: TransactionSql): Promise<{ sigla: string; lider: SesionFlujo; tramiteId: number }> {
    const [m] = await tx`SELECT macroproceso_id FROM procesos WHERE sigla = 'GTH'`;
    const sigla = `ZT${Date.now() % 100_000}`;
    const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
      VALUES (${m.macroproceso_id}, ${`Proceso de prueba ${sigla}`}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 999) RETURNING id`;
    const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [Number(p.id)] });
    const t = await tramiteEn(tx, "revision", { revisor: lider });
    return { sigla, lider, tramiteId: t.tramiteId };
  }

  /** Un documento del proceso con la revisión vencida hace 86 días al 8 nov 2026 (aprobado fuera el 14 ago 2025). */
  async function vencido(tx: TransactionSql, sigla: string) {
    const d = await documentoLibre(tx, { proceso: sigla, tipo: "PR" });
    await tx`UPDATE documento_versiones SET fecha_aprobacion = '2025-08-14' WHERE documento_id = ${d.id}`;
    return d;
  }

  it("suma la revisión de la vigencia del líder, después de las demás fuentes", () => revertida(sql, async (tx) => {
    await sinRevisionAbierta(tx);
    const { sigla, lider, tramiteId } = await liderAislado(tx);
    const d = await vencido(tx, sigla);
    const { tareas } = await misTareas(lider, { sql: tx, ahora: new Date("2026-11-08T15:00:00Z") });
    const i = tareas.findIndex((x) => x.id === `vigencia:${d.id}`);
    expect(tareas[i]).toMatchObject({
      modulo: "documentos",
      titulo: `Revisar la vigencia de ${d.codigo} v1 · vencida hace 86 días`,
      enlace: `/documentos/${d.codigo.toLowerCase()}`,
    });
    expect(tareas.map((x) => x.id)).toEqual([`tramite:${tramiteId}`, `vigencia:${d.id}`]);
  }));

  it("seis revisiones de vigencia salen como una sola tarea y el total las sigue contando (F13B-R12)", () => revertida(sql, async (tx) => {
    await sinRevisionAbierta(tx);
    const { sigla, lider, tramiteId } = await liderAislado(tx);
    for (let n = 0; n < 6; n++) await vencido(tx, sigla);
    const ahora = new Date("2026-11-08T15:00:00Z");
    const { tareas, total } = await misTareas(lider, { sql: tx, ahora });
    expect(tareas.map((x) => x.id)).toEqual([`tramite:${tramiteId}`, "vigencia"]);
    expect(tareas[1]).toMatchObject({
      modulo: "documentos",
      titulo: "6 documentos por revisar",
      detalle: "El más atrasado venció el 14 de agosto de 2026",
      enlace: "/vigencia/semaforo?estado=vencida",
    });
    expect(total).toBe(7);
  }));
});

describe("agruparTareas", () => {
  const base = { modulo: "documentos" as const, detalle: null, vence: null };
  const acuse = (n: number, vence: Date | null = null) => ({ ...base, id: `acuse:${n}`, titulo: `Confirmar ${n}`, enlace: `/acuses/${n}`, vence });
  const tramite = (n: number) => ({ ...base, id: `tramite:${n}`, titulo: `Tramite ${n}`, enlace: `/tramites/${n}` });

  it("con 7 acuses y 2 trámites devuelve 3 tareas, la agrupada en la posición del primer acuse", () => {
    const tareas = [tramite(1), ...[1, 2, 3, 4, 5, 6, 7].map((n) => acuse(n)), tramite(2)];
    const r = agruparTareas(tareas);
    expect(r.map((t) => t.id)).toEqual(["tramite:1", "acuses", "tramite:2"]);
    expect(r[1]).toMatchObject({ modulo: "documentos", titulo: "7 lecturas por confirmar", detalle: null, vence: null, enlace: "/acuses" });
  });
  it("con 5 acuses no agrupa", () => {
    const tareas = [1, 2, 3, 4, 5].map((n) => acuse(n));
    expect(agruparTareas(tareas)).toEqual(tareas);
  });
  it("vence como la más próxima y lo dice en la zona de la instalación", () => {
    const tareas = [1, 2, 3, 4, 5, 6].map((n) => acuse(n, n === 4 ? new Date("2026-11-10T03:00:00Z") : new Date("2026-12-01T12:00:00Z")));
    const g = agruparTareas(tareas)[0];
    expect(g.vence).toEqual(new Date("2026-11-10T03:00:00Z"));
    expect(g.detalle).toBe("La más próxima vence el 9 de noviembre de 2026");
  });

  const de = (prefijo: string, n: number, vence: Date | null = null) => ({ ...base, id: `${prefijo}:${n}`, titulo: `${prefijo} ${n}`, enlace: `/${prefijo}/${n}`, vence });
  const varias = (prefijo: string, cuantas: number) => Array.from({ length: cuantas }, (_, i) => de(prefijo, i + 1));
  const AHORA = new Date("2026-11-08T15:00:00Z");

  it("seis «vigencia:» se agrupan en una, «6 documentos por revisar», con enlace al semáforo de los vencidos", () => {
    const tareas = [tramite(1), ...varias("vigencia", 6), tramite(2)];
    const r = agruparTareas(tareas, 5, AHORA);
    expect(r.map((t) => t.id)).toEqual(["tramite:1", "vigencia", "tramite:2"]);
    expect(r[1]).toEqual({
      id: "vigencia",
      modulo: "documentos",
      titulo: "6 documentos por revisar",
      detalle: null,
      vence: null,
      enlace: "/vigencia/semaforo?estado=vencida",
    });
  });

  it("los externos por verificar, las ediciones por adoptar y los impactos se agrupan cada uno por su lado (spec 13C §13.1)", () => {
    const tareas = [
      ...varias("vigencia", 5),
      ...varias("externo", 6),
      ...varias("adopcion", 7),
      ...varias("revision", 7),
      ...varias("impacto", 6),
      tramite(1),
    ];
    const r = agruparTareas(tareas, 5, AHORA);
    expect(r.map((t) => t.id)).toEqual([
      ...varias("vigencia", 5).map((t) => t.id),
      "externos",
      "adopciones",
      // La tarea de la campaña ya viene una por proceso: no se agrupa.
      ...varias("revision", 7).map((t) => t.id),
      "impactos",
      "tramite:1",
    ]);
    const grupo = (id: string) => r.find((t) => t.id === id);
    expect(grupo("externos")).toMatchObject({ titulo: "6 externos por verificar", enlace: "/vigencia/externos" });
    expect(grupo("adopciones")).toMatchObject({ titulo: "7 ediciones nuevas por adoptar", enlace: "/vigencia/externos" });
    // Sin una página que liste los impactos pendientes, el grupo lleva al primero, el que vence antes.
    expect(grupo("impactos")).toMatchObject({ titulo: "6 impactos normativos por revisar", enlace: "/impacto/1" });
  });

  it("con cinco de cada fuente no agrupa nada", () => {
    const tareas = ["vigencia", "externo", "adopcion", "impacto", "acuse"].flatMap((p) => varias(p, 5));
    expect(agruparTareas(tareas, 5, AHORA)).toEqual(tareas);
  });

  it("el detalle dice la fecha más próxima, en pasado si ya venció, en la zona de la instalación", () => {
    const pasada = new Date("2026-08-14T17:00:00Z");
    const futura = new Date("2026-12-01T17:00:00Z");
    const conFechas = (prefijo: string, primera: Date) => [de(prefijo, 1, null), de(prefijo, 2, primera), ...[3, 4, 5, 6].map((n) => de(prefijo, n, new Date("2027-03-01T17:00:00Z")))];
    const grupo = (prefijo: string, primera: Date) => agruparTareas(conFechas(prefijo, primera), 5, AHORA)[0];
    expect(grupo("vigencia", pasada)).toMatchObject({ vence: pasada, detalle: "El más atrasado venció el 14 de agosto de 2026" });
    expect(grupo("vigencia", futura).detalle).toBe("El más próximo vence el 1 de diciembre de 2026");
    expect(grupo("externo", futura).detalle).toBe("El más próximo vence el 1 de diciembre de 2026");
    expect(grupo("adopcion", pasada).detalle).toBe("La más atrasada venció el 14 de agosto de 2026");
    expect(grupo("adopcion", futura).detalle).toBe("La más próxima vence el 1 de diciembre de 2026");
    expect(grupo("impacto", futura).detalle).toBe("El más próximo vence el 1 de diciembre de 2026");
  });
});
