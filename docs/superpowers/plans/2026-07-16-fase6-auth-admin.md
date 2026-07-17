# Fase 6 — Auth + panel admin (carga y versionado) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Login del admin + panel de carga y versionado con ciclo completo (crear, subir archivos, publicar con obsolescencia automática, anular, editar metadatos), auditado y con guard en dos capas.

**Architecture:** Server Actions para todos los formularios (progressive enhancement + CSRF integrado); un route handler dedicado para la subida de archivos con **cuerpo crudo en streaming** (no multipart: streaming real a disco sin parser ni dependencia nueva — ajuste menor sobre el spec, mismo contrato de validación). Guard optimista en `proxy.ts` + validación real contra BD en layout, actions y handlers. Sesiones con token aleatorio cuyo SHA-256 es la PK de `sesiones`; claves con Argon2id.

**Tech Stack:** Next.js 16.2 App Router, TypeScript estricto, Drizzle (esquema) + postgres.js (queries SQL-first), `@node-rs/argon2` (nuevo, prebuilds ARM64), `file-type`, Vitest, Tailwind 4.

## Global Constraints

- **Idioma:** dominio, UI, mensajes y nombres de código en español (`documento`, `versionVigente`).
- **ARM64:** toda dependencia nueva con binarios se verifica en la imagen `linux/arm64` (smoke test en Dockerfile, Tarea 1).
- **Sin internet en runtime:** cero CDNs/telemetría. `NEXT_TELEMETRY_DISABLED=1` ya está.
- **Reglas ISO inviolables:** una sola versión vigente (índice único parcial ya existe); obsoletos se retienen; el público jamás ve no-vigentes; ninguna escritura sin sesión; todo auditado; MIME por magic bytes.
- **Next 16:** `proxy.ts` (NO `middleware.ts`); `cookies()`/`headers()` son **async** (`await cookies()`). Docs en `node_modules/next/dist/docs/`.
- **Tests con BD:** requieren la BD dev migrada y sembrada: `docker compose -f docker-compose.dev.yml up -d bd && npm run db:migrate && npm run db:seed`. `DATABASE_URL` de `.env.local` (puerto **5434**). Los tests de BD leen `process.env.DATABASE_URL` — correr con `npx dotenv -e .env.local -- vitest ...` no está montado: los tests existentes ya cargan env (ver `tests/esquema.test.ts` como referencia de patrón); seguir ese mismo patrón.
- **Máximo por archivo:** 25 MB. Allowlist: `pdf, docx, xlsx, pptx, doc, xls, ppt, png, jpg, jpeg, webp, zip, rar`.
- **Commits:** convencionales en español, terminados en `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **`npm run lint`** = ESLint + `tsc --noEmit`; debe quedar verde en cada tarea.

## Estructura de archivos (mapa completo de la fase)

```
src/lib/clave.ts                         ← Argon2id: hashearClave / verificarClave
src/lib/sesion-constantes.ts             ← COOKIE_SESION (importable por proxy sin arrastrar BD)
src/lib/sesion.ts                        ← crearSesion / validarSesion / cerrarSesion (BD pura)
src/lib/sesion-actual.ts                 ← requerirSesion() (usa next/headers)
src/lib/subida.ts                        ← sanearNombre / validarTipo / allowlist / límites
src/lib/servir-archivo.ts                ← respuestaArchivo() extraído del route público
src/proxy.ts                             ← guard optimista /admin/:path*
src/db/consultas/admin.ts                ← todas las consultas de escritura y del panel
src/app/admin/ingreso/page.tsx           ← login (fuera del layout con guard)
src/app/admin/acciones.ts                ← Server Actions ('use server')
src/app/admin/(panel)/layout.tsx         ← valida sesión real + nav
src/app/admin/(panel)/page.tsx           ← tabla de documentos
src/app/admin/(panel)/documentos/nuevo/page.tsx
src/app/admin/(panel)/documentos/[codigo]/page.tsx        ← detalle/versiones
src/app/admin/(panel)/documentos/[codigo]/editar/page.tsx
src/app/admin/api/archivos/route.ts      ← POST subida (streaming)
src/app/admin/api/archivos/[archivoId]/route.ts ← GET (vista previa admin) + DELETE (borrador)
src/componentes/admin/FormularioIngreso.tsx     ← client, useActionState
src/componentes/admin/FormularioDocumento.tsx   ← client, crear/editar metadatos
src/componentes/admin/FormAccion.tsx            ← client genérico: action + error + confirmación
src/componentes/admin/ZonaCarga.tsx             ← client, drag & drop + progreso XHR
src/componentes/admin/EstadoBadge.tsx           ← badge por estado (server)
scripts/asegurar-admin.ts                ← bootstrap/reseteo del admin
tests/clave.test.ts, tests/sesion.test.ts, tests/publicar.test.ts,
tests/subida.test.ts, tests/guardia.test.ts
```

Nota de desvío consciente respecto al spec (mejora, no recorte): la subida usa **cuerpo crudo** (`fetch`/XHR con el archivo como body y metadatos en query/header) en vez de multipart — streaming real sin materializar 25 MB en RAM y sin parser multipart adicional. La validación (sesión, Origin, borrador, tamaño, magic bytes) es idéntica a la del spec. Además se agrega `DELETE` de archivo de borrador (sin él, un archivo principal mal subido dejaría el borrador atascado) y `GET` admin para previsualizar borradores antes de publicar (coherente con el porqué del flujo borrador→publicar).

---

### Task 1: Argon2id — dependencia, módulo `clave.ts` y smoke ARM64

**Files:**
- Modify: `package.json` (dependencia `@node-rs/argon2`)
- Create: `src/lib/clave.ts`
- Create: `tests/clave.test.ts`
- Modify: `Dockerfile` (smoke test del prebuild en la etapa `deps`)

**Interfaces:**
- Produces: `hashearClave(clave: string): Promise<string>`, `verificarClave(hashGuardado: string, clave: string): Promise<boolean>` (nunca lanza: devuelve `false` ante hash corrupto).

- [ ] **Step 1: Instalar la dependencia**

```bash
npm install @node-rs/argon2
```

- [ ] **Step 2: Escribir el test que falla**

```ts
// tests/clave.test.ts
import { describe, expect, it } from "vitest";
import { hashearClave, verificarClave } from "@/lib/clave";

describe("clave (Argon2id)", () => {
  it("verifica la clave correcta y rechaza la incorrecta", async () => {
    const hash = await hashearClave("Fatima-2026");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verificarClave(hash, "Fatima-2026")).toBe(true);
    expect(await verificarClave(hash, "otra")).toBe(false);
  });

  it("dos hashes de la misma clave difieren (salt aleatoria)", async () => {
    expect(await hashearClave("x")).not.toBe(await hashearClave("x"));
  });

  it("no lanza ante un hash corrupto: devuelve false", async () => {
    expect(await verificarClave("basura", "x")).toBe(false);
  });
});
```

- [ ] **Step 3: Correr el test y verlo fallar**

Run: `npx vitest run tests/clave.test.ts`
Expected: FAIL — `Cannot find module '@/lib/clave'`

- [ ] **Step 4: Implementar `src/lib/clave.ts`**

```ts
import { hash, verify } from "@node-rs/argon2";

// Parámetros OWASP para Argon2id (19 MiB, t=2). Costo puntual por intento de
// login — el rate limit de 5/min hace irrelevante el gasto en el NAS.
const OPCIONES = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashearClave(clave: string): Promise<string> {
  return hash(clave, OPCIONES);
}

export async function verificarClave(
  hashGuardado: string,
  clave: string,
): Promise<boolean> {
  try {
    return await verify(hashGuardado, clave);
  } catch {
    // Hash corrupto o formato desconocido: credencial inválida, no un 500.
    return false;
  }
}
```

- [ ] **Step 5: Correr el test y verlo pasar**

Run: `npx vitest run tests/clave.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Smoke ARM64 en el Dockerfile**

En la etapa `deps`, después de `RUN npm ci`, agregar:

```dockerfile
# Verifica que el prebuild ARM64 de @node-rs/argon2 carga y funciona.
# Si falta el binario para linux/arm64, el build de CI truena aquí, no en el NAS.
RUN node -e "const{hashSync,verifySync}=require('@node-rs/argon2');if(!verifySync(hashSync('humo'),'humo'))process.exit(1)"
```

- [ ] **Step 7: Lint y commit**

```bash
npm run lint
git add package.json package-lock.json src/lib/clave.ts tests/clave.test.ts Dockerfile
git commit -m "feat: hash de claves con Argon2id y smoke ARM64 del prebuild

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Ciclo de sesión en BD (`sesion.ts`)

**Files:**
- Create: `src/lib/sesion-constantes.ts`
- Create: `src/lib/sesion.ts`
- Test: `tests/sesion.test.ts`

**Interfaces:**
- Consumes: `obtenerSql()` de `@/db/cliente`.
- Produces:
  - `COOKIE_SESION = "sgc_sesion"` (en `sesion-constantes.ts`, sin más imports — el proxy lo importa sin arrastrar postgres).
  - `type SesionValida = { usuarioId: number; usuario: string; nombre: string }`
  - `crearSesion(usuarioId: number): Promise<{ token: string; expiraEn: Date }>`
  - `validarSesion(token: string | null | undefined): Promise<SesionValida | null>` — renovación deslizante: si quedan <6 h, extiende a 12 h; limpia sesiones vencidas oportunistamente.
  - `cerrarSesion(token: string): Promise<void>`
  - `VIGENCIA_SESION_MS = 12 * 60 * 60 * 1000`

- [ ] **Step 1: Crear `src/lib/sesion-constantes.ts`**

```ts
// Separado de sesion.ts a propósito: proxy.ts lo importa y su bundle
// no debe arrastrar el cliente de postgres.
export const COOKIE_SESION = "sgc_sesion";
```

- [ ] **Step 2: Escribir el test que falla** (requiere BD dev arriba)

```ts
// tests/sesion.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { obtenerSql } from "@/db/cliente";
import {
  cerrarSesion,
  crearSesion,
  validarSesion,
} from "@/lib/sesion";

const sql = () => obtenerSql();
let usuarioId: number;

beforeAll(async () => {
  const [u] = await sql()`
    INSERT INTO usuarios (usuario, nombre, hash_clave)
    VALUES ('prueba_sesion', 'Prueba', 'hash-falso')
    ON CONFLICT (usuario) DO UPDATE SET activo = true
    RETURNING id`;
  usuarioId = u.id;
});

afterAll(async () => {
  await sql()`DELETE FROM usuarios WHERE usuario = 'prueba_sesion'`;
  await sql().end();
});

describe("sesiones", () => {
  it("crea y valida una sesión; en BD nunca está el token", async () => {
    const { token } = await crearSesion(usuarioId);
    const valida = await validarSesion(token);
    expect(valida?.usuario).toBe("prueba_sesion");
    const filas = await sql()`SELECT id FROM sesiones WHERE usuario_id = ${usuarioId}`;
    expect(filas.some((f) => f.id === token)).toBe(false); // solo el hash
  });

  it("rechaza token inventado y token vacío", async () => {
    expect(await validarSesion("token-inventado")).toBeNull();
    expect(await validarSesion(null)).toBeNull();
    expect(await validarSesion(undefined)).toBeNull();
  });

  it("una sesión vencida no vale y se limpia", async () => {
    const { token } = await crearSesion(usuarioId);
    await sql()`UPDATE sesiones SET expira_en = now() - interval '1 minute'
      WHERE usuario_id = ${usuarioId}`;
    expect(await validarSesion(token)).toBeNull();
    const vivas = await sql()`SELECT 1 FROM sesiones
      WHERE usuario_id = ${usuarioId} AND expira_en < now()`;
    expect(vivas.length).toBe(0); // limpieza oportunista
  });

  it("renueva cuando quedan menos de 6 h (deslizante)", async () => {
    const { token } = await crearSesion(usuarioId);
    await sql()`UPDATE sesiones SET expira_en = now() + interval '1 hour'
      WHERE usuario_id = ${usuarioId}`;
    await validarSesion(token);
    const [s] = await sql()`SELECT expira_en FROM sesiones WHERE usuario_id = ${usuarioId}`;
    expect(new Date(s.expira_en).getTime()).toBeGreaterThan(Date.now() + 11 * 3600_000);
  });

  it("un usuario inactivo no valida aunque su sesión viva", async () => {
    const { token } = await crearSesion(usuarioId);
    await sql()`UPDATE usuarios SET activo = false WHERE id = ${usuarioId}`;
    expect(await validarSesion(token)).toBeNull();
    await sql()`UPDATE usuarios SET activo = true WHERE id = ${usuarioId}`;
  });

  it("cerrarSesion invalida el token", async () => {
    const { token } = await crearSesion(usuarioId);
    await cerrarSesion(token);
    expect(await validarSesion(token)).toBeNull();
  });
});
```

- [ ] **Step 3: Correr y ver fallar**

Run: `npx vitest run tests/sesion.test.ts`
Expected: FAIL — `Cannot find module '@/lib/sesion'`

- [ ] **Step 4: Implementar `src/lib/sesion.ts`**

```ts
import { createHash, randomBytes } from "node:crypto";
import { obtenerSql } from "@/db/cliente";

export { COOKIE_SESION } from "@/lib/sesion-constantes";

export const VIGENCIA_SESION_MS = 12 * 60 * 60 * 1000;
const UMBRAL_RENOVACION_MS = 6 * 60 * 60 * 1000;

export type SesionValida = {
  usuarioId: number;
  usuario: string;
  nombre: string;
};

// En BD solo vive el SHA-256 del token: si la BD se filtra, los tokens no sirven.
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function crearSesion(
  usuarioId: number,
): Promise<{ token: string; expiraEn: Date }> {
  const sql = obtenerSql();
  const token = randomBytes(32).toString("base64url");
  const expiraEn = new Date(Date.now() + VIGENCIA_SESION_MS);
  await sql`INSERT INTO sesiones (id, usuario_id, expira_en)
    VALUES (${hashToken(token)}, ${usuarioId}, ${expiraEn})`;
  return { token, expiraEn };
}

export async function validarSesion(
  token: string | null | undefined,
): Promise<SesionValida | null> {
  if (!token) return null;
  const sql = obtenerSql();

  // Limpieza oportunista: un admin, tabla diminuta — el DELETE es gratis.
  await sql`DELETE FROM sesiones WHERE expira_en < now()`;

  const [fila] = await sql`
    SELECT s.id, s.expira_en, u.id AS usuario_id, u.usuario, u.nombre
    FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.id = ${hashToken(token)} AND s.expira_en > now() AND u.activo`;
  if (!fila) return null;

  const restanteMs = new Date(fila.expira_en).getTime() - Date.now();
  if (restanteMs < UMBRAL_RENOVACION_MS) {
    const nueva = new Date(Date.now() + VIGENCIA_SESION_MS);
    await sql`UPDATE sesiones SET expira_en = ${nueva} WHERE id = ${fila.id}`;
  }

  return {
    usuarioId: fila.usuario_id,
    usuario: fila.usuario,
    nombre: fila.nombre,
  };
}

export async function cerrarSesion(token: string): Promise<void> {
  const sql = obtenerSql();
  await sql`DELETE FROM sesiones WHERE id = ${hashToken(token)}`;
}
```

- [ ] **Step 5: Correr y ver pasar**

Run: `npx vitest run tests/sesion.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Lint y commit**

