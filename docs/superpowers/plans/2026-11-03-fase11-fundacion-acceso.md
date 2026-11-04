# Fase 11 — Fundación de acceso: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir SGC Integral en una aplicación con sesión obligatoria, cinco roles,
estructura organizacional, cuentas administradas (una a una y por lote), bloqueo por
cuenta, segundo factor opcional, registro de accesos, roles de base de datos de mínimo
privilegio y bitácora inmutable, sin perder nada de lo heredado.

**Architecture:** Se conserva la auth propia (cookie httpOnly, token hasheado en BD,
Argon2id) y el guard en dos capas; encima se añade una matriz de permisos fija en código
(`src/lib/permisos.ts`) que toda acción y handler consulta, un helper de alcance por
procesos, y grupos de rutas con layouts que exigen sesión completa. La base de datos
gana las tablas de estructura, accesos y códigos de recuperación, columnas de rol y
cuenta en `usuarios`, triggers de inmutabilidad y un rol `sgc_app` sin DDL ni borrado de
bitácora; el arranque del contenedor crea ese rol antes de migrar.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts`, Server Actions), TypeScript estricto,
Drizzle ORM + `postgres`, PostgreSQL 16, `@node-rs/argon2`, `zod` 4, `otpauth` 9
(TOTP, JS puro), `qrcode` (PNG en `data:` URL), Vitest, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-11-03-sgc-integral-plataforma-design.md` (diseño
maestro aprobado; §5.1, §5.2, §5.3, §5.9, §5.10, §8 Fase 11) y
`docs/superpowers/specs/2026-11-03-fase11-fundacion-acceso-design.md` (detalle de esta
fase: columnas, flujos, variables, valores). Este plan cita el segundo como "diseño F11".

## Global Constraints

- Node 24 en desarrollo, CI e imagen; mismo major (AGENTS.md).
- TypeScript estricto, sin `any` salvo justificación puntual; dominio, UI y código en
  español (`documento`, `proceso`, `versionVigente`).
- Server Components por defecto; `'use client'` solo donde hay interactividad.
- Página autenticada que consulta BD + `loading.tsx` ⇒ `export const dynamic =
  "force-dynamic"` (F9-D7). El build de CI corre sin `DATABASE_URL` (D12) y debe pasar.
- Cero dependencias externas en runtime: nada de CDN, fuentes remotas ni telemetría.
- Nunca `sql.raw` ni concatenación con entrada del usuario; Drizzle y `sql` etiquetado
  con parámetros (spec §5.9 fila 6).
- Nunca `dangerouslySetInnerHTML`; campos largos en texto plano (spec §5.9 fila 8).
- Toda ruta de escritura exige sesión y permiso en el servidor; la interfaz solo oculta
  (spec §5.9 filas 4 y 11). Handlers que escriben verifican `Origin` (fila 10).
- Validación por esquema `zod` en la frontera de cada acción nueva; cada acción acepta
  solo sus campos declarados (filas 7 y 15).
- Una sola versión vigente por documento, en la misma transacción (regla de negocio 1);
  obsoletos se retienen (regla 2); MIME por magic bytes (6); archivos fuera del webroot (7).
- Accesibilidad AA: teclado, foco visible, etiqueta textual junto a todo color.
- `proxy.ts` importa solo `sesion-constantes` (su bundle no arrastra postgres).
- Commits convencionales en español con el trailer
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Nada se borra físicamente si tiene historia (D47): usuarios, áreas y cargos se
  desactivan.

## Review Focus

1. **Cuenta bloqueada sin oráculo.** Con la cuenta bloqueada la respuesta es idéntica
   (mismo mensaje, mismo costo) sea la clave correcta o no, y el estado no cambia. Test
   en `tests/ingreso.test.ts`.
2. **El administrador se deja sin acceso a sí mismo.** Desactivar la propia cuenta o
   quitarse el rol `admin_sgc` debe rechazarse en el servidor. Test en Tarea 12.
3. **Ciclo en el organigrama** (A superior de B y B superior de A). Rechazado con mensaje.
   Test en Tarea 11.
4. **CSV de lote con BOM, separador `,` en vez de `;`, acentos, usuario repetido dentro
   del archivo y sigla de proceso inexistente.** Las filas malas se rechazan con número de
   línea; las buenas se crean. Test en Tarea 13.
5. **Sesión inactiva más de 60 minutos y `volver` manipulado.** La sesión se rechaza y
   el ingreso solo vuelve a rutas internas. Tests en Tarea 6 (inactividad) y Tarea 5
   (`rutas.test.ts`).

## Desviaciones del spec declaradas en este plan

- `tokens_un_uso` (spec §7, F11) se pospone a F16: sin SMTP no tiene consumidor.
- `usuarios.tema` es de F12.
- Next sube a la última 16.x (16.4.4 al planear), no a 16.3.x: mismo major, misma intención.
- `scripts/carga.ts` deja de servir sin sesión; se adapta en F19.

## Puntos de control para el usuario

- **Tras la Tarea 8:** toda la app exige ingreso con el `admin` existente, el portal
  funciona igual que antes detrás del login, y `npm test` está en verde. Es el primer
  momento de prueba manual.
- **Tras la Tarea 10:** el panel respeta permisos (aún con un solo usuario; los roles se
  prueban con los usuarios demo de la Tarea 16).
- **Tras la Tarea 17:** la demostración completa de la fase (spec §8 Fase 11).

## Estructura de archivos

**Nuevos**

| Archivo | Responsabilidad |
|---|---|
| `src/lib/roles.ts` | Lista de roles, etiquetas, `rolesConTotpObligatorio` |
| `src/lib/permisos.ts` | Matriz permiso → roles, `puede`, `requerirPermiso` |
| `src/lib/bloqueo.ts` | Cálculo puro del bloqueo por intentos |
| `src/lib/clave-politica.ts` + `src/lib/datos/claves-comunes.json` | Política de clave y clave temporal |
| `src/lib/ip.ts`, `src/lib/origen.ts`, `src/lib/rutas.ts` | IP tras proxy, verificación de `Origin`, rutas internas |
| `src/lib/cifrado.ts`, `src/lib/totp.ts` | AES-256-GCM con `APP_SECRETO`; TOTP y códigos de recuperación |
| `src/lib/validacion.ts`, `src/lib/esquemas/{cuenta,usuarios,estructura}.ts` | `parsearFormulario` con zod y los esquemas |
| `src/lib/cuenta-estado.ts` | Orden de flujos pendientes tras el ingreso |
| `src/lib/paginas.ts` | `exigirSesion`, `exigirPermiso` para páginas |
| `src/lib/alcance.ts` | `alcanceProcesos` |
| `src/lib/lote-usuarios.ts` | Plantilla y parseo del CSV de alta por lote |
| `src/db/roles-bd.ts` | `asegurarRolApp` |
| `src/db/consultas/{autenticacion,usuarios,estructura,accesos}.ts` | Capa de datos nueva |
| `src/db/semillas/{minima,demo}.ts` | Semillas separadas; `src/db/semilla.ts` queda como CLI |
| `drizzle/0002_*.sql`, `drizzle/0003_privilegios-sgc-app.sql` | Migraciones |
| `src/app/acciones-cuenta.ts` | Acciones de ingreso, factor, salida y cuenta |
| `src/app/admin/acciones-usuarios.ts`, `src/app/admin/acciones-estructura.ts` | Acciones del panel |
| `src/app/ingreso/page.tsx`, `src/app/ingreso/verificar/page.tsx` | Ingreso y segundo factor |
| `src/app/(portal)/layout.tsx`, `src/app/(portal)/sin-acceso/page.tsx` | Portal con sesión completa |
| `src/app/(cuenta)/layout.tsx`, `src/app/(cuenta)/cuenta/page.tsx`, `.../cuenta/clave-inicial/page.tsx`, `.../cuenta/segundo-factor/page.tsx`, `src/app/(cuenta)/aviso-datos/page.tsx` | Flujos de cuenta |
| `src/app/admin/(panel)/usuarios/{page,nuevo/page,[id]/page,lote/page}.tsx`, `.../usuarios/lote/plantilla/route.ts` | Usuarios |
| `src/app/admin/(panel)/estructura/{page,areas/nueva/page,areas/[id]/page,cargos/nuevo/page,cargos/[id]/page}.tsx` | Áreas y cargos |
| `src/app/admin/(panel)/accesos/page.tsx`, `src/app/admin/(panel)/sesiones/page.tsx` | Accesos y sesiones activas |
| `src/componentes/cuenta/*.tsx`, `src/componentes/admin/usuarios/*.tsx`, `src/componentes/admin/estructura/*.tsx` | Formularios cliente |
| `tests/*.test.ts` nuevos (ver cada tarea) | |
| `docs/manual/usuario/01-ingreso-clave-y-segundo-factor.md`, `02-usuarios-cargos-y-procesos.md` | Capítulos del manual |

**Modificados:** `package.json`, `src/db/esquema.ts`, `src/db/cliente.ts` (sin cambio de
API), `src/db/consultas/admin.ts` (`asegurarAdmin`), `src/db/consultas/eventos.ts`,
`src/lib/sesion.ts`, `src/lib/sesion-actual.ts`, `src/lib/arranque.ts`,
`scripts/arrancar.ts`, `drizzle.config.ts`, `src/proxy.ts`, `src/app/layout.tsx`,
`src/componentes/EncabezadoSitio.tsx`, `src/app/admin/comun.ts`, `src/app/admin/acciones.ts`,
`src/app/admin/acciones-mapa.ts`, `src/app/admin/ingreso/page.tsx`,
`src/app/admin/(panel)/layout.tsx` y sus páginas, `src/app/admin/api/archivos/*`,
`src/app/admin/(panel)/maestro/excel/route.ts`, páginas del portal (movidas a
`(portal)/`), `src/lib/bitacora-detalle.ts`, `src/db/consultas/mapa-admin.ts`
(`CLAVES_TEXTO`), `.env.example`, `docker-compose.dev.yml`, `docker-compose.nas.yml`,
`.env.nas.example`, `.env.ensayo`, `AGENTS.md`, `README.md`, `CONTEXT.md`, tests
heredados (`guardia`, `sesion`, `publicar`, `bitacora`, `a11y-estructura`,
`descarga-estampada`, `arranque`, `bitacora-detalle`, `esquema`).

---

### Tarea 1: Actualizar Next y añadir las dependencias de la fase

**Files:**
- Modify: `package.json`, `package-lock.json`
- Test: suite existente (`npm test`), `npm run lint`, `npm run build`

**Interfaces:**
- Produces: `zod` (4.x), `otpauth` (9.x), `qrcode` + `@types/qrcode` (dev) disponibles;
  Next y `eslint-config-next` en la última 16.x, misma versión exacta en ambos.

- [ ] **Paso 1: Anotar la línea base**

Run: `npm test 2>&1 | tail -5 && npm run lint`
Expected: 205 tests en verde (BD dev migrada y sembrada); lint limpio.

- [ ] **Paso 2: Subir Next**

Run: `npm view next@16 version --json | tail -3` y luego
`npm install --save-exact next@<última 16.x> eslint-config-next@<la misma>`
Expected: `package.json` con la misma versión exacta en `next` y `eslint-config-next`.

- [ ] **Paso 3: Leer la guía de actualización instalada**

Run: `sed -n 1,200p node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`
y revisar `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`
y `.../04-functions/cookies.md`.
Expected: anotar en el commit cualquier cambio que afecte `proxy.ts`, `cookies()`,
`params` como promesa o Server Actions. Si una API usada cambió, ajustarla aquí.

- [ ] **Paso 4: Añadir dependencias**

Run: `npm install zod otpauth qrcode && npm install -D @types/qrcode`
Expected: sin binarios nativos nuevos (`npm ls otpauth qrcode zod` muestra solo JS).

- [ ] **Paso 5: Verificar lint, tests y build**

Run: `npm run lint && npm test 2>&1 | tail -5 && npm run build 2>&1 | tail -15`
Expected: lint limpio, 205 tests en verde, build sin errores. `npm audit --omit=dev`
sin vulnerabilidades altas o críticas (anotar el resultado en el commit).

- [ ] **Paso 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(f11): subir Next a la última 16.x y añadir zod, otpauth y qrcode" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 2: Esquema de la fase y migración 0002

**Files:**
- Modify: `src/db/esquema.ts` (grupo 3, líneas 298-375)
- Create: `src/lib/roles.ts`, `drizzle/0002_<nombre>.sql` (generada + SQL manual), `drizzle/meta/*` (generados)
- Test: `tests/esquema.test.ts` (ampliar), `tests/roles.test.ts`; limpieza de `auditoria` fuera de `tests/publicar.test.ts`, `tests/bitacora.test.ts` y `tests/mapa-admin.test.ts`

**Interfaces:**
- Produces (`src/lib/roles.ts`):
  ```ts
  export const ROLES = ["admin_sgc", "gerencia", "control_interno", "lider_proceso", "consulta"] as const;
  export type Rol = (typeof ROLES)[number];
  export const ETIQUETA_ROL: Record<Rol, string>; // "Administrador del SGC", "Gerencia", "Control Interno", "Líder de proceso", "Consulta"
  export function esRol(v: unknown): v is Rol;
  export function rolesConTotpObligatorio(env: { EXIGIR_2FA_ROLES?: string } = process.env): Rol[];
  ```
- Produces (esquema): tablas `areas`, `cargos`, `usuarioProcesos`, `accesos`,
  `codigosRecuperacion`; columnas nuevas de `usuarios`, `sesiones`, `eventosConsulta`
  exactamente como la tabla del diseño F11 §2. `esquema.ts` importa `ROLES` para el CHECK.

- [ ] **Paso 1: Test de roles**

```ts
// tests/roles.test.ts
import { describe, expect, it } from "vitest";
import { ETIQUETA_ROL, ROLES, esRol, rolesConTotpObligatorio } from "@/lib/roles";

describe("roles", () => {
  it("son exactamente los cinco del spec, en este orden", () => {
    expect(ROLES).toEqual(["admin_sgc", "gerencia", "control_interno", "lider_proceso", "consulta"]);
    expect(Object.keys(ETIQUETA_ROL)).toHaveLength(5);
  });
  it("esRol distingue válidos de inválidos", () => {
    expect(esRol("gerencia")).toBe(true);
    expect(esRol("root")).toBe(false);
    expect(esRol(null)).toBe(false);
  });
  it("rolesConTotpObligatorio lee EXIGIR_2FA_ROLES e ignora basura", () => {
    expect(rolesConTotpObligatorio({})).toEqual([]);
    expect(rolesConTotpObligatorio({ EXIGIR_2FA_ROLES: "admin_sgc, gerencia,nada" })).toEqual(["admin_sgc", "gerencia"]);
  });
});
```

- [ ] **Paso 2: Correr y ver fallar**

Run: `npx vitest run tests/roles.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Paso 3: Implementar `src/lib/roles.ts`** con las firmas de arriba.

- [ ] **Paso 4: Correr y ver pasar**

Run: `npx vitest run tests/roles.test.ts`
Expected: PASS.

- [ ] **Paso 5: Ampliar `tests/esquema.test.ts`** (bloque nuevo; usa la conexión `postgres` del archivo):

```ts
describe("Fase 11: roles, estructura y accesos en BD", () => {
  it("rechaza un rol fuera de la lista", async () => {
    const codigo = await codigoDeError(
      sql`INSERT INTO usuarios (usuario, nombre, hash_clave, rol) VALUES ('zz_rol', 'x', 'h', 'root')`,
    );
    expect(codigo).toBe(CHECK_VIOLATION);
  });
  it("el rol por defecto es consulta y cargo_id admite nulo", async () => {
    const [u] = await sql`INSERT INTO usuarios (usuario, nombre, hash_clave) VALUES ('zz_defecto', 'x', 'h') RETURNING rol, cargo_id, debe_cambiar_clave, ver_historial`;
    expect(u).toMatchObject({ rol: "consulta", cargo_id: null, debe_cambiar_clave: false, ver_historial: false });
    await sql`DELETE FROM usuarios WHERE usuario = 'zz_defecto'`;
  });
  it("correo es único sin distinguir mayúsculas", async () => {
    await sql`INSERT INTO usuarios (usuario, nombre, hash_clave, correo) VALUES ('zz_c1', 'x', 'h', 'Persona@Hospital.gov.co')`;
    const codigo = await codigoDeError(
      sql`INSERT INTO usuarios (usuario, nombre, hash_clave, correo) VALUES ('zz_c2', 'x', 'h', 'persona@hospital.gov.co')`,
    );
    expect(codigo).toBe(UNIQUE_VIOLATION);
    await sql`DELETE FROM usuarios WHERE usuario IN ('zz_c1', 'zz_c2')`;
  });
  it("accesos rechaza un resultado desconocido", async () => {
    const codigo = await codigoDeError(
      sql`INSERT INTO accesos (usuario_texto, resultado) VALUES ('x', 'otro')`,
    );
    expect(codigo).toBe(CHECK_VIOLATION);
  });
  it("auditoria y accesos son de solo inserción incluso para el dueño", async () => {
    const [a] = await sql`INSERT INTO accesos (usuario_texto, resultado) VALUES ('zz_inmutable', 'fallo') RETURNING id`;
    expect(await codigoDeError(sql`UPDATE accesos SET resultado = 'ingreso' WHERE id = ${a.id}`)).toBe("42501");
    expect(await codigoDeError(sql`DELETE FROM accesos WHERE id = ${a.id}`)).toBe("42501");
    const [b] = await sql`SELECT id FROM auditoria ORDER BY id DESC LIMIT 1`;
    expect(await codigoDeError(sql`DELETE FROM auditoria WHERE id = ${b.id}`)).toBe("42501");
  });
});
```

Nota: este test corre con `DATABASE_URL`; en la Tarea 3 esa conexión pasa a ser el rol
`sgc_app`, y el caso de "dueño" se cubre allí con la conexión del migrador. Aquí basta
con que el trigger exista.

- [ ] **Paso 6: Correr y ver fallar**

Run: `npx vitest run tests/esquema.test.ts -t "Fase 11"`
Expected: FAIL (columnas y tablas inexistentes).

- [ ] **Paso 7: Editar `src/db/esquema.ts`**

Añadir tras `configuracion` (o en el grupo 3) `areas`, `cargos`; ampliar `usuarios`
(importar `ROLES` de `@/lib/roles` para el CHECK `usuarios_rol_valido`; índice único
parcial `usuarios_correo_idx` sobre `sql\`lower(correo)\`` con `.where(sql\`correo IS NOT NULL\`)`;
FK `cargoId` → `cargos.id` restrict; `jefeInmediatoId` → `usuarios.id` restrict, declarada
con `AnyPgColumn` para la autorreferencia); `usuarioProcesos` con PK compuesta
(`primaryKey({ columns: [t.usuarioId, t.procesoId] })`); `sesiones` + 4 columnas;
`accesos` con CHECK `accesos_resultado_valido` sobre los ocho valores; `codigosRecuperacion`;
`eventosConsulta.usuarioId`. Nombres de columna en snake_case como el resto del archivo.

