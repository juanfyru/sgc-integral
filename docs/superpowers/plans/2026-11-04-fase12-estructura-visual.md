# Fase 12 — Nueva estructura visual: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a SGC Integral su cascarón definitivo (barra lateral por módulos y rol, barra
superior con búsqueda `Ctrl K`, campana y menú de usuario con tema), un sistema de color de
tres capas con tema oscuro, la pantalla de marca de la entidad con validación AA, los
componentes base, y migrar las 46 páginas existentes a ese cascarón sin perder ninguna
función.

**Architecture:** Toda la app autenticada cuelga de un solo grupo de rutas `(app)` cuyo
layout monta el cascarón una vez (persistente al navegar). La marca vive en `configuracion`
y se inyecta como variables CSS en `<html>` tras derivar sus tokens en el servidor (OKLCH en
JS puro); el tema se resuelve en el servidor con el atributo `data-tema` y CSS `light-dark()`,
sin scripts. Los componentes base son HTML nativo + Tailwind con los tokens. La pantalla de
marca valida el contraste con `src/lib/contraste.ts`; el logo se sube por route handler, se
valida por magic bytes y dimensiones y se sirve desde el almacén por una ruta pública.

**Tech Stack:** Next.js 16.4 (App Router, `proxy.ts`, Server Actions, route handlers),
TypeScript estricto, Drizzle ORM + `postgres`, PostgreSQL 16, `zod` 4, `file-type`,
`lucide-react`, Tailwind 4 (`@theme inline`, `@custom-variant`), Vitest,
`react-dom/server` para tests de render.

**Spec:** `docs/superpowers/specs/2026-11-04-fase12-estructura-visual-design.md` ("el spec"),
que detalla al spec maestro `docs/superpowers/specs/2026-11-03-sgc-integral-plataforma-design.md`
(§4.1, §5.10, §5.11, §8 Fase 12). Las decisiones del spec se citan como F12-DCn.

## Global Constraints

- Node 24 en desarrollo, CI e imagen; mismo major (`AGENTS.md`).
- TypeScript estricto, sin `any` salvo justificación puntual; dominio, UI y código en
  español.
- Server Components por defecto; `'use client'` solo donde hay interactividad.
- Toda página autenticada lleva o hereda `export const dynamic = "force-dynamic"`; el
  build de CI corre sin `DATABASE_URL` y debe pasar.
- Cero dependencias externas en runtime: sin CDN, fuentes remotas ni telemetría. **Sin
  librerías nuevas con binarios nativos; sin `sharp`** (el logo no se recodifica).
- **Sin scripts inline nuevos**; la CSP actual no se relaja. El tema se resuelve con el
  atributo `data-tema` del servidor y CSS.
- **Las URL existentes se conservan** (spec maestro DC25); cambian los grupos de rutas, no
  las direcciones.
- **Migraciones solo aditivas**: la 0003 añade columna, tabla e índice; nada se renombra ni
  se borra.
- Cada página que lee la sesión llama ella misma `exigirSesion()`, `exigirPermiso(permiso)`
  o `exigirSesionConPendientes()`; los tests estructurales (`tests/paginas-sesion.test.ts`,
  `tests/acciones-permisos.test.ts`, `tests/acciones-cuenta-cache.test.ts`,
  `tests/handlers-permisos.test.ts`) se actualizan en el mismo commit que mueve o añade
  archivos.
- Toda Server Action nueva pasa por `mutacion(formData, permiso, fn)` o por
  `requerirSesion()` (+ `requerirPermiso`), con esquema `zod` `.strict()` leído con
  `parsearFormulario`; los handlers que escriben usan `sesionDePeticion`, `puede` y
  `origenValido`.
- Toda acción de `src/app/acciones-cuenta.ts` que cambia estado y redirige llama
  `revalidatePath("/", "layout")` antes del `redirect`.
- Nunca `dangerouslySetInnerHTML`; los resultados de búsqueda se pintan como texto
  (marcas `⟦⟧` → `<mark>` con `TextoResaltado`).
- Accesibilidad AA: teclado, foco visible, `aria-current`, etiqueta textual junto a todo
  color de estado, `prefers-reduced-motion`, 390 px, impresión.
- Tests contra la BD de desarrollo: todo usuario de prueba con filas en `auditoria` o
  `accesos` usa nombre único por corrida (`zz_<algo>_${Date.now()}`) y no se borra; nunca
  `DELETE` ni `UPDATE` sobre esas tablas.
- `src/db/esquema.ts` nunca importa con `@/`; `src/proxy.ts` importa solo
  `sesion-constantes`.
- Commits convencionales en español con el trailer
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Review Focus

1. **Colores fijos heredados en tema oscuro.** `bg-white`, `text-gray-*`, `bg-red-50`,
   `bg-amber-50` quedan ilegibles sobre superficies oscuras. Test en la Tarea 15: ningún
   `.tsx` de `src/` usa `bg-white` ni las paletas `gray`, `red`, `amber` o `green` de
   Tailwind (`text-white` sobre rellenos de marca sí es legítimo y se conserva).
2. **Enlace de notificación no interno.** Una fila con `enlace` `https://…` o
   `javascript:` nunca debe redirigir fuera. Test en la Tarea 10: `marcarNotificacionLeidaAccion`
   redirige a `/` cuando el enlace no pasa `rutaInterna`.
3. **Volver a subir el mismo logo.** El archivo nuevo tiene la misma versión (hash) que el
   anterior; "borrar el anterior" no debe borrar el actual. Test en la Tarea 11.
4. **`q` demasiado largo o con marcas de resaltado** en `/api/buscar` (500 caracteres, o
   texto con `⟦`). Se recorta a 120 y se quitan las marcas antes de buscar. Test en la
   Tarea 9.
5. **Hex en mayúsculas o de tres dígitos** en la pantalla de marca (`#FFF`, `#1B4E8E`). Se
   rechaza el de tres dígitos y se normaliza el de seis a minúsculas. Test en la Tarea 12.

---

## Mapa de archivos

Nuevos:

```
drizzle/0003_fase12-visual.sql                       columna tema, tabla notificaciones, índice único lower(usuario)
scripts/migrar.ts                                    db:migrate = comprobación de duplicados + migrate()
scripts/generar-logo-demo.mjs                        genera src/db/semillas/recursos/logo-demo.png (PNG propio)
src/db/duplicados-usuario.ts                         duplicadosSinMayusculas, mensajeDuplicados, comprobarDuplicadosUsuario(sql)
src/db/consultas/entidad.ts                          obtenerMarca (cache), obtenerEntidad, guardarEntidad, guardarLogo, quitarLogo
src/db/consultas/notificaciones.ts                   crearNotificacion, contarNoLeidas, listarRecientes, marcarLeida, marcarTodasLeidas
src/db/semillas/recursos/logo-demo.png
src/lib/color.ts                                     hex ↔ OKLCH, ajustarLuminosidad, aclararHasta, oscurecerHasta
src/lib/marca.ts                                     MARCA_DEFECTO, derivarMarca, estiloMarca, validarMarca, sugerir*
src/lib/tema.ts                                      TEMAS, COOKIE_TEMA, esTema, temaEfectivo
src/lib/logo.ts                                      LOGO_*, dimensionesImagen, validarLogo
src/lib/tareas.ts                                    Tarea, misTareas
src/lib/version.ts                                   VERSION_APP
src/lib/esquemas/entidad.ts                          EsquemaEntidad, EsquemaTema, EsquemaIdNotificacion
src/app/admin/acciones-entidad.ts                    guardarEntidadAccion
src/app/admin/api/entidad/logo/route.ts              POST / DELETE del logo
src/app/marca/logo/route.ts                          GET público del logo
src/app/api/buscar/route.ts                          GET resultados para Ctrl K
src/app/(app)/admin/(panel)/entidad/page.tsx         pantalla Entidad y marca
src/componentes/ui/{Insignia,TarjetaCifra,EstadoVacio,EncabezadoPagina,TablaDatos,Boton,Campo,Dialogo,GraficoBarras}.tsx, geometria.ts
src/componentes/cascaron/{navegacion.ts,IconoNav.tsx,ContenidoBarra.tsx,BarraLateral.tsx,BarraSuperior.tsx,MenuUsuario.tsx,Buscador.tsx,Campana.tsx,Cascaron.tsx,PantallaCentrada.tsx}
src/componentes/inicio/MisTareas.tsx
src/componentes/admin/entidad/{FormularioEntidad,VistaPreviaMarca,CargaLogo}.tsx
docs/manual/usuario/03-conocer-la-plataforma.md
docs/manual/usuario/04-configurar-la-marca-de-la-entidad.md
```

Movidos: `src/app/(portal)/**` → `src/app/(app)/**`; `src/app/admin/(panel)/**` →
`src/app/(app)/admin/(panel)/**`; `src/componentes/admin/estadisticas/{GraficoBarras.tsx,geometria.ts}`
→ `src/componentes/ui/`; `src/componentes/cuenta/MenuUsuario.tsx` → `src/componentes/cascaron/`.

Eliminados: `src/app/admin/ingreso/page.tsx`, `src/componentes/EncabezadoSitio.tsx`,
`src/componentes/admin/EstadoBadge.tsx`, `src/componentes/admin/enlaces-panel.ts`.

Se quedan donde están: `src/app/admin/acciones*.ts`, `src/app/admin/comun.ts`,
`src/app/admin/api/**`, `src/app/(cuenta)/**`, `src/app/ingreso/**`.

---

### Tarea 1: Mover el portal y el panel al grupo `(app)`

**Files:**
- Move: `src/app/(portal)/` → `src/app/(app)/`; `src/app/admin/(panel)/` → `src/app/(app)/admin/(panel)/`
- Delete: `src/app/admin/ingreso/page.tsx`
- Modify: `tests/paginas-sesion.test.ts`, `tests/a11y-estructura.test.ts`,
  `tests/handlers-permisos.test.ts` (ruta del import del Excel), `AGENTS.md:133-136`,
  cualquier otro `tests/*.ts` que nombre `src/app/(portal)` o `src/app/admin/(panel)`
- Test: `tests/paginas-sesion.test.ts`, `tests/proxy-matcher.test.ts`

**Interfaces:**
- Produces: la estructura de §5.1 del spec. Las tareas siguientes crean páginas en
  `src/app/(app)/...` y nunca en `(portal)`.

- [ ] **Step 1: Mover con git, sin cambiar contenido**

```bash
git mv "src/app/(portal)" "src/app/(app)"
mkdir -p "src/app/(app)/admin"
git mv "src/app/admin/(panel)" "src/app/(app)/admin/(panel)"
git rm "src/app/admin/ingreso/page.tsx"
```

- [ ] **Step 2: Actualizar las referencias de ruta**

Buscar y corregir: `grep -rn "(portal)\|admin/(panel)" tests src *.md --include=*.ts --include=*.tsx --include=*.md`.
En `tests/paginas-sesion.test.ts`, `paginas("src/app/(app)")` excluye las que estén bajo
`admin/(panel)` para el grupo "portal", y `paginas("src/app/(app)/admin/(panel)")` para el
grupo "panel"; la aserción de conteo mantiene `> 3` y `> 15`. En `tests/a11y-estructura.test.ts`
las ocho rutas de `loading.tsx` y las dos páginas con tabla cambian de prefijo. En
`tests/handlers-permisos.test.ts` el import pasa a `@/app/(app)/admin/(panel)/maestro/excel/route`.
En `AGENTS.md`, la convención "Estructura" dice: portal y panel en `app/(app)` (el panel en
`app/(app)/admin/(panel)`), acciones y handlers del panel en `app/admin/{acciones*.ts,comun.ts,api}`,
pasos de la cuenta en `app/(cuenta)`, ingreso en `app/ingreso`.

- [ ] **Step 3: Añadir al test del proxy que `/admin/ingreso` redirige**

En `tests/proxy-matcher.test.ts` o en el test del proxy existente que ejercite `proxy()`
(si no hay, crear `tests/proxy-redirecciones.test.ts` con `NextRequest`): una petición a
`/admin/ingreso` sin cookie recibe 307/308 con `Location` que termina en `/ingreso`.

- [ ] **Step 4: Verificar**

