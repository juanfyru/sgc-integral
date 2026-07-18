# Fase 7 — Editor del mapa y tablas maestras · Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development
> (recomendado) o superpowers:executing-plans para ejecutar tarea por tarea. Los pasos
> usan checkbox (`- [ ]`) para el seguimiento.

**Goal:** Dar al admin un editor 100 % data-driven del mapa de procesos (macroprocesos,
procesos, subprocesos, periféricos, textos institucionales) y de la tabla maestra de
tipos de documento, con reordenamiento, activar/desactivar (con advertencia de
huérfanos), borrado solo-si-vacío, previsualización con inactivos y auditoría completa.

**Architecture:** Listas CRUD tipo tabla (patrón del panel de documentos ya existente),
sin WYSIWYG. Un motor genérico de datos (`mover`/`alternarActivo`/`borrar`) parametrizado
por nombre de tabla reúsa el mismo código para las 5 entidades ordenables. Cada mutación
va en una transacción con `registrarAuditoria`. El render público del mapa no se toca; la
vista previa reusa `MapaProcesos` con un flag que pinta los inactivos en gris.

**Tech Stack:** Next.js 16 (App Router, Server Components por defecto), TypeScript
estricto, Drizzle/postgres.js (SQL crudo con `sql`), Tailwind 4, Vitest.

## Global Constraints

- Node 24 en dev/CI/Docker; imagen `linux/arm64`; sin dependencias externas en runtime.
- **Ninguna dependencia nueva**: todo se hace con lo ya instalado.
- TypeScript `strict: true`; sin `any` salvo justificación puntual.
- Server Components por defecto; `'use client'` solo donde haya interactividad.
- Idioma español en dominio, UI, rutas, columnas y textos.
- **Regla ISO 4**: ninguna ruta de escritura sin sesión — toda action/handler empieza por
  `requerirSesion()`.
- **Regla ISO 5**: toda mutación (crear, editar, reordenar, activar, desactivar, borrar)
  queda en `auditoria` dentro de la misma transacción.
- **Regla ISO 8**: el mapa vive en BD; el render sigue 100 % data-driven.
- Accesibilidad: reordenar con botones reales (no drag&drop), foco visible, `aria-label`,
  el ícono nunca como única señal.
- Migraciones: **esta fase no cambia el esquema** (todas las columnas ya existen). Si un
  paso creyera necesitar una migración, es señal de error — detenerse y revisar.
- Un commit por tarea en `main`, mensaje convencional en español, terminando con:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Verificación antes de cerrar: `npm run lint` y `npm test` en verde (los 5 rojos
  preexistentes del seed por `PR-GTH-991` no cuentan como regresión; ver `CONTEXT.md`).

## File Structure

**Nuevos:**
- `src/lib/slug.ts` — `generarSlug(texto)` puro (unaccent + kebab).
- `src/lib/validaciones-mapa.ts` — validadores puros (color, sigla, slug, banda, patrón,
  ícono).
- `src/app/admin/comun.ts` — helpers compartidos de acciones extraídos de `acciones.ts`
  (`EstadoAccion`, `mutacion`, `texto`, `textoONulo`, `idNumerico`, `valoresDeFormulario`).
- `src/db/consultas/mapa-admin.ts` — motor genérico + CRUD de las 6 entidades del editor.
- `src/app/admin/acciones-mapa.ts` — Server Actions del editor (genéricas + por entidad).
- `src/componentes/admin/mapa/` — componentes UI compartidos: `BotonesOrden.tsx`,
  `BotonToggle.tsx`, `ConfirmarDesactivar.tsx`, `BotonBorrar.tsx`, `SelectorIcono.tsx`,
  `Formulario*.tsx` por entidad.
- `src/app/admin/(panel)/mapa/**` y `src/app/admin/(panel)/tipos/**` — páginas.
- `tests/mapa-admin.test.ts` — tests de BD del motor y CRUD.
- `tests/validaciones-mapa.test.ts` — tests puros de validadores y slug.

**Modificados:**
- `src/app/admin/acciones.ts` — reimporta desde `comun.ts` (sin cambio de conducta).
- `src/componentes/admin/FormularioDocumento.tsx` — importa `EstadoAccion` desde `comun`.
- `src/componentes/iconos.tsx` — exporta `NOMBRES_ICONO`.
- `src/db/consultas/mapa.ts` — agrega `obtenerDatosMapaAdmin()` y `activo?` en los tipos.
- `src/componentes/mapa/{Banda,TarjetaProceso,RailPeriferico}.tsx` — estilo de inactivo.
- `src/app/admin/(panel)/layout.tsx` — enlaces de nav.
- `tests/guardia.test.ts` — casos de las nuevas rutas de escritura.

---

### Task 1: Helpers puros (slug, validaciones) y extracción de `comun.ts`

Front-carga las piezas puras reusadas por todo el editor y separa los helpers de acciones
para que `acciones-mapa.ts` los reúse sin duplicar. Deliverable testeable sin BD.

**Files:**
- Create: `src/lib/slug.ts`
- Create: `src/lib/validaciones-mapa.ts`
- Create: `src/app/admin/comun.ts`
- Create: `tests/validaciones-mapa.test.ts`
- Modify: `src/app/admin/acciones.ts` (mover helpers a `comun.ts`, reimportar)
- Modify: `src/componentes/admin/FormularioDocumento.tsx:4` (import de `EstadoAccion`)
- Modify: `src/componentes/iconos.tsx` (exportar `NOMBRES_ICONO`)

**Interfaces:**
- Produces:
  - `generarSlug(texto: string): string`
  - `validarColor(v: string): string` · `validarSigla(v: string): string` ·
    `validarSlug(v: string): string` · `validarBanda(v: string): string` ·
    `validarPatronCodigo(v: string): string` ·
    `validarIcono(v: string, validos: readonly string[]): string`
  - `NOMBRES_ICONO: string[]` (desde `iconos.tsx`)
  - `EstadoAccion`, `mutacion(formData, fn)`, `texto(fd, campo)`, `textoONulo(fd, campo)`,
    `idNumerico(fd, campo)`, `valoresDeFormulario(fd)` (desde `comun.ts`)

- [ ] **Step 1: Escribir el test puro (falla)**

Create `tests/validaciones-mapa.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generarSlug } from "@/lib/slug";
import {
  validarBanda,
  validarColor,
  validarIcono,
  validarPatronCodigo,
  validarSigla,
  validarSlug,
} from "@/lib/validaciones-mapa";

describe("generarSlug", () => {
  it("quita acentos y pasa a kebab minúsculo", () => {
    expect(generarSlug("Atención al Usuario")).toBe("atencion-al-usuario");
    expect(generarSlug("  Gestión  del   Riesgo ")).toBe("gestion-del-riesgo");
    expect(generarSlug("PYM / SSO&ST")).toBe("pym-sso-st");
  });
});

describe("validadores", () => {
  it("color exige hex de 6 dígitos y normaliza a mayúsculas", () => {
    expect(validarColor("#1b4e8e")).toBe("#1B4E8E");
    expect(() => validarColor("azul")).toThrow(/hex/i);
    expect(() => validarColor("#123")).toThrow(/hex/i);
  });
  it("sigla exige 2–4 letras y normaliza a mayúsculas", () => {
    expect(validarSigla("gth")).toBe("GTH");
    expect(() => validarSigla("A")).toThrow(/letras/i);
    expect(() => validarSigla("GTH1")).toThrow(/letras/i);
  });
  it("slug valida el formato kebab", () => {
    expect(validarSlug("consulta-externa")).toBe("consulta-externa");
    expect(() => validarSlug("Consulta Externa")).toThrow(/slug/i);
  });
  it("banda solo admite las cuatro válidas", () => {
    expect(validarBanda("misionales")).toBe("misionales");
    expect(() => validarBanda("otra")).toThrow(/banda/i);
  });
  it("patrón exige una expresión regular válida", () => {
    expect(validarPatronCodigo("^[A-Z]{2}-\\d{3}$")).toBe("^[A-Z]{2}-\\d{3}$");
    expect(() => validarPatronCodigo("(sin cerrar")).toThrow(/regular/i);
  });
  it("ícono debe estar en la lista registrada", () => {
    expect(validarIcono("target", ["target", "users"])).toBe("target");
    expect(() => validarIcono("inexistente", ["target"])).toThrow(/ícono/i);
  });
});
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npm test -- validaciones-mapa`
Expected: FAIL ("Cannot find module '@/lib/slug'").

- [ ] **Step 3: Implementar `src/lib/slug.ts`**

```ts
// Slug estable para URLs del mapa: sin acentos, minúsculas, kebab-case.
export function generarSlug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

- [ ] **Step 4: Implementar `src/lib/validaciones-mapa.ts`**

```ts
// Validadores puros del editor del mapa. Lanzan Error de negocio con mensaje
// para el admin; las acciones los capturan y conservan lo escrito.
const BANDAS = ["estrategicos", "misionales", "apoyo", "evaluacion"] as const;

export function validarColor(v: string): string {
  const c = v.trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(c)) {
    throw new Error("El color debe ser hex de 6 dígitos, p. ej. #1B4E8E");
  }
  return c.toUpperCase();
}

export function validarSigla(v: string): string {
  const s = v.trim().toUpperCase();
  if (!/^[A-Z]{2,4}$/.test(s)) {
    throw new Error("La sigla debe tener de 2 a 4 letras (A–Z)");
  }
  return s;
}

export function validarSlug(v: string): string {
  const s = v.trim().toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)) {
    throw new Error("El slug solo admite minúsculas, números y guiones");
  }
  return s;
}

export function validarBanda(v: string): string {
  if (!(BANDAS as readonly string[]).includes(v)) {
    throw new Error("Banda inválida");
  }
  return v;
}

export function validarPatronCodigo(v: string): string {
  try {
    new RegExp(v);
  } catch {
    throw new Error("El patrón no es una expresión regular válida");
  }
  return v;
}

export function validarIcono(v: string, validos: readonly string[]): string {
  const i = v.trim();
  if (!validos.includes(i)) {
    throw new Error("El ícono no está en el catálogo disponible");
  }
  return i;
}
```

- [ ] **Step 5: Exportar `NOMBRES_ICONO` en `src/componentes/iconos.tsx`**

Agregar al final del archivo (después de `REGISTRO`):

```ts
// Catálogo de íconos válidos para el editor del mapa (nombres kebab-case).
export const NOMBRES_ICONO: string[] = Object.keys(REGISTRO).sort();
```

- [ ] **Step 6: Ejecutar el test puro (pasa)**

Run: `npm test -- validaciones-mapa`
Expected: PASS.

- [ ] **Step 7: Extraer helpers a `src/app/admin/comun.ts`**

Create `src/app/admin/comun.ts` moviendo el código **verbatim** desde `acciones.ts`
(sin `"use server"`: es un módulo de helpers, no de actions):

```ts
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requerirSesion } from "@/lib/sesion-actual";

export type EstadoAccion =
  | { ok: false; error: string; valores?: Record<string, string | string[]> }
  | null;

export function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim();
}

export function textoONulo(formData: FormData, campo: string): string | null {
  return texto(formData, campo) || null;
}