- [ ] **Paso 8: Generar la migración y añadir el SQL manual**

Run: `npm run db:generate -- --name fase11-acceso`
Expected: `drizzle/0002_fase11-acceso.sql` con las tablas, columnas, índices y FK.
Añadir al final del archivo (separado con `--> statement-breakpoint`):

```sql
UPDATE "usuarios" SET "rol" = 'admin_sgc';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sgc_impedir_modificacion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es de solo inserción', TG_TABLE_NAME USING ERRCODE = '42501';
END $$;
--> statement-breakpoint
CREATE TRIGGER auditoria_inmutable BEFORE UPDATE OR DELETE ON "auditoria" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_modificacion();
--> statement-breakpoint
CREATE TRIGGER accesos_inmutable BEFORE UPDATE OR DELETE ON "accesos" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_modificacion();
```

- [ ] **Paso 9: Aplicar y verificar**

Run: `npm run db:migrate && npx vitest run tests/esquema.test.ts`
Expected: migración aplicada; todos los casos del archivo en verde, incluidos los
heredados (conteos del seed intactos). Comprobar además:
`psql`/consulta: `SELECT rol FROM usuarios` muestra `admin_sgc` para el admin existente.

- [ ] **Paso 10: Quitar las limpiezas de `auditoria` de los tests heredados**

Modify `tests/publicar.test.ts:35-36` y `tests/mapa-admin.test.ts:53-54` (borrar el
`DELETE FROM auditoria`; las filas de prueba quedan como "sistema" al borrar su usuario,
por `ON DELETE SET NULL`) y `tests/bitacora.test.ts:14-16` (la función `limpiar`
desaparece; la marca pasa a ser única por corrida: `const MARCA =
\`ZZ_BIT_${Date.now()}\``, y las aserciones usan esa marca).
Run: `npx vitest run tests/publicar.test.ts tests/bitacora.test.ts tests/mapa-admin.test.ts`
Expected: PASS.

- [ ] **Paso 11: Commit**

```bash
git add src/lib/roles.ts src/db/esquema.ts drizzle tests/roles.test.ts tests/esquema.test.ts tests/publicar.test.ts tests/bitacora.test.ts tests/mapa-admin.test.ts
git commit -m "feat(f11): esquema de roles, estructura, accesos y bitácora inmutable (migración 0002)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 3: Rol de base de datos de mínimo privilegio y arranque

**Files:**
- Create: `src/db/roles-bd.ts`, `drizzle/0003_privilegios-sgc-app.sql` (+ entrada en `drizzle/meta/_journal.json` vía `drizzle-kit generate --custom`), `scripts/asegurar-rol-app.ts`
- Modify: `src/lib/arranque.ts`, `scripts/arrancar.ts`, `drizzle.config.ts`, `src/db/semilla.ts` (solo la URL de conexión), `package.json` (scripts), `.env.example`, `docker-compose.dev.yml`, `docker-compose.nas.yml`, `.env.nas.example`, `.env.ensayo`
- Test: `tests/arranque.test.ts` (ampliar), `tests/privilegios-bd.test.ts`

**Interfaces:**
- Produces (`src/db/roles-bd.ts`):
  ```ts
  export const NOMBRE_ROL_APP = "sgc_app";
  export async function asegurarRolApp(sql: Sql, clave: string): Promise<"creado" | "actualizado">;
  ```
- Produces (`src/lib/arranque.ts`):
  ```ts
  export type Conexiones = { migrador: string; app: string; claveApp: string | null; advertencias: string[] };
  export function decidirConexiones(env: Partial<Record<"DATABASE_URL" | "DATABASE_URL_MIGRADOR" | "BD_APP_CLAVE", string>>): Conexiones; // lanza si falta DATABASE_URL
  ```
- Produces (scripts npm): `db:roles` (= `tsx scripts/asegurar-rol-app.ts`), `db:preparar`
  (= `npm run db:roles && npm run db:migrate`), `db:seed:minima` (Tarea 16 lo llena).

- [ ] **Paso 1: Test puro de `decidirConexiones`** (añadir a `tests/arranque.test.ts`):

```ts
describe("decidirConexiones", () => {
  it("con las tres variables usa migrador y app distintas, sin advertencias", () => {
    const c = decidirConexiones({ DATABASE_URL: "postgres://app", DATABASE_URL_MIGRADOR: "postgres://dueno", BD_APP_CLAVE: "k" });
    expect(c).toEqual({ migrador: "postgres://dueno", app: "postgres://app", claveApp: "k", advertencias: [] });
  });
  it("sin migrador cae al modo heredado con advertencia", () => {
    const c = decidirConexiones({ DATABASE_URL: "postgres://x" });
    expect(c.migrador).toBe("postgres://x");
    expect(c.claveApp).toBeNull();
    expect(c.advertencias.join(" ")).toMatch(/DATABASE_URL_MIGRADOR/);
    expect(c.advertencias.join(" ")).toMatch(/BD_APP_CLAVE/);
  });
  it("sin DATABASE_URL lanza", () => {
    expect(() => decidirConexiones({})).toThrow(/DATABASE_URL/);
  });
});
```

- [ ] **Paso 2: Correr y ver fallar**

Run: `npx vitest run tests/arranque.test.ts -t decidirConexiones`
Expected: FAIL.

- [ ] **Paso 3: Implementar `decidirConexiones`** en `src/lib/arranque.ts` (sin
dependencias de Next ni de postgres; el módulo se bundlea con esbuild).

- [ ] **Paso 4: Correr y ver pasar**

Run: `npx vitest run tests/arranque.test.ts`
Expected: PASS.

- [ ] **Paso 5: Test de privilegios contra la BD** (`tests/privilegios-bd.test.ts`; carga
`.env.local` como los demás; abre dos conexiones: `app = postgres(DATABASE_URL)` y
`dueno = postgres(DATABASE_URL_MIGRADOR)`; se omite con `describe.skipIf(!process.env.DATABASE_URL_MIGRADOR)`):

```ts
describe("rol sgc_app", () => {
  it("la conexión de la app corre como sgc_app", async () => {
    const [r] = await app`SELECT current_user`;
    expect(r.current_user).toBe("sgc_app");
  });
  it("no puede crear tablas", async () => {
    expect(await codigoDeError(app`CREATE TABLE zz_prohibida (id int)`)).toBe("42501");
  });
  it("no puede modificar ni borrar auditoria ni accesos", async () => {
    const [a] = await app`INSERT INTO accesos (usuario_texto, resultado) VALUES ('zz_priv', 'fallo') RETURNING id`;
    expect(await codigoDeError(app`UPDATE accesos SET resultado = 'ingreso' WHERE id = ${a.id}`)).toBe("42501");
    expect(await codigoDeError(app`DELETE FROM accesos WHERE id = ${a.id}`)).toBe("42501");
    expect(await codigoDeError(app`DELETE FROM auditoria WHERE id = -1`)).toBe("42501");
  });
  it("sí puede insertar, leer y borrar en tablas operativas", async () => {
    const [u] = await app`INSERT INTO usuarios (usuario, nombre, hash_clave) VALUES ('zz_priv_u', 'x', 'h') RETURNING id`;
    expect(u.id).toBeGreaterThan(0);
    await app`DELETE FROM usuarios WHERE id = ${u.id}`;
  });
  it("el trigger frena también al dueño del esquema", async () => {
    expect(await codigoDeError(dueno`DELETE FROM accesos WHERE usuario_texto = 'zz_priv'`)).toBe("42501");
  });
});
```

- [ ] **Paso 6: Correr y ver fallar**

Run: `npx vitest run tests/privilegios-bd.test.ts`
Expected: FAIL o SKIP (todavía no existe `DATABASE_URL_MIGRADOR` en `.env.local`).

- [ ] **Paso 7: Implementar `asegurarRolApp`** en `src/db/roles-bd.ts`

Dentro de `sql.begin`: `SELECT set_config('sgc.clave_app', ${clave}, true)` y luego un
bloque `DO $$ ... $$` (vía `tx.unsafe`, sin interpolar la clave) que hace `CREATE ROLE
sgc_app LOGIN PASSWORD %L` si no existe en `pg_roles` o `ALTER ROLE sgc_app WITH LOGIN
PASSWORD %L` si existe, con `format(..., current_setting('sgc.clave_app'))`. Devuelve
`"creado"` o `"actualizado"` según el `SELECT` previo a `pg_roles`.

- [ ] **Paso 8: Migración 0003 personalizada**

Run: `npx drizzle-kit generate --custom --name privilegios-sgc-app`
Pegar en el archivo generado el SQL del diseño F11 §3 (REVOKE CREATE ON SCHEMA public
FROM PUBLIC; GRANT USAGE; GRANT DML ON ALL TABLES; REVOKE UPDATE, DELETE ON auditoria,
accesos; GRANT USAGE, SELECT ON ALL SEQUENCES; los dos ALTER DEFAULT PRIVILEGES), cada
sentencia separada por `--> statement-breakpoint`.

- [ ] **Paso 9: Cablear arranque, drizzle y scripts**

- `scripts/arrancar.ts`: `const cx = decidirConexiones(process.env)`; imprimir
  advertencias con `console.warn`; conexión de migración con `cx.migrador`; tras la
  espera de BD, `if (cx.claveApp) await asegurarRolApp(sql, cx.claveApp)`; luego
  `migrate`; el bootstrap del admin sigue igual. En producción (`NODE_ENV=production`)
  falla con mensaje claro si falta `APP_SECRETO` (lo consume la Tarea 5; validarlo aquí
  evita arrancar sin él).
- `scripts/asegurar-rol-app.ts`: carga `.env.local` con `@next/env`, llama
  `asegurarRolApp(postgres(migrador), BD_APP_CLAVE)`, imprime el resultado.
- `drizzle.config.ts`: `url: process.env.DATABASE_URL_MIGRADOR ?? process.env.DATABASE_URL!`.
- `src/db/semilla.ts:24`: conectar con `DATABASE_URL_MIGRADOR ?? DATABASE_URL`.
- `package.json`: scripts `db:roles`, `db:preparar`.
- `.env.example`: las variables de la tabla del diseño F11 §4 con sus valores de
  desarrollo y un comentario por variable.
- `docker-compose.dev.yml` (servicio `app`): `DATABASE_URL` con `sgc_app:sgc_app_dev@bd`,
  `DATABASE_URL_MIGRADOR` con `sgc:sgc_dev@bd`, `BD_APP_CLAVE: sgc_app_dev`,
  `APP_SECRETO` de desarrollo.
- `docker-compose.nas.yml` + `.env.nas.example` + `.env.ensayo`: añadir
  `DATABASE_URL_MIGRADOR`, `BD_APP_CLAVE` (`SGC_BD_APP_CLAVE` en el `.env`) y
  `APP_SECRETO` con comentario "heredado del NAS; el compose de producción se rehace en
  la Fase 20".

- [ ] **Paso 10: Preparar la BD de desarrollo y verificar**

Añadir a `.env.local` las variables nuevas (valores de `.env.example`), con
`BD_APP_CLAVE=sgc_app_dev`, **el mismo valor que `docker-compose.dev.yml`**: el contenedor
sincroniza la clave del rol en cada arranque sobre la misma base de 5435 que usan los
tests; si difieren, los tests dejan de conectar tras el Paso 11.
Run: `npm run db:preparar && npx vitest run tests/privilegios-bd.test.ts tests/esquema.test.ts tests/sesion.test.ts tests/publicar.test.ts`
Expected: rol creado, migración 0003 aplicada, los cuatro archivos en verde con la app
conectada como `sgc_app`.

- [ ] **Paso 11: Verificar el arranque empaquetado**

Run: `docker compose -f docker-compose.dev.yml up -d --build && sleep 20 && docker compose -f docker-compose.dev.yml logs app | tail -20 && curl -s http://localhost:9081/api/salud`
Expected: log con "Base de datos lista", rol `sgc_app` creado o actualizado,
"Migraciones al día", "Admin 'admin': …"; `/api/salud` responde `{"estado":"ok"...}`.
Luego `docker compose -f docker-compose.dev.yml stop app` (la BD sigue para los tests).

- [ ] **Paso 12: Commit**

