# Fase 10 — Despliegue NAS: Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar el paquete de despliegue del QNAP completo y verificado en un ensayo local destructivo: arranque con migraciones, compose de producción, respaldos restaurables, prueba de carga e `INSTALACION.md`.

**Architecture:** El contenedor arranca con `node arrancar.js && exec node server.js`: un bundle esbuild que espera la BD, aplica migraciones con `migrate()` de drizzle-orm (carpeta `drizzle/` copiada a la imagen) y asegura el admin. El compose de producción (`docker-compose.nas.yml`) define app+bd con `mem_limit`, red interna y Postgres sin puertos; un override de ensayo (`docker-compose.ensayo.yml`) permite ejecutar el ciclo completo en local. Respaldo por `pg_dump` desde el crontab de QTS; los archivos del almacén los cubren los snapshots de la carpeta compartida.

**Tech Stack:** Next.js 16 standalone, drizzle-orm (`migrate()`), postgres.js, esbuild (devDep, solo build), Docker Compose, POSIX sh (QTS), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-24-fase10-despliegue-nas-design.md`

## Global Constraints

- ARM64: la imagen se construye `linux/arm64`; ninguna dependencia nueva con binarios nativos (esbuild es devDependency y NO viaja a la imagen final).
- NAS sin internet: cero dependencias externas en runtime; imagen entra por `.tar` + `docker load`.
- Solo DOS contenedores (app ≤ 768 MB, bd ≤ 512 MB, con `mem_limit`); Postgres jamás publica puertos; datos de PG en volumen Docker local, nunca carpeta SMB; documentos en bind mount de carpeta compartida.
- Puerto publicado: 9080→3080 (8080/443 los ocupa QTS).
- Idioma: código, logs y documentación en español. TS estricto. Commits convencionales en español + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- TDD para la lógica testeable; los 5 tests rojos preexistentes del seed (`busqueda-fase5`×3, `esquema`×2) NO son regresión.
- El compose de DESARROLLO (`docker-compose.dev.yml`) no se toca.

## Estructura de archivos

- Create: `src/lib/arranque.ts` (lógica pura: espera con reintentos, config admin desde env)
- Create: `tests/arranque.test.ts`
- Create: `scripts/arrancar.ts` (cascarón: conecta BD→migrate→admin, fuente del bundle)
- Create: `docker-compose.nas.yml`, `.env.nas.example`
- Create: `docker-compose.ensayo.yml`, `.env.ensayo`
- Create: `nas/respaldo.sh`, `nas/restaurar.sh`
- Create: `scripts/carga.ts`
- Create: `INSTALACION.md`
- Modify: `Dockerfile` (bundle esbuild, copiar `drizzle/`, CMD nuevo), `.github/workflows/ci.yml` (doble tag), `package.json` (esbuild devDep), `.gitignore` (carpetas de ensayo), `CONTEXT.md` (cierre)

---

### Task 1: Lógica de arranque testeable (`src/lib/arranque.ts`)

**Files:**
- Create: `src/lib/arranque.ts`
- Create: `tests/arranque.test.ts`
- Modify: `package.json` (devDependency `esbuild`)

**Interfaces:**
- Produces: `esperarConReintentos(probar: () => Promise<void>, opciones: { intentos: number; esperaMs: number; dormir?: (ms: number) => Promise<void> }): Promise<number>` — reintenta `probar` hasta que no lance; devuelve el número de intento (base 1) que funcionó; si se agotan, relanza el último error. `dormir` inyectable para tests (default: setTimeout).
- Produces: `configurarAdminDesdeEnv(env: NodeJS.ProcessEnv): { accion: "asegurar"; config: { usuario: string; nombre: string; clave: string; forzarClave: boolean } } | { accion: "omitir"; motivo: string }` — lee `ADMIN_USUARIO`, `ADMIN_NOMBRE` (default `"Administrador"`), `ADMIN_CLAVE`, `ADMIN_FORZAR_CLAVE` (`"1"` → true).

- [ ] **Step 1: Instalar esbuild como devDependency** (lo usa el Dockerfile en Task 3; se fija aquí para que el lockfile viaje en un solo commit)

```powershell
npm install -D esbuild
```

- [ ] **Step 2: Escribir los tests que fallan**

Crear `tests/arranque.test.ts`:

```typescript
/**
 * Lógica de arranque del contenedor (Fase 10): espera de BD con reintentos y
 * bootstrap del admin desde variables de entorno. Sin BD ni timers reales.
 */
import { describe, expect, it } from "vitest";
import { configurarAdminDesdeEnv, esperarConReintentos } from "@/lib/arranque";

describe("esperarConReintentos", () => {
  it("devuelve 1 si el primer intento funciona, sin dormir", async () => {
    const esperas: number[] = [];
    const intento = await esperarConReintentos(async () => {}, {
      intentos: 5,
      esperaMs: 100,
      dormir: async (ms) => {
        esperas.push(ms);
      },
    });
    expect(intento).toBe(1);
    expect(esperas).toEqual([]);
  });

  it("reintenta hasta que funciona y duerme entre intentos", async () => {
    const esperas: number[] = [];
    let llamadas = 0;
    const intento = await esperarConReintentos(
      async () => {
        llamadas++;
        if (llamadas < 3) throw new Error("aún no");
      },
      { intentos: 5, esperaMs: 200, dormir: async (ms) => { esperas.push(ms); } },
    );
    expect(intento).toBe(3);
    expect(esperas).toEqual([200, 200]);
  });

  it("al agotar los intentos relanza el último error", async () => {
    let llamadas = 0;
    await expect(
      esperarConReintentos(
        async () => {
          llamadas++;
          throw new Error(`fallo ${llamadas}`);
        },
        { intentos: 3, esperaMs: 1, dormir: async () => {} },
      ),
    ).rejects.toThrow("fallo 3");
    expect(llamadas).toBe(3);
  });
});