export function idNumerico(formData: FormData, campo: string): number {
  const n = Number(formData.get(campo));
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Falta ${campo}`);
  return n;
}

// React 19 resetea los campos no controlados al completar la action: los
// valores enviados vuelven en el estado para repoblarlos como defaultValue.
export function valoresDeFormulario(
  formData: FormData,
): Record<string, string | string[]> {
  const valores: Record<string, string | string[]> = {};
  for (const clave of new Set(formData.keys())) {
    const todos = formData
      .getAll(clave)
      .filter((v): v is string => typeof v === "string");
    valores[clave] = todos.length > 1 ? todos : (todos[0] ?? "");
  }
  return valores;
}

// Envuelve la mutación: requerirSesion SIEMPRE primero; los errores de
// negocio vuelven al formulario como { ok: false } sin perder lo escrito.
// redirect lanza NEXT_REDIRECT a propósito — va FUERA del try.
export async function mutacion(
  formData: FormData,
  fn: (usuarioId: number, formData: FormData) => Promise<string | void>,
): Promise<EstadoAccion> {
  const sesion = await requerirSesion();
  let destino: string | void;
  try {
    destino = await fn(sesion.usuarioId, formData);
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message,
      valores: valoresDeFormulario(formData),
    };
  }
  revalidatePath("/", "layout");
  if (destino) redirect(destino);
  return null;
}
```

- [ ] **Step 8: Actualizar `src/app/admin/acciones.ts` para reimportar**

Borrar de `acciones.ts` las definiciones de `EstadoAccion`, `texto`, `textoONulo`,
`idNumerico`, `valoresDeFormulario`, `mutacion` y el `ERROR_CREDENCIALES` queda igual.
Agregar el import y un re-export (para no romper a `FormularioDocumento` ni al test):

```ts
import {
  idNumerico,
  mutacion,
  texto,
  textoONulo,
  type EstadoAccion,
} from "@/app/admin/comun";

export type { EstadoAccion } from "@/app/admin/comun";
```

Quitar imports que queden sin uso (`revalidatePath`, `redirect`, `requerirSesion` siguen
usándose por `ingresar`/`salir` — conservarlos). Verificar que `valoresDeFormulario` ya no
se referencia en `acciones.ts` (se usa dentro de `mutacion`, ya en `comun.ts`).

- [ ] **Step 9: Apuntar el import de `FormularioDocumento`**

En `src/componentes/admin/FormularioDocumento.tsx:4` cambiar:

```ts
import type { EstadoAccion } from "@/app/admin/comun";
```

- [ ] **Step 10: Verificar lint + tests + arranque**

Run: `npm run lint`
Expected: sin errores.
Run: `npm test -- validaciones-mapa guardia`
Expected: PASS (guardia sigue verde: la conducta de `mutacion` no cambió).

- [ ] **Step 11: Commit**

```bash
git add src/lib/slug.ts src/lib/validaciones-mapa.ts src/app/admin/comun.ts \
  src/app/admin/acciones.ts src/componentes/admin/FormularioDocumento.tsx \
  src/componentes/iconos.tsx tests/validaciones-mapa.test.ts
git commit -m "refactor: helpers puros del editor del mapa y extraccion de comun.ts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Motor genérico de datos (`mover`/`alternarActivo`/`borrar`)

El corazón reusable: tres operaciones parametrizadas por nombre de tabla, con `orden` por
ámbito (banda / macroproceso / proceso / tipo / global). Se prueban contra la BD sembrada
usando `elementos_perifericos` (tienen ámbito `tipo` y no bloquean borrado) y
`tipos_documento`. No hay UI todavía.

**Files:**
- Create: `src/db/consultas/mapa-admin.ts`
- Create: `tests/mapa-admin.test.ts`

**Interfaces:**
- Consumes: `registrarAuditoria(sql, {...})` desde `@/db/consultas/admin`.
- Produces:
  - `type Tabla = "macroprocesos" | "procesos" | "subprocesos" | "elementos_perifericos" | "tipos_documento"`
  - `TABLAS_MAPA: readonly Tabla[]`
  - `mover(tabla: Tabla, id: number, direccion: "arriba" | "abajo", usuarioId: number): Promise<void>`
  - `alternarActivo(tabla: Tabla, id: number, activo: boolean, usuarioId: number): Promise<void>`
  - `borrar(tabla: Tabla, id: number, usuarioId: number): Promise<void>`
  - `siguienteOrden(tx, tabla, ambitoCol, ambitoValor): Promise<number>` (interno, exportado
    para reuso por las tareas siguientes)
  - `type Cliente = Sql | TransactionSql` (interno)

- [ ] **Step 1: Escribir el test de BD (falla)**

Create `tests/mapa-admin.test.ts`:

```ts
/**
 * Motor genérico del editor del mapa contra la BD dev (migrada y sembrada).
 * Usa un tipo de documento y periféricos de prueba con prefijo ZZ para no
 * tocar los datos del seed.
 */
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { asegurarAdmin } from "@/db/consultas/admin";
import { alternarActivo, borrar, mover } from "@/db/consultas/mapa-admin";

const sql = () => obtenerSql();
let usuarioId: number;

async function limpiar() {
  await sql()`DELETE FROM elementos_perifericos WHERE texto LIKE 'ZZ-%'`;
  await sql()`DELETE FROM tipos_documento WHERE sigla LIKE 'ZZ%'`;
  await sql()`DELETE FROM auditoria WHERE usuario_id IN
    (SELECT id FROM usuarios WHERE usuario = 'admin_mapa')`;
  await sql()`DELETE FROM usuarios WHERE usuario = 'admin_mapa'`;
}

beforeAll(async () => {
  await limpiar();
  await asegurarAdmin("admin_mapa", "Admin Mapa", "x");
  [{ id: usuarioId }] = await sql()`SELECT id FROM usuarios WHERE usuario = 'admin_mapa'`;
});

afterAll(async () => {
  await limpiar();
  await sql().end();
});

async function tresConvenciones() {
  const filas = await sql()`INSERT INTO elementos_perifericos (tipo, texto, orden)
    VALUES ('convencion','ZZ-a',1000),('convencion','ZZ-b',1001),('convencion','ZZ-c',1002)
    RETURNING id, texto ORDER BY orden`;
  return filas as Array<{ id: number; texto: string }>;
}

describe("mover", () => {
  it("intercambia el orden con el vecino y audita", async () => {
    const [a, b] = await tresConvenciones();
    await mover("elementos_perifericos", b.id, "arriba", usuarioId);
    const orden = await sql()`SELECT texto FROM elementos_perifericos
      WHERE texto LIKE 'ZZ-%' ORDER BY orden`;
    expect(orden.map((f) => f.texto)).toEqual(["ZZ-b", "ZZ-a", "ZZ-c"]);
    const [aud] = await sql()`SELECT 1 FROM auditoria
      WHERE accion = 'reordenar_periferico' AND entidad_id = ${b.id}`;
    expect(aud).toBeTruthy();
  });

  it("en el extremo superior es no-op", async () => {
    const [a] = await tresConvenciones();
    await mover("elementos_perifericos", a.id, "arriba", usuarioId);
    const orden = await sql()`SELECT texto FROM elementos_perifericos
      WHERE texto LIKE 'ZZ-%' ORDER BY orden`;
    expect(orden.map((f) => f.texto)).toEqual(["ZZ-a", "ZZ-b", "ZZ-c"]);
  });

  it("solo intercambia dentro del mismo ámbito (tipo)", async () => {
    await tresConvenciones();
    const [entrada] = await sql()`INSERT INTO elementos_perifericos (tipo, texto, orden)
      VALUES ('entrada','ZZ-x',999) RETURNING id`;
    // 'ZZ-x' es la única de tipo 'entrada': subir es no-op aunque haya
    // convenciones con orden menor.
    await mover("elementos_perifericos", entrada.id, "arriba", usuarioId);
    const [f] = await sql()`SELECT orden FROM elementos_perifericos WHERE id = ${entrada.id}`;
    expect(f.orden).toBe(999);
  });
});

describe("alternarActivo", () => {
  it("desactiva y reactiva con auditoría", async () => {
    const [a] = await tresConvenciones();
    await alternarActivo("elementos_perifericos", a.id, false, usuarioId);
    const [f] = await sql()`SELECT activo FROM elementos_perifericos WHERE id = ${a.id}`;
    expect(f.activo).toBe(false);
    const [aud] = await sql()`SELECT 1 FROM auditoria
      WHERE accion = 'desactivar_periferico' AND entidad_id = ${a.id}`;
    expect(aud).toBeTruthy();
    await alternarActivo("elementos_perifericos", a.id, true, usuarioId);
    const [f2] = await sql()`SELECT activo FROM elementos_perifericos WHERE id = ${a.id}`;
    expect(f2.activo).toBe(true);
  });
});

describe("borrar", () => {
  it("borra un periférico sin dependientes y audita antes", async () => {
    const [a] = await tresConvenciones();
    await borrar("elementos_perifericos", a.id, usuarioId);
    const filas = await sql()`SELECT 1 FROM elementos_perifericos WHERE id = ${a.id}`;
    expect(filas.length).toBe(0);
    const [aud] = await sql()`SELECT 1 FROM auditoria
      WHERE accion = 'borrar_periferico' AND entidad_id = ${a.id}`;
    expect(aud).toBeTruthy();
  });

  it("traduce la violación de FK en error de negocio y no deja auditoría huérfana", async () => {
    // Un tipo_documento en uso por el seed no se puede borrar (FK restrict).
    const [tipo] = await sql()`SELECT t.id FROM tipos_documento t
      WHERE EXISTS (SELECT 1 FROM documentos d WHERE d.tipo_id = t.id) LIMIT 1`;
    await expect(borrar("tipos_documento", tipo.id, usuarioId)).rejects.toThrow(/No se puede borrar/);
    const aud = await sql()`SELECT 1 FROM auditoria
      WHERE accion = 'borrar_tipo_documento' AND entidad_id = ${tipo.id}`;
    expect(aud.length).toBe(0);
  });
});
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npm test -- mapa-admin`
Expected: FAIL ("Cannot find module '@/db/consultas/mapa-admin'").

- [ ] **Step 3: Implementar `src/db/consultas/mapa-admin.ts` (motor)**

```ts
import type { Sql, TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";

export type Cliente = Sql | TransactionSql;

export type Tabla =
  | "macroprocesos"
  | "procesos"
  | "subprocesos"
  | "elementos_perifericos"
  | "tipos_documento";

export const TABLAS_MAPA: readonly Tabla[] = [
  "macroprocesos",
  "procesos",
  "subprocesos",
  "elementos_perifericos",
  "tipos_documento",
];

// Columna que delimita a los hermanos para reordenar (null = orden global).
const AMBITO: Record<Tabla, string | null> = {
  macroprocesos: "banda",
  procesos: "macroproceso_id",
  subprocesos: "proceso_id",
  elementos_perifericos: "tipo",
  tipos_documento: null,
};

// Nombre singular de la entidad para la acción de auditoría.
const SINGULAR: Record<Tabla, string> = {
  macroprocesos: "macroproceso",
  procesos: "proceso",
  subprocesos: "subproceso",
  elementos_perifericos: "periferico",
  tipos_documento: "tipo_documento",
};

// Siguiente `orden` dentro del ámbito (para altas). Exportado para reuso.
export async function siguienteOrden(
  tx: Cliente,
  tabla: Tabla,
  ambitoCol: string | null,
  ambitoValor: unknown,
): Promise<number> {
  const filtro = ambitoCol ? tx`WHERE ${tx(ambitoCol)} = ${ambitoValor}` : tx``;
  const [r] = await tx`SELECT coalesce(max(orden), 0) + 1 AS n
    FROM ${tx(tabla)} ${filtro}`;
  return r.n as number;
}

/** Intercambia el `orden` de la fila con su hermano inmediato en la dirección
 *  dada, dentro del mismo ámbito. No-op silencioso si ya está en el extremo. */
export async function mover(
  tabla: Tabla,
  id: number,
  direccion: "arriba" | "abajo",
  usuarioId: number,
): Promise<void> {
  const ambito = AMBITO[tabla];
  const sql = obtenerSql();
  await sql.begin(async (tx) => {
    const [fila] = await tx`SELECT * FROM ${tx(tabla)} WHERE id = ${id} FOR UPDATE`;
    if (!fila) throw new Error("El elemento no existe");
    const mismoAmbito = ambito ? tx`AND ${tx(ambito)} = ${fila[ambito]}` : tx``;
    const [vecino] =
      direccion === "arriba"
        ? await tx`SELECT id, orden FROM ${tx(tabla)}
            WHERE orden < ${fila.orden} ${mismoAmbito}
            ORDER BY orden DESC LIMIT 1 FOR UPDATE`
        : await tx`SELECT id, orden FROM ${tx(tabla)}
            WHERE orden > ${fila.orden} ${mismoAmbito}
            ORDER BY orden ASC LIMIT 1 FOR UPDATE`;
    if (!vecino) return; // extremo: no-op
    await tx`UPDATE ${tx(tabla)} SET orden = ${vecino.orden} WHERE id = ${fila.id}`;
    await tx`UPDATE ${tx(tabla)} SET orden = ${fila.orden} WHERE id = ${vecino.id}`;
    await registrarAuditoria(tx, {
      usuarioId, accion: `reordenar_${SINGULAR[tabla]}`, entidad: tabla,
      entidadId: id, detalle: { direccion },
    });
  });
}

/** Activa o desactiva una fila (todas las tablas del mapa tienen `activo`). */
export async function alternarActivo(
  tabla: Tabla,
  id: number,
  activo: boolean,
  usuarioId: number,
): Promise<void> {
  const sql = obtenerSql();
  await sql.begin(async (tx) => {
    const [fila] = await tx`UPDATE ${tx(tabla)} SET activo = ${activo}
      WHERE id = ${id} RETURNING id`;
    if (!fila) throw new Error("El elemento no existe");
    await registrarAuditoria(tx, {
      usuarioId,
      accion: `${activo ? "activar" : "desactivar"}_${SINGULAR[tabla]}`,
      entidad: tabla, entidadId: id, detalle: {},
    });
  });
}

/** Borrado duro: audita ANTES (la fila desaparece) y traduce la violación de
 *  FK (onDelete restrict) en un error de negocio legible. La UI solo ofrece
 *  este botón cuando no hay dependientes; esto es la red de seguridad. */
export async function borrar(
  tabla: Tabla,
  id: number,
  usuarioId: number,
): Promise<void> {
  const sql = obtenerSql();
  await sql.begin(async (tx) => {
    const [fila] = await tx`SELECT * FROM ${tx(tabla)} WHERE id = ${id} FOR UPDATE`;
    if (!fila) throw new Error("El elemento no existe");
    await registrarAuditoria(tx, {
      usuarioId, accion: `borrar_${SINGULAR[tabla]}`, entidad: tabla,
      entidadId: id,
      detalle: { nombre: fila.nombre ?? fila.texto ?? null },
    });
    try {
      await tx`DELETE FROM ${tx(tabla)} WHERE id = ${id}`;
    } catch (err) {
      if ((err as { code?: string }).code === "23503") {
        throw new Error(
          "No se puede borrar: tiene elementos o documentos asociados. Desactívelo.",
        );
      }
      throw err;
    }
  });
}
```

- [ ] **Step 4: Ejecutar los tests (pasan)**

Run: `npm test -- mapa-admin`
Expected: PASS (6 tests). Requiere la BD dev arriba
(`docker compose -f docker-compose.dev.yml up -d`) y migrada+sembrada.

- [ ] **Step 5: Commit**

```bash
git add src/db/consultas/mapa-admin.ts tests/mapa-admin.test.ts
git commit -m "feat: motor generico del editor del mapa (mover, activar, borrar)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Tipos de documento (CRUD + acciones genéricas + UI + guard)

El CRUD más simple: valida el patrón completo (datos, acciones, componentes de fila
compartidos, páginas, nav, guard). Deliverable: gestionar tipos en el navegador.

**Files:**
- Modify: `src/db/consultas/mapa-admin.ts` (agregar CRUD de tipos + `traducirUnico`)
- Create: `src/app/admin/acciones-mapa.ts` (acciones genéricas + de tipos)
- Create: `src/componentes/admin/mapa/BotonesOrden.tsx`
- Create: `src/componentes/admin/mapa/BotonToggle.tsx`
- Create: `src/componentes/admin/mapa/BotonBorrar.tsx`
- Create: `src/componentes/admin/mapa/FormularioTipo.tsx`
- Create: `src/app/admin/(panel)/tipos/page.tsx`
- Create: `src/app/admin/(panel)/tipos/nuevo/page.tsx`
- Create: `src/app/admin/(panel)/tipos/[id]/page.tsx`
- Modify: `src/app/admin/(panel)/layout.tsx` (enlace "Tipos de documento")
- Modify: `tests/guardia.test.ts` (casos de las acciones nuevas)

**Interfaces:**
- Consumes: `mover`, `alternarActivo`, `borrar`, `siguienteOrden`, `TABLAS_MAPA`, `Tabla`,
  `Cliente` (Task 2); `mutacion`, `texto`, `idNumerico`, `EstadoAccion` (Task 1);
  `validarSigla` (Task 1); `registrarAuditoria` (`@/db/consultas/admin`).
- Produces:
  - Datos: `type FilaTipo = { id: number; nombre: string; sigla: string; esDiligenciable: boolean; orden: number; activo: boolean; numDocs: number }`
  - `listarTipos(): Promise<FilaTipo[]>`
  - `obtenerTipo(id: number): Promise<{ id: number; nombre: string; sigla: string; esDiligenciable: boolean } | null>`
  - `type DatosTipo = { nombre: string; sigla: string; esDiligenciable: boolean }`
  - `crearTipo(d: DatosTipo, usuarioId: number): Promise<{ id: number }>`
  - `editarTipo(id: number, d: DatosTipo, usuarioId: number): Promise<void>`
  - `traducirUnico(err: unknown, mensaje: string): Error` (helper interno reusable)
  - Acciones: `moverAccion(formData)`, `alternarAccion(formData)`, `borrarAccion(formData)`
    (genéricas, `Promise<void>`); `crearTipoAccion(prev, formData)`,
    `editarTipoAccion(prev, formData)` (`Promise<EstadoAccion>`).

- [ ] **Step 1: Test de BD del CRUD de tipos (falla)**

Agregar a `tests/mapa-admin.test.ts` (nuevo `describe` antes del `afterAll`):

```ts
import { crearTipo, editarTipo, listarTipos, obtenerTipo } from "@/db/consultas/mapa-admin";

describe("tipos_documento CRUD", () => {
  it("crea, aparece en el listado y se puede editar", async () => {
    const { id } = await crearTipo(
      { nombre: "ZZ Formato Prueba", sigla: "ZZF", esDiligenciable: true },
      usuarioId,
    );
    const lista = await listarTipos();
    const fila = lista.find((f) => f.id === id);
    expect(fila).toMatchObject({ sigla: "ZZF", esDiligenciable: true, numDocs: 0 });

    await editarTipo(id, { nombre: "ZZ Formato Prueba", sigla: "ZZG", esDiligenciable: false }, usuarioId);
    const t = await obtenerTipo(id);
    expect(t).toMatchObject({ sigla: "ZZG", esDiligenciable: false });
    const [aud] = await sql()`SELECT 1 FROM auditoria
      WHERE accion = 'editar_tipo_documento' AND entidad_id = ${id}`;
    expect(aud).toBeTruthy();
  });

  it("rechaza sigla duplicada con error legible", async () => {
    const [existente] = await sql()`SELECT sigla FROM tipos_documento WHERE activo LIMIT 1`;
    await expect(
      crearTipo({ nombre: "ZZ Otro", sigla: existente.sigla, esDiligenciable: false }, usuarioId),
    ).rejects.toThrow(/ya existe/i);
  });
});
```

Actualizar el `limpiar()` del archivo para incluir las siglas `ZZF`/`ZZG` (ya cubiertas
por `LIKE 'ZZ%'`). Sin cambios necesarios.

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npm test -- mapa-admin`
Expected: FAIL ("crearTipo is not exported").

- [ ] **Step 3: Implementar el CRUD de tipos en `mapa-admin.ts`**

Agregar al final del módulo:

```ts
// Traduce la violación de índice único (23505) en un error de negocio legible.
export function traducirUnico(err: unknown, mensaje: string): Error {
  if ((err as { code?: string }).code === "23505") return new Error(mensaje);
  return err as Error;
}

export type FilaTipo = {
  id: number; nombre: string; sigla: string;
  esDiligenciable: boolean; orden: number; activo: boolean; numDocs: number;
};

export async function listarTipos(): Promise<FilaTipo[]> {
  const sql = obtenerSql();
  const filas = await sql`
    SELECT t.id, t.nombre, t.sigla, t.es_diligenciable, t.orden, t.activo,
      (SELECT count(*)::int FROM documentos d WHERE d.tipo_id = t.id) AS num_docs
    FROM tipos_documento t ORDER BY t.orden`;
  return filas.map((f) => ({
    id: f.id, nombre: f.nombre, sigla: f.sigla,
    esDiligenciable: f.es_diligenciable, orden: f.orden,
    activo: f.activo, numDocs: f.num_docs,
  }));
}

export async function obtenerTipo(id: number) {
  const sql = obtenerSql();
  const [f] = await sql`SELECT id, nombre, sigla, es_diligenciable
    FROM tipos_documento WHERE id = ${id}`;
  if (!f) return null;
  return { id: f.id, nombre: f.nombre, sigla: f.sigla, esDiligenciable: f.es_diligenciable };
}

export type DatosTipo = { nombre: string; sigla: string; esDiligenciable: boolean };

export async function crearTipo(
  d: DatosTipo,
  usuarioId: number,
): Promise<{ id: number }> {
  const sql = obtenerSql();
  try {
    return await sql.begin(async (tx) => {
      const orden = await siguienteOrden(tx, "tipos_documento", null, null);
      const [t] = await tx`INSERT INTO tipos_documento (nombre, sigla, es_diligenciable, orden)
        VALUES (${d.nombre}, ${d.sigla}, ${d.esDiligenciable}, ${orden}) RETURNING id`;
      await registrarAuditoria(tx, {
        usuarioId, accion: "crear_tipo_documento", entidad: "tipos_documento",
        entidadId: t.id, detalle: d,
      });
      return { id: t.id };
    });
  } catch (err) {
    throw traducirUnico(err, "Ya existe un tipo con ese nombre o sigla");
  }
}

export async function editarTipo(
  id: number,
  d: DatosTipo,
  usuarioId: number,
): Promise<void> {
  const sql = obtenerSql();
  try {
    await sql.begin(async (tx) => {
      const [t] = await tx`UPDATE tipos_documento SET nombre = ${d.nombre},
          sigla = ${d.sigla}, es_diligenciable = ${d.esDiligenciable}
        WHERE id = ${id} RETURNING id`;
      if (!t) throw new Error("El tipo no existe");
      await registrarAuditoria(tx, {
        usuarioId, accion: "editar_tipo_documento", entidad: "tipos_documento",
        entidadId: id, detalle: d,
      });
    });
  } catch (err) {
    throw traducirUnico(err, "Ya existe un tipo con ese nombre o sigla");
  }
}
```

- [ ] **Step 4: Ejecutar los tests (pasan)**

Run: `npm test -- mapa-admin`
Expected: PASS.

- [ ] **Step 5: Crear las acciones en `src/app/admin/acciones-mapa.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  idNumerico,
  mutacion,
  texto,
  type EstadoAccion,
} from "@/app/admin/comun";
import {
  alternarActivo,
  borrar,
  crearTipo,
  editarTipo,
  mover,
  TABLAS_MAPA,
  type Tabla,
} from "@/db/consultas/mapa-admin";
import { validarSigla } from "@/lib/validaciones-mapa";
import { requerirSesion } from "@/lib/sesion-actual";

// ── Acciones genéricas de fila (tabla llega del formulario, se valida) ──

function tablaValida(v: FormDataEntryValue | null): Tabla {
  const t = String(v);
  if (!(TABLAS_MAPA as readonly string[]).includes(t)) {
    throw new Error("Tabla no permitida");
  }
  return t as Tabla;
}

export async function moverAccion(formData: FormData): Promise<void> {
  const sesion = await requerirSesion();
  const dir = String(formData.get("direccion"));
  if (dir !== "arriba" && dir !== "abajo") throw new Error("Dirección inválida");
  await mover(tablaValida(formData.get("tabla")), idNumerico(formData, "id"), dir, sesion.usuarioId);
  revalidatePath("/", "layout");
}

export async function alternarAccion(formData: FormData): Promise<void> {
  const sesion = await requerirSesion();
  await alternarActivo(
    tablaValida(formData.get("tabla")),
    idNumerico(formData, "id"),
    formData.get("activo") === "true",
    sesion.usuarioId,
  );
  revalidatePath("/", "layout");
}

export async function borrarAccion(formData: FormData): Promise<void> {
  const sesion = await requerirSesion();
  await borrar(tablaValida(formData.get("tabla")), idNumerico(formData, "id"), sesion.usuarioId);
  revalidatePath("/", "layout");
  redirect(String(formData.get("volverA") || "/admin/mapa"));
}

// ── Tipos de documento ──

function parsearTipo(formData: FormData) {
  const nombre = texto(formData, "nombre");
  if (!nombre) throw new Error("El nombre es obligatorio");
  return {
    nombre,
    sigla: validarSigla(texto(formData, "sigla")),
    esDiligenciable: formData.get("esDiligenciable") === "on",
  };
}

export async function crearTipoAccion(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    await crearTipo(parsearTipo(formData), usuarioId);
    return "/admin/tipos";
  });
}

