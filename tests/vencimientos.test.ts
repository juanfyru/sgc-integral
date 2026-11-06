/**
 * Avisos de vencimiento y escalamiento al jefe. Cada caso silencia los demás trámites abiertos:
 * `revisarVencimientos` los recorre todos, y una demo puede traer vencidos.
 */
import { existsSync } from "node:fs";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import type { TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { aFilaTramite } from "@/db/consultas/tramites";
import { transicionar } from "@/db/consultas/tramites-flujo";
import { responsablesDe, revisarVencimientos } from "@/db/consultas/vencimientos";
import { opc, sesionDe, tramiteEn, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const silenciarOtros = (tx: TransactionSql, tramiteId: number) =>
  tx`UPDATE tramites SET aviso_vencido_en = now(), escalado_en = now() WHERE id <> ${tramiteId}`;

const correrEn = (tx: TransactionSql) => (ahora: string) => revisarVencimientos({ sql: tx, ahora: new Date(ahora) });

const filaDe = async (tx: TransactionSql, tramiteId: number) => {
  const [f] = await tx`SELECT * FROM tramites WHERE id = ${tramiteId}`;
  return aFilaTramite(f);
};

describe("revisarVencimientos", () => {
  it("avisa una vez al responsable y, pasados los días, una vez a su jefe, sin título ni enlace", () => revertida(sql, async (tx) => {
    const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
    const elaborador = await usuarioDePrueba(tx, { rol: "consulta", jefeId: jefe.usuarioId });
    const t = await tramiteEn(tx, "elaboracion", { elaborador });                // vence el 20/11 (15 días)
    await silenciarOtros(tx, t.tramiteId);
    const correr = correrEn(tx);
    expect(await correr("2026-11-20T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 });   // todavía a tiempo
    expect(await correr("2026-11-21T15:00:00Z")).toEqual({ avisados: 1, escalados: 0 });
    expect(await correr("2026-11-21T16:00:00Z")).toEqual({ avisados: 0, escalados: 0 });   // no se repite
    expect(await correr("2026-11-24T15:00:00Z")).toEqual({ avisados: 0, escalados: 1 });   // más de 3 días de vencido
    expect(await correr("2026-11-25T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 });
    const avisosDelJefe = await tx`SELECT tipo, titulo, cuerpo, enlace FROM notificaciones WHERE usuario_id = ${jefe.usuarioId}`;
    expect(avisosDelJefe).toHaveLength(1);
    const [delJefe] = avisosDelJefe;
    expect(delJefe).toMatchObject({ tipo: "tramite.escalado", enlace: null });
    expect(`${delJefe.titulo} ${delJefe.cuerpo ?? ""}`).not.toMatch(/Inducci[oó]n/);       // sin el título del documento
    const [delElaborador] = await tx`SELECT tipo, enlace, cuerpo FROM notificaciones WHERE usuario_id = ${elaborador.usuarioId} AND tipo = 'tramite.vencido'`;
    expect(delElaborador.enlace).toBe(`/tramites/${t.tramiteId}`);
    expect(delElaborador.cuerpo).toContain("GTH-PR-02");
  }));

  it("el aviso al jefe dice el paso, la solicitud, a cargo de quién y los días, sin el código", () => revertida(sql, async (tx) => {
    const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
    const elaborador = await usuarioDePrueba(tx, { rol: "consulta", jefeId: jefe.usuarioId });
    const t = await tramiteEn(tx, "elaboracion", { elaborador });
    await silenciarOtros(tx, t.tramiteId);
    await correrEn(tx)("2026-11-25T15:00:00Z");
    const [{ numero }] = await tx`SELECT numero FROM tramites WHERE id = ${t.tramiteId}`;
    const [delJefe] = await tx`SELECT titulo, cuerpo FROM notificaciones WHERE usuario_id = ${jefe.usuarioId}`;
    const texto = `${delJefe.titulo} ${delJefe.cuerpo}`;
    expect(texto).toContain("elaboración");
    expect(texto).toContain(numero);
    expect(texto).toContain(elaborador.nombre);
    expect(texto).toContain("5 días");
    expect(texto).not.toContain("GTH-PR-02");
  }));

  it("un paso muy vencido y sin avisar avisa y escala en la misma pasada", () => revertida(sql, async (tx) => {
    const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
    const elaborador = await usuarioDePrueba(tx, { rol: "consulta", jefeId: jefe.usuarioId });
    const t = await tramiteEn(tx, "elaboracion", { elaborador });
    await silenciarOtros(tx, t.tramiteId);
    expect(await correrEn(tx)("2026-12-30T15:00:00Z")).toEqual({ avisados: 1, escalados: 1 });
    const [marcas] = await tx`SELECT aviso_vencido_en, escalado_en FROM tramites WHERE id = ${t.tramiteId}`;
    expect(marcas.aviso_vencido_en).toEqual(new Date("2026-12-30T15:00:00Z"));
    expect(marcas.escalado_en).toEqual(new Date("2026-12-30T15:00:00Z"));
  }));

  it("a los días exactos de escalamiento todavía no escala", () => revertida(sql, async (tx) => {
    const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
    const elaborador = await usuarioDePrueba(tx, { rol: "consulta", jefeId: jefe.usuarioId });
    const t = await tramiteEn(tx, "elaboracion", { elaborador });
    await silenciarOtros(tx, t.tramiteId);
    expect(await correrEn(tx)("2026-11-24T04:59:59Z")).toEqual({ avisados: 1, escalados: 0 });   // 23/11 en Bogotá: 3 días
    expect(await correrEn(tx)("2026-11-24T05:00:00Z")).toEqual({ avisados: 0, escalados: 1 });   // 24/11 en Bogotá: 4 días
  }));

  it("respeta los días de escalamiento configurados", () => revertida(sql, async (tx) => {
    const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
    const elaborador = await usuarioDePrueba(tx, { rol: "consulta", jefeId: jefe.usuarioId });
    const t = await tramiteEn(tx, "elaboracion", { elaborador });
    await silenciarOtros(tx, t.tramiteId);
    await tx`INSERT INTO configuracion (clave, valor) VALUES ('escalamiento_dias', '10')
      ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`;
    expect(await correrEn(tx)("2026-11-29T15:00:00Z")).toEqual({ avisados: 1, escalados: 0 });
    expect(await correrEn(tx)("2026-12-01T15:00:00Z")).toEqual({ avisados: 0, escalados: 1 });
  }));

  it("sin jefe no se escala, y el paso queda pendiente para cuando lo tenga", () => revertida(sql, async (tx) => {
    const elaborador = await usuarioDePrueba(tx, { rol: "consulta" });
    const t = await tramiteEn(tx, "elaboracion", { elaborador });
    await silenciarOtros(tx, t.tramiteId);
    expect(await correrEn(tx)("2026-12-30T15:00:00Z")).toEqual({ avisados: 1, escalados: 0 });
    const [marcas] = await tx`SELECT escalado_en FROM tramites WHERE id = ${t.tramiteId}`;
    expect(marcas.escalado_en).toBeNull();
    const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
    await tx`UPDATE usuarios SET jefe_inmediato_id = ${jefe.usuarioId} WHERE id = ${elaborador.usuarioId}`;
    expect(await correrEn(tx)("2026-12-30T16:00:00Z")).toEqual({ avisados: 0, escalados: 1 });
  }));

  it("en un paso de grupo avisa a cada uno y escala a los jefes sin repetir", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "visto_bueno");
    await silenciarOtros(tx, t.tramiteId);
    const [{ proceso_id: procesoId }] = await tx`SELECT proceso_id FROM tramites WHERE id = ${t.tramiteId}`;
    const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
    const uno = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [Number(procesoId)], jefeId: jefe.usuarioId });
    const dos = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [Number(procesoId)], jefeId: jefe.usuarioId });
    expect(await correrEn(tx)("2026-12-30T15:00:00Z")).toEqual({ avisados: 1, escalados: 1 });
    for (const lider of [uno, dos, await sesionDe(tx, "lider.gth")]) {
      const avisos = await tx`SELECT 1 FROM notificaciones WHERE usuario_id = ${lider.usuarioId} AND tipo = 'tramite.vencido' AND entidad_id = ${t.tramiteId}`;
      expect(avisos).toHaveLength(1);
    }
    const delJefe = await tx`SELECT cuerpo FROM notificaciones WHERE usuario_id = ${jefe.usuarioId} AND tipo = 'tramite.escalado'`;
    expect(delJefe).toHaveLength(1);
    expect(delJefe[0].cuerpo).toContain(uno.nombre);
    expect(delJefe[0].cuerpo).toContain("y 1 más");
  }));

  it("un responsable desactivado no calla el escalamiento: su jefe se entera", () => revertida(sql, async (tx) => {
    const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
    const elaborador = await usuarioDePrueba(tx, { rol: "consulta", jefeId: jefe.usuarioId });
    const t = await tramiteEn(tx, "elaboracion", { elaborador });
    await silenciarOtros(tx, t.tramiteId);
    await tx`UPDATE usuarios SET activo = false WHERE id = ${elaborador.usuarioId}`;
    expect(await correrEn(tx)("2026-12-30T15:00:00Z")).toEqual({ avisados: 1, escalados: 1 });
  }));

  it("una reasignación, como cualquier transición, limpia las marcas de aviso", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    await silenciarOtros(tx, t.tramiteId);
    await revisarVencimientos({ sql: tx, ahora: new Date("2026-12-30T15:00:00Z") });
    const [antes] = await tx`SELECT aviso_vencido_en FROM tramites WHERE id = ${t.tramiteId}`;
    expect(antes.aviso_vencido_en).not.toBeNull();
    await transicionar(t.admin, { tramiteId: t.tramiteId, accion: "reasignar", etapaEsperada: "elaboracion", rondaEsperada: 1,
      datos: { papel: "elaborador", venceEn: "2027-01-15", motivo: "Se amplía el plazo." } }, opc(tx));
    const [despues] = await tx`SELECT aviso_vencido_en, escalado_en FROM tramites WHERE id = ${t.tramiteId}`;
    expect([despues.aviso_vencido_en, despues.escalado_en]).toEqual([null, null]);
  }));

  it("no avisa de etapas finales", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    await silenciarOtros(tx, t.tramiteId);
    await tx`UPDATE tramites SET etapa = 'cancelado' WHERE id = ${t.tramiteId}`;              // conserva vence_en
    expect(await correrEn(tx)("2026-12-30T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 });
  }));

  /** `tx`, con `entre` corriendo justo después de leer la lista de vencidos, antes de tomar cada candado. */
  const conCambioTrasLaLista = (tx: TransactionSql, entre: () => Promise<unknown>) =>
    new Proxy(tx, {
      apply(objetivo, propio, argumentos: [TemplateStringsArray, ...unknown[]]) {
        const consulta = Reflect.apply(objetivo, propio, argumentos);
        if (!argumentos[0].join("").includes("SELECT id, vence_en")) return consulta;
        return consulta.then(async (filas: unknown) => {
          await entre();
          return filas;
        });
      },
    }) as unknown as TransactionSql;

  it("lo que otra pasada ya avisó no se repite: las marcas se vuelven a leer con la fila bloqueada", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    await silenciarOtros(tx, t.tramiteId);
    const otraPasada = conCambioTrasLaLista(tx, () => tx`UPDATE tramites SET aviso_vencido_en = now(), escalado_en = now() WHERE id = ${t.tramiteId}`);
    expect(await revisarVencimientos({ sql: otraPasada, ahora: new Date("2026-12-30T15:00:00Z") })).toEqual({ avisados: 0, escalados: 0 });
  }));

  it("un trámite que se cierra entre la lista y el candado no avisa", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    await silenciarOtros(tx, t.tramiteId);
    const seCierra = conCambioTrasLaLista(tx, () => tx`UPDATE tramites SET etapa = 'cancelado' WHERE id = ${t.tramiteId}`);
    expect(await revisarVencimientos({ sql: seCierra, ahora: new Date("2026-12-30T15:00:00Z") })).toEqual({ avisados: 0, escalados: 0 });
  }));

  it("sin nadie a quien avisar no marca el aviso: sale cuando haya responsable", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "visto_bueno");
    await silenciarOtros(tx, t.tramiteId);
    await tx`UPDATE usuarios SET activo = false WHERE rol = 'lider_proceso'`;
    expect(await correrEn(tx)("2026-12-30T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 });
    const [marcas] = await tx`SELECT aviso_vencido_en FROM tramites WHERE id = ${t.tramiteId}`;
    expect(marcas.aviso_vencido_en).toBeNull();
    await tx`UPDATE usuarios SET activo = true WHERE usuario = 'lider.gth'`;
    expect((await correrEn(tx)("2026-12-30T16:00:00Z")).avisados).toBe(1);
  }));

  it("no espera a un trámite bloqueado y lo revisa en la pasada siguiente", async () => {
    // Confirmado, para que la otra conexión lo vea. Es un trámite suelto, sin eventos: se puede borrar.
    const lider = await sesionDe(sql, "lider.cex");
    const [{ id: procesoId }] = await sql`SELECT id FROM procesos WHERE sigla = 'CEX'`;
    const consecutivo = Date.now() % 1_000_000;
    const [{ id }] = await sql`INSERT INTO tramites
        (numero, anio, consecutivo, tipo, motivo, justificacion, solicitante_id, proceso_id, tipo_documento_id, titulo_propuesto, etapa, ronda, vence_en)
      SELECT ${`SOL-1999-${consecutivo}`}, 1999, ${consecutivo}, 'crear', 'mejora', 'Prueba de vencimiento.', ${lider.usuarioId}, ${procesoId},
        t.id, 'Prueba', 'visto_bueno', 0, ${new Date("2030-05-30T15:00:00Z")}
      FROM tipos_documento t WHERE t.sigla = 'FO'
      RETURNING id`;
    const tramiteId = Number(id);
    // Cada revisión va en su transacción revertida: ni sus avisos ni sus marcas se quedan en la BD.
    const revisar = () => revertida(sql, async (tx) => {
      await silenciarOtros(tx, tramiteId);
      return correrEn(tx)("2030-06-01T15:00:00Z");
    });

    let soltar = () => {};
    const espera = new Promise<void>((r) => { soltar = r; });
    let avisarBloqueo = () => {};
    const bloqueado = new Promise<void>((r) => { avisarBloqueo = r; });
    const transicion = revertida(sql, async (tx) => {
      await tx`SELECT 1 FROM tramites WHERE id = ${tramiteId} FOR UPDATE`;
      avisarBloqueo();
      await espera;
    });
    try {
      await bloqueado;
      // Con un tope: si la revisión esperara al candado, el test debe fallar y aun así limpiar.
      const pasada = revisar();
      const resultado = await Promise.race([pasada, new Promise((r) => setTimeout(r, 3000, "esperó al candado"))]);
      soltar();
      await Promise.all([transicion, pasada]);
      expect(resultado).toEqual({ avisados: 0, escalados: 0 });
      expect((await revisar()).avisados).toBe(1);
    } finally {
      soltar();
      await transicion;
      await sql`DELETE FROM tramites WHERE id = ${tramiteId}`;
    }
  });
});

