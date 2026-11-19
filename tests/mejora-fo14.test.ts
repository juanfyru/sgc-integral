/**
 * El SGC-FO-14 (Fase 15B, Tarea 7; anexo §5): de un plan para un proceso y consolidado de un proceso en un año. El encabezado, qué
 * hallazgos entran (en el consolidado, los años en la zona de la instalación y, en un cargado, el registro en papel), «Aprobación y
 * control» y quién lo imprime. Contra la BD de trabajo, dentro de una transacción que se revierte; lo que el dominio no sabe llevar
 * (un registro o un cierre en otra fecha) se escribe por SQL en esa misma transacción, antes de que el hallazgo termine.
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import type { TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { cargarHallazgo } from "@/db/consultas/mejoramiento/carga";
import { ponerEnPlan } from "@/db/consultas/mejoramiento/clasificacion";
import { guardarConfigMejora, obtenerConfigMejora } from "@/db/consultas/mejoramiento/config";
import { CONSOLIDADO_DEL_PROCESO, fo14Consolidado, fo14DePlan, procesosQueImprime } from "@/db/consultas/mejoramiento/fo14";
import { anularHallazgo } from "@/db/consultas/mejoramiento/registro";
import {
  baseDeMejora,
  c,
  datosDeCarga,
  hallazgoEn,
  HORA_DE_ESCENA,
  objetivoDePrueba,
  otroProcesoConLider,
  planDeMejoraDePrueba,
  type BaseDeMejora,
} from "./utiles/mejoramiento";
import { procesoNuevo } from "./utiles/mixto";
import { documentoLibre, opc } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
afterAll(() => sql.end());

const AHORA = new Date("2026-11-18T15:00:00Z");
const o = (tx: TransactionSql) => ({ sql: tx, ahora: AHORA });

/** Pone los hallazgos en el plan como el Admin SGC, a la hora de la escena. */
const enElPlan = (tx: TransactionSql, b: BaseDeMejora, planId: number, hallazgoIds: number[]) =>
  ponerEnPlan(b.admin, { planId, hallazgoIds }, c(HORA_DE_ESCENA, tx));

const codigosDe = (f: { filas: Array<{ hallazgo: { codigo: string } }> } | null) => [...new Set((f?.filas ?? []).map((x) => x.hallazgo.codigo))];