describe("configurarAdminDesdeEnv", () => {
  const base = { ADMIN_USUARIO: "admin", ADMIN_CLAVE: "secreta123" };

  it("con usuario y clave devuelve la config completa sin forzar", () => {
    const r = configurarAdminDesdeEnv({ ...base, ADMIN_NOMBRE: "Calidad" });
    expect(r).toEqual({
      accion: "asegurar",
      config: { usuario: "admin", nombre: "Calidad", clave: "secreta123", forzarClave: false },
    });
  });

  it("sin ADMIN_NOMBRE usa 'Administrador'", () => {
    const r = configurarAdminDesdeEnv(base);
    expect(r.accion).toBe("asegurar");
    if (r.accion === "asegurar") expect(r.config.nombre).toBe("Administrador");
  });

  it("ADMIN_FORZAR_CLAVE=1 activa forzarClave", () => {
    const r = configurarAdminDesdeEnv({ ...base, ADMIN_FORZAR_CLAVE: "1" });
    if (r.accion === "asegurar") expect(r.config.forzarClave).toBe(true);
    else expect.fail("debió asegurar");
  });

  it("sin ADMIN_CLAVE se omite nombrando la variable en el motivo", () => {
    const r = configurarAdminDesdeEnv({ ADMIN_USUARIO: "admin" });
    expect(r.accion).toBe("omitir");
    if (r.accion === "omitir") expect(r.motivo).toContain("ADMIN_CLAVE");
  });

  it("sin ADMIN_USUARIO se omite nombrando la variable en el motivo", () => {
    const r = configurarAdminDesdeEnv({ ADMIN_CLAVE: "x" });
    expect(r.accion).toBe("omitir");
    if (r.accion === "omitir") expect(r.motivo).toContain("ADMIN_USUARIO");
  });
});
```

- [ ] **Step 3: Verificar que fallan por módulo ausente**

Run: `npx vitest run tests/arranque.test.ts`
Expected: FAIL (no resuelve `@/lib/arranque`).

- [ ] **Step 4: Implementación mínima**

Crear `src/lib/arranque.ts`:

```typescript
/**
 * Lógica de arranque del contenedor (Fase 10). Sin dependencias de Next:
 * este módulo se bundlea en arrancar.js (esbuild) y también se prueba solo.
 */

export type OpcionesEspera = {
  intentos: number;
  esperaMs: number;
  dormir?: (ms: number) => Promise<void>;
};

const dormirReal = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Reintenta `probar` hasta que no lance. Devuelve el intento (base 1) que
 * funcionó; si se agotan, relanza el último error. `dormir` es inyectable
 * para probar la espera sin timers reales (patrón crearLimitador).
 */
export async function esperarConReintentos(
  probar: () => Promise<void>,
  { intentos, esperaMs, dormir = dormirReal }: OpcionesEspera,
): Promise<number> {
  let ultimoError: unknown;
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      await probar();
      return intento;
    } catch (error) {
      ultimoError = error;
      if (intento < intentos) await dormir(esperaMs);
    }
  }
  throw ultimoError;
}

export type ConfigAdmin = {
  usuario: string;
  nombre: string;
  clave: string;
  forzarClave: boolean;
};

export type DecisionAdmin =
  | { accion: "asegurar"; config: ConfigAdmin }
  | { accion: "omitir"; motivo: string };

/**
 * Decide el bootstrap del admin a partir del entorno. Sin ADMIN_USUARIO o
 * ADMIN_CLAVE solo se omite (con motivo): un NAS ya aprovisionado retira
 * ADMIN_CLAVE del .env tras el primer arranque y eso NO es un error.
 */
export function configurarAdminDesdeEnv(env: NodeJS.ProcessEnv): DecisionAdmin {
  const usuario = env.ADMIN_USUARIO;
  const clave = env.ADMIN_CLAVE;
  if (!usuario) return { accion: "omitir", motivo: "falta ADMIN_USUARIO" };
  if (!clave) return { accion: "omitir", motivo: "falta ADMIN_CLAVE" };
  return {
    accion: "asegurar",
    config: {
      usuario,
      nombre: env.ADMIN_NOMBRE ?? "Administrador",
      clave,
      forzarClave: env.ADMIN_FORZAR_CLAVE === "1",
    },
  };
}
```

- [ ] **Step 5: Verificar que pasan**

Run: `npx vitest run tests/arranque.test.ts`
Expected: 8 passed.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/arranque.ts tests/arranque.test.ts package.json package-lock.json
git commit -m "feat: logica de arranque del contenedor (espera de BD y admin por env)`n`nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(Si el mensaje multilínea da problemas en PowerShell, usar `git commit -F` con archivo en el scratchpad.)

---

### Task 2: Cascarón `scripts/arrancar.ts` (migraciones + admin)

**Files:**
- Create: `scripts/arrancar.ts`
- Test: verificación real contra una BD efímera (sin test de Vitest: es integración pura; el ensayo de Task 7 lo vuelve a ejercitar dentro de la imagen)

**Interfaces:**
- Consumes: `esperarConReintentos`, `configurarAdminDesdeEnv` (Task 1); `asegurarAdmin(usuario, nombre, clave, forzarClave)` de `src/db/consultas/admin.ts`; `obtenerSql()` de `src/db/cliente.ts`.
- Produces: `scripts/arrancar.ts` ejecutable con `npx tsx` en dev y bundleable con esbuild (Task 3). Sale con código 0 (todo listo) o ≠0 (fallo, con log `[arranque] FALLO:`).

- [ ] **Step 1: Escribir el script**

Crear `scripts/arrancar.ts`:

```typescript
/**
 * Arranque del contenedor (Fase 10, F10-D2): espera la BD, aplica las
 * migraciones y asegura el admin; solo entonces el CMD sigue con el server.
 * Si algo falla, sale ≠0: el server NO arranca y la restart policy reintenta.
 * En dev se puede correr con: npx tsx scripts/arrancar.ts
 */
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { configurarAdminDesdeEnv, esperarConReintentos } from "@/lib/arranque";