```bash
npm run lint
git add src/lib/sesion.ts src/lib/sesion-constantes.ts tests/sesion.test.ts
git commit -m "feat: ciclo de sesion en BD con token hasheado y renovacion deslizante

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Bootstrap del admin (`asegurarAdmin` + script)

**Files:**
- Create: `src/db/consultas/admin.ts` (primera función)
- Create: `scripts/asegurar-admin.ts`
- Modify: `package.json` (script `admin:asegurar`)
- Modify: `.env.example` (ADMIN_USUARIO / ADMIN_NOMBRE / ADMIN_CLAVE)
- Test: `tests/sesion.test.ts` (bloque nuevo)

**Interfaces:**
- Consumes: `hashearClave` (Task 1), `obtenerSql()`.
- Produces: `asegurarAdmin(usuario: string, nombre: string, clave: string, forzarClave?: boolean): Promise<"creado" | "existente" | "clave_actualizada">`

- [ ] **Step 1: Test que falla** — agregar al final de `tests/sesion.test.ts`:

```ts
import { asegurarAdmin } from "@/db/consultas/admin";
import { verificarClave } from "@/lib/clave";

describe("asegurarAdmin", () => {
  afterAll(async () => {
    await sql()`DELETE FROM usuarios WHERE usuario = 'admin_prueba'`;
  });

  it("crea, no duplica, y solo cambia la clave con forzar", async () => {
    expect(await asegurarAdmin("admin_prueba", "Admin", "clave-uno")).toBe("creado");
    expect(await asegurarAdmin("admin_prueba", "Admin", "clave-dos")).toBe("existente");

    let [u] = await sql()`SELECT hash_clave FROM usuarios WHERE usuario = 'admin_prueba'`;
    expect(await verificarClave(u.hash_clave, "clave-uno")).toBe(true);

    expect(await asegurarAdmin("admin_prueba", "Admin", "clave-dos", true)).toBe("clave_actualizada");
    [u] = await sql()`SELECT hash_clave FROM usuarios WHERE usuario = 'admin_prueba'`;
    expect(await verificarClave(u.hash_clave, "clave-dos")).toBe(true);
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run tests/sesion.test.ts`
Expected: FAIL — `Cannot find module '@/db/consultas/admin'`

- [ ] **Step 3: Crear `src/db/consultas/admin.ts`**

```ts
import { obtenerSql } from "@/db/cliente";
import { hashearClave } from "@/lib/clave";

/**
 * Crea el usuario admin si no existe (idempotente: arranque del contenedor y
 * dev). Con forzarClave restablece la clave — el camino de "la olvidé",
 * ejecutando el script en el NAS.
 */
export async function asegurarAdmin(
  usuario: string,
  nombre: string,
  clave: string,
  forzarClave = false,
): Promise<"creado" | "existente" | "clave_actualizada"> {
  const sql = obtenerSql();
  const [existente] = await sql`SELECT id FROM usuarios WHERE usuario = ${usuario}`;

  if (!existente) {
    await sql`INSERT INTO usuarios (usuario, nombre, hash_clave)
      VALUES (${usuario}, ${nombre}, ${await hashearClave(clave)})`;
    return "creado";
  }
  if (forzarClave) {
    await sql`UPDATE usuarios SET hash_clave = ${await hashearClave(clave)}, activo = true
      WHERE id = ${existente.id}`;
    return "clave_actualizada";
  }
  return "existente";
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run tests/sesion.test.ts`
Expected: PASS

- [ ] **Step 5: Script CLI `scripts/asegurar-admin.ts`**

```ts
import { asegurarAdmin } from "@/db/consultas/admin";
import { obtenerSql } from "@/db/cliente";

// Uso: npm run admin:asegurar [-- --forzar-clave]
// Lee ADMIN_USUARIO, ADMIN_NOMBRE y ADMIN_CLAVE del entorno.
async function principal() {
  const usuario = process.env.ADMIN_USUARIO;
  const nombre = process.env.ADMIN_NOMBRE ?? "Administrador";
  const clave = process.env.ADMIN_CLAVE;
  if (!usuario || !clave) {
    console.error("Faltan ADMIN_USUARIO y/o ADMIN_CLAVE en el entorno.");
    process.exit(1);
  }
  const forzar = process.argv.includes("--forzar-clave");
  const resultado = await asegurarAdmin(usuario, nombre, clave, forzar);
  console.log(`Admin '${usuario}': ${resultado}`);
  await obtenerSql().end();
}

principal().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Ojo: `scripts/` está fuera de `src/`; verificar que `tsx` resuelva el alias `@/` (lo hace vía `tsconfig.json` `paths` — `src/db/semilla.ts` ya corre con tsx; si el alias falla, usar imports relativos `../src/...` en el script).

En `package.json`, junto a `db:seed`:

```json
"admin:asegurar": "tsx --env-file=.env.local scripts/asegurar-admin.ts"
```

(Verificar cómo carga el entorno `db:seed`/`semilla.ts` y usar el MISMO mecanismo; si `semilla.ts` no usa `--env-file`, replicar su patrón por consistencia.)

En `.env.example` agregar:

```
# Cuenta del administrador (bootstrap). Retirar ADMIN_CLAVE tras el primer arranque.
ADMIN_USUARIO=admin
ADMIN_NOMBRE=Administrador del SGC
ADMIN_CLAVE=cambiar-esta-clave
```

- [ ] **Step 6: Probar el script de punta a punta**

Run: `npm run admin:asegurar` (con las vars en `.env.local`)
Expected: `Admin 'admin': creado` — y al repetirlo: `Admin 'admin': existente`

- [ ] **Step 7: Lint y commit**

```bash
npm run lint
git add src/db/consultas/admin.ts scripts/asegurar-admin.ts package.json .env.example tests/sesion.test.ts
git commit -m "feat: bootstrap idempotente del admin desde variables de entorno

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Guard optimista en `proxy.ts` + `requerirSesion()`

**Files:**
- Create: `src/proxy.ts`
- Create: `src/lib/sesion-actual.ts`
- Test: `tests/guardia.test.ts` (primer bloque)

**Interfaces:**
- Consumes: `COOKIE_SESION` (constantes), `validarSesion` (Task 2).
- Produces:
  - `proxy(request: NextRequest): NextResponse` — sin cookie: redirect a `/admin/ingreso` (páginas) o 401 JSON (`/admin/api/*`). Nunca toca la BD.
  - `requerirSesion(): Promise<SesionValida>` — lee la cookie con `await cookies()`, valida contra BD, **lanza** `Error("No autorizado")` si no hay sesión válida. Primera línea de toda action y handler.

- [ ] **Step 1: Test que falla**

```ts
// tests/guardia.test.ts
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

describe("proxy (guard optimista)", () => {
  it("sin cookie redirige /admin a /admin/ingreso", () => {
    const res = proxy(new NextRequest("http://localhost:3000/admin"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/admin/ingreso");
  });

  it("sin cookie /admin/api responde 401, no redirect", () => {
    const res = proxy(
      new NextRequest("http://localhost:3000/admin/api/archivos", { method: "POST" }),
    );
    expect(res.status).toBe(401);
  });

  it("deja pasar /admin/ingreso sin cookie", () => {
    const res = proxy(new NextRequest("http://localhost:3000/admin/ingreso"));
    expect(res.status).toBe(200);
  });

  it("con cookie deja pasar (la validación real es del layout/actions)", () => {
    const req = new NextRequest("http://localhost:3000/admin", {
      headers: { cookie: "sgc_sesion=lo-que-sea" },
    });
    expect(proxy(req).status).toBe(200);
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run tests/guardia.test.ts`
Expected: FAIL — `Cannot find module '@/proxy'`

- [ ] **Step 3: Implementar `src/proxy.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION } from "@/lib/sesion-constantes";

/**
 * Guard OPTIMISTA (Next 16: proxy, no middleware): solo mira si la cookie
 * existe — la validación real contra BD ocurre en el layout del panel y como
 * primera línea de cada action/handler (requerirSesion). Aquí nunca se toca
 * la BD.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin/ingreso") return NextResponse.next();

  const hayCookie = Boolean(request.cookies.get(COOKIE_SESION)?.value);
  if (hayCookie) return NextResponse.next();

  if (pathname.startsWith("/admin/api")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/admin/ingreso", request.url));
}

export const config = { matcher: "/admin/:path*" };
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run tests/guardia.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Crear `src/lib/sesion-actual.ts`**

```ts
import { cookies } from "next/headers";
import { COOKIE_SESION } from "@/lib/sesion-constantes";
import { validarSesion, type SesionValida } from "@/lib/sesion";

/**
 * Validación REAL de la sesión (capa dos del guard). Lanza si no hay sesión:
 * toda Server Action y todo route handler del admin la llaman en su primera
 * línea — regla ISO 4: ninguna escritura sin sesión.
 */
export async function requerirSesion(): Promise<SesionValida> {
  const almacen = await cookies();
  const sesion = await validarSesion(almacen.get(COOKIE_SESION)?.value);
  if (!sesion) throw new Error("No autorizado");
  return sesion;
}
```

- [ ] **Step 6: Lint y commit**

```bash
npm run lint
git add src/proxy.ts src/lib/sesion-actual.ts tests/guardia.test.ts
git commit -m "feat: guard de sesion en dos capas (proxy optimista + requerirSesion)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Consultas de escritura — crear documento/versión, editar metadatos, auditoría

**Files:**
- Modify: `src/db/consultas/admin.ts`
- Test: `tests/publicar.test.ts` (primera mitad)

**Interfaces:**
- Produces (todas en `admin.ts`):
  - `registrarAuditoria(sql, e): Promise<void>` — acepta el cliente o una tx (tipo `Cliente = Sql | TransactionSql` de `postgres`).
  - `type AsociacionEntrada = { procesoId?: number; subprocesoId?: number; esPrincipal: boolean }`
  - `type DatosDocumento = { codigo: string; titulo: string; tipoId: number; descripcion: string | null; palabrasClave: string | null; asociaciones: AsociacionEntrada[] }`
  - `crearDocumento(datos: DatosDocumento, usuarioId: number): Promise<{ documentoId: number; versionId: number }>`
  - `crearVersionBorrador(documentoId: number, usuarioId: number): Promise<{ versionId: number; numero: number }>` — rechaza si ya hay borrador.
  - `type DatosVersion = { fechaElaboracion: string | null; fechaRevision: string | null; fechaAprobacion: string | null; elaboro: string | null; reviso: string | null; aprobo: string | null; resumenCambios: string | null }`
  - `editarVersionBorrador(versionId: number, datos: DatosVersion, usuarioId: number): Promise<void>`
  - `editarMetadatos(documentoId: number, datos: DatosDocumento, usuarioId: number): Promise<void>` — código inmutable tras publicar.
  - `obtenerPatronCodigo(): Promise<RegExp>` — lee `configuracion.patron_codigo`, fallback `^[A-Z]{2,4}-[A-Z]{2,4}-\d{3}$`.

- [ ] **Step 1: Test que falla**

```ts
// tests/publicar.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { obtenerSql } from "@/db/cliente";
import {
  asegurarAdmin,
  crearDocumento,
  crearVersionBorrador,
  editarMetadatos,
  editarVersionBorrador,
  obtenerPatronCodigo,
} from "@/db/consultas/admin";

const sql = () => obtenerSql();
let usuarioId: number;
let procesoId: number;
let tipoId: number;

const CODIGO = "ZZ-TST-901";

async function limpiar() {
  await sql()`DELETE FROM auditoria WHERE usuario_id IN
    (SELECT id FROM usuarios WHERE usuario = 'admin_pub')`;
  await sql()`DELETE FROM archivos WHERE version_id IN (
    SELECT v.id FROM documento_versiones v
    JOIN documentos d ON d.id = v.documento_id WHERE d.codigo LIKE 'ZZ-TST-%')`;
  await sql()`DELETE FROM documento_versiones WHERE documento_id IN
    (SELECT id FROM documentos WHERE codigo LIKE 'ZZ-TST-%')`;
  await sql()`DELETE FROM documentos WHERE codigo LIKE 'ZZ-TST-%'`;
  await sql()`DELETE FROM usuarios WHERE usuario = 'admin_pub'`;
}

beforeAll(async () => {
  await limpiar();
  await asegurarAdmin("admin_pub", "Admin", "x");
  [{ id: usuarioId }] = await sql()`SELECT id FROM usuarios WHERE usuario = 'admin_pub'`;
  [{ id: procesoId }] = await sql()`SELECT id FROM procesos WHERE activo LIMIT 1`;
  [{ id: tipoId }] = await sql()`SELECT id FROM tipos_documento WHERE activo LIMIT 1`;
});

afterAll(async () => {
  await limpiar();
  await sql().end();
});

function datosBase() {
  return {
    codigo: CODIGO,
    titulo: "Documento de prueba Fase 6",
    tipoId,
    descripcion: null,
    palabrasClave: null,
    asociaciones: [{ procesoId, esPrincipal: true }],
  };
}

describe("crear y editar", () => {
  it("crearDocumento deja documento + version 1 borrador + asociacion + auditoria", async () => {
    const { documentoId, versionId } = await crearDocumento(datosBase(), usuarioId);
    const [v] = await sql()`SELECT numero, estado FROM documento_versiones WHERE id = ${versionId}`;
    expect(v).toMatchObject({ numero: 1, estado: "borrador" });
    const asoc = await sql()`SELECT es_principal FROM documento_proceso WHERE documento_id = ${documentoId}`;
    expect(asoc.length).toBe(1);
    const [aud] = await sql()`SELECT 1 FROM auditoria
      WHERE accion = 'crear_documento' AND entidad_id = ${documentoId}`;
    expect(aud).toBeTruthy();
  });

  it("rechaza crear sin exactamente una asociacion principal", async () => {
    await expect(
      crearDocumento({ ...datosBase(), codigo: "ZZ-TST-902", asociaciones: [] }, usuarioId),
    ).rejects.toThrow(/principal/);
  });

  it("rechaza un segundo borrador simultaneo", async () => {
    const [d] = await sql()`SELECT id FROM documentos WHERE codigo = ${CODIGO}`;
    await expect(crearVersionBorrador(d.id, usuarioId)).rejects.toThrow(/borrador/);
  });

  it("editarVersionBorrador guarda la evidencia de aprobacion", async () => {
    const [v] = await sql()`SELECT v.id FROM documento_versiones v
      JOIN documentos d ON d.id = v.documento_id
      WHERE d.codigo = ${CODIGO} AND v.estado = 'borrador'`;
    await editarVersionBorrador(v.id, {
      fechaElaboracion: "2026-07-01", fechaRevision: "2026-07-05",
      fechaAprobacion: "2026-07-10", elaboro: "Calidad", reviso: "Gerencia",
      aprobo: "Gerente", resumenCambios: "Version inicial",
    }, usuarioId);
    const [v2] = await sql()`SELECT aprobo FROM documento_versiones WHERE id = ${v.id}`;
    expect(v2.aprobo).toBe("Gerente");
  });

  it("editarMetadatos cambia titulo; el codigo sigue editable antes de publicar", async () => {
    const [d] = await sql()`SELECT id FROM documentos WHERE codigo = ${CODIGO}`;
    await editarMetadatos(d.id, { ...datosBase(), titulo: "Titulo editado" }, usuarioId);
    const [d2] = await sql()`SELECT titulo FROM documentos WHERE id = ${d.id}`;
    expect(d2.titulo).toBe("Titulo editado");
  });

  it("obtenerPatronCodigo valida el formato provisional", async () => {
    const patron = await obtenerPatronCodigo();
    expect(patron.test("PR-GTH-001")).toBe(true);
    expect(patron.test("basura")).toBe(false);
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run tests/publicar.test.ts`
Expected: FAIL — funciones no exportadas.

- [ ] **Step 3: Implementar en `src/db/consultas/admin.ts`** (agregar al final)

```ts
import type { Sql, TransactionSql } from "postgres";

type Cliente = Sql | TransactionSql;

export async function registrarAuditoria(
  sql: Cliente,
  e: {
    usuarioId: number | null;
    accion: string;
    entidad: string;
    entidadId?: number | null;
    detalle?: unknown;
  },
): Promise<void> {
  await sql`INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle)
    VALUES (${e.usuarioId}, ${e.accion}, ${e.entidad}, ${e.entidadId ?? null},
            ${sql.json((e.detalle ?? {}) as never)})`;
}

export type AsociacionEntrada = {
  procesoId?: number;
  subprocesoId?: number;
  esPrincipal: boolean;
};

export type DatosDocumento = {
  codigo: string;
  titulo: string;
  tipoId: number;
  descripcion: string | null;
  palabrasClave: string | null;
  asociaciones: AsociacionEntrada[];
};

const PATRON_CODIGO_DEFECTO = "^[A-Z]{2,4}-[A-Z]{2,4}-\\d{3}$";

/** Patrón del código, configurable sin migración (pendiente la convención oficial). */
export async function obtenerPatronCodigo(): Promise<RegExp> {
  const sql = obtenerSql();
  const [fila] = await sql`SELECT valor FROM configuracion WHERE clave = 'patron_codigo'`;
  return new RegExp(fila?.valor ?? PATRON_CODIGO_DEFECTO);
}

function validarAsociaciones(asociaciones: AsociacionEntrada[]) {
  const principales = asociaciones.filter((a) => a.esPrincipal).length;
  if (asociaciones.length === 0 || principales !== 1) {
    throw new Error(
      "El documento necesita al menos una asociación y exactamente una principal",
    );
  }
}

async function insertarAsociaciones(
  tx: Cliente,
  documentoId: number,
  asociaciones: AsociacionEntrada[],
) {
  for (const a of asociaciones) {
    await tx`INSERT INTO documento_proceso (documento_id, proceso_id, subproceso_id, es_principal)
      VALUES (${documentoId}, ${a.procesoId ?? null}, ${a.subprocesoId ?? null}, ${a.esPrincipal})`;
  }
}

export async function crearDocumento(
  datos: DatosDocumento,
  usuarioId: number,
): Promise<{ documentoId: number; versionId: number }> {
  validarAsociaciones(datos.asociaciones);
  const sql = obtenerSql();
  return await sql.begin(async (tx) => {
    const [doc] = await tx`INSERT INTO documentos (codigo, titulo, tipo_id, descripcion, palabras_clave)
      VALUES (${datos.codigo}, ${datos.titulo}, ${datos.tipoId},
              ${datos.descripcion}, ${datos.palabrasClave})
      RETURNING id`;
    const [version] = await tx`INSERT INTO documento_versiones (documento_id, numero, estado)
      VALUES (${doc.id}, 1, 'borrador') RETURNING id`;
    await insertarAsociaciones(tx, doc.id, datos.asociaciones);
    await registrarAuditoria(tx, {
      usuarioId, accion: "crear_documento", entidad: "documento",
      entidadId: doc.id, detalle: { codigo: datos.codigo, titulo: datos.titulo },
    });
    return { documentoId: doc.id, versionId: version.id };
  });
}

export async function crearVersionBorrador(
  documentoId: number,
  usuarioId: number,
): Promise<{ versionId: number; numero: number }> {
  const sql = obtenerSql();
  return await sql.begin(async (tx) => {
    const [borrador] = await tx`SELECT 1 FROM documento_versiones
      WHERE documento_id = ${documentoId} AND estado = 'borrador'`;
    if (borrador) {
      throw new Error("Ya hay una versión en borrador: publíquela o edítela");
    }
    const [{ siguiente }] = await tx`SELECT coalesce(max(numero), 0) + 1 AS siguiente
      FROM documento_versiones WHERE documento_id = ${documentoId}`;
    const [version] = await tx`INSERT INTO documento_versiones (documento_id, numero, estado)
      VALUES (${documentoId}, ${siguiente}, 'borrador') RETURNING id, numero`;
    await registrarAuditoria(tx, {
      usuarioId, accion: "crear_version", entidad: "documento_version",
      entidadId: version.id, detalle: { documentoId, numero: version.numero },
    });
    return { versionId: version.id, numero: version.numero };
  });
}

export type DatosVersion = {
  fechaElaboracion: string | null;
  fechaRevision: string | null;
  fechaAprobacion: string | null;
  elaboro: string | null;
  reviso: string | null;
  aprobo: string | null;
  resumenCambios: string | null;
};

export async function editarVersionBorrador(
  versionId: number,
  datos: DatosVersion,
  usuarioId: number,
): Promise<void> {
  const sql = obtenerSql();
  await sql.begin(async (tx) => {
    const [actualizada] = await tx`UPDATE documento_versiones SET
        fecha_elaboracion = ${datos.fechaElaboracion},
        fecha_revision = ${datos.fechaRevision},
        fecha_aprobacion = ${datos.fechaAprobacion},
        elaboro = ${datos.elaboro}, reviso = ${datos.reviso}, aprobo = ${datos.aprobo},
        resumen_cambios = ${datos.resumenCambios}
      WHERE id = ${versionId} AND estado = 'borrador'
      RETURNING id`;
    if (!actualizada) {
      throw new Error("Solo se puede editar una versión en borrador");
    }
    await registrarAuditoria(tx, {
      usuarioId, accion: "editar_version", entidad: "documento_version",
      entidadId: versionId, detalle: datos,
    });
  });
}

export async function editarMetadatos(
  documentoId: number,
  datos: DatosDocumento,
  usuarioId: number,
): Promise<void> {
  validarAsociaciones(datos.asociaciones);
  const sql = obtenerSql();
  await sql.begin(async (tx) => {
    const [actual] = await tx`SELECT codigo FROM documentos WHERE id = ${documentoId}`;
    if (!actual) throw new Error("El documento no existe");
    if (datos.codigo !== actual.codigo) {
      const [publicada] = await tx`SELECT 1 FROM documento_versiones
        WHERE documento_id = ${documentoId} AND estado <> 'borrador' LIMIT 1`;
      if (publicada) {
        throw new Error("El código es inmutable: el documento ya fue publicado");
      }
    }
    await tx`UPDATE documentos SET codigo = ${datos.codigo}, titulo = ${datos.titulo},
        tipo_id = ${datos.tipoId}, descripcion = ${datos.descripcion},
        palabras_clave = ${datos.palabrasClave}, actualizado_en = now()
      WHERE id = ${documentoId}`;
    await tx`DELETE FROM documento_proceso WHERE documento_id = ${documentoId}`;
    await insertarAsociaciones(tx, documentoId, datos.asociaciones);
    await registrarAuditoria(tx, {
      usuarioId, accion: "editar_documento", entidad: "documento",
      entidadId: documentoId,
      detalle: { codigoAnterior: actual.codigo, codigo: datos.codigo, titulo: datos.titulo },
    });
  });
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run tests/publicar.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Lint y commit**

```bash
npm run lint
git add src/db/consultas/admin.ts tests/publicar.test.ts
git commit -m "feat: crear documento/version borrador y editar metadatos con auditoria

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Publicar y anular — la transacción central (regla ISO 1)

**Files:**
- Modify: `src/db/consultas/admin.ts`
- Test: `tests/publicar.test.ts` (segunda mitad)

**Interfaces:**
- Consumes: documento/versión creados en Task 5.
- Produces:
  - `publicarVersion(versionId: number, usuarioId: number): Promise<{ documentoId: number; obsoletas: number }>` — TODO en una transacción con `FOR UPDATE`: valida borrador + archivo principal + evidencia de aprobación; vigente actual → `obsoleto`; borrador → `vigente`; auditoría.
  - `anularVigente(documentoId: number, usuarioId: number): Promise<void>` — vigente → `anulado` + auditoría; falla si no hay vigente.

- [ ] **Step 1: Test que falla** — agregar a `tests/publicar.test.ts`:

```ts
import { anularVigente, publicarVersion } from "@/db/consultas/admin";

// Inserta una fila mínima en archivos para poder publicar (el flujo real
// pasa por el handler de subida; aquí se prueba SOLO la transacción).
async function archivoFalso(versionId: number, sufijo: string) {
  await sql()`INSERT INTO archivos (version_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
    VALUES (${versionId}, 'principal', ${"pruebas/falso-" + sufijo + ".pdf"},
            'falso.pdf', 'pdf', 'application/pdf', 100, ${"hash-" + sufijo})`;
}

describe("publicar y anular", () => {
  it("no publica sin archivo principal", async () => {
    const [v] = await sql()`SELECT v.id FROM documento_versiones v
      JOIN documentos d ON d.id = v.documento_id
      WHERE d.codigo = ${CODIGO} AND v.estado = 'borrador'`;
    await expect(publicarVersion(v.id, usuarioId)).rejects.toThrow(/principal/);
  });

  it("publica v1: queda vigente, con auditoria", async () => {
    const [v] = await sql()`SELECT v.id FROM documento_versiones v
      JOIN documentos d ON d.id = v.documento_id
      WHERE d.codigo = ${CODIGO} AND v.estado = 'borrador'`;
    await archivoFalso(v.id, "v1");
    const r = await publicarVersion(v.id, usuarioId);
    expect(r.obsoletas).toBe(0);
    const [v2] = await sql()`SELECT estado FROM documento_versiones WHERE id = ${v.id}`;
    expect(v2.estado).toBe("vigente");
  });

  it("publicar v2 vuelve obsoleta a v1 en la misma transaccion", async () => {
    const [d] = await sql()`SELECT id FROM documentos WHERE codigo = ${CODIGO}`;
    const { versionId } = await crearVersionBorrador(d.id, usuarioId);
    await editarVersionBorrador(versionId, {
      fechaElaboracion: null, fechaRevision: null, fechaAprobacion: "2026-07-15",
      elaboro: null, reviso: null, aprobo: "Gerente", resumenCambios: "Cambio",
    }, usuarioId);
    await archivoFalso(versionId, "v2");
    const r = await publicarVersion(versionId, usuarioId);
    expect(r.obsoletas).toBe(1);

    const estados = await sql()`SELECT numero, estado FROM documento_versiones
      WHERE documento_id = ${d.id} ORDER BY numero`;
    expect(estados).toMatchObject([
      { numero: 1, estado: "obsoleto" },
      { numero: 2, estado: "vigente" },
    ]);
    // La regla de oro: exactamente UNA vigente.
    const vigentes = await sql()`SELECT 1 FROM documento_versiones
      WHERE documento_id = ${d.id} AND estado = 'vigente'`;
    expect(vigentes.length).toBe(1);
  });

  it("no publica un borrador sin evidencia de aprobacion", async () => {
    const [d] = await sql()`SELECT id FROM documentos WHERE codigo = ${CODIGO}`;
    const { versionId } = await crearVersionBorrador(d.id, usuarioId);
    await archivoFalso(versionId, "v3");
    await expect(publicarVersion(versionId, usuarioId)).rejects.toThrow(/aprobaci/);
  });

  it("anularVigente saca el documento de circulacion", async () => {
    const [d] = await sql()`SELECT id FROM documentos WHERE codigo = ${CODIGO}`;
    await anularVigente(d.id, usuarioId);
    const vigentes = await sql()`SELECT 1 FROM documento_versiones
      WHERE documento_id = ${d.id} AND estado = 'vigente'`;
    expect(vigentes.length).toBe(0);
    const [anulada] = await sql()`SELECT 1 FROM documento_versiones
      WHERE documento_id = ${d.id} AND estado = 'anulado'`;
    expect(anulada).toBeTruthy();
    await expect(anularVigente(d.id, usuarioId)).rejects.toThrow(/vigente/);
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run tests/publicar.test.ts`
Expected: FAIL — `publicarVersion` no exportada.

- [ ] **Step 3: Implementar en `src/db/consultas/admin.ts`**

```ts
/**
 * LA transacción del sistema (regla ISO 1): publicar una versión nueva vuelve
 * obsoleta la anterior en el mismo commit. El índice único parcial
 * versiones_una_vigente_idx la respalda en BD; el orden de los UPDATE importa
 * (primero obsoleto, luego vigente) para no chocar con el índice.
 */
export async function publicarVersion(
  versionId: number,
  usuarioId: number,
): Promise<{ documentoId: number; obsoletas: number }> {
  const sql = obtenerSql();
  return await sql.begin(async (tx) => {
    const [version] = await tx`SELECT id, documento_id, numero, estado, aprobo, fecha_aprobacion
      FROM documento_versiones WHERE id = ${versionId} FOR UPDATE`;
    if (!version) throw new Error("La versión no existe");
    if (version.estado !== "borrador") {
      throw new Error("Solo se puede publicar una versión en borrador");
    }
    if (!version.aprobo || !version.fecha_aprobacion) {
      throw new Error(
        "Falta la evidencia de aprobación (quién aprobó y en qué fecha)",
      );
    }
    const [principal] = await tx`SELECT 1 FROM archivos
      WHERE version_id = ${versionId} AND rol = 'principal'`;
    if (!principal) {
      throw new Error("El borrador no tiene archivo principal");
    }

    const anteriores = await tx`UPDATE documento_versiones SET estado = 'obsoleto'
      WHERE documento_id = ${version.documento_id} AND estado = 'vigente'
      RETURNING numero`;
    await tx`UPDATE documento_versiones SET estado = 'vigente' WHERE id = ${versionId}`;
    await tx`UPDATE documentos SET actualizado_en = now() WHERE id = ${version.documento_id}`;
    await registrarAuditoria(tx, {
      usuarioId, accion: "publicar_version", entidad: "documento_version",
      entidadId: versionId,
      detalle: {
        documentoId: version.documento_id,
        numero: version.numero,
        obsoletas: anteriores.map((a) => a.numero),
      },
    });
    return { documentoId: version.documento_id, obsoletas: anteriores.length };
  });
}

export async function anularVigente(
  documentoId: number,
  usuarioId: number,
): Promise<void> {
  const sql = obtenerSql();
  await sql.begin(async (tx) => {
    const [anulada] = await tx`UPDATE documento_versiones SET estado = 'anulado'
      WHERE documento_id = ${documentoId} AND estado = 'vigente'
      RETURNING id, numero`;
    if (!anulada) {
      throw new Error("El documento no tiene versión vigente que anular");
    }
    await registrarAuditoria(tx, {
      usuarioId, accion: "anular_documento", entidad: "documento",
      entidadId: documentoId, detalle: { versionAnulada: anulada.numero },
    });
  });
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run tests/publicar.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Verificación cruzada con los tests existentes**

Run: `npm test`
Expected: toda la suite en verde (los tests de Fases 2–5 no se ven afectados).

- [ ] **Step 6: Lint y commit**

```bash
npm run lint
git add src/db/consultas/admin.ts tests/publicar.test.ts
git commit -m "feat: publicar version con obsolescencia automatica y anular en transaccion

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Validación de subida (`src/lib/subida.ts`)

**Files:**
- Create: `src/lib/subida.ts`
- Test: `tests/subida.test.ts`

**Interfaces:**
- Consumes: `fileTypeFromBuffer` de `file-type` (ya es dependencia).
- Produces:
  - `TAMANO_MAXIMO_BYTES = 25 * 1024 * 1024`
  - `TAMANO_MUESTRA_BYTES = 16384` (bytes iniciales para detectar magic bytes; los OOXML necesitan más que los 4100 mínimos de file-type)
  - `ROLES_ARCHIVO = ["principal", "editable", "anexo"] as const` y `type RolArchivo`
  - `sanearNombre(nombre: string): string` — sin rutas, translitera acentos/ñ, solo `[A-Za-z0-9._-]`, minúsculas, máx. 100 chars, nunca vacío ni `.`/`..` (compatible con `SEGMENTO_VALIDO` de `almacen.ts`).
  - `validarTipo(nombre: string, muestra: Uint8Array): Promise<{ ok: true; extension: string; mime: string } | { ok: false; error: string }>`

- [ ] **Step 1: Test que falla**

```ts
// tests/subida.test.ts
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { sanearNombre, validarTipo } from "@/lib/subida";

// Cabeceras mínimas reales por formato para probar magic bytes.
const PDF = new TextEncoder().encode("%PDF-1.4\n%fin");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const EXE = new TextEncoder().encode("MZ\x90\x00programa");

async function docxMinimo(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file("word/document.xml", "<w:document/>");
  return await zip.generateAsync({ type: "uint8array" });
}

describe("sanearNombre", () => {
  it("translitera acentos y elimina caracteres peligrosos", () => {
    expect(sanearNombre("Acta de Reunión Nº 5.pdf")).toBe("acta-de-reunion-n-5.pdf");
  });
  it("elimina rutas (path traversal)", () => {
    expect(sanearNombre("..\\..\\evil.pdf")).toBe("evil.pdf");
    expect(sanearNombre("../../etc/passwd")).toBe("passwd");
  });
  it("nunca devuelve vacío ni puntos sueltos", () => {
    expect(sanearNombre("")).toBe("archivo");
    expect(sanearNombre("...")).toBe("archivo");
  });
  it("recorta a 100 caracteres conservando la extensión", () => {
    const largo = "a".repeat(200) + ".pdf";
    const resultado = sanearNombre(largo);
    expect(resultado.length).toBeLessThanOrEqual(100);
    expect(resultado.endsWith(".pdf")).toBe(true);
  });
});

describe("validarTipo", () => {
  it("acepta un PDF real con extensión .pdf", async () => {
    const r = await validarTipo("informe.pdf", PDF);
    expect(r).toMatchObject({ ok: true, extension: "pdf", mime: "application/pdf" });
  });

  it("acepta un DOCX real (zip OOXML)", async () => {
    const r = await validarTipo("acta.docx", await docxMinimo());
    expect(r.ok).toBe(true);
  });

  it("rechaza extensión fuera de la allowlist", async () => {
    const r = await validarTipo("script.sh", PDF);
    expect(r).toMatchObject({ ok: false });
  });

  it("rechaza un ejecutable renombrado a .pdf (magic bytes mandan)", async () => {
    const r = await validarTipo("factura.pdf", EXE);
    expect(r.ok).toBe(false);
  });

  it("rechaza un PNG renombrado a .pdf (incoherencia)", async () => {
    const r = await validarTipo("foto.pdf", PNG);
    expect(r.ok).toBe(false);
  });

  it("acepta un PNG con su extensión", async () => {
    const r = await validarTipo("logo.png", PNG);
    expect(r).toMatchObject({ ok: true, mime: "image/png" });
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run tests/subida.test.ts`
Expected: FAIL — `Cannot find module '@/lib/subida'`

- [ ] **Step 3: Implementar `src/lib/subida.ts`**

```ts
import { fileTypeFromBuffer } from "file-type";

export const TAMANO_MAXIMO_BYTES = 25 * 1024 * 1024;
// file-type recomienda ≥4100 bytes; los OOXML (docx/xlsx/pptx) pueden requerir
// más para encontrar sus entradas dentro del zip.
export const TAMANO_MUESTRA_BYTES = 16384;

export const ROLES_ARCHIVO = ["principal", "editable", "anexo"] as const;
export type RolArchivo = (typeof ROLES_ARCHIVO)[number];

// Allowlist extensión → MIMEs aceptados según magic bytes (regla ISO 6).
// Los Office legados comparten contenedor OLE (application/x-cfb). Los OOXML
// aceptan también application/zip: file-type no siempre alcanza a distinguir
// el subtipo con la muestra — el riesgo residual (un zip renombrado) es
// aceptable en una intranet con un único admin autenticado.
const PERMITIDOS: Record<string, string[]> = {
  pdf: ["application/pdf"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
  ],
  xlsx: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
  ],
  pptx: [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/zip",
  ],
  doc: ["application/x-cfb"],
  xls: ["application/x-cfb"],
  ppt: ["application/x-cfb"],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
  zip: ["application/zip"],
  rar: ["application/x-rar-compressed", "application/vnd.rar"],
};

const LARGO_MAXIMO_NOMBRE = 100;

/**
 * Nombre seguro para el almacén: sin rutas, sin acentos, solo
 * [a-z0-9._-] — compatible con SEGMENTO_VALIDO de almacen.ts.
 */
export function sanearNombre(nombre: string): string {
  const base = nombre.split(/[\\/]/).pop() ?? "";
  let limpio = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-]+$/g, "");
  if (!limpio || /^\.+$/.test(limpio)) return "archivo";
  if (limpio.length > LARGO_MAXIMO_NOMBRE) {
    const punto = limpio.lastIndexOf(".");
    const extension = punto > 0 ? limpio.slice(punto) : "";
    limpio = limpio.slice(0, LARGO_MAXIMO_NOMBRE - extension.length) + extension;
  }
  return limpio;
}

export type ResultadoTipo =
  | { ok: true; extension: string; mime: string }
  | { ok: false; error: string };

/**
 * Valida extensión (allowlist) Y magic bytes (file-type) y que ambos sean
 * coherentes. El MIME devuelto es el DETECTADO, nunca el declarado (regla 6).
 */
export async function validarTipo(
  nombre: string,
  muestra: Uint8Array,
): Promise<ResultadoTipo> {
  const punto = nombre.lastIndexOf(".");
  const extension = punto > 0 ? nombre.slice(punto + 1).toLowerCase() : "";
  const aceptados = PERMITIDOS[extension];
  if (!aceptados) {
    return {
      ok: false,
      error: `Formato no permitido: .${extension || "(sin extensión)"}. Se aceptan PDF, Office, imágenes y ZIP/RAR`,
    };
  }
  const detectado = await fileTypeFromBuffer(muestra);
  if (!detectado) {
    return { ok: false, error: "No se reconoce el contenido del archivo" };
  }
  if (!aceptados.includes(detectado.mime)) {
    return {
      ok: false,
      error: `El contenido (${detectado.mime}) no corresponde a la extensión .${extension}`,
    };
  }
  return { ok: true, extension, mime: detectado.mime };
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run tests/subida.test.ts`
Expected: PASS (10 tests). Si el caso DOCX falla porque file-type devuelve `application/zip` con la muestra mínima, es EXACTAMENTE el porqué del fallback `application/zip` en la allowlist — verificar que el test pase gracias a él; si file-type no detecta nada, aumentar el contenido del docx de prueba (agregar `zip.file("word/_rels/document.xml.rels", "<Relationships/>")`).

- [ ] **Step 5: Lint y commit**

```bash
npm run lint
git add src/lib/subida.ts tests/subida.test.ts
git commit -m "feat: validacion de subida por allowlist y magic bytes con nombres saneados

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Handlers de archivos del admin (subida streaming, vista previa, eliminar)

**Files:**
- Create: `src/lib/servir-archivo.ts` (extraído del route público)
- Modify: `src/app/documentos/[codigo]/archivos/[archivoId]/route.ts` (usar el helper; CERO cambio de comportamiento)
- Modify: `src/db/consultas/admin.ts` (consultas de archivos)
- Create: `src/app/admin/api/archivos/route.ts` (POST)
- Create: `src/app/admin/api/archivos/[archivoId]/route.ts` (GET + DELETE)
- Test: `tests/guardia.test.ts` (bloque del handler; el comportamiento con sesión se verifica manualmente en la Task 12)

**Interfaces:**
- Consumes: `requerirSesion` (Task 4), `sanearNombre`/`validarTipo`/límites (Task 7), `resolverRutaAlmacen`/`rutaBaseAlmacen` (existentes), `registrarAuditoria` (Task 5).
- Produces:
  - `respuestaArchivo(archivo: { ruta: string; mime: string; nombreOriginal: string }, esDescarga: boolean): Promise<NextResponse>` en `servir-archivo.ts` — 404 si la ruta es inválida o falta en disco; streaming con Content-Type/Disposition/no-store (misma lógica que hoy).
  - En `admin.ts`:
    - `obtenerVersionParaSubida(versionId: number): Promise<{ id: number; numero: number; documentoId: number; codigo: string; estado: string } | null>`
    - `registrarArchivo(datos: { versionId: number; rol: string; ruta: string; nombreOriginal: string; extension: string; mime: string; tamanoBytes: number; hashSha256: string }, usuarioId: number): Promise<{ id: number }>` — captura el error 23505 del índice `archivos_un_principal_idx` y lanza `Error("Ya hay un archivo principal en esta versión")`.
    - `obtenerArchivoAdmin(archivoId: number): Promise<{ id: number; ruta: string; mime: string; nombreOriginal: string; versionId: number; estadoVersion: string } | null>`
    - `eliminarArchivoBorrador(archivoId: number, usuarioId: number): Promise<{ ruta: string }>` — solo si la versión está en borrador; devuelve la ruta para desvincular el archivo físico después del commit.
  - HTTP:
    - `POST /admin/api/archivos?version=<id>&rol=<principal|editable|anexo>` con el archivo como **cuerpo crudo** y el nombre original en header `x-nombre-archivo` (URL-encoded). Respuestas: 201 `{ id, nombre, mime, tamanoBytes }`, o 400/401/403/404/409/413/415 `{ error }`.
    - `GET /admin/api/archivos/<id>` — sirve CUALQUIER estado (vista previa de borradores/obsoletos para el admin), `?descarga=1` como adjunto. No registra `eventos_consulta` (es el admin).
    - `DELETE /admin/api/archivos/<id>` — 200 `{ ok: true }` solo si la versión es borrador; borra fila y archivo físico; audita `eliminar_archivo`.

- [ ] **Step 1: Extraer `src/lib/servir-archivo.ts`**

Mover de `src/app/documentos/[codigo]/archivos/[archivoId]/route.ts` la función `contentDisposition` y el bloque de stat + stream + headers a:

```ts
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { resolverRutaAlmacen } from "@/lib/almacen";

export type ArchivoServible = {
  ruta: string;
  mime: string;
  nombreOriginal: string;
};

// Content-Disposition con nombre ASCII de respaldo + filename* UTF-8
// (RFC 6266/5987) para títulos con acentos.
function contentDisposition(tipo: "inline" | "attachment", nombre: string) {
  const ascii = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");
  return `${tipo}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}

/**
 * Respuesta de streaming para un archivo del almacén (reglas 3, 6 y 7):
 * MIME de BD, disposición correcta, no-store, y 404 ante ruta inválida o
 * archivo faltante. Compartida por la ruta pública (solo vigentes) y la del
 * admin (cualquier estado).
 */
export async function respuestaArchivo(
  archivo: ArchivoServible,
  esDescarga: boolean,
): Promise<NextResponse> {
  const rutaAbsoluta = resolverRutaAlmacen(archivo.ruta);
  if (!rutaAbsoluta) {
    console.error(`Ruta de almacén inválida en BD: ${archivo.ruta}`);
    return respuesta404();
  }
  let tamano: number;
  try {
    tamano = (await stat(rutaAbsoluta)).size;
  } catch {
    console.error(`Archivo faltante en el almacén: ${archivo.ruta}`);
    return respuesta404();
  }
  const flujo = Readable.toWeb(createReadStream(rutaAbsoluta)) as ReadableStream;
  return new NextResponse(flujo, {
    headers: {
      "Content-Type": archivo.mime,
      "Content-Length": String(tamano),
      "Content-Disposition": contentDisposition(
        esDescarga ? "attachment" : "inline",
        archivo.nombreOriginal,
      ),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}

export function respuesta404() {
  return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
}
```

Reescribir el route público para delegar (conservando rate limit, `obtenerArchivoVigente` y el registro de descarga tal cual están hoy — el diff debe ser solo la delegación).

- [ ] **Step 2: Verificar que nada se rompió**

Run: `npm test` y `npm run lint`
Expected: verde (los tests de `archivos-vigentes` cubren la ruta pública).

- [ ] **Step 3: Consultas de archivos en `admin.ts`**

```ts
export async function obtenerVersionParaSubida(versionId: number) {
  const sql = obtenerSql();
  const [v] = await sql`SELECT v.id, v.numero, v.estado, d.id AS documento_id, d.codigo
    FROM documento_versiones v JOIN documentos d ON d.id = v.documento_id
    WHERE v.id = ${versionId}`;
  if (!v) return null;
  return {
    id: v.id, numero: v.numero, estado: v.estado,
    documentoId: v.documento_id, codigo: v.codigo,
  };
}

export async function registrarArchivo(
  datos: {
    versionId: number; rol: string; ruta: string; nombreOriginal: string;
    extension: string; mime: string; tamanoBytes: number; hashSha256: string;
  },
  usuarioId: number,
): Promise<{ id: number }> {
  const sql = obtenerSql();
  try {
    return await sql.begin(async (tx) => {
      const [archivo] = await tx`INSERT INTO archivos
          (version_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
        VALUES (${datos.versionId}, ${datos.rol}, ${datos.ruta}, ${datos.nombreOriginal},
                ${datos.extension}, ${datos.mime}, ${datos.tamanoBytes}, ${datos.hashSha256})
        RETURNING id`;
      await registrarAuditoria(tx, {
        usuarioId, accion: "subir_archivo", entidad: "archivo", entidadId: archivo.id,
        detalle: { versionId: datos.versionId, rol: datos.rol, nombre: datos.nombreOriginal },
      });
      return { id: archivo.id };
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      throw new Error("Ya hay un archivo principal en esta versión");
    }
    throw err;
  }
}

export async function obtenerArchivoAdmin(archivoId: number) {
  const sql = obtenerSql();
  const [a] = await sql`SELECT a.id, a.ruta, a.mime, a.nombre_original, a.version_id, v.estado
    FROM archivos a JOIN documento_versiones v ON v.id = a.version_id
    WHERE a.id = ${archivoId}`;
  if (!a) return null;
  return {
    id: a.id, ruta: a.ruta, mime: a.mime, nombreOriginal: a.nombre_original,
    versionId: a.version_id, estadoVersion: a.estado,
  };
}

export async function eliminarArchivoBorrador(
  archivoId: number,
  usuarioId: number,
): Promise<{ ruta: string }> {
  const sql = obtenerSql();
  return await sql.begin(async (tx) => {
    const [archivo] = await tx`SELECT a.id, a.ruta, a.nombre_original, v.estado
      FROM archivos a JOIN documento_versiones v ON v.id = a.version_id
      WHERE a.id = ${archivoId} FOR UPDATE`;
    if (!archivo) throw new Error("El archivo no existe");
    if (archivo.estado !== "borrador") {
      throw new Error("Solo se pueden eliminar archivos de una versión en borrador");
    }
    await tx`DELETE FROM archivos WHERE id = ${archivoId}`;
    await registrarAuditoria(tx, {
      usuarioId, accion: "eliminar_archivo", entidad: "archivo", entidadId: archivoId,
      detalle: { nombre: archivo.nombre_original },
    });
    return { ruta: archivo.ruta };
  });
}
```

- [ ] **Step 4: Handler POST `src/app/admin/api/archivos/route.ts`**

```ts
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import {
  obtenerVersionParaSubida,
  registrarArchivo,
} from "@/db/consultas/admin";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { requerirSesion } from "@/lib/sesion-actual";
import {
  ROLES_ARCHIVO,
  sanearNombre,
  TAMANO_MAXIMO_BYTES,
  TAMANO_MUESTRA_BYTES,
  validarTipo,
  type RolArchivo,
} from "@/lib/subida";

export const dynamic = "force-dynamic";

function error(estado: number, mensaje: string) {
  return NextResponse.json({ error: mensaje }, { status: estado });
}

// CSRF del handler (las actions lo traen integrado; aquí es manual): el
// Origin, si viene, debe coincidir con el host servido.
function origenValido(peticion: NextRequest): boolean {
  const origen = peticion.headers.get("origin");
  if (!origen) return true; // sin Origin no hay vector CSRF de navegador
  const host =
    peticion.headers.get("x-forwarded-host") ?? peticion.headers.get("host");
  try {
    return new URL(origen).host === host;
  } catch {
    return false;
  }
}

/** Sufija -2, -3… si el nombre ya existe en la carpeta de la versión. */
async function rutaLibre(carpetaRelativa: string, nombre: string) {
  const punto = nombre.lastIndexOf(".");
  const base = punto > 0 ? nombre.slice(0, punto) : nombre;
  const extension = punto > 0 ? nombre.slice(punto) : "";
  for (let n = 0; n < 100; n++) {
    const candidato = n === 0 ? nombre : `${base}-${n + 1}${extension}`;
    const relativa = `${carpetaRelativa}/${candidato}`;
    const absoluta = resolverRutaAlmacen(relativa);
    if (!absoluta) return null;
    try {
      await stat(absoluta);
    } catch {
      return { relativa, absoluta };
    }
  }
  return null;
}

export async function POST(peticion: NextRequest) {
  let sesion;
  try {
    sesion = await requerirSesion();
  } catch {
    return error(401, "No autorizado");
  }
  if (!origenValido(peticion)) return error(403, "Origen no permitido");

  const versionId = Number(peticion.nextUrl.searchParams.get("version"));
  const rol = peticion.nextUrl.searchParams.get("rol") as RolArchivo;
  if (!Number.isInteger(versionId) || versionId <= 0) {
    return error(400, "Falta la versión de destino");
  }
  if (!ROLES_ARCHIVO.includes(rol)) return error(400, "Rol de archivo inválido");

  const nombreCrudo = decodeURIComponent(
    peticion.headers.get("x-nombre-archivo") ?? "",
  );
  if (!nombreCrudo) return error(400, "Falta el nombre del archivo");

  const version = await obtenerVersionParaSubida(versionId);
  if (!version) return error(404, "La versión no existe");
  if (version.estado !== "borrador") {
    return error(409, "Solo se pueden subir archivos a una versión en borrador");
  }

  const declarado = Number(peticion.headers.get("content-length"));
  if (declarado > TAMANO_MAXIMO_BYTES) {
    return error(413, "El archivo supera el máximo de 25 MB");
  }
  if (!peticion.body) return error(400, "Cuerpo vacío");

  // ── Muestra inicial para magic bytes ──
  const lector = peticion.body.getReader();
  const previos: Uint8Array[] = [];
  let acumulado = 0;
  let fin = false;
  while (acumulado < TAMANO_MUESTRA_BYTES && !fin) {
    const { done, value } = await lector.read();
    if (done) { fin = true; break; }
    previos.push(value);
    acumulado += value.byteLength;
  }
  const muestra = new Uint8Array(acumulado);
  let despl = 0;
  for (const p of previos) { muestra.set(p, despl); despl += p.byteLength; }

  const tipo = await validarTipo(nombreCrudo, muestra);
  if (!tipo.ok) return error(415, tipo.error);

  // ── Destino en el almacén ──
  const nombre = sanearNombre(nombreCrudo);
  const carpeta = `documentos/${version.codigo}/v${version.numero}`;
  const destino = await rutaLibre(carpeta, nombre);
  if (!destino) return error(400, "No se pudo resolver un destino seguro");
  await mkdir(path.dirname(destino.absoluta), { recursive: true });

  // ── Streaming a disco con hash y tope de tamaño (nunca 25 MB en RAM) ──
  const hash = createHash("sha256");
  const salida = createWriteStream(destino.absoluta, { flags: "wx" });
  let total = 0;
  const escribir = (trozo: Uint8Array) =>
    new Promise<void>((resolver, rechazar) => {
      hash.update(trozo);
      total += trozo.byteLength;
      if (total > TAMANO_MAXIMO_BYTES) {
        rechazar(new Error("tamano"));
        return;
      }
      salida.write(Buffer.from(trozo), (err) => (err ? rechazar(err) : resolver()));
    });

  try {
    for (const p of previos) await escribir(p);
    while (!fin) {
      const { done, value } = await lector.read();
      if (done) break;
      await escribir(value);
    }
    await new Promise<void>((resolver, rechazar) =>
      salida.end((err?: Error | null) => (err ? rechazar(err) : resolver())),
    );
    if (total === 0) throw new Error("vacio");

    const { id } = await registrarArchivo(
      {
        versionId, rol, ruta: destino.relativa, nombreOriginal: nombreCrudo,
        extension: tipo.extension, mime: tipo.mime,
        tamanoBytes: total, hashSha256: hash.digest("hex"),
      },
      sesion.usuarioId,
    );
    return NextResponse.json(
      { id, nombre: nombreCrudo, mime: tipo.mime, tamanoBytes: total },
      { status: 201 },
    );
  } catch (err) {
    salida.destroy();
    await unlink(destino.absoluta).catch(() => {});
    const mensaje = (err as Error).message;
    if (mensaje === "tamano") return error(413, "El archivo supera el máximo de 25 MB");
    if (mensaje === "vacio") return error(400, "El archivo está vacío");
    if (mensaje.includes("principal")) return error(409, mensaje);
    console.error("Fallo en la subida:", err);
    return error(500, "No se pudo guardar el archivo");
  }
}
```

- [ ] **Step 5: Handler GET/DELETE `src/app/admin/api/archivos/[archivoId]/route.ts`**

```ts
import { unlink } from "node:fs/promises";
import { type NextRequest, NextResponse } from "next/server";
import {
  eliminarArchivoBorrador,
  obtenerArchivoAdmin,
} from "@/db/consultas/admin";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { respuesta404, respuestaArchivo } from "@/lib/servir-archivo";
import { requerirSesion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ archivoId: string }> };

// Vista previa del admin: sirve archivos de CUALQUIER estado (borradores para
// revisar antes de publicar, obsoletos para consulta histórica). La ruta
// pública sigue siendo la única para funcionarios y solo sirve vigentes.
export async function GET(peticion: NextRequest, { params }: Params) {
  try {
    await requerirSesion();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const id = Number((await params).archivoId);
  if (!Number.isInteger(id) || id <= 0) return respuesta404();
  const archivo = await obtenerArchivoAdmin(id);
  if (!archivo) return respuesta404();
  const esDescarga = peticion.nextUrl.searchParams.get("descarga") === "1";
  return respuestaArchivo(archivo, esDescarga);
}

export async function DELETE(_peticion: NextRequest, { params }: Params) {
  let sesion;
  try {
    sesion = await requerirSesion();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const id = Number((await params).archivoId);
  if (!Number.isInteger(id) || id <= 0) return respuesta404();
  try {
    const { ruta } = await eliminarArchivoBorrador(id, sesion.usuarioId);
    const absoluta = resolverRutaAlmacen(ruta);
    if (absoluta) await unlink(absoluta).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 409 });
  }
}
```

- [ ] **Step 6: Test del guard del handler** — agregar a `tests/guardia.test.ts`:

```ts
import { POST as subirArchivo } from "@/app/admin/api/archivos/route";
import { DELETE as eliminarArchivo, GET as verArchivo } from "@/app/admin/api/archivos/[archivoId]/route";

describe("handlers de archivos sin sesión", () => {
  const params = { params: Promise.resolve({ archivoId: "1" }) };

  it("POST sin cookie responde 401", async () => {
    const res = await subirArchivo(
      new NextRequest("http://localhost:3000/admin/api/archivos?version=1&rol=principal", {
        method: "POST",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("GET sin cookie responde 401", async () => {
    const res = await verArchivo(
      new NextRequest("http://localhost:3000/admin/api/archivos/1"), params,
    );
    expect(res.status).toBe(401);
  });

  it("DELETE sin cookie responde 401", async () => {
    const res = await eliminarArchivo(
      new NextRequest("http://localhost:3000/admin/api/archivos/1", { method: "DELETE" }),
      params,
    );
    expect(res.status).toBe(401);
  });
});
```

(`requerirSesion` llama `cookies()` fuera de un request de Next: lanza, el catch responde 401 — exactamente el comportamiento que exige la regla ISO 4.)

Run: `npx vitest run tests/guardia.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 7: Lint, suite completa y commit**

```bash
npm run lint && npm test
git add src/lib/servir-archivo.ts src/app/documentos src/app/admin/api src/db/consultas/admin.ts tests/guardia.test.ts
git commit -m "feat: subida de archivos en streaming con validacion completa y servido admin

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Server Actions + página de ingreso

**Files:**
- Create: `src/app/admin/acciones.ts`
- Create: `src/app/admin/ingreso/page.tsx`
- Create: `src/componentes/admin/FormularioIngreso.tsx`
- Test: `tests/guardia.test.ts` (bloque de actions)

**Interfaces:**
- Consumes: todo lo de Tasks 1–6 (`crearSesion`, `verificarClave`, `hashearClave`, consultas de admin, `crearLimitador`, `ipDePeticion`).
- Produces (en `acciones.ts`, todas `'use server'`):
  - `type EstadoAccion = { ok: false; error: string } | null`
  - `ingresar(estadoPrevio: EstadoAccion, formData: FormData): Promise<EstadoAccion>` — única action SIN `requerirSesion`; con éxito setea cookie y `redirect("/admin")`.
  - `salir(): Promise<void>` — cierra sesión, borra cookie, `redirect("/admin/ingreso")`.
  - `crearDocumentoAccion(estadoPrevio, formData)` — valida patrón de código; con éxito `redirect` al detalle.
  - `editarDocumentoAccion(estadoPrevio, formData)` (campo oculto `documentoId`)
  - `crearVersionAccion(estadoPrevio, formData)` (campo oculto `documentoId`)
  - `editarVersionAccion(estadoPrevio, formData)` (campo oculto `versionId`)
  - `publicarAccion(estadoPrevio, formData)` (campo oculto `versionId`)
  - `anularAccion(estadoPrevio, formData)` (campo oculto `documentoId`)
  - Todas (salvo `ingresar`) empiezan con `await requerirSesion()` y terminan con `revalidatePath("/", "layout")` (la publicación cambia lo que ve el público en mapa, búsqueda y fichas).
- Convención de formularios para asociaciones (Task 11 la consume): checkboxes `name="asociaciones"` con valores `p:<procesoId>` / `s:<subprocesoId>`, radio `name="principal"` con el mismo formato; la principal se agrega sola si no está marcada como asociación.

- [ ] **Step 1: Implementar `src/app/admin/acciones.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { obtenerSql } from "@/db/cliente";
import {
  anularVigente,
  crearDocumento,
  crearVersionBorrador,
  editarMetadatos,
  editarVersionBorrador,
  obtenerPatronCodigo,
  publicarVersion,
  registrarAuditoria,
  type AsociacionEntrada,
  type DatosDocumento,
  type DatosVersion,
} from "@/db/consultas/admin";
import { ipDePeticion } from "@/db/consultas/eventos";
import { hashearClave, verificarClave } from "@/lib/clave";
import { crearLimitador } from "@/lib/limite";
import { cerrarSesion, crearSesion, COOKIE_SESION } from "@/lib/sesion";
import { requerirSesion } from "@/lib/sesion-actual";

export type EstadoAccion = { ok: false; error: string } | null;

// 5 intentos de login por minuto por IP: frena fuerza bruta sin castigar
// un dedazo. Instancia única en el NAS — el Map en memoria basta (D36).
const permitirIngreso = crearLimitador({ limite: 5, ventanaMs: 60_000 });

const ERROR_CREDENCIALES: EstadoAccion = {
  ok: false,
  error: "Usuario o clave incorrectos",
};

export async function ingresar(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const usuario = String(formData.get("usuario") ?? "").trim();
  const clave = String(formData.get("clave") ?? "");
  if (!usuario || !clave) return ERROR_CREDENCIALES;

  const ip = ipDePeticion(await headers());
  if (!permitirIngreso(ip)) {
    return { ok: false, error: "Demasiados intentos. Espere un minuto." };
  }

  const sql = obtenerSql();
  const [fila] = await sql`SELECT id, nombre, hash_clave FROM usuarios
    WHERE usuario = ${usuario} AND activo`;
  if (!fila) {
    // Mismo costo que verificar: no se puede distinguir por tiempo si el
    // usuario existe (enumeración).
    await hashearClave(clave);
    return ERROR_CREDENCIALES;
  }
  if (!(await verificarClave(fila.hash_clave, clave))) return ERROR_CREDENCIALES;

  const { token } = await crearSesion(fila.id);
  (await cookies()).set(COOKIE_SESION, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // La cookie dura más que la sesión a propósito: la BD es la fuente de
    // verdad (12 h deslizantes); un token vencido simplemente no valida.
    maxAge: 60 * 60 * 24 * 7,
  });
  await registrarAuditoria(sql, {
    usuarioId: fila.id, accion: "ingreso", entidad: "sesion",
    detalle: { ip },
  });
  redirect("/admin");
}

export async function salir(): Promise<void> {
  const sesion = await requerirSesion();
  const almacen = await cookies();
  const token = almacen.get(COOKIE_SESION)?.value;
  if (token) await cerrarSesion(token);
  almacen.delete(COOKIE_SESION);
  await registrarAuditoria(obtenerSql(), {
    usuarioId: sesion.usuarioId, accion: "salida", entidad: "sesion",
  });
  redirect("/admin/ingreso");
}

// ── Parseo de formularios ──

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim();
}

function textoONulo(formData: FormData, campo: string): string | null {
  return texto(formData, campo) || null;
}

function idNumerico(formData: FormData, campo: string): number {
  const n = Number(formData.get(campo));
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Falta ${campo}`);
  return n;
}

// Checkboxes "asociaciones" (p:<id> | s:<id>) + radio "principal".
function parsearAsociaciones(formData: FormData): AsociacionEntrada[] {
  const principal = String(formData.get("principal") ?? "");
  const marcadas = new Set(formData.getAll("asociaciones").map(String));
  if (principal) marcadas.add(principal);
  const asociaciones: AsociacionEntrada[] = [];
  for (const marca of marcadas) {
    const [tipo, id] = marca.split(":");
    const numero = Number(id);
    if (!Number.isInteger(numero) || numero <= 0) continue;
    asociaciones.push({
      ...(tipo === "p" ? { procesoId: numero } : { subprocesoId: numero }),
      esPrincipal: marca === principal,
    });
  }
  return asociaciones;
}

async function parsearDocumento(formData: FormData): Promise<DatosDocumento> {
  const codigo = texto(formData, "codigo").toUpperCase();
  const patron = await obtenerPatronCodigo();
  if (!patron.test(codigo)) {
    throw new Error(
      "El código no cumple el formato TIPO-PROCESO-CONSECUTIVO (ej. PR-GTH-001)",
    );
  }
  const titulo = texto(formData, "titulo");
  if (!titulo) throw new Error("El título es obligatorio");
  return {
    codigo,
    titulo,
    tipoId: idNumerico(formData, "tipoId"),
    descripcion: textoONulo(formData, "descripcion"),
    palabrasClave: textoONulo(formData, "palabrasClave"),
    asociaciones: parsearAsociaciones(formData),
  };
}

function parsearVersion(formData: FormData): DatosVersion {
  return {
    fechaElaboracion: textoONulo(formData, "fechaElaboracion"),
    fechaRevision: textoONulo(formData, "fechaRevision"),
    fechaAprobacion: textoONulo(formData, "fechaAprobacion"),
    elaboro: textoONulo(formData, "elaboro"),
    reviso: textoONulo(formData, "reviso"),
    aprobo: textoONulo(formData, "aprobo"),
    resumenCambios: textoONulo(formData, "resumenCambios"),
  };
}

// Envuelve la mutación: requerirSesion SIEMPRE primero; los errores de
// negocio vuelven al formulario como { ok: false } sin perder lo escrito.
async function mutacion(
  formData: FormData,
  fn: (usuarioId: number, formData: FormData) => Promise<string | void>,
): Promise<EstadoAccion> {
  const sesion = await requerirSesion();
  let destino: string | void;
  try {
    destino = await fn(sesion.usuarioId, formData);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  revalidatePath("/", "layout");
  if (destino) redirect(destino);
  return null;
}

export async function crearDocumentoAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    const datos = await parsearDocumento(formData);
    await crearDocumento(datos, usuarioId);
    return `/admin/documentos/${datos.codigo}`;
  });
}

export async function editarDocumentoAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    const datos = await parsearDocumento(formData);
    await editarMetadatos(idNumerico(formData, "documentoId"), datos, usuarioId);
    return `/admin/documentos/${datos.codigo}`;
  });
}