```bash
git add src/db/roles-bd.ts src/lib/arranque.ts scripts drizzle drizzle.config.ts src/db/semilla.ts package.json .env.example docker-compose.dev.yml docker-compose.nas.yml .env.nas.example .env.ensayo tests/arranque.test.ts tests/privilegios-bd.test.ts
git commit -m "feat(f11): rol sgc_app de mínimo privilegio, migración de privilegios y arranque con dos conexiones" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 4: Permisos, bloqueo y política de clave (librerías puras)

**Files:**
- Create: `src/lib/permisos.ts`, `src/lib/bloqueo.ts`, `src/lib/clave-politica.ts`, `src/lib/datos/claves-comunes.json`, `scripts/generar-claves-comunes.mjs`
- Test: `tests/permisos.test.ts`, `tests/bloqueo.test.ts`, `tests/clave-politica.test.ts`

**Interfaces:**
- Produces (`src/lib/permisos.ts`):
  ```ts
  export type Permiso = "panel.entrar" | "documentos.administrar" | "documentos.ver_historial" | "mapa.administrar" | "maestro.ver" | "maestro.exportar" | "estadisticas.ver" | "bitacora.ver" | "accesos.ver" | "usuarios.administrar" | "estructura.administrar" | "sesiones.administrar";
  export const PERMISOS: readonly Permiso[];
  export const MATRIZ: Record<Permiso, readonly Rol[]>;           // la tabla del diseño F11 §5
  export type SujetoPermiso = { rol: Rol; verHistorial?: boolean };
  export function puede(sujeto: SujetoPermiso, permiso: Permiso): boolean; // ver_historial individual también concede "documentos.ver_historial"
  export class ErrorPermiso extends Error { constructor() { super("Sin permiso para esta acción"); } }
  export function requerirPermiso(sujeto: SujetoPermiso, permiso: Permiso): void; // lanza ErrorPermiso
  export function permisosDe(sujeto: SujetoPermiso): Permiso[];
  ```
- Produces (`src/lib/bloqueo.ts`):
  ```ts
  export const INTENTOS_PARA_BLOQUEO = 5;
  export const BLOQUEO_BASE_MS = 15 * 60_000;
  export const BLOQUEO_MAXIMO_MS = 24 * 60 * 60_000;
  export type EstadoBloqueo = { intentosFallidos: number; bloqueosConsecutivos: number; bloqueadoHasta: Date | null };
  export function registrarIntentoFallido(estado: EstadoBloqueo, ahora: Date): EstadoBloqueo;
  export function estaBloqueado(estado: EstadoBloqueo, ahora: Date): boolean;
  export const SIN_BLOQUEO: EstadoBloqueo; // { 0, 0, null } — tras ingreso correcto o desbloqueo
  ```
- Produces (`src/lib/clave-politica.ts`):
  ```ts
  export const LONGITUD_MINIMA = 12; export const LONGITUD_MAXIMA = 128;
  export function validarClave(clave: string, contexto: { usuario: string }): string | null; // mensaje de rechazo en español o null si cumple
  export function generarClaveTemporal(): string; // XXXX-XXXX-XXXX-XXXX, alfabeto ABCDEFGHJKMNPQRSTUVWXYZ23456789
  ```

- [ ] **Paso 1: Test por celda de la matriz** (`tests/permisos.test.ts`; la tabla esperada
vive en el test, copiada del diseño F11 §5):

```ts
const ESPERADA: Record<Permiso, Rol[]> = {
  "panel.entrar": ["admin_sgc", "gerencia", "control_interno"],
  "documentos.administrar": ["admin_sgc"],
  "documentos.ver_historial": ["admin_sgc", "control_interno"],
  "mapa.administrar": ["admin_sgc"],
  "maestro.ver": ["admin_sgc", "gerencia", "control_interno"],
  "maestro.exportar": ["admin_sgc", "control_interno"],
  "estadisticas.ver": ["admin_sgc", "gerencia", "control_interno"],
  "bitacora.ver": ["admin_sgc", "control_interno"],
  "accesos.ver": ["admin_sgc", "control_interno"],
  "usuarios.administrar": ["admin_sgc"],
  "estructura.administrar": ["admin_sgc"],
  "sesiones.administrar": ["admin_sgc"],
};
describe("matriz de permisos", () => {
  for (const permiso of PERMISOS) for (const rol of ROLES) {
    it(`${rol} ${ESPERADA[permiso].includes(rol) ? "sí" : "no"} puede ${permiso}`, () => {
      expect(puede({ rol }, permiso)).toBe(ESPERADA[permiso].includes(rol));
    });
  }
  it("la marca individual ver_historial concede solo ese permiso", () => {
    expect(puede({ rol: "consulta", verHistorial: true }, "documentos.ver_historial")).toBe(true);
    expect(puede({ rol: "consulta", verHistorial: true }, "documentos.administrar")).toBe(false);
  });
  it("requerirPermiso lanza ErrorPermiso con el mensaje fijo", () => {
    expect(() => requerirPermiso({ rol: "consulta" }, "usuarios.administrar")).toThrow("Sin permiso para esta acción");
    expect(() => requerirPermiso({ rol: "admin_sgc" }, "usuarios.administrar")).not.toThrow();
  });
  it("PERMISOS cubre todas las claves de la matriz", () => {
    expect([...PERMISOS].sort()).toEqual(Object.keys(ESPERADA).sort());
  });
});
```

- [ ] **Paso 2: Test de bloqueo** (`tests/bloqueo.test.ts`):

```ts
const t0 = new Date("2026-11-03T10:00:00Z");
describe("bloqueo por intentos", () => {
  it("cuatro fallos no bloquean; el quinto bloquea 15 minutos y reinicia el contador", () => {
    let e = SIN_BLOQUEO;
    for (let i = 0; i < 4; i++) e = registrarIntentoFallido(e, t0);
    expect(e).toEqual({ intentosFallidos: 4, bloqueosConsecutivos: 0, bloqueadoHasta: null });
    e = registrarIntentoFallido(e, t0);
    expect(e.intentosFallidos).toBe(0);
    expect(e.bloqueosConsecutivos).toBe(1);
    expect(e.bloqueadoHasta?.getTime()).toBe(t0.getTime() + 15 * 60_000);
  });
  it("cada bloqueo siguiente duplica: 30, 60 minutos… con tope de 24 h", () => {
    let e: EstadoBloqueo = { intentosFallidos: 4, bloqueosConsecutivos: 1, bloqueadoHasta: null };
    e = registrarIntentoFallido(e, t0);
    expect(e.bloqueadoHasta?.getTime()).toBe(t0.getTime() + 30 * 60_000);
    e = { intentosFallidos: 4, bloqueosConsecutivos: 10, bloqueadoHasta: null };
    e = registrarIntentoFallido(e, t0);
    expect(e.bloqueadoHasta?.getTime()).toBe(t0.getTime() + 24 * 3600_000);
  });
  it("estaBloqueado respeta la hora", () => {
    const e = { intentosFallidos: 0, bloqueosConsecutivos: 1, bloqueadoHasta: new Date(t0.getTime() + 60_000) };
    expect(estaBloqueado(e, t0)).toBe(true);
    expect(estaBloqueado(e, new Date(t0.getTime() + 61_000))).toBe(false);
    expect(estaBloqueado(SIN_BLOQUEO, t0)).toBe(false);
  });
});
```

- [ ] **Paso 3: Test de política de clave** (`tests/clave-politica.test.ts`; importa
`lista from "@/lib/datos/claves-comunes.json"`):

```ts
describe("validarClave", () => {
  it("rechaza menos de 12 y más de 128 caracteres", () => {
    expect(validarClave("corta-1234", { usuario: "ana" })).toMatch(/12/);
    expect(validarClave("x".repeat(129), { usuario: "ana" })).toMatch(/128/);
  });
  it("rechaza claves comunes aunque tengan 12 o más caracteres", () => {
    // La lista empaquetada es la fuente de verdad: se toma de ella una entrada larga.
    const comun = (lista as string[]).find((c) => c.length >= 12)!;
    expect(comun).toBeDefined();
    expect(validarClave(comun, { usuario: "ana" })).toMatch(/común/);
    expect(validarClave(comun.toUpperCase(), { usuario: "ana" })).toMatch(/común/);
  });
  it("rechaza la que contiene el nombre de usuario", () => {
    expect(validarClave("Hospital-ana.perez-2026", { usuario: "ana.perez" })).toMatch(/usuario/);
  });
  it("acepta una clave larga y no común", () => {
    expect(validarClave("Colibri-verde-37-Suaza", { usuario: "ana" })).toBeNull();
  });
});
describe("generarClaveTemporal", () => {
  it("tiene el formato XXXX-XXXX-XXXX-XXXX sin caracteres ambiguos y pasa la política", () => {
    for (let i = 0; i < 50; i++) {
      const c = generarClaveTemporal();
      expect(c).toMatch(/^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
      expect(validarClave(c, { usuario: "cualquiera" })).toBeNull();
    }
  });
});
```

- [ ] **Paso 4: Correr los tres y ver fallar**

Run: `npx vitest run tests/permisos.test.ts tests/bloqueo.test.ts tests/clave-politica.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Paso 5: Generar la lista de claves comunes**

Crear `scripts/generar-claves-comunes.mjs`: descarga
`https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/10k-most-common.txt`
(SecLists, licencia MIT), normaliza (minúsculas, sin líneas vacías, sin duplicados) y
escribe `src/lib/datos/claves-comunes.json` como arreglo de cadenas con una cabecera de
comentario no posible en JSON, así que la procedencia y la licencia van en el nombre del
script y en el commit. Run: `node scripts/generar-claves-comunes.mjs`
Expected: archivo de ~10 000 entradas, menos de 120 KB.

- [ ] **Paso 6: Implementar los tres módulos** con las firmas de arriba. `validarClave`
carga el JSON con `import lista from "./datos/claves-comunes.json"` en un `Set` a nivel
de módulo (se evalúa solo en servidor) y compara en minúsculas; "contiene el usuario"
aplica cuando el usuario tiene 3 o más caracteres. `generarClaveTemporal` usa
`crypto.randomInt`.

- [ ] **Paso 7: Correr y ver pasar**

Run: `npx vitest run tests/permisos.test.ts tests/bloqueo.test.ts tests/clave-politica.test.ts`
Expected: PASS (60 casos de celda + los demás).

- [ ] **Paso 8: Commit**

```bash
git add src/lib/permisos.ts src/lib/bloqueo.ts src/lib/clave-politica.ts src/lib/datos scripts/generar-claves-comunes.mjs tests/permisos.test.ts tests/bloqueo.test.ts tests/clave-politica.test.ts
git commit -m "feat(f11): matriz de permisos, bloqueo por intentos y política de clave" -m "Lista de claves comunes derivada de SecLists 10k-most-common.txt (MIT)." -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 5: Red, rutas, cifrado, TOTP, validación y estado de cuenta

**Files:**
- Create: `src/lib/ip.ts`, `src/lib/origen.ts`, `src/lib/rutas.ts`, `src/lib/cifrado.ts`, `src/lib/totp.ts`, `src/lib/validacion.ts`, `src/lib/esquemas/cuenta.ts`, `src/lib/esquemas/usuarios.ts`, `src/lib/esquemas/estructura.ts`, `src/lib/cuenta-estado.ts`
- Modify: `src/db/consultas/eventos.ts:24-29` (quitar `ipDePeticion` y reexportarla desde `@/lib/ip` hasta la Tarea 8), `src/app/admin/api/archivos/route.ts:27-39` (usar `origenValido` compartido), `src/app/admin/api/archivos/[archivoId]/route.ts:32` (DELETE verifica `Origin`), `src/app/admin/acciones-mapa.ts:65-69` (usar `rutaInterna` de `@/lib/rutas`)
- Test: `tests/ip.test.ts`, `tests/origen.test.ts`, `tests/rutas.test.ts`, `tests/cifrado.test.ts`, `tests/totp.test.ts`, `tests/validacion.test.ts`, `tests/cuenta-estado.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/lib/ip.ts
  export function ipDePeticion(headers: Headers, confiarProxy: boolean = process.env.CONFIAR_PROXY === "1"): string | null;
  // con confianza: último elemento no vacío de X-Forwarded-For, si no X-Real-IP, si no null; sin confianza: null
  // src/lib/origen.ts
  export function origenValido(headers: Headers): boolean; // sin Origin → true; Origin.host === X-Forwarded-Host ?? Host
  // src/lib/rutas.ts
  export function rutaInterna(v: unknown, porDefecto = "/"): string; // acepta solo "/..." que no empiece por "//" ni contenga "\\"
  // src/lib/cifrado.ts
  export function claveDeEntorno(env: { APP_SECRETO?: string; NODE_ENV?: string } = process.env): Buffer; // 32 bytes; producción sin APP_SECRETO → lanza; desarrollo → clave fija + console.warn una vez
  export function cifrar(texto: string, clave?: Buffer): string;   // base64url(iv 12 | tag 16 | datos), AES-256-GCM
  export function descifrar(cifrado: string, clave?: Buffer): string; // lanza si el tag no cuadra
  // src/lib/totp.ts
  export function generarSecretoTotp(): string;                          // base32, 20 bytes
  export function uriTotp(secreto: string, usuario: string, emisor: string): string; // otpauth://totp/...
  export function generarCodigoTotp(secreto: string, ahoraMs: number): string;      // 6 dígitos (para pruebas y para el QR de prueba)
  export function verificarTotp(secreto: string, codigo: string, ahoraMs = Date.now()): boolean; // ventana ±1
  export function generarCodigosRecuperacion(cantidad = 8): string[];   // "XXXXX-XXXXX", mismo alfabeto de la clave temporal
  export function hashCodigoRecuperacion(codigo: string): string;        // sha256 hex de mayúsculas sin guiones ni espacios
  // src/lib/validacion.ts
  export class ErrorValidacion extends Error {}
  export function parsearFormulario<T>(formData: FormData, esquema: z.ZodType<T>): T; // getAll → string | string[]; "" → undefined; primer problema → ErrorValidacion("<campo>: <mensaje>") en español (z.config(z.locales.es()))
  // src/lib/cuenta-estado.ts
  export type Pendiente = "factor" | "clave" | "aviso" | "totp_obligatorio";
  export type EstadoCuenta = { rol: Rol; factorPendiente: boolean; debeCambiarClave: boolean; aceptoDatos: boolean; totpActivo: boolean };
  export function pendienteDeCuenta(cuenta: EstadoCuenta, rolesObligatorios: readonly Rol[] = rolesConTotpObligatorio()): Pendiente | null; // en ese orden
  export function rutaDePendiente(p: Pendiente): string; // "/ingreso/verificar" | "/cuenta/clave-inicial" | "/aviso-datos" | "/cuenta/segundo-factor?obligatorio=1"
  ```
- Produces (esquemas zod, todos `.strict()` donde son objetos):
  - `cuenta.ts`: `EsquemaIngreso` `{ usuario: string (trim, 1..40), clave: string (1..128), volver?: string }`;
    `EsquemaCodigoFactor` `{ codigo: string (trim; /^\d{6}$/ o /^[A-Z2-9]{5}-?[A-Z2-9]{5}$/i), volver?: string }`;
    `EsquemaClaveInicial` `{ claveNueva, confirmacion }` con refine iguales;
    `EsquemaCambioClave` `{ claveActual, claveNueva, confirmacion }`; `EsquemaClaveSola` `{ clave }`.
  - `usuarios.ts`: `EsquemaUsuario` `{ usuario: /^[a-z0-9._-]{3,40}$/, nombre: 3..120, correo?: email, rol: enum ROLES, cargoId?: entero positivo, jefeInmediatoId?: entero positivo, procesoIds: number[] (default []), verHistorial: boolean }` con refine: `rol === "lider_proceso"` ⇒ `procesoIds.length >= 1`. Coerciones con `z.preprocess` porque el formulario llega por `parsearFormulario`: `procesoIds` desde `undefined | string | string[]` (checkboxes repetidos) a `number[]`; `verHistorial` desde `"on" | undefined` a boolean; `cargoId`, `jefeInmediatoId` y `correo` desde `""`/`undefined` a `null`. El mismo esquema valida los objetos ya tipados del lote (Tarea 13). `EsquemaFilaLote` (los seis campos del CSV como texto: `usuario, nombre, correo, rol, cargo, procesos`).
  - `estructura.ts`: `EsquemaArea` `{ nombre: 2..80 }`; `EsquemaCargo` `{ nombre: 2..80, areaId: entero, superiorId?: entero }`.

- [ ] **Paso 1: Tests** (uno por módulo; los casos que no pueden faltar):

```ts
// tests/ip.test.ts
it("sin confianza devuelve null aunque llegue X-Forwarded-For", () =>
  expect(ipDePeticion(new Headers({ "x-forwarded-for": "9.9.9.9" }), false)).toBeNull());
it("con confianza toma el ÚLTIMO elemento de X-Forwarded-For", () =>
  expect(ipDePeticion(new Headers({ "x-forwarded-for": "1.1.1.1, 10.0.0.5 " }), true)).toBe("10.0.0.5"));
it("con confianza y sin XFF usa X-Real-IP; sin nada, null", () => {
  expect(ipDePeticion(new Headers({ "x-real-ip": "10.0.0.7" }), true)).toBe("10.0.0.7");
  expect(ipDePeticion(new Headers(), true)).toBeNull();
});
// tests/origen.test.ts
it("sin Origin pasa; Origin igual al host pasa; distinto falla; X-Forwarded-Host manda", () => {
  expect(origenValido(new Headers({ host: "sgc.local" }))).toBe(true);
  expect(origenValido(new Headers({ host: "sgc.local", origin: "https://sgc.local" }))).toBe(true);
  expect(origenValido(new Headers({ host: "sgc.local", origin: "https://malo.com" }))).toBe(false);
  expect(origenValido(new Headers({ host: "app:3080", "x-forwarded-host": "sgc.hospital.gov.co", origin: "https://sgc.hospital.gov.co" }))).toBe(true);
  expect(origenValido(new Headers({ host: "sgc.local", origin: "basura" }))).toBe(false);
});
// tests/rutas.test.ts
it("rutaInterna acepta solo rutas internas", () => {
  expect(rutaInterna("/procesos/calidad?x=1")).toBe("/procesos/calidad?x=1");
  expect(rutaInterna("//evil.com")).toBe("/");
  expect(rutaInterna("https://evil.com")).toBe("/");
  expect(rutaInterna("/\\evil.com")).toBe("/");
  expect(rutaInterna(null, "/admin")).toBe("/admin");
});
// tests/cifrado.test.ts
it("cifra y descifra; cambia el iv en cada llamada; detecta manipulación", () => {
  const k = Buffer.alloc(32, 7);
  const c1 = cifrar("secreto", k), c2 = cifrar("secreto", k);
  expect(c1).not.toBe(c2);
  expect(descifrar(c1, k)).toBe("secreto");
  expect(() => descifrar(c1.slice(0, -2) + "zz", k)).toThrow();
});
it("en producción exige APP_SECRETO; en desarrollo avisa y sigue", () => {
  expect(() => claveDeEntorno({ NODE_ENV: "production" })).toThrow(/APP_SECRETO/);
  expect(claveDeEntorno({ NODE_ENV: "development" })).toHaveLength(32);
  expect(claveDeEntorno({ APP_SECRETO: Buffer.alloc(32, 1).toString("base64") })).toHaveLength(32);
});
// tests/totp.test.ts
it("verifica el código actual y el del periodo anterior; rechaza el de hace dos", () => {
  const s = generarSecretoTotp(); const ahora = 1_800_000_000_000;
  expect(verificarTotp(s, generarCodigoTotp(s, ahora), ahora)).toBe(true);
  expect(verificarTotp(s, generarCodigoTotp(s, ahora - 30_000), ahora)).toBe(true);
  expect(verificarTotp(s, generarCodigoTotp(s, ahora - 90_000), ahora)).toBe(false);
  expect(verificarTotp(s, "000000", ahora)).toBe(false);
});
it("la URI lleva emisor y usuario; los códigos de recuperación tienen formato y hash estable", () => {
  expect(uriTotp("ABC", "ana", "SGC Integral")).toMatch(/^otpauth:\/\/totp\/SGC%20Integral:ana\?/);
  const codigos = generarCodigosRecuperacion();
  expect(codigos).toHaveLength(8);
  expect(new Set(codigos).size).toBe(8);
  for (const c of codigos) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  expect(hashCodigoRecuperacion(" ab2cd-ef3gh ")).toBe(hashCodigoRecuperacion("AB2CDEF3GH"));
});
// tests/validacion.test.ts
it("convierte FormData y reporta el primer error en español con el campo", () => {
  const fd = new FormData(); fd.set("usuario", " Ana "); fd.set("clave", "x");
  expect(parsearFormulario(fd, EsquemaIngreso)).toEqual({ usuario: "Ana", clave: "x" });
  const malo = new FormData(); malo.set("usuario", "");
  expect(() => parsearFormulario(malo, EsquemaIngreso)).toThrow(ErrorValidacion);
});
it("EsquemaUsuario exige procesos al líder y rechaza campos extra", () => {
  expect(() => EsquemaUsuario.parse({ usuario: "ana.p", nombre: "Ana Pérez", rol: "lider_proceso", procesoIds: [], verHistorial: false })).toThrow(/proceso/);
  expect(() => EsquemaUsuario.parse({ usuario: "ana.p", nombre: "Ana Pérez", rol: "consulta", procesoIds: [], verHistorial: false, extra: 1 })).toThrow();
});
// tests/cuenta-estado.test.ts
const base = { rol: "consulta" as const, factorPendiente: false, debeCambiarClave: false, aceptoDatos: true, totpActivo: false };
it("devuelve null cuando no hay pendientes y respeta el orden factor > clave > aviso > totp", () => {
  expect(pendienteDeCuenta(base, [])).toBeNull();
  expect(pendienteDeCuenta({ ...base, factorPendiente: true, debeCambiarClave: true }, [])).toBe("factor");
  expect(pendienteDeCuenta({ ...base, debeCambiarClave: true, aceptoDatos: false }, [])).toBe("clave");
  expect(pendienteDeCuenta({ ...base, aceptoDatos: false }, [])).toBe("aviso");
  expect(pendienteDeCuenta({ ...base, rol: "admin_sgc" }, ["admin_sgc"])).toBe("totp_obligatorio");
  expect(pendienteDeCuenta({ ...base, rol: "admin_sgc", totpActivo: true }, ["admin_sgc"])).toBeNull();
});
it("rutaDePendiente mapea las cuatro rutas", () => {
  expect(rutaDePendiente("factor")).toBe("/ingreso/verificar");
  expect(rutaDePendiente("clave")).toBe("/cuenta/clave-inicial");
  expect(rutaDePendiente("aviso")).toBe("/aviso-datos");
  expect(rutaDePendiente("totp_obligatorio")).toBe("/cuenta/segundo-factor?obligatorio=1");
});
```

- [ ] **Paso 2: Correr y ver fallar**

Run: `npx vitest run tests/ip.test.ts tests/origen.test.ts tests/rutas.test.ts tests/cifrado.test.ts tests/totp.test.ts tests/validacion.test.ts tests/cuenta-estado.test.ts`
Expected: FAIL.

- [ ] **Paso 3: Implementar los módulos.** `totp.ts` envuelve `otpauth` (`new TOTP({
issuer, label, secret: OTPAuth.Secret.fromBase32(...), digits: 6, period: 30 })`,
`validate({ token, window: 1 })`). `cifrado.ts` usa `node:crypto` `createCipheriv("aes-256-gcm")`.
`validacion.ts` llama `z.config(z.locales.es())` al importarse.

- [ ] **Paso 4: Cablear los usos existentes.** `eventos.ts` reexporta `ipDePeticion`
desde `@/lib/ip` (sin lógica propia); la subida y el `DELETE` de archivos usan
`origenValido(peticion.headers)` y responden 403 "Origen no permitido";
`acciones-mapa.ts` importa `rutaInterna`.

- [ ] **Paso 5: Correr todo y ver pasar**

Run: `npx vitest run && npm run lint`
Expected: PASS; lint limpio.

- [ ] **Paso 6: Commit**

```bash
git add src/lib src/db/consultas/eventos.ts src/app/admin/api src/app/admin/acciones-mapa.ts tests
git commit -m "feat(f11): utilidades de IP tras proxy, Origin, rutas internas, cifrado, TOTP, validación zod y estado de cuenta" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 6: Sesión ampliada (rol, pendientes, inactividad, cierre masivo)

**Files:**
- Modify: `src/lib/sesion.ts`, `src/lib/sesion-actual.ts`
- Test: `tests/sesion.test.ts` (ampliar)

**Interfaces:**
- Produces (`src/lib/sesion.ts`):
  ```ts
  export type SesionValida = {
    sesionId: string;            // SHA-256 del token (PK de sesiones)
    usuarioId: number; usuario: string; nombre: string;
    rol: Rol; verHistorial: boolean; totpActivo: boolean;
    factorPendiente: boolean; debeCambiarClave: boolean; aceptoDatos: boolean;
  };
  export type ContextoSesion = { ip: string | null; userAgent: string | null; factorPendiente?: boolean };
  export const VIGENCIA_SESION_MS = 12 * 60 * 60 * 1000;
  export function inactividadMs(env = process.env): number; // SESION_INACTIVIDAD_MIN (default 60) en ms
  export async function crearSesion(usuarioId: number, contexto: ContextoSesion): Promise<{ token: string; expiraEn: Date }>;
  export async function validarSesion(token: string | null | undefined, opciones?: { ahora?: Date; inactividadMs?: number }): Promise<SesionValida | null>;
  // vencida, inactiva (ultimo_uso_en < ahora - inactividad) o usuario inactivo → null; renueva deslizante; actualiza ultimo_uso_en si tiene más de 60 s
  export async function confirmarSegundoFactor(sesionId: string): Promise<void>;
  export async function cerrarSesion(token: string): Promise<void>;
  export async function cerrarSesionPorId(sesionId: string): Promise<{ usuarioId: number } | null>;
  export async function cerrarSesionesDeUsuario(usuarioId: number, conservarSesionId?: string): Promise<number>;
  export type SesionActiva = { sesionId: string; usuarioId: number; usuario: string; nombre: string; rol: Rol; ip: string | null; userAgent: string | null; creadaEn: string; ultimoUsoEn: string; expiraEn: string; factorPendiente: boolean };
  export async function listarSesionesActivas(): Promise<SesionActiva[]>;
  ```
- Produces (`src/lib/sesion-actual.ts`):
  ```ts
  export const sesionActual: () => Promise<SesionValida | null>;   // React.cache sobre cookies()
  export type OpcionesRequerir = { permitirPendientes?: boolean };
  export async function requerirSesion(opciones?: OpcionesRequerir): Promise<SesionValida>;
  // sin sesión → Error("No autorizado"); factorPendiente → siempre Error("No autorizado");
  // debeCambiarClave o !aceptoDatos → Error("Cuenta pendiente de completar") salvo permitirPendientes
  export async function sesionDePeticion(peticion: NextRequest, opciones?: OpcionesRequerir): Promise<SesionValida | null>; // misma regla, cookie del request, null en vez de lanzar
  ```
- Consumes: `Rol` (Tarea 2), `inactividad` por env (diseño F11 §4).

- [ ] **Paso 1: Ampliar `tests/sesion.test.ts`** (el `beforeAll` inserta `prueba_sesion`
con `rol = 'control_interno'`):

```ts
it("devuelve rol, marcas de cuenta y sesionId", async () => {
  const { token } = await crearSesion(usuarioId, { ip: "10.0.0.1", userAgent: "vitest" });
  const s = await validarSesion(token);
  expect(s).toMatchObject({ rol: "control_interno", factorPendiente: false, debeCambiarClave: false, aceptoDatos: false, totpActivo: false });
  expect(s?.sesionId).toHaveLength(64);
  const [fila] = await sql()`SELECT ip::text, user_agent FROM sesiones WHERE id = ${s!.sesionId}`;
  expect(fila).toEqual({ ip: "10.0.0.1", user_agent: "vitest" });
});
it("una sesión inactiva más del límite no vale", async () => {
  const { token } = await crearSesion(usuarioId, { ip: null, userAgent: null });
  await sql()`UPDATE sesiones SET ultimo_uso_en = now() - interval '61 minutes' WHERE usuario_id = ${usuarioId}`;
  expect(await validarSesion(token, { inactividadMs: 60 * 60_000 })).toBeNull();
});
it("ultimo_uso_en solo se escribe si tiene más de 60 s", async () => {
  const { token } = await crearSesion(usuarioId, { ip: null, userAgent: null });
  const s = await validarSesion(token);
  const [a] = await sql()`SELECT ultimo_uso_en FROM sesiones WHERE id = ${s!.sesionId}`;
  await validarSesion(token);
  const [b] = await sql()`SELECT ultimo_uso_en FROM sesiones WHERE id = ${s!.sesionId}`;
  expect(String(b.ultimo_uso_en)).toBe(String(a.ultimo_uso_en));
  await sql()`UPDATE sesiones SET ultimo_uso_en = now() - interval '2 minutes' WHERE id = ${s!.sesionId}`;
  await validarSesion(token);
  const [c] = await sql()`SELECT ultimo_uso_en FROM sesiones WHERE id = ${s!.sesionId}`;
  expect(new Date(c.ultimo_uso_en).getTime()).toBeGreaterThan(Date.now() - 60_000);
});
it("factor pendiente se crea, se refleja y se confirma", async () => {
  const { token } = await crearSesion(usuarioId, { ip: null, userAgent: null, factorPendiente: true });
  const s = await validarSesion(token);
  expect(s?.factorPendiente).toBe(true);
  await confirmarSegundoFactor(s!.sesionId);
  expect((await validarSesion(token))?.factorPendiente).toBe(false);
});
it("cerrarSesionesDeUsuario conserva la indicada y cierra las demás", async () => {
  const a = await crearSesion(usuarioId, { ip: null, userAgent: null });
  const b = await crearSesion(usuarioId, { ip: null, userAgent: null });
  const sa = await validarSesion(a.token);
  const cerradas = await cerrarSesionesDeUsuario(usuarioId, sa!.sesionId);
  expect(cerradas).toBeGreaterThanOrEqual(1);
  expect(await validarSesion(a.token)).not.toBeNull();
  expect(await validarSesion(b.token)).toBeNull();
});
it("listarSesionesActivas y cerrarSesionPorId", async () => {
  const { token } = await crearSesion(usuarioId, { ip: "10.0.0.9", userAgent: "x" });
  const s = await validarSesion(token);
  const lista = await listarSesionesActivas();
  expect(lista.some((x) => x.sesionId === s!.sesionId && x.usuario === "prueba_sesion")).toBe(true);
  expect(await cerrarSesionPorId(s!.sesionId)).toEqual({ usuarioId });
  expect(await validarSesion(token)).toBeNull();
});
```

- [ ] **Paso 2: Correr y ver fallar**

Run: `npx vitest run tests/sesion.test.ts`
Expected: FAIL (firmas nuevas).

- [ ] **Paso 3: Implementar** `sesion.ts` (una sola consulta en `validarSesion` que trae
las columnas de `usuarios` necesarias; la limpieza oportunista se mantiene) y
`sesion-actual.ts` (con `cache` de `react` para `sesionActual`; `sesionDePeticion` usa
`peticion.cookies.get(COOKIE_SESION)?.value`). La lógica de "pendiente" se comparte en
una función interna `aceptable(sesion, opciones)` usada por ambas.

- [ ] **Paso 4: Correr y ver pasar**

Run: `npx vitest run tests/sesion.test.ts && npm run lint`
Expected: PASS; lint limpio (los llamadores de `crearSesion` todavía son los de la
Tarea 7; `acciones.ts:67` se adapta aquí con `{ ip, userAgent: (await headers()).get("user-agent") }`).

- [ ] **Paso 5: Commit**

```bash
git add src/lib/sesion.ts src/lib/sesion-actual.ts src/app/admin/acciones.ts tests/sesion.test.ts
git commit -m "feat(f11): sesión con rol, marcas de cuenta, factor pendiente, inactividad y cierre masivo" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 7: Autenticación: ingreso con bloqueo, segundo factor y registro de accesos

**Files:**
- Create: `src/db/consultas/autenticacion.ts`, `src/app/acciones-cuenta.ts`, `src/app/ingreso/page.tsx`, `src/app/ingreso/verificar/page.tsx`, `src/componentes/cuenta/FormularioIngreso.tsx` (mueve `src/componentes/admin/FormularioIngreso.tsx`), `src/componentes/cuenta/FormularioFactor.tsx`
- Modify: `src/app/admin/ingreso/page.tsx` (solo `redirect("/ingreso")`), `src/db/consultas/admin.ts:12-32` (`asegurarAdmin`), `src/app/admin/acciones.ts` (quitar `ingresar` y `salir`), `src/app/admin/(panel)/layout.tsx:4` (importar `salir` de `@/app/acciones-cuenta`), `tests/guardia.test.ts:11` (misma importación)
- Test: `tests/autenticacion.test.ts`, `tests/sesion.test.ts` (bloque `asegurarAdmin`)

**Interfaces:**
- Produces (`src/db/consultas/autenticacion.ts`):
  ```ts
  export type UsuarioParaIngreso = { id: number; usuario: string; nombre: string; hashClave: string; activo: boolean; rol: Rol; totpActivo: boolean; totpSecretoCifrado: string | null } & EstadoBloqueo;
  export async function buscarParaIngreso(usuario: string): Promise<UsuarioParaIngreso | null>; // lower(usuario) = lower($1), activo o no
  export async function guardarEstadoBloqueo(usuarioId: number, estado: EstadoBloqueo): Promise<void>;
  export type ResultadoAcceso = "ingreso" | "salida" | "fallo" | "bloqueo" | "desbloqueo" | "restablecimiento" | "factor_fallo" | "cierre_forzado";
  export type Acceso = { usuarioId: number | null; usuarioTexto: string; resultado: ResultadoAcceso; ip: string | null; userAgent: string | null };
  export async function registrarAcceso(acceso: Acceso): Promise<void>;
  export async function cambiarClaveDeUsuario(usuarioId: number, hashNuevo: string, conservarSesionId: string | null): Promise<void>; // hash, debe_cambiar_clave=false, actualizado_en, cierra las demás sesiones, auditoría "cambiar_clave"
  export async function aceptarAvisoDatos(usuarioId: number): Promise<void>; // acepto_datos_en = now(), auditoría "aceptar_aviso_datos"
  export async function guardarSecretoTotpPendiente(usuarioId: number, secretoCifrado: string): Promise<void>; // totp_activo = false
  export async function obtenerSecretoTotp(usuarioId: number): Promise<{ secretoCifrado: string | null; activo: boolean }>;
  export async function activarTotp(usuarioId: number, hashesRecuperacion: string[]): Promise<void>; // totp_activo = true, reemplaza códigos, auditoría "activar_segundo_factor"
  export async function desactivarTotp(usuarioId: number, actorId: number): Promise<void>; // limpia secreto y códigos, auditoría "quitar_segundo_factor" con actor
  export async function consumirCodigoRecuperacion(usuarioId: number, hash: string): Promise<boolean>; // marca usado_en si existe y no estaba usado
  ```
  Nota: los fallos de segundo factor por sesión no van a BD; se cuentan con
  `crearLimitador({ limite: 5, ventanaMs: 10 * 60_000 })` por `sesionId` en
  `acciones-cuenta.ts` y al quinto se cierra la sesión pendiente (cada fallo sí queda en
  `accesos` como `factor_fallo`).
- Produces (`src/app/acciones-cuenta.ts`, `"use server"`):
  ```ts
  export type { EstadoAccion } from "@/app/admin/comun";
  export async function ingresar(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion>;
  export async function verificarFactor(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion>;
  export async function salir(): Promise<void>;
  ```
- Produces (`asegurarAdmin`): crea con `rol = 'admin_sgc'`, `debe_cambiar_clave = true`;
  con `forzarClave`: nueva clave, `activo = true`, `debe_cambiar_clave = true`,
  `intentos_fallidos = 0`, `bloqueos_consecutivos = 0`, `bloqueado_hasta = NULL`.
- Consumes: `crearSesion` (Tarea 6), `ipDePeticion`, `rutaInterna`, `parsearFormulario`,
  `EsquemaIngreso`, `EsquemaCodigoFactor` (Tarea 5), `bloqueo.ts`, `clave.ts`.

- [ ] **Paso 1: Test de la capa de datos** (`tests/autenticacion.test.ts`, contra la BD;
crea `zz_auth` con `asegurarAdmin` y lo borra al final):

```ts
describe("ingreso y bloqueo", () => {
  it("buscarParaIngreso ignora mayúsculas y trae el estado de bloqueo", async () => {
    const u = await buscarParaIngreso("ZZ_AUTH");
    expect(u).toMatchObject({ usuario: "zz_auth", rol: "admin_sgc", intentosFallidos: 0, bloqueadoHasta: null });
    expect(await buscarParaIngreso("nadie")).toBeNull();
  });
  it("guardarEstadoBloqueo persiste y se refleja", async () => {
    const hasta = new Date(Date.now() + 60_000);
    await guardarEstadoBloqueo(usuarioId, { intentosFallidos: 0, bloqueosConsecutivos: 1, bloqueadoHasta: hasta });
    const u = await buscarParaIngreso("zz_auth");
    expect(u?.bloqueosConsecutivos).toBe(1);
    expect(u?.bloqueadoHasta?.getTime()).toBe(hasta.getTime());
    await guardarEstadoBloqueo(usuarioId, SIN_BLOQUEO);
  });
  it("registrarAcceso escribe usuario tecleado, IP y resultado; la fila no se puede alterar", async () => {
    await registrarAcceso({ usuarioId, usuarioTexto: "zz_auth", resultado: "fallo", ip: "10.1.1.1", userAgent: "vitest" });
    const [a] = await sql()`SELECT resultado, ip::text FROM accesos WHERE usuario_id = ${usuarioId} ORDER BY id DESC LIMIT 1`;
    expect(a).toEqual({ resultado: "fallo", ip: "10.1.1.1" });
  });
});
describe("clave, aviso y segundo factor", () => {
  it("cambiarClaveDeUsuario limpia debe_cambiar_clave y cierra las otras sesiones", async () => {
    const a = await crearSesion(usuarioId, { ip: null, userAgent: null });
    const b = await crearSesion(usuarioId, { ip: null, userAgent: null });
    const sa = await validarSesion(a.token);
    await cambiarClaveDeUsuario(usuarioId, await hashearClave("Nueva-clave-larga-2026"), sa!.sesionId);
    const [u] = await sql()`SELECT debe_cambiar_clave FROM usuarios WHERE id = ${usuarioId}`;
    expect(u.debe_cambiar_clave).toBe(false);
    expect(await validarSesion(a.token)).not.toBeNull();
    expect(await validarSesion(b.token)).toBeNull();
  });
  it("aceptarAvisoDatos deja fecha y auditoría", async () => {
    await aceptarAvisoDatos(usuarioId);
    const [u] = await sql()`SELECT acepto_datos_en FROM usuarios WHERE id = ${usuarioId}`;
    expect(u.acepto_datos_en).not.toBeNull();
    const [aud] = await sql()`SELECT 1 FROM auditoria WHERE accion = 'aceptar_aviso_datos' AND usuario_id = ${usuarioId}`;
    expect(aud).toBeTruthy();
  });
  it("activar TOTP guarda códigos hasheados de un solo uso; desactivar los borra", async () => {
    await guardarSecretoTotpPendiente(usuarioId, "cifrado-falso");
    expect((await obtenerSecretoTotp(usuarioId)).activo).toBe(false);
    const codigos = generarCodigosRecuperacion();
    await activarTotp(usuarioId, codigos.map(hashCodigoRecuperacion));
    expect((await obtenerSecretoTotp(usuarioId)).activo).toBe(true);
    expect(await consumirCodigoRecuperacion(usuarioId, hashCodigoRecuperacion(codigos[0]))).toBe(true);
    expect(await consumirCodigoRecuperacion(usuarioId, hashCodigoRecuperacion(codigos[0]))).toBe(false);
    await desactivarTotp(usuarioId, usuarioId);
    const filas = await sql()`SELECT 1 FROM codigos_recuperacion WHERE usuario_id = ${usuarioId}`;
    expect(filas).toHaveLength(0);
    expect((await obtenerSecretoTotp(usuarioId))).toEqual({ secretoCifrado: null, activo: false });
  });
});
```

Y en `tests/sesion.test.ts` (bloque `asegurarAdmin`): tras crear, `SELECT rol,
debe_cambiar_clave` da `admin_sgc` y `true`; tras `forzarClave` con la cuenta bloqueada
(`UPDATE usuarios SET bloqueado_hasta = now() + interval '1 hour'`), `bloqueado_hasta`
vuelve a `NULL`.

- [ ] **Paso 2: Correr y ver fallar**

Run: `npx vitest run tests/autenticacion.test.ts tests/sesion.test.ts`
Expected: FAIL.

- [ ] **Paso 3: Implementar `autenticacion.ts` y ajustar `asegurarAdmin`.**

- [ ] **Paso 4: Correr y ver pasar**

Run: `npx vitest run tests/autenticacion.test.ts tests/sesion.test.ts`
Expected: PASS.

- [ ] **Paso 5: Implementar las acciones y las páginas de ingreso**

`ingresar`: `parsearFormulario(formData, EsquemaIngreso)`; `ip = ipDePeticion(await
headers())`; si `ip` y el limitador por IP (30/min) rechaza → "Demasiados intentos desde
esta red. Espere un minuto."; `buscarParaIngreso`; inexistente o inactivo →
`hashearClave(clave)` (mismo costo), `registrarAcceso({usuarioId: null|id, usuarioTexto,
resultado: "fallo"})`, mensaje genérico "Usuario o clave incorrectos"; clave incorrecta →
`registrarIntentoFallido`, `guardarEstadoBloqueo`, acceso `"bloqueo"` si quedó bloqueada
o `"fallo"`, mensaje genérico; clave correcta pero `estaBloqueado` → acceso `"fallo"`,
mensaje "Cuenta bloqueada hasta las HH:MM por intentos fallidos. Si no fue usted, avise
al administrador." (hora en `America/Bogota` con `Intl.DateTimeFormat`, zona de
`ZONA_HORARIA` si existe); clave correcta y libre → `guardarEstadoBloqueo(SIN_BLOQUEO)`,
`crearSesion(id, { ip, userAgent, factorPendiente: totpActivo })`, cookie como hoy
(`acciones.ts:68-76`), si `totpActivo` → `redirect("/ingreso/verificar?volver=...")`;
si no → acceso `"ingreso"` y `redirect(rutaInterna(volver))`.

`verificarFactor`: `sesionActual()`; si no hay o no está `factorPendiente` →
`redirect("/ingreso")`; `parsearFormulario(EsquemaCodigoFactor)`; limitador por
`sesionId` 5 en 10 min: al agotarse, `cerrarSesion`, borrar cookie, acceso
`"factor_fallo"`, `redirect("/ingreso?motivo=factor")`; código de 6 dígitos →
`verificarTotp(descifrar(secreto), codigo)`; código de recuperación →
`consumirCodigoRecuperacion(hash)`; fallo → acceso `"factor_fallo"` y `{ ok: false,
error: "Código incorrecto" }`; éxito → `confirmarSegundoFactor`, acceso `"ingreso"`,
`redirect(rutaInterna(volver))`.

`salir`: `requerirSesion({ permitirPendientes: true })` (también desde una sesión con
factor pendiente: usar `sesionActual()` y tolerar `factorPendiente`), `cerrarSesion`,
borrar cookie, acceso `"salida"`, `redirect("/ingreso")`.

Páginas: `/ingreso` (`force-dynamic`; si ya hay sesión completa → `redirect("/")`; lee
`volver` y `motivo` de `searchParams`; el formulario conserva el estilo actual de
`FormularioIngreso` y añade `<input type="hidden" name="volver">`); `/ingreso/verificar`
(exige sesión con factor pendiente; campo de 6 dígitos con `inputMode="numeric"`,
enlace "Usar un código de recuperación" que cambia la etiqueta, botón "Cancelar y
salir" que llama `salir`). `/admin/ingreso` → `redirect("/ingreso")`.

- [ ] **Paso 6: Verificar a mano y con lint**

Run: `npm run lint && npm run dev` → abrir `http://localhost:3002/admin/ingreso`
Expected: redirige a `/ingreso`; con el admin de desarrollo entra (la primera vez
`debe_cambiar_clave` es `false` porque el admin ya existía: la Tarea 8 añade la pantalla
de clave inicial para admins nuevos); cinco claves erradas seguidas bloquean y, con la
clave correcta, aparece la hora de desbloqueo; `SELECT resultado, usuario_texto FROM
accesos ORDER BY id DESC LIMIT 7` muestra `fallo`×4, `bloqueo`, `fallo`, `ingreso`.
Desbloquear para seguir: `UPDATE usuarios SET bloqueado_hasta = NULL,
bloqueos_consecutivos = 0 WHERE usuario = 'admin'`.

- [ ] **Paso 7: Commit**

```bash
git add src/db/consultas/autenticacion.ts src/db/consultas/admin.ts src/app/acciones-cuenta.ts src/app/ingreso src/app/admin/ingreso/page.tsx src/app/admin/acciones.ts "src/app/admin/(panel)/layout.tsx" src/componentes/cuenta src/componentes/admin tests/autenticacion.test.ts tests/sesion.test.ts tests/guardia.test.ts
git commit -m "feat(f11): ingreso en /ingreso con bloqueo por cuenta, segundo factor TOTP y registro de accesos" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 8: Guard global, grupos de rutas y portal con sesión (punto de control 1)

**Files:**
- Modify: `src/proxy.ts`, `src/app/layout.tsx`, `src/componentes/EncabezadoSitio.tsx`, `src/db/consultas/eventos.ts` (`usuarioId`; eliminar la reexportación de `ipDePeticion` y corregir los importadores), `src/db/consultas/mapa-admin.ts:227-236` (`CLAVES_TEXTO` + `aviso_datos_personales`, textarea), `src/app/admin/(panel)/layout.tsx` (usar `exigirSesion`), `src/app/acciones-cuenta.ts` (+ `claveInicialAccion`, `aceptarAvisoAccion`)
- Move (con `git mv`): `src/app/page.tsx` → `src/app/(portal)/page.tsx`; `src/app/loading.tsx` → `src/app/(portal)/loading.tsx`; `src/app/buscar/` → `src/app/(portal)/buscar/`; `src/app/documentos/` → `src/app/(portal)/documentos/`; `src/app/procesos/` → `src/app/(portal)/procesos/`
- Modify tras mover: `src/app/(portal)/documentos/[codigo]/page.tsx:56-65` (evento con `usuarioId`), `src/app/(portal)/documentos/[codigo]/archivos/[archivoId]/[[...nombre]]/route.ts` (sesión desde la petición, 401, límite por usuario, evento con usuario), `src/app/(portal)/buscar/page.tsx:86-90` (límite por usuario)
- Create: `src/lib/paginas.ts`, `src/app/(portal)/layout.tsx`, `src/app/(portal)/sin-acceso/page.tsx`, `src/app/(cuenta)/layout.tsx`, `src/app/(cuenta)/cuenta/clave-inicial/page.tsx`, `src/app/(cuenta)/aviso-datos/page.tsx`, `src/componentes/cuenta/FormularioClave.tsx`, `src/componentes/cuenta/FormularioAviso.tsx`, `src/componentes/cuenta/MenuUsuario.tsx`
- Test: `tests/guardia.test.ts` (reescribir), `tests/a11y-estructura.test.ts:15-24` (rutas nuevas), `tests/descarga-estampada.test.ts` (sesión por cookie), `tests/paginas.test.ts` no (son redirecciones de Next; se cubren con el recorrido manual)

**Interfaces:**
- Produces (`src/lib/paginas.ts`):
  ```ts
  export async function exigirSesion(): Promise<SesionValida>;            // null → redirect("/ingreso"); pendiente → redirect(rutaDePendiente(p))
  // Decisión: cuando la cookie existe pero la sesión ya no vale (vencida, inactiva o
  // cerrada a la fuerza), el layout redirige a /ingreso SIN `volver`, porque un layout no
  // conoce la ruta pedida. El proxy sí añade `volver` cuando no hay cookie. Se acepta.
  export async function exigirPermiso(permiso: Permiso): Promise<SesionValida>; // exigirSesion + puede(...) o redirect("/sin-acceso")
  ```
- Produces (`src/proxy.ts`): `export const RUTAS_PUBLICAS = ["/ingreso", "/api/salud"] as const;`
  `export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|webp|svg|ico|woff2?)$).*)"] }`.
  Comportamiento: `/admin/ingreso` → 307 a `/ingreso`; ruta pública → next; con cookie →
  next; sin cookie y ruta bajo `/api/` o `/admin/api/` → 401 JSON; sin cookie el resto →
  307 a `/ingreso` con `volver=<pathname+search>` salvo para `/`.