async function principal() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[arranque] Falta DATABASE_URL en el entorno");
    process.exit(1);
  }

  // max: 1 — recomendación de Drizzle para la conexión de migraciones.
  const sql = postgres(url, { max: 1, connect_timeout: 5 });

  console.log("[arranque] Esperando la base de datos…");
  const intento = await esperarConReintentos(
    async () => {
      await sql`SELECT 1`;
    },
    { intentos: 30, esperaMs: 2000 },
  );
  console.log(`[arranque] Base de datos lista (intento ${intento})`);

  console.log("[arranque] Aplicando migraciones…");
  await migrate(drizzle(sql), {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });
  console.log("[arranque] Migraciones al día");

  const decision = configurarAdminDesdeEnv(process.env);
  if (decision.accion === "asegurar") {
    // Import dinámico: arrastra el cliente global y @node-rs/argon2 solo
    // cuando de verdad hay bootstrap que hacer.
    const { asegurarAdmin } = await import("@/db/consultas/admin");
    const { obtenerSql } = await import("@/db/cliente");
    const { usuario, nombre, clave, forzarClave } = decision.config;
    const resultado = await asegurarAdmin(usuario, nombre, clave, forzarClave);
    console.log(`[arranque] Admin '${usuario}': ${resultado}`);
    await obtenerSql().end();
  } else {
    console.warn(`[arranque] Bootstrap del admin omitido: ${decision.motivo}`);
  }

  await sql.end();
  console.log("[arranque] Listo: el servidor puede arrancar");
}

principal().catch((error) => {
  console.error("[arranque] FALLO:", error);
  process.exit(1);
});
```

- [ ] **Step 2: Verificación real contra una BD efímera vacía** (usa el Postgres dev en 5434)

```powershell
docker exec sgc-bd-1 createdb -U sgc sgc_arranque_prueba
$env:DATABASE_URL = "postgres://sgc:sgc_dev@127.0.0.1:5434/sgc_arranque_prueba"
$env:ADMIN_USUARIO = "admin"; $env:ADMIN_NOMBRE = "Prueba"; $env:ADMIN_CLAVE = "clave-de-prueba-123"
npx tsx scripts/arrancar.ts
```

Expected: logs `[arranque] Base de datos lista (intento 1)` → `Migraciones al día` → `Admin 'admin': creado` → `Listo`; exit 0.

- [ ] **Step 3: Verificar idempotencia y forzar clave**

```powershell
npx tsx scripts/arrancar.ts          # Expected: "Admin 'admin': existente"
$env:ADMIN_FORZAR_CLAVE = "1"
npx tsx scripts/arrancar.ts          # Expected: "Admin 'admin': clave_actualizada"
```

- [ ] **Step 4: Verificar el camino de fallo (BD inaccesible sale ≠0)**

```powershell
$env:ADMIN_FORZAR_CLAVE = ""
$env:DATABASE_URL = "postgres://sgc:sgc_dev@127.0.0.1:9999/nada"
npx tsx scripts/arrancar.ts; echo "exit=$LASTEXITCODE"
```

Expected: reintentos visibles (tarda; se puede cortar tras ver 2–3), termina en `[arranque] FALLO:` y `exit=1`. Para no esperar el minuto completo es válido probar con un script wrapper que reduzca `intentos` — o aceptar la espera.

- [ ] **Step 5: Limpiar la BD efímera y las env**

```powershell
docker exec sgc-bd-1 dropdb -U sgc sgc_arranque_prueba
Remove-Item Env:DATABASE_URL, Env:ADMIN_USUARIO, Env:ADMIN_NOMBRE, Env:ADMIN_CLAVE, Env:ADMIN_FORZAR_CLAVE -ErrorAction SilentlyContinue
```

- [ ] **Step 6: Lint y commit**

```powershell
npm run lint
git add scripts/arrancar.ts
git commit -F <msg>   # "feat: script de arranque con migraciones y bootstrap del admin"
```

---

### Task 3: Dockerfile — bundle del arrancador, carpeta `drizzle/`, CMD nuevo

**Files:**
- Modify: `Dockerfile`

**Interfaces:**
- Consumes: `scripts/arrancar.ts` (Task 2); carpeta `drizzle/` del repo (migraciones + `meta/`).
- Produces: imagen cuyo CMD es `sh -c "node arrancar.js && exec node server.js"`; `/app/arrancar.js` y `/app/drizzle/` presentes.

- [ ] **Step 1: Editar el Dockerfile**

En la etapa **builder**, después de `RUN npm run build`, agregar:

```dockerfile
# Bundle del arrancador (migraciones + admin). @node-rs/argon2 queda externo:
# el standalone ya copia su prebuild ARM64 a node_modules (lo usa la app).
RUN npx esbuild scripts/arrancar.ts --bundle --platform=node --format=cjs \
  --external:@node-rs/argon2 --alias:@=./src --outfile=arrancar.js
