/**
 * La invariante central del módulo de mejoramiento (spec 15 §8.2, F15-DC12), como prueba estática sobre el texto de `src/`
 * (revisión final, m6): solo el motor (`src/db/consultas/mejoramiento/flujo.ts`) inserta en `mejora_hallazgos` (`nacerHallazgo`)
 * y solo él cambia su `estado` o su `ronda` (`transicionarHallazgo`). La 15B y la 15C añaden caminos que crean hallazgos (desde
 * las marcas de un indicador y las verificaciones de un punto de uso): sin esta guarda nada fallaría si uno escribiera el
 * estado por su cuenta y se saltara el evento, la bitácora, el plazo y los avisos del paso.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(import.meta.dirname, "..", "src");
const MOTOR = path.join(SRC, "db", "consultas", "mejoramiento", "flujo.ts");

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const ruta = path.join(dir, f);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.(ts|tsx)$/.test(f) ? [ruta] : [];
  });
}

/**
 * La tabla, como se la nombre: sola, entre comillas o con su esquema (`public.mejora_hallazgos`, `"public"."mejora_hallazgos"`), sin
 * confundirla con otra que empiece igual (Fase 15B, anexo §11.3: esta entrega crea hallazgos desde otros módulos).
 */
const TABLA = String.raw`(?:"?public"?\s*\.\s*)?"?mejora_hallazgos"?(?![\w"])`;
const INSERTA = new RegExp(String.raw`\bINSERT\s+INTO\s+${TABLA}`, "i");
/**
 * Cada `UPDATE [ONLY] <tabla> [[AS] alias] SET …`, hasta su `WHERE`, su `FROM`, su `RETURNING` o el fin de la plantilla: la lista de
 * lo que asigna.
 */
const ACTUALIZA = new RegExp(
  String.raw`\bUPDATE\s+(?:ONLY\s+)?${TABLA}(?:\s+(?:AS\s+)?(?!SET\b)\w+)?\s+SET\b([\s\S]*?)(?=\bWHERE\b|\bFROM\b|\bRETURNING\b|` + "`" + "|$)",
  "gi",
);
/** `estado =` o `ronda =` como columna asignada, también entre comillas (no `estado_plan`, `resultado_cierre` ni `aviso_evaluar_en`). */
const ASIGNA_ESTADO_O_RONDA = /(?:^|[\s,])(?:\w+\.)?"?(?:estado|ronda)"?\s*=/i;
/** La forma de lista, `SET (estado, ronda) = (…)`: las columnas entre paréntesis, una por una. */
const LISTA_ASIGNADA = /^\s*\(([^)]*)\)\s*=/;
const ES_ESTADO_O_RONDA = /^\s*(?:\w+\.)?"?(?:estado|ronda)"?\s*$/i;

function asignaEstadoORonda(set: string): boolean {
  if (ASIGNA_ESTADO_O_RONDA.test(set)) return true;
  const lista = LISTA_ASIGNADA.exec(set);
  return lista !== null && lista[1].split(",").some((columna) => ES_ESTADO_O_RONDA.test(columna));
}

/** Lo que el texto de un archivo hace que solo el motor puede hacer. */
function loQueSoloHaceElMotor(texto: string): string[] {
  const halladas: string[] = [];
  if (INSERTA.test(texto)) halladas.push("INSERT INTO mejora_hallazgos");
  for (const m of texto.matchAll(ACTUALIZA)) {
    if (asignaEstadoORonda(m[1])) halladas.push(`UPDATE mejora_hallazgos SET${m[1].replace(/\s+/g, " ").slice(0, 80)}`);
  }
  return halladas;
}

describe("solo el motor crea hallazgos y cambia su estado o su ronda", () => {
  it("la guarda reconoce lo que hace el motor y no confunde las demás escrituras", () => {
    expect(loQueSoloHaceElMotor(readFileSync(MOTOR, "utf8")).length).toBeGreaterThanOrEqual(2);
    expect(loQueSoloHaceElMotor("tx`UPDATE mejora_hallazgos SET vence_en = ${v}, aviso_vencido_en = NULL WHERE estado = 'por_aceptar'`")).toEqual([]);
    expect(loQueSoloHaceElMotor("tx`UPDATE mejora_rondas SET estado_plan = 'aprobado' WHERE id = ${r}`")).toEqual([]);
    expect(loQueSoloHaceElMotor("tx`UPDATE mejora_ajustes SET estado = 'negado' WHERE hallazgo_id = ${h}`")).toEqual([]);
    expect(loQueSoloHaceElMotor("tx`UPDATE mejora_hallazgos SET resultado_cierre = ${r}, cerrado_en = ${a} WHERE id = ${h}`")).toEqual([]);
    expect(loQueSoloHaceElMotor("tx`UPDATE mejora_hallazgos SET titulo = ${t},\n  estado = 'cerrado' WHERE id = ${h}`")).toHaveLength(1);
    expect(loQueSoloHaceElMotor("tx`UPDATE mejora_hallazgos h SET ronda = h.ronda + 1 WHERE h.id = ${h}`")).toHaveLength(1);
    expect(loQueSoloHaceElMotor("tx`INSERT INTO mejora_hallazgos (codigo) VALUES (${c})`")).toHaveLength(1);
    // Fase 15B (anexo §11.3): con alias y AS, entre comillas, con esquema y en la forma de lista.
    expect(loQueSoloHaceElMotor("tx`UPDATE mejora_hallazgos AS h SET estado = 'cerrado' WHERE h.id = ${h}`")).toHaveLength(1);
    expect(loQueSoloHaceElMotor('tx`UPDATE "mejora_hallazgos" SET ronda = 2 WHERE id = ${h}`')).toHaveLength(1);
    expect(loQueSoloHaceElMotor("tx`UPDATE public.mejora_hallazgos SET estado = ${e} WHERE id = ${h}`")).toHaveLength(1);
    expect(loQueSoloHaceElMotor("tx`UPDATE mejora_hallazgos SET (estado, ronda) = (${e}, ${r}) WHERE id = ${h}`")).toHaveLength(1);
    expect(loQueSoloHaceElMotor('tx`INSERT INTO "public"."mejora_hallazgos" (codigo) VALUES (${c})`')).toHaveLength(1);
    // La forma de lista sin el estado ni la ronda, y otra tabla que empieza igual, no son del motor.
    expect(loQueSoloHaceElMotor("tx`UPDATE mejora_hallazgos AS h SET (vence_en, aviso_vencido_en) = (${v}, NULL) WHERE h.id = ${h}`")).toEqual([]);
    expect(loQueSoloHaceElMotor("tx`UPDATE mejora_hallazgos_x SET estado = 'b' WHERE id = ${h}`")).toEqual([]);
  });

  it("ningún archivo de src/ fuera de flujo.ts inserta un hallazgo ni escribe su estado o su ronda", () => {
    const fuera = archivos(SRC)
      .filter((f) => f !== MOTOR)
      .flatMap((f) => loQueSoloHaceElMotor(readFileSync(f, "utf8")).map((q) => `${path.relative(SRC, f)}: ${q}`));
    expect(fuera).toEqual([]);
  });
});
