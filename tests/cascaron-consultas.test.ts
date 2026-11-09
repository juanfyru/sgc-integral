/**
 * Lo que cuesta el cascarón en la BD por render (resolución 1 de la Tarea 7): la consulta de vigencia corre como mucho
 * una vez por persona y la configuración documental se lee una vez; quien no es responsable técnico ni tiene
 * `vigencia.ver` no paga ninguna consulta de vigencia. Se cuentan las sentencias que se ejecutan (no los fragmentos),
 * con el cascarón real contra la BD de desarrollo, dentro de una transacción que se revierte.
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const contexto = vi.hoisted(() => ({ sql: null as unknown }));

vi.mock("@/db/cliente", async (original) => {
  const real = await original<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => (contexto.sql ?? real.obtenerSql()) as ReturnType<typeof real.obtenerSql> };
});
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: vi.fn() }));
vi.mock("@/lib/vencimientos-disparo", () => ({ dispararRevisionDeVencimientos: vi.fn() }));
// La marca va en caché por petición: no es del cascarón de esta tarea.
vi.mock("@/db/consultas/entidad", () => ({ obtenerMarcaSegura: async () => ({ nombre: "Entidad", sigla: "E", logo: null }) }));

import { Cascaron } from "@/componentes/cascaron/Cascaron";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import type { SesionValida } from "@/lib/sesion";
import { sesionAdmin, sesionDe, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { externoDePrueba } from "./utiles/vigencia";

const sql = obtenerSql();

let almacen: string;
const previo = process.env.ALMACEN_RUTA;

beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-cascaron-consultas-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
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

/**
 * La transacción con un contador: cuenta una sentencia cuando se ejecuta (cuando se espera), no cuando se arma como
 * fragmento de otra. Devuelve el texto de cada una.
 */
function contada(tx: TransactionSql): { sql: TransactionSql; sentencias: string[] } {
  const sentencias: string[] = [];
  const proxy = new Proxy(tx, {
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
  return { sql: proxy as unknown as TransactionSql, sentencias };
}

/** Las sentencias de un render del cascarón como `sesion`. */
async function sentenciasDelCascaron(tx: TransactionSql, sesion: SesionFlujo): Promise<string[]> {
  const { sql: contador, sentencias } = contada(tx);
  contexto.sql = contador;
  try {
    await Cascaron({ sesion: valida(sesion), children: null });
  } finally {
    contexto.sql = null;
  }
  return sentencias;
}

/** La consulta de vigencia (`columnasDeVigencia`) y la lectura de la configuración documental. */
const deVigencia = (s: string[]) => s.filter((t) => t.includes("FROM ratificaciones r JOIN firmas f")).length;
const deConfiguracion = (s: string[]) => s.filter((t) => t.includes("FROM configuracion WHERE clave = ANY")).length;

describe("el costo del cascarón por render", () => {
  it("la consulta de vigencia corre como mucho una vez por persona y la configuración se lee una vez; sin vigencia, ninguna", () =>
    revertida(sql, async (tx) => {
      const lider = await sesionDe(tx, "lider.cex");
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const e = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017", responsableId: responsable.usuarioId });
      try {
        const casos: [string, SesionFlujo][] = [
          ["Admin SGC", await sesionAdmin(tx)],
          ["líder", lider],
          ["Consulta sin externos", await usuarioDePrueba(tx, { rol: "consulta" })],
          ["Consulta responsable técnico", responsable],
        ];
        const cuentas: Record<string, { total: number; vigencia: number; configuracion: number }> = {};
        for (const [nombre, sesion] of casos) {
          const s = await sentenciasDelCascaron(tx, sesion);
          cuentas[nombre] = { total: s.length, vigencia: deVigencia(s), configuracion: deConfiguracion(s) };
        }
        // Para el informe: CONTAR_CASCARON=<archivo> deja las cuentas en ese archivo.
        if (process.env.CONTAR_CASCARON) writeFileSync(process.env.CONTAR_CASCARON, JSON.stringify(cuentas));

        for (const nombre of ["Admin SGC", "líder", "Consulta responsable técnico"]) {
          expect(cuentas[nombre].vigencia, nombre).toBe(1);
          expect(cuentas[nombre].configuracion, nombre).toBe(1);
        }
        expect(cuentas["Consulta sin externos"]).toMatchObject({ vigencia: 0, configuracion: 0 });
      } finally {
        await e.limpiar();
      }
    }));
});