export async function editarTipoAccion(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    await editarTipo(idNumerico(formData, "id"), parsearTipo(formData), usuarioId);
    return "/admin/tipos";
  });
}
```

- [ ] **Step 6: Componentes de fila compartidos**

Create `src/componentes/admin/mapa/BotonesOrden.tsx`:

```tsx
import { ChevronDown, ChevronUp } from "lucide-react";
import { moverAccion } from "@/app/admin/acciones-mapa";
import type { Tabla } from "@/db/consultas/mapa-admin";

// Sube/baja una fila intercambiando su orden con el vecino. Botones reales
// (accesibles), deshabilitados en los extremos.
export function BotonesOrden({
  tabla, id, esPrimero, esUltimo,
}: {
  tabla: Tabla; id: number; esPrimero: boolean; esUltimo: boolean;
}) {
  return (
    <span className="inline-flex gap-1">
      {(["arriba", "abajo"] as const).map((direccion) => {
        const deshabilitado = direccion === "arriba" ? esPrimero : esUltimo;
        return (
          <form action={moverAccion} key={direccion}>
            <input type="hidden" name="tabla" value={tabla} />
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="direccion" value={direccion} />
            <button
              type="submit"
              disabled={deshabilitado}
              aria-label={direccion === "arriba" ? "Subir" : "Bajar"}
              className="grid size-7 place-items-center rounded-md border hover:bg-muted disabled:opacity-30"
            >
              {direccion === "arriba" ? (
                <ChevronUp className="size-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="size-4" aria-hidden="true" />
              )}
            </button>
          </form>
        );
      })}
    </span>
  );
}
```

Create `src/componentes/admin/mapa/BotonToggle.tsx`:

```tsx
import { alternarAccion } from "@/app/admin/acciones-mapa";
import type { Tabla } from "@/db/consultas/mapa-admin";

// Activar/desactivar simple (sin advertencia de huérfanos: tipos y periféricos).
export function BotonToggle({
  tabla, id, activo,
}: {
  tabla: Tabla; id: number; activo: boolean;
}) {
  return (
    <form action={alternarAccion}>
      <input type="hidden" name="tabla" value={tabla} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="activo" value={activo ? "false" : "true"} />
      <button
        type="submit"
        className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
      >
        {activo ? "Desactivar" : "Activar"}
      </button>
    </form>
  );
}
```

Create `src/componentes/admin/mapa/BotonBorrar.tsx`:

```tsx
import { borrarAccion } from "@/app/admin/acciones-mapa";
import type { Tabla } from "@/db/consultas/mapa-admin";

// Borrado duro con confirmación por <details> nativo. La página solo renderiza
// este componente cuando el nodo no tiene dependientes.
export function BotonBorrar({
  tabla, id, volverA,
}: {
  tabla: Tabla; id: number; volverA: string;
}) {
  return (
    <details className="inline-block">
      <summary className="cursor-pointer rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50">
        Borrar
      </summary>
      <form action={borrarAccion} className="mt-2 flex items-center gap-2">
        <input type="hidden" name="tabla" value={tabla} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="volverA" value={volverA} />
        <span className="text-xs text-muted-foreground">¿Seguro? Es permanente.</span>
        <button
          type="submit"
          className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
        >
          Sí, borrar
        </button>
      </form>
    </details>
  );
}
```

- [ ] **Step 7: Formulario de tipo (client) y páginas**

Create `src/componentes/admin/mapa/FormularioTipo.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";

const claseCampo =
  "rounded-md border border-border bg-card px-3 py-2 text-foreground outline-none transition-colors focus:border-azul focus:ring-2 focus:ring-azul/20";

