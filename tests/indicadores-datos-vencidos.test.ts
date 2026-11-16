/**
 * Los recordatorios de los periodos de un dato compartido (anexo 14C, §4.4; Tarea 10 de la 14C): el aviso previo, el de
 * vencido y el escalamiento al jefe, cada uno una sola vez (marcas en el periodo), con la mecánica de `correrPaso`; el
 * escalamiento no nombra el dato. Contra la BD de desarrollo, dentro de una transacción que se revierte y con lo ajeno
 * silenciado (`silenciarIndicadores`).
 *
 * El dato es mensual, con plazo de 10 días: octubre de 2026 vence el 10 de noviembre. El aviso previo va a 3 días y el
 * escalamiento, a más de 3 días de vencido.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { CONFIG_DOCUMENTAL_DEFECTO } from "@/db/consultas/config-documental";
import { datosVencidos } from "@/db/consultas/indicadores/datos-vencidos";
import { revisarVencimientosDeIndicadores } from "@/db/consultas/indicadores/vencimientos";
import { datoDePrueba, indicadorDePrueba, periodoDeDatoDePrueba, silenciarIndicadores } from "./utiles/indicadores";
import { usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

let consecutivo = 0;
const unico = () => `${Date.now() % 100_000_000}${(consecutivo += 1)}`;

const NOMBRE = "Total facturado en el mes";
/** Las 10 de la mañana del día dado de noviembre de 2026, en Bogotá. */
const noviembre = (d: number) => new Date(`2026-11-${String(d).padStart(2, "0")}T15:00:00Z`);
const NADA = { previos: 0, vencidos: 0, escalados: 0 };

const pasar = (tx: TransactionSql, ahora: Date) => datosVencidos({ sql: tx, ahora, escalamientoDias: 3 });

type Aviso = { tipo: string; titulo: string; cuerpo: string; enlace: string | null; entidad: string; entidad_id: number };

/** Los avisos de los datos compartidos de la persona, en orden de llegada. */
async function avisosDe(tx: TransactionSql, usuarioId: number): Promise<Aviso[]> {
  const filas = await tx`SELECT tipo, titulo, cuerpo, enlace, entidad, entidad_id FROM notificaciones
    WHERE usuario_id = ${usuarioId} AND tipo LIKE 'indicadores.dato\\_%' ORDER BY id`;
  return filas.map((f) => ({ ...(f as unknown as Aviso), entidad_id: Number(f.entidad_id) }));
}

const marcas = async (tx: TransactionSql, periodoId: number) =>
  (await tx`SELECT aviso_previo_en, aviso_vencido_en, escalado_en FROM variable_valores WHERE id = ${periodoId}`)[0];