```

En la etapa **runner**, después de los `COPY` existentes, agregar:

```dockerfile
COPY --from=builder --chown=nextjs:nodejs /app/arrancar.js ./arrancar.js
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
```

Reemplazar el CMD final:

```dockerfile
# Migrar y asegurar admin ANTES de servir (F10-D2). Con `exec`, node recibe
# las señales de parada de Docker.
CMD ["sh", "-c", "node arrancar.js && exec node server.js"]
```

- [ ] **Step 2: Build local x86 (verifica que esbuild corre y el bundle entra)**

```powershell
docker build -t sgc-suaza:prueba-arranque .
```

Expected: build OK; en el log aparece la línea de esbuild con `arrancar.js` generado.

- [ ] **Step 3: Probar el arranque de la imagen contra una BD efímera**

```powershell
docker network create red-prueba-arranque
docker run -d --name bd-prueba --network red-prueba-arranque -e POSTGRES_USER=sgc -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=sgc postgres:16-alpine
docker run --rm --name app-prueba --network red-prueba-arranque -e DATABASE_URL="postgres://sgc:pw@bd-prueba:5432/sgc" -e ADMIN_USUARIO=admin -e ADMIN_NOMBRE=Prueba -e ADMIN_CLAVE=clave-de-prueba-123 -p 127.0.0.1:9082:3080 sgc-suaza:prueba-arranque &
```

Esperar ~15 s y verificar:

```powershell
docker logs app-prueba 2>&1 | Select-String "arranque"
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9082/api/salud | Select-Object -ExpandProperty Content
```

Expected: logs `[arranque] … Migraciones al día … Admin 'admin': creado … Listo`; `/api/salud` responde `"estado":"ok"` (la home fallará sin seed — irrelevante aquí; la salud valida BD conectada y migrada).

- [ ] **Step 4: Limpiar**

```powershell
docker rm -f app-prueba bd-prueba; docker network rm red-prueba-arranque; docker rmi sgc-suaza:prueba-arranque
```

- [ ] **Step 5: Commit**

```powershell
git add Dockerfile
git commit -F <msg>   # "feat: la imagen migra y asegura el admin en el arranque"
```

---

### Task 4: `docker-compose.nas.yml` + `.env.nas.example`

**Files:**
- Create: `docker-compose.nas.yml`
- Create: `.env.nas.example`

**Interfaces:**
- Consumes: imagen `sgc-suaza:<tag>` (CMD de Task 3).
- Produces: los servicios `app` (container_name `sgc-app`) y `bd` (container_name `sgc-bd`) que consumen los scripts de Task 6 y el override de Task 7. Variables: `SGC_BD_USUARIO`, `SGC_BD_CLAVE`, `SGC_BD_NOMBRE`, `SGC_DOCUMENTOS`, `ADMIN_*`.

- [ ] **Step 1: Escribir `docker-compose.nas.yml`**

```yaml
# Producción en el QNAP TS-832PX (Container Station). Ver INSTALACION.md.
# Reglas inviolables que este archivo materializa:
#  - Solo DOS contenedores; límites de memoria explícitos (app 768M, bd 512M).
#  - Postgres SIN puertos publicados; sus datos en volumen Docker local
#    (jamás en carpeta SMB/CIFS: se corrompen).
#  - Documentos en la carpeta compartida del NAS (bind mount) — la cubren
#    los snapshots.
#  - Puerto 9080 en el host (8080/443 los ocupa QTS).
# Las variables ${...} salen del archivo .env junto a este yml.
services:
  app:
    image: sgc-suaza:${SGC_VERSION:-latest}
    container_name: sgc-app
    ports:
      - "9080:3080"
    environment:
      DATABASE_URL: postgres://${SGC_BD_USUARIO:-sgc}:${SGC_BD_CLAVE:?Definir SGC_BD_CLAVE en .env}@bd:5432/${SGC_BD_NOMBRE:-sgc}
      ALMACEN_RUTA: /almacen
      NEXT_TELEMETRY_DISABLED: "1"
      ADMIN_USUARIO: ${ADMIN_USUARIO:-}
      ADMIN_NOMBRE: ${ADMIN_NOMBRE:-}
      ADMIN_CLAVE: ${ADMIN_CLAVE:-}
      ADMIN_FORZAR_CLAVE: ${ADMIN_FORZAR_CLAVE:-}
    volumes:
      - ${SGC_DOCUMENTOS:-/share/sgc-documentos}:/almacen
    depends_on:
      bd:
        condition: service_healthy
    healthcheck:
      # /api/salud consulta la BD y responde 503 si falla: cubre app y BD.
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3080/api/salud || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 60s
    mem_limit: 768m
    memswap_limit: 768m
    restart: unless-stopped

  bd:
    image: postgres:16-alpine
    container_name: sgc-bd
    environment:
      POSTGRES_USER: ${SGC_BD_USUARIO:-sgc}
      POSTGRES_PASSWORD: ${SGC_BD_CLAVE:?Definir SGC_BD_CLAVE en .env}
      POSTGRES_DB: ${SGC_BD_NOMBRE:-sgc}
    volumes:
      - bd_datos:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${SGC_BD_USUARIO:-sgc} -d ${SGC_BD_NOMBRE:-sgc}"]
      interval: 10s
      timeout: 5s
      retries: 10
    mem_limit: 512m
    memswap_limit: 512m
    restart: unless-stopped

volumes:
  bd_datos:
```

- [ ] **Step 2: Escribir `.env.nas.example`**

```bash
# Configuración del SGC en el NAS. Copiar como `.env` junto a
# docker-compose.nas.yml y completar. NO subir el .env real a ningún lado.

# --- Imagen ---
# Tag cargado con `docker load` (ver INSTALACION.md §Actualización y §Rollback).
SGC_VERSION=latest

# --- Base de datos (red interna; el puerto NUNCA se publica) ---
SGC_BD_USUARIO=sgc
# Obligatoria. Generar una clave larga aleatoria; solo la usan los contenedores.
SGC_BD_CLAVE=
SGC_BD_NOMBRE=sgc

# --- Carpeta compartida de documentos (bind mount) ---
# Ruta REAL en el NAS de la carpeta compartida creada en QTS.
SGC_DOCUMENTOS=/share/sgc-documentos

# --- Bootstrap del admin (SOLO primer arranque) ---
# Tras verificar el primer login: BORRAR ADMIN_CLAVE de este archivo y
# recrear el contenedor (docker compose -f docker-compose.nas.yml up -d).
# La cuenta sigue existiendo en la BD; esta variable es solo el bootstrap.
ADMIN_USUARIO=admin
ADMIN_NOMBRE=Lider de Calidad
ADMIN_CLAVE=