- Produces (`EncabezadoSitio`): `({ usuario }: { usuario: { nombre: string; etiquetaRol: string; verPanel: boolean } | null })`;
  sin usuario muestra solo la marca; con usuario muestra búsqueda, `MenuUsuario` (nombre,
  rol, enlace "Administración" si `verPanel`, botón "Salir" como `<form action={salir}>`).
- Produces (`registrarEventoConsulta`): `EventoConsulta` gana `usuarioId: number | null`.
- Produces (acciones): `claveInicialAccion(_prev, formData)` (sesión con
  `permitirPendientes`, `EsquemaClaveInicial`, `validarClave`, `cambiarClaveDeUsuario(...,
  sesionId)`, `redirect("/")`); `aceptarAvisoAccion(_prev, formData)` (`aceptarAvisoDatos`,
  `redirect(rutaInterna(volver))`).
- Consumes: `sesionActual`, `sesionDePeticion`, `requerirSesion` (Tarea 6);
  `pendienteDeCuenta`, `rutaDePendiente`, `ipDePeticion`, `rutaInterna` (Tarea 5).

- [ ] **Paso 1: Reescribir `tests/guardia.test.ts`** (conserva el bloque de acciones sin
sesión y añade las nuevas: `claveInicialAccion`, `aceptarAvisoAccion`, `verificarFactor`):