describe("responsablesDe", () => {
  it("visto bueno: los líderes del proceso; aceptación: los administradores activos", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "visto_bueno");
    const lider = await sesionDe(tx, "lider.gth");
    expect(await responsablesDe(await filaDe(tx, t.tramiteId), { sql: tx })).toContain(lider.usuarioId);
    await tx`UPDATE usuarios SET activo = false WHERE id = ${t.admin.usuarioId}`;
    const a = await tramiteEn(tx, "aceptacion", { tipo: "crear" });
    const admins = await responsablesDe(await filaDe(tx, a.tramiteId), { sql: tx });
    expect(admins).toContain(a.admin.usuarioId);
    expect(admins).not.toContain(t.admin.usuarioId);
  }));

  it("elaboración, revisión y aprobación: la persona designada; publicación: los administradores", () => revertida(sql, async (tx) => {
    const t = await tramiteEn(tx, "elaboracion");
    const fila = await filaDe(tx, t.tramiteId);
    expect(await responsablesDe(fila, { sql: tx })).toEqual([t.elaborador.usuarioId]);
    expect(await responsablesDe({ ...fila, etapa: "revision" }, { sql: tx })).toEqual([t.revisor.usuarioId]);
    expect(await responsablesDe({ ...fila, etapa: "aprobacion" }, { sql: tx })).toEqual([t.aprobador.usuarioId]);
    expect(await responsablesDe({ ...fila, etapa: "publicacion" }, { sql: tx })).toContain(t.admin.usuarioId);
    expect(await responsablesDe({ ...fila, etapa: "cancelado" }, { sql: tx })).toEqual([]);
  }));
});