# ¿Olvidó la clave? Poner ADMIN_CLAVE nueva + ADMIN_FORZAR_CLAVE=1, recrear el
# contenedor, y al entrar retirar ambas (ver INSTALACION.md §Reseteo de clave).
ADMIN_FORZAR_CLAVE=
```

- [ ] **Step 3: Validar sintaxis e interpolación**

```powershell
$env:SGC_BD_CLAVE = "prueba"; docker compose -f docker-compose.nas.yml config | Select-Object -First 40; Remove-Item Env:SGC_BD_CLAVE
```

Expected: YAML renderizado sin errores; `bd` sin sección `ports`; `mem_limit` presente. Y sin la variable: `docker compose -f docker-compose.nas.yml config` debe FALLAR con el mensaje "Definir SGC_BD_CLAVE en .env".

- [ ] **Step 4: Commit**

```powershell
git add docker-compose.nas.yml .env.nas.example
git commit -F <msg>   # "feat: compose de produccion para Container Station + env de ejemplo"
```

---

### Task 5: CI — doble tag del tar para rollback offline

**Files:**
- Modify: `.github/workflows/ci.yml` (job `imagen-arm64`)

**Interfaces:**
- Produces: artefacto `sgc-suaza-arm64-docker-<AAAAMMDD>-<sha7>` cuyo tar contiene los tags `sgc-suaza:latest` y `sgc-suaza:<AAAAMMDD>-<sha7>` (los consume `SGC_VERSION` del compose, Task 4).

- [ ] **Step 1: Editar el workflow**

Antes del paso "Exportar imagen como .tar…", agregar:

```yaml
      - name: Tag versionado para rollback offline
        id: version
        run: echo "tag=$(date +%Y%m%d)-${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"
```

En el paso "Exportar imagen como .tar para despliegue offline", cambiar `tags:`:

```yaml
          tags: |
            sgc-suaza:latest
            sgc-suaza:${{ steps.version.outputs.tag }}
```

En el paso "Publicar artefacto", cambiar `name:`:

```yaml
          name: sgc-suaza-arm64-docker-${{ steps.version.outputs.tag }}
```

- [ ] **Step 2: Verificación local de sintaxis**

Revisión visual + `docker compose` no aplica; validar YAML con:

```powershell
npx --yes yaml-lint .github/workflows/ci.yml
```

(Si `yaml-lint` no está disponible sin red, basta la revisión visual: la verificación real es el CI en el push del cierre, Task 10.)

- [ ] **Step 3: Commit**

```powershell
git add .github/workflows/ci.yml
git commit -F <msg>   # "feat: tar del CI con tag versionado para rollback offline"
```

---

### Task 6: Scripts de respaldo y restauración (`nas/`)

**Files:**
- Create: `nas/respaldo.sh`
- Create: `nas/restaurar.sh`
- Modify: `.gitignore` (agregar `almacen-ensayo/` y `respaldos-ensayo/`, que usa Task 7)

**Interfaces:**
- Consumes: `container_name: sgc-bd` / `sgc-app` (Task 4).
- Produces: `respaldo.sh [carpeta_destino]` (default `/share/sgc-respaldos`) y `restaurar.sh <archivo.dump>`; ambos aceptan `SGC_APP`, `SGC_BD`, `SGC_BD_USUARIO`, `SGC_BD_NOMBRE` por entorno (defaults `sgc-app`, `sgc-bd`, `sgc`, `sgc`). Los ejercita Task 7.

- [ ] **Step 1: Escribir `nas/respaldo.sh`**

```sh
#!/bin/sh
# Respaldo diario de la BD del SGC (pg_dump formato custom) + retención.
# Programado en el crontab de QTS — ver INSTALACION.md §Respaldos.
# Uso: respaldo.sh [carpeta_destino]   (default /share/sgc-respaldos)
set -eu

DESTINO="${1:-/share/sgc-respaldos}"
BD="${SGC_BD:-sgc-bd}"
USUARIO="${SGC_BD_USUARIO:-sgc}"
NOMBRE_BD="${SGC_BD_NOMBRE:-sgc}"
FECHA=$(date +%Y%m%d-%H%M)
ARCHIVO="$DESTINO/sgc-$FECHA.dump"

[ -d "$DESTINO" ] || { echo "No existe la carpeta de respaldos: $DESTINO" >&2; exit 1; }

docker exec "$BD" pg_dump -U "$USUARIO" -d "$NOMBRE_BD" -Fc > "$ARCHIVO"

# Verificación: no vacío y con formato restaurable (pg_restore lo puede listar).
[ -s "$ARCHIVO" ] || { echo "Respaldo VACIO: $ARCHIVO" >&2; exit 1; }
docker exec -i "$BD" pg_restore --list < "$ARCHIVO" > /dev/null

# Retención: eliminar dumps con más de 30 días.
find "$DESTINO" -name 'sgc-*.dump' -mtime +30 -type f -delete

echo "Respaldo OK: $ARCHIVO ($(du -h "$ARCHIVO" | cut -f1))"
```

- [ ] **Step 2: Escribir `nas/restaurar.sh`**

```sh
#!/bin/sh
# Restauración de la BD del SGC desde un dump de respaldo.sh. DESTRUYE la BD
# actual. Los ARCHIVOS de documentos NO están en el dump: restaurarlos desde
# el snapshot de la carpeta compartida — ver INSTALACION.md §Restauración.
# Uso: restaurar.sh /share/sgc-respaldos/sgc-AAAAMMDD-HHMM.dump
set -eu

DUMP="${1:?Uso: restaurar.sh /ruta/al/respaldo.dump}"
APP="${SGC_APP:-sgc-app}"
BD="${SGC_BD:-sgc-bd}"
USUARIO="${SGC_BD_USUARIO:-sgc}"
NOMBRE_BD="${SGC_BD_NOMBRE:-sgc}"

[ -s "$DUMP" ] || { echo "No existe o está vacío: $DUMP" >&2; exit 1; }

echo "Esto DESTRUYE la base de datos actual y la reemplaza con: $DUMP"
printf "Escriba SI (mayúsculas) para continuar: "
read -r CONFIRMA
[ "$CONFIRMA" = "SI" ] || { echo "Cancelado."; exit 1; }