```ts
describe("proxy (guard optimista global)", () => {
  it.each(["/", "/procesos/calidad", "/documentos/pr-cal-001", "/buscar?q=acta", "/admin", "/cuenta"])(
    "sin cookie %s redirige a /ingreso", (ruta) => {
      const res = proxy(new NextRequest("http://localhost:3002" + ruta));
      expect(res.status).toBe(307);
      const destino = new URL(res.headers.get("location")!);
      expect(destino.pathname).toBe("/ingreso");
      expect(destino.searchParams.get("volver")).toBe(ruta === "/" ? null : ruta);
    });
  it.each(["/api/lo-que-sea", "/admin/api/archivos"])("sin cookie %s responde 401 JSON", (ruta) => {
    expect(proxy(new NextRequest("http://localhost:3002" + ruta, { method: "POST" })).status).toBe(401);
  });
  it.each(RUTAS_PUBLICAS)("deja pasar %s sin cookie", (ruta) => {
    expect(proxy(new NextRequest("http://localhost:3002" + ruta)).status).toBe(200);
  });
  it("/admin/ingreso redirige a /ingreso", () => {
    expect(proxy(new NextRequest("http://localhost:3002/admin/ingreso")).headers.get("location")).toContain("/ingreso");
  });
  it("con cookie deja pasar (la validación real es de layouts y acciones)", () => {
    const req = new NextRequest("http://localhost:3002/procesos/x", { headers: { cookie: "sgc_sesion=algo" } });
    expect(proxy(req).status).toBe(200);
  });
  it("el matcher es constante y excluye estáticos", () => {
    expect(config.matcher).toHaveLength(1);
    expect(config.matcher[0]).toContain("_next/static");
  });
});
// import { GET as archivoPortal } from "@/app/(portal)/documentos/[codigo]/archivos/[archivoId]/[[...nombre]]/route";
// import { RUTAS_PUBLICAS, config, proxy } from "@/proxy";
describe("handlers sin sesión", () => {
  // los tres de admin/api/archivos y el excel del maestro siguen → 401
  it("el GET de archivos del portal sin cookie responde 401", async () => {
    const res = await archivoPortal(new NextRequest("http://localhost:3002/documentos/mn-cal-001/archivos/1"),
      { params: Promise.resolve({ codigo: "mn-cal-001", archivoId: "1" }) });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Paso 2: Actualizar `tests/a11y-estructura.test.ts`** con las rutas bajo
`src/app/(portal)/...` y **`tests/descarga-estampada.test.ts`**: en `beforeAll` insertar
`zz_descarga` (`rol = 'consulta'`, `acepto_datos_en = now()`), crear sesión con
`crearSesion(id, { ip: null, userAgent: UA })` y enviar `cookie: sgc_sesion=<token>` en
`peticion()`; importar la ruta desde `@/app/(portal)/documentos/...`; añadir:

```ts
it("sin cookie responde 401 y no registra evento", async () => {
  const { id } = await archivoPdfVigente("MN-CAL-001");
  const res = await GET(new NextRequest(`http://localhost:3002/documentos/mn-cal-001/archivos/${id}?descarga=1`),
    { params: Promise.resolve({ codigo: "mn-cal-001", archivoId: String(id) }) });
  expect(res.status).toBe(401);
});
it("la descarga queda registrada con el usuario de la sesión", async () => {
  const [e] = await sql()`SELECT usuario_id FROM eventos_consulta WHERE user_agent = ${UA} ORDER BY id DESC LIMIT 1`;
  expect(e.usuario_id).toBe(usuarioId);
});
```
y en `afterAll` borrar el usuario (los eventos quedan con `usuario_id` nulo por `SET NULL`;
borrar los de `UA` como hoy).

- [ ] **Paso 3: Correr y ver fallar**

Run: `npx vitest run tests/guardia.test.ts tests/a11y-estructura.test.ts tests/descarga-estampada.test.ts`
Expected: FAIL.

- [ ] **Paso 4: Mover las páginas y crear los grupos**

`git mv` según la lista. `(portal)/layout.tsx`: `export const dynamic = "force-dynamic"`;
`await exigirSesion()`; devuelve `children`. `(cuenta)/layout.tsx`: sesión con
`sesionActual()`; sin sesión → `redirect("/ingreso")`; `factorPendiente` →
`redirect("/ingreso/verificar")`; devuelve `children` dentro de un `<main>` centrado como
el de ingreso. `clave-inicial/page.tsx`: si `!sesion.debeCambiarClave` → `redirect("/")`;
muestra la política (12 a 128 caracteres, no común, sin el usuario) y `FormularioClave`
(campos `claveNueva`, `confirmacion`; prop `accion`). `aviso-datos/page.tsx`: si ya
aceptó → `redirect("/")`; texto de `configuracion.aviso_datos_personales` (vía
`obtenerTextos()`; si está vacío, "La entidad aún no ha cargado el aviso de tratamiento
de datos personales; al continuar acepta que sus datos de cuenta se usan solo para operar
esta plataforma.") en `<p>` por párrafo (texto plano), checkbox obligatorio y botón
"Aceptar y continuar". `sin-acceso/page.tsx`: mensaje y enlace a `/`.

- [ ] **Paso 5: Proxy, layout raíz y encabezado**

`src/proxy.ts` con la lógica de la interfaz. `src/app/layout.tsx` pasa a `async`, llama
`sesionActual()` y pasa `usuario` al encabezado (`verPanel = puede(sesion, "panel.entrar")`,
`etiquetaRol = ETIQUETA_ROL[rol]`); conserva `href="#contenido"`, `id="contenido"` y
"Saltar al contenido" (el test de a11y los exige). `MenuUsuario` es cliente (`<details>`
nativo, sin JS extra) y recibe `salir` por import directo desde `@/app/acciones-cuenta`.

- [ ] **Paso 6: Eventos y límites por usuario**

`eventos.ts`: `usuarioId` en el INSERT; quitar la reexportación de `ipDePeticion` y
cambiar sus cuatro importadores a `@/lib/ip`. Ficha de documento: `const sesion = await
sesionActual()` y `usuarioId: sesion?.usuarioId ?? null`. Ruta de archivos del portal:
`const sesion = await sesionDePeticion(peticion); if (!sesion) return 401 JSON`; limitador
por `String(sesion.usuarioId)` (60/min); evento con `usuarioId`. Búsqueda: limitador por
usuario (30/min) en vez de IP.

- [ ] **Paso 7: Correr tests, lint y build sin `.env.local`**

Run: `npx vitest run && npm run lint && mv .env.local .env.local.bak && npm run build 2>&1 | tail -20; mv .env.local.bak .env.local`
Expected: todo en verde; el build sin `DATABASE_URL` termina sin errores (ninguna página
nueva se prerenderiza con BD).

- [ ] **Paso 8: Recorrido manual del punto de control**

Run: `npm run dev`. Abrir `http://localhost:3002/procesos/consulta-externa` sin sesión →
`/ingreso?volver=/procesos/consulta-externa`; entrar con `admin` → aparece el aviso de
datos personales (el admin existente no lo había aceptado) → aceptar → vuelve a la ruta
pedida; el encabezado muestra nombre, rol, "Administración" y "Salir"; mapa, proceso,
ficha, visor PDF, descarga con marca de agua y búsqueda funcionan como antes; "Salir"
lleva a `/ingreso` y `/` vuelve a pedir ingreso. `curl -i http://localhost:3002/api/salud`
responde 200 sin cookie.

- [ ] **Paso 9: Commit**

```bash
git add -A src/app src/proxy.ts src/lib/paginas.ts src/componentes src/db/consultas/eventos.ts src/db/consultas/mapa-admin.ts tests
git commit -m "feat(f11): sesión obligatoria en toda la app: proxy global, grupos (portal) y (cuenta), aviso de datos y clave inicial" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

> **Punto de control 1.** Avisar al usuario: puede probar el ingreso, el bloqueo y el
> portal detrás del login con su `admin`. Las demás cuentas llegan en las Tareas 12 y 16.

---

### Tarea 9: Mi cuenta: cambio de clave y segundo factor

**Files:**
- Create: `src/app/(cuenta)/cuenta/page.tsx`, `src/app/(cuenta)/cuenta/segundo-factor/page.tsx`, `src/db/consultas/perfil.ts`, `src/componentes/cuenta/FormularioCambioClave.tsx`, `src/componentes/cuenta/PanelSegundoFactor.tsx`
- Modify: `src/app/acciones-cuenta.ts` (+ `cambiarClaveAccion`, `iniciarTotpAccion`, `confirmarTotpAccion`, `desactivarTotpAccion`), `src/componentes/cuenta/MenuUsuario.tsx` (+ enlace "Mi cuenta"), `src/lib/bitacora-detalle.ts` (+ `cambiar_clave`, `aceptar_aviso_datos`, `activar_segundo_factor`, `quitar_segundo_factor`)
- Test: `tests/perfil.test.ts`, `tests/bitacora-detalle.test.ts` (+4 casos), `tests/guardia.test.ts` (+4 acciones sin sesión)

**Interfaces:**
- Produces (`src/db/consultas/perfil.ts`):
  ```ts
  export type Perfil = { id: number; usuario: string; nombre: string; correo: string | null; rol: Rol; cargo: string | null; area: string | null; totpActivo: boolean; procesos: Array<{ id: number; nombre: string; slug: string }>; supervisores: Array<{ nombre: string; cargo: string | null }> };
  export async function obtenerPerfil(usuarioId: number): Promise<Perfil | null>; // supervisores queda [] hasta la Tarea 11, que la conecta con supervisoresDe
  ```
- Produces (acciones):
  ```ts
  export async function cambiarClaveAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion>; // EsquemaCambioClave; verifica la actual; validarClave; cambiarClaveDeUsuario(..., sesionId); { ok: false, error } o redirect("/cuenta?aviso=clave")
  export type EstadoFactor = EstadoAccion | { ok: true; codigos: string[] };
  export async function iniciarTotpAccion(): Promise<void>;                 // genera secreto, guardarSecretoTotpPendiente(cifrar(secreto)), redirect("/cuenta/segundo-factor")
  export async function confirmarTotpAccion(_prev: EstadoFactor, formData: FormData): Promise<EstadoFactor>; // EsquemaCodigoFactor; verificarTotp(descifrar(secreto)); activarTotp con 8 códigos → { ok: true, codigos }
  export async function desactivarTotpAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion>; // EsquemaClaveSola; verifica clave; desactivarTotp(usuarioId, usuarioId); redirect("/cuenta?aviso=factor-desactivado")
  ```
- Página `/cuenta/segundo-factor`: lee `obtenerSecretoTotp`; si no hay secreto pendiente
  ni activo muestra el botón "Activar segundo factor" (`iniciarTotpAccion`); si hay
  pendiente, muestra el QR (`await QRCode.toDataURL(uriTotp(secreto, usuario,
  nombre_entidad))` en `<img alt="Código QR para la app de autenticación">`), la clave
  manual en grupos de 4 y `PanelSegundoFactor` (cliente) con el campo de código; tras
  confirmar, los 8 códigos de recuperación en una lista con botón "Copiar" y la
  advertencia de que no se vuelven a mostrar. Con `?obligatorio=1` muestra el aviso "Su
  rol exige segundo factor" y el botón "Salir". Si ya está activo: estado y formulario de
  desactivación con clave.

- [ ] **Paso 1: Tests**

```ts
// tests/perfil.test.ts (BD; usuario zz_perfil con rol lider_proceso, un proceso asignado)
it("arma el perfil con rol, procesos y sin supervisores todavía", async () => {
  const p = await obtenerPerfil(usuarioId);
  expect(p).toMatchObject({ usuario: "zz_perfil", rol: "lider_proceso", totpActivo: false, supervisores: [] });
  expect(p?.procesos.map((x) => x.id)).toEqual([procesoId]);
  expect(await obtenerPerfil(-1)).toBeNull();
});
// tests/bitacora-detalle.test.ts
it.each([
  ["cambiar_clave", "Cambió su clave"],
  ["aceptar_aviso_datos", "Aceptó el aviso de tratamiento de datos personales"],
  ["activar_segundo_factor", "Activó el segundo factor"],
  ["quitar_segundo_factor", "Desactivó el segundo factor"],
])("%s se describe como «%s»", (accion, texto) => {
  expect(describirEvento({ accion, entidad: "usuario", entidadId: 1, detalle: {} })).toBe(texto);
});
```

- [ ] **Paso 2: Correr y ver fallar.** Run: `npx vitest run tests/perfil.test.ts tests/bitacora-detalle.test.ts` → FAIL.

- [ ] **Paso 3: Implementar** perfil, acciones, páginas y componentes. `cuenta/page.tsx`:
si `pendienteDeCuenta(sesion)` → `redirect(rutaDePendiente(...))`; secciones "Mis datos",
"Cambiar clave", "Segundo factor" (estado + enlace). El QR siempre es PNG en `data:` URL
(la CSP permite `img-src data:`); nunca SVG inyectado.

- [ ] **Paso 4: Correr y ver pasar.** Run: `npx vitest run && npm run lint` → PASS.

- [ ] **Paso 5: Verificación manual con una app de autenticación**

Run: `npm run dev` → Mi cuenta → Activar segundo factor → escanear con Google
Authenticator o Aegis → confirmar → anotar un código de recuperación → Salir → entrar:
pide código; probar un código errado (mensaje "Código incorrecto"), uno correcto, y en
otra sesión el código de recuperación (una sola vez). Desactivar con la clave.
Comprobar `SELECT accion FROM auditoria ORDER BY id DESC LIMIT 3`.

- [ ] **Paso 6: Commit**

```bash
git add "src/app/(cuenta)" src/app/acciones-cuenta.ts src/db/consultas/perfil.ts src/componentes/cuenta src/lib/bitacora-detalle.ts tests/perfil.test.ts tests/bitacora-detalle.test.ts tests/guardia.test.ts
git commit -m "feat(f11): Mi cuenta con cambio de clave y segundo factor TOTP con códigos de recuperación" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 10: Permisos en el panel heredado (punto de control 2)