describe("dispararRevisionDeVencimientos", () => {
  afterEach(() => {
    vi.doUnmock("@/db/consultas/vencimientos");
    vi.resetModules();
    vi.restoreAllMocks();
  });

  async function conSimulada(simulada: () => Promise<unknown>) {
    vi.resetModules();
    vi.doMock("@/db/consultas/vencimientos", () => ({ revisarVencimientos: simulada }));
    const { dispararRevisionDeVencimientos } = await import("@/lib/vencimientos-disparo");
    return dispararRevisionDeVencimientos;
  }

  const MINUTO = 60_000;
  const INICIO = 1_000_000_000;

  it("con menos de diez minutos entre llamadas corre una vez; a los diez, otra", async () => {
    const simulada = vi.fn(async () => ({ avisados: 0, escalados: 0 }));
    const disparar = await conSimulada(simulada);
    disparar(INICIO);
    disparar(INICIO + 9 * MINUTO);
    await vi.waitFor(() => expect(simulada).toHaveBeenCalledTimes(1));
    disparar(INICIO + 10 * MINUTO);
    await vi.waitFor(() => expect(simulada).toHaveBeenCalledTimes(2));
  });

  it("no espera a que la revisión termine", async () => {
    const simulada = vi.fn(() => new Promise<never>(() => {}));
    const disparar = await conSimulada(simulada);
    expect(disparar(INICIO)).toBeUndefined();
    await vi.waitFor(() => expect(simulada).toHaveBeenCalledOnce());
  });

  it("un error no se propaga: va al registro", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {});
    const disparar = await conSimulada(async () => {
      throw new Error("sin conexión");
    });
    expect(() => disparar(INICIO)).not.toThrow();
    await vi.waitFor(() => expect(registro).toHaveBeenCalledOnce());
  });

  it("tampoco se propaga un fallo síncrono", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {});
    const disparar = await conSimulada(() => {
      throw new Error("sin configuración");
    });
    expect(() => disparar(INICIO)).not.toThrow();
    await vi.waitFor(() => expect(registro).toHaveBeenCalledOnce());
  });
});