export function FormularioTipo({
  accion, id, valores,
}: {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  id?: number;
  valores?: { nombre: string; sigla: string; esDiligenciable: boolean };
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const v = estado?.valores;
  const val = (campo: string): string | undefined => {
    const x = v?.[campo];
    return typeof x === "string" ? x : Array.isArray(x) ? x[0] : undefined;
  };

  return (
    <form action={enviar} className="flex max-w-lg flex-col gap-5">
      {id && <input type="hidden" name="id" value={id} />}
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nombre
        <input name="nombre" required defaultValue={val("nombre") ?? valores?.nombre}
          className={claseCampo} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Sigla (2–4 letras, para los códigos: PR, FT, MN…)
        <input name="sigla" required defaultValue={val("sigla") ?? valores?.sigla}
          className={`${claseCampo} font-mono uppercase`} />
      </label>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="esDiligenciable"
          defaultChecked={v ? val("esDiligenciable") === "on" : valores?.esDiligenciable} />
        Es diligenciable (formato que se llena, no solo lectura)
      </label>
      {estado && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {estado.error}
        </p>
      )}
      <button type="submit" disabled={pendiente}
        className="self-start rounded-md bg-azul px-5 py-2 font-medium text-white hover:bg-azul-profundo disabled:opacity-60">
        {pendiente ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
```

Create `src/app/admin/(panel)/tipos/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { BotonBorrar } from "@/componentes/admin/mapa/BotonBorrar";
import { BotonToggle } from "@/componentes/admin/mapa/BotonToggle";
import { BotonesOrden } from "@/componentes/admin/mapa/BotonesOrden";
import { listarTipos } from "@/db/consultas/mapa-admin";

export const metadata: Metadata = { title: "Tipos de documento — Administración SGC" };

export default async function PaginaTipos() {
  const tipos = await listarTipos();
  return (
    <main>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Tipos de documento</h1>
        <Link href="/admin/tipos/nuevo"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Nuevo tipo
        </Link>
      </div>
      <ul className="flex flex-col gap-2">
        {tipos.map((t, i) => (
          <li key={t.id}
            className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${t.activo ? "" : "border-dashed opacity-60"}`}>
            <BotonesOrden tabla="tipos_documento" id={t.id}
              esPrimero={i === 0} esUltimo={i === tipos.length - 1} />
            <span className="font-mono text-sm">{t.sigla}</span>
            <Link href={`/admin/tipos/${t.id}`} className="flex-1 font-medium hover:underline">
              {t.nombre}
            </Link>
            <span className="text-xs text-muted-foreground">
              {t.numDocs} docs · {t.esDiligenciable ? "diligenciable" : "solo lectura"}
              {t.activo ? "" : " · inactivo"}
            </span>
            <BotonToggle tabla="tipos_documento" id={t.id} activo={t.activo} />
            {t.numDocs === 0 && (
              <BotonBorrar tabla="tipos_documento" id={t.id} volverA="/admin/tipos" />
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

Create `src/app/admin/(panel)/tipos/nuevo/page.tsx`:

```tsx
import type { Metadata } from "next";
import { crearTipoAccion } from "@/app/admin/acciones-mapa";
import { FormularioTipo } from "@/componentes/admin/mapa/FormularioTipo";

export const metadata: Metadata = { title: "Nuevo tipo — Administración SGC" };

export default function PaginaNuevoTipo() {
  return (
    <main>
      <h1 className="mb-6 font-display text-2xl font-semibold">Nuevo tipo de documento</h1>
      <FormularioTipo accion={crearTipoAccion} />
    </main>
  );
}
```

Create `src/app/admin/(panel)/tipos/[id]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { editarTipoAccion } from "@/app/admin/acciones-mapa";
import { FormularioTipo } from "@/componentes/admin/mapa/FormularioTipo";
import { obtenerTipo } from "@/db/consultas/mapa-admin";

export const metadata: Metadata = { title: "Editar tipo — Administración SGC" };

export default async function PaginaEditarTipo({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const tipo = await obtenerTipo(Number((await params).id));
  if (!tipo) notFound();
  return (
    <main>
      <h1 className="mb-6 font-display text-2xl font-semibold">Editar tipo de documento</h1>
      <FormularioTipo accion={editarTipoAccion} id={tipo.id} valores={tipo} />
    </main>
  );
}
```

- [ ] **Step 8: Enlace en la nav del panel**

En `src/app/admin/(panel)/layout.tsx`, dentro del `<nav>` (después del enlace
"Documentos"), agregar:

```tsx
<Link href="/admin/mapa" className="hover:underline">Mapa</Link>
<Link href="/admin/tipos" className="hover:underline">Tipos de documento</Link>
```

(El enlace "Mapa" apuntará a una página que se crea en la Task 6; hasta entonces da 404 —
aceptable en desarrollo, o crear un placeholder mínimo. Nota para el ejecutor: si molesta,
posponer el enlace "Mapa" hasta la Task 6.)

- [ ] **Step 9: Extender el guard**

En `tests/guardia.test.ts`, agregar el import y los casos al array `casos` del describe
"actions de mutación sin sesión":

```ts
import {
  alternarAccion,
  borrarAccion,
  crearTipoAccion,
  editarTipoAccion,
  moverAccion,
} from "@/app/admin/acciones-mapa";
```

```ts
    ["crearTipoAccion", () => crearTipoAccion(null, fd)],
    ["editarTipoAccion", () => editarTipoAccion(null, fd)],
    ["moverAccion", () => moverAccion(fd)],
    ["alternarAccion", () => alternarAccion(fd)],
    ["borrarAccion", () => borrarAccion(fd)],
```

- [ ] **Step 10: Verificar en navegador + lint + tests**

Run: `npm run lint` → sin errores.
Run: `npm test -- mapa-admin guardia` → PASS.
Manual (con `npm run dev` y sesión iniciada): ir a `/admin/tipos`, crear "Instructivo"
sigla `IN`, reordenar con ↑↓, desactivar/activar, e intentar borrar uno con documentos
(el botón Borrar no debe aparecer) y uno recién creado sin documentos (sí aparece).

- [ ] **Step 11: Commit**

```bash
git add src/db/consultas/mapa-admin.ts src/app/admin/acciones-mapa.ts \
  src/componentes/admin/mapa/ "src/app/admin/(panel)/tipos" \
  "src/app/admin/(panel)/layout.tsx" tests/guardia.test.ts tests/mapa-admin.test.ts
git commit -m "feat: gestion de tipos de documento en el panel admin

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Textos institucionales (`configuracion`)

Editar las claves conocidas de `configuracion` (incluye `patron_codigo`, validado). Un
solo formulario con UPSERT por clave.

**Files:**
- Modify: `src/db/consultas/mapa-admin.ts` (`obtenerTextos`, `guardarTextos`, `CLAVES_TEXTO`)
- Modify: `src/app/admin/acciones-mapa.ts` (`guardarTextosAccion`)
- Create: `src/componentes/admin/mapa/FormularioTextos.tsx`
- Create: `src/app/admin/(panel)/mapa/textos/page.tsx`
- Modify: `tests/mapa-admin.test.ts` (test de UPSERT y validación de patrón)
- Modify: `tests/guardia.test.ts` (caso `guardarTextosAccion`)

**Interfaces:**
- Produces:
  - `CLAVES_TEXTO: ReadonlyArray<{ clave: string; etiqueta: string; textarea?: boolean }>`
  - `obtenerTextos(): Promise<Record<string, string>>`
  - `guardarTextos(valores: Record<string, string>, usuarioId: number): Promise<void>`
  - `guardarTextosAccion(prev, formData): Promise<EstadoAccion>`

- [ ] **Step 1: Test de BD (falla)**

Agregar a `tests/mapa-admin.test.ts`:

```ts
import { guardarTextos, obtenerTextos } from "@/db/consultas/mapa-admin";

describe("textos institucionales", () => {
  it("guarda por UPSERT y valida el patrón de código", async () => {
    const antes = await obtenerTextos();
    await guardarTextos({ ...antes, lema: "ZZ lema de prueba" }, usuarioId);
    const despues = await obtenerTextos();
    expect(despues.lema).toBe("ZZ lema de prueba");
    // restaurar
    await guardarTextos({ ...despues, lema: antes.lema ?? "" }, usuarioId);

    await expect(
      guardarTextos({ patron_codigo: "(sin cerrar" }, usuarioId),
    ).rejects.toThrow(/regular/i);
  });
});
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npm test -- mapa-admin`
Expected: FAIL ("guardarTextos is not exported").

- [ ] **Step 3: Implementar en `mapa-admin.ts`**

Agregar el import del validador al inicio del módulo:

```ts
import { validarPatronCodigo } from "@/lib/validaciones-mapa";
```

Y al final:

```ts
export const CLAVES_TEXTO: ReadonlyArray<{
  clave: string; etiqueta: string; textarea?: boolean;
}> = [
  { clave: "nombre_entidad", etiqueta: "Nombre de la entidad" },
  { clave: "subtitulo_mapa", etiqueta: "Subtítulo del mapa" },
  { clave: "lema", etiqueta: "Lema institucional", textarea: true },
  { clave: "titulo_phva", etiqueta: "Título del ciclo PHVA" },
  { clave: "texto_phva", etiqueta: "Texto del ciclo PHVA", textarea: true },
  { clave: "patron_codigo", etiqueta: "Patrón del código (expresión regular)" },
];

export async function obtenerTextos(): Promise<Record<string, string>> {
  const sql = obtenerSql();
  const claves = CLAVES_TEXTO.map((c) => c.clave);
  const filas = await sql`SELECT clave, valor FROM configuracion
    WHERE clave IN ${sql(claves)}`;
  return Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
}

export async function guardarTextos(
  valores: Record<string, string>,
  usuarioId: number,
): Promise<void> {
  // Solo claves conocidas; ignora cualquier otra que llegue.
  const permitidas = new Set(CLAVES_TEXTO.map((c) => c.clave));
  const entradas = Object.entries(valores).filter(([k]) => permitidas.has(k));
  if ("patron_codigo" in valores) {
    validarPatronCodigo(valores.patron_codigo);
  }
  const sql = obtenerSql();
  await sql.begin(async (tx) => {
    for (const [clave, valor] of entradas) {
      await tx`INSERT INTO configuracion (clave, valor) VALUES (${clave}, ${valor})
        ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`;
    }
    await registrarAuditoria(tx, {
      usuarioId, accion: "editar_configuracion", entidad: "configuracion",
      entidadId: null, detalle: { claves: entradas.map(([k]) => k) },
    });
  });
}
```

- [ ] **Step 4: Ejecutar los tests (pasan)**

Run: `npm test -- mapa-admin`
Expected: PASS.

- [ ] **Step 5: Acción `guardarTextosAccion`**

En `acciones-mapa.ts`, agregar el import y la acción:

```ts
import { CLAVES_TEXTO, guardarTextos } from "@/db/consultas/mapa-admin";
```

```ts
export async function guardarTextosAccion(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    const valores: Record<string, string> = {};
    for (const { clave } of CLAVES_TEXTO) valores[clave] = texto(formData, clave);
    await guardarTextos(valores, usuarioId);
    return "/admin/mapa/textos";
  });
}
```

- [ ] **Step 6: Formulario y página**

Create `src/componentes/admin/mapa/FormularioTextos.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";

const claseCampo =
  "rounded-md border border-border bg-card px-3 py-2 text-foreground outline-none transition-colors focus:border-azul focus:ring-2 focus:ring-azul/20";

export function FormularioTextos({
  accion, campos, valores,
}: {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  campos: ReadonlyArray<{ clave: string; etiqueta: string; textarea?: boolean }>;
  valores: Record<string, string>;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const v = estado?.valores;
  const val = (c: string) => {
    const x = v?.[c];
    return (typeof x === "string" ? x : undefined) ?? valores[c] ?? "";
  };
  return (
    <form action={enviar} className="flex max-w-2xl flex-col gap-5">
      {campos.map((c) => (
        <label key={c.clave} className="flex flex-col gap-1 text-sm font-medium">
          {c.etiqueta}
          {c.textarea ? (
            <textarea name={c.clave} rows={2} defaultValue={val(c.clave)} className={claseCampo} />
          ) : (
            <input name={c.clave} defaultValue={val(c.clave)}
              className={`${claseCampo} ${c.clave === "patron_codigo" ? "font-mono" : ""}`} />
          )}
        </label>
      ))}
      {estado && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {estado.error}
        </p>
      )}
      <button type="submit" disabled={pendiente}
        className="self-start rounded-md bg-azul px-5 py-2 font-medium text-white hover:bg-azul-profundo disabled:opacity-60">
        {pendiente ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
```

Create `src/app/admin/(panel)/mapa/textos/page.tsx`:

```tsx
import type { Metadata } from "next";
import { guardarTextosAccion } from "@/app/admin/acciones-mapa";
import { FormularioTextos } from "@/componentes/admin/mapa/FormularioTextos";
import { CLAVES_TEXTO, obtenerTextos } from "@/db/consultas/mapa-admin";

export const metadata: Metadata = { title: "Textos institucionales — Administración SGC" };

export default async function PaginaTextos() {
  const valores = await obtenerTextos();
  return (
    <main>
      <h1 className="mb-2 font-display text-2xl font-semibold">Textos institucionales</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Se reflejan en el mapa público al guardar.
      </p>
      <FormularioTextos accion={guardarTextosAccion} campos={CLAVES_TEXTO} valores={valores} />
    </main>
  );
}
```

- [ ] **Step 7: Guard + lint + verificación**

En `tests/guardia.test.ts` agregar `guardarTextosAccion` al import de `acciones-mapa` y el
caso `["guardarTextosAccion", () => guardarTextosAccion(null, fd)]`.
Run: `npm run lint` → limpio. `npm test -- mapa-admin guardia` → PASS.
Manual: `/admin/mapa/textos` cambia el lema → recargar el mapa `/` y verlo cambiado.

- [ ] **Step 8: Commit**

```bash
git add src/db/consultas/mapa-admin.ts src/app/admin/acciones-mapa.ts \
  "src/app/admin/(panel)/mapa/textos" src/componentes/admin/mapa/FormularioTextos.tsx \
  tests/mapa-admin.test.ts tests/guardia.test.ts
git commit -m "feat: edicion de textos institucionales del mapa

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Periféricos (entradas · salidas · convenciones)

Tres listas del mismo tipo de fila (mismo patrón que tipos). Reusa el motor genérico y los
componentes de fila; agrega un selector de ícono compartido.

**Files:**
- Modify: `src/db/consultas/mapa-admin.ts` (CRUD de periféricos)
- Modify: `src/app/admin/acciones-mapa.ts` (acciones de periféricos)
- Create: `src/componentes/admin/mapa/SelectorIcono.tsx`
- Create: `src/componentes/admin/mapa/FormularioPeriferico.tsx`
- Create: `src/app/admin/(panel)/mapa/perifericos/page.tsx`
- Create: `src/app/admin/(panel)/mapa/perifericos/nuevo/page.tsx`
- Create: `src/app/admin/(panel)/mapa/perifericos/[id]/page.tsx`
- Modify: `tests/mapa-admin.test.ts`, `tests/guardia.test.ts`

**Interfaces:**
- Consumes: `NOMBRES_ICONO` (Task 1), `validarIcono` (Task 1), motor y componentes de fila
  (Tasks 2–3).
- Produces:
  - `type FilaPeriferico = { id: number; tipo: string; texto: string; icono: string | null; orden: number; activo: boolean }`
  - `listarPerifericos(): Promise<Record<"entrada"|"salida"|"convencion", FilaPeriferico[]>>`
  - `obtenerPeriferico(id): Promise<{ id: number; tipo: string; texto: string; icono: string | null } | null>`
  - `type DatosPeriferico = { tipo: string; texto: string; icono: string | null }`
  - `crearPeriferico(d, usuarioId): Promise<{ id: number }>`
  - `editarPeriferico(id, d, usuarioId): Promise<void>`
  - `crearPerifericoAccion(prev, fd)`, `editarPerifericoAccion(prev, fd)`

- [ ] **Step 1: Test de BD (falla)**

Agregar a `tests/mapa-admin.test.ts`:

```ts
import {
  crearPeriferico,
  editarPeriferico,
  listarPerifericos,
  obtenerPeriferico,
} from "@/db/consultas/mapa-admin";

describe("periféricos CRUD", () => {
  it("crea con orden al final de su tipo y edita", async () => {
    const { id } = await crearPeriferico(
      { tipo: "entrada", texto: "ZZ-entrada nueva", icono: "target" },
      usuarioId,
    );
    const grupos = await listarPerifericos();
    expect(grupos.entrada.some((f) => f.id === id)).toBe(true);
    await editarPeriferico(id, { tipo: "entrada", texto: "ZZ-entrada editada", icono: null }, usuarioId);
    const p = await obtenerPeriferico(id);
    expect(p).toMatchObject({ texto: "ZZ-entrada editada", icono: null });
    await sql()`DELETE FROM elementos_perifericos WHERE id = ${id}`;
  });

  it("rechaza tipo inválido", async () => {
    await expect(
      crearPeriferico({ tipo: "otro", texto: "ZZ-x", icono: null }, usuarioId),
    ).rejects.toThrow(/tipo/i);
  });
});
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npm test -- mapa-admin` → FAIL.

- [ ] **Step 3: Implementar el CRUD en `mapa-admin.ts`**

```ts
const TIPOS_PERIFERICO = ["entrada", "salida", "convencion"] as const;
type TipoPeriferico = (typeof TIPOS_PERIFERICO)[number];

export type FilaPeriferico = {
  id: number; tipo: string; texto: string;
  icono: string | null; orden: number; activo: boolean;
};

export async function listarPerifericos(): Promise<
  Record<TipoPeriferico, FilaPeriferico[]>
> {
  const sql = obtenerSql();
  const filas = await sql`SELECT id, tipo, texto, icono, orden, activo
    FROM elementos_perifericos ORDER BY tipo, orden`;
  const grupos: Record<TipoPeriferico, FilaPeriferico[]> = {
    entrada: [], salida: [], convencion: [],
  };
  for (const f of filas) {
    grupos[f.tipo as TipoPeriferico]?.push({
      id: f.id, tipo: f.tipo, texto: f.texto, icono: f.icono,
      orden: f.orden, activo: f.activo,
    });
  }
  return grupos;
}

export async function obtenerPeriferico(id: number) {
  const sql = obtenerSql();
  const [f] = await sql`SELECT id, tipo, texto, icono FROM elementos_perifericos WHERE id = ${id}`;
  if (!f) return null;
  return { id: f.id, tipo: f.tipo, texto: f.texto, icono: f.icono };
}

export type DatosPeriferico = { tipo: string; texto: string; icono: string | null };

function validarTipoPeriferico(tipo: string): TipoPeriferico {
  if (!(TIPOS_PERIFERICO as readonly string[]).includes(tipo)) {
    throw new Error("El tipo debe ser entrada, salida o convención");
  }
  return tipo as TipoPeriferico;
}

export async function crearPeriferico(
  d: DatosPeriferico,
  usuarioId: number,
): Promise<{ id: number }> {
  const tipo = validarTipoPeriferico(d.tipo);
  if (!d.texto.trim()) throw new Error("El texto es obligatorio");
  const sql = obtenerSql();
  return await sql.begin(async (tx) => {
    const orden = await siguienteOrden(tx, "elementos_perifericos", "tipo", tipo);
    const [p] = await tx`INSERT INTO elementos_perifericos (tipo, texto, icono, orden)
      VALUES (${tipo}, ${d.texto}, ${d.icono}, ${orden}) RETURNING id`;
    await registrarAuditoria(tx, {
      usuarioId, accion: "crear_periferico", entidad: "elementos_perifericos",
      entidadId: p.id, detalle: d,
    });
    return { id: p.id };
  });
}

export async function editarPeriferico(
  id: number,
  d: DatosPeriferico,
  usuarioId: number,
): Promise<void> {
  const tipo = validarTipoPeriferico(d.tipo);
  if (!d.texto.trim()) throw new Error("El texto es obligatorio");
  const sql = obtenerSql();
  await sql.begin(async (tx) => {
    const [p] = await tx`UPDATE elementos_perifericos
      SET tipo = ${tipo}, texto = ${d.texto}, icono = ${d.icono}
      WHERE id = ${id} RETURNING id`;
    if (!p) throw new Error("El elemento no existe");
    await registrarAuditoria(tx, {
      usuarioId, accion: "editar_periferico", entidad: "elementos_perifericos",
      entidadId: id, detalle: d,
    });
  });
}
```

- [ ] **Step 4: Ejecutar los tests (pasan)**

Run: `npm test -- mapa-admin` → PASS.

- [ ] **Step 5: Selector de ícono compartido**

Create `src/componentes/admin/mapa/SelectorIcono.tsx`:

```tsx
import { Icono, NOMBRES_ICONO } from "@/componentes/iconos";

// Selector de ícono restringido al catálogo (un nombre fuera de él se rechaza
// en el servidor). Muestra el ícono actual junto al desplegable.
export function SelectorIcono({
  nombre, actual, requerido,
}: {
  nombre: string; actual: string | null; requerido?: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className="grid size-9 place-items-center rounded-md border">
        <Icono nombre={actual} className="size-4.5" />
      </span>
      <select name={nombre} defaultValue={actual ?? ""} required={requerido}
        className="rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-azul focus:ring-2 focus:ring-azul/20">
        {!requerido && <option value="">(sin ícono)</option>}
        {NOMBRES_ICONO.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </span>
  );
}
```

- [ ] **Step 6: Formulario y páginas de periféricos**

Create `src/componentes/admin/mapa/FormularioPeriferico.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";
import { SelectorIcono } from "./SelectorIcono";

const claseCampo =
  "rounded-md border border-border bg-card px-3 py-2 text-foreground outline-none transition-colors focus:border-azul focus:ring-2 focus:ring-azul/20";

const TIPOS = [
  { valor: "entrada", etiqueta: "Entrada" },
  { valor: "salida", etiqueta: "Salida" },
  { valor: "convencion", etiqueta: "Convención" },
];

export function FormularioPeriferico({
  accion, id, valores,
}: {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  id?: number;
  valores?: { tipo: string; texto: string; icono: string | null };
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const v = estado?.valores;
  const val = (c: string): string | undefined => {
    const x = v?.[c];
    return typeof x === "string" ? x : Array.isArray(x) ? x[0] : undefined;
  };
  return (
    <form action={enviar} className="flex max-w-lg flex-col gap-5">
      {id && <input type="hidden" name="id" value={id} />}
      <label className="flex flex-col gap-1 text-sm font-medium">
        Tipo
        <select name="tipo" defaultValue={val("tipo") ?? valores?.tipo ?? "entrada"} className={claseCampo}>
          {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Texto
        <input name="texto" required defaultValue={val("texto") ?? valores?.texto} className={claseCampo} />
      </label>
      <div className="flex flex-col gap-1 text-sm font-medium">
        Ícono
        <SelectorIcono nombre="icono" actual={val("icono") ?? valores?.icono ?? null} />
      </div>
      {estado && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {estado.error}
        </p>
      )}
      <button type="submit" disabled={pendiente}
        className="self-start rounded-md bg-azul px-5 py-2 font-medium text-white hover:bg-azul-profundo disabled:opacity-60">
        {pendiente ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
```

Create `src/app/admin/(panel)/mapa/perifericos/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { BotonBorrar } from "@/componentes/admin/mapa/BotonBorrar";
import { BotonToggle } from "@/componentes/admin/mapa/BotonToggle";
import { BotonesOrden } from "@/componentes/admin/mapa/BotonesOrden";
import { Icono } from "@/componentes/iconos";
import { listarPerifericos } from "@/db/consultas/mapa-admin";

export const metadata: Metadata = { title: "Periféricos — Administración SGC" };

const TITULOS = {
  entrada: "Entradas del Sistema",
  salida: "Salidas del Sistema",
  convencion: "Convenciones",
} as const;

export default async function PaginaPerifericos() {
  const grupos = await listarPerifericos();
  return (
    <main className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Elementos periféricos</h1>
        <Link href="/admin/mapa/perifericos/nuevo"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Nuevo elemento
        </Link>
      </div>
      {(["entrada", "salida", "convencion"] as const).map((tipo) => (
        <section key={tipo}>
          <h2 className="mb-2 font-display text-lg font-semibold">{TITULOS[tipo]}</h2>
          <ul className="flex flex-col gap-2">
            {grupos[tipo].map((e, i) => (
              <li key={e.id}
                className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${e.activo ? "" : "border-dashed opacity-60"}`}>
                <BotonesOrden tabla="elementos_perifericos" id={e.id}
                  esPrimero={i === 0} esUltimo={i === grupos[tipo].length - 1} />
                <Icono nombre={e.icono} className="size-4 text-muted-foreground" />
                <Link href={`/admin/mapa/perifericos/${e.id}`} className="flex-1 hover:underline">
                  {e.texto}
                </Link>
                {!e.activo && <span className="text-xs text-muted-foreground">inactivo</span>}
                <BotonToggle tabla="elementos_perifericos" id={e.id} activo={e.activo} />
                <BotonBorrar tabla="elementos_perifericos" id={e.id} volverA="/admin/mapa/perifericos" />
              </li>
            ))}
            {grupos[tipo].length === 0 && (
              <li className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Sin elementos.
              </li>
            )}
          </ul>
        </section>
      ))}
    </main>
  );
}
```

Create `src/app/admin/(panel)/mapa/perifericos/nuevo/page.tsx`:

```tsx
import type { Metadata } from "next";
import { crearPerifericoAccion } from "@/app/admin/acciones-mapa";
import { FormularioPeriferico } from "@/componentes/admin/mapa/FormularioPeriferico";

export const metadata: Metadata = { title: "Nuevo periférico — Administración SGC" };

export default function PaginaNuevoPeriferico() {
  return (
    <main>
      <h1 className="mb-6 font-display text-2xl font-semibold">Nuevo elemento periférico</h1>
      <FormularioPeriferico accion={crearPerifericoAccion} />
    </main>
  );
}
```

Create `src/app/admin/(panel)/mapa/perifericos/[id]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { editarPerifericoAccion } from "@/app/admin/acciones-mapa";
import { FormularioPeriferico } from "@/componentes/admin/mapa/FormularioPeriferico";
import { obtenerPeriferico } from "@/db/consultas/mapa-admin";

export const metadata: Metadata = { title: "Editar periférico — Administración SGC" };

export default async function PaginaEditarPeriferico({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const p = await obtenerPeriferico(Number((await params).id));
  if (!p) notFound();
  return (
    <main>
      <h1 className="mb-6 font-display text-2xl font-semibold">Editar elemento periférico</h1>
      <FormularioPeriferico accion={editarPerifericoAccion} id={p.id} valores={p} />
    </main>
  );
}
```

- [ ] **Step 7: Acciones de periféricos**

En `acciones-mapa.ts` agregar imports (`crearPeriferico`, `editarPeriferico`,
`NOMBRES_ICONO` desde `@/componentes/iconos`, `validarIcono`) y:

```ts
function parsearPeriferico(formData: FormData) {
  const iconoBruto = texto(formData, "icono");
  return {
    tipo: texto(formData, "tipo"),
    texto: texto(formData, "texto"),
    icono: iconoBruto ? validarIcono(iconoBruto, NOMBRES_ICONO) : null,
  };
}

export async function crearPerifericoAccion(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    await crearPeriferico(parsearPeriferico(formData), usuarioId);
    return "/admin/mapa/perifericos";
  });
}

export async function editarPerifericoAccion(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    await editarPeriferico(idNumerico(formData, "id"), parsearPeriferico(formData), usuarioId);
    return "/admin/mapa/perifericos";
  });
}
```

(El objeto de `parsearPeriferico` usa la clave `texto` para el campo de texto; nota: la
función helper `texto(formData, ...)` y la propiedad `texto:` coexisten sin conflicto.)

- [ ] **Step 8: Guard + lint + verificación**

`tests/guardia.test.ts`: agregar `crearPerifericoAccion`, `editarPerifericoAccion` al
import y sus casos.
Run: `npm run lint` → limpio. `npm test -- mapa-admin guardia` → PASS.
Manual: `/admin/mapa/perifericos` crear una entrada con ícono, reordenar, desactivar →
verla desaparecer del mapa `/`.

- [ ] **Step 9: Commit**

```bash
git add src/db/consultas/mapa-admin.ts src/app/admin/acciones-mapa.ts \
  "src/app/admin/(panel)/mapa/perifericos" \
  src/componentes/admin/mapa/SelectorIcono.tsx \
  src/componentes/admin/mapa/FormularioPeriferico.tsx \
  tests/mapa-admin.test.ts tests/guardia.test.ts
git commit -m "feat: gestion de entradas, salidas y convenciones del mapa

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Macroprocesos (color, slug, banda + advertencia de huérfanos)

Primera capa del mapa. Introduce el componente `ConfirmarDesactivar` (reusado por procesos
y subprocesos) que muestra los documentos vigentes que quedarán sin ruta antes de
confirmar. Borrable solo si no tiene procesos.

**Files:**
- Modify: `src/db/consultas/mapa-admin.ts` (CRUD de macroprocesos + `docsAfectados`)
- Modify: `src/app/admin/acciones-mapa.ts` (acciones de macroprocesos)
- Create: `src/componentes/admin/mapa/ConfirmarDesactivar.tsx`
- Create: `src/componentes/admin/mapa/FormularioMacroproceso.tsx`
- Create: `src/app/admin/(panel)/mapa/page.tsx` (lista de macroprocesos por banda)
- Create: `src/app/admin/(panel)/mapa/macroprocesos/nuevo/page.tsx`
- Create: `src/app/admin/(panel)/mapa/macroprocesos/[id]/page.tsx`
- Modify: `tests/mapa-admin.test.ts`, `tests/guardia.test.ts`

**Interfaces:**
- Produces:
  - `type FilaMacro = { id: number; letra: string; nombre: string; banda: string; color: string; icono: string; slug: string; orden: number; activo: boolean; numProcesos: number; docsAfectados: string[] }`
  - `listarMacroprocesos(): Promise<FilaMacro[]>` (orden por banda, luego `orden`)
  - `obtenerMacroproceso(id): Promise<{ id; letra; nombre; banda; color; icono; slug } | null>`
  - `type DatosMacro = { letra: string; nombre: string; banda: string; color: string; icono: string; slug: string }`
  - `crearMacroproceso(d, usuarioId): Promise<{ id: number }>`
  - `editarMacroproceso(id, d, usuarioId): Promise<void>`
  - `crearMacroprocesoAccion(prev, fd)`, `editarMacroprocesoAccion(prev, fd)`
  - Componente `ConfirmarDesactivar` (props: `tabla`, `id`, `activo`, `afectados: string[]`)

- [ ] **Step 1: Test de BD (falla)**

Agregar a `tests/mapa-admin.test.ts`:

```ts
import {
  crearMacroproceso,
  editarMacroproceso,
  listarMacroprocesos,
  obtenerMacroproceso,
} from "@/db/consultas/mapa-admin";

describe("macroprocesos CRUD", () => {
  it("crea con slug/color normalizados y aparece en su banda", async () => {
    const { id } = await crearMacroproceso(
      { letra: "Z", nombre: "ZZ Macro Prueba", banda: "apoyo",
        color: "#1b4e8e", icono: "target", slug: "zz-macro-prueba" },
      usuarioId,
    );
    const m = await obtenerMacroproceso(id);
    expect(m).toMatchObject({ banda: "apoyo", color: "#1B4E8E", slug: "zz-macro-prueba" });
    const lista = await listarMacroprocesos();
    const fila = lista.find((f) => f.id === id);
    expect(fila).toMatchObject({ numProcesos: 0 });
    expect(Array.isArray(fila?.docsAfectados)).toBe(true);

    await editarMacroproceso(id, {
      letra: "Z", nombre: "ZZ Macro Editada", banda: "apoyo",
      color: "#2E9B47", icono: "users", slug: "zz-macro-prueba",
    }, usuarioId);
    const m2 = await obtenerMacroproceso(id);
    expect(m2?.nombre).toBe("ZZ Macro Editada");
    await sql()`DELETE FROM macroprocesos WHERE id = ${id}`;
  });

  it("rechaza color inválido", async () => {
    await expect(
      crearMacroproceso({ letra: "Z", nombre: "ZZ", banda: "apoyo", color: "rojo", icono: "target", slug: "zz" }, usuarioId),
    ).rejects.toThrow(/hex/i);
  });
});
```

Actualizar `limpiar()` para borrar `macroprocesos` de prueba:

```ts
  await sql()`DELETE FROM macroprocesos WHERE slug LIKE 'zz-%' OR letra = 'Z'`;
```

(Colocar este DELETE **antes** del de usuarios; los macros de prueba no tienen procesos, así
que no viola FK.)

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npm test -- mapa-admin` → FAIL.

- [ ] **Step 3: Implementar el CRUD en `mapa-admin.ts`**

Agregar imports de validadores al inicio (`validarBanda`, `validarColor`, `validarSlug`
ya se importarán; el ícono se valida en la action). Al final del módulo:

```ts
// Subconsulta reusable: códigos de documentos VIGENTES que quedarían sin ruta
// en el mapa si el nodo se desactiva. `filtroAsociacion` es una condición SQL
// sobre las asociaciones dp/subprocesos.
export type FilaMacro = {
  id: number; letra: string; nombre: string; banda: string; color: string;
  icono: string; slug: string; orden: number; activo: boolean;
  numProcesos: number; docsAfectados: string[];
};

export async function listarMacroprocesos(): Promise<FilaMacro[]> {
  const sql = obtenerSql();
  const filas = await sql`
    SELECT m.id, m.letra, m.nombre, m.banda, m.color, m.icono, m.slug, m.orden, m.activo,
      (SELECT count(*)::int FROM procesos p WHERE p.macroproceso_id = m.id) AS num_procesos,
      coalesce((
        SELECT json_agg(DISTINCT d.codigo ORDER BY d.codigo)
        FROM documentos d
        WHERE EXISTS (SELECT 1 FROM documento_versiones v
                      WHERE v.documento_id = d.id AND v.estado = 'vigente')
          AND EXISTS (
            SELECT 1 FROM documento_proceso dp
            LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
            JOIN procesos p ON p.id = coalesce(dp.proceso_id, s.proceso_id)
            WHERE dp.documento_id = d.id AND p.macroproceso_id = m.id
          )
      ), '[]') AS docs_afectados
    FROM macroprocesos m
    ORDER BY array_position(ARRAY['estrategicos','misionales','apoyo','evaluacion'], m.banda), m.orden`;
  return filas.map((f) => ({
    id: f.id, letra: f.letra, nombre: f.nombre, banda: f.banda, color: f.color,
    icono: f.icono, slug: f.slug, orden: f.orden, activo: f.activo,
    numProcesos: f.num_procesos, docsAfectados: f.docs_afectados as string[],
  }));
}

export async function obtenerMacroproceso(id: number) {
  const sql = obtenerSql();
  const [f] = await sql`SELECT id, letra, nombre, banda, color, icono, slug
    FROM macroprocesos WHERE id = ${id}`;
  if (!f) return null;
  return { id: f.id, letra: f.letra, nombre: f.nombre, banda: f.banda,
    color: f.color, icono: f.icono, slug: f.slug };
}

export type DatosMacro = {
  letra: string; nombre: string; banda: string;
  color: string; icono: string; slug: string;
};

export async function crearMacroproceso(
  d: DatosMacro,
  usuarioId: number,
): Promise<{ id: number }> {
  const datos = {
    ...d,
    banda: validarBanda(d.banda),
    color: validarColor(d.color),
    slug: validarSlug(d.slug),
    letra: d.letra.trim().toUpperCase(),
  };
  if (!datos.nombre.trim()) throw new Error("El nombre es obligatorio");
  const sql = obtenerSql();
  try {
    return await sql.begin(async (tx) => {
      const orden = await siguienteOrden(tx, "macroprocesos", "banda", datos.banda);
      const [m] = await tx`INSERT INTO macroprocesos (letra, nombre, slug, banda, color, icono, orden)
        VALUES (${datos.letra}, ${datos.nombre}, ${datos.slug}, ${datos.banda},
                ${datos.color}, ${datos.icono}, ${orden}) RETURNING id`;
      await registrarAuditoria(tx, {
        usuarioId, accion: "crear_macroproceso", entidad: "macroprocesos",
        entidadId: m.id, detalle: datos,
      });
      return { id: m.id };
    });
  } catch (err) {
    throw traducirUnico(err, "Ya existe un macroproceso con esa letra o slug");
  }
}

export async function editarMacroproceso(
  id: number,
  d: DatosMacro,
  usuarioId: number,
): Promise<void> {
  const datos = {
    ...d,
    banda: validarBanda(d.banda),
    color: validarColor(d.color),
    slug: validarSlug(d.slug),
    letra: d.letra.trim().toUpperCase(),
  };
  if (!datos.nombre.trim()) throw new Error("El nombre es obligatorio");
  const sql = obtenerSql();
  try {
    await sql.begin(async (tx) => {
      const [m] = await tx`UPDATE macroprocesos SET letra = ${datos.letra},
          nombre = ${datos.nombre}, slug = ${datos.slug}, banda = ${datos.banda},
          color = ${datos.color}, icono = ${datos.icono}
        WHERE id = ${id} RETURNING id`;
      if (!m) throw new Error("El macroproceso no existe");
      await registrarAuditoria(tx, {
        usuarioId, accion: "editar_macroproceso", entidad: "macroprocesos",
        entidadId: id, detalle: datos,
      });
    });
  } catch (err) {
    throw traducirUnico(err, "Ya existe un macroproceso con esa letra o slug");
  }
}
```

Nota: agregar `import { validarBanda, validarColor, validarPatronCodigo, validarSlug } from "@/lib/validaciones-mapa";` (unificar con el import ya agregado en la Task 4; dejar un
solo import con todos los validadores usados).

- [ ] **Step 4: Ejecutar los tests (pasan)**

Run: `npm test -- mapa-admin` → PASS.

- [ ] **Step 5: Componente `ConfirmarDesactivar`**

Create `src/componentes/admin/mapa/ConfirmarDesactivar.tsx`:

```tsx
import { alternarAccion } from "@/app/admin/acciones-mapa";
import type { Tabla } from "@/db/consultas/mapa-admin";

// Activar/desactivar para nodos del mapa. Al desactivar con documentos vigentes
// debajo, expande una advertencia con los códigos que dejarán de aparecer en el
// mapa (siguen vigentes y buscables) antes de confirmar.
export function ConfirmarDesactivar({
  tabla, id, activo, afectados,
}: {
  tabla: Tabla; id: number; activo: boolean; afectados: string[];
}) {
  if (!activo) {
    return (
      <form action={alternarAccion}>
        <input type="hidden" name="tabla" value={tabla} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="activo" value="true" />
        <button type="submit" className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted">
          Activar
        </button>
      </form>
    );
  }
  if (afectados.length === 0) {
    return (
      <form action={alternarAccion}>
        <input type="hidden" name="tabla" value={tabla} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="activo" value="false" />
        <button type="submit" className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted">
          Desactivar
        </button>
      </form>
    );
  }
  return (
    <details className="inline-block">
      <summary className="cursor-pointer rounded-md border border-amber-300 px-2.5 py-1 text-xs text-amber-800 hover:bg-amber-50">
        Desactivar…
      </summary>
      <div className="mt-2 max-w-sm rounded-md border border-amber-300 bg-amber-50 p-3 text-xs">
        <p className="mb-1 font-medium text-amber-900">
          ⚠ {afectados.length} documento(s) vigente(s) dejarán de aparecer en el mapa
          (seguirán vigentes y en el buscador):
        </p>
        <p className="mb-2 font-mono text-amber-800">{afectados.join(" · ")}</p>
        <form action={alternarAccion}>
          <input type="hidden" name="tabla" value={tabla} />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="activo" value="false" />
          <button type="submit"
            className="rounded-md bg-amber-600 px-2.5 py-1 font-medium text-white hover:bg-amber-700">
            Desactivar igual
          </button>
        </form>
      </div>
    </details>
  );
}
```

- [ ] **Step 6: Formulario de macroproceso y páginas**

Create `src/componentes/admin/mapa/FormularioMacroproceso.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";
import { SelectorIcono } from "./SelectorIcono";

const claseCampo =
  "rounded-md border border-border bg-card px-3 py-2 text-foreground outline-none transition-colors focus:border-azul focus:ring-2 focus:ring-azul/20";

const BANDAS = [
  { valor: "estrategicos", etiqueta: "Estratégicos" },
  { valor: "misionales", etiqueta: "Misionales" },
  { valor: "apoyo", etiqueta: "Apoyo" },
  { valor: "evaluacion", etiqueta: "Evaluación y mejora" },
];

export function FormularioMacroproceso({
  accion, id, valores,
}: {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  id?: number;
  valores?: { letra: string; nombre: string; banda: string; color: string; icono: string; slug: string };
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const v = estado?.valores;
  const val = (c: string): string | undefined => {
    const x = v?.[c];
    return typeof x === "string" ? x : Array.isArray(x) ? x[0] : undefined;
  };
  return (
    <form action={enviar} className="flex max-w-xl flex-col gap-5">
      {id && <input type="hidden" name="id" value={id} />}
      <div className="grid gap-4 sm:grid-cols-[6rem_1fr]">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Letra
          <input name="letra" required maxLength={1} defaultValue={val("letra") ?? valores?.letra}
            className={`${claseCampo} uppercase`} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nombre
          <input name="nombre" required defaultValue={val("nombre") ?? valores?.nombre} className={claseCampo} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Banda
        <select name="banda" defaultValue={val("banda") ?? valores?.banda ?? "misionales"} className={claseCampo}>
          {BANDAS.map((b) => <option key={b.valor} value={b.valor}>{b.etiqueta}</option>)}
        </select>
      </label>
      <div className="flex gap-6">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Color
          <input type="color" name="color" defaultValue={val("color") ?? valores?.color ?? "#1B4E8E"}
            className="h-10 w-20 rounded-md border" />
        </label>
        <div className="flex flex-col gap-1 text-sm font-medium">
          Ícono
          <SelectorIcono nombre="icono" actual={val("icono") ?? valores?.icono ?? null} requerido />
        </div>
      </div>
      <details>
        <summary className="cursor-pointer text-sm text-muted-foreground">Opciones avanzadas</summary>
        <label className="mt-2 flex flex-col gap-1 text-sm font-medium">
          Slug (URL) — cambiarlo rompe enlaces existentes
          <input name="slug" defaultValue={val("slug") ?? valores?.slug} placeholder="se genera del nombre"
            className={`${claseCampo} font-mono`} />
        </label>
      </details>
      {estado && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {estado.error}
        </p>
      )}
      <button type="submit" disabled={pendiente}
        className="self-start rounded-md bg-azul px-5 py-2 font-medium text-white hover:bg-azul-profundo disabled:opacity-60">
        {pendiente ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
```

Create `src/app/admin/(panel)/mapa/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { BotonBorrar } from "@/componentes/admin/mapa/BotonBorrar";
import { BotonesOrden } from "@/componentes/admin/mapa/BotonesOrden";
import { ConfirmarDesactivar } from "@/componentes/admin/mapa/ConfirmarDesactivar";
import { Icono } from "@/componentes/iconos";
import { listarMacroprocesos } from "@/db/consultas/mapa-admin";

export const metadata: Metadata = { title: "Editor del mapa — Administración SGC" };

const BANDAS: Record<string, string> = {
  estrategicos: "Procesos Estratégicos",
  misionales: "Procesos Misionales",
  apoyo: "Procesos de Apoyo",
  evaluacion: "Evaluación y Mejora",
};

export default async function PaginaMapa() {
  const macros = await listarMacroprocesos();
  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Editor del mapa</h1>
        <div className="flex gap-2 text-sm">
          <Link href="/admin/mapa/perifericos" className="rounded-md border px-3 py-2 hover:bg-muted">Periféricos</Link>
          <Link href="/admin/mapa/textos" className="rounded-md border px-3 py-2 hover:bg-muted">Textos</Link>
          <Link href="/admin/mapa/vista-previa" className="rounded-md border px-3 py-2 hover:bg-muted">Vista previa</Link>
          <Link href="/admin/mapa/macroprocesos/nuevo" className="rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground">
            Nuevo macroproceso
          </Link>
        </div>
      </div>
      {(["estrategicos", "misionales", "apoyo", "evaluacion"] as const).map((banda) => {
        const grupo = macros.filter((m) => m.banda === banda);
        return (
          <section key={banda}>
            <h2 className="mb-2 font-display text-lg font-semibold">{BANDAS[banda]}</h2>
            <ul className="flex flex-col gap-2">
              {grupo.map((m, i) => (
                <li key={m.id}
                  className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${m.activo ? "" : "border-dashed opacity-60"}`}>
                  <BotonesOrden tabla="macroprocesos" id={m.id} esPrimero={i === 0} esUltimo={i === grupo.length - 1} />
                  <span className="grid size-7 place-items-center rounded-md text-white" style={{ background: m.color }}>
                    <Icono nombre={m.icono} className="size-4" />
                  </span>
                  <Link href={`/admin/mapa/macroprocesos/${m.id}`} className="flex-1 font-medium hover:underline">
                    <span aria-hidden="true">{m.letra}. </span>{m.nombre}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {m.numProcesos} procesos{m.activo ? "" : " · inactivo"}
                  </span>
                  <ConfirmarDesactivar tabla="macroprocesos" id={m.id} activo={m.activo} afectados={m.docsAfectados} />
                  {m.numProcesos === 0 && (
                    <BotonBorrar tabla="macroprocesos" id={m.id} volverA="/admin/mapa" />
                  )}
                </li>
              ))}
              {grupo.length === 0 && (
                <li className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Sin macroprocesos.</li>
              )}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
```

Create `src/app/admin/(panel)/mapa/macroprocesos/nuevo/page.tsx`:

```tsx
import type { Metadata } from "next";
import { crearMacroprocesoAccion } from "@/app/admin/acciones-mapa";
import { FormularioMacroproceso } from "@/componentes/admin/mapa/FormularioMacroproceso";

export const metadata: Metadata = { title: "Nuevo macroproceso — Administración SGC" };

export default function PaginaNuevoMacroproceso() {
  return (
    <main>
      <h1 className="mb-6 font-display text-2xl font-semibold">Nuevo macroproceso</h1>
      <FormularioMacroproceso accion={crearMacroprocesoAccion} />
    </main>
  );
}
```

Create `src/app/admin/(panel)/mapa/macroprocesos/[id]/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { editarMacroprocesoAccion } from "@/app/admin/acciones-mapa";
import { FormularioMacroproceso } from "@/componentes/admin/mapa/FormularioMacroproceso";
import { obtenerMacroproceso } from "@/db/consultas/mapa-admin";

export const metadata: Metadata = { title: "Editar macroproceso — Administración SGC" };

export default async function PaginaEditarMacroproceso({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const m = await obtenerMacroproceso(Number((await params).id));
  if (!m) notFound();
  return (
    <main>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Editar macroproceso</h1>
        <Link href={`/admin/mapa/procesos/nuevo?macro=${m.id}`}
          className="rounded-md border px-3 py-2 text-sm hover:bg-muted">
          + Proceso en este macroproceso
        </Link>
      </div>
      <FormularioMacroproceso accion={editarMacroprocesoAccion} id={m.id} valores={m} />
      <p className="mt-6 text-sm text-muted-foreground">
        Los procesos de este macroproceso se gestionan desde el
        <Link href="/admin/mapa" className="ml-1 underline">editor del mapa</Link>.
      </p>
    </main>
  );
}
```

(La lista de procesos por macroproceso se agrega en la Task 7; aquí el enlace "+ Proceso"
ya deja el `?macro=` listo.)

- [ ] **Step 7: Acciones de macroprocesos**

En `acciones-mapa.ts` agregar imports (`crearMacroproceso`, `editarMacroproceso`) y:

```ts
function parsearMacroproceso(formData: FormData) {
  const nombre = texto(formData, "nombre");
  const slugManual = texto(formData, "slug");
  return {
    letra: texto(formData, "letra"),
    nombre,
    banda: texto(formData, "banda"),
    color: texto(formData, "color"),
    icono: validarIcono(texto(formData, "icono"), NOMBRES_ICONO),
    slug: slugManual || generarSlug(nombre),
  };
}

export async function crearMacroprocesoAccion(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    await crearMacroproceso(parsearMacroproceso(formData), usuarioId);
    return "/admin/mapa";
  });
}

export async function editarMacroprocesoAccion(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    await editarMacroproceso(idNumerico(formData, "id"), parsearMacroproceso(formData), usuarioId);
    return "/admin/mapa";
  });
}
```

Agregar `import { generarSlug } from "@/lib/slug";` al inicio de `acciones-mapa.ts`.

- [ ] **Step 8: Guard + lint + verificación**

`tests/guardia.test.ts`: agregar `crearMacroprocesoAccion`, `editarMacroprocesoAccion` al
import y sus casos.
Run: `npm run lint` → limpio. `npm test -- mapa-admin guardia` → PASS.
Manual: `/admin/mapa` reordenar macroprocesos dentro de una banda, cambiar color/ícono y
verlo en `/`; desactivar uno con procesos que tienen documentos vigentes → aparece la
advertencia con los códigos.

- [ ] **Step 9: Commit**

```bash
git add src/db/consultas/mapa-admin.ts src/app/admin/acciones-mapa.ts \
  "src/app/admin/(panel)/mapa/page.tsx" "src/app/admin/(panel)/mapa/macroprocesos" \
  src/componentes/admin/mapa/ConfirmarDesactivar.tsx \
  src/componentes/admin/mapa/FormularioMacroproceso.tsx \
  tests/mapa-admin.test.ts tests/guardia.test.ts
git commit -m "feat: editor de macroprocesos con color, banda y advertencia de huerfanos

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Procesos (⭐ criterio de aceptación de la fase)

Segunda capa. **Aquí se cumple** "crear un proceso desde el panel y verlo en el mapa
público sin despliegue". La lista de procesos vive en la página de edición de su
macroproceso. Borrable solo si no tiene subprocesos ni documentos.

**Files:**
- Modify: `src/db/consultas/mapa-admin.ts` (CRUD de procesos + `listarProcesos`)
- Modify: `src/app/admin/acciones-mapa.ts` (acciones de procesos)
- Create: `src/componentes/admin/mapa/FormularioProceso.tsx`
- Create: `src/componentes/admin/mapa/ListaProcesos.tsx` (fragmento de lista reusado)
- Modify: `src/app/admin/(panel)/mapa/macroprocesos/[id]/page.tsx` (incrustar lista de procesos)
- Create: `src/app/admin/(panel)/mapa/procesos/nuevo/page.tsx`
- Create: `src/app/admin/(panel)/mapa/procesos/[id]/page.tsx`
- Modify: `tests/mapa-admin.test.ts`, `tests/guardia.test.ts`

**Interfaces:**
- Produces:
  - `type FilaProceso = { id: number; nombre: string; sigla: string; icono: string; slug: string; orden: number; activo: boolean; numSubprocesos: number; numDocs: number; docsAfectados: string[] }`
  - `listarProcesos(macroprocesoId: number): Promise<FilaProceso[]>`
  - `obtenerProceso(id): Promise<{ id; macroprocesoId; nombre; sigla; icono; descripcion; slug } | null>`
  - `type DatosProceso = { macroprocesoId: number; nombre: string; sigla: string; icono: string; descripcion: string | null; slug: string }`
  - `crearProceso(d, usuarioId): Promise<{ id: number }>`
  - `editarProceso(id, d, usuarioId): Promise<void>`
  - `crearProcesoAccion(prev, fd)`, `editarProcesoAccion(prev, fd)`

- [ ] **Step 1: Test de BD (falla)**

Agregar a `tests/mapa-admin.test.ts`. Necesita un macroproceso padre real; usa el primero
del seed:

```ts
import {
  crearProceso,
  editarProceso,
  listarProcesos,
  obtenerProceso,
} from "@/db/consultas/mapa-admin";

describe("procesos CRUD", () => {
  it("crea bajo un macroproceso, aparece en su lista y edita", async () => {
    const [macro] = await sql()`SELECT id FROM macroprocesos ORDER BY orden LIMIT 1`;
    const { id } = await crearProceso({
      macroprocesoId: macro.id, nombre: "ZZ Proceso Prueba", sigla: "ZZP",
      icono: "target", descripcion: null, slug: "zz-proceso-prueba",
    }, usuarioId);
    const lista = await listarProcesos(macro.id);
    const fila = lista.find((f) => f.id === id);
    expect(fila).toMatchObject({ sigla: "ZZP", numSubprocesos: 0, numDocs: 0 });

    await editarProceso(id, {
      macroprocesoId: macro.id, nombre: "ZZ Proceso Editado", sigla: "ZZQ",
      icono: "users", descripcion: "desc", slug: "zz-proceso-prueba",
    }, usuarioId);
    const p = await obtenerProceso(id);
    expect(p).toMatchObject({ sigla: "ZZQ", descripcion: "desc" });
    await sql()`DELETE FROM procesos WHERE id = ${id}`;
  });
});
```

Actualizar `limpiar()` para borrar procesos de prueba **antes** que macroprocesos/usuarios:

```ts
  await sql()`DELETE FROM procesos WHERE slug LIKE 'zz-%'`;
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npm test -- mapa-admin` → FAIL.

- [ ] **Step 3: Implementar el CRUD en `mapa-admin.ts`**

```ts
export type FilaProceso = {
  id: number; nombre: string; sigla: string; icono: string; slug: string;
  orden: number; activo: boolean; numSubprocesos: number; numDocs: number;
  docsAfectados: string[];
};

export async function listarProcesos(macroprocesoId: number): Promise<FilaProceso[]> {
  const sql = obtenerSql();
  const filas = await sql`
    SELECT p.id, p.nombre, p.sigla, p.icono, p.slug, p.orden, p.activo,
      (SELECT count(*)::int FROM subprocesos s WHERE s.proceso_id = p.id) AS num_subprocesos,
      (SELECT count(*)::int FROM documento_proceso dp WHERE dp.proceso_id = p.id) AS num_docs,
      coalesce((
        SELECT json_agg(DISTINCT d.codigo ORDER BY d.codigo)
        FROM documentos d
        WHERE EXISTS (SELECT 1 FROM documento_versiones v
                      WHERE v.documento_id = d.id AND v.estado = 'vigente')
          AND EXISTS (
            SELECT 1 FROM documento_proceso dp
            LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
            WHERE dp.documento_id = d.id AND (dp.proceso_id = p.id OR s.proceso_id = p.id)
          )
      ), '[]') AS docs_afectados
    FROM procesos p WHERE p.macroproceso_id = ${macroprocesoId}
    ORDER BY p.orden`;
  return filas.map((f) => ({
    id: f.id, nombre: f.nombre, sigla: f.sigla, icono: f.icono, slug: f.slug,
    orden: f.orden, activo: f.activo, numSubprocesos: f.num_subprocesos,
    numDocs: f.num_docs, docsAfectados: f.docs_afectados as string[],
  }));
}

export async function obtenerProceso(id: number) {
  const sql = obtenerSql();
  const [f] = await sql`SELECT id, macroproceso_id, nombre, sigla, icono, descripcion, slug
    FROM procesos WHERE id = ${id}`;
  if (!f) return null;
  return { id: f.id, macroprocesoId: f.macroproceso_id, nombre: f.nombre,
    sigla: f.sigla, icono: f.icono, descripcion: f.descripcion, slug: f.slug };
}

export type DatosProceso = {
  macroprocesoId: number; nombre: string; sigla: string;
  icono: string; descripcion: string | null; slug: string;
};

export async function crearProceso(
  d: DatosProceso,
  usuarioId: number,
): Promise<{ id: number }> {
  const datos = { ...d, sigla: validarSigla(d.sigla), slug: validarSlug(d.slug) };
  if (!datos.nombre.trim()) throw new Error("El nombre es obligatorio");
  const sql = obtenerSql();
  try {
    return await sql.begin(async (tx) => {
      const orden = await siguienteOrden(tx, "procesos", "macroproceso_id", datos.macroprocesoId);
      const [p] = await tx`INSERT INTO procesos
          (macroproceso_id, nombre, sigla, slug, descripcion, icono, orden)
        VALUES (${datos.macroprocesoId}, ${datos.nombre}, ${datos.sigla}, ${datos.slug},
                ${datos.descripcion}, ${datos.icono}, ${orden}) RETURNING id`;
      await registrarAuditoria(tx, {
        usuarioId, accion: "crear_proceso", entidad: "procesos",
        entidadId: p.id, detalle: datos,
      });
      return { id: p.id };
    });
  } catch (err) {
    throw traducirUnico(err, "Ya existe un proceso con esa sigla o slug");
  }
}

export async function editarProceso(
  id: number,
  d: DatosProceso,
  usuarioId: number,
): Promise<void> {
  const datos = { ...d, sigla: validarSigla(d.sigla), slug: validarSlug(d.slug) };
  if (!datos.nombre.trim()) throw new Error("El nombre es obligatorio");
  const sql = obtenerSql();
  try {
    await sql.begin(async (tx) => {
      const [p] = await tx`UPDATE procesos SET nombre = ${datos.nombre},
          sigla = ${datos.sigla}, slug = ${datos.slug}, descripcion = ${datos.descripcion},
          icono = ${datos.icono}
        WHERE id = ${id} RETURNING id`;
      if (!p) throw new Error("El proceso no existe");
      await registrarAuditoria(tx, {
        usuarioId, accion: "editar_proceso", entidad: "procesos",
        entidadId: id, detalle: datos,
      });
    });
  } catch (err) {
    throw traducirUnico(err, "Ya existe un proceso con esa sigla o slug");
  }
}
```

(La edición de proceso no cambia su macroproceso: se mantiene simple. Mover un proceso de
macroproceso queda fuera de alcance.)

- [ ] **Step 4: Ejecutar los tests (pasan)**

Run: `npm test -- mapa-admin` → PASS.

- [ ] **Step 5: Componente `ListaProcesos` (fragmento reusable)**

Create `src/componentes/admin/mapa/ListaProcesos.tsx`:

```tsx
import Link from "next/link";
import { BotonBorrar } from "@/componentes/admin/mapa/BotonBorrar";
import { BotonesOrden } from "@/componentes/admin/mapa/BotonesOrden";
import { ConfirmarDesactivar } from "@/componentes/admin/mapa/ConfirmarDesactivar";
import { Icono } from "@/componentes/iconos";
import type { FilaProceso } from "@/db/consultas/mapa-admin";

export function ListaProcesos({
  procesos, volverA,
}: {
  procesos: FilaProceso[]; volverA: string;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {procesos.map((p, i) => (
        <li key={p.id}
          className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${p.activo ? "" : "border-dashed opacity-60"}`}>
          <BotonesOrden tabla="procesos" id={p.id} esPrimero={i === 0} esUltimo={i === procesos.length - 1} />
          <Icono nombre={p.icono} className="size-4 text-muted-foreground" />
          <span className="font-mono text-xs">{p.sigla}</span>
          <Link href={`/admin/mapa/procesos/${p.id}`} className="flex-1 font-medium hover:underline">
            {p.nombre}
          </Link>
          <span className="text-xs text-muted-foreground">
            {p.numSubprocesos} subprocesos · {p.numDocs} docs{p.activo ? "" : " · inactivo"}
          </span>
          <ConfirmarDesactivar tabla="procesos" id={p.id} activo={p.activo} afectados={p.docsAfectados} />
          {p.numSubprocesos === 0 && p.numDocs === 0 && (
            <BotonBorrar tabla="procesos" id={p.id} volverA={volverA} />
          )}
        </li>
      ))}
      {procesos.length === 0 && (
        <li className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Sin procesos.</li>
      )}
    </ul>
  );
}
```

- [ ] **Step 6: Incrustar la lista de procesos en la página del macroproceso**

Reemplazar en `src/app/admin/(panel)/mapa/macroprocesos/[id]/page.tsx` el párrafo final
("Los procesos de este macroproceso…") por la lista real. Agregar imports:

```tsx
import { ListaProcesos } from "@/componentes/admin/mapa/ListaProcesos";
import { listarProcesos, obtenerMacroproceso } from "@/db/consultas/mapa-admin";
```

y en el cuerpo, tras cargar `m`:

```tsx
  const procesos = await listarProcesos(m.id);
```

y al final del `<main>`, en lugar del párrafo:

```tsx
      <section className="mt-8">
        <h2 className="mb-2 font-display text-lg font-semibold">Procesos</h2>
        <ListaProcesos procesos={procesos} volverA={`/admin/mapa/macroprocesos/${m.id}`} />
      </section>
```

- [ ] **Step 7: Formulario de proceso y páginas**

Create `src/componentes/admin/mapa/FormularioProceso.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";
import { SelectorIcono } from "./SelectorIcono";

const claseCampo =
  "rounded-md border border-border bg-card px-3 py-2 text-foreground outline-none transition-colors focus:border-azul focus:ring-2 focus:ring-azul/20";

export function FormularioProceso({
  accion, macroprocesoId, id, valores,
}: {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  macroprocesoId: number;
  id?: number;
  valores?: { nombre: string; sigla: string; icono: string; descripcion: string | null; slug: string };
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const v = estado?.valores;
  const val = (c: string): string | undefined => {
    const x = v?.[c];
    return typeof x === "string" ? x : Array.isArray(x) ? x[0] : undefined;
  };
  return (
    <form action={enviar} className="flex max-w-xl flex-col gap-5">
      <input type="hidden" name="macroprocesoId" value={macroprocesoId} />
      {id && <input type="hidden" name="id" value={id} />}
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nombre
          <input name="nombre" required defaultValue={val("nombre") ?? valores?.nombre} className={claseCampo} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Sigla (2–4 letras)
          <input name="sigla" required defaultValue={val("sigla") ?? valores?.sigla}
            className={`${claseCampo} font-mono uppercase`} />
        </label>
      </div>
      <div className="flex flex-col gap-1 text-sm font-medium">
        Ícono
        <SelectorIcono nombre="icono" actual={val("icono") ?? valores?.icono ?? null} requerido />
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Descripción (opcional)
        <textarea name="descripcion" rows={2} defaultValue={val("descripcion") ?? valores?.descripcion ?? ""} className={claseCampo} />
      </label>
      <p className="text-xs text-muted-foreground">
        Cambiar la sigla no reescribe los códigos ya asignados a documentos existentes.
      </p>
      <details>
        <summary className="cursor-pointer text-sm text-muted-foreground">Opciones avanzadas</summary>
        <label className="mt-2 flex flex-col gap-1 text-sm font-medium">
          Slug (URL) — cambiarlo rompe enlaces existentes
          <input name="slug" defaultValue={val("slug") ?? valores?.slug} placeholder="se genera del nombre"
            className={`${claseCampo} font-mono`} />
        </label>
      </details>
      {estado && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {estado.error}
        </p>
      )}
      <button type="submit" disabled={pendiente}
        className="self-start rounded-md bg-azul px-5 py-2 font-medium text-white hover:bg-azul-profundo disabled:opacity-60">
        {pendiente ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
```

Create `src/app/admin/(panel)/mapa/procesos/nuevo/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { crearProcesoAccion } from "@/app/admin/acciones-mapa";
import { FormularioProceso } from "@/componentes/admin/mapa/FormularioProceso";
import { obtenerMacroproceso } from "@/db/consultas/mapa-admin";

export const metadata: Metadata = { title: "Nuevo proceso — Administración SGC" };

export default async function PaginaNuevoProceso({
  searchParams,
}: {
  searchParams: Promise<{ macro?: string }>;
}) {
  const macroId = Number((await searchParams).macro);
  if (!Number.isInteger(macroId) || macroId <= 0) notFound();
  const macro = await obtenerMacroproceso(macroId);
  if (!macro) notFound();
  return (
    <main>
      <h1 className="mb-2 font-display text-2xl font-semibold">Nuevo proceso</h1>
      <p className="mb-6 text-sm text-muted-foreground">En {macro.nombre}</p>
      <FormularioProceso accion={crearProcesoAccion} macroprocesoId={macro.id} />
    </main>
  );
}
```

Create `src/app/admin/(panel)/mapa/procesos/[id]/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { editarProcesoAccion } from "@/app/admin/acciones-mapa";
import { FormularioProceso } from "@/componentes/admin/mapa/FormularioProceso";
import { obtenerProceso } from "@/db/consultas/mapa-admin";

export const metadata: Metadata = { title: "Editar proceso — Administración SGC" };

export default async function PaginaEditarProceso({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const p = await obtenerProceso(Number((await params).id));
  if (!p) notFound();
  return (
    <main>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Editar proceso</h1>
        <Link href={`/admin/mapa/subprocesos/nuevo?proc=${p.id}`}
          className="rounded-md border px-3 py-2 text-sm hover:bg-muted">
          + Subproceso
        </Link>
      </div>
      <FormularioProceso accion={editarProcesoAccion} macroprocesoId={p.macroprocesoId} id={p.id} valores={p} />
    </main>
  );
}
```

(La lista de subprocesos se incrusta en la Task 8.)

- [ ] **Step 8: Acciones de procesos**

En `acciones-mapa.ts` agregar imports (`crearProceso`, `editarProceso`) y:

```ts
function parsearProceso(formData: FormData) {
  const nombre = texto(formData, "nombre");
  const slugManual = texto(formData, "slug");
  return {
    macroprocesoId: idNumerico(formData, "macroprocesoId"),
    nombre,
    sigla: texto(formData, "sigla"),
    icono: validarIcono(texto(formData, "icono"), NOMBRES_ICONO),
    descripcion: textoONulo(formData, "descripcion"),
    slug: slugManual || generarSlug(nombre),
  };
}

export async function crearProcesoAccion(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    const { id } = await crearProceso(parsearProceso(formData), usuarioId);
    void id;
    return `/admin/mapa/macroprocesos/${idNumerico(formData, "macroprocesoId")}`;
  });
}

export async function editarProcesoAccion(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    await editarProceso(idNumerico(formData, "id"), parsearProceso(formData), usuarioId);
    return `/admin/mapa/macroprocesos/${idNumerico(formData, "macroprocesoId")}`;
  });
}
```

Agregar `textoONulo` al import de `@/app/admin/comun`.

- [ ] **Step 9: Guard + lint + verificación (criterio de aceptación)**

`tests/guardia.test.ts`: agregar `crearProcesoAccion`, `editarProcesoAccion` al import y
sus casos.
Run: `npm run lint` → limpio. `npm test -- mapa-admin guardia` → PASS.
**Manual (criterio de aceptación de la fase):** en `/admin/mapa` entrar a un macroproceso,
"+ Proceso", crear "Vigilancia Epidemiológica" sigla `VEP` → abrir `/` en otra pestaña y
**verlo aparecer en el mapa público sin reiniciar nada**. Reordenar procesos con ↑↓;
desactivar uno con documentos vigentes → ver la advertencia.

- [ ] **Step 10: Commit**

```bash
git add src/db/consultas/mapa-admin.ts src/app/admin/acciones-mapa.ts \
  "src/app/admin/(panel)/mapa/procesos" "src/app/admin/(panel)/mapa/macroprocesos/[id]/page.tsx" \
  src/componentes/admin/mapa/FormularioProceso.tsx \
  src/componentes/admin/mapa/ListaProcesos.tsx \
  tests/mapa-admin.test.ts tests/guardia.test.ts
git commit -m "feat: editor de procesos (crear un proceso y verlo en el mapa publico)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Subprocesos (cierre de la jerarquía)

Tercera capa. Campos mínimos (nombre, slug). La lista vive en la página de edición de su
proceso. Borrable solo si no tiene documentos asociados.

**Files:**
- Modify: `src/db/consultas/mapa-admin.ts` (CRUD de subprocesos + `listarSubprocesos`)
- Modify: `src/app/admin/acciones-mapa.ts` (acciones de subprocesos)
- Create: `src/componentes/admin/mapa/FormularioSubproceso.tsx`
- Create: `src/componentes/admin/mapa/ListaSubprocesos.tsx`
- Modify: `src/app/admin/(panel)/mapa/procesos/[id]/page.tsx` (incrustar lista)
- Create: `src/app/admin/(panel)/mapa/subprocesos/nuevo/page.tsx`
- Create: `src/app/admin/(panel)/mapa/subprocesos/[id]/page.tsx`
- Modify: `tests/mapa-admin.test.ts`, `tests/guardia.test.ts`

**Interfaces:**
- Produces:
  - `type FilaSubproceso = { id: number; nombre: string; slug: string; orden: number; activo: boolean; numDocs: number; docsAfectados: string[] }`
  - `listarSubprocesos(procesoId: number): Promise<FilaSubproceso[]>`
  - `obtenerSubproceso(id): Promise<{ id; procesoId; nombre; slug } | null>`
  - `type DatosSubproceso = { procesoId: number; nombre: string; slug: string }`
  - `crearSubproceso(d, usuarioId): Promise<{ id: number }>`
  - `editarSubproceso(id, d, usuarioId): Promise<void>`
  - `crearSubprocesoAccion(prev, fd)`, `editarSubprocesoAccion(prev, fd)`

- [ ] **Step 1: Test de BD (falla)**

Agregar a `tests/mapa-admin.test.ts`:

```ts
import {
  crearSubproceso,
  editarSubproceso,
  listarSubprocesos,
  obtenerSubproceso,
} from "@/db/consultas/mapa-admin";

describe("subprocesos CRUD", () => {
  it("crea bajo un proceso, aparece en su lista y edita", async () => {
    const [proc] = await sql()`SELECT id FROM procesos ORDER BY orden LIMIT 1`;
    const { id } = await crearSubproceso(
      { procesoId: proc.id, nombre: "ZZ Subproceso Prueba", slug: "zz-sub-prueba" },
      usuarioId,
    );
    const lista = await listarSubprocesos(proc.id);
    expect(lista.some((f) => f.id === id)).toBe(true);
    await editarSubproceso(id, { procesoId: proc.id, nombre: "ZZ Sub Editado", slug: "zz-sub-prueba" }, usuarioId);
    const s = await obtenerSubproceso(id);
    expect(s?.nombre).toBe("ZZ Sub Editado");
    await sql()`DELETE FROM subprocesos WHERE id = ${id}`;
  });
});
```

Actualizar `limpiar()` para borrar subprocesos de prueba **antes** que procesos:

```ts
  await sql()`DELETE FROM subprocesos WHERE slug LIKE 'zz-%'`;
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npm test -- mapa-admin` → FAIL.

- [ ] **Step 3: Implementar el CRUD en `mapa-admin.ts`**

```ts
export type FilaSubproceso = {
  id: number; nombre: string; slug: string; orden: number; activo: boolean;
  numDocs: number; docsAfectados: string[];
};

export async function listarSubprocesos(procesoId: number): Promise<FilaSubproceso[]> {
  const sql = obtenerSql();
  const filas = await sql`
    SELECT s.id, s.nombre, s.slug, s.orden, s.activo,
      (SELECT count(*)::int FROM documento_proceso dp WHERE dp.subproceso_id = s.id) AS num_docs,
      coalesce((
        SELECT json_agg(DISTINCT d.codigo ORDER BY d.codigo)
        FROM documentos d
        WHERE EXISTS (SELECT 1 FROM documento_versiones v
                      WHERE v.documento_id = d.id AND v.estado = 'vigente')
          AND EXISTS (SELECT 1 FROM documento_proceso dp
                      WHERE dp.documento_id = d.id AND dp.subproceso_id = s.id)
      ), '[]') AS docs_afectados
    FROM subprocesos s WHERE s.proceso_id = ${procesoId}
    ORDER BY s.orden`;
  return filas.map((f) => ({
    id: f.id, nombre: f.nombre, slug: f.slug, orden: f.orden, activo: f.activo,
    numDocs: f.num_docs, docsAfectados: f.docs_afectados as string[],
  }));
}

export async function obtenerSubproceso(id: number) {
  const sql = obtenerSql();
  const [f] = await sql`SELECT id, proceso_id, nombre, slug FROM subprocesos WHERE id = ${id}`;
  if (!f) return null;
  return { id: f.id, procesoId: f.proceso_id, nombre: f.nombre, slug: f.slug };
}

export type DatosSubproceso = { procesoId: number; nombre: string; slug: string };

export async function crearSubproceso(
  d: DatosSubproceso,
  usuarioId: number,
): Promise<{ id: number }> {
  const datos = { ...d, slug: validarSlug(d.slug) };
  if (!datos.nombre.trim()) throw new Error("El nombre es obligatorio");
  const sql = obtenerSql();
  try {
    return await sql.begin(async (tx) => {
      const orden = await siguienteOrden(tx, "subprocesos", "proceso_id", datos.procesoId);
      const [s] = await tx`INSERT INTO subprocesos (proceso_id, nombre, slug, orden)
        VALUES (${datos.procesoId}, ${datos.nombre}, ${datos.slug}, ${orden}) RETURNING id`;
      await registrarAuditoria(tx, {
        usuarioId, accion: "crear_subproceso", entidad: "subprocesos",
        entidadId: s.id, detalle: datos,
      });
      return { id: s.id };
    });
  } catch (err) {
    throw traducirUnico(err, "Ya existe un subproceso con ese slug en este proceso");
  }
}

export async function editarSubproceso(
  id: number,
  d: DatosSubproceso,
  usuarioId: number,
): Promise<void> {
  const datos = { ...d, slug: validarSlug(d.slug) };
  if (!datos.nombre.trim()) throw new Error("El nombre es obligatorio");
  const sql = obtenerSql();
  try {
    await sql.begin(async (tx) => {
      const [s] = await tx`UPDATE subprocesos SET nombre = ${datos.nombre}, slug = ${datos.slug}
        WHERE id = ${id} RETURNING id`;
      if (!s) throw new Error("El subproceso no existe");
      await registrarAuditoria(tx, {
        usuarioId, accion: "editar_subproceso", entidad: "subprocesos",
        entidadId: id, detalle: datos,
      });
    });
  } catch (err) {
    throw traducirUnico(err, "Ya existe un subproceso con ese slug en este proceso");
  }
}
```

- [ ] **Step 4: Ejecutar los tests (pasan)**

Run: `npm test -- mapa-admin` → PASS.

- [ ] **Step 5: Componente `ListaSubprocesos`**

Create `src/componentes/admin/mapa/ListaSubprocesos.tsx`:

```tsx
import Link from "next/link";
import { BotonBorrar } from "@/componentes/admin/mapa/BotonBorrar";
import { BotonesOrden } from "@/componentes/admin/mapa/BotonesOrden";
import { ConfirmarDesactivar } from "@/componentes/admin/mapa/ConfirmarDesactivar";
import type { FilaSubproceso } from "@/db/consultas/mapa-admin";

export function ListaSubprocesos({
  subprocesos, volverA,
}: {
  subprocesos: FilaSubproceso[]; volverA: string;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {subprocesos.map((s, i) => (
        <li key={s.id}
          className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${s.activo ? "" : "border-dashed opacity-60"}`}>
          <BotonesOrden tabla="subprocesos" id={s.id} esPrimero={i === 0} esUltimo={i === subprocesos.length - 1} />
          <Link href={`/admin/mapa/subprocesos/${s.id}`} className="flex-1 font-medium hover:underline">
            {s.nombre}
          </Link>
          <span className="text-xs text-muted-foreground">
            {s.numDocs} docs{s.activo ? "" : " · inactivo"}
          </span>
          <ConfirmarDesactivar tabla="subprocesos" id={s.id} activo={s.activo} afectados={s.docsAfectados} />
          {s.numDocs === 0 && <BotonBorrar tabla="subprocesos" id={s.id} volverA={volverA} />}
        </li>
      ))}
      {subprocesos.length === 0 && (
        <li className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Sin subprocesos.</li>
      )}
    </ul>
  );
}
```

- [ ] **Step 6: Incrustar la lista de subprocesos en la página del proceso**

En `src/app/admin/(panel)/mapa/procesos/[id]/page.tsx` agregar imports:

```tsx
import { ListaSubprocesos } from "@/componentes/admin/mapa/ListaSubprocesos";
import { listarSubprocesos, obtenerProceso } from "@/db/consultas/mapa-admin";
```

tras cargar `p`:

```tsx
  const subprocesos = await listarSubprocesos(p.id);
```

y al final del `<main>`:

```tsx
      <section className="mt-8">
        <h2 className="mb-2 font-display text-lg font-semibold">Subprocesos</h2>
        <ListaSubprocesos subprocesos={subprocesos} volverA={`/admin/mapa/procesos/${p.id}`} />
      </section>
```

- [ ] **Step 7: Formulario y páginas de subproceso**

Create `src/componentes/admin/mapa/FormularioSubproceso.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import type { EstadoAccion } from "@/app/admin/comun";

const claseCampo =
  "rounded-md border border-border bg-card px-3 py-2 text-foreground outline-none transition-colors focus:border-azul focus:ring-2 focus:ring-azul/20";

export function FormularioSubproceso({
  accion, procesoId, id, valores,
}: {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  procesoId: number;
  id?: number;
  valores?: { nombre: string; slug: string };
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const v = estado?.valores;
  const val = (c: string): string | undefined => {
    const x = v?.[c];
    return typeof x === "string" ? x : Array.isArray(x) ? x[0] : undefined;
  };
  return (
    <form action={enviar} className="flex max-w-lg flex-col gap-5">
      <input type="hidden" name="procesoId" value={procesoId} />
      {id && <input type="hidden" name="id" value={id} />}
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nombre
        <input name="nombre" required defaultValue={val("nombre") ?? valores?.nombre} className={claseCampo} />
      </label>
      <details>
        <summary className="cursor-pointer text-sm text-muted-foreground">Opciones avanzadas</summary>
        <label className="mt-2 flex flex-col gap-1 text-sm font-medium">
          Slug (URL) — cambiarlo rompe enlaces existentes
          <input name="slug" defaultValue={val("slug") ?? valores?.slug} placeholder="se genera del nombre"
            className={`${claseCampo} font-mono`} />
        </label>
      </details>
      {estado && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {estado.error}
        </p>
      )}
      <button type="submit" disabled={pendiente}
        className="self-start rounded-md bg-azul px-5 py-2 font-medium text-white hover:bg-azul-profundo disabled:opacity-60">
        {pendiente ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
```

Create `src/app/admin/(panel)/mapa/subprocesos/nuevo/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { crearSubprocesoAccion } from "@/app/admin/acciones-mapa";
import { FormularioSubproceso } from "@/componentes/admin/mapa/FormularioSubproceso";
import { obtenerProceso } from "@/db/consultas/mapa-admin";

export const metadata: Metadata = { title: "Nuevo subproceso — Administración SGC" };

export default async function PaginaNuevoSubproceso({
  searchParams,
}: {
  searchParams: Promise<{ proc?: string }>;
}) {
  const procId = Number((await searchParams).proc);
  if (!Number.isInteger(procId) || procId <= 0) notFound();
  const proc = await obtenerProceso(procId);
  if (!proc) notFound();
  return (
    <main>
      <h1 className="mb-2 font-display text-2xl font-semibold">Nuevo subproceso</h1>
      <p className="mb-6 text-sm text-muted-foreground">En {proc.nombre}</p>
      <FormularioSubproceso accion={crearSubprocesoAccion} procesoId={proc.id} />
    </main>
  );
}
```

Create `src/app/admin/(panel)/mapa/subprocesos/[id]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { editarSubprocesoAccion } from "@/app/admin/acciones-mapa";
import { FormularioSubproceso } from "@/componentes/admin/mapa/FormularioSubproceso";
import { obtenerSubproceso } from "@/db/consultas/mapa-admin";

export const metadata: Metadata = { title: "Editar subproceso — Administración SGC" };

export default async function PaginaEditarSubproceso({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const s = await obtenerSubproceso(Number((await params).id));
  if (!s) notFound();
  return (
    <main>
      <h1 className="mb-6 font-display text-2xl font-semibold">Editar subproceso</h1>
      <FormularioSubproceso accion={editarSubprocesoAccion} procesoId={s.procesoId} id={s.id} valores={s} />
    </main>
  );
}
```

- [ ] **Step 8: Acciones de subprocesos**

En `acciones-mapa.ts` agregar imports (`crearSubproceso`, `editarSubproceso`) y:

```ts
function parsearSubproceso(formData: FormData) {
  const nombre = texto(formData, "nombre");
  const slugManual = texto(formData, "slug");
  return {
    procesoId: idNumerico(formData, "procesoId"),
    nombre,
    slug: slugManual || generarSlug(nombre),
  };
}

export async function crearSubprocesoAccion(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    await crearSubproceso(parsearSubproceso(formData), usuarioId);
    return `/admin/mapa/procesos/${idNumerico(formData, "procesoId")}`;
  });
}

export async function editarSubprocesoAccion(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    await editarSubproceso(idNumerico(formData, "id"), parsearSubproceso(formData), usuarioId);
    return `/admin/mapa/procesos/${idNumerico(formData, "procesoId")}`;
  });
}
```

- [ ] **Step 9: Guard + lint + verificación**

`tests/guardia.test.ts`: agregar `crearSubprocesoAccion`, `editarSubprocesoAccion` al
import y sus casos.
Run: `npm run lint` → limpio. `npm test -- mapa-admin guardia` → PASS.
Manual: entrar a un proceso, "+ Subproceso", crearlo, reordenar, desactivar con la
advertencia; verificar en la vista de proceso pública `/procesos/<slug>`.

- [ ] **Step 10: Commit**

```bash
git add src/db/consultas/mapa-admin.ts src/app/admin/acciones-mapa.ts \
  "src/app/admin/(panel)/mapa/subprocesos" "src/app/admin/(panel)/mapa/procesos/[id]/page.tsx" \
  src/componentes/admin/mapa/FormularioSubproceso.tsx \
  src/componentes/admin/mapa/ListaSubprocesos.tsx \
  tests/mapa-admin.test.ts tests/guardia.test.ts
git commit -m "feat: editor de subprocesos y cierre de la jerarquia del mapa

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Vista previa del mapa con nodos inactivos

Una vista de admin del mapa real que ADEMÁS muestra los nodos inactivos en gris punteado.
Reusa `MapaProcesos` con datos que incluyen los inactivos. El camino público no cambia
(el flag `activo` es opcional; sin él, los componentes se comportan igual que hoy).

**Files:**
- Modify: `src/db/consultas/mapa.ts` (tipos `activo?` + `obtenerDatosMapaAdmin`)
- Modify: `src/componentes/mapa/Banda.tsx` (estilo de macro inactivo)
- Modify: `src/componentes/mapa/TarjetaProceso.tsx` (estilo de proceso inactivo)
- Modify: `src/componentes/mapa/RailPeriferico.tsx` (elemento inactivo)
- Modify: `src/componentes/mapa/MapaProcesos.tsx` (convención inactiva)
- Create: `src/app/admin/(panel)/mapa/vista-previa/page.tsx`

**Interfaces:**
- Consumes: `MapaProcesos`, `DatosMapa`.
- Produces: `obtenerDatosMapaAdmin(): Promise<DatosMapa>` (incluye inactivos con `activo`).

- [ ] **Step 1: Extender los tipos y agregar la consulta admin en `mapa.ts`**

En `src/db/consultas/mapa.ts`, agregar `activo?: boolean` a los tres tipos:

```ts
export type ProcesoMapa = {
  // …campos existentes…
  activo?: boolean;
};
export type MacroprocesoMapa = {
  // …campos existentes…
  activo?: boolean;
};
export type ElementoPeriferico = {
  tipo: "entrada" | "salida" | "convencion";
  texto: string;
  icono: string | null;
  activo?: boolean;
};
```

Agregar la función (mirror de `obtenerDatosMapa` sin los `WHERE activo`, con `activo` en el
SELECT). Refactorizar es opcional; lo directo es duplicar el cuerpo cambiando esas líneas:

```ts
export async function obtenerDatosMapaAdmin(): Promise<DatosMapa> {
  const sql = obtenerSql();
  const [macros, procesos, elementos, config] = await Promise.all([
    sql`
      SELECT id, letra, nombre, slug, banda, color, icono, activo
      FROM macroprocesos
      ORDER BY array_position(ARRAY['estrategicos','misionales','apoyo','evaluacion'], banda), orden`,
    sql`
      SELECT
        p.id, p.nombre, p.sigla, p.slug, p.icono, p.descripcion, p.activo,
        p.macroproceso_id AS macroproceso_id,
        (
          SELECT count(DISTINCT dp.documento_id)::int
          FROM documento_proceso dp
          WHERE (
            dp.proceso_id = p.id
            OR dp.subproceso_id IN (SELECT s.id FROM subprocesos s WHERE s.proceso_id = p.id)
          )
          AND EXISTS (
            SELECT 1 FROM documento_versiones v
            WHERE v.documento_id = dp.documento_id AND v.estado = 'vigente'
          )
        ) AS docs_vigentes,
        (SELECT count(*)::int FROM subprocesos s WHERE s.proceso_id = p.id) AS num_subprocesos
      FROM procesos p ORDER BY p.orden`,
    sql`SELECT tipo, texto, icono, activo FROM elementos_perifericos ORDER BY tipo, orden`,
    sql`SELECT clave, valor FROM configuracion`,
  ]);

  const macroprocesos: MacroprocesoMapa[] = macros.map((m) => ({
    id: m.id as number, letra: m.letra as string, nombre: m.nombre as string,
    slug: m.slug as string, banda: m.banda as MacroprocesoMapa["banda"],
    color: m.color as string, icono: m.icono as string, activo: m.activo as boolean,
    procesos: procesos
      .filter((p) => p.macroproceso_id === m.id)
      .map((p) => ({
        id: p.id as number, nombre: p.nombre as string, sigla: p.sigla as string,
        slug: p.slug as string, icono: p.icono as string,
        descripcion: p.descripcion as string | null,
        docsVigentes: p.docs_vigentes as number,
        numSubprocesos: p.num_subprocesos as number,
        activo: p.activo as boolean,
      })),
  }));

  const deTipo = (tipo: ElementoPeriferico["tipo"]) =>
    elementos
      .filter((e) => e.tipo === tipo)
      .map((e) => ({
        tipo, texto: e.texto as string, icono: e.icono as string | null,
        activo: e.activo as boolean,
      }));

  return {
    macroprocesos,
    entradas: deTipo("entrada"),
    salidas: deTipo("salida"),
    convenciones: deTipo("convencion"),
    configuracion: Object.fromEntries(config.map((c) => [c.clave, c.valor])),
  };
}
```

- [ ] **Step 2: Estilo de inactivo en `Banda.tsx`**

En la `<section>` de `Banda`, agregar al `className` una marca condicional y un badge en el
header. Cambiar la línea del `className` de la section por:

```tsx
      className={`banda-animada rounded-2xl border p-3 sm:p-4 ${macro.activo === false ? "opacity-50 grayscale" : ""}`}
```

Y en el `<header>`, tras el `<h2>…</h2>`, agregar:

```tsx
        {macro.activo === false && (
          <span className="rounded-full border border-dashed px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
            inactivo
          </span>
        )}
```

- [ ] **Step 3: Estilo de inactivo en `TarjetaProceso.tsx`**

En el `<Link>` de `TarjetaProceso`, componer el `className` con una marca condicional
(agregar al final de las clases existentes):

```tsx
      className={`group flex min-h-28 flex-col justify-between gap-3 rounded-xl border bg-card p-3.5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-banda)] hover:shadow-md focus-visible:-translate-y-0.5 focus-visible:border-[var(--color-banda)] focus-visible:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-banda)] ${proceso.activo === false ? "border-dashed border-muted-foreground/40 opacity-60" : "border-border"}`}
```

