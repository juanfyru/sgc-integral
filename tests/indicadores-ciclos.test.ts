import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const carpeta = path.resolve(import.meta.dirname, "..", "src", "db", "consultas", "indicadores");

/** Pares «importador → importado» que ya eran un ciclo antes de la 14B y se toleran. */
const EXCEPCIONES: Array<[string, string]> = [["mediciones", "alertas"]];

/** Módulos que `alPublicarVersion` y la operación llaman sin cerrar un ciclo: sus tareas amplían la lista. */
const LIVIANOS = ["en-curso", "constancias-soporte", "impactos", "fichas-de-calculo", "componentes", "datos-periodos", "propagacion", "datos-soporte"];
const PROHIBIDOS = ["lectura", "fichas", "aprobacion", "operacion"];

const IMPORTA = /\bfrom\s+["']\.\/([\w-]+)["']/g;

function grafo(): Map<string, string[]> {
  const g = new Map<string, string[]>();
  for (const f of readdirSync(carpeta)) {
    if (!f.endsWith(".ts")) continue;
    const nombre = f.slice(0, -3);
    const texto = readFileSync(path.join(carpeta, f), "utf8");
    const destinos = [...texto.matchAll(IMPORTA)].map((m) => m[1]);
    g.set(nombre, [...new Set(destinos)].filter((d) => !EXCEPCIONES.some(([a, b]) => a === nombre && b === d)));
  }
  return g;
}

function primerCiclo(g: Map<string, string[]>): string[] | null {
  const estado = new Map<string, 1 | 2>();
  const pila: string[] = [];
  const visitar = (n: string): string[] | null => {
    estado.set(n, 1);
    pila.push(n);
    for (const d of g.get(n) ?? []) {
      if (estado.get(d) === 1) return [...pila.slice(pila.indexOf(d)), d];
      if (!estado.has(d)) {
        const c = visitar(d);
        if (c) return c;
      }
    }
    pila.pop();
    estado.set(n, 2);
    return null;
  };
  for (const n of g.keys()) {
    if (!estado.has(n)) {
      const c = visitar(n);
      if (c) return c;
    }
  }
  return null;
}

function alcanzables(g: Map<string, string[]>, desde: string): Set<string> {
  const vistos = new Set<string>();
  const porVer = [...(g.get(desde) ?? [])];
  while (porVer.length) {
    const n = porVer.pop() as string;
    if (vistos.has(n)) continue;
    vistos.add(n);
    porVer.push(...(g.get(n) ?? []));
  }
  return vistos;
}

describe("imports de src/db/consultas/indicadores", () => {
  it("no hay ciclos de imports en src/db/consultas/indicadores", () => {
    const ciclo = primerCiclo(grafo());
    expect(ciclo ? ciclo.join(" → ") : null).toBeNull();
  });

  it("los módulos livianos no importan lectura, fichas, aprobacion ni operacion", () => {
    const g = grafo();
    const malos: string[] = [];
    for (const nombre of LIVIANOS) {
      if (!existsSync(path.join(carpeta, `${nombre}.ts`))) continue;
      const llega = alcanzables(g, nombre);
      for (const p of PROHIBIDOS) if (llega.has(p)) malos.push(`${nombre} llega a ${p}`);
    }
    expect(malos).toEqual([]);
  });
});
