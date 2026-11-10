/**
 * Lo que comparten el cascarón y la página en una misma petición (F-I3 de la revisión final, Ruling 68): con
 * `React.cache`, la lectura de la vigencia, las tareas y «¿es responsable técnico?» corren una vez aunque las pidan el
 * layout y la página. En Vitest `react` no trae la caché del servidor (`cache` no guarda nada), así que aquí se sustituye
 * por una que guarda por función y argumentos (por identidad, como la de React) mientras dura una «petición». Se cuentan
 * las sentencias contra la BD de desarrollo, dentro de una transacción que se revierte.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const { contexto, peticion } = vi.hoisted(() => ({
  contexto: { sql: null as unknown },
  peticion: { caché: new Map<unknown, unknown>(), resultado: Symbol("resultado") },
}));

vi.mock("react", async (original) => {
  const real = await original<typeof import("react")>();
  // La caché de una petición: por función, por cantidad de argumentos y por cada argumento (objetos por identidad).
  const cache = <A extends unknown[], R>(fn: (...a: A) => R) => (...args: A): R => {
    let nodo = peticion.caché;
    for (const clave of [fn, args.length, ...args]) {
      if (!nodo.has(clave)) nodo.set(clave, new Map());
      nodo = nodo.get(clave) as Map<unknown, unknown>;
    }
    if (!nodo.has(peticion.resultado)) nodo.set(peticion.resultado, fn(...args));
    return nodo.get(peticion.resultado) as R;
  };
  return { ...real, cache, default: { ...real, cache } };
});
vi.mock("@/db/cliente", async (original) => {
  const real = await original<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => (contexto.sql ?? real.obtenerSql()) as ReturnType<typeof real.obtenerSql> };
});
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: vi.fn() }));
vi.mock("@/lib/vencimientos-disparo", () => ({ dispararRevisionDeVencimientos: vi.fn() }));
vi.mock("@/db/consultas/entidad", () => ({ obtenerMarcaSegura: async () => ({ nombre: "Entidad", sigla: "E", logo: null }) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NO_ENCONTRADA");
  },
}));

import { exigirVigencia } from "@/app/(app)/vigencia/_comun";
import { Cascaron } from "@/componentes/cascaron/Cascaron";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { indicadoresDocumentales } from "@/db/consultas/vigencia/indicadores";
import { listarSemaforo } from "@/db/consultas/vigencia/semaforo";
import type { SesionValida } from "@/lib/sesion";
import { tareasDePeticion } from "@/lib/tareas-peticion";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const valida = (s: SesionFlujo): SesionValida => ({
  ...s,
  totpActivo: false,
  factorPendiente: false,
  debeCambiarClave: false,
  aceptoDatos: true,
  tema: "sistema",
});

/** Una petición: caché vacía y una conexión que cuenta las sentencias que se ejecutan. */
async function enUnaPeticion(tx: TransactionSql, trabajo: () => Promise<unknown>): Promise<string[]> {
  const sentencias: string[] = [];
  contexto.sql = new Proxy(tx, {
    apply(objetivo, propio, argumentos: unknown[]) {
      const consulta = Reflect.apply(objetivo, propio, argumentos) as { then?: (...a: unknown[]) => unknown };
      const plantilla = argumentos[0];
      if (consulta && typeof consulta.then === "function" && Array.isArray(plantilla) && "raw" in plantilla) {
        const original = consulta.then.bind(consulta);
        let contadaYa = false;
        consulta.then = (...a: unknown[]) => {
          if (!contadaYa) {
            contadaYa = true;
            sentencias.push((plantilla as string[]).join("?"));
          }
          return original(...a);
        };
      }
      return consulta;
    },
  });
  peticion.caché = new Map();
  try {
    await trabajo();
  } finally {
    contexto.sql = null;
  }
  return sentencias;
}

/** La lectura de la vigencia (la de filas) y la pregunta de si la persona es responsable técnico. */
const deVigencia = (s: string[]) => s.filter((t) => t.includes("FROM ratificaciones r JOIN firmas f") && !t.includes("AS vencidas")).length;
const deResponsable = (s: string[]) => s.filter((t) => t.includes("WHERE ex.responsable_id =")).length;

describe("el cascarón y la página comparten la petición", () => {
  it("en /, /vigencia/semaforo y /vigencia/indicadores la lectura de la vigencia corre una sola vez", () =>
    revertida(sql, async (tx) => {
      const [gth] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
      for (const persona of [await sesionAdmin(tx), await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [Number(gth.id)] })]) {
        const sesion = valida(persona);
        const cascaron = () => Cascaron({ sesion, children: null });
        const solo = await enUnaPeticion(tx, cascaron);
        expect(deVigencia(solo), persona.rol).toBe(1);

        const inicio = await enUnaPeticion(tx, () => Promise.all([cascaron(), tareasDePeticion(sesion)]));
        expect({ vigencia: deVigencia(inicio), responsable: deResponsable(inicio), total: inicio.length }, `/ ${persona.rol}`).toEqual({
          vigencia: 1,
          responsable: 1,
          total: solo.length,
        });

        const semaforo = await enUnaPeticion(tx, () =>
          Promise.all([cascaron(), exigirVigencia(sesion), listarSemaforo(sesion, { estado: "todos" })]),
        );
        expect({ vigencia: deVigencia(semaforo), responsable: deResponsable(semaforo) }, `/vigencia/semaforo ${persona.rol}`).toEqual({
          vigencia: 1,
          responsable: 1,
        });

        const indicadores = await enUnaPeticion(tx, () =>
          Promise.all([cascaron(), exigirVigencia(sesion), indicadoresDocumentales(sesion, { periodo: "2026" })]),
        );
        expect(deVigencia(indicadores), `/vigencia/indicadores ${persona.rol}`).toBe(1);
      }
    }));
});