Run: `npm run lint && npm test`
Expected: lint limpio; 586 tests en verde (ninguno nuevo salvo el del Step 3).
Run: `npm run build`
Expected: build correcto; en la salida aparecen `/`, `/admin`, `/admin/usuarios`,
`/buscar` como rutas dinámicas y no aparece `/admin/ingreso` como página.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(f12): portal y panel bajo el grupo (app); se retira admin/ingreso (el proxy redirige)"
```

---

### Tarea 2: Migración 0003 — tema, notificaciones, índice único y comprobación de duplicados

**Files:**
- Modify: `src/db/esquema.ts` (columna `tema`, tabla `notificaciones`, índice), `src/lib/sesion.ts`
  (`SesionValida.tema`, `validarSesion`), `scripts/arrancar.ts` (comprobación previa),
  `package.json` (`db:migrate`), `drizzle/meta/_journal.json`
- Create: `drizzle/0003_fase12-visual.sql`, `src/db/duplicados-usuario.ts`, `scripts/migrar.ts`,
  `src/lib/tema.ts`
- Test: `tests/esquema.test.ts`, `tests/duplicados-usuario.test.ts`, `tests/tema.test.ts`,
  `tests/sesion.test.ts`

**Interfaces:**
- Produces:
  - `src/lib/tema.ts`: `export const TEMAS = ["claro", "oscuro", "sistema"] as const;`
    `export type Tema = (typeof TEMAS)[number];` `export const TEMA_DEFECTO: Tema = "claro";`
    `export const COOKIE_TEMA = "sgc_tema";` `export function esTema(v: unknown): v is Tema;`
    `export function temaEfectivo(sesion: { tema: Tema } | null, cookie: string | undefined): Tema`
    (sesión → su tema; sin sesión → cookie si `esTema`; si no, `TEMA_DEFECTO`).
  - `SesionValida` gana `tema: Tema` (lo devuelve `validarSesion` desde `u.tema`).
  - Tabla `notificaciones` (Drizzle `notificaciones`): `id` identity, `usuarioId` bigint NOT NULL
    → `usuarios.id` ON DELETE RESTRICT, `tipo` text NOT NULL, `titulo` text NOT NULL, `cuerpo` text,
    `enlace` text, `entidad` text, `entidadId` bigint, `leidaEn` timestamptz, `creadoEn` timestamptz
    NOT NULL DEFAULT now(); índice `notificaciones_usuario_idx (usuario_id, leida_en, creado_en DESC)`.
  - `usuarios.tema text NOT NULL DEFAULT 'claro'` con CHECK `usuarios_tema_valido`
    (`tema IN ('claro','oscuro','sistema')`).
  - Índice único `usuarios_usuario_lower_unico ON usuarios (lower(usuario))`.
  - `src/db/duplicados-usuario.ts`: `export function duplicadosSinMayusculas(nombres: string[]): string[][]`
    (grupos de 2 o más nombres que coinciden en `lower()`, en el orden en que aparecen);
    `export function mensajeDuplicados(grupos: string[][]): string` →
    «Hay cuentas duplicadas sin distinguir mayúsculas: admin, Admin. Renombre una antes de actualizar.»
    (los grupos separados por «; »); `export async function comprobarDuplicadosUsuario(sql: Sql): Promise<void>`
    (si `to_regclass('usuarios')` es null no hace nada; si hay grupos lanza `Error(mensajeDuplicados(...))`).

- [ ] **Step 1: Tests que fallan**

En `tests/tema.test.ts`:

```ts
describe("temaEfectivo", () => {
  it("con sesión manda el perfil", () => expect(temaEfectivo({ tema: "oscuro" }, "claro")).toBe("oscuro"));
  it("sin sesión usa la cookie válida", () => expect(temaEfectivo(null, "sistema")).toBe("sistema"));
  it("cookie inválida o ausente → claro", () => {
    expect(temaEfectivo(null, "azul")).toBe("claro");
    expect(temaEfectivo(null, undefined)).toBe("claro");
  });
});
```

En `tests/duplicados-usuario.test.ts`:

```ts
it("agrupa los que coinciden sin mayúsculas y conserva el orden", () => {
  expect(duplicadosSinMayusculas(["admin", "gerente", "Admin", "ADMIN", "consulta"])).toEqual([["admin", "Admin", "ADMIN"]]);
  expect(duplicadosSinMayusculas(["a", "b"])).toEqual([]);
});
it("el mensaje nombra los duplicados y pide renombrar", () => {
  const m = mensajeDuplicados([["admin", "Admin"]]);
  expect(m).toBe("Hay cuentas duplicadas sin distinguir mayúsculas: admin, Admin. Renombre una antes de actualizar.");
});
```

En `tests/esquema.test.ts` (BD):

```ts
it("usuarios.tema solo admite claro, oscuro o sistema", async () => {
  expect(await codigoDeError(sql`UPDATE usuarios SET tema = 'azul' WHERE usuario = 'consulta'`)).toBe(CHECK_VIOLATION);
  const [u] = await sql`SELECT tema FROM usuarios WHERE usuario = 'consulta'`;
  expect(u.tema).toBe("claro");
});
it("el nombre de usuario es único sin distinguir mayúsculas", async () => {
  expect(await codigoDeError(sql`INSERT INTO usuarios (usuario, nombre, hash_clave) VALUES ('CONSULTA', 'x', 'h')`)).toBe(UNIQUE_VIOLATION);
});
it("notificaciones existe con FK RESTRICT a usuarios", async () => {
  const [fk] = await sql`SELECT confdeltype FROM pg_constraint WHERE conname = 'notificaciones_usuario_id_usuarios_id_fk'`;
  expect(fk.confdeltype).toBe("r");
});
```

En `tests/sesion.test.ts`, en el caso "crea y valida una sesión": `expect(valida?.tema).toBe("claro")`.

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run tests/tema.test.ts tests/duplicados-usuario.test.ts tests/esquema.test.ts tests/sesion.test.ts`
Expected: FAIL (módulos inexistentes; columna `tema` no existe; constraint no existe).

- [ ] **Step 3: Esquema Drizzle y migración**

En `src/db/esquema.ts`: `tema: text("tema").notNull().default("claro")` en `usuarios` con
`check("usuarios_tema_valido", sql\`${t.tema} IN ('claro', 'oscuro', 'sistema')\`)` y
`uniqueIndex("usuarios_usuario_lower_unico").on(sql\`lower(${t.usuario})\`)`; tabla
`notificaciones` como en Interfaces. Generar con `npm run db:generate`, renombrar el archivo a
`drizzle/0003_fase12-visual.sql` y su `tag` en `drizzle/meta/_journal.json`; comprobar que el SQL
contiene exactamente: `ALTER TABLE "usuarios" ADD COLUMN "tema"…`, `CREATE TABLE "notificaciones"`,
`CREATE INDEX "notificaciones_usuario_idx"`, `CREATE UNIQUE INDEX "usuarios_usuario_lower_unico"`,
la FK `ON DELETE restrict` y el CHECK; **ningún `DROP` ni `RENAME`**.

- [ ] **Step 4: `tema.ts`, `duplicados-usuario.ts`, `SesionValida.tema`**

`validarSesion` añade `u.tema` al `SELECT` y al objeto devuelto. Buscar los lugares que
construyen un `SesionValida` literal (`grep -rn "sesionId:" src tests`) y añadir `tema: "claro"`.

- [ ] **Step 5: Comprobación previa y `db:migrate`**

`scripts/migrar.ts`: carga `.env.local` con `loadEnvConfig`, abre `postgres(DATABASE_URL_MIGRADOR ?? DATABASE_URL, { max: 1, types: TIPOS_SQL })`,
llama `comprobarDuplicadosUsuario(sql)` (si lanza: imprime `[migrar] <mensaje>` y `process.exit(1)`),
luego `migrate(drizzle(sql), { migrationsFolder: "drizzle" })`. `package.json`: `"db:migrate": "tsx scripts/migrar.ts"`.
En `scripts/arrancar.ts`, justo antes de `migrate(...)`: `await comprobarDuplicadosUsuario(sql)` dentro de
un `try` que imprime `[arranque] <mensaje>` y sale con 1.

- [ ] **Step 6: Aplicar y verificar**

Run: `npm run db:preparar && npx vitest run tests/tema.test.ts tests/duplicados-usuario.test.ts tests/esquema.test.ts tests/sesion.test.ts`
Expected: migración 0003 aplicada; tests en verde.
Run: `npm run lint && npm test`
Expected: todo en verde.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(f12): migración 0003 (tema de usuario, notificaciones, usuario único sin mayúsculas) y comprobación previa de duplicados"
```

---

### Tarea 3: Color y marca (funciones puras)

**Files:**
- Create: `src/lib/color.ts`, `src/lib/marca.ts`
- Test: `tests/color.test.ts`, `tests/marca.test.ts`

**Interfaces:**
- Consumes: `contrasteWCAG(hex1, hex2): number` de `src/lib/contraste.ts`.
- Produces (`src/lib/color.ts`):
  - `export const PATRON_HEX = /^#[0-9a-f]{6}$/i;` `export function hexValido(v: unknown): v is string;`
    `export function normalizarHex(hex: string): string` (minúsculas).
  - `export type Oklch = { l: number; c: number; h: number };` `export function hexAOklch(hex: string): Oklch;`
    `export function oklchAHex(color: Oklch): string` (recorta cada canal sRGB a [0, 255]).
  - `export function ajustarLuminosidad(hex: string, delta: number): string` (L + delta, recortada a [0, 1]).
  - `export function aclararHasta(hex: string, fondo: string, minimo: number, topeL = 0.85): string`
    (sube L de 0.02 en 0.02 hasta `contrasteWCAG(resultado, fondo) ≥ minimo` o `L ≥ topeL`).
  - `export function oscurecerHasta(hex: string, fondo: string, minimo: number, pisoL = 0.1): string`.
- Produces (`src/lib/marca.ts`):
  - `export const SUPERFICIES = { claro: { fondo: "#f4f6f9", panel: "#ffffff", tinta: "#16181d" }, oscuro: { fondo: "#0f1216", panel: "#161a20", tinta: "#e7eaef" } } as const;`
  - `export type ColoresMarca = { primario: string; secundario: string };`
  - `export type Marca = { nombre: string; sigla: string; lema: string; primario: string; secundario: string; logo: { version: string; mime: string } | null };`
  - `export const MARCA_DEFECTO: Marca = { nombre: "Entidad sin configurar", sigla: "SGC", lema: "", primario: "#1b4e8e", secundario: "#2e9b47", logo: null };`
  - `export const TOKENS_MARCA = ["marca", "marca-relleno", "marca-oscurecida", "marca-2", "marca-2-relleno", "marca-2-contraste", "marca-2-texto"] as const;`
    `export type TokenMarca = (typeof TOKENS_MARCA)[number];`
    `export type TokensMarca = { claro: Record<TokenMarca, string>; oscuro: Record<TokenMarca, string> };`
  - `export function derivarMarca(colores: ColoresMarca): TokensMarca` — reglas de la tabla
    de §6.2 del spec: `marca-relleno` = primario (ambos temas); `marca-oscurecida` =
    `ajustarLuminosidad(primario, -0.08)` (ambos); `marca` claro = primario, oscuro =
    `aclararHasta(primario, "#161a20", 4.5)`; `marca-2` = secundario (ambos);
    `marca-2-relleno` (fondo del monograma, ambos temas) = el secundario si `contrasteWCAG(secundario, "#ffffff") ≥ 4.5`
    o `contrasteWCAG(secundario, "#16181d") ≥ 4.5`; si ninguno llega, `oscurecerHasta(secundario, "#ffffff", 4.5)`;
    `marca-2-contraste` = `#ffffff` si `contrasteWCAG(marca-2-relleno, "#ffffff") ≥ 4.5`, si no `#16181d`
    (ambos; así el texto del monograma cumple 4.5 por construcción); `marca-2-texto` claro =
    `oscurecerHasta(secundario, "#f4f6f9", 4.5)`, oscuro = `aclararHasta(secundario, "#161a20", 4.5)`.
  - `export function estiloMarca(tokens: TokensMarca): Record<string, string>` →
    `{ "--marca-c": …, "--marca-o": …, "--marca-relleno-c": …, … }` (sufijo `-c` claro, `-o` oscuro).
  - `export type ErrorMarca = { campo: "color_primario" | "color_secundario"; mensaje: string; sugerencia: string };`
    `export function validarMarca(colores: ColoresMarca): ErrorMarca[]` (vacío si pasa):
    P1 `contrasteWCAG(primario, "#ffffff") ≥ 4.5`; P2 `contrasteWCAG(secundario, "#f4f6f9") ≥ 3.0`.
  - `export function sugerirPrimario(hex: string): string` (`oscurecerHasta(hex, "#ffffff", 4.5)`);
    `export function sugerirSecundario(hex: string): string` (`oscurecerHasta(hex, "#f4f6f9", 3.0)`).
  - `export function formatearRazon(n: number): string` → un decimal con coma (`"1,6"`).
  - Mensajes exactos:
    P1: `El color primario ${hex} no tiene contraste suficiente con el texto blanco (${razon}:1; mínimo 4,5:1). Pruebe ${sugerencia}.`
    P2: `El color secundario ${hex} no se distingue del fondo (${razon}:1; mínimo 3:1). Pruebe ${sugerencia}.`

- [ ] **Step 1: Tests que fallan**

`tests/color.test.ts`:

```ts
it("hexValido acepta #rrggbb en cualquier caja y rechaza #rgb, nombres y basura", () => {
  expect(hexValido("#1b4e8e")).toBe(true); expect(hexValido("#1B4E8E")).toBe(true);
  expect(hexValido("#fff")).toBe(false); expect(hexValido("red")).toBe(false); expect(hexValido("#12345;")).toBe(false);
  expect(normalizarHex("#1B4E8E")).toBe("#1b4e8e");
});
it("hex → OKLCH → hex vuelve al mismo valor (±1 por canal)", () => {
  for (const hex of ["#1b4e8e", "#2e9b47", "#000000", "#ffffff", "#eb6834"]) {
    const vuelta = oklchAHex(hexAOklch(hex));
    for (let i = 1; i < 7; i += 2) expect(Math.abs(parseInt(vuelta.slice(i, i + 2), 16) - parseInt(hex.slice(i, i + 2), 16))).toBeLessThanOrEqual(1);
  }
});
it("aclararHasta alcanza el contraste pedido sin pasar del tope", () => {
  const r = aclararHasta("#1b4e8e", "#161a20", 4.5);
  expect(contrasteWCAG(r, "#161a20")).toBeGreaterThanOrEqual(4.5);
  expect(hexAOklch(r).l).toBeLessThanOrEqual(0.85 + 1e-9);
});
it("oscurecerHasta alcanza el contraste con blanco", () => {
  expect(contrasteWCAG(oscurecerHasta("#9ecbff", "#ffffff", 4.5), "#ffffff")).toBeGreaterThanOrEqual(4.5);
});
```

`tests/marca.test.ts`:

```ts
it("los valores por defecto pasan la validación", () => expect(validarMarca({ primario: "#1b4e8e", secundario: "#2e9b47" })).toEqual([]));
it("P1 rechaza un primario claro con la razón y una sugerencia que pasa", () => {
  const [e] = validarMarca({ primario: "#9ecbff", secundario: "#2e9b47" });
  expect(e.campo).toBe("color_primario");
  expect(e.mensaje).toMatch(/^El color primario #9ecbff no tiene contraste suficiente con el texto blanco \(1,7:1; mínimo 4,5:1\)\. Pruebe #[0-9a-f]{6}\.$/);
  expect(contrasteWCAG(e.sugerencia, "#ffffff")).toBeGreaterThanOrEqual(4.5);
});
it("P2 rechaza un secundario que no se distingue del fondo", () => {
  const [e] = validarMarca({ primario: "#1b4e8e", secundario: "#e8edf3" });
  expect(e.campo).toBe("color_secundario");
  expect(e.mensaje).toContain("no se distingue del fondo");
  expect(contrasteWCAG(e.sugerencia, "#f4f6f9")).toBeGreaterThanOrEqual(3);
});
it("el monograma usa tinta sobre el verde por defecto y blanco sobre el azul", () => {
  const t = derivarMarca({ primario: "#1b4e8e", secundario: "#2e9b47" });
  expect(t.claro["marca-2-contraste"]).toBe("#16181d");
  expect(derivarMarca({ primario: "#1b4e8e", secundario: "#1b4e8e" }).claro["marca-2-contraste"]).toBe("#ffffff");
});
describe("derivados sobre una malla de 12 tonos × 5 luminosidades × 3 cromas", () => {
  const casos: string[] = [];
  for (let h = 0; h < 360; h += 30) for (const l of [0.25, 0.35, 0.45, 0.55, 0.65]) for (const c of [0.05, 0.1, 0.15]) casos.push(oklchAHex({ l, c, h }));
  it.each(casos)("%s", (hex) => {
    const t = derivarMarca({ primario: hex, secundario: hex });
    expect(contrasteWCAG(t.oscuro.marca, "#161a20")).toBeGreaterThanOrEqual(4.5);
    expect(contrasteWCAG(t.oscuro["marca-2-texto"], "#161a20")).toBeGreaterThanOrEqual(4.5);
    expect(contrasteWCAG(t.claro["marca-2-texto"], "#f4f6f9")).toBeGreaterThanOrEqual(4.5);
    expect(contrasteWCAG(t.claro["marca-2-contraste"], t.claro["marca-2-relleno"])).toBeGreaterThanOrEqual(4.5);
    if (validarMarca({ primario: hex, secundario: hex }).length === 0) {
      expect(contrasteWCAG(t.claro["marca-relleno"], "#ffffff")).toBeGreaterThanOrEqual(4.5);
      expect(contrasteWCAG(t.oscuro["marca-relleno"], "#ffffff")).toBeGreaterThanOrEqual(4.5);
    }
  });
});
it("estiloMarca emite las catorce variables con sufijo", () => {
  const e = estiloMarca(derivarMarca(MARCA_DEFECTO));
  expect(Object.keys(e).sort()).toEqual(TOKENS_MARCA.flatMap((t) => [`--${t}-c`, `--${t}-o`]).sort());
  expect(e["--marca-relleno-c"]).toBe("#1b4e8e");
});
```

- [ ] **Step 2: Correr y ver fallar** — `npx vitest run tests/color.test.ts tests/marca.test.ts` → FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar `color.ts`** — conversión sRGB ↔ linear ↔ OKLab ↔ OKLCH (fórmulas de
Björn Ottosson, matrices estándar; sin librería); recorte a gamut por canal.

- [ ] **Step 4: Implementar `marca.ts`** con las reglas de Interfaces.

- [ ] **Step 5: Verificar** — `npx vitest run tests/color.test.ts tests/marca.test.ts` → PASS; `npm run lint` limpio.

- [ ] **Step 6: Commit**

```bash
git add src/lib/color.ts src/lib/marca.ts tests/color.test.ts tests/marca.test.ts
git commit -m "feat(f12): color OKLCH y derivación y validación de la marca (P1, P2, sugerencias)"
```

---

### Tarea 4: Consultas de entidad, notificaciones y tareas; semillas

**Files:**
- Create: `src/db/consultas/entidad.ts`, `src/db/consultas/notificaciones.ts`, `src/lib/tareas.ts`,
  `scripts/generar-logo-demo.mjs`, `src/db/semillas/recursos/logo-demo.png`
- Modify: `src/db/consultas/mapa-admin.ts` (`CLAVES_TEXTO` recortada), `src/db/semillas/minima.ts`,
  `src/db/semillas/demo.ts`, `src/db/placeholders.ts` (`generarPlaceholder` recibe `entidad`),
  `src/app/(cuenta)/aviso-datos/page.tsx` (lee el aviso de `obtenerEntidad`),
  `src/app/(cuenta)/cuenta/segundo-factor/page.tsx` (`obtenerMarca().nombre`),
  `src/lib/bitacora-detalle.ts` (`subir_logo`, `quitar_logo`), `tests/esquema.test.ts` (claves de la semilla)
- Test: `tests/entidad.test.ts`, `tests/notificaciones.test.ts`, `tests/tareas.test.ts`, `tests/bitacora-detalle.test.ts`

**Interfaces:**
- Consumes: `Marca`, `MARCA_DEFECTO`, `validarMarca`, `hexValido`, `normalizarHex` (Tarea 3);
  `registrarAuditoria(sql, e)` de `src/db/consultas/admin.ts`; `rutaInterna` de `src/lib/rutas.ts`.
- Produces (`src/db/consultas/entidad.ts`):
  - `export const CLAVES_ENTIDAD = ["nombre_entidad", "sigla_entidad", "lema", "aviso_datos_personales", "color_primario", "color_secundario", "logo_ruta", "logo_mime", "logo_version"] as const;`
  - `export const obtenerMarca: () => Promise<Marca>` (envuelta en `cache` de React; lee las
    claves; cada campo ausente o vacío toma el valor de `MARCA_DEFECTO`; un color que no pase
    `hexValido` también cae al defecto; `logo` solo si las tres claves del logo existen).
  - `export type DatosEntidad = { nombre: string; sigla: string; lema: string; avisoDatosPersonales: string; primario: string; secundario: string };`
    `export async function obtenerEntidad(): Promise<DatosEntidad>` (sin `cache`; para el formulario).
  - `export async function guardarEntidad(datos: DatosEntidad, actorId: number): Promise<void>`:
    valida con `validarMarca` y lanza `Error(errores[0].mensaje)` si falla; `INSERT … ON CONFLICT (clave) DO UPDATE`
    de las seis claves en una transacción; auditoría `editar_configuracion` con `detalle: { claves: [...] }`.
  - `export type LogoGuardado = { ruta: string; mime: string; version: string; nombre: string; bytes: number; ancho: number; alto: number };`
    `export async function guardarLogo(logo: LogoGuardado, actorId: number): Promise<{ rutaAnterior: string | null }>`
    (transacción: guarda `logo_ruta`, `logo_mime`, `logo_version`; auditoría `subir_logo` con
    `{ nombre, bytes, mime, ancho, alto }`; devuelve la ruta previa, o `null` si no había o si es la misma).
  - `export async function quitarLogo(actorId: number): Promise<{ rutaAnterior: string | null }>`
    (borra las tres claves; auditoría `quitar_logo`).
- Produces (`src/db/consultas/notificaciones.ts`):
  - `export type Notificacion = { id: number; tipo: string; titulo: string; cuerpo: string | null; enlace: string | null; leidaEn: Date | null; creadoEn: Date };`
  - `export async function crearNotificacion(n: { usuarioId: number; tipo: string; titulo: string; cuerpo?: string | null; enlace?: string | null; entidad?: string | null; entidadId?: number | null }, sql = obtenerSql()): Promise<number>` (id).
  - `export async function contarNoLeidas(usuarioId: number): Promise<number>`
  - `export async function listarRecientes(usuarioId: number, limite = 10): Promise<Notificacion[]>` (más recientes primero).
  - `export async function marcarLeida(id: number, usuarioId: number): Promise<string | null>`
    (`UPDATE notificaciones SET leida_en = COALESCE(leida_en, now()) WHERE id = $1 AND usuario_id = $2 RETURNING enlace`;
    devuelve el `enlace` de la fila **si es del usuario**, también cuando ya estaba leída; `null` si no es suya o no existe).
  - `export async function marcarTodasLeidas(usuarioId: number): Promise<number>` (filas afectadas).
- Produces (`src/lib/tareas.ts`): el tipo `Tarea` y `misTareas` **exactos** de §5.6 del spec
  (`misTareas` devuelve `[]` con un comentario de que la Fase 13 añade las fuentes).
- Produces (`src/lib/bitacora-detalle.ts`): `subir_logo` → `Cambió el logo de la entidad («${nombre}», ${ancho} × ${alto})`; `quitar_logo` → `Quitó el logo de la entidad`.
- `CLAVES_TEXTO` queda con `subtitulo_mapa`, `titulo_phva`, `texto_phva`, `patron_codigo`.
- Semillas: `limpiarTodo` (`src/db/semillas/minima.ts`) añade `notificaciones` a la lista de tablas que vacía
  (su FK a `usuarios` es RESTRICT: sin esto, vaciar `usuarios` falla). `sembrarBase` (mínima) escribe además `sigla_entidad` = `SGC`, `color_primario` = `#1b4e8e`,
  `color_secundario` = `#2e9b47` (sin claves de logo). `sembrarDemo` fija `sigla_entidad` = `HNSF`,
  copia `src/db/semillas/recursos/logo-demo.png` a `<almacen>/marca/logo-<8 hex sha256>.png`
  (creando la carpeta), escribe `logo_ruta` = `marca/logo-<hash>.png`, `logo_mime` = `image/png`,
  `logo_version` = `<hash>`, e inserta por cada usuario demo una notificación
  `{ tipo: "bienvenida", titulo: "Bienvenida al SGC Integral", cuerpo: "Explore el mapa de procesos y revise su cuenta en Mi cuenta.", enlace: "/cuenta" }`.
  `generarPlaceholder` recibe el nombre de la entidad como parámetro (la demo le pasa el suyo); `placeholders.ts` deja de tener el nombre fijo.
- `scripts/generar-logo-demo.mjs`: escribe un PNG RGBA de 256 × 256 con `zlib.deflateSync`
  (IHDR, IDAT, IEND con CRC32 propio): fondo `#1b4e8e` con esquinas redondeadas y una cruz
  `#2e9b47` centrada. El PNG resultante se versiona; el script queda para regenerarlo.

- [ ] **Step 1: Tests que fallan**

`tests/entidad.test.ts` (BD, usuario actor `zz_entidad_${Date.now()}` creado como en `tests/handlers-permisos.test.ts`):

```ts
it("obtenerMarca completa con los valores por defecto lo que falta", async () => {
  const m = await obtenerMarca();
  expect(m.primario).toMatch(/^#[0-9a-f]{6}$/); expect(m.sigla.length).toBeGreaterThan(0);
});
it("guardarEntidad rechaza P1 con el mensaje y no escribe", async () => {
  const antes = await obtenerEntidad();
  await expect(guardarEntidad({ ...antes, primario: "#9ecbff" }, actorId)).rejects.toThrow(/texto blanco/);
  expect((await obtenerEntidad()).primario).toBe(antes.primario);
});
it("guardarEntidad escribe las seis claves y audita", async () => {
  const antes = await obtenerEntidad();
  await guardarEntidad({ ...antes, sigla: "ZZS" }, actorId);
  expect((await obtenerEntidad()).sigla).toBe("ZZS");
  const [a] = await sql`SELECT detalle FROM auditoria WHERE usuario_id = ${actorId} AND accion = 'editar_configuracion' ORDER BY id DESC LIMIT 1`;
  expect(a.detalle.claves).toContain("sigla_entidad");
  await guardarEntidad(antes, actorId);
});
it("guardarLogo devuelve la ruta anterior solo si cambia, y quitarLogo la limpia", async () => {
  const logo = { ruta: "marca/logo-aaaaaaaa.png", mime: "image/png", version: "aaaaaaaa", nombre: "l.png", bytes: 10, ancho: 64, alto: 64 };
  const previo = (await obtenerMarca()).logo;
  await guardarLogo(logo, actorId);
  expect((await guardarLogo(logo, actorId)).rutaAnterior).toBeNull();            // mismo archivo: no se borra
  expect((await guardarLogo({ ...logo, ruta: "marca/logo-bbbbbbbb.png", version: "bbbbbbbb" }, actorId)).rutaAnterior).toBe("marca/logo-aaaaaaaa.png");
  expect((await quitarLogo(actorId)).rutaAnterior).toBe("marca/logo-bbbbbbbb.png");
  // restaurar el logo previo de la demo si lo había
});
```

(`obtenerMarca` usa `cache` de React: fuera de un render devuelve siempre el valor fresco;
si en Vitest `cache` no está disponible, importar `cache` desde `react` funciona en Node.)

`tests/notificaciones.test.ts` (BD, dos usuarios `zz_notif_a_${ts}` y `zz_notif_b_${ts}`):

```ts
it("crear, contar y listar; marcar propias y no ajenas", async () => {
  const id = await crearNotificacion({ usuarioId: a, tipo: "prueba", titulo: "Hola", enlace: "/cuenta" });
  expect(await contarNoLeidas(a)).toBe(1);
  expect((await listarRecientes(a))[0]).toMatchObject({ id, titulo: "Hola", leidaEn: null });
  expect(await marcarLeida(id, b)).toBeNull();            // ajena: nada
  expect(await contarNoLeidas(a)).toBe(1);
  expect(await marcarLeida(id, a)).toBe("/cuenta");
  expect(await contarNoLeidas(a)).toBe(0);
  await crearNotificacion({ usuarioId: a, tipo: "prueba", titulo: "Dos" });
  await crearNotificacion({ usuarioId: a, tipo: "prueba", titulo: "Tres" });
  expect(await marcarTodasLeidas(a)).toBe(2);
});
it("listarRecientes devuelve como máximo el límite, más recientes primero", async () => {
  for (let i = 0; i < 12; i++) await crearNotificacion({ usuarioId: b, tipo: "prueba", titulo: `N${i}` });
  const lista = await listarRecientes(b);
  expect(lista).toHaveLength(10); expect(lista[0].titulo).toBe("N11");
});
```