/** Un proceso que solo existe en la transacción: sus líderes son los que el test le asigne. */
async function procesoNuevo(tx: TransactionSql): Promise<{ id: number; nombre: string }> {
  const sigla = `Z${unico()}`;
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${`Proceso ${sigla}`}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id, nombre`;
  return { id: Number(p.id), nombre: p.nombre as string };
}

/** Lo ajeno callado, el aviso previo a 3 días, el proceso, el responsable con su jefe y el dato. */
async function entorno(tx: TransactionSql) {
  await silenciarIndicadores(tx);
  await tx`UPDATE configuracion SET valor = '3' WHERE clave = 'ind_aviso_previo_dias'`;
  const proceso = await procesoNuevo(tx);
  const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
  const responsable = await usuarioDePrueba(tx, { rol: "consulta", jefeId: jefe.usuarioId });
  const datoId = await datoDePrueba(tx, { procesoId: proceso.id, nombre: NOMBRE, responsables: [responsable.usuarioId] });
  return { proceso, jefe, responsable, datoId };
}

/** Octubre de 2026 del dato, abierto el 1 de noviembre: vence el 10. */
const octubre = (tx: TransactionSql, datoId: number, valor?: string) =>
  periodoDeDatoDePrueba(tx, { datoId, periodo: "2026-10", ahora: noviembre(1), ...(valor === undefined ? {} : { valor }) });

describe("datosVencidos", () => {
  it("aviso previo: una vez, a los días del parámetro, agrupado por persona", () =>
    revertida(sql, async (tx) => {
      const { proceso, responsable, datoId } = await entorno(tx);
      const otroDato = await datoDePrueba(tx, { procesoId: proceso.id, responsables: [responsable.usuarioId] });
      const a = await octubre(tx, datoId);
      const b = await octubre(tx, otroDato);

      // A cuatro días del plazo todavía no.
      expect(await pasar(tx, noviembre(6))).toEqual(NADA);
      expect(await pasar(tx, noviembre(7))).toEqual({ ...NADA, previos: 2 });
      expect(await avisosDe(tx, responsable.usuarioId)).toEqual([
        {
          tipo: "indicadores.dato_por_vencer",
          titulo: "Tiene 2 datos compartidos por reportar antes del 10 de noviembre",
          cuerpo: "Los encuentra en «Mis tareas».",
          enlace: "/indicadores/datos",
          entidad: "usuario",
          entidad_id: responsable.usuarioId,
        },
      ]);
      for (const p of [a, b]) expect((await marcas(tx, p)).aviso_previo_en).toEqual(noviembre(7));
      expect(await pasar(tx, noviembre(8))).toEqual(NADA);
      expect(await avisosDe(tx, responsable.usuarioId)).toHaveLength(1);
    }));

  it("vencido: una vez, al responsable y, por proceso, al líder del proceso dueño", () =>
    revertida(sql, async (tx) => {
      const { proceso, responsable, datoId } = await entorno(tx);
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [proceso.id] });
      const periodoId = await octubre(tx, datoId);
      await tx`UPDATE variable_valores SET aviso_previo_en = ${noviembre(7)} WHERE id = ${periodoId}`;

      expect(await pasar(tx, noviembre(10))).toEqual(NADA);
      expect(await pasar(tx, noviembre(11))).toEqual({ ...NADA, vencidos: 1 });
      expect(await avisosDe(tx, responsable.usuarioId)).toEqual([
        {
          tipo: "indicadores.dato_vencido",
          titulo: "Tiene 1 dato compartido por reportar con el plazo vencido",
          cuerpo: "El plazo venció el 10 de noviembre.",
          enlace: `/indicadores/datos/${datoId}`,
          entidad: "usuario",
          entidad_id: responsable.usuarioId,
        },
      ]);
      expect(await avisosDe(tx, lider.usuarioId)).toEqual([
        {
          tipo: "indicadores.dato_vencido",
          titulo: `1 dato compartido de ${proceso.nombre} con el plazo vencido`,
          cuerpo: "El plazo venció el 10 de noviembre.",
          enlace: `/indicadores/datos/${datoId}`,
          entidad: "proceso",
          entidad_id: proceso.id,
        },
      ]);
      expect((await marcas(tx, periodoId)).aviso_vencido_en).toEqual(noviembre(11));
      expect(await pasar(tx, noviembre(12))).toEqual(NADA);
      expect(await avisosDe(tx, responsable.usuarioId)).toHaveLength(1);
    }));

  it("escalamiento: pasados los días de Configuración documental, al jefe, una vez y sin nombrar el dato", () =>
    revertida(sql, async (tx) => {
      const { jefe, responsable, datoId } = await entorno(tx);
      const periodoId = await octubre(tx, datoId);
      await tx`UPDATE variable_valores SET aviso_previo_en = ${noviembre(7)}, aviso_vencido_en = ${noviembre(11)} WHERE id = ${periodoId}`;

      expect(await pasar(tx, noviembre(13))).toEqual(NADA);
      expect(await pasar(tx, noviembre(14))).toEqual({ ...NADA, escalados: 1 });
      const avisos = await avisosDe(tx, jefe.usuarioId);
      expect(avisos).toEqual([
        {
          tipo: "indicadores.dato_escalado",
          titulo: "Datos compartidos vencidos",
          cuerpo: `1 dato compartido a cargo de ${responsable.nombre} sigue vencido. Venció hace 4 días.`,
          enlace: null,
          entidad: "usuario",
          entidad_id: responsable.usuarioId,
        },
      ]);
      expect(avisos[0].cuerpo).not.toContain(NOMBRE);
      expect((await marcas(tx, periodoId)).escalado_en).toEqual(noviembre(14));
      expect(await pasar(tx, noviembre(15))).toEqual(NADA);
      expect(await avisosDe(tx, jefe.usuarioId)).toHaveLength(1);
    }));

  it("un dato ya reportado no avisa", () =>
    revertida(sql, async (tx) => {
      const { jefe, responsable, datoId } = await entorno(tx);
      const periodoId = await octubre(tx, datoId, "1284300000");
      for (const d of [7, 11, 20]) expect(await pasar(tx, noviembre(d))).toEqual(NADA);
      expect(await avisosDe(tx, responsable.usuarioId)).toEqual([]);
      expect(await avisosDe(tx, jefe.usuarioId)).toEqual([]);
      expect(Object.values(await marcas(tx, periodoId))).toEqual([null, null, null]);
    }));

  it("lo que el Admin SGC tiene de respaldo (sin responsable ni líder) le avisa, pero no se escala", () =>
    revertida(sql, async (tx) => {
      await silenciarIndicadores(tx);
      const proceso = await procesoNuevo(tx);
      const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
      const admin = await usuarioDePrueba(tx, { rol: "admin_sgc", jefeId: jefe.usuarioId });
      const datoId = await datoDePrueba(tx, { procesoId: proceso.id, nombre: NOMBRE });
      const periodoId = await octubre(tx, datoId);

      expect((await pasar(tx, noviembre(11))).vencidos).toBe(1);
      expect((await avisosDe(tx, admin.usuarioId)).map((a) => a.tipo)).toEqual(["indicadores.dato_vencido"]);
      expect((await pasar(tx, noviembre(20))).escalados).toBe(0);
      expect(await avisosDe(tx, jefe.usuarioId)).toEqual([]);
      expect((await marcas(tx, periodoId)).escalado_en).toBeNull();
    }));
});

describe("la pasada de los indicadores con los datos compartidos", () => {
  it("abre el periodo del dato que pide un indicador y avisa a su responsable, sumado a la cuenta", () =>
    revertida(sql, async (tx) => {
      const { proceso, responsable, datoId } = await entorno(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const config = { ...CONFIG_DOCUMENTAL_DEFECTO, escalamientoDias: 3 };
      const pasada = (ahora: Date) => revisarVencimientosDeIndicadores({ sql: tx, ahora, config });
      // Mensual desde septiembre, aprobado en agosto, con A propia y B el dato: septiembre vence el 10 de octubre.
      await indicadorDePrueba(tx, {
        procesoId: proceso.id,
        inicioMedicion: "2026-09",
        aprobadaEn: new Date("2026-08-15T15:00:00Z"),
        mide: [mide.usuarioId],
        variables: { B: { datoId } },
      });

      expect(await pasada(new Date("2026-10-05T15:00:00Z"))).toEqual({ avisados: 0, escalados: 0 });
      expect((await tx`SELECT periodo FROM variable_valores WHERE variable_id = ${datoId}`).map((f) => f.periodo)).toEqual(["2026-09"]);
      // El aviso previo de la medición, a quien mide, y el del dato, a su responsable.
      expect(await pasada(new Date("2026-10-08T15:00:00Z"))).toEqual({ avisados: 2, escalados: 0 });
      expect((await avisosDe(tx, responsable.usuarioId)).map((a) => a.titulo)).toEqual([
        "Tiene 1 dato compartido por reportar antes del 10 de octubre",
      ]);
    }));
});
