/**
 * Lo que la persona escribe con coma («2,375») entra al dominio ya normalizado («2.375») y el dominio no lo rechaza como
 * punto de miles (complemento de la 14C, Tarea 2). Contra la BD de desarrollo, dentro de una transacción que se revierte.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { guardarDato } from "@/db/consultas/indicadores/datos";
import { crearIndicador, guardarBorrador } from "@/db/consultas/indicadores/fichas";
import { EsquemaFichaDeLaPersona, type DatosFicha } from "@/lib/esquemas/indicadores";
import { EsquemaDatoDeLaPersona } from "@/lib/esquemas/indicadores-datos";
import { parsearFormulario } from "@/lib/validacion";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const formulario = (campos: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
};

describe("una cifra con tres decimales escrita con coma llega al dominio y se guarda con punto", () => {
  it("meta, un valor de los rangos y un límite de captura de la ficha: crear y guardar el borrador", () =>
    revertida(sql, async (tx: TransactionSql) => {
      const admin = await sesionAdmin(tx);
      const [p] = await tx`SELECT id FROM procesos WHERE sigla = 'SGC'`;
      const [t] = await tx`SELECT id FROM tipos_indicador WHERE nombre = 'Eficacia'`;
      const [c] = await tx`SELECT id FROM clasificaciones_indicador WHERE nombre = 'Operativo'`;
      const [u] = await tx`SELECT id FROM unidades_indicador WHERE nombre = 'Porcentaje'`;
      const [area] = await tx`SELECT id FROM areas ORDER BY id LIMIT 1`;
      const [cargo] = await tx`INSERT INTO cargos (nombre, area_id) VALUES (${`ZZ Cargo ${Date.now()}`}, ${area.id}) RETURNING id`;
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const escrita = (meta: string): DatosFicha =>
        parsearFormulario(
          formulario({
            procesoId: String(p.id),
            nombre: `Cumplimiento ${meta}`,
            proposito: "Saber si se cumple",
            tipoId: String(t.id),
            clasificacionId: String(c.id),
            forma: "porcentaje",
            variables: JSON.stringify([
              { letra: "A", nombre: "Ejecutadas", consolidacion: "suma", admiteNegativos: false, capturaMin: "2,375" },
              { letra: "B", nombre: "Programadas", consolidacion: "suma", admiteNegativos: false },
            ]),
            unidadId: String(u.id),
            decimales: "1",
            periodicidad: "trimestral",
            tendencia: "ascendente",
            meta,
            semaforoModo: "rangos",
            rangos: JSON.stringify({ bien: [{ signo: ">=", valor: "2,375" }], atencion: [{ signo: ">=", valor: "1,5" }], critico: [{ signo: "<", valor: "1,5" }] }),
            cargosMedir: JSON.stringify([Number(cargo.id)]),
            cargosAnalizar: JSON.stringify([Number(cargo.id)]),
            normaIds: "[]",
            plazoReporteDias: "10",
            inicioMedicion: "2026-T1",
            nivelAcceso: "general",
            mide: JSON.stringify([mide.usuarioId]),
            analiza: JSON.stringify([mide.usuarioId]),
          }),
          EsquemaFichaDeLaPersona,
        );
      const { versionId } = await crearIndicador(admin, escrita("2,375"), { sql: tx });
      const guardado = async () => {
        const [v] = await tx`SELECT meta, rangos FROM indicador_versiones WHERE id = ${versionId}`;
        const [a] = await tx`SELECT captura_min FROM indicador_variables WHERE version_id = ${versionId} AND letra = 'A'`;
        return { meta: String(v.meta), bien: v.rangos.bien[0].valor, min: String(a.captura_min) };
      };
      expect(await guardado()).toEqual({ meta: "2.375", bien: "2.375", min: "2.375" });
      await guardarBorrador(admin, versionId, escrita("2,375"), { sql: tx });
      expect(await guardado()).toEqual({ meta: "2.375", bien: "2.375", min: "2.375" });
    }));

  it("un límite de captura de un dato compartido", () =>
    revertida(sql, async (tx: TransactionSql) => {
      const admin = await sesionAdmin(tx);
      const [p] = await tx`SELECT id FROM procesos WHERE sigla = 'SGC'`;
      const d = parsearFormulario(
        formulario({
          procesoId: String(p.id),
          nombre: `ZZ Dato ${Date.now()}`,
          periodicidad: "mensual",
          consolidacion: "suma",
          plazoReporteDias: "10",
          capturaMin: "2,375",
          capturaMax: "5000,125",
        }),
        EsquemaDatoDeLaPersona,
      );
      const { id } = await guardarDato(admin, d, { sql: tx });
      const [fila] = await tx`SELECT captura_min, captura_max FROM variables_compartidas WHERE id = ${id}`;
      expect([String(fila.captura_min), String(fila.captura_max)]).toEqual(["2.375", "5000.125"]);
    }));
});