export async function crearVersionAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    await crearVersionBorrador(idNumerico(formData, "documentoId"), usuarioId);
  });
}

export async function editarVersionAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    await editarVersionBorrador(
      idNumerico(formData, "versionId"),
      parsearVersion(formData),
      usuarioId,
    );
  });
}

export async function publicarAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    await publicarVersion(idNumerico(formData, "versionId"), usuarioId);
  });
}

export async function anularAccion(
  _estadoPrevio: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  return mutacion(formData, async (usuarioId) => {
    await anularVigente(idNumerico(formData, "documentoId"), usuarioId);
  });
}
```

OJO con `redirect` dentro de `mutacion`: `redirect` lanza `NEXT_REDIRECT` a propósito — debe ir FUERA del `try` (como está arriba) para no capturarlo como error de negocio.

- [ ] **Step 2: `src/componentes/admin/FormularioIngreso.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { ingresar, type EstadoAccion } from "@/app/admin/acciones";

export function FormularioIngreso() {
  const [estado, accion, pendiente] = useActionState<EstadoAccion, FormData>(
    ingresar,
    null,
  );
  return (
    <form action={accion} className="flex w-full max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Usuario
        <input
          name="usuario"
          autoComplete="username"
          required
          className="rounded-md border border-input bg-white px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Clave
        <input
          name="clave"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-md border border-input bg-white px-3 py-2"
        />
      </label>
      {estado && (
        <p role="alert" className="text-sm text-red-700">
          {estado.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pendiente}
        className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60"
      >
        {pendiente ? "Verificando…" : "Ingresar"}
      </button>
    </form>
  );
}
```

(Ajustar clases a los tokens reales de `globals.css` — revisar cómo las páginas existentes usan `bg-primary`/`border-input`; si el proyecto no usa esas utilidades de shadcn, copiar las clases de un formulario existente como el de `/buscar`.)

- [ ] **Step 3: `src/app/admin/ingreso/page.tsx`**

```tsx
import type { Metadata } from "next";
import { FormularioIngreso } from "@/componentes/admin/FormularioIngreso";

export const metadata: Metadata = { title: "Ingreso — Administración SGC" };

export default function PaginaIngreso() {
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="font-display text-2xl font-semibold">Administración del SGC</h1>
        <p className="text-sm text-muted-foreground">
          Acceso exclusivo para la administración de documentos
        </p>
      </div>
      <FormularioIngreso />
    </main>
  );
}
```

- [ ] **Step 4: Test del guard de actions** — agregar a `tests/guardia.test.ts`:

```ts
import {
  anularAccion,
  crearDocumentoAccion,
  crearVersionAccion,
  editarDocumentoAccion,
  editarVersionAccion,
  publicarAccion,
  salir,
} from "@/app/admin/acciones";

describe("actions de mutación sin sesión", () => {
  // Fuera de un request de Next, cookies() lanza y requerirSesion propaga:
  // ninguna mutación es alcanzable sin sesión (regla ISO 4).
  const fd = new FormData();
  const casos: Array<[string, () => Promise<unknown>]> = [
    ["crearDocumentoAccion", () => crearDocumentoAccion(null, fd)],
    ["editarDocumentoAccion", () => editarDocumentoAccion(null, fd)],
    ["crearVersionAccion", () => crearVersionAccion(null, fd)],
    ["editarVersionAccion", () => editarVersionAccion(null, fd)],
    ["publicarAccion", () => publicarAccion(null, fd)],
    ["anularAccion", () => anularAccion(null, fd)],
    ["salir", () => salir()],
  ];
  for (const [nombre, invocar] of casos) {
    it(`${nombre} rechaza sin sesión`, async () => {
      await expect(invocar()).rejects.toThrow();
    });
  }
});
```

Run: `npx vitest run tests/guardia.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 5: Verificación manual del login**

Con la BD arriba y `npm run admin:asegurar` hecho: `npm run dev` →
`http://localhost:3000/admin` debe redirigir a `/admin/ingreso`; clave mala
→ "Usuario o clave incorrectos"; 6 intentos seguidos → mensaje de espera;
clave buena → redirect a `/admin` (404 por ahora: el layout llega en Task 10).
Verificar en BD: `SELECT accion FROM auditoria ORDER BY id DESC LIMIT 3` muestra `ingreso`.

- [ ] **Step 6: Lint y commit**

```bash
npm run lint
git add src/app/admin/acciones.ts src/app/admin/ingreso src/componentes/admin/FormularioIngreso.tsx tests/guardia.test.ts
git commit -m "feat: login del admin con rate limit, auditoria y actions del ciclo documental

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Consultas de lectura del panel + layout + tabla de documentos

**Files:**
- Modify: `src/db/consultas/admin.ts` (lecturas)
- Create: `src/app/admin/(panel)/layout.tsx`
- Create: `src/app/admin/(panel)/page.tsx`
- Create: `src/componentes/admin/EstadoBadge.tsx`
- Modify: `src/app/globals.css` (clase `.marca-estado`)

**Interfaces:**
- Consumes: `validarSesion`, `salir` (Task 9).
- Produces:
  - `type FilaDocumentoAdmin = { id: number; codigo: string; titulo: string; tipoNombre: string; tipoSigla: string; versionVigente: number | null; versionBorrador: number | null; anulado: boolean; actualizadoEn: string }`
  - `listarDocumentosAdmin(): Promise<FilaDocumentoAdmin[]>`
  - `type VersionAdmin = { id: number; numero: number; estado: string; fechaElaboracion: string | null; fechaRevision: string | null; fechaAprobacion: string | null; elaboro: string | null; reviso: string | null; aprobo: string | null; resumenCambios: string | null; archivos: Array<{ id: number; rol: string; nombreOriginal: string; mime: string; tamanoBytes: number }> }`
  - `type DocumentoAdmin = { id: number; codigo: string; titulo: string; tipoId: number; tipoNombre: string; descripcion: string | null; palabrasClave: string | null; publicado: boolean; asociaciones: Array<{ procesoId: number | null; subprocesoId: number | null; nombre: string; esPrincipal: boolean }>; versiones: VersionAdmin[] }`
  - `obtenerDocumentoAdmin(codigo: string): Promise<DocumentoAdmin | null>`
  - `listarTiposActivos(): Promise<Array<{ id: number; nombre: string; sigla: string }>>`
  - `listarMapaParaFormulario(): Promise<Array<{ id: number; nombre: string; subprocesos: Array<{ id: number; nombre: string }> }>>` (procesos activos con sus subprocesos activos, ordenados)
  - `<EstadoBadge estado={string} />` — borrador ámbar, vigente verde, obsoleto gris, anulado rojo, con etiqueta textual (nunca solo color).
  - Clase CSS `.marca-estado` con `data-marca="OBSOLETO"|"ANULADO"`: banda diagonal inequívoca (regla ISO 2).

- [ ] **Step 1: Lecturas en `admin.ts`**

```ts
export type FilaDocumentoAdmin = {
  id: number; codigo: string; titulo: string;
  tipoNombre: string; tipoSigla: string;
  versionVigente: number | null; versionBorrador: number | null;
  anulado: boolean; actualizadoEn: string;
};

export async function listarDocumentosAdmin(): Promise<FilaDocumentoAdmin[]> {
  const sql = obtenerSql();
  const filas = await sql`
    SELECT d.id, d.codigo, d.titulo, t.nombre AS tipo_nombre, t.sigla AS tipo_sigla,
      d.actualizado_en,
      (SELECT numero FROM documento_versiones WHERE documento_id = d.id AND estado = 'vigente') AS vigente,
      (SELECT numero FROM documento_versiones WHERE documento_id = d.id AND estado = 'borrador') AS borrador,
      EXISTS (SELECT 1 FROM documento_versiones WHERE documento_id = d.id AND estado = 'anulado') AS anulado
    FROM documentos d JOIN tipos_documento t ON t.id = d.tipo_id
    ORDER BY d.actualizado_en DESC`;
  return filas.map((f) => ({
    id: f.id, codigo: f.codigo, titulo: f.titulo,
    tipoNombre: f.tipo_nombre, tipoSigla: f.tipo_sigla,
    versionVigente: f.vigente, versionBorrador: f.borrador,
    anulado: f.anulado, actualizadoEn: String(f.actualizado_en),
  }));
}

export async function listarTiposActivos() {
  const sql = obtenerSql();
  const filas = await sql`SELECT id, nombre, sigla FROM tipos_documento
    WHERE activo ORDER BY orden`;
  return filas.map((f) => ({ id: f.id, nombre: f.nombre, sigla: f.sigla }));
}

export async function listarMapaParaFormulario() {
  const sql = obtenerSql();
  const filas = await sql`
    SELECT p.id, p.nombre,
      coalesce(json_agg(json_build_object('id', s.id, 'nombre', s.nombre) ORDER BY s.orden)
        FILTER (WHERE s.id IS NOT NULL), '[]') AS subprocesos
    FROM procesos p
    LEFT JOIN subprocesos s ON s.proceso_id = p.id AND s.activo
    WHERE p.activo
    GROUP BY p.id ORDER BY p.nombre`;
  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    subprocesos: f.subprocesos as Array<{ id: number; nombre: string }>,
  }));
}

