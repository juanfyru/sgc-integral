/**
 * Lo que cuesta el cascarón en la BD por render (resolución 1 de la Tarea 7): la consulta de vigencia corre como mucho
 * una vez por persona y la configuración documental se lee una vez; quien no es responsable técnico ni tiene
 * `vigencia.ver` no paga ninguna consulta de vigencia. Las tareas de impactos normativos (Tarea 9) y las de la revisión
 * anual (Tarea 10) son una sola consulta acotada cada una, solo para quien lidera procesos o es Admin SGC; las de validar
 * la corrección de un hallazgo (Tarea 13), una sola consulta y solo para quien realiza verificaciones. Las de los
 * indicadores (Fase 14A, Tarea 13), una para las mediciones y otra para las observaciones de toda persona, más una para
 * quien aprueba fichas y otra para quien administra, sin importar cuántas haya. Se cuentan
 * las sentencias que se ejecutan (no los fragmentos),
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

/** La consulta de vigencia (las filas de `lecturaDeVigencia`), su conteo (`contarVencidas`) y la configuración documental. */
const deVigencia = (s: string[]) => s.filter((t) => t.includes("FROM ratificaciones r JOIN firmas f") && !t.includes("AS vencidas")).length;
const deConteo = (s: string[]) => s.filter((t) => t.includes("count(*)::int AS vencidas")).length;
const deConfiguracion = (s: string[]) => s.filter((t) => t.includes("FROM configuracion WHERE clave = ANY")).length;
/** `tareasDeImpactos`: la única sentencia que agrupa los impactos pendientes por cambio y proceso. */
const deImpactos = (s: string[]) => s.filter((t) => t.includes("count(*)::int AS pendientes, min(i.vence_en) AS vence")).length;
/** `tareasDeRevision`: la única sentencia que recorre los procesos de la revisión anual abierta. */
const deRevision = (s: string[]) => s.filter((t) => t.includes("JOIN revision_anual_procesos rap ON rap.revision_id = ra.id")).length;
/** `tareasDeValidacion`: la única sentencia que busca los hallazgos por validar. */
const deValidacion = (s: string[]) => s.filter((t) => t.includes("h.estado = 'por_validar' AND h.corregido_por IS DISTINCT FROM")).length;
/** `tareasDeIndicadores`: las mediciones a cargo, las observaciones sin respuesta, las fichas por aprobar y las devueltas. */
const deIndicadores = (s: string[]) =>
  s.filter(
    (t) =>
      t.includes("AS mide,") ||
      t.includes("FROM medicion_observaciones o") ||
      t.includes("fv.estado = 'por_aprobar'") ||
      t.includes("fv.nota_devolucion IS NOT NULL"),
  ).length;
/** Las fotos de los hallazgos (`evidenciasDe` y `evidenciasDeVarios`): las tareas no las usan. */
const deEvidencias = (s: string[]) => s.filter((t) => t.includes("FROM archivos WHERE contexto")).length;

