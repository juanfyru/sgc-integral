/**
 * La configuración de mejoramiento (Fase 15A, Tarea 4): plazos, calendario de la entidad y formatos.
 * Contra la BD de trabajo, dentro de una transacción que se revierte.
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import {
  agregarDiaDeCalendario,
  calendarioDeMejora,
  CONFIG_MEJORA_DEFECTO,
  contextoDeMejora,
  guardarConfigMejora,
  obtenerConfigMejora,
  quitarDiaDeCalendario,
  type ConfigMejora,
} from "@/db/consultas/mejoramiento/config";
import { SIN_AJUSTES } from "@/lib/dias-habiles";
import { formularAntesDe, quedanDiasHabiles, venceEn } from "@/lib/mejoramiento/plazos";
import { ErrorPermiso } from "@/lib/permisos";
import { finDeFecha } from "@/lib/tramites/plazos";
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
});