docker stop "$APP"
docker exec "$BD" dropdb -U "$USUARIO" --if-exists "$NOMBRE_BD"
docker exec "$BD" createdb -U "$USUARIO" "$NOMBRE_BD"
docker exec -i "$BD" pg_restore -U "$USUARIO" -d "$NOMBRE_BD" --no-owner < "$DUMP"
docker start "$APP"

echo "Restauración completa. Verificar http://IP-DEL-NAS:9080 y /api/salud."
```

- [ ] **Step 3: `.gitignore`** — agregar al final:

```
# Ensayo local del despliegue NAS (Fase 10)
almacen-ensayo/
respaldos-ensayo/
```

- [ ] **Step 4: Verificación estática**

```powershell
bash -n nas/respaldo.sh; bash -n nas/restaurar.sh
```

Expected: sin salida (sintaxis válida). La verificación funcional completa es el ensayo (Task 7).

- [ ] **Step 5: Commit**

```powershell
git add nas/respaldo.sh nas/restaurar.sh .gitignore
git commit -F <msg>   # "feat: scripts de respaldo y restauracion para el NAS"
```

---

### Task 7: Ensayo local destructivo (la restauración probada)

**Files:**
- Create: `docker-compose.ensayo.yml`
- Create: `.env.ensayo`
- Test: el ensayo ES la prueba; la evidencia se anota al final de esta tarea en este mismo plan (sección "Evidencia del ensayo").

**Interfaces:**
- Consumes: `docker-compose.nas.yml` (Task 4), imagen con arranque (Task 3), scripts (Task 6), seed del repo.
- Produces: procedimiento verificado que Task 9 documenta en `INSTALACION.md`.

- [ ] **Step 1: Escribir `docker-compose.ensayo.yml`**

```yaml
# Override de ENSAYO LOCAL del despliegue NAS (Fase 10). Diferencias
# deliberadas con producción, todas visibles aquí:
#  - build local (x86 de esta máquina) en vez de imagen cargada por docker load
#  - bind mounts a carpetas del repo (gitignored) en vez de /share/*
#  - bd publica 127.0.0.1:5435 SOLO para sembrar y verificar desde el host
# Uso (con el compose dev APAGADO para liberar el puerto 9080):
#   docker compose -f docker-compose.nas.yml -f docker-compose.ensayo.yml `
#     -p sgc-ensayo --env-file .env.ensayo up -d --build
services:
  app:
    build: .
    image: sgc-suaza:ensayo
    volumes:
      - ./almacen-ensayo:/almacen
  bd:
    ports:
      - "127.0.0.1:5435:5432"
```

- [ ] **Step 2: Escribir `.env.ensayo`**

```bash
# Variables del ENSAYO local (sin secretos reales; commiteado a propósito).
SGC_VERSION=ensayo
SGC_BD_USUARIO=sgc
SGC_BD_CLAVE=ensayo_local
SGC_BD_NOMBRE=sgc
SGC_DOCUMENTOS=./almacen-ensayo
ADMIN_USUARIO=admin
ADMIN_NOMBRE=Ensayo Fase 10
ADMIN_CLAVE=clave-de-ensayo-123
ADMIN_FORZAR_CLAVE=
```

- [ ] **Step 3: Instalar desde cero** (compose dev apagado primero)

```powershell
docker compose -f docker-compose.dev.yml down
New-Item -ItemType Directory -Force almacen-ensayo, respaldos-ensayo | Out-Null
docker compose -f docker-compose.nas.yml -f docker-compose.ensayo.yml -p sgc-ensayo --env-file .env.ensayo up -d --build
```

Esperar y verificar el arranque:

```powershell
docker logs sgc-app 2>&1 | Select-String "arranque"
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9080/api/salud | Select-Object -ExpandProperty Content
docker ps --format "{{.Names}} {{.Status}}"   # sgc-app y sgc-bd "healthy"
```

Expected: `[arranque] … Migraciones al día … Admin 'admin': creado … Listo`; salud `ok`; ambos healthy; `docker inspect sgc-bd --format "{{.HostConfig.Memory}}"` = 536870912.

- [ ] **Step 4: Sembrar datos (mapa + documentos + archivos físicos en el bind mount)**

```powershell
$env:DATABASE_URL = "postgres://sgc:ensayo_local@127.0.0.1:5435/sgc"
$env:ALMACEN_RUTA = ".\almacen-ensayo"
npm run db:seed
Remove-Item Env:DATABASE_URL, Env:ALMACEN_RUTA
```

Verificar operación real: abrir `http://127.0.0.1:9080` (mapa con conteos), login admin en `/admin/ingreso` (admin / clave-de-ensayo-123), y descargar un PDF público → debe salir con la marca "COPIA NO CONTROLADA".

- [ ] **Step 5: Respaldar con los scripts reales** (Git Bash; los scripts aceptan la carpeta destino como argumento)

```bash
SGC_BD=sgc-bd ./nas/respaldo.sh ./respaldos-ensayo
cp -r almacen-ensayo respaldos-ensayo/almacen-copia
```

Expected: `Respaldo OK: ./respaldos-ensayo/sgc-<fecha>.dump (<tamaño>)`.

Anotar como referencia: `docker exec sgc-bd psql -U sgc -d sgc -tc "SELECT count(*) FROM documentos"` y `"SELECT count(*) FROM auditoria"`.

- [ ] **Step 6: DESTRUIR todo** (contenedores + volúmenes + almacén)

```powershell
docker compose -f docker-compose.nas.yml -f docker-compose.ensayo.yml -p sgc-ensayo --env-file .env.ensayo down -v
Remove-Item -Recurse -Force almacen-ensayo
docker volume ls | Select-String sgc-ensayo   # Expected: nada
```

- [ ] **Step 7: Restaurar** — recrear infraestructura vacía, devolver archivos, restaurar BD:

```powershell
docker compose -f docker-compose.nas.yml -f docker-compose.ensayo.yml -p sgc-ensayo --env-file .env.ensayo up -d
Copy-Item -Recurse respaldos-ensayo/almacen-copia almacen-ensayo
```