describe("el costo del cascarón por render", () => {
  it("la consulta de vigencia corre como mucho una vez por persona y la configuración se lee una vez; sin vigencia, ninguna", () =>
    revertida(sql, async (tx) => {
      const lider = await sesionDe(tx, "lider.cex");
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const e = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017", responsableId: responsable.usuarioId });
      // Quien responde por un punto con un hallazgo abierto: su tarea no necesita las fotos (F-M10).
      const conHallazgo = await usuarioDePrueba(tx, { rol: "consulta" });
      const [punto] = await tx`INSERT INTO puntos_uso (nombre, responsable_id) VALUES (${`zz_punto_cascaron_${Date.now()}`}, ${conHallazgo.usuarioId}) RETURNING id`;
      await tx`INSERT INTO hallazgos (punto_uso_id, origen, descripcion, responsable_id, estado, vence_en)
        VALUES (${punto.id}, 'recogida', 'La copia no estaba', ${conHallazgo.usuarioId}, 'abierto', now() + interval '5 days')`;
      try {
        const casos: [string, SesionFlujo][] = [
          ["Admin SGC", await sesionAdmin(tx)],
          ["líder", lider],
          ["Gerencia", await usuarioDePrueba(tx, { rol: "gerencia" })],
          ["Control Interno", await usuarioDePrueba(tx, { rol: "control_interno" })],
          ["Consulta sin externos", await usuarioDePrueba(tx, { rol: "consulta" })],
          ["Consulta responsable técnico", responsable],
          ["Consulta con hallazgo abierto", conHallazgo],
        ];
        const cuentas: Record<
          string,
          {
            total: number;
            vigencia: number;
            conteo: number;
            configuracion: number;
            impactos: number;
            revision: number;
            validacion: number;
            evidencias: number;
            indicadores: number;
          }
        > = {};
        for (const [nombre, sesion] of casos) {
          const s = await sentenciasDelCascaron(tx, sesion);
          cuentas[nombre] = {
            total: s.length,
            vigencia: deVigencia(s),
            conteo: deConteo(s),
            configuracion: deConfiguracion(s),
            impactos: deImpactos(s),
            revision: deRevision(s),
            validacion: deValidacion(s),
            evidencias: deEvidencias(s),
            indicadores: deIndicadores(s),
          };
        }
        // Para el informe: CONTAR_CASCARON=<archivo> deja las cuentas en ese archivo.
        if (process.env.CONTAR_CASCARON) writeFileSync(process.env.CONTAR_CASCARON, JSON.stringify(cuentas));

        for (const nombre of ["Admin SGC", "líder", "Consulta responsable técnico"]) {
          expect(cuentas[nombre].vigencia, nombre).toBe(1);
          expect(cuentas[nombre].configuracion, nombre).toBe(1);
        }
        expect(cuentas["Consulta sin externos"]).toMatchObject({ vigencia: 0, conteo: 0, configuracion: 0, impactos: 0, revision: 0 });
        // Gerencia y Control Interno no reciben tareas de vigencia: su insignia es un conteo, sin filas ni configuración
        // (F-I3, Ruling 68); los demás leen filas y no cuentan aparte.
        for (const nombre of ["Gerencia", "Control Interno"]) {
          expect(cuentas[nombre], nombre).toMatchObject({ vigencia: 0, conteo: 1, configuracion: 0, impactos: 0, revision: 0 });
        }
        for (const nombre of ["Admin SGC", "líder", "Consulta responsable técnico"]) expect(cuentas[nombre].conteo, nombre).toBe(0);
        // Las tareas de impactos y las de la revisión anual: una sentencia cada una para el Admin SGC y el líder; ninguna
        // para Consulta.
        for (const nombre of ["Admin SGC", "líder"]) expect(cuentas[nombre], nombre).toMatchObject({ impactos: 1, revision: 1 });
        expect(cuentas["Consulta responsable técnico"]).toMatchObject({ impactos: 0, revision: 0 });
        // Las tareas de validar hallazgos: una sentencia para el Admin SGC (que realiza verificaciones), sin otra lectura de
        // la configuración; ninguna para los demás.
        expect(cuentas["Admin SGC"].validacion).toBe(1);
        for (const nombre of ["líder", "Consulta sin externos", "Consulta responsable técnico"]) expect(cuentas[nombre].validacion, nombre).toBe(0);
        // La tarea de corregir un hallazgo no carga sus fotos (F-M10): el hallazgo abierto no suma sentencias de evidencias.
        for (const [nombre, c] of Object.entries(cuentas)) expect(c.evidencias, nombre).toBe(0);
        // Las de los indicadores (Fase 14A): mediciones y observaciones para todos; las fichas por aprobar para quien aprueba
        // (Gerencia y el líder) y las devueltas para quien administra.
        expect(Object.fromEntries(Object.entries(cuentas).map(([nombre, c]) => [nombre, c.indicadores]))).toEqual({
          "Admin SGC": 3,
          líder: 3,
          Gerencia: 3,
          "Control Interno": 2,
          "Consulta sin externos": 2,
          "Consulta responsable técnico": 2,
          "Consulta con hallazgo abierto": 2,
        });
        // El total por render (Tarea 13): una sentencia más que en la Tarea 10 para el Admin SGC (la de validar hallazgos),
        // ninguna para los demás; la de los hallazgos abiertos es la misma con o sin hallazgos (F-M10). Gerencia y Control
        // Interno bajan de 11 a 10 con el conteo (F-I3); el layout y la página comparten las demás lecturas por petición
        // (`tests/cascaron-peticion.test.ts`), lo que este test no ve porque aquí `React.cache` no guarda nada. Con los
        // indicadores (Fase 14A), las de arriba.
        expect(Object.fromEntries(Object.entries(cuentas).map(([nombre, c]) => [nombre, c.total]))).toEqual({
          "Admin SGC": 19,
          líder: 19,
          Gerencia: 13,
          "Control Interno": 12,
          "Consulta sin externos": 11,
          "Consulta responsable técnico": 13,
          "Consulta con hallazgo abierto": 11,
        });
      } finally {
        await e.limpiar();
      }
    }));
});