`tests/tareas.test.ts`: `expect(await misTareas({ usuarioId: 1, rol: "consulta" })).toEqual([])`.
`tests/bitacora-detalle.test.ts`: los dos textos nuevos.
`tests/esquema.test.ts`: la demo trae `sigla_entidad` = `HNSF`, `color_primario` = `#1b4e8e` y
`logo_version` de 8 hex; existe una notificación `bienvenida` para `gerente`.

- [ ] **Step 2: Correr y ver fallar** — `npx vitest run tests/entidad.test.ts tests/notificaciones.test.ts tests/tareas.test.ts tests/bitacora-detalle.test.ts` → FAIL.

- [ ] **Step 3: Implementar consultas, `tareas.ts`, textos de bitácora, recorte de `CLAVES_TEXTO`**
y adaptar `aviso-datos/page.tsx` y `segundo-factor/page.tsx` (ambas siguen llamando `exigirSesionConPendientes`).

- [ ] **Step 4: Logo demo y semillas** — `node scripts/generar-logo-demo.mjs` (verificar con
`file src/db/semillas/recursos/logo-demo.png` o leyendo los 8 bytes de firma); cambios en
`minima.ts`, `demo.ts`, `placeholders.ts`.

- [ ] **Step 5: Resembrar y verificar**

Run: `npm run db:seed && npm run admin:asegurar && npx vitest run tests/entidad.test.ts tests/notificaciones.test.ts tests/tareas.test.ts tests/bitacora-detalle.test.ts tests/esquema.test.ts`
Expected: PASS; en `almacen/marca/` hay un `logo-*.png`.
Run: `npm run db:seed:minima && npx vitest run tests/esquema.test.ts -t "claves"` → la mínima
no crea logo y sí los colores; luego `npm run db:seed && npm run admin:asegurar` para dejar la demo.
Run: `npm run lint && npm test` → verde.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(f12): consultas de entidad y notificaciones, misTareas, semillas con marca, logo demo y bienvenida"
```

---

### Tarea 5: Tokens globales, alias de clases y layout raíz con tema y marca

**Files:**
- Modify: `src/app/globals.css`, `src/app/layout.tsx`, los 22 usos de `text-azul` (reemplazo mecánico)
- Create: `src/lib/version.ts`
- Test: `tests/tokens.test.ts`, `tests/a11y-estructura.test.ts` (sin cambio aún)

**Interfaces:**
- Consumes: `obtenerMarca` (T4), `derivarMarca`, `estiloMarca`, `SUPERFICIES` (T3), `temaEfectivo`, `COOKIE_TEMA` (T2).
- Produces:
  - Variables CSS en `:root` (valores por defecto para cuando falte el `style` inyectado) y
    tokens: `--background`, `--card`, `--popover`, `--border`, `--linea-suave`, `--foreground`,
    `--muted-foreground`, `--texto-terciario`, `--mod-documentos`, `--mod-indicadores`, `--mod-planes`,
    `--estado-{bien,atencion,grave,critico,sin-dato}`, `--estado-<x>-fondo`, `--estado-<x>-texto`,
    `--marca`, `--marca-relleno`, `--marca-oscurecida`, `--marca-tinte`, `--marca-2`,
    `--marca-2-contraste`, `--marca-2-texto`, `--primary`, `--primary-foreground`, `--ring`, `--radius: 0.5rem`.
    Cada token con dos valores se escribe **una vez** con `light-dark(claro, oscuro)`; el tema
    lo fija `color-scheme`: `[data-tema="claro"] { color-scheme: light }`,
    `[data-tema="oscuro"] { color-scheme: dark }`, `[data-tema="sistema"] { color-scheme: light dark }`.
    Los de marca: `--marca: light-dark(var(--marca-c), var(--marca-o))`, etc.
  - Tailwind: en `@theme inline`, `--color-marca: var(--marca)`, `--color-marca-relleno`, `--color-marca-oscurecida`,
    `--color-marca-tinte`, `--color-marca-2`, `--color-marca-2-texto`, `--color-linea-suave`, `--color-texto-terciario`,
    `--color-mod-documentos`, `--color-mod-indicadores`, `--color-mod-planes`, `--color-estado-*` (base, `-fondo`, `-texto`,
    para los cinco estados), y los alias `--color-azul: var(--marca-relleno)`, `--color-azul-profundo: var(--marca-oscurecida)`,
    `--color-azul-tinta: var(--foreground)`, `--color-verde: var(--marca-2)`,
    `--color-verde-texto: var(--marca-2-texto)`.
    `@custom-variant dark { &:where([data-tema="oscuro"], [data-tema="oscuro"] *) { @slot } @media (prefers-color-scheme: dark) { &:where([data-tema="sistema"], [data-tema="sistema"] *) { @slot } } }`.
  - Utilidades: `.banda-tinte { background: color-mix(in srgb, var(--color-banda) 12%, var(--background)) }`,
    `.banda-texto { color: light-dark(color-mix(in srgb, var(--color-banda) 80%, black), color-mix(in srgb, var(--color-banda) 70%, white)) }`,
    `.banda-borde { border-color: color-mix(in srgb, var(--color-banda) 28%, var(--background)) }`.
  - Valores de estado (claro / oscuro): fondos `bien #e7f6e7/#163a16`, `atencion #fff5db/#3d2f0a`,
    `grave #fdeee8/#3f2418`, `critico #fbe7e7/#3f1a1a`, `sin-dato #eef0f3/#242a33`; textos de
    partida `bien #0a6b0a/#5fd45f`, `atencion #7a5200/#f3c65a`, `grave #8a3a1a/#f0a07e`,
    `critico #a82e2e/#f08080`, `sin-dato #5b6472/#9aa3b0` — **ajustar hasta que el test de
    contraste pase** (≥ 4.5 contra su fondo en ambos temas).
  - `src/lib/version.ts`: `import { version } from "../../package.json"; export const VERSION_APP: string = version;`
  - `src/app/layout.tsx`: `export async function generateMetadata()` →
    `{ title: { default: \`${m.nombre} · SGC\`, template: \`%s · ${m.sigla}\` }, description: \`Sistema de Gestión de Calidad de ${m.nombre}\` }`;
    el layout lee `sesionActual()` y la cookie `COOKIE_TEMA`, calcula `temaEfectivo`, y pinta
    `<html lang="es" data-tema={tema} style={estiloMarca(derivarMarca(marca))} className=…>`.
    Conserva el enlace "Saltar al contenido" y, **por ahora**, `EncabezadoSitio` y el `div#contenido`
    (la Tarea 8 los reemplaza).

- [ ] **Step 1: Test de tokens** (`tests/tokens.test.ts`, lee `src/app/globals.css` como texto):