export type VersionAdmin = {
  id: number; numero: number; estado: string;
  fechaElaboracion: string | null; fechaRevision: string | null;
  fechaAprobacion: string | null; elaboro: string | null;
  reviso: string | null; aprobo: string | null; resumenCambios: string | null;
  archivos: Array<{ id: number; rol: string; nombreOriginal: string; mime: string; tamanoBytes: number }>;
};

export type DocumentoAdmin = {
  id: number; codigo: string; titulo: string; tipoId: number; tipoNombre: string;
  descripcion: string | null; palabrasClave: string | null; publicado: boolean;
  asociaciones: Array<{ procesoId: number | null; subprocesoId: number | null; nombre: string; esPrincipal: boolean }>;
  versiones: VersionAdmin[];
};

export async function obtenerDocumentoAdmin(
  codigo: string,
): Promise<DocumentoAdmin | null> {
  const sql = obtenerSql();
  const [doc] = await sql`SELECT d.id, d.codigo, d.titulo, d.tipo_id, t.nombre AS tipo_nombre,
      d.descripcion, d.palabras_clave,
      EXISTS (SELECT 1 FROM documento_versiones WHERE documento_id = d.id AND estado <> 'borrador') AS publicado
    FROM documentos d JOIN tipos_documento t ON t.id = d.tipo_id
    WHERE d.codigo = ${codigo}`;
  if (!doc) return null;

  const asociaciones = await sql`
    SELECT dp.proceso_id, dp.subproceso_id, dp.es_principal,
      coalesce(p.nombre, pr.nombre || ' › ' || s.nombre) AS nombre
    FROM documento_proceso dp
    LEFT JOIN procesos p ON p.id = dp.proceso_id
    LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
    LEFT JOIN procesos pr ON pr.id = s.proceso_id
    WHERE dp.documento_id = ${doc.id}
    ORDER BY dp.es_principal DESC, nombre`;

  const versiones = await sql`
    SELECT v.id, v.numero, v.estado, v.fecha_elaboracion, v.fecha_revision,
      v.fecha_aprobacion, v.elaboro, v.reviso, v.aprobo, v.resumen_cambios,
      coalesce(json_agg(json_build_object(
          'id', a.id, 'rol', a.rol, 'nombreOriginal', a.nombre_original,
          'mime', a.mime, 'tamanoBytes', a.tamano_bytes) ORDER BY a.rol)
        FILTER (WHERE a.id IS NOT NULL), '[]') AS archivos
    FROM documento_versiones v
    LEFT JOIN archivos a ON a.version_id = v.id
    WHERE v.documento_id = ${doc.id}
    GROUP BY v.id ORDER BY v.numero DESC`;

  return {
    id: doc.id, codigo: doc.codigo, titulo: doc.titulo, tipoId: doc.tipo_id,
    tipoNombre: doc.tipo_nombre, descripcion: doc.descripcion,
    palabrasClave: doc.palabras_clave, publicado: doc.publicado,
    asociaciones: asociaciones.map((a) => ({
      procesoId: a.proceso_id, subprocesoId: a.subproceso_id,
      nombre: a.nombre, esPrincipal: a.es_principal,
    })),
    versiones: versiones.map((v) => ({
      id: v.id, numero: v.numero, estado: v.estado,
      fechaElaboracion: v.fecha_elaboracion, fechaRevision: v.fecha_revision,
      fechaAprobacion: v.fecha_aprobacion, elaboro: v.elaboro, reviso: v.reviso,
      aprobo: v.aprobo, resumenCambios: v.resumen_cambios,
      archivos: v.archivos as VersionAdmin["archivos"],
    })),
  };
}
```

- [ ] **Step 2: `src/componentes/admin/EstadoBadge.tsx`**

```tsx
const ESTILOS: Record<string, string> = {
  borrador: "bg-amber-100 text-amber-900 border-amber-300",
  vigente: "bg-green-100 text-green-900 border-green-300",
  obsoleto: "bg-gray-200 text-gray-700 border-gray-400",
  anulado: "bg-red-100 text-red-900 border-red-300",
};