Y dentro del segundo `<div>`, tras el `<p>` del nombre, agregar la etiqueta textual (no
solo color, por accesibilidad):

```tsx
        {proceso.activo === false && (
          <span className="mt-1 inline-block text-[10px] font-medium uppercase text-muted-foreground">
            (inactivo)
          </span>
        )}
```

- [ ] **Step 4: Estilo de inactivo en `RailPeriferico.tsx`**

En el `<li>` de cada elemento, componer la clase y agregar la etiqueta:

```tsx
          <li key={e.texto}
            className={`flex items-start gap-2.5 px-1.5 py-2.5 ${e.activo === false ? "opacity-50" : ""}`}>
```

y dentro, tras el `<span>` del texto:

```tsx
            {e.activo === false && (
              <span className="text-[10px] uppercase text-muted-foreground">(inactivo)</span>
            )}
```

Nota: `RailPeriferico` solo recibe `entrada`/`salida`. Las convenciones se ghostean en
`MapaProcesos` (siguiente paso).

- [ ] **Step 5: Convención inactiva en `MapaProcesos.tsx`**

En el `.map` de `convenciones`, componer la clase del `<span key={c.texto}>`:

```tsx
          <span key={c.texto}
            className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground ${c.activo === false ? "opacity-50 line-through" : ""}`}>
