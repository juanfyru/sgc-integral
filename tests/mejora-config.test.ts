/**
 * La configuración de mejoramiento (Fase 15A, Tarea 4): plazos, calendario de la entidad y formatos.
 * Contra la BD de trabajo, dentro de una transacción que se revierte.
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

// La acción de los formatos con un `FormData` real (Fase 15B, Tarea 7): el cliente de la app se sustituye por la transacción del
// test mientras corre (`enCurso`); fuera de ella, el de verdad. Solo la sesión es de mentira.
const { enCurso, requerirSesion } = vi.hoisted(() => ({ enCurso: { sql: null as unknown }, requerirSesion: vi.fn() }));
vi.mock("@/db/cliente", async (original) => {
  const real = await original<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => (enCurso.sql ?? real.obtenerSql()) as ReturnType<typeof real.obtenerSql> };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/sesion-actual", () => ({ requerirSesion }));
vi.mock("@/lib/contexto-peticion", () => ({ contextoDePeticion: async () => ({ ip: "10.0.0.1", userAgent: "prueba" }) }));

import { guardarConfigMejoraAccion } from "@/app/admin/acciones-mejoramiento";
import { obtenerSql } from "@/db/cliente";
import {
  agregarDiaDeCalendario,
  calendarioDeMejora,
  CONFIG_MEJORA_DEFECTO,
  contextoDeMejora,
  documentosParaFormato,
  guardarConfigMejora,
  obtenerConfigMejora,
  quitarDiaDeCalendario,
  type ConfigMejora,
} from "@/db/consultas/mejoramiento/config";
import { encabezadoDeFormato } from "@/db/consultas/mejoramiento/formatos";
import { SIN_AJUSTES } from "@/lib/dias-habiles";
import { formularAntesDe, quedanDiasHabiles, venceEn } from "@/lib/mejoramiento/plazos";
import { ErrorPermiso } from "@/lib/permisos";
import { fechaEnZona, finDeFecha } from "@/lib/tramites/plazos";
import { documentoLibre, opc, sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
afterAll(() => sql.end());

const dia = (iso: string) => new Date(`${iso}T15:00:00Z`);
const ZONA = "America/Bogota";
const fin = (iso: string) => finDeFecha(iso, ZONA).toISOString();
const ctx = (config: ConfigMejora = CONFIG_MEJORA_DEFECTO, calendario = SIN_AJUSTES) => ({ config, calendario, zona: ZONA });

describe("obtenerConfigMejora", () => {
  it("sin filas vale lo de omisión", async () => {
    await revertida(sql, async (tx) => {
      await tx`DELETE FROM configuracion WHERE clave LIKE 'mej\_%'`;
      expect(await obtenerConfigMejora({ sql: tx })).toEqual(CONFIG_MEJORA_DEFECTO);
    });
  });

  it("las tres claves de la 15B se leen con su valor por omisión", async () => {
    await revertida(sql, async (tx) => {
      await tx`DELETE FROM configuracion WHERE clave IN ('mej_formato_plan_documento_id', 'mej_sugerir_hallazgos', 'mej_sugerir_meses')`;
      const c = await obtenerConfigMejora({ sql: tx });
      expect(c.formatos.plan).toBeNull();
      expect(c.sugerirHallazgos).toBe(3);
      expect(c.sugerirMeses).toBe(12);
    });
  });

  it("mej_sugerir_hallazgos fuera de 2 a 20 cae al de omisión y mej_sugerir_meses, fuera de 1 a 60", async () => {
    await revertida(sql, async (tx) => {
      for (const [clave, valor] of [["mej_sugerir_hallazgos", "1"], ["mej_sugerir_meses", "61"]]) {
        await tx`INSERT INTO configuracion (clave, valor) VALUES (${clave}, ${valor}) ON CONFLICT (clave) DO UPDATE SET valor = ${valor}`;
      }
      const c = await obtenerConfigMejora({ sql: tx });
      expect(c.sugerirHallazgos).toBe(3);
      expect(c.sugerirMeses).toBe(12);
    });
  });

  it("un valor fuera de rango cae al de omisión", async () => {
    await revertida(sql, async (tx) => {
      await tx`INSERT INTO configuracion (clave, valor) VALUES ('mej_plazo_formular_dias', '0')
        ON CONFLICT (clave) DO UPDATE SET valor = '0'`;
      await tx`INSERT INTO configuracion (clave, valor) VALUES ('mej_recordatorio_dias', 'abc')
        ON CONFLICT (clave) DO UPDATE SET valor = 'abc'`;
      const c = await obtenerConfigMejora({ sql: tx });
      expect(c.plazos.formular).toBe(10);
      expect(c.recordatorioDias).toBe(30);
    });
  });
});

describe("guardarConfigMejora", () => {
  it("exige mejora.gestionar", async () => {
    await revertida(sql, async (tx) => {
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso" });
      await expect(guardarConfigMejora(lider, CONFIG_MEJORA_DEFECTO, opc(tx))).rejects.toBeInstanceOf(ErrorPermiso);
    });
  });

  it("deja el antes y el después en la bitácora", async () => {
    await revertida(sql, async (tx) => {
      await tx`DELETE FROM configuracion WHERE clave LIKE 'mej\_%'`;
      const admin = await sesionAdmin(tx);
      const nueva: ConfigMejora = {
        ...CONFIG_MEJORA_DEFECTO,
        plazos: { ...CONFIG_MEJORA_DEFECTO.plazos, formular: 12 },
        recordatorioDias: 45,
      };
      await guardarConfigMejora(admin, nueva, opc(tx));
      expect(await obtenerConfigMejora({ sql: tx })).toEqual(nueva);
      const [aud] = await tx`SELECT detalle FROM auditoria WHERE accion = 'mejora_config_guardada' AND usuario_id = ${admin.usuarioId}`;
      expect(aud.detalle.cambios).toEqual({
        mej_plazo_formular_dias: { antes: "10", despues: "12" },
        mej_recordatorio_dias: { antes: "30", despues: "45" },
      });
    });
  });

  it("mej_sugerir_hallazgos fuera de 2 a 20 se rechaza al guardar", async () => {
    await revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      for (const n of [1, 21]) {
        await expect(guardarConfigMejora(admin, { ...CONFIG_MEJORA_DEFECTO, sugerirHallazgos: n }, opc(tx))).rejects.toThrow(
          "El número de hallazgos de la sugerencia",
        );
      }
      await guardarConfigMejora(admin, { ...CONFIG_MEJORA_DEFECTO, sugerirHallazgos: 20, sugerirMeses: 60 }, opc(tx));
      const c = await obtenerConfigMejora({ sql: tx });
      expect([c.sugerirHallazgos, c.sugerirMeses]).toEqual([20, 60]);
    });
  });

  it("un formato debe ser un documento con versión vigente", async () => {
    await revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const [{ id: tipo }] = await tx`SELECT id FROM tipos_documento ORDER BY id LIMIT 1`;
      const [{ id }] = await tx`INSERT INTO documentos (codigo, titulo, tipo_id)
        VALUES (${`ZZ-FO-${Date.now()}`}, 'Sin vigente', ${tipo}) RETURNING id`;
      const mala: ConfigMejora = { ...CONFIG_MEJORA_DEFECTO, formatos: { ...CONFIG_MEJORA_DEFECTO.formatos, registro: Number(id) } };
      await expect(guardarConfigMejora(admin, mala, opc(tx))).rejects.toThrow("El documento elegido no tiene una versión vigente");
      const doc = await documentoLibre(tx, { proceso: "CEX", tipo: "FO" });
      const buena: ConfigMejora = { ...CONFIG_MEJORA_DEFECTO, formatos: { ...CONFIG_MEJORA_DEFECTO.formatos, registro: doc.id } };
      await guardarConfigMejora(admin, buena, opc(tx));
      expect((await obtenerConfigMejora({ sql: tx })).formatos.registro).toBe(doc.id);
    });
  });
});

describe("documentosParaFormato", () => {
  it("un formato guardado que perdió su versión vigente sigue en la lista, marcado", async () => {
    await revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const doc = await documentoLibre(tx, { proceso: "CEX", tipo: "FO" });
      await guardarConfigMejora(admin, { ...CONFIG_MEJORA_DEFECTO, formatos: { ...CONFIG_MEJORA_DEFECTO.formatos, registro: doc.id } }, opc(tx));
      const antes = await documentosParaFormato({ sql: tx, incluir: [doc.id] });
      expect(antes.find((d) => d.id === doc.id)).toMatchObject({ sinVigente: false });
      await tx`UPDATE documento_versiones SET estado = 'obsoleto' WHERE documento_id = ${doc.id}`;
      expect((await documentosParaFormato({ sql: tx })).some((d) => d.id === doc.id)).toBe(false);
      const con = await documentosParaFormato({ sql: tx, incluir: [doc.id] });
      expect(con.find((d) => d.id === doc.id)).toMatchObject({ sinVigente: true });
      // Guardar sin tocarlo lo conserva.
      await guardarConfigMejora(admin, await obtenerConfigMejora({ sql: tx }), opc(tx));
      expect((await obtenerConfigMejora({ sql: tx })).formatos.registro).toBe(doc.id);
    });
  });
});

describe("encabezadoDeFormato", () => {
  it("devuelve el código y la versión vigente del documento elegido, y null cuando ese documento deja de tener versión vigente", async () => {
    await revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const doc = await documentoLibre(tx, { proceso: "CEX", tipo: "FO" });
      // La vigente es la 2 (la 1 quedó obsoleta), aprobada el 15 de marzo: su fecha de emisión.
      await tx`UPDATE documento_versiones SET estado = 'obsoleto' WHERE documento_id = ${doc.id}`;
      await tx`INSERT INTO documento_versiones (documento_id, numero, estado, aprobo, fecha_aprobacion)
        VALUES (${doc.id}, 2, 'vigente', 'Prueba', '2026-03-15')`;
      const formatos = { registro: doc.id, porques: null, ishikawa: null, plan: null };
      await guardarConfigMejora(admin, { ...CONFIG_MEJORA_DEFECTO, formatos }, opc(tx));

      const e = await encabezadoDeFormato(tx, "registro");
      expect(e).toEqual({ codigo: doc.codigo, version: 2, emitidoEn: expect.any(Date) });
      // El día de la aprobación, también en la zona de la instalación (no el anterior por la hora UTC).
      expect(fechaEnZona(e!.emitidoEn, ZONA)).toBe("2026-03-15");
      // Sin documento elegido, sin encabezado.
      expect(await encabezadoDeFormato(tx, "porques")).toBeNull();
      expect(await encabezadoDeFormato(tx, "ishikawa")).toBeNull();

      await tx`UPDATE documento_versiones SET estado = 'obsoleto' WHERE documento_id = ${doc.id}`;
      expect(await encabezadoDeFormato(tx, "registro")).toBeNull();
    });
  });

  it("el SGC-FO-14 (`plan`) lee su propio documento", async () => {
    await revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const doc = await documentoLibre(tx, { proceso: "CEX", tipo: "FO" });
      await guardarConfigMejora(admin, { ...CONFIG_MEJORA_DEFECTO, formatos: { registro: null, porques: null, ishikawa: null, plan: doc.id } }, opc(tx));
      expect(await encabezadoDeFormato(tx, "plan")).toMatchObject({ codigo: doc.codigo });
      expect(await encabezadoDeFormato(tx, "registro")).toBeNull();
    });
  });
});

describe("guardarConfigMejoraAccion", () => {
  it("el bloque de formatos guarda el cuarto selector, «SGC-FO-14 Plan de mejoramiento», y vaciarlo lo deja sin documento", async () => {
    await revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const doc = await documentoLibre(tx, { proceso: "CEX", tipo: "FO" });
      const antes = await obtenerConfigMejora({ sql: tx });
      const enviar = async (campos: Record<string, string>) => {
        const datos = new FormData();
        for (const [k, v] of Object.entries(campos)) datos.append(k, v);
        enCurso.sql = tx;
        requerirSesion.mockResolvedValue(admin);
        try {
          return await guardarConfigMejoraAccion(null, datos);
        } finally {
          enCurso.sql = null;
        }
      };
      const vacios = { formato_registro: "", formato_porques: "", formato_ishikawa: "" };
      expect(await enviar({ bloque: "formatos", ...vacios, formato_plan: String(doc.id) })).toBeNull();
      const despues = await obtenerConfigMejora({ sql: tx });
      expect(despues.formatos).toEqual({ registro: null, porques: null, ishikawa: null, plan: doc.id });
      // Los plazos no se tocan al guardar los formatos.
      expect(despues.plazos).toEqual(antes.plazos);
      expect(await enviar({ bloque: "formatos", ...vacios, formato_plan: "" })).toBeNull();
      expect((await obtenerConfigMejora({ sql: tx })).formatos.plan).toBeNull();
    });
  });

  it("el bloque de los plazos guarda también los dos números de la sugerencia (Fase 15B, anexo §7.4); fuera de rango, se rechaza", async () => {
    await revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const antes = await obtenerConfigMejora({ sql: tx });
      const enviar = async (campos: Record<string, string>) => {
        const datos = new FormData();
        for (const [k, v] of Object.entries(campos)) datos.append(k, v);
        enCurso.sql = tx;
        requerirSesion.mockResolvedValue(admin);
        try {
          return await guardarConfigMejoraAccion(null, datos);
        } finally {
          enCurso.sql = null;
        }
      };
      const plazos = Object.fromEntries(Object.entries(antes.plazos).map(([paso, n]) => [`plazo_${paso}`, String(n)]));
      const comunes = { bloque: "plazos", ...plazos, recordatorioAltaDias: String(antes.recordatorioAltaDias), recordatorioDias: String(antes.recordatorioDias) };
      expect(await enviar({ ...comunes, sugerirHallazgos: "4", sugerirMeses: "6" })).toBeNull();
      const despues = await obtenerConfigMejora({ sql: tx });
      expect([despues.sugerirHallazgos, despues.sugerirMeses]).toEqual([4, 6]);
      // Los formatos no se tocan al guardar los plazos.
      expect(despues.formatos).toEqual(antes.formatos);
      expect(await enviar({ ...comunes, sugerirHallazgos: "1", sugerirMeses: "6" })).toMatchObject({ ok: false });
      expect((await obtenerConfigMejora({ sql: tx })).sugerirHallazgos).toBe(4);
    });
  });
});

describe("el calendario de la entidad", () => {
  it("sale de la tabla", async () => {
    await revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      await agregarDiaDeCalendario(admin, { fecha: "2026-11-18", tipo: "no_habil", motivo: "Cierre institucional" }, opc(tx));
      await agregarDiaDeCalendario(admin, { fecha: "2026-11-16", tipo: "habil", motivo: "Se trabaja" }, opc(tx));
      const cal = await calendarioDeMejora(tx);
      expect(cal.noHabiles.has("2026-11-18")).toBe(true);
      expect(cal.habiles.has("2026-11-16")).toBe(true);
    });
  });

  it("marcar hábil un día que no es festivo, o repetir uno, se rechaza", async () => {
    await revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      await expect(
        agregarDiaDeCalendario(admin, { fecha: "2026-11-18", tipo: "habil", motivo: "x" }, opc(tx)),
      ).rejects.toThrow("Ese día no es un festivo: no hay nada que anular");
      await agregarDiaDeCalendario(admin, { fecha: "2026-11-18", tipo: "no_habil", motivo: "x" }, opc(tx));
      await expect(
        agregarDiaDeCalendario(admin, { fecha: "2026-11-18", tipo: "no_habil", motivo: "y" }, opc(tx)),
      ).rejects.toThrow("Ese día ya está en la lista");
    });
  });

  it("quitar un día lo saca y deja bitácora", async () => {
    await revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      await agregarDiaDeCalendario(admin, { fecha: "2026-11-18", tipo: "no_habil", motivo: "x" }, opc(tx));
      const [{ id }] = await tx`SELECT id FROM dias_no_habiles WHERE fecha = '2026-11-18'`;
      await quitarDiaDeCalendario(admin, Number(id), opc(tx));
      expect((await calendarioDeMejora(tx)).noHabiles.has("2026-11-18")).toBe(false);
      const acciones = await tx`SELECT accion FROM auditoria WHERE usuario_id = ${admin.usuarioId} ORDER BY id`;
      expect(acciones.map((a) => a.accion)).toEqual(["mejora_dia_agregado", "mejora_dia_quitado"]);
    });
  });

  it("contextoDeMejora junta la hora, la zona, la configuración y el calendario", async () => {
    await revertida(sql, async (tx) => {
      const ahora = dia("2026-11-04");
      const c = await contextoDeMejora(tx, ahora);
      expect(c.ahora).toBe(ahora);
      expect(c.zona).toBe(ZONA);
      expect(c.config.plazos.formular).toBe(10);
    });
  });
});

describe("plazos en días hábiles", () => {
  it("un día añadido después no mueve lo ya calculado", () => {
    const yaCalculado = venceEn("formular", dia("2026-11-04"), ctx());
    expect(yaCalculado.toISOString()).toBe(fin("2026-11-19"));
    const conElDia = ctx(CONFIG_MEJORA_DEFECTO, { noHabiles: new Set(["2026-11-18"]), habiles: new Set() });
    expect(venceEn("formular", dia("2026-11-04"), conElDia).toISOString()).toBe(fin("2026-11-20"));
    expect(yaCalculado.toISOString()).toBe(fin("2026-11-19"));
  });

  it("formularAntesDe usa el plazo sin fecha del ente y retrocede revisar y aprobar con ella", () => {
    const c = ctx({ ...CONFIG_MEJORA_DEFECTO, plazos: { ...CONFIG_MEJORA_DEFECTO.plazos, revisar: 3, aprobar: 3 } });
    const registrado = dia("2026-11-04");
    expect(formularAntesDe({ registradoEn: registrado, fechaLimiteEnte: null }, c)).toEqual(venceEn("formular", registrado, c));
    expect(formularAntesDe({ registradoEn: registrado, fechaLimiteEnte: "2026-11-30" }, c).toISOString()).toBe(fin("2026-11-20"));
    expect(formularAntesDe({ registradoEn: registrado, fechaLimiteEnte: "2026-10-01" }, c).toISOString()).toBe(fin("2026-11-04"));
  });

  it("quedanDiasHabiles cuenta los que faltan y es negativo si ya venció", () => {
    const c = ctx();
    expect(quedanDiasHabiles(dia("2026-11-11"), { ...c, ahora: dia("2026-11-04") })).toBe(5);
    expect(quedanDiasHabiles(dia("2026-11-04"), { ...c, ahora: dia("2026-11-11") })).toBe(-5);
  });

  it("la fecha del ente en sábado o en festivo retrocede desde ese día", () => {
    const c = ctx({ ...CONFIG_MEJORA_DEFECTO, plazos: { ...CONFIG_MEJORA_DEFECTO.plazos, revisar: 3, aprobar: 3 } });
    const registrado = dia("2026-11-04");
    // 2026-11-28 es sábado: hacia atrás, 27(1) 26(2) 25(3) 24(4) 23(5) 20(6).
    expect(formularAntesDe({ registradoEn: registrado, fechaLimiteEnte: "2026-11-28" }, c).toISOString()).toBe(fin("2026-11-20"));
    // 2026-11-16 es festivo (lunes): 13(1) 12(2) 11(3) 10(4) 9(5) 6(6).
    expect(formularAntesDe({ registradoEn: registrado, fechaLimiteEnte: "2026-11-16" }, c).toISOString()).toBe(fin("2026-11-06"));
  });

  it("un día hábil que anula el festivo cuenta dentro de venceEn", () => {
    const anulado = ctx(CONFIG_MEJORA_DEFECTO, { noHabiles: new Set(), habiles: new Set(["2026-11-16"]) });
    expect(venceEn("formular", dia("2026-11-04"), anulado).toISOString()).toBe(fin("2026-11-18"));
  });

  it("una fecha del ente igual al día del registro o a pocos hábiles de él", () => {
    const c = ctx({ ...CONFIG_MEJORA_DEFECTO, plazos: { ...CONFIG_MEJORA_DEFECTO.plazos, revisar: 3, aprobar: 3 } });
    const registrado = dia("2026-11-04");
    expect(formularAntesDe({ registradoEn: registrado, fechaLimiteEnte: "2026-11-04" }, c).toISOString()).toBe(fin("2026-11-04"));
    // 2026-11-09 menos seis hábiles cae antes del registro: se queda en el día del registro.
    expect(formularAntesDe({ registradoEn: registrado, fechaLimiteEnte: "2026-11-09" }, c).toISOString()).toBe(fin("2026-11-04"));
    // 2026-11-12 menos seis hábiles: 11 10 9 6 5 4 -> el día del registro, sin pasarse.
    expect(formularAntesDe({ registradoEn: registrado, fechaLimiteEnte: "2026-11-12" }, c).toISOString()).toBe(fin("2026-11-04"));
  });

  it("por la tabla: un día añadido después no mueve lo ya calculado y uno nuevo se corre un hábil", async () => {
    await revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const calcular = async () => venceEn("formular", dia("2026-11-04"), { config: CONFIG_MEJORA_DEFECTO, calendario: await calendarioDeMejora(tx), zona: ZONA });
      const guardado = await calcular();
      expect(guardado.toISOString()).toBe(fin("2026-11-19"));
      await agregarDiaDeCalendario(admin, { fecha: "2026-11-18", tipo: "no_habil", motivo: "Cierre" }, opc(tx));
      expect(guardado.toISOString()).toBe(fin("2026-11-19"));
      expect((await calcular()).toISOString()).toBe(fin("2026-11-20"));
    });
  });

  it("por la tabla: un día hábil sobre el festivo del 16 de noviembre adelanta el cálculo nuevo", async () => {
    await revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const calcular = async () => venceEn("formular", dia("2026-11-04"), { config: CONFIG_MEJORA_DEFECTO, calendario: await calendarioDeMejora(tx), zona: ZONA });
      const guardado = await calcular();
      await agregarDiaDeCalendario(admin, { fecha: "2026-11-16", tipo: "habil", motivo: "Se trabaja" }, opc(tx));
      expect(guardado.toISOString()).toBe(fin("2026-11-19"));
      expect((await calcular()).toISOString()).toBe(fin("2026-11-18"));
    });
  });
});

describe("verdades pequeñas (revisión final, m9)", () => {
  /** Un cliente cuya transacción falla con ese código crudo de PostgreSQL, como una carrera real. */
  const conError = (code: string) =>
    ({ begin: () => Promise.reject(Object.assign(new Error(`error crudo ${code}`), { code })) }) as unknown as NonNullable<Parameters<typeof guardarConfigMejora>[2]>["sql"];
  const ADMIN = { sesionId: "zz-falsa", usuarioId: 1, usuario: "zz_falso", nombre: "Admin falso", rol: "admin_sgc" as const, verHistorial: false };
  const LEGIBLE = "Otra persona guardó lo mismo a la vez: vuelva a cargar la página";

  it("las tres escrituras de la configuración traducen un error crudo de PostgreSQL a su frase (`legible`)", async () => {
    await expect(guardarConfigMejora(ADMIN, CONFIG_MEJORA_DEFECTO, { sql: conError("23505") })).rejects.toThrow(LEGIBLE);
    await expect(
      agregarDiaDeCalendario(ADMIN, { fecha: "2026-12-24", tipo: "no_habil", motivo: "Novena de aguinaldos" }, { sql: conError("23505") }),
    ).rejects.toThrow(LEGIBLE);
    await expect(quitarDiaDeCalendario(ADMIN, 1, { sql: conError("23505") })).rejects.toThrow(LEGIBLE);
  });

  it("los documentos ya elegidos se comparan como `bigint`, el tipo de la columna", async () => {
    await revertida(sql, async (tx) => {
      // Un id que no cabe en `int`: con `int[]` la consulta fallaba («integer out of range»).
      expect(Array.isArray(await documentosParaFormato({ sql: tx, incluir: [2147483648] }))).toBe(true);
    });
  });
});