(El arranque limpio deja una BD migrada vacía con admin; la restauración la reemplaza:)

```bash
SGC_APP=sgc-app SGC_BD=sgc-bd ./nas/restaurar.sh ./respaldos-ensayo/sgc-<fecha>.dump
# escribir SI cuando pregunte
```

- [ ] **Step 8: Verificar la restauración**

- `docker exec sgc-bd psql -U sgc -d sgc -tc "SELECT count(*) FROM documentos"` — igual al valor anotado en Step 5 (y auditoría igual).
- `http://127.0.0.1:9080` — mapa con los mismos conteos.
- Login admin funciona (la clave restaurada, no la del bootstrap).
- El mismo PDF descarga con marca de agua.
- Bitácora en `/admin/bitacora` muestra el historial previo.

- [ ] **Step 9: Anotar la evidencia** — agregar al FINAL de este archivo una sección `## Evidencia del ensayo (Task 7)` con: fecha, conteos antes/después, y cualquier desviación corregida (si un script necesitó ajuste, corregirlo en `nas/*.sh` — esa corrección es parte de esta tarea).

- [ ] **Step 10: Apagar el ensayo y commit**

```powershell
docker compose -f docker-compose.nas.yml -f docker-compose.ensayo.yml -p sgc-ensayo --env-file .env.ensayo down
git add docker-compose.ensayo.yml .env.ensayo docs/superpowers/plans/2026-08-24-fase10-despliegue-nas.md nas/
git commit -F <msg>   # "feat: ensayo local destructivo del despliegue con restauracion probada"
```

---

### Task 8: Prueba de carga (`scripts/carga.ts`)

**Files:**
- Create: `scripts/carga.ts`

**Interfaces:**
- Consumes: la app del ensayo en `http://127.0.0.1:9080` (Task 7 levantada de nuevo) o cualquier URL base.
- Produces: `npx tsx scripts/carga.ts <urlBase> [segundos] [clientes]` — reporte por ruta (peticiones, errores, p50, p95) + total. Reutilizable en el NAS el día de instalación.

- [ ] **Step 1: Escribir `scripts/carga.ts`**

```typescript
/**
 * Prueba de carga frugal (Fase 10, F10-D8): N clientes concurrentes con una
 * mezcla realista de rutas descubiertas del propio sitio. Respeta los rate
 * limits públicos (mayoría páginas; descargas muy por debajo de 60/min).
 * Uso: npx tsx scripts/carga.ts http://127.0.0.1:9080 [segundos] [clientes]
 * RAM: medir aparte con `docker stats --no-stream` durante la corrida.
 */

const base = process.argv[2] ?? "http://127.0.0.1:9080";
const duracionS = Number(process.argv[3] ?? 60);
const clientes = Number(process.argv[4] ?? 20);

type Muestra = { ruta: string; ms: number; ok: boolean };
const muestras: Muestra[] = [];

async function descubrirRutas(): Promise<{ procesos: string[]; documentos: string[] }> {
  const html = await (await fetch(base)).text();
  const procesos = [...html.matchAll(/href="(\/procesos\/[a-z0-9-]+)"/g)].map((m) => m[1]);
  // Fichas: se descubren desde la primera página de proceso disponible.
  const documentos: string[] = [];
  for (const p of procesos.slice(0, 5)) {
    const h = await (await fetch(base + p)).text();
    documentos.push(...[...h.matchAll(/href="(\/documentos\/[a-z0-9-]+)"/g)].map((m) => m[1]));
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

async function cliente(rutas: { procesos: string[]; documentos: string[] }, finMs: number) {
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
          const r2 = await fetch(base + pdf[1], { signal: AbortSignal.timeout(15000) });
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

function tipoDeRuta(ruta: string): string {
  if (ruta === "/") return "mapa";
  if (ruta.startsWith("/procesos/")) return "proceso";
  if (ruta.startsWith("/documentos/")) return "ficha";
  return "busqueda";
}

function percentil(valores: number[], p: number): number {
  const orden = [...valores].sort((a, b) => a - b);
  return orden[Math.min(orden.length - 1, Math.floor((p / 100) * orden.length))];
}

(async () => {
  console.log(`Carga: ${clientes} clientes × ${duracionS}s contra ${base}`);
  const rutas = await descubrirRutas();
  console.log(`Rutas: ${rutas.procesos.length} procesos, ${rutas.documentos.length} fichas`);
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
  console.log(`\nTotal: ${total} peticiones, ${errores} errores (${((errores / total) * 100).toFixed(1)}%)`);
  if (errores / total > 0.01) process.exitCode = 1;
})();
```

- [ ] **Step 2: Levantar el ensayo de nuevo y correr la carga**

```powershell
docker compose -f docker-compose.nas.yml -f docker-compose.ensayo.yml -p sgc-ensayo --env-file .env.ensayo up -d
npx tsx scripts/carga.ts http://127.0.0.1:9080 60 20
```

Y en una segunda terminal, 2–3 muestras durante la corrida:

```powershell
docker stats --no-stream sgc-app sgc-bd
```

Expected: 0–1% de errores; anotar p50/p95 y la RAM máxima observada (MEM USAGE de ambos sumada) en la sección de evidencia del plan. Localmente es **cota de referencia**; el criterio < 1.3 GB es del NAS (INSTALACION.md).

- [ ] **Step 3: Apagar el ensayo, lint y commit**

```powershell
docker compose -f docker-compose.nas.yml -f docker-compose.ensayo.yml -p sgc-ensayo --env-file .env.ensayo down
npm run lint
git add scripts/carga.ts docs/superpowers/plans/2026-08-24-fase10-despliegue-nas.md
git commit -F <msg>   # "feat: prueba de carga frugal con mezcla realista de rutas"
```

---

### Task 9: `INSTALACION.md`

**Files:**
- Create: `INSTALACION.md`

**Interfaces:**
- Consumes: todo lo anterior — los comandos que documenta son los YA probados en el ensayo (adaptando rutas de ensayo → rutas reales del NAS).