```

- [ ] **Step 6: Página de vista previa**

Create `src/app/admin/(panel)/mapa/vista-previa/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { MapaProcesos } from "@/componentes/mapa/MapaProcesos";
import { obtenerDatosMapaAdmin } from "@/db/consultas/mapa";

export const metadata: Metadata = { title: "Vista previa del mapa — Administración SGC" };

export default async function PaginaVistaPrevia() {
  const datos = await obtenerDatosMapaAdmin();
  return (
    <main>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Vista previa del mapa</h1>
          <p className="text-sm text-muted-foreground">
            Incluye los nodos inactivos (en gris, marcados “inactivo”). El público no los ve.
          </p>
        </div>
        <Link href="/admin/mapa" className="rounded-md border px-3 py-2 text-sm hover:bg-muted">
          ← Volver al editor
        </Link>
      </div>
      <div className="rounded-2xl border bg-lienzo p-4">
        <MapaProcesos datos={datos} />
      </div>
    </main>
  );
}
```

(Si la clase `bg-lienzo` no existe como utilidad Tailwind, usar `style={{ background:
"var(--color-lienzo)" }}` o simplemente `bg-muted/30`. El ejecutor verifica el token en
`globals.css`.)

- [ ] **Step 7: Lint + verificación (público intacto)**

Run: `npm run lint` → limpio.
Run: `npm test` → sin regresiones nuevas.
Manual: `/` (mapa público) se ve **idéntico** a antes (los tipos `activo?` no cambian nada
sin el flag). `/admin/mapa/vista-previa` muestra el mapa con los inactivos ghosteados;
desactivar un proceso en el editor y recargar la vista previa lo muestra en gris, mientras
que en `/` desaparece.

- [ ] **Step 8: Commit**

```bash
git add src/db/consultas/mapa.ts src/componentes/mapa/ \
  "src/app/admin/(panel)/mapa/vista-previa"