const ETIQUETAS: Record<string, string> = {
  borrador: "Borrador",
  vigente: "Vigente",
  obsoleto: "Obsoleto",
  anulado: "Anulado",
};

// La etiqueta textual siempre acompaña al color (accesibilidad: el color
// nunca es la única señal).
export function EstadoBadge({ estado }: { estado: string }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${ESTILOS[estado] ?? ESTILOS.obsoleto}`}
    >
      {ETIQUETAS[estado] ?? estado}
    </span>
  );
}
```

- [ ] **Step 3: Banda diagonal en `globals.css`** (al final)

```css
/* Marca visual inequívoca de versiones fuera de circulación (regla ISO 2). */
.marca-estado {
  position: relative;
  overflow: hidden;
}
.marca-estado::after {
  content: attr(data-marca);
  position: absolute;
  top: 1rem;
  right: -3rem;
  transform: rotate(35deg);
  padding: 0.15rem 3.5rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  color: white;
  background: color-mix(in srgb, #6b7280 90%, black);
  pointer-events: none;
}
.marca-estado[data-marca="ANULADO"]::after {
  background: color-mix(in srgb, #b91c1c 90%, black);
}
```

- [ ] **Step 4: `src/app/admin/(panel)/layout.tsx`**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { salir } from "@/app/admin/acciones";
import { COOKIE_SESION, validarSesion } from "@/lib/sesion";

// Capa dos del guard: validación REAL contra BD en cada render del panel.
export default async function LayoutPanel({
  children,
}: {
  children: React.ReactNode;
}) {
  const almacen = await cookies();
  const sesion = await validarSesion(almacen.get(COOKIE_SESION)?.value);
  if (!sesion) redirect("/admin/ingreso");

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b py-4">
        <div className="flex items-center gap-6">
          <Link href="/admin" className="font-display text-lg font-semibold">
            Administración SGC
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/admin" className="hover:underline">Documentos</Link>
            <Link href="/" className="text-muted-foreground hover:underline">
              Ver portal público
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{sesion.nombre}</span>
          <form action={salir}>
            <button type="submit" className="rounded-md border px-3 py-1 hover:bg-muted">
              Salir
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
```

- [ ] **Step 5: `src/app/admin/(panel)/page.tsx`**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { listarDocumentosAdmin } from "@/db/consultas/admin";
import { EstadoBadge } from "@/componentes/admin/EstadoBadge";

export const metadata: Metadata = { title: "Documentos — Administración SGC" };

export default async function PaginaDocumentosAdmin() {
  const documentos = await listarDocumentosAdmin();

  return (
    <main>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Documentos</h1>
        <Link
          href="/admin/documentos/nuevo"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Nuevo documento
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Título</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {documentos.map((d) => (
              <tr key={d.id} className="border-t hover:bg-muted/50">
                <td className="px-3 py-2 font-mono">
                  <Link href={`/admin/documentos/${d.codigo}`} className="hover:underline">
                    {d.codigo}
                  </Link>
                </td>
                <td className="px-3 py-2">{d.titulo}</td>
                <td className="px-3 py-2">{d.tipoNombre}</td>
                <td className="px-3 py-2">
                  <span className="flex flex-wrap gap-1">
                    {d.versionVigente !== null && <EstadoBadge estado="vigente" />}
                    {d.versionBorrador !== null && <EstadoBadge estado="borrador" />}
                    {d.versionVigente === null && d.versionBorrador === null && d.anulado && (
                      <EstadoBadge estado="anulado" />
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {documentos.length === 0 && (
          <p className="px-3 py-8 text-center text-muted-foreground">
            Aún no hay documentos. Cree el primero con “Nuevo documento”.
          </p>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Verificación manual**

`npm run dev` → login → `/admin` muestra la tabla con los 28 documentos del
seed, badges de estado correctos, y "Salir" vuelve al ingreso e invalida la
sesión (volver a `/admin` redirige a ingreso).

- [ ] **Step 7: Lint y commit**

```bash
npm run lint
git add src/db/consultas/admin.ts src/app/admin src/componentes/admin src/app/globals.css
git commit -m "feat: panel admin con tabla de documentos, badges de estado y layout con guard

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Formulario de documento (crear + editar metadatos)

**Files:**
- Create: `src/componentes/admin/FormularioDocumento.tsx`
- Create: `src/app/admin/(panel)/documentos/nuevo/page.tsx`
- Create: `src/app/admin/(panel)/documentos/[codigo]/editar/page.tsx`

**Interfaces:**
- Consumes: `crearDocumentoAccion` / `editarDocumentoAccion` (Task 9 — convención `asociaciones` = `p:<id>`/`s:<id>` + radio `principal`), `listarTiposActivos`, `listarMapaParaFormulario`, `obtenerDocumentoAdmin` (Task 10).
- Produces: `<FormularioDocumento accion={ServerAction} tipos procesos valores? documentoId? codigoEditable />` — un solo componente para crear y editar.

- [ ] **Step 1: `src/componentes/admin/FormularioDocumento.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import type { EstadoAccion } from "@/app/admin/acciones";

type Tipo = { id: number; nombre: string; sigla: string };
type ProcesoConSub = {
  id: number;
  nombre: string;
  subprocesos: Array<{ id: number; nombre: string }>;
};

export type ValoresDocumento = {
  codigo: string;
  titulo: string;
  tipoId: number;
  descripcion: string | null;
  palabrasClave: string | null;
  asociaciones: Array<{ procesoId: number | null; subprocesoId: number | null; esPrincipal: boolean }>;
};

type Props = {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  tipos: Tipo[];
  procesos: ProcesoConSub[];
  valores?: ValoresDocumento;
  documentoId?: number;
  codigoEditable: boolean;
};

const claseCampo = "rounded-md border border-input bg-white px-3 py-2";

export function FormularioDocumento({
  accion, tipos, procesos, valores, documentoId, codigoEditable,
}: Props) {
  const [estado, enviar, pendiente] = useActionState(accion, null);

  const marca = (procesoId: number | null, subprocesoId: number | null) =>
    procesoId !== null ? `p:${procesoId}` : `s:${subprocesoId}`;
  const marcadas = new Set(
    (valores?.asociaciones ?? []).map((a) => marca(a.procesoId, a.subprocesoId)),
  );
  const principal = (valores?.asociaciones ?? []).find((a) => a.esPrincipal);

  return (
    <form action={enviar} className="flex max-w-2xl flex-col gap-5">
      {documentoId && <input type="hidden" name="documentoId" value={documentoId} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Código
          <input
            name="codigo"
            defaultValue={valores?.codigo}
            required
            readOnly={!codigoEditable}
            placeholder="PR-GTH-001"
            className={`${claseCampo} font-mono uppercase ${codigoEditable ? "" : "bg-muted text-muted-foreground"}`}
          />
          {!codigoEditable && (
            <span className="text-xs text-muted-foreground">
              Inmutable: el documento ya fue publicado
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Tipo
          <select name="tipoId" defaultValue={valores?.tipoId} required className={claseCampo}>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre} ({t.sigla})</option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Título
        <input name="titulo" defaultValue={valores?.titulo} required className={claseCampo} />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Descripción
        <textarea name="descripcion" defaultValue={valores?.descripcion ?? ""} rows={3} className={claseCampo} />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Palabras clave (separadas por coma — alimentan la búsqueda)
        <input name="palabrasClave" defaultValue={valores?.palabrasClave ?? ""} className={claseCampo} />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">
          Dónde aplica (marque los procesos/subprocesos; el radio ● define el propietario)
        </legend>
        <div className="max-h-80 overflow-y-auto rounded-md border p-3">
          {procesos.map((p) => (
            <details key={p.id} open={marcadas.has(`p:${p.id}`) || p.subprocesos.some((s) => marcadas.has(`s:${s.id}`))}>
              <summary className="flex cursor-pointer items-center gap-2 py-1 text-sm">
                <input
                  type="checkbox"
                  name="asociaciones"
                  value={`p:${p.id}`}
                  defaultChecked={marcadas.has(`p:${p.id}`)}
                  aria-label={`Aplica a ${p.nombre}`}
                />
                <input
                  type="radio"
                  name="principal"
                  value={`p:${p.id}`}
                  defaultChecked={principal?.procesoId === p.id}
                  aria-label={`${p.nombre} es el propietario`}
                />
                <span className="font-medium">{p.nombre}</span>
              </summary>
              <div className="ml-8 flex flex-col gap-1 pb-2">
                {p.subprocesos.map((s) => (
                  <span key={s.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="asociaciones"
                      value={`s:${s.id}`}
                      defaultChecked={marcadas.has(`s:${s.id}`)}
                      aria-label={`Aplica a ${s.nombre}`}
                    />
                    <input
                      type="radio"
                      name="principal"
                      value={`s:${s.id}`}
                      defaultChecked={principal?.subprocesoId === s.id}
                      aria-label={`${s.nombre} es el propietario`}
                    />
                    {s.nombre}
                  </span>
                ))}
              </div>
            </details>
          ))}
        </div>
      </fieldset>

      {estado && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {estado.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pendiente}
        className="self-start rounded-md bg-primary px-5 py-2 font-medium text-primary-foreground disabled:opacity-60"
      >
        {pendiente ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: `src/app/admin/(panel)/documentos/nuevo/page.tsx`**

```tsx
import type { Metadata } from "next";
import { crearDocumentoAccion } from "@/app/admin/acciones";
import { FormularioDocumento } from "@/componentes/admin/FormularioDocumento";
import { listarMapaParaFormulario, listarTiposActivos } from "@/db/consultas/admin";

export const metadata: Metadata = { title: "Nuevo documento — Administración SGC" };

export default async function PaginaNuevoDocumento() {
  const [tipos, procesos] = await Promise.all([
    listarTiposActivos(),
    listarMapaParaFormulario(),
  ]);
  return (
    <main>
      <h1 className="mb-2 font-display text-2xl font-semibold">Nuevo documento</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Se crea con su versión 1 en borrador: nada será visible al público
        hasta que la publique.
      </p>
      <FormularioDocumento
        accion={crearDocumentoAccion}
        tipos={tipos}
        procesos={procesos}
        codigoEditable
      />
    </main>
  );
}
```

- [ ] **Step 3: `src/app/admin/(panel)/documentos/[codigo]/editar/page.tsx`**

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { editarDocumentoAccion } from "@/app/admin/acciones";
import { FormularioDocumento } from "@/componentes/admin/FormularioDocumento";
import {
  listarMapaParaFormulario,
  listarTiposActivos,
  obtenerDocumentoAdmin,
} from "@/db/consultas/admin";

export const metadata: Metadata = { title: "Editar documento — Administración SGC" };

export default async function PaginaEditarDocumento({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const [documento, tipos, procesos] = await Promise.all([
    obtenerDocumentoAdmin(decodeURIComponent(codigo)),
    listarTiposActivos(),
    listarMapaParaFormulario(),
  ]);
  if (!documento) notFound();

  return (
    <main>
      <h1 className="mb-6 font-display text-2xl font-semibold">
        Editar {documento.codigo}
      </h1>
      <FormularioDocumento
        accion={editarDocumentoAccion}
        tipos={tipos}
        procesos={procesos}
        documentoId={documento.id}
        codigoEditable={!documento.publicado}
        valores={{
          codigo: documento.codigo,
          titulo: documento.titulo,
          tipoId: documento.tipoId,
          descripcion: documento.descripcion,
          palabrasClave: documento.palabrasClave,
          asociaciones: documento.asociaciones,
        }}
      />
    </main>
  );
}
```

- [ ] **Step 4: Verificación manual**

Crear un documento `PR-GTH-990` con asociación principal a Gestión del
Talento Humano → redirige al detalle (404 hasta la Task 12: verificar
en BD con `SELECT * FROM documentos WHERE codigo = 'PR-GTH-990'` que quedó
con versión 1 borrador). Código inválido (`hola`) → error en el formulario
sin perder lo escrito. Editar: cambiar el título y verificar auditoría.

- [ ] **Step 5: Lint y commit**

```bash
npm run lint
git add src/componentes/admin/FormularioDocumento.tsx "src/app/admin/(panel)/documentos"
git commit -m "feat: formularios de creacion y edicion de documentos con asociaciones al mapa

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Detalle del documento — versiones, carga drag & drop, publicar/anular

**Files:**
- Create: `src/componentes/admin/FormAccion.tsx`
- Create: `src/componentes/admin/ZonaCarga.tsx`
- Create: `src/app/admin/(panel)/documentos/[codigo]/page.tsx`

**Interfaces:**
- Consumes: `obtenerDocumentoAdmin` (Task 10), actions de Task 9, handlers de Task 8, `EstadoBadge`, clase `.marca-estado`.
- Produces:
  - `<FormAccion accion confirmacion? etiqueta campos>` — client genérico con `useActionState`: muestra el error de negocio, y si `confirmacion` está definida usa `<details>` nativo (funciona sin JS) para el paso de confirmación explícita.
  - `<ZonaCarga versionId />` — drag & drop + selector de archivos, rol por archivo, barra de progreso XHR, refresco al terminar.

- [ ] **Step 1: `src/componentes/admin/FormAccion.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import type { EstadoAccion } from "@/app/admin/acciones";

type Props = {
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  etiqueta: string;
  confirmacion?: string;
  campos: Record<string, string | number>;
  tono?: "primario" | "peligro";
};

/**
 * Formulario genérico de mutación. La confirmación usa <details> nativo:
 * el botón real solo aparece al desplegar — dos gestos deliberados, sin JS.
 */
export function FormAccion({ accion, etiqueta, confirmacion, campos, tono = "primario" }: Props) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const claseBoton =
    tono === "peligro"
      ? "rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-60"
      : "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60";

  const formulario = (
    <form action={enviar} className="flex flex-col items-start gap-2">
      {Object.entries(campos).map(([nombre, valor]) => (
        <input key={nombre} type="hidden" name={nombre} value={valor} />
      ))}
      <button type="submit" disabled={pendiente} className={claseBoton}>
        {pendiente ? "Procesando…" : etiqueta}
      </button>
      {estado && (
        <p role="alert" className="text-sm text-red-700">{estado.error}</p>
      )}
    </form>
  );

  if (!confirmacion) return formulario;
  return (
    <details className="rounded-md border p-2">
      <summary className="cursor-pointer text-sm font-medium">{etiqueta}…</summary>
      <div className="mt-2 flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{confirmacion}</p>
        {formulario}
      </div>
    </details>
  );
}
```

- [ ] **Step 2: `src/componentes/admin/ZonaCarga.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

// Duplicado consciente de ROLES_ARCHIVO: importar @/lib/subida aquí
// arrastraría file-type al bundle del cliente.
const ROLES = ["principal", "editable", "anexo"] as const;
type RolArchivo = (typeof ROLES)[number];

type Carga = {
  nombre: string;
  progreso: number; // 0–100
  estado: "subiendo" | "listo" | "error";
  mensaje?: string;
};

const ETIQUETA_ROL: Record<RolArchivo, string> = {
  principal: "Principal (lectura)",
  editable: "Editable (diligenciamiento)",
  anexo: "Anexo",
};

export function ZonaCarga({ versionId }: { versionId: number }) {
  const router = useRouter();
  const [rol, setRol] = useState<RolArchivo>("principal");
  const [cargas, setCargas] = useState<Carga[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const entradaRef = useRef<HTMLInputElement>(null);

  function actualizar(nombre: string, cambio: Partial<Carga>) {
    setCargas((prev) => prev.map((c) => (c.nombre === nombre ? { ...c, ...cambio } : c)));
  }

  function subir(archivo: File) {
    setCargas((prev) => [
      ...prev.filter((c) => c.nombre !== archivo.name),
      { nombre: archivo.name, progreso: 0, estado: "subiendo" },
    ]);
    const xhr = new XMLHttpRequest();
    const url = `/admin/api/archivos?version=${versionId}&rol=${rol}`;
    xhr.open("POST", url);
    xhr.setRequestHeader("x-nombre-archivo", encodeURIComponent(archivo.name));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        actualizar(archivo.name, { progreso: Math.round((e.loaded / e.total) * 100) });
      }
    };
    xhr.onload = () => {
      if (xhr.status === 201) {
        actualizar(archivo.name, { estado: "listo", progreso: 100 });
        router.refresh();
      } else {
        let mensaje = "Error en la subida";
        try { mensaje = JSON.parse(xhr.responseText).error ?? mensaje; } catch {}
        actualizar(archivo.name, { estado: "error", mensaje });
      }
    };
    xhr.onerror = () =>
      actualizar(archivo.name, { estado: "error", mensaje: "Error de red" });
    xhr.send(archivo);
  }

  function recibir(lista: FileList | null) {
    if (!lista) return;
    for (const archivo of Array.from(lista)) subir(archivo);
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        Rol de los archivos a subir
        <select
          value={rol}
          onChange={(e) => setRol(e.target.value as RolArchivo)}
          className="rounded-md border border-input bg-white px-2 py-1"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>{ETIQUETA_ROL[r]}</option>
          ))}
        </select>
      </label>

      <div
        role="button"
        tabIndex={0}
        aria-label="Zona de carga: arrastre archivos o presione para elegirlos"
        onClick={() => entradaRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && entradaRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); recibir(e.dataTransfer.files); }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm transition-colors ${
          arrastrando ? "border-primary bg-primary/5" : "border-input text-muted-foreground"
        }`}
      >
        <span className="font-medium">Arrastre los archivos aquí</span>
        <span>o haga clic para elegirlos (máx. 25 MB c/u)</span>
        <input
          ref={entradaRef}
          type="file"
          multiple
          hidden
          onChange={(e) => { recibir(e.target.files); e.target.value = ""; }}
        />
      </div>

      {cargas.length > 0 && (
        <ul className="flex flex-col gap-2" aria-live="polite">
          {cargas.map((c) => (
            <li key={c.nombre} className="text-sm">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate">{c.nombre}</span>
                <span className={c.estado === "error" ? "text-red-700" : "text-muted-foreground"}>
                  {c.estado === "listo" ? "Listo" : c.estado === "error" ? c.mensaje : `${c.progreso}%`}
                </span>
              </span>
              <span className="mt-1 block h-1.5 w-full overflow-hidden rounded bg-muted">
                <span
                  className={`block h-full transition-all ${c.estado === "error" ? "bg-red-500" : "bg-primary"}`}
                  style={{ width: `${c.progreso}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `src/app/admin/(panel)/documentos/[codigo]/page.tsx`**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  anularAccion,
  crearVersionAccion,
  editarVersionAccion,
  publicarAccion,
} from "@/app/admin/acciones";
import { EstadoBadge } from "@/componentes/admin/EstadoBadge";
import { FormAccion } from "@/componentes/admin/FormAccion";
import { ZonaCarga } from "@/componentes/admin/ZonaCarga";
import { obtenerDocumentoAdmin, type VersionAdmin } from "@/db/consultas/admin";