**Files:**
- Modify: `src/app/admin/comun.ts:41-59` (`mutacion` con permiso y límite), `src/app/admin/acciones.ts`, `src/app/admin/acciones-mapa.ts` (permiso en cada acción), `src/app/admin/(panel)/layout.tsx` (exigir `panel.entrar`, navegación por permisos), `src/app/admin/(panel)/page.tsx`, `documentos/nuevo/page.tsx`, `documentos/[codigo]/page.tsx`, `documentos/[codigo]/editar/page.tsx`, `mapa/**/page.tsx`, `tipos/**/page.tsx`, `maestro/page.tsx`, `maestro/excel/route.ts`, `estadisticas/page.tsx`, `bitacora/page.tsx`, `src/app/admin/api/archivos/route.ts`, `src/app/admin/api/archivos/[archivoId]/route.ts`
- Create: `src/componentes/admin/enlaces-panel.ts`
- Test: `tests/acciones-permisos.test.ts`, `tests/handlers-permisos.test.ts`

**Interfaces:**
- Produces (`comun.ts`):
  ```ts
  export async function mutacion(formData: FormData, permiso: Permiso, fn: (usuarioId: number, formData: FormData, sesion: SesionValida) => Promise<string | void>): Promise<EstadoAccion>;
  // requerirSesion() → requerirPermiso(sesion, permiso) (ErrorPermiso se devuelve como { ok: false, error }) → límite 60/min por usuario ("Demasiadas operaciones seguidas. Espere un minuto.") → fn
  ```
- Produces (`enlaces-panel.ts`): `export const ENLACES_PANEL: ReadonlyArray<{ href: string; etiqueta: string; permiso: Permiso }>`
  con Documentos (`documentos.ver_historial`), Mapa y Tipos de documento (`mapa.administrar`),
  Listado Maestro (`maestro.ver`), Estadísticas (`estadisticas.ver`), Bitácora (`bitacora.ver`);
  las Tareas 11, 12 y 14 añaden Estructura, Usuarios, Accesos y Sesiones.
- Permisos por acción: todas las de `acciones.ts` → `"documentos.administrar"`; todas las
  de `acciones-mapa.ts` → `"mapa.administrar"` (`moverAccion`, `alternarAccion`,
  `borrarAccion` no pasan por `mutacion`: llaman `requerirPermiso(sesion, "mapa.administrar")`
  tras `requerirSesion()`).
- Permisos por página y handler: tabla del diseño F11 §5. `(panel)/page.tsx` sin
  `documentos.ver_historial` → `redirect("/admin/estadisticas")`. Detalle de documento
  sin `documentos.administrar`: no renderiza `FormAccion`, `ZonaCarga`,
  `FormularioVersionCliente`, `EliminarArchivo` ni "Editar metadatos". `maestro/page.tsx`
  muestra el enlace al Excel solo con `maestro.exportar`. Handlers: `sesionDePeticion`
  → 401; `puede` → 403 `{ error: "Sin permiso" }`; subida con límite 30/min por usuario.

- [ ] **Paso 1: Test estructural** (`tests/acciones-permisos.test.ts`):

```ts
const ARCHIVOS_PANEL = globSync("src/app/admin/acciones*.ts");   // node:fs globSync (Node 22+)
function exportadas(src: string) {
  const m = [...src.matchAll(/export async function (\w+)\(/g)];
  return m.map((x, i) => ({ nombre: x[1], cuerpo: src.slice(x.index!, m[i + 1]?.index ?? src.length) }));
}
describe("toda acción del panel declara su permiso", () => {
  for (const archivo of ARCHIVOS_PANEL) {
    const src = readFileSync(archivo, "utf8");
    for (const { nombre, cuerpo } of exportadas(src)) {
      it(`${archivo} › ${nombre}`, () => {
        expect(cuerpo).toMatch(/mutacion\(\s*formData,\s*"[a-z_.]+"|requerirPermiso\(/);
      });
    }
  }
});
describe("toda acción de cuenta exige sesión salvo ingresar", () => {
  const src = readFileSync("src/app/acciones-cuenta.ts", "utf8");
  for (const { nombre, cuerpo } of exportadas(src)) {
    if (nombre === "ingresar") continue;
    it(nombre, () => expect(cuerpo).toMatch(/requerirSesion\(|sesionActual\(/));
  }
});
```

- [ ] **Paso 2: Test de handlers por rol** (`tests/handlers-permisos.test.ts`, BD; crea
`zz_consulta` (consulta) y `zz_ci` (control_interno) con `acepto_datos_en = now()` y una
sesión para cada uno; `cookie(token)` devuelve `{ cookie: \`sgc_sesion=${token}\` }`;
`archivoBorradorId` = el archivo principal de `FT-CAL-003`, que el seed deja en borrador):

```ts
it("consulta no exporta el maestro (403) y control interno sí (200)", async () => {
  expect((await excelMaestro(new NextRequest("http://localhost:3002/admin/maestro/excel", { headers: cookie(tokenConsulta) }))).status).toBe(403);
  expect((await excelMaestro(new NextRequest("http://localhost:3002/admin/maestro/excel", { headers: cookie(tokenCi) }))).status).toBe(200);
});
it("consulta no ve archivos de cualquier estado por la ruta del admin; control interno sí", async () => {
  const params = { params: Promise.resolve({ archivoId: String(archivoBorradorId) }) };
  expect((await verArchivo(new NextRequest("http://localhost:3002/admin/api/archivos/1", { headers: cookie(tokenConsulta) }), params)).status).toBe(403);
  expect((await verArchivo(new NextRequest("http://localhost:3002/admin/api/archivos/1", { headers: cookie(tokenCi) }), params)).status).toBe(200);
});
it("control interno no puede subir ni borrar archivos (403)", async () => {
  expect((await subirArchivo(new NextRequest("http://localhost:3002/admin/api/archivos?version=1&rol=principal", { method: "POST", headers: cookie(tokenCi) }))).status).toBe(403);
  expect((await eliminarArchivo(new NextRequest("http://localhost:3002/admin/api/archivos/1", { method: "DELETE", headers: cookie(tokenCi) }), { params: Promise.resolve({ archivoId: "1" }) })).status).toBe(403);
});
```

- [ ] **Paso 3: Correr y ver fallar.** Run: `npx vitest run tests/acciones-permisos.test.ts tests/handlers-permisos.test.ts` → FAIL.

- [ ] **Paso 4: Implementar** `mutacion`, permisos en acciones, layout con
`exigirPermiso("panel.entrar")` y navegación filtrada por `puede`, páginas con
`exigirPermiso`, detalle de documento de solo lectura, handlers con `sesionDePeticion`
y `puede`.

- [ ] **Paso 5: Correr todo.** Run: `npx vitest run && npm run lint` → PASS.

- [ ] **Paso 6: Verificación manual.** Con el `admin` todo sigue igual. Crear a mano un
usuario de prueba en BD con rol `consulta` (`INSERT INTO usuarios (usuario, nombre,
hash_clave, rol, acepto_datos_en) ...` con un hash generado por `npx tsx -e
"import('@/lib/clave').then(m=>m.hashearClave('Prueba-larga-2026').then(console.log))"`),
entrar con él: `/admin` → `/sin-acceso`; el encabezado no muestra "Administración".

- [ ] **Paso 7: Commit**

