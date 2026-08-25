/**
 * Prueba de carga frugal (Fase 10, F10-D8): N clientes concurrentes con una
 * mezcla realista de rutas descubiertas del propio sitio.
 * Uso: npx tsx scripts/carga.ts http://127.0.0.1:9080 [segundos] [clientes]
 * RAM: medir aparte con `docker stats --no-stream` durante la corrida.
 */

const base = process.argv[2] ?? "http://127.0.0.1:9080";
const duracionS = Number(process.argv[3] ?? 60);
const clientes = Number(process.argv[4] ?? 20);

type Muestra = { ruta: string; ms: number; ok: boolean };
const muestras: Muestra[] = [];

async function descubrirRutas(): Promise<{
  procesos: string[];
  documentos: string[];
}> {
  const html = await (await fetch(base)).text();
  const procesos = [...html.matchAll(/href="(\/procesos\/[a-z0-9-]+)"/g)].map(
    (m) => m[1],
  );
  const documentos: string[] = [];
  for (const p of procesos.slice(0, 5)) {
    const h = await (await fetch(base + p)).text();
    documentos.push(
      ...[...h.matchAll(/href="(\/documentos\/[a-z0-9-]+)"/g)].map((m) => m[1]),
    );
    if (documentos.length >= 10) break;
  }
  if (!procesos.length || !documentos.length) {
    throw new Error("No se descubrieron rutas: ¿la BD está sembrada?");
  }
  return { procesos: [...new Set(procesos)], documentos: [...new Set(documentos)] };
}

function elegir<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// TODA la carga sale de UNA IP (el host), así que los rate limits por IP de
// la app (60 archivos/min, 30 búsquedas/min) aplican al total, no por
// cliente. Presupuestos globales por minuto, por debajo del límite: se mide
// la app, no el 429 — y las descargas estampadas se ejercitan al ritmo
// máximo que el limitador permite.
const presupuestos = {
  archivo: { limite: 50, marcas: [] as number[] },
  busqueda: { limite: 25, marcas: [] as number[] },
};

function hayPresupuesto(tipo: keyof typeof presupuestos): boolean {
  const p = presupuestos[tipo];
  const ahora = Date.now();
  p.marcas = p.marcas.filter((t) => ahora - t < 60_000);
  if (p.marcas.length >= p.limite) return false;
  p.marcas.push(ahora);
  return true;
}

function tipoDeRuta(ruta: string): string {
  if (ruta === "/") return "mapa";
  if (ruta.startsWith("/procesos/")) return "proceso";
  if (ruta.startsWith("/documentos/")) return "ficha";
  return "busqueda";
}

async function cliente(
  rutas: { procesos: string[]; documentos: string[] },
  finMs: number,
) {
  while (Date.now() < finMs) {
    // Mezcla F10-D8: 35% mapa, 30% proceso, 20% ficha (+PDF estampado si hay
    // presupuesto), 10% búsqueda (si hay presupuesto), 5% pausa "humana".
    const dado = Math.random();
    let ruta: string | null;
    if (dado < 0.35) ruta = "/";
    else if (dado < 0.65) ruta = elegir(rutas.procesos);
    else if (dado < 0.85) ruta = elegir(rutas.documentos);
    else if (dado < 0.95 && hayPresupuesto("busqueda"))
      ruta = `/buscar?q=${elegir(["acta", "manual", "vacuna", "calidad"])}`;
    else ruta = null;
    if (!ruta) {
      await new Promise((r) => setTimeout(r, 500)); // pausa "humana"
      continue;
    }
    const inicio = Date.now();
    try {
      const res = await fetch(base + ruta, { signal: AbortSignal.timeout(15000) });
      muestras.push({ ruta: tipoDeRuta(ruta), ms: Date.now() - inicio, ok: res.ok });
      if (ruta.startsWith("/documentos/")) {
        // El visor de la ficha carga el PDF inline (estampado): simularlo,
        // respetando el presupuesto de archivos por minuto.
        const html = await res.text();
        const pdf = html.match(/(\/documentos\/[a-z0-9-]+\/archivos\/\d+[^"]*)"/);
        if (pdf && hayPresupuesto("archivo")) {
          const i2 = Date.now();
          const r2 = await fetch(base + pdf[1], {
            signal: AbortSignal.timeout(15000),
          });
          await r2.arrayBuffer();
          muestras.push({ ruta: "pdf-estampado", ms: Date.now() - i2, ok: r2.ok });
        }
      } else {
        await res.text();
      }
    } catch {
      muestras.push({ ruta: tipoDeRuta(ruta), ms: Date.now() - inicio, ok: false });
    }
  }
}

function percentil(valores: number[], p: number): number {
  const orden = [...valores].sort((a, b) => a - b);
  return orden[Math.min(orden.length - 1, Math.floor((p / 100) * orden.length))];
}

(async () => {
  console.log(`Carga: ${clientes} clientes × ${duracionS}s contra ${base}`);
  const rutas = await descubrirRutas();
  console.log(
    `Rutas: ${rutas.procesos.length} procesos, ${rutas.documentos.length} fichas`,
  );
  const finMs = Date.now() + duracionS * 1000;
  await Promise.all(Array.from({ length: clientes }, () => cliente(rutas, finMs)));

  const porRuta = Map.groupBy(muestras, (m) => m.ruta);
  console.log("\nruta            peticiones  errores    p50     p95");
  for (const [ruta, filas] of porRuta) {
    const tiempos = filas.map((f) => f.ms);
    const errores = filas.filter((f) => !f.ok).length;
    console.log(
      `${ruta.padEnd(15)} ${String(filas.length).padStart(10)} ${String(errores).padStart(8)}` +
        ` ${String(percentil(tiempos, 50)).padStart(5)}ms ${String(percentil(tiempos, 95)).padStart(6)}ms`,
    );
  }
  const total = muestras.length;
  const errores = muestras.filter((m) => !m.ok).length;
  console.log(
    `\nTotal: ${total} peticiones, ${errores} errores (${((errores / total) * 100).toFixed(1)}%)`,
  );
  if (errores / total > 0.01) process.exitCode = 1;
})();
