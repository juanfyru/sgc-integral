/**
 * El ciclo de imports que rompió el simulado de `supervisoresDe` (Tarea 19, ronda 1, punto 4): `estructura.ts` importa
 * `admin.ts`, y si lo que `admin.ts` importa de mejoramiento llegara, por cualquier camino, a `estructura.ts` o a
 * `avisos-vencimiento.ts` (que importa `estructura.ts`), al cargar `estructura.ts` el ciclo ataría a `avisos-vencimiento.ts` el
 * `supervisoresDe` real antes que el simulado de un test (`tests/vencimientos.test.ts`). Prueba estática sobre el texto de los
 * imports de `src/`, como `tests/indicadores-ciclos.test.ts`: solo los que existen al ejecutar (no `import type`).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(import.meta.dirname, "..", "src");
const ADMIN = path.join(SRC, "db", "consultas", "admin.ts");
const PROHIBIDOS = [path.join(SRC, "db", "consultas", "estructura.ts"), path.join(SRC, "db", "consultas", "avisos-vencimiento.ts")];

const DESDE = /^\s*(?:import|export)\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/gm;

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const ruta = path.join(dir, f);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.(ts|tsx)$/.test(f) ? [ruta] : [];
  });
}

/** El archivo de un especificador, o nulo si es de un paquete. */
function resolver(desde: string, especificador: string): string | null {
  const base = especificador.startsWith("@/")
    ? path.join(SRC, especificador.slice(2))
    : especificador.startsWith(".")
      ? path.resolve(path.dirname(desde), especificador)
      : null;
  if (!base) return null;
  for (const c of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) if (existsSync(c)) return c;
  return null;
}

/** Un import que existe al ejecutar: ni `import type` ni uno con solo `type` entre llaves. */
function enEjecucion(clausula: string): boolean {
  if (/^type\s/.test(clausula)) return false;
  const llaves = /^\{([\s\S]*)\}$/.exec(clausula.trim());
  if (!llaves) return true;
  return llaves[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .some((s) => !s.startsWith("type "));
}

function grafo(): Map<string, string[]> {
  const g = new Map<string, string[]>();
  for (const f of archivos(SRC)) {
    const texto = readFileSync(f, "utf8");
    const destinos = [...texto.matchAll(DESDE)].flatMap((m) => (enEjecucion(m[1]) ? [resolver(f, m[2])] : [])).filter((d): d is string => d !== null);
    g.set(f, [...new Set(destinos)]);
  }
  return g;
}

/** Un camino de `desde` a alguno de `metas` que no pase por `evitar`, o nulo. */
function camino(g: Map<string, string[]>, desde: string, metas: string[], evitar: string): string[] | null {
  const previo = new Map<string, string>();
  const cola = [desde];
  const vistos = new Set([desde, evitar]);
  while (cola.length) {
    const n = cola.shift() as string;
    if (metas.includes(n)) {
      const ruta = [n];
      while (previo.has(ruta[0])) ruta.unshift(previo.get(ruta[0]) as string);
      return ruta.map((r) => path.relative(SRC, r).replaceAll("\\", "/"));
    }
    for (const d of g.get(n) ?? []) {
      if (vistos.has(d)) continue;
      vistos.add(d);
      previo.set(d, n);
      cola.push(d);
    }
  }
  return null;
}

describe("lo que admin.ts importa de mejoramiento", () => {
  it("no llega, por ningún camino, a estructura.ts ni a avisos-vencimiento.ts", () => {
    const g = grafo();
    const deMejoramiento = (g.get(ADMIN) ?? []).filter((d) => d.includes(`${path.sep}mejoramiento${path.sep}`));
    expect(deMejoramiento.length).toBeGreaterThan(0);
    const malos = deMejoramiento.flatMap((d) => {
      const ruta = camino(g, d, PROHIBIDOS, ADMIN);
      return ruta ? [ruta.join(" → ")] : [];
    });
    expect(malos).toEqual([]);
  });

  it("admin.ts entero tampoco llega a ellos: estructura.ts no cierra un ciclo por admin.ts", () => {
    const g = grafo();
    const ruta = camino(g, ADMIN, PROHIBIDOS, "");
    expect(ruta ? ruta.join(" → ") : null).toBeNull();
  });
});

describe("el enlace de una actividad con un trámite (Fase 15B, anexo §9) es liviano", () => {
  const ENLACE = path.join(SRC, "db", "consultas", "mejoramiento", "tramites-enlace.ts");
  const FLUJO_DEL_TRAMITE = path.join(SRC, "db", "consultas", "tramites-flujo.ts");

  it("no importa flujo.ts, lectura.ts, actividades.ts, admin.ts ni tramites-flujo.ts", () => {
    const directos = (grafo().get(ENLACE) ?? []).map((d) => path.relative(SRC, d).replaceAll("\\", "/"));
    expect(directos.length).toBeGreaterThan(0);
    for (const prohibido of [
      "db/consultas/mejoramiento/flujo.ts",
      "db/consultas/mejoramiento/lectura.ts",
      "db/consultas/mejoramiento/actividades.ts",
      "db/consultas/admin.ts",
      "db/consultas/tramites-flujo.ts",
    ]) {
      expect(directos).not.toContain(prohibido);
    }
  });

  it("no llega, por ningún camino, a tramites-flujo.ts: crearSolicitud lo importa y cerraría un ciclo", () => {
    const g = grafo();
    expect(g.get(FLUJO_DEL_TRAMITE) ?? []).toContain(ENLACE);
    const ruta = camino(g, ENLACE, [FLUJO_DEL_TRAMITE], "");
    expect(ruta ? ruta.join(" → ") : null).toBeNull();
  });
});

describe("los hallazgos en las otras páginas (Fase 15B, anexo §10.1) son livianos", () => {
  const CITAS = path.join(SRC, "db", "consultas", "mejoramiento", "citas.ts");
  const ENLAZABLES = path.join(SRC, "db", "consultas", "mejoramiento", "enlazables.ts");
  const LECTURA = path.join(SRC, "db", "consultas", "mejoramiento", "lectura.ts");

  it("citas.ts y enlazables.ts no llegan, por ningún camino, a lectura.ts (que importa citas.ts para sus filtros)", () => {
    const g = grafo();
    expect(g.get(LECTURA) ?? []).toContain(CITAS);
    for (const liviano of [CITAS, ENLAZABLES]) {
      const ruta = camino(g, liviano, [LECTURA], "");
      expect(ruta ? ruta.join(" → ") : null).toBeNull();
    }
  });

  it("las consultas de Indicadores no importan nada de Mejoramiento: lo llaman las páginas (anexo §10.5)", () => {
    const g = grafo();
    const INDICADORES = path.join(SRC, "db", "consultas", "indicadores") + path.sep;
    const malos = [...g].flatMap(([desde, destinos]) =>
      desde.startsWith(INDICADORES)
        ? destinos.filter((d) => d.includes(`${path.sep}mejoramiento${path.sep}`)).map((d) => `${path.relative(SRC, desde)} → ${path.relative(SRC, d)}`)
        : [],
    );
    expect(malos).toEqual([]);
  });
});