describe("fo14DePlan", () => {
  it("el encabezado trae el origen, el código, la vigencia, el día de creación y el objetivo del plan; salen solo los de ese proceso que cuentan", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const objetivo = await objetivoDePrueba(tx);
      // Se crea el 12 de noviembre; el evento fue el 10: el impreso dice el día de creación.
      const plan = await planDeMejoraDePrueba(
        tx,
        b.admin,
        { objetivoTexto: "Subsanar lo que encontró la auditoría interna de calidad", objetivoId: objetivo.id },
        "2026-11-12T15:00:00Z",
      );
      const h1 = await hallazgoEn(tx, b, "en_ejecucion");
      const h2 = await hallazgoEn(tx, b, "por_formular", { origen: "autoevaluacion" });
      const anulado = await hallazgoEn(tx, b, "por_aceptar", { origen: "pamec" });
      const ajeno = await hallazgoEn(tx, { ...b, procesoId: otro.procesoId }, "por_aceptar", { origen: "pqrsf", referenciaCaso: "PQR-1" });
      await enElPlan(tx, b, plan.id, [h1.id, h2.id, anulado.id, ajeno.id]);
      await anularHallazgo(b.admin, { hallazgoId: anulado.id, justificacion: "Se registró dos veces por error" }, c(HORA_DE_ESCENA, tx));

      const f = await fo14DePlan(b.admin, plan.id, b.procesoId, o(tx));
      expect(f).not.toBeNull();
      const [p] = await tx`SELECT p.nombre, m.nombre AS macro FROM procesos p JOIN macroprocesos m ON m.id = p.macroproceso_id WHERE p.id = ${b.procesoId}`;
      expect(f!.forma).toBe("plan");
      expect(f!.encabezado).toMatchObject({
        origenDelPlan: "Auditoría interna",
        codigoDelPlan: plan.codigo,
        macroproceso: p.macro,
        proceso: p.nombre,
        vigencia: 2099,
        elaboradoEl: "2026-11-12",
      });
      expect(f!.encabezado.objetivo).toContain("Subsanar lo que encontró la auditoría interna de calidad");
      expect(f!.encabezado.objetivo).toContain(objetivo.enunciado);
      expect(f!.encabezado.fuentes).toEqual(["auditoria_interna", "autoevaluacion"]);
      expect(codigosDe(f).sort()).toEqual([h1.codigo, h2.codigo].sort());
    }));

  it("sin objetivo, el objetivo es nulo; el formato es el del documento elegido para el SGC-FO-14", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const plan = await planDeMejoraDePrueba(tx, b.admin);
      const h = await hallazgoEn(tx, b, "por_formular");
      await enElPlan(tx, b, plan.id, [h.id]);
      const actual = await obtenerConfigMejora({ sql: tx });
      await guardarConfigMejora(b.admin, { ...actual, formatos: { ...actual.formatos, plan: null } }, opc(tx));
      const sin = await fo14DePlan(b.admin, plan.id, b.procesoId, o(tx));
      expect(sin!.encabezado.objetivo).toBeNull();
      expect(sin!.formato).toBeNull();
      const doc = await documentoLibre(tx, { proceso: "CEX", tipo: "FO" });
      await guardarConfigMejora(b.admin, { ...actual, formatos: { ...actual.formatos, plan: doc.id } }, opc(tx));
      const con = await fo14DePlan(b.admin, plan.id, b.procesoId, o(tx));
      expect(con!.formato).toMatchObject({ codigo: doc.codigo });
    }));

  it("un plan que la persona no ve, uno sin hallazgos que cuenten de ese proceso o uno que no existe: nulo", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      // Un plan solo con hallazgos de otro proceso: la líder de este no lo ve.
      const ajeno = await planDeMejoraDePrueba(tx, b.admin);
      const h = await hallazgoEn(tx, { ...b, procesoId: otro.procesoId }, "por_aceptar");
      await enElPlan(tx, b, ajeno.id, [h.id]);
      expect(await fo14DePlan(b.lider, ajeno.id, b.procesoId, o(tx))).toBeNull();
      expect(await fo14DePlan(b.admin, ajeno.id, b.procesoId, o(tx))).toBeNull();
      // Un plan con un hallazgo de este proceso que ya no cuenta.
      const conAnulado = await planDeMejoraDePrueba(tx, b.admin);
      const anulado = await hallazgoEn(tx, b, "por_aceptar");
      await enElPlan(tx, b, conAnulado.id, [anulado.id]);
      await anularHallazgo(b.admin, { hallazgoId: anulado.id, justificacion: "Se registró dos veces por error" }, c(HORA_DE_ESCENA, tx));
      expect(await fo14DePlan(b.lider, conAnulado.id, b.procesoId, o(tx))).toBeNull();
      expect(await fo14DePlan(b.admin, conAnulado.id, b.procesoId, o(tx))).toBeNull();
      // Un plan que no existe.
      const [{ max }] = await tx`SELECT coalesce(max(id), 0) + 1000 AS max FROM mejora_planes`;
      expect(await fo14DePlan(b.admin, Number(max), b.procesoId, o(tx))).toBeNull();
      // Control positivo: el del otro proceso lo imprime su líder.
      expect(await fo14DePlan(otro.lider, ajeno.id, otro.procesoId, o(tx))).not.toBeNull();
    }));
});