git commit -m "feat: vista previa admin del mapa con nodos inactivos

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Navegación, accesibilidad y cierre de fase

Pulido final: enlaces del panel, migas donde falten, repaso de foco/ARIA, y actualización
de `CONTEXT.md`. Cierra la fase.

**Files:**
- Modify: `src/app/admin/(panel)/layout.tsx` (confirmar enlaces "Mapa" y "Tipos")
- Modify: `src/app/admin/(panel)/mapa/**` (migas de retorno donde falten)
- Modify: `CONTEXT.md`
- (Sin código nuevo de negocio.)

- [ ] **Step 1: Confirmar la nav del panel**

Verificar que `src/app/admin/(panel)/layout.tsx` tenga los enlaces (agregados en Task 3):

```tsx
<Link href="/admin" className="hover:underline">Documentos</Link>
<Link href="/admin/mapa" className="hover:underline">Mapa</Link>
<Link href="/admin/tipos" className="hover:underline">Tipos de documento</Link>
<Link href="/" className="text-muted-foreground hover:underline">Ver portal público</Link>
```

- [ ] **Step 2: Migas de retorno**

En las páginas de edición de proceso y subproceso, agregar un enlace de retorno al padre
(migas). En `procesos/[id]/page.tsx`, bajo el `<h1>`, agregar (usando el `macroprocesoId`
ya disponible en `p`):

