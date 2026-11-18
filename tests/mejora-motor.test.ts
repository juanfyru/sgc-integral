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

const INSERTA = /\bINSERT\s+INTO\s+mejora_hallazgos\b/i;
/** Cada `UPDATE mejora_hallazgos [alias] SET …`, hasta su `WHERE`, su `FROM` o el fin de la plantilla: la lista de lo que asigna. */
const ACTUALIZA = /\bUPDATE\s+mejora_hallazgos\b(?:\s+(?!SET\b)\w+)?\s+SET\b([\s\S]*?)(?=\bWHERE\b|\bFROM\b|`|$)/gi;
/** `estado =` o `ronda =` como columna asignada (no `estado_plan`, `resultado_cierre` ni `aviso_evaluar_en`). */
const ASIGNA_ESTADO_O_RONDA = /(?:^|[\s,])(?:\w+\.)?(?:estado|ronda)\s*=/i;

/** Lo que el texto de un archivo hace que solo el motor puede hacer. */
function loQueSoloHaceElMotor(texto: string): string[] {
  const halladas: string[] = [];
  if (INSERTA.test(texto)) halladas.push("INSERT INTO mejora_hallazgos");
  for (const m of texto.matchAll(ACTUALIZA)) {
    if (ASIGNA_ESTADO_O_RONDA.test(m[1])) halladas.push(`UPDATE mejora_hallazgos SET${m[1].replace(/\s+/g, " ").slice(0, 80)}`);
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
  });

  it("ningún archivo de src/ fuera de flujo.ts inserta un hallazgo ni escribe su estado o su ronda", () => {
    const fuera = archivos(SRC)
      .filter((f) => f !== MOTOR)
      .flatMap((f) => loQueSoloHaceElMotor(readFileSync(f, "utf8")).map((q) => `${path.relative(SRC, f)}: ${q}`));
    expect(fuera).toEqual([]);
  });
});