describe("fo14Consolidado", () => {
  it("el encabezado dice «Consolidado del proceso», no tiene objetivo, se elabora hoy y cada fila trae el código de su plan o nulo", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const plan = await planDeMejoraDePrueba(tx, b.admin);
      const enPlan = await hallazgoEn(tx, b, "por_formular");
      const suelto = await hallazgoEn(tx, b, "en_revision");
      await enElPlan(tx, b, plan.id, [enPlan.id]);
      const f = await fo14Consolidado(b.admin, b.procesoId, 2026, o(tx));
      expect(f!.forma).toBe("consolidado");
      expect(f!.encabezado).toMatchObject({
        origenDelPlan: CONSOLIDADO_DEL_PROCESO,
        codigoDelPlan: CONSOLIDADO_DEL_PROCESO,
        vigencia: 2026,
        elaboradoEl: "2026-11-18",
        objetivo: null,
      });
      expect(CONSOLIDADO_DEL_PROCESO).toBe("Consolidado del proceso");
      const plan_ = new Map(f!.filas.map((x) => [x.hallazgo.codigo, x.hallazgo.planCodigo]));
      expect(plan_.get(enPlan.codigo)).toBe(plan.codigo);
      expect(plan_.get(suelto.codigo)).toBeNull();
    }));

  it("entra lo que estuvo abierto en algún momento del año, con los años en la zona de la instalación; anulados y rechazados, nunca", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const nuevo = async () => (await hallazgoEn(tx, b, "por_aceptar", { detectadoEn: "2025-06-01" })).id;
      const finDeAnio = await nuevo();
      const cierraEnero = await nuevo();
      const cierraDiciembre = await nuevo();
      const deEnero = await nuevo();
      const anulado = await nuevo();
      const rechazado = await nuevo();
      // El 31 de diciembre de 2026 a las 23:30 en Bogotá (ya 2027 en UTC), sin terminar.
      await tx`UPDATE mejora_hallazgos SET registrado_en = '2027-01-01T04:30:00Z' WHERE id = ${finDeAnio}`;
      // Registrados en 2025: uno cerrado el 1 de enero de 2026 a las 00:30 y otro el 31 de diciembre de 2025 a las 23:30 (ya 2026 en UTC).
      await tx`UPDATE mejora_hallazgos SET registrado_en = '2025-06-02T15:00:00Z', estado = 'cerrado', resultado_cierre = 'sin_accion',
        cerrado_en = '2026-01-01T05:30:00Z' WHERE id = ${cierraEnero}`;
      await tx`UPDATE mejora_hallazgos SET registrado_en = '2025-06-02T15:00:00Z', estado = 'cerrado', resultado_cierre = 'sin_accion',
        cerrado_en = '2026-01-01T04:30:00Z' WHERE id = ${cierraDiciembre}`;
      // El 1 de enero de 2027 a las 00:30 en Bogotá.
      await tx`UPDATE mejora_hallazgos SET registrado_en = '2027-01-01T05:30:00Z' WHERE id = ${deEnero}`;
      await tx`UPDATE mejora_hallazgos SET estado = 'anulado', anulado_motivo = 'Se registró dos veces por error' WHERE id = ${anulado}`;
      await tx`UPDATE mejora_hallazgos SET estado = 'rechazado' WHERE id = ${rechazado}`;
      const ids = async (anio: number) => {
        const f = await fo14Consolidado(b.admin, b.procesoId, anio, o(tx));
        return new Set(f!.filas.map((x) => x.hallazgo.id));
      };
      const de2026 = await ids(2026);
      expect(de2026.has(finDeAnio)).toBe(true);
      expect(de2026.has(cierraEnero)).toBe(true);
      expect(de2026.has(cierraDiciembre)).toBe(false);
      expect(de2026.has(deEnero)).toBe(false);
      expect(de2026.has(anulado)).toBe(false);
      expect(de2026.has(rechazado)).toBe(false);
      const de2027 = await ids(2027);
      expect([...de2027].sort()).toEqual([finDeAnio, deEnero].sort());
      const de2025 = await ids(2025);
      expect([...de2025].sort()).toEqual([cierraEnero, cierraDiciembre].sort());
    }));

  it("un hallazgo cargado en 2027 con registro en papel de 2026 entra en el de 2026 y no en el de 2025", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const datos = datosDeCarga(b.procesoId, b.lider.usuarioId, {
        registradoEnPapel: "2026-01-15",
        aprobacion: { nombre: "Marta Ríos", cargo: "Coordinadora del SGC", fecha: "2026-01-20", rol: "admin_sgc" },
      });
      const { id, codigo } = await cargarHallazgo(b.admin, datos, c("2027-02-01T15:00:00Z", tx));
      expect(codigo.startsWith("HZ-2027-")).toBe(true);
      const de2026 = await fo14Consolidado(b.admin, b.procesoId, 2026, o(tx));
      expect(de2026!.filas.some((x) => x.hallazgo.id === id)).toBe(true);
      const de2025 = await fo14Consolidado(b.admin, b.procesoId, 2025, o(tx));
      expect(de2025!.filas.some((x) => x.hallazgo.id === id)).toBe(false);
      // «Aprobación y control»: aprobado fuera de la plataforma, con el rol declarado y su fecha.
      expect(de2026!.aprobaciones).toEqual([
        { codigo, elaboro: null, aprobo: null, fuera: { rol: "Coordinador del SGC", fecha: "2026-01-20" } },
      ]);
    }));
});