```tsx
      <Link href={`/admin/mapa/macroprocesos/${p.macroprocesoId}`}
        className="mb-4 inline-block text-sm text-muted-foreground hover:underline">
        ← Volver al macroproceso
      </Link>
```

En `subprocesos/[id]/page.tsx`, bajo el `<h1>`:

```tsx
      <Link href={`/admin/mapa/procesos/${s.procesoId}`}
        className="mb-4 inline-block text-sm text-muted-foreground hover:underline">
        ← Volver al proceso
      </Link>
```

(Agregar `import Link from "next/link";` donde falte.)

- [ ] **Step 3: Repaso de accesibilidad (manual, teclado)**

Recorrer con Tab todo el editor: los botones ↑↓ tienen `aria-label` (ya), los `<summary>`
son enfocables, el foco es visible, y ningún estado depende solo del color (los inactivos
llevan la etiqueta "inactivo"/"(inactivo)"). Corregir cualquier control sin nombre
accesible. Verificar `prefers-reduced-motion` no se ve afectado (no se agregaron
animaciones nuevas).

- [ ] **Step 4: Suite completa + lint + build**

Run: `npm run lint` → limpio.
Run: `npm test` → verde salvo los 5 rojos preexistentes del seed (ver `CONTEXT.md`);
confirmar que no hay rojos nuevos.
Run: `npm run build` → standalone sin errores.

- [ ] **Step 5: Actualizar `CONTEXT.md`**

Agregar el bloque de cierre de la Fase 7: nuevo punto de reanudación, entrada en "Hecho
(Fase 7)", y las decisiones D45+ (motor genérico por nombre de tabla; borrar-si-vacío con
FK como red; advertencia de huérfanos en vez de bloqueo; slug estable al renombrar;
vista previa con inactivos vía flag opcional). Actualizar la fecha de última actualización.

- [ ] **Step 6: Commit de cierre**

```bash
git add "src/app/admin/(panel)" CONTEXT.md
git commit -m "feat: cierre de la Fase 7 (editor del mapa) y actualizacion de CONTEXT

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Decir al usuario qué probar**

Resumir el recorrido de demo: gestionar tipos de documento; editar textos y ver el lema
cambiar en `/`; crear un proceso nuevo y verlo aparecer en el mapa público sin despliegue
(criterio de aceptación); reordenar con ↑↓; desactivar un proceso con documentos vigentes
y leer la advertencia; borrar un nodo vacío; y la vista previa con inactivos.

---

## Notas de verificación del plan (self-review)

- **Cobertura del spec:** §4 rutas → Tasks 3–9; §5 interacción por entidad → Tasks 6–8;
  §5 reordenar → Task 2 (motor) + `BotonesOrden` (Task 3); §5 desactivar con advertencia →
  Task 6 (`ConfirmarDesactivar`), reusado en 7–8; §5/§4 borrar-si-vacío → `borrar` (Task 2)
  + gating de UI por conteos (Tasks 3,5,6,7,8); §6 tipos → Task 3; §7 textos → Task 4;
  §8 vista previa → Task 9; §9 capa de datos/acciones/reuso (`comun.ts`) → Tasks 1–2;
  §10 auditoría → toda mutación audita (Tasks 2–8); §11 tests → `mapa-admin`+`guardia`
  (todas las tareas) y `validaciones-mapa` (Task 1); §12 orden → Tasks 1–10.
- **Sin placeholders:** todos los pasos con código muestran el código completo.
- **Consistencia de tipos:** `Tabla`, `EstadoAccion`, `FilaTipo/Periferico/Macro/Proceso/
  Subproceso`, y las firmas de acciones se declaran en el bloque *Produces* de su tarea y
  se consumen con el mismo nombre en las tareas siguientes.
- **Migraciones:** ninguna — todas las columnas ya existen en el esquema (verificado contra
  `src/db/esquema.ts`).
