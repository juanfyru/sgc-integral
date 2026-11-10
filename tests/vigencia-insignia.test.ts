/**
 * La insignia de «Vigencia» de quien solo necesita la cifra (Gerencia y Control Interno sin externos a cargo; F-I3 de la
 * revisión final, Ruling 68): un conteo en SQL que repite a propósito las reglas puras de la vigencia. Se compara,
 * documento por documento y a varias horas (los bordes del día y del mes en la zona), con el estado que calcula
 * TypeScript sobre la misma lectura; y la insignia de Gerencia con la de la lectura completa de toda la base. Contra la
 * BD de desarrollo, dentro de una transacción que se revierte; los PDF van a un almacén temporal.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { crearSolicitud } from "@/db/consultas/tramites-flujo";
import { registrarVerificacion } from "@/db/consultas/vigencia/externos";
import { columnasDeVigencia, contarVencidas } from "@/db/consultas/vigencia/fragmentos";
import { ratificar } from "@/db/consultas/vigencia/ratificaciones";
import { fijarProximaRevision, listarSemaforo } from "@/db/consultas/vigencia/semaforo";
import { vigenciaDePersona } from "@/db/consultas/vigencia/tareas";
import { opc, sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { externoDePrueba, firmaDePrueba, sinFechaDeRevision, sinRevisionAbierta, vigenteFuera } from "./utiles/vigencia";

const sql = obtenerSql();

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-vigencia-insignia-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

/**
 * Las horas de la comparación: el día del vencimiento y el siguiente (también a las 23:30 de la zona, que en UTC ya es
 * el día siguiente), un día lejano antes y otro después.
 */
const HORAS = [
  "2024-01-01T15:00:00Z",
  "2025-02-28T15:00:00Z",
  "2025-03-01T04:30:00Z",
  "2025-03-01T15:00:00Z",
  "2025-03-05T15:00:00Z",
  "2025-03-06T15:00:00Z",
  "2025-06-11T15:00:00Z",
  "2026-06-11T15:00:00Z",
  "2026-11-09T15:00:00Z",
  "2031-01-01T15:00:00Z",
].map((h) => new Date(h));

describe("contarVencidas", () => {
  it("cada regla de la vigencia da lo mismo en el conteo que en el estado calculado, a cada hora", () =>
    revertida(sql, async (tx) => {
      await sinRevisionAbierta(tx);
      const admin = await sesionAdmin(tx);
      const [cex] = await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`;
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [Number(cex.id)] });
      const casos: Record<string, number> = {};
      const limpiar: (() => Promise<void>)[] = [];
      const interno = async (fechaAprobacion: string, meses?: number) => {
        const d = await vigenteFuera(tx, { fechaAprobacion });
        limpiar.push(d.limpiar);
        if (meses !== undefined) await tx`UPDATE documentos SET meses_revision = ${meses} WHERE id = ${d.id}`;
        return d;
      };
      try {
        // Aprobado fuera el último día de enero, a un mes: vence el 28 de febrero (sumarMeses recorta al fin de mes).
        casos["fuera, fin de mes"] = (await interno("2025-01-31", 1)).id;
        // Aprobado fuera y ratificado después: cuenta desde la ratificación.
        const ratificado = await interno("2024-03-10", 12);
        await ratificar(admin, { documentoId: ratificado.id, nota: null, credenciales: { clave: "ok" } }, {
          sql: tx,
          ahora: new Date("2025-06-10T20:00:00Z"),
          verificar: firmaDePrueba,
        });
        casos["fuera, ratificado después"] = ratificado.id;
        // Publicado en la plataforma un 29 de febrero a las 23:30 de la zona (en UTC ya es 1 de marzo), a 12 meses.
        const plataforma = await interno("2024-02-01", 12);
        await tx`UPDATE documento_versiones SET origen_aprobacion = 'plataforma', publicado_en = ${new Date("2024-03-01T04:30:00Z")}
          WHERE id = ${plataforma.versionId}`;
        casos["plataforma, 29 de febrero"] = plataforma.id;
        // Con la fecha fijada a mano: manda sobre el plazo.
        const fijado = await interno("2020-01-10", 12);
        await fijarProximaRevision(admin, { documentoIds: [fijado.id], fecha: "2025-03-05", nota: "Carga inicial escalonada" }, {
          sql: tx,
          ahora: new Date("2025-01-01T15:00:00Z"),
        });
        casos["fecha fijada"] = fijado.id;
        // Vencido, pero con un trámite abierto: está en trámite, no vencido.
        const enTramite = await interno("2020-01-10", 12);
        await crearSolicitud(admin, { tipo: "modificar", motivo: "mejora", justificacion: "Se actualiza el procedimiento.", documentoId: enTramite.id }, opc(tx));
        casos["en trámite"] = enTramite.id;
        // Sin desde cuándo contar: no tiene fecha y no está vencido.
        const sinFecha = await interno("2020-01-10", 12);
        await sinFechaDeRevision(tx, { versionId: sinFecha.versionId });
        casos["sin fecha"] = sinFecha.id;
        // Externos: uno que cuenta desde su adopción y otro desde su última verificación (la ratificación no cuenta).
        const adoptado = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017", ahora: new Date("2024-03-01T15:00:00Z") });
        limpiar.push(adoptado.limpiar);
        casos["externo adoptado"] = adoptado.documentoId;
        const verificado = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2018", ahora: new Date("2023-01-15T15:00:00Z") });
        limpiar.push(verificado.limpiar);
        await registrarVerificacion(lider, { documentoId: verificado.documentoId, resultado: "vigente", fuente: "https://www.minsalud.gov.co", nota: null }, {
          sql: tx,
          ahora: new Date("2025-06-10T15:00:00Z"),
        });
        casos["externo verificado"] = verificado.documentoId;

        const vistos = new Set<string>();
        for (const ahora of HORAS) {
          for (const [caso, id] of Object.entries(casos)) {
            const [fila] = await columnasDeVigencia(tx, tx`d.id = ${id}`, ahora);
            const esperado = fila.vigencia.estado === "vencida" ? 1 : 0;
            vistos.add(`${caso}:${esperado}`);
            expect(await contarVencidas(tx, tx`d.id = ${id}`, ahora), `${caso} a las ${ahora.toISOString()}`).toBe(esperado);
          }
        }
        // Cada caso que puede vencer se vio vencido y sin vencer; los otros dos, nunca vencidos.
        for (const caso of Object.keys(casos)) {
          if (caso === "en trámite" || caso === "sin fecha") expect([...vistos]).not.toContain(`${caso}:1`);
          else expect([...vistos], caso).toEqual(expect.arrayContaining([`${caso}:0`, `${caso}:1`]));
        }
      } finally {
        for (const l of limpiar) await l();
      }
    }));

  it("la insignia de Gerencia y de Control Interno por el conteo es la de la lectura completa, sobre toda la base", () =>
    revertida(sql, async (tx) => {
      for (const rol of ["gerencia", "control_interno"] as const) {
        const persona = await usuarioDePrueba(tx, { rol });
        for (const ahora of [new Date("2025-01-01T15:00:00Z"), new Date(), new Date("2030-01-01T15:00:00Z")]) {
          const { vencidos, tareas } = await vigenciaDePersona(persona, { responsableTecnico: false }, { sql: tx, ahora });
          const filas = await listarSemaforo(persona, { estado: "vencida" }, { sql: tx, ahora });
          expect(vencidos, `${rol} a las ${ahora.toISOString()}`).toBe(filas.length);
          expect(tareas).toEqual([]);
        }
      }
    }));
});
