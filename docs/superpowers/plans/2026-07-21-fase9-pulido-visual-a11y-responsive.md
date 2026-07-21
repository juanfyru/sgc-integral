# Fase 9 — Pulido visual, animaciones, accesibilidad y responsive · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar el portal con sensación premium (Linear/Vercel/Stripe) y accesibilidad que cumpla los criterios duros del plan (Lighthouse a11y ≥ 95, teclado, contraste AA, `prefers-reduced-motion`, celular real), sin tocar lógica de negocio ni el esquema.

**Architecture:** Todo el movimiento y la elevación se centralizan como tokens CSS y utilidades en `globals.css` (CSS puro, sin Motion). Los skeletons se implementan con `loading.tsx` por ruta aprovechando el streaming del App Router. La accesibilidad se refuerza con un `:focus-visible` global de baja especificidad, un enlace "saltar al contenido" en el layout raíz, y regiones desplazables accesibles en las tablas del panel. El contraste se valida con una función pura testeada.

**Tech Stack:** Next.js 16 (App Router, Server Components), React 19, Tailwind CSS v4 (`@theme`), CSS puro para animación, Vitest 4 (funciones puras + lectura de archivos, sin DOM), Playwright MCP para verificación visual/teclado/móvil.

## Global Constraints

- **NAS offline, ARM64, 4 GB RAM:** cero dependencias externas en runtime; nada de CDNs/fuentes/íconos remotos. No introducir Motion/Framer (F9-D2). No añadir renderizador de DOM a los tests.
- **Identidad ya aprobada — no cambiarla:** azul `#1b4e8e`, azul-profundo `#123a6d`, azul-tinta/foreground `#16233a`, verde `#2e9b47`, verde-texto `#1e7a35`, lienzo `#f6f8fb`; tipografía Archivo (display) + Geist (UI). Solo se afinan derivados y se corrige contraste donde falle.
- **Sin modo oscuro (F9-D1):** no cablear toggle ni afinar `.dark`; se deja el andamiaje shadcn como está.
- **Cobertura premium (F9-D3):** público + `/admin/maestro`, `/admin/estadisticas`, `/admin/bitacora`. Los CRUD internos (documentos, mapa, tipos) solo reciben a11y/teclado/responsive, sin pulido fino.
- **`prefers-reduced-motion`:** el bloque global en `globals.css` ya neutraliza animación/transición; toda animación nueva debe quedar cubierta por él (usar `animation`/`transition`, nada de JS de movimiento).
- **Cero regresión:** los 161 tests actuales siguen verdes. Los 5 rojos preexistentes del seed (`PR-GTH-990/991`) son conocidos; **no borrar `PR-GTH-991`**.
- **Convenciones:** dominio/UI en español; TypeScript estricto sin `any`; Server Components por defecto, `'use client'` solo con interactividad.
- **Verificación real antes de cerrar:** `npm run lint` (ESLint + `tsc --noEmit`) y `npm run build` limpios; `npm test` sin regresión.

---

## Estructura de archivos

**Nuevos:**
- `src/componentes/Skeleton.tsx` — primitiva de esqueleto (server component, `<div>` con clase `skeleton`).
- `src/app/loading.tsx` — skeleton del mapa (inicio).
- `src/app/procesos/[slug]/loading.tsx` — skeleton de proceso.
- `src/app/procesos/[slug]/[sub]/loading.tsx` — skeleton de subproceso.
- `src/app/documentos/[codigo]/loading.tsx` — skeleton de ficha.
- `src/app/buscar/loading.tsx` — skeleton de búsqueda.
- `src/app/admin/(panel)/maestro/loading.tsx` — skeleton del Listado Maestro.
- `src/app/admin/(panel)/estadisticas/loading.tsx` — skeleton del dashboard.
- `src/app/admin/(panel)/bitacora/loading.tsx` — skeleton de la bitácora.
- `src/lib/contraste.ts` — función pura `contrasteWCAG` (razón de contraste WCAG 2.1).
- `tests/a11y-estructura.test.ts` — asserts de skip-link y existencia de `loading.tsx`.
- `tests/contraste.test.ts` — asserts de la función y de los pares de tokens institucionales ≥ AA.