```bash
git add src/app/admin src/componentes/admin/enlaces-panel.ts tests/acciones-permisos.test.ts tests/handlers-permisos.test.ts
git commit -m "feat(f11): permisos por rol en acciones, páginas y handlers del panel" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

> **Punto de control 2.** El panel respeta la matriz. Los roles se prueban de verdad con
> los usuarios de la Tarea 12 o la semilla de la Tarea 16.

---

### Tarea 11: Estructura organizacional: áreas, cargos y supervisores

**Files:**
- Create: `src/db/consultas/estructura.ts`, `src/app/admin/acciones-estructura.ts`, `src/app/admin/(panel)/estructura/page.tsx`, `.../estructura/areas/nueva/page.tsx`, `.../estructura/areas/[id]/page.tsx`, `.../estructura/cargos/nuevo/page.tsx`, `.../estructura/cargos/[id]/page.tsx`, `src/componentes/admin/estructura/FormularioArea.tsx`, `src/componentes/admin/estructura/FormularioCargo.tsx`
- Modify: `src/componentes/admin/enlaces-panel.ts` (+ Estructura → `estructura.administrar`), `src/lib/bitacora-detalle.ts:9-15` (`SINGULAR` + `areas: "área"`, `cargos: "cargo"`), `src/db/consultas/perfil.ts` (supervisores reales)
- Test: `tests/estructura.test.ts`, `tests/perfil.test.ts` (+1 caso)

**Interfaces:**
- Produces (`src/db/consultas/estructura.ts`):
  ```ts
  export type Area = { id: number; nombre: string; orden: number; activo: boolean; numCargos: number };
  export type Cargo = { id: number; nombre: string; areaId: number; areaNombre: string; superiorId: number | null; superiorNombre: string | null; activo: boolean; numUsuarios: number };
  export async function listarAreas(): Promise<Area[]>;                    // por orden
  export async function crearArea(datos: { nombre: string }, actorId: number): Promise<{ id: number }>; // orden = max + 1; auditoría crear_area
  export async function editarArea(id: number, datos: { nombre: string }, actorId: number): Promise<void>;
  export async function moverArea(id: number, direccion: "arriba" | "abajo", actorId: number): Promise<void>; // delega en `mover("areas", ...)` de mapa-admin.ts: añadir "areas" a TABLAS_MAPA con AMBITO["areas"] = null (orden global), como ya hace tipos_documento; los botones BotonesOrden/BotonToggle sirven con tabla="areas"
  export async function alternarArea(id: number, activo: boolean, actorId: number): Promise<void>; // desactivar con cargos activos → Error("El área tiene cargos activos; desactívelos primero")
  export async function listarCargos(): Promise<Cargo[]>;                  // por área y nombre
  export async function crearCargo(datos: { nombre: string; areaId: number; superiorId: number | null }, actorId: number): Promise<{ id: number }>;
  export async function editarCargo(id: number, datos: { nombre: string; areaId: number; superiorId: number | null }, actorId: number): Promise<void>; // superiorId === id o ciclo → Error("El cargo superior crea un ciclo en el organigrama")
  export async function alternarCargo(id: number, activo: boolean, actorId: number): Promise<void>; // desactivar con usuarios activos → Error("El cargo tiene usuarios activos; reasígnelos primero")
  export function detectarCiclo(cargos: ReadonlyArray<{ id: number; superiorId: number | null }>, id: number, nuevoSuperiorId: number | null): boolean; // pura
  export async function supervisoresDe(usuarioId: number): Promise<Array<{ id: number; nombre: string; cargo: string | null }>>; // jefe inmediato si existe; si no, usuarios activos cuyo cargo es el superior del cargo del usuario; [] si nada aplica
  ```
- Produces (acciones, todas con `mutacion(formData, "estructura.administrar", ...)`):
  `crearAreaAccion`, `editarAreaAccion`, `moverAreaAccion`, `alternarAreaAccion`,
  `crearCargoAccion`, `editarCargoAccion`, `alternarCargoAccion`; validan con
  `parsearFormulario(formData, EsquemaArea | EsquemaCargo)`.
- Las claves de auditoría `crear_area`, `editar_area`, `activar_area`, `desactivar_area`,
  `reordenar_area`, `crear_cargo`, `editar_cargo`, `activar_cargo`, `desactivar_cargo` las
  cubre el fallback `<verbo>_<singular>` de `describirEvento` con `SINGULAR` ampliado.

- [ ] **Paso 1: Tests** (`tests/estructura.test.ts`; BD; el `beforeAll` crea el actor
`zz_actor` (admin), el área `ZZ Gerencia` con los cargos `ZZ Gerente` (`gerenteId`) y
`ZZ Subgerente` (`subgerenteId`, superior `gerenteId`), y los usuarios `zz_jefe` (cargo
`ZZ Gerente`, `jefeId`), `zz_sub` (cargo `ZZ Subgerente`, `subId`), `zz_otro` (sin cargo,
`otroId`) y `zz_u` (`usuarioPruebaId`); limpia todo lo `zz_` al final):

```ts
describe("detectarCiclo", () => {
  const cargos = [{ id: 1, superiorId: null }, { id: 2, superiorId: 1 }, { id: 3, superiorId: 2 }];
  it("detecta ciclo directo e indirecto y acepta cadenas válidas", () => {
    expect(detectarCiclo(cargos, 1, 3)).toBe(true);   // 1 ← 2 ← 3 ← 1
    expect(detectarCiclo(cargos, 2, 2)).toBe(true);
    expect(detectarCiclo(cargos, 3, 1)).toBe(false);
    expect(detectarCiclo(cargos, 1, null)).toBe(false);
  });
});
describe("áreas y cargos en BD", () => {
  it("crea área y cargos encadenados, y rechaza el ciclo en edición", async () => {
    const { id: areaId } = await crearArea({ nombre: "ZZ Gerencia" }, actorId);
    const g = await crearCargo({ nombre: "ZZ Gerente", areaId, superiorId: null }, actorId);
    const s = await crearCargo({ nombre: "ZZ Subgerente", areaId, superiorId: g.id }, actorId);
    await expect(editarCargo(g.id, { nombre: "ZZ Gerente", areaId, superiorId: s.id }, actorId)).rejects.toThrow(/ciclo/);
  });
  it("no deja desactivar un área con cargos activos ni un cargo con usuarios activos", async () => {
    await expect(alternarArea(areaId, false, actorId)).rejects.toThrow(/cargos activos/);
    await sql()`UPDATE usuarios SET cargo_id = ${subgerenteId} WHERE id = ${usuarioPruebaId}`;
    await expect(alternarCargo(subgerenteId, false, actorId)).rejects.toThrow(/usuarios activos/);
  });
  it("supervisoresDe: por organigrama y por jefe inmediato", async () => {
    // zz_jefe tiene el cargo ZZ Gerente; zz_sub tiene ZZ Subgerente
    expect((await supervisoresDe(subId)).map((s) => s.id)).toEqual([jefeId]);
    await sql()`UPDATE usuarios SET jefe_inmediato_id = ${otroId} WHERE id = ${subId}`;
    expect((await supervisoresDe(subId)).map((s) => s.id)).toEqual([otroId]);
    expect(await supervisoresDe(jefeId)).toEqual([]);
  });
  it("todo queda en bitácora", async () => {
    const filas = await sql()`SELECT accion FROM auditoria WHERE usuario_id = ${actorId} AND accion IN ('crear_area','crear_cargo','editar_cargo')`;
    expect(filas.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Paso 2: Correr y ver fallar.** Run: `npx vitest run tests/estructura.test.ts` → FAIL.

- [ ] **Paso 3: Implementar** consultas, acciones, páginas (lista de áreas con orden y
estado y, debajo, cargos agrupados por área con su superior y número de usuarios;
formularios con `<select>` de área y de cargo superior que excluye el propio cargo) y
conectar `supervisoresDe` en `obtenerPerfil`. Añadir en `tests/perfil.test.ts` el caso
"con cargo y superior, el perfil lista al supervisor".

- [ ] **Paso 4: Correr y ver pasar.** Run: `npx vitest run && npm run lint` → PASS.

- [ ] **Paso 5: Commit**

```bash
git add src/db/consultas/estructura.ts src/db/consultas/perfil.ts src/app/admin/acciones-estructura.ts "src/app/admin/(panel)/estructura" src/componentes/admin tests/estructura.test.ts tests/perfil.test.ts src/lib/bitacora-detalle.ts
git commit -m "feat(f11): áreas y cargos con jerarquía y resolución de supervisores" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 12: Administración de usuarios

**Files:**
- Create: `src/db/consultas/usuarios.ts`, `src/app/admin/acciones-usuarios.ts`, `src/app/admin/(panel)/usuarios/page.tsx`, `.../usuarios/nuevo/page.tsx`, `.../usuarios/[id]/page.tsx`, `src/componentes/admin/usuarios/FormularioUsuario.tsx`, `src/componentes/admin/usuarios/ClaveTemporal.tsx`, `src/componentes/admin/usuarios/BotonRestablecer.tsx`
- Modify: `src/componentes/admin/enlaces-panel.ts` (+ Usuarios → `usuarios.administrar`), `src/lib/bitacora-detalle.ts` (+ `crear_usuario`, `editar_usuario`, `desactivar_usuario`, `reactivar_usuario`, `restablecer_clave`, `desbloquear_usuario`)
- Test: `tests/usuarios.test.ts`, `tests/bitacora-detalle.test.ts` (+6)

**Interfaces:**
- Produces (`src/db/consultas/usuarios.ts`):
  ```ts
  export type DatosUsuario = { usuario: string; nombre: string; correo: string | null; rol: Rol; cargoId: number | null; jefeInmediatoId: number | null; procesoIds: number[]; verHistorial: boolean };
  export type FilaUsuario = { id: number; usuario: string; nombre: string; rol: Rol; cargo: string | null; area: string | null; activo: boolean; bloqueadoHasta: string | null; totpActivo: boolean; debeCambiarClave: boolean; ultimoIngreso: string | null };
  export type UsuarioDetalle = DatosUsuario & { id: number; activo: boolean; bloqueadoHasta: string | null; totpActivo: boolean; debeCambiarClave: boolean; aceptoDatosEn: string | null; creadoEn: string; cargoNombre: string | null; areaNombre: string | null; procesos: Array<{ id: number; nombre: string; sigla: string }>; supervisores: Array<{ id: number; nombre: string; cargo: string | null }>; sesionesActivas: number };
  export async function listarUsuarios(filtros?: { texto?: string; rol?: Rol; activo?: boolean }): Promise<FilaUsuario[]>; // ultimoIngreso = max(accesos.creado_en) con resultado 'ingreso'
  export async function obtenerUsuario(id: number): Promise<UsuarioDetalle | null>;
  export async function contarAdminsActivos(): Promise<number>;
  export async function crearUsuario(datos: DatosUsuario, claveTemporal: string, actorId: number): Promise<{ id: number }>; // hash Argon2id, debe_cambiar_clave = true, usuario_procesos, auditoría crear_usuario { usuario, rol }; 23505 → "Ya existe un usuario con ese nombre" | "Ya existe un usuario con ese correo"
  export async function editarUsuario(id: number, datos: Omit<DatosUsuario, "usuario">, actorId: number): Promise<void>; // auditoría editar_usuario { antes, despues } solo con los campos que cambiaron; actorId === id y rol ≠ admin_sgc → Error("No puede quitarse a sí mismo el rol de administrador")
  export async function cambiarActivo(id: number, activo: boolean, actorId: number): Promise<void>; // actorId === id → Error("No puede desactivar su propia cuenta"); desactivar cierra sus sesiones; auditoría desactivar_usuario | reactivar_usuario
  export async function restablecerClave(id: number, actorId: number): Promise<{ claveTemporal: string }>; // generarClaveTemporal, hash, debe_cambiar_clave = true, SIN_BLOQUEO, cierra sesiones, accesos "restablecimiento" (usuario_id = id, usuario_texto = su usuario), auditoría
  export async function desbloquearUsuario(id: number, actorId: number): Promise<void>; // SIN_BLOQUEO, accesos "desbloqueo", auditoría
  export async function quitarSegundoFactor(id: number, actorId: number): Promise<void>; // desactivarTotp(id, actorId)
  ```
- Produces (acciones, `mutacion(formData, "usuarios.administrar", ...)` salvo las que
  devuelven datos): `crearUsuarioAccion(_prev: EstadoCreacion, formData): Promise<EstadoCreacion>`
  con `type EstadoCreacion = EstadoAccion | { ok: true; id: number; usuario: string; claveTemporal: string }`;
  `editarUsuarioAccion`, `cambiarActivoAccion`, `desbloquearAccion`, `quitarFactorAccion`
  (vía `mutacion`), `restablecerClaveAccion(_prev: EstadoRestablecer, formData)` con
  `type EstadoRestablecer = EstadoAccion | { ok: true; claveTemporal: string }`. Las dos que
  devuelven datos llaman `requerirSesion()` + `requerirPermiso(sesion, "usuarios.administrar")`
  explícitamente (el test estructural lo exige).
- Páginas: lista con filtros por `searchParams` (server-driven), insignias de estado con
  texto (Activo, Inactivo, Bloqueado hasta HH:MM), aviso destacado si
  `contarAdminsActivos() < 2`: "Hay un solo administrador del SGC activo. Cree un
  segundo para no depender de una sola persona." Formulario con `<select>` de rol, cargo,
  jefe inmediato (usuarios activos) y lista de checkboxes de procesos activos; para
  `lider_proceso` el servidor exige al menos uno. Tras crear, pantalla con `ClaveTemporal`
  (clave en grande, botón "Copiar", aviso "no se volverá a mostrar"). Detalle con los
  botones de acción (`FormAccion` existente para desactivar/reactivar/desbloquear/quitar
  2FA; `BotonRestablecer` muestra la clave devuelta).

- [ ] **Paso 1: Tests** (`tests/usuarios.test.ts`; BD; actor `zz_admin_u` con `asegurarAdmin`;
`procesoId` = un proceso activo; `u1` = id devuelto por el primer `crearUsuario`):

```ts
const base: DatosUsuario = { usuario: "zz_base", nombre: "Persona de Prueba", correo: null, rol: "consulta", cargoId: null, jefeInmediatoId: null, procesoIds: [], verHistorial: false };
it("crearUsuario deja clave temporal válida, cambio obligatorio, procesos y auditoría", async () => {
  const temporal = generarClaveTemporal();
  const { id } = await crearUsuario({ ...base, usuario: "zz_u1", rol: "lider_proceso", procesoIds: [procesoId] }, temporal, actorId);
  const [u] = await sql()`SELECT hash_clave, debe_cambiar_clave, rol FROM usuarios WHERE id = ${id}`;
  expect(await verificarClave(u.hash_clave, temporal)).toBe(true);
  expect(u.debe_cambiar_clave).toBe(true);
  expect((await sql()`SELECT proceso_id FROM usuario_procesos WHERE usuario_id = ${id}`).map((f) => f.proceso_id)).toEqual([procesoId]);
  expect((await sql()`SELECT 1 FROM auditoria WHERE accion = 'crear_usuario' AND entidad_id = ${id}`).length).toBe(1);
});
it("rechaza usuario y correo repetidos con mensajes propios", async () => {
  await expect(crearUsuario({ ...base, usuario: "zz_u1" }, "x".repeat(12), actorId)).rejects.toThrow(/nombre/);
  await expect(crearUsuario({ ...base, usuario: "zz_u2", correo: "ZZ_U1@h.gov.co" }, "x".repeat(12), actorId)).rejects.toThrow(/correo/);
});
it("editarUsuario registra antes y después del rol", async () => {
  await editarUsuario(u1, { ...base, rol: "gerencia", procesoIds: [] }, actorId);
  const [a] = await sql()`SELECT detalle FROM auditoria WHERE accion = 'editar_usuario' AND entidad_id = ${u1} ORDER BY id DESC LIMIT 1`;
  expect(a.detalle).toMatchObject({ antes: { rol: "lider_proceso" }, despues: { rol: "gerencia" } });
});
it("autoprotección: el actor no se desactiva ni se degrada", async () => {
  await expect(cambiarActivo(actorId, false, actorId)).rejects.toThrow(/propia cuenta/);
  await expect(editarUsuario(actorId, { ...base, rol: "consulta" }, actorId)).rejects.toThrow(/administrador/);
});
it("desactivar cierra sesiones; restablecer da clave nueva, limpia bloqueo y cierra sesiones", async () => {
  const { token } = await crearSesion(u1, { ip: null, userAgent: null });
  await cambiarActivo(u1, false, actorId);
  expect(await validarSesion(token)).toBeNull();
  await cambiarActivo(u1, true, actorId);
  await sql()`UPDATE usuarios SET bloqueado_hasta = now() + interval '1 hour', bloqueos_consecutivos = 2 WHERE id = ${u1}`;
  const { claveTemporal } = await restablecerClave(u1, actorId);
  const [u] = await sql()`SELECT hash_clave, bloqueado_hasta, bloqueos_consecutivos, debe_cambiar_clave FROM usuarios WHERE id = ${u1}`;
  expect(await verificarClave(u.hash_clave, claveTemporal)).toBe(true);
  expect(u).toMatchObject({ bloqueado_hasta: null, bloqueos_consecutivos: 0, debe_cambiar_clave: true });
  const [acc] = await sql()`SELECT resultado FROM accesos WHERE usuario_id = ${u1} ORDER BY id DESC LIMIT 1`;
  expect(acc.resultado).toBe("restablecimiento");
});
it("listar filtra por texto y rol; contarAdminsActivos cuenta", async () => {
  expect((await listarUsuarios({ texto: "zz_u1" })).map((f) => f.usuario)).toEqual(["zz_u1"]);
  expect((await listarUsuarios({ rol: "gerencia" })).some((f) => f.usuario === "zz_u1")).toBe(true);
  expect(await contarAdminsActivos()).toBeGreaterThanOrEqual(1);
});
```

- [ ] **Paso 2: Correr y ver fallar.** Run: `npx vitest run tests/usuarios.test.ts` → FAIL.

- [ ] **Paso 3: Implementar** consultas, acciones, páginas y componentes; ampliar
`describirEvento` ("Creó el usuario «x»", "Editó el usuario «x»", "Desactivó el usuario
«x»", "Reactivó el usuario «x»", "Restableció la clave de «x»", "Desbloqueó al usuario
«x»"; `detalle.usuario` lleva el nombre de usuario).

- [ ] **Paso 4: Correr y ver pasar.** Run: `npx vitest run && npm run lint` → PASS.

- [ ] **Paso 5: Verificación manual.** Crear un usuario por rol desde la interfaz,
copiar la clave temporal, entrar con él en una ventana privada: cambio de clave →
aviso → portal con el menú de su rol.

- [ ] **Paso 6: Commit**

```bash
git add src/db/consultas/usuarios.ts src/app/admin/acciones-usuarios.ts "src/app/admin/(panel)/usuarios" src/componentes/admin src/lib/bitacora-detalle.ts tests/usuarios.test.ts tests/bitacora-detalle.test.ts
git commit -m "feat(f11): administración de usuarios con clave temporal, bloqueo, procesos y autoprotección" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 13: Alta de usuarios por lote

**Files:**
- Create: `src/lib/lote-usuarios.ts`, `src/app/admin/(panel)/usuarios/lote/page.tsx`, `src/app/admin/(panel)/usuarios/lote/plantilla/route.ts`, `src/componentes/admin/usuarios/FormularioLote.tsx`
- Modify: `src/db/consultas/usuarios.ts` (+ `crearUsuariosEnLote`), `src/app/admin/acciones-usuarios.ts` (+ `crearLoteAccion`), `src/lib/bitacora-detalle.ts` (+ `crear_usuarios_lote`)
- Test: `tests/lote-usuarios.test.ts`, `tests/usuarios.test.ts` (+1 caso de lote)

**Interfaces:**
- Produces (`src/lib/lote-usuarios.ts`, puro):
  ```ts
  export const COLUMNAS_LOTE = ["usuario", "nombre", "correo", "rol", "cargo", "procesos"] as const;
  export const MAXIMO_FILAS_LOTE = 500;
  export type Catalogo = { cargos: Map<string, number>; procesos: Map<string, number> }; // claves normalizadas: cargo en minúsculas sin acentos ni espacios dobles; sigla en mayúsculas
  export type FilaLoteValida = { linea: number; datos: DatosUsuario };
  export type FilaLoteInvalida = { linea: number; usuario: string; error: string };
  export function normalizar(texto: string): string;
  export function plantillaCsv(): string; // "﻿" + "usuario;nombre;correo;rol;cargo;procesos\r\n" + una fila de ejemplo
  export function parsearLoteCsv(texto: string, catalogo: Catalogo): { validas: FilaLoteValida[]; invalidas: FilaLoteInvalida[] };
  // quita BOM; separador ";" o "," según la cabecera; campos entre comillas; cabecera obligatoria con las seis columnas; rol por código o etiqueta (ETIQUETA_ROL, sin acentos ni mayúsculas); procesos separados por "|"; usuario repetido dentro del archivo → inválida (la segunda); más de 500 filas de datos → lanza Error("El archivo supera las 500 filas")
  export function resultadosCsv(resultado: ResultadoLote): string; // BOM + "linea;usuario;nombre;estado;clave_temporal_o_error"
  ```
- Produces (`usuarios.ts`):
  ```ts
  export type ResultadoLote = { creados: Array<{ linea: number; usuario: string; nombre: string; claveTemporal: string }>; fallidos: FilaLoteInvalida[] };
  export async function crearUsuariosEnLote(filas: FilaLoteValida[], actorId: number): Promise<ResultadoLote>; // crearUsuario por fila con su propia transacción; el error de una fila no detiene las demás; auditoría crear_usuarios_lote { creados, fallidos }
  ```
- Produces (acción): `crearLoteAccion(_prev: EstadoLote, formData): Promise<EstadoLote>` con
  `type EstadoLote = EstadoAccion | { ok: true; resultado: ResultadoLote }`; lee
  `formData.get("archivo")` como `File`, exige `.text()` menor de 1 MB, construye el
  `Catalogo` con `listarCargos()` y `procesos` activos, llama `parsearLoteCsv` y
  `crearUsuariosEnLote`; `requerirSesion()` + `requerirPermiso(sesion, "usuarios.administrar")`.
- Ruta `GET /admin/usuarios/lote/plantilla`: `sesionDePeticion` + permiso; responde
  `text/csv; charset=utf-8` con `Content-Disposition: attachment; filename="plantilla-usuarios.csv"`.
- Página: instrucciones (codificación UTF-8, "CSV UTF-8" en Excel, roles válidos,
  cargos y siglas disponibles listados), campo de archivo, y `FormularioLote` (cliente)
  que muestra la tabla de resultados con las claves temporales y un botón "Descargar
  resultados (CSV)" que arma un `Blob` desde el estado.

- [ ] **Paso 1: Tests puros** (`tests/lote-usuarios.test.ts`):

```ts
const catalogo = { cargos: new Map([["enfermera jefe", 7]]), procesos: new Map([["GTH", 3], ["CEX", 4]]) };
it("parsea la plantilla con BOM y ; y acepta rol por etiqueta y procesos por sigla", () => {
  const csv = "﻿usuario;nombre;correo;rol;cargo;procesos\r\nana.perez;Ana Pérez;ana@h.gov.co;Líder de proceso;Enfermera Jefe;GTH|CEX\r\n";
  const r = parsearLoteCsv(csv, catalogo);
  expect(r.invalidas).toEqual([]);
  expect(r.validas[0]).toEqual({ linea: 2, datos: { usuario: "ana.perez", nombre: "Ana Pérez", correo: "ana@h.gov.co", rol: "lider_proceso", cargoId: 7, jefeInmediatoId: null, procesoIds: [3, 4], verHistorial: false } });
});
it("acepta coma como separador si la cabecera la usa, y campos entre comillas", () => {
  const csv = 'usuario,nombre,correo,rol,cargo,procesos\n"luis.g","Luis Gómez, Jr.",,consulta,,\n';
  expect(parsearLoteCsv(csv, catalogo).validas[0].datos).toMatchObject({ usuario: "luis.g", nombre: "Luis Gómez, Jr.", correo: null, rol: "consulta", cargoId: null, procesoIds: [] });
});
it("rechaza con número de línea: usuario inválido, rol desconocido, cargo inexistente, sigla inexistente, líder sin procesos y duplicado en el archivo", () => {
  const csv = ["usuario;nombre;correo;rol;cargo;procesos",
    "Ana Perez;Ana;;consulta;;", "b.b;B;;jefe;;", "c.c;C;;consulta;Portero;", "d.d;D;;consulta;;XYZ",
    "e.e;E;;lider_proceso;;", "f.f;F;;consulta;;", "f.f;F otra;;consulta;;"].join("\n");
  const r = parsearLoteCsv(csv, catalogo);
  expect(r.validas.map((v) => v.datos.usuario)).toEqual(["f.f"]);
  expect(r.invalidas.map((i) => i.linea)).toEqual([2, 3, 4, 5, 6, 8]);
  expect(r.invalidas[5].error).toMatch(/repetido/);
});
it("rechaza cabecera incompleta y más de 500 filas", () => {
  expect(() => parsearLoteCsv("usuario;nombre\n", catalogo)).toThrow(/cabecera/i);
  const muchas = "usuario;nombre;correo;rol;cargo;procesos\n" + Array.from({ length: 501 }, (_, i) => `u${i};N;;consulta;;`).join("\n");
  expect(() => parsearLoteCsv(muchas, catalogo)).toThrow(/500/);
});
it("la plantilla y el CSV de resultados llevan BOM y cabecera", () => {
  expect(plantillaCsv().startsWith("﻿usuario;nombre;correo;rol;cargo;procesos")).toBe(true);
  expect(resultadosCsv({ creados: [{ linea: 2, usuario: "a", nombre: "A", claveTemporal: "X" }], fallidos: [{ linea: 3, usuario: "b", error: "mal" }] })).toContain("3;b;;error;mal");
});
```

Y en `tests/usuarios.test.ts`: `crearUsuariosEnLote` con dos filas válidas y una repetida
contra la BD → `creados` 2, `fallidos` 1 con error de nombre repetido, y una fila de
auditoría `crear_usuarios_lote`.

- [ ] **Paso 2: Correr y ver fallar.** Run: `npx vitest run tests/lote-usuarios.test.ts tests/usuarios.test.ts` → FAIL.

- [ ] **Paso 3: Implementar** (parser propio sin dependencias: dividir líneas por
`\r?\n`, campos respetando comillas dobles con `""` como escape).

- [ ] **Paso 4: Correr y ver pasar.** Run: `npx vitest run && npm run lint` → PASS.

- [ ] **Paso 5: Verificación manual.** Descargar la plantilla, abrirla en Excel, agregar
veinte filas con dos erradas, guardar como "CSV UTF-8", subirla: tabla con 18 claves
temporales y 2 rechazos con línea y motivo; descargar el CSV de resultados.

- [ ] **Paso 6: Commit**

```bash
git add src/lib/lote-usuarios.ts src/db/consultas/usuarios.ts src/app/admin/acciones-usuarios.ts "src/app/admin/(panel)/usuarios/lote" src/componentes/admin/usuarios src/lib/bitacora-detalle.ts tests/lote-usuarios.test.ts tests/usuarios.test.ts
git commit -m "feat(f11): alta de usuarios por lote desde plantilla CSV" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 14: Registro de accesos y sesiones activas

**Files:**
- Create: `src/db/consultas/accesos.ts`, `src/app/admin/(panel)/accesos/page.tsx`, `src/app/admin/(panel)/sesiones/page.tsx`
- Modify: `src/app/admin/acciones-usuarios.ts` (+ `cerrarSesionAccion`), `src/componentes/admin/enlaces-panel.ts` (+ Accesos → `accesos.ver`, Sesiones → `sesiones.administrar`), `src/lib/bitacora-detalle.ts` (+ `cerrar_sesion_forzado`), `src/app/admin/(panel)/usuarios/[id]/page.tsx` (muestra `sesionesActivas` y enlace a Sesiones)
- Test: `tests/accesos.test.ts`, `tests/bitacora-detalle.test.ts` (+1)

**Interfaces:**
- Produces (`src/db/consultas/accesos.ts`):
  ```ts
  export type FiltrosAccesos = { usuario?: string; resultado?: ResultadoAcceso; desde?: string; hasta?: string; pagina?: number };
  export type FilaAcceso = { id: number; usuarioTexto: string; nombre: string | null; resultado: ResultadoAcceso; ip: string | null; userAgent: string | null; creadoEn: string };
  export type RespuestaAccesos = { filas: FilaAcceso[]; total: number; pagina: number; totalPaginas: number };
  export async function obtenerAccesos(filtros: FiltrosAccesos): Promise<RespuestaAccesos>; // 50 por página, más reciente primero, fechas con el mismo patrón que bitacora.ts
  ```
- Produces (acción): `cerrarSesionAccion(formData: FormData): Promise<void>`:
  `requerirSesion()` + `requerirPermiso(sesion, "sesiones.administrar")`; `sesionId` del
  formulario (64 hex); `cerrarSesionPorId`; `registrarAcceso({ usuarioId: cerrado.usuarioId,
  usuarioTexto, resultado: "cierre_forzado", ip del actor, userAgent del actor })`;
  auditoría `cerrar_sesion_forzado` { usuario }; `revalidatePath("/admin/sesiones")`.
- Páginas: Accesos con filtros server-driven (texto de usuario, `<select>` de resultado,
  fechas) y tabla `role="region"` enfocable como la bitácora; Sesiones con tabla de
  `listarSesionesActivas()` y botón "Cerrar" por fila (la propia sesión se marca "esta
  sesión" y no tiene botón).

- [ ] **Paso 1: Tests** (`tests/accesos.test.ts`; inserta accesos con `usuario_texto`
único por corrida):

```ts
const MARCA = `zz_acc_${Date.now()}`;
it("filtra por resultado y usuario, pagina de a 50 y ordena más reciente primero", async () => {
  for (let i = 0; i < 3; i++) await registrarAcceso({ usuarioId: null, usuarioTexto: MARCA, resultado: "fallo", ip: "10.9.9.9", userAgent: "t" });
  await registrarAcceso({ usuarioId: null, usuarioTexto: MARCA, resultado: "bloqueo", ip: null, userAgent: null });
  const r = await obtenerAccesos({ usuario: MARCA });
  expect(r.total).toBe(4);
  expect(r.filas[0].resultado).toBe("bloqueo");
  expect((await obtenerAccesos({ usuario: MARCA, resultado: "fallo" })).total).toBe(3);
  expect((await obtenerAccesos({ usuario: MARCA, pagina: 2 })).filas).toHaveLength(0);
});
```

- [ ] **Paso 2: Correr y ver fallar.** Run: `npx vitest run tests/accesos.test.ts` → FAIL.

- [ ] **Paso 3: Implementar** consultas, páginas, acción y describirEvento ("Cerró la
sesión de «x»").

- [ ] **Paso 4: Correr y ver pasar.** Run: `npx vitest run && npm run lint` → PASS.

- [ ] **Paso 5: Verificación manual.** Dos navegadores: cerrar desde el admin la sesión
del otro usuario; su siguiente clic va a `/ingreso`; en Accesos aparece `cierre_forzado`.

- [ ] **Paso 6: Commit**

```bash
git add src/db/consultas/accesos.ts "src/app/admin/(panel)/accesos" "src/app/admin/(panel)/sesiones" "src/app/admin/(panel)/usuarios" src/app/admin/acciones-usuarios.ts src/componentes/admin/enlaces-panel.ts src/lib/bitacora-detalle.ts tests/accesos.test.ts tests/bitacora-detalle.test.ts
git commit -m "feat(f11): registro de accesos y sesiones activas con cierre forzado" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 15: Alcance por procesos y "Mis procesos"

**Files:**
- Create: `src/lib/alcance.ts`, `src/componentes/MisProcesos.tsx`
- Modify: `src/app/(portal)/page.tsx` (bloque "Mis procesos" para `lider_proceso`)
- Test: `tests/alcance.test.ts`

**Interfaces:**
- Produces (`src/lib/alcance.ts`):
  ```ts
  export type Alcance = { todos: true } | { todos: false; procesoIds: number[] };
  export async function alcanceProcesos(sesion: Pick<SesionValida, "usuarioId" | "rol">): Promise<Alcance>; // lider_proceso → sus usuario_procesos (puede ser []); los demás → { todos: true }
  export function enAlcance(alcance: Alcance, procesoId: number): boolean;
  export async function procesosAsignados(usuarioId: number): Promise<Array<{ id: number; nombre: string; sigla: string; slug: string }>>; // activos, por nombre
  ```
  Este módulo es el que todo módulo nuevo (F13 a F15) debe usar para filtrar; se deja
  documentado en su cabecera.
- `MisProcesos` (server component): recibe `procesos` y los muestra como tarjetas con
  enlace a `/procesos/<slug>`; si el líder no tiene procesos asignados muestra "Aún no
  tiene procesos asignados; pídalo al administrador del SGC". El inicio lo renderiza
  encima del mapa solo cuando `sesion.rol === "lider_proceso"`.

- [ ] **Paso 1: Test** (`tests/alcance.test.ts`; BD; `zz_lider` con GTH asignado,
`zz_lider_vacio` sin procesos, `zz_ci` control interno):

```ts
it("el líder solo alcanza sus procesos; sin asignación, ninguno", async () => {
  expect(await alcanceProcesos({ usuarioId: liderId, rol: "lider_proceso" })).toEqual({ todos: false, procesoIds: [gthId] });
  expect(await alcanceProcesos({ usuarioId: liderVacioId, rol: "lider_proceso" })).toEqual({ todos: false, procesoIds: [] });
});
it("los demás roles alcanzan todo", async () => {
  expect(await alcanceProcesos({ usuarioId: ciId, rol: "control_interno" })).toEqual({ todos: true });
});
it("enAlcance y procesosAsignados", async () => {
  expect(enAlcance({ todos: false, procesoIds: [gthId] }, gthId)).toBe(true);
  expect(enAlcance({ todos: false, procesoIds: [gthId] }, gthId + 1)).toBe(false);
  expect(enAlcance({ todos: true }, 999)).toBe(true);
  expect((await procesosAsignados(liderId)).map((p) => p.sigla)).toEqual(["GTH"]);
});
```

- [ ] **Paso 2: Correr y ver fallar.** Run: `npx vitest run tests/alcance.test.ts` → FAIL.
- [ ] **Paso 3: Implementar** módulo, componente y bloque en el inicio.
- [ ] **Paso 4: Correr y ver pasar.** Run: `npx vitest run tests/alcance.test.ts && npm run lint` → PASS.
- [ ] **Paso 5: Commit**

```bash
git add src/lib/alcance.ts src/componentes/MisProcesos.tsx "src/app/(portal)/page.tsx" tests/alcance.test.ts
git commit -m "feat(f11): alcance por procesos y bloque Mis procesos para líderes" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 16: Semillas mínima y demo

**Files:**
- Create: `src/db/semillas/minima.ts`, `src/db/semillas/demo.ts`
- Modify: `src/db/semilla.ts` (CLI: sin argumentos → demo; `--minima` → mínima), `package.json` (`db:seed` → `tsx src/db/semilla.ts`, `db:seed:minima` → `tsx src/db/semilla.ts --minima`), `tests/esquema.test.ts` (bloque "estados del seed" + estructura y usuarios demo), `README.md` (sección Desarrollo local)
- Test: `tests/esquema.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/db/semillas/minima.ts
  export async function limpiarTodo(db): Promise<void>;                 // TRUNCATE de todas las tablas (incluye las nuevas) RESTART IDENTITY CASCADE; borra el almacén físico
  export async function sembrarBase(db): Promise<{ tipoPorSigla: Record<string, number> }>; // nueve tipos de documento genéricos + configuracion mínima: nombre_entidad "Entidad sin configurar", subtitulo_mapa "Enfoque basado en procesos — NTC ISO 9001:2015", lema "", titulo_phva "Mejora Continua", texto_phva "", patron_codigo por defecto, aviso_datos_personales (texto de ejemplo de dos párrafos que la entidad debe reemplazar)
  export async function sembrarMinima(db): Promise<void>;               // limpiarTodo + sembrarBase
  // src/db/semillas/demo.ts
  export const CLAVE_DEMO = "Demo-SGC-2026-clave";
  export async function sembrarDemo(db): Promise<void>; // limpiarTodo + sembrarBase (sobrescribe nombre_entidad y lema con los de Suaza) + mapa + documentos (contenido actual de semilla.ts) + estructura + usuarios demo
  ```
- Estructura demo: áreas Gerencia, Subgerencia Científica, Subgerencia Administrativa,
  Oficina de Calidad, Control Interno; cargos Gerente (Gerencia, sin superior),
  Subgerente Científico y Subgerente Administrativo (superior Gerente), Líder de Calidad
  (Oficina de Calidad, superior Gerente), Jefe de Control Interno (Control Interno,
  superior Gerente), Médico Coordinador (Subg. Científica, superior Subgerente
  Científico), Enfermera Jefe (superior Médico Coordinador), Auxiliar de Enfermería
  (superior Enfermera Jefe), Coordinadora de Talento Humano (Subg. Administrativa,
  superior Subgerente Administrativo).
- Usuarios demo (todos con `CLAVE_DEMO`, `debe_cambiar_clave = false`, `acepto_datos_en =
  now()`): `gerente` (gerencia, Gerente), `control.interno` (control_interno, Jefe de
  Control Interno), `lider.gth` (lider_proceso, Coordinadora de Talento Humano, GTH),
  `lider.cex` (lider_proceso, Médico Coordinador, CEX), `consulta` (consulta, Auxiliar de
  Enfermería). El `admin` no lo crea la semilla (`npm run admin:asegurar`).

- [ ] **Paso 1: Ampliar `tests/esquema.test.ts`** (bloque "estados del seed"):

```ts
it("la demo trae cinco áreas, nueve cargos y cinco usuarios de ejemplo con sus roles", async () => {
  expect((await sql`SELECT count(*)::int AS n FROM areas`)[0].n).toBe(5);
  expect((await sql`SELECT count(*)::int AS n FROM cargos`)[0].n).toBe(9);
  const usuarios = await sql`SELECT usuario, rol FROM usuarios WHERE usuario IN ('gerente','control.interno','lider.gth','lider.cex','consulta') ORDER BY usuario`;
  expect(usuarios).toEqual([
    { usuario: "consulta", rol: "consulta" }, { usuario: "control.interno", rol: "control_interno" },
    { usuario: "gerente", rol: "gerencia" }, { usuario: "lider.cex", rol: "lider_proceso" }, { usuario: "lider.gth", rol: "lider_proceso" },
  ]);
  const [gth] = await sql`SELECT p.sigla FROM usuario_procesos up JOIN procesos p ON p.id = up.proceso_id JOIN usuarios u ON u.id = up.usuario_id WHERE u.usuario = 'lider.gth'`;
  expect(gth.sigla).toBe("GTH");
});
```

- [ ] **Paso 2: Correr y ver fallar.** Run: `npx vitest run tests/esquema.test.ts -t "demo trae"` → FAIL.

- [ ] **Paso 3: Implementar** las semillas (mover el contenido actual de `semilla.ts` a
`demo.ts` sin cambiar los datos del mapa ni de los documentos), el CLI y los scripts.

- [ ] **Paso 4: Sembrar y verificar las dos semillas**

Run: `npm run db:seed:minima && psql "$DATABASE_URL_MIGRADOR" -c "SELECT clave FROM configuracion ORDER BY clave" -c "SELECT count(*) FROM documentos"`
Expected: siete claves de configuración (incluida `aviso_datos_personales`), cero
documentos. Luego: `npm run db:seed && npm run admin:asegurar && npx vitest run`
Expected: todos los tests en verde (los conteos heredados y los nuevos).

- [ ] **Paso 5: Commit**

```bash
git add src/db/semillas src/db/semilla.ts package.json tests/esquema.test.ts README.md
git commit -m "feat(f11): semilla mínima para instalaciones nuevas y semilla demo con estructura y usuarios por rol" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 17: Cierre de la fase: AGENTS.md, manual, CONTEXT.md y verificación completa

**Files:**
- Modify: `AGENTS.md`, `Dockerfile:1-2` (comentario), `README.md` (Despliegue), `CONTEXT.md`, `PLAN.md` (marca ✅ en la fila 11), `.env.example` (revisión final de comentarios)
- Create: `docs/manual/usuario/01-ingreso-clave-y-segundo-factor.md`, `docs/manual/usuario/02-usuarios-cargos-y-procesos.md`
- Test: suite completa, build sin `.env.local`, compose de desarrollo

**Interfaces:** ninguna nueva. Reescritura de `AGENTS.md` (aprobada en el spec, Fase 11):

- Quitar el aviso de "sección superada" y reemplazar "Restricciones INVIOLABLES
  (hardware real de despliegue)" por **"Piso de despliegue (desde la Fase 11)"** con los
  puntos de spec §4.1: servidor por entidad; compose con proxy (Caddy), app y bd; imagen
  `linux/amd64` siempre y `arm64` bajo demanda; volúmenes nombrados, PostgreSQL nunca en
  NTFS/SMB; puerto de PostgreSQL nunca al host; cero dependencias externas en runtime;
  TLS siempre; zona horaria por instalación; una sola instancia de app con IP del proxy
  solo con `CONFIAR_PROXY=1`; dos conexiones de BD (migrador y `sgc_app`).
- Reglas de negocio 3 y 4 → "3. **Visibilidad por rol** (spec §5.3): vigentes para todo
  usuario con sesión; en trámite para participantes, Admin SGC y líder; obsoletos y
  anulados para Admin SGC, Control Interno y la marca individual `ver_historial`. Ninguna
  versión no vigente se sirve sin ese permiso." y "4. **Toda ruta exige sesión; toda
  escritura exige el permiso de la matriz `src/lib/permisos.ts`** y pasa por
  `mutacion()` o `requerirPermiso()`; los handlers que escriben verifican `Origin`."
  Regla 5: "toda acción de cualquier usuario queda en bitácora, inmutable en BD".
- Stack: fila Auth → "Sesión propia (cookie httpOnly + `sesiones` + Argon2id) con cinco
  roles fijos en código, bloqueo por cuenta y TOTP opcional (`otpauth`); sin OAuth";
  fila BD → "PostgreSQL 16 (`postgres:16-alpine`), roles `sgc_migrador` dueño y `sgc_app`
  de mínimo privilegio"; fila CI → "lint + build en cada push; imagen `amd64` (Fase 20)
  y `arm64` a mano"; fila Rate limiting → añade "por usuario; por IP solo con proxy de
  confianza"; nueva fila Validación → "`zod` en la frontera de cada acción".
- Comandos: `npm run db:preparar` (roles + migraciones), `npm run db:roles`, `npm run
  db:seed` (demo), `npm run db:seed:minima`; build de imagen local sin `--platform`
  obligatorio (`docker build -t sgc-integral:local .`), con nota de que `arm64` sigue
  disponible con buildx.
- Convenciones: añadir "Toda página autenticada lleva `force-dynamic`" y "Toda consulta
  de los módulos nuevos pasa por `alcanceProcesos()`".
- El resto (idioma, TS estricto, estructura, migraciones, accesibilidad, commits,
  metodología) sin cambios.

- [ ] **Paso 1: Reescribir `AGENTS.md`** según lo anterior y actualizar el comentario de
cabecera de `Dockerfile` ("Imagen multi-arquitectura; en desarrollo `docker build`, en CI
`linux/amd64` y `arm64` bajo demanda") y la sección "Despliegue" de `README.md`
(apuntar al spec §4 y a la Fase 20; quitar la frase del QNAP como destino).

- [ ] **Paso 2: Escribir los dos capítulos del manual de usuario**

`01-ingreso-clave-y-segundo-factor.md`: ingresar, qué pasa al bloquearse, primer ingreso
(clave inicial, aviso de datos), cambiar la clave, activar el segundo factor con una app,
códigos de recuperación, cerrar sesión, qué hacer si olvidó la clave (pedir
restablecimiento al administrador). `02-usuarios-cargos-y-procesos.md` (para Admin SGC):
crear áreas y cargos, crear un usuario y entregar la clave temporal, alta por lote,
asignar procesos a un líder, desactivar, restablecer, desbloquear, quitar el segundo
factor, leer Accesos y Sesiones, la advertencia de dos administradores. Capturas no;
texto con rutas de menú y mensajes exactos de la interfaz.

- [ ] **Paso 3: Actualizar `CONTEXT.md`**

Encabezado con fecha; punto de reanudación: Fase 11 hecha, lo que sigue es la spec y el
plan de la **Fase 12 — Nueva estructura visual**; tabla del entorno de desarrollo con las
variables nuevas y el flujo `db:preparar → db:seed → admin:asegurar → primer ingreso
con cambio de clave`; usuarios demo y su clave; sección "Hecho (Fase 11)" con el
resumen por archivo como en las fases anteriores; tabla "Decisiones adicionales (Fase
11)" con, al menos: F11-D1 roles de BD y modo heredado; F11-D2 trigger de inmutabilidad
sin puerta trasera y tests sin limpieza de auditoría; F11-D3 `sesionDePeticion` para
handlers; F11-D4 mensaje de bloqueo solo con clave correcta; F11-D5 límites por usuario y
por IP solo con proxy; F11-D6 QR en PNG `data:`; F11-D7 `tokens_un_uso` a F16; F11-D8 Next
16.4.x; F11-D9 grupos `(portal)` y `(cuenta)`; F11-D10 `APP_SECRETO` obligatorio en
producción. Deuda técnica: `scripts/carga.ts` sin sesión; tests de BD aún fuera de CI.
`PLAN.md`: fila 11 con ✅ y fecha.

- [ ] **Paso 4: Verificación completa**

Run: `npm run lint && npx vitest run 2>&1 | tail -8`
Expected: lint limpio; todos los tests en verde; el total es mayor que 205.

Run: `mv .env.local .env.local.bak && npm run build 2>&1 | tail -15; mv .env.local.bak .env.local`
Expected: build sin errores sin `DATABASE_URL`.

Run: `docker compose -f docker-compose.dev.yml up -d --build && sleep 25 && docker compose -f docker-compose.dev.yml logs app | tail -15 && curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:9081/ && curl -s http://localhost:9081/api/salud`
Expected: arranque con rol, migraciones y admin; `/` responde 307 hacia `/ingreso`;
`/api/salud` 200. Luego `docker compose -f docker-compose.dev.yml stop app`.

Run (con `psql` o un cliente, como `sgc_app`): `DELETE FROM auditoria WHERE id = 1`
Expected: `permission denied` (42501).

- [ ] **Paso 5: Recorrido de demostración** (spec §8 Fase 11; anotar resultados en el commit)

1. `npm run db:preparar && npm run db:seed && npm run admin:asegurar && npm run dev`.
2. Entrar como `admin` / `cambiar-esta-clave` → cambio de clave obligatorio → aviso de
   datos → portal. (El cambio obligatorio aparece porque el paso 1 reseembró la base y
   `admin:asegurar` recreó la cuenta; sobre una base no reseembrada el admin existente
   conserva `debe_cambiar_clave = false` y solo ve el aviso de datos.)
3. Administración → Estructura: crear un área y un cargo nuevos; Usuarios: crear un
   usuario por rol; Alta por lote: subir la plantilla con 20 filas y 2 inválidas.
4. Entrar (ventanas privadas) con `gerente`, `control.interno`, `lider.gth`, `consulta`
   (clave `Demo-SGC-2026-clave`): gerencia ve Maestro y Estadísticas; control interno ve
   Bitácora, Accesos y el detalle de documentos sin botones; el líder ve "Mis procesos"
   con GTH y `/admin` lo manda a `/sin-acceso`; consulta solo el portal.
5. Con `consulta`, cinco claves erradas → bloqueo; con la clave correcta aparece la hora;
   el admin desbloquea desde Usuarios.
6. En Mi cuenta activar el segundo factor con una app, salir, entrar con código; usar un
   código de recuperación; el admin quita el segundo factor del usuario.
7. Sesiones: cerrar la sesión de otro usuario; su siguiente clic va a `/ingreso`.
8. Accesos: filtrar por `bloqueo` y por usuario.
9. Verificar en la bitácora las acciones de usuarios con texto legible.

- [ ] **Paso 6: Commit de cierre**

```bash
git add AGENTS.md Dockerfile README.md CONTEXT.md PLAN.md .env.example docs/manual
git commit -m "docs: cierre de la Fase 11 - fundación de acceso (AGENTS.md para el nuevo piso, manual de usuario, CONTEXT.md)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Decir al usuario explícitamente **qué probar y cómo**: la lista del Paso 5, con las
credenciales demo y la ruta de cada pantalla.