- [ ] **Step 1: Escribir el documento** con EXACTAMENTE estas secciones (spec Bloque G); cada comando copiable tal cual, sin pasos implícitos. Donde el ensayo usó rutas locales, aquí van las del NAS (`/share/sgc-documentos`, `/share/sgc-respaldos`):

1. **Qué pedir antes de empezar** — checklist para sistemas: acceso admin a QTS; Container Station instalado (App Center, sin internet: paquete QPKG local si hace falta); IP fija; carpetas compartidas `sgc-documentos` y `sgc-respaldos` (sin papelera de red); SSH habilitado; el paquete de archivos: `sgc-suaza-arm64-docker-<tag>.tar.gz`, `docker-compose.nas.yml`, `.env.nas.example`, carpeta `nas/`.
2. **Instalación inicial** — crear carpeta de trabajo (p. ej. `/share/Container/sgc`); copiar por SMB; `gunzip` + `docker load -i sgc-suaza-arm64.tar`; `cp .env.nas.example .env` y completar (`SGC_BD_CLAVE` aleatoria, `ADMIN_CLAVE` temporal); `docker compose -f docker-compose.nas.yml up -d`; verificar `docker logs sgc-app` (`[arranque] … Listo`), `http://IP:9080/api/salud` y el mapa; primer login; **retirar `ADMIN_CLAVE` del `.env`** y `docker compose -f docker-compose.nas.yml up -d` de nuevo.
3. **Acceso de los funcionarios** — `http://IP:9080` directo; opcional: reverse proxy de QTS (Panel de control → Servidores de aplicaciones → Proxy inverso) con `calidad.hospital.local` + certificado (autofirmado de QTS o de la CA del hospital) si el hospital tiene DNS interno apuntando al NAS.
4. **Respaldos** — copiar `nas/*.sh` a la carpeta de trabajo, `chmod +x`; probar a mano `./respaldo.sh`; crontab persistente de QTS: `echo "0 2 * * * /share/Container/sgc/respaldo.sh >> /share/sgc-respaldos/respaldo.log 2>&1" >> /etc/config/crontab && crontab /etc/config/crontab && /etc/init.d/crond.sh restart`; snapshots de `sgc-documentos` en Storage & Snapshots (diario, retener 30); HBS opcional a disco externo; cómo verificar que anoche respaldó (`ls -lh /share/sgc-respaldos | tail`).
5. **Actualización de versión** — descargar el artefacto nuevo del CI; `docker load`; editar `SGC_VERSION` en `.env` al tag nuevo (o dejar `latest`); `docker compose -f docker-compose.nas.yml up -d`; verificar salud. **Rollback**: `docker load` del tar anterior (si no está ya) + `SGC_VERSION` al tag anterior + `up -d`.
6. **Restauración ante desastre** — restaurar la carpeta `sgc-documentos` desde el snapshot; `./restaurar.sh /share/sgc-respaldos/sgc-<fecha>.dump`; verificaciones (las mismas del ensayo: conteos, login, descarga con marca).
7. **Reseteo de clave del admin** — en `.env`: `ADMIN_CLAVE=nueva` + `ADMIN_FORZAR_CLAVE=1` → `up -d` → verificar login → retirar ambas → `up -d`.
8. **Prueba de carga del día de instalación** — desde un PC de la LAN con Node 24: `npx tsx scripts/carga.ts http://IP:9080 60 20` mientras en el NAS corre `docker stats --no-stream sgc-app sgc-bd`; criterio: suma < 1.3 GB y errores < 1%. **Solución de problemas**: `sgc-app` reinicia en bucle → `docker logs sgc-app` y buscar `[arranque] FALLO`; salud 503 → BD (healthcheck, `docker logs sgc-bd`); puerto 9080 ocupado → cambiar el lado izquierdo del `ports` en el compose; documentos no descargan → permisos del bind mount (el contenedor corre como uid 1001: la carpeta compartida debe permitir lectura/escritura a "Everyone" o al uid — escritura la necesita el admin al subir).

- [ ] **Step 2: Releer "con ojos de sistemas"** — cada comando ejecutable tal cual; sin referencias a herramientas que el NAS no tiene; sin pasos que asuman al desarrollador presente.

- [ ] **Step 3: Commit**

```powershell
git add INSTALACION.md
git commit -F <msg>   # "docs: INSTALACION.md — despliegue, respaldos y operacion en el NAS"
```

---

### Task 10: Cierre de fase

**Files:**
- Modify: `CONTEXT.md`

- [ ] **Step 1: Suite completa, lint y build**

```powershell
npm test          # Expected: solo los 5 rojos preexistentes del seed
npm run lint
npm run build
```

- [ ] **Step 2: Actualizar `CONTEXT.md`** — nueva sección "Decisiones adicionales (Fase 10)" con F10-D1…F10-D8 copiadas del spec; bullet "Hecho (Fase 10)" en Estado actual (artefactos + evidencia del ensayo y la carga); reescribir el "Punto de reanudación": lo que sigue es el **día de instalación** cuando haya acceso al NAS (ejecutar INSTALACION.md, medir carga real, retirar ADMIN_CLAVE) + pendientes del usuario (convención de códigos, documentos reales, logo).

- [ ] **Step 3: Commit de cierre y push**

```powershell
git add CONTEXT.md
git commit -F <msg>   # "docs: cierre de la Fase 10 (paquete de despliegue NAS verificado en ensayo)"
git push origin main
```

- [ ] **Step 4: Verificar CI verde y el artefacto con doble tag** — con el token de `git credential fill` contra la API (no hay `gh`): estado del run del último push = `success`, y el artefacto se llama `sgc-suaza-arm64-docker-<AAAAMMDD>-<sha7>`.

- [ ] **Step 5: Decirle al usuario qué probar** — recorrido del ensayo (comandos del Task 7 Step 3–8 resumidos), dónde leer `INSTALACION.md`, y qué quedará para el día de instalación real.
