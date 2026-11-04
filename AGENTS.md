<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# SGC Integral — ESE Hospital Nuestra Señora de Fátima de Suaza

> **Variante ampliada de SGC Documental (`sgc-suaza`)**, bifurcada el 2026-11-03 desde
> el commit `9644ceb` (fin de su Fase 10). Hereda todas sus funcionalidades y estas
> reglas; aquí se construyen funcionalidades nuevas. La app original vive en `F:\sgc`
> (repo `juanfyru/sgc-suaza`) y **no se toca desde este proyecto**.

Portal de intranet para **control de documentos ISO 9001:2015 (numeral 7.5)**.
No es un repositorio de archivos: es una herramienta de control documental. El sistema
existe para hacer imposible el hallazgo de auditoría "documento desactualizado en
circulación".

Este archivo contiene las reglas **permanentes** del proyecto. Toda sesión futura debe
leerlo y respetarlo. El estado vivo del proyecto está en `CONTEXT.md`; el plan por fases
en `PLAN.md`; el diseño de la plataforma en
`docs/superpowers/specs/2026-11-03-sgc-integral-plataforma-design.md` (en adelante, "el
spec").

---

## Piso de despliegue (desde la Fase 11)

Sale del spec §4.1 y reemplaza las restricciones del QNAP TS-832PX heredadas de
`sgc-suaza` (ARM64 obligatorio, ~2 GB de RAM, solo dos contenedores, proxy de QTS). Los
archivos de despliegue heredados (`docker-compose.nas.yml`, `INSTALACION*.md`, `nas/`)
siguen en el repo como registro hasta que la Fase 20 los reemplace. No son negociables:

1. **Un servidor por entidad.** Una instalación es una entidad, sin multi-tenancy. En
   Suaza: Windows dentro del hospital, con posible exposición a internet (se diseña como
   si estuviera expuesta); otra entidad puede traer Linux. En Windows, Docker Engine
   dentro de WSL2, no Docker Desktop.
2. **Compose con tres contenedores:** `proxy` (Caddy, TLS), `app` (Next.js standalone) y
   `bd` (PostgreSQL 16). **Prohibido** añadir servicios (Redis, Elasticsearch,
   Meilisearch, Puppeteer/Chromium, colas) sin proponerlo antes.
3. **Imagen `linux/amd64` siempre y `linux/arm64` bajo demanda** (job manual del CI, por
   si otra entidad trae un NAS). Ninguna dependencia con binarios nativos sin prebuild
   para ambas arquitecturas.
4. **Volúmenes nombrados de Docker** para los datos (`bd_datos`, `almacen`, `respaldos`).
   **PostgreSQL nunca sobre NTFS, SMB/CIFS ni bind mounts de Windows** (se corrompe).
5. **El puerto de PostgreSQL nunca se expone al host.** `app` y `bd` viven solo en la red
   interna de Docker; el proxy publica 80 y 443 (configurables). Única excepción: el
   compose de desarrollo publica la BD en `127.0.0.1:5435` para `npm run dev`.
6. **Cero dependencias externas en runtime:** nada de CDNs, Google Fonts, íconos remotos
   ni telemetría. Fuentes e íconos van empaquetados en la imagen;
   `NEXT_TELEMETRY_DISABLED=1`. El servidor puede no tener salida y nada del uso interno
   debe salir del hospital.
7. **TLS siempre.** Con dominio público, certificado automático (ACME) en Caddy; solo
   intranet, el certificado de la autoridad interna o el que Caddy genera. HSTS cuando
   hay TLS.
8. **Zona horaria por instalación** (objetivo, **pendiente de cablear**): variable
   `ZONA_HORARIA`, por defecto `America/Bogota`; toda fecha de corte, periodo y resumen
   se calculará en esa zona y la BD guarda `timestamptz`. Hoy la variable no existe y
   cuatro archivos fijan `America/Bogota` (ver "Deuda técnica" en `CONTEXT.md`); el
   código nuevo no debe añadir más zonas fijas.
9. **Una sola instancia de app.** Los límites de ritmo viven en memoria. La IP del
   cliente se toma de `X-Forwarded-For` (último elemento) o `X-Real-IP` **solo con
   `CONFIAR_PROXY=1`** (el único camino de entrada es el proxy); sin la variable la IP es
   desconocida y esas cabeceras se ignoran.
10. **Dos conexiones de BD:** `DATABASE_URL_MIGRADOR` (dueño del esquema: migraciones,
    semillas y creación del rol de la app) y `DATABASE_URL` (rol `sgc_app`, solo DML,
    sin `UPDATE` ni `DELETE` en `auditoria` y `accesos`). `asegurarRolApp`
    (`src/db/roles-bd.ts`) crea el rol y aplica sus privilegios en cada arranque,
    después de las migraciones. Los secretos (`APP_SECRETO`, `BD_APP_CLAVE`) se generan
    al instalar; sin un `APP_SECRETO` válido el arranque de producción falla.
11. **Migraciones en el arranque y continuidad con `sgc-suaza`:** las migraciones corren
    al iniciar el contenedor (`arrancar.js`) y deben poder aplicarse sobre una base de
    `sgc-suaza`: nunca se renombra ni se borra una tabla o columna heredada, solo se
    añade o se deja de usar.

## Reglas de negocio INVIOLABLES (ISO 9001 — 7.5)

1. **Un documento tiene UNA sola versión vigente.** Publicar una versión nueva pasa la
   anterior a `obsoleto` automáticamente, **en la misma transacción**. Se refuerza con
   índice único parcial en BD (`WHERE estado = 'vigente'`), no solo en código.
2. **Las versiones obsoletas se retienen, nunca se borran.** El admin las ve marcadas con
   evidencia visual inequívoca (banda/watermark "OBSOLETO").
3. **Visibilidad por rol** (spec §5.3): vigentes para todo usuario con sesión; en trámite
   para participantes, Admin SGC y líder; obsoletos y anulados para Admin SGC, Control
   Interno y la marca individual `ver_historial`. Ninguna versión no vigente se sirve sin
   ese permiso.
4. **Toda ruta exige sesión; toda escritura exige el permiso de la matriz
   `src/lib/permisos.ts`** y pasa por `mutacion()` o `requerirPermiso()`; los handlers
   que escriben verifican `Origin`.
5. **Trazabilidad completa:** toda acción de cualquier usuario queda en bitácora,
   inmutable en BD, con quién, qué y cuándo. `auditoria` y `accesos` son de solo
   inserción (trigger que rechaza `UPDATE` y `DELETE` incluso al dueño del esquema, más
   los privilegios de `sgc_app`); los usuarios con historia se desactivan, nunca se
   borran.
6. **El MIME se detecta de los magic bytes en la carga** (no de la extensión del nombre)
   y se guarda en BD. El ícono de formato se deriva del MIME guardado.
7. **Archivos fuera del webroot**, servidos por la app con `Content-Type` y
   `Content-Disposition` correctos. Nombres saneados (path traversal). Nunca ejecutables.
8. **El mapa de procesos NO se hardcodea.** Vive en BD y se edita desde el admin. El
   render es 100% data-driven. Layout por bandas fijas (ver `PLAN.md` §Layout).

## Stack (decidido — no cambiar sin proponerlo antes)

| Capa | Elección | Notas |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript estricto, `output: 'standalone'` | Node 24 LTS en la imagen, CI y desarrollo (mismo major en los tres: npm 10 y 11 generan lockfiles incompatibles) |
| UI | Tailwind CSS + shadcn/ui | Íconos: `lucide-react` (local) |
| Animación | Motion (Framer Motion) | Respetar `prefers-reduced-motion` siempre |
| Mapa | SVG/HTML generado desde datos, layout por bandas con CSS grid | Sin lib de diagramas |
| BD | PostgreSQL 16 (`postgres:16-alpine`), roles `sgc_migrador` dueño y `sgc_app` de mínimo privilegio | Extensiones: `unaccent`, `pg_trgm`. `sgc_migrador` es el nombre del spec: hoy el dueño es el usuario de `POSTGRES_USER` (`sgc` en desarrollo) |
| ORM | **Drizzle** | TS puro, sin engine binario (evita el riesgo ARM de Prisma), SQL-first para FTS |
| Búsqueda | FTS nativo de Postgres: `to_tsvector('spanish', ...)` + `pg_trgm` + `unaccent` | Sin motores externos |
| Auth | Sesión propia (cookie httpOnly + `sesiones` + Argon2id) con cinco roles fijos en código, bloqueo por cuenta y TOTP opcional (`otpauth`); sin OAuth | Argon2id con `@node-rs/argon2`. Roles en `src/lib/roles.ts`; el segundo factor se vuelve obligatorio por rol con `EXIGIR_2FA_ROLES` |
| Validación | `zod` en la frontera de cada acción | Esquemas `.strict()` leídos con `parsearFormulario` (`src/lib/validacion.ts`) |
| Archivos | Filesystem en volumen nombrado (`almacen`) + metadatos en Postgres | Nunca BLOBs en BD |
| Detección MIME | `file-type` (magic bytes, JS puro) | |
| Export Excel | `exceljs` (JS puro) | Listado Maestro |
| Export PDF | Hoja de estilos de impresión (`window.print`) | Prohibido Puppeteer/Chromium en el servidor |
| Rate limiting | En memoria, en la app (instancia única), por usuario; por IP solo con proxy de confianza | Sin Redis |
| CI/CD | GitHub Actions: lint + build en cada push; imagen `amd64` (Fase 20) y `arm64` a mano | Repo en cuenta personal de GitHub (`juanfyru/sgc-integral`). El job `arm64` (GHCR + artefacto `.tar`) se lanza con Run workflow |

## Convenciones de código

- **Idioma:** dominio y UI en español (entidades, columnas, rutas, textos). Código
  (variables, funciones) en español consistente con el dominio: `documento`, `proceso`,
  `versionVigente`. Comentarios solo cuando el código no puede expresar la restricción.
- **TypeScript estricto** (`strict: true`). Sin `any` salvo justificación puntual.
- **Estructura:** App Router con el portal en `app/(portal)`, los pasos de la cuenta en
  `app/(cuenta)`, el ingreso en `app/ingreso` y el panel en `app/admin/(panel)`. Lógica
  de datos en `src/db` (schema Drizzle + queries), lógica de negocio en `src/lib`. Server
  Components por defecto; `'use client'` solo donde hay interactividad.
- **Migraciones versionadas con Drizzle Kit**, ejecutadas en el arranque del contenedor.
  Nunca `db push` contra producción. `src/db/esquema.ts` nunca importa con `@/`
  (drizzle-kit lo carga sin el alias): solo rutas relativas.
- **Toda página autenticada lleva o hereda de su layout `force-dynamic`** (`export const
  dynamic = "force-dynamic"`; lo declaran `src/app/layout.tsx` y los layouts de
  `(portal)`, `(cuenta)` y `admin/(panel)`): nunca se prerenderiza, y el build de CI no
  tiene `DATABASE_URL`.
- **Toda consulta de los módulos nuevos pasa por `alcanceProcesos()`**
  (`src/lib/alcance.ts`): el líder de proceso solo alcanza sus procesos activos; el
  filtro por rol no se reimplementa en cada módulo.
- **Accesibilidad no negociable:** navegable por teclado, foco visible, contraste AA,
  SVG del mapa con roles/etiquetas ARIA. El ícono de formato de archivo nunca es la
  única señal (siempre etiqueta textual + tamaño, `aria-label`).
- **Seguridad en cada PR que toque rutas:** verificar que ninguna ruta quede fuera del
  guard de sesión ni ninguna escritura fuera de su permiso. Cabeceras CSP,
  `X-Content-Type-Options`, `X-Frame-Options` en `next.config`/proxy. Reglas fijas:
  - **Cada página que lee la sesión llama ella misma** `exigirSesion()`,
    `exigirPermiso(permiso)` o `exigirSesionConPendientes()` (`src/lib/paginas.ts`). El
    layout no basta: en Next 16 no se vuelve a ejecutar en la navegación de cliente ni
    impide que la página entre en el payload RSC. El layout del panel usa además
    `exigirEntradaPanel()` (`panel.entrar` o la marca `ver_historial`). Lo exige
    `tests/paginas-sesion.test.ts`.
  - **Cada Server Action exportada** de `src/app/admin/acciones*.ts` pasa por
    `mutacion(formData, "<permiso>", fn)` o llama `requerirPermiso(sesion, permiso)`
    después de `requerirSesion()`. Las de `src/app/acciones-cuenta.ts` llaman
    `requerirSesion()` (directamente o por `sesionParaInscribir()`), con tres
    excepciones: `ingresar` no exige sesión (es el ingreso), y `verificarFactor` y
    `salir` usan `sesionActual()` porque deben admitir la sesión con el segundo factor
    pendiente, que `requerirSesion()` rechaza siempre. Lo exige
    `tests/acciones-permisos.test.ts`.
  - **Toda Server Action que cambia el estado de la sesión o de la cuenta y redirige**
    llama `revalidatePath("/", "layout")` antes del `redirect`: en producción la caché
    del enrutador del cliente reutiliza páginas precargadas (p. ej. `/` capturada antes
    de cambiar la clave) y el redirect entra en bucle. En `src/app/acciones-cuenta.ts`
    lo exige `tests/acciones-cuenta-cache.test.ts`.
  - **Los route handlers** usan `sesionDePeticion(peticion)` (rechaza sesiones con pasos
    pendientes) y `puede(sesion, permiso)`: 401 sin sesión, 403 sin permiso. Los que
    escriben verifican `Origin` con `origenValido()`.
  - **Los formularios que envían un `id` de ruta** se leen con
    `parsearFormulario(formData, Esquema, { omitir: ["id"] })` y el id con
    `idNumerico()`, porque los esquemas son estrictos.
  - **Todo CSV o Excel que genera la app neutraliza fórmulas** con
    `neutralizarFormula()` (`src/lib/celdas.ts`, regla D54).
  - Toda redirección con `volver` pasa por `rutaInterna()`. El matcher de
    `src/proxy.ts` escribe los puntos literales como `[.]` (Next no escapa el `.`, y
    `\.` coincide con cualquier carácter).
- **Tests contra la BD de desarrollo:** todo usuario de prueba que genere filas en
  `auditoria` o `accesos` usa un nombre único por corrida (`zz_<algo>_${Date.now()}`) y
  no se borra (FK `RESTRICT` y trigger de solo inserción). Nunca `DELETE` ni `UPDATE`
  sobre esas tablas en una limpieza.

## Comandos

```bash
npm run dev             # desarrollo local en :3002 (requiere Postgres: docker compose -f docker-compose.dev.yml up -d bd)
npm run build           # build de producción (standalone)
npm run lint            # ESLint + tsc --noEmit
npm test                # tests (Vitest)
npm run db:generate     # generar migración desde el schema Drizzle
npm run db:migrate      # aplicar migraciones (con DATABASE_URL_MIGRADOR)
npm run db:roles        # crear o sincronizar el rol sgc_app y sus privilegios
npm run db:preparar     # migraciones y luego rol de la app (db:migrate + db:roles)
npm run db:seed         # semilla demo: mapa real, documentos ficticios, estructura y usuarios por rol
npm run db:seed:minima  # semilla mínima de una instalación nueva (tipos de documento y configuración)
npm run admin:asegurar  # primer Admin SGC desde ADMIN_* (pide cambiar la clave al primer ingreso)
```

Las dos semillas vacían la base antes de sembrar. Build de imagen local (plataforma de
la máquina, sin `--platform` obligatorio):

```bash
docker build -t sgc-integral:local .
```

`arm64` sigue disponible con buildx:
`docker buildx build --platform linux/arm64 -t sgc-integral:local .`

## Estilo de commits

- Convencional y en español: `feat: mapa de procesos interactivo`, `fix: conteo de
  documentos en tarjetas`, `docs: actualizar CONTEXT.md al cierre de fase 3`.
- Un commit al cierre de cada fase como mínimo, con `CONTEXT.md` actualizado en ese
  mismo commit.
- Terminar los mensajes con: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## Metodología (vibe coding — reglas de todas las sesiones)

1. **Fases cortas que terminan en algo demostrable.** Si una fase no tiene demo, está mal
   cortada.
2. **Proponer antes de construir** toda decisión estructural (esquema, librerías,
   estrategias): opciones + trade-offs + recomendación. El usuario decide.
3. **No refactorizar lo que funciona sin avisar.** Preservar lo que sirve > elegancia.
4. **Decir cuándo algo pedido es mala idea.** Fricción temprana > fallar en auditoría.
5. **Verificación real antes de declarar terminado:** correr, ver el resultado, y solo
   entonces cerrar la fase.
6. Al cierre de cada fase: actualizar `CONTEXT.md`, commit descriptivo, y decir
   explícitamente al usuario **qué probar y cómo**.
7. Datos semilla realistas desde temprano (el mapa real validado, documentos ficticios
   verosímiles).