export const metadata: Metadata = { title: "Documento — Administración SGC" };

function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const claseCampo = "rounded-md border border-input bg-white px-3 py-1.5 text-sm";

function SeccionVersion({ version, vigenteExiste }: { version: VersionAdmin; vigenteExiste: boolean }) {
  const fueraDeCirculacion = version.estado === "obsoleto" || version.estado === "anulado";
  return (
    <section
      className={`rounded-lg border p-4 ${fueraDeCirculacion ? "marca-estado opacity-80" : ""}`}
      data-marca={fueraDeCirculacion ? version.estado.toUpperCase() : undefined}
      aria-label={`Versión ${version.numero}, ${version.estado}`}
    >
      <header className="mb-3 flex items-center gap-3">
        <h3 className="font-display text-lg font-semibold">Versión {version.numero}</h3>
        <EstadoBadge estado={version.estado} />
      </header>

      <ul className="mb-3 flex flex-col gap-1 text-sm">
        {version.archivos.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-2">
            <a href={`/admin/api/archivos/${a.id}`} target="_blank" className="font-medium hover:underline">
              {a.nombreOriginal}
            </a>
            <span className="text-muted-foreground">
              {a.rol} · {a.mime} · {tamanoLegible(a.tamanoBytes)}
            </span>
            {version.estado === "borrador" && (
              // Eliminación vía fetch DELETE: form pequeño progresivo.
              <EliminarArchivo archivoId={a.id} />
            )}
          </li>
        ))}
        {version.archivos.length === 0 && (
          <li className="text-muted-foreground">Sin archivos todavía.</li>
        )}
      </ul>

      {version.estado === "borrador" && (
        <div className="flex flex-col gap-4">
          <ZonaCarga versionId={version.id} />

          <details className="rounded-md border p-3" open={!version.aprobo}>
            <summary className="cursor-pointer text-sm font-medium">
              Control de la versión (elaboró / revisó / aprobó)
            </summary>
            <FormularioVersion version={version} />
          </details>

          <FormAccion
            accion={publicarAccion}
            etiqueta={`Publicar versión ${version.numero}`}
            confirmacion={
              vigenteExiste
                ? "La versión vigente actual pasará a OBSOLETO en el mismo instante. Los funcionarios verán esta versión de inmediato."
                : "El documento quedará visible para todo el hospital."
            }
            campos={{ versionId: version.id }}
          />
        </div>
      )}
      {version.resumenCambios && (
        <p className="mt-2 text-sm text-muted-foreground">Cambios: {version.resumenCambios}</p>
      )}
    </section>
  );
}