describe("«Aprobación y control»", () => {
  it("una línea por hallazgo con plan de acción aprobado: «Revisó» cuando la revisión valió como aprobación, «Aprobó» de Gerencia si no", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const [{ id: cargo, nombre: nombreCargo }] = await tx`SELECT id, nombre FROM cargos ORDER BY id LIMIT 1`;
      await tx`UPDATE usuarios SET cargo_id = ${cargo} WHERE id = ${b.gerencia.usuarioId}`;
      const porRevision = await hallazgoEn(tx, b, "en_ejecucion");
      const porGerencia = await hallazgoEn(tx, b, "en_ejecucion", { criticidad: "alta" });
      const sinPlan = await hallazgoEn(tx, b, "en_revision");
      const f = await fo14Consolidado(b.admin, b.procesoId, 2026, o(tx));
      const lineas = new Map(f!.aprobaciones.map((a) => [a.codigo, a]));
      expect(lineas.has(sinPlan.codigo)).toBe(false);
      expect(lineas.get(porRevision.codigo)).toEqual({
        codigo: porRevision.codigo,
        elaboro: { nombre: b.lider.nombre, cargo: null },
        aprobo: { nombre: b.admin.nombre, cargo: null, fecha: "2026-11-17" },
        fuera: null,
      });
      expect(lineas.get(porGerencia.codigo)).toEqual({
        codigo: porGerencia.codigo,
        elaboro: { nombre: b.lider.nombre, cargo: null },
        aprobo: { nombre: b.gerencia.nombre, cargo: nombreCargo, fecha: "2026-11-17" },
        fuera: null,
      });
      // En el orden de las filas: por código.
      expect(f!.aprobaciones.map((a) => a.codigo)).toEqual([porRevision.codigo, porGerencia.codigo].sort());
    }));
});

describe("los responsables", () => {
  it("son los líderes activos del proceso con su cargo; un proceso sin líder da la lista vacía", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const [{ id: cargo, nombre }] = await tx`SELECT id, nombre FROM cargos ORDER BY id LIMIT 1`;
      await tx`UPDATE usuarios SET cargo_id = ${cargo} WHERE id = ${b.lider.usuarioId}`;
      const f = await fo14Consolidado(b.admin, b.procesoId, 2026, o(tx));
      expect(f!.encabezado.responsables).toEqual([{ nombre: b.lider.nombre, cargo: nombre }]);
      const sinLider = await procesoNuevo(tx);
      const g = await fo14Consolidado(b.admin, sinLider, 2026, o(tx));
      expect(g!.encabezado.responsables).toEqual([]);
      expect(g!.filas).toEqual([]);
    }));
});

describe("quién lo imprime", () => {
  it("quien ve todo y la líder del proceso, sí; la líder de otro proceso y Consulta, no; un año fuera de 2000 a 2100, nadie", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const plan = await planDeMejoraDePrueba(tx, b.admin);
      const h = await hallazgoEn(tx, b, "en_ejecucion");
      await enElPlan(tx, b, plan.id, [h.id]);
      const consolidado = (quien: SesionFlujo, anio = 2026) => fo14Consolidado(quien, b.procesoId, anio, o(tx));
      const delPlan = (quien: SesionFlujo) => fo14DePlan(quien, plan.id, b.procesoId, o(tx));
      for (const quien of [b.admin, b.control, b.gerencia, b.lider]) {
        expect(await consolidado(quien)).not.toBeNull();
        expect(await delPlan(quien)).not.toBeNull();
      }
      for (const quien of [otro.lider, b.consulta]) {
        expect(await consolidado(quien)).toBeNull();
        expect(await delPlan(quien)).toBeNull();
      }
      for (const anio of [1999, 2101, 2026.5]) expect(await consolidado(b.admin, anio)).toBeNull();
      expect(await consolidado(b.admin, 2000)).not.toBeNull();
      expect(await consolidado(b.admin, 2100)).not.toBeNull();
      // Un proceso que no existe.
      const [{ max }] = await tx`SELECT coalesce(max(id), 0) + 1000 AS max FROM procesos`;
      expect(await fo14Consolidado(b.admin, Number(max), 2026, o(tx))).toBeNull();
    }));

  it("procesosQueImprime: a quien ve todo, todos; a la líder, solo los suyos activos; a los demás, ninguno", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const ambos = [b.procesoId, otro.procesoId];
      expect(await procesosQueImprime(b.control, ambos, { sql: tx })).toEqual(ambos);
      expect(await procesosQueImprime(b.lider, ambos, { sql: tx })).toEqual([b.procesoId]);
      expect(await procesosQueImprime(b.consulta, ambos, { sql: tx })).toEqual([]);
      await tx`UPDATE procesos SET activo = false WHERE id = ${b.procesoId}`;
      expect(await procesosQueImprime(b.lider, ambos, { sql: tx })).toEqual([]);
    }));
});