**Modificados:**
- `src/app/globals.css` — tokens de elevación/transición, `:focus-visible` global, keyframes de skeleton y entrada, utilidad `.entrada`, estilo `.saltar-al-contenido`, ajuste de tokens que fallen contraste.
- `src/app/layout.tsx` — enlace "saltar al contenido" + envoltura `#contenido`.
- `src/componentes/EncabezadoSitio.tsx` — foco del campo de búsqueda a `focus-visible` consistente.
- `src/componentes/busqueda/TarjetaResultado.tsx` — elevación por token + entrada escalonada.
- `src/app/buscar/page.tsx` — pasar `indice` a `TarjetaResultado`.
- `src/app/admin/(panel)/estadisticas/page.tsx` — elevación + entrada en las tarjetas KPI.
- `src/app/admin/(panel)/maestro/page.tsx` — región desplazable accesible + objetivos táctiles.
- `src/app/admin/(panel)/bitacora/page.tsx` — región desplazable accesible + objetivos táctiles en filtros/paginación.
- `CONTEXT.md` — cierre de la Fase 9 (en la tarea final).

---

## Task 1: Fundamentos CSS + foco global + skip-link

**Files:**
- Modify: `src/app/globals.css` (añadir tras el bloque `:root` existente y en `@layer base`)
- Modify: `src/app/layout.tsx:45-49`
- Test: `tests/a11y-estructura.test.ts` (Create)

**Interfaces:**
- Produces: clases CSS globales `.entrada` (usa `--indice`), `.skeleton`, `.saltar-al-contenido`; tokens `--dur-rapida`, `--dur-media`, `--ease-salida`, `--sombra-1/2/3`; ancla destino `#contenido` en el layout raíz. Las tareas 2, 3 y 5 las consumen.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/a11y-estructura.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const raiz = path.resolve(import.meta.dirname, "..");