function FormularioVersion({ version }: { version: VersionAdmin }) {
  return (
    <FormAccionCampos versionId={version.id} version={version} />
  );
}

// Formulario de metadatos de la versión: server action directa con campos
// visibles (no confirmación): envuelto en el mismo FormAccion no aplica
// porque lleva inputs — se usa useActionState vía un client component
// dedicado. Para no duplicar, se define aquí mismo como client boundary:
import { FormularioVersionCliente } from "@/componentes/admin/FormularioVersionCliente";
function FormAccionCampos({ versionId, version }: { versionId: number; version: VersionAdmin }) {
  return <FormularioVersionCliente versionId={versionId} valores={version} accion={editarVersionAccion} />;
}
import { EliminarArchivo } from "@/componentes/admin/EliminarArchivo";

export default async function PaginaDocumentoAdmin({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const documento = await obtenerDocumentoAdmin(decodeURIComponent(codigo));
  if (!documento) notFound();

  const vigente = documento.versiones.find((v) => v.estado === "vigente");
  const borrador = documento.versiones.find((v) => v.estado === "borrador");

  return (
    <main className="flex flex-col gap-6">
      <header>
        <p className="font-mono text-sm text-muted-foreground">{documento.codigo}</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-semibold">{documento.titulo}</h1>
          <Link
            href={`/admin/documentos/${documento.codigo}/editar`}
            className="rounded-md border px-3 py-1 text-sm hover:bg-muted"
          >
            Editar metadatos
          </Link>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {documento.tipoNombre} · Aplica en:{" "}
          {documento.asociaciones
            .map((a) => (a.esPrincipal ? `${a.nombre} (propietario)` : a.nombre))
            .join(" · ")}
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        {!borrador && (
          <FormAccion
            accion={crearVersionAccion}
            etiqueta="Nueva versión (borrador)"
            campos={{ documentoId: documento.id }}
          />
        )}
        {vigente && (
          <FormAccion
            accion={anularAccion}
            etiqueta="Anular documento"
            tono="peligro"
            confirmacion="El documento saldrá de circulación SIN versión de reemplazo. Dejará de ser visible para los funcionarios. La versión queda retenida como ANULADO."
            campos={{ documentoId: documento.id }}
          />
        )}
        {vigente && (
          <Link
            href={`/documentos/${documento.codigo}`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Ver ficha pública
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {documento.versiones.map((v) => (
          <SeccionVersion key={v.id} version={v} vigenteExiste={Boolean(vigente)} />
        ))}
      </div>
    </main>
  );
}
```

NOTA de implementación: el bloque de arriba muestra la ESTRUCTURA; los
imports van todos al inicio del archivo (TypeScript no permite `import` a
mitad de módulo). Crear además los dos client components auxiliares:

`src/componentes/admin/FormularioVersionCliente.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import type { EstadoAccion } from "@/app/admin/acciones";

type Valores = {
  fechaElaboracion: string | null; fechaRevision: string | null;
  fechaAprobacion: string | null; elaboro: string | null;
  reviso: string | null; aprobo: string | null; resumenCambios: string | null;
};

const claseCampo = "rounded-md border border-input bg-white px-3 py-1.5 text-sm";

export function FormularioVersionCliente({
  versionId, valores, accion,
}: {
  versionId: number;
  valores: Valores;
  accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  return (
    <form action={enviar} className="mt-3 grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="versionId" value={versionId} />
      <label className="flex flex-col gap-1 text-sm">Elaboró
        <input name="elaboro" defaultValue={valores.elaboro ?? ""} className={claseCampo} />
      </label>
      <label className="flex flex-col gap-1 text-sm">Fecha de elaboración
        <input name="fechaElaboracion" type="date" defaultValue={valores.fechaElaboracion ?? ""} className={claseCampo} />
      </label>
      <label className="flex flex-col gap-1 text-sm">Revisó
        <input name="reviso" defaultValue={valores.reviso ?? ""} className={claseCampo} />
      </label>
      <label className="flex flex-col gap-1 text-sm">Fecha de revisión
        <input name="fechaRevision" type="date" defaultValue={valores.fechaRevision ?? ""} className={claseCampo} />
      </label>
      <label className="flex flex-col gap-1 text-sm">Aprobó (exigido para publicar)
        <input name="aprobo" defaultValue={valores.aprobo ?? ""} className={claseCampo} />
      </label>
      <label className="flex flex-col gap-1 text-sm">Fecha de aprobación (exigida para publicar)
        <input name="fechaAprobacion" type="date" defaultValue={valores.fechaAprobacion ?? ""} className={claseCampo} />
      </label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">Resumen de cambios
        <textarea name="resumenCambios" rows={2} defaultValue={valores.resumenCambios ?? ""} className={claseCampo} />
      </label>
      {estado && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{estado.error}</p>}
      <button type="submit" disabled={pendiente}
        className="justify-self-start rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-60 sm:col-span-2">
        {pendiente ? "Guardando…" : "Guardar control de versión"}
      </button>
    </form>
  );
}
```

`src/componentes/admin/EliminarArchivo.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function EliminarArchivo({ archivoId }: { archivoId: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function eliminar() {
    const res = await fetch(`/admin/api/archivos/${archivoId}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else setError((await res.json()).error ?? "No se pudo eliminar");
  }
  return (
    <span className="flex items-center gap-2">
      <button type="button" onClick={eliminar}
        className="text-xs text-red-700 underline-offset-2 hover:underline">
        Quitar
      </button>
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </span>
  );
}
```

- [ ] **Step 4: Verificación manual — la demo completa de la fase**

1. Login → `/admin` → abrir `PR-GTH-990` (creado en Task 11).
2. Arrastrar un PDF y un DOCX: barras de progreso, aparecen listados con MIME
   real. Subir un `.exe` renombrado a `.pdf` → error 415 visible en la lista.
3. Intentar publicar sin "aprobó" → error claro. Llenar control de versión.
4. Publicar (confirmación desplegable) → badge VIGENTE; la ficha pública
   `/documentos/PR-GTH-990` la muestra; el archivo descarga.
5. "Nueva versión (borrador)" → subir otro PDF, aprobar, publicar → v1 queda
   OBSOLETO con banda diagonal; el público solo ve v2.
6. "Anular documento" → desaparece del portal público (mapa, búsqueda y ficha
   → 404), y en el admin queda ANULADO retenido.
7. `SELECT accion FROM auditoria ORDER BY id DESC LIMIT 10` — el rastro
   completo: quién, qué y cuándo.

- [ ] **Step 5: Lint, suite completa y commit**

```bash
npm run lint && npm test
git add src/componentes/admin "src/app/admin/(panel)/documentos/[codigo]"
git commit -m "feat: detalle admin con carga drag y drop, publicar con confirmacion y anular

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: Cierre de fase — build, CI, CONTEXT.md y commit final

**Files:**
- Modify: `CONTEXT.md`
- Verify: build + suite + CI

- [ ] **Step 1: Verificación integral**

```bash
npm run lint && npm test && npm run build
```
Expected: todo verde. Revisar en la salida del build que `/admin/*` no quedó
prerenderizado como estático (deben ser rutas dinámicas por `cookies()`).

- [ ] **Step 2: Actualizar `CONTEXT.md`**

- Estado actual: Fase 6 completada, pendiente veredicto del usuario.
- Punto de reanudación con el recorrido de prueba de la demo (Step 4 de Task 12).
- Decisiones nuevas de la fase (numerarlas D37+): flujo borrador→publicar,
  25 MB, bootstrap por env vars + script, subida por cuerpo crudo streaming
  (no multipart) y su porqué, DELETE/GET admin de archivos, cookie 7 días con
  BD como fuente de verdad (12 h deslizantes), allowlist con fallback
  `application/zip` para OOXML y su porqué.
- Deuda técnica: los tests de sesion/publicar requieren BD dev (igual que los
  de fases anteriores); recordatorio de retirar `ADMIN_CLAVE` del compose tras
  el primer arranque (documentarlo en Fase 10 / INSTALACION.md).
- Pendiente del usuario: convención oficial de códigos (sigue bloqueando la
  validación fuerte).

- [ ] **Step 3: Commit de cierre y push**

```bash
git add CONTEXT.md
git commit -m "docs: actualizar CONTEXT.md al cierre de la Fase 6

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push
```

- [ ] **Step 4: Verificar CI en verde**

El workflow construye la imagen `linux/arm64`: el smoke de Argon2 (Task 1)
corre bajo QEMU. Consultar el estado con el token de `git credential fill`
contra la API de GitHub (no hay `gh` CLI en esta máquina — ver CONTEXT.md §3).
Expected: ambos jobs en verde. Si `@node-rs/argon2` no tiene prebuild ARM64
para esta versión de Node, el job `imagen-arm64` falla en el smoke: reportarlo
al usuario ANTES de buscar alternativas (regla: proponer antes de construir).

- [ ] **Step 5: Decir al usuario qué probar y cómo** (mensaje de cierre)

Entregar el recorrido de la demo (Task 12, Step 4) + credenciales de dev
(`ADMIN_USUARIO`/`ADMIN_CLAVE` de `.env.local`) + cómo resetear la clave
(`npm run admin:asegurar -- --forzar-clave`).