```ts
const css = readFileSync("src/app/globals.css", "utf8");
const valor = (nombre: string) => { const m = css.match(new RegExp(`${nombre}:\\s*light-dark\\((#[0-9a-f]{6}),\\s*(#[0-9a-f]{6})\\)`)); if (!m) throw new Error(nombre); return { claro: m[1], oscuro: m[2] }; };
it.each(["bien", "atencion", "grave", "critico", "sin-dato"])("texto de estado %s contrasta ≥ 4.5 con su fondo en ambos temas", (e) => {
  const fondo = valor(`--estado-${e}-fondo`), texto = valor(`--estado-${e}-texto`);
  expect(contrasteWCAG(texto.claro, fondo.claro)).toBeGreaterThanOrEqual(4.5);
  expect(contrasteWCAG(texto.oscuro, fondo.oscuro)).toBeGreaterThanOrEqual(4.5);
});
it("los colores de módulo y las superficies son los del spec", () => {
  expect(valor("--mod-documentos")).toEqual({ claro: "#2a78d6", oscuro: "#3987e5" });
  expect(valor("--background")).toEqual({ claro: "#f4f6f9", oscuro: "#0f1216" });
  expect(css).toMatch(/--color-azul:\s*var\(--marca-relleno\)/);
  expect(css).toMatch(/--color-marca:\s*var\(--marca\)/);
  expect(css).not.toMatch(/\.dark\s*\{/);
});
it("no queda text-azul en el código: pasó a text-marca (text-azul-tinta sigue siendo válido)", () => {
  const archivos = readdirSync("src", { recursive: true }).filter((f) => String(f).endsWith(".tsx"));
  for (const f of archivos) expect(readFileSync(path.join("src", String(f)), "utf8")).not.toMatch(/\btext-azul(?![\w-])/);
});
```

- [ ] **Step 2: Correr y ver fallar** — `npx vitest run tests/tokens.test.ts` → FAIL.

- [ ] **Step 3: Reescribir `globals.css`** según Interfaces (conservar `.saltar-al-contenido`,
`.marca-estado`, los tokens de movimiento y el anillo de foco global; retirar el bloque `.dark`
de shadcn y la variante `dark (&:is(.dark *))`).

- [ ] **Step 4: Reemplazo mecánico** — `grep -rlE "text-azul([^-A-Za-z0-9_]|$)" src --include=*.tsx | xargs sed -i -E 's/text-azul([^-A-Za-z0-9_]|$)/text-marca\1/g'`.
**Ojo:** `\b` no sirve aquí porque `text-azul-tinta` también tiene frontera de palabra tras `azul`; el patrón exige que lo que sigue no sea letra, dígito, `_` ni `-`.
Revisar el `diff`: `hover:text-azul` y `group-hover:text-azul` también pasan a `text-marca`; `text-azul-tinta` queda intacto.

- [ ] **Step 5: Layout raíz** según Interfaces; `src/lib/version.ts`.

- [ ] **Step 6: Verificar**

Run: `npx vitest run tests/tokens.test.ts && npm run lint && npm test` → verde.
Run: `npm run build` → correcto (`generateMetadata` dinámico; sin prerender de `/_not-found` con BD).
Run manual: `npm run dev`, abrir `http://localhost:3002/ingreso`: la pestaña dice «ESE Hospital … · SGC»; el
botón "Ingresar" sigue azul con letra blanca; `document.documentElement.dataset.tema === "claro"`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(f12): tokens de tres capas con light-dark, alias de las clases heredadas, tema y marca en el layout raíz"
```

---

### Tarea 6: Componentes base de presentación

**Files:**
- Create: `src/componentes/ui/Insignia.tsx`, `TarjetaCifra.tsx`, `EstadoVacio.tsx`, `EncabezadoPagina.tsx`,
  `TablaDatos.tsx`, `Boton.tsx`, `Campo.tsx`
- Test: `tests/ui-base.test.tsx` (render con `renderToStaticMarkup` de `react-dom/server`)

**Interfaces (todos Server Components salvo que se indique):**
- `Insignia`: `export type VarianteInsignia = "bien" | "atencion" | "grave" | "critico" | "sin-dato" | "neutra" | "modulo";`
  `export function Insignia({ variante, children, icono, modulo }: { variante: VarianteInsignia; children: React.ReactNode; icono?: LucideIcon; modulo?: "documentos" | "indicadores" | "planes" })`
  → `<span class="… bg-estado-<v>-fondo text-estado-<v>-texto">` con `data-variante`; el ícono con `aria-hidden`.
  `export const ESTADO_DOCUMENTO: Record<string, { variante: VarianteInsignia; etiqueta: string }> = { vigente: { variante: "bien", etiqueta: "Vigente" }, borrador: { variante: "atencion", etiqueta: "Borrador" }, obsoleto: { variante: "sin-dato", etiqueta: "Obsoleto" }, anulado: { variante: "critico", etiqueta: "Anulado" } };`
  `export function InsigniaEstadoDocumento({ estado }: { estado: string })` (desconocido → `sin-dato` con el texto tal cual).
- `TarjetaCifra({ etiqueta, valor, detalle, estado }: { etiqueta: string; valor: string | number; detalle?: string; estado?: "bien" | "atencion" | "critico" | "sin-dato" })`
  → franja superior de 3 px en el color del estado (sin estado: `--border`), valor en `font-display text-2xl tabular-nums`.
- `EstadoVacio({ icono, titulo, texto, accion }: { icono: LucideIcon; titulo: string; texto: string; accion?: { href: string; etiqueta: string } })`.
- `EncabezadoPagina({ titulo, descripcion, superior, acciones, migas }: { titulo: string; descripcion?: string; superior?: string; acciones?: React.ReactNode; migas?: Miga[] })`
  → `<header>` con `Migas` (si hay), `<p>` superior, `<h1 class="font-display text-2xl font-semibold tracking-tight">`, descripción y acciones a la derecha.
- `TablaDatos`: `export type ColumnaTabla = { clave: string; etiqueta: string; numerica?: boolean; oculta?: boolean };`
  `export function TablaDatos({ titulo, columnas, filas, vacio, children }: { titulo: string; columnas: readonly ColumnaTabla[]; filas: number; vacio: string; children: React.ReactNode })`
  → `<div role="region" aria-label={titulo} tabIndex={0} class="overflow-x-auto rounded-lg border border-border"><table class="w-full text-sm"><caption class="sr-only">{titulo}</caption><thead class="sticky top-0 bg-muted text-left">…</thead><tbody>{filas === 0 ? <tr><td colSpan={columnas.length} class="px-3 py-8 text-center text-muted-foreground">{vacio}</td></tr> : children}</tbody></table></div>`;
  `oculta` → `<th><span class="sr-only">`; `numerica` → `text-right`.
  `export const celda = "px-3 py-2 align-top border-t border-linea-suave";` `export const celdaNumerica = \`${celda} text-right tabular-nums\`;`
- `Boton` (cliente no; es un `<button>` con clases): `export type VarianteBoton = "primario" | "secundario" | "peligro" | "fantasma";`
  `export function claseBoton(variante: VarianteBoton = "primario", tamano: "sm" | "md" = "md"): string`
  (primario: `bg-marca-relleno text-white hover:bg-azul-profundo`; secundario: `border border-border bg-card hover:bg-muted`;
  peligro: `bg-estado-critico-fondo text-estado-critico-texto border border-estado-critico/40`; fantasma: `hover:bg-muted`;
  todos con `disabled:opacity-60` y `rounded-md font-medium`).
  `export function Boton({ variante, tamano, pendiente, children, ...resto }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteBoton; tamano?: "sm" | "md"; pendiente?: boolean })`
  (`pendiente` → `disabled` y `aria-busy`).
- `Campo({ etiqueta, nombre, ayuda, error, children }: { etiqueta: string; nombre: string; ayuda?: string; error?: string; children: React.ReactElement })`
  → `<label for={nombre}>`; clona el hijo con `id={nombre}`, `name={nombre}`, `aria-describedby` con los ids
  `${nombre}-ayuda` y `${nombre}-error` que existan, y `aria-invalid="true"` si hay error; la ayuda va en
  `<p id="${nombre}-ayuda">` y el error en `<p id="${nombre}-error" role="alert">`;
  `export const claseControl = "rounded-md border border-border bg-card px-3 py-2 text-foreground outline-none focus:border-marca focus:ring-2 focus:ring-marca/20";`

- [ ] **Step 1: Tests de render que fallan** (`tests/ui-base.test.tsx`):

```tsx
const html = (n: React.ReactElement) => renderToStaticMarkup(n);
it("InsigniaEstadoDocumento siempre lleva texto y la variante correcta", () => {
  const h = html(<InsigniaEstadoDocumento estado="vigente" />);
  expect(h).toContain("Vigente"); expect(h).toContain('data-variante="bien"');
  expect(html(<InsigniaEstadoDocumento estado="raro" />)).toContain('data-variante="sin-dato"');
});
it("TablaDatos: región enfocable con etiqueta, caption oculto y fila vacía", () => {
  const h = html(<TablaDatos titulo="Usuarios" columnas={[{ clave: "u", etiqueta: "Usuario" }, { clave: "a", etiqueta: "Acción", oculta: true }]} filas={0} vacio="Sin usuarios">{null}</TablaDatos>);
  expect(h).toContain('role="region"'); expect(h).toContain('aria-label="Usuarios"'); expect(h).toContain('tabindex="0"');
  expect(h).toContain("<caption"); expect(h).toContain("Sin usuarios"); expect(h).toContain('colspan="2"');
  expect(h).toMatch(/<span class="sr-only">Acción<\/span>/);
});
it("TarjetaCifra pinta la franja del estado y el valor", () => {
  const h = html(<TarjetaCifra etiqueta="Vistas" valor={212} estado="bien" />);
  expect(h).toContain("212"); expect(h).toContain('data-estado="bien"');
});
it("EncabezadoPagina pinta h1, texto superior y acciones", () => {
  const h = html(<EncabezadoPagina titulo="Usuarios" superior="Administración" acciones={<a href="/x">Nuevo</a>} />);
  expect(h).toMatch(/<h1[^>]*>Usuarios<\/h1>/); expect(h).toContain("Administración"); expect(h).toContain('href="/x"');
});
it("Campo enlaza etiqueta, ayuda y error al control", () => {
  const h = html(<Campo etiqueta="Sigla" nombre="sigla" ayuda="2 a 12 letras" error="Muy corta"><input /></Campo>);
  expect(h).toContain('for="sigla"'); expect(h).toContain('id="sigla"'); expect(h).toContain('aria-invalid="true"');
  expect(h).toMatch(/aria-describedby="[^"]*sigla-error/);
});
it("Boton pendiente queda deshabilitado y ocupado", () => {
  expect(html(<Boton pendiente>Guardar</Boton>)).toMatch(/disabled=""[^>]*aria-busy="true"|aria-busy="true"[^>]*disabled=""/);
});
```

- [ ] **Step 2: Correr y ver fallar**; **Step 3: Implementar** los siete componentes; **Step 4: Verificar**
`npx vitest run tests/ui-base.test.tsx && npm run lint` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/componentes/ui tests/ui-base.test.tsx
git commit -m "feat(f12): componentes base (insignia, tarjeta de cifra, estado vacío, encabezado, tabla, botón, campo)"
```

---

### Tarea 7: `Dialogo` y `GraficoBarras` en `ui`

**Files:**
- Create: `src/componentes/ui/Dialogo.tsx` (`'use client'`)
- Move: `src/componentes/admin/estadisticas/GraficoBarras.tsx` → `src/componentes/ui/GraficoBarras.tsx`;
  `src/componentes/admin/estadisticas/geometria.ts` → `src/componentes/ui/geometria.ts`
- Modify: `src/app/(app)/admin/(panel)/estadisticas/page.tsx` (import), `tests/geometria.test.ts` (import)
- Test: `tests/ui-dialogo.test.tsx`

**Interfaces:**
- `Dialogo({ abierto, alCerrar, titulo, children, className }: { abierto: boolean; alCerrar: () => void; titulo: string; children: React.ReactNode; className?: string })`:
  `<dialog>` nativo con `aria-labelledby` a un `<h2>` (visualmente oculto si `className` lo pide);
  `useEffect` llama `showModal()` al abrir y `close()` al cerrar; `onClose` → `alCerrar`; clic sobre
  el propio `<dialog>` (fuera del contenido) cierra; `onCancel` (Escape) deja que el navegador cierre y
  llama `alCerrar`. El foco vuelve solo al elemento que lo abrió (comportamiento nativo de `showModal`).
- `GraficoBarras`: misma API; `fill-primary/70` pasa a `fill-mod-documentos`.

- [ ] **Step 1: Test** (`tests/ui-dialogo.test.tsx`): el render estático de
`<Dialogo abierto={false} alCerrar={() => {}} titulo="Buscar">x</Dialogo>` contiene `<dialog`,
`aria-labelledby` y el título; y `GraficoBarras` con una serie de dos puntos contiene `fill-mod-documentos`
y `role="img"`.

- [ ] **Step 2–4: Fallar, implementar/mover (`git mv`), pasar** — `npx vitest run tests/ui-dialogo.test.tsx tests/geometria.test.ts tests/estadisticas.test.ts && npm run lint`.

- [ ] **Step 5: Commit** — `git commit -m "feat(f12): Dialogo nativo y GraficoBarras con el color del módulo en ui"`.

---

### Tarea 8: El cascarón — navegación, barra lateral, barra superior, menú de usuario, pantalla centrada

**Files:**
- Create: `src/componentes/cascaron/navegacion.ts`, `IconoNav.tsx`, `ContenidoBarra.tsx`, `BarraLateral.tsx`,
  `BarraSuperior.tsx`, `Cascaron.tsx`, `PantallaCentrada.tsx`
- Move: `src/componentes/cuenta/MenuUsuario.tsx` → `src/componentes/cascaron/MenuUsuario.tsx` (reescrito)
- Delete: `src/componentes/EncabezadoSitio.tsx`, `src/componentes/admin/enlaces-panel.ts`
- Modify: `src/app/layout.tsx` (sin encabezado ni `div#contenido`), `src/app/(app)/layout.tsx`,
  `src/app/(app)/admin/(panel)/layout.tsx`, `src/app/(cuenta)/layout.tsx`, `src/app/ingreso/page.tsx`,
  `src/app/ingreso/verificar/page.tsx`, `src/app/acciones-cuenta.ts` (`cambiarTemaAccion`),
  `src/db/consultas/perfil.ts` (`guardarTema`), `tests/a11y-estructura.test.ts`
- Create: `src/lib/esquemas/entidad.ts` (`EsquemaTema`; las Tareas 10 y 13 añaden los suyos)
- Test: `tests/navegacion.test.ts`, `tests/cascaron.test.tsx`, `tests/acciones-permisos.test.ts` (automático),
  `tests/acciones-cuenta-cache.test.ts` (automático)

**Interfaces:**
- Consumes: `obtenerMarca` (T4), `misTareas` (T4), `contarNoLeidas`, `listarRecientes` (T4),
  `VERSION_APP` (T5), `Dialogo` (T7), `puede`/`SujetoPermiso` (`src/lib/permisos.ts`), `salir` (acciones-cuenta).
- Produces (`navegacion.ts`):
  - `export type IconoNav = "inicio" | "buscar" | "documentos" | "maestro" | "tipos" | "mapa" | "entidad" | "estructura" | "usuarios" | "estadisticas" | "bitacora" | "accesos" | "sesiones";`
  - `export type GrupoNav = "inicio" | "documentos" | "administracion";`
  - `export type EntradaNav = { href: string; etiqueta: string; icono: IconoNav; grupo: GrupoNav; permiso?: Permiso; exacta?: boolean };`
  - `export const GRUPOS: Record<GrupoNav, { etiqueta: string | null; color: "marca" | "mod-documentos" }>`
    (`inicio` sin etiqueta; `documentos` "Documentos" `mod-documentos`; `administracion` "Administración" `marca`).
  - `export const NAVEGACION: readonly EntradaNav[]` en este orden: Inicio `/` (exacta, inicio);
    Buscar documentos `/buscar` (documentos); Gestión de documentos `/admin` (documentos, exacta,
    `documentos.ver_historial`); Listado Maestro `/admin/maestro` (documentos, `maestro.ver`); Tipos de
    documento `/admin/tipos` (documentos, `mapa.administrar`); Mapa de procesos `/admin/mapa` (documentos,
    `mapa.administrar`); Entidad y marca `/admin/entidad` (administracion, `entidad.administrar`); Estructura
    `/admin/estructura` (`estructura.administrar`); Usuarios `/admin/usuarios` (`usuarios.administrar`);
    Estadísticas `/admin/estadisticas` (`estadisticas.ver`); Bitácora `/admin/bitacora` (`bitacora.ver`);
    Accesos `/admin/accesos` (`accesos.ver`); Sesiones `/admin/sesiones` (`sesiones.administrar`).
    **`entidad.administrar` no existe hasta la Tarea 11**: hasta entonces la entrada va con
    `permiso: "mapa.administrar"` y un `// TODO T11` que la Tarea 11 reemplaza (el test de T11 lo exige).
  - `export function entradasVisibles(sujeto: SujetoPermiso): EntradaNav[]` (sin permiso → visible).
  - `export function esActiva(entrada: EntradaNav, ruta: string): boolean` (`exacta` → igualdad; si no, igualdad o prefijo `href + "/"`).
- `IconoNav({ nombre, className })` (cliente o servidor; mapa `IconoNav` → lucide: `Home`, `Search`, `FileText`,
  `ListChecks`, `Tags`, `Map`, `Building2`, `Network`, `Users`, `ChartColumn`, `ScrollText`, `KeyRound`, `MonitorSmartphone`).
- `ContenidoBarra` (`'use client'`): props `{ marca: { nombre: string; sigla: string; logoUrl: string | null }; entradas: EntradaNav[]; tareas: number; version: string; alNavegar?: () => void }`;
  usa `usePathname` y `esActiva` para `aria-current="page"`; grupos con `<p>` de etiqueta; pie
  «SGC Integral · v{version}».
- `BarraLateral` (`'use client'`): `<aside class="hidden lg:flex w-60 … print:hidden">` con `ContenidoBarra`.
- `BarraSuperior` (`'use client'`): props `{ marca, entradas, tareas, version, buscador: React.ReactNode; campana: React.ReactNode; menuUsuario: React.ReactNode }`;
  botón "Abrir menú" (`lg:hidden`) que abre un `Dialogo` con `ContenidoBarra` (cierra al navegar);
  `<header class="sticky top-0 z-40 h-14 border-b-2 border-marca bg-card print:hidden">`.
- `MenuUsuario` (`'use client'`): props `{ nombre: string; etiquetaRol: string; tema: Tema }`; `<details>`
  como hoy; dentro: Mi cuenta, un `<form action={cambiarTemaAccion}>` con tres radios (`claro`, `oscuro`,
  `sistema`, etiquetas «Claro», «Oscuro», «Según el sistema») que envían al cambiar (`onChange` → `form.requestSubmit()`)
  y un botón "Aplicar" visible sin JavaScript, y el botón Salir (`salir`).
- `Cascaron` (servidor): `({ sesion, children }: { sesion: SesionValida; children: React.ReactNode })`:
  lee en paralelo `obtenerMarca()`, `misTareas(sesion)`, `contarNoLeidas`, `listarRecientes`; construye
  `entradasVisibles(sesion)`; `logoUrl = marca.logo ? \`/marca/logo?v=${marca.logo.version}\` : null`;
  pinta `<div class="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] min-h-dvh"><BarraLateral/><div><BarraSuperior … campana={<Campana …/>} buscador={<Buscador …/>} menuUsuario={<MenuUsuario …/>}/><main id="contenido" tabIndex={-1} class="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">{children}</main></div></div>`.
  **Hasta las Tareas 9 y 10**, `buscador` y `campana` son marcadores (`<div data-pendiente="buscador" />`,
  `<div data-pendiente="campana" />`) que esas tareas reemplazan.
- `PantallaCentrada` (servidor): `({ children, pie = true })` → `<main id="contenido" class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-4 py-8">` con logo o monograma
  (`<span class="bg-[var(--marca-2-relleno)] text-[var(--marca-2-contraste)]">{sigla}</span>`, el mismo monograma que `ContenidoBarra`), `<p class="font-display">{nombre}</p>`,
  los hijos y, si `pie`, «Plataforma SGC Integral» en `text-xs text-texto-terciario`.
- `cambiarTemaAccion(formData: FormData): Promise<void>` en `acciones-cuenta.ts`: `requerirSesion()`;
  `parsearFormulario(formData, EsquemaTema)` (`z.object({ tema: z.enum(TEMAS) }).strict()`);
  `UPDATE usuarios SET tema = $1 WHERE id = $2` (función `guardarTema(usuarioId, tema)` en
  `src/db/consultas/perfil.ts`); cookie `COOKIE_TEMA` (`httpOnly`, `sameSite: "lax"`, `maxAge: 31536000`,
  `secure` en producción, `path: "/"`); `revalidatePath("/", "layout")`; `redirect(rutaInterna(formData.get("volver"), "/"))`.
- Layouts: `(app)/layout.tsx` → `const sesion = await exigirSesion(); return <Cascaron sesion={sesion}>{children}</Cascaron>;`
  `(app)/admin/(panel)/layout.tsx` → solo `await exigirEntradaPanel(); return children;`
  `(cuenta)/layout.tsx` → `<PantallaCentrada>{children}</PantallaCentrada>` (mantiene sus redirecciones);
  `ingreso/page.tsx` y `ingreso/verificar/page.tsx` envuelven su contenido en `<PantallaCentrada>` y
  retiran su `<main>` y el texto fijo del hospital. El layout raíz deja solo `<a href="#contenido">` y `{children}`.
- `tests/a11y-estructura.test.ts`: `id="contenido"` se exige en `Cascaron.tsx` y `PantallaCentrada.tsx`
  (no en el layout raíz); el enlace y el texto siguen en `layout.tsx`.

- [ ] **Step 1: Tests que fallan**

`tests/navegacion.test.ts`:

```ts
it("consulta ve Inicio y Buscar; admin ve las trece", () => {
  expect(entradasVisibles({ rol: "consulta" }).map((e) => e.href)).toEqual(["/", "/buscar"]);
  expect(entradasVisibles({ rol: "admin_sgc" })).toHaveLength(13);
});
it("gerencia no ve Gestión de documentos pero sí Listado Maestro y Estadísticas", () => {
  const hrefs = entradasVisibles({ rol: "gerencia" }).map((e) => e.href);
  expect(hrefs).not.toContain("/admin"); expect(hrefs).toContain("/admin/maestro"); expect(hrefs).toContain("/admin/estadisticas");
});
it("la marca ver_historial abre Gestión de documentos a consulta", () => {
  expect(entradasVisibles({ rol: "consulta", verHistorial: true }).map((e) => e.href)).toContain("/admin");
});
it("esActiva: Inicio y Gestión son exactas; Usuarios por prefijo", () => {
  const por = (href: string) => NAVEGACION.find((e) => e.href === href)!;
  expect(esActiva(por("/"), "/buscar")).toBe(false); expect(esActiva(por("/admin"), "/admin/usuarios")).toBe(false);
  expect(esActiva(por("/admin/usuarios"), "/admin/usuarios/5")).toBe(true);
});
```

`tests/cascaron.test.tsx` (render estático de componentes cliente con props):

```tsx
it("ContenidoBarra marca la ruta activa, agrupa y pinta el pie con la versión", () => {
  vi.mock("next/navigation", () => ({ usePathname: () => "/admin/usuarios/5" }));
  const h = renderToStaticMarkup(<ContenidoBarra marca={{ nombre: "Hospital X", sigla: "HX", logoUrl: null }} entradas={entradasVisibles({ rol: "admin_sgc" })} tareas={0} version="0.1.0" />);
  expect(h).toMatch(/aria-current="page"[^>]*href="\/admin\/usuarios"|href="\/admin\/usuarios"[^>]*aria-current="page"/);
  expect(h).toContain("Documentos"); expect(h).toContain("Administración"); expect(h).toContain("SGC Integral · v0.1.0");
  expect(h).toContain("HX"); // monograma sin logo
});
it("sin tareas no hay contador; con 3, lo muestra", () => {
  expect(renderToStaticMarkup(<ContenidoBarra … tareas={0} />)).not.toContain('data-contador');
  expect(renderToStaticMarkup(<ContenidoBarra … tareas={3} />)).toContain('data-contador="3"');
});
it("MenuUsuario ofrece los tres temas con el actual marcado", () => {
  const h = renderToStaticMarkup(<MenuUsuario nombre="Ana" etiquetaRol="Gerencia" tema="oscuro" />);
  expect(h).toContain("Según el sistema"); expect(h).toMatch(/value="oscuro"[^>]*checked=""/);
});
```

- [ ] **Step 2: Correr y ver fallar** — `npx vitest run tests/navegacion.test.ts tests/cascaron.test.tsx` → FAIL.

- [ ] **Step 3: Implementar** `navegacion.ts`, `IconoNav`, `ContenidoBarra`, `BarraLateral`, `BarraSuperior`,
`MenuUsuario`, `Cascaron`, `PantallaCentrada`, `cambiarTemaAccion` + `guardarTema` + `EsquemaTema`; layouts;
borrar `EncabezadoSitio.tsx` y `enlaces-panel.ts`; ajustar `tests/a11y-estructura.test.ts`.
Consultar `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md` para `cookies().set` en la acción.

- [ ] **Step 4: Verificar**

Run: `npx vitest run tests/navegacion.test.ts tests/cascaron.test.tsx tests/paginas-sesion.test.ts tests/acciones-permisos.test.ts tests/acciones-cuenta-cache.test.ts tests/a11y-estructura.test.ts && npm run lint && npm test` → verde.
Run: `npm run build` → correcto.
Run manual (`npm run dev`): entrar con `gerente` / `Demo-SGC-2026-clave`: barra lateral con Inicio,
Documentos (Buscar, Listado Maestro), Administración (Estadísticas) y el pie; navegar de Inicio a
Listado Maestro **sin que la barra parpadee**; menú de usuario → Oscuro: la página cambia y al
recargar sigue oscura; `/ingreso` tras salir también oscuro; a 390 px el botón de menú abre el cajón
y Escape lo cierra devolviendo el foco al botón.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(f12): cascarón con barra lateral por módulos y rol, barra superior, menú de usuario con tema y pantalla centrada"
```

**→ Punto de control 1** (controlador): recorrido rápido en el navegador con `admin`, `gerente` y
`consulta`; captura en claro y oscuro de Inicio y del Listado Maestro.

---

### Tarea 9: Búsqueda global `Ctrl K`

**Files:**
- Create: `src/app/api/buscar/route.ts`, `src/componentes/cascaron/Buscador.tsx`
- Modify: `src/componentes/cascaron/Cascaron.tsx` (reemplaza el marcador), `src/db/consultas/busqueda.ts`
  (solo si `limite` no se respeta hoy)
- Test: `tests/handlers-permisos.test.ts` (casos de `/api/buscar`), `tests/buscador-rapido.test.ts`

**Interfaces:**
- Consumes: `buscarDocumentos({ q, limite })`, `MARCA_INICIO`/`MARCA_FIN`, `TextoResaltado`, `Dialogo`, `EntradaNav`, `IconoNav`.
- Produces:
  - `GET /api/buscar?q=…` → `200 { resultados: Array<{ codigo: string; titulo: string; tituloResaltado: string | null; tipo: string; ruta: string }> }`
    (`ruta` = `/documentos/<codigo en minúsculas>`; `tipo` = sigla); `401` sin sesión completa; `429` al superar
    60/min por usuario (`crearLimitador({ limite: 60, ventanaMs: 60_000 })` por `usuarioId`); `q` se recorta a
    **120** caracteres y se le quitan `⟦` y `⟧` (`export function normalizarConsulta(q: string): string` en el
    mismo archivo o en `src/lib/busqueda-rapida.ts`); menos de 2 caracteres → `{ resultados: [] }` sin tocar la BD;
    `limite: 8`; `export const dynamic = "force-dynamic"`.
  - `Buscador` (`'use client'`): props `{ entradas: EntradaNav[] }`. Botón con apariencia de campo
    («Buscar…» y `<kbd>Ctrl K</kbd>`, solo ícono bajo `sm`). Escucha `keydown` global: `(ctrlKey || metaKey) && key === "k"`
    → `preventDefault` y abre. `Dialogo` con `<input role="combobox" aria-expanded aria-controls aria-activedescendant>`;
    sección «Ir a» (entradas cuyo `etiqueta` contenga el texto sin acentos ni mayúsculas) y sección «Documentos»
    (desde 2 caracteres, 200 ms de espera, `fetch("/api/buscar?q=")`, `AbortController` por tecleo); lista
    `role="listbox"` con `role="option"`; flechas ↑↓, Enter navega (`router.push`), Escape cierra; última opción
    «Ver todos los resultados de “q”» → `/buscar?q=`. Estado vacío: «Sin coincidencias». Error de red: «No se pudo buscar; intente de nuevo».

- [ ] **Step 1: Tests que fallan**

En `tests/handlers-permisos.test.ts`:

```ts
describe("GET /api/buscar", () => {
  it("401 sin sesión", async () => expect((await buscarApi(new NextRequest("http://x/api/buscar?q=acta"))).status).toBe(401));
  it("devuelve hasta 8 vigentes con ruta a la ficha", async () => {
    const r = await buscarApi(new NextRequest("http://x/api/buscar?q=acta", { headers: cookie(tokenConsulta) }));
    const { resultados } = await r.json();
    expect(resultados.length).toBeGreaterThan(0); expect(resultados.length).toBeLessThanOrEqual(8);
    expect(resultados[0].ruta).toMatch(/^\/documentos\/[a-z0-9-]+$/);
  });
  it("menos de dos caracteres: lista vacía", async () => {
    expect((await (await buscarApi(new NextRequest("http://x/api/buscar?q=a", { headers: cookie(tokenConsulta) }))).json()).resultados).toEqual([]);
  });
});
```

`tests/buscador-rapido.test.ts`: `normalizarConsulta("⟦acta⟧ " + "x".repeat(300))` tiene 120
caracteres y no contiene `⟦`.

- [ ] **Step 2–3: Fallar, implementar.** **Step 4: Verificar** — `npx vitest run tests/handlers-permisos.test.ts tests/buscador-rapido.test.ts && npm run lint && npm test`;
manual: `Ctrl K`, «induc» lista documentos, Enter abre la ficha; «usuarios» ofrece la sección solo al admin.

- [ ] **Step 5: Commit** — `git commit -m "feat(f12): búsqueda global con Ctrl K y handler /api/buscar"`.

---

### Tarea 10: Campana y acciones de notificaciones

**Files:**
- Create: `src/componentes/cascaron/Campana.tsx` (servidor)
- Modify: `src/app/acciones-cuenta.ts` (`marcarNotificacionLeidaAccion`, `marcarNotificacionesLeidasAccion`),
  `src/lib/esquemas/entidad.ts` (`EsquemaIdNotificacion`), `src/componentes/cascaron/Cascaron.tsx`
- Test: `tests/notificaciones-acciones.test.ts`

**Interfaces:**
- Consumes: `listarRecientes`, `contarNoLeidas`, `marcarLeida`, `marcarTodasLeidas` (T4); `fechaHoraLocal` o un
  `tiempoRelativo(fecha, ahora)` nuevo en `src/lib/zona-horaria.ts` («hace 5 min», «hace 2 h», «ayer», fecha corta).
- Produces:
  - `Campana({ noLeidas, recientes }: { noLeidas: number; recientes: Notificacion[] })`: `<details>` con
    `<summary aria-label="Notificaciones, N sin leer">` (ícono `Bell`, contador «9+» si > 9, oculto si 0); lista de
    `recientes`, cada una `<form action={marcarNotificacionLeidaAccion}>` con `<input type="hidden" name="id">` y un
    botón con título, cuerpo y tiempo relativo (`font-medium` si no leída); al pie «Marcar todas como leídas»
    (`<form action={marcarNotificacionesLeidasAccion}>`), visible solo si `noLeidas > 0`; estado vacío
    «Sin notificaciones. Aquí verá los avisos del sistema y las tareas que le asignen.».
  - `marcarNotificacionLeidaAccion(formData: FormData): Promise<void>`: `requerirSesion()`;
    `parsearFormulario(formData, EsquemaIdNotificacion)` (`z.object({ id: z.coerce.number().int().positive() }).strict()`);
    `const enlace = await marcarLeida(id, sesion.usuarioId)`; `revalidatePath("/", "layout")`;
    `redirect(rutaInterna(enlace, "/"))`.
  - `marcarNotificacionesLeidasAccion(formData: FormData): Promise<void>`: `requerirSesion()`; `marcarTodasLeidas`;
    `revalidatePath("/", "layout")`; `redirect(rutaInterna(formData.get("volver"), "/"))`.
  - Función pura `destinoNotificacion(enlace: string | null): string` = `rutaInterna(enlace, "/")` (test del Review Focus 2).

- [ ] **Step 1: Tests que fallan** (`tests/notificaciones-acciones.test.ts`):

```ts
it("un enlace externo o javascript: cae a /", () => {
  expect(destinoNotificacion("https://ejemplo.com/x")).toBe("/");
  expect(destinoNotificacion("javascript:alert(1)")).toBe("/");
  expect(destinoNotificacion("//evil")).toBe("/");
  expect(destinoNotificacion("/documentos/pr-gth-001")).toBe("/documentos/pr-gth-001");
});
it("tiempoRelativo", () => {
  const ahora = new Date("2026-11-04T15:00:00Z");
  expect(tiempoRelativo(new Date("2026-11-04T14:55:00Z"), ahora)).toBe("hace 5 min");
  expect(tiempoRelativo(new Date("2026-11-04T12:00:00Z"), ahora)).toBe("hace 3 h");
  expect(tiempoRelativo(new Date("2026-11-03T15:00:00Z"), ahora)).toBe("ayer");
});
it("Campana vacía muestra el texto y sin contador", () => {
  const h = renderToStaticMarkup(<Campana noLeidas={0} recientes={[]} />);
  expect(h).toContain("Sin notificaciones"); expect(h).not.toContain("Marcar todas");
});
```

- [ ] **Step 2–3: Fallar, implementar.** **Step 4: Verificar** — tests de la tarea +
`tests/acciones-permisos.test.ts` + `tests/acciones-cuenta-cache.test.ts` + `npm run lint && npm test`;
manual con `gerente` (la demo trae la bienvenida): contador 1 → abrir → pulsar → va a `/cuenta` y el contador baja a 0.

- [ ] **Step 5: Commit** — `git commit -m "feat(f12): campana de notificaciones con marcar leídas"`.

---

### Tarea 11: Inicio con «Mis tareas», mapa dentro del cascarón y colores del mapa para el tema oscuro

**Files:**
- Create: `src/componentes/inicio/MisTareas.tsx`
- Modify: `src/app/(app)/page.tsx`, `src/app/(app)/loading.tsx`, `src/componentes/mapa/{Banda,TarjetaProceso,AcordeonMapa,RailPeriferico,MapaProcesos}.tsx`,
  `src/app/(app)/procesos/[slug]/page.tsx`, `src/app/(app)/procesos/[slug]/[sub]/page.tsx`,
  `src/app/(app)/documentos/[codigo]/page.tsx`, `src/componentes/MisProcesos.tsx` (solo clases)
- Test: `tests/inicio.test.tsx`, `tests/mapa-oscuro.test.ts`

**Interfaces:**
- Consumes: `misTareas`, `Tarea` (T4), `Insignia`, `EstadoVacio`, `EncabezadoPagina` (T6), `obtenerMarca` (T4), clases `banda-tinte`, `banda-texto`, `banda-borde` (T5).
- Produces:
  - `MisTareas({ tareas, ahora }: { tareas: Tarea[]; ahora?: Date })`: `<section aria-labelledby="mis-tareas-titulo">`
    con `<h2>Mis tareas</h2>` y el conteo; lista con marca lateral `bg-mod-<modulo>`, título, detalle e insignia de
    vencimiento (`vence < ahora` → `critico` «Vencida»; mismo día → `atencion` «Vence hoy»; si no, `neutra` con la
    fecha corta); vacío → `EstadoVacio` con `ClipboardCheck`, «No tiene tareas pendientes», «Cuando un documento
    necesite su revisión o aprobación, aparecerá aquí.».
  - `(app)/page.tsx`: `exigirSesion()`; `EncabezadoPagina` con `superior={marca.nombre}`, `titulo="Inicio"`,
    `descripcion={configuracion.subtitulo_mapa}`; luego `<MisTareas>`, `MisProcesos` (líder) y la sección del
    mapa con `<h2 class="sr-only">Mapa de procesos</h2>` (escritorio `lg:block`, acordeón `lg:hidden`); sin `<main>`.
  - Mapa: todos los `color-mix(... white)` y `color-mix(... black)` de los cinco componentes y las tres páginas
    pasan a las clases `banda-tinte` / `banda-texto` / `banda-borde` (la `Banda` conserva el `--color-banda` y el
    `--indice-banda` en `style`); el fondo de la banda `color-mix(… 4%, white)` → `color-mix(… 4%, var(--background))`.
    `RailPeriferico` y el acordeón usan hoy una variable propia `--acento` para el mismo papel: pasa a llamarse
    `--color-banda` donde se define (el `style` del contenedor), de modo que las mismas tres clases les sirvan.

- [ ] **Step 1: Tests que fallan**

`tests/inicio.test.tsx`:

```tsx
it("MisTareas vacío dice qué pasará ahí", () => {
  const h = renderToStaticMarkup(<MisTareas tareas={[]} />);
  expect(h).toContain("No tiene tareas pendientes"); expect(h).toContain("aparecerá aquí");
});
it("una tarea vencida lleva insignia crítica con texto", () => {
  const h = renderToStaticMarkup(<MisTareas ahora={new Date("2026-11-04T12:00:00Z")} tareas={[{ id: "doc:1", modulo: "documentos", titulo: "Aprobar PR-GTH-012 v3", detalle: null, vence: new Date("2026-11-01T00:00:00Z"), enlace: "/admin" }]} />);
  expect(h).toContain("Vencida"); expect(h).toContain('data-variante="critico"'); expect(h).toContain("bg-mod-documentos");
});
```

`tests/mapa-oscuro.test.ts` (estructural): ningún archivo de `src/componentes/mapa/` ni de
`src/app/(app)/procesos/`, `src/app/(app)/documentos/` contiene `color-mix(` con `var(--color-banda)` o `var(--acento)`
seguido de `white)` o `black)` (en `style` o en clases arbitrarias con `_white)]` / `_black)]`), ni la variable `--acento`;
`src/app/(app)/page.tsx` contiene `<MisTareas` y no contiene `<main`.

- [ ] **Step 2–3: Fallar, implementar.** **Step 4: Verificar** — tests de la tarea + `npm run lint && npm test`;
manual en oscuro: las bandas conservan su color, los tintes no son blancos, el texto de las bandas se lee; con
`lider.gth` aparece «Mis procesos»; a 390 px el acordeón.

- [ ] **Step 5: Commit** — `git commit -m "feat(f12): Inicio con Mis tareas y mapa; colores del mapa derivados de la superficie para el tema oscuro"`.

---

### Tarea 12: Permiso `entidad.administrar`, validación del logo y handlers (`/admin/api/entidad/logo`, `/marca/logo`)

**Files:**
- Modify: `src/lib/permisos.ts`, `tests/permisos.test.ts`, `src/componentes/cascaron/navegacion.ts` (quitar el TODO),
  `src/proxy.ts` (`RUTAS_PUBLICAS` + `/marca/logo`), `tests/proxy-matcher.test.ts`
- Create: `src/lib/logo.ts`, `src/app/admin/api/entidad/logo/route.ts`, `src/app/marca/logo/route.ts`
- Test: `tests/logo.test.ts`, `tests/handlers-permisos.test.ts`, `tests/permisos.test.ts`, `tests/navegacion.test.ts`

**Interfaces:**
- Consumes: `guardarLogo`, `quitarLogo`, `obtenerMarca` (T4); `fileTypeFromBuffer` (`file-type`);
  `rutaBaseAlmacen`, `resolverRutaAlmacen`; `sesionDePeticion`, `puede`, `origenValido`.
- Produces:
  - `Permiso` gana `"entidad.administrar"` → `["admin_sgc"]` (matriz y `ESPERADA` del test).
  - `src/lib/logo.ts`: `export const LOGO_MAX_BYTES = 1_048_576; export const LOGO_MIN_LADO = 64; export const LOGO_MAX_LADO = 2048;`
    `export const LOGO_MIMES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const; export type MimeLogo = keyof typeof LOGO_MIMES;`
    `export function dimensionesImagen(bytes: Uint8Array, mime: MimeLogo): { ancho: number; alto: number } | null`
    (PNG: ancho/alto big-endian en los bytes 16–23; JPEG: recorre segmentos desde el byte 2 hasta un SOF `0xC0–0xCF`
    salvo `C4`, `C8`, `CC`, alto en +5 y ancho en +7; WebP: `VP8 ` → `LE16 & 0x3fff` en 26 y 28; `VP8L` → bits
    desde el byte 21; `VP8X` → 3 bytes LE en 24 y 27, más uno).
    `export type ResultadoLogo = { ok: true; mime: MimeLogo; extension: string; ancho: number; alto: number; version: string } | { ok: false; error: string };`
    `export async function validarLogo(bytes: Uint8Array): Promise<ResultadoLogo>` — errores exactos:
    «El logo supera 1 MB»; «El logo debe ser PNG, JPG o WebP» (MIME detectado fuera de la lista o sin detectar);
    «El logo debe medir entre 64 y 2048 píxeles por lado (recibido 32 × 32)»; `version` = 8 hex del SHA-256.
  - `POST /admin/api/entidad/logo`: `sesionDePeticion` → 401 `{ error: "No autorizado" }`; `puede(sesion, "entidad.administrar")` → 403 `{ error: "Sin permiso" }`;
    `origenValido` → 403 `{ error: "Origen no permitido" }`; `Content-Length` > `LOGO_MAX_BYTES + 65_536` → 413 `{ error: "El logo supera 1 MB" }`
    **antes de leer el cuerpo**; `formData().get("archivo")` que no sea `File` → 400 `{ error: "Falta el archivo" }`;
    `validarLogo` → 400 `{ error }`; escribe `marca/logo-<version>.<ext>` (crea la carpeta); `guardarLogo(...)`;
    si `rutaAnterior` no es nula la borra con `unlink` (ignorando ENOENT); 200 `{ ok: true, version }`.
    `DELETE`: mismas tres comprobaciones; `quitarLogo`; borra el archivo; 200 `{ ok: true }`.
  - `GET /marca/logo`: pública (proxy); `obtenerMarca().logo` nulo → 404; lee la ruta y el MIME de `configuracion`,
    `resolverRutaAlmacen` (nulo → 404), `readFile`; cabeceras `Content-Type: <mime>`, `X-Content-Type-Options: nosniff`,
    `Content-Disposition: inline; filename="logo.<ext>"`, `Cache-Control: public, max-age=86400`; `export const dynamic = "force-dynamic"`.
  - `RUTAS_PUBLICAS = ["/ingreso", "/api/salud", "/marca/logo"]`.

- [ ] **Step 1: Tests que fallan**

`tests/permisos.test.ts`: fila `"entidad.administrar": ["admin_sgc"]` en `ESPERADA`.
`tests/navegacion.test.ts`: la entrada `/admin/entidad` tiene `permiso: "entidad.administrar"` y `entradasVisibles({ rol: "control_interno" })` no la incluye.
`tests/proxy-matcher.test.ts`: `/marca/logo` está en `RUTAS_PUBLICAS` y `esPublica`-equivalente (importar `RUTAS_PUBLICAS` y comprobar que incluye `/marca/logo`; una petición sin cookie a `/marca/logo` no redirige).
`tests/logo.test.ts` (con un helper `pngDePrueba(ancho, alto)` que arma un PNG real con `zlib.deflateSync`, y cabeceras JPEG/WebP mínimas):

```ts
it("acepta un PNG de 64×64 y devuelve versión de 8 hex", async () => {
  const r = await validarLogo(pngDePrueba(64, 64));
  expect(r).toMatchObject({ ok: true, mime: "image/png", extension: "png", ancho: 64, alto: 64 }); expect((r as { version: string }).version).toMatch(/^[0-9a-f]{8}$/);
});
it("rechaza SVG, PDF y bytes sin tipo", async () => {
  expect(await validarLogo(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toEqual({ ok: false, error: "El logo debe ser PNG, JPG o WebP" });
  expect(await validarLogo(new TextEncoder().encode("%PDF-1.4 …"))).toEqual({ ok: false, error: "El logo debe ser PNG, JPG o WebP" });
});
it("rechaza más de 1 MB y dimensiones fuera de rango", async () => {
  expect(await validarLogo(new Uint8Array(LOGO_MAX_BYTES + 1))).toEqual({ ok: false, error: "El logo supera 1 MB" });
  expect(await validarLogo(pngDePrueba(32, 32))).toEqual({ ok: false, error: "El logo debe medir entre 64 y 2048 píxeles por lado (recibido 32 × 32)" });
  expect((await validarLogo(pngDePrueba(4096, 64))).ok).toBe(false);
});
it("lee dimensiones de cabeceras JPEG (SOF0) y WebP (VP8X)", () => {
  expect(dimensionesImagen(jpegCabecera(300, 200), "image/jpeg")).toEqual({ ancho: 300, alto: 200 });
  expect(dimensionesImagen(webpVp8xCabecera(128, 96), "image/webp")).toEqual({ ancho: 128, alto: 96 });
});
```

En `tests/handlers-permisos.test.ts` (actor admin `zz_admin_logo_${ts}` con `rol admin_sgc`; `FormData` con `new File([png], "logo.png", { type: "image/png" })`; cabeceras `cookie` + `origin: http://x` + `host: x`):

```ts
it("POST logo: 401 sin sesión, 403 consulta, 403 con Origin ajeno, 413 por Content-Length, 200 admin", …);
it("subir dos veces el mismo PNG conserva el archivo y la versión", async () => { /* Review Focus 3: tras el segundo POST, existsSync(ruta) sigue true */ });
it("GET /marca/logo sirve el logo con nosniff y 404 tras DELETE", …);
```

Al terminar, el test restaura el logo de la demo (vuelve a subir `src/db/semillas/recursos/logo-demo.png`).

- [ ] **Step 2–3: Fallar, implementar.** **Step 4: Verificar** — `npx vitest run tests/permisos.test.ts tests/navegacion.test.ts tests/proxy-matcher.test.ts tests/logo.test.ts tests/handlers-permisos.test.ts && npm run lint && npm test`.

- [ ] **Step 5: Commit** — `git commit -m "feat(f12): permiso de entidad, validación del logo por bytes y dimensiones, handlers de subida y servicio público del logo"`.

---

### Tarea 13: Pantalla «Entidad y marca» y «Textos del mapa»

**Files:**
- Create: `src/app/admin/acciones-entidad.ts`, `src/app/(app)/admin/(panel)/entidad/page.tsx`,
  `src/componentes/admin/entidad/{FormularioEntidad,VistaPreviaMarca,CargaLogo}.tsx`
- Modify: `src/lib/esquemas/entidad.ts` (añade `EsquemaEntidad`), `src/app/(app)/admin/(panel)/mapa/textos/page.tsx`
  (título y descripción), `src/componentes/admin/mapa/FormularioTextos.tsx` (sin cambios de API)
- Test: `tests/esquemas-entidad.test.ts`, `tests/acciones-permisos.test.ts` (automático), `tests/paginas-sesion.test.ts` (automático)

**Interfaces:**
- Consumes: `guardarEntidad`, `obtenerEntidad`, `obtenerMarca` (T4); `derivarMarca`, `validarMarca`, `formatearRazon` (T3);
  `Campo`, `Boton`, `EncabezadoPagina` (T6); `mutacion`.
- Produces:
  - `EsquemaEntidad = z.object({ nombre_entidad: z.string().trim().min(3).max(120), sigla_entidad: z.string().trim().min(2).max(12), lema: z.string().trim().max(200), aviso_datos_personales: z.string().trim().max(5000), color_primario: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color inválido").transform((v) => v.toLowerCase()), color_secundario: ídem }).strict()`.
  - `guardarEntidadAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion>` →
    `mutacion(formData, "entidad.administrar", async (usuarioId) => { const d = parsearFormulario(formData, EsquemaEntidad); await guardarEntidad({ nombre: d.nombre_entidad, sigla: d.sigla_entidad, lema: d.lema, avisoDatosPersonales: d.aviso_datos_personales, primario: d.color_primario, secundario: d.color_secundario }, usuarioId); return "/admin/entidad?guardado=1"; })`.
  - Página `/admin/entidad`: `exigirPermiso("entidad.administrar")`; `EncabezadoPagina titulo="Entidad y marca" superior="Administración" descripcion="Nombre, logo y colores que ven todas las personas."`;
    dos columnas en `lg`: izquierda `FormularioEntidad` (seis `Campo`; los colores con `<input type="color">` más un
    `<input>` de texto hex sincronizados; `useActionState(guardarEntidadAccion)`; error bajo el formulario y
    `?guardado=1` → «Cambios guardados» con `role="status"`), derecha `VistaPreviaMarca` y `CargaLogo`.
  - `VistaPreviaMarca({ primario, secundario, sigla, nombre }: {...})` (`'use client'`): recalcula `derivarMarca` y
    `validarMarca` al cambiar; pinta una mini barra lateral con el monograma y un botón «Guardar» en claro y en
    oscuro (`style` con las variables derivadas), y bajo cada color una línea «Texto blanco: 5,1:1 · cumple» / «no cumple».
  - `CargaLogo({ logo }: { logo: { version: string; mime: string } | null })` (`'use client'`): muestra
    `/marca/logo?v=` si hay; `<input type="file" accept="image/png,image/jpeg,image/webp">`; aviso previo si el
    archivo pesa más de 1 MB («El archivo pesa 3,1 MB; el máximo es 1 MB.») **y además** envía y muestra el error
    del servidor; `fetch("/admin/api/entidad/logo", { method: "POST", body })` / `DELETE`; mensaje `role="status"`;
    `router.refresh()` al terminar.
  - `/admin/mapa/textos`: título «Textos del mapa y código de documentos», descripción «Nombre, lema y aviso de
    datos personales se editan en Administración → Entidad y marca.».

- [ ] **Step 1: Tests que fallan** (`tests/esquemas-entidad.test.ts`):

```ts
it("normaliza el hex a minúsculas y rechaza #fff", () => {
  const ok = EsquemaEntidad.parse({ nombre_entidad: "Hospital X", sigla_entidad: "HX", lema: "", aviso_datos_personales: "", color_primario: "#1B4E8E", color_secundario: "#2E9B47" });
  expect(ok.color_primario).toBe("#1b4e8e");
  expect(() => EsquemaEntidad.parse({ …, color_primario: "#fff" })).toThrow(/Color inválido/);
  expect(() => EsquemaEntidad.parse({ …, sigla_entidad: "H" })).toThrow();
  expect(() => EsquemaEntidad.parse({ …, extra: "x" })).toThrow();
});
```

- [ ] **Step 2–3: Fallar, implementar.** **Step 4: Verificar** — tests + `npm run lint && npm test`; manual como `admin`:
cambiar la sigla y guardar → la barra lateral y la pestaña cambian; primario `#9ecbff` → rechazado con sugerencia; la
sugerencia se guarda; subir `logo-demo.png` → aparece; subir un `.svg` renombrado → «El logo debe ser PNG, JPG o WebP».

- [ ] **Step 5: Commit** — `git commit -m "feat(f12): pantalla Entidad y marca con vista previa, validación de contraste y carga del logo"`.

**→ Punto de control 2** (controlador): demostración 1 a 4 del spec §14 en el navegador.

---

### Tarea 14: Migración de listas, estadísticas y Listado Maestro a los componentes base

**Files:**
- Modify: `src/app/(app)/admin/(panel)/page.tsx`, `usuarios/page.tsx`, `sesiones/page.tsx`, `accesos/page.tsx`,
  `bitacora/page.tsx`, `maestro/page.tsx`, `maestro/excel/route.ts`, `estadisticas/page.tsx`,
  `documentos/[codigo]/page.tsx` (admin), `src/componentes/documentos/TarjetaDocumento.tsx` (si usa estados),
  `tests/a11y-estructura.test.ts`
- Delete: `src/componentes/admin/EstadoBadge.tsx`
- Test: `tests/a11y-estructura.test.ts`, `tests/migracion-listas.test.ts`

**Interfaces:**
- Consumes: `TablaDatos`, `celda`, `celdaNumerica`, `InsigniaEstadoDocumento`, `Insignia`, `TarjetaCifra`, `EncabezadoPagina`, `Boton`/`claseBoton` (T6); `obtenerMarca` (T4).
- Produces: las seis listas usan `TablaDatos` con `titulo`, `columnas`, `filas` y `vacio` («Sin documentos», «Sin usuarios que coincidan», «Sin sesiones activas», «Sin registros en el periodo», «Sin movimientos registrados», «Sin documentos en el listado»);
  los encabezados usan `EncabezadoPagina` con las acciones existentes (`Link` con `claseBoton("primario")`); `EstadoBadge` → `InsigniaEstadoDocumento`;
  Estadísticas: `TarjetaCifra` para Vistas y Descargas; Listado Maestro: `<p>` superior con `marca.nombre` (pantalla e impresión) y
  `hospital: marca.nombre` en el Excel; ninguna de estas páginas conserva `<main>` (el cascarón lo aporta).
- `tests/a11y-estructura.test.ts`: la aserción de tabla desplazable pasa a comprobar que `maestro/page.tsx` y `bitacora/page.tsx`
  usan `<TablaDatos` y que `src/componentes/ui/TablaDatos.tsx` tiene `role="region"`, `tabIndex={0}` y `aria-label`.

- [ ] **Step 1: Test estructural que falla** (`tests/migracion-listas.test.ts`): las seis páginas contienen `<TablaDatos`;
ninguna contiene `<table` ni `EstadoBadge`; `src/componentes/admin/EstadoBadge.tsx` no existe; `maestro/excel/route.ts` no contiene «Fátima».

- [ ] **Step 2–3: Fallar, implementar.** **Step 4: Verificar** — `npm run lint && npm test`; manual: las seis listas en claro y oscuro;
imprimir el Listado Maestro (vista previa del navegador) sin barras y con el nombre de la entidad.

- [ ] **Step 5: Commit** — `git commit -m "feat(f12): listas del panel, estadísticas y Listado Maestro sobre los componentes base; sin textos fijos de la entidad"`.

---

### Tarea 15: Barrido de las páginas restantes, impresión y tema oscuro

**Files:**
- Modify: todas las `page.tsx` de `src/app/(app)/**` que aún tengan `<main`, `mx-auto max-w-*` de página completa, o un `h1` sin `EncabezadoPagina`;
  `src/app/(app)/**/loading.tsx`; `src/componentes/admin/{FormAccion,ZonaCarga}.tsx`, `src/componentes/admin/usuarios/{ClaveTemporal,FormularioLote}.tsx`,
  `src/componentes/cuenta/*.tsx`, `src/componentes/mapa/*.tsx`, `src/app/(app)/sin-acceso/page.tsx`, `src/app/ingreso/*.tsx`
  (clases fijas `bg-white`, `text-gray-*`, `bg-red-*`, `text-red-*`, `bg-amber-*`, `text-amber-*`, `bg-green-*`, `text-green-*` → tokens de estado);
  `src/app/globals.css` (`@media print` si falta algo)
- Test: `tests/textos-fijos.test.ts`, `tests/colores-fijos.test.ts`, `tests/sin-main.test.ts`

**Interfaces:**
- Consumes: `EncabezadoPagina`, `Insignia`, `claseBoton` (T6).
- Produces: ninguna página de `src/app/(app)/**`, `src/app/(cuenta)/**` ni `src/app/ingreso/**` renderiza `<main`
  (lo aportan `Cascaron` y `PantallaCentrada`); ningún `.tsx` de `src/` usa `bg-white`, `border-white` ni las clases
  `(bg|text|border)-(gray|red|amber|green)-<n>` de Tailwind (los avisos pasan a `bg-estado-atencion-fondo text-estado-atencion-texto`,
  los peligros a `critico`, los éxitos a `bien`; `text-white` sobre rellenos de marca se conserva);
  ningún `.ts`/`.tsx` de `src/` fuera de `src/db/semillas/demo.ts` contiene «SGC Documental», «Nuestra Señora de Fátima» ni «Hospital de Suaza».

- [ ] **Step 1: Tres tests estructurales que fallan** (`readdirSync` recursivo sobre `src`):
`tests/textos-fijos.test.ts` (las tres cadenas, excepción `src/db/semillas/demo.ts`); `tests/colores-fijos.test.ts`
(regex `\b(bg|border)-white\b|\b(bg|text|border)-(gray|red|amber|green)-\d+\b` sobre `.tsx`); `tests/sin-main.test.ts`
(`<main` ausente en `src/app/(app)/**/page.tsx`, `src/app/(cuenta)/**/page.tsx` y `src/app/ingreso/**/page.tsx`).

- [ ] **Step 2–3: Fallar, corregir archivo por archivo** (lista inicial: `grep -rln "<main\|bg-white\|text-gray-\|bg-red-\|text-red-\|bg-amber-\|text-amber-\|text-green-\|Fátima\|SGC Documental" src`).
Los `loading.tsx` quitan el envoltorio de ancho. Verificar `@media print` en el Listado Maestro.

- [ ] **Step 4: Verificar** — `npm run lint && npm test && npm run build`; manual en oscuro: `/admin/usuarios/nuevo` tras crear
(clave temporal legible), `/admin/documentos/<código>` (marca «OBSOLETO» visible), `/cuenta`, `/ingreso` con un fallo, 390 px en
Inicio, un proceso y una lista.

- [ ] **Step 5: Commit** — `git commit -m "feat(f12): todas las páginas dentro del cascarón; colores de estado por tokens; sin textos fijos de la entidad"`.

---

### Tarea 16: Documentación de cierre y recorrido de demostración

**Files:**
- Create: `docs/manual/usuario/03-conocer-la-plataforma.md`, `docs/manual/usuario/04-configurar-la-marca-de-la-entidad.md`
- Modify: `CONTEXT.md`, `PLAN.md` (fila 12 ✅), `AGENTS.md` (si alguna regla durable salió de la fase: `light-dark()` y `data-tema`; componentes base en `src/componentes/ui`; ruta pública `/marca/logo`), `README.md` (variables y comandos si cambiaron: `db:migrate` ahora comprueba duplicados)

- [ ] **Step 1: Manual** — capítulo 3 (barra lateral y qué ve cada rol, Inicio y Mis tareas, `Ctrl K`, campana, Mi cuenta y tema, celular, imprimir)
y capítulo 4 (nombre, sigla y lema; colores y contraste con el ejemplo `#9ecbff` → `#2f6fbe`; preparar y subir el logo; dónde se ve cada cosa; Textos del mapa),
con el formato del capítulo 1 y cadenas de interfaz **copiadas del código**.

- [ ] **Step 2: `CONTEXT.md`** — cabecera con fecha; punto de reanudación hacia la Fase 13; «Qué probar y cómo (Fase 12)» con la
demostración de §14 del spec paso a paso (usuarios demo, valores exactos, qué debe verse); tabla de decisiones F12-D1… (F12-DC1–DC24 del spec más
las que surjan en la ejecución); deuda técnica (lo diferido: renombrado de `azul`/`verde` a F19, `Boton`/`Campo` en formularios heredados, favicon desde el logo).
`PLAN.md`: fila 12 ✅ con la fecha.

- [ ] **Step 3: Verificación completa** — `npm run lint && npm test && npm run build`; `docker compose -f docker-compose.dev.yml up -d --build app`;
`/api/salud` 200; la imagen arranca sobre la base existente y aplica la 0003 (log «Migraciones al día»).

- [ ] **Step 4: Commit** — `git commit -m "docs: cierre de la Fase 12 - nueva estructura visual (manual, CONTEXT.md, PLAN.md)"`.

**→ Recorrido final** (controlador, Playwright sobre 9081): la demostración de §14 completa, en claro y oscuro, con capturas de Inicio,
un proceso, una ficha, la lista de usuarios, el Listado Maestro (pantalla e impresión) y la pantalla de entidad; los defectos van en una
ola de arreglos antes de la revisión final de la rama.