describe("estructura de accesibilidad (Fase 9)", () => {
  it("el layout raíz ofrece 'saltar al contenido' y el ancla destino", () => {
    const layout = readFileSync(path.join(raiz, "src/app/layout.tsx"), "utf8");
    expect(layout).toContain('href="#contenido"');
    expect(layout).toContain('id="contenido"');
    expect(layout).toContain("Saltar al contenido");
  });
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `npm test -- a11y-estructura`
Expected: FAIL — el layout aún no contiene `#contenido` ni el enlace.

- [ ] **Step 3: Añadir tokens, foco global, keyframes y utilidades a `globals.css`**

Añadir al final de `src/app/globals.css` (después de la regla `.marca-estado[data-marca="ANULADO"]`):

```css
/* ── Fase 9: tokens de movimiento y elevación ───────────────────────── */
:root {
  --dur-rapida: 120ms;
  --dur-media: 220ms;
  --ease-salida: cubic-bezier(0.22, 1, 0.36, 1);
  /* Sombras suaves derivadas de la tinta institucional (nada dramático). */
  --sombra-1: 0 1px 2px 0 color-mix(in srgb, var(--foreground) 8%, transparent);
  --sombra-2: 0 2px 10px -3px color-mix(in srgb, var(--foreground) 12%, transparent);
  --sombra-3: 0 10px 30px -8px color-mix(in srgb, var(--foreground) 18%, transparent);
}

/* Anillo de foco global, especificidad 0 (:where) para que cualquier
   componente lo pueda sobreescribir. Reemplaza los usos ad-hoc dispersos. */
@layer base {
  :where(a, button, input, select, textarea, summary, [tabindex]):focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }
}

/* Entrada escalonada reutilizable (generaliza .banda-animada). */
@keyframes aparecer {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.entrada {
  animation: aparecer var(--dur-media) var(--ease-salida) both;
  animation-delay: calc(var(--indice, 0) * 45ms);
}

/* Esqueletos de carga (no spinners). El brillo lo neutraliza el bloque
   global prefers-reduced-motion; queda un rectángulo mate. */
@keyframes brillo-skeleton {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}
.skeleton {
  background: linear-gradient(
    90deg,
    var(--muted) 25%,
    color-mix(in srgb, var(--muted) 55%, white) 50%,
    var(--muted) 75%
  );
  background-size: 200% 100%;
  animation: brillo-skeleton 1.4s ease-in-out infinite;
  border-radius: var(--radius-sm);
}

/* Enlace de salto: oculto hasta recibir foco por teclado. */
.saltar-al-contenido {
  position: fixed;
  left: 0.75rem;
  top: 0.75rem;
  z-index: 100;
  transform: translateY(-160%);
  transition: transform var(--dur-rapida) var(--ease-salida);
  border-radius: var(--radius-md);
  background: var(--primary);
  color: var(--primary-foreground);
  padding: 0.5rem 0.875rem;
  font-size: 0.875rem;
  font-weight: 600;
  box-shadow: var(--sombra-2);
}
.saltar-al-contenido:focus {
  transform: translateY(0);
}
```

- [ ] **Step 4: Añadir el skip-link y el ancla `#contenido` al layout raíz**

En `src/app/layout.tsx`, reemplazar el `<body>` (líneas 45-49):

```tsx
      <body className="min-h-full flex flex-col">
        <a href="#contenido" className="saltar-al-contenido">
          Saltar al contenido
        </a>
        <EncabezadoSitio />
        <div id="contenido" tabIndex={-1} className="flex flex-1 flex-col outline-none">
          {children}
        </div>
      </body>
```

- [ ] **Step 5: Correr el test y verlo pasar**

Run: `npm test -- a11y-estructura`
Expected: PASS.

- [ ] **Step 6: Verificar lint y build**

Run: `npm run lint && npm run build`
Expected: ambos limpios (sin errores de tipos ni de compilación).

- [ ] **Step 7: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx tests/a11y-estructura.test.ts
git commit -m "feat: tokens de elevacion/movimiento, foco global y salto al contenido

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Skeletons por ruta (no spinners)

**Files:**
- Create: `src/componentes/Skeleton.tsx`
- Create: `src/app/loading.tsx`, `src/app/procesos/[slug]/loading.tsx`, `src/app/procesos/[slug]/[sub]/loading.tsx`, `src/app/documentos/[codigo]/loading.tsx`, `src/app/buscar/loading.tsx`, `src/app/admin/(panel)/maestro/loading.tsx`, `src/app/admin/(panel)/estadisticas/loading.tsx`, `src/app/admin/(panel)/bitacora/loading.tsx`
- Modify: `tests/a11y-estructura.test.ts`

**Interfaces:**
- Consumes: clase `.skeleton` (Task 1).
- Produces: componente `Skeleton` con firma `Skeleton(props: { className?: string })`.

- [ ] **Step 1: Extender el test para exigir los `loading.tsx`**

Añadir dentro del `describe` de `tests/a11y-estructura.test.ts`:

```ts
  const rutasConSkeleton = [
    "src/app/loading.tsx",
    "src/app/procesos/[slug]/loading.tsx",
    "src/app/procesos/[slug]/[sub]/loading.tsx",
    "src/app/documentos/[codigo]/loading.tsx",
    "src/app/buscar/loading.tsx",
    "src/app/admin/(panel)/maestro/loading.tsx",
    "src/app/admin/(panel)/estadisticas/loading.tsx",
    "src/app/admin/(panel)/bitacora/loading.tsx",
  ];

  it.each(rutasConSkeleton)("existe el skeleton de carga %s", (ruta) => {
    expect(existsSync(path.join(raiz, ruta))).toBe(true);
  });
```

Y ampliar el import superior del archivo a:

```ts
import { existsSync, readFileSync } from "node:fs";
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `npm test -- a11y-estructura`
Expected: FAIL — los archivos `loading.tsx` no existen aún.

- [ ] **Step 3: Crear la primitiva `Skeleton`**

Crear `src/componentes/Skeleton.tsx`:

```tsx
/** Bloque de carga (no spinner). El brillo se apaga con prefers-reduced-motion. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}
```

- [ ] **Step 4: Crear los ocho `loading.tsx`**

`src/app/loading.tsx` (mapa):

```tsx
import { Skeleton } from "@/componentes/Skeleton";

export default function Cargando() {
  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:py-8">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-2 h-9 w-72" />
      <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      <div className="mt-8 space-y-4">
        {[0, 1, 2, 3].map((banda) => (
          <div key={banda} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

`src/app/procesos/[slug]/loading.tsx`:

```tsx
import { Skeleton } from "@/componentes/Skeleton";

export default function Cargando() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-10">
      <Skeleton className="h-4 w-52" />
      <Skeleton className="mt-3 h-8 w-64" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
```

`src/app/procesos/[slug]/[sub]/loading.tsx`:

```tsx
import { Skeleton } from "@/componentes/Skeleton";

export default function Cargando() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-10">
      <Skeleton className="h-4 w-64" />
      <Skeleton className="mt-3 h-8 w-72" />
      <div className="mt-8 space-y-2.5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
```

`src/app/documentos/[codigo]/loading.tsx`:

```tsx
import { Skeleton } from "@/componentes/Skeleton";

export default function Cargando() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-10">
      <Skeleton className="h-4 w-64" />
      <Skeleton className="mt-3 h-9 w-80 max-w-full" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_2fr]">
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  );
}
```

`src/app/buscar/loading.tsx`:

```tsx
import { Skeleton } from "@/componentes/Skeleton";

export default function Cargando() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-10">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-4 h-11 w-full rounded-xl" />
      <div className="mt-6 space-y-2.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
```

`src/app/admin/(panel)/maestro/loading.tsx`:

```tsx
import { Skeleton } from "@/componentes/Skeleton";

export default function Cargando() {
  return (
    <main>
      <Skeleton className="h-4 w-64" />
      <Skeleton className="mt-2 h-7 w-80 max-w-full" />
      <Skeleton className="mt-6 h-64 w-full rounded-lg" />
    </main>
  );
}
```

`src/app/admin/(panel)/estadisticas/loading.tsx`:

```tsx
import { Skeleton } from "@/componentes/Skeleton";

export default function Cargando() {
  return (
    <main className="space-y-8">
      <Skeleton className="h-7 w-48" />
      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
    </main>
  );
}
```

`src/app/admin/(panel)/bitacora/loading.tsx`:

```tsx
import { Skeleton } from "@/componentes/Skeleton";

export default function Cargando() {
  return (
    <main>
      <Skeleton className="h-7 w-40" />
      <Skeleton className="mt-4 h-10 w-full rounded-lg" />
      <Skeleton className="mt-4 h-64 w-full rounded-lg" />
    </main>
  );
}
```

- [ ] **Step 5: Correr el test y verlo pasar**

Run: `npm test -- a11y-estructura`
Expected: PASS (skip-link + los 8 skeletons).

- [ ] **Step 6: Verificar lint y build**

Run: `npm run lint && npm run build`
Expected: limpios.

- [ ] **Step 7: Commit**

```bash
git add src/componentes/Skeleton.tsx src/app/loading.tsx "src/app/procesos" "src/app/documentos" src/app/buscar/loading.tsx "src/app/admin" tests/a11y-estructura.test.ts
git commit -m "feat: skeletons de carga por ruta en las superficies premium

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Microinteracciones y entradas escalonadas (superficies premium)

**Files:**
- Modify: `src/componentes/busqueda/TarjetaResultado.tsx:10-23`
- Modify: `src/app/buscar/page.tsx:342-347`
- Modify: `src/app/admin/(panel)/estadisticas/page.tsx:41-50`

**Interfaces:**
- Consumes: clase `.entrada` + `--indice`, tokens `--sombra-*` (Task 1).
- Produces: `TarjetaResultado` acepta prop opcional `indice?: number`.

- [ ] **Step 1: Añadir entrada escalonada + elevación por token a `TarjetaResultado`**

En `src/componentes/busqueda/TarjetaResultado.tsx`, cambiar la firma y el `<Link>`:

```tsx
export function TarjetaResultado({
  resultado,
  indice = 0,
}: {
  resultado: ResultadoBusqueda;
  indice?: number;
}) {
  const color = resultado.propietario?.color ?? "var(--color-azul)";

  return (
    <li className="entrada list-none" style={{ "--indice": indice } as React.CSSProperties}>
      <Link
        href={`/documentos/${resultado.codigo.toLowerCase()}`}
        style={{ "--color-banda": color } as React.CSSProperties}
        className="group flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4 shadow-[var(--sombra-1)] transition-all duration-200 hover:-translate-y-px hover:border-[var(--color-banda)] hover:shadow-[var(--sombra-2)] focus-visible:border-[var(--color-banda)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-banda)]"
      >
```

(El resto del componente queda igual.)

- [ ] **Step 2: Pasar el índice desde la lista de resultados**

En `src/app/buscar/page.tsx`, en el `.map` de resultados (líneas ~343-345):

```tsx
                {respuesta.resultados.map((resultado, indice) => (
                  <TarjetaResultado key={resultado.id} resultado={resultado} indice={indice} />
                ))}
```

- [ ] **Step 3: Elevación + entrada en las tarjetas KPI del dashboard**

En `src/app/admin/(panel)/estadisticas/page.tsx`, reemplazar el bloque de las dos tarjetas KPI (líneas 41-50):

```tsx
      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <div className="entrada rounded-lg border bg-card p-4 shadow-[var(--sombra-1)]" style={{ "--indice": 0 } as React.CSSProperties}>
          <p className="text-sm text-muted-foreground">Vistas</p>
          <p className="font-display text-3xl font-semibold">{e.totalVistas}</p>
        </div>
        <div className="entrada rounded-lg border bg-card p-4 shadow-[var(--sombra-1)]" style={{ "--indice": 1 } as React.CSSProperties}>
          <p className="text-sm text-muted-foreground">Descargas</p>
          <p className="font-display text-3xl font-semibold">{e.totalDescargas}</p>
        </div>
      </div>
```

- [ ] **Step 4: Verificar lint y build**

Run: `npm run lint && npm run build`
Expected: limpios. (Cambios visuales/CSS: la verificación de comportamiento es en la Task 7 con Playwright.)

- [ ] **Step 5: Commit**

```bash
git add src/componentes/busqueda/TarjetaResultado.tsx src/app/buscar/page.tsx "src/app/admin"
git commit -m "feat: entradas escalonadas y elevacion por token en superficies premium

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Contraste AA validado por función pura

**Files:**
- Create: `src/lib/contraste.ts`
- Create: `tests/contraste.test.ts`
- Modify: `src/app/globals.css` (solo si algún par falla; ver Step 4)

**Interfaces:**
- Produces: `contrasteWCAG(hex1: string, hex2: string): number` (razón 1–21) y `luminanciaRelativa(hex: string): number`.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/contraste.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { contrasteWCAG } from "@/lib/contraste";

describe("contrasteWCAG", () => {
  it("negro sobre blanco da la razón máxima (21:1)", () => {
    expect(contrasteWCAG("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("es simétrico y blanco sobre blanco es 1:1", () => {
    expect(contrasteWCAG("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrasteWCAG("#1b4e8e", "#f6f8fb")).toBeCloseTo(
      contrasteWCAG("#f6f8fb", "#1b4e8e"),
      5,
    );
  });

  // Pares reales de la UI. Texto normal exige ≥ 4.5:1 (WCAG AA).
  const LIENZO = "#f6f8fb";
  const CARD = "#ffffff";
  const paresTextoNormal: Array<[string, string, string]> = [
    ["foreground / lienzo", "#16233a", LIENZO],
    ["muted-foreground / lienzo", "#55677f", LIENZO],
    ["muted-foreground / card", "#55677f", CARD],
    ["muted-foreground / muted", "#55677f", "#eef2f7"],
    ["verde-texto / lienzo", "#1e7a35", LIENZO],
    ["blanco / azul", "#ffffff", "#1b4e8e"],
    ["primary-foreground / azul", "#fbfbfb", "#1b4e8e"],
  ];

  it.each(paresTextoNormal)("%s cumple AA (≥ 4.5:1)", (_n, a, b) => {
    expect(contrasteWCAG(a, b)).toBeGreaterThanOrEqual(4.5);
  });
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `npm test -- contraste`
Expected: FAIL — `contrasteWCAG` no existe.

- [ ] **Step 3: Implementar la función pura**

Crear `src/lib/contraste.ts`:

```ts
/**
 * Razón de contraste WCAG 2.1 entre dos colores hex (`#rgb` o `#rrggbb`).
 * Devuelve un número en [1, 21]. Sirve para verificar AA (≥ 4.5 texto normal,
 * ≥ 3 texto grande/componentes) sobre los tokens institucionales.
 */
function canalLineal(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminanciaRelativa(hex: string): number {
  const limpio = hex.replace("#", "");
  const completo =
    limpio.length === 3
      ? limpio.split("").map((c) => c + c).join("")
      : limpio;
  const r = parseInt(completo.slice(0, 2), 16);
  const g = parseInt(completo.slice(2, 4), 16);
  const b = parseInt(completo.slice(4, 6), 16);
  return 0.2126 * canalLineal(r) + 0.7152 * canalLineal(g) + 0.0722 * canalLineal(b);
}

export function contrasteWCAG(hex1: string, hex2: string): number {
  const l1 = luminanciaRelativa(hex1);
  const l2 = luminanciaRelativa(hex2);
  const claro = Math.max(l1, l2);
  const oscuro = Math.min(l1, l2);
  return (claro + 0.05) / (oscuro + 0.05);
}
```

- [ ] **Step 4: Correr el test; ajustar el token que falle**

Run: `npm test -- contraste`

- Si TODOS los pares pasan: el test queda como guardia de regresión, no se toca `globals.css`.
- Si `verde-texto / lienzo` (`#1e7a35` sobre `#f6f8fb`) queda por debajo de 4.5 (es el candidato más probable, ~4.4:1): oscurecer el token en `src/app/globals.css`, línea `--color-verde-texto: #1e7a35;` → `--color-verde-texto: #1a6e30;`, y actualizar el valor esperado en el arreglo del test a `#1a6e30`. Volver a correr hasta verde.

Expected: PASS con todos los pares ≥ 4.5.

- [ ] **Step 5: Verificar lint y build**

Run: `npm run lint && npm run build`
Expected: limpios.

- [ ] **Step 6: Commit**

```bash
git add src/lib/contraste.ts tests/contraste.test.ts src/app/globals.css
git commit -m "test: validar contraste AA de los tokens institucionales

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Teclado, regiones desplazables accesibles y objetivos táctiles

**Files:**
- Modify: `src/componentes/EncabezadoSitio.tsx:49-56`
- Modify: `src/app/admin/(panel)/maestro/page.tsx:55` y `:31-52`
- Modify: `src/app/admin/(panel)/bitacora/page.tsx:63-66`, `:69`, `:95-98`
- Modify: `tests/a11y-estructura.test.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: las tablas de Maestro y Bitácora quedan como `role="region"` desplazable, enfocable por teclado (`tabIndex={0}`) y con `aria-label`.

- [ ] **Step 1: Extender el test — las tablas del panel son regiones desplazables accesibles**

Añadir al `describe` de `tests/a11y-estructura.test.ts`:

```ts
  it.each([
    "src/app/admin/(panel)/maestro/page.tsx",
    "src/app/admin/(panel)/bitacora/page.tsx",
  ])("la tabla desplazable de %s es enfocable por teclado con etiqueta", (ruta) => {
    const src = readFileSync(path.join(raiz, ruta), "utf8");
    expect(src).toMatch(/overflow-x-auto/);
    expect(src).toContain('role="region"');
    expect(src).toContain("tabIndex={0}");
    expect(src).toMatch(/aria-label=/);
  });
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `npm test -- a11y-estructura`
Expected: FAIL — las tablas aún no son `role="region"` enfocables.

- [ ] **Step 3: Maestro — región desplazable accesible + objetivos táctiles**

En `src/app/admin/(panel)/maestro/page.tsx`, cambiar el `<div className="overflow-x-auto ...">` (línea 55) por:

```tsx
      <div
        role="region"
        aria-label="Tabla del Listado Maestro (desplazable horizontalmente)"
        tabIndex={0}
        className="overflow-x-auto rounded-lg border outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul print:border-0"
      >
```

En el mismo archivo, subir los objetivos táctiles de los controles de filtro/acción (líneas 33-52): en los dos `<Link>` "Solo vigentes"/"Todos" cambiar `px-3 py-1` por `px-3 py-2`, y en el `<a>` "Descargar Excel" ya usa `py-2` (dejar). El `BotonImprimir` se revisa en Task 7 (no bloquea aquí).

- [ ] **Step 4: Bitácora — región desplazable accesible + objetivos táctiles en filtros y paginación**

En `src/app/admin/(panel)/bitacora/page.tsx`:

Cambiar el `<div className="overflow-x-auto rounded-lg border">` (línea 69) por:

```tsx
      <div
        role="region"
        aria-label="Tabla de la bitácora (desplazable horizontalmente)"
        tabIndex={0}
        className="overflow-x-auto rounded-lg border outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
      >
```

Botón "Filtrar" (línea 63-65): cambiar `py-1.5` por `py-2`:

```tsx
        <button type="submit" className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground">
          Filtrar
        </button>
```

Enlaces de paginación (líneas 96-97): cambiar `px-3 py-1` por `px-3 py-2` en "Anterior" y "Siguiente":

```tsx
          {r.pagina > 1 && <Link href={conservar(r.pagina - 1)} className="rounded-md border px-3 py-2 hover:bg-muted">Anterior</Link>}
          {r.pagina < r.totalPaginas && <Link href={conservar(r.pagina + 1)} className="rounded-md border px-3 py-2 hover:bg-muted">Siguiente</Link>}
```

- [ ] **Step 5: EncabezadoSitio — foco visible consistente en el campo de búsqueda**

En `src/componentes/EncabezadoSitio.tsx`, en el `<input type="search">` (línea 55) cambiar `outline-none transition-colors ... focus:border-azul focus:ring-2 focus:ring-azul/20` por foco-visible consistente:

```tsx
            className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground/70 focus-visible:border-azul focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
```

- [ ] **Step 6: Correr el test y verlo pasar**

Run: `npm test -- a11y-estructura`
Expected: PASS.

- [ ] **Step 7: Verificar lint y build**

Run: `npm run lint && npm run build`
Expected: limpios.

- [ ] **Step 8: Commit**

```bash
git add src/componentes/EncabezadoSitio.tsx "src/app/admin" tests/a11y-estructura.test.ts
git commit -m "feat: tablas del panel enfocables por teclado y objetivos tactiles mayores

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Deuda técnica — `npm audit` moderado

**Files:**
- Modify: `package.json` / `package-lock.json` (solo si `npm audit fix` cambia algo seguro)
- Modify: `CONTEXT.md` (§Deuda técnica: registrar el resultado)

**Interfaces:** ninguna (mantenimiento).

- [ ] **Step 1: Ver el estado actual**

Run: `npm audit`
Expected: lista de vulnerabilidades moderadas (transitivas del scaffold/tooling). Anotar cuántas y de qué paquetes.

- [ ] **Step 2: Aplicar solo lo seguro (sin cambios mayores de versión)**

Run: `npm audit fix`
(NO usar `--force`: rompería el pin de `next` 16.2.10 / React 19.2.4. Si un aviso solo se resuelve con `--force`, se deja y se documenta.)

- [ ] **Step 3: Verificar que no hubo regresión**

Run: `npm run lint && npm run build && npm test`
Expected: lint/build limpios; tests igual que antes (161 verdes, 5 rojos preexistentes del seed). Si algo se rompió por el `audit fix`, revertir `package-lock.json` (`git checkout package-lock.json`) y documentar el aviso como aceptado.

- [ ] **Step 4: Registrar el resultado en `CONTEXT.md`**

En la sección **Deuda técnica conocida** de `CONTEXT.md`, reemplazar la viñeta del `npm audit` por el estado real, p. ej.:

```markdown
- `npm audit`: resuelto en Fase 9 con `npm audit fix` (N avisos cerrados). Quedan M
  avisos moderados que solo `--force` resolvería (romperían el pin de next/React);
  se aceptan: son de tooling de build (no llegan al runtime del NAS). Revisar al subir
  de major de Next.
```

(Ajustar N/M y la razón a lo observado. Si quedó en cero, decirlo.)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json CONTEXT.md
git commit -m "chore: resolver npm audit moderado (deuda tecnica Fase 9)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Verificación final (a11y, teclado, móvil) y cierre de fase

**Files:**
- Modify: `CONTEXT.md` (cierre de la Fase 9 + decisiones F9-D1..D4)

**Interfaces:** ninguna (verificación + documentación).

- [ ] **Step 1: Levantar la BD dev y el servidor**

Run (BD dev si no está arriba): `docker compose -f docker-compose.dev.yml up -d`
Run: `npm run dev`
Expected: app en `http://localhost:3000` (o el puerto que indique Next si el 3000 está ocupado por un `next dev` huérfano). Sesión admin: `admin` / `cambiar-esta-clave`.

- [ ] **Step 2: Auditoría de accesibilidad de las 8 vistas principales**

Para cada URL — `/`, `/procesos/<un-slug>`, `/procesos/<slug>/<sub>`, `/documentos/<un-codigo>`, `/buscar?q=acta`, `/admin/maestro`, `/admin/estadisticas`, `/admin/bitacora` — ejecutar Lighthouse solo-accesibilidad:

Run (ideal): `npx --yes lighthouse http://localhost:3000/ --only-categories=accessibility --output=json --output-path=stdout --chrome-flags="--headless=new" --quiet`

- Meta: **score ≥ 0.95** (≥ 95).
- Si Lighthouse no encuentra Chrome en esta máquina, usar el navegador de Playwright MCP (`browser_navigate`) e inspeccionar con `browser_snapshot` que no haya errores de rol/nombre; el criterio de paso equivalente es **cero incidencias serias/críticas de accesibilidad** por vista.
- Anotar el número (o el veredicto axe) de cada vista.

- [ ] **Step 3: Barrido de teclado con Playwright**

Con `browser_navigate` a `/` y luego a cada vista, usar `browser_press_key` (Tab) repetido y `browser_snapshot` para verificar, sin ratón:

- El primer Tab revela "Saltar al contenido"; al activarlo (Enter) el foco entra a `#contenido`.
- El anillo de foco es visible en enlaces del mapa, tarjetas de resultado, filtros de búsqueda, descargas de la ficha, y en el visor PDF **sin** que el overlay (D31) atrape el foco de la página.
- En el panel: Tab llega a la tabla desplazable (Maestro/Bitácora) como región enfocable, y a los filtros/paginación de la bitácora.

Anotar cualquier trampa de foco o control inalcanzable; corregir en su archivo y volver a correr `npm run lint && npm run build` antes de re-verificar.

- [ ] **Step 4: Recorrido móvil a 390 px**

Run: `browser_resize` a 390×844. Navegar las vistas premium y `browser_take_screenshot` de cada una:

- Mapa colapsa a acordeón (D9) y es operable.
- Tablas de Maestro/Bitácora se desplazan horizontalmente y son enfocables.
- Encabezado + buscador usables; sin scroll horizontal del `body`.
- Objetivos táctiles cómodos (los `py-2` de Task 5).

Guardar los screenshots en `.playwright-mcp/` como evidencia. Anotar cualquier desborde y corregirlo.

- [ ] **Step 5: Suite completa sin regresión**

Run: `npm run lint && npm run build && npm test`
Expected: lint/build limpios; tests: los nuevos de `a11y-estructura` y `contraste` en verde + los 161 previos; los 5 rojos siguen siendo los preexistentes del seed (`PR-GTH-990/991`), no nuevos.

- [ ] **Step 6: Actualizar `CONTEXT.md` (cierre de fase)**

- Cambiar el encabezado y el **Punto de reanudación** para reflejar Fase 9 cerrada (con los números de Lighthouse/axe capturados y la evidencia móvil).
- Añadir en **Estado actual** la viñeta "Hecho (Fase 9)".
- Añadir una tabla **Decisiones adicionales (Fase 9)** con F9-D1 (sin modo oscuro), F9-D2 (CSS puro), F9-D3 (cobertura premium), F9-D4 (verificación manual/herramienta).
- Marcar en **Deuda técnica** el `npm audit` como atendido (ya hecho en Task 6).

- [ ] **Step 7: Commit de cierre**

```bash
git add CONTEXT.md .playwright-mcp
git commit -m "docs: cierre de la Fase 9 (pulido visual, a11y, responsive)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 8: Reportar al usuario qué probar y cómo**

Resumir: las 8 vistas con su score de a11y, la evidencia móvil (screenshots en `.playwright-mcp/`), y el guion para que el usuario recorra en su **celular real** (mapa→proceso→subproceso→ficha→buscar; y en el panel maestro/estadísticas/bitácora). Pedir el veredicto antes de pasar a la Fase 10.

---

## Notas de verificación transversales

- **Cada tarea** termina con `npm run lint && npm run build` limpios; las tareas 1, 2, 4 y 5 además tienen test Vitest real.
- **`prefers-reduced-motion`:** ya cubierto globalmente; verificar en Task 7 activando la preferencia del SO/emulándola en Playwright que `.entrada` y `.skeleton` quedan estáticos.
- **Sin nuevas dependencias de runtime** (Skeleton y contraste son código propio; Lighthouse/axe son solo herramientas de verificación vía `npx`, no entran al bundle).
